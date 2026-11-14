/**
 * Mochi: Nap-time ragdoll: pillow feathers and sleepy Zzz. Timbre: music-box chime (soft sine bell).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3; sim v29, ROSTER-V29.md §3).
 *
 * Sound: a soft music-box chime on every Q/W/E (Pillow Toss, the bubble a third up, Purr Wave a fifth up); the shield
 * feather of Pillow Toss rings a high bell over the guard impact. Basic and ult voices: IDENTITY.mochi.voice.
 * Look: the default motif (white feathers in her colour pair); skillfx/mochi.ts adds the Zzz and the lullaby notes.
 */
import type { ChampAudio } from './types';

export const mochi: ChampAudio = {
  hero: 'mochi',
  // music-box chime: a sine bell at C6 with a gentle echo (≈0.2 s)
  motif: [0.24, 0, 1046, 0.004, 0.03, 0.14, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.04, 0.55, 0.02, 0, 0],
  motifRate: { q: 1, w: 1.26, e: 1.5, passive: 1.33 },
  sounds: {
    // a tiny high bell when a shield feather lands on a friend
    bell: [0.2, 0, 2093, 0.002, 0.02, 0.18, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.03, 0.5, 0.02, 0, 0],
  },
  skills: {
    passive: { impact: { sound: 'bell', vol: 0.22 } },
    w: { impact: { sound: 'bell', vol: 0.2 } },
  },
  fx: { motifCount: 6, ownedMotif: true },
};
