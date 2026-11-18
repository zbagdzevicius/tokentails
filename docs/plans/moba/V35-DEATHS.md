# Sim v35: deaths punish more, champion kills give much more XP

Founder ask (2026-11-17, verbatim): "deaths should be more and more punishing ( making each respawn longer and longer
towards ) ultracode. and champ kill should give much XP, much more than now".

It continues the player feedback that sim v33 answered first (V33-KILLS.md): a player with many kills must be clearly
stronger, and respawns must slow down as the match goes on so won fights turn into towers and the core. The founder
said v33 was still not enough. v35 also takes item 1 of V35-BACKLOG.md (Practice dummies and objectives).

## 1. What changed

### Respawn

```
wait = base(level) × time(t) × deaths(weight)        then Sunset × 1.25, lead pressure, caps, late Sunset (as before)

base(level)    = 3 s + 1 s × level, at most 13 s          (v12–v34: 3 s + 0.9 s × level, at most 12 s)
                 at most 4 s before 2:00 (unchanged)
time(t)        = 1 + min(160%, 10% × minutes past 3:00)   (v33/v34: 8% a minute, at most 120%)
deaths(weight) = 1 + min(72%, 12% × weight), from 3:00     (new)
weight         = the hero's earlier deaths, minus one for every 1:30 it stays alive (never below 0)
```

| Rule | v34 | v35 | Where |
|---|---|---|---|
| Level wait | 3 s + 0.9 s × level, cap 12 s | **3 s + 1 s × level, cap 13 s** | `RESPAWN.perLevel`, `cap` |
| Match-time growth (Normal, Hard, PvP) | +8% a minute from 3:00, max +120% | **+10% a minute, max +160%** | `DifficultyRules.respawnGrowBp`, `RESPAWN.growMaxBp` |
| Death weight | none | **+12% per weighted earlier death, max +72% (6 deaths)**; −1 weight per 1:30 alive; applies from 3:00 | `RESPAWN.deathPerBp`, `deathMaxBp`, `forgiveTicks`, `DifficultyRules.deathGrowBp`, `World.deathN`, `World.lifeAt` |
| Cap before late Sunset, 3v3 | 25 s | **40 s** | `RESPAWN.hardCap` |
| Cap, 5v5 Hearthwood (× 1.3) | 35 s | **55 s** | `HEARTHWOOD_RULES.respawnCap` |
| Late Sunset caps | 45 s Crossing, 60 s pool maps and Hearthwood | unchanged | `LATE_SUNSET`, `POOL_LATE`, `HEARTHWOOD_LATE` |
| Rookie and Easy | Rookie no growth, Easy +4% | **unchanged; no death weight** (a new player is never punished for dying) | `DIFFICULTY_RULES` |

The weight lives in the world (`deathN`, hashed) so the server replay computes the same wait. A hero's next life starts
when its wait ends (`lifeAt`), and the forgiveness counts from there: a player who stops dying gets its short waits
back, so a bad start is not permanent misery. Blitz keeps its flat 6–8 s wait (the weight still counts but adds nothing).

### Champion kill XP

| Rule | v33/v34 | v35 | Where |
|---|---|---|---|
| Kill XP | 120 + 30 × victim level | **220 + 55 × victim level** (about 1.8×) | `XP.killBase`, `killPerLevel` |
| Killer's own bonus (unshared) | +50% | **+75%** | `XP.killerBonusBp` |
| Assisters and nearby allies | their share | **50% of their share** | `XP.assistBp` |
| Victim above its killer | +50% once 2+ levels up | **+25% for each level up, max +100%** | `XP.upsetPerLevelBp`, `upsetMaxBp` |
| Bounty (streak of 2+) | +50 a takedown, max +250 | **+100, max +500** (shutdown pays it) | `XP.killPerStreak`, `killStreakMax` |
| Levels 8, 9, 10 | 2,350 / 2,950 / 3,500 XP | **2,900 / 4,100 / 5,500 XP** | `XP.toLevel` |
| Hearthwood XP rate (every source) | 80% | **75%** | `HEARTHWOOD_RULES.xpBp` |
| Easy: enemy 2+ levels above the human earns | 85% | **60%** | `DIFFICULTY_RULES.easy.enemyAheadXpBp` |

Example: a solo kill on a level 7 champion pays 220 + 385 = 605 XP plus the killer's 75% (454): 1,059 XP. In v33 the
same kill paid 330 + 165 = 495. Dead champions earn no XP (already true: `grantXp` skips the dead). Catch-up XP and
the shutdown bounty are unchanged in shape and scale with the new numbers, so a team behind can still come back.

The higher cost of levels 8 to 10 is what makes the kills show late: with v34's curve every champion reached level 10
by about 7:30 to 9:00 and the level cap hid any kill lead. Now the champions who win their fights reach 9 and 10 and the
others stay around 7 or 8.

### Practice dummies never play objectives

