import { afterEach, describe, expect, it, vi } from 'vitest';
import { HumanSt, NOISE, PROP_KINDS, ROOM_EVENT_NAMES, type PlayableRoom, type SimEvent, type SimState } from '../types';
import {
  CLIP_MUSIC_S,
  CRASH_CLASS,
  createAudio,
  cuesForContext,
  liveTickCues,
  renderEventsOffline,
  roomAudioFor,
  snoreCues,
  specialOf,
  teleKindFor,
  type Cue,
  type CueId,
  type RoomAudio,
} from './index';
import { makeNoise, playCue, type SynthGraph } from './synth';
import { MusicLoop, STYLE_BPM } from './music';
import { FakeContext, FakeOfflineContext, type FakeGain } from './fake-context.test-util';
import { modelLevelDb } from './loudness-model.test-util';
import { PERSONAS, VOICE_PROFILES } from './voices';

const ids = (c: Cue[]) => c.map((x) => x.id);
const kindIndex = (id: string) => PROP_KINDS.findIndex((k) => k.id === id);
/** Prop index i has kind PROP_KINDS[i].kind (so prop index = kind - 1). */
const allKinds = (i: number) => PROP_KINDS[i]?.kind;

function room(over: Partial<RoomAudio> = {}): RoomAudio {
  return { eventKind: 0, personas: ['chef-dad'], nappers: [false], teleKinds: [-1], theme: 'default', boss: false, ...over };
}

function play(over: { persona?: string; kind?: 'watcher' | 'napper'; cue?: string; event?: number; theme?: string; boss?: boolean; second?: boolean } = {}): PlayableRoom {
  const routine = { id: 0, name: 'R', cue: over.cue ?? 'stove timer', persona: over.persona, kind: over.kind };
  return {
    room: { id: 'x', shell: 0, routine: 0, event: over.event ?? 0, props: [{ kind: 1 }, { kind: 28 }], theme: over.theme, boss: over.boss },
    routine,
    routine2: over.second ? { ...routine, id: 1, persona: 'caterer', cue: 'tv jingle' } : undefined,
  } as unknown as PlayableRoom;
}

function fakeGraph(): { ctx: FakeContext; g: SynthGraph; out: unknown } {
  const ctx = new FakeContext();
  const out = ctx.createGain();
  const g: SynthGraph = { ctx: ctx as unknown as BaseAudioContext, out: out as unknown as AudioNode, noise: makeNoise(ctx as unknown as BaseAudioContext, 0.1) };
  return { ctx, g, out };
}

