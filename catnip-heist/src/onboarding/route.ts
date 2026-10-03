/**
 * Ghost-paw route (plan G10 "Heist"): the level's planned solution (`<level>.solution.json`),
 * replayed through the real sim and cut into legs a player can follow.
 *
 * A leg is the stretch of the solution where one cat walks towards one objective: a new leg starts
 * when the objective stage changes, when the solution swaps cats, or when a cat respawns. Each leg
 * keeps the tiles the walking cat crossed (consecutive, 8-connected, deduplicated) and the spots
 * where the solution pressed ACT or MEOW.
 *
 * Pure: no DOM and no three.js. The renderer side is `ghost-paws.ts`. Nothing here moves a cat; the
 * route is only drawn.
 */
import { stepSim, initSim } from '../sim/sim';
import { decodeInputs, type InputLog } from '../sim/replay';
import { objectiveIndex } from '../sim/hud';
import { tileOf } from '../sim/grid';
import type { LevelDef, SimState, Vec2i } from '../types';

export type RouteActionKind = 'act' | 'meow';

export interface RouteAction {
  /** Index into the leg's `tiles` where the button was pressed. */
  at: number;
  kind: RouteActionKind;
}

export interface RouteLeg {
  /** Objective stage this leg works towards (see `stageIndex`). */
  stage: number;
  /** Index of the cat that walks this leg (0 or 1; crews are positional). */
  active: 0 | 1;
  /** Tiles crossed, in order. Never empty. */
  tiles: Vec2i[];
  actions: RouteAction[];
  /** Solution ticks the leg spans. */
  startTick: number;
  endTick: number;
}

/**
 * The objective stage of a state, the same stage the HUD's objective chip shows:
 * - levels with the 5-line tutorial objectives (heist-01): 0 tutorial door, 1 out of the tutorial,
 *   2 key, 3 rescue, 4 exit;
 * - other levels: 2 key (only when the level has one), 3 rescue, 4 exit.
 * It only grows as the heist moves on, except that a cat sent back to a tutorial checkpoint can
 * drop a tutorial level back to stage 0 or 1.
 */
export function stageIndex(level: LevelDef, s: SimState): number {
  if (s.won) return 5;
  if ((level.meta.objectives?.length ?? 0) === 5) return objectiveIndex(level, s);
  if (level.key && !s.keyTaken) return 2;
  if (!s.rescued) return 3;
  return 4;
}

const sameTile = (a: Vec2i, b: Vec2i) => a.x === b.x && a.y === b.y;
const chebyshev = (a: Vec2i, b: Vec2i) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Replays `solution` on `level` and cuts it into legs. */
export function buildRoute(level: LevelDef, solution: InputLog): RouteLeg[] {
  const inputs = decodeInputs(solution.runs);
  let s = initSim(level, solution.seed, [solution.catIds[0], solution.catIds[1]]);
  const legs: RouteLeg[] = [];
  const open = (state: SimState, tick: number): RouteLeg => {
    const leg: RouteLeg = { stage: stageIndex(level, state), active: state.activeIndex, tiles: [tileOf(state.cats[state.activeIndex].pos)], actions: [], startTick: tick, endTick: tick };
    legs.push(leg);
    return leg;
  };
  let leg = open(s, 0);
  for (let i = 0; i < inputs.length && !s.won; i++) {
    const inp = inputs[i];
    // A press acts where the cat stands now (before the tick moves it).
    if (inp.interact) leg.actions.push({ at: leg.tiles.length - 1, kind: 'act' });
    if (inp.meow) leg.actions.push({ at: leg.tiles.length - 1, kind: 'meow' });
    s = stepSim(level, s, inp);
    const stage = stageIndex(level, s);
    const t = tileOf(s.cats[s.activeIndex].pos);
    leg.endTick = s.tick;
    if (s.won) break;
    if (stage !== leg.stage || s.activeIndex !== leg.active) {
      leg = open(s, s.tick);
      continue;
    }
    const last = leg.tiles[leg.tiles.length - 1];
    if (sameTile(t, last)) continue;
    if (chebyshev(t, last) > 1) {
      // Respawned (or teleported): the walk does not continue from the old tile.
      leg = open(s, s.tick);
      continue;
    }
    leg.tiles.push(t);
  }
  return legs;
}

