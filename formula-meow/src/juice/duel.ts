/**
 * Pack racing you can feel (iteration 4, F5; juice lane). Pure helpers, unit-tested in juice.test.ts:
 *
 * - `raceGaps`: on the final lap, the time to the cat ahead and the cat behind (the distance between the two karts
 *   along the race divided by the chaser's speed, so "0.4 s" is how long the chaser needs to get there).
 * - `GapSmoother`: eases a gap over `DUEL.tau` (0.3 s) so the chip does not flicker; it snaps when the rival changes.
 * - `duelGlow`: red DEFEND (a cat within 0.5 s behind) or gold CATCH (within 0.5 s ahead); the nearer one wins.
 * - `duelTension`: 0..1 for the heartbeat layer (1 = a cat right on you).
 * - `DramaCalls`: COMEBACK! (3+ places gained on the final lap), Hold on! (leading the final lap with a cat within
 *   0.3 s behind), STOLEN AT THE LINE! (a better place at the line than one second before it) and the one-beat music
 *   drop on taking P1 in the final lap.
 * - `FastestLap`: the player's new best lap is the fastest any cat has run this race.
 * - `PassZips`: a short panned zip for each close pass (silent until GO + 3 s).
 */
import type { KartState, RaceState } from '../types';

export const DUEL = {
  /** gap smoothing time constant, s */
  tau: 0.3,
  /** edge glow within this gap, s */
  glow: 0.5,
  /** "Hold on!" within this gap behind, s */
  holdOn: 0.3,
  /** chips show from this gap down, s (beyond it the cat is out of reach) */
  show: 5,
} as const;

export interface Gaps {
  /** seconds to the cat one place ahead (null: none) */
  ahead: number | null;
  behind: number | null;
  aheadKart: number;
  behindKart: number;
}

const speed = (k: KartState) => Math.sqrt(k.vx * k.vx + k.vz * k.vz);

/** The gaps to the cats one place ahead and one place behind (still racing, not out), in seconds. */
export function raceGaps(st: Pick<RaceState, 'karts'>, me: number, out?: Gaps): Gaps {
  const g = out ?? { ahead: null, behind: null, aheadKart: -1, behindKart: -1 };
  g.ahead = g.behind = null;
  g.aheadKart = g.behindKart = -1;
  const k = st.karts[me];
  if (!k) return g;
  for (let i = 0; i < st.karts.length; i++) {
    if (i === me) continue;
    const o = st.karts[i];
    if (o.out) continue;
    if (o.place === k.place - 1 && !o.finished) {
      g.ahead = Math.max(0, o.dist - k.dist) / Math.max(6, speed(k));
      g.aheadKart = i;
    } else if (o.place === k.place + 1 && !o.finished) {
      g.behind = Math.max(0, k.dist - o.dist) / Math.max(6, speed(o));
      g.behindKart = i;
    }
  }
  return g;
}

/** Eases a gap over `tau` seconds (exponential); a new rival or a missing one resets it. */
export class GapSmoother {
  value: number | null = null;
  private kart = -1;

  constructor(private readonly tau: number = DUEL.tau) {}

  reset(): void {
    this.value = null;
    this.kart = -1;
  }

  step(target: number | null, kart: number, dt: number): number | null {
    if (target == null) {
      this.value = null;
      this.kart = -1;
      return null;
    }
    if (this.value == null || kart !== this.kart) {
      this.value = target;
      this.kart = kart;
      return target;
    }
    const a = 1 - Math.exp(-Math.max(0, dt) / this.tau);
    this.value += (target - this.value) * a;
    return this.value;
  }
}

export type Glow = 'defend' | 'catch' | null;

export function duelGlow(ahead: number | null, behind: number | null): Glow {
  const b = behind != null && behind <= DUEL.glow ? behind : Infinity;
  const a = ahead != null && ahead <= DUEL.glow ? ahead : Infinity;
  if (b === Infinity && a === Infinity) return null;
  return b <= a ? 'defend' : 'catch';
}

/** 0..1: how close the nearest cat is (1 at 0 s, 0 from 1.5 s). */
export function duelTension(ahead: number | null, behind: number | null): number {
  const g = Math.min(ahead ?? Infinity, behind ?? Infinity);
  return g === Infinity ? 0 : Math.max(0, Math.min(1, 1 - g / 1.5));
}

/** "+0.4 s" for the cat ahead, "−0.3 s" for the cat behind (one decimal). */
export function fmtGap(sec: number, ahead: boolean): string {
  return `${ahead ? '+' : '−'}${Math.abs(sec).toFixed(1)} s`;
}

export type DramaCall = 'comeback' | 'holdOn' | 'drop' | 'stolen';

