# Clip engine (Paw Legends social clips)

One JSON clip spec in, one finished MP4 out: H.264 High (yuv420p, BT.709 tv range, +faststart, CRF 10, no rate cap;
rendered at 2x and downscaled, see "High quality" below) with AAC 192k 48 kHz stereo of the game's own SFX and music, rendered in lockstep with the frames and normalised to
-14 LUFS / -1.5 dBTP (two-pass loudnorm). Frames come from a virtual clock (`tools/trailer/vclock.js`), so a frame is
never dropped and a clip renders the same every run.

```
cd <snapshot>/pawlegends
node tools/clips/record.mjs <spec.json | specs.json> [--only id,id] [--port 5480] [--out-dir DIR] [--report rows.json]
                            [--every N]   # preview: every Nth frame, no audio
                            [--ss 2] [--crf 10] [--draft] [--lock FILE]
                            [--debug] [--verbose] [--keep]
node tools/clips/scenes.mjs --mode classic --seeds 1-20 [--map quarry] [--variant coop] [--out scenes.json] [--pretty]
node tools/clips/quality-check.mjs <video...> [--report rows.json] [--crop x,y,w,h] [--sample 6] [--json out.json]
```

A spec file may hold one spec or an array. One Vite server (port from `--port`, use 5480-5499, one per agent) and one
Chromium profile folder serve the whole batch; both are removed in `finally` and on SIGINT/SIGTERM. Each clip prints
one JSON row (ffprobe streams, size, raw audio peak/RMS, input loudness, sim hash check, record time, page errors).

## High quality (trailers-hq, the default)

Why the trailer 30 / 60 gameplay looked soft (measured on their takes and masters, `quality-check.mjs`):

- **Resolution.** The High tier caps the drawing buffer at DPR 1.5 (`render/quality.ts`). A 9:16 take asks for DPR 2
  (540x960 CSS), so the game drew 810x1440 and the screenshot upscaled it to 1080x1920 (the trailer edit then cropped
  1.1x and upscaled again). 16:9 drew 1920x1080 with no supersampling, and the edit's punch-ins upscaled that too.
- **Generations.** Each frame was a JPEG (q94), then x264 CRF 17 capped at 20 Mbps, then CRF 8 per edit segment, then
  the master at CRF 16 with film grain (`noise=alls=3`) added, plus `unsharp` on upscaled pixels.
- **Not the cause:** the GPU (headless Chromium runs ANGLE Metal on the Apple GPU, not SwiftShader) and frame pacing
  (frames are stepped on the virtual clock; the render tick is monotonic and no frame repeats).

What record.mjs does now:

| Step | Setting |
|---|---|
| Render | Page DPR = aspect DPR x `--ss` (2): 3840x2160 for a 1920x1080 take, 2160x3840 for 1080x1920. The harness lifts the tier's DPR cap and the overhead canvas's to it (`ShotSpec.hq`), keeps High with bloom, shadows (4096 px map), MSAA, full VFX, no dynamic resolution, and draws the hero hull `ss` x as wide so it is the player's line width after the downscale. |
| Check | Before frame 0: the WebGL renderer string (a software renderer fails the take), the drawing buffer (must be CSS x DPR), the adaptive-quality fields (`resScale` 1, governor step 0, not a phone). Frame 0's grab must be the full render size. The drawn map scheme must be the spec's `scheme`. |
| Grab | Playwright `page.screenshot({ type: 'png', scale: 'device' })`, lossless. Not CDP `Page.captureScreenshot`: headless returns that at CSS size. |
| Encode | One pass: Lanczos downscale in RGB (accurate rounding, full chroma), one BT.709 tv conversion, x264 High 4:2:0 `-preset slow -crf 10`, no VBV cap, a keyframe a second. |
| Report | `quality` in each row: renderer, render DPR, buffer at the first and last frame, grabbed size, output size, tier settings, frames written vs expected, tick monotonic, ms per grab, map and drawn scheme. |

