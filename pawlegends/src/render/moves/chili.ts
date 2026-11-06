/**
 * Chili's move set (sim v13; build spec docs/plans/moba/DOGS-V13.md §1.4 "Moves and VFX", ANIM-SPEC §14 brief).
 *
 * A tiny furious chihuahua: everything is a yap with the whole body behind it.
 * - basics (ranged, release on the 8 t windup): A a yap (a hop and a head thrust, the body recoiling), B a double
 *   yap; in BIG DOG ENERGY (MoveCtx.form, not in the bag) a heavy bark with a chest thrust and a stomp;
 * - Q Yap Yap Yap: three head thrusts, the sim's `gap` ticks apart, the first on the cast;
 * - W Tiny Zoomies: scrabbling legs and a spin along the dash (take-off on the cast, a skid on travelEnd);
 * - E Purse Mode (signature): a hop into the handbag (he shrinks into it), a trembling bag held for the 30 t state,
 *   a pop out on stateEnd (skill FX draws the bag);
 * - R BIG DOG ENERGY (signature): a squash and a roar on the cast; the 1.35× size is an ADDITIVE form hold (the
 *   director keeps it on while the snapshot's form bit is set outside the bag), so it stays on under his basics, casts
 *   and run for the whole 180 t state and shrinks back with a wobble when it ends;
 * - idle: a stiff braced stance with a quick 3 Hz bob (off under reduced motion); fidget: a furious bark at nothing;
 *   victory and emote: the furious bob, then a single tiny "yip".
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S, abilNumbers } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { gallopKeys, merge, mk, sk, WRAP, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.chili;
const W_AIR = T.slots.w.dashTicks * TICK_S;
/** Yap Yap Yap: the gap between yaps (s). */
const GAP = (abilNumbers('chili', 'q').gap ?? 5) * TICK_S;
/** BIG DOG size (the spec's cap). */
export const BIG = 1.35;
/** BuffFlag.Untargetable (sim/api): set in the purse, not in BIG DOG. */
const UNTARGETABLE = 1 << 1;

