/**
 * Boost chains and ON FIRE (iteration 4, F6; juice lane). Pure: race events in, chain links and the ON FIRE window
 * out. Render-side only: nothing here is hashed or replayed, so a replay of the same race tallies the same chains.
 *
 * - A boost **links** to the chain when it starts within `CHAIN.gapTicks` (1.2 s) of the last linked boost ending.
 *   Counted boosts are the ones the player earns: mini-turbos, pads (and loop strips), the Pounce Start, tricks, the
 *   slipstream and set-piece boosts (loop exit, clean wall ride, clean landing). Item boosts (catnip, Zoomies) neither
 *   link nor break a chain. Two boosts starting within `CHAIN.sameTicks` count as one link (a landing and its trick).
 * - Callouts only from ×3 ("BOOST CHAIN ×3"); each link pitches the chain sound up and heats the flame.
 * - **ON FIRE** for 5 s at ×4 (every further link re-lights the 5 s), or after a TRIPLE overtake (`ignite`).
 *
 * `boostChainTally(events, me)` is the stable API the share lane reads (clip highlights, the share caption): the same
 * tally over a finished race's event log. Keep its shape.
 */
import { BoostSource, type RaceEvent } from '../types';
import { BOOST, DRIFT, STUNT } from '../tuning';

export const CHAIN = {
  /** a boost starting within this many ticks after the last one ended links (1.2 s) */
  gapTicks: 72,
  /** two boosts starting this close together are one link */
  sameTicks: 6,
  /** callouts from this chain length */
  calloutFrom: 3,
  /** ON FIRE from this chain length */
  fireAt: 4,
  /** ON FIRE lasts this long (5 s) */
  fireTicks: 300,
} as const;

export interface ChainLink {
  /** the chain length after this link (1 = a lone boost) */
  chain: number;
  /** show "BOOST CHAIN ×n" */
  callout: boolean;
  /** ON FIRE was lit (or re-lit) by this link */
  fire: boolean;
  /** ON FIRE was off before this link */
  newFire: boolean;
}

/** One race's chain numbers (results row "Best chain", share captions). */
export interface BoostChainSummary {
  /** the longest chain (0 when no boost was earned, 1 for lone boosts only) */
  best: number;
  /** chains that reached ×3 */
  chains3: number;
  /** times ON FIRE was lit from cold */
  fires: number;
  /** boosts that counted */
  links: number;
}

const SEC = 60;
const dur = (s: number) => Math.round(s * SEC);

export class BoostChain {
  private n = 0;
  private lastStart = -1e9;
  private end = -1e9;
  private fireUntil = -1e9;
  /** the chain's end before the last link (a context event on the link's tick corrects its length) */
  private endBefore = -1e9;
  private s: BoostChainSummary = BoostChain.empty();

  static empty(): BoostChainSummary {
    return { best: 0, chains3: 0, fires: 0, links: 0 };
  }

  reset(): void {
    this.n = 0;
    this.lastStart = this.end = this.fireUntil = -1e9;
    this.endBefore = -1e9;
    this.s = BoostChain.empty();
  }

  get summary(): Readonly<BoostChainSummary> {
    return this.s;
  }

  /** The chain still alive at `tick` (0 when it has run out). */
  chainAt(tick: number): number {
    return tick <= this.end + CHAIN.gapTicks ? this.n : 0;
  }

  /** ON FIRE at `tick`. */
  onFire(tick: number): boolean {
    return tick < this.fireUntil;
  }

  /** 0..1 of the ON FIRE time left (the trail fades out over the last second). */
  fireLeft(tick: number): number {
    return Math.max(0, Math.min(1, (this.fireUntil - tick) / SEC));
  }

  /** 0..1 of the whole ON FIRE window left (the HUD badge's bar). */
  fireFrac(tick: number): number {
    return Math.max(0, Math.min(1, (this.fireUntil - tick) / CHAIN.fireTicks));
  }

  /** Light ON FIRE from outside (a TRIPLE overtake). True when it was off. */
  ignite(tick: number): boolean {
    const was = this.onFire(tick);
    this.fireUntil = Math.max(this.fireUntil, tick + CHAIN.fireTicks);
    if (!was) this.s.fires++;
    return !was;
  }

  /** How long a boost of this source lasts, in ticks (the sim emits the boost first, then its context event). */
  private lengthOf(source: number): number {
    switch (source) {
      case BoostSource.MiniTurbo:
        return dur(DRIFT.boost[0]);
      case BoostSource.Pounce:
        return dur(BOOST.pounce.time);
      case BoostSource.Trick:
        return dur(BOOST.trick.time);
      case BoostSource.Slipstream:
        return dur(BOOST.slip.time);
      case BoostSource.Stunt:
        return dur(STUNT.jump.landTime);
      default:
        return dur(BOOST.pad.time);
    }
  }

  /** A context event right after the boost on the same tick: the link's real length. */
  private relength(tick: number, len: number): void {
    if (tick === this.lastStart) this.end = Math.max(this.endBefore, this.end, tick + len);
  }

  /** Feed every race event; returns a link when the player's boost counted. */
  onEvent(e: RaceEvent, me: number): ChainLink | null {
    if (e.kart !== me) return null;
    switch (e.type) {
      case 'miniTurbo':
        this.relength(e.tick, dur(DRIFT.boost[Math.max(0, Math.min(2, (e.a ?? 1) - 1))]));
        return null;
      case 'stuntExit':
        if (e.b === 1) this.relength(e.tick, dur(e.a === 0 ? STUNT.loop.exitTime : STUNT.wall.exitTime));
        return null;
      case 'pad':
        return this.link(e.tick, dur(BOOST.pad.time));
      case 'boost': {
        const src = e.a ?? -1;
        if (src === BoostSource.Catnip || src === BoostSource.Zoomies || src === BoostSource.Pad || src < 0) return null;
        return this.link(e.tick, this.lengthOf(src));
      }
      default:
        return null;
    }
  }

  private link(tick: number, len: number): ChainLink | null {
    if (tick - this.lastStart < CHAIN.sameTicks) {
      // the same moment (a landing and its trick): one link, the longer boost
      this.end = Math.max(this.end, tick + len);
      return null;
    }
    this.n = tick <= this.end + CHAIN.gapTicks ? this.n + 1 : 1;
    this.lastStart = tick;
    this.endBefore = this.end;
    this.end = Math.max(this.end, tick + len);
    this.s.links++;
    if (this.n > this.s.best) this.s.best = this.n;
    if (this.n === CHAIN.calloutFrom) this.s.chains3++;
    let fire = false;
    let newFire = false;
    if (this.n >= CHAIN.fireAt) {
      newFire = this.ignite(tick);
      fire = true;
    }
    return { chain: this.n, callout: this.n >= CHAIN.calloutFrom, fire, newFire };
  }
}

/** The whole race's chain numbers from its event log (stable API: share-ugc reads it for clips and captions). */
export function boostChainTally(events: readonly RaceEvent[], me: number): BoostChainSummary {
  // `fires` here counts chain fires only (a TRIPLE overtake's fire is the director's, from its pass chain)
  const c = new BoostChain();
  for (const e of events) c.onEvent(e, me);
  return { ...c.summary };
}
