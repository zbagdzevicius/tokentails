# V20: basic attacks while chasing, Wild Rift rules (sim v20 + touch/desktop input)

**Status:** implemented (sim v20 + input), see §8 Results. Branch `fix/pawlegends-chase-2` (from `origin/main` d65a13ba, live SIM_VERSION 19).

**Founder asks, verbatim:**
- "ultracode it's still can't hit properly while chassing, fix it"
- "ultracode replicate wild rift basic attacks ways of working ( where point of contact is enough )"

Follows V18-CHASE.md (sim v18, chase leeway, `followSwing`, stick yield). The founder reports the bug is still there.

## 0. Target model (Wild Rift / LoL basic attack, as checked)

| Rule | Source | Sim v19 today | v20 |
|---|---|---|---|
| Range is edge to edge: attacker edge to target edge (gameplay radius on both units) | **Confirmed.** LoL Wiki *Range*: "Basic attacks always use edge range", edge range = "From the source's edge to the target's edge". No WR-specific page says otherwise (WR runs the LoL rules) | sim yes (`attack.ts:25`: range + both radii); **client no**: subtracts only the target body | client = sim (I1) |
| Chase: walk until the attack range meets the target's radius, then stop and swing; keep the target until it dies, becomes untargetable or a new command is given | LoL Wiki *Basic attack* | sim yes (`hero.ts:390-398`, `engage`) | unchanged |
| A started basic attack "cannot be avoided under normal circumstances"; the windup breaks on a new command, death, untargetable, lost sight, or the target moving "too far away" (distance not published) | LoL Wiki *Basic attack* | lands only if target within reach + target radius (500 mm) at windup end (`attack.ts:99`), else silently dropped | lands within reach + `swingBreak` 1000 mm (S3) |
| A cancelled windup does not spend the attack (you can swing again at once) | **Confirmed.** LoL Wiki *Attack speed*: "When the windup is interrupted by any means, the attack timer stops counting and resets to zero." *Basic attack*: "There exists a grace period of one game-tick (0.033 seconds) before a champion's attack windup completes" (a move/stop in it does not cancel) | timer spent at swing start (`attack.ts:41`), never refunded | refund on every cancel (S1) |
| Re-issuing an attack on the unit you are already attacking does not restart the windup | LoL / WR behaviour | `Op.Attack` keeps the windup; **`Op.AttackMove` zeroes it** (`hero.ts:100-106`) | A-click on the current target keeps the windup (S2) |
| Ranged basics are homing projectiles; walking does not dodge them | LoL Wiki *Basic attack* | yes (`fireBolt`, `stepBolt`) | unchanged |
| WR "Force Attack Follow" (off by default): briefly chases the selected target and ignores the stick | Upcomer WR settings; Dev Tracker WR auto-lock thread | n/a | not copied: stick away from the target always moves (kiting) |
| MLBB "joystick while holding attack keeps attacking" | **no source found** | – | we keep the v18 rule: stick within 90° of the target yields, stick away moves |

"Point of contact is enough": melee reach centre to centre is range + 500 + 500 mm (heroes), so a melee swing starts
when the bodies meet plus the hero's range; `chaseLeeway` 300 mm stays as the small melee buffer. No change to radii.

## 1. Verified root causes (code read on this branch)

