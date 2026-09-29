# Showreel engine

This is a deterministic Canvas 2D renderer for the 15 s Catnip Heist promo. The output is 1920x1080 at 60 fps, 900 frames in total. The timing grid is 128 BPM: one beat is 0.46875 s, one bar is 1.875 s, and 32 beats fill exactly 15.000 s.

```
promo/
  index.html        canvas#c 1920x1080 plus the preview HUD
  engine.js         asset loading, the helper object E, scene compositing, global post FX
  render.mjs        Playwright renderer, static server and ffmpeg steps
  scenes/s1..s4.js  your scenes (ES modules); s1 bars 1-2, s2 bars 3-4, s3 bars 5-6, s4 bars 7-8
  assets/...        clips/, sprites/, audio/ (see the file contracts)
  out/              frames/NNNN.png, showreel.mp4, preview.mp4, contact.png
```

## Commands

```bash
cd catnip-heist/promo
node render.mjs --serve              # http://127.0.0.1:8123/index.html?play=1  realtime preview with audio
                                     # http://127.0.0.1:8123/index.html?t=5.2   exact still of one frame
node render.mjs --step 30 --contact  # every 0.5 s -> out/preview.mp4, plus out/contact.png (every 0.25 s)
node render.mjs --from 3.75 --to 7.5 # a range [from, to) at 60 fps -> out/preview.mp4
node render.mjs --contact            # contact sheet only (60 frames)
node render.mjs --verify             # determinism: renders t twice and in two pages, compares SHA-256
node render.mjs --clean              # full render: 900 PNGs -> out/showreel.mp4 (about 1 min on 6 workers)
```

Flags:

- `--workers N`: parallel pages (default 6).
- `--mb N`: global motion blur with N sub-frames. Also available as `?mb=N` in the browser.
- `--strict`: exit with code 2 if any scene threw.
- `--no-video`: render frames only.
- `--crf N`: encoder quality.
- `--quiet`: less output.

Frames are always named by their global 60 fps index, so a partial render only replaces those frames. The full encode is H.264 High, yuv420p, BT.709, CRF 16, preset slow, with the audio track as AAC 320k.

Preview keys: space plays or pauses, ←/→ steps one frame, shift+←/→ steps one beat, L toggles loop, M mutes, H hides the HUD. The query params `?from=&to=` set the loop range. In preview, clips decode at half resolution (`?pq=1` gives full resolution). If a clip frame has not decoded yet, the nearest decoded frame is shown instead. The renderer always waits for the exact frame.

## Scene contract

```js
// scenes/s2.js
export default {
  start: 3.75, end: 7.5,              // active while start <= t < end; you may extend up to 0.25 s past your bars
  async init(E) {},                   // optional, runs once after assets load (prebuild offscreen art here)
  draw(ctx, t, lt, E) {},             // t = global seconds, lt = t - start
  fx(t, lt, E) { return {}; },        // optional global FX request for this t (see "Global FX")
};
```

Scenes draw in file order (s1 first, s4 last), so the later scene is on top during an overlap. Before each `draw`, the context is reset to defaults: alpha 1, `source-over`, smoothing on. The transform is the global camera (shake and zoom). You do not need to clean up state after drawing.

**Determinism rule.** `draw` and `fx` must be pure functions of `t`. Do not keep state between frames, and do not use `Math.random`, `Date` or `performance`. Use `E.rand` and `E.rng(seed)` created inside the frame. Frames render out of order and in parallel pages. If a scene throws, the frame shows a red error box and `render.mjs` lists the error. With `--strict`, the run fails.

### Example scene

