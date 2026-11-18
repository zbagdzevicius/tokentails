# Sim v36: the v35 hero balance pass

Founder ask behind v35 (2026-11-17, verbatim): "deaths should be more and more punishing ( making each respawn longer
and longer towards ) ultracode. and champ kill should give much XP, much more than now". Sim v35 (V35-DEATHS.md) did
that and left the hero rows as they were; its report named the heroes outside 46–54% as the next balance pass. This is
that pass. The death and kill-XP rules of v35 are unchanged.

**Why a new sim version.** v35 went live on 2026-11-17 (backend, pawlegends.app and the OTA). Any change to a hero row
changes the result of every Normal, Hard or PvP match that hero plays, so a stored v35 replay would no longer verify.
The rows therefore ship as sim v36 with v35 frozen, like every earlier bump.

## 1. Method

- Gates judged on 8,000-match runs: the 3v3 pool rotation (`npm run match -- --gate balance --map pool --seeds 8000`,
  a Normal player-bot against Normal bots, each seed on its own pool map) and Classic 5v5
  (`node tools/hearth-gates.mjs --seeds 4000`, 4,000 line-ups each played twice with the sides swapped: 8,000 PvP
  matches with Normal pilots).
- Each 3v3 and 5v5 verification ran on seeds no earlier run had used (V20-CHASE.md §10). A hero plays about 1,700
  slots in a 3v3 run (standard error about 1.2 points) and about 2,850 in a 5v5 run.
- Rows move dealt and taken the same amount in opposite directions, as before. Experiments used `--tune` (the bundle
  only); the source was edited afterwards and checked to match the tuned bundle exactly.
