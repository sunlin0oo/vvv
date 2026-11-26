"""
Video Watermark Removal Pipeline Template
Scene-adaptive watermark removal with:
- Same-shot Z-layer foreground occlusion gating (wm_template_hp correlation)
- Vertical split-screen seam detection & strict L/R isolation
- Strict 94%-band + 8%-perimeter 2D polynomial reconstruction with ~mask_stroke & dark-bow guards
- Multi-pass IRLS 2D quadratic surface fitting for smooth blurred gradients (grad_p96 < 25)
- Oriented structure-tensor coherence diffusion preserving sharp edges & internal gaps
- Motion-compensated temporal excess-flicker + edge/seam-break audit & lossless FFmpeg piping
"""

import cv2
import subprocess
import numpy as np


class WatermarkProcessor:
    def __init__(
        self,
        mask_path,
        trajectory_path,
        shadow_flat_path=None,
        shadow_stroke_path=None,
        wm_template_hp_path=None,
        pad=8,
    ):
        self.mask_tight = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if self.mask_tight is None:
            raise FileNotFoundError(f'Mask not found: {mask_path}')
        self.th, self.tw = self.mask_tight.shape
        self.pad = pad
        self.mh, self.mw = self.th + 2 * pad, self.tw + 2 * pad

        mt_pad = np.zeros((self.mh, self.mw), dtype=np.uint8)
        mt_pad[pad:pad + self.th, pad:pad + self.tw] = self.mask_tight
        self.k3 = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        self.tight_dil = cv2.dilate(mt_pad, self.k3, iterations=1)

        if shadow_flat_path:
            self.mask_flat = cv2.imread(shadow_flat_path, cv2.IMREAD_GRAYSCALE)
        else:
            self.mask_flat = cv2.dilate(mt_pad, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))

        if shadow_stroke_path:
            self.mask_stroke = cv2.imread(shadow_stroke_path, cv2.IMREAD_GRAYSCALE)
        else:
            self.mask_stroke = self.tight_dil.copy()

        self.wm_hp = np.load(wm_template_hp_path).astype(np.float32) if wm_template_hp_path else None
        self.wm_norm = float(np.linalg.norm(self.wm_hp)) if self.wm_hp is not None else 0.0
        self.trajectory = np.load(trajectory_path)

    def wm_corr_at(self, crop, ox, oy):
        """High-pass normalized correlation against extracted watermark template at (ox, oy)."""
        if self.wm_hp is None:
            return 1.0
        h, w = crop.shape[:2]
        y1, y2 = max(0, oy - 5), min(h, oy + self.th + 5)
        x1, x2 = max(0, ox - 5), min(w, ox + self.tw + 5)
        g = cv2.cvtColor(crop[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY).astype(np.float32)
        g_hp = g - cv2.GaussianBlur(g, (9, 9), 2.0)
        ly, lx = oy - y1, ox - x1
        p = g_hp[ly:ly + self.th, lx:lx + self.tw]
        if p.shape != self.wm_hp.shape:
            return 0.0
        return float(np.sum(p * self.wm_hp) / (np.linalg.norm(p) * self.wm_norm + 1e-6))

    def is_wm_occluded(self, crop, ox, oy, neighbor_crops=None, shot_cut_mad=22.0, min_corr=0.22):
        """Detect foreground Z-layer occlusion via same-shot temporal median correlation."""
        if self.wm_hp is None:
            return False
        cs = [self.wm_corr_at(crop, ox, oy)]
        if neighbor_crops:
            cur_f32 = crop.astype(np.float32)
            for n_crop, n_ox, n_oy in neighbor_crops:
                if n_ox < 0 or n_oy < 0:
                    continue
                if float(np.mean(np.abs(n_crop.astype(np.float32) - cur_f32))) <= shot_cut_mad:
                    cs.append(self.wm_corr_at(n_crop, n_ox, n_oy))
        return float(np.median(cs)) < min_corr

    @staticmethod
    def _irls_poly_fit(roi, valid_mask, seed, err_thresh=20.0, iters=2, min_inlier_frac=0.90, max_rstd=6.0, grain_scale=0.8):
        """Fit a 2D quadratic polynomial per channel with iterative outlier rejection and high-pass grain."""
        base_cnt = int(np.count_nonzero(valid_mask))
        if base_cnt < 60:
            return None
        rh, rw = roi.shape[:2]
        yy, xx = np.mgrid[0:rh, 0:rw]
        x_all = np.column_stack([
            np.ones(rh * rw), xx.ravel(), yy.ravel(),
            (xx ** 2).ravel(), (xx * yy).ravel(), (yy ** 2).ravel(),
        ])
        inl = valid_mask.copy()
        pred = None
        for _ in range(iters):
            cnt = int(np.count_nonzero(inl))
            if cnt < 60:
                return None
            x_feat = np.column_stack([
                np.ones(cnt), xx[inl], yy[inl],
                xx[inl] ** 2, xx[inl] * yy[inl], yy[inl] ** 2,
            ])
            pred = np.zeros_like(roi)
            for ch in range(3):
                coef, _, _, _ = np.linalg.lstsq(x_feat, roi[:, :, ch][inl], rcond=None)
                pred[:, :, ch] = (x_all @ coef).reshape(rh, rw)
            inl = valid_mask & (np.max(np.abs(roi - pred), axis=2) < err_thresh)

        if pred is None or np.count_nonzero(inl) < max(60, int(min_inlier_frac * base_cnt)):
            return None
        if float(np.max(np.std(roi[inl] - pred[inl], axis=0))) > max_rstd:
            return None

        hp = roi - cv2.GaussianBlur(roi, (5, 5), 1.0)
        grain_std = np.std(hp[inl], axis=0)
        np.random.seed(seed)
        noise = np.random.normal(0, np.clip(grain_std, 0.2, 2.0) * grain_scale, (rh, rw, 3))
        return np.clip(pred + noise, 0, 255)

    @staticmethod
    def detect_vertical_seam(crop, rx1, rx2):
        """Detect a hard vertical split-screen border crossing or bordering [rx1..rx2]."""
        w = crop.shape[1]
        px1, px2 = max(1, rx1 - 12), min(w - 1, rx2 + 12)
        if px2 <= px1 + 1:
            return None
        col_diff = np.mean(np.abs(np.diff(crop[:, px1:px2].astype(np.float32), axis=1)), axis=(0, 2))
        if len(col_diff) == 0 or float(col_diff.max()) < 20.0:
            return None
        cand_x = px1 + int(np.argmax(col_diff)) + 1
        edge_frac = float((np.mean(np.abs(crop[:, cand_x].astype(np.float32) - crop[:, cand_x - 1].astype(np.float32)), axis=1) > 15.0).mean())
        return cand_x if edge_frac > 0.35 else None

    @staticmethod
    def structure_tensor_diffusion_side(cur_bgr, fill_mask, rx1, ry1, rx2, ry2, seam_x=None, iters=70):
        """Vectorized oriented structure-tensor coherence diffusion bounded strictly by vertical split seams."""
        h_f, w_f = cur_bgr.shape[:2]
        out = cur_bgr.copy()
        ex1, ey1 = max(0, rx1 - 24), max(0, ry1 - 24)
        ex2, ey2 = min(w_f, rx2 + 24), min(h_f, ry2 + 24)
        work = out[ey1:ey2, ex1:ex2].astype(np.float32)
        fill_m = fill_mask[ey1:ey2, ex1:ex2].copy()
        if not np.any(fill_m):
            return out

        rel_seam = (seam_x - ex1) if (seam_x is not None and ex1 < seam_x < ex2) else None
        sides = [(0, rel_seam), (rel_seam, ex2 - ex1)] if rel_seam is not None else [(0, ex2 - ex1)]
        nbrs = [
            (-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1),
            (-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1),
            (0, -2), (0, 2), (-2, 0), (2, 0),
        ]

        for sx1, sx2 in sides:
            if sx2 - sx1 < 3:
                continue
            sf = fill_m[:, sx1:sx2]
            if not np.any(sf):
                continue
            sw = work[:, sx1:sx2]
            h_s, w_s = sf.shape
            ns_u8 = cv2.inpaint(np.clip(sw, 0, 255).astype(np.uint8), sf.astype(np.uint8) * 255, 2, cv2.INPAINT_NS).astype(np.float32)
            cur = sw.copy()
            cur[sf] = ns_u8[sf]

            known_eroded = cv2.erode((~sf).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            gray = cv2.cvtColor(np.clip(cur, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
            gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
            gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
            kw = known_eroded.astype(np.float32)
            Jxx = cv2.GaussianBlur((gx * gx) * kw, (15, 15), 4.0)
            Jxy = cv2.GaussianBlur((gx * gy) * kw, (15, 15), 4.0)
            Jyy = cv2.GaussianBlur((gy * gy) * kw, (15, 15), 4.0)
            wsum = np.maximum(cv2.GaussianBlur(kw, (15, 15), 4.0), 1e-4)
            Jxx /= wsum
            Jxy /= wsum
            Jyy /= wsum

            diff_j = Jxx - Jyy
            disc = np.sqrt(diff_j * diff_j + 4.0 * Jxy * Jxy)
            lam1 = 0.5 * (Jxx + Jyy + disc)
            lam2 = 0.5 * (Jxx + Jyy - disc)
            coherency = np.clip((lam1 - lam2) / (lam1 + lam2 + 25.0), 0.0, 1.0)
            grad_ang = 0.5 * np.arctan2(2.0 * Jxy, diff_j)
            tx, ty = -np.sin(grad_ang), np.cos(grad_ang)

            pad = 2
            w_stack = []
            norm_w = np.zeros((h_s, w_s), dtype=np.float32)
            for dy, dx in nbrs:
                dist = float(np.hypot(dx, dy))
                ux, uy = dx / dist, dy / dist
                dot = np.abs(ux * tx + uy * ty)
                perp = np.sqrt(np.maximum(0.0, 1.0 - dot * dot))
                sig_p = 0.12 + 0.88 * (1.0 - coherency)
                w_dir = np.exp(-0.5 * (perp / sig_p) ** 2) / (dist ** 1.3)
                w_stack.append((dy, dx, w_dir))
                norm_w += w_dir
            norm_w = np.maximum(norm_w, 1e-6)
            w_norm = [(dy, dx, w / norm_w) for dy, dx, w in w_stack]

            for _ in range(iters):
                cp = cv2.copyMakeBorder(cur, pad, pad, pad, pad, cv2.BORDER_REFLECT)
                acc = np.zeros_like(cur)
                for dy, dx, wn in w_norm:
                    acc += wn[:, :, None] * cp[pad + dy:pad + dy + h_s, pad + dx:pad + dx + w_s]
                cur[sf] = acc[sf]
            sw[sf] = cur[sf]
            work[:, sx1:sx2] = sw

        out[ey1:ey2, ex1:ex2] = np.clip(work, 0, 255).astype(np.uint8)
        return out

    def inpaint_flat_background(self, crop, ox, oy, seed=0, max_resid=6.0):
        """Reconstruct flat or smooth gradient backgrounds without crossing split seams or dark features."""
        h, w = crop.shape[:2]
        x0, y0 = ox - self.pad, oy - self.pad
        rx1, ry1 = max(0, x0), max(0, y0)
        rx2, ry2 = min(w, x0 + self.mw), min(h, y0 + self.mh)
        mx1, my1 = rx1 - x0, ry1 - y0
        mx2, my2 = mx1 + (rx2 - rx1), my1 + (ry2 - ry1)

        if self.detect_vertical_seam(crop, rx1, rx2) is not None:
            return None

        roi = crop[ry1:ry2, rx1:rx2].astype(np.float32)
        m_flat = self.mask_flat[my1:my2, mx1:mx2] > 0
        m_stroke = self.mask_stroke[my1:my2, mx1:mx2] > 0

        ring_vals = roi[~m_flat]
        if len(ring_vals) < 60:
            return None
        med = np.median(ring_vals, axis=0)
        inliers = (~m_flat) & (np.max(np.abs(roi - med), axis=2) < 18.0)

        perim = (cv2.dilate(m_flat.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0) & (~m_flat)
        perim_out = int(np.count_nonzero(np.max(np.abs(roi - med), axis=2)[perim] > 22.0))
        filled = None
        ep_thresh = 55.0

        if (
            np.count_nonzero(inliers) >= max(65, int(0.94 * np.count_nonzero(~m_flat)))
            and perim_out <= int(0.08 * np.count_nonzero(perim))
        ):
            filled = self._irls_poly_fit(roi, inliers, seed, err_thresh=18.0, iters=1, min_inlier_frac=0.90, max_rstd=max_resid)
        else:
            ring_g = cv2.cvtColor(crop[ry1:ry2, rx1:rx2], cv2.COLOR_BGR2GRAY).astype(np.float32)
            lap_ring = float(np.std(cv2.Laplacian(ring_g, cv2.CV_32F)[~m_flat]))
            grad_ring = np.hypot(cv2.Sobel(ring_g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(ring_g, cv2.CV_32F, 0, 1, ksize=3))
            grad_p96 = float(np.percentile(grad_ring[~m_flat], 96)) if np.any(~m_flat) else 0.0
            if lap_ring < 20.0 and grad_p96 < 25.0 and perim_out <= int(0.06 * max(1, np.count_nonzero(perim))):
                filled = self._irls_poly_fit(roi, ~m_flat, seed, err_thresh=16.0, iters=3, min_inlier_frac=0.88, max_rstd=4.5, grain_scale=0.7)
                ep_thresh = 32.0

        if filled is None:
            return None

        alpha = cv2.GaussianBlur(m_flat.astype(np.float32), (5, 5), 1.0)
        ref = med if ep_thresh == 55.0 else filled
        edge_protect = (np.max(np.abs(roi - ref), axis=2) > ep_thresh) & (~m_stroke)
        if 0 < np.count_nonzero(edge_protect & m_flat) < 12:
            edge_protect = np.zeros_like(edge_protect)
        alpha[edge_protect] = 0.0
        alpha = alpha[:, :, None]

        out = crop.copy()
        out[ry1:ry2, rx1:rx2] = np.clip(roi * (1.0 - alpha) + filled * alpha, 0, 255).astype(np.uint8)
        return out

    def inpaint_complex_texture(self, crop, ox, oy, prev_repaired=None, seed=0):
        """Split-isolated oriented structure-tensor coherence diffusion with gradient-gated stroke mask protection."""
        h, w = crop.shape[:2]
        x0, y0 = ox - self.pad, oy - self.pad
        rx1, ry1 = max(0, x0), max(0, y0)
        rx2, ry2 = min(w, x0 + self.mw), min(h, y0 + self.mh)
        mx1, my1 = rx1 - x0, ry1 - y0
        mx2, my2 = mx1 + (rx2 - rx1), my1 + (ry2 - ry1)

        seam_x = self.detect_vertical_seam(crop, rx1, rx2)
        m_flat = self.mask_flat[my1:my2, mx1:mx2] > 0
        m_tight = np.zeros_like(m_flat)
        cy0, cx0 = max(0, oy - ry1), max(0, ox - rx1)
        cy1, cx1 = min(ry2 - ry1, cy0 + self.th), min(rx2 - rx1, cx0 + self.tw)
        if cy1 > cy0 and cx1 > cx0:
            m_tight[cy0:cy1, cx0:cx1] = self.mask_tight[(cy0 + ry1 - oy):(cy1 + ry1 - oy), (cx0 + rx1 - ox):(cx1 + rx1 - ox)] > 127

        ring_g = cv2.cvtColor(crop[ry1:ry2, rx1:rx2], cv2.COLOR_BGR2GRAY).astype(np.float32)
        grad_ring = np.hypot(cv2.Sobel(ring_g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(ring_g, cv2.CV_32F, 0, 1, ksize=3))
        grad_p95 = float(np.percentile(grad_ring[~m_flat], 95)) if np.any(~m_flat) else 0.0

        use_mask = m_tight if grad_p95 >= 22.0 else m_flat
        full_m = np.zeros((h, w), dtype=bool)
        full_m[ry1:ry2, rx1:rx2] = use_mask
        return self.structure_tensor_diffusion_side(crop, full_m, rx1, ry1, rx2, ry2, seam_x=seam_x, iters=70)

    def process_frame(self, crop, frame_idx, neighbor_crops=None, prev_repaired=None):
        ox, oy = int(self.trajectory[frame_idx][0]), int(self.trajectory[frame_idx][1])
        if ox < 0 or oy < 0:
            return crop

        h, w = crop.shape[:2]
        ox = max(0, min(w - self.tw, ox))
        oy = max(0, min(h - self.th, oy))

        if self.is_wm_occluded(crop, ox, oy, neighbor_crops=neighbor_crops):
            return crop

        flat_out = self.inpaint_flat_background(crop, ox, oy, seed=frame_idx)
        if flat_out is not None:
            return flat_out
        return self.inpaint_complex_texture(crop, ox, oy, prev_repaired=prev_repaired, seed=frame_idx)


def compute_excess_temporal_flicker(cur_p, prev_p, cur_o, prev_o, ox, oy, mask_flat, pad=8):
    """Measure inter-frame artifact flicker inside mask_flat relative to natural original motion."""
    mh, mw = mask_flat.shape
    h, w = cur_p.shape[:2]
    x0, y0 = ox - pad, oy - pad
    rx1, ry1 = max(0, x0), max(0, y0)
    rx2, ry2 = min(w, x0 + mw), min(h, y0 + mh)
    m_f = mask_flat[ry1 - y0:ry2 - y0, rx1 - x0:rx2 - x0] > 0

    def _pair_diff(cur, prev):
        ax1, ay1 = max(0, rx1 - 20), max(0, ry1 - 20)
        ax2, ay2 = min(w, rx2 + 20), min(h, ry2 + 20)
        sx1, sy1 = max(0, ax1 - 16), max(0, ay1 - 16)
        sx2, sy2 = min(w, ax2 + 16), min(h, ay2 + 16)
        tm = np.ones((ay2 - ay1, ax2 - ax1), dtype=np.uint8)
        tm[ry1 - ay1:ry2 - ay1, rx1 - ax1:rx2 - ax1] = (~m_f).astype(np.uint8)
        _, _, ml, _ = cv2.minMaxLoc(
            cv2.matchTemplate(cv2.cvtColor(prev[sy1:sy2, sx1:sx2], cv2.COLOR_BGR2GRAY),
                              cv2.cvtColor(cur[ay1:ay2, ax1:ax2], cv2.COLOR_BGR2GRAY),
                              cv2.TM_SQDIFF_NORMED, mask=tm)
        )
        dx, dy = (sx1 + ml[0]) - ax1, (sy1 + ml[1]) - ay1
        wp = cv2.warpAffine(prev, np.float32([[1, 0, -dx], [0, 1, -dy]]), (w, h),
                            flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        d = np.mean(np.abs(cur[ry1:ry2, rx1:rx2].astype(np.float32) - wp[ry1:ry2, rx1:rx2].astype(np.float32)), axis=2)
        return float(np.mean(d[m_f])), float(np.mean(d[~m_f])), float(np.percentile(d[m_f], 95))

    p_in, p_out, p_95 = _pair_diff(cur_p, prev_p)
    o_in, o_out, o_95 = _pair_diff(cur_o, prev_o)
    return max(0.0, (p_in - p_out) - max(0.0, o_in - o_out)) + 0.15 * max(0.0, p_95 - max(o_95, 10.0))


def compute_edge_seam_break(bgr_p, ox, oy, mask_flat, pad=8):
    """Detect localized directional p92 sharpness drop and vertical split-screen column notch breaks."""
    mh, mw = mask_flat.shape
    h, w = bgr_p.shape[:2]
    x0, y0 = ox - pad, oy - pad
    rx1, ry1 = max(0, x0), max(0, y0)
    rx2, ry2 = min(w, x0 + mw), min(h, y0 + mh)
    m_f = mask_flat[ry1 - y0:ry2 - y0, rx1 - x0:rx2 - x0] > 0
    roi_g = cv2.cvtColor(bgr_p[ry1:ry2, rx1:rx2], cv2.COLOR_BGR2GRAY).astype(np.float32)
    grad = np.hypot(cv2.Sobel(roi_g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(roi_g, cv2.CV_32F, 0, 1, ksize=3)) / 8.0
    g_ring = float(np.percentile(grad[~m_f], 92)) if np.any(~m_f) else 0.0
    g_in = float(np.percentile(grad[m_f], 92)) if np.any(m_f) else 0.0
    dir_drop = max(0.0, g_ring - g_in) if g_ring >= 4.0 else 0.0

    seam_break = 0.0
    px1, px2 = max(1, rx1 - 4), min(w - 1, rx2 + 4)
    col_diff = np.mean(np.abs(np.diff(bgr_p[:, px1:px2].astype(np.float32), axis=1)), axis=(0, 2))
    if len(col_diff) > 0 and float(col_diff.max()) > 16.0:
        cx = px1 + int(np.argmax(col_diff))
        full_step = np.mean(np.abs(bgr_p[:, cx + 1].astype(np.float32) - bgr_p[:, cx].astype(np.float32)), axis=1)
        out_rows = np.ones(h, dtype=bool)
        out_rows[ry1:ry2] = False
        if (full_step[out_rows] > 15.0).mean() > 0.35 and rx1 <= cx < rx2:
            seam_break = max(0.0, float(np.median(full_step[out_rows])) - float(np.min(full_step[ry1:ry2])))
    return max(dir_drop, seam_break)


def open_ffmpeg_h264_pipe(width, height, fps, orig_video, output_video, start_time_sec=0.0):
    """Open a lossless rawvideo stdin pipe to FFmpeg so intermediate mp4v macroblocking is avoided."""
    cmd = ['ffmpeg', '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-s', f'{width}x{height}',
           '-pix_fmt', 'bgr24', '-r', str(fps), '-i', '-']
    if start_time_sec > 0.0:
        cmd.extend(['-ss', str(start_time_sec)])
    cmd.extend([
        '-i', orig_video,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'libx264', '-crf', '17', '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-shortest',
        output_video,
    ])
    return subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
