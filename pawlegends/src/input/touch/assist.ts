/**
 * Touch assists (fun plan F3), pure and unit-tested:
 * - lane magnet: a joystick direction within 8° of the lane under the hero snaps to the lane's direction, only at
 *   full tilt and with no enemy hero within 8 m (C8; 25° and always before);
 * - map edge: a stick goal past the playable edge or inside the enemy fountain is pulled back, and a goal that
 *   would not move the hero any more means "stop" (a held stick no longer grinds into a corner);
 * - auto-attack: standing still with no input, the nearest enemy minion in range (then a hero) is the target;
 * - target lock (GAPS A5): a tapped enemy hero (on the field or its portrait) stays the Attack button's and the smart
 *   casts' target for 5 s, or until it dies, hides or gets more than 9 m away.
 * All in sim mm and radians (0 = +x, counter-clockwise).
 */
import { CANNON } from '../../data/fun';
import { FOUNTAIN, LANE_WAYPOINTS, MAP, mirrorX } from '../../data/map';
import { ATTACK_SEEK_MM, attackPreview, CHASE_LEEWAY_MM, edgeGap, inAttackReach, isEnemy, type Unit } from '../targeting';
import type { TargetFirst } from '../presets';

export const ASSIST = Object.freeze({
  /** Snap when the stick is within this angle of the lane (rad). C8: 8° (25° before: it fought small corrections). */
  magnetArc: (8 * Math.PI) / 180,
  /** C8: the magnet only works at this much tilt (share of the stick radius) or more. */
  magnetTilt: 0.9,
  /** C8: and never with an enemy hero this close (mm): fights need the exact angle. */
  magnetFoeMm: 8000,
  /** Only when the hero is this close to the lane's centre line (mm). */
  magnetRange: 6000,
  /** Keep goals this far inside the map (mm). */
  edge: 700,
  /** Keep this far outside the enemy fountain (mm). */
  fountainPad: 1500,
  /** A goal closer than this to the hero is a stop (mm). */
  minStep: 450,
  /** Idle time before the auto-attack (ms). */
  idleMs: 600,
});

type Seg = readonly [number, number, number, number];

/** Both lanes, core to core, as segments. */
export const LANE_SEGMENTS: readonly Seg[] = (() => {
  const out: Seg[] = [];
  for (const lane of ['sunny', 'puddle'] as const) {
    const half = LANE_WAYPOINTS[lane].map(([x, y]) => [x, y] as const);
    const full = [...half, ...[...half].reverse().map(([x, y]) => [mirrorX(x), y] as const)];
    for (let i = 0; i + 1 < full.length; i++) {
      const [x0, y0] = full[i];
      const [x1, y1] = full[i + 1];
      if (x0 !== x1 || y0 !== y1) out.push([x0, y0, x1, y1]);
    }
  }
  return Object.freeze(out);
})();

const angDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

/** The stick angle, snapped to the lane under the hero when it is close enough to the lane's direction. */
export function laneMagnet(x: number, y: number, angle: number, segs: readonly Seg[] = LANE_SEGMENTS): number {
  let best: { d: number; a: number } | null = null;
  for (const [x0, y0, x1, y1] of segs) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
    const d = Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
    if (d > ASSIST.magnetRange) continue;
    const fwd = Math.atan2(dy, dx);
    for (const a of [fwd, fwd + Math.PI]) {
      const diff = angDiff(angle, a);
      if (diff <= ASSIST.magnetArc && (!best || diff + d / 1e6 < best.d)) best = { d: diff + d / 1e6, a };
    }
  }
  return best ? Math.atan2(Math.sin(best.a), Math.cos(best.a)) : angle;
}

