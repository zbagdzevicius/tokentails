/**
 * Procedural models for heroes, minions, camps, Pudding and structures (POC.md §6.9 runtime fallback; our own code,
 * no PPK geometry). Each builder returns one merged geometry for the rig material (render/views/rig.ts).
 * Models face +X, stand on y = 0, metres.
 */
import type * as THREE from 'three';
import type { HeroId } from '../../sim/api';
import { DEFAULT_LOOK, ELEMENT_COLOR, lookCoat, type Coat, type Look } from '../cosmetics';
import { TEAM } from '../palette';
import { ModelBuilder, Part } from './rig';

const EYE = 0x2a1a22;
const WHITE = 0xffffff;
const PINK = 0xff8fb1;

const HALF_PI = Math.PI / 2;

function eyes(b: ModelBuilder, x: number, y: number, dz: number, part: number, pivot: readonly [number, number, number], size = 1): void {
  for (const s of [-1, 1]) {
    b.sphere(0.075 * size, EYE, { at: [x, y, s * dz], scale: [0.6, 1.25, 1], part, pivot }, 10);
    b.sphere(0.028 * size, WHITE, { at: [x + 0.04, y + 0.04, s * dz - 0.02], part, pivot }, 6);
  }
}

function legs(b: ModelBuilder, c: Coat, r: number, fx = 0.2, bx = -0.2, dz = 0.16): void {
  const spots: [number, number, number][] = [
    [Part.LegFL, fx, -dz],
    [Part.LegFR, fx, dz],
    [Part.LegBL, bx, -dz],
    [Part.LegBR, bx, dz],
  ];
  for (const [part, x, z] of spots) {
    const pivot = [x, 0.44, z] as const;
    b.capsule(r, 0.22, c.base, { at: [x, 0.25, z], part, pivot });
    b.sphere(r * 1.15, c.light, { at: [x + 0.03, 0.07, z], scale: [1.25, 0.7, 1], part, pivot }, 8);
  }
}

/**
 * Team colours (POC.md §6.8): Purrhaven cream and rose, Woof navy and brass, on every hero whatever its species. The
 * iso camera mostly sees a hero's back, and at Low on a phone a hero is ~20 CSS px tall, so the team reads from a big
 * shape rather than a thin sash: a team blanket over the back and flanks with a stripe in the second colour, plus a
 * broad sash. (A pennant above the back was tried: the overhead HP bar covers it.) `top` is the height of the
 * body's back (cats 0.9 m, dogs 0.95 m).
 */
function sash(b: ModelBuilder, team: 0 | 1, k = 1, top = 0.9): void {
  const t = TEAM[team];
  b.sphere(1, t.main, { at: [-0.06, top - 0.09, 0], scale: [0.34 * k, 0.17, 0.345 * k] }, 14);
  b.sphere(1, t.second, { at: [-0.06, top - 0.075, 0], scale: [0.35 * k, 0.17, 0.09] }, 10);
  b.torus(0.32 * k, 0.07, t.main, { at: [0.06, 0.62, 0], rot: [0, HALF_PI, 0.55], scale: [1, 1.05, 1.1] });
  b.sphere(0.09, t.second, { at: [0.3 * k, 0.78, 0.2 * k] }, 8);
}

