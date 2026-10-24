// Turtle-style path authoring. FROZEN. Pure (node-importable).
// Stage scripts call b.run(len, { turn, rise, width, bank, kind }) and get the exact s range back, so set pieces
// can be placed on known distances. Heading changes at a constant rate (circular arcs), rise/width/bank ease.
import type { Track } from './track';
import { DS } from './track';
import type { RunOpts, SegmentKind, StartPose } from './types';

const D2R = Math.PI / 180;
const smooth = (u: number) => u * u * (3 - 2 * u);

export class PathBuilder {
  x: number;
  y: number;
  z: number;
  /** radians; forward = (sin h, 0, cos h). Turning right decreases it. */
  heading: number;
  width: number;
  /** radians */
  bank: number;

  constructor(
    readonly track: Track,
    start: StartPose = { x: 0, y: 0, z: 0, heading: 0 },
  ) {
    this.x = start.x;
    this.y = start.y;
    this.z = start.z;
    this.heading = start.heading * D2R;
    this.width = start.width ?? 10;
    this.bank = 0;
    if (track.samples === 0) track.push(this.x, this.y, this.z, this.width, 0, 'ground');
  }

  /** current end of the track (s of the next sample to be laid) */
  get s(): number {
    return this.track.length;
  }

  /** Lay `len` u of path. Returns the s range it covers. */
  run(len: number, o: RunOpts = {}): { s0: number; s1: number } {
    const s0 = this.s;
    const n = Math.max(1, Math.round(len / DS));
    const kind: SegmentKind = o.kind ?? 'ground';
    const turn = -(o.turn ?? 0) * D2R; // + turn = right = heading decreases
    const rise = o.rise ?? 0;
    const ease = o.ease !== false;
    const w0 = this.width;
    const w1 = o.width ?? w0;
    const b0 = this.bank;
    const b1 = o.bank === undefined ? b0 : o.bank * D2R;
    const bankIn = Math.max(0.01, Math.min(1, o.bankIn ?? 1));
    const y0 = this.y;
    const h0 = this.heading;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const um = (k - 0.5) / n;
      const h = h0 + turn * um;
      const ny = y0 + rise * (ease ? smooth(u) : u);
      const dy = ny - this.y;
      // keep each step DS long in 3D: the horizontal part shrinks on slopes (capped at ~78 degrees)
      const hd = Math.sqrt(Math.max(0.04 * DS * DS, DS * DS - dy * dy));
      this.x += Math.sin(h) * hd;
      this.z += Math.cos(h) * hd;
      this.y = ny;
      const e = smooth(u);
      this.width = w0 + (w1 - w0) * e;
      this.bank = b0 + (b1 - b0) * smooth(Math.min(1, u / bankIn));
      this.track.push(this.x, this.y, this.z, this.width, this.bank, kind);
    }
    this.heading = h0 + turn;
    return { s0, s1: this.s };
  }

  /** shorthand: a straight run */
  straight(len: number, kind: SegmentKind = 'ground'): { s0: number; s1: number } {
    return this.run(len, { kind });
  }

  /** shorthand: a chasm with no floor */
  gap(len: number, o: Omit<RunOpts, 'kind'> = {}): { s0: number; s1: number } {
    return this.run(len, { ...o, kind: 'gap' });
  }
}
