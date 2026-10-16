import type { PlanStep } from '../solver';

/**
 * heist-14: pass the key. Cat 1 holds the rope plate q while cat 2 slips into the count room; cat 1
 * then crosses the floor to the high-roller room and takes the key, and cat 2, waiting by the cage,
 * opens it with the shared key without the key ever crossing the floor.
 */
export const HEIST_14_SCRIPT: PlanStep[] = [
  { collect: [[3, 10], [4, 15]], note: 'entrance coins' },
  { collect: [[10, 18], [13, 13], [19, 14], [25, 18]], note: 'south floor coins' },
  { goto: [23, 14], note: 'cat 1 waits by the rope plate, out of every cone' },
  { swap: true },
  { collect: [[10, 10]], note: 'cat 2 on the way' },
  { goto: [23, 13], note: 'cat 2 waits next to cat 1' },
  { swap: true },
  {
    try: [{ goto: [25, 15] }, { swap: true }, { goto: [29, 11] }],
    waitUpTo: 600,
    note: 'cat 1 holds q, cat 2 slips through the velvet rope Q',
  },
  { swap: true },
  { goto: [23, 14], note: 'cat 1 steps off q: the rope closes behind cat 2' },
  { swap: true },
  { collect: [[34, 10], [29, 14], [34, 18]], note: 'count-room coins' },
  { goto: [31, 8], note: 'cat 2 waits at the cage door' },
  { swap: true },
  { collect: [[24, 9], [19, 6]], note: 'north floor coins' },
  { collect: [[17, 10], [18, 10], [18, 11], [20, 12], [18, 13]], note: "jackpot coins in the croupier's sweep" },
  { goto: [12, 6], note: 'cat 1 to the high-roller gap' },
  { collect: [[11, 1], [17, 4]], note: 'high-roller west coins' },
  { try: [{ goto: [22, 3] }], waitUpTo: 300, note: "grab the key on the dealer's off-beat" },
  { collect: [[23, 1], [25, 4]], note: 'high-roller east coins' },
  { swap: true },
  { interact: true }, // cat 2 opens the cage with the key cat 1 is holding
  { collect: [[29, 6], [32, 5], [34, 1]], note: 'cage coins' },
  { goto: [32, 2], note: 'next to the crate' },
  { interact: true },
  { goto: [29, 11], note: 'cat 2 waits behind the rope' },
  { swap: true },
  { goto: [12, 6], note: 'cat 1 out of the high-roller room' },
  { goto: [23, 14], note: 'cat 1 back by q' },
  {
    try: [{ goto: [25, 15] }, { swap: true }, { goto: [23, 13] }],
    waitUpTo: 600,
    note: 'cat 1 holds q, cat 2 slips out',
  },
  { goto: [2, 17], note: 'cat 2 to the exit' },
  { swap: true },
  { goto: [3, 17], note: 'cat 1 to the exit' },
];
