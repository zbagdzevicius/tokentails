# Pawlegends Phase 1 POC: build spec

Implementation spec for Phase 1 ("First Blood") of [`GDD.md`](GDD.md). Written 2026-10-17, revised the same day after an adversarial review. Default start **Thu 2026-10-22**: **3 weeks of build (15 working days), launch Thu 2026-11-12**, then a 4-week measurement window to 2026-12-10.

Team: **2 developers with AI agents** (Dev A: sim, bots, heroes; Dev B: client, input, HUD, backend, store, embed). With **1 developer** the same scope takes about 5 weeks (launch about 2026-11-26); nothing else changes.

If this file and the GDD disagree on a POC detail, this file wins. If a number here changes during the build, change it in `pawlegends/src/data/` and update this file in the same commit.

---

## 1. What the POC must prove

1. **Core loop is fun.** A human finishes an 8-minute 3v3 match against bots and starts another one (the "second match within 24 h" metric).
2. **Purchase loop works and converts.** A player taps Buy in the game, pays on the web through Stripe, comes back, and sees the item on their hero in the next match. Real money, three SKUs, before any server is paid for.
3. **Performance.** It holds the budget on an iPhone 11 and a Pixel 6a in landscape, and on an Iris Xe laptop.
4. **Architecture.** The sim runs in a Worker behind the Phase 2 protocol, and the backend re-sims every saved match.

Gates and kill criteria are in GDD §10.1.

**The cut rule.** Anything that does not serve one of the four proofs is MVP work (§16). The POC ships one objective (Pudding), two bot difficulties, the minimum control set and three SKUs.

---

## 2. Package and stack

| Item | Value |
|---|---|
| Directory | `pawlegends/` (monorepo root, next to `catnip-heist/` and `bad-cat/`) |
| npm name | `pawlegends` (`private: true`, `type: module`) |
| Dev port | **5176**, preview **4176**. Taken: 5173 Heist, 5174 Bad Cat, **5175 Pink Paw Knight** (`swordcat/vite.config.js`, used by `NEXT_PUBLIC_SWORDCAT_URL` in local dev), 5180 Rave |
| Language | TypeScript strict. Lifted PPK JS is kept as `.js` with `allowJs` + JSDoc, only under `src/render/`, `src/input/` and `src/ui/`. Never under `src/sim/` |
| Runtime deps | `three` ^0.186.1 (PPK pins 0.186.1, so lifted code needs no API churn) |
| Dev deps | Versions as in `bad-cat/package.json`: `typescript` ^7.0.2, `vite` ^8.3.1, `vitest` ^5.0.2, `@playwright/test` ^1.63.0, `@types/node`, `@types/three` ^0.186, `happy-dom` |
| Embed output | `client/public/pawlegends-game/` (committed, like `heist-game/` and `badcat-game/`) |
| Host route | `/pawlegends` and `/pawlegends/terms` |
| Bridge namespace | `{ns:'tt-pawlegends', v:1}` |
| GameType | `PAWLEGENDS` |

`mediabunny` (clip encode) is not a POC dependency; the Legend Moment clip is MVP.

### 2.1 `package.json` scripts

```json
{
  "dev": "vite --port 5176",
  "build": "tsc --noEmit && vite build",
  "build:client": "tsc --noEmit && PAWLEGENDS_BASE=/pawlegends-game/ vite build --outDir ../client/public/pawlegends-game --emptyOutDir",
  "preview": "vite preview --port 4176",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "e2e": "playwright test",
  "budget": "node tools/budget.mjs",
  "lint:sim": "node tools/lint-sim.mjs",
  "lift": "node tools/lift-ppk.mjs",
  "bake:heroes": "node tools/bake-heroes.mjs",
  "bake:map": "node tools/bake-map.mjs",
  "match": "node tools/headless-match.mjs",
  "vendor-sim": "node tools/vendor-sim.mjs",
  "vendor-sim:check": "node tools/vendor-sim.mjs --check",
  "vendor-sim:check-remote": "node tools/vendor-sim.mjs --check-remote"
}
```

**Check commands for the root `CLAUDE.md` table row** (added when the package lands): `npx tsc --noEmit`, `npx vitest run`, `npm run lint:sim`, `npm run build && npm run budget`, `npm run e2e`, `npm run vendor-sim:check`, `npm run build:client` (commit `client/public/pawlegends-game`).

---

## 3. File layout

Files marked *(MVP)* are reserved names; do not create them in the POC.

```
pawlegends/
  package.json  vite.config.ts  tsconfig.json  vitest.config.ts  playwright.config.ts
  README.md               # run/check commands, device perf results, "all rights reserved, pending" note (as swordcat/README.md)
  index.html
  src/
    main.ts               # boot: quality probe, crash overlay, embed handshake, LocalHost start
    sim/                  # INTEGER ONLY. No three, no DOM, no float maths. Node-importable. Vendored to the backend
      index.ts            # createMatch(config) / step(inputs) / snapshot(team) / hash() / result()
      server.ts           # verifyReplay(replay) → {ok, outcome, finalHash, stats}: the only export the backend uses (catnip-heist/src/sim/server.ts pattern)
      version.ts          # SIM_VERSION = 1
      fixed.ts            # idiv, isqrt, sin/cos tables (4096 steps), clamp, dist2, moveToward (fraction carry)
      rng.ts              # mulberry32 + fork (pattern: catnip-heist/src/sim/rng.ts)
      hash.ts             # FNV-1a over the typed arrays (pattern: catnip-heist/src/sim/hash.ts)
      world.ts            # SoA state, entity caps (§4.1)
      commands.ts         # binary command encode/decode (§11.3)
      replay.ts           # replay record → result (pattern: catnip-heist/src/sim/replay.ts)
      timeline.ts         # waves, Pudding, Sunset, Sudden Death, safety end
      match.ts            # win/lose, result record
      map/ crossing.ts  lanes.ts  spawns.ts  brush.ts  grid.ts
      nav/ astar.ts       # integer A* (port of swordcat src/physics/Pathfind.js), expansion cap
      units/ hero.ts  minion.ts  tower.ts  core.ts  camp.ts  pudding.ts
      combat/ attack.ts  damage.ts  projectile.ts  targeting.ts   # targeting: integer port of swordcat src/combat/targeting.js
      effects/ index.ts  dash.ts  blink.ts  line.ts  cone.ts  ring.ts  projectile.ts  zone.ts  tether.ts
               shield.ts  heal.ts  slow.ts  stun.ts  root.ts  knockback.ts  fear.ts  stealth.ts  buff.ts  mark.ts
      heroes/ kit.ts  talents.ts  tricks.ts  clem.ts  sage.ts  brutus.ts  cacklejaw.ts   # bespoke hooks only
      progression/ xp.ts  levels.ts  respawn.ts
      bots/ brain.ts  utility.ts  lane.ts  objectives.ts  difficulty.ts
    data/                 # every gameplay number (no literals in sim code), integer units (§4.2)
      heroes/ clem.ts  sage.ts  brutus.ts  cacklejaw.ts
      map.ts  minions.ts  towers.ts  camps.ts  pudding.ts  xp.ts  tricks.ts  bots.ts  timeline.ts
    host/
      protocol.ts         # message types shared with the Phase 2 pawlegends-server (§11.2)
      local-host.worker.ts# runs the sim at 30 Hz, filters snapshots by team, records the replay
      local-host.ts       # main-thread client of the worker
    render/
      renderer.ts  quality.ts (pattern: catnip-heist/src/render/quality.ts)  toon.js (lift)  post.ts
      interp.ts           # snapshot buffer + interpolation (no prediction in the POC: LocalHost has no latency)
      juice.ts            # hitstop, shake, "Purrfect!", announcer triggers (render only)
      camera/ IsoRig.js  Picker.js  Occluders.js  CameraShake.js   # lift from swordcat src/camera/
      views/ heroView.ts  minionInstances.ts  towerView.ts  mapView.ts  objectiveView.ts
      fx/ GroundDecals.js  Telegraphs.js  DamageNumbers.js  Particles.js  Shockwaves.js   # lift, pooled
      cosmetics.ts        # coats, chromas, frames, Companion Kittens (palette/material swaps)
    input/
      Input.js (lift)  presets.ts  orders.ts (→ sim commands)  abilityAim.js (lift)
      touch/ touch.js  touchLayout.js   # lift from swordcat src/ui/ (touchEditor.js is MVP)
    ui/
      title.ts  pick.ts  hud.ts  abilityBar.js (lift)  hpBars.js (lift)  minimap.ts
      scoreboard.ts  talents.ts  results.ts  store.ts  offerCard.ts  settings.ts  messages.js (lift)  ui.css
    onboarding/ tips.ts  ghostPaws.ts      # in-match tips in the first match (pattern: catnip-heist/src/onboarding/)
    share/ dare.ts                         # dare link = seed + picks + difficulty in the URL
    money/ skus.ts (display mirror of the backend table)  entitlements.ts  checkoutBridge.ts  offer.ts
    meta/ profile.ts  roster.ts            # local profile (try/catch storage), host roster → cosmetics
    embed/ bridge.ts                       # tt-pawlegends v1, exact origin (pattern: swordcat src/core/embed.js)
    audio/ sfx.ts (zzfx, from swordcat src/audio/sfxDefs.js)  music.ts
    analytics/ posthog.ts (from bad-cat/src/platform/posthog.ts, consent-gated)  human.ts
    app/ crash.ts
  public/assets/          # baked heroes (*.glb, meshopt), map chunks, palette atlases, audio; LICENSES.md
  assets-src/             # bake inputs (hero configs, map layout), not shipped
  tools/
    lift-ppk.mjs          # copies a listed set of PPK files + provenance header (PPK commit, source path, licence note)
    bake-heroes.mjs       # headless Chromium: buildKitten (lite) + Poses → shared-skeleton GLB clips
    bake-map.mjs          # merged static map chunks + nav grid + brush mask from data/map.ts
    budget.mjs            # from bad-cat/tools/budget.mjs, POC limits (§10)
    lint-sim.mjs          # determinism rules over src/sim/**
    headless-match.mjs    # N seeded matches → lengths, win rates, per-hero stats, timing
    vendor-sim.mjs        # → backend/src/vendor/pawlegends-sim/ (pattern: bad-cat/tools/vendor-sim.mjs; + --check, --check-remote)
  tests/
    unit/  fixed.test.ts  rng.test.ts  determinism.test.ts  replay.test.ts  commands.test.ts  timeline.test.ts
           towers.test.ts  brush.test.ts  bots.test.ts  balance.test.ts  perf-sim.test.ts
           heroes/{clem,sage,brutus,cacklejaw}.test.ts  protocol.test.ts
    e2e/   first-match.spec.ts  match-desktop.spec.ts  match-touch.spec.ts  embed.spec.ts
           store.spec.ts  perf.spec.ts  determinism-browser.spec.ts
```

