/**
 * Rocket: Race greyhound: checkered flags and speed streaks. Timbre: race whistle and start beeps.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: the start-light beep. Q and E climb "beep … BEEP" (E an octave up), W Photo Finish is a camera shutter
 * "ch-chk", R ZOOM… ZZZ beeps once on the crouch (render/skillfx/rocket.ts) and blows the race whistle on the go (his
 * ult voice). Basics: a sharp whistle tick.
 * Look: green-and-white checker squares in a two-row strip streaming back against his run (a flag in the wind); the
 * skill FX script adds the flag on the lure, the finish line under his feet, the checker square under the squirrel
 * and the checkered streak of the sprint.
 */
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE.HOLD (kept numeric: this file stays free of render imports). */
const HOLD = 2;
const STEP = 0.2;

function paint(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null): boolean {
  const { primary, secondary } = p.colors;
  // a checker strip (two rows, alternating green / white) blown back against the run like a flag
  const fx = dir ? dir.x : 1;
  const fz = dir ? dir.z : 0;
  for (let i = 0; i < n; i++) {
    const col = i >> 1;
    const row = i & 1;
    const back = col * STEP;
    p.single(
      { x: pos.x - fx * back, y: pos.y + 0.75 + row * STEP, z: pos.z - fz * back },
      { shape: p.shape.CONFETTI, color: (col + row) & 1 ? secondary : primary, additive: false, size0: 0.2, size1: 0.12, life: 0.45, vx: -fx * 2.6, vy: 0.2, vz: -fz * 2.6, rot: 0, spin: 0, fade: HOLD },
    );
  }
  return true;
}

export const rocket: ChampAudio = {
  hero: 'rocket',
  // the start-light beep: a short clean square
  motif: [0.26, 0, 660, 0, 0.06, 0.02, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0],
  motifRate: { q: 1, w: 1, e: 2, passive: 1.5 },
  sounds: {
    // Photo Finish: the camera shutter (a crushed noise click and its echo)
    shutter: [0.3, 0, 2400, 0, 0.01, 0.05, 4, 1, 0, 0, 0, 0, 0, 1, 0, 0.3, 0.06, 0.6, 0, 0, 3000],
  },
  skills: {
    w: { cast: { sound: 'shutter', vol: 0.3 } },
  },
  fx: { paint },
};
