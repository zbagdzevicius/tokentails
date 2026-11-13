/**
 * Procedural models for minions, camps, Pudding and structures (our own code, no PPK geometry). Heroes, the minions'
 * bodies and Companion Kittens are upright PPK-style characters built by render/chars/ (one skinned mesh each).
 * Models face +X, stand on y = 0, metres.
 */
import type * as THREE from 'three';
import type { HeroId } from '../../sim/api';
import { HERO_TOP } from '../chars';
import { uprightMinionGeometry } from '../chars';
import { HERO_BUILD } from '../chars/heroSize';
import { TEAM } from '../palette';
import { ModelBuilder } from './rig';
import { RING as MEATBALL_RING } from '../chars/heroes/meatball';
import { RING as PIXEL_RING } from '../chars/heroes/pixel';
import { RING as NUGGET_RING } from '../chars/heroes/nugget';
import { RING as MARSHMALLOW_RING } from '../chars/heroes/marshmallow';
import { RING as BRAVO_RING } from '../chars/heroes/bravo';
import { RING as CHILI_RING } from '../chars/heroes/chili';
import { RING as HOWLER_RING } from '../chars/heroes/howler';
import { RING as ROCKET_RING } from '../chars/heroes/rocket';
import { RING as FRANKIE_RING } from '../chars/heroes/frankie';
import { RING as DOMINO_RING } from '../chars/heroes/domino';
import { RING as DUCHESS_RING } from '../chars/heroes/duchess';
import { PLATE_HEADROOM as STILTS_PLATE_HEADROOM, RING as STILTS_RING } from '../chars/heroes/stilts';

const EYE = 0x2a1a22;
const WHITE = 0xffffff;
const PINK = 0xff8fb1;

const HALF_PI = Math.PI / 2;

/**
 * Living pass (P2): part ids the structure life patch moves (views/towerView.ts `structureLifeMaterial`). The rig shader
 * leaves every part ≥ 8 still on a structure (its uCast / uSwing stay 0), so these ids only move under the life patch:
 * a tower's orb bobs, turns and glows, the core's yarn ball turns, a camp monster's head sniffs and its tail sways, and
 * the fountain's basin and spout water carry the ripple shader (views/fountainWater.ts). Render only.
 */
export const LIFE_PART = Object.freeze({ orb: 9, yarn: 10, head: 11, tail: 12, water: 13, spout: 14 } as const);

/**
 * Overhead bar lift factor per hero (ui/overhead.ts multiplies its hero lift of 1.62 by it): the bar sits just above
 * the upright character's ear tips, bow or plume (HERO_TOP).
 */
export const HERO_SCALE: Readonly<Record<HeroId, number>> = Object.freeze({
  clem: (HERO_TOP.clem + 0.15) / 1.62,
  sage: (HERO_TOP.sage + 0.15) / 1.62,
  brutus: (HERO_TOP.brutus + 0.15) / 1.62,
  cacklejaw: (HERO_TOP.cacklejaw + 0.15) / 1.62,
  lambo: (HERO_TOP.lambo + 0.15) / 1.62,
  aviete: (HERO_TOP.aviete + 0.15) / 1.62,
  bengas: (HERO_TOP.bengas + 0.15) / 1.62,
  gabe: (HERO_TOP.gabe + 0.15) / 1.62,
  meatball: (HERO_TOP.meatball + 0.15) / 1.62,
  pixel: (HERO_TOP.pixel + 0.15) / 1.62,
  duchess: (HERO_TOP.duchess + 0.15) / 1.62,
  stilts: (HERO_TOP.stilts + STILTS_PLATE_HEADROOM) / 1.62,
  nugget: (HERO_TOP.nugget + 0.15) / 1.62,
  marshmallow: (HERO_TOP.marshmallow + 0.15) / 1.62,
  bravo: (HERO_TOP.bravo + 0.15) / 1.62,
  chili: (HERO_TOP.chili + 0.15) / 1.62,
  howler: (HERO_TOP.howler + 0.15) / 1.62,
  rocket: (HERO_TOP.rocket + 0.15) / 1.62,
  frankie: (HERO_TOP.frankie + 0.15) / 1.62,
  domino: (HERO_TOP.domino + 0.15) / 1.62,
});