/** C8: is the lane magnet on (full tilt, no enemy hero within ASSIST.magnetFoeMm)? */
export function magnetOn(tilt: number, me: { x: number; y: number }, units: readonly Unit[], myTeam: number): boolean {
  if (tilt < ASSIST.magnetTilt) return false;
  for (const u of units) {
    if (u.kind === 'hero' && u.team !== myTeam && u.team !== 2 && u.state !== 'dead' && Math.hypot(u.x - me.x, u.y - me.y) <= ASSIST.magnetFoeMm) return false;
  }
  return true;
}

/** A stick goal kept inside the map and out of the enemy fountain; null = do not move (already at the edge). */
export function edgeGoal(meX: number, meY: number, tx: number, ty: number, myTeam: number): { x: number; y: number } | null {
  let x = Math.max(ASSIST.edge, Math.min(MAP.width - ASSIST.edge, tx));
  let y = Math.max(ASSIST.edge, Math.min(MAP.height - ASSIST.edge, ty));
  const fx = myTeam === 0 ? mirrorX(FOUNTAIN.x) : FOUNTAIN.x;
  const fy = FOUNTAIN.y;
  const r = FOUNTAIN.radius + ASSIST.fountainPad;
  const d = Math.hypot(x - fx, y - fy);
  if (d < r) {
    // push the goal out to the fountain's edge, on the hero's side
    const ux = d > 1 ? (x - fx) / d : meX < fx ? -1 : 1;
    const uy = d > 1 ? (y - fy) / d : 0;
    x = fx + ux * r;
    y = fy + uy * r;
  }
  if (Math.hypot(x - meX, y - meY) < ASSIST.minStep) return null;
  return { x, y };
}

/**
 * Sim v25 QA re-run (founder: the toys are "hard to navigate through"): the touch stick's look-ahead goal never rests on
 * a Kibble Cannon lying on the ground. The sim lets a walking hero take the cannon when its goal is within CANNON.aim of
 * it (a tap on the cannon), so a stick goal sweeping over the cannon took it on every stick walk 0–0.6 m off its centre.
 * Here the look-ahead is stepped further along the stick until the goal is `clear` from the cannon: a stick walk over it
 * passes, and letting the stick go on the gold ring (a Stop) takes it, as a tap on it does. Input only (no sim change).
 */
export const STICK_CANNON = Object.freeze({ clear: CANNON.aim + 300, step: 250, max: 5000 });

/** The stick's look-ahead (mm) from (x, y) at angle `a`: `ahead`, or past a grounded cannon at `cannon` (null: none). */
export function stickAhead(x: number, y: number, a: number, ahead: number, cannon: { x: number; y: number } | null): number {
  if (!cannon) return ahead;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const clear2 = STICK_CANNON.clear * STICK_CANNON.clear;
  let d = ahead;
  while (d < STICK_CANNON.max && (x + c * d - cannon.x) ** 2 + (y + s * d - cannon.y) ** 2 < clear2) d += STICK_CANNON.step;
  return d;
}

/**
 * Founder bug 2026-11-08 ("close to impossible to basic attack a champ while chasing"): with the joystick held toward
 * the target and ATK pressed, every stick move replaced the Attack order and cancelled its windup in the sim, so the
 * swing never landed. While the Attack order holds (AttackYield: held ATK or a tap, V20-CHASE.md I3) a stick within
 * `turn` of the bearing to the attack target sends no move: the Attack order chases and swings (Wild Rift: an attack
 * order keeps its target until it dies, becomes untargetable or a new command is given). A stick pointing away
 * (retreat, kite) still moves at once.
 */
export const STICK_YIELD = Object.freeze({ turn: Math.PI / 2 });

/** Does a stick at angle `a` (rad, sim convention) from (x, y) point toward `target` (within STICK_YIELD.turn)? */
export function stickTowardTarget(x: number, y: number, a: number, target: { x: number; y: number }): boolean {
  const dx = target.x - x;
  const dy = target.y - y;
  if (dx === 0 && dy === 0) return true;
  const d = Math.abs(Math.atan2(dy, dx) - a) % (Math.PI * 2);
  return (d > Math.PI ? Math.PI * 2 - d : d) <= STICK_YIELD.turn;
}

