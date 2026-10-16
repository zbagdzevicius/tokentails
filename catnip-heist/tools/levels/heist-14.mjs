/**
 * Heist 14: The Golden Bowl. Idea: pass the key. `hasKey` belongs to the pair, not to one cat, so
 * one cat can grab the key in the high-roller room while the other, far away in the count room,
 * opens the cashier's cage. The key never has to cross the casino floor.
 *
 *   The count room (x29-34, y8-18) is behind the velvet rope Q (28,13), which has ONE plate q
 *   (25,15) on the casino floor and none inside. Cat A holds q while cat B slips into the count
 *   room; now nobody can let A in. So A crosses the floor to the high-roller room (gap 12,5) and
 *   takes the key on the dealer's off-beat while B waits at the cage door V (31,7) and opens it.
 *   (Alternative: B props Q open by standing in the doorway, A walks in and the cats regroup.
 *   Slower, and B stands where the east pit boss looks.)
 *
 *   Guards: the croupier @ turns N/E/S/W every 75 ticks in the middle of the floor; the dealer %
 *   sweeps the high-roller room; the cage sentry & watches the cage; two pit bosses box the
 *   tables, a counter dog loops the south of the count room.
 *
 *            x 0         1         2         3
 *              012345678901234567890123456789012345
 */
const map = [
  '####################################', // 0
  '##########.$...........$..###.....$#', // 1
  '##########.....b..%.b.....###.&..C.#', // 2   % dealer, & cage sentry, C crate
  '##########............k...###......#', // 3   k key
  '##########.+.....$.......$###.b....#', // 4   + checkpoint in the high-roller room
  '############.################...$..#', // 5   high-roller gap (12,5)
  '#.....##...........$........#$.....#', // 6
  '#.12..##.3.....4....7.....8.###V####', // 7   V cashier's cage (vault)
  '#.....##...bb...bb...bb.....#......#', // 8
  '#.....##................$...#+.....#', // 9   + checkpoint: safe north half of the count room
  '#..$..##..$......$$.........#.....$#', // 10
  '#.................$...b.....#..bb..#', // 11
  '#...+.........b...@.$.......#......#', // 12  @ croupier; + checkpoint by the entrance
  '#.....##.....$....$.........Q......#', // 13  Q velvet rope
  '#.....##...........$........#$=..~.#', // 14
  '#...$.##...bb........bb..q..#..bb..#', // 15  q rope plate
  '#.....##........bb..........#......#', // 16
  '#.EE..##.6.....5....*.....9.#.?..^.#', // 17
  '#.....##..$..............$..#.....$#', // 18
  '####################################', // 19
];

const N = { x: 0, y: -1 };
const S = { x: 0, y: 1 };
const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };
const pit = (id, sprite, wps, sniffTicks) => ({ id, sprite, waypoints: wps, speed: 1, sniffTicks, visionTiles: 3 });

export default {
  id: 'heist-14',
  title: 'Heist 14: The Golden Bowl',
  name: 'The Golden Bowl',
  intro: 'One key, two cats, far apart. Whoever grabs it, the other can open the cage.',
  idea: 'Pass the key: the key is shared, so one cat grabs it while the other, far away, opens the vault',
  map,
  doors: { Q: { id: 'door-rope' }, V: { id: 'door-cage' } },
  guards: [
    {
      id: 's-croupier', sprite: 'black-white', waypoints: ['@'], speed: 1, sniffTicks: 0, visionTiles: 5,
      turns: [{ facing: N, ticks: 75 }, { facing: E, ticks: 75 }, { facing: S, ticks: 75 }, { facing: W, ticks: 75 }],
    },
    {
      id: 's-dealer', sprite: 'black', waypoints: ['%'], speed: 1, sniffTicks: 0, visionTiles: 5,
      turns: [{ facing: E, ticks: 100 }, { facing: S, ticks: 50 }, { facing: W, ticks: 100 }, { facing: S, ticks: 50 }],
    },
    {
      id: 's-cage', sprite: 'brown', waypoints: ['&'], speed: 1, sniffTicks: 0, visionTiles: 4,
      turns: [{ facing: S, ticks: 150 }, { facing: E, ticks: 150 }],
    },
    pit('g-pit-west', 'base', ['3', '4', '5', '6'], 22),
    pit('g-pit-east', 'exotic', ['7', '8', '9', '*'], 22),
    pit('g-counter', 'base', ['=', '~', '^', '?'], 102),
  ],
  crate: { catId: 'maine', catName: 'Lucky' },
  meta: {
    parTicks: 145 * 30, // max(60 s, cautious-bot median 114.9 s x 1.2 = 137.9 s, solver 90.2 s x 1.6 = 144.4 s), rounded up to 5 s
    meowRadiusTiles: 6,
    investigateTicks: 150,
    maxCoins: 26,
    twoCatRequired: true,
    objectives: ["Get the key and open the cashier's cage for {cat}", 'Both cats to the exit'],
    hints: [
      { x0: 29, y0: 8, x1: 34, y1: 10, untilObjective: 0, text: 'Wait here. The key is shared: when your partner grabs it, you can open the cage from right here.' },
      { x0: 22, y0: 13, x1: 27, y1: 17, untilObjective: 0, text: 'Hold the rope plate for your partner, or have them stand in the doorway to prop it.' },
    ],
  },
};
