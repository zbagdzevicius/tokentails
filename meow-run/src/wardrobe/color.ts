// Colour helpers for the Wardrobe (pure, node-importable): hex <-> rgb, mixing, shading, CSS strings.
// Colours are 0xRRGGBB numbers everywhere (three.js style); canvas painters turn them into CSS with css().

export type RGB = [number, number, number];

const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(Number.isFinite(v) ? v : 0)));

/** 0xRRGGBB -> [r, g, b] (0..255) */
export function rgbOf(hex: number): RGB {
  const h = clamp24(hex);
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}

/** r, g, b (0..255, clamped and rounded) -> 0xRRGGBB */
export function hexOf(r: number, g: number, b: number): number {
  return (clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b);
}

function clamp24(hex: number): number {
  if (!Number.isFinite(hex)) return 0;
  return Math.max(0, Math.min(0xffffff, Math.floor(hex)));
}

/** linear mix of two colours, t = 0 gives a, 1 gives b (t is clamped) */
export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const A = rgbOf(a);
  const B = rgbOf(b);
  return hexOf(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k);
}

/** k > 0 lightens toward white, k < 0 darkens toward black (|k| <= 1) */
export function shade(hex: number, k: number): number {
  return k >= 0 ? mix(hex, 0xffffff, k) : mix(hex, 0x000000, -k);
}

/** perceived brightness 0..1 (Rec. 601 luma) */
export function luma(hex: number): number {
  const [r, g, b] = rgbOf(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** CSS colour: '#rrggbb', or 'rgba(r,g,b,a)' when alpha < 1 */
export function css(hex: number, alpha = 1): string {
  const [r, g, b] = rgbOf(hex);
  if (alpha >= 1) return `#${clamp24(hex).toString(16).padStart(6, '0')}`;
  return `rgba(${r},${g},${b},${Math.max(0, alpha).toFixed(3)})`;
}

/** hue 0..360, saturation and lightness 0..1 -> 0xRRGGBB (the rainbow trail) */
export function hsl(h: number, s: number, l: number): number {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return hexOf((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
