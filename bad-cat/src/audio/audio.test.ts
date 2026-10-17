import { afterEach, describe, expect, it, vi } from 'vitest';
import { HumanSt, PropSt, type SimEvent, type SimState } from '../types';
import { createAudio, cuesFor, limitPerTick, musicModeFor, renderEventsOffline, tickToClipSeconds } from './index';
import { cuesForContext, type Cue, type CueId } from './sfx-map';
import { makeNoise, playCue, type SynthGraph } from './synth';
import { BASS, CHORDS, MusicLoop } from './music';
import { FakeContext, FakeOfflineContext } from './fake-context.test-util';

function prop(kind: number, level = 2) {
  return {
    kind, x: 0, z: 0, level, fromX: 0, fromZ: 0, fromLevel: level, state: PropSt.REST, swats: 0, fallTimer: 0,
    fallTicks: 0, dir: 0, chain: 0, points: 0, target: 0, hit: 0, seen: 0, restTick: -1,
  };
}

function state(over: Partial<SimState> = {}): SimState {
  return {
    tick: 100, ticks: 2250, rng: 1,
    grid: { w: 12, d: 10, level: new Uint8Array(120), occludes: new Uint8Array(120), propAt: new Int16Array(120).fill(-1) },
    cat: {} as SimState['cat'],
    humans: [{ x: 0, z: 0, facing: 1, state: HumanSt.BUSY, timer: 0, stateTicks: 0, telegraph: 20, fakeOut: 0, lookFacing: 5, eventDone: 0, turns: 0, lookStartTick: -1 }],
    props: [prop(1), prop(2), prop(10, 0), prop(5), prop(15)] as SimState['props'],
    suspicion: 0, maxSuspicion: 0, seen: 0, seenCount: 0, score: 0, combo: 1, maxCombo: 1, comboTimer: 0,
    targetsHit: 0, wish: 0, framed: 0, eventActive: 0, lastCall: 0, firstCrashTick: -1, stamp: 0, caughtTick: -1,
    ended: 0, finalScore: 0, btnBuf: 0,
    ...over,
  };
}

const ids = (c: Cue[]) => c.map((x) => x.id);

