// City looks. Owned by the CAMPAIGN lane. Pure data (no three, no DOM): levels.ts and tests import it in node.
// DOWNTOWN is exactly the POC look. CityTheme is a frozen core type, so the extra knobs the campaign generator and
// shader need (second window glow, emission, water, roofs, signs) live in THEME_EXTRAS, keyed by theme object.
import type { CityTheme } from '../core/types';

export const DOWNTOWN: CityTheme = {
  sky: 0xc9ccd1,
  fogNear: 180,
  fogFar: 760,
  hemiSky: 0xe8eef5,
  hemiGround: 0x6b6258,
  hemiIntensity: 1.4,
  sunColor: 0xfff1dd,
  sunIntensity: 2.2,
  exposure: 1.05,
  ground: 0x55575c,
  sidewalk: 0xa9a7a2,
  grass: 0x6f9a4a,
  dash: 0xf2d24a,
  palette: [0xd8cfc0, 0xc2b8a8, 0xb9a48a, 0x9aa3ad, 0x8a8f96, 0xcdb89a, 0xa86f55, 0xe4dccf, 0x7d8794, 0xbfa58a],
  windowLit: 0.18,
  windowGlass: 0x8190a2,
  windowGlow: 0xffefc4,
  night: false,
  taxiColor: 0xffc21a,
  taxiShare: 0.7,
  carColors: [0xd94a3a, 0x3a6fd9, 0xeeeeee, 0x2b2b2b],
};

/** Catfish Wharf: an orange dusk harbour. Long shadows, warm windows coming on, rusty warehouses. */
export const DOCKS: CityTheme = {
  sky: 0xf0a679,
  fogNear: 160,
  fogFar: 720,
  hemiSky: 0xffcfa6,
  hemiGround: 0x4a3a46,
  hemiIntensity: 1.25,
  sunColor: 0xff9a52,
  sunIntensity: 2.1,
  exposure: 1.02,
  ground: 0x4a4648,
  sidewalk: 0x9c9284,
  grass: 0x7a8a4a,
  dash: 0xffd24a,
  palette: [0xa0482e, 0x2f6f73, 0xd8c8a0, 0x6f7f8a, 0x8a4a38, 0xb8794a, 0x5a6470, 0xc9b48a],
  windowLit: 0.38,
  windowGlass: 0x4e5468,
  windowGlow: 0xffc072,
  night: false,
  taxiColor: 0xffc21a,
  taxiShare: 0.25,
  carColors: [0x2a6fd9, 0xe8e2d8, 0x3a3a3a, 0xc8462a, 0x4a7a4a],
};

/** Purrburbia: a sunny pastel suburb. Bright, saturated lawns, candy houses. */
export const SUBURBIA: CityTheme = {
  sky: 0x9fd8ff,
  fogNear: 220,
  fogFar: 900,
  hemiSky: 0xffffff,
  hemiGround: 0x7a9a5a,
  hemiIntensity: 1.5,
  sunColor: 0xfff6e0,
  sunIntensity: 2.5,
  exposure: 1.08,
  ground: 0x5d6168,
  sidewalk: 0xe4ded0,
  grass: 0x7cc456,
  dash: 0xffffff,
  palette: [0xf6e7c8, 0xf4c8cf, 0xc8e2f4, 0xe2f0c4, 0xfafafa, 0xf6d6a2, 0xd8ccf0, 0xbfe8dc],
  windowLit: 0.08,
  windowGlass: 0x6f93b8,
  windowGlow: 0xfff0c8,
  night: false,
  taxiColor: 0xffc21a,
  taxiShare: 0.08,
  carColors: [0x7fd0ff, 0xff9fb0, 0xffffff, 0x9fe08a, 0xffd27f, 0xc0a0ff],
};

/** Nekotown: neon night. Deep purple sky, pink and cyan glow everywhere. */
export const NEON: CityTheme = {
  sky: 0x1a1030,
  fogNear: 110,
  fogFar: 640,
  hemiSky: 0x7a66ff,
  hemiGround: 0x2a1430,
  hemiIntensity: 1.15,
  sunColor: 0xc08aff,
  sunIntensity: 1.05,
  exposure: 1.2,
  ground: 0x1d1a26,
  sidewalk: 0x37334a,
  grass: 0x24493e,
  dash: 0xff3ea0,
  palette: [0x3c3658, 0x2d3a60, 0x4a2e52, 0x2a3249, 0x41415e, 0x5a3254, 0x30475a],
  windowLit: 0.55,
  windowGlass: 0x151c33,
  windowGlow: 0x46d2ff,
  night: true,
  taxiColor: 0xff3ea0,
  taxiShare: 0.45,
  carColors: [0x7ff0ff, 0xffd24a, 0xa98bff, 0x222222, 0xffffff],
};

