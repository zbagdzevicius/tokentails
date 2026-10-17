import { describe, expect, it } from 'vitest';
import {
  BONUS,
  BTN_GRAB,
  BTN_JUMP,
  BTN_SWAT,
  CatAct,
  DEFAULT_CAT,
  EVENT_TICKS,
  HumanSt,
  MIRROR_SUSPICION_PCT,
  NOISE,
  NO_INPUT,
  ON_CAMERA_PCT,
  PropSt,
  ROOMBA_STEP_TICKS,
  SIM_VERSION,
  SUSPICION,
  type Dir8,
  type Facing,
  type Level,
  type PlayableRoom,
  type SimEvent,
  type SimState,
  type Speed,
  type TickInput,
} from '../types';
import {
  coneCells,
  hashState,
  initSim,
  mirrorConeCells,
  noiseOf,
  propPoints,
  roombaOf,
  runToEnd,
  stackPoints,
  stepSim,
  swatTarget,
  webcamCells,
  looksAt,
  ROOMBA_BLOCK_PAUSE,
  ROOMBA_CRASH_PAUSE,
} from './index';
import { makeBossRoom, makeRoom, type FixtureOpts } from './fixtures';

/** This file pins the v5 rule set (v5 ghosts replay on it); the v6 changes are in v6.test.ts. */
const V5 = { simVersion: 5 } as const;
const inp = (dir: Dir8, speed: Speed = 2, buttons = 0): TickInput => ({ dir, speed, buttons });
const SWAT = inp(0, 0, BTN_SWAT);

function run(s: SimState, play: PlayableRoom, input: TickInput, n = 1, out: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) stepSim(s, play, input, out);
  return out;
}
function settle(s: SimState, play: PlayableRoom, out: SimEvent[] = []): number {
  let n = 0;
  while ((s.cat.stepTicks > 0 || s.cat.actTimer > 0) && n < 100) {
    stepSim(s, play, NO_INPUT, out);
    n++;
  }
  return n;
}
function place(s: SimState, x: number, z: number, facing: Facing): void {
  const c = s.cat;
  c.x = c.fromX = x;
  c.z = c.fromZ = z;
  c.level = c.fromLevel = s.grid.level[z * s.grid.w + x] as Level;
  c.facing = facing;
}
/** A room whose human never turns during a short test. */
function calm(o: FixtureOpts = {}): PlayableRoom {
  return makeRoom({ ...o, routine: { eventTick: 5000, ...o.routine } });
}
function freezeHuman(s: SimState, i = 0): void {
  s.humans[i].timer = 100_000;
}
function look(s: SimState, facing: Facing, i = 0): void {
  const h = s.humans[i];
  h.state = HumanSt.LOOK;
  h.facing = facing;
  h.timer = 10_000;
  h.lookStartTick = -1;
}
const puddleOf = (s: SimState, x: number, z: number) => s.grid.puddle![z * s.grid.w + x];
/** Events of type T (members whose `t` is a union, like break/land/spill/hit, included). */
type Of<T extends SimEvent['t']> = SimEvent extends infer E ? (E extends { t: infer U } ? (T extends U ? E : never) : never) : never;
const of = <T extends SimEvent['t']>(ev: SimEvent[], t: T) => ev.filter((e) => e.t === t) as Of<T>[];

describe('rules versioning', () => {
  it('defaults to SIM_VERSION, accepts 4..8, rejects the rest', () => {
    const play = makeRoom();
    expect(initSim(play, DEFAULT_CAT).rules).toBe(SIM_VERSION);
    expect(initSim(play, DEFAULT_CAT, { simVersion: 4 }).rules).toBe(4);
    expect(initSim(play, DEFAULT_CAT, { simVersion: 5 }).rules).toBe(5);
    expect(() => initSim(play, DEFAULT_CAT, { simVersion: 3 })).toThrow(RangeError);
    expect(initSim(play, DEFAULT_CAT, { simVersion: 6 }).rules).toBe(6);
    expect(initSim(play, DEFAULT_CAT, { simVersion: 7 }).rules).toBe(7);
    expect(() => initSim(play, DEFAULT_CAT, { simVersion: 9 })).toThrow(RangeError);
    expect(() => runToEnd(play, DEFAULT_CAT, [], { simVersion: 2.5 })).toThrow(RangeError);
    expect(runToEnd(play, DEFAULT_CAT, [], { simVersion: 4 }).simVersion).toBe(4);
    expect(runToEnd(play, DEFAULT_CAT, [], V5).simVersion).toBe(5);
    expect(runToEnd(play, DEFAULT_CAT, []).simVersion).toBe(8);
  });
  it('rules 5 sets every v5 field; rules 4 sets none', () => {
    const play = makeRoom();
    const s5 = initSim(play, DEFAULT_CAT, V5);
    expect([s5.noise, s5.maxNoise, s5.slides, s5.pulls, s5.onCamera, s5.inBox, s5.roomba]).toEqual([0, 0, 0, 0, 0, -1, null]);
    expect(s5.grid.puddle).toBeInstanceOf(Uint8Array);
    expect(s5.props[0]).toMatchObject({ pulls: 0, w: 1, d: 1, sway: 0, framed: 0, onCam: 0 });
    expect(s5.humans[0].routine).toBe(0);
    const s4 = initSim(play, DEFAULT_CAT, { simVersion: 4 });
    expect(s4.noise).toBeUndefined();
    expect(s4.grid.puddle).toBeUndefined();
    expect(s4.props[0].pulls).toBeUndefined();
    expect(s4.humans[0].routine).toBeUndefined();
  });
  it('hashes the rule set', () => {
    const play = makeRoom();
    expect(hashState(initSim(play, DEFAULT_CAT, V5))).not.toBe(hashState(initSim(play, DEFAULT_CAT, { simVersion: 4 })));
  });
  it('run result carries the v5 stats', () => {
    const r = runToEnd(makeBossRoom(), DEFAULT_CAT, [], V5);
    expect(r).toMatchObject({ wish: false, stashed: 0, slides: 0, pulls: 0, onCamera: 0, maxNoise: 0, humans: 2 });
  });
});

