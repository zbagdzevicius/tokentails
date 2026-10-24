// STYLE lane, pure: air tricks. Fed by the game events (jump, pounce, ability press, fast fall, land, hit) and a
// tick; decides which tricks were started and which were landed.
//   SPIN       an unconsumed ability press while airborne in P.mode 'run' or 'ride' (never 'arc'): one turn, 0.38 s.
//              A 2nd press in the same air time queues a 2nd turn (DOUBLE), a 3rd a 3rd (TRIPLE); queued turns run
//              faster (TURN_TIME), and when the caller says how long until touchdown (tick's landIn) the turns left
//              speed up to finish before it (up to MAX_TURN_RATE), so a press in a normal jump lands clean.
//   FLIP       the pounce (Mochi's rig already somersaults).
//   CORKSCREW  an ability press within 0.35 s after a pounce: the flip becomes a barrel-rolling corkscrew.
//   PAW-DIVE   a fast fall, then a landing.
// Landing pays a trick only when there was no hit since take-off and its rotation is at least 80% done (a spin level
// k needs 0.8 x k turns: a DOUBLE that only made 1.5 turns lands as a SPIN). Nothing clean at all = SLOPPY (0 points,
// the chain is kept). A hit in the air voids the tricks (the combo chain breaks on the hit itself).
import type { TrickId } from './points';

export const SPIN_TIME = 0.38;
/** seconds per turn with 1, 2 or 3 spins queued (E, E on a plain jump lands a DOUBLE) */
export const TURN_TIME: readonly number[] = [SPIN_TIME, 0.26, 0.2];
/** the fastest a rushed spin turns (turns per second) */
export const MAX_TURN_RATE = 1 / 0.14;
export const FLIP_TIME = 0.42;
export const CORK_TIME = 0.45;
export const CORK_WINDOW = 0.35;
export const CLEAN = 0.8;
export const MAX_SPINS = 3;

export interface Landing {
  /** clean tricks, in the order they pay */
  paid: TrickId[];
  /** tried something and landed none of it clean */
  sloppy: boolean;
}

const SPIN_LEVEL: readonly TrickId[] = ['SPIN', 'DOUBLE', 'TRIPLE'];

export class TrickTracker {
  air = false;
  private hit = false;
  spins = 0;
  /** turns done so far (0..spins) */
  spinDone = 0;
  flip = false;
  flipT = 0;
  cork = false;
  corkT = 0;
  dive = false;
  sincePounce = 99;

  private takeoff(): void {
    if (this.air) return;
    this.clear();
    this.air = true;
  }
  private clear(): void {
    this.air = false;
    this.hit = false;
    this.spins = 0;
    this.spinDone = 0;
    this.flip = false;
    this.flipT = 0;
    this.cork = false;
    this.corkT = 0;
    this.dive = false;
    this.sincePounce = 99;
  }

  jump(_e: { air: boolean }): void {
    this.takeoff();
  }

  pounce(): void {
    this.takeoff();
    this.flip = true;
    this.flipT = 0;
    this.sincePounce = 0;
  }

  /** returns the trick this press started (null = nothing) */
  ability(e: { consumed: boolean; airborne: boolean; mode: string }): TrickId | null {
    if (e.consumed || !e.airborne || (e.mode !== 'run' && e.mode !== 'ride')) return null;
    this.takeoff();
    if (this.flip && !this.cork && this.sincePounce <= CORK_WINDOW) {
      this.cork = true;
      this.corkT = 0;
      return 'CORKSCREW';
    }
    if (this.spins >= MAX_SPINS) return null;
    this.spins++;
    return SPIN_LEVEL[this.spins - 1];
  }

  fastFall(): void {
    if (this.air) this.dive = true;
  }

  hitNow(): void {
    if (this.air) this.hit = true;
  }

  /** advance the rotations; landIn = predicted seconds until touchdown (unknown: undefined) */
  tick(dt: number, landIn?: number): void {
    if (!this.air) return;
    this.sincePounce += dt;
    if (this.spinDone < this.spins) {
      let rate = 1 / TURN_TIME[Math.max(0, Math.min(TURN_TIME.length - 1, this.spins - 1))];
      // rush the turns left so they finish just before touchdown
      if (landIn !== undefined && Number.isFinite(landIn) && landIn > 0) rate = Math.max(rate, Math.min(MAX_TURN_RATE, (this.spins - this.spinDone) / Math.max(0.05, landIn - 0.03)));
      this.spinDone = Math.min(this.spins, this.spinDone + dt * rate);
    }
    if (this.flip) this.flipT += dt;
    if (this.cork) this.corkT += dt;
  }

  /** touchdown: the landed tricks, or null when there was nothing in the air (or a hit voided it) */
  land(_e: { impact: number }): Landing | null {
    if (!this.air) return null;
    const hit = this.hit;
    const tried = this.spins > 0 || this.flip || this.cork || this.dive;
    const paid: TrickId[] = [];
    if (!hit && tried) {
      if (this.cork) {
        if (this.corkT >= CLEAN * CORK_TIME) paid.push('CORKSCREW');
      } else if (this.flip && this.flipT >= CLEAN * FLIP_TIME) paid.push('FLIP');
      let level = 0;
      for (let k = this.spins; k >= 1; k--) {
        if (this.spinDone >= CLEAN * k - 1e-9) {
          level = k;
          break;
        }
      }
      if (level > 0) paid.push(SPIN_LEVEL[level - 1]);
      if (this.dive) paid.push('PAW-DIVE');
    }
    this.clear();
    if (hit || !tried) return null;
    return { paid, sloppy: paid.length === 0 };
  }

  /** a respawn, a new run */
  reset(): void {
    this.clear();
  }

  // ---- visuals ----
  /** the spin about the rig's up axis (radians) */
  get spinAngle(): number {
    return this.spinDone * Math.PI * 2;
  }
  /** the corkscrew barrel roll about the rig's forward axis (radians) */
  get rollAngle(): number {
    return this.cork ? Math.min(1, this.corkT / CORK_TIME) * Math.PI * 2 : 0;
  }
  /** a rotation is still running */
  get spinning(): boolean {
    return this.air && (this.spinDone < this.spins || (this.cork && this.corkT < CORK_TIME));
  }
}