`--draft` keeps the old fast path (JPEG frames, CRF 17 at 20 Mbps, no supersampling). `--lock FILE` waits while
FILE exists and holds it while the browser captures (one capture at a time on a shared machine). A spec may set `map`
(`crossing`, `ridge` Lanternfall Ridge, `thicket` Twinbark Thicket, `quarry` Geode Quarry, `pitch` Pawball Park with a
3v3 mode; `hearthwood` with `classic`) and `scheme` (`native`, `bloom`, `harvest`, `frost`, or a map's own such as
`verdant`). Edits should take their encoder settings from `encode.mjs` (CRF 6 segments, a CRF 12 master capped at
60 Mbps, a 1080p60 web copy at CRF 19 / 10 Mbps, no grain, Lanczos only) and re-capture closer rather than punch in.

`quality-check.mjs` measures any video (stream facts, mean Sobel `edge`, `blur`, `detail` = 1 - SSIM against the
frame halved and scaled back up, bit-identical repeated frames, freezes) and, with `--report`, the capture facts above;
it exits 1 on a software renderer, a short buffer or grab, missing frames, a backwards tick, a short side under 1080,
a take under 60 fps or `detail` under `--min-detail`.

## Files

| File | What it does |
|---|---|
| `record.mjs` | The batch runner: plans each spec (scene scan → start tick → shot), drives the harness frame by frame, pipes 2x PNG frames to ffmpeg (JPEG in `--draft`), fetches the WAV, muxes, probes. |
| `quality-check.mjs` | The quality self-check: renderer, effective resolution, sharpness, repeated frames (see "High quality"). |
| `encode.mjs` | Encoder settings for trailer edits: segments, ProRes, master, web, audio. |
| `scenes.mjs` | Scene finder. Plays a take headless in Node (same `clip-driver.ts` the browser runs) and lists moments with ticks. Also the `MODES` table and `takeOf(spec)`. |
| `shots.mjs` | Spec → harness ShotSpec: aspect sizes, camera presets and cut lists, slow motion, HUD/pops layers, looks, the skins stage. |
| `harness.ts` / `harness.html` | The in-browser renderer (forked from `tools/trailer/harness.ts`): real `MatchSession` + `GameRenderer`, director camera, lobby stage, OfflineAudioContext audio. Exposes `window.__trailer`. |
| `clip-driver.ts` | `ClipRun`: a deterministic sim run of a take (any map, mutator, variant, explicit picks), bots in every seat, an event hash for the browser/Node check. |
| `clip-script.ts` | Trailer 60: scripted seats. Rules (`encore`, `stage`, `cannon`, `zzz`, `holdR`, `castR`, `avoid`) replace a piloted seat's commands with ordinary moves, casts and cannon fire on the ticks they fire; the sim is untouched and Node and browser run the same rules. |
| `clip-worker.ts` | Stand-in for the sim Worker: full vision (no fog), both teams' public events, UI commands dropped. |
| `samples.json` | The four proof clips (below). |
| `dev/moments.mjs` | List the moments of one type for a spec's exact take: `node tools/clips/dev/moments.mjs specs.json <id> <type> [n]` (pick indices match `start.pick`). |
| `dev/seedscan.mjs` | Rank seeds for one moment type with a spec's picks: `node tools/clips/dev/seedscan.mjs specs.json <id> chaos 40-80`. |
| `dev/probe-grey.mjs` | Debug helper: load a spec, step to frame F, screenshot and list full-screen DOM overlays/filters. |

## Spec format

