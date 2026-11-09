/**
 * Snapshot buffer + interpolation (POC.md §3). No prediction in the POC: the LocalHost has no latency, so the view
 * runs a render clock a little behind the newest snapshot and blends the two around it. Positions stay in sim mm
 * (floats here; render only). Teleports (blink, respawn, fountain return) snap instead of sliding.
 */
import type { EntitySnap, ProjectileSnap, SimEvent, Snapshot, ZoneSnap } from '../sim/api';

/** How far behind the newest snapshot the view runs, in ticks. */
export const INTERP_LAG = 1.6;
/**
 * C6: the player's own hero runs this far behind (ticks) instead: the LocalHost has no latency, so the newest
 * snapshot is the truth and the own hero reacts to the stick ~40 ms sooner, with no extrapolation (no rubber-band).
 */
export const SELF_LAG = 0.3;
/** A jump longer than this between two snapshots is drawn as a teleport (mm). */
export const TELEPORT_MM = 3500;
const KEEP = 12;
/** Entity ids and projectile indices below this use the index tables in `sample` (wire ids are one byte). */
const ID_TABLE = 1024;
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
  /** C6: the own hero's entity id (−1: none, every entity at the shared lag). */
  selfId = -1;

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
   * Events not fired yet whose tick is within `horizonTicks` of the render clock, in order (read-only: nothing is
   * removed; `out` is cleared and reused). The animation director binds clips to them a few frames ahead
   * (ANIM-SPEC §4.1: ≈ INTERP_LAG ticks of lookahead).
   */
  peekEvents(horizonTicks: number, out: SimEvent[]): SimEvent[] {
    out.length = 0;
    const t = this.renderTick + horizonTicks;
    for (let k = 0; k < this.pendingEvents.length; k++) {
      const e = this.pendingEvents[k];
      if (e.tick > t + 0.001) break;
      out.push(e);
    }
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
    const f = this.sample(this.renderTick);
    if (f && this.selfId >= 0) {
      const ahead = (INTERP_LAG - SELF_LAG) * Math.max(1, this.speed * 0.5);
      this.sampleSelf(f, Math.min(last.clock.tick, this.renderTick + ahead));
    }
    return f;
  }

  /** C6: move the own hero in `f` to its place at tick `t` (position, facing and speed only; the rest stays at `f.tick`). */
  sampleSelf(f: ViewFrame, t: number): void {
    const v = f.byId.get(this.selfId);
    if (!v || v.state === 'dead') return;
    const n = this.snaps.length;
    let b = n - 1;
    while (b > 0 && this.snaps[b - 1].clock.tick >= t) b--;
    const B = this.snaps[b];
    const A = b > 0 ? this.snaps[b - 1] : B;
    const e = findId(B.entities, this.selfId);
    const p = findId(A.entities, this.selfId);
    if (!e || e.state === 'dead') return;
    const span = B.clock.tick - A.clock.tick;
    const u = span > 0 ? Math.max(0, Math.min(1, (t - A.clock.tick) / span)) : 1;
    let fx = e.x;
    let fy = e.y;
    let yaw = facingToRad(e.facing);
    if (p && p.state !== 'dead') {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= TELEPORT_MM) return;
      fx = p.x + dx * u;
      fy = p.y + dy * u;
      yaw = lerpAngle(facingToRad(p.facing), facingToRad(e.facing), u);
      v.speed = span > 0 ? d / span : 0;
    }
    // a teleport between the shared sample and this one (a blink just now): keep the shared sample, the snap comes next
    const jx = fx - v.fx;
    const jy = fy - v.fy;
    if (jx * jx + jy * jy >= TELEPORT_MM * TELEPORT_MM) return;
    v.fx = fx;
    v.fy = fy;
    v.yaw = yaw;
  }

  /**
   * PERF-IOS §8 Track B: the previous snapshot's entities by id (ids are slot indices, one byte on the wire) through a
   * stamped index table instead of a Map rebuilt every frame; a Map stays as the fallback for ids past the table.
   */
  private readonly prevIdx = new Int32Array(ID_TABLE);
  private readonly prevStamp = new Int32Array(ID_TABLE);
  private readonly prevBig = new Map<number, EntitySnap>();
  private readonly projIdx = new Int32Array(ID_TABLE);
  private readonly projStamp = new Int32Array(ID_TABLE);
  private readonly projBig = new Map<number, ProjectileSnap>();
  /**
   * One ViewEntity record per entity id, reused every frame (a `{ ...e }` per entity per frame was ~0.7 MB/s of
   * garbage); it is also the frame's `byId`. Readers keep only the latest frame (gameView, the director,
   * matchSession.frameNow), so the records always hold the latest sample. Ids missing from a sample leave the map.
   */
  private readonly pool = new Map<number, ViewEntity>();
  private poolStamp = 0;
  private readonly seen = new Map<number, number>();
  private readonly projPool: ViewProjectile[] = [];
  /** The frame record, reused every frame (its arrays too). */
  private shell: ViewFrame | null = null;

  sample(t: number): ViewFrame | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    let b = n - 1;
    while (b > 0 && this.snaps[b - 1].clock.tick >= t) b--;
    const B = this.snaps[b];
    const A = b > 0 ? this.snaps[b - 1] : B;
    const span = B.clock.tick - A.clock.tick;
    const u = span > 0 ? Math.max(0, Math.min(1, (t - A.clock.tick) / span)) : 1;
    const stamp = ++this.poolStamp;
    const prevIdx = this.prevIdx;
    const prevStamp = this.prevStamp;
    const prevBig = this.prevBig;
    if (prevBig.size) prevBig.clear();
    const aEnts = A.entities;
    for (let i = 0; i < aEnts.length; i++) {
      const id = aEnts[i].id;
      if (id >= 0 && id < ID_TABLE) {
        prevIdx[id] = i;
        prevStamp[id] = stamp;
      } else prevBig.set(id, aEnts[i]);
    }
    let f = this.shell;
    if (!f) {
      f = { tick: t, latest: this.snaps[n - 1], entities: [], byId: this.pool, projectiles: [], zones: B.zones };
      this.shell = f;
    }
    const entities = f.entities;
    entities.length = 0;
    const pool = this.pool;
    const seen = this.seen;
    const ents = B.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      const id = e.id;
      const p = id >= 0 && id < ID_TABLE ? (prevStamp[id] === stamp ? aEnts[prevIdx[id]] : undefined) : prevBig.get(id);
      let fx = e.x;
      let fy = e.y;
      let yaw = facingToRad(e.facing);
      let speed = 0;
      if (p) {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < TELEPORT_MM && p.state !== 'dead') {
          fx = p.x + dx * u;
          fy = p.y + dy * u;
          yaw = lerpAngle(facingToRad(p.facing), facingToRad(e.facing), u);
        }
        speed = span > 0 && d < TELEPORT_MM ? d / span : 0;
      }
      let v = pool.get(id);
      if (!v) {
        v = blankView();
        pool.set(id, v);
      }
      // the doubles are stored here, not passed: a call that is not inlined boxes each double argument
      copySnap(v, e);
      v.fx = fx;
      v.fy = fy;
      v.yaw = yaw;
      v.speed = speed;
      seen.set(id, stamp);
      entities.push(v);
    }
    // ids gone from this sample leave the map (a minion that died gets a fresh record if its id comes back)
    if (pool.size > ents.length) {
      this.pruneStamp = stamp;
      pool.forEach(this.prune);
    }
    const projIdx = this.projIdx;
    const projStamp = this.projStamp;
    const projBig = this.projBig;
    if (projBig.size) projBig.clear();
    const ap = A.projectiles;
    for (let i = 0; i < ap.length; i++) {
      const ix = ap[i].index;
      if (ix >= 0 && ix < ID_TABLE) {
        projIdx[ix] = i;
        projStamp[ix] = stamp;
      } else projBig.set(ix, ap[i]);
    }
    const projectiles = f.projectiles as ViewProjectile[];
    const bp = B.projectiles;
    projectiles.length = 0;
    while (this.projPool.length < bp.length) this.projPool.push(new ProjRecord());
    for (let i = 0; i < bp.length; i++) {
      const p = bp[i];
      const o = this.projPool[i];
      o.index = p.index;
      o.team = p.team;
      o.owner = p.owner;
      o.x = p.x;
      o.y = p.y;
      o.vx = p.vx;
      o.vy = p.vy;
      o.kind = p.kind;
      const ix = p.index;
      const q = ix >= 0 && ix < ID_TABLE ? (projStamp[ix] === stamp ? ap[projIdx[ix]] : undefined) : projBig.get(ix);
      const qx = q ? p.x - q.x : 0;
      const qy = q ? p.y - q.y : 0;
      if (q && q.owner === p.owner && Math.sqrt(qx * qx + qy * qy) < TELEPORT_MM * 2) {
        o.fx = q.x + qx * u;
        o.fy = q.y + qy * u;
      } else {
        o.fx = p.x - p.vx * (1 - u);
        o.fy = p.y - p.vy * (1 - u);
      }
      projectiles.push(o);
    }
    f.tick = t;
    f.latest = this.snaps[n - 1];
    f.zones = B.zones;
    return f;
  }

  private pruneStamp = 0;
  private readonly prune = (_v: ViewEntity, id: number): void => {
    if (this.seen.get(id) !== this.pruneStamp) {
      this.pool.delete(id);
      this.seen.delete(id);
    }
  };
}

