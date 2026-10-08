# Catnip Heist (v1, standalone)

Single-player voxel pixel-art stealth game for Token Tails. You control two cats and swap between
them to sneak past Kibble Corp's guard dogs, collect catnip, free the shelter cat from its crate and
get both cats out. The plan is in `../docs/plans/catnip-heist-3d.md` (sections 3 to 7).

Stack: Vite, TypeScript (strict), three ^0.183.2, Vitest, Playwright. The package stands alone: it
does not import from `client/`, `backend/` or `cms/`.

## Run

```bash
npm install
npm run dev            # http://127.0.0.1:5173
npm run build          # tsc + vite build into dist/
npm run preview        # serve dist/ on http://127.0.0.1:4173
```

Build-time env vars:

| Var | Effect |
|---|---|
| `HEIST_BASE` | Deploy path (Vite `base`). Default `./` (relative, works from any directory URL that ends in `/`). Set an absolute sub-path to host elsewhere, e.g. `HEIST_BASE=/tokentails/heist/ npm run build` for GitHub Pages. tokentails.com uses `npm run build:client` (base `/heist-game/`, see the end of this file). |
| `HEIST_PAYOUTS_URL` | Full shelter payouts page, linked small from the in-game "Sent to shelters" modal (and, in app builds, from the win screen). Default `https://tokentails.com/shelter-payouts`; an empty value hides the link. |
| `HEIST_GIVE_URL` | Give page behind the win screen's "Send Pink Paw a rescue treat 🐾" button, opened as `?from=heist&cat=<rescued cat>`. Default `/shelter-payouts/give` (same-origin relative, so it works on tokentails.com; on another host such as GitHub Pages set a full URL or an empty value). An empty value hides the button. |
| `HEIST_DEPLOYMENTS_URL` | Mainnet deployment list for the win-screen total and the payouts modal. Default `<base>payouts/deployments.json`; an empty value turns the total off. |
| `HEIST_TESTNET_DEPLOYMENTS_URL` | Testnet list for the modal's "Testnet proof". Default `<base>payouts/testnet-deployments.json`; an empty value hides the section. |

GitHub Pages: `.github/workflows/catnip-heist-pages.yml` (repo root) builds with
`HEIST_BASE=/<repo>/heist/` and deploys `dist/` to `/<repo>/heist/`. It runs only from the Actions
tab (`workflow_dispatch`), and needs Settings > Pages > Source set to "GitHub Actions" once.

URL params:

| Param | Effect |
|---|---|
| `?qa=1` | Installs the `window.__heist` QA hooks. They are always on in `vite dev`. |
| `?level=heist-03` | Level for the first run and for `?replay=solution` (default `heist-01`). |
| `?replay=solution` / `?replay=last` | Plays the bundled solution of `?level`, or your last finished run (kept in browser storage). |
| `?speed=4` | Replay speed multiplier. |
| `?seed=7` | Sim seed (default 1). |
| `?controls=grid` | Arrow keys move along the grid axes instead of the screen directions. |
| `?shadows=0` | Turns off real-time shadows (faster on weak GPUs and under SwiftShader). |
| `?screen=pick` / `?screen=levels` / `?screen=yard` | Opens straight onto the cat pick screen, the level select or the Cat Yard. |

## How to play

Get the key, open the vault, free the shelter cat (interact next to the crate), then bring both cats
to the exit portal. A pressure plate holds its door open only while a cat stands on it, so one cat
holds the door while you swap to the other. A guard that sees you sends that cat back to its last
checkpoint. You never lose the run, but your spotted count goes up. Meowing lures guards within
earshot.

Score = catnip × 10 + 50 for the rescue − 1 for every 10 s, never below 0. The Results screen shows
the replay hash, which fingerprints the run.

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick / d-pad | Virtual joystick (left half of the screen) |
| Swap cat | Q / Tab | Y / LB / RB | Swap button, or tap the other cat's portrait |
| Interact | E / Enter | A | Act button |
| Meow | Space | B / X | Meow button |
| Pause | Esc / P | Start | Pause button (top right) |

