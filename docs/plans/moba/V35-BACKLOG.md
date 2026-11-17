# Paw Legends: sim v35 backlog

Sim changes that are found and understood but wait for the next sim version. None of them is worth a sim bump on its
own: a bump freezes v34, re-vendors the backend, forces every phone through an update (FORCE-UPDATE.md) and adds a
frozen sim to the backend build. Take them into whichever change makes v35.

## 1. Ridge Practice: the walking dummy resets the Fish Mill capture

**Done in sim v35** (V35-DEATHS.md §1): `countIn` skips Practice dummies on every map; `tests/unit/sim-v35.test.ts`
checks the player takes the Mill on Ridge in Practice.

**What players see.** On the Practice ground on Lanternfall Ridge, standing in the Fish Mill does not capture it: the
progress ring fills and drops back to zero again and again.

**Cause (sim data, not a rule).** The walking dummy (enemy slot 1) paces between `[44000, 19000]` and
`[56000, 19000]` (`pawlegends/src/data/practice.ts`, `PRACTICE_BY_MAP` row 2). The Mill is a disc at `(50000, 22000)`,
radius 3,500 (`data/maps/ridge.ts`, `objective`). The dummy's line is 3,000 from the centre, so on every pass it
crosses the disc for about 3,600 units (|dx| < 1,803). A dummy is an enemy hero to `countIn`
(`sim/units/objective.ts`), so the disc is contested and `progress` resets to 0. A capture needs 120 ticks
alone in the disc, and the dummy comes back before that.

**Fix (either, both change the sim's result, so v35):**

- Move Ridge's walking-dummy line out of the Mill, for example y = 15,000 (7,000 from the centre) for both ends, and
  check it stays out of both towers' reach like the other maps' rows; or
- make `countIn` skip Practice dummies (`isDummy`, `sim/units/practice.ts`), so no dummy ever holds or contests an
  objective on any map. This is the general fix: the Thicket shrines, the Quarry gems and the Park ball are the same
  kind of disc, and a dummy should not play objectives.

Prefer the second. Add a sim test: Practice on Ridge, the player stands in the Mill from its opening, and a
`millCapture` for the player's team arrives within `capture` ticks plus one dummy lap.

**Why not now.** Both options change what the sim computes, so a v34 replay would no longer verify. The founder rule
for this batch: no sim bump for this alone.

## 2. Stuck bots on the pool maps (from V34-MAPS.md §2)

**Measured** (200 matches a map, seeds 1,001+, `tools/maps-sanity.mjs`; a stuck bot = moving with no progress for
5 s): matches with at least one stuck bot, after the v34 balance pass:

| Crossing | Ridge | Thicket | Quarry | Park |
|---|---|---|---|---|
| 19/200 | 14/200 | 33/200 | 32/200 | 21/200 |

**What it is.** Mostly decision flicker, not geometry: a bot's think alternates every 20–30 ticks between two targets
(the lane front and its own tower, Pudding and the lane, a gem and a back-off from a visible enemy hero), so it walks
back and forth without getting anywhere. The common case is the jam at the lane front by the enemy outer tower that
the Crossing has too. On Park some bots stand at a crate while the ball rests against it.

**Tried and not kept.** Gem hysteresis on Quarry (a smaller safety radius once on the way, a hunter heading for the
carriers' hold point, no gem with an enemy hero in engage range): 32 → 31, within noise.

**Next steps for v35:**

- Commitment: once a bot picks a target, keep it for a minimum time (for example 2 s) unless its HP drops below its
  retreat line or a new enemy hero comes into engage range. One rule for all maps, in the bots' think, not per map.
- Park: a bot whose goal is the ball and whose path is blocked by a crate re-plans to the ball's far side (or drops the
  ball goal for 3 s) instead of standing at the crate.
- Gate: `npm run match -- --gate balance --map pool` keeps win rates and match lengths in their bands, and
  `tools/maps-sanity.mjs` shows stuck-bot matches at or below the Crossing's (19/200) on every map.
