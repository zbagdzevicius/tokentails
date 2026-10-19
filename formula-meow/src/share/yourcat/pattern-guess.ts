// Copied from bad-cat/src/catmaker/pattern-guess.ts at 4889ed41 (copy, never import; import paths adapted for formula-meow).
/**
 * Coat pattern guess for all 7 patterns (GDD 6.1 step 3, full version). Works on a small RGBA sample of the head
 * and body (photo-palette `sampleCoat`), classifies every pixel as white / orange / dark / other, measures stripe
 * energy per axis and the luma of three horizontal bands (head, body, paws), and picks a pattern:
 *
 *   calico     white + orange + dark
 *   tabby      strong stripes along one axis (checked before tortie: a brown tabby is orange + dark too)
 *   tortie     orange + dark without white
 *   colorpoint a light body between a darker head and darker paws
 *   tuxedo     mostly dark with a white bib / paws
 *   bicolor    large white areas with a second colour
 *   tabby      weaker stripes
 *   solid      everything else
 *
 * It only preselects a chip; the player can always change it. Pure, deterministic, Node-testable.
 */
import { DEFAULT_CAT, rgb565, rgb888, type Pattern } from '../../types';
import { deriveSecondary, luma } from './body-colour';
import { hueSat, isCoatPixel } from './face-decal';
import { kmeans, pixelColours, type PaletteCluster } from './photo-palette';

export type CoatClass = 'white' | 'orange' | 'dark' | 'other';

export function coatClass(rgb: number): CoatClass {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const l = luma(rgb);
  const range = Math.max(r, g, b) - Math.min(r, g, b);
  if (l >= 185 && range <= 45) return 'white';
  if (l < 75) return 'dark';
  const [h, s] = hueSat(r, g, b);
  if (h >= 10 && h <= 50 && s >= 0.35 && l <= 215) return 'orange';
  return 'other';
}

export interface CoatFeatures {
  n: number;
  white: number; // shares 0..1
  orange: number;
  dark: number;
  /** Fraction of horizontally (x) / vertically (y) adjacent pixel pairs with a big luma jump. */
  stripeX: number;
  stripeY: number;
  /** Mean luma of the head band (top 30 %), the body band (40–75 %) and the paw band (bottom 15 %). */
  topLuma: number;
  bodyLuma: number;
  bottomLuma: number;
}

export const STRIPE_JUMP = 40;

export function coatFeatures(pixels: Uint8ClampedArray, w: number, h: number, skip?: (x: number, y: number) => boolean): CoatFeatures {
  const L = new Float32Array(w * h).fill(-1);
  let n = 0;
  let white = 0;
  let orange = 0;
  let dark = 0;
  const band = { top: [0, 0], body: [0, 0], bottom: [0, 0] };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (pixels[i + 3] < 128 || skip?.(x, y)) continue;
      // background (saturated green / blue / purple) is not cat
      if (!isCoatPixel(pixels[i], pixels[i + 1], pixels[i + 2])) continue;
      const rgb = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
      const l = luma(rgb);
      L[y * w + x] = l;
      n++;
      const c = coatClass(rgb);
      if (c === 'white') white++;
      else if (c === 'orange') orange++;
      else if (c === 'dark') dark++;
      const fy = (y + 0.5) / h;
      const b = fy < 0.3 ? band.top : fy >= 0.4 && fy < 0.75 ? band.body : fy >= 0.85 ? band.bottom : null;
      if (b) {
        b[0] += l;
        b[1]++;
      }
    }
  let jx = 0;
  let px = 0;
  let jy = 0;
  let py = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = L[y * w + x];
      if (a < 0) continue;
      if (x + 1 < w && L[y * w + x + 1] >= 0) {
        px++;
        if (Math.abs(a - L[y * w + x + 1]) > STRIPE_JUMP) jx++;
      }
      if (y + 1 < h && L[(y + 1) * w + x] >= 0) {
        py++;
        if (Math.abs(a - L[(y + 1) * w + x]) > STRIPE_JUMP) jy++;
      }
    }
  const mean = (b: number[]): number => (b[1] ? b[0] / b[1] : 0);
  const d = Math.max(1, n);
  return {
    n,
    white: white / d,
    orange: orange / d,
    dark: dark / d,
    stripeX: px ? jx / px : 0,
    stripeY: py ? jy / py : 0,
    topLuma: mean(band.top),
    bodyLuma: mean(band.body),
    bottomLuma: mean(band.bottom),
  };
}

