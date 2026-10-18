/**
 * Client-side target choice (POC.md §9): screen picking, the touch Attack button's priority (enemy hero in range
 * first, then the lowest-HP minion, then a tower), and smart-cast aim. Only decides WHICH id or point a command
 * carries; every rule about what that command does stays in the sim. Floats are fine here (never in the replay:
 * the command carries integers).
 */
import type { EntitySnap } from '../sim/api';
import { TOWERS } from '../data/towers';
import type { AimSpec } from './abilities';

export interface Unit {
  id: number;
  kind: EntitySnap['kind'];
  team: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: EntitySnap['state'];
}

/** Rough body radius (mm) by kind, so "in range" means edge to edge like the sim's attack checks. */
export const BODY_MM: Readonly<Record<EntitySnap['kind'], number>> = Object.freeze({
  hero: 500,
  minion: 400,
  tower: 1300,
  core: 3000,
  fountain: 0,
  camp: 500,
  pudding: 2000,
  pickup: 0,
});

export const ATTACKABLE: ReadonlySet<EntitySnap['kind']> = new Set(['hero', 'minion', 'tower', 'core', 'camp', 'pudding']);

export const isEnemy = (u: Unit, myTeam: number): boolean => u.team !== myTeam && ATTACKABLE.has(u.kind) && u.state !== 'dead';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Is `u` inside the range of a living enemy (to us) tower or core that no allied minion is tanking? Walking in to
 * hit it would put the player under fire alone (the playtest's tower deaths: auto-attack chased a hero under one).
 */
export function guardedByTower(units: readonly Unit[], u: { x: number; y: number }, myTeam: number): boolean {
  const reach = TOWERS.outer.range + BODY_MM.hero;
  for (const t of units) {
    if ((t.kind !== 'tower' && t.kind !== 'core') || t.team === myTeam || t.state === 'dead' || t.team > 1) continue;
    if (dist(t, u) > reach + BODY_MM[t.kind]) continue;
    const tanked = units.some((m) => m.kind === 'minion' && m.team === myTeam && m.state !== 'dead' && dist(m, t) <= TOWERS.outer.range + BODY_MM.tower);
    if (!tanked) return true;
  }
  return false;
}

/**
 * The Attack button target (§9): an enemy hero in range first (lowest HP share), then the lowest-HP minion or camp
 * monster in range, then a tower or core in range; with nothing in range, the nearest enemy hero, then minion,
 * within `seek` mm, but never one that sits under an untanked enemy tower (that walk-in is how new players died).
 * Null when nothing qualifies.
 */
export function attackPriority(units: readonly Unit[], me: Unit, myTeam: number, range: number, seek = 7000): number | null {
  let hero: Unit | null = null;
  let minion: Unit | null = null;
  let tower: Unit | null = null;
  let nearHero: Unit | null = null;
  let nearMinion: Unit | null = null;
  for (const u of units) {
    if (u.id === me.id || !isEnemy(u, myTeam)) continue;
    const d = dist(u, me) - BODY_MM[u.kind];
    const inRange = d <= range + 300;
    if (u.kind === 'hero') {
      if (inRange && (!hero || u.hp / u.maxHp < hero.hp / hero.maxHp)) hero = u;
      if (d <= seek && (!nearHero || d < dist(nearHero, me) - BODY_MM.hero) && !guardedByTower(units, u, myTeam)) nearHero = u;
    } else if (u.kind === 'minion' || u.kind === 'camp' || u.kind === 'pudding') {
      if (inRange && (!minion || u.hp < minion.hp)) minion = u;
      if (d <= seek && (!nearMinion || d < dist(nearMinion, me) - BODY_MM[nearMinion.kind]) && !guardedByTower(units, u, myTeam)) nearMinion = u;
    } else if (inRange && (!tower || u.hp < tower.hp)) tower = u;
  }
  return (hero ?? minion ?? tower ?? nearHero ?? nearMinion)?.id ?? null;
}

/** Nearest enemy (optionally heroes only) within `range` mm of `me`. */
export function nearestEnemy(units: readonly Unit[], me: Unit, myTeam: number, range: number, heroesOnly: boolean): Unit | null {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const u of units) {
    if (u.id === me.id || !isEnemy(u, myTeam)) continue;
    if (heroesOnly && u.kind !== 'hero') continue;
    if (!heroesOnly && (u.kind === 'tower' || u.kind === 'core')) continue;
    const d = dist(u, me);
    if (d <= range && d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

/**
 * Smart-cast (tap): where to aim `aim` from `me` facing `facing` (rad). Returns a point in mm and a target id
 * (255 = none).
 */
export function smartAim(aim: AimSpec, units: readonly Unit[], me: Unit, myTeam: number, facing: number): { x: number; y: number; id: number } {
  const ahead = (k: number): { x: number; y: number; id: number } => ({ x: me.x + Math.cos(facing) * aim.range * k, y: me.y + Math.sin(facing) * aim.range * k, id: 0xff });
  if (aim.kind === 'self') return { x: me.x, y: me.y, id: 0xff };
  const reach = aim.kind === 'unit' ? aim.range + 3000 : aim.range * 1.3;
  let t = aim.smart !== 'none' ? nearestEnemy(units, me, myTeam, reach, true) : null;
  if (!t && aim.smart === 'any') t = nearestEnemy(units, me, myTeam, aim.range, false);
  if (aim.away) {
    // Hop Back: away from the nearest threat, else backwards.
    const th = nearestEnemy(units, me, myTeam, 8000, true);
    if (th) return { x: th.x, y: th.y, id: 0xff };
    return ahead(1);
  }
  if (t) return { x: t.x, y: t.y, id: aim.kind === 'unit' ? t.id : 0xff };
  return aim.kind === 'point' ? ahead(0.6) : ahead(1);
}

/** Screen-space pick: the unit whose projected point is nearest (x, y) px within `maxPx`; heroes win ties. */
export function pickNearest<T extends { id: number; kind: string }>(cands: readonly T[], project: (c: T) => { x: number; y: number; on: boolean }, sx: number, sy: number, maxPx = 42): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const c of cands) {
    const p = project(c);
    if (!p.on) continue;
    let d = Math.hypot(p.x - sx, p.y - sy);
    if (c.kind === 'hero') d -= 10;
    if (c.kind === 'tower' || c.kind === 'core') d -= 4;
    if (d < maxPx && d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
