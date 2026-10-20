# Formula Meow: iteration 2 plan

Founder feedback on v1 (b87be46e): "right now it's basic and buggy. upgrade, make everything more fun, like a fully
fledged game". Iteration 2 turns the demo into a complete game with no known bugs, real menus and modes,
progression, more content, and much better feel and presentation.

Sources: four audits of v1 (desktop bugs, mobile bugs, code review, fun gap; scratch logs in the session scratchpad).
GDD: `docs/plans/formula-meow/GDD.md`. Module map: `formula-meow/README.md`, `formula-meow/LANES.md`.

## 0. Shape of the work

```
Stabilise (one agent, on feat/formula-meow)
  ├─ part A: every bug in section 1, SIM_VERSION 3 → 4
  └─ part B: the shared contracts in section 3, stubs for every lane, lanes.ts lines
        │
        ├── lane/fm2-modes        ┐
        ├── lane/fm2-tracks       │  five worktrees branch from the Stabilise commit,
        ├── lane/fm2-feel         │  each edits only the files it owns (section 2),
        ├── lane/fm2-progression  │  and appends to registries instead of editing shared files
        └── lane/fm2-audio-ui     ┘
        │
Integrate (one agent): merge feel → tracks → progression → modes → audio-ui, SIM_VERSION 4 → 5 once,
regenerate the golden hashes, run every check, play-test, npm run build:client, commit client/public/formula-meow-game.
```

Rules for every step (from the task, unchanged):

- No feature flags. Everything new is on by default.
- Never read `.env*`. Never reference `funding/`. No Telegram.
- Copy makes no invented numbers or claims. Pink Paw cats are the real roster snapshot and show "as of 2026-10-04"
  wherever a status appears. The shelter track depicts a generic shelter and claims nothing about donations.
  Staff or dev ghosts are recorded in-house and labelled that way, never shown as player records.
- Fish coins are an in-game currency only. No real money, no purchase path, no ads.
- Procedural low-poly three.js and WebAudio synth only. No downloaded assets, unless an asset already in the repo fits.
- Portrait mobile first, then desktop keyboard and gamepad. Budget: 60 fps on a mid phone, at most 120 draw calls,
  initial JS at most 450 kB gzip (v1 is about 226 kB). Menus, garage, battle, podium, post-processing and each
  track's dressing are lazy chunks.
- The sim stays a deterministic fixed step (GDD 3.1 math rules, `fixed.test.ts` lint). Any sim change bumps
  `SIM_VERSION`, and old ghost and dare links must still fail gracefully (target-time race plus a notice).
