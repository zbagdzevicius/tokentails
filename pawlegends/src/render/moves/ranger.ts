/**
 * Ranger's move set (sim v31; build spec docs/plans/moba/ROSTER-V31.md §2.4 "Moves and VFX").
 *
 * A beagle sniper with a tennis-ball launcher.
 * - basics (ranged, release on the 8 t windup): A a shot from the shoulder, B a shot from a crouch;
 * - Q Tracer Ball: a careful aimed shot, a sniff first;
 * - W Warning Bark: chest out, head forward, a big bark;
 * - E Bush Dive: a belly dive over the dash (land on travelEnd);
 * - R LONG SHOT (signature): he drops to one knee over the 15 t windup (windupStart → cast) and holds the aim while
 *   the balls fire (the `clip` event 'longshot' holds the kneel);
 * - idle: a sniff of the air; fidget: a scratch behind the ear; victory: a happy howl; emote: he rolls in the grass.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { gallopKeys, merge, mk, sk, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.ranger;
const R_C = T.slots.r.windup * TICK_S;
const E_AIR = T.slots.e.dashTicks * TICK_S;
const SHOT_S = 1.3;

const SHOULDER: D = { chest: [0.05, -0.15, 0], head: [0.1, 0.1, 0], shoulderR: [-1.6, 0, -0.05], elbowR: [-0.2, 0, 0], shoulderL: [-1.4, 0, 0.35], elbowL: [-0.8, 0, 0] };
const CROUCH: D = merge(SHOULDER, { hips: [0.1, 0, 0], thighL: [-0.6, 0, 0], kneeL: [0.9, 0, 0], thighR: [-0.4, 0, 0], kneeR: [0.7, 0, 0] });
const RECOIL: D = { chest: [-0.12, -0.15, 0], shoulderR: [-1.8, 0, -0.05] };
const SNIFF: D = { head: [0.2, 0, 0], chest: [0.15, 0, 0] };
const BARK: D = { chest: [0.3, 0, 0], head: [0.25, 0, 0], shoulderL: [-0.6, 0, 0.6], shoulderR: [-0.6, 0, -0.6] };
const DIVE: D = { chest: [0.9, 0, 0], head: [-0.2, 0, 0], shoulderL: [-2.6, 0, 0.2], shoulderR: [-2.6, 0, -0.2], thighL: [0.5, 0, 0], thighR: [0.5, 0, 0] };
const KNEEL: D = merge(SHOULDER, { hips: [0, -0.2, 0], thighL: [-1.2, 0, 0], kneeL: [1.3, 0, 0], thighR: [0.4, 0, 0], kneeR: [1.6, 0, 0] });
const HOWL: D = { chest: [-0.3, 0, 0], head: [-0.8, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const shot = (id: string, pose: D): ClipDef =>
  mk(id, C + 0.26, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, pose, 'out'],
    [C, null, pose, 'hold'],
    [C + 0.08, null, merge(pose, RECOIL), 'out'],
    [C + 0.26, null, null, 'inOut'],
  ], {
    markers: { coil: C * 0.6, contact: C, end: C + 0.26 },
    warp: [['contact', 'release']],
    cues: [['contact', 'whoosh', 'S']],
    cancel: 'afterContact',
  });
const basicA = shot('ranger.basicA', SHOULDER);
const basicB = shot('ranger.basicB', CROUCH);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Tracer Ball

const Q_C = 0.12;
const Q_END = Q_C + 0.36;
const q: ClipDef = mk('ranger.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.5, null, merge(SHOULDER, SNIFF), 'out'],
  [Q_C, null, SHOULDER, 'inOut'],
  [Q_C + 0.08, null, merge(SHOULDER, RECOIL), 'out'],
  [Q_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { contact: Q_C, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Warning Bark

const W_C = 0.08;
const W_END = W_C + 0.42;
const w: ClipDef = mk('ranger.w', W_END, Prio.Ability, [
  [0, null, null],
  [W_C, null, BARK, 'expoIn'],
  [W_C + 0.2, null, BARK, 'hold'],
  [W_END, null, null, 'inOut'],
], {
  mask: 'upper',
  root: { fwd: sk([0, 0], [W_C, 0.08, 'expoIn'], [W_END, 0, 'inOut']) },
  markers: { contact: W_C, end: W_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'mouthOpen', 300]],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ E Bush Dive

const E_T0 = 0.03;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.25;
const e: ClipDef = mk('ranger.e', E_END, Prio.Ability, [
  [0, null, null],
  ...gallopKeys(0, E_T0, 1, {}),
  [E_T0 + 0.02, null, DIVE, 'out'],
  [E_LAND, null, DIVE, 'inOut'],
  [E_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [E_T0, 0.05], [(E_T0 + E_LAND) / 2, 0.3, 'out'], [E_LAND, 0, 'in'], [E_END, 0]) },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ R LONG SHOT

const R_END = R_C + 0.4;
const r: ClipDef = mk('ranger.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.7, null, KNEEL, 'out'],
  [R_C, null, KNEEL, 'hold'],
  [R_C + 0.08, null, merge(KNEEL, RECOIL), 'out'],
  [R_END, null, KNEEL, 'inOut'],
], {
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'shake', 1]],
  cancel: 'none',
});

/** LONG SHOT's kneel (the `clip` event): the aim held, a recoil on each ball. */
const longshot: ClipDef = mk('ranger.longshot', SHOT_S, Prio.Ult, [
  [0, null, KNEEL],
  [0.4, null, merge(KNEEL, RECOIL), 'out'],
  [0.5, null, KNEEL, 'inOut'],
  [0.8, null, merge(KNEEL, RECOIL), 'out'],
  [0.9, null, KNEEL, 'inOut'],
  [SHOT_S, null, null, 'inOut'],
], { markers: { contact: 0, end: SHOT_S } });

