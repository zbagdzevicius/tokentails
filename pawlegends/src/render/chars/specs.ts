/**
 * Who wears what: the chibi spec of each hero (per team and look), each minion and each Companion Kitten, plus the
 * few Pawlegends poses PPK's library does not have (bow at rest, shield guard, claw crouch, cower). Render only.
 *
 * - Clem (Fighter): PPK's Clementine: ivory coat, crimson eyes, the pink bow on her LEFT ear, plate with the gold ':3'
 *   coin, the sword held upright (`restUp`).
 * - Sage (Marksman): grey tabby in a hood, short bow in the left paw, quiver on the back.
 * - Sir Brutus (Tank): Kibble Corp pug knight, broad, helmet, tower shield on the left arm, short sword.
 * - Cacklejaw (Assassin): Kibble Corp security dog (spotted grinner), cap, jacket, claw gauntlets, low crouch.
 *
 * Team colour (POC.md §6.8) sits on the big shapes the iso camera sees from above and behind: the shoulder mantle,
 * the helmet / hood / cap, the cape and the pauldrons. Dogs are uniformed rivals, never shelter dogs.
 */
import type { HeroId } from '../../sim/api';
import { ELEMENT_COLOR, lookCoat, type Coat, type Look } from '../cosmetics';
import { TEAM } from '../palette';
import { PAL } from '../ppk/characters/palette.js';
import type { ChibiSpec, CoatSpec } from './chibi';
import { bowPieces, C, mat } from './chibi';
import { hyenaHead, pugHead, pupHead } from './beast';
import * as G from './gear';
import { PPK_POSES, type PoseDef } from './skeleton';
import * as THREE from 'three';

const GOLD = 0xffd34d;
/** Cat hero head scale on top of PPK's hero tier, and the ear size: the squire head-to-ear ratio at hero size. */
const CAT_HEAD = 1.25;
const CAT_EARS = 1.12;