export interface RoutePick {
  leg: RouteLeg;
  legIndex: number;
  /** First tile of `leg.tiles` still ahead of the walking cat. */
  from: number;
  /** The leg is walked by the other cat: swap first. */
  needsSwap: boolean;
  /** The leg after this one is walked by the other cat (draw a swap mark at the end). */
  swapAfter: boolean;
}

/**
 * The leg to draw for the player's current state: a leg of the current objective stage, preferring
 * the cat the player controls and the leg whose path passes closest to where that cat stands. When
 * the current stage has no leg (a stage the solution skips straight through), the next stage's
 * first leg is used.
 */
export function pickLeg(legs: readonly RouteLeg[], level: LevelDef, s: SimState): RoutePick | null {
  if (!legs.length || s.won) return null;
  const stage = stageIndex(level, s);
  let cands = legs.map((leg, legIndex) => ({ leg, legIndex })).filter((c) => c.leg.stage === stage);
  if (!cands.length) {
    const next = legs.map((l) => l.stage).filter((st) => st > stage).sort((a, b) => a - b)[0];
    if (next === undefined) return null;
    cands = legs.map((leg, legIndex) => ({ leg, legIndex })).filter((c) => c.leg.stage === next);
  }
  let best: { cost: number; legIndex: number; from: number } | null = null;
  for (const { leg, legIndex } of cands) {
    const me = tileOf(s.cats[leg.active].pos);
    let from = 0;
    let d = Infinity;
    leg.tiles.forEach((t, k) => {
      const dd = (t.x - me.x) ** 2 + (t.y - me.y) ** 2;
      if (dd < d) {
        d = dd;
        from = k;
      }
    });
    const remaining = leg.tiles.length - 1 - from;
    // A leg already walked to its end is a poor pick; another cat's leg means a swap first.
    const cost = Math.sqrt(d) + (leg.active === s.activeIndex ? 0 : 3) + (remaining <= 0 && leg.actions.every((a) => a.at < from) ? 6 : 0);
    if (!best || cost < best.cost - 1e-9) best = { cost, legIndex, from };
  }
  if (!best) return null;
  const leg = legs[best.legIndex];
  const after = legs[best.legIndex + 1];
  return {
    leg,
    legIndex: best.legIndex,
    from: best.from,
    needsSwap: leg.active !== s.activeIndex,
    swapAfter: !!after && after.active !== leg.active,
  };
}

/** One paw print in world units (x right, z down the grid), turned to face along the route. */
export interface PawPrint {
  x: number;
  z: number;
  /** Rotation about the vertical axis so the toes point along the walk. */
  rot: number;
}

export type RouteMarkKind = RouteActionKind | 'swap' | 'goal';

export interface RouteMark {
  x: number;
  z: number;
  kind: RouteMarkKind;
}

/** Most prints drawn at once (the rest of a long leg shows once the player gets closer). */
export const MAX_PRINTS = 48;
/** Sideways offset of alternating prints, in tiles. */
const STRIDE = 0.14;

/**
 * Paw prints and marks for a pick: one print per tile from `from` on (alternating left and right
 * paws), an ACT or MEOW mark where the solution pressed it, and a swap or goal mark at the end.
 */
export function routeGeometry(pick: RoutePick, max = MAX_PRINTS): { prints: PawPrint[]; marks: RouteMark[] } {
  const tiles = pick.leg.tiles.slice(pick.from, pick.from + max);
  const prints: PawPrint[] = [];
  const centre = (t: Vec2i) => ({ x: t.x + 0.5, z: t.y + 0.5 });
  for (let k = 0; k < tiles.length; k++) {
    const a = centre(tiles[Math.max(0, k - 1)]);
    const b = centre(tiles[Math.min(tiles.length - 1, k + 1)]);
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const c = centre(tiles[k]);
    const side = k % 2 === 0 ? 1 : -1;
    prints.push({ x: c.x - dz * STRIDE * side, z: c.z + dx * STRIDE * side, rot: Math.atan2(-dx, -dz) });
  }
  const marks: RouteMark[] = [];
  for (const a of pick.leg.actions) {
    if (a.at < pick.from || a.at >= pick.from + max) continue;
    const c = centre(pick.leg.tiles[a.at]);
    if (!marks.some((m) => m.kind === a.kind && m.x === c.x && m.z === c.z)) marks.push({ ...c, kind: a.kind });
  }
  const end = tiles[tiles.length - 1];
  if (end && pick.from + max >= pick.leg.tiles.length) marks.push({ ...centre(end), kind: pick.swapAfter ? 'swap' : 'goal' });
  return { prints, marks };
}