/**
 * Auto-attack target, in range only (it never walks the hero). Audit CF-02: the same order as the Attack button and
 * its Settings "Target first" (it was minion first while Attack was hero first, so the two disagreed): 'heroes' takes
 * the enemy hero in range with the lowest HP share, else the lowest-HP minion; 'lowest' the lowest HP share of
 * either; 'closest' the nearest. C13: edge to edge (the target's body is subtracted), like the Attack button.
 */
export function autoAttackTarget(
  units: readonly Unit[],
  me: Unit,
  myTeam: number,
  range: number,
  first: TargetFirst = 'heroes',
  /** UX pass 2: the Attack button's last-hit estimate: with it, the idle pick is the Attack button's own pick. */
  killDmg?: (u: Unit) => number,
  /** UX pass 2: the touch lock (the Attack button's first pick while it holds). */
  locked: number | null = null,
): number | null {
  if (killDmg) {
    // UX pass 2: the idle auto-attack hits only the unit ATK rings (attackPreview, the tap's own pick) and only while
    // it is in reach (`range` carries this caller's 300 mm slack): never a different unit than the ring (a far
    // last-hit or a locked hero out of reach rings, and standing idle then waits), never a structure or a camp
    const id = attackPreview(units, me, myTeam, range - CHASE_LEEWAY_MM, first, killDmg, locked);
    const u = id !== null ? units.find((q) => q.id === id) : undefined;
    return u && (u.kind === 'hero' || u.kind === 'minion') && inAttackReach(u, me, range - CHASE_LEEWAY_MM) ? u.id : null;
  }
  let minion: Unit | null = null;
  let hero: Unit | null = null;
  let lowest: Unit | null = null;
  let closest: Unit | null = null;
  let closestD = Infinity;
  for (const u of units) {
    if (u.id === me.id || u.state === 'dead' || u.team === myTeam || u.team === 2) continue;
    if (u.kind !== 'minion' && u.kind !== 'hero') continue;
    const d = edgeGap(me, u);
    if (d > range) continue;
    if (u.kind === 'minion') {
      if (!minion || u.hp < minion.hp) minion = u;
    } else if (!hero || u.hp / Math.max(1, u.maxHp) < hero.hp / Math.max(1, hero.maxHp)) hero = u;
    if (!lowest || u.hp / Math.max(1, u.maxHp) < lowest.hp / Math.max(1, lowest.maxHp)) lowest = u;
    if (d < closestD) {
      closestD = d;
      closest = u;
    }
  }
  if (first === 'lowest') return lowest?.id ?? null;
  if (first === 'closest') return closest?.id ?? null;
  return hero?.id ?? minion?.id ?? null;
}

/** GAPS A5: how long a tap lock holds (ms) and how far the locked hero may get from the player (mm). */
export const LOCK = Object.freeze({ ms: 5000, rangeMm: 9000 });

/** Can the player lock `u`: a living, visible enemy hero within LOCK.rangeMm? */
export function lockable(u: Unit | null | undefined, me: Unit, myTeam: number): boolean {
  return !!u && u.kind === 'hero' && isEnemy(u, myTeam) && Math.hypot(u.x - me.x, u.y - me.y) <= LOCK.rangeMm;
}

/** Feel pass B4: how far (mm) past the attack range a lock holds once reached: melee 1 m, ranged 2 m. */
export const LOCK_BREAK = Object.freeze({ melee: 1000, ranged: 2000, meleeRange: 2500 });
export const lockBreakMm = (range: number): number => range + (range <= LOCK_BREAK.meleeRange ? LOCK_BREAK.melee : LOCK_BREAK.ranged);

/**
 * The touch target lock (GAPS A5). `set` locks a hero (a second tap on the locked hero lets go); `check` returns the
 * locked id while the lock holds and drops it once LOCK.ms passed, the hero died or left the snapshot (a bush), or
 * it is more than LOCK.rangeMm from the player. Client only: it only decides which id an Attack or Cast carries.
 */