/**
 * Relation ring size under each hero (m): follows the per-hero visual build (chars/heroSize.ts, render only), so tiny
 * Pixel's ring is smaller and the big tanks' and Meatball's are wider (at most +12%: the sim radius is unchanged).
 */
export const HERO_RING: Readonly<Record<HeroId, number>> = Object.freeze({
  clem: HERO_BUILD.clem.ring, sage: HERO_BUILD.sage.ring, brutus: HERO_BUILD.brutus.ring, cacklejaw: HERO_BUILD.cacklejaw.ring,
  lambo: HERO_BUILD.lambo.ring, aviete: HERO_BUILD.aviete.ring, bengas: HERO_BUILD.bengas.ring, gabe: HERO_BUILD.gabe.ring,
  meatball: MEATBALL_RING, pixel: PIXEL_RING, duchess: DUCHESS_RING, stilts: STILTS_RING,
  nugget: NUGGET_RING, marshmallow: MARSHMALLOW_RING, bravo: BRAVO_RING, chili: CHILI_RING, howler: HOWLER_RING,
  rocket: ROCKET_RING, frankie: FRANKIE_RING, domino: DOMINO_RING,
});

// ------------------------------------------------------------------------------------------------ minions

export type MinionVariant = 'melee' | 'ranged' | 'siege';

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

/**
 * Minion geometry for the instanced upright material: kitten squires and pup guards are chibi characters (units H,
 * scaled to metres by the instance); the siege cart stays a vehicle (metres, part 0 only).
 */
export function minionGeometry(variant: MinionVariant, team: 0 | 1): THREE.BufferGeometry {
  if (variant !== 'siege') return uprightMinionGeometry(team, variant === 'ranged');
  const b = new ModelBuilder();
  siege(b, team);
  return b.build();
}

