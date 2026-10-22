# Trailer capture rig (dev only)

**v2 ("Big Plays", 30 s at 144 BPM, gameplay first)** is the current trailer: `shots.mjs`, `mg-timeline.mjs`,
`copy.json`, `score.mjs`, `edl.json`. The v1 trailer ("Meet Gabė", 120 BPM) keeps its data as `shots-v1.mjs`,
`mg-timeline-v1.mjs`, `copy-v1.json` and `score-v1.mjs` (the edit and type tools now read the v2 files).

What v2 adds to the rig:

| Change | Where |
|---|---|
| Fixed takes from the moment scan (X1-X14): `seed-search.mjs --fixed [--only X1]` seals them into `takes.json` | `fixed-takes.mjs`, `seed-search.mjs` |
| Tempo as a setting: 144 BPM = 25 frames per beat, 100 per bar (`score.mjs --bpm`, `BEAT_FRAMES`, `edl.bpm`) | `score.mjs`, `mg-timeline.mjs`, `mg.js` |
| Several pinned keys per shot: `fits: [{ key, frame, seg, offset? }]`, solved in order (Pack Hunt pins three takedowns to three beats) | `capture.mjs` |
| `xray: true` per shot: a tower or core between the lens and the look point fades (line of sight, not the top-down rule) | `harness.ts` |
| Hit-flash cap: hero flashes last at most `flashCap` (default 2) output frames; structures under steady fire keep a light tint | `harness.ts` |
| Motion blur on acrobatics: `blur: [[a, b], ...]` (32 sub-frames, 180° shutter), not only whips | `capture.mjs` |
| Card looks in one entry: `looks: [[fromFrame, 'demo-ficus'], ...]` | `capture.mjs` |
| Look-dev variants: `--shots-file <module>` (same exports as `shots.mjs`) | `capture.mjs` |
| Highlight bloom in the grade (`edl.grade.bloom`), zoom-punch bumps on the impacts | `edit.mjs`, `edl.json` |
| Type: mask-wipe exit on a 12° diagonal, shake-on-land; the end card over the last gameplay frame, blurred | `mg.js`, `type.mjs` |
| The 15 s cut as segments of the master; the score places every designed hit of the 30 s cue sheet at the 15 s frame too | `mg-timeline.mjs` `CUT15_SEGMENTS`, `score.mjs` `DESIGN` |

```sh
node tools/trailer/seed-search.mjs --fixed                        # the v2 takes (X1-X14) into takes.json
node tools/trailer/capture.mjs --aspect 16x9 --out <dir>/shots    # and --aspect 9x16 (the two can run side by side)
node tools/trailer/score.mjs --out <dir>/audio --report           # 144 BPM, -14 LUFS, <= -1 dBTP
node tools/trailer/type.mjs --shots <dir>/shots --out <dir>/mg
node tools/trailer/edit.mjs --dir <dir>
```


**v2 redo (review fixes).** Frame 0 is Lambo mid-air in X14's 5 m Belly Flop; Pudding's static beat is replaced by
Cacklejaw's ambush pounce (take G); the tower and the core fall whole at hero height; COMEBACK! lands on Avietė's level-10
spike; bars 12-13 are three more fights (U4 combo, U5 Clem Q, M shut down); the core fall and Victory! are one
continuous take (no second collapse); game words (Coming to you!, COMEBACK!, Victory!) are captioned large; kinetic type
sits in the top third; the end card is a branded plate from f1650 (2.5 s). New rig options:

| Option | Where | What |
|---|---|---|
| `lead: N` | `capture.mjs` | N unsaved frames rendered through the real frame path before f0: a clip whose cast falls just before the first saved frame (a flop already in the air on frame 0) is drawn live. Events played only in the pre-roll do not start move clips. |
| `shutter` | `capture.mjs` | Blur shutter per shot (0.5 = 180°, 0.25-0.3 for rides and dives, so the pose stays sharp) |
| `flashMax` (default 0.2) | `harness.ts` | Hero hit-flash peak during the cap: a tint, never a white body. The game's full-screen `.pl-flash` layer is dropped; the edit lays capped blooms. |
| `cullMinions` / `minionsOff` | `harness.ts` | Creeps between the lens and the subject (or all) are not drawn |
| `popText` on damage words | `harness.ts` | Damage-layer words (CLANK!, Snip!) show only when whitelisted |
| glue before sections | `edit.mjs` | The glue compressor runs before the energy curve, so section levels survive the limiter (more contrast; the core impact is the loudest moment) |

## v1 notes


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