describe('W1-AUDIO cue mapping: every v5 event', () => {
  const ctx = { kindOf: allKinds, room: room({ personas: ['grandma'], teleKinds: [2] }) };
  const cases: [SimEvent, CueId[]][] = [
    [{ t: 'slide', tick: 5, fromX: 1, fromZ: 1, x: 2, z: 1 }, ['slide']],
    [{ t: 'stack', tick: 5, prop: kindIndex('plate-stack'), items: 4, points: 320 }, ['stackClink']],
    [{ t: 'pull', tick: 5, prop: kindIndex('tablecloth'), dir: 4, kind: 'cloth', moved: 3 }, ['pullCloth']],
    [{ t: 'pull', tick: 5, prop: kindIndex('lamp'), dir: 4, kind: 'cable', moved: 1 }, ['pullCable']],
    [{ t: 'topple', tick: 5, prop: kindIndex('christmas-tree'), cells: 3, dir: 4 }, ['topple']],
    [{ t: 'puddle', tick: 5, x: 1, z: 1, kind: 1 }, ['puddle']],
    [{ t: 'roomba', tick: 5, x: 1, z: 1 }, ['roombaHum']],
    [{ t: 'framed', tick: 5, prop: 0 }, ['framed']],
    [{ t: 'wish', tick: 5 }, ['wish']],
    [{ t: 'enter', tick: 5, prop: kindIndex('cardboard-box') }, ['enter']],
    [{ t: 'noise', tick: 5, level: 50_000 }, ['noiseRise']],
    [{ t: 'wake', tick: 5, human: 0 }, ['wake']],
    [{ t: 'seen', tick: 5, suspicion: 100, by: 'mirror' }, ['seen', 'glint']],
    [{ t: 'seen', tick: 5, suspicion: 100, by: 'human' }, ['seen']],
    [{ t: 'break', tick: 5, prop: 0, points: 150, combo: 1, cam: true }, ['crash', 'shutter']],
    [{ t: 'land', tick: 5, prop: kindIndex('tv-remote'), points: 60, combo: 1, cam: true }, ['land', 'shutter']],
    [{ t: 'human', tick: 50, human: 0, state: 'telegraph' }, ['teleCue', 'hm']],
    [{ t: 'human', tick: 50, human: 0, state: 'nap' }, ['snore']],
    [{ t: 'human', tick: 50, human: 0, state: 'busy' }, ['sigh']],
  ];
  for (const [e, want] of cases) {
    it(`${e.t}${'kind' in e ? ' ' + String((e as { kind: unknown }).kind) : ''}${'by' in e ? ' by ' + e.by : ''} -> ${want.join(' + ')}`, () => {
      expect(ids(cuesForContext([e], ctx))).toEqual(want);
    });
  }

  it('carries the details: stack items + material, topple cells, noise amount, puddle kind, persona, telegraph kind', () => {
    const c = cuesForContext(
      [
        { t: 'stack', tick: 1, prop: kindIndex('cups-tower'), items: 6, points: 180 },
        { t: 'topple', tick: 1, prop: kindIndex('christmas-tree'), cells: 4, dir: 2 },
        { t: 'noise', tick: 1, level: NOISE.max * 0.75 },
        { t: 'puddle', tick: 1, x: 0, z: 0, kind: 2 },
        { t: 'human', tick: 40, human: 0, state: 'telegraph' },
      ],
      ctx,
    );
    expect(c[0]).toMatchObject({ id: 'stackClink', items: 6, material: 'plastic', special: 'cups' });
    expect(c[1]).toMatchObject({ id: 'topple', items: 4, special: 'tree' });
    expect(c[2].amount).toBeCloseTo(0.75);
    expect(c[3].variant).toBe(1);
    expect(c[4]).toMatchObject({ id: 'teleCue', teleKind: 2 });
    expect(c[5]).toMatchObject({ id: 'hm', persona: 'grandma' });
    expect(c[5].delay).toBeGreaterThan(0);
  });

  it('a Napper telegraph is silent (its wake is the yawn); wake and caught use the persona', () => {
    const nap = { kindOf: allKinds, room: room({ personas: ['napper'], nappers: [true], teleKinds: [-1] }) };
    expect(cuesForContext([{ t: 'human', tick: 60, human: 0, state: 'telegraph' }], nap)).toEqual([]);
    expect(cuesForContext([{ t: 'wake', tick: 60, human: 0 }], nap)[0]).toMatchObject({ id: 'wake', persona: 'napper' });
    const caught = cuesForContext([{ t: 'caught', tick: 60 }], ctx);
    expect(ids(caught)).toEqual(['badKitty', 'comeHere', 'caught', 'purr']);
    expect(caught[0].persona).toBe('grandma');
    expect(caught[1].delay).toBeGreaterThan(caught[0].delay);
  });

  it('NYE last call adds the countdown sting', () => {
    expect(ids(cuesForContext([{ t: 'lastcall', tick: 9 }], { kindOf: allKinds, room: room({ theme: 'nye' }) }))).toEqual(['lastCall', 'nyeCountdown']);
    expect(ids(cuesForContext([{ t: 'lastcall', tick: 9 }], { kindOf: allKinds, room: room() }))).toEqual(['lastCall']);
  });

  it('every room event kind 0..11 maps to its own event cue', () => {
    expect(ROOM_EVENT_NAMES).toHaveLength(12);
    for (let k = 0; k < 12; k++) {
      const c = cuesForContext([{ t: 'human', tick: 9, human: 0, state: 'event' }], { kindOf: allKinds, room: room({ eventKind: k }) });
      expect(c).toHaveLength(1);
      expect(c[0]).toMatchObject({ id: 'eventCue', eventKind: k });
    }
  });

  it('offline: a gap in the Roomba moves is a bump (bonk)', () => {
    const c = cuesForContext(
      [
        { t: 'roomba', tick: 10, x: 1, z: 1 },
        { t: 'roomba', tick: 34, x: 2, z: 1 },
        { t: 'roomba', tick: 120, x: 3, z: 1 },
      ],
      { kindOf: allKinds, inferRoombaPause: true },
    );
    expect(ids(c)).toEqual(['roombaHum', 'roombaHum', 'bonk', 'roombaHum']);
    expect(c[2].tick).toBe(34 + 24);
  });
});