### 3.1 Monorepo touch points (all in M2 to M3)

Verified against the repo on 2026-10-17. `GameType` has **no hand-kept copies**: it lives in `shared/enums.ts` and `scripts/sync-contracts.mjs` writes it into `backend/src/shared-contracts`, `client/shared-contracts`, `cms/shared-contracts` and `catnip-heist/src/shared-contracts` (`shared/manifest.json`). The hand-kept copies in `backend/src/cat/cat.schema.ts` and `client/models/cats.ts` are `Tier` and `CatAbilityType`, which the POC does not change. What must change for a new replay-verified type:

```
shared/enums.ts                              # GameType.PAWLEGENDS
shared/__tests__/enums.test.ts               # expected GameType list
shared/caps.ts                               # PAWLEGENDS_* (§11.5), plus shared/__tests__/caps.test.ts
  → node scripts/sync-contracts.mjs          # then --check must be clean
backend/src/game/game.schema.ts              # add to liveGameTypes, NOT to scoredGameTypes
backend/src/user/live-game.spec.ts           # assert PAWLEGENDS is not a scored type (as for CATNIP_HEIST)
backend/src/user/dto/live-game.dto.ts        # isPawlegends(); `pawlegends?: PawlegendsReplayDto`; part of isReplayed()
backend/src/user/utils/live-game.ts          # refuse a `pawlegends` field on any other type
backend/src/user/user.controller.ts          # PAWLEGENDS branch in POST /user/catbassadors/live, next to BAD_CAT and CATNIP_HEIST
backend/src/user/heist/heist-ip-throttle.guard.ts  # count PAWLEGENDS replays in the per-IP replay bucket
client/components/shared/EndGameModal.tsx    # Record<GameType, …> entry (tsc fails without it)
client/components/audio/tracks.ts            # Record<GameType, …> entry (null: the game has its own audio)
docs/DEVELOPMENT.md                          # the shared/enums.ts row lists GameType values
tools/copy-lint/lib/lint.mjs                 # new `pawlegends` target: pawlegends/src/** minus src/sim/** (today the
                                             # targets are client, client-json, heist, heist-levels, backend, cms)
backend/src/vendor/pawlegends-sim/           # generated by vendor-sim, never hand-edited
backend/src/pawlegends/
  pawlegends.contracts.ts                    # PAWLEGENDS_SKUS (inline price_data), caps, age bands
  pawlegends-live.ts                         # replay verify via the vendored sim, in a worker thread (§11.5)
  pawlegends-replay.worker.ts                # worker_threads entry that calls verifyReplay
  pawlegends-stripe.service.ts               # Checkout sessions (pattern: badcat-stripe.service.ts)
  pawlegends-webhook.service.ts              # idempotent grants (pattern: badcat-webhook.service.ts)
  pawlegends-token.ts                        # signed entitlement token (pattern: badcat-token.ts)
  pawlegends-offer.service.ts                # offer rules (§8.4)
  pawlegends.schema.ts                       # entitlements, spend ledger, Founder Legend counter, notify-me emails
  pawlegends.controller.ts                   # registered in the single AppModule
  *.spec.ts
client/pages/pawlegends/index.tsx            # host page
client/pages/pawlegends/terms.tsx            # presale terms + refund policy
client/components/pawlegends/
  PawlegendsHost.tsx  bridge.ts  rosterBridge.ts  checkout.ts  saves.ts (heistSaves.ts pattern)  flags.ts (kill switch only)  title.ts
client/public/pawlegends-game/               # committed build
docs/GAMES.md  docs/API.md  docs/CLIENT.md  docs/BACKEND.md  CLAUDE.md (package row)
```

---

## 4. Sim conventions (read before writing sim code)

### 4.1 Entities and caps

6 heroes, 40 minions, 8 towers, 2 cores, 2 fountains, 4 camp monsters (2 camps × 2 rats), 1 Pudding, 48 projectiles, 24 zones. Entity ids are slot indices (0 to 5 heroes; team 0 = Purrhaven = slots 0 to 2, the human is slot 0). Iteration order is always ascending slot index.

### 4.2 Units

| Quantity | Unit in data and sim | Note |
|---|---|---|
| Position, distance, range, radius | integer **mm** | Map 100,000 × 60,000 |
| Speed | integer **mm per second** | Per-tick step = `idiv(speed + carry, 30)`, the remainder kept per unit in a `moveCarry` array, so 4.9 m/s moves exactly 4,900 mm a second |
| Angle | 1/4096 turn | Tables built from integer constants at module load |
| Time, cooldown, duration | integer **ticks** (30 Hz) | This doc writes seconds; data stores `round(s × 30)`, half up. Non-integer cases: 0.75 s → 23, 0.95 s → 29, 1.25 s → 38 |
| HP, damage, shield, XP | integer | |
| Percent | integer basis points (10,000 = 100%) | `applyBp(x, bp) = idiv(x × bp, 10000)` |

Products stay below 2^53. Division only through `idiv` (truncates toward zero). No `Math.*` except `Math.imul`, `Math.trunc`, `Math.abs`, `Math.min`, `Math.max` on integers.

### 4.3 Step order per tick

1. Apply the human command for this tick (at most one; the latest one wins if the input layer produced several).
2. Bots think (every 6 ticks, staggered by slot) and emit commands.
3. Timeline (spawns, Pudding, Sunset, Sudden Death, safety end).
4. Movement (heroes by A*, minions by lane waypoints + separation).
5. Casts and attacks resolve wind-ups that finish this tick.
6. Projectiles and zones.
7. Damage, shields, deaths, XP, level-ups, respawns.
8. Towers and cores choose targets.
9. Win check. Every 30 ticks, append `hash()` to the hash trail.

### 4.4 Primitives the POC needs (18)

`dash`, `blink`, `line`, `cone`, `ring`, `projectile` (pierce), `zone` (trap), `tether` (arena ring), `shield` (flat and frontal arc), `heal`, `slow`, `stun`, `root`, `knockback`, `fear`, `stealth`, `buff` (attack speed, move speed, cooldown rate), `mark` (target selection and reveal). `circle`, `cleanse`, `taunt` and reflect-as-primitive are MVP. Clem's parry reflect is a bespoke hook in `heroes/clem.ts`.

