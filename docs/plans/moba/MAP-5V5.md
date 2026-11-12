# Pawlegends 5v5 Classic on Hearthwood Divide (sim v19 plan, 2026-11-09)

> **Version note (2026-11-09):** this plan was written as sim v18 on top of the unreleased v17. While it was built,
> `main` released v17 (frozen at 451206ab) and v18 (the chase fix, docs/plans/moba/V18-CHASE.md). The branch was rebased
> on `main`, so 5v5 ships as **sim v19** with **v18 frozen** (at d904efbc), and "identical to the previous version" below
> means identical to the released v18.

**Status:** SIM lane built (sim v19, §12); SERVER lane built and soaked (§9, as built in §13); CLIENT lane (§8) in progress.
**Branch:** `feat/pawlegends-5v5`, rebased on `main` after the sim v18 release (chase fix).
**Request (founder, verbatim):** "create another map, which will be based on mobile legends 5x5 map. let's have 5x5 mode for that one."
**Reading of the request:** add a second map that follows the usual mobile 5v5 MOBA layout, with a new 5v5 mode on it:
- a diagonal base-to-base map;
- three lanes;
- a diagonal river with an early objective and a late objective;
- a four-part jungle with buff camps;
- bushes;
- minion waves on all three lanes.

The genre conventions are fine to use. The geometry, names and art are our own: no Mobile Legends coordinates, assets or names. The 3v3 map (Purrhaven Crossing) and its modes stay exactly as they are.

**Sources read for this plan:**
- `pawlegends/src/data/{map,towers,minions,camps,pudding,timeline,limits,fish,pings}.ts`
- `pawlegends/src/sim/{api,world,state,match,index}.ts`, `sim/map/{grid,brush,lanes}.ts`, `sim/bots/{index,orders}.ts`
- `pawlegends/src/render/coords.ts`, `pawlegends/tools/{vendor-sim,headless-match}.mjs`
- `backend/src/pawlegends/{mm,party}/`, `shared/caps.ts`
- `GDD.md` §3.1 to §3.3 (Grand Clash 5v5, Grizzlechop, the crow roost), `V17.md` §1 (the release rules)

**Units:** distances in mm, and 30 ticks = 1 s (`TICK_HZ = 30`). The network sends a turn every 2 ticks, so turns run at 15 Hz. "Team 0" is Purrhaven (cats by default) and "team 1" is Woof.

**Founder rules that apply here:**
- zero friction;
- MLBB-style feel;
- a fixed camera with a diagonal map view, with your own base bottom left;
- the largest play area possible on a phone;
- no feature flags: 5v5 is on by default once it is released;
- original content only.

## 0. Summary

| | 3v3 Quick (today, unchanged) | 5v5 Classic (new) |
|---|---|---|
| Map | Purrhaven Crossing, 100 × 60 m, mirrored left to right | **Hearthwood Divide**, 128 × 128 m, **180° point reflection**, bases in the bottom-left and top-right corners |
| Lanes | 2 (Sunny, Puddle) | 3: **Fenceline** (through the top-left corner), **Yarn Road** (mid, the diagonal), **Gutterway** (through the bottom-right corner) |
| Structures per team | 4 towers and a core | 9 lane towers (outer, inner, gate), 2 Hearth Guards and a core |
| Jungle | 1 rat camp per side | 4 quadrants, each with 1 buff camp and 2 small camps (16 monsters) |
| River objectives | Pudding (centre) | **Captain Grizzlechop** (early, south-east river pit: team Fish and a shield) and **Great Pudding** (late, north-west river pit: escorts a push) |
| Match length | p50 about 7 min, safety end 11:00 | target p50 12:00 to 14:30, safety end 16:00 |
| Entities | 63 (2 hit-mask words) | 150 (5 hit-mask words) |
| Sim | v18 | **v19**. v18 is frozen. On Crossing, v19 gives the same hash as v18 (gate G1) |

The work splits into a **SIM lane** (§3 to §7) and a **CLIENT+SERVER lane** (§8 and §9). The two lanes meet at the interface in §2. Once phase S2 publishes `mapInfo('hearthwood')`, the client lane can build everything against it, before 5v5 gameplay works.

## 1. Map spec: Hearthwood Divide

> **Sim v22:** the jungle, river pickups, walls and bushes of this section (§1.5, §1.6, §1.8) are superseded by
> `MAP-5V5-STANDARD.md` (the standard MOBA layout: a carved forest with four quadrants of clearings and corridors,
> the Beetle Log, brush at every river entrance and gank exit, lane-to-buff Boing Beds and Sugar Rush). The frame,
> lanes, towers, base, river band, both pits, the timeline and the interface below still hold.

### 1.1 Frame and symmetry

- `width = height = 128000` and `navCell = 1000`, so the nav grid is 128 × 128 = 16,384 cells (2.7× the 6,000 cells of Crossing).
- **Point reflection:** `reflect(x, y) = (128000 − x, 128000 − y)`. W is even and a whole number of cells, so cell `(i, j)` maps to `(127 − i, 127 − j)` exactly. No rounding.
- **Authoring rule (fairness):** the geometry is also symmetric under the main-diagonal swap `swap(x, y) = (y, x)`, so the whole map has D2 symmetry. Because of this:
  - team 0's two side lanes are copies of each other;
  - every point on the river axis `x + y = 128000` is the same distance from both fountains.

  So each river objective is equally far from both teams, and the Gutterway towers stand at the same distances from each team's base.
- **What is authored:** only team 0's **south eighth**, the region `y ≤ x` and `x + y ≤ 128000`. That covers half of Gutterway and team 0's south jungle (the "bottom jungle"), plus the mid lane and the base.
- **How the rest is derived:**
  - `swap` gives team 0's west eighth (Fenceline and the top jungle);
  - `reflect` gives team 1's two eighths;
  - the content may differ where the swap lands: the buff camp *type* in the west quadrant is Feather, not Prickle (§1.6);
  - the two objective pits straddle the river axis. Each is authored whole and must be self-symmetric under the river mirror `(x, y) → (128000 − y, 128000 − x)`. A unit test checks this.
- **View:** each team sees its own base bottom left. Team 1's camera is turned 180° (this already happens: `setViewTeam`). With point reflection, the turned view shows team 1 exactly the map team 0 sees, with the objectives swapped: team 1 sees Grizzlechop top left and Great Pudding bottom right. This is inherent to a rotated view and normal in the genre. Lanes are named by their physical place (§1.3), so both teams' players read the same names.

```
 y=128 ┌───────────────── Fenceline (top segment) ─────────────────┐ [team 1 base]
       │ Fenceline (left)       North jungle (t1 bottom)  ╲ Yarn Road │
       │  ╲  Great Pudding pit                          ╲      Gutterway│
       │      ~~~~ river (x+y = 128 m) ~~~~           ╲          (right)│
       │ West jungle (t0 top)      ╲ centre ╲     East jungle (t1 top)  │
       │                    Yarn Road ╲   ~~~~ river ~~~~               │
       │                         ╲     Grizzlechop pit                  │
       │ [team 0 base]  ╲       South jungle (t0 bottom)                │
 y=0   └──────────────── Gutterway (bottom segment) ────────────────────┘
      x=0                                                            x=128
```

### 1.2 Base (team 0; team 1 by `reflect`)

| Item | Value (mm) | Notes |
|---|---|---|
| Fountain | (6500, 6500), radius 5000 | Heal and fountain-shot rules as in 3v3 (`FOUNTAIN` row, per map) |
| Core | (16000, 16000), radius 2500 | `RADIUS.core` per map |
| Hearth Guards (2) | (21500, 12500) and (12500, 21500) | They flank the core, one the swap of the other |
| Hero spawns (5) | (4500, 9000), (9000, 4500), (6500, 6500), (3500, 5500), (5500, 3500) | Slot order 0 to 4 |
| Base plaza | the square [1000, 31000]² cut by `x + y ≤ 50000` | Walkable; holds the fountain, the core and three lane mouths |
| Gate barrier | the arc `x + y = 26000` until `barrierDrop` | Replaces the 3v3 `barrierX` line. It is a diagonal line test, still integer |

### 1.3 Lanes and minion paths

Lane width is 8000 and the walkable shoulder (`laneHalf`) is 5500, both as in 3v3. Each lane lists team 0's own points, from its core to the river point. The full path continues on the `reflect`ed points, in reverse, to the enemy core. Team 1's paths are the `reflect` of team 0's paths for the lane's swap partner.

| Lane id (index) | Display name | Team 0 waypoints, core → river point | Length core to core |
|---|---|---|---|
| `fence` (0) | Fenceline | (16000,16000) → (8000,26000) → (8000,104000) → (12000,116000) | about 207 m |
| `yarn` (1) | Yarn Road | (16000,16000) → (64000,64000) | about 136 m |
| `gutter` (2) | Gutterway | (16000,16000) → (26000,8000) → (104000,8000) → (116000,12000) | about 207 m |

- Gutterway's full path for team 0 is (16,16) → (26,8) → (104,8) → (116,12) → (120,24) → (120,102) → (112,112) in metres. The `reflect` of team 0's Fenceline path gives the same points. A unit test asserts this.
- Minions move at 3.6 m/s. Side-lane waves meet at the river point about 29 s after they spawn; mid waves about 19 s after. Mid arriving first is usual for the genre and is what makes the mid lane the fastest one to rotate from.
- **Lane roles are physical and the same for both teams:**
  - Gutterway is the **Fish lane** (carry, next to Grizzlechop);
  - Fenceline is the **Solo lane** (next to Great Pudding);
  - Yarn Road is **Mid**.

  So matching roles face each other, and each role has the same objective nearby. Team 1 sees its Fish lane at the top of its screen. This is a founder call (§11, D1; default: physical).

### 1.4 Towers and cores

Spots are for team 0. The other side lane is the `swap`, and team 1's spots are the `reflect`. Slot order within a team: Fenceline outer, inner, gate; Yarn Road outer, inner, gate; Gutterway outer, inner, gate; Hearth Guards (2). That is 11 per team and 22 in total.

| Tier (sub) | Gutterway spot | Yarn Road spot | HP | Armour | Range | Opens when |
|---|---|---|---|---|---|---|
| outer (0) | (80000, 8000) | (46000, 46000) | 2400 | 40 | 7000 | always |
| inner (1) | (54000, 8000) | (36000, 36000) | 2800 | 50 | 7000 | the same lane's outer has fallen |
| gate (2) | (30000, 8000) | (26500, 26500) | 3200 | 55 | 7500 | the same lane's inner has fallen |
| hearth (3) | see §1.2 | | 3000 | 55 | 7000 | any gate tower of that team has fallen |
| core | (16000, 16000) | | 4500 | 60 | 7500 | both Hearth Guards have fallen, and from `coreOpenAt` |