Movement is free and continuous (5 tiles/s, integer sub-tile units, see the top of `src/sim/sim.ts`):
the cat starts, stops and turns on the tick you press or release a key. Directions are relative to
the screen: Up moves the cat up the screen, which is diagonal on the grid because of the 45° camera
(diagonals are normalised, so they are not faster). Against a wall the blocked axis drops out and
the cat slides along it; a straight press up to 10 units (about 2/3 of a tile) off a doorway is
nudged sideways into the opening, and a diagonal press whose one component points into a 1-tile gap
ahead of the cat goes through the gap (the "doorway magnet", SIM_VERSION 4) instead of sliding past
it. A cat let go within 6 units of a plate walks onto the plate's centre by itself (plate snap), and
a cat counts as at the exit while its centre is within 6 units of an exit tile. Interact works from
any tile next to (or diagonal to) the crate or vault door.
The game pauses when the window loses focus.

## Campaign

Eight heists, each teaching one idea and the finale combining them. Title → Play → Crew pick →
Level select → Heist. Level N unlocks when level N-1 is won. Progress (best score, best time, stars)
is saved in browser storage under `catnip-heist.progress.v1`; every access is wrapped in try/catch,
and in private mode it lives in memory for the session. Watching a replay earns nothing.

| # | Id | Name | Idea | Size | Coins (cap) | Guards | Checkpoints | Par | Solution | Needs both cats | Bot novice / cautious win |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | heist-01 | Kibble Corp Warehouse | Tutorial: move, sneak, swap, plate door | 38×21 | 20 (20) | 4 patrols | 2 | 2:15 | 2216 t (1:14) | yes | 99% / 100% |
| 2 | heist-02 | Kennel Row | Meow to lure a doorman off its post | 24×21 | 19 (20) | 1 doorman, 1 patrol | 2 | 1:00 | 998 t (0:33) | no | 100% / 100% |
| 3 | heist-03 | Twin Locks | Chained plate doors, swap timing | 30×15 | 17 (18) | 2 patrols | 3 | 1:00 | 1143 t (0:38) | yes | 99% / 100% |
| 4 | heist-04 | Counting House | Key + vault with a fast patrol loop | 36×20 | 22 (24) | 2 patrols | 2 | 1:30 | 1673 t (0:56) | yes | 99% / 100% |
| 5 | heist-05 | Watchtower Yard | Sentries that turn on a schedule | 28×18 | 19 (20) | 4 sentries | 2 | 1:00 | 911 t (0:30) | yes | 100% / 100% |
| 6 | heist-06 | Conveyor Halls | Tight patrol timing in 1-tile corridors with niches | 30×16 | 19 (20) | 3 fast pacers | 2 | 1:55 | 1625 t (0:54) | yes | 98% / 100% |
| 7 | heist-07 | Split Shift | Split up: each wing's doors are opened from the other wing | 38×15 | 19 (22) | 4 patrols, 1 sentry | 5 | 1:35 | 1215 t (0:41) | yes | 100% / 100% |
| 8 | heist-08 | Kibble Corp HQ | Finale: all of the above | 40×27 | 26 (28) | loop, turning doorman, 2 sentries, pacer | 3 | 2:50 | 2550 t (1:25) | yes | 52% / 81% |

"Solution" is the solver's planned run (30 ticks per second): it collects every coin, is never
spotted and finishes under par, so all three stars are reachable on every level.

**Par** is set from play, not from the solver: the median win time of the cautious synthetic player
(`npm run playtest:bots`, 200 seeds) times 1.2, rounded up to 5 s, and at least 60 s (the campaign
test keeps par between 1 and 4 minutes). The source line in `tools/levels/<id>.mjs` records the
median it came from. The last column is the bots' completion rate; `playtest/BOT-REPORT.md` has the
full tables and the before/after of the 2026-10-01 tuning pass.

**Checkpoints** are per cat: walking over a paw pad makes it that cat's respawn point. Two rules
keep a catch from undoing the plate work (both checked in `src/sim/__tests__/telegraph.test.ts`):
on the leapfrog levels (03, 07) the tile just past every plate door is a checkpoint, so a cat caught
behind a door respawns on the side it reached; and no guard on its normal rounds ever sees a
checkpoint's centre, so a respawned cat is not caught again where it stands. After a catch the cat
is frozen for 40 ticks, then has up to 3 s of grace (`GRACE_TICKS`, SIM_VERSION 4) in which guards
cannot see it while it stays within 1 tile of its checkpoint; it flickers meanwhile, and leaving that
area ends the grace at once.