```js
export default {
  start: 1.875, end: 3.75,
  draw(ctx, t, lt, E) {
    const { W, H, BEAT } = E;
    ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);

    // hard cut on every beat: pick the shot
    const s = E.shot(lt, [0, BEAT, 2 * BEAT, 3 * BEAT]);
    const word = ['TWO CATS.', 'ONE HEIST.', 'SWAP', 'GO'][s.i];

    // sprite slams in with overshoot and turns white for a frame on impact
    const p = E.seg(s.lt, 0, 0.25, 'backOut');
    E.drawSprite(ctx, 'albertino', 'RUNNING', E.spriteFrame(t, 12), 560, 640, 10 * p, {
      anchor: 'feet', tint: { color: '#fff', amount: E.env(s.lt, 0, 0.05) },
    });

    // kinetic type, per-letter stagger
    E.drawText(ctx, word, 1240, 540, {
      size: 170, color: 'cream', tracking: 0.05, extrude: { depth: 10, color: 'plum', dark: 0.5 },
      perChar: ({ i, n }) => {
        const q = E.stagger(s.lt, i, n, { spread: 0.12, dur: 0.22, e: 'expoOut' });
        return { y: (1 - q) * 120, scale: 0.6 + 0.4 * q, alpha: q };
      },
    });
    E.shockwave(ctx, 560, 600, E.seg(s.lt, 0, 0.5), { radius: 420, width: 30, color: 'catnip', rings: 2 });
  },
  fx(t, lt, E) {
    const hit = E.cueEnv(t, 'kick', 0.08);
    return { shake: 14 * hit, aberration: 5 * hit, flash: 0.6 * E.env(lt, 0, 0.06) };
  },
};
```

## Global FX (`fx()` return keys)

The engine calls `fx` on every active scene and combines the results. After drawing the scenes it applies, in this order: pixelate, glitch, aberration, vignette, invert, flash, grain.

| key | combine | meaning |
|---|---|---|
| `shake` | sum | Camera shake amplitude in px. Smooth perlin noise, with overscan so frame edges never show. `shakeFreq` defaults to 18 Hz. |
| `zoom` | product | Punch-in zoom of the whole frame, around the center |
| `rot` | sum | Frame rotation in radians |
| `aberration` | sum | RGB channel split in px. `aberrationAngle` is in radians. |
| `flash` | max | Full-frame flash, 0..1. `flashColor` sets the color. |
| `glitch` | max | Slice-displacement glitch, 0..1 |
| `invert` | max | Difference-invert, 0..1 |
| `pixelate` | max | Block size in px (>1 enables it) |
| `motionBlur` | max | Sub-frame samples (e.g. 6 for whip pans). Trailing shutter; `config.shutter` defaults to 0.5 frame. |
| `grain` / `vignette` | last wins | Override the defaults (0.05 / 0.35) |

## Helper object `E`

**Constants:** `W H FPS(60) DURATION(15) BPM BEAT BAR BEATS(32) BARS(8) TAU PI EPS`, plus `E.t` and `E.frame`, which hold the current time and frame index while a frame renders. Under motion blur, `E.frame` stays the frame's own index, so any jitter seeded by it stays stable across sub-frames.

### Math
- `clamp(v,a=0,b=1)`, `clamp01`, `lerp`, `invLerp`, `remap(v,a,b,c,d,clamp=true)`
- `fract`, `mod`, `smoothstep(a,b,v)`, `smootherstep`, `pingpong(t,len)`
- `lerpArr`, `dist`, `deg(d)`, `step`, `quantize(v,q)`

### Easing
Every easing takes `t` in 0..1. Available as `E.expoOut(t)` etc. or `E.Ease.expoOut`. `ease(nameOrFn)` resolves a name to a function.
- Penner set: `linear`; `quad`, `cubic`, `quart`, `quint`, `sine`, `expo` and `circ`, each with `In` / `Out` / `InOut`.
- `backIn/Out/InOut(t, s=1.70158)`
- `elasticIn/Out/InOut(t, amp=1, period=0.3)`
- `bounceIn/Out/InOut`
- `spring(t, freq=2.5, damp=7)`: damped cosine settling to 1. Here `t` is normalized progress.
- `bezier(x1,y1,x2,y2)` returns a CSS-style cubic-bezier function.
- Presets: `snap` (hard in-out, for whips), `punch` (fast overshoot), `anticipate` (small pull-back, then expo out).
- `Ease.steps(n)` is a factory: it returns a stepped easing.

