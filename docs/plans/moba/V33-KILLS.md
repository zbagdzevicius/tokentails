# Sim v33: kills decide more, respawns grow with the match

Two pieces of player feedback (Lithuanian, 2026-11-16):

1. "When you kill another champion you should get more XP. If you do well on kills the power gap from the others should
   be bigger. Right now 10 kills vs 0 kills is almost the same strength and at most one level apart."
2. "Respawns should get slower the longer the match goes. With the same fast respawns, even teams trading kills never
   take the bases."

v33 sits on v32 (no Sudden Death, V32-NO-SUDDEN-DEATH.md), which already ends 5v5 matches on structures with late
Sunset. The numbers below are measured on v32 and v33 with the same seeds.

## 1. What changed

| Rule | v32 | v33 | Where |
|---|---|---|---|
| Kill XP | 80 + 15 × victim level, shared | **120 + 30 × victim level**, shared | `data/xp.ts` `killBase`, `killPerLevel` |
| Killer's own bonus | none | **+50% of the kill XP on top of its share** (not shared) | `XP.killerBonusBp`, `progression/xp.ts` |
| Streak bounty (XP on the hero's head) | from 3 takedowns in a row, +20 a step, max +80 | **from 2**, +50 a step, **max +250** | `XP.bountyStreak`, `killPerStreak`, `killStreakMax` |
| Kill Fish | 120 | **150** | `data/fish.ts` `FISH.kill` |
| Shutdown Fish | +40 a streak step, max 200 | **+60, max 400** | `FISH.shutdownPerStreak`, `shutdownMax` |
| Respawn growth with match time | none before the late tick | **+8% a minute from 3:00** (Normal, Hard, PvP; Easy +4%, Rookie none), at most +120% | `DifficultyRules.respawnGrowBp`, `RESPAWN.growFrom` / `growMaxBp`, `progression/respawn.ts` |
| Respawn caps | 15 s (Crossing), 25 s (Hearthwood) | **25 s, 35 s** (late Sunset keeps its own 45 s / 60 s caps) | `RESPAWN.hardCap`, `HEARTHWOOD_RULES.respawnCap` |
| Catch-up XP | unchanged | unchanged | – |

Respawns still scale with level (3 s + 0.9 s a level) and with lead pressure as before. The growth applies before
Sunset's ×1.25 and Hearthwood's ×1.3, so a level 9 hero who dies at 10:00 on Hearthwood waits about 28 s (v32: about
19 s); at 2:00 nothing changed.

Balance rows: the bigger kill rewards favoured the dog roster in 3v3 (cats 46.6% over 8,000 seeds), so 25 of the 28
3v3 `pvp` rows moved (cats up, dogs down). A hero's 3v3 row also applies on Hearthwood and in Blitz, so their rows
there (`HEARTHWOOD_PVP.hero`, Blitz `hero` in `data/mutators.ts`) take the inverse of that change and keep their own
balance. On Hearthwood five rows moved on their own (Stilts +2.5%, Dusty +2%, Brutus −2%, Marshmallow −2.5%, Bravo
−1.5%).

In-game: the kill feed tags a kill that ended a streak ("Shutdown +250 XP") and a killer who just earned or raised a
bounty ("Bounty +100 XP"); a respawn of 20 s or more says "Long nap: respawns grow as the match goes on" on the nap
card (the countdown itself was already on the nap card and over the portrait).

## 2. Measured (tools/kills-probe.mjs)

One PvP match a seed with `normal` pilots in every slot, seeds 60001+ (5v5: 300 matches, 3v3: 400). "Top killer" is
the hero with the most kills, "lowest" the hero with the fewest kills in the lobby.

### 5v5 Hearthwood

| At | Measure | v31 (Sudden Death) | v32 | v33 |
|---|---|---|---|---|
| 5:00 | level gap, top killer vs lowest | +1.0 | +0.9 | **+2.0** |
| 10:00 | kill gap / level gap | +7.6 / +1.2 | +7.7 / +1.2 | +7.9 / **+2.1** |
| 10:00 | kill gap 8+: level gap (share 2+ levels) | +1.5 (52%) | +1.5 (45%) | **+2.4 (87%)** |
| 10:00 | Toy tiers / Fish gap | +1.3 / +1,225 | +1.3 / +1,209 | +1.4 / **+1,658** |
| 15:00 | level gap (few matches run that long) | – | +1.1 (n 16) | +0.1 (n 16) |
| | respawn 0–5 / 5–10 / 10–13 min (mean s) | 8.4 / 13.9 / 18.3 | 8.5 / 15.5 / 51.6 | 9.3 / **23.3** / 59.9 |
| | behind at 7:00 wins (2+ towers or 5+ takedowns) | 13.6% | 30.2% | **30.6%** |
| | down 10+ takedowns wins | 5.3% | 21.2% | 25.5% |
| | ends on a core / length p50 | 100% (Sudden Death burn) / 13:07 | 98% / 12:07 | 98.7% / 11:56 |

### 3v3 Crossing

| At | Measure | v32 | v33 |
|---|---|---|---|
| 5:00 | level gap, top killer vs lowest | +1.0 | **+2.4** |
| 5:00 | kill gap 8+: level gap (share 2+ levels) | +1.4 (43%) | **+2.7 (100%)** |
| | respawn 0–5 / 5–10 min (mean s) | 7.1 / 12.4 | 7.9 / **18.1** |
| | behind at 3:30 wins (PvP pilots) | 36.4% | 37.4% |
| | ends on a core / length p50 | 99.8% / 7:39 | 100% / 7:38 |

What it means:

- A player far ahead on kills is now 2 to 3 levels up (was about 1.5), with about 400 more Fish; Toys stay close
  because everyone owns most of the four tiers by 8:00, and late in a 5v5 match both sides reach the level 10 cap, so
  the level gap closes after about 13:00.
- Respawns are short early (about 8 to 9 s), clearly longer mid-match and long late. Matches already ended on
  structures in v32 (no Sudden Death); v33 ends 5v5 matches a little sooner (p50 11:50 to 11:56 vs 12:07, about 99%
  on a core) and a won fight buys about 8 s more mid-match.
- Comebacks: the founder band is 20–40%. 5v5 "behind at 7:00 wins" 30.6% (v31 13.6%, v32 30.2%); 3v3 35.9–36.1% on
  the gate (v32 38.3%). The "down 10+ takedowns at the end wins < 5%" row passes on 3v3 for the first time since v29
  (4.8% and 5.1% on two 4,000 windows; v32 15.0%) and stays high on 5v5 (25.5%; v32 21.2%), where late Sunset's long
  respawns let a team behind on kills still trade structures.

## 3. Gates

3v3 balance (`npm run match -- --gate balance`), the shipped rows, two 4,000-seed windows (34001 and 38001; the rows
were fitted on 20001–34000, so these are new seeds):

| Check | v32 (20001, 2,000) | v33 shipped (8,000 pooled) |
|---|---|---|
| every hero 46–54% (pooled) | 4 out | **28 of 28, 47.3% (Frankie) to 53.2% (Bengas)** |
| cats | 51.5% | 49.8% / 50.9% |
| side (45–55%) | 47.0% | 52.5% / 48.7% |
| trailing at 3:30 wins (20–40%) | 38.3% | 36.1% / 35.9% |
| down 10+ wins (< 5%) | 15.0% | 4.8% / 5.1% |
| safety ends (0) | 1 | 2 / 1 (as in v32: a stalled defence) |
| length median | 7:45 | 7:37 / 7:38 |

5v5 (`tools/hearth-gates.mjs`, each seed played twice with the sides swapped):

| Run (matches) | Side | Cats | Heroes out of 46–54 | p50 / p95 | Safety ends (≤ 2%) |
|---|---|---|---|---|---|
| v32 (V32 doc, 600) | 46.0% | 47.3% | 7 | 12:08 / 15:00 | 2.0% |
| v33 before its own rows (20001, 4,000) | 50.5% | 48.2% | 5 (Bravo 54.5, Brutus 55.7, Dusty 44.8, Marshmallow 56.2, Stilts 43.8) | 11:53 / 14:49 | 1.8% |
| full steps on those five (40001, 2,000) | 49.6% | 52.9% | 11 | 11:53 / 14:52 | 2.4% |
| **shipped: half steps (44001, 4,000)** | **48.5%** | **51.7%** | see below | 11:50 / 14:49 | **1.9%** |

Shipped per hero: the 23 heroes whose rows did not move pooled over 8,000 matches (20001 and 44001): every one 46.8%
(Chili) to 53.5% (Meatball). The five that moved, on the 4,000 matches of 44001: Dusty 46.0%, Marshmallow 48.0%,
Stilts 49.0%, Brutus 50.0%, Bravo 54.1% (n ≈ 1,450, about ±2.6 points). The median length (11:50) is 10 s under the
G5 band's 12:00 floor: longer respawns end matches a little sooner. Determinism (solo, party and PvP 5v5 re-sims):
90 of 90.

Other gates (v33 shipped vs v32 on the same seeds where run):

| Gate | v32 | v33 |
|---|---|---|
| Blitz (2,000; 28001; v32 doc 26001) cats / side / trailing at 1:30 / down 10+ | 52.0% / 48.2% / 31.7% / 10.2% | 51.2% / 49.7% / 29.1% / 6.7% |
| fun1 (Rookie, naive) win / deaths p90 / p95 length / core before late | – / 4 / 7:42 / 82.0% | 99.5% / **5** / 7:10 / 82.5% |
| fun2 (Easy, naive) win / deaths median | – / 6 | 71.5% / 6 |
| novice vs Easy (≥ 85%) | – | 89.8% |
| feeder vs Rookie (≥ 80%) | – | 94.0% |
| hard (Normal player vs Hard, 30–48%) | – | 47.5% |

The fun1 "player deaths p90 ≤ 4" check now reads 5 (v32 4) on 200 seeds: a first-timer's enemies earn more from its
deaths. The other fun1 and fun2 failures were already there on v32.

## 4. Freeze and release

- `SIM_VERSION` 33; v32 frozen at 17fff703 (its sim commit on main) with its late fixture, so the backend verifies 10
  to 33 (`tools/vendor-sim.mjs` FROZEN). The live v33 `late-replay.fixture.json` is re-recorded on v33 (same seed,
  9:37, past the late tick); the backend spec checks it verifies and the same record labelled v32 is refused.
- The party golden was regenerated from v33 (`tests/unit/party-identity.test.ts`). The v32 checks in
  `tests/unit/sim-v32.test.ts` run against the frozen v32 bundle.
- Backend first (it accepts 33 beside 32), then the game build and the OTA, which raises `minSim` (FORCE-UPDATE.md §3.3)
  so a v32 client is asked to update before it plays.
- `tools/kills-probe.mjs` is the measuring tool; `tools/lib/sim-bundle.mjs` now applies experiment patches before the
  TypeScript transform (`enforce: 'pre'`), so a patch can match source text exactly.