- A structure that is not open yet is invulnerable. It shows the existing invulnerable buff bit, and the client draws a lock (§8.4).
- The tower rules are the 3v3 ones: lock-on, damage ramp, backdoor protection, and the team XP for a fallen tower.
- Sunset's `closedCoreBp` applies "while all of the victim's **gate** towers stand" (3v3: inner towers).
- All numbers are first-pass tuning and live in the map's data row.

### 1.5 River

- The river is the band `|x + y − 128000| ≤ 7071`, about 10 m wide. It is walkable and only changes the look. There is no river slow in v19.
- The centre crossing (64000, 64000) sits on Yarn Road.
- **Grizzlechop pit:** centre (92000, 36000). **Great Pudding pit:** centre (36000, 92000). Both lie on the river axis.
- Each pit is a ring of rocks, radius 7 m, with three openings:
  - one toward each team's nearest jungle, symmetric under the river mirror;
  - one wider opening along the river, toward the map centre.
- The pit walls are authored once as axis-aligned rectangles around the Grizzlechop pit. The Great Pudding pit is their `reflect`.
- **Pickups:** two Fish Snack / Frenzy Catnip spots in the river at (80000, 48000) and its `reflect` (48000, 80000). They use the `data/pickups.ts` rules with per-map spots.

### 1.6 Jungle (4 quadrants)

The quadrants are cut by Yarn Road and the river:
- **South** (team 0's bottom), **West** (team 0's top), **North** (team 1's bottom, the `reflect` of South), **East** (team 1's top, the `reflect` of West).
- The jungle is walkable playfield, unlike the 3v3 forest. It is shaped by rock walls (§1.8).

| Camp (per quadrant) | South spot | Monsters | First spawn | Respawn | Reward |
|---|---|---|---|---|---|
| Buff camp: **Prickle Hollow** (South and North) | (52000, 26000) | 1 Hedgehog: 1800 HP, 40 armour, 60 dmg / 1.0 s, leash 9 m | 0:30 | 90 s | **Prickle Coat**, 75 s: basic attacks slow 20% for 1 s and add 3% of the target's max HP over 2 s. Plus 120 XP and 90 Fish |
| Buff camp: **Crow Roost** (West and East, at the `swap` spot (26000, 52000)) | – | 1 Old Crow: 1500 HP, 30 armour, ranged 4 m | 0:30 | 90 s | **Feather**, 75 s: abilities recover 20% faster (GDD §3.2), +5% move speed. Plus 120 XP and 90 Fish |
| Small camp: **Rat Nest** | (38000, 20000) | 2 rats (`RAT_CAMP_STATS`) | 0:30 | 60 s | 110 XP, 60 + 20 Fish (3v3 values) |
| Small camp: **Frog Pond** | (74000, 24000) | 1 Toad: 900 HP, 20 armour | 0:30 | 60 s | 80 XP, 70 Fish |

- That is 4 monsters per quadrant and 16 camp monsters in all.
- **Buff steal:** a hero who takes down a buff holder gets the buff's remaining time (genre convention).
- In 5v5 the 3v3 Pack buff (rat camp: team +15% damage) does not exist. The Rat Nest is a plain camp there. The 3v3 rat camp keeps it.

### 1.7 River objectives

**Captain Grizzlechop (early, south-east pit).** Our rat boss from GDD §3.2, now with a pit of his own.
- **Spawns:** at 2:00. He respawns 2:00 after he falls. No spawn after 8:30: from then on the pit stays empty, and the late game belongs to Great Pudding.
- **Stats:** 4000 HP, +6% per whole minute at spawn, 30 armour.
- **Attacks:**
  - Bite: 140 damage every 1.2 s on his aggro target (the last hero that hit him, as for camps);
  - Tail Sweep: 1.0 s ground telegraph, 4 m ring, 160 damage and a 0.5 s slow, every 6 s.
- **Leash:** he resets to full HP if no enemy is inside the pit ring plus 3 m for 4 s.
- **Reward (last hit, genre convention):**
  - every hero on the team gets +150 Fish (+30 per earlier Grizzlechop the team took) and +100 XP;
  - the last hitter gets +50 Fish on top;
  - each living hero of the team gets **Grizzlechop's Hoard**: a shield of 250 + 25 × level, for 45 s;
  - a team 2 or more towers behind gets +50% XP and Fish from him (GDD §3.3 rule).

**Great Pudding (late, north-west pit).** This is the 3v3 Pudding loop (`units/pudding.ts`) with 5v5 numbers:
- **Spawns:** first at 8:00, then 2:30 after the escort leaves.
- **Calm meter:** 7000, filled by damage. The scared hop stays: a 4 m ring every 4 s.
- **Reward:** the team that fills it gets Pudding's Courage. Great Pudding then walks with that team's next wave:
  - escort HP 6000, breath 260 damage every 2 s within 7 m;
  - allied minions within 10 m of him deal +30% damage to structures.
- **Lane choice** (deterministic, no input needed): the lane where the enemy has the fewest standing towers. Ties go to Yarn Road, then Fenceline. A team's `push` ping (§2.6) within 5 s of the calm overrides it. Zero friction: the default is always a sensible push.

### 1.8 Walls, playfield and bushes

- **Playfield:**
  - everything inside the rim (2000) is walkable, except rock walls and the two pit rings;
  - lanes and the river never cross a wall;
  - the 3v3 "forest outside the lane loop" rule becomes per map: on Hearthwood the area outside the side lanes is only the 2.5 m strip to the edge, and it is blocked as rim.
- **Rock walls, first pass, South eighth** (`[x0, y0, x1, y1]`). Each is `swap`ped and `reflect`ed into 4 copies:
  - `[44000, 14000, 50000, 18000]` behind the Gutterway inner tower;
  - `[58000, 30000, 62000, 40000]` between the buff and Yarn Road;
  - `[66000, 14000, 70000, 22000]` between the Frog Pond and the lane;
  - `[80000, 28000, 84000, 32000]`, the jungle side of the Grizzlechop pit entrance;
  - `[30000, 24000, 34000, 28000]` at the base jungle mouth.

  `tools/bake-map.mjs` checks that the lanes stay clear, that each camp can be reached, and that both teams' path lengths are equal (gate G4). The final walls come from that pass.
- **Bushes, South eighth.** Width × height in mm; each one becomes 4 copies, about 30 bushes in all:

  | Name | Centre | Size |
  |---|---|---|
  | Gutterway lane bush near the outer tower | (88000, 13000) | 3000 × 6000 |
  | Gutterway lane bush near the inner tower | (62000, 13000) | 3000 × 6000 |
  | river entrance bush | (98000, 26000) | 4000 × 4000 |
  | buff flank bush | (56000, 20000) | 3000 × 3000 |
  | Yarn Road side bush | (52000, 42000) | 3000 × 5000 |
  | Frog Pond back bush | (78000, 18000) | 3000 × 3000 |
  | base jungle mouth bush | (36000, 14000) | 3000 × 3000 |

  Plus 2 river bushes beside the centre crossing at (70000, 58000) and its `reflect`. These form one self-symmetric pair.

  All the brush rules carry over: `BRUSH_REVEAL_MM`, minion reveal at 3 m, the 1.5 s attack reveal.

### 1.9 Timeline (5v5 row)

| Beat | Time | Ticks |
|---|---|---|
| Barrier drops | 0:05 | 150 |
| First wave, then every 30 s | 0:20 | 600 (`waveEvery` 900) |
| Jungle camps up | 0:30 | 900 |
| Siege minions (every 3rd wave) | 3:00 | 5400 |
| Grizzlechop (last spawn by 8:30) | 2:00 | 3600 |
| Great Pudding | 8:00 | 14400 |
| Sunset | 10:00 (Normal and Hard; Easy 10:30; Rookie 9:00) | 18000 |
| Sudden Death | 13:00 (Easy 13:30; Rookie 12:00) | 23400 |
| Safety end | 16:00 | 28800 |

- **Wave:** 2 melee and 2 ranged per lane (3v3: 2 + 1). Minion HP grows 3% a minute, as in 3v3.
- **Respawn:** the 3v3 curve × 1.3, capped at 25 s (3v3: 15 s).
- **Level and Fish pace:**
  - XP needed × 1.35 and Fish income × 0.9 (per-map `xpBp` and `fishBp`);
  - so level 10 lands at about 10:00, and the 4th Toy tier at about 10:30 for the median hero;
  - level cap 10 as in 3v3, so no kit or talent changes are needed.

### 1.10 Entity caps (Hearthwood)

| Kind | Cap | Why |
|---|---|---|
| heroes | 10 | 5 + 5 |
| minions | 96 | 3 lanes × 2 teams × up to 3 live waves × 5 (2 + 2 + siege), plus one spare wave |
| towers | 22 | 11 a team |
| cores, fountains | 2, 2 | |
| campMonsters | 16 | §1.6 |
| boss | 1 | Grizzlechop (new `Kind.Boss = 8`) |
| pudding | 1 | Great Pudding |
| **entities** | **150** | Hit masks: 5 words (§3.3) |
| projectiles, zones, pickups | 96, 40, 4 | Twice the heroes means about twice the in-flight effects |

Ids stay below 255, so `NO_TARGET = 0xff` and the 1-byte target in commands still fit.

## 2. The interface (SIM ↔ CLIENT+SERVER)

Everything the client, the relay and the backend need comes through `src/sim/api.ts` and the vendored bundle. The SIM lane owns this section. A change to it after phase S2 needs a note in this file.

### 2.1 Match setup

```ts
// api.ts (sim v19)
export type MapId = 'crossing' | 'hearthwood';
export const MAP_IDS: readonly MapId[];               // ['crossing', 'hearthwood']; append only

export interface MatchConfig {
  // ... every v18 field, unchanged
  /** Sim v19. Omitted = 'crossing' (every v18 replay, byte-identical). */
  map?: MapId;
  /** Length 2 × teamSize(map): 6 on Crossing, 10 on Hearthwood. */
  picks: readonly HeroId[];
  tricks: readonly TrickId[];
  /** Party: human slots of team 0 (0..teamSize−1). PvP: both teams, leads 0 and teamSize. */
  humans?: readonly number[];
}

export const teamSizeOf = (map: MapId): 3 | 5;
export const slotCountOf = (map: MapId): 6 | 10;
export const teamOfSlot = (slot: number, map: MapId = 'crossing'): Team;   // slot < teamSize ? 0 : 1
export const leadOf = (team: Team, map: MapId = 'crossing'): number;       // 0 or teamSize (PVP_LEAD1 stays 3 for Crossing)
export function fillPicks(config, ...)                                     // fills 2 × teamSize, same species rule per team
```

`SLOTS_PER_TEAM`, `SLOT_COUNT` and `PVP_LEAD1` stay exported with their Crossing values for v18-era callers. Sim code must use the map-aware forms; `lint-sim` enforces it (§3.6).

### 2.2 Map data for the client (read-only)

