# Sim v34: five 3v3 maps, one drawn per match

Founder ask (2026-11-17): "we need more 3v3 maps variations. implement: Halcyon Fold, twisted Treeline ( reworked ),
Gem Grab / Brawl Ball Maps. take in layouts, some best mechanics based form these ( positioning, elements ). ... so
we'll have 5 3x3 maps ( our own, and additional 4 of these I've provided, rotated randomly )."

Design: [MAPS-3V3.md](MAPS-3V3.md). Four original maps, each built on the genre idea of one reference (layout shape,
positioning, kind of objective). None of them uses another game's names, geometry, art, icons or sound. Win condition
unchanged: towers, then the core.

| MapId (index) | Name | Genre idea | Signature |
|---|---|---|---|
| `crossing` (0) | Purrhaven Crossing | ours | unchanged |
| `ridge` (2) | Lanternfall Ridge | one lane plus a big jungle | Fish Mill (pot of Fish + Lantern Wave), then Pudding wakes in the mill pit at 4:30 |
| `thicket` (3) | Twinbark Thicket | two lanes, capture points, den boss (reworked) | two Paw Shrines (home shrine each): one gives Swift Paws, both give Twin Blessing; Pudding's Den |
| `quarry` (4) | Geode Quarry | central gem mine | Catnip Gems: carry 7 for 12 s to get a Geode Surge |
| `pitch` (5) | Pawball Park | ball into a goal | the match yarn ball; a goal smashes 12% off the weakest enemy tower; crates regrow after a goal |

## 1. What shipped (and where it differs from the design)

- **Rotation.** `pickMap3v3(seed)` (`sim/api.ts`) draws from `MAP_POOL_3V3` on the seed's own `fork('map')`. It is
  pure and used in three places: the client's Skirmish, the party relay (after the final seed, for 3v3 co-op and PvP
  rooms), and the backend through the record's `map`.
  - Skirmish: from the player's 4th match. The first three stay on the Crossing, where the Rookie script runs.
  - The client re-draws the seed (at most 8 times) so the same map is not played twice in a row
    (`ui/mapPick.ts`, per device, guarded `localStorage`).
  - Blitz, Cannon Chaos, the weekly twists, One Lane, the Duel and Boss Weekend stay on the Crossing.
  - 5v5 Classic stays on Hearthwood.
- **Practice.** The variant step shows six chips: Random · Crossing · Ridge · Thicket · Quarry · Park. Random is the
  default, and the choice is remembered on the device. The `practice` mutator's `maps` lists all five 3v3 maps.
- **Loading card.** It shows "Into Lanternfall Ridge…" and the map's one-line rule. The in-match objective chip shows
  the live state (for example "Fish Mill: 120 Fish", "Save your shrine!", "Stop their Surge: 0:07", "Goals 2 – 1"). A
  rail note marks each capture, Surge and goal.
- **Match history.** The mode line names the pool map (for example "Skirmish 3v3 · Ridge"). The backend history keeps
  the real map id (`history.model.ts`; v33 collapsed every map to Crossing).
- **Data model.**
  - Each map is a `MapDef` built by `data/maps/pool.ts` from a short spec (`data/maps/{ridge,thicket,quarry,pitch}.ts`)
    on Crossing's frame.
  - Playfield `open: 3` is the mirror carve: lanes, base plazas, and the clearings and corridors of team 0's half,
    folded onto the other half.
  - Objective state lives in `world.ob`. It is hashed last and is empty on Crossing and Hearthwood. It also holds the
    pool maps' camp timers.
  - Hooks: Swift Paws in `bonusSpeedBp`; Lantern Wave, Twin Blessing and Surge in `dealDamage` (structures and minions
    taken); gem drops on a hero's death; the goal test and crate cracks in `funshot`.
- **Deviations from MAPS-3V3.md:**
  - Ridge has two towers a side (outer, plus an inner "Ridge Gate"), not three. This keeps every two-tier rule
    (core exposure, the bots' lane structures) as it is. Ridge's waves are bigger instead (3 melee + 2 ranged), so its
    one lane carries enough push.
  - Quarry's Surge threshold is 7 gems (design 8). Surge is minions 150% and heroes 125% to structures (design 130% and
    115%), so Surges finish towers.
  - A softer core on Ridge, Quarry and Park (2,500 HP; Crossing 3,000) and an earlier late Sunset (Ridge 7:30, Quarry
    and Park 7:00 on Normal and Hard; Crossing 8:30). Without them, 2–6% of those maps' matches reached the 11:00 safety
    end. Ridge's inner tower stands at the bridge (24 m), not the base mouth.
  - Thicket's lanes run 1 m further in than designed (y 53 and 7, like Crossing). At y 54 the rim narrowed the band and
    jammed waves.
  - Bots play Quarry's gems only until Sunset, then play for the core. Bots kick the Park ball with a stateless
    approach-and-walk-through (no carry).
  - Not shipped: a host map choice in the custom party lobby (optional in the design). The party relay always draws.

