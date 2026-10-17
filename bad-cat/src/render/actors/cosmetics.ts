/**
 * Cosmetics on the cat (GDD 8, 9.2): every collar and hat id of `COSMETICS` maps to a small procedural attachment
 * built into the head geometry (one draw call stays one draw call), plus the trail styles behind the player's cat.
 * Coordinates are head-pivot space before CAT_SCALE (the head sphere is ~0.1 m, its top at y ≈ 0.13, the face quad
 * at z ≈ 0.12, the neck at y ≈ -0.055). Unknown ids draw nothing. Pure three.js (works in Node).
 */
import { COSMETICS, cosmetic } from '../../types';
import { GeoBuilder } from '../geo';

const NOFUR = { fur: 0, vary: 0.02 };
const GOLD = 0xffc93c;
const WHITE = 0xfffaf2;

type Builder = (g: GeoBuilder, color: number) => void;

function collarBand(g: GeoBuilder, color: number, tube = 0.012): void {
  g.torus(0.07, tube, color, { y: -0.055, z: -0.005, rx: Math.PI / 2 - 0.3 }, NOFUR, 4, 14);
}

/** A flat 5-point star in the x/y plane, centred at (x, y, z), radius r. */
function star(g: GeoBuilder, x: number, y: number, z: number, r: number, color: number): void {
  g.cyl(r * 0.45, r * 0.45, 0.008, 10, color, { x, y, z, rx: Math.PI / 2 }, NOFUR);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.cone(r * 0.3, r * 0.75, 4, color, { x: x + Math.sin(a) * r * 0.55, y: y + Math.cos(a) * r * 0.55, z, rz: -a, sz: 0.25 }, NOFUR);
  }
}

/** Flat heart in the x/y plane, pointing down. */
function heart(g: GeoBuilder, x: number, y: number, z: number, r: number, color: number): void {
  g.sphere(r * 0.55, color, { x: x - r * 0.38, y: y + r * 0.18, z, sz: 0.35 }, NOFUR, 8, 5);
  g.sphere(r * 0.55, color, { x: x + r * 0.38, y: y + r * 0.18, z, sz: 0.35 }, NOFUR, 8, 5);
  g.cone(r * 0.82, r * 1.05, 4, color, { x, y: y - r * 0.4, z, rz: Math.PI, ry: Math.PI / 4, sz: 0.4 }, NOFUR);
}

/** Collar attachments by CatSpec.collar id (COSMETICS slot 'collar'). */
export const COLLAR_BUILDERS: Readonly<Record<number, Builder>> = {
  // Chaos Club collar: purple band, gold "C" tag
  1: (g, c) => {
    collarBand(g, c, 0.013);
    g.torus(0.014, 0.005, GOLD, { y: -0.085, z: 0.064, rz: 0.6 }, NOFUR, 4, 8);
  },
  // Pink Paw charity collar: pink band with a paw tag (pad + 3 toe beans)
  2: (g, c) => {
    collarBand(g, c, 0.012);
    g.cyl(0.02, 0.02, 0.006, 10, WHITE, { y: -0.088, z: 0.066, rx: Math.PI / 2 - 0.25 }, NOFUR);
    g.sphere(0.008, c, { y: -0.093, z: 0.071, sz: 0.4 }, NOFUR, 6, 4);
    for (const dx of [-0.009, 0, 0.009]) g.sphere(0.0045, c, { x: dx, y: -0.081 + (dx === 0 ? 0.002 : 0), z: 0.07, sz: 0.4 }, NOFUR, 5, 3);
  },
  // Elf collar: teal band with red/green points and a tiny bell
  3: (g, c) => {
    collarBand(g, c, 0.011);
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (i / 6) * 2.4;
      g.cone(0.012, 0.03, 4, i % 2 ? 0xd62828 : 0x2a9d8f, { x: Math.sin(a) * 0.072, y: -0.078, z: Math.cos(a) * 0.072 - 0.005, rx: Math.PI, rz: 0 }, NOFUR);
    }
    g.sphere(0.011, GOLD, { y: -0.1, z: 0.07 }, NOFUR, 6, 4);
  },
  // Bell collar: yellow band, gold bell with a slot
  4: (g, c) => {
    collarBand(g, c, 0.011);
    g.sphere(0.018, GOLD, { y: -0.09, z: 0.068, sy: 0.9 }, NOFUR, 7, 5);
    g.box(0.022, 0.003, 0.006, 0x8d6e1f, { y: -0.097, z: 0.084 }, NOFUR);
  },
  // Bandana: a red triangle draped over the chest, knotted band
  5: (g, c) => {
    collarBand(g, c, 0.009);
    g.cone(0.055, 0.07, 3, c, { y: -0.095, z: 0.05, rx: Math.PI + 0.35, ry: Math.PI / 3, sz: 0.35 }, NOFUR);
    for (let i = 0; i < 4; i++) g.sphere(0.005, WHITE, { x: -0.02 + i * 0.013, y: -0.09 - (i % 2) * 0.012, z: 0.07 }, NOFUR, 4, 3);
  },
  // Candy-cane collar: alternating red and white beads
  6: (_g, _c) => {
    const g = _g;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 0.07;
      const x = Math.sin(a) * r;
      const zz = Math.cos(a) * r;
      // tilt like the band: front lower than the back
      g.sphere(0.0135, i % 2 ? 0xd62828 : WHITE, { x, y: -0.055 - zz * 0.3, z: zz * 0.955 - 0.005 }, NOFUR, 6, 4);
    }
  },
  // Streak star collar: gold band and a star tag
  7: (g, c) => {
    collarBand(g, c, 0.011);
    star(g, 0, -0.09, 0.072, 0.024, c);
  },
  // Spiked collar (Phase 2 shop): a dark leather band with silver studs pointing out
  8: (g, c) => {
    collarBand(g, c, 0.014);
    for (let i = 0; i < 9; i++) {
      const a = -1.4 + (i / 8) * 2.8;
      const x = Math.sin(a) * 0.083;
      const zz = Math.cos(a) * 0.083 - 0.005;
      g.cone(0.008, 0.022, 4, 0xd9dde3, { x, y: -0.06 - zz * 0.3, z: zz, rx: Math.PI / 2 - 0.3, ry: a }, NOFUR);
    }
  },
};

