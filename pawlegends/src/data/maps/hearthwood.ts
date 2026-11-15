/**
 * Hearthwood Divide (sim v19, docs/plans/moba/MAP-5V5.md §1): the 5v5 Classic map. 128 × 128 m, integer mm, origin
 * bottom-left. Team 0's base is in the bottom-left corner, team 1's in the top-right: team 1's half is the 180° point
 * reflection of team 0's, (x, y) → (W − x, H − y). Team 0's half is itself symmetric under the main-diagonal swap
 * (x, y) → (y, x), so only its south eighth (y ≤ x, x + y ≤ W) is authored; `swap` gives its west eighth.
 *
 * Lanes (named by where they run, the same for both teams): Fenceline through the top-left corner, Yarn Road down the
 * diagonal, Gutterway through the bottom-right corner. The river is the band |x + y − W| ≤ 7.07 m; Captain
 * Grizzlechop's pit sits on it in the south-east, the Great Pudding pit (its reflection) in the north-west.
 * Original geometry and names (no other game's map).
 */
import type { CampSpot, MapDef, TowerSpot } from '../map';
import { CROSSING } from '../map';
import { CAMP_KIND } from '../camps';

const W = 128000;

type Rect = readonly [number, number, number, number];
type Bush = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** The main-diagonal swap of a rectangle and of a bush. */
const swapRect = (r: Rect): Rect => Object.freeze([r[1], r[0], r[3], r[2]] as const);
const swapBush = (b: Bush): Bush => Object.freeze({ x: b.y, y: b.x, w: b.h, h: b.w });

/**
 * Sim v22 (docs/plans/moba/MAP-5V5-STANDARD.md §5): the jungle is a forest with carved clearings and corridors (no
 * loose rocks: the v19 to v21 rock list is gone). Everything below is authored for team 0's south eighth only; the grid
 * (`sim/map/grid.ts`) applies it to every copy under the map's D2 symmetry (the swap and the reflection).
 */
const SOUTH_WALLS: readonly Rect[] = [];

/** South quadrant clearings [x, y, r]: the Rat Nest, Prickle Hollow (buff), the Frog Pond and the Beetle Log. */
export const HEARTHWOOD_CLEARINGS = Object.freeze([
  Object.freeze([42000, 22000, 4500] as const),
  Object.freeze([58000, 30000, 6000] as const),
  Object.freeze([80000, 24000, 5000] as const),
  Object.freeze([64000, 42000, 4500] as const),
]) as readonly (readonly [number, number, number])[];

/**
 * South quadrant corridors [ax, ay, bx, by, half width] (MAP-5V5-STANDARD.md §5.2, ids P1 to P10): the base mouth,
 * the trunk (Rat Nest, buff, Frog Pond), the Beetle Log spur, and the exits: two into the side lane (P8 risky past the
 * outer tower, P9 safe between the gate and inner towers), two into mid (P5 risky by the river, P10 safe by the inner
 * tower) and two into the river (P6 upper, P7 to Grizzlechop's team mouth).
 */
export const HEARTHWOOD_CORRIDORS = Object.freeze([
  Object.freeze([30000, 18000, 42000, 22000, 2500] as const),
  Object.freeze([42000, 22000, 58000, 30000, 3000] as const),
  Object.freeze([58000, 30000, 80000, 24000, 3000] as const),
  Object.freeze([58000, 30000, 64000, 42000, 2500] as const),
  Object.freeze([64000, 42000, 57000, 51000, 2500] as const),
  Object.freeze([64000, 42000, 76000, 48000, 2500] as const),
  Object.freeze([80000, 24000, 87000, 30000, 2500] as const),
  Object.freeze([80000, 24000, 88000, 13000, 2500] as const),
  Object.freeze([50000, 26000, 48000, 13000, 2500] as const),
  Object.freeze([42000, 22000, 35000, 30000, 2500] as const),
]) as readonly (readonly [number, number, number, number, number])[];

