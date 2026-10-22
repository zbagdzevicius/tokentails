/**
 * Theme palettes (GDD 6.1). Colours are sRGB 0xRRGGBB. One per theme (0 kitchen, 1 rooftops, 2 laundry, 3 yarn canyon,
 * 4 café, 5 shelter, 6 the battle rug); the road always reads darker than the floor round it.
 */
import type { ThemeId } from '../../types';

export interface Theme {
  name: string;
  skyTop: number;
  skyHorizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  groundB: number;
  road: number;
  roadB: number;
  line: number;
  curbA: number;
  curbB: number;
  shoulder: number;
  wallA: number;
  wallB: number;
  /** emissive trim on the wall tops (0 = none) */
  neonA: number;
  neonB: number;
  skirt: number;
  pad: number;
  lowgrip: number;
  accent: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  night: boolean;
}

export const THEMES: Record<ThemeId, Theme> = {
  0: {
    name: 'Kitchen',
    skyTop: 0xffd98a,
    skyHorizon: 0xfff4d6,
    fog: 0xfff0cc,
    fogNear: 120,
    fogFar: 420,
    ground: 0xf3e2c0,
    groundB: 0xe8d0a6,
    road: 0x8fc9b5,
    roadB: 0x84bfab,
    line: 0xfffaf0,
    curbA: 0xf25c3b,
    curbB: 0xfff7ea,
    shoulder: 0xd9b48a,
    wallA: 0xf25c3b,
    wallB: 0xfff3dc,
    neonA: 0,
    neonB: 0,
    skirt: 0xc58a5c,
    pad: 0xffc93c,
    lowgrip: 0x7fd3ff,
    accent: 0xf25c3b,
    sun: 0xfff2d8,
    sunIntensity: 2.2,
    hemiSky: 0xfff6e0,
    hemiGround: 0xc9a27a,
    hemiIntensity: 1.6,
    night: false,
  },
  1: {
    name: 'Rooftops',
    skyTop: 0x0d0822,
    skyHorizon: 0x5a1f6e,
    fog: 0x24124a,
    fogNear: 90,
    fogFar: 380,
    ground: 0x1a1238,
    groundB: 0x221849,
    // lit wet asphalt: clearly lighter than the dark roofs beside it (the road, off-road and karts used to blend)
    road: 0x5d5786,
    roadB: 0x56507e,
    line: 0x2cf6f3,
    curbA: 0xff3ea5,
    curbB: 0x2cf6f3,
    shoulder: 0x6f6896,
    wallA: 0x4a3f6b,
    wallB: 0x3b3258,
    neonA: 0xff3ea5,
    neonB: 0x2cf6f3,
    skirt: 0x2a2240,
    pad: 0x2cf6f3,
    lowgrip: 0x7f6bff,
    accent: 0xff3ea5,
    sun: 0xc8baff,
    sunIntensity: 1.5,
    hemiSky: 0x9a7ee6,
    hemiGround: 0x2a1a3a,
    hemiIntensity: 1.7,
    night: true,
  },
  2: {
    name: 'Laundry',
    skyTop: 0xbfe3f5,
    skyHorizon: 0xf6f0ff,
    fog: 0xeef2ff,
    fogNear: 120,
    fogFar: 420,
    ground: 0xeef2f8,
    groundB: 0xdde5f2,
    road: 0x8e9cc8,
    roadB: 0x8794bf,
    line: 0xffffff,
    curbA: 0x9fd3ff,
    curbB: 0xffffff,
    shoulder: 0xf3c6d8,
    wallA: 0x9fd3ff,
    wallB: 0xffffff,
    neonA: 0,
    neonB: 0,
    skirt: 0xc7cfe0,
    pad: 0xff8fb1,
    lowgrip: 0x7fd3ff,
    accent: 0xff8fb1,
    sun: 0xffffff,
    sunIntensity: 2,
    hemiSky: 0xffffff,
    hemiGround: 0xb0b8d0,
    hemiIntensity: 1.6,
    night: false,
  },
  3: {
    name: 'Yarn Canyon',
    skyTop: 0x7b2cbf,
    skyHorizon: 0xff8a3d,
    fog: 0xf0a070,
    fogNear: 110,
    fogFar: 400,
    ground: 0xe08a5a,
    groundB: 0xd47b4c,
    road: 0x8a4a6e,
    roadB: 0x804466,
    line: 0xffe0a0,
    curbA: 0xff3ea5,
    curbB: 0xffe0a0,
    shoulder: 0xc76a48,
    wallA: 0xff8a3d,
    wallB: 0x7b2cbf,
    neonA: 0,
    neonB: 0,
    skirt: 0xa0583c,
    pad: 0xffc93c,
    lowgrip: 0x7fd3ff,
    accent: 0xff8a3d,
    sun: 0xffd0a0,
    sunIntensity: 2,
    hemiSky: 0xffd0e0,
    hemiGround: 0x7b3c4c,
    hemiIntensity: 1.5,
    night: false,
  },
  4: {
    name: 'Cat Café',
    skyTop: 0x150d2a,
    skyHorizon: 0x47265e,
    fog: 0x2a1840,
    fogNear: 90,
    fogFar: 380,
    ground: 0x6b4430,
    groundB: 0x5e3b29,
    road: 0x4b3a5e,
    roadB: 0x45355a,
    line: 0xffe6b0,
    curbA: 0xffc93c,
    curbB: 0xfff3dc,
    shoulder: 0x4a3024,
    wallA: 0x3b2a4a,
    wallB: 0x4d3660,
    neonA: 0xffc93c,
    neonB: 0xff8fb1,
    skirt: 0x3a2618,
    pad: 0xffc93c,
    lowgrip: 0x7fd3ff,
    accent: 0xffc93c,
    sun: 0xffd9a0,
    sunIntensity: 1.2,
    hemiSky: 0xd6a8ff,
    hemiGround: 0x3a2618,
    hemiIntensity: 1.5,
    night: true,
  },
  5: {
    name: 'Shelter',
    skyTop: 0xffd6e8,
    skyHorizon: 0xfff4f8,
    fog: 0xfff0f5,
    fogNear: 120,
    fogFar: 420,
    ground: 0xf6e7da,
    groundB: 0xeedccc,
    road: 0xc8b6e2,
    roadB: 0xbeacd8,
    line: 0xffffff,
    curbA: 0xff3ea5,
    curbB: 0xffffff,
    shoulder: 0xe9d3c0,
    wallA: 0xff8fb1,
    wallB: 0xfff3dc,
    neonA: 0,
    neonB: 0,
    skirt: 0xd8bfa8,
    pad: 0xff3ea5,
    lowgrip: 0x7fd3ff,
    accent: 0xff3ea5,
    sun: 0xfff2e8,
    sunIntensity: 2.1,
    hemiSky: 0xfff0f6,
    hemiGround: 0xc9a88a,
    hemiIntensity: 1.6,
    night: false,
  },
  6: {
    name: 'Living Room Rug',
    skyTop: 0xffe3b8,
    skyHorizon: 0xfff4e0,
    fog: 0xfff0d8,
    fogNear: 110,
    fogFar: 400,
    ground: 0xc96f4a,
    groundB: 0xb8613f,
    road: 0xe0a46a,
    roadB: 0xd89a60,
    line: 0xfff3dc,
    curbA: 0x3aa8ff,
    curbB: 0xfff3dc,
    shoulder: 0xa5523a,
    wallA: 0x6b4a3a,
    wallB: 0x8a5e48,
    neonA: 0,
    neonB: 0,
    skirt: 0x8a5e48,
    pad: 0xffc93c,
    lowgrip: 0x7fd3ff,
    accent: 0x3aa8ff,
    sun: 0xfff0d8,
    sunIntensity: 2.1,
    hemiSky: 0xfff6e0,
    hemiGround: 0xa5523a,
    hemiIntensity: 1.6,
    night: false,
  },
  7: {
    name: 'Reserved',
    skyTop: 0xffd98a,
    skyHorizon: 0xfff4d6,
    fog: 0xfff0cc,
    fogNear: 120,
    fogFar: 420,
    ground: 0xf3e2c0,
    groundB: 0xe8d0a6,
    road: 0x8fc9b5,
    roadB: 0x84bfab,
    line: 0xfffaf0,
    curbA: 0xf25c3b,
    curbB: 0xfff7ea,
    shoulder: 0xd9b48a,
    wallA: 0xf25c3b,
    wallB: 0xfff3dc,
    neonA: 0,
    neonB: 0,
    skirt: 0xc58a5c,
    pad: 0xffc93c,
    lowgrip: 0x7fd3ff,
    accent: 0xf25c3b,
    sun: 0xfff2d8,
    sunIntensity: 2.2,
    hemiSky: 0xfff6e0,
    hemiGround: 0xc9a27a,
    hemiIntensity: 1.6,
    night: false,
  },
};