describe('a. spill-slide', () => {
  it('a slip kind landing on the floor leaves a 2 x 2 puddle (push dir + clockwise perpendicular)', () => {
    const play = calm({ props: [{ kind: 5, x: 5, z: 1, level: 2, rot: 0 }] }); // egg carton
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 5, 0, 5);
    const ev = run(s, play, SWAT, 1);
    run(s, play, NO_INPUT, 13, ev);
    expect(s.props[0].state).toBe(PropSt.SPILLED);
    const pu = of(ev, 'puddle');
    // lands (5,2) pushed S: +S (5,3), clockwise of S is W (4,2), the diagonal (4,3)
    expect(pu.map((e) => [e.x, e.z, e.kind])).toEqual([
      [5, 2, 1],
      [5, 3, 1],
      [4, 2, 1],
      [4, 3, 1],
    ]);
    expect(puddleOf(s, 4, 3)).toBe(1);
  });
  it('clips to floor cells; soil puddles are kind 2; no puddle on a counter', () => {
    const play = calm({
      props: [
        { kind: 8, x: 2, z: 1, level: 2, rot: 0 }, // potted plant (soil), pushed W off the counter end
        { kind: 6, x: 9, z: 0, level: 2, rot: 0 }, // cake slides along the counter (no fall): no puddle
      ],
    });
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 3, 1, 7);
    const ev = run(s, play, SWAT, 1);
    run(s, play, NO_INPUT, 14, ev);
    const pu = of(ev, 'puddle');
    // lands (1,1) pushed W: +W (0,1), clockwise of W is N (1,0), diagonal (0,0); all floor
    expect(pu.map((e) => [e.x, e.z, e.kind])).toEqual([
      [1, 1, 2],
      [0, 1, 2],
      [1, 0, 2],
      [0, 0, 2],
    ]);
  });
  it('a normal step onto a slip cell skids one more cell (trot timing, no input), never chains', () => {
    const play = calm();
    const s = initSim(play, DEFAULT_CAT, V5);
    s.grid.puddle![4 * 12 + 6] = 1;
    s.grid.puddle![5 * 12 + 6] = 1;
    const ev = run(s, play, inp(5, 1), 1); // one sneak step S (13 ticks), then let go
    run(s, play, NO_INPUT, 12, ev);
    expect([s.cat.x, s.cat.z, s.cat.stepTicks]).toEqual([6, 4, 13]);
    run(s, play, NO_INPUT, 1, ev); // step done on the slip cell: the skid starts at once
    const sl = of(ev, 'slide');
    expect(sl).toEqual([{ t: 'slide', tick: 13, fromX: 6, fromZ: 4, x: 6, z: 5 }]);
    expect([s.cat.x, s.cat.z, s.cat.stepTicks, s.cat.act]).toEqual([6, 5, 7, CatAct.TROT]);
    expect(s.slides).toBe(1);
    run(s, play, NO_INPUT, 10, ev); // ends on another slip cell: no chain
    expect([s.cat.x, s.cat.z, s.cat.stepTicks]).toEqual([6, 5, 0]);
    expect(of(ev, 'slide').length).toBe(1);
  });
  it('a slide counts as movement for suspicion', () => {
    const play = calm();
    const s = initSim(play, DEFAULT_CAT, V5);
    s.grid.puddle![4 * 12 + 6] = 1;
    run(s, play, inp(5, 1), 1);
    run(s, play, NO_INPUT, 13);
    look(s, 7); // the human (11,5) looks W right at the skidding cat
    const before = s.suspicion;
    run(s, play, NO_INPUT, 1);
    expect(s.suspicion - before).toBe(SUSPICION.moveTrotInCone);
  });
  it('no slide into a wall, a table, soil, or after a jump', () => {
    const play = calm();
    // wall: W into (0,4)
    let s = initSim(play, DEFAULT_CAT, V5);
    place(s, 1, 4, 7);
    s.grid.puddle![4 * 12 + 0] = 1;
    let ev = run(s, play, inp(7), 8);
    expect([s.cat.x, of(ev, 'slide').length]).toEqual([0, 0]);
    // table: E from (1,5) into (2,5), (3,5) is the L2 table
    s = initSim(play, DEFAULT_CAT, V5);
    place(s, 1, 5, 3);
    s.grid.puddle![5 * 12 + 2] = 1;
    ev = run(s, play, inp(3), 1);
    run(s, play, NO_INPUT, 8, ev);
    expect([s.cat.x, of(ev, 'slide').length]).toEqual([2, 0]);
    // soil never slides
    s = initSim(play, DEFAULT_CAT, V5);
    s.grid.puddle![4 * 12 + 6] = 2;
    ev = run(s, play, inp(5), 1);
    run(s, play, NO_INPUT, 8, ev);
    expect([s.cat.z, of(ev, 'slide').length]).toEqual([4, 0]);
    // jump down from the chair onto a slip cell: no slide
    s = initSim(play, DEFAULT_CAT, V5);
    place(s, 6, 2, 5);
    s.grid.puddle![3 * 12 + 6] = 1;
    ev = run(s, play, inp(5, 2, BTN_JUMP), 1);
    run(s, play, NO_INPUT, 14, ev);
    expect([s.cat.z, of(ev, 'slide').length]).toEqual([3, 0]);
  });
  it('rules 4: puddle kinds stay visual-only (no grid, no events)', () => {
    const play = calm({ props: [{ kind: 5, x: 5, z: 1, level: 2, rot: 0 }] });
    const s = initSim(play, DEFAULT_CAT, { simVersion: 4 });
    place(s, 5, 0, 5);
    const ev = run(s, play, SWAT, 14);
    expect(s.props[0].state).toBe(PropSt.SPILLED);
    expect(of(ev, 'puddle').length).toBe(0);
    expect(s.grid.puddle).toBeUndefined();
  });
});

