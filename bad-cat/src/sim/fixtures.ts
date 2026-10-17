/**
 * Test fixtures for the sim (tests must not import ../content). A small 12 × 10 kitchen:
 * counter x 2..9 × z 0..1 at L2 (occludes), fridge x 10..11 × z 0..1 at L3 (occludes), chair (6,2) L1,
 * table x 3..4 × z 5..6 at L2 (occludes). Human at (11,5) busy facing E, looks W. Cat bed (0,9). Spawn (6,3).
 */
import { BOSS_TICKS, type Facing, type Level, type PlayableRoom, type PropPlacement, type RoomDef, type RoutineDef, type RunMode, type ShellDef } from '../types';

export const W = 12;
export const D = 10;

export interface FixtureOpts {
  props?: PropPlacement[];
  mode?: RunMode;
  levels?: { x: number; z: number; level: Level; occludes?: 0 | 1 }[];
  routine?: Partial<RoutineDef>;
  ticks?: number;
  seed?: number;
  /** v5: extra shell fields (roombaLoop, mirror, webcam, humanSpot2...). */
  shell?: Partial<ShellDef>;
  /** v5: second human (needs shell.humanSpot2). */
  routine2?: Partial<RoutineDef>;
  /** v5: extra room fields (accomplice, ...). */
  room?: Partial<RoomDef>;
}

export function makeRoom(o: FixtureOpts = {}): PlayableRoom {
  const levels: Level[] = new Array(W * D).fill(0);
  const occ: (0 | 1)[] = new Array(W * D).fill(0);
  const set = (x: number, z: number, lv: Level, oc: 0 | 1) => {
    levels[z * W + x] = lv;
    occ[z * W + x] = oc;
  };
  for (let z = 0; z <= 1; z++) for (let x = 2; x <= 9; x++) set(x, z, 2, 1);
  for (let z = 0; z <= 1; z++) for (let x = 10; x <= 11; x++) set(x, z, 3, 1);
  set(6, 2, 1, 0);
  for (let z = 5; z <= 6; z++) for (let x = 3; x <= 4; x++) set(x, z, 2, 1);
  for (const l of o.levels ?? []) set(l.x, l.z, l.level, l.occludes ?? 0);

  const shell: ShellDef = {
    id: 0,
    name: 'Test Kitchen',
    width: W,
    depth: D,
    levels,
    occludes: occ,
    furniture: [],
    humanSpot: { x: 11, z: 5 },
    humanEventSpot: { x: 13, z: 5 },
    catBed: { x: 0, z: 9 },
    ...o.shell,
  };
  const routine: RoutineDef = {
    id: 0,
    name: 'Test Dad',
    busy: [90, 270],
    telegraph: [15, 24],
    look: [45, 105],
    fakeOutPct: 20,
    fakeOutAfterTick: 900,
    escalateAfterTick: 1350,
    lookBonusTicks: 15,
    busyCutTicks: 30,
    eventTick: 1200,
    busyFacing: 3 as Facing,
    lookFacings: [7 as Facing],
    cue: 'stove timer',
    ...o.routine,
  };
  const play: PlayableRoom = {
    room: {
      id: 'test',
      shell: 0,
      routine: 0,
      event: 0,
      width: W,
      depth: D,
      spawn: { x: 6, z: 3 },
      props: o.props ?? [{ kind: 1, x: 4, z: 1, level: 2, rot: 0, target: true }],
      seed: o.seed ?? 18,
      ticks: o.ticks ?? 2250,
      ...o.room,
    },
    shell,
    routine,
    mode: o.mode ?? 'ranked',
  };
  if (o.routine2) {
    play.routine2 = { ...routine, id: 1, name: 'Test Mum', ...o.routine2 };
    play.room.routine2 = 1;
  }
  return play;
}

/**
 * v5 boss fixture, 14 x 12 (Saturday): two humans (one shared meter), a Roomba loop, a mirror, a webcam, a
 * tablecloth, a cable lamp, a Christmas tree under a shelf, a box, stacks, puddle kinds and an accomplice wish.
 *   counter x 2..10 × z 0..1 L2 (occludes) · shelf x 12..13 × z 0..1 L3 · chair (6,2) L1 · table x 4..6 × z 6..7 L2
 *   tree (12,2) under the shelf · humans (13,6) and (0,6) · Roomba loop around x 1..9 × z 9..10.
 */
