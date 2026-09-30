# Catnip Heist performance baseline

Measured on 2026-09-29 against the working tree at `18bbc425` (with the uncommitted `src/` changes of
that day), before any optimisation. Nothing in `src/` was changed to take these numbers.

- Host: Apple M3 Pro (12 cores, 36 GB), macOS, Playwright's Chromium 151 headless shell.
- Two WebGL backends:
  - **Metal** (`--gpu=metal`, ANGLE on the M3 Pro GPU). The GPU is never the limit here, so these
    runs isolate the **CPU side**: JS per frame under 4x / 6x CPU throttling approximates a mid-range
    / low-end phone CPU.
  - **SwiftShader** (`--gpu=swiftshader`, the backend e2e and CI use). WebGL runs on the CPU, so
    frame times are dominated by software rasterisation and are far worse than any real GPU. Read
    them as a **GPU-cost proxy** (fill rate, MSAA, post passes), not as fps a player would see.
- Viewports: desktop 1280x720 at DPR 1; phone 390x844 at DPR 3 with touch (the renderer caps the
  pixel ratio at 2 on high and 1.5 on low, so the phone draws 780x1688 / 585x1266).
- Tiers forced with `?quality=high|low`. CPU throttling with `Emulation.setCPUThrottlingRate`.
- Heists replay their bundled solution (`window.__heist.loadReplay`, `?qa=1`), stepped to 35% of the
  run so guards, doors and coins are mid-play, then measured live for 8 s (60 s for heap / GC).

## How to re-run

```bash
cd catnip-heist
node perf/measure.mjs --build --gpu=metal --profile --out=perf/out/metal.json   # ~35 min, everything
node perf/measure.mjs --gpu=swiftshader --out=perf/out/swiftshader.json         # ~70 min
node perf/measure.mjs --quick --gpu=metal                                       # ~1 min smoke run
node perf/measure.mjs --only=runtime --scenes=heist-08 --viewports=phone --throttle=6 --quality=high --gpu=metal
node perf/measure.mjs --md perf/out/metal.json                                  # tables like the ones below
node perf/measure.mjs --compare-screens                                         # diff against perf/ref/*.png
```

`measure.mjs` prints one JSON document (and writes it with `--out`). It builds `perf/.dist`
(production) and, with `--profile`, `perf/.dist-prof` (same build, unminified, so CPU profiles keep
function names; each sample is mapped back to its source module through the bundle's `//#region`
comments). It serves them with `vite preview` on a free port (never 4173, 5199 or 4391). Raw
profiles land in `perf/out/profiles/*.cpuprofile|heapprofile` (open them in DevTools). `perf/out/`,
`perf/.dist*` are git-ignored; the JSON of this baseline is kept as `perf/baseline-metal.json` and
`perf/baseline-swiftshader.json`.

What it measures, without touching `src/` (an init script plus `window.__heist.app`):

| Metric | How |
|---|---|
| fps, frame time p50/p95/p99 | `requestAnimationFrame` timestamps (every rAF callback is wrapped) |
| JS per frame | time spent inside all rAF callbacks of a frame (App loop, Yard loop, title diorama) |
| non-JS ms | mean frame interval minus JS: GPU, compositor, idle |
| Heist subsystems | timers wrapped around `GameRenderer.update/draw`, `WebGLRenderer.render`, `PostFX.render`, `VisionCones.update`, `LevelView.update`, actor views, particles, camera, `HeistSession.advance`, `ui.updateHUD` |
| Draw calls, triangles | a WebGL wrapper counts `draw*` calls and triangles per frame (all passes, all contexts) |
| Geometries / textures / programs | `renderer.info` for the heist; live GL buffers / textures / programs per context elsewhere |
| Uploads | `bufferData/bufferSubData/texImage*` bytes and time, and which upload sizes repeat each frame |
| Shader cost | time in `compileShader/linkProgram/get*Parameter/get*InfoLog` (three checks every program, which is where the compile stall lands) |
| Long tasks, TBT | `PerformanceObserver('longtask')` |
| Heap, growth, GC | `Runtime.getHeapUsage` sampled every 5 s; forced GC before and after (retained growth); `MinorGC`/`MajorGC` trace events |
| Load | (requests / kB for the title are counted when Play appears; at 1x some images are still in flight, so the 1x rows show fewer) title interactive (Play button visible, `#app[data-ready]`), first diorama frame, first heist (`__heist.start(undefined, 'heist-01')` resolves after its first frame), a warm second heist (heist-08), Cat Yard ready and all 58 sheets extruded; requests and bytes from CDP `Network` |
| Hotspots | CDP sampling profiler (250 µs) and sampling heap profiler (collected objects included), per function and per source module |

Noise: the same config varies by about ±25% in JS per frame between runs (headless, a busy laptop).
Compare medians of 2 to 3 runs before calling a change a win, and compare like with like (same
backend, viewport, throttle, tier). Headless Chromium on Metal runs rAF at 120 Hz, so an unloaded
frame is 8.3 ms, not 16.7 ms.

## Reference screenshots

`perf/ref/` holds `title`, `heist-01-start` (desktop and phone), `heist-05-mid` (tick 486 of the
solution), `results` (heist-01 solution finished) and `yard`, all at seed 1, `?quality=high`,
1280x720 unless named phone, taken on Metal with Playwright's fake clock, a seeded `Math.random`,
CSS animations disabled and the heist renderer's animation clock reset after loading.
`--compare-screens` recaptures into `perf/out/screens/` and diffs. Two captures of the same build
differ by at most about 1% of pixels (heist-05-mid up to about 4%, the sentries' cones and the
title diorama loop depend on how many frames loading took), so treat `changedPct` above about 5 or
`meanAbsDiff` above about 3 as a real change and look at the images.

## Summary

- **CPU side is fine on a fast CPU and tight on a slow one.** On Metal every scene holds 120 fps
  at 4x and 6x throttling. The costliest heist frame is heist-01 on the phone at 6x on high:
  7.6 ms JS p50, 10.5 ms p95, 12.2 ms p99; low tier is 4.6 / 6.6 / 8.4 ms. Against a 16.7 ms budget
  on a real low-end phone that leaves little room once its GPU time is added.
- **Where heist JS goes** (heist-01 desktop 4x high, 4.6 ms of `renderer.update`): three.js
  rendering (scene traversal, uniforms, draw submission) plus the post chain 3.3 ms (70%), vision
  cones 0.43 ms, level props 0.17 ms, HUD 0.12 ms, the sim itself 0.06 ms. On low (no post, no
  shadows) the same frame is 2.3 ms.
- **GPU side** (SwiftShader) is dominated by the high tier's HDR + MSAA render target, bloom and
  shadows: see the SwiftShader tables, where high is several times slower than low at the same size.
- **Load is quick; the Yard is not.** Title interactive 76 ms at 1x, 265 ms at 4x, 543 ms at 6x
  (desktop high); first heist 150 / 360 / 620 ms. The Cat Yard needs 1.3 s at 1x and 6 to 11 s at
  4x to 6x to extrude all 58 breeds (time-sliced, so no long tasks, but cats keep popping in).
- **Memory is stable.** 60 s windows retain 1 to 3 MB after GC (a looping heist-08 replay: 1.5 MB);
  no leak across replay restarts. Allocation churn is 5 to 9 MB/s, giving 140 to 180 minor GCs per
  minute, p95 pause 2 to 3 ms, max 8 ms.

- **GPU proxy (SwiftShader).** Desktop 1280x720 at 4x: high tier 7 to 9 fps (p50 108 to 132 ms),
  low tier 29 to 43 fps (p50 25 to 33 ms), with the same JS per frame (2 to 4 ms). So about 75% of
  the high-tier frame is the GPU work the high tier adds (HDR MSAA target, bloom mips, grade pass,
  PCF shadow map). Throttling the CPU does not change SwiftShader fps. When the GPU queue is full,
  `WebGLRenderer.render` itself blocks (22.6 ms "JS" per frame on heist-02 high vs 1.95 on low) and
  produces 400 to 1100 ms long tasks.
- **Shader compile stalls are the worst load cost on a slow GPU.** On SwiftShader the first heist
  links 54 programs (high) in 3.7 to 5.0 s, all on the main thread behind the loading screen (TBT
  4 to 5 s); the low tier links 22 programs in 1.1 to 1.5 s. The title links 27 to 36 more in a
  second WebGL context. On Metal the same work takes 70 to 110 ms. (One Metal cold start measured
  647 ms for the title: the first run of a fresh browser, before the GPU shader cache is warm.)

## Top 10 hotspots

Percentages are of busy main-thread CPU in the CPU profile (desktop, 4x, unminified build, Metal)
unless stated otherwise. Module paths are source files; "~L" line numbers in the JSON point into the
unminified bundle's module region, close to the source line.

| # | Hotspot | Where | Cost | Why |
|---|---|---|---|---|
| 1 | three.js scene render + post chain | `src/render/GameRenderer.ts` `draw()` → `src/render/post.ts` `PostFX.render` → three `EffectComposer` / `RenderPass` / `UnrealBloomPass`; hot leaves `renderBufferDirect`, `setValueM4`, `setProgram`, `projectObject`, `updateMatrixWorld` | 3.3 of 4.6 ms heist JS per frame (70%) on high, 1.5 of 2.3 ms on low (heist-01 desktop 4x); `post.ts` inclusive 53 to 58% of busy CPU on high | 50 to 110 draw calls per frame in several passes (shadow map, scene into the HDR target, bloom mips, final), each with per-object uniform uploads. 142 of 146 scene objects keep `matrixAutoUpdate` on, so the static level is re-multiplied every frame (`updateMatrixWorld` 3 to 4%). On the GPU side this is also the whole high/low gap above. |
| 2 | Vision cone rebuild every frame | `src/render/vision.ts` `VisionCones.update` → `clipTileToCone`, `clipHalf`; called from `GameRenderer.update` | 9.5 to 16.4% of busy CPU (0.13 to 0.45 ms per frame at 4x, the largest non-three.js item); also 2 to 4% on the title (diorama) | Every candidate tile around every guard is clipped against the cone and the vision disc and line-of-sight tested on every animation frame, although the inputs (sim position and facing of `cur`) only change on a 30 Hz tick. The `sees()` callback in `GameRenderer.update` builds a fresh closure and `{x, y}` objects per tile. |
| 3 | Vision cone buffers re-uploaded at full capacity | `src/render/vision.ts` `update()` sets `needsUpdate` on all four attributes (`position`, `color`, `aO`, `aR`) | 200 to 490 KB of `bufferSubData` per frame (heist-01 and heist-05: 138 KB x2 + 104 KB + 69 KB), about 30 MB/s at 60 fps; `bufferSubData` + three `updateBuffer` 3 to 4.3% of busy CPU | three uploads the whole `maxVerts` array (sized for the worst case: guards x span² x 30) regardless of `drawRange`, and does it every frame even when the geometry did not change. `aO`/`aR` are per-guard constants copied into every vertex. |
| 4 | Forced synchronous layout per frame | `src/render/GameRenderer.ts` `placeLights()` (and `draw()`) read `this.el.clientWidth` / `clientHeight` | 2.7 to 4.3% of busy CPU in heists; 12.5 to 15.3% on the title screen (the diorama renderer behind the animated menu) | The HUD / menu DOM changes before `renderer.update` runs, so the first `clientWidth` read of the frame flushes style and layout synchronously. The size is already known from the `ResizeObserver` in `mount()`. |
| 5 | Program re-resolution every frame | three `setProgram` → `getProgram` → `getParameters` / `getProgramCacheKey` (+ `Array.join`), from the shadow pass and the main pass | 1.3 to 1.8% of busy CPU, and about 1 to 1.5 MB/s of allocation (`join`, `getParameters`, `getProgramCacheKeyParameters` together 12 to 18% of allocations) | `needsProgramChange` flips per draw: one `MeshLambertMaterial` is shared by 2 `InstancedMesh` and 1 plain `Mesh` in the level, and the shadow map's shared depth material alternates between 2 instanced and 18 plain casters. Each flip rebuilds the parameters object and cache-key string. |
| 6 | Allocation churn and minor GC | `vision.ts` `update` (inlined `sees` closures, 1.5 to 2 MB/s), three uniform setters `setValueM4` / `setValueV3f` (1 to 2 MB/s), #5 above; Yard: `src/yard/wander.ts` `stepAgents` (3.2 MB/s, 38 to 43% of the Yard's allocation) and `Math.hypot` (1.2 MB/s) | 5 to 9 MB/s sampled; 140 to 176 minor GCs per minute on Metal, p95 pause 2 to 3.3 ms, max 8 ms; title sees 21 major GCs per minute | Short-lived objects per tile / per uniform / per agent step. Not a leak (1 to 3 MB retained over 60 s), but on a slow phone the p99 frame spikes line up with GC pauses. |
| 7 | Voxel extrusion on the main thread at load | `src/render/voxel/extrude.ts` `meshGrid`, `MeshBuilder.quad`, `analyseRect`, `at`; `src/render/voxel/sheets.ts` `getFrameGeometry`, `imageToPixels`, `prewarmSheet` | load profile (title + heist-01 + heist-08, 4x): extrude.ts 248 ms inclusive (19%), sheets.ts 330 ms (25%), GC 97 ms (7.5%); Cat Yard: all 58 sheets take 1.3 s at 1x, 5 to 11 s at 4x to 6x (Metal) and 16 to 71 s on SwiftShader | Every frame of every prewarmed row is extruded synchronously: `quad()` pushes into plain JS arrays that are copied into typed arrays afterwards, `unpack()` returns a fresh array per face, and each sheet is read back with `getImageData`. The title diorama prewarms two cats and two dogs before the menu appears; the Yard extrudes every breed. |
| 8 | Shader programs compiled per context, and synchronously | three `WebGLProgram` / `WebGLShader` / `replaceLightNums`, `renderer.compile` in `GameRenderer.ready()`; separate contexts for the title diorama (`src/render/diorama.ts`), the heist and the Yard | Metal: title 27 to 36 links, 60 to 130 ms; first heist 54 links (high) / 22 (low), 70 to 110 ms. SwiftShader: 3.7 to 5.0 s for the first heist on high (see above) | Three renderers never share programs, so the diorama's and the heist's identical materials compile twice; the high tier roughly doubles the program count (shadows, HDR, post). three checks each program's status right away, so on a slow driver every compile blocks. The diorama context also keeps about 200 GL buffers alive during a heist. |
| 9 | Download weight | `perf/.dist/build/index-*.js` 843 kB (233 kB gzip, one chunk: all of three.js, post-processing, 8 levels' JSON); `public/assets/images/logo.png` 370 kB (600x337), `catnip.png` 155 kB (320x320); `manifest.json` 98 kB | title: 17 requests, 1.2 MB before it settles at 4x; whole session including the Yard: 76 requests, 2.1 MB | PNG art at full size and no code splitting (the Yard, post-processing and level data load on the title). Title interactive is still only 76 ms at 1x on localhost, so this matters on real networks, not in these numbers. |
| 10 | Per-frame instance uploads sized for the maximum | `src/render/fx.ts` `Particles.update` (600-slot `instanceMatrix` + `instanceColor`, 38.4 KB + 7.2 KB every frame); coin / orbit / parcel / camera instances in `src/render/level.ts` and `src/render/terrain.ts`; Yard `stepAgents` O(n²) separation (6 to 8% of Yard CPU) | about 45 KB/frame for particles alone; Yard `stepAgents` 73 to 85 ms per 8 s at 4x | `needsUpdate` re-sends the full instance buffer every frame even when only a few particles live (or none). Smaller than #3 but the same pattern. |

Not hotspots (checked): the sim (`HeistSession.advance`, 0.02 to 0.07 ms per frame), the HUD
(`ui.updateHUD`, 0.02 to 0.16 ms), actor views (under 0.1 ms), camera, backdrop, meow waves. No
long tasks on Metal during play; the only JS long tasks on SwiftShader come from GPU back-pressure.

## Measurements: Metal (CPU side)

Run: 2026-09-29T19:55:33.941Z, ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version), Chromium 151.0.7922.34, host Apple M3 Pro x12, 36 GB.

### Metal: Bundle

| Kind | Files | Bytes | Gzip |
|---|---|---|---|
| assets | 71 | 1750 kB | 1655.5 kB |
| js | 1 | 822.9 kB | 226.9 kB |
| html | 1 | 1 kB | 0.6 kB |
| other | 1 | 0 kB | 0 kB |