```jsonc
{
  "id": "tf-classic-s3-v",          // output file name (<id>.mp4 in --out-dir), unless "out" is given
  "mode": "classic",                // blitz | skirmish | classic | practice | skins   (see Modes)
  "variant": "bots",                // bots (default) | coop | pvp — must be one the mode offers
  "seed": 3,                        // sim seed (scenes.mjs tells you what each seed contains)
  "teams": [["clem","sage"], ["brutus"]],  // optional picks per team, slot order; missing seats = the bots' picks
  "looks": [["coat.clem.s1_sunforged"], [null, "coat.brutus.biscuit"]], // optional coats/skins per seat
                                    //   (or a slot map {"0": "coat.clem.snowpaw"})
  "difficulty": "normal",           // bot difficulty (pvp defaults to hard)
  "start": {                        // either an event trigger ...
    "event": "teamfight",           //   firstBlood kill multikill ace teamfight towerDive tower objective cannon boing
                                    //   yarn clip chaos ult escape comeback shutdown victory any
                                    //   (or a sub-type: kaboom, cannonFire, cannonParry, strike, flop, bigdog, ...)
    "lead": 5,                      //   seconds of footage before the moment (victory default: duration - 5)
    "pick": 0,                      //   0 = best-scoring moment of that type, 1 = second best, ...
    "after": 60                     //   only moments after this game second
  },
  // ... or "start": { "at": 95 }  // a fixed game second
  "duration": 22,                   // 15-30 s output
  "fps": 30,                        // 30 default (60 works, twice the render time)
  "aspect": "vertical",             // vertical 1080x1920 | horizontal 1920x1080
  "camera": "punch",                // see Cameras
  "focus": 2,                       // hero slot the camera favours (default: the moment's first hero)
  "target": "unit",                 // force a single-unit follow of `focus`
  "slowmo": { "at": 6.5, "dur": 2, "speed": 0.3 }, // or true = 2.2 s at 0.3x around the moment
  "hud": false,                     // true = the game's HUD (with camera "game": the exact player view)
  "pops": true,                     // false = no damage numbers / banners / nameplates either
  "music": 2,                       // music intensity floor 0-3 (default 2 for fights/victory, 1 otherwise)
  "autoFit": true,                  // vertical: widen to keep the fight in frame (false = off)
  "target": "point",                // (added, recorder 3) hold the camera on the moment's fixed x,y (e.g. a tower about to fall)
  "camAdjust": { "pitch": 16, "dist": 1.15, "fov": 0, "yaw": 0 }, // (added, recorder 3) offsets on every key of a directed
                                    //   camera: +deg pitch, x dist, +deg fov, +deg yaw. A steeper orbit/low clears Hearthwood
                                    //   tree canopies; dist 0.7-0.8 tightens the vertical "high" shot. Absent = unchanged.
  "xray": false,                    // (added, recorder 3) structure x-ray on/off (default on; off for tower moments)
  "shot": {},                       // raw harness ShotSpec overrides (expert)
  "caption": "free text for the catalog (not rendered)",
  "script": [{ "slot": 0, "do": "encore" }] // (added, trailer 60) scripted seats, team 0's piloted slots only: see clip-script.ts
}
```

Skins spec (Home lobby stage, painted backdrop, lit pedestal):

```jsonc
{ "id": "skins-clem-v", "mode": "skins", "hero": "clem",
  "looks": [null, "coat.clem.store_calico", "coat.clem.s1_tortie", "coat.clem.s1_sunforged"], // null = default coat
  "style": "turntable",             // turntable (one hero, a coat per sweep, cheer/swing acts) | lineup
  "heroes": ["clem","sage","pixel"],// lineup only: heroes side by side, `looks[i]` per hero
  "duration": 20, "aspect": "vertical", "music": 2,
  "sweep": 24 }                     // optional: turntable camera yaw swing per coat in degrees
                                    //   (default 24 vertical, 38 horizontal; see Gotchas)
```

For in-match skin clips (walking, abilities in a coat) use a match spec with `teams` + `looks`, `camera: "follow"`
or `"low"`, and `focus` on that seat; `start.event: "ult"` with `focus` gives an ability moment.

Coat ids live in `src/render/cosmetics.ts` (`coat.<hero>.<name>`, e.g. `coat.clem.marmalade`, `.snowpaw`, `.lilac`,
`.store_calico`, `.s1_tortie`, `.s1_honey_tabby`, `.s1_starlight`, `.s1_sunforged`; `coat.brutus.biscuit`;
`coat.founder.<hero>`) and the skin registry in `src/render/skins/`. Hero ids: the files in `src/data/heroes/`
(cats: clem, sage, meatball, pixel, duchess, stilts, aviete, bengas, gabe, lambo; dogs: brutus, cacklejaw, nugget,
marshmallow, bravo, chili, domino, frankie, rocket, howler; `side` in each file).