## 2. Gates (measured on the first v34 build, 2026-11-17; the balance pass in §2b changed the pool maps after)

**G1 identity.** All Crossing and Hearthwood paths are unchanged.
- `tools/map-identity.mjs`: 240 Crossing seeds × co-op, party and PvP fuzz, recorded on v33 and replayed on v34:
  **720/720 identical**.
- Every v33 replay fixture (Crossing solo, champion, dogs, forfeit, kite, late, PvP, Blitz, Hearthwood solo, party and
  PvP, the roster heroes), relabelled 34, verifies on the v34 sim: **14/14** (`tests/unit/sim-v34-identity.test.ts`).

**G2 determinism.** `node tools/determinism.mjs --seeds 40 --no-blitz --no-hearthwood`: every seed plays a plain match,
a PvP match and a pool-map match (in turn), each recorded and replayed: **all identical**. Each pool map also plays a
whole bot match twice with the same trail, and its replay verifies (`tests/unit/sim-v34-maps.test.ts`).

**Sanity (the founder's bar).** 200 bot matches per map, a normal player-bot against Normal bots, seeds 1001+ (Quarry
and Park 2001+ after their last change), `node tools/maps-sanity.mjs --map <id> --seeds 200`:

| Map | p50 / p95 | Ends on a core | Safety ends | Team 0 wins | Takedowns/min | Objective per match (p50) / matches with one | Trailing at 3:30 wins |
|---|---|---|---|---|---|---|---|
| Crossing (reference) | 7:38 / 9:23 | 199 | 1 (0.5%) | 47.5% | 3.31 | – | 37.0% |
| Lanternfall Ridge | 7:25 / 9:35 | 199 | 1 (0.5%) | 47.5% | 4.15 | 2 mill captures / 100% | 35.1% |
| Twinbark Thicket | 7:37 / 9:24 | 200 | 0 | 54.5% | 2.48 | 6 shrine captures / 100% | 26.4% |
| Geode Quarry | 7:41 / 8:50 | 200 | 0 | 52.0% | 2.39 | 7 Surges / 100% | 33.3% |
| Pawball Park | 7:48 / 9:10 | 199 | 1 (0.5%) | 54.0% | 2.62 | 2 goals / 68.5% | 31.7% |

No pool map ends on the safety timer more often than the Crossing (0.5%). Pudding is calmed 1.4 times a match on Ridge
(he wakes at 4:30) and 1.9 on Thicket, against 2.0 on the Crossing.

Matches with a stuck bot (moving with no progress for 5 s):

| Crossing | Ridge | Thicket | Quarry | Park |
|---|---|---|---|---|
| 19/200 | 12/200 | 47/200 | 27/200 | 34/200 |

Most are the same jam at the lane front by the enemy outer tower that the Crossing has. On Park some bots stand at a
crate while the ball rests against it.

**G6 touch and camera.** `tests/e2e/maps-pool.spec.ts`, Playwright `--workers=1`, desktop 1280 × 720 and landscape
844 × 390 with touch: Practice picks each map from its chip, the hero walks (right-click, or the stick), 60 game
seconds run, the snapshot carries the objective, and no page error is thrown: **8/8**. The map chips fit 844 px.

**G7 budget.** See §4.

Not run (open, §5): the full G3 balance gate per map (2,000 seeds, every hero 44–56%) and G4's 500-seed objective
probes.

## 2b. Balance pass (2026-11-17, before release; v34 had no live replays, so the numbers changed inside v34)