function catBase(b: ModelBuilder, c: Coat): void {
  b.sphere(1, c.base, { at: [0, 0.58, 0], scale: [0.4, 0.32, 0.3] }, 14);
  b.sphere(1, c.light, { at: [0.2, 0.6, 0], scale: [0.22, 0.25, 0.22] }, 10);
  const hp = [0.22, 0.86, 0] as const;
  const head = { part: Part.Head, pivot: hp };
  b.sphere(0.36, c.base, { ...head, at: [0.3, 1.08, 0], scale: [1, 0.92, 1.06] }, 16);
  for (const s of [-1, 1]) {
    b.sphere(0.16, c.light, { ...head, at: [0.44, 0.98, s * 0.19] }, 8);
    b.cone(0.13, 0.27, c.base, { ...head, at: [0.24, 1.39, s * 0.19], rot: [s * 0.28, 0, 0] });
    b.cone(0.07, 0.16, c.accent, { ...head, at: [0.29, 1.36, s * 0.185], rot: [s * 0.28, 0, 0] }, 6);
  }
  b.sphere(0.12, c.light, { ...head, at: [0.6, 1.0, 0], scale: [0.8, 0.7, 1.2] }, 8);
  b.sphere(0.045, PINK, { ...head, at: [0.69, 1.05, 0] }, 6);
  eyes(b, 0.6, 1.14, 0.14, Part.Head, hp);
  legs(b, c, 0.085);
  const tp = [-0.36, 0.62, 0] as const;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    b.sphere(0.07 + 0.015 * t, i === 6 ? c.light : c.base, { at: [-0.38 - 0.24 * t, 0.62 + 0.55 * Math.pow(t, 1.3), 0], part: Part.Tail, pivot: tp }, 7);
  }
}

function dogBase(b: ModelBuilder, c: Coat, muzzle: number): void {
  b.sphere(1, c.base, { at: [0, 0.6, 0], scale: [0.45, 0.35, 0.33] }, 14);
  b.sphere(1, c.light, { at: [0.22, 0.62, 0], scale: [0.24, 0.26, 0.24] }, 10);
  const hp = [0.24, 0.88, 0] as const;
  const head = { part: Part.Head, pivot: hp };
  b.sphere(0.35, c.base, { ...head, at: [0.32, 1.07, 0], scale: [1, 0.95, 1.08] }, 16);
  b.sphere(0.16, muzzle, { ...head, at: [0.6, 0.98, 0], scale: [1.15, 0.8, 1.15] }, 10);
  b.sphere(0.065, EYE, { ...head, at: [0.77, 1.03, 0] }, 8);
  eyes(b, 0.58, 1.16, 0.15, Part.Head, hp);
  legs(b, c, 0.095, 0.22, -0.22, 0.17);
  const tp = [-0.42, 0.68, 0] as const;
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * Math.PI * 1.1;
    b.sphere(0.075, c.base, { at: [-0.44 - Math.sin(a) * 0.12, 0.72 + (1 - Math.cos(a)) * 0.13, 0], part: Part.Tail, pivot: tp }, 7);
  }
}

function clem(b: ModelBuilder, team: 0 | 1, look: Look): void {
  const c: Coat = lookCoat('clem', look) ?? { base: 0xf29a52, light: 0xfff1dc, dark: 0xc96a2c, accent: PINK };
  catBase(b, c);
  // ginger stripes
  for (const x of [-0.12, 0.02]) b.box(0.05, 0.08, 0.6, c.dark, { at: [x, 0.86, 0], rot: [0, 0, 0.2] });
  // pink flower bow on the head
  const head = { part: Part.Head, pivot: [0.22, 0.86, 0] as const };
  b.sphere(0.075, 0xff6f91, { ...head, at: [0.22, 1.42, -0.04], scale: [0.8, 1, 1.3] }, 8);
  b.sphere(0.075, 0xff6f91, { ...head, at: [0.22, 1.42, 0.12], scale: [0.8, 1, 1.3] }, 8);
  b.sphere(0.045, 0xffd34d, { ...head, at: [0.24, 1.43, 0.04] }, 6);
  // neck scarf in the team colour (rose on Purrhaven; a rose scarf on a Woof Clem read as the wrong team)
  b.torus(0.22, 0.06, TEAM[team].main, { at: [0.22, 0.86, 0], rot: [HALF_PI, 0.25, 0] });
  // sword in the right paw
  const w = { part: Part.Weapon, pivot: [0.2, 0.7, 0.3] as const };
  b.sphere(0.1, c.light, { ...w, at: [0.3, 0.66, 0.33] }, 8);
  b.box(0.05, 0.76, 0.12, 0xe8eef7, { ...w, at: [0.32, 1.1, 0.36] });
  b.cone(0.06, 0.14, 0xe8eef7, { ...w, at: [0.32, 1.55, 0.36], scale: [0.8, 1, 1.9] }, 4);
  b.box(0.07, 0.06, 0.3, 0xffd34d, { ...w, at: [0.32, 0.72, 0.36] });
  b.cyl(0.035, 0.035, 0.16, 0x8a5a3a, { ...w, at: [0.32, 0.6, 0.36] }, 6);
  b.sphere(0.05, 0xffd34d, { ...w, at: [0.32, 0.51, 0.36] }, 6);
  sash(b, team);
}

