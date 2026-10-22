/**
 * Shared animation data (ANIM-SPEC §14 "Other shared clips", §1 authoring helpers): the default gait and its
 * variants, per-hero spring tuning (§5), the clip templates hero files build from (swing, thrust, spinSlash, flip,
 * roll, leap, slam, throwOverhand, kneelShot, taunt, pose), the shared clips (death, respawn drop, recall curl,
 * zoomies gallop, level flex) and the stub MoveSet / SkillFxSet every hero starts from. Plain data: render only.
 *
 * Joint conventions (PPK character space, the Animator's own layers use the same): thigh x < 0 swings the leg
 * forward, knee x > 0 bends it; shoulder x < 0 raises the arm forward / up; chest y twists (+ turns the chest to the
 * hero's left), chest x > 0 leans forward; head x < 0 tips the chin up. Root: fwd / side / up in metres, yaw / pitch /
 * roll in turns (pitch + = front flip), sx / sy factors.
 */
import type { HeroId } from '../../data/heroes/types';
import { BASIC_WINDUP, KNOCK_TICKS, TICK_S } from './timing';
import { Prio, type Anchor, type ClipDef, type Cue, type GaitProfile, type Key, type Mask, type MoveSet, type ScalarKey, type SkillFxSet, type SlotMoves, type SpringTuning } from './types';

/** The basic contact time (s) every basic clip pins to `contact` / `release`. */
export const BASIC_CONTACT = BASIC_WINDUP * TICK_S;

export const DEFAULT_GAIT: GaitProfile = Object.freeze({
  stride: 1,
  bounce: 1,
  lean: 1,
  hipSway: 1,
  headBob: 1,
  arms: 'pump',
  variants: Object.freeze({
    sneak: { stride: 0.85, bounce: 0.35, lean: 2.6 },
    trudge: { stride: 0.7, bounce: 0.5, lean: 0.4, headBob: 1.6 },
    gallop: { stride: 1.5, bounce: 2.2, lean: 4, hipSway: 0.4 },
    charm: { stride: 0.55, bounce: 1.9, lean: -0.6, headBob: 0.5 },
    cower: { stride: 0.85, bounce: 0.6, lean: -1.4 },
    haste: { stride: 1.25, bounce: 1.3, lean: 1.8 },
  }),
}) as GaitProfile;

/** §5 spring tuning: Lambo heavy and slow, Avietė whippy, Brutus short and stiff, the others k 140, c 12. */
export const HERO_SPRINGS: Readonly<Record<HeroId, SpringTuning>> = Object.freeze({
  clem: { tail: { k: 140, c: 12, lag: 0.55 }, ears: { k: 160, c: 12, lag: 0 } },
  sage: { tail: { k: 140, c: 12, lag: 0.55 }, ears: { k: 150, c: 11, lag: 0 } },
  brutus: { tail: { k: 300, c: 20, lag: 0.3 }, ears: { k: 220, c: 16, lag: 0 } },
  cacklejaw: { tail: { k: 110, c: 9, lag: 0.5 }, ears: { k: 70, c: 6, lag: 0 } },
  lambo: { tail: { k: 60, c: 9, lag: 0.65 }, ears: { k: 120, c: 11, lag: 0 } },
  aviete: { tail: { k: 220, c: 13, lag: 0.6 }, ears: { k: 180, c: 12, lag: 0 } },
  bengas: { tail: { k: 140, c: 12, lag: 0.55 }, ears: { k: 160, c: 12, lag: 0 } },
  gabe: { tail: { k: 140, c: 12, lag: 0.55 }, ears: { k: 240, c: 16, lag: 0 } },
});

// ------------------------------------------------------------------------------------------------ templates

export interface TemplateOpts {
  id: string;
  prio?: Prio;
  mask?: Mask;
  /** The anchor `contact` binds to (default 'contact'). */
  anchor?: Anchor;
  /** Contact time (s, nominal); default the basic windup (8 t). */
  contact?: number;
  len?: number;
  cues?: readonly Cue[];
  /** +1 / −1: mirror the side of a swing. */
  side?: number;
}

