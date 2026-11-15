import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Text } from "../../components/Text";
import { coverStyle } from "../../core/crop";
import { clamp01, eBack, eIo3, eOut3, eSine, ramp } from "../../core/ease";
import { getPhoto } from "../../core/manifest";
import { useT } from "../../core/time";

export const WHITE = "#FFFFFF";
export const PINK = "#EB5E8E";
export const YELLOW = "#F5C538";
export const GREY = "rgba(255,255,255,0.72)";

export type Ctx = {
  B: (n: number) => number;
  ph: Record<string, string | string[]>;
  copy: Record<string, string>;
  groom: string;
  bride: string;
  date: string;
};

export type PageProps = { c: Ctx; at: number; len: number };

const resolveSrc = (id: string, fallback?: string): string => {
  if (!id) return fallback ? staticFile(fallback) : "";
  try {
    const p = getPhoto(id);
    if (p && p.file) return staticFile(p.file);
  } catch {
    // fallback to direct static path
  }
  if (id.includes("/") || id.endsWith(".png") || id.endsWith(".jpg") || id.endsWith(".jpeg")) {
    return staticFile(id);
  }
  return fallback ? staticFile(fallback) : "";
};

const listOf = (c: Ctx, slot: string, fallbackSlot?: string) => {
  let v = c.ph[slot];
  if (!v && fallbackSlot) v = c.ph[fallbackSlot];
  const list = (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
  return list.length > 0 ? list : [];
};

/** Smooth handwriting wipe helper: returns 0 before start, 0->1 during dur, 1 after. */
const wipeAt = (t: number, start: number, dur = 0.6): number => clamp01((t - start) / dur);

/** Hand-drawn cartoon marker typography: bold marker stroke weight for CJK and solid rounded numerals for digits. */
const CartoonText: React.FC<Omit<React.ComponentProps<typeof Text>, "font"> & { font?: React.ComponentProps<typeof Text>["font"] }> = ({
  children,
  font = "kuaile",
  size,
  color = WHITE,
  wipe,
  wipeDir = "lr",
  opacity = 1,
  maxWidth,
  style,
  ...rest
}) => {
  const ring = Math.max(0.9, size * 0.016).toFixed(2);
  const strokePx = Math.max(0.8, size * 0.015).toFixed(2);
  const softShadow =
    color === PINK
      ? "rgba(235,94,142,0.42)"
      : color === YELLOW || color === "#DFBD5B"
        ? "rgba(245,197,56,0.36)"
        : color === "#F7EEB2"
          ? "rgba(247,238,178,0.32)"
          : "rgba(255,255,255,0.34)";
  const cartoonShadow = `${ring}px 0 0 currentColor, -${ring}px 0 0 currentColor, 0 ${ring}px 0 currentColor, 0 -${ring}px 0 currentColor, 2.5px 2.5px 0 ${softShadow}`;

  const waitingWipe = wipe !== undefined && wipe <= 0;
  const safeWipe = wipe === undefined ? undefined : waitingWipe ? 0.001 : wipe;

  const glyphStyle: React.CSSProperties = {
    WebkitTextStroke: `${strokePx}px currentColor`,
    paintOrder: "stroke fill",
    textShadow: cartoonShadow,
    visibility: waitingWipe ? "hidden" : undefined,
    ...style,
  };

  if (!/\d/.test(children) || maxWidth !== undefined) {
    return (
      <Text
        {...rest}
        font={font}
        size={size}
        color={color}
        maxWidth={maxWidth}
        wipe={safeWipe}
        wipeDir={wipeDir}
        opacity={opacity}
        style={glyphStyle}
      >
        {children}
      </Text>
    );
  }

  // Replace ZCOOLKuaiLe's hollow outline digits with solid bold NotoSansSC numerals styled to match.
  const parts = children.split(/(\d+)/).filter(Boolean);
  const maskStyle = safeWipe !== undefined && safeWipe < 1 ? wipeMaskStyle(safeWipe, wipeDir, 0.25) : undefined;
  return (
    <div style={{ display: "inline-flex", alignItems: "baseline", opacity, visibility: waitingWipe ? "hidden" : undefined, ...maskStyle }}>
      {parts.map((part, idx) => {
        const isNum = /^\d+$/.test(part);
        return (
          <Text
            key={idx}
            {...rest}
            font={isNum ? "heiti" : font}
            weight={isNum ? 800 : 400}
            size={isNum ? Math.round(size * 0.95) : size}
            color={color}
            style={{
              ...glyphStyle,
              ...(isNum
                ? {
                    WebkitTextStroke: `${Math.max(0.8, size * 0.014).toFixed(2)}px currentColor`,
                    letterSpacing: 1.5,
                    marginRight: idx < parts.length - 1 ? 3 : 0,
                  }
                : null),
            }}
          >
            {part}
          </Text>
        );
      })}
    </div>
  );
};

/** Text wipe wrapper that preserves layout box before wipe begins so earlier lines never shift. */
const StayWipeText: React.FC<Omit<React.ComponentProps<typeof Text>, "font"> & { font?: React.ComponentProps<typeof Text>["font"]; wipe: number }> = (props) => (
  <CartoonText {...props} />
);

/** Page exit fade over the final 0.18s of the page. */
const pageExit = (t: number, c: Ctx, at: number, len: number) =>
  1 - eSine(ramp(t, c.B(at + len) - 0.18, c.B(at + len)));

/** Subtle deterministic handheld jitter for photos and doodles. */
const jitterOf = (t: number, seed = 0, amp = 2.6, rotAmp = 0.65) => ({
  x: Math.sin(t * 4.3 + seed * 1.9) * amp + Math.cos(t * 6.7 + seed) * (amp * 0.35),
  y: Math.cos(t * 3.9 + seed * 2.5) * amp + Math.sin(t * 5.8 + seed) * (amp * 0.35),
  rot: Math.sin(t * 3.4 + seed * 1.3) * rotAmp,
});

/** Soft 4-edge CSS alpha feather mask so photos melt into the pure black canvas without hard edges. */
const featherMaskStyle = (featherPx = 38): React.CSSProperties => {
  const mask = [
    `linear-gradient(to right, transparent 0px, #000 ${featherPx}px, #000 calc(100% - ${featherPx}px), transparent 100%)`,
    `linear-gradient(to bottom, transparent 0px, #000 ${featherPx}px, #000 calc(100% - ${featherPx}px), transparent 100%)`,
  ].join(", ");
  return {
    WebkitMaskImage: mask,
    WebkitMaskComposite: "source-in",
    maskImage: mask,
    maskComposite: "intersect",
  };
};

/** Directional wipe-in mask (0->1) for photo reveal effects. */
const wipeMaskStyle = (p: number, dir: "lr" | "rl" | "tb" | "bt" = "lr", soft = 0.22): React.CSSProperties | undefined => {
  if (p >= 1) return undefined;
  const to = { lr: "to right", rl: "to left", tb: "to bottom", bt: "to top" }[dir];
  const solid = (p * (1 + soft) - soft) * 100;
  const clear = p * (1 + soft) * 100;
  const mask = `linear-gradient(${to}, #000 ${solid}%, transparent ${clear}%)`;
  return { WebkitMaskImage: mask, maskImage: mask };
};

type Box = { x: number; y: number; w: number; h: number };

/** Standard photo card with cover crop and optional jitter/border. */
const Pic: React.FC<{
  id: string;
  box: Box;
  zoom?: number;
  opacity?: number;
  radius?: number;
  border?: string;
  fallback?: string;
  jitter?: { t: number; seed?: number; amp?: number; rotAmp?: number };
  rot?: number;
  scale?: number;
  style?: React.CSSProperties;
}> = ({ id, box, zoom = 1, opacity = 1, radius = 24, border, fallback, jitter, rot = 0, scale = 1, style }) => {
  if (opacity <= 0.002) return null;
  const src = resolveSrc(id, fallback);
  if (!src) return null;

  let fitStyle: React.CSSProperties = { objectFit: "cover", objectPosition: "center" };
  try {
    const manifest = getPhoto(id);
    if (manifest) fitStyle = coverStyle(manifest, box.w, box.h);
  } catch {
    // fallback
  }

  const j = jitter ? jitterOf(jitter.t, jitter.seed ?? 0, jitter.amp ?? 2.4, jitter.rotAmp ?? 0.6) : { x: 0, y: 0, rot: 0 };
  const tf = `translate(${j.x.toFixed(2)}px, ${j.y.toFixed(2)}px) rotate(${(rot + j.rot).toFixed(2)}deg) scale(${scale})`;

  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        overflow: "hidden",
        borderRadius: radius,
        border: border ?? "none",
        opacity,
        transform: tf,
        boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
        ...style,
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          ...fitStyle,
          transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        }}
      />
    </div>
  );
};

/** Soft-feathered photo without hard borders, melting into the black canvas with optional jitter and wipe. */
const FeatheredPic: React.FC<{
  id: string;
  box: Box;
  zoom?: number;
  opacity?: number;
  radius?: number;
  feather?: number;
  fallback?: string;
  jitter?: { t: number; seed?: number; amp?: number; rotAmp?: number };
  wipe?: number;
  wipeDir?: "lr" | "tb";
  rot?: number;
  scale?: number;
  spotlight?: boolean;
}> = ({
  id,
  box,
  zoom = 1,
  opacity = 1,
  radius = 36,
  feather = 36,
  fallback,
  jitter,
  wipe,
  wipeDir = "lr",
  rot = 0,
  scale = 1,
  spotlight = false,
}) => {
  if (opacity <= 0.002) return null;
  if (wipe !== undefined && wipe <= 0.002) return null;
  const src = resolveSrc(id, fallback);
  if (!src) return null;

  let fitStyle: React.CSSProperties = { objectFit: "cover", objectPosition: "center" };
  try {
    const manifest = getPhoto(id);
    if (manifest) fitStyle = coverStyle(manifest, box.w, box.h);
  } catch {
    // fallback
  }

  const j = jitter ? jitterOf(jitter.t, jitter.seed ?? 0, jitter.amp ?? 2.6, jitter.rotAmp ?? 0.65) : { x: 0, y: 0, rot: 0 };
  const tf = `translate(${j.x.toFixed(2)}px, ${j.y.toFixed(2)}px) rotate(${(rot + j.rot).toFixed(2)}deg) scale(${scale})`;

  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        opacity,
        transform: tf,
        ...(wipe !== undefined ? wipeMaskStyle(wipe, wipeDir) : undefined),
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          borderRadius: radius,
          ...featherMaskStyle(feather),
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            ...fitStyle,
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
          }}
        />
        {spotlight && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 68% 60% at 50% 46%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 56%, rgba(0,0,0,0.62) 86%, rgba(0,0,0,0.92) 100%)",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            boxShadow: "inset 0 0 28px 16px rgba(0,0,0,0.72), inset 0 0 56px 26px rgba(0,0,0,0.45)",
          }}
        />
      </div>
    </div>
  );
};