| # | Cause | Where (verified) | Severity |
|---|---|---|---|
| R1 | Client range is 200 mm short of the sim: `dist − BODY_MM[target] <= range + 300` leaves out the attacker's own 500 mm, while the sim reach is range + both radii | `src/input/targeting.ts:94-95` (attackPriority), `:153` (lastHitTarget), `:166` (inAttackReach), `:200` (towerTarget); `src/input/touch/assist.ts:143-145, 155` (autoAttackTarget); `range()` = `basicRange(hero)` = `base.range` only (`touchControls.ts:1042`, `abilities.ts:230`) | high (touch) |
| R2 | Held ATK re-picks every 350 ms (`ATTACK_REPEAT_MS`, `touchControls.ts:137`): `hero ?? kill ?? reachHero ?? minion ?? tower ?? nearHero` (`targeting.ts:130`); a hero just past the (too short) client range is only `reachHero`, dropped near its tower (`:117`), and a killable minion outranks it. `attackNow` stores the pick or **null** (`touchControls.ts:1100`) → `yieldsToAttack` stops yielding (`:1234-1240`) → `steer` sends a Move → sim clears order + windup (`hero.ts:99-106`) | targeting.ts, touchControls.ts | **high: kiting to tower 1.0 hits / 6 s for every hero (vs 5.9 with one order)** |
| R3 | Every cancelled swing still spends the full attack timer (~1 s): set at `startAttack` (`attack.ts:41`), not refunded on Move/AttackMove (`hero.ts:106`), Stop (`:129`), `interrupt` (`status.ts:80`), forced movement (`dash.ts:104`), the disabled/kitBusy drop (`attack.ts:93-95`) or the out-of-range drop at windup end (`attack.ts:99`) | sim | high (Pounce during windup: 0 hits for all 20 heroes) |
| R4 | Desktop A-click repeated on the fleeing target zeroes the windup each time (`Op.AttackMove` path, `hero.ts:100-106`): every 250 ms → 5 windups, 0 hits in 5 s | sim | high (desktop) |
| R5 | Touch tap: the stick yields only `STICK_YIELD.tapMs` 700 ms after a tap (`assist.ts:111`, `touchControls.ts:1236`); then `lastStick.a = NaN` makes the next frame send a Move at once, replacing the Attack order. Tap every 1 s with the target 800 mm past reach → 0 hits | input | medium |
| R6 | Stilts `autoPounce` dashes mid-windup when the target is just past plain reach (exactly the leeway zone); the dash zeroes the windup (`dash.ts:104`), the timer stays spent | `src/sim/heroes/stilts.ts:131-143` | medium (Stilts only: 2 of 3 straight swings land) |
| R7 | Windup end re-checks with only the target's radius as slack (`attack.ts:99`) and drops silently | sim | low (0–3 per match, contradicts the target model) |
| R8 | App Store (stable) OTA is `20261108060319-a0f3129`, sim 15, **without the v18 fix**; `pawlegends-app/scripts/ota-publish.mjs:133-137` only promotes the current beta once it is 24 h old, and beta is republished several times a day, so stable never promotes | release | **high if the founder plays the App Store build** |
| – | Speed physics: a target 5%+ faster escapes after the first hit; a 1.5 s slow ends the chase | by design | matches WR; not changed |
| – | Same-tick Attack + Move: the later one wins (`src/sim/input.ts:83-92`) | sim gate | not changed (the stick yield prevents it; I3 keeps that) |

## 2. Changes

### 2.1 Input (client only, no sim version)

**I1. One reach rule, the sim's.** New helper in `src/input/targeting.ts`:
`edgeGap(me, u) = dist(u, me) − BODY_MM[me.kind] − BODY_MM[u.kind]` and `inReach(me, u, range, slack = CHASE_LEEWAY_MM)`
with `CHASE_LEEWAY_MM` imported from `HERO_RULES.chaseLeeway` (one source, 300). Use it in `attackPriority`,
`lastHitTarget`, `inAttackReach`, `towerTarget`, `autoAttackTarget` (both branches; drop the `range − 300` /
`AUTO_SLACK` juggling in `assist.ts:141-145` and `touchControls.ts:1187` in favour of the explicit slack argument).
`HERO_REACH_MM`, `LAST_HIT_REACH`, `ATTACK_SEEK_MM`, `lockBreakMm` keep their values but are now measured edge to edge on
both sides (they all get 500 mm more reach; re-check the ATK ring / deny-ring visuals and the targeting unit tests).
- Effect: the client calls a target "in range" exactly when the sim would start the swing (+ leeway). 0 mm mismatch.

**I2. Sticky held target (WR: the target stays until it dies, goes untargetable, or a new command).**
In `attackNow` (`touchControls.ts` ~1077-1100) when the press is a repeat of a held ATK (or a tap while a target is
already set):
1. If `atkTarget` is alive, targetable and `edgeGap <= range + lockBreakMm(range)` → keep it; do not call
   `attackPriority` at all (so no tower guard, no last-hit, no minion can steal it). Do not resend `orders.attack`
   when the sim already has `Order.Attack` on that id (read from the view); resend only if the view shows the order
   was replaced.
2. Otherwise re-pick as today.
3. A re-pick that returns `null` **never** clears `atkTarget` while ATK is held; it only shows the deny ring. The
   old target is dropped only when it dies / untargetable / beyond lock-break.