/**
 * Captain Grizzlechop's pit, centre (92, 36) m on the river axis: a ring of rocks with a mouth toward each team's jungle
 * (south-west for team 0, north-east for team 1) and a wider one up the river toward the centre (north-west). The set
 * is its own mirror across the river, (x, y) → (W − y, W − x). The Great Pudding pit is its reflection. Sim v22: a
 * walkable disc of PIT_DISC round each pit, so the river flows round the ring instead of through it.
 */
const PIT = { x: 92000, y: 36000 };
const PIT_DISC = 12000;
const PIT_WALLS: readonly Rect[] = [
  // The closed back toward the south-east corner.
  [PIT.x + 3000, PIT.y - 8000, PIT.x + 8000, PIT.y - 3000],
  // South and east sides (one the other's river mirror).
  [PIT.x - 2000, PIT.y - 8000, PIT.x + 2000, PIT.y - 6000],
  [PIT.x + 6000, PIT.y - 2000, PIT.x + 8000, PIT.y + 2000],
  // West and north sides (the north-west mouth between them is the wide one).
  [PIT.x - 8000, PIT.y - 3000, PIT.x - 6000, PIT.y],
  [PIT.x, PIT.y + 6000, PIT.x + 3000, PIT.y + 8000],
];

/**
 * South eighth bushes (centre, size; MAP-5V5-STANDARD.md §4.3); each also stands swapped, then both are reflected: brush
 * at every river entrance and gank exit.
 */
const SOUTH_BUSHES: readonly Bush[] = [
  // Gutterway lane brush: at the P8 exit beyond the outer tower, and between the inner and outer towers.
  { x: 88000, y: 13000, w: 3000, h: 6000 },
  { x: 62000, y: 13000, w: 3000, h: 6000 },
  // The upper river entrance (P6's river mouth).
  { x: 74000, y: 46000, w: 4000, h: 3000 },
  // The pit approach on P7, before Grizzlechop's team mouth.
  { x: 86000, y: 27000, w: 3000, h: 3000 },
  // The mid gank brush at the mid end of P5.
  { x: 61000, y: 48000, w: 3000, h: 3000 },
  // Prickle Hollow's flank on P3 (an ambush or a buff steal).
  { x: 67000, y: 28000, w: 3000, h: 3000 },
  // The inner lane exit (P9's lane end).
  { x: 48000, y: 16000, w: 3000, h: 3000 },
];
/** River bushes; each one's reflection is the other of its pair: beside the centre crossing, and the pit's wide mouth. */
const RIVER_BUSHES: readonly Bush[] = [
  { x: 70000, y: 58000, w: 3000, h: 3000 },
  { x: 84000, y: 44000, w: 3000, h: 3000 },
];

/**
 * Team 0's camps in the South quadrant: Prickle Hollow, the Rat Nest, the Frog Pond, the Beetle Log (sim v22) at the
 * clearing centres (West: swapped, with Crow Roost for the buff).
 */
const SOUTH_CAMPS = [
  { kind: CAMP_KIND.prickle, x: 58000, y: 30000 },
  { kind: CAMP_KIND.rat, x: 42000, y: 22000 },
  { kind: CAMP_KIND.toad, x: 80000, y: 24000 },
  { kind: CAMP_KIND.beetle, x: 64000, y: 42000 },
];

/** Gutterway towers (outer, inner, gate), team 0; Fenceline is their swap, Yarn Road on the diagonal. */
// Sim v21 (V21-FUN.md §3.1, stronger towers): 2,400 / 2,800 / 3,200 / 3,000 before. Sim v27 (V27.md §1.E): outer
// 3,000 → 2,300, so a 5v5 Normal or PvP first tower falls by 7:00 once chips no longer carry it (V26-TOWERS.md T1).
const TOWER_STATS = Object.freeze({
  outer: Object.freeze({ hp: 2300, armour: 40 }),
  inner: Object.freeze({ hp: 3500, armour: 50 }),
  gate: Object.freeze({ hp: 3800, armour: 55 }),
  hearth: Object.freeze({ hp: 3500, armour: 55 }),
});