export class TargetLock {
  id: number | null = null;
  private since = 0;
  /** Feel pass B4: the locked hero has been within the break distance since the lock (so leaving it breaks the lock). */
  private reached = false;

  /** Lock `id` at `now` (ms); a tap on the hero already locked releases it. Returns whether a lock is on. */
  set(id: number, now: number): boolean {
    if (this.id === id) {
      this.clear();
      return false;
    }
    this.id = id;
    this.since = now;
    this.reached = false;
    return true;
  }

  clear(): void {
    this.id = null;
  }

  /**
   * The locked id, or null (and the lock is dropped) when it no longer holds. Feel pass B4 `breakMm` (the attack range
   * + 1 m melee, + 2 m ranged): once the locked hero has been that close, it breaking away past it ends the lock.
   */
  check(units: readonly Unit[], me: Unit | null, myTeam: number, now: number, breakMm = Infinity): number | null {
    if (this.id === null) return null;
    const u = units.find((q) => q.id === this.id);
    if (!me || me.state === 'dead' || now - this.since >= LOCK.ms || !lockable(u, me, myTeam)) {
      this.clear();
      return null;
    }
    // V20-CHASE.md I1: edge to edge, like every other reach check
    const d = edgeGap(me, u!);
    if (d <= breakMm) this.reached = true;
    else if (this.reached) {
      this.clear();
      return null;
    }
    return this.id;
  }

  /** Share of the lock's time left, 1..0 (0 when none). */
  left(now: number): number {
    return this.id === null ? 0 : Math.max(0, Math.min(1, 1 - (now - this.since) / LOCK.ms));
  }
}

/**
 * V20-CHASE.md I3 (Wild Rift tap-to-attack: the order keeps its target "until it dies, becomes untargetable, or a new
 * command is given"): the unit the newest ATK press (tap or hold) ordered an attack on, while that order stands. The
 * stick yields to it (STICK_YIELD) for as long as `check` returns it: it lets go when the unit dies or leaves the
 * snapshot, when it is further than the tap's walk-in reach (ATTACK_SEEK_MM), or once it was within the lock-break
 * distance (lockBreakMm, edge to edge) and then broke away past it. A move the player sends (the stick turned away)
 * or a skill press clears it (TouchControls). There is no timer: a tap holds like a hold.
 */
export class AttackYield {
  id: number | null = null;
  private reached = false;

  set(id: number | null): void {
    if (id !== this.id) this.reached = false;
    this.id = id;
  }

  clear(): void {
    this.id = null;
    this.reached = false;
  }

  check(units: readonly Unit[], me: Unit | null, myTeam: number, range: number): number | null {
    if (this.id === null) return null;
    const u = units.find((q) => q.id === this.id);
    if (!me || me.state === 'dead' || !u || !isEnemy(u, myTeam)) {
      this.clear();
      return null;
    }
    const gap = edgeGap(me, u);
    if (gap <= lockBreakMm(range)) this.reached = true;
    else if (this.reached || gap > ATTACK_SEEK_MM) {
      this.clear();
      return null;
    }
    return this.id;
  }
}

/**
 * V20-CHASE.md I2 (Wild Rift: the attack order keeps its champion): the ATK repeat (held) or a new press keeps the
 * enemy hero it is already attacking while that hero is alive, visible and within the lock-break distance (edge to
 * edge), so no last hit, minion or tower guard steals the chase. Null when there is no such hero (re-pick as usual).
 */
export function stickyAttackTarget(units: readonly Unit[], me: Unit, myTeam: number, range: number, held: number | null): number | null {
  if (held === null) return null;
  const u = units.find((q) => q.id === held);
  if (!u || u.kind !== 'hero' || !isEnemy(u, myTeam)) return null;
  return edgeGap(me, u) <= lockBreakMm(range) ? held : null;
}
