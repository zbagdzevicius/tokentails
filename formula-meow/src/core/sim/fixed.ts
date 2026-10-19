/**
 * Deterministic math for the sim (GDD 3.1). Trig goes through a 4096-entry LUT with linear interpolation;
 * atan2 is a minimax polynomial; the acceleration curve's x^0.6 is a LUT too. The tables are built once with
 * Math.sin / Math.pow and rounded to 1e-9, so a last-ulp difference between engines cannot leak into the sim.
 * Everything at runtime is + - * / floor and comparisons.
 */
export const TAU = 6.283185307179586;
export const PI = 3.141592653589793;
const N = 4096;
const SIN = new Float64Array(N + 1);
for (let i = 0; i <= N; i++) SIN[i] = Math.round(Math.sin((i / N) * TAU) * 1e9) / 1e9;

const P = 1024;
const POW06 = new Float64Array(P + 1);
for (let i = 0; i <= P; i++) POW06[i] = Math.round(Math.pow(i / P, 0.6) * 1e9) / 1e9;

/** Wrap an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  return a - TAU * Math.floor((a + PI) / TAU);
}

export function sinL(a: number): number {
  let u = (a / TAU) * N;
  u -= N * Math.floor(u / N);
  const i = Math.floor(u);
  const f = u - i;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * f;
}

export function cosL(a: number): number {
  return sinL(a + PI / 2);
}

/** atan for |x| <= 1 (Abramowitz & Stegun 4.4.49, max error ~1e-5 rad). */
function atanUnit(x: number): number {
  const x2 = x * x;
  return x * (0.999866 + x2 * (-0.3302995 + x2 * (0.180141 + x2 * (-0.085133 + x2 * 0.0208351))));
}

/** atan2(y, x) like Math.atan2. */
export function atan2L(y: number, x: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax === 0 && ay === 0) return 0;
  let r: number;
  if (ax >= ay) r = atanUnit(ay / ax);
  else r = PI / 2 - atanUnit(ax / ay);
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}

/** x^0.6 for x in [0, 1] (clamped). */
export function pow06(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const u = x * P;
  const i = Math.floor(u);
  const f = u - i;
  return POW06[i] + (POW06[i + 1] - POW06[i]) * f;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Heading (0 = +z, positive = toward +x) of a planar vector. */
export function headingOf(x: number, z: number): number {
  return atan2L(x, z);
}
