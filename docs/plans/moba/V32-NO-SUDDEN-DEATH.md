# V32-NO-SUDDEN-DEATH: Sudden Death removed (sim v32, 2026-11-16)

Founder ask (round 7): "let's get rid of that "sudden death" at all". Sim v4 to v31 ended every long match with
Sudden Death: from the difficulty's Sudden Death tick (Normal 8:30 on the Crossing, 13:00 on Hearthwood, 2:30 in
Blitz) every core lost 3% of its max HP a second (faster for the team behind on takedowns, sim v7) and every takedown
hit the victim's core for a flat 10%. Sim v32 removes all of it, in every mode, and ships with v31 frozen.

## 1. What is gone

- The core burn (`SUDDEN_DEATH.coreDecayBpPerSecond`, the takedown-gap burn, `MutatorRules.decayLead`).
- Sudden Death's flat 10% takedown core damage. Takedowns keep Sunset's share (`SUNSET.takedownCoreBp` 5%, or
  `closedCoreBp` while the inner towers stand) to the end of the match.
- The `suddenDeath` phase (`MatchPhase`) and the `suddenDeath` sim event. The host protocol keeps wire index 3 and
  reads it as `sunset`, so no index moves.
- Player-facing: the banner ("Sudden Death / Cores crumble"), the horn, the announcer clip (`voice/suddenDeath.mp3`
  deleted), the red throbbing clock, the "Sudden Death in …" and "Cores burn every second" chips, the bots' and the
  chat cues, music intensity 3 on the phase, the Blitz mode card line, the lore line, the end-cause lines ("Sudden
  Death burned their core down first", "… in Sudden Death") and every results-screen tip about the burn.

## 2. What ends a match now: late Sunset (`src/sim/late.ts`)

The old Sudden Death tick is now the **late tick** (`G.Late`, global slot 24; `TIMELINE_BY[d].late`, a mutator's
`late`). From it Sunset deepens every minute, the same for both teams (`LATE_SUNSET` in `src/data/timeline.ts`):

| Lever | Crossing (3v3, every mode on it) | Hearthwood (5v5, `HEARTHWOOD_LATE`) |
|---|---|---|
| Late tick (Normal / Hard) | 8:30 (unchanged) | **9:00** (Sudden Death was 13:00; Easy 9:30, Rookie 8:00) |
| Extra damage towers and cores take | +200% a minute, at most +1,000% (on top of Sunset's ×2) | +600% a minute, at most +4,000% |
| Towers' damage to minions | −25% a minute, down to 25% | the same |
| Respawn waits | +50% a minute, at most +200%, up to 45 s | +100% a minute, at most +300%, up to 60 s |
| Lead bonus (Normal, Hard; not in Blitz or Cannon Chaos) | +15% structure damage per takedown ahead, at most +150% | the same |

Nothing loses HP on its own: towers and cores fall only to heroes and minions. The structure share only applies from
Sunset (on Hearthwood the late tick is a minute before Sunset, so the ramp starts at +600%). The Kibble Cannon still
stops at the late tick (on Hearthwood that is now 9:00, not 13:00). The 11:00 safety end (16:00 on Hearthwood) stays,
as a last resort.

Blitz keeps its 3:15 time up. Without the burn a 3-minute match rarely reaches a core (3% of matches), so nearly every
Blitz match is decided at 3:15 by the existing tie-breakers (BLITZ.md §1.1): more enemy towers destroyed, then the
higher core HP share, then takedowns, then structure damage, else a draw. The same holds for Cannon Chaos (5:15) and
One Lane (8:00).

## 3. On screen

- The phase chip: "Final whistle in m:ss" when a mode has a designed end (Blitz, the events), "Take their core! Push
  with your wave: towers fall faster every minute" in late Sunset otherwise.
- The results line fits how the match ended (`resultLine`): "A clean sweep" only when the team is 6+ takedowns ahead
  and lost no tower; a time up names its tie-break ("Won on the final whistle: more towers down." / "…: your core had
  more left.", "Lost on the final whistle: they took more towers." / "…: their core had more left."); a draw says so;
  a forfeit says the other team gave up. No result line, end cause, tip or chip names Sudden Death.

## 4. Gates

Seeds are the tool defaults' unseen windows; v31 numbers are the same seeds on 345fb655 (a temporary worktree).

**3v3 balance gate** (`tools/headless-match.mjs --gate balance`, Normal vs Normal, seeds 20001–22000, the same seeds
on v31):

| Check | Band | v31 | v32 (shipped) |
|---|---|---|---|
| Length median / p95 | 6:30–9:00 / ≤ 10:30 | 7:45 / 8:40 | 7:45 / 9:23 |
| Core kill before the late tick (8:30) | ≥ 70% | 78.7% | 78.7% |
| Safety ends | 0 | 0 | **1 of 2,000** (seed 20778: the losing core was at 0% at 10:45; the 11:00 safety end gave the same winner) |
| Side (Purrhaven) | 45–55% | 47.5% | 47.0% |
| Cats | 47–53% | 50.4% | 51.5% |
| Heroes out of 46–54 (one 2,000 window) | judged pooled over 8,000 | 4 (Nova 55.8, Howler 54.9, Biscuit 45.8, Ziggy 46.0) | 4 (Nova 56.8, Meatball 54.0, Domino 45.8, Ranger 45.7) |
| Takedowns a minute | 2.5–3.5 | 3.39 | 3.40 |
| Trailing at 3:30 wins | 20–40% | 35.4% | 38.0% |
| Down 10+ takedowns at the end wins | < 5% | 12.4% (fails, as since v29) | 15.0% (fails) |

Nothing before 8:30 changed on the Crossing, so 78.7% of matches are identical to v31. A steeper ramp (+300% a minute)
did not remove the one safety end (the match stalls on defence, not on damage), so Crossing keeps +200%.

**Blitz gate** (`--gate blitz`). The band "≥ 85% decided by a core kill" and "p90 ≤ 3:10" only held because the burn
ended every match by 2:58; they are now "decided by a core kill or the 3:15 tie-breakers ≥ 99%" and "p90 ≤ 3:15"
(`tools/lib/funstats.mjs`). A 4× and 8× steeper Blitz ramp raised core kills only to 6% and 8% (300 seeds) and moved
cats to 59–61%, so Blitz keeps the base ramp.

| Check | v31 (20001, 2,000) | v32 before the row change (20001, 2,000) | v32 shipped (26001, 4,000) |
|---|---|---|---|
| Length median / p90 | 2:55 / 2:58 | 3:15 / 3:15 | 3:15 / 3:15 |
| Core kills / time ups / draws | 100% / 0 / 0 | 2.8% / 1,945 / 0 | 1.9% / 3,922 / 0 |
| Side | 49.0% | 49.7% | 48.2% |
| Cats | 47.7% | 53.4% | 52.0% |
| Heroes out of 46–54 | 10 | 15 | 6 (Aviete 55.5, Nova 56.5, Clem 55.9, Domino 45.5, Frankie 42.9, Nugget 45.5) |
| Trailing at 1:30 wins (20–40%) | 16.2% (fails) | 27.1% | **31.7%** (passes for the first time) |
| Down 10+ wins (< 5%) | 0% of 28 | 6.3% of 48 | 10.2% of 118 (fails) |

Row change: every cat row −0.5% (the v29 and v31 cats got rows). A per-hero refit that ignored the species effect
(seeds 1–4000) swung cats to 42.9% on 22001 and was thrown away.

**5v5 Hearthwood** (`tools/hearth-gates.mjs`, ten `normal` pilots, each seed played twice with the sides swapped):

| Run (matches) | Late tick, ramp | p50 / p95 | Safety ends (≤ 2%) | Side | Cats |
|---|---|---|---|---|---|
| v31 (ROSTER-V31.md, 8,000) | Sudden Death 13:00 | 13:07 / 13:14 | 0% | 49.5% | 48.8% |
| v32, Crossing numbers (20001, 600) | 13:00, +200%/min | 15:24 / 16:00 | **37.8%** | 47.0% | 53.0% |
| late at 10:00 (300) | +200%/min | 14:16 / 16:00 | 16.7% | 49.3% | 52.0% |
| + respawns +100%/min to 60 s (300) | | 13:48 / 16:00 | 15.0% | 44.7% | 52.0% |
| + structures +400%/min (300) | | 13:31 / 16:00 | 7.3% | 42.7% | 51.3% |
| late at 9:00, +600%/min (300) | `HEARTHWOOD_LATE` | 12:15 / 14:59 | 1.0% | 49.0% | 53.0% |
| same, 20001 (600) | | 12:12 / 15:01 | 1.7% | 49.0% | 54.0% |
| + 13 hero rows, full steps, 24001 (600) | | 12:15 / 14:58 | 2.0% | 49.5% | 46.2% |
| **shipped: half steps, 28001 (600)** | | **12:08 / 15:00** | **2.0%** | 46.0% | **47.3%** |

On the shipped rows 7 heroes sit outside 46–54 on 600 matches (Aviete 45.6, Biscuit 55.6, Bravo 54.4, Dusty 45.4, Pixel
44.7, Sage 45.0, Stilts 44.7; n ≈ 210 each, about ±3.4 points of noise) and the side read 46.0% (48–52; the three
earlier 600/300-match runs read 49.0–49.5%). Determinism (solo, party and PvP 5v5 re-sims): 120 of 120. The 8,000-match
per-hero verify the 5v5 method asks for was not run (one 600-match run took 40 minutes on the shared machine): it is
the first follow-up.

**Other modes** (`tools/modes-sanity.mjs`, 40 matches each, Normal): One Lane p50 5:05, 37 core and 3 time ups (v31:
40 core); Cannon Chaos p50 5:05, 23 core and 17 time ups (v31: 40 core at 4:34); Duel unchanged (goal or time up).
Every timed mode now ends on structures or its tie-breakers instead of the burn.

## 5. Freeze and release

- `SIM_VERSION` 32; v31 frozen at 345fb655 (its last commit on main) with its roster31 fixture, so the backend verifies
  10 to 32 (`tools/vendor-sim.mjs` FROZEN). The live v32 directory adds `late-replay.fixture.json`: a Normal match
  (seed 3287) that runs past the late tick (8:30) and ends on a core; the same record labelled v31 is refused.
- Every v31 Crossing record that ended before its late tick re-sims on v32 to the same hash (`sim-v32.test.ts`): nothing
  changed before the late tick on the Crossing. Hearthwood records change from 9:00.
- The party golden (`tests/unit/golden/party-identity.json`) was regenerated from v32; the party relay refuses mixed
  sims as before. Backend first (it accepts 32 alongside 31), then the game build; the OTA publish raises `minSim`
  (FORCE-UPDATE.md §3.3), so a v31 client is asked to update before it plays.
