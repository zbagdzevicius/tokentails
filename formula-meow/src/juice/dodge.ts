/**
 * DODGED! (iteration 4, F5; juice lane). Pure: projectile samples per frame in, one call out.
 *
 * A projectile *locks* on the player once it closes with an ETA under `DODGE.eta` (0.6 s). Its run *ends* when it
 * stops closing (it flew past) or leaves the list (despawned). A locked run that ended within `DODGE.near` (3 m) of
 * the player is a near miss; it becomes "DODGED!" only when no `hit` and no `blocked` landed on the player within
 * `DODGE.confirmTicks` (20) of the end, and at most once per `DODGE.cooldownTicks` (2 s). A shot that died in a wall
 * far away, or one that hit or bounced off a shield, says nothing.
 */
import type { RaceState } from '../types';

export const DODGE = { eta: 0.6, near: 3, confirmTicks: 20, cooldownTicks: 120 } as const;

export interface ProjSample {
  id: number;
  /** metres to the player */
  dist: number;
  /** seconds to reach the player, Infinity when it is not closing on them */
  eta: number;
}

interface Run {
  armed: boolean;
  minD: number;
  lastD: number;
  seen: number;
}

interface ProjLike {
  id?: number;
  kind: number;
  owner: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  target: number;
}

export class DodgeWatcher {
  private runs = new Map<number, Run>();
  private pending: number[] = [];
  private lastHit = -1e9;
  private lastCall = -1e9;
  private frame = 0;

  reset(): void {
    this.runs.clear();
    this.pending.length = 0;
    this.lastHit = this.lastCall = -1e9;
  }

  /** A `hit` or `blocked` on the player. */
  onHit(tick: number): void {
    this.lastHit = tick;
  }

  /** Feed this frame's samples; true when "DODGED!" should be called now. */
  step(tick: number, samples: readonly ProjSample[]): boolean {
    const f = ++this.frame;
    for (const s of samples) {
      let r = this.runs.get(s.id);
      if (!r) {
        r = { armed: false, minD: s.dist, lastD: s.dist, seen: f };
        this.runs.set(s.id, r);
      }
      r.seen = f;
      if (s.eta < DODGE.eta) r.armed = true;
      r.minD = Math.min(r.minD, s.dist);
      // flown past: it is opening up again
      if (r.armed && s.dist > r.minD + 0.25 && s.dist > r.lastD) {
        if (r.minD <= DODGE.near) this.pending.push(tick);
        r.armed = false;
      }
      r.lastD = s.dist;
    }
    for (const [id, r] of this.runs) {
      if (r.seen === f) continue;
      // gone: it ended where we last saw it
      if (r.armed && Math.min(r.minD, r.lastD) <= DODGE.near) this.pending.push(tick);
      this.runs.delete(id);
    }
    let call = false;
    while (this.pending.length && tick - this.pending[0] >= DODGE.confirmTicks) {
      const end = this.pending.shift()!;
      if (Math.abs(this.lastHit - end) <= DODGE.confirmTicks) continue;
      if (end - this.lastCall < DODGE.cooldownTicks) continue;
      this.lastCall = end;
      call = true;
    }
    return call;
  }
}

/**
 * Every projectile the player could dodge (not their own), with its distance and its ETA when it closes on them.
 * Fills `out` (no allocation once warm). Reads the items lane's plain-data slot like `core/hud/incoming.ts`.
 */
export function projSamples(st: RaceState, me: number, out: ProjSample[]): ProjSample[] {
  out.length = 0;
  const proj = (st.items as { s?: { proj?: ProjLike[] } } | undefined)?.s?.proj;
  const k = st.karts[me];
  if (!proj || !k || k.finished) return out;
  for (let i = 0; i < proj.length; i++) {
    const p = proj[i];
    if (p.owner === me) continue;
    const rx = k.x - p.x;
    const rz = k.z - p.z;
    const d = Math.sqrt(rx * rx + rz * rz);
    if (d > 70) continue;
    let eta = Infinity;
    if (d > 0.01) {
      const ux = rx / d;
      const uz = rz / d;
      const closing = p.vx * ux + p.vz * uz - (k.vx * ux + k.vz * uz);
      const sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      const homing = p.target === me && (p.kind === 1 || p.kind === 2);
      const aimed = sp > 1 && (p.vx * ux + p.vz * uz) / sp > 0.9;
      if ((homing || aimed) && closing > 0.5) eta = d / closing;
    } else eta = 0;
    out.push({ id: p.id ?? i, dist: d, eta });
  }
  return out;
}
