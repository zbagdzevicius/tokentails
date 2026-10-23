# Ultra Cat: lanes and integration contract

The design is in `GDD.md`. The architecture is below. Four lanes work in parallel in this folder, and each one edits only the files it owns.

## Layout

```
src/main.ts              FROZEN  bootstrap: registerCampaign, registerCats, registerEnemies, initEnemies, initInput, registerMetaUi, startLoop; window.__ultra test hook
src/core/                FROZEN  engine, state, types, registry, events, loop, session, player, camera, input, hud, fx, score, scoring, world, enemies, screens, bodies, api
src/audio/synth.ts       FROZEN  AudioContext, buses (out, sfx, music), noise(), env(), tone(), setVolumes(), onAudioInit()
src/audio/sfx.ts         FROZEN  core sounds: thud, crash, whoosh, meow(kind, pitch), hiss, nom, scream, boom, setHeli, setLaser
src/world/traffic.ts     FROZEN  cars: cars, launchCar, launchCarsNear, placeCars, updateCars
src/world/people.ts      FROZEN  people: placePeople, startlePeople, updatePeople
src/world/fish.ts        FROZEN  fish trucks: fishTrucks, placeFish, updateFish
src/world/wanted.ts      FROZEN  WANTED landmark
src/world/city.ts        CAMPAIGN  City generator (contract surface below)
src/world/theme.ts       CAMPAIGN  applyTheme(theme)
src/campaign/**          CAMPAIGN  levels.ts, themes.ts, stars.ts, index.ts (registerCampaign)
src/enemies/**           ENEMIES   heli.ts (done), one file per type (stubs), index.ts (registerEnemies)
src/cats/**              CATS      model.ts (Cat rig), defs.ts, stats.ts, economy.ts, abilities/*, index.ts (registerCats)
index.html, src/ui/**, src/meta/**, src/audio/music.ts, src/audio/ui-sfx.ts   META-UI
```

A FROZEN file is edited by no lane. If you need something a frozen file does not offer, build it in your own files. If that is impossible, write `// CONTRACT-REQUEST: ...` in your own file and mention it in your final report.

## Rules for every lane

- Work only inside `ultra-cat/`. Never touch other repo folders. Never git commit, push or branch.
- Do not `npm install`: vitest is already installed. No feature flags. Everything is procedural, with no asset files.
- Keep `npx tsc --noEmit` clean for your files. Errors in files another lane owns may show up while that lane works; ignore them.
- Tests are vitest, colocated with your code as `*.test.ts` in your folders. Run them with `npx vitest run src/<your folder>`.
  - Tests import only pure modules: no three, no DOM. `campaign/levels.ts`, `campaign/stars.ts`, `cats/stats.ts`, `cats/economy.ts`, `meta/save.ts` and `core/scoring.ts` must stay importable in node.
- Hot loops: no per-frame allocations (no `new Vector3`, closures, arrays or spreads per frame); reuse module-level temps. Pool meshes.
- The dev server runs at http://127.0.0.1:5177/ with HMR. Don't stop it. If it is down, run `npx vite` in the background.
- Playwright headless: copy `shots/v3.mjs` or `shots/levels.mjs` (chromium args `--use-gl=angle --enable-unsafe-swiftshader`).
  - Name your scripts and screenshots `shots/<lane>-*`.
  - Look at your screenshots with the Read tool.
  - A run must report 0 page errors.
- The `window.__ultra` hook has `G, C, game, mode, session, startGame, doSwipe, doPounce, doUltra, city, destroyedPct, keys, camera, beams, helis.length, enemyTypes`.
  - `session.startLevel(levelId, catId)` jumps straight into any city with any cat. Hide `#title` first if the menu covers it.

## Contract (summary; the code in `src/core/*.ts` is the source of truth)

### Boot order (src/main.ts, FROZEN)

1. `registerCampaign()`, `registerCats()` and `registerEnemies()` fill the registries in `core/registry.ts`: `levels`, `cats` and `enemyTypes`. Each has `add`, `get`, `has` and `all`. `levelList()` returns the levels sorted by index. `add` replaces, so a lane may swap a placeholder.
2. `initEnemies()` calls `init()` once on every registered EnemyType.
3. `initInput({swat, pounce, ultra})` binds the gameplay keys, the mouse and the touch stick and buttons.
   - Its keydown listener is registered before meta-ui's, so on the title screen Space can start the game without pouncing (actions check `game.mode === 'play'`).
4. `registerMetaUi()` (src/ui/index.ts) owns the menu flow. It must call `session.prepareLevel(...)` before returning, so `game.level`, `game.cat` and `game.rig` exist before the first frame.
5. `startLoop()`.

### Ids and data types (core/types.ts, FROZEN)

