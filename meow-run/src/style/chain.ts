// STYLE lane, pure: the combo chain. Every stylish event adds its weight and refreshes a 3 s window; the window is
// held while Mochi is airborne. Pickups (fish 0.25, treats 1) alone climb no higher than FREE_TIER (CLAW-SOME!): every
// tier above it needs a stylish add (a trick, a bell, a near miss, set-piece style), and one stylish add climbs at
// most one tier, so CAT-ASTROPHIC! takes real tricks. When it runs out the chain banks round(15 x n x tierMul) raw points; a hit or a fall
// breaks it (nothing banked). Also keeps the run totals (best chain, tricks, style points).
import { bankPoints, MAX_TIER, tierFor } from './points';

/** the highest tier pickups alone reach */
export const FREE_TIER = 3;

export const CHAIN_WINDOW = 3.0;

export interface Bank {
  n: number;
  tier: number;
  points: number;
}

export class ComboChain {
  /** current chain length (sum of weights; fish add a quarter, so it can be fractional: show `links`) */
  n = 0;
  /** current tier 0..6 */
  tier = 0;
  /** seconds left in the window */
  timer = 0;
  /** run totals */
  bestChain = 0;
  tricks = 0;
  stylePoints = 0;
  banks = 0;

  /** whole links (what the HUD shows) */
  get links(): number {
    return Math.floor(this.n + 1e-9);
  }

  /** add an event (stylish = a trick, bell, near miss or set piece; false = a pickup); returns the new tier if this
   *  crossed into a higher one, else 0 */
  add(weight: number, stylish = true): number {
    if (!(weight > 0)) return 0;
    this.n += weight;
    this.timer = CHAIN_WINDOW;
    if (this.links > this.bestChain) this.bestChain = this.links;
    let t = tierFor(this.n);
    if (t > FREE_TIER) t = stylish ? Math.min(t, Math.max(FREE_TIER, this.tier + 1)) : Math.max(this.tier, FREE_TIER);
    t = Math.min(MAX_TIER, t);
    if (t > this.tier) {
      this.tier = t;
      return t;
    }
    return 0;
  }

  /** advance the window; `hold` (airborne) freezes it. Returns the bank when the chain runs out, else null. */
  tick(dt: number, hold: boolean): Bank | null {
    if (this.n <= 0) return null;
    if (hold) return null;
    this.timer -= dt;
    return this.timer <= 0 ? this.bank() : null;
  }

  /** bank now (window ran out, or the finish line); null when there is nothing to bank */
  bank(): Bank | null {
    if (this.n <= 0) return null;
    const b: Bank = { n: this.links, tier: this.tier, points: bankPoints(this.n, this.tier) };
    this.stylePoints += b.points;
    this.banks++;
    this.clear();
    return b;
  }

  /** a hit or a fall: the chain is lost; returns the lost length */
  break(): number {
    const lost = this.n;
    this.clear();
    return lost;
  }

  /** style points earned outside the bank (tricks, set pieces) */
  addStyle(points: number): void {
    if (points > 0) this.stylePoints += points;
  }

  /** 0..1 window left (the draining bar) */
  get fraction(): number {
    return this.n > 0 ? Math.max(0, Math.min(1, this.timer / CHAIN_WINDOW)) : 0;
  }

  /** test hook: jump straight to a chain length (the tier follows) */
  force(n: number, window = CHAIN_WINDOW): number {
    this.n = Math.max(0, Math.floor(n));
    this.tier = tierFor(this.n);
    this.timer = window;
    if (this.links > this.bestChain) this.bestChain = this.links;
    return this.tier;
  }

  private clear(): void {
    this.n = 0;
    this.tier = 0;
    this.timer = 0;
  }

  /** a new run */
  resetRun(): void {
    this.clear();
    this.bestChain = 0;
    this.tricks = 0;
    this.stylePoints = 0;
    this.banks = 0;
  }
}
