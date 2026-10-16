/**
 * Heist 13: Kibble Factory. Idea: the long-way lure. Kibble Corp's factory floor at night: a mixing
 * hall (west), a packing hall (east) and a conveyor belt over the machine block (x12-15, rows 3-15).
 * The block's cat flap F is the only short way between the halls.
 *
 * A plate door never lets a dog through (guards path as if every plate door were shut), but an open
 * one still carries sight and sound. The doorman sits in a walled booth at the tunnel's east mouth:
 * its only way out is a bent corridor (x19, rows 4-7), so from the packing hall there is no line of
 * sight to meow at it, and the only straight line in is the flap tunnel. So: cat 2 holds the west flap plate, cat 1 stands in the flap
 * mouth and meows down the tunnel at the doorman. It cannot use the flap, so it walks all the way
 * round over the belt to sniff the west hall. The cats leapfrog through the flap (the east plate
 * holds it from the other side), let it shut behind them and raid the cage the doorman was guarding
 * before it walks home the long way.
 *
 * Riskier, richer: the belt route along the top (rows 1-2), past the fast belt pacer.
 *
 *            x 0         1         2
 *              012345678901234567890123456789
 */
const map = [
  '##############################', // 0
  '#.3..$...b.$.$..$..b.....$.4.#', // 1  conveyor belt, pacer 3<->4 (speed 2)
  '#.....$..........$.....$.....#', // 2
  '#..$........####.............#', // 3  machine block x12-15, rows 3-15
  '#...........####......$......#', // 4
  '#.$.........####.+#.#........#', // 5  + checkpoint (17,5); booth corridor x19, rows 4-7
  '#......b....####..#.#b.......#', // 6
  '#...........#######f#........#', // 7  east flap plate f (19,7) in the booth corridor, behind the doorman
  '#.....$...f.F....@..#....$...#', // 8  west plate f (10,8), flap F (12,8), doorman @ (17,8) facing S
  '#...........####....#........#', // 9
  '#..b....$...####....#.....$..#', // 10 the booth: x16-19, rows 8-10 (+ the strip x16 down the cage wall)
  '#...........####.#P######....#', // 11 cage door P (18,11), inside the doorman's cone
  '#.$...$.....####.#......#..p.#', // 12 cage plate p (27,12)
  '#...........####.#..$...#....#', // 13
  '#.12....$...####.#..C.$.#.EE.#', // 14 spawns, crate (20,14), exit (26,14) (27,14)
  '#.+.........####.#..$...#.$..#', // 15 + checkpoint at the start
  '##############################', // 16
];

export default {
  id: 'heist-13',
  title: 'Heist 13: Kibble Factory',
  name: 'Kibble Factory',
  intro: 'Dogs never use a cat flap. Meow through it, and the doorman walks the long way round.',
  idea: 'The long-way lure: an open plate door carries your meow, but a dog can never walk through it',
  map,
  doors: { F: { id: 'door-flap' }, P: { id: 'door-cage' } },
  guards: [
    // The doorman: watches the cage approach. The lure target.
    { id: 'g-door', sprite: 'brown', waypoints: ['@'], speed: 1, sniffTicks: 0, visionTiles: 4, facing: { x: 0, y: 1 } },
    // The belt pacer: turns the belt route into a timing run.
    { id: 'g-belt', sprite: 'base', waypoints: ['3', '4'], speed: 2, sniffTicks: 30, visionTiles: 3 },
  ],
  crate: { catId: 'cheesy', catName: 'Crumble' },
  meta: {
    parTicks: 70 * 30, // solver solution 42.4 s x 1.6 = 67.8 s, rounded up to 5 s. The bots score 0%: they never meow through a held flap (the booth leaves no other line of sight), see ACT2 par rule
    meowRadiusTiles: 7,
    investigateTicks: 180,
    maxCoins: 24,
    twoCatRequired: true,
    objectives: ['Lure the doorman the long way round, then free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 7, y0: 6, x1: 11, y1: 10, untilObjective: 0, text: 'Dogs can’t use the cat flap. Hold this plate, {swap}, and meow ({meow}) through the open flap: the doorman walks all the way round.' },
      { x0: 13, y0: 8, x1: 16, y1: 8, untilObjective: 0, text: 'It’s walking the long way round! Hold the plate up the booth corridor, {swap}, and bring your partner through.' },
    ],
  },
};