describe('b. stacks', () => {
  it('a plate stack scores each item with its own combo (by hand: 120 + 240 + 360 + 480)', () => {
    const play = calm({ props: [{ kind: 3, x: 5, z: 1, level: 2, rot: 0 }] });
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 5, 0, 5);
    const ev = run(s, play, SWAT, 14);
    const st = of(ev, 'stack');
    expect(st).toEqual([{ t: 'stack', tick: 13, prop: 0, items: 4, points: 1200 }]);
    const br = of(ev, 'break');
    expect(br).toEqual([{ t: 'break', tick: 13, prop: 0, points: 1200, combo: 4 }]);
    expect(ev.indexOf(st[0])).toBeLessThan(ev.indexOf(br[0]));
    expect(s.score).toBe(1200); // no double count
    expect([s.combo, s.maxCombo]).toEqual([4, 4]);
  });
  it('a soft stack (books) also raises the combo by its items; next break continues the chain', () => {
    const play = calm({
      props: [
        { kind: 15, x: 5, z: 1, level: 2, rot: 0 }, // 5 x 40
        { kind: 2, x: 7, z: 1, level: 2, rot: 0 },
      ],
    });
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 5, 0, 5);
    const ev = run(s, play, SWAT, 14);
    expect(of(ev, 'land')[0]).toMatchObject({ points: 60 + 120 + 180 + 240 + 300, combo: 5 });
    settle(s, play, ev);
    place(s, 7, 0, 5);
    run(s, play, SWAT, 1, ev);
    run(s, play, NO_INPUT, 13, ev);
    expect(of(ev, 'break')[0]).toMatchObject({ combo: 6, points: propPoints(100, 2, 6, 0, 0) });
  });
  it('stackPoints caps each item at COMBO_MAX', () => {
    expect(stackPoints(80, 4, 2, 7, 0, 0)).toBe(120 * 7 + 120 * 8 * 3);
    expect(stackPoints(40, 0, 1, 1, 0, 0)).toBe(0);
  });
  it('rules 4: a stack is one prop with one base score', () => {
    const play = calm({ props: [{ kind: 3, x: 5, z: 1, level: 2, rot: 0 }] });
    const s = initSim(play, DEFAULT_CAT, { simVersion: 4 });
    place(s, 5, 0, 5);
    const ev = run(s, play, SWAT, 14);
    expect(of(ev, 'stack').length).toBe(0);
    expect(of(ev, 'break')[0]).toMatchObject({ points: 480, combo: 1 });
  });
});

describe('c. tablecloth pull', () => {
  const cloth = () =>
    calm({
      props: [
        { kind: 14, x: 3, z: 5, level: 2, rot: 0, w: 2, d: 2 }, // 0 cloth over the whole table
        { kind: 1, x: 3, z: 6, level: 2, rot: 0 }, // 1 glass, south row
        { kind: 2, x: 4, z: 6, level: 2, rot: 0 }, // 2 mug, south row
        { kind: 7, x: 3, z: 5, level: 2, rot: 0 }, // 3 vase, north row
      ],
    });
  it('a swat at bare cloth from the floor drags everything one cell toward the cat; max 2 pulls', () => {
    const play = cloth();
    const s = initSim(play, DEFAULT_CAT, V5);
    expect(s.grid.propAt[5 * 12 + 3]).toBe(3); // the cloth is not in propAt, the vase is
    place(s, 3, 7, 1);
    expect(swatTarget(s)).toEqual({ prop: 0, grab: false, pull: 'cloth' });
    const ev = run(s, play, SWAT, 1);
    expect(of(ev, 'pull')).toEqual([{ t: 'pull', tick: 0, prop: 0, dir: 5, kind: 'cloth', moved: 3 }]);
    expect([s.props[1].state, s.props[2].state]).toEqual([PropSt.FALLING, PropSt.FALLING]); // off the edge
    expect([s.props[1].chain, s.props[1].dir]).toEqual([0, 5]);
    expect([s.props[3].x, s.props[3].z, s.props[3].state]).toEqual([3, 6, PropSt.REST]); // slid along
    expect([s.props[0].x, s.props[0].z, s.props[0].pulls, s.pulls]).toEqual([3, 6, 1, 1]);
    settle(s, play, ev);
    run(s, play, NO_INPUT, 14, ev);
    expect(of(ev, 'break').length).toBe(2);
    // the cloth now covers the cat's cell: step back, pull again
    place(s, 3, 8, 1);
    run(s, play, SWAT, 1, ev);
    expect(of(ev, 'pull')[1]).toMatchObject({ moved: 1 });
    expect(s.props[3].state).toBe(PropSt.FALLING);
    expect(s.props[0].state).toBe(PropSt.LANDED); // dropped on the 2nd pull
    expect(of(ev, 'land').find((e) => e.prop === 0)).toMatchObject({ points: 0 });
    settle(s, play, ev);
    place(s, 3, 8, 1);
    run(s, play, SWAT, 1, ev);
    expect(of(ev, 'pull').length).toBe(2); // no 3rd pull
    expect(s.pulls).toBe(2);
  });
  it('no pull from above the cloth, from a diagonal, or from a covered cell; rules 4 keeps it inert', () => {
    const play = cloth();
    let s = initSim(play, DEFAULT_CAT, V5);
    place(s, 2, 7, 2); // facing NE into (3,6): diagonal
    expect(swatTarget(s).pull).toBeUndefined();
    s = initSim(play, DEFAULT_CAT, V5);
    s.grid.level[7 * 12 + 3] = 3; // a shelf above the table edge
    place(s, 3, 7, 1);
    expect(swatTarget(s).pull).toBeUndefined();
    s = initSim(play, DEFAULT_CAT, { simVersion: 4 });
    place(s, 3, 7, 1);
    expect(swatTarget(s)).toEqual({ prop: -1, grab: false });
  });
});