| Asset folder | Files | Bytes |
|---|---|---|
| assets/cats | 58 | 903.9 kB |
| assets/dogs | 5 | 60.5 kB |
| assets/fonts | 1 | 31.6 kB |
| assets/icons | 1 | 3.4 kB |
| assets/images | 5 | 653 kB |
| assets/manifest.json | 1 | 97.7 kB |

### Metal: Load

| Viewport | CPU | Tier | FCP | Title interactive | Diorama 1st frame | Title req / kB | Title shader ms (links) | Title TBT | First heist | Heist req / kB | Heist shader ms (links) | Heist TBT | 2nd heist | Yard ready / all sheets | Yard TBT | Heap title / heist / yard MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop | 1x | high | n/a | 76.1 ms | 97 ms | 5 / 268.5 | 58.9 (27) | 0 ms | 151.4 ms | 15 / 978.1 | 70.4 (54) | 53 ms | 72.5 ms | 228 / 1325.5 ms | 15 ms | 5.8 / 7.4 / 19.37 |
| desktop | 1x | low | n/a | 77.9 ms | 87.1 ms | 8 / 398.3 | 647.3 (16) | 0 ms | 82.1 ms | 12 / 848.3 | 18.7 (22) | 0 ms | 40.9 ms | 519 / 1561.2 ms | 312 ms | 5.25 / 6.76 / 18.24 |
| desktop | 4x | high | n/a | 264.9 ms | 302.5 ms | 17 / 1200.6 | 84.6 (35) | 227 ms | 359.2 ms | 3 / 46 | 73.8 (54) | 177 ms | 165.2 ms | 893.4 / 6403.9 ms | 71 ms | 5.73 / 7.4 / 20.47 |
| desktop | 4x | low | n/a | 348.7 ms | 389 ms | 17 / 1200.6 | 68.2 (21) | 257 ms | 302.6 ms | 3 / 46 | 25.3 (22) | 107 ms | 148 ms | 962.4 / 5078.6 ms | 48 ms | 5.98 / 6.71 / 18.92 |
| desktop | 6x | high | n/a | 543.4 ms | 618.5 ms | 17 / 1200.6 | 128.5 (36) | 575 ms | 618.2 ms | 3 / 46 | 109 (54) | 376 ms | 290.1 ms | 1629.7 / 11183.2 ms | 160 ms | 5.86 / 7.48 / 20.79 |
| desktop | 6x | low | n/a | 460 ms | 513.9 ms | 17 / 1200.6 | 62.2 (21) | 398 ms | 424.5 ms | 3 / 46 | 29.7 (22) | 196 ms | 220.6 ms | 1388 / 8217.8 ms | 78 ms | 5.96 / 6.73 / 19.28 |
| phone | 1x | high | n/a | 154.7 ms | 170.4 ms | 5 / 268.5 | 72.5 (26) | 56 ms | 206 ms | 15 / 978.1 | 88.6 (52) | 97 ms | 89.8 ms | 294.3 / 1548.6 ms | 28 ms | 5.75 / 7.4 / 19.28 |
| phone | 1x | low | n/a | 87.1 ms | 96.1 ms | 5 / 268.5 | 28.8 (15) | 0 ms | 88.5 ms | 15 / 978.1 | 20.6 (22) | 0 ms | 47.3 ms | 232.6 / 1273.4 ms | 0 ms | 5.31 / 6.94 / 18.05 |
| phone | 4x | high | n/a | 297.3 ms | 341.1 ms | 17 / 1200.6 | 98 (35) | 261 ms | 372.4 ms | 3 / 46 | 70.3 (52) | 179 ms | 160.7 ms | 968.8 / 6492.4 ms | 68 ms | 7 / 7.43 / 20.17 |
| phone | 4x | low | n/a | 315.6 ms | 348.4 ms | 17 / 1200.6 | 58.6 (20) | 224 ms | 316.1 ms | 3 / 46 | 31.5 (22) | 113 ms | 157.2 ms | 942.9 / 4843.3 ms | 49 ms | 6 / 6.82 / 18.64 |
| phone | 6x | high | n/a | 421.6 ms | 484.1 ms | 17 / 1200.6 | 96.4 (35) | 409 ms | 498.4 ms | 3 / 46 | 77.3 (52) | 273 ms | 219.9 ms | 1408.6 / 9123.5 ms | 96 ms | 7.06 / 7.46 / 20.26 |
| phone | 6x | low | n/a | 405.3 ms | 457.1 ms | 17 / 1200.6 | 58.7 (20) | 342 ms | 378.8 ms | 3 / 46 | 26.9 (22) | 160 ms | 193.4 ms | 1262.5 / 7036 ms | 43 ms | 6.01 / 6.71 / 18.94 |

### Metal: Runtime

| Scene | Viewport | CPU | Tier | fps | p50 / p95 / p99 ms | JS/frame p50 / p95 | non-JS ms | Long tasks (TBT) | Draws | Tris | Geo / Tex / Prog | Heap MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| title | desktop | 4x | high | 120.1 | 8.3 / 10.1 / 10.3 | 3.1 / 4.6 | 5.17 | 0 (0 ms) | 84.6 | 44637 | buf 492 / tex 24 / prog 36 | 7.14 |
| title | desktop | 4x | low | 120 | 8.3 / 10.1 / 10.3 | 2.2 / 3 | 6.19 | 0 (0 ms) | 58.6 | 26536 | buf 490 / tex 9 / prog 21 | 9.91 |
| title | desktop | 6x | high | 118.3 | 8.3 / 10.2 / 15.3 | 5.3 / 7.2 | 3.09 | 0 (0 ms) | 84.6 | 44633 | buf 492 / tex 24 / prog 36 | 15.11 |
| title | desktop | 6x | low | 119.9 | 8.3 / 10.1 / 10.3 | 3.3 / 4.8 | 4.96 | 0 (0 ms) | 58.6 | 26532 | buf 490 / tex 9 / prog 21 | 13.4 |
| title | phone | 4x | high | 119.9 | 8.3 / 10.1 / 10.3 | 2.8 / 4.1 | 5.47 | 0 (0 ms) | 80.5 | 44460 | buf 484 / tex 23 / prog 35 | 9.56 |
| title | phone | 4x | low | 120 | 8.3 / 10.1 / 10.3 | 2.1 / 3 | 6.22 | 0 (0 ms) | 54.5 | 26361 | buf 482 / tex 8 / prog 20 | 7.68 |
| title | phone | 6x | high | 113.7 | 8.3 / 15.7 / 17.8 | 5.5 / 8.1 | 3.22 | 0 (0 ms) | 80.5 | 44475 | buf 484 / tex 23 / prog 35 | 11.08 |
| title | phone | 6x | low | 118.1 | 8.3 / 10.2 / 16.5 | 4.8 / 6.7 | 3.66 | 0 (0 ms) | 54.5 | 26352 | buf 478 / tex 8 / prog 20 | 14.33 |
| heist-01 | desktop | 4x | high | 119.9 | 8.3 / 10.1 / 10.3 | 4.9 / 7.4 | 3.45 | 0 (0 ms) | 78.6 | 74333 | 153 / 20 / 56 | 23.76 |
| heist-01 | desktop | 4x | low | 120 | 8.3 / 10.1 / 10.3 | 2.4 / 3.8 | 5.92 | 0 (0 ms) | 49.5 | 41236 | 145 / 5 / 22 | 53.18 |
| heist-01 | desktop | 6x | high | 116.1 | 8.3 / 10.3 / 17 | 6.2 / 9.3 | 2.36 | 0 (0 ms) | 78.6 | 74355 | 154 / 20 / 56 | 17.3 |
| heist-01 | desktop | 6x | low | 119.9 | 8.3 / 10.1 / 10.3 | 3.2 / 5.6 | 5.11 | 0 (0 ms) | 49.5 | 41236 | 145 / 5 / 22 | 15.71 |
| heist-01 | phone | 4x | high | 119.9 | 8.3 / 10.1 / 10.3 | 2.9 / 6.2 | 5.16 | 0 (0 ms) | 73.7 | 73613 | 161 / 20 / 55 | 17.99 |
| heist-01 | phone | 4x | low | 120.1 | 8.3 / 10 / 10.3 | 2.4 / 3.6 | 5.99 | 0 (0 ms) | 40.1 | 37963 | 133 / 5 / 22 | 7.81 |
| heist-01 | phone | 6x | high | 107.1 | 8.4 / 16.7 / 18.1 | 7.6 / 10.5 | 1.64 | 0 (0 ms) | 74 | 73690 | 161 / 20 / 55 | 58.25 |
| heist-01 | phone | 6x | low | 119.8 | 8.3 / 10.1 / 10.3 | 4.6 / 6.6 | 3.75 | 0 (0 ms) | 40.1 | 37944 | 133 / 5 / 22 | 47.06 |
| heist-02 | desktop | 4x | high | 119 | 8.3 / 10.1 / 10.3 | 4.2 / 6.2 | 4.06 | 1 (29 ms) | 59.6 | 63130 | 101 / 19 / 48 | 15.73 |
| heist-02 | desktop | 4x | low | 120 | 8.3 / 10.1 / 10.3 | 2.4 / 3.5 | 5.89 | 0 (0 ms) | 36.7 | 35374 | 95 / 4 / 19 | 11.41 |
| heist-02 | desktop | 6x | high | 114.3 | 8.3 / 15 / 18.1 | 6.8 / 9.3 | 2.06 | 0 (0 ms) | 59.5 | 63072 | 100 / 19 / 48 | 34.76 |
| heist-02 | desktop | 6x | low | 119.8 | 8.3 / 10 / 10.3 | 2.9 / 4.5 | 5.45 | 0 (0 ms) | 36.7 | 35376 | 96 / 4 / 19 | 31.77 |
| heist-02 | phone | 4x | high | 120.1 | 8.3 / 10 / 10.2 | 3.5 / 5.4 | 4.78 | 0 (0 ms) | 54.5 | 61949 | 100 / 19 / 49 | 12.94 |
| heist-02 | phone | 4x | low | 120.1 | 8.3 / 10 / 10.3 | 1.7 / 2.8 | 6.67 | 0 (0 ms) | 30.4 | 33638 | 91 / 4 / 19 | 10.06 |
| heist-02 | phone | 6x | high | 119 | 8.3 / 10.2 / 15.9 | 5 / 8.2 | 3.34 | 0 (0 ms) | 54.5 | 61953 | 101 / 19 / 49 | 16.92 |
| heist-02 | phone | 6x | low | 119.9 | 8.3 / 10.1 / 10.3 | 2.7 / 4.6 | 5.57 | 0 (0 ms) | 30.4 | 33651 | 91 / 4 / 19 | 16.32 |
| heist-03 | desktop | 4x | high | 120.3 | 8.3 / 10 / 10.3 | 3.7 / 6.2 | 4.47 | 0 (0 ms) | 88.8 | 59180 | 112 / 18 / 49 | 39.41 |
| heist-03 | desktop | 4x | low | 120 | 8.3 / 10.1 / 10.3 | 2.6 / 3.7 | 5.73 | 0 (0 ms) | 62 | 33834 | 111 / 3 / 20 | 40.94 |
| heist-03 | desktop | 6x | high | 109 | 8.4 / 16.8 / 18 | 7.4 / 10.5 | 1.72 | 0 (0 ms) | 88.8 | 59201 | 111 / 18 / 49 | 9.78 |
| heist-03 | desktop | 6x | low | 119.9 | 8.3 / 10.1 / 10.3 | 3.8 / 5.9 | 4.54 | 0 (0 ms) | 62 | 33836 | 110 / 3 / 20 | 15.82 |
| heist-03 | phone | 4x | high | 120.1 | 8.3 / 10 / 10.3 | 2.4 / 4.8 | 5.81 | 0 (0 ms) | 84.5 | 58643 | 111 / 18 / 49 | 38.12 |
| heist-03 | phone | 4x | low | 120.2 | 8.3 / 10.1 / 10.3 | 1.5 / 2.4 | 6.84 | 0 (0 ms) | 54.4 | 32185 | 111 / 3 / 20 | 9.58 |
| heist-03 | phone | 6x | high | 120.8 | 8.3 / 10.1 / 10.3 | 4.4 / 6.9 | 3.83 | 0 (0 ms) | 84.5 | 58635 | 111 / 18 / 49 | 15.86 |
| heist-03 | phone | 6x | low | 120 | 8.3 / 10.1 / 10.3 | 2.4 / 3.7 | 5.96 | 0 (0 ms) | 54.4 | 32177 | 110 / 3 / 20 | 9.58 |
| heist-04 | desktop | 4x | high | 120.3 | 8.3 / 10.1 / 10.3 | 2.5 / 4 | 5.76 | 0 (0 ms) | 72.1 | 73628 | 119 / 19 / 52 | 15.34 |
| heist-04 | desktop | 4x | low | 120 | 8.3 / 10.1 / 10.3 | 1.7 / 2.7 | 6.59 | 0 (0 ms) | 44.9 | 40900 | 115 / 4 / 21 | 8.94 |
| heist-04 | desktop | 6x | high | 119.9 | 8.3 / 10.2 / 10.3 | 4.2 / 6.6 | 4.18 | 0 (0 ms) | 72.2 | 73633 | 118 / 19 / 52 | 14.18 |
| heist-04 | desktop | 6x | low | 120 | 8.3 / 10.1 / 10.3 | 2.5 / 4 | 5.77 | 0 (0 ms) | 44.9 | 40908 | 116 / 4 / 21 | 57.32 |
| heist-04 | phone | 4x | high | 118.5 | 8.3 / 10 / 10.3 | 2.5 / 4.5 | 5.77 | 0 (0 ms) | 61.9 | 68134 | 118 / 19 / 52 | 15.59 |
| heist-04 | phone | 4x | low | 120 | 8.3 / 10.1 / 10.3 | 1.6 / 2.8 | 6.65 | 0 (0 ms) | 33.8 | 35296 | 102 / 4 / 21 | 10.02 |
| heist-04 | phone | 6x | high | 117.9 | 8.3 / 10.1 / 10.7 | 4.1 / 7 | 4.35 | 0 (0 ms) | 61.8 | 68140 | 118 / 19 / 52 | 15 |
| heist-04 | phone | 6x | low | 120.1 | 8.3 / 10.1 / 10.3 | 2.4 / 4.1 | 5.83 | 0 (0 ms) | 33.8 | 35299 | 103 / 4 / 21 | 10.17 |
| heist-05 | desktop | 4x | high | 120 | 8.3 / 10.1 / 10.3 | 2.7 / 4.2 | 5.56 | 0 (0 ms) | 71.5 | 66353 | 119 / 18 / 49 | 14.01 |
| heist-05 | desktop | 4x | low | 120 | 8.3 / 10.1 / 10.3 | 2 / 3.2 | 6.28 | 0 (0 ms) | 45.4 | 36872 | 107 / 3 / 20 | 61.72 |
| heist-05 | desktop | 6x | high | 119.9 | 8.3 / 10.2 / 10.4 | 4.8 / 7.3 | 3.48 | 0 (0 ms) | 71.5 | 66367 | 119 / 18 / 49 | 10.06 |
| heist-05 | desktop | 6x | low | 119.9 | 8.3 / 10.1 / 10.3 | 2.8 / 4.4 | 5.52 | 0 (0 ms) | 45.5 | 36887 | 107 / 3 / 20 | 15.01 |
| heist-05 | phone | 4x | high | 120 | 8.3 / 10.1 / 10.3 | 2.7 / 4.6 | 5.46 | 0 (0 ms) | 59.1 | 63533 | 122 / 18 / 49 | 13.95 |
| heist-05 | phone | 4x | low | 120.1 | 8.3 / 10.1 / 10.3 | 1.8 / 2.7 | 6.55 | 0 (0 ms) | 31.2 | 32664 | 97 / 3 / 20 | 8.93 |
| heist-05 | phone | 6x | high | 119.2 | 8.3 / 10.2 / 10.6 | 5.2 / 8.1 | 3.21 | 0 (0 ms) | 59.1 | 63529 | 122 / 18 / 49 | 14.93 |
| heist-05 | phone | 6x | low | 119.9 | 8.3 / 10.1 / 10.3 | 2.6 / 4 | 5.79 | 0 (0 ms) | 31.1 | 32655 | 97 / 3 / 20 | 10.38 |
| heist-06 | desktop | 4x | high | 120 | 8.3 / 10.1 / 10.3 | 2.7 / 4.5 | 5.56 | 0 (0 ms) | 61.2 | 79814 | 129 / 18 / 49 | 11.78 |
| heist-06 | desktop | 4x | low | 120 | 8.3 / 10.2 / 10.3 | 2.2 / 3.2 | 6.15 | 0 (0 ms) | 37.5 | 43537 | 118 / 3 / 20 | 60.06 |
| heist-06 | desktop | 6x | high | 120.1 | 8.3 / 10.1 / 10.3 | 3.8 / 6.4 | 4.41 | 0 (0 ms) | 61.2 | 79813 | 128 / 18 / 49 | 16.57 |
| heist-06 | desktop | 6x | low | 120.1 | 8.3 / 10.2 / 10.3 | 3 / 4.8 | 5.25 | 0 (0 ms) | 37.6 | 43544 | 118 / 3 / 20 | 12.72 |
| heist-06 | phone | 4x | high | 120.3 | 8.3 / 10.1 / 10.3 | 2.4 / 3.8 | 5.86 | 0 (0 ms) | 63.6 | 77524 | 130 / 18 / 49 | 11.72 |
| heist-06 | phone | 4x | low | 120 | 8.3 / 10.2 / 10.3 | 2.4 / 3.2 | 5.93 | 0 (0 ms) | 37 | 40113 | 118 / 3 / 20 | 14.49 |
| heist-06 | phone | 6x | high | 120.5 | 8.3 / 10.2 / 10.3 | 4.1 / 6.7 | 4.04 | 0 (0 ms) | 63.6 | 77507 | 129 / 18 / 49 | 17.22 |
| heist-06 | phone | 6x | low | 120 | 8.3 / 10 / 10.3 | 2.4 / 3.6 | 5.98 | 0 (0 ms) | 36.9 | 40122 | 118 / 3 / 20 | 25.71 |
| heist-07 | desktop | 4x | high | 120.1 | 8.3 / 10.2 / 10.3 | 4.6 / 6.5 | 3.68 | 0 (0 ms) | 109.3 | 81618 | 182 / 18 / 49 | 17.84 |
| heist-07 | desktop | 4x | low | 120.1 | 8.3 / 10.1 / 10.3 | 2 / 3.2 | 6.26 | 0 (0 ms) | 72.3 | 46098 | 180 / 3 / 20 | 13.6 |
| heist-07 | desktop | 6x | high | 120.3 | 8.3 / 10.2 / 10.3 | 5.3 / 7.5 | 2.99 | 0 (0 ms) | 109.3 | 81603 | 182 / 18 / 49 | 16.18 |
| heist-07 | desktop | 6x | low | 120 | 8.3 / 10.1 / 10.3 | 3 / 4.8 | 5.35 | 0 (0 ms) | 72.3 | 46088 | 179 / 3 / 20 | 17.34 |
| heist-07 | phone | 4x | high | 120 | 8.3 / 10.1 / 10.3 | 2.5 / 3.8 | 5.82 | 0 (0 ms) | 88 | 75096 | 182 / 18 / 49 | 11.68 |
| heist-07 | phone | 4x | low | 120 | 8.3 / 9.9 / 10.2 | 1.6 / 2.4 | 6.71 | 0 (0 ms) | 49 | 38623 | 156 / 3 / 20 | 14.61 |
| heist-07 | phone | 6x | high | 120 | 8.3 / 10.1 / 10.3 | 4.4 / 6.5 | 4.02 | 0 (0 ms) | 88 | 75079 | 182 / 18 / 49 | 18.61 |
| heist-07 | phone | 6x | low | 120 | 8.3 / 10 / 10.3 | 2.4 / 3.8 | 5.93 | 0 (0 ms) | 49 | 38624 | 156 / 3 / 20 | 11.1 |
| heist-08 | desktop | 4x | high | 120 | 8.3 / 10 / 10.3 | 2.2 / 3.3 | 6.12 | 0 (0 ms) | 49 | 76072 | 110 / 19 / 52 | 62.77 |
| heist-08 | desktop | 4x | low | 120 | 8.3 / 10 / 10.3 | 1.4 / 2.4 | 6.87 | 0 (0 ms) | 26.7 | 40774 | 85 / 4 / 21 | 10.63 |
| heist-08 | desktop | 6x | high | 119.9 | 8.3 / 10.1 / 10.3 | 3.3 / 5.3 | 5.02 | 0 (0 ms) | 49 | 76073 | 111 / 19 / 52 | 14.3 |
| heist-08 | desktop | 6x | low | 120 | 8.3 / 10 / 10.2 | 2.2 / 3.6 | 6.11 | 0 (0 ms) | 26.7 | 40769 | 84 / 4 / 21 | 10.99 |
| heist-08 | phone | 4x | high | 120 | 8.3 / 10.1 / 10.3 | 2.4 / 3.6 | 5.99 | 0 (0 ms) | 49.1 | 77723 | 130 / 19 / 52 | 16.49 |
| heist-08 | phone | 4x | low | 120 | 8.3 / 10 / 10.3 | 1.4 / 2.3 | 6.95 | 0 (0 ms) | 22.6 | 39816 | 85 / 4 / 21 | 8.65 |
| heist-08 | phone | 6x | high | 120 | 8.3 / 10.1 / 10.3 | 4 / 5.9 | 4.39 | 0 (0 ms) | 49.1 | 77714 | 130 / 19 / 52 | 48.7 |
| heist-08 | phone | 6x | low | 120 | 8.3 / 10.1 / 10.3 | 2.2 / 3.8 | 6.07 | 0 (0 ms) | 22.6 | 39830 | 85 / 4 / 21 | 24.37 |
| yard | desktop | 4x | high | 120 | 8.3 / 10 / 10.3 | 1.8 / 2.5 | 6.61 | 0 (0 ms) | 83 | 81422 | buf 4676 / tex 20 / prog 20 | 24.33 |
| yard | desktop | 4x | low | 120 | 8.3 / 10 / 10.2 | 1.1 / 1.8 | 7.21 | 0 (0 ms) | 67 | 71819 | buf 4606 / tex 5 / prog 10 | 21.6 |
| yard | desktop | 6x | high | 120 | 8.3 / 10 / 10.3 | 2.8 / 4.2 | 5.7 | 0 (0 ms) | 83 | 81452 | buf 4608 / tex 20 / prog 20 | 35.61 |
| yard | desktop | 6x | low | 120 | 8.3 / 10.1 / 10.3 | 1.8 / 2.8 | 6.67 | 0 (0 ms) | 67 | 71812 | buf 4602 / tex 5 / prog 10 | 36.26 |
| yard | phone | 4x | high | 120 | 8.3 / 10.1 / 10.3 | 1.6 / 2.6 | 6.78 | 0 (0 ms) | 70.3 | 72666 | buf 3644 / tex 20 / prog 20 | 18.14 |
| yard | phone | 4x | low | 120 | 8.3 / 10.1 / 10.3 | 1.1 / 1.7 | 7.24 | 0 (0 ms) | 54.3 | 63070 | buf 3622 / tex 5 / prog 10 | 40.71 |
| yard | phone | 6x | high | 120 | 8.3 / 10.1 / 10.3 | 2.7 / 4.2 | 5.77 | 0 (0 ms) | 70.3 | 72667 | buf 3644 / tex 20 / prog 20 | 44.45 |
| yard | phone | 6x | low | 120 | 8.3 / 10.1 / 10.3 | 1.6 / 2.4 | 6.85 | 0 (0 ms) | 54.3 | 63073 | buf 3618 / tex 5 / prog 10 | 33.05 |

