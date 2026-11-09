/**
 * Sage: Moon archer: feathers and crescent moons. Timbre: wooden flute (sine with vibrato).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: one breathy flute note with vibrato, climbing a minor third and a fifth over Q, W and E; W Sun Snare also
 * sets with a low flute (own team only: the trap is hidden) and springs with a falling two-note "moon closes"; R
 * Moonshot is her rising flute ult voice over the arcane shimmer. Basics: a short flute chirp.
 * Look: mint arrow feathers that drift down slowly, rocking (gravity almost off), with a moon-white glint; the skill
 * FX script (render/skillfx/sage.ts) adds the feather tails of the volley, the crescent moon on the trap and the
 * crescents edging the moonbeam.
 */
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE.HOLD / TWINKLE (kept numeric: this file stays free of render imports). */
const HOLD = 2;
const TWINKLE = 3;

function paint(p: MotifPainter, pos: P3, n: number): boolean {
  const { primary, secondary } = p.colors;
  const glints = n >= 4 ? 1 : 0;
  // feathers puffed up that drift down slowly, rocking
  p.burst({ x: pos.x, y: pos.y + 0.9, z: pos.z }, { n: n - glints, exact: true, shape: p.shape.FEATHER, color: primary, size: [0.26, 0.36], life: [0.8, 1.1], speed: [0.6, 1.4], up: 1.2, gravity: 0.6, drag: 2.2, spin: 2.5, jitter: 0.2, fade: HOLD });
  if (glints) p.burst({ x: pos.x, y: pos.y + 1.1, z: pos.z }, { n: glints, exact: true, additive: true, shape: p.shape.STAR4, color: secondary, intensity: 1.4, size: [0.2, 0.26], life: [0.4, 0.5], speed: [0.2, 0.4], fade: TWINKLE });
  return true;
}

export const sage: ChampAudio = {
  hero: 'sage',
  // a breathy flute note with vibrato
  motif: [0.26, 0, 880, 0.02, 0.06, 0.1, 0, 1, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0.8, 0.02, 0.08, 0],
  motifRate: { q: 1, w: 1.19, e: 1.5, passive: 0.89 },
  sounds: {
    // Sun Snare arms (own team only): a low flute note that settles down
    moonSet: [0.22, 0, 523, 0.02, 0.05, 0.12, 0, 1, 0, 0, -131, 0.06, 0, 0, 5, 0, 0.05, 0.8, 0.02, 0, 0],
    // Sun Snare springs: two falling flute notes, the moon closing
    moonClose: [0.28, 0, 784, 0.005, 0.04, 0.12, 0, 1, 0, 0, -196, 0.05, 0, 0, 6, 0, 0.04, 0.8, 0.02, 0, 0],
  },
  fx: { paint },
};
