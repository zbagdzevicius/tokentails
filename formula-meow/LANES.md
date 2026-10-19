# Formula Meow: lanes and extension points

GDD: `docs/plans/formula-meow/GDD.md` (section 16 has the layout). The **core** lane (this commit) is the M0 base:
a playable race on two tracks. The other four lanes plug in through the interfaces below and should rarely
need to edit core files. If a lane needs a contract change, change `src/types.ts` or the interface file in one
small commit that every lane can rebase on.

## Shared files (change only with every lane in the loop)

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
Owns `src/share/**` and the integration outside the package.
- `share/hooks.ts` `setShareHooks({ onResult, resolveRoute })`: `onResult` gets `{ result, replay, cfg, events }`
  and may return extra result-screen buttons and lines; `resolveRoute(location)` turns `/meow-race/r#…` etc. into a
  race setup.
- `share/pinkpaw/pink-paw.ts` is the copied snapshot (status date shown on the results screen).
- Outside the package (not done yet): `meowRaceRewrites` in `client/next.config.js` modelled on the badcat block,
  the committed `client/public/formula-meow-game/` build (`npm run build:client`), og pages, rows in the root
  `CLAUDE.md` and `docs/CLIENT.md`.

## Checks

```
npm install
npx tsc --noEmit
npx vitest run
npm run build
npm run e2e          # builds into .e2e-dist, serves on 4395, headless Chromium (swiftshader)
```
