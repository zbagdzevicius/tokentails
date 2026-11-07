/**
 * Frankie's move set (sim v15; build spec docs/plans/moba/DOGS-V15.md §1.2 "Moves and VFX", ANIM-SPEC §15 brief).
 *
 * A sausage dog in a hot-dog costume: low, quick and very long when he wants to be.
 * - basics (melee, contact on the 8 t windup): A a quick lunge-nip, B a sideways head snap;
 * - Q Weenie Roll: he tucks into the bun (his `weenieTuck` pose) and rolls like a hot dog on a grill: two whole turns
 *   about his long axis over the dash, out of it on travelEnd;
 * - W Dig: a nose-first dive on the cast; the body is hidden while he travels underground (an ADDITIVE form hold that
 *   shrinks him to nothing while the snapshot's form bit is set and he is untargetable: `formHold`, `formHoldWhen`),
 *   and he grows back as the hold fades when he pops up (the toaster pop is skill FX on the untargetable edge);
 * - E Bun Hop: a springy little hop out of the bun (take-off on the cast, land on travelEnd);
 * - R FOOTLONG! (signature): rearing back over the 8 t windup, then a long low lunge held while the stretch flies
 *   (the stretched body is skill FX: the head and spine never scale); the grab is his own clip for the sim `clip`
 *   event 'footlong' (`clips.footlong`): a snap forward with a squash on arrival;
 * - idle: a slow tail wag, the worried look; fidget: the "costume check" (looking back at the bun); victory: the bark;
 *   emote: the slow U-turn (the front end walks a full circle, the back end follows a beat later).
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { BuffFlag } from '../../sim/api';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, WRAP, type D } from './dogKit';

const C = BASIC_CONTACT;
const T = SIM_TIMING.frankie;
const Q_AIR = T.slots.q.dashTicks * TICK_S;
const E_AIR = T.slots.e.dashTicks * TICK_S;
const R_C = T.slots.r.windup * TICK_S;
/** FOOTLONG!'s flight at full range (s). */
const R_FLY = T.slots.r.projTicks * TICK_S;
/** His tucked roll pose (chars/heroes/frankie.ts POSES.weenieTuck). */
const TUCK = 'weenieTuck';
/** How small the body is drawn underground (the dig form hold). */
export const DIG_SCALE = 0.04;

const NIP_COIL: D = { chest: [-0.1, 0, 0], head: [0.25, 0, 0], thighL: [-0.2, 0, 0], kneeL: [0.3, 0, 0] };
const NIP: D = { chest: [0.25, 0, 0], head: [-0.35, 0, 0], shoulderL: [-0.5, 0, 0.2], shoulderR: [-0.5, 0, -0.2] };
const REAR: D = { chest: [-0.45, 0, 0], hips: [-0.15, 0, 0], head: [-0.4, 0, 0], shoulderL: [-1.6, 0, 0.4], shoulderR: [-1.6, 0, -0.4], earL: [-0.4, 0, 0], earR: [-0.4, 0, 0] };
/** The FOOTLONG lunge: everything forward and low, front paws reaching, ears flying back. */
const LUNGE: D = { chest: [0.55, 0, 0], hips: [0.2, 0, 0], head: [-0.75, 0, 0], shoulderL: [-2.3, 0, 0.15], shoulderR: [-2.3, 0, -0.15], elbowL: [0, 0, 0], elbowR: [0, 0, 0], thighL: [0.5, 0, 0], thighR: [0.5, 0, 0], kneeL: [0.2, 0, 0], kneeR: [0.2, 0, 0], earL: [-0.9, 0, 0], earR: [-0.9, 0, 0] };
const DIVE: D = { chest: [0.7, 0, 0], hips: [0.3, 0, 0], head: [0.3, 0, 0], shoulderL: [-2.4, 0, 0.1], shoulderR: [-2.4, 0, -0.1], thighL: [0.5, 0, 0], thighR: [0.5, 0, 0] };
const BARK: D = { chest: [-0.15, 0, 0], head: [-0.35, 0, 0], shoulderL: [-0.6, 0, 0.3], shoulderR: [-0.6, 0, -0.3] };

