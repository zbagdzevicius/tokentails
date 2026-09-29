/**
 * Heist 06: Conveyor Halls. Idea: tight patrol timing. Three one-tile corridors snake down the map,
 * each with a fast dog pacing it end to end. Two-deep niches in the walls are the only hiding
 * places: follow a dog, duck into a niche as it turns, then run on behind it. At the bottom, one cat
 * hides in the plate niche (l) to hold door L while the other slips into the crate room.
 *
 *            x 0         1         2
 *              012345678901234567890123456789
 */
const map = [
  '##############################', // 0
  '#....####$#####.#####$########', // 1   niche backs
  '#.12.####.#####.#####.########', // 2   niche necks
  '#.......3...$.....$.....$.4..#', // 3   corridor 1: 3 <-> 4
  '#$...#######################+#', // 4
  '############################$#', // 5
  '############################.#', // 6
  '##..5.....$.....$.....$..6...#', // 7   corridor 2: 5 <-> 6
  '##.####.#####.#####.##########', // 8
  '##$####$#####+#####$##########', // 9
  '##.###########################', // 10
  '##..7..$....$.....$.8...L$..l#', // 11  corridor 3: 7 <-> 8, door L
  '#########.#####.#########....#', // 12
  '#########$#####l#########..C$#', // 13  plate niche l
  '#########################EE..#', // 14
  '##############################', // 15
];

const pacer = (id, sprite, a, b) => ({ id, sprite, waypoints: [a, b], speed: 2, sniffTicks: 20, visionTiles: 4 });

export default {
  id: 'heist-06',
  title: 'Heist 06: Conveyor Halls',
  name: 'Conveyor Halls',
  intro: 'Narrow halls, fast dogs. Duck into the wall niches and run in their wake.',
  idea: 'Tight patrol timing in corridors',
  map,
  doors: { L: { id: 'door-dispatch' } },
  guards: [pacer('g-hall-1', 'brown', '3', '4'), pacer('g-hall-2', 'black', '5', '6'), pacer('g-hall-3', 'black-white', '7', '8')],
  crate: { catId: 'maine', catName: 'Waffles' },
  meta: {
    parTicks: 120 * 30,
    meowRadiusTiles: 6,
    investigateTicks: 90,
    maxCoins: 20,
    twoCatRequired: true,
    objectives: ['Slip through the halls and free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 5, y0: 1, x1: 27, y1: 3, untilObjective: 0, text: 'Follow the dog and hide in a niche when it turns back.' },
      { x0: 2, y0: 11, x1: 23, y1: 13, untilObjective: 0, text: 'One cat sits on the plate in the niche while the other takes door L.' },
    ],
  },
};