`countIn` (`sim/units/objective.ts`) skips Practice dummies, so no dummy holds or contests a capture disc on any map.
On Lanternfall Ridge the walking dummy crossed the Fish Mill on every lap and reset the capture (V35-BACKLOG.md §1);
the player now takes the Mill in Practice (`tests/unit/sim-v35.test.ts`).

### On screen

The nap card's kicker says why a wait is long when earlier deaths lengthened it: **"Death 4 · +36%"** (the death weight
and its share of this wait). Without a death-weight bonus it keeps sim v33's "Long nap: respawns grow as the match goes
on" for 20 s or more, else "Napping at the fountain". The death event carries `weight` and `weightBp` for it (events are
not hashed). The kill feed already shows the bounty and shutdown tags, now with the bigger values.

## 2. Measured

Tool: `node tools/deaths-probe.mjs --map pool|hearthwood` (`tools/lib/deaths-entry.ts`): one PvP match a seed with
`normal` pilots in every slot. v34 baseline on seeds 60,001+ (400 pool matches: 80 a map, 400 Hearthwood); v35 on seeds
80,001+ (1,000 pool matches: 200 a map, 200 Hearthwood). "Top killer" is the champion with the most kills; "0-kill" the
lowest champion when it has no kill. "Most-dying" is the champion with the most deaths in the match.

### Respawn wait (mean seconds; p90)

| | 3v3 v34 | 3v3 v35 | 5v5 v34 | 5v5 v35 |
|---|---|---|---|---|
| 1st death | 6.5 (10.9) | 7.0 (12.4) | 9.4 (14.5) | 10.3 (17.9) |
| 2nd death | 9.6 (14.8) | 11.0 (17.2) | 15.6 (29.1) | 18.1 (37.3) |
| 3rd death | 12.2 (19.5) | 15.1 (23.1) | 22.2 (60) | 25.7 (60) |
| 4th death | 14.6 (22.0) | 19.7 (29.3) | 27.6 (60) | 34.0 (60) |
| 5th death | 16.6 (25.0) | 24.6 (37.2) | 32.7 (60) | 41.0 (60) |
| 6th+ death | 19.5 (25.0) | 31.8 (40.0) | 39.7 (60) | 49.8 (60) |
| 0:00–3:00 | 5.9 | 6.3 | 7.0 | 7.4 |
| 3:00–5:00 | 11.0 | 15.4 | 12.3 | 16.7 |
| 5:00–8:00 | 18.0 | 25.3 | 18.6 | 27.3 |
| 8:00–10:00 | 34.5 | 43.6 | 31.8 | 42.2 |
| 10:00+ | – | – | 59.9 | 60.0 |
| most-dying champion: time dead (p90) | 15.7% (23.7%) | 20.7% (31.6%) | 22.3% (28.6%) | 28.8% (37.8%) |

### Kills and levels

| | 3v3 v34 | 3v3 v35 | 5v5 v34 | 5v5 v35 |
|---|---|---|---|---|
| XP from champion takedowns, all champions | 48.0% | **64.4%** | 46.1% | **61.6%** |
| … for the top killer | 53.2% | 71.1% | 55.8% | 71.1% |
| 5:00 level gap, top killer vs 0-kill | +2.7 | +3.2 | +1.9 | +2.8 |
| 8:00 level gap, top killer vs 0-kill | +1.6 | +2.3 | +2.7 | +2.8 |
| 10:00 level gap, top killer vs 0-kill | – (3v3 ends ~7:30) | – | +2.4 | **+2.8** |
| 10:00, kill gap 8+: level gap (share 3+ levels) | – | – | +2.2 (36%) | **+2.8 (76%)** |
| End of match, top killer vs 0-kill | +1.7 | **+2.7** | +1.6 | **+2.5** |
| End, kill gap 8+: level gap (share 2+) | +1.0 (31%) | +2.1 (70%) | +1.1 (37%) | +2.0 (72%) |
| Behind at the check wins (5v5 7:00; 3v3 3:30) | 39.3% | 27.0% | 29.7% | 32.9% |
| Ends on a core (safety ends) | 100% (0) | 99.9% (1) | 98.3% (7 of 400) | 97.5% (5 of 200) |
| Length p50 / p90 | 7:32 / 8:36 | 7:25 / 8:30 | 11:46 / 14:05 | 11:46 / 14:11 |

Per pool map (v35, 200 matches each): behind-at-3:30 wins Crossing 18.5%, Ridge 24.2%, Thicket 32.5%, Quarry 26.1%,
Park 33.9%; end gap top killer vs 0-kill +2.4 / +2.6 / +2.6 / +3.0 / +2.8; time dead of the most-dying champion
21.7% / 28.4% / 17.7% / 16.9% / 18.8%; p50 7:30 / 6:51 / 7:39 / 7:29 / 7:26; one safety end (Thicket).

What it means:

- Each death now costs clearly more than the one before: the 6th death waits about 32 s in 3v3 (v34 20 s) and 50 s in
  5v5 (v34 40 s). The first deaths stay short (about 7 s in 3v3, 10 s in 5v5).