Stars (each earned once, from any winning run, and kept):

1. **Heist complete**: free the shelter cat and get both cats to the exit.
2. **All catnip**: win with every coin collected.
3. **Clean and quick**: win without being spotted, at or under par time.

The Results screen shows the stars for the level (new ones pop), what just unlocked, and **Next
level** / **Heists** buttons. (Its paw rating is the older, separate rule in `src/ui/logic.ts`.)

### Sentries

A guard with exactly one waypoint stands on its post. With `turns: [{ facing, ticks }, ...]` it turns
through that schedule on the global tick clock (`sentryFacing(def, tick)` in `src/sim/sim.ts`): the
facing is a pure function of `SimState.tick`, so there is no new state. A sentry that hears a meow
walks off to investigate like any guard, then walks back and rejoins its schedule. It is drawn by
the normal guard renderer. heist-08's doorman is a slow sentry (north 4 s, east 3 s, north 4 s,
west 3 s): lure it, or slip in while it looks along the hall. The heist-08 yard sentries hold each
facing 3 s.

**Turn telegraph.** For the last 1.2 s (`TELEGRAPH_TICKS` = 36) before every scheduled turn, a pale
ghost cone shows where the sentry will look next (it brightens and flickers as the turn nears), a
ring pulses under the dog, and a soft two-note tick plays when the sentry is within 10 tiles of the
active cat. A sentry walking back to its post after a lure gets the same warning before it snaps to
its scheduled facing (`sentryReturnTurn`), and the tick is edge-triggered per warning, so it also
plays for a warning that starts with less than the full lead. `src/sim/telegraph.ts` reads the turn
off the schedule and the guard's walk back (`nextSentryTurn`, `sentryTurnAhead`, `sentryWarnings`);
the sim does not import it, so sim behaviour, hashes and the vendored backend sim are unchanged by
it. The playtest bots see the ghost cone too (with their reaction delay).

### HUD and floor cues

- Each cat's portrait shows **on plate** while that cat stands on a pressed plate (active or parked,
  so the badge follows the cat after a swap). The parked cat's portrait pulses red with **!** while a
  guard is about to see it: in a cone with a tile to spare, in a telegraphed sentry turn
  (`partnerDanger` in `src/sim/telegraph.ts`), or when a patrol would walk into view within 2 s if
  nobody moved (`partnerCatchAhead`, the sim run ahead with no input, 5 times a second). Screen
  readers hear it too.
- After the rescue a **1/2 at exit** chip counts the cats at the exit. The catnip chip shows a star
  once every coin is in; the brief card lists the star rules, and the Results row says
  "(all N = ★)" when catnip was missed.
- The hint line puts situational prompts first: "Press E to free Mochi!" next to the crate, "Step
  right next to the crate" two tiles off, and the swap prompt once a plate is really pressed
  (`contextPrompt` / `hudHint` in `src/sim/hud.ts`).
- The key, the crate, the exit and every plate pulse once the first time they come on screen;
  pressing a plate pulses its linked door in the plate's colour; a plate next to a resting cat
  pulses "step here"; a resting cat sees a lilac ear ring under each dog that would hear a meow.
- Vision cones hidden behind tall walls are drawn again, a little fainter, on top (an inverted depth
  test), so a dog behind a wall in heist-06 still shows its cone. Plates get a dithered x-ray ring
  and plate doors an x-ray panel the same way, so a plate behind a wall or the exit portal, or a
  door behind a wall, still shows where it is (the GLB export drops these depth-trick materials).
- While the active cat pushes into a wall, the nearest 1-tile gap in it within 3 tiles pulses mint,
  so a cat that only looks as if it stands in a doorway shows where the opening is.
- The screen-reader announcement ("Spotted! Back to the checkpoint. ...") is cleared after 3 s
  instead of staying in the page text.

### Authoring a level

