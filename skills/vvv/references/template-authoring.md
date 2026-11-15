# Template authoring: details, tradeoffs and confirmations

Use this guide when creating a new template, turning a recreation into a reusable template, or substantially changing scenes, slots, artwork or typography. Every reference video and template has different pacing, holds, photo structure, visual craft and fonts. Do not copy one template's numeric recipe onto every film; instead, audit these four domains for the specific film and escalate ambiguous tradeoffs for human discussion and confirmation before guessing.

## 0. Audit vs ask: decision boundary

Separate objective quality checks from creative, structural, licensing or narrative choices:

- **Decide and fix yourself:** objective timing/layout bugs and technical failures (centering symmetric transition peaks on beats, eliminating overlapping inner wipes that fight the beat, adding subtle drift to prevent static holds from failing `STILL`, auditing zero-based photo indexes against slot counts, preventing multi-line reveal jumps via `visibility: "hidden"`, stripping cutout edge halos, keeping schemas and indexes synchronized).
- **Pause and discuss with the user (无法自决，需人工确认):** any choice that changes aesthetic feel, story grouping, photo workload, illustration vs editable-slot boundaries, open-source redistribution eligibility, or font identity. Group related open questions into one structured checkpoint (right after writing the page inventory or design plan, or before batch asset generation/code rewrites):
  1. State **what you observed** in the frames, assets, or code.
  2. Explain **why it is ambiguous or carries a tradeoff**.
  3. Propose **2–3 concrete options** with pros/cons and recommend one, then wait for confirmation before locking it into source or batch-generating assets.

| Domain | Always inspect | Fix autonomously | Escalate for human confirmation |
|---|---|---|---|
| Motion, holds & beats | Entrance peaks vs beat grid; hold motion in settled frames; overlapping wipes; low-coverage card pixels (`STILL`) | Center symmetric eases; strip competing inner fades; add subtle technical drift/glow to clear `STILL` | Reference holds still past limit or cuts off-beat (fidelity vs enhance); ambiguous low-fps transitions; pace or mood changes |
| Photo slots & playback style | Exact chapter photo counts & `0..N-1` bounds; slot story roles; container aspect vs subject orientation; 3-part playback style | Fix index wrapping bugs; sync `catalog`, fixture, `schema`, `index.json` & README; tune safe crop focus | Ambiguous chapter boundaries or slot counts (`N` vs `min..max`); repeating vs optional slots; container-vs-photo orientation clash; unclear frame/hold aesthetic |
| Illustrations & cutouts | Complexity & scale behavior; contrast against real canvas background; edge halos on dual backdrops | Draw crisp flat geometric accents as inline `<svg>`; calibrate ink luminance & pulse floors; defringe chromakey cutouts | Should landmarks/people/pets be editable photo slots or fixed artwork?; generate new demo assets vs extract existing MIT assets; sticker contour vs borderless cutout |
| Typography & glyphs | `font-sources.json` coverage & strict italic/weight errors; real test of CJK, `0–9`, `A–Z`, punctuation; reveal jumps & contrast halos | Fix `visibility: "hidden"` vertical jumps; refine `｜` line breaks & ink contrast halos; select closest supported packaged weight | Commercial/missing reference font; hollow/defective digits or missing characters -> pick among OFL swap, hybrid glyph pairing, private commercial `.ttf`, or hero SVG/PNG |

## 1. Photo motion, holds and beat alignment