describe('d. cable pull', () => {
  const lamp = (extra = {}) => calm({ props: [{ kind: 9, x: 7, z: 1, level: 2, rot: 2, ...extra }] }); // cable (7,2)
  it('a floor cat facing the cable tips the lamp toward it in one swat (lamps need 2)', () => {
    const play = lamp();
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 7, 3, 1);
    expect(swatTarget(s)).toEqual({ prop: 0, grab: false, pull: 'cable' });
    const ev = run(s, play, SWAT, 1);
    expect(s.props[0].state).toBe(PropSt.FALLING);
    expect(of(ev, 'pull')).toEqual([{ t: 'pull', tick: 0, prop: 0, dir: 5, kind: 'cable', moved: 1 }]);
    expect([s.props[0].pulls, s.pulls]).toEqual([1, 1]);
  });
  it('standing on the cable works too; a placement cable cell overrides rot', () => {
    let s = initSim(lamp(), DEFAULT_CAT, V5);
    place(s, 7, 2, 3);
    expect(swatTarget(s).pull).toBe('cable');
    const play = lamp({ cable: { x: 8, z: 2 } });
    s = initSim(play, DEFAULT_CAT, V5);
    place(s, 8, 3, 1);
    const ev = run(s, play, SWAT, 1);
    expect(of(ev, 'pull')[0]).toMatchObject({ kind: 'cable', dir: 4 }); // toward (8,2): SE
  });
  it('only from the floor', () => {
    const s = initSim(lamp(), DEFAULT_CAT, V5);
    place(s, 6, 2, 3); // on the chair (L1), facing the cable cell
    expect(swatTarget(s)).toEqual({ prop: -1, grab: false });
  });
});

describe('e. the Roomba', () => {
  const loop = [
    { x: 1, z: 8 },
    { x: 2, z: 8 },
    { x: 3, z: 8 },
    { x: 4, z: 8 },
    { x: 4, z: 9 },
    { x: 3, z: 9 },
    { x: 2, z: 9 },
    { x: 1, z: 9 },
  ];
  const room = (props = [{ kind: 20, x: 1, z: 8, level: 0 as Level, rot: 0 as const }]) =>
    calm({ props, shell: { roombaLoop: loop } });
  it('drives its loop one cell per ROOMBA_STEP_TICKS and is not in propAt', () => {
    const play = room();
    const s = initSim(play, DEFAULT_CAT, V5);
    const r = roombaOf(s)!;
    expect(r).toMatchObject({ prop: 0, x: 1, z: 8, loopIndex: 0, pause: 0 });
    expect(s.grid.propAt[8 * 12 + 1]).toBe(-1);
    const ev = run(s, play, NO_INPUT, ROOMBA_STEP_TICKS * 8);
    const rb = of(ev, 'roomba');
    expect(rb.slice(0, 3).map((e) => [e.tick, e.x, e.z])).toEqual([
      [0, 2, 8],
      [24, 3, 8],
      [48, 4, 8],
    ]);
    expect(rb[7]).toMatchObject({ tick: 168, x: 1, z: 8 }); // back to the start
    expect(roombaOf(s)!.loopIndex).toBe(0);
    expect([s.props[0].x, s.props[0].z]).toEqual([1, 8]);
  });
  it('blocks the cat, and waits for a cat in its way', () => {
    const play = room();
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 2, 7, 5);
    run(s, play, NO_INPUT, 1); // roomba now heading into (2,8)
    run(s, play, inp(5), 1);
    expect([s.cat.x, s.cat.z]).toEqual([2, 7]); // refused
    place(s, 3, 8, 1); // sit in the next loop cell
    const ev = run(s, play, NO_INPUT, ROOMBA_STEP_TICKS - 1); // arrives at (2,8) on tick 24, (3,8) is taken
    expect(roombaOf(s)!).toMatchObject({ x: 2, z: 8, pause: ROOMBA_BLOCK_PAUSE });
    expect(of(ev, 'roomba').length).toBe(0);
    place(s, 0, 0, 5);
    run(s, play, NO_INPUT, ROOMBA_BLOCK_PAUSE + 1, ev);
    expect(of(ev, 'roomba')[0]).toMatchObject({ x: 3, z: 8 });
  });
  it('a blocking floor prop stops it; a non-loop Roomba stays decoration', () => {
    let play = room([
      { kind: 20, x: 1, z: 8, level: 0, rot: 0 },
      { kind: 2, x: 2, z: 8, level: 0, rot: 0 },
    ]);
    let s = initSim(play, DEFAULT_CAT, V5);
    run(s, play, NO_INPUT, 1);
    expect(roombaOf(s)!).toMatchObject({ x: 1, pause: ROOMBA_BLOCK_PAUSE });
    play = room([{ kind: 20, x: 7, z: 7, level: 0, rot: 0 }]);
    s = initSim(play, DEFAULT_CAT, V5);
    expect(roombaOf(s)).toBeNull();
    expect(s.grid.propAt[7 * 12 + 7]).toBe(0);
  });
  it('spreads a slip puddle it drives through onto the next loop cell', () => {
    const play = room();
    const s = initSim(play, DEFAULT_CAT, V5);
    s.grid.puddle![8 * 12 + 2] = 1;
    const ev = run(s, play, NO_INPUT, ROOMBA_STEP_TICKS + 1);
    expect(of(ev, 'puddle')).toEqual([{ t: 'puddle', tick: 24, x: 3, z: 8, kind: 1 }]);
    run(s, play, NO_INPUT, ROOMBA_STEP_TICKS, ev);
    expect(of(ev, 'puddle')[1]).toMatchObject({ x: 4, z: 8 }); // the trail keeps spreading
  });

  // Counter-edge crime next to a Roomba parked at (4,2) (loop along z 2..3).
  const frame = () =>
    calm({
      props: [
        { kind: 20, x: 4, z: 2, level: 0, rot: 0 },
        { kind: 1, x: 3, z: 1, level: 2, rot: 0 },
      ],
      shell: {
        roombaLoop: [
          { x: 4, z: 2 },
          { x: 5, z: 2 },
          { x: 5, z: 3 },
          { x: 4, z: 3 },
        ],
      },
    });
  function crime(watch: 'look' | 'away' | 'busy') {
    const play = frame();
    const s = initSim(play, DEFAULT_CAT, V5);
    freezeHuman(s);
    s.roomba!.pause = 13; // still parked at (4,2) when the glass lands at (3,2)
    if (watch === 'look') look(s, 7);
    if (watch === 'away') look(s, 1);
    place(s, 3, 0, 5);
    const ev = run(s, play, SWAT, 1);
    while (s.tick < 13) run(s, play, NO_INPUT, 1, ev);
    expect(s.props[1].state).toBe(PropSt.FALLING);
    s.suspicion = 20_000;
    const before = s.suspicion;
    run(s, play, NO_INPUT, 1, ev);
    expect(s.props[1].state).toBe(PropSt.BROKEN);
    return { s, ev, delta: s.suspicion - before };
  }
  it('FRAMED: a crash next to it while a human looks at it: +300, no suspicion at all', () => {
    expect(looksAt(initSim(frame(), DEFAULT_CAT, V5), { ...initSim(frame(), DEFAULT_CAT, V5).humans[0], state: HumanSt.LOOK }, 7, 4, 2, 0)).toBe(true);
    const { s, ev, delta } = crime('look');
    expect(of(ev, 'break')[0]).toMatchObject({ framed: true, points: 225 });
    expect(of(ev, 'framed')).toEqual([{ t: 'framed', tick: 13, prop: 1 }]);
    expect([s.framed, s.props[1].framed, s.score]).toEqual([1, 1, 225 + BONUS.framed]);
    expect(delta).toBe(0);
    expect(s.roomba!.pause).toBe(ROOMBA_CRASH_PAUSE - 1); // startled
  });
  it('not framed when nobody looks, or when the looker cannot see the Roomba', () => {
    const busy = crime('busy');
    expect(busy.s.framed).toBe(0);
    expect(of(busy.ev, 'break')[0].framed).toBeUndefined();
    expect(busy.delta).toBe(SUSPICION.decayBusy);
    const away = crime('away');
    expect(away.s.framed).toBe(0);
    expect(away.delta).toBe(SUSPICION.heardCrash);
  });
});