function findId(list: readonly EntitySnap[], id: number): EntitySnap | undefined {
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return undefined;
}

type ViewProjectile = ProjectileSnap & { fx: number; fy: number };

/**
 * A pooled ViewEntity: every EntitySnap field, so all records share one shape (absent optional fields are
 * `undefined`). A class, not an object literal: literals with the same leading keys share V8's map tree, and one
 * non-number stored there elsewhere would make every double store here allocate a box.
 */
class ViewRecord {
  id = 0;
  kind: EntitySnap['kind'] = 'minion';
  team: EntitySnap['team'] = 0;
  slot = 0;
  hero: EntitySnap['hero'] = undefined;
  level: number | undefined = undefined;
  variant: string | undefined = undefined;
  lane: EntitySnap['lane'] = undefined;
  x = 0;
  y = 0;
  hp = 0;
  maxHp = 0;
  shield = 0;
  state: EntitySnap['state'] = 'idle';
  facing = 0;
  buffs = 0;
  cooldowns: EntitySnap['cooldowns'] = undefined;
  respawnIn: number | undefined = undefined;
  xp: number | undefined = undefined;
  talents: EntitySnap['talents'] = undefined;
  resource: number | undefined = undefined;
  branch: boolean | undefined = undefined;
  charged: boolean | undefined = undefined;
  charging: boolean | undefined = undefined;
  lockout: number | undefined = undefined;
  charmed: boolean | undefined = undefined;
  form: boolean | undefined = undefined;
  channel: boolean | undefined = undefined;
  stacks: number | undefined = undefined;
  dots: number | undefined = undefined;
  fish: number | undefined = undefined;
  toy: number | undefined = undefined;
  bountyStreak: number | undefined = undefined;
  sub: EntitySnap['sub'] = undefined;
  fx = 0.5;
  fy = 0.5;
  yaw = 0.5;
  speed = 0.5;
}
const blankView = (): ViewEntity => new ViewRecord();

