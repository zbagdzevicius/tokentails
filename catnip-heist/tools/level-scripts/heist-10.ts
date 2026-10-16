import type { PlanStep } from '../solver';

/**
 * heist-10: the clever route. Cat 1 takes the pharmacy key past the X-ray sentry and opens the
 * pharmacy door V while the nurse is in the east wing. She reroutes through the pharmacy (row 9) for
 * good, so the kennel ward is empty: cat 1 holds plate j and cat 2 walks into isolation.
 */
export const HEIST_10_SCRIPT: PlanStep[] = [
  { collect: [[5, 4]], note: 'reception coin' },
  { try: [{ goto: [11, 2] }], waitUpTo: 900, note: 'cat 1 slips through the reception doorway and up the west wing' },
  { collect: [[10, 3]], note: 'west wing coin' },
  { collect: [[14, 1], [20, 4], [22, 1]], note: 'X-ray coins behind the sentry' },
  { goto: [21, 2], note: 'grab the pharmacy key' },
  { goto: [11, 2], note: 'out of the X-ray room' },
  { try: [{ goto: [12, 9] }, { interact: true }], waitUpTo: 1200, note: 'open the pharmacy while the nurse is in the east wing' },
  { try: [{ collect: [[15, 9], [18, 7], [21, 11]] }], waitUpTo: 1200, note: 'pharmacy coins behind her back' },
  { try: [{ goto: [24, 11] }], waitUpTo: 1200, note: 'out the pharmacy east doorway' },
  { collect: [[25, 2], [31, 1], [30, 5]], note: 'surgery coins' },
  { collect: [[29, 16], [30, 18], [27, 18], [24, 18], [20, 14], [12, 18], [9, 18], [11, 16]], note: 'kennel ward, now empty' },
  { goto: [16, 15], note: 'cat 1 holds plate j' },
  { swap: true },
  { collect: [[2, 15]], note: 'cat 2 reception coin' },
  { try: [{ goto: [9, 14] }], waitUpTo: 1200, note: 'cat 2 crosses the nurse’s new beat to the ward' },
  { goto: [19, 19], note: 'cat 2 through J into isolation' },
  { collect: [[21, 19], [18, 21]], note: 'isolation coins' },
  { goto: [19, 20], note: 'next to the crate' },
  { interact: true },
  { try: [{ goto: [3, 20] }], waitUpTo: 1200, note: 'cat 2 home' },
  { swap: true },
  { try: [{ goto: [2, 20] }], waitUpTo: 1200, note: 'cat 1 home' },
];
