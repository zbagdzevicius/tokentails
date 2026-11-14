/**
 * Ziggy: Lightning Bengal: zig-zag bolts and static. Timbre: electric guitar pluck (square, quick bend).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3; sim v29, ROSTER-V29.md §3).
 *
 * Sound: a bent guitar pluck on every Q/W/E (each Zig a step higher through the recasts is drawn by the framework's
 * per-skill rate); the Static Step snap and the storm strikes crack over the electric impact. Basic and ult voices:
 * IDENTITY.ziggy.voice. Look: the default motif (sparks in yellow and cyan); skillfx/ziggy.ts draws the bolts.
 */
import type { ChampAudio } from './types';

export const ziggy: ChampAudio = {
  hero: 'ziggy',
  // a square pluck bending up (≈0.15 s)
  motif: [0.22, 0, 440, 0.002, 0.03, 0.1, 2, 1, 14, 0, 0, 0, 0, 0.2, 0, 0.05, 0, 0.55, 0.02, 0, 0],
  motifRate: { q: 1, w: 0.75, e: 1.33, passive: 1.5 },
  sounds: {
    // the static snap
    snap: [0.26, 0, 1800, 0, 0.01, 0.06, 4, 1, -60, 0, 0, 0, 0, 1.2, 0, 0.3, 0, 0.5, 0.01, 0, 1500],
  },
  skills: {
    passive: { impact: { sound: 'snap', vol: 0.26 } },
    r: { impact: { sound: 'snap', vol: 0.28 } },
  },
  fx: { motifCount: 6, ownedMotif: true },
};