- **Ids:**
  - `LevelId`: `meowhattan` | `docks` | `suburbia` | `nekotown` | `base`.
  - `CatId`: `tabby` | `chonk` | `shadow` | `siamese`.
  - `EnemyId`: `heli` | `cannonTruck` | `cucumberTower` | `cucumberJet` | `vacuum` | `mechaDog` | `roombaPrime`.
  - `UpgradeId`: `power` | `speed` | `fur` | `ultra`.
  - The arrays `LEVEL_ORDER`, `CAT_ORDER`, `UPGRADE_IDS` and `ENEMY_IDS` list them in order.
- **`LevelDef`**: `{ id, index, name, tagline, duration, frenzyAt, valueMul, world: WorldDef, enemies: EnemySpec[], boss?: {type, at, endsLevel}, fishTrucks (<=4), cars (<=90), people (<=420), wanted: {first, every, bonus, timeBonus, minHeight}, objectives: [Objective x3], unlockStars, catnipBase, music: MusicSpec, tutorial }`.
- **`WorldDef`**: `{ seed, layout: 'downtown'|'docks'|'suburbia'|'neon'|'base', n (<=11), block, street, parkChance, heightBase, heightRand, centreBoost, centreRand, valueBase, valueRand, theme: CityTheme }`.
- **`CityTheme`**: sky and fog, hemi and sun colours and intensities, exposure, ground, sidewalk, grass and dash colours, building palette, window lit share, glass and glow colours, a night flag, taxi colour and share, car colours.
- **`EnemySpec`**: `{ type, delay, every, minEvery, everyRamp, max, maxRamp, params?: Record<string, number> }`.
  - Each enemy type runs its own spawner with: first spawn at `delay` s; then every `max(minEvery, every - elapsed/10*everyRamp)`; at most `max + floor(elapsed/maxRamp)` alive (maxRamp 0 = no growth).
  - No spawning while `G.frenzy` (non-bosses) or `G.timeFrozen`.
- **`Objective`**: `{ kind: 'damage'|'landmarks'|'kills'|'patience'|'destroyedPct'|'combo'|'fish'|'buildings'|'boss', target, enemy?, label }`.
- **`MusicSpec`**: `{ bpm, root (MIDI), scale, style: 'swing'|'surf'|'suburb'|'synthwave'|'march'|'boss' }`.
- **`CatStats`**: `{ walk, zoom, turn, radius, headY, scale, swatCd, swatReach, swatRadius, swatPower, pounceCd, pounceR, pounceJump, pounceFwd, patienceMax, wetResist, stunResist, ultraCharge, ultraTime }`. The tabby values are the POC exactly.
- **`CatRig`** (the model; built by `CatDef.build()`): `{ root: Group, swipe, swipeSide, shake, squash, scare, ultra, look, animate(dt, time, speed, airborne), eyes(out: Vector3[2]) }`.
  - Core sets `swipe`, `swipeSide`, `squash`, `shake`, `scare`, `ultra` and `look`, and positions and rotates `root`.
  - The rig decays its own timers. Core sets `root.scale` to `P.scale`.
- **`UltraAbility`**: `{ id, name (banner), color, tallyLabel, moveMul, camWide, start(), update(dt, t), stop() }`.
  - Core (`player.doUltra`) handles: meter full plus key, sets `G.ultra = 0` and `G.ultraT = P.ultraTime`, `rig.ultra = true`, meow, banner, flash, `ability.start()`.
  - Core calls `update()` every play frame while `G.ultraT > 0`, and `stop()` exactly once (time out, level end, quit, or a new level).
  - Abilities may put a running total in `G.zap` (the HUD shows `tallyLabel +$`). In `stop()`, pop the total only if `game.mode === 'play'`.
  - Abilities may temporarily change live stats in `P` (for example `P.wetResist = 0` for immunity), but must restore them in `stop()`.
- **`CatDef`**: `{ id, name, blurb, ultraName, voice (meow pitch), color (UI accent), cost, base: CatStats, build(): CatRig, ultra: UltraAbility, hooks?: { onSwat(x, z), onPounceLand(x, z) } }`.
- **`EnemyType`**: `{ id, boss?, init(), begin(spec | null, level), update(dt, t), clear(), alive(), onSwat?(SwatHit), onPounceAir?(p, r), onPounceLand?(x, z, r), onLaser?(p, dir), onLaserSweep?(x, z, ang), onBlast?(Blast), onFrenzy?() }`.
  - At every level load, core calls `clear()` on all types. At play start it calls `begin(spec)` on the types in `level.enemies`, and `begin(null)` on `level.boss.type`.
  - After that, core calls `update()` every frame, in any mode except paused. Only spawn and attack while `game.mode === 'play'`.
  - A boss type spawns itself at `level.boss.at` seconds of `G.elapsed`.