1. **Audit entrance, hold and exit separately per scene.** Sample dense frames (`0.1 s` around cuts and stage switches) and record what moves at entrance, *during* the settled hold, and at exit. One film can mix full-bleed Ken Burns slides, multi-panel splits, sticker pops, and carousels; annotate each scene's actual behavior instead of assuming one rule fits all scenes.
2. **Place motion velocity peaks on the beat map.** Match every transition kind to [the beat alignment table](craft.md#land-the-change-on-the-beat): hard cuts peak at `0`; ease-out slides/wipes peak early; growth from a point peaks past midpoint; double exposures and symmetric ease-in-out reels/carousels peak at exact midpoint (`[sw - dur / 2, sw + dur / 2]`, never `[sw - dur, sw]`, which shifts peaks `-dur / 2` early). Remove redundant post-beat wipes inside already-moving reels, and write scene cues as whole-beat offsets (or re-calibrate `hits.json` in warped templates).
3. **Keep every hold alive—matching the template's style.** `check` flags holds where the `48x27` luminance grid stays nearly flat past `maxStillSeconds`. Choose hold motion that fits the scene (proportional scale push, subtle handheld drift, strip travel, count-up, ambient light/glow) and watch for **minimal/dark text cards**: small swaying corner accents over plain black or white leave >85% of pixels idle and fail `STILL` unless the core display element subtly scales or a soft breathing backdrop glow accompanies it. Keep `pageExit` overlaps short (`~0.15–0.18 s` for sharp beat cuts) when trailing fades soften adjacent hits.
4. **Confirm with the user when:**
   - The reference itself holds static past `maxStillSeconds` or lands transitions off-beat—confirm whether to stay strictly faithful or add hold motion / quantize cuts onto beats.
   - Low-framerate or blurry reference footage obscures how a transition enters/exits—present 2–3 motion treatments and recommend one.
   - Pacing changes (lengthened holds or different transition durations) alter emotional cadence or reading time.

## 2. Photo slots, contracts and playback style

1. **Verify slot semantics, bounds and flexibility.** Different videos require different structures (e.g. a fast 5-photo reel vs variable `1–37` galleries vs grouped story chapters). Define each slot's type (`single` or `array`), optional vs required cardinality (`min`, `count`, `max`), and `groups`, then audit every `photos[i]` / `getP(i)` call against `0 .. count - 1` so slot edits never silently wrap `% length` back onto wrong indices.
2. **Lock per-index geometry and framing headroom.** Mixing tall portrait arches/ovals (`w < h`) with wide landscape spreads (`w > h`) clips companions or tops of heads even under smart focus cropping. Aggressive masks (`borderRadius: "50%"`, oval lenses, tilted cards, hand-drawn `<clipPath>` arches) trim corners heavily: record each index's container aspect (`portrait` / `landscape` / `square`) and subject guidance in `catalog/<id>.json` (`hint`) and the template README, and verify demo fixtures match index by index.
3. **Annotate every photo entry's 3-part playback style.** Because photo treatment varies scene by scene, document all three dimensions in the recreation inventory ([recreation](recreation.md#3-write-the-page-inventory-required-before-any-code)), `catalog/<id>.json` (`hint`), and template README:

| Playback aspect | Example descriptors to specify per slot |
|---|---|
| Container & mask | Colored rounded border, feathered vignette, circle/oval/SVG arch clip, tilted Polaroid, white-outlined sticker cutout, borderless cutout, full-bleed |
| Hold motion | Slow Ken Burns push/pull (`zoom`), subtle handheld `jitter`, pan across wide frame, multi-panel hold, continuous strip drift, brief static hold (`< 2.5 s`) |
| Entrance & exit | Directional slide/wipe, centered `ease-in-out` carousel/filmstrip reel, spring sticker pop (`eBack`), scale dissolve, double exposure, hard beat cut |

4. **Confirm with the user when:**
   - Chapter boundaries, slot counts (e.g. whether a montage scene should hold fixed `N` or variable `min..max` photos), or which life events belong in each scene are unclear.
   - A slot count adjustment raises a question of hiding optional frames vs repeating earlier user photos.
   - Subject orientation clashes with reference layout boxes—confirm whether to reshape containers, crop tighter, or constrain slot inputs (`portrait` vs `landscape`).
   - Playback style on a scene could go two plausible directions (e.g. sticker cutout vs rounded card vs arched portrait frame).

## 3. Illustrations: SVG, rasters and user photo slots

1. **Choose the right medium per visual element:**

| Visual element | Preferred medium | Why & how to verify |
|---|---|---|
| Flat/two-tone graphics, clean geometry, UI accents, rhythmic doodles (hearts, sparkles, bursts, vinyl discs, arrows, plain borders) | **Inline animated React `<svg>`** | Resolution-independent across 540p/1080p/4K, lightweight, directly animated with `t`, zero alpha fringe |
| Painterly/watercolor/paper art, detailed architecture, decorative hero lettering | **Generated or licensed PNG** | Preserves texture, shading and complex detail that flat vectors lose |
| Real/illustrated person cutouts, props, pets on layered backgrounds | **Clean RGBA PNG cutout** | Check hair, clothing and limb edges; if `transparent` generation halos or leaves checkerboards, switch to solid contrasting chromakey (`#00FF00` opposing warm/pink/red wardrobe, `#FF00FF` opposing greens/blues) + HSV spill suppression + optional white sticker `drop-shadow` |
| Iconic landmarks, family/pet portraits, couple silhouettes in a reference | **Evaluate user `photo` slot vs fixed template asset** | Ask whether template buyers will want to swap these with their own memories or keep stylized demo props |

2. **Inspect on both neutral grid and real canvas backdrop.** Dim inks vanish on `#000`/`#08080A` dark scenes, pale yellow/white strokes fade on cream paper, and cyclic sparkles hitting opacity `0` read as missing frames (apply a visible pulse floor such as `min + range * pulse`). Semi-transparent grey/green/white cutout fringes hide on light checkerboards and glare on real dark or colored canvases—inspect composited frames directly on the target scene background before approving.
3. **Confirm with the user when:**
   - Ambiguous elements (hometown landmarks, pet cutouts, couple figures, family shots) could either be editable **user photo slots** or **fixed generated/extracted template illustrations**.
   - Building an openly redistributable (`MIT`) template requires deciding between extracting open-licensed repo assets vs generating new synthetic illustrations vs substituting simpler vector graphics.
   - Visual border/treatment choices matter creatively (white sticker contour vs borderless cutout, organic hand-drawn SVG vs crisp geometric vector).

## 4. Typography: glyph audit and missing styles

1. **Respect strict local font resolution.** `src/core/fonts.ts` (`fontFor`) throws immediately for any unregistered font key, and `selectFontFaces` throws if a requested style (such as `italic`) is absent from `font-sources.json` (only weights fall back within the same configured family). Never depend on implicit OS system fallback across environments.
2. **Test every actual character class used by the template.** Before locking any display, brush, or cartoon typeface, render sample lines containing real CJK ideographs (including uncommon surname/place characters), digits `0–9`, Latin uppercase/lowercase, and punctuation (`｜`, `—`, `·`, `:`, `/`). Catch hollow/outline numerals (a common pitfall in stylized cartoon faces such as packaged `ZCOOLKuaiLe`), missing punctuation, mismatched line metrics, and weight drops.
3. **Preserve layout stability and legibility across formats.** Never mount delayed lines conditionally inside centered stacks (`{t >= cue && <Line2/>}` shifts Line 1 upward mid-scene); keep every reveal row mounted in layout from frame 0 (`visibility: "hidden"` + wipe/fade). Author phrase-level `｜` breaks, hold visual scale hierarchy across resolutions (`540p` preview and `1080p` delivery), and protect colorful or thin script against busy photos or deep black with a subtle ink-tinted `textShadow` halo or soft scrim.
4. **Confirm with the user when fonts, styles, or glyphs are missing—choose among four explicit routes:**
   - **Route A — Swap or bundle an OFL open font (recommended for shared templates):** Choose the closest packaged family in `font-sources.json`, or bundle a compatible Google/OFL font via `scripts/prepare-fonts.mjs` (`npm run prepare-fonts` + `src/core/fonts.ts` `DEFS`).
   - **Route B — Hybrid character-class pairing:** Keep the display face for main CJK copy, and split unsupported glyphs or hollow digits (e.g. regex `/(\d+)/`) to a matched-weight solid open font aligned on baseline (optionally softened with light `-webkit-text-stroke` matching).
   - **Route C — Isolated private commercial font (private renders only):** When the user supplies a licensed `.ttf`/`.woff2` (e.g. inside a private project's `public/fonts/`), load it via `FontFace` + `staticFile` gated by `delayRender`/`continueRender`, exclude the font binary from commits and `.vvv` packages, and keep Route A/B open defaults on the shared template.
   - **Route D — Vector SVG / PNG decorative lettering:** For static hero titles with no dynamic edit need and no open font match, export clean vector/raster lettering while falling back to a packaged editable font whenever text props change.

## 5. Synchronization, licensing and release checks

When a template is created or updated, keep all coupled artifacts and gates clean before handoff:

1. **Metadata and schemas:** Sync `catalog/<id>.json` (`slots`, `min`/`count`/`max`, `hint`, `groups`, `shows`, `timeline.pages`, `pace` bounds, complete non-overlapping `arc`, `defaultProps`, `music`), update `examples/<id>-wedding.json`, regenerate `schema/<id>.json` (`npm run schemas`), refresh `index.json` (`python3 scripts/export-template-index.py`), and update the template's local `README.md`.
2. **Open-source boundary:** Keep personal projects (`wedding-*`, scratch exports), unlicensed music/video, and private commercial `.ttf` fonts out of `kits/remotion/public/`. Name open demo media cleanly (`public/photos/<template>-demo-*`), log dimensions/provenance/MIT status in `assets.json` and `ASSETS.md`, and keep external tracks listed as `download` in `public/music/sources.json`.
3. **Final checks:** Run `vvv.py check` on representative samples and final renders (`AUDIO`, `STILL`, `BEAT_SYNC`), inspect rendered contact sheets and cutouts on real backdrops ([review and handoff](review-handoff.md)), pass `npm run check` and repository Python tests (`tests/test_arc_style.py`, `tests/test_template_index.py`, `scripts/check-repository.py`), and verify packaging via `vvv.py pack` + `vvv.py verify`.
