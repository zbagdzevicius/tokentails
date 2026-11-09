/**
 * Howler: Loud husky: echo rings and "AWOO" letters. Timbre: synth howl (sliding sine).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: Q AWOO plays the sonic blast with his own "awoo" howl on top (`howlerAwoo`, moved here from the skill FX
 * script). W Derp Dash plays the synth-howl motif (a sine sliding up with vibrato, pitched high). E Talk Back plays
 * the guard shimmer with his "woo-woo" grumble (`howlerArgue`, also moved here). R THE SCREAM is the ult voice alias
 * `howlerScream` (the script no longer plays a second copy). Every AWOO and SCREAM hit rings a short echo ping that
 * repeats.
 * Look: slate-blue echo rings expanding out of him with mint glints; on the sonic skills they ripple forward.
 */
import type { SkillKey } from '../../data/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: audio/champ never imports three.js). */
const FADE_TWINKLE = 3;
const FADE_IN_OUT = 4;
const _p = { x: 0, y: 0, z: 0 };

/** Echo rings: n/2 rings growing one after another (pushed along the aim on the sonic skills), mint glints between. */
function paint(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  const rings = Math.max(1, Math.min(4, n >> 1));
  const push = dir && (skill === 'q' || skill === 'r') ? 0.7 : 0;
  const l = dir ? Math.hypot(dir.x, dir.z) || 1 : 1;
  for (let i = 0; i < rings; i++) {
    _p.x = pos.x + (dir ? (dir.x / l) * push * i : 0);
    _p.y = pos.y + 1.0;
    _p.z = pos.z + (dir ? (dir.z / l) * push * i : 0);
    p.single(_p, { shape: p.shape.RING, color: p.colors.primary, intensity: 1.2, size0: 0.4 + i * 0.35, size1: 1.4 + i * 0.6, life: 0.32 + i * 0.07, alpha: 0.85 - i * 0.15, fade: FADE_IN_OUT });
  }
  if (n - rings > 0) {
    _p.x = pos.x;
    _p.y = pos.y + 1.0;
    _p.z = pos.z;
    p.burst(_p, { n: n - rings, exact: true, additive: true, shape: p.shape.SPARK, color: p.colors.secondary, intensity: 1.4, size: [0.1, 0.16], life: [0.25, 0.4], speed: [2, 3.5], fade: FADE_TWINKLE });
  }
  return true;
}

export const howler: ChampAudio = {
  hero: 'howler',
  // synth "woo": a sine sliding up with vibrato
  motif: [0.28, 0, 380, 0.02, 0.06, 0.12, 0, 1, 4, 0, 0, 0, 0, 0, 5, 0, 0, 0.7, 0.03, 0.1, 0],
  motifRate: { q: 1, w: 1.26, e: 0.84, passive: 1.12 },
  sounds: {
    // the echo of a howl: a short falling ping with a delay tail
    echo: [0.25, 0, 520, 0.005, 0.02, 0.12, 0, 1, -2, 0, 0, 0, 0, 0, 0, 0, 0.08, 0.6, 0.02, 0, 0],
  },
  skills: {
    q: { cast: { sound: 'howlerAwoo' }, impact: { sound: 'echo' } },
    e: { cast: { sound: 'howlerArgue' } },
    r: { impact: { sound: 'echo', rate: 0.8 } },
  },
  fx: { paint },
};