const YAP_COIL: D = { chest: [-0.25, 0, 0], head: [0.25, 0, 0], earL: [-0.3, 0, 0], earR: [-0.3, 0, 0] };
const YAP: D = { chest: [0.3, 0, 0], head: [-0.4, 0, 0], shoulderL: [0.3, 0, 0.3], shoulderR: [0.3, 0, -0.3], earL: [0.35, 0, 0], earR: [0.35, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const yap = (id: string, contact: number, extra = 0.26): ClipDef =>
  mk(id, contact + extra, Prio.Basic, [
    [0, null, null],
    [contact * 0.6, null, YAP_COIL, 'out'],
    [contact, null, YAP, 'expoIn'],
    [contact + 0.1, null, merge(YAP, { chest: [0.1, 0, 0] }), 'back'],
    [contact + extra, null, null, 'inOut'],
  ], {
    root: { up: sk([0, 0], [contact * 0.6, 0.06, 'out'], [contact, 0.12, 'out'], [contact + 0.12, 0, 'in']), fwd: sk([0, 0], [contact, 0.04, 'expoIn'], [contact + 0.1, -0.08, 'out'], [contact + extra, 0, 'inOut']), sy: sk([0, 1], [contact * 0.6, 0.86], [contact, 1.14, 'expoIn'], [contact + 0.12, 0.94], [contact + extra, 1, 'inOut']) },
    markers: { coil: contact * 0.6, contact, end: contact + extra },
    warp: [['contact', 'release']],
    cues: [['contact', 'mouthOpen', 120], ['contact', 'fx', 'ch:yap']],
    cancel: 'afterContact',
  });

const basicA = yap('chili.basicA', C);
/** B: a double yap (a pre-yap on the coil, the real one on the contact). */
const basicB: ClipDef = {
  ...yap('chili.basicB', C, 0.3),
  keys: [
    [0, null, null],
    [C * 0.3, null, YAP, 'expoIn'],
    [C * 0.6, null, YAP_COIL, 'out'],
    [C, null, YAP, 'expoIn'],
    [C + 0.3, null, null, 'inOut'],
  ],
  cues: [[C * 0.3, 'mouthOpen', 80], ['contact', 'mouthOpen', 120], ['contact', 'fx', 'ch:yap']],
};
/** BIG DOG: a heavy bark, chest thrust and stomp, a camera nudge on the player's own. */
const basicBig: ClipDef = mk('chili.basicBig', C + 0.34, Prio.Basic, [
  [0, null, null],
  [C * 0.6, null, { chest: [-0.4, 0, 0], head: [0.2, 0, 0], shoulderL: [-0.6, 0, 0.6], shoulderR: [-0.6, 0, -0.6] }, 'out'],
  [C, null, { chest: [0.45, 0, 0], head: [-0.35, 0, 0], shoulderL: [-0.3, 0, 0.9], shoulderR: [-0.3, 0, -0.9], thighL: [-0.5, 0, 0], kneeL: [0.5, 0, 0] }, 'expoIn'],
  [C + 0.34, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [C * 0.6, -0.1], [C, 0.15, 'expoIn'], [C + 0.34, 0, 'inOut']), sy: sk([0, 1], [C * 0.6, 1.08], [C, 0.88, 'expoIn'], [C + 0.16, 1.03, 'back'], [C + 0.34, 1]) },
  markers: { coil: C * 0.6, contact: C, end: C + 0.34 },
  warp: [['contact', 'release']],
  cues: [['contact', 'mouthOpen', 220], ['contact', 'fx', 'ch:bark'], ['contact', 'shake', 1], ['contact', 'dust']],
  cancel: 'afterContact',
});

const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => (ctx.form === true && (ctx.buffs & UNTARGETABLE) === 0 ? basicBig : BASICS[ctx.comboIndex % BASICS.length]);

// ------------------------------------------------------------------------------------------------ Q Yap Yap Yap

const Q_C = 0.06;
const Q_END = Q_C + 2 * GAP + 0.3;
const q: ClipDef = mk('chili.q', Q_END, Prio.Ability, [
  [0, null, YAP_COIL],
  [Q_C, null, YAP, 'expoIn'],
  [Q_C + GAP * 0.6, null, YAP_COIL, 'out'],
  [Q_C + GAP, null, YAP, 'expoIn'],
  [Q_C + GAP * 1.6, null, YAP_COIL, 'out'],
  [Q_C + 2 * GAP, null, merge(YAP, { chest: [0.45, 0, 0], head: [-0.55, 0, 0] }), 'expoIn'],
  [Q_END, null, null, 'inOut'],
], {
  root: {
    up: sk([0, 0], [Q_C, 0.12, 'out'], [Q_C + GAP * 0.6, 0, 'in'], [Q_C + GAP, 0.12, 'out'], [Q_C + GAP * 1.6, 0, 'in'], [Q_C + 2 * GAP, 0.16, 'out'], [Q_C + 2 * GAP + 0.14, 0, 'in']),
    sy: sk([0, 0.88], [Q_C, 1.14, 'expoIn'], [Q_C + GAP * 0.6, 0.88], [Q_C + GAP, 1.14, 'expoIn'], [Q_C + GAP * 1.6, 0.88], [Q_C + 2 * GAP, 1.18, 'expoIn'], [Q_END, 1, 'inOut']),
  },
  markers: { contact: Q_C, yap2: Q_C + GAP, yap3: Q_C + 2 * GAP, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'mouthOpen', 100], ['yap2', 'mouthOpen', 100], ['yap3', 'mouthOpen', 160]],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Tiny Zoomies

const W_T0 = 0.04;
const W_LAND = W_T0 + W_AIR;
const W_END = W_LAND + 0.28;
const LOW: D = { chest: [0.5, 0, 0], hips: [0.25, 0, 0], head: [-0.5, 0, 0], earL: [-0.7, 0, 0], earR: [-0.7, 0, 0] };
const w: ClipDef = mk('chili.w', W_END, Prio.Ability, [
  [0, null, null],
  ...gallopKeys(W_T0, W_LAND, 6, LOW),
  [W_LAND + 0.1, null, { chest: [-0.3, 0, 0], head: [-0.2, 0, 0], thighL: [-0.6, 0, 0.3], thighR: [-0.6, 0, -0.3], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }, 'out'],
  [W_END, null, null, 'inOut'],
], {
  root: { yaw: sk([0, 0], [W_T0 + W_AIR * 0.3, 0], [W_T0 + W_AIR * 0.8, 1, 'inOut'], [W_T0 + W_AIR * 0.8 + WRAP, 0, 'step'], [W_END, 0]), up: sk([0, 0], [W_T0 + W_AIR * 0.25, 0.12, 'out'], [W_T0 + W_AIR * 0.5, 0, 'in'], [W_T0 + W_AIR * 0.75, 0.12, 'out'], [W_LAND, 0, 'in']), fwd: sk([0, 0], [W_LAND, 0], [W_LAND + 0.1, -0.1, 'out'], [W_END, 0, 'inOut']) },
  calm: { yaw: 0 },
  markers: { takeoff: W_T0, contact: W_T0, land: W_LAND, end: W_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'M'], ['takeoff', 'trailOn', 'body'], ['takeoff', 'fx', 'ch:zoom'], ['land', 'trailOff'], ['land', 'dust']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ E Purse Mode

const E_C = 0.16;
/** IN THE BAG (squashed small; skill FX draws the handbag round him). */
const BAGGED = { sx: 0.55, sy: 0.32 };
const TUCK: D = { head: [0.6, 0, 0], chest: [0.4, 0, 0], shoulderL: [-0.6, 0, -0.4], shoulderR: [-0.6, 0, 0.4], elbowL: [-2, 0, 0], elbowR: [-2, 0, 0], thighL: [-1.4, 0, 0], thighR: [-1.4, 0, 0], kneeL: [2.0, 0, 0], kneeR: [2.0, 0, 0], earL: [-0.8, 0, 0], earR: [-0.8, 0, 0] };
const e: ClipDef = mk('chili.e', E_C + 0.12, Prio.Ability, [
  [0, null, null],
  [E_C * 0.6, null, { shoulderL: [-2.6, 0, 0.2], shoulderR: [-2.6, 0, -0.2], head: [0.3, 0, 0] }, 'out'],
  [E_C, null, TUCK, 'in'],
  [E_C + 0.12, null, TUCK, 'hold'],
], {
  root: { up: sk([0, 0], [E_C * 0.6, 0.45, 'out'], [E_C, 0, 'in'], [E_C + 0.12, 0]), sx: sk([0, 1], [E_C * 0.6, 0.85], [E_C, BAGGED.sx, 'in'], [E_C + 0.12, BAGGED.sx]), sy: sk([0, 1], [E_C * 0.6, 1.15], [E_C, BAGGED.sy, 'in'], [E_C + 0.12, BAGGED.sy]) },
  markers: { coil: E_C * 0.6, contact: E_C, end: E_C + 0.12 },
  warp: [['contact', 'cast']],
  cues: [['coil', 'whoosh', 'S']],
  cancel: 'none',
});
/** The trembling bag: a nervous little wobble. */
const eHold: ClipDef = mk('chili.eHold', 0.3, Prio.Ability, [[0, null, TUCK], [0.3, null, TUCK, 'hold']], {
  root: { sx: sk([0, BAGGED.sx], [0.075, BAGGED.sx * 1.06], [0.15, BAGGED.sx], [0.225, BAGGED.sx * 1.06], [0.3, BAGGED.sx]), sy: sk([0, BAGGED.sy], [0.075, BAGGED.sy * 0.95], [0.15, BAGGED.sy], [0.225, BAGGED.sy * 0.95], [0.3, BAGGED.sy]), roll: sk([0, 0], [0.075, 0.01], [0.225, -0.01], [0.3, 0]) },
  calm: { roll: 0, sx: 0, sy: 0 },
  blendIn: 0.02,
});
/** The bag unzips: he pops out, arms up, a big stretch and a bounce. */
const eEnd: ClipDef = mk('chili.eEnd', 0.45, Prio.Ability, [
  [0, null, TUCK],
  [0.14, null, { shoulderL: [-2.6, 0, 0.7], shoulderR: [-2.6, 0, -0.7], head: [-0.4, 0, 0], thighL: [0.2, 0, 0.2], thighR: [0.2, 0, -0.2] }, 'expoOut'],
  [0.45, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [0.14, 0.55, 'out'], [0.32, 0, 'in'], [0.45, 0]), sx: sk([0, BAGGED.sx], [0.14, 0.9, 'out'], [0.32, 1.12], [0.45, 1, 'back']), sy: sk([0, BAGGED.sy], [0.14, 1.2, 'out'], [0.32, 0.85, 'in'], [0.45, 1, 'back']) },
  markers: { contact: 0, end: 0.45 },
  warp: [['contact', 'stateEnd']],
  cues: [[0, 'fx', 'ch:pop'], [0.32, 'land']],
});

// ------------------------------------------------------------------------------------------------ R BIG DOG ENERGY

const R_C = 0.08;
const R_END = R_C + 0.4;
/** The growth spurt: a squash on the cast, chest out and a roar; the size itself is the form hold below. */
const r: ClipDef = mk('chili.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C, null, { chest: [0.3, 0, 0], head: [0.3, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }, 'out'],
  [R_C + 0.2, null, { chest: [-0.4, 0, 0], head: [-0.5, 0, 0], shoulderL: [-0.8, 0, 1.2], shoulderR: [-0.8, 0, -1.2], elbowL: [-1.5, 0, 0], elbowR: [-1.5, 0, 0] }, 'expoOut'],
  [R_END, null, null, 'inOut'],
], {
  root: { sx: sk([0, 1], [R_C, 1.12, 'out'], [R_C + 0.2, 1.06, 'expoOut'], [R_END, 1, 'back']), sy: sk([0, 1], [R_C, 0.75, 'out'], [R_C + 0.2, 1.12, 'expoOut'], [R_END, 1, 'back']) },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'fx', 'ch:grow'], [R_C + 0.2, 'mouthOpen', 320], [R_C + 0.2, 'shake', 2], [R_C + 0.2, 'punch', -0.05], [R_C + 0.2, 'dustRing']],
  cancel: 'none',
});
/**
 * BIG DOG: an additive root swell, held by the director while the form bit is set outside the bag (MoveSet.formHold):
 * it grows in over its 0.3 s blend, stays on under his basics, casts and run for the whole state, and shrinks back
 * over 0.25 s when it ends.
 */