function sage(b: ModelBuilder, team: 0 | 1, look: Look): void {
  const c: Coat = lookCoat('sage', look) ?? { base: 0x9fb3c8, light: 0xeef3f8, dark: 0x5f7189, accent: 0xffb3c8 };
  catBase(b, c);
  for (const x of [-0.2, -0.08, 0.04]) b.box(0.04, 0.07, 0.62, c.dark, { at: [x, 0.86, 0], rot: [0, 0, 0.25] });
  const head = { part: Part.Head, pivot: [0.22, 0.86, 0] as const };
  // leaf-green hood rim and a feather
  b.torus(0.25, 0.07, 0x6fbf7f, { at: [0.22, 0.88, 0], rot: [HALF_PI, 0.2, 0] });
  b.cone(0.05, 0.42, 0x7fd38a, { ...head, at: [0.05, 1.42, -0.18], rot: [-0.5, 0, 0.7], scale: [1, 1, 0.4] }, 6);
  // quiver on the back
  b.cyl(0.08, 0.07, 0.48, 0x8a5a3a, { at: [-0.16, 0.86, -0.16], rot: [0, 0, 0.55] }, 8);
  for (const dz of [-0.03, 0.03]) b.cone(0.035, 0.1, 0xffffff, { at: [-0.32, 1.12 + dz, -0.16 + dz], rot: [0, 0, 0.55] }, 4);
  // bow
  const w = { part: Part.Weapon, pivot: [0.2, 0.72, 0.3] as const };
  b.sphere(0.1, c.light, { ...w, at: [0.32, 0.72, 0.34] }, 8);
  b.torus(0.44, 0.032, 0x9a6a3a, { ...w, at: [0.26, 0.86, 0.36], rot: [0, 0, -HALF_PI] }, Math.PI);
  b.box(0.012, 0.88, 0.012, 0xfff3dc, { ...w, at: [0.26, 0.86, 0.36] });
  b.sphere(0.04, 0x7fd38a, { ...w, at: [0.7, 0.86, 0.36] }, 6);
  sash(b, team);
}