- Effect: hold path, kiting to tower: from **1.0 to >= 5.6 melee / >= 5.6 ranged hits per 6 s** (>= 95% of the
  single-order numbers 5.9 / 6.3), 0 target switches away from the chased hero while it is inside range + lock-break,
  0 moves sent by the stick toward it.

**I3. A tap locks like a hold (WR tap-to-attack).** `yieldsToAttack` yields while `atkTarget` is set and the sim view
still has `Order.Attack` on it, not only for `tapMs` 700 ms. It stops yielding when: the stick points more than
`STICK_YIELD.turn` (90°) away from the target (retreat/kite: moves at once, as today), the target dies / is
untargetable / leaves lock-break, or any other command is given (ability, recall, ground tap). Remove `tapMs`.
When the yield ends, keep `lastStick.a = NaN` (the move goes at once, correct for a turn-away).
- Effect: tap path >= 95% of single-order hits on every harness path (today 4.0 / 4.4 kiting, 5.0 / 5.6 straight);
  0 Attack orders replaced by the stick while it points within 90° of a living locked target.

**I4. Desktop A-click on a unit = attack that unit.** In `src/input/orders.ts`, an attack-move whose click lands on
(or within the hover pick of) an enemy unit sends `Op.Attack(id)` instead of `Op.AttackMove(x, y)` (LoL/WR: A-click on
a unit targets it). If it is the unit already being attacked, send nothing. Ground A-clicks stay `AttackMove`.
- Effect: A-click every 250 ms on the fleeing target: from 0 to >= 5 hits in 5 s (same as right-click).

### 2.2 Sim v20

All new constants integers in `src/data/**` (lint:sim). Every change gated on nothing (no flags); replays below v20
run the frozen v19 bundle.

**S1. Refund the attack timer on a cancelled windup.** New `cancelSwing(w, id)` in `src/sim/combat/attack.ts`:
`if (w.windup[id] > 0) { w.windup[id] = 0; w.attackTimer[id] = 0; }`. Replace every bare `w.windup[id] = 0` on a
live windup with it: `hero.ts` Move/AttackMove (`:106`) and Stop (`:129`); `status.ts interrupt` (`:80`); `dash.ts`
forced movement (`:104`); `attack.ts` disabled/kitBusy drop (`:93-95`); `attack.ts` out-of-reach drop at windup end
(S3). Heroes, minions and camps alike (minions/camps rarely cancel; keep it uniform, check the minion-wave fixtures).
- Mirrors LoL/WR attack cancelling (confirm the wiki sentence first and quote it in the commit; if the wiki says the
  timer is kept, apply S1 to the out-of-reach and target-gone drops only, which are not player choices).
- Effect: target Pounces during the windup: from 0 to >= 1 hit in 6 s for every chaser that is back within reach
  (assert `attackTimer == 0` right after every cancel); stick/Move cancels cost 0 ticks of attack timer.
- Abuse check: cancelling and restarting cannot raise DPS because no damage is dealt without a full windup
  (8 ticks). Animation-cancel spam simply delays the hit.

**S2. Re-issuing the attack does not restart it.** In `applyOrder`:
- `Op.Attack` with `cmd.id === w.target[id]` and `w.order[id] === Order.Attack`: no-op (no `cancelSoft`, keep path).
- `Op.AttackMove` while `windup > 0` and `w.target[id]` still targetable: keep `target` and `windup`, only update
  `moveX/moveY` and the order (the swing finishes, then the attack-move continues from `engage`). This is the sim-side
  half of R4 (I4 is the client half; S2 also covers bots, replays and any other client).
- Effect: A-move spam at any rate: windups never reset; hits = attack-speed limit.

