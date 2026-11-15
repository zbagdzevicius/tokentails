/**
 * Ranger: Beagle park ranger: leaves, a tennis-ball thwump and a quiet sniff. Timbre: launcher thwump and leaf rustle.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3; sim v31, ROSTER-V31.md §3).
 *
 * Sound: a soft launcher thwump on every Q/W/E (Tracer Ball, Warning Bark lower, Bush Dive a rustle); the Camouflage
 * shot and LONG SHOT's balls land with a ball bounce. Basic and ult voices: IDENTITY.ranger.voice. Look: the default
 * motif (green leaves in his colour pair); skillfx/ranger.ts draws the scope, the leaves and the balls.
 */
import type { ChampAudio } from './types';

export const ranger: ChampAudio = {
  hero: 'ranger',
  // a launcher thwump (≈0.1 s)
  motif: [0.26, 0, 180, 0.002, 0.02, 0.08, 1, 1, -6, 0, 0, 0, 0, 0.4, 0, 0, 0, 0.5, 0.02, 0, -600],
  motifRate: { q: 1, w: 0.7, e: 1.4, passive: 1.2 },
  sounds: {
    // a tennis ball bounce
    bounce: [0.22, 0, 600, 0.001, 0.02, 0.06, 0, 1, -10, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.01, 0, 0],
  },
  skills: {
    passive: { impact: { sound: 'bounce', vol: 0.22 } },
    r: { impact: { sound: 'bounce', vol: 0.28 } },
  },
  fx: { motifCount: 5, ownedMotif: true },
};
