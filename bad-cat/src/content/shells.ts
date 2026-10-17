/**
 * Room shells: furniture heightmap + render pieces (GDD 4.1, 6.4, 11). Indices are fixed (RoomDef.shell):
 *
 *   0 Kitchen            1 Living room         2 Bathroom            3 Home office
 *   4 Party room         5 Bedroom             6 Boss: Birthday hall 7 Boss: Wedding
 *   8 Boss: Christmas    9 Boss: New Year's    10 Kitchen · holiday dinner (two humans, Thanksgiving)
 *   11 Living room · Zoom (webcam variant for the pre-office Thursday, Appendix A day 4)
 *
 * Maps: rows z = 0 (back wall, north) .. depth-1 (camera side), '.' floor L0, '1' seat L1, '2' counter L2,
 * '3' high L3. Every L2+ cell occludes sight. The back (north) and west walls stand; the camera looks north.
 *
 * Kitchen, 12 x 10 (FROZEN: v4 ghosts depend on its heightmap, furniture and spots):
 *
 *   z0  2222222222 33   back counter (sink x2-3, stove x5-6) 2 deep, fridge x10-11
 *   z1  2222222222 33
 *   z2  331.....1...    high shelf x0-1 z2-4, step stools (2,2) (8,2); Chef Dad stands at (5,2)
 *   z3  33..........
 *   z4  33....1...22    chair (6,4), sideboard x10-11 z4-6
 *   z5  ...12222..22    chair (3,5), table x4-7 z5-6
 *   z6  ....22221.22    chair (8,6)
 *   z7  ..11.1.....1    footstool x2-3 (L1, the first-heist hop), chair (5,7), stool (11,7)
 *   z8  ......1111..    breakfast bench x6-9 z8-9 (L1), cat bed (10,8)
 *   z9  ......1111..
 *
 * Access: floor -> L1 seats -> L2 surfaces (+1 jumps); counter (9,0) -> fridge top, counter (0,1)/(1,1) -> shelf.
 */
import type { Facing, FurniturePiece, FurnitureType, Level, ShellDef } from '../types';

const KITCHEN_MAP = [
  '222222222233',
  '222222222233',
  '331.....1...',
  '33..........',
  '33....1...22',
  '...12222..22',
  '....22221.22',
  '..11.1.....1',
  '......1111..',
  '......1111..',
];

export function parseLevelMap(rows: readonly string[]): { width: number; depth: number; levels: Level[]; occludes: (0 | 1)[] } {
  const depth = rows.length;
  const width = rows[0].length;
  const levels: Level[] = [];
  const occludes: (0 | 1)[] = [];
  for (const row of rows) {
    if (row.length !== width) throw new Error('ragged level map');
    for (const ch of row) {
      const l = (ch === '.' ? 0 : Number(ch)) as Level;
      if (!(l >= 0 && l <= 3)) throw new Error(`bad level char ${ch}`);
      levels.push(l);
      occludes.push(l >= 2 ? 1 : 0);
    }
  }
  return { width, depth, levels, occludes };
}

/** Furniture drawn on a wall or the floor without its own heightmap footprint (render decoration only). */
export const DECOR_FURNITURE: readonly FurnitureType[] = ['window', 'rug', 'tv', 'mirror', 'webcam', 'arch', 'door'];

const KITCHEN_FURNITURE: readonly FurniturePiece[] = [
  { type: 'counter', x: 0, z: 0, w: 2, d: 2, level: 2, color: 0xe8d5b5 },
  { type: 'sink', x: 2, z: 0, w: 2, d: 2, level: 2, color: 0xcfd8dc },
  { type: 'counter', x: 4, z: 0, w: 1, d: 2, level: 2, color: 0xe8d5b5 },
  { type: 'stove', x: 5, z: 0, w: 2, d: 2, level: 2, color: 0x3d3a40 },
  { type: 'counter', x: 7, z: 0, w: 3, d: 2, level: 2, color: 0xe8d5b5 },
  { type: 'window', x: 2, z: 0, w: 3, d: 1, level: 2, color: 0xa8d8f0 },
  { type: 'fridge', x: 10, z: 0, w: 2, d: 2, level: 3, color: 0xf4f1ea },
  { type: 'shelf', x: 0, z: 2, w: 2, d: 3, level: 3, color: 0x9c6b47 },
  { type: 'chair', x: 2, z: 2, w: 1, d: 1, level: 1, color: 0xc98b5a },
  { type: 'chair', x: 8, z: 2, w: 1, d: 1, level: 1, color: 0xc98b5a },
  { type: 'table', x: 4, z: 5, w: 4, d: 2, level: 2, color: 0xb9835a },
  { type: 'chair', x: 6, z: 4, w: 1, d: 1, level: 1, color: 0xd99a6c },
  { type: 'chair', x: 3, z: 5, w: 1, d: 1, level: 1, color: 0xd99a6c },
  { type: 'chair', x: 8, z: 6, w: 1, d: 1, level: 1, color: 0xd99a6c },
  { type: 'chair', x: 5, z: 7, w: 1, d: 1, level: 1, color: 0xd99a6c },
  { type: 'cabinet', x: 10, z: 4, w: 2, d: 3, level: 2, color: 0x8fb39a },
  { type: 'chair', x: 11, z: 7, w: 1, d: 1, level: 1, color: 0xc98b5a },
  { type: 'sofa', x: 6, z: 8, w: 4, d: 2, level: 1, color: 0xe07a5f },
  { type: 'rug', x: 1, z: 7, w: 4, d: 3, level: 0, color: 0xf2cc8f },
  // Footstool on the rug: the first heist's hop (step, hop, swat east onto the open floor in front of the table).
  { type: 'sofa', x: 2, z: 7, w: 2, d: 1, level: 1, color: 0x8e7cc3 },
  { type: 'cat-bed', x: 10, z: 8, w: 1, d: 1, level: 0, color: 0x81b29a },
];

