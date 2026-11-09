# Pawlegends sim v18: basic attacks land while chasing (2026-11-09)

**Status:** implemented on `fix/pawlegends-chase-attack` (not pushed). Every gate passes; balance passes in each
2,000-seed window on its own (seeds 1–2000 and seeds 2001–4000).
**Founder bug (2026-11-08):** "it's close to impossible to attack a champ with a basic attack while chasing, might be a
bug, try to fix this."
**Base:** `origin/main` at `3d12ed67` (sim v17 released to production at `451206ab`).

## 1. Versioning

The chase fix was first built on a pre-release v17 and changed v17 itself. v17 is released, so the fix ships as v18:

- `FROZEN` in `pawlegends/tools/vendor-sim.mjs` gains v17 at `451206ab` (bundle `29cd64e4…`, extras forfeit, dog,
  new-dog and pvp fixtures). `backend/src/vendor/pawlegends-sim/v17/` is byte-identical to `origin/main`.
- `SIM_VERSION` 18. The backend verifies v10 to v18; `PARTY_SINCE` stays 13 and `PVP_SINCE` 16.
- Vendored v18 bundle and fixtures, the party-identity golden and the protocol sunset seed (302) are regenerated.
- The 5v5 map is built elsewhere and may also claim v18; whichever lands second bumps to v19.

## 2. The fix (unchanged from the branch commits `f74e5120`, `29dd249e`, `aed005ce`)

- **Sim (`units/hero.ts`):** with an Attack or AttackMove order the swing starts within attack range +
  `HERO_RULES.chaseLeeway` (300 mm), and the hero keeps stepping after a target that leaves range during the windup and
  the attack timer (`engage`, `followSwing`). A rooted or planted (Guard Post) hero gets no leeway.
- **Touch (`input/touch`):** while ATK is held (or 700 ms after a tap), a stick within 90° of the bearing to the attack
  target sends no move, so it no longer replaces the Attack order mid-chase. A stick pointing away still moves at once.
- **Tests (`chase-attack.test.ts`):** a chaser at equal speed lands 5 of 5 melee swings and 4+ ranged bolts in 5 s
  (was 0); a faster target (Stilts) still escapes after at most 2 hits; Pounce out of the windup still dodges; rooted
  heroes get no leeway; a target in range is fought standing still.

## 3. Rebalance

With chasing basics landing, takedowns went from 3.3 to 4.7 a minute and ten heroes left 46–54% (seeds 1–2000, v18 with
the fix and v17 data):

| | v17 released (V17.md §6.5) | v18 fix only | v18 final, seeds 1–2000 | v18 final, seeds 2001–4000 |
|---|---|---|---|---|
| Takedowns a minute | ~3.3 | **4.70** | 3.37 | 3.39 |
| Heroes outside 46–54% | 0 | 10 (Nugget 55.3, Clem 45.3, Stilts 43.1, Gabė 57.3, Bravo 42.4, Duchess 57.1, Lambo 45.9, Domino 44.6, Chili 56.3, Sage 54.1) | 0 | 0 |
| Brutus level-6 branch | 47.8% / 46.2% | 44.1% (fail) | 51.5% | 49.8% |
| Sage level-6 branch | 50.7% / 50.0% | pass | 54.4% | 45.7% |
| PvE human side | 48.2% / 49.0% | 50.9% | 49.1% | 50.3% (pooled 49.7%, band 48.4–51.4%) |
| Median length | 7:14 / 7:11 | 6:51 | 7:12 | 7:12 |
| Player deaths a match (mean) | – | 5.3 | 4.1 | 4.2 |
| 90%-to-dead median | – | – | 8.2 s | 8.2 s |

### 3.1 Global cut

- `HERO_VS_HERO_BP` 13000 → **10500** (`data/heroes/index.ts`).
- New `HERO_BASIC_VS_HERO_BP` **6500**: a hero's basic attack on an enemy hero deals × 0.65 on top of that
  (`combat/damage.ts`, `kind === 'basic'`). Abilities keep × 1.05.

Probes, 1,000 seeds each (takedowns a minute): 10500 + 7500 → 3.65; 10000 + 7500 → 3.55; **10500 + 6500 → 3.31**.
A ranged-basic tweak was not needed: after the cut, ranged heroes landed on both sides of 50% (Gabė high, Pixel,
Rocket and Domino low), so the per-hero rows handled them.

### 3.2 Kit change

- **Gabė Heart Breeze** (her basic hits on heroes heal the weakest ally): 10 (+2/lvl) → **8 (+1/lvl)**. Her basics land
  more often while chasing and heals are not cut by the damage change; she stayed at 56–58% through two row refits.

### 3.3 `pvp` rows (dealt / taken, bp)

Fitted on both windows (six two-window runs), moving `takenBp` and `dmgBp` together:

