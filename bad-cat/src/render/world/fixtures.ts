/**
 * Synthetic rooms for the world tests and the world preview page (no dependency on the content package): a living
 * room, a bathroom-bedroom and a 14 x 12 boss hall that between them use every FurnitureType the kitchen does not,
 * a dense prop filler, and a v5 SimState builder. Levels are derived from the furniture, so the pictures always
 * match a valid heightmap.
 */
import {
  CatAct,
  HumanSt,
  PROP_KINDS,
  PropSt,
  propKind,
  type FurniturePiece,
  type FurnitureType,
  type Level,
  type PlayableRoom,
  type PropPlacement,
  type RoomTheme,
  type RoutineDef,
  type ShellDef,
  type SimState,
} from '../../types';
import { FLAT_TYPES } from './furniture';

/** Every FurnitureType (types.ts). The builder table in furniture.ts is typed against the union too. */
export const ALL_FURNITURE: readonly FurnitureType[] = [
  'counter', 'table', 'chair', 'shelf', 'fridge', 'stove', 'sink', 'sofa', 'cat-bed', 'rug', 'window', 'cabinet',
  'bathtub', 'toilet', 'mirror', 'vanity', 'tv', 'tv-stand', 'coffee-table', 'desk', 'office-chair', 'bookcase', 'bed',
  'nightstand', 'wardrobe', 'dresser', 'party-table', 'buffet', 'fireplace', 'washing-machine', 'arch', 'webcam', 'door',
  'armchair', 'plant-stand', 'stage',
];

const P = (type: FurnitureType, x: number, z: number, w: number, d: number, level: Level, color?: number): FurniturePiece => ({ type, x, z, w, d, level, color });

const KITCHEN: FurniturePiece[] = [
  P('counter', 0, 0, 2, 2, 2, 0xe8d5b5),
  P('sink', 2, 0, 2, 2, 2, 0xcfd8dc),
  P('counter', 4, 0, 1, 2, 2, 0xe8d5b5),
  P('stove', 5, 0, 2, 2, 2, 0x3d3a40),
  P('counter', 7, 0, 3, 2, 2, 0xe8d5b5),
  P('window', 2, 0, 3, 1, 2),
  P('fridge', 10, 0, 2, 2, 3, 0xf4f1ea),
  P('shelf', 0, 2, 2, 3, 3, 0x9c6b47),
  P('chair', 2, 2, 1, 1, 1),
  P('table', 4, 5, 4, 2, 2),
  P('chair', 3, 5, 1, 1, 1),
  P('cabinet', 10, 4, 2, 3, 2, 0x8fb39a),
  P('sofa', 6, 8, 4, 2, 1, 0xe07a5f),
  P('rug', 1, 7, 4, 3, 0, 0xf2cc8f),
  P('cat-bed', 10, 8, 1, 1, 0),
];

const LIVING: FurniturePiece[] = [
  P('window', 1, 0, 3, 1, 2),
  P('tv', 4, 0, 3, 1, 1),
  P('fireplace', 8, 0, 2, 1, 2),
  P('door', 10, 0, 2, 1, 0),
  P('bookcase', 0, 2, 1, 3, 3),
  P('tv-stand', 0, 6, 1, 2, 1),
  P('sofa', 3, 7, 4, 2, 1, 0x8f9fd6),
  P('coffee-table', 4, 4, 2, 1, 1),
  P('armchair', 8, 5, 2, 2, 1),
  P('rug', 2, 3, 7, 4, 0, 0xd9677a),
  P('plant-stand', 11, 3, 1, 1, 2),
  P('cat-bed', 10, 8, 1, 1, 0),
];

const BATH_BED: FurniturePiece[] = [
  P('window', 4, 0, 3, 1, 2),
  P('bathtub', 0, 0, 3, 2, 1),
  P('toilet', 8, 0, 1, 1, 1),
  P('vanity', 9, 0, 2, 1, 2),
  P('mirror', 9, 0, 2, 1, 0),
  P('washing-machine', 11, 0, 1, 1, 2),
  P('bed', 0, 4, 3, 3, 1, 0xc77dff),
  P('nightstand', 0, 7, 1, 1, 2),
  P('wardrobe', 0, 8, 1, 2, 3),
  P('dresser', 11, 4, 1, 2, 2),
  P('rug', 4, 5, 4, 3, 0, 0x90caf9),
  P('cat-bed', 10, 8, 1, 1, 0),
];

