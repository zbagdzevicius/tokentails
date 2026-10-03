/**
 * Colour maths for the art pipeline (plan G7). Pure functions, no I/O.
 *
 * - sRGB <-> OKLab (Björn Ottosson's matrices): perceptual distance for palette snapping and the
 *   grade used by the night remap.
 * - WCAG 2.x relative luminance and contrast ratio: the 3:1 collidable gate.
 */

/** `#rrggbb` to `[r, g, b]` (0-255). Throws on anything else so a typo never ships. */
export function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, "0")).join("")}`;
}

export function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

const toLinear = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (l) => {
  const v = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.max(l, 0) ** (1 / 2.4) - 0.055;
  return clamp255(v * 255);
};

/** WCAG relative luminance of an sRGB colour, 0..1. */
export function luminance([r, g, b]) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two relative luminances, >= 1. */
export function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToOklab([r, g, b]) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** OKLCh: lightness, chroma, hue in degrees. */
export function oklabToOklch([L, a, b]) {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

export function oklchToOklab([L, C, h]) {
  const rad = (h * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

export function oklabDistance2(p, q) {
  const dL = p[0] - q[0];
  const da = p[1] - q[1];
  const db = p[2] - q[2];
  return dL * dL + da * da + db * db;
}

/**
 * A palette snapper: nearest colour in OKLab, memoised per packed RGB (sheets and plates have a
 * few thousand distinct colours, so the cache makes a 7140 x 374 sheet instant).
 */
export function makeSnapper(paletteHexes) {
  const rgbs = paletteHexes.map(hexToRgb);
  const labs = rgbs.map(rgbToOklab);
  const cache = new Map();
  return function snap(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    let hit = cache.get(key);
    if (hit === undefined) {
      const lab = rgbToOklab([r, g, b]);
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < labs.length; i++) {
        const d = oklabDistance2(lab, labs[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      hit = best;
      cache.set(key, hit);
    }
    return rgbs[hit];
  };
}

/** The packed-RGB set of a palette, for membership checks. */
export function paletteSet(paletteHexes) {
  return new Set(paletteHexes.map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    return (r << 16) | (g << 8) | b;
  }));
}
