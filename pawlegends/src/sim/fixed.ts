/**
 * Integer maths for the sim (POC.md §4.2). The only file in src/sim/ allowed to use the `/` operator: every other
 * division goes through `idiv`. Angles are in 1/4096 turn; trig tables are built from integer constants at module
 * load (BigInt Taylor series), so they are bit-identical on every engine.
 */

/** Angle steps per full turn. */
export const ANGLE_STEPS = 4096;
export const ANGLE_MASK = ANGLE_STEPS - 1;
/** sin/cos tables are scaled by TRIG_ONE (Q16). */
export const TRIG_SHIFT = 16;
export const TRIG_ONE = 1 << TRIG_SHIFT;

/** Integer division truncating toward zero, exact for |a| < 2^53 (corrects float rounding of a / b). */
export function idiv(a: number, b: number): number {
  if (b === 0) throw new RangeError('idiv by zero');
  let q = Math.trunc(a / b);
  const r = a - q * b;
  const sameSign = a < 0 === b < 0;
  if (r !== 0 && r < 0 !== a < 0) q += sameSign ? -1 : 1;
  else if (Math.abs(r) >= Math.abs(b)) q += sameSign ? 1 : -1;
  return q;
}

/** Remainder with the sign of `a` (matches `idiv`). */
export function imod(a: number, b: number): number {
  return a - idiv(a, b) * b;
}

/** floor(sqrt(n)) for 0 <= n < 2^53; negative input gives 0. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  if (n < 4) return 1;
  // Start from a power of two above the root, then Newton (monotone decreasing from above).
  let x = 1;
  while (x * x <= n) x *= 2;
  for (;;) {
    const y = idiv(x + idiv(n, x), 2);
    if (y >= x) return x;
    x = y;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Squared distance (mm²). Map diagonal² ≈ 1.36e10, far below 2^53. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return isqrt(dist2(ax, ay, bx, by));
}

/** 100% in basis points. */
export const BP_ONE = 10000;

/** `x * bp / 10000`, truncated (POC.md §4.2). */
export function applyBp(x: number, bp: number): number {
  return idiv(x * bp, BP_ONE);
}

/** round(sec × hz), half up, for integer tenths/hundredths given as a numerator over `den` (tools and tests). */
export function ticksOf(num: number, den: number, hz: number): number {
  return idiv(num * hz * 2 + den, den * 2);
}

// ---------------------------------------------------------------------------------------------------------------
// Trig tables

const QBITS = BigInt(60);
const QONE = BigInt(1) << QBITS;
// π × 2^60, rounded: 3.14159265358979323846... × 1152921504606846976.
const PI_Q60 = BigInt('3622009729038561421');

function sinQ60(x: bigint): bigint {
  // Taylor series for |x| <= π/2 in Q60.
  const x2 = (x * x) >> QBITS;
  let term = x;
  let sum = x;
  for (let n = 1; n < 30; n++) {
    term = -((term * x2) >> QBITS) / BigInt(2 * n * (2 * n + 1));
    if (term === BigInt(0)) break;
    sum += term;
  }
  return sum;
}

function buildSin(): Int32Array {
  const quarter = ANGLE_STEPS >> 2;
  const t = new Int32Array(ANGLE_STEPS);
  const half = QONE >> BigInt(TRIG_SHIFT + 1);
  for (let k = 0; k <= quarter; k++) {
    const x = (PI_Q60 * BigInt(2 * k)) / BigInt(ANGLE_STEPS);
    const v = sinQ60(x);
    t[k] = Number((v + half) >> (QBITS - BigInt(TRIG_SHIFT)));
  }
  for (let k = 1; k < quarter; k++) t[2 * quarter - k] = t[k];
  for (let k = 1; k < 2 * quarter; k++) t[2 * quarter + k] = -t[k];
  return t;
}

/** sin(2π·a/4096) × TRIG_ONE. */
export const SIN_TABLE: Int32Array = buildSin();

export function isin(a: number): number {
  return SIN_TABLE[a & ANGLE_MASK];
}

export function icos(a: number): number {
  return SIN_TABLE[(a + (ANGLE_STEPS >> 2)) & ANGLE_MASK];
}

/**
 * Angle of the vector (dx, dy) in 1/4096 turn, 0 = +x, counter-clockwise (+y up). (0, 0) gives 0.
 * Octant reduction + binary search on the sin table: exact to the nearest table step below.
 */
export function iatan2(dy: number, dx: number): number {
  if (dx === 0 && dy === 0) return 0;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const swap = ay > ax;
  const num = swap ? ax : ay;
  const den = swap ? ay : ax;
  // Largest a in [0, 512] with tan(a) <= num/den, i.e. sin(a)·den <= num·cos(a).
  const eighth = ANGLE_STEPS >> 3;
  let lo = 0;
  let hi = eighth;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (SIN_TABLE[mid] * den <= num * SIN_TABLE[(ANGLE_STEPS >> 2) - mid]) lo = mid;
    else hi = mid - 1;
  }
  let a = swap ? (ANGLE_STEPS >> 2) - lo : lo;
  if (dx < 0) a = (ANGLE_STEPS >> 1) - a;
  if (dy < 0) a = ANGLE_STEPS - a;
  return a & ANGLE_MASK;
}

/** Shortest signed difference b − a in angle steps, in (−2048, 2048]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) & ANGLE_MASK;
  if (d > ANGLE_STEPS >> 1) d -= ANGLE_STEPS;
  return d;
}

/**
 * One tick of movement toward (tx, ty) at `speed` mm/s with a fraction carry (POC.md §4.2): the step is
 * idiv(speed + carry, hz) and the remainder is kept, so 4,900 mm/s moves exactly 4,900 mm a second.
 * Writes [x, y, carry] into `out`; returns true when the unit arrived this tick.
 */
export function moveToward(
  x: number,
  y: number,
  tx: number,
  ty: number,
  speed: number,
  carry: number,
  hz: number,
  out: Int32Array | number[],
): boolean {
  const total = speed + carry;
  const step = idiv(total, hz);
  const rest = total - step * hz;
  const dx = tx - x;
  const dy = ty - y;
  const d = isqrt(dx * dx + dy * dy);
  if (d <= step) {
    out[0] = tx;
    out[1] = ty;
    out[2] = 0;
    return true;
  }
  out[0] = x + idiv(dx * step, d);
  out[1] = y + idiv(dy * step, d);
  out[2] = rest;
  return false;
}