type Spot = { x: number; z: number };
type LSpot = { x: number; z: number; level: Level };

/** Spectator cells: [x, z, level]; a level above the cell's surface is a wall shelf or a windowsill. */
const spots = (...c: [number, number, Level][]): LSpot[] => c.map(([x, z, level]) => ({ x, z, level }));
const loop = (...c: [number, number][]): Spot[] => c.map(([x, z]) => ({ x, z }));

const k = parseLevelMap(KITCHEN_MAP);

/** Kitchen v5 extras (render/sim-only, optional): the Roomba circles the open floor in front of Chef Dad. */
// Round 2 (QA, SIM_VERSION 7 content): the road runs along the counter and the cabinet, where things fall, so the
// Roomba can be framed. (The frozen preview rooms park their Roomba at (11,9), off the road: it never moves there.)
const KITCHEN_ROOMBA = loop([9, 2], [10, 2], [11, 2], [11, 3], [10, 3], [9, 3]);
const KITCHEN_SPECTATORS = spots(
  [0, 0, 3], [1, 0, 3], [6, 0, 3], [7, 0, 3], [8, 0, 3], [9, 0, 3], [10, 0, 3], // wall shelf over the counter, fridge top
  [2, 0, 3], [3, 0, 3], [4, 0, 3], // the windowsill shelf
  [0, 5, 2], [0, 6, 2], [0, 7, 2], // west wall shelf by the table
);

export const KITCHEN: ShellDef = Object.freeze({
  id: 0,
  name: 'Kitchen',
  width: k.width,
  depth: k.depth,
  levels: Object.freeze(k.levels),
  occludes: Object.freeze(k.occludes),
  furniture: KITCHEN_FURNITURE,
  humanSpot: { x: 5, z: 2 },
  /** Out of the east door (off grid) during the room event. */
  humanEventSpot: { x: 12, z: 3 },
  catBed: { x: 10, z: 8 },
  wallColor: 0xf6e7cf,
  floorColor: 0xd9a066,
  // ----- FULL build additions (optional fields only; the v4 rule set ignores them) -----
  roombaLoop: KITCHEN_ROOMBA,
  spectatorSlots: KITCHEN_SPECTATORS,
  fridgeWall: { x: 10, z: 1, w: 2 },
  /** The Pink Paw cat lounges on the fridge, where every cat wants to be. */
  accompliceSpot: { x: 11, z: 0, level: 3 },
  maker: true,
}) as ShellDef;

interface ShellSpec {
  id: number;
  name: string;
  map: readonly string[];
  furniture: readonly FurniturePiece[];
  humanSpot: Spot;
  humanEventSpot: Spot;
  catBed: Spot;
  wallColor: number;
  floorColor: number;
  humanSpot2?: Spot;
  humanEventSpot2?: Spot;
  roombaLoop?: Spot[];
  mirror?: { x: number; z: number; facing: Facing };
  webcam?: { x: number; z: number; facing: Facing };
  spectatorSlots: LSpot[];
  fridgeWall?: { x: number; z: number; w: number };
  accompliceSpot: LSpot;
  maker?: boolean;
}

function defineShell(s: ShellSpec): ShellDef {
  const m = parseLevelMap(s.map);
  const out: ShellDef = {
    id: s.id,
    name: s.name,
    width: m.width,
    depth: m.depth,
    levels: Object.freeze(m.levels),
    occludes: Object.freeze(m.occludes),
    furniture: Object.freeze(s.furniture.slice()),
    humanSpot: s.humanSpot,
    humanEventSpot: s.humanEventSpot,
    catBed: s.catBed,
    wallColor: s.wallColor,
    floorColor: s.floorColor,
    spectatorSlots: Object.freeze(s.spectatorSlots),
    accompliceSpot: s.accompliceSpot,
  };
  if (s.humanSpot2) out.humanSpot2 = s.humanSpot2;
  if (s.humanEventSpot2) out.humanEventSpot2 = s.humanEventSpot2;
  if (s.roombaLoop) out.roombaLoop = Object.freeze(s.roombaLoop);
  if (s.mirror) out.mirror = s.mirror;
  if (s.webcam) out.webcam = s.webcam;
  if (s.fridgeWall) out.fridgeWall = s.fridgeWall;
  if (s.maker) out.maker = true;
  return Object.freeze(out) as ShellDef;
}