function brutus(b: ModelBuilder, team: 0 | 1, look: Look): void {
  const c: Coat = lookCoat('brutus', look) ?? { base: 0xe0b07a, light: 0xf6e2c2, dark: 0x4a3426, accent: 0x4a3426 };
  dogBase(b, c, 0x8a6446);
  const hp = [0.24, 0.88, 0] as const;
  const head = { part: Part.Head, pivot: hp };
  for (const s of [-1, 1]) b.sphere(0.15, c.dark, { ...head, at: [0.25, 1.06, s * 0.33], scale: [0.6, 1.25, 0.45], rot: [s * 0.35, 0, 0] }, 8);
  // wrinkly brow
  b.box(0.03, 0.03, 0.24, c.dark, { ...head, at: [0.64, 1.08, 0], rot: [0, 0, -0.3] });
  // knight's helmet with a plume
  b.sphere(0.36, 0xb8c4d0, { ...head, at: [0.24, 1.3, 0], scale: [1.0, 0.5, 1.06] }, 14);
  b.cyl(0.37, 0.37, 0.05, 0xd9a441, { ...head, at: [0.25, 1.24, 0] }, 16);
  b.cone(0.1, 0.34, 0xff5a36, { ...head, at: [0.14, 1.58, 0], rot: [0, 0, 0.5], scale: [1, 1, 0.6] });
  // breastplate
  b.sphere(1, 0xc9d3dd, { at: [0.2, 0.66, 0], scale: [0.24, 0.27, 0.3] }, 10);
  // big round shield
  const w = { part: Part.Weapon, pivot: [0.2, 0.72, 0.36] as const };
  b.cyl(0.38, 0.38, 0.08, 0xd9a441, { ...w, at: [0.3, 0.78, 0.46], rot: [HALF_PI, 0, 0] }, 16);
  b.cyl(0.29, 0.29, 0.1, TEAM[team].main, { ...w, at: [0.3, 0.78, 0.47], rot: [HALF_PI, 0, 0] }, 16);
  b.sphere(0.09, 0xfff3dc, { ...w, at: [0.3, 0.78, 0.53] }, 8);
  sash(b, team, 1.05, 0.95);
}

function cacklejaw(b: ModelBuilder, team: 0 | 1, look: Look): void {
  const c: Coat = lookCoat('cacklejaw', look) ?? { base: 0xa8977f, light: 0xe8dcc6, dark: 0x5a3f6e, accent: 0x5a3f6e };
  dogBase(b, c, c.light);
  const head = { part: Part.Head, pivot: [0.24, 0.88, 0] as const };
  // round upright ears
  for (const s of [-1, 1]) {
    b.sphere(0.12, c.base, { ...head, at: [0.22, 1.38, s * 0.2], scale: [0.5, 1, 1] }, 8);
    b.sphere(0.07, c.dark, { ...head, at: [0.25, 1.38, s * 0.2], scale: [0.4, 0.9, 0.9] }, 6);
  }
  // the grin
  b.box(0.05, 0.08, 0.3, EYE, { ...head, at: [0.7, 0.92, 0], rot: [0, 0, 0.1] });
  b.box(0.04, 0.035, 0.27, WHITE, { ...head, at: [0.73, 0.95, 0], rot: [0, 0, 0.1] });
  // spots and purple mane
  for (const [x, y, z] of [
    [-0.15, 0.8, 0.25],
    [0.05, 0.85, -0.27],
    [-0.28, 0.6, -0.24],
    [0.12, 0.52, 0.29],
    [-0.05, 0.66, 0.31],
  ] as const)
    b.sphere(0.07, c.dark, { at: [x, y, z], scale: [1, 1, 0.5] }, 6);
  for (let i = 0; i < 5; i++) b.cone(0.07, 0.24, 0x7d4fa8, { at: [0.2 - i * 0.13, 0.95 - i * 0.03, 0], rot: [0, 0, 0.4] }, 5);
  // claws
  const w = { part: Part.Weapon, pivot: [0.22, 0.72, 0.3] as const };
  b.sphere(0.11, c.light, { ...w, at: [0.36, 0.7, 0.34] }, 8);
  for (const dz of [-0.06, 0, 0.06]) b.cone(0.03, 0.22, 0xe9e0ff, { ...w, at: [0.5, 0.74, 0.34 + dz], rot: [0, 0, -1.2] }, 5);
  sash(b, team, 1.02, 0.95);
}

const HERO_BUILD: Record<HeroId, (b: ModelBuilder, team: 0 | 1, look: Look) => void> = { clem, sage, brutus, cacklejaw };

/** Visual scale per hero (render only). */
export const HERO_SCALE: Readonly<Record<HeroId, number>> = Object.freeze({ clem: 1.4, sage: 1.34, brutus: 1.55, cacklejaw: 1.44 });