// ------------------------------------------------------------------------------------------------ basics

const nip = (id: string, yaw: number): ClipDef =>
  mk(id, C + 0.28, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, merge(NIP_COIL, { head: [0.25, -yaw, 0] }), 'out'],
    [C, null, merge(NIP, { head: [-0.35, yaw, 0] }), 'expoIn'],
    [C + 0.12, null, merge(NIP, { chest: [0.15, 0, 0] }), 'back'],
    [C + 0.28, null, null, 'inOut'],
  ], {
    root: { fwd: sk([0, 0], [C * 0.6, -0.08], [C, 0.25, 'expoIn'], [C + 0.12, 0.18], [C + 0.28, 0, 'inOut']), sy: sk([0, 1], [C * 0.6, 0.9], [C, 1.05, 'expoIn'], [C + 0.28, 1]) },
    markers: { coil: C * 0.6, contact: C, end: C + 0.28 },
    warp: [['contact', 'contact']],
    cues: [['contact', 'mouthOpen', 140], ['contact', 'whoosh', 'S']],
    cancel: 'afterContact',
  });
const basicA = nip('frankie.basicA', 0);
const basicB = nip('frankie.basicB', 0.45);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Weenie Roll

const Q_T0 = 0.04;
const Q_LAND = Q_T0 + Q_AIR;
const Q_END = Q_LAND + 0.25;
/** Tucked into the bun, two whole turns about his long axis (the hot dog on the grill), out of it on travelEnd. */
const q: ClipDef = mk('frankie.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_T0, TUCK, null, 'out'],
  [Q_LAND, TUCK, null, 'hold'],
  [Q_LAND + 0.12, null, { chest: [-0.2, 0, 0], head: [-0.3, 0, 0] }, 'out'],
  [Q_END, null, null, 'inOut'],
], {
  root: { roll: sk([0, 0], [Q_T0, 0], [Q_LAND, 2, 'lin'], [Q_LAND + WRAP, 0, 'step'], [Q_END, 0]), up: sk([0, 0], [Q_T0, 0.05], [Q_LAND, 0.05], [Q_LAND + 0.1, 0, 'in']) },
  calm: { roll: 0 },
  markers: { takeoff: Q_T0, contact: Q_T0, land: Q_LAND, end: Q_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'fx', 'fr:roll'], ['takeoff', 'whoosh', 'M'], ['land', 'dust'], ['land', 'land']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ W Dig

const W_C = 0.06;
const W_END = W_C + 0.3;
/** A nose-first dive; the form hold below takes the body underground until he pops up. */
const w: ClipDef = mk('frankie.w', W_END, Prio.Ability, [
  [0, null, null],
  [W_C, null, merge(DIVE, { head: [0.1, 0, 0] }), 'out'],
  [W_END, null, DIVE, 'inOut'],
], {
  root: { up: sk([0, 0], [W_C * 0.5, 0.2, 'out'], [W_C + 0.12, 0, 'in'], [W_END, 0]), pitch: sk([0, 0], [W_C + 0.1, 0.08, 'in'], [W_END, 0.08]) },
  calm: { pitch: 0 },
  markers: { contact: W_C, end: W_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'dust'], ['contact', 'fx', 'fr:dive']],
  cancel: 'none',
});
/** Underground: the body shrinks to nothing (additive), fades back as he pops up. */
const dig: ClipDef = mk('frankie.dig', 1, Prio.Ult, [[0, null, null], [1, null, null]], { mode: 'additive', root: { sx: sk([0, DIG_SCALE], [1, DIG_SCALE]), sy: sk([0, DIG_SCALE], [1, DIG_SCALE]) }, blendIn: 0.14, blendOut: 0.1 });
/** The dig hold runs only while he is untargetable (the FOOTLONG flight sets the form bit too, and keeps him drawn). */
const digWhen = (ctx: MoveCtx): boolean => (ctx.buffs & BuffFlag.Untargetable) !== 0;

