/**
 * Director camera, speed ramps and easing for the trailer (storyboard §2). Pure maths, no DOM or three.js, so the
 * capture plan (capture.mjs) and the browser harness agree on every frame. Frames are output frames at 60 fps.
 *
 * Camera keys hold their last value: `{ f: 0, dist: 0.55, pitch: 28 }, { f: 29, dist: 0.48, ease: 'out' }` keeps the
 * pitch and eases the distance from frame 0 to 29. A key's `ease` shapes the segment that ends on it.
 * `dist` is a multiple of the gameplay camera distance (MOBA_DIST × ZOOM_DEFAULT), `pitch` degrees down from the
 * horizon, `yaw` degrees relative to the gameplay yaw (0 = looking north, map east on screen right), `fov` degrees.
 */
export type Ease = 'linear' | 'ease' | 'in' | 'out' | 'snap' | 'hold';

export interface CamKey {
  f: number;
  dist?: number;
  pitch?: number;
  yaw?: number;
  fov?: number;
  /** Look-at height above the target (m). */
  lift?: number;
  /** Game-relative shots (`cam.base: 'game'`, v3): 0 = the game's own look point, 1 = the shot's target. */
  blend?: number;
  ease?: Ease;
}

export interface CamState {
  dist: number;
  pitch: number;
  yaw: number;
  fov: number;
  lift: number;
  blend?: number;
}

/** [frame, speed, ease?]: the speed ramp of a shot (1 = real time, 0 = hit-stop). */
export type RampKey = readonly [number, number, Ease?];

export const CAM_DEFAULT: CamState = Object.freeze({ dist: 1, pitch: 55, yaw: 0, fov: 40, lift: 1 });

/**
 * v3: the real gameplay camera as a director preset (renderer.ts: MOBA_DIST 27 x ZOOM_DEFAULT 0.88 = 23.76 m,
 * isoPitch(23.76 m) - MOBA_PITCH_DROP = 48.8 deg, FOV 38, yaw 0, the look point on the ground).
 */
export const GAMECAM: CamState = Object.freeze({ dist: 1, pitch: 48.8, yaw: 0, fov: 38, lift: 0 });

/**
 * v3 game-relative keys (`cam.base: 'game'`): the game's own camera each frame (its follow, lead and fight pull-back),
 * with `dist` a multiple of the game's distance, `pitch` and `yaw` degrees added to it, `fov` absolute and `blend`
 * the share of the look point moved from the game's focus to the shot's target.
 */
export const GAME_REL: CamState = Object.freeze({ dist: 1, pitch: 0, yaw: 0, fov: 38, lift: 0, blend: 0 });

const cubicInOut = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** Eased 0..1 for `u` in 0..1; `span` (frames) makes 'snap' finish in 6 frames whatever the segment length. */
export function ease(name: Ease | undefined, u: number, span = 6): number {
  const x = Math.max(0, Math.min(1, u));
  switch (name) {
    case 'ease':
      return cubicInOut(x);
    case 'in':
      return x * x * x;
    case 'out':
      return 1 - Math.pow(1 - x, 3);
    case 'snap': {
      const v = Math.min(1, (x * span) / 6);
      return 1 - Math.pow(1 - v, 5);
    }
    case 'hold':
      return x >= 1 ? 1 : 0;
    default:
      return x;
  }
}

const FIELDS = ['dist', 'pitch', 'yaw', 'fov', 'lift', 'blend'] as const;

/** The camera at output frame `f` (keys sorted by frame). */
export function camAt(keys: readonly CamKey[], f: number, base: CamState = CAM_DEFAULT): CamState {
  const out: CamState = { ...base };
  for (const field of FIELDS) {
    if (out[field] === undefined && !keys.some((k) => k[field] !== undefined)) continue;
    // the last key at or before f that sets this field, and the next one after f
    let prev: CamKey | null = null;
    let next: CamKey | null = null;
    for (const k of keys) {
      if (k[field] === undefined) continue;
      if (k.f <= f) prev = k;
      else if (!next) next = k;
    }
    if (!prev && !next) continue;
    if (!prev && next) out[field] = next[field] as number;
    else if (prev && !next) out[field] = prev[field] as number;
    else if (prev && next) {
      const span = next.f - prev.f;
      const u = span > 0 ? (f - prev.f) / span : 1;
      out[field] = (prev[field] as number) + ((next[field] as number) - (prev[field] as number)) * ease(next.ease, u, span);
    }
  }
  return out;
}

/** The ramp speed at frame `f` (keys sorted; before the first key: its speed, after the last: its speed). */
export function rampAt(keys: readonly RampKey[], f: number): number {
  if (!keys.length) return 1;
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1, e] = keys[i];
    if (f <= f1) {
      const [f0, v0] = keys[i - 1];
      const span = f1 - f0;
      return v0 + (v1 - v0) * ease(e, span > 0 ? (f - f0) / span : 1, span);
    }
  }
  return keys[keys.length - 1][1];
}

/** Ticks (30 Hz) the ramp covers over frames [a, b) at 60 fps, before the game's own hit-stops and slow motion. */
export function rampTicks(keys: readonly RampKey[], a: number, b: number): number {
  let t = 0;
  for (let f = a; f < b; f++) t += rampAt(keys, f) * 0.5;
  return t;
}

/** Scale the ramp speeds on frames [a, b] by `k` (keys added at the ends so the rest of the shot is untouched). */
export function scaleRamp(keys: readonly RampKey[], a: number, b: number, k: number): RampKey[] {
  const out: RampKey[] = [];
  const at = (f: number): RampKey => [f, rampAt(keys, f)];
  const inner = keys.filter(([f]) => f > a && f < b);
  const edgeA = keys.find(([f]) => f === a) ?? at(a);
  const edgeB = keys.find(([f]) => f === b) ?? at(b);
  for (const key of keys) if (key[0] < a) out.push(key);
  // hold the shot's own speed up to the frame before a (else it would ramp toward the scaled value from the last key)
  if (a - 1 > (out.length ? out[out.length - 1][0] : -Infinity) && keys.some(([f]) => f < a)) out.push([a - 1, rampAt(keys, a - 1)]);
  out.push([a, edgeA[1] * k, edgeA[2]]);
  for (const key of inner) out.push([key[0], key[1] * k, key[2]]);
  out.push([b, edgeB[1] * k, edgeB[2]]);
  // back to the shot's own ramp right after b
  out.push([b + 1, rampAt(keys, b + 1)], ...keys.filter(([f]) => f > b + 1));
  return out;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Camera position for a look-at point (three.js metres): `distM` away, `pitchDeg` above, `yawDeg` around. */
export function orbit(target: Vec3, distM: number, pitchDeg: number, yawDeg: number): Vec3 {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  const c = Math.cos(p);
  return { x: target.x + Math.sin(y) * c * distM, y: target.y + Math.sin(p) * distM, z: target.z + Math.cos(y) * c * distM };
}

/**
 * Critically damped follow (deterministic for a fixed dt): `cur` moves toward `goal` with time constant `tau` s.
 * tau 0 = rigid.
 */
export function follow(cur: Vec3, goal: Vec3, tau: number, dt: number): Vec3 {
  if (tau <= 0) return { ...goal };
  const k = 1 - Math.exp(-dt / tau);
  return { x: cur.x + (goal.x - cur.x) * k, y: cur.y + (goal.y - cur.y) * k, z: cur.z + (goal.z - cur.z) * k };
}
