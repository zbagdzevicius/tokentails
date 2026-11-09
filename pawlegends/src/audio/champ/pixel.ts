/**
 * Pixel: Cardboard robot: 8-bit pixel squares. Timbre: chiptune square blips.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: everything is a square-wave chip. Q Cap Cannon a bit-crushed "pew" falling in pitch, W Laser Pointer a
 * rising duty-sweep "vwee" over the electric crackle, E Duck and Cover a three-step "loading" bloop over the guard
 * clank, R BOXBOT MK II her ult arpeggio over the power-up. Basics: a two-note blip.
 * Look: square LED pixels in ice cyan and cardboard kraft laid on a stepped grid that breaks apart (never spinning,
 * never round); the skill FX script (render/skillfx/pixel.ts) drops pixels off the cap, the laser pulses, the loading
 * ring and the BOXBOT assembly.
 */
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE.HOLD (kept numeric: this file stays free of render imports). */
const HOLD = 2;
/** Grid step (m) between pixels. */
const STEP = 0.2;

function paint(p: MotifPainter, pos: P3, n: number): boolean {
  const { primary, secondary } = p.colors;
  // a little pixel block (2 wide) that breaks apart square by square: each pixel flies straight out from the block
  for (let i = 0; i < n; i++) {
    const gx = (i & 1) - 0.5;
    const gy = ((i >> 1) % 3) - 0.5;
    p.single(
      { x: pos.x + gx * STEP, y: pos.y + 0.8 + gy * STEP, z: pos.z },
      { shape: p.shape.CONFETTI, color: i < 4 ? primary : secondary, additive: false, size0: 0.2, size1: 0.2, life: 0.5, vx: gx * 1.6, vy: 0.4 + gy * 1.2, vz: ((i % 3) - 1) * 0.6, rot: 0, spin: 0, fade: HOLD },
    );
  }
  return true;
}

export const pixel: ChampAudio = {
  hero: 'pixel',
  // a square-wave two-note blip (a fifth down)
  motif: [0.26, 0, 784, 0, 0.03, 0.04, 5, 1, 0, 0, 392, 0.03, 0, 0, 0, 0, 0, 0.6, 0.01, 0, 0],
  motifRate: { q: 1, w: 1.26, e: 1.5, passive: 0.75 },
  sounds: {
    // Cap Cannon: a bit-crushed "pew" diving down
    capPew: [0.3, 0, 1400, 0, 0.04, 0.06, 5, 0.5, -40, 0, 0, 0, 0, 0, 0, 0.1, 0, 0.6, 0.01, 0, 0],
    // Laser Pointer: a narrow-duty sweep up, "vwee"
    laserOn: [0.25, 0, 500, 0, 0.12, 0.06, 5, 0.4, 30, 0, 0, 0, 0.03, 0, 0, 0, 0, 0.6, 0.01, 0, 0],
    // Duck and Cover: three "loading" steps down
    boxShut: [0.28, 0, 330, 0, 0.12, 0.05, 5, 1, 0, 0, -110, 0.04, 0.04, 0, 0, 0, 0, 0.6, 0.01, 0, 0],
  },
  skills: {
    q: { cast: { sound: 'capPew', vol: 0.3 } },
    w: { cast: { sound: 'laserOn', vol: 0.28 } },
    e: { cast: { sound: 'boxShut', vol: 0.3 } },
  },
  fx: { paint },
};
