/**
 * Test fixtures for the render lane (no dependency on the content lane): a 12 × 10 kitchen shell,
 * a routine and a room with a few props, plus a hand-built SimState.
 */
import {
  CatAct,
  HumanSt,
  PropSt,
  type FurniturePiece,
  type Level,
  type PlayableRoom,
  type PropPlacement,
  type SimState,
} from '../types';

const MAP = [
  '222222222233',
  '222222222233',
  '331.....1...',
  '33..........',
  '33....1...22',
  '...12222..22',
  '....22221.22',
  '.....1.....1',
  '......1111..',
  '......1111..',
];

const FURN: FurniturePiece[] = [
  { type: 'counter', x: 0, z: 0, w: 2, d: 2, level: 2 },
  { type: 'sink', x: 2, z: 0, w: 2, d: 2, level: 2 },
  { type: 'counter', x: 4, z: 0, w: 1, d: 2, level: 2 },
  { type: 'stove', x: 5, z: 0, w: 2, d: 2, level: 2 },
  { type: 'counter', x: 7, z: 0, w: 3, d: 2, level: 2 },
  { type: 'window', x: 2, z: 0, w: 3, d: 1, level: 2 },
  { type: 'fridge', x: 10, z: 0, w: 2, d: 2, level: 3 },
  { type: 'shelf', x: 0, z: 2, w: 2, d: 3, level: 3 },
  { type: 'chair', x: 2, z: 2, w: 1, d: 1, level: 1 },
  { type: 'table', x: 4, z: 5, w: 4, d: 2, level: 2 },
  { type: 'chair', x: 3, z: 5, w: 1, d: 1, level: 1 },
  { type: 'cabinet', x: 10, z: 4, w: 2, d: 3, level: 2 },
  { type: 'sofa', x: 6, z: 8, w: 4, d: 2, level: 1 },
  { type: 'rug', x: 1, z: 7, w: 4, d: 3, level: 0 },
  { type: 'cat-bed', x: 10, z: 8, w: 1, d: 1, level: 0 },
];

export function fixturePlay(props?: PropPlacement[]): PlayableRoom {
  const levels: Level[] = [];
  const occludes: (0 | 1)[] = [];
  for (const row of MAP)
    for (const ch of row) {
      const l = (ch === '.' ? 0 : Number(ch)) as Level;
      levels.push(l);
      occludes.push(l >= 2 ? 1 : 0);
    }
  return {
    mode: 'practice',
    room: {
      id: 'test',
      shell: 0,
      routine: 0,
      event: 0,
      width: 12,
      depth: 10,
      spawn: { x: 1, z: 8 },
      seed: 1,
      ticks: 2250,
      props: props ?? [
        { kind: 1, x: 3, z: 1, level: 2, rot: 2, target: true },
        { kind: 2, x: 7, z: 1, level: 2, rot: 0 },
        { kind: 19, x: 2, z: 8, level: 0, rot: 1 },
        { kind: 15, x: 5, z: 5, level: 2, rot: 0, target: true },
      ],
    },
    shell: {
      id: 0,
      name: 'Kitchen',
      width: 12,
      depth: 10,
      levels,
      occludes,
      furniture: FURN,
      humanSpot: { x: 5, z: 2 },
      humanEventSpot: { x: 12, z: 3 },
      catBed: { x: 10, z: 8 },
    },
    routine: {
      id: 0,
      name: 'Chef Dad',
      busy: [90, 270],
      telegraph: [24, 24],
      look: [45, 105],
      fakeOutPct: 20,
      fakeOutAfterTick: 900,
      escalateAfterTick: 1350,
      lookBonusTicks: 15,
      busyCutTicks: 30,
      eventTick: 1200,
      busyFacing: 1,
      lookFacings: [5, 4, 6, 3, 7],
      cue: 'stove timer',
    },
  };
}

/** A minimal SimState matching the fixture (render reads it only). */
export function fixtureState(play: PlayableRoom): SimState {
  const w = play.shell.width;
  const d = play.shell.depth;
  const propAt = new Int16Array(w * d).fill(-1);
  play.room.props.forEach((p, i) => (propAt[p.z * w + p.x] = i));
  return {
    tick: 0,
    ticks: 2250,
    rng: 1,
    grid: { w, d, level: Uint8Array.from(play.shell.levels), occludes: Uint8Array.from(play.shell.occludes), propAt },
    cat: { x: 1, z: 8, level: 0, fromX: 1, fromZ: 8, fromLevel: 0, stepTicks: 0, stepProgress: 0, facing: 3, act: CatAct.IDLE, actTimer: 0, idleTicks: 0, carrying: -1, stashed: 0 },
    humans: [
      { x: 5, z: 2, facing: 1, state: HumanSt.BUSY, timer: 100, stateTicks: 100, telegraph: 0, fakeOut: 0, lookFacing: 5, eventDone: 0, turns: 0, lookStartTick: -1 },
    ],
    props: play.room.props.map((p) => ({
      kind: p.kind,
      x: p.x,
      z: p.z,
      level: p.level,
      fromX: p.x,
      fromZ: p.z,
      fromLevel: p.level,
      state: PropSt.REST,
      swats: 0,
      fallTimer: 0,
      fallTicks: 0,
      dir: 0,
      chain: 0,
      points: 0,
      target: p.target ? 1 : 0,
      hit: 0,
      seen: 0,
      restTick: -1,
    })),
    suspicion: 0,
    maxSuspicion: 0,
    seen: 0,
    seenCount: 0,
    score: 0,
    combo: 1,
    maxCombo: 1,
    comboTimer: 0,
    targetsHit: 0,
    wish: 0,
    framed: 0,
    eventActive: 0,
    lastCall: 0,
    firstCrashTick: -1,
    stamp: 0,
    caughtTick: -1,
    ended: 0,
    finalScore: 0,
    btnBuf: 0,
  };
}