## Modes found

From `src/ui/modeSelect/modes.ts` (the one registry) and `src/sim/mutator.ts`:

| Spec `mode` | Game mode | Map | Size | Variants (`variant`) | Length | Notes |
|---|---|---|---|---|---|---|
| `blitz` | Blitz (live, NEW) | Purrhaven Crossing | 3v3 | bots | ~3 min | mutator `blitz`: start at level 4, double XP, Kibble Cannon at 0:20, Sudden Death at 2:30. Densest toy action: best for "fun mode" clips. |
| `skirmish` | Skirmish (live) | Crossing | 3v3 | bots, coop, pvp | ~5-7 min | One bridge, two lanes. Co-op is Skirmish's variant (human seats are pilot bots here, so it plays like bots with a different seat layout); pvp = hard bots on both sides. |
| `classic` | Classic (live) | Hearthwood Divide (autumn) | 5v5 | bots, pvp | ~10-13 min | Three lanes and a jungle, Grizzlechop / Pudding objectives; biggest teamfights (9-10 heroes). |
| `practice` | Practice try (champ select "try") | Crossing | 3v3 | bots | – | Same sim as Skirmish bots (identical seeds give identical matches); label it "practice" only for the catalog. |
| `skins` | Home lobby stage | – | – | – | – | Turntable / lineup coat showcase. |
| – | Ranked | Hearthwood | 5v5 | – | – | `locked` ("Coming soon"): not playable, no clips. |
| `cannon` | Cannon Chaos (live, sim v27) | Crossing | 3v3 | bots, coop | ~5 min | mutator `cannon`: the Kibble Cannon at 0:15, then 20 s after every shot; level 3 start, cooldowns x0.7. |
| – | With Friends | – | – | – | – | A party lobby around the same matches; no separate sim. |

Fun toys on the Crossing (every mode there, most in Blitz): the Kibble Cannon (pick up, fire, KABOOM, parry, block),
Boing Beds (trampoline launch), the Mega Yarn Ball (kick, STRIKE), plus "viral" clip moves (flop, bigdog, scream,
frozen, zzz, footlong, dots). Hearthwood has yarn and cannons too (fewer).

## Scene finder (`scenes.mjs`)

Runs a whole match headless in Node in well under a second for Blitz/Skirmish and ~3 s for Classic, and returns
`[{ take, picks, endTick, winner, reason, eventHash, moments: [...] }]`, one per seed. A moment is
`{ type, sub?, tick, t (game s), slots (heroes, the first is the focus), x, y (sim mm), score, note, heroes?, units? }`.

| Type | Rule |
|---|---|
| `firstBlood`, `kill`, `shutdown` | sim events |
| `multikill` | 2+ takedowns by one hero within 10 s (score rises with the count) |
| `ace` | the victim's whole team is down |
| `teamfight` | >= 6 hero-vs-hero hits in 4 s and the largest group of engaged living heroes within 14 m has >= 4 heroes (3v3) or >= 6 (5v5) from both teams; `units` adds nearby minions; one per 6 s |
| `towerDive` | a hero kill by a hero that took tower fire in the last 2 s |
| `tower`, `objective`, `victory` | structure falls, Grizzlechop / Pudding taken, the core falls (x, y = the losing core) |
| `cannon` (`sub` cannonPick / cannonFire / kaboom / cannonParry / cannonBlock), `boing`, `yarn` (`kick` / `strike`) | toy events |
| `chaos` | 12 s windows ranked by toy-event score + 4 per distinct toy kind (>= 2 events) |
| `clip` | a viral move (`sub` = its name) |
| `ult` | an ultimate cast (slot 3) |
| `escape` | a hero under 15 % HP right after enemy hero damage who lives 5 s more |
| `comeback` | sim comeback event |