1. Copy `tools/levels/heist-02.mjs` to `tools/levels/<id>.mjs`. The map is ASCII; letters become
   entities and the tile under them becomes floor:

   | Char | Meaning |
   |---|---|
   | `#` ` ` `.` `b` `r` | wall, void (outside), floor, box (cover), rug |
   | `1` `2` | cat spawns |
   | `$` `k` `C` `E` `+` | coin, key, crate (shelter cat), exit tile, checkpoint |
   | `V` | vault door (opens with the key) |
   | `A D F G H J L M N P Q S T U W X Y Z` | plate doors; the same letter in lower case is a plate that holds them open (`links` overrides) |
   | `3`-`9` `@ % & * = ~ ^ ! ?` | named points that guard waypoints refer to |

   Then fill the tables: `doors` (letter → id), `guards` (waypoints as point chars or `{x, y}`;
   `facing`; `turns` for sentries), `crate` (breed id + name) and `meta` (`parTicks`, `maxCoins`,
   `twoCatRequired`, `objectives`, `hints`). Plates must be at least 2 tiles from their doors.
2. `npm run build-level` (or `node tools/build-levels.mjs <id>`) writes `src/levels/<id>.json`.
3. Add a script to `tools/level-scripts.ts` (`goto`, `collect`, `swap`, `interact`, `meow`, `wait`,
   and `try` which retries a block after extra waiting, for moments like "meow when the patrol is
   out of earshot") and register the level in `src/levels/index.ts`.
4. `npm run solve` (or `node tools/solve.mjs <id>`) plans the run and writes
   `src/levels/<id>.solution.json`. It fails if the plan is spotted, runs over par, or a
   `twoCatRequired` level can be finished by one cat. If it cannot find a route, change the level.
5. `npx vitest run`: `src/levels/__tests__/campaign.test.ts` replays every solution (win, recorded
   hash, 0 spotted, under par) and checks the schema, the coin cap and the one-cat proof.

### Synthetic playtest

`npm run playtest:bots` plays every level with seeded synthetic players (novice, cautious, rusher,
explorer, plus a diagnostic oracle) through the real sim and rewrites `playtest/BOT-REPORT.md`
(see that file for the model and the flags). Re-run it after a level change; the hand-written
Findings section of the report survives regeneration.

### Solver

`tools/solver.ts` expands each high-level step into per-tick inputs. A `goto` is an A* over the real
sim (tile moves of exactly 6 ticks plus 3-tick waits), keyed on the cat tiles, doors and full guard
state, plus each turning sentry's phase; any branch where a cat is seen is pruned, so the plan
replays with `spottedCount` 0. The one-cat proof is a flood fill with the partner parked on its
spawn: plate doors the parked cat is not holding act as walls (a lone cat standing on a plate is
never inside its door), the vault opens only if the key is reachable. A level passes when no lone cat
can reach both the crate and the exit. `npm run solve` is deterministic: rerunning it rewrites the
same files byte for byte.

## Architecture

```
src/
  types.ts        THE CONTRACT: constants, level/sim/render/asset/audio types
  main.ts         boot: loads the manifest, reads URL params, creates App, installs QA hooks
  app/            integration layer
    App.ts        screen state machine + rAF loop; wires sim, renderer, UI, input, audio, yard
    session.ts    HeistSession: fixed 30 Hz timestep, prev/cur states, input recording, results (pure)
    controls.ts   screen-to-grid direction mapping for the iso camera
    qa.ts         window.__heist hooks
  sim/            deterministic integer sim (SimAPI), replay/log encoding, ASCII debug
  levels/         heist-01..08.json + their solution input logs; index.ts is the campaign registry
  render/         three.js GameRenderer (RendererAPI); voxel/ = sprite extrusion + geometry cache
  ui/             DOM overlay: title, cat pick, HUD, pause, results, touch controls, input layer
    levels/       level select, results campaign strip, progress store and star rules
  audio/          procedural WebAudio sound effects + chiptune loop
  yard/           Cat Yard: garden scene where every breed wanders
tools/            level builder (build-levels.mjs + levels/*.mjs), solver + scripts, one-cat proof
e2e/              Playwright specs; screenshots are written to e2e/screens/
perf/             measure.mjs (performance harness), BASELINE.md, baseline JSON, ref/ screenshots
```

Screens: Title → Cat pick → Level select → loading → Heist ⇄ Pause → Results → Next level, Retry,
Heists or Menu. From the Title, Cat
Yard → Back, or pick a cat and choose "Take on heist" to start a run with that cat.

Loop (`App.frame`, runs every animation frame):

1. On the heist screen, `HeistSession.advance(dt)` adds real time to an accumulator and runs whole
   30 Hz ticks. Frame time is capped at 0.25 s and at 8 ticks per frame. Each tick samples input
   once, so an edge-triggered button fires on exactly one tick. In replay mode the recorded inputs
   are used instead.
2. After each tick, `renderer.observe(state)`, `ui.handleEvents(events)` and
   `audio.playEvents(events)` run, so a slow frame never drops events.
3. `ui.updateHUD(cur)` runs, and `renderer.update(prev, cur, alpha)` draws with interpolation. The
   HUD only touches the DOM when `cur` is a new state (30 Hz), and then only for values that changed.
   Behind the pause modal the scene is redrawn at about 10 fps once the quality probe has settled.
   Those redraws are passed as `throttled`: the quality governor does not time them, and it starts
   a fresh window on resume, so a long pause never reads as a slow GPU.
4. When the run is won (or a replay runs out of inputs), input is disabled, the run's input log is
   saved as `catnip-heist.lastReplay`, and Results appears 1.6 s later so the win effect can play.

The game renderer is created once and reused across runs through `setLevel` / `setCats`. The Cat Yard
has its own canvas and is disposed when you leave it. Both share the voxel geometry cache. The Yard's
WebGL context is kept between visits (so shaders are not recompiled); its canvas is detached on exit,
so nothing of the visit stays reachable. What stays in the heap after leaving (about 6.5 MB) is the
shared sheet, pixel and geometry cache for the 58 breeds, which makes the next visit fast.

### QA hooks (`window.__heist`, dev or `?qa=1`)

| Hook | What it does |
|---|---|
| `getState()` | Current `SimState`, or null. |
| `step(n, input?)` | Advances n ticks synchronously. Replays use their own inputs. Bulk steps (over 30) skip audio and toasts. |
| `setInput(i \| null)` | Holds an input for the realtime loop; each call fires its buttons once. |
| `loadReplay(json, {speed}?)` | Starts a replay heist from an `InputLog` (object or JSON string). Resolves once it is on screen. |
| `start(catIds?, levelId?)` | Starts a normal heist (default: the current level). |
| `levels()` | Opens the level select. |
| `progress()`, `resetProgress()` | Campaign progress as stored, and a reset. |
| `freeze(on)` | Stops the realtime clock, so only `step` advances the sim. |
| `screen()` | `title`, `pick`, `levels`, `loading`, `heist`, `pause`, `results` or `yard`. |
| `stats()` | `{ screen, calls, triangles, fps, tick }` for whichever scene is active. |
| `log()`, `lastReplay()` | The current run's input log, and the last finished run's log. |
| `yardStats()`, `yardReady()` | Cat Yard budget numbers, and a promise that resolves once all sheets are placed. |
| `renderGameToText()` | A status line plus an ASCII map of the level with vision cones. |

## Checks

Run all of these from this directory. If the rtk hook rewrites `npx`, use `./node_modules/.bin/<tool>`.

| Check | Command | Covers |
|---|---|---|
| Types | `npx tsc --noEmit` | Whole package, including tools and e2e |
| Unit | `npx vitest run` | Sim rules (incl. sentries) and determinism, replay, every level's solution and schema, progress and stars, voxel extrusion, render maths, input, UI logic, yard wander, app session |
| Build | `npx vite build` | Production bundle in `dist/` |
| E2E | `npx playwright test` | Builds, serves on 4173 and runs headless Chromium with SwiftShader WebGL |
| Solver | `npm run solve` | For every level: proves one cat alone cannot finish (where required), re-plans and replays the solution |

The e2e suite (`e2e/heist.spec.ts`) checks:

- The title screen renders.
- The Cat Yard shows every breed in the manifest within 150 draw calls and 100k triangles.
- A heist starts with the two cats picked on screen. It also checks keyboard movement, swapping,
  pausing from Esc and from window blur, and resuming.
- The heist-01 solution, loaded through the QA hook, reaches Results with `won = true`. Its final
  hash matches the `finalHash` that the vitest replay asserts (451370211 at SIM_VERSION 4).
- The level select shows 8 cards with only heist-01 unlocked on a fresh profile.
- Every level's solution replays to Results with `won = true` and its recorded hash (and earns no
  progress, since it is a replay).
