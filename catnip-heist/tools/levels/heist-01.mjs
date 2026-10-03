/**
 * Heist 01 (tutorial): move, sneak, swap and hold a plate door. Built by tools/build-levels.mjs.
 * Tutorial room x 0..10, warehouse x 11..37.
 */
const map = [
  '######################################', // 0
  '#.........#EE....$.....#$...........k#', // 1
  '#.12......#EE..........#......$......#', // 2
  '#.........#.....bbb....#.....$.......#', // 3
  '#...bb....#..$..bbb....###D###########', // 4
  '#...bb....#..........$..r............#', // 5
  '#.........#..b.........r....$........#', // 6
  '#......$..#..b..bbbbb..r.............#', // 7
  '#.........#..b.........r.......d.....#', // 8
  '#...bb....#....$...............$.....#', // 9
  '#...bb....#..bb.........bb.......$...#', // 10
  '#a........A+.a..........bb......+....#', // 11
  '#.........#..........$...............#', // 12
  '###########..####...####...###########', // 13
  '          #................#.........#', // 14
  '          #...$......$.....#...$.....#', // 15
  '          #..............$.V......$..#', // 16
  '          #....bbb.........#........C#', // 17
  '          #...$.......bbb..#....$....#', // 18
  '          #.........$......#.........#', // 19
  '          ############################', // 20
];

export default {
  id: 'heist-01',
  title: 'Heist 01: Kibble Corp Warehouse',
  name: 'Kibble Corp Warehouse',
  intro: 'Learn the ropes: sneak past the guard dogs, hold a plate for your partner and free Mochi.',
  idea: 'Tutorial: move, sneak, swap cats, plate doors',
  map,
  doors: { A: { id: 'door-tutorial' }, D: { id: 'door-keyroom' }, V: { id: 'door-vault' } },
  guards: [
    {
      id: 'g-tutor',
      sprite: 'base',
      waypoints: [
        { x: 1, y: 7 },
        { x: 9, y: 7 },
      ],
      speed: 1,
      // Long pauses at both ends (75 ticks, was 45): time to read the cone and sneak past.
      sniffTicks: 75,
      // The tutorial dog sees 3 tiles: enough to teach the cone, short enough to sneak round.
      visionTiles: 3,
    },
    {
      id: 'g-hall',
      sprite: 'brown',
      // Loop around the shelf block. The west leg stops at x 19, so nothing near the entry plate
      // (13,11) is ever in its sight, not even a cat let go a step off the plate.
      waypoints: [
        { x: 19, y: 5 },
        { x: 22, y: 5 },
        { x: 22, y: 9 },
        { x: 19, y: 9 },
      ],
      speed: 1,
      sniffTicks: 30,
      visionTiles: 4,
    },
    {
      id: 'g-keys',
      sprite: 'black-white',
      // Paces x 27 (was 28): with vision 3, every tile within a step of the key-room plate (31,8) is
      // out of its sight, so the cat holding that plate is safe while you play the other one.
      waypoints: [
        { x: 27, y: 5 },
        { x: 27, y: 12 },
      ],
      speed: 1,
      sniffTicks: 30,
      visionTiles: 3,
    },
    {
      id: 'g-vault',
      sprite: 'exotic',
      waypoints: [
        { x: 12, y: 16 },
        { x: 25, y: 16 },
      ],
      speed: 1,
      sniffTicks: 60,
      // 4 (was 5): once the vault is open it watches less of the crate room.
      visionTiles: 4,
    },
  ],
  crate: { catId: 'siamese', catName: 'Mochi' },
  meta: {
    maxCoins: 20,
    twoCatRequired: true,
    parTicks: 135 * 30, // cautious-bot median 108 s x 1.2, rounded up to 5 s (min 60 s); see playtest/BOT-REPORT.md
    meowRadiusTiles: 6,
    investigateTicks: 120,
    objectives: [
      'Hold the plate and swap to open the door',
      'Get both cats into the warehouse',
      'One cat holds the key-room plate, the other grabs the key',
      'Open the vault and free the shelter cat',
      'Both cats to the exit portal',
    ],
    hints: [
      // Conditional zones first: the other cat is holding a tutorial plate for you.
      { x0: 1, y0: 1, x1: 9, y1: 12, whileOtherHolds: 'plate-a2', text: 'Door’s open! Bring this cat through to the warehouse.' },
      { x0: 1, y0: 1, x1: 9, y1: 12, whileOtherHolds: 'plate-a1', text: 'Door’s open! Walk this cat through, then hold the next plate.' },
      { x0: 11, y0: 9, x1: 16, y1: 12, whileOtherHolds: 'plate-a1', untilObjective: 1, text: 'Stand on this plate, then press {swap} to bring your other cat.' },
      { x0: 1, y0: 1, x1: 9, y1: 3, text: 'Move with {move}. Stay out of the guard dog’s vision cone: wait for it to turn its back.' },
      { x0: 1, y0: 8, x1: 9, y1: 12, text: 'Stand right on the plate (it glows and the door opens), then press {swap} to swap cats.' },
      { x0: 11, y0: 9, x1: 16, y1: 12, untilObjective: 1, text: 'Hold this plate so your other cat can come through too.' },
      { x0: 27, y0: 7, x1: 34, y1: 10, untilObjective: 2, text: 'One cat holds the plate, the other sneaks into the key room. A cat left on a plate can still be seen.' },
      { x0: 20, y0: 14, x1: 26, y1: 19, untilObjective: 3, text: 'Press {meow} to meow: a dog that hears it walks over to sniff, so lure it, then slip past.' },
      { x0: 28, y0: 14, x1: 36, y1: 19, untilObjective: 3, text: 'Press {act} next to the crate to free the shelter cat.' },
    ],
    tutorial: { x0: 0, y0: 0, x1: 10, y1: 13 },
  },
};