describe('W1-AUDIO materials and special sounds for kinds 16..63', () => {
  it('maps the Appendix A props to their recipes', () => {
    const at = (id: string) => specialOf(PROP_KINDS[kindIndex(id)].kind);
    expect(at('balloon')).toBe('balloon');
    expect(at('flour-bag')).toBe('flour');
    expect(at('popcorn-bowl')).toBe('popcorn');
    expect(at('champagne-bottle')).toBe('champagne');
    expect(at('cups-tower')).toBe('cups');
    expect(at('receipt-pile')).toBe('paper');
    expect(at('gift-stack')).toBe('gift');
    expect(at('cookie-tray')).toBe('tray');
    expect(at('christmas-tree')).toBe('tree');
    expect(at('wine-glass')).toBeUndefined();
  });

  it('break / spill of a special prop is a crash with that recipe; landing is a land', () => {
    const c = cuesForContext(
      [
        { t: 'break', tick: 1, prop: kindIndex('balloon'), points: 80, combo: 1 },
        { t: 'spill', tick: 1, prop: kindIndex('flour-bag'), points: 160, combo: 1 },
        { t: 'spill', tick: 1, prop: kindIndex('champagne-bottle'), points: 200, combo: 1 },
        { t: 'land', tick: 1, prop: kindIndex('gift-stack'), points: 360, combo: 1 },
        { t: 'spill', tick: 1, prop: kindIndex('pie'), points: 300, combo: 1 },
      ],
      { kindOf: allKinds },
    );
    expect(c.map((x) => [x.id, x.special])).toEqual([
      ['crash', 'balloon'],
      ['crash', 'flour'],
      ['crash', 'champagne'],
      ['land', 'gift'],
      ['splat', undefined],
    ]);
  });

  it('every prop kind 1..63 x break/land/spill plays valid voices', () => {
    const { ctx, g } = fakeGraph();
    for (let i = 0; i < PROP_KINDS.length; i++) {
      for (const t of ['break', 'land', 'spill', 'hit'] as const) {
        const before = ctx.starts;
        for (const c of cuesForContext([{ t, tick: i, prop: i, points: 10, combo: 3, cam: true }], { kindOf: allKinds })) playCue(g, c, 0.2);
        expect(ctx.starts, PROP_KINDS[i].id + ' ' + t).toBeGreaterThan(before);
      }
    }
  });
});

