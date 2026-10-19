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
  if (aim.smart === 'ally') {
    // Gabė's Wing Wrap (sim v9): the most hurt allied hero in range, else herself (the sim picks the ally nearest the point).
    let best: Unit | null = null;
    for (const u of units) {
      if (u.id === me.id || u.kind !== 'hero' || u.team !== myTeam || u.state === 'dead' || dist(u, me) > aim.range) continue;
      if (!best || u.hp / u.maxHp < best.hp / best.maxHp) best = u;
    }
    return best && best.hp < best.maxHp ? { x: best.x, y: best.y, id: 0xff } : { x: me.x, y: me.y, id: 0xff };
  }
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

/** Quick cast: how far (mm) from the cursor a unit-target ability still finds an enemy hero. */
export const QUICK_UNIT_SEEK = 3000;
/** A generic unit-target aim: what a unit-target quick cast at the cursor picks (hover's secondary ring). */
export const QUICK_UNIT_AIM: AimSpec = Object.freeze({ kind: 'unit', shape: 'none', range: 0, smart: 'hero' });

/**
 * Desktop cast at the cursor (quick cast on key press, or the hold-to-aim release): the point (mm) and target id a
 * cast command carries, or null when a unit-target ability has no enemy hero under or near the cursor (the cast is
 * refused, not wasted). Self casts go at the hero; directions toward the cursor; ground points at the cursor,
 * pulled in to the range when `clamp` (quick cast fires at once instead of walking in); unit aims at the enemy hero
 * under the cursor, else the one nearest the cursor within QUICK_UNIT_SEEK. No cursor on the ground: straight ahead
 * (+x), like the touch smart-cast fallback.
 */
export function cursorCast(aim: AimSpec, me: Unit, cursor: { x: number; y: number } | null, under: Unit | null, units: readonly Unit[], myTeam: number, clamp: boolean): { x: number; y: number; id: number } | null {
  if (aim.kind === 'self') return { x: me.x, y: me.y, id: 0xff };
  if (aim.kind === 'unit') {
    let t = under && under.kind === 'hero' && isEnemy(under, myTeam) ? under : null;
    if (!t && cursor) {
      let bd = QUICK_UNIT_SEEK;
      for (const u of units) {
        if (u.kind !== 'hero' || !isEnemy(u, myTeam)) continue;
        const d = dist(u, cursor);
        if (d < bd) {
          bd = d;
          t = u;
        }
      }
    }
    return t ? { x: t.x, y: t.y, id: t.id } : null;
  }
  const p = cursor ?? { x: me.x + Math.max(aim.range, 1000), y: me.y };
  if (aim.kind === 'point' && clamp) {
    const d = dist(p, me);
    if (d > aim.range && d > 0) {
      // a hair inside, so rounding never pushes it out of reach (Orders walks in past the range)
      const k = (aim.range - 5) / d;
      return { x: me.x + (p.x - me.x) * k, y: me.y + (p.y - me.y) * k, id: 0xff };
    }
  }
  return { x: p.x, y: p.y, id: 0xff };
}

/**
 * What the cursor hovers: the unit a click hits and how it relates to the player. `castId`: with no aim open, the
 * enemy hero a unit-target quick cast would pick instead, set only when that is a different unit (the cursor rests on
 * a minion, tower, camp or ally next to an enemy hero); it gets a thinner secondary ring.
 */
export interface HoverTarget {
  id: number;
  rel: 'enemy' | 'ally';
  castId?: number;
}

/**
 * The hover read for the cursor and the world ring (pure). Aiming a unit-target ability: the enemy hero cursorCast
 * would pick (under the cursor, else the nearest within QUICK_UNIT_SEEK). Aiming anything else: null (the reticle
 * shows where it lands). Otherwise the enemy under the cursor (what a right-click attacks), then an ally under it
 * (never the player's own hero). A unit-target quick cast only takes an enemy hero, so when the ringed unit is not
 * that hero, `castId` names the one cursorCast would pick (under the cursor, else the nearest within QUICK_UNIT_SEEK);
 * `quickUnit` false (the hero has no unit-target ability) leaves it out.
 */
export function hoverTarget(
  aim: AimSpec | null,
  me: Unit,
  cursor: { x: number; y: number } | null,
  underEnemy: Unit | null,
  underAlly: Unit | null,
  units: readonly Unit[],
  myTeam: number,
  quickUnit = true,
): HoverTarget | null {
  if (aim) {
    if (aim.kind !== 'unit') return null;
    const c = cursorCast(aim, me, cursor, underEnemy, units, myTeam, false);
    return c ? { id: c.id, rel: 'enemy' } : null;
  }
  let h: HoverTarget | null = null;
  if (underEnemy && isEnemy(underEnemy, myTeam)) h = { id: underEnemy.id, rel: 'enemy' };
  else if (underAlly && underAlly.id !== me.id && underAlly.team === myTeam && underAlly.state !== 'dead') h = { id: underAlly.id, rel: 'ally' };
  if (!h || !quickUnit) return h;
  const q = cursorCast(QUICK_UNIT_AIM, me, cursor, underEnemy, units, myTeam, false);
  if (q && q.id !== h.id) h.castId = q.id;
  return h;
}