### Metal: Heist JS per frame by subsystem (ms)

| Scene | Viewport | CPU | Tier | session.advance (sim ticks) | ui.updateHUD | cat views update | level.update (props) | guard views update | cones.update (vision fans) | particles.update | meow waves update | camera.update | backdrop.update | three WebGLRenderer.render (per pass) | post.render (bloom + grade) | renderer.draw (three + post) | renderer.update (all render JS) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| heist-01 | desktop | 4x | high | 0.06 | 0.12 | 0.06 | 0.17 | 0.05 | 0.43 | 0.05 | 0.01 | 0.08 | 0.01 | 3.08 | 3.29 | 3.34 | 4.64 |
| heist-01 | desktop | 4x | low | 0.03 | 0.05 | 0.02 | 0.08 | 0.02 | 0.37 | 0.04 | 0.01 | 0.04 | 0 | 1.51 |  | 1.52 | 2.32 |
| heist-01 | desktop | 6x | high | 0.1 | 0.14 | 0.06 | 0.22 | 0.05 | 0.61 | 0.06 | 0.01 | 0.11 | 0.01 | 3.93 | 4.18 | 4.24 | 5.94 |
| heist-01 | desktop | 6x | low | 0.03 | 0.06 | 0.03 | 0.1 | 0.03 | 0.47 | 0.05 | 0.01 | 0.06 | 0 | 2.04 |  | 2.07 | 3.11 |
| heist-01 | phone | 4x | high | 0.04 | 0.07 | 0.03 | 0.11 | 0.03 | 0.34 | 0.03 | 0 | 0.04 | 0 | 2.01 | 2.13 | 2.17 | 3.04 |
| heist-01 | phone | 4x | low | 0.03 | 0.04 | 0.02 | 0.08 | 0.02 | 0.36 | 0.04 | 0 | 0.06 | 0 | 1.4 |  | 1.42 | 2.23 |
| heist-01 | phone | 6x | high | 0.13 | 0.18 | 0.09 | 0.29 | 0.08 | 0.61 | 0.09 | 0.01 | 0.12 | 0.01 | 4.9 | 5.18 | 5.27 | 7.3 |
| heist-01 | phone | 6x | low | 0.06 | 0.1 | 0.04 | 0.15 | 0.04 | 0.62 | 0.06 | 0.01 | 0.1 | 0.01 | 2.86 |  | 2.9 | 4.39 |
| heist-02 | desktop | 4x | high | 0.07 | 0.14 | 0.06 | 0.12 | 0.06 | 0.24 | 0.06 | 0.01 | 0.07 | 0 | 2.82 | 3.02 | 3.09 | 4.08 |
| heist-02 | desktop | 4x | low | 0.03 | 0.07 | 0.03 | 0.07 | 0.03 | 0.22 | 0.04 | 0 | 0.05 | 0 | 1.58 |  | 1.61 | 2.3 |
| heist-02 | desktop | 6x | high | 0.11 | 0.2 | 0.08 | 0.15 | 0.1 | 0.4 | 0.06 | 0.01 | 0.1 | 0.01 | 4.33 | 4.65 | 4.76 | 6.28 |
| heist-02 | desktop | 6x | low | 0.04 | 0.07 | 0.03 | 0.07 | 0.03 | 0.23 | 0.03 | 0.01 | 0.08 | 0.01 | 1.96 |  | 1.98 | 2.75 |
| heist-02 | phone | 4x | high | 0.07 | 0.13 | 0.05 | 0.11 | 0.05 | 0.22 | 0.04 | 0.01 | 0.07 | 0 | 2.19 | 2.35 | 2.41 | 3.29 |
| heist-02 | phone | 4x | low | 0.03 | 0.05 | 0.02 | 0.04 | 0.02 | 0.16 | 0.03 | 0 | 0.04 | 0 | 1.06 |  | 1.08 | 1.56 |
| heist-02 | phone | 6x | high | 0.08 | 0.15 | 0.07 | 0.15 | 0.07 | 0.28 | 0.08 | 0.02 | 0.08 | 0 | 3.17 | 3.42 | 3.48 | 4.75 |
| heist-02 | phone | 6x | low | 0.04 | 0.06 | 0.03 | 0.07 | 0.04 | 0.22 | 0.05 | 0.01 | 0.07 | 0.01 | 1.86 |  | 1.88 | 2.65 |
| heist-03 | desktop | 4x | high | 0.05 | 0.12 | 0.04 | 0.13 | 0.03 | 0.17 | 0.04 | 0 | 0.05 | 0 | 2.74 | 2.9 | 2.94 | 3.62 |
| heist-03 | desktop | 4x | low | 0.03 | 0.08 | 0.03 | 0.09 | 0.02 | 0.19 | 0.03 | 0.01 | 0.05 | 0 | 1.83 |  | 1.85 | 2.47 |
| heist-03 | desktop | 6x | high | 0.11 | 0.23 | 0.11 | 0.24 | 0.06 | 0.31 | 0.07 | 0.02 | 0.11 | 0.02 | 5.25 | 5.54 | 5.63 | 7.04 |
| heist-03 | desktop | 6x | low | 0.04 | 0.1 | 0.03 | 0.13 | 0.02 | 0.25 | 0.04 | 0.01 | 0.06 | 0.01 | 2.78 |  | 2.82 | 3.61 |
| heist-03 | phone | 4x | high | 0.03 | 0.06 | 0.03 | 0.06 | 0.01 | 0.13 | 0.02 | 0 | 0.03 | 0 | 1.8 | 1.91 | 1.93 | 2.39 |
| heist-03 | phone | 4x | low | 0.02 | 0.03 | 0.01 | 0.04 | 0.01 | 0.11 | 0.01 | 0 | 0.03 | 0 | 1.1 |  | 1.11 | 1.42 |
| heist-03 | phone | 6x | high | 0.05 | 0.13 | 0.05 | 0.15 | 0.03 | 0.24 | 0.04 | 0.01 | 0.07 | 0 | 3.05 | 3.25 | 3.29 | 4.21 |
| heist-03 | phone | 6x | low | 0.02 | 0.05 | 0.02 | 0.06 | 0.01 | 0.14 | 0.02 | 0 | 0.03 | 0 | 1.8 |  | 1.82 | 2.29 |
| heist-04 | desktop | 4x | high | 0.03 | 0.06 | 0.02 | 0.07 | 0.01 | 0.14 | 0.03 | 0 | 0.03 | 0 | 1.75 | 1.85 | 1.87 | 2.44 |
| heist-04 | desktop | 4x | low | 0.02 | 0.05 | 0.02 | 0.05 | 0.01 | 0.13 | 0.03 | 0 | 0.03 | 0 | 1.15 |  | 1.16 | 1.65 |
| heist-04 | desktop | 6x | high | 0.06 | 0.11 | 0.06 | 0.14 | 0.02 | 0.23 | 0.05 | 0.01 | 0.06 | 0 | 2.7 | 2.87 | 2.9 | 3.93 |
| heist-04 | desktop | 6x | low | 0.03 | 0.05 | 0.02 | 0.06 | 0.01 | 0.17 | 0.04 | 0.01 | 0.05 | 0 | 1.8 |  | 1.82 | 2.46 |
| heist-04 | phone | 4x | high | 0.03 | 0.08 | 0.03 | 0.09 | 0.02 | 0.14 | 0.03 | 0.01 | 0.04 | 0 | 1.72 | 1.83 | 1.85 | 2.52 |
| heist-04 | phone | 4x | low | 0.03 | 0.04 | 0.02 | 0.05 | 0.01 | 0.13 | 0.03 | 0 | 0.03 | 0 | 1.06 |  | 1.08 | 1.59 |
| heist-04 | phone | 6x | high | 0.06 | 0.12 | 0.05 | 0.14 | 0.03 | 0.26 | 0.07 | 0.01 | 0.06 | 0 | 2.55 | 2.71 | 2.75 | 3.9 |
| heist-04 | phone | 6x | low | 0.03 | 0.05 | 0.02 | 0.07 | 0.02 | 0.16 | 0.04 | 0 | 0.03 | 0 | 1.69 |  | 1.7 | 2.38 |
| heist-05 | desktop | 4x | high | 0.03 | 0.06 | 0.02 | 0.07 | 0.01 | 0.37 | 0.03 | 0 | 0.04 | 0 | 1.76 | 1.87 | 1.89 | 2.66 |
| heist-05 | desktop | 4x | low | 0.03 | 0.04 | 0.01 | 0.06 | 0.01 | 0.33 | 0.04 | 0 | 0.04 | 0 | 1.26 |  | 1.27 | 1.97 |
| heist-05 | desktop | 6x | high | 0.07 | 0.1 | 0.07 | 0.13 | 0.04 | 0.58 | 0.06 | 0.01 | 0.09 | 0.01 | 2.94 | 3.13 | 3.17 | 4.63 |
| heist-05 | desktop | 6x | low | 0.03 | 0.04 | 0.02 | 0.06 | 0.01 | 0.45 | 0.05 | 0.02 | 0.04 | 0 | 1.75 |  | 1.78 | 2.72 |
| heist-05 | phone | 4x | high | 0.04 | 0.07 | 0.03 | 0.08 | 0.02 | 0.36 | 0.04 | 0.01 | 0.04 | 0 | 1.72 | 1.84 | 1.87 | 2.72 |
| heist-05 | phone | 4x | low | 0.03 | 0.03 | 0.02 | 0.04 | 0.01 | 0.33 | 0.03 | 0 | 0.04 | 0.01 | 0.99 |  | 1.01 | 1.7 |
| heist-05 | phone | 6x | high | 0.07 | 0.14 | 0.07 | 0.15 | 0.03 | 0.66 | 0.08 | 0.01 | 0.08 | 0.01 | 3.03 | 3.21 | 3.25 | 4.9 |
| heist-05 | phone | 6x | low | 0.03 | 0.05 | 0.02 | 0.06 | 0.02 | 0.47 | 0.04 | 0 | 0.06 | 0.01 | 1.45 |  | 1.47 | 2.43 |
| heist-06 | desktop | 4x | high | 0.03 | 0.08 | 0.03 | 0.07 | 0.02 | 0.24 | 0.03 | 0 | 0.03 | 0 | 1.91 | 2.04 | 2.07 | 2.64 |
| heist-06 | desktop | 4x | low | 0.03 | 0.06 | 0.02 | 0.09 | 0.02 | 0.25 | 0.03 | 0.01 | 0.04 | 0 | 1.44 |  | 1.46 | 2.07 |
| heist-06 | desktop | 6x | high | 0.05 | 0.1 | 0.04 | 0.14 | 0.03 | 0.33 | 0.03 | 0.01 | 0.05 | 0.01 | 2.69 | 2.85 | 2.89 | 3.72 |
| heist-06 | desktop | 6x | low | 0.03 | 0.08 | 0.03 | 0.1 | 0.02 | 0.33 | 0.03 | 0.01 | 0.06 | 0.01 | 2.07 |  | 2.1 | 2.92 |
| heist-06 | phone | 4x | high | 0.02 | 0.07 | 0.03 | 0.07 | 0.02 | 0.2 | 0.02 | 0 | 0.03 | 0 | 1.69 | 1.82 | 1.84 | 2.33 |
| heist-06 | phone | 4x | low | 0.03 | 0.07 | 0.03 | 0.11 | 0.02 | 0.28 | 0.02 | 0.01 | 0.05 | 0 | 1.56 |  | 1.58 | 2.27 |
| heist-06 | phone | 6x | high | 0.05 | 0.11 | 0.06 | 0.13 | 0.04 | 0.37 | 0.04 | 0.01 | 0.06 | 0.01 | 2.83 | 3.04 | 3.08 | 4.05 |
| heist-06 | phone | 6x | low | 0.02 | 0.05 | 0.02 | 0.05 | 0.01 | 0.26 | 0.03 | 0 | 0.03 | 0 | 1.69 |  | 1.7 | 2.26 |
| heist-07 | desktop | 4x | high | 0.06 | 0.11 | 0.05 | 0.17 | 0.05 | 0.36 | 0.04 | 0.01 | 0.07 | 0 | 3.08 | 3.28 | 3.32 | 4.42 |
| heist-07 | desktop | 4x | low | 0.02 | 0.03 | 0.02 | 0.05 | 0.02 | 0.25 | 0.03 | 0 | 0.03 | 0 | 1.43 |  | 1.44 | 2 |
| heist-07 | desktop | 6x | high | 0.06 | 0.1 | 0.04 | 0.15 | 0.05 | 0.49 | 0.05 | 0.01 | 0.07 | 0.01 | 3.6 | 3.8 | 3.85 | 5.1 |
| heist-07 | desktop | 6x | low | 0.03 | 0.04 | 0.02 | 0.07 | 0.02 | 0.34 | 0.03 | 0.01 | 0.06 | 0 | 2.12 |  | 2.15 | 2.89 |
| heist-07 | phone | 4x | high | 0.02 | 0.04 | 0.02 | 0.07 | 0.02 | 0.25 | 0.02 | 0 | 0.03 | 0 | 1.75 | 1.84 | 1.86 | 2.43 |
| heist-07 | phone | 4x | low | 0.02 | 0.02 | 0.01 | 0.03 | 0.01 | 0.21 | 0.02 | 0 | 0.02 | 0 | 1.1 |  | 1.12 | 1.57 |
| heist-07 | phone | 6x | high | 0.04 | 0.05 | 0.04 | 0.11 | 0.04 | 0.42 | 0.04 | 0.01 | 0.06 | 0.01 | 2.94 | 3.13 | 3.17 | 4.18 |
| heist-07 | phone | 6x | low | 0.02 | 0.03 | 0.01 | 0.05 | 0.01 | 0.31 | 0.03 | 0 | 0.04 | 0 | 1.67 |  | 1.69 | 2.33 |
| heist-08 | desktop | 4x | high | 0.02 | 0.02 | 0.02 | 0.05 | 0.01 | 0.29 | 0.02 | 0 | 0.02 | 0 | 1.46 | 1.55 | 1.57 | 2.15 |
| heist-08 | desktop | 4x | low | 0.02 | 0.02 | 0.01 | 0.04 | 0.01 | 0.27 | 0.02 | 0 | 0.02 | 0 | 0.87 |  | 0.88 | 1.41 |
| heist-08 | desktop | 6x | high | 0.03 | 0.04 | 0.02 | 0.08 | 0.02 | 0.46 | 0.03 | 0 | 0.05 | 0 | 2.1 | 2.26 | 2.29 | 3.22 |
| heist-08 | desktop | 6x | low | 0.02 | 0.03 | 0.01 | 0.05 | 0.02 | 0.38 | 0.03 | 0 | 0.05 | 0 | 1.39 |  | 1.4 | 2.15 |
| heist-08 | phone | 4x | high | 0.02 | 0.03 | 0.02 | 0.07 | 0.02 | 0.33 | 0.02 | 0 | 0.03 | 0 | 1.46 | 1.57 | 1.58 | 2.26 |
| heist-08 | phone | 4x | low | 0.02 | 0.01 | 0.01 | 0.04 | 0.01 | 0.25 | 0.02 | 0 | 0.03 | 0 | 0.84 |  | 0.84 | 1.34 |
| heist-08 | phone | 6x | high | 0.05 | 0.05 | 0.03 | 0.12 | 0.05 | 0.51 | 0.04 | 0.01 | 0.05 | 0.01 | 2.45 | 2.61 | 2.65 | 3.79 |
| heist-08 | phone | 6x | low | 0.02 | 0.02 | 0.02 | 0.07 | 0.02 | 0.39 | 0.03 | 0 | 0.05 | 0 | 1.37 |  | 1.39 | 2.2 |

