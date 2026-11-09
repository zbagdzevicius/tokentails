/**
 * Stilts: Savannah sprinter: long paw-print tracks. Timbre: bongo slap (tan-wave drum).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: a bongo slap on every skill. Q High Leap the low drum (and a deep bongo thump on the landing), W Ear Swivel
 * the high drum, E Swat-Swat left drum then right drum (the second on the clip's second swat), R Zoomies her bongo
 * roll ult voice over the power-up; a pounce basic is a double slap. Basics: a bongo tap.
 * Look: long terracotta paw prints stamped flat in a left-right track behind her, with a cream dust flick; the skill
 * FX script (render/skillfx/stilts.ts) adds the big print on the landing, the sonar ring of prints, the left-then-
 * right swat prints and the glowing Zoomies track.
 */
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE.HOLD (kept numeric: this file stays free of render imports). */
const HOLD = 2;

function paint(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null): boolean {
  const { primary, secondary } = p.colors;
  const fx = dir ? dir.x : 1;
  const fz = dir ? dir.z : 0;
  const prints = n > 1 ? n - 1 : 1;
  // a short left-right track of long paw prints stamped flat behind the point, then a dust flick
  for (let i = 0; i < prints; i++) {
    const side = i & 1 ? 1 : -1;
    const back = 0.35 + i * 0.32;
    p.single(
      { x: pos.x - fx * back - fz * 0.16 * side, y: pos.y + 0.12, z: pos.z - fz * back + fx * 0.16 * side },
      { shape: p.shape.PAW, color: primary, additive: false, size0: 0.36, size1: 0.36, life: 0.7, rot: Math.atan2(fz, fx), spin: 0, fade: HOLD },
    );
  }
  if (n > 1) p.burst({ x: pos.x, y: pos.y + 0.2, z: pos.z }, { n: 1, exact: true, shape: p.shape.PUFF, color: secondary, size: [0.3, 0.36], life: [0.35, 0.4], speed: [0.6, 1], up: 0.6, gravity: 1, fade: HOLD });
  return true;
}

export const stilts: ChampAudio = {
  hero: 'stilts',
  // a bongo slap: a tan-wave hit with a quick downward bend and a breath of skin noise
  motif: [0.3, 0, 300, 0, 0.015, 0.07, 3, 1, -5, 0, 0, 0, 0, 0.08, 0, 0, 0, 0.6, 0.01, 0, 0],
  motifRate: { q: 0.8, w: 1.25, e: 1, passive: 1.12 },
  sounds: {
    // a pounce basic: a quick double slap
    pounce: [0.3, 0, 260, 0, 0.015, 0.06, 3, 1, -5, 0, 90, 0.04, 0.07, 0.1, 0, 0, 0, 0.6, 0.01, 0, 0],
    // High Leap lands: a deep bongo thump
    land: [0.3, 0, 150, 0, 0.03, 0.12, 3, 1, -3, 0, 0, 0, 0, 0.15, 0, 0, 0, 0.6, 0.02, 0, 0],
  },
  fx: { paint },
};