export function themeOf(id: number): Theme {
  return THEMES[(id & 7) as ThemeId] ?? THEMES[0];
}

/** Mix two sRGB colours (`f` = share of `b`). */
function mixHex(a: number, b: number, f: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f) & 255;
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** The night tint every after-dark colour leans toward (a deep blue-violet). */
const NIGHT_TINT = 0x1a1640;

/**
 * Iteration 4 (F11, Wild Card "Night", render only): the after-dark version of a day theme. A night theme comes back
 * unchanged. The sky turns deep blue with the theme's accent low on the horizon; the floor, walls and road lean
 * toward the night tint (the road stays darker than the floor beside it, and the line, curbs and pads stay bright so
 * the racing surface still reads first); the sun becomes a cool moon; and `night: true` brings the warm fill light,
 * the stars and the kart headlights (`core/render/world-view.ts`, `core/render/night.ts`). Wall tops get neon trim in
 * the theme's accent and cyan, as the night tracks have.
 */
export function nightTheme(base: Theme): Theme {
  if (base.night) return base;
  const dim = (c: number, f: number) => mixHex(c, NIGHT_TINT, f);
  return {
    ...base,
    skyTop: 0x0a0a26,
    skyHorizon: mixHex(0x2b2156, base.accent, 0.22),
    fog: 0x1d1840,
    fogNear: base.fogNear * 0.8,
    fogFar: base.fogFar * 0.9,
    ground: dim(base.ground, 0.45),
    groundB: dim(base.groundB, 0.45),
    road: dim(base.road, 0.5),
    roadB: dim(base.roadB, 0.5),
    curbA: dim(base.curbA, 0.15),
    curbB: dim(base.curbB, 0.15),
    shoulder: dim(base.shoulder, 0.45),
    wallA: dim(base.wallA, 0.35),
    wallB: dim(base.wallB, 0.35),
    neonA: base.accent,
    neonB: 0x2cf6f3,
    skirt: dim(base.skirt, 0.5),
    sun: 0xb4c0ff,
    sunIntensity: 1.25,
    hemiSky: 0x8a84d6,
    hemiGround: dim(base.hemiGround, 0.5),
    hemiIntensity: 1.45,
    night: true,
  };
}