Example counts: Classic seed 3 = 10.1 min, 7 teamfights, 3 multikills, 11 cannon, 8 yarn, 4 chaos; Blitz seeds 1-3 =
2.9 min each, 3-4 teamfights, 7-9 cannon, 1-4 chaos; Skirmish co-op seed 2 = 7 min, 17 teamfights, an ace.

Use it to plan a batch: `node tools/clips/scenes.mjs --mode blitz --seeds 1-30 --out blitz.json`, then pick seeds
whose moments have high `score`, and point specs at them with `start.event` + `start.pick` (or `start.at`).
`record.mjs` runs the same scan itself (cached per take within a batch), so a spec only needs the event type.

## Cameras

All directed cameras are re-tuned per aspect (`shots.mjs` PRESET): in 9:16 a wider vertical FOV (56-64 deg instead of
40-46) and a steeper pitch, so a fight spreads up the frame instead of being a crop of a wide shot, plus `autoFit`
(widens up to 1.45x to keep the subjects inside a 7 % margin).

| `camera` | Shot |
|---|---|
| `game` | The game's own gameplay camera (follow, lead, fight pull-back, shake), aimed at the subject; with `hud: true` the exact player view (`gameLook`). |
| `follow` | Tight chase on the subject (fight centre or `focus` unit), slow 8 % push. |
| `high` | High wide establishing shot (62-68 deg pitch, 1.3-1.45x distance). |
| `low` | Low dramatic hero-height angle (13-16 deg pitch, close). |
| `orbit` | 135 deg orbit around the subject over the clip. |
| `push` | Slow push-in from wide to close (distance x0.48, pitch -18 deg). Victory clips settle on the core before it breaks. |
| `punch` | Wide follow, then a snap punch-in zoom on the moment frame, hold ~1 s, ease back out. |
| `cuts` | Cut list: high -> low -> follow -> orbit -> low, a hard cut every ~3.5-6 s with a drift inside each. On `chaos` moments each cut rides the toy moment nearest to it (the cannon carrier, the Boing Bed, the yarn kicker). |

Subjects: teamfight, ace, multikill, victory, tower, objective and toy moments use a moving fight centre (re-centres on
living heroes near it); other moments follow the focus hero. A followed hero that dies hands the camera to the fight
centre (`alt`), so no shot parks on a fountain. `slowmo` ramps the game clock (eases in/out over 8-12 frames);
audio follows the same game clock. `target`/`focus`/`shot` override everything.

## Audio

The harness renders audio in an OfflineAudioContext that is suspended at every output frame: frame k's game update
runs while the context sits at k / fps, so every sound the game starts (the real `Sfx` bank and the real `Music`, which
plays on the Sfx context) lands on the frame that triggered it. Seek and pre-roll sounds are dropped. `music` sets a
floor on the music intensity layer so the track does not idle during a fight. The WAV comes back base64 and is muxed
with two-pass loudnorm. Every sample measured -13.7 to -14.2 LUFS integrated, true peak -0.6 to -1.7 dBFS.

## Sample clips (proof, `../_samples/`)

| Clip | Spec | Result |
|---|---|---|
| `sample-teamfight-vertical.mp4` | Classic 5v5 seed 3, `teamfight` (9 heroes), `punch` + 2 s 0.3x slow-mo, no HUD | 22.0 s, 1080x1920 30 fps, 29.6 MB, -14.0 LUFS, hash ok |
| `sample-toys-horizontal.mp4` | Blitz seed 3, `chaos` (cannon, KABOOM, Boing, yarn), `cuts` | 24.0 s, 1920x1080, 34.2 MB, -14.2 LUFS, hash ok |
| `sample-skins-vertical.mp4` | skins turntable, Clem: default, Calico, Tortie, Sunforged | 20.0 s, 1080x1920, 15.5 MB, -14.2 LUFS |
| `sample-victory-horizontal.mp4` | Skirmish seed 1, `victory`, `push` | 20.0 s, 1920x1080, 24.1 MB, -13.7 LUFS, hash ok (ends on the core collapsing) |

