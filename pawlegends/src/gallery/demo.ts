/**
 * DEV ONLY (gallery): a demo MoveSet per hero built from the shared templates (render/anim/common.ts), so the gallery
 * and the capture show the framework's acrobatics, root motion and sim binding before a hero's own file is filled.
 * Never shipped and never used in a match: per-hero work authors the real sets in src/render/moves/<hero>.ts.
 */
import type { HeroId } from '../data/heroes/types';
import { HEROES } from '../data/heroes';
import { COMMON, DEFAULT_GAIT, HERO_SPRINGS, flip, kneelShot, leap, slam, spinSlash, swing, taunt, thrust, throwOverhand } from '../render/anim/common';
import { SIM_TIMING } from '../render/anim/timing';
import { Prio, type ClipDef, type MoveSet } from '../render/anim/types';

/** A windup-bound ult: coil over the sim windup, contact on the cast. */
function charge(id: string): ClipDef {
  return {
    id,
    len: 1.4,
    mask: 'full',
    mode: 'override',
    prio: Prio.Ult,
    keys: [
      [0, null, null],
      [0.3, null, { thighL: [-0.9, 0, 0], kneeL: [1.0, 0, 0], thighR: [0.9, 0, 0], kneeR: [1.6, 0, 0], chest: [-0.3, 0.3, 0] }, 'out'],
      [0.9, null, { thighL: [-0.9, 0, 0], kneeL: [1.0, 0, 0], thighR: [0.9, 0, 0], kneeR: [1.6, 0, 0], chest: [-0.45, 0.45, 0], head: [-0.2, 0, 0], shoulderR: [0.8, 0, -0.6] }, 'inOut'],
      [1.0, null, { chest: [0.35, -0.3, 0], shoulderR: [-1.6, 0, 0.2] }, 'expoIn'],
      [1.4, null, null, 'inOut'],
    ],
    root: { fwd: [[0, 0], [1.0, 0], [1.08, -0.3, 'expoOut'], [1.4, 0, 'inOut']], sy: [[0, 1], [0.3, 0.86, 'out'], [1.0, 0.86], [1.06, 1.08, 'expoOut'], [1.3, 1, 'inOut']] },
    markers: { coil: 0, charge: 0.5, contact: 1.0, end: 1.4 },
    warp: [['coil', 'windupStart'], ['contact', 'cast']],
    cues: [['contact', 'shake', 3], ['contact', 'punch', 0.05], ['contact', 'ghost'], ['contact', 'whoosh', 'L']],
    cancel: 'none',
  };
}

export function demoMoves(h: HeroId): MoveSet {
  const ranged = SIM_TIMING[h].ranged;
  const T = SIM_TIMING[h].slots;
  const cues = (s: string): ClipDef['cues'] => [['coil', 'trailOn', 'weapon'], ['contact', 'whoosh', s], ['contact', 'smear'], [`end`, 'trailOff']];
  const basic: ClipDef[] = ranged
    ? [throwOverhand({ id: `${h}.basicA`, follow: 0.3 }), kneelShot({ id: `${h}.basicB`, recoil: 0.15 }), throwOverhand({ id: `${h}.basicC`, follow: 0.9 })]
    : [swing({ id: `${h}.basicA`, side: 1, cues: cues('S') }), swing({ id: `${h}.basicB`, side: -1, cues: cues('S') }), slam({ id: `${h}.basicC`, contact: 8 / 30, hop: 0.25, cues: cues('M') })];
  const eDash = T.e.dashMm > 0;
  const e = eDash
    ? h === 'sage'
      ? flip({ id: `${h}.e`, dir: -1, apex: 1.1 })
      : h === 'bengas' || h === 'gabe'
        ? leap({ id: `${h}.e`, apex: 0.7 })
        : flip({ id: `${h}.e`, dir: 1, apex: 0.8 })
    : taunt({ id: `${h}.e`, prio: Prio.Ability, anchor: 'cast' });
  const q = T.q.dashMm > 0 ? flip({ id: `${h}.q`, dir: 1, apex: 0.4, turns: 1 }) : spinSlash({ id: `${h}.q`, prio: Prio.Ability, anchor: 'cast', contact: 0.06, cues: [['contact', 'ghost'], ['contact', 'whoosh', 'M'], ['contact', 'trailOn', 'weapon'], [0.35, 'trailOff']] });
  const w = thrust({ id: `${h}.w`, prio: Prio.Ability, anchor: 'cast', contact: 0.06 });
  const r = T.r.windup > 0 ? charge(`${h}.r`) : T.r.dashMm > 0 || h === 'cacklejaw' ? leap({ id: `${h}.r`, apex: 0.8, prio: Prio.Ult, land: h === 'cacklejaw' ? 'homingEnd' : 'travelEnd' }) : spinSlash({ id: `${h}.r`, prio: Prio.Ult, anchor: 'cast', contact: 0.08, turns: 1, hop: 0.35, cues: [['contact', 'shake', 3], ['contact', 'ghost'], ['contact', 'whoosh', 'L']] });
  return {
    hero: h,
    stub: false,
    gait: DEFAULT_GAIT,
    springs: HERO_SPRINGS[h],
    basic,
    slots: { q: { cast: q }, w: { cast: w }, e: { cast: e }, r: { cast: r } },
    idle: COMMON.levelFlex,
    fidgets: [],
    victory: COMMON.levelFlex,
    emote: COMMON.levelFlex,
    death: COMMON.death,
    respawn: COMMON.respawn,
    levelUp: COMMON.levelFlex,
  };
}

export const HERO_LABEL = (h: HeroId): string => HEROES[h].name;
