/**
 * What a bot can know (POC.md §7.2): its own team in full, and of the enemy only what `snapshot(team)` shows. Every
 * read of an enemy unit here goes through `visibleTo` (the same test the snapshot uses), so a unit hidden in brush
 * or stealth does not exist for the bots.
 */
import { FOUNTAIN, LANES, MAP, RADIUS, TOWER_SPOTS, mirrorX, mirrorY } from '../../data/map';
import { LANE_PATHS } from '../map/lanes';
import { BP_ONE, dist2, idiv, isqrt } from '../fixed';
import { visibleTo } from '../map/brush';
import { Kind, RANGE, type World } from '../world';
import { attackRange, heroData, radiusOf } from '../units/kinds';
import { TOY_POWER_TIERS } from '../../data/toys';
import { BOT_AI } from '../../data/bots';

/** +1 for Purrhaven (pushes toward +x), −1 for Woof. */
export const sign = (team: number): number => (team === 0 ? 1 : -1);
/**
 * How far toward the enemy core a point is, for `team`. Sim v19: on a point map, along the base-to-base diagonal
 * (x + y; every Hearthwood lane path climbs it monotonically).
 */
export const progressOf = (team: number, x: number, y: number): number =>
  MAP.point === 1 ? (team === 0 ? x + y : MAP.width + MAP.height - x - y) : team === 0 ? x : MAP.width - x;

export const hpBp = (w: World, id: number): number => (w.maxHp[id] > 0 ? idiv(Math.max(0, w.hp[id]) * BP_ONE, w.maxHp[id]) : 0);

export const fountainX = (team: number): number => (team === 0 ? FOUNTAIN.x : mirrorX(FOUNTAIN.x));
export const fountainY = (team: number): number => (team === 0 ? FOUNTAIN.y : mirrorY(FOUNTAIN.y));

/**
 * Sim v19 (point maps): the point `d` mm along `team`'s path of `lane` from the path point nearest (x, y), toward the
 * enemy core (d > 0) or back toward its own (d < 0). Writes [x, y] into `out`. Crossing callers keep their x offsets.
 */
export function alongLane(team: number, lane: number, x: number, y: number, d: number, out: Int32Array): void {
  const p = LANE_PATHS[team][lane];
  // Nearest segment by squared distance to its projection.
  let seg = 0;
  let bestD = -1;
  let bx = p.x[0];
  let by = p.y[0];
  for (let k = 0; k + 1 < p.length; k++) {
    const ax = p.x[k];
    const ay = p.y[k];
    const dx = p.x[k + 1] - ax;
    const dy = p.y[k + 1] - ay;
    const len2 = dx * dx + dy * dy;
    let qx = ax;
    let qy = ay;
    if (len2 > 0) {
      const t = Math.max(0, Math.min(len2, (x - ax) * dx + (y - ay) * dy));
      qx = ax + idiv(dx * t, len2);
      qy = ay + idiv(dy * t, len2);
    }
    const dd = (x - qx) * (x - qx) + (y - qy) * (y - qy);
    if (bestD < 0 || dd < bestD) {
      bestD = dd;
      seg = k;
      bx = qx;
      by = qy;
    }
  }
  let left = Math.abs(d);
  let cx = bx;
  let cy = by;
  if (d >= 0) {
    for (let k = seg + 1; k < p.length && left > 0; k++) {
      const sx = p.x[k] - cx;
      const sy = p.y[k] - cy;
      const len = isqrt(sx * sx + sy * sy);
      if (len >= left) {
        cx += idiv(sx * left, Math.max(1, len));
        cy += idiv(sy * left, Math.max(1, len));
        left = 0;
      } else {
        cx = p.x[k];
        cy = p.y[k];
        left -= len;
      }
    }
  } else {
    for (let k = seg; k >= 0 && left > 0; k--) {
      const sx = p.x[k] - cx;
      const sy = p.y[k] - cy;
      const len = isqrt(sx * sx + sy * sy);
      if (len >= left) {
        cx += idiv(sx * left, Math.max(1, len));
        cy += idiv(sy * left, Math.max(1, len));
        left = 0;
      } else {
        cx = p.x[k];
        cy = p.y[k];
        left -= len;
      }
    }
  }
  out[0] = cx;
  out[1] = cy;
}

/** Sim v19 (point maps): the point `d` mm from (x, y) straight toward `team`'s fountain. */
export function towardBase(team: number, x: number, y: number, d: number, out: Int32Array): void {
  const fx = fountainX(team);
  const fy = fountainY(team);
  const dx = fx - x;
  const dy = fy - y;
  const len = Math.max(1, isqrt(dx * dx + dy * dy));
  const k = Math.min(d, len);
  out[0] = x + idiv(dx * k, len);
  out[1] = y + idiv(dy * k, len);
}

