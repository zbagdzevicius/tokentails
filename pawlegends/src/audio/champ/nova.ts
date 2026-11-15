/**
 * Nova: Stargazer: falling stars, a brass telescope and a night-sky shimmer. Timbre: glass chime and a soft whoosh.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3; sim v31, ROSTER-V31.md §3).
 *
 * Sound: a glassy chime on every Q/W/E (Starfall, Shooting Star a fourth up, Moon Hop an octave up); a far hit
 * (Starlight) rings a high twinkle over the impact; METEOR SHOWER's meteors thump. Basic and ult voices:
 * IDENTITY.nova.voice. Look: the default motif (gold stars in her colour pair); skillfx/nova.ts draws the falling stars.
 */
import type { ChampAudio } from './types';

export const nova: ChampAudio = {
  hero: 'nova',
  // a glass chime at E6 (≈0.2 s)
  motif: [0.22, 0, 1318, 0.003, 0.03, 0.15, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.6, 0.02, 0, 0],
  motifRate: { q: 1, w: 1.33, e: 2, passive: 1.5 },
  sounds: {
    // a high twinkle on a far hit
    twinkle: [0.18, 0, 2637, 0.002, 0.02, 0.16, 0, 1, 0, 0, 0, 0, 0.04, 0, 0, 0, 0.03, 0.5, 0.02, 0, 0],
    // a meteor's soft thump
    thump: [0.3, 0, 90, 0.004, 0.05, 0.18, 4, 1, -3, 0, 0, 0, 0, 0.8, 0, 0.2, 0, 0.5, 0.03, 0, -800],
  },
  skills: {
    passive: { impact: { sound: 'twinkle', vol: 0.2 } },
    r: { impact: { sound: 'thump', vol: 0.3 } },
  },
  fx: { motifCount: 6, ownedMotif: true },
};