const base = (o: TemplateOpts, len: number, keys: Key[], root: ClipDef['root'], extra: Partial<ClipDef> = {}): ClipDef => {
  const c = o.contact ?? BASIC_CONTACT;
  return {
    id: o.id,
    len: o.len ?? len,
    mask: o.mask ?? 'full',
    mode: 'override',
    prio: o.prio ?? Prio.Basic,
    keys,
    root,
    markers: { coil: Math.min(0.06, c * 0.3), contact: c, end: o.len ?? len, ...(extra.markers ?? {}) },
    warp: extra.warp ?? [['contact', o.anchor ?? 'contact']],
    cues: o.cues ?? [['contact', 'whoosh', 'M']],
    ...(extra.calm ? { calm: extra.calm } : {}),
    ...(extra.lockFeet ? { lockFeet: true } : {}),
    cancel: extra.cancel ?? 'afterContact',
    blendIn: extra.blendIn,
    blendOut: extra.blendOut,
  };
};

/** A flat slash (R → L for side 1): coil, strike through the contact, overshoot follow-through. */
export function swing(o: TemplateOpts & { arc?: number; twist?: number }): ClipDef {
  const c = o.contact ?? BASIC_CONTACT;
  const s = o.side ?? 1;
  const a = o.arc ?? 1;
  const tw = (o.twist ?? 0.6) * s;
  return base(o, c + 0.25, [
    [0, null, null],
    [c * 0.64, null, { chest: [0.05, 0.7 * tw, 0], hips: [0, 0.3 * tw, 0], shoulderR: [-1.0 * a, 0, -0.5 * s * a], elbowR: [-0.5, 0, 0] }, 'out'],
    [c, null, { chest: [0.15, -0.9 * tw, 0], hips: [0, -0.35 * tw, 0], shoulderR: [-0.9 * a, 0, 0.9 * s * a], elbowR: [0.15, 0, 0] }, 'expoIn'],
    [c + 0.12, null, { chest: [0.1, -1.05 * tw, 0], hips: [0, -0.4 * tw, 0], shoulderR: [-0.6 * a, 0, 1.0 * s * a] }, 'back'],
    [c + 0.25, null, null, 'inOut'],
  ], { fwd: [[0, 0], [c, 0.12, 'expoIn'], [c + 0.25, 0, 'inOut']], sy: [[0, 1], [c * 0.64, 0.94], [c, 1.05, 'expoIn'], [c + 0.18, 1, 'out']] }, { lockFeet: true });
}

/** A lunging thrust. */
export function thrust(o: TemplateOpts & { reach?: number }): ClipDef {
  const c = o.contact ?? BASIC_CONTACT;
  const r = o.reach ?? 0.25;
  return base(o, c + 0.3, [
    [0, null, null],
    [c * 0.7, null, { chest: [-0.15, 0.4, 0], shoulderR: [0.3, 0, -0.3], elbowR: [-1.2, 0, 0], thighL: [-0.2, 0, 0], kneeR: [0.3, 0, 0] }, 'out'],
    [c, null, { chest: [0.35, -0.2, 0], shoulderR: [-1.5, 0, 0], elbowR: [0, 0, 0], thighL: [-0.6, 0, 0], kneeL: [0.4, 0, 0], thighR: [0.35, 0, 0] }, 'expoIn'],
    [c + 0.3, null, null, 'inOut'],
  ], { fwd: [[0, 0], [c * 0.7, -0.06], [c, r, 'expoIn'], [c + 0.3, 0, 'inOut']] });
}

