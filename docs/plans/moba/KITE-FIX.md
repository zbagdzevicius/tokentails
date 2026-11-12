# KITE-FIX: move between basic attacks on touch (sim v23)

Built on branch `fix/pawlegends-kite` (from sim v20) and parked there; it ships as **sim v23** = the live v22 + this fix,
on branch `feat/pawlegends-v23-kite` (§ Sim v23 below). `Op.Kite` is opcode **12** in v23 (the branch used 11, which
v21 gave to the Kibble Cannon's `Op.Fire`).

## The report

Player, 2026-11-11: "they can't both run and attack (as there's a gap between basic attack and next one which could
allow to)". Wild Rift lets you hold Attack and steer with the joystick: the hero walks during the attack cooldown and
the next basic fires as soon as it is ready.

## Confirmed cause (v20, touch only)

Desktop is fine: right-click ground / right-click unit is League's sequence, and a client that times it kites at full
damage. On touch, with an attack order standing (held ATK, a tapped ATK, or a drag-lock) and the stick held away from the
target, the hero stands still and attacks. Headless, 5 s: 5 hits and 0 m walked for both Rocket and Clem. A client that
times its moves walks about 16 m with the same 5 hits.

1. Held ATK re-sends Attack every 350 ms (`touchControls.ts`, `ATTACK_REPEAT_MS`). An Attack on a unit in range during
   the cooldown plants the hero (`hero.ts` `engage` → `swingAt` refused → state Attacking, no walk).
2. A steady stick never re-sends its move: the re-send needs a turn, the goal near, or `stalled`, and `stalled` only
   counts `'idle'` (the planted hero reports `'attacking'`).
3. Re-sending moves does not help: a Move mid-windup cancels the swing (the v20 rule), so every attack is lost (0 hits).
4. The client cannot time it: the snapshot has no attack timer or windup flag.

## The fix

**Sim (new op, behaviour unchanged for every existing command):**
- `Op.Kite = 12` (sim v23; 11 on the parked branch) `{ x, y, id }`, 6 bytes (`api.ts`, `commands.ts` encode/decode/quantize, `net/proto.ts` `CMD_OP`/`CMD_SIZE`).
- `Order.Kite = 4` (`world.ts`). `applyOrder` (`hero.ts`): a unit that is gone or untargetable makes it a plain Move. A
  kite on the unit already targeted keeps the windup in progress (so a held stick re-sending never throws a swing
  away); another unit cancels the swing with the timer refunded, as any new command does.
- `kite()` in `stepHero` (`hero.ts`): while the attack timer runs the hero walks toward (x, y). The tick the timer is
  ready and the target is within attack range + `HERO_RULES.chaseLeeway` (0 while rooted or planted), it swings and
  stands through the windup (`followSwing` as for Attack). Out of reach it keeps walking; the target is not chased (the
  stick wins). At the goal it stands with the order kept. A target that dies leaves a plain move to the goal.
- Input gate (`sim/input.ts`): a kite counts as a move (spaced by `MOVE_MIN_GAP`, gives way to a cast of its tick).
- `dash.ts`: a Kite survives a dash or knockback like Move/AttackMove. `stilts.ts`: no auto-pounce while kiting.
- Unchanged on purpose: Move still cancels a windup with the timer refunded (v20). AttackMove is untouched, so bots
  (which use AttackMove) do not start kiting.

**Client:**
- `orders.ts` `kite(x, y, id)` (goal clamped like a move). `net/input.ts`: a kite coalesces like a move.
- `touchControls.ts`: with an attack intent (held ATK's unit; a tapped or drag-released ATK's unit while its order
  stands) the stick sends `Op.Kite` on that unit instead of a Move. A drag-lock alone does not kite (review): it is
  timer-free, so it would plant a fleeing hero for every windup in reach; the lock still picks the next ATK target. A held ATK repeat with the stick pointing away
  from the target sends nothing new (the kite already carries the attack). A kite starting, ending or changing unit
  goes at once. The stick turned toward the target hands back to a plain Attack (chase). Letting go of the stick while
  kiting leaves an Attack on that unit when ATK is held, or when the unit is in reach and not under an enemy tower
  nobody tanks (the `keepLockOrder` guard); otherwise a Stop, so letting go never walks the hero under a tower.
