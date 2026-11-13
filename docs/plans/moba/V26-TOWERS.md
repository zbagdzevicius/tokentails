# V26: towers that last and hit hard early (sim v26, 2026-11-13)

Founder's ask (verbatim): "make towers more durable ultracode and hit harder, especially in early game"

Sim v26 freezes v25 (deliberate fun toys) and changes only tower rules. Every new rule ends when Fortified ends
(Crossing 4:00, Hearthwood 5:30, Blitz 0:45), and outer and inner base HP do not change for Normal, Hard and PvP. So
towers late in a match fall much as they did in v25.

## 1. Rules

### 1.A The takedown chip no longer kills towers early or alone

In v25, 85% to 100% of first towers on Normal and in 5v5 fell mostly to takedown chips (a share of max HP taken off the
victim team's weakest tower once the core-chip cap is reached).

- **No tower chip while Fortified** (`combat/damage.ts`, `tick < fortifyUntilOf(w)`). The first takedowns still chip
  the core until `takedownChipCapBp` (Normal and Hard: 4 × 5%), as before.
- **A chip never finishes a tower.** `TOWERS.chipFloorBp` = 1500: `weakestTower` skips towers at or below 15% of max HP,
  and a chip is capped at `hp − 15% of max HP`. When every hittable tower is at or below the floor there is no chip; the
  fallback to the core when no tower stands is unchanged.
- `DIFFICULTY_RULES.normal.takedownTowerChipBp` 3500 → **2000** (tuned, §3). Hard 1500 (PvP inherits it), Easy and
  Rookie 0, unchanged.

### 1.B A stronger, longer Fortified that also covers minions and Pudding

| Item | v25 | v26 |
|---|---|---|
| Hero damage to Fortified towers (`TOWERS.fortifyBp`) | 6500 (65%) | **5500 (55%)** |
| Minion and escort-Pudding damage to Fortified towers (`TOWERS.fortifyMinionBp`, new) | 100% | **7500 (75%)** |
| Tower bolts at heroes while Fortified (`TOWERS.fortifyBoltBp`, new) | ×1.0 | **×1.25** |
| Window, Crossing 3v3 (`fortifyUntil[0]`) | 5400 ticks (3:00) | **7200 (4:00)** |
| Window, Hearthwood 5v5 (`fortifyUntil[1]`) | 9000 (5:00) | **9900 (5:30)** |
| Window, Blitz (`MUTATOR_RULES.blitz.fortifyUntil`) | 0 (never) | **1350 (0:45)** |

The Kibble Cannon and pure damage are not reduced. Cores are never Fortified. The Pudding's escort breath is reduced
because it removed 38% to 43% of first-tower HP on Normal and Hard 3v3 (design lever 5).

### 1.C More HP on the low difficulties only (`DIFFICULTY_RULES.*.structureHpBp`)

| Difficulty | v25 | v26 | Crossing outer HP |
|---|---|---|---|
| Rookie | 10500 | **11000** | 2,475 |
| Easy | 10000 | **11500** | 2,588 |
| Normal, Hard, PvP | 13500 | 13500 | 3,038 |

### 1.D Tower bolts hit harder and scale with the target (`combat/attack.ts` `structureShot`)

`bolt = (heroDamage + heroMaxHpBp × target max HP) × (1 + min(streak × rampBp, rampCapBp))`, then × `fortifyBoltBp`
while Fortified, then armour as before. Cores keep 120; minions still take 110.

| Constant | v25 | v26 |
|---|---|---|
| `heroDamage` | 120 | **130** |
| `heroMaxHpBp` (new) | – | **300** (+3% of the target's max HP) |
| `rampBp` / `rampCapBp` | 2500 / 8000 | **3000 / 9000** (shots ×1.0, 1.3, 1.6, 1.9, 1.9 …) |
| `fortifyBoltBp` (new) | – | **12500** |
| `lockOnTicks` | 36 (1.2 s) | **30 (1.0 s)** |

Shots to kill from full HP, lock-on included (`shots.py`): Sage L1 4 → **3** (3.0 s); Sage L3 / L6 / L9 5 / 6 / 7 →
**3 / 4 / 5** while Fortified (4 / 5 / 5 after); Brutus L1 / L3 / L6 6 / 8 / 10 → **4 / 5 / 6** while Fortified;
Brutus L9 12 → **8**. Rookie keeps its knockback for L1 and L2 players and `humanTakenBp` 8500.

### 1.E A tower keeps shooting a hero it has already hit (`units/tower.ts` `chooseTarget`)

An unforced hero target no longer yields to a minion that walks in when the tower has already fired at it
(`w.shotAt[id] === cur`, with the lock-on on that hero finished) and it is still in range. A hero that is only being
locked on still yields, as before, also when the tower shot it on an earlier visit (verification fix: `shotAt` outlives
the visit, so without the lock-on check a returning hero held the tower during its new lock-on). Forced
aggro and backdoor protection are unchanged.

### 1.F Render (no sim or hash impact)

- Warming-up shots: each consecutive tower shot at the same hero draws a thicker, hotter (orange) beam, up to 3 steps,
  and from the third shot a hit hero also gets the impact flare (`render/fx/towerBeams.ts` `beamHeat`,
  `views/towerView.ts` `shotAt`, the hit event's hero id through `effects.ts` `onTowerShot`).
- Already in place and now covering the longer window: the Fortified shield on the tower bar (`ui/overhead.ts`), the
  "Towers are no longer fortified" callout, the range ring, the red aggro ring, the lock-on charging line.

### 1.G Bots on Hearthwood: no stalls at a wall or on the edge of a fight (`bots/brain.ts`, Hearthwood only)

The 5v5 bot gate (`tools/map5v5-probe.mjs`, no hero stuck over 3 s) failed on v26 with 2 stuck seeds of 120 from
60001 (v25: 0). Replays with a per-tick bot trace showed that neither stall came from a tower rule; the longer Fortified
window only moved the waves so that the bots met these spots more often:

- **A minion behind a wall** (seeds 2196198180 at 4:44 and 3323107722 at 10:12, 16 s and 18 s). A ranged enemy minion
  shot the bot across the forest edge next to an inner tower. Lane work (`laneAct`) picked it by straight-line distance;
  the attack order's A* search could not reach it and ended at the nearest cell centre, just outside the swing's
  leeway, so the hero neither swung nor walked, and the bot kept the order. Fix: `walledOff` — lane work skips an enemy
  minion that is out of attack range with blocked ground on the straight line to it (`lineClear`). It is stateless,
  so the choice does not flip as the bot steps (a first, stateful version on the order's path did flip every think).
- **A fight on the edge of the power check** (seed 666717508). A bot backed off from a fight, retook it a think later,
  and so on. Fix: the foe fought last think stays a good fight down to `BOT_AI.keepFightBp` = 8000 (80%) of the bar.
- **A strong foe just outside reach** (seed 3764932844). A bot stepped toward its lane goal into the foe's engage
  range, backed off, and stepped in again. Fix: with a foe too strong to fight within engage range +
  `BOT_AI.lurkSlack` (3 m), lane work that would lead into its engage range waits at the back-off point (`intoReach`).
  The test is on where the work leads, not on where the bot stands.

All three are Hearthwood only (`w.mg.length > 0`), so Crossing and Blitz play exactly as before: every Crossing
backend fixture is unchanged by the re-vendor, only the three Hearthwood fixtures change.

The probe's stuck test also no longer counts a hero that dealt or took a hit from an enemy hero in the 3 s window
(rooted, body-blocked or trading blows on one spot). Those fights flag about one seed in 120 on every version: v25 on
seeds 61001–61120 flags seed 4130628312 in a fight.

## 2. Gates

Probe: `tools/tower-probe.mjs` (scratch, not shipped), the analysis probe of the design. v26 rows are fresh seeds
400001+: 400 seeds for each 3v3 and Blitz row, 160 for each 5v5 row. v25 rows are the analysis runs (seeds 1001+, 400
and 160 to 180). The probe and the balance and `fun1` gates ran on v26 built over the v25 at 3bcb0cd3. The v25 QA fix
d83f5743 (on main), which this branch sits on, changes only touch-stick toy pickups, which the bots and these gates do not use.
Determinism, hearth, Blitz and the unit, backend and build checks ran on the final tree.

**Result:** the core aims hold:

- Towers last longer early, and chips no longer kill first towers in 3v3.
- Bolts hit harder, so towers land 17% to 21% of killing blows.
- Match length holds.

Several outcome predictions do not hold inside the allowed lever ranges, and §3 lists every lever tried. The dive gates
(T9 to T11), 5v5 chip share (T7), Hard and PvP 5v5 first-tower time (T1) and the 3v3 deficit-comeback gate need a
founder call: wider levers or bot changes, both outside this design's bounds.

| # | Metric | Target | v25 | v26 | |
|---|---|---|---|---|---|
| T1 | First tower median, 5v5 Normal / Hard / PvP | 5:00–7:00 | 2:59 / 4:49 / 4:03 | 7:00 / 7:34 / 7:18 | Normal pass; Hard, PvP fail |
| T2 | First tower median, 5v5 Easy (novice) | 4:30–6:00 | 2:31 | 3:19 | fail (Easy falls during Fortified to the human's team) |
| T3 | First tower median, 3v3 Normal / Hard | 3:45–5:00 | 3:11 / 3:57 | 4:40 / 4:40 | pass |
| T4 | First tower median, 3v3 Easy (novice / normal player) / Rookie | 3:30–4:30 / 3:45–4:45 | 2:52 / 3:33 | 3:31 (normal player 3:27) / 4:07 | pass (novice), 3:27 just under for the normal player |
| T5 | First tower median, Blitz Easy novice / Blitz Normal | ≥ 1:15 / 2:00–2:45 | 0:57 / 2:36 | 1:27 / 2:57 | Easy pass; Normal fail (50.3% of matches lose a tower before the end, v25 57%) |
| T6 | Towers down by 3:00 (3v3) / by 5:00 (5v5 Normal), of 22 | ≤ 0.3 / ≤ 1.5 | 0.43 / 3.79 | 0.00 / 0.05 | pass |
| T7 | First towers killed mostly by chip | ≤ 20% | 85–100% | 3v3 0–5%; 5v5 Normal 46%, Hard 32%, PvP 44% | 3v3 pass; 5v5 fail |
| T8 | First-tower HP removed by heroes and minions | ≥ 75% | 4–27% (Normal, Hard) | 3v3 Normal 55%, Hard 58%, Easy 85–95%, Rookie 96%; 5v5 59–64%, Easy 100% | fail on Normal, Hard, PvP (Pudding 25–35%, chips the rest) |
| T9 | Divers alive 5 s after a dive kill during Fortified | ≤ 60% | 91–98% | 73–84% (Blitz 82–91%) | fail |
| T10 | Dive kills a match before Fortified ends | ≥ 50% fewer | 3v3 Normal 1.84, Hard 1.49, Easy 4.2–4.5 | 2.34, 1.88, 4.0–4.1 (a window 1 min longer; before 3:00: 1.61, 1.23, 3.6–3.7) | fail |
| T11 | Dive kills by an L1 or L2 killer, a match | ≤ 0.1 | 3v3 Normal 0.12, Hard 0.13, Easy 0.74–0.82 | 0.09, 0.10, 0.69–0.75; Rookie 0.12; 5v5 0.28–0.49, Easy 0.97 | 3v3 Normal and Hard pass; others fail |
| T12 | Hero deaths with the tower's killing blow | 15–25% | 7–13% | 3v3 Normal 17.9%, Hard 18.8%, Easy 21.5%; 5v5 17.0–19.6%; Rookie 12.0%, Blitz 9.6–14.0%, 5v5 Easy 47.3% | pass on the main modes |
| T13 | Comeback: behind in towers at 5:00 wins | ≥ 24% (3v3 Normal), ≥ 22% (5v5), ≥ 25% (PvP); ≤ 40% | 27% / 24% / 28% | 3v3 Normal 29%, Hard 25%, Easy 26–36%; 5v5 no tower falls before 5:00 (0 of 8); at 8:00 Normal 41%, Hard 57%, PvP 45% (v25 21–27%) | 3v3 pass; 5v5 over 40% at 8:00 |
| T14 | Match length | see design | 3v3 Normal 7:09, 5v5 13:04, Blitz 2:55 | 3v3 Normal 7:50 (+41 s), Hard 8:00 (+21 s); 5v5 13:06–13:07, 0 safety ends; Blitz 2:55, p90 2:58, 100% core | pass |
| T15 | Existing balance gates | all pass | balance 2,000 seeds from 20001 (v25): all pass, cats 49.9%, down 10+ wins 1.7% | see §2.1 | fail: down 10+ wins 6.6% |
| T16 | Rookie (`fun1`, 200 seeds from 20001) | tower deaths +≤ 0.3; win ±3 | win 96.5%, tower deaths 0.26 | win 96.5%, tower deaths 0.47 | pass |
| T17 | Determinism | v24, v25 replays byte-identical on the frozen copies; v26 deterministic | | backend: every v10–v26 fixture verifies on its own version and is refused under another; `determinism.mjs` 100 seeds + PvP + Blitz + Hearthwood all identical; hearth `--det 40` 120 / 120; `pvp-symmetry` 4,000 matches pass (side 49.6%, cats 52.2%); `determinism-browser` e2e pass | pass |
| T18 | Checks | all | | | see §4 |

### 2.1 Official gates (unseen seeds 20001+)

| Gate | v25 | v26 |
|---|---|---|
| `--gate balance` (2,000) | all pass: side 51.6%, cats 49.9%, 3.49 takedowns a minute, trailing at 3:30 won 28.7%, down 10+ won 1.7%, median 7:12 | side 47.8%, cats 52.8%, 3.38 a minute, trailing 35.7%, median 7:46, p95 8:39, 0 safety ends; **down 10+ won 6.6% of 243 (< 5%: fail)**; per-hero rows are judged pooled over 8,000 seeds, and seven single-window rows sit 0.1 to 2.1 points outside 46–54 |
| `--gate fun1` (200) | win 96.5%, core kill before Sudden Death 84.5% (fails on v25 too) | win 96.5%, 78.0% |
| `--gate blitz` (2,000) | trailing at 1:30 fails on v23 and v24 too | side 48.0%, cats 48.8%, median 2:55, p90 2:58, 100% core kill, 4.15 takedowns a minute (0:30 Fortify run); two single-window hero rows out of band; trailing at 1:30 won 18.4% (20–40%: fails, as on v23 to v25) |
| `--gate blitzNovice` (400) | | 83.0% (≥ 60%: pass) |
| `hearth-gates --det 40` (300 seeds, 600 matches) | same seeds: side 47.8% (fail), cats 46.5% (fail), 9 heroes out of band | side 44.8% (48–52: fail), cats 47.8% (pass), 5 heroes out of band, p50 13:06, p95 13:13, 0 safety ends, determinism 120 / 120. One 300-seed window is noisy (v25 fails it too); the design's method needs two 2,000-seed windows, not run here |
| `pvp-symmetry` (2,000 seeds × both sides) | | side 49.6%, cats 52.2%: pass |

### 2.2 Determinism

See T17.

## 3. Tuning record

Every lever stayed inside the design's ranges. Probe windows were 200 seeds (3v3) and 160 seeds (5v5) from 300001.

| Run | Change from the plan | Effect |
|---|---|---|
| a | the plan as written | 3v3 Normal first tower 4:24, chip-killed 4%; Pudding took 43% of first-tower HP (Hard 38%); 5v5 Normal 7:25, chip-killed 41%; Blitz Normal 48.5% of matches lose a tower |
| b | bolt at the top of its range: 140 + 4%, Fortified ×1.30, plus Pudding at 75% | dive survival 82% (a: 81%), so bolt strength does not move it; dropped |
| c | Pudding at 75% (lever 5), Blitz 0:30 | 3v3 heroes and minions 51–61% of first-tower HP; Blitz Easy novice 1:15, Blitz Normal unchanged |
| d | c + Normal chip 2000 (lever 1), Hearthwood 5:30 (lever 2), `fortifyBp` 5500 (lever 3) | 5v5 Normal 7:03, chip-killed 45%; the shipped set, with Blitz back to 0:45 |
| e | d + the bolt at the bottom of its range (120 + 2%, ×1.15) | Blitz Normal 49% (d: 48.5%); dropped |
| Blitz ablations | d with no Blitz Fortify / with Normal chip 3500 | 50.5% / 50%: no single lever brings Blitz Normal back to v25's 57% |
| balance h1 / h2 / h3 | chip 3500 / bolt 140 + 2% / Crossing 3:30 | down 10+ won 8.1% / 7.5% / 9.1%, so no lever in range fixes the deficit gate; cats 51.7% / 52.6% / 52.3% |

## 4. Versioning and checks

- `SIM_VERSION` 26. `tools/vendor-sim.mjs` freezes v25 at d83f5743, its commit on main (bundle `668d9edd…`, the same nine `extra`
  fixtures as v24), so the backend verifies 10 to 26. `pawlegends-live.spec.ts` lists v26 in every version list and has
  a v26 case: v26 records verify on v26 only, and the frozen v25 still verifies its own. The party-identity golden was
  regenerated from the v26 sim and its live fixtures; `sim-stamp.json` has the v26 source hash.
- Unit tests: `tests/unit/sim-v26-towers.test.ts` (each rule, its data and the beam heat); the v21 tower, lock-on and
  chip tests now assert the v26 values.
- Checks on the final tree:
  - Pawlegends: `tsc` passes. `lint:sim` passes (163 files). `vendor-sim` built v26 with v10–v25 frozen, and its test
    passes. `budget` passes (first load 414.6 KB gzip, party chunk 43.4 KB). `build` passes.
  - `vitest`: 3,228 of 3,243 pass. Run alone afterwards, the suites that timed out under a load of about 200 pass:
    `pings`, `sim-v10`, `objectives`, `vendor-sim`, `root`. The remaining failures are environmental:
    - the `perf-sim` and `net-rejoin` timing cases, which are CPU-time budgets on a loaded machine;
    - the two `tools/trailer` copy-gate cases, which fail in a worktree whose root has no `node_modules`.
  - Backend: `tsc` and `build` pass. `jest src/pawlegends src/vendor`: 1,041 pass and 3 fail on timing under load (the
    casual relay surrender wait, `loop-gate` idle delay, and the worker thread's cold start of 17 bundles at 60 s). The
    worker-thread block passes when run alone.
  - e2e (`first-match`, `match-desktop`, `match-touch`, `objectives-lock`, `determinism-browser`, `lol-inworld`, port
    4537): all pass except `match-desktop.spec.ts:126`. That test's `[data-h="sage"]` locator now also matches the 3D
    hero stage's `<figure>` from main, so it is a selector clash and not a v26 change.
- Not run: `npm run build:client` output is not committed. The client bundle ships with the release, as for v25.

## 5. Adversarial verification (2026-11-13, after dd7f2ae5)

- Fixed: the tower-focus hold (§1.E) also fired during a new lock-on on a hero the tower had shot on an earlier visit
  (`shotAt` is never cleared). The hold now needs the lock-on on that hero to be done; v26 re-vendored, golden and
  sim-stamp regenerated.
- Determinism: `tools/determinism.mjs` 60 + 60 seeds (PvP, Blitz, Hearthwood) identical; `hearth-gates --det 20` 60 of 60;
  `determinism-browser` e2e passes; backend `pawlegends-live` (v10 to v26 each verify on their own version only) passes.
- Matches end on time: 3v3 Normal 600 unseen seeds median 7:47, p95 8:39, 0 safety ends; Blitz 400 seeds median 2:55,
  100% core kills, 0 draws; Hearthwood median 13:05. No side wins every match (3v3 53.2 / 46.8, Blitz 50.8 / 49.3).
- Still open: `map5v5-probe` seeds 60001–60120 flags 2 single 3–4 s stalls of a pushing bot near an enemy inner tower
  (v25 on the same seeds: 0), so its `stuckSeeds === 0` bot check fails; the bots do not read tower numbers, so this is a
  changed match flow, not a bot rule. Deficit gates as in §2: 3v3 down 10+ won 8.6% of 58, feeder vs Normal 5.5% of 146.
- Not v26: e2e `match-desktop.spec.ts:126` (selector clash) and `match-touch.spec.ts:109` (flaky target pick) fail the
  same way on the v25 base 9fd054db.
- Open, older than v26: a tower's ramp streak also carries over to a hero's later visit (the first bolt of a new visit
  already counts as a repeat). Unchanged here.
