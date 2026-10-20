# Formula Meow: lanes and extension points

GDD: `docs/plans/formula-meow/GDD.md` (section 16 has the layout). Iteration 2 plan:
`docs/plans/formula-meow/ITERATION-2.md`.

## Iteration 3: set pieces (current)

Plan: `docs/plans/formula-meow/SETPIECES.md`. The Engine step (one commit on `feat/formula-meow`, `SIM_VERSION` 7 → 8,
golden hashes regenerated) added the set-piece contract below and one reference example of each kind on Kitchen
Counter. Four lanes follow in parallel (tracks-A, tracks-B, juice, ai-ugc); each edits only its own files (SETPIECES.md
section 13). No lane edits `SIM_VERSION`, `types.ts`, `hash.ts`, `core/sim/stunt.ts` or `core/track/stunt.ts`: write a
contract request instead. Lanes may update the golden hashes on their branch; the integrator regenerates them.

### Contract (Engine step)

| What | Where |
|---|---|
| `TrackDef.setPieces?: SetPiece[]` `{ kind: 'loop' \| 'wall' \| 'jump' \| 'tunnel', s, len?, side?, gap?, drop?, skin? }`, `SET_PIECE_KINDS` (event `a` index), `Surface.WallRide = 6`, `BoostSource.Stunt = 7`, events `stuntEnter` (a kind, b piece), `stuntExit` (a kind, b 1 = clean), `stuntLand` (a air ticks, b piece), `netCatch` (b piece); `KartState.rail / su / sd / netTicks / gapLaunch / laneTicks` (hashed) | `src/types.ts`, `src/core/sim/hash.ts` |
| All numbers: `STUNT` (loop zone 44 m + 10 m strip, radius 6.5, drift 0.45 R, sway 4.7 m, floor 0.75 × top, rail 1.35 × own top, exit 1.35 for 1.3 s; wall lane 6 m + 16 m tapers, 1.15 boost, 1 m/s magnet; jump aim 5 m, window 16 m, floor 0.75, T 0.55–1.0 s, magnet 3 m/s, clean ≤ 25° → 1.2 for 0.5 s, net 0.4 s hold, placed 4 m past the far lip at 0.7 × top) | `src/tuning.ts` |
| Build: `planPieces` / `flattenForPieces` / `placePieces` (called by `buildTrack`); `BuiltTrack.pieces` (`BuiltPiece`: `i0`, `i1`, `strip`, `land0..land1`, `aimI`, `lipY`, `landY`, `end`, `side`...), `pieceAt`, `gapMask`, `tunnelMask`, `laneL` / `laneR`, `pieceIssues`; `LOOP_SHAPE`, `ribbonLocal`, `LOOP_LP`, `LOOP_K`; `pieceAtSample`, `respawnSampleOf`, `inTunnel` | `src/core/track/stunt.ts` |
| Sim rules: `stuntImmune(k)` (rail, gap flight, net: no hits, no contacts, items pass), `tryAttachRail` / `stepRail` / `railNudge`, `stepLane` / `laneAt`, `lipCrossed` / `launch` / `airAssist` / `landed`, `checkNet` / `hitsLipFace` / `stepNet` | `src/core/sim/stunt.ts` (called from `kart.ts`; contacts, slipstream, coins, item use and `items-ai/items/hits.ts touchable` respect them) |
| Query: `Surface.WallRide` past the road edge where a lane is; the canyon floor (`py − VOID_DROP`) over a gap | `src/core/track/query.ts` |
| Render pose: `kartStuntPose(track, kart, out)` → position + up / forward on a loop's ribbon or a curled lane (null elsewhere); `ribbonPose`, `ribbonLocalAt`, `shadowToWorld`, `lanePose`, `curlAt` | `src/core/render/stunt-pose.ts` |
| Drawing: `RaceView.capture` / `lerpKart` carry the bent pose (`KartSnap.b`, `ux..fz`), `RaceView.displayBasis(i, out)`; `KartView.update(..., basis)`; the blob shadow lies on the bent surface; ghosts (tt, dares) too | `src/core/render/{race-view,kart-view}.ts` |
| Generic geometry for all four kinds, merged into `track-solid` / `track-glow`, plus one `track-nets` mesh per track with a gap; `segmentInGap`, `laneSide`, `curlPoint` | `src/core/track/stunt-mesh.ts` (`mesh.ts` skips the deck over gaps and the kerb / barrier beside lanes) |
| Skins: `registerPieceSkin(theme \| '*', kind, skin, draw)`; `draw(ctx)` adds to `ctx.solid` / `ctx.glow` (or one Object3D per track to `ctx.group`), returns true to replace the generic look | `src/tracks/skins/registry.ts`; tracks-A appends to `skins/a.ts`, tracks-B to `skins/b.ts` (both pre-wired in `skins/index.ts`) |
| Camera: on a loop the rig rides the ribbon behind the kart and the up follows the surface (0.15 s ease, ≤ 240°/s); a wall lane rolls half the curl (≤ 35°) from the road side; tunnels keep under the ceiling; reduced motion = world up and a still TV camera beside a loop. `CameraSource.displayBasis?`, `STUNT_CAM`, `ChaseCamera.upVector` | `src/core/camera/chase-camera.ts` (juice tunes the feel on top: FOV, shake, callouts) |
| Dressing: `pieceClear(track, x, z)`; `clearance()` already folds it in, so scattered props keep off the pieces | `src/core/track/dressing/common.ts` |
| Validator stub `validateSetPieces(def, built?)` (today: the build's `pieceIssues`, code `pieces`) | `src/ugc/editor/validate.ts` (ai-ugc fills in the rules) |
| Fixture `stuntLab()`: the test oval with one of each piece (jump s24, tunnel s50, wall s92, loop s160) | `src/test/fixtures.ts` |

### Rules the lanes can rely on (tested)

- A 50cc kart with auto-gas clears every piece with zero steering (from 6, 18 and 24 m/s), with a noisy thumb (3 seeds)
  and as the phone bot (skill 0.2, 3 laps): no respawn, no net, no head-on (`src/core/sim/stunt.test.ts`).
- The loop is lap-time neutral (±0.3 s; measured −0.02 to 0.00 s in all classes), keeps laps exact, and never evens out the field (the rail
  runs at the kart's own top speed × 1.35, rubber band included). The aimed arc lands within ±1.5 m of the target for
  0–43 m/s and drops 0–2.5 m; the net costs ≤ 0.8 s. Hits pass railed and flying karts.
- A wall lane's taper and outer rail are soft from the first centimetre: the velocity is turned along the rail at the
  same speed (no graze loss, never a head-on), so steering hard onto the lane mouth costs nothing. Kitchen Counter's
  reference pieces pass the phone bot at 50, 100 and 150cc on 3 seeds (3 loops, 3 clean landings, no respawn or net).
- Camera comfort limits and reduced motion (`src/core/camera/stunt-camera.test.ts`); finite geometry and ≤ 1 extra draw
  call per track (`src/core/track/stunt-mesh.test.ts`); placement rules and masks (`src/core/track/stunt.test.ts`).
- Kitchen Counter carries the reference pieces (wall s33, jump s116 gap 12 drop 1.5 replacing the s119 ramp, tunnel
  s196 with the pad moved to s205, loop s217 with the toaster moved to s212). tracks-A owns their final placement.

### Known gaps for the lanes

- ai-ugc: track code v3 (`codec/track-code.ts` drops set pieces today; its round-trip test ignores them), the full
  validator, AI on the wall lane (`lineWall`), no drift starts near a loop or lip, item-brain skipping immune karts,
  `branch-ai` counting stunt times, the editor stickers, `e2e/setpieces.spec.ts` on all six tracks.
- juice: FOV and audio in tunnels (`tunnelMask`), callouts on the stunt events, minimap icons, the "Stunts" result row.
- tracks-B: the Yarn branch gap still sends a kart back to the fork (`tracks/hazards/rules.ts`); kickers and half-pipes
  on the rug arena (`jump` with `gap: 0` builds a full-width aimed ramp; `wall` side 0 is built but arenas skip walls).

## Iteration 2

Stabilise (one commit on `feat/formula-meow`) fixed the bug list (B1–B62, `SIM_VERSION` 3 → 4) and added the shared
contracts below. Five lanes then branch from it (`lane/fm2-modes`, `-tracks`, `-feel`, `-progression`,
`-audio-ui`); each edits only the files it owns and appends to registries instead of editing shared files. One
integrator merges feel → tracks → progression → modes → audio-ui, bumps `SIM_VERSION` 4 → 5 once and regenerates the
golden hashes (`src/core/sim/race.test.ts`), the only expected merge conflict.

A lane that needs a change outside its files writes a **contract request** in its final report; the integrator
applies it. Lanes never edit `SIM_VERSION`.

### Frozen after Stabilise (integrator only)

| Path | What |
|---|---|
| `src/types.ts` | `RaceMode`, optional `TrackDef` fields (`kind`, `branches`, `hazards`, `coins`, `flyover`, `music`), `KartState` iteration-2 fields (`lapMax`, `lapStartPrev`, `coins`, `balloons`, `out`, `itemBuf`, `itemBufBack`, `wrongTicks`, `branch`), `RaceState.hazards` / `.mode` / `.coins` / `.pairs`, new event types, `RaceResult.mode` / `.coins` / `.stats` / `.battle` / `.splits`, `RaceStats`, `BodyId`, `RacerInfo.rival` / `.hat` / `.trail` |
| `src/lanes.ts`, `src/main.ts` | the five lanes' install lines are pre-wired |
| `src/core/sim/{world,race,hash,replay,plugins,rng,fixed,coins,mode-registry,arena,harness}.ts` | tick order, race rules, hashing, `SimPlugins` (`hazards?`, `mode?`), coin rule, `registerModeRules`, `nearestKart` / `dirTo` |
| `src/core/app/{shell,screens,app-bus,save,storage,settings,race-stats}.ts` | `startRace` / `pause` / `quitToMenu` / `setCameraMode` / `hudExtras`, `registerScreen` + `screens`, `appBus`, `save.slot(name, defaults, migrate)`, `buildRaceStats` |
| `src/content/ids.ts` | track, arena, body, hat, trail, cup and achievement ids |
| `src/share/**` | except `share/pinkpaw/unlocks.ts` (progression) |
| `src/core/input/**` | keyboard, gamepad, touch, mux |
| `src/ui/i18n.ts`, `src/ui/a11y.ts` (API), `src/ui/kit/index.ts` (API) | `t()`, `registerStrings`, `setA11y`, `driftTierColors()`, the kit helpers and `focusNav` |
| `src/tracks/hazards/registry.ts` (API) | `registerHazard`, `createHazardSystem` |
| `src/core/hud/results.ts` (API), `src/core/hud/hud.ts` (`say`, `HudModel` API) | `registerResultSection`; the look is audio-ui's |
| `index.html`, `vite.config.ts`, `package.json`, `playwright.config.ts`, `tools/budget.mjs` | `npm run build` fails over 450 kB initial JS gzip |
| `src/core/sim/race.test.ts` | golden hash: lanes may update it on their branch, the integrator regenerates it |

### Lanes

New modules by lane: modes `src/modes/{flow,hooks,store,boot,results}.ts`, `modes/{gp,tt,battle,hud,stage,screens}/`;
tracks `src/core/track/branch*.ts`, `src/core/track/tracks/extras.ts`, `src/tracks/{hazards,view}/`; feel
`src/core/render/{hats,particles,respawn-hand,kart-bodies,glyphs}.ts`, `src/core/render/actors/`, `src/juice/perf/post.ts`; progression
`src/progression/**`; audio-ui `src/juice/audio/**`, `src/core/hud/**`, `src/ui/screens/{settings,howto}.ts`.

| Lane | Owns | Install |
|---|---|---|
| modes | `src/modes/**`, `src/content/cups.ts`, `src/ui/strings/modes.en.ts`, `e2e/modes.spec.ts` | `src/modes/install.ts` |
| tracks | `src/core/track/**` (build, query, spline, racing line, mesh, themes, dressing, tracks incl. `tracks/stubs.ts`), `src/tracks/**` (hazard sims and views, coin view, flyover paths), `src/ugc/**`, `src/ui/strings/tracks.en.ts`, `e2e/tracks.spec.ts` | `src/tracks/install.ts` |
| feel | `src/core/sim/{kart,contact,autopilot}.ts`, `src/core/render/**`, `src/core/camera/**`, `src/juice/vfx/**`, `src/juice/{feel,time,haptics}.ts`, `src/juice/perf/**`, `src/items-ai/**`, `src/tuning.ts`, `src/content/karts.ts` (numbers), `src/ui/strings/feel.en.ts`, `e2e/feel.spec.ts` | `src/core/render/install.ts` |
| progression | `src/progression/**`, `src/content/cosmetics.ts`, `src/share/pinkpaw/unlocks.ts`, `src/ui/strings/progression.en.ts`, `e2e/progression.spec.ts` | `src/progression/install.ts` |
| audio-ui | `src/juice/audio/**`, `src/juice/index.ts`, `src/core/hud/**` (look), `src/ui/**` except the frozen APIs and the other lanes' string tables, `src/ui/strings/core.en.ts`, `e2e/a11y.spec.ts`, `review/**` | `src/ui/install.ts` |

### Extension points (Stabilise)

- **Sim plugins** (`src/core/sim/plugins.ts`): `SimPlugins = { ai, items, hazards?, mode? }`, built per race by
  `createSimPlugins(cfg)` (`src/items-ai/index.ts`) from the hazard registry and `registerModeRules(mode, factory)`.
  Tick order: countdown → inputs (item buffer) → item use → kart physics → contacts (+ wall re-clamp) → slipstream →
  coins → item boxes → `items.step` → `hazards.step` → `mode.step` → laps (skipped on arenas) → positions →
  `mode.isOver`. `applyHit` calls `mode.onHit`; contacts call `mode.onBump`; the item roll asks `mode.itemRow`.
- **Arenas**: `TrackDef.kind = 'arena'` turns off laps, wrong way and the distance watchdog (a still-and-stuck check
  replaces it); the race ends at `RaceConfig.timeLimitTicks` or `mode.isOver`. Stub arena: `rug`.
- **Track query**: `queryTrack` returns `{ i, s, d, y, surface, wallL, wallR, branch, ramp }`; `kart.ts` reads walls
  and surface only from it, so branches need no kart change.
- **Coins**: `TrackDef.coins` rows → `BuiltTrack.coins`; the sim rule is `core/sim/coins.ts` (1.3 m pickup, 10 s
  respawn, max 10 held, +0.5 % top speed each via `COINS` in `tuning.ts`, a spin or leap drops 3).
- **Bodies**: `KartLook.body` (0..5) applies `content/karts.ts` stats in the sim (top speed, accel, yaw, contact
  weight); ghosts carry the body in the v2 ghost header (with the race mode).
- **Screens** (`core/app/screens.ts`): `registerScreen(id, loader)`, `screens.push / replace / pop / remove`; one
  stack, the layer below is hidden; every layer gets `focusNav` (arrows, D-pad, stick, A, B, Esc).
- **Shell** (`core/app/shell.ts`): `startRace(req)` → `Promise<RaceOutcome>` (resolves on Again / Next / Menu /
  quit), `pause(on)` (idempotent), `quitToMenu()` (needs a registered `menu` screen), `setCameraMode(m)`,
  `hudExtras(model)`, `updateSettings(partial)`. Pause and results are screens (`pause`, `results`).
- **App bus** (`core/app/app-bus.ts`): `screen`, `raceStart`, `raceEnd`, `cupEnd`, `unlock`, `achievement`,
  `fishEarned`, `purchase`, `settingsChanged`.
- **Results**: `registerResultSection(order, render)`; rows update live as karts finish.
- **HUD**: `hud.say(text, { prio, ms, sub, tone })` is the one centre message slot; `HudModel` via
  `shell.hudExtras`.
- **Save** (`core/app/save.ts`): one blob `fm:save` `{ v: 2, settings, slots }`; `save.slot('modes' |
  'progression' | 'audio-ui', defaults, migrate)`; the shell's `core` slot holds the v1 progress (migrated once).
- **Strings and a11y**: `t(key, vars)`, `registerStrings(locale, table)`, `?lang=xx` pseudo-locale; `setA11y`,
  `driftTierColors()`, `reducedMotion()`, `onA11yChange`.
- **Camera**: `ChaseCamera.setMode('chase' | 'lookBack' | 'flyover' | 'finishOrbit' | 'podium' | 'attract')`;
  Stabilise ships `chase` and `lookBack`, the rest fall back to chase until feel implements them.
- **Hazards** (`src/tracks/hazards/registry.ts`): `registerHazard(kind, { init?, step })`, state in
  `RaceState.hazards`, sim math only (the lint in `fixed.test.ts` covers `src/tracks/hazards` and `src/modes/battle`).

### Integration (iteration 2, done)

The five lanes are merged on `feat/formula-meow`. `SIM_VERSION` is 5, and the golden hash is regenerated.
`src/integration.ts` (installed last in `lanes.ts`) does the wiring the lanes could not do from their own files:

- **Unlocks:** the modes lane's menus ask the progression rules (`progression/api.ts`) through `setUnlockProvider`.
  This covers classes, Mirror, the Catnip Cup, Battle, owned bodies and hats, and the Pink Paw cats.
- **One loadout:** `ModesFlow.look` and `setLook` (`modes/flow.ts`) read and write the progression loadout. The racer
  select and the Garage edit the same body, paint, number, hat and cat. Paints are `PAINT_PRESETS`.
- **Rivals:** progression keeps a rival that the modes Grand Prix field already names (`progression/loadout.ts`).
  The ghost header's former reserved 4 bits now carry the rival slot + 1, so the shadow race of a Daily Cup dare
  drives the same rival AI (`share/codec/ghost-codec.ts`, `share/links/ghost-runner.ts`).
- **Single race:** a `race` screen (`modes/screens/race.ts`) and a menu tile, reached through the racer select.
- **Time trial medals** are paid by progression (`recordMedal`). `cupEnd` carries `mirror`.
- **HUD:** the race HUD (audio-ui) draws the battle clock, your balloons and the rival chip. The mode HUD keeps only
  the per-cat balloon list and the balloons over the karts.
- **Cosmetics:** `KartView` draws hats (named `fm-hat`) and `race-view` draws trails, and sets
  `root.userData.cosmetics`. Progression's fallback hat and trail stand down.
- **Battle:** the round ends on the 3:00 clock (`timeLimitTicks` is only the safety net), and the arena AI steers
  round the furniture (`track.blocks`).
- **Balance after the longer tracks:** the player bot dodges hazards and takes a faster branch the way an AI of
  its skill would (`hazardDodge` / `takesBranch` take a `botSkill`). It also lifts off when it is far off its line.
  The AI takes shortcuts less often (32 % skilled, 14 % others). The 50cc band is 0.83–0.96 and the 150cc floor
  is 0.81. Measured on all six tracks with 20 seeds each: 50cc bot podium 80–90 %, spread 10–14 s; 150cc podium
  20–50 % (mean 32 %), spread 5.5–9 s.
- **Shell and kit fixes:** `focusNav` reads the pad at mount and while its layer is hidden, so a held button is
  not a new press. A pause that is resumed before its layer loads takes the layer down again.

### Checks

`npx tsc --noEmit`, `npx vitest run` (includes the 72-race stabilise harness, `FM_HARNESS_PRINT=1` prints it),
`npm run build` (with the bundle budget), `npm run e2e`. The integrator also runs `npm run build:client` and commits
`client/public/formula-meow-game`.

---

## Iteration 1 (history)

The **core** lane was the M0 base: a playable race on two tracks. The other four lanes plugged in through the
interfaces below.

### Shared files (iteration 1)

| File | What |
|---|---|
| `src/types.ts` | `TickInput` (+ `packInput`/`unpackInput`), `TrackDef`, `KartState`, `RaceState`, `RaceEvent`, `RaceConfig`, `RaceResult`, `CatSpec`, `ItemId`, `HitKind`, `Modifier`, `SIM_VERSION` |
| `src/tuning.ts` | Every feel number from GDD 3–5: `CLASSES`, `PHYS`, `DRIFT`, `BOOST`, `HITS`, `RACE`, `ITEM_WEIGHTS`, `AI`, `TRACK`. Changing any number changes the sim: bump `SIM_VERSION` and update the golden hash in `src/core/sim/race.test.ts` |
| `src/lanes.ts` | One install line per lane, nothing else |

## Sim rules (all lanes that run inside the sim)

`core/sim`, `core/track` (except `mesh.ts`, `themes.ts`, `dressing/`) and `items-ai/` follow GDD 3.1: only
`+ - * /`, `Math.sqrt/floor/round/abs/min/max`, LUT trig from `core/sim/fixed.ts` (`sinL`, `cosL`, `atan2L`,
`pow06`), no `Math.random`, no `Date`, plain-data state. Randomness only from the kart streams
(`draw(kart, 'rngItems' | 'rngAi')`) or `RaceState.rngHazards`. `src/core/sim/fixed.test.ts` lints this.

## Lanes

### core (owner of this commit)
Owns `src/core/**`, `src/main.ts`, `index.html`, configs, `e2e/race.spec.ts`.
- `core/sim/world.ts` `SimWorld`: one fixed 60 Hz step per `step(humanInputs)`. Tick order: countdown → inputs →
  item use → kart physics → contacts → slipstream → item boxes → `items.step` → laps → positions.
- `core/sim/kart.ts`: `stepKart`, and the primitives other lanes call: `applyBoost(ctx, k, level, seconds, source)`
  (refresh, cap 1.35, Zoomies 1.40), `applyHit(ctx, k, 'spin' | 'leap' | 'wobble' | 'chase', by)` (returns false
  when a shield, Zoomies or respawn immunity blocks it), `startRespawn`, `placeOnTrack`, `speedOf`.
- `core/sim/autopilot.ts`: `followLine(ctx, k, out, bias)`, `curvatureAhead`, `aheadIndex` (Zoomies, AI, bots).
- `core/sim/replay.ts`: `ReplayRecorder` (10-bit packed inputs per tick), `simulate(cfg, plugins, replay)` → result
  plus a state hash every 60 ticks. Ghosts and clips re-simulate from this.
- `core/track/build.ts`: `buildTrack(def, modifiers)` → `BuiltTrack` (samples, frames, curvature, banking, walls,
  racing line, pads, ramps, boxes, query grid). `core/track/query.ts`: `queryTrack`. Authored tracks in
  `core/track/tracks/` (Kitchen Counter GP, Kaunas Neon Rooftops); add Laundry Spin / Yarn Canyon there.
- Render: `core/render/race-view.ts` (karts, boxes, shadows, spark pool with `emit`/`burst`), `kart-view.ts`,
  `world-view.ts` + `core/track/dressing/*`, copied cat rig (`cat-rig.ts` and friends, headers name the source).
- `core/app/shell.ts`: boot, loop, HUD, results, pause/settings. QA URL params: `?track=rooftops&cls=0..2&seed=N`,
  `?bot=1` (scripted player), `?speed=1..8` (sim speed, e2e only). `window.__fm` exposes the shell for tests.

### items-ai
Owns `src/items-ai/**`.
- Plugs in through `src/core/sim/plugins.ts`: `SimPlugins = { ai: AIDriver, items: ItemSystem }`, built per race
  by `createSimPlugins()` in `src/items-ai/index.ts`.
- `ItemSystem`: `roll(ctx, k)` at pickup (hidden for the 1.2 s roulette), `charges(item)`, `use(ctx, k, back)`,
  `step(ctx)` after physics (projectiles, traps, Laser Dot), `hash(st, h)` for its slot `RaceState.items`.
- All 8 items are registered in `items/defs.ts` (`ItemDef`s, `registerItem`); `items/registry.ts` rolls by the
  GDD 4.1 table and the effective position, skips items whose `blocked(ctx)` is true (Laser Dot: one active, 10 s
  race-wide cooldown, never two held) so a blocked roll is redrawn from the rest, and applies the daily modifiers
  (Cucumbers Only, Catnip Rain, Zoomies+, Box Party). `items/system.ts` is the `ItemSystem`.
- Item entities live in `RaceState.items.s` (`items/state.ts`, plain records, hashed by `hashItems`):
  projectiles (`projectiles.ts`: Hairball, homing Yarn ball, Laser Dot) and traps (`traps.ts`: Yarn tangle,
  Cucumber). `hits.ts` has the shared rules (`touchable`, the held-yarn shield, hit stats). Numbers: `ITEMS` in
  `src/tuning.ts`.
- Forward / back (`itemBack`): Hairball shoots forward or back; **Yarn forward is a homing yarn ball at the kart
  ahead** (back drops the tangle trap), and a ready Yarn that is held trails behind the kart and eats one hit from
  behind; Cucumber lobs ~18 m ahead (the thrower is immune to its own lobbed cucumber for 2.5 s after it lands) or
  drops back. Box = 3 s shield, Bell = 25 m wobble, Zoomies = 3 s autopilot at 1.40× that spins out anyone it
  touches, Laser Dot = chase on everyone it passes, spin on the leader (`laserWarn` drives the player's banner).
- AI: `ai/driver.ts` (line + bias + overtake offset, trap dodging with a per-trap skill roll, bend drifts, seeded
  mistakes, pounce start), `ai/item-brain.ts` (when to fire, hold or drop each item, GDD 5.2, half as eager more
  than 4 s ahead of the player), `ai/rubber-band.ts` (capped, never above the unboosted top speed),
  `ai/personalities.ts`, `ai/roster.ts` (Pink Paw field). Difficulty = the class (`CLASSES` skill band and band caps).
- Balance: `balance/bots.ts` `playerBot`, `balance/balance.test.ts` (Kitten podium ≥ 80 %), `balance/harness.ts`
  (place change, close finishes, per-item uses and hit rates). Full run:
  `FM_BALANCE_N=2000 npx vitest run src/items-ai/balance/harness.test.ts` prints the report.
- Views: `view/item-view.ts` (procedural meshes for every item, box shield with the cat's head poking out,
  Zoomies rainbow aura, Bell ring, "LASER DOT INCOMING" banner), installed from `src/lanes.ts` as a JuiceBus
  listener (`view/install.ts`); it reads the race state and never writes it. Note `items-ai/**` is linted with the
  sim math rules, so the view uses `sinL`/`cosL`/`atan2L` too.

### juice
Owns `src/juice/**`.
- `juice/bus.ts` `JuiceBus`: `onEvent(RaceEvent, FrameInfo)`, `onFrame(FrameInfo)`, `onReset()`. The shell drains
  the sim event log into it every frame. Add listeners with `shell.bus.add(...)` from `src/lanes.ts`.
- Seeds to replace or extend: `audio/starter-audio.ts` (engine purr, countdown, drift whine, whoosh, 128 → 140 BPM
  loop), `feel.ts` (trauma, bursts, haptics through injected hooks), `vfx/speed-lines.ts`.
- Camera feel (FOV kick, trauma shake, reduced motion) lives in `core/camera/chase-camera.ts`; call
  `addTrauma(v)`. Sparks: `RaceView.burst/emit`.
- Built (lane/fm-juice): `juice/index.ts` `installJuice(shell)` (one line in `src/lanes.ts`). `StarterAudio` is now an
  alias of `audio/race-audio.ts` (engine purr + 3 panned rivals, cat voices, item SFX, adaptive `audio/music.ts`,
  24-voice budget). VFX are one InstancedMesh each (`vfx/kart-fx.ts`), `vfx/speed-lines.ts` is the combined screen
  pass (`SpeedLines.current.flash/tint`), `vfx/sky-fx.ts`, `vfx/confetti.ts`, `vfx/popups.ts`. `perf/quality.ts`
  replaces `Stage.govern` (DPR + tier governors, AI outline LOD); `window.__fmPerf`, `?perf=1`, `?quality=`.
  Hit-stop / slow-mo go through `shell.timeScale(dt)` (marked `[juice lane]` in `core/app/shell.ts`).

### ugc
Owns `src/ugc/**`.
- `ugc/codec/track-codec.ts`: implement `TrackCodec { encode, decode }` with the copied bad-cat `bits.ts`,
  `crc16.ts`, `base64url.ts`, `text-filter.ts`, then `setTrackCodec(codec)` in `src/lanes.ts`. A decoded
  `TrackDef` races through `buildTrack` exactly like an authored one.
- Editor, validator (the rules are already asserted for authored tracks in `core/track/build.test.ts`), cat maker,
  garage (`KartLook.body` 0..2 already renders three bodies in `core/render/kart-view.ts`).
- Built (lane/fm-ugc): `codec/track-code.ts` (v1 share code, ≤ 140 chars, CRC, names filtered on encode and
  decode, decoder runs the validator), `codec/link.ts` (`?t=` / `#t=`, `?make`, `/make`), `editor/validate.ts`,
  `editor/doodle.ts`, `editor/TrackDoodle.ts` (lazy chunk), `store.ts` (saved tracks, draft, creator tag),
  `hub.ts` (Tracks button while paused or finished, track banner with Remix, broken-link notice). The shell reads
  `trackFromLocation()` from `ugc/codec/track-codec.ts`. Not yet: the maker's clean test lap before sharing
  (codes already carry `creatorLapCs`), prop sets, hazard/shortcut stickers, bridges (crossings fail validation
  because the mesh skirts would wall off the lower road), cat maker, garage.

### share
Owns `src/share/**`, `e2e/share.spec.ts`, `e2e/clip.spec.ts`, `tools/og-pages.mjs`, `tools/render-og.mjs`,
`public/og/`, and the integration outside the package. Installed by `installShare(shell)` in `src/lanes.ts`.
- `share/hooks.ts` `setShareHooks({ onResult, resolveRoute, playerRacer })`: `onResult` gets `{ result, replay, cfg,
  events }` and returns the result-screen buttons (index 0 is the clip button) and lines; `resolveRoute` turns the
  URL into a race setup; `playerRacer` gives the shell the saved cat for the player slot (the one shell line marked
  "share lane" in `core/app/shell.ts`).
- Dares: `codec/ghost-codec.ts` (setup header readable synchronously + RLE input runs, deflate-raw, CRC-16,
  base64url), `links/link.ts` (routes: `/meow-race/r#g=…&c=…&n=…`, `/meow-race/d/<n>`, `?g=` / `?daily=` anywhere),
  `links/ghost-runner.ts` (shadow `SimWorld` in lockstep, translucent kart + name tag, recomputed ghost time),
  `links/rivalry.ts` (device-only ledger).
- Clip: `clip/highlight.ts` (score + shot plan), `clip/clip-job.ts` (re-sim, offscreen 720×1280 render, captions),
  `clip/clip-audio.ts` (offline synth track), copied `clip/encoder-webcodecs.ts` (mediabunny, lazy). Fallback:
  `cards/result-card.ts` PNG. `links/share-sheet.ts` is the copied native share / download / long-press chain.
- Daily Cup: `daily/daily.ts` (UTC day numbers from 2026-10-19, track rotation + mirror, seed, ranked run, streak).
- Your cat: `yourcat/maker.ts` (photo → face oval → k-means coat + pattern guess, copied from bad-cat catmaker),
  `yourcat/store.ts` (cat code + name + small face PNG in localStorage; the face never leaves the device).
- Copy: `cards/card-text.ts` (no invented numbers, no money claims; `BANNED_CLAIMS` is tested).
- Outside the package: `meowRaceRewrites` in `client/next.config.js`, the committed `client/public/formula-meow-game/`
  build (`npm run og` then `npm run build:client`), rows in the root `CLAUDE.md` and `docs/CLIENT.md`.
- Not done: UGC track links (`t=` is parsed but the shell only races authored track ids), `/meow-race/c/<cat>`,
  the in-app browser handoff, consent-gated analytics.

## Checks

```
npm install
npx tsc --noEmit
npx vitest run
npm run build
npm run e2e          # builds into .e2e-dist, serves on 4395, headless Chromium (swiftshader)
```
