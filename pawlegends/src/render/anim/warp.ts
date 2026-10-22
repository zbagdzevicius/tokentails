/**
 * Time-warp (ANIM-SPEC §4.2): binds a clip's markers to sim anchors (render seconds), so the contact pose lands on the
 * tick the sim resolves the hit ("what you see is what hits"). A piecewise map from render time to clip time:
 *
 * - pre-contact (rule 3): the real lead L to the first anchor. L ≥ c / 2.5 plays the coil at c / L (min 0.5; with more
 *   lead than needed the start is delayed); L < c / 2.5 starts at c − 2.5·L and plays at 2.5× (a snap coil). The
 *   contact pose is never skipped; an anchor already in the past starts impact-led at the contact pose, never late.
 * - between anchors: time segments play at span / sim span, clamped to 0.5–2.5× (an early arrival holds the marker
 *   pose; too little sim time plays 2.5× and snaps the rest on the later anchor), so every marker lands on its anchor; progress segments (end anchor
 *   travelEnd, homingEnd or zoneArm) map the progress s ∈ [0, 1] straight to clip time.
 * - post-contact plays at `post` (1 for abilities, the basic's period ratio).
 * - local freeze (§6): frozen render time becomes debt, repaid at 1.5× afterwards.
 *
 * Per-frame methods (`time`, `step`) allocate nothing; `build` runs once per play.
 */
import { ANCHOR_INDEX, PROGRESS_ANCHORS, type AnchorTimes, type ClipDef } from './types';

export const RATE_MIN = 0.5;
export const RATE_MAX = 2.5;
/** Freeze debt is repaid by playing at this rate. */
export const REPAY_RATE = 1.5;
const CAP = 8;

export class TimeWarp {
  /** Anchored points: clip time, render time, anchor ordinal, progress-driven segment ending here. */
  n = 0;
  readonly ct = new Float64Array(CAP);
  readonly rt = new Float64Array(CAP);
  readonly anchor = new Int8Array(CAP);
  readonly prog = new Uint8Array(CAP);
  startRt = 0;
  startCt = 0;
  preRate = 1;
  postRate = 1;
  /** Render seconds of freeze still to be repaid, and freeze still running. */
  debt = 0;
  freezeLeft = 0;
  /** Progress (0..1) of the current progress segment, NaN = time-driven fallback. Set by the director per frame. */
  progress = NaN;

  /** Bind `def` to `anchors` at render time `now`. `fromCt`: clip time to continue from (a re-bind mid-play). */
  build(def: ClipDef, anchors: AnchorTimes, now: number, fromCt = 0, rate = 1, post = 1): void {
    this.n = 0;
    this.debt = 0;
    this.freezeLeft = 0;
    this.progress = NaN;
    this.postRate = post > 0 ? post : 1;
    for (const [marker, anchor] of def.warp) {
      const mt = def.markers[marker];
      const at = anchors[ANCHOR_INDEX[anchor]];
      if (mt === undefined || !Number.isFinite(at) || this.n >= CAP) continue;
      const k = this.n;
      if (k > 0 && (mt <= this.ct[k - 1] || at <= this.rt[k - 1])) continue;
      this.ct[k] = mt;
      this.rt[k] = at;
      this.anchor[k] = ANCHOR_INDEX[anchor];
      this.prog[k] = PROGRESS_ANCHORS.has(anchor) ? 1 : 0;
      this.n++;
    }
    // drop points already passed when continuing mid-play
    while (this.n > 0 && this.ct[0] < fromCt) this.shift();
    this.startCt = fromCt;
    this.startRt = now;
    this.preRate = rate > 0 ? rate : 1;
    if (this.n === 0) return;
    // an anchor already in the past: impact-led, the contact pose plays now (never late)
    if (this.rt[0] <= now && (this.n < 2 || this.rt[1] > now)) {
      this.rt[0] = now;
      this.startCt = this.ct[0];
      return;
    }
    const c = this.ct[0] - fromCt;
    const L = this.rt[0] - now;
    if (L >= c / RATE_MAX) {
      const r = c / L;
      if (r < RATE_MIN) {
        this.preRate = RATE_MIN;
        this.startRt = this.rt[0] - c / RATE_MIN;
      } else this.preRate = r;
    } else {
      // snap coil: skip into the coil so 2.5× still reaches the contact pose on the anchor
      this.preRate = RATE_MAX;
      this.startCt = this.ct[0] - RATE_MAX * L;
    }
  }