- The 3v3 `pvp` row also applies on Hearthwood (Normal, Hard and PvP rules; `sideEdge`), so the 5v5 rows were fitted
  with the new 3v3 rows in place. Hearthwood corrections came from a logistic fit over the line-ups of three 5v5 runs
  (about 0.025 logit per 1% for one hero, less than V30's 0.06), applied at 0.035 per 1% and rounded to half steps.

## 2. 3v3 rows (`src/data/heroes/<id>.ts` `pvp`)

| Hero | v35 | v36 |
|---|---|---|
| Ranger | 9195 / 8795 | **8915 / 9075** |
| Bengas | 9570 / 8570 | **9450 / 8690** |
| Rocket | 9195 / 8905 | **9085 / 9015** |
| Domino | 9230 / 8840 | **9180 / 8890** |
| Champ | 8725 / 8875 | **8785 / 8815** |
| Meatball | 7265 / 9065 | **7355 / 8975** |
| Brutus | 8010 / 9690 | **8120 / 9580** |
| Ziggy | 7385 / 9790 | **7485 / 9690** |
| Lambo | 9415 / 7170 | **9465 / 7120** |

Rounds: t1 (Ranger, Bengas, Rocket down; Champ, Meatball up) on the v35 window; t2 (+ Ranger further down, Brutus and
Ziggy up) on seeds 40,001+: every hero 46.6–53.6%; t3 (shipped: + Domino down, Champ back 40, Lambo, Brutus and Ziggy
up) on seeds 100,001+.

## 3. Hearthwood rows (`src/data/maps/hearthwood.ts` `HEARTHWOOD_PVP`)

Species rows: cats 10020 / 10290 → **10005 / 10305**, dogs 10000 / 10310 → **10015 / 10295**. Hero rows, in whole or
half steps of 1% on top of the v35 row (the full table is pinned in `tests/unit/sim-v36.test.ts`):

| Step | Heroes |
|---|---|
| −6.5% | Bravo |
| −4.5% / −4% | Lambo / Meatball, Brutus |
| −3.5% | Biscuit |
| −2% / −1.5% / −1% / −0.5% | Bengas / Mochi, Nova, Marshmallow / Clem, Pixel / Duchess |
| +0.5% / +1% | Barkula / Sage, Ziggy, Champ, Domino, Howler |
| +2% / +2.5% | Aviete, Nugget, Rocket / Cacklejaw, Chili |
| +3.5% / +4% / +5% | Dusty, Stilts / Frankie / Gabe |

Rounds: h1 (seeds 100,001+, damped first fit) and h2 (seeds 120,001+) each left 2 to 4 heroes out of band (Frankie
44.9% and 45.3%, Lambo 55.1% and 54.3%) and cats at 52.4% / 52.3%; h3 (shipped) on seeds 140,001+ passes every gate.

## 4. Gates: v34 → v35 → v36

### 3v3 pool rotation, Normal player against Normal bots, 8,000 matches each

| Gate | v34 (seeds 20,001+) | v35 (seeds 20,001+) | **v36 (seeds 100,001+, unseen)** |
|---|---|---|---|
| Every hero 46–54% | 46.9–52.8% | **47.3–54.6% (Ranger 54.6% FAIL)** | **46.1–53.2%** |
| Side (Purrhaven) | 49.2% | 48.8% | 49.5% |
| Cats | 50.4% | 49.7% | 50.7% |
| Trailing at 3:30 wins (20–40%) | 33.0% | 30.4% | 32.3% |
| Down 10+ at the end wins (< 5%) | – | 1.5% of 999 | 2.2% of 948 |
| Median / p95 (6–10 min) | 7:35 / 8:57 | 7:27 / 8:50 | 7:28 / 8:50 |
| Ends on a core / safety ends | 8,000 / 0 | 7,999 / 1 | **8,000 / 0** |
| Takedowns a minute | – | 3.02 | 2.99 |
| Brutus level-6 branch (45–55%) | 44.9% pooled | 45.8% | 47.7% |

Per map in the v36 run (trailing at 3:30 wins, median): Crossing 32.8% / 7:33, Ridge 27.4% / 6:50, Thicket 32.4% /
7:39, Quarry 34.6% / 7:29, Park 35.4% / 7:29; no safety end on any map.

### Classic 5v5, PvP with Normal pilots, 8,000 matches each

| Gate | v35 (seeds 20,001+) | **v36 (seeds 140,001+, unseen)** |
|---|---|---|
| Every hero 46–54% | **45.0–54.5% (Bravo 54.5%, Gabe 45.0% FAIL)** | **48.0–52.4%** |
| Side (team 0, 48–52%) | 50.8% | 49.4% |
| Cats (47–53%) | 48.8% | 49.7% |
| Median / p95 (founder floor 11:00) | 11:49 / 14:48 | 11:49 / 14:48 |
| Safety ends (≤ 2%) | 1.7% | 1.6% |

The tool's own 12:00 floor for the 5v5 median still fails, as in v35 (11:46–11:50); the founder accepted 11:50 and
the floor for this pass is 11:00. v34 reached the safety end in 7 of 400 PvP probe matches (1.75%).

### Kills, deaths and levels (`tools/deaths-probe.mjs`, PvP with Normal pilots; 1,000 pool and 400 Hearthwood, seeds 80,001+)

| Measure | 3v3 v35 | 3v3 v36 | 5v5 v35 | 5v5 v36 |
|---|---|---|---|---|
| "10-0" hero (10+ kills, ≤ 1 death) vs the lowest hero, 10:00 | – (matches end ~7:30) | – | +3.0 (3+ in 87% of 30) | **+3.0 (3+ in 82% of 33)** |
| Same, end of match | +2.6 (n 37) | +2.3 (n 21) | +2.7 | +2.7 |
| Top killer vs a 0-kill hero, end (3v3 target 2–3) | +2.7 | **+2.7** | +2.5 | +2.6 |
| Top killer vs a 0-kill hero, 10:00 | – | – | +2.8 | +2.8 |
| XP from champion takedowns | 64.4% | 64.2% | 61.7% | 61.9% |
| Most-dying hero: time dead (p90) | 20.7% (31.6%) | 20.7% (30.9%) | 29.1% (37.9%) | 29.3% (38.2%) |
| Behind at the check wins | 27.0% of 500 | 30.2% of 504 | 30.9% of 278 | 24.4% of 270 |
| Safety ends | 1 of 1,000 | 0 | 7 of 400 | 6 of 400 |
| Median length | 7:25 | 7:28 | 11:50 | 11:49 |

`deaths-probe` now also prints the "10-0" row (a hero with 10+ kills and at most one death, against the lowest-level
hero and against the mean of the others).

## 5. Not changed, still open

- **Blitz** has its own per-hero rows (`mutator`), which this pass did not refit. On 2,000 Blitz matches (seeds
  20,001+) 15 heroes sit outside 46–54% on both v35 and v36 (a 2,000 window gives ±2.4 points) and cats are 53.7% →
  53.1%; down 10+ wins 4.3% of 92 → 5.1% of 98. A Blitz refit needs its own 8,000-match pass.
- Known misses carried from v33/v34: "core kill before late Sunset" (pool maps' late tick is 7:00 to 7:30; 51.2%),
  the 5v5 tool floor of 12:00 above.
- `tests/unit/party-pilot.test.ts`: v35 made champion kills two thirds of all XP, so a piloted slot's XP over the quick
  16 seeds is as streaky as its takedowns (10.5% from the in-sim bot with the v36 rows). The quick run now allows 15%
  (takedowns already allowed 25%); the nightly 50 seeds hold 10% and pass.

## 6. Freeze, backend build memory and release

- `SIM_VERSION` 36. v35 is frozen at 59dafddf with all its fixtures (main was rebased on 2026-11-18: the v35 sim commit is now 9a4463d1, whose v35 bundle differs; 59dafddf is the first commit on main whose v35 directory is byte for byte the live one). The backend verifies 20
  to 36. Rookie and Easy never apply the hero rows, so every frozen v35 Rookie and Easy fixture relabelled 36 verifies
  on v36 (`tests/unit/sim-v36.test.ts`); the backend spec checks the live v36 fixtures verify, that at least one of
  them is refused when labelled 35, and that frozen v35 verifies its own.
- Backend build memory (local `nest build` peak RSS, macOS `/usr/bin/time -l`): v20–v35 (live before) 2.30–2.47 GB,
  **v20–v36 2.54–2.55 GB**. That is below the 2.62–2.66 GB of v10–v34, which built on DigitalOcean, so no sim was
  retired.
- Release order (FORCE-UPDATE.md, LIVE-MATCH-DEPLOYS.md): the backend first (it accepts 35 and 36), then the game build
  and the OTA, which raise `minSim` to 36. The party relay refuses mixed builds as before.