// ------------------------------------------------------------------------------------------------ E Bun Hop

const E_T0 = 0.04;
const E_LAND = E_T0 + E_AIR;
const E_END = E_LAND + 0.25;
/** A springy hop: tucked paws, the body stretched long in the air, a bouncy landing. */
const e: ClipDef = mk('frankie.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_T0, null, { thighL: [-0.6, 0, 0], thighR: [-0.6, 0, 0], kneeL: [1.2, 0, 0], kneeR: [1.2, 0, 0] }, 'out'],
  [(E_T0 + E_LAND) / 2, null, { chest: [0.1, 0, 0], head: [-0.4, 0, 0], shoulderL: [-1.8, 0, 0.2], shoulderR: [-1.8, 0, -0.2], thighL: [0.7, 0, 0], thighR: [0.7, 0, 0], earL: [-0.8, 0, 0], earR: [-0.8, 0, 0] }, 'out'],
  [E_LAND, null, { thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0] }, 'in'],
  [E_END, null, null, 'back'],
], {
  root: { up: sk([0, 0], [E_T0, 0], [(E_T0 + E_LAND) / 2, 0.55, 'out'], [E_LAND, 0, 'in'], [E_END, 0]), sx: sk([0, 1], [E_T0, 1.12, 'out'], [E_LAND, 1], [E_LAND + 0.05, 1.18, 'in'], [E_END, 1, 'back']), sy: sk([0, 1], [E_T0, 0.8, 'out'], [E_T0 + 0.06, 1.12, 'out'], [E_LAND, 1], [E_LAND + 0.05, 0.75, 'in'], [E_END, 1, 'back']) },
  markers: { takeoff: E_T0, contact: E_T0, land: E_LAND, end: E_END },
  warp: [['takeoff', 'cast'], ['land', 'travelEnd']],
  cues: [['takeoff', 'whoosh', 'S'], ['takeoff', 'fx', 'fr:hop'], ['land', 'land'], ['land', 'dust']],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ R FOOTLONG!

const R_HOLD = R_C + R_FLY;
const R_END = R_HOLD + 0.25;
/** Rearing back over the windup, then the long low lunge held while the stretch flies. */
const r: ClipDef = mk('frankie.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.8, null, REAR, 'out'],
  [R_C, null, LUNGE, 'expoIn'],
  [R_HOLD, null, merge(LUNGE, { chest: [0.6, 0, 0] }), 'inOut'],
  [R_END, null, null, 'inOut'],
], {
  root: { fwd: sk([0, 0], [R_C * 0.8, -0.12, 'out'], [R_C, 0.3, 'expoIn'], [R_HOLD, 0.3], [R_END, 0, 'inOut']), sy: sk([0, 1], [R_C * 0.8, 1.08, 'out'], [R_C, 0.82, 'expoIn'], [R_HOLD, 0.85], [R_END, 1, 'inOut']), sx: sk([0, 1], [R_C, 1.15, 'expoIn'], [R_HOLD, 1.12], [R_END, 1, 'inOut']) },
  markers: { coil: 0, contact: R_C, hold: R_HOLD, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['coil', 'fx', 'fr:rear'], ['contact', 'mouthOpen', '400*1.6'], ['contact', 'fx', 'fr:stretch'], ['contact', 'whoosh', 'L']],
  cancel: 'afterContact',
});
/** The grab (the `clip` event 'footlong'): a snap forward at the victim and a squash on arrival. */
const SNAP = 0.3;
const footlong: ClipDef = mk('frankie.footlong', SNAP + 0.3, Prio.Ult, [
  [0, null, LUNGE],
  [SNAP, null, merge(NIP, { chest: [0.4, 0, 0] }), 'expoIn'],
  [SNAP + 0.3, null, null, 'back'],
], {
  root: { sx: sk([0, 1.25], [SNAP, 0.85, 'expoIn'], [SNAP + 0.12, 1.08, 'back'], [SNAP + 0.3, 1]), sy: sk([0, 0.85], [SNAP, 1.15, 'expoIn'], [SNAP + 0.3, 1, 'back']) },
  markers: { contact: 0, snap: SNAP, end: SNAP + 0.3 },
  cues: [[0, 'mouthOpen', 260], [SNAP, 'land'], [SNAP, 'shake', 2]],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

/** The worried look: the head tilting a little, a slow breath. */
const idle: ClipDef = mk('frankie.idle', 2.2, Prio.Idle, [
  [0, null, null],
  [0.7, null, { head: [0.05, 0.12, 0.12] }, 'inOut'],
  [1.5, null, { head: [0.0, -0.1, -0.06] }, 'inOut'],
  [2.2, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [1.1, 1.02, 'inOut'], [2.2, 1, 'inOut']) } });

/** Fidget: the costume check: he looks back over his shoulder at the bun, then forward, worried. */
const check: ClipDef = mk('frankie.check', 1.6, Prio.Idle, [
  [0, null, null],
  [0.4, null, { head: [0.1, 1.1, 0.1], chest: [0, 0.35, 0] }, 'inOut'],
  [0.9, null, { head: [0.1, -1.0, -0.1], chest: [0, -0.3, 0] }, 'inOut'],
  [1.6, null, null, 'inOut'],
], { markers: { contact: 0.4, end: 1.6 } });

/** Victory: barking, front paws bouncing. Loops. */
const victory: ClipDef = mk('frankie.victory', 0.8, Prio.Emote, [
  [0, 'weenieBark', null],
  [0.2, 'weenieBark', BARK, 'out'],
  [0.4, 'weenieBark', null, 'inOut'],
  [0.6, 'weenieBark', BARK, 'out'],
  [0.8, 'weenieBark', null, 'inOut'],
], { root: { up: sk([0, 0], [0.2, 0.1, 'out'], [0.4, 0, 'in'], [0.6, 0.1, 'out'], [0.8, 0, 'in']) }, cues: [[0.2, 'mouthOpen', 120], [0.6, 'mouthOpen', 120]], blendIn: 0.2 });

/** Emote: the slow U-turn: the front walks a whole circle, the back end follows a beat later. */
const emote: ClipDef = mk('frankie.emote', 2.4, Prio.Emote, [
  [0, null, null],
  [0.6, null, { chest: [0, 0.7, 0], head: [0, 0.4, 0], hips: [0, -0.3, 0] }, 'inOut'],
  [1.2, null, { chest: [0, 0.5, 0], head: [0, 0.3, 0], hips: [0, -0.5, 0] }, 'inOut'],
  [1.8, null, { chest: [0, 0.2, 0], hips: [0, -0.4, 0] }, 'inOut'],
  [2.4, null, null, 'inOut'],
], { root: { yaw: sk([0, 0], [2.0, 1, 'inOut'], [2.0 + WRAP, 0, 'step'], [2.4, 0]) }, calm: { yaw: 0 }, markers: { contact: 0.6, end: 2.4 } });

/** A fast short-legged scurry: short quick steps, the body wiggling side to side. */
const gait: GaitProfile = { stride: 1.5, bounce: 0.6, lean: 0.6, hipSway: 1.8, headBob: 0.8, arms: 'pump', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'frankie',
  stub: false,
  gait,
  springs: HERO_SPRINGS.frankie,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[check, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
  clips: { footlong },
  formHold: dig,
  formHoldWhen: digWhen,
};

/** Tests and the gallery: every authored clip. */
export const FRANKIE_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, dig, e, r, footlong, idle, check, victory, emote];
