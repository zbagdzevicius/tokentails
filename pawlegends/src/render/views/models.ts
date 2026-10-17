/**
 * Procedural models for minions, camps, Pudding and structures (our own code, no PPK geometry). Heroes, the minions'
 * bodies and Companion Kittens are upright PPK-style characters built by render/chars/ (one skinned mesh each).
 * Models face +X, stand on y = 0, metres.
 */
import type * as THREE from 'three';
import type { HeroId } from '../../sim/api';
import { HERO_TOP } from '../chars';
import { uprightMinionGeometry } from '../chars';
import { TEAM } from '../palette';
import { ModelBuilder } from './rig';

const EYE = 0x2a1a22;
const WHITE = 0xffffff;
const PINK = 0xff8fb1;

const HALF_PI = Math.PI / 2;

/**
 * Overhead bar lift factor per hero (ui/overhead.ts multiplies its hero lift of 1.62 by it): the bar sits just above
 * the upright character's ear tips, bow or plume (HERO_TOP).
 */
export const HERO_SCALE: Readonly<Record<HeroId, number>> = Object.freeze({
  clem: (HERO_TOP.clem + 0.15) / 1.62,
  sage: (HERO_TOP.sage + 0.15) / 1.62,
  brutus: (HERO_TOP.brutus + 0.15) / 1.62,
  cacklejaw: (HERO_TOP.cacklejaw + 0.15) / 1.62,
});

/** Relation ring size under each hero (m; the size the quadruped heroes had, so rings read the same). */
export const HERO_RING: Readonly<Record<HeroId, number>> = Object.freeze({ clem: 2.03, sage: 1.94, brutus: 2.25, cacklejaw: 2.09 });

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
