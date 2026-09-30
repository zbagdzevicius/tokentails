# Catnip Heist performance: before vs after

Re-measure of the optimisation work (load, render and CPU optimisers, plus the review fixes of
2026-09-30) against `perf/BASELINE.md`. Same host (Apple M3 Pro, 12 cores, 36 GB), same Playwright
Chromium 151 headless shell, same matrix: every scene (title, heist-01 to heist-08, yard) x
desktop/phone x 4x/6x CPU throttle x high/low tier for runtime (8 s windows); load at 1x/4x/6x; the
four 60 s heap configs; CPU profiles on Metal (desktop 4x).

```bash
node perf/measure.mjs --build --gpu=swiftshader --out=perf/out/after2-swiftshader.json
node perf/measure.mjs --build --gpu=metal --profile --out=perf/out/after2-metal.json
node perf/measure.mjs --build --gpu=swiftshader --only=load --out=perf/out/after2-ss-load-rep.json   # repeat
node perf/measure.mjs --gpu=swiftshader --only=runtime,heap --quality=high \
  --scenes=heist-01,heist-04,heist-05,heist-07,yard --heap=yard:desktop:4:high,heist-08:phone:6:low \
  --out=perf/out/after2-ss-rep.json                                                                  # repeat
node perf/measure.mjs --build --gpu=swiftshader --only=heap --heap=yard:desktop:4:high \
  --out=perf/out/after2-ss-yardheap.json                                                             # minor-GC stats
node perf/measure.mjs --build --gpu=metal --compare-screens
```

**The load harness changed** (see "Load harness fix"). Load numbers are therefore compared against
a **re-measured baseline**: the baseline commit (HEAD 18bbc425, clean `src/`, old assets) built and
measured from a scratch copy with the fixed harness (`perf/out/baseline2-ss-load.json`,
`perf/out/baseline2-metal-load.json`). The runtime, heap and profile sections of the harness did
not change, so they are still compared against `perf/baseline-*.json` (2026-09-29). The two
repeat runs above were also run on the baseline copy (`perf/out/baseline2-ss-rep.json`,
`perf/out/baseline2-ss-yardheap.json`), so both sides of those tables are from the same session.

A cell is marked **worse** only when it got worse by more than a per-metric noise band (for
example 20% and 15 ms for load times, 25% and 0.3 ms for JS p50, 25% and 5 ms for frame p95, 50%
and 1 ms for GC p95, any change for link counts). The baseline's noise note still applies: about
±25% in JS per frame between runs.

## Summary

- **Metal: better everywhere, no cell marked worse in load, runtime or the CPU profile.** Title
  interactive -8 to -17%, DOMContentLoaded -12 to -28%, first heist, 2nd heist and Yard ready down or
  flat (Yard ready -12 to -38%). Every runtime config holds 120 fps; heist JS p50 fell 25 to 93%.
  CPU-profile busy time fell 14 to 44%, allocation rate 17 to 54%. Session download 2,133 ->
  1,179 kB.
- **SwiftShader load: the title regression was a harness artefact, now fixed.** With the fixed
  harness, title interactive is 10 to 21% *faster* than the baseline in all 12 configs (two
  runs), DOMContentLoaded 17 to 32% earlier, diorama first frame earlier, title TBT unchanged
  (1x desktop high: 0 -> 0 ms). One real SwiftShader load regression remains: the warm second
  heist on **phone high at 4x and 6x** (+38 to +50%, reproduced in every run). Cause not found
  (see "Open"). The low-tier first heist reads +8 to +26% in both runs, inside the baseline's
  own run-to-run spread (finding 2).
- **SwiftShader runtime:** high-tier fps +12 to +44% in all high configs but one (heist-02 phone 4x:
  -6%), and frame p50 -12 to -21% in every high config. The frame p95/p99 cells that were marked worse did not reproduce: the repeat run (both
  sides re-measured in one session) shows different configs moving up and down, see
  "SwiftShader repeat runs".
- **Heap/GC:** no leak. The Yard's "longer GCs" come from how p95 is computed, not from longer
  pauses: with fewer minor GCs, the p95 of all pauses lands on one of the two major GCs. Minor-GC
  p95 went 1.44 -> 1.72 ms (+0.28 ms, fewer pauses that each cover more allocation) and total GC
  time fell 57.5 -> 47.4 ms per minute.
- **Quality tier bug fixed** (pause screen dropped a high-tier device to low for the session), and
  the governor's hitch filter now applies in the real renderer.
- **Screenshots:** all six inside the noise band. The title's 1 px shift is caused by the new font
  preload, not by `.ch-play-wrap`.
- **Checks:** `tsc --noEmit -p .`, `vitest run` (13 files, 238 tests), `vite build` and
  `playwright test` (12/12) pass.

## Review findings (2026-09-30): status

| # | Finding | Status |
|---|---|---|
| 1 | SwiftShader title interactive / diorama / DCL slower in all 12 load configs | **Harness artefact, fixed in `perf/measure.mjs`.** Not `img.decode()`: a build without it measured the same (4x desktop high 272 ms, phone 397 ms). A main-thread trace showed V8 starting to parse the app bundle at about 85 ms instead of 10 ms, with the renderer idle in between: the page was still busy with the harness's start page. Now 10 to 21% faster than the baseline. |
| 2 | SwiftShader 2nd heist slower at 4x high, 1st heist slower at 6x desktop | Desktop: noise (the re-measured baseline and the two after runs move both ways, 4x desktop high 2,521 -> 2,613 / 2,075). 1st heist: high tier mostly better (phone 4x/6x high -19 to -27% in both runs); low tier +8 to +26% in both runs, inside the spread of the baseline itself (a third baseline run gave desktop 4x low 2,714 ms against 2,396; a build without `img.decode()` measured 2,775). **Phone high 4x/6x 2nd heist: real on SwiftShader** (2,268 -> 3,309 / 3,343 ms at 4x; 2,096 -> 2,889 / 2,890 at 6x), same 23 links, more shader-wait ms per link. Not reproduced on Metal (phone 4x high 125 -> 125 ms). Cause open. |
| 3 | 1x desktop SwiftShader title TBT 0 -> 3,033 ms | Fixed with #1: Play appears before the diorama's compile task again (0 -> 0 ms, both runs). |
| 4 | SwiftShader high-tier frame p95 worse in 5 configs | Noise. In the repeat run heist-07 desktop 6x is 144 -> 167 ms, heist-05 desktop 6x 125 -> 110, heist-04 desktop 4x 240 -> 175, heist-01 phone 4x 392 -> 343. p50 and fps improved in every config. The shadow-map rate limit cannot cause it at these frame rates (every frame is longer than 1/60 s, so the shadow map renders every frame). |
| 5 | Yard: fewer but longer minor GCs; retained growth up on SwiftShader | GC: a p95 artefact (above); `measure.mjs` now also reports `minorP95Ms` / `minorMaxMs`. Minor p95 1.44 -> 1.72 ms, minor max 1.52 -> 1.79 ms, GCs per minute 49 -> 37, total GC 57.5 -> 47.4 ms. Retained growth 1.8-1.9 -> 2.3-2.4 MB reproduces on SwiftShader but not on Metal (3.12 -> 3.08 MB, where 60 s is 7,200 frames): consistent with lazily built Yard state approaching the same plateau sooner, not with a leak. |
| 6 | Metal title sampled heap peak up | Did not reproduce (9.53 -> 9.90 MB). This run shows the same sawtooth on heist-08 desktop (14.3 -> 18.4 MB) with after-GC heap and retained growth unchanged (1.49 -> 1.49 MB). |
| 7 | Metal phone 1x low title kB up | Timing-dependent at 1x, as stated. This run: 269 -> 272 kB on Metal; on SwiftShader the 1x cells move both ways (296 -> 340, 548 -> 415). |
| 8 | CAT YARD button 1 px lower | Not a layout change and not `.ch-play-wrap`: the buttons' layout rects are identical in both builds (Play y 454.64, CAT YARD y 538.36). Removing the wrapper, its glow, `isolation` or `will-change` left the 1 px shift; restoring the baseline `index.html`, or dropping only the font `<link rel=preload>`, removed it. The font preload changes how Chromium snaps the fractional y of that button in the capture. Kept (the preload is a load win); title changedPct 1.40, meanAbsDiff 1.33, inside the band. |
| 9 | Paused heist drops the tier to low | **Fixed** (`App.ts`, `GameRenderer.ts`, `types.ts`): throttled pause redraws pass `throttled` to `update`, which skips quality sampling; the first normal frame after them resets the governor window. Verified on Metal with auto quality: before the fix, 7 s on the pause screen logged `[quality] 10.0 fps -> low` and stored `low`; after it, the tier stays `high`. |
| 10 | Governor hitch filter never fires | **Fixed** (`GameRenderer.ts`): animation still uses the clamped dt, but the probe and governor get the real frame time, so frames over 1 s are skipped. |
| 11 | GTM can never load without a PostHog key | No code change; `docs/CLIENT.md` known issue now spells out that the production env must set `NEXT_PUBLIC_POSTHOG_KEY`. |
| 12 | Stale Paw Match comment in `live-game.dto.ts` | Comment updated; no code change. |

## Load harness fix

`measureLoad` navigated to `/assets/manifest.json` first (same origin, so the CPU throttle and the
profiler survive the navigation into the app), then set the throttle and loaded the game. Chromium
renders a JSON response as a text document. When the asset pass minified the manifest into a
single 54 kB line, laying out and, on SwiftShader, software-rastering that line kept the renderer
busy into the measured navigation. The pretty-printed baseline manifest cost much less. It hit
SwiftShader only, and it did not depend on the app's code, which is why the no-split and no-preload
isolation builds changed nothing.

Evidence (desktop 4x high, SwiftShader, three loads each, my own trace script):

| Build | start page | DCL ms | title interactive ms |
|---|---|---|---|
| baseline | manifest.json | 76-79 (first load 342) | 204-212 (first load 472) |
| after | manifest.json | 140-144 (first load 412) | 265-272 (first load 538) |
| baseline | blank | 72-74 | 202-204 |
| after | blank | 59-62 | 182-184 |

The start page is now a tiny page served through `page.route` (`/__perf-blank`), unrouted before
the measured navigation. A `Tracing` capture of the old setup showed `v8.parseOnBackground` for the
app bundle beginning at about 85 ms (baseline: 10 ms), although the script had finished downloading
at about 20 ms.

## Open

- **SwiftShader, phone high, 4x/6x: warm second heist +38 to +50%.** Same program count (23
  links), so more time per link. Shader ms here is mostly the main thread waiting on the GPU
  process, which on SwiftShader also executes the queued frames of the running first heist. Metal
  does not show it (phone 4x high 125 -> 125 ms, phone 6x 170 -> 163). Candidates not yet tested
  (a bisect in scratch copies was denied permission this time): the MSAA drop to 2x at pixel
  ratio >= 1.75 (phone only), the per-variant shadow depth materials (`shareDepthMaterials`) and
  the bloom composite moved into the final pass.
- **Yard retained growth on SwiftShader** (1.8 -> 2.4 MB in 60 s, three runs). Not seen on
  Metal. A longer SwiftShader window would show whether it plateaus.


## Screenshots (`--compare-screens`, Metal, against `perf/ref/`)

| Image | changedPct | meanAbsDiff | By eye |
|---|---|---|---|
| title | 1.40 | 1.33 | Same. CAT YARD button 1 px lower (font preload, see finding 8). The Play glow layer is not visible because CSS animations are frozen for the capture. |
| heist-01-start | 0.32 | 0.23 | Same |
| heist-01-start-phone | 0.48 | 0.38 | Same |
| heist-05-mid | 0.34 | 0.37 | Same |
| results | 0.03 | 0.06 | Same |
| yard | 1.94 | 0.97 | Same scene; cats in other spots and poses (`wander.ts` changed; the Yard is cosmetic) |

Noise band per BASELINE.md: changedPct above about 5, or meanAbsDiff above about 3, counts as a
real change. Nothing crosses it.

## SwiftShader repeat runs

Both sides re-measured in the same session (baseline commit from a scratch copy, then the working
tree), high tier only, runtime 8 s windows and 60 s heap windows.

### Runtime (repeat)