**S3. A started swing completes (WR "cannot be avoided").** Heroes: at windup end the swing lands/fires when the
target is targetable and within reach + `HERO_RULES.swingBreak` (new, **1000** mm, equal to the melee lock-break
`LOCK_BREAK.melee`; WR's "too far away" is not published). Minions/camps keep the target-radius slack. A drop past
`swingBreak` goes through `cancelSwing` (timer refunded). `followSwing` stays (the hero keeps stepping with the target).
- Effect: 0 swings cancelled by <= 1000 mm of drift past reach during the windup (an 8-tick windup at 5300 mm/s
  speed difference 0–10% gives <= 150 mm of drift, so in practice every started swing on a walking target lands;
  only dashes/blinks past 1 m escape, as in WR).

**S4. Stilts never pounces out of her own swing.** `autoPounce` (`stilts.ts:131`): return when `w.windup[id] > 0`,
and when `inAttackRange(w, id, t, HERO_RULES.chaseLeeway)` (the leeway swing will land; pounce only on a real gap).
- Effect: Stilts lands 100% of started swings on straight and zig-zag runs (from 2/3 and 3/5); straight-run hits
  >= the melee average (5.6).

**S5. Unchanged on purpose:** `chaseLeeway` 300 (WR's small melee buffer), radii, speeds (a faster target escapes,
as in WR), homing bolts, the same-tick command gate.

### 2.3 Release (R8)

- After v20 lands: run the OTA workflow with `promote_now` so the App Store channel gets the fix (today stable is sim 15).
- Fix `ota-publish.mjs:133-137` to promote the **newest bundle that is >= 24 h old** instead of requiring the current
  beta to be 24 h old (otherwise stable never moves while beta is republished daily). Note in the founder summary
  that OTA applies on the next cold start (force-quit and reopen).

## 3. Targets (measured with `tools/chase-harness`, 20 heroes, 6 paths, ±10% speed, 6 s; and full bot matches)

| Metric | v19 | v20 target |
|---|---|---|
| Single order, equal speed, straight / zig-zag / kiting | M 5.6–5.9, R 5.9–6.3 | unchanged (± 0.2) |
| Touch hold, kiting to its tower | M 1.0, R 1.0 | **>= 95% of single order** (M >= 5.6, R >= 6.0) |
| Touch tap every 900 ms, every path | M 4.0–5.1, R 4.4–5.6 | >= 95% of single order |
| Desktop A-click every 250 ms | 0 hits / 5 s | >= 5 hits / 5 s |
| Ranged chaser: started swings that fire | ~100% | 100%; hits >= 95% of possible attacks at equal speed |
| Melee, equal speed, starting in reach | first hit in 7 ticks | first hit <= 8 ticks (windup), every run |
| Started swings cancelled by drift <= 1000 mm | possible (> 500 mm drops) | **0** |
| Attack timer after any cancelled windup | spent (~30 ticks) | 0 |
| Target Pounces mid-windup | 0 hits (all 20) | >= 1 hit when back in reach; 0 timer lost |
| Stilts started swings that land | 60–67% | 100% |
| Stick within 90° of a living locked target in lock-break | sends Moves after 700 ms (tap) / on re-pick switch | **0 Moves**, 0 order replacements |
| Held-ATK switches off a chased hero inside range + lock-break | 34–43 per 10 heroes (kiting) | 0 |
| Full bot match: ready + enemy hero in reach ticks that become a swing | 60–75% | >= 95% |
| Target 5–10% faster / chaser slowed | 1.0–1.7 hits | unchanged (WR physics) |

## 4. Balance plan

S1–S4 and I1–I3 land more basics on heroes in fights, mostly for melee divers (Stilts most, via S4) and anyone whose
target used to Pounce/blink mid-windup. v18 precedent: chase fix alone took 3v3 takedowns 3.3 → 4.7 a minute and was
pulled back with `HERO_BASIC_VS_HERO_BP` 6500 + `HERO_VS_HERO_BP` 10500 + pvp rows.

1. **Probe untuned** (sim only; bots do not use the touch client, so I1–I4 do not move bot balance, S1–S4 do):
   - 3v3: `npm run match -- --gate balance` (seeds 1–2000) and `--from 2001` (seeds 2001–4000). Bands: every hero
     46–54%, takedowns a minute 2.5–3.5 (V18 sat at 3.37 / 3.39), PvE human side band 48.4–51.4%.
   - `node tools/pvp-symmetry.mjs` 2000 seeds: map side and cats vs dogs 47–53%.
   - 5v5: `node tools/hearth-gates.mjs --seeds 2000`: side 47–53, cats/dogs 47–53, per hero 46–54, p50 12:00–14:30.
2. **Global knob first:** if 3v3 takedowns > 3.5 or 5v5 p50 < 12:00, lower `HERO_BASIC_VS_HERO_BP` (src/data/heroes/
   index.ts:129) in 500 bp steps (6500 → 6000 → 5500), 1,000-seed probes each, as V18 §3.2. Leave `HERO_VS_HERO_BP`
   10500 unless basics alone cannot bring it back (abilities did not change).
3. **Per-hero `pvp` rows** (`dmgBp` / `takenBp` moved together, as V18 §3.3) only for heroes outside 46–54% in either
   window on either map. Expected movers: Stilts (S4: up), melee divers Brutus / Clem / Frankie (S1/S3: up), heroes
   whose kit Pounces/blinks out of swings (S1 helps their chasers: down). Fit on both 3v3 windows and the 5v5 2000-seed
   run together; a row change must keep both maps in band (Hearthwood and the 3v3 map).
4. Update the pinned expectations V18 touched: `kit-helpers.ts basicHit`, Bengas / Duchess / Lambo / round2 /
   champions-final pvp and basic-hit lines.

## 5. Tests to add

Sim (`tests/unit/`):
- `chase-attack.test.ts` (extend): swing started in reach lands when the target walks 900 mm past reach during the
  windup (melee and ranged); dropped (and timer 0) at 1100 mm; Pounce/blink mid-windup → `attackTimer === 0`, next
  swing starts the tick it is back in reach.
- `attack-cancel-refund.test.ts`: each cancel path (Move, Stop, AttackMove to ground, `interrupt`, knockback/dash,
  kitBusy, out-of-reach at end) leaves `windup 0` and `attackTimer 0`; a landed swing still spends it.
- `attack-reissue.test.ts`: `Op.Attack` same id every tick and `Op.AttackMove` on the same unit every 8 ticks →
  hits at the attack-speed limit (A-move spam 5 s ≥ 5 hits).
- `stilts-pounce.test.ts`: no pounce while `windup > 0` or within reach + leeway; still pounces at a real gap.
- Determinism: `tools/determinism.mjs` 1,000 seeds + PvP identical across runs.

Input (happy-dom, real `TouchControls` + `Orders` + sim, as the diagnosis harness):
- `targeting-edge.test.ts`: for every hero, `inAttackReach` / `attackPriority` / `autoAttackTarget` / `lastHitTarget`
  / `towerTarget` agree with sim `inAttackRange` (+ leeway) at the boundary ±10 mm (property test over distances).
- `held-atk-sticky.test.ts`: held ATK on a hero kiting to its own tower and through a minion wave with a killable
  minion → `atkTarget` never changes and no Move is sent while the hero is inside range + lock-break; null re-pick keeps
  the target.
- `stick-yield-touch.test.ts` (extend): tap once, hold the stick toward the target for 5 s → 0 Moves, ≥ 4 hits; stick
  turned > 90° away → Move within one frame; ability press ends the yield.
- `orders-amove-unit.test.ts` (desktop): A-click on a unit sends `Op.Attack(id)`, nothing when it is the current target.
- Promote `tools/chase-harness/` into a gated script (`npm run chase-gate`) asserting the §3 table; keep it out of
  `npm test` (6 s × 20 heroes × 6 paths), run it in the release check.

## 6. Release mechanics

- `SIM_VERSION` 20; freeze v19 in `pawlegends/tools/vendor-sim.mjs` `FROZEN` the way v18 was frozen for v19
  (`git log -S"FROZEN" -- pawlegends/tools/vendor-sim.mjs`): commit hash, bundle hash, fixtures. Backend verifies v10–v20;
  `backend/src/vendor/pawlegends-sim/v19/` byte-identical to `origin/main`.
- `npm run lint:sim` (no float literals in `src/data/**`), `npx tsc --noEmit`, `npx eslint .`, `vitest` (rerun the
  known flaky timing tests in isolation: perf-sim, net-rejoin, anim/root, tools/trailer copy-gate).
- Client bundle rebuild, then OTA beta, then `promote_now` to stable (§2.3).
- Never commit `pawlegends/node_modules` (symlink). Leave the untracked `tests/unit/zz-diag-chase.test.ts` alone (not ours)
  or move it into the harness with the owner's OK.

## 7. Order of work

1. I1–I3 (touch; biggest effect, no sim version) with their tests and the harness hold/tap numbers.
2. I4 + S2 (desktop A-click).
3. S1, S3, S4 (sim v20) with tests, determinism.
4. Balance probes and retune (§4), both maps.
5. Freeze v19, bundle, OTA beta, promote stable, fix the promote rule.

## 8. Results (implemented)

### 8.1 What shipped

- **Input (I1–I3):** `edgeGap` / `inReach` in `src/input/targeting.ts` (both bodies, `HERO_RULES.chaseLeeway` as the
  one slack) used by every client reach check; `stickyAttackTarget` keeps a held ATK on its hero inside lock-break;
  `AttackYield` (no timer) makes a tap hold like a hold; a null re-pick keeps the order.
- **I4:** the desktop A-click on a unit already sent `Op.Attack(id)` (`desktop.ts`); the remaining A-click bug was the
  ground A-move, fixed in the sim (S2 below).
- **Sim v20:** S1 `cancelSwing` (`src/sim/combat/swing.ts`) refunds the attack timer on every cancel, with LoL's
  one-tick grace (a move/stop in the swing's last tick lets it land); S2 an Attack on the same target is a no-op, an
  attack-move mid-swing or clicked on the current target (within its radius + `HERO_RULES.amoveClick` 1500 mm) keeps
  target and windup, and an attack-move acquires at least out to attack range + radius + leeway (long-range heroes
  never stood idle next to a hero they could hit); S3 a hero's started swing lands within range + `swingBreak`
  1000 mm; S4 Stilts never pounces out of her own swing or inside reach + leeway.
- **Release (R8):** `ota-publish.mjs --promote` takes the newest kept bundle that has soaked 24 h when beta itself is
  younger (the soaked bundle is kept on prune).

### 8.2 Chase harness, v19 → v20 (hits in 6 s, equal speed, mean over heroes; M melee / R ranged)

| Path | Mode | M | R |
|---|---|---|---|
| straight | single Attack order | 5.6 → 6.1 | 5.9 → 5.9 |
| zig-zag | single Attack order | 5.7 → 6.1 | 5.9 → 5.9 |
| kiting to its tower | single Attack order | 5.9 → 6.1 | 6.3 → 6.3 |
| straight | touch ATK held | 5.6 → 6.1 | 5.9 → 5.9 |
| kiting to its tower | touch ATK held | **1.6 → 6.1** | **1.0 → 6.3** |
| straight | touch ATK tapped every 900 ms | 5.0 → 6.1 | 5.6 → 5.9 |
| kiting to its tower | touch ATK tapped every 900 ms | 4.1 → 6.1 | 4.5 → 6.3 |
| straight / zig-zag / tower | desktop A-move on the ground at the target every 250 ms | 0 in 5 s (§1 R4) → 6.1 | 0 → 5.9–6.3 |
| straight / zig-zag / tower | desktop A-click on the unit every 250 ms | – → 6.1 | – → 5.9–6.3 |
| straight | target 5% / 10% faster (WR physics, unchanged) | 1.1 / 1.0 → 1.3 / 1.2 | 1.7 / 1.0 → 1.7 / 1.0 |
| dash 6 m mid-windup, equal speed | single Attack order | 0 → 0 (out of reach for good; timer refunded) | 0 → 0 |

Cancelled windups over the whole harness: 567 → 100 (all 100 are the dash path's escape and the slowed-chaser runs);
windups cancelled with the attack timer still spent: → 0. Stilts' started swings that land (straight, zig-zag, tower):
2/3, 3/5, 5/6 → 7/7, 7/7, 7/7. Stick moves sent toward a locked living target (hold and tap, view lag 0 and 4 ticks):
0. `npm run chase-gate` (tools/chase-harness/chase-gate.test.ts) asserts these in the release check.

### 8.3 Balance (bots use no touch input, so only the sim changes moved it)

Untuned v20 (3v3, seeds 1–2000): takedowns 3.63 a minute, cats 56.8% / dogs 43.3%, 17 heroes outside 46–54%
(Stilts 68.6%, Chili 39.6%). The cats lean on basics, so every landed swing helped them. Fixes:

- `HERO_BASIC_VS_HERO_BP` 6500 → **6000** (5800 was tried: takedowns 3.38–3.41 but the "down 10+ takedowns wins"
  comeback gate failed in three of four windows).
- The 20 per-hero `pvp` rows refitted (dealt and taken moved by the same amount in opposite directions) over 13 paired
  rounds, ending on the first set where both windows hold every hero, the species and the takedowns. Biggest moves:
  Stilts 9975/8450 → 8965/9460 (S4), Rocket +260, Chili +235, Clem −235, Sage / Pixel +215, Duchess +205 dealt (taken the opposite).
- `HEARTHWOOD_PVP` hero rows (5v5 only) refitted on top of the new 3v3 rows: a logistic line-up model over the
  baseline window (v19 rows, cats 51.7%) and one overshoot pair (cats 39.5% / 40.5%), then one confirmation pair.

| 3v3 gate (`npm run match -- --gate balance`) | v20 untuned, 1–2000 | v20 final, 1–2000 | v20 final, 2001–4000 |
|---|---|---|---|
| Takedowns a minute (2.5–3.5) | 3.63 FAIL | 3.45 | 3.48 |
| Cats / dogs (47–53) | 56.8 / 43.3 FAIL | 50.4 / 49.6 | 50.0 / 50.0 |
| Every hero (46–54) | 17 heroes out | 46.0–52.3 | 47.6–52.6 |
| Map side (45–55) | 51.4 | 51.1 | 51.5 |
| Sage / Brutus level-6 branch (45–55) | 57.0 / 49.8 | 47.1 / 47.1 | 48.0 / 46.5 |
| Down 10+ takedowns at the end wins (< 5%) | 6.1 FAIL | 3.8 | **5.4 FAIL** (17 of 317; this gate failed in 5 of 26 probe windows at 1–2 SE) |
| Median length (6:30–9:00) | 7:07 | 7:11 | 7:11 |

| Other gates | Result |
|---|---|
| `pvp-symmetry`, 2,000 seeds (4,000 matches) | map side 48.8%, cats 51.9%: PASS |
| `hearth-gates --seeds 2000` (5v5), seeds 1–2000 | side 50.4, cats 49.5, every hero 47.8–51.5, p50 13:05, 0 safety ends: PASS |
| `hearth-gates --seeds 2000 --from 2001` (5v5) | side 48.5, cats 51.2, every hero 47.0–53.7, p50 13:05, 0 safety ends: PASS |
| `tools/determinism.mjs --seeds 1000` (+ PvP) | 2,483,908 commands, all identical |
| `npm run chase-gate` | 7 / 7 |

### 8.4 Checks

`tsc --noEmit` clean; `lint:sim` ok (151 files); `vendor-sim` v20 written with v19 frozen at d65a13ba (v19 directory
byte-identical to `origin/main`), `vendor-sim:check` current; party-identity golden regenerated from the live v20
fixtures. Full `vitest`: all pass except `net-rejoin` perf-ff (timing; passes alone) and the two `tools/trailer`
copy-gate tests that already fail on `origin/main` in a worktree. Backend: `pawlegends-live.spec.ts` 71/71 (v10–v20),
`pawlegends-party-live` + `-pvp` 16/16. `pawlegends-app` publish tests 2/2.

Not done here: client bundle rebuild, OTA beta publish and `promote_now` (§2.3) are release steps for the owner.

### 8.5 Independent review (34c26961)

Fixed: a Move in a swing's last tick left a stale target (Stilts auto-pounced back while walking away); an Attack on
another unit in the last tick landed the old swing on the new unit; a tapped minion/camp/tower held the stick with no
timer (now 700 ms as in v19; enemy heroes keep the timerless yield). Real client (bot match, attempts of ~3 s with
>= 0.6 s in contact, hits landed): touch tap 23/24 attempts hit (0.96 hits/contact-s), touch hold 26/27 (1.01), touch
hold no stick 3/3, desktop right-click spam 22/22 (1.2), desktop A-click spam 18/19 (1.16). Fresh-seed gates: 3v3
seeds 4001-6000 FAIL (stilts 54.5, chili 44.7, gabe 54.9); 3v3 seeds 1-2000 FAIL (down 10+ wins 6.2%; heroes
47.4-53.8 pass); 5v5 seeds 4001-6000 FAIL (duchess 54.1; side, species, p50 13:05 pass). Determinism 300 seeds + PvP
identical; pvp-symmetry 1000 seeds pass.
