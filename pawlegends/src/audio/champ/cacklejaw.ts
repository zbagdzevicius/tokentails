/**
 * Cacklejaw: Cackling shadow: lime grin crescents and "hee hee". Timbre: kazoo cackle (buzzy saw with tremolo).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every Q/E cast adds one kazoo "hee" (the motif); Gloat (W) swaps it for a "hee-hee-hee" kazoo cackle (in
 * place of the stand-in hyena laugh); the Pack Hunt maul cackles the same, lower (skillfx/cacklejaw.ts). Pack Hunt's
 * cast is the repeating kazoo cackle (IDENTITY ult voice).
 *
 * Look: a lime grin: a toothy smile curve of acid-lime dots that hangs a beat in a puff of plum shadow. Bush Slink (E)
 * paints only the shadow puff here: the grin he leaves behind is drawn by the script for his own team only.
 * Colour pair #3A2A5A shadow plum / #B8F040 acid lime.
 */
import type { SkillKey } from '../../data/identity';
import { screenRightXZ } from '../../render/coords';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: only the light render/coords helper is imported here). */
const FADE_HOLD = 2;

/** Cacklejaw's own sounds, baked as `c:cacklejaw:<name>`. */
export const CACKLEJAW_SOUNDS = Object.freeze({
  /** "Hee-hee-hee": a buzzy kazoo syllable repeated every 70 ms with a wobble (0.31 s). */
  hee: [0.3, 0, 900, 0.005, 0.2, 0.08, 2, 1, 2, 0, 0, 0, 0.07, 0.3, 10, 0, 0, 0.75, 0.02, 0.6, -2800],
});

const _p: P3 = { x: 0, y: 0, z: 0 };
const _r = { x: 1, z: 0 };

/** A grin: `k` lime dots along a smile curve in the camera-facing plane (screen-right × up) at (x, y, z). */
function grinDots(p: MotifPainter, x: number, y: number, z: number, k: number, w: number, color: number, life: number, size: number): void {
  const r = screenRightXZ(_r);
  for (let i = 0; i < k; i++) {
    const t = k === 1 ? 0 : (i / (k - 1)) * 2 - 1;
    _p.x = x + t * w * r.x;
    // the smile: the ends curl up
    _p.y = y + t * t * w * 0.45;
    _p.z = z + t * w * r.z;
    p.single(_p, { shape: p.shape.SOFT, color, size0: size, size1: size * 0.8, life, fade: FADE_HOLD, intensity: 1.5 });
  }
}

function paint(p: MotifPainter, pos: P3, n: number, _dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  const { primary, secondary } = p.colors;
  // the shadow puff (normal blend: the dark plum stays visible on grass); a small budget (a basic's 2) is all grin
  const smoke = skill === 'e' ? n : n < 4 ? 0 : Math.max(1, Math.round(n * 0.35));
  _p.x = pos.x;
  _p.y = pos.y + 0.9;
  _p.z = pos.z;
  if (smoke > 0) p.burst(_p, { n: smoke, exact: true, shape: p.shape.SOFT, color: primary, additive: false, size: [0.3, 0.45], life: [0.35, 0.5], speed: [0.3, 0.8], up: 0.3, gravity: 0, alpha: 0.8 });
  if (skill === 'e') return true;
  const big = skill === 'r';
  // a grin needs 3 dots to read: at most one over a basic's 2-sprite budget
  grinDots(p, pos.x, pos.y + (big ? 2.0 : 1.2), pos.z, Math.max(3, n - smoke), big ? 0.5 : 0.32, secondary, big ? 0.7 : 0.45, big ? 0.16 : 0.12);
  return true;
}

export const cacklejaw: ChampAudio = {
  hero: 'cacklejaw',
  /** One kazoo "hee": a short buzzy saw syllable that bends up, low-passed (0.12 s). */
  motif: [0.28, 0, 820, 0.005, 0.04, 0.05, 2, 1, 3, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.75, 0.02, 0.5, -2600],
  motifRate: { q: 1, w: 1.12, e: 0.85, passive: 0.9 },
  sounds: CACKLEJAW_SOUNDS,
  skills: {
    // Gloat: the kazoo cackle is the laugh
    w: { cast: { sound: 'hee', vol: 0.3 } },
  },
  fx: { motifCount: 7, paint },
};