const BOSS: FurniturePiece[] = [
  P('window', 5, 0, 4, 1, 2),
  P('stage', 0, 0, 4, 2, 1),
  P('buffet', 10, 0, 4, 1, 2),
  P('arch', 5, 2, 4, 1, 0),
  P('party-table', 2, 5, 3, 2, 2),
  P('party-table', 9, 5, 3, 2, 2, 0xbde0fe),
  P('chair', 1, 5, 1, 1, 1),
  P('chair', 12, 6, 1, 1, 1),
  P('table', 5, 8, 3, 2, 2),
  P('chair', 4, 8, 1, 1, 1),
  P('desk', 0, 9, 1, 3, 2),
  P('office-chair', 1, 10, 1, 1, 1),
  P('webcam', 13, 9, 1, 1, 0),
  P('cat-bed', 12, 10, 1, 1, 0),
];

function shellFrom(id: number, name: string, W: number, D: number, furniture: FurniturePiece[], extra: Partial<ShellDef>): ShellDef {
  const levels = new Array<Level>(W * D).fill(0);
  for (const f of furniture) {
    if (FLAT_TYPES.has(f.type)) continue;
    for (let z = f.z; z < f.z + f.d; z++) for (let x = f.x; x < f.x + f.w; x++) if (x < W && z < D) levels[z * W + x] = Math.max(levels[z * W + x], f.level) as Level;
  }
  return {
    id,
    name,
    width: W,
    depth: D,
    levels,
    occludes: levels.map((l) => (l >= 2 ? 1 : 0)),
    furniture,
    humanSpot: { x: 6, z: 2 },
    humanEventSpot: { x: W, z: 3 },
    catBed: { x: 10, z: 8 },
    ...extra,
  };
}

export type FixtureShell = 'kitchen' | 'living' | 'bath-bed' | 'boss';

export function fixtureShell(kind: FixtureShell): ShellDef {
  switch (kind) {
    case 'kitchen':
      return shellFrom(0, 'Kitchen', 12, 10, KITCHEN, { humanSpot: { x: 5, z: 2 }, wallColor: 0xf6e7cf, floorColor: 0xd9a066 });
    case 'living':
      return shellFrom(1, 'Living room', 12, 10, LIVING, {
        roombaLoop: [
          { x: 3, z: 3 },
          { x: 4, z: 3 },
          { x: 5, z: 3 },
          { x: 6, z: 3 },
          { x: 7, z: 4 },
          { x: 7, z: 5 },
          { x: 6, z: 6 },
          { x: 5, z: 6 },
          { x: 4, z: 6 },
          { x: 3, z: 6 },
          { x: 2, z: 5 },
          { x: 2, z: 4 },
        ],
      });
    case 'bath-bed':
      return shellFrom(2, 'Bathroom', 12, 10, BATH_BED, { mirror: { x: 9, z: 1, facing: 5 }, humanEventSpot: { x: -1, z: 3 } });
    case 'boss':
      return shellFrom(3, 'Boss: Wedding', 14, 12, BOSS, {
        humanSpot: { x: 6, z: 4 },
        humanSpot2: { x: 8, z: 4 },
        catBed: { x: 12, z: 10 },
        webcam: { x: 13, z: 9, facing: 7 },
        roombaLoop: [
          { x: 4, z: 7 },
          { x: 5, z: 7 },
          { x: 6, z: 7 },
          { x: 7, z: 7 },
          { x: 8, z: 7 },
          { x: 9, z: 8 },
          { x: 9, z: 9 },
          { x: 8, z: 10 },
          { x: 7, z: 10 },
          { x: 6, z: 10 },
          { x: 5, z: 10 },
          { x: 4, z: 10 },
          { x: 3, z: 9 },
          { x: 3, z: 8 },
        ],
      });
  }
}

export const FIXTURE_ROUTINE: RoutineDef = {
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
};

/**
 * Up to `max` props on the shell: the Roomba on its loop, the tree and a box on the floor, a cloth over a table, a
 * lamp with a cable, then every other kind on free cells at their surface level (targets on three of them).
 */
