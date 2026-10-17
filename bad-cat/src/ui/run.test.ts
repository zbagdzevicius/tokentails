import { describe, expect, it } from 'vitest';
import { CatAct, HumanSt, type PlayableRoom, type SimApi, type SimEvent, type SimState } from '../types';
import { buildResult, introProgress, tickHaptic, INTRO_EASE_MS, INTRO_HOLD_MS, INTRO_SKIP_EASE_MS } from './run';
import { ftuePrompt, humanHint, spottedState, type FtueMemo } from './screens/Hud';

const state = (over: Partial<SimState> = {}): SimState =>
  ({
    tick: 0,
    ticks: 1200,
    ended: 0,
    score: 0,
    finalScore: 0,
    maxCombo: 1,
    seenCount: 0,
    targetsHit: 0,
    framed: 0,
    stamp: 0,
    caughtTick: -1,
    cat: { act: 0, stepTicks: 0 },
    humans: [{ state: HumanSt.BUSY }],
    ...over,
  }) as unknown as SimState;

describe('buildResult', () => {
  const sim = { hashState: () => -1 } as unknown as SimApi;
  const play = { room: { id: 'daily-018' }, mode: 'ranked', dayNo: 18 } as unknown as PlayableRoom;
  it('maps the ended state to a RunResult with rank, stamp and timeline', () => {
    const s = state({ ended: 1, tick: 2250, score: 8000, finalScore: 10000, stamp: 1, maxCombo: 6, targetsHit: 3 });
    const ev: SimEvent[] = [{ t: 'break', tick: 5, prop: 0, points: 10, combo: 1 }];
    const r = buildResult(sim, play, s, [], ev);
    expect(r).toMatchObject({ roomId: 'daily-018', dayNo: 18, mode: 'ranked', score: 10000, stamp: 'perfect', rank: 'Agent of Chaos', maxCombo: 6, targets: 3, ticks: 2250 });
    expect(r.finalHash).toBe(0xffffffff);
    expect(r.timeline.startsWith('💥')).toBe(true);
  });
  it('caught stamp', () => {
    const r = buildResult(sim, play, state({ ended: 1, stamp: 3, finalScore: 50, caughtTick: 400, tick: 475 }), [], []);
    expect(r.stamp).toBe('caught');
    expect(r.rank).toBe('Cuddled');
  });
});

describe('ftuePrompt', () => {
  it('run → hop → swat → freeze on the first telegraph only → sneak after the first turn', () => {
    const m: FtueMemo = { moved: false, swatted: false, telegraphSeen: false, freezeUntil: 0 };
    expect(ftuePrompt(m, state({ tick: 1 }), [])).toBe(1);
    expect(ftuePrompt(m, state({ tick: 30 }), [{ t: 'step', tick: 30, level: 0, speed: 1 }])).toBe(4);
    expect(ftuePrompt(m, state({ tick: 60 }), [{ t: 'jump', tick: 60, from: 0, to: 1 }])).toBe(2);
    expect(ftuePrompt(m, state({ tick: 90 }), [{ t: 'swat', tick: 90, prop: 1 }])).toBe(0);
    expect(ftuePrompt(m, state({ tick: 240, humans: [{ state: HumanSt.TELEGRAPH }] as never }), [])).toBe(3);
    // once he LOOKs the hint pill alone speaks (no stacked red banners)
    expect(ftuePrompt(m, state({ tick: 270, humans: [{ state: HumanSt.LOOK }] as never }), [])).toBe(0);
    expect(ftuePrompt(m, state({ tick: 380, humans: [{ state: HumanSt.BUSY }] as never }), [])).toBe(5);
    expect(ftuePrompt(m, state({ tick: 380 + 149, humans: [{ state: HumanSt.BUSY }] as never }), [])).toBe(5);
    expect(ftuePrompt(m, state({ tick: 380 + 150, humans: [{ state: HumanSt.BUSY }] as never }), [])).toBe(0);
  });
  it('no prompt while caught (cuddle) or after the end', () => {
    const m: FtueMemo = { moved: false, swatted: false, telegraphSeen: true, freezeUntil: 9999 };
    expect(ftuePrompt(m, state({ tick: 270, cat: { act: CatAct.CUDDLED, stepTicks: 0 } as never, humans: [{ state: HumanSt.LOOK }] as never }), [])).toBe(0);
    expect(ftuePrompt(m, state({ tick: 270, ended: 1, humans: [{ state: HumanSt.LOOK }] as never }), [])).toBe(0);
  });
});

