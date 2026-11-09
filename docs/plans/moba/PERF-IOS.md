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
after numbers are in [§7](#7-after-the-fix-2026-11-09); what is still open is listed there. Iteration 2 (re-profile
of the build with champion identity, the champion browser and sim v18, plus three fix tracks) is
[§8](#8-iteration-2-2026-11-09).

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
| P3-3 Battery saver | `render/perf/prefs.ts`, `ui/settings.ts` | "Battery saver (30 fps)" row in Settings, persisted. Turns on by itself when the 30 fps step has held a minute, iOS reports `serious`/`critical`, or Low Power Mode is on, unless the player chose it; Settings says when it was turned on for them. The game's own saver ends when its cause has (no Low Power Mode, OS not hot, governor above the 30 fps step, which includes the next launch starting one step cooler), so one hot session never locks 30 fps for good |
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

### 7.4 Independent re-check (2026-11-09)

Re-measured with the same harness against a build of the base `d46c3510` (852×393, DPR 3, Chromium on the GPU with
4× CPU throttle; WebKit unthrottled; lobby 60 s in Chromium, 30 s in WebKit). The numbers above hold:

| | Base | Branch |
|---|---|---|
| Lobby frames/s (Chromium, WebKit) | 60, 60 | 30, 30 |
| Match tris/frame, shadow pass (Chromium) | 293–308k (34–41k) | 173–184k (18–21k) |
| Match tris/s (Chromium / WebKit) | 17.6–18.4M / 17.7–18.6M | 10.3–11.0M / 10.4–11.0M |
| Pixels shaded/s, 3D buffer + 2D canvases (match) | 112 Mpx | 77 Mpx (−31%) |
| JS ms per second, match (CDP ScriptDuration) | 340–358 | 257–276 (−23%) |
| Style recalcs/s, DOM mutations/s (match) | 63–65, 73–80 | 8–17, 13–26 |
| Overhead canvas | 1704×786 | 1278×590 |
| Pause menu frames/s, JS ms/s | 60, ~300 | 15, 76 |
| Hidden page (visibilitychange): rAF/s, GL draws/s, interval callbacks/s, audio | 60, 1,623, 16.6, running | 0, 0, 0, suspended; resumes on return |

Desktop 1440×900 is unchanged (phone 0, med, same canvas sizes). Fixes from this pass: the auto Battery saver now
ends when its cause has (above), and its 30-fps-for-a-minute trigger could never fire (the governor's own 30 fps step
already set `saver`); the loading spinner keeps turning on phones; `match-touch.spec.ts` Attack-priority model now
follows `attackPriority` (a hero in range, then a last hit, then a hero just past the range only when not under an
untanked tower) and the lock and Talk Back `deter` set, which the pick telemetry now exports. The earlier failures were
exactly the hero-past-range-behind-a-last-hit / under-a-tower case; with the new model that case passes. The iOS
project sets no `CADisableMinimumFrameDurationOnPhone` (WKWebView stays at 60 Hz on ProMotion phones) and the audio
session is `.ambient` with mix-with-others.


---

## 8. Iteration 2 (2026-11-09)

Founder request: "make another iteration of performance improvements". Iteration 1 (§7) is live. Since then the game
gained per-champion identity VFX and sounds, the champion browser with live skill previews, hold-to-target on touch and
sim v18. This section re-profiles that build, flags what got worse, ranks what is left and splits the fixes into three
tracks that touch different files.

### 8.1 How it was measured

| | |
|---|---|
| Builds | **current** = `origin/main` `9b0fa506` (sim v18); **base** = `31b2ed60`, the tip of iteration 1 (sim v16). Both `vite build --sourcemap`, served side by side, measured **at the same time in pairs** (the host was under heavy load, load average 30–60 on 12 cores) |
| Harness | New [`benchmarks/perf-ios-probe2.mjs`](benchmarks/perf-ios-probe2.mjs) (iPhone 15 Pro landscape 852×393, DPR 3, touch, Clem, auto tier = the phone profile). Counts every WebGL call on the game context, blended draws, program switches, programs linked after the drop and their defines, GPU time per frame (`EXT_disjoint_timer_query_webgl2`), rAF gaps over 50 ms with their time in the match, every Canvas 2D call per canvas, Web Audio node creation and live sources, DOM mutations by target. Chromium adds a CPU profile (self time mapped through the source maps to source files, then to the buckets below), a sampling heap profile that keeps collected objects (allocation sites), and CDP style/layout/layer metrics |
| Script | Title 4 s, **lobby** 10 s; **champion browser** (Change hero → the "i" on Clem → the Q clip autoplays) 10 s; close; Play; **match** windows of 15 s at 0:00, 1:00, 2:00 and 2:15 while the stick walks the hero into lane fights and the probe taps ATK and Q/W/E/R in turn; **pause** 8 s |
| Runs | Chromium on the GPU (ANGLE Metal), CPU ×4: 3 pairs, **medians** below. WebKit (Safari 27.2 engine), no throttle: 2 pairs. GPU time: 2 more Chromium pairs without the browser step (§8.4) |
| Medians | [`perf-ios-iter2-chromium.txt`](benchmarks/perf-ios-iter2-chromium.txt), [`perf-ios-iter2-webkit.txt`](benchmarks/perf-ios-iter2-webkit.txt), [`perf-ios-iter2-gpu.txt`](benchmarks/perf-ios-iter2-gpu.txt) (`perf-ios-probe2-agg.mjs` prints them) |
| Sim | `tools/headless-match.mjs`, 6 seeds Normal vs Normal, 1 process |

Caveats. The probe's own hooks cost ~0.33 ms per frame at ×4 (shown as its own bucket, equal in both builds). Two GPU
browsers ran at once on a loaded host, so absolute GPU milliseconds are inflated; compare columns, not with §3.4. The
base build has no champion browser, so that window has no base column.

**Correction to §7.** The iteration-1 harness counted only indexed draws into the shadow pass. The hero meshes are
non-indexed, so the pass was half-counted: it is **~87k triangles and 18 draws per shadow update** (every second frame
on phones), not ~40k. Per drawn frame that averages 39–43k triangles and 7.5–9.3 draws, in both builds. A per-frame
trace confirmed it (10 indexed draws with 43k triangles plus 8 non-indexed draws with 43k triangles, then a frame with
no shadow pass). `perf-ios-measure.mjs` now counts both.

### 8.2 Current vs iteration 1 (Chromium, GPU, CPU ×4, medians of 3; current / base)

| Window | Drawn fps | JS ms per drawn frame | CPU busy ms/s (profile) | GL calls / frame | Draws / frame (shadow) | Triangles / frame (shadow) | Blended draws (tris) | Heap alloc MB/s | Style recalcs/s | Layers | Audio nodes/s |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Lobby | 29.3 / 29.3 | 0.99 / 1.02 | 79 / 88 | 92 / 92 | 10 (1) | 31.8k (10.0k) | 2 (112) | 0.43 / 0.44 | 59 / 59 | 12 / 12 | 0 / 0 |
| **Champion browser + skill preview** | 29.5 lobby + **~60 preview** | 5.44 | **475** | 92 + preview | lobby 10, **preview 3,695 draws/s** | lobby 31.9k, **preview 10.7M tris/s** | – | **5.98** | **121** | **50** | **11** (sound is off) |
| Match 0:00–0:15 | 59.9 / 60 | 4.55 / 4.69 | – | 483 / 477 | 48.1 / 48.0 (7.5) | 175k / 175k (39k) | 9.6 / 9.6 (6.9k) | 10.2 / 10.6 | 28 / 29 | 14 / 14 | 7.8 / 7.3 |
| Match 1:00 | 58.8 / 58.8 | 4.99 / 4.82 | 446 / 419 | 549 / 540 | 56.1 / 55.9 (8.5) | 187k / 186k (43k) | 14.0 / 13.8 (7.4k / 7.1k) | 9.2 / 9.3 | 42 / 39 | 19 / 16 | **9.4 / 6.7** |
| Match 2:00 | 59.9 / 59.9 | 5.18 / 4.94 | – | 540 / 526 | 58.5 / 58.1 (9.1) | 187k / 187k (43k) | 15.2 / 14.2 (7.3k / 6.9k) | 10.0 / 9.2 | 44 / 42 | 19 / 16 | **13.0 / 7.2** |
| Match 2:15 | 59.4 / 59.4 | 5.34 / 5.36 | 470 / 465 | 523 / 535 | 59.1 / 59.8 (9.3) | 186k / 185k (43k) | 14.1 / 14.8 (7.0k) | 10.2 / 9.1 | 45 / 45 | 19 / 21 | 9.9 / 7.8 |
| Pause menu | 15 / 15 | 4.87 / 5.05 | – | 518 / 562 | 59 / 61.5 | 195k / 188k | 14 / 16 | 2.7 / 2.5 | 0 / 0 | 16 / 18 | 4 / 5 |

More, same runs (current / base):

| | Current | Base |
|---|---|---|
| Overhead 2D canvas, match | 1278×590 (0.75 Mpx), 60 redraws/s, 2,950–3,590 calls/s (49–60 a frame) | same |
| Minimap 2D canvas, match | 2,320–4,050 calls/s at 15 redraws/s: **150–270 calls a redraw** | 2,290–3,740 |
| Minimap while **paused** | **4,400–4,830 calls/s** (redraws on, nothing changes) | 4,530–4,790 |
| Program switches / uniform calls a frame | 37–39 / 104–112 | 37–39 / 104–110 |
| WebGL programs on the game context (whole run) | 94 | 71 |
| DOM mutations/s, match | 62–148 (top: `i.sweep@style` and `button.pl-tbtn@style`, **55/s each** while skills are on cooldown) | 62–142 (same) |
| DOM nodes in the match (CDP) | 666–870; **1,100–1,190 after one champion-browser visit** | 625–854 |
| Live audio sources, peak | 8 | 8 |

WebKit (no throttle, 2 runs): match JS per drawn frame 1.41–1.78 ms current vs 1.43–1.64 base; lobby 0.32–0.49 vs
0.33–0.34; **champion browser 2.24–2.27 ms per lobby frame** plus the preview's own loop (3,660–3,770 preview draws/s);
overhead canvas 3,000–3,600 calls/s, minimap 2,280–3,900 (paused 4,400–4,800), same in both.

**The match itself did not get heavier.** Every match column is within run-to-run noise of iteration 1 except audio
nodes (+30–80% in fights) and blended draws (+0.3–1.0 a frame). The new costs are outside the match: the champion
browser costs as much CPU as a live match.

### 8.3 Per-frame CPU (Chromium ×4, match 1:00 and 2:15, ms per drawn frame, median of 6 samples)

The ×4 throttle stands for a mid phone. Total busy **7.62 ms** current / 7.59 base (of a 16.7 ms frame).

| Bucket | ms / frame | What is in it |
|---|---|---|
| Browser work outside JS | **2.20** | style recalcs (42–45/s), layout (6–9/s), paint and compositing of 16–19 layers, Canvas 2D dispatch, GC glue (V8 `(program)`) |
| three.js render submission | **1.90** | `projectObject`, `updateMatrixWorld`, `multiplyMatrices`, frustum `setFromRotationMatrix`, `renderBufferDirect`, `setProgram` |
| WebGL calls (native) | 0.35 | ~540 calls a frame: `uniformMatrix4fv` 75, `bindVertexArray` 73, `bindBuffer`/`bufferSubData` 60 each, `bindTexture` 41, `useProgram` 38 |
| three.js uniforms / program keys | 0.24 / **0.18** | `setValueM4`, `refreshMaterialUniforms`; `getParameters` + `getProgram` re-derived every frame (§3.9, P2-3, still open) |
| Views (heroes, minions, towers) | 0.30 | `minionInstances.update`, `heroView.update`, `layoutBodies` |
| Render other (gameView, camera) | 0.31 | `GameView.update`, `animPost` |
| Animation | 0.17 | `chars/motion.ts` `composeBase`/`update` |
| Overlay canvases | 0.43 | Canvas 2D natives 0.24, `overhead.ts` 0.13, `minimap.ts` 0.06 |
| HUD, DOM, input | 0.50 | DOM natives 0.22 (`setProperty`, `getPropertyValue`, `toggle`, `getBoundingClientRect`, `clientHeight`), `hud.ts` 0.16, input 0.12 (hold-to-target included; base 0.13) |
| `matchSession.frame` | 0.18 | |
| Interpolation (`SnapBuffer.sample`) | 0.11 | |
| VFX and telegraphs / **identity VFX** | 0.10 / **0.04** | identity VFX are cheap on the CPU |
| GC (collector itself) | 0.07 | the allocation cost is mostly in the glue above |
| Host messages / audio JS | 0.04 / 0.02 | |
| Sim on the main thread | 0 | the sim runs in the worker |
| Probe hooks | 0.32 | measurement overhead, both builds |

**Sim worker:** v18 runs 74,824 ticks in 6.4 s, v16 69,750 in 5.9 s (headless, bot brains included): **0.086 vs 0.085
ms a tick**. Unchanged and small; the sim is still not a heat source.

### 8.4 GPU proxies

- **GPU time per frame** (timer queries, M3 Pro, two Chromium pairs without the browser step, paired): match p50
  **1.07–1.42 ms current vs 1.07–1.38 base**, p95 1.55–2.21 vs 1.55–2.20; lobby 0.37–0.42 vs 0.37–0.43. No regression.
- **Triangles:** 175–187k a drawn frame in a match, of which the shadow pass averages 39–43k (87k every second frame).
  Six heroes are drawn up to three times (lit, outline hull, shadow) and the hero meshes are non-indexed, so the
  shadow pass alone costs ~43k triangles of heroes plus ~43k of minions and map casters per update.
- **Draws:** 48–60 a frame (shadow 7.5–9.3), ~540 WebGL calls a frame, 37–39 program switches, 30–33 programs bound.
- **Blended (transparent) draws:** 9.6–15.2 a frame, 6.9–7.4k triangles: few triangles, but they are the screen-size
  quads (particles, nature accents, identity motifs, telegraphs, rings). Identity VFX added **+0.3–1.0 blended draws
  and +0.3–0.4k blended triangles** a frame in fights. The real cost is pixels (overdraw), which the harness cannot see;
  Track A adds an overdraw view to measure it.
- **Pixels a second:** 3D buffer 1065×491 (0.52 Mpx) + overhead canvas 0.75 Mpx, both at 60 Hz, + minimap 0.05 Mpx at
  15 Hz: **~77 Mpx/s**, unchanged since §7.4. The 2D overlay is still the largest surface drawn each frame, and on iOS
  it is rasterised on the CPU.
- **Programs:** 94 on the game context in the current build against 71 (identity materials, compiled behind the
  loading veil, so not a match cost).

### 8.5 Garbage (sampling heap profile incl. collected objects, match 2:00, current, KB/s; base in brackets)

Total **10.2 MB/s sampled** (9.3), `performance.memory` 9.2–10.2 MB/s (9.1–10.6), 0.4–0.5 GCs a second. Target < 2.

| KB/s | Site |
|---|---|
| **1,978** + 748 (`Math.hypot`) | `render/views/minionInstances.ts` `update` (1,928 + 684) |
| **731** + 128 + 143 (`join`) + 118 (`sort`) | three.js `getParameters` / `getProgramCacheKeyParameters` under `renderer.render`: the per-frame program-key rebuild (746 + 121 + 135 + 104) |
| 592 + 286 (`Math.hypot`) + 211 + 106 | `heroView.ts` `layoutBodies`, `spreadSideways`, `clearOf` (627 + 308 + 203) |
| 477 + 199 (`Map.set`) | `interp.ts` `sample`: a fresh `ViewFrame` and `ViewEntity` per entity per frame (450 + 175) |
| 344 + 139 | three.js uniform uploads `setValueM4`, `setValueV3f` (360 + 137) |
| 312 | `heroView.ts` `update` (231) |
| 262 | `matchSession.ts` `frame` (263) |
| 191 | three.js `applyBoneTransform` under `render`: a skinned mesh's bounds recomputed every frame (97) |
| 168 / 142 | `overhead.ts` `draw` / `minimap.ts` `draw` |
| 154 | `gameView.ts` `remember` (`for (const [id, w] of this.who)` entry arrays) |
| 116 | `chars/motion.ts` `update` |
| 30 | identity VFX (all 20 scripts together) |

### 8.6 Hitches

- **Chromium:** no long task and no rAF gap over 50 ms that is the game's own (the two gaps per run are the CPU
  profiler starting).