```ts
export function mapInfo(id: MapId): MapInfo;   // frozen, built once per map at module load; no sim state

export interface MapInfo {
  id: MapId;
  name: string;                          // 'Purrhaven Crossing' | 'Hearthwood Divide'
  width: number; height: number;         // mm
  navCell: number;
  teamSize: 3 | 5;
  symmetry: 'mirrorX' | 'point';
  reflect(x: number, y: number, out: { x: number; y: number }): void;   // team 0 ↔ team 1
  lanes: readonly { id: LaneKey; name: string; role: LaneRole; path: readonly (readonly Int32Array[])[] }[]; // path[team] = [xs, ys] core→core
  towers: readonly { team: Team; slot: number; lane: LaneKey | null; tier: TowerTierName; x: number; y: number; hp: number }[];
  cores: readonly { team: Team; x: number; y: number }[];
  fountains: readonly { team: Team; x: number; y: number; radius: number }[];
  spawns: readonly { team: Team; slot: number; x: number; y: number }[];
  walls: readonly (readonly [number, number, number, number])[];       // expanded, all sides
  bushes: readonly { id: number; x: number; y: number; w: number; h: number }[]; // expanded; id = bushAt() result
  river: { kind: 'band-x' | 'band-diag'; a: number; b: number };      // Crossing: x 46..54 m; Hearthwood: |x+y−128 m| ≤ 7.071 m
  camps: readonly { id: number; kind: CampKind; quadrant: Quadrant | null; x: number; y: number }[];
  objectives: readonly { kind: 'pudding' | 'grizzlechop'; x: number; y: number; radius: number }[];
  pickups: readonly { x: number; y: number }[];
  playable: Uint8Array;                  // nav cells, 1 = walkable static ground (render: trees go where 0)
  timeline: MapTimeline;                 // per difficulty: firstWave, waveEvery, campsUp, grizzlechop, pudding, sunset, suddenDeath, safetyEnd
  limits: { maxTicks: number; maxInputBytes: number; maxInputChars: number };
  camera: { yawDeg: number };            // Crossing −38, Hearthwood 0 (§8.2)
}
export type LaneKey = 'sunny' | 'puddle' | 'fence' | 'yarn' | 'gutter';
export type LaneRole = 'solo' | 'mid' | 'fish' | 'sunny' | 'puddle';
export type TowerTierName = 'outer' | 'inner' | 'gate' | 'hearth';
export type CampKind = 'rat' | 'prickle' | 'crow' | 'toad';
export type Quadrant = 'south' | 'west' | 'north' | 'east';
```

The render reads `MapInfo` and never reads `data/map.ts` directly. Today 13 client files read `MAP`, and 9 read `mirrorX`; they move to `MapInfo` in C1.

### 2.3 Snapshot and events (append only)

- `EntitySnap.kind` gains `'boss'` (Grizzlechop).
- `EntitySnap.variant`:
  - towers: `'outer' | 'inner' | 'gate' | 'hearth'`;
  - camps: `CampKind`.
- `EntitySnap.lane` widens to `LaneKey`.
- `EntitySnap.slot` for heroes is 0..9.
- New fields:
  - `Snapshot.map: MapId`;
  - `Snapshot.objectives: { kind; state: 'away' | 'up' | 'escort'; nextIn: number; team?: Team }[]`, for the minimap timers and the HUD;
  - `Snapshot.camps: { id; up: boolean; nextIn: number }[]`, for the timers of camps the team has seen.
- `MatchScore` stays per team. `towers` counts all 11 on Hearthwood.
- New events:
  - `{ type: 'objective'; kind: 'grizzlechop' | 'pudding'; team; slot }` when one is taken;
  - `{ type: 'objectiveSpawn'; kind }`;
  - `{ type: 'buff'; kind: 'prickle' | 'feather' | 'hoard' | 'courage' }`. `BuffKind` is appended; `'pack'` stays.
  - `'buffSteal'`.
- `Buff` bits:
  - `Prickle: 1 << 20`;
  - `Feather: 1 << 21`;
  - `Hoard: 1 << 22`. This one is shown with the existing Shielded bit; it is a separate bit for the icon only.

### 2.4 Replays

- The v:1 solo record, `PartyReplayRecord` and `PvpReplayRecord` gain an optional `map: MapId`. Omitted means `'crossing'`.
- `humans` and the per-slot logs cover slots 0..9 on Hearthwood.
- `simVersion: 19`.
- A record with `map: 'hearthwood'` and `simVersion < 19` is refused (`PAWLEGENDS_SIM_VERSION`).

### 2.5 Limits (three copies, changed in one commit)

`data/limits.ts`, `shared/caps.ts` and `backend/src/shared-contracts/caps.ts` become per map:

| | Crossing (unchanged) | Hearthwood |
|---|---|---|
| `MAX_TICKS` | 19800 (11:00) | 28800 (16:00) |
| `MAX_INPUT_BYTES` | 30600 | 44700 (scaled by match length, then rounded to a multiple of 3) |
| `MAX_INPUT_CHARS` | 40800 | 59600 |
| `/live` body | 64 KB | 96 KB solo. A party or PvP record: `humans × MAX_INPUT_CHARS + 8 KB`, checked per record |

`FORFEIT_RESERVE_BYTES` and `MOVE_MIN_GAP` stay the same.

### 2.6 Commands and pings

- No new ops.
- New `PING_KINDS`, appended: `'pushFence' | 'pushYarn' | 'pushGutter' | 'grizzlechop'`. On Hearthwood these replace the Sunny and Puddle push pings in the wheel. The sim refuses a ping kind that does not belong to the match's map (gate refusal, not logged).
- Coordinates stay quantised to 250 mm as uint16, so 128 m is 512 quanta and the binary stream format does not change.
- `commands.ts` clamps to `MAX_QX` and `MAX_QY`, which come from the module-level `MAP` today. `quantize(cmd, map)` and the decoder take the match's map, so a Hearthwood move to y = 100 m is not clamped to 60 m. This is part of S1.

### 2.7 Wire (PROTO 4, owned by CLIENT+SERVER, needs nothing new from the sim)

- `TURN` slot mask goes from 6 bits to a u16; slots 0..9.
- `mm.join` takes `queue: 'classic'`.
- `party` and `match` frames carry `map` and `teamSize`.
- A PROTO 3 socket never sees a Hearthwood room. The relay sends `update_required` when it asks for `classic`.

## 3. SIM work: the map becomes per match

### 3.1 MapDef and the runtime

- **New files:**
  - `src/data/maps/crossing.ts`: today's `data/map.ts` values, moved verbatim. `data/map.ts` re-exports them for v18-era imports.
  - `src/data/maps/hearthwood.ts`: §1, authored eighth, plus objective, camp and timeline rows.
  - `src/data/maps/index.ts`: `MAPS: Record<MapId, MapDef>`.
- **`src/sim/map/runtime.ts`** builds a frozen `MapRuntime` per MapDef once, at module load:
  - expanded towers, bushes, walls and camps;
  - lane paths per team;
  - the nav walls and the per-team foe-fountain masks;
  - `range` (the entity id layout) and `entityCap`;
  - `maskWords`;
  - a per-cell bush index (`Int8Array`, so `bushAt` becomes one lookup instead of a scan over about 30 bushes);
  - `nx` and `ny`.
- **`World` gains `readonly map: MapRuntime`**, set by `createWorld(seed, mapId)`. It is not hashed itself; on Hearthwood, `mg[0]` (§3.4) holds the map id.
- **Every module-level constant that depends on the map becomes `w.map.*`:**
  - `RANGE.*` (about 400 uses), `ENTITY_CAP` (55), `CAPS.*`;
  - `NX`, `NY`, `LANE_PATHS`, `TOWER_SPOTS`, `RAT_CAMP`, `PUDDING_SPOT`, `BUSHES`, `WALLS`, `FOUNTAIN`, `CORE`, `HERO_SPAWNS`, `MAP.barrierX`.

  This is a mechanical codemod; a few helpers that have no `w` get it as a parameter. The A* buffers are sized for the larger map (16,384 cells).
- **`mirrorX(x)` → `w.map.reflectX(x, y)` / `reflectY(x, y)`** (12 sim files). Crossing's reflect leaves `y` alone, so its results are unchanged.
- **Timeline:** `TIMELINE.*` reads that change per map go through `w.map.timeline`. The per-difficulty Sunset and Sudden Death already sit in globals.

### 3.2 Point reflection in lanes, bots and nav

- `lanes.ts`: `build(lane, team)` reflects in 2-D. Team 1's path for lane `k` is the `reflect` of team 0's path for `swapLane(k)` (Hearthwood: fence ↔ gutter, yarn ↔ yarn; Crossing: identity).
- `grid.ts`:
  - `laneLine`, the base plaza test and the wall marking take the map;
  - the diagonal barrier is `x + y ≤ 26000` for team 0 (`dash.ts` clamps against the same test);
  - the river band is walkable;
  - the pit rings are walls.
- `bots/sense.ts`, `brain.ts`, `orders.ts`:
  - `fountainX(team)` becomes `fountainOf(team)`, returning x and y;
  - "my side of the river" becomes the sign of `x + y − W` on Hearthwood (Crossing: `x − W/2`);
  - every per-lane loop runs over `w.map.lanes.length`.
- `NAV.maxExpand` is per map: 3000 on Crossing, 8000 on Hearthwood. Bots plan long moves (base to the enemy jungle) through the lane graph: one A* per leg of at most 50 m, so a cross-map order never runs a single 30,000-node search. If the S6 bench still shows A* p99 above 0.4 ms, the fallback is a 4 m region graph (an HPA-lite step). It is not built unless the gate fails.

### 3.3 Team size 5 and the world layout

