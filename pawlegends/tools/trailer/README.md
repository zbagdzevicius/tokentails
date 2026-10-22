# Trailer capture rig (dev only)

Captures the Pawlegends launch trailer ("Meet Gabė", 30 s at 60 fps) from real in-engine gameplay of this build
(SIM_VERSION 10). Nothing here is part of `build` or `build:client`: Vite builds only `index.html`, and the harness
page lives here. Outputs are gitignored.

| File | Role |
|---|---|
| `take-driver.ts` | One seeded Normal match: slot 0 is the player-bot `normal` plus scripted commands. Pure sim; Node and the browser run the same file. |
| `seed-search.mjs` | Finds a seed per take (CLANK on Sir Brutus, Moonshot hit, Pudding chain, COMEBACK, the core falling, ...) and writes `takes.json` with key ticks, roles and the event-log hash. |
| `harness.html`, `harness.ts` | The real renderer, `MatchSession` and lobby on a take, a director camera (render only), HUD layers per shot. |
| `fake-worker.ts` | Stands in for the sim Worker so the take advances only when the harness asks. |
| `vclock.js` | Virtual time: timers, rAF, `performance.now`, `Math.random` and CSS animations move only per captured frame. |
| `director.ts` | Camera keys, easing and speed ramps (unit tested in `director.test.mjs`). |
| `shots.mjs` | The storyboard shot list as data (16:9 and 9:16). |
| `capture.mjs` | Playwright: solves each shot's timing, steps frame by frame, blends WHIP sub-frames (32 per frame, 180° shutter, the screen-space layer laid on once per frame so numbers never smear), checks the hash, writes PNGs. |
| `copy.json`, `lint-copy.mjs` | Every on-screen string, and the copy gate: the repo copy lint (pawlegends target, R13) plus no "#1" and no numbers except "3V3". |
| `mg-timeline.mjs`, `mg.js`, `type.html`, `type.mjs` | Motion graphics: kinetic type (SLAM/POP/OUT, motion blur), the Gabė photo card and match-cut whip-zoom, the end card, flashes. Writes overlay (alpha) and plate (opaque) PNGs plus the post list (shakes, rgbashift, pushes) for the edit. |
| `dsp.mjs`, `instruments.mjs`, `score.mjs` | The original score at 120 BPM (re-voices `audio/music.ts`) with the game's own zzfx sounds rendered offline; -14 LUFS, true peak under -1 dBTP; stems, one-shots and `cues.json`. |
| `edl.json`, `edit-plan.mjs`, `edit.mjs` | The edit: footage on the beat grid (ramps are baked in at capture), plates, bark push-ins, skin bumps, the 9:16 HUD band, shakes, CAS sharpening, the grade (eq, S-curve, warm balance, 18 % vignette, grain), chromatic accents, the type overlay; the mix (music ducked under impacts, -14 LUFS, true peak under -1 dBTP, sample-locked); H.264 High CRF 16 + AAC 320k masters, posters, `report.json`. Plan unit-tested in `edit.test.mjs`. |

```sh
node tools/trailer/seed-search.mjs --seeds 2000            # takes.json (commit it: the seeds are the takes)
node tools/trailer/capture.mjs --out <dir>                  # every shot, 16:9 and 9:16
node tools/trailer/capture.mjs --only S13 --aspect 9x16 --every 10   # a quick look
```

```sh
node tools/trailer/score.mjs --out <dir>/audio --report         # score.wav, score-15.wav, stems/, sfx/, cues.json
node tools/trailer/type.mjs --shots <capture dir> --out <dir>/mg --audio <dir>/audio [--preview]
```

Frames land in `<dir>/<shot>/<aspect>/fNNNN.png` (the master's frame numbers) with `<dir>/manifest.json`.

Flashes are additive blooms the edit lays over the picture (never a solid fill, never on frame 0). Captions that repeat
the game's own lines (CLANK!, the barks, COMEBACK!, Shut down!, Victory!) are in `copy.json` and pass the copy gate.
Under a director camera the harness turns off the structures' x-ray fade (a top-down gameplay-camera aid). Per shot it can
also clean up the frame, render side only: `popText` keeps only the listed screen pops and callouts (the trailer type
repeats the game's own lines large, so the small in-game copy is hidden: never both), `dmgRadius` hides far damage
numbers, `realFlash` decays hit flashes in output time (a slow ramp never holds a ghost-white unit), `cullHeroes` hides a
hero standing in front of the lens, `near` sets the near plane (a banner pole across the lens), `wheelScale` draws the
ping wheel larger. S19 in 9:16 is a phone in landscape (932x430 CSS px at DPR 2) shown whole as one band.

Takes T (S17: a dog tower falling with Pudding, cats and a wave at it) and K's `march` key (S16) come from
`seed-search.mjs`; N puts Belly Flop 3-20 ticks before the core falls; J has the same ally answer the first ping and refuse
the second, with no dog hero near either ping.

Rules: the camera, card skins (`demo-*` from `app/skinDemo.ts`) and the clock are render-side only; no input reaches
the sim except the take's script, which seed-search plays in Node too. A take whose browser hash differs from
`takes.json` is reported as a MISMATCH. The game's own hit-stops and slow motion run on top of each shot's ramp.

```sh
node tools/trailer/edit.mjs --dir <dir>            # <dir>/out: 30 s and 15 s masters (16:9, 9:16), posters, mix WAVs, report.json
node tools/trailer/edit.mjs --dir <dir> --cut 30 --aspect 16x9 --prores   # one master, plus a ProRes 422 HQ .mov
node tools/trailer/edit.mjs --dir <dir> --mix-only                         # the mixes only (loudness, LRA), no video
```

`edit.mjs` refuses to render on a copy-gate finding, a take hash mismatch or a missing frame, and fails if a master is
not exactly 1800 (900) frames at 60 fps, the right size, or above -1 dBTP.

Finished masters are copied to `pawlegends/media/trailer/` (gitignored, like every output here).
