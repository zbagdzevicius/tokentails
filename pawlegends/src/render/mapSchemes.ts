/**
 * Map colour schemes (render only): every map has its own look (its `native` scheme: exactly the colours it was painted
 * in) and three seasonal variants, so the same map looks different from one match to the next. A scheme is data only:
 * a colour grade per scene role (ground, raised caps, cliff sides, trees, Catnip Bushes, water) that render/views/
 * schemeGrade.ts applies to the map's own materials in their shaders (shared uniforms, no new textures, passes or
 * lights), plus a mild nudge of the map's daytime light (render/daylight.ts) toward the season.
 *
 * The scheme comes from the match seed (`pickScheme`), so every client in a party, a replay and a spectator see the
 * same one; Practice gets a new seed, so a new look, each match. Units, rings, telegraphs, team cloth and banners are
 * never graded: only the scenery is. `grade` is the shader's grade in TypeScript (tests check the contrasts with it).
 */
import type { DayLight } from './daylight';

/** The scene roles a scheme grades (render/views/schemeGrade.ts assigns each map mesh one by its name). */
export const ROLES = ['ground', 'cap', 'cliff', 'trees', 'bush', 'water'] as const;
export type Role = (typeof ROLES)[number];

/**
 * One role's grade. Colours whose hue is inside the map's band for that role (`MapBands`) move toward hue `to`
 * (keeping half their spread), saturation × `sat`, value × `val` + `add`, by `amount`; then everything of that role is
 * multiplied by `tint`. Colours outside the band (rock grey, wood brown, team paint) only take the tint.
 */
export interface Grade {
  /** Target hue (degrees); omitted keeps the hue. */
  to?: number;
  sat?: number;
  val?: number;
  add?: number;
  amount?: number;
  /** Multiply (hex, sRGB), applied to the whole role. */
  tint?: number;
}

/** Which hues are "the living colour" of each role on a map: centre and half width (degrees). */
export type MapBands = Readonly<Record<Role, readonly [number, number]>>;

/** The light's nudge: each key mixes toward its colour by `k` (render/daylight.ts DayLight). */
export interface SchemeLight {
  sun?: readonly [number, number];
  sky?: readonly [number, number];
  ground?: readonly [number, number];
  bg?: readonly [number, number];
}

export interface Season {
  grade: Partial<Record<Role, Grade>>;
  light: SchemeLight;
}

export interface MapScheme {
  /** Stable id (`<map>:<season>`), for tests, the e2e hook and `?scheme=`. */
  id: string;
  /** The season key (`native` = the map's own colours). */
  season: SeasonId;
  /** A short name (the gallery page; not shown in the match). */
  name: string;
  grade: Partial<Record<Role, Grade>>;
  light: SchemeLight;
}

/**
 * The four seasons the maps rotate through. Kept mild where it matters: the bushes keep a deep green (the one colour a
 * player reads as "I can hide here") in every season, darker than the walkable ground; the cliff sides stay earthy.
 */
export const SEASONS = Object.freeze({
  /** Spring: fresh light grass, trees in pastel blossom, turquoise water. */
  bloom: {
    grade: {
      ground: { to: 96, sat: 1.06, val: 1.03, add: 0.02 },
      cap: { to: 104, sat: 1.0, val: 0.98 },
      trees: { to: 338, sat: 0.5, val: 0.92, add: 0.16 },
      bush: { to: 146, sat: 0.95, val: 0.9 },
      water: { to: 186, sat: 1.0, val: 1.02 },
    },
    light: { sky: [0xfff0f4, 0.18], bg: [0xfbe6ee, 0.3] },
  },
  /** Summer at full green (the autumn map's other half of the year). */
  verdant: {
    grade: {
      ground: { to: 98, sat: 1.08, val: 1.02 },
      cap: { to: 108, sat: 1.0, val: 0.95 },
      cliff: { tint: 0xf2f0ea },
      trees: { to: 112, sat: 0.95, val: 0.95 },
      bush: { to: 144, sat: 0.95, val: 0.88 },
      water: { to: 200, sat: 1.05, val: 1.0 },
    },
    light: { sky: [0xf6fbea, 0.15], bg: [0xe9f2dc, 0.3] },
  },
  /** Autumn: golden grass, orange and red woods, the bushes an evergreen deep green. */
  harvest: {
    grade: {
      ground: { to: 72, sat: 0.9, val: 0.86 },
      cap: { to: 48, sat: 0.78, val: 0.86 },
      cliff: { to: 30, sat: 0.9, val: 0.8, tint: 0xfff1e2 },
      trees: { to: 26, sat: 1.28, val: 1.1 },
      bush: { to: 118, sat: 0.95, val: 0.76 },
      water: { to: 192, sat: 0.85, val: 0.92 },
    },
    light: { sun: [0xffd9ae, 0.1], sky: [0xffe6c8, 0.15], bg: [0xf5d3a6, 0.35] },
  },
  /** Winter: snow on the grass and the caps, dark pines, icy water, a cooler sky. */
  frost: {
    grade: {
      ground: { to: 205, sat: 0.16, val: 0.42, add: 0.52 },
      cap: { to: 210, sat: 0.2, val: 0.45, add: 0.45 },
      cliff: { tint: 0xd8e0ea },
      trees: { to: 160, sat: 0.62, val: 0.66 },
      bush: { to: 150, sat: 0.8, val: 0.72 },
      water: { to: 196, sat: 0.42, val: 0.9, add: 0.12 },
    },
    light: { sun: [0xf2f6ff, 0.12], sky: [0xeef4ff, 0.22], ground: [0x7c88a6, 0.3], bg: [0xe4ecf4, 0.5] },
  },
} satisfies Record<string, Season>);

