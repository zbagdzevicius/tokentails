/**
 * Heist 03: Twin Locks. Idea: chained plate doors and swap timing. Three plate doors in a row (A, D,
 * F); each has a plate on both sides, so the cats leapfrog: one holds, the other runs through and
 * holds the far plate for its partner. Plate d1 sits at the end of the R2 patrol, so the holder has to be
 * swapped off before the dog walks up to it.
 *
 *            x 0         1         2
 *              012345678901234567890123456789
 */
const map = [
  '##############################', // 0
  '#......#+..$....$...#.....$..#', // 1
  '#.12...#............#.d......#', // 2
  '#..$...A.a..........#..$.....#', // 3
  '#......#....bbbb....#........#', // 4
  '#......#.$..bbbb..$.D......$.#', // 5
  '#a...$.#....bbbb....#...&$.*.#', // 6   & *  R3 patrol
  '#......#.....$......#..$.....#', // 7
  '#......#..=......~d.#........#', // 8   = ~  R2 patrol
  '#...$..#..$.....$...#f.+.....#', // 9
  '#########################F####', // 10
  '                    #...$....#', // 11
  '                    #.f.....C#', // 12
  '                    #.EE..$..#', // 13
  '                    ##########', // 14
];

export default {
  id: 'heist-03',
  title: 'Heist 03: Twin Locks',
  name: 'Twin Locks',
  intro: 'Three plate doors in a row. Leapfrog: one cat holds, the other runs, then swap.',
  idea: 'Chained plate doors and swap timing',
  map,
  doors: { A: { id: 'door-lab' }, D: { id: 'door-store' }, F: { id: 'door-alcove' } },
  guards: [
    { id: 'g-loop', sprite: 'black', waypoints: ['=', '~'], speed: 1, sniffTicks: 30, visionTiles: 4 },
    { id: 'g-store', sprite: 'base', waypoints: ['&', '*'], speed: 1, sniffTicks: 40, visionTiles: 3 },
  ],
  crate: { catId: 'mist', catName: 'Luna' },
  meta: {
    parTicks: 90 * 30,
    meowRadiusTiles: 6,
    investigateTicks: 120,
    maxCoins: 18,
    twoCatRequired: true,
    objectives: ['Leapfrog the plate doors and free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 1, y0: 1, x1: 6, y1: 9, untilObjective: 0, text: 'Hold the plate, press {swap}, and send your partner through.' },
      { x0: 8, y0: 1, x1: 19, y1: 9, untilObjective: 0, text: 'Watch the patrol: swap off a plate before the dog comes round.' },
    ],
  },
};
