import type { PlanStep } from '../solver';

/**
 * heist-12: the doorstop. Cat 1 holds plate f, cat 2 parks IN dryer door F, cat 1 steps off the
 * plate and walks through the door its partner is holding open.
 */
export const HEIST_12_SCRIPT: PlanStep[] = [
  { collect: 'reachable', note: 'street and hall coins (cat 1)' },
  { goto: [20, 1], note: 'cat 1 holds plate f' },
  { swap: true },
  {
    try: [{ goto: [24, 3], note: 'cat 2 parks in dryer door F (the doorstop)' }],
    waitUpTo: 240,
    note: 'time the prop to the aisle dog',
  },
  { swap: true },
  { goto: [25, 3], note: 'cat 1 off the plate and through F: cat 2 holds the door' },
  { swap: true },
  { goto: [25, 4], note: 'cat 2 steps into the office, F closes behind it' },
  { swap: true },
  { collect: 'reachable', note: 'office coins under the manager' },
  { goto: [28, 2], note: 'next to the crate' },
  { interact: true },
  { goto: [30, 17], note: 'cat 1 to the exit' },
  { swap: true },
  { goto: [29, 17], note: 'cat 2 to the exit' },
];