- **WebKit:** the 942 ms first-fight freeze of §3.2 is gone, but **four programs still link after the loading veil**,
  in every run of both builds: two `MeshLambertMaterial [USE_SHADOWMAP, USE_COLOR]` 0.1–0.5 s after the drop, and a
  skinned `ShaderMaterial [USE_SKINNING, USE_SHADOWMAP]` with its shadow-depth variant at **12.3–13.0 s**, the first
  lane contact (one base run also linked a skinned `MeshLambertMaterial` at 56 s). WebKit frame gaps at those moments:
  **118 ms and 165 ms** (current), 75 ms (base); other gaps of 102–186 ms appear at 21–56 s in both. Cause: `app.ts`
  starts `renderer.compileAsync()` and drops the veil 250 ms later without waiting for it, and the scene it compiles
  does not hold every skinned and shadow variant yet (most likely a hero rig that is hidden or not yet built at
  compile time; Track C confirms which).
- First ult: no separate hitch was seen in either engine (the ult programs are in the warm-up set).

### 8.7 DOM and CSS

- **Match:** style recalcs 28–45/s and DOM mutations 62–148/s, the same as the base. The steady source is the
  cooldown display: `ui/hud.ts:796` writes `--cd` on the slot's `i.sweep` and `input/touch/touchControls.ts:1367`
  writes `--cd` on the touch button **every frame while a skill cools down** (55/s each in fights). §7's 8–13 recalcs/s
  were measured with attack taps only, so no cooldown was running. `ui/abilityBar.js` already does this the cheap way
  (one CSS animation per cooldown start).
