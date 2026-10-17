/**
 * Human routines (GDD 4.3). Indices are fixed (RoomDef.routine / routine2, 4 bits in room codec v2):
 *
 *   0..3  Chef Dad in four tempos (FROZEN: v4 ghosts of the Kitchen variants depend on them)
 *   4 Couch Potato       5 Skincare Sis        6 WFH Worker (desk)   7 Party Host
 *   8 Napper             9 Grandma             10 Caterer A          11 Caterer B
 *   12 Party Host (boss tempo)                 13 WFH Worker (on the sofa, the pre-office Zoom call)
 *   14 Christmas Host (the Christmas Tree boss)
 *
 * The telegraph range below is the routine's own; daily rooms override it with the weekday value
 * (RoomDef.telegraph, applied in `resolve`). Facings: 1 N, 2 NE, 3 E, 4 SE, 5 S, 6 SW, 7 W, 8 NW.
 */
import type { RoutineDef } from '../types';

/** FTUE (GDD 8): first turn at 8 s, room event at 15 s. */
export const FTUE_FIRST_TURN_TICK = 240;
export const FTUE_EVENT_TICK = 450;

const CHEF_DAD: RoutineDef = {
  id: 0,
  name: 'Chef Dad',
  busy: [90, 270],
  telegraph: [24, 24], // Monday: the longest warning
  look: [45, 90], // SIM_VERSION 4: was [45, 105]; a frozen 3.5 s look was dead time
  fakeOutPct: 20,
  fakeOutAfterTick: 900,
  escalateAfterTick: 1350,
  lookBonusTicks: 15,
  busyCutTicks: 30,
  eventTick: 1200,
  busyFacing: 1, // faces the stove (north wall)
  // S, SE, SW into the room, plus E and W along the back counter (40 % of looks turn toward the cat, sim/human.ts)
  lookFacings: [5, 4, 6, 3, 7],
  cue: 'stove timer',
  outfitColor: 0x4f7cac,
};

/** Everything a FULL-build human shares with Chef Dad unless it says otherwise. */
const BASE: Omit<RoutineDef, 'id' | 'name' | 'cue' | 'busyFacing' | 'lookFacings'> = {
  busy: [90, 270],
  telegraph: [22, 22],
  look: [45, 90],
  fakeOutPct: 20,
  fakeOutAfterTick: 900,
  escalateAfterTick: 1350,
  lookBonusTicks: 15,
  busyCutTicks: 30,
  eventTick: 1200,
};

const CHEF_DAD_FULL: RoutineDef = { ...CHEF_DAD, persona: 'chef-dad', holding: 'pan', pose: 'stand', maker: true };