describe('f. accomplice wish', () => {
  it('first fall of the wish prop: +500 once', () => {
    const play = calm({
      props: [
        { kind: 21, x: 5, z: 1, level: 2, rot: 0 },
        { kind: 2, x: 7, z: 1, level: 2, rot: 0 },
      ],
      room: { accomplice: { pinkPawId: 'mila', wishPropIndex: 0 } },
    });
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 5, 0, 5);
    const ev = run(s, play, SWAT, 14);
    expect(of(ev, 'wish')).toEqual([{ t: 'wish', tick: 0 }]);
    expect([s.wish, s.score]).toEqual([1, BONUS.wish + propPoints(90, 2, 1, 0, 0)]);
    place(s, 7, 0, 5);
    run(s, play, SWAT, 14, ev);
    expect(of(ev, 'wish').length).toBe(1);
  });
  it('grabbing the wish prop grants it, once', () => {
    const play = calm({ props: [{ kind: 19, x: 6, z: 4, level: 0, rot: 0 }], room: { accomplice: { pinkPawId: 'mila', wishPropIndex: 0 } } });
    const s = initSim(play, DEFAULT_CAT, V5);
    const ev = run(s, play, inp(5, 2, BTN_GRAB), 1);
    expect(of(ev, 'grab').length).toBe(1);
    settle(s, play, ev);
    run(s, play, inp(0, 0, BTN_GRAB), 1, ev); // drop
    settle(s, play, ev);
    run(s, play, inp(5, 0, BTN_GRAB), 1, ev); // grab again
    expect(of(ev, 'grab').length).toBe(2);
    expect(of(ev, 'wish').length).toBe(1);
    expect(s.score).toBe(BONUS.wish);
  });
  it('rules 4: no wish', () => {
    const play = calm({ props: [{ kind: 21, x: 5, z: 1, level: 2, rot: 0 }], room: { accomplice: { pinkPawId: 'mila', wishPropIndex: 0 } } });
    const s = initSim(play, DEFAULT_CAT, { simVersion: 4 });
    place(s, 5, 0, 5);
    const ev = run(s, play, SWAT, 14);
    expect(of(ev, 'wish').length).toBe(0);
  });
});

describe('g. the box', () => {
  const box = () => calm({ props: [{ kind: 54, x: 6, z: 4, level: 0, rot: 0 }], room: { accomplice: { pinkPawId: 'mila', wishPropIndex: 0 } } });
  it('never blocks, swats ignored, entering emits enter (and grants a box wish)', () => {
    const play = box();
    const s = initSim(play, DEFAULT_CAT, V5);
    expect(s.grid.propAt[4 * 12 + 6]).toBe(-1);
    expect(swatTarget(s)).toEqual({ prop: -1, grab: false }); // facing S at the box
    const ev = run(s, play, SWAT, 1);
    expect(of(ev, 'swat')[0].prop).toBe(-1);
    settle(s, play, ev);
    run(s, play, inp(5), 1, ev);
    run(s, play, NO_INPUT, 7, ev);
    expect([s.cat.x, s.cat.z, s.inBox]).toEqual([6, 4, 0]);
    expect(of(ev, 'enter')).toEqual([{ t: 'enter', tick: s.tick - 1, prop: 0 }]);
    expect(of(ev, 'wish').length).toBe(1);
    expect(s.props[0].state).toBe(PropSt.REST);
    run(s, play, inp(3), 1, ev); // hop out
    expect(s.inBox).toBe(-1);
  });
  it('loafing in the box sheds suspicion at twice the loaf rate', () => {
    const play = box();
    const s = initSim(play, DEFAULT_CAT, V5);
    run(s, play, inp(5), 7);
    run(s, play, NO_INPUT, 10);
    expect([s.inBox, s.cat.act]).toEqual([0, CatAct.LOAF]);
    s.suspicion = 50_000;
    run(s, play, NO_INPUT, 1);
    expect(s.suspicion).toBe(50_000 + 2 * SUSPICION.loafInCone);
    look(s, 7); // in sight too: still 2x the loaf rate
    run(s, play, NO_INPUT, 1);
    expect(s.suspicion).toBe(50_000 + 4 * SUSPICION.loafInCone);
  });
});

