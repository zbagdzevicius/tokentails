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
  '#....$.......+..#         #.#      #####', // 10  + checkpoint just inside the yard gap (out of every sentry's sweep)
  '#############.#############F####        ', // 11
  '          #....................#        ', // 12
  '          #.........$..........#        ', // 13
  '          #.....@..........%.$.#        ', // 14  @ % ~ =  hall loop (west leg hugs the vault building)
  '          #.$....########......#        ', // 15
  '          #......#$....C#......#        ', // 16
  '          #....b.#......#.b....#        ', // 17
  '###########....b.#...$..#.b....#        ', // 18
  '#.........#.$....#.$....#......#        ', // 19
  '#..$..b...#......###V####....$.#        ', // 20
  '#......a..#....................#        ', // 21
  '#...12....A+a..................#        ', // 22  + checkpoint past the lobby door
  '#.........#.....=..........~...#        ', // 23  = turns 4 tiles from the lobby plate
  '#.EE......#.....$...3....$.....#        ', // 24  3  vault doorman
  '#.......$.#..................$.#        ', // 25
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
    // The doorman stares at the vault door but glances along the hall now and then (a slow sentry):
    // lure it off with a meow, or slip in while it looks away.
    { id: 'g-doorman', sprite: 'brown', waypoints: ['3'], speed: 1, sniffTicks: 0, visionTiles: 4, facing: N, turns: [{ facing: N, ticks: 120 }, { facing: E, ticks: 90 }, { facing: N, ticks: 120 }, { facing: W, ticks: 90 }] },
    // Yard sentries hold each facing 3 s (was 2 s), so the 1.2 s telegraph leaves time to plan a crossing.
    { id: 's-yard-1', sprite: 'base', waypoints: ['4'], speed: 1, sniffTicks: 0, visionTiles: 4, turns: [{ facing: E, ticks: 90 }, { facing: S, ticks: 90 }, { facing: W, ticks: 90 }, { facing: S, ticks: 90 }] },
    { id: 's-yard-2', sprite: 'black', waypoints: ['5'], speed: 1, sniffTicks: 0, visionTiles: 4, turns: [{ facing: N, ticks: 90 }, { facing: W, ticks: 90 }, { facing: S, ticks: 90 }, { facing: E, ticks: 90 }] },
    { id: 'g-pacer', sprite: 'exotic', waypoints: ['6', '7'], speed: 2, sniffTicks: 10, visionTiles: 4 },
  ],
  crate: { catId: 'white', catName: 'Clover' },
  meta: {
    parTicks: 170 * 30, // cautious-bot median 138 s x 1.2, rounded up to 5 s (min 60 s); see playtest/BOT-REPORT.md
    meowRadiusTiles: 6,
    investigateTicks: 180,
    maxCoins: 28,
    twoCatRequired: true,
    objectives: ['Take the gap north of the hall into the sentry yard and hold its far-corner plate, so your other cat can take the archive door to the key', 'Lure the doorman or wait for it to look away, open the vault and free {cat}', 'Both cats back to the lobby exit'],
    hints: [
      { x0: 1, y0: 1, x1: 15, y1: 10, untilObjective: 0, text: 'Hold the plate in the far corner: it opens the archive door. Sentries turn on a clock: a pale cone shows where they look next.' },
      { x0: 11, y0: 12, x1: 30, y1: 14, untilObjective: 0, text: 'The gap in the north wall leads to the sentry yard. Its far-corner plate opens the archive door (east) for your other cat.' },
      { x0: 11, y0: 19, x1: 30, y1: 25, untilObjective: 0, text: 'Head north through the hall to the gap in the wall: the sentry yard plate comes first.' },
      { x0: 11, y0: 15, x1: 30, y1: 25, fromObjective: 1, text: 'The doorman watches the vault but glances away now and then. Or meow ({meow}) out of its sight: it walks over to sniff, so hide.' },
    ],
  },
};
