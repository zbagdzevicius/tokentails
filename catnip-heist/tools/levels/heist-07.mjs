/**
 * Heist 07: Split Shift. Idea: the cats work far apart. Cat 1 starts in the north wing, cat 2 in the
 * south wing, and nothing connects them until the east room. Every door in one wing is held open by
 * a plate in the other wing, so they take turns: hold, swap, advance, hold for your partner.
 *   north doors P Q S  <- plates p q s in the south wing
 *   south doors T U W  <- plates t u in the north wing, w in the east room
 *
 *            x 0         1         2         3
 *              01234567890123456789012345678901234567
 */
const map = [
  '######################################', // 0
  '#.....$...#...@..%..#...$.....#......#', // 1   @ %  north patrol 2
  '#.1.......#.........Q+..u.....#....w.#', // 2   + checkpoint past Q
  '#...$.....P+...$....#......$..#.$....#', // 3   + checkpoint past P
  '#.........#...t.....#.........S+.....#', // 4   + checkpoint past S
  '#......$..#.$.......#..3....4.#.EE...#', // 5   3 4  north patrol 3
  '###############################......#', // 6
  '###############################...C..#', // 7
  '###############################.$....#', // 8
  '#...$.....#......$..#.$5....6.#......#', // 9   5 6  south patrol 3
  '#.........#.....q...#.........W.....$#', // 10
  '#.2..p....T+........#....$....#..=...#', // 11  =  east-room sentry; + checkpoint past T
  '#......$..#.........U+....s...#......#', // 12  + checkpoint past U
  '#..$......#..$7...8.#.......$.#...$..#', // 13  7 8  south patrol 2
  '######################################', // 14
];

const patrol = (id, sprite, a, b) => ({ id, sprite, waypoints: [a, b], speed: 1, sniffTicks: 30, visionTiles: 3 });
// The far rooms of each wing (behind doors Q and U) are watched by sharper-eyed dogs.
const sharp = (id, sprite, a, b) => ({ ...patrol(id, sprite, a, b), visionTiles: 4 });

export default {
  id: 'heist-07',
  title: 'Heist 07: Split Shift',
  name: 'Split Shift',
  intro: 'Two wings, two cats, no way across. Every plate opens a door on the other side.',
  idea: 'Split up: the cats work far apart',
  map,
  doors: { P: { id: 'door-n1' }, Q: { id: 'door-n2' }, S: { id: 'door-n3' }, T: { id: 'door-s1' }, U: { id: 'door-s2' }, W: { id: 'door-s3' } },
  guards: [
    patrol('g-north-2', 'brown', '@', '%'),
    sharp('g-north-3', 'base', '3', '4'),
    patrol('g-south-2', 'black', '7', '8'),
    sharp('g-south-3', 'exotic', '5', '6'),
    { id: 's-east', sprite: 'black-white', waypoints: ['='], speed: 1, sniffTicks: 0, visionTiles: 4, turns: [{ facing: { x: 0, y: -1 }, ticks: 90 }, { facing: { x: -1, y: 0 }, ticks: 90 }] },
  ],
  crate: { catId: 'grey', catName: 'Nimbus' },
  meta: {
    parTicks: 95 * 30, // cautious-bot median 79 s x 1.2, rounded up to 5 s (min 60 s); see playtest/BOT-REPORT.md
    meowRadiusTiles: 6,
    investigateTicks: 120,
    maxCoins: 22,
    twoCatRequired: true,
    objectives: ['Take turns: each cat holds a plate that opens a door in the other wing. Free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 1, y0: 1, x1: 9, y1: 5, untilObjective: 0, text: 'Your partner is in the south wing. Press {swap} and have it stand on the plate.' },
      { x0: 1, y0: 9, x1: 9, y1: 13, untilObjective: 0, text: 'This plate opens the north-wing door of the same colour. Hold it, then {swap}.' },
    ],
  },
};