/** A spinning slash: `turns` of root yaw ending past the contact (a windup spin may run longer, §9 rule 6). */
export function spinSlash(o: TemplateOpts & { turns?: number; hop?: number }): ClipDef {
  const c = o.contact ?? BASIC_CONTACT;
  const t = (o.turns ?? 1) * (o.side ?? 1);
  const hop = o.hop ?? 0.2;
  return base(o, c + 0.3, [
    [0, null, null],
    [c * 0.4, null, { chest: [0.1, 0.6, 0], shoulderR: [-1.0, 0, -0.6], thighL: [-0.3, 0, 0], kneeL: [0.5, 0, 0] }, 'out'],
    [c, null, { chest: [0.1, -0.5, 0], shoulderR: [-1.2, 0, 1.0], elbowR: [0.1, 0, 0] }, 'lin'],
    [c + 0.3, null, null, 'out'],
  ], {
    yaw: [[0, 0], [c * 0.2, 0], [c + 0.08, -t, 'inOut'], [c + 0.3, -t]],
    up: [[0, 0], [c * 0.4, 0], [c * 0.8, hop, 'out'], [c + 0.12, 0, 'in']],
  }, { calm: { yaw: 0.25 } });
}

/** A flip: `dir` +1 front / −1 back, `turns` of pitch with `apex` m of height between take-off and landing anchors. */
export function flip(o: TemplateOpts & { dir?: 1 | -1; turns?: number; apex?: number; air?: number; takeoff?: Anchor; land?: Anchor }): ClipDef {
  const air = o.air ?? 0.33;
  const t0 = 0.08;
  const t1 = t0 + air;
  const turns = (o.turns ?? 1) * (o.dir ?? 1);
  const apex = o.apex ?? 0.8;
  const len = o.len ?? t1 + 0.25;
  return {
    id: o.id,
    len,
    mask: o.mask ?? 'full',
    mode: 'override',
    prio: o.prio ?? Prio.Ability,
    keys: [
      [0, null, null],
      [t0, null, { body: [0.2, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0] }, 'out'],
      [t0 + air * 0.25, null, { chest: [0.5, 0, 0], head: [0.3, 0, 0], thighL: [-1.4, 0, 0], thighR: [-1.4, 0, 0], kneeL: [1.8, 0, 0], kneeR: [1.8, 0, 0], shoulderL: [-0.8, 0, 0.4], shoulderR: [-0.8, 0, -0.4] }, 'out'],
      [t1 - air * 0.15, null, { chest: [0.3, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }, 'inOut'],
      [t1, null, { body: [0.25, 0, 0], thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0] }, 'in'],
      [len, null, null, 'back'],
    ],
    root: {
      pitch: [[0, 0], [t0, 0], [t1, turns, 'inOut'], [len, turns]],
      up: [[0, 0], [t0, 0], [t0 + air * 0.5, apex, 'out'], [t1, 0, 'in'], [len, 0]],
      sy: [[0, 1], [t0, 0.8, 'out'], [t0 + 0.06, 1.12, 'out'], [t1 - 0.04, 1], [t1 + 0.02, 0.72, 'in'], [t1 + 0.18, 1, 'back']],
    },
    markers: { takeoff: t0, contact: t0, land: t1, end: len },
    warp: [['takeoff', o.takeoff ?? 'cast'], ['land', o.land ?? 'travelEnd']],
    cues: o.cues ?? [['takeoff', 'dust'], ['takeoff', 'earsBack'], ['takeoff', 'whoosh', 'L'], ['land', 'land'], ['land', 'dust']],
    cancel: 'none',
  };
}

/** A tucked forward roll low to the ground. */
export function roll(o: TemplateOpts & { turns?: number; air?: number; takeoff?: Anchor; land?: Anchor }): ClipDef {
  return { ...flip({ ...o, apex: 0.18, turns: o.turns ?? 1, dir: 1, air: o.air ?? 0.2 }), id: o.id };
}