---

## 5. Map content: Purrhaven Crossing (POC subset)

Origin bottom-left; x 0 to 100 m, y 0 to 60 m. **Mirrored left-right across x = 50 m**: a Woof object at (x, y) is the Purrhaven one at (100 − x, y). Sunny Lane is the top lane for both teams, Puddle Lane the bottom.

```
y=60 ┌──────────────────────────────────────────────────────────────┐
     │      inner(20,48)  outer(34,51)  SUNNY  outer(66,51)  inner(80,48)
     │   brush(40,44)                                 brush(60,44)  │
F(3,30) CORE(10,30)  rats(30,30)   PUDDING(50,30)   rats(70,30)  CORE(90,30) F(97,30)
     │   brush(40,16)                                 brush(60,16)  │
     │      inner(20,12)  outer(34,9)   PUDDLE  outer(66,9)   inner(80,12)
y=0  └──────────────────────────────────────────────────────────────┘
     x=0                          river x 46..54                     x=100
```

| Element | Position (m), Purrhaven side | Numbers |
|---|---|---|
| Fountain | (3, 30), radius 4 | Heals 10% max HP a second; shoots enemies inside (500 dmg a second) |
| Core | (10, 30) | HP 3,000 (sim v4; Normal × 1.3), armour 50, shoots (120 dmg, range 7 m, every 1.0 s); invulnerable until one inner tower falls |
| Sunny Lane waypoints | (10,30) (16,44) (22,50) (50,53) | Mirrored to the Woof core. Lane width 8 m |
| Puddle Lane waypoints | (10,30) (16,16) (22,10) (50,7) | Mirrored |
| Inner towers | (20, 48) Sunny, (20, 12) Puddle | HP 2,200 (sim v4; Normal × 1.35), armour 50, range 7 m, attack every 1.0 s; invulnerable until that lane's outer falls |
| Outer towers | (34, 51) Sunny, (34, 9) Puddle | HP 1,800 (sim v4; Normal × 1.35), armour 40, range 7 m, attack every 1.0 s |
| Rat camp | (30, 30) | 2 rats, each HP 450, dmg 25, leash 8 m; 70 XP total; first at 0:30, respawn 60 s; clearing it gives the team +15% damage for 45 s (sim v4) |
| Catnip Bushes | (40, 44) and (40, 16), each 3 × 6 m | 2 per side, 4 total |
| Gate barrier | x = 8 m line | Up for the first 3 s (sim v4; 10 s before) |
| Pudding | (50, 30), shared | Calm meter 2,500 (sim v4; 5,000 before; filled by damage); does not attack; every 4 s a "scared hop" knockback ring 4 m (0.8 s telegraph); first 2:30, respawn 2:00 after the escort leaves |
| Nav grid | 1 m cells, 100 × 60 | Baked by `bake-map.mjs` from `data/map.ts` |

Travel at 5 m/s: fountain to river about 9 s, fountain to the enemy outer tower about 13 s.

**Tower rules:**
- Targets the nearest enemy minion. Switches to an enemy hero that damages an allied hero in range.
- Damage to heroes 90, +20% for each consecutive hit on the same hero, capped at +60% (sim v4; 150 / 25% / 100% before). Damage to minions 110 (a melee minion dies in 3 hits).
- **Lock-on (sim v4):** a tower or core that switches to a hero marks it for 1.2 s first (a `windup` event, slot 4, drawn as a red line) and fires only after that; a hero that leaves range during the lock-on is not shot. Rookie: the first hit on a level 1 to 2 hero of the human's team knocks it back 3 m.
- A fallen tower gives every living hero of the team that took it 120 XP (sim v4).
- **Backdoor protection:** takes 50% less damage from heroes when no minion of the attacker's team is within 8 m.

**Pudding's Courage:** the team that fills the calm meter gets Pudding as an escort for its next wave in the lane with the most enemy towers left (tie: Sunny). Escort Pudding has 3,000 HP, breathes on towers in 7 m for 200 damage every 2 s, and leaves when the wave dies or the enemy deals 3,000 damage to him.

**MVP adds:** a second rat camp and the crow roost per side, Captain Grizzlechop, 4 more bushes and fog of war (GDD §3.2).

---

## 6. Heroes (exact POC numbers)

### 6.1 Shared rules

- Levels 1 to 10. XP to reach level n (cumulative, sim v4): 0, 60, 200, 360, 580, 860, 1,200, 1,600, 2,060, 2,580 (v3: 0, 120, 300, 540, 840, 1,200, 1,620, 2,100, 2,640, 3,240). Every living hero also gets 2 XP a second from the first wave on. A level-up heals 30% of max HP.
- Ultimate unlocks at level 4. Abilities scale per level as listed.
- Talents at levels 3, 6 and 9 (two options each; bots take the first).
- Respawn (sim v4): 3 s + 0.6 s × level, capped at 9 s, and at most 4 s before 2:00; × 1.25 after Sunset. Rookie: the human × 0.6, the enemy bots × 1.5. Zoomies: +80% move speed for 6 s after leaving the fountain or respawning, ended by damage.
- Kill XP (sim v4): 80 + 15 × victim level; bounty +20 per streak step from a 3-takedown streak (max +80, a `bounty` event; killing that hero sends `shutdown`). Shared equally among heroes within 10 m; assists count if they hit the victim in the last 10 s (Rookie and Easy: any ally within 10 m counts). Every credited hero gets 40% of its max HP back.
- Minion XP: melee 30, ranged 25, siege 60, shared among heroes within 10 m. Catch-up per hero (sim v4): +25% XP from every source for each level beyond the first that the hero is below the enemy average, at most +75%; a victim more than 1 level above its killer gives +50% kill XP.
- Nine Lives (sim v4): damage beyond 28% of max HP within 1 s is reduced by 95% (a `buff` flash at most once every 15 s).
- Pickups (sim v4): Frenzy Catnip pairs on the river from 0:45, every 30 s (+25% damage, +20% speed for 8 s, 20% HP back); a Fish Snack per team behind its outer tower from 0:30, every 30 s (35% HP, refreshes Zoomies). At most 4 at once.
- Nap (recall): 4 s channel, broken by damage.
- Damage: `idiv(dmg × 100, 100 + armour)`.
- Regen 3% max HP a second out of combat (no damage from an enemy hero for 3 s; sim v4, 1% after 5 s before).
- Hero damage to enemy heroes × 1.3 (sim v4, `HERO_VS_HERO_BP`); hero HP is unchanged.

### 6.2 Base stats

| Hero | Side | Role | Element | HP (+/lvl) | Attack dmg (+/lvl) | Attack every | Range | Speed | Armour (+/lvl) |
|---|---|---|---|---|---|---|---|---|---|
| Clem | Cat | Fighter | FAIRY | 620 (+60) | 58 (+5) | 1.0 s | 1.6 m | 5.0 | 25 (+2) |
| Sage | Cat | Marksman | WIND | 480 (+50) | 52 (+5) | 0.9 s | 6.0 m | 4.9 | 15 (+2) |
| Sir Brutus | Dog | Tank | SAND | 760 (+80) | 46 (+4) | 1.2 s | 1.6 m | 4.8 | 40 (+3) |
| Cacklejaw | Dog | Assassin | DARK | 520 (+55) | 60 (+6) | 0.95 s (29 ticks) | 1.6 m | 5.2 | 20 (+2) |

### 6.3 Clem (Fighter)

| Slot | Name | Effect | Cooldown |
|---|---|---|---|
| Passive | Valor | Each basic or ability hit on an enemy hero adds 10 Valor (max 100; minions add 4). At 100 the next ability deals +50% and Valor resets | – |
| Q | Paw Combo | Cone 2.4 m, 90°, 70 (+12/lvl) dmg. Can recast twice within 3 s; the third hit knocks back 1.5 m | 6 s (starts after the last cast) |
| W | The Stand | 0.75 s block: 80% less frontal damage. A projectile that hits in the first 0.3 s is reflected (parry) | 12 s |
| E | Tumble | Dash 4 m, untargetable for 0.2 s | 11 s |
| R | Golden Hour | 6 s: +40% attack speed; every 3rd basic sends a 5 m line wave, 80 (+15/lvl) dmg | 60 s |

Talents: L3 *Pounce Finish* (third Q hit stuns 0.5 s instead of knockback) or *Long Swipe* (Q cone 3.0 m). L6 *Second Wind* (Tumble resets on takedown) or *Steady Stand* (Stand lasts 1.25 s). L9 *Golden Afternoon* (Golden Hour +2 s) or *Sunlit Mend* (heals 15% of damage dealt during Golden Hour).

