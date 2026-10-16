/**
 * Heist 15: Night Gallery. Idea: statues. Every exhibit dog is a patrol whose second waypoint `!`
 * is inside the locked gem room, so it cannot path there and stands still on its plinth (the sim's
 * stepToward returns null). A meow drags an exhibit to the meow tile and, because investigateTicks
 * (18) is under the look-around period (24), it stays there, facing its last step: you place the
 * statues. Opening the vault makes `!` reachable and every exhibit wakes at once and converges on
 * the gem room, so the rescuer leaves through staff door S, a plate door guards never path through,
 * held by the partner on plate s in the staff passage.
 *
 *   north gallery: laser sentry @ sweeps E/W; studio door Q (plate q) guards the vault key
 *   west hall: st-hall 3 watches the vault door V; st-gallery 4 blocks the north gallery
 *   east hall: st-east 5; south corridor: st-south 6
 *
 *            x 0         1         2         3
 *              012345678901234567890123456789012345
 */
const map = [
  '####################################', // 0
  '################################$..#', // 1
  '#########.....$...........$....#.+.#', // 2   + checkpoint in the studio
  '#########...4...b...@...b......Q...#', // 3   4 st-gallery, @ laser sentry, Q studio door
  '#########$............$........#.k.#', // 4   k vault key
  '#########.....#############....#..$#', // 5
  '#########..b..#############...$#####', // 6
  '#########.....#.$.....$.###.q..#####', // 7   q plate for Q
  '#########...$.#..b...b..###....#####', // 8
  '#########.....#....!....###....#####', // 9   ! where every exhibit wants to go
  '#########.3...V....C....S.#.b..#####', // 10  3 st-hall, V vault, C crate, S staff door
  '#########.....#.........#$#...$#####', // 11
  '#########.....#..b...b..#.#..5.#####', // 12  5 st-east
  '#########..b..#.$.....$.#.#....#####', // 13
  '#.......#.....###########s#$...#####', // 14  s plate for S (staff passage)
  '#.12.+..#.$...###########.#....#####', // 15  + checkpoint in the lobby
  '#.......#.....###########.#....#####', // 16
  '#...$...#......b..$..........6.#####', // 17  6 st-south
  '#............$......b..$...$...#####', // 18
  '#.EE....############################', // 19
  '#.....$.############################', // 20
  '####################################', // 21
];

const N = { x: 0, y: -1 };
const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };
/** An exhibit: a patrol whose second waypoint is in the locked gem room, so it stands still. */
const statue = (id, sprite, post, facing, visionTiles) => ({ id, sprite, waypoints: [post, '!'], speed: 1, sniffTicks: 30, visionTiles, facing });

export default {
  id: 'heist-15',
  title: 'Heist 15: Night Gallery',
  name: 'Night Gallery',
  intro: 'The exhibits are dogs, frozen on their plinths. Move them. Then open the vault, and run.',
  idea: 'Statues: dogs whose rounds lead into the locked vault stand still; a meow drags one and it stays; the vault wakes them all',
  map,
  doors: { V: { id: 'door-vault' }, S: { id: 'door-staff' }, Q: { id: 'door-studio' } },
  guards: [
    statue('st-hall', 'brown', '3', E, 5),
    statue('st-gallery', 'black', '4', E, 6),
    statue('st-east', 'base', '5', N, 5),
    statue('st-south', 'exotic', '6', W, 6),
    { id: 's-laser', sprite: 'black-white', waypoints: ['@'], speed: 1, sniffTicks: 0, visionTiles: 7, turns: [{ facing: E, ticks: 120 }, { facing: W, ticks: 120 }] },
  ],
  crate: { catId: 'white', catName: 'Marble' },
  meta: {
    parTicks: 135 * 30, // solver 2468 t (82.3 s) x 1.6 = 131.7 s, rounded up to 5 s; the bots cannot model statues (0% wins, no median)
    meowRadiusTiles: 7,
    investigateTicks: 18,
    maxCoins: 24,
    twoCatRequired: true,
    objectives: ['Rearrange the exhibits, open the gem room and free {cat}', 'Both cats to the exit'],
    hints: [
      { x0: 9, y0: 11, x1: 13, y1: 18, untilObjective: 0, text: "These dogs are exhibits: they don't move until something calls them. Meow ({meow}) and they walk to you, and stay there. Step aside after you meow!" },
      { x0: 24, y0: 11, x1: 26, y1: 17, untilObjective: 0, text: 'When the vault opens, EVERY exhibit wakes up. Have your partner hold the staff door first.' },
    ],
  },
};