/** Die-cut sticker with optional white contour outline and transform origin control. */
const Sticker: React.FC<{
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity?: number;
  scale?: number;
  rot?: number;
  border?: boolean;
  fallback?: string;
  origin?: string;
  align?: "flex-start" | "center" | "flex-end";
}> = ({ id, x, y, w, h, opacity = 1, scale = 1, rot = 0, border = true, fallback, origin = "50% 85%", align = "flex-end" }) => {
  if (opacity <= 0.002 || scale <= 0.002) return null;
  const src = resolveSrc(id, fallback);
  if (!src) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        opacity,
        transform: `rotate(${rot}deg) scale(${scale})`,
        transformOrigin: origin,
        display: "flex",
        alignItems: align,
        justifyContent: "center",
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: border
            ? "drop-shadow(3px 0 0 #fff) drop-shadow(-3px 0 0 #fff) drop-shadow(0 3px 0 #fff) drop-shadow(0 -3px 0 #fff) drop-shadow(2px 2px 0 #fff) drop-shadow(-2px -2px 0 #fff) drop-shadow(2px -2px 0 #fff) drop-shadow(-2px 2px 0 #fff) drop-shadow(0 10px 22px rgba(0,0,0,0.55))"
            : "drop-shadow(0 8px 20px rgba(0,0,0,0.6))",
        }}
      />
    </div>
  );
};

/** Vertical filmstrip reel transition between discrete slide indices. */
const FilmstripStage: React.FC<{
  t: number;
  switchTimes: number[];
  transDur?: number;
  stepPx?: number;
  box: Box;
  renderSlide: (idx: number) => React.ReactNode;
}> = ({ t, switchTimes, transDur = 0.44, stepPx = 940, box, renderSlide }) => {
  const half = transDur / 2;
  let active = 0;
  for (let i = 0; i < switchTimes.length; i++) {
    if (t >= switchTimes[i] - half) active = i;
  }
  const hasNext = active < switchTimes.length;
  const sw = hasNext ? switchTimes[active] : Infinity;
  const inTrans = hasNext && t >= sw - half && t < sw + half;
  const p = inTrans ? eIo3(ramp(t, sw - half, sw + half)) : 0;
  const curIdx = !inTrans && hasNext && t >= sw + half ? active + 1 : active;

  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, overflow: "hidden" }}>
      {inTrans ? (
        <>
          <div style={{ position: "absolute", inset: 0, transform: `translateY(${-p * stepPx}px)` }}>
            {renderSlide(active)}
          </div>
          <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - p) * stepPx}px)` }}>
            {renderSlide(active + 1)}
          </div>
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0 }}>{renderSlide(curIdx)}</div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Crisp Hand-Drawn SVG Doodles
const SunDoodle: React.FC<{ size?: number; rot?: number; opacity?: number }> = ({ size = 128, rot = 0, opacity = 1 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    style={{ transform: `rotate(${rot}deg)`, opacity, flexShrink: 0 }}
  >
    {/* Hand-drawn cartoon spiral swirl center */}
    <path
      d="M50 50 C50 45 55 44 56 49 C57 55 49 58 44 55 C38 51 39 41 46 37 C55 32 65 39 66 50 C67 62 56 70 44 68 C33 66 28 54 31 42"
      fill="none"
      stroke="#F5F0E4"
      strokeWidth="6.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((deg) => (
      <line
        key={deg}
        x1="50"
        y1="10"
        x2="50"
        y2="21"
        stroke="#F5F0E4"
        strokeWidth="6.2"
        strokeLinecap="round"
        transform={`rotate(${deg} 50 50)`}
      />
    ))}
  </svg>
);

const SproutDoodle: React.FC<{ size?: number; rot?: number; opacity?: number }> = ({ size = 128, rot = 0, opacity = 1 }) => (
  <svg width={size} height={size * 1.1} viewBox="0 0 110 120" style={{ transform: `rotate(${rot}deg)`, opacity }}>
    {/* Upper bigger green sprout */}
    <g transform="translate(8, 2) rotate(-6 45 45)">
      <path d="M50 56 C49 43 49 34 51 28" fill="none" stroke="#8CE05A" strokeWidth="5.5" strokeLinecap="round" />
      <path
        d="M49 34 C34 32 18 22 20 10 C35 10 47 21 49 34 Z"
        fill="#8CE05A"
        stroke="#B4F48C"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M52 29 C58 14 76 7 89 14 C85 27 70 34 52 29 Z"
        fill="#7AD348"
        stroke="#B4F48C"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </g>
    {/* Lower smaller green sprout */}
    <g transform="translate(2, 54) scale(0.76) rotate(8 45 45)">
      <path d="M50 58 C49 44 49 35 51 28" fill="none" stroke="#8CE05A" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M49 34 C33 32 18 22 20 10 C35 10 47 21 49 34 Z"
        fill="#8CE05A"
        stroke="#B4F48C"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M52 29 C58 14 76 7 89 14 C85 27 70 34 52 29 Z"
        fill="#7AD348"
        stroke="#B4F48C"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

const MusicNotesDoodle: React.FC<{ size?: number; x?: number; y?: number; rot?: number; opacity?: number }> = ({
  size = 155,
  x = 0,
  y = 0,
  rot = 0,
  opacity = 1,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    style={{ transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`, opacity }}
  >
    {/* Cluster of 6 hand-drawn solid white music notes (♫ and ♪) matching concert scene */}
    <g fill={WHITE} stroke={WHITE} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
      {/* Upper-left single eighth note */}
      <ellipse cx="22" cy="52" rx="6.5" ry="4.5" transform="rotate(-22 22 52)" />
      <path d="M27 50 V22 C33 25 38 28 38 33" fill="none" />

      {/* Upper-center beamed double note */}
      <ellipse cx="52" cy="48" rx="6.5" ry="4.5" transform="rotate(-22 52 48)" />
      <path d="M57 46 V16 L80 12 V42" fill="none" />
      <ellipse cx="75" cy="44" rx="6.5" ry="4.5" transform="rotate(-22 75 44)" />

      {/* Mid-left single note */}
      <ellipse cx="44" cy="96" rx="6" ry="4.2" transform="rotate(-20 44 96)" />
      <path d="M49 94 V68 C55 71 59 74 59 79" fill="none" />

      {/* Mid-right single note */}
      <ellipse cx="92" cy="78" rx="6.2" ry="4.4" transform="rotate(-20 92 78)" />
      <path d="M97 76 V50 C103 53 107 56 107 61" fill="none" />

      {/* Lower-left single note */}
      <ellipse cx="82" cy="136" rx="6" ry="4.2" transform="rotate(-20 82 136)" />
      <path d="M87 134 V108 C93 111 97 114 97 119" fill="none" />

      {/* Lower-right beamed double note */}
      <ellipse cx="114" cy="124" rx="6.8" ry="4.6" transform="rotate(-20 114 124)" />
      <path d="M119 122 V90 L144 84 V116" fill="none" />
      <ellipse cx="139" cy="118" rx="6.8" ry="4.6" transform="rotate(-20 139 118)" />
    </g>
  </svg>
);

/** Looping 6-phase animated pink heart <-> firework <-> coral-red heart sticker between the couple. */
const HeartFireworkLoop: React.FC<{ dt: number; opacity?: number }> = ({ dt, opacity = 1 }) => {
  const phase = ((dt % 1.0) + 1.0) % 1.0;

  const drawHeart = (cx: number, cy: number, scale: number, rot: number, color: string) => (
    <g transform={`translate(${cx}, ${cy}) rotate(${rot}) scale(${scale})`}>
      <path
        d="M0 14 C-16 2 -24 -10 -15 -20 C-8 -27 0 -20 0 -13 C0 -20 8 -27 15 -20 C24 -10 16 2 0 14 Z"
        fill={color}
      />
    </g>
  );

  const drawBurst = (cx: number, cy: number, radius: number, rot: number, color: string, outerDots = false) => (
    <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <ellipse
          key={deg}
          cx="0"
          cy={-radius * 0.62}
          rx={radius * 0.17}
          ry={radius * 0.34}
          fill={color}
          transform={`rotate(${deg})`}
        />
      ))}
      {outerDots &&
        [30, 90, 150, 210, 270, 330].map((deg) => (
          <circle
            key={`o-${deg}`}
            cx="0"
            cy={-radius * 1.15}
            r={radius * 0.11}
            fill={color}
            opacity={0.78}
            transform={`rotate(${deg})`}
          />
        ))}
    </g>
  );

  const stage = phase < 0.17 ? 0 : phase < 0.34 ? 1 : phase < 0.50 ? 2 : phase < 0.67 ? 3 : phase < 0.87 ? 4 : 5;
  const sub = ((phase * 6) % 1) * 0.14;

  return (
    <svg width={290} height={320} viewBox="0 0 290 320" style={{ opacity, overflow: "visible" }}>
      {(stage === 0 || stage === 5) && (
        <>
          {drawBurst(96, 122, 34 * (0.94 + sub), 12, "#F28AA8", false)}
          {drawHeart(214, 72, 1.55 + sub * 0.5, 18, "#EB5069")}
          {drawHeart(86, 268, 0.62, -24, "#F6AAC2")}
        </>
      )}
      {stage === 1 && (
        <>
          {drawBurst(194, 76, 50 * (0.96 + sub), 18, "#ED6283", false)}
          {drawHeart(140, 206, 1.32 + sub * 0.5, 8, "#F7A6BF")}
        </>
      )}
      {stage === 2 && (
        <>
          {drawBurst(196, 148, 38 * (0.95 + sub), 26, "#F7A6BF", true)}
          {drawBurst(136, 76, 38, 6, "#F28AA8", true)}
        </>
      )}
      {stage === 3 && (
        <>
          {drawHeart(96, 166, 1.24 + sub * 0.5, 10, "#F7A0BA")}
          {drawBurst(214, 188, 48 * (0.95 + sub), 8, "#F494B0", false)}
        </>
      )}
      {stage === 4 && (
        <>
          {drawBurst(138, 90, 32 * (0.95 + sub), 20, "#F48DA9", false)}
          {drawHeart(168, 178, 1.48 + sub * 0.5, 18, "#EC4F67")}
        </>
      )}
    </svg>
  );
};