- Playing heist-01's inputs live wins it, awards 3 stars, offers Next level, unlocks heist-02, and
  the unlock survives a reload.
- The win screen's "See shelter payouts" opens the in-game payouts modal; Escape closes it and
  focus returns to the button.
- A phone-landscape touch layout.

It saves a screenshot of every screen to `e2e/screens/`. Playwright uses the locally cached
`chromium_headless_shell-1234`, falling back to `chromium-1234`, or whatever `PW_CHROMIUM` points to.

### Performance

`perf/BASELINE.md` has the measured baseline (load; runtime on every level, the title and the Cat
Yard at desktop and phone sizes with 4x / 6x CPU throttling on both quality tiers; heap and GC) and
the top 10 hotspots. `node perf/measure.mjs` re-runs it and prints the same metrics as JSON:
`--quick` is a one-minute smoke run, `--gpu=metal` uses the host GPU instead of SwiftShader,
`--profile` adds CPU and allocation profiles, `--md <file.json>` prints tables. `node
perf/measure.mjs --compare-screens` diffs fresh captures against `perf/ref/`. It builds and serves
its own copy on a free port and does not modify `src/`. Each load run starts from a tiny routed
blank page on the same origin. Until 2026-09-30 it started from `/assets/manifest.json`, which
Chromium lays out and (on SwiftShader, in software) rasters as text. Once the manifest was minified
to a single 54 kB line, that work spilled about 70 ms (4x) into the measured navigation and read as a
later DOMContentLoaded and title on SwiftShader. `perf/RESULTS.md` has the before/after with the
fixed harness.