export function ratGeometry(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  // living pass: the head (snout, nose, ears, eyes) sniffs about the neck, the tail sways about its root
  const head = { part: LIFE_PART.head, pivot: [0.26, 0.4, 0] as const };
  const tail = { part: LIFE_PART.tail, pivot: [-0.36, 0.3, 0] as const };
  b.sphere(1, 0x8c8a94, { at: [0, 0.32, 0], scale: [0.42, 0.28, 0.28] }, 12);
  b.sphere(0.2, 0x8c8a94, { at: [0.38, 0.42, 0], scale: [1.3, 0.9, 0.9], ...head }, 10);
  b.sphere(0.04, PINK, { at: [0.64, 0.42, 0], ...head }, 6);
  for (const s of [-1, 1]) {
    b.sphere(0.11, 0xffb3c8, { at: [0.3, 0.6, s * 0.14], scale: [0.4, 1, 1], ...head }, 8);
    b.sphere(0.035, EYE, { at: [0.55, 0.48, s * 0.08], ...head }, 6);
  }
  for (let i = 0; i < 6; i++) b.sphere(0.035, 0xffb3c8, { at: [-0.4 - i * 0.1, 0.3 + Math.sin(i * 0.8) * 0.05, Math.sin(i) * 0.06], ...tail }, 5);
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

export function towerGeometry(team: 0 | 1, tier: 'outer' | 'inner' | 'gate' | 'hearth'): THREE.BufferGeometry {
  if (tier === 'hearth') return hearthGuardGeometry(team);
  const b = new ModelBuilder();
  const t = TEAM[team];
  const tall = tier === 'inner' ? 0.9 : tier === 'gate' ? 1.6 : 0;
  // Sim v19 (Hearthwood): the gate tower stands on a wider buttressed plinth with a second gold band
  if (tier === 'gate') {
    const st = team === 0 ? 0xe6d6b8 : 0x7a6448;
    b.cyl(2.0, 2.2, 0.5, st, { at: [0, 0.25, 0] }, 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(0.5, 1.5, 0.7, st, { at: [Math.cos(a) * 1.35, 0.75, Math.sin(a) * 1.35], rot: [0, -a, 0] });
    }
    b.cyl(1.25, 1.25, 0.12, 0xffd34d, { at: [0, 1.9, 0] }, 12);
  }
  const stone = team === 0 ? 0xf3ead8 : 0x9a8366;
  const stone2 = team === 0 ? 0xe6d6b8 : 0x7a6448;
  b.cyl(1.6, 1.8, 0.6, stone2, { at: [0, 0.3, 0] }, 12);
  b.cyl(1.05, 1.3, 3.0 + tall, stone, { at: [0, 2.1 + tall / 2, 0] }, 12);
  for (const y of [1.2, 2.6 + tall]) b.cyl(1.18, 1.18, 0.18, t.main, { at: [0, y, 0] }, 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.box(0.08, 0.5, 0.3, 0x2a1a22, { at: [Math.cos(a) * 1.08, 2.0 + tall, Math.sin(a) * 1.08], rot: [0, -a, 0] });
  }
  if (team === 0) {
    b.cone(1.45, 1.6, t.main, { at: [0, 4.4 + tall, 0] }, 12);
    // living pass: the orb and its rings bob, turn and glow (LIFE_PART.orb, pivot at the orb's centre)
    const orb = { part: LIFE_PART.orb, pivot: [0, 5.45 + tall, 0] as const };
    b.sphere(0.45, 0xffd27a, { at: [0, 5.45 + tall, 0], ...orb }, 12);
    b.torus(0.43, 0.04, 0xff9f7a, { at: [0, 5.45 + tall, 0], rot: [0.7, 0, 0.3], ...orb });
    b.torus(0.43, 0.04, 0xff9f7a, { at: [0, 5.45 + tall, 0], rot: [1.6, 0.6, 0], ...orb });
    for (const s of [-1, 1]) b.cone(0.28, 0.5, t.main, { at: [0, 4.0 + tall, s * 1.1], rot: [s * 0.4, 0, 0] }, 6);
  } else {
    b.sphere(1.25, t.second, { at: [0, 3.65 + tall, 0], scale: [1, 0.75, 1] }, 14);
    b.cyl(0.08, 0.08, 0.9, t.second, { at: [0, 4.9 + tall, 0] }, 6);
    // living pass: the bone on the mast bobs and turns like the cat orb
    const orb = { part: LIFE_PART.orb, pivot: [0, 5.4 + tall, 0] as const };
    b.box(0.7, 0.14, 0.14, 0xfff3dc, { at: [0, 5.4 + tall, 0], ...orb });
    for (const x of [-0.35, 0.35]) for (const z of [-0.08, 0.08]) b.sphere(0.11, 0xfff3dc, { at: [x, 5.4 + tall, z], ...orb }, 8);
  }
  if (tier === 'inner' || tier === 'gate') b.cyl(1.22, 1.22, 0.12, 0xffd34d, { at: [0, 3.45 + tall, 0] }, 12);
  return b.build();
}

/**
 * Sim v19 (Hearthwood): a Hearth Guard flanking the core. A squat round keep with a hearth lantern on top (a cat
 * lantern of warm glass for Purrhaven, a bone-handled brazier for Woof). Original model.
 */
function hearthGuardGeometry(team: 0 | 1): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const t = TEAM[team];
  const stone = team === 0 ? 0xf3ead8 : 0x9a8366;
  const stone2 = team === 0 ? 0xe6d6b8 : 0x7a6448;
  b.cyl(1.9, 2.1, 0.6, stone2, { at: [0, 0.3, 0] }, 14);
  b.cyl(1.45, 1.65, 2.4, stone, { at: [0, 1.8, 0] }, 14);
  b.cyl(1.55, 1.55, 0.2, t.main, { at: [0, 1.4, 0] }, 14);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(0.4, 0.45, 0.4, stone, { at: [Math.cos(a) * 1.4, 3.2, Math.sin(a) * 1.4], rot: [0, -a, 0] });
  }
  b.cyl(1.5, 1.5, 0.14, 0xffd34d, { at: [0, 3.0, 0] }, 14);
  if (team === 0) {
    b.cyl(0.42, 0.5, 0.9, 0x6e4a2e, { at: [0, 3.5, 0] }, 8);
    b.sphere(0.55, 0xffc76b, { at: [0, 4.25, 0], part: LIFE_PART.orb, pivot: [0, 4.25, 0] }, 12);
    b.cone(0.6, 0.6, t.main, { at: [0, 4.95, 0] }, 8);
    for (const s of [-1, 1]) b.cone(0.16, 0.32, t.main, { at: [0, 5.15, s * 0.32], rot: [s * 0.4, 0, 0] }, 6);
  } else {
    b.cyl(0.7, 0.45, 0.6, 0x4e3524, { at: [0, 3.4, 0] }, 10);
    b.sphere(0.5, 0xff9a3d, { at: [0, 3.9, 0], scale: [1, 1.3, 1], part: LIFE_PART.orb, pivot: [0, 3.9, 0] }, 10);
    b.box(1.5, 0.16, 0.16, 0xfff3dc, { at: [0, 4.65, 0] });
    for (const x of [-0.75, 0.75]) for (const z of [-0.09, 0.09]) b.sphere(0.13, 0xfff3dc, { at: [x, 4.65, z] }, 8);
  }
  return b.build();
}

