/**
 * Nugget: Good-boy corgi: frisbees and bone treats. Timbre: rubber squeak and double bork.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every skill rides on a rubber-toy squeak. Q Frisbee whirrs as it leaves (a wobbling triangle), W Best Friend
 * is a double squeak ("pal!"), E Sploot the motif squeak a step higher over the heal chime, R Herding Time the bork
 * (his ult voice, nuggetBork). Basics: the squeak (nuggetSqueak).
 * Look: a pink frisbee ring spinning off along the aim and orange bone treats arcing up and bouncing; the skill FX
 * script (render/skillfx/nugget.ts) adds the frisbee ring shield, the treat fountain and the bone glyphs on the bark.
 */
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE.HOLD (kept numeric: this file stays free of render imports). */
const HOLD = 2;

function paint(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null): boolean {
  const { primary, secondary } = p.colors;
  // one frisbee ring sailing along the aim (or straight up), spinning and opening
  const vx = dir ? dir.x * 3.2 : 0;
  const vz = dir ? dir.z * 3.2 : 0;
  p.single({ x: pos.x, y: pos.y + 0.7, z: pos.z }, { shape: p.shape.RING, color: secondary, additive: false, size0: 0.32, size1: 0.5, life: 0.45, vx, vy: dir ? 0.6 : 1.6, vz, spin: 9, fade: HOLD });
  // the rest are bone treats tossed up, bouncing once on the ground
  if (n > 1)
    p.burst({ x: pos.x, y: pos.y + 0.6, z: pos.z }, { n: n - 1, exact: true, shape: p.shape.BONE, color: primary, size: [0.22, 0.3], life: [0.55, 0.8], speed: [1.2, 2.2], up: 2.6, gravity: 7, spin: 5, floor: true, bounce: 0.4, fade: HOLD });
  return true;
}

export const nugget: ChampAudio = {
  hero: 'nugget',
  // a short rubber-toy squeak (rising, wobbling)
  motif: [0.28, 0, 1300, 0.005, 0.03, 0.06, 1, 1.4, 7, 0, 260, 0.025, 0, 0, 8, 0, 0, 0.85, 0.02, 0, 0],
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 0.9 },
  sounds: {
    // Frisbee: a wobbling whirr as the disc leaves his mouth
    discToss: [0.3, 0, 600, 0.01, 0.12, 0.1, 1, 1, 3, 0, 0, 0, 0.04, 0.1, 0, 0, 0, 0.7, 0.02, 0.5, 0],
    // Best Friend: a double squeak, "pal!"
    pal: [0.28, 0, 1100, 0.005, 0.03, 0.05, 1, 1.4, 5, 0, 300, 0.03, 0.09, 0, 8, 0, 0, 0.85, 0.02, 0, 0],
  },
  skills: {
    q: { cast: { sound: 'discToss', vol: 0.3 } },
    w: { cast: { sound: 'pal', vol: 0.3 } },
  },
  fx: { paint },
};
