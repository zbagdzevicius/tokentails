import type { PlanStep } from '../solver';

/**
 * heist-09: the stare-down. Cat 2 waits at the meow spot (9,2) above the glass; cat 1 holds w.
 * 1. The shark comes off its corner and passes under the open pane: meow. It cannot path to the
 *    tunnel, so it freezes at (11,6), staring up at the glass.
 * 2. Cat 1 sweeps the tunnel coins (the pane shuts, the shark stays frozen) and is back on w in time.
 * 3. "Feeding time": one more meow as the eel reaches the shark both freezes the eel and restarts the
 *    shark's freeze, so both dogs stand under the glass while cat 1 takes g and cat 2 drops through
 *    the service gate and runs the east ring.
 * The same route with no meows is ~190 ticks slower (both dogs then sweep the ring ahead of cat 2).
 * One coin per step keeps the coin order fixed (the timings depend on it).
 */
const coin = (x: number, y: number, note: string): PlanStep => ({ collect: [[x, y]], note });

export const HEIST_09_SCRIPT: PlanStep[] = [
  { swap: true },
  { goto: [9, 2], note: 'cat 2 to the meow spot above the glass' },
  { swap: true },
  coin(2, 4, 'tunnel'),
  { goto: [6, 2], note: 'cat 1 holds w: the glass opens' },
  { swap: true },
  { wait: 135 },
  { meow: true }, // the shark is under the glass: it freezes
  { swap: true },
  coin(12, 1, 'tunnel, while the shark is frozen'),
  coin(16, 3, 'tunnel'),
  coin(20, 1, 'tunnel'),
  { goto: [6, 2], note: 'cat 1 back on w' },
  { swap: true },
  { wait: 25 },
  { meow: true }, // feeding time: the eel reaches the shark; both freeze (the shark's freeze restarts)
  { swap: true },
  coin(20, 4, 'tunnel'),
  { goto: [27, 2], note: 'cat 1 holds g: the service gate opens' },
  { swap: true },
  { goto: [24, 6], note: 'cat 2 through the gate while both dogs stare at the glass' },
  coin(27, 10, 'east ring'),
  coin(30, 12, 'east reef niche'),
  coin(23, 19, 'south reef niche'),
  coin(22, 16, 'south ring'),
  coin(14, 17, 'south ring'),
  { goto: [16, 18], note: 'lab doorway' },
  coin(15, 19, 'lab'),
  coin(21, 19, 'lab'),
  coin(18, 21, 'lab'),
  coin(17, 21, 'lab'),
  coin(15, 21, 'lab, behind the lab-tech'),
  { goto: [19, 20], note: 'next to the crate' },
  { interact: true },
  coin(12, 19, 'lab corner, while the lab-tech looks east'),
  { goto: [16, 18], note: 'out of the lab' },
  coin(9, 19, 'south-west reef niche'),
  coin(6, 14, 'west ring'),
  coin(3, 12, 'west reef niche'),
  coin(12, 6, 'north ring'),
  coin(20, 7, 'north ring, once the eel has gone by'),
  { goto: [24, 4], note: 'back up through the gate (cat 1 still holds g)' },
  coin(30, 4, 'tunnel'),
  { goto: [31, 2], note: 'cat 2 to the exit' },
  { swap: true },
  { goto: [32, 2], note: 'cat 1 to the exit' },
];