All checked with ffprobe (h264 yuv420p + aac 48 kHz stereo, exact durations), ebur128/volumedetect, and contact
sheets of 6-9 frames each. `report.json` next to them has the full rows.

## Timing and size

- Record time is about 1.6-2.5x the clip length on an M-series Mac at 30 fps: 20 s clip = 32-50 s, 22 s Classic clip
  = 50-67 s, plus ~10 s once per batch for Vite. The four samples took 2 min 45 s in one batch.
- The scene scan per take: Blitz ~0.3-0.6 s, Skirmish ~1 s, Classic ~3 s (cached within a batch).
- Size: 0.75-1.45 MB per second (skins ~0.8, busy horizontal gameplay ~1.4). 100 clips of 15-30 s land around
  2-3.5 GB, well under the 15 GB cap. 60 fps doubles render time and adds ~40 % size.
- Parallel: one batch per agent, each on its own port (5480-5499). Rendering is GPU-bound; 2-3 batches at once scale.

## Gotchas

- **Slot 0 dies = grey screen.** The game desaturates the canvas (`html[data-pl-dead='1'] #game-canvas`, lol-hud.css)
  and shows a dead veil and respawn iris for the player's seat. Directed shots and HUD-less game shots hide all
  three; only `camera: "game"` + `hud: true` keeps them (authentic player view).
- **Fight centres drift.** A `fight` target follows the heroes near it; if nobody is near it widens to 2x radius and
  can wander to a fountain. Victory uses a blend to a fixed core point; for long clips prefer `cuts` or set `focus`.
- **Cold Vite.** The first load may 504 while deps optimise; record.mjs reloads up to 3 times. The Vite cache lives in
  `tools/clips/.vite-cache` (keep it, it makes later batches start fast).
- **Hash check.** `hash: ok` means the browser run matched the Node scan at the end of the clip. A `MISMATCH` means
  the moment you targeted may not be on screen: re-scan with the same picks/looks/difficulty.
- **Events must exist.** A spec whose seed has no moment of that type fails with "no <type> moment in seed N": try
  another seed, `pick`, or `any`. Blitz always ends near 2:55 (hard end), so Blitz `victory` is common; Classic
  matches run ~10 min, so its scan takes longer.
- **Practice = Skirmish bots** (same sim); `coop`/`pvp` change seat layout and bot difficulty only (all seats are bots).
- **Ranked** is not playable in this build; do not label clips with it.
- **Lobby stage** (skins) loads its painted backdrop and fonts in real time: record.mjs waits 2.5 s and runs 90 unsaved
  frames before frame 0. The music floor for skins is `music` (default 2).
- **Skins turntable corner wedge (fixed, recorder 4).** In 9:16 the turntable camera swung +-38 deg and, at each
  sweep's far end, saw past the painted backdrop: a dark purple wedge in a bottom corner around every coat swap.
  `shots.mjs` now swings 24 deg in vertical (horizontal unchanged at 38); `spec.sweep` overrides. Vertical skins
  clips rendered before this fix may show the wedge: check the bottom corners near each swap and re-render.
- **Brand.** Clips show only Paw Legends (v6 Lightning Rivalry). No Token Tails cats, names or links appear; do not
  add text overlays (captions go in the catalog).
- **Disk.** Check `df -h` before a big batch (stop below 20 GB free). Temporary JPEG-to-H.264 intermediates live in
  a temp work folder removed at the end (`--keep` keeps it).
- **Tree occlusion (Hearthwood).** `orbit`, `low` and the low cuts sit under the autumn canopy near bases and in the
  jungle; add `camAdjust: { pitch: 14-26 }` or pick a lane/river moment. Vertical `high` is very wide (heroes tiny):
  `camAdjust: { dist: 0.72 }` tightens it.