const bigDog: ClipDef = mk('chili.bigDog', 1, Prio.Ult, [[0, null, null], [1, null, null]], { mode: 'additive', root: { sx: sk([0, BIG], [1, BIG]), sy: sk([0, BIG], [1, BIG]) }, blendIn: 0.3, blendOut: 0.25 });
/** Back to tiny: a wobble while the swell fades. */
const rEnd: ClipDef = mk('chili.rEnd', 0.5, Prio.Ult, [
  [0, null, null],
  [0.15, null, { head: [0.3, 0, 0.2], earL: [-0.5, 0, 0], earR: [-0.5, 0, 0] }, 'out'],
  [0.5, null, null, 'inOut'],
], { root: { sx: sk([0, 1], [0.15, 0.85, 'out'], [0.3, 1.08], [0.5, 1, 'back']), sy: sk([0, 1], [0.15, 1.12, 'out'], [0.3, 0.92], [0.5, 1, 'back']) }, markers: { contact: 0, end: 0.5 }, warp: [['contact', 'stateEnd']], cues: [[0, 'fx', 'ch:shrink']] });

// ------------------------------------------------------------------------------------------------ idle / emotes

/** The braced little stance with a quick 3 Hz bob (two bobs a loop; reduced motion holds still). */
const idle: ClipDef = mk('chili.idle', 2 / 3, Prio.Idle, [
  [0, null, null],
  [1 / 6, null, { head: [-0.06, 0, 0.03], earL: [0.15, 0, 0], earR: [0.15, 0, 0] }, 'inOut'],
  [1 / 3, null, null, 'inOut'],
  [1 / 2, null, { head: [-0.06, 0, -0.03], earL: [0.15, 0, 0], earR: [0.15, 0, 0] }, 'inOut'],
  [2 / 3, null, null, 'inOut'],
], { root: { up: sk([0, 0], [1 / 6, 0.035, 'inOut'], [1 / 3, 0, 'inOut'], [1 / 2, 0.035, 'inOut'], [2 / 3, 0, 'inOut']) }, calm: { up: 0 } });

