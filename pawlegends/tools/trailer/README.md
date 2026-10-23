# Trailer capture rig (dev only)

> **Not releasable yet.** The end card sends viewers to `tokentails.com/pawlegends`, which returns HTTP 404 (checked
> 2026-10-23, also `/pawlegends-game/index.html`): the Pawlegends client route exists only on `feat/pawlegends` and is
> not deployed. Deploy it and confirm a 200 before anyone posts a master.

**Capture QC (v3.1).** `harness.ts` `frame()` returns a per-frame `qc` (`FrameQc`): every on-screen hero's body-and-plate
box, the pairs of bodies whose screen boxes share more than 45 % (`overlap`), heroes standing in a tower, core or Pudding
footprint (`inStruct`), game text touching the frame edge (`edgeText`) and the reasons (`why`). `capture.mjs` writes it
to `<shot>/<aspect>/qc.json` and fails a shot (`OVERLAP` / `STRUCTURE` / `EDGE TEXT QC FAIL`, recorded in
`manifest.json`) on more than 2 such frames in a row; `v3/edit.mjs` refuses to render on any of them. The base banners
are their own meshes (`banners`, `banners-swapped`) and are scaled to 0 unless a shot keeps `banners: true`.

**v4 (review of v3)** is the current trailer: `shots.mjs`, `mg-timeline.mjs`, `copy.json` (HUGE ULTS. / TRIPLE
TAKEDOWN.), `score.mjs`, `edl.json`. Hook: one clean side-on Belly Flop (take H) against the tree line, contact held 5
frames under a white flash. Roll call: each hero's apex mid-shot with a slow-motion hold. 3V3: one orbit over all six.
Ults framed on their vertical parts (the moon draw, the flame curtains, Brutus's shield wall and CLANK!, the pillars).
Pack Hunt from the front three-quarter with the game's pops large; the tower dive cut to two beats; COMEBACK! on a
triple hit, then the comeback wave; card looks frozen on one pose with white wipes; two teamfight bars (a wide brawl,
then six triplet cuts of moves not shown before); the core bursts on f1528 with the pile clear of it; Victory two
beats; the end card from f1625 with a larger logo, the line-up hopping hero by hero, a final stab and black from f1782.
The ping and Pudding beats are cut: the ping wheel and its answer cannot be read at trailer speed, and Pudding's hop
has no rendered jump (he is seen in the tower fall instead).

| Change | Where | What |
|---|---|---|
| Hold frames unblurred, snap-safe blur | `capture.mjs`, `harness.ts` (`frame()` reports the largest hero move) | A frame at speed 0 is one render (no accumulation); a hero jump over 0.25 m inside the shutter keeps only the sub-frames after it (no knockback double image). |
| `hideIds`, `popScale`, `groundK` | `harness.ts`, `capture.mjs` | Heroes not in the beat not drawn; the game's pops and callouts drawn larger; the playfield ground at 0.8 brightness in director shots (render only, telegraphs and FX untouched). |
| Per-letter kinetic type | `mg.js` `letterState`, `drawLetters`, `plate` | Letters slam in one after another (2.1x, a drop, overshoot, settle) with an analytic blur, never stacked copies; a dark skewed plate wipes in under every run; a scale punch on each beat; 1.5-2x the v3 sizes. The logo slam has no stacked copies either. |
| White flashes and wipes | `mg-timeline.mjs` `post().white/wipe`, `mg.js` `drawWhites` | The hook contact, the core burst and the logo get a 2-3 frame white flash; card looks swap under a white diagonal wipe. |
| End card | `mg.js` `lineupStrips`, `renderEndPlate` | Logo about 60 % of the width; the S40 line-up cut into one strip per hero, each hopping on its eighth note, all on the final stab. |
| Grade and luma check | `edl.json` `grade`, `qc`; `edit.mjs` `lumaQc` | Midtones down, a toe, near-white low-saturation areas pulled down (`selectivecolor`), lighter bloom; every master is measured per shot and fails if more than 15 % of a shot sits at Y >= 225. |
| Mix with an arc | `edl.json` `audio`; `edit.mjs`; `dsp.mjs` `limit(..., ceilAt)` | Wider section levels before the limiter, the bed limited at RMS + 9 dB, a 6-frame near-silent hole before the hook and the core, the body 2 dB under the ceiling so only the hook and the core burst reach it (the core is the loudest transient). |

**v3 ("Big Plays", 30 s at 144 BPM, gameplay first; the v2 data with the v3 review fixes below)** came before v4 (its data is in git history): `shots.mjs`, `mg-timeline.mjs`,
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


**v3 (review of the v2 redo).** Gameplay first at hero height, every subject clear of the lens. The title is three
hits (CATS on Clem's Q3, VS on the river clash, DOGS on Cacklejaw's pounce); 3V3 is two close cuts (behind each team);
Pack Hunt runs at 0.35 and drops to 0.1 only round each takedown; the middle is a half-beat ping, Pudding bouncing, a
full-bar tower dive (range ring and shots in frame) and the dog tower toppling with the new render fall; COMEBACK opens
bar 12 at the base; the card looks are one locked beat (three looks, white wipe) and the real HUD a riser beat (16:9
only); bar 15 is Clem's level-10 takedown then the march; the core bursts under Lambo's flop on f1527 (`CORE_HIT`); the
end card lands on the f1600 downbeat over the last gameplay frame (blurred) with the eight-hero line-up (S40).

| Change | Where | What |
|---|---|---|
| Tower and core falls | `src/render/views/towerView.ts` (render only, game-wide) | A tower cracks, topples over its base edge (gravity, a bounce), throws chunks and breaks up into rubble along its fall line; a core bursts on its killing blow, caves in and settles. Pooled instanced chunks (High 1, Med 0.6, Low 0.35 of them, none with reduce motion). |
| `cullLens` / `cullLos` / `banners` | `harness.ts` | Trees whose trunk stands near the lens, on the lens-to-subject line or in front of the subject are not drawn (whole trees); bushes, rocks and props in front of the subject are cut per fragment; the eight base banners are dropped from the map. |
| `xray` (default on, `xrayMode: 'hide'`) | `harness.ts`, `capture.mjs` | A tower, core or fountain in the frame and not behind the subject's plane is not drawn (no 28 % ghost). `xray: false` where the structure is the subject (S23, S24, S30-S32). |
| `hidePudding`, `ghosts`, `shockI` | `harness.ts` | Pudding not drawn (a framing aid); afterimages off in close-ups; shockwave walls at half intensity (a hero-height lens saw them as a white band). |
| `aspects`, `portrait.f1` | `capture.mjs` | A shot for one master only (the landscape HUD), a take that runs on in 9:16. |
| `--pick f,x,y` | `capture.mjs` | Debug: what the lens sees at a screen point after frame f. |
| Impact dips | `mg-timeline.mjs` `impacts()`, `edit.mjs` | The music dips 9 dB under every designed impact (2-frame suck-out, held 5, released over 8); lighter glue (1.6:1). |
| End card | `mg.js`, `type.mjs` | The last gameplay frame blurred and darkened, the S40 line-up keyed over it, the logo at about half the frame width, cream type on dark pills. |

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

Finished masters are copied to `pawlegends/media/trailer-v2/` (the gameplay-first trailer, v4 data) and the v1 "Meet Gabė"
masters stay in `pawlegends/media/trailer/` (both gitignored, like every output here).

**v3 ("Settle It on the Crossing", review of v2: "full of bugs, shoot it from above like real gameplay, sell cats vs dogs
and the mission")** lives in `v3/` and leaves the v2 files untouched (v2 stays reproducible with the commands above).
Every gameplay shot is the game's own camera: `cam.base: 'game'` (harness `placeGameRel`: the real follow, lead and
fight pull-back, director keys as deltas on top) or the GAMECAM preset (`director.ts` GAMECAM: 23.76 m, pitch 48.8,
FOV 38, yaw 0, ground look point). `gameLook: true` turns every v2 clean-up hack off (no culled trees, banners, towers,
bolts or minions, full shockwaves except the core burst at 0.45, standing towers and cores always solid). Landscape is
captured at 1280x720 CSS, DPR 1.5 (`size`, `dpr`); 9:16 uses `portrait.cam` (GAMECAM-P: FOV 50, 1.2x distance). Takes
Y1 and Z1-Z10 come from a clean-moment scan (heroes >= 0.8 m apart, nobody behind a structure, both teams in frame).

```sh
node tools/trailer/seed-search.mjs --fixed --only Y1,Z1,Z2,Z3,Z4,Z5,Z6,Z7,Z8,Z9,Z10
node tools/trailer/capture.mjs --shots-file tools/trailer/v3/shots.mjs --out <dir>/shots
node tools/trailer/v3/score.mjs --out <dir>/audio      # 144 BPM, cat motif vs dog motif, -14 LUFS, <= -1 dBTP
node tools/trailer/v3/type.mjs --out <dir>/mg          # copy gate (v3/copy.json), whole-word slams, 12° wipes
node tools/trailer/v3/edit.mjs --dir <dir>             # 4 masters, posters, report.json (hash, overlap, luma, black frames)
```

**v3.1 (review of v3: "full of bugs").** Render fixes in the game (render only; `src/sim` untouched, tests in
`tests/unit/trailer-v31-render.test.ts`):

| Bug | Fix |
|---|---|
| Towers strobed pale/saturated under steady fire | `towerView.ts` `hitPulse`, `STRUCT_HIT`: one pulse after a quiet second, then a smoothed light tint |
| A fallen core turned into a see-through ghost box, then rubble, carts and pups popped back | falls sink opaque into the ground while the rubble grows in (`RUBBLE_GROW`); `fallen` is final (the match-end frame can still list the core); carts stay hidden round a fallen core; no second shockwave on the settle |
| Towers fell toward the camera (read as standing) | `fallDirOf`: across the screen, toward their own base |
| Bodies merged, plates stacked, heroes in tower bases and Pudding | `heroView.ts` `layoutBodies`: warm-started, sideways-biased push-apart plus push-out of structure footprints; minions out of footprints; name plates over the drawn body (`Overhead.heroAt`) |
| Damage numbers hung frozen on the core | merge capped (`DAMAGE_FX.mergeMax`), numbers of a fallen structure and round a core burst fade (`dropKey`, `dropNear`), none for hidden minions |
| Pudding vanished on one frame when calmed | a hop, a shrink and a puff (`PUDDING_OUT`) |
| Four rings on a fall | one ring at the crack, the fall's own impact ring |

Harness (trailer only): `uiOut` (screen text in output time, so slow motion never freezes it), `heroNames` (plates
show "Lambo", not a bot pet name), `selfEdge` (the "You" arrow only on the player's own camera), `bannerOn` (banner
windows), `popText` defaults to the takedown callout. Lobby stands take `scale`.

Shots (`v3/shots.mjs`): S02 is six heroes and their plates (no HUD: its top bar shows 2 allies against 3 enemies);
S12 frames Pudding and the calming cat; S13 cracks the tower on f790 at full speed so the topple and the ground hit
(f830) are in the shot; S14 and S14b are takes Y1 and Z10 on the gameplay camera; S16 is the gameplay framing on the
player with no banner or world pop before the burst and no exposure punch; S17 is three cat champions against the two
dog heroes. Type (`v3/timeline.mjs`, `v3/mg.js`): the mission as three beats (PUSH YOUR LANE., CALM PUDDING., TAKE
THEIR CORE.) and VICTORY! after the burst; slams opaque from their first frame; every word fitted inside title safe at
its 118 % slam; 9:16 lines in the top band. `v3/edit.mjs` gates: type box vs every hero box on every frame, glare
(Y >= 225, unsaturated; the plaza is excluded) 8 % mean / 15 % worst, blowout (Y >= 235) 7 % / 10 %, frozen gameplay,
isolated one-frame pops (real knockbacks and the game's hit-stops excepted), black frames. `--qc-only` stops after
the capture and type gates.

```sh
node tools/trailer/capture.mjs --shots-file tools/trailer/v3/shots.mjs --aspect 16x9 --out <dir>/shots-l   # and 9x16
# merge the two into <dir>/shots (one manifest, <shot>/<aspect> folders), then
node tools/trailer/v3/type.mjs --out <dir>/mg && node tools/trailer/v3/score.mjs --out <dir>/audio
node tools/trailer/v3/edit.mjs --dir <dir>
```


**v3.2 (review of v3.1: 45 defects).** Render fixes in the game (render only; `src/sim` untouched, determinism
identical, tests in `tests/unit/trailer-v32-render.test.ts`): minion bars follow the drawn minion and are dropped with
it (`MinionInstances.drawnAt`, `Overhead.minionAt`: no bars floating over a fallen core), no bar for a unit at 0 HP,
a falling core is forced opaque and its fall glow capped (`FALL_FLASH`: the grey ghost box), the pick screen's
"Inspired by ...'s Token Tails card." line spaced. `Overhead` options the rig sets: `selfName`, `edgeArrows`,
`statusChips`, `minionBars`, `boxes` (plate boxes for QC).

Rig: per-frame QC adds plate, pop, banner and structure boxes, `hidden` (share of a body behind a nearer one) and
`stacked` plates; bodies use the drawn model's box. `popCull` (default with gameLook) drops numbers off the 3 % margin,
far from their unit or older than 0.7 s; tower hit tint off in gameLook; `autoFit` (opt-in), `--qc` (QC only, no
frames), `--takes-file`; a real pick-screen lobby shot (`lobby.pick`); line-up heroes at one height (`fitH`, `fitK`).
Takes V1-V18 (`fixed-takes.mjs`) from a QC scan over hundreds of candidate moments. `v3/edit.mjs` type QC: every word
(40 px margin) vs heroes, plates, bars, pops, the banner and structures, M4 only over the pick screen; match-end gate;
pops must return to count. 15 s splices on the beat grid (`v3/timeline.test.mjs`). The 9:16 HUD, tower fall, teamfight
and pick-screen beats are landscape bands.

Still not releasable: `tokentails.com/pawlegends` must return 200 before any master is posted (see the top).

**v3.3 (review of v3.2: "full of bugs, from above like real gameplay, cats vs dogs and the mission").** Render
fixes in the game (render only; `src/sim` untouched, determinism identical, tests in
`tests/unit/trailer-v33-render.test.ts`): a damage counter merges for at most `mergeMax` s of drawn time too
(`DamageNumbers` `age`: under the victory slow motion the real-time clock crawled and one "64" sat on the doghouse for
1.6 s); the falling core's glow is a faint warm tint (`FALL_FLASH` 0.05, `#ffc85a`: the white mix in linear light
turned the navy doghouse into a pale see-through-looking box); minions are drawn 1.0 m clear of every hero in three
passes (`MINION_CLEAR`, `MINION_PUSH`: cadets stood inside Cacklejaw and Sir Brutus); bolts are shaded toward their
silhouette and the core's shot is 0.4 m (`shadeBolts`, `BOLT_CORE_SIZE`: a flat yellow ellipse over Gabė).

Rig: per-frame QC adds ground `contact` (two bodies nearer than 0.7 of their radii summed), `minionIn` (a minion inside
a hero), `dupes` (one hero twice side by side) and pop `age` / `still`; capture fails CONTACT, MINION-IN-HERO,
DUPLICATE HERO and STALE POP runs and the edit refuses them. `popCull` drops numbers older than their game life
(`popMaxLife`), pinned for 12 frames, or on towers and cores (`structNums` to keep them). A pick-screen swap stands
the new hero at full size (`skipIntro`, no grow-in). The edit adds low-motion (9+ frames at d < 0.35), head-stutter
and local glare-blob (Y >= 235 region over 2 % of the frame) gates, and recomposes the 9:16 pick screen from its own
landscape capture (`PICK_916`: the pedestal above, the panel below, no blur fill); every other 9:16 shot is native.

Cut (`v3/shots.mjs`, `v3/timeline.mjs`): every gameplay shot starts and ends at the game's distance (pushes only
round their beats, the hook's crane at 1.3x and back); the hook opens on the Golden Hour cast with Brutus standing;
3V3 is take W5 (all six, Sir Brutus's challenge and Sage's Moonshot back, real HUD); the mission is three held lines
(PUSH YOUR LANE. 2 s over the waves meeting on the bridge, TOPPLE THEIR TOWERS. 1.9 s over the tower fall, TAKE THEIR
CORE. 2.3 s); one continuous slowed teamfight (W1); the core shot is one take from the base fight to the burst
(`CORE_HIT` 1331: boom, shake and VICTORY! on it); the line-up 1.7 s; the 15 s end card its own 125 frames (URL up
1.6 s). Takes W1-W10 (`fixed-takes.mjs`) from the v3.2 six-hero scan.

Landing-only variant: `v3/copy-landing.json` says INSPIRED BY REAL SHELTER CATS. (true per docs/GAMES.md "Shelter
champions"), linted as client copy; it is for the tokentails.com landing next to the Play to Save hub, never game
marketing (R13), and is a founder call:

```sh
node tools/trailer/v3/type.mjs --copy tools/trailer/v3/copy-landing.json --lint-target client --out <dir>/mg-landing
node tools/trailer/v3/edit.mjs --dir <dir> --mg <dir>/mg-landing --out-dir <dir>/out-landing --copy tools/trailer/v3/copy-landing.json --lint-target client --cut 30
```