- Never touch `swordcat/`, `docs/plans/moba/` or `client/public/tail/mascot*`.
- Checks before every commit: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run e2e`.
  The integrator also runs `npm run build:client` and commits `client/public/formula-meow-game`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

## 1. Bug list (Stabilise part A)

Deduplicated from the four audits. Paths are relative to `formula-meow/src/`. "Sim" marks a change that alters
replays; all of them ship together under `SIM_VERSION = 4` with new golden hashes in `core/sim/race.test.ts`.
Every sim fix gets a unit test that fails on v1.

### 1.1 Race rules and positions (sim)

| # | Bug | Where | Fix |
|---|---|---|---|
| B1 | Reversing over the line after lap 2+ records a bogus best lap (1.5 s) and emits `lap`/`finalLap` twice | `core/sim/race.ts:38,56-58` | Add `KartState.lapMax` and `lapStartPrev`. On take-back restore `lapStartTick = lapStartPrev`. Record best lap and emit `lap`/`finalLap` only when `lap > lapMax`. Add both fields to `core/sim/hash.ts` |
| B2 | Two karts crossing in the same tick get places by kart index; the "FINISH! Nth" popup disagrees with the results table | `core/sim/race.ts:39,46-54,78` | Collect the tick's finishers, sort by sub-tick `finishTime` (ties: lower `dist` overshoot loses, then kart index), assign `place`, then emit `finish`. Replace the `Math.min(1, …)` clamp and 1 m/s floor with the real crossing fraction (floor 0.05 m/s) |
| B3 | Race positions flicker every tick for side-by-side karts, spamming overtake sounds and fake "TRIPLE!" chains | `core/sim/race.ts:66-85`; `juice/index.ts:170-176` | Hysteresis: a kart moves ahead only when it leads by 0.6 m or has led for 8 ticks. `overtake` per ordered pair has a 45-tick cooldown and none in the first 180 ticks after GO. The juice chain counts distinct karts passed and ignores a pass-back of the same kart |
| B4 | Progress jumps up to 4 m in one tick at the Kitchen hairpin (si 299–311) and Rooftops si 288 and 394, which feeds B3 | `core/track/query.ts` `nearestSample` | Search only a continuity window around the hint (±24 samples, widened only after respawn) and prefer the candidate with the smallest `s` change. Test: no kart's `dist` changes by more than `speed × DT + 0.5` in 72 headless races |
| B5 | Reversing for 5 s or scraping along a wall after a wrong-way spell triggers the respawn hand | `core/sim/kart.ts:425-431` | Watchdog ignores ticks where brake is held and speed < 0, and requires speed < 4 m/s as well as no progress. Wrong-way for 3 s with the banner showing does a respawn that faces forward (GDD 3.3), and emits `wrongWay` |
| B6 | `?cls=1.5` crashes results; `?cls=2` skips the unlock check while pause shows 🔒 | `core/app/shell.ts:161-162,373,381` | `Number.isInteger` and clamp to `progress.unlocked` (QA `?bot` excepted) |

### 1.2 Physics and collision (sim)

| # | Bug | Where | Fix |
|---|---|---|---|
| B7 | Karts visibly pass through each other (collision circle 0.9 m, models are longer) | `core/sim/contact.ts:12`, `tuning.ts` `PHYS.kartRadius` | Two circles per kart, r 0.75 m at ±0.8 m along the heading; resolve the closest pair. Test: no two karts' hulls overlap more than 0.2 m after resolution |
| B8 | `bump` fires every tick while karts grind (16–25 in a row): nonstop sound and camera shake | `core/sim/contact.ts:50`, `juice/feel.ts:34` | Per-pair cooldown of 20 ticks on the event (the push still runs every tick) |
| B9 | Contacts push a kart through the wall for a tick and leave `si`/`d`/`s` stale | `core/sim/contact.ts:37-40` | After contacts, re-query the track and re-clamp to the wall for each moved kart |
| B10 | The visible edge does not match the collision wall: Kitchen wall 1.5 m past the curb on empty countertop; Rooftops parapet inside the physics wall; red-white kerb looks drivable but counts as offroad | `core/sim/kart.ts:310` (`PHYS.wallMargin`), `core/track/mesh.ts`, `core/track/build.ts` | Build the barrier mesh at the real `wallL`/`wallR`. The kerb band (halfW to halfW + 1.5 m) is `Surface.Curb` (small drag, rumble) not offroad. Test in `build.test.ts`: barrier vertices within 0.1 m of the wall arrays |
| B11 | Hitting a wall stops the kart dead (22 → 6 m/s in 0.5 s, then grinds at 7) | `core/sim/kart.ts` wall resolution | Keep the tangential component. Graze: lose 12 % once, then 10 %/s while scraping. Head-on (angle > 50°): bounce back 3 m/s with a 0.3 s wobble. Rename the event payload: `wall` a = 1 graze, 2 head-on (as today) |
| B12 | Height pops 0.6–0.9 m in one grounded tick at the Rooftops edge (si 321–326, abs(d) ≈ 6) | `core/sim/kart.ts:398` | Grounded y follows the ground with at most 0.12 m per tick up and 0.25 down; above that the kart goes airborne (down) or is pushed back (up, a step) |
| B13 | Rooftops 50cc wall trap: 51 head-on hits in 12 races at the kink (12,-52) → (-4,-44) → (-24,-56) | `core/track/tracks/rooftops.ts:32-34` | Reshape to a single-radius bend of at least 22 m, width class 3 through it. Add a harness test: AI-only 50cc race, fewer than 3 head-on wall events per race on every authored track |
| B14 | Karts climb the raised red slab at the Kitchen hairpin (y ≈ 2.7) | `core/track/dressing/kitchen.ts` | Move the slab outside the wall line (dressing test asserts every prop footprint is outside `wall + 0.5`) |
| B15 | AI scrapes walls 16–21 times in 40 s on doodle tracks | `items-ai/ai/driver.ts` | Clamp the line target to `halfW − 1.5`, look ahead by `speed × 0.6 s`, brake on curvature ahead. Harness: 20 seeded random valid doodles, fewer than 2 wall hits per AI per lap |
| B16 | The Kitchen boost pad (s 167) sits off the racing line: 1 pad use per race | `core/track/tracks/kitchen.ts`; `items-ai/ai/driver.ts` | Move it onto the line; AI with skill ≥ 0.5 bias toward a pad within 40 m ahead |

### 1.3 Items (sim)

| # | Bug | Where | Fix |
|---|---|---|---|
| B17 | The Laser Dot hits the same kart 3–4 times; fired by a leader it spins 2nd place in the same tick with no warning; it re-picks a target the dot already passed | `items-ai/items/projectiles.ts:75-93,197-223` | Store a `hitMask` bitfield on the dot; each kart is chased once. Lock the target at fire time; re-target only to a kart with `dist > dot.dist`. If the owner leads, the dot fizzles with a "no one ahead" pop (no item lost on the AI side). Set `laserWarn` before the hit check, and never hit within 45 ticks of firing |
| B18 | Zoomies emits `blocked` every tick (seen "BLOCKED! ×33") | `items-ai/items/system.ts:15-28`, `core/sim/kart.ts:55-57` | Skip targets that cannot be hit (`shieldTicks || autoTicks || invTicks`), plus a per-pair 30-tick cooldown on `blocked` |
| B19 | A finished kart's held item is fired by the AI autopilot at karts still racing, and credited to the player | `core/sim/world.ts:117-139`, `items-ai/ai/driver.ts:123` | No item use when `k.finished` |
| B20 | Traps hit karts passing well below them | `items-ai/items/traps.ts:62` | `Math.abs(k.y - tr.y) > 1.2` |
| B21 | A lobbed trap is clamped to the thrower's road width, so it can land on the curb | `items-ai/items/traps.ts:19` | `halfW[sampleAt(track, dist)]` |
| B22 | Item presses are dropped during the roulette, spin, respawn and Zoomies | `core/sim/world.ts:106-108,129-133` | Buffer the press with its `itemBack` for 9 ticks (150 ms) and fire on the first legal tick, including the `itemReady` tick. During Zoomies the autopilot drives but item presses still pass through |

### 1.4 Input (no sim change)

| # | Bug | Where | Fix |
|---|---|---|---|
| B23 | Resting the steer thumb before GO gives "*cough* too early" | `core/input/touch.ts:165`, `core/sim/kart.ts:128-131` | During the countdown touch emits `gas = false` for held fingers; only a fresh tap on the right half that starts inside the Pounce window counts. Steer-side presses never count |
| B24 | Swipe-down to throw back goes forward about 40 % of the time | `core/input/mux.ts:91` | Latch `itemBack` together with the sticky `item` |
| B25 | Every item swipe also hops and can start a drift; you cannot fire while drifting | `core/input/touch.ts:91,100,122` | Delay the hop until the press is 80 ms old or has moved less than 15 px; a swipe from the drift finger is accepted at any time and does not end the drift |
| B26 | The steer stick cannot reach full lock when the thumb lands near the edge | `core/input/touch.ts:12,96` | Clamp the stick base to at least `FULL + 6` px from the screen edges |
| B27 | A second finger on the left half is ignored; if the first lifts, steering is dead | `core/input/touch.ts:92` | Track all left-half pointers; the newest one steers, and lifting it promotes the previous |
| B28 | The touch tutorial contradicts itself ("HOLD = DRIFT" vs "FULL STICK INTO THE TURN = DRIFT"); both methods are live | `core/input/touch.ts:45`, `core/app/shell.ts:346-350`, `core/input/mux.ts:65-74` | One-thumb (full stick = drift) stays the default; two-thumb hold only when `oneThumb` is off. Overlay and hints read the setting |
| B29 | Touch zone ignores the top 40 %; in landscape only the bottom 234 px are usable | `core/input/touch.ts:79` | 40 % in portrait, 15 % in landscape |
| B30 | Space cannot press focused buttons (global `preventDefault`) | `core/input/keyboard.ts:10` | Only prevent default when the race has focus (no focused button, input or select) |
| B31 | Menus cannot be used with a gamepad; no restart binding | `core/input/gamepad.ts`, all DOM panels | The UI kit's focus navigation (section 3.6): D-pad and left stick move focus, A confirms, B backs, Start pauses, Select restarts |

### 1.5 Shell, HUD and screens

| # | Bug | Where | Fix |
|---|---|---|---|
| B32 | The Pounce Start hint never clears (the `go` event has kart −1) | `core/app/shell.ts:287,320,342` | Route kart −1 events to `ftue()`; keep the timer id and clear it in `start()` (also fixes a stale timer clearing the next race's hint) |
| B33 | Centre messages pile up ("too early", "MEOW!", the hint; "LAP 2" over "P1! 4 in a row"; "SLIPSTREAM!" stacks) | `core/hud/hud.css:102`, `core/app/shell.ts:320`, `juice/vfx/popups.ts` | One priority message slot `hud.say()` (section 3.7); popups go through it. Banner starts at scale 1.25, not 1.6, and stays clear of the map |
| B34 | Hidden-tab pause races with a queued Escape and ends unpaused; music keeps playing muffled in a background tab | `core/app/shell.ts:134-136`, `juice/audio/race-audio.ts:146-149` | `pause(true)` is idempotent, not a toggle; suspend the AudioContext on hide and resume on show |
| B35 | Results freeze 2.5 s after the player finishes; karts still racing stay "—" | `core/app/shell.ts:306` | Results rows update live as karts finish until the tail ends |
| B36 | Daily Cup runs count toward normal best times; the Daily grid has no identity | `core/app/shell.ts:366-369` | Key bests by `mode:track:class:modifiers`. Daily shows a "Daily Cup #N" banner on the grid and a HUD tag, and the URL changes |
| B37 | "Again" replays the same seed, so the AI drives an identical race | `core/app/shell.ts:385` | New seed except for dares and rematches |
| B38 | Changing the Track or Class select restarts the race at once | `core/app/shell.ts:445-446` | Remove the selects from pause (the menu replaces them). Pause keeps Resume, Restart, Settings, Quit to menu |
| B39 | Landscape: the item button covers the mini-map; the pause panel hides Resume/Restart; iPhone SE results hide Again/Next | `core/hud/hud.css:13,218,279-285` | Landscape media query moves the map left of the item button; overlay padding 16 px; action buttons in a sticky footer on every panel |
| B40 | Hint text is unreadable on phones (3 px outline fills the spaces) | `core/hud/hud.css:72` | Use the thin outline from `.fm-time` on `.fm-hint`, `.fm-tap small` and popup subtitles |
| B41 | The pre-race prompt sits on the player kart and the thumb circles; "PRESS ANY KEY" has no backing | `core/hud/hud.css`, `core/app/shell.ts` | Prompt in the top third on a translucent pill |
| B42 | Pause on touch shows keyboard help and an Auto-gas toggle; the whole Sound row is the tap target; targets under 44 px ("Daily #1", "Your cat", "Pink Paw", "See Vane"); selects at 15 px | `core/hud/hud.css:273`, `core/app/shell.ts` | Show only the input method in use; real toggle controls; 44 px minimum; 16 px form text |
| B43 | "Unlocked: Alley Cat 100cc" is plain text and Next keeps the old class | `core/app/shell.ts:373,386-389` | Unlock line is a button that starts that class |
| B44 | The "🏁 Tracks" sticker pops over the finish celebration; the Clip button wraps ("Clip / 34%") and moves the row | `ugc/hub.ts`, `share/index.ts` | Sticker appears with the results panel; the clip button has a fixed width and shows progress as a fill |
| B45 | The empty item slot looks like a button but cannot be tapped | `core/hud/hud.ts` | On touch the top slot is display-only (no dashed border); the real button is the bottom-right one |
| B46 | Opening Tracks from pause leaves the pause panel visible below the sheet; `?make` leaves hidden pause buttons in the DOM | `ugc/hub.ts`, `core/app/shell.ts` | One overlay stack (section 3.5): a pushed screen hides the one below |

### 1.6 Share, dares and UGC

| # | Bug | Where | Fix |
|---|---|---|---|
| B47 | Broken or truncated dare links fall back silently | `share/links/link.ts:40-47`, `share/index.ts:134` | A failed `peekGhost` returns `{ kind: 'dare-broken' }`; show "That dare link is broken" and race the track if the header was readable |
| B48 | After a dare link, classes never unlock for the session | `share/index.ts:102,417` | `noUnlock = (runner.live && runner.matches()) \|\| dayOf != null`, computed per race |
| B49 | A stale dare link leaks into the next race's caption after a fast Again | `share/index.ts:295-298` | Tag each result with a token; ignore stale resolves |
| B50 | Ghost finish time is computed synchronously on the results frame (up to 24 000 shadow ticks); 600 catch-up steps in one frame | `share/index.ts:305`, `share/links/ghost-runner.ts:157,189` | Step the shadow world in chunks of 300 ticks per frame; fill the ghost row when done; "ghost DNF" at once when its inputs ran out |
| B51 | The ghost starts in the player's slot and overlaps the player kart; its name label is huge up close and covers the gantry | `share/links/ghost-runner.ts:42` | Fade the ghost to 15 % within 4 m of the camera kart; label is a fixed 14 px screen-space tag, hidden within 6 m |
| B52 | `roundRect` throws on iOS Safari < 16, which aborts `start()` on dare links | `share/links/ghost-runner.ts:42` | Fall back to `rect` + `arc` |
| B53 | Your cat: "Race!" stays disabled until a photo is picked | `share/yourcat/maker.ts:71` | Enabled as soon as a name is set; photo is optional |
| B54 | Shortcut and hazard stickers do nothing (shortcut = offroad, hazard = default) | `core/track/build.ts:208,218`, `ugc/editor/TrackDoodle.ts:50` | Stabilise hides both stickers from the editor palette; the tracks lane makes them real and shows them again |
| B55 | Editor: status bar covers the drawing area; no name field outside Style; Esc closes without asking and drops an invalid draft; about 28 handles crowd the loop; 🗒️ has no label; the Stickers tab wraps; "Point 1 ▼ Height 0 ▲" reads wrong | `ugc/editor/editor.css`, `ugc/editor/TrackDoodle.ts` | Status in the top bar; name field in the header; Esc asks when dirty and always keeps the draft; show handles only near the cursor or for the selected segment on touch; label the button; fix tab layout; group "Height ▼ 0 ▲" |

### 1.7 Robustness, rendering and leaks

| # | Bug | Where | Fix |
|---|---|---|---|
| B56 | A throwing juice listener aborts `start()` or freezes the render | `juice/bus.ts:38-48` | try/catch around each listener call; log each listener's first error once |
| B57 | Textures and geometries leak on every restart (24 → 35 textures in 12 restarts) | `core/track/mesh.ts:199-208`, `core/render/kart-view.ts:222-228`, `core/render/race-view.ts:245-255` | `disposeGroup` disposes `Points`/`Line` too and every material's texture slots; `KartView.dispose` disposes the toon, flame, outline and ghost materials; `RaceView.dispose` disposes materials and calls `InstancedMesh.dispose()`. e2e: after 12 restarts, `renderer.info` textures and geometries are within 2 of the first race |
| B58 | Per-tick and per-frame allocations (GC hitches on phones) | `core/sim/race.ts:66-74`, `core/app/shell.ts:250,282,293`, `core/render/race-view.ts:179`, `items-ai/view/item-view.ts`, `core/hud/hud.ts` `mapXY` | Reuse scratch objects and arrays |
| B59 | Karts within 5–7 m of the lens fill a corner of the screen; the start gantry fills the top on phones | `juice/index.ts` `onFrame`, `core/camera/chase-camera.ts` | Fade karts by distance (0 at 4 m, 1 at 8 m); camera near-plane check pulls in under props |
| B60 | Box shield, Bell ring and the start shockwave rings cover the screen when near the camera | `items-ai/view/item-view.ts`, `juice/vfx/*` | Cap their screen size; the player's own rings are drawn at 50 % opacity |
| B61 | About 60 `GL_INVALID_VALUE: glGetProgramiv` warnings after a scripted `start()` during the countdown | `core/app/shell.ts` `teardown` | Cancel pending `compileAsync` work in teardown and do not dispose programs still compiling. Find the cause before closing the bug |
| B62 | `navigator.vibrate` is called before any user gesture in `?bot` runs | `juice/feel.ts` | Gate haptics on the armed flag |

### 1.8 Stabilise acceptance

- All checks green, plus a new `tools/budget.mjs` (initial JS gzip ≤ 450 kB, fails the build otherwise).
- A 72-race headless harness (2 tracks × 3 classes × 12 seeds) prints, and a test asserts: zero Laser multi-hits,
  zero `bump` events closer than 20 ticks for one pair, zero `overtake` swaps closer than 45 ticks, zero finish
  place mismatches, zero DNFs at 50cc, fewer than 3 head-on wall hits per race.
- Old v3 dare links open as a target-time race with the existing notice (e2e).
- No console errors in the e2e suite.

## 2. Lanes and file ownership

A lane edits only the files it owns. Everything else is read-only for it. A lane that needs a change outside its
files writes a "contract request" in its final report; the integrator applies it. Paths are relative to
`formula-meow/`. New folders are created by Stabilise with stub files so every lane's paths exist from the start.

### Frozen after Stabilise (integrator only)

`src/types.ts`, `src/lanes.ts`, `src/main.ts`, `src/core/sim/{world,race,hash,replay,plugins,rng,fixed,coins}.ts`,
`src/core/app/{shell,screens,app-bus,save,storage,race-stats}.ts`, `src/content/ids.ts`, `src/share/**` (except the
two appends listed under progression), `src/core/input/**`, `src/ui/i18n.ts`, `src/ui/a11y.ts` (API; content is
audio-ui's), `index.html`, `vite.config.ts`, `package.json`, `playwright.config.ts`, `tools/budget.mjs`,
`src/core/sim/race.test.ts` (golden hashes: lanes may update the expected value in their branch; the integrator
regenerates it after merging).

Lanes never edit `SIM_VERSION`. The integrator bumps 4 → 5 once after the merges if any lane changed sim behaviour
(expected: feel, tracks and modes all do).

### Lane "modes"

Owns: `src/modes/**`, `src/content/cups.ts`, `src/ui/strings/modes.en.ts`, `e2e/modes.spec.ts`.

Builds:

- **Title screen.** Boots into an attract scene: the scripted bot drives a random unlocked track with a slow orbit
  camera, logo, "TAP TO START" / "PRESS ANY KEY". Deep links (`#g=`, `?t=`, `?daily`, `?make`, `/meow-race/*`)
  still go straight to their race or editor and offer "Menu" afterwards.
- **Main menu.** Tiles: Grand Prix, Time Trial, Battle, Daily Cup, Track Doodle, Garage, Your cat, Pink Paw,
  Settings, How to play. Locked tiles show what unlocks them. First boot (no save): skip the menu, run the FTUE race
  on Kitchen 50cc, then land on the menu.
- **Character and kart select.** Cat (your cat, default Tofu, unlocked Pink Paw cats with their snapshot note), body
  (6 bodies from `KART_BODIES`, stat bars for Speed, Accel, Handling, Weight), paint and hat. Turntable preview
  using `KartView`. Remembers the last pick.
- **Class select.** 50cc, 100cc, 150cc, Mirror (Mirror modifier on 150cc numbers). Locks from progression.
- **Grand Prix.** Two cups of four races (`src/content/cups.ts`):
  - Kibble Cup: Kitchen Counter, Laundry Spin, Kaunas Neon Rooftops, Yarn Canyon.
  - Catnip Cup: Cat Café Chaos, Pink Paw Shelter Sprint, Kitchen Counter (Mirror), Yarn Canyon (Mirror).
  - Points 15/12/10/8/6/4/2/1. Ties broken by the better place in the last race. Grid order of each race = reverse
    standings. The rival (from progression) is named on the first grid.
  - Between races: standings table with animated row swaps (0.6 s) and "+N" chips, Continue / Quit cup.
  - After race 4: podium scene (lazy chunk): top 3 karts on plinths 1.8 / 1.2 / 0.9 m, trophy mesh (gold, silver,
    bronze, about 40 triangles), confetti, celebrate animations, `podium` camera. Then rewards (progression section)
    and Menu / Next cup.
  - Quitting mid-cup asks once; a cup in progress is saved and can be resumed from the menu.
- **Time Trial.** No AI, no items except 3 catnips at the start (`RaceConfig.mode = 'tt'`). Saves the personal-best
  ghost per track and class on the device (the existing ghost codec) and races it automatically. Splits at 3
  checkpoints (green ahead, red behind). A dev ghost per authored track, recorded by the team in-house and labelled
  "Dev ghost (Token Tails team)". Medals: gold, silver, bronze at dev time +2 %, +6 %, +12 %.
- **Battle (balloon arena).** `RaceConfig.mode = 'battle'` on the arena track. 8 cats, 3 balloons each, 3 minutes.
  A hit pops one balloon; a bump while boosting with relative speed above 6 m/s steals one; at 0 a cat is out (kart
  turns grey, drives to the edge, cannot be hit). Winner: last cat standing, else most balloons at time-up, then
  fewer hits taken, then lower slot. Battle item table without Laser Dot. Battle rules run in the sim through the
  `ModeRules` plugin (`src/modes/battle/rules.ts`). Free-roam battle AI (`src/modes/battle/ai.ts`) picks the
  nearest or leading target, chases with the `ArenaQuery` helpers, grabs boxes when empty-handed.
- **Mode flow and save.** `src/modes/flow.ts`: title → menu → mode → select → class → cup/track → race(s) →
  results → standings/podium → rewards → menu. Owns the `modes` save slot (last selections, cup in progress, TT
  bests and ghosts). Pause gets "Quit to menu". Esc / B on results goes to the menu.
- Uses the UI kit from `src/ui/kit` (API frozen by Stabilise) and `t()` strings only.

Acceptance: e2e walks title → menu → GP 4 races at `?speed=8` with the bot → podium → menu; TT saves a ghost and the
next run shows it; battle ends with a winner within 3 minutes of sim time; every menu reachable by touch, keyboard
and gamepad (simulated) with visible focus.

### Lane "tracks"

Owns: `src/core/track/**` (build, query, spline, racing line, mesh, themes, dressing, tracks), `src/tracks/**`
(hazard sim and views, coin view, flyover paths), `src/ugc/**`, `src/ui/strings/tracks.en.ts`,
`e2e/tracks.spec.ts`.

Builds:

- **Branch primitive.** `TrackDef.branches` (section 3.1): a second spline from main sample i to j with its own width,
  walls, surfaces and query cells. Progress on a branch maps linearly onto the main loop's `s` range, so laps,
  places and the watchdog keep working. `queryTrack` returns the branch id; `kart.ts` uses only the query result
  (Stabilise makes this true). Racing line: AI with skill ≥ 0.6 takes a branch when its expected time is shorter.
- **Hazards** (`src/tracks/hazards/*`), each a `HazardDef` registered with `registerHazard`, deterministic from the
  tick and `rngHazards`, calling `applyHit`:
  - Roomba: drives a fixed loop across the road at 3 m/s, wobble on contact, pushes karts.
  - Swinging laundry: a sheet on a line swings across half the road every 2.4 s, wobble.
  - Spilled milk: a puddle that is `LowGrip` plus a 0.4 s slide.
  - Toaster: pops every 4 s, leap hit in a 2 m radius, smoke telegraph 0.8 s before.
  - Chimney steam: wobble zone, 3 s on, 3 s off, puffs telegraph.
  - Spinning drum: chicane whose ribs push karts sideways, period 3 s.
  - Every hazard telegraphs at least 0.6 s and costs no more than about 1.5 s (GDD 3.6).
- **Tracks** (6 circuits plus 1 arena; each lap 900–1100 m, about 35–40 s at 100cc; 2 ramps, 2–3 item rows, 1 alt
  route, 1–2 hazards, 3 coin rows):
  - Kitchen Counter (existing): cutting-board shortcut about 8 % shorter with offroad crumbs and a pad at its end;
    toaster hazard; spilled milk by the sink. Lengthen to the target.
  - Kaunas Neon Rooftops (existing): billboard cut becomes a real branch; chimney steam. B13 kink fixed.
  - Laundry Spin (new, GDD 6.1, theme 2): pastel laundromat, spinning drum chicane, sock mounds (offroad),
    dryer-vent pads, a high route over the folding table with 2 ramps, swinging laundry.
  - Yarn Canyon (new, GDD 6.1, theme 3): sunset mesas, a needle bridge with no walls (falling = respawn), a
    loose-thread boost strip, a shortcut over a yarn-ball jump gap that needs a trick boost to clear.
  - Cat Café Chaos (new, theme 4): a café at night with fairy lights, tables as chicanes, a koi pond jump,
    roombas, alt route through the kitchen pass (narrow, with a pad).
  - Pink Paw Shelter Sprint (new, theme 5): a cosy generic shelter (cat trees, scratching posts, food bowls, a
    play room), spilled milk, a roomba, a cat-tree ramp; an "Adopt, don't shop" style sign is fine, no numbers or
    claims. Uses the Pink Paw roster cats as the field.
  - Living Room Rug arena (new, theme 6, `kind: 'arena'`): about 80 m across, 2 ramps, 8 box clusters, sofa and
    coffee-table cover.
- **Collectibles.** Fish coin rows in `TrackDef.coins` (3 rows of 3–5 per lap, placed off the racing line) for
  every authored track. The coin sim rule is Stabilise's (section 3.4); the tracks lane places and renders them
  (one InstancedMesh, spin and bob, shard burst on pickup).
- **Intro flyover paths.** `TrackDef.flyover`: 3–5 camera keys per track ending at the grid, 3.5 s total.
- **Scenery.** One lazy dressing chunk per theme, at most 40 draw calls per track (merged geometry, instancing),
  triangles ≤ 110k. Themes 4–6 added to `themes.ts`.
- **UGC.** Hazard and shortcut stickers made real and shown again (hazard sticker picks a roomba or spilled milk;
  shortcut draws a short branch with offroad). New themes selectable in Style. Codec stays v1 for existing codes;
  new sticker kinds and themes need track code v2 (v1 codes still decode).

Acceptance: `build.test.ts` and `dressing.test.ts` pass for every track; a harness of 20 AI races per track has no
DNF, fewer than 3 head-on wall hits per race, and branch use between 10 % and 60 % of AI laps; draw calls ≤ 120 on
every track at phone size with 8 karts.

### Lane "feel"

Owns: `src/core/sim/{kart,contact,autopilot}.ts`, `src/core/render/**`, `src/core/camera/**`, `src/juice/vfx/**`,
`src/juice/{feel,time}.ts`, `src/juice/perf/**`, `src/items-ai/**` (items, AI, balance, item views),
`src/tuning.ts`, `src/content/karts.ts` (stat numbers; ids are frozen), `src/ui/strings/feel.en.ts`,
`e2e/feel.spec.ts`.

Builds:

- **Driving.** Drift charge reachable by normal play: tier thresholds 0.5 / 1.0 / 1.7 s (from 0.6 / 1.2 / 2.0),
  charge 1.5× faster when steering into the turn; mini-turbo boosts 0.6 / 1.0 / 1.5 s. Wall scrape per B11.
  Kart stats from `KART_BODIES`: top speed ±3 % per step from 3, 0→90 % time ±0.12 s per step, yaw rate ±6°/s
  per step, contact weight 0.8–1.3. Coins add +0.5 % top speed each (cap 10).
- **Race shape.** Target finish spread first to last: 8–15 s at 50cc, 5–8 s at 150cc. AI skill spread ×1.6,
  mistakes for low skill (0.4 s wide line, missed mini-turbo), AI-vs-AI item targeting so fights happen ahead of the
  player, rubber band softened (bandUp 0.02 at 50cc). Player bot podium at 50cc 70–90 %, at 150cc 25–50 %.
  Rival behaviour when `RacerInfo.rival` is set: +0.04 top scale, bandUp 0.08, targets the player with items twice
  as often; grudge for 20 s after the player hits them (emits `grudge`).
- **Items, one by one.** Each gets a use visual, a travel visual, a hit visual and a victim reaction:
  - Hairball: cough pose, spinning fur ball with spark trail, fluff puff; spin with dizzy stars.
  - Yarn: homing ball with a trailing thread line (1 draw call); the tangle wraps the kart for 1 s.
  - Cucumber: lob arc with a landing shadow ring; leap with a full barrel roll over 0.9 s, arms up.
  - Catnip: three green clouds, a short hue wobble, spiral eyes on the cat.
  - Box: the cat ducks into the box; flaps pop on a block.
  - Bell: ring shockwave drawn at the real 25 m radius; ears flinch on victims.
  - Zoomies: rainbow trail ribbon; the cat runs on the kart roof.
  - Laser Dot: red dot on each passed windscreen, target marker on the minimap; the victim's head tracks the dot.
  - Roulette 1.2 s, ticking faster to the end, icon pop at 1.3×; item boxes shatter into 8 instanced shards.
- **Kart and cat animation** (`kart-view.ts`, `cat-rig.ts`, render only): lean 0.28 rad in drifts with the head
  leaning in 0.4; squash and stretch on boost (z 1.12, y 0.92) and hop (y 1.15), landing squash 0.3 after more than
  0.5 s of air; suspension bob ±0.03 m; exhaust puff on gas; front wheels counter-steer in a drift; tumble per hit
  kind; celebrate: fist pump on overtake, finish poses by place (1st both paws up and tail up, 2nd–3rd wave, 4th+
  ears flat and head shake); tricks pick 1 of 3 poses. Hats and trails drawn from the cosmetic ids in
  `src/content/ids.ts` (8 hats, 5 trails), so the garage can show them.
- **Respawn.** The "big hand" lifts the kart and sets it down (1.2 s), with a fade and a sound cue event.
- **Camera.** Implements the `CameraMode` contract: `chase`, `flyover` (follows `TrackDef.flyover`, tap to skip),
  `finishOrbit` (180° over 3 s at 3 m), `podium`, `attract`, `lookBack`. Distance fade of near karts (B59), near
  plane check, FOV kick 6° → 10° on boost, smoothed look-ahead in drifts.
- **Post-processing** (lazy, per quality tier in `juice/perf/quality.ts`): single-pass bloom (half-res threshold,
  2-tap blur, composite: 3 draw calls), vignette and saturation on boost. Off on the low tier.
- **Particles.** Drift sparks in tier colours from `driftTierColors()` (`src/ui/a11y.ts`), dust on offroad,
  splashes on low grip, landing puffs, coin shards, all pooled InstancedMeshes.

Acceptance: 72-race harness meets the spread and podium targets; the replay determinism test passes; frame time on
the reference phone profile within budget with bloom on the high tier; draw calls ≤ 120.

### Lane "progression"

Owns: `src/progression/**` (economy, unlocks, achievements, stats, garage screen, rival picker, daily challenges,
save slot and migration), `src/content/cosmetics.ts` (prices and unlock rules; ids are frozen),
`src/ui/strings/progression.en.ts`, `e2e/progression.spec.ts`. Appends inside `src/share/`: only
`share/pinkpaw/unlocks.ts` (new file: which roster cats are playable and when).

Builds:

- **Fish coins economy** (no real money anywhere): fish earned per race = coins held at the finish (max 10) +
  coins picked up during the race + place bonus 10/8/6/5/4/3/2/1 (×1.0 / 1.25 / 1.5 by class); TT medals 15/10/5;
  battle win 15. A typical race earns 15–30 fish.
- **Unlocks:**

  | Unlock | Rule |
  |---|---|
  | 100cc | finish any 50cc cup |
  | 150cc | podium in a 100cc cup |
  | Mirror | gold in the Kibble Cup at 150cc |
  | Catnip Cup | any Kibble Cup trophy |
  | Battle | finish 3 races |
  | Time Trial | from the start |
  | Bodies Laundry Basket / Roomba / Teacup | 200 / 400 / 600 fish (Tuna Can, Shoebox, Sardine F1 free) |
  | Hats (8) | 60–250 fish each |
  | Trails (5) | one per first podium on a track group, per GDD 7 |
  | Pink Paw cats as playable | one per cup trophy, shown with "as of 2026-10-04" |

- **Achievements** (24, local, toast plus a page): First Pounce, Pink Turbo (tier-3 mini-turbo), Untouchable
  (finish with no hits taken), Comeback (8th to 1st in one race), Revenge (hit your rival), Collector (10 coins
  held), Ghostbuster (beat a dare ghost), Shortcut Scout (every alt route), Gold Kibble, Gold Catnip, Medal Hunter
  (all TT golds), Last Cat Standing (battle win), Pacifist (win with no items used), Air Cat (5 tricks in a race),
  Slipstreamer, Daily Devotee (7-day daily streak), and so on. Each defined by a pure function over `RaceStats`
  plus the save, so it is unit-tested.
- **Stats page:** races, wins, podiums, distance driven, hits dealt and taken, mini-turbos by tier, best laps per
  track and class, favourite body, record against each rival.
- **Garage** (lazy screen): bodies with stat bars, paint presets, number, hats, trails; buy with fish; preview
  turntable (feel's `KartView`).
- **Rival system:** picks a rival per GP and per Daily Cup (highest-skill AI that was not the last rival), sets
  `RacerInfo.rival`, shows "RIVAL: name" chips, keeps a head-to-head record.
- **Daily challenges** (separate from the Daily Cup): 3 per UTC day from a seeded pool ("pink mini-turbo 5 times",
  "collect 30 fish", "win at Laundry Spin"), 30–60 fish each, streak counter.
- **Results sections:** registers "fish earned", "next goal" ("120 fish to Roomba"), "achievements unlocked" and
  "challenge progress" via `registerResultSection`.
- **Save and migration:** the `progression` slot of `save.ts`. Migrates v1 `progress` (races, unlocked class,
  best times) on first load; existing players keep their classes.

Acceptance: unit tests for every unlock rule, achievement and migration; e2e: earn fish, buy a hat, see it in a
race; an old v1 save loads with its class unlocks.

### Lane "audio-ui"

Owns: `src/juice/audio/**`, `src/juice/index.ts`, `src/core/hud/**`, `src/ui/**` except `src/ui/i18n.ts` (API) and
the other lanes' `src/ui/strings/*.en.ts`, `src/ui/strings/core.en.ts`, `e2e/a11y.spec.ts`, `review/**`.

Builds:

- **Music:** one song per track (6) plus arena, menu, podium and results stings (the 4 existing `SONGS` are reused
  or reworked), a final-lap tempo lift, ducking under the announcer.
- **Announcer meows** (formant synth in `voices.ts`): countdown "mrrp, mrrp, mrrp, MEOW!" rising, "FINAL LAP!",
  lead, ouch, new record, win jingle, lose "mrrrow", battle "balloon popped" and "out!". Own channel at priority 3
  in the voice budget; subtitles when captions are on.
- **SFX:** a distinct sound for each of the 8 items (use, travel, hit), coin pling that rises with the streak,
  each hazard, respawn hand, UI hover / confirm / back, unlock and achievement stingers.
- **HUD redesign:** big place badge with a flip on change, lap counter, item slot with the roulette, coin counter,
  mini-map with rival and incoming-item markers, edge arrows for incoming items, TT splits, battle balloons and
  timer, GP race index. Portrait and landscape layouts, safe areas. Renders from `HudModel` (section 3.7).
- **Menu UI kit** (`src/ui/kit/**`, API frozen by Stabilise): tokens (colours, type scale, radii, shadows),
  buttons, tiles, panels, lists, toggles, sliders, tabs, toasts, modal, sticky action footer, focus ring. Every
  lane's screens restyle automatically.
- **Transitions:** paw iris wipe between screens (0.35 s; a cross-fade under reduced motion), results count-up,
  place stamp.
- **Accessibility:** reduced motion (no shake, no FOV kick, no flashing, softer transitions), colourblind drift
  tier colours (deuteranopia and protanopia safe sets plus shape cues on the HUD), high-contrast HUD, text size,
  separate music / SFX / announcer volumes, haptics toggle, captions for announcer lines, focus order, ARIA labels,
  44 px targets.
- **Strings:** every visible string through `t()`; `en` ships; a pseudo-locale (`?lang=xx`) used by
  `e2e/a11y.spec.ts` to find unlocalised text.
- **Touch extras:** small brake / look-back button bottom left (GDD 2.1), optional.

Acceptance: e2e with `?lang=xx` finds no raw strings; axe-style checks (labels, contrast) on the menu, HUD and
results; reduced-motion run has no camera shake events; audio voice budget never exceeds 24.

## 3. Shared contracts (Stabilise part B, before lanes branch)

Stabilise adds all of this with stubs and minimal working defaults, so each lane only fills in or appends.
Everything in this section is frozen once the lanes branch.

### 3.1 `src/types.ts`

- `SIM_VERSION = 4`.
- `RaceMode = 'race' | 'gp' | 'tt' | 'battle' | 'daily' | 'dare'`; `RaceConfig.mode: RaceMode` (default `'race'`),
  `RaceConfig.timeLimitTicks?` (battle), `RaceConfig.cupId?`, `RaceConfig.raceIndex?`.
- `TrackDef` (still `v: 1`, new fields optional so UGC v1 codes and ghost headers are unchanged):
  `kind?: 'circuit' | 'arena'`, `branches?: TrackBranch[]`, `hazards?: HazardSpot[]`,
  `coins?: CoinRow[]`, `flyover?: FlyoverKey[]`, `music?: number`.
  - `TrackBranch { from: number; to: number; points: TrackPoint[]; surface?: 'road' | 'offroad' | 'lowgrip'; label?: string }` (`from`/`to` in 0..255 lap fractions).
  - `HazardSpot { kind: HazardKind; s: number; side?: -1 | 0 | 1; period?: number; phase?: number; branch?: number }`.
  - `HazardKind = 'roomba' | 'laundry' | 'milk' | 'toaster' | 'steam' | 'drum'` (adding a kind later is a contract request to the integrator).
  - `CoinRow { s: number; d: number; count: 3 | 4 | 5; branch?: number }`.
  - `FlyoverKey { x: number; y: number; z: number; lx: number; ly: number; lz: number; t: number }`.
- `ThemeId` widened to `0..7` (4 café, 5 shelter, 6 arena rug, 7 reserved).
- `KartLook.body: BodyId` (0..5). `RacerInfo.rival?: boolean`, `RacerInfo.hat?: number`, `RacerInfo.trail?: number`.
- `KartState` new fields (all hashed): `lapMax`, `lapStartPrev`, `coins`, `balloons`, `out` (battle), `itemBuf`
  (buffered press ticks), `itemBufBack`, `wrongTicks`, `branch` (−1 main), `hitMask` lives on the laser record, not
  the kart.
- `RaceState.hazards: Record<string, unknown>` and `RaceState.mode: Record<string, unknown>` (plain-data slots like
  `items`), `RaceState.coins: number[]` (respawn timer per coin, 0 = available).
- `RaceEventType` additions: `coin` (a = coins held), `coinLoss` (a = dropped), `hazard` (a = HazardKind index,
  b = hazard id), `wrongWay`, `checkpoint` (a = index, b = ticks), `balloonPop` (b = attacker), `balloonSteal`
  (b = thief), `eliminated`, `grudge` (b = target), `trickLand` (a = pose), `respawnStart`, `itemFizzle`.
- `RaceResult` additions: `mode`, `coins` (player), `stats: RaceStats` (3.8), `battle?: { balloons: number[]; out: number[] }`, `splits?: number[]`.

### 3.2 `src/content/ids.ts` (frozen ids; numbers and prices live in the owning lane's file)

- `TRACK_IDS = ['kitchen', 'rooftops', 'laundry', 'yarn', 'cafe', 'shelter'] as const`, `ARENA_IDS = ['rug']`.
  Stabilise adds stub `TrackDef`s for the four new ids (a simple valid loop each, theme set) so modes can build
  cups and menus on day one; tracks replaces them.
- `BODY_IDS`: 0 Tuna Can, 1 Shoebox, 2 Sardine F1, 3 Laundry Basket, 4 Roomba, 5 Teacup.
- `HAT_IDS` 0..8 (0 none): crown, beanie, bow, top hat, propeller, chef, party, pirate.
- `TRAIL_IDS` 0..5 (0 none): sparkle, fish bones, hearts, paw prints, rainbow.
- `CUP_IDS = ['kibble', 'catnip']`, `ACHIEVEMENT_IDS` list (24 strings; progression defines them).
- `src/content/karts.ts` (feel owns the numbers): `KART_BODIES: Record<BodyId, { name: string; speed: 1..5; accel: 1..5; handling: 1..5; weight: number }>` with the table from section 2 (Stabilise seeds it and applies it in the sim so ghosts carry it).

### 3.3 Sim plugin hooks (`src/core/sim/plugins.ts`, `world.ts`)

```ts
interface SimPlugins {
  ai: AIDriver;
  items: ItemSystem;
  hazards?: HazardSystem;   // tracks lane
  mode?: ModeRules;         // modes lane (battle, tt)
}
interface HazardSystem { init?(ctx): void; step(ctx): void; hash?(st, h): number }
interface ModeRules {
  init?(ctx): void;
  /** after items.step: battle balloons, eliminations, time limit */
  step?(ctx): void;
  /** called by applyHit when a hit lands */
  onHit?(ctx, victim: number, by: number, kind: HitKind): void;
  /** called by contacts with the pair and relative speed */
  onBump?(ctx, a: number, b: number, vrel: number): void;
  /** true ends the race (sets phase 'done') */
  isOver?(ctx): boolean;
  /** item weight row override (battle, tt) */
  itemRow?(ctx, k: number): readonly number[] | null;
  hash?(st, h): number;
}
```

- `registerHazard(kind: HazardKind, def: HazardDef)` in `src/tracks/hazards/registry.ts` (stub file, tracks owns the
  content). `createSimPlugins(cfg)` reads the registry and `cfg.mode`.
- Tick order becomes: countdown → inputs (with item buffer) → item use → kart physics → contacts (+ wall re-clamp)
  → slipstream → coins → item boxes → `items.step` → `hazards.step` → `mode.step` → laps (skipped for arenas)
  → positions → `mode.isOver`.
- `kind: 'arena'` disables laps, wrong-way and the distance watchdog (a speed-only stuck check replaces it).
- `queryTrack` returns `{ i, s, d, y, wallL, wallR, surface, branch }`; `kart.ts` reads walls and surface only from
  it, so branches need no `kart.ts` change. `ArenaQuery` helpers (`nearestKart`, `dirTo`) in `core/sim/arena.ts`.

### 3.4 Coins (Stabilise implements the sim rule in `core/sim/coins.ts`)

Pickup radius 1.3 m; a picked coin respawns after 10 s; `KartState.coins` capped at 10; each held coin adds
+0.5 % top speed (multiplier read through `tuning.ts` `COINS`, feel may tune); a spin or leap drops 3 (scatter is a
visual only). Events `coin` and `coinLoss`. `BuiltTrack.coins` expanded from `TrackDef.coins` in `build.ts`.

### 3.5 App shell, screens and flow

- `src/core/app/screens.ts`: `type ScreenId = 'title' | 'menu' | 'select' | 'class' | 'cup' | 'standings' | 'podium' | 'tt' | 'battle' | 'garage' | 'achievements' | 'stats' | 'settings' | 'howto' | 'results' | 'pause' | 'tracks' | 'editor' | 'yourcat' | 'pinkpaw' | 'rewards'`;
  `registerScreen(id, loader: () => Promise<{ mount(root: HTMLElement, params): ScreenHandle }>)`;
  `screens.push(id, params)`, `screens.replace`, `screens.pop`, one overlay stack (fixes B46). Lazy by default.
- `Shell` exposes `startRace(cfg: RaceRequest): Promise<RaceOutcome>` (resolves after results are dismissed or
  the player quits) so modes can chain GP races, `pause(on: boolean)`, `quitToMenu()`, `setCameraMode(m)`,
  `hudExtras(model)`.
- `src/core/app/app-bus.ts`: typed meta events, separate from the race `JuiceBus`:
  `screen`, `raceStart { mode, trackId, cls, cupId? }`, `raceEnd { result, stats, mode }`, `cupEnd { cupId, cls, place, points }`,
  `unlock { kind, id }`, `achievement { id }`, `fishEarned { amount, reasons }`, `purchase { kind, id, cost }`,
  `settingsChanged`. `appBus.on(type, fn)` returns an unsubscribe.
- `registerResultSection(order: number, render: (ctx: ResultCtx) => HTMLElement | null)` in `core/hud/results.ts`
  (API frozen, look owned by audio-ui).
- `src/lanes.ts` gets its five lines up front: `installModes`, `installTracks`, `installFeel`,
  `installProgression`, `installAudioUi`, each in a stub `install.ts` inside the lane's folder (`src/modes/`,
  `src/tracks/`, `src/core/render/install.ts` for feel, `src/progression/`, `src/ui/`).

### 3.6 UI kit API (`src/ui/kit/index.ts`, Stabilise ships plain working versions)

`button`, `tile`, `panel`, `list`, `toggle`, `slider`, `tabs`, `toast`, `modal`, `actionFooter`, `statBars`,
`h(tag, attrs, children)`; `focusNav(root)` for arrows / D-pad / stick, A or Enter or Space confirm, B or Esc
back, Start pause, Select restart. CSS custom properties in `src/ui/tokens.css` (audio-ui restyles them).

### 3.7 HUD

`hud.say(text, { prio: 0..3, ms, sub? })`: one centre slot; a higher priority replaces, a lower one waits or drops.
`HudModel` fields beyond v1: `coins`, `rival?`, `balloons?`, `timeLeft?`, `splits?`, `gpRace?`, `incoming[]`,
`mode`. Modes and progression set their fields via `shell.hudExtras`; audio-ui renders them.

### 3.8 Race stats (`src/core/app/race-stats.ts`)

`RaceStats` built from the event log for every kart: hits dealt and taken, mini-turbos by tier, pounce,
tricks, coins picked, items used, overtakes, best place gain, wall hits, respawns, slipstreams, shortcuts taken,
battle pops and steals. Progression's achievements and stats read only this.

### 3.9 Save (`src/core/app/save.ts`)

Versioned blob `{ v: 2, settings, slots: Record<string, unknown> }` in one localStorage key, wrapped in try/catch.
`save.slot<T>(name, defaults, migrate?)` per lane (`modes`, `progression`, `audio-ui`); Stabilise migrates v1
`settings` and `progress` keys into it once, keeps the v1 keys for a release. Settings gain `musicVol`, `sfxVol`,
`voiceVol`, `colourblind: 'off' | 'deut' | 'prot' | 'trit'`, `highContrast`, `textScale`, `captions`, `haptics`,
`lang`.

### 3.10 Strings and accessibility

- `src/ui/i18n.ts`: `t(key, vars?)`, `registerStrings(locale, table)`; each lane owns
  `src/ui/strings/<lane>.en.ts` and registers it in its install.
- `src/ui/a11y.ts`: `driftTierColors(): readonly [number, number, number]`, `reducedMotion()`,
  `onA11yChange(fn)`; content (colour sets) owned by audio-ui.

### 3.11 Camera

`CameraMode = 'chase' | 'lookBack' | 'flyover' | 'finishOrbit' | 'podium' | 'attract'` on `ChaseCamera.setMode(m,
params)`; Stabilise ships `chase` and `lookBack`, the rest fall back to chase until feel implements them.

### 3.12 Ghost and dare compatibility

Ghost header v4 adds the player's `BodyId` and `RaceMode`. v3 links open as a target-time race with the existing
notice. The integrator's final bump to v5 keeps the same header layout so v4 links (made only on unpublished
branches) also fail gracefully.

## 4. Integration

1. Merge feel → tracks → progression → modes → audio-ui into `feat/formula-meow`, resolving only the golden hash
   file (regenerate).
2. Bump `SIM_VERSION` to 5, regenerate goldens, rerun the 72-race harness and each lane's acceptance.
3. Bundle: initial JS ≤ 450 kB gzip (`tools/budget.mjs`); draw calls ≤ 120 and no texture or geometry growth over
   12 restarts on every track.
4. Play-test pass at 390×844 touch, 1440×900 keyboard and a simulated gamepad: title → GP → podium, TT, battle,
   daily, dare link, editor → race it. Screenshots into `review/`.
5. `npm run build:client`, commit `client/public/formula-meow-game` and the source together, update
   `formula-meow/README.md` and `LANES.md` for the new modules. Do not push.

## 5. What shipped (final verification, 2026-10-20, branch `feat/formula-meow`)

Shipped on top of the integration (64e19883) and two play-test rounds (f7d0e3aa, 10f096b8, 8426e880), checked end to
end by `npm run review:v2` (every mode and screen at 1440×900 keyboard and 390×844 touch, starting from a v1 save).

- **Menus and flow:** title over a live attract race, main menu (Grand Prix hero card, four race modes, an 8-tile
  strip), racer select (cat, kart, paint), class and cup pickers, pause, settings (sound, controls, accessibility),
  how to play, paw-iris transitions. Keyboard, gamepad and touch on every screen. A first visit still opens straight
  on the grid.
- **Modes:** Grand Prix (2 cups × 4 races, points, animated standings, podium, trophies, a named rival, resume a cup),
  Single race (any of 6 tracks, any unlocked class), Time Trial (personal-best and dev ghosts, splits, medals),
  Balloon Battle (2:30 points round on the Living Room Rug), Daily Cup (one seeded race per UTC day, rival
  head-to-head), Track Doodle races.
- **Content:** 6 circuits (Kitchen Counter, Neon Rooftops, Laundry Spin, Yarn Canyon, Cat Café Chaos, Pink Paw
  Shelter Sprint) each with an alternative route, hazards, fish coins and ramps; 1 battle arena; 4 classes
  (50/100/150cc and Mirror); 6 kart bodies; paints, 8 hats, 5 trails; 8 items.
- **Progression:** in-game fish only (no money), Garage, 24 achievements, daily challenges, stats, Pink Paw cats
  unlocked by trophies, class/cup/mode unlocks, a welcome-back bonus for v1 saves.
- **Feel and presentation:** hop, 3-tier drift and mini-turbo, Pounce Start, ramp tricks, per-body handling, AI item
  use with a capped rubber band, flyover, respawn hand, particles, bloom on fast devices, confetti podium, 8 synth
  songs, a cat announcer with captions.
- **Sharing:** dare links (ghost in the hash, graceful notice for broken or old links), track codes (graceful
  "This track link is broken" dialog), the Daily Cup link, 12 s vertical clip, your own cat from a photo (stays on
  the device), Pink Paw adopt line dated "as of 2026-10-04".

Final-pass fixes (this commit): the phone menu strip cut "Track Doodle" and "Pink Paw" to "Track …" / "Pink P…" (they
now wrap to two lines); the podium footer cut "Next cup ▶" to "Next cu…" at 390 px (now wraps). Added
`npm run review:v2` (`formula-meow/review/v2.review.spec.ts`, own build dir and port).

Verified: `tsc` clean; vitest 406/406; build with initial JS 333 kB gzip of the 450 kB budget; draw calls at most 77
on any circuit and 90 on the arena (1440×900 and 390×844); v1 `fm:progress`/`fm:settings` migrate into `fm:save`
(unlocks, races, best times, class, mute) and the v1 keys stay; production routes `/meow-race`, `/make`, `/d/N`,
`/t?t=`, `/r#g=` served through the `client/next.config.js` rewrites with no 404s or console errors; the client
config loads and its 13 redirects are unchanged; no `funding/`, Telegram or `*_ENABLED` references in the game; copy
claims nothing about donations.

Known gaps: see `formula-meow/README.md` "Known gaps".
