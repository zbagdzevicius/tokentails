/**
 * Bravo: Drama pug: spotlights, tears and bows. Timbre: brass trumpet (saw fanfare).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every Q/W/E cast adds one trumpet "ta" (the motif), stepping up a major arpeggio Q → W → E, so three casts in
 * a row play a little fanfare; Center Stage (W) adds his `bravoBow` flourish through the identity mix (it was a direct
 * play); ENCORE! is the `bravoBow` fanfare (IDENTITY ult voice, no second copy from the script); Stage Dive's landing
 * plays the impact nature's landing thud (skillfx/bravo.ts), not a stand-in pop.
 *
 * Look: a cream spotlight blink from above with violet stage sparkle; Crocodile Tears and the flop shed aqua tears;
 * ENCORE! throws violet and cream confetti. Colour pair #B07CFF stage violet / #FFF4DC spotlight.
 */
import type { SkillKey } from '../../data/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: this data file carries no render import). */
const FADE_HOLD = 2;
const FADE_TWINKLE = 3;
/** The tear blue (skillfx/bravo.ts TEAR). */
export const BRAVO_TEAR = 0x8fd8ff;

/** Bravo's own sounds, baked as `c:bravo:<name>`. */
export const BRAVO_SOUNDS = Object.freeze({
  /** A two-note trumpet "ta-da" for the Stage Dive landing and a charmed hero's spotlight (0.27 s). */
  tada: [0.3, 0, 523, 0.008, 0.08, 0.12, 2, 1, 0, 0, 262, 0.07, 0, 0, 0, 0, 0, 0.75, 0.03, 0, -2800],
});

const _p: P3 = { x: 0, y: 0, z: 0 };

/** A spotlight blink from above, then tears (Q, passive), confetti (R) or violet stage sparkle (the rest). */
function paint(p: MotifPainter, pos: P3, n: number, _dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  const { primary, secondary } = p.colors;
  // the spotlight: a soft cream disc a body above the point that blooms and fades (one sprite)
  _p.x = pos.x;
  _p.y = pos.y + 1.5;
  _p.z = pos.z;
  p.single(_p, { shape: p.shape.SOFT, color: secondary, size0: 0.9, size1: 1.4, life: 0.28, intensity: 1.2, alpha: 0.7 });
  const k = Math.max(1, n - 1);
  _p.y = pos.y + 1.0;
  if (skill === 'q' || skill === 'passive') {
    p.burst(_p, { n: k, exact: true, shape: p.shape.DROPLET, color: BRAVO_TEAR, additive: false, size: [0.14, 0.22], life: [0.45, 0.65], speed: [1.2, 2.2], up: 1.6, gravity: 10, fade: FADE_HOLD });
    return true;
  }
  if (skill === 'r') {
    const half = Math.max(1, k >> 1);
    p.burst(_p, { n: half, exact: true, shape: p.shape.CONFETTI, color: primary, additive: false, size: [0.14, 0.2], life: [0.8, 1.1], speed: [1.5, 3], up: 2.4, gravity: 3, spin: 6, fade: FADE_HOLD });
    if (k - half > 0)
      p.burst(_p, { n: k - half, exact: true, shape: p.shape.CONFETTI, color: secondary, additive: false, size: [0.14, 0.2], life: [0.8, 1.1], speed: [1.5, 3], up: 2.4, gravity: 3, spin: 6, fade: FADE_HOLD });
    return true;
  }
  p.burst(_p, { n: k, exact: true, shape: p.shape.STAR4, color: primary, additive: true, intensity: 1.4, size: [0.14, 0.22], life: [0.35, 0.55], speed: [0.8, 1.6], up: 0.6, gravity: 0, fade: FADE_TWINKLE });
  return true;
}

export const bravo: ChampAudio = {
  hero: 'bravo',
  /** One trumpet "ta": a saw note with a quick bloom, low-passed so it reads brass, not buzz (0.15 s). */
  motif: [0.28, 0, 523, 0.008, 0.05, 0.07, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.75, 0.02, 0, -2600],
  // C → E → G: three casts play a fanfare
  motifRate: { q: 1, w: 1.26, e: 1.5, passive: 0.9 },
  sounds: BRAVO_SOUNDS,
  skills: {
    // Center Stage: his bow flourish (an existing PL_SFX voice) through the mix, a little higher
    w: { cast: { sound: 'bravoBow', rate: 1.3, vol: 0.3 } },
  },
  fx: { motifCount: 6, paint },
};
