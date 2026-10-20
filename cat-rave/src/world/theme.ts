/**
 * L-WORLD: the stage key light. Green is the Moon Rave look (the synth); Red goes with the Back on
 * Track mix (SPEC.md 8.1). Every colour that reads as "the green" is listed here, so a track swap
 * cross-fades the whole stage (sky, fog, moon, floor, booth, lasers, spots, flashes, crowd rim, DJ
 * rims and lights, POV paws) in 0.6 s. Violet and pink stay as they are.
 *
 * Values are linear RGB. The green values are exactly the literals the scene had before themes, so
 * a page that never switches renders byte-identical. Modules apply a theme to uniforms only (no
 * shader recompile; main's precompile stays valid).
 */
import { Color } from 'three';
import { PALETTE } from '../config';
import type { TrackId } from '../types';

export type Rgb = readonly [number, number, number];
export type ThemeId = 'green' | 'red';

export interface Theme {
  // Scene
  sky: Rgb;
  fog: Rgb;
  moon: Rgb;
  moonGlow: Rgb;
  floor: Rgb;
  floorGlow: Rgb;
  boothGlow: Rgb;
  laser: Rgb;
  boothPool: Rgb;
  zen: Rgb;
  starTint: Rgb;
  moonTint: Rgb;
  boothTint: Rgb;
  boothInk: Rgb;
  spotTint: Rgb;
  dropFlash: Rgb;
  flashKey: Rgb;
  // Crowd
  crowdGlow: Rgb;
  crowdFill: Rgb;
  // DJ
  djRim: Rgb;
  djRimLit: Rgb;
  kittenRim: Rgb;
  kittenRim2: Rgb;
  phonesGlow: Rgb;
  deckGreen: Rgb;
  vuGreen: Rgb;
  // POV paws
  pawsRim: Rgb;
  /** Multiplies laser, emitter and spot intensities (red is darker than green, so it blooms less). */
  bloomGain: number;
}

/** Linear RGB of an sRGB hex, as `new Color(hex)` stores it. */
export function hexRgb(hex: number): Rgb {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

const GREEN: Theme = Object.freeze({
  sky: hexRgb(PALETTE.sky),
  fog: hexRgb(PALETTE.fog),
  moon: hexRgb(PALETTE.moon),
  moonGlow: hexRgb(PALETTE.moonGlow),
  floor: hexRgb(PALETTE.floor),
  floorGlow: hexRgb(PALETTE.floorGlow),
  boothGlow: hexRgb(PALETTE.boothGlow),
  laser: hexRgb(0x39ff5a),
  boothPool: [0.212, 1.0, 0.254],
  zen: [0.0006, 0.003, 0.0012],
  starTint: [0.75, 1.0, 0.85],
  moonTint: [0.86, 1.0, 0.8],
  boothTint: [0.9, 1.0, 0.9],
  boothInk: [0.02, 0.18, 0.06],
  spotTint: [0.75, 1.0, 0.8],
  dropFlash: [0.75, 1.0, 0.8],
  flashKey: [0.25, 1.0, 0.35],
  crowdGlow: hexRgb(PALETTE.floorGlow),
  crowdFill: hexRgb(0x3dff6a),
  djRim: hexRgb(0x3dff6a),
  djRimLit: hexRgb(0x7dff9a),
  kittenRim: hexRgb(0x3dff6a),
  kittenRim2: hexRgb(0x6dff8c),
  phonesGlow: [0.24, 1, 0.43],
  deckGreen: hexRgb(PALETTE.laserGreen),
  vuGreen: [0.3, 1.0, 0.45],
  pawsRim: hexRgb(PALETTE.floorGlow),
  bloomGain: 1,
} satisfies Theme);

/** The same look rotated to red: R-dominant keys, warm near-white tints. */
const RED: Theme = Object.freeze({
  sky: hexRgb(0x0a0203),
  fog: hexRgb(0x210609),
  moon: hexRgb(0xf09a8c),
  moonGlow: hexRgb(0xff2b3a),
  floor: hexRgb(0xd22838),
  floorGlow: hexRgb(0xff4656),
  boothGlow: hexRgb(0xff8d96),
  laser: hexRgb(0xff3946),
  boothPool: [1.0, 0.212, 0.254],
  zen: [0.003, 0.0006, 0.0012],
  starTint: [1.0, 0.78, 0.8],
  moonTint: [1.0, 0.86, 0.8],
  boothTint: [1.0, 0.9, 0.9],
  boothInk: [0.18, 0.02, 0.04],
  spotTint: [1.0, 0.78, 0.75],
  dropFlash: [1.0, 0.8, 0.75],
  flashKey: [1.0, 0.3, 0.25],
  crowdGlow: hexRgb(0xff4656),
  crowdFill: hexRgb(0xff3d4f),
  djRim: hexRgb(0xff3d4f),
  djRimLit: hexRgb(0xff7d8a),
  kittenRim: hexRgb(0xff3d4f),
  kittenRim2: hexRgb(0xff6d7a),
  phonesGlow: [1, 0.24, 0.3],
  deckGreen: hexRgb(0xff4d5a),
  vuGreen: [1.0, 0.3, 0.32],
  pawsRim: hexRgb(0xff4656),
  bloomGain: 1.4,
} satisfies Theme);

export const THEMES: Readonly<Record<ThemeId, Theme>> = Object.freeze({ green: GREEN, red: RED });

/** Green for the Moon Rave synth, Red for the Back on Track mix. */
export function themeFor(track: TrackId): ThemeId {
  return track === 'mix' ? 'red' : 'green';
}

/** Theme keys holding a colour (everything but bloomGain). */
export const COLOR_KEYS = Object.keys(GREEN).filter((k) => k !== 'bloomGain') as Exclude<keyof Theme, 'bloomGain'>[];

/** Every colour lerped in linear space, `t` 0 = a, 1 = b. */
export function mixTheme(a: Theme, b: Theme, t: number): Theme {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = { bloomGain: a.bloomGain + (b.bloomGain - a.bloomGain) * t } as Record<keyof Theme, unknown>;
  for (const k of COLOR_KEYS) {
    const x = a[k];
    const y = b[k];
    out[k] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  }
  return out as unknown as Theme;
}

/** Copy a theme colour into a three.js Color (linear, no conversion). */
export const setRgb = (c: Color, rgb: Rgb) => c.setRGB(rgb[0], rgb[1], rgb[2]);

/**
 * A module's own cross-fade: `set` starts it, `step(dt)` returns the theme to apply this frame (null
 * when nothing changed, so a page that never switches never writes a uniform).
 */
export class ThemeFader {
  private from: Theme = GREEN;
  private to: Theme = GREEN;
  private t = 1;
  private dur = 0;
  private dirty = false;
  current: Theme = GREEN;
  id: ThemeId = 'green';

  set(id: ThemeId, seconds = 0.6) {
    if (id === this.id && this.t >= 1) return;
    this.id = id;
    this.from = this.current;
    this.to = THEMES[id];
    this.dur = Math.max(0, seconds);
    this.t = this.dur > 0 ? 0 : 1;
    if (this.t >= 1) this.current = this.to;
    this.dirty = true;
  }

  step(dt: number): Theme | null {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      // Smoothstep: the colour eases in and out instead of a linear slide.
      const e = this.t * this.t * (3 - 2 * this.t);
      this.current = this.t >= 1 ? this.to : mixTheme(this.from, this.to, e);
      return this.current;
    }
    if (this.dirty) {
      this.dirty = false;
      return this.current;
    }
    return null;
  }
}
