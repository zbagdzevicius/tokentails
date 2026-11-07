/**
 * Colour-vision test helpers (MAP-GAPS A4, A7): Machado et al. 2009 full-severity deuteranopia and protanopia in
 * linear sRGB, then CIE76 ΔE in Lab (D65).
 */
type RGB = [number, number, number];

export function hex(c: string): RGB {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const lin = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const M = {
  none: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  deut: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  prot: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
};
export type Vision = keyof typeof M;

function lab([r, g, b]: RGB, v: Vision): RGB {
  const [R0, G0, B0] = [lin(r), lin(g), lin(b)];
  const m = M[v];
  const R = Math.min(1, Math.max(0, m[0] * R0 + m[1] * G0 + m[2] * B0));
  const G = Math.min(1, Math.max(0, m[3] * R0 + m[4] * G0 + m[5] * B0));
  const B = Math.min(1, Math.max(0, m[6] * R0 + m[7] * G0 + m[8] * B0));
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** CIE76 ΔE between two #rrggbb colours as seen with `v`. */
export function deltaE(a: string, b: string, v: Vision = 'none'): number {
  const p = lab(hex(a), v);
  const q = lab(hex(b), v);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
