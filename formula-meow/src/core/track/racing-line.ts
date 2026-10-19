/**
 * Racing line (GDD 5.2): a lateral offset per sample that hugs the inside of each turn, smoothed along the lap so the
 * line swings wide before the apex and back out after it. Done at build time so UGC tracks get it too.
 */
import { clamp } from '../sim/fixed';

/** Curvature (1/m) at which the line reaches the inner edge. */
const FULL_CURV = 0.045;
const EDGE_MARGIN = 1.6;

export function computeRacingLine(curv: Float64Array, halfW: Float64Array, step: number): Float64Array {
  const n = curv.length;
  const line = new Float64Array(n);
  // inside of a left turn (curv > 0) is the left side, d < 0
  for (let i = 0; i < n; i++) line[i] = -clamp(curv[i] / FULL_CURV, -1, 1) * (halfW[i] - EDGE_MARGIN);
  // blur over ~±14 m, several passes (≈ gaussian): the line starts moving toward the apex well before it
  const r = Math.max(2, Math.round(14 / step));
  const tmp = new Float64Array(n);
  for (let p = 0; p < 3; p++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += line[(k + n) % n];
    for (let i = 0; i < n; i++) {
      tmp[i] = acc / (2 * r + 1);
      acc += line[(i + r + 1) % n] - line[(i - r + n) % n];
    }
    line.set(tmp);
  }
  for (let i = 0; i < n; i++) {
    const lim = halfW[i] - EDGE_MARGIN;
    line[i] = clamp(line[i] * 1.6, -lim, lim);
  }
  return line;
}
