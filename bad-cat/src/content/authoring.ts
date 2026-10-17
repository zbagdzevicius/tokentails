/**
 * Room authoring: the seeded Kitchen variants (prop jitter + routine tempo) and "The Glass".
 * The output is baked into `rooms/*.json` (the shipped content, GDD 13.7) and a test checks the JSON still
 * equals this generator, so a change here is always a deliberate re-bake:
 *   BADCAT_WRITE_ROOMS=1 npx vitest run src/content/rooms.bake.test.ts
 */
import { BOSS_TICKS, RUN_TICKS, propKind, type Level, type PlayableRoom, type PropPlacement, type RoomDef, type RoomEventKind, type RoomTheme, type ShellDef } from '../types';
import { KIND } from './props-catalog';
import { KITCHEN, SHELLS } from './shells';
import { ROUTINES } from './routines';
import { AREA_KINDS as KIT_AREA_KINDS, CHEAP_KINDS, KITS, THEME_KINDS, type Area, type KitSlot } from './kits';
import { BOSS_BUDGET, BOSS_PROP_MAX, DAILY_BUDGET, PROP_MAX, PROP_MIN, STARTER_MAX_CELLS, STARTER_MAX_TICKS, humanCells, landingVisible, targetVisible, travelTicks, validate } from './validate';

/** A prop slot on a furniture surface. `direct` = wreckable (pushable off an edge) from a cell the cat can
 *  reach even when every other slot is filled; Must-Wreck targets only use direct slots. */
interface Slot {
  x: number;
  z: number;
  area: 'counter' | 'fridge' | 'shelf' | 'table' | 'sideboard' | 'bench' | 'footstool';
  direct: boolean;
}

const S = (area: Slot['area'], direct: boolean, ...cells: [number, number][]): Slot[] => cells.map(([x, z]) => ({ x, z, area, direct }));

export const KITCHEN_SLOTS: readonly Slot[] = [
  // Front row of the back counter, pushed south off the edge (cat walks the back row z=0). (5,1) would land
  // on Chef Dad, (2,1) and (8,1) are the stool landings, (0,1)/(1,1) lead to the shelf.
  ...S('counter', true, [3, 1], [4, 1], [6, 1], [7, 1], [9, 1]),
  ...S('fridge', true, [10, 1], [11, 1]),
  ...S('shelf', true, [1, 2], [1, 3], [0, 4]),
  ...S('shelf', false, [1, 4]),
  // Table: the cat walks (5,6)-(6,6). The back row (5,5)/(6,5) only falls north, behind the table where the
  // camera cannot see it, so it never holds a Must-Wreck target (validator: no hidden north pushes).
  ...S('table', true, [4, 6], [7, 6]),
  ...S('table', false, [4, 5], [7, 5], [5, 5], [6, 5]),
  // Sideboard: the cat walks x=11 from the stool (11,7). (11,4) only falls north, out of sight.
  ...S('sideboard', true, [10, 5], [10, 6]),
  ...S('sideboard', false, [10, 4], [11, 4]),
  // Breakfast bench (L1): the cat walks z=9, pushes z=8 north.
  ...S('bench', true, [6, 8], [7, 8], [8, 8], [9, 8]),
  // Footstool east end (L1): pinned for target #1 (see FOOTSTOOL_SLOT), never picked at random.
  ...S('footstool', false, [3, 7]),
];

/**
 * Must-Wreck target #1 in every Kitchen variant: on the footstool's east end. The first heist is a straight
 * line from the FTUE spawn (0,7): run east one cell, hop onto the stool, SWAT, and it falls east onto the open
 * floor in front of the table (1 step + 1 hop, ~0.7 s; validator: FTUE wreck <= 90 ticks).
 */
export const FOOTSTOOL_SLOT: readonly [number, number] = [3, 7];

const AREA_KINDS: Record<Slot['area'], readonly number[]> = {
  counter: [KIND.wineGlass, KIND.mug, KIND.plateStack, KIND.fruitBowl, KIND.eggCarton, KIND.cake, KIND.vase],
  fridge: [KIND.vase, KIND.pottedPlant, KIND.bookStack, KIND.fruitBowl],
  shelf: [KIND.vase, KIND.pottedPlant, KIND.bookStack, KIND.mug, KIND.wineGlass],
  table: [KIND.wineGlass, KIND.mug, KIND.plateStack, KIND.fruitBowl, KIND.cake, KIND.tvRemote, KIND.laptop],
  sideboard: [KIND.vase, KIND.pottedPlant, KIND.tvRemote, KIND.laptop, KIND.bookStack],
  bench: [KIND.tvRemote, KIND.laptop, KIND.bookStack, KIND.mug, KIND.pottedPlant],
  footstool: [KIND.wineGlass, KIND.mug, KIND.plateStack, KIND.fruitBowl, KIND.vase],
};