/** Hat attachments by CatSpec.hat id (COSMETICS slot 'hat'). `fold` ears sit lower, so hats drop a little. */
export const HAT_BUILDERS: Readonly<Record<number, (g: GeoBuilder, color: number, fold: boolean) => void>> = {
  // Santa hat: red cone flopping back, white brim and pompom
  1: (g, c, fold) => {
    const y = fold ? 0.125 : 0.135;
    g.torus(0.06, 0.016, WHITE, { y, z: 0.01, rx: Math.PI / 2 - 0.15 }, NOFUR, 5, 14);
    g.cone(0.058, 0.12, 8, c, { y: y + 0.055, z: -0.015, rx: -0.55 }, NOFUR);
    g.sphere(0.02, WHITE, { y: y + 0.095, z: -0.07 }, NOFUR, 6, 4);
  },
  // Sweatband: a band around the forehead
  2: (g, c) => {
    g.torus(0.098, 0.014, c, { y: 0.08, z: 0.03, rx: Math.PI / 2 + 0.25, sx: 1.12 }, NOFUR, 4, 16);
  },
  // Heart glasses: two pink hearts over the eyes on a thin bridge
  3: (g, c) => {
    heart(g, -0.042, 0.045, 0.16, 0.034, c);
    heart(g, 0.042, 0.045, 0.16, 0.034, c);
    g.box(0.03, 0.006, 0.006, 0x2a1f2b, { y: 0.052, z: 0.16 }, NOFUR);
    g.box(0.006, 0.006, 0.07, 0x2a1f2b, { x: -0.08, y: 0.05, z: 0.125 }, NOFUR);
    g.box(0.006, 0.006, 0.07, 0x2a1f2b, { x: 0.08, y: 0.05, z: 0.125 }, NOFUR);
  },
  // Party hat: a striped cone with a pompom, tilted
  4: (g, c, fold) => {
    const y = fold ? 0.165 : 0.18;
    g.cone(0.045, 0.1, 6, c, { y, z: 0.0, rz: 0.2 }, NOFUR);
    g.torus(0.032, 0.006, 0xff4d8d, { x: 0.006, y: y - 0.02, rx: Math.PI / 2, rz: 0.2 }, NOFUR, 4, 10);
    g.sphere(0.015, GOLD, { x: -0.02, y: y + 0.05, rz: 0.2 }, NOFUR, 5, 4);
  },
  // Tiny crown: gold band with five points and a red gem
  5: (g, c, fold) => {
    const y = fold ? 0.12 : 0.13;
    g.cylUp(0.045, 0.048, 0.025, 10, c, { y, z: 0.01 }, NOFUR);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.cone(0.012, 0.03, 4, c, { x: Math.sin(a) * 0.042, y: y + 0.038, z: 0.01 + Math.cos(a) * 0.042 }, NOFUR);
    }
    g.sphere(0.009, 0xe63946, { y: y + 0.013, z: 0.058 }, NOFUR, 5, 4);
  },
  // Beanie: a knit cap with a rolled brim and pompom
  6: (g, c, fold) => {
    const y = fold ? 0.1 : 0.11;
    g.sphere(0.085, c, { y, z: 0.015, sy: 0.75 }, NOFUR, 9, 5);
    g.torus(0.083, 0.014, c, { y, z: 0.015, rx: Math.PI / 2 - 0.1 }, NOFUR, 4, 14);
    g.sphere(0.022, WHITE, { y: y + 0.07, z: 0.01 }, NOFUR, 6, 4);
  },
  // Chef hat: white band and a puffy top
  7: (g, c, fold) => {
    const y = fold ? 0.125 : 0.135;
    g.cylUp(0.05, 0.052, 0.04, 10, c, { y, z: 0.01 }, NOFUR);
    g.sphere(0.04, c, { x: -0.025, y: y + 0.06, z: 0.01 }, NOFUR, 6, 4);
    g.sphere(0.045, c, { x: 0.02, y: y + 0.065, z: 0.015 }, NOFUR, 6, 4);
    g.sphere(0.038, c, { y: y + 0.07, z: -0.02 }, NOFUR, 6, 4);
  },
  // Wizard hat (Phase 2 shop): a wide brim, a tall bent cone and two gold stars
  8: (g, c, fold) => {
    const y = fold ? 0.125 : 0.135;
    g.cyl(0.085, 0.085, 0.008, 14, c, { y, z: 0.01 }, NOFUR);
    g.cone(0.055, 0.15, 8, c, { y: y + 0.075, z: -0.01, rx: -0.25 }, NOFUR);
    star(g, 0.02, y + 0.06, 0.04, 0.014, GOLD);
    star(g, -0.018, y + 0.1, 0.02, 0.01, GOLD);
  },
};

