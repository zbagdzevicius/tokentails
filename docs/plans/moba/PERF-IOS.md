# Pawlegends on iPhone: why it overheats, and the fix plan (2026-11-09)

**Founder report:** "on iOS it's melting, literally": the phone gets hot while playing.

**Short answer.** No single feature is to blame. The phone renders **every frame of everything, all the time, at the
desktop Medium tier**: 60 fps in the match, but also 60 fps in the lobby, on the pause menu and behind the store.
Nothing caps the frame rate, nothing reacts to heat, and the tier logic cannot tell an iPhone from a desktop. On top of
that, three per-frame costs are bigger than they need to be on a phone: a full-screen 2D overlay canvas at twice the
3D canvas's resolution, a far forest of 79k triangles that is never culled, and avoidable main-thread work (a style
change every frame, forced layout reads, material program re-checks, 10–14 MB/s of garbage).

Heat is sustained power. The cure is to do less work each second: fewer frames where nobody needs them, less work per
frame on phones, and a governor that steps quality down **before** iOS throttles the chip.

Base: `origin/main` at `ee8258eb` (sim v16). The sim was not touched.

**Status (2026-11-09):** Phase 1 and most of Phase 2 are implemented on `perf/pawlegends-ios-thermal`. Before and
after numbers are in [§7](#7-after-the-fix-2026-11-09); what is still open is listed there.

---

## 1. How it was measured

| | |
|---|---|
| Host | MacBook Pro, Apple M3 Pro, macOS 26.2 (no iPhone attached, so no on-device thermals; see §6) |
| Build | `vite build` of `pawlegends/` (production bundle), served by `vite preview` |
| Browsers | Playwright 1.63: **WebKit** 2370 (Safari 27.2 engine, the closest to WKWebView) and **Chromium** 1248 with the real GPU (ANGLE on Metal) |
| Device profile | iPhone 15 Pro landscape: viewport 852×393 CSS px, DPR 3, touch, `isMobile` (Chromium) |
| CPU | Chromium runs with `Emulation.setCPUThrottlingRate 4` (a mid phone) unless marked "×1" |
| Play | A seeded played profile (match 4, no tutorial), Clem, auto tier. The joystick is held toward the enemy side with attack taps, so the hero walks into lane fights and teamfights. Windows: title screen 10 s, then 15 s windows at about 0:15, 1:30 and 2:45 into the match |
| Instruments | An init script wraps `requestAnimationFrame` (JS time per frame), every WebGL draw call (draws, triangles, shadow-pass draws via the bound framebuffer), texture and buffer uploads, every Canvas 2D call (per canvas), `AudioContext.create*`, timers, a `MutationObserver`, `performance.memory` per frame. Chromium adds CDP `Performance.getMetrics` (style, layout, script), `LayerTree` (composited layers, paint counts), a CPU profile, a sampling heap profile, and GPU time per frame from `EXT_disjoint_timer_query_webgl2` |

The harness is committed next to this file: [`benchmarks/perf-ios-measure.mjs`](benchmarks/perf-ios-measure.mjs)
(usage in its header). Re-run it after each fix in §5 and compare with the tables below.

---

## 2. What iOS gets today (code reading)

- **No device detection in the quality path.** `render/quality.ts` `startTier()`: URL `?quality=` → this session's
  remembered tier → otherwise **Medium plus an FPS probe**. `app/platform.ts` already knows `shellPlatform()` (`ios` /
  `mac`) and the iOS user agent is plain to see, but `quality.ts` reads neither.
- **The probe runs on the title screen.** It measures ~2 s after a 0.6 s warm-up, which is the lobby turntable
  (10 draws, 32k triangles). Any iPhone passes at 60 fps, so every iPhone plays the match on **Medium**: sun shadow
  map (1024²), hero outline hulls, the whole far forest, MSAA.
- **The governor reacts too late and only one way.** `QualityGovernor` steps down one tier when the 4 s average drops
  under 42 fps. An iPhone holds 60 fps until the chip is already hot and throttling; then it drops. It never caps the
  frame rate, never watches frame time headroom, never steps back up.
- **The tier is remembered in `sessionStorage`.** In the app that resets on every launch, so the probe and the
  governor start over each time, and a player's own Settings choice is also lost.
- **Configured but unused:** `QUALITY.*.fpsCap`, `QUALITY.*.dynRes` and `RENDER.dynamicRes` in
  `render/ppk/core/config.js` are read by nothing in `src/` (they came with the PPK lift).
- **DPR.** Medium and Low cap the 3D canvas at 1.25: the drawing buffer is 1065×491 = 0.52 Mpx on a phone whose
  screen is 2556×1179 = 3.0 Mpx. The 3D canvas resolution is already low; it is not where the heat comes from.
- **The frame loop never sleeps.** `App.frame()` requests the next frame unconditionally and, with no match, always
  calls `lobby.update()` + `gr.render()`. In a match, `MatchSession.frame()` renders even while paused.
- **Display rate.** WKWebView on iOS delivers `requestAnimationFrame` at 60 Hz by default, also on 120 Hz ProMotion
  phones (WebKit's "prefer page rendering updates near 60 fps"), and at 30 Hz in Low Power Mode. So 120 Hz is not the
  iPhone problem, but the loop has no cap: on a 120 Hz Android phone, a ProMotion Mac or any browser without that
  setting it renders every vsync (measured below: 380–620 fps uncapped).
- **`powerPreference: 'high-performance'`** (`render/renderer.ts`): no effect on iPhone; on the Mac app it picks the
  discrete GPU on dual-GPU Intel Macs.
- **No `backdrop-filter`** anywhere (0 elements in every window measured). The UI CSS already avoids it.

---

## 3. Measured numbers

### 3.1 Per window, Chromium on the GPU, CPU ×4, auto tier (it stays on Medium)

| Window | Rendered fps | JS per frame mean / p95 / max (ms) | Draws per frame (shadow pass) | Triangles per frame (shadow pass) | Script ms/s | Style recalcs/s (ms/s) | Heap alloc MB/s, GCs/s | Composited layers |
|---|---|---|---|---|---|---|---|---|
| Title (lobby) | 60 | 1.17 / 1.9 / 2.8 | 10 (1) | 31.8k (10.0k) | 73 | 60 (30.6) | 0.55, 0 | 10 |
| Match 0:15 | 60 | 5.58 / 6.9 / 15.3 | 52.8 (7.9) | 297k (35.7k) | 329 | 63 (17.0) | 11.0, 0.5 | 14 |
| Match 1:30 | 60 | 6.08 / 7.6 / 11.2 | 60.1 (9.9) | 307k (40.9k) | 356 | 63 (18.7) | 8.7, 0.5 | 26 |
| Match 2:45 (fights) | 60 | 8.66 / 10.7 / 12.7 | 65.0 (9.5) | 306k (38.9k) | 512 | 67 (18.9) | 10.2, 0.5 | 40 |

Same run, forced `?quality=low`: draws 32–38, triangles 130–137k (no shadow pass), JS 4.9–7.2 ms, script 287–430 ms/s.

### 3.2 WebKit (Safari engine), no throttle, auto tier (Medium)

| Window | Rendered fps | JS per frame mean / max (ms, 1 ms timer) | Draws (shadow) | Triangles (shadow) | Overhead 2D calls/s | Minimap 2D calls/s | DOM mutations/s | Audio nodes/s |
|---|---|---|---|---|---|---|---|---|
| Title | 59.2 | 0.57 / 2 | 10 (1) | 31.8k (10.0k) | – | – | 0.9 | 0 |
| Match 0:15 | 56.0 | 3.46 / **942** | 53 (8) | 295k (35.1k) | 2,104 | 3,366 | 66 | 6.1 |
| Match 1:30 | 60.2 | 1.58 / 5 | 62.8 (9.8) | 303k (39.8k) | 1,857 | 4,822 | 81 | 6.6 |
| Match 2:45 | 60.2 | 1.40 / 4 | 65.8 (9.6) | 308k (40.1k) | 2,035 | 5,353 | 76 | 6.6 |

WebKit agrees with Chromium on the render load. The 942 ms frame early in the match is a first-use stall (shader
compiles on first sight of an effect); it is a hitch, not heat, but it belongs in the same pass (§5, P2-6).

### 3.3 Uncapped: what the loop does with a faster display

Chromium, GPU, ×1, `--disable-gpu-vsync --disable-frame-rate-limit`:

| | Lobby | Match, Medium | Match, Low |
|---|---|---|---|
| Rendered fps | **621** | 381–434 | 539–579 |
| Heap alloc | 3.6 MB/s | 54–60 MB/s | 72–76 MB/s |

The loop renders every frame it is given, in menus too. Allocation scales with the frame rate, so it is per-frame
garbage: about **150–200 KB per frame**.

### 3.4 GPU time per frame (timer queries, M3 Pro GPU, ×1)

| Variant | Lobby | Match 0:30 | Match 1:45 | Drawing buffer |
|---|---|---|---|---|
| Medium (what iPhones get) | 0.75 ms | 1.36 ms | 1.15 ms | 1065×491 |
| Medium, MSAA off | 0.83 | 1.31 | 1.34 | 1065×491 |
| Low | 0.35 | 0.67 | 0.81 | 1065×491 |
| High | 0.62 | 1.43 | 1.50 | 1278×589 |

- **Low costs about 45% less GPU than Medium** in the match (and half in the lobby).
- **MSAA is free** on Apple's tile-based GPU (within noise). Do not trade it away first.
- The A17 Pro GPU has 6 cores against the M3 Pro's 18; at similar clocks expect roughly **3× these times on an iPhone
  15 Pro: ~3.5–4 ms per frame on Medium, ~2–2.4 ms on Low**, every frame, sustained. This is an estimate, not an
  on-device number.

### 3.5 Where the triangles go (one Medium match frame at ~0:40, 60 draws, 309k triangles)

| Triangles | Draws | What |
|---|---|---|
| **78.8k** | 1 | **Far forest** (`mapView.ts` `far-forest`): one `InstancedMesh`, 1,231 trees × 64 triangles. A single instanced mesh is never frustum-culled, so every tree is drawn every frame although the fixed camera sees a small part of the map |
| 28.5k + 28.5k | 2 | The merged map mesh, drawn lit and again into the shadow map |
| ~89k | 18 | 6 heroes × ~5k triangles, each drawn **3×**: lit, outline hull, shadow map (+5.4k for the self x-ray) |
| 12.0k + 12.0k | 8 | Minions (instanced), lit and shadow |
| 16.8k, 8.6k, 7.6k (+7.6k shadow) | 4 | Other merged map/structure meshes |

### 3.6 Calls into the GPU process per frame

WKWebView runs WebGL and Canvas 2D in WebKit's GPU process: every call is serialized and replayed there.

| | WebGL calls/frame | Canvas 2D calls/frame |
|---|---|---|
| Lobby, Medium / Low | 92 / 56 | 0 |
| Match, Medium | **584** (`uniformMatrix4fv` 86, `bindVertexArray` 80, `bufferSubData` 61, `bindTexture` 48, `useProgram` 44) | **163** |
| Match, Low | 399 | 159 |

### 3.7 Canvases (match)

| Canvas | Backing size | Pixels | Redraws |
|---|---|---|---|
| `#game-canvas` (WebGL2) | 1065×491 (DPR 1.25) | 0.52 Mpx | 60/s |
| `.pl-overhead` (2D, bars and names) | **1704×786 (DPR 2)** | **1.34 Mpx, 2.6× the 3D canvas** | 60/s: full clear + ~30–38 calls a frame |
| `.pl-minimap` (2D) | 224×224 | 0.05 Mpx | 60/s at **~85 calls a frame** (more calls than the overhead canvas) |
| Offscreen 2D (portraits, decals, sprites) | ≤ 2000×1200 | – | once (baked), not per frame |

On iOS a 2D canvas is drawn by CoreGraphics on the CPU into an IOSurface, then composited. Clearing and redrawing
1.34 Mpx 60 times a second is ~320 MB/s of memory traffic before anything is drawn.

### 3.8 Compositing (Chromium `LayerTree`, match at 2:20)

37 composited layers (10 at the title, 14 at 0:20). Full-screen ones: the root, the WebGL canvas, the overhead canvas,
`.pl-touch` (the touch layer, 852×393), `.pl-lc-dead` (death veil, **repainted 173×**), `.pl-flash`, `.pl-ult-vig`
(full-screen inset `box-shadow` blur, **repainted 587×** in two minutes). Plus **20 `.fx-dmg` damage-number nodes**
that keep `will-change: transform, opacity` while idle (a pool of 20), each its own layer, with
`-webkit-text-stroke` and `text-shadow` on phones.

The system composites at native resolution, 3.0 Mpx per full-screen layer, so 4–6 full-screen layers cost more
blending per frame than the whole 3D render (0.52 Mpx).

### 3.9 Main thread (Chromium CPU profile, ×1, 10 s mid-match)

Busy **115 ms/s** (11.5% of one M3 core, ~1.9 ms per frame): three.js render submission 36.6 ms/s, match code 23.4,
native/GC/style 22.7, game index 7.9, then:
- **`get clientHeight` 2.6 ms/s and `getBoundingClientRect` 2.0 ms/s**: layout reads every frame
  (`gameView.ts:1058` `pxPerMetre`, `matchSession.ts:1600` `hudRectsTick`, `minimap.ts:285`), which become forced
  synchronous style/layout because of the next item.
- **One DOM write every frame:** `div.pl-hud@data-phase` changes 60×/s (`ui/hud.ts:702` writes
  `this.root.dataset.phase = clock.phase` each frame even when unchanged). Every other HUD write is ≤ 1/s. This is the
  60 style recalcs per second in §3.1 (in the lobby it is the `lb-pulse` `box-shadow` animation instead).
- **`getParameters` + `getProgram` 3.2 ms/s** (and 1.1 MB/s of garbage): three.js re-derives material program keys
  every frame. That happens when one material is shared by objects that differ in a program-relevant way (instanced
  vs not, `receiveShadow`, skinned), so the key flips per draw. The programs are cached, the key building is not.

### 3.10 Garbage (sampling heap profile, 12 MB/s sampled)

| KB/s | Where |
|---|---|
| 2,215 | `MinionInstances.update` (`render/views/minionInstances.ts`: `for (const [id, p] of map)` entry arrays, per-minion object literals) |
| 1,124 + 180 | three.js `getParameters` / `getProgramCacheKeyParameters` (the program re-check above) |
| 1,074 | `Math.hypot` with 3+ arguments (allocates an arguments array) |
| 569 + 179 + 176 | `clearOfObstacles`, `spreadSideways`, `clearOf` |
| 524 | `SnapBuffer.sample` |
| 423 + 153 + 75 | three.js uniform uploads (`setValueM4/V3f/M3`) |
| 299 / 260 / 225 | `StructureView.update`, `HeroView.update`, `MatchSession.frame` |
| 195 / 192 | `Minimap.draw`, `Overhead.draw` |

### 3.11 The rest

- **Paused match:** still 60 fps and ~28 draws a frame after pressing pause; the code confirms it
  (`MatchSession.frame` → `GameView.update` → `gr.render()` at `gameView.ts:988`, unconditionally).
- **Audio:** the procedural music creates 5–18 Web Audio nodes a second (oscillators, gains, biquads) from a 60 ms
  `setInterval`; the `AudioContext` is never suspended on pause, in menus or when hidden.
- **Sim worker:** a headless match runs 11,038 ticks in ~1.9 s, about 0.15 ms a tick, so ~2–3 ms/s at 15 Hz.
  Negligible. **The sim is not a heat source and needs no change.**
- **Hidden:** headless browsers kept `visibilityState: visible` with another tab in front, so this was read from the
  code, not measured: rAF stops in a hidden page and iOS suspends a backgrounded app; the session pauses; the music
  interval and the `AudioContext` keep running.

---

## 4. Heat sources, ranked

The impact column estimates the share of sustained work a fix removes on an iPhone. It is reasoned from the numbers
above (GPU ×3 scaling, call counts, pixel counts), not measured on a device.

| # | Source | Evidence | Est. impact |
|---|---|---|---|
| 1 | **No frame pacing anywhere.** 60 fps forever in the lobby, pause menu, store and results; no cap above 60; no 30 fps option; nothing slows down when hot | §3.1 lobby 60 fps; §3.3 621 fps uncapped lobby, 381–434 fps match; §3.11 paused = 60 fps | **Very high** (a multiplier on everything). Menus/pause at 30: −50% there. A 30 fps step in the match under heat: −40–45% |
| 2 | **Phones get the desktop Medium tier.** No device detection; the probe measures the lobby; the governor waits for fps < 42; the tier resets every launch | §2; §3.4 Low = −45% GPU; §3.1 Low = −55% triangles, −40% draws; §3.6 −32% GL calls | **High**: ~1.5–2 ms GPU per frame on an iPhone, 185 fewer GPU-process calls per frame |
| 3 | **Full-screen overhead canvas at DPR 2, redrawn every frame, plus a 60 Hz minimap** | §3.7: 1.34 Mpx (2.6× the 3D canvas), ~120–160 2D calls a frame rasterized on the CPU; §3.8 one more full-screen composited layer | **High**: DPR 2 → 1.25 cuts the raster by 61%; minimap at 15 Hz removes ~65 calls a frame |
| 4 | **Far forest never culled** | §3.5: 78.8k triangles, 26% of the frame, every frame | **Medium**: −60–70k triangles a frame once chunked and culled |
| 5 | **Shadow pass + outline hulls draw heroes 3×** | §3.5: shadow pass 8–10 draws, 35–48k triangles, plus a 1024² depth render; hulls ~30k triangles | **Medium** (most of the Medium–Low gap together with #4) |
| 6 | **Main-thread waste**: style change every frame, forced layout reads, material program re-check | §3.9: 60 style recalcs/s; 4.6 ms/s of layout reads; 3.2 ms/s `getParameters` | **Medium–low** on the CPU (~0.3–0.5 ms a frame on a phone) and it removes jank |
| 7 | **Garbage: 10–14 MB/s** | §3.1, §3.3, §3.10 | **Medium–low**: steady GC work on the main thread and hitches |
| 8 | **Composited DOM layers and paint animations**: 20 idle `will-change` damage numbers, full-screen inset `box-shadow` flashes repainted hundreds of times, `lb-pulse` `box-shadow` animation in the lobby, a full-screen `.pl-touch` layer | §3.8, §3.1 (lobby style recalcs) | **Low–medium**: fewer full-screen layers to blend at 3.0 Mpx each; no CPU blur repaints |
| 9 | **Audio graph always running** | §3.11 | **Low** |
| – | Not sources | `backdrop-filter` (none), the sim worker, MSAA (free on Apple GPUs), the 3D canvas DPR (already 1.25) | – |

---

## 5. Fix plan

Founder rules hold throughout: no feature flags (every change is on by default), the fixed camera stays, the game
stays readable (hero outlines for the player's own hero, bars and names, telegraphs and minimap stay crisp). Nothing
touches `src/sim`, so no `SIM_VERSION` bump.

### Phase 1: quick wins (1–2 days, biggest heat drop)

**P1-1. Frame pacer in `App.frame()`** (`app/app.ts`).
- A pacer that skips rAF callbacks until the target interval has passed (with a 1–2 ms tolerance so a 60 Hz display
  never drops to 30). Targets: **match 60 fps** (cap, also on 120 Hz displays); **lobby, title, pick, results, store
  and any full-screen panel: 30 fps**; **pause menu: 30 fps** and only while something animates (otherwise render once
  and stop); the frame loop stays alive for input.
- `dt` keeps coming from real time, so animation speed does not change.
- Expected: the lobby goes from 60 to 30 renders a second (−50% there); a paused match likewise.

**P1-2. A phone tier policy** (`render/quality.ts`, `app/platform.ts`).
- Detect a phone: `shellPlatform() === 'ios'`, or an iPhone/iPad/Android user agent with a coarse pointer and a short
  side ≤ 500 CSS px.
- Phones **start the match on a Phone profile** instead of desktop Medium: Medium's look with the sun shadow map at
  512² updated every second frame, outline hulls on the player's own hero and enemy heroes only (allies and
  companions read by their rings), far forest at the Low half, particle budget at Low. If that is not enough on the
  device test, Low with the own-hero outline is the floor.
- **Probe in the match, not the lobby:** the first 4 s after the drop decide, using frame **time** (§P1-3), not the
  title screen.
- **Remember the tier and the Settings choice in `localStorage`** (per device), not `sessionStorage`. A manual Settings
  choice is never overridden upward; the thermal governor may still step it down and says so in Settings.

**P1-3. A thermal governor that acts before iOS throttles** (`render/quality.ts` `QualityGovernor` replaced).
- Inputs: the frame interval and the **JS time of the frame** (both already measured in `App.frame`), plus the iOS
  thermal state when the shell provides it (P2-7).
- Steps, one at a time, cheapest visual loss first:
  1. shadows off (blob shadows stay), far forest half;
  2. overhead canvas DPR 1.0, minimap at 10 Hz, particle budget Low;
  3. Low tier (outline only on the own hero);
  4. **30 fps cap in the match**;
  5. drawing buffer DPR 1.0 (from 1.25).
- **Down** when the p90 frame interval exceeds 18.5 ms (at a 60 fps target) for 3 s, or JS time per frame exceeds
  8 ms for 3 s, or the thermal state reaches `serious`. **Up** one step only after 45 s clean (p90 < 15 ms and the
  thermal state `nominal`/`fair`), at most once a minute, and never above the step reached after a `serious` event in
  this session. No bouncing.
- The `?perf=1` readout shows the governor step and the reason for the last change.

**P1-4. Overhead and minimap canvases** (`ui/overhead.ts`, `ui/minimap.ts`).
- Overhead backing store at `min(devicePixelRatio, 1.5)` on phones (1.25 when the governor asks); text stays legible
  at 1.5 on a 3× screen at these sizes. −44% to −61% pixels.
- Minimap redraws at **15 Hz** (the sim tick rate) plus at once on a ping or an event; between draws it keeps its
  last image. The overhead canvas stays per frame (bars follow moving units) but skips frames when the view did not
  change (paused, dead camera).

**P1-5. Main-thread fixes.**
- `ui/hud.ts:702`: write `data-phase` only when the phase changes. Audit the other per-frame `dataset`/`style` writes
  in `hud.update`, `stripUpdate`, `objStrip` the same way (write on change).
- Cache layout reads on resize instead of reading them every frame: `gameView.ts:1058` (`clientHeight`/
  `clientWidth`), `matchSession.ts:1600–1610` (`hudRectsTick`, every few frames or on layout change),
  `minimap.ts:285`, `overhead.ts:385`.
- Expected: no style recalcs on idle frames; ~4–5 ms/s less layout on the M3, more on a phone.

**P1-6. Suspend when not needed.** On `visibilitychange` hidden and on the Capacitor app `pause` event: suspend the
`AudioContext`, stop the music interval, stop the frame loop; resume on return.

### Phase 2: cut the per-frame cost (2–4 days)

**P2-1. Cull the far forest** (`render/views/mapView.ts`). Split the 1,231 trees into ~16–24 spatial chunks, each its
own `InstancedMesh` with its own bounding sphere, so three.js frustum-culls them; drop trees the fixed camera can never
see at the phone framing. Expected −60–70k triangles a frame on every tier.

**P2-2. Cheaper shadows on phones** (`render/renderer.ts`). 512² map; `renderer.shadowMap.autoUpdate = false` with
`needsUpdate` every second frame (30 Hz shadows are not visible at this camera height); the static map mesh does not
cast into the shadow map (its self-shadowing is baked into vertex colour or a light map). Expected: the shadow pass
from ~40k to ~15k triangles at half the rate.

**P2-3. Stop the material program re-checks.** Give instanced and non-instanced users of a material (and
shadow-receiving vs not) separate material instances so three.js's per-draw key stays stable. Add a perf check that
counts `getParameters`-driven program lookups per frame (should be 0 in steady state).

**P2-4. Allocation pass** (target < 2 MB/s at 60 fps): `MinionInstances.update` (no `[k, v]` destructuring over Maps,
reuse per-minion records), replace 3+-argument `Math.hypot` with `Math.sqrt(x*x + y*y + z*z)` in per-frame code,
`clearOfObstacles`/`spreadSideways`/`clearOf` write into scratch objects, `SnapBuffer.sample` reuses its output,
`Overhead.draw`/`Minimap.draw` keep their plate and list arrays between frames.

**P2-5. DOM and CSS layers.**
- Damage numbers: `will-change` only while a node is live; idle nodes `display: none`. Or draw them on the overhead
  canvas (they already live in screen space next to the bars), which removes up to 20 layers in a teamfight.
- Full-screen flashes (`.pl-flash`, `.pl-ult-vig`, `.pl-lc-dead .veil`): replace the inset `box-shadow` blur with a
  pre-made radial-gradient image (or one shared vignette element) animated by `opacity` only, so it is never
  repainted.
- Lobby `lb-pulse`: pulse with `transform`/`opacity` instead of `box-shadow`.
- `.pl-touch`: size its layer to the joystick zone and the button cluster instead of the whole screen.

**P2-6. Warm the shaders before the drop** so the first fight does not stall (the 942 ms WebKit frame): compile the
match programs with `renderer.compileAsync(scene, camera)` behind the loading veil, including the skill and card
effects.

**P2-7. Native thermal signal (iOS app binary).** In `GameViewController.swift`, forward
`ProcessInfo.processInfo.thermalState` and `isLowPowerModeEnabled` to the page (a `window.__PL_THERMAL__` value
updated on `thermalStateDidChangeNotification` / `NSProcessInfoPowerStateDidChange` and a DOM event). The web bundle
uses it when present and falls back to frame times when not, so OTA bundles keep working on older binaries. This needs
an App Store binary update; everything else ships by OTA.

### Phase 3: structural (later, ~1 week)

**P3-1. Draw the overhead bars and names in WebGL** (instanced quads plus a glyph atlas): removes the full-screen 2D
layer, ~160 Canvas 2D calls a frame and its CPU raster.

**P3-2. Wire dynamic resolution.** `RENDER.dynamicRes` (slow 18 ms, fast 12 ms, 2 s window, 0.1 step) and
`QUALITY.*.dynRes` already exist unused: scale the drawing buffer between `dynRes.min` and 1.0 from GPU-bound frame
time, as the last governor lever before 30 fps.

**P3-3. Battery saver in Settings.** "Battery saver: 30 fps" as a visible choice (on by default when iOS Low Power
Mode is on, which already halves rAF). A player setting, not a feature flag.

**P3-4. Mac app:** `powerPreference: 'default'` on the Mac shell so dual-GPU Macs stay on the integrated GPU.

### Expected result

Phase 1 alone: the lobby and pause at half the work, phones on a cheaper profile (~−45% GPU, ~−30% GPU-process calls),
the overhead raster −44–61%, no per-frame style recalcs, and a governor that steps down before throttling. Together
with Phase 2 the match frame on a phone should drop from ~300k to ~120k triangles, from ~750 to ~450 GPU-process calls,
and from 10–14 MB/s to < 2 MB/s of garbage.

---

## 6. Verification

1. **Re-run the harness** (`benchmarks/perf-ios-measure.mjs`) after each phase and add a "after" column to §3.1–3.2.
2. **A perf e2e** (`tests/e2e/perf-ios.spec.ts`, landscape 852×393 DPR 3) that asserts: lobby ≤ 31 rendered fps;
   paused match ≤ 31 fps; no `data-phase` mutation on a steady frame; minimap redraws ≤ 16/s; overhead backing
   store ≤ 1.5× CSS px on a phone; far-forest triangles drawn ≤ 25k; heap allocation ≤ 3 MB/s.
3. **On a device (the gap in this report):** a 15-minute bot match on an iPhone 15 Pro (and one older phone, e.g. an
   iPhone 12) with Xcode Instruments (Activity Monitor + Energy Log, Thermal State track), before and after. Pass
   condition: the thermal state stays `nominal`/`fair` for 15 minutes at 60 fps, and frame pacing stays smooth.
   Record the numbers here.

---

## 7. After the fix (2026-11-09)

Commits on `perf/pawlegends-ios-thermal`: `a5884461` (phase 1), `aadfdf66` (phase 2), `c9830355` (governor tuning,
this section). Nothing in `src/sim` changed.

### 7.1 Before and after

The same harness as §3 (`benchmarks/perf-ios-measure.mjs`), run on the same Mac, on two production builds served
side by side: **before** = `d46c3510` (= `origin/main` game code), **after** = this branch. The harness now also counts
**drawn** frames (rAF ticks that issued a draw call) and per-drawn-frame GPU work, because the pacer keeps rAF at the
display rate but skips drawing. In both builds the iPhone-sized viewport (852×393, DPR 3, touch) is detected as a
phone (`data-phone="1"`) only by the new build. The governor stayed at step 0 in every window, so these are the plain
phone-profile numbers. "Pause menu" is the window after Esc opened the pause menu.

**Chromium, real GPU, CPU ×4 (a mid phone)**

| Window | Drawn fps | Draws / frame | Triangles / frame (shadow pass) | Triangles / s | Overhead canvas px | Minimap 2D calls / s | Script ms/s | Style recalcs / s | Composited layers | Infinite CSS anims | DOM mutations / s | Heap alloc MB/s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Lobby, before → after | 60 → **30** | 10 → 10 | 32k → 32k | 1.9M → **1.0M** | – | – | 74 → 42 | 60 → 60 | 10 → 12 | 4 → 4 | 0 → 0 | 0.58 → 0.39 |
| Match 0:15 | 60 → 60 | 52.9 → 47.5 | 293k (34k) → **174k (18k)** | 17.6M → **10.4M** | 1.34M → **0.75M** | 3,566 → 1,763 | 340 → 321 | 63 → **11** | 14 → 14 | 2 → **0** | 70 → **10** | 11.1 → 10.0 |
| Match 1:30 | 60 → 60 | 61.5 → 56.8 | 306k (41k) → **182k (21k)** | 18.3M → **10.9M** | 1.34M → 0.75M | 5,092 → 2,423 | 350 → 309 | 63 → **13** | 37 → **20** | 2 → 0 | 72 → 15 | 9.5 → 8.6 |
| Match 2:45 (fights) | 60 → 60 | 65.3 → 59.6 | 312k (42k) → **186k (21k)** | 18.7M → **11.1M** | 1.34M → 0.75M | 5,642 → 2,571 | 340 → 313 | 64 → **8** | 37 → **19** | 2 → 0 | 73 → 12 | 10.4 → 8.8 |
| Pause menu | 60 → **15** | 64 → 60 | 322k → 191k | 19.3M → **2.8M** | 1.34M → 0.75M | 5,723 → 2,538 | 327 → **92** | 60 → **0** | 37 → 21 | 2 → 0 | 60 → 0 | 10.1 → **2.4** |

**WebKit (Safari engine), no throttle**

| Window | Drawn fps | Draws / frame | Triangles / frame (shadow pass) | Triangles / s | Overhead 2D calls / s | Minimap 2D calls / s | DOM mutations / s | JS ms per drawn frame |
|---|---|---|---|---|---|---|---|---|
| Lobby, before → after | 60 → **30** | 10 → 10 | 32k → 32k | 1.9M → **1.0M** | – | – | 0 → 0 | 0.36 → 0.50 |
| Match 0:15 | 60 → 60 | 53.1 → 47.7 | 294k (35k) → **175k (18k)** | 17.7M → **10.5M** | 2,310 → 2,376 | 3,608 → 1,756 | 71 → 11 | 1.73 → 1.68 |
| Match 1:30 | 60 → 60 | 60.4 → 55.8 | 305k (40k) → **185k (21k)** | 18.4M → **11.1M** | 1,825 → 1,817 | 5,122 → 2,455 | 73 → 20 | 1.48 → 1.57 |
| Match 2:45 | 60 → 60 | 67.4 → 58.3 | 312k (41k) → **186k (21k)** | 18.7M → **11.2M** | 1,850 → 1,847 | 5,341 → 2,601 | 73 → 20 | 1.51 → 1.48 |

**Chromium, real GPU, uncapped (`--disable-gpu-vsync --disable-frame-rate-limit`), CPU ×1**

| | Lobby | Match (1:30) | Pause menu |
|---|---|---|---|
| Drawn fps, before → after | 638 → **30** | 365 → **52** (capped at 60; the harness floods rAF at ~8,000 Hz) | 504 → **15** |
| Triangles / s, before → after | 20.4M → **1.0M** | 113M → **9.7M** | 159M → **2.8M** |
| Heap alloc MB/s, before → after | 3.7 → 1.5 | 56.8 → 9.9 | 75 → 2.3 |

### 7.2 What the numbers say

- **GPU work per second in a match: −41%** (18.7M → 11.1M triangles a second at the same 60 fps), from the phone
  profile and the culled far forest: triangles per frame 306–312k → 182–186k, the shadow pass 41–42k → 21k on a
  512² map redrawn every second frame. Draw calls per frame 61–65 → 56–60.
- **Menus and pause: −50% and −85%.** The lobby draws 30 times a second instead of 60; the pause menu 15 instead of
  60; on a display faster than 60 Hz nothing renders above 60 (uncapped lobby 638 → 30 draws a second).
- **The 2D overlay rasterises 44% fewer pixels** (1704×786 → 1278×590 backing store, DPR 2 → 1.5), and the minimap
  issues half the Canvas 2D calls (15 redraws a second instead of 30, plus at once on a ping or a death).
- **Main thread:** style recalcs in a match 63 → 8–13 a second (the per-frame `data-phase` write), DOM mutations
  70 → 10–20 a second, script time −8–12% on the ×4 CPU, layout reads per frame gone (cached sizes).
- **Compositing:** 37–40 → 19–21 composited layers mid-match (idle damage-number layers, the hidden death veil and
  flashes), no infinite CSS animation in a match on a phone (2 → 0), no box-shadow paint animation in the lobby.
- **Garbage:** only −10–15% at 60 fps (10.4 → 8.8 MB/s): the Map entry arrays and lookups are gone, but most of the
  remaining churn is the per-frame `ViewFrame` objects, three.js program-key checks and uniform uploads (open, §7.4).
- The iPhone figure can only be estimated: §3.4's ~3.5–4 ms of GPU per Medium frame on an A17 Pro scales with the
  triangles and the shadow pass, so the phone profile should land near ~2.2–2.5 ms; menus at half or a quarter of that
  rate. This still needs the on-device check in §6.3.

### 7.3 What changed (code)

| Plan item | Where | What |
|---|---|---|
| P1-1 frame pacer | `render/perf/pacer.ts`, `app/app.ts` | Fixed-grid pacer: match 60, Battery saver or governor 30, menus 30, pause or full-screen panel 15. rAF stays alive; `dt` is real time |
| P1-2 phone profile | `render/perf/device.ts`, `render/quality.ts` | Phone = iOS shell, iPhone/iPad (incl. iPadOS "Macintosh" + touch)/Android UA, or a coarse pointer with a short side ≤ 500 px; never the Mac app. `?phone=1|0` forces it. Phone Medium: 512² shadows every 2nd frame, outline hull on own hero + enemies, half far forest, Low particle budget, overhead DPR 1.5, minimap 15 Hz. Phone Low keeps the own-hero outline |
| P1-2 tier memory | `render/quality.ts` | `localStorage` `{ tier, by: 'user' \| 'probe' }`; the FPS probe runs in the first match (after 8 s), never on the title |
| P1-3 thermal governor | `render/perf/governor.ts` | Steps: shadows off + half forest → overlay DPR 1.25, minimap 10 Hz, Low particles → Low tier → 30 fps → resolution ×0.85 → ×0.7 (dynamic resolution). Down after two bad 3 s windows (>10% missed refreshes or JS > ½ the frame budget), at once on iOS `serious`/`critical` (and never back above that floor). Up one step after 45 s clean and ≥ 60 s since the last change. Ignores the first 8 s of a match and stalls over 250 ms. The step is saved; the next launch starts one step cooler |
| P3-3 Battery saver | `render/perf/prefs.ts`, `ui/settings.ts` | "Battery saver (30 fps)" row in Settings, persisted. Turns on by itself when the 30 fps step has held a minute, iOS reports `serious`/`critical`, or Low Power Mode is on, unless the player chose it; Settings says when it was turned on for them |
| P1-4 overlay, minimap | `ui/overhead.ts`, `ui/minimap.ts` | Overhead backing store capped by the profile (2 desktop, 1.5 phone, 1.25 hot); minimap redraw rate by the profile plus dirty-on-event; size re-read on `ResizeObserver` or once a second |
| P1-5 main thread | `ui/hud.ts`, `render/gameView.ts`, `render/renderer.ts`, `render/perf/viewport.ts` | `data-phase` and cooldown/charge CSS variables written on change only; `pxPerMetre` uses the renderer's cached CSS size; the overhead reads a cached viewport |
| P1-6 suspend | `app/app.ts`, `audio/sfx.ts`, `audio/music.ts` | On `visibilitychange` hidden and the Capacitor App `pause` event: no rAF, `AudioContext.suspend()`, the music scheduler stops; all resume on return |
| P2-1 far forest | `render/views/mapView.ts` | 24 m chunks, one `InstancedMesh` each with its own bounding sphere (frustum-culled); Low/phone keep half per chunk |
| P2-2 cheaper shadows | `render/renderer.ts` | `shadowMap.autoUpdate` off on phones, redrawn every `shadowEvery` frames; 512² map |
| P2-4 garbage | `render/views/minionInstances.ts`, `render/interp.ts`, VFX | No Map entry arrays per minion, reused snapshot lookups, no 3-argument `Math.hypot` in per-frame VFX |
| P2-5 layers | `render/fx/DamageNumbers.js`, `ui/ui.css`, `render/anim/ultMoment.ts`, `render/fx/lifecycle.css`, `ui/lobby/lobby.css` | `will-change` only on live damage numbers; edge flashes and the ult vignette are radial gradients faded by opacity and hidden when idle; the death veil hides once faded; phones in a match run no infinite animation (ult/talent/charge/tip/Sudden Death cues keep a still glow); the lobby Play pulse is an opacity-only ring on phones |
| P2-6 shader warm-up | `app/app.ts` | `renderer.compileAsync(scene, camera)` behind the loading veil |
| P2-7 iOS thermal signal | `pawlegends-app/ios/App/App/GameViewController.swift`, `render/perf/thermal.ts` | The shell sets `window.__PL_THERMAL__ = { state, lowPower }` at document start and on `thermalStateDidChange` / power-state changes (`pl-thermal` event). Needs a new App Store binary; OTA bundles without it use frame times only. The Swift file parses (`swiftc -parse`) but was not built here |
| P3-2 dynamic resolution | `render/quality.ts`, `render/renderer.ts` | The governor's last two steps scale the drawing buffer (×0.85, ×0.7 of the tier DPR, floor 0.75) |
| P3-4 Mac GPU | `render/renderer.ts` | `powerPreference: 'default'` in the Mac app |
| `?perf=1` readout | `ui/perfReadout.ts` | Shows the pacer cap, governor step and reason, and JS ms per frame |

Unit tests: `tests/unit/perf-ios.test.ts` (phone detection, pacer at 60/120/600 Hz with jitter, governor steps,
hysteresis, hold, thermal floor, phone profile per step, persisted prefs).

### 7.4 Still open

- **On-device check (§6.3)**: a 15-minute bot match with Xcode Instruments on an iPhone 15 Pro and an older phone.
  Nothing in this section was measured on an iPhone.
- **P2-3 material program re-checks** and the rest of the garbage (`ViewFrame` objects per frame, uniform uploads):
  allocation is still ~9 MB/s at 60 fps.
- **P3-1** bars and names in WebGL (removes the 2D overlay canvas entirely).
- The lobby still has 4 infinite CSS animations (transform/opacity only, composited) and 60 style recalcs a second in
  Chromium from them.
- The perf e2e with pass limits (§6.2) is not written yet; the harness numbers above are the baseline for it.
- **Checks run:** `tsc` clean; vitest 2,143 passed, 4 failed, all 4 also fail on the base (`net-rejoin` perf-ff timing,
  `anim/root` timeout under parallel load, and the two trailer copy-gate tests). e2e subset (boot, lobby, perf,
  match-touch, minimap-touch, hud-area, store, juice, first-match) on SwiftShader: `first-match.spec.ts:37` fails on
  the base too. `match-touch.spec.ts:103` (Attack priority) failed 2 of 2 on this branch and passed 3 of 3 on the
  base. Both failures were the same kind: the game skipped a hero the test's model expected. The game's pick uses
  the touch layer's `deter` set and the lock, and the test's model has neither. This branch does not change that
  code, so a different match path probably exposes the gap. Not confirmed; worth a look before merging.