class ProjRecord {
  index = 0;
  team: ProjectileSnap['team'] = 0;
  owner = -1;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  kind = 0;
  fx = 0.5;
  fy = 0.5;
}

/** `v` becomes `{ ...e, fx, fy, yaw, speed }` without a new object. Exported for the pooling test. */
export function copyView(v: ViewEntity, e: EntitySnap, fx: number, fy: number, yaw: number, speed: number): ViewEntity {
  copySnap(v, e);
  v.fx = fx;
  v.fy = fy;
  v.yaw = yaw;
  v.speed = speed;
  return v;
}

/** Every EntitySnap field of `e` onto `v` (absent optional fields become `undefined`). */
function copySnap(v: ViewEntity, e: EntitySnap): void {
  v.id = e.id;
  v.kind = e.kind;
  v.team = e.team;
  v.slot = e.slot;
  v.hero = e.hero;
  v.level = e.level;
  v.variant = e.variant;
  v.lane = e.lane;
  v.x = e.x;
  v.y = e.y;
  v.hp = e.hp;
  v.maxHp = e.maxHp;
  v.shield = e.shield;
  v.state = e.state;
  v.facing = e.facing;
  v.buffs = e.buffs;
  v.cooldowns = e.cooldowns;
  v.respawnIn = e.respawnIn;
  v.xp = e.xp;
  v.talents = e.talents;
  v.resource = e.resource;
  v.branch = e.branch;
  v.charged = e.charged;
  v.charging = e.charging;
  v.lockout = e.lockout;
  v.charmed = e.charmed;
  v.form = e.form;
  v.channel = e.channel;
  v.stacks = e.stacks;
  v.dots = e.dots;
  v.fish = e.fish;
  v.toy = e.toy;
  v.bountyStreak = e.bountyStreak;
  v.sub = e.sub;
}