export function heroGeometry(hero: HeroId, team: 0 | 1, look: Look = DEFAULT_LOOK): THREE.BufferGeometry {
  const b = new ModelBuilder();
  HERO_BUILD[hero](b, team, look);
  decorate(b, hero, look);
  return b.build();
}

const GOLD = 0xffd34d;
const isDog = (hero: HeroId): boolean => hero === 'brutus' || hero === 'cacklejaw';

/**
 * Look extras (render/cosmetics.ts): the Founder gold-trim cape, the Pink Bow, Dawnblade armour and sun blade, and
 * the chroma gem. All merged into the same geometry, so a dressed hero is still one draw call.
 */
function decorate(b: ModelBuilder, hero: HeroId, look: Look): void {
  const k = isDog(hero) ? 1.08 : 1;
  const coat = look.coat ?? '';
  if (coat.startsWith('coat.founder.') || coat === 'skin.clem.dawnblade') {
    // cape over the back (plum with a gold hem) and a gold collar
    const cape = coat === 'skin.clem.dawnblade' ? 0xfff3dc : 0x5a2d6e;
    b.sphere(1, cape, { at: [-0.12 * k, 0.74 * k, 0], scale: [0.36 * k, 0.2 * k, 0.34 * k] }, 12);
    b.torus(0.33 * k, 0.03, GOLD, { at: [-0.12 * k, 0.7 * k, 0], rot: [Math.PI / 2, 0, 0], scale: [1.08, 1, 1] });
    b.torus(0.23 * k, 0.04, GOLD, { at: [0.22 * k, 0.88 * k, 0], rot: [Math.PI / 2, 0.25, 0] });
  }
  if (coat === 'skin.clem.pink_bow' && hero === 'clem') {
    const head = { part: Part.Head, pivot: [0.22, 0.86, 0] as const };
    for (const s of [-1, 1]) b.sphere(0.14, 0xff6f91, { ...head, at: [0.18, 1.5, s * 0.15], scale: [0.6, 0.9, 1.3] }, 10);
    b.sphere(0.07, 0xfff3dc, { ...head, at: [0.2, 1.5, 0] }, 8);
    // tail bow
    b.sphere(0.09, 0xff6f91, { at: [-0.5, 0.95, 0], scale: [0.6, 0.9, 1.6], part: Part.Tail, pivot: [-0.36, 0.62, 0] }, 8);
  }
  if (coat === 'skin.clem.dawnblade' && hero === 'clem') {
    // gold pauldrons and the sun blade (a wide glowing blade over the sword)
    for (const s of [-1, 1]) b.sphere(0.12, GOLD, { at: [0.18, 0.82, s * 0.24], scale: [1, 0.7, 1] }, 8);
    const w = { part: Part.Weapon, pivot: [0.2, 0.7, 0.3] as const };
    b.box(0.07, 0.9, 0.2, 0xfff1a8, { ...w, at: [0.32, 1.16, 0.36] });
    b.sphere(0.12, 0xffe9a0, { ...w, at: [0.32, 0.74, 0.36], scale: [0.6, 0.6, 1.6] }, 8);
    b.cyl(0.16, 0.16, 0.02, GOLD, { ...w, at: [0.32, 1.66, 0.36], rot: [Math.PI / 2, 0, 0] }, 12);
  }
  if (look.chroma) {
    // element gem on the chest and a thin element band on the sash
    const c = ELEMENT_COLOR[look.chroma];
    b.sphere(0.07, c, { at: [0.36 * k, 0.72 * k, 0], scale: [0.6, 1, 1] }, 8);
    b.torus(0.32 * k, 0.018, c, { at: [0.04, 0.62, 0], rot: [0, Math.PI / 2, 0.55], scale: [1.02, 1.07, 1.12] }, Math.PI * 2);
  }
}