/** A leap (grand jeté): split legs at the apex, arms up, a plié landing. */
export function leap(o: TemplateOpts & { apex?: number; air?: number; takeoff?: Anchor; land?: Anchor }): ClipDef {
  const air = o.air ?? 0.2;
  const t0 = 0.06;
  const t1 = t0 + air;
  const len = o.len ?? t1 + 0.3;
  const apex = o.apex ?? 0.7;
  return {
    id: o.id,
    len,
    mask: 'full',
    mode: 'override',
    prio: o.prio ?? Prio.Ability,
    keys: [
      [0, null, null],
      [t0, null, { kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0] }, 'out'],
      [t0 + air * 0.5, null, { thighL: [-1.4, 0, 0], thighR: [1.2, 0, 0], kneeL: [0, 0, 0], kneeR: [0.2, 0, 0], shoulderL: [-2.4, 0, 0.3], shoulderR: [-2.4, 0, -0.3], chest: [-0.15, 0, 0], head: [-0.2, 0, 0] }, 'out'],
      [t1, null, { kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0] }, 'in'],
      [len, null, null, 'back'],
    ],
    root: { up: [[0, 0], [t0, 0], [t0 + air * 0.5, apex, 'out'], [t1, 0, 'in'], [len, 0]], pitch: [[0, 0], [t0 + air * 0.5, -0.03], [t1, 0.02], [len, 0]] },
    markers: { takeoff: t0, contact: t0, land: t1, end: len },
    warp: [['takeoff', o.takeoff ?? 'cast'], ['land', o.land ?? 'travelEnd']],
    cues: o.cues ?? [['takeoff', 'whoosh', 'M'], ['land', 'land'], ['land', 'dust']],
    cancel: 'none',
  };
}

/** A slam: crouch, hop, drive down on the contact with a squash, rebound. */
export function slam(o: TemplateOpts & { hop?: number }): ClipDef {
  const c = o.contact ?? 0.12;
  const hop = o.hop ?? 0.3;
  return base(o, c + 0.4, [
    [0, null, null],
    [c * 0.5, null, { chest: [-0.25, 0, 0], shoulderL: [-1.8, 0, 0.2], shoulderR: [-1.8, 0, -0.2], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }, 'out'],
    [c, null, { chest: [0.55, 0, 0], head: [0.2, 0, 0], shoulderL: [-0.6, 0, 0.2], shoulderR: [-0.6, 0, -0.2], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0] }, 'expoIn'],
    [c + 0.4, null, null, 'back'],
  ], {
    up: [[0, 0], [c * 0.6, hop, 'out'], [c, 0, 'expoIn'], [c + 0.18, hop * 0.5, 'out'], [c + 0.36, 0, 'in']],
    sy: [[0, 1], [c * 0.4, 0.85], [c * 0.7, 1.1], [c, 0.72, 'expoIn'], [c + 0.16, 1, 'back']],
  }, { markers: { coil: c * 0.3 }, cancel: 'none' });
}

/** An overhand throw: cock the arm, whip it through the release, follow through with a half-turn. */
export function throwOverhand(o: TemplateOpts & { follow?: number }): ClipDef {
  const c = o.contact ?? BASIC_CONTACT;
  const f = o.follow ?? 0.5;
  return base({ ...o, anchor: o.anchor ?? 'release' }, c + 0.35, [
    [0, null, null],
    [c * 0.7, null, { chest: [-0.2, 0.7, 0], hips: [0, 0.4, 0], shoulderR: [0.6, 0, -1.4], elbowR: [-1.3, 0, 0], thighL: [-0.4, 0, 0] }, 'out'],
    [c, null, { chest: [0.35, -0.8, 0], hips: [0, -0.5, 0], shoulderR: [-1.6, 0, 0.3], elbowR: [0, 0, 0], thighR: [0.3, 0, 0] }, 'expoIn'],
    [c + 0.35, null, null, 'inOut'],
  ], { yaw: [[0, 0], [c, 0], [c + 0.2, -f * 0.5, 'out'], [c + 0.35, 0, 'inOut']] });
}