CPU, DOM and memory changes after the baseline (A/B against the same tree, desktop 6x high on Metal,
two interleaved runs each):

- Yard wander AI (`src/yard/wander.ts`): no `Math.hypot` (it allocated per call), neighbour queries
  sweep a per-array x-sorted order instead of scanning all 58 agents. Yard allocation 8.7 to 9.0 MB/s
  down to 4.2 to 4.3 MB/s; `stepAgents` about 5x faster in isolation (26 to 5 µs per step) and
  allocation-free. The Yard also skips its camera update and label style writes when nothing moved.
- HUD: `ui.updateHUD` 0.11 to 0.14 ms per frame down to 0.03 to 0.04 ms (work only on a new sim
  state; the narrow-screen media query and the touch flag are cached).
- Title: the Play button's glow is an opacity-only layer instead of an animated `box-shadow`, which
  restyled the title on every frame. Title JS per frame p50 5.0 ms down to 3.8 to 4.5 ms; the forced
  style flush that the diorama pays in `placeLights()` drops from 13.8% to 12% of busy CPU (490 to
  340 ms per 6 s).
- Memory: after title, Yard and heist-01 round trips the heap settles at 14.6 to 15.5 MB instead of
  19.9 to 20.8 MB (six cycles; no growth in DOM nodes or listeners).
- Audio: finished voices disconnect themselves, and fixed-frequency noise filters (footsteps, drums)
  are shared nodes instead of one per hit. Gamepad polling allocates nothing per frame and stops when
  no pad is connected; the touch stick reads its zone's position once per drag.

Load-side changes since the baseline (median of 2 Metal load runs each, same tree otherwise):
the voxel mesher writes straight into reused typed arrays (byte-identical output, pinned by golden
hashes in `extrude.test.ts`; all 58 breeds + 5 dogs, every frame, both presets: 1.57 s to 0.67 s
in Node), sheet PNGs are decoded with `img.decode()` and read back through one scratch canvas,
assets went through the lossless pass above, three.js is its own cached chunk, and `index.html`
preloads the manifest and font. Desktop 4x high: title interactive 258 to 213 ms, first heist 361
to 302 ms, Cat Yard ready 873 to 541 ms and all sheets 5.8 to 3.2 s; phone 6x high: title 435 to
352 ms, first heist 566 to 442 ms, Yard all sheets 9.8 to 5.2 s. Whole session download 2.13 to
1.18 MB. Voxel extrusion still runs on the main thread (time-sliced in the Yard, synchronous in
`GameRenderer.setCats` / `guardSheet`); moving it to a worker needs an async prewarm at those call
sites.

