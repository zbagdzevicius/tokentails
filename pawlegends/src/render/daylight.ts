/**
 * Daytime light (render only): each map has its own time of day, and the light moves on through the match toward the
 * sim's Sunset phase (read only: the match clock in the snapshot). Two keys a map, `day` (most of the match) and `dusk`
 * (Sunset); the renderer's one sun and one sky light take the blend: sun colour, strength and angle, the sky and bounce
 * colours (the bounce tints every shadow side), the clear colour. No new lights, passes or textures.
 *
 * Readability: every key stays within about ±15 % of the v6 base light (renderer.ts), the sun never drops under 30°
 * (short shadows) and tints stay mild, so team colours, telegraphs and bushes read the same at any hour.
 */

/** One time of day: colours as hex, strengths, the sun's elevation and its turn from the base azimuth (degrees). */
export interface DayKey {
  sun: number;
  sunI: number;
  sky: number;
  ground: number;
  hemiI: number;
  elev: number;
  turn: number;
  bg: number;
}

export interface DayPreset {
  /** What the map's light reads as, start → Sunset (docs, tests). */
  look: string;
  day: DayKey;
  dusk: DayKey;
}

/** The v6 Lightning Rivalry base light (renderer.ts): the lobby, menus and any map without a preset. */
export const BASE_DAY: DayKey = Object.freeze({ sun: 0xfff8ee, sunI: 2.2, sky: 0xfff3e3, ground: 0x7b7792, hemiI: 1.6, elev: 51.3, turn: 0, bg: 0xf6e4c0 });

export const DAYLIGHT: Readonly<Record<string, DayPreset>> = Object.freeze({
  crossing: {
    look: 'late morning → golden hour',
    day: { sun: 0xfff6e6, sunI: 2.25, sky: 0xfff3e3, ground: 0x7b7792, hemiI: 1.6, elev: 56, turn: -8, bg: 0xf6e4c0 },
    dusk: { sun: 0xffd6ac, sunI: 2.05, sky: 0xffe9d6, ground: 0x84708e, hemiI: 1.48, elev: 36, turn: 22, bg: 0xf7d6b0 },
  },
  ridge: {
    look: 'warm afternoon → lantern dusk',
    day: { sun: 0xffeccf, sunI: 2.2, sky: 0xfdeedb, ground: 0x7a7298, hemiI: 1.56, elev: 46, turn: 10, bg: 0xf4dfc4 },
    dusk: { sun: 0xffc29c, sunI: 1.95, sky: 0xf8ddd0, ground: 0x6e6196, hemiI: 1.42, elev: 31, turn: 30, bg: 0xeec4ad },
  },
  thicket: {
    look: 'cool misty morning → bright late morning',
    day: { sun: 0xf1f6ff, sunI: 2.05, sky: 0xeaf4fb, ground: 0x6f8a86, hemiI: 1.7, elev: 38, turn: -30, bg: 0xe4efe6 },
    dusk: { sun: 0xfff3dc, sunI: 2.25, sky: 0xfff2e0, ground: 0x787f90, hemiI: 1.6, elev: 57, turn: -5, bg: 0xf3e6c8 },
  },
  quarry: {
    look: 'high noon → hot afternoon',
    day: { sun: 0xfffaf0, sunI: 2.4, sky: 0xfff8ec, ground: 0x8a7b82, hemiI: 1.5, elev: 68, turn: 0, bg: 0xf8ead0 },
    dusk: { sun: 0xffd9b0, sunI: 2.15, sky: 0xffecd6, ground: 0x8a6f7a, hemiI: 1.45, elev: 41, turn: 25, bg: 0xf6d9b4 },
  },
  pitch: {
    look: 'match-day noon → early evening',
    day: { sun: 0xfffdf6, sunI: 2.3, sky: 0xf5faff, ground: 0x7d8a98, hemiI: 1.66, elev: 62, turn: 5, bg: 0xeef3ea },
    dusk: { sun: 0xffdcb8, sunI: 2.0, sky: 0xffeedd, ground: 0x7a6f9a, hemiI: 1.5, elev: 35, turn: 28, bg: 0xf2dcc0 },
  },
  hearthwood: {
    look: 'autumn golden hour → dusk',
    day: { sun: 0xffecd2, sunI: 2.2, sky: 0xfff2e2, ground: 0x7d6c88, hemiI: 1.55, elev: 42, turn: 12, bg: 0xf2dcbc },
    dusk: { sun: 0xffc6a4, sunI: 1.92, sky: 0xf6dccf, ground: 0x6c5c90, hemiI: 1.4, elev: 30, turn: 32, bg: 0xe8c2ac },
  },
});

