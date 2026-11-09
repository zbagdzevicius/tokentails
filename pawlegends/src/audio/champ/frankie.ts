/**
 * Frankie: Hot dog: ketchup and mustard squiggles. Timbre: slide whistle and cork pop.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: a rising slide-whistle blip on every Q/W/E (Dig lower, Bun Hop higher); Dig's pop out of the ground plays
 * the cork pop (frankieDig) over the impact thud; FOOTLONG!'s grab plays the snap (frankieSnap) over the fire impact;
 * the Ketchup and Mustard Combo squirts a little cork pop over the splash. Basic voice frankieYip, ult voice
 * frankieStretch (IDENTITY.frankie.voice).
 * Look: a ketchup-and-mustard zig-zag squiggle: two interleaved strands of dots (mustard and ketchup) along the skill's
 * direction; the Combo crosses the two strands into an X.
 */
import type { SkillKey } from '../../render/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers here: this file stays free of render imports). */
const FADE_HOLD = 2;

const AT = { x: 0, y: 0, z: 0 };
const DOT = { shape: 0, color: 0, size0: 0.17, size1: 0.12, life: 0.5, alpha: 1, additive: false, fade: FADE_HOLD, grow: 0, rot: 0, spin: 0, vx: 0, vy: 0.3, vz: 0 };

/**
 * The squiggle: `n` dots alternating mustard (primary) and ketchup (secondary), each strand zig-zagging across the
 * line (dx, dz). The Combo ('passive') lays the two strands crossed into an X.
 */
export function paintFrankie(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  if (n <= 0) return true;
  const l = dir ? Math.hypot(dir.x, dir.z) || 1 : 1;
  const fx = dir ? dir.x / l : 1;
  const fz = dir ? dir.z / l : 0;
  const cross = skill === 'passive';
  const len = cross ? 0.9 : 1.3;
  DOT.shape = p.shape.SOFT;
  for (let i = 0; i < n; i++) {
    const strand = i & 1;
    const t = n === 1 ? 0 : (Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1) - 0.5) * len;
    let ux = fx;
    let uz = fz;
    let off = (Math.floor(i / 2) & 1 ? 0.14 : -0.14) * (strand ? -1 : 1);
    if (cross) {
      // the X: each strand on its own diagonal, no zig-zag
      const s = strand ? -1 : 1;
      ux = (fx - s * fz) * Math.SQRT1_2;
      uz = (fz + s * fx) * Math.SQRT1_2;
      off = 0;
    }
    AT.x = pos.x + ux * t - uz * off;
    AT.y = pos.y + 0.6 + (cross ? 0 : off * 0.4);
    AT.z = pos.z + uz * t + ux * off;
    DOT.color = strand ? p.colors.secondary : p.colors.primary;
    DOT.life = 0.45 + 0.02 * (i >> 1);
    p.single(AT, DOT);
  }
  return true;
}

export const frankie: ChampAudio = {
  hero: 'frankie',
  // a rising slide-whistle blip (≈0.14 s)
  motif: [0.24, 0, 620, 0.01, 0.05, 0.06, 0, 1, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0.85, 0.02, 0, 0],
  // Weenie Roll as is, Dig lower, Bun Hop higher
  motifRate: { q: 1, w: 0.8, e: 1.25, passive: 1.1 },
  sounds: {
    // the Combo: a little cork pop
    cork: [0.28, 0, 900, 0, 0.005, 0.05, 0, 1, -30, 0, 0, 0, 0, 0.4, 0, 0, 0, 0.5, 0.01, 0, 0],
  },
  skills: {
    passive: { impact: { sound: 'cork', vol: 0.28 } },
    w: { impact: { sound: 'frankieDig', vol: 0.3 } },
    r: { impact: { sound: 'frankieSnap', vol: 0.3 } },
  },
  // skillfx/frankie.ts draws the squiggle on every cast itself (identity()), so the owned-cast burst is off
  fx: { motifCount: 8, ownedMotif: false, paint: paintFrankie },
};
