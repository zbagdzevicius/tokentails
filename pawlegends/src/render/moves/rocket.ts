/**
 * Rocket's move set (sim v15; build spec docs/plans/moba/DOGS-V15.md §1.1 "Moves and VFX", ANIM-SPEC §15 brief).
 *
 * A greyhound built for one thing: going very fast, from very far away. Then a nap.
 * - basics (ranged, release on the 8 t windup): A a quick head flick that fires the dart, B the same off the other side;
 * - Q Lure Shot: crouch-and-point, the ears flip up on the release;
 * - W Photo Finish: a short, low gallop dash (take-off on the cast, a lean across the line on travelEnd);
 * - E SQUIRREL!: a wind-up over the 15 t windup (windupStart → cast), then an overhand throw of the toy;
 * - R ZOOM… ZZZ: the 9 t crouch (the goggles drop, the ears flip up), then a flat-out double-suspension gallop to
 *   travelEnd; the nap itself is his own clip for the sim `clip` event 'zzz' (`clips.zzz`, the signature): he spins a
 *   whole turn, flops onto his back with his legs straight up (the roach), twitches through the 18 t nap and pops up;
 * - idle: the lean, breathing; fidget: a big yawn and stretch; victory: the roach (smug); emote: the lean on an
 *   invisible friend, sliding slowly down until he lies on his back.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S, abilNumbers } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { gallopKeys, merge, mk, sk, WRAP, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.rocket;
const W_AIR = T.slots.w.dashTicks * TICK_S;
const E_C = T.slots.e.windup * TICK_S;
const R_C = T.slots.r.windup * TICK_S;
const R_AIR = T.slots.r.dashTicks * TICK_S;
/** The nap (s): the sim's r.nap ticks. */
export const NAP_S = (abilNumbers('rocket', 'r').nap ?? 18) * TICK_S;
/** His roach-nap pose (chars/heroes/rocket.ts POSES.roachNap). */
export const ROACH = 'roachNap';

const EARS_UP: D = { earL: [0.9, 0, 0.2], earR: [0.9, 0, -0.2] };
const FLICK_COIL: D = { chest: [-0.15, 0, 0], head: [0.3, 0.15, 0] };
const FLICK: D = { chest: [0.2, 0, 0], head: [-0.35, -0.1, 0], shoulderR: [-0.6, 0, -0.2] };
const POINT: D = { chest: [0.35, 0, 0], hips: [0.1, 0, 0], head: [-0.2, 0, 0], shoulderR: [-1.5, 0, -0.1], elbowR: [0, 0, 0], thighL: [-0.4, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.4, 0, 0] };
const CROUCH: D = { hips: [0.35, 0, 0], chest: [0.45, 0, 0], head: [-0.25, 0, 0], thighL: [-0.7, 0, 0.08], thighR: [-0.7, 0, -0.08], kneeL: [1.2, 0, 0], kneeR: [1.2, 0, 0], shoulderL: [-0.6, 0, 0.1], shoulderR: [-0.6, 0, -0.1], earL: [-0.5, 0, 0], earR: [-0.5, 0, 0] };
/** Flat out: body long and low, head forward, ears pinned (the gallop legs go on top). */
const SPRINT: D = { hips: [0.4, 0, 0], chest: [0.55, 0, 0], head: [-0.45, 0, 0], earL: [-0.8, 0, 0], earR: [-0.8, 0, 0] };
const YAWN: D = { chest: [-0.35, 0, 0], head: [-0.75, 0, 0], shoulderL: [-2.6, 0, 0.35], shoulderR: [-2.6, 0, -0.35], elbowL: [0, 0, 0], elbowR: [0, 0, 0] };
const THROW_BACK: D = { chest: [-0.3, -0.5, 0], head: [0.1, 0.3, 0], shoulderR: [-2.6, 0, -0.5], elbowR: [-0.9, 0, 0] };
const THROW: D = { chest: [0.35, 0.4, 0], head: [-0.2, -0.2, 0], shoulderR: [-1.2, 0, -0.2], elbowR: [0, 0, 0], thighL: [-0.3, 0, 0], kneeL: [0.3, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const flick = (id: string, side: 1 | -1): ClipDef =>
  mk(id, C + 0.26, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, merge(FLICK_COIL, { head: [0.3, 0.15 * side, 0] }), 'out'],
    [C, null, merge(FLICK, side > 0 ? {} : { shoulderR: [0, 0, 0], shoulderL: [-0.6, 0, 0.2] }), 'expoIn'],
    [C + 0.1, null, merge(FLICK, { chest: [0.1, 0, 0] }), 'back'],
    [C + 0.26, null, null, 'inOut'],
  ], {
    mask: 'upper',
    root: { fwd: sk([0, 0], [C * 0.6, -0.05], [C, 0.06, 'expoIn'], [C + 0.26, 0, 'inOut']) },
    markers: { coil: C * 0.6, contact: C, end: C + 0.26 },
    warp: [['contact', 'release']],
    cues: [['contact', 'whoosh', 'S'], ['contact', 'fx', 'rk:flick']],
    cancel: 'afterContact',
  });