/** A Companion Kitten: a small cat in its coat with an element collar (one draw call). Faces +X, ~0.55 m tall. */
export function kittenGeometry(coat: Coat, collar: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  catBase(b, coat);
  b.torus(0.21, 0.05, collar, { at: [0.22, 0.86, 0], rot: [HALF_PI, 0.25, 0] });
  b.sphere(0.05, 0xffd34d, { at: [0.4, 0.8, 0] }, 6);
  return b.build();
}

// ------------------------------------------------------------------------------------------------ minions

export type MinionVariant = 'melee' | 'ranged' | 'siege';

function cadet(b: ModelBuilder, team: 0 | 1, ranged: boolean): void {
  const t = TEAM[team];
  const cat = team === 0;
  const coat = cat ? 0xfff1dc : 0xc99a6a;
  b.sphere(1, t.main, { at: [0, 0.32, 0], scale: [0.26, 0.22, 0.22] }, 10);
  b.sphere(0.24, coat, { at: [0.12, 0.62, 0] }, 12);
  if (cat) for (const s of [-1, 1]) b.cone(0.08, 0.16, coat, { at: [0.08, 0.84, s * 0.12], rot: [s * 0.3, 0, 0] }, 6);
  else for (const s of [-1, 1]) b.sphere(0.09, 0x6b4a32, { at: [0.08, 0.62, s * 0.22], scale: [0.6, 1.3, 0.5] }, 6);
  if (!cat) b.sphere(0.09, 0xf0dcc0, { at: [0.32, 0.57, 0], scale: [1.2, 0.8, 1.1] }, 8);
  for (const s of [-1, 1]) b.sphere(0.04, EYE, { at: [0.33, 0.66, s * 0.09], scale: [0.6, 1.2, 1] }, 6);
  for (const s of [-1, 1]) b.sphere(0.07, coat, { at: [0.05, 0.08, s * 0.11] }, 6);
  // helmet
  b.sphere(0.2, t.second, { at: [0.1, 0.74, 0], scale: [1.1, 0.55, 1.1] }, 10);
  if (ranged) {
    b.cyl(0.02, 0.02, 0.45, 0x8a5a3a, { at: [0.22, 0.5, 0.22], rot: [0, 0, -0.4] }, 5);
    b.sphere(0.07, cat ? 0x9fd3ff : 0xffd27a, { at: [0.32, 0.72, 0.22] }, 8);
  } else {
    b.box(0.03, 0.34, 0.07, 0xe8eef7, { at: [0.24, 0.46, 0.22], rot: [0, 0, -0.5] });
  }
}

function siege(b: ModelBuilder, team: 0 | 1): void {
  const t = TEAM[team];
  const wood = 0x9a6a3a;
  b.box(1.1, 0.25, 0.7, wood, { at: [0, 0.35, 0] });
  b.box(1.0, 0.08, 0.76, t.main, { at: [0, 0.5, 0] });
  for (const x of [-0.38, 0.38]) for (const z of [-0.4, 0.4]) b.cyl(0.18, 0.18, 0.08, 0x5a3a22, { at: [x, 0.18, z], rot: [HALF_PI, 0, 0] }, 10);
  if (team === 0) {
    b.box(0.08, 0.7, 0.08, wood, { at: [-0.1, 0.85, 0], rot: [0, 0, 0.6] });
    b.sphere(0.32, 0xff6f91, { at: [-0.35, 1.18, 0] }, 12);
    b.torus(0.3, 0.025, 0xc94a72, { at: [-0.35, 1.18, 0], rot: [0.5, 0.3, 0] });
    b.torus(0.3, 0.025, 0xc94a72, { at: [-0.35, 1.18, 0], rot: [1.4, 0.9, 0] });
  } else {
    b.box(0.9, 0.12, 0.12, 0xfff3dc, { at: [0, 0.78, 0] });
    for (const x of [-0.46, 0.46]) for (const z of [-0.07, 0.07]) b.sphere(0.1, 0xfff3dc, { at: [x, 0.78, z] }, 8);
    b.box(0.3, 0.35, 0.5, t.second, { at: [0.45, 0.65, 0] });
  }
}