export type SeasonId = keyof typeof SEASONS | 'native';

/** The green maps: grass and canopy greens; the water blue. */
const GREEN: MapBands = Object.freeze({
  ground: [100, 52],
  cap: [100, 52],
  cliff: [70, 30],
  trees: [115, 50],
  bush: [120, 40],
  water: [205, 40],
});

/** Per map: its band table and its schemes in order (the native first). */
/** A scheme row: season, name, and an optional per-map tweak merged over the season's grade (role by role). */
type Row = readonly [SeasonId, string] | readonly [SeasonId, string, Partial<Record<Role, Grade>>];

const MAPS: Readonly<Record<string, { bands: MapBands; schemes: readonly Row[] }>> = Object.freeze({
  crossing: {
    bands: GREEN,
    schemes: [
      ['native', 'Sunny Crossing'],
      ['bloom', 'Blossom Crossing'],
      ['harvest', 'Harvest Crossing'],
      ['frost', 'First Snow Crossing'],
    ],
  },
  ridge: {
    bands: GREEN,
    schemes: [
      ['native', 'Lanternfall'],
      ['bloom', 'Lanternfall Blossom'],
      ['harvest', 'Lanternfall Harvest'],
      ['frost', 'Lanternfall Frost'],
    ],
  },
  thicket: {
    bands: GREEN,
    schemes: [
      ['native', 'Deep Moss'],
      ['bloom', 'Thicket Blossom'],
      ['harvest', 'Thicket Harvest'],
      ['frost', 'Thicket Frost'],
    ],
  },
  quarry: {
    // the quarry's grass is a dry yellow-green (hue ~70)
    bands: { ...GREEN, ground: [82, 44], cap: [70, 40] },
    schemes: [
      ['native', 'Sandstone Noon'],
      ['verdant', 'Green Quarry'],
      ['bloom', 'Quarry Blossom'],
      ['frost', 'Quarry Frost'],
    ],
  },
  pitch: {
    bands: GREEN,
    schemes: [
      ['native', 'Match Day'],
      ['bloom', 'Spring Fixture'],
      ['harvest', 'Autumn Fixture'],
      ['frost', 'Snow Derby'],
    ],
  },
  hearthwood: {
    // Hearthwood is painted in autumn: olive grass (hue ~58), orange-red leaves and bushes (hue ~20)
    bands: { ground: [60, 22], cap: [60, 22], cliff: [30, 20], trees: [26, 30], bush: [20, 22], water: [200, 40] },
    schemes: [
      ['native', 'Ember Autumn'],
      // the orange leaves and bushes are more saturated than the green maps' greens: calmer greens here
      ['verdant', 'Summer Hearthwood', { trees: { to: 110, sat: 0.55, val: 0.8 }, bush: { to: 150, sat: 0.6, val: 0.84 } }],
      ['bloom', 'Blossom Hearthwood', { bush: { to: 150, sat: 0.6, val: 0.84 } }],
      ['frost', 'Frost Hearthwood'],
    ],
  },
});

const NATIVE: Season = { grade: {}, light: {} };

/** The bound map's band table (green maps by default). */
export const mapBands = (map: string): MapBands => MAPS[map]?.bands ?? GREEN;

/** Every scheme of a map, the native first (a map without a table: the native plus the four seasons). */
export function mapSchemes(map: string): MapScheme[] {
  const list: readonly Row[] = MAPS[map]?.schemes ?? [
    ['native', 'Native'],
    ['bloom', 'Blossom'],
    ['harvest', 'Harvest'],
    ['frost', 'Frost'],
  ];
  return list.map(([season, name, tweak]: Row) => {
    const s = season === 'native' ? NATIVE : SEASONS[season];
    return { id: `${map}:${season}`, season, name, grade: tweak ? { ...s.grade, ...tweak } : s.grade, light: s.light };
  });
}

