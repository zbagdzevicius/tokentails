/**
 * Heist 02: Kennel Row. Idea: the meow lure. A doorman dog sits in the middle of the kennel hall
 * staring at the only doorway to the crate room; it never moves unless it hears something. Meow from
 * the west side of the hall, run, and slip both cats down the east side while it sniffs around.
 * One cat can do it alone (no plate doors): the lesson is the lure, not teamwork.
 *
 *            x 0         1         2
 *              012345678901234567890123
 */
const map = [
  '########################', // 0
  '#......#.....$....$....#', // 1
  '#.12...r..$........b.+.#', // 2
  '#......#.$....b.....$..#', // 3
  '#..$...#.###########.###', // 4
  '########.....$.........#', // 5
  '       #..bb.......bb..#', // 6
  '       #.....$.......$.#', // 7
  '       #...............#', // 8
  '       #.$.....@.......#', // 9   @ doorman post, facing south
  '       #...............#', // 10
  '       #..b...$...$.b..#', // 11  risky coins inside the doorman's view
  '       #.......$.......#', // 12
  '       #...............#', // 13
  '       ########.########', // 14  the doorway it guards
  '       #EE.............#', // 15
  '       #.+..$.....$....#', // 16
  '       #..b.........b..#', // 17
  '       #3$..%..$.......#', // 18  3 -> % crate-room patrol (west half: the doorway and the crate stay clear)
  '       #...$.......$.C.#', // 19
  '       #################', // 20
];

export default {
  id: 'heist-02',
  title: 'Heist 02: Kennel Row',
  name: 'Kennel Row',
  intro: 'The doorman dog will not budge. Give it something to sniff: a meow lures it away.',
  idea: 'Meow to lure a guard off its post',
  map,
  doors: {},
  guards: [
    { id: 'g-doorman', sprite: 'brown', waypoints: ['@'], speed: 1, sniffTicks: 0, visionTiles: 5, facing: { x: 0, y: 1 } },
    { id: 'g-crates', sprite: 'base', waypoints: ['3', '%'], speed: 1, sniffTicks: 30, visionTiles: 3 },
  ],
  crate: { catId: 'cheesy', catName: 'Biscuit' },
  meta: {
    parTicks: 60 * 30, // cautious-bot median 32 s x 1.2, rounded up to 5 s (min 60 s); see playtest/BOT-REPORT.md
    // The lure lesson: a meow carries 7 tiles here and the doorman sniffs for 6 s.
    meowRadiusTiles: 7,
    investigateTicks: 180,
    maxCoins: 20,
    twoCatRequired: false,
    objectives: ['Lure the doorman with a meow, then free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 8, y0: 5, x1: 22, y1: 8, untilObjective: 0, text: 'The doorman won’t budge. Meow ({meow}) from across the hall: it walks over to sniff where you were, so move away, then slip past behind it.' },
      { x0: 8, y0: 15, x1: 22, y1: 19, untilObjective: 0, text: 'Press {act} next to the crate to free the shelter cat.' },
    ],
  },
};
