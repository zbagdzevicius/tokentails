/**
 * Heist 16: Kibble Corp Tower (Act 2 finale). Idea: the forced split getaway. The win needs each cat on
 * SOME exit tile, and here every exit sits behind a two-door valve whose plate is on the far side:
 *
 * - The CEO's office (crate, laundry chute E) is entered only through the airlock A.A: two plate doors
 *   in series, both held by plate a out in the hall. A cat can prop ONE plate door by standing in it,
 *   but never two that are a tile apart, so once the plate holder steps off, nobody else gets in. The
 *   office cat is sealed in for good.
 * - The helipad (exit EE) is entered only through the valve H.H, both doors held by plate h, which is
 *   inside the office. Only the sealed office cat can open it, and it cannot follow.
 *
 * So exactly one cat ends in the chute and the other on the helipad. There is no checkpoint behind
 * either valve, so being caught can only throw a cat out, never in.
 *
 * Act 2 reprises on the way: leapfrog the service door T or prop (doorstop) the lift door G out of the
 * lobby; take the key between the roof searchlights, the roof guard and the pilot (sentry clock); the
 * key is pair-wide, so the cat that fetched it on the roof can be far away while the office cat opens
 * the safe V with it (pass the key); leave the east stair while the concierge at its foot faces away;
 * then the getaway: the hall cat climbs back to the roof and waits by the helipad valve while the
 * office cat frees Duchess and holds h.
 *
 *   lobby (x1..6, y19..25) -> T -> stairwell -> hatch -> roof (x1..29, y1..11) -> H.H -> helipad
 *                          -> G -> Barkley's hall (x8..28, y19..25) -> A.A -> CEO office -> V -> safe room
 *   roof <-> hall: the east stair (x27, y12..18)
 *
 *            x 0         1         2         3
 *              0123456789012345678901234567890123456789
 */