/** Every map with a scheme table. */
export const SCHEME_MAPS = Object.freeze(Object.keys(MAPS));

const fnv = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

/**
 * The match's scheme: a hash of the match seed and the map id (render only; the sim never sees it). `want` (a scheme
 * id or a season key, from `?scheme=` or a test) wins when the map has it.
 */
export function pickScheme(map: string, seed: number, want?: string | null): MapScheme {
  const all = mapSchemes(map);
  if (want) {
    const hit = all.find((s) => s.id === want || s.season === want);
    if (hit) return hit;
  }
  let h = Math.imul((seed >>> 0) ^ fnv(map), 0x9e3779b1) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return all[(h >>> 0) % all.length];
}

// ---- the grade, in TypeScript (the shader in render/views/schemeGrade.ts does the same maths) ----

/** The uniform layout of one role: A = (band centre, band half width, target hue, amount) in turns; B = (has target,
 *  sat, val, add); tint = rgb 0..1. */
export interface GradeUniforms {
  a: [number, number, number, number];
  b: [number, number, number, number];
  tint: [number, number, number];
}

export const IDENTITY: GradeUniforms = Object.freeze({ a: [0, 0, 0, 0], b: [0, 1, 1, 0], tint: [1, 1, 1] }) as GradeUniforms;

export const rgb01 = (h: number): [number, number, number] => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** A role's grade as uniform numbers (identity when the scheme leaves the role alone). */
export function gradeUniforms(g: Grade | undefined, band: readonly [number, number]): GradeUniforms {
  if (!g) return { a: [0, 0, 0, 0], b: [0, 1, 1, 0], tint: [1, 1, 1] };
  return {
    a: [band[0] / 360, band[1] / 360, (g.to ?? 0) / 360, g.amount ?? 1],
    b: [g.to === undefined ? 0 : 1, g.sat ?? 1, g.val ?? 1, g.add ?? 0],
    tint: g.tint === undefined ? [1, 1, 1] : rgb01(g.tint),
  };
}

const fract = (x: number): number => x - Math.floor(x);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 1e-10) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = fract(h / 6);
  }
  return [h, mx > 1e-10 ? d / mx : 0, mx];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  // the shader's hsv2rgb: p = |fract(h + K) * 6 - 3|, channel = v * mix(1, clamp(p - 1), s), K = (1, 2/3, 1/3)
  return ([1, 2 / 3, 1 / 3] as const).map((K) => {
    const p = clamp01(Math.abs(fract(h + K) * 6 - 3) - 1);
    return v * (1 + (p - 1) * s);
  }) as [number, number, number];
}

/** The grade of one sRGB colour (0..1), as the shader does it. */
export function gradeRgb(c: readonly [number, number, number], u: GradeUniforms): [number, number, number] {
  const [h, s, v] = rgbToHsv(clamp01(c[0]), clamp01(c[1]), clamp01(c[2]));
  const dh = Math.abs(fract(h - u.a[0] + 0.5) - 0.5);
  const w = (1 - smoothstep(u.a[1] * 0.7, u.a[1], dh)) * smoothstep(0.04, 0.12, s) * u.a[3];
  const nh = u.b[0] > 0.5 ? fract(u.a[2] + (fract(h - u.a[0] + 0.5) - 0.5) * 0.5) : h;
  const g = hsvToRgb(nh, clamp01(s * u.b[1]), clamp01(v * u.b[2] + u.b[3]));
  return [0, 1, 2].map((k) => (c[k] + (g[k] - c[k]) * w) * u.tint[k]) as [number, number, number];
}

/** `gradeRgb` on a hex colour, back to hex. */
export function gradeHex(hex: number, u: GradeUniforms): number {
  const o = gradeRgb(rgb01(hex), u);
  return o.reduce((acc, x) => (acc << 8) | Math.round(clamp01(x) * 255), 0);
}

/** The scheme's light nudge on a blended DayLight (in place; the native leaves it alone). */
export function schemeDay(d: DayLight, light: SchemeLight): DayLight {
  const mix = (out: [number, number, number], key: readonly [number, number] | undefined): void => {
    if (!key) return;
    const c = rgb01(key[0]);
    for (let i = 0; i < 3; i++) out[i] += (c[i] - out[i]) * key[1];
  };
  mix(d.sun, light.sun);
  mix(d.sky, light.sky);
  mix(d.ground, light.ground);
  mix(d.bg, light.bg);
  return d;
}