  private shift(): void {
    for (let i = 1; i < this.n; i++) {
      this.ct[i - 1] = this.ct[i];
      this.rt[i - 1] = this.rt[i];
      this.anchor[i - 1] = this.anchor[i];
      this.prog[i - 1] = this.prog[i];
    }
    this.n--;
  }

  /** Move an anchor's render time (a dash that stopped early, a corrected hit tick). */
  retime(anchorOrdinal: number, t: number): void {
    for (let i = 0; i < this.n; i++) if (this.anchor[i] === anchorOrdinal) this.rt[i] = Math.max(i > 0 ? this.rt[i - 1] + 1e-4 : -Infinity, t);
  }

  /** Render time of anchor point `ordinal`, NaN when the clip does not bind it. */
  anchorTime(ordinal: number): number {
    for (let i = 0; i < this.n; i++) if (this.anchor[i] === ordinal) return this.rt[i];
    return NaN;
  }

  freeze(s: number): void {
    if (s > this.freezeLeft) this.freezeLeft = s;
  }

  /**
   * Advance the freeze / debt by `dr` render seconds (call once per frame before `time`). A freeze asked for before the
   * clip reaches its first anchor (the hit fired a frame before the contact pose showed) waits for it, so the hit-stop
   * holds the contact pose, never the coil.
   */
  step(dr: number, now = Infinity): void {
    if (dr <= 0) return;
    if (this.freezeLeft > 0) {
      // the frozen span starts at the first anchor at the earliest (the contact pose shows, then holds)
      const e = now - this.debt;
      const span = now === Infinity ? dr : this.n > 0 && e - dr < this.rt[0] ? e - this.rt[0] : dr;
      if (span <= 0) return;
      const used = span < this.freezeLeft ? span : this.freezeLeft;
      this.freezeLeft -= used;
      this.debt += used;
      return;
    }
    if (this.debt > 0) {
      this.debt -= dr * (REPAY_RATE - 1);
      if (this.debt < 0) this.debt = 0;
    }
  }

  /** Clip time at render time `now`. */
  time(now: number): number {
    const e = now - this.debt;
    const n = this.n;
    if (n === 0) return this.startCt + Math.max(0, e - this.startRt) * this.preRate;
    if (e < this.rt[0]) {
      if (e <= this.startRt) return this.startCt;
      const t = this.startCt + (e - this.startRt) * this.preRate;
      return t < this.ct[0] ? t : this.ct[0];
    }
    for (let i = 1; i < n; i++) {
      if (e >= this.rt[i]) continue;
      const c0 = this.ct[i - 1];
      const c1 = this.ct[i];
      const r0 = this.rt[i - 1];
      const r1 = this.rt[i];
      if (this.prog[i] === 1 && this.progress === this.progress) {
        const s = this.progress < 0 ? 0 : this.progress > 1 ? 1 : this.progress;
        return c0 + (c1 - c0) * s;
      }
      const rate = (c1 - c0) / (r1 - r0);
      if (rate > RATE_MAX) {
        // too little sim time: 2.5× from the earlier marker (it stays on its anchor); the rest snaps on the later one
        const t = c0 + (e - r0) * RATE_MAX;
        return t < c1 ? t : c1;
      }
      if (rate < RATE_MIN) {
        const t = c0 + (e - r0) * RATE_MIN;
        return t < c1 ? t : c1;
      }
      return c0 + (e - r0) * rate;
    }
    return this.ct[n - 1] + (e - this.rt[n - 1]) * this.postRate;
  }
}
