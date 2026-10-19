/**
 * Touch assists (fun plan F3), pure and unit-tested:
 * - lane magnet: a joystick direction within 25° of the lane under the hero snaps to the lane's direction;
 * - map edge: a stick goal past the playable edge or inside the enemy fountain is pulled back, and a goal that
 *   would not move the hero any more means "stop" (a held stick no longer grinds into a corner);
 * - auto-attack: standing still with no input, the nearest enemy minion in range (then a hero) is the target;
 * - target lock (GAPS A5): a tapped enemy hero (on the field or its portrait) stays the Attack button's and the smart
 *   casts' target for 5 s, or until it dies, hides or gets more than 9 m away.
 * All in sim mm and radians (0 = +x, counter-clockwise).
 */
import { FOUNTAIN, LANE_WAYPOINTS, MAP, mirrorX } from '../../data/map';
import { isEnemy, type Unit } from '../targeting';

export const ASSIST = Object.freeze({
  /** Snap when the stick is within this angle of the lane (rad). */
  magnetArc: (25 * Math.PI) / 180,
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

/** Auto-attack target: the lowest-health enemy minion in range, else the nearest enemy hero in range, else null. */
export function autoAttackTarget(units: readonly Unit[], me: Unit, myTeam: number, range: number): number | null {
  let minion: Unit | null = null;
  let hero: Unit | null = null;
  let heroD = Infinity;
  for (const u of units) {
    if (u.id === me.id || u.state === 'dead' || u.team === myTeam || u.team === 2) continue;
    const d = Math.hypot(u.x - me.x, u.y - me.y);
    if (d > range) continue;
    if (u.kind === 'minion') {
      if (!minion || u.hp < minion.hp) minion = u;
    } else if (u.kind === 'hero' && d < heroD) {
      hero = u;
      heroD = d;
    }
  }
  return minion?.id ?? hero?.id ?? null;
}

/** GAPS A5: how long a tap lock holds (ms) and how far the locked hero may get from the player (mm). */
export const LOCK = Object.freeze({ ms: 5000, rangeMm: 9000 });

/** Can the player lock `u`: a living, visible enemy hero within LOCK.rangeMm? */
export function lockable(u: Unit | null | undefined, me: Unit, myTeam: number): boolean {
  return !!u && u.kind === 'hero' && isEnemy(u, myTeam) && Math.hypot(u.x - me.x, u.y - me.y) <= LOCK.rangeMm;
}

/**
 * The touch target lock (GAPS A5). `set` locks a hero (a second tap on the locked hero lets go); `check` returns the
 * locked id while the lock holds and drops it once LOCK.ms passed, the hero died or left the snapshot (a bush), or
 * it is more than LOCK.rangeMm from the player. Client only: it only decides which id an Attack or Cast carries.
 */
export class TargetLock {
  id: number | null = null;
  private since = 0;

  /** Lock `id` at `now` (ms); a tap on the hero already locked releases it. Returns whether a lock is on. */
  set(id: number, now: number): boolean {
    if (this.id === id) {
      this.clear();
      return false;
    }
    this.id = id;
    this.since = now;
    return true;
  }

  clear(): void {
    this.id = null;
  }

  /** The locked id, or null (and the lock is dropped) when it no longer holds. */
  check(units: readonly Unit[], me: Unit | null, myTeam: number, now: number): number | null {
    if (this.id === null) return null;
    const u = units.find((q) => q.id === this.id);
    if (!me || me.state === 'dead' || now - this.since >= LOCK.ms || !lockable(u, me, myTeam)) {
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