/**
 * A 14 × 12 boss shell with every FULL-build field (second human, mirror, webcam, Roomba loop, 15 spectator slots,
 * the fridge wall, the accomplice spot) and a two-human room: Party Host + Grandma (render tests and the dev page).
 */
export function bossFixture(opts: { napper?: boolean } = {}): PlayableRoom {
  const W = 14;
  const D = 12;
  const MAPB = [
    '22222222222233',
    '22222222222233',
    '33............',
    '33....11......',
    '33............',
    '......2222..22',
    '......2222..22',
    '..............',
    '.11.......1...',
    '.11...........',
    '..........1111',
    '..........1111',
  ];
  const levels: Level[] = [];
  const occludes: (0 | 1)[] = [];
  for (const row of MAPB)
    for (const ch of row) {
      const l = (ch === '.' ? 0 : Number(ch)) as Level;
      levels.push(l);
      occludes.push(l >= 2 ? 1 : 0);
    }
  const furniture: FurniturePiece[] = [
    { type: 'counter', x: 0, z: 0, w: 4, d: 2, level: 2 },
    { type: 'sink', x: 4, z: 0, w: 2, d: 2, level: 2 },
    { type: 'stove', x: 6, z: 0, w: 2, d: 2, level: 2 },
    { type: 'counter', x: 8, z: 0, w: 4, d: 2, level: 2 },
    { type: 'window', x: 3, z: 0, w: 4, d: 1, level: 2 },
    { type: 'fridge', x: 12, z: 0, w: 2, d: 2, level: 3 },
    { type: 'shelf', x: 0, z: 2, w: 2, d: 3, level: 3 },
    { type: 'party-table', x: 6, z: 5, w: 4, d: 2, level: 2 },
    { type: 'cabinet', x: 12, z: 5, w: 2, d: 2, level: 2 },
    { type: 'chair', x: 6, z: 3, w: 2, d: 1, level: 1 },
    { type: 'sofa', x: 1, z: 8, w: 2, d: 2, level: 1 },
    { type: 'bed', x: 10, z: 10, w: 4, d: 2, level: 1 },
    { type: 'rug', x: 3, z: 8, w: 4, d: 3, level: 0 },
    { type: 'cat-bed', x: 9, z: 8, w: 1, d: 1, level: 0 },
    { type: 'mirror', x: 9, z: 2, w: 1, d: 1, level: 0 },
    { type: 'webcam', x: 3, z: 3, w: 1, d: 1, level: 0 },
  ];
  const spectatorSlots: { x: number; z: number; level: Level }[] = [];
  for (let i = 0; i < 8; i++) spectatorSlots.push({ x: 1 + i, z: 0, level: 2 });
  for (let i = 0; i < 4; i++) spectatorSlots.push({ x: 8 + i, z: 1, level: 2 });
  spectatorSlots.push({ x: 0, z: 2, level: 3 }, { x: 1, z: 3, level: 3 }, { x: 0, z: 4, level: 3 });
  const base = fixturePlay().routine;
  const host = { ...base, id: 4, name: 'Party Host', persona: 'party-host' as const, holding: 'phone' as const, mirror: true, onCamera: true, busyFacing: 1 as const };
  const grandma = { ...base, id: 6, name: 'Grandma', persona: 'grandma' as const, holding: 'mug' as const, busyFacing: 7 as const, lookFacings: [6, 7, 5] as const };
  const napper = { ...base, id: 5, name: 'The Napper', persona: 'napper' as const, kind: 'napper' as const, pose: 'lie' as const, busyFacing: 7 as const };
  return {
    mode: 'practice',
    room: {
      id: 'boss-test',
      shell: 9,
      routine: 4,
      routine2: 6,
      event: 8,
      width: W,
      depth: D,
      spawn: { x: 4, z: 9 },
      seed: 7,
      ticks: 2700,
      boss: true,
      props: [
        { kind: 6, x: 7, z: 5, level: 2, rot: 0, target: true },
        { kind: 55, x: 8, z: 6, level: 2, rot: 0, target: true },
        { kind: 1, x: 2, z: 1, level: 2, rot: 0, target: true },
        { kind: 2, x: 9, z: 1, level: 2, rot: 0 },
        { kind: 21, x: 12, z: 5, level: 2, rot: 0 },
        { kind: 19, x: 4, z: 10, level: 0, rot: 0 },
      ],
      accomplice: { pinkPawId: 'mila', wishPropIndex: 4, x: 13, z: 6, level: 2 },
    },
    shell: {
      id: 9,
      name: 'Boss Party',
      width: W,
      depth: D,
      levels,
      occludes,
      furniture,
      humanSpot: { x: 5, z: 3 },
      humanEventSpot: { x: 14, z: 4 },
      humanSpot2: opts.napper ? { x: 11, z: 10 } : { x: 11, z: 7 },
      humanEventSpot2: { x: 14, z: 8 },
      catBed: { x: 9, z: 8 },
      mirror: { x: 9, z: 2, facing: 5 },
      webcam: { x: 3, z: 3, facing: 4 },
      roombaLoop: [
        { x: 2, z: 5 },
        { x: 3, z: 5 },
        { x: 4, z: 5 },
        { x: 4, z: 6 },
        { x: 3, z: 6 },
        { x: 2, z: 6 },
      ],
      spectatorSlots,
      fridgeWall: { x: 12, z: 1, w: 2 },
      accompliceSpot: { x: 13, z: 6, level: 2 },
    },
    routine: host,
    routine2: opts.napper ? napper : grandma,
  };
}
