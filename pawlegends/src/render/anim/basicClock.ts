/**
 * BasicClock (ANIM-SPEC §4.3, fixes D1): when does a hero's next basic swing START, so the strike lands on the sim's
 * contact (melee hit) or release (bolt spawn) instead of starting on the hit and landing ~250 ms late.
 *
 * - A rising edge to `attacking` in the newest snapshot starts a swing at the edge tick (contact = edge + windup);
 *   right after a contact the sim's attack timer still runs, so the swing starts no earlier than lastContact + P − w.
 * - While the hero stays attacking, the next swing is predicted at lastContact + P − w (P: the measured gap between
 *   the last two contacts, falling back to the hero's base period).
 * - Confirmation: a melee `hit` (kind basic) or a new owned bolt within 2 ticks of the predicted contact (4 for the
 *   first swing); none → the swing blends out as a feint. A contact with no swing running starts an impact-led one.
 * - combo is the index of the swing that is starting (or that just confirmed): it is chosen when the swing begins, so
 *   the director's pick at swing start sees A, B, C… in order; it advances past each confirmed swing and a swing that
 *   begins more than 1.5 s after the last confirm starts over at 0. basicCount counts confirms (everyNth).
 * Ticks in, decisions out: pure, allocation-free, unit-tested on synthetic streams.
 */
import { BASIC_WINDUP, TICK_HZ } from './timing';

export const COMBO_RESET_TICKS = 1.5 * TICK_HZ;
export const CONFIRM_SLACK = 2;
export const CONFIRM_SLACK_FIRST = 4;

export const enum ClockOut {
  None = 0,
  Start = 1,
  Feint = 2,
  Confirmed = 3,
  ImpactLed = 4,
}

export class BasicClock {
  /** Base period (ticks between basics) and windup. */
  period: number;
  windup = BASIC_WINDUP;
  attacking = false;
  swingOn = false;
  /** Current / last swing: start and contact ticks. */
  start = NaN;
  contact = NaN;
  first = false;
  prevContact = NaN;
  lastContact = NaN;
  combo = 0;
  basicCount = 0;
  /** The combo index the next swing gets (combo + 1 after a confirm). */
  private next = 0;
  private lastConfirm = -1e9;

  constructor(period: number) {
    this.period = period;
  }

  /** The period in use: the measured gap between the last two contacts, else the base one. */
  get P(): number {
    const m = this.lastContact - this.prevContact;
    return m === m && m >= 6 && m <= this.period * 2.2 ? m : this.period;
  }

  /** Per new snapshot: `tick` (the newest snapshot's), whether the hero is attacking in it. */
  frame(tick: number, attacking: boolean, dead = false): ClockOut {
    const was = this.attacking;
    this.attacking = attacking && !dead;
    if (dead) {
      this.swingOn = false;
      return ClockOut.None;
    }
    // an unconfirmed swing past its slack is a feint
    if (this.swingOn && tick > this.contact + (this.first ? CONFIRM_SLACK_FIRST : CONFIRM_SLACK)) {
      this.swingOn = false;
      return ClockOut.Feint;
    }
    if (!this.attacking || this.swingOn) return ClockOut.None;
    const cadence = this.lastContact === this.lastContact && tick - this.lastContact < this.P * 2.2 ? this.lastContact + this.P - this.windup : NaN;
    if (!was) {
      // rising edge: a swing starts now (or when the attack timer allows after a recent contact)
      const s = cadence === cadence ? Math.max(tick, cadence) : tick;
      if (s > tick) return ClockOut.None;
      return this.begin(s, cadence !== cadence);
    }
    if (cadence === cadence && tick >= cadence) return this.begin(cadence, false);
    return ClockOut.None;
  }

  private begin(start: number, first: boolean): ClockOut {
    this.swingOn = true;
    this.start = start;
    this.contact = start + this.windup;
    this.first = first;
    this.combo = start - this.lastConfirm > COMBO_RESET_TICKS ? 0 : this.next;
    return ClockOut.Start;
  }

  /** A contact (melee basic hit / bolt release) at `tick`. */
  confirm(tick: number): ClockOut {
    let out: ClockOut = ClockOut.Confirmed;
    if (!this.swingOn || Math.abs(tick - this.contact) > (this.first ? CONFIRM_SLACK_FIRST : CONFIRM_SLACK)) {
      // nothing predicted it: an impact-led swing (never a late one)
      this.start = tick - this.windup;
      this.combo = tick - this.lastConfirm > COMBO_RESET_TICKS ? 0 : this.next;
      out = ClockOut.ImpactLed;
    }
    this.contact = tick;
    this.swingOn = false;
    this.prevContact = this.lastContact;
    this.lastContact = tick;
    this.next = this.combo + 1;
    this.lastConfirm = tick;
    this.basicCount++;
    return out;
  }
}
