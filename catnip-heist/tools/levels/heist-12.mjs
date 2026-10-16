/**
 * Heist 12: Spin Cycle. Idea: the doorstop. A plate door never closes while a cat stands in it, so
 * one plate is enough for both cats: cat A holds the plate, cat B walks into the doorway and stops
 * on the door tile, swap, A steps off the plate (the door stays open on B) and walks through.
 *
 * Kibble Corp's 24-hour laundromat. Each dryer door into the back office (crate and exit) has one
 * plate outside, in a dead-end niche (f: change machine, d: detergent). The propping cat stands in a
 * doorway the hall patrols can see, so the prop has to be timed.
 *   F north dryer door (24,3)  <- plate f (20,1)   aisle dog @ % & * sees it at its east turn
 *                                 and plate f (27,14) inside, in the manager's south sweep: the slow,
 *                                 risky leapfrog the prop beats (the synthetic players only leapfrog)
 *   D south dryer door (24,16) <- plate d (20,18)  rounds dog 3 4 5 6 passes it on its lap
 *   = office manager: turning sentry, north 4 s / south 4 s
 *
 *            x 0         1         2         3
 *              01234567890123456789012345678901
 */
const map = [
  '################################', // 0
  '#....###############f####......#', // 1   f plate (change-machine niche)
  '#.12.###############.####.$..C.#', // 2   spawns; crate
  '#....#.@..$............%F......#', // 3   F north dryer door; aisle loop @ % & *
  '#....#.*.......$......$&#.....$#', // 4
  '#....#..bbbb.bbbb.bbbb..#......#', // 5   washer row A (gaps x12, x17)
  '#....#..bbbb$bbbb.bbbb..#.b....#', // 6
  '#....#..................#....b.#', // 7
  '#....#.6.$........b....5#......#', // 8   rounds loop 3 4 5 6
  '#.$.......b.....$.......#$.....#', // 9   shop front
  '#.............b......$..#..=..$#', // 10  = office manager
  '#...........$......b....#......#', // 11
  '#....#.$................#....b.#', // 12
  '#....#..bbbbbbb.b$bbbb..#.b....#', // 13  washer row B (gap x15)
  '#....#..bbbbbbb.bbbbbb..#..f$..#', // 14  f inside plate (slow way: leapfrog)
  '#..+.#.3...............4#......#', // 15  + checkpoint (street)
  '#....#....$.....$.....$.D..+...#', // 16  D south dryer door; + checkpoint (office)
  '#..$.###############.####....EE#', // 17  exit
  '#....###############d####.$....#', // 18  d plate (detergent niche)
  '################################', // 19
];

const N = { x: 0, y: -1 };
const S = { x: 0, y: 1 };

export default {
  id: 'heist-12',
  title: 'Heist 12: Spin Cycle',
  name: 'Spin Cycle',
  intro: "One dryer door, one plate, two cats. A door won't shut on a cat standing in it.",
  idea: 'The doorstop: a cat standing in a doorway keeps a plate door open, so both cats get through on one plate',
  map,
  doors: { F: { id: 'door-dryer-north' }, D: { id: 'door-dryer-south' } },
  guards: [
    { id: 'g-aisle', sprite: 'black', waypoints: ['@', '%', '&', '*'], speed: 1, sniffTicks: 24, visionTiles: 3 },
    { id: 'g-rounds', sprite: 'base', waypoints: ['3', '4', '5', '6'], speed: 1, sniffTicks: 48, visionTiles: 3 },
    { id: 's-manager', sprite: 'brown', waypoints: ['='], speed: 1, sniffTicks: 0, visionTiles: 4, turns: [{ facing: N, ticks: 120 }, { facing: S, ticks: 120 }] },
  ],
  crate: { catId: 'grey', catName: 'Suds' },
  meta: {
    parTicks: 95 * 30, // solver run 1768 t (58.9 s) x 1.6 = 94.3 s, rounded up to 5 s (cautious-bot median 63 s x 1.2 = 76 s is lower; the bots never prop the door)
    meowRadiusTiles: 6,
    investigateTicks: 150,
    maxCoins: 24,
    twoCatRequired: true,
    objectives: ['Prop a dryer door open and free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 20, y0: 1, x1: 20, y1: 2, untilObjective: 0, text: "Hold the plate, {swap}, and park the other cat IN the doorway. A door won't close on a cat." },
      { x0: 20, y0: 17, x1: 20, y1: 18, untilObjective: 0, text: "Hold the plate, {swap}, and park the other cat IN the doorway. A door won't close on a cat." },
      { x0: 21, y0: 2, x1: 24, y1: 4, untilObjective: 0, text: 'Now step off the plate and walk through: your partner is holding the door.' },
      { x0: 21, y0: 15, x1: 24, y1: 17, untilObjective: 0, text: 'Now step off the plate and walk through: your partner is holding the door.' },
      { x0: 25, y0: 12, x1: 30, y1: 15, untilObjective: 0, text: 'This plate holds the north dryer door too, but the manager turns south to look at it. Propping the door is quicker.' },
    ],
  },
};
