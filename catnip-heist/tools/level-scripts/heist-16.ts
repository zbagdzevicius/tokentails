import type { PlanStep } from '../solver';

/**
 * heist-16: leapfrog T out of the lobby; cat 1 takes the key on the searchlight off-beat and waits at
 * the top of the east stair; cat 2 crosses the roof, goes down the stair and holds the airlock plate a
 * in Barkley's hall; cat 1 goes through both airlock doors into the CEO's office (sealed in for good),
 * opens the safe with the shared key and frees Duchess; cat 2 sweeps the hall, climbs back to the roof
 * and waits by the helipad valve; cat 1 holds h, cat 2 crosses to the helipad, cat 1 drops down the
 * laundry chute (a forced split getaway).
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
  {
    try: [
      { goto: [14, 7], note: 'take the key on the searchlight off-beat' },
      { collect: [[23, 10], [26, 2], [28, 8]], note: 'roof east coins' },
      { goto: [29, 11], note: 'cat 1 to the east checkpoint' },
    ],
    waitUpTo: 360,
    note: 'key and roof east',
  },
  { swap: true },
  { goto: [3, 12], note: 'cat 2 up to the roof' },
  { try: [{ goto: [29, 11], note: 'cat 2 across the roof' }], waitUpTo: 360, note: 'roof crossing' },
  {
    try: [
      { collect: [[27, 15]], note: 'east stair coin' },
      { goto: [27, 18], note: 'cat 2 down the stair' },
      { goto: [28, 25], note: 'cat 2 holds airlock plate a' },
    ],
    waitUpTo: 360,
    note: 'stair down',
  },
  { swap: true },
  { try: [{ goto: [27, 18], note: 'cat 1 down the east stair' }, { goto: [32, 21], note: 'cat 1 through the airlock' }], waitUpTo: 360, note: 'airlock' },
  { swap: true },
  {
    try: [
      { collect: [[27, 25], [22, 22], [18, 20], [11, 19], [12, 22], [11, 23], [8, 25], [15, 25]], note: 'hall coins' },
      { goto: [28, 25], note: 'cat 2 back to the airlock plate' },
    ],
    waitUpTo: 720,
    note: 'hall',
  },
  { try: [{ goto: [29, 11], note: 'cat 2 steps aside on the roof' }], waitUpTo: 360, note: 'stair up' },
  { try: [{ goto: [29, 1], note: 'cat 2 waits by the helipad valve' }], waitUpTo: 360, note: 'roof to the gate' },
  { swap: true },
  { try: [{ collect: [[34, 21]], note: 'office coin' }, { goto: [34, 19], note: 'cat 1 to the safe' }, { interact: true }], waitUpTo: 360, note: 'safe' },
  { collect: [[32, 15], [38, 17]], note: 'safe-room coins' },
  { goto: [36, 16], note: 'next to the crate' },
  { interact: true },
  { try: [{ collect: [[38, 23]], note: 'office south coin' }, { goto: [33, 24], note: 'cat 1 holds helipad plate h' }], waitUpTo: 360, note: 'plate h' },
  { swap: true },
  { try: [{ goto: [33, 4], note: 'cat 2 through the helipad valve' }], waitUpTo: 360, note: 'valve' },
  { collect: [[33, 1], [35, 7], [38, 8]], note: 'helipad coins' },
  { goto: [36, 4], note: 'cat 2 on the helipad exit' },
  { swap: true },
  { try: [{ goto: [37, 25], note: 'cat 1 down the laundry chute' }], waitUpTo: 360, note: 'chute' },
];
