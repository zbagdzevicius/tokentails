// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/core/math.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/core/math.js  (owner: core) — small allocation-free helpers. Pure; node-safe.
// Conventions (tech.md §2): +Y up, model forward +Z, yaw = atan2(dir.x, dir.z), positive angles = left.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (a === b ? 0 : (x - a) / (b - a));
export const remap = (x, a0, a1, b0, b1, doClamp = true) => {
  const t = invLerp(a0, a1, x);
  return lerp(b0, b1, doClamp ? clamp01(t) : t);
};

/** Frame-rate independent exponential smoothing toward b (tech.md §8). */
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/** Move `cur` toward `target` by at most `maxDelta`. */
export const approach = (cur, target, maxDelta) =>
  cur < target ? Math.min(cur + maxDelta, target) : Math.max(cur - maxDelta, target);

/** Wrap an angle to (-PI, PI]. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Shortest signed difference b - a, in (-PI, PI]. */
export const angleDiff = (a, b) => wrapAngle(b - a);

/** Interpolate angles along the shortest arc. */
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

/** Exponentially smooth an angle toward b along the shortest arc. */
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

/** Yaw (facing) from a direction (x, z). */
export const yawOf = (x, z) => Math.atan2(x, z);

/** Yaw from actor/position `from` toward `to` (anything with .pos or .x/.z). */
export function yawTo(from, to) {
  const a = from.pos ?? from, b = to.pos ?? to;
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/** XZ distance between two positions (or actors). */
export function distXZ(a, b) {
  const p = a.pos ?? a, q = b.pos ?? b;
  return Math.hypot(q.x - p.x, q.z - p.z);
}

/** Squared XZ distance. */
export function dist2XZ(a, b) {
  const p = a.pos ?? a, q = b.pos ?? b;
  const dx = q.x - p.x, dz = q.z - p.z;
  return dx * dx + dz * dz;
}

export const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
/** Swing curve: fast start, soft end (tech.md §9.1). */
export const easeSwing = (u) => 1 - Math.pow(1 - u, 3);

export const EASES = { linear: (t) => t, inQuad: easeInQuad, outQuad: easeOutQuad, inCubic: easeInCubic, outCubic: easeOutCubic,
  inOutCubic: easeInOutCubic, inOutSine: easeInOutSine, outBack: easeOutBack, swing: easeSwing };

/**
 * Uniform random point in a disc around `center` (XZ), written into `out` (y copied from center).
 * @param {{x:number,y:number,z:number}} center @param {number} r @param {() => number} rng @param {any} out
 */
export function randomPointNear(center, r, rng, out) {
  const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
  out.x = center.x + Math.sin(a) * d; out.y = center.y; out.z = center.z + Math.cos(a) * d;
  return out;
}

/** Tiny critically-damped spring for secondary motion (tech.md §11.2). */
export class Spring {
  x = 0; v = 0;
  constructor(k = 120, c = 2 * Math.sqrt(k)) { this.k = k; this.c = c; }
  step(target, dt) { this.v += (this.k * (target - this.x) - this.c * this.v) * dt; this.x += this.v * dt; return this.x; }
  reset(x = 0) { this.x = x; this.v = 0; }
}

/**
 * Critically damped smoothing (AUTOCAM §4.3; Game Programming Gems 4 §1.10, Unity SmoothDamp form). Exact for any
 * dt, never overshoots, velocity stays continuous. Zero allocation.
 * @param {number} cur @param {number} target
 * @param {{v: number}} state  velocity carried between calls (start at { v: 0 })
 * @param {number} st  smooth time (s) @param {number} dt @param {number} [vmax]  rate cap (units/s)
 * @returns {number} the new value
 */
export function smoothDamp(cur, target, state, st, dt, vmax = Infinity) {
  st = Math.max(1e-4, st);
  const w = 2 / st, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let ch = cur - target; const maxCh = vmax * st; ch = Math.min(maxCh, Math.max(-maxCh, ch));
  const tgt = cur - ch, tmp = (state.v + w * ch) * dt;
  state.v = (state.v - w * tmp) * e;
  let out = tgt + (ch + tmp) * e;
  if ((target - cur > 0) === (out > target)) { out = target; state.v = 0; }   // no overshoot
  return out;
}

/**
 * 2D smoothDamp (XZ, or screen right/up) with a radial rate cap (no diagonal speed-up). Writes `o` in place; zero alloc.
 * @param {{x: number, z: number}} o @param {number} tx @param {number} tz
 * @param {{vx: number, vz: number}} s  velocity state @param {number} st @param {number} dt @param {number} [vmax]
 */
export function smoothDamp2(o, tx, tz, s, st, dt, vmax = Infinity) {
  st = Math.max(1e-4, st); const w = 2 / st, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let cx = o.x - tx, cz = o.z - tz; const m = Math.hypot(cx, cz), maxCh = vmax * st;
  if (m > maxCh) { cx *= maxCh / m; cz *= maxCh / m; }
  const ax = (s.vx + w * cx) * dt, az = (s.vz + w * cz) * dt;
  s.vx = (s.vx - w * ax) * e; s.vz = (s.vz - w * az) * e;
  let nx = (o.x - cx) + (cx + ax) * e, nz = (o.z - cz) + (cz + az) * e;
  if ((tx - o.x) * (nx - tx) + (tz - o.z) * (nz - tz) > 0) { nx = tx; nz = tz; s.vx = s.vz = 0; }
  o.x = nx; o.z = nz;
}
