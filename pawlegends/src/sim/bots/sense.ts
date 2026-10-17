/**
 * What a bot can know (POC.md §7.2): its own team in full, and of the enemy only what `snapshot(team)` shows. Every
 * read of an enemy unit here goes through `visibleTo` (the same test the snapshot uses), so a unit hidden in brush
 * or stealth does not exist for the bots.
 */
import { FOUNTAIN, LANES, MAP, RADIUS, TOWER_SPOTS, mirrorX } from '../../data/map';
import { BP_ONE, dist2, idiv } from '../fixed';
import { visibleTo } from '../map/brush';
import { Kind, RANGE, type World } from '../world';
import { attackRange, radiusOf } from '../units/kinds';

/** +1 for Purrhaven (pushes toward +x), −1 for Woof. */
export const sign = (team: number): number => (team === 0 ? 1 : -1);
/** How far toward the enemy core a point is, for `team`. */
export const progressOf = (team: number, x: number): number => (team === 0 ? x : MAP.width - x);

export const hpBp = (w: World, id: number): number => (w.maxHp[id] > 0 ? idiv(Math.max(0, w.hp[id]) * BP_ONE, w.maxHp[id]) : 0);

export const fountainX = (team: number): number => (team === 0 ? FOUNTAIN.x : mirrorX(FOUNTAIN.x));
export const fountainY = (): number => FOUNTAIN.y;

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
    const p = progressOf(team, w.x[id]);
    if (best < 0 || p > bestP) {
      best = id;
      bestP = p;
    }
  }
  return best;
}

/** Structure ids of `team` in `lane`, outer first; the core last. */
export function laneStructure(w: World, team: number, lane: number, outerFirst: boolean): number {
  const name = LANES[lane];
  const base = RANGE.towers + team * TOWER_SPOTS.length;
  for (let pass = 0; pass < 2; pass++) {
    const tier = (pass === 0) === outerFirst ? 'outer' : 'inner';
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

/** Power of hero `h` for the fight check. */
export const powerOf = (w: World, h: number, perLevel: number): number => Math.max(0, w.hp[h]) + perLevel * w.level[h];

export const isHero = (w: World, id: number): boolean => w.kind[id] === Kind.Hero;