describe('h. mirror', () => {
  const mirror = (on = true) => calm({ shell: { mirror: { x: 0, z: 8, facing: 3 } }, routine: { mirror: on } });
  it('while the human is BUSY a moving cat in the mirror cone adds 50 % of the move rate', () => {
    const play = mirror();
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 2, 8, 3);
    s.cat.facing = 3;
    expect(mirrorConeCells(s, play)).toContain(8 * 12 + 2);
    const ev = run(s, play, inp(3), 1);
    expect(s.suspicion).toBe(Math.floor((SUSPICION.moveTrotInCone * MIRROR_SUSPICION_PCT) / 100));
    expect(of(ev, 'seen')).toEqual([{ t: 'seen', tick: 0, suspicion: s.suspicion, by: 'mirror', human: 0 }]);
    expect(s.seen).toBe(1);
  });
  it('a frozen cat in the mirror is fine; outside it the meter decays', () => {
    const play = mirror();
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 2, 8, 3);
    s.suspicion = 10_000;
    run(s, play, NO_INPUT, 1);
    expect(s.suspicion).toBe(10_000 + SUSPICION.decayBusy);
  });
  it('only while BUSY, only with a mirror routine', () => {
    let play = mirror();
    let s = initSim(play, DEFAULT_CAT, V5);
    place(s, 2, 8, 3);
    look(s, 3); // looking away (E): no mirror, cat out of the cone
    run(s, play, inp(3), 1);
    expect(s.suspicion).toBe(0);
    expect(mirrorConeCells(s, play).length).toBe(0);
    play = mirror(false);
    s = initSim(play, DEFAULT_CAT, V5);
    place(s, 2, 8, 3);
    run(s, play, inp(3), 1);
    expect(s.suspicion).toBe(0);
  });
});

describe('i. on camera', () => {
  const cam = (on = true) =>
    calm({
      props: [{ kind: 1, x: 7, z: 1, level: 2, rot: 0 }],
      shell: { webcam: { x: 7, z: 7, facing: 1 } },
      routine: { onCamera: on },
    });
  it('a crash in the webcam view scores +50 %', () => {
    const play = cam();
    const s = initSim(play, DEFAULT_CAT, V5);
    expect(webcamCells(s, play)).toContain(2 * 12 + 7);
    place(s, 7, 0, 5);
    const ev = run(s, play, SWAT, 14);
    const base = propPoints(150, 2, 1, 0, 0);
    expect(of(ev, 'break')[0]).toMatchObject({ cam: true, points: base + Math.floor((base * ON_CAMERA_PCT) / 100) });
    expect([s.onCamera, s.props[0].onCam]).toEqual([1, 1]);
  });
  it('no bonus off camera or without the routine flag', () => {
    let play = cam(false);
    let s = initSim(play, DEFAULT_CAT, V5);
    expect(webcamCells(s, play).length).toBe(0);
    place(s, 7, 0, 5);
    let ev = run(s, play, SWAT, 14);
    expect(of(ev, 'break')[0]).toMatchObject({ points: 225 });
    expect(of(ev, 'break')[0].cam).toBeUndefined();
    play = cam();
    play.room.props[0] = { kind: 1, x: 3, z: 1, level: 2, rot: 0 };
    s = initSim(play, DEFAULT_CAT, V5);
    place(s, 3, 0, 5);
    ev = run(s, play, SWAT, 14);
    expect(of(ev, 'break')[0].points).toBe(225);
  });
});

describe('j. tall tree', () => {
  const tree = () =>
    calm({
      props: [
        { kind: 17, x: 10, z: 2, level: 0, rot: 0 }, // tree under the fridge
        { kind: 2, x: 10, z: 4, level: 0, rot: 0 }, // mug in the way
      ],
    });
  it('needs L3 and 3 swats, topples 4 cells, knocks what is in the way', () => {
    const play = tree();
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 10, 3, 1); // on the floor next to it: nothing to swat
    expect(swatTarget(s).prop).toBe(-1);
    place(s, 11, 2, 7); // hmm, floor again
    expect(swatTarget(s).prop).toBe(-1);
    place(s, 10, 1, 5); // fridge top, facing the tree
    expect(swatTarget(s).prop).toBe(0);
    const ev: SimEvent[] = [];
    for (let k = 0; k < 2; k++) {
      run(s, play, SWAT, 1, ev);
      settle(s, play, ev);
    }
    expect(of(ev, 'wobble').length).toBe(2);
    expect([s.props[0].state, s.props[0].sway]).toEqual([PropSt.WOBBLE, 2]);
    const t0 = s.tick;
    run(s, play, SWAT, 1, ev);
    expect(of(ev, 'topple')).toEqual([{ t: 'topple', tick: t0, prop: 0, cells: 4, dir: 5 }]);
    expect(s.props[1].state).toBe(PropSt.FALLING); // the mug falls over where it stands
    expect([s.props[0].x, s.props[0].z, s.props[0].fromLevel, s.props[0].fallTicks]).toEqual([10, 6, 3, 18]);
    run(s, play, NO_INPUT, 18, ev);
    expect(s.props[1].state).toBe(PropSt.BROKEN);
    const land = of(ev, 'land').find((e) => e.prop === 0)!;
    expect(land.points).toBe(propPoints(1500, 3, land.combo, 0, 0));
    expect(land.combo).toBe(1); // the mug's break opened the chain at x1; a landing keeps it
  });
  it('a diagonal facing or the wrong level cannot swat it', () => {
    const play = tree();
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 11, 1, 6); // fridge top, facing SW at (10,2)
    expect(swatTarget(s).prop).toBe(-1);
  });
  it('a short room cuts the topple', () => {
    const play = calm({ props: [{ kind: 17, x: 10, z: 7, level: 0, rot: 0 }], levels: [{ x: 10, z: 6, level: 3, occludes: 1 }] });
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 10, 6, 5);
    s.props[0].swats = 2;
    const ev = run(s, play, SWAT, 1);
    expect(of(ev, 'topple')[0].cells).toBe(2); // (10,8), (10,9), then the wall
  });
});