### 6.4 Sage (Marksman)

| Slot | Name | Effect | Cooldown |
|---|---|---|---|
| Passive | Steady Paw | Every 4th basic pierces in a 7 m line, full damage to each target | – |
| Q | Volley | 5 arrows in a 50° cone, 7 m, 55 (+10/lvl) each; one target takes at most 3 arrows | 7 s |
| W | Sun Snare | Trap at up to 6 m; arms after 0.5 s; roots 1.0 s; lasts 30 s; max 2 traps | 14 s |
| E | Hop Back | Dash 3 m away from the cursor or joystick direction | 12 s |
| R | Moonshot | 1.0 s wind-up (telegraphed line), then a 40 m line, 1.2 m wide; 220 (+40/lvl) to the first hero, 50% to minions passed | 70 s |

Talents: L3 *Wide Volley* (7 arrows) or *Sticky Arrows* (Volley slows 20% for 1 s). L6 *Twin Snares* (max 3 traps, root 1.25 s) or *Quick Hop* (Hop Back 8 s). L9 *Full Moon* (Moonshot cooldown 50 s) or *Moon Mark* (Moonshot reveals the target for 4 s; in the POC, with no fog, this shows the target's outline through brush).

### 6.5 Sir Brutus (Tank)

| Slot | Name | Effect | Cooldown |
|---|---|---|---|
| Passive | Honour | Damage from heroes builds a shield of up to 12% max HP over 4 s; decays after 3 s out of combat | – |
| Q | Shield Slam | Ring 3 m around self, 60 (+10/lvl), slow 30% for 1.5 s | 7 s |
| W | Front Guard | 2.5 s frontal shield (120° arc) that blocks projectiles for Brutus and allies behind him | 14 s |
| E | Pug Charge | Dash 5 m; first hero hit is knocked back 2 m and stunned 0.5 s | 12 s |
| R | Champion's Challenge | Tether one hero within 5 m. A 6 m ring forms for 3 s; neither can leave. Brutus takes 30% less from that hero | 75 s |

Talents: L3 *Heavy Slam* (slow 45%) or *Wide Slam* (ring 3.8 m). L6 *Bulwark* (Front Guard 3.5 s) or *Long Charge* (Pug Charge 6.5 m). L9 *Arena of Honour* (ring lasts 4 s) or *Rally Howl* (allies in the ring gain 20% speed).

### 6.6 Cacklejaw (Assassin)

| Slot | Name | Effect | Cooldown |
|---|---|---|---|
| Passive | Pack Flank | +20% damage when hitting from behind (angle over 120°) or when an allied hero is within 4 m of the target | – |
| Q | Jeer Slash | Dash 4 m through a line, 75 (+12/lvl). If it hits a hero, can recast once within 3 s | 8 s |
| W | Gloat | Cone 3 m, 70°, fear 0.8 s | 13 s |
| E | Bush Slink | Stealth for 3 s, +20% speed. In brush the stealth lasts while inside and 1.5 s after leaving. Attacking breaks it | 16 s |
| R | Pack Hunt | Marks the lowest-HP enemy hero within 12 m, dashes to it: 150 (+30/lvl) + 10% of its missing HP. A takedown within 3 s resets the cooldown once | 60 s |

Talents: L3 *Long Jeer* (Q 5.5 m) or *Cruel Jeer* (Q recast slows 30% for 1 s). L6 *Smug* (Gloat cooldown 9 s) or *Wide Gloat* (Gloat 4 m, 90°). L9 *Feeding Frenzy* (Pack Hunt resets up to twice) or *Ambush* (first hit out of stealth deals +40%).

### 6.7 Paw Tricks (pick one before the match)

| Trick | Effect | Cooldown |
|---|---|---|
| Pounce | Blink 4 m | 120 s |
| Snack Break | Heal 25% max HP over 2 s; broken by hard CC | 90 s |
| Hiss | Fear 1 s in a 3 m radius | 100 s |

### 6.8 Teams in the POC

- The player's team is always Purrhaven (left). Enemy is always Woof.
- The player picks any of the 4 heroes. A dog hero on Purrhaven wears the cream-and-rose sash; a cat hero on Woof wears the navy-and-brass sash (one material swap each).
- Readability (recorded 2026-10-17 after Low-tier screenshots at 844×390): a thin sash was invisible at phone size (about 20 CSS px per hero), so every hero wears its team colours as a blanket over the back and flanks with a stripe in the second colour, plus a broad sash; Clem's neck scarf takes the team colour. It stays in the hero's one merged geometry (no extra draw call). `tests/unit/team-read.test.ts` checks that at least 15% of each hero's up-facing surface is its team colour and under 3% the other team's (the old sash: about 5%).
- Bots fill: no duplicate heroes within a team; duplicates across teams are allowed. Bot picks and bot Paw Tricks are drawn from the match seed (`rng.fork('picks')`).
- Difficulties: **Easy and Normal**. Hard is MVP. The first match is always Easy with Clem pre-selected ("Play as Clem").

### 6.9 Hero art in the POC

- **Dogs** (Sir Brutus, Cacklejaw): the KayKit rig GLB already in PPK, with `BeastHead.js` + `BeastDress.js` parts merged into one skinned mesh by `bake-heroes.mjs`. Clips: idle, run, attack, cast, death.
- **Cats** (Clem, Sage): `buildKitten(cfg)` in the `lite` tier plus `Poses.js`, baked to a GLB on one shared cat skeleton with the same 5 clips.
- **Fallback if the cat bake is not green by day 8:** run `buildKitten` `lite` at runtime, merge each kitten's static geometry per bone group, and accept a Low-tier draw-call limit of 90 instead of 70 for the POC. Record the choice in the README.
- Every asset has a row in `public/assets/LICENSES.md` (copied from `swordcat/public/assets/LICENSES.md` for each file used).

---

## 7. Minions, bots and timeline

### 7.1 Minions

| Unit | HP | Dmg | Attack every | Range | Speed | Armour | XP |
|---|---|---|---|---|---|---|---|
| Kitten Cadet / Pup Trooper (melee) | 300 | 14 | 1.2 s | 1.2 m | 3.6 | 10 | 30 |
| Ranged Cadet / Trooper | 220 | 20 | 1.4 s | 5.0 m | 3.6 | 5 | 25 |
| Yarn Catapult / Bone Cart (siege) | 700 | 40 (×2 vs towers) | 2.0 s | 6.0 m | 3.2 | 30 | 60 |

- Waves every 20 s from 0:08 (sim v4; every 25 s from 0:30 before): 2 melee + 1 ranged per lane. From 2:00 every 3rd wave adds 1 siege.
- Underdog waves (sim v4): a team 3+ towers or 8+ takedowns behind gets +10% minion HP on its next 2 waves (a `comeback` event; not for the enemy on Rookie).
- Minion HP grows 3% a minute (integer bp, applied at spawn).
- Owned Token Tails cats replace up to 2 Kitten Cadet skins per wave as Companion Kittens (cosmetic only; the player's team only; never in the sim).

### 7.2 Bots

Utility AI scored every 6 ticks (staggered by slot), inside the sim. Actions: farm lane (last-hit priority), trade with the lane opponent, retreat, nap, take the rat camp, contest Pudding, defend a tower, group for a teamfight. Abilities are cast when the shape covers a target (integer port of the `planAbility()` heuristics in `swordcat/src/companions/abilityAim.js`). Bots never read the stealth flag or the position of a unit hidden in brush; the sim exposes to bots only what `snapshot(team)` would show.

| Parameter | Rookie (match 1, sim v4) | Easy | Normal |
|---|---|---|---|
| Reaction delay | 30 ticks (1.0 s) | 18 ticks (0.6 s) | 9 ticks |
| Skillshot aim error (seeded) | ±35° | ±20° | ±10° |
| Mistake rate (miss a last-hit, chase too far, ignore a gank) | 35% | 25% | 10% |
| Retreat threshold | 12% HP | 8% HP | 12% HP |
| Uses Paw Trick | never | never | defensive only |
| Contests Pudding | rarely | rarely | yes |
| Groups from | 3:30 | 4:30 | 3:55 |

**Sim v4 difficulty rules (`DIFFICULTY_RULES` in `src/data/bots.ts`).** Rookie is match 1 only: the human's two allies "carry" (they follow its lane, peel for it, and stop hitting an enemy hero below 25% HP when the human is within 8 m and fighting it), slot 3 walks into Sunny Lane at 0:15 for the first fight, the human deals × 1.4 and takes × 1.15, regenerates × 4 out of combat, and each takedown it takes part in gives its minions +11% (up to 8). Easy also has carry allies and near-assists; its cores open at 6:00. Normal towers have × 1.35 HP and cores × 1.3, and a grouped Normal team 3 or more ahead (takedowns + 3 per tower) turns back to defend a raided lane only when it outnumbers the raiders (`pressAhead`), so a lead becomes a push: without it the trailing team won 40% to 42% of matches, with it 33.7%.

**The naive player-bot (sim v4, `src/sim/bots/naive.ts`, `NAIVE` in `src/data/bots.ts`).** The fun gates' stand-in for a first-timer: it acts through commands only, attack-moves to the nearest enemy hero within 15 m, chases up to 18 m, casts Q, E and R when ready with ±25° aim error, walks home below 20% HP, never naps or uses its Paw Trick, takes a pickup within 6 m, hesitates 0.5 to 2 s in 5% of thinks, and takes talent 1.

**Tuning targets:** a scripted novice player-bot (`npm run match -- --profile novice`) beats Easy bots about 90% of the time and Normal bots 40% to 60% of the time.

**Who plays at which level (recorded 2026-10-17 for founder review):** the match difficulty sets the three **enemy** bots only. The human's two allied bots always play at Normal (`BOT_TEAMS.allies` in `src/data/bots.ts`), so "vs Easy bots" means a novice plus two Normal allies against three Easy bots. Two Easy allies would lose the lanes the novice is not in and turn the first match into a loss nobody caused. The tuning targets above and §15 item 12 are measured this way.

**Normal bots group at 3:55 (recorded 2026-10-17, sim v3).** Beyond the table, each difficulty sets when its bots leave their lanes and group in one push lane (`groupAt` in `src/data/bots.ts`; Easy 6:00). Normal grouped at 5:00 in sim v2, and the novice beat Normal only 41.5% of 400 seeds, next to the 40% floor: the novice keeps to Sunny Lane, so the push it is not in decides the match. Normal now groups at 3:55, and the human's allies group when the enemy difficulty does (Normal's 3:55 against Normal, 6:00 against Easy: grouping early against Easy bots that still hold their lanes dropped the novice to 84% vs Easy). Nightly, 400 seeds each: novice vs Normal 52.8%, vs Easy 92.8%. Normal vs Normal, 2,000 seeds: median 7:36, p95 8:41, every match ends by a core kill, Purrhaven 49.0%, heroes 44.1% (Sir Brutus) to 52.7%; the 200-seed `npm run match -- --balance` run passes (Purrhaven 47.0%). `SIM_VERSION` is 3, so v2 replays are refused.

### 7.3 Timeline

| Time | Ticks | Event |
|---|---|---|
| 0:00 | 0 | Spawn, gate barrier |
| 0:03 | 90 | Barrier drops (sim v4) |
| 0:08 | 240 | First wave, then every 20 s |
| 0:30 | 900 | Rat camps up, first Fish Snacks |
| 0:45 | 1,350 | First Frenzy Catnip pair |
| 2:00 | 3,600 | Siege units start |
| 2:30 | 4,500 | Pudding |
| 5:00 (Rookie 4:00) | 9,000 (7,200) | **Sunset**: towers and cores take double damage, respawn × 1.25, minions +25% dmg; each takedown deals 15% core damage to the victim's core |
| 7:00 (Rookie 6:15) | 12,600 (11,250) | **Sudden Death**: cores lose 3% max HP a second; each takedown deals 10% core damage to the victim's core |
| 11:00 | 19,800 | **Safety end**: lower core HP loses; tie-break total tower damage dealt; then a seeded coin |

**Vision in the POC:** no fog of war (the whole map is visible). The brush rule is real: a unit in a Catnip Bush is absent from the other team's snapshot unless an enemy is within 2 m or in the same bush. `snapshot(team)` already filters, so adding the fog grid in the MVP changes one function.

---

## 8. Store (real, web only)

### 8.1 SKUs

Defined once in `backend/src/pawlegends/pawlegends.contracts.ts` with inline `price_data` (no Stripe dashboard products). `src/money/skus.ts` mirrors names for display; the server price always wins.

| SKU | USD | EUR | Limit | Delivered now | Delivered at MVP launch (target 2027-04-30) |
|---|---|---|---|---|---|
| `pl_starter` | 0.99 | 0.99 | once per account and email | "Pink Bow Clem" Rare skin, "Starter" emote | 3-day Pride Club trial (bonus, not the paid item) |
| `pl_founder` | 9.99 | 9.99 | – | Founder Epic coat for all 4 heroes, animated Founder frame, Founder title | 4 MVP heroes of choice, Season 1 Legends Pass, name in the in-game credits |
| `pl_founder_legend` | 29.99 | 29.99 | first 500 (real counter, gifts and creator codes included) | Everything Founder delivers now + "Dawnblade Clem" Legendary skin, Legend frame | Everything Founder delivers at MVP + all 8 MVP heroes, Season 1 Legends Pass+, 1 month Pride Club, name on the Founders' Banner |
| `pl_founder_legend_upgrade` | 20.00 | 20.00 | Founder owners only, once | As Founder Legend minus Founder | As Founder Legend |

Names in credits and on the banner are MVP deliveries because they need moderation (`isBlockedCatName` / `normalizeCatName` in `shared/name.ts`) and an opt-in.

**My Cat Hero is not in the POC store** (GDD §8.2: it needs a coat-builder UI; MVP, reusing the Bad Cat `CatSpec` encoding).

**Currency.** Bad Cat charges USD only (`currency: 'usd'` in `badcat-stripe.service.ts`), and inline `price_data` has no multi-currency options. The host sends `currency: 'eur' | 'usd'` (EUR when the browser time zone is in Europe), the backend validates it and picks that row of the table.

**VAT.** Prices are VAT-inclusive (`tax_behavior: 'inclusive'`). Stripe Tax and OSS registration follow the accountant's answer (founder decision, GDD §12 #17); Stripe live mode waits for that answer.

### 8.2 Flow

1. Game: player taps Buy → bridge `purchase-intent{sku}` to the host.
2. Host: shows a sheet with the price, the "Delivered now" and "Delivered at MVP launch (target 2027-04-30)" lines, the age band question (first time only), the terms link, and the immediate-delivery consent checkbox.
3. Host: `POST /pawlegends/checkout {sku, currency, email?, ageBand, consentVersion, deviceId}` → Stripe Checkout URL → redirect (works in TikTok and Instagram in-app browsers, the Bad Cat lesson).
4. Stripe → `POST /pawlegends/stripe/webhook` → grant once per session id (idempotent), write the spend ledger, bump the Founder Legend counter.
5. Return to `/pawlegends?checkout=ok` → host fetches the entitlement token → bridge `entitlements{token}` → the game renders the items in the lobby and the next match.
6. Restore: `POST /pawlegends/restore {email}` sends a magic link that returns a fresh token on any browser (Bad Cat `/badcat/restore` + `/badcat/restore/verify` pattern).

### 8.3 Endpoints (new controller, registered in `AppModule`)

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /pawlegends/checkout` | optional `accesstoken` | Create a Checkout session. Refuses: unknown SKU or currency, starter already owned, spend cap reached, under-16 band, Founder Legend sold out, upgrade without Founder |
| `POST /pawlegends/stripe/webhook` | Stripe signature | Grant and ledger |
| `POST /pawlegends/restore`, `POST /pawlegends/restore/verify` | none (rate-limited) | Email a restore link; exchange it for a token |
| `GET /pawlegends/entitlements` | entitlement token or `accesstoken` | List owned items |
| `GET /pawlegends/offer` | device id (+ token if any) | At most one offer (§8.4) |
| `POST /pawlegends/offer/seen` | device id | Starts genuine windows (starter 48 h) |
| `GET /pawlegends/founders` | none | Founder Legend seats left (a number only in the POC) |
| `POST /pawlegends/notify` | none (rate-limited) | "Legends Pass: notify me" email, double opt-in |

Required secrets (names only; values never in the repo; Bad Cat fallback pattern in `badcat-flags.ts`): `PAWLEGENDS_STRIPE_SECRET_KEY` else the shared `STRIPE_SECRET_KEY`; `PAWLEGENDS_STRIPE_WEBHOOK_SECRET`; `PAWLEGENDS_ENTITLEMENT_SECRET` else an HMAC of `INVALIDATE_CACHE_SECRET` with a fixed label. When a secret is missing, checkout answers 503, the store button hides, and the game still plays. **No `*_ENABLED` flag.** Add the names to `docs/BACKEND.md`.

### 8.4 Offer engine (POC rules)

Inputs sent by the game: device id, session count, completed matches, first win done, owned-cat count. Output: `none` or one offer.

| Order | Rule | Offer |
|---|---|---|
| 1 | Session ≥ 2, first win done, starter not owned, not shown before (or its window is still open) | `pl_starter`, window 48 h from first show |
| 2 | Completed matches ≥ 3, no Founder owned, not shown in the last 7 days | Founder and Founder Legend side by side |

Never: in session 1, in pick, loading or a match, in app builds, for an account or email at its spend cap. At most one card per session. The game shows the card only on the lobby or the results screen. The store button is always in the lobby, from session 1.

### 8.5 Age bands and caps

Asked once at first checkout and stored with the email. Under 16: blocked with "Ask a parent or guardian to buy this on their own device." 16 to 17: €30 per rolling 30 days. 18+: €200 per rolling 30 days, raisable by email to support. Enforced in `pawlegends-stripe.service.ts` from the spend ledger, keyed by email, account id and device id (the strictest match wins). USD is converted at a fixed €1 = $1 for the cap.

### 8.6 Terms page

`/pawlegends/terms` must be live before Stripe live mode. Content per GDD §8.3: delivered now vs at MVP; full refund on request for 60 days if the MVP is not live by 2027-06-30 or the MOBA is stopped; the withdrawal consent for immediate items only; age bands and caps; contact email. Stripe metadata stores `deferred`, `termsVersion`, `ageBand` and `currency`.

### 8.7 Free demand signal

"Legends Pass: notify me" on the results screen and in the store. Email only, double opt-in, no charge.

---

## 9. Controls (POC minimum)

**Desktop (`moba` preset: `INPUT.presets.moba` in `swordcat/src/core/config.js`, read by `src/core/Input.js`; remapped to MOBA defaults):** RMB move/attack, A + LMB attack-move, S stop, Q/W/E/R cast (quick-cast; hold shows the indicator, release casts; out of range walks in then casts), D Paw Trick, B Nap, 1/2 talent pick, Space centres the camera, wheel zoom (clamped), Tab scoreboard, Esc menu. No binding uses Ctrl, Alt, Meta or an F-key.

**Mobile (landscape only; a rotate prompt in portrait):** floating joystick (40 px dead ring); Attack button with auto-target (integer targeting scorer: enemy hero in range first, then lowest-HP minion, then tower); Q/W/E arc and a larger R; tap smart-casts, drag aims, drag onto ✕ cancels; Trick and Nap buttons; talent toasts are 2 big buttons; minimap tap to peek.

**First match:** smart-cast forced; aimed cast offered as a tip after match 3.

**MVP adds:** Shift-queue, Y camera lock, `brawler` preset, full rebinding UI, gamepad, Last-hit and Tower buttons, Edit layout (`touchEditor.js`), left-handed mirror, target-priority setting.

---

## 10. Performance budget (CI and device gate)

| Budget | Limit | Checked by |
|---|---|---|
| First-load JS (entry + three) | ≤ 450 KB gzip | `npm run budget` |
| Total `client/public/pawlegends-game/` | ≤ 10 MB | `npm run budget` |
| Per hero GLB | ≤ 6k triangles, 1 draw call, ≤ 250 KB | `bake-heroes.mjs` asserts |
| Draw calls, Low, 6 heroes + 24 minions + 4 towers fighting | ≤ 70 (≤ 90 with the §6.9 fallback) | `perf.spec.ts` (`renderer.info`) |
| Draw calls, Med | ≤ 110 | `perf.spec.ts` |
| Frame time, iPhone 11 / Pixel 6a, landscape Low | p95 ≤ 33 ms | manual device run, recorded in the README |
| Frame time, Iris Xe 1280×720 Med | p95 ≤ 16.7 ms | manual run + Playwright trace |
| JS heap | ≤ 150 MB | `perf.spec.ts` |
| Cold load to first controllable frame, simulated 4G | ≤ 6 s | `perf.spec.ts` |
| Sim: one full bot match headless, Node, one core | ≤ 1.0 s typical, ≤ 1.5 s at the 11:00 maximum | `perf-sim.test.ts` |

Quality tiers merge PPK `config.QUALITY` with the Heist FPS-probe governor (drops to Low under 42 fps). Low: DPR 1.25, no shadows, no bloom, no outlines.

---

## 11. Bridge, host page, protocol and saves

### 11.1 Bridge

`pawlegends/src/embed/bridge.ts` and `client/components/pawlegends/bridge.ts`: `{ns:'tt-pawlegends', v:1, type, ...}`. Same handshake as `/swordcat` (`docs/GAMES.md`, "Bridge v1"): the host sends `hello` until `ready`; the first valid `hello` fixes the host origin; the allowlist comes from `VITE_EMBED_ORIGINS` (PPK `src/core/embed.js` pattern); the game never posts to `'*'`. No `accesstoken` or Firebase token in any message.

| Direction | Messages |
|---|---|
| Host → game | `hello`, `session{signedIn}`, `roster{cats[]}`, `entitlements{token}`, `audio{muted}`, `pause`, `resume`, `purchase-result{sku, ok}`, `app{isApp}` |
| Game → host | `ready{version}`, `match-result{replay, summary}`, `purchase-intent{sku}`, `share{kind, url}`, `paused{paused}` |

`roster.cats[]` items: `{id, name, type, tier, isStarter, starterBreed?, origin?}`. `type` is `CatAbilityType`, `tier` is `Tier`, `origin` is one of `CAT_ORIGINS` (`starter`, `pack`, `redeem`, `adopt`, `portrait`). Owned cats carry **no breed field** (the schema stores only `CAT_ORIGINS` in `origin`), so the Companion Kitten coat comes from `starterBreed` when present, else from a stable hash of the cat id into 8 preset coats.

### 11.2 Protocol (`src/host/protocol.ts`, kept for the Phase 2 server)

| Direction | Message | Payload |
|---|---|---|
| client → host | `join` | `{slot, hero, trick, difficulty, seed?}` (seed only from a dare link) |
| client → host | `cmd` | `{tick, bytes}` (one encoded command, §11.3) |
| client → host | `leave` | – |
| host → client | `welcome` | `{matchId, seed, simVersion, slot, team, picks[6], tricks[6]}` |
| host → client | `snap` | transferable `ArrayBuffer`: tick, then per visible entity `{id, kind, x, y, facing, hp, flags, anim}`; 30 Hz in the POC |
| host → client | `events` | `{tick, list}`: `hit`, `cast`, `windup`, `death`, `levelup`, `talentOffer`, `tower`, `pudding`, `sunset`, `suddenDeath` |
| host → client | `end` | `{outcome, stats, replay}` |

### 11.3 Replay format

```ts
type PawlegendsReplay = {
  v: 1;
  simVersion: number;
  seed: number;                 // uint32
  difficulty: 'easy' | 'normal';
  hero: HeroId; trick: TrickId; // the human (slot 0); bot picks come from the seed
  ticks: number;                // ≤ PAWLEGENDS_MAX_TICKS
  inputs: string;               // base64 of the binary command stream
  outcome: 'won' | 'lost';
  finalHash: string;            // hex FNV-1a
};
```

Binary command stream: per record a varint tick delta, a 1-byte opcode, then the payload. Coordinates are quantised to 0.25 m (uint16). Opcodes: `move(x,y)` 5 B, `attackMove(x,y)` 5 B, `attack(id)` 2 B, `cast(slot,x,y,id)` 7 B, `trick(x,y)` 5 B, `stop` 1 B, `nap` 1 B, `talent(tier,choice)` 2 B. The joystick emits `move` to a point 2 m ahead only when its direction changes by more than 1/32 turn, at most every 3 ticks. Encoded `inputs` must stay **≤ 40,000 characters** so the whole body fits under `/live`'s 64 KB limit (`LIVE_GAME_BODY_LIMIT` in `backend/src/user/dto/live-game.dto.ts`); the encoder coalesces repeated moves to stay under it, and `commands.test.ts` checks a worst-case 11:00 touch match.

### 11.4 Host page

`client/pages/pawlegends/index.tsx` copies the `/swordcat` page (`client/pages/swordcat.tsx`): `FirebaseAuthProvider authMode="optional"`, `SeoHead` with `noindex` until the trademark search passes, a plain import of `PawlegendsHost` (the iframe needs no `next/dynamic`; the game has no Phaser or Stellar code), iframe `src="/pawlegends-game/index.html?embed=1"`. On by default; `NEXT_PUBLIC_PAWLEGENDS=0` (or false/no/off) is the kill switch and redirects to `/game` (`client/components/swordcat/flags.ts` pattern). In app builds the page plays but shows no store, no offer and no purchased cosmetics (GDD §9.8), and the `/game` picker card is web only.

### 11.5 Saves and the `/live` branch

**Saves:** `saves.ts` (the `client/components/heist/heistSaves.ts` pattern) posts `match-result` replays to `POST /user/catbassadors/live` with `type: GameType.PAWLEGENDS` and the replay in a `pawlegends` field, whenever the host has a Token Tails session (signed-in or guest account, as for the Heist). Without a session, results queue offline (`tt.pawlegends.queue.v1`, try/catch storage) and post after sign-in, with retry and backoff.

**`/live` branch** (`backend/src/pawlegends/pawlegends-live.ts`): validate the DTO → check `simVersion` (an unknown version is refused with 4xx) → re-sim with the vendored sim **in a `worker_threads` worker** through its own `ReplayQueue` (concurrency 1, max 8 queued, 429 with `Retry-After` when full; `backend/src/user/heist/replay-queue.ts` documents that a main-thread replay over 50 ms p95 needs a worker, and a Pawlegends match takes up to 1.5 s) → compare outcome and final hash → reject a mismatch with 4xx and no write → idempotent by replay hash → update the per-difficulty fastest win and pay catnip once for the first win per difficulty. Caps in `shared/caps.ts`:

```ts
export const PAWLEGENDS_LEVELS: string[] = frozen(['easy', 'normal']);       // 'hard' appended in the MVP
export const PAWLEGENDS_LEVEL_CAPS: number[] = frozen([20, 40]);             // catnip for the first win per difficulty
export const PAWLEGENDS_TICK_HZ = 30;
export const PAWLEGENDS_MAX_TICKS = PAWLEGENDS_TICK_HZ * 660;               // 11:00 safety end
export const PAWLEGENDS_MAX_INPUT_CHARS = 40000;                            // base64 command stream
```

Catnip is a Token Tails reward, separate from anything in the game; the game shows no catnip amount (no money words).

**Accepted risk: client seeds and scripted play (recorded 2026-10-17 for founder review).** The host picks the seed (or a dare link carries it) and `verifyReplay` checks only that the inputs produce the claimed result, so a replay from a searched seed or from a scripted player (the sim ships `createPlayerBot`; a Normal player-bot wins about half its matches against Normal bots) verifies like a human's. The POC accepts this: the only reward is the once-per-difficulty first-win catnip (`PAWLEGENDS_LEVEL_CAPS`, 60 in total per account, claimed atomically), there is no leaderboard (fastest-win times stay on the account; a dare link shows only your own time). Before any ranked mode, leaderboard or repeatable reward, scored matches take a server-issued seed (a nonce bound to the account and spent once), and the analytics human filter (§13) is applied to them.

---

## 12. First session script

| Time | Beat |
|---|---|
| 0:00 | Title. One big button: "Play as Clem". No account needed |
| 0:05 to ~9:00 | First real match vs Easy bots. Five ghost-paw tips trigger on events: move (0:05), attack a minion (first wave), Q on a hero (first enemy in range), Tumble through a telegraph (first wind-up aimed at you, "Purrfect!" on success), R (level 4). Each tip hides after it is done or after 8 s |
| End | Win screen: confetti, hero turntable, "Sir Brutus Biscuit coat unlocked" (free) |
| End + 5 s | "Dare a friend" link ("Beat my 7:12 vs Easy bots"): same seed, picks and difficulty |
| End + 10 s | "Play again" |

The dodge tip also fires on the first enemy ability aimed at the player (cast at them or landing within 4 m), not only on a wind-up: in the POC kits only Sage's Moonshot has a wind-up, so a first match vs Easy bots almost never showed it (recorded 2026-10-17). A tip whose event comes while another is up waits and shows next.

No offer card in this session. The separate tutorial map, the 7-day Welcome Path and the Legend Moment clip are MVP.

---

## 13. Analytics

PostHog, consent-gated (`bad-cat/src/platform/posthog.ts`); no event before consent, no personal data in events. Events: `title_view`, `match_start{hero, difficulty, trick}`, `match_end{result, length, hero, difficulty, takedowns}`, `second_match`, `talent_pick`, `tip_done{id}`, `dare_open`, `store_open`, `offer_shown{sku}`, `offer_click{sku}`, `checkout_start{sku}`, `purchase{sku}` (server side, from the webhook), `item_seen_in_match{sku}`, `notify_signup`, `quality_tier`, `perf_sample{p95}`.

**Human filter** (`analytics/human.ts`): a session counts as human when it has at least 20 real pointer, touch or key events, a match of at least 60 s, and a non-headless user agent. All gate metrics use only human sessions.

---

## 14. Milestones (15 working days)

| # | Days (dates) | Dev A (sim, bots, heroes) | Dev B (client, backend, store) | Done when |
|---|---|---|---|---|
| **M0** | 1 to 2 (Thu Oct 22 to Fri Oct 23) | Package scaffold; `fixed.ts`, `rng.ts`, `hash.ts`, `world.ts`; `lint:sim` | `lift-ppk.mjs` lifts camera, input, touch, FX, HUD bits with provenance headers; empty map renders with IsoRig; budget gate; crash overlay; host page stub with bridge handshake | `npm run build && npm run budget` green; `lint:sim` green; the iframe loads in `/pawlegends` locally |
| **M1** | 3 to 6 (Oct 26 to 29) | Map data, lanes, waves, towers, cores, win; commands and replay; `headless-match.mjs`; Worker + protocol | Renderer consumes snapshots (minions, towers); desktop input → commands; HUD skeleton; backend module skeleton, SKU table, Stripe test checkout and webhook | A minions-only match ends with a core kill; same seed gives the same hash twice in Node and in the Worker; a Stripe test purchase grants once |
| **M2** | 7 to 10 (Oct 30 to Nov 4) | 18 primitives; 4 kits, talents, Paw Tricks; XP, levels, respawn; `verifyReplay` + vendor-sim | Hero bake (or the §6.9 fallback by day 8); telegraphs and indicators; touch cluster; entitlements bridge and cosmetics; `GameType.PAWLEGENDS` touch points (§3.1); `/live` branch in a worker | Each hero's unit test matches §6; a full human-vs-idle match plays at 60 fps desktop; a genuine replay saves once and a tampered one is refused |
| **M3** | 11 to 13 (Nov 5 to 9) | Bots Easy and Normal; rat camp, Pudding, brush, timeline rails; balance batch | First-match tips, results, dare link, roster cosmetics; offer engine, age bands, caps, restore, terms page, notify-me; copy-lint target | 2,000 Normal-vs-Normal matches: median 6:00 to 8:00, p95 ≤ 8:30, no safety end, ≥ 70% core kill before Sudden Death, side win rate 45% to 55%, each hero 42% to 58%, takedowns 2.5 to 3.5 a minute, trailing at 3:30 wins 30% to 40%; the fun1 and fun2 gates (§15 item 12); novice beats Easy ≥ 85%; buy → return → item visible in the next match |
| **M4** | 14 to 15 (Nov 10 to 11) | Tuning pass from the playtest | Device perf runs; 10-person playtest; trademark search result; Stripe live mode; PostHog dashboards for every gate metric | All acceptance tests in §15 pass; launch post and distribution tranche 1 on Thu Nov 12 |

If a milestone slips, cut in this order before moving the launch: talents at L9 (keep L3 and L6), Pudding's escort (keep the calm race and give team XP instead), the upgrade SKU, the dare link.

---

## 15. Acceptance criteria and tests

The POC is done when every item passes.

**Sim and integrity (vitest, Node)**
1. `determinism.test.ts`: 1,000 seeds × random command streams; record then replay gives identical hashes every 30 ticks.
2. `determinism-browser.spec.ts`: 20 seeds produce the same final hash in Node, Chromium and WebKit (Worker).
3. `lint:sim`: no `Math.random`, `Date`, `performance`, `Math.sin/cos/sqrt/pow`, float literals in arithmetic, or iteration over `Object.keys`, Map or Set in `src/sim/**`. Every gameplay number lives in `src/data/`.
4. `replay.test.ts`: `verifyReplay(...)` reproduces the reported result; a changed input byte, seed, `simVersion` or outcome is detected.
5. `commands.test.ts`: every opcode round-trips; a worst-case 11:00 touch match encodes to ≤ 40,000 characters.
6. `perf-sim.test.ts`: a full bot match simulates in ≤ 1.0 s typical, the 11:00 worst case in ≤ 1.5 s.
7. `timeline.test.ts`: Sunset at tick 14,400, Sudden Death at 18,000, safety end at 19,800 with the tie-break rules.
8. `towers.test.ts`: aggro switches to a hero that hits an allied hero; inner and core invulnerability; backdoor protection; ramp cap.
9. `brush.test.ts`: a unit in a bush is absent from the other team's snapshot unless an enemy is within 2 m or in the same bush; bots never target an absent unit.
10. `heroes/*.test.ts`: every number in §6 matches the data and behaves as listed (cooldowns, damage, CC durations, talents).
11. `balance.test.ts` (nightly) and `npm run match -- --gate balance` (2,000 seeds, sim v4): median 6:00 to 8:00, p95 ≤ 8:30, no safety end, ≥ 70% end by a core kill before Sudden Death; side win rate 45% to 55%; each hero 42% to 58%; takedowns 2.5 to 3.5 a minute; a team trailing at 3:30 (takedown difference + 3 per tower ≥ 3) wins 30% to 40%.
12. Bot gates (`npm run match -- --gate <name>`, 200 seeds unless noted, each also with `--check-determinism`):
    - `fun1` (match 1: `--profile naive --difficulty rookie --hero random`): win ≥ 85%; player deaths median ≤ 3, p90 ≤ 4; tower deaths mean ≤ 1; player takedowns median ≥ 5; first player takedown < 60 s in ≥ 80% of matches; first fight with a hero median ≤ 25 s; the match's first takedown median ≤ 40 s; Level 2 median ≤ 0:30, Level 4 median ≤ 2:00 (p90 ≤ 2:30); length median 5:00 to 6:00, p95 ≤ 7:00; ≥ 85% end by a core kill before Sudden Death; time in action ≥ 60%; big-moment gap median ≤ 30 s, longest gap per match median ≤ 45 s (p90 ≤ 60 s); back in the fight median ≤ 12 s; worst 1 s HP loss p99 ≤ 35%; 90%-to-dead median 5 to 6 s, p10 ≥ 3 s.
    - `fun2` (match 2+: `--profile naive --difficulty easy`): win 70% to 80%; deaths median ≤ 4; takedowns median ≥ 4; Level 4 median ≤ 2:15; length median 6:00 to 7:30; takedowns 2.5 to 3.5 a minute; level gap to the enemy average at 5:00 median ≤ 1.
    - `novice` (400 seeds): the novice profile beats Easy ≥ 85% and Normal ≥ 40% (`--difficulty normal`).
    - `idle` (`--profile idle --difficulty rookie`): win ≤ 50% (doing nothing must not reliably win).
13. `protocol.test.ts`: every message type round-trips; the Worker and a mock WebSocket transport produce identical snapshot streams for the same seed.

**Backend (jest)**
14. `pawlegends-live.spec.ts`: a genuine replay saves once (idempotent by hash); a tampered replay or forged outcome → 4xx, nothing written; an unknown `simVersion` is refused cleanly; catnip respects `PAWLEGENDS_LEVEL_CAPS` and pays once per difficulty; a full queue answers 429 with `Retry-After`; the verify runs off the main thread.
15. `pawlegends-stripe.spec.ts` and `pawlegends-webhook.spec.ts`: each SKU completes in test mode in USD and EUR; the webhook grants exactly once per session; starter cannot be bought twice; a client price is ignored; spend caps and the under-16 block hold; Founder Legend stops at 500; the upgrade charges 20.00 and only for Founder owners; a missing secret gives 503, never a flag.
16. `pawlegends-offer.spec.ts`: no offer in session 1; at most one per session; rules fire in order; none at the spend cap.
17. `vendor-sim:check` passes; `node scripts/sync-contracts.mjs --check` is clean; `live-game.spec.ts` shows PAWLEGENDS in `liveGameTypes` and not in `scoredGameTypes`; backend `npm run lint && npm run build && npm test` green; client `npx tsc --noEmit` and `npx eslint .` green.

**Client and flow (Playwright, 1280×720 and 844×390 landscape)**
18. `match-desktop.spec.ts`: RMB move reaches a point; A-move attacks; Q quick-casts; hold Q shows the range and an out-of-range release walks in and casts; Nap completes; an Easy match finishes and the results screen shows.
19. `match-touch.spec.ts`: joystick moves; Attack hits by priority; drag W shows the indicator and ✕ cancels without a cast; portrait shows the rotate prompt.
20. `first-match.spec.ts`: the first Easy match is 1 tap from the title; each tip fires on its event and hides after it is done.
21. `embed.spec.ts`: wrong-origin messages are ignored; the game never posts to `'*'`; no `accesstoken` in any message; `roster` renders owned cats as chromas, frames and Companion Kittens; `match-result` reaches the host and the host posts `/live`.
22. `store.spec.ts`: purchase in Stripe test mode, return to the game, the item renders in the lobby and the next match; restore by email in a clean profile; with `app{isApp:true}` the store, offers and purchased cosmetics are absent; no offer card in session 1.
23. `perf.spec.ts`: budgets in §10 (draw calls, heap, cold load); `window.__GAME__` and other debug hooks absent from `dist`.

**Compliance**
24. `tools/copy-lint/` (with the new `pawlegends` target) passes on every Pawlegends string (game, store, host, terms): no shelter, impact or money words in game copy; no Tails rate; no token, chain or USDC words; the STELLAR element is labelled "Star".
25. `grep -rE "PAWLEGENDS_[A-Z_]*_ENABLED"` across the repo is empty.
26. Every lifted PPK file has a provenance header.

**Device gate (manual, recorded in `pawlegends/README.md`)**
27. iPhone 11 and Pixel 6a, landscape Low, full teamfight with a wave: p95 ≤ 33 ms, draw calls within §10, heap ≤ 150 MB. Iris Xe Med p95 ≤ 16.7 ms.

---

## 16. Out of scope for the POC (moved to the MVP unless noted)

- Realtime PvP, the match server, matchmaking, ranked, MMR, parties, invites; own-hero prediction and reconcile, the netsim latency option.
- Chat of any kind; report and block come with PvP.
- Fog of war, Grizzlechop, the crow roost, the second rat camp per side, 4 more bushes.
- Hard bots.
- The separate tutorial map, the 7-day Welcome Path, the Legend Moment clip, the share card.
- Controls listed in §9 "MVP adds".
- My Cat Hero (coat builder and photo), names in credits and on the Founders' Banner.
- Yarn, account levels, mastery, free rotation, daily quests, faction war.
- Premium currency, pass, Club, à la carte skins, bundles, cameo minions, billboards, the Shelter Bow, crypto checkout.
- Rescue coats for shelter-origin cats.
- IAP and any purchase or purchased item in app builds.
- Items, gold, tower plating.
- Duel, 5v5, Arena, Swarm, a second map, portrait mode, a choice of map side.
- Tails rewards. Localisation (English only).
- Any change to Bad Cat, Heist or PPK code; Bad Cat's `BADCAT_*_ENABLED` flags are left as they are and not copied.

---

## 17. Start tomorrow: day-1 checklist

1. Founder decisions #3 (PPK licence and provenance) and #17 (VAT) answered or defaulted (GDD §12).
2. `git log -1 --format=%h` in the Swordcat checkout (`../swordcat`) recorded as the lift base commit in `pawlegends/README.md`.
3. Scaffold `pawlegends/` from `bad-cat/package.json` minus its game deps; port 5176; scripts as §2.1.
4. `tools/lift-ppk.mjs` with this first list: `src/camera/{IsoRig,Picker,Occluders,CameraShake}.js`, `src/core/{Input,toon}.js`, the `INPUT.presets` and `INPUT.keys` blocks of `src/core/config.js` (as data), `src/companions/abilityAim.js`, `src/ui/{touch,touchLayout,abilityBar,hpBars,messages,inputGlyph}.js`, `src/ui/ui.css`, `src/fx/{GroundDecals,Telegraphs,DamageNumbers,Particles,Shockwaves}.js`. Each gets a header: PPK commit, source path, "all rights reserved, pending founder decision".
5. `src/sim/fixed.ts`, `rng.ts`, `hash.ts` with their tests, and `tools/lint-sim.mjs`, before any other sim file.
6. `src/data/map.ts` from §5 and `src/data/heroes/*.ts` from §6, in the units of §4.2.
7. Stripe test-mode keys in the local backend env (names in §8.3; never read or commit `.env*`).
8. Book the 10 playtesters for Nov 10 and start the EUIPO, USPTO and app-store name searches (GDD §1).
