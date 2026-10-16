import type { PlanStep } from '../solver';

/**
 * heist-16: leapfrog T out of the lobby, cat 1 takes the key on the searchlight off-beat, cat 2
 * comes down the east stair and opens the CEO door with the shared key, frees Duchess and holds the
 * helipad plate h; cat 1 walks onto the helipad, then cat 2 steps off h into the laundry chute
 * (split getaway: each cat on a different exit).
 */
export const HEIST_16_SCRIPT: PlanStep[] = [
  { collect: [[5, 20], [1, 25]], note: 'lobby coins' },
  { goto: [5, 23], note: 'cat 1 holds lobby plate t' },
  { swap: true },
  { goto: [2, 14], note: 'cat 2 through T onto stairwell plate t' },
  { swap: true },
  { goto: [3, 17], note: 'cat 1 through T' },
  { collect: [[1, 13]], note: 'stairwell coin' },
  { goto: [3, 12], note: 'cat 1 to the roof hatch' },
  { collect: [[3, 9], [5, 4], [9, 2], [12, 10], [17, 1], [18, 4]], note: 'roof west coins' },
  { try: [{ goto: [14, 7], note: 'take the key on the searchlight off-beat' }], waitUpTo: 360, note: 'key' },
  { collect: [[23, 10], [26, 2], [28, 8]], note: 'roof east coins' },
  { goto: [28, 11], note: 'cat 1 to the east checkpoint' },
  { goto: [29, 4], note: 'cat 1 waits at the helipad gate' },
  { swap: true },
  { goto: [3, 12], note: 'cat 2 up to the roof' },
  { goto: [28, 11], note: 'cat 2 across the roof' },
  { collect: [[27, 14]], note: 'east stair coin' },
  { goto: [27, 18], note: 'cat 2 down the east stair' },
  {
    try: [
      { collect: [[28, 25], [22, 22], [18, 20], [11, 19], [12, 22], [11, 23], [8, 25], [15, 25]], note: 'hall coins' },
      { goto: [29, 21], note: 'cat 2 to the CEO door' },
      { interact: true },
    ],
    waitUpTo: 720,
    note: 'hall',
  },
  { collect: [[32, 15], [38, 17]], note: 'office north coins' },
  { goto: [36, 16], note: 'next to the crate' },
  { interact: true },
  { collect: [[34, 21], [38, 23]], note: 'office south coins' },
  { goto: [33, 24], note: 'cat 2 holds helipad plate h' },
  { swap: true },
  { goto: [31, 4], note: 'cat 1 through H' },
  { collect: [[33, 1], [35, 7], [38, 8]], note: 'helipad coins' },
  { goto: [36, 4], note: 'cat 1 on the helipad exit' },
  { swap: true },
  { goto: [37, 25], note: 'cat 2 down the laundry chute' },
];
