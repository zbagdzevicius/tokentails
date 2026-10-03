/**
 * Heist 03: Twin Locks. Idea: chained plate doors and swap timing. Three plate doors in a row (A, D,
 * F); each has a plate on both sides, so the cats leapfrog: one holds, the other runs through and
 * holds the far plate for its partner. The R2 patrol (vision 3) turns 4 tiles short of plate d2, so its holder is
 * safe; the timing is in slipping past the dog to door D.
 *
 *            x 0         1         2
 *              012345678901234567890123456789
 */
const map = [
  '##############################', // 0
  '#......#...$....$...#.....$..#', // 1
  '#.12...#............#.d......#', // 2
  '#..$...A+a..........#..$.....#', // 3   + checkpoint just past door A
  '#......#....bbbb....#.....&.*#', // 4   & *  R3 patrol (north half: door F's approach stays clear)
  '#......#.$..bbbb..$.D+.......#', // 5   + checkpoint just past door D
  '#a...$.#....bbbb....#...$....#', // 6
  '#......#.....$......#..$...$.#', // 7
  '#......#..=...~...d.#........#', // 8   = ~  R2 patrol (vision 3, turns 4 tiles short of plate d2: out of sight of its holder)
  '#...$..#..$.....$...#f.......#', // 9
  '#########################F####', // 10
  '                    #...$+...#', // 11  + checkpoint just past door F
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
    { id: 'g-loop', sprite: 'black', waypoints: ['=', '~'], speed: 1, sniffTicks: 30, visionTiles: 3 },
    { id: 'g-store', sprite: 'base', waypoints: ['&', '*'], speed: 1, sniffTicks: 40, visionTiles: 3 },
  ],
  crate: { catId: 'mist', catName: 'Luna' },
  meta: {
    parTicks: 60 * 30, // cautious-bot median 43 s x 1.2, rounded up to 5 s (min 60 s); see playtest/BOT-REPORT.md
    meowRadiusTiles: 6,
    investigateTicks: 120,
    maxCoins: 18,
    twoCatRequired: true,
    objectives: ['Take turns on the plates to get both cats through, then free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 1, y0: 1, x1: 6, y1: 9, untilObjective: 0, text: 'Hold the plate, press {swap}, and send your partner through.' },
      { x0: 8, y0: 1, x1: 19, y1: 9, untilObjective: 0, text: 'The patrol turns just short of this plate, so a cat on it is safe. Slip past the dog while it walks away.' },
    ],
  },
};