/** Single thick crayon-blue curly coil overlapping gently with subtle breathing motion. */
const BlueLoopDoodle: React.FC<{ width?: number; dt?: number; opacity?: number }> = ({
  width = 430,
  dt = 0,
  opacity = 1,
}) => {
  const swayY = Math.sin(dt * 3.4) * 3;
  const scaleX = 1 + Math.sin(dt * 2.8) * 0.02;
  return (
    <svg
      width={width}
      height={width * 0.27}
      viewBox="0 0 430 116"
      style={{
        opacity,
        transform: `translateY(${swayY.toFixed(2)}px) scaleX(${scaleX.toFixed(4)})`,
        transformOrigin: "center",
      }}
    >
      {/* Subtle pale rim underneath matching original crayon blue coil */}
      <path
        d="M16 74 C66 92 122 92 134 52 C142 26 106 20 96 44 C84 72 136 94 188 86 C234 78 242 28 214 24 C188 20 182 72 238 86 C294 98 318 32 290 26 C266 20 262 82 326 86 C362 88 394 82 414 74"
        fill="none"
        stroke="#B8E1FA"
        strokeWidth="21"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.48"
      />
      <path
        d="M16 74 C66 92 122 92 134 52 C142 26 106 20 96 44 C84 72 136 94 188 86 C234 78 242 28 214 24 C188 20 182 72 238 86 C294 98 318 32 290 26 C266 20 262 82 326 86 C362 88 394 82 414 74"
        fill="none"
        stroke="#5BA8E6"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const CurlyArrowDoodle: React.FC<{ width?: number; height?: number; dt: number; opacity?: number }> = ({
  width = 320,
  height = 195,
  dt,
  opacity = 1,
}) => {
  const cycle = dt % 2.1;
  const shaft = eIo3(clamp01(cycle / 0.95));
  const head = eOut3(clamp01((cycle - 0.82) / 0.28));
  const fade = cycle > 1.75 ? 1 - clamp01((cycle - 1.75) / 0.25) : 1;
  const stroke = "#F47CA7";

  return (
    <svg width={width} height={height} viewBox="0 0 320 195" style={{ opacity: opacity * fade, overflow: "visible" }}>
      <path
        d="M 300 42 C 258 34, 212 36, 188 64 C 168 88, 196 106, 208 82 C 222 54, 152 36, 108 64 C 72 86, 48 118, 28 148"
        fill="none"
        stroke={stroke}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
        strokeDasharray="100 100"
        strokeDashoffset={100 * (1 - shaft)}
      />
      <path
        d="M 28 148 L 16 108"
        fill="none"
        stroke={stroke}
        strokeWidth="10"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100 100"
        strokeDashoffset={100 * (1 - head)}
      />
      <path
        d="M 28 148 L 68 134"
        fill="none"
        stroke={stroke}
        strokeWidth="10"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100 100"
        strokeDashoffset={100 * (1 - head)}
      />
    </svg>
  );
};

// Warm comic hand-drawn heart accent (replaces raster heart.png)
const HeartDoodle: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 100 90" fill="none" style={style}>
    <path
      d="M50 82 C44 76 14 55 11 32 C9 17 21 8 34 10 C42 11 47 17 50 23 C53 17 58 11 66 10 C79 8 91 17 89 32 C86 55 56 76 50 82 Z"
      fill="#F07B98"
      stroke="#E65A7D"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M24 25 C25 19 30 16 36 17"
      stroke="#FFDCE5"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
  </svg>
);

// Retro spinning vinyl record SVG (replaces raster vinyl.png)
const VinylDoodle: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 180 180" fill="none" style={style}>
    <circle cx="90" cy="90" r="85" fill="#1F2026" stroke="#111216" strokeWidth="3" />
    <circle cx="90" cy="90" r="72" stroke="#33353F" strokeWidth="1.5" />
    <circle cx="90" cy="90" r="60" stroke="#2D2E38" strokeWidth="1.5" />
    <circle cx="90" cy="90" r="48" stroke="#353742" strokeWidth="1.5" />
    <path
      d="M32 54 A68 68 0 0 1 78 24"
      stroke="rgba(255,255,255,0.22)"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M148 126 A68 68 0 0 1 102 156"
      stroke="rgba(255,255,255,0.16)"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <circle cx="90" cy="90" r="30" fill="#ED7E99" stroke="#F8E7DC" strokeWidth="3" />
    <circle cx="90" cy="90" r="19" stroke="#F9D5DF" strokeWidth="1.5" strokeDasharray="4 4" />
    <circle cx="90" cy="90" r="6" fill="#FAF6F0" />
  </svg>
);

// Cluster of comic 4-point twinkling stars (replaces raster sparkle.png)
const SparkleDoodle: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 160 150" fill="none" style={style}>
    <path
      d="M66 16 Q71 58 112 64 Q71 70 66 112 Q61 70 20 64 Q61 58 66 16 Z"
      fill="#FFD54F"
      stroke="#FFF2B2"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path
      d="M126 24 Q129 44 148 47 Q129 50 126 70 Q123 50 104 47 Q123 44 126 24 Z"
      fill="#FFE885"
      stroke="#FFF6C9"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M112 94 Q115 110 130 113 Q115 116 112 132 Q109 116 94 113 Q109 110 112 94 Z"
      fill="#FFC145"
      stroke="#FFE99E"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

// Dynamic hand-drawn comic burst lines (replaces raster burst_yellow.png)
const BurstYellowDoodle: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 180 220" fill="none" style={style}>
    <path
      d="M132 162 L76 118 L94 106 L142 152 Z"
      fill="#FFD83B"
      stroke="#FFE87A"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path
      d="M116 196 L38 178 L46 158 L122 184 Z"
      fill="#FFD83B"
      stroke="#FFE87A"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path
      d="M150 132 L134 46 L156 42 L162 128 Z"
      fill="#FFD83B"
      stroke="#FFE87A"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path
      d="M84 68 C74 52 62 40 48 32"
      stroke="#FFD83B"
      strokeWidth="7"
      strokeLinecap="round"
    />
  </svg>
);

// ---------------------------------------------------------------- Chapter 0: Prologue (片头引子)
export const Prologue: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  if (t < c.B(at)) return null;
  const exit = pageExit(t, c, at, len);

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <StayWipeText font="kuaile" size={78} color={PINK} wipe={wipeAt(t, c.B(at), 0.35)} wipeDir="lr">
            我们
          </StayWipeText>
          <StayWipeText font="kuaile" size={78} color={WHITE} wipe={wipeAt(t, c.B(at) + 0.25, 0.65)} wipeDir="lr">
            {c.copy.prologueSuffix || "的故事即将开始..."}
          </StayWipeText>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 1: Born (我们出生啦)
export const Born: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const homeGroom = String(c.ph.homeGroom ?? "");
  const homeBride = String(c.ph.homeBride ?? "");
  const kidGroom = String(c.ph.kidGroom ?? "");
  const kidBride = String(c.ph.kidBride ?? "");

  const popG = eBack(ramp(t, t0 + 0.1, t0 + 0.55), 1.25);
  const popB = eBack(ramp(t, t0 + 0.25, t0 + 0.7), 1.25);
  const swayG = Math.sin((t - t0) * 3.8) * 3.6;
  const swayB = Math.sin((t - t0) * 3.8 + 1.4) * 3.6;

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Title */}
      <div style={{ position: "absolute", top: 44, width: "100%", display: "flex", justifyContent: "center" }}>
        <CartoonText font="kuaile" size={96} color={WHITE} wipe={wipeAt(t, t0, 0.55)} wipeDir="lr">
          {c.copy.bornTitle || "我们出生啦！！"}
        </CartoonText>
      </div>

      {/* Groom Hometown Landmark Sticker (stationary, prominent) */}
      <Sticker
        id={homeGroom}
        x={0}
        y={240}
        w={550}
        h={840}
        border={false}
        scale={eOut3(ramp(t, t0, t0 + 0.38))}
        origin="20% 92%"
      />
      {/* Tilted Groom Birth Year */}
      <div style={{ position: "absolute", left: 315, top: 185, transform: "rotate(14deg)" }}>
        <CartoonText font="kuaile" size={78} color={PINK} wipe={wipeAt(t, t0 + 0.2, 0.4)} wipeDir="lr">
          {c.copy.yearGroom || "2000"}
        </CartoonText>
      </div>

      {/* Groom Kid Sticker (white outline + swaying) */}
      <Sticker
        id={kidGroom}
        x={645}
        y={255}
        w={285}
        h={675}
        border={true}
        scale={popG}
        rot={swayG}
        origin="50% 90%"
      />
      <div style={{ position: "absolute", left: 788, bottom: 38, transform: "translateX(-50%)" }}>
        <CartoonText font="kuaile" size={58} color={WHITE} wipe={wipeAt(t, t0 + 0.35, 0.4)} wipeDir="lr">
          {c.copy.cityGroom || "济南"}
        </CartoonText>
      </div>

      {/* Bride Kid Sticker (white outline + swaying) */}
      <Sticker
        id={kidBride}
        x={1060}
        y={285}
        w={255}
        h={645}
        border={true}
        scale={popB}
        rot={swayB}
        origin="50% 90%"
      />
      <div style={{ position: "absolute", left: 1188, bottom: 38, transform: "translateX(-50%)" }}>
        <CartoonText font="kuaile" size={58} color={WHITE} wipe={wipeAt(t, t0 + 0.45, 0.4)} wipeDir="lr">
          {c.copy.cityBride || "青岛"}
        </CartoonText>
      </div>

      {/* Tilted Bride Birth Year */}
      <div style={{ position: "absolute", right: 335, top: 190, transform: "rotate(-14deg)" }}>
        <CartoonText font="kuaile" size={78} color={PINK} wipe={wipeAt(t, t0 + 0.3, 0.4)} wipeDir="lr">
          {c.copy.yearBride || "2001"}
        </CartoonText>
      </div>
      {/* Bride Hometown Landmark Sticker (stationary, prominent) */}
      <Sticker
        id={homeBride}
        x={1370}
        y={200}
        w={550}
        h={880}
        border={false}
        scale={eOut3(ramp(t, t0 + 0.12, t0 + 0.5))}
        origin="80% 92%"
      />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 2: Parents as Gardeners (爱人如养花)