- **Slots:** `teamOfSlot(slot, map)` and `leadOf(team, map)` replace `slot < 3` and `PVP_LEAD1`. The touch points:
  - `sim/party.ts` and `party-inputs.ts` (gates and logs per slot: the `PartyState.gates` length is `slotCount`);
  - `humans.ts`, `match.ts` (`checkWin` reads each team's lead gate);
  - `bots/index.ts` (`createPlayerBotFor`'s slot bound);
  - `units/hero.ts` (spawns).
- **Hit masks:**
  - `pHitLo` / `pHitHi` and `fmHitLo` / `fmHitHi` become `pHit: Int32Array[maskWords]` and `fmHit: Int32Array[maskWords]`, each sized by its table;
  - `maskHas(w, arr, row, id)` and `maskAdd`.
  - For Crossing, `maskWords = 2`, hashed word 0 then word 1, the same order as `pHitLo` then `pHitHi`, so the Crossing hash does not move.
  - Six hero files and two effect files change (rocket, meatball, frankie, cacklejaw, howler; projectile.ts, dash.ts).
- **Kind ranges:** heroes, minions, towers, cores, fountains, camps, `boss` (new, cap 0 on Crossing), pudding. A cap of 0 adds no ids, so Crossing's ids stay where they are.

### 3.4 Hash rule (keeps Crossing identical)

- `hashWorld` hashes the arrays in the same order. Their lengths come from the map; on Crossing they are the v18 lengths.
- 5v5-only state lives in a new `w.mg: Int32Array` ("map globals"):
  - the Grizzlechop state, next spawn and take count;
  - the camp timers;
  - the buff holders and their ticks;
  - `mg[0] = map id`.
- `mg` is hashed after everything else, and only when its length is above 0. Crossing's `mg` is empty, so the `G.Count = 44` globals and the hash stay exactly as in v18.
- New per-entity arrays used only on Hearthwood (`buffT` for Prickle and Feather) are also kept in `mg` slices, not as new hashed arrays.
- **Gate G1:** 500 Crossing seeds give the same hash trail and final hash in v19 as in frozen v18. Every profile counts: co-op, party and PvP fixtures included.

### 3.5 5v5 units and objectives

- `units/minion.ts`:
  - per-lane waves loop over the map's lanes;
  - the wave row per map (2 + 2 + siege on Hearthwood);
  - the underdog waves (`COMEBACK`) count structures out of 11.
- `units/tower.ts`:
  - the tiers gate and hearth;
  - the "opens when" rule (§1.4), checked when targeting and taking damage, reusing the invulnerable path;
  - the Sunset closed-core rule reads the gate tier on Hearthwood.
- `units/camp.ts`:
  - a camp table per map, with the kinds rat, prickle, crow and toad (`CampKind`, `w.sub`);
  - the leash and reset rules shared with the rats;
  - the buff reward on the last hit;
  - the buff steal on a takedown (`progression` hook).
- `units/boss.ts` (new): Grizzlechop. It shares the camp aggro and leash code, and its Tail Sweep uses the existing zone telegraph.
- `units/pudding.ts`:
  - numbers per map;
  - the lane choice rule from §1.7;
  - the push-ping override from the team lead's `push*` ping (the bots' ping obedience already exists).
- `effects/bonus.ts`: the Prickle on-hit, the Feather cooldown rate (the same path as the cooldown-recovery talents) and the Hoard shield.
- `progression/fish.ts` and `xp.ts`: the per-map `fishBp` and `xpBp`, the Grizzlechop rewards, and the trailing-team bonus.

### 3.6 Lint and guard rails

`tools/lint-sim.mjs` gets new rules for `src/sim/**`:
- no `RANGE.`, `ENTITY_CAP`, `CAPS.`, `mirrorX(`, `SLOTS_PER_TEAM`, `PVP_LEAD1`;
- no direct `data/map` import outside `sim/map/runtime.ts`.

The existing rules stay: integers only, no `Math.random` or `Date`.

## 4. Bots: five roles

### 4.1 Role assignment (deterministic, zero input)

| Role | Lane / area | Preferred hero roles, in order |
|---|---|---|
| `fish` | Gutterway | marksman, mage, assassin |
| `solo` | Fenceline | fighter, tank, assassin |
| `mid` | Yarn Road | mage, marksman, assassin |
| `prowl` (jungle) | own two quadrants, then the objectives | assassin, fighter |
| `guard` (roam) | follows `fish` to 3:00, then mid and the objectives | support, tank |

- `assignRoles(picks, map)` runs at `createMatch`:
  - each team solves the 5 × 5 preference matrix by a fixed cost (rank in the table, then slot order to break ties);
  - the human slots get their hero's first choice first;
  - the result goes in `mg` (hashed).
- **Lane swap generalised:** the v10 `G.LaneSwap` 2-lane rule becomes "a human who stands in another role's lane for `LANE_SWAP.ticks` swaps roles with that bot". This is the same behaviour as today, over 5 roles.
- On Crossing, roles are slot % 3, as today. `laneRole` keeps its v18 result there.

### 4.2 Behaviour per role (brain.ts, by role)

- **Laners (`fish`, `solo`, `mid`):**
  - the existing lane brain (farm, trade, retreat, tower rules);
  - `mid` rotates to a side lane's fight when its own wave is pushed and an ally there is low;
  - `fish` joins Grizzlechop fights; `solo` joins Great Pudding fights.
- **`prowl`:**
  - a seeded clear route: buff, then small, then small, then the other buff, or the mirror of that;
  - a gank check every 6 s at a lane with an enemy below 60% HP and pushed past the river;
  - starts Grizzlechop at spawn when 2 or more allies are within 20 m and no enemy prowler was seen in the last 10 s;
  - picks up camps again on respawn.
- **`guard`:**
  - stays within 6 m of `fish` until 3:00, then shadows the ally with the most enemies near;
  - from 3:00, the first one to the river bushes before each objective spawns.
- **Objective calls (shared):**
  - the team groups (the existing `groupAt` machinery) 20 s before Grizzlechop or Great Pudding spawns, when it is not behind by 3 or more takedowns;
  - otherwise it gives the objective up and pushes the opposite lane (the genre trade).
- **Difficulty:** the existing `BotParams` rows apply unchanged. Hard bots react faster and group more; Rookie allies leave kills to the human.
- **Think stagger:** 10 bots at `botThinkEvery = 6`. Slots 0..9 are staggered by `(tick + slot) % 6`, so at most 2 bots think in the same tick.

## 5. Version plan (sim v19)

| Step | What | Commit |
|---|---|---|
| S0 | **Freeze v18** in `FROZEN` (`vendor-sim.mjs`), using its release commit and the bundle sha from `v18/pawlegends-sim.sha256.json`, the same steps as `V17.md` §1.1. If v18 is not released when S0 starts, this branch rebases on `main` after the v18 release and S0 waits. Frozen v10 to v18 must stay byte-identical (`vendor-sim:check`) | own commit |
| S0b | `SIM_VERSION = 19` | own commit |
| S1 | MapDef and MapRuntime, the `w.map` codemod, hit-mask words, `mg`; Crossing only. **Gate G1** (same hash as v18) | |
| S2 | Hearthwood data, point reflection, nav, brush index, lanes; `mapInfo()` published. **Gate G4** (symmetry and paths). The client lane can start against `mapInfo` | |
| S3 | Team size 5: slots, party and PvP gates, spawns, picks; a 5v5 match runs with bots off | |
| S4 | 5v5 units: waves, tower tiers, camps and buffs, Grizzlechop, Great Pudding | |
| S5 | Bots, five roles | |
| S6 | Tuning to the gates (§7); per-hero `pvp` rows on Hearthwood only, as a per-map `pvpBp` override, so the 3v3 rows do not move | |
| S7 | `npm run vendor-sim`: `v19/` with new fixtures `hearthwood-replay.fixture.json` (solo 5v5), `hearthwood-party.fixture.json` (5 humans vs bots) and `hearthwood-pvp.fixture.json` (PvP 5v5). The frozen v18 keeps its fixtures | |

- **Backend dual verifier:** `simFor(19)` verifies both maps. `simFor(10..18)` verify Crossing only, so a Hearthwood record with an older `simVersion` is refused.
- `check-remote` compares `simHash` as today. The client's `net/sim-stamp.json` gets the v19 hash.
- PvP keeps its rule that both sockets run the same `simHash`.

## 6. Performance budget

**Measured baseline (this machine, under load, 2026-11-09):** 3 headless Normal-vs-Normal Crossing matches with bots (about 39,000 ticks) took 2.4 s wall, including the esbuild bundle step. That is under about 0.05 ms per tick.

| Budget | Crossing (today) | Hearthwood target | Gate |
|---|---|---|---|
| Sim tick, Node, desktop, mean | ≈ 0.05 ms | ≤ 0.25 ms | G7 |
| Sim tick, Node, p99 (A* and bot think spikes) | n/a | ≤ 1.5 ms | G7 |
| Sim tick, reference mid-range Android (Chrome), mean / p99 | n/a | ≤ 1.5 ms / ≤ 6 ms (under 5% / 18% of a 33 ms tick) | G8 `perf.spec.ts` 5v5 scene |
| A* query p99 | n/a | ≤ 0.4 ms (16,384 cells, `maxExpand` 8000) | G7 |
| Referee (backend) | 1 room | 50 concurrent Hearthwood rooms per referee worker at ≤ 50% of one core | G9 |
| Turn at 15 Hz, 10 slots, worst case | ≤ 128 B | ≤ 220 B; ≤ 4 KB/s down per client | G9 |
| Render, phone p95 frame | existing | ≤ 20 ms; ≤ 180 draw calls; ≤ 300k triangles in view | G8 |

**Where the cost grows, and the fix built in from the start:**
- Units go up 2.4× (150 vs 63) and bots go up 1.67×.
- The bush test becomes a per-cell index (§3.1).
- Target scans over `ENTITY_CAP` keep the ascending-id order and skip dead slots early.
- Minion acquisition moves to a 8 m bucket grid, rebuilt each tick; it is integer and ascending, so it does not change order. This is S6 work, only if G7 fails.

## 7. Test gates (all must pass before release)

| Gate | What | Pass |
|---|---|---|
| G0 | `npx tsc --noEmit`, `npx vitest run`, `npm run lint:sim`, `vendor-sim:check` (frozen v10 to v18 byte-identical) | green |
| G1 | Crossing identity: 500 seeds × {co-op normal, PvP fixture, party fixture}, v19 vs frozen v18 | identical hash trails and final hashes |
| G2 | Determinism: `npm run determinism` on Hearthwood, 200 seeds played twice, and the three new fixtures re-verified by the backend vendored sim | identical |
| G3 | Unit tests: `reflect` maps every authored item onto its counterpart; Gutterway = `reflect`(Fenceline) of the other team; each pit is self-symmetric under the river mirror; the nav grid is point-symmetric cell by cell; the bush index agrees with the scan | pass |
| G4 | Fair paths: the A* length from each fountain to each camp, objective, tower and lane river point is equal for both teams (±1 cell); every camp can be reached; no wall crosses a lane | pass |
| G5 | Balance, Hearthwood, normal vs normal, 2,000 seeds: every hero 46% to 54%; side 47% to 53%; cats vs dogs 47% to 53%; match length p50 12:00 to 14:30, p95 ≤ 15:45, safety end ≤ 2%; Grizzlechop taken in ≥ 80% of matches by 4:00; Great Pudding taken in ≥ 60% of matches that reach 9:00 | pass |
| G6 | PvP symmetry, Hearthwood (`tools/pvp-symmetry.mjs --map hearthwood`): team 0 vs team 1 with equal bots, 47% to 53%. The existing fun, novice, idle and feeder gates also run on Hearthwood, with the same thresholds where they apply (§11, D4) | pass |
| G7 | Sim perf (§6), with `tools/measure.mjs --map hearthwood` | within budget |
| G8 | Phone perf: `perf.spec.ts` 5v5 scene, p95 frame and sim tick | within budget |
| G9 | Backend: `npm run lint`, `npm run build`, `npm test`; a 5v5 room soak (`tests/e2e/mp/soak.mjs --map hearthwood`, 50 rooms); the PROTO 3 compatibility spec (an old socket never gets a 5v5 room) | green |
| G10 | E2E: the mode picker leads to a 5v5 solo match, then the result screen; a 5v5 party of 2 humans plus bots; a 5v5 PvP with 2 humans per team over real sockets (relay helper) | pass |

The machine is loaded by parallel work, so the long suites (G1, G5, G6) run once, in the background, with a monitor. Timing tests may flake; re-run only the failing file.

## 8. CLIENT work

### 8.1 Lobby: mode picker

- On the PLAY screen, a segmented toggle sits above the Play button: **3v3 Quick | 5v5 Classic**.
  - No new screen and no extra tap: the toggle remembers the last choice (localStorage, per viewer, wrapped in try/catch).
  - The first session's onboarding match is always 3v3. After the first finished match the toggle shows, defaulting to the last choice.
  - It is on by default, with no flag.
- 5v5 Classic, solo, "vs bots" is the first thing it plays. It runs locally like 3v3 solo (`app/matchSession.ts` with `map: 'hearthwood'`), so it needs no server.
- With friends (a party room) and in the queue, it uses `classic` (§9).
- **Hero pick:** the 5-slot team strip (allies left, enemies right on landscape). The bots' picks fill as today (`fillPicks`). Each portrait shows a role icon from `assignRoles` (the sim exports `rolesOf(config)`, which is pure).

### 8.2 Camera and coordinates

- `CAMERA_YAW` comes from `mapInfo(map).camera.yawDeg`: −38° on Crossing, **0°** on Hearthwood.
- Hearthwood's base-to-base line is the map diagonal. At yaw 0 and the 52° pitch it reads about 38° above the horizontal on screen, with your own base bottom left. Team 1 gets yaw + 180° as today (`setViewTeam`).
- Camera height and framing stay as today: hero-centred, fixed, the largest play area on a phone.
- The camera clamp uses the map's bounds.
- `screenToSim` and the aims need no change. They already read `cameraYaw()`.

### 8.3 Map render

- `render/views/mapView.ts` builds from `MapInfo` instead of `data/map.ts`:
  - ground, river band (`river.kind`), lanes from `lanes[].path`, walls as rocks;
  - trees where `playable` is 0;
  - bushes, camps and pits.
- **Hearthwood biome (original art):** an autumn wood at dusk.
  - copper and amber leaves;
  - a milky-blue river with lily pads;
  - lantern posts along Yarn Road;
  - the Grizzlechop pit is a sunken rat-pirate wreck; the Great Pudding pit is a mossy jelly-mould hollow.

  Trees and rocks are instanced. The ground is one merged mesh with baked lane decals.
- `towerView.ts`: gate and hearth tower models (variants of the existing cat and dog tower kits); the lock shown on a tower that is not open yet.
- New views:
  - Grizzlechop: the rig from `lift-ppk` if the PPK rat boss art exists, otherwise a new model;
  - Hedgehog, Old Crow, Toad: small rigs, one material each;
  - the Prickle and Feather buff auras on heroes;
  - the Hoard shield (the existing shield shader, tinted).

### 8.4 HUD and minimap

- **Minimap** (`ui/minimap.ts`):
  - a square, not turned (yaw 0), drawn from `MapInfo`, with 3 lanes, the river, camps and 2 pits;
  - objective timers on the pit icons (`Snapshot.objectives`);
  - camp timers for camps the team has seen (`Snapshot.camps`);
  - the same size slot as today; on phones the square fits the existing corner box. Tap to ping is unchanged.
  - Team 1's minimap is turned 180°, as today.
- **Top bar:** 5 + 5 portraits with level and respawn timers; the kill score; structures counted out of 11.
- **Scoreboard:** 10 rows, with a role icon.
- **Ping wheel:** on Hearthwood, Push Fenceline / Yarn Road / Gutterway plus "Grizzlechop". Sunny and Puddle are hidden there.
- **Announcer lines:** Grizzlechop up / taken, Great Pudding up / calmed, buff stolen. They go through the existing announcer queue, and the copy is original.
- **Buff icons** for Prickle, Feather and Hoard in the status row.

### 8.5 Net client

- `net/proto.ts`: PROTO 4. `TURN` gets a u16 slot mask, and the frames carry `map` and `teamSize`.
- `predict.ts` and `lockstep.ts` need no change beyond the slot count.
- `party/partyClient.ts`:
  - 5 seats per team in a Hearthwood room;
  - the mode toggle in the party card; the party lead chooses, and the others see it.

## 9. SERVER work (backend and relay)

### 9.1 Vendoring and verification

- `npm run vendor-sim`: v19 live, v10 to v18 frozen.
- `pawlegends-live.ts`:
  - `map` is validated against `MAP_IDS` of that sim;
  - picks and tricks length = `slotCountOf(map)`;
  - `MAX_TICKS` and the input caps per map (§2.5);
  - the body limit per record.
- `pawlegends.schema.ts`: the match row stores `map` (default `'crossing'`, indexed for stats).
- Rewards and progression from a 5v5 win use the existing reward table. The founder sets 5v5 multipliers, if any (D3).

### 9.2 Rooms and relay

- `party/room.ts` and `room-store.ts`:
  - `teamSize` per room;
  - seats 0..9;
  - the per-slot input queues;
  - the leaver backfill; the bot takeover is unchanged per seat.
- `party/party-relay.ts`:
  - PROTO 4 frames;
  - a 10-bit `TURN` mask;
  - `classic` refused to PROTO 3 sockets with `update_required`.
- **Referee pool:** a Hearthwood room counts as 3 units of capacity, a 3v3 room as 1, until G9 measures the real ratio.

### 9.3 Matchmaking (`mm/`)

- **Queue `classic`:** `casual.ts` generalised to `teamSize`.
  - Two teams of up to 5 humans.
  - One species per team, so a team draws 5 different heroes from its species' 10.
  - The `apartOk` and dodge rules are as in casual.
- **Bot fill:** empty seats fill with bots once the oldest entry has waited `fillMsClassic = 45 s` (casual: 30 s).
  - Fill difficulty comes from `matchFillDifficulty` as today.
  - With 1 human, a "Classic vs bots" match can be played locally instead. The queue offers it after 45 s (one tap: "Play with bots now").
- **Rating:** a separate Glicko-2 bucket `classic` (`rating.schema.ts` key by queue), so 3v3 casual ratings stay clean.
- **Limits:** `mm-limits.ts` gets `MM_CLASSIC`: room cap, queue-join rate, and the same address and network rules.

## 10. Work split and order

| Phase | SIM lane | CLIENT+SERVER lane |
|---|---|---|
| 1 | S0 freeze v18, S0b, S1 (MapDef, G1) | C0: read this plan; stub `mapInfo('hearthwood')` from §1 numbers to start the render |
| 2 | S2 (Hearthwood data, `mapInfo`, G3, G4): **interface handoff** | C1: `mapView` and minimap from `MapInfo` (Crossing first, no visual change), then the Hearthwood biome; camera per map |
| 3 | S3 (team size 5) | C2: mode picker, 5-slot pick, local 5v5 solo against `map: 'hearthwood'` with bots off, then on |
| 4 | S4 (units and objectives) | C3: HUD (top bar, scoreboard, timers, buffs, pings); PROTO 4 client |
| 5 | S5 (bots) | C4: backend per-map caps (three copies, one commit with S-lane `limits.ts`), `/live` map validation, rooms and relay at 10 seats |
| 6 | S6 tuning (G5 to G7) | C5: `classic` queue, bot fill, rating bucket, referee capacity (G9) |
| 7 | S7 vendor v19 and fixtures | C6: E2E (G10), phone perf (G8) |

**Handoff rules:**
- The SIM lane commits `mapInfo` and the §2 types at the end of S2. After that, a change to §2 is a note in this file plus a message to the client lane.
- The caps change (§2.5) is the one commit both lanes touch: `pawlegends/src/data/limits.ts`, `shared/caps.ts` and `backend/src/shared-contracts/caps.ts`.

## 11. Open decisions (each has a default; work goes on with it)

| # | Question | Default |
|---|---|---|
| D1 | Lane roles: physical (the Fish lane is Gutterway for both teams, so team 1's carry plays at the top of its screen) or by view (each team's bottom lane is its Fish lane, so roles do not face each other) | **Physical**: matching roles face each other and each role has the same objective nearby |
| D2 | Hearth Guards (2 core towers per team) or none (MLBB-like, faster ends) | **Keep them**; drop them in S6 if match length p50 is over 14:30 |
| D3 | Rewards for a 5v5 match (it is about 2× as long) | Same reward table × 1.5 per match |
| D4 | First-timer gates (fun1, fun2, feeder) on 5v5, or 3v3 only | **3v3 only**: onboarding stays 3v3, and 5v5 runs the novice gate at Easy (≥ 70% win) |
| D5 | The mode name: "5v5 Classic" (founder) or "Grand Clash" (GDD §3.1) | **5v5 Classic** in the UI; GDD updated to match |

## 12. SIM lane: what is built (sim v19)

Everything in this section is on `feat/pawlegends-5v5`. Numbers marked *(gate)* come from the runs listed in §12.6.

### 12.1 The interface the client and server use (§2, as built)

```ts
// src/sim/api.ts (and re-exported by src/sim/index.ts and src/sim/server.ts)
type MapId = 'crossing' | 'hearthwood';
MAP_IDS                                   // ['crossing', 'hearthwood']
teamSizeOf(map) → 3 | 5;  slotCountOf(map) → 6 | 10
teamOfSlot(slot, map?)                    // without `map`: the map the sim has bound now (see 12.2)
leadSlotOf(team, map)                     // 0, or teamSize (team 1's PvP lead: 3 on Crossing, 5 on Hearthwood)
MatchConfig.map?: MapId                   // omitted = 'crossing'; picks and tricks: 2 × teamSize
fillPicks(seed, hero, trick, map?)        // 10 slots on Hearthwood
fillPicksParty(seed, seats, map?)         // party.ts
mapInfo(map) → MapInfo                    // src/sim/map/info.ts; fields as §2.2, plus nx, ny
rolesOf({ picks, map }) → ('solo'|'mid'|'fish'|'prowl'|'guard')[]   // [] on Crossing
ReplayRecord / PartyReplayRecord / PvpReplayRecord: + map?: MapId   // only a Hearthwood record carries it
Snapshot: + map?, objectives?: ObjectiveSnap[], camps?: CampSnap[]  // Hearthwood only
EntitySnap: kind 'boss' (Grizzlechop); tower variant 'gate' | 'hearth' (a Hearth Guard has no `lane`);
            camp variant 'rat' | 'prickle' | 'crow' | 'toad'; lane + 'fence' | 'yarn' | 'gutter'; hero slots 0..9
SimEvent: + 'objectiveSpawn' {kind}, 'objective' {kind, team, slot}, 'buffSteal' {id, from, kind}
BuffKind: + 'prickle' | 'feather' | 'hoard';  Buff bits Prickle 1<<20, Feather 1<<21, Hoard 1<<22
PING_KINDS: + 'pushFence' | 'pushYarn' | 'pushGutter' | 'grizzlechop' (indices 8..11); Crossing refuses them
            (decode error, quantize clamps to 7), so v18 streams are unchanged
limits: data/limits.ts LIMITS_BY_MAP (Crossing 19800 / 30600 / 40800; Hearthwood 28800 / 44700 / 59600)
```

`SLOTS_PER_TEAM`, `SLOT_COUNT`, `PVP_LEAD1`, `PICKUP_ID_BASE`, `MAX_TICKS`, `MAX_INPUT_BYTES` and `MAX_INPUT_CHARS`
are still exported and hold Crossing's values until a Hearthwood match is created or stepped (12.2). Client code should
pass the map (`teamOfSlot(slot, map)`, `slotCountOf(map)`, `mapInfo(map).limits`) instead of reading them.

The backend facade (`tools/vendor-sim.mjs`) gains `PawlegendsMapId`, `map?` on all three records and on
`createMatch`, `fillPicksParty(seed, seats, map?)`, and `party.MAP_IDS`, `party.teamSizeOf`, `party.slotCountOf`.
`checkReplayShape`, `checkPartyShape` and `checkPvpShape` validate `map` and apply that map's limits and seat counts.

### 12.2 How the sim became per map (deviation from §3.1)

§3.1 planned a codemod of every map constant to `w.map.*`. Built instead: the map-dependent tables stay module
exports but became **live bindings** (`export let`) that `bindMap(index)` (`src/sim/map/runtime.ts`) points at one map:
`data/map.ts` (MAP, CAPS, FOUNTAIN, CORE, HERO_SPAWNS, LANES, LANE_WAYPOINTS, TOWER_SPOTS, CAMPS, BUSHES, WALLS, …),
`data/timeline.ts` (TIMELINE, TIMELINE_BY), `data/limits.ts`, `data/pudding.ts`, `data/pickups.ts` (FRENZY_SPOTS),
`world.ts` (RANGE, ENTITY_CAP), `api.ts` (slot counts), `map/grid.ts` (NX, NY, lane lines), `map/lanes.ts`
(LANE_PATHS) and `units/camp.ts` (camp tables). Every entry point that takes a match binds its map first
(`createMatch`, `step`, `snapshot`, `hash`, the replay runners and shape checks, `createPlayerBotFor`,
`playerBotCommands`). The sim is single-threaded, so two rooms on different maps in one process are safe; a unit test
steps a Crossing match tick by tick beside a Hearthwood match and checks the Crossing hashes against a run alone.

Why: the codemod touched about 470 uses in 60 files and risked the Crossing hash; the bindings change 20 files and
keep Crossing's tables identical objects. The cost is that a caller outside the sim reading those exports sees the last
bound map, which is why §12.1 gives map-aware forms.

Module scratch buffers are sized for the largest map (`MAX_ENTITIES` 150, `MAX_HEROES` 10, `MAX_CELLS` 16384).

### 12.3 Crossing is unchanged (gate G1)

- 5v5-only state lives in `w.mg` (MG layout in `world.ts`), plus `w.pHitX` / `w.fmHitX` (the hit-mask words for ids
  64..159). All three are empty on Crossing and hashed after `globals`, so an empty array adds no bytes.
- `tools/map-identity.mjs --write` (run on the released v18, origin/main 93cfcc28) and `--check` (run on v19): **500
  seeds × {co-op fuzz, party fuzz, PvP fuzz}: 1500/1500 identical final hashes, folded hash trails and lengths**.

### 12.4 Hearthwood as built (differences from §1)

- **Symmetry.** The geometry is the point reflection of team 0's half, and that half is symmetric across its main
  diagonal, so the whole map is also symmetric across the river (x, y) → (W − y, W − x). Lanes are physical (D1), so
  the river mirror is the symmetry the match plays under: team 1's tower k, camp k and spawn k are the river mirror of
  team 0's (same lane, tier, camp kind). Consequence: team 1's North quadrant holds a Crow Roost and its East a
  Prickle Hollow, each across the river from team 0's camp of the same kind (§1.6 had them by reflection; with
  physical roles that put team 0's carry next to a Prickle and team 1's next to a Crow). G3 and G4 tests check both
  symmetries.