- Composited layers 14–19 (base 14–21). The damage-number pool keeps 20 DOM nodes.
- **Lobby:** 3 infinite CSS animations still drive ~59 style recalcs a second (base 4 animations): the largest lobby
  cost on the CPU (1.46 ms per lobby frame at ×4, more than the 3D turntable's 0.8 ms).
- **After a champion-browser visit** the match holds ~430 more DOM nodes (1,100–1,190 against 666–870 without a
  visit). Possibly detached nodes kept alive by a listener or the preview; not confirmed.

### 8.8 Audio (6-hero fights)

Node creation **9.4–13.0 a second current vs 6.7–7.8 base** (+30–80%), 2.3 sources started a second, peak 8 live
sources (the identity mix's voice cap holds). Each identity sound builds a `BufferSource` + `Gain` + `StereoPanner`;
the music still builds an oscillator and gains per note (2.3 oscillators and ~3.5 gains a second). Small next to the
render, but it is steady garbage in the audio thread.

### 8.9 Champion browser and skill preview (new since iteration 1)

The browser is a menu, and players may sit in it for minutes. It costs **as much CPU as a live match** (475 ms/s busy
at ×4 against 79 in the lobby and 446–470 in a match):

1. **The preview runs its own unpaced rAF loop** (`ui/preview/skillPreview.ts`): ~60 fps on a 60 Hz display and every
   vsync on a faster one, outside the frame pacer and the governor. 3,695 draws and **10.7M triangles a second**, as
   many triangles a second as the match (11M), for a 328×283 CSS px box.
2. **The lobby keeps drawing behind it** at 30 fps: the pacer's `covered` flag only knows app overlays
   (`app.ts:1663`), not `.pl-champ`.
3. **A full-screen `backdrop-filter: blur(3px)`** on `.pl-champ` (`champBrowser.css:6`) over a canvas that changes 30
   times a second: WebKit re-blurs the whole screen at native resolution each time.
4. The preview's HP bars are a second 2D canvas at DPR 2 (656×566) redrawn ~59 times a second; its damage numbers are
   the DOM pool (138 style mutations a second); 50 composited layers; 121 style recalcs a second; 7 infinite CSS
   animations; 6 MB/s of garbage.
5. **Bug: the "silent" preview plays the champions' identity sounds.** `mountSkillPreview` mutes by swapping
   `sfx.play` and `sfx.voice` for the frame, but identity sounds go through `sfx.playLayer`, which calls the private
   `start()` directly: 11 audio nodes a second with sound off, and the clip is audible in the menu.

### 8.10 Regressions since iteration 1

| Since iteration 1 | Effect | Severity |
|---|---|---|
| Champion browser + live skill preview | Menu at match-level CPU and triangles a second; lobby rendered behind it; full-screen backdrop blur; extra 2D canvas, DOM damage numbers, 50 layers | **High** (menu heat) |
| Preview mute misses `playLayer` | Identity sounds play from the silent preview | Bug |
| Champion identity sounds | Audio nodes +30–80% in fights | Low |
| Champion identity VFX | +0.3–1.0 blended draws, +0.3–0.4k blended triangles a frame; +23 programs compiled at load; CPU 0.04 ms a frame; garbage 30 KB/s | Low (overdraw not measured) |
| DOM after a browser visit | ~430 more nodes in the match | Low, to confirm |
| Hold-to-target, sim v18 | No measurable change (input 0.12 vs 0.13 ms a frame; sim 0.086 vs 0.085 ms a tick) | None |

Unchanged since iteration 1 and still open: the 2D overlay canvas, the program-key rebuild, ~9–10 MB/s of garbage,
the per-frame cooldown writes, the post-veil shader links, and the shadow pass at twice the size §7 reported.

### 8.11 Remaining heat and jank, ranked

Impact on an iPhone is reasoned from the numbers above, not measured on a device (§6.3 is still open).

| # | Source | Evidence | Est. impact |
|---|---|---|---|
| 1 | **Champion browser**: unpaced preview + lobby behind it + full-screen blur | §8.9: 475 ms/s CPU, 10.7M preview tris/s, 50 layers | **High** in menus: should drop to about the lobby's cost (~80–150 ms/s) |
| 2 | **2D overlay** (overhead canvas full-screen at 60 Hz; minimap 150–270 calls a redraw, redrawing while paused) | §8.2, §8.4: 0.75 Mpx CPU raster a frame on iOS, 3,000–3,600 + 2,300–4,800 Canvas 2D calls a second through WebKit's GPU process; 0.43 ms a frame at ×4 plus part of the 2.2 ms browser work | **High** on iOS (CPU raster + IPC), medium elsewhere |
| 3 | **Shadow pass**: 87k triangles every second frame, heroes non-indexed, static map casting | §8.1, §8.4 | **Medium**: about a quarter of the match's triangles a second |
| 4 | **three.js submission + ~540 WebGL calls a frame** | §8.3: 1.9 + 0.35 + 0.24 ms a frame at ×4; static objects' matrices updated every frame | **Medium** (CPU and GPU-process IPC) |
| 5 | **Garbage 9–10 MB/s** | §8.5 | **Medium–low**: GC work and the risk of a collection hitch in a fight |
| 6 | **Program-key rebuild every frame** | §8.3 0.18 ms a frame, §8.5 ~1.1 MB/s | **Low–medium** (P2-3 of §5, still open) |
| 7 | **Per-frame cooldown CSS writes** | §8.7: 55 + 55 writes/s, 42–45 style recalcs/s in fights | **Low–medium** (style + paint of the button cluster each frame) |
| 8 | **Shader links after the veil** | §8.6: 4 programs, 75–186 ms WebKit gaps at the drop and at first contact | **Jank** (not heat) |
| 9 | **Lobby idle**: 3 infinite CSS animations → 59 style recalcs/s | §8.7 | **Low** (menus) |
| 10 | Overdraw of blended VFX, identity motifs included | §8.4 (not measured) | Unknown until Track A measures it |
| 11 | Audio node churn | §8.8 | **Low** |

### 8.12 Fix plan: three tracks, disjoint files

Same rules as §5: the sim is not touched (`src/sim/**` belongs to no track; no `SIM_VERSION` bump), no feature flags,
the fixed camera stays, telegraphs, HP bars, names, skill VFX and champion motifs stay readable, desktop quality does
not change unless the new path is cheaper with no visible loss, tap-to-cast stays same-tick. A track that finds its fix
in a file another track owns sends that track the one-line change instead of editing it. Each track measures with
`perf-ios-probe2.mjs` against a base build of the same moment (pairs, medians of 3) and writes its numbers into §8.13.
Shared files no track edits: `src/sim/**`, `render/coords.ts`, `render/palette.ts`, `render/identity.ts`
(identity data), `data/**`, `net/**`, `host/**`.

#### Track A: GPU and overlay

Goal: no full-screen 2D canvas in a match, a cheaper shadow pass, dynamic resolution as a real lever, overdraw under
control.

1. **Bars and names off the full-screen 2D canvas.** Draw HP/shield bars, level chips and names with instanced quads in
   the WebGL scene (one draw for bars, one for text from a glyph atlas or SDF; an orthographic overlay pass after the
   scene, so no second canvas), reusing `overhead.ts`'s layout, declutter, edge pointers and HUD-rect avoidance
   unchanged. Fallback if the WebGL text is not crisp enough at DPR 1.25: keep names on a 2D canvas but redraw it only
   when a name, level or position bucket changes, and draw bars in WebGL. Target: 0 full-screen 2D canvases in a match
   on phones, ≤ 3 extra draws, names as readable as today (side-by-side screenshots at 852×393 DPR 3).
2. **Minimap:** batch by colour (one path per colour and shape bucket instead of per unit), cache the static layers
   (lanes, bushes, structures) in the background image, and do not redraw while paused unless dirty. Target ≤ 60
   Canvas 2D calls a redraw, ≤ 100 calls/s while paused.
3. **Shadow pass:** on phones the static map does not cast into the shadow map (blob or baked shadows), heroes cast
   through a low-poly proxy or a blob, and the map updates every 2nd frame at 512² (as now) or every 3rd when the
   governor asks. The per-view `setShadows` toggles in `heroView.ts` and `minionInstances.ts` are Track B's files:
   send B the change there. Target: ≤ 25k triangles a shadow update on phones (from 87k), desktop unchanged.
4. **Dynamic resolution as an early, continuous governor lever** (`RENDER.dynamicRes` exists): scale the drawing buffer
   between 0.8 and 1.0 of the tier DPR from GPU-time headroom before the 30 fps step, not only as the last two steps.
5. **Outline hull and material cost:** measure the outline hull per hero (draws, triangles, pixels); options: skip the
   hull for heroes further than N m from the player on phones, or a cheaper hull shader.
6. **Overdraw:** add a debug overdraw view (`?overdraw=1`, additive one-colour shader) and measure a 6-hero fight. Cap
   particle and identity-motif screen size and count on the phone profile where the view shows > 3× average overdraw;
   telegraphs and motif shapes keep their silhouettes.

Files owned by A: `ui/overhead.ts`, new `render/overlay/**`, `ui/minimap.ts`, `ui/minimapPrefs.ts`,
`render/renderer.ts`, `render/quality.ts`, `render/perf/governor.ts`, `render/perf/device.ts`,
`render/perf/thermal.ts`, `render/perf/prefs.ts`, `ui/perfReadout.ts`, `render/ppk/core/config.js`,
`render/views/mapView.ts`, `render/chars/index.ts`, `render/chars/charMaterial.ts`, `render/skillfx/**`,
`render/fx/natureFx.ts`, `render/fx/fun/**`, `render/fx/Particles.js`, `render/fx/Shockwaves.js`,
`render/fx/GroundDecals.js`, `render/fx/Telegraphs.js`, `render/anim/fxkit/**`, tests
`tests/unit/perf-overlay*.test.ts`.

#### Track B: CPU and garbage

Goal: < 2 MB/s of garbage in a 6-hero fight, no per-frame program-key rebuild, less three.js submission time, fewer
audio nodes.

1. **Allocation pass** (sites in §8.5): `minionInstances.update` (2.7 MB/s with `Math.hypot`; 2-argument `Math.hypot`
   still allocates in V8: use `Math.sqrt(x*x + y*y)`), `heroView` `layoutBodies`/`spreadSideways`/`clearOf` (scratch
   arrays sized once, no `.map`), `interp.ts` `sample` (double-buffered `ViewFrame` and pooled `ViewEntity` records
   instead of `{ ...e }` per entity per frame; check every reader that keeps a frame across frames before reusing),
   `matchSession.frame`, `heroView.update`, `chars/motion.ts`, `host/protocol.ts` `decodeSnap`, `input/navMirror.ts`.
2. **Program-key rebuild (P2-3):** find the materials whose program key flips per draw (shared between instanced and
   plain meshes, skinned and not, shadow-receiving and not, or `transparent` toggled by stealth/x-ray fades) with a
   dev-only counter around `WebGLPrograms.getParameters` by material name, then split them per variant or move the
   fade into a uniform. Target: 0 `getParameters` calls on a steady frame (it is ~1.1 MB/s and 0.18 ms a frame at ×4).
3. **Skinned bounds:** `applyBoneTransform` under `render` (191 KB/s) means a skinned mesh's bounding volume is
   recomputed every frame; give the rigs a fixed bounding sphere (or `frustumCulled` with a static sphere).
4. **three.js submission:** `matrixAutoUpdate = false` on static objects (map, structures, decor) with one
   `updateMatrix()` on change, fewer scene-graph nodes per hero (merge static accessories), and check the frustum
   culling of instanced groups.
5. **Audio:** reuse a small pool of `Gain` + `StereoPanner` voices for identity sounds and SFX (a new `BufferSource`
   is required per play, the rest is not), and render the music's notes from baked buffers or a reused oscillator
   bank. Target ≤ 5 nodes/s in a 6-hero fight.

Files owned by B: `render/interp.ts`, `render/views/minionInstances.ts`, `render/views/heroView.ts`,
`render/views/towerView.ts`, `render/views/companionView.ts`, `render/views/projectileView.ts`,
`render/views/pickupView.ts`, `render/views/rig.ts`, `render/views/models.ts`, `render/toon.js`,
`render/chars/motion.ts`, `render/chars/skeleton.ts`, `render/anim/` (except `fxkit/` and `ultMoment.ts`),
`render/ppk/**` (except `core/config.js`), `app/matchSession.ts`, `input/navMirror.ts`, `host/protocol.ts` (decode
only, no wire change), `audio/**`, tests `tests/unit/perf-alloc*.test.ts`.

#### Track C: hitches and DOM

Goal: no shader link after the loading veil, a champion browser that costs about what the lobby costs, no per-frame
DOM/CSS writes in a match, a quiet lobby.

1. **Precompile behind the veil:** keep the veil until `renderer.compileAsync(scene, camera)` resolves (with a time
   cap), after placing every hero rig of both teams, a minion of each variant, the companions and the FX pools
   (`meshFx`, `linger`, `ribbons`, identity motifs) visible for the compile, with shadows on so the shadow-depth and
   skinned variants link too. Target: 0 programs linked after the veil in the probe's `progNames` in both engines, no
   WebKit gap > 50 ms in the first 60 s.
2. **Champion browser and preview:** the preview goes through a pacer (30 fps, and it stops after a few loops or when
   the clip is off screen, as now); the lobby is `covered` while `.pl-champ` is open (render once, then nothing or
   15 fps); no `backdrop-filter` on phones (a solid dim instead); the preview's bars canvas at DPR ≤ 1.5 and redrawn at
   the preview's rate; no DOM damage numbers in the preview (or canvas ones); **the mute also covers `playLayer`**
   (fix the bug in §8.9); check the ~430-node DOM residue after closing. Target: browser ≤ 150 ms/s CPU at ×4 (from
   475), ≤ 2M preview triangles a second, ≤ 20 layers, 0 audio nodes with sound off.
3. **Cooldowns without per-frame writes:** `ui/hud.ts:796` and `touchControls.ts:1367` start one CSS animation per
   cooldown start (as `ui/abilityBar.js` does: `--cd0`, `--cdd`, a class) instead of writing `--cd` every frame.
   Same-tick tap-to-cast and hold-to-target are not touched (only the cooldown display code in `touchControls.ts`).
   Target: ≤ 10 style recalcs/s and ≤ 20 DOM mutations/s in a fight with skills on cooldown.
4. **Damage numbers and flashes:** the DOM pool (`render/fx/DamageNumbers.js`) keeps transform/opacity-only updates,
   drops `-webkit-text-stroke`/`text-shadow` on phones (baked outline font or a canvas sprite sheet), and writes
   nothing for idle nodes; check `lifecycle.ts` and `ultMoment.ts` flashes stay opacity-only.
5. **Lobby idle:** replace or stop the 3 infinite CSS animations while nothing changes (pause them when the lobby is
   idle for a few seconds, or run them on the canvas); target ≤ 5 style recalcs/s on the title screen.
6. **`gameView.remember()`** iterates `this.who` without entry arrays (154 KB/s; it sits in this track's file).
7. **Perf e2e** (§6.2, still unwritten): `tests/e2e/perf-ios.spec.ts` with the limits the three tracks reach.

Files owned by C: `app/app.ts`, `render/gameView.ts`, `render/effects.ts`, `render/perf/pacer.ts`,
`render/perf/viewport.ts`, `render/fx/DamageNumbers.js`, `render/fx/lifecycle.ts`, `render/fx/lifecycle.css`,
`render/fx/lifecycleHud.ts`, `render/anim/ultMoment.ts`, `render/lobby.ts`, `render/juice.ts`, `ui/hud.ts`,
`ui/abilityBar.js`, `input/touch/touchControls.ts` (cooldown display only), `ui/champBrowser/**`, `ui/preview/**`,
`ui/lobby/**`, `ui/screens.ts`, `ui/ui.css`, `ui/lol-hud.css`, `ui/feel.css`, tests `tests/e2e/perf-ios.spec.ts` and
`tests/unit/perf-dom*.test.ts`.

### 8.13 Results

To be filled by the tracks: the §8.2 table again (current build vs the build before the track), with the targets above.

#### Track A: GPU and overlay (2026-11-09)

Measured with `perf-ios-probe2.mjs`: **base** = `origin/main` `9b0fa506`, **current** = branch `perf2/a`. Both were
built at the same moment and run in pairs at the same time on a host at load average 11–30. Chromium on the GPU with
CPU ×4: 3 pairs, medians. WebKit: 1 pair. The medians are in
[`perf-ios-iter2-trackA-chromium.txt`](benchmarks/perf-ios-iter2-trackA-chromium.txt) and
[`perf-ios-iter2-trackA-webkit.txt`](benchmarks/perf-ios-iter2-trackA-webkit.txt). Values are base → current.

| Match window (Chromium ×4) | Early | 1:00 | 2:00 | 2:15 | Paused |
|---|---|---|---|---|---|
| Full-screen 2D canvas (overhead), calls/s | 3,538 → **0** | 3,006 → **0** | 3,504 → **0** | 3,037 → **0** | 757 → **0** |
| Overhead backing store rasterised a frame | 0.75 Mpx → **0** | same | same | same | same |
| Minimap, calls/s (calls a redraw at 15 Hz) | 2,296 → **396** (153 → **26**) | 3,391 → **548** (226 → **37**) | 3,888 → **603** (259 → **40**) | 3,914 → **632** (261 → **42**) | 4,016 → **0** |
| Triangles a frame | 174k → **140k** | 184k → **150k** | 188k → **152k** | 186k → **151k** | 191k → **156k** |
| Shadow-pass triangles a frame | 39.0k → **5.3k** | 42.2k → **8.8k** | 43.6k → **9.2k** | 42.9k → **9.8k** | 44.6k → **11.5k** |
| Draws a frame (in the shadow pass) | 48.1 → 49.7 (7.5 → 9.2) | 56.5 → 55.9 (8.5 → 9.6) | 59.2 → 59.8 (9.1 → 10.4) | 59.5 → 59.9 (9.4 → 10.9) | 59.5 → 60.5 |
| WebGL calls a frame | 483 → 492 | 550 → 537 | 553 → 553 | 543 → 534 | 520 → 532 |
| JS ms per drawn frame | 5.40 → 6.02 | 6.22 → 5.92 | 5.65 → 6.04 | 5.56 → 5.68 | 5.84 → 5.04 |
| CPU busy ms/s (profile) | – | 500 → 501 | – | 473 → 476 | – |
| Composited layers | 14 → 12 | 19 → 14 | 19 → 14 | 19 → 17 | 16 → 14 |

WebKit (1 pair, no throttle): the overhead canvas went from 3,000–3,550 calls/s to none, and the minimap from
2,300–4,650 calls/s to 396–642 (none while paused). Triangles a frame fell from 173–194k to 140–157k, and shadow-pass
triangles from 39–46k to 5.4–11k. JS per drawn frame did not change (1.6–2.0 ms in both).

**What changed:**
1. **Bars, names and arrows are drawn in WebGL** (`render/overlay/`: `quadBatch.ts`, `atlas.ts`, `glOverlay.ts`;
   `ui/overhead.ts`). Bars, frames, ticks and lines are quads in one batch. The lines are mitred and have an
   anti-aliased edge. Anything with text or curves (name pills, level numbers, crowns, chips, status icons, arrows,
   glyphs) is painted once with the same Canvas 2D code into a stamp atlas, keyed by what it shows, then drawn as a
   textured quad. All of it is one draw call over the scene, in the same rAF callback, so plates never lag their
   bodies. A steady frame paints no stamp and uploads no texture. Layout, declutter, edge arrows, HUD fades and every
   option the trailer uses are unchanged.

   The text is now rasterised at the 3D drawing buffer's DPR, about 1.25 on a phone (the canvas was 1.5). In
   side-by-side screenshots at 852×393 DPR 3 it reads the same.

   One visible difference: while the player is dead, the plates are desaturated with the rest of the game canvas by
   `html[data-pl-dead] #game-canvas { filter }` in `ui/lol-hud.css`, a Track C file.
2. **Minimap** (`ui/minimap.ts`). Unit, hero, Pudding, pickup and timer marks are cached sprites, one `drawImage`
   each. The cleared bushes, fallen towers, standing towers and cores are one layer, repainted only when one of them
   changes. A still frame, such as a paused match, is not redrawn. Minions are now drawn above the tower squares.
3. **Phone shadows.**
   - Match heroes cast through an ellipsoid of 80 triangles (`render/chars/index.ts`). Their skinned bodies are never
     culled and cost about 5k triangles each.
   - The forest and the jungle walls cast through one octahedron per canopy or rock, merged per 24 m tile so the
     sun's frustum culls them (`render/views/mapView.ts`).
   - The stand-ins are culled out of the match camera's pass, so they cost nothing on screen.
   - Casters before culling: 93k → 24k triangles. In the probe, the shadow pass is 5–11k triangles a frame, against
     the 25k target.
   - It costs about 1.5 more shadow draws a frame (the tiles).
   - Desktop and the lobby are unchanged.
4. **Dynamic resolution as an early lever** (`render/perf/governor.ts` `ResScaler`, applied in `render/renderer.ts` on
   phones).
   - Each 1 s window with more than 10% missed refreshes steps the drawing buffer down by 0.05, to a floor of 0.8. It
     reaches 0.8 before the step governor's first change, so sharpness goes before shadows do.
   - After 20 s clean it grows back, and only once no governor step is above its floor.
   - JS time does not move it.
5. **Overdraw view** `?overdraw=1` (`render/renderer.ts`). Every fragment that passes the depth test adds one step of
   red. `html[data-overdraw]` holds avg, p95, max and the share of pixels shaded more than 3 and 6 times.
6. **Outline hull, measured** (phone Medium, scope `key`, a live match): 4 hulls are drawn, costing 4 draws and
   20.7k triangles a frame (16% of the frame's triangles), against 37k for the hero bodies. No change was made. The
   next option is to skip the hull on heroes far from the player.

**Overdraw, measured.** The gallery (`gallery.html?overdraw=1&phone=1`, its own close camera, so the match-camera
numbers are still open) cycled each hero's moves at 852×393 DPR 3:

| Hero | Idle frame: avg, share > 3 | Worst move: avg, share > 3 |
|---|---|---|
| Clem | 1.61, 9% | 1.87, 11% (E) |
| Duchess | 1.79, 11% | **3.10, 41% (R)** |
| Avietė | 1.61, 9% | 1.78, 11% (R) |
| Cacklejaw | 1.73, 11% | 2.03, 16% (W) |
| Rocket | 1.66, 10% | 1.90, 11% (R) |

No move reached 3× the frame's average. Duchess's R reached 1.7×: its ground wash covers the lower half of the close
camera's view. I did not cap any VFX size or count. Next step: measure Duchess's R and a 6-hero fight in the match
camera with this view before capping anything.

**Not changed, and why.**
- **JS per frame did not go down in Chromium.** The overlay pass is a second `renderer.render` call (three.js
  submission +0.4 ms a frame at ×4). That replaces Canvas 2D work which Chromium rasterises on the GPU, so the saving
  shows on iOS, which rasterises 2D canvases on the CPU: 0.75 Mpx a frame and one composited layer less.
- **The `overheadDpr` setting** (`quality.ts`, `matchSession.applyPerf`) only applies when no renderer is live, as in
  unit tests.

**Checks.**
- `tsc`, `npm run build` and `npm run budget` pass. The budget is first-load JS 371.1 KB gzip, under 450.
- In `vitest`, all Track A tests pass: `tests/unit/perf-overlay.test.ts` and `perf-overlay-minimap.test.ts`.
- 8 other tests fail in this worktree:
  - The 2 copy-gate tests fail because `tools/copy-lint` has no `node_modules` here.
  - 6 are sim and animation timing or timeout tests, run under load: `perf-sim`, `determinism`, `net-rejoin perf-ff`,
    `sim-v10 SlotStats`, `skins-determinism` and `anim/root`.
  - None of these touches a Track A file.

#### Track B: CPU and garbage (2026-11-09)

Measured with `perf-ios-probe2.mjs` (Chromium on the GPU, CPU ×4, iPhone 15 Pro landscape, `SKIP_BROWSER=1`), the
base (`origin/main` `9b0fa506`) and the Track B build served side by side and run **in pairs at the same time**, 3
pairs, medians. The host was loaded by other agents' runs, so JS milliseconds are noise-level; garbage is not.

| Window | Heap alloc MB/s (base → B) | GCs/s | Sampled alloc MB/s | Audio nodes/s | JS ms per drawn frame | GL calls/frame |
|---|---|---|---|---|---|---|
| Match 0:00–0:15 (incl. load tail) | 10.8 → **7.7** | 0.5 → 0.4 | – | 7.7 → **5.9** | 6.24 / 6.46 | 489 / 483 |
| Match 1:00 | 8.9 → **4.5** | 0.5 → 0.3 | – | 7.4 → **5.2** | 6.22 / 5.95 | 523 / 538 |
| Match 2:00 | 9.6 → **4.4** | 0.5 → 0.2 | 9.8 → **4.4** | 8.6 → **5.0** | 6.29 / 6.06 | 533 / 541 |
| Match 2:15 | 9.3 → **3.9** | 0.5 → 0.2 | – | 7.8 → **5.1** | 6.20 / 6.14 | 537 / 537 |
| Pause | 2.6 → **1.1** | 0.1 → 0 | – | 4 / 4 | 6.07 / 6.02 | 498 / 519 |
| Lobby | 0.46 / 0.45 | 0 | – | 0 | 1.38 / 1.41 | 92 / 92 |

A Node harness (vitest, the real sim at 1:15–1:55, `SnapBuffer` + `MinionInstances` + `HeroView` per frame, sampling
heap profile incl. collected objects) gives **3.45 → 0.38 MB/s** for those three paths (−89%), and the old and new views
produce bit-identical instance matrices and anim attributes over 1,800 frames with hits.

Program-key rebuilds (a counting build of three.js, steady 15 s fight window): base **4 `getProgram` a frame**; Track B
**2**: the shadow pass's shared `MeshDepthMaterial` no longer flips between skinned, instanced, instanced-with-colour
and plain casters. The other 2 are Track A's (below); with that one-line change as well the count is **0.01 a frame**
(measured with both applied locally).

What changed (render and audio only; no sim change, no flag):
- `render/interp.ts`: `SnapBuffer.sample` reuses one `ViewEntity` record per id (a class with every `EntitySnap`
  field, absent optional fields `undefined`) and it is also the frame's `byId`; projectiles reuse records; the previous
  snapshot is looked up through stamped index tables instead of a Map rebuilt each frame (`Map.clear()` allocates a new
  table even when empty). Readers only ever keep the latest frame (gameView, director, `matchSession.frameNow`).
- `render/views/minionInstances.ts`: no `Math.hypot` (the builtin boxes its arguments), `pushOutDir` fills a passed
  record, and the per-minion instance matrix and `aAnim` values are written straight into the typed arrays (the same
  maths three.js runs; the calls were not inlined in this long loop and boxed every double argument).
- `render/views/heroView.ts`: `layoutBodiesInto` with scratch arrays (`layoutBodies` stays as the pure wrapper),
  pooled push-apart points, wall-cell records and `MotionInput`; the rig key string is built only when an input changes.
- `render/views/{heroView,minionInstances,towerView}.ts` + `rig.ts` `casterDepthMaterial`: skinned heroes, instanced
  minions and the instanced-with-colour tower debris cast through their own shared depth material.
- `render/views/towerView.ts`: reused footprint records, no entry arrays or closures per structure per frame.
- `app/matchSession.ts`: input `Unit` records pooled by id; `input/navMirror.ts`: `syncStructures` without a new Set and
  entry arrays per frame; `host/protocol.ts`: no closure per hero in `decodeSnap` (no wire change).
- `audio/sfx.ts`: a play builds only its `BufferSource`; the Gain (and StereoPanner when panned) come from a pool wired
  into the sfx bus (centred sounds still bypass the panner, so no −3 dB change). `audio/music.ts`: notes up to 1 s are
  rendered once through the identical graph in an `OfflineAudioContext` and replayed as one `BufferSource` (live
  synthesis until the bake is ready; pads stay live; hats alternate two baked takes).
- Tests: `tests/unit/perf-alloc.test.ts` (record reuse and field clearing, scratch layout equals the pure layout, depth
  materials, sfx chain pool, a baked note is one node).

Not done / for other tracks:
- **Track A (`render/views/mapView.ts`)**: `sceneryMat` is shared by the instanced `far-forest` and the merged plain
  meshes (`banners`, …), so it re-derives its program twice a frame. Give the far forest its own material:
  `const farMat = sceneryMat.clone();` before the chunk loop and `new THREE.InstancedMesh(farGeo, farMat, list.length)`.
  Measured locally with Track B: 4 → 0.01 `getProgram` a frame. Static map meshes are also the main candidates for
  `matrixAutoUpdate = false` (§8.12 B4); the views Track B owns move every frame.
- Skinned bounds: no per-frame `computeBoundingSphere` was seen on heroes in a match (only the rare `ghost` mesh); the
  191 KB/s in §8.5 is not reproduced (sampling noise or the preview).
- Left in the browser profile: `minionInstances.update` still samples ~0.55 MB/s in Chrome against 0.04 MB/s in the Node
  harness (the same V8), so the function probably runs in Maglev or deopts there: next step `--js-flags=--trace-deopt`
  with source positions. three.js `setValueM4`/`setValueV3f` (~0.5 MB/s), the remaining three.js render internals, the
  overlay canvases (Track A) and `gameView.update` (Track C).

#### Track C: hitches and DOM (2026-11-09)

**Measured:** `perf-ios-probe2.mjs`, the current `origin/main` build (`9b0fa506`, the base) against Track C, served
side by side and run in pairs at the same time: Chromium on the GPU, CPU ×4, 3 pairs; WebKit, 2 pairs. Table cells
are medians, base → Track C. The host's load average was 30–42, so compare the columns with each other only.

| Window (Chromium ×4) | CPU busy ms/s | Task ms/s | Style recalcs/s | Style ms/s | DOM mutations/s | Layers | Audio nodes/s | Heap MB/s |
|---|---|---|---|---|---|---|---|---|
| Lobby | 112 → **71** | 134 → 92 | 58.8 → **20.1** | 14.0 → 2.4 | 0.5 → 0.5 | 12 → 10 | 0 → 0 | 0.43 → 0.43 |
| Champion browser + skill preview | 530 → **263** | 550 → 280 | 121 → **59** | 26.6 → 7.0 | 143 → **0** | 50 → **29** | 10.9 → **0** | 6.0 → 3.2 |
| Match 0:00–0:15 | – | 423 → 403 | 27.7 → 21.1 | 19.5 → 10.3 | 62 → 35 | 14 → 14 | 7.8 → 7.8 | 10.4 → 10.0 |
| Match 1:00 | 479 → **453** | 494 → 464 | 38.4 → 28.0 | 38.7 → **17.2** | 140 → **67** | 16 → 20 | 7.9 → 8.0 | 9.2 → 8.8 |
| Match 2:00 | – | 523 → 457 | 46.3 → 32.3 | 40.2 → 19.8 | 155 → 73 | 21 → 16 | 11 → 14 | 10.3 → 9.6 |
| Match 2:15 | 506 → **441** | 512 → 446 | 39.9 → 28.9 | 33.8 → 16.6 | 120 → 63 | 21 → 19 | 8.2 → 8.6 | 10.0 → 8.8 |
| Pause | – | 113 → 109 | 0 → 0 | 0 → 0 | 0.2 → 0.2 | 18 → 16 | 5 → 4 | 2.7 → 2.6 |

| Also | Base | Track C |
|---|---|---|
| Skill preview draw rate | ~60 fps: 3,695 draws/s, **10.7M triangles/s** | 29.4 fps: 1,760 draws/s, **5.1M triangles/s** |
| Lobby frames while the browser is open | 29.4 a second | 1 (its last frame stays up) |
| Preview HP bars canvas | 656×566 (DPR 2) | 492×425 (DPR 1.5) |
| Running infinite CSS animations: title / browser | 3 / 7 | 1 (three pulses, then 0) / 1 |
| Programs linked after the veil, whole run (Chromium / WebKit) | 2–4 / 2–3 | **0 / 0** in every run |
| WebKit frame gaps over 50 ms | 0–2 a run (80–82 ms) | 0–1 a run (67 ms at 97 s, not a link) |
| WebKit JS per drawn frame: browser / match | 2.49 / 1.48–1.69 ms | 1.71 / 1.56–1.63 ms |
| Veil up after Play (dev build, M3 Pro) | 250 ms + fade | warm-up done in 0.4–0.9 s (Chromium), 0.5–1.2 s (WebKit); capped at 2.4 s |

The Chromium frame gaps at 60 s and 136 s in both builds are the CPU profiler starting (§8.6).

**What changed:**

1. **Warm-up behind the veil** (`render/gameView.ts` `warmup()`, `render/perf/pacer.ts` `warmMatch()`, `app/app.ts`).
   The veil now waits (capped at 2.4 s; the VS card and the countdown run under it, and the sim starts on "Ready!")
   until, once the roster is known and the first snapshot is drawn: a hero is built for every slot that has no rig
   yet (the enemies are hidden by the fog until first contact), every hidden object (FX pools, rings, pickups) is
   shown for one synchronous block while `compileAsync` queues its programs, the towers' and cores' see-through
   variant is queued too, one dash afterimage is spawned, and once the programs are ready one frame is drawn with a
   fresh shadow map (the shadow-depth variants). Traced with a `linkProgram` hook, the programs that linked after the
   veil were: the towers' x-ray fade (`towerView.ts` flips `material.transparent` when a hero stands behind one: the
   two `MeshLambertMaterial [USE_SHADOWMAP, USE_COLOR]` 0.1–0.5 s after the drop) and the first dash afterimage
   (`anim/ghosts.ts`, the skinned `ShaderMaterial` and its pair at 12–13 s, first lane contact). The warm-up heroes
   stand 5 km up (never in a view), leave the scene, and keep their materials until the match ends, so three.js
   keeps their programs. If the cap is reached (SwiftShader under load), the veil goes and the shown-everything frame
   is skipped; programs then link in play as before. A tier change by the governor relinks programs by design.
2. **Champion browser** (`ui/preview/skillPreview.ts`, `ui/champBrowser/{cover.ts,champBrowser.ts,champBrowser.css}`,
   `app/app.ts`): the clip runs through a `FramePacer` at 30 fps; the three sandbox heroes outside the box are not
   drawn (hero meshes are never frustum-culled); the mute also swaps `sfx.playLayer` (**the identity sounds bug of
   §8.9 is fixed**: 0 audio nodes); its DOM damage numbers are gone (their pool sat in the page's full-screen layer
   under the panel: never seen, 143 style writes a second); bars at DPR 1.5; the lobby behind is drawn once and then
   not at all while the browser is open (redrawn on a resize); no backdrop blur on touch or phones (a deeper solid
   dim); the pick cards' foil glints under the panel pause.
3. **Cooldown sweeps** (`ui/cdSweep.ts`, `ui/hud.ts`, `input/touch/touchControls.ts`, cooldown display only):
   `--cd` is written only when the sweep moves one of 90 steps (4°), rounded up so it never shows ready early.
   **Not the CSS animation the brief asked for:** that was built and measured first (one registered `--cd`
   animation per cooldown, as `abilityBar.js` does). It cut the DOM writes, but Chromium then ran a style recalc at
   the display rate for each running sweep outside the JS frame: fight recalcs went from ~39 to ~69 a second and
   style time up ~25%, and WebKit's JS per frame rose from ~1.5 to ~1.9 ms. Steps write 7–15 times a second for
   a 6–12 s cooldown and stay in the JS frame.
4. **Boot splash removed** after its fade (`app/app.ts`): hidden, its two infinite animations ran for the whole
   session, in the lobby and in every match. The lobby's Play glow pulses three times on phones, then stops
   (`ui/lobby/lobby.css`).
5. `gameView.remember()` iterates `who.values()` (no entry arrays).

**Targets not reached:** browser 263 ms/s at ×4 (target ≤ 150) and 5.1M preview triangles a second (≤ 2M). The rest
is the clip itself: the preview draws the whole match map, whose forest, hedges, bushes and walls are single merged
meshes (28k, 17k, 9k, 8k triangles) that frustum culling cannot split, and three.js walks the full match scene each
frame (`projectObject`, `updateMatrixWorld`: ~40% of the clip's CPU). Hiding them changes the clip's look (checked
with screenshots). Next step for Track A (`mapView.ts`): chunk those merged meshes so they cull, which helps the
match too. Match style recalcs are 28–32 a second (target ≤ 10): the cooldown writes are now a small share; the rest
is other HUD updates not in this track.

**Not done:** damage-number text-stroke on phones (no measured cost, and the outline carries their readability);
the ~430-node "residue" after a browser visit does not look like a leak: 3 s into a match after a visit the document
holds 437 (base) and 440 (Track C) elements, while CDP's `Nodes` (which also counts detached nodes not yet collected)
reads 1,100–1,575 and moves by ±300 between runs of either build. Not checked with a heap snapshot.

**Tests:** `tests/unit/perf-dom.test.ts` (sweep steps, the veil's caps with a fake clock, the warm-up hero list, the
cover flag), `tests/unit/skill-preview.test.ts` (the identity layer stays silent, no damage-number layer),
`tests/e2e/perf-ios.spec.ts` (landscape: boot splash gone, ≤ 1 infinite animation on the title, browser without
blur, a still lobby and a clip at ≤ 30 fps, no programs linked after the veil when the warm-up finished, sweep writes
on steps only).

### 8.14 Iteration 2 combined (Tracks A + B + C merged, 2026-11-09)

`perf2/main` = Tracks A, B and C merged on `682c0211`, plus one cross-track fix: the instanced far forest gets its own
material (`mapView.ts`, Track B's finding: `sceneryMat` was shared with the merged scenery, so three.js switched its
program variant twice a frame). `origin/main` (`9b0fa506`) had nothing new to merge.

**How:** `perf-ios-measure.mjs` (now with `VIEWPORT=desktop`, `LOBBY_MS`, `WIN_MS`), base (`origin/main`) and combined
builds served side by side and run **in pairs at the same time**, 3 pairs each, medians. Phone = iPhone 15 Pro
landscape 852×393 DPR 3; Chromium on the GPU with CPU ×4, WebKit unthrottled. Desktop = Chromium 1440×900 DPR 1, no
throttle. Lobby 60 s idle; match windows 20 s each with the stick held (0:00, ~0:50, ~1:40 of play), 30 s apart.
Machine load average 26–64 throughout. Two harness notes: the scripted `.pl-pause` click does not pause, so the
"pause button" window is a fourth live window; the following Escape opens the pause menu, so the row named "paused"
below is the `match-hidden` window (the menu at 15 fps; headless tabs never report `hidden`). Hidden was checked
separately by forcing `visibilityState = hidden`: 0 draws and 0 audio sources a second in both builds.

**Phone, Chromium ×4 (base → combined):**

| Metric | Lobby (60 s) | Match 0:00 | Match ~0:50 | Match ~1:40 | Pause menu |
|---|---|---|---|---|---|
| Drawn fps | 30 → 30 | 60 → 60 | 59.9 → 60 | 59.9 → 59.9 | 15 → 15 |
| JS ms per drawn frame | 1.08 → 1.03 | 5.65 → 5.49 | 6.26 → 6.36 | 5.67 → 5.67 | 5.86 → **4.66** |
| JS worst frame, ms | 3.0 → 2.8 | 22 → **12** | 19.7 → 17.1 | 24.3 → 22.5 | 7.9 → 7.0 |
| Triangles a frame (k) | 31.8 → 31.8 | 174 → **142** | 181 → **151** | 181 → **150** | 193 → **157** |
| Shadow-pass triangles (k) | 10 → 10 | 39.4 → **6.1** | 42.3 → **9.1** | 41.5 → **9.0** | 45.6 → **10.7** |
| Draws a frame | 10 → 10 | 48.2 → 50.8 | 55.6 → 56.7 | 56.4 → 58.4 | 59 → 59.5 |
| 2D canvas calls/s (overhead + minimap) | 0 → 0 | 3,922 → **323** | 4,277 → **493** | 4,616 → **523** | 3,279 → **0** |
| Overhead 2D canvas calls/s | – | 2,073 → **0** | 1,782 → **0** | 2,007 → **0** | 617 → **0** |
| Programs linked in the window | 0 → 0 | 1 → **0** | 1 → **0** | 0 → 0 | 0 → 0 |
| Heap allocation MB/s | 0.24 → 0.24 | 10.1 → **6.4** | 9.6 → **3.9** | 8.5 → **3.8** | 2.7 → **0.75** |
| GC drops/s | 0.2 → 0.2 | 0.8 → 0.5 | 0.9 → 0.3 | 0.8 → 0.4 | 0.2 → 0 |
| Audio nodes/s | 0 → 0 | 6.2 → 5.1 | 16.8 → **4.3** | 9.5 → 5.6 | 5 → 4 |
| CPU script ms/s | 35.1 → 35.2 | 346 → 338 | 386 → 414 | 345 → 347 | 92 → **74** |
| CPU task ms/s | 106 → **60** | 417 → 403 | 467 → 492 | 467 → 479 | 121 → **98** |
| Style recalcs/s | 60 → **3.7** | 9.9 → 9.8 | 10.2 → 8.6 | 39.4 → 45.9 | 0 → 0 |
| Style ms/s | 16.5 → **0.56** | 3.76 → 3.21 | 4.48 → 3.97 | 17.1 → 18.0 | 0 → 0 |
| Composited layers | 12 → 10 | 14 → 12 | 20 → 17 | 20 → 17 | 18 → 14 |

The fourth live window (the scripted pause tap) reads like ~1:40: 2D calls 4,271 → 513, shadow triangles 41.1k →
8.4k, allocation 9.1 → 4.3 MB/s, style recalcs 12.1 → 5.9/s, JS 5.44 → 5.46 ms.

**Phone, WebKit (base → combined):**

| Metric | Lobby | Match 0:00 | Match ~0:50 | Match ~1:40 | 4th live window |
|---|---|---|---|---|---|
| Drawn fps | 30 → 30 | 59.2 → 59.9 | 53.2 → **56.7** | 57.9 → 58.4 | 59.4 → 59.8 |
| JS ms per drawn frame | 0.34 → 0.32 | 1.72 → 1.58 | 2.77 → **2.21** | 1.96 → 1.73 | 2.09 → 1.86 |
| JS worst frame, ms | 1 → 2 | 11 → 10 | **145 → 13** | 12 → 11 | 6 → 6 |
| Programs linked in the window | 0 → 0 | 1 → **0** | **13 → 0** | 0 → 0 | 0 → 0 |
| Shadow-pass triangles (k) | 10 → 10 | 39.8 → 6.1 | 34.1 → 9.3 | 0 → 9.5 | 0 → 8.2 |
| 2D canvas calls/s | 0 → 0 | 3,902 → **323** | 4,264 → **478** | 3,642 → **509** | 3,488 → **469** |
| Audio nodes/s | 0 → 0 | 6 → 5.1 | 7.9 → 4.3 | 7.6 → 7.1 | 12.2 → **4.5** |
| Drawing buffer (Mpx) | 0.52 → 0.52 | 0.52 → 0.52 | 0.52 → 0.42 | 0.52 → 0.33 | 0.52 → 0.33 |

In WebKit the base build hit a 145 ms frame (13 programs linked at the first fight) and its governor turned shadows
off for the rest of the match (shadow triangles 0). The combined build linked no program after the veil and kept
shadows on; under this machine's load its governor took the cheaper lever first, dynamic resolution, down to its
0.8 floor (0.33 Mpx). On a real phone that only happens after sustained missed frames, and it grows back after 20 s
clean.

**Desktop, Chromium 1440×900, no throttle (base → combined):** desktop draws the same scene (triangles 233k → 234k,
shadow triangles 80k → 80k, draws 58.7 → 59.7, buffer 1.3 Mpx); it is cheaper on the CPU:

| Metric | Lobby | Match 0:00 | Match ~0:50 | Match ~1:40 | Pause menu |
|---|---|---|---|---|---|
| JS ms per drawn frame | 0.33 → 0.32 | 1.53 → **1.18** | 1.65 → **1.23** | 1.53 → **1.24** | 1.35 → 1.08 |
| JS worst frame, ms | 1.0 → 0.9 | 8.2 → **3.5** | 5.4 → 3.7 | 5.6 → 5.2 | 2.7 → 2.2 |
| 2D canvas calls/s | 0 → 0 | 5,296 → **611** | 6,278 → **936** | 6,375 → **1,049** | 3,230 → **0** |
| Heap allocation MB/s | 0.24 → 0.25 | 11.0 → **6.4** | 10.4 → **4.5** | 9.4 → **4.3** | 3.1 → 1.1 |
| CPU script ms/s | 11.5 → 11.3 | 90 → **73** | 96 → **75** | 88 → **75** | 21 → 18 |
| Style recalcs/s | 60 → 60 | 63 → **18** | 66 → **23** | 88 → **48** | 60 → **0** |
| Programs linked | 0 → 0 | 1 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |

**Checks on the merged build:** `tsc`, `npm run build`, `npm run budget` (first-load JS 372.3 KB gzip of 450),
`npm run lint:sim` (146 files, no `src/sim` change), `npm run determinism` (100 seeds plus PvP, all hash trails
identical). Full `vitest`: 2,538 passed, 4 failed: `perf-sim` ×2 (sim-only CPU-time limits at load ~40–60) and the 2
`tools/trailer` copy-gate tests (`tools/copy-lint` has no `node_modules` in this worktree). e2e (`perf-ios`, `hold-aim`, `match-touch`,
`champ-browser`, `lol-inworld`, `minimap-touch`, both projects): 20 passed, 1 failed under load and passed alone (the
1440×900 `lol-inworld` damage-number count), 17 skipped by project. Tap-to-cast and hold-aim are among the passes. Screenshots, base vs
combined, at 667×375, 844×390 and 1440×900 (lobby, Sage R in the champion browser, 4–6-hero fights found with the
e2e World hook): plates, names, levels, telegraphs and skill VFX read the same.

**Found while checking:** with shadows on, the base build updated the heroes' bone textures at 30 Hz (6 skeletons,
150 uploads in 5 s at 60 fps; on Low, without shadows, at 60 Hz). The combined build uploads them every frame
(phone heroes no longer draw into the shadow map). That is 3 more 12×12 float uploads a frame (`tex uploads/s` 180 →
360 above), the same rate as the Low tier. Not a cost that matters; why the base skipped every other frame with
shadows on was not traced.
