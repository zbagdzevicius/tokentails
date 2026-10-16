/**
 * Heist 09: Deep Blue. Idea: the stare-down. The visitor tunnel (top) joins the shark walk (a 2-wide
 * ring around the great tank) only through PLATE doors: the glass pane W (three tiles, plate w) and
 * the service gate G (plate g). Guards always path as if plate doors were shut, so the ring dogs can
 * never reach the tunnel. A meow from the tunnel while the pane is open is heard through the glass;
 * the dog finds no route, stops where it is, stares at the sound and stays frozen for
 * investigateTicks. A new meow restarts the freeze. The open glass cuts both ways: ring dogs can see
 * through it, so the meow spot (9,2) sits 4 tiles above the ring, outside vision 3.
 * Two-deep reef niches and tank alcoves give a place to let a dog go by; the quarantine lab (crate)
 * hangs off the south ring, watched by a lab-tech who turns between the lab and its doorway.
 *
 *            x 0         1         2         3
 *              0123456789012345678901234567890123
 */
const map = [
  '##################################', // 0
  '#...........$.......$............#', // 1
  '#.12..w....................g...EE#', // 2  spawns; plate w (6,2) opens all of W; plate g (27,2); exit
  '#...+...........$............+...#', // 3  checkpoints (4,3), (29,3)
  '#.$.................$.........$..#', // 4
  '########WWW#############G#########', // 5  glass pane W (8..10,5); service gate G (24,5)
  '#####3......$...............4#####', // 6  ring corners 3 (5,6), 4 (28,6)
  '#####...............$........#####', // 7
  '###....##########.#########..#####', // 8  the great tank, x7..26 y8..15; alcove (17,8..9); west pocket (3..4,8)
  '#####..##########.#########..#####', // 9
  '#####..####################$.#####', // 10
  '#####..####################..#####', // 11
  '###$...####################...$###', // 12 reef niches, two deep: (3..4,12), (29..30,12)
  '#####..####################..#####', // 13
  '#####.$#####.##############..#####', // 14 alcove (12,14..15)
  '#####..#####.##############....###', // 15 east pocket (29..30,15)
  '#####.................$......#####', // 16
  '#####6........$.............5#####', // 17 corners 6 (5,17), 5 (28,17)
  '#########.######.######.##########', // 18 reef niches, two deep: (9,18..19), (23,18..19); lab doorway (16,18)
  '#########$##$..$.....$#$##########', // 19 quarantine lab
  '############.@...b..C.############', // 20 lab-tech @ (13,20); crate (20,20)
  '############...$.$$..b############', // 21
  '##################################', // 22
];

const N = { x: 0, y: -1 };
const E = { x: 1, y: 0 };

export default {
  id: 'heist-09',
  title: 'Heist 09: Deep Blue',
  name: 'Deep Blue',
  intro: 'Through the glass the sharks hear you, but they can never reach you. Freeze them.',
  idea: 'Stare-down: a meow from where a dog cannot path freezes it on the spot',
  map,
  doors: { W: { id: 'glass-west' }, G: { id: 'glass-east' } },
  guards: [
    // Clockwise shark, starting at the south-west corner so it first passes the glass at ~7 s.
    // Fast on the straights, but it noses each corner for 3 s (one lap every 904
    // ticks). Without the corner pauses a speed-2 dog on a closed ring gave the cautious bot 12-38%.
    { id: 'g-shark', sprite: 'black', waypoints: ['6', '3', '4', '5'], speed: 2, sniffTicks: 90, visionTiles: 3 },
    // Counter-clockwise eel: slow, one lap every 1088 ticks, so the two dogs meet all round the ring.
    { id: 'g-eel', sprite: 'base', waypoints: ['5', '4', '3', '6'], speed: 1, sniffTicks: 0, visionTiles: 3 },
    // The lab-tech looks across the lab, then up at the doorway.
    { id: 's-labtech', sprite: 'brown', waypoints: ['@'], speed: 1, sniffTicks: 0, visionTiles: 4, turns: [{ facing: E, ticks: 90 }, { facing: N, ticks: 90 }] },
  ],
  crate: { catId: 'siamese', catName: 'Coral' },
  meta: {
    parTicks: 110 * 30, // solver 2041 t x 1.6 = 109 s (cautious-bot median 54 s x 1.2 = 65 s), rounded up to 5 s; see ACT2 par rule
    meowRadiusTiles: 7,
    investigateTicks: 240,
    maxCoins: 24,
    twoCatRequired: true,
    objectives: ['Freeze the sharks through the glass, then free {cat}', 'Both cats back to the tunnel exit'],
    hints: [
      { x0: 4, y0: 1, x1: 11, y1: 4, untilObjective: 0, text: "Hold this plate to open the glass, {swap}, and meow ({meow}) when a shark passes: it can't reach you, so it freezes and stares." },
      { x0: 23, y0: 1, x1: 30, y1: 4, untilObjective: 0, text: 'This plate opens the service gate. A frozen dog stares for 8 seconds and every new meow restarts it: freeze them both, then go!' },
    ],
  },
};
