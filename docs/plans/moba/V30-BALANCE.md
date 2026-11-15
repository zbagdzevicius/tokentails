# V30-BALANCE: the 5v5 balance release (sim v30, 2026-11-15)

Standing goal (founder): "fully-fledged multiplayer game that's better than mobile-legends and league of legends and
wild rift". Round 5 gap work, balance package: the per-hero 5v5 gate had never been judged on the 24-hero roster
(ROSTER-V29.md §7 left the 8,000-match pooled run open), and the round 4 600-match read had Ziggy at 42.1%, Biscuit at
43.9% and cats at 53.7%. Sim v30 brings every hero into 46–54% and cats under 53% with Hearthwood row changes only.
v29 is frozen; the backend verifies 10 to 30.

## 1. What changed

Only `HEARTHWOOD_PVP.hero` in `pawlegends/src/data/maps/hearthwood.ts`: the 5v5 hero-vs-hero damage rows. A step of
x% raises a hero's `dmgBp` by x × 100 and lowers its `takenBp` by the same amount (the convention of every earlier
refit); every step is a whole or half percent. Kits, the 3v3 `pvp` rows, the species rows, the bots, the map and every
other mode are untouched, so **every Crossing match (3v3, Blitz, One Lane Brawl, the Duel, Boss Weekend, Practice)
plays exactly as in v29**: the v29 Crossing fixtures re-sim on v30 to the same hash and length
(`tests/unit/sim-v30.test.ts`, backend `pawlegends-live.spec.ts`).

| Hero | Side | v29 (2,000, seeds 100001+) | Row | v30 (8,000, seeds 20001–24000) |
|---|---|---|---|---|
| Clem | cat | **57.3%** | −6% | 52.8% |
| Raspberry | cat | **56.1%** | −5% | 53.5% |
| Stilts | cat | 54.0% | −4.5% | 52.2% |
| Duchess | cat | 53.2% | −1% | 51.4% |
| Bengal | cat | 52.4% | – | 51.5% |
| Sage | cat | 51.4% | – | 50.9% |
| Mochi | cat | 50.6% | – | 49.0% |
| Lambo | cat | 48.8% | +3% | 49.8% |
| Meatball | cat | 48.6% | +3% | 48.6% |
| Pixel | cat | 48.6% | +2% | 49.9% |
| Gabby | cat | 47.8% | +3.5% | 48.8% |
| Ziggy | cat | **45.1%** | +4% | 47.5% |
| Cacklejaw | dog | **56.3%** | −7% | 50.3% |
| Domino | dog | 51.8% | −3.5% | 48.8% |
| Howler | dog | 51.3% | −3% | 50.6% |
| Champ | dog | 50.2% | −1% | 49.2% |
| Sir Brutus | dog | 49.8% | – | 48.8% |
| Rocket | dog | 49.1% | +1% | 48.9% |
| Frankie | dog | 47.8% | +2.5% | 50.9% |
| Marshmallow | dog | 46.6% | +1% | 48.6% |
| Bravo | dog | 46.3% | +1% | 49.5% |
| Chili | dog | **45.9%** | +3% | 50.4% |
| Nugget | dog | **45.4%** | +3% | 48.8% |
| Biscuit | dog | **45.4%** | +3.5% | 49.5% |

Bold: outside 46–54% before. The v29 column is one 2,000-match window (n ≈ 830 a hero, ±1.7 points); the v30 column is
the pooled 8,000 (n ≈ 3,300, ±0.9).

## 2. Method

`tools/hearth-gates.mjs` (ten `normal` pilots, each seed played twice with the sides swapped), `--tune` for the trial
rows, 1,000 seeds (2,000 matches) a fit window:

1. v29 on 100001: side 49.4%, cats 51.1%; eight heroes out (above).
2. A logistic fit of every hero's strength from the line-ups (hero terms relative to their species, a species term,
   a side term) suggested the first rows (t1, 101001): cats 52.6%, the heroes moved about half as far as the v29 rule of
   thumb (2.3 points per 1%) predicted.