- **`SwatHit`**: `{ x, z, strike: Vector3, fwd, right, side, radius, power }`.
- **`Blast`**: `{ x, z, r, power, dirX?, dirZ?, cone? (cos half-angle), source }`.
- **`RunResult`**: `{ levelId, catId, why: 'time'|'wet'|'boss'|'quit', damage, buildings, landmarks, kills: Partial<Record<EnemyId, number>>, taxis, fish, maxCombo, patience, destroyedPct, bossDefeated, elapsed }`.
- **`SaveData`**: `{ v: SAVE_VERSION (1), catnip, selectedCat, cats: Record<CatId, {owned, upgrades: Record<UpgradeId, 0..UPGRADE_MAX(5)>}>, levels: Partial<Record<LevelId, {stars, objectives: [b, b, b], best, plays}>>, settings: {master, music, sfx, shake, quality: 'low'|'high'}, tutorialDone, totals: {runs, damage, catnipEarned} }`.

### Live state (core/state.ts, FROZEN; read it and set the existing fields, never add new ones)

- **`game`**: `{ mode: 'title'|'play'|'paused'|'over', level, cat, ability, rig, intro, overAt, camYaw }`.
- **`G`** (run counters): `time, damage, combo, maxCombo, comboT, patience, ultra (0..100), ultraT, buildings, helis, taxis, fish, elapsed, frenzy, wanted, timeFrozen, bossDefeated, kills, zap, zapComboT, hitStop, trauma`.
- **`C`** (the cat): `pos, y, vy, heading, speed, vel, air, swipeCd, pounceCd, wet, stun, tugX, tugZ, slow, fwd, right`.
- **`P`**: the live CatStats of the current cat.
- **`W`**: the WANTED landmark (`bi` = building index).
- **`CAPS`**: `{ segs 4200, trees 600, cars 90, people 420, fish 4 }`.
- **`settings`**: Settings (meta-ui writes it; core reads `shake`).

### Functions lanes call (import from core/api.ts)

- **Session** (core/session.ts):
  - `prepareLevel(levelId, catId, stats?, {keepCamera?})`: applyTheme, `city.build`, swap the cat rig, `Object.assign(P, stats ?? def.base)`, reset the player, traffic, people and fish, reset G, clear enemies. Leaves mode 'title' with the street-level camera.
  - `beginPlay()`: enemies begin, mode 'play', "RAMPAGE!".
  - `startLevel(...)` = `prepareLevel` + `beginPlay`.
  - `endLevel(why)`: mode 'over'; emits `levelEnd`.
  - `quitLevel()`: emits `levelEnd` with why 'quit'; mode 'title'.
  - `pause()`, `resume()`, `runResult(why)`, `currentLevel()`, `currentCat()`.
  - Ending conditions are automatic: `G.time <= 0` -> 'time'; `G.patience <= 0` -> 'wet'; `G.bossDefeated && level.boss.endsLevel` -> 'boss' (after 2.2 s).
- **Hurting the cat** (core/player.ts): `soak(amount, source)` (patience x `P.wetResist`, marks the cat wet for this frame; pass `rate * dt` for sprays), `startle(seconds, source)` (no input, rig scare, x `P.stunResist`), `tug(vx, vz)` (per-frame pull, u/s), `slow(mul)` (per-frame speed multiplier).
- **Attacks for abilities:**
  - `blast(x, z, r, power, label)`: smash buildings in a radius, punt cars, hop people, and call `onBlast` on every enemy. Returns raw $M (already scored).
  - Lower level: `smash(x, z, r, y0, y1, push) -> $M`, `radial(x, z, out, up, upRand)` (a push fn), `city.knock(i, vx, vy, vz)`, `launchCar`, `launchCarsNear(x, z, r, velFn)`, `startlePeople(x, z, r, vy)`, `blastEnemies(Blast)`, `laserEnemies` and `laserSweepEnemies` (via core/enemies).
- **Scoring:**
  - `score(rawM, at | null, label, combo = true)` applies combo, frenzy and the city's valueMul, charges ULTRA, pops money and emits `damage`.
  - `bonus(m)` banks a flat bonus.
  - `comboHit()`, `mult()`.
  - `markTouched(bi)` counts a building as wrecked; `valMul(bi)` is the $ multiplier per floor.
- **Kills:** `reportKill(type, at: Vector3, boss = false)` counts `G.kills[type]` and emits `enemyKilled` and `heliSwatted`. With boss=true it also sets `G.bossDefeated` and emits `bossDefeated`.
  - Enemy types call it once per kill and do their own score, pop and banner.
