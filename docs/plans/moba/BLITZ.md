# Blitz: the 3-minute match (sim v22)

Status: built in sim v22 together with the standard 5v5 Hearthwood (`MAP-5V5-STANDARD.md`). Source of the plan:
`pawlegends-wr-bs-plan.html` §4 (WR-BS-PLAN, founder-checked Nov 11: "V22 must ship both Blitz and standard 5v5 map").

**One line:** a real Crossing match, sped up to about 3 minutes: same heroes, towers and core, won on structures,
with the Kibble Cannon as the clip moment. Solo against bots at launch; Party and PvP later (§6).

## 1. Rules

One frozen rule table, `pawlegends/src/data/mutators.ts` (`MUTATOR_RULES.blitz`), read through `src/sim/mutator.ts`
(`mutOf`) by the tower and core setup, XP, respawn, the cannon, the phase clock, Sudden Death, the bots' truce and the
win check. No system carries its own `if (blitz)`. The `none` row is neutral, so every other match is byte-identical
to the pre-Blitz v22 build (§5.3).

| Item | Skirmish (v21/v22) | Blitz |
|---|---|---|
| Map | Purrhaven Crossing | Purrhaven Crossing only (`maps: ['crossing']`; a Hearthwood or PvP Blitz is refused) |
| Start | level 1 | **level 4** on tick 0; the level-3 talent is offered at once (bots pick theirs, a human by command) |
| XP | ×1 | **×2** (every source) |
| Towers | 2,250 / 2,750 (× the difficulty's scale) | **×0.45** |
| Core | 1 × | **×0.5** |
| Fortified | heroes deal 65% to towers until 3:00 | **never** (3:00 is the whole match) |
| Respawn | level based, Sunset ×1.25, lead pressure | **6 s at 0:00 rising to 8 s at 3:15**; the difficulty's human and enemy edges still apply |
| Kibble Cannon | 1:30, then 120 s after each shot | **0:20, then 40 s after each shot or fizzle**; none from Sudden Death on |
| Underdog Cannon | a team 3 structures or 8 takedowns behind | 3 structures or **3 takedowns** behind |
| Catch-up XP | from 3:00 (Normal) | **from 0:45** |
| Sunset | 6:45 (Normal) | **1:30** |
| Sudden Death | 8:30 (Normal) | **2:30**; cores burn 3% a second, **the same for both teams** (no takedown-gap burn) |
| Takedown core damage | chip 5%, Sunset 5% / 15%, Sudden Death 10% | **× 0.5** |
| Hero vs hero damage | ×1 | **×1.35**, then a per-hero Blitz row (`hero`, fitted on the gate, §4) |
| End | 11:00 safety end | **3:15 time up** (EndReason 4 `timeUp`) |

Not taken from the plan's table: minion waves every 20 s (Crossing already sends them every 20 s), +25% minion HP and
a 1:00 Pudding with ×0.5 escort HP. Each is one more row in the table if a later pass wants it.

### 1.1 Win condition

1. A core kill wins at once (EndReason 1 `core`).
2. At **3:15** (EndReason 4 `timeUp`): more enemy towers destroyed → higher own core HP share (compared exactly, by
   cross-multiplying) → more takedowns → more structure damage dealt → **draw**. No coin. A draw has `winner −1`,
   `draw: true` and `outcome 'lost'` for both teams (the record format has no third outcome); rewards pay the loss plus
   half the win bonus.

## 2. Rewards and records

- Treat XP (client) and Legends Pass Season XP (backend) are paid **per minute like Skirmish**: the match XP (and the
  grade's Treat XP) × ticks / 13,500 (a 7:30 Skirmish), at most ×1. The first win of the day is paid whole in any mode.
  `TREAT_XP.refTicks` (`meta/treats.ts`) and `SEASON_XP.refTicks` (`pawlegends-catalog.ts`) hold the same number.
- **No catnip and no fastest-win record** (`pawlegendsRanked`: only `mutator: 'none'` counts), no local fastest win, no
  bot-ladder change and no dare link (a dare replays its seed as a Skirmish).
- The backend accepts `mutator: 'blitz'` from sim v22 (`PAWLEGENDS_MUTATOR_PLAY_SINCE`); an older record with a mutator
  is refused before any re-sim. The digest covers the mutator, so the same inputs saved as 'none' are another record
  (and do not verify). The Token Tails host keeps a non-'none' mutator on the record it posts.

## 3. PLAY screen

- Three tiles under Play: **⚡ Blitz 3v3 · ~3 min | 🐾 Skirmish 3v3 · ~7 min | 🏰 Classic 5v5 · ~13 min**
  (`ui/lobby/matchMode.ts`). "3v3 Quick" is now "3v3 Skirmish"; tiles show minutes, never "Quick". The stored
  `'quick'` reads as Skirmish.
- Match 1 is the guided Rookie match (no tiles); a dare stays a Skirmish.
- `?mode=blitz|skirmish|classic` selects a tile once (the Token Tails host forwards `mode`; `/pawlegends?mode=…` goes
  to the game). A mode this build does not know shows "Update to play {Mode}. Playing Skirmish for now." and plays
  Skirmish, never a crash. Builds from before v22 (the Mac app without OTA) ignore `mode` and open on their own toggle,
  which is the same fallback.
- The Token Tails PLAY picker card opens `/pawlegends/play?mode=blitz&from=picker`.
- Blitz shows no online row (no Co-op, PvP or Friends queue for it); Skirmish and Classic keep theirs.
- Results: **Run it back** (same mode, one tap) stays the primary button and names the mode; the context button is
  "Quick Blitz? ~3 min" after a Skirmish or Classic loss and "Take {hero} into Skirmish" after two Blitz in a row.

## 4. Balance gate (`npm run match -- --gate blitz`)

2,000 seeds a window, the `normal` player-bot on slot 0 against Normal bots, heroes and tricks drawn per seed.

| Check | Band |
|---|---|
| Length median | 2:30 to 3:15 |
| p90 | ≤ 3:10 |
| Decided by a core kill | ≥ 85% |
| Draws | ≤ 1% |
| Safety ends | 0 |
| Side (Purrhaven) | 47% to 53% |
| Every hero | 46% to 54% |
| Cats (species) | 47% to 53% |
| Takedowns a minute | **4.0 to 6.0: a written Blitz-only exception** to the 3v3 band of 2.5 to 3.5 (a 3-minute match is a brawl by design) |
| Trailing at 1:30 (takedown gap + 3 a tower ≥ 3) wins | 20% to 40% |
| Down 10+ takedowns at the end wins | < 5% |
| Novice player-bot vs Easy (`--gate blitzNovice`, 400 seeds) | ≥ 60% |

Results: §5.

## 5. Results

### 5.1 Blitz gate, final table (fresh windows 1040001 and 1050001, 2,000 seeds each)

| Check | A (1040001) | B (1050001) | A + B | Pass |
|---|---|---|---|---|
| Length median / p90 | 2:55 / 2:58 | 2:55 / 2:58 | 2:55 / 2:58 | yes |
| Decided by a core kill | 100% | 100% | 100% | yes (every match ends on Sudden Death's burn before 3:15; 0 time ups) |
| Draws / safety ends | 0 / 0 | 0 / 0 | 0 / 0 | yes |
| Side (Purrhaven) | 47.3% | 50.4% | 48.8% | yes |
| Cats | 50.1% | 49.6% | 49.9% | yes |
| Heroes in 46% to 54% | 19/20 (Nugget 44.6) | 20/20 (46.4 to 53.6) | 20/20 (46.3 to 53.6) | yes on both windows combined |
| Takedowns a minute | 4.10 | 4.11 | 4.10 | yes (Blitz band 4 to 6; close to the floor) |
| Trailing at 1:30 wins | 16.6% of 590 | 16.1% of 540 | 16.4% | **no** (band 20% to 40%) |
| Down 10+ at the end wins | 0% of 40 | 0% of 41 | 0% | yes |
| Novice vs Easy (400 seeds, 1060001) | 83.5% | | | yes |

The window-to-window spread is larger than the binomial noise: slot 0's hero comes from a seed hash, so a window's mix of
heroes for the `normal` player-bot moves the side figure (window 1020001 with the previous table: side 44.4%, a dog
player-bot's team won 40.6%). That is why heroes are judged on both windows together, as the 5v5 gate is.

**Why trailing at 1:30 stays at 16%.** The match is decided in Sudden Death (2:30 to 2:55) by the core HP each team
brings into it. Each of these moved it, on 400 to 800 seeds (about ±2.5 points of noise): the takedown-gap burn in
Sudden Death on, 4% to 8%; off, 13% to 19%; half the takedown core damage, 18.9%; a third of it, 11.7%; the Underdog
Cannon at 3 takedowns behind, 18.1%. 1:30 is already more than half of a 2:55 match, so a 20% comeback needs a rule a
trailing team can use late (for example a Sudden Death objective), not a number. Founder call.

### 5.2 Tuning history (Blitz table)

| Run | Change | Median | Takedowns/min | Side | Heroes out of 46 to 54 |
|---|---|---|---|---|---|
| 400 seeds | plan table | 2:48 | 3.48 | 42.3% | 7 |
| 400 | + no Fortify, catch-up from 0:45 | 2:48 | 3.45 | 40.3% | 12 |
| 400 | + hero damage ×1.15, flat Sudden Death burn, truce 0 | 2:49 | 3.74 | 52.3% | 8 |
| 2,000 | hero damage ×1.3 | 2:49 | 4.14 | 46.4% | 8 |
| 2,000 | ×1.35, takedown core damage ×0.5, Underdog at 3, the difficulty's truce and respawn edges back | 2:55 | 4.25 | 49.3% | 7 |
| 2,000 / 4,000 / 4,000 | per-hero row, three refits (the second and third species-aware) | 2:55 | 4.12 to 4.14 | 47.5% to 49.6% | 7, 10, 1 |

### 5.3 Nothing else moved

The 'none' row is neutral and the new world field is not hashed, so Skirmish and Classic replay byte for byte as
before the Blitz work (HEAD 51f0de76):

- Skirmish (`--gate balance`, 300 seeds from 67001): 300/300 identical final hash, ticks and winner.
- Classic (`hearth-gates`, 40 mirrored seed pairs from 67001 plus 4 determinism seeds): identical output.
- `tests/unit/blitz.test.ts`: a 'none' match hashes exactly like a match without the field.
- Fresh gate re-runs (Skirmish 2,000 seeds from 68001; Classic 300 seed pairs from 68001): §5.4.

### 5.5 Release on main's v20 and v21 (2026-11-12, fresh windows from 3500001)

Blitz was tuned on the v21 branch without sim v20 (the Wild Rift chase fix). On main's v20 + v21 the first two windows
gave cats 47.8% (Aviete 44.3%, Sage 45.9%, Clem 46.0%; Rocket 54.9%). Every cat row +1% overshot (cats 53.0% on
4000001 + 4100001), so the shipped rows are every cat +0.5% except Duchess, and Aviete +1.6% in all.

| Check | E 4200001 | F 4300001 | E + F | Pass |
|---|---|---|---|---|
| Length median / p90 | 2:55 / 2:58 | 2:56 / 2:58 | | yes |
| Decided by a core kill; draws; safety ends | 100%; 0; 0 | 100%; 0; 0 | | yes |
| Side (Purrhaven, 47–53%) | 48.6% | 46.8% | 47.7% | pooled yes (F 0.2 under) |
| Cats (47–53%) | 50.9% | 50.8% | 50.9% | yes |
| Heroes (46–54%) | 17 / 20 | 19 / 20 | 20 / 20 (47.2–52.8) | pooled yes |
| Takedowns a minute (4–6, the Blitz exception) | 4.03 | 4.00 | 4.02 | yes, at the floor |
| Trailing at 1:30 wins (20–40%) | 17.1% | 15.8% | 16.5% | **no** (the §5.1 founder call) |
| Down 10+ at the end wins (< 5%) | 0% of 35 | 0% of 31 | 0% | yes |

Skirmish (`--gate balance`, 2,000 seeds from 4500001, the same sim as the live v21: Crossing identity 4,500 / 4,500):
34 of 35 pass (median 7:10, side 49.5%, cats 49.0%, takedowns 3.47 a minute, trailing at 3:30 wins 25.9%, down 10+
wins 1.8%); Meatball 44.6% on this window (a v21 row, judged pooled under the v20 method; not changed here).

## 6. Not in this build

- **Party Blitz.** The relay's `match` message carries the room config as `MatchConfigView` (`src/net/proto.ts`,
  vendored to `backend/src/vendor/pawlegends-net`); a Party Blitz needs a `mutator` there and in `party.set`, the party
  view, the room store, the relay's room config and the party panel: a protocol change in files the networking work
  (another worktree) is changing now. The sim, the party replay record (`partyReplayRecord` carries the mutator) and its verifier
  (`checkPartyShape`, `verifyPartyReplay`) already accept a Blitz party match.
- **PvP Blitz**: refused by the sim (`mutator … is not played in pvp`) until 3v3 casual sustains ≥ 12 joins a minute
  (plan §3a).
- **Cannon Chaos** (the plan's second row of the table, Weekly Twist from Dec 21): a later row in `MUTATOR_RULES`.

### 5.4 Fresh gate re-runs after the Blitz work

- **Skirmish** (`--gate balance`, 2,000 seeds from 68001): all 35 checks pass. Median 7:22, p95 8:34, 0 safety ends,
  side 49.1%, cats 50.3%, heroes 46.1% to 53.3%, takedowns 3.45 a minute, trailing at 3:30 wins 29.3%, down 10+ wins
  3.3%, every Paw Trick and both level-6 branches in band.
- **Classic** (`hearth-gates`, 300 seed pairs from 68001, 600 matches): side 48.0%, p50 13:06 / p95 13:13, 0 safety
  ends, determinism 120/120 pass; cats 54.0% and 10 heroes outside 46% to 54% fail on this window. Classic plays byte
  for byte as at 51f0de76 (§5.3), so this is the map balance pass's own window spread (its windows D and E gave cats
  51.3% and 49.3%, heroes in band only with both windows combined), not a Blitz change.