/** Pawlegends poses on top of PPK's library (same format). */
export const POSES_PL: Record<string, PoseDef> = {
  // Clem at rest: PPK's upright rest stand, but the blade held lower and leaning out to her right (~35°), off her face,
  // so the PPK face reads on the title, pick and results screens and the bright blade still reads beside her in iso
  restSide: {
    joints: { chest: [0.0, 0.04, 0], head: [0.0, 0.06, 0.03], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.28, 0], footR: [0, -0.28, 0] },
    sword: { mode: 'hand', guard: [-0.27, 0.3, 0.1], dir: [-0.62, 0.78, 0.1], face: [0.3, 0, 1] },
    arms: {
      R: { grip: -0.055, off: [0, 0, 0], pole: [-1, -0.4, -0.6], twist: [0, 0, 0] },
      L: { fk: { shoulder: [0.05, 0, 0.12], elbow: [-0.25, 0, 0], paw: [0, 0, 0] } },
    },
  },
  // Sage at rest: the bow held low and forward in the left paw, the right paw relaxed by the quiver strap
  bowIdle: {
    joints: { chest: [0.02, 0.06, 0], head: [0.02, 0.05, 0.02], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.28, 0], footR: [0, -0.28, 0] },
    arms: { L: { paw: [0.17, 0.33, 0.13], pole: [1, -0.6, -0.4], twist: [0, 0.2, -0.9] }, R: { fk: { shoulder: [0.05, 0, -0.12], elbow: [-0.35, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  // Sir Brutus: shield up in front on the left arm, short sword at the right side, feet planted wide
  shieldGuard: {
    joints: { hips: [0.02, 0, 0], chest: [0.06, 0.12, 0], head: [0.0, -0.06, 0], thighL: [-0.1, 0.08, 0.14], thighR: [0.08, -0.08, -0.14], kneeL: [0.15, 0, 0], kneeR: [0.12, 0, 0], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    sword: { mode: 'hand', guard: [-0.24, 0.33, 0.12], dir: [-0.2, 1, 0.25], face: [0.3, 0, 1] },
    arms: {
      L: { paw: [0.12, 0.43, 0.2], pole: [1, -0.6, -0.4], twist: [0, 0.5, -0.4] },
      R: { grip: -0.055, off: [0, 0, 0], pole: [-1, -0.4, -0.6], twist: [0, 0, 0] },
    },
  },
  // Cacklejaw: a light crouch (head up, so the muzzle and ears make the silhouette), both claws forward and out
  clawReady: {
    body: { p: [0, -0.025, 0] },
    joints: { hips: [0.12, 0, 0], chest: [0.08, 0, 0], head: [-0.16, 0, 0], thighL: [-0.35, 0.12, 0.12], thighR: [-0.25, -0.12, -0.12], kneeL: [0.5, 0, 0], kneeR: [0.45, 0, 0], footL: [-0.15, 0.3, 0], footR: [-0.2, -0.3, 0] },
    arms: {
      L: { paw: [0.17, 0.33, 0.2], pole: [1, -0.6, -0.3], twist: [0.4, 0, -0.4] },
      R: { paw: [-0.17, 0.36, 0.22], pole: [-1, -0.6, -0.3], twist: [0.4, 0, 0.4] },
    },
    sword: { mode: 'hidden' },
  },
  // Feared: arms over the face, leaning back
  cower: {
    joints: { hips: [-0.1, 0, 0], chest: [-0.15, 0, 0], head: [0.3, 0, 0], thighL: [-0.2, 0.1, 0.1], thighR: [-0.2, -0.1, -0.1], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0], earL: [-0.5, 0, -0.3], earR: [-0.5, 0, 0.3] },
    arms: {
      L: { paw: [0.05, 0.66, 0.16], pole: [1, -0.6, -0.4], twist: [0, 0, 0] },
      R: { paw: [-0.05, 0.66, 0.16], pole: [-1, -0.6, -0.4], twist: [0, 0, 0] },
    },
    sword: { mode: 'root', pommel: [-0.3, 0.5, -0.05], dir: [0.06, -1, 0.0], face: [0.2, 0, 1] },
  },
  // Lost: shoulders slumped, head and ears down, the weapon hanging point-down at the right side
  sad: {
    joints: { chest: [0.22, 0, 0], head: [0.32, 0, 0.06], thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.2, 0], footR: [0, -0.2, 0], earL: [0.3, 0, -0.45], earR: [0.3, 0, 0.45] },
    arms: { L: { fk: { shoulder: [0.15, 0, 0.06], elbow: [-0.1, 0, 0] } }, R: { grip: -0.055, off: [0, 0, 0], pole: [-1, -0.2, -0.6], twist: [0, 0, 0] } },
    sword: { mode: 'hand', guard: [-0.19, 0.27, 0.12], dir: [-0.06, -1, 0.3], face: [0.45, 0, 1] },
    tail: [[0.4, 0, 0], [0.3, 0, 0], [0.2, 0, 0], [0.1, 0, 0], [0, 0, 0], [0, 0, 0]],
  },
  // Minion / kitten walk base: paws relaxed at the sides
  stand: {
    joints: { thighL: [0, 0.05, 0.05], thighR: [0, -0.05, -0.05], footL: [0, 0.25, 0], footR: [0, -0.25, 0] },
    arms: { L: { fk: { shoulder: [0.05, 0, 0.1], elbow: [-0.3, 0, 0] } }, R: { fk: { shoulder: [0.05, 0, -0.1], elbow: [-0.3, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

const ALL_POSES: Record<string, PoseDef | null> = { ...PPK_POSES, ...POSES_PL };

/** Per-hero motion profile (motion.ts). */
export interface MotionProfile {
  idle: string;
  /** Held pose while moving (the gait layer goes on top). */
  run: string;
  cast: string;
  /** Attack kind (motion.ts swing layers). */
  attack: 'slash' | 'shoot' | 'bash' | 'claw' | 'paw';
  /** Pose blended in for the wind-up of `shoot`. */
  aim?: string;
  stride: number;
}

export const HERO_MOTION: Readonly<Record<HeroId, MotionProfile>> = Object.freeze({
  clem: { idle: 'restSide', run: 'restSide', cast: 'oath', attack: 'slash', stride: 1.15 },
  sage: { idle: 'bowIdle', run: 'bowIdle', cast: 'heal', attack: 'shoot', aim: 'aim', stride: 1.1 },
  brutus: { idle: 'shieldGuard', run: 'shieldGuard', cast: 'cheer', attack: 'bash', stride: 1.2 },
  cacklejaw: { idle: 'clawReady', run: 'clawReady', cast: 'cheer', attack: 'claw', stride: 1.25 },
});

/** Standing height (m, ear tips / helmet) of each hero in the match: big enough that the upright chibi reads at ~45+ px on 844×390 Low (the iso lens sees mostly the head and shoulders). */
export const HERO_HEIGHT: Readonly<Record<HeroId, number>> = Object.freeze({ clem: 2.6, sage: 2.5, brutus: 2.8, cacklejaw: 2.65 });

/** Top of each hero's bind-pose bounds (m: ear tips, Clem's bow, Sir Brutus's plume): overhead bars sit above it. */
export const HERO_TOP: Readonly<Record<HeroId, number>> = Object.freeze({ clem: 3.06, sage: 2.71, brutus: 3.43, cacklejaw: 2.95 });

const IVORY: CoatSpec = { pattern: 'solid', base: PAL.furIvory, deep: PAL.furIvoryShade, light: PAL.furIvoryLight, cream: PAL.furIvoryLight };
const CLEM_EYES = { inner: PAL.irisCrimsonInner, outer: PAL.irisCrimson, ring: PAL.irisCrimsonDeep, pupil: PAL.pupil, size: 1.16 } as const;
const SAGE_COAT: CoatSpec = { pattern: 'tabby', base: 0x9fb3c8, deep: 0x5f7189, light: 0xeef3f8, cream: 0xeef3f8, stripe: 0.5 };
const SAGE_EYES = { inner: 0xbfe8a8, outer: 0x5fa86a, ring: 0x2c4a30, size: 1.12 } as const;

/** A look's coat palette as a PPK coat (null = the hero's default). */
function coatOf(c: Coat | null, pattern: CoatSpec['pattern'], fallback: CoatSpec): CoatSpec {
  return c ? { pattern, base: c.base, deep: c.dark, light: c.light, cream: c.light } : fallback;
}

/** The hero chibi spec for a team, look and mesh detail. */
export function heroSpec(hero: HeroId, team: 0 | 1, look: Look, detail: number): ChibiSpec {
  const t = TEAM[team];
  const coat = look.coat ?? '';
  const founder = coat.startsWith('coat.founder.');
  const dawn = coat === 'skin.clem.dawnblade' && hero === 'clem';
  const pinkBow = coat === 'skin.clem.pink_bow' && hero === 'clem';
  const chroma = look.chroma ? ELEMENT_COLOR[look.chroma] : null;
  const capeColor = founder ? 0x5a2d6e : dawn ? 0xfff3dc : t.main;
  const capeHem = founder || dawn ? GOLD : t.deep;
  const extras = (A: Parameters<NonNullable<ChibiSpec['gear']>>[0]): void => {
    if (chroma !== null) {
      A.add('chest', new THREE.OctahedronGeometry(0.03, 0), { m: mat([0, 0.12, 0.17], [0, 0, 0], [0.8, 1.1, 0.6]), color: chroma });
      G.armband(A, chroma);
    }
  };
  switch (hero) {
    case 'clem': {
      const lc = lookCoat('clem', look);
      return {
        // PPK chibi ratio: the head about half her height (head ×1.25, the neck at its minimum), ears tilted out
        rig: { width: 1, tier: 'hero', headScale: CAT_HEAD, earSplay: 0.12, tailCurve: [[0.02, 0.26, -0.12], [0.11, 0.28, -0.23], [0.22, 0.39, -0.24], [0.24, 0.53, -0.17]] },
        coat: coatOf(lc, coat.startsWith('coat.breed.SCOUT') ? 'tabby' : 'solid', IVORY),
        eyes: CLEM_EYES,
        earInner: PAL.earInnerSalmon,
        nose: PAL.noseTT,
        head: 'cat',
        ears: { size: CAT_EARS },
        cheeks: 0.72,
        face: 1.45,
        whiskers: true,
        tail: { thick: 0.85 },
        armoured: { body: true, paws: true, feet: true },
        detail,
        poses: ALL_POSES,
        gear: (A) => {
          G.breastplate(A, { coin: true, color: dawn ? 0xfff1c8 : G.STEEL, trim: GOLD });
          G.cape(A, capeColor, capeHem, { len: 0.44, bot: 0.27 });
          G.mantle(A, t.main, founder || dawn ? GOLD : t.second, { r: 0.22 });
          G.pauldrons(A, dawn ? GOLD : t.main, founder || dawn ? GOLD : G.BRASS);
          G.gauntlets(A, G.STEEL);
          G.boots(A, G.STEEL_DARK);
          G.sword(A, dawn ? { blade: 0xfff1a8, guard: GOLD, wide: 1.6, len: 0.78 } : {});
          // HARD RULE (PPK): the bow sits on her LEFT ear (+X). The PINK bow is the paid "Pink Bow Clem" skin's
          // signature (big, plus one on the tail tip); the free Clem wears a smaller cream ribbon with a gold knot, so
          // the €0.99 skin delivers what its name says (playtest: the free Clem already wore the pink bow).
          const big = pinkBow ? 1.8 : 1.15;
          const bow = pinkBow ? { main: PAL.bow, shade: PAL.bowShade, knot: PAL.bowKnot } : { main: 0xfff3dc, shade: 0xd8c6a2, knot: GOLD };
          for (const p of bowPieces(A.seg(10, 6), bow)) {
            A.add('earL', p.geo, { m: mat([0.0, 0.09, 0.03], [-0.6, -0.25, -0.32], big).multiply(p.m), color: p.color });
          }
          if (pinkBow) for (const p of bowPieces(6, { main: PAL.bow, shade: PAL.bowShade, knot: PAL.bowKnot })) A.add('tail5', p.geo, { m: mat([0, 0.02, 0], [0, 0, 0], 0.9).multiply(p.m), color: p.color });
          extras(A);
        },
      };
    }
    case 'sage': {
      const lc = lookCoat('sage', look);
      return {
        rig: { width: 0.96, tier: 'hero', headScale: CAT_HEAD * 0.97, earSplay: 0.12 },
        coat: coatOf(lc, 'tabby', SAGE_COAT),
        eyes: SAGE_EYES,
        earInner: 0xffb3c8,
        nose: 0xff9fb1,
        head: 'cat',
        ears: { size: CAT_EARS },
        cheeks: 0.75,
        face: 1.35,
        whiskers: true,
        tail: { thick: 0.9 },
        detail,
        poses: ALL_POSES,
        gear: (A) => {
          G.hood(A, t.main, 0x6fbf7f);
          G.mantle(A, t.main, 0x6fbf7f, { r: 0.21 });
          G.tunic(A, 0x5e7f3e, 0x3f5a2a);
          G.cape(A, founder ? capeColor : t.deep, founder ? GOLD : 0x6fbf7f, { len: 0.3, bot: 0.2 });
          G.quiver(A);
          G.shortBow(A, undefined, undefined, 'bowIdle', new THREE.Vector3(0.2, 0.31, 0.17), -0.52);
          G.pauldrons(A, t.main, 0x6fbf7f, 0.8);
          extras(A);
        },
      };
    }
    case 'brutus': {
      const lc = lookCoat('brutus', look);
      return {
        rig: { width: 1.2, tier: 'hero', bodyScale: 1.12, earsLow: 0.6 },
        coat: coatOf(lc, 'solid', { pattern: 'solid', base: 0xd9b48a, deep: 0xb89064, light: 0xf6e2c2, cream: 0xf6e2c2 }),
        eyes: { inner: 0xc99a6a, outer: 0x7a5a3a, ring: 0x2e2018 },
        earInner: 0x4a3b55,
        nose: 0x2e2433,
        head: 'none',
        tail: { thick: 0.8 },
        armoured: { body: true, paws: true, feet: true },
        detail,
        poses: ALL_POSES,
        gear: (A) => {
          pugHead(A, lc ? { fur: lc.base, dark: lc.dark } : {});
          G.jacket(A, G.KIBBLE, { buttons: false, chest: false });
          G.breastplate(A, { color: G.STEEL });
          // the helmet dome stays steel (the pug's tan coat dominates); team colour on the crest, mantle, shield rim, cape
          G.helmet(A, G.STEEL, G.BRASS, t.main, { y: 0.245, r: 0.165 });
          G.mantle(A, t.main, G.BRASS, { r: 0.21 });
          G.pauldrons(A, G.STEEL, G.BRASS, 1.15);
          G.cape(A, capeColor, capeHem, { len: 0.34, top: 0.15, bot: 0.26 });
          G.gauntlets(A, G.STEEL_DARK);
          G.boots(A, G.KIBBLE);
          G.towerShield(A, G.STEEL_DARK, t.main, t.main, 0.24, 'shieldGuard', new THREE.Vector3(0.16, 0.38, 0.27));
          G.sword(A, { len: 0.5, wide: 1.2 });
          extras(A);
        },
      };
    }
    case 'cacklejaw': {
      return {
        rig: { width: 0.95, tier: 'hero', headScale: 1.08 },
        coat: { pattern: 'spots', base: 0xf0a92e, deep: 0x5b3a8c, light: 0xf6dcae, cream: 0xf6dcae },
        eyes: { inner: 0xf6d27a, outer: 0xd9962e, ring: 0x5a3a22 },
        earInner: 0xd9a494,
        nose: 0x3a2e4a,
        head: 'none',
        tail: { thick: 1.05 },
        armoured: { body: true, paws: true },
        detail,
        poses: ALL_POSES,
        gear: (A) => {
          hyenaHead(A);
          G.jacket(A, G.KIBBLE);
          G.securityCap(A, t.main, { y: 0.335, r: 0.13, z: -0.045, crest: GOLD });
          G.mantle(A, t.main, G.BRASS, { r: 0.2, drop: 0.24 });
          G.pauldrons(A, t.main, G.BRASS, 0.75);
          if (founder) G.cape(A, capeColor, capeHem, { len: 0.3 });
          G.clawGauntlets(A, 0x22252c, 0xe3ebf4, 1.5);
          extras(A);
        },
      };
    }
  }
}

/** Minion spec: kitten squires (Purrhaven) and pup guards (Woof), melee or ranged. Mini recipe, ≤ 900 triangles. */
export function minionSpec(team: 0 | 1, ranged: boolean): ChibiSpec {
  const t = TEAM[team];
  if (team === 0) {
    return {
      rig: { width: 1, tier: 'kid' },
      coat: { pattern: 'solid', base: 0xfff1dc, deep: 0xe8d6bc, light: 0xffffff, cream: 0xffffff },
      eyes: { inner: 0x6fb7ff, outer: 0x2a6fc0, ring: 0x1a2a40 },
      earInner: 0xffb3c8,
      nose: 0xff8fb1,
      head: 'mini',
      armoured: { body: true },
      tail: { thick: 0.8 },
      detail: 0.3,
      gear: (A) => {
        G.tunic(A, t.main, t.deep);
        // squire's cap in the second colour
        A.add('head', new THREE.SphereGeometry(0.17, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1.1, 0.8, 1.05), { m: mat([0, 0.2, -0.01]), color: t.second });
        if (ranged) G.yarnSling(A, 0x9fd3ff);
        else G.woodenSword(A);
      },
    };
  }
  return {
    rig: { width: 1, tier: 'kid' },
    coat: { pattern: 'solid', base: 0xc99a6a, deep: 0x8a6446, light: 0xf0dcc0, cream: 0xf0dcc0 },
    eyes: { inner: 0x6b4a32, outer: 0x3a2618, ring: 0x1a1016 },
    earInner: 0x6b4a32,
    nose: 0x2e2433,
    head: 'none',
    mini: true,
    armoured: { body: true },
    tail: { thick: 0.7 },
    detail: 0.3,
    gear: (A) => {
      pupHead(A, 0xc99a6a, 0x6b4a32);
      G.tunic(A, G.KIBBLE, t.main);
      // a small cap pushed back, so the floppy ears and the tan snout show (they read as dogs, not police)
      G.securityCap(A, t.main, { y: 0.305, r: 0.105, z: -0.04 });
      if (ranged) G.slingshot(A);
      else G.baton(A);
    },
  };
}

/** A Companion Kitten: kid proportions, its coat, an element collar with a gold bell. */
export function kittenSpec(coat: Coat, collar: number, tabby: boolean): ChibiSpec {
  return {
    rig: { width: 1, tier: 'kid' },
    coat: { pattern: tabby ? 'tabby' : 'solid', base: coat.base, deep: coat.dark, light: coat.light, cream: coat.light },
    eyes: { inner: 0xbfe8a8, outer: 0x4f9a5a, ring: 0x22402a },
    earInner: coat.accent,
    nose: coat.accent,
    head: 'cat',
    detail: 0.55,
    gear: (A) => {
      A.add('chest', new THREE.TorusGeometry(0.09, 0.018, 3, 12), { m: mat([0, 0.2, 0.0], [Math.PI / 2, 0, 0], [1.1, 1, 1]), color: collar });
      A.add('chest', new THREE.SphereGeometry(0.022, 6, 4), { m: mat([0, 0.18, 0.1]), color: GOLD });
    },
  };
}

export const KITTEN_POSE = { idle: 'stand', run: 'stand', nap: 'nap' } as const;

/** Linear rgb of a hex, for tests. */
export const linear = (hex: number): [number, number, number] => C(hex);
