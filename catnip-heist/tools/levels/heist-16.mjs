/**
 * Heist 16: Kibble Corp Tower (Act 2 finale). Idea: the split getaway. Each cat only has to stand on
 * SOME exit tile, and the helipad gate H is held open only by plate h inside the CEO's office. So one
 * cat holds h while its partner walks onto the helipad, then steps off h straight into the laundry
 * chute. Reprises on the way: leapfrog out of the lobby through the service door T (plates on both
 * sides) or prop the glass lift door G (one plate, lobby side) and slip past Barkley; read the two
 * searchlight clocks on the roof to take the key; pass the key (pair-wide) to the cat waiting at the
 * CEO door V; the lapdog in the office turns S/E.
 *
 *   lobby (x1..6, y19..25)    -> T -> stairwell -> roof (x1..29, y1..11) -> H -> helipad exit
 *                             -> G -> Barkley's hall (x8..28, y19..25) -> V -> CEO office + chute exit
 *   roof <-> hall: the east stair (x27, y12..18)
 *
 *            x 0         1         2         3
 *              0123456789012345678901234567890123456789
 */
const map = [
  '########################################', // 0
  '#................$............#..$.....#', // 1
  '#........$..........bb....$...#........#', // 2
  '#.............................#..b.....#', // 3
  '#....$bb..........$...........H.....EE.#', // 4   H helipad gate; EE helipad exit
  '#............bbb........bb....#........#', // 5
  '#.............................#..b.....#', // 6
  '#.........3...k.......4.......#....$...#', // 7   3 4 searchlights, k key
  '#.....b..........b..........$.#.......$#', // 8
  '#..$................b.........##########', // 9
  '#...........$..........$......##########', // 10
  '#...........................+.##########', // 11  + checkpoint at the top of the east stair
  '###.#######################.############', // 12  roof hatch (3,12); east stair x27
  '#$....#####################.############', // 13
  '#.t...#####################$############', // 14  t stairwell plate
  '#.....#####################.###.$......#', // 15
  '#...+.#####################.###......C.#', // 16  + stairwell checkpoint; C crate
  '#.....#####################.###.......$#', // 17
  '###T#######################.###...b....#', // 18  T service door
  '#......#...$.................##....5...#', // 19  5 lapdog
  '#.12.$.#.6........$.......7..##........#', // 20  6 7 8 9 Barkley's loop
  '#...g..#....bb..........b.....V...$....#', // 21  g lift plate; V CEO door
  '#......G....$.........$......##....bb..#', // 22  G glass lift door
  '#....t.#...$.......bb........##.......$#', // 23  t lobby plate
  '#......#.9................8..##..h.....#', // 24  h helipad plate (in the office)
  '#$.....#$......$............$##.+....E.#', // 25  + office checkpoint; E laundry chute
  '########################################', // 26
];

const N = { x: 0, y: -1 };
const S = { x: 0, y: 1 };
const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };

export default {
  id: 'heist-16',
  title: 'Heist 16: Kibble Corp Tower',
  name: 'Kibble Corp Tower',
  intro: "Barkley's tower: the roof, the CEO and one last cat. Two ways off. Take both.",
  idea: 'Finale: leapfrog or prop out of the lobby, read the searchlight clocks, pass the key, then split the getaway',
  map,
  doors: { T: { id: 'door-service' }, G: { id: 'door-lift' }, H: { id: 'door-helipad' }, V: { id: 'door-ceo' } },
  guards: [
    // Two searchlights on the roof, a half turn apart: each holds a facing 3 s.
    { id: 's-search-1', sprite: 'black-white', waypoints: ['3'], speed: 1, sniffTicks: 0, visionTiles: 5, turns: [{ facing: N, ticks: 90 }, { facing: E, ticks: 90 }, { facing: S, ticks: 90 }, { facing: W, ticks: 90 }] },
    { id: 's-search-2', sprite: 'black-white', waypoints: ['4'], speed: 1, sniffTicks: 0, visionTiles: 5, turns: [{ facing: S, ticks: 90 }, { facing: W, ticks: 90 }, { facing: N, ticks: 90 }, { facing: E, ticks: 90 }] },
    // The CEO's lapdog watches the office door side, then the crate side.
    { id: 's-lapdog', sprite: 'exotic', waypoints: ['5'], speed: 1, sniffTicks: 0, visionTiles: 4, turns: [{ facing: S, ticks: 120 }, { facing: E, ticks: 120 }] },
    // Barkley walks the penthouse hall loop (42 tiles at speed 2 + 4 sniffs of 6 = exactly 360 ticks, in step
    // with the searchlights' 360-tick clock). He can never path into the lobby (G is a plate door).
    { id: 'g-barkley', sprite: 'brown', waypoints: ['6', '7', '8', '9'], speed: 2, sniffTicks: 6, visionTiles: 4 },
  ],
  crate: { catId: 'olive', catName: 'Duchess' },
  meta: {
    parTicks: 110 * 30, // max(60 s, cautious-bot median 82 s x 1.2 = 98 s, solver 2057 t = 68.6 s x 1.6 = 110 s), rounded up to 5 s
    meowRadiusTiles: 7,
    investigateTicks: 210,
    maxCoins: 28,
    twoCatRequired: true,
    objectives: ["Reach the roof, take Barkley's key and free {cat}", 'One cat on the helipad, one in the laundry chute, or both on one'],
    hints: [
      { x0: 1, y0: 19, x1: 6, y1: 25, untilObjective: 0, text: 'Two ways up: leapfrog the service door, or prop the lift door and slip past Barkley.' },
      { x0: 26, y0: 1, x1: 29, y1: 7, fromObjective: 1, text: "The helipad gate opens only from the CEO's office. Wait here for your partner." },
      { x0: 31, y0: 23, x1: 38, y1: 25, fromObjective: 1, text: 'Hold the plate till your partner is on the helipad, then jump down the chute.' },
    ],
  },
};