describe('k. the Napper', () => {
  const nap = (o: FixtureOpts = {}) => calm({ ...o, routine: { kind: 'napper', telegraph: [20, 20], look: [60, 60], ...o.routine } });
  it('sleeps (no cone, no turns); trot steps add noise, sneaking is silent, quiet ticks decay', () => {
    const play = nap();
    const s = initSim(play, DEFAULT_CAT, V5);
    expect(s.humans[0].state).toBe(HumanSt.NAP);
    expect(coneCells(s, 0).length).toBe(0);
    place(s, 1, 8, 3);
    run(s, play, inp(3, 1), 1);
    run(s, play, NO_INPUT, 13); // one sneak step: silent
    expect([s.cat.x, noiseOf(s)]).toEqual([2, 0]);
    run(s, play, inp(3, 2), 1);
    run(s, play, NO_INPUT, 7); // one trot step
    expect([s.cat.x, noiseOf(s)]).toEqual([3, NOISE.trotStep]);
    run(s, play, NO_INPUT, 10);
    expect(noiseOf(s)).toBe(NOISE.trotStep + 10 * NOISE.decayPerTick);
    run(s, play, NO_INPUT, 1000);
    expect([noiseOf(s), s.humans[0].state]).toEqual([0, HumanSt.NAP]);
  });
  it('3/2 within 3 cells of her; jumps down from L2+ and crashes count', () => {
    const play = nap({ props: [{ kind: 1, x: 3, z: 1, level: 2, rot: 0 }] });
    let s = initSim(play, DEFAULT_CAT, V5);
    place(s, 8, 5, 3);
    run(s, play, inp(3, 2), 1);
    run(s, play, NO_INPUT, 7);
    expect(noiseOf(s)).toBe((NOISE.trotStep * 3) / 2);
    s = initSim(play, DEFAULT_CAT, V5);
    place(s, 7, 1, 5);
    const ev = run(s, play, inp(5, 0, BTN_JUMP), 1);
    run(s, play, NO_INPUT, 12, ev);
    expect([s.cat.level, noiseOf(s)]).toEqual([0, NOISE.jumpDown]);
    ev.length = 0;
    s = initSim(play, DEFAULT_CAT, V5);
    place(s, 3, 0, 5);
    run(s, play, SWAT, 1, ev);
    run(s, play, NO_INPUT, 13, ev);
    expect(noiseOf(s)).toBe(NOISE.crash);
    expect(of(ev, 'noise').map((e) => e.level)).toEqual([25_000]);
    expect(s.maxNoise).toBe(NOISE.crash);
  });
  it('wakes at max (yawn telegraph, a real look), then naps again at 40 %', () => {
    const play = nap();
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 1, 8, 3);
    s.noise = NOISE.max - 1000;
    const ev = run(s, play, inp(3, 2), 1);
    run(s, play, NO_INPUT, 7, ev);
    expect(of(ev, 'noise').map((e) => e.level)).toEqual([100_000]);
    expect(of(ev, 'wake')).toEqual([{ t: 'wake', tick: 7, human: 0 }]);
    expect([s.humans[0].state, s.maxNoise]).toEqual([HumanSt.TELEGRAPH, NOISE.max]);
    run(s, play, NO_INPUT, 20, ev);
    expect(s.humans[0].state).toBe(HumanSt.TELEGRAPH); // the 20-tick yawn
    run(s, play, NO_INPUT, 1, ev);
    expect(s.humans[0].state).toBe(HumanSt.LOOK);
    expect(coneCells(s, 0).length).toBeGreaterThan(0);
    run(s, play, inp(1, 1), 1, ev);
    run(s, play, NO_INPUT, 12, ev);
    run(s, play, inp(3, 2), 8, ev); // noise is frozen while she is awake
    expect(noiseOf(s)).toBe(NOISE.max);
    let guard = 0;
    while (s.humans[0].state !== HumanSt.NAP && guard++ < 200) run(s, play, NO_INPUT, 1, ev);
    expect(noiseOf(s)).toBe(NOISE.afterWake + NOISE.decayPerTick);
    expect(of(ev, 'human').map((e) => e.state)).toEqual(['telegraph', 'look', 'nap']);
  });
  it('a waking look can catch the cat', () => {
    const play = nap();
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 8, 5, 3);
    s.noise = NOISE.max;
    const ev = run(s, play, NO_INPUT, 1);
    expect(of(ev, 'wake').length).toBe(1);
    run(s, play, NO_INPUT, 20, ev);
    s.suspicion = 99_000;
    run(s, play, inp(7, 2), 2, ev);
    expect(of(ev, 'caught').length).toBe(1);
  });
  it('the alarm (room event) freezes the meter for EVENT_TICKS', () => {
    const play = nap({ routine: { eventTick: 3 } });
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 1, 8, 3);
    run(s, play, NO_INPUT, 4);
    expect(s.humans[0].state).toBe(HumanSt.EVENT);
    s.noise = 50_000;
    run(s, play, inp(3, 2), 60);
    expect(noiseOf(s)).toBe(50_000); // no gain, no decay
    let n = 0;
    while (s.humans[0].state === HumanSt.EVENT) {
      run(s, play, NO_INPUT, 1);
      n++;
    }
    expect(n + 60 + 1).toBe(EVENT_TICKS + 1);
    expect(s.humans[0].state).toBe(HumanSt.NAP);
    expect(noiseOf(s)).toBe(50_000 + NOISE.decayPerTick);
  });
});