describe('cuesFor', () => {
  it('break of a glass prop -> glass crash', () => {
    const c = cuesFor([{ t: 'break', tick: 10, prop: 0, points: 150, combo: 1 }], state());
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: 'crash', material: 'glass' });
  });

  it('ceramic break, food spill, plastic land, hit', () => {
    const s = state();
    const ev: SimEvent[] = [
      { t: 'break', tick: 1, prop: 1, points: 100, combo: 1 },
      { t: 'spill', tick: 1, prop: 3, points: 200, combo: 1 },
      { t: 'land', tick: 1, prop: 2, points: 60, combo: 1 },
      { t: 'hit', tick: 1, prop: 4, points: 0, combo: 1 },
    ];
    const c = cuesFor(ev, s);
    expect(c.map((x) => [x.id, x.material])).toEqual([
      ['crash', 'ceramic'],
      ['splat', 'food'],
      ['land', 'plastic'],
      ['bonk', 'paper'],
    ]);
  });

  it('telegraph human event -> "hm?" sting; look -> double take; fakeout -> hum; event -> event cue', () => {
    const ev: SimEvent[] = [
      { t: 'human', tick: 5, human: 0, state: 'telegraph' },
      { t: 'human', tick: 6, human: 0, state: 'look' },
      { t: 'human', tick: 7, human: 0, state: 'fakeout' },
      { t: 'human', tick: 8, human: 0, state: 'event' },
      { t: 'human', tick: 9, human: 0, state: 'busy' },
    ];
    const c = cuesFor(ev, state(), { eventKind: 1 });
    expect(ids(c)).toEqual(['hm', 'doubleTake', 'hum', 'eventCue']);
    expect(c[3].eventKind).toBe(1);
  });

  it('combo pitch rises with the combo', () => {
    const s = state();
    const pitchAt = (combo: number) =>
      cuesFor([{ t: 'break', tick: 1, prop: 1, points: 100, combo }], s).find((x) => x.id === 'combo')?.pitch ?? -1;
    expect(pitchAt(1)).toBe(-1); // no combo tick at x1
    const p = [2, 3, 4, 5, 8].map(pitchAt);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
    expect(pitchAt(12)).toBe(pitchAt(8)); // capped
  });

  it('steps carry surface and speed; jump up vs down; swat at air', () => {
    const c = cuesFor(
      [
        { t: 'step', tick: 1, level: 2, speed: 2 },
        { t: 'step', tick: 2, level: 0, speed: 0 },
        { t: 'jump', tick: 3, from: 0, to: 1 },
        { t: 'jump', tick: 4, from: 2, to: 0 },
        { t: 'swat', tick: 5, prop: -1 },
        { t: 'swat', tick: 6, prop: 0 },
      ],
      state(),
    );
    expect(ids(c)).toEqual(['step', 'step', 'jumpUp', 'jumpDown', 'swatAir', 'swat']);
    expect(c[0]).toMatchObject({ level: 2, speed: 2 });
    expect(c[1]).toMatchObject({ level: 0, speed: 1 });
  });

  it('wobble of glass is a tink (glass material); fall length follows FALL_TICKS', () => {
    const s = state();
    s.props[0].level = 0; // falling to the floor from L2 -> 13 ticks
    const c = cuesFor(
      [
        { t: 'wobble', tick: 1, prop: 0 },
        { t: 'fall', tick: 2, prop: 0, from: 2, dir: 5 },
      ],
      s,
    );
    expect(c[0]).toMatchObject({ id: 'wobble', material: 'glass' });
    expect(c[1].dur).toBeCloseTo(13 / 30);
  });

  it('caught -> bad kitty + wah-wah + purr; end -> perfect brass or stamp by stamp id', () => {
    expect(ids(cuesFor([{ t: 'caught', tick: 9 }], state()))).toEqual(['badKitty', 'comeHere', 'caught', 'purr']);
    expect(ids(cuesFor([{ t: 'end', tick: 9 }], state({ stamp: 1 })))).toEqual(['perfect']);
    expect(ids(cuesFor([{ t: 'end', tick: 9 }], state({ stamp: 2 })))).toEqual(['stamp']);
    expect(ids(cuesFor([{ t: 'end', tick: 9 }], state({ stamp: 3 })))).toEqual([]);
  });

  it('remaining events map; unknown prop falls back to ceramic', () => {
    const c = cuesFor(
      [
        { t: 'push', tick: 1, prop: 0 },
        { t: 'target', tick: 1, prop: 0 },
        { t: 'grab', tick: 1, prop: 0 },
        { t: 'drop', tick: 1, prop: 0 },
        { t: 'stash', tick: 1, prop: 0 },
        { t: 'loaf', tick: 1 },
        { t: 'seen', tick: 1, suspicion: 5000 },
        { t: 'lastcall', tick: 1 },
        { t: 'wish', tick: 1 },
        { t: 'break', tick: 1, prop: 99, points: 0, combo: 1 },
      ],
      state(),
    );
    expect(ids(c)).toEqual(['push', 'target', 'grab', 'drop', 'stash', 'purr', 'seen', 'lastCall', 'wish', 'crash']);
    expect(c[9].material).toBe('ceramic');
  });

  it('variants are deterministic and in 0..2', () => {
    const ev: SimEvent[] = Array.from({ length: 30 }, (_, i) => ({ t: 'break' as const, tick: i, prop: i % 5, points: 1, combo: 1 }));
    const a = cuesFor(ev, state()).map((c) => c.variant);
    const b = cuesFor(ev, state()).map((c) => c.variant);
    expect(a).toEqual(b);
    expect(new Set(a)).toEqual(new Set([0, 1, 2]));
  });

  it('limitPerTick caps a crash cascade', () => {
    const ev: SimEvent[] = Array.from({ length: 6 }, (_, i) => ({ t: 'break' as const, tick: 3, prop: i % 2, points: 1, combo: 1 + i }));
    const c = limitPerTick(cuesFor(ev, state()));
    expect(c.filter((x) => x.id === 'crash')).toHaveLength(3);
    expect(c.filter((x) => x.id === 'combo')).toHaveLength(1);
  });
});