/** Adds the collar `id` (no-op for 0 and unknown ids). Returns true when something was drawn. */
export function addCollar(g: GeoBuilder, id: number): boolean {
  const b = COLLAR_BUILDERS[id];
  if (!id || !b) return false;
  b(g, cosmetic('collar', id)?.color ?? 0xe2453c);
  return true;
}

/** Adds the hat `id` (no-op for 0 and unknown ids). Returns true when something was drawn. */
export function addHat(g: GeoBuilder, id: number, fold = false): boolean {
  const b = HAT_BUILDERS[id];
  if (!id || !b) return false;
  b(g, cosmetic('hat', id)?.color ?? 0x8fd3ff, fold);
  return true;
}

export type TrailKind = 'tinsel' | 'paws' | 'glitter' | 'bubbles';
export interface TrailStyle {
  kind: TrailKind;
  colors: readonly number[];
  /** Particles per cat step. */
  perStep: number;
  /** Life in render ticks. */
  life: number;
}
/** Trail styles by trail cosmetic id (Profile.trails). */
export const TRAIL_STYLES: Readonly<Record<number, TrailStyle>> = {
  1: { kind: 'tinsel', colors: [0xffd700, 0xd62828, 0x2a9d8f, 0xfff3c4], perStep: 4, life: 40 },
  2: { kind: 'paws', colors: [cosmetic('trail', 2)?.color ?? 0x6d6875], perStep: 1, life: 75 },
  3: { kind: 'glitter', colors: [0xf72585, 0xffafcc, 0xffffff, 0xb5179e], perStep: 6, life: 30 },
  // Phase 2 shop: soap bubbles that float up and pop
  4: { kind: 'bubbles', colors: [0x8ecae6, 0xbde0fe, 0xffffff, 0xcdb4db], perStep: 2, life: 45 },
};

/** Every collar/hat/trail id in COSMETICS (tests: each maps to an attachment). */
export function cosmeticIds(slot: 'collar' | 'hat' | 'trail'): number[] {
  return COSMETICS.filter((c) => c.slot === slot).map((c) => c.id);
}
