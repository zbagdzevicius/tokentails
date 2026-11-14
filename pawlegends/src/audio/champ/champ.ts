/**
 * Champ: Boxer: red gloves, a ring bell and star-burst punches. Timbre: ring bell and punch thud.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3; sim v29, ROSTER-V29.md §3).
 *
 * Sound: a short leather thud on every Q/W/E; the One-Two's Cross and KNOCKOUT! ring the boxing bell over the impact.
 * Basic and ult voices: IDENTITY.champ.voice. Look: the default motif (punch stars in red and white);
 * skillfx/champ.ts draws the gloves and the wall-hit stars.
 */
import type { ChampAudio } from './types';

export const champ: ChampAudio = {
  hero: 'champ',
  // a leather thud (≈0.12 s)
  motif: [0.26, 0, 160, 0.002, 0.02, 0.08, 4, 1, -4, 0, 0, 0, 0, 0.7, 0, 0, 0, 0.55, 0.02, 0, -1200],
  motifRate: { q: 1, w: 0.8, e: 1.2, passive: 1.1 },
  sounds: {
    // the ring bell: two quick dings
    bell: [0.26, 0, 1320, 0.001, 0.04, 0.3, 0, 1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0.55, 0.04, 0, 0],
  },
  skills: {
    passive: { impact: { sound: 'bell', vol: 0.24 } },
    r: { impact: { sound: 'bell', vol: 0.3 } },
  },
  fx: { motifCount: 6, ownedMotif: true },
};