const PARENT_DOODLE_FRAMES: {
  x: number;
  y: number;
  w: number;
  h: number;
  d: string;
}[] = [
  {
    // Left-most wide hand-drawn dome/bread contour
    x: 34,
    y: 298,
    w: 500,
    h: 742,
    d: "M 50 3 C 77 2 95 16 97 44 C 99 82 98 130 94 155 C 90 166 72 168 48 167 C 20 167 6 164 4 148 C 2 114 3 70 6 40 C 9 14 25 4 50 3 Z",
  },
  {
    // Second tall organic pebble contour with slight top-right crown
    x: 542,
    y: 266,
    w: 446,
    h: 774,
    d: "M 56 3 C 83 4 96 24 97 56 C 98 94 96 136 86 157 C 76 167 48 168 25 164 C 8 160 3 136 3 96 C 3 52 14 18 35 8 C 43 4 49 3 56 3 Z",
  },
  {
    // Third hand-drawn slightly crooked arch contour
    x: 994,
    y: 268,
    w: 426,
    h: 772,
    d: "M 52 3 C 79 3 95 20 97 54 C 99 92 97 138 89 158 C 82 167 52 168 26 165 C 8 162 3 140 3 102 C 3 62 6 28 24 12 C 33 5 42 3 52 3 Z",
  },
  {
    // Fourth organic irregular contour with gentle right-side wave
    x: 1424,
    y: 270,
    w: 454,
    h: 770,
    d: "M 48 3 C 74 3 91 15 96 38 C 100 54 94 74 96 96 C 97 128 91 155 77 164 C 63 169 32 168 16 158 C 4 148 2 114 4 76 C 6 36 18 4 48 3 Z",
  },
];

