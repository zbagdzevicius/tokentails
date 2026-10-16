import type { PlanStep } from '../solver';

/**
 * heist-11: Signal Box. Cat 1 sets the points (plate s opens barrier X and siding gate L); cat 2
 * rides the green wave down the crossing column x=16, loots the tracks between waves, frees Smokey
 * through gate L, then holds plate x in the depot so cat 1 can ride the same column down.
 */
export const HEIST_11_SCRIPT: PlanStep[] = [
  { collect: [[10, 1], [20, 3], [29, 1]], note: 'platform coins' },
  { goto: [30, 2], note: 'cat 1 sets the points (holds s)' },
  { swap: true },
  { goto: [16, 3], note: 'cat 2 to the barrier' },
  { goto: [16, 8], note: 'cat 2 through X, rides the wave to the first pocket' },
  { collect: [[12, 5], [4, 6], [24, 6], [29, 5], [31, 7]], note: 'track 1 coins' },
  { goto: [16, 12], note: 'cat 2 down to the second pocket (checkpoint)' },
  { collect: [[8, 9], [3, 10], [20, 11], [27, 10], [31, 9]], note: 'track 2 coins' },
  { goto: [16, 12], note: 'back to the pocket' },
  { try: [{ collect: [[24, 15], [30, 14]], note: 'track 3 east coins' }], waitUpTo: 240, note: 'track 3 east, on signal 3’s beat' },
  { goto: [16, 13], note: 'back under the second pocket' },
  { collect: [[7, 13]], note: 'track 3 west coin' },
  { goto: [5, 17], note: 'through the siding gate L (open while s is held)' },
  { collect: [[3, 18], [9, 18], [10, 17]], note: 'siding coins' },
  { goto: [3, 18], note: 'next to the crate' },
  { interact: true },
  { goto: [12, 18], note: 'out through the depot gap' },
  { collect: [[18, 19], [26, 17], [32, 19]], note: 'depot coins' },
  { goto: [28, 19], note: 'cat 2 holds x' },
  { swap: true },
  { goto: [16, 3], note: 'cat 1 to the barrier' },
  { goto: [16, 17], note: 'cat 1 rides the green wave down to the depot' },
  { goto: [31, 17], note: 'cat 1 to the exit' },
  { swap: true },
  { goto: [32, 17], note: 'cat 2 to the exit' },
];