const tower = (lane: TowerSpot['lane'], tier: TowerSpot['tier'], x: number, y: number): TowerSpot =>
  Object.freeze({ lane, tier, x, y, hp: TOWER_STATS[tier].hp, armour: TOWER_STATS[tier].armour });

const MAP_H = Object.freeze({
  width: W,
  height: W,
  /** Unused on a point map (the river is the band |x + y − W| ≤ riverHalf); kept for the shape. */
  riverX: Object.freeze([0, 0]) as readonly [number, number],
  barrierX: 0,
  navCell: 1000,
  laneWidth: 8000,
  point: 1 as 0 | 1,
  /** Gate barrier: team 0's heroes stay at x + y ≤ 26 m until TIMELINE.barrierDrop. */
  barrierSum: 26000,
});

/** Half-width of the river band across the diagonal, along x + y (|x + y − W| ≤ this; 10 m wide). */
export const HEARTHWOOD_RIVER_SUM = 7071;

export const HEARTHWOOD: MapDef = Object.freeze({
  id: 'hearthwood',
  name: 'Hearthwood Divide',
  MAP: MAP_H,
  CAPS: Object.freeze({
    heroes: 10,
    minions: 96,
    towers: 22,
    cores: 2,
    fountains: 2,
    // Sim v22: 20 jungle monsters (five a quadrant with the Beetle Log), then Grizzlechop.
    campMonsters: 21,
    pudding: 1,
    projectiles: 96,
    zones: 40,
    pickups: 4,
    heroesPerTeam: 5,
  }),
  FOUNTAIN: Object.freeze({ ...CROSSING.FOUNTAIN, x: 6500, y: 6500, radius: 5000 }),
  CORE: Object.freeze({ x: 16000, y: 16000 }),
  HERO_SPAWNS: Object.freeze([
    Object.freeze({ x: 4500, y: 9000 }),
    Object.freeze({ x: 9000, y: 4500 }),
    Object.freeze({ x: 7500, y: 7500 }),
    Object.freeze({ x: 3500, y: 6000 }),
    Object.freeze({ x: 6000, y: 3500 }),
  ]),
  LANES: Object.freeze(['fence', 'yarn', 'gutter'] as const),
  LANE_WAYPOINTS: Object.freeze({
    fence: Object.freeze([
      [16000, 16000],
      [8000, 26000],
      [8000, 104000],
      [12000, 116000],
    ] as const),
    yarn: Object.freeze([
      [16000, 16000],
      [64000, 64000],
    ] as const),
    gutter: Object.freeze([
      [16000, 16000],
      [26000, 8000],
      [104000, 8000],
      [116000, 12000],
    ] as const),
  }) as unknown as MapDef['LANE_WAYPOINTS'],
  // Past the river, team 0's Fenceline runs on (reflected) Gutterway points and the other way round.
  LANE_PARTNER: Object.freeze([2, 1, 0]),
  TOWER_SPOTS: Object.freeze([
    tower('fence', 'outer', 8000, 80000),
    tower('fence', 'inner', 8000, 54000),
    tower('fence', 'gate', 8000, 30000),
    tower('yarn', 'outer', 46000, 46000),
    tower('yarn', 'inner', 36000, 36000),
    tower('yarn', 'gate', 26500, 26500),
    tower('gutter', 'outer', 80000, 8000),
    tower('gutter', 'inner', 54000, 8000),
    tower('gutter', 'gate', 30000, 8000),
    tower(null, 'hearth', 21500, 12500),
    tower(null, 'hearth', 12500, 21500),
  ]),
  // Fenceline ↔ Gutterway, Yarn Road itself, the two Hearth Guards swapped.
  TOWER_PARTNER: Object.freeze([6, 7, 8, 3, 4, 5, 0, 1, 2, 10, 9]),
  RAT_CAMP: Object.freeze({ x: SOUTH_CAMPS[1].x, y: SOUTH_CAMPS[1].y }),
  CAMPS: Object.freeze(
    (() => {
      const own: CampSpot[] = [];
      for (const c of SOUTH_CAMPS) own.push(Object.freeze({ kind: c.kind, x: c.x, y: c.y, side: 0 }));
      // West quadrant: the swap; its buff camp is Crow Roost.
      for (const c of SOUTH_CAMPS) own.push(Object.freeze({ kind: c.kind === CAMP_KIND.prickle ? CAMP_KIND.crow : c.kind, x: c.y, y: c.x, side: 0 }));
      const all = own.slice();
      // Team 1's camps mirror team 0's across the river, (x, y) → (W − y, W − x): the same places as the reflection,
      // with each buff camp facing its counterpart (Prickle Hollow across from Prickle Hollow), as the physical lanes do.
      for (const c of own) all.push(Object.freeze({ kind: c.kind, x: W - c.y, y: W - c.x, side: 1 }));
      all.push(Object.freeze({ kind: CAMP_KIND.boss, x: PIT.x, y: PIT.y, side: 2 }));
      return all;
    })(),
  ),
  BUSHES: Object.freeze([...SOUTH_BUSHES.map((b) => Object.freeze(b)), ...SOUTH_BUSHES.map(swapBush), ...RIVER_BUSHES.map((b) => Object.freeze(b))]),
  PUDDING_SPOT: Object.freeze({ x: W - PIT.x, y: W - PIT.y }),
  WALLS: Object.freeze([...SOUTH_WALLS.map((r) => Object.freeze(r)), ...SOUTH_WALLS.map(swapRect), ...PIT_WALLS.map((r) => Object.freeze(r))]),
  PLAYFIELD: Object.freeze({
    ...CROSSING.PLAYFIELD,
    // The side lanes run 8 m from the edges: their outer shoulder ends at 2.5 m, where the rim starts.
    rim: 2500,
    base: Object.freeze([0, 0, 0, 0]) as readonly [number, number, number, number],
    // Sim v22: carved (MAP-5V5-STANDARD.md §5.1); the base plaza is x + y ≤ 48 m in each corner.
    open: 2 as 0 | 1 | 2,
    baseSum: 48000,
    riverSum: HEARTHWOOD_RIVER_SUM,
    clearings: HEARTHWOOD_CLEARINGS,
    corridors: HEARTHWOOD_CORRIDORS,
    pits: Object.freeze([Object.freeze([PIT.x, PIT.y, PIT_DISC] as const)]) as readonly (readonly [number, number, number])[],
  }),
  // Sim v22: the whole grid (the carved forest makes long walks wind; 8000 left 0.6% of random searches short).
  NAV: Object.freeze({ ...CROSSING.NAV, maxExpand: 16384 }),
  coreHp: 4500,
  coreArmour: 60,
});

