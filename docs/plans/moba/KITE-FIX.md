# KITE-FIX: move between basic attacks on touch (fold into the next sim version)

Branch `fix/pawlegends-kite` (from `origin/main`, sim v20). Not released: it adds a sim op, so it ships only as part of
the next sim version after v21 (v21 is releasing, v22 is in progress). Do not merge it into `main` on its own.

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
- `Op.Kite = 11` `{ x, y, id }`, 6 bytes (`api.ts`, `commands.ts` encode/decode/quantize, `net/proto.ts` `CMD_OP`/`CMD_SIZE`).
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

## To fold into the next sim version

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