/** The final-lap calls. Feed it every frame (place) and the finish; it answers each call at most as often as allowed. */
export class DramaCalls {
  private finalAt = -1;
  private startPlace = 0;
  private comebackSaid = false;
  private lastHold = -1e9;
  private lastDrop = -1e9;
  private prevPlace = 0;
  /** the place one second ago: a ring of the last 64 frames' (tick, place) */
  private hist: Array<{ tick: number; place: number }> = [];

  reset(): void {
    this.finalAt = -1;
    this.startPlace = 0;
    this.comebackSaid = false;
    this.lastHold = this.lastDrop = -1e9;
    this.prevPlace = 0;
    this.hist.length = 0;
  }

  get finalLap(): boolean {
    return this.finalAt >= 0;
  }

  onFinalLap(tick: number, place: number): void {
    if (this.finalAt >= 0) return;
    this.finalAt = tick;
    this.startPlace = place;
  }

  /** Every frame while racing. `behind`: the smoothed gap to the cat behind (s). */
  step(tick: number, place: number, behind: number | null): DramaCall[] {
    const out: DramaCall[] = [];
    this.hist.push({ tick, place });
    while (this.hist.length > 2 && tick - this.hist[1].tick >= 60) this.hist.shift();
    const prev = this.prevPlace;
    this.prevPlace = place;
    if (this.finalAt < 0) return out;
    if (!this.comebackSaid && this.startPlace - place >= 3) {
      this.comebackSaid = true;
      out.push('comeback');
    }
    if (place === 1 && prev > 1 && tick - this.lastDrop >= 180) {
      this.lastDrop = tick;
      out.push('drop');
    }
    if (place === 1 && behind != null && behind <= DUEL.holdOn && tick - this.finalAt >= 180 && tick - this.lastHold >= 360) {
      this.lastHold = tick;
      out.push('holdOn');
    }
    return out;
  }

  /** The player's finish: STOLEN AT THE LINE! when the place got better within the last second. */
  onFinish(tick: number, place: number): DramaCall | null {
    if (this.finalAt < 0) return null;
    let then = this.hist.length ? this.hist[0].place : place;
    for (const h of this.hist) if (tick - h.tick >= 60) then = h.place;
    return then > place ? 'stolen' : null;
  }
}

/** The player's new best lap is the race's fastest lap (any cat, laps run so far; at least one other cat has a lap). */
export class FastestLap {
  private mine = 0;

  reset(): void {
    this.mine = 0;
  }

  step(karts: ReadonlyArray<Pick<KartState, 'bestLapTicks'>>, me: number): boolean {
    const b = karts[me]?.bestLapTicks ?? 0;
    if (!(b > 0) || b === this.mine) return false;
    const first = this.mine === 0;
    this.mine = b;
    // the first lap (a standing start from a staggered grid) is never "the fastest": only a flying lap flashes
    if (first) return false;
    // only against cats that have run a lap too (the leader's lap is not "the fastest" of nothing)
    let others = 0;
    for (let i = 0; i < karts.length; i++) {
      if (i === me || !(karts[i].bestLapTicks > 0)) continue;
      if (karts[i].bestLapTicks <= b) return false;
      others++;
    }
    return others > 0;
  }
}

export interface Zip {
  kart: number;
  /** −1 left … +1 right */
  pan: number;
  vol: number;
}

/** A close pass: a cat within 4 m across crosses the player's line along the track at 3+ m/s. */
export class PassZips {
  private side: number[] = [];
  private last: number[] = [];

  reset(): void {
    this.side.length = 0;
    this.last.length = 0;
  }

  step(tick: number, goTick: number, karts: ReadonlyArray<KartState>, me: number, out: Zip[]): Zip[] {
    out.length = 0;
    const k = karts[me];
    if (!k) return out;
    for (let i = 0; i < karts.length; i++) {
      if (i === me) continue;
      const o = karts[i];
      const along = o.dist - k.dist;
      const prev = this.side[i];
      const s = along >= 0 ? 1 : -1;
      this.side[i] = s;
      if (prev == null || prev === s || o.out || o.finished || k.finished) continue;
      if (tick < goTick + 180 || o.branch !== k.branch || Math.abs(along) > 3) continue;
      const lat = o.d - k.d;
      if (Math.abs(lat) > 4) continue;
      const rel = Math.abs(speed(o) - speed(k));
      if (rel < 3 || tick - (this.last[i] ?? -1e9) < 60) continue;
      this.last[i] = tick;
      // d is measured towards (−tz, tx): facing +z that is −x, the driver's right (incoming.ts), so +d pans right
      out.push({ kart: i, pan: Math.max(-1, Math.min(1, lat / 3)), vol: Math.min(1, 0.4 + rel / 12) });
    }
    return out;
  }
}