/** Grizzlechop's pit centre (the boss camp), for the bots and the tests. */
export const GRIZZLECHOP_PIT = Object.freeze({ x: PIT.x, y: PIT.y });

/** Sim v19: Hearthwood's own rules (MAP-5V5.md §1.9): respawn × 1.3 capped at 25 s; XP needed and Fish income scale. */
export const HEARTHWOOD_RULES = Object.freeze({
  respawnBp: 13000,
  respawnCap: 750,
  /** Ranged minions per lane and wave (Crossing: WAVE.ranged, 1). */
  waveRanged: 2,
  /** XP from every source × this (bp): level 10 lands later in the longer match. */
  xpBp: 8000,
  /**
   * Sim v22 (MAP-5V5-STANDARD.md §5.4, gate G9): the jungle camps' XP and Fish × this (bp; Grizzlechop has his own
   * reward), so a Prowl who full-clears keeps up with the average laner at 5:00.
   */
  jungleXpBp: 7500,
  jungleFishBp: 6200,
  /**
   * Sim v22: jungle monsters (not Grizzlechop) spawn with this share of their HP and hit heroes for this share (bp):
   * a level 1 Prowl clears its quadrant alone at the pace of §9.2 (Crow Roost in about 15 s).
   */
  campHpBp: 6000,
  campDmgBp: 6000,
  /**
   * Sim v27 (V27.md §1.B): on Hearthwood a takedown chip never takes a tower below this share of its max HP (Crossing:
   * TOWERS.chipFloorBp, 15%). Five heroes a side score about 5/3 the takedowns of the 3v3 match the chip was tuned for,
   * so 32% to 38% of 5v5 first towers fell mostly to chips (V26-TOWERS.md T7, gate ≤ 20%); now chips soften a tower
   * and heroes and minions take it.
   */
  chipFloorBp: 5500,
});