describe('W1-AUDIO synth: every new cue, event kind and persona', () => {
  const NEW: CueId[] = [
    'slide', 'stackClink', 'pullCloth', 'pullCable', 'topple', 'puddle', 'roombaHum', 'framed', 'wish', 'enter',
    'noiseRise', 'wake', 'snore', 'glint', 'shutter', 'teleCue', 'sigh', 'comeHere', 'nyeCountdown', 'hm', 'doubleTake',
    'hum', 'badKitty',
  ];
  it('schedules valid voices for every new cue x persona x variant', () => {
    const { ctx, g } = fakeGraph();
    for (const id of NEW)
      for (const persona of PERSONAS)
        for (let variant = 0; variant < 3; variant++) {
          const before = ctx.starts;
          playCue(g, { id, tick: 3, delay: 0, pitch: 2, gain: 1, variant, persona, items: 5, amount: variant / 2, teleKind: variant, material: 'glass' }, 1);
          expect(ctx.starts, id + ' ' + persona).toBeGreaterThan(before);
        }
  });
  it('every room event 0..11 and telegraph cue 0..3 makes sound', () => {
    const { ctx, g } = fakeGraph();
    for (let k = 0; k < 12; k++) {
      const before = ctx.starts;
      playCue(g, { id: 'eventCue', tick: 1, delay: 0, pitch: 0, gain: 1, variant: 0, eventKind: k }, 0.5);
      expect(ctx.starts, 'event ' + k).toBeGreaterThan(before);
    }
    for (let k = 0; k < 4; k++) {
      const before = ctx.starts;
      playCue(g, { id: 'teleCue', tick: 1, delay: 0, pitch: 0, gain: 1, variant: 0, teleKind: k }, 0.5);
      expect(ctx.starts, 'tele ' + k).toBeGreaterThan(before);
    }
  });
  it('every envelope gain is silent before its first event (no one-sample click at a sample-aligned start)', () => {
    const { ctx, g } = fakeGraph();
    const made: FakeGain[] = [];
    const orig = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      const n = orig();
      made.push(n);
      return n;
    };
    for (const id of NEW) playCue(g, { id, tick: 1, delay: 0, pitch: 0, gain: 1, variant: 0, items: 3, amount: 0.5, teleKind: 0 }, 0.55);
    for (let k = 0; k < 12; k++) playCue(g, { id: 'eventCue', tick: 1, delay: 0, pitch: 0, gain: 1, variant: 0, eventKind: k }, 0.55);
    const envelopes = made.filter((n) => n.gain.events[0]?.kind === 'set' && n.gain.events[0].v < 0.001);
    expect(envelopes.length).toBeGreaterThan(50);
    for (const n of envelopes) expect(n.gain.value).toBeLessThan(0.001);
  });
  it('personas sound different (pitch) and grandma wobbles', () => {
    const f0 = PERSONAS.map((p) => VOICE_PROFILES[p].f0);
    expect(new Set(f0).size).toBe(PERSONAS.length);
    expect(VOICE_PROFILES.grandma.vibCents).toBeGreaterThan(VOICE_PROFILES['skincare-sis'].vibCents * 2);
  });
});

describe('W1-AUDIO loudness: the crash stays 3-4 dB above everything else', () => {
  function level(c: Partial<Cue> & { id: CueId }): number {
    const { ctx, g, out } = fakeGraph();
    playCue(g, { tick: 3, delay: 0, pitch: 0, gain: 1, variant: 1, ...c } as Cue, 0.1);
    return modelLevelDb(ctx, out, 0, 3);
  }
  /** End-of-run stingers and the turn sting are loud on purpose (GDD 12) and never sit under a crash. */
  const STINGERS: CueId[] = ['hm', 'caught', 'badKitty', 'comeHere', 'perfect', 'stamp'];
  const MATERIALS = ['glass', 'ceramic', 'paper', 'food', 'plastic', 'tech', 'fabric', 'metal', 'actor'] as const;
  const SPECIALS = ['balloon', 'flour', 'popcorn', 'champagne', 'cups', 'paper', 'gift', 'tray', 'tree', 'bubbles', 'ornament', 'boardgame'] as const;

  it('every crash-class cue (materials and the new specials) beats every other cue by >= 3 dB', () => {
    const crash: [string, number][] = [];
    for (let variant = 0; variant < 3; variant++) {
      for (const material of MATERIALS) crash.push([`crash/${material}/${variant}`, level({ id: 'crash', material, variant })]);
      for (const special of SPECIALS) crash.push([`crash/${special}/${variant}`, level({ id: 'crash', special, variant })]);
      crash.push([`splat/${variant}`, level({ id: 'splat', variant })]);
      crash.push([`topple/${variant}`, level({ id: 'topple', items: 3, variant })]);
    }
    const others: [string, number][] = [];
    const ALL: CueId[] = [
      'step', 'jumpUp', 'jumpDown', 'swat', 'swatAir', 'wobble', 'push', 'fall', 'bonk', 'target', 'combo', 'grab',
      'drop', 'stash', 'purr', 'doubleTake', 'hum', 'seen', 'lastCall', 'go', 'slide', 'stackClink', 'pullCloth',
      'pullCable', 'puddle', 'roombaHum', 'framed', 'wish', 'enter', 'noiseRise', 'wake', 'snore', 'glint', 'shutter',
      'sigh', 'nyeCountdown',
    ];
    for (const id of ALL) {
      expect(CRASH_CLASS.includes(id)).toBe(false);
      others.push([id, level({ id, items: 6, amount: 1, level: 3, speed: 2, material: 'glass' })]);
    }
    for (const material of MATERIALS) others.push([`land/${material}`, level({ id: 'land', material })]);
    for (const special of SPECIALS) others.push([`land/${special}`, level({ id: 'land', special })]);
    for (let k = 0; k < 12; k++) others.push([`event${k}`, level({ id: 'eventCue', eventKind: k })]);
    for (let k = 0; k < 4; k++) others.push([`tele${k}`, level({ id: 'teleCue', teleKind: k })]);
    for (const s of STINGERS) expect(ALL.includes(s)).toBe(false);
    const quietestCrash = crash.reduce((a, b) => (b[1] < a[1] ? b : a));
    const loudestOther = others.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(quietestCrash[1] - loudestOther[1], `${quietestCrash[0]} vs ${loudestOther[0]}`).toBeGreaterThanOrEqual(3);
  });
});

