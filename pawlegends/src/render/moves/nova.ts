/**
 * Nova's move set (sim v31; build spec docs/plans/moba/ROSTER-V31.md §2.1 "Moves and VFX").
 *
 * A stargazer who calls stars down from far away.
 * - basics (ranged, release on the 8 t windup): A a flick of starlight from the right paw, B from the left;
 * - Q Starfall: a paw raised to the sky and swept down at the point (the star falls on the zone's arm: skill FX);
 * - W Shooting Star: a long throwing sweep, the star flies from the paw;
 * - E Moon Hop: a light floating hop over the dash (land on travelEnd);
 * - R METEOR SHOWER (signature): both paws raised over the 12 t windup (windupStart → cast), then flung down;
 * - idle: she glances up at the sky; fidget: a peek through the telescope; victory: a twirl under a star; emote: she
 *   lies on her back and points at the stars.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, WRAP, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.nova;
const R_C = T.slots.r.windup * TICK_S;
const E_AIR = T.slots.e.dashTicks * TICK_S;

const FLICK_COIL = (s: 1 | -1): D => ({ chest: [-0.1, 0.25 * s, 0], [s > 0 ? 'shoulderR' : 'shoulderL']: [-2.2, 0, -0.4 * s], [s > 0 ? 'elbowR' : 'elbowL']: [-1.0, 0, 0] });
const FLICK = (s: 1 | -1): D => ({ chest: [0.15, -0.2 * s, 0], [s > 0 ? 'shoulderR' : 'shoulderL']: [-1.5, 0, -0.1 * s], [s > 0 ? 'elbowR' : 'elbowL']: [0, 0, 0] });
const SKY: D = { chest: [-0.25, 0, 0], head: [-0.45, 0, 0], shoulderR: [-3.0, 0, -0.2], elbowR: [-0.2, 0, 0] };
const POINT: D = { chest: [0.25, 0, 0], head: [0.05, 0, 0], shoulderR: [-1.6, 0, -0.1], elbowR: [0, 0, 0] };
const THROW_COIL: D = { chest: [-0.2, 0.5, 0], shoulderR: [-2.4, 0, -0.8], elbowR: [-1.2, 0, 0] };
const THROW: D = { chest: [0.3, -0.45, 0], shoulderR: [-1.4, 0, 0.3], elbowR: [0, 0, 0] };
const FLOAT: D = { chest: [-0.15, 0, 0], head: [-0.2, 0, 0], shoulderL: [-0.6, 0, 0.9], shoulderR: [-0.6, 0, -0.9], thighL: [-0.5, 0, 0], kneeL: [0.8, 0, 0], thighR: [-0.2, 0, 0], kneeR: [0.4, 0, 0] };
const CALL: D = { chest: [-0.3, 0, 0], head: [-0.55, 0, 0], shoulderL: [-3.0, 0, 0.35], shoulderR: [-3.0, 0, -0.35], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0] };
const FLING: D = { chest: [0.4, 0, 0], head: [0.1, 0, 0], shoulderL: [-1.3, 0, 0.5], shoulderR: [-1.3, 0, -0.5], elbowL: [0, 0, 0], elbowR: [0, 0, 0] };
const PEEK: D = { head: [-0.3, 0.3, 0], shoulderR: [-2.2, 0, -0.3], elbowR: [-1.8, 0, 0], shoulderL: [-1.9, 0, 0.3], elbowL: [-1.6, 0, 0] };

// ------------------------------------------------------------------------------------------------ basics

const flick = (id: string, s: 1 | -1): ClipDef =>
  mk(id, C + 0.26, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, FLICK_COIL(s), 'out'],
    [C, null, FLICK(s), 'expoIn'],
    [C + 0.26, null, null, 'inOut'],
  ], {
    mask: 'upper',
    markers: { coil: C * 0.6, contact: C, end: C + 0.26 },
    warp: [['contact', 'release']],
    cues: [['contact', 'whoosh', 'S']],
    cancel: 'afterContact',
  });
const basicA = flick('nova.basicA', 1);
const basicB = flick('nova.basicB', -1);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Starfall

const Q_C = 0.14;
const Q_END = Q_C + 0.4;
const q: ClipDef = mk('nova.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.8, null, SKY, 'out'],
  [Q_C + 0.08, null, POINT, 'expoIn'],
  [Q_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { contact: Q_C, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Shooting Star

const W_C = 0.12;
const W_END = W_C + 0.36;
const w: ClipDef = mk('nova.w', W_END, Prio.Ability, [
  [0, null, null],
  [W_C * 0.6, null, THROW_COIL, 'out'],
  [W_C, null, THROW, 'expoIn'],
  [W_END, null, null, 'inOut'],
], {
  mask: 'upper',
  root: { fwd: sk([0, 0], [W_C, 0.08, 'expoIn'], [W_END, 0, 'inOut']) },
  markers: { contact: W_C, end: W_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ E Moon Hop

const E_T0 = 0.03;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.2;
const e: ClipDef = mk('nova.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_T0, null, FLOAT, 'out'],
  [E_LAND, null, FLOAT, 'inOut'],
  [E_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [E_T0, 0.05], [(E_T0 + E_LAND) / 2, 0.45, 'out'], [E_LAND, 0, 'in'], [E_END, 0]) },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'S']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ R METEOR SHOWER

const R_END = R_C + 0.7;
const r: ClipDef = mk('nova.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.8, null, CALL, 'out'],
  [R_C - 0.02, null, merge(CALL, { chest: [-0.35, 0, 0] }), 'inOut'],
  [R_C + 0.12, null, FLING, 'expoIn'],
  [R_C + 0.45, null, FLING, 'hold'],
  [R_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [R_C, 0.1, 'out'], [R_C + 0.12, 0, 'expoIn'], [R_END, 0]) },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'whoosh', 'L'], ['contact', 'shake', 1]],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

const idle: ClipDef = mk('nova.idle', 3.2, Prio.Idle, [
  [0, null, null],
  [1.2, null, { head: [-0.25, 0.1, 0] }, 'inOut'],
  [2.2, null, { head: [-0.2, -0.1, 0] }, 'inOut'],
  [3.2, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [1.6, 1.02, 'inOut'], [3.2, 1, 'inOut']) } });

const peek: ClipDef = mk('nova.peek', 1.6, Prio.Idle, [
  [0, null, null],
  [0.35, null, PEEK, 'out'],
  [1.1, null, merge(PEEK, { head: [-0.35, -0.2, 0] }), 'inOut'],
  [1.6, null, null, 'inOut'],
], { markers: { contact: 0.35, end: 1.6 } });

const victory: ClipDef = mk('nova.victory', 1.0, Prio.Emote, [
  [0, null, SKY],
  [0.5, null, merge(SKY, { head: [-0.6, 0, 0.2] }), 'inOut'],
  [1.0, null, SKY, 'inOut'],
], { root: { yaw: sk([0, 0], [1.0, 1, 'inOut'], [1.0 + WRAP, 0, 'step']) }, calm: { yaw: 0 }, blendIn: 0.2 });

const emote: ClipDef = mk('nova.emote', 2.2, Prio.Emote, [
  [0, null, null],
  [0.4, null, merge(SKY, { chest: [-0.5, 0, 0] }), 'out'],
  [1.8, null, merge(SKY, { chest: [-0.55, 0, 0], head: [-0.6, 0, 0.15] }), 'inOut'],
  [2.2, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [0.4, 0.9, 'out'], [1.8, 0.9], [2.2, 1, 'inOut']) }, markers: { contact: 0.4, end: 2.2 } });

/** A light, quick walk. */
const gait: GaitProfile = { stride: 1.05, bounce: 0.9, lean: 0.6, hipSway: 0.9, headBob: 0.7, arms: 'hold', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'nova',
  stub: false,
  gait,
  springs: HERO_SPRINGS.nova,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[peek, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
};

/** Tests and the gallery: every authored clip. */
export const NOVA_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, idle, peek, victory, emote];
