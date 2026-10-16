/**
 * Heist 10: After Hours. Idea: the key is a lever, not a lock. The night nurse walks between @ (9,9)
 * and % (28,9). While the pharmacy door V is shut her shortest way runs down the west wing, along the
 * whole kennel ward (past plate j, which holds the isolation door J open) and up the east wing: 29
 * tiles. Open V and the straight path through the pharmacy is 19 tiles. Guards may walk through an
 * opened VAULT door (only PLATE doors are masked in guardDoors()) and re-plan at every tile centre,
 * so from then on she walks row 9 only and the ward is empty.
 *
 *   Bold:   hold j on the ward floor and slip a cat into isolation between her rounds.
 *   Clever: sneak past the X-ray sentry for the key, open V while she is in the east wing (or she
 *           comes straight back at you), then work the ward in peace. The pharmacy coins and the
 *           reception doorway at x 7 become her new beat.
 *
 *            x 0         1         2         3
 *              0123456789012345678901234567890123
 */
const map = [
  '##################################', // 0
  '#......#....#.$.......$#.......$##', // 1   X-ray room x13..22 (door gap at 12,2)
  '#.12...#.......b.....k.#.$......##', // 2   spawns; key k (21,2)
  '#......#..$.#....3.b...#..b.....##', // 3   3  X-ray sentry
  '#....$.#....#.......$..#.....4..##', // 4   4  surgeon sentry (surgery, east wing top)
  '#......#....############......$.##', // 5
  '#...+..#....############.....b..##', // 6   + reception checkpoint
  '#......#....##....$...##........##', // 7   pharmacy x14..21, y7..11
  '#...........##..b.....##........##', // 8   reception doorway x7, y8..10
  '#........@...V.$............%...##', // 9   @ %  the nurse; V pharmacy door
  '#...........##.....b..##........##', // 10
  '#......#....##.......$##........##', // 11
  '#..b...#....############........##', // 12
  '#......#....############........##', // 13
  '#......#............$...........##', // 14  kennel ward y14..17
  '#.$....#.....b..j.........b.....##', // 15  j  plate for the isolation door
  '#......#...$..........b......$..##', // 16
  '#......#.......................+##', // 17  + ward checkpoint (east corner)
  '#......##$##$######J####$##$##$###', // 18  kennel cubbies; J isolation door
  '#......##########....$############', // 19  isolation kennel
  '#.EE...##########b....############', // 20  exit
  '#......##########.$C..############', // 21  C  crate
  '##################################', // 22
];

const S = { x: 0, y: 1 };
const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };

export default {
  id: 'heist-10',
  title: 'Heist 10: After Hours',
  name: 'After Hours',
  intro: 'The nurse walks the ward all night. Open the pharmacy and she takes the shortcut.',
  idea: 'Reroute a patrol: opening the vault gives the nurse a shorter way, so she leaves the kennel ward for good',
  map,
  doors: { V: { id: 'door-pharmacy' }, J: { id: 'door-isolation' } },
  guards: [
    { id: 'g-nurse', sprite: 'base', waypoints: ['@', '%'], speed: 1, sniffTicks: 45, visionTiles: 4 },
    { id: 's-xray', sprite: 'black', waypoints: ['3'], speed: 1, sniffTicks: 0, visionTiles: 4, facing: W, turns: [{ facing: W, ticks: 90 }, { facing: S, ticks: 60 }, { facing: E, ticks: 90 }, { facing: S, ticks: 60 }] },
    { id: 's-surgeon', sprite: 'brown', waypoints: ['4'], speed: 1, sniffTicks: 0, visionTiles: 4, facing: S, turns: [{ facing: S, ticks: 120 }, { facing: W, ticks: 120 }] },
  ],
  crate: { catId: 'peachies', catName: 'Patches' },
  meta: {
    parTicks: 105 * 30, // solver 1925 t (64.2 s) x 1.6 = 102.7 s beats cautious-bot median 72.4 s x 1.2 = 86.9 s; rounded up to 5 s
    meowRadiusTiles: 6,
    investigateTicks: 150,
    maxCoins: 24,
    twoCatRequired: true,
    // Key / rescue / exit lines (the key is optional: without it the first line stays up until the rescue).
    objectives: ['Free {cat} from the isolation kennel. Tip: open the pharmacy and watch where the nurse goes', 'Free {cat} from the isolation kennel', 'Both cats to the exit'],
    hints: [
      { x0: 8, y0: 7, x1: 12, y1: 11, untilObjective: 1, text: "The pharmacy key opens a shortcut. The nurse will take it, and leave the kennel ward. Open it while she's in the east wing." },
      { x0: 8, y0: 14, x1: 30, y1: 17, untilObjective: 1, text: 'Hold the plate and slip into isolation between her rounds, or reroute her first.' },
    ],
  },
};
