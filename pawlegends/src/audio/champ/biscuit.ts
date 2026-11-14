/**
 * Biscuit: Golden retriever: tennis balls and a red leash. Timbre: squeaky toy and happy woof (pitched square).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3; sim v29, ROSTER-V29.md §3).
 *
 * Sound: a squeaky-toy squeak on every Q/W/E (Fetch! as is, Tail Wag lower, Stubborn lower still); the catch plays a
 * rubber-ball bonk over the projectile impact. Basic and ult voices: IDENTITY.biscuit.voice. Look: the default motif
 * (soft yellow-green balls with red); skillfx/biscuit.ts draws the leash.
 */
import type { ChampAudio } from './types';

export const biscuit: ChampAudio = {
  hero: 'biscuit',
  // a squeaky toy: a quick rising square chirp (≈0.12 s)
  motif: [0.22, 0, 980, 0.003, 0.03, 0.06, 2, 1.4, 24, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.02, 0, 0],
  motifRate: { q: 1, w: 0.8, e: 0.66, passive: 1.2 },
  sounds: {
    // the rubber ball bonk on a catch
    bonk: [0.3, 0, 300, 0.002, 0.02, 0.1, 0, 1.6, -8, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.6, 0.02, 0, 0],
  },
  skills: {
    q: { impact: { sound: 'bonk', vol: 0.3 } },
  },
  fx: { motifCount: 6, ownedMotif: true },
};