describe('W1-AUDIO room context, snores and live extras', () => {
  it('roomAudioFor reads personas, napper, telegraph cue, theme and boss', () => {
    expect(teleKindFor('stove timer')).toBe(0);
    expect(teleKindFor('TV jingle')).toBe(1);
    expect(teleKindFor('mirror hum')).toBe(2);
    expect(teleKindFor("you're on mute")).toBe(3);
    expect(teleKindFor('nothing')).toBe(-1);
    const r = roomAudioFor(play({ persona: 'grandma', cue: 'mirror hum', event: 7, theme: 'xmas', second: true }));
    expect(r).toMatchObject({ eventKind: 7, personas: ['grandma', 'caterer'], nappers: [false, false], teleKinds: [2, 1], theme: 'xmas', boss: true });
    const n = roomAudioFor(play({ kind: 'napper', cue: '' }));
    expect(n.personas).toEqual(['napper']);
    expect(n.nappers).toEqual([true]);
  });

  it('snoreCues: a napper snores every 2.5 s while asleep and stops on waking', () => {
    const r = room({ personas: ['napper'], nappers: [true] });
    const ev: SimEvent[] = [
      { t: 'noise', tick: 20, level: 50_000 },
      { t: 'wake', tick: 400, human: 0 },
      { t: 'human', tick: 400, human: 0, state: 'telegraph' },
      { t: 'human', tick: 500, human: 0, state: 'nap' },
    ];
    const c = snoreCues(ev, 100, 700, r);
    expect(c.every((x) => x.id === 'snore')).toBe(true);
    expect(c.some((x) => x.tick > 400 && x.tick < 500)).toBe(false);
    expect(c.filter((x) => x.tick < 400).length).toBeGreaterThanOrEqual(3);
    expect(c.some((x) => x.tick > 500)).toBe(true);
    expect(c[0].amount).toBeCloseTo(0.5);
    expect(snoreCues(ev, 100, 700, room())).toEqual([]);
  });

  it('liveTickCues: snore on the beat while napping; bonk when the Roomba pauses', () => {
    const s = { tick: 150, humans: [{ state: HumanSt.NAP }], noise: 25_000, roomba: { pause: 0 } } as unknown as SimState;
    const memo = { roombaPause: 0 };
    expect(ids(liveTickCues(s, room({ nappers: [true] }), memo))).toEqual(['snore']);
    s.tick = 151;
    (s.roomba as { pause: number }).pause = 20;
    expect(ids(liveTickCues(s, room(), memo))).toEqual(['bonk']);
    s.tick = 152;
    expect(liveTickCues(s, room(), memo)).toEqual([]);
  });
});

describe('W1-AUDIO music styles', () => {
  it('boss loop is faster, lullaby slower; xmas adds the sleigh + celesta layer', () => {
    expect(STYLE_BPM.boss).toBeGreaterThan(STYLE_BPM.jazz);
    expect(STYLE_BPM.lullaby).toBeLessThan(STYLE_BPM.jazz);
    const count = (style: 'jazz' | 'boss' | 'lullaby', theme: 'default' | 'xmas') => {
      const ctx = new FakeContext();
      const a = ctx as unknown as BaseAudioContext;
      const m = new MusicLoop(a, ctx.createGain() as unknown as AudioNode, makeNoise(a, 0.1));
      m.setFlavor({ style, theme });
      m.scheduleSpan(0, 8, 'full', 3);
      return ctx.starts;
    };
    const jazz = count('jazz', 'default');
    expect(count('boss', 'default')).toBeGreaterThan(jazz);
    expect(count('jazz', 'xmas')).toBeGreaterThan(jazz);
    expect(count('lullaby', 'default')).toBeGreaterThan(0);
  });
});