- **Juice:** particle pools `dust`, `chunks`, `water` and `fire` (`spawn(x, y, z, vx, vy, vz, life, size, color, grav, grow)`), `burst(x, y, z, n, color)`, `shake(t)`, `flash(o)`, `showBanner(text, color)`, `pop(text, at, color, size)`, `popMoney(label, v, at)`, `fxMat(color)`.
- **World:**
  - `city` has `buildings: Building{x, z, hx, hz, first, count, value}[]`, `segs` (BodySet), `trees`, `n`, `block`, `street`, `half`, `streetAt(k)`, `standing(b)`, `knock`, `spawn` and `build(world)`.
  - `FLOOR = 7`. Helpers: `distB(b, x, z)`, `staticSegs(b)`, `destroyedPct()`, `randomIntersection(farFrom)` (allocates, so not for per-frame use), `distCat(x, z)`.
  - `cars` is a BodySet; `St` is the body state enum.
- **Per-frame hooks:** `addFrameHook((dt, t) => …)` runs after the simulation and HUD, before render. While paused it is called with dt = 0. It returns an unsubscribe function.
- **Screens:** `screens.register({id, el, onShow?, onHide?})`, `screens.show(id, params)`, `screens.hideAll()`, `screens.back()`, `screens.current()`. A screen element has class `screen`; hidden screens also have class `hidden`.
- **Engine:** `scene`, `camera`, `renderer`, `sun`, `hemi`, `isTouch`, `setQuality('low'|'high')`.
- **Audio** (src/audio/synth.ts):
  - `audio()` returns `{ctx, out, sfx, music, noiseBuf}`, or null before the first gesture.
  - `onAudioInit(fn)` starts loops once the context exists.
  - Also `tone(type, freq, dur, peak, {to, at, attack, dest})`, `noise(dur)`, `env(g, peak, a, d)` and `setVolumes({master, sfx, music})`.
  - Connect one-shots to `audio().sfx` and music to `audio().music`.

### Events (core/events.ts: `events.on(name, fn)` returns an unsubscribe; `events.emit`)

- **Session:** `levelLoad {level, cat}`, `levelStart {level, cat}`, `levelEnd {result}`, `pause`, `resume`, `frenzy`.
- **Player:** `damage {amount, label, x, y, z}`, `comboHit {combo}`, `swat {x, z, hit}`, `pounce`, `pounceLand {x, z, money}`, `zoomies {on}`, `moved {distance}` (each walk-second), `ultraReady`, `ultraStart {ability}`, `ultraEnd {ability, tally}`, `bigHit {strength}`.
- **World:** `buildingWrecked {index, total}`, `landmarkToppled {index, count, bonus}`, `wantedPicked {index}`, `fishEaten {count}`.
- **Enemies:**
  - Core emits `enemyKilled {type, boss, x, y, z, count}`, `heliSwatted {count}`, `bossDefeated {type}`, `patienceHit {amount, source}` (a reused object; do not keep it) and `startled {seconds, source}`.
  - Enemy and boss types emit `bossSpawn {type, name, maxHp}`, `bossHp {type, hp, maxHp}` and `bossPhase {type, phase, name}`.

### DOM contract (index.html is owned by META-UI)

- Core reads these ids, which must stay: `dmgv, combo, cbar, zap, timer, pat, ult, banner, pops, wet, flash, wantedArrow, fishArrow, hint, stick, knob, tbSwat, tbPounce, tbZoom, tbUltra`.
- Core sets `body[data-mode]` to the current mode.
- The `.touch` class on body marks touch devices.
- Other lanes create no DOM. They show UI through events: the boss bar listens to `bossSpawn`, `bossHp` and `bossPhase`; the ULTRA button label comes from `game.cat.ultraName` on `levelLoad`.

### Cross-lane pure APIs (fixed signatures; the owner may change internals, not signatures)

- **Campaign** (campaign/stars.ts):
  - `objectiveValue(o, r: RunResult): number`
  - `objectiveMet(o, r): boolean`
  - `evaluateStars(level, r): {met: [b, b, b], stars}`
  - `totalStars(save): number`
  - `isLevelUnlocked(level, save, all: LevelDef[]): boolean`
  - campaign/levels.ts exports `LEVELS`.
- **Cats:**
  - cats/stats.ts: `TABBY_STATS` and `effectiveStats(base, upgrades): CatStats`.
  - cats/economy.ts: `CAT_COSTS`, `catnipForRun(result, level, newStars)`, `catCost(id)`, `upgradeCost(cat, up, current): number | null`, `canBuyCat(save, id)`, `buyCat(save, id): SaveData`, `canBuyUpgrade(save, cat, up)`, `buyUpgrade(save, cat, up): SaveData`. These return new objects and never mutate.
  - cats/defs.ts exports `CAT_DEFS`.
- **Meta** (meta/save.ts): `SAVE_KEY`, `defaultSave()`, `migrate(raw: unknown): SaveData` (never throws), `loadSave()`, `writeSave(s)`.
- **Loadout.** meta-ui starts a level as `startLevel(levelId, catId, effectiveStats(cats.get(catId).base, save.cats[catId].upgrades))`.