- `matchSession.ts`: `data-kites` telemetry.

## To fold into the next sim version (done in sim v23, below)

1. Cherry-pick the branch onto the version branch after v21 (conflicts likely in `hero.ts` and `touchControls.ts`).
2. Bump `SIM_VERSION` there and re-vendor the sim and the net bundle (`tools/vendor-sim.mjs`), because the relay's
   vendored `CMD_SIZE` must know op 11 and the server sim must apply it. The client sends `Op.Kite` unconditionally, so
   it must never run against a v20/v21 room: ship the client only with that sim version.
3. Re-run the gates of that version (chase gate, determinism nightly) since bots are untouched but replays now carry a
   new op.

## Tests

- `tests/unit/kite.test.ts`: op round-trip and gating; Rocket and Clem with ATK held and the stick away from a chasing
  target, or strafing beside a still one, keep every swing (at most one short of standing still) and walk over 4 m;
  a target out of reach is not chased; same-unit kite keeps the windup, another unit or a Move refunds the timer; a
  kite on a dead id is a move; determinism (hash trails and record → replay with kites mixed in).
- `tests/unit/stick-yield-touch.test.ts`: stick held away with ATK held (3 s of kites on the unit), after a tap, or
  after a drag release sends kites; a drag-lock alone sends moves; a tapped kite let go out of reach is a Stop; stick toward the target yields to the Attack; stick let go mid-kite leaves an Attack;
  ATK let go returns the stick to plain moves.
- `tests/e2e/kite.spec.ts` (landscape 844x390 touch, Rocket, rookie): ATK held next to an enemy minion, the stick
  strafes beside it for 3 s; kites are sent, the hero walks and hits keep landing. Before the fix the same input walked
  0.2 m in 2.4 s.

## Balance

Bots issue only Move, AttackMove, Attack and casts, never `Op.Kite`, so every bot-only match (the 3v3 balance gate,
the goldens, the determinism suite) replays bit-identically to v20: the gate cannot measure the change. Expect human
ranged heroes (Rocket, Clem and other long-range basics) to gain the most, since the stick now keeps their DPS while
they back off a melee chaser; melee heroes gain little (in reach they were already swinging). Watch ranged win rates in
the first live week of the version that ships this.


## Sim v23 (2026-11-12): v22 + this fix

Branch `feat/pawlegends-v23-kite` from `origin/main` (v22 live at `9c098621`, client bundle `e3d05f2c`).

**Port.** The two branch commits cherry-picked onto v22. Changes against the branch:
- `Op.Kite` is **12** (`api.ts`, `commands.ts`, `net/proto.ts` `CMD_OP` / `CMD_SIZE` `[…, 5, 6]`): v21 took 11 for `Op.Fire`.
  The input gate keeps v21's Fire in `keepsMove` and counts a kite as a move.
- v21's Boing Beds (`units/boing.ts`) and Mega Yarn Ball kicks (`units/yarn.ts`) treat a kiting hero as walking (a held
  stick with ATK takes a bed or kicks the ball as a plain stick would). Bots never kite, so bot play is unchanged.
- Relay (`backend/src/pawlegends/party/room.ts`): `CLIENT_OPS` gains Kite, and a kite coalesces with a pending move and
  skips the command token bucket, as the client's `MoveCoalescer` and the sim's gate already treat it. Without this a
  party or PvP room would have answered every kite with `bad_op`. A v22 room still strikes op 12 (its decoder does not
  know it).
- Cannon carry and Blitz needed nothing: a carrier winding the cannon up waits (`cannonWinding` before orders), and
  mutators do not read orders.