export function minionGeometry(variant: MinionVariant, team: 0 | 1): THREE.BufferGeometry {
  const b = new ModelBuilder();
  if (variant === 'siege') siege(b, team);
  else cadet(b, team, variant === 'ranged');
  return b.build();
}

export function ratGeometry(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.sphere(1, 0x8c8a94, { at: [0, 0.32, 0], scale: [0.42, 0.28, 0.28] }, 12);
  b.sphere(0.2, 0x8c8a94, { at: [0.38, 0.42, 0], scale: [1.3, 0.9, 0.9] }, 10);
  b.sphere(0.04, PINK, { at: [0.64, 0.42, 0] }, 6);
  for (const s of [-1, 1]) {
    b.sphere(0.11, 0xffb3c8, { at: [0.3, 0.6, s * 0.14], scale: [0.4, 1, 1] }, 8);
    b.sphere(0.035, EYE, { at: [0.55, 0.48, s * 0.08] }, 6);
  }
  for (let i = 0; i < 6; i++) b.sphere(0.035, 0xffb3c8, { at: [-0.4 - i * 0.1, 0.3 + Math.sin(i * 0.8) * 0.05, Math.sin(i) * 0.06] }, 5);
  return b.build();
}

export function puddingGeometry(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.cyl(1.7, 2.1, 2.2, 0xffe2a0, { at: [0, 1.1, 0] }, 24);
  b.cyl(1.72, 1.72, 0.35, 0xb5651d, { at: [0, 2.3, 0] }, 24);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.sphere(0.32, 0xb5651d, { at: [Math.cos(a) * 1.62, 2.0, Math.sin(a) * 1.62], scale: [0.7, 1.4, 0.7] }, 8);
  }
  b.sphere(0.35, 0xfff8ec, { at: [0, 2.6, 0] }, 12);
  b.sphere(0.22, 0xe5484d, { at: [0, 2.95, 0] }, 10);
  b.cyl(0.02, 0.02, 0.3, 0x4f9a4a, { at: [0.05, 3.2, 0], rot: [0, 0, -0.3] }, 4);
  for (const s of [-1, 1]) {
    b.sphere(0.2, EYE, { at: [1.72, 1.3, s * 0.45], scale: [0.4, 1.3, 1] }, 10);
    b.sphere(0.07, WHITE, { at: [1.82, 1.42, s * 0.42] }, 6);
    b.sphere(0.2, 0xff9eb7, { at: [1.68, 0.95, s * 0.85], scale: [0.3, 0.6, 1] }, 8);
  }
  b.torus(0.18, 0.04, EYE, { at: [1.78, 0.98, 0], rot: [0, HALF_PI, Math.PI] }, Math.PI);
  return b.build();
}

// --------------------------------------------------------------------------------------------- structures