Render loop (`src/render/`), what keeps a heist frame cheap:

- Vision cones are clipped again only when a guard's sim position, facing or radius changes, or a
  door opens or closes (at most once per 30 Hz tick, not every frame). Only the used part of the
  vertex buffer is uploaded. Per-guard colour, alpha pulse and origin are shader uniforms.
- The scene root and the static level (floor, walls, frames, pads, glows, instanced props) do not
  recompute their matrices each frame. Only animated objects do.
- The frame never reads layout: the canvas size comes from the `ResizeObserver`.
- High tier: the bloom is added in the final grade pass. It is no longer blended back into the
  full-resolution MSAA scene target, which saved a full-screen pass and a second MSAA resolve. The
  shadow map is re-rendered at most 60 times a second (every other frame on 120 Hz screens).
- Instanced props and shadow casters get their own materials, so three.js does not re-resolve
  shader programs on every draw. Particle and blob-shadow uploads cover only the live instances.
- The pixel ratio is capped by a pixel budget (2.6 MP on high, 1.6 MP on low, never below 1), and
  MSAA drops to 2x at a pixel ratio of 1.75 or more.
- Auto quality: a 2 s probe picks the tier. After that the heist renderer drops to low after two
  2 s windows under 36 fps. It steps back up once per session after four windows at 57 fps or more
  on low, and then re-probes; if high does not hold, it drops back to low for the rest of the
  session. The title diorama never steps up. `?quality=` still forces a tier. Probe and governor
  get the real frame time (animation steps are clamped to 0.1 s, they are not), so frames over 1 s
  (tab switches, long compiles) are skipped, and throttled pause redraws are not sampled.

## Assets

`npm run import-assets` copies source art from `../cat-assets` and `../client/public` into
`public/assets` (generated, do not hand-edit), and writes `public/assets/manifest.json`
(`AssetManifest` in `src/types.ts`):

- `cats/<id>.png`: 58 breed sheets (`test-char` is skipped), 48 px tiles, rows `CAT_ROWS`, facing
  right.
- `dogs/<id>.png`: 5 guard sheets, rows `DOG_ROWS`, facing right.
- `images/{coin,catnip,heart,paw,logo}.webp` (plus `images/paw.png` for the favicon), `icons/*.png`,
  `fonts/catpaw.woff2` ("Cat Paw").

Frame counts are detected per row (the contiguous non-empty tiles from column 0) and stored with the
union bounds of each row's opaque pixels.

The import ends with `scripts/optimize-assets.mjs` (also `npm run optimize-assets`), a lossless size
pass: sheets and icons become palette PNGs (pixel art has far fewer than 256 colours), the brand
images become lossless WebP, and the manifest is written without indentation. Each file is
replaced only when the new encoding is smaller and decodes to the same pixels (same alpha, same RGB
wherever alpha > 0). That took `public/assets` from 1.87 MB to 1.04 MB (sheets and icons 968 kB to
444 kB, brand images 653 kB to 334 kB, manifest 98 kB to 53 kB).

## Voxel core

```ts
import { loadManifest, loadVoxelSheet, VoxelSprite } from './render/voxel';

const manifest = await loadManifest();
const sheet = await loadVoxelSheet(manifest.cats.find((c) => c.id === 'bob')!);
const cat = new VoxelSprite(sheet, { anim: 'IDLE', castShadow: true });
scene.add(cat.object3d);        // 1 tile = 1 world unit
cat.setAnim('WALKING');         // row index or name; HIT, JUMPING, DAMAGE, DEAD play once
cat.faceFromVelocity(vx);       // flips via inner scale.x = -1; vx = 0 keeps the facing
cat.update(dt);                 // seconds
```

- Each opaque pixel becomes one voxel. Depth is 2 + min(distance to transparent, 3), centred on the
  sprite plane. Hidden faces are culled and same-colour coplanar faces are merged. Top faces are
  lighter; sides, bottom and back are darker.
- Geometry is cached per (sheet, row, frame) and shared. Call `clearVoxelCache()` only when tearing
  the whole world down.
