/**
 * Heist 05: Watchtower Yard. Idea: sentry dogs. Four dogs stand still on their posts and turn on a
 * fixed schedule (GuardDef.turns, all on the same 240-tick clock), so the yard has safe lanes that
 * open and close. Read the turns, cross between them, then leapfrog plate door H into the compound.
 *
 *            x 0         1         2
 *              0123456789012345678901234567
 */
const map = [
  '############################', // 0
  '#..$.......$......#...$..C.#', // 1
  '#.......bb........#......$.#', // 2
  '#...$.............#..h..$..#', // 3
  '#.............@...#..EE....#', // 4   @ sentry (north)
  '#....bb.....$.....#........#', // 5
  '#.................####H#####', // 6
  '#...$.......b.........$....#', // 7
  '#.......%.......bb......+h.#', // 8   % sentry (west)
  '#..$...........$...........#', // 9
  '#....bb......&.........$...#', // 10  & sentry (centre)
  '#.............b.b.....$....#', // 11
  '#..$......$.........*......#', // 12  * sentry (south-east)
  '#######.bb.......$.........#', // 13
  '#.12..#.+..........$.......#', // 14  + checkpoint out of every sentry's sweep
  '#.....#...$.........bb.....#', // 15
  '#..$..r....................#', // 16
  '############################', // 17
];

const N = { x: 0, y: -1 };
const S = { x: 0, y: 1 };
const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };
// Vision 4 (was 5): the yard has lanes a careful or coin-hunting player can actually use.
const sentry = (id, sprite, post, turns) => ({ id, sprite, waypoints: [post], speed: 1, sniffTicks: 0, visionTiles: 4, turns });

export default {
  id: 'heist-05',
  title: 'Heist 05: Watchtower Yard',
  name: 'Watchtower Yard',
  intro: 'Sentry dogs never walk, but they turn like clockwork. Learn the rhythm and cross the yard.',
  idea: 'Sentry dogs that turn on a schedule',
  map,
  doors: { H: { id: 'door-compound' } },
  guards: [
    sentry('s-north', 'brown', '@', [{ facing: W, ticks: 60 }, { facing: S, ticks: 60 }, { facing: E, ticks: 60 }, { facing: S, ticks: 60 }]),
    sentry('s-west', 'base', '%', [{ facing: N, ticks: 60 }, { facing: E, ticks: 60 }, { facing: S, ticks: 60 }, { facing: E, ticks: 60 }]),
    sentry('s-centre', 'black', '&', [{ facing: E, ticks: 60 }, { facing: N, ticks: 60 }, { facing: W, ticks: 60 }, { facing: S, ticks: 60 }]),
    sentry('s-east', 'exotic', '*', [{ facing: N, ticks: 80 }, { facing: W, ticks: 80 }, { facing: E, ticks: 80 }]),
  ],
  crate: { catId: 'olive', catName: 'Juniper' },
  meta: {
    parTicks: 60 * 30, // cautious-bot median 28 s x 1.2, rounded up to 5 s (min 60 s); see playtest/BOT-REPORT.md
    meowRadiusTiles: 6,
    investigateTicks: 120,
    maxCoins: 20,
    twoCatRequired: true,
    objectives: ['Cross the yard and leapfrog into the compound to free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 1, y0: 14, x1: 12, y1: 16, untilObjective: 0, text: 'Sentries don’t walk, they turn like clockwork. A pale cone and a tick show where one looks next: go when it swings away.' },
    ],
  },
};
