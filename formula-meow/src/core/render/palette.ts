// Copied from bad-cat/src/render/palette.ts at 4889ed41 (trimmed to the colour helpers the cat rig needs).
/** Colour helpers for the cat rig. Pure (no WebGL). Colours are sRGB 0xRRGGBB. */
import { EYE_COLORS, rgb888, type CatSpec } from '../../types';

/** Linear blend of two 0xRRGGBB colours (t 0..1). */
export function mixHex(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Multiply brightness (f < 1 darkens, f > 1 lightens, clamped). */
export function shadeHex(c: number, f: number): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

export interface CatColors {
  base: number;
  secondary: number;
  tertiary: number;
  eye: number;
  nose: number;
  innerEar: number;
}

/** CatSpec (RGB565 fields) -> render colours (0xRRGGBB). */
export function catColors(spec: CatSpec): CatColors {
  const base = rgb888(spec.base & 0xffff);
  const secondary = rgb888(spec.secondary & 0xffff);
  const tertiary = rgb888(spec.tertiary & 0xffff);
  const eye = EYE_COLORS[Math.max(0, Math.min(EYE_COLORS.length - 1, spec.eyes | 0))] ?? EYE_COLORS[0];
  const lum = 0.299 * ((base >> 16) & 255) + 0.587 * ((base >> 8) & 255) + 0.114 * (base & 255);
  return {
    base,
    secondary,
    tertiary,
    eye,
    nose: lum < 70 ? 0x5a3a44 : 0xf08a9a,
    innerEar: lum < 70 ? 0x8a5a66 : 0xf6b3bd,
  };
}

/** Pattern -> shader index (cat-material.ts). Unknown patterns fall back to solid. */
export const PATTERN_INDEX: Readonly<Record<string, number>> = {
  solid: 0,
  tabby: 1,
  tuxedo: 2,
  bicolor: 3,
  calico: 4,
  colorpoint: 5,
  tortie: 6,
};