| Config | fps | frame p50 ms | frame p95 ms | frame p99 ms | JS p50 ms | JS p95 ms | draws | TBT ms |
|---|---|---|---|---|---|---|---|---|
| heist-01 desktop 4 high | 5.90 -> 8.40 (+42%) | 116 -> 100 (-14%) | 534 -> 182 (-66%) | 1643 -> 767 (-53%) | 4.40 -> 3.50 (-20%) | 7.80 -> 5.50 (-29%) | 79.8 -> 76.4 (-4%) | 551 -> 0.00 (-100%) |
| heist-01 desktop 6 high | 8.40 -> 9.50 (+13%) | 115 -> 98.8 (-14%) | 166 -> 125 (-24%) | 243 -> 492 (+103% **worse**) | 6.30 -> 5.20 (-17%) | 9.80 -> 7.10 (-28%) | 79.4 -> 75.9 (-4%) | 0.00 -> 0.00 (0%) |
| heist-01 phone 4 high | 5.90 -> 6.70 (+14%) | 150 -> 125 (-17%) | 392 -> 343 (-13%) | 457 -> 575 (+26% **worse**) | 4.40 -> 3.50 (-20%) | 6.70 -> 5.40 (-19%) | 74.3 -> 70.0 (-6%) | 0.00 -> 0.00 (0%) |
| heist-01 phone 6 high | 6.30 -> 7.40 (+17%) | 150 -> 125 (-17%) | 217 -> 257 (+18%) | 358 -> 310 (-13%) | 6.50 -> 5.00 (-23%) | 10.2 -> 7.80 (-24%) | 74.1 -> 69.9 (-6%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 4 high | 8.20 -> 9.90 (+21%) | 109 -> 92.6 (-15%) | 240 -> 175 (-27%) | 392 -> 318 (-19%) | 3.40 -> 2.80 (-18%) | 7.00 -> 5.20 (-26%) | 72.2 -> 69.8 (-3%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 6 high | 8.50 -> 10.1 (+19%) | 109 -> 92.2 (-15%) | 207 -> 117 (-44%) | 325 -> 282 (-13%) | 5.50 -> 4.60 (-16%) | 9.70 -> 7.80 (-20%) | 71.9 -> 69.7 (-3%) | 0.00 -> 0.00 (0%) |
| heist-04 phone 4 high | 6.30 -> 7.20 (+14%) | 141 -> 116 (-17%) | 325 -> 268 (-17%) | 617 -> 900 (+46% **worse**) | 4.10 -> 3.00 (-27%) | 6.30 -> 6.30 (0%) | 62.8 -> 60.7 (-3%) | 423 -> 842 (+99% **worse**) |
| heist-04 phone 6 high | 6.20 -> 7.20 (+16%) | 142 -> 117 (-18%) | 316 -> 368 (+16%) | 618 -> 590 (-5%) | 6.10 -> 4.40 (-28%) | 10.4 -> 8.90 (-14%) | 63.1 -> 60.5 (-4%) | 414 -> 320 (-23%) |
| heist-05 desktop 4 high | 7.60 -> 9.90 (+30%) | 110 -> 91.7 (-17%) | 167 -> 108 (-35%) | 582 -> 425 (-27%) | 4.00 -> 2.70 (-32%) | 7.00 -> 4.20 (-40%) | 77.4 -> 70.6 (-9%) | 0.00 -> 0.00 (0%) |
| heist-05 desktop 6 high | 8.30 -> 9.80 (+18%) | 109 -> 92.6 (-15%) | 125 -> 110 (-13%) | 466 -> 424 (-9%) | 5.80 -> 4.30 (-26%) | 9.20 -> 6.90 (-25%) | 75.0 -> 70.6 (-6%) | 0.00 -> 0.00 (0%) |
| heist-05 phone 4 high | 6.10 -> 7.50 (+23%) | 148 -> 118 (-21%) | 350 -> 299 (-15%) | 424 -> 557 (+32% **worse**) | 4.10 -> 3.00 (-27%) | 274 -> 5.50 (-98%) | 60.4 -> 57.3 (-5%) | 920 -> 515 (-44%) |
| heist-05 phone 6 high | 6.20 -> 7.30 (+18%) | 148 -> 118 (-21%) | 358 -> 402 (+12%) | 558 -> 508 (-9%) | 6.10 -> 4.10 (-33%) | 12.3 -> 7.80 (-37%) | 60.4 -> 57.6 (-5%) | 561 -> 813 (+45% **worse**) |
| heist-07 desktop 4 high | 7.80 -> 8.30 (+6%) | 117 -> 100 (-14%) | 132 -> 142 (+7%) | 510 -> 766 (+50% **worse**) | 4.10 -> 3.40 (-17%) | 5.80 -> 5.20 (-10%) | 109 -> 103 (-6%) | 456 -> 717 (+57% **worse**) |
| heist-07 desktop 6 high | 7.80 -> 8.50 (+9%) | 118 -> 100 (-15%) | 144 -> 167 (+16%) | 498 -> 835 (+68% **worse**) | 6.50 -> 5.50 (-15%) | 9.00 -> 8.50 (-6%) | 109 -> 103 (-6%) | 434 -> 375 (-14%) |
| heist-07 phone 4 high | 5.70 -> 7.50 (+32%) | 150 -> 125 (-17%) | 391 -> 308 (-21%) | 642 -> 441 (-31%) | 4.70 -> 3.40 (-28%) | 6.50 -> 6.00 (-8%) | 88.3 -> 83.4 (-6%) | 435 -> 363 (-17%) |
| heist-07 phone 6 high | 6.00 -> 7.50 (+25%) | 150 -> 125 (-17%) | 343 -> 317 (-8%) | 642 -> 442 (-31%) | 6.80 -> 5.00 (-26%) | 10.9 -> 8.50 (-22%) | 88.2 -> 83.5 (-5%) | 441 -> 369 (-16%) |
| yard desktop 4 high | 8.60 -> 10.1 (+17%) | 117 -> 99.8 (-14%) | 118 -> 102 (-14%) | 124 -> 107 (-14%) | 2.80 -> 2.50 (-11%) | 3.40 -> 3.10 (-9%) | 84.3 -> 82.4 (-2%) | 0.00 -> 0.00 (0%) |
| yard desktop 6 high | 8.60 -> 10.0 (+16%) | 117 -> 99.9 (-14%) | 125 -> 108 (-13%) | 125 -> 118 (-6%) | 4.30 -> 4.00 (-7%) | 5.10 -> 5.20 (+2%) | 84.2 -> 82.4 (-2%) | 0.00 -> 0.00 (0%) |
| yard phone 4 high | 6.80 -> 8.10 (+19%) | 150 -> 125 (-17%) | 152 -> 127 (-16%) | 160 -> 134 (-16%) | 2.50 -> 2.50 (0%) | 3.10 -> 3.30 (+6%) | 70.7 -> 68.6 (-3%) | 0.00 -> 0.00 (0%) |
| yard phone 6 high | 6.70 -> 8.00 (+19%) | 150 -> 125 (-17%) | 160 -> 127 (-21%) | 199 -> 132 (-34%) | 4.20 -> 3.60 (-14%) | 5.40 -> 4.50 (-17%) | 70.6 -> 68.6 (-3%) | 0.00 -> 0.00 (0%) |

### Load (repeat of the after side, against the re-measured baseline)

| Config | DCL | title interactive | diorama 1st frame | title kB | title TBT | first heist | heist links | heist shader ms | heist TBT | 2nd heist | 2nd heist links | 2nd heist shader ms | Yard ready | Yard all sheets | session kB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop 1 high | 29.5 -> 22.2 (-25%) | 67.8 -> 56.8 (-16%) | 460 -> 449 (-2%) | 263 -> 269 (+2%) | 0.00 -> 0.00 (0%) | 6081 -> 4766 (-22%) | 54.0 -> 54.0 (0%) | 4865 -> 3306 (-32%) | 5050 -> 3571 (-29%) | 2921 -> 4166 (+43% **worse**) | 23.0 -> 23.0 (0%) | 2890 -> 4140 (+43% **worse**) | 4072 -> 3834 (-6%) | 15956 -> 9741 (-39%) | 2128 -> 1179 (-45%) |
| desktop 1 low | 29.6 -> 21.0 (-29%) | 67.7 -> 55.6 (-18%) | 112 -> 101 (-11%) | 296 -> 319 (+8%) | 0.00 -> 0.00 (0%) | 2493 -> 2238 (-10%) | 22.0 -> 22.0 (0%) | 1689 -> 1475 (-13%) | 1737 -> 1493 (-14%) | 793 -> 1051 (+33% **worse**) | 12.0 -> 12.0 (0%) | 762 -> 1029 (+35% **worse**) | 1326 -> 1300 (-2%) | 5295 -> 3388 (-36%) | 2128 -> 1179 (-45%) |
| desktop 4 high | 77.3 -> 60.4 (-22%) | 223 -> 191 (-14%) | 299 -> 267 (-11%) | 1196 -> 745 (-38%) | 2733 -> 2723 (0%) | 6292 -> 4819 (-23%) | 54.0 -> 54.0 (0%) | 4987 -> 3458 (-31%) | 5114 -> 3590 (-30%) | 2521 -> 2075 (-18%) | 23.0 -> 23.0 (0%) | 2408 -> 1972 (-18%) | 4853 -> 4356 (-10%) | 43784 -> 25575 (-42%) | 2128 -> 1179 (-45%) |
| desktop 4 low | 76.9 -> 63.2 (-18%) | 219 -> 192 (-12%) | 278 -> 253 (-9%) | 1196 -> 745 (-38%) | 1216 -> 1220 (+0%) | 2396 -> 2710 (+13%) | 22.0 -> 22.0 (0%) | 1376 -> 1531 (+11%) | 1610 -> 1638 (+2%) | 1432 -> 1241 (-13%) | 12.0 -> 12.0 (0%) | 1326 -> 1157 (-13%) | 2025 -> 1801 (-11%) | 15309 -> 9386 (-39%) | 2128 -> 1179 (-45%) |
| desktop 6 high | 119 -> 90.5 (-24%) | 338 -> 287 (-15%) | 429 -> 382 (-11%) | 1196 -> 745 (-38%) | 2852 -> 2831 (-1%) | 4789 -> 6200 (+29% **worse**) | 54.0 -> 54.0 (0%) | 3670 -> 4846 (+32% **worse**) | 3932 -> 5055 (+29% **worse**) | 2805 -> 2013 (-28%) | 23.0 -> 23.0 (0%) | 2640 -> 1872 (-29%) | 5132 -> 4517 (-12%) | 56754 -> 34880 (-39%) | 2128 -> 1179 (-45%) |
| desktop 6 low | 115 -> 94.3 (-18%) | 329 -> 290 (-12%) | 396 -> 355 (-10%) | 1196 -> 745 (-38%) | 1325 -> 1309 (-1%) | 2254 -> 2705 (+20% **worse**) | 22.0 -> 22.0 (0%) | 1118 -> 1407 (+26% **worse**) | 1304 -> 1590 (+22%) | 1166 -> 931 (-20%) | 12.0 -> 12.0 (0%) | 1020 -> 799 (-22%) | 2485 -> 1911 (-23%) | 20887 -> 13105 (-37%) | 2128 -> 1179 (-45%) |
| phone 1 high | 29.7 -> 20.9 (-30%) | 70.2 -> 56.4 (-20%) | 120 -> 105 (-12%) | 354 -> 415 (+17%) | 0.00 -> 0.00 (0%) | 4669 -> 3973 (-15%) | 52.0 -> 52.0 (0%) | 3855 -> 3043 (-21%) | 3855 -> 3049 (-21%) | 3231 -> 3723 (+15%) | 23.0 -> 23.0 (0%) | 3200 -> 3696 (+16%) | 4003 -> 2765 (-31%) | 18844 -> 10003 (-47%) | 2128 -> 1179 (-45%) |
| phone 1 low | 31.4 -> 21.5 (-32%) | 70.7 -> 56.8 (-20%) | 115 -> 101 (-12%) | 548 -> 415 (-24%) | 0.00 -> 0.00 (0%) | 1006 -> 1570 (+56% **worse**) | 22.0 -> 22.0 (0%) | 820 -> 1442 (+76% **worse**) | 789 -> 1406 (+78% **worse**) | 1326 -> 702 (-47%) | 12.0 -> 12.0 (0%) | 1300 -> 680 (-48%) | 1113 -> 1167 (+5%) | 4042 -> 2834 (-30%) | 2128 -> 1179 (-45%) |
| phone 4 high | 76.9 -> 62.3 (-19%) | 223 -> 194 (-13%) | 299 -> 270 (-10%) | 1196 -> 745 (-38%) | 1853 -> 1837 (-1%) | 5565 -> 4078 (-27%) | 52.0 -> 52.0 (0%) | 4488 -> 3133 (-30%) | 4562 -> 3169 (-31%) | 2268 -> 3343 (+47% **worse**) | 23.0 -> 23.0 (0%) | 2156 -> 3239 (+50% **worse**) | 5222 -> 4206 (-19%) | 54246 -> 30601 (-44%) | 2128 -> 1179 (-45%) |
| phone 4 low | 77.4 -> 62.1 (-20%) | 219 -> 193 (-12%) | 280 -> 253 (-10%) | 1196 -> 745 (-38%) | 948 -> 875 (-8%) | 1606 -> 1772 (+10%) | 22.0 -> 22.0 (0%) | 1193 -> 1168 (-2%) | 1229 -> 1173 (-5%) | 1183 -> 1158 (-2%) | 12.0 -> 12.0 (0%) | 1081 -> 1078 (0%) | 2093 -> 1562 (-25%) | 12902 -> 7816 (-39%) | 2128 -> 1179 (-45%) |
| phone 6 high | 118 -> 92.7 (-21%) | 334 -> 290 (-13%) | 427 -> 382 (-11%) | 1196 -> 745 (-38%) | 1971 -> 1941 (-2%) | 5092 -> 4115 (-19%) | 52.0 -> 52.0 (0%) | 4447 -> 3161 (-29%) | 4611 -> 3252 (-29%) | 2096 -> 2890 (+38% **worse**) | 23.0 -> 23.0 (0%) | 1919 -> 2746 (+43% **worse**) | 5082 -> 4812 (-5%) | 70771 -> 42909 (-39%) | 2128 -> 1179 (-45%) |
| phone 6 low | 117 -> 91.6 (-22%) | 330 -> 289 (-12%) | 395 -> 356 (-10%) | 1196 -> 745 (-38%) | 988 -> 956 (-3%) | 1749 -> 1952 (+12%) | 22.0 -> 22.0 (0%) | 1228 -> 1179 (-4%) | 1334 -> 1267 (-5%) | 917 -> 899 (-2%) | 12.0 -> 12.0 (0%) | 765 -> 783 (+2%) | 2152 -> 1761 (-18%) | 17284 -> 11344 (-34%) | 2128 -> 1179 (-45%) |

### Yard heap with minor-GC stats (`after2-ss-yardheap.json` vs `baseline2-ss-yardheap.json`)

| Side | GCs (minor / major) | total ms | p95 all | max all | minor p95 | minor max | retained growth MB |
|---|---|---|---|---|---|---|---|
| baseline | 49 (47 / 2) | 57.5 | 1.52 | 8.75 | 1.44 | 1.52 | 1.89 |
| after | 37 (35 / 2) | 47.4 | 6.31 | 7.20 | 1.72 | 1.79 | 2.43 |

# Full tables

Format: before -> after (% change). Negative is better for times, sizes and counts; positive is
better for fps. Load tables compare against the re-measured baseline (fixed harness); the other
tables against `perf/baseline-*.json`.

## Metal

Load: Before: 2026-09-30T00:25:54.866Z (baseline commit 18bbc425, scratch copy). After: 2026-09-29T23:58:12.090Z (18bbc425+dirty src). GPU: ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version).

Runtime, heap, profile: Before: 2026-09-29T19:55:33.941Z (18bbc425+dirty src). After: 2026-09-29T23:58:12.090Z (18bbc425+dirty src). GPU: ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version).