const basicA = flick('rocket.basicA', 1);
const basicB = flick('rocket.basicB', -1);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Lure Shot

const Q_C = 0.1;
const Q_END = Q_C + 0.4;
/** Crouch-and-point: the weight down, a paw pointing down the line, the ears flipping up on the release. */
const q: ClipDef = mk('rocket.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C, null, merge(POINT, EARS_UP), 'expoOut'],
  [Q_C + 0.2, null, merge(POINT, { chest: [0.25, 0, 0] }), 'inOut'],
  [Q_END, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [Q_C, 0.1, 'expoOut'], [Q_END, 0, 'inOut']), sy: sk([0, 1], [Q_C, 0.92, 'out'], [Q_END, 1, 'inOut']) },
  markers: { contact: Q_C, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M'], ['contact', 'fx', 'rk:lure']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Photo Finish

const W_T0 = 0.04;
const W_LAND = W_T0 + W_AIR;
const W_END = W_LAND + 0.3;
/** A short, low gallop and a lean across the line (chest thrust out, head up: the photo finish). */
const w: ClipDef = mk('rocket.w', W_END, Prio.Ability, [
  [0, null, null],
  ...gallopKeys(W_T0, W_LAND, 3, SPRINT),
  [W_LAND + 0.1, null, { chest: [-0.35, 0, 0], head: [-0.5, 0, 0], shoulderL: [-0.4, 0, 0.6], shoulderR: [-0.4, 0, -0.6], thighL: [-0.4, 0, 0], kneeL: [0.4, 0, 0] }, 'out'],
  [W_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [W_T0 + W_AIR * 0.35, 0.12, 'out'], [W_T0 + W_AIR * 0.7, 0, 'in'], [W_LAND, 0]), fwd: sk([0, 0], [W_LAND, 0], [W_LAND + 0.1, 0.12, 'out'], [W_END, 0, 'inOut']) },
  markers: { takeoff: W_T0, contact: W_T0, land: W_LAND, end: W_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'L'], ['takeoff', 'dust'], ['land', 'fx', 'rk:ribbon'], ['land', 'land']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ E SQUIRREL!

const E_END = E_C + 0.4;
/** The wind-up over the whole windup (the squeaky toy held high, waggled), then the overhand throw on the cast. */
const e: ClipDef = mk('rocket.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_C * 0.4, null, THROW_BACK, 'out'],
  [E_C * 0.7, null, merge(THROW_BACK, { shoulderR: [-2.8, 0, -0.3] }), 'inOut'],
  [E_C - 0.03, null, THROW_BACK, 'inOut'],
  [E_C, null, THROW, 'expoIn'],
  [E_C + 0.15, null, merge(THROW, { chest: [0.25, 0.3, 0] }), 'back'],
  [E_END, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [E_C * 0.4, -0.08, 'out'], [E_C, 0.12, 'expoIn'], [E_END, 0, 'inOut']) },
  markers: { coil: 0, contact: E_C, end: E_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'fx', 'rk:squeak'], ['contact', 'whoosh', 'M'], ['contact', 'fx', 'rk:throw']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ R ZOOM… ZZZ

const R_LAND = R_C + R_AIR;
const R_END = R_LAND + 0.08;
/** The crouch over the 9 t windup (goggles down, ears up), then flat out to travelEnd; `clips.zzz` takes over. */
const r: ClipDef = mk('rocket.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.6, null, merge(CROUCH, EARS_UP), 'out'],
  [R_C, null, CROUCH, 'inOut'],
  ...gallopKeys(R_C + 0.03, R_LAND, 6, SPRINT),
  [R_END, null, SPRINT, 'inOut'],
], {
  root: {
    sy: sk([0, 1], [R_C * 0.6, 0.82, 'out'], [R_C, 0.8], [R_C + 0.06, 1.05, 'expoOut'], [R_LAND, 1], [R_END, 1]),
    up: sk([0, 0], [R_C, 0], [R_C + R_AIR * 0.25, 0.1, 'out'], [R_C + R_AIR * 0.5, 0, 'in'], [R_C + R_AIR * 0.75, 0.1, 'out'], [R_LAND, 0, 'in'], [R_END, 0]),
  },
  markers: { coil: 0, contact: R_C, land: R_LAND, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast'], ['land', 'travelEnd']],
  cues: [['coil', 'fx', 'rk:goggles'], ['coil', 'dust'], ['contact', 'whoosh', 'L'], ['contact', 'fx', 'rk:zoom'], ['contact', 'punch', 0.04]],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ the roach nap

const N_FLOP = 0.2;
const N_UP = NAP_S;
const N_END = N_UP + 0.3;
/** ZZZ (signature): a whole spin, flat on his back with the legs straight up, a twitch, and up as the nap ends. */
const zzz: ClipDef = mk('rocket.zzz', N_END, Prio.Ult, [
  [0, null, SPRINT],
  [N_FLOP, ROACH, null, 'in'],
  [N_FLOP + 0.15, ROACH, { thighL: [-0.2, 0, 0], kneeL: [0.4, 0, 0], shoulderR: [0.3, 0, 0] }, 'inOut'],
  [N_FLOP + 0.3, ROACH, null, 'inOut'],
  [N_UP, ROACH, null, 'hold'],
  [N_UP + 0.15, null, { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0] }, 'out'],
  [N_END, null, null, 'back'],
], {
  root: {
    yaw: sk([0, 0], [N_FLOP, 1, 'out'], [N_FLOP + WRAP, 0, 'step'], [N_END, 0]),
    up: sk([0, 0], [N_FLOP * 0.4, 0.25, 'out'], [N_FLOP, 0, 'in'], [N_UP, 0], [N_UP + 0.15, 0.25, 'out'], [N_END, 0, 'in']),
    sy: sk([0, 1], [N_FLOP, 1], [N_FLOP + 0.05, 0.84, 'in'], [N_FLOP + 0.16, 1, 'back'], [N_END, 1]),
  },
  calm: { yaw: 0 },
  markers: { contact: 0, flop: N_FLOP, up: N_UP, end: N_END },
  cues: [[N_FLOP, 'land'], [N_FLOP, 'dust'], [N_FLOP, 'fx', 'rk:zzz'], [N_FLOP, 'mouthOpen', '400*1.4'], [N_UP, 'fx', 'rk:wake']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

/** The lean, breathing slowly, the head drooping and lifting. */
const idle: ClipDef = mk('rocket.idle', 2.6, Prio.Idle, [
  [0, null, null],
  [1.3, null, { head: [0.12, 0, 0.05], chest: [0.04, 0, 0] }, 'inOut'],
  [2.6, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [1.3, 1.015, 'inOut'], [2.6, 1, 'inOut']) } });

/** Fidget: a huge yawn and a full stretch, front legs up. */
const yawn: ClipDef = mk('rocket.yawn', 1.6, Prio.Idle, [
  [0, null, null],
  [0.5, null, YAWN, 'inOut'],
  [1.0, null, merge(YAWN, { head: [-0.85, 0, 0.1] }), 'inOut'],
  [1.6, null, null, 'inOut'],
], { markers: { contact: 0.5, end: 1.6 }, cues: [[0.5, 'mouthOpen', '700*1.8']] });

/** Victory: the smug roach, legs twitching. Loops. */
const victory: ClipDef = mk('rocket.victory', 1.2, Prio.Emote, [
  [0, ROACH, null],
  [0.6, ROACH, { thighL: [-0.25, 0, 0], kneeL: [0.4, 0, 0], shoulderL: [0.3, 0, 0] }, 'inOut'],
  [1.2, ROACH, null, 'inOut'],
], { blendIn: 0.3 });

/** Emote: the lean on an invisible friend, sliding slowly down until he lies on his back. */
const emote: ClipDef = mk('rocket.emote', 2.6, Prio.Emote, [
  [0, null, null],
  [0.5, null, { chest: [0, 0, 0.45], hips: [0, 0, 0.2], head: [0, 0, 0.3], thighL: [0, 0, 0.3] }, 'inOut'],
  [1.6, null, { chest: [0, 0, 0.7], hips: [0, 0, 0.45], head: [0, 0, 0.45], thighL: [0, 0, 0.5], kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0] }, 'inOut'],
  [2.1, ROACH, null, 'in'],
  [2.6, ROACH, null, 'hold'],
], { root: { roll: sk([0, 0], [1.6, -0.04, 'inOut'], [2.1, 0, 'in']) }, calm: { roll: 0 }, markers: { contact: 2.1, end: 2.6 }, cues: [[2.1, 'land'], [2.1, 'fx', 'rk:zzz']] });

/** A long double-suspension gallop: a huge stride, low bounce, a strong lean. */
const gait: GaitProfile = { stride: 1.6, bounce: 0.7, lean: 1.8, hipSway: 0.5, headBob: 0.6, arms: 'pump', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'rocket',
  stub: false,
  gait,
  springs: HERO_SPRINGS.rocket,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[yawn, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
  clips: { zzz },
};

/** Tests and the gallery: every authored clip. */
export const ROCKET_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, zzz, idle, yawn, victory, emote];
