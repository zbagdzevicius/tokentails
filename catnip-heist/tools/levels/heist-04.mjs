/**
 * Heist 04: Counting House. Idea: key + vault with a patrol loop. A fast dog laps the vault building.
 * The key is in the office behind plate door G, whose outside plate sits beside the patrol lane, so
 * one cat holds it in the gaps while the other raids the office. Then open the vault (V) between laps
 * and dodge the slow dog inside to free the shelter cat.
 *
 *            x 0         1         2         3
 *              012345678901234567890123456789012345
 */
const map = [
  '      ##############################', // 0
  '      #..$........$.........+#.....#', // 1
  '      #.......bb.............#...k.#', // 2
  '      #..@.............%.....#.$.$.#', // 3   @ % = ~  patrol loop round the vault (east leg 4 tiles from the office plate)
  '      #.$..........bb........#.....#', // 4
  '      #....$.............$...G.....#', // 5
  '      #.....###########......#.$...#', // 6
  '      #.....#..$...$..#......#...g.#', // 7
  '      #.....#.3.....4.#....g.#######', // 8   3 4  vault patrol (back row, clear of the doorway)
  '      #..$..#.........#......#      ', // 9
  '      #.....#$.......$#...$..#      ', // 10
  '#######.....#.$......C#......#      ', // 11
  '#.....#.....#####V#####......#      ', // 12
  '#E....#..$.........$.......$.#      ', // 13
  '#E.12.r......................#      ', // 14
  '#.....#..=.............~.....#      ', // 15
  '#..$..#.......bb....bb.......#      ', // 16
  '#.....#....$.........$.......#      ', // 17
  '#######.........$..+.........#      ', // 18  + checkpoint below the vault, out of the lap
  '      ########################      ', // 19
];

export default {
  id: 'heist-04',
  title: 'Heist 04: Counting House',
  name: 'Counting House',
  intro: 'A fast dog laps the vault. Grab the key from the office and crack the vault between laps.',
  idea: 'Key and vault with a patrol loop',
  map,
  doors: { G: { id: 'door-office' }, V: { id: 'door-vault' } },
  guards: [
    { id: 'g-lap', sprite: 'black-white', waypoints: ['@', '%', '~', '='], speed: 2, sniffTicks: 24, visionTiles: 4 },
    { id: 'g-vault', sprite: 'exotic', waypoints: ['3', '4'], speed: 1, sniffTicks: 30, visionTiles: 3 },
  ],
  crate: { catId: 'peachies', catName: 'Pumpkin' },
  meta: {
    parTicks: 90 * 30, // cautious-bot median 72 s x 1.2, rounded up to 5 s (min 60 s); see playtest/BOT-REPORT.md
    meowRadiusTiles: 6,
    investigateTicks: 120,
    maxCoins: 24,
    twoCatRequired: true,
    objectives: ['One cat holds the plate outside the office, the other grabs the key', 'Open the vault and free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 30, y0: 1, x1: 34, y1: 7, untilObjective: 1, text: 'The plate in here only holds the door while you stand on it. To get out, have your partner hold the outside plate.' },
      { x0: 23, y0: 1, x1: 28, y1: 9, untilObjective: 0, text: 'Hold the plate by the office door, then {swap}. Mind the dog’s lap.' },
      { x0: 7, y0: 13, x1: 28, y1: 18, untilObjective: 1, text: 'Walk into the vault door with the key to open it.' },
    ],
  },
};