export const ROUTINES: readonly RoutineDef[] = Object.freeze([
  // ----- FROZEN (v4): Chef Dad tempos. Only render/audio hints were added to index 0 (persona, pan, maker). -----
  CHEF_DAD_FULL,
  { ...CHEF_DAD, id: 1, busy: [100, 260], eventTick: 1050, persona: 'chef-dad', holding: 'pan', pose: 'stand' }, // early kettle
  { ...CHEF_DAD, id: 2, busy: [80, 220], telegraph: [22, 24], look: [45, 90], eventTick: 1260, persona: 'chef-dad', holding: 'pan', pose: 'stand' }, // jumpy
  { ...CHEF_DAD, id: 3, busy: [120, 300], look: [60, 105], eventTick: 1140, persona: 'chef-dad', holding: 'pan', pose: 'stand' }, // slow cook, long looks
  // ----- FULL build humans -----
  {
    ...BASE,
    id: 4,
    name: 'Couch Potato',
    busy: [100, 280],
    eventTick: 1150,
    busyFacing: 1, // the TV on the north wall
    lookFacings: [2, 8, 3, 7, 1], // ad break: up from the screen and around the room
    // SIM_VERSION 8 (QA round 3): he sits up for the look and sees over the coffee table (L2): his cones cover 71 %
    // of the swat cells (was 47 %; no set of facings from the sofa passed 60 % behind the table)
    lookOverV8: 2,
    cue: 'TV jingle',
    outfitColor: 0x8e7dbe,
    persona: 'couch-potato',
    holding: 'remote',
    pose: 'sit',
    maker: true,
  },
  {
    ...BASE,
    id: 5,
    name: 'Skincare Sis',
    busy: [90, 240],
    look: [40, 80],
    eventTick: 1100,
    busyFacing: 1, // nose to the mirror: the mirror cone watches the room behind her
    lookFacings: [5, 4, 6, 3, 7],
    cue: 'mirror hum',
    outfitColor: 0xf4acb7,
    persona: 'skincare-sis',
    holding: 'none',
    pose: 'stand',
    mirror: true,
  },
  {
    ...BASE,
    id: 6,
    name: 'WFH Worker',
    busy: [90, 250],
    eventTick: 1200,
    busyFacing: 1, // the desk and the webcam
    lookFacings: [5, 4, 6, 3, 7],
    cue: "you're on mute",
    outfitColor: 0x5e7ce2,
    persona: 'wfh-worker',
    holding: 'laptop',
    pose: 'sit',
    onCamera: true,
    maker: true,
  },
  {
    ...BASE,
    id: 7,
    name: 'Party Host',
    busy: [80, 220],
    eventTick: 1150,
    busyFacing: 1, // arranging the buffet
    lookFacings: [5, 4, 6, 3, 7],
    // SIM_VERSION 8 (QA round 3): she works the whole room, standing, over the party table; the front corners were
    // 8 cells away behind it and a cat that never froze camped there
    coneRangeV8: 10,
    lookOverV8: 2,
    cue: 'party horn',
    outfitColor: 0xff6392,
    persona: 'party-host',
    holding: 'tray',
    pose: 'stand',
  },
  {
    ...BASE,
    id: 8,
    name: 'Napper',
    kind: 'napper',
    busy: [150, 330],
    look: [60, 105], // a slow, groggy look around
    fakeOutPct: 30, // stirs, mumbles, rolls over
    eventTick: 1250,
    busyFacing: 5,
    lookFacings: [5, 4, 6, 3, 7],
    cue: 'snore stops',
    outfitColor: 0xa0c4ff,
    persona: 'napper',
    holding: 'none',
    pose: 'lie',
    maker: true,
  },
  {
    ...BASE,
    id: 9,
    name: 'Grandma',
    busy: [120, 300],
    telegraph: [32, 32], // long telegraphs: she announces every turn with a teacup clink
    look: [75, 120], // long looks: she has seen everything before
    fakeOutPct: 5,
    eventTick: 1300,
    busyFacing: 7, // knitting, facing the wall
    lookFacings: [3, 2, 4, 1, 5],
    cue: 'teacup clink',
    outfitColor: 0xb388eb,
    persona: 'grandma',
    holding: 'mug',
    pose: 'sit',
  },
  {
    ...BASE,
    id: 10,
    name: 'Caterer A',
    busy: [80, 200],
    look: [40, 75],
    eventTick: 1400,
    escalateAfterTick: 1650,
    busyFacing: 1, // the head table
    lookFacings: [5, 4, 3, 6],
    cue: 'tray clatter',
    outfitColor: 0x2b2d42,
    persona: 'caterer',
    holding: 'tray',
    pose: 'stand',
  },
  {
    ...BASE,
    id: 11,
    name: 'Caterer B',
    busy: [100, 240],
    look: [45, 90],
    eventTick: 1400,
    escalateAfterTick: 1650,
    busyFacing: 1, // the champagne table
    lookFacings: [7, 8, 6, 1, 5],
    cue: 'cork pop',
    outfitColor: 0x3d405b,
    persona: 'caterer',
    holding: 'tray',
    pose: 'stand',
  },
  {
    ...BASE,
    id: 12,
    name: 'Party Host',
    busy: [70, 190],
    look: [50, 95],
    fakeOutPct: 25,
    fakeOutAfterTick: 900,
    escalateAfterTick: 1650, // boss rooms run 90 s
    eventTick: 1450,
    busyFacing: 1,
    lookFacings: [5, 4, 6, 3, 7],
    cue: 'party horn',
    outfitColor: 0xff6392,
    persona: 'party-host',
    holding: 'tray',
    pose: 'stand',
  },
  {
    ...BASE,
    id: 13,
    name: 'WFH Worker',
    busy: [90, 250],
    eventTick: 1200,
    busyFacing: 1, // on the sofa, laptop on the knees, the webcam pointed at the TV wall
    lookFacings: [2, 8, 3, 7, 1],
    cue: "you're on mute",
    outfitColor: 0x5e7ce2,
    persona: 'wfh-worker',
    holding: 'laptop',
    pose: 'sit',
    onCamera: true,
  },
  {
    // QA round 3: the Christmas Tree boss had the Party Host's routine and party horn: its own host now, hanging
    // the last baubles with her back to the room; sleigh bells warn before she turns
    ...BASE,
    id: 14,
    name: 'Christmas Host',
    busy: [90, 220],
    look: [50, 95],
    fakeOutPct: 25,
    fakeOutAfterTick: 900,
    escalateAfterTick: 1650, // boss rooms run 90 s
    eventTick: 1450,
    busyFacing: 1, // the tree and the mantle
    lookFacings: [5, 4, 6, 3, 7],
    cue: 'sleigh bells',
    outfitColor: 0xc1121f,
    persona: 'party-host',
    holding: 'mug',
    pose: 'stand',
    coneRangeV8: 10,
  },
] as RoutineDef[]);

/** Routine index constants. */
export const ROUTINE = {
  chefDad: 0,
  couchPotato: 4,
  skincareSis: 5,
  wfhWorker: 6,
  partyHost: 7,
  napper: 8,
  grandma: 9,
  catererA: 10,
  catererB: 11,
  partyHostBoss: 12,
  wfhSofa: 13,
  christmasHost: 14,
} as const;