/** A kneeling shot: drop onto a knee on the coil, the shot on contact, recoil skid back. */
export function kneelShot(o: TemplateOpts & { recoil?: number }): ClipDef {
  const c = o.contact ?? BASIC_CONTACT;
  const r = o.recoil ?? 0.2;
  return base({ ...o, anchor: o.anchor ?? 'release' }, c + 0.4, [
    [0, null, null],
    [c * 0.6, 'aim', { thighR: [0.9, 0, 0], kneeR: [1.6, 0, 0], thighL: [-0.9, 0, 0], kneeL: [1.0, 0, 0], body: [0.05, 0, 0] }, 'out'],
    [c, null, null, 'hold'],
    [c + 0.08, null, { chest: [-0.12, 0, 0], shoulderR: [0.4, 0, -0.3] }, 'expoOut'],
    [c + 0.4, null, null, 'inOut'],
  ], { fwd: [[0, 0], [c, 0], [c + 0.08, -r, 'expoOut'], [c + 0.4, 0, 'inOut']], sy: [[0, 1], [c * 0.6, 0.88, 'out'], [c + 0.25, 0.88], [c + 0.4, 1, 'inOut']] });
}

/** A taunt: lean back, chest pumps, arms wide (Gloat, the conductor bow). */
export function taunt(o: TemplateOpts & { pumps?: number }): ClipDef {
  const c = o.contact ?? 0.1;
  const len = o.len ?? 0.7;
  const pumps = o.pumps ?? 3;
  const keys: Key[] = [[0, null, null], [c, null, { chest: [-0.35, 0, 0], head: [-0.4, 0, 0], shoulderL: [-0.4, 0, 1.2], shoulderR: [-0.4, 0, -1.2] }, 'expoOut']];
  for (let i = 0; i < pumps; i++) {
    const t = c + ((len - c - 0.15) * (i + 0.5)) / pumps;
    keys.push([t, null, { chest: [i % 2 ? -0.35 : -0.15, 0, 0], head: [-0.5, 0, 0], shoulderL: [-0.4, 0, 1.2], shoulderR: [-0.4, 0, -1.2] }, 'inOut']);
  }
  keys.push([len, null, null, 'inOut']);
  return base({ ...o, contact: c, prio: o.prio ?? Prio.Ability }, len, keys, { sy: [[0, 1], [c, 1.08, 'out'], [len, 1, 'inOut']] }, { cancel: 'any' });
}

/** Hold a named pose (with an ease in and out). */
export function pose(o: TemplateOpts & { pose: string; hold?: number; ease?: number }): ClipDef {
  const e = o.ease ?? 0.12;
  const hold = o.hold ?? 0.5;
  const len = o.len ?? e * 2 + hold;
  return {
    id: o.id,
    len,
    mask: o.mask ?? 'full',
    mode: 'override',
    prio: o.prio ?? Prio.Emote,
    keys: [[0, null, null], [e, o.pose, null, 'out'], [e + hold, null, null, 'hold'], [len, null, null, 'inOut']],
    markers: { contact: e, end: len },
    warp: [['contact', o.anchor ?? 'cast']],
    cues: o.cues,
    cancel: 'any',
  };
}

// ------------------------------------------------------------------------------------------------ shared clips

const respawnDrop: ClipDef = {
  id: 'common.respawn',
  len: 0.85,
  mask: 'full',
  mode: 'override',
  prio: Prio.Emote,
  blendIn: 0,
  keys: [
    [0, null, { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], shoulderL: [-2.2, 0, 0.3], shoulderR: [-2.2, 0, -0.3] }],
    [0.35, null, { kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], body: [0.15, 0, 0] }, 'in'],
    [0.55, 'cheer', null, 'back'],
    [0.85, null, null, 'inOut'],
  ],
  root: { up: [[0, 1.2], [0.35, 0, 'in'], [0.85, 0]], sy: [[0, 1.15], [0.33, 1.1], [0.37, 0.7, 'in'], [0.55, 1, 'back']] },
  markers: { land: 0.35, end: 0.85 },
  warp: [],
  cues: [['land', 'land'], ['land', 'dustRing']],
  cancel: 'any',
};

