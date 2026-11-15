/**
 * Dusty: Cowgirl gunslinger: popping corks, a jingle of spurs and a desert sunset. Timbre: cork pop and spur jingle.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3; sim v31, ROSTER-V31.md §3).
 *
 * Sound: a cork pop on every Q/W/E (Trick Shot, the Lasso's swish lower, Quick Draw higher); the Big Cork and HIGH
 * NOON's corks pop louder with a spur jingle. Basic and ult voices: IDENTITY.dusty.voice. Look: the default motif (sunset
 * stars in her colour pair); skillfx/dusty.ts draws the corks, the bounce line and the lasso.
 */
import type { ChampAudio } from './types';

export const dusty: ChampAudio = {
  hero: 'dusty',
  // a cork pop (≈0.08 s)
  motif: [0.28, 0, 520, 0.001, 0.01, 0.06, 3, 1, -12, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.5, 0.01, 0, 0],
  motifRate: { q: 1, w: 0.7, e: 1.3, passive: 0.9 },
  sounds: {
    // two quick spur jingles
    jingle: [0.2, 0, 3200, 0.001, 0.02, 0.1, 0, 1, 0, 0, 200, 0.04, 0.05, 0, 0, 0, 0, 0.5, 0.01, 0, 0],
  },
  skills: {
    passive: { impact: { sound: 'jingle', vol: 0.2 } },
    r: { impact: { sound: 'jingle', vol: 0.26 } },
  },
  fx: { motifCount: 5, ownedMotif: true },
};