- A typical cat frame is 1,200 to 1,800 triangles. `SPRITE_EXTRUDE_LOD` roughly halves that for
  crowds.

## Ownership

| Path | Owner |
|---|---|
| `src/types.ts`, `src/render/voxel/`, `scripts/`, configs | scaffold |
| `src/sim/`, `src/levels/`, `tools/` | sim |
| `src/render/` (the rest) | render |
| `src/ui/`, `src/audio/`, `src/yard/` | ui |
| `src/main.ts`, `src/app/`, `e2e/` | integrate |

### Shelter payouts on the win screen and the "Sent to shelters" modal

The rescue screen shows a read-only on-chain total ("Token Tails has sent X USDC to shelters so far,
on-chain"; other coins such as USDG or EURC are listed separately with " + ", never summed as USDC).
`src/ui/payouts.ts` reads ShelterSplit's `Disbursed` and `NativeDisbursed` events: inside `/heist`
from the backend's index of those public events (`GET /shelter/payouts`) plus the newer blocks from
public RPCs, and from public RPCs alone when there is no backend, it does not answer, or its index
is stale. Every payout links to its transaction on the chain's explorer; no wallet is involved. The deployment list is `public/payouts/deployments.json`, written by
`fund a:ingest` after a deploy. `HEIST_DEPLOYMENTS_URL` overrides it, and an empty value hides the line.

The rescue screen also has one prominent button, "Send Pink Paw a rescue treat 🐾". It only opens
the client's give page (`/shelter-payouts/give?from=heist&cat=<rescued cat>`), which does the
one-tap donation through the backend; the game never signs, pays or holds keys. Pink Paw
(Rožinė pėdutė) is the showcase shelter. Its wallet is created and held by Token Tails on its
behalf until handover; the give page and payouts page disclose this.

On web hosts the payouts live in the game: `src/ui/shelter-payouts.ts` is a DOM modal ("Sent to
shelters") with the total, the latest payouts (memo, amount, time, explorer tx link), a row per
deployment (contract and explorer link), the Pink Paw card (its logo, cats from the backend's
`GET /cat/sale` with bundled copies as the fallback, the live goal meter for fact C-001 from the
backend's `GET /shelter/goal/C-001`, else the campaign wallet's balance while that is exact) with the
give button, and friendly
loading, empty ("First payouts land soon") and error (retry) states. It opens from the title (the
gold pill), the pause menu and the win screen's "See shelter payouts", and on load with `?payouts`
or `#payouts`. Escape closes it without resuming a paused run, Tab stays inside it and focus goes
back to the opener. It is styled after the tokentails.com landing (the hero sky
`assets/images/payouts-hero.webp` and Passion One 700 in `assets/fonts/`, both copied from
`client/public` by `npm run import-assets`). App builds (Capacitor) never show it (claims rule
R10); there the win screen keeps the external link.

Under the real payouts the modal has a "Testnet proof" section, labelled "Test coins · no real
money", mirroring the client page's section. It reads its own list, `public/payouts/testnet-deployments.json`
(a copy of `client/public/shelter-payouts/testnet-deployments.json`; `fund a:ingest --network testnet`
writes both), and shows one card per testnet (Arc, Tempo, Arbitrum Sepolia, Avalanche Fuji, Base Sepolia,
Robinhood Chain Testnet with its mock mUSDC, Monad Testnet; `TESTNET_CHAIN_IDS` in
`src/ui/shelter-payouts-chains.ts`) with its role line, token chips, that chain's own totals, contract explorer links and, per
test payout, an explorer link and a website receipt link (`<payouts page>/receipt?chain=&tx=`). Its
totals are never summed across chains or added to the real total. `HEIST_TESTNET_DEPLOYMENTS_URL`
overrides the list, and an empty value hides the section.

`npm run build:client` builds a copy into `../client/public/heist-game/` (base `/heist-game/`) that
reads the client's `/shelter-payouts/deployments.json` (and `/shelter-payouts/testnet-deployments.json`
for the testnet proof) and links to `/shelter-payouts`. On tokentails.com, `/heist` is the Next host
page (`client/pages/heist.tsx`) that embeds that build in an iframe; `client/next.config.js` redirects
the old `/heist/index.html` to `/heist` and old `/heist/*` asset URLs to `/heist-game/*`.
