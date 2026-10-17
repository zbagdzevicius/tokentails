/**
 * Toon palette for the cozy kitchen diorama (GDD 11.1) and colour helpers. Pure (no WebGL).
 * All colours are sRGB 0xRRGGBB; three's Color converts them to linear when they enter a material
 * or a vertex-colour attribute.
 */
import { EYE_COLORS, rgb888, type CatSpec, type RoomTheme } from '../types';

export const PAL = {
  bg: 0x2b1d2e, // page theme colour behind the diorama
  plinth: 0x6e4a3a,
  plinthEdge: 0x4f3329,
  floorA: 0xf1d7b0,
  floorB: 0xe2b88c,
  wallBack: 0xf6c9a4,
  wallSide: 0xf0b892,
  baseboard: 0xc98f6b,
  backsplashA: 0xfff4e4,
  backsplashB: 0xbfe3d6,
  wood: 0xc58a5c,
  woodDark: 0x8d5a3b,
  cabinet: 0xf7e8cf,
  cabinetDoor: 0xefdcbc,
  countertop: 0x8fc9b5,
  handle: 0x8d6e63,
  fridge: 0xcbeee2,
  fridgeTrim: 0x9fd0c0,
  stove: 0x46404f,
  stoveTop: 0x2f2b36,
  burner: 0x6b6474,
  sink: 0xd7dde3,
  sinkBasin: 0x9aa6b2,
  chrome: 0xe5e9ee,
  chair: 0xe39b6b,
  tableTop: 0xd79b6a,
  rug: 0xd9677a,
  rugB: 0xf2a6a0,
  catBed: 0x7fa7d9,
  catBedInner: 0xf8e6c9,
  sofa: 0x8f9fd6,
  shelf: 0xb47a52,
  skyTop: 0xff9f8a,
  skyMid: 0xffc49a,
  skyLow: 0xffe9b8,
  sun: 0xfff5d6,
  windowFrame: 0xfffaf2,
  windowLight: 0xffd9a0,
  leaf: 0x6fb36f,
  leafDark: 0x4e8f58,
  terracotta: 0xc96f4a,
  // human
  skin: 0xf2c4a0,
  hair: 0x5a3b2e,
  pants: 0x55607a,
  apron: 0xfbf6ee,
  outfit: 0x8c9bb5, // desaturated so the cat and the breaks pop
  shoes: 0x3b3340,
  // cues
  gold: 0xffc93c,
  glow: 0xfff3c4,
  coneLook: 0xff4d4d,
  coneTelegraph: 0xffb43c,
  shadow: 0x2b1d2e,
  heart: 0xff7aa8,
} as const;

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

/** Desaturate toward the luma grey by t (0..1). */
export function desaturateHex(c: number, t: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return mixHex(c, (y << 16) | (y << 8) | y, t);
}

/** 0xRRGGBB -> [r, g, b] in 0..1 sRGB. */
export function hexToRgb01(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
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
  // Dark coats get a dusky nose, light coats a pink one.
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

// ---------------------------------------------------------------------------------------------
// FULL build (W1-RENDER-WORLD): window skies per theme and wall/floor styles per shell
// ---------------------------------------------------------------------------------------------

/** Window sky gradient (top, mid, low), sun/moon colour and whether it is night (stars) per room theme. */
export interface SkyStyle {
  top: number;
  mid: number;
  low: number;
  orb: number;
  night: boolean;
}

export const THEME_SKY: Readonly<Record<RoomTheme, SkyStyle>> = {
  default: { top: PAL.skyTop, mid: PAL.skyMid, low: PAL.skyLow, orb: PAL.sun, night: false },
  xmas: { top: 0x1d2a5c, mid: 0x3a4d8f, low: 0x9fb4e0, orb: 0xfdf6d8, night: true },
  birthday: { top: 0x5fb8f0, mid: 0x9fd8fa, low: 0xe8f7ff, orb: 0xfff3b0, night: false },
  wedding: { top: 0xf7c9a8, mid: 0xfde3c4, low: 0xfff6e6, orb: 0xfffbe8, night: false },
  nye: { top: 0x1a1033, mid: 0x3d2466, low: 0x7a4fa3, orb: 0xfff6d8, night: true },
  valentine: { top: 0xff8fb1, mid: 0xffb8cf, low: 0xffe3ec, orb: 0xfff0f5, night: false },
  thanksgiving: { top: 0xe76f51, mid: 0xf4a261, low: 0xffd8a8, orb: 0xfff1c9, night: false },
  spring: { top: 0x7ec8f0, mid: 0xb5e2fa, low: 0xe9f9e0, orb: 0xfffbd0, night: false },
};

/** Floor pattern of a shell. */
export type FloorStyle = 'tiles' | 'planks' | 'small-tiles' | 'carpet' | 'parquet' | 'boards';

export interface ShellStyle {
  wallBack: number;
  wallSide: number;
  floorA: number;
  floorB: number;
  floor: FloorStyle;
  baseboard: number;
  /** wainscot / dado colour below 0.9 m (0 = none) */
  dado: number;
  /** thin vertical wallpaper stripes (0 = none) */
  stripe: number;
}

/** Wall and floor palettes by shell kind (matched on the shell name; ShellDef.wallColor/floorColor override). */
export const SHELL_STYLES: Readonly<Record<string, ShellStyle>> = {
  kitchen: { wallBack: PAL.wallBack, wallSide: PAL.wallSide, floorA: PAL.floorA, floorB: PAL.floorB, floor: 'tiles', baseboard: PAL.baseboard, dado: 0, stripe: 0 },
  living: { wallBack: 0xdfe8d0, wallSide: 0xd2ddc0, floorA: 0xc98d5c, floorB: 0xb57a4c, floor: 'planks', baseboard: 0xf4ead8, dado: 0, stripe: 0xcfdcbc },
  bathroom: { wallBack: 0xd6eef0, wallSide: 0xc6e3e6, floorA: 0xf4f7f8, floorB: 0x9fd3d8, floor: 'small-tiles', baseboard: 0xffffff, dado: 0xffffff, stripe: 0 },
  office: { wallBack: 0xe3e0f2, wallSide: 0xd5d1ea, floorA: 0xa98a6d, floorB: 0x957659, floor: 'parquet', baseboard: 0x5d4b6e, dado: 0, stripe: 0 },
  party: { wallBack: 0xffe0ea, wallSide: 0xffd0de, floorA: 0xe7c08f, floorB: 0xd4a873, floor: 'boards', baseboard: 0xc96f8a, dado: 0, stripe: 0xffc7d8 },
  bedroom: { wallBack: 0xe9dcf2, wallSide: 0xddcdea, floorA: 0xc9b8d9, floorB: 0xbba8cd, floor: 'carpet', baseboard: 0xfff6ec, dado: 0, stripe: 0 },
  boss: { wallBack: 0xfbe6c8, wallSide: 0xf3d8b4, floorA: 0xd8a877, floorB: 0xc38f5f, floor: 'parquet', baseboard: 0x8d5a3b, dado: 0xf0d2a8, stripe: 0 },
};