/** Fort Fluffington: a khaki military base in the midday haze. */
export const BASE: CityTheme = {
  sky: 0xd6cba4,
  fogNear: 200,
  fogFar: 820,
  hemiSky: 0xfff0c8,
  hemiGround: 0x6a5a3a,
  hemiIntensity: 1.35,
  sunColor: 0xffe2a8,
  sunIntensity: 2.35,
  exposure: 1.04,
  ground: 0x6c685a,
  sidewalk: 0xb7a57c,
  grass: 0x8c9a52,
  dash: 0xffffff,
  palette: [0x6a7a4a, 0x8a8a64, 0x5a6a52, 0xa09070, 0x737d5c, 0x9c8c62],
  windowLit: 0.12,
  windowGlass: 0x5f6a62,
  windowGlow: 0xfff0c0,
  night: false,
  taxiColor: 0xffc21a,
  taxiShare: 0,
  carColors: [0x4a5a3a, 0x5a6a4a, 0x3a4a2a, 0x6a6a5a, 0x7a6a48],
};

/** Generator and shader knobs that CityTheme (frozen) has no field for. */
export interface ThemeExtras {
  glow2: number; // second window glow colour (night mixes two)
  emit: number; // lit window emission strength (0 = the POC day look)
  water: number;
  foam: number;
  wood: number; // piers and decks
  containers: number[]; // shipping container colours
  roofs: number[]; // gable roof colours
  signs: number[]; // neon sign colours
  accent: number[]; // cranes, playgrounds, misc props
  concrete: number;
}

const DEFAULT_EXTRAS: ThemeExtras = {
  glow2: DOWNTOWN.windowGlow,
  emit: 0,
  water: 0x2f86c8,
  foam: 0xe8f6ff,
  wood: 0x8a6a4a,
  containers: [0xd9452b, 0x2a6fd9, 0xf2a024, 0x2f9a5a, 0xe8e2d0, 0x1f8f9a, 0xb02a5a, 0xf2d23a],
  roofs: [0xb04a3a, 0x7a4a3a, 0x4a5a7a, 0x8a5a4a, 0x5a5a5a, 0x3f6a5a],
  signs: [0xff3ea0, 0x3ef0ff, 0xffd23e, 0x5aff8a, 0xb06aff, 0xff8a3e],
  accent: [0xe07a1f, 0xc8322a, 0xf2c230],
  concrete: 0xa8a49c,
};

export const THEME_EXTRAS = new Map<CityTheme, ThemeExtras>([
  [DOWNTOWN, DEFAULT_EXTRAS],
  [DOCKS, { ...DEFAULT_EXTRAS, glow2: 0xffd9a0, emit: 0.35, water: 0x2c6f9a, foam: 0xffd2a8, wood: 0x7a5a3e, concrete: 0x9a9286 }],
  [SUBURBIA, { ...DEFAULT_EXTRAS, water: 0x3fc8f0, foam: 0xffffff, accent: [0xff5a7a, 0x3aa0ff, 0xffd23e, 0x5ad07a], concrete: 0xd6d0c0 }],
  [NEON, { ...DEFAULT_EXTRAS, glow2: 0xff4fb8, emit: 0.55, water: 0x1a2a5a, foam: 0xff7ad0, concrete: 0x3a3650 }],
  [BASE, { ...DEFAULT_EXTRAS, glow2: 0xfff0c0, emit: 0, accent: [0x8a9a5a, 0xd8c27a, 0xc8322a], roofs: [0x5a6a42, 0x6a7a4a, 0x7a7458, 0x4a5a3a], concrete: 0x9c9888 }],
]);

export function themeExtras(t: CityTheme): ThemeExtras {
  return THEME_EXTRAS.get(t) ?? DEFAULT_EXTRAS;
}