/** The fixed camera's yaw per map (degrees; render only): Crossing's −38°, Hearthwood's 0° (its diagonal climbs). */
export const CROSSING_CAMERA_YAW = -38;
export const HEARTHWOOD_CAMERA_YAW = 0;

/**
 * Sim v19 (MAP-5V5.md §5 S6): Hearthwood's hero-vs-hero tuning on top of each hero's `pvp` row (the 3v3 rows do not
 * move): per species, then per hero (missing = 10000). On the sim v17 base the dogs won five-a-side fights (cats 41% of
 * 300 mirrored PvP matches) and a cats row of × 1.03 dealt, × 0.97 taken evened it; the released v18 rebalance moved
 * the 3v3 rows enough that the same row put the cats at 60% (neutral: 44%), so the cats row is × 1.012 / × 0.988.
 * The hero rows (MAP-5V5.md §12.10) were fitted on 2,000-seed symmetry windows after the takedown-credit fix: a
 * logistic model of every match's line-ups, then a residual correction; each row moves dealt and taken by the same
 * amount in opposite directions. They bring every hero to 46% to 54% and the cats to 47% to 53% on Hearthwood only.
 * Sim v20 (Wild Rift basic attacks, docs/plans/moba/V20-CHASE.md §8): refitted the same way on top of the v20 3v3 rows
 * (two 2,000-seed windows: every hero 47.0% to 53.7%, cats 49.5% / 51.2%). Sim v20 four-window refit (V20-CHASE.md §9):
 * the 3v3 rows now take × 0.97 (a 3v3-only pace cut), so both species rows take ÷ 0.97 to cancel it here; the hero rows
 * were refitted on four 2,000-seed windows (logistic fit + residual), and the cats row then moved to × 0.992 dealt /
 * × 1.039 taken (with the ÷ 0.97), because a species-wide shift moves cats about four times what the per-hero model
 * predicts (cats 46.2% → 57.0% for a 600 bp move).
 */