export function guessPattern(f: CoatFeatures): Pattern {
  if (f.n < 16) return 'solid';
  const sMax = Math.max(f.stripeX, f.stripeY);
  const sMin = Math.min(f.stripeX, f.stripeY);
  if (f.white >= 0.12 && f.orange >= 0.1 && f.dark >= 0.08) return 'calico';
  if (sMax >= 0.12 && sMax >= sMin * 2) return 'tabby';
  if (f.orange >= 0.15 && f.dark >= 0.15 && f.white < 0.08) return 'tortie';
  if (f.bodyLuma >= 150 && f.topLuma <= f.bodyLuma - 50 && f.bottomLuma <= f.bodyLuma - 40) return 'colorpoint';
  if (f.white >= 0.1 && f.white <= 0.85 && 1 - f.white >= 0.15) {
    if (f.dark >= 0.4 && f.white <= 0.4) return 'tuxedo';
    if (f.white >= 0.25) return 'bicolor';
  }
  if (sMax >= 0.12) return 'tabby';
  return 'solid';
}

// ------------------------------------------------------------------------------------------ palette roles

export interface CoatRoles {
  base: number; // RGB888
  secondary: number;
  tertiary: number;
}

const orangeness = (rgb: number): number => {
  const [h, s] = hueSat((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
  return h >= 5 && h <= 55 ? s : 0;
};
const whiteness = (rgb: number): number => {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return luma(rgb) - (Math.max(r, g, b) - Math.min(r, g, b));
};

function pick(cs: readonly PaletteCluster[], score: (rgb: number) => number, not: number[] = []): number | null {
  let best: number | null = null;
  let bs = -Infinity;
  for (const c of cs) {
    if (not.includes(c.rgb)) continue;
    const s = score(c.rgb);
    if (s > bs) {
      bs = s;
      best = c.rgb;
    }
  }
  return best;
}

const DEFAULT_WHITE = rgb888(DEFAULT_CAT.tertiary);
const derived = (base: number): number => rgb888(deriveSecondary(rgb565(base)));

/**
 * Maps the k-means clusters to the CatSpec colour roles the renderer expects for a pattern
 * (tabby: base + stripes + belly; tuxedo / bicolor: base + white; calico: orange + dark patches on white;
 * colorpoint: light body + dark points; tortie: orange + dark mottle).
 */
export function paletteRoles(pattern: Pattern, clusters: readonly PaletteCluster[]): CoatRoles {
  if (!clusters.length) {
    const b = rgb888(DEFAULT_CAT.base);
    return { base: b, secondary: rgb888(DEFAULT_CAT.secondary), tertiary: DEFAULT_WHITE };
  }
  const main = clusters[0].rgb;
  const lightest = pick(clusters, luma) ?? main;
  const darkest = pick(clusters, (c) => -luma(c)) ?? main;
  const white = pick(clusters, whiteness);
  const whiteOk = white != null && coatClass(white) === 'white' ? white : null;
  const ter = whiteOk ?? DEFAULT_WHITE;
  switch (pattern) {
    case 'tabby': {
      const nonWhite = clusters.filter((c) => c.rgb !== whiteOk);
      const a = nonWhite[0]?.rgb ?? main;
      const b = nonWhite[1]?.rgb;
      if (b == null) return { base: a, secondary: derived(a), tertiary: ter };
      return luma(a) >= luma(b) ? { base: a, secondary: b, tertiary: ter } : { base: b, secondary: a, tertiary: ter };
    }
    case 'tuxedo':
    case 'bicolor': {
      const base = pick(clusters, (c) => (c === whiteOk ? -1e9 : -luma(c))) ?? darkest;
      return { base, secondary: derived(base), tertiary: ter };
    }
    case 'calico': {
      const orange = pick(clusters, orangeness, whiteOk != null ? [whiteOk] : []) ?? main;
      const dk = pick(clusters, (c) => -luma(c), [orange]) ?? darkest;
      return { base: orange, secondary: dk, tertiary: ter };
    }
    case 'tortie': {
      const orange = pick(clusters, orangeness) ?? main;
      const dk = pick(clusters, (c) => -luma(c), [orange]) ?? darkest;
      return { base: orange, secondary: dk, tertiary: ter };
    }
    case 'colorpoint':
      return { base: lightest, secondary: darkest, tertiary: whiteOk ?? lightest };
    default: {
      // a solid white cat stays white; otherwise the biggest non-white cluster
      const nonWhite = clusters.find((c) => c.rgb !== whiteOk && c.share >= 0.15);
      const base = nonWhite?.rgb ?? main;
      return { base, secondary: derived(base), tertiary: ter };
    }
  }
}

export interface CoatAnalysis {
  pattern: Pattern;
  features: CoatFeatures;
  clusters: PaletteCluster[];
  roles: CoatRoles;
}

/** The whole guess for one sample: k-means palette, pattern, colour roles. */
export function analyseCoat(pixels: Uint8ClampedArray, w: number, h: number, skip?: (x: number, y: number) => boolean): CoatAnalysis {
  const features = coatFeatures(pixels, w, h, skip);
  const pattern = guessPattern(features);
  const clusters = kmeans(pixelColours(pixels, w, h, true, skip)).clusters;
  return { pattern, features, clusters, roles: paletteRoles(pattern, clusters) };
}