| Hero | v17 | v18 |
|---|---|---|
| Avietė | 11650 / 7600 | 11475 / 7950 |
| Bengas | 9950 / 8625 | 10000 / 8625 |
| Bravo | 10400 / 8500 | 10775 / 7950 |
| Sir Brutus | 8625 / 9575 | 8375 / 9925 |
| Cacklejaw | 10400 / 8775 | 9925 / 9475 |
| Chili | 8850 / 9175 | 8800 / 9150 |
| Clem | 8100 / 9625 | 7825 / 10075 |
| Domino | 9050 / 9850 | 9500 / 9100 |
| Duchess | 10550 / 8675 | 10550 / 8725 |
| Frankie | 9950 / 8900 | 9725 / 9175 |
| Gabė | 8075 / 10000 | 7700 / 10650 |
| Howler | 8350 / 9750 | 8275 / 9750 |
| Lambo | 9300 / 8050 | 9450 / 7750 |
| Marshmallow | 8475 / 9850 | 8475 / 9800 |
| Meatball | 7200 / 9575 | 7375 / 9400 |
| Nugget | 8825 / 9550 | 8400 / 10125 |
| Pixel | 8000 / 9575 | 8450 / 8950 |
| Rocket | 8925 / 9900 | 9250 / 9400 |
| Sage | 9650 / 9450 | 9875 / 9200 |
| Stilts | 9975 / 8450 | unchanged |

### 3.4 Final balance, each window on its own

| Hero | Seeds 1–2000 | Seeds 2001–4000 |
|---|---|---|
| Avietė | 52.8% | 53.5% |
| Bengas | 48.2% | 50.3% |
| Bravo | 46.0% | 48.3% |
| Sir Brutus | 52.7% | 49.4% |
| Cacklejaw | 52.8% | 51.7% |
| Chili | 47.6% | 52.8% |
| Clem | 52.0% | 49.0% |
| Domino | 50.8% | 49.3% |
| Duchess | 50.9% | 50.7% |
| Frankie | 47.3% | 47.6% |
| Gabė | 51.0% | 48.2% |
| Howler | 48.6% | 50.8% |
| Lambo | 48.5% | 50.7% |
| Marshmallow | 50.8% | 49.7% |
| Meatball | 51.1% | 50.2% |
| Nugget | 49.2% | 47.5% |
| Pixel | 50.2% | 50.1% |
| Rocket | 47.9% | 50.0% |
| Sage | 52.6% | 48.9% |
| Stilts | 48.6% | 51.1% |

- Tricks 48.5–51.5% in both windows; cats 50.6% / 49.7%; sides Purrhaven 49.1% / 50.3%.
- p95 8:30 / 8:32; core kill before Sudden Death 93.8% / 92.8%; no safety ends.
- Comebacks: trailing at 3:30 won 29.2% / 27.7%; down 10+ at the end won 3.3% / 2.6%.
- Bravo sits on the floor of seeds 1–2000 (46.0%) and Avietė near the ceiling of 2001–4000 (53.5%). One window holds
  about 600 slots per hero (±2 pp standard error), so the next data change may push either out of one window again.

### 3.5 Test changes

- `kit-helpers.ts` gains `basicHit` (heroHit with `HERO_BASIC_VS_HERO_BP`). Basic-hit expectations in the Bengas,
  Brutus, Cacklejaw, Clem, Stilts and cage-exit tests use it; the `effects.test.ts` shield case uses an ability hit.
- `domino.test.ts` "the zone still hits" checked HP against a value read before the foe's regen; with × 1.05 the pulse
  (49) no longer outweighs it, so the test now checks the pulse's own hit event.
- `pvp` row expectations (round2, Bengas, Duchess, Lambo, champions-final) carry the v18 rows.

## 4. Gates

| Gate | Result |
|---|---|
| Balance, seeds 1–2000 (`npm run match -- --gate balance`) | pass: every hero 46.0–53.5%, branches Brutus 51.5% / Sage 54.4%, 3.37 takedowns a minute |
| Balance, seeds 2001–4000 (`--from 2001`) | pass: every hero 47.5–53.5%, branches Brutus 49.8% / Sage 45.7%, 3.39 takedowns a minute |
| PvE human side | 49.1% / 50.3% (pooled 49.7%, band 48.4–51.4%) |
| `pvp-symmetry`, 2,000 seeds | map side 48.4%, cats 50.5% (4,000 matches): pass |
| `tools/determinism.mjs`, 1,000 seeds plus PvP | all identical (2,483,961 commands) |
| `vendor-sim:check` | v10–v17 frozen, v18 current; v17 byte-identical to `origin/main` |
| `lint:sim` | ok (145 files) |
| `tsc` | clean |
| `npm run budget` | ok: first load 353.7 KB gzip, party chunk 37.5 KB |
| `vitest` | 2,193 pass; the only failures are the two `tools/trailer` copy-gate tests that already fail on `origin/main` in a worktree without TypeScript for `tools/copy-lint` |
| backend `jest src/pawlegends` | 392 of 393 in a full run; the miss is a `pawlegends-live.spec.ts` worker case that timed out under load (503); the spec passes on its own (63 of 63) |

### 4.1 Load (load average 50–100 during most runs)

- Backend, first full run: 370 of 393 passed. The 18 `pawlegends-live.spec.ts` worker-thread cases timed out at 10 s (503
  instead of 400), as in V17.md §6.5; `loop-gate`, `casual-relay` and `room-restore` timed out on wall-clock waits.
  Run on their own, `pawlegends-party-live`, `room-restore`, `casual-relay` and `loop-gate` pass (20 of 20).
- The `round2.test.ts` Clem and Brutus pvp text lines carry the v18 rows.
- `pawlegends-party-live.spec.ts` moved its forfeit seed back from 6 to 5 (seed 6's match now ends on a core kill
  before the injected forfeit).
