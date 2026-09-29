/**
 * Heist 08: Kibble Corp HQ (finale). Everything at once:
 *   - plate door A with a plate on each side: leapfrog in, and leapfrog out again to the exit;
 *   - the sentry yard (north-west): two turning sentries guard plate f, which holds door F open;
 *   - split up: while one cat sits on f in the yard, the other takes F into the far corridor;
 *   - tight timing: a fast dog paces the one-tile corridor, niches to hide in;
 *   - key and vault with a patrol loop: a fast dog laps the vault building in the hall;
 *   - meow lure: a doorman stares at the vault door; lure it off to get in, and again to get out.
 *
 *            x 0         1         2         3
 *              0123456789012345678901234567890123456789
 */
const map = [
  '   ##############                       ', // 0
  '   #............#         ##############', // 1
  ' ###..$......$..#         #.6...$...$7.#', // 2   6 7  corridor pacer
  ' #......bb......#         #.##$##.####.#', // 3
  '##...4..........#         #.##.##$##...#', // 4   4  yard sentry
  '#.$......$..b...#         #+########$..#', // 5
  '#...........b...#         #.#      #.b.#', // 6
  '#...bb....5.....#         #$#      #...#', // 7   5  yard sentry
  '#.............$.#         #.#      #.k.#', // 8
  '#.f....b........#         #.#      #..$#', // 9
  '#....$.......+..#         #.#      #####', // 10
  '#############.#############F####        ', // 11
  '          #....................#        ', // 12
  '          #.........$..........#        ', // 13
  '          #...@............%.$.#        ', // 14  @ % ~ =  hall loop
  '          #.$....########......#        ', // 15
  '          #......#$....C#......#        ', // 16
  '          #....b.#......#.b....#        ', // 17
  '###########....b.#...$..#.b....#        ', // 18
  '#.........#.$....#.$....#......#        ', // 19
  '#..$..b...#......###V####....$.#        ', // 20
  '#......a..#....................#        ', // 21
  '#...12....A.a..................#        ', // 22
  '#.........#...=............~...#        ', // 23
  '#.EE......#.....$...3....$.....#        ', // 24  3  vault doorman
  '#.......$.#+.................$.#        ', // 25
  '################################        ', // 26
];

const N = { x: 0, y: -1 };
const S = { x: 0, y: 1 };
const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };

export default {
  id: 'heist-08',
  title: 'Heist 08: Kibble Corp HQ',
  name: 'Kibble Corp HQ',
  intro: 'The big one. Every trick you know, one building. Bring Clover home.',
  idea: 'Finale: plates, sentries, split-up, corridor timing, key and vault, meow lure',
  map,
  doors: { A: { id: 'door-lobby' }, F: { id: 'door-archive' }, V: { id: 'door-vault' } },
  guards: [
    { id: 'g-loop', sprite: 'black-white', waypoints: ['@', '%', '~', '='], speed: 2, sniffTicks: 24, visionTiles: 3 },
    { id: 'g-doorman', sprite: 'brown', waypoints: ['3'], speed: 1, sniffTicks: 0, visionTiles: 4, facing: N },
    { id: 's-yard-1', sprite: 'base', waypoints: ['4'], speed: 1, sniffTicks: 0, visionTiles: 4, turns: [{ facing: E, ticks: 60 }, { facing: S, ticks: 60 }, { facing: W, ticks: 60 }, { facing: S, ticks: 60 }] },
    { id: 's-yard-2', sprite: 'black', waypoints: ['5'], speed: 1, sniffTicks: 0, visionTiles: 4, turns: [{ facing: N, ticks: 60 }, { facing: W, ticks: 60 }, { facing: S, ticks: 60 }, { facing: E, ticks: 60 }] },
    { id: 'g-pacer', sprite: 'exotic', waypoints: ['6', '7'], speed: 2, sniffTicks: 20, visionTiles: 4 },
  ],
  crate: { catId: 'white', catName: 'Clover' },
  meta: {
    parTicks: 210 * 30,
    meowRadiusTiles: 6,
    investigateTicks: 180,
    maxCoins: 28,
    twoCatRequired: true,
    objectives: ['One cat holds the yard plate, the other fetches the key', 'Lure the doorman, open the vault and free {cat}', 'Both cats back to the lobby exit'],
    hints: [
      { x0: 1, y0: 1, x1: 15, y1: 10, untilObjective: 0, text: 'The plate in the far corner holds the archive door open. Mind the sentries.' },
      { x0: 11, y0: 21, x1: 30, y1: 25, text: 'The doorman watches the vault. Press {meow} out of its sight to lure it away.' },
    ],
  },
};
