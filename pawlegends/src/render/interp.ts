/**
 * Snapshot buffer + interpolation (POC.md §3). No prediction in the POC: the LocalHost has no latency, so the view
 * runs a render clock a little behind the newest snapshot and blends the two around it. Positions stay in sim mm
 * (floats here; render only). Teleports (blink, respawn, fountain return) snap instead of sliding.
 */
import type { EntitySnap, ProjectileSnap, SimEvent, Snapshot, ZoneSnap } from '../sim/api';

/** How far behind the newest snapshot the view runs, in ticks. */
export const INTERP_LAG = 1.6;
/** A jump longer than this between two snapshots is drawn as a teleport (mm). */
export const TELEPORT_MM = 3500;
const KEEP = 12;
const TAU = Math.PI * 2;

export interface ViewEntity extends EntitySnap {
  /** Interpolated position (mm, float). */
  fx: number;
  fy: number;
  /** Interpolated facing (rad, 0 = +x, counter-clockwise from above). */
  yaw: number;
  /** Planar speed (mm per tick) between the two snapshots, for the walk cycle. */
  speed: number;
}

export interface ViewFrame {
  /** Fractional render tick. */
  tick: number;
  latest: Snapshot;
  entities: ViewEntity[];
  byId: Map<number, ViewEntity>;
  projectiles: (ProjectileSnap & { fx: number; fy: number })[];
  zones: ZoneSnap[];
}

export const facingToRad = (f: number): number => (f / 4096) * TAU;

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export class SnapBuffer {
  private snaps: Snapshot[] = [];
  private pendingEvents: SimEvent[] = [];
  /** Render clock in ticks (fractional). */
  renderTick = 0;
  speed = 1;

  get latest(): Snapshot | null {
    return this.snaps.length > 0 ? this.snaps[this.snaps.length - 1] : null;
  }

  reset(): void {
    this.snaps = [];
    this.pendingEvents = [];
    this.renderTick = 0;
  }

  push(s: Snapshot): void {
    const last = this.latest;
    if (last && s.clock.tick < last.clock.tick) this.snaps = [];
    if (last && s.clock.tick === last.clock.tick) this.snaps[this.snaps.length - 1] = s;
    else this.snaps.push(s);
    if (this.snaps.length > KEEP) this.snaps.splice(0, this.snaps.length - KEEP);
    if (this.snaps.length === 1) this.renderTick = s.clock.tick;
  }

  pushEvents(list: readonly SimEvent[]): void {
    for (const e of list) this.pendingEvents.push(e);
  }

  /** Events whose tick the render clock has reached (in order); removed from the queue. */
  takeEvents(out: SimEvent[] = []): SimEvent[] {
    const t = this.renderTick;
    let k = 0;
    for (; k < this.pendingEvents.length; k++) {
      if (this.pendingEvents[k].tick > t + 0.001) break;
      out.push(this.pendingEvents[k]);
    }
    if (k > 0) this.pendingEvents.splice(0, k);
    // Never let a backlog build up (a paused or hidden tab): fire anything older than a second at once.
    return out;
  }

  /**
   * Advance the render clock by `dt` seconds (scaled by `scale`: 0 freezes, for hitstop) and keep it near
   * newest − INTERP_LAG. Returns the interpolated frame, or null before the first snapshot.
   */
  advance(dt: number, scale = 1): ViewFrame | null {
    const last = this.latest;
    if (!last) return null;
    const target = last.clock.tick - INTERP_LAG * Math.max(1, this.speed * 0.5);
    this.renderTick += dt * 30 * this.speed * scale;
    const err = target - this.renderTick;
    if (Math.abs(err) > 30 * this.speed) this.renderTick = target;
    else this.renderTick += err * Math.min(1, dt * 6) * Math.min(1, scale);
    if (this.renderTick > last.clock.tick) this.renderTick = last.clock.tick;
    return this.sample(this.renderTick);
  }

  sample(t: number): ViewFrame | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    let b = n - 1;
    while (b > 0 && this.snaps[b - 1].clock.tick >= t) b--;
    const B = this.snaps[b];
    const A = b > 0 ? this.snaps[b - 1] : B;
    const span = B.clock.tick - A.clock.tick;
    const u = span > 0 ? Math.max(0, Math.min(1, (t - A.clock.tick) / span)) : 1;
    const prev = new Map<number, EntitySnap>();
    for (const e of A.entities) prev.set(e.id, e);
    const entities: ViewEntity[] = [];
    const byId = new Map<number, ViewEntity>();
    for (const e of B.entities) {
      const p = prev.get(e.id);
      let fx = e.x;
      let fy = e.y;
      let yaw = facingToRad(e.facing);
      let speed = 0;
      if (p) {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < TELEPORT_MM && p.state !== 'dead') {
          fx = p.x + dx * u;
          fy = p.y + dy * u;
          yaw = lerpAngle(facingToRad(p.facing), facingToRad(e.facing), u);
        }
        speed = span > 0 && d < TELEPORT_MM ? d / span : 0;
      }
      const v: ViewEntity = { ...e, fx, fy, yaw, speed };
      entities.push(v);
      byId.set(e.id, v);
    }
    const pPrev = new Map<number, ProjectileSnap>();
    for (const p of A.projectiles) pPrev.set(p.index, p);
    const projectiles = B.projectiles.map((p) => {
      const q = pPrev.get(p.index);
      if (q && q.owner === p.owner && Math.hypot(p.x - q.x, p.y - q.y) < TELEPORT_MM * 2) {
        return { ...p, fx: q.x + (p.x - q.x) * u, fy: q.y + (p.y - q.y) * u };
      }
      return { ...p, fx: p.x - p.vx * (1 - u), fy: p.y - p.vy * (1 - u) };
    });
    return { tick: t, latest: this.snaps[n - 1], entities, byId, projectiles, zones: B.zones };
  }
}
