// Theme palettes and landscape mixes (WORLD-ART). Pure data: node-importable.
import type { ThemeId } from '../core/types';

export interface StyleMix {
  /** share of side terrain that is a rising sandstone cliff / rolling hills / a ledge dropping to the valley */
  cliff: number;
  hill: number;
  drop: number;
  /** cliff top heights (u above the path edge) */
  cliffMin: number;
  cliffMax: number;
  /** rolling hill amplitude (u) */
  hillAmp: number;
  /** how far below the lowest nearby path the valley floor sits (u) */
  valleyDepth: number;
}

export interface Palette {
  // sky (gradient dome + sun glow)
  zenith: number;
  skyMid: number;
  horizon: number;
  sunGlow: number;
  /** far mountain silhouettes (near ridge, far ridge) */
  ridgeNear: number;
  ridgeFar: number;
  cloud: number;
  cloudShade: number;
  // fog = horizon haze
  fog: number;
  // lights
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  sunDir: [number, number, number];
  exposure: number;
  // ground
  grassA: number;
  grassB: number;
  grassDry: number;
  verge: number;
  dirt: number;
  dirtDark: number;
  dirtLight: number;
  rockA: number;
  rockB: number;
  rockC: number;
  rockDark: number;
  valley: number;
  // foliage
  leafA: number;
  leafB: number;
  leafDark: number;
  trunk: number;
  bamboo: number;
  bush: number;
  flowers: number[];
  // water
  waterDeep: number;
  waterShallow: number;
  foam: number;
  mix: StyleMix;
  /** extra: bamboo groves density 0..1 */
  bambooAmt: number;
}

export const PALETTES: Record<ThemeId, Palette> = {
  meadow: {
    zenith: 0x2f86e8,
    skyMid: 0x6fb8f4,
    horizon: 0xcfe9f7,
    sunGlow: 0xfff6d8,
    ridgeNear: 0x8fb7d4,
    ridgeFar: 0xb3d1e6,
    cloud: 0xffffff,
    cloudShade: 0xb9cde6,
    fog: 0xc6e2f2,
    sun: 0xfff1d6,
    sunI: 2.6,
    hemiSky: 0xd6ecff,
    hemiGround: 0x7d8f4c,
    hemiI: 1.55,
    sunDir: [0.5, 0.78, -0.38],
    exposure: 1.05,
    grassA: 0x6cc23a,
    grassB: 0x8fd24a,
    grassDry: 0xb8c95a,
    verge: 0x9fae58,
    dirt: 0xd8ac72,
    dirtDark: 0xb98a55,
    dirtLight: 0xe8c48e,
    rockA: 0xd9a96a,
    rockB: 0xc48f55,
    rockC: 0xe6bf86,
    rockDark: 0x9a6c42,
    valley: 0x77b84a,
    leafA: 0x3f9e35,
    leafB: 0x5fbb3e,
    leafDark: 0x2c7a2c,
    trunk: 0x7a5232,
    bamboo: 0x8cc84a,
    bush: 0x46a338,
    flowers: [0xffffff, 0xffe066, 0xff9ec7, 0xffb347],
    waterDeep: 0x1aa3c7,
    waterShallow: 0x5fe0e0,
    foam: 0xf4ffff,
    mix: { cliff: 0.36, hill: 0.34, drop: 0.3, cliffMin: 9, cliffMax: 26, hillAmp: 7, valleyDepth: 26 },
    bambooAmt: 0.35,
  },
  gorge: {
    zenith: 0x2a7fe0,
    skyMid: 0x68b2f0,
    horizon: 0xcae6f4,
    sunGlow: 0xfff3d4,
    ridgeNear: 0x86aecb,
    ridgeFar: 0xaccbe0,
    cloud: 0xffffff,
    cloudShade: 0xb4c8e2,
    fog: 0xc0dff0,
    sun: 0xfff0d6,
    sunI: 2.5,
    hemiSky: 0xd2e9ff,
    hemiGround: 0x6f8048,
    hemiI: 1.55,
    sunDir: [-0.42, 0.8, -0.42],
    exposure: 1.05,
    grassA: 0x62b83a,
    grassB: 0x84c948,
    grassDry: 0xa9bd56,
    verge: 0x95a656,
    dirt: 0xd0a26a,
    dirtDark: 0xb0814f,
    dirtLight: 0xe2bc86,
    rockA: 0xcf9c63,
    rockB: 0xb5804c,
    rockC: 0xdeb47c,
    rockDark: 0x8a5f3a,
    valley: 0x6aae46,
    leafA: 0x358f33,
    leafB: 0x52ae3c,
    leafDark: 0x266e2a,
    trunk: 0x6e4a2e,
    bamboo: 0x86c247,
    bush: 0x3f9a36,
    flowers: [0xffffff, 0xfff07a, 0xc8a8ff],
    waterDeep: 0x1597c2,
    waterShallow: 0x52dcdc,
    foam: 0xf2ffff,
    mix: { cliff: 0.48, hill: 0.22, drop: 0.3, cliffMin: 16, cliffMax: 40, hillAmp: 8, valleyDepth: 30 },
    bambooAmt: 0.15,
  },
  sunset: {
    zenith: 0x3d4fa8,
    skyMid: 0xc77fb0,
    horizon: 0xffbe86,
    sunGlow: 0xffe2a0,
    ridgeNear: 0xa47ba6,
    ridgeFar: 0xd29aa8,
    cloud: 0xffe0c8,
    cloudShade: 0xc98aa8,
    fog: 0xf5b996,
    sun: 0xffc285,
    sunI: 2.5,
    hemiSky: 0xffd2c0,
    hemiGround: 0x7e6050,
    hemiI: 1.4,
    sunDir: [-0.55, 0.32, -0.62],
    exposure: 1.0,
    grassA: 0x6fbf4a,
    grassB: 0x98cf58,
    grassDry: 0xc8c25a,
    verge: 0xaaa85a,
    dirt: 0xdca06a,
    dirtDark: 0xb87c50,
    dirtLight: 0xecba86,
    rockA: 0xe09a62,
    rockB: 0xc27a4c,
    rockC: 0xeeb27c,
    rockDark: 0x94563a,
    valley: 0x7cae4c,
    leafA: 0x4f8f34,
    leafB: 0x74aa3c,
    leafDark: 0x3a6c2c,
    trunk: 0x6e4630,
    bamboo: 0x9cc24c,
    bush: 0x5a9a38,
    flowers: [0xffffff, 0xffd166, 0xff8fb0, 0xffa55c],
    waterDeep: 0x2a8fbf,
    waterShallow: 0x7fd6d0,
    foam: 0xfff6ee,
    mix: { cliff: 0.24, hill: 0.56, drop: 0.2, cliffMin: 8, cliffMax: 20, hillAmp: 8, valleyDepth: 26 },
    bambooAmt: 0.55,
  },
};
