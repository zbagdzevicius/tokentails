/** Test fixtures for L6 (synthetic rooms and runs; no sim import). */
import { RUN_TICKS, SIM_VERSION, type PlayableRoom, type RunResult, type SimEvent, type StampId } from '../types';

export function fixtureRoom(over: Partial<PlayableRoom> = {}): PlayableRoom {
  const w = 12;
  const d = 10;
  return {
    room: {
      id: 'daily-018',
      shell: 0,
      routine: 0,
      event: 0,
      width: w,
      depth: d,
      spawn: { x: 5, z: 8 },
      props: [
        { kind: 1, x: 2, z: 1, level: 2, rot: 0, target: true }, // 0 wine glass (target)
        { kind: 2, x: 3, z: 1, level: 2, rot: 0 }, // 1 mug (fragile)
        { kind: 19, x: 6, z: 7, level: 0, rot: 0 }, // 2 sock (not a candidate)
        { kind: 10, x: 7, z: 4, level: 1, rot: 0 }, // 3 remote (not fragile)
        { kind: 7, x: 9, z: 1, level: 3, rot: 0, target: true }, // 4 vase (target)
      ],
      seed: 1,
      ticks: RUN_TICKS,
      title: 'Kitchen #18: Breakfast Heist',
    },
    shell: {
      id: 0,
      name: 'Kitchen',
      width: w,
      depth: d,
      levels: new Array(w * d).fill(0),
      occludes: new Array(w * d).fill(0),
      furniture: [],
      humanSpot: { x: 6, z: 0 },
      humanEventSpot: { x: 6, z: -1 },
      catBed: { x: 0, z: 9 },
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
      lookFacings: [5],
      cue: 'stove timer',
    },
    mode: 'ranked',
    dayNo: 18,
    ...over,
  };
}

export function fixtureRun(events: SimEvent[], over: Partial<RunResult> = {}): RunResult {
  return {
    roomId: 'daily-018',
    dayNo: 18,
    mode: 'ranked',
    simVersion: SIM_VERSION,
    score: 8420,
    stamp: 'perfect' as StampId,
    rank: 'Agent of Chaos',
    maxCombo: 6,
    seenCount: 0,
    targets: 2,
    framed: 0,
    ticks: RUN_TICKS,
    timeline: '',
    inputs: [],
    events: events.slice().sort((a, b) => a.tick - b.tick),
    finalHash: 0,
    ...over,
  };
}

/** fall at `tick` and break 13 ticks later. */
export function fallBreak(prop: number, tick: number, from: 0 | 1 | 2 | 3 = 2): SimEvent[] {
  return [
    { t: 'push', tick: tick - 1, prop },
    { t: 'fall', tick, prop, from, dir: 5 },
    { t: 'break', tick: tick + 13, prop, points: 300, combo: 1 },
  ];
}