export function towerGeometry(team: 0 | 1, tier: 'outer' | 'inner'): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const t = TEAM[team];
  const tall = tier === 'inner' ? 0.9 : 0;
  const stone = team === 0 ? 0xf3ead8 : 0x6f84b5;
  const stone2 = team === 0 ? 0xe6d6b8 : 0x52679a;
  b.cyl(1.6, 1.8, 0.6, stone2, { at: [0, 0.3, 0] }, 12);
  b.cyl(1.05, 1.3, 3.0 + tall, stone, { at: [0, 2.1 + tall / 2, 0] }, 12);
  for (const y of [1.2, 2.6 + tall]) b.cyl(1.18, 1.18, 0.18, t.main, { at: [0, y, 0] }, 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.box(0.08, 0.5, 0.3, 0x2a1a22, { at: [Math.cos(a) * 1.08, 2.0 + tall, Math.sin(a) * 1.08], rot: [0, -a, 0] });
  }
  if (team === 0) {
    b.cone(1.45, 1.6, t.main, { at: [0, 4.4 + tall, 0] }, 12);
    b.sphere(0.45, 0xffd27a, { at: [0, 5.45 + tall, 0] }, 12);
    b.torus(0.43, 0.04, 0xff9f7a, { at: [0, 5.45 + tall, 0], rot: [0.7, 0, 0.3] });
    b.torus(0.43, 0.04, 0xff9f7a, { at: [0, 5.45 + tall, 0], rot: [1.6, 0.6, 0] });
    for (const s of [-1, 1]) b.cone(0.28, 0.5, t.main, { at: [0, 4.0 + tall, s * 1.1], rot: [s * 0.4, 0, 0] }, 6);
  } else {
    b.sphere(1.25, t.second, { at: [0, 3.65 + tall, 0], scale: [1, 0.75, 1] }, 14);
    b.cyl(0.08, 0.08, 0.9, t.second, { at: [0, 4.9 + tall, 0] }, 6);
    b.box(0.7, 0.14, 0.14, 0xfff3dc, { at: [0, 5.4 + tall, 0] });
    for (const x of [-0.35, 0.35]) for (const z of [-0.08, 0.08]) b.sphere(0.11, 0xfff3dc, { at: [x, 5.4 + tall, z] }, 8);
  }
  if (tier === 'inner') b.cyl(1.22, 1.22, 0.12, 0xffd34d, { at: [0, 3.45 + tall, 0] }, 12);
  return b.build();
}

export function coreGeometry(team: 0 | 1): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const t = TEAM[team];
  b.cyl(3.2, 3.6, 0.8, team === 0 ? 0xf3ead8 : 0x6f84b5, { at: [0, 0.4, 0] }, 20);
  b.cyl(3.25, 3.25, 0.16, t.main, { at: [0, 0.85, 0] }, 20);
  if (team === 0) {
    // the Great Yarn Ball
    b.sphere(2.2, 0xff6f91, { at: [0, 3.1, 0] }, 20);
    for (let i = 0; i < 5; i++) b.torus(2.18, 0.07, 0xc94a72, { at: [0, 3.1, 0], rot: [i * 0.7, i * 1.1, i * 0.3] });
    b.cyl(0.12, 0.12, 2.2, 0xc94a72, { at: [1.8, 1.6, 1.2], rot: [0.6, 0, 1.1] }, 6);
  } else {
    // the Grand Doghouse with a golden bone
    b.box(3.6, 2.6, 3.2, 0x3d5a9e, { at: [0, 2.15, 0] });
    b.cone(2.9, 1.9, 0x26396b, { at: [0, 4.4, 0], rot: [0, Math.PI / 4, 0], scale: [1.05, 1, 0.95] }, 4);
    b.box(1.2, 1.6, 0.1, 0x1a2340, { at: [1.81, 1.65, 0], rot: [0, HALF_PI, 0] });
    b.box(2.4, 0.4, 0.4, 0xd9a441, { at: [0, 5.7, 0] });
    for (const x of [-1.25, 1.25]) for (const z of [-0.25, 0.25]) b.sphere(0.36, 0xd9a441, { at: [x, 5.7, z] }, 10);
  }
  const g = b.build();
  g.scale(0.72, 0.72, 0.72);
  return g;
}

export function fountainGeometry(team: 0 | 1): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const t = TEAM[team];
  b.torus(4.0, 0.28, team === 0 ? 0xf3ead8 : 0x8ea0c8, { at: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0] });
  b.cyl(3.85, 3.85, 0.04, 0x8fd6ff, { at: [0, 0.03, 0] }, 28);
  b.cyl(0.22, 0.32, 0.9, t.second, { at: [-1.2, 0.45, 0] }, 8);
  b.sphere(0.34, t.main, { at: [-1.2, 1.05, 0] }, 10);
  b.cyl(0.6, 0.6, 0.06, 0x8fd6ff, { at: [-1.2, 0.8, 0] }, 12);
  return b.build();
}
