/**
 * The edit as data (pure, no ffmpeg): per cut and aspect, which picture each output frame is built from, which frames
 * need a per-frame geometry pass (bark push-ins, skin bumps, the 9:16 HUD band), and the ffmpeg expressions for the
 * shakes, grade windows and chromatic accents. edit.mjs runs it; edit.test.mjs checks it.
 */
import { ASPECTS, CUTS, post, sourceFrame } from './mg-timeline.mjs';

export const pad4 = (f) => `f${String(f).padStart(4, '0')}.png`;

/** Quint-out ("snap" in the storyboard) and cubic in-out. */
export const easing = {
  snap: (t) => 1 - (1 - t) ** 5,
  ease: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  linear: (t) => t,
};

/** Zoom factor (and anchor) per frame from the push and bump lists. Frames absent from the map are untouched. */
export function zoomFrames(cut, aspect, edl) {
  const { W, H } = ASPECTS[aspect];
  const out = new Map();
  for (const p of edl.push[cut] ?? []) {
    if (!p.anchor[aspect]) continue;
    const [ax, ay] = p.anchor[aspect];
    const ez = easing[p.ease ?? 'snap'] ?? easing.snap;
    const span = Math.max(1, p.f1 - p.f0);
    const to = p.to ?? 1.35;
    for (let f = p.f0; f <= p.holdTo; f++) {
      const t = Math.min(1, (f - p.f0) / span);
      out.set(f, { z: 1 + (to - 1) * ez(t), ax, ay, kind: 'push' });
    }
  }
  for (const b of post(cut).bump) {
    edl.bump.curve.forEach((z, i) => {
      if (z !== 1) out.set(b.f + i, { z, ax: W / 2, ay: H / 2, kind: 'bump' });
    });
  }
  return out;
}

/**
 * Scale by z about (ax, ay) and crop back to W x H: the scaled size (even) and the integer crop offset that keeps the
 * anchor where it was on screen.
 */
export function zoomGeometry(W, H, { z, ax, ay }) {
  const sw = 2 * Math.round((W * z) / 2);
  const sh = 2 * Math.round((H * z) / 2);
  const kx = sw / W;
  const ky = sh / H;
  const x = Math.min(sw - W, Math.max(0, Math.round(ax * kx - ax)));
  const y = Math.min(sh - H, Math.max(0, Math.round(ay * ky - ay)));
  return { sw, sh, x, y };
}

/**
 * The base picture per output frame: 'plate' (the motion-graphics compositor's opaque plate: S04 photo card, end-card
 * background), 'band' (9:16 HUD shot), 'zoom' (push/bump) or 'footage'. Every base frame is rgb24 at W x H.
 */
export function framePlan(cut, aspect, edl, { hasPlate, footageSize }) {
  const n = CUTS[cut];
  const zoom = zoomFrames(cut, aspect, edl);
  const band = edl.band[aspect];
  const plan = [];
  for (let f = 0; f < n; f++) {
    const src = sourceFrame(cut, f);
    if (hasPlate(f)) {
      plan.push({ f, src, kind: 'plate' });
      continue;
    }
    const size = footageSize(src);
    if (band && size && (size[0] !== ASPECTS[aspect].W || size[1] !== ASPECTS[aspect].H)) plan.push({ f, src, kind: 'band', band });
    else if (zoom.has(f)) plan.push({ f, src, kind: 'zoom', zoom: zoom.get(f) });
    else plan.push({ f, src, kind: 'footage' });
  }
  return plan;
}

/** `between(n,a,b)+...` for inclusive frame ranges; '0' when empty. */
export function rangesExpr(ranges) {
  return ranges.length ? ranges.map(([a, b]) => `between(n,${a},${b})`).join('+') : '0';
}

/**
 * Camera shake as crop offsets: each event decays quadratically over `decay` frames, on a fixed pseudo-random path
 * (deterministic, the same every render). Returns the x and y expressions in output frames (n).
 */
export function shakeExpr(shakes) {
  if (!shakes.length) return { x: '0', y: '0' };
  const term = (s, fn, k, ph) => `between(n,${s.f},${s.f + s.decay})*${s.px}*pow(1-(n-${s.f})/${s.decay},2)*${fn}((n-${s.f})*${k}+${ph})`;
  return {
    x: shakes.map((s) => term(s, 'sin', 2.1, ((s.f * 0.37) % 6.28).toFixed(3))).join('+'),
    y: shakes.map((s) => term(s, 'cos', 2.7, ((s.f * 0.53) % 6.28).toFixed(3))).join('+'),
  };
}

/** The same shake in JS (for tests and the report). */
export function shakeAt(shakes, n) {
  let x = 0;
  let y = 0;
  for (const s of shakes) {
    if (n < s.f || n > s.f + s.decay) continue;
    const e = s.px * (1 - (n - s.f) / s.decay) ** 2;
    x += e * Math.sin((n - s.f) * 2.1 + Number(((s.f * 0.37) % 6.28).toFixed(3)));
    y += e * Math.cos((n - s.f) * 2.7 + Number(((s.f * 0.53) % 6.28).toFixed(3)));
  }
  return { x, y };
}

/** Grade windows for a cut: G = graded frames, D = [[a, b, saturation]] extra desaturation, chroma accents. */
export function gradeWindows(cut, edl) {
  const n = CUTS[cut];
  const no = edl.grade.noGrade[cut] ?? [];
  const graded = [];
  let a = 0;
  for (const [x, y] of [...no].sort((p, q) => p[0] - q[0])) {
    if (x > a) graded.push([a, x - 1]);
    a = y + 1;
  }
  if (a <= n - 1) graded.push([a, n - 1]);
  const strong = post(cut).rgb.map((r) => [r.f, r.f + r.frames - 1]);
  return { graded, desat: edl.grade.desaturate[cut] ?? [], strong, light: edl.chroma.lightFrames[cut] ?? [] };
}

/** Vignette mask (black, alpha) matching ffmpeg's vignette at `angle`, scaled to `strength`, as a geq alpha expression. */
export function vignetteAlphaExpr(W, H, { angle, strength }) {
  const d = `hypot(X-${W / 2},Y-${H / 2})/hypot(${W / 2},${H / 2})`;
  return `255*${strength}*(1-pow(cos(${angle}*${d}),4))`;
}
