/**
 * The Paw Legends theme (brand book v6 §5.2): one motif shared by every music cue. The menu loops and stingers are
 * rendered offline from it (tools/music/compose.mjs); the in-match layers (audio/music.ts) play it live.
 * Plain JS so the node composer and the game import the same numbers.
 */

/** Tempo of every cue. */
export const THEME_BPM = 116;

/** C – G – Am – F, one bar each: MIDI bass roots and triads. */
export const THEME_BARS = [
  { root: 48, chord: [60, 64, 67] },
  { root: 43, chord: [59, 62, 67] },
  { root: 45, chord: [60, 64, 69] },
  { root: 41, chord: [60, 65, 69] },
];

/** CATS motif, rising ("here we come"): [16th step, MIDI] (E5 G5 A5 C6 B5 A5). */
export const CATS_MOTIF = [
  [0, 76],
  [3, 79],
  [6, 81],
  [9, 84],
  [12, 83],
  [15, 81],
];

/** DOGS motif, falling ("not so fast"): [16th step, MIDI] (A2 A2 G2 F2 E2). */
export const DOGS_MOTIF = [
  [0, 45],
  [4, 45],
  [6, 43],
  [8, 41],
  [12, 40],
];

/** Menu loops (pawlegends-art/music/<name>.m4a): bars per cycle. */
export const MENU_LOOPS = { home: { bars: 16 }, select: { bars: 8 } };

/** Seconds of the cycle each loop file carries before and after it (the loop runs [pad, pad + cycle]). */
export const LOOP_PAD_S = 0.5;

/** Cache key of the rendered files (pawlegends-web/public/pawlegends-art/music): bump on every re-render. */
export const THEME_REV = 1;