export const ParentsGardeners: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "parents");
  const heartBeat = 1 + 0.22 * Math.pow(Math.abs(Math.sin((t - t0) * Math.PI * 2.2)), 2);
  const heartHop = -7 * Math.abs(Math.sin((t - t0) * Math.PI * 2.2));
  const heartOpacity = eOut3(ramp(t, t0 + 1.55, t0 + 1.9));

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Top Titles: left stacked bold pink lines + yellow "爸爸妈妈" + 3 jumping pink hearts */}
      <div
        style={{
          position: "absolute",
          left: 118,
          top: 28,
          width: 860,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Text font="kuaile" size={92} color={PINK} wipe={wipeAt(t, t0, 0.55)} wipeDir="lr">
          {c.copy.parentsTitle1 || "爱人如养花"}
        </Text>
        <div style={{ marginTop: 10 }}>
          <Text font="kuaile" size={88} color={PINK} wipe={wipeAt(t, t0 + 0.5, 0.6)} wipeDir="lr">
            我们最好的花匠是
          </Text>
        </div>
      </div>

      {/* Yellow Focus Word "爸爸妈妈" */}
      <div style={{ position: "absolute", left: 1020, top: 122 }}>
        <Text font="kuaile" size={102} color={YELLOW} wipe={wipeAt(t, t0 + 1.15, 0.5)} wipeDir="lr">
          {c.copy.parentsTitle2 || "爸爸妈妈"}
        </Text>
      </div>

      {/* 3 Jumping Hand-Drawn Hearts on Right */}
      <div
        style={{
          position: "absolute",
          left: 1470,
          top: 86,
          width: 170,
          height: 150,
          opacity: heartOpacity,
          transform: `translateY(${heartHop}px) scale(${heartBeat})`,
          transformOrigin: "center",
        }}
      >
        <HeartDoodle
          style={{ position: "absolute", left: 0, top: 0, width: 72, height: 60, transform: "rotate(-12deg)" }}
        />
        <HeartDoodle
          style={{ position: "absolute", left: 82, top: 24, width: 54, height: 45, transform: "rotate(14deg)" }}
        />
        <HeartDoodle
          style={{ position: "absolute", left: 38, top: 78, width: 38, height: 32, transform: "rotate(6deg)" }}
        />
      </div>

      {/* 4 Irregular Hand-Drawn Organic Frames with Bold Pink Stroke */}
      {PARENT_DOODLE_FRAMES.map((frame, idx) => {
        const ph = photos[idx % Math.max(1, photos.length)] || "";
        const src = resolveSrc(ph);
        let fitStyle: React.CSSProperties = { objectFit: "cover", objectPosition: "center" };
        try {
          const manifest = getPhoto(ph);
          if (manifest) fitStyle = coverStyle(manifest, frame.w, frame.h);
        } catch {
          // fallback
        }
        const enter = eBack(ramp(t, t0 + idx * 0.08, t0 + idx * 0.08 + 0.36), 1.1);
        const clipId = `bloom-parent-clip-${idx}`;

        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: frame.x,
              top: frame.y,
              width: frame.w,
              height: frame.h,
              opacity: clamp01(enter),
              transform: `scale(${0.9 + 0.1 * enter})`,
              transformOrigin: "center",
            }}
          >
            <svg
              width={0}
              height={0}
              style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
              aria-hidden
            >
              <defs>
                <clipPath id={clipId} clipPathUnits="objectBoundingBox">
                  <path d={frame.d} transform="scale(0.01, 0.00588235)" />
                </clipPath>
              </defs>
            </svg>
            <div style={{ position: "absolute", inset: 0, clipPath: `url(#${clipId})`, WebkitClipPath: `url(#${clipId})` }}>
              {src && <Img src={src} style={{ width: "100%", height: "100%", ...fitStyle }} />}
            </div>
            <svg
              width={frame.w}
              height={frame.h}
              viewBox="0 0 100 170"
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
            >
              <path
                d={frame.d}
                fill="none"
                stroke="#F3A2BA"
                strokeWidth="13"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 3: Wing (在父母的呵护下)
export const Wing: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "wing", "parents");
  const dt = Math.max(0, t - t0);
  const vinylRot = (t * 72) % 360;
  const starPulse = 0.5 + 0.5 * Math.sin(dt * 8.5);
  const starOpacity = 0.45 + 0.55 * starPulse;
  const starScale = 0.85 + 0.3 * starPulse;

  const stickerBoxes = [
    { x: 88, y: 98, w: 405, h: 630, rot: -1.5, delay: 0.0 },
    { x: 515, y: 465, w: 595, h: 540, rot: 1.0, delay: 0.2 },
    { x: 1140, y: 310, w: 305, h: 650, rot: -1.2, delay: 0.4 },
    { x: 1485, y: 390, w: 400, h: 615, rot: 1.4, delay: 0.6 },
  ];

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Vinyl Disc Centered Above Photo 2 & Between Photos 1 & 3 */}
      <VinylDoodle
        style={{
          position: "absolute",
          left: 765,
          top: 132,
          width: 170,
          height: 170,
          transform: `rotate(${vinylRot}deg)`,
          opacity: eOut3(ramp(t, t0, t0 + 0.35)),
        }}
      />

      {/* Pastel Pink Hand-Drawn Arrow Drawing Trajectory Toward Middle of Photos 2 & 3 */}
      <div style={{ position: "absolute", left: 1030, top: 82 }}>
        <CurlyArrowDoodle width={320} height={195} dt={dt} opacity={eOut3(ramp(t, t0 + 0.08, t0 + 0.28))} />
      </div>

      {/* Upper Right: Hand-Drawn Cartoon Pink 2-Line Title */}
      <div
        style={{
          position: "absolute",
          left: 1380,
          top: 66,
          width: 450,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          lineHeight: 1.12,
          transform: "rotate(-2deg)",
          textShadow: "2px 2px 0 rgba(235,94,142,0.45), -1px -1px 0 rgba(255,182,210,0.3)",
        }}
      >
        <Text font="kuaile" size={82} color={PINK} wipe={wipeAt(t, t0, 0.5)} wipeDir="lr">
          {c.copy.wingTitle ? c.copy.wingTitle.slice(0, 4) : "在父母的"}
        </Text>
        <Text font="kuaile" size={82} color={PINK} wipe={wipeAt(t, t0 + 0.4, 0.5)} wipeDir="lr">
          {c.copy.wingTitle && c.copy.wingTitle.length > 4 ? c.copy.wingTitle.slice(4) : "呵护下..."}
        </Text>
      </div>

      {/* 4 Background-Free Cutout Stickers with White Outline */}
      {stickerBoxes.map((b, idx) => {
        const pop = eBack(ramp(t, t0 + b.delay, t0 + b.delay + 0.42), 1.18);
        return (
          <Sticker
            key={idx}
            id={photos[idx % Math.max(1, photos.length)] || ""}
            x={b.x}
            y={b.y}
            w={b.w}
            h={b.h}
            border={true}
            rot={b.rot + Math.sin(dt * 2.5 + idx) * 1.4}
            scale={pop}
            opacity={clamp01(pop)}
            origin="50% 80%"
          />
        );
      })}

      {/* Bottom-Left Hand-Drawn Sparkles */}
      <SparkleDoodle
        style={{
          position: "absolute",
          left: 145,
          bottom: 72,
          width: 165,
          height: 155,
          opacity: starOpacity * 0.9,
          transform: `scale(${starScale})`,
        }}
      />

      {/* Bottom-Right Twinkling Stars */}
      <SparkleDoodle
        style={{
          position: "absolute",
          right: 88,
          bottom: 58,
          width: 105,
          height: 105,
          opacity: starOpacity,
          transform: `scale(${starScale}) rotate(${Math.sin(dt * 3) * 12}deg)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 4: GrowingHappily (茁壮成长)
export const GrowingHappily: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "growing");
  const tPhase2 = c.B(at + 1);
  const showP2 = t >= tPhase2;
  const sunRot = ((t - t0) * 80) % 360;

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Top Left: 2 Boy Photos progressively */}
      <Pic
        id={photos[0] || ""}
        box={{ x: 34, y: 120, w: 445, h: 635 }}
        radius={16}
        border="6px solid #3B82F6"
        opacity={eOut3(ramp(t, t0, t0 + 0.35))}
        scale={0.94 + 0.06 * eOut3(ramp(t, t0, t0 + 0.35))}
      />
      <Pic
        id={photos[1] || ""}
        box={{ x: 496, y: 120, w: 445, h: 635 }}
        radius={16}
        border="6px solid #06B6D4"
        opacity={eOut3(ramp(t, t0 + 0.28, t0 + 0.62))}
        scale={0.94 + 0.06 * eOut3(ramp(t, t0 + 0.28, t0 + 0.62))}
      />

      {/* Top Right Pink Cartoon Title Centered Over Girl Photos */}
      <div
        style={{
          position: "absolute",
          left: 985,
          top: 86,
          width: 890,
          display: "flex",
          justifyContent: "center",
          textShadow: "2px 2px 0 rgba(235,94,142,0.4), -1px -1px 0 rgba(255,180,210,0.28)",
        }}
      >
        <Text font="kuaile" size={104} color={PINK} wipe={wipeAt(t, t0 + 0.35, 0.55)} wipeDir="lr">
          {c.copy.growingTitle1 || "我们幸福地"}
        </Text>
      </div>

      {/* Bottom Left: Large Rotating Swirl Sun + Large Hand-Drawn Cartoon "茁壮成长" */}
      {showP2 && (
        <div
          style={{
            position: "absolute",
            left: 118,
            top: 800,
            display: "flex",
            alignItems: "center",
            gap: 28,
            textShadow: "2px 2px 0 rgba(220,178,72,0.38), -1px -1px 0 rgba(255,235,160,0.25)",
          }}
        >
          <SunDoodle size={132} rot={sunRot} opacity={eOut3(ramp(t, tPhase2, tPhase2 + 0.3))} />
          <Text font="kuaile" size={108} color="#DFBD5B" wipe={wipeAt(t, tPhase2 + 0.08, 0.55)} wipeDir="lr">
            {c.copy.growingTitle2 || "茁壮成长"}
          </Text>
        </div>
      )}

      {/* Bottom Right: 2 Girl Photos progressively */}
      {showP2 && (
        <>
          <Pic
            id={photos[2] || ""}
            box={{ x: 985, y: 245, w: 435, h: 635 }}
            radius={16}
            border="6px solid #EF4444"
            opacity={eOut3(ramp(t, tPhase2, tPhase2 + 0.35))}
            scale={0.94 + 0.06 * eOut3(ramp(t, tPhase2, tPhase2 + 0.35))}
          />
          <Pic
            id={photos[3] || ""}
            box={{ x: 1440, y: 245, w: 435, h: 635 }}
            radius={16}
            border="6px solid #A855F7"
            opacity={eOut3(ramp(t, tPhase2 + 0.28, tPhase2 + 0.62))}
            scale={0.94 + 0.06 * eOut3(ramp(t, tPhase2 + 0.28, tPhase2 + 0.62))}
          />
        </>
      )}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 5: ThanksParents (感恩父母)
export const ThanksParents: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "parentsThanks", "parents");
  const tEnd = c.B(at + len);
  const push = 1 + 0.08 * ramp(t, t0, tEnd);
  const sproutRot = Math.sin((t - t0) * 3.2) * 6;
  const PALE_YELLOW = "#F7EEB2";
  const cartoonShadow = "2px 2px 0 rgba(247,238,178,0.3), -1px -1px 0 rgba(255,250,210,0.22)";

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Top Left Twin Green Sprout Doodles */}
      <div style={{ position: "absolute", left: 36, top: 86 }}>
        <SproutDoodle size={118} rot={sproutRot} opacity={eOut3(ramp(t, t0, t0 + 0.35))} />
      </div>

      {/* 2 Wide Horizontal Photos with Thick Pink Borders, Compact with Bottom Text */}
      <Pic
        id={photos[0] || ""}
        box={{ x: 110, y: 195, w: 830, h: 550 }}
        radius={36}
        border="10px solid #F26B97"
        zoom={push}
        opacity={eOut3(ramp(t, t0 + 0.08, t0 + 0.45))}
        scale={0.94 + 0.06 * eOut3(ramp(t, t0 + 0.08, t0 + 0.45))}
        jitter={{ t, seed: 5, amp: 3.0, rotAmp: 0.45 }}
      />
      <Pic
        id={photos[1] || ""}
        box={{ x: 980, y: 195, w: 830, h: 550 }}
        radius={36}
        border="10px solid #F26B97"
        zoom={push}
        opacity={eOut3(ramp(t, t0 + 0.35, t0 + 0.72))}
        scale={0.94 + 0.06 * eOut3(ramp(t, t0 + 0.35, t0 + 0.72))}
        jitter={{ t, seed: 6, amp: 3.0, rotAmp: 0.45 }}
      />

      {/* Bottom Pale-Yellow Hand-Drawn Cartoon Lines with Fixed Top Positions (No Shift When Line 2 Enters) */}
      <div
        style={{
          position: "absolute",
          top: 774,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          textShadow: cartoonShadow,
        }}
      >
        <StayWipeText font="kuaile" size={82} color={PALE_YELLOW} wipe={wipeAt(t, t0 + 0.55, 0.75)} wipeDir="lr">
          {c.copy.thanksP1 || "一路上感谢父母的照顾"}
        </StayWipeText>
      </div>
      <div
        style={{
          position: "absolute",
          top: 884,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          textShadow: cartoonShadow,
        }}
      >
        <StayWipeText font="kuaile" size={76} maxWidth={1820} color={PALE_YELLOW} wipe={wipeAt(t, c.B(at + 3.0), 0.95)} wipeDir="lr">
          {c.copy.thanksP2 || "谢谢你们赐予我们生命 辛苦把我们养育长大"}
        </StayWipeText>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 6: MeetQingdao (相识青岛)
export const MeetQingdao: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const tPhase2 = c.B(at + 5);
  const isPhase2 = t >= tPhase2;

  const firstMeet = String(c.ph.firstMeet ?? "");
  const firstMeetSrc = resolveSrc(firstMeet);
  let firstMeetFit: React.CSSProperties = { objectFit: "cover", objectPosition: "center" };
  try {
    const m = firstMeet ? getPhoto(firstMeet) : undefined;
    if (m) firstMeetFit = coverStyle(m, 480, 690);
  } catch {
    // fallback
  }
  const groomYouth = String(c.ph.meetGroom ?? "");
  const brideYouth = String(c.ph.meetBride ?? "");

  const fullYear = c.copy.meetYear || "时间来到 2021年...";
  const yearMatch = fullYear.match(/^(.*?)(\d{4}.*)$/);
  const prefixText = yearMatch ? yearMatch[1].trim() : "时间来到";
  const yearText = yearMatch ? yearMatch[2] : "2021年...";

  // 3 dynamic illustrations in Phase 2
  const dt2 = Math.max(0, t - tPhase2);
  const burstScale = 0.92 + 0.16 * Math.abs(Math.sin(dt2 * 5.2));
  const burstRot = Math.sin(dt2 * 4.5) * 8;

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Phase 1: "时间来到" (white) + "2021年..." (pink) */}
      {!isPhase2 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 22 }}>
          <CartoonText font="kuaile" size={92} color={WHITE} wipe={wipeAt(t, t0, 0.6)} wipeDir="lr">
            {prefixText}
          </CartoonText>
          <CartoonText font="kuaile" size={92} color={PINK} wipe={wipeAt(t, t0 + 0.55, 0.55)} wipeDir="lr">
            {yearText}
          </CartoonText>
        </div>
      )}

      {/* Phase 2: We met in Qingdao */}
      {isPhase2 && (
        <div style={{ width: "100%", height: "100%" }}>
          <div style={{ position: "absolute", left: 150, top: 82 }}>
            <CartoonText font="kuaile" size={96} color={PINK} wipe={wipeAt(t, tPhase2, 0.65)} wipeDir="lr">
              {c.copy.meetTitle || "我们相识于青岛"}
            </CartoonText>
          </div>

          {/* Left Landmark in Pink Oval Capsule */}
          {firstMeetSrc && (
            <div
              style={{
                position: "absolute",
                left: 79,
                top: 340,
                width: 480,
                height: 690,
                borderRadius: "50%",
                border: "12px solid #F29AB6",
                overflow: "hidden",
                boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
                opacity: eOut3(ramp(t, tPhase2, tPhase2 + 0.45)),
                transform: `scale(${0.92 + 0.08 * eBack(ramp(t, tPhase2, tPhase2 + 0.5), 1.1)})`,
              }}
            >
              <Img src={firstMeetSrc} style={{ width: "100%", height: "100%", ...firstMeetFit }} />
            </div>
          )}

          {/* Illustration 1: Dynamic Yellow Comic Burst */}
          <div
            style={{
              position: "absolute",
              left: 530,
              top: 300,
              width: 175,
              height: 215,
              opacity: eOut3(ramp(t, tPhase2 + 0.25, tPhase2 + 0.6)),
              transform: `scale(${burstScale}) rotate(${burstRot}deg)`,
            }}
          >
            <BurstYellowDoodle style={{ width: "100%", height: "100%" }} />
          </div>

          {/* Adult Groom Standee (prominent full height) */}
          <Sticker
            id={groomYouth}
            x={855}
            y={285}
            w={360}
            h={755}
            border={false}
            scale={eBack(ramp(t, tPhase2 + 0.3, tPhase2 + 0.75), 1.1)}
            rot={Math.sin(dt2 * 2.5) * 1.4}
            origin="50% 90%"
          />

          {/* Adult Bride Standee (clean cutout, full height) */}
          <Sticker
            id={brideYouth}
            x={1375}
            y={230}
            w={520}
            h={795}
            border={false}
            scale={eBack(ramp(t, tPhase2 + 0.55, tPhase2 + 1.0), 1.1)}
            rot={Math.sin(dt2 * 2.5 + 1.2) * 1.4}
            origin="50% 90%"
          />

          {/* Illustration 2: Looping Pink Heart <-> Firework <-> Coral Red Heart */}
          <div
            style={{
              position: "absolute",
              left: 1175,
              top: 195,
              opacity: eOut3(ramp(t, tPhase2 + 0.65, tPhase2 + 0.95)),
            }}
          >
            <HeartFireworkLoop dt={dt2} />
          </div>

          {/* Illustration 3: Single Thick Blue Curly Loop */}
          <div
            style={{
              position: "absolute",
              left: 1180,
              bottom: 52,
              opacity: eOut3(ramp(t, tPhase2 + 0.75, tPhase2 + 1.15)),
            }}
          >
            <BlueLoopDoodle width={430} dt={dt2} />
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 7: LoversPets (成为恋人与宠物)
export const LoversPets: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "dating");
  const pet = String(c.ph.pets ?? "");

  const pop1 = eBack(ramp(t, t0 + 0.7, t0 + 1.2), 1.2);
  const pop2 = eBack(ramp(t, t0 + 1.7, t0 + 2.2), 1.2);
  const popPet = eBack(ramp(t, t0 + 2.7, t0 + 3.2), 1.2);
  const pop3 = eBack(ramp(t, t0 + 3.7, t0 + 4.2), 1.2);

  const heartOpacity = eOut3(ramp(t, t0 + 4.1, t0 + 4.5));
  const heartBeat = 1 + 0.2 * Math.abs(Math.sin((t - t0) * 5.2));
  const heartRot = Math.sin((t - t0) * 3.4) * 10;

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Top Left Date & Prefix */}
      <div style={{ position: "absolute", left: 140, top: 66 }}>
        <CartoonText font="kuaile" size={80} color={WHITE} wipe={wipeAt(t, t0, 0.5)} wipeDir="lr">
          {c.copy.datingDate || "2023 11 20"}
        </CartoonText>
        <div style={{ marginTop: 8 }}>
          <CartoonText font="kuaile" size={78} color={WHITE} wipe={wipeAt(t, t0 + 0.4, 0.5)} wipeDir="lr">
            我们成为了
          </CartoonText>
        </div>
      </div>

      {/* Bottom Left Large Pink "恋人" */}
      <div style={{ position: "absolute", left: 145, bottom: 72 }}>
        <CartoonText font="kuaile" size={118} color={PINK} wipe={wipeAt(t, t0 + 0.85, 0.45)} wipeDir="lr">
          恋人
        </CartoonText>
      </div>

      {/* Sequential Background-Free Cutout Stickers with White Contour */}
      <Sticker
        id={photos[0] || ""}
        x={95}
        y={325}
        w={520}
        h={490}
        border={true}
        scale={pop1}
        opacity={clamp01(pop1)}
        rot={Math.sin((t - t0) * 2.5) * 1.4}
        origin="50% 85%"
      />
      <Sticker
        id={photos[1] || photos[0] || ""}
        x={735}
        y={270}
        w={310}
        h={435}
        border={true}
        scale={pop2}
        opacity={clamp01(pop2)}
        rot={Math.sin((t - t0) * 2.5 + 1.0) * 1.4}
        origin="50% 85%"
      />
      <Sticker
        id={pet}
        x={1375}
        y={80}
        w={485}
        h={450}
        border={true}
        scale={popPet}
        opacity={clamp01(popPet)}
        rot={Math.sin((t - t0) * 2.5 + 2.0) * 1.5}
        origin="50% 85%"
      />
      <Sticker
        id={photos[2] || photos[0] || ""}
        x={565}
        y={435}
        w={885}
        h={600}
        border={true}
        scale={pop3}
        opacity={clamp01(pop3)}
        rot={Math.sin((t - t0) * 2.3 + 2.7) * 1.2}
        origin="50% 90%"
      />

      {/* Dynamic Heart on Bottom Right */}
      <div
        style={{
          position: "absolute",
          right: 120,
          bottom: 140,
          opacity: heartOpacity,
          transform: `scale(${heartBeat}) rotate(${heartRot}deg)`,
          transformOrigin: "center",
        }}
      >
        <HeartDoodle style={{ width: 112, height: 92 }} />
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 8: DaysCounter (携手同行天数)
export const DaysCounter: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const dt = t - t0;
  const tEnd = c.B(at + len);
  const numStart = t0 + 0.95;
  const numPop = eBack(ramp(t, numStart, numStart + 0.35), 1.3);
  const numOpacity = clamp01(ramp(t, numStart, numStart + 0.18));
  const rowBreath = 0.98 + 0.06 * ramp(t, t0, tEnd);
  const glow = 0.04 + 0.09 * (0.5 + 0.5 * Math.sin(dt * 3.2));
  const heartBeat = 1 + 0.16 * Math.abs(Math.sin(dt * 4.4));
  const heartY1 = Math.sin(dt * 2.8) * 16;
  const heartY2 = Math.cos(dt * 2.6 + 1.1) * 16;

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Soft breathing warm halo keeps dark frame alive without breaking black-canvas feel */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(ellipse 68% 52% at 54% 50%, rgba(242,107,151,${glow.toFixed(3)}) 0%, rgba(242,107,151,${(glow * 0.35).toFixed(3)}) 45%, transparent 76%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 22,
          transform: `scale(${rowBreath.toFixed(4)})`,
          transformOrigin: "center",
        }}
      >
        <div
          style={{
            opacity: eOut3(ramp(t, t0 + 0.15, t0 + 0.45)),
            transform: `translateY(${heartY1.toFixed(1)}px) rotate(-14deg) scale(${heartBeat.toFixed(3)})`,
            marginRight: 8,
          }}
        >
          <HeartDoodle style={{ width: 64, height: 54 }} />
        </div>
        <CartoonText font="kuaile" size={92} color={WHITE} wipe={wipeAt(t, t0, 0.85)} wipeDir="lr">
          我们携手同行了
        </CartoonText>
        <div
          style={{
            opacity: numOpacity,
            transform: `scale(${0.7 + 0.3 * numPop})`,
            transformOrigin: "center",
          }}
        >
          <CartoonText font="kuaile" size={106} color={PINK}>
            {`${c.copy.datingDays || "1569"}天`}
          </CartoonText>
        </div>
        <div
          style={{
            opacity: numOpacity,
            transform: `translateY(${heartY2.toFixed(1)}px) rotate(14deg) scale(${(heartBeat * 0.92).toFixed(3)})`,
            marginLeft: 6,
          }}
        >
          <HeartDoodle style={{ width: 58, height: 48 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 9: MemoriesSection (在这些日子里 我们一起)
export const MemoriesSection: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "memories", "dating");
  const ph0 = photos[0] || "";
  const ph1 = photos[1] || ph0;
  const ph2 = photos[2] || ph1;
  const ph3 = photos[3] || ph2;

  const s1 = c.B(at + 5);
  const s2 = c.B(at + 10);
  const s3 = c.B(at + 15);
  const s4 = c.B(at + 20);

  const tagIdx = t >= s4 ? 2 : t >= s2 ? 1 : 0;
  const tags = [
    c.copy.memoryTag1 || "「 庆祝生日 」",
    c.copy.memoryTag2 || "「 看演唱会 」",
    c.copy.memoryTag3 || "「 我们的第一套写真 」",
  ];
  const tagStarts = [t0 + 0.45, s2, s4];
  const noteJit = jitterOf(t, 9, 4.0, 5.5);

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Left Header */}
      <div style={{ position: "absolute", left: 80, top: "50%", transform: "translateY(-50%)", width: 830 }}>
        <CartoonText font="kuaile" size={78} color={WHITE} wipe={wipeAt(t, t0, 0.7)} wipeDir="lr">
          {c.copy.memoriesPrefix || "在这些日子里 我们一起"}
        </CartoonText>
      </div>

      {/* Right Filmstrip Photo Reel */}
      <FilmstripStage
        t={t}
        switchTimes={[s1, s2, s3, s4]}
        transDur={0.44}
        stepPx={820}
        box={{ x: 920, y: 70, w: 920, h: 780 }}
        renderSlide={(idx) => {
          if (idx === 0) {
            return (
              <FeatheredPic
                id={ph0}
                box={{ x: 30, y: 90, w: 840, h: 580 }}
                radius={36}
                feather={40}
                jitter={{ t, seed: 1 }}
              />
            );
          }
          if (idx === 1) {
            return (
              <FeatheredPic
                id={ph1}
                box={{ x: 160, y: 30, w: 580, h: 720 }}
                radius={36}
                feather={40}
                jitter={{ t, seed: 2 }}
              />
            );
          }
          if (idx === 2) {
            return (
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <FeatheredPic
                  id={ph1}
                  box={{ x: 50, y: 110, w: 810, h: 560 }}
                  radius={36}
                  feather={40}
                  jitter={{ t, seed: 3 }}
                />
                <div style={{ position: "absolute", left: 6, top: 8 }}>
                  <MusicNotesDoodle size={148} x={noteJit.x} y={noteJit.y} rot={noteJit.rot} />
                </div>
              </div>
            );
          }
          if (idx === 3) {
            return (
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <FeatheredPic
                  id={ph2}
                  box={{ x: 160, y: 30, w: 580, h: 720 }}
                  radius={36}
                  feather={40}
                  jitter={{ t, seed: 4 }}
                />
                <div style={{ position: "absolute", left: 8, top: 75 }}>
                  <MusicNotesDoodle size={160} x={noteJit.x} y={noteJit.y} rot={noteJit.rot} />
                </div>
              </div>
            );
          }
          const tP2 = c.B(at + 23);
          const p2Enter = eOut3(ramp(t, tP2 - 0.15, tP2 + 0.3));
          return (
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <FeatheredPic
                id={ph2}
                box={{ x: 25, y: 35, w: 430, h: 610 }}
                radius={34}
                feather={34}
                jitter={{ t, seed: 5 }}
              />
              <FeatheredPic
                id={ph3}
                box={{ x: 475, y: 150, w: 420, h: 590 }}
                radius={34}
                feather={34}
                opacity={p2Enter}
                scale={0.92 + 0.08 * p2Enter}
                jitter={{ t, seed: 6 }}
              />
            </div>
          );
        }}
      />

      {/* Bottom Right Category Tag */}
      <div style={{ position: "absolute", left: 920, top: 882, width: 920, display: "flex", justifyContent: "center" }}>
        <CartoonText font="kuaile" size={76} color={PINK} wipe={wipeAt(t, tagStarts[tagIdx], 0.5)} wipeDir="lr">
          {tags[tagIdx]}
        </CartoonText>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 10: TravelSection (一起去旅行)
export const TravelSection: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "travel");
  const getP = (i: number) => photos[i % Math.max(1, photos.length)] || "";

  const tags = [
    c.copy.travel1 || "「 打卡云南 」",
    c.copy.travel2 || "「 在新疆 」",
    c.copy.travel3 || "「 去青岛 」",
    c.copy.travel4 || "「 去杭州 」",
    c.copy.travel5 || "「 去长白山 」",
    c.copy.travel6 || "「 去大西北 」",
  ];

  // 10 filmstrip slides distributed across the 48 beats (8 beats per destination)
  const stationStarts = [0, 8, 16, 24, 32, 40].map((d) => c.B(at + d));
  const stationEnds = [8, 16, 24, 32, 40, 48].map((d) => c.B(at + d));
  const slideTimes = [
    c.B(at + 4),   // 0->1 Yunnan vertical -> wide
    c.B(at + 8),   // 1->2 Xinjiang vertical
    c.B(at + 12),  // 2->3 Xinjiang 2-stacked
    c.B(at + 16),  // 3->4 Qingdao 2-side-by-side
    c.B(at + 24),  // 4->5 Hangzhou wide 1
    c.B(at + 28),  // 5->6 Hangzhou wide 2
    c.B(at + 32),  // 6->7 Changbai wide
    c.B(at + 40),  // 7->8 Northwest wide 1
    c.B(at + 44),  // 8->9 Northwest wide 2
  ];

  let destIdx = 0;
  for (let i = 0; i < stationStarts.length; i++) {
    if (t >= stationStarts[i] - 0.35) destIdx = i;
  }

  // Destination tag scale entrance (旅行地区文字缩放出现)
  const stStart = stationStarts[destIdx];
  const stEnd = stationEnds[destIdx];
  const tagIn = eBack(ramp(t, stStart, stStart + 0.45), 1.45);
  const tagOut = 1 - eOut3(ramp(t, stEnd - 0.25, stEnd));
  const tagScale = (0.35 + 0.65 * tagIn) * (0.8 + 0.2 * tagOut);
  const tagOpacity = clamp01(ramp(t, stStart, stStart + 0.14)) * tagOut;

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Center Filmstrip Reel */}
      <FilmstripStage
        t={t}
        switchTimes={slideTimes}
        transDur={0.44}
        stepPx={880}
        box={{ x: 420, y: 45, w: 1080, h: 830 }}
        renderSlide={(idx) => {
          switch (idx) {
            case 0: // Yunnan portrait
              return <FeatheredPic id={getP(0)} box={{ x: 240, y: 35, w: 600, h: 760 }} radius={36} feather={40} jitter={{ t, seed: 10 }} />;
            case 1: // Yunnan wide
              return <FeatheredPic id={getP(1)} box={{ x: 40, y: 95, w: 1000, h: 640 }} radius={36} feather={42} jitter={{ t, seed: 11 }} />;
            case 2: // Xinjiang portrait
              return <FeatheredPic id={getP(2)} box={{ x: 240, y: 35, w: 600, h: 760 }} radius={36} feather={40} jitter={{ t, seed: 12 }} />;
            case 3: // Xinjiang 2-stacked landscape
              return (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <FeatheredPic id={getP(2)} box={{ x: 180, y: 20, w: 720, h: 380 }} radius={32} feather={34} jitter={{ t, seed: 13 }} />
                  <FeatheredPic id={getP(3)} box={{ x: 180, y: 425, w: 720, h: 380 }} radius={32} feather={34} jitter={{ t, seed: 14 }} />
                </div>
              );
            case 4: // Qingdao 2-side-by-side portrait
              return (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <FeatheredPic id={getP(4)} box={{ x: 55, y: 65, w: 465, h: 700 }} radius={32} feather={36} jitter={{ t, seed: 15 }} />
                  <FeatheredPic id={getP(5)} box={{ x: 560, y: 65, w: 465, h: 700 }} radius={32} feather={36} jitter={{ t, seed: 16 }} />
                </div>
              );
            case 5: // Hangzhou wide 1
              return <FeatheredPic id={getP(6)} box={{ x: 30, y: 95, w: 1020, h: 640 }} radius={36} feather={42} jitter={{ t, seed: 17 }} />;
            case 6: // Hangzhou wide 2
              return <FeatheredPic id={getP(7)} box={{ x: 30, y: 95, w: 1020, h: 640 }} radius={36} feather={42} jitter={{ t, seed: 18 }} />;
            case 7: // Changbai wide
              return <FeatheredPic id={getP(8)} box={{ x: 30, y: 95, w: 1020, h: 640 }} radius={36} feather={42} jitter={{ t, seed: 19 }} />;
            case 8: // Northwest wide 1
              return <FeatheredPic id={getP(9)} box={{ x: 30, y: 95, w: 1020, h: 640 }} radius={36} feather={42} jitter={{ t, seed: 20 }} />;
            default: // Northwest wide 2
              return <FeatheredPic id={getP(10)} box={{ x: 30, y: 95, w: 1020, h: 640 }} radius={36} feather={42} jitter={{ t, seed: 21 }} />;
          }
        }}
      />

      {/* Left: 一起去 */}
      <div style={{ position: "absolute", left: 145, top: "48%", transform: "translateY(-50%)" }}>
        <CartoonText font="kuaile" size={92} color={WHITE} wipe={wipeAt(t, t0, 0.5)} wipeDir="lr">
          {c.copy.travelLeft || "一起去"}
        </CartoonText>
      </div>

      {/* Right: 旅行 */}
      <div style={{ position: "absolute", right: 175, top: "48%", transform: "translateY(-50%)" }}>
        <CartoonText font="kuaile" size={92} color={WHITE} wipe={wipeAt(t, t0 + 0.25, 0.5)} wipeDir="lr">
          {c.copy.travelRight || "旅行"}
        </CartoonText>
      </div>

      {/* Bottom Destination Tag (缩放出现) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 900,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          opacity: tagOpacity,
          transform: `scale(${tagScale})`,
          transformOrigin: "center",
        }}
      >
        <CartoonText font="kuaile" size={78} color={PINK}>
          {tags[destIdx]}
        </CartoonText>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 11: RitualsSection (仪式感与惊喜)
export const RitualsSection: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "ritual", "memories");
  const getP = (i: number) => photos[i % Math.max(1, photos.length)] || "";

  // Photo appears via wipe right when "仪式感" appears
  const tRitualWord = c.B(at + 2);
  const photoWipe = clamp01((t - (tRitualWord - 0.15)) / 0.5);
  const s1 = c.B(at + 4);
  const s2 = c.B(at + 7);

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Left Centered Progressive Lines */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: "51%",
          transform: "translateY(-50%)",
          width: 900,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
        }}
      >
        <CartoonText font="kuaile" size={80} color={WHITE} wipe={wipeAt(t, t0, 0.75)} wipeDir="lr">
          {c.copy.ritualL1 || "谢谢你从开始到现在"}
        </CartoonText>
        <CartoonText font="kuaile" size={80} color={WHITE} wipe={wipeAt(t, c.B(at + 1), 0.45)} wipeDir="lr">
          给予的
        </CartoonText>
        <CartoonText font="kuaile" size={96} color={PINK} wipe={wipeAt(t, tRitualWord, 0.5)} wipeDir="lr">
          仪式感
        </CartoonText>
        <CartoonText font="kuaile" size={82} color={WHITE} wipe={wipeAt(t, c.B(at + 3), 0.65)} wipeDir="lr">
          {c.copy.ritualL3 || "哪怕不是节日也有惊喜"}
        </CartoonText>
      </div>

      {/* Right Photo: Wipe-in on "仪式感", then filmstrip cycle, feathered & jittering */}
      {t >= tRitualWord - 0.15 && (
        <FilmstripStage
          t={t}
          switchTimes={[s1, s2]}
          transDur={0.44}
          stepPx={840}
          box={{ x: 960, y: 110, w: 800, h: 820 }}
          renderSlide={(idx) => (
            <FeatheredPic
              id={getP(idx)}
              box={{ x: 80, y: 30, w: 640, h: 760 }}
              radius={36}
              feather={40}
              wipe={idx === 0 ? photoWipe : undefined}
              wipeDir="lr"
              jitter={{ t, seed: 30 + idx }}
            />
          )}
        />
      )}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 12: SeasonsPoem (四季诗意长句)
export const SeasonsPoem: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const lines = [
    c.copy.poem1 || "我们一起度过了许多个春夏秋冬",
    c.copy.poem2 || "我们一起成长 一起努力",
    c.copy.poem3 || "生活被这一个个瞬间点亮",
    c.copy.poem4 || "不知不觉我们早已是家人般的存在",
  ];

  const lineSizes = [78, 76, 76, 84];

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 44,
        }}
      >
        {lines.map((line, idx) => (
          <div key={idx}>
            <StayWipeText
              font="kuaile"
              size={lineSizes[idx] ?? 78}
              color={WHITE}
              wipe={wipeAt(t, c.B(at + idx * 2.1), 0.85)}
              wipeDir="lr"
            >
              {line}
            </StayWipeText>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 13: ProposalSection (求婚啦)
export const ProposalSection: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "proposal", "dating");
  const ph1 = photos[0] || "";
  const ph2 = photos[1] || ph1;

  const tTag = c.B(at + 2);
  const tSwitch = c.B(at + 6);

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Left Centered Progressive Text */}
      <div
        style={{
          position: "absolute",
          left: 140,
          top: "50%",
          transform: "translateY(-50%)",
          width: 660,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        <StayWipeText font="kuaile" size={62} color={WHITE} wipe={wipeAt(t, t0, 0.45)} wipeDir="lr">
          于是
        </StayWipeText>
        <StayWipeText font="kuaile" size={60} color={WHITE} wipe={wipeAt(t, c.B(at + 1), 0.65)} wipeDir="lr">
          我们决定共赴未来
        </StayWipeText>
        <div style={{ marginTop: 10 }}>
          <StayWipeText font="kuaile" size={72} color={PINK} wipe={wipeAt(t, tTag, 0.5)} wipeDir="lr">
            {c.copy.proposalTag || "「 求婚啦 」"}
          </StayWipeText>
        </div>
      </div>

      {/* Right Filmstrip Photos triggered when "求婚啦" appears */}
      {t >= tTag && (
        <FilmstripStage
          t={t}
          switchTimes={[tSwitch]}
          transDur={0.44}
          stepPx={860}
          box={{ x: 880, y: 100, w: 920, h: 840 }}
          renderSlide={(idx) =>
            idx === 0 ? (
              <FeatheredPic
                id={ph1}
                box={{ x: 140, y: 40, w: 620, h: 760 }}
                radius={36}
                feather={40}
                opacity={eOut3(ramp(t, tTag, tTag + 0.45))}
                jitter={{ t, seed: 40 }}
              />
            ) : (
              <FeatheredPic
                id={ph2}
                box={{ x: 30, y: 120, w: 860, h: 600 }}
                radius={36}
                feather={42}
                jitter={{ t, seed: 41 }}
              />
            )
          }
        />
      )}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 14: EngagementSection (我们订婚啦)
export const EngagementSection: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "engagement", "proposal");
  const ph1 = photos[0] || "";
  const ph2 = photos[1] || ph1;
  const ph3 = photos[2] || ph1;

  const tTag = c.B(at + 2);
  const tStage2 = c.B(at + 6);
  const tStage3 = c.B(at + 10);

  const wipeIn1 = clamp01((t - (tTag - 0.15)) / 0.45);

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Left Text */}
      <div style={{ position: "absolute", left: 90, top: "48%", transform: "translateY(-50%)", width: 780, display: "flex", justifyContent: "center" }}>
        <CartoonText font="kuaile" size={80} color={WHITE} wipe={wipeAt(t, t0, 0.75)} wipeDir="lr">
          在家人亲友的见证下
        </CartoonText>
      </div>

      {/* Right Photos triggered at "我们订婚啦" (Filmstrip transitions, Feathered, Jitter) */}
      {t >= tTag - 0.15 && (
        <FilmstripStage
          t={t}
          switchTimes={[tStage2, tStage3]}
          transDur={0.44}
          stepPx={800}
          box={{ x: 870, y: 95, w: 930, h: 740 }}
          renderSlide={(idx) => {
            if (idx === 0) {
              return (
                <FeatheredPic
                  id={ph1}
                  box={{ x: 95, y: 65, w: 740, h: 610 }}
                  radius={36}
                  feather={42}
                  wipe={wipeIn1}
                  wipeDir="lr"
                  jitter={{ t, seed: 50 }}
                />
              );
            }
            if (idx === 1) {
              return (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <FeatheredPic id={ph1} box={{ x: 35, y: 40, w: 415, h: 660 }} radius={32} feather={34} jitter={{ t, seed: 51 }} />
                  <FeatheredPic id={ph2} box={{ x: 480, y: 40, w: 415, h: 660 }} radius={32} feather={34} jitter={{ t, seed: 52 }} />
                </div>
              );
            }
            return (
              <FeatheredPic
                id={ph3}
                box={{ x: 65, y: 75, w: 800, h: 590 }}
                radius={36}
                feather={42}
                jitter={{ t, seed: 53 }}
              />
            );
          }}
        />
      )}

      {/* Bottom Right Tag */}
      <div style={{ position: "absolute", left: 870, top: 870, width: 930, display: "flex", justifyContent: "center" }}>
        <CartoonText font="kuaile" size={78} color={PINK} wipe={wipeAt(t, tTag, 0.5)} wipeDir="lr">
          {c.copy.engagementTag || "「 我们订婚啦 」"}
        </CartoonText>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 15: LicenseSection (我们领证啦)
export const LicenseSection: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "license");

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Date Top Left */}
      <div style={{ position: "absolute", left: 135, top: 75 }}>
        <CartoonText font="kuaile" size={62} color={WHITE} wipe={wipeAt(t, t0, 0.55)} wipeDir="lr">
          {c.copy.licenseDate || "2026年05月20日"}
        </CartoonText>
      </div>

      {/* 3 Portrait Feathered Photos appear first */}
      {[0, 1, 2].map((idx) => {
        const ph = photos[idx % Math.max(1, photos.length)] || "";
        const enter = eOut3(ramp(t, t0 + 0.2 + idx * 0.3, t0 + 0.65 + idx * 0.3));
        return (
          <FeatheredPic
            key={idx}
            id={ph}
            box={{ x: 135 + idx * 560, y: 185, w: 530, h: 720 }}
            radius={34}
            feather={36}
            opacity={enter}
            scale={0.94 + 0.06 * enter}
            jitter={{ t, seed: 60 + idx }}
          />
        );
      })}

      {/* Bottom Right Title appears AFTER photos */}
      <div style={{ position: "absolute", right: 150, bottom: 52 }}>
        <CartoonText font="kuaile" size={70} color={PINK} wipe={wipeAt(t, c.B(at + 2.3), 0.55)} wipeDir="lr">
          {c.copy.licenseTitle || "我们领证啦"}
        </CartoonText>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 16: NewChapterSection (新篇章大婚纱照)
export const NewChapterSection: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "wedding");

  const lines = [
    { text: "今天", color: PINK, size: 68 },
    { text: "翻开属于我们人生的", color: PINK, size: 68 },
    { text: "新篇章", color: PINK, size: 68 },
    { text: "一路有欢笑也有磨合", color: PINK, size: 68 },
    { text: "感谢命运安排这场相遇", color: PINK, size: 68 },
    { text: "更感谢双方的父母", color: PINK, size: 70 },
    { text: "多年的养育与成全", color: PINK, size: 72 },
    { text: "往后余生 我们携手共度", color: PINK, size: 74 },
  ];

  const photoEnter = eOut3(ramp(t, t0, t0 + 0.6));

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Left Large Feathered Wedding Portrait with subtle jitter */}
      <FeatheredPic
        id={photos[0] || ""}
        box={{ x: 105, y: 70, w: 820, h: 940 }}
        radius={40}
        feather={44}
        opacity={photoEnter}
        jitter={{ t, seed: 70 }}
      />

      {/* Right Centered Lines Progressive Reveal */}
      <div
        style={{
          position: "absolute",
          left: 960,
          top: "50%",
          transform: "translateY(-50%)",
          width: 880,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 26,
        }}
      >
        {lines.map((item, idx) => (
          <div key={idx}>
            <StayWipeText
              font="kuaile"
              size={item.size}
              color={item.color}
              wipe={wipeAt(t, c.B(at + idx * 1.15), 0.65)}
              wipeDir="lr"
            >
              {item.text}
            </StayWipeText>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 17: ThanksGuestsSection (感谢宾客)
export const ThanksGuestsSection: React.FC<PageProps> = ({ c, at, len }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;
  const exit = pageExit(t, c, at, len);

  const photos = listOf(c, "wedding");
  const ph1 = photos[1] || photos[0] || "";
  const ph2 = photos[2] || photos[0] || "";

  const p1In = eOut3(ramp(t, t0, t0 + 0.5));
  const p2In = eOut3(ramp(t, t0 + 0.4, t0 + 0.9));

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* Double Feathered Wedding Portraits */}
      <FeatheredPic
        id={ph1}
        box={{ x: 330, y: 95, w: 580, h: 740 }}
        radius={38}
        feather={40}
        opacity={p1In}
        jitter={{ t, seed: 80 }}
      />
      <FeatheredPic
        id={ph2}
        box={{ x: 1010, y: 95, w: 580, h: 740 }}
        radius={38}
        feather={40}
        opacity={p2In}
        jitter={{ t, seed: 81 }}
      />

      {/* Bottom Progressive Thanks Text */}
      <div style={{ position: "absolute", bottom: 68, width: "100%", display: "flex", justifyContent: "center" }}>
        <CartoonText font="kuaile" size={66} color={WHITE} wipe={wipeAt(t, c.B(at + 1.0), 1.4)} wipeDir="lr">
          {c.copy.thanksGuests || "非常感谢各位来宾 在百忙之中前来参加我们的婚礼"}
        </CartoonText>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Chapter 18: FinaleSpotlight (聚光灯尾声)
export const FinaleSpotlight: React.FC<PageProps> = ({ c, at }) => {
  const t = useT();
  const t0 = c.B(at);
  if (t < t0) return null;

  const photos = listOf(c, "wedding");
  const hero = photos[3] || photos[0] || "";
  const heroIn = eOut3(ramp(t, t0, t0 + 0.65));

  return (
    <AbsoluteFill>
      {/* Left Pink Progressive Text */}
      <div
        style={{
          position: "absolute",
          left: 180,
          top: "50%",
          transform: "translateY(-50%)",
          width: 780,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 50,
        }}
      >
        <StayWipeText font="kuaile" size={88} color={PINK} wipe={wipeAt(t, t0 + 0.25, 0.55)} wipeDir="lr">
          {c.copy.finaleL1 || "见证我们"}
        </StayWipeText>
        <StayWipeText font="kuaile" size={90} color={PINK} wipe={wipeAt(t, t0 + 0.85, 0.7)} wipeDir="lr">
          {c.copy.finaleL2 || "人生重要的时刻"}
        </StayWipeText>
      </div>

      {/* Right Soft-Feathered Spotlight Portrait */}
      <FeatheredPic
        id={hero}
        box={{ x: 1050, y: 80, w: 660, h: 900 }}
        radius={42}
        feather={44}
        opacity={heroIn}
        spotlight
        jitter={{ t, seed: 90 }}
      />
    </AbsoluteFill>
  );
};