- **Tower moments and x-ray (fixed, recorder 3).** The harness x-ray 'hide' rule also culled a standing structure at
  the look point, so on a `tower` clip the tower about to fall was invisible (only its HP bar and smoke showed).
  `shots.mjs` now sets `xray: false` for `start.event: "tower"`; a spec may set `"xray": true|false` to override.
  Pair it with `"target": "point"` so the camera holds on the tower instead of drifting after the heroes.
- **Skins stage bottom edge.** A dark corner of the stage floor can peek into the bottom edge of a vertical turntable for
  a few frames; a 5 % centre crop in ffmpeg (`crop=iw*0.95:ih*0.95:iw*0.025:ih*0.01,scale=1080:1920`) hides it.
- **Preview first.** `--every 10` renders every 10th frame with no audio in a few seconds: use it to check framing
  before a full render.

## Batch-2 additions (additive, opt-in; absent = unchanged)

- Skins `lineup`: `"zoom": 1.7` brings the camera closer (dist / zoom). A 2-hero lineup at the default distance
  filled about a quarter of a 16:9 frame; 1.6-1.8 suits 2 heroes, 1.2 suits 3.
- Skins `lineup`: `"actEvery": 4` repeats the cheer/swing round (with its sound) every N seconds; by default each
  hero acts once in the first second and the rest of the clip stands still.
- Tip, not a code change: Hearthwood `low`/`orbit`/`cuts` shots in the jungle can sit inside tree canopies for
  seconds. `"shot": { "cullLos": 6, "cullLens": 9 }` plus `"camAdjust": { "pitch": 10 }` clears them.
- Tip: vertical `low` shows ~30 % empty sky at the top; `"camAdjust": { "pitch": 9 }` trims it.

## Batch-5 additions (recorder 5; additive, backward compatible)

- **Hearthwood tree cull (harness fix).** Classic's trees are `InstancedMesh` chunks named `far-forest` plus `canopy`
  blobs, not the Crossing's merged `forest` mesh, so `patchScenery` never culled them: 9:16 Classic shots (029, 064,
  068, 086 in batch 5) were walls of autumn canopy in the foreground. `patchInstancedForest` (harness.ts) now applies
  the same per-tree rule to every instance (near the lens `cullLens`, on the lens-to-subject line `cullLos`, nearer
  the lens than the subject by 3 m), chained after the game's own see-through cut, and culled trees cast no shadow.
  Director shots only (`cam` set, not `gameLook`); `"shot": { "forestCull": false }` restores the old look. The
  Crossing's outer `far-forest` ring is culled by the same rule. The bare jungle floor (darker green) shows where
  trees were removed; that is the map's ground, not a shadow.
- **`start.before`** (game seconds): only moments at or before this second, with `after` it boxes a window, e.g.
  `{ "event": "teamfight", "after": 500, "before": 506 }` picks the fight at the Pudding take instead of the
  best-scoring fight later in the match. `best()` in scenes.mjs takes `before` (ticks, default Infinity).
- **`dev/scan-spec.mjs`**: `node tools/clips/dev/scan-spec.mjs '<spec json>' [types] [seedA-seedB]` scans the exact
  take of a spec (its `teams`, `variant`, `looks`) and prints the moments; `scenes.mjs` scans without picks, which is
  a different match whenever a spec sets `teams`.

## Batch-1 additions (recorder 1; additive, opt-in; absent = unchanged)

- Skins `turntable`: `"zoom"` now works for turntables too (camera distance / zoom, same meaning as the lineup's).
  In 16:9 the default turntable left the hero at about a quarter of the frame height; `"zoom": 1.7` fills it well.
- Skins `turntable` in 16:9: the default +-38 deg sweep shows the same dark backdrop wedge as 9:16 did (large, on the
  left/right edges near each coat swap). Use `"sweep": 16` for horizontal turntables (checked: no wedge at zoom 1.7).
- Each coat swap has a ~6-frame pop-in (the hero scales up from small): a contact-sheet frame taken exactly on a swap
  time (5 s, 10 s, ...) looks like a tiny hero; that is the animation, not a framing bug.