### Metal: Heap and GC over a long window

| Scene | Viewport | CPU | Tier | Window | fps | Heap start / end / peak MB | Retained growth (after GC) | GC pauses (minor / major) | GC total / p95 / max ms |
|---|---|---|---|---|---|---|---|---|---|
| heist-08 | desktop | 4x | high | 60 s | 119.7 | 8.04 / 12.84 / 14.31 | 1.49 MB | 170 (166 / 4) | 177.8 / 1.97 / 6.77 |
| heist-08 | phone | 6x | low | 60 s | 119.7 | 7.13 / 12.58 / 14.63 | 1.42 MB | 139 (134 / 5) | 186.8 / 2.86 / 7.95 |
| yard | desktop | 4x | high | 60 s | 120 | 17.12 / 27.13 / 27.13 | 3.12 MB | 155 (154 / 1) | 132.8 / 1.57 / 4.31 |
| title | desktop | 4x | high | 60 s | 120 | 6.29 / 8.99 / 9.53 | 0.96 MB | 176 (155 / 21) | 219.7 / 3.34 / 4.82 |

### Metal: CPU profile: load (title + heist-01 + heist-08)

busy 1304.8 ms of 1319 ms, GC 97.4 ms, (program) 127.9 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `gl.<computed> @ (native)` | 176 | 13.5 | `onFirstUse @ node_modules/three/build/three.module.js ~L3995 (161.3 ms)` |
| `meshGrid @ src/render/voxel/extrude.ts ~L126` | 105 | 8 | `getFrameGeometry @ src/render/voxel/sheets.ts ~L190 (97 ms)` |
| `(garbage collector) @ (garbage collector)` | 97.4 | 7.5 | `(root) @ (root) (97.4 ms)` |
| `quad @ src/render/voxel/extrude.ts ~L96` | 62.9 | 4.8 | `meshGrid @ src/render/voxel/extrude.ts ~L126 (62.9 ms)` |
| `imageToPixels @ src/render/voxel/sheets.ts ~L55` | 50.5 | 3.9 | `(anonymous) @ src/render/voxel/sheets.ts ~L77 (36.4 ms)` |
| `analyseRect @ src/render/voxel/extrude.ts ~L16` | 40.9 | 3.1 | `getFrameGeometry @ src/render/voxel/sheets.ts ~L190 (40.2 ms)` |
| `at @ src/render/voxel/extrude.ts ~L138` | 33.9 | 2.6 | `meshGrid @ src/render/voxel/extrude.ts ~L126 (33.9 ms)` |
| `WebGLShader @ node_modules/three/build/three.module.js ~L3507` | 20.9 | 1.6 | `WebGLProgram @ node_modules/three/build/three.module.js ~L3713 (20.9 ms)` |
| `getFrameGeometry @ src/render/voxel/sheets.ts ~L190` | 19.6 | 1.5 | `prewarmSheet @ src/render/voxel/sheets.ts ~L215 (19.6 ms)` |
| `replaceLightNums @ node_modules/three/build/three.module.js ~L3616` | 18.8 | 1.4 | `WebGLProgram @ node_modules/three/build/three.module.js ~L3713 (18.8 ms)` |
| `restartAnim @ src/ui/ui.ts ~L21` | 17.4 | 1.3 | `show @ src/ui/ui.ts ~L635 (17.4 ms)` |
| `getExtension @ node_modules/three/build/three.module.js ~L2409` | 14.4 | 1.1 | `init @ node_modules/three/build/three.module.js ~L2419 (8.7 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `src/render/GameRenderer.ts` | 910.5 | 69.8 |
| `(native)` | 501.7 | 38.4 |
| `node_modules/three/build/three.module.js` | 467.3 | 35.8 |
| `src/render/post.ts` | 395.1 | 30.3 |
| `node_modules/three/examples/jsm/postprocessing/EffectComposer.js` | 390.9 | 30 |
| `src/render/diorama.ts` | 330.9 | 25.4 |
| `src/render/voxel/sheets.ts` | 330.3 | 25.3 |
| `node_modules/three/examples/jsm/postprocessing/RenderPass.js` | 329.1 | 25.2 |
| `src/app/App.ts` | 291.2 | 22.3 |
| `src/render/voxel/extrude.ts` | 248.1 | 19 |
| `src/ui/ui.ts` | 130.9 | 10 |
| `src/main.ts` | 126.5 | 9.7 |

### Metal: CPU profile: title desktop 4x high

busy 3050.1 ms of 8048.5 ms, GC 16.2 ms, (program) 841 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `get clientWidth @ (native)` | 381.8 | 12.5 | `placeLights @ src/render/GameRenderer.ts ~L939 (380 ms)` |
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 161.6 | 5.3 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (139 ms)` |
| `setValueM4 @ node_modules/three/build/three.module.js ~L3081` | 111.2 | 3.6 | `setValue @ node_modules/three/build/three.module.js ~L3484 (106.8 ms)` |
| `clipTileToCone @ src/render/vision.ts ~L61` | 89.3 | 2.9 | `update @ src/render/vision.ts ~L208 (88.3 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 77.6 | 2.5 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (64.4 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 68.9 | 2.3 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (51.8 ms)` |
| `gl.<computed> @ (native)` | 46.2 | 1.5 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (44.7 ms)` |
| `(anonymous) @ (native)` | 45.4 | 1.5 | `(root) @ (root) (45.4 ms)` |
| `bufferSubData @ (native)` | 45 | 1.5 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (45 ms)` |
| `renderObject @ node_modules/three/build/three.module.js ~L10062` | 43.7 | 1.4 | `renderObjects @ node_modules/three/build/three.module.js ~L10052 (43.7 ms)` |
| `getProgramCacheKey @ node_modules/three/build/three.module.js ~L4369` | 39.3 | 1.3 | `getProgram @ node_modules/three/build/three.module.js ~L10078 (39.3 ms)` |
| `bindVertexArray @ (native)` | 37.7 | 1.2 | `bindVertexArrayObject @ node_modules/three/build/three.module.js ~L893 (37.7 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 2182 | 71.5 |
| `src/render/diorama.ts` | 2106.3 | 69.1 |
| `src/render/GameRenderer.ts` | 2088.4 | 68.5 |
| `src/render/post.ts` | 1381.5 | 45.3 |
| `node_modules/three/examples/jsm/postprocessing/EffectComposer.js` | 1376.9 | 45.1 |
| `node_modules/three/build/three.module.js` | 1357.4 | 44.5 |
| `node_modules/three/examples/jsm/postprocessing/RenderPass.js` | 1163.7 | 38.2 |
| `node_modules/three/build/three.core.js` | 216.8 | 7.1 |
| `node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js` | 181.6 | 6 |
| `node_modules/three/examples/jsm/postprocessing/Pass.js` | 163.1 | 5.3 |
| `src/render/vision.ts` | 115.5 | 3.8 |
| `src/render/level.ts` | 55.8 | 1.8 |

Allocation: 7.28 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `setValueM4 @ node_modules/three/build/three.module.js` | 1.42 | 19.6 |
| `join @ (native)` | 0.69 | 9.4 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.66 | 9.1 |
| `getParameters @ node_modules/three/build/three.module.js` | 0.52 | 7.1 |
| `update @ src/render/vision.ts` | 0.45 | 6.2 |
| `getProgramCacheKeyParameters @ node_modules/three/build/three.module.js` | 0.45 | 6.2 |
| `update @ src/render/level.ts` | 0.25 | 3.5 |
| `sort @ (native)` | 0.21 | 2.9 |

### Metal: CPU profile: title desktop 4x low

busy 2184.5 ms of 8038.6 ms, GC 12.8 ms, (program) 666.9 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `get clientWidth @ (native)` | 334.6 | 15.3 | `placeLights @ src/render/GameRenderer.ts ~L939 (334.6 ms)` |
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 107.2 | 4.9 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (107.2 ms)` |
| `clipTileToCone @ src/render/vision.ts ~L61` | 85.1 | 3.9 | `update @ src/render/vision.ts ~L208 (84.2 ms)` |
| `bufferSubData @ (native)` | 45.9 | 2.1 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (45.9 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 44.8 | 2 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (32.5 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 40.7 | 1.9 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (39.2 ms)` |
| `gl.<computed> @ (native)` | 33.1 | 1.5 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (33.1 ms)` |
| `(anonymous) @ (native)` | 28.6 | 1.3 | `(root) @ (root) (28.6 ms)` |
| `copyArray @ node_modules/three/build/three.module.js ~L2983` | 28.6 | 1.3 | `setValueM4 @ node_modules/three/build/three.module.js ~L3081 (27.2 ms)` |
| `setValueV3f @ node_modules/three/build/three.module.js ~L3015` | 27.8 | 1.3 | `setValue @ node_modules/three/build/three.module.js ~L3435 (14.7 ms)` |
| `setProgram @ node_modules/three/build/three.module.js ~L10163` | 27.7 | 1.3 | `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653 (27.7 ms)` |
| `setValue @ node_modules/three/build/three.module.js ~L3435` | 24.9 | 1.1 | `upload @ node_modules/three/build/three.module.js ~L3492 (15.4 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 1498.8 | 68.6 |
| `src/render/diorama.ts` | 1450.1 | 66.4 |
| `src/render/GameRenderer.ts` | 1431.8 | 65.5 |
| `node_modules/three/build/three.module.js` | 832.7 | 38.1 |
| `node_modules/three/build/three.core.js` | 153 | 7 |
| `src/render/vision.ts` | 110.5 | 5.1 |
| `src/render/level.ts` | 37 | 1.7 |
| `src/render/actors.ts` | 33 | 1.5 |
| `src/render/camera.ts` | 20.2 | 0.9 |
| `src/render/voxel/VoxelSprite.ts` | 15.6 | 0.7 |
| `src/render/fx.ts` | 13.2 | 0.6 |
| `(garbage collector)` | 12.8 | 0.6 |

Allocation: 5.39 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `setValueM4 @ node_modules/three/build/three.module.js` | 0.87 | 16.1 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.61 | 11.4 |
| `update @ src/render/vision.ts` | 0.47 | 8.7 |
| `join @ (native)` | 0.35 | 6.5 |
| `getParameters @ node_modules/three/build/three.module.js` | 0.28 | 5.2 |
| `update @ src/render/level.ts` | 0.25 | 4.6 |
| `getProgramCacheKeyParameters @ node_modules/three/build/three.module.js` | 0.23 | 4.2 |
| `sort @ (native)` | 0.22 | 4.1 |

### Metal: CPU profile: heist-01 desktop 4x high

busy 2255.5 ms of 8056.2 ms, GC 18.8 ms, (program) 288.1 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `clipTileToCone @ src/render/vision.ts ~L61` | 214.2 | 9.5 | `update @ src/render/vision.ts ~L208 (213.5 ms)` |
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 105.9 | 4.7 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (88.1 ms)` |
| `setValueM4 @ node_modules/three/build/three.module.js ~L3081` | 101.6 | 4.5 | `setValue @ node_modules/three/build/three.module.js ~L3484 (92 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 78.4 | 3.5 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (61.3 ms)` |
| `bufferSubData @ (native)` | 76.6 | 3.4 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (76.6 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 72.3 | 3.2 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (61.5 ms)` |
| `get clientWidth @ (native)` | 62 | 2.7 | `placeLights @ src/render/GameRenderer.ts ~L939 (61.2 ms)` |
| `setProgram @ node_modules/three/build/three.module.js ~L10163` | 46.4 | 2.1 | `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653 (46.1 ms)` |
| `gl.<computed> @ (native)` | 44.8 | 2 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (42.5 ms)` |
| `getProgramCacheKey @ node_modules/three/build/three.module.js ~L4369` | 41.6 | 1.8 | `getProgram @ node_modules/three/build/three.module.js ~L10078 (41.6 ms)` |
| `w @ (native)` | 40.7 | 1.8 | `update @ src/render/GameRenderer.ts ~L460 (16.4 ms)` |
| `renderObject @ node_modules/three/build/three.module.js ~L5369` | 37.5 | 1.7 | `renderObject @ node_modules/three/build/three.module.js ~L5369 (34.7 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 1941.4 | 86.1 |
| `src/app/App.ts` | 1882.8 | 83.5 |
| `src/render/GameRenderer.ts` | 1823.2 | 80.8 |
| `src/render/post.ts` | 1320.4 | 58.5 |
| `node_modules/three/examples/jsm/postprocessing/EffectComposer.js` | 1316.6 | 58.4 |
| `node_modules/three/build/three.module.js` | 1286.8 | 57 |
| `node_modules/three/examples/jsm/postprocessing/RenderPass.js` | 1073.7 | 47.6 |
| `src/render/vision.ts` | 282.1 | 12.5 |
| `node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js` | 210.2 | 9.3 |
| `node_modules/three/examples/jsm/postprocessing/Pass.js` | 208.5 | 9.2 |
| `node_modules/three/build/three.core.js` | 198.5 | 8.8 |
| `src/render/level.ts` | 44 | 2 |

Allocation: 8.76 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `update @ src/render/vision.ts` | 1.97 | 22.4 |
| `setValueM4 @ node_modules/three/build/three.module.js` | 1.34 | 15.3 |
| `join @ (native)` | 0.61 | 6.9 |
| `getParameters @ node_modules/three/build/three.module.js` | 0.53 | 6 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.53 | 6 |
| `getProgramCacheKeyParameters @ node_modules/three/build/three.module.js` | 0.46 | 5.3 |
| `setValueV1fArray @ node_modules/three/build/three.module.js` | 0.19 | 2.1 |
| `sort @ (native)` | 0.19 | 2.1 |

### Metal: CPU profile: heist-01 desktop 4x low

busy 1506.3 ms of 8042.4 ms, GC 13.9 ms, (program) 207.2 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `clipTileToCone @ src/render/vision.ts ~L61` | 204.4 | 13.6 | `update @ src/render/vision.ts ~L208 (200.2 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 67.1 | 4.5 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (64.4 ms)` |
| `bufferSubData @ (native)` | 64.5 | 4.3 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (64.5 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 61.9 | 4.1 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (55.6 ms)` |
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 50.2 | 3.3 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (50.2 ms)` |
| `get clientWidth @ (native)` | 40.9 | 2.7 | `placeLights @ src/render/GameRenderer.ts ~L939 (40.7 ms)` |
| `renderObject @ node_modules/three/build/three.module.js ~L10062` | 36.8 | 2.4 | `renderObjects @ node_modules/three/build/three.module.js ~L10052 (36.8 ms)` |
| `update @ src/render/vision.ts ~L208` | 32 | 2.1 | `update @ src/render/GameRenderer.ts ~L460 (32 ms)` |
| `gl.<computed> @ (native)` | 27.9 | 1.9 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (26.1 ms)` |
| `setValueV3f @ node_modules/three/build/three.module.js ~L3015` | 26.6 | 1.8 | `setValue @ node_modules/three/build/three.module.js ~L3435 (16.3 ms)` |
| `setProgram @ node_modules/three/build/three.module.js ~L10163` | 23.9 | 1.6 | `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653 (23.9 ms)` |
| `(anonymous) @ (native)` | 22 | 1.5 | `(root) @ (root) (22 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 1279.9 | 85 |
| `src/app/App.ts` | 1235.2 | 82 |
| `src/render/GameRenderer.ts` | 1186.7 | 78.8 |
| `node_modules/three/build/three.module.js` | 753.9 | 50 |
| `src/render/vision.ts` | 262.9 | 17.5 |
| `node_modules/three/build/three.core.js` | 136.7 | 9.1 |
| `src/render/level.ts` | 31.1 | 2.1 |
| `src/ui/ui.ts` | 22.5 | 1.5 |
| `src/app/session.ts` | 21.3 | 1.4 |
| `src/render/actors.ts` | 17.3 | 1.2 |
| `src/render/fx.ts` | 17.1 | 1.1 |
| `src/render/camera.ts` | 14.5 | 1 |

Allocation: 6.69 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `update @ src/render/vision.ts` | 2.03 | 30.4 |
| `setValueM4 @ node_modules/three/build/three.module.js` | 0.69 | 10.2 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.59 | 8.9 |
| `join @ (native)` | 0.28 | 4.1 |
| `getParameters @ node_modules/three/build/three.module.js` | 0.2 | 3 |
| `sort @ (native)` | 0.2 | 3 |
| `next @ (native)` | 0.19 | 2.8 |
| `getProgramCacheKeyParameters @ node_modules/three/build/three.module.js` | 0.18 | 2.7 |

### Metal: CPU profile: heist-05 desktop 4x high

busy 2092.7 ms of 8053 ms, GC 16.6 ms, (program) 264.5 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `clipTileToCone @ src/render/vision.ts ~L61` | 210.6 | 10.1 | `update @ src/render/vision.ts ~L208 (206.3 ms)` |
| `setValueM4 @ node_modules/three/build/three.module.js ~L3081` | 107.6 | 5.1 | `setValue @ node_modules/three/build/three.module.js ~L3484 (101 ms)` |
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 107.3 | 5.1 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (96.2 ms)` |
| `bufferSubData @ (native)` | 77.4 | 3.7 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (77.4 ms)` |
| `get clientWidth @ (native)` | 74.6 | 3.6 | `placeLights @ src/render/GameRenderer.ts ~L939 (74.6 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 68.1 | 3.3 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (56.4 ms)` |
| `update @ src/render/vision.ts ~L208` | 48.3 | 2.3 | `update @ src/render/GameRenderer.ts ~L460 (48.3 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 38.9 | 1.9 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (32.8 ms)` |
| `(anonymous) @ (native)` | 38.5 | 1.8 | `(root) @ (root) (38.5 ms)` |
| `w @ (native)` | 35.7 | 1.7 | `update @ src/render/GameRenderer.ts ~L460 (12.7 ms)` |
| `clipHalf @ src/render/vision.ts ~L28` | 34.8 | 1.7 | `clipTileToCone @ src/render/vision.ts ~L61 (30.2 ms)` |
| `WebGLRenderer.render @ node_modules/three/build/three.module.js ~L9856` | 34.4 | 1.6 | `render @ node_modules/three/examples/jsm/postprocessing/Pass.js ~L142 (28.1 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 1799.1 | 86 |
| `src/app/App.ts` | 1746.3 | 83.5 |
| `src/render/GameRenderer.ts` | 1698 | 81.1 |
| `src/render/post.ts` | 1190.3 | 56.9 |
| `node_modules/three/examples/jsm/postprocessing/EffectComposer.js` | 1186.4 | 56.7 |
| `node_modules/three/build/three.module.js` | 1150.1 | 55 |
| `node_modules/three/examples/jsm/postprocessing/RenderPass.js` | 947 | 45.3 |
| `src/render/vision.ts` | 294.5 | 14.1 |
| `node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js` | 212.7 | 10.2 |
| `node_modules/three/examples/jsm/postprocessing/Pass.js` | 195.5 | 9.3 |
| `node_modules/three/build/three.core.js` | 154.5 | 7.4 |
| `src/render/level.ts` | 36.3 | 1.7 |

Allocation: 7.01 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `update @ src/render/vision.ts` | 1.82 | 26 |
| `setValueM4 @ node_modules/three/build/three.module.js` | 1.14 | 16.3 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.48 | 6.9 |
| `join @ (native)` | 0.33 | 4.7 |
| `getParameters @ node_modules/three/build/three.module.js` | 0.27 | 3.8 |
| `getProgramCacheKeyParameters @ node_modules/three/build/three.module.js` | 0.24 | 3.5 |
| `setValueV1fArray @ node_modules/three/build/three.module.js` | 0.21 | 2.9 |
| `projectObject @ node_modules/three/build/three.module.js` | 0.18 | 2.6 |

### Metal: CPU profile: heist-05 desktop 4x low

busy 1444.8 ms of 8045.2 ms, GC 10.3 ms, (program) 226.8 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `clipTileToCone @ src/render/vision.ts ~L61` | 193.5 | 13.4 | `update @ src/render/vision.ts ~L208 (191.2 ms)` |
| `get clientWidth @ (native)` | 61.9 | 4.3 | `placeLights @ src/render/GameRenderer.ts ~L939 (60.9 ms)` |
| `bufferSubData @ (native)` | 58.4 | 4 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (58.4 ms)` |
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 56.5 | 3.9 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (56.5 ms)` |
| `update @ src/render/vision.ts ~L208` | 55.2 | 3.8 | `update @ src/render/GameRenderer.ts ~L460 (55.2 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 54.8 | 3.8 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (49.4 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 35.9 | 2.5 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (28.1 ms)` |
| `copyArray @ node_modules/three/build/three.module.js ~L2983` | 35.2 | 2.4 | `setValueM4 @ node_modules/three/build/three.module.js ~L3081 (30.9 ms)` |
| `gl.<computed> @ (native)` | 31.8 | 2.2 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (31.3 ms)` |
| `renderObject @ node_modules/three/build/three.module.js ~L10062` | 27.7 | 1.9 | `renderObjects @ node_modules/three/build/three.module.js ~L10052 (27.7 ms)` |
| `setProgram @ node_modules/three/build/three.module.js ~L10163` | 26.3 | 1.8 | `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653 (26.3 ms)` |
| `(anonymous) @ (native)` | 23 | 1.6 | `(root) @ (root) (23 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 1198.9 | 83 |
| `src/app/App.ts` | 1157 | 80.1 |
| `src/render/GameRenderer.ts` | 1120.5 | 77.6 |
| `node_modules/three/build/three.module.js` | 667.5 | 46.2 |
| `src/render/vision.ts` | 269.1 | 18.6 |
| `node_modules/three/build/three.core.js` | 115.1 | 8 |
| `src/render/level.ts` | 23.5 | 1.6 |
| `src/app/session.ts` | 20.5 | 1.4 |
| `src/render/fx.ts` | 17.1 | 1.2 |
| `src/render/camera.ts` | 16.8 | 1.2 |
| `src/sim/rng.ts` | 16.6 | 1.2 |
| `src/ui/ui.ts` | 16.5 | 1.1 |

Allocation: 5.86 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `update @ src/render/vision.ts` | 1.92 | 32.7 |
| `setValueM4 @ node_modules/three/build/three.module.js` | 0.72 | 12.3 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.53 | 9 |
| `sort @ (native)` | 0.17 | 2.9 |
| `join @ (native)` | 0.16 | 2.8 |
| `getParameters @ node_modules/three/build/three.module.js` | 0.16 | 2.7 |
| `next @ (native)` | 0.15 | 2.5 |
| `innerSerialize @ (native)` | 0.15 | 2.5 |

### Metal: CPU profile: heist-08 desktop 4x high

busy 2016.5 ms of 8050.5 ms, GC 20.1 ms, (program) 282.1 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `clipTileToCone @ src/render/vision.ts ~L61` | 247.5 | 12.3 | `update @ src/render/vision.ts ~L208 (246.9 ms)` |
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 92.2 | 4.6 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (77 ms)` |
| `setValueM4 @ node_modules/three/build/three.module.js ~L3081` | 66.4 | 3.3 | `setValue @ node_modules/three/build/three.module.js ~L3484 (58.2 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 64.6 | 3.2 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (55.2 ms)` |
| `get clientWidth @ (native)` | 59.6 | 3 | `placeLights @ src/render/GameRenderer.ts ~L939 (59.1 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 59 | 2.9 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (52.6 ms)` |
| `bufferSubData @ (native)` | 55.1 | 2.7 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (55.1 ms)` |
| `gl.<computed> @ (native)` | 45.1 | 2.2 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (44.6 ms)` |
| `update @ src/render/vision.ts ~L208` | 39.9 | 2 | `update @ src/render/GameRenderer.ts ~L460 (39.9 ms)` |
| `w @ (native)` | 36.9 | 1.8 | `update @ src/render/GameRenderer.ts ~L460 (17.4 ms)` |
| `(anonymous) @ (native)` | 36.8 | 1.8 | `(root) @ (root) (36.8 ms)` |
| `setProgram @ node_modules/three/build/three.module.js ~L10163` | 35.9 | 1.8 | `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653 (35.9 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 1708.3 | 84.7 |
| `src/app/App.ts` | 1652.6 | 82 |
| `src/render/GameRenderer.ts` | 1611.6 | 79.9 |
| `src/render/post.ts` | 1096.7 | 54.4 |
| `node_modules/three/examples/jsm/postprocessing/EffectComposer.js` | 1090.4 | 54.1 |
| `node_modules/three/build/three.module.js` | 1056.3 | 52.4 |
| `node_modules/three/examples/jsm/postprocessing/RenderPass.js` | 858.4 | 42.6 |
| `src/render/vision.ts` | 314.2 | 15.6 |
| `node_modules/three/build/three.core.js` | 202 | 10 |
| `node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js` | 196.4 | 9.7 |
| `node_modules/three/examples/jsm/postprocessing/Pass.js` | 184 | 9.1 |
| `src/render/level.ts` | 34 | 1.7 |

Allocation: 6.17 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `update @ src/render/vision.ts` | 1.47 | 23.8 |
| `setValueM4 @ node_modules/three/build/three.module.js` | 0.62 | 10 |
| `join @ (native)` | 0.43 | 7 |
| `getParameters @ node_modules/three/build/three.module.js` | 0.35 | 5.7 |
| `getProgramCacheKeyParameters @ node_modules/three/build/three.module.js` | 0.31 | 5.1 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.3 | 4.8 |
| `setValueV1fArray @ node_modules/three/build/three.module.js` | 0.2 | 3.3 |
| `innerSerialize @ (native)` | 0.16 | 2.6 |

### Metal: CPU profile: heist-08 desktop 4x low

busy 1365.3 ms of 8040.3 ms, GC 10.4 ms, (program) 255.7 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `clipTileToCone @ src/render/vision.ts ~L61` | 224.6 | 16.4 | `update @ src/render/vision.ts ~L208 (221.6 ms)` |
| `bufferSubData @ (native)` | 58.2 | 4.3 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (58.2 ms)` |
| `get clientWidth @ (native)` | 44.4 | 3.3 | `placeLights @ src/render/GameRenderer.ts ~L939 (43.6 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 43.3 | 3.2 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (40.3 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 40.4 | 3 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (38 ms)` |
| `update @ src/render/vision.ts ~L208` | 34.6 | 2.5 | `update @ src/render/GameRenderer.ts ~L460 (34.6 ms)` |
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 31.9 | 2.3 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (31.9 ms)` |
| `gl.<computed> @ (native)` | 29.7 | 2.2 | `updateBuffer @ node_modules/three/build/three.module.js ~L65 (29 ms)` |
| `copyArray @ node_modules/three/build/three.module.js ~L2983` | 27.8 | 2 | `setValueM4 @ node_modules/three/build/three.module.js ~L3081 (23.9 ms)` |
| `w @ (native)` | 27.4 | 2 | `update @ src/render/GameRenderer.ts ~L460 (18.9 ms)` |
| `setProgram @ node_modules/three/build/three.module.js ~L10163` | 25.6 | 1.9 | `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653 (25.6 ms)` |
| `getProgramCacheKey @ node_modules/three/build/three.module.js ~L4369` | 21.2 | 1.6 | `getProgram @ node_modules/three/build/three.module.js ~L10078 (21.2 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 1098.1 | 80.4 |
| `src/app/App.ts` | 1056.9 | 77.4 |
| `src/render/GameRenderer.ts` | 1010.7 | 74 |
| `node_modules/three/build/three.module.js` | 570.4 | 41.8 |
| `src/render/vision.ts` | 277.9 | 20.4 |
| `node_modules/three/build/three.core.js` | 111 | 8.1 |
| `src/app/session.ts` | 26.2 | 1.9 |
| `src/render/level.ts` | 25.8 | 1.9 |
| `src/sim/rng.ts` | 20.9 | 1.5 |
| `src/ui/ui.ts` | 17.6 | 1.3 |
| `src/render/fx.ts` | 13.5 | 1 |
| `src/render/camera.ts` | 12.6 | 0.9 |

Allocation: 5.17 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `update @ src/render/vision.ts` | 1.51 | 29.2 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.36 | 6.9 |
| `setValueM4 @ node_modules/three/build/three.module.js` | 0.31 | 6.1 |
| `join @ (native)` | 0.26 | 5.1 |
| `getParameters @ node_modules/three/build/three.module.js` | 0.26 | 5 |
| `getProgramCacheKeyParameters @ node_modules/three/build/three.module.js` | 0.21 | 4.1 |
| `next @ (native)` | 0.14 | 2.8 |
| `copyArray @ node_modules/three/build/three.module.js` | 0.14 | 2.6 |

### Metal: CPU profile: yard desktop 4x high

busy 1367.1 ms of 8046.9 ms, GC 10.1 ms, (program) 168.2 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 87.5 | 6.4 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (85 ms)` |
| `stepAgents @ src/yard/wander.ts ~L203` | 85 | 6.2 | `tick @ src/yard/Yard.ts ~L703 (85 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 72.6 | 5.3 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (60.8 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 67.9 | 5 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (48.1 ms)` |
| `setValueM4 @ node_modules/three/build/three.module.js ~L3081` | 60.9 | 4.5 | `setProgram @ node_modules/three/build/three.module.js ~L10163 (60.6 ms)` |
| `setProgram @ node_modules/three/build/three.module.js ~L10163` | 47.5 | 3.5 | `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653 (47.5 ms)` |
| `update @ node_modules/three/build/three.module.js ~L2691` | 45.7 | 3.3 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (44.9 ms)` |
| `renderObject @ node_modules/three/build/three.module.js ~L10062` | 41.7 | 3.1 | `renderObjects @ node_modules/three/build/three.module.js ~L10052 (41.7 ms)` |
| `setup @ node_modules/three/build/three.module.js ~L874` | 32.1 | 2.3 | `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653 (32.1 ms)` |
| `WebGLRenderer.render @ node_modules/three/build/three.module.js ~L9856` | 29.8 | 2.2 | `render @ node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js ~L200 (21.8 ms)` |
| `(anonymous) @ (native)` | 28.9 | 2.1 | `(root) @ (root) (28.9 ms)` |
| `sort @ node_modules/three/build/three.module.js ~L4636` | 25.3 | 1.8 | `WebGLRenderer.render @ node_modules/three/build/three.module.js ~L9856 (24.8 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 1182.1 | 86.5 |
| `src/yard/Yard.ts` | 1135.2 | 83 |
| `node_modules/three/examples/jsm/postprocessing/EffectComposer.js` | 990 | 72.4 |
| `src/render/post.ts` | 989.5 | 72.4 |
| `node_modules/three/build/three.module.js` | 979.5 | 71.7 |
| `node_modules/three/examples/jsm/postprocessing/RenderPass.js` | 783.7 | 57.3 |
| `node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js` | 179.3 | 13.1 |
| `node_modules/three/build/three.core.js` | 160.2 | 11.7 |
| `src/yard/wander.ts` | 89.8 | 6.6 |
| `node_modules/three/examples/jsm/postprocessing/ShaderPass.js` | 21.9 | 1.6 |
| `node_modules/three/examples/jsm/postprocessing/Pass.js` | 19.4 | 1.4 |
| `src/render/voxel/VoxelSprite.ts` | 15 | 1.1 |

Allocation: 8.38 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `stepAgents @ src/yard/wander.ts` | 3.15 | 37.6 |
| `setValueM4 @ node_modules/three/build/three.module.js` | 1.38 | 16.5 |
| `hypot @ (native)` | 1.21 | 14.5 |
| `setValueM3 @ node_modules/three/build/three.module.js` | 0.36 | 4.3 |
| `painterSortStable @ node_modules/three/build/three.module.js` | 0.33 | 3.9 |
| `projectObject @ node_modules/three/build/three.module.js` | 0.22 | 2.7 |
| `setValueV1fArray @ node_modules/three/build/three.module.js` | 0.2 | 2.4 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.17 | 2.1 |

### Metal: CPU profile: yard desktop 4x low

busy 895 ms of 8040.6 ms, GC 11 ms, (program) 132.3 ms

| Self (top 12) | ms | % busy | Top caller |
|---|---|---|---|
| `stepAgents @ src/yard/wander.ts ~L203` | 73 | 8.2 | `tick @ src/yard/Yard.ts ~L703 (73 ms)` |
| `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653` | 61.4 | 6.9 | `renderObject @ node_modules/three/build/three.module.js ~L10062 (61.4 ms)` |
| `projectObject @ node_modules/three/build/three.module.js ~L9935` | 61.2 | 6.8 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (57.5 ms)` |
| `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811` | 51.8 | 5.8 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (37.3 ms)` |
| `setValueM4 @ node_modules/three/build/three.module.js ~L3081` | 32.8 | 3.7 | `setProgram @ node_modules/three/build/three.module.js ~L10163 (32.6 ms)` |
| `update @ node_modules/three/build/three.module.js ~L2691` | 32.8 | 3.7 | `projectObject @ node_modules/three/build/three.module.js ~L9935 (32.8 ms)` |
| `bindVertexArray @ (native)` | 27.1 | 3 | `bindVertexArrayObject @ node_modules/three/build/three.module.js ~L893 (27.1 ms)` |
| `setProgram @ node_modules/three/build/three.module.js ~L10163` | 25.1 | 2.8 | `WebGLRenderer.renderBufferDirect @ node_modules/three/build/three.module.js ~L9653 (25.1 ms)` |
| `sort @ node_modules/three/build/three.module.js ~L4636` | 23.5 | 2.6 | `WebGLRenderer.render @ node_modules/three/build/three.module.js ~L9856 (23.5 ms)` |
| `needsUpdate @ node_modules/three/build/three.module.js ~L945` | 23.2 | 2.6 | `setup @ node_modules/three/build/three.module.js ~L874 (23.2 ms)` |
| `multiplyMatrices @ node_modules/three/build/three.core.js ~L7040` | 21.9 | 2.4 | `updateMatrixWorld @ node_modules/three/build/three.core.js ~L8811 (17.1 ms)` |
| `bufferData @ (native)` | 18.5 | 2.1 | `createBuffer @ node_modules/three/build/three.module.js ~L36 (18.5 ms)` |

| Module inclusive (top 12) | ms | % busy |
|---|---|---|
| `(native)` | 748.6 | 83.6 |
| `src/yard/Yard.ts` | 712.9 | 79.6 |
| `node_modules/three/build/three.module.js` | 590.6 | 66 |
| `node_modules/three/build/three.core.js` | 98.6 | 11 |
| `src/yard/wander.ts` | 80.2 | 9 |
| `src/render/voxel/VoxelSprite.ts` | 11.9 | 1.3 |
| `(garbage collector)` | 11 | 1.2 |

Allocation: 7.42 MB/s sampled (including objects already collected).

| Allocating function (top 8) | MB/s | % |
|---|---|---|
| `stepAgents @ src/yard/wander.ts` | 3.21 | 43.2 |
| `hypot @ (native)` | 1.18 | 15.9 |
| `setValueM4 @ node_modules/three/build/three.module.js` | 0.94 | 12.7 |
| `setValueM3 @ node_modules/three/build/three.module.js` | 0.35 | 4.7 |
| `painterSortStable @ node_modules/three/build/three.module.js` | 0.33 | 4.4 |
| `tick @ src/yard/Yard.ts` | 0.18 | 2.4 |
| `setValueV3f @ node_modules/three/build/three.module.js` | 0.17 | 2.3 |
| `innerSerialize @ (native)` | 0.14 | 2 |

## Measurements: SwiftShader (GPU-cost proxy)

Run: 2026-09-29T20:16:26.582Z, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver), Chromium 151.0.7922.34, host Apple M3 Pro x12, 36 GB.

### SwiftShader: Load

| Viewport | CPU | Tier | FCP | Title interactive | Diorama 1st frame | Title req / kB | Title shader ms (links) | Title TBT | First heist | Heist req / kB | Heist shader ms (links) | Heist TBT | 2nd heist | Yard ready / all sheets | Yard TBT | Heap title / heist / yard MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop | 1x | high | n/a | 69.3 ms | 472.6 ms | 5 / 268.5 | 2671.9 (27) | 0 ms | 4856.1 ms | 15 / 978.1 | 3714.8 (54) | 3965 ms | 4266.5 ms | 4084.5 / 16580 ms | 2396 ms | 5.4 / 7.22 / 20.46 |
| desktop | 1x | low | n/a | 68.2 ms | 115.6 ms | 8 / 398.3 | 1136.7 (16) | 0 ms | 2279.1 ms | 12 / 848.3 | 1524.6 (22) | 1543 ms | 1063.6 ms | 1526.9 / 5500.1 ms | 637 ms | 5.34 / 6.7 / 18.62 |
| desktop | 4x | high | n/a | 224.3 ms | 305.2 ms | 17 / 1200.6 | 5968.8 (35) | 2757 ms | 6398.9 ms | 3 / 46 | 5049.6 (54) | 5223 ms | 2448.6 ms | 4748 / 45576.1 ms | 2479 ms | 5.47 / 7.48 / 22.22 |
| desktop | 4x | low | n/a | 228.5 ms | 286.1 ms | 17 / 1200.6 | 2273.1 (21) | 1235 ms | 2573.6 ms | 3 / 46 | 1497.5 (22) | 1622 ms | 1230.4 ms | 2153.7 / 15588.3 ms | 662 ms | 5 / 6.76 / 19.62 |
| desktop | 6x | high | n/a | 330.9 ms | 419.9 ms | 17 / 1200.6 | 6336.8 (36) | 2845 ms | 5229.3 ms | 3 / 46 | 3742.4 (54) | 3992 ms | 2701.6 ms | 5633.7 / 57923 ms | 2478 ms | 5.46 / 7.49 / 22.75 |
| desktop | 6x | low | n/a | 320.2 ms | 387.7 ms | 17 / 1200.6 | 2413.9 (21) | 1318 ms | 2018.7 ms | 3 / 46 | 1097.1 (22) | 1290 ms | 1107.9 ms | 2400.7 / 20484.3 ms | 667 ms | 5.29 / 6.76 / 20.13 |
| phone | 1x | high | n/a | 275.3 ms | 323.2 ms | 8 / 398.3 | 1621.8 (26) | 0 ms | 3986 ms | 12 / 848.3 | 3199.1 (52) | 3198 ms | 3910 ms | 4052.1 / 19091.5 ms | 2355 ms | 5.8 / 7.49 / 20.1 |
| phone | 1x | low | n/a | 78.7 ms | 122.9 ms | 8 / 398.3 | 764.7 (15) | 0 ms | 1658.2 ms | 12 / 848.3 | 1427.8 (22) | 1397 ms | 687.4 ms | 1113.9 / 3985.5 ms | 1298 ms | 5.25 / 6.58 / 18.29 |
| phone | 4x | high | n/a | 222.9 ms | 299.6 ms | 17 / 1200.6 | 5255.9 (34) | 1841 ms | 5102.6 ms | 3 / 46 | 4456.2 (52) | 4527 ms | 2483.8 ms | 4935 / 53950 ms | 2488 ms | 5.48 / 7.51 / 21.57 |
| phone | 4x | low | n/a | 223.4 ms | 284.8 ms | 17 / 1200.6 | 1898.3 (20) | 877 ms | 1753.8 ms | 3 / 46 | 1124.1 (22) | 1277 ms | 1087.1 ms | 1953.1 / 12763 ms | 643 ms | 4.97 / 6.71 / 19.04 |
| phone | 6x | high | n/a | 331.5 ms | 421.5 ms | 17 / 1200.6 | 5413.5 (35) | 1968 ms | 5275.3 ms | 3 / 46 | 4454 (52) | 4617 ms | 1945.7 ms | 4826 / 70778.2 ms | 2539 ms | 5.49 / 7.3 / 22.04 |
| phone | 6x | low | n/a | 326.6 ms | 391.5 ms | 17 / 1200.6 | 1987.8 (20) | 981 ms | 1750.5 ms | 3 / 46 | 1255.4 (22) | 1362 ms | 961.3 ms | 1996.4 / 17003.6 ms | 1313 ms | 5 / 6.58 / 19.44 |

### SwiftShader: Runtime

| Scene | Viewport | CPU | Tier | fps | p50 / p95 / p99 ms | JS/frame p50 / p95 | non-JS ms | Long tasks (TBT) | Draws | Tris | Geo / Tex / Prog | Heap MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| title | desktop | 4x | high | 8.1 | 117.5 / 131.8 / 257.4 | 3.4 / 5.2 | 120.22 | 0 (0 ms) | 84.5 | 44546 | buf 492 / tex 24 / prog 36 | 9.58 |
| title | desktop | 4x | low | 26.7 | 35 / 42.8 / 49.9 | 2.2 / 3 | 35.16 | 0 (0 ms) | 58.5 | 26506 | buf 486 / tex 9 / prog 21 | 8.11 |
| title | desktop | 6x | high | 8 | 117.9 / 140.5 / 258 | 5.2 / 7.6 | 119.82 | 0 (0 ms) | 84.5 | 44551 | buf 492 / tex 24 / prog 36 | 8.66 |
| title | desktop | 6x | low | 26.8 | 34.8 / 43.2 / 43.6 | 3.5 / 4.4 | 33.92 | 0 (0 ms) | 58.5 | 26514 | buf 486 / tex 9 / prog 21 | 7.97 |
| title | phone | 4x | high | 10.3 | 91.6 / 115.1 / 291.8 | 3.2 / 4.1 | 94.24 | 0 (0 ms) | 80.3 | 44419 | buf 484 / tex 23 / prog 35 | 10.95 |
| title | phone | 4x | low | 35.1 | 26.1 / 34.6 / 35.2 | 2.2 / 2.8 | 26.35 | 0 (0 ms) | 54.5 | 26352 | buf 474 / tex 8 / prog 20 | 7.55 |
| title | phone | 6x | high | 10.3 | 91.7 / 99.6 / 283.6 | 4.9 / 6.3 | 92.59 | 0 (0 ms) | 80.3 | 44409 | buf 480 / tex 23 / prog 35 | 11.87 |
| title | phone | 6x | low | 35 | 26.2 / 34.5 / 35.3 | 3.2 / 4.2 | 25.37 | 0 (0 ms) | 54.5 | 26375 | buf 474 / tex 8 / prog 20 | 7.66 |
| heist-01 | desktop | 4x | high | 7.2 | 116.4 / 300.6 / 757 | 4 / 7.1 | 121.78 | 1 (707 ms) | 79.6 | 74872 | 148 / 20 / 56 | 10.13 |
| heist-01 | desktop | 4x | low | 35.6 | 25.8 / 34.7 / 48.7 | 2.4 / 3.2 | 25.68 | 0 (0 ms) | 49.3 | 41124 | 142 / 5 / 22 | 11.17 |
| heist-01 | desktop | 6x | high | 8.1 | 116.4 / 159.7 / 408.7 | 6.2 / 10.4 | 116.86 | 0 (0 ms) | 79.2 | 74563 | 152 / 20 / 56 | 11.03 |
| heist-01 | desktop | 6x | low | 35.5 | 25.7 / 34.7 / 43.4 | 3.5 / 5 | 24.58 | 0 (0 ms) | 49.2 | 41148 | 143 / 5 / 22 | 12.6 |
| heist-01 | phone | 4x | high | 6.1 | 149.8 / 249.8 / 493.3 | 4.3 / 6.4 | 159.22 | 0 (0 ms) | 74.4 | 74242 | 152 / 19 / 54 | 20.55 |
| heist-01 | phone | 4x | low | 42.3 | 24.5 / 32.6 / 66.5 | 2.3 / 3 | 21.14 | 1 (31 ms) | 40 | 37957 | 131 / 5 / 22 | 16.17 |
| heist-01 | phone | 6x | high | 6.3 | 150 / 216.7 / 425.3 | 6.3 / 9.6 | 152.9 | 0 (0 ms) | 73.9 | 73982 | 152 / 19 / 54 | 51.54 |
| heist-01 | phone | 6x | low | 42.6 | 24.6 / 31.6 / 41.9 | 3.2 / 4.8 | 19.91 | 1 (33 ms) | 40 | 37905 | 130 / 5 / 22 | 15.46 |
| heist-02 | desktop | 4x | high | 7.4 | 110 / 384.4 / 526.3 | 3.5 / 324.4 | 110.56 | 3 (1106 ms) | 58 | 62633 | 83 / 19 / 48 | 15.18 |
| heist-02 | desktop | 4x | low | 36.1 | 25.3 / 40.2 / 101.5 | 1.9 / 2.9 | 24.93 | 2 (124 ms) | 36.5 | 35327 | 94 / 4 / 19 | 9.46 |
| heist-02 | desktop | 6x | high | 7.7 | 115.8 / 401.5 / 574.5 | 5.6 / 9.8 | 117.74 | 1 (381 ms) | 58.3 | 62756 | 85 / 19 / 48 | 19.53 |
| heist-02 | desktop | 6x | low | 35.9 | 25.2 / 40.8 / 76.7 | 2.9 / 4.3 | 24.41 | 1 (84 ms) | 35.9 | 35110 | 89 / 4 / 19 | 13.31 |
| heist-02 | phone | 4x | high | 6.4 | 143.5 / 190.1 / 499.3 | 3.6 / 7.2 | 141.68 | 1 (449 ms) | 53.8 | 61494 | 85 / 19 / 49 | 14.66 |
| heist-02 | phone | 4x | low | 43.6 | 24.3 / 31.4 / 42 | 1.8 / 2.5 | 20.87 | 1 (48 ms) | 30.6 | 33664 | 92 / 4 / 19 | 7.65 |
| heist-02 | phone | 6x | high | 5.5 | 149 / 426.4 / 1217.3 | 5.3 / 9.5 | 164.93 | 1 (486 ms) | 53.9 | 61503 | 87 / 19 / 49 | 25.2 |
| heist-02 | phone | 6x | low | 43.3 | 24.3 / 32.9 / 41.8 | 2.7 / 4.1 | 20.1 | 1 (53 ms) | 30.5 | 33595 | 90 / 4 / 19 | 7.63 |
| heist-03 | desktop | 4x | high | 8.8 | 108.7 / 139.9 / 342.5 | 3.4 / 5.3 | 110.46 | 0 (0 ms) | 90.1 | 59216 | 104 / 18 / 49 | 9.95 |
| heist-03 | desktop | 4x | low | 37.8 | 25.2 / 34.3 / 41.6 | 2.1 / 3 | 24.33 | 0 (0 ms) | 62.2 | 33773 | 109 / 3 / 20 | 10.81 |
| heist-03 | desktop | 6x | high | 7.1 | 109.2 / 550.4 / 784.9 | 5.2 / 9.4 | 121.1 | 1 (731 ms) | 88.9 | 58896 | 101 / 18 / 49 | 14.74 |
| heist-03 | desktop | 6x | low | 37.9 | 25.1 / 34.2 / 41.7 | 2.9 / 4.2 | 23.4 | 0 (0 ms) | 61.7 | 33759 | 109 / 3 / 20 | 7.85 |
| heist-03 | phone | 4x | high | 6.5 | 142.1 / 191.7 / 467.5 | 3.7 / 5.9 | 149.14 | 0 (0 ms) | 83.2 | 58512 | 100 / 18 / 49 | 43.68 |
| heist-03 | phone | 4x | low | 46.5 | 23.6 / 26.7 / 34.7 | 1.9 / 2.6 | 19.58 | 0 (0 ms) | 54.4 | 32122 | 111 / 3 / 20 | 11.1 |
| heist-03 | phone | 6x | high | 6.5 | 142.5 / 199.6 / 483.3 | 5.4 / 8.8 | 148.22 | 0 (0 ms) | 83.4 | 58593 | 100 / 18 / 49 | 43.81 |
| heist-03 | phone | 6x | low | 45.6 | 23.8 / 26.9 / 34.8 | 2.8 / 4 | 19.12 | 0 (0 ms) | 53.7 | 32011 | 106 / 3 / 20 | 9.31 |
| heist-04 | desktop | 4x | high | 8.6 | 108.5 / 141.5 / 316.2 | 3.6 / 5.6 | 112.4 | 0 (0 ms) | 71.9 | 73522 | 116 / 19 / 52 | 9.5 |
| heist-04 | desktop | 4x | low | 37.4 | 25.3 / 33.8 / 41.8 | 2.2 / 3.3 | 24.54 | 0 (0 ms) | 44.8 | 40789 | 113 / 4 / 21 | 9.09 |
| heist-04 | desktop | 6x | high | 8.7 | 108.6 / 140.6 / 300.8 | 5.4 / 8.9 | 109.54 | 0 (0 ms) | 72.1 | 73590 | 113 / 19 / 52 | 9.47 |
| heist-04 | desktop | 6x | low | 38.1 | 25.1 / 34 / 34.9 | 3.1 / 4.4 | 23.09 | 0 (0 ms) | 44.8 | 40774 | 114 / 4 / 21 | 9.31 |
| heist-04 | phone | 4x | high | 6.2 | 141.5 / 291.4 / 623.5 | 4 / 6.7 | 146.72 | 1 (429 ms) | 63 | 68224 | 109 / 19 / 52 | 57.92 |
| heist-04 | phone | 4x | low | 47.8 | 17.8 / 26.6 / 41.4 | 1.9 / 3 | 18.99 | 0 (0 ms) | 33.7 | 35296 | 103 / 4 / 21 | 10.2 |
| heist-04 | phone | 6x | high | 6.3 | 141.4 / 306.4 / 601.9 | 6.1 / 10.8 | 143.55 | 1 (439 ms) | 63.2 | 68201 | 110 / 19 / 52 | 56.96 |
| heist-04 | phone | 6x | low | 48.3 | 18 / 26.3 / 35 | 2.8 / 4.3 | 17.81 | 0 (0 ms) | 33.5 | 35208 | 104 / 4 / 21 | 10.77 |
| heist-05 | desktop | 4x | high | 8 | 109.7 / 159.9 / 466.4 | 3.9 / 6.1 | 120.2 | 0 (0 ms) | 76.6 | 67508 | 108 / 18 / 49 | 8.74 |
| heist-05 | desktop | 4x | low | 39.5 | 25 / 33.6 / 41.7 | 2.3 / 3.2 | 23.03 | 0 (0 ms) | 43.8 | 36541 | 103 / 3 / 20 | 8.98 |
| heist-05 | desktop | 6x | high | 8 | 109.5 / 126.5 / 740.7 | 5.8 / 10 | 118 | 0 (0 ms) | 76.4 | 67484 | 107 / 18 / 49 | 10.98 |
| heist-05 | desktop | 6x | low | 38.7 | 25.1 / 34.4 / 35 | 3.4 / 5.2 | 22.38 | 0 (0 ms) | 44.8 | 36581 | 98 / 3 / 20 | 11.27 |
| heist-05 | phone | 4x | high | 6 | 149 / 357.6 / 433.7 | 4.2 / 274.2 | 139.04 | 3 (924 ms) | 60.3 | 64536 | 115 / 18 / 49 | 51.29 |
| heist-05 | phone | 4x | low | 47.5 | 18.1 / 32.1 / 43.2 | 2 / 2.9 | 18.62 | 2 (63 ms) | 30.1 | 32033 | 94 / 3 / 20 | 11.59 |
| heist-05 | phone | 6x | high | 6.1 | 149.2 / 348.2 / 565.9 | 6.3 / 11.4 | 142.14 | 2 (619 ms) | 60.6 | 64692 | 113 / 18 / 49 | 51.18 |
| heist-05 | phone | 6x | low | 46.6 | 18.3 / 32.4 / 58.7 | 3 / 4.3 | 18.24 | 1 (17 ms) | 30.3 | 32129 | 93 / 3 / 20 | 11.31 |
| heist-06 | desktop | 4x | high | 7.2 | 132 / 267.5 / 598.2 | 3.3 / 6.3 | 125.23 | 1 (546 ms) | 62.1 | 80153 | 119 / 18 / 49 | 10.85 |
| heist-06 | desktop | 4x | low | 29.4 | 33.4 / 42.1 / 50.1 | 1.9 / 2.9 | 32.01 | 0 (0 ms) | 37 | 43303 | 114 / 3 / 20 | 17.41 |
| heist-06 | desktop | 6x | high | 6.8 | 133.4 / 324.6 / 598.7 | 5.4 / 9.7 | 131.25 | 1 (545 ms) | 62.3 | 80380 | 119 / 18 / 49 | 9.62 |
| heist-06 | desktop | 6x | low | 29.2 | 33.5 / 42.5 / 50.3 | 2.9 / 4.2 | 31.28 | 0 (0 ms) | 37.2 | 43349 | 116 / 3 / 20 | 9.52 |
| heist-06 | phone | 4x | high | 5.6 | 159.7 / 500 / 650.1 | 3.7 / 7 | 148.22 | 2 (1044 ms) | 63.2 | 77858 | 120 / 18 / 49 | 9.1 |
| heist-06 | phone | 4x | low | 37 | 25.1 / 34.6 / 91.6 | 1.9 / 2.7 | 24.33 | 2 (131 ms) | 37.2 | 39730 | 118 / 3 / 20 | 11.84 |
| heist-06 | phone | 6x | high | 5.8 | 165.1 / 316.4 / 533.3 | 5.7 / 11 | 143.43 | 2 (938 ms) | 63 | 77667 | 119 / 18 / 49 | 48.67 |
| heist-06 | phone | 6x | low | 37.2 | 25.1 / 34.8 / 56.9 | 2.7 / 4 | 23.38 | 2 (132 ms) | 37.2 | 39742 | 120 / 3 / 20 | 14.64 |
| heist-07 | desktop | 4x | high | 7.8 | 116.9 / 143.7 / 523.3 | 4.1 / 6.1 | 115.68 | 1 (440 ms) | 108.6 | 81144 | 178 / 18 / 49 | 11.26 |
| heist-07 | desktop | 4x | low | 33.7 | 31.7 / 35.1 / 42.7 | 2.5 / 3.3 | 27.16 | 0 (0 ms) | 72.1 | 46052 | 179 / 3 / 20 | 12.81 |
| heist-07 | desktop | 6x | high | 7.5 | 116.8 / 192.6 / 608.8 | 6.5 / 9.5 | 116.44 | 1 (530 ms) | 108.7 | 81209 | 175 / 18 / 49 | 10.85 |
| heist-07 | desktop | 6x | low | 33.6 | 31.9 / 34.7 / 41.9 | 3.6 / 4.9 | 26.1 | 0 (0 ms) | 72.1 | 45974 | 179 / 3 / 20 | 13.33 |
| heist-07 | phone | 4x | high | 5.7 | 149.9 / 491.7 / 642.5 | 4.7 / 6.6 | 160.16 | 1 (436 ms) | 88.2 | 75804 | 168 / 18 / 49 | 9.55 |
| heist-07 | phone | 4x | low | 41.6 | 24.7 / 31.9 / 41.7 | 2.2 / 3 | 21.57 | 1 (16 ms) | 48.8 | 38242 | 154 / 3 / 20 | 8.17 |
| heist-07 | phone | 6x | high | 6.1 | 149.7 / 358.4 / 640.1 | 6.6 / 9.8 | 145.95 | 1 (437 ms) | 87.9 | 75401 | 171 / 18 / 49 | 11.06 |
| heist-07 | phone | 6x | low | 41.5 | 24.8 / 32.4 / 41.1 | 3.3 / 4.7 | 20.53 | 1 (18 ms) | 48.7 | 38422 | 153 / 3 / 20 | 10.79 |
| heist-08 | desktop | 4x | high | 8.8 | 107.9 / 124.9 / 376.1 | 3.5 / 5.5 | 109.78 | 0 (0 ms) | 48.9 | 76031 | 102 / 19 / 52 | 9.05 |
| heist-08 | desktop | 4x | low | 42.6 | 24.8 / 32.5 / 34.1 | 2.1 / 3 | 21.35 | 0 (0 ms) | 26.7 | 40766 | 79 / 4 / 21 | 9.5 |
| heist-08 | desktop | 6x | high | 8.8 | 108.2 / 117.6 / 433.8 | 5.3 / 8.3 | 107.82 | 0 (0 ms) | 48.9 | 76049 | 102 / 19 / 52 | 9.81 |
| heist-08 | desktop | 6x | low | 42.1 | 24.8 / 32.7 / 34.8 | 3.1 / 4.2 | 20.62 | 0 (0 ms) | 26.6 | 40743 | 81 / 4 / 21 | 14.56 |
| heist-08 | phone | 4x | high | 6.4 | 141.4 / 282.8 / 492 | 4.1 / 6.7 | 141.21 | 1 (441 ms) | 50.7 | 78361 | 118 / 19 / 52 | 56.8 |
| heist-08 | phone | 4x | low | 49.3 | 17.8 / 26.7 / 34.6 | 1.9 / 2.9 | 18.28 | 0 (0 ms) | 22.8 | 39797 | 76 / 4 / 21 | 10.65 |
| heist-08 | phone | 6x | high | 6.6 | 141.6 / 183.3 / 518.5 | 5.5 / 9.2 | 145.65 | 0 (0 ms) | 49.6 | 77912 | 120 / 19 / 52 | 14.17 |
| heist-08 | phone | 6x | low | 48.7 | 17.7 / 26.6 / 34.8 | 2.9 / 4.4 | 17.54 | 0 (0 ms) | 22.7 | 39777 | 73 / 4 / 21 | 10.95 |
| yard | desktop | 4x | high | 8.6 | 116.6 / 124.1 / 126.2 | 2.9 / 3.5 | 113.6 | 0 (0 ms) | 84.3 | 81766 | buf 6224 / tex 20 / prog 20 | 23.82 |
| yard | desktop | 4x | low | 29.3 | 33.5 / 41.5 / 42.7 | 1.8 / 2.3 | 32.37 | 0 (0 ms) | 67.2 | 71624 | buf 5146 / tex 5 / prog 10 | 41.45 |
| yard | desktop | 6x | high | 8.5 | 116.7 / 125.3 / 134.1 | 4.5 / 5.2 | 112.86 | 0 (0 ms) | 84.2 | 81694 | buf 6180 / tex 20 / prog 20 | 29.84 |
| yard | desktop | 6x | low | 29.2 | 33.4 / 41.6 / 42.7 | 2.6 / 3.5 | 31.61 | 0 (0 ms) | 67.3 | 71550 | buf 5310 / tex 5 / prog 10 | 33.44 |
| yard | phone | 4x | high | 6.8 | 149.3 / 151.3 / 151.7 | 2.5 / 3.3 | 145.3 | 0 (0 ms) | 70.7 | 72285 | buf 4424 / tex 20 / prog 20 | 28.48 |
| yard | phone | 4x | low | 36.5 | 25.7 / 34.4 / 35.1 | 1.5 / 2.2 | 25.85 | 0 (0 ms) | 54.2 | 62665 | buf 3834 / tex 5 / prog 10 | 37.46 |
| yard | phone | 6x | high | 6.7 | 149.5 / 151.9 / 159.6 | 4 / 4.8 | 144.41 | 0 (0 ms) | 70.7 | 72283 | buf 4396 / tex 20 / prog 20 | 21.53 |
| yard | phone | 6x | low | 36.2 | 25.7 / 34.4 / 35.2 | 2.3 / 3 | 25.3 | 0 (0 ms) | 54.2 | 62656 | buf 3846 / tex 5 / prog 10 | 29.88 |

### SwiftShader: Heist JS per frame by subsystem (ms)

| Scene | Viewport | CPU | Tier | session.advance (sim ticks) | ui.updateHUD | cat views update | level.update (props) | guard views update | cones.update (vision fans) | particles.update | meow waves update | camera.update | backdrop.update | three WebGLRenderer.render (per pass) | post.render (bloom + grade) | renderer.draw (three + post) | renderer.update (all render JS) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| heist-01 | desktop | 4x | high | 0.17 | 0.07 | 0.07 | 0.31 | 0.04 | 0.48 | 0.03 | 0 | 0.04 | 0 | 15.03 | 15.22 | 15.24 | 16.55 |
| heist-01 | desktop | 4x | low | 0.06 | 0.05 | 0.03 | 0.11 | 0.05 | 0.38 | 0.03 | 0 | 0.05 | 0 | 1.37 |  | 1.38 | 2.29 |
| heist-01 | desktop | 6x | high | 0.19 | 0.08 | 0.15 | 0.37 | 0.06 | 0.73 | 0.03 | 0 | 0.06 | 0 | 3.67 | 3.94 | 3.99 | 6.08 |
| heist-01 | desktop | 6x | low | 0.08 | 0.07 | 0.06 | 0.11 | 0.04 | 0.59 | 0.04 | 0.01 | 0.1 | 0.01 | 2.04 |  | 2.09 | 3.4 |
| heist-01 | phone | 4x | high | 0.2 | 0.11 | 0.1 | 0.26 | 0.06 | 0.53 | 0.01 | 0 | 0.03 | 0 | 2.45 | 2.72 | 2.73 | 4.14 |
| heist-01 | phone | 4x | low | 0.05 | 0.04 | 0.03 | 0.09 | 0.03 | 0.36 | 0.03 | 0 | 0.06 | 0.01 | 1.46 |  | 1.48 | 2.35 |
| heist-01 | phone | 6x | high | 0.31 | 0.11 | 0.09 | 0.44 | 0.1 | 0.75 | 0.04 | 0 | 0.04 | 0.03 | 3.81 | 4.13 | 4.16 | 6.31 |
| heist-01 | phone | 6x | low | 0.08 | 0.06 | 0.04 | 0.16 | 0.03 | 0.5 | 0.04 | 0.01 | 0.08 | 0.02 | 2.12 |  | 2.16 | 3.38 |
| heist-02 | desktop | 4x | high | 0.2 | 0.07 | 0.1 | 0.19 | 0.04 | 0.24 | 0.03 | 0 | 0.06 | 0 | 22.59 | 22.73 | 22.79 | 23.91 |
| heist-02 | desktop | 4x | low | 0.06 | 0.06 | 0.03 | 0.08 | 0.03 | 0.2 | 0.04 | 0 | 0.04 | 0.01 | 1.95 |  | 1.96 | 2.61 |
| heist-02 | desktop | 6x | high | 0.32 | 0.14 | 0.06 | 0.32 | 0.1 | 0.39 | 0.13 | 0 | 0.07 | 0 | 10.13 | 10.43 | 10.47 | 12.15 |
| heist-02 | desktop | 6x | low | 0.1 | 0.08 | 0.06 | 0.11 | 0.03 | 0.22 | 0.05 | 0 | 0.09 | 0 | 2.19 |  | 2.19 | 3.2 |
| heist-02 | phone | 4x | high | 0.15 | 0.12 | 0.04 | 0.25 | 0.06 | 0.4 | 0.05 | 0 | 0.05 | 0 | 11.51 | 11.69 | 11.74 | 12.99 |
| heist-02 | phone | 4x | low | 0.05 | 0.05 | 0.03 | 0.06 | 0.03 | 0.17 | 0.03 | 0.01 | 0.05 | 0 | 1.35 |  | 1.36 | 1.94 |
| heist-02 | phone | 6x | high | 0.29 | 0.22 | 0.06 | 0.35 | 0.1 | 0.3 | 0.18 | 0 | 0.11 | 0 | 13.5 | 13.78 | 13.85 | 15.7 |
| heist-02 | phone | 6x | low | 0.11 | 0.07 | 0.03 | 0.08 | 0.06 | 0.24 | 0.03 | 0.01 | 0.08 | 0.01 | 1.92 |  | 1.95 | 2.8 |
| heist-03 | desktop | 4x | high | 0.15 | 0.09 | 0.07 | 0.24 | 0.05 | 0.2 | 0.04 | 0 | 0.09 | 0 | 2.27 | 2.38 | 2.4 | 3.39 |
| heist-03 | desktop | 4x | low | 0.04 | 0.08 | 0.04 | 0.11 | 0.02 | 0.15 | 0.03 | 0 | 0.05 | 0.01 | 1.37 |  | 1.38 | 1.99 |
| heist-03 | desktop | 6x | high | 0.21 | 0.2 | 0.06 | 0.34 | 0.01 | 0.43 | 0.05 | 0 | 0.08 | 0 | 16.34 | 16.65 | 16.66 | 18.17 |
| heist-03 | desktop | 6x | low | 0.06 | 0.06 | 0.04 | 0.15 | 0.03 | 0.21 | 0.02 | 0.01 | 0.07 | 0.01 | 1.95 |  | 1.98 | 2.78 |
| heist-03 | phone | 4x | high | 0.13 | 0.08 | 0.07 | 0.29 | 0.03 | 0.17 | 0.05 | 0 | 0.07 | 0.02 | 2.41 | 2.54 | 2.56 | 3.69 |
| heist-03 | phone | 4x | low | 0.04 | 0.05 | 0.04 | 0.07 | 0.01 | 0.15 | 0.02 | 0 | 0.04 | 0 | 1.27 |  | 1.28 | 1.8 |
| heist-03 | phone | 6x | high | 0.2 | 0.13 | 0.1 | 0.31 | 0.07 | 0.36 | 0.02 | 0 | 0.1 | 0 | 3.58 | 3.83 | 3.87 | 5.49 |
| heist-03 | phone | 6x | low | 0.06 | 0.06 | 0.04 | 0.11 | 0.03 | 0.22 | 0.03 | 0 | 0.06 | 0.01 | 1.86 |  | 1.88 | 2.64 |
| heist-04 | desktop | 4x | high | 0.14 | 0.09 | 0.03 | 0.23 | 0.02 | 0.26 | 0.05 | 0 | 0.06 | 0 | 2.1 | 2.22 | 2.25 | 3.52 |
| heist-04 | desktop | 4x | low | 0.07 | 0.06 | 0.04 | 0.1 | 0.03 | 0.19 | 0.03 | 0.01 | 0.05 | 0 | 1.28 |  | 1.29 | 2.06 |
| heist-04 | desktop | 6x | high | 0.23 | 0.14 | 0.05 | 0.32 | 0.03 | 0.44 | 0.06 | 0.02 | 0.1 | 0 | 3.19 | 3.39 | 3.41 | 5.32 |
| heist-04 | desktop | 6x | low | 0.08 | 0.06 | 0.04 | 0.14 | 0.04 | 0.24 | 0.04 | 0.01 | 0.05 | 0.02 | 1.87 |  | 1.92 | 2.99 |
| heist-04 | phone | 4x | high | 0.21 | 0.09 | 0.06 | 0.24 | 0.02 | 0.3 | 0.04 | 0 | 0.06 | 0 | 11.71 | 11.87 | 11.9 | 13.29 |
| heist-04 | phone | 4x | low | 0.05 | 0.05 | 0.03 | 0.08 | 0.02 | 0.15 | 0.03 | 0.01 | 0.05 | 0 | 1.11 |  | 1.12 | 1.8 |
| heist-04 | phone | 6x | high | 0.39 | 0.15 | 0.11 | 0.34 | 0.03 | 0.34 | 0.03 | 0 | 0.07 | 0 | 12.79 | 13 | 13.04 | 15.09 |
| heist-04 | phone | 6x | low | 0.06 | 0.08 | 0.05 | 0.11 | 0.03 | 0.25 | 0.04 | 0.01 | 0.07 | 0.01 | 1.68 |  | 1.71 | 2.71 |
| heist-05 | desktop | 4x | high | 0.22 | 0.14 | 0.07 | 0.25 | 0.05 | 0.5 | 0.07 | 0 | 0.04 | 0 | 2.25 | 2.45 | 2.45 | 3.99 |
| heist-05 | desktop | 4x | low | 0.06 | 0.06 | 0.04 | 0.08 | 0.03 | 0.39 | 0.04 | 0.01 | 0.08 | 0 | 1.18 |  | 1.2 | 2.12 |
| heist-05 | desktop | 6x | high | 0.25 | 0.11 | 0.06 | 0.42 | 0.12 | 0.72 | 0.05 | 0.01 | 0.04 | 0.01 | 3.56 | 3.77 | 3.84 | 6.03 |
| heist-05 | desktop | 6x | low | 0.09 | 0.08 | 0.04 | 0.12 | 0.03 | 0.6 | 0.07 | 0.01 | 0.1 | 0.01 | 1.8 |  | 1.83 | 3.23 |
| heist-05 | phone | 4x | high | 0.26 | 0.16 | 0.04 | 0.25 | 0.09 | 0.45 | 0.08 | 0 | 0.02 | 0 | 23.84 | 24.01 | 24.02 | 25.48 |
| heist-05 | phone | 4x | low | 0.06 | 0.07 | 0.03 | 0.06 | 0.03 | 0.38 | 0.03 | 0 | 0.06 | 0.01 | 1.43 |  | 1.46 | 2.3 |
| heist-05 | phone | 6x | high | 0.26 | 0.24 | 0.09 | 0.42 | 0.1 | 0.68 | 0.07 | 0 | 0.09 | 0 | 17.49 | 17.77 | 17.78 | 20.15 |
| heist-05 | phone | 6x | low | 0.06 | 0.08 | 0.03 | 0.1 | 0.03 | 0.59 | 0.06 | 0.01 | 0.08 | 0.01 | 1.73 |  | 1.75 | 3.03 |
| heist-06 | desktop | 4x | high | 0.14 | 0.06 | 0.09 | 0.28 | 0.05 | 0.29 | 0.04 | 0 | 0.08 | 0 | 12.31 | 12.51 | 12.53 | 13.65 |
| heist-06 | desktop | 4x | low | 0.07 | 0.07 | 0.04 | 0.12 | 0.02 | 0.23 | 0.02 | 0.01 | 0.07 | 0 | 1.12 |  | 1.14 | 1.82 |
| heist-06 | desktop | 6x | high | 0.19 | 0.19 | 0.14 | 0.35 | 0.04 | 0.58 | 0.11 | 0 | 0.09 | 0 | 14.18 | 14.28 | 14.3 | 16.03 |
| heist-06 | desktop | 6x | low | 0.07 | 0.08 | 0.05 | 0.12 | 0.07 | 0.34 | 0.03 | 0.01 | 0.07 | 0.01 | 1.84 |  | 1.86 | 2.79 |
| heist-06 | phone | 4x | high | 0.17 | 0.12 | 0.1 | 0.3 | 0.03 | 0.24 | 0.02 | 0.01 | 0.06 | 0 | 27.24 | 27.38 | 27.41 | 28.5 |
| heist-06 | phone | 4x | low | 0.05 | 0.06 | 0.03 | 0.08 | 0.02 | 0.26 | 0.01 | 0 | 0.05 | 0 | 1.92 |  | 1.93 | 2.53 |
| heist-06 | phone | 6x | high | 0.19 | 0.08 | 0.33 | 0.4 | 0.12 | 0.37 | 0.1 | 0 | 0.07 | 0 | 25.64 | 25.87 | 25.89 | 27.8 |
| heist-06 | phone | 6x | low | 0.05 | 0.1 | 0.04 | 0.11 | 0.03 | 0.31 | 0.02 | 0 | 0.07 | 0.01 | 2.5 |  | 2.52 | 3.3 |
| heist-07 | desktop | 4x | high | 0.14 | 0.04 | 0.08 | 0.22 | 0.07 | 0.48 | 0.02 | 0 | 0.05 | 0 | 10.29 | 10.41 | 10.45 | 11.78 |
| heist-07 | desktop | 4x | low | 0.1 | 0.05 | 0.04 | 0.1 | 0.03 | 0.32 | 0.01 | 0 | 0.05 | 0 | 1.55 |  | 1.57 | 2.38 |
| heist-07 | desktop | 6x | high | 0.2 | 0.05 | 0.13 | 0.43 | 0.14 | 0.6 | 0.03 | 0.01 | 0.07 | 0 | 13.34 | 13.55 | 13.59 | 15.6 |
| heist-07 | desktop | 6x | low | 0.08 | 0.08 | 0.03 | 0.15 | 0.03 | 0.51 | 0.04 | 0 | 0.08 | 0 | 2.24 |  | 2.26 | 3.43 |
| heist-07 | phone | 4x | high | 0.18 | 0.03 | 0.07 | 0.41 | 0.08 | 0.46 | 0.05 | 0 | 0.04 | 0 | 13.43 | 13.61 | 13.61 | 15.15 |
| heist-07 | phone | 4x | low | 0.06 | 0.05 | 0.02 | 0.09 | 0.04 | 0.31 | 0.03 | 0 | 0.09 | 0 | 1.51 |  | 1.53 | 2.32 |
| heist-07 | phone | 6x | high | 0.29 | 0.1 | 0.07 | 0.4 | 0.09 | 0.76 | 0.11 | 0 | 0.03 | 0 | 13.73 | 14 | 14.03 | 16.05 |
| heist-07 | phone | 6x | low | 0.08 | 0.05 | 0.05 | 0.13 | 0.07 | 0.44 | 0.04 | 0.01 | 0.09 | 0.01 | 2.2 |  | 2.23 | 3.37 |
| heist-08 | desktop | 4x | high | 0.14 | 0.07 | 0.05 | 0.21 | 0.08 | 0.52 | 0.05 | 0 | 0.02 | 0 | 1.93 | 2.09 | 2.11 | 3.42 |
| heist-08 | desktop | 4x | low | 0.06 | 0.04 | 0.02 | 0.09 | 0.04 | 0.39 | 0.02 | 0 | 0.06 | 0 | 1.13 |  | 1.14 | 2.01 |
| heist-08 | desktop | 6x | high | 0.15 | 0.09 | 0.14 | 0.29 | 0.13 | 0.81 | 0.02 | 0.02 | 0.07 | 0.01 | 2.96 | 3.15 | 3.19 | 5.16 |
| heist-08 | desktop | 6x | low | 0.07 | 0.05 | 0.04 | 0.11 | 0.06 | 0.58 | 0.04 | 0 | 0.09 | 0 | 1.7 |  | 1.72 | 2.98 |
| heist-08 | phone | 4x | high | 0.16 | 0.09 | 0.03 | 0.36 | 0.14 | 0.47 | 0.02 | 0.01 | 0.03 | 0 | 11.72 | 11.94 | 11.96 | 13.43 |
| heist-08 | phone | 4x | low | 0.05 | 0.04 | 0.03 | 0.09 | 0.03 | 0.41 | 0.03 | 0 | 0.04 | 0 | 1.05 |  | 1.06 | 1.9 |
| heist-08 | phone | 6x | high | 0.18 | 0.09 | 0.06 | 0.54 | 0.08 | 0.72 | 0.01 | 0 | 0.02 | 0 | 3.15 | 3.36 | 3.38 | 5.56 |
| heist-08 | phone | 6x | low | 0.07 | 0.05 | 0.05 | 0.13 | 0.04 | 0.58 | 0.04 | 0.02 | 0.07 | 0 | 1.62 |  | 1.63 | 2.86 |

### SwiftShader: Heap and GC over a long window

| Scene | Viewport | CPU | Tier | Window | fps | Heap start / end / peak MB | Retained growth (after GC) | GC pauses (minor / major) | GC total / p95 / max ms |
|---|---|---|---|---|---|---|---|---|---|
| heist-08 | desktop | 4x | high | 63.6 s | 8.9 | 7.39 / 8.98 / 15.93 | 1.32 MB | 98 (96 / 2) | 76.3 / 1.53 / 5.45 |
| heist-08 | phone | 6x | low | 61.3 s | 46.1 | 6.85 / 8.11 / 17.92 | 1.26 MB | 83 (80 / 3) | 105.4 / 2.1 / 7.17 |
| yard | desktop | 4x | high | 60 s | 8.6 | 17.42 / 19.58 / 19.95 | 1.87 MB | 58 (56 / 2) | 65.6 / 1.98 / 9.02 |
| title | desktop | 4x | high | 60 s | 8.4 | 5.7 / 6.79 / 7.3 | 0.96 MB | 55 (53 / 2) | 42.5 / 1.33 / 3.07 |