// ---------------------------------------------------------------------------------- Hearthwood jungle (sim v19)

/** Prickle Hollow's buff monster: a round hedgehog with an autumn-leaf back. Faces +X. */
export function hedgehogGeometry(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.sphere(1, 0xc9a27a, { at: [0, 0.42, 0], scale: [0.55, 0.42, 0.45] }, 14);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 * 2.618;
    const el = 0.25 + ((i * 7) % 11) / 11;
    const x = -0.12 + Math.cos(el) * Math.cos(a) * 0.42;
    const z = Math.cos(el) * Math.sin(a) * 0.38;
    const y = 0.42 + Math.sin(el) * 0.36;
    b.cone(0.07, 0.42, i % 3 ? 0x6e4a2e : 0xc8642a, { at: [x, y, z], rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9 - 0.4] }, 5);
  }
  const head = { part: LIFE_PART.head, pivot: [0.36, 0.4, 0] as const };
  b.sphere(0.22, 0xe7c9a4, { at: [0.5, 0.4, 0], scale: [1.4, 0.9, 0.9], ...head }, 10);
  b.sphere(0.06, EYE, { at: [0.8, 0.42, 0], ...head }, 6);
  for (const s of [-1, 1]) b.sphere(0.05, EYE, { at: [0.6, 0.52, s * 0.12], ...head }, 6);
  return b.build();
}

/** Crow Roost's buff monster: an old crow with a ragged collar and a brass monocle. Faces +X. */
export function crowGeometry(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.sphere(1, 0x2f2b3a, { at: [0, 0.7, 0], scale: [0.5, 0.45, 0.38] }, 14);
  const head = { part: LIFE_PART.head, pivot: [0.3, 0.98, 0] as const };
  b.sphere(0.27, 0x3a3548, { at: [0.36, 1.15, 0], ...head }, 12);
  b.cone(0.1, 0.38, 0xe3b04b, { at: [0.66, 1.12, 0], rot: [0, 0, -HALF_PI], ...head }, 6);
  b.torus(0.08, 0.02, 0xd9a441, { at: [0.56, 1.22, 0.12], rot: [0, HALF_PI, 0], ...head });
  b.sphere(0.04, 0xffe9a8, { at: [0.6, 1.22, 0.12], ...head }, 6);
  b.sphere(0.04, EYE, { at: [0.56, 1.22, -0.12], ...head }, 6);
  for (const s of [-1, 1]) b.box(0.6, 0.08, 0.34, 0x24202e, { at: [-0.06, 0.8, s * 0.38], rot: [s * 0.35, 0, -0.2] });
  b.box(0.4, 0.06, 0.26, 0x24202e, { at: [-0.5, 0.75, 0], rot: [0, 0, 0.25], part: LIFE_PART.tail, pivot: [-0.32, 0.78, 0] });
  b.cyl(0.03, 0.03, 0.4, 0xe3b04b, { at: [0.05, 0.2, 0.12] }, 4);
  b.cyl(0.03, 0.03, 0.4, 0xe3b04b, { at: [0.05, 0.2, -0.12] }, 4);
  b.torus(0.24, 0.05, 0x8a2a3a, { at: [0.25, 0.95, 0], rot: [0, HALF_PI, 0.4] });
  return b.build();
}