describe('round 3 run intro and spotted state', () => {
  it('intro: hold, ease, and any input skips to a 150 ms ease', () => {
    expect(introProgress(0, INTRO_HOLD_MS)).toBe(0);
    expect(introProgress(INTRO_HOLD_MS, INTRO_HOLD_MS)).toBeCloseTo(0.6);
    expect(introProgress(INTRO_HOLD_MS + INTRO_EASE_MS, INTRO_HOLD_MS)).toBe(1);
    const at = 300;
    expect(introProgress(at, INTRO_HOLD_MS, at)).toBeCloseTo(0.2);
    expect(introProgress(at + INTRO_SKIP_EASE_MS, INTRO_HOLD_MS, at)).toBe(1);
    expect(introProgress(at + INTRO_SKIP_EASE_MS / 2, INTRO_HOLD_MS, at)).toBeGreaterThan(0.5);
  });
  it('a frozen cat in the cone is "frozen", a moving one "moving"', () => {
    expect(spottedState(state({ seen: 1, cat: { act: CatAct.LOAF } } as unknown as Partial<SimState>))).toBe('frozen');
    expect(spottedState(state({ seen: 1, cat: { act: CatAct.IDLE } } as unknown as Partial<SimState>))).toBe('frozen');
    expect(spottedState(state({ seen: 1, cat: { act: CatAct.TROT } } as unknown as Partial<SimState>))).toBe('moving');
    expect(spottedState(state({ seen: 0, cat: { act: CatAct.TROT } } as unknown as Partial<SimState>))).toBe('none');
  });
});

describe('v5 run result, haptics and hints', () => {
  const sim = { hashState: () => 7 } as unknown as SimApi;
  const play = { room: { id: 'daily-007' }, mode: 'ranked', dayNo: 7, routine: { name: 'Napper', kind: 'napper' } } as unknown as PlayableRoom;
  it('buildResult copies the v5 fields from the state', () => {
    const s = state({
      ended: 1,
      finalScore: 900,
      wish: 1,
      slides: 2,
      pulls: 3,
      onCamera: 1,
      maxNoise: 64_000,
      rules: 5,
      cat: { act: 0, stepTicks: 0, stashed: 2 },
      humans: [{ state: HumanSt.NAP }, { state: HumanSt.BUSY }],
    } as unknown as Partial<SimState>);
    const r = buildResult(sim, play, s, [], []);
    expect(r).toMatchObject({ simVersion: 5, wish: true, stashed: 2, slides: 2, pulls: 3, onCamera: 1, maxNoise: 64_000, humans: 2 });
  });
  it('rules-4 states get zeros', () => {
    const r = buildResult(sim, play, state({ ended: 1, rules: 4 } as unknown as Partial<SimState>), [], []);
    expect(r).toMatchObject({ simVersion: 4, wish: false, stashed: 0, slides: 0, pulls: 0, onCamera: 0, maxNoise: 0, humans: 1 });
  });
  it('one buzz per tick, the strongest wins', () => {
    expect(tickHaptic([])).toBe(0);
    expect(tickHaptic([{ t: 'swat', tick: 1, prop: 1 }, { t: 'topple', tick: 1, prop: 2, cells: 4, dir: 0 }])).toBe(60);
    expect(tickHaptic([{ t: 'slide', tick: 1, fromX: 0, fromZ: 0, x: 1, z: 0 }])).toBe(12);
    expect(tickHaptic([{ t: 'pull', tick: 1, prop: 1, dir: 0, kind: 'cloth', moved: 1 }])).toBe(12);
  });
  it('hint: both looking, the second one turning, pronoun on a single look', () => {
    const boss = { routine: { name: 'Caterer A', persona: 'caterer' }, routine2: { name: 'Grandma', persona: 'grandma' }, room: {} } as unknown as PlayableRoom;
    const two = (a: number, b: number, over: Record<string, unknown> = {}) =>
      state({ humans: [{ state: a }, { state: b }], seen: 0, ...over } as unknown as Partial<SimState>);
    expect(humanHint(two(HumanSt.LOOK, HumanSt.LOOK), boss, false).text).toContain('Both looking');
    expect(humanHint(two(HumanSt.BUSY, HumanSt.TELEGRAPH), boss, false).text).toContain('other one is turning');
    expect(humanHint(two(HumanSt.BUSY, HumanSt.LOOK), boss, false).text).toContain('She is looking');
    expect(humanHint(two(HumanSt.LOOK, HumanSt.BUSY), boss, false).text).toContain('He is looking');
    expect(humanHint(two(HumanSt.BUSY, HumanSt.BUSY), boss, true).text).toBe('Caterer A is busy. Go!');
    expect(humanHint(two(HumanSt.BUSY, HumanSt.BUSY), boss, false).text).toBe('');
    const caught = state({ cat: { act: CatAct.CUDDLED, stepTicks: 0 } } as unknown as Partial<SimState>);
    expect(humanHint(caught, boss, false).cls).toContain('is-look');
  });
});
