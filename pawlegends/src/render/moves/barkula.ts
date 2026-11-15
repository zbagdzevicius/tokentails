/**
 * Barkula's move set (sim v31; build spec docs/plans/moba/ROSTER-V31.md §2.3 "Moves and VFX").
 *
 * A caped Doberman count.
 * - basics (ranged, release on the 8 t windup): A a cape flourish that flings a little bat, B a pointed claw;
 * - Q Bat Bite: an arm thrust out, the bat flies from under the cape;
 * - W Bat Swarm: the cape thrown open, arms wide (the bats are skill FX);
 * - E Mist Form: he wraps the cape round himself and sinks (the fade is skill FX on the snapshot's Channel bit);
 * - R RED MOON (signature): arms raised to the sky over the 12 t windup (windupStart → cast), then the cape swept
 *   round; the pop (`clip` event 'bitten', on each victim) is skill FX;
 * - idle: a slow proud breath; fidget: a bow; victory: a laugh with the cape spread; emote: the count's bow.
 */
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, BASIC_CONTACT } from '../anim/common';
import { SIM_TIMING, TICK_S } from '../anim/timing';
import { Prio, type ClipDef, type GaitProfile, type MoveCtx, type MoveSet } from '../anim/types';
import { merge, mk, sk, type D } from './dogKit';
import { HEROES } from '../../data/heroes';

const C = BASIC_CONTACT;
const T = SIM_TIMING.barkula;
const R_C = T.slots.r.windup * TICK_S;

const FLOURISH_COIL: D = { chest: [-0.1, 0.4, 0], shoulderL: [-1.6, 0, 1.0], elbowL: [-0.4, 0, 0] };
const FLOURISH: D = { chest: [0.15, -0.35, 0], shoulderL: [-1.3, 0, 0.1], elbowL: [0, 0, 0] };
const CLAW_COIL: D = { chest: [-0.1, -0.3, 0], shoulderR: [-2.2, 0, -0.5], elbowR: [-1.2, 0, 0] };
const CLAW: D = { chest: [0.2, 0.25, 0], shoulderR: [-1.4, 0, -0.1], elbowR: [-0.2, 0, 0] };
const THRUST: D = { chest: [0.25, -0.2, 0], shoulderR: [-1.55, 0, 0], elbowR: [0, 0, 0] };
const WIDE: D = { chest: [-0.2, 0, 0], head: [-0.3, 0, 0], shoulderL: [-1.5, 0, 1.3], shoulderR: [-1.5, 0, -1.3], elbowL: [0, 0, 0], elbowR: [0, 0, 0] };
const WRAP_UP: D = { chest: [0.3, 0, 0], head: [0.3, 0, 0], shoulderL: [-1.2, 0, -0.6], shoulderR: [-1.2, 0, 0.6], elbowL: [-1.6, 0, 0], elbowR: [-1.6, 0, 0] };
const RAISE: D = { chest: [-0.35, 0, 0], head: [-0.5, 0, 0], shoulderL: [-3.0, 0, 0.5], shoulderR: [-3.0, 0, -0.5], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] };
const SWEEP: D = { chest: [0.2, 0.6, 0], shoulderL: [-1.5, 0, 1.2], shoulderR: [-1.0, 0, -0.4], elbowL: [0, 0, 0] };
const BOW: D = { chest: [0.6, 0, 0], head: [0.3, 0, 0], shoulderR: [-1.0, 0.5, -0.3], elbowR: [-1.6, 0, 0], shoulderL: [0.3, 0, 0.8] };

// ------------------------------------------------------------------------------------------------ basics

const swing = (id: string, coil: D, hit: D): ClipDef =>
  mk(id, C + 0.26, Prio.Basic, [
    [0, null, null],
    [C * 0.6, null, coil, 'out'],
    [C, null, hit, 'expoIn'],
    [C + 0.26, null, null, 'inOut'],
  ], {
    mask: 'upper',
    markers: { coil: C * 0.6, contact: C, end: C + 0.26 },
    warp: [['contact', 'release']],
    cues: [['contact', 'whoosh', 'S']],
    cancel: 'afterContact',
  });
const basicA = swing('barkula.basicA', FLOURISH_COIL, FLOURISH);
const basicB = swing('barkula.basicB', CLAW_COIL, CLAW);
const BASICS: readonly ClipDef[] = [basicA, basicB];
const basicPick = (ctx: MoveCtx): ClipDef | null => BASICS[ctx.comboIndex % BASICS.length];

// ------------------------------------------------------------------------------------------------ Q Bat Bite