### Timeline and beats
- `seg(lt, a, b, ease?)`: progress through [a, b], clamped 0..1, optionally eased. `segB(lt, beatA, beatB, ease?)` does the same with a and b in beats.
- `beatAt(i)`, `barAt(i)`, `beatOf(t)`, `beatIndex(t)`, `barIndex(t)`, `beatPhase(t)` (0..1 within the beat).
- `env(t, hitTime, decay=0.15)`: exponential decay that is 1 at the hit and 0 before it. `envAD(t, hit, attack, decay)` ramps up to the hit first. `envs(t, [hits], decay)` sums several.
- `pulse(t, {every=BEAT, offset=0, decay=0.12})`: a decaying pulse on a regular grid.
- `win(t, a, b, fadeIn, fadeOut)`: trapezoid visibility window.
- `keys(t, [[time, value, easeIntoKey?], ...])`: keyframes. Values can be numbers or arrays.
- `shot(t, cuts, end?)`: returns `{i, t0, t1, lt, p}`, the current shot in a list of cut times. A frame exactly on a cut belongs to the new shot.
- `stutter(t, fps=12)`: holds time on N fps for a pixel-art cadence.
- `stagger(lt, i, n, {start, spread, dur, e})`: per-item progress for cascades.
- Cues come from `assets/audio/cues.json`. If that file is missing, a synthetic 128 BPM grid is used: `kick` on every beat, `snare` on beats 2 and 4, `hat` on 8ths, `impact` on each bar.
  - `cuesOf(type)` and `cues()` list them.
  - `lastCue(t, type | [types])` and `nextCue(t, type)` find neighbors.
  - `cueEnv(t, type, decay=0.12)` gives a decaying envelope from the last cue.
  - `cuesIn(a, b, type)` lists cues in a range.

### Random and noise (all deterministic)
- `rand(...keys)` returns [0,1) for any mix of number and string keys, e.g. `rand('coin', i, 3)`.
- `randRange(a, b, ...keys)`, `randInt`, `randSigned` (-1..1), `pick(arr, ...keys)`.
- `rng(seed)` is a sequential generator with `.range`, `.int` and `.pick`. Create it fresh inside `draw`.
- `noise1(x, seed)`, `perlin1(x, seed)`, `noise2(x, y, seed)`, `perlin2(x, y, seed)`, `fbm1(x, seed, oct)`, `fbm2(x, y, seed, oct)`. All return about -1..1.

### Color
- `palette`: the game palette from sprites.json, e.g. `night plum grape lavender coin cream catnip conePatrol coneAlert alertRed vaultOpen rescueFlash meowRing`.
- Every color argument accepts a palette name or a hex value. `col(name)` returns the hex.
- `rgba(c, a)`, `mix(a, b, t)` (hex result), `shade(c, ±amt)` (toward white or black), `hsl(h, s, l, a)`, `hexToRgb`, `rgbToHex`.

