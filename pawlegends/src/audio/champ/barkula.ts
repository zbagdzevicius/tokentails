/**
 * Barkula: Doberman count: bats, a red moon and a swirl of cape. Timbre: organ swell and bat flutter.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3; sim v31, ROSTER-V31.md §3).
 *
 * Sound: a low organ note on every Q/W/E (Bat Bite, the swarm a fifth lower, Mist Form a breath); Night Thirst's heal
 * plays a soft heartbeat; RED MOON's pop swells. Basic and ult voices: IDENTITY.barkula.voice. Look: the default
 * motif (little bats in his colour pair); skillfx/barkula.ts draws the swarm, the mist and the moon.
 */
import type { ChampAudio } from './types';

export const barkula: ChampAudio = {
  hero: 'barkula',
  // an organ note at A3 with vibrato (≈0.25 s)
  motif: [0.24, 0, 220, 0.01, 0.08, 0.13, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.6, 0.05, 0.1, 0],
  motifRate: { q: 1, w: 0.75, e: 1.25, passive: 0.6 },
  sounds: {
    // a soft double heartbeat
    heart: [0.24, 0, 70, 0.004, 0.03, 0.08, 4, 1, 0, 0, 0, 0, 0.12, 0.6, 0, 0, 0, 0.5, 0.02, 0, -400],
  },
  skills: {
    passive: { impact: { sound: 'heart', vol: 0.2 } },
    r: { impact: { sound: 'heart', vol: 0.3 } },
  },
  fx: { motifCount: 6, ownedMotif: true },
};