const map = [
  '########################################', // 0
  '#................$............###$.....#', // 1
  '#........$..........bb....$...###......#', // 2
  '#.............................###.b....#', // 3
  '#....$bb..........$...........H.H...EE.#', // 4   helipad valve H.H (plate h in the office); EE helipad exit
  '#............bbb........bb....###......#', // 5
  '#........................4....###.b....#', // 6   4 east searchlight
  '#.........3...k...............###..$...#', // 7   3 west searchlight, k key
  '#.....b..........b...^......$~###.....$#', // 8   ^ ~ the pilot's beat
  '#..$.!.............?b.........##########', // 9   ! ? the roof guard's beat
  '#...........$..........$......##########', // 10
  '#............................+##########', // 11  + checkpoint above the east stair
  '###.#######################.############', // 12  roof hatch (3,12); east stair x27
  '#$....#####################.############', // 13
  '#.t...#####################+############', // 14  t stairwell plate; + checkpoint on the east stair
  '#.....#####################$####$......#', // 15  the CEO's safe room (x32..38, y15..17)
  '#.....#####################.####.....C.#', // 16  C crate
  '#..+..#####################.####......$#', // 17  + checkpoint just inside the service door
  '###T#######################.#######V####', // 18  T service door; V safe door (the key)
  '#......#...$.................###.....5.#', // 19  5 lapdog
  '#.12.$.#.6........$.....7..@.###.......#', // 20  spawns 1 2; 6 7 8 9 Barkley's loop; @ concierge
  '#...g..#....bb.......b.......A.A..$....#', // 21  g lift plate; A.A the office airlock (plate a)
  '#......G+...$.........$......###...b...#', // 22  G glass lift door; + checkpoint just inside it
  '#....t.#...$.......bb........###......$#', // 23  t lobby plate
  '#......#.9..............8....###.h.....#', // 24  h helipad plate (in the office)
  '#$.....#$......$...........$a###.....E.#', // 25  a airlock plate; E laundry chute
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
  idea: 'Finale: two airlocks force the split getaway; reprises the doorstop, the sentry clock and the key pass',
  map,
  doors: { T: { id: 'door-service' }, G: { id: 'door-lift' }, A: { id: 'door-airlock' }, H: { id: 'door-helipad' }, V: { id: 'door-safe' } },
  guards: [
    // Two searchlights on the roof, a half turn apart on one 360-tick clock: each holds a facing 3 s.
    { id: 's-search-1', sprite: 'black-white', waypoints: ['3'], speed: 1, sniffTicks: 0, visionTiles: 6, turns: [{ facing: N, ticks: 90 }, { facing: E, ticks: 90 }, { facing: S, ticks: 90 }, { facing: W, ticks: 90 }] },
    { id: 's-search-2', sprite: 'black-white', waypoints: ['4'], speed: 1, sniffTicks: 0, visionTiles: 6, turns: [{ facing: S, ticks: 90 }, { facing: W, ticks: 90 }, { facing: N, ticks: 90 }, { facing: E, ticks: 90 }] },
    // The roof guard runs between the hatch and the middle of the roof, right past the key (2 x 112 + 2 x 10 = 244 ticks).
    { id: 'g-roof', sprite: 'black', waypoints: ['!', '?'], speed: 2, sniffTicks: 10, visionTiles: 5 },
    // The helicopter pilot paces the east roof below the helipad valve (2 x 64 + 2 x 40 = 208 ticks).
    { id: 'g-pilot', sprite: 'base', waypoints: ['^', '~'], speed: 2, sniffTicks: 40, visionTiles: 4 },
    // The CEO's lapdog turns through the office on its own 300-tick clock. The helipad plate h and the chute rows
    // (y24..25) are out of its reach, so the last step from h into the chute is always safe.
    { id: 's-lapdog', sprite: 'exotic', waypoints: ['5'], speed: 1, sniffTicks: 0, visionTiles: 5, turns: [{ facing: W, ticks: 75 }, { facing: N, ticks: 75 }, { facing: E, ticks: 75 }, { facing: S, ticks: 75 }] },
    // The concierge at the foot of the east stair turns on the same clock: up the stair, into the
    // airlock, down the hall, along the hall.
    { id: 's-concierge', sprite: 'base', waypoints: ['@'], speed: 1, sniffTicks: 0, visionTiles: 4, turns: [{ facing: N, ticks: 90 }, { facing: E, ticks: 90 }, { facing: S, ticks: 90 }, { facing: W, ticks: 90 }] },
    // Barkley walks the penthouse hall loop (38 tiles at speed 2 + 4 sniffs of 14 = exactly 360 ticks).
    // He can never path into the lobby, the airlock or the office (plate doors).
    { id: 'g-barkley', sprite: 'brown', waypoints: ['6', '7', '8', '9'], speed: 2, sniffTicks: 14, visionTiles: 5 },
  ],
  crate: { catId: 'olive', catName: 'Duchess' },
  meta: {
    parTicks: 230 * 30, // max(60 s, cautious-bot median 5702 t = 190.1 s x 1.2 = 228.1 s, solver 3068 t = 102.3 s x 1.6 = 163.6 s), rounded up to 5 s
    meowRadiusTiles: 7,
    investigateTicks: 210,
    maxCoins: 28,
    twoCatRequired: true,
    objectives: [
      "Take Barkley's key from the roof between the searchlight sweeps",
      "Get one cat through the airlock into the CEO's office, open the safe and free {cat}",
      'Split up: one cat on the helipad, the other down the laundry chute',
    ],
    hints: [
      { x0: 1, y0: 19, x1: 6, y1: 25, untilObjective: 0, text: 'Two ways up: leapfrog the service door, or prop the lift door and slip past Barkley.' },
      { x0: 26, y0: 19, x1: 28, y1: 25, text: 'The airlock plate opens both airlock doors at once, so only one cat can ever get through. Pick who goes in.' },
      { x0: 26, y0: 1, x1: 29, y1: 7, fromObjective: 1, text: "The helipad valve opens only from the CEO's office. Wait here for your partner." },
      { x0: 32, y0: 19, x1: 38, y1: 25, fromObjective: 2, text: 'Hold the helipad plate till your partner is through, then drop down the laundry chute.' },
    ],
  },
};
