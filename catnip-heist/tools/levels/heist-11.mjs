/**
 * Heist 11: Signal Box. Idea: the yard dogs are signals. Three sentries stand beside the crossing
 * column x=16 and share one 240-tick clock: each looks away from the crossing (green) for 60 ticks
 * and at it (red) for 180, and each one is 24 ticks behind the one above it. A cat runs 4 tiles per 24 ticks,
 * so a cat that leaves the barrier as the top signal turns green rides a green wave all the way down
 * to the depot. The fence pockets (16,8) and (16,12) are never in any cone: the safe way is to hop
 * pocket to pocket between waves.
 *
 * Points switch: plate s in the signal box holds BOTH the platform barrier X and the siding gate L
 * open; plate x in the depot holds X open from the far end. One cat sets the points while the other
 * runs down, then they swap roles: the runner holds x so the holder can come down the same column.
 *
 *            x 0         1         2         3
 *              0123456789012345678901234567890123
 */
const map = [
  '##################################', // 0
  '#.........$..............#...$...#', // 1   platform | signal box
  '#.12.+........................s..#', // 2   spawns, checkpoint (5,2); plate s (30,2)
  '#...................$....#.......#', // 3
  '################X#################', // 4   barrier X (16,4)
  '#.......bb..$................$...#', // 5   track 1
  '#...$...............3...$........#', // 6   signal-1 (20,6)
  '#........................bb....$.#', // 7
  '################.#################', // 8   fence pocket (16,8)
  '#.......$...............b......$.#', // 9   track 2
  '#..$........4..............$.....#', // 10  signal-2 (12,10)
  '#.....bb............$............#', // 11
  '################+#################', // 12  fence pocket + checkpoint (16,12)
  '#......$...................bb....#', // 13  track 3
  '#.6..........7......5.........$..#', // 14  shunter 6<->7; signal-3 (20,14)
  '#........b..............$........#', // 15
  '#####L##########.#################', // 16  siding gate L (5,16); depot gap (16,16)
  '#.bbb.....$.#.............$....EE#', // 17  exit (31,17),(32,17)
  '#.C$.....$..........bb...........#', // 18  crate (2,18) in the mail car; gap (12,18)
  '#.bbb.......#.....$.....+...x...$#', // 19  checkpoint (24,19); plate x (28,19)
  '##################################', // 20
];

const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };
const PERIOD = 240;
const GREEN = 60;
/**
 * A 240-tick signal: green (looking away from the crossing) for GREEN ticks, red (looking at it) for
 * the rest; `off` shifts the phase so each signal turns green 24 ticks after the one above it.
 * (The plan's 120/120 split and its 90-tick fallback both played too easy: 60 ticks = 2 s of green
 * for a 4-tile dash, so the wave has to be ridden, not strolled.)
 */
const signal = (id, post, red, green, off) => ({
  id,
  sprite: 'black-white',
  waypoints: [post],
  speed: 1,
  sniffTicks: 0,
  visionTiles: 5,
  turns:
    off === 0
      ? [{ facing: green, ticks: GREEN }, { facing: red, ticks: PERIOD - GREEN }]
      : [{ facing: red, ticks: off }, { facing: green, ticks: GREEN }, { facing: red, ticks: PERIOD - GREEN - off }],
});

export default {
  id: 'heist-11',
  title: 'Heist 11: Signal Box',
  name: 'Signal Box',
  intro: 'The yard dogs are the signals. Ride the green wave, and set the points for your partner.',
  idea: 'Sentries as signals on one clock (a green wave), plus one switch plate that opens two gates',
  map,
  doors: { X: { id: 'door-barrier' }, L: { id: 'door-siding' } },
  links: { s: ['X', 'L'], x: ['X'] },
  guards: [
    signal('s-signal-1', '3', W, E, 0),
    signal('s-signal-2', '4', E, W, 24),
    signal('s-signal-3', '5', W, E, 48),
    { id: 'g-shunter', sprite: 'brown', waypoints: ['6', '7'], speed: 1, sniffTicks: 80, visionTiles: 3 },
  ],
  crate: { catId: 'mist', catName: 'Smokey' },
  meta: {
    parTicks: 140 * 30, // max(60 s, cautious-bot median 54 s x 1.2, solver 86.4 s x 1.6) = 138.2 s, rounded up to 5 s (ACT2 par rule)
    meowRadiusTiles: 6,
    investigateTicks: 150,
    maxCoins: 24,
    twoCatRequired: true,
    objectives: ['Set the points, ride the green wave and free {cat}', 'Both cats to the depot exit'],
    hints: [
      { x0: 14, y0: 1, x1: 18, y1: 3, untilObjective: 0, text: 'Watch the signal dogs: when the top one looks away, run straight down. The others turn away just in time.' },
      { x0: 26, y0: 1, x1: 32, y1: 3, untilObjective: 0, text: 'This switch opens the barrier AND the siding gate. Hold it while your partner runs.' },
      { x0: 25, y0: 17, x1: 31, y1: 19, text: 'Your turn to signal: hold this plate so your partner can come down.' },
    ],
  },
};