3. A joint fit of both windows with the row change as a covariate gave about 0.06–0.07 logit per 1% (about 1 to 1.2
   points of a hero's win rate); t2 (102001): cats 50.3%, only Ziggy out (44.9%).
4. The joint fit of all three windows (6,000 matches) gave the shipped rows (t3), each moved part of the way to the
   fitted ideal, the side sums kept near zero so the species balance holds.
5. The shipped rows were judged on unseen seeds 20001–24000 (the MAP-5V5 verify range): every gate passed.

## 3. Gates (the shipped sim)

| Gate | Target | 20001 | 21001 | 22001 | 23001 | Pooled 8,000 |
|---|---|---|---|---|---|---|
| G6 side (team 0) | 48–52% | 50.3% | 51.5% | 50.1% | 50.1% | **50.5%** |
| G5 cats vs dogs | 47–53% | 50.8% | 51.0% | 49.1% | 51.0% | **50.5%** |
| G5 every hero (judged pooled) | 46–54% | | | | | **24 of 24, 47.5% (Ziggy) to 53.5% (Raspberry)** |
| G5 length p50 | 12:00–14:30 | 13:06 | 13:07 | 13:07 | 13:07 | 13:07 (p95 13:14) |
| G5 safety end | ≤ 2% | 0% | 0% | 0% | 0% | 0% |
| G2 determinism (solo, party, PvP 5v5) | identical | | | | | 90 of 90 |

The source rows equal the tuned rows: 8 seeds of 20001 replayed from the source give the same 8 rows.

## 4. Comeback (5v5, map5v5-probe definitions), not changed

MAP-5V5-STANDARD.md G8: a team behind at 7:00 (2+ towers or 5+ takedowns) wins 20–40%; a team down 10+ takedowns wins
under 5%. Measured with the probe's runner on seeds 60001+ (one match a seed):

| Variant | Behind at 7:00 wins | Down 10+ wins |
|---|---|---|
| v29 (300) | 14.2% of 204 | 7.5% of 228 |
| **v30 shipped (600)** | **13.9% of 389** | **4.9% of 410** |
| v30 + bounty and shutdown Fish ×3 on Hearthwood (600) | 16.1% of 392 | 7.2% of 417 |
| v29 + bounty ×2 (300) | 10.8% of 194 | 4.1% of 221 |
| v29 + bounty ×3 (300) | 17.8% of 191 | 7.5% of 200 |
| v29 + Grizzlechop behind bonus +150% (300) | 14.2% of 204 | 7.5% of 227 |
| v29 + Grizzlechop bonus from 1 tower behind, +100% (300) | 16.2% of 204 | 9.6% of 228 |

Every existing lever raised the down-10 row as much as the behind-at-7:00 row; on the same 600 seeds, the bounty ×3
moved the comeback +2.2 points and the down-10 row +2.3 (past 5%). Reaching 20% with these levers would break the
under-5% gate, so nothing was shipped: the 5v5 comeback target stays the founder's call (V28.md §1.3). The figure on
the shipped sim is **13.9%** (n = 389), and the down-10 row now passes on that window (4.9%).

## 5. Player-visible

- 5v5 Classic (Hearthwood Divide): the 20 row changes above. Clem, Raspberry, Stilts, Cacklejaw and Domino hit a
  little softer and take a little more; Ziggy, Biscuit, Nugget, Chili, Gabby, Lambo, Meatball and Frankie hit a little
  harder and take a little less.
- The New tag on Mochi, Ziggy, Biscuit and Champ (champion select, store, landing grid) now follows the newest roster
  release instead of the sim version, so a balance-only sim keeps it (`isNewHero`, `justReleased`).
- Patch notes page: `https://storage.googleapis.com/pawlegends-pages/gaps5/balance/index.html` (hub card).

## 6. Versioning

`SIM_VERSION` 30. `tools/vendor-sim.mjs` freezes v29 at f921c5ef (its last commit on main; bundle `6ec5a82f…`, the
nine v28 extras plus `roster-replay.fixture.json`), so the backend verifies 10 to 30. A v29 Hearthwood record relabelled
v30 is refused (its hash differs); v29 Crossing records relabelled v30 verify with the same hash. The party golden
(`src/net/sim-stamp.json`) stays `2913a91b`; the source hash moves, and the relay already refuses mixed sims. Force
update: the OTA publish raises `minSim` once v30 bundles are live (FORCE-UPDATE.md §3.3); the backend deploys first.

## 7. Checks

tsc, lint:sim, the unit suite (`sim-v30.test.ts`: version, every hero row, Crossing unchanged, the live Hearthwood
fixture), `vendor-sim:check`, backend `pawlegends-live.spec.ts` (v30 accepted, v29 frozen), pawlegends-web
`landing-roster.test.ts`, e2e desktop and landscape, `build:client`, budget.