/** The Frog Pond's small monster: a squat toad with a lily-pad hat. Faces +X. */
export function toadGeometry(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.sphere(1, 0x7aa65a, { at: [0, 0.3, 0], scale: [0.5, 0.3, 0.45] }, 12);
  b.sphere(1, 0xe8e0a8, { at: [0.12, 0.22, 0], scale: [0.38, 0.18, 0.34] }, 10);
  for (const s of [-1, 1]) {
    b.sphere(0.12, 0x7aa65a, { at: [0.28, 0.55, s * 0.18], part: LIFE_PART.head, pivot: [0.22, 0.42, 0] }, 8);
    b.sphere(0.06, EYE, { at: [0.36, 0.58, s * 0.2], part: LIFE_PART.head, pivot: [0.22, 0.42, 0] }, 6);
    b.sphere(0.13, 0x6a9a4a, { at: [-0.2, 0.15, s * 0.42], scale: [1.4, 0.6, 0.8] }, 8);
  }
  b.cyl(0.3, 0.3, 0.03, 0x4f9a4a, { at: [0, 0.62, 0] }, 12);
  return b.build();
}

/**
 * Captain Grizzlechop (Hearthwood's river boss): a big rat pirate in a red coat, a tricorn hat, an eye patch and a
 * cheese-wedge cutlass. Original model from our own primitives. Faces +X, about 1.8 m tall at scale 1.
 */
export function grizzlechopGeometry(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const fur = 0x7d7480;
  b.sphere(1, 0xa8323a, { at: [0, 0.75, 0], scale: [0.62, 0.62, 0.55] }, 16);
  b.sphere(1, 0xd9a441, { at: [0.02, 0.6, 0], scale: [0.64, 0.08, 0.57] }, 14);
  b.sphere(1, fur, { at: [0.5, 1.25, 0], scale: [0.4, 0.34, 0.34] }, 14);
  b.sphere(0.2, fur, { at: [0.88, 1.18, 0], scale: [1.4, 0.8, 0.8] }, 10);
  b.sphere(0.07, PINK, { at: [1.13, 1.2, 0] }, 6);
  for (const s of [-1, 1]) b.sphere(0.18, 0xffb3c8, { at: [0.36, 1.58, s * 0.26], scale: [0.4, 1, 1] }, 8);
  b.sphere(0.06, EYE, { at: [0.84, 1.36, 0.14] }, 6);
  b.box(0.04, 0.16, 0.18, 0x1a1418, { at: [0.84, 1.36, -0.14] });
  b.box(0.02, 0.03, 0.5, 0x1a1418, { at: [0.72, 1.42, -0.05], rot: [0.5, 0, 0] });
  // tricorn
  b.cyl(0.5, 0.55, 0.1, 0x1f1a22, { at: [0.45, 1.62, 0] }, 3);
  b.cyl(0.26, 0.32, 0.32, 0x1f1a22, { at: [0.45, 1.8, 0] }, 10);
  b.cyl(0.33, 0.33, 0.05, 0xd9a441, { at: [0.45, 1.7, 0] }, 10);
  b.sphere(0.07, 0xfff3dc, { at: [0.75, 1.82, 0] }, 6);
  // cheese cutlass
  b.box(0.08, 0.08, 0.3, 0x5a3a22, { at: [0.55, 0.85, 0.62], rot: [HALF_PI, 0, 0] });
  b.box(0.95, 0.06, 0.18, 0xffd34d, { at: [1.05, 0.95, 0.62], rot: [0, 0, 0.35] });
  for (let i = 0; i < 3; i++) b.sphere(0.04, 0xe0b030, { at: [0.85 + i * 0.22, 0.92 + i * 0.07, 0.72] }, 5);
  // peg legs and a tail
  for (const s of [-1, 1]) b.cyl(0.08, 0.06, 0.4, 0x6e4a2e, { at: [0.05, 0.18, s * 0.25] }, 6);
  for (let i = 0; i < 8; i++) b.sphere(0.06, 0xffb3c8, { at: [-0.62 - i * 0.12, 0.45 + Math.sin(i * 0.8) * 0.08, Math.sin(i) * 0.08] }, 5);
  return b.build();
}