export const BW = 14;
export const BD = 12;
export function makeBossRoom(o: { mode?: RunMode; seed?: number; napper?: boolean } = {}): PlayableRoom {
  const levels: Level[] = new Array(BW * BD).fill(0);
  const occ: (0 | 1)[] = new Array(BW * BD).fill(0);
  const set = (x: number, z: number, lv: Level, oc: 0 | 1) => {
    levels[z * BW + x] = lv;
    occ[z * BW + x] = oc;
  };
  for (let z = 0; z <= 1; z++) for (let x = 2; x <= 10; x++) set(x, z, 2, 1);
  for (let z = 0; z <= 1; z++) for (let x = 12; x <= 13; x++) set(x, z, 3, 1);
  set(11, 1, 2, 1);
  set(6, 2, 1, 0);
  for (let z = 6; z <= 7; z++) for (let x = 4; x <= 6; x++) set(x, z, 2, 1);
  const loop: { x: number; z: number }[] = [];
  for (let x = 1; x <= 9; x++) loop.push({ x, z: 9 });
  for (let x = 9; x >= 1; x--) loop.push({ x, z: 10 });
  const shell: ShellDef = {
    id: 9,
    name: 'Test Ballroom',
    width: BW,
    depth: BD,
    levels,
    occludes: occ,
    furniture: [],
    humanSpot: { x: 13, z: 6 },
    humanEventSpot: { x: 15, z: 6 },
    humanSpot2: { x: 0, z: 6 },
    humanEventSpot2: { x: -2, z: 6 },
    catBed: { x: 0, z: 11 },
    roombaLoop: loop,
    mirror: { x: 13, z: 11, facing: 8 },
    webcam: { x: 7, z: 11, facing: 1 },
  };
  const base: RoutineDef = {
    id: 0,
    name: 'Host',
    busy: [90, 240],
    telegraph: [15, 18],
    look: [45, 90],
    fakeOutPct: 20,
    fakeOutAfterTick: 900,
    escalateAfterTick: 1350,
    lookBonusTicks: 15,
    busyCutTicks: 30,
    eventTick: 1300,
    busyFacing: 3 as Facing,
    lookFacings: [7, 8, 6] as Facing[],
    cue: 'speech',
    mirror: true,
    onCamera: true,
  };
  const routine: RoutineDef = o.napper ? { ...base, kind: 'napper', mirror: false } : base;
  const routine2: RoutineDef = { ...base, id: 1, name: 'Caterer', busyFacing: 7 as Facing, lookFacings: [3, 2, 4] as Facing[], mirror: false };
  const props: PropPlacement[] = [
    { kind: 1, x: 3, z: 1, level: 2, rot: 0, target: true }, // 0 wine glass
    { kind: 3, x: 5, z: 1, level: 2, rot: 0, target: true }, // 1 plate stack
    { kind: 5, x: 7, z: 1, level: 2, rot: 0 }, // 2 egg carton (slip)
    { kind: 9, x: 9, z: 1, level: 2, rot: 2 }, // 3 lamp, cable at (9,2)
    { kind: 14, x: 4, z: 6, level: 2, rot: 0, w: 3, d: 2 }, // 4 tablecloth over the table
    { kind: 2, x: 4, z: 7, level: 2, rot: 0 }, // 5 mug on the cloth
    { kind: 7, x: 5, z: 7, level: 2, rot: 0, target: true }, // 6 vase on the cloth
    { kind: 13, x: 6, z: 7, level: 2, rot: 0 }, // 7 perfume on the cloth
    { kind: 17, x: 12, z: 2, level: 0, rot: 0 }, // 8 Christmas tree
    { kind: 54, x: 11, z: 9, level: 0, rot: 0 }, // 9 cardboard box
    { kind: 20, x: 1, z: 9, level: 0, rot: 0 }, // 10 Roomba
    { kind: 19, x: 2, z: 4, level: 0, rot: 0 }, // 11 sock
    { kind: 15, x: 10, z: 0, level: 2, rot: 0 }, // 12 book stack
    { kind: 21, x: 8, z: 0, level: 2, rot: 0 }, // 13 tuna can (the wish)
    { kind: 58, x: 4, z: 0, level: 2, rot: 0 }, // 14 water glass (slip)
    { kind: 2, x: 12, z: 4, level: 0, rot: 0 }, // 15 mug in the tree's path
  ];
  return {
    room: {
      id: 'test-boss',
      shell: 9,
      routine: 0,
      routine2: 1,
      event: 8,
      width: BW,
      depth: BD,
      spawn: { x: 8, z: 4 },
      props,
      seed: o.seed ?? 77,
      ticks: BOSS_TICKS,
      boss: true,
      accomplice: { pinkPawId: 'mila', wishPropIndex: 13 },
    },
    shell,
    routine,
    routine2: o.napper ? undefined : routine2,
    mode: o.mode ?? 'ranked',
  };
}