const Q_C = 0.1;
const Q_END = Q_C + 0.34;
const q: ClipDef = mk('barkula.q', Q_END, Prio.Ability, [
  [0, null, null],
  [Q_C * 0.6, null, CLAW_COIL, 'out'],
  [Q_C, null, THRUST, 'expoIn'],
  [Q_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { contact: Q_C, end: Q_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'M']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ W Bat Swarm

const W_C = 0.12;
const W_END = W_C + 0.5;
const w: ClipDef = mk('barkula.w', W_END, Prio.Ability, [
  [0, null, null],
  [W_C, null, WIDE, 'out'],
  [W_C + 0.3, null, WIDE, 'hold'],
  [W_END, null, null, 'inOut'],
], {
  mask: 'upper',
  markers: { contact: W_C, end: W_END },
  warp: [['contact', 'cast']],
  cues: [['contact', 'whoosh', 'L']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ E Mist Form

const E_C = 0.06;
const E_DUR = (HEROES.barkula.abilities.e.untargetable ?? 18) * TICK_S;
const E_END = E_C + Math.max(E_DUR, 0.4) + 0.15;
const e: ClipDef = mk('barkula.e', E_END, Prio.Ability, [
  [0, null, null],
  [E_C, null, WRAP_UP, 'out'],
  [E_END - 0.15, null, WRAP_UP, 'hold'],
  [E_END, null, null, 'inOut'],
], {
  root: { sy: sk([0, 1], [E_C, 0.9, 'out'], [E_END - 0.15, 0.9], [E_END, 1, 'inOut']) },
  markers: { contact: E_C, end: E_END },
  warp: [['contact', 'cast']],
  cancel: 'afterContact',
});

// ------------------------------------------------------------------------------------------------ R RED MOON

const R_END = R_C + 0.7;
const r: ClipDef = mk('barkula.r', R_END, Prio.Ult, [
  [0, null, null],
  [R_C * 0.8, null, RAISE, 'out'],
  [R_C - 0.02, null, RAISE, 'hold'],
  [R_C + 0.15, null, SWEEP, 'expoIn'],
  [R_C + 0.45, null, SWEEP, 'hold'],
  [R_END, null, null, 'inOut'],
], {
  root: { up: sk([0, 0], [R_C, 0.08, 'out'], [R_C + 0.15, 0, 'in'], [R_END, 0]) },
  markers: { coil: 0, contact: R_C, end: R_END },
  warp: [['coil', 'windupStart'], ['contact', 'cast']],
  cues: [['contact', 'whoosh', 'L'], ['contact', 'mouthOpen', 300]],
  cancel: 'none',
});

// ------------------------------------------------------------------------------------------------ idle / emotes

const idle: ClipDef = mk('barkula.idle', 3.0, Prio.Idle, [
  [0, null, null],
  [1.5, null, { chest: [-0.06, 0, 0], head: [-0.08, 0, 0] }, 'inOut'],
  [3.0, null, null, 'inOut'],
], { root: { sy: sk([0, 1], [1.5, 1.03, 'inOut'], [3.0, 1, 'inOut']) } });

const bow: ClipDef = mk('barkula.bow', 1.4, Prio.Idle, [
  [0, null, null],
  [0.4, null, BOW, 'out'],
  [0.9, null, BOW, 'hold'],
  [1.4, null, null, 'inOut'],
], { markers: { contact: 0.4, end: 1.4 } });

const victory: ClipDef = mk('barkula.victory', 1.0, Prio.Emote, [
  [0, null, WIDE],
  [0.5, null, merge(WIDE, { head: [-0.55, 0, 0] }), 'inOut'],
  [1.0, null, WIDE, 'inOut'],
], { cues: [[0.1, 'mouthOpen', 600]], blendIn: 0.2 });

const emote: ClipDef = mk('barkula.emote', 1.8, Prio.Emote, [
  [0, null, null],
  [0.5, null, BOW, 'out'],
  [1.3, null, BOW, 'hold'],
  [1.8, null, null, 'inOut'],
], { markers: { contact: 0.5, end: 1.8 } });

const gait: GaitProfile = { stride: 1.2, bounce: 0.7, lean: 0.4, hipSway: 0.6, headBob: 0.5, arms: 'hold', variants: DEFAULT_GAIT.variants };

export const MOVES: MoveSet = {
  hero: 'barkula',
  stub: false,
  gait,
  springs: HERO_SPRINGS.barkula,
  basic: BASICS,
  basicPick,
  slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
  idle,
  fidgets: [[bow, 1]],
  victory,
  emote,
  death: COMMON.death,
  respawn: COMMON.respawn,
  levelUp: COMMON.levelFlex,
};

/** Tests and the gallery: every authored clip. */
export const BARKULA_CLIPS: readonly ClipDef[] = [basicA, basicB, q, w, e, r, idle, bow, victory, emote];