const death: ClipDef = {
  id: 'common.death',
  len: 0.9,
  mask: 'full',
  mode: 'override',
  prio: Prio.Death,
  blendIn: 0.04,
  blendOut: 0.3,
  keys: [
    [0, null, null],
    [0.12, null, { chest: [-0.5, 0.3, 0.2], head: [-0.6, 0, 0], thighR: [0.4, 0, 0], kneeL: [0.3, 0, 0] }, 'expoOut'],
    [0.4, null, { chest: [-0.3, -0.2, -0.1], thighL: [0.3, 0, 0], kneeR: [0.8, 0, 0], kneeL: [0.8, 0, 0] }, 'inOut'],
    [0.9, 'faint', null, 'in'],
  ],
  root: { fwd: [[0, 0], [0.12, -0.25, 'expoOut'], [0.4, -0.45, 'inOut'], [0.9, -0.55, 'out']], sy: [[0, 1], [0.86, 1], [0.9, 0.85, 'in']] },
  markers: { contact: 0, end: 0.9 },
  warp: [['contact', 'contact']],
  cues: [['contact', 'freeze', 90], [0.9, 'land']],
  cancel: 'none',
};

const recall: ClipDef = { ...pose({ id: 'common.recall', pose: 'sleep', ease: 0.3, hold: 120 * TICK_S, prio: Prio.Emote }), mask: 'full' };

const zoomies: ClipDef = {
  id: 'common.zoomies',
  len: 0.4,
  mask: 'upper',
  mode: 'additive',
  prio: Prio.Emote,
  keys: [
    [0, null, { chest: [0.55, 0, 0], head: [-0.45, 0, 0], shoulderL: [-0.9, 0, 0], shoulderR: [-0.4, 0, 0] }],
    [0.2, null, { chest: [0.65, 0, 0], head: [-0.5, 0, 0], shoulderL: [-0.4, 0, 0], shoulderR: [-0.9, 0, 0] }, 'inOut'],
    [0.4, null, { chest: [0.55, 0, 0], head: [-0.45, 0, 0], shoulderL: [-0.9, 0, 0], shoulderR: [-0.4, 0, 0] }, 'inOut'],
  ],
  markers: {},
  warp: [],
};

const levelFlex: ClipDef = {
  ...pose({ id: 'common.levelFlex', pose: 'cheer', ease: 0.1, hold: 0.45, prio: Prio.Emote }),
  root: { up: [[0, 0], [0.12, 0.3, 'out'], [0.3, 0, 'in']], sy: [[0, 1], [0.08, 0.85], [0.14, 1.1], [0.3, 0.8, 'in'], [0.45, 1, 'back']] },
};

/** Knock tumble length (s) the reaction slot warps onto (the sim's knockback ticks). */
export const KNOCK_S = KNOCK_TICKS * TICK_S;

export const COMMON = Object.freeze({ respawn: respawnDrop, death, recall, zoomies, levelFlex });

// ------------------------------------------------------------------------------------------------ stubs

const idleClip = (h: HeroId): ClipDef => ({ id: `${h}.idle`, len: 1, mask: 'full', mode: 'override', prio: Prio.Idle, keys: [[0, null, null]], markers: {}, warp: [] });

/** A placeholder MoveSet: the director falls back to the legacy swing() / cast() for it. */
export function stubMoves(h: HeroId): MoveSet {
  const idle = idleClip(h);
  const slot: SlotMoves = { cast: idle };
  return {
    hero: h,
    stub: true,
    gait: DEFAULT_GAIT,
    springs: HERO_SPRINGS[h],
    basic: [],
    slots: { q: slot, w: slot, e: slot, r: slot },
    idle,
    fidgets: [],
    victory: idle,
    emote: idle,
    death: COMMON.death,
    respawn: COMMON.respawn,
    levelUp: COMMON.levelFlex,
  };
}

/** A placeholder SkillFxSet: effects.ts's generic shape switch draws instead. */
export function stubFx(h: HeroId): SkillFxSet {
  return { hero: h, stub: true, owns: { q: false, w: false, e: false, r: false, basic: false, passive: false } };
}

/** A scalar key list helper for hero files. */
export const keys = (...k: ScalarKey[]): readonly ScalarKey[] => k;
