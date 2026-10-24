// Pure animation maths for the CAT-AUDIO rigs (no three.js scene, no DOM): gait cycles, the tail curve, the
// stretching tail pole, flips and springs. Kept pure so vitest can check it in node.

/** Run-cycle frequency (cycles per second) at a forward speed (u/s). Stylised: busy little legs, never a blur. */
export function strideRate(speed: number): number {
  const v = Math.max(0, speed);
  return Math.min(9.5, 1.2 + v * 0.3);
}

export interface Gait {
  /** leg pitch (rad, + = foot swings back) for the 4 legs: front-left, front-right, back-left, back-right */
  fl: number;
  fr: number;
  bl: number;
  br: number;
  /** body pitch (rad, + = nose down) */
  pitch: number;
  /** body lift above the rest height (u, >= 0) */
  bob: number;
  /** 0..1 how stretched the spine is (bound gait: extended in the air phase) */
  stretch: number;
}

/**
 * A kitten's bound gait: the front pair and the back pair move together (a tiny left/right offset reads as fur and
 * life), the spine flexes and extends, and the body lifts in the suspension phase. amp 0..1 scales everything.
 */
export function gait(phase: number, amp: number, out: Gait): Gait {
  const a = Math.max(0, Math.min(1, amp));
  const p = phase * Math.PI * 2;
  const front = Math.sin(p);
  const back = Math.sin(p + Math.PI * 0.85);
  const swing = 0.95 * a;
  out.fl = -front * swing;
  out.fr = -Math.sin(p + 0.35) * swing;
  out.bl = -back * swing;
  out.br = -Math.sin(p + Math.PI * 0.85 + 0.35) * swing;
  out.pitch = Math.sin(p + Math.PI * 0.5) * 0.16 * a;
  out.bob = Math.max(0, Math.sin(p * 2 - 0.6)) * 0.085 * a;
  out.stretch = 0.5 + 0.5 * Math.sin(p - 0.4);
  return out;
}
export const newGait = (): Gait => ({ fl: 0, fr: 0, bl: 0, br: 0, pitch: 0, bob: 0, stretch: 0 });

/** Ease out cubic, clamped. */
export const easeOut = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return 1 - (1 - x) ** 3;
};
/** Smoothstep, clamped. */
export const smooth = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};
/** A bell curve 0 -> 1 -> 0 over u in 0..1. */
export const hump = (u: number) => (u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI));

/** Pounce somersault: total body pitch (rad) at time t of a flip lasting dur. One full forward turn, eased. */
export function flipAngle(t: number, dur: number): number {
  if (t <= 0 || dur <= 0) return 0;
  if (t >= dur) return Math.PI * 2;
  const u = t / dur;
  // fast through the middle, soft at both ends
  return Math.PI * 2 * (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
}

/** A damped spring wobble (for squash, the tail boing): starts at 1, oscillates, decays to 0. */
export function springWobble(t: number, freq = 9, decay = 6): number {
  if (t < 0) return 0;
  return Math.exp(-decay * t) * Math.cos(t * freq * Math.PI * 2 * 0.25);
}

export interface TailPose {
  /** base direction pitch (rad): 0 = straight back, + = up */
  lift: number;
  /** curl per segment (rad, + = curls up and forward at the tip) */
  curl: number;
  /** lateral sway amplitude (rad per segment) and its wave phase */
  sway: number;
  phase: number;
  /** total length (u) */
  length: number;
  /** extra lateral bend (rad per segment), e.g. balancing on the leaf */
  bend: number;
  /** initial yaw of the base (rad, + = toward the rig's left) */
  yaw0?: number;
}

/**
 * The tail as a chain of n points from the base (written into out as x,y,z triples, rig local: +z forward,
 * +y up, +x left). Each segment turns by the curl (pitch) and a travelling sway wave (yaw).
 */
export function tailCurve(base: readonly [number, number, number], n: number, pose: TailPose, out: Float32Array): Float32Array {
  let x = base[0];
  let y = base[1];
  let z = base[2];
  let pitch = pose.lift; // angle above the backward horizontal
  let yaw = pose.yaw0 ?? 0;
  const seg = pose.length / Math.max(1, n - 1);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  for (let i = 1; i < n; i++) {
    const k = i / (n - 1);
    pitch += pose.curl * (0.4 + k * 1.2);
    yaw += Math.sin(pose.phase - i * 0.55) * pose.sway * (0.5 + k) + pose.bend;
    const cp = Math.cos(pitch);
    // backward is -z; yaw swings it sideways (+x = left)
    x += Math.sin(yaw) * cp * seg;
    y += Math.sin(pitch) * seg;
    z -= Math.cos(yaw) * cp * seg;
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

/**
 * The tail-vault pole: n points on a straight springy line from `from` to `to` (rig local), with a sideways
 * standing-wave wobble of amplitude `wobble` (u) and a slight bow. Written into out as x,y,z triples.
 */
export function poleCurve(from: readonly [number, number, number], to: readonly [number, number, number], n: number, wobble: number, t: number, out: Float32Array): Float32Array {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    const w = Math.sin(k * Math.PI) * (wobble * Math.sin(t * 38) + 0.06);
    out[i * 3] = from[0] + dx * k + w;
    out[i * 3 + 1] = from[1] + dy * k + Math.sin(k * Math.PI) * 0.12;
    out[i * 3 + 2] = from[2] + dz * k;
  }
  return out;
}

/** Length of a polyline stored as x,y,z triples. */
export function polyLength(pts: Float32Array, n: number): number {
  let L = 0;
  for (let i = 1; i < n; i++) {
    const dx = pts[i * 3] - pts[i * 3 - 3];
    const dy = pts[i * 3 + 1] - pts[i * 3 - 2];
    const dz = pts[i * 3 + 2] - pts[i * 3 - 1];
    L += Math.hypot(dx, dy, dz);
  }
  return L;
}

/** Exponential approach factor for frame-rate independent smoothing. */
export const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * Math.max(0, dt));