### Assets and drawing
- **Sprites.** `drawSprite(ctx, sheetOrId, rowName, frameIndex, x, y, scale=4, opts)` draws a sprite with smoothing forced off. `frameIndex` loops unless `opts.clamp` is set.
  - `opts.anchor` is `'center'` (center of the row's pixel bounds, the default), `'feet'` (bottom of the bounds), or `[ax, ay]` as fractions of the 48px cell.
  - `opts` also takes `flip` (sprites face right), `rot`, `sx`, `sy`, `alpha`, `snap`, `blend`.
  - Effects: `tint: {color, amount}` (e.g. a white hit-flash), `silhouette: color`, `outline: {color, px}`.
- Sprite rows: cats have `SLEEP DIGGING GROOMING HIT IDLE JUMPING LOAF RUNNING SITTING WALKING`. Dogs have `CROUCHED DAMAGE DEAD JUMPING LYING RUNNING SITTING SNIFFING WALKING`.
- `spriteFrame(t, fps=12)` gives the frame index for time t. Lookups: `cats`, `dogs`, `cat(id)`, `dog(id)`, `sheetOf(id)`, `spriteRow(sheet, name)`. The `assets.sprites` field holds the raw sprites.json (heroes, specials, shelter, shelterDetail).
- **Images.** `drawImg(ctx, name | bitmap, x, y, {w, h, scale, anchor=[.5,.5], rot, alpha, smooth})` draws a named image; `img(name)` returns the bitmap. Names: `coin catnip heart paw logo base`.
- **Clips.**
  - `drawClip(ctx, clipName, clipTime, dx, dy, dw, dh, opts)` draws one gameplay frame. The frame is `floor(clipTime * fps)`, clamped (or looped with `opts.loop`).
  - `opts.fit` is `'cover'` (default), `'contain'` or `'stretch'`. For cover, `fx`/`fy` set the focus point (0..1), `zoom` is a punch-in, and `crop: [x, y, w, h]` (normalized) picks a region to fill the rect.
  - `opts` also takes `speed`, `alpha`, `smooth`. It returns the frame index used.
  - `clipInfo(name)` returns metadata, including the description with key moments. `clipDur(name)` gives the length. `clipFrameTime(name, fileNumber)` converts a 1-based file number (0001.jpg = 1, as the descriptions use) to clip time. The list is in `assets.clipList`.
- `cover(sw, sh, dw, dh, fx, fy, zoom)` returns a source rect. `contain(sw, sh, dx, dy, dw, dh)` returns a destination rect.
- Missing assets draw a magenta placeholder with a label instead of crashing.

### Text
- `drawText(ctx, str, x, y, opts)` returns `{width, height, left}`.
  - Defaults: `align: 'center'`, `baseline: 'middle'`, `font: 'display'`.
  - Fonts: `display` (Cat Paw, the game font), `ui` (Helvetica Neue), `heavy` (Arial Black), `condensed` (Avenir Next Condensed), `mono` (SF Mono / Menlo), or any CSS family.
  - Other opts: `size`, `weight`, `italic`, `color`, `alpha`, `blend`, `tracking` (em), `stroke` + `strokeWidth` (+ `strokeOnly`), `shadow` / `glow` as `{color, blur, x, y}`, and `extrude: {depth, dx=0.7, dy=1, color, dark}` for voxel depth (`dark` darkens layers going back).
  - `perChar(info)` animates letters one by one. `info` is `{ch, i, n, cx, w, width}`. Return `{x, y, rot, scale, sx, sy, alpha, color, stroke, skip}`, or `false` to hide the letter.
- `measureText(ctx, str, opts)` returns the width, including tracking.
- `scramble(str, p, seed, charset?)`: decode or glitch text that resolves left to right as p goes 0 → 1.
- `typewriter(str, p)`.
- `fontStr(opts)` and `FONTS` expose the font stacks.

### Masks and transitions
- `path.rect / roundRect / circle / ellipse / poly(pts) / diamond(cx, cy, w, h) / star(x, y, r, inner, points, rot) / halfPlane(angle, d)` add sub-paths.
- `mask(ctx, pathFn, drawFn, {invert})` clips drawing to a path.
- `wipe(ctx, p, drawFn, {angle})`: linear edge reveal. `iris(ctx, p, drawFn, {cx, cy, r})`. `diamondReveal(ctx, p, drawFn, {cx, cy, size, aspect})` for iso shapes.
- `slices(n, {angle, gap, x, y, w, h})` returns `[{pts, cx, cy, x0, x1}]` diagonal panel polygons. Use it with `mask(ctx, c => E.path.poly(c, s.pts), ...)`.
- `pixelDissolve(ctx, p, drawFn, {cell=24, seed, order: 'random' | 'radial' | 'left' | fn, mix})`: cells assemble as p goes 0 → 1.
- `fadeMask(ctx, drawFn, {x0, y0, x1, y1, stops: [[offset, alpha], ...]})`: soft gradient mask.

### Camera and motion
- `camera(ctx, {x, y, zoom, rot, cx, cy, shake, shakeFreq, seed, sx, sy}, fn)`: transforms around (cx, cy).
- `shake(t, amp, freq, seed)` returns `{x, y, r}`.
- `smear(ctx, t, (c, tt, k) => draw at time tt, {dt=1/30, samples=6, alpha, falloff})`: onion-skin trail through time.
- `dirBlur(ctx, fn, dx, dy, samples)`: directional blur of a static draw.
- `squash(vx, vy, k)` returns `{rot, sx, sy}` for stretch along velocity. `vel(fn, t)` gives the derivative.
- Real sub-frame motion blur is available per scene through `fx().motionBlur`.

### Particles (pure functions of t)
- `particles(seed, count, t, p => {...})`: `p = {i, n, u, t, r(k)}`, where `r(k)` is a stable random value per particle.
- `burst({seed, count, t, t0, x, y, speed: [a, b], angle: [a, b], gravity, drag, life: [a, b], size: [a, b], spin, delay})` returns the live particles `[{x, y, age, life, p, alpha, size, rot, r}]`. Motion is closed-form ballistic with linear drag.
- `stream({seed, rate, t, t0, t1, life, gravity, drag, spawn: (r, i) => ({x, y, vx, vy})})`: a continuous emitter.
- `ballistic(x0, y0, vx, vy, g, drag, age)`.
- `bezier2(p0, c, p1, u)` and `arcTo(p0, p1, u, height)` for coins flying into a counter.

### Shapes
- `shockwave(ctx, x, y, p, {radius, width, color, rings, gap, ease, fill})`
- `speedLines(ctx, t, {cx, cy, count, inner, outer, width, color, alpha, seed, fps})`: radial lines.
- `speedLinesDir(ctx, t, {angle, count, speed, length, width, color, alpha, x, y, w, h})`: parallel streaks.
- `star(ctx, x, y, r, {inner, points, rot, fill, stroke, lineWidth})`
- `isoGrid(ctx, {cx, cy, tile, cols, rows, color, lineWidth, alpha, fill: (i, j) => color, reveal})` with `isoToScreen(i, j, opts)`.
- `cone(ctx, x, y, angle, spread, length, {color, alpha})`: guard vision cone.

### Post effects (on what is already drawn on `ctx`, in screen space)
- `glitch(ctx, {amount, seed, slices, maxShift, blocks, region, colors})`
- `rgbSplit(ctx, px, {angle, region})` (alias `chromatic`). `rgbZoom(ctx, amount)` is a radial version.
- `zoomBlur(ctx, {cx, cy, strength, samples})`, `pixelate(ctx, size, region)`
- `scanlines(ctx, {alpha, spacing, thickness, offset})`
- `crt(ctx, t, {scan, roll, flicker, vignette, tint})`: the security-cam look in one call.
- `vignette(ctx, strength)`, `grain(ctx, amount, seed)`, `flash(ctx, a, color, blend)`
- `lightLeak(ctx, t, {seed, intensity, colors, speed})`
- `timecode(t)` returns `"00:00:05:12"`.

To apply an effect to a single element, draw it inside `layer(ctx, drawFn, {post: (lc) => E.rgbSplit(lc, 6), alpha, blend, filter})`. The layer inherits the current transform. For scratch canvases, `surface(key, w, h)` (also `pool.get`) returns an OffscreenCanvas with `.ctx`, and `snapshot(ctx, key, region)` copies the current pixels. The canvas `ctx.filter = 'blur(8px)'` also works, though it is slower.

## Page API (used by render.mjs)

| call | returns |
|---|---|
| `window.__ready` | Promise that resolves to `__info()` once assets and scenes are loaded |
| `window.__render(t)` | Synchronous draw. Clip frames that are not yet decoded fall back to the nearest decoded frame. |
| `window.__frame(t)` | Async exact draw: loads any missing clip frames and redraws |
| `window.__renderTo(t, url)` | Runs `__frame(t)`, then PUTs the PNG to `url` |
| `window.__hash(t)` | SHA-256 of the pixels at t |
| `window.__info()` | Loaded scenes and assets, warnings, errors |

Clip frames load on demand into an LRU cache of about 1.6 GB per page. The first frame of each clip is preloaded.