Bundle total: 2574 kB -> 1729 kB; JS gzip 227 -> 231 kB; assets 1750 -> 895 kB.

### Load (ms unless noted)

| Config | DCL | title interactive | diorama 1st frame | title kB | title TBT | first heist | heist links | heist shader ms | heist TBT | 2nd heist | 2nd heist links | 2nd heist shader ms | Yard ready | Yard all sheets | session kB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop 1 high | 30.2 -> 26.6 (-12%) | 69.9 -> 63.4 (-9%) | 87.9 -> 82.3 (-6%) | 263 -> 269 (+2%) | 0.00 -> 0.00 (0%) | 129 -> 111 (-14%) | 54.0 -> 54.0 (0%) | 57.6 -> 56.0 (-3%) | 35.0 -> 29.0 (-17%) | 60.7 -> 58.8 (-3%) | 23.0 -> 23.0 (0%) | 34.1 -> 35.3 (+4%) | 198 -> 173 (-12%) | 1178 -> 736 (-38%) | 2128 -> 1179 (-45%) |
| desktop 1 low | 29.3 -> 21.6 (-26%) | 67.5 -> 55.7 (-17%) | 75.7 -> 63.9 (-16%) | 354 -> 415 (+17%) | 0.00 -> 0.00 (0%) | 71.6 -> 59.3 (-17%) | 22.0 -> 22.0 (0%) | 15.5 -> 15.7 (+1%) | 0.00 -> 0.00 (0%) | 37.2 -> 31.7 (-15%) | 12.0 -> 12.0 (0%) | 9.10 -> 10.3 (+13%) | 170 -> 133 (-22%) | 1113 -> 652 (-41%) | 2128 -> 1179 (-45%) |
| desktop 4 high | 77.6 -> 62.9 (-19%) | 224 -> 199 (-11%) | 257 -> 232 (-10%) | 1196 -> 745 (-38%) | 159 -> 156 (-2%) | 305 -> 267 (-12%) | 54.0 -> 54.0 (0%) | 66.4 -> 63.0 (-5%) | 131 -> 101 (-23%) | 142 -> 125 (-12%) | 23.0 -> 23.0 (0%) | 26.0 -> 25.9 (0%) | 696 -> 489 (-30%) | 4450 -> 2690 (-40%) | 2128 -> 1179 (-45%) |
| desktop 4 low | 75.5 -> 62.1 (-18%) | 220 -> 195 (-11%) | 245 -> 221 (-10%) | 1196 -> 745 (-38%) | 125 -> 116 (-7%) | 218 -> 179 (-18%) | 22.0 -> 22.0 (0%) | 17.9 -> 16.7 (-7%) | 46.0 -> 23.0 (-50%) | 112 -> 94.7 (-15%) | 12.0 -> 12.0 (0%) | 12.5 -> 11.2 (-10%) | 647 -> 435 (-33%) | 4081 -> 2353 (-42%) | 2128 -> 1179 (-45%) |
| desktop 6 high | 115 -> 95.1 (-17%) | 332 -> 294 (-11%) | 378 -> 343 (-9%) | 1196 -> 745 (-38%) | 277 -> 265 (-4%) | 416 -> 365 (-12%) | 54.0 -> 54.0 (0%) | 70.2 -> 74.2 (+6%) | 213 -> 159 (-25%) | 197 -> 180 (-9%) | 23.0 -> 23.0 (0%) | 27.4 -> 30.3 (+11%) | 1079 -> 696 (-35%) | 6608 -> 4018 (-39%) | 2128 -> 1179 (-45%) |
| desktop 6 low | 117 -> 94.1 (-19%) | 327 -> 291 (-11%) | 367 -> 330 (-10%) | 1196 -> 745 (-38%) | 228 -> 210 (-8%) | 309 -> 267 (-14%) | 22.0 -> 22.0 (0%) | 28.0 -> 27.4 (-2%) | 114 -> 64.0 (-44%) | 161 -> 137 (-15%) | 12.0 -> 12.0 (0%) | 17.2 -> 13.2 (-23%) | 1016 -> 632 (-38%) | 5911 -> 3433 (-42%) | 2128 -> 1179 (-45%) |
| phone 1 high | 29.5 -> 21.2 (-28%) | 70.4 -> 58.3 (-17%) | 81.8 -> 69.4 (-15%) | 393 -> 415 (+5%) | 0.00 -> 0.00 (0%) | 130 -> 111 (-15%) | 52.0 -> 52.0 (0%) | 47.0 -> 46.7 (-1%) | 32.0 -> 28.0 (-12%) | 57.4 -> 53.7 (-6%) | 23.0 -> 23.0 (0%) | 28.4 -> 28.8 (+1%) | 206 -> 169 (-18%) | 1241 -> 735 (-41%) | 2128 -> 1179 (-45%) |
| phone 1 low | 29.6 -> 21.2 (-28%) | 68.9 -> 56.2 (-18%) | 76.6 -> 63.8 (-17%) | 354 -> 415 (+17%) | 0.00 -> 0.00 (0%) | 70.4 -> 57.3 (-19%) | 22.0 -> 22.0 (0%) | 13.5 -> 13.9 (+3%) | 0.00 -> 0.00 (0%) | 36.5 -> 31.6 (-13%) | 12.0 -> 12.0 (0%) | 9.00 -> 10.4 (+16%) | 176 -> 131 (-26%) | 1050 -> 643 (-39%) | 2128 -> 1179 (-45%) |
| phone 4 high | 79.2 -> 63.4 (-20%) | 223 -> 197 (-12%) | 256 -> 230 (-10%) | 1196 -> 745 (-38%) | 153 -> 147 (-4%) | 290 -> 259 (-11%) | 52.0 -> 52.0 (0%) | 58.4 -> 58.2 (0%) | 116 -> 90.0 (-22%) | 125 -> 125 (+0%) | 23.0 -> 23.0 (0%) | 24.5 -> 25.6 (+4%) | 684 -> 460 (-33%) | 4395 -> 2607 (-41%) | 2128 -> 1179 (-45%) |
| phone 4 low | 76.7 -> 62.3 (-19%) | 215 -> 198 (-8%) | 239 -> 224 (-6%) | 1196 -> 745 (-38%) | 112 -> 115 (+3%) | 211 -> 189 (-11%) | 22.0 -> 22.0 (0%) | 16.8 -> 18.0 (+7%) | 43.0 -> 26.0 (-40%) | 114 -> 85.7 (-25%) | 12.0 -> 12.0 (0%) | 11.0 -> 10.9 (-1%) | 631 -> 426 (-33%) | 3948 -> 2295 (-42%) | 2128 -> 1179 (-45%) |
| phone 6 high | 116 -> 93.6 (-20%) | 333 -> 295 (-11%) | 376 -> 341 (-9%) | 1196 -> 745 (-38%) | 267 -> 246 (-8%) | 409 -> 352 (-14%) | 52.0 -> 52.0 (0%) | 66.2 -> 61.5 (-7%) | 191 -> 142 (-26%) | 170 -> 163 (-4%) | 23.0 -> 23.0 (0%) | 27.4 -> 26.5 (-3%) | 1062 -> 671 (-37%) | 6594 -> 3918 (-41%) | 2128 -> 1179 (-45%) |
| phone 6 low | 122 -> 94.5 (-22%) | 334 -> 288 (-14%) | 369 -> 325 (-12%) | 1196 -> 745 (-38%) | 225 -> 198 (-12%) | 308 -> 282 (-8%) | 22.0 -> 22.0 (0%) | 24.4 -> 29.3 (+20%) | 108 -> 68.0 (-37%) | 163 -> 135 (-17%) | 12.0 -> 12.0 (0%) | 17.2 -> 17.6 (+2%) | 976 -> 636 (-35%) | 5748 -> 3390 (-41%) | 2128 -> 1179 (-45%) |

### Runtime