**Versioning.** `SIM_VERSION` 23. `tools/vendor-sim.mjs` freezes v22 at `9c098621` (bundle `f0381a93…`, with the Blitz
fixture in `extra`), so the backend verifies 10 to 23. New live fixture `kite-replay.fixture.json` (Rocket, Easy, seed
2323: the normal player-bot with every Attack turned into a kite 2 m back from the unit); v23 verifies it and v22 refuses
it. The net bundle is re-vendored (relay `CMD_SIZE`). Sim golden unchanged (`1edabde3`); every v23 bot-only fixture
(rookie, champion, dogs, forfeit, PvP, Hearthwood solo / party / PvP, Blitz) is byte-identical to v22's apart from
`simVersion` / `simHash`.

**Headless repro** (5 s, the kite.test.ts setup, target tanky):

| Hero, target | v22 touch (ATK held re-sends Attack, stick away) | v23 kite, stick straight away | v23 kite, stick strafing |
|---|---|---|---|
| Rocket, chasing | 6 hits, 0.0 m | 6 hits, 17.3 m | 6 hits, 17.3 m |
| Rocket, standing | 5 hits, 0.0 m | 1 hit, 24.1 m (walks out of reach; not chased, by design) | 5 hits, 17.5 m |
| Clem, chasing | 5 hits, 0.0 m | 5 hits, 18.3 m | 5 hits, 18.3 m |
| Clem, standing | 5 hits, 0.0 m | 1 hit, 23.7 m (as above) | 5 hits, 19.2 m |

Same hits, about 17 to 19 m walked (the timed-client estimate was ~16 m).

**Gates on unseen seeds, v23 and v22 on the same seeds** (v22 = `git archive 9c098621`):

| Gate | Seeds | v23 | v22 on the same seeds |
|---|---|---|---|
| 3v3 Skirmish (`--gate balance`) | 8,000 from 5000001 | 35 / 35 pass: side 48.9%, cats 49.5%, heroes 48.3–52.1%, median 7:11, p95 8:31, 0 safety, 3.48 takedowns/min, trailing at 3:30 wins 28.2%, down 10+ wins 2.2% | 8,000 / 8,000 rows identical (final hash, ticks, winner, reason, input size); same gate table |
| Blitz (`--gate blitz`) | 4,000 from 5100001 | side 47.8%, cats 50.7%, 19 / 20 heroes (Duchess 56.1%), 2:55 / p90 2:58, 100% core, 4.04 takedowns/min, trailing at 1:30 wins 15.5% | 4,000 / 4,000 identical; same table |
| Classic (`hearth-gates --det 40`) | 600 seed pairs from 5300001 (1,200 matches) | side 50.1%, cats 48.9%, 20 / 20 heroes 46.3–54.0%, p50 13:06 / p95 13:13, 0 safety, determinism 120 / 120 | 600 / 600 rows identical (line-ups, ticks, winners, Grizzlechop, Pudding); same table |
| Crossing identity (`map-identity`) | 1,500 seeds × 3 fuzz profiles from 5500001, baseline written from v22 | 4,500 / 4,500 identical | — |
| Determinism (`determinism.mjs`) | 100 seeds from 5600001 + PvP, Blitz, Hearthwood every 4th | all identical | — |

Bots never send `Op.Kite`, so every bot-only match is byte-identical to v22: no refit. The Blitz misses (Duchess 56.1%,
trailing at 1:30 wins 15.5%) are v22's own rows on a fresh window (identical on v22); the trailing figure is the
§5.1 founder call in BLITZ.md, and Duchess was 47.2–52.8 pooled in v22's E + F windows. Not changed here.

**Checks.** `tsc` (pawlegends, backend), `lint:sim` (163 files), `vendor-sim:check` (v10–v22 frozen, v23), `vitest` (all
pass after the version bumps), backend `jest src/pawlegends src/vendor` (70 suites, 1,026 tests), `build`, `budget`
(first load 417.9 KB gzip, party chunk 43.6 KB). Not run: the Playwright `tests/e2e/kite.spec.ts`, and
`npm run build:client` (the client bundle ships with the release).

**Watch after release:** ranged hero win rates in human matches (Rocket, Clem, other long-range basics), and the
`data-kites` telemetry.