- Champion takedowns are now two thirds of all XP. A champion with no kills ends a 3v3 about 2.7 levels under the top
  killer (v34 1.7) and a 5v5 at 10:00 about 2.8 under (v34 2.4); with a kill gap of 8 or more, 76% of 5v5 matches have
  a 3+ level gap at 10:00 (v34 36%). In 3v3 matches end around 7:30, so the end of the match is the 3v3 measure.
- Comebacks stay above the founder's 20% floor overall (3v3 27.0%, 5v5 32.9%). The Crossing PvP probe reads 18.5% on
  92 matches (±4 points); the Crossing balance gate (Normal player against Normal bots) is in §3.
- The most-dying champion spends about a fifth (3v3) to under a third (5v5) of the match dead. The forgiveness rule
  (one death off the weight per 1:30 alive) is what keeps that from growing further.

## 3. Gates

| Gate | v34 | v35 |
|---|---|---|
| Balance, pool rotation (2,000; seeds 1+): median / p95 | 7:35 / 8:57 (8,000) | 7:27 / 8:54 |
| … side, cats | 49.2%, 50.4% | 50.3%, 49.0% |
| … trailing at 3:30 wins (20–40%) | 33.0% | 31.1% |
| … down 10+ at the end wins (< 5%) | – | 1.6% |
| … heroes in 46–54% (one 2,000 window, ±2.2) | 46.9–52.8% pooled over 8,000 | 25 of 28; Brutus 44.3%, Chili 54.0%, Nugget 55.9% |
| Balance, Crossing only (2,000; seeds 20,001+): median / p95 | 7:40 / 9:08 (v33 = v34) | 7:28 / 9:04 |
| … side, cats | 47.8%, 50.1% | 49.8%, 51.0% |
| … trailing at 3:30 wins (20–40%) | 38.8% | 31.3% |
| … down 10+ at the end wins (< 5%) | – | 1.8% |
| … heroes in 46–54% (one 2,000 window) | 46.0–56.5% | 24 of 28; Aviete 45.9%, Ziggy 44.4%, Mochi 55.5%, Bengas 57.9% |
| fun1 (Rookie, naive) win / deaths p90 / length p95 | 99.5% / 5 / 7:10 (v33) | 100% / **4** / 7:27 |
| fun2 (Easy, naive) win | 71.5% | 71.5% |
| novice vs Easy (≥ 85%) | 89.8% (v33) | 89.8% |
| hard (Normal player vs Hard, 30–48%) | 47.5% (v33) | 42.5% |

Known misses carried from v33/v34: fun1 length p95 and "core kill before late Sunset" (the pool maps' late tick is 7:00
to 7:30), fun2 deaths median 6, Brutus's level-6 branch (44.1% pool, 42.6% Crossing). Comebacks on the gate stay in the
20–40% band on both runs (31.1% pool, 31.3% Crossing; v34 33.0% and 38.8%).

Per-hero rows were not refitted for v35. The heroes outside 46–54 on one 2,000 window (pool: Brutus, Chili, Nugget;
Crossing: Aviete, Ziggy, Mochi, Bengas) are the next balance pass, judged pooled over 8,000 seeds (V20-CHASE.md §10).
Bengas at 57.9% on the Crossing is the one clearly outside noise (±2.4 points).

**Done in sim v36** (V36-BALANCE.md): the 3v3 and Hearthwood rows were refitted on 8,000-match runs; every hero is
now 46.1–53.2% on the pool rotation and 48.0–52.4% in 5v5.

## 4. Freeze, backend build memory and release

- `SIM_VERSION` 35. v34 is frozen at 0be26b01 (its sim commit on main) with its fixtures, `maps-replay` included.
- **v10 to v19 retired.** DigitalOcean's 2 GB backend build had about 100 MB of margin and two builds ran out of memory
  on 2026-11-17. Local `nest build` peak RSS (macOS `/usr/bin/time -l`, several runs, it varies with GC timing):

  | Vendored sims | Peak RSS |
  |---|---|
  | v10–v34 (live before this change) | 2.62–2.66 GB |
  | v10–v35 | 2.72–3.09 GB |
  | **v20–v35 (shipped)** | **2.20–2.29 GB** |

  The founder was asked whether to retire v10–v19 and did not answer; the stated default (retire them if the v35 build
  would otherwise not fit) applied. The backend verifies 20 to 35. v10–v19 stopped being live by 2026-11-10, every
  client built since 2026-11-14 obeys the force-update policy, and stored rows of a retired version stay as they are; a
  device-queued v10–v19 match is refused with PAWLEGENDS_SIM_VERSION and purged by the host, as v9 was.
- Live fixtures re-recorded on v35; the backend spec checks every live v35 record verifies and the same record labelled
  34 is refused, and that frozen v34 verifies its own pool-map fixtures.
- `tests/unit/sim-v34-identity.test.ts` runs on the frozen v34 bundle (v35 changes every match).
- Release order (FORCE-UPDATE.md, LIVE-MATCH-DEPLOYS.md): the backend first (it accepts 34 and 35), then the game build
  and the OTA, which raise `minSim` to 35. The party relay refuses mixed builds as before.