/** The bound map's preset (the base light both ends for a map without one). */
export const dayPreset = (id: string): DayPreset => DAYLIGHT[id] ?? { look: 'base', day: BASE_DAY, dusk: BASE_DAY };

/** Sunset's own share of the shift: the play phase moves the light 0 → PLAY_SHARE, Sunset the rest over SUNSET_TICKS. */
export const PLAY_SHARE = 0.75;
/** Sunset's last stretch of the shift (ticks, 30 a second): 20 s. */
export const SUNSET_TICKS = 600;

/** The match clock as the snapshot carries it (sim/api.ts MatchClock). */
export interface DayClock {
  tick: number;
  phase: string;
  nextPhaseIn: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How far the light has moved from `day` (0) to `dusk` (1). The gate and the first half of play hold the day light;
 * the second half of play eases toward PLAY_SHARE; Sunset (from `sunsetTick`, the tick the play phase ended, when
 * known) finishes the shift in SUNSET_TICKS. A clock seen only in Sunset (a rejoin, a replay seek) is at dusk.
 */
export function dayShift(c: DayClock, sunsetTick = -1): number {
  if (c.phase === 'gate') return 0;
  if (c.phase === 'play') {
    const end = c.tick + Math.max(0, c.nextPhaseIn);
    return end > 0 ? PLAY_SHARE * smooth(0.45, 1, c.tick / end) : 0;
  }
  if (c.phase === 'sunset' || c.phase === 'ended') {
    if (sunsetTick < 0) return 1;
    return PLAY_SHARE + (1 - PLAY_SHARE) * smooth(0, 1, (c.tick - sunsetTick) / SUNSET_TICKS);
  }
  return 0;
}

/** The light at shift `t` (0 day … 1 dusk), as plain numbers (r, g, b 0..1) the renderer copies. */
export interface DayLight {
  sun: [number, number, number];
  sunI: number;
  sky: [number, number, number];
  ground: [number, number, number];
  hemiI: number;
  /** The unit vector from the ground toward the sun (three.js axes). */
  dir: [number, number, number];
  bg: [number, number, number];
}

const rgb = (h: number): [number, number, number] => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix3 = (a: number, b: number, t: number, out: [number, number, number]): [number, number, number] => {
  const x = rgb(a);
  const y = rgb(b);
  for (let k = 0; k < 3; k++) out[k] = x[k] + (y[k] - x[k]) * t;
  return out;
};

/** The base sun's azimuth: the renderer's old offset (−20, 40, 25) seen from above. */
const BASE_AZ = Math.atan2(25, -20);
const DEG = Math.PI / 180;

export function newDayLight(): DayLight {
  return { sun: [1, 1, 1], sunI: 0, sky: [1, 1, 1], ground: [0, 0, 0], hemiI: 0, dir: [0, 1, 0], bg: [1, 1, 1] };
}

/** Blend preset `p` at shift `t` into `out` (no allocation once `out` exists, but for the rgb unpacking). */
export function dayLightAt(p: DayPreset, t: number, out: DayLight = newDayLight()): DayLight {
  const a = p.day;
  const b = p.dusk;
  const k = Math.max(0, Math.min(1, t));
  mix3(a.sun, b.sun, k, out.sun);
  mix3(a.sky, b.sky, k, out.sky);
  mix3(a.ground, b.ground, k, out.ground);
  mix3(a.bg, b.bg, k, out.bg);
  out.sunI = a.sunI + (b.sunI - a.sunI) * k;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * k;
  const el = (a.elev + (b.elev - a.elev) * k) * DEG;
  const az = BASE_AZ + (a.turn + (b.turn - a.turn) * k) * DEG;
  out.dir[0] = Math.cos(el) * Math.cos(az);
  out.dir[1] = Math.sin(el);
  out.dir[2] = Math.cos(el) * Math.sin(az);
  return out;
}
