/**
 * Marshmallow: Snow puppy: marshmallow snow puffs and flakes. Timbre: sleigh bells (shimmering high sine).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every Q/W/E cast shakes sleigh bells (a high sine retriggered every 25 ms with vibrato and tremolo). The
 * Snowball carries the frost travel shimmer while it flies and lands with her snow "poof" on top of the frost crunch.
 * A cat frozen by SNOW DAY! rings a long sleigh-bell chord on top of the frost impact. R's voice is the IDENTITY
 * alias `marshAwoo` (the script no longer plays a second copy).
 * Look: round white snow puffs (normal blend, so they read on bright grass) with ice-blue six-point flakes twinkling;
 * on SNOW DAY! the puffs fall from above.
 */
import type { SkillKey } from '../../data/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: audio/champ never imports three.js). */
const FADE_HOLD = 2;
const FADE_TWINKLE = 3;
const _p = { x: 0, y: 0, z: 0 };

function paint(p: MotifPainter, pos: P3, n: number, _dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  const fall = skill === 'r';
  _p.x = pos.x;
  _p.y = pos.y + (fall ? 2.6 : 0.6);
  _p.z = pos.z;
  const puffs = Math.max(1, Math.ceil(n * 0.55));
  p.burst(_p, { n: puffs, exact: true, shape: p.shape.PUFF, color: p.colors.primary, size: [0.28, 0.42], sizeEnd: 1.3, life: [0.55, 0.8], speed: [0.8, 1.8], up: fall ? -0.6 : 1.4, gravity: fall ? 1.2 : 2.2, jitter: fall ? 1.2 : 0.2, fade: FADE_HOLD, drag: 1.2 });
  if (n - puffs > 0)
    p.burst(_p, { n: n - puffs, exact: true, additive: true, shape: p.shape.STAR8, color: p.colors.secondary, intensity: 1.4, size: [0.14, 0.22], life: [0.6, 0.9], speed: [0.6, 1.6], up: fall ? -0.4 : 1.0, gravity: 0.8, spin: 2.5, jitter: fall ? 1.2 : 0.3, fade: FADE_TWINKLE });
  return true;
}

export const marshmallow: ChampAudio = {
  hero: 'marshmallow',
  // sleigh bells: a high sine retriggered every 25 ms, vibrato and tremolo
  motif: [0.24, 0, 2217, 0.002, 0.05, 0.18, 0, 1, 0, 0, 0, 0, 0.025, 0, 60, 0, 0, 0.6, 0.02, 0.5, 0],
  motifRate: { q: 1, w: 0.89, e: 1.12, passive: 1.26 },
  sounds: {
    // frozen: a long sleigh-bell chord with an echo
    freeze: [0.3, 0, 1760, 0.005, 0.08, 0.3, 0, 1, 0, 0, 0, 0, 0.04, 0, 30, 0, 0.05, 0.6, 0.03, 0.6, 0],
  },
  skills: {
    q: { impact: { sound: 'marshPoof' } },
    r: { impact: { sound: 'freeze' } },
  },
  fx: { paint },
};