describe('W1-AUDIO clip mix and real-time clip scheduling', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g.window;
    delete g.OfflineAudioContext;
    FakeOfflineContext.last = null;
    vi.useRealTimers();
  });
  const ev: SimEvent[] = [
    { t: 'fall', tick: 120, prop: 0, from: 2, dir: 5 },
    { t: 'human', tick: 125, human: 0, state: 'look' },
    { t: 'break', tick: 133, prop: 0, points: 150, combo: 1 },
  ];

  it('renderClipMix with music is longer and fuller than without; renderOffline = no music', async () => {
    g.OfflineAudioContext = FakeOfflineContext;
    const a = createAudio();
    a.setRoom(play({ theme: 'xmas' }));
    // engine before unlock still renders offline (no live context needed)
    const dry = await a.renderClipMix!(ev, 100, 190, undefined, { music: false });
    const dryStarts = FakeOfflineContext.last!.starts;
    const wet = await a.renderClipMix!(ev, 100, 190, undefined, { music: true, theme: 'xmas' });
    const wetStarts = FakeOfflineContext.last!.starts;
    expect(dry!.length).toBe(Math.ceil(3 * 48000));
    expect(wet!.length).toBe(Math.ceil(CLIP_MUSIC_S * 48000));
    expect(wetStarts).toBeGreaterThan(dryStarts * 3);
    const plain = await a.renderOffline!(ev, 100, 190);
    expect(plain!.length).toBe(dry!.length);
    expect(FakeOfflineContext.last!.starts).toBe(dryStarts);
    // a long window keeps its own length under the sting
    const long = await renderEventsOffline(ev, 0, 400, undefined, { music: true, sampleRate: 8000 });
    expect(long!.length).toBe(Math.ceil((400 / 30) * 8000));
  });

  it('scheduleClip schedules the cues at startAt + clip offset into the recorder and cancel stops them', async () => {
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
    expect(a.now!()).toBeNull();
    expect(a.scheduleClip!(ev, 100, 190, undefined, 0)).toBeTypeOf('function'); // no-op before unlock
    await a.unlock();
    const ctx = made as unknown as FakeContext;
    ctx.currentTime = 4;
    expect(a.now!()).toBe(4);
    const before = ctx.sources.length;
    const slowMo = { fromTick: 130, toTick: 160, speed: 0.5 };
    const cancel = a.scheduleClip!(ev, 100, 190, slowMo, 5, { music: true });
    const mine = ctx.sources.slice(before);
    expect(mine.length).toBeGreaterThan(20);
    const starts = mine.map((n) => n.started);
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(5);
    // fall at tick 120 -> 5 + 20/30 s; look at 125 -> 5 + 25/30; break at 133 (slow-mo from 130) -> 5 + 1 + 3/30/0.5
    for (const at of [5 + 20 / 30, 5 + 25 / 30, 5 + 1 + 3 / 30 / 0.5]) expect(starts.some((s) => Math.abs(s - at) < 1e-6)).toBe(true);
    ctx.currentTime = 5.5;
    cancel();
    expect(mine.every((n) => n.stopped <= 5.5 + 1e-9)).toBe(true);
    cancel(); // idempotent
    a.dispose();
  });

  it('createAudio() in Node is still a no-op engine', async () => {
    const a = createAudio();
    a.setRoom(play({ kind: 'napper' }));
    await a.unlock();
    expect(a.unlocked).toBe(false);
    expect(a.now!()).toBeNull();
    expect(await a.renderClipMix!(ev, 0, 100, undefined, { music: true })).toBeNull();
    const cancel = a.scheduleClip!(ev, 0, 100, undefined, 0, { music: true });
    expect(() => cancel()).not.toThrow();
    a.onEvents(ev, { tick: 75, humans: [{ state: HumanSt.NAP }], props: [], stamp: 0 } as unknown as SimState);
    a.dispose();
  });
});
