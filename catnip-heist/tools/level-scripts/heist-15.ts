import type { PlanStep } from '../solver';

/**
 * heist-15: place the four exhibits where they look at walls, fetch the key, then open the vault and
 * leave through the staff door while every exhibit wakes and marches on the gem room.
 */
export const HEIST_15_SCRIPT: PlanStep[] = [
  // Cat 1 places the exhibits. Each meow is made just outside the dog's sight, then the cat steps away.
  { collect: [[4, 17]], note: 'lobby coin' },
  { goto: [9, 16], note: 'corner of the west hall, just out of st-hall’s sight' },
  { meow: true },
  { goto: [4, 15], note: 'cat 1 ducks into the lobby while st-hall walks to the corner (it ends facing the wall)' },
  { wait: 60 },
  { collect: [[10, 15], [12, 8], [9, 4]], note: 'west hall coins, now that the vault front is unwatched' },
  { goto: [11, 2], note: 'behind st-gallery' },
  { meow: true },
  { goto: [13, 2], note: 'cat 1 slips past while st-gallery turns into the corner (it ends facing the wall)' },
  { collect: [[14, 2]], note: 'gallery coin while the laser looks east' },
  { collect: [[13, 18], [18, 17]], note: 'corridor coins' },
  { goto: [23, 18], note: 'edge of st-south’s sight' },
  { meow: true },
  { goto: [14, 17], note: 'cat 1 backs off west while st-south walks over (it ends facing the wall)' },
  { wait: 30 },
  { collect: [[27, 18]], note: 'corridor coin' },
  { goto: [27, 14], note: 'behind st-east' },
  { meow: true },
  { goto: [27, 9], note: 'cat 1 slips north while st-east walks down (it ends facing the wall)' },
  { wait: 30 },
  { collect: [[30, 11], [30, 6]], note: 'east hall coins' },
  { collect: [[26, 2], [22, 4]], note: 'gallery coins while the laser looks west' },
  { goto: [28, 7], note: 'cat 1 holds plate q (studio door)' },
  // Cat 2 raids the studio for the key and waits at the vault door.
  { swap: true },
  { collect: [[6, 20]], note: 'lobby coin' },
  { goto: [30, 4], note: 'cat 2 up the east hall' },
  { goto: [33, 2], note: 'through the studio door (checkpoint)' },
  { collect: [[32, 1], [34, 5]], note: 'studio coins' },
  { goto: [33, 4], note: 'grab the key' },
  { goto: [30, 3], note: 'out of the studio' },
  { goto: [13, 10], note: 'cat 2 waits at the vault door' },
  // Cat 1 holds the staff door open.
  { swap: true },
  { collect: [[25, 11]], note: 'staff passage coin' },
  { goto: [25, 14], note: 'cat 1 holds plate s (staff door)' },
  // The vault wakes every exhibit: grab everything and run through the staff door.
  { swap: true },
  { interact: true },
  { collect: [[16, 7], [16, 13]], note: 'gem room west coins first: the exhibits will come in this way' },
  { goto: [18, 10], note: 'next to the crate' },
  { interact: true },
  { collect: [[22, 7], [22, 13]], note: 'gem room east coins on the way to the staff door' },
  { goto: [25, 10], note: 'through the staff door' },
  { goto: [25, 16], note: 'cat 2 hides in the staff passage while the exhibits march past' },
  {
    try: [
      { goto: [2, 19], note: 'cat 2 to the exit' },
      { swap: true },
      { goto: [3, 19], note: 'cat 1 to the exit' },
    ],
    waitUpTo: 600,
    note: 'getaway',
  },
];