/**
 * Floor spots for the grabbables (never a landing cell of a slot, the spawn, the human or the cat bed). None is
 * next to the ranked spawn (1,8), so the main button starts as SWAT, and none sits by the FTUE spawn (0,7).
 */
const GRAB_SPOTS: readonly [number, number][] = [[3, 3], [4, 9], [9, 3], [8, 4], [4, 3]];
const ROOMBA_SPOT: [number, number] = [11, 9];
export const KITCHEN_SPAWN = { x: 1, z: 8 } as const;

function rng(seed: number): (n: number) => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return (n: number) => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s >>> 8) % n;
  };
}

function levelAt(x: number, z: number): Level {
  return KITCHEN.levels[z * KITCHEN.width + x];
}

export interface RoomRecipe {
  id: string;
  seed: number;
  title: string;
  routine: number;
  event: RoomEventKind;
  /** Must-Wreck kinds in order; `at` pins a slot (The Glass), else a random direct slot that allows the kind. */
  targets: { kind: number; at?: [number, number] }[];
  /** Surface slots left empty (0..). */
  drop: number;
}

export function buildKitchenRoom(r: RoomRecipe): RoomDef {
  const rnd = rng(r.seed);
  const used = new Set<string>();
  const key = (x: number, z: number): string => `${x},${z}`;
  const targets: PropPlacement[] = [];
  for (const t of r.targets) {
    let slot: Slot | undefined;
    if (t.at) slot = KITCHEN_SLOTS.find((s) => s.x === t.at![0] && s.z === t.at![1]);
    else {
      const c = KITCHEN_SLOTS.filter((s) => s.direct && !used.has(key(s.x, s.z)) && AREA_KINDS[s.area].includes(t.kind));
      slot = c[rnd(c.length)];
    }
    if (!slot) throw new Error(`no slot for target kind ${t.kind} in ${r.id}`);
    used.add(key(slot.x, slot.z));
    targets.push({ kind: t.kind, x: slot.x, z: slot.z, level: levelAt(slot.x, slot.z), rot: rnd(4) as PropPlacement['rot'], target: true });
  }
  const rest = KITCHEN_SLOTS.filter((s) => !used.has(key(s.x, s.z)));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const others: PropPlacement[] = [];
  for (const s of rest.slice(r.drop)) {
    const kinds = AREA_KINDS[s.area];
    others.push({ kind: kinds[rnd(kinds.length)], x: s.x, z: s.z, level: levelAt(s.x, s.z), rot: rnd(4) as PropPlacement['rot'] });
  }
  const spots = GRAB_SPOTS.slice();
  for (let i = spots.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  [KIND.slipper, KIND.sock, KIND.slipper, KIND.sock].forEach((kind, i) => {
    others.push({ kind, x: spots[i][0], z: spots[i][1], level: 0, rot: rnd(4) as PropPlacement['rot'] });
  });
  others.push({ kind: KIND.roomba, x: ROOMBA_SPOT[0], z: ROOMBA_SPOT[1], level: 0, rot: 0 });
  others.sort((a, b) => a.z - b.z || a.x - b.x);
  return {
    id: r.id,
    shell: KITCHEN.id,
    routine: r.routine,
    event: r.event,
    width: KITCHEN.width,
    depth: KITCHEN.depth,
    spawn: { ...KITCHEN_SPAWN },
    // Targets first: props[0] is target #1 (The Glass: the wine glass).
    props: [...targets, ...others],
    seed: r.seed >>> 0,
    ticks: RUN_TICKS,
    title: r.title,
  };
}

/**
 * Day 1 (Appendix A): wine glass, fruit bowl, egg carton, kettle. The rest rotate the MVP kinds. Target #1 is a
 * one-swat kind on the footstool (FOOTSTOOL_SLOT) so the first heist from any day's link crashes in seconds.
 */
export const KITCHEN_RECIPES: readonly RoomRecipe[] = [
  { kinds: [KIND.wineGlass, KIND.fruitBowl, KIND.eggCarton], event: 1, routine: 0, drop: 0 },
  { kinds: [KIND.mug, KIND.plateStack, KIND.vase], event: 0, routine: 1, drop: 1 },
  { kinds: [KIND.wineGlass, KIND.cake, KIND.pottedPlant], event: 2, routine: 2, drop: 2 },
  { kinds: [KIND.mug, KIND.laptop, KIND.eggCarton], event: 1, routine: 3, drop: 0 },
  { kinds: [KIND.plateStack, KIND.bookStack, KIND.wineGlass], event: 0, routine: 0, drop: 1 },
  { kinds: [KIND.vase, KIND.fruitBowl, KIND.tvRemote], event: 2, routine: 1, drop: 2 },
  { kinds: [KIND.plateStack, KIND.cake, KIND.mug], event: 0, routine: 2, drop: 1 },
].map((v, i) => ({
  id: `kitchen-v${i + 1}`,
  seed: (0xbadca700 + (i + 1) * 0x9e3779b1) >>> 0,
  title: 'Kitchen: Breakfast Heist',
  routine: v.routine,
  event: v.event as RoomEventKind,
  targets: v.kinds.map((kind, k) => (k === 0 ? { kind, at: [FOOTSTOOL_SLOT[0], FOOTSTOOL_SLOT[1]] as [number, number] } : { kind })),
  drop: v.drop,
}));

export const GLASS_RECIPE: RoomRecipe = {
  id: 'glass',
  seed: 0x0961a55e,
  title: 'The Glass',
  routine: 0,
  event: 1,
  // The wine glass on the counter edge by the stool, right next to Chef Dad: the clip shot. The plate stack sits on
  // the table's front corner (it falls in sight), the mug on the footstool (the first heist's quick crash).
  targets: [{ kind: KIND.wineGlass, at: [7, 1] }, { kind: KIND.plateStack, at: [4, 6] }, { kind: KIND.mug, at: [3, 7] }],
  drop: 0,
};

// =====================================================================================================
// FULL build: every shell, the 21 authored dailies and the generator beyond them (GDD 3.5, 13.7, App. A)
// =====================================================================================================

/** One daily room, before building. `dayNo` seeds nothing by itself: `seed` does. */
export interface DailyRecipe {
  id: string;
  seed: number;
  shell: number;
  routine: number;
  routine2?: number;
  event: RoomEventKind;
  /** "Breakfast Heist" */
  name: string;
  /** "Kitchen #1: Breakfast Heist" / "Boss: Christmas Tree #20" */
  title: string;
  theme?: RoomTheme;
  boss?: boolean;
  /** Weekday telegraph ticks (RoomDef.telegraph). */
  telegraph: number;
  /** Must-Wreck kinds in order; `at` pins a cell, `area` prefers kit areas. */
  targets: { kind: number; at?: [number, number]; area?: Area[] }[];
  /** The accomplice's wish (a kind); placed on the floor when carried or sat in, else on a wreckable slot. */
  wish: number;
  /** Today's Pink Paw accomplice. */
  pinkPawId?: string;
  /** Extra filler slots left empty (variety); the builder also drops slots to respect the prop cap. */
  drop?: number;
  /** Floor grabbables (default: a slipper and a sock). */
  grabbables?: number[];
}

/** A carried / sat-in wish starts at least this far (cells, Chebyshev) from the room's spawn when it can. */
export const WISH_MIN_SPAWN_DIST = 5;

/** Weekday difficulty (GDD 4.3): telegraph ticks, Monday .. Sunday. */
export const WEEKDAY_TELEGRAPH: readonly number[] = [24, 22, 20, 19, 17, 15, 24];

const key2 = (x: number, z: number): string => `${x},${z}`;

function shuffle<T>(a: T[], rnd: (n: number) => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Push-wreck ticks for a slot, ignoring pushes that would land on a human (props are never thrown at people).
 * -1 when no push from a reachable cell works.
 */
function slotPushTicks(play: PlayableRoom, dist: Float64Array, px: number, pz: number): number {
  const { shell } = play;
  const W = shell.width;
  const D = shell.depth;
  const humans = humanCells(play);
  const lp = shell.levels[pz * W + px];
  const DXo = [0, 1, 0, -1];
  const DZo = [-1, 0, 1, 0];
  let best = Infinity;
  for (let d = 0; d < 4; d++) {
    const cx = px - DXo[d];
    const cz = pz - DZo[d];
    const tx = px + DXo[d];
    const tz = pz + DZo[d];
    if (cx < 0 || cz < 0 || cx >= W || cz >= D || tx < 0 || tz < 0 || tx >= W || tz >= D) continue;
    if (shell.levels[cz * W + cx] !== lp || shell.levels[tz * W + tx] >= lp) continue;
    if (DZo[d] < 0 && !landingVisible(play, tx, tz)) continue;
    if (humans.some((h) => h.x === tx && h.z === tz)) continue;
    best = Math.min(best, dist[cz * W + cx]);
  }
  return best === Infinity ? -1 : best;
}

/**
 * The starter slots of a kit (round 2, QA): the two slots within STARTER_MAX_CELLS of the spawn that are quickest to
 * wreck (<= STARTER_MAX_TICKS) with every slot filled; empty when none qualifies.
 */
function starterSlots(kit: (typeof KITS)[number], shell: ShellDef, r: DailyRecipe): KitSlot[] {
  const full: RoomDef = {
    id: `${r.id}-starter`,
    shell: r.shell,
    routine: r.routine,
    event: r.event,
    width: shell.width,
    depth: shell.depth,
    spawn: { ...kit.spawn },
    props: kit.slots.map((sl) => ({ kind: sl.cable ? KIND.lamp : KIND.mug, x: sl.x, z: sl.z, level: surfaceLevel(shell, sl.x, sl.z), rot: 0 as const })),
    seed: r.seed >>> 0,
    ticks: r.boss ? BOSS_TICKS : RUN_TICKS,
  };
  if (r.routine2 !== undefined) full.routine2 = r.routine2;
  const play = playOf(full);
  const dist = travelTicks(play);
  const found: { sl: KitSlot; t: number }[] = [];
  for (const sl of kit.slots) {
    if (sl.cable) continue;
    if (Math.max(Math.abs(sl.x - kit.spawn.x), Math.abs(sl.z - kit.spawn.z)) > STARTER_MAX_CELLS) continue;
    const t = slotPushTicks(play, dist, sl.x, sl.z);
    if (t >= 0 && t <= STARTER_MAX_TICKS) found.push({ sl, t });
  }
  // the two quickest (a target may take the first): stable by ticks, then kit order
  return found.sort((a, b) => a.t - b.t).slice(0, 2).map((f) => f.sl);
}

/** Resolve a room against its shell and routines without importing index.ts (no cycle). */
function playOf(room: RoomDef): PlayableRoom {
  const shell = SHELLS[room.shell];
  const routine = ROUTINES[room.routine];
  const play: PlayableRoom = { room, shell, routine, mode: 'ranked' };
  if (room.routine2 !== undefined && shell.humanSpot2) play.routine2 = ROUTINES[room.routine2];
  return play;
}

const surfaceLevel = (shell: ShellDef, x: number, z: number): Level => shell.levels[z * shell.width + x];

/** A lamp faces its cable (rot 0 N, 1 E, 2 S, 3 W), so a codec that drops `cable` still finds it by `rot`. */
function rotToward(from: { x: number; z: number }, to: { x: number; z: number }): PropPlacement['rot'] {
  if (to.z < from.z) return 0;
  if (to.x > from.x) return 1;
  if (to.z > from.z) return 2;
  return 3;
}

/**
 * Build a FULL-build daily room from a recipe and its shell's kit. Deterministic in `recipe.seed`.
 * Throws when a target or the wish cannot be placed (the generator then retries with the next seed).
 */
export function buildDailyRoom(r: DailyRecipe): RoomDef {
  const kit = KITS[r.shell];
  const shell = SHELLS[r.shell];
  if (!kit || !shell) throw new Error(`no kit for shell ${r.shell}`);
  const rnd = rng(r.seed);
  const boss = !!r.boss;
  const maxProps = (boss ? BOSS_PROP_MAX : PROP_MAX) - 1; // one cell kept for a sponsor product
  const theme = r.theme && r.theme !== 'default' ? r.theme : undefined;
  const themeKinds = theme ? THEME_KINDS[theme] ?? [] : [];

  // ----- floor: tall targets, the wish (carried / sat in), grabbables, decor, the Roomba -----
  const floorSpots = shuffle(kit.floor.slice() as [number, number][], rnd);
  const floorProps: PropPlacement[] = [];
  const wishKind = propKind(r.wish);
  const wishOnFloor = !!wishKind && (wishKind.grabbable || !!wishKind.enterable);
  let wishProp: PropPlacement | undefined;
  if (wishOnFloor) {
    // review round 1: a wish next to the spawn paid +500 to random wandering in ~4 s. Take the first shuffled spot
    // WISH_MIN_SPAWN_DIST+ cells from the spawn (Chebyshev), else the farthest one.
    const far = (p: [number, number]): number => Math.max(Math.abs(p[0] - kit.spawn.x), Math.abs(p[1] - kit.spawn.z));
    let wi = floorSpots.findIndex((p) => far(p) >= WISH_MIN_SPAWN_DIST);
    if (wi < 0) wi = floorSpots.reduce((best, p, i) => (far(p) > far(floorSpots[best]) ? i : best), 0);
    const s = floorSpots.splice(wi, 1)[0];
    if (!s) throw new Error(`${r.id}: no floor spot for the wish`);
    wishProp = { kind: r.wish, x: s[0], z: s[1], level: 0, rot: rnd(4) as PropPlacement['rot'] };
    floorProps.push(wishProp);
  }
  const grabs = r.grabbables ?? kit.grabbables ?? [KIND.slipper, KIND.sock];
  for (const g of grabs) {
    const s = floorSpots.shift();
    if (!s) break;
    floorProps.push({ kind: g, x: s[0], z: s[1], level: 0, rot: rnd(4) as PropPlacement['rot'] });
  }
  for (const d of kit.decor ?? []) floorProps.push({ kind: d.kind, x: d.x, z: d.z, level: surfaceLevel(shell, d.x, d.z), rot: rnd(4) as PropPlacement['rot'] });
  if (shell.roombaLoop?.length) floorProps.push({ kind: KIND.roomba, x: shell.roombaLoop[0].x, z: shell.roombaLoop[0].z, level: 0, rot: 0 });
  const tallTargets: PropPlacement[] = [];
  for (const t of r.targets) {
    if (propKind(t.kind)?.tall === undefined) continue;
    if (!t.at) throw new Error(`${r.id}: a tall target needs a pinned cell`);
    tallTargets.push({ kind: t.kind, x: t.at[0], z: t.at[1], level: 0, rot: 0, target: true });
  }

  // ----- surface slots: drop some for variety and to respect the prop cap -----
  const pinned = new Set(r.targets.filter((t) => t.at).map((t) => key2(t.at![0], t.at![1])));
  const slots = kit.slots.slice();
  // Round 2 (QA): the slots along the Roomba's road (framing needs a mess there) and the starter slot (a fragile
  // prop near the spawn, the first crash in seconds) are never dropped.
  const road = shell.roombaLoop ?? [];
  const nearRoad = (s: KitSlot): boolean => road.some((c) => Math.max(Math.abs(c.x - s.x), Math.abs(c.z - s.z)) <= 1);
  const starters = starterSlots(kit, shell, r);
  const kept = (s: KitSlot): boolean =>
    pinned.has(key2(s.x, s.z)) || !!s.cable || !!kit.keepAreas?.includes(s.area) || nearRoad(s) || starters.some((st) => st.x === s.x && st.z === s.z) || (!!kit.hero && kit.hero.x === s.x && kit.hero.z === s.z);
  const optional = shuffle(slots.filter((s) => !kept(s)), rnd);
  const fixed = slots.filter(kept);
  const cloth = kit.cloth ? 1 : 0;
  const room0 = floorProps.length + tallTargets.length + cloth;
  let keep = Math.min(optional.length, maxProps - room0 - fixed.length);
  keep = Math.max(0, keep - (r.drop ?? 0));
  const used = [...fixed, ...optional.slice(0, keep)];
  // top up with floor decor (plants, laundry, presents) so the room looks lived in and reaches its prop count
  const want = boss ? 36 : 28;
  const extras = shuffle((kit.extra ?? []).slice() as [number, number][], rnd);
  const extraKinds = kit.extraKinds ?? [KIND.pottedPlant];
  while (used.length + floorProps.length + tallTargets.length + cloth < Math.min(want, maxProps) && extras.length) {
    const [x, z] = extras.shift()!;
    floorProps.push({ kind: extraKinds[rnd(extraKinds.length)], x, z, level: surfaceLevel(shell, x, z), rot: rnd(4) as PropPlacement['rot'] });
  }
  if (used.length + floorProps.length + tallTargets.length + cloth < PROP_MIN) throw new Error(`${r.id}: only ${used.length + floorProps.length + tallTargets.length + cloth} props`);

  // ----- which slots can be wrecked, with every slot filled (all surface props block alike) -----
  const placeholder = (): PropPlacement[] => [
    ...used.map((s) => ({ kind: s.cable ? KIND.lamp : KIND.mug, x: s.x, z: s.z, level: surfaceLevel(shell, s.x, s.z), rot: 0 as const })),
    ...floorProps,
    ...tallTargets,
  ];
  const base: RoomDef = {
    id: r.id,
    shell: r.shell,
    routine: r.routine,
    event: r.event,
    width: shell.width,
    depth: shell.depth,
    spawn: { ...kit.spawn },
    props: placeholder(),
    seed: r.seed >>> 0,
    ticks: boss ? BOSS_TICKS : RUN_TICKS,
  };
  if (r.routine2 !== undefined) base.routine2 = r.routine2;
  const play = playOf(base);
  const dist = travelTicks(play);
  const wreck = new Map<string, number>();
  for (const s of used) {
    let t = slotPushTicks(play, dist, s.x, s.z);
    if (s.cable && t < 0 && dist[s.cable.z * shell.width + s.cable.x] !== Infinity) t = dist[s.cable.z * shell.width + s.cable.x];
    if (t >= 0) wreck.set(key2(s.x, s.z), t);
  }

  // ----- targets -----
  const taken = new Set<string>();
  const kinds = new Map<string, number>();
  const targets: PropPlacement[] = [];
  r.targets.forEach((t, i) => {
    if (propKind(t.kind)?.tall !== undefined) {
      targets.push(tallTargets.find((p) => p.kind === t.kind)!);
      return;
    }
    let slot: KitSlot | undefined;
    if (t.at) slot = used.find((s) => s.x === t.at![0] && s.z === t.at![1]);
    else {
      const isLamp = t.kind === KIND.lamp;
      let c = used.filter((s) => !taken.has(key2(s.x, s.z)) && wreck.has(key2(s.x, s.z)) && !!s.cable === isLamp);
      const inArea = c.filter((s) => (t.area ? t.area.includes(s.area) : KIT_AREA_KINDS[s.area].includes(t.kind)));
      if (inArea.length) c = inArea;
      if (i < 2) {
        const vis = c.filter((s) => targetVisible(play, s.x, s.z));
        if (vis.length) c = vis;
      }
      if (i === 0) {
        const quick = c.filter((s) => wreck.get(key2(s.x, s.z))! <= 120);
        if (quick.length) c = quick;
      }
      slot = c[rnd(c.length)];
    }
    if (!slot) throw new Error(`${r.id}: no slot for target kind ${t.kind}`);
    taken.add(key2(slot.x, slot.z));
    kinds.set(key2(slot.x, slot.z), t.kind);
    const p: PropPlacement = { kind: t.kind, x: slot.x, z: slot.z, level: surfaceLevel(shell, slot.x, slot.z), rot: rnd(4) as PropPlacement['rot'], target: true };
    if (slot.cable && t.kind === KIND.lamp) {
      p.cable = { ...slot.cable };
      p.rot = rotToward(slot, slot.cable);
    }
    targets.push(p);
  });

  // ----- the wish on a surface (when it is wrecked rather than carried) -----
  if (!wishOnFloor) {
    let c = used.filter((s) => !taken.has(key2(s.x, s.z)) && wreck.has(key2(s.x, s.z)) && !s.cable);
    const inArea = c.filter((s) => KIT_AREA_KINDS[s.area].includes(r.wish));
    if (inArea.length) c = inArea;
    const slot = c[rnd(c.length)];
    if (!slot) throw new Error(`${r.id}: no slot for the wish`);
    taken.add(key2(slot.x, slot.z));
    wishProp = { kind: r.wish, x: slot.x, z: slot.z, level: surfaceLevel(shell, slot.x, slot.z), rot: rnd(4) as PropPlacement['rot'] };
  }

  // ----- fillers -----
  const others: PropPlacement[] = [];
  for (const s of used) {
    if (taken.has(key2(s.x, s.z))) continue;
    if (s.cable) {
      rnd(4); // keeps the RNG stream of the other fillers
      others.push({ kind: KIND.lamp, x: s.x, z: s.z, level: surfaceLevel(shell, s.x, s.z), rot: rotToward(s, s.cable), cable: { ...s.cable } });
      continue;
    }
    const pool0 = themeKinds.length && rnd(3) === 0 ? themeKinds : KIT_AREA_KINDS[s.area];
    const allowed = kit.noFill?.length ? pool0.filter((k) => !kit.noFill!.includes(k)) : pool0;
    const pool = allowed.length ? allowed : KIT_AREA_KINDS[s.area].filter((k) => !kit.noFill?.includes(k));
    const pick = pool.length ? pool : pool0;
    others.push({ kind: pick[rnd(pick.length)], x: s.x, z: s.z, level: surfaceLevel(shell, s.x, s.z), rot: rnd(4) as PropPlacement['rot'] });
  }
  // the starter slot holds something that breaks or spills (round 2: the first crash was a toilet roll landing)
  const fragileTarget = (sl: KitSlot): boolean => {
    const k = propKind(kinds.get(key2(sl.x, sl.z)) ?? 0);
    return !!k?.fragile && k.onLand !== 'land';
  };
  const starter = starters.some((st) => taken.has(key2(st.x, st.z)) && fragileTarget(st)) ? undefined : starters.find((st) => !taken.has(key2(st.x, st.z)));
  if (starter) {
    const i = others.findIndex((p) => p.x === starter.x && p.z === starter.z);
    const k = i >= 0 ? propKind(others[i].kind) : undefined;
    if (i >= 0 && !(k?.fragile && k.onLand !== 'land')) {
      const pool = KIT_AREA_KINDS[starter.area].filter((kk) => {
        const d = propKind(kk);
        return !!d && d.fragile && d.onLand !== 'land' && !d.stack && !kit.noFill?.includes(kk);
      });
      const fall = [KIND.mug, KIND.vase, KIND.wineGlass];
      const pick = pool.length ? pool : fall;
      others[i] = { ...others[i], kind: pick[rnd(pick.length)] };
    }
  }
  // the hero on its high shelf (round 2: the Bathroom and the Bedroom had no big crash)
  if (kit.hero && !taken.has(key2(kit.hero.x, kit.hero.z))) {
    const i = others.findIndex((p) => p.x === kit.hero!.x && p.z === kit.hero!.z);
    if (i >= 0) others[i] = { ...others[i], kind: kit.hero.kind };
  }
  if (wishProp && !wishOnFloor) others.push(wishProp);
  for (const p of floorProps) if (p !== wishProp) others.push(p);
  if (wishProp && wishOnFloor) others.push(wishProp);
  if (kit.cloth) others.push({ kind: KIND.tablecloth, x: kit.cloth.x, z: kit.cloth.z, level: surfaceLevel(shell, kit.cloth.x, kit.cloth.z), rot: 0, w: kit.cloth.w, d: kit.cloth.d });

  // ----- chaos budget: swap the priciest fillers for cheap ones until the room fits -----
  const cap = boss ? BOSS_BUDGET : DAILY_BUDGET;
  const total = (): number => [...targets, ...others].reduce((a, p) => a + (propKind(p.kind)?.base ?? 0), 0);
  let guard = 0;
  while (total() > cap && guard++ < 60) {
    let worst = -1;
    others.forEach((p, i) => {
      const k = propKind(p.kind)!;
      if (p === wishProp || k.pull || k.actor || k.grabbable || floorProps.includes(p)) return;
      if (worst < 0 || k.base > propKind(others[worst].kind)!.base) worst = i;
    });
    if (worst < 0) break;
    others[worst] = { ...others[worst], kind: CHEAP_KINDS[guard % CHEAP_KINDS.length] };
  }

  others.sort((a, b) => a.z - b.z || a.x - b.x || a.kind - b.kind);
  const props = [...targets, ...others];
  const room: RoomDef = { ...base, props, title: r.title, telegraph: r.telegraph };
  if (theme) room.theme = theme;
  if (boss) room.boss = true;
  if (r.pinkPawId && wishProp) {
    const spot = shell.accompliceSpot;
    room.accomplice = { pinkPawId: r.pinkPawId, wishPropIndex: props.indexOf(wishProp) };
    if (spot) Object.assign(room.accomplice, { x: spot.x, z: spot.z, level: spot.level });
  }
  return room;
}

/** Validation of a built room in ranked mode (the generator's acceptance test). */
export function roomProblems(room: RoomDef): string[] {
  return validate(playOf(room)).errors;
}
