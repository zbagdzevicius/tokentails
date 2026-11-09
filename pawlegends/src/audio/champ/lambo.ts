/**
 * Lambo: Cuddly tank: twinkling string lights and tuna. Timbre: music box (high sine with echo).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every Q/W/E cast plucks two music-box tines (a triangle tine and the fifth above, with an echo). The Tuna Toss
 * hit adds a tin-can clank under the splash; a Big Hug on a friend and each hero Tangled Lights lassoes blink a bulb
 * "tink"; the Belly Flop landing runs a falling cascade of tines round the ring. The ult and basic voices stay the
 * IDENTITY music box.
 * Look: a short string of amber bulbs on a grey cord, the bulbs twinkling; around him on casts, out along the aim on
 * Tuna Toss.
 */
import type { SkillKey } from '../../render/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: audio/champ never imports three.js). */
const FADE_HOLD = 2;
const FADE_TWINKLE = 3;
const _p = { x: 0, y: 0, z: 0 };

/** A string of lights: bulbs on a loose arc (or along the aim), each a twinkling amber glow on a small grey cord dot. */
function paint(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  const bulbs = Math.max(1, Math.ceil(n * 0.65));
  const line = !!dir && skill === 'q';
  const l = dir ? Math.hypot(dir.x, dir.z) || 1 : 1;
  for (let i = 0; i < bulbs; i++) {
    const t = bulbs === 1 ? 0.5 : i / (bulbs - 1);
    if (line && dir) {
      _p.x = pos.x + (dir.x / l) * (0.6 + t * 2.2);
      _p.z = pos.z + (dir.z / l) * (0.6 + t * 2.2);
      _p.y = pos.y + 1.0 - Math.sin(t * Math.PI) * 0.25;
    } else {
      const a = t * Math.PI * 1.6 + 0.4;
      _p.x = pos.x + Math.cos(a) * 0.9;
      _p.z = pos.z + Math.sin(a) * 0.9;
      _p.y = pos.y + 1.4 - Math.sin(t * Math.PI) * 0.3;
    }
    p.single(_p, { shape: p.shape.SOFT, color: p.colors.secondary, additive: true, intensity: 1.8, size0: 0.3, size1: 0.18, life: 0.55 + (i % 3) * 0.12, fade: FADE_TWINKLE });
    if (i < n - bulbs) p.single(_p, { shape: p.shape.SOFT, color: p.colors.primary, size0: 0.1, size1: 0.08, life: 0.5, fade: FADE_HOLD });
  }
  return true;
}

export const lambo: ChampAudio = {
  hero: 'lambo',
  // music box: a triangle tine, the fifth above 50 ms later, an echo
  motif: [0.26, 0, 1047, 0.001, 0.03, 0.17, 1, 1, 0, 0, 523, 0.05, 0, 0, 0, 0, 0.06, 0.55, 0.02, 0, 0],
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 0.89 },
  sounds: {
    // one bulb blinking on: a tiny high tine
    tink: [0.25, 0, 2093, 0, 0.01, 0.1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.5, 0.01, 0, 0],
    // the tuna can: a short tin clank
    can: [0.3, 0, 620, 0, 0.01, 0.12, 3, 1, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.5, 0.01, 0, 0],
    // the ring of bulbs: tines retriggered every 40 ms, stepping down
    bulbRing: [0.28, 0, 1568, 0.001, 0.02, 0.2, 1, 1, 0, 0, -262, 0.04, 0.04, 0, 0, 0, 0.05, 0.5, 0.02, 0, 0],
  },
  skills: {
    q: { impact: { sound: 'can' } },
    w: { impact: { sound: 'tink', rate: 0.75 } },
    e: { impact: { sound: 'bulbRing' } },
    r: { impact: { sound: 'tink', rate: 1.25 } },
  },
  fx: { paint },
};
