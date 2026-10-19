/** Theme palettes (GDD 6.1). Colours are sRGB 0xRRGGBB. Laundry and Yarn are placeholders until their lane polish. */
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
    road: 0x3a3456,
    roadB: 0x34304f,
    line: 0x2cf6f3,
    curbA: 0xff3ea5,
    curbB: 0x2cf6f3,
    shoulder: 0x5b5470,
    wallA: 0x4a3f6b,
    wallB: 0x3b3258,
    neonA: 0xff3ea5,
    neonB: 0x2cf6f3,
    skirt: 0x2a2240,
    pad: 0x2cf6f3,
    lowgrip: 0x7f6bff,
    accent: 0xff3ea5,
    sun: 0xb8a6ff,
    sunIntensity: 1.3,
    hemiSky: 0x8a6bd8,
    hemiGround: 0x2a1a3a,
    hemiIntensity: 1.5,
    night: true,
  },
  2: {
    name: 'Laundry',
    skyTop: 0xbfe3f5,
    skyHorizon: 0xf6f0ff,
    fog: 0xeef2ff,
    fogNear: 120,
    fogFar: 420,
    ground: 0xe8eef6,
    groundB: 0xdfe6f0,
    road: 0xb7c3e0,
    roadB: 0xadb9d6,
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
};

export function themeOf(id: number): Theme {
  return THEMES[(id & 3) as ThemeId];
}