// ------------------------------------------------------------------------------------------------ idle / emotes

const idle: ClipDef = mk('ranger.idle', 2.6, Prio.Idle, [
  [0, null, null],
  [0.8, null, merge(SNIFF, { head: [-0.15, 0.2, 0] }), 'inOut'],
  [1.6, null, { head: [-0.1, -0.2, 0] }, 'inOut'],
  [2.6, null, null, 'inOut'],
]);

const scratch: ClipDef = mk('ranger.scratch', 1.4, Prio.Idle, [
  [0, null, null],
  [0.3, null, { head: [0, 0, 0.35], thighR: [-1.4, 0, -0.4], kneeR: [1.2, 0, 0] }, 'out'],
  [0.5, null, { head: [0, 0, 0.4], thighR: [-1.5, 0, -0.45], kneeR: [1.0, 0, 0] }, 'inOut'],
  [0.7, null, { head: [0, 0, 0.35], thighR: [-1.4, 0, -0.4], kneeR: [1.2, 0, 0] }, 'inOut'],
  [1.4, null, null, 'inOut'],
], { markers: { contact: 0.3, end: 1.4 } });

const victory: ClipDef = mk('ranger.victory', 1.2, Prio.Emote, [
  [0, null, null],
  [0.3, null, HOWL, 'out'],
  [0.9, null, HOWL, 'hold'],
  [1.2, null, null, 'inOut'],
], { cues: [[0.3, 'mouthOpen', 600]], blendIn: 0.2 });

const emote: ClipDef = mk('ranger.emote', 1.8, Prio.Emote, [
  [0, null, null],
  [0.4, null, { chest: [0, 0, 0.6], hips: [0, 0, 0.5] }, 'inOut'],
  [0.9, null, { chest: [0, 0, -0.6], hips: [0, 0, -0.5] }, 'inOut'],
  [1.4, null, { chest: [0, 0, 0.6], hips: [0, 0, 0.5] }, 'inOut'],
  [1.8, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [0.4, 0.8, 'out'], [1.4, 0.8], [1.8, 1, 'inOut']) }, markers: { contact: 0.4, end: 1.8 } });

const gait: GaitProfile = { stride: 1.25, bounce: 1.1, lean: 0.8, hipSway: 0.9, headBob: 1.0, arms: 'hold', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'ranger',
  stub: false,
  gait,
  springs: HERO_SPRINGS.ranger,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[scratch, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
  clips: { longshot },
};

/** Tests and the gallery: every authored clip. */
export const RANGER_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, longshot, idle, scratch, victory, emote];
