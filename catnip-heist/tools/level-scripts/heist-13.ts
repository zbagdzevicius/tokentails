import type { PlanStep } from '../solver';

/**
 * heist-13: the long-way lure. Cat 2 holds the west flap plate, cat 1 meows through the open flap;
 * the doorman cannot use the flap and walks round over the belt. The cats leapfrog through the flap
 * (east plate), let it shut behind them and raid the cage before the doorman walks home.
 */
export const HEIST_13_SCRIPT: PlanStep[] = [
  { swap: true },
  { goto: [10, 8], note: 'cat 2 holds the west flap plate' },
  { swap: true },
  { collect: [[2, 12], [6, 12], [8, 14], [8, 10], [6, 8], [2, 5], [3, 3]], note: 'west hall coins' },
  { collect: [[6, 2], [5, 1], [11, 1], [13, 1], [16, 1], [17, 2]], note: 'belt coins, between the pacer’s laps' },
  { goto: [11, 8], note: 'cat 1 into the flap mouth' },
  { meow: true },
  {
    try: [
      { goto: [19, 7], note: 'cat 1 through the flap onto the east plate, once the doorman has left its booth' },
      { swap: true },
      { goto: [17, 8], note: 'cat 2 through the flap' },
    ],
    waitUpTo: 240,
    note: 'the doorman walks out of its booth and round',
  },
  { goto: [27, 12], note: 'cat 2 holds the cage plate' },
  { swap: true },
  { collect: [[20, 13], [22, 14], [20, 15]], note: 'cage coins' },
  { goto: [21, 14], note: 'next to the crate' },
  { interact: true },
  { goto: [26, 13], note: 'cat 1 out of the cage' },
  { collect: [[26, 15], [26, 10], [25, 8], [22, 4], [23, 2], [25, 1]], note: 'packing hall coins' },
  { goto: [26, 14], note: 'cat 1 to the exit' },
  { swap: true },
  { goto: [27, 14], note: 'cat 2 to the exit' },
];