/** Fidget: a furious bark at nothing (three yaps with hops), then a huff. */
const tantrum: ClipDef = mk('chili.tantrum', 1.3, Prio.Idle, [
  [0, null, null],
  [0.1, null, YAP_COIL, 'out'],
  [0.2, null, YAP, 'expoIn'],
  [0.32, null, YAP_COIL, 'out'],
  [0.42, null, YAP, 'expoIn'],
  [0.54, null, YAP_COIL, 'out'],
  [0.66, null, merge(YAP, { head: [-0.6, 0, 0] }), 'expoIn'],
  [1.0, null, { head: [0.2, 0.5, 0], chest: [-0.1, 0, 0] }, 'inOut'],
  [1.3, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [0.2, 0.15, 'out'], [0.32, 0, 'in'], [0.42, 0.15, 'out'], [0.54, 0, 'in'], [0.66, 0.2, 'out'], [0.8, 0, 'in']) },
  cues: [[0.2, 'mouthOpen', 90], [0.42, 'mouthOpen', 90], [0.66, 'mouthOpen', 140], [0.2, 'fx', 'ch:yap'], [0.66, 'fx', 'ch:yap']],
});

/** Victory and emote: the furious bob (fast, stiff), then one tiny "yip" with the chin up. */
const bobYip = (id: string, prio: Prio): ClipDef =>
  mk(id, 1.6, prio, [
    [0, null, null],
    [0.1, null, { chest: [-0.15, 0, 0], head: [-0.15, 0, 0] }, 'inOut'],
    [0.2, null, { chest: [0.1, 0, 0] }, 'inOut'],
    [0.3, null, { chest: [-0.15, 0, 0], head: [-0.15, 0, 0] }, 'inOut'],
    [0.4, null, { chest: [0.1, 0, 0] }, 'inOut'],
    [0.5, null, { chest: [-0.15, 0, 0], head: [-0.15, 0, 0] }, 'inOut'],
    [0.6, null, { chest: [0.1, 0, 0] }, 'inOut'],
    [0.9, null, { chest: [-0.3, 0, 0], head: [-0.7, 0, 0], shoulderL: [-0.5, 0, 0.6], shoulderR: [-0.5, 0, -0.6] }, 'expoOut'],
    [1.25, null, { chest: [-0.3, 0, 0], head: [-0.7, 0, 0], shoulderL: [-0.5, 0, 0.6], shoulderR: [-0.5, 0, -0.6] }, 'hold'],
    [1.6, null, null, 'inOut'],
  ], {
    root: { up: sk([0, 0], [0.1, 0.06], [0.2, 0], [0.3, 0.06], [0.4, 0], [0.5, 0.06], [0.6, 0], [0.9, 0.18, 'out'], [1.1, 0, 'in']) },
    markers: { contact: 0.9, end: 1.6 },
    cues: [[0.9, 'mouthOpen', 160], [0.9, 'fx', 'ch:yip']],
  });
const victory = bobYip('chili.victory', Prio.Emote);
const emote = bobYip('chili.emote', Prio.Emote);

/** A fast skittering stride: tiny steps, a big bob. */
const gait: GaitProfile = { stride: 0.62, bounce: 1.6, lean: 1.0, hipSway: 0.8, headBob: 1.5, arms: 'pump', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'chili',
  stub: false,
  gait,
  springs: HERO_SPRINGS.chili,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e, hold: eHold, end: eEnd }, r: { cast: r, end: rEnd } },
  idle,
  fidgets: [[tantrum, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
  formHold: bigDog,
  formHoldWhen: (ctx) => (ctx.buffs & UNTARGETABLE) === 0,
};

/** Tests and the gallery: every authored clip. */
export const CHILI_CLIPS: readonly ClipDef[] = [basicA, basicB, basicBig, q, w, e, eHold, eEnd, r, bigDog, rEnd, idle, tantrum, victory, emote];