Tooling: `npm run match -- --gate balance --map <id>` (new `--map crossing|ridge|thicket|quarry|pitch|pool`; `pool`
draws each seed's map with `pickMap3v3`, as Skirmish does, and prints a per-map line). Normal player-bot against
Normal bots. Fit windows on seeds 1–14,000 and 30,001–34,000; judged on unseen seeds 20,001–28,000.

What changed (data and pool-map-only rules; Crossing and Hearthwood untouched, `tools/map-identity.mjs` 720/720):
- **Per-map hero rows** (`MapDef.heroPvp`, applied after the 3v3 `pvp` row on pool maps only, like Hearthwood's and
  Blitz's own rows). Ridge's one lane made it a brawl map: tanks and bruisers 57–63%, ranged carries 40–43%. Thicket,
  Quarry and Park got small rows (±0.5–2.5%). Sensitivity on these maps is about 5 win-rate points per 1% (three times
  Hearthwood's), so the steps were damped to 0.15–0.2 of the logistic step after the first passes overshot.
- **Pool late Sunset** (`POOL_LATE` in data/timeline.ts, late.ts): the structure ramp twice Crossing's (+400% a
  minute, cap +2,000%), respawns +100% a minute to +300% (cap 60 s). **Takedowns past the late tick** hit the core
  2× (`POOL_LATE_TAKEDOWN_CORE_BP`). The safety ends were base races where all six heroes held one base and no
  structure damage landed; the fights went on, so the won fights end them now.
- **Pawball Park**: a crate breaks on the first ball hit (`capture` 2 → 1); bots clear a ball only within 13 m of their
  own goal (`OBJECTIVE_BOT.defend` 14 → 13 m; below ~12.5 m the clears stop and a match has 8+ goals); a kick whose
  walk-through point is a crate or wall turns (the bot pressed into the crate before).

Results, 2,000 matches a map (before: seeds 1–2,000 on the first v34 build; after: seeds 20,001–22,000):

| Map | Median (p95) | Core ends | Safety ends | Team 0 wins | Cats | Trailing at 3:30 wins | Hero win rates |
|---|---|---|---|---|---|---|---|
| Crossing (v33 = v34) | 7:40 (9:08) | 2,000 | 0 | 47.8% | 50.1% | 38.8% | 46.0–56.5% |
| Ridge before | 7:18 (9:23) | 1,996 | 4 | 51.0% | 49.1% | 31.4% | 39.7–62.9% |
| Ridge after | 7:28 (9:00) | 1,999 | 1 | 50.8% | 52.9% | 30.3% | 43.5–58.7% |
| Thicket before | 7:42 (9:12) | 1,999 | 1 | 49.8% | 51.6% | 33.4% | 42.0–59.3% |
| Thicket after | 7:44 (9:00) | 2,000 | 0 | 50.3% | 51.5% | 36.3% | 42.1–54.3% |
| Quarry before | 7:41 (8:56) | 2,000 | 0 | 47.5% | 50.1% | 33.5% | 44.1–55.5% |
| Quarry after | 7:30 (8:30) | 2,000 | 0 | 48.2% | 50.4% | 35.3% | 45.5–57.5% |
| Park before | 7:48 (9:15) | 1,997 | 3 | 50.7% | 50.2% | 36.8% | 43.9–55.9% |
| Park after | 7:30 (8:37) | 1,999 | 1 | 47.4% | 50.3% | 36.2% | 43.4–56.4% |

A 2,000-match window gives each hero ~430 slots (±2.4 points), so per-hero rates are judged pooled (V20-CHASE.md §10).
**Pooled rotation, 8,000 matches (seeds 20,001–28,000, each seed's own map):** median 7:35 (p95 8:57), 8,000 core
ends, 0 safety ends, team 0 49.2%, cats 50.4%, trailing at 3:30 wins 33.0%, **every hero 46.9–52.8%**. Per map in that
run: Crossing 50.5% / 7:39, Ridge 51.3% / 7:25, Thicket 48.7% / 7:44, Quarry 47.1% / 7:28, Park 48.6% / 7:32, no
safety end on any.

Expected misses of the Crossing gate bands, by design: core kill before late Sunset (pool maps' late tick is 7:00 to
7:30, so 5–80% end after it; Crossing 83%); Ridge 4.2 takedowns a minute (one lane, every fight is 3v3; band 2.5–3.5).
Brutus's level-6 branch is 44.9% pooled, the same as on the Crossing (not a map effect).

Sanity, 200 matches a map (seeds 1,001+, `tools/maps-sanity.mjs`), before → after:

| Map | Objective | Matches with a stuck bot (Crossing 19) |
|---|---|---|
| Ridge | 2 mill captures, 100% → same | 12 → 14 |
| Thicket | 6 shrine captures, 100% → same | 47 → 33 |
| Quarry | 7 Surges, 100% → same | 27 → 32 |
| Park | 2 goals; a goal in 68.5% → 74% of matches | 34 → 21 |

The stuck bots left are decision flicker, not geometry: the bot's think alternates every 20–30 ticks between two
targets (lane front and own tower, Pudding and lane, a gem and a back-off from a visible enemy). Gem hysteresis was
tried (a smaller safety radius once on the way, a hunter heading for the carriers' hold point, no gem with an enemy
hero in engage range) and moved Quarry 32 → 31, within noise, so it was not kept.

## 3. Freeze and release

- `SIM_VERSION` 34. v33 is frozen at 31c3c5c8 (its sim commit on main) with its fixtures. The backend verifies 10 to 34
  (`tools/vendor-sim.mjs` FROZEN).
- New live fixture: `maps-replay.fixture.json`, one Normal match on each pool map. The backend spec checks that each
  verifies and that the same record labelled 33 is refused.
- The vendored party facade exposes `MAP_POOL_3V3` and `pickMap3v3`. A room on a v33 bundle has neither, so it stays on
  the Crossing. `PROTO` is unchanged: a room's `map` was already a string on the wire, and the relay refuses mixed sim
  builds.
- Release order (FORCE-UPDATE.md, LIVE-MATCH-DEPLOYS.md): the backend first (it accepts 33 and 34), then the game build
  and the OTA, which raise `minSim` to 34.