export function coreGeometry(team: 0 | 1): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const t = TEAM[team];
  // QA 2026-11-07: the Woof base is dark walnut with a brass rim, so the ochre doghouse stands off its ochre plaza
  // (a mid-tone base on the sandstone plaza read as one blob)
  b.cyl(3.2, 3.6, 0.8, team === 0 ? 0xf3ead8 : 0x4e3524, { at: [0, 0.4, 0] }, 20);
  // v6 facelift review: the cat base is rose-light with rose-top wraps, not the saturated brand rose, so it never sits
  // next to the enemy red (#FF4F58) in hue and lightness; the relation read stays on the HP bar and the minimap
  b.cyl(3.25, 3.25, 0.16, team === 0 ? 0xffb3cd : 0xd9a441, { at: [0, 0.85, 0] }, 20);
  if (team === 0) {
    // the Great Yarn Ball
    // living pass: the ball turns slowly on the spot (LIFE_PART.yarn); the loose strand stays put
    const yarn = { part: LIFE_PART.yarn, pivot: [0, 3.1, 0] as const };
    b.sphere(2.2, 0xffc7d9, { at: [0, 3.1, 0], ...yarn }, 20);
    for (let i = 0; i < 5; i++) b.torus(2.18, 0.07, 0xff86a5, { at: [0, 3.1, 0], rot: [i * 0.7, i * 1.1, i * 0.3], ...yarn });
    b.cyl(0.12, 0.12, 2.2, 0xff86a5, { at: [1.8, 1.6, 1.2], rot: [0.6, 0, 1.1] }, 6);
  } else {
    // the Grand Doghouse with a golden bone
    // audit GFX-01: the Woof cloth is ochre and brown (TEAM[1]), never the ally blue
    b.box(3.6, 2.6, 3.2, t.main, { at: [0, 2.15, 0] });
    b.cone(2.9, 1.9, t.deep, { at: [0, 4.4, 0], rot: [0, Math.PI / 4, 0], scale: [1.05, 1, 0.95] }, 4);
    b.box(1.2, 1.6, 0.1, 0x3a2414, { at: [1.81, 1.65, 0], rot: [0, HALF_PI, 0] });
    const bone = { part: LIFE_PART.orb, pivot: [0, 5.7, 0] as const };
    b.box(2.4, 0.4, 0.4, 0xd9a441, { at: [0, 5.7, 0], ...bone });
    for (const x of [-1.25, 1.25]) for (const z of [-0.25, 0.25]) b.sphere(0.36, 0xd9a441, { at: [x, 5.7, z], ...bone }, 10);
  }
  const g = b.build();
  g.scale(0.72, 0.72, 0.72);
  // the pivots scale with the model (the life patch turns the yarn ball about its own centre)
  const piv = g.getAttribute('aPivot');
  for (let i = 0; i < piv.count; i++) piv.setXYZ(i, piv.getX(i) * 0.72, piv.getY(i) * 0.72, piv.getZ(i) * 0.72);
  return g;
}

export function fountainGeometry(team: 0 | 1): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const t = TEAM[team];
  b.torus(4.0, 0.28, team === 0 ? 0xf3ead8 : 0xc4ae8a, { at: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0] });
  // living pass: the basin and spout water are their own parts (views/fountainWater.ts draws the ripples, rim foam and
  // spout churn on them in the structure's one draw; Low keeps the same program with the amplitude at 0)
  b.cyl(3.85, 3.85, 0.04, 0x8fd6ff, { at: [0, 0.03, 0], part: LIFE_PART.water }, 40);
  b.cyl(0.22, 0.32, 0.9, t.second, { at: [-1.2, 0.45, 0] }, 8);
  b.sphere(0.34, t.main, { at: [-1.2, 1.05, 0] }, 10);
  b.cyl(0.6, 0.6, 0.06, 0x8fd6ff, { at: [-1.2, 0.8, 0], part: LIFE_PART.spout, pivot: [-1.2, 0.8, 0] }, 16);
  return b.build();
}