const F = (type: FurnitureType, x: number, z: number, w: number, d: number, level: Level, color: number): FurniturePiece => ({ type, x, z, w, d, level, color });

// ----- 1 Living room: TV night on a squishy sofa, a coffee table in reach, a lamp that was always going to fall -----
const LIVING_MAP = [
  '332222221.33', // bookcase x0-1 (L3), TV console x2-7 (L2), armchair (8,0-1), window nook (9,0), plant shelf x10-11 (L3)
  '332222221122', // footstool (9,1) L1, low cabinet x10-11 (L2)
  '............',
  '............',
  '....12222...', // pouf (4,4) L1, coffee table x5-8 z4-5 (L2)
  '.....2222...',
  '............',
  '.2111111....', // side table (1,7-8) L2 with the lamp, sofa x2-7 z7-8 (L1): the Couch Potato sits at (5,7)
  '.2111111....',
  '............',
];
const LIVING_FURNITURE: FurniturePiece[] = [
  F('bookcase', 0, 0, 2, 2, 3, 0x8d5b3e),
  F('tv-stand', 2, 0, 6, 2, 2, 0x6d4c41),
  F('tv', 3, 0, 4, 1, 2, 0x22252b),
  F('armchair', 8, 0, 1, 2, 1, 0xd4a373),
  F('window', 8, 0, 2, 1, 2, 0xa8d8f0),
  F('chair', 9, 1, 1, 1, 1, 0xe9c46a),
  F('shelf', 10, 0, 2, 1, 3, 0x9c6b47),
  F('cabinet', 10, 1, 2, 1, 2, 0x8fb39a),
  F('rug', 3, 3, 7, 4, 0, 0xe9c9a1),
  F('chair', 4, 4, 1, 1, 1, 0xf28482),
  F('coffee-table', 5, 4, 4, 2, 2, 0xb08968),
  F('nightstand', 1, 7, 1, 2, 2, 0xa98467),
  F('sofa', 2, 7, 6, 2, 1, 0x6d9dc5),
  F('cat-bed', 11, 9, 1, 1, 0, 0x81b29a),
];
const LIVING_SPEC: ShellSpec = {
  id: 1,
  name: 'Living room',
  map: LIVING_MAP,
  furniture: LIVING_FURNITURE,
  humanSpot: { x: 5, z: 7 },
  humanEventSpot: { x: 12, z: 4 },
  catBed: { x: 11, z: 9 },
  wallColor: 0xf3e3d3,
  floorColor: 0xc8956b,
  // along the TV stand (round 2: the road ran around empty floor)
  roombaLoop: loop([2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [2, 3]),
  spectatorSlots: spots([2, 0, 3], [3, 0, 3], [4, 0, 3], [5, 0, 3], [6, 0, 3], [7, 0, 3], [9, 0, 2], [0, 2, 2], [0, 3, 2], [0, 4, 2], [0, 5, 2], [11, 0, 3]),
  accompliceSpot: { x: 8, z: 0, level: 1 },
  maker: true,
};
export const LIVING_ROOM = defineShell(LIVING_SPEC);

// ----- 2 Bathroom: the mirror sees everything, the toilet roll has never been safer than it is about to be -----
const BATH_MAP = [
  '33222222..22', // towel shelf x0-1 (L3), double vanity x2-7 (L2, mirror above), window x8-9, washing machine x10-11 (L2)
  '332222221122', // step stool (8,1) L1, laundry hamper (9,1) L1
  '............', // Skincare Sis at (4,2), nose to the mirror
  '22........1.', // bathroom cabinet x0-1 z3-4 (L2), toilet x10 z3-4 (L1)
  '22........1.',
  '1...........', // laundry hamper (0,5) L1
  '............',
  '11111.......', // bathtub x0-4 z7-8 (rim L1)
  '11111.......',
  '......111...', // bath bench x6-8 (L1)
];
const BATH_SPEC: ShellSpec = {
  id: 2,
  name: 'Bathroom',
  map: BATH_MAP,
  furniture: [
    F('shelf', 0, 0, 2, 2, 3, 0x90caf9),
    F('vanity', 2, 0, 6, 2, 2, 0xf1faee),
    F('mirror', 3, 0, 3, 1, 2, 0xcfe8f5),
    F('window', 8, 0, 2, 1, 2, 0xa8d8f0),
    F('chair', 8, 1, 1, 1, 1, 0xffb4a2),
    F('chair', 9, 1, 1, 1, 1, 0xd9c5a0),
    F('washing-machine', 10, 0, 2, 2, 2, 0xf8f9fa),
    F('cabinet', 0, 3, 2, 2, 2, 0xbde0fe),
    F('chair', 0, 5, 1, 1, 1, 0xd9c5a0),
    F('toilet', 10, 3, 1, 2, 1, 0xffffff),
    F('bathtub', 0, 7, 5, 2, 1, 0xfdfcf7),
    F('rug', 5, 7, 2, 2, 0, 0x9be7d8),
    F('sofa', 6, 9, 3, 1, 1, 0xcdb4db),
    F('cat-bed', 11, 9, 1, 1, 0, 0x81b29a),
  ],
  humanSpot: { x: 4, z: 2 },
  humanEventSpot: { x: 12, z: 5 },
  catBed: { x: 11, z: 9 },
  wallColor: 0xe3f2fd,
  floorColor: 0xb7d3df,
  mirror: { x: 4, z: 1, facing: 5 },
  // along the vanity and the cabinet, west of Skincare Sis (round 2)
  roombaLoop: loop([1, 2], [2, 2], [3, 2], [3, 3], [2, 3]),
  spectatorSlots: spots([2, 0, 3], [3, 0, 3], [4, 0, 3], [5, 0, 3], [6, 0, 3], [7, 0, 3], [8, 0, 2], [10, 0, 3], [11, 0, 3], [0, 3, 2], [0, 4, 2], [0, 5, 2], [0, 6, 2]),
  /** The Pink Paw cat suns herself on the windowsill. */
  accompliceSpot: { x: 9, z: 0, level: 2 },
  maker: true,
};
export const BATHROOM = defineShell(BATH_SPEC);

// ----- 3 Home office: one webcam, one very important call, one cat who wants to be in the meeting -----
const OFFICE_MAP = [
  '33222222..33', // bookcase x0-1 (L3), desk x2-7 (L2), window x8-9, shelf x10-11 (L3); the webcam tripod at (4,5)
  '332222221122', // filing cabinets (8-9,1) L1, printer cabinet x10-11 (L2)
  '.....1......', // the WFH Worker in the office chair (5,2)
  '............',
  '............',
  '........1222', // stool (8,5) L1, credenza x9-11 z5-6 (L2)
  '112......222', // reading armchair x0-1 z6-7 (L1), side table x2 z6-7 (L2) with the reading lamp
  '112........1', // plant stand (11,7) L1
  '............',
  '......111...', // shoe bench x6-8 (L1)
];
const OFFICE_SPEC: ShellSpec = {
  id: 3,
  name: 'Home office',
  map: OFFICE_MAP,
  furniture: [
    F('bookcase', 0, 0, 2, 2, 3, 0x7f5539),
    F('desk', 2, 0, 6, 2, 2, 0xc9ada7),
    F('window', 8, 0, 2, 1, 2, 0xa8d8f0),
    F('cabinet', 8, 1, 2, 1, 1, 0x9a8c98),
    F('shelf', 10, 0, 2, 1, 3, 0x9c6b47),
    F('cabinet', 10, 1, 2, 1, 2, 0xb8bedd),
    F('office-chair', 5, 2, 1, 1, 1, 0x3d405b),
    F('rug', 3, 3, 6, 3, 0, 0xe0c3fc),
    F('chair', 8, 5, 1, 1, 1, 0xf4a261),
    F('cabinet', 9, 5, 3, 2, 2, 0xa68a64),
    F('armchair', 0, 6, 2, 2, 1, 0x81b29a),
    F('nightstand', 2, 6, 1, 2, 2, 0xa68a64),
    F('plant-stand', 11, 7, 1, 1, 1, 0x6a994e),
    F('sofa', 6, 9, 3, 1, 1, 0x9a8c98),
    F('cat-bed', 11, 9, 1, 1, 0, 0x81b29a),
    // round 2 (QA): the meeting camera on a tripod, pointed at the desk wall (on the monitor it saw 3 of 21 props)
    F('webcam', 4, 5, 1, 1, 0, 0x22223b),
  ],
  humanSpot: { x: 5, z: 2 },
  humanEventSpot: { x: 12, z: 3 },
  catBed: { x: 11, z: 9 },
  wallColor: 0xede7f6,
  floorColor: 0xb08968,
  webcam: { x: 4, z: 5, facing: 1 },
  // past the cabinet, the side table and the sofa (round 2)
  roombaLoop: loop([4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [10, 8], [9, 8], [8, 8], [7, 8], [6, 8], [5, 8], [4, 8]),
  spectatorSlots: spots([2, 0, 3], [3, 0, 3], [4, 0, 3], [6, 0, 3], [7, 0, 3], [8, 0, 2], [9, 0, 2], [11, 0, 3], [0, 3, 2], [0, 4, 2], [0, 5, 2]),
  accompliceSpot: { x: 0, z: 6, level: 1 },
  maker: true,
};
export const HOME_OFFICE = defineShell(OFFICE_SPEC);

// ----- 4 Party room: a buffet, a long party table under a cloth, a karaoke stage, balloons in the corner -----
const PARTY_MAP = [
  '33222222.133', // shelf x0-1 (L3), buffet x2-7 (L2), door (8,0), bench (9,0-1) L1, high shelf x10-11 (L3)
  '332222221122', // stool (8,1) L1, gift cabinet x10-11 (L2)
  '............', // the Party Host at (5,2), fussing over the buffet
  '............',
  '..12222221..', // chairs (2,4) (9,4), party table x3-8 z4-5 (L2, tablecloth)
  '...222222...',
  '....1..1....', // chairs (4,6) (7,6)
  '............',
  '111.........', // karaoke stage x0-2 z8-9 (L1)
  '111.........',
];
const PARTY_SPEC: ShellSpec = {
  id: 4,
  name: 'Party room',
  map: PARTY_MAP,
  furniture: [
    F('shelf', 0, 0, 2, 2, 3, 0xb5838d),
    F('buffet', 2, 0, 6, 2, 2, 0xffe5d9),
    F('door', 8, 0, 1, 1, 0, 0x9d8189),
    F('chair', 9, 0, 1, 2, 1, 0xffcad4),
    F('chair', 8, 1, 1, 1, 1, 0xffcad4),
    F('shelf', 10, 0, 2, 1, 3, 0xb5838d),
    F('cabinet', 10, 1, 2, 1, 2, 0xf4acb7),
    F('chair', 2, 4, 1, 1, 1, 0xf6bd60),
    F('party-table', 3, 4, 6, 2, 2, 0xf7ede2),
    F('chair', 9, 4, 1, 1, 1, 0xf6bd60),
    F('chair', 4, 6, 1, 1, 1, 0xf6bd60),
    F('chair', 7, 6, 1, 1, 1, 0xf6bd60),
    F('stage', 0, 8, 3, 2, 1, 0x84a59d),
    F('rug', 4, 7, 6, 3, 0, 0xf28482),
    F('cat-bed', 11, 9, 1, 1, 0, 0x81b29a),
  ],
  humanSpot: { x: 5, z: 2 },
  humanEventSpot: { x: 12, z: 6 },
  catBed: { x: 11, z: 9 },
  wallColor: 0xfff1e6,
  floorColor: 0xd4a373,
  // round the front of the party table, between its two chairs (round 2)
  roombaLoop: loop([5, 6], [6, 6], [6, 7], [6, 8], [5, 8], [5, 7]),
  spectatorSlots: spots([2, 0, 3], [3, 0, 3], [4, 0, 3], [5, 0, 3], [6, 0, 3], [7, 0, 3], [8, 0, 2], [0, 3, 2], [0, 4, 2], [0, 5, 2], [0, 6, 2]),
  accompliceSpot: { x: 0, z: 9, level: 1 },
  maker: true,
};
export const PARTY_ROOM = defineShell(PARTY_SPEC);

// ----- 5 Bedroom: a big bed with a sleeping human in it, a dresser of tiny breakables, one full laundry basket -----
const BED_MAP = [
  '33211112.222', // wardrobe x0-1 (L3), nightstand (2,0-1) L2, bed x3-6 z0-3 (L1), nightstand (7,0-1) L2, dresser x9-11 (L2)
  '332111121222', // ottoman (8,1) L1
  '...1111.....', // the Napper on the bed at (5,1)
  '...1111.....',
  '............',
  '............',
  '..........1.', // reading armchair (10,6-7) L1
  '..........1.',
  '............',
  '............',
];
const BED_SPEC: ShellSpec = {
  id: 5,
  name: 'Bedroom',
  map: BED_MAP,
  furniture: [
    F('wardrobe', 0, 0, 2, 2, 3, 0x8d6e63),
    F('nightstand', 2, 0, 1, 2, 2, 0xbc8a5f),
    F('bed', 3, 0, 4, 4, 1, 0xa2d2ff),
    F('nightstand', 7, 0, 1, 2, 2, 0xbc8a5f),
    F('window', 8, 0, 1, 1, 2, 0xa8d8f0),
    F('chair', 8, 1, 1, 1, 1, 0xcdb4db),
    F('dresser', 9, 0, 3, 2, 2, 0xddb892),
    F('rug', 2, 4, 6, 3, 0, 0xffc8dd),
    F('armchair', 10, 6, 1, 2, 1, 0xb5838d),
    F('cat-bed', 11, 9, 1, 1, 0, 0x81b29a),
  ],
  humanSpot: { x: 5, z: 1 },
  humanEventSpot: { x: 12, z: 4 },
  catBed: { x: 11, z: 9 },
  wallColor: 0xf8edeb,
  floorColor: 0xc9a27e,
  // beside the nightstand and under the dresser (round 2)
  roombaLoop: loop([7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [11, 3], [10, 3], [9, 3], [8, 3], [7, 3]),
  spectatorSlots: spots([3, 0, 2], [4, 0, 2], [6, 0, 2], [8, 0, 2], [9, 0, 3], [10, 0, 3], [11, 0, 3], [0, 3, 2], [0, 4, 2], [0, 5, 2], [0, 6, 2]),
  accompliceSpot: { x: 10, z: 6, level: 1 },
  maker: true,
};
export const BEDROOM = defineShell(BED_SPEC);

// ----- 6 Boss: Birthday hall (14 x 12): buffet, gift table, long party table, cake table, a stage for Grandma -----
const BIRTHDAY_MAP = [
  '33222222.12233', // shelf x0-1 (L3), buffet x2-7 (L2), door (8,0), bench (9,0-1) L1, gift table x10-11 (L2), shelf x12-13 (L3)
  '33222222112233', // stool (8,1) L1
  '..............', // the Party Host at (5,2)
  '..............',
  '..12222221222.', // chairs (2,4) (9,4), party table x3-8 z4-5 (L2), snack table x10-12 z4-5 (L2)
  '...222222.222.',
  '....1..1.....1', // chairs (4,6) (7,6), stool (13,6) L1 (round 2: a second way up to the cake table)
  '...........122', // stool (11,7) L1, cake table x12-13 z7-8 (L2)
  '111.........22', // stage x0-2 z8-10 (L1): Grandma at (1,9)
  '111...........',
  '111...........',
  '..............',
];
const BIRTHDAY_SPEC: ShellSpec = {
  id: 6,
  name: 'Birthday hall',
  map: BIRTHDAY_MAP,
  furniture: [
    F('shelf', 0, 0, 2, 2, 3, 0xb5838d),
    F('buffet', 2, 0, 6, 2, 2, 0xffe5d9),
    F('door', 8, 0, 1, 1, 0, 0x9d8189),
    F('chair', 9, 0, 1, 2, 1, 0xffcad4),
    F('chair', 8, 1, 1, 1, 1, 0xffcad4),
    F('table', 10, 0, 2, 2, 2, 0xcdb4db),
    F('shelf', 12, 0, 2, 2, 3, 0xb5838d),
    F('chair', 2, 4, 1, 1, 1, 0xf6bd60),
    F('party-table', 3, 4, 6, 2, 2, 0xf7ede2),
    F('chair', 9, 4, 1, 1, 1, 0xf6bd60),
    F('table', 10, 4, 3, 2, 2, 0xcaffbf),
    F('chair', 4, 6, 1, 1, 1, 0xf6bd60),
    F('chair', 7, 6, 1, 1, 1, 0xf6bd60),
    F('chair', 11, 7, 1, 1, 1, 0xf6bd60),
    F('chair', 13, 6, 1, 1, 1, 0xf6bd60),
    F('table', 12, 7, 2, 2, 2, 0xffafcc),
    F('stage', 0, 8, 3, 3, 1, 0x84a59d),
    F('rug', 4, 8, 7, 3, 0, 0xffd6a5),
    F('cat-bed', 13, 11, 1, 1, 0, 0x81b29a),
  ],
  humanSpot: { x: 5, z: 2 },
  humanEventSpot: { x: 14, z: 3 },
  humanSpot2: { x: 1, z: 9 },
  humanEventSpot2: { x: 1, z: 9 },
  catBed: { x: 13, z: 11 },
  wallColor: 0xfff1e6,
  floorColor: 0xd4a373,
  // along the front of the party table and the gift table (round 2)
  roombaLoop: loop([8, 6], [9, 6], [10, 6], [10, 7], [9, 7], [8, 7]),
  spectatorSlots: spots([2, 0, 3], [3, 0, 3], [4, 0, 3], [5, 0, 3], [6, 0, 3], [7, 0, 3], [8, 0, 2], [10, 0, 3], [11, 0, 3], [0, 3, 2], [0, 4, 2], [0, 5, 2], [0, 6, 2], [13, 0, 3]),
  accompliceSpot: { x: 12, z: 0, level: 3 },
};
export const BOSS_BIRTHDAY = defineShell(BIRTHDAY_SPEC);

// ----- 7 Boss: Wedding (14 x 12): head table, cake table, champagne tower, flower arch, two caterers -----
const WEDDING_MAP = [
  '33222222221.33', // flower shelf x0-1 (L3), head table x2-9 (L2), stool (10,0-1) L1, arch (11,0), flower stand x12-13 (L3)
  '33222222221122', // stool (11,1) L1, sideboard x12-13 (L2)
  '..............', // Caterer A at (3,2)
  '..............',
  '..............',
  '....12222.1222', // chair (4,5), cake table x5-8 z5-6 (L2), stool (10,5), champagne table x11-13 z5-6 (L2)
  '.....22221.222', // chair (9,6)
  '..221.........', // gift table x2-3 z7-8 (L2), chair (4,7)
  '..22..........', // Caterer B at (12,8)
  '..............',
  '11............', // bench x0-1 z10-11 (L1)
  '11............',
];
const WEDDING_SPEC: ShellSpec = {
  id: 7,
  name: 'Wedding hall',
  map: WEDDING_MAP,
  furniture: [
    F('shelf', 0, 0, 2, 2, 3, 0xe5989b),
    F('table', 2, 0, 8, 2, 2, 0xfffcf2),
    F('chair', 10, 0, 1, 2, 1, 0xffcad4),
    F('arch', 11, 0, 1, 1, 0, 0xffafcc),
    F('chair', 11, 1, 1, 1, 1, 0xffcad4),
    F('shelf', 12, 0, 2, 1, 3, 0xe5989b),
    F('cabinet', 12, 1, 2, 1, 2, 0xf8edeb),
    F('chair', 4, 5, 1, 1, 1, 0xffcad4),
    F('table', 5, 5, 4, 2, 2, 0xfffcf2),
    F('chair', 9, 6, 1, 1, 1, 0xffcad4),
    F('chair', 10, 5, 1, 1, 1, 0xffcad4),
    F('table', 11, 5, 3, 2, 2, 0xfffcf2),
    F('table', 2, 7, 2, 2, 2, 0xfffcf2),
    F('chair', 4, 7, 1, 1, 1, 0xffcad4),
    F('rug', 4, 8, 7, 3, 0, 0xf8edeb),
    F('sofa', 0, 10, 2, 2, 1, 0xb5838d),
    F('cat-bed', 13, 11, 1, 1, 0, 0x81b29a),
  ],
  humanSpot: { x: 3, z: 2 },
  humanEventSpot: { x: 3, z: 2 },
  humanSpot2: { x: 12, z: 8 },
  humanEventSpot2: { x: 14, z: 8 },
  catBed: { x: 13, z: 11 },
  wallColor: 0xfdf0f3,
  floorColor: 0xe9d8c4,
  // along the front of the cake table and the champagne table (round 2)
  roombaLoop: loop([5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [10, 8], [9, 8], [8, 8], [7, 8], [6, 8], [5, 8]),
  spectatorSlots: spots([2, 0, 3], [3, 0, 3], [4, 0, 3], [5, 0, 3], [6, 0, 3], [7, 0, 3], [8, 0, 3], [9, 0, 3], [11, 0, 2], [0, 3, 2], [0, 4, 2], [0, 5, 2], [0, 6, 2], [0, 7, 2]),
  accompliceSpot: { x: 13, z: 0, level: 3 },
};
export const BOSS_WEDDING = defineShell(WEDDING_SPEC);

// ----- 8 Boss: Christmas (14 x 12): a mantle at L3 right beside the tree, presents, cookies, a sofa, Grandma -----
const XMAS_MAP = [
  '11.33333221233', // armchair x0-1 (L1), mantle x3-7 (L3), cabinet x8-9 (L2), chair (10) L1, cabinet (11) L2, bookcase x12-13 (L3)
  '11......221233',
  '..............', // the tree stands at (5,1), right under the mantle
  '..............',
  '..............', // the Party Host at (10,4)
  '...12222......', // pouf (3,5) L1, coffee table x4-7 z5-6 (L2)
  '....2222......',
  '..............',
  '...11111112...', // sofa x3-9 z8-9 (L1), side table (10,8-9) L2 with a lamp
  '...11111112...',
  '..............',
  '..............',
];
const XMAS_SPEC: ShellSpec = {
  id: 8,
  name: 'Christmas living room',
  map: XMAS_MAP,
  furniture: [
    F('armchair', 0, 0, 2, 2, 1, 0xbc4749),
    F('fireplace', 3, 0, 5, 1, 3, 0xc9ada7),
    F('cabinet', 8, 0, 2, 2, 2, 0x6a994e),
    F('chair', 10, 0, 1, 2, 1, 0xf2e8cf),
    F('cabinet', 11, 0, 1, 2, 2, 0x6a994e),
    F('window', 9, 0, 3, 1, 2, 0xa8d8f0),
    F('bookcase', 12, 0, 2, 2, 3, 0x7f5539),
    F('rug', 3, 2, 6, 5, 0, 0xc1121f),
    F('chair', 3, 5, 1, 1, 1, 0xf2e8cf),
    F('coffee-table', 4, 5, 4, 2, 2, 0x99582a),
    F('sofa', 3, 8, 7, 2, 1, 0x386641),
    F('nightstand', 10, 8, 1, 2, 2, 0x99582a),
    F('cat-bed', 13, 11, 1, 1, 0, 0x81b29a),
  ],
  humanSpot: { x: 10, z: 4 },
  humanEventSpot: { x: 14, z: 4 },
  humanSpot2: { x: 1, z: 1 },
  humanEventSpot2: { x: 1, z: 1 },
  catBed: { x: 13, z: 11 },
  wallColor: 0xf6efe0,
  floorColor: 0xa47148,
  // round the coffee table, under the sofa's nose (round 2)
  roombaLoop: loop([3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [8, 5], [8, 6], [8, 7], [7, 7], [6, 7], [5, 7], [4, 7], [3, 7], [3, 6], [2, 5]),
  spectatorSlots: spots([8, 0, 3], [9, 0, 3], [10, 0, 2], [11, 0, 3], [0, 3, 2], [0, 4, 2], [0, 5, 2], [0, 6, 2], [0, 7, 2], [0, 8, 2], [0, 9, 2]),
  accompliceSpot: { x: 13, z: 0, level: 3 },
};
export const BOSS_CHRISTMAS = defineShell(XMAS_SPEC);

// ----- 9 Boss: New Year's party (14 x 12): a bar, cocktail tables, a DJ table, a lounge sofa -----
const NYE_MAP = [
  '33222222221.33', // bottle shelf x0-1 (L3), bar x2-9 (L2), bar stool (10,0-1) L1, (11,0), speaker stack x12-13 (L3)
  '33222222221122', // stool (11,1) L1, drinks cabinet x12-13 (L2)
  '..............', // the Party Host in front of the bar at (4,2)
  '..............',
  '..1.22...22.1.', // stools (2,4) (12,4), cocktail tables x4-5 and x9-10 z4-5 (L2)
  '...122...221..', // stools (3,5) (11,5)
  '..............',
  '..............',
  '..........122.', // stool (10,8), DJ table x11-12 z8-9 (L2)
  '111111.....22.',
  '111111........', // lounge sofa x0-5 z9-10 (L1): second human at (3,10)
  '..............',
];
const NYE_SPEC: ShellSpec = {
  id: 9,
  name: "New Year's party",
  map: NYE_MAP,
  furniture: [
    F('shelf', 0, 0, 2, 2, 3, 0x2b2d42),
    F('counter', 2, 0, 8, 2, 2, 0x3a3a46),
    F('chair', 10, 0, 1, 2, 1, 0xe9c46a),
    F('chair', 11, 1, 1, 1, 1, 0xe9c46a),
    F('shelf', 12, 0, 2, 1, 3, 0x22223b),
    F('cabinet', 12, 1, 2, 1, 2, 0x4a4e69),
    F('chair', 2, 4, 1, 1, 1, 0xe9c46a),
    F('table', 4, 4, 2, 2, 2, 0xf2e9e4),
    F('chair', 3, 5, 1, 1, 1, 0xe9c46a),
    F('table', 9, 4, 2, 2, 2, 0xf2e9e4),
    F('chair', 11, 5, 1, 1, 1, 0xe9c46a),
    F('chair', 12, 4, 1, 1, 1, 0xe9c46a),
    F('chair', 10, 8, 1, 1, 1, 0xe9c46a),
    F('table', 11, 8, 2, 2, 2, 0x22223b),
    F('sofa', 0, 9, 6, 2, 1, 0x9a8c98),
    F('rug', 5, 6, 5, 3, 0, 0xffd166),
    F('cat-bed', 13, 11, 1, 1, 0, 0x81b29a),
  ],
  humanSpot: { x: 4, z: 2 },
  humanEventSpot: { x: 14, z: 6 },
  humanSpot2: { x: 3, z: 10 },
  humanEventSpot2: { x: 3, z: 10 },
  catBed: { x: 13, z: 11 },
  wallColor: 0x2e2a4f,
  floorColor: 0x6d597a,
  // between the two cocktail tables (round 2)
  roombaLoop: loop([6, 4], [7, 4], [8, 4], [8, 5], [7, 5], [6, 5]),
  spectatorSlots: spots([2, 0, 3], [3, 0, 3], [4, 0, 3], [5, 0, 3], [6, 0, 3], [7, 0, 3], [8, 0, 3], [9, 0, 3], [11, 0, 2], [0, 3, 2], [0, 4, 2], [0, 5, 2], [0, 6, 2], [0, 7, 2]),
  accompliceSpot: { x: 13, z: 0, level: 3 },
};
export const BOSS_NYE = defineShell(NYE_SPEC);

// ----- 10 Kitchen · holiday dinner: the Kitchen with Grandma at the table (Thanksgiving, two humans) -----
export const KITCHEN_DINNER: ShellDef = Object.freeze({
  ...KITCHEN,
  id: 10,
  name: 'Kitchen',
  /** Grandma sits on the chair at the table's east end, facing the room. */
  humanSpot2: { x: 8, z: 6 },
  humanEventSpot2: { x: 8, z: 6 },
  maker: undefined,
}) as ShellDef;

// ----- 11 Living room · Zoom: a webcam on a tripod pointed at the TV wall, the WFH Worker on the sofa -----
export const LIVING_ZOOM = defineShell({
  ...LIVING_SPEC,
  id: 11,
  furniture: [...LIVING_FURNITURE, F('webcam', 5, 6, 1, 1, 0, 0x22223b)],
  webcam: { x: 5, z: 6, facing: 1 },
  maker: false,
});

/** Indexed by RoomDef.shell. */
export const SHELLS: readonly ShellDef[] = Object.freeze([
  KITCHEN,
  LIVING_ROOM,
  BATHROOM,
  HOME_OFFICE,
  PARTY_ROOM,
  BEDROOM,
  BOSS_BIRTHDAY,
  BOSS_WEDDING,
  BOSS_CHRISTMAS,
  BOSS_NYE,
  KITCHEN_DINNER,
  LIVING_ZOOM,
]);

/** Shell index constants. */
export const SHELL = {
  kitchen: 0,
  living: 1,
  bathroom: 2,
  office: 3,
  party: 4,
  bedroom: 5,
  bossBirthday: 6,
  bossWedding: 7,
  bossChristmas: 8,
  bossNye: 9,
  kitchenDinner: 10,
  livingZoom: 11,
} as const;

export function shellLevel(shell: ShellDef, x: number, z: number): Level | -1 {
  if (x < 0 || z < 0 || x >= shell.width || z >= shell.depth) return -1;
  return shell.levels[z * shell.width + x];
}