export const HEARTHWOOD_PVP = Object.freeze({
  // sim v21 on the released v20 base: the v20 cat row (the +1% trial row, 10020 / 10290, gave cats 54.3% on seeds
  // 30001-32000; this row gives 50.6% on fit seeds 6001-7000)
  // sim v28 (V28.md §1.4): with leads held, cats fell to 43.7% / 42.3% (600 from 72001, 400 from 74001). +1% damage
  // and -1% taken (10020 / 10290): 54.0% / 51.0%, pooled 52.8% (the v27 row was 9920 / 10390). +0.7% gave 49.0% / 50.0%
  // but lifted the map5v5-probe down-10 row to 8.2% / 3.2% (6.1% pooled over three windows, against 4.2% here).
  cat: Object.freeze({ dmgBp: 10020, takenBp: 10290 }),
  dog: Object.freeze({ dmgBp: 10000, takenBp: 10310 }),
  // sim v30 (docs/plans/moba/V30-BALANCE.md): the first full 8,000-match per-hero pass on the 24-hero roster. A step of
  // x% moves dmgBp up and takenBp down by x × 100 (a whole or half step, nothing finer). Fitted with a logistic model on
  // 6,000 matches (seeds 100001-103000, about 0.06 logit per 1%), then judged on 8,000 unseen matches (seeds 20001-24000):
  // every hero 47.5%-53.5%, cats 50.5%, side 50.5%. v29 on 100001: Ziggy 45.1%, Biscuit 45.4%, Clem 57.3%, Cacklejaw 56.3%.
  hero: Object.freeze({
    // sim v30 (V30-BALANCE.md): −6% (12048 / 8220 → 11448 / 8820)
    // sim v31 (ROSTER-V31.md §7): −2% (11448 / 8820), 52.0% pooled over 18,000 matches with the v31 four
    clem: { dmgBp: 11248, takenBp: 9020 },
    sage: { dmgBp: 10045, takenBp: 10180 },
    // sim v30 (V30-BALANCE.md): +3.5% (8727 / 11470 → 9077 / 11120)
    // sim v31 (ROSTER-V31.md §7): +1% (9077 / 11120)
    gabe: { dmgBp: 9177, takenBp: 11020 },
    // sim v22 (carved jungle, on the v21 row 9581 / 10637): 54.1% of 1,200 → −1%
    // sim v30 (V30-BALANCE.md): +3% (9481 / 10737 → 9781 / 10437)
    // sim v31 (ROSTER-V31.md §7): +4% (9781 / 10437), 44.3% on the first 8,000 verify with the v31 four
    meatball: { dmgBp: 10181, takenBp: 10037 },
    // sim v22 (carved jungle, on the v21 row 9891 / 10361): 46.4% of 600 → +1%
    // sim v30 (V30-BALANCE.md): −1% (9991 / 10261 → 9891 / 10361)
    duchess: { dmgBp: 9891, takenBp: 10361 },
    // sim v30 (V30-BALANCE.md): −5% (10870 / 9351 → 10370 / 9851)
    aviete: { dmgBp: 10370, takenBp: 9851 },
    bengas: { dmgBp: 10118, takenBp: 10110 },
    // sim v30 (V30-BALANCE.md): +3% (11172 / 9080 → 11472 / 8780)
    // sim v31 (ROSTER-V31.md §7): +1% (11472 / 8780)
    lambo: { dmgBp: 11572, takenBp: 8680 },
    // sim v30 (V30-BALANCE.md): +2% (10178 / 10050 → 10378 / 9850)
    // sim v31 (ROSTER-V31.md §7): −3% (10378 / 9850) in two steps of 1.5%
    pixel: { dmgBp: 10078, takenBp: 10150 },
    // sim v22 on main's v20 + v21 (fresh windows 3200001-3400300, 1,800 matches): 54.7% → the v21 row −1% (the +2%
    // fitted without v20 overshot)
    // sim v30 (V30-BALANCE.md): −4.5% (10217 / 10009 → 9767 / 10459)
    stilts: { dmgBp: 9767, takenBp: 10459 },
    // sim v22 (carved jungle, on the v21 row 11867 / 8435): 53.4% of 600 → −1%
    brutus: { dmgBp: 11767, takenBp: 8535 },
    // sim v30 (V30-BALANCE.md): −7% (10782 / 9511 → 10082 / 10211)
    cacklejaw: { dmgBp: 10082, takenBp: 10211 },
    // sim v30 (V30-BALANCE.md): +3% (9200 / 11058 → 9500 / 10758)
    nugget: { dmgBp: 9500, takenBp: 10758 },
    // sim v21: −1% on the v20 row (9190 / 10810 before); sim v22: 46.3% of 1,800 (windows 3200001-3400300), then 44.2%
    // on 3600001 → +2%
    // sim v30 (V30-BALANCE.md): +1% (9531 / 10692 → 9631 / 10592)
    marshmallow: { dmgBp: 9631, takenBp: 10592 },
    // sim v22 (carved jungle, on the v21 row 11023 / 9280): 54.2% of 600 → −1%
    // sim v30 (V30-BALANCE.md): +1% (10923 / 9380 → 11023 / 9280)
    bravo: { dmgBp: 11023, takenBp: 9280 },
    // sim v30 (V30-BALANCE.md): +3% (9494 / 10770 → 9794 / 10470)
    // sim v31 (ROSTER-V31.md §7): −1.5% (9794 / 10470) after his 3v3 row's +2% (it applies here too)
    chili: { dmgBp: 9644, takenBp: 10620 },
    // sim v22 (carved jungle, on the v21 row 10702 / 9590): 53.5% of 600 → −1%
    // sim v30 (V30-BALANCE.md): −3% (10602 / 9690 → 10302 / 9990)
    howler: { dmgBp: 10302, takenBp: 9990 },
    // sim v22 (carved jungle, on the v21 row 9225 / 11030): 45.5% of 1,200 → +1.5%
    // sim v30 (V30-BALANCE.md): +1% (9375 / 10880 → 9475 / 10780)
    rocket: { dmgBp: 9475, takenBp: 10780 },
    // sim v30 (V30-BALANCE.md): +2.5% (10106 / 10170 → 10356 / 9920)
    frankie: { dmgBp: 10356, takenBp: 9920 },
    // sim v22 (carved jungle, on the v21 row 9912 / 10360): 42.9% of 1,200 → +3%
    // sim v30 (V30-BALANCE.md): −3.5% (10212 / 10060 → 9862 / 10410)
    domino: { dmgBp: 9862, takenBp: 10410 },
    // sim v29 roster (ROSTER-V29.md §4): first rows from hearth-gates 72001 (300 seeds, n ≈ 250 each): Mochi 61.4%,
    // Ziggy 58.4%, Biscuit 40.4%, Champ 45.2% → about 2.3 points per 1% (the domino and marshmallow refits); on 74001
    // (300 seeds) 50.0% / 50.0% / 52.1% / 44.9%, so Champ +2% more
    mochi: { dmgBp: 9550, takenBp: 10450 },
    // sim v30 (V30-BALANCE.md): +4% (9650 / 10350 → 10050 / 9950)
    // sim v31 (ROSTER-V31.md §7): +5% (10050 / 9950): 43.4% on the first window with the v31 four, +3.5%, then 46.7%
    // on the first 8,000 verify, +1.5%
    ziggy: { dmgBp: 10550, takenBp: 9450 },
    // sim v30 (V30-BALANCE.md): +3.5% (10450 / 9550 → 10800 / 9200)
    biscuit: { dmgBp: 10800, takenBp: 9200 },
    // sim v30 (V30-BALANCE.md): −1% (10400 / 9600 → 10300 / 9700)
    champ: { dmgBp: 10300, takenBp: 9700 },
    // sim v31 roster (ROSTER-V31.md §7): from neutral rows on hearth-gates 110001 (2,000 matches: Nova 59.7%, Dusty
    // 56.0%, Barkula 44.1%, Ranger 55.3%, cats 53.7%) −5 / −5 / +2.5 / −5%; on 112001 (2,000) a joint logistic fit
    // moved Dusty −1.5% and Ranger −2% more; the first 8,000 verify (24001–28000: Nova 51.3%, Dusty 47.3%, Barkula
    // 54.8% after his 3v3 row's +1%, Ranger 53.1%) moved Dusty +1%, Barkula −3%, Ranger −1.5%; the second (28001–32000:
    // Nova 54.4%) moved Nova −2.5%
    nova: { dmgBp: 9250, takenBp: 10750 },
    dusty: { dmgBp: 9450, takenBp: 10550 },
    barkula: { dmgBp: 9950, takenBp: 10050 },
    ranger: { dmgBp: 9150, takenBp: 10850 },
  }) as Readonly<Record<string, { readonly dmgBp: number; readonly takenBp: number }>>,
});