describe('musicModeFor', () => {
  it('follows the human state', () => {
    const s = state();
    expect(musicModeFor(s)).toBe('calm');
    s.humans[0].state = HumanSt.TELEGRAPH;
    expect(musicModeFor(s)).toBe('sneaky');
    s.humans[0].state = HumanSt.LOOK;
    expect(musicModeFor(s)).toBe('sneaky');
    s.humans[0].state = HumanSt.EVENT;
    expect(musicModeFor(s)).toBe('full');
    s.ended = 1;
    expect(musicModeFor(s)).toBe('quiet');
  });
});

describe('tickToClipSeconds', () => {
  it('is real time without slow motion', () => {
    expect(tickToClipSeconds(130, 100)).toBeCloseTo(1);
  });
  it('stretches inside the slow-motion window and stays monotonic', () => {
    const sm = { fromTick: 130, toTick: 160, speed: 0.5 };
    expect(tickToClipSeconds(130, 100, sm)).toBeCloseTo(1);
    expect(tickToClipSeconds(160, 100, sm)).toBeCloseTo(3);
    expect(tickToClipSeconds(190, 100, sm)).toBeCloseTo(4);
    let prev = -1;
    for (let t = 100; t < 220; t++) {
      const v = tickToClipSeconds(t, 100, sm);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('createAudio in Node', () => {
  it('returns a silent no-op engine that never throws', async () => {
    const a = createAudio();
    await a.unlock();
    expect(a.unlocked).toBe(false);
    a.onEvents([{ t: 'break', tick: 1, prop: 0, points: 1, combo: 2 }], state());
    a.setMusic(true);
    a.stinger('perfect');
    a.setVolumes({ master: 0.5, music: 2, sfx: Number.NaN });
    a.setMuted(true);
    expect(a.captureStream()).toBeNull();
    expect(await a.renderOffline!([], 0, 100)).toBeNull();
    a.dispose();
  });
});

describe('synth recipes on a fake WebAudio graph', () => {
  const ALL: CueId[] = [
    'step', 'jumpUp', 'jumpDown', 'swat', 'swatAir', 'wobble', 'push', 'fall', 'crash', 'splat', 'land', 'bonk',
    'target', 'combo', 'grab', 'drop', 'stash', 'purr', 'hm', 'doubleTake', 'hum', 'eventCue', 'seen', 'lastCall',
    'caught', 'badKitty', 'perfect', 'stamp', 'go',
  ];
  const MATERIALS = ['glass', 'ceramic', 'paper', 'food', 'plastic', 'tech', 'fabric', 'metal', 'actor'] as const;

  it('every cue, material, level and variant schedules valid voices', () => {
    const ctx = new FakeContext();
    const g: SynthGraph = { ctx: ctx as unknown as BaseAudioContext, out: ctx.createGain() as unknown as AudioNode, noise: makeNoise(ctx as unknown as BaseAudioContext) };
    for (const id of ALL) {
      for (const material of MATERIALS) {
        for (let variant = 0; variant < 3; variant++) {
          for (const level of [0, 1, 2, 3] as const) {
            const before = ctx.starts;
            playCue(g, { id, tick: 7, delay: 0, pitch: 4, gain: 1, variant, material, level, speed: 2, eventKind: level, dur: 0.3 }, 0.5);
            expect(ctx.starts, id).toBeGreaterThan(before);
          }
        }
      }
    }
  });
});

describe('music loop', () => {
  it('bass walks one bar per chord and the scheduler emits notes in every mode', () => {
    expect(BASS).toHaveLength(CHORDS.length);
    vi.useFakeTimers();
    const ctx = new FakeContext();
    const actx = ctx as unknown as BaseAudioContext;
    const m = new MusicLoop(actx, ctx.createGain() as unknown as AudioNode, makeNoise(actx));
    m.start();
    for (const mode of ['sneaky', 'full', 'quiet', 'calm'] as const) {
      m.setMode(mode);
      m.duck();
      ctx.currentTime += 3;
      vi.advanceTimersByTime(200);
    }
    expect(ctx.starts).toBeGreaterThan(20);
    m.dispose();
    expect(m.running).toBe(false);
    vi.useRealTimers();
  });
});

describe('engine with a fake AudioContext', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g.window;
    delete g.OfflineAudioContext;
    vi.useRealTimers();
  });

  it('is silent before unlock, plays after, mute stops output, capture stream exists', async () => {
    vi.useFakeTimers();
    let made: FakeContext | null = null;
    g.window = {
      AudioContext: class extends FakeContext {
        constructor() {
          super();
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          made = this;
        }
      },
    };
    const a = createAudio();
    a.onEvents([{ t: 'break', tick: 1, prop: 0, points: 1, combo: 2 }], state());
    expect(made).toBeNull(); // no context before the gesture
    await a.unlock();
    expect(a.unlocked).toBe(true);
    const ctx = made as unknown as FakeContext;
    const s0 = ctx.starts;
    a.onEvents([{ t: 'break', tick: 1, prop: 0, points: 1, combo: 2 }, { t: 'human', tick: 1, human: 0, state: 'telegraph' }], state());
    expect(ctx.starts).toBeGreaterThan(s0);
    a.setMuted(true);
    const s1 = ctx.starts;
    a.onEvents([{ t: 'break', tick: 2, prop: 1, points: 1, combo: 1 }], state());
    expect(ctx.starts).toBe(s1);
    a.setMuted(false);
    a.setMusic(true);
    ctx.currentTime += 1;
    vi.advanceTimersByTime(120);
    expect(ctx.starts).toBeGreaterThan(s1);
    expect(a.captureStream()).not.toBeNull();
    // perfect via event then via stinger within the gap plays once
    const s2 = ctx.starts;
    a.stinger('perfect');
    const s3 = ctx.starts;
    a.stinger('perfect');
    expect(ctx.starts).toBe(s3);
    expect(s3).toBeGreaterThan(s2);
    a.dispose();
    expect(a.unlocked).toBe(false);
  });

  it('renderOffline mixes the clip window into a buffer of the stretched length', async () => {
    g.OfflineAudioContext = FakeOfflineContext;
    const ev: SimEvent[] = [
      { t: 'fall', tick: 120, prop: 0, from: 2, dir: 5 },
      { t: 'break', tick: 133, prop: 0, points: 150, combo: 1 },
      { t: 'human', tick: 125, human: 0, state: 'look' },
      { t: 'break', tick: 10, prop: 1, points: 1, combo: 1 }, // outside the window
    ];
    const buf = await renderEventsOffline(ev, 100, 190, { fromTick: 130, toTick: 160, speed: 0.5 }, { propKinds: [1, 2], sampleRate: 8000 });
    expect(buf).not.toBeNull();
    expect(buf!.length).toBe(Math.ceil(4 * 8000));
    expect(buf!.numberOfChannels).toBe(2);
    expect(await renderEventsOffline(ev, 100, 100)).toBeNull();
  });

  it('cuesForContext works without a SimState (offline)', () => {
    const c = cuesForContext([{ t: 'break', tick: 1, prop: 0, points: 1, combo: 1 }], { kindOf: (i) => [1][i] });
    expect(c[0].material).toBe('glass');
  });
});