export function denseProps(sh: ShellDef, max = 45, maxKinds = 20): PropPlacement[] {
  const W = sh.width;
  const D = sh.depth;
  const used = new Uint8Array(W * D);
  const out: PropPlacement[] = [];
  const take = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= W || z >= D || used[z * W + x]) return false;
    if (x === sh.humanSpot.x && z === sh.humanSpot.z) return false;
    used[z * W + x] = 1;
    return true;
  };
  const lv = (x: number, z: number) => sh.levels[z * W + x] as Level;
  if (sh.roombaLoop?.length) {
    const c = sh.roombaLoop[0];
    if (take(c.x, c.z)) out.push({ kind: 20, x: c.x, z: c.z, level: 0, rot: 0 });
  }
  for (const c of sh.roombaLoop ?? []) used[c.z * W + c.x] = 1;
  // a cloth over the first table-like piece, a lamp with its cable next to it
  const tab = sh.furniture.find((f) => f.type === 'table' || f.type === 'party-table' || f.type === 'buffet');
  if (tab) {
    out.push({ kind: 14, x: tab.x, z: tab.z, level: tab.level, rot: 0, w: Math.min(2, tab.w), d: Math.min(2, tab.d) });
    if (take(tab.x + 1, tab.z)) out.push({ kind: 6, x: tab.x + 1, z: tab.z, level: tab.level, rot: 0, target: true });
  }
  // a realistic mix: the daily rooms use 11..21 distinct kinds; always include the special ones
  const special = [9, 15, 17, 54, 63, 3, 27, 55];
  const kinds = [...special, ...PROP_KINDS.map((k) => k.kind).filter((k) => k !== 20 && k !== 14 && !special.includes(k))].slice(0, Math.max(4, maxKinds - 2));
  let ki = 0;
  let targets = out.filter((p) => p.target).length;
  for (let z = 0; z < D && out.length < max; z++)
    for (let x = 0; x < W && out.length < max; x++) {
      const l = lv(x, z);
      if (used[z * W + x]) continue;
      // floor cells only every few cells (the cat needs room to walk)
      if (l === 0 && (x + z * 3) % 4 !== 0) continue;
      let kind = kinds[ki % kinds.length];
      const def = propKind(kind)!;
      // tall props and boxes go on the floor, everything else on raised surfaces or the floor
      if ((def.tall !== undefined || def.enterable) && l !== 0) {
        ki++;
        kind = kinds[ki % kinds.length];
      }
      if ((propKind(kind)!.tall !== undefined || propKind(kind)!.enterable) && l !== 0) continue;
      if (!take(x, z)) continue;
      ki++;
      const p: PropPlacement = { kind, x, z, level: l, rot: ((x + z) % 4) as 0 | 1 | 2 | 3 };
      if (propKind(kind)?.pull === 'cable') {
        const cz = z + 1 < D && lv(x, z + 1) === 0 ? z + 1 : z;
        p.cable = { x, z: cz };
      }
      if (targets < 3 && l >= 1 && propKind(kind)!.base > 0) {
        p.target = true;
        targets++;
      }
      out.push(p);
    }
  return out;
}

export function fixturePlayFor(shell: ShellDef, theme: RoomTheme = 'default', props?: PropPlacement[], extra: Partial<PlayableRoom['room']> = {}): PlayableRoom {
  return {
    mode: 'practice',
    room: {
      id: `fixture-${shell.id}-${theme}`,
      shell: shell.id,
      routine: 0,
      event: 3,
      width: shell.width,
      depth: shell.depth,
      spawn: { x: 1, z: shell.depth - 2 },
      seed: 1,
      ticks: 2250,
      props: props ?? denseProps(shell),
      theme,
      ...extra,
    },
    shell,
    routine: FIXTURE_ROUTINE,
  };
}

/** A v5 SimState for the fixture (render reads it only). */
export function fixtureStateFor(play: PlayableRoom): SimState {
  const w = play.shell.width;
  const d = play.shell.depth;
  const propAt = new Int16Array(w * d).fill(-1);
  play.room.props.forEach((p, i) => (propAt[p.z * w + p.x] = i));
  const roombaIdx = play.room.props.findIndex((p) => propKind(p.kind)?.actor === 'roomba');
  const loop = play.shell.roombaLoop;
  return {
    tick: 0,
    ticks: 2250,
    rng: 1,
    grid: { w, d, level: Uint8Array.from(play.shell.levels), occludes: Uint8Array.from(play.shell.occludes), propAt, puddle: new Uint8Array(w * d) },
    cat: { x: 1, z: d - 2, level: 0, fromX: 1, fromZ: d - 2, fromLevel: 0, stepTicks: 0, stepProgress: 0, facing: 3, act: CatAct.IDLE, actTimer: 0, idleTicks: 0, carrying: -1, stashed: 0 },
    humans: [{ x: play.shell.humanSpot.x, z: play.shell.humanSpot.z, facing: 1, state: HumanSt.BUSY, timer: 100, stateTicks: 100, telegraph: 0, fakeOut: 0, lookFacing: 5, eventDone: 0, turns: 0, lookStartTick: -1 }],
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
      ...(p.kind === 14 ? { w: p.w ?? 1, d: p.d ?? 1, pulls: 0 } : {}),
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
    rules: 5,
    noise: 0,
    maxNoise: 0,
    roomba:
      roombaIdx >= 0 && loop?.length
        ? { prop: roombaIdx, x: loop[0].x, z: loop[0].z, fromX: loop[0].x, fromZ: loop[0].z, loopIndex: 0, stepProgress: 0, facing: 3, pause: 0 }
        : null,
    slides: 0,
    pulls: 0,
    onCamera: 0,
    inBox: -1,
  };
}