export const within = (w: World, a: number, b: number, r: number): boolean => dist2(w.x[a], w.y[a], w.x[b], w.y[b]) <= r * r;

/** An enemy of `team` that `team` can see now (alive, not hidden). */
export function seenEnemy(w: World, team: number, e: number): boolean {
  return w.alive[e] === 1 && w.hp[e] > 0 && w.team[e] === 1 - team && visibleTo(w, e, team);
}

/** Tower or core reach against a hero (centre to centre). */
export const structReach = (w: World, s: number): number => attackRange(w, s) + radiusOf(w, s) + RADIUS.hero;

/** Is an alive minion of `team` inside structure `s`'s reach (so `s` shoots it instead of a hero)? */
export function tanked(w: World, s: number, team: number): boolean {
  const r = attackRange(w, s) + radiusOf(w, s) + RADIUS.minion;
  for (let id = RANGE.minions; id < RANGE.towers; id++) {
    if (w.alive[id] === 1 && w.team[id] === team && dist2(w.x[id], w.y[id], w.x[s], w.y[s]) <= r * r) return true;
  }
  return false;
}

/** An enemy structure (of `team`'s enemy) covering (x, y) + `margin` that no `team` minion tanks, or −1. */
export function untankedThreat(w: World, team: number, x: number, y: number, margin: number): number {
  for (let s = RANGE.towers; s < RANGE.fountains; s++) {
    if (w.alive[s] === 0 || w.team[s] === team) continue;
    const r = structReach(w, s) + margin;
    if (dist2(w.x[s], w.y[s], x, y) > r * r) continue;
    if (!tanked(w, s, team)) return s;
  }
  return -1;
}

/** Is an allied structure of `team` covering (x, y)? */
export function ownCover(w: World, team: number, x: number, y: number): boolean {
  for (let s = RANGE.towers; s < RANGE.fountains; s++) {
    if (w.alive[s] === 0 || w.team[s] !== team) continue;
    const r = structReach(w, s);
    if (dist2(w.x[s], w.y[s], x, y) <= r * r) return true;
  }
  return false;
}

/** The `team` minion furthest along `lane`, or −1. */
export function laneFront(w: World, team: number, lane: number): number {
  let best = -1;
  let bestP = 0;
  for (let id = RANGE.minions; id < RANGE.towers; id++) {
    if (w.alive[id] === 0 || w.team[id] !== team || w.lane[id] !== lane) continue;
    const p = progressOf(team, w.x[id], w.y[id]);
    if (best < 0 || p > bestP) {
      best = id;
      bestP = p;
    }
  }
  return best;
}

/** Structure ids of `team` in `lane`, outer first; the core last. */
const TIERS2: readonly string[] = ['outer', 'inner'];
const TIERS3: readonly string[] = ['outer', 'inner', 'gate'];

export function laneStructure(w: World, team: number, lane: number, outerFirst: boolean): number {
  const name = LANES[lane];
  const base = RANGE.towers + team * TOWER_SPOTS.length;
  // Sim v19: Hearthwood's lanes have three tiers.
  const tiers = MAP.point === 1 ? TIERS3 : TIERS2;
  for (let pass = 0; pass < tiers.length; pass++) {
    const tier = tiers[outerFirst ? pass : tiers.length - 1 - pass];
    for (let k = 0; k < TOWER_SPOTS.length; k++) {
      if (TOWER_SPOTS[k].lane === name && TOWER_SPOTS[k].tier === tier && w.alive[base + k] === 1) return base + k;
    }
  }
  return RANGE.cores + team;
}

/** Alive structures of `team` in `lane` (towers only). */
export function laneTowers(w: World, team: number, lane: number): number {
  const name = LANES[lane];
  const base = RANGE.towers + team * TOWER_SPOTS.length;
  let n = 0;
  for (let k = 0; k < TOWER_SPOTS.length; k++) if (TOWER_SPOTS[k].lane === name && w.alive[base + k] === 1) n++;
  return n;
}

/** Power of hero `h` for the fight check. Sim v12: + BOT_AI.powerPerToy per Toy tier that adds no HP. */
export const powerOf = (w: World, h: number, perLevel: number): number =>
  Math.max(0, w.hp[h]) + perLevel * w.level[h] + BOT_AI.powerPerToy * TOY_POWER_TIERS[heroData(w, h).role][w.toy[h]];

export const isHero = (w: World, id: number): boolean => w.kind[id] === Kind.Hero;