- **Pit walls** are five rock blocks around Grizzlechop (91–100 m, 28–44 m), self-symmetric across the river, three
  mouths; the Great Pudding pit is their reflection. The base-mouth rock moved to [30, 18, 33, 21] m (the §1.8 spot
  sat on Yarn Road); the Grizzlechop-side rock to [78, 26, 82, 30] m; the Rat Nest to (38, 21) m; the river-entrance
  bush to (102, 22) m.
- **Grizzlechop** is camp monster kind 4 (the last camp id; the snapshot shows `kind: 'boss'`), not a new `Kind`. He
  holds his pit (never chases out), bites the last hero that hit him in reach, Tail Sweeps every 6 s (1 s telegraph,
  `windup` event slot 1), heals to full after 4 s with no hero within 10 m. 3400 HP (+6% a minute at spawn), first at
  2:00, 2:00 after he falls, none after 8:30. Reward as §1.7 (Fish to the takers' event reason `'pudding'`).
- **Great Pudding**: the 3v3 loop with 7000 calm, 6000 escort HP, 260 breath, 2:30 respawn; lane = fewest enemy
  towers, ties Yarn Road then Fenceline. Not built: the +30% structure damage aura for minions near him, and the
  push-ping override.
- **Buffs**: Prickle Coat (on basic attacks +3% of the target's max HP, at most 90, and a 20% 1 s slow) and Feather
  (+20% cooldown rate through the existing cooldown path, +5% move speed), 75 s, to the buff camp's last hitter;
  stolen by the killer on a takedown. Hoard: Grizzlechop's shield, expires with `shieldT`.
- **Rules per map**: waves 2 melee + 2 ranged (+ siege), respawn × 1.3 capped at 25 s, XP × 0.8 (`HEARTHWOOD_RULES`);
  Fish unchanged; towers per spot (2400 / 2800 / 3200 / 3000 HP), core 4500 / 60.
- **Structures**: outer → inner → gate per lane; a Hearth Guard opens when any gate tower of its team fell; the core
  when both Hearth Guards fell (and from `coreOpenAt`). Sunset's closed-core rule reads the same test.
- **Hero tuning on Hearthwood only** (`HEARTHWOOD_PVP`): per species and per hero, on top of each hero's `pvp` row.
  Today: cats × 1.012 dealt, × 0.988 taken; no per-hero rows.
- **Fairness between the sides (5v5 only; Crossing keeps v18's order).** The point map exposed every place where
  "lower id first" or "lowest cell index first" quietly favours one team, because a tie toward the bottom-left helps
  the team walking up and hurts the team walking down:
  - A*: team 1's search is the river mirror of team 0's (mirrored tie-break index, mirrored neighbour order, mirrored
    snap); 99% of random queries now return exact mirror-image paths (the rest differ by one cell of string pulling).
  - Bot thinks: team 1's slot k thinks half a period after team 0's slot k (slot + 5 made it think one tick earlier).
  - Swings, casts and kit steps: the teams take turns resolving first (`heroAt`, by tick parity).
  - A same-tick finish on a neutral objective goes to team 0 on even ticks, team 1 on odd ones (no longer to whoever
    resolves last).
  - Minion retarget staggers by lane and place in the wave instead of by id.

### 12.5 Bots (§4, as built)

- `bots/roles.ts`: `assignRoles` solves each team's 5 × 5 preference matrix (120 permutations, lowest cost, first in
  lexicographic order) at `createMatch`; roles live in `mg` (hashed).
- Laners play their lane (`laneGoalPoint`: every hold and back-off measured along the lane path); Guard plays
  Gutterway with Fish; Prowl clears its own six camps, then helps the lane with the fewest own towers.
- Grizzlechop: Prowl, Guard and Fish (and any bot within 12 m) go for him once per spawn (`contestPuddingBp`), with
  two healthy allies; the decision is in the bot's memory (`mem.boss`, a view on `mg` for in-sim bots; an outside
  pilot keeps its own, so a pilot never writes world state).
- Lane swap generalised: the human standing 5 s in another role's lane takes that role from its bot.
- Ping orders for the new kinds (push a lane, take Grizzlechop). Not built: the 20 s pre-objective grouping call and
  the Prowl gank timer (§4.2); bots group by the existing `groupAt` / `pushLane` (three lanes).
- `naive` and `novice` pilots (onboarding profiles) only got the map-aware fountain and progress; D4 keeps them 3v3.
- Think stagger: at most two bots think in one tick (team 1's slot k half a period after team 0's).

### 12.6 Gates (runs on 2026-11-09, machine under load)

All on this machine under heavy parallel load (load average 30 to 90). Hearthwood runs: `node tools/hearth-gates.mjs
--seeds 300 --det 20` (each seed plays the mirrored pair, so 600 matches; ten `normal` pilots in PvP).

| Gate | Result |
|---|---|
| G0 | `tsc` clean, `lint:sim` ok (150 files), `vitest`: 2522 passed, 2 failed (`tools/trailer` copy gate: `typescript` missing for `tools/copy-lint`, fails on `main` too). Backend `pawlegends-live.spec.ts` v18 / v19 cases pass (`-t "sim v19\|sim v18: a v18"`); the full spec's worker re-sims hit their 10 s timeout for every version under this load |
| G1 | **pass**: 500 seeds × {co-op, party, PvP fuzz} on v19 vs the released v18 (origin/main 93cfcc28): 1500/1500 identical final hashes, folded trails and lengths. All six Crossing fixtures re-recorded by v19 equal v18's |
| G2 | **pass**: 60/60 (20 seeds × solo, party, PvP 5v5 records re-simmed from the record); `tests/unit/hearthwood.test.ts` verifies a solo record on the server entry; the backend verifies the three vendored Hearthwood fixtures on v19 and refuses them as v18 |
| G3, G4 | **pass** (`tests/unit/hearthwood.test.ts`): point, diagonal and river symmetry cell by cell; towers, camps, spawns, lanes; exact grid distances equal for both teams from their fountains on every cell; A* paths within 3 m |
| G5 | Cats vs dogs **49.8%**; p50 13:06, p95 13:13, safety end 0%; Grizzlechop taken by 4:00 in 79.7% (target 80%); Great Pudding calmed in 100% of matches past 9:00. Per hero: 16 of 20 inside 46–54% (bravo 45.0, stilts 45.5, nugget 54.7, rocket 57.2); at 300 matches a hero the noise is ±2.9 points, so this needs the 2000-seed run before any per-hero row |
| G6 | **FAIL**: team 0 wins **42.5%** (600 matches; 43.8% and 41.3% in the two runs before on the same base). See 12.7 |
| G7 | Mean 0.143 ms a tick, p99 0.81 ms, p99.9 7.1 ms (2 Normal matches with bots, 47,312 ticks, under load); Crossing 0.036 ms. Within §6's 0.25 / 1.5 ms |
| G8–G10 | Client and server lane |

Every match so far ends in Sudden Death (13:00 to 13:15): about 4.5 of 11 towers a team fall, and the core decay
with the takedown gap decides. That passes G5's length band, but structures rarely end a match; D2 (Hearth Guards)
and the tower HP rows are the levers.

### 12.7 Open: the side bias (G6)

Team 1 wins about 57% of mirrored 5v5 matches. Measured and fixed so far (each in this commit): A* and snap
tie-breaks mirrored for team 1 (43% → about 46% on the v17 base), the bot think phase, swing / cast / kit order
alternating by tick, neutral same-tick finishes split by tick parity, minion retarget staggered by wave place. None of
the order changes moved it (forcing team 0 to resolve first every tick also gave 43.7%), so it is not resolution order.
On the v18 base (chase fix and rebalance) it is about 42.5%. A breakdown of 240 matches: team 1 takes more kills (24.2
vs 22.6), towers (4.6 vs 4.0), Grizzlechop (1.41 vs 1.15) and Great Pudding (0.79 vs 0.61); team 0 loses more of its
Fenceline towers (1.63 vs 1.20 a match) and dies more in every role, while first blood is even. A mirrored self-play
probe (a throwaway script: the same five heroes on both sides, mirrored pilot RNG) stays a perfect river mirror until the first
minion contact (sequential minion updates), so the next step is a probe that compares hero-only skirmishes on mirrored
positions to find the first systematic difference. No side handicap was added: it would hide the cause from players.

### 12.8 Side bias: the nav quantization fix (verify pass, 2026-11-09)

Root cause found for most of G6: `cellOf` floors, so a point on a cell border (every whole metre: the pit, the camps,
the towers, and a quarter of all quantized move targets per axis) went to the corner's north-east cell for both
teams, which is team 1's side. Team 0's A* goals, snaps and line tests were up to a cell off the mirror of team 1's:
on 4,000 sampled paths team 0 walked further to every corner-aligned goal (tower goals 1.5 m on average). Fix:
`grid.ts cellOfMirrored` / `cellOfTeam`; team 1's `findPath` (start, goal, line tests, foe layer), dash, blink,
tether and the fear slide (which also tries y before x for team 1) quantize river-mirrored. Mirrored path probe
after the fix: 0 of 4,000 differ. Grizzlechop's nearest-hero tie now follows `heroAt` order. Crossing unchanged
(map-identity 1500/1500).

Side rate (team 0, 600 matches each): 42.5% before; 46.2% and 46.8% on two seed blocks after; 44.7% on the gate run
(seeds 1–300, same seeds as the 46.2% block, after the boss-tie change, which is within noise). Ablation: with
Grizzlechop never spawning, team 0 wins 50.3% (49.3% before the fix), so what remains is tied to him. Same-tick
thinking (42.8%) and swapped think phases (43.7%) do not fix it, so it is not the think schedule. G6 still FAILS.

### 12.9 Side bias: the root cause (takedown credit tables, 2026-11-09)

**Root cause.** `progression/xp.ts` kept two module scratch tables, `helpedBy` and `share`, sized
`new Uint8Array(RANGE.minions)` at module load. `RANGE` is the live binding to the active map's caps, and at module
load it is Crossing's: 6 heroes. On Hearthwood the hero ids run 0 to 9, so `helpedBy[6..9]` fell outside the table:
writes were dropped and reads gave `undefined`. In `heroKilled`, the loop that skips heroes with `helpedBy[h] === 0`
never skipped team 1's slots 6 to 9. On **every** hero death, including their own team's, those four heroes got the
takedown heal (`TAKEDOWN_HEAL`), a kill streak (and its bounty), a reset death streak and their kit's `onTakedown`.
Team 0 never got any of this. Proof (seed 1, mirrored match): Woof's mid laner (7) dies to Purrhaven's (2) at 0:54,
and the takedown heal goes to 2, 6, 8 and 9. The fix sizes both tables `MAX_HEROES` (10). On Crossing only ids 0 to 5
are ever touched, so the 3v3 map is unchanged (map-identity 1500/1500 against v18).

**Why it looked like Grizzlechop.** The free heals let Woof's laners win the first skirmishes, from about 0:50.
Lane fronts at 1:20 were 7 to 32 m in Woof's favour on all three lanes, and the Prowl and the Fish laner arrived at the
pit healthier. So Woof took the first Grizzlechop in 57.8% of matches (1.46 takes a match against 1.09), and his
reward turned the early edge into wins. With him removed, nothing converted the edge, which is why the earlier
ablation showed 50.3%. In mirrored pit duels (both teams' heroes placed on river-mirrored spots, no waves), the boss
went to team 0 in 48.5% of takes (n ≈ 340, within noise): his AI, leash, tie rules, reward and timers were not biased.

**How it was found: `tools/hearth-mirror.mjs`** (bundles `tools/lib/mirror-entry.ts`; `--same-phase`,
`--fixed-order`, `--rev-order`, `--no-waves`, `--boss-nearest`, `--idle` are experiment-only source patches):

- `probe`: a mirror match (the same five heroes in the same slots on both teams, each pilot pair sharing one RNG
  stream). It reports the first tick and field where a hero, structure or unit pair stops being the river mirror,
  `(x, y) → (W − y, W − x)`. That is the team symmetry, because the lanes are physical (D1). The first divergence is at
  0:37: the mid waves meet, and minions update in id order. That order effect flips with the seed (the wave's `first`
  team), and it averages to exactly 0 with idle heroes.
- `mirror`: whole mirror matches, with lane fronts at fixed times. Before the fix, team 0 won 41.5% (200 matches) with
  identical line-ups. After the fix: 46.5%. The fronts no longer drift.
- `bias`: per-tick means over seeds of team 0 − team 1 (minion HP per lane, hero HP, XP, Fish, deaths, HP per role).
  Order effects cancel across seeds. The first significant drift was the Prowl's HP at 0:51.
- `splits`: per role, the first tick a pair's HP stops mirroring, the events of that tick, and which side was worse
  3 s later. Before the fix, the Prowl was split by "b: takedown" 90 times and by "a: takedown" never; team 0 was
  worse 119 times against 12.
- `duel`: the mirrored pit duel above. `grizz`: per-side Grizzlechop stats on the symmetry pairs (who takes him first,
  takes per match, his damage to each team, bites by tick parity). `trace`: tick-by-tick events of one match.

**Questions from the brief, answered.**
- The pit is exactly equidistant by path: the river mirror fixes it, and the nav grid, camps, towers, lanes and spawns
  are river-mirror symmetric (unit tests, plus the probe staying exact up to the first order effect).
- The boss ties follow `heroAt` (alternating). Same-tick credit alternates by tick parity.
- His bites by parity are balanced: team 0 13,018 even / 12,985 odd; team 1 17,408 / 17,304 (team 1 was bitten more
  only because it fought him more).
- Hero resolution order does not matter here: team 0 always first and team 1 always first give the same early-lane
  bias.
- The think phase (team 1 3 ticks after team 0) is symmetric. Same-phase thinking kept the bias, so it was not the
  cause.

**Numbers after the fix** (`hearth-gates --seeds 2000`, 4,000 matches): **G6 side 48.4% (PASS**; 44.7% to 46.8%
before), cats 47.4% (PASS), p50 13:05, safety end 0%. Heroes still outside 46% to 54%: chili 54.6, clem 42.4, lambo
44.5, marshmallow 54.1, nugget 56.7, rocket 55.2. That is tuning, not side: every hero plays both sides equally in
the symmetry pairs.

### 12.10 Per-hero and species balance: Hearthwood's own hero rows (2026-11-09)

Every 5v5 balance lever is **map-scoped**: `HEARTHWOOD_PVP.hero` in `src/data/maps/hearthwood.ts`, applied in
`combat/damage.ts` only when the match runs on Hearthwood (`w.mg.length > 0`), on hero-vs-hero damage, after the
species row and each hero's own 3v3 `pvp` row (which do not move). Each hero row moves dealt and taken by the same
amount in opposite directions (`dmgBp = 10000 + d`, `takenBp = 10000 − d`). Crossing never reads it: map-identity
against the released v18 is still **1500/1500**, so the 3v3 balance gate's numbers are unchanged by construction.

| Hero | d (bp) | Hero | d (bp) |
|---|---|---|---|
| clem | +1660 | brutus | +1460 |
| sage | −260 | cacklejaw | +200 |
| gabe | −1270 | nugget | −790 |
| meatball | −780 | marshmallow | −340 |
| duchess | −620 | bravo | +1180 |
| aviete | +30 | chili | −730 |
| bengas | −400 | howler | +710 |
| lambo | +1170 | rocket | −490 |
| pixel | −240 | frankie | −270 |
| stilts | +360 | domino | −590 |

The cats species row stays × 1.012 dealt / × 0.988 taken.

**How it was fitted.** `hearth-gates --tune <file.json>` (experiment only) replaces the species and hero rows in the
bundle without touching the source. A logistic model, logit P(team 0 wins) = side + Σ team 0 (aₕ + b·dₕ) − Σ team 1
(…), fitted on every symmetry pair of each run (b ≈ 0.22 to 0.30 logit per 1,000 bp per hero), solved for the dₕ that
put every hero's predicted win rate over the observed line-ups at 50%; from the third round on, each hero's residual
(observed − predicted) was fed back at 0.7, because the linear model under-reads the species effect (it predicted
cats 50% and they came in at 53% to 54%). Four rounds, eight 2,000-seed windows (32,000 matches):

| Round | Window | Side (team 0) | Cats | Heroes outside 46–54% |
|---|---|---|---|---|
| base (cats row only) | 1–2000 | 48.4% | 47.4% | chili 54.6, clem 42.4, lambo 44.5, marshmallow 54.1, nugget 56.7, rocket 55.2 |
| hand guess, 6 heroes | 1–2000 | 49.8% | 56.8% | 19 of 20 (overshoot: one hero's row moves every teammate) |
| model fit | 1–2000 / 2001–4000 | 49.6 / 49.9% | 53.3 / 54.4% | 4 / 12 |
| refit, all data | 1–2000 / 2001–4000 | 49.1 / 50.1% | 51.8 / 53.1% | 0 / 3 |
| **refit + residual (shipped)** | **1–2000 / 2001–4000** | **49.4 / 50.7%** | **48.4 / 48.7%** | **0 / 0** |

**Gate table (shipped rows, `hearth-gates --seeds 2000`, each window by itself):**

| Gate | Seeds 1–2000 (4,000 matches) | Seeds 2001–4000 (4,000 matches) |
|---|---|---|
| G6 side (team 0) 47–53% | **49.4% PASS** | **50.7% PASS** |
| G5 cats vs dogs 47–53% | **48.4% PASS** | **48.7% PASS** |
| G5 every hero 46–54% | **PASS**: 47.1 (duchess) to 53.3 (marshmallow) | **PASS**: 47.2 (stilts) to 53.0 (marshmallow) |
| G5 match length p50 12:00–14:30 | **13:06 PASS** | **13:06 PASS** |
| G5 safety end ≤ 2% | **0.0% PASS** | **0.0% PASS** |
| G2 determinism (40 seeds × solo, party, PvP) | **120/120 PASS** | |
| G1 Crossing = v18 (map-identity, 500 seeds × 3 profiles) | **1500/1500 PASS** | |

Per hero (window 1 / window 2): aviete 48.7 / 50.0, bengas 47.2 / 48.7, clem 49.9 / 49.1, duchess 47.1 / 48.2,
gabe 48.7 / 49.6, lambo 48.7 / 47.5, meatball 48.0 / 48.0, pixel 48.8 / 49.2, sage 48.3 / 49.2, stilts 49.0 / 47.2;
bravo 50.6 / 51.1, brutus 51.9 / 50.7, cacklejaw 52.0 / 51.2, chili 51.2 / 51.0, domino 51.2 / 50.9, frankie 51.1 /
50.9, howler 50.5 / 50.8, marshmallow 53.3 / 53.0, nugget 51.6 / 51.0, rocket 52.4 / 52.6. The source table, run
without `--tune`, reproduces the tuned bundle's rows exactly (60 of 60 seeds compared).

**Caveats.** The rows are a bot-vs-bot fit (ten `normal` pilots): they correct how the 3v3 kits scale to five-a-side
fights, not human skill. The largest rows (clem +16.6%, brutus +14.6%, gabe −12.7%) say those kits fit 5v5 worst and
are the first to revisit with real 5v5 match data. Marshmallow (53%) and rocket (52.5%) sit closest to an edge. The
cats sit at 48.5%, 1.5 points inside the band.

### 12.11 Release check after merging origin/main (2026-11-09)

origin/main (perf iteration 2, c7d0f6f7) merged in; it touched no sim file, and the vendored v10 to v18 are
byte-identical to main. Conflicts were render and UI only: the minimap keeps main's cached structures layer and sprites
and draws Hearthwood's bush list and Grizzlechop (as a cached sprite) through them; StructureView's pooled footprints
keep the boss scale. Every gate was rerun on the merged tree:

| Gate | Result |
|---|---|
| 5v5 `hearth-gates --seeds 2000`, seeds 1–2000 | side 49.4%, cats 48.4%, heroes 47.1–53.3%, p50 13:06, safety 0%: **PASS** |
| 5v5 `hearth-gates --seeds 2000`, seeds 2001–4000 | side 50.7%, cats 48.7%, heroes 47.2–53.0%, p50 13:06, safety 0%: **PASS** |
| 5v5 determinism (40 seeds × solo, party, PvP) | 120/120 **PASS** |
| 3v3 = v18 (`map-identity`, baseline rewritten on origin/main) | 1500/1500 **PASS** |
| 3v3 balance gate (`--gate balance`, 2,000 seeds) | 35/35 checks **PASS** (side 49.1%, cats 50.6%) |
| 3v3 PvP symmetry (2,000 seeds) | side 48.4%, cats 50.5%: **PASS** |
| tsc, lint:sim, vendor-sim:check, budget (375.8 KB gzip first load) | **PASS** |
| Headless browser, 844×390 touch, one full bot match each | 5v5: loads, HUD and minimap inside the viewport, Grizzlechop and Pudding timers, results at 13:04; 3v3: same, results screen. No console errors |

Still open (design, not a gate): about 89% of 5v5 bot matches end in Sudden Death (13:00 to 13:15); see 12.6.

## 13. SERVER lane: what is built (PROTO 4, 2026-11-09)

Sim v19 was already vendored by the SIM lane (v10 to v18 frozen, §12); this lane added the wire, the rooms, the queue
and the soak. Nothing here touches `src/sim`, `src/ui` or `src/render`.

### 13.1 Wire (PROTO 4, `pawlegends/src/net/proto.ts`, vendored to `backend/src/vendor/pawlegends-net`)

- `PROTO = 4`, `PROTO_CLASSIC = 4`; `MM_QUEUES` gains `'classic'`; `MAX_HUMANS = 10`.
- TURN: the mode and ack masks are varints, and an entry's slot has a fourth bit at `0x20`. A mask below `0x80` is the
  one byte PROTO 3 wrote, so every 3v3 TURN keeps its bytes (the PROTO 2 and 3 goldens in `net-proto.test.ts` are
  unchanged); `MAX_FRAME[TURN]` 256 → 512.
- `teamOfSlot(slot, teamSize = 3)`, `leadSlotOf(team, teamSize = 3)`, `teamSizeOfMap(map)`, `MAP_TEAM_SIZE`;
  `clampSocialPoint(x, y, map?)` with Hearthwood's 128 m square.
- `MatchConfigView.map`; `map` and `teamSize` on the `party.mm`, `match` and `mm.found` frames.
- Client net code: `net-core.ts` passes `config.map` to `createMatch` and keeps ten slots; `net-host.ts` takes team 1's
  lead ping from slot 5 on Hearthwood and clamps social points to the map.

### 13.2 Backend

- **Queue `classic`** (`mm/casual.ts`, `mm/matchmaker.ts`, `MM_CLASSIC` in `mm/mm-limits.ts`): `bestCasual` takes the
  queue's rules (team size 5, up to five entries a team, 9 candidates per anchor). Bots fill at 45 s, a search never
  moves to co-op, the pool is its own (`region|classic|sim`). `shapeRankN` is `shapeRank` exactly for team size 3.
  A match carries `map: 'hearthwood'`; slots 0..4 and 5..9.
- **Join** (`mm/mm-bridge.ts`): `classic` needs PROTO 4 and a sim whose `MAP_IDS` has `hearthwood`; anything older gets
  `update_required` (a PROTO 3 code). The casual newbie lock, dodges and Accept card apply as in casual.
- **Rating:** its own `classic` Glicko row (`rating.schema.ts`), seeded by the casual row, then co-op. The
  `casualRatingStep` rates against the five foes of the other team; `/live` picks the row from `config.map`.
- **Rooms** (`party/room.ts`): `RoomInit.teamSize` (3 or 5); a Hearthwood room has 10 slots, team 1 lead slot 5 (pings
  and Forfeit), and a surrender needs a majority of a full team (2 of 3, 3 of 5; all when fewer are connected).
- **Relay** (`party/party-relay.ts`): the room config carries `map`; picks come from `fillPicksParty(seed, seats, map)`;
  ten names and skins; social targets and team scoping per team size; restored rooms keep their team size.
- **Map binding (desync guard).** `decodeCommand` reads the bound map's bounds and ping kinds (a module-level binding in
  the sim). The relay main thread binds the room's map before each command decode (`bindMapOf`), and the referee binds
  its room's map before each turn's decode (an idle pilot's `playerBotCommands`). Without it a Hearthwood move to
  y = 100 m decodes as out of map while a Crossing room was bound last (spec `classic-room.spec.ts` fails without it).
- **Capacity:** `roomUnits(config)`: Hearthwood 3, Crossing 1. The relay's `maxLiveRooms` gate counts units, and the
  referee pool puts a 3-unit room on its least-loaded worker.
- **Caps (§2.5):** `PAWLEGENDS_LIMITS_BY_MAP`, `PAWLEGENDS_MAX_TICKS_ANY_MAP`, `PAWLEGENDS_MAX_INPUT_CHARS_ANY_MAP` in
  `shared/caps.ts` (synced to the four copies); the replay DTO takes the longest map's bounds (the vendored sim checks
  the record's own map); a party result slot goes to 9; the fastest-win merge accepts up to 16:00.
- **Store:** `StoredRoom.config.map`, `MmRoomRecord.map` and queue `classic`.

### 13.3 Soak (G9): 5v5 PvP, ten headless clients a room, local relay

`CLASSIC_SHARE=1 MATCHES=4 CONCURRENCY=2 SEED=5105 node tests/e2e/mp/soak.mjs` (the production relay and worker
referee pool in `backend/test/pawlegends-soak.harness.ts`, memory stores). Every client runs the game's own net code.

| | Result |
|---|---|
| Rooms | 4 of 4 ok, 40 clients, 2 at a time |
| Desyncs | **0**: 2,290 common 30-tick marks, 0 differ; 0 resyncs; relay `desyncs` 0, `divergences` 0 |
| Verdicts | 4 of 4 verified (raw log re-sim, record, `verifyPvpReplay`); local replays re-sim to the same hash |
| `/live` | 40 of 40 seats saved; the duplicate post refused (409) |
| Drops | 5 planned (2 network drops, 2 reloads, 1 long absence a bot covered): every seat came back (rejoin p50 2.6 s, p95 3.5 s) |
| Matches | 7:53 to 12:06 (scripted players push hard; every room ended by a core) |
| Relay CPU | 831 ms per room-minute (1.4 % of one core per live 5v5 room, worker referee included) |
| Relay memory | RSS +141 MB over 4 rooms (ts-node compiler in the heap; heap −160 MB at the end) |
| Relay loop | loop delay p99 7.8 ms, turn overrun p99 7.3 ms, referee lag 0 turns, 0 refused |
| Per room (clients) | 50 s CPU and 302 MB RSS for ten clients in one process; TURN gap p95 71 ms; log 95 KB |

### 13.4 3v3 baseline and the capacity units

The same harness right after, `PVP_SHARE=1 MATCHES=2 CONCURRENCY=2 SEED=5105` (casual 3v3, six clients a room): 2 of 2
ok, 815 marks, 0 differ, 0 desyncs; relay 576 ms CPU per room-minute, RSS +84 MB, loop p99 2.8 ms; clients 18 s CPU and
195 MB a room. A 5v5 room cost the relay **1.44×** a 3v3 room (831 / 576 ms per room-minute) and its ten clients
2.8× the CPU of six. `roomUnits` stays at 3 (conservative: the samples are 4 and 2 rooms on a loaded machine); lower it
to 2 after a longer run at production concurrency (`CLASSIC_SHARE=0.5 MATCHES=40 CONCURRENCY=8`).

### 13.5 Open (server)

- **Lone classic search.** A classic search with no second human never forms a match (both teams need a human, as in
  casual); the client offers "Play with bots now" (local 5v5) after 45 s (§9.3). The relay sends nothing new for it.
- **Subset search cost.** An anchor with nine solo candidates looks at up to ~100k team pairs; a duo + trio + five
  solos spec takes about 0.35 s for the whole wait on this machine. Fine at today's queue sizes; cap `candidates` lower
  if `mm.tick` shows in the relay loop delay.
- **Backfill offers** to a classic seat carry no `map` field (the client shows the clock only).