| Config | fps | frame p50 ms | frame p95 ms | frame p99 ms | JS p50 ms | JS p95 ms | draws | TBT ms |
|---|---|---|---|---|---|---|---|---|
| title desktop 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.2 (-1%) | 3.10 -> 1.00 (-68%) | 4.60 -> 1.60 (-65%) | 84.6 -> 67.6 (-20%) | 0.00 -> 0.00 (0%) |
| title desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.20 -> 0.40 (-82%) | 3.00 -> 1.10 (-63%) | 58.6 -> 48.6 (-17%) | 0.00 -> 0.00 (0%) |
| title desktop 6 high | 118 -> 120 (+1%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.0 (-2%) | 15.3 -> 10.3 (-33%) | 5.30 -> 1.30 (-75%) | 7.20 -> 2.20 (-69%) | 84.6 -> 67.5 (-20%) | 0.00 -> 0.00 (0%) |
| title desktop 6 low | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 9.90 (-2%) | 10.3 -> 10.3 (0%) | 3.30 -> 0.70 (-79%) | 4.80 -> 1.60 (-67%) | 58.6 -> 48.6 (-17%) | 0.00 -> 0.00 (0%) |
| title phone 4 high | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 2.80 -> 0.90 (-68%) | 4.10 -> 1.50 (-63%) | 80.5 -> 63.5 (-21%) | 0.00 -> 0.00 (0%) |
| title phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.10 -> 0.40 (-81%) | 3.00 -> 1.30 (-57%) | 54.5 -> 44.5 (-18%) | 0.00 -> 0.00 (0%) |
| title phone 6 high | 114 -> 120 (+6%) | 8.30 -> 8.30 (0%) | 15.7 -> 9.90 (-37%) | 17.8 -> 10.3 (-42%) | 5.50 -> 1.30 (-76%) | 8.10 -> 2.30 (-72%) | 80.5 -> 63.4 (-21%) | 0.00 -> 0.00 (0%) |
| title phone 6 low | 118 -> 120 (+2%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.1 (-1%) | 16.5 -> 10.3 (-38%) | 4.80 -> 0.50 (-90%) | 6.70 -> 1.50 (-78%) | 54.5 -> 44.5 (-18%) | 0.00 -> 0.00 (0%) |
| heist-01 desktop 4 high | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 4.90 -> 1.00 (-80%) | 7.40 -> 1.70 (-77%) | 78.6 -> 67.9 (-14%) | 0.00 -> 0.00 (0%) |
| heist-01 desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.50 (-79%) | 3.80 -> 1.20 (-68%) | 49.5 -> 47.4 (-4%) | 0.00 -> 0.00 (0%) |
| heist-01 desktop 6 high | 116 -> 120 (+3%) | 8.30 -> 8.30 (0%) | 10.3 -> 10.0 (-3%) | 17.0 -> 10.3 (-39%) | 6.20 -> 1.30 (-79%) | 9.30 -> 2.50 (-73%) | 78.6 -> 67.8 (-14%) | 0.00 -> 0.00 (0%) |
| heist-01 desktop 6 low | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 3.20 -> 0.60 (-81%) | 5.60 -> 1.70 (-70%) | 49.5 -> 47.4 (-4%) | 0.00 -> 0.00 (0%) |
| heist-01 phone 4 high | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 2.90 -> 0.90 (-69%) | 6.20 -> 1.60 (-74%) | 73.7 -> 59.9 (-19%) | 0.00 -> 0.00 (0%) |
| heist-01 phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.0 (0%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.30 (-88%) | 3.60 -> 1.10 (-69%) | 40.1 -> 37.2 (-7%) | 0.00 -> 0.00 (0%) |
| heist-01 phone 6 high | 107 -> 120 (+12%) | 8.40 -> 8.30 (-1%) | 16.7 -> 10.1 (-40%) | 18.1 -> 10.3 (-43%) | 7.60 -> 1.30 (-83%) | 10.5 -> 2.50 (-76%) | 74.0 -> 59.8 (-19%) | 0.00 -> 0.00 (0%) |
| heist-01 phone 6 low | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 4.60 -> 0.50 (-89%) | 6.60 -> 1.70 (-74%) | 40.1 -> 37.1 (-7%) | 0.00 -> 0.00 (0%) |
| heist-02 desktop 4 high | 119 -> 120 (+1%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 4.20 -> 0.70 (-83%) | 6.20 -> 1.40 (-77%) | 59.6 -> 52.4 (-12%) | 29.0 -> 0.00 (-100%) |
| heist-02 desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.20 (-92%) | 3.50 -> 0.90 (-74%) | 36.7 -> 35.0 (-5%) | 0.00 -> 0.00 (0%) |
| heist-02 desktop 6 high | 114 -> 120 (+5%) | 8.30 -> 8.30 (0%) | 15.0 -> 10.1 (-33%) | 18.1 -> 10.3 (-43%) | 6.80 -> 1.00 (-85%) | 9.30 -> 2.10 (-77%) | 59.5 -> 52.4 (-12%) | 0.00 -> 0.00 (0%) |
| heist-02 desktop 6 low | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.0 (0%) | 10.3 -> 10.3 (0%) | 2.90 -> 0.20 (-93%) | 4.50 -> 1.40 (-69%) | 36.7 -> 35.0 (-5%) | 0.00 -> 0.00 (0%) |
| heist-02 phone 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.2 -> 10.3 (+1%) | 3.50 -> 0.60 (-83%) | 5.40 -> 1.30 (-76%) | 54.5 -> 48.0 (-12%) | 0.00 -> 0.00 (0%) |
| heist-02 phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.3 -> 10.3 (0%) | 1.70 -> 0.20 (-88%) | 2.80 -> 0.90 (-68%) | 30.4 -> 30.0 (-1%) | 0.00 -> 0.00 (0%) |
| heist-02 phone 6 high | 119 -> 120 (+1%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.1 (-1%) | 15.9 -> 10.3 (-35%) | 5.00 -> 1.00 (-80%) | 8.20 -> 1.90 (-77%) | 54.5 -> 48.0 (-12%) | 0.00 -> 0.00 (0%) |
| heist-02 phone 6 low | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 2.70 -> 0.20 (-93%) | 4.60 -> 1.40 (-70%) | 30.4 -> 30.0 (-1%) | 0.00 -> 0.00 (0%) |
| heist-03 desktop 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.3 -> 10.3 (0%) | 3.70 -> 0.90 (-76%) | 6.20 -> 1.50 (-76%) | 88.8 -> 78.7 (-11%) | 0.00 -> 0.00 (0%) |
| heist-03 desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.60 -> 0.30 (-88%) | 3.70 -> 1.10 (-70%) | 62.0 -> 59.4 (-4%) | 0.00 -> 0.00 (0%) |
| heist-03 desktop 6 high | 109 -> 120 (+10%) | 8.40 -> 8.30 (-1%) | 16.8 -> 10.1 (-40%) | 18.0 -> 10.3 (-43%) | 7.40 -> 1.30 (-82%) | 10.5 -> 2.20 (-79%) | 88.8 -> 78.6 (-11%) | 0.00 -> 0.00 (0%) |
| heist-03 desktop 6 low | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 3.80 -> 0.50 (-87%) | 5.90 -> 1.50 (-75%) | 62.0 -> 59.3 (-4%) | 0.00 -> 0.00 (0%) |
| heist-03 phone 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.80 (-67%) | 4.80 -> 1.40 (-71%) | 84.5 -> 72.3 (-14%) | 0.00 -> 0.00 (0%) |
| heist-03 phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 1.50 -> 0.30 (-80%) | 2.40 -> 1.00 (-58%) | 54.4 -> 51.4 (-6%) | 0.00 -> 0.00 (0%) |
| heist-03 phone 6 high | 121 -> 120 (-1%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 4.40 -> 1.40 (-68%) | 6.90 -> 3.20 (-54%) | 84.5 -> 72.3 (-14%) | 0.00 -> 0.00 (0%) |
| heist-03 phone 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.40 (-83%) | 3.70 -> 1.50 (-59%) | 54.4 -> 51.4 (-6%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.50 -> 0.90 (-64%) | 4.00 -> 1.50 (-62%) | 72.1 -> 63.2 (-12%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 1.70 -> 0.30 (-82%) | 2.70 -> 1.10 (-59%) | 44.9 -> 43.7 (-3%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 6 high | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.0 (-2%) | 10.3 -> 10.3 (0%) | 4.20 -> 1.30 (-69%) | 6.60 -> 2.50 (-62%) | 72.2 -> 63.2 (-12%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.50 -> 0.60 (-76%) | 4.00 -> 1.80 (-55%) | 44.9 -> 43.7 (-3%) | 0.00 -> 0.00 (0%) |
| heist-04 phone 4 high | 119 -> 120 (+1%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.0 (0%) | 10.3 -> 10.3 (0%) | 2.50 -> 0.80 (-68%) | 4.50 -> 1.50 (-67%) | 61.9 -> 53.1 (-14%) | 0.00 -> 0.00 (0%) |
| heist-04 phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 1.60 -> 0.30 (-81%) | 2.80 -> 1.10 (-61%) | 33.8 -> 33.1 (-2%) | 0.00 -> 0.00 (0%) |
| heist-04 phone 6 high | 118 -> 120 (+2%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.7 -> 10.3 (-4%) | 4.10 -> 1.10 (-73%) | 7.00 -> 2.30 (-67%) | 61.8 -> 52.9 (-14%) | 0.00 -> 0.00 (0%) |
| heist-04 phone 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.30 (-88%) | 4.10 -> 1.50 (-63%) | 33.8 -> 33.1 (-2%) | 0.00 -> 0.00 (0%) |
| heist-05 desktop 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.70 -> 0.80 (-70%) | 4.20 -> 1.40 (-67%) | 71.5 -> 62.1 (-13%) | 0.00 -> 0.00 (0%) |
| heist-05 desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.00 -> 0.20 (-90%) | 3.20 -> 1.00 (-69%) | 45.4 -> 43.2 (-5%) | 0.00 -> 0.00 (0%) |
| heist-05 desktop 6 high | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.1 (-1%) | 10.4 -> 10.3 (-1%) | 4.80 -> 1.20 (-75%) | 7.30 -> 2.30 (-68%) | 71.5 -> 62.1 (-13%) | 0.00 -> 0.00 (0%) |
| heist-05 desktop 6 low | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.2 (-1%) | 2.80 -> 0.40 (-86%) | 4.40 -> 1.60 (-64%) | 45.5 -> 43.2 (-5%) | 0.00 -> 0.00 (0%) |
| heist-05 phone 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 9.90 (-2%) | 10.3 -> 10.3 (0%) | 2.70 -> 0.70 (-74%) | 4.60 -> 1.30 (-72%) | 59.1 -> 50.1 (-15%) | 0.00 -> 0.00 (0%) |
| heist-05 phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 1.80 -> 0.20 (-89%) | 2.70 -> 0.90 (-67%) | 31.2 -> 30.2 (-3%) | 0.00 -> 0.00 (0%) |
| heist-05 phone 6 high | 119 -> 120 (+1%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.1 (-1%) | 10.6 -> 10.3 (-3%) | 5.20 -> 1.00 (-81%) | 8.10 -> 1.80 (-78%) | 59.1 -> 50.1 (-15%) | 0.00 -> 0.00 (0%) |
| heist-05 phone 6 low | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 2.60 -> 0.20 (-92%) | 4.00 -> 1.40 (-65%) | 31.1 -> 30.2 (-3%) | 0.00 -> 0.00 (0%) |
| heist-06 desktop 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 2.70 -> 0.70 (-74%) | 4.50 -> 1.30 (-71%) | 61.2 -> 54.8 (-10%) | 0.00 -> 0.00 (0%) |
| heist-06 desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.1 (-1%) | 10.3 -> 10.3 (0%) | 2.20 -> 0.20 (-91%) | 3.20 -> 0.90 (-72%) | 37.5 -> 37.0 (-1%) | 0.00 -> 0.00 (0%) |
| heist-06 desktop 6 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 3.80 -> 0.90 (-76%) | 6.40 -> 2.00 (-69%) | 61.2 -> 54.8 (-10%) | 0.00 -> 0.00 (0%) |
| heist-06 desktop 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.1 (-1%) | 10.3 -> 10.3 (0%) | 3.00 -> 0.20 (-93%) | 4.80 -> 1.40 (-71%) | 37.6 -> 37.1 (-1%) | 0.00 -> 0.00 (0%) |
| heist-06 phone 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.60 (-75%) | 3.80 -> 1.30 (-66%) | 63.6 -> 54.5 (-14%) | 0.00 -> 0.00 (0%) |
| heist-06 phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.1 (-1%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.20 (-92%) | 3.20 -> 0.90 (-72%) | 37.0 -> 35.2 (-5%) | 0.00 -> 0.00 (0%) |
| heist-06 phone 6 high | 121 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.1 (-1%) | 10.3 -> 10.3 (0%) | 4.10 -> 1.00 (-76%) | 6.70 -> 2.10 (-69%) | 63.6 -> 54.4 (-14%) | 0.00 -> 0.00 (0%) |
| heist-06 phone 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.20 (-92%) | 3.60 -> 1.30 (-64%) | 36.9 -> 35.2 (-5%) | 0.00 -> 0.00 (0%) |
| heist-07 desktop 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.0 (-2%) | 10.3 -> 10.3 (0%) | 4.60 -> 1.00 (-78%) | 6.50 -> 1.70 (-74%) | 109 -> 92.2 (-16%) | 0.00 -> 0.00 (0%) |
| heist-07 desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 2.00 -> 0.60 (-70%) | 3.20 -> 1.20 (-62%) | 72.3 -> 67.8 (-6%) | 0.00 -> 0.00 (0%) |
| heist-07 desktop 6 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.2 -> 10.1 (-1%) | 10.3 -> 10.3 (0%) | 5.30 -> 1.50 (-72%) | 7.50 -> 2.60 (-65%) | 109 -> 92.1 (-16%) | 0.00 -> 0.00 (0%) |
| heist-07 desktop 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 3.00 -> 0.70 (-77%) | 4.80 -> 1.70 (-65%) | 72.3 -> 67.8 (-6%) | 0.00 -> 0.00 (0%) |
| heist-07 phone 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 9.90 (-2%) | 10.3 -> 10.3 (0%) | 2.50 -> 1.00 (-60%) | 3.80 -> 2.10 (-45%) | 88.0 -> 72.0 (-18%) | 0.00 -> 0.00 (0%) |
| heist-07 phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 9.90 -> 10.1 (+2%) | 10.2 -> 10.3 (+1%) | 1.60 -> 0.40 (-75%) | 2.40 -> 1.20 (-50%) | 49.0 -> 46.5 (-5%) | 0.00 -> 0.00 (0%) |
| heist-07 phone 6 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 4.40 -> 1.30 (-70%) | 6.50 -> 2.40 (-63%) | 88.0 -> 71.8 (-18%) | 0.00 -> 0.00 (0%) |
| heist-07 phone 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.50 (-79%) | 3.80 -> 1.60 (-58%) | 49.0 -> 46.5 (-5%) | 0.00 -> 0.00 (0%) |
| heist-08 desktop 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.3 -> 10.3 (0%) | 2.20 -> 0.70 (-68%) | 3.30 -> 1.30 (-61%) | 49.0 -> 43.5 (-11%) | 0.00 -> 0.00 (0%) |
| heist-08 desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.3 -> 10.3 (0%) | 1.40 -> 0.20 (-86%) | 2.40 -> 0.90 (-62%) | 26.7 -> 26.4 (-1%) | 0.00 -> 0.00 (0%) |
| heist-08 desktop 6 high | 120 -> 120 (+0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 3.30 -> 1.00 (-70%) | 5.30 -> 2.60 (-51%) | 49.0 -> 43.5 (-11%) | 0.00 -> 0.00 (0%) |
| heist-08 desktop 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.2 -> 10.3 (+1%) | 2.20 -> 0.20 (-91%) | 3.60 -> 1.50 (-58%) | 26.7 -> 26.3 (-1%) | 0.00 -> 0.00 (0%) |
| heist-08 phone 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 9.90 (-2%) | 10.3 -> 10.3 (0%) | 2.40 -> 0.70 (-71%) | 3.60 -> 1.40 (-61%) | 49.1 -> 41.8 (-15%) | 0.00 -> 0.00 (0%) |
| heist-08 phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.0 (0%) | 10.3 -> 10.3 (0%) | 1.40 -> 0.20 (-86%) | 2.30 -> 0.90 (-61%) | 22.6 -> 22.7 (+0%) | 0.00 -> 0.00 (0%) |
| heist-08 phone 6 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 4.00 -> 1.00 (-75%) | 5.90 -> 2.10 (-64%) | 49.1 -> 41.8 (-15%) | 0.00 -> 0.00 (0%) |
| heist-08 phone 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 2.20 -> 0.20 (-91%) | 3.80 -> 1.30 (-66%) | 22.6 -> 22.7 (+0%) | 0.00 -> 0.00 (0%) |
| yard desktop 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.3 -> 10.3 (0%) | 1.80 -> 0.80 (-56%) | 2.50 -> 1.30 (-48%) | 83.0 -> 82.0 (-1%) | 0.00 -> 0.00 (0%) |
| yard desktop 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.2 -> 10.3 (+1%) | 1.10 -> 0.30 (-73%) | 1.80 -> 1.00 (-44%) | 67.0 -> 67.0 (0%) | 0.00 -> 0.00 (0%) |
| yard desktop 6 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.0 -> 10.1 (+1%) | 10.3 -> 10.3 (0%) | 2.80 -> 1.20 (-57%) | 4.20 -> 2.00 (-52%) | 83.0 -> 82.0 (-1%) | 0.00 -> 0.00 (0%) |
| yard desktop 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 1.80 -> 0.30 (-83%) | 2.80 -> 1.30 (-54%) | 67.0 -> 67.0 (0%) | 0.00 -> 0.00 (0%) |
| yard phone 4 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 1.60 -> 0.70 (-56%) | 2.60 -> 1.20 (-54%) | 70.3 -> 69.3 (-1%) | 0.00 -> 0.00 (0%) |
| yard phone 4 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 1.10 -> 0.20 (-82%) | 1.70 -> 0.80 (-53%) | 54.3 -> 54.1 (0%) | 0.00 -> 0.00 (0%) |
| yard phone 6 high | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.0 (-1%) | 10.3 -> 10.3 (0%) | 2.70 -> 1.00 (-63%) | 4.20 -> 2.00 (-52%) | 70.3 -> 69.3 (-1%) | 0.00 -> 0.00 (0%) |
| yard phone 6 low | 120 -> 120 (0%) | 8.30 -> 8.30 (0%) | 10.1 -> 10.1 (0%) | 10.3 -> 10.3 (0%) | 1.60 -> 0.30 (-81%) | 2.40 -> 1.40 (-42%) | 54.3 -> 54.1 (0%) | 0.00 -> 0.00 (0%) |

### Heap / GC

| Config | fps | after-GC start MB | after-GC end MB | retained growth MB | sampled peak MB | GC / min | GC total ms | GC p95 ms | GC max ms |
|---|---|---|---|---|---|---|---|---|---|
| heist-08 desktop 4 high | 120 -> 120 (0%) | 7.88 -> 7.89 (+0%) | 9.37 -> 9.38 (+0%) | 1.49 -> 1.49 (0%) | 14.3 -> 18.4 (+29% **worse**) | 170 -> 112 (-34%) | 178 -> 101 (-43%) | 1.97 -> 1.68 (-15%) | 6.77 -> 4.14 (-39%) |
| heist-08 phone 6 low | 120 -> 120 (0%) | 7.01 -> 7.02 (+0%) | 8.43 -> 8.48 (+1%) | 1.42 -> 1.46 (+3%) | 14.6 -> 11.7 (-20%) | 139 -> 87.0 (-37%) | 187 -> 126 (-33%) | 2.86 -> 2.26 (-21%) | 7.95 -> 5.93 (-25%) |
| yard desktop 4 high | 120 -> 120 (0%) | 17.0 -> 17.0 (0%) | 20.1 -> 20.1 (0%) | 3.12 -> 3.08 (-1%) | 27.1 -> 23.1 (-15%) | 155 -> 83.0 (-46%) | 133 -> 87.3 (-34%) | 1.57 -> 1.74 (+11%) | 4.31 -> 3.94 (-9%) |
| title desktop 4 high | 120 -> 120 (0%) | 6.20 -> 6.23 (+0%) | 7.16 -> 7.24 (+1%) | 0.96 -> 1.01 (+5%) | 9.53 -> 9.90 (+4%) | 176 -> 129 (-27%) | 220 -> 122 (-45%) | 3.34 -> 2.46 (-26%) | 4.82 -> 5.42 (+12%) |

### CPU profile (desktop 4x, unminified build, ms of main thread per 8 s window)

| Config | busy ms | GC ms | program ms | alloc MB/s |
|---|---|---|---|---|
| title desktop 4x high | 3050 -> 1721 (-44%) | 16.2 -> 13.6 (-16%) | 841 -> 535 (-36%) | 7.28 -> 5.53 (-24%) |
| title desktop 4x low | 2185 -> 1250 (-43%) | 12.8 -> 16.1 (+26%) | 667 -> 516 (-23%) | 5.39 -> 4.47 (-17%) |
| heist-01 desktop 4x high | 2256 -> 1445 (-36%) | 18.8 -> 7.60 (-60%) | 288 -> 263 (-9%) | 8.76 -> 4.99 (-43%) |
| heist-01 desktop 4x low | 1506 -> 1027 (-32%) | 13.9 -> 7.70 (-45%) | 207 -> 227 (+10%) | 6.69 -> 3.92 (-41%) |
| heist-05 desktop 4x high | 2093 -> 1278 (-39%) | 16.6 -> 9.80 (-41%) | 265 -> 274 (+4%) | 7.01 -> 4.09 (-42%) |
| heist-05 desktop 4x low | 1445 -> 860 (-40%) | 10.3 -> 10.0 (-3%) | 227 -> 266 (+17%) | 5.86 -> 3.17 (-46%) |
| heist-08 desktop 4x high | 2017 -> 1246 (-38%) | 20.1 -> 6.20 (-69%) | 282 -> 241 (-15%) | 6.17 -> 3.66 (-41%) |
| heist-08 desktop 4x low | 1365 -> 816 (-40%) | 10.4 -> 6.20 (-40%) | 256 -> 211 (-17%) | 5.17 -> 3.05 (-41%) |
| yard desktop 4x high | 1367 -> 1182 (-14%) | 10.1 -> 8.20 (-19%) | 168 -> 155 (-8%) | 8.38 -> 4.19 (-50%) |
| yard desktop 4x low | 895 -> 761 (-15%) | 11.0 -> 7.40 (-33%) | 132 -> 154 (+16%) | 7.42 -> 3.38 (-54%) |
| load (title -> heist -> yard) | 1305 -> 1064 (-18%) | 97.4 -> 67.4 (-31%) | 128 -> 106 (-17%) | n/a -> n/a |

## SwiftShader

Load: Before: 2026-09-30T00:18:01.130Z (baseline commit 18bbc425, scratch copy). After: 2026-09-29T23:25:30.782Z (18bbc425+dirty src). GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver).

Runtime, heap: Before: 2026-09-29T20:16:26.582Z (18bbc425+dirty src). After: 2026-09-29T23:25:30.782Z (18bbc425+dirty src). GPU: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver).

### Load (ms unless noted)

| Config | DCL | title interactive | diorama 1st frame | title kB | title TBT | first heist | heist links | heist shader ms | heist TBT | 2nd heist | 2nd heist links | 2nd heist shader ms | Yard ready | Yard all sheets | session kB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| desktop 1 high | 29.5 -> 22.0 (-25%) | 67.8 -> 57.0 (-16%) | 460 -> 444 (-4%) | 263 -> 269 (+2%) | 0.00 -> 0.00 (0%) | 6081 -> 5855 (-4%) | 54.0 -> 54.0 (0%) | 4865 -> 4743 (-2%) | 5050 -> 4949 (-2%) | 2921 -> 2794 (-4%) | 23.0 -> 23.0 (0%) | 2890 -> 2768 (-4%) | 4072 -> 3639 (-11%) | 15956 -> 9634 (-40%) | 2128 -> 1179 (-45%) |
| desktop 1 low | 29.6 -> 21.3 (-28%) | 67.7 -> 55.0 (-19%) | 112 -> 103 (-9%) | 296 -> 340 (+15%) | 0.00 -> 0.00 (0%) | 2493 -> 1759 (-29%) | 22.0 -> 22.0 (0%) | 1689 -> 960 (-43%) | 1737 -> 995 (-43%) | 793 -> 1534 (+93% **worse**) | 12.0 -> 12.0 (0%) | 762 -> 1512 (+99% **worse**) | 1326 -> 1974 (+49% **worse**) | 5295 -> 3961 (-25%) | 2128 -> 1179 (-45%) |
| desktop 4 high | 77.3 -> 60.3 (-22%) | 223 -> 192 (-14%) | 299 -> 267 (-11%) | 1196 -> 745 (-38%) | 2733 -> 2729 (0%) | 6292 -> 5726 (-9%) | 54.0 -> 54.0 (0%) | 4987 -> 4393 (-12%) | 5114 -> 4531 (-11%) | 2521 -> 2613 (+4%) | 23.0 -> 23.0 (0%) | 2408 -> 2521 (+5%) | 4853 -> 4392 (-9%) | 43784 -> 25854 (-41%) | 2128 -> 1179 (-45%) |
| desktop 4 low | 76.9 -> 61.8 (-20%) | 219 -> 193 (-12%) | 278 -> 253 (-9%) | 1196 -> 745 (-38%) | 1216 -> 1222 (+0%) | 2396 -> 3011 (+26% **worse**) | 22.0 -> 22.0 (0%) | 1376 -> 1541 (+12%) | 1610 -> 1660 (+3%) | 1432 -> 1207 (-16%) | 12.0 -> 12.0 (0%) | 1326 -> 1121 (-15%) | 2025 -> 1642 (-19%) | 15309 -> 9412 (-39%) | 2128 -> 1179 (-45%) |
| desktop 6 high | 119 -> 94.5 (-21%) | 338 -> 300 (-11%) | 429 -> 391 (-9%) | 1196 -> 745 (-38%) | 2852 -> 2872 (+1%) | 4789 -> 4924 (+3%) | 54.0 -> 54.0 (0%) | 3670 -> 3548 (-3%) | 3932 -> 3742 (-5%) | 2805 -> 2938 (+5%) | 23.0 -> 23.0 (0%) | 2640 -> 2797 (+6%) | 5132 -> 4634 (-10%) | 56754 -> 34843 (-39%) | 2128 -> 1179 (-45%) |
| desktop 6 low | 115 -> 94.4 (-18%) | 329 -> 292 (-11%) | 396 -> 355 (-10%) | 1196 -> 745 (-38%) | 1325 -> 1310 (-1%) | 2254 -> 2429 (+8%) | 22.0 -> 22.0 (0%) | 1118 -> 1126 (+1%) | 1304 -> 1267 (-3%) | 1166 -> 1474 (+26% **worse**) | 12.0 -> 12.0 (0%) | 1020 -> 1356 (+33% **worse**) | 2485 -> 1825 (-27%) | 20887 -> 13038 (-38%) | 2128 -> 1179 (-45%) |
| phone 1 high | 29.7 -> 21.1 (-29%) | 70.2 -> 57.4 (-18%) | 120 -> 108 (-11%) | 354 -> 415 (+17%) | 0.00 -> 0.00 (0%) | 4669 -> 5108 (+9%) | 52.0 -> 52.0 (0%) | 3855 -> 4225 (+10%) | 3855 -> 4230 (+10%) | 3231 -> 2504 (-23%) | 23.0 -> 23.0 (0%) | 3200 -> 2478 (-23%) | 4003 -> 3739 (-7%) | 18844 -> 10947 (-42%) | 2128 -> 1179 (-45%) |
| phone 1 low | 31.4 -> 21.3 (-32%) | 70.7 -> 55.9 (-21%) | 115 -> 100 (-13%) | 548 -> 415 (-24%) | 0.00 -> 0.00 (0%) | 1006 -> 1050 (+4%) | 22.0 -> 22.0 (0%) | 820 -> 935 (+14%) | 789 -> 898 (+14%) | 1326 -> 1235 (-7%) | 12.0 -> 12.0 (0%) | 1300 -> 1215 (-7%) | 1113 -> 1263 (+13%) | 4042 -> 2921 (-28%) | 2128 -> 1179 (-45%) |
| phone 4 high | 76.9 -> 63.5 (-17%) | 223 -> 200 (-10%) | 299 -> 276 (-8%) | 1196 -> 745 (-38%) | 1853 -> 1848 (0%) | 5565 -> 4243 (-24%) | 52.0 -> 52.0 (0%) | 4488 -> 3170 (-29%) | 4562 -> 3211 (-30%) | 2268 -> 3309 (+46% **worse**) | 23.0 -> 23.0 (0%) | 2156 -> 3212 (+49% **worse**) | 5222 -> 4644 (-11%) | 54246 -> 31292 (-42%) | 2128 -> 1179 (-45%) |
| phone 4 low | 77.4 -> 63.5 (-18%) | 219 -> 195 (-11%) | 280 -> 254 (-9%) | 1196 -> 745 (-38%) | 948 -> 876 (-8%) | 1606 -> 1912 (+19%) | 22.0 -> 22.0 (0%) | 1193 -> 1289 (+8%) | 1229 -> 1303 (+6%) | 1183 -> 1128 (-5%) | 12.0 -> 12.0 (0%) | 1081 -> 1055 (-2%) | 2093 -> 1712 (-18%) | 12902 -> 7937 (-38%) | 2128 -> 1179 (-45%) |
| phone 6 high | 118 -> 94.4 (-20%) | 334 -> 300 (-10%) | 427 -> 394 (-8%) | 1196 -> 745 (-38%) | 1971 -> 1951 (-1%) | 5092 -> 4056 (-20%) | 52.0 -> 52.0 (0%) | 4447 -> 3134 (-30%) | 4611 -> 3231 (-30%) | 2096 -> 2889 (+38% **worse**) | 23.0 -> 23.0 (0%) | 1919 -> 2748 (+43% **worse**) | 5082 -> 4682 (-8%) | 70771 -> 42527 (-40%) | 2128 -> 1179 (-45%) |
| phone 6 low | 117 -> 95.3 (-19%) | 330 -> 288 (-13%) | 395 -> 357 (-10%) | 1196 -> 745 (-38%) | 988 -> 966 (-2%) | 1749 -> 1885 (+8%) | 22.0 -> 22.0 (0%) | 1228 -> 1199 (-2%) | 1334 -> 1280 (-4%) | 917 -> 927 (+1%) | 12.0 -> 12.0 (0%) | 765 -> 816 (+7%) | 2152 -> 1887 (-12%) | 17284 -> 10954 (-37%) | 2128 -> 1179 (-45%) |

### Runtime

| Config | fps | frame p50 ms | frame p95 ms | frame p99 ms | JS p50 ms | JS p95 ms | draws | TBT ms |
|---|---|---|---|---|---|---|---|---|
| title desktop 4 high | 8.10 -> 10.2 (+26%) | 118 -> 92.8 (-21%) | 132 -> 101 (-24%) | 257 -> 242 (-6%) | 3.40 -> 3.00 (-12%) | 5.20 -> 3.90 (-25%) | 84.5 -> 73.4 (-13%) | 0.00 -> 0.00 (0%) |
| title desktop 4 low | 26.7 -> 33.4 (+25%) | 35.0 -> 31.9 (-9%) | 42.8 -> 34.8 (-19%) | 49.9 -> 35.2 (-29%) | 2.20 -> 1.90 (-14%) | 3.00 -> 2.50 (-17%) | 58.5 -> 48.6 (-17%) | 0.00 -> 0.00 (0%) |
| title desktop 6 high | 8.00 -> 10.1 (+26%) | 118 -> 93.1 (-21%) | 141 -> 117 (-17%) | 258 -> 234 (-9%) | 5.20 -> 4.60 (-12%) | 7.60 -> 6.60 (-13%) | 84.5 -> 73.5 (-13%) | 0.00 -> 0.00 (0%) |
| title desktop 6 low | 26.8 -> 32.9 (+23%) | 34.8 -> 32.1 (-8%) | 43.2 -> 34.9 (-19%) | 43.6 -> 43.2 (-1%) | 3.50 -> 2.80 (-20%) | 4.40 -> 3.80 (-14%) | 58.5 -> 48.6 (-17%) | 0.00 -> 0.00 (0%) |
| title phone 4 high | 10.3 -> 13.3 (+29%) | 91.6 -> 74.0 (-19%) | 115 -> 83.5 (-27%) | 292 -> 199 (-32%) | 3.20 -> 2.60 (-19%) | 4.10 -> 3.50 (-15%) | 80.3 -> 69.2 (-14%) | 0.00 -> 0.00 (0%) |
| title phone 4 low | 35.1 -> 45.0 (+28%) | 26.1 -> 24.2 (-7%) | 34.6 -> 26.5 (-23%) | 35.2 -> 26.8 (-24%) | 2.20 -> 1.60 (-27%) | 2.80 -> 2.20 (-21%) | 54.5 -> 44.5 (-18%) | 0.00 -> 0.00 (0%) |
| title phone 6 high | 10.3 -> 12.9 (+25%) | 91.7 -> 74.4 (-19%) | 99.6 -> 91.4 (-8%) | 284 -> 209 (-26%) | 4.90 -> 4.20 (-14%) | 6.30 -> 6.70 (+6%) | 80.3 -> 69.2 (-14%) | 0.00 -> 0.00 (0%) |
| title phone 6 low | 35.0 -> 42.2 (+21%) | 26.2 -> 24.4 (-7%) | 34.5 -> 26.7 (-23%) | 35.3 -> 59.9 (+70% **worse**) | 3.20 -> 2.40 (-25%) | 4.20 -> 3.60 (-14%) | 54.5 -> 44.6 (-18%) | 0.00 -> 0.00 (0%) |
| heist-01 desktop 4 high | 7.20 -> 9.00 (+25%) | 116 -> 99.1 (-15%) | 301 -> 234 (-22%) | 757 -> 309 (-59%) | 4.00 -> 3.20 (-20%) | 7.10 -> 5.00 (-30%) | 79.6 -> 76.3 (-4%) | 707 -> 0.00 (-100%) |
| heist-01 desktop 4 low | 35.6 -> 35.6 (0%) | 25.8 -> 25.6 (-1%) | 34.7 -> 35.0 (+1%) | 48.7 -> 43.3 (-11%) | 2.40 -> 2.00 (-17%) | 3.20 -> 2.70 (-16%) | 49.3 -> 47.2 (-4%) | 0.00 -> 0.00 (0%) |
| heist-01 desktop 6 high | 8.10 -> 9.90 (+22%) | 116 -> 98.5 (-15%) | 160 -> 124 (-22%) | 409 -> 225 (-45%) | 6.20 -> 5.10 (-18%) | 10.4 -> 7.60 (-27%) | 79.2 -> 75.8 (-4%) | 0.00 -> 0.00 (0%) |
| heist-01 desktop 6 low | 35.5 -> 35.1 (-1%) | 25.7 -> 26.0 (+1%) | 34.7 -> 34.9 (+1%) | 43.4 -> 48.7 (+12%) | 3.50 -> 2.90 (-17%) | 5.00 -> 4.10 (-18%) | 49.2 -> 47.2 (-4%) | 0.00 -> 0.00 (0%) |
| heist-01 phone 4 high | 6.10 -> 7.50 (+23%) | 150 -> 125 (-17%) | 250 -> 149 (-40%) | 493 -> 467 (-5%) | 4.30 -> 3.40 (-21%) | 6.40 -> 5.00 (-22%) | 74.4 -> 70.0 (-6%) | 0.00 -> 0.00 (0%) |
| heist-01 phone 4 low | 42.3 -> 42.1 (0%) | 24.5 -> 24.6 (+0%) | 32.6 -> 33.1 (+2%) | 66.5 -> 66.8 (+0%) | 2.30 -> 1.80 (-22%) | 3.00 -> 2.50 (-17%) | 40.0 -> 37.0 (-7%) | 31.0 -> 34.0 (+10%) |
| heist-01 phone 6 high | 6.30 -> 7.40 (+17%) | 150 -> 125 (-17%) | 217 -> 240 (+11%) | 425 -> 382 (-10%) | 6.30 -> 5.00 (-21%) | 9.60 -> 7.60 (-21%) | 73.9 -> 70.1 (-5%) | 0.00 -> 0.00 (0%) |
| heist-01 phone 6 low | 42.6 -> 42.3 (-1%) | 24.6 -> 24.6 (0%) | 31.6 -> 32.0 (+1%) | 41.9 -> 67.2 (+60% **worse**) | 3.20 -> 2.40 (-25%) | 4.80 -> 3.60 (-25%) | 40.0 -> 37.1 (-7%) | 33.0 -> 34.0 (+3%) |
| heist-02 desktop 4 high | 7.40 -> 9.60 (+30%) | 110 -> 91.9 (-16%) | 384 -> 166 (-57%) | 526 -> 408 (-23%) | 3.50 -> 2.60 (-26%) | 324 -> 4.50 (-99%) | 58.0 -> 55.7 (-4%) | 1106 -> 301 (-73%) |
| heist-02 desktop 4 low | 36.1 -> 36.8 (+2%) | 25.3 -> 25.2 (0%) | 40.2 -> 35.1 (-13%) | 102 -> 83.6 (-18%) | 1.90 -> 1.60 (-16%) | 2.90 -> 2.40 (-17%) | 36.5 -> 34.6 (-5%) | 124 -> 83.0 (-33%) |
| heist-02 desktop 6 high | 7.70 -> 9.30 (+21%) | 116 -> 93.0 (-20%) | 402 -> 281 (-30%) | 575 -> 367 (-36%) | 5.60 -> 4.20 (-25%) | 9.80 -> 6.10 (-38%) | 58.3 -> 56.0 (-4%) | 381 -> 530 (+39% **worse**) |
| heist-02 desktop 6 low | 35.9 -> 36.3 (+1%) | 25.2 -> 25.3 (+0%) | 40.8 -> 34.8 (-15%) | 76.7 -> 83.4 (+9%) | 2.90 -> 2.50 (-14%) | 4.30 -> 3.40 (-21%) | 35.9 -> 34.8 (-3%) | 84.0 -> 81.0 (-4%) |
| heist-02 phone 4 high | 6.40 -> 6.00 (-6%) | 144 -> 119 (-17%) | 190 -> 385 (+102% **worse**) | 499 -> 1884 (+277% **worse**) | 3.60 -> 3.00 (-17%) | 7.20 -> 5.30 (-26%) | 53.8 -> 51.9 (-4%) | 449 -> 380 (-15%) |
| heist-02 phone 4 low | 43.6 -> 43.5 (0%) | 24.3 -> 24.4 (+0%) | 31.4 -> 26.9 (-14%) | 42.0 -> 49.2 (+17%) | 1.80 -> 1.50 (-17%) | 2.50 -> 2.10 (-16%) | 30.6 -> 30.3 (-1%) | 48.0 -> 48.0 (0%) |
| heist-02 phone 6 high | 5.50 -> 7.70 (+40%) | 149 -> 124 (-17%) | 426 -> 173 (-59%) | 1217 -> 458 (-62%) | 5.30 -> 4.10 (-23%) | 9.50 -> 7.10 (-25%) | 53.9 -> 52.2 (-3%) | 486 -> 405 (-17%) |
| heist-02 phone 6 low | 43.3 -> 43.4 (+0%) | 24.3 -> 24.3 (0%) | 32.9 -> 33.2 (+1%) | 41.8 -> 50.8 (+22%) | 2.70 -> 2.10 (-22%) | 4.10 -> 3.20 (-22%) | 30.5 -> 29.9 (-2%) | 53.0 -> 50.0 (-6%) |
| heist-03 desktop 4 high | 8.80 -> 10.2 (+16%) | 109 -> 92.0 (-15%) | 140 -> 109 (-22%) | 343 -> 442 (+29% **worse**) | 3.40 -> 2.80 (-18%) | 5.30 -> 4.80 (-9%) | 90.1 -> 86.0 (-5%) | 0.00 -> 0.00 (0%) |
| heist-03 desktop 4 low | 37.8 -> 38.2 (+1%) | 25.2 -> 25.1 (0%) | 34.3 -> 33.7 (-2%) | 41.6 -> 41.8 (+0%) | 2.10 -> 1.70 (-19%) | 3.00 -> 2.50 (-17%) | 62.2 -> 59.1 (-5%) | 0.00 -> 0.00 (0%) |
| heist-03 desktop 6 high | 7.10 -> 10.2 (+44%) | 109 -> 92.2 (-16%) | 550 -> 118 (-79%) | 785 -> 352 (-55%) | 5.20 -> 4.40 (-15%) | 9.40 -> 7.00 (-26%) | 88.9 -> 86.2 (-3%) | 731 -> 0.00 (-100%) |
| heist-03 desktop 6 low | 37.9 -> 38.0 (+0%) | 25.1 -> 25.1 (0%) | 34.2 -> 33.6 (-2%) | 41.7 -> 40.5 (-3%) | 2.90 -> 2.60 (-10%) | 4.20 -> 3.70 (-12%) | 61.7 -> 58.9 (-5%) | 0.00 -> 0.00 (0%) |
| heist-03 phone 4 high | 6.50 -> 7.80 (+20%) | 142 -> 118 (-17%) | 192 -> 135 (-30%) | 468 -> 682 (+46% **worse**) | 3.70 -> 3.30 (-11%) | 5.90 -> 4.70 (-20%) | 83.2 -> 78.5 (-6%) | 0.00 -> 0.00 (0%) |
| heist-03 phone 4 low | 46.5 -> 46.8 (+1%) | 23.6 -> 23.5 (0%) | 26.7 -> 26.5 (-1%) | 34.7 -> 33.8 (-3%) | 1.90 -> 1.60 (-16%) | 2.60 -> 2.20 (-15%) | 54.4 -> 51.3 (-6%) | 0.00 -> 0.00 (0%) |
| heist-03 phone 6 high | 6.50 -> 7.80 (+20%) | 143 -> 118 (-17%) | 200 -> 134 (-33%) | 483 -> 541 (+12%) | 5.40 -> 4.40 (-19%) | 8.80 -> 6.20 (-30%) | 83.4 -> 79.8 (-4%) | 0.00 -> 0.00 (0%) |
| heist-03 phone 6 low | 45.6 -> 46.3 (+2%) | 23.8 -> 23.8 (0%) | 26.9 -> 26.7 (-1%) | 34.8 -> 33.3 (-4%) | 2.80 -> 2.30 (-18%) | 4.00 -> 3.30 (-18%) | 53.7 -> 51.2 (-5%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 4 high | 8.60 -> 10.2 (+19%) | 109 -> 91.8 (-15%) | 142 -> 109 (-23%) | 316 -> 300 (-5%) | 3.60 -> 2.80 (-22%) | 5.60 -> 4.90 (-12%) | 71.9 -> 69.7 (-3%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 4 low | 37.4 -> 38.2 (+2%) | 25.3 -> 25.1 (-1%) | 33.8 -> 34.6 (+2%) | 41.8 -> 42.0 (+0%) | 2.20 -> 1.70 (-23%) | 3.30 -> 2.60 (-21%) | 44.8 -> 43.6 (-3%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 6 high | 8.70 -> 10.3 (+18%) | 109 -> 91.9 (-15%) | 141 -> 102 (-28%) | 301 -> 291 (-3%) | 5.40 -> 4.30 (-20%) | 8.90 -> 7.70 (-13%) | 72.1 -> 69.8 (-3%) | 0.00 -> 0.00 (0%) |
| heist-04 desktop 6 low | 38.1 -> 37.5 (-2%) | 25.1 -> 25.3 (+1%) | 34.0 -> 34.0 (0%) | 34.9 -> 42.2 (+21%) | 3.10 -> 2.60 (-16%) | 4.40 -> 3.70 (-16%) | 44.8 -> 43.6 (-3%) | 0.00 -> 0.00 (0%) |
| heist-04 phone 4 high | 6.20 -> 7.30 (+18%) | 142 -> 117 (-18%) | 291 -> 384 (+32% **worse**) | 624 -> 590 (-5%) | 4.00 -> 3.10 (-22%) | 6.70 -> 6.20 (-7%) | 63.0 -> 60.8 (-3%) | 429 -> 342 (-20%) |
| heist-04 phone 4 low | 47.8 -> 47.7 (0%) | 17.8 -> 17.7 (-1%) | 26.6 -> 26.7 (+0%) | 41.4 -> 81.8 (+98% **worse**) | 1.90 -> 1.50 (-21%) | 3.00 -> 2.40 (-20%) | 33.7 -> 33.0 (-2%) | 0.00 -> 35.0 (+100%) |
| heist-04 phone 6 high | 6.30 -> 7.20 (+14%) | 141 -> 116 (-18%) | 306 -> 357 (+16%) | 602 -> 483 (-20%) | 6.10 -> 4.70 (-23%) | 10.8 -> 8.90 (-18%) | 63.2 -> 60.3 (-5%) | 439 -> 307 (-30%) |
| heist-04 phone 6 low | 48.3 -> 47.7 (-1%) | 18.0 -> 18.0 (0%) | 26.3 -> 26.5 (+1%) | 35.0 -> 42.0 (+20%) | 2.80 -> 2.30 (-18%) | 4.30 -> 3.50 (-19%) | 33.5 -> 32.8 (-2%) | 0.00 -> 0.00 (0%) |
| heist-05 desktop 4 high | 8.00 -> 9.70 (+21%) | 110 -> 92.3 (-16%) | 160 -> 109 (-32%) | 466 -> 600 (+29% **worse**) | 3.90 -> 2.80 (-28%) | 6.10 -> 4.50 (-26%) | 76.6 -> 70.4 (-8%) | 0.00 -> 0.00 (0%) |
| heist-05 desktop 4 low | 39.5 -> 39.0 (-1%) | 25.0 -> 25.0 (0%) | 33.6 -> 34.6 (+3%) | 41.7 -> 41.3 (-1%) | 2.30 -> 1.50 (-35%) | 3.20 -> 2.20 (-31%) | 43.8 -> 42.2 (-4%) | 0.00 -> 0.00 (0%) |
| heist-05 desktop 6 high | 8.00 -> 9.50 (+19%) | 110 -> 93.4 (-15%) | 127 -> 200 (+58% **worse**) | 741 -> 367 (-50%) | 5.80 -> 4.20 (-28%) | 10.0 -> 8.30 (-17%) | 76.4 -> 72.4 (-5%) | 0.00 -> 0.00 (0%) |
| heist-05 desktop 6 low | 38.7 -> 38.5 (-1%) | 25.1 -> 25.1 (0%) | 34.4 -> 34.8 (+1%) | 35.0 -> 43.0 (+23%) | 3.40 -> 2.20 (-35%) | 5.20 -> 3.60 (-31%) | 44.8 -> 42.2 (-6%) | 0.00 -> 0.00 (0%) |
| heist-05 phone 4 high | 6.00 -> 7.50 (+25%) | 149 -> 118 (-21%) | 358 -> 315 (-12%) | 434 -> 482 (+11%) | 4.20 -> 2.90 (-31%) | 274 -> 5.60 (-98%) | 60.3 -> 57.5 (-5%) | 924 -> 462 (-50%) |
| heist-05 phone 4 low | 47.5 -> 46.2 (-3%) | 18.1 -> 18.2 (+1%) | 32.1 -> 33.1 (+3%) | 43.2 -> 57.3 (+33% **worse**) | 2.00 -> 1.40 (-30%) | 2.90 -> 2.20 (-24%) | 30.1 -> 29.0 (-4%) | 63.0 -> 36.0 (-43%) |
| heist-05 phone 6 high | 6.10 -> 7.40 (+21%) | 149 -> 118 (-21%) | 348 -> 300 (-14%) | 566 -> 483 (-15%) | 6.30 -> 4.30 (-32%) | 11.4 -> 7.60 (-33%) | 60.6 -> 57.2 (-6%) | 619 -> 531 (-14%) |
| heist-05 phone 6 low | 46.6 -> 46.5 (0%) | 18.3 -> 18.3 (0%) | 32.4 -> 33.0 (+2%) | 58.7 -> 73.9 (+26% **worse**) | 3.00 -> 1.90 (-37%) | 4.30 -> 3.00 (-30%) | 30.3 -> 29.2 (-4%) | 17.0 -> 36.0 (+112%) |
| heist-06 desktop 4 high | 7.20 -> 8.20 (+14%) | 132 -> 116 (-12%) | 268 -> 215 (-20%) | 598 -> 351 (-41%) | 3.30 -> 2.90 (-12%) | 6.30 -> 4.70 (-25%) | 62.1 -> 59.6 (-4%) | 546 -> 599 (+10%) |
| heist-06 desktop 4 low | 29.4 -> 29.1 (-1%) | 33.4 -> 33.4 (0%) | 42.1 -> 42.2 (+0%) | 50.1 -> 51.3 (+2%) | 1.90 -> 1.80 (-5%) | 2.90 -> 2.40 (-17%) | 37.0 -> 36.7 (-1%) | 0.00 -> 0.00 (0%) |
| heist-06 desktop 6 high | 6.80 -> 8.70 (+28%) | 133 -> 110 (-17%) | 325 -> 132 (-59%) | 599 -> 299 (-50%) | 5.40 -> 4.20 (-22%) | 9.70 -> 5.90 (-39%) | 62.3 -> 59.2 (-5%) | 545 -> 0.00 (-100%) |
| heist-06 desktop 6 low | 29.2 -> 28.9 (-1%) | 33.5 -> 33.5 (0%) | 42.5 -> 43.1 (+1%) | 50.3 -> 50.2 (0%) | 2.90 -> 2.50 (-14%) | 4.20 -> 3.60 (-14%) | 37.2 -> 36.8 (-1%) | 0.00 -> 0.00 (0%) |
| heist-06 phone 4 high | 5.60 -> 6.80 (+21%) | 160 -> 134 (-16%) | 500 -> 316 (-37%) | 650 -> 575 (-12%) | 3.70 -> 3.10 (-16%) | 7.00 -> 5.60 (-20%) | 63.2 -> 60.1 (-5%) | 1044 -> 906 (-13%) |
| heist-06 phone 4 low | 37.0 -> 37.1 (+0%) | 25.1 -> 25.1 (0%) | 34.6 -> 34.4 (-1%) | 91.6 -> 83.4 (-9%) | 1.90 -> 1.50 (-21%) | 2.70 -> 2.30 (-15%) | 37.2 -> 35.3 (-5%) | 131 -> 153 (+17%) |
| heist-06 phone 6 high | 5.80 -> 6.80 (+17%) | 165 -> 134 (-19%) | 316 -> 307 (-3%) | 533 -> 585 (+10%) | 5.70 -> 4.60 (-19%) | 11.0 -> 8.00 (-27%) | 63.0 -> 59.7 (-5%) | 938 -> 912 (-3%) |
| heist-06 phone 6 low | 37.2 -> 36.5 (-2%) | 25.1 -> 25.0 (0%) | 34.8 -> 34.7 (0%) | 56.9 -> 50.3 (-12%) | 2.70 -> 2.20 (-19%) | 4.00 -> 3.30 (-18%) | 37.2 -> 35.2 (-5%) | 132 -> 301 (+128% **worse**) |
| heist-07 desktop 4 high | 7.80 -> 9.10 (+17%) | 117 -> 100 (-14%) | 144 -> 160 (+11%) | 523 -> 458 (-12%) | 4.10 -> 3.50 (-15%) | 6.10 -> 5.20 (-15%) | 109 -> 103 (-5%) | 440 -> 514 (+17%) |
| heist-07 desktop 4 low | 33.7 -> 33.9 (+1%) | 31.7 -> 26.9 (-15%) | 35.1 -> 35.2 (+0%) | 42.7 -> 42.6 (0%) | 2.50 -> 1.90 (-24%) | 3.30 -> 2.70 (-18%) | 72.1 -> 67.6 (-6%) | 0.00 -> 0.00 (0%) |
| heist-07 desktop 6 high | 7.50 -> 8.40 (+12%) | 117 -> 100 (-14%) | 193 -> 340 (+77% **worse**) | 609 -> 768 (+26% **worse**) | 6.50 -> 5.50 (-15%) | 9.50 -> 8.80 (-7%) | 109 -> 102 (-6%) | 530 -> 286 (-46%) |
| heist-07 desktop 6 low | 33.6 -> 33.6 (0%) | 31.9 -> 31.9 (0%) | 34.7 -> 35.0 (+1%) | 41.9 -> 41.7 (0%) | 3.60 -> 2.90 (-19%) | 4.90 -> 4.10 (-16%) | 72.1 -> 67.7 (-6%) | 0.00 -> 0.00 (0%) |
| heist-07 phone 4 high | 5.70 -> 7.40 (+30%) | 150 -> 125 (-17%) | 492 -> 316 (-36%) | 643 -> 433 (-33%) | 4.70 -> 3.60 (-23%) | 6.60 -> 6.50 (-2%) | 88.2 -> 83.5 (-5%) | 436 -> 383 (-12%) |
| heist-07 phone 4 low | 41.6 -> 41.8 (+0%) | 24.7 -> 24.8 (+0%) | 31.9 -> 26.9 (-16%) | 41.7 -> 42.9 (+3%) | 2.20 -> 1.70 (-23%) | 3.00 -> 2.50 (-17%) | 48.8 -> 46.2 (-5%) | 16.0 -> 65.0 (+306%) |
| heist-07 phone 6 high | 6.10 -> 7.40 (+21%) | 150 -> 125 (-16%) | 358 -> 317 (-12%) | 640 -> 476 (-26%) | 6.60 -> 5.20 (-21%) | 9.80 -> 7.60 (-22%) | 87.9 -> 83.4 (-5%) | 437 -> 325 (-26%) |
| heist-07 phone 6 low | 41.5 -> 41.4 (0%) | 24.8 -> 24.6 (-1%) | 32.4 -> 32.7 (+1%) | 41.1 -> 41.7 (+1%) | 3.30 -> 2.50 (-24%) | 4.70 -> 3.50 (-26%) | 48.7 -> 46.3 (-5%) | 18.0 -> 70.0 (+289% **worse**) |
| heist-08 desktop 4 high | 8.80 -> 10.5 (+19%) | 108 -> 90.6 (-16%) | 125 -> 100 (-20%) | 376 -> 367 (-2%) | 3.50 -> 2.70 (-23%) | 5.50 -> 4.10 (-25%) | 48.9 -> 47.6 (-3%) | 0.00 -> 0.00 (0%) |
| heist-08 desktop 4 low | 42.6 -> 42.0 (-1%) | 24.8 -> 24.8 (0%) | 32.5 -> 33.1 (+2%) | 34.1 -> 42.9 (+26%) | 2.10 -> 1.50 (-29%) | 3.00 -> 2.50 (-17%) | 26.7 -> 26.5 (-1%) | 0.00 -> 0.00 (0%) |
| heist-08 desktop 6 high | 8.80 -> 9.90 (+12%) | 108 -> 91.1 (-16%) | 118 -> 102 (-14%) | 434 -> 375 (-13%) | 5.30 -> 4.10 (-23%) | 8.30 -> 7.40 (-11%) | 48.9 -> 48.2 (-1%) | 0.00 -> 0.00 (0%) |
| heist-08 desktop 6 low | 42.1 -> 42.7 (+1%) | 24.8 -> 24.7 (0%) | 32.7 -> 32.3 (-1%) | 34.8 -> 35.0 (+1%) | 3.10 -> 2.10 (-32%) | 4.20 -> 3.20 (-24%) | 26.6 -> 26.1 (-2%) | 0.00 -> 0.00 (0%) |
| heist-08 phone 4 high | 6.40 -> 8.10 (+27%) | 141 -> 116 (-18%) | 283 -> 133 (-53%) | 492 -> 500 (+2%) | 4.10 -> 3.00 (-27%) | 6.70 -> 4.90 (-27%) | 50.7 -> 48.4 (-5%) | 441 -> 0.00 (-100%) |
| heist-08 phone 4 low | 49.3 -> 48.2 (-2%) | 17.8 -> 17.5 (-2%) | 26.7 -> 32.0 (+20%) | 34.6 -> 48.4 (+40% **worse**) | 1.90 -> 1.50 (-21%) | 2.90 -> 2.20 (-24%) | 22.8 -> 22.9 (+0%) | 0.00 -> 0.00 (0%) |
| heist-08 phone 6 high | 6.60 -> 8.10 (+23%) | 142 -> 116 (-18%) | 183 -> 134 (-27%) | 519 -> 415 (-20%) | 5.50 -> 4.30 (-22%) | 9.20 -> 6.30 (-32%) | 49.6 -> 48.3 (-3%) | 0.00 -> 0.00 (0%) |
| heist-08 phone 6 low | 48.7 -> 47.5 (-2%) | 17.7 -> 17.9 (+1%) | 26.6 -> 32.2 (+21%) | 34.8 -> 42.5 (+22%) | 2.90 -> 2.00 (-31%) | 4.40 -> 3.20 (-27%) | 22.7 -> 22.8 (+0%) | 0.00 -> 0.00 (0%) |
| yard desktop 4 high | 8.60 -> 10.1 (+17%) | 117 -> 100 (-14%) | 124 -> 102 (-18%) | 126 -> 108 (-14%) | 2.90 -> 2.50 (-14%) | 3.50 -> 3.20 (-9%) | 84.3 -> 82.4 (-2%) | 0.00 -> 0.00 (0%) |
| yard desktop 4 low | 29.3 -> 29.2 (0%) | 33.5 -> 33.5 (0%) | 41.5 -> 41.6 (+0%) | 42.7 -> 42.8 (+0%) | 1.80 -> 1.70 (-6%) | 2.30 -> 2.30 (0%) | 67.2 -> 67.0 (0%) | 0.00 -> 0.00 (0%) |
| yard desktop 6 high | 8.50 -> 10.0 (+18%) | 117 -> 100 (-14%) | 125 -> 107 (-15%) | 134 -> 117 (-12%) | 4.50 -> 3.90 (-13%) | 5.20 -> 4.80 (-8%) | 84.2 -> 82.4 (-2%) | 0.00 -> 0.00 (0%) |
| yard desktop 6 low | 29.2 -> 29.1 (0%) | 33.4 -> 33.5 (+0%) | 41.6 -> 42.0 (+1%) | 42.7 -> 42.9 (+0%) | 2.60 -> 2.40 (-8%) | 3.50 -> 3.10 (-11%) | 67.3 -> 67.0 (0%) | 0.00 -> 0.00 (0%) |
| yard phone 4 high | 6.80 -> 8.10 (+19%) | 149 -> 125 (-16%) | 151 -> 126 (-16%) | 152 -> 132 (-13%) | 2.50 -> 2.40 (-4%) | 3.30 -> 3.00 (-9%) | 70.7 -> 68.8 (-3%) | 0.00 -> 0.00 (0%) |
| yard phone 4 low | 36.5 -> 36.5 (0%) | 25.7 -> 25.6 (0%) | 34.4 -> 34.0 (-1%) | 35.1 -> 34.9 (-1%) | 1.50 -> 1.50 (0%) | 2.20 -> 2.00 (-9%) | 54.2 -> 54.3 (+0%) | 0.00 -> 0.00 (0%) |
| yard phone 6 high | 6.70 -> 8.00 (+19%) | 150 -> 125 (-16%) | 152 -> 127 (-17%) | 160 -> 133 (-17%) | 4.00 -> 3.70 (-7%) | 4.80 -> 4.40 (-8%) | 70.7 -> 68.7 (-3%) | 0.00 -> 0.00 (0%) |
| yard phone 6 low | 36.2 -> 36.3 (+0%) | 25.7 -> 25.5 (-1%) | 34.4 -> 34.7 (+1%) | 35.2 -> 35.0 (-1%) | 2.30 -> 2.10 (-9%) | 3.00 -> 3.00 (0%) | 54.2 -> 54.3 (+0%) | 0.00 -> 0.00 (0%) |

### Heap / GC

| Config | fps | after-GC start MB | after-GC end MB | retained growth MB | sampled peak MB | GC / min | GC total ms | GC p95 ms | GC max ms |
|---|---|---|---|---|---|---|---|---|---|
| heist-08 desktop 4 high | 8.90 -> 10.6 (+19%) | 7.37 -> 7.39 (+0%) | 8.69 -> 8.66 (0%) | 1.32 -> 1.27 (-4%) | 15.9 -> 16.6 (+4%) | 92.5 -> 64.7 (-30%) | 76.3 -> 59.6 (-22%) | 1.53 -> 1.43 (-7%) | 5.45 -> 3.82 (-30%) |
| heist-08 phone 6 low | 46.1 -> 46.3 (+0%) | 6.83 -> 6.65 (-3%) | 8.09 -> 8.08 (0%) | 1.26 -> 1.43 (+13%) | 17.9 -> 18.8 (+5%) | 81.2 -> 52.8 (-35%) | 105 -> 77.6 (-26%) | 2.10 -> 4.34 (+107% **worse**) | 7.17 -> 5.57 (-22%) |
| yard desktop 4 high | 8.60 -> 10.0 (+16%) | 17.4 -> 17.2 (-1%) | 19.3 -> 19.6 (+2%) | 1.87 -> 2.34 (+25% **worse**) | 19.9 -> 19.9 (0%) | 58.0 -> 39.0 (-33%) | 65.6 -> 49.9 (-24%) | 1.98 -> 6.31 (+219% **worse**) | 9.02 -> 7.04 (-22%) |
| title desktop 4 high | 8.40 -> 10.5 (+25%) | 5.68 -> 5.70 (+0%) | 6.64 -> 6.61 (0%) | 0.96 -> 0.91 (-5%) | 7.30 -> 7.80 (+7%) | 55.0 -> 52.0 (-5%) | 42.5 -> 43.4 (+2%) | 1.33 -> 1.48 (+11%) | 3.07 -> 3.32 (+8%) |