describe('l. two humans', () => {
  const two = () =>
    calm({
      shell: { humanSpot2: { x: 0, z: 5 }, humanEventSpot2: { x: -2, z: 5 } },
      routine2: { busyFacing: 7, lookFacings: [3], eventTick: 5000 },
    });
  it('humans[1] runs routine2 from humanSpot2, turning later than humans[0]', () => {
    const play = two();
    const s = initSim(play, DEFAULT_CAT, V5);
    expect(s.humans.length).toBe(2);
    expect([s.humans[1].x, s.humans[1].z, s.humans[1].routine]).toEqual([0, 5, 1]);
    expect(s.humans[1].timer).toBeGreaterThan(s.humans[0].timer - 61);
    s.humans[1].state = HumanSt.LOOK;
    s.humans[1].facing = 3;
    s.humans[1].timer = 50;
    expect(coneCells(s, 1).length).toBeGreaterThan(0);
  });
  it('one shared suspicion meter: two cones see the cat once per tick', () => {
    const play = two();
    const s = initSim(play, DEFAULT_CAT, V5);
    place(s, 5, 4, 3);
    look(s, 7, 0);
    look(s, 3, 1);
    const ev = run(s, play, inp(3, 2), 1);
    expect(s.suspicion).toBe(SUSPICION.moveTrotInCone);
    expect(of(ev, 'seen')[0]).toMatchObject({ by: 'human', human: 0 });
    const t = initSim(play, DEFAULT_CAT, V5);
    place(t, 5, 4, 3);
    look(t, 3, 1); // only the second human looks
    const ev2 = run(t, play, inp(3, 2), 1);
    expect(t.suspicion).toBe(SUSPICION.moveTrotInCone);
    expect(of(ev2, 'seen')[0]).toMatchObject({ by: 'human', human: 1 });
  });
  it('the room event moves both', () => {
    const play = calm({
      shell: { humanSpot2: { x: 0, z: 5 }, humanEventSpot2: { x: -2, z: 5 } },
      routine: { eventTick: 10 },
      routine2: {},
    });
    const s = initSim(play, DEFAULT_CAT, V5);
    const ev = run(s, play, NO_INPUT, 11);
    expect(of(ev, 'human').filter((e) => e.state === 'event').map((e) => e.human)).toEqual([0, 1]);
    expect([s.humans[0].x, s.humans[1].x]).toEqual([13, -2]);
    expect(s.eventActive).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Determinism, boss run, performance
// ---------------------------------------------------------------------------------------------

function randomInputs(seed: number, n: number): TickInput[] {
  let r = seed >>> 0 || 1;
  const next = () => {
    r ^= r << 13;
    r ^= r >>> 17;
    r ^= r << 5;
    r >>>= 0;
    return r;
  };
  const out: TickInput[] = [];
  while (out.length < n) {
    const dir = (next() % 9) as Dir8;
    const roll = next() % 100;
    const b = roll < 25 ? BTN_SWAT : roll < 40 ? BTN_JUMP : roll < 45 ? BTN_GRAB : 0;
    const i: TickInput = { dir, speed: dir ? ((1 + (next() % 2)) as Speed) : 0, buttons: b };
    const len = 1 + (next() % 24);
    out.push(i);
    for (let k = 1; k < len; k++) out.push({ ...i, buttons: 0 });
  }
  return out.slice(0, n);
}

describe('determinism (v5)', () => {
  for (const [name, mk] of [
    ['14 x 12 two-human boss', () => makeBossRoom()],
    ['napper', () => makeBossRoom({ napper: true })],
  ] as [string, () => PlayableRoom][]) {
    it(`${name}: same finalHash 3x and after a mid-run structuredClone`, () => {
      const inputs = randomInputs(0xbadca7, 2700);
      const hashes = [0, 1, 2].map(() => runToEnd(mk(), DEFAULT_CAT, inputs, V5).finalHash);
      expect(new Set(hashes).size).toBe(1);
      const play = mk();
      const a = initSim(play, DEFAULT_CAT, V5);
      const ev: SimEvent[] = [];
      while (a.tick < 900 && !a.ended) stepSim(a, play, inputs[a.tick], ev);
      const b = structuredClone(a);
      expect(hashState(b)).toBe(hashState(a));
      while (!a.ended) stepSim(a, play, inputs[a.tick] ?? NO_INPUT, ev);
      while (!b.ended) stepSim(b, play, inputs[b.tick] ?? NO_INPUT, []);
      expect(hashState(b)).toBe(hashState(a));
      expect(hashState(a)).toBe(hashes[0]);
    });
  }
  it('the boss room exercises the v5 rules under random play', () => {
    const tally: Record<string, number> = {};
    let ended = 0;
    for (let k = 0; k < 12; k++) {
      const r = runToEnd(makeBossRoom({ seed: k }), DEFAULT_CAT, randomInputs(1000 + k, 2700));
      ended += r.ticks > 0 ? 1 : 0;
      for (const e of r.events) tally[e.t] = (tally[e.t] ?? 0) + 1;
    }
    expect(ended).toBe(12);
    expect(tally.roomba).toBeGreaterThan(0);
    expect(tally.human).toBeGreaterThan(0);
  });
  it('a 2,700-tick random-input boss run ends', () => {
    const play = makeBossRoom();
    const s = initSim(play, DEFAULT_CAT, V5);
    const inputs = randomInputs(42, 2700);
    const ev: SimEvent[] = [];
    let guard = 0;
    while (!s.ended && guard++ < 4000) stepSim(s, play, inputs[s.tick] ?? NO_INPUT, ev);
    expect(s.ended).toBe(1);
    expect(s.ticks).toBe(2700);
    expect(ev[ev.length - 1].t).toBe('end');
  });
  it('runToEnd on the boss fixture: median under 20 ms', () => {
    const inputs = randomInputs(7, 2700);
    const play = makeBossRoom();
    const times: number[] = [];
    for (let k = 0; k < 9; k++) {
      const t0 = performance.now();
      runToEnd(play, DEFAULT_CAT, inputs, V5);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[4]).toBeLessThan(20);
  });
});

describe('boss fixture wiring', () => {
  it('initialises the Roomba, two humans, cables and the wish', () => {
    const play = makeBossRoom();
    const s = initSim(play, DEFAULT_CAT, V5);
    expect(roombaOf(s)).toMatchObject({ prop: 10, x: 1, z: 9 });
    expect(s.humans.map((h) => [h.x, h.z])).toEqual([
      [13, 6],
      [0, 6],
    ]);
    expect(mirrorConeCells(s, play).length).toBeGreaterThan(0);
    expect(webcamCells(s, play).length).toBeGreaterThan(0);
  });
});
