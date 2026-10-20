import { describe, expect, it, vi } from 'vitest';
import { BPM } from '../config';
import type { BeatEvent, BeatEventPayload } from '../types';
import type { MixBeatmap, MixManifest } from './beatmap';
import { createBeatClock } from './index';
import type { MixLoader } from './mix';

const SPB = 60 / BPM;
const BAR = SPB * 4;
/** Fixture mix: 150 BPM from 0.2 s, barPhase 1 (mix bar k starts at 0.6 + 1.6k s), 120 s long. */
const MBAR = 1.6;
const mixBarSec = (k: number) => 0.6 + MBAR * k;
/** The mix is entered at its first downbeat (track 0.6 s): mix bar k sounds this long after the swap. */
const sinceSwap = (k: number) => MBAR * k;

function fixture(): { manifest: MixManifest; map: MixBeatmap } {
  const sr = 44100;
  const n = 30 * sr;
  const beats: number[] = [];
  for (let t = 0.2; t < 120; t += 0.4) beats.push(Math.round(t * 1000) / 1000);
  return {
    manifest: {
      v: 1,
      id: 'fx-v1',
      title: 'Fixture',
      artist: 'Test',
      credit: 'Fixture (mix) by Test',
      bpm: 150,
      duration: 120,
      sampleRate: sr,
      totalSamples: 4 * n,
      segSec: 30,
      cdnBase: 'https://cdn.example/w/music/fx-v1/',
      sameOriginBase: '/music/fx-v1/',
      beatmap: 'fx-v1-beatmap.json',
      segments: [0, 1, 2, 3].map((i) => ({ url: `fx-v1-00${i}.m4a`, start: i * 30, duration: 30, startSample: i * n, samples: n, pre: 4096, post: 4096, bytes: 1 })),
    },
    map: {
      v: 1,
      bpm: 150,
      duration: 120,
      beatsPerBar: 4,
      barPhase: 1,
      firstBeat: 0.2,
      firstDownbeat: 0.6,
      beatless: [[0, 0.2]],
      beats,
      drops: [mixBarSec(12), mixBarSec(56)],
      builds: [mixBarSec(8), mixBarSec(48)],
      breakdowns: [
        [mixBarSec(4), mixBarSec(12)],
        [mixBarSec(40), mixBarSec(56)],
      ],
      kick: [
        [mixBarSec(12), mixBarSec(40)],
        [mixBarSec(56), 120],
      ],
      energy: Array.from({ length: 120 }, () => 0.6),
      sections: [
        { bar: -1, section: 'intro' },
        { bar: 4, section: 'breakdown' },
        { bar: 8, section: 'build' },
        { bar: 12, section: 'drop' },
        { bar: 28, section: 'groove' },
        { bar: 40, section: 'breakdown' },
        { bar: 48, section: 'build' },
        { bar: 56, section: 'drop' },
        { bar: 72, section: 'groove' },
      ],
    },
  };
}

const okLoader = (): MixLoader => ({
  load: async () => fixture(),
  segment: async () => new ArrayBuffer(8),
});

interface Seen {
  event: BeatEvent;
  bar: number;
  t: number;
  cause?: string;
  track?: string;
}

function rig(loader: MixLoader = okLoader()) {
  let t = 1000;
  const clock = createBeatClock({ muted: true, now: () => t, mixLoader: loader });
  const seen: Seen[] = [];
  for (const e of ['section', 'build', 'drop', 'track'] as BeatEvent[]) {
    clock.on(e, (p: BeatEventPayload) => seen.push({ event: e, bar: p.beat.bar, t, cause: p.cause, track: p.track }));
  }
  const advance = (seconds: number, each?: () => void) => {
    const end = t + seconds;
    while (t < end - 1e-9) {
      t = Math.min(end, t + 1 / 60);
      clock.tick();
      each?.();
    }
  };
  clock.tick();
  return { clock, seen, advance, time: () => t, set: (s: number) => (t = s) };
}

/** Switch to the mix in groove, return the swap time and bar. */
async function toMix(r: ReturnType<typeof rig>) {
  r.advance(BAR * 1.3);
  expect(await r.clock.setTrack('mix')).toBe(true);
  r.advance(BAR * 3);
  const ev = r.seen.find((s) => s.event === 'track')!;
  expect(ev).toBeDefined();
  return ev;
}

describe('track defaults', () => {
  it('starts on the synth at 136 BPM, the same as a clock without the new options', () => {
    let t = 1000;
    const a = createBeatClock({ muted: true, now: () => t });
    const b = createBeatClock({ muted: true, now: () => t, track: 'synth', mixLoader: okLoader() });
    expect(b.track).toBe('synth');
    expect(b.bpm).toBe(136);
    expect(b.trackState).toBe('idle');
    expect(b.credit).toBeNull();
    for (const dt of [0, 0.3, 2.2, 17.9, 63.4]) {
      t = 1000 + dt;
      a.tick();
      b.tick();
      expect(b.now()).toEqual(a.now());
    }
  });
});

describe('swap to the mix', () => {
  it('arms on a bar line, emits track once at that bar, and follows the beat map', async () => {
    const r = rig();
    const ev = await toMix(r);
    expect(r.seen.filter((s) => s.event === 'track')).toHaveLength(1);
    expect(ev.track).toBe('mix');
    // The swap bar's clock time on the synth grid (one 60 fps frame of slack).
    const swapAt = 1000 + ev.bar * BAR;
    expect(ev.t).toBeGreaterThanOrEqual(swapAt - 1e-9);
    expect(ev.t - swapAt).toBeLessThan(1 / 60 + 1e-9);
    expect(r.clock.track).toBe('mix');
    expect(r.clock.trackState).toBe('ready');
    expect(r.clock.credit).toBe('Fixture (mix) by Test');
    // Mix bar k plays at swap + 1.6k s: phase ≈ 0 on the downbeat, at about 150 BPM.
    for (const k of [3, 6, 20]) {
      r.set(swapAt + sinceSwap(k) + 1e-6);
      const b = r.clock.now();
      expect(b.phase).toBeLessThan(1e-3);
      expect(b.beatInBar).toBe(0);
      expect(b.bpm).toBeCloseTo(150, 0);
      expect(r.clock.bpm).toBeCloseTo(150, 0);
    }
  });

  it('beat and bar never run backwards across the swap', async () => {
    const r = rig();
    r.advance(BAR * 1.3);
    await r.clock.setTrack('mix');
    let lastBeat = -1;
    let lastBar = -1;
    const end = r.time() + BAR * 4;
    while (r.time() < end) {
      r.set(r.time() + 0.01);
      r.clock.tick();
      const b = r.clock.now();
      expect(b.beat).toBeGreaterThanOrEqual(lastBeat);
      expect(b.bar).toBeGreaterThanOrEqual(lastBar);
      lastBeat = b.beat;
      lastBar = b.bar;
    }
    expect(r.clock.track).toBe('mix');
  });

  it('build and drop events follow the mix sections', async () => {
    const r = rig();
    const ev = await toMix(r);
    const swapAt = 1000 + ev.bar * BAR;
    r.advance(swapAt + sinceSwap(13) - r.time());
    // The swap bar is mix bar 0 (the mix is entered at its first downbeat).
    const base = ev.bar;
    const after = r.seen.filter((s) => s.t > ev.t);
    expect(after.find((s) => s.event === 'build')?.bar).toBe(base + 8);
    expect(after.find((s) => s.event === 'drop')).toMatchObject({ bar: base + 12, cause: 'arrangement' });
    expect(r.clock.now().section).toBe('drop');
  });

  it('a viewer drop is visual only: lands on the horizon bar, the plan resumes 8 bars later', async () => {
    const r = rig();
    const ev = await toMix(r);
    const swapAt = 1000 + ev.bar * BAR;
    const base = ev.bar;
    r.advance(swapAt + sinceSwap(30.5) - r.time()); // mix groove (28..40)
    expect(r.clock.now().section).toBe('groove');
    const before = r.seen.length;
    r.clock.queueDrop('viewer');
    r.advance(MBAR * 1.2);
    const drop = r.seen.slice(before).find((s) => s.event === 'drop');
    expect(drop).toMatchObject({ cause: 'viewer', bar: base + 31 });
    expect(r.clock.now().section).toBe('drop');
    r.advance(MBAR * 8);
    expect(r.clock.now().section).toBe('groove');
    // Hold: a visual build from the horizon bar.
    r.clock.beginBuild();
    r.advance(MBAR * 1.1);
    expect(r.clock.now().section).toBe('build');
    r.clock.endBuild();
    r.advance(MBAR * 1.1);
    expect(r.clock.now().section).toBe('drop');
  });

  it('wraps at the end of the mix with bars still counting up', async () => {
    const r = rig();
    await toMix(r);
    let lastBar = -1;
    let lastBeat = -1;
    r.advance(130, () => {
      const b = r.clock.now();
      expect(b.bar).toBeGreaterThanOrEqual(lastBar);
      expect(b.beat).toBeGreaterThanOrEqual(lastBeat);
      lastBar = b.bar;
      lastBeat = b.beat;
    });
    expect(r.clock.track).toBe('mix');
    expect(r.seen.filter((s) => s.event === 'track')).toHaveLength(1);
  });
});

describe('swap back and failures', () => {
  it('setTrack(synth) brings back 136 BPM with a continuous beat', async () => {
    const r = rig();
    await toMix(r);
    r.advance(MBAR * 5);
    expect(await r.clock.setTrack('synth')).toBe(true);
    let lastBeat = r.clock.now().beat;
    r.advance(BAR * 3, () => {
      const b = r.clock.now().beat;
      expect(b).toBeGreaterThanOrEqual(lastBeat);
      expect(b - lastBeat).toBeLessThan(0.5);
      lastBeat = b;
    });
    const tracks = r.seen.filter((s) => s.event === 'track');
    expect(tracks.map((s) => s.track)).toEqual(['mix', 'synth']);
    expect(r.clock.track).toBe('synth');
    expect(r.clock.bpm).toBe(BPM);
    expect(r.clock.now().bpm).toBe(BPM);
    // The synth's own arrangement resumes (groove from the swap bar).
    expect(r.clock.now().section).toBe('groove');
  });

  it('a loader that fails resolves false and stays on the synth', async () => {
    const r = rig({
      load: () => Promise.reject(new Error('404')),
      segment: () => Promise.reject(new Error('404')),
    });
    r.advance(BAR);
    expect(await r.clock.setTrack('mix')).toBe(false);
    expect(r.clock.track).toBe('synth');
    expect(r.clock.trackState).toBe('error');
    r.advance(BAR * 2);
    expect(r.seen.filter((s) => s.event === 'track')).toHaveLength(0);
    expect(r.clock.bpm).toBe(BPM);
  });

  it('mute toggles are safe without an AudioContext, in both tracks', async () => {
    const r = rig();
    r.clock.setMuted(false);
    r.clock.setMuted(true);
    await toMix(r);
    r.clock.setMuted(false);
    r.advance(0.5);
    r.clock.setMuted(true);
    r.clock.tap();
    r.clock.meow();
    r.clock.dispose();
  });
});

describe('swap timing and visual overrides', () => {
  it('the swap lands on a bar line: the bar event fires and no beat is skipped', async () => {
    const r = rig();
    const bars: number[] = [];
    r.clock.on('bar', (p) => bars.push(p.beat.bar));
    r.advance(BAR * 1.3);
    await r.clock.setTrack('mix');
    let last = r.clock.now().beat;
    let maxJump = 0;
    r.advance(BAR * 3, () => {
      const b = r.clock.now().beat;
      maxJump = Math.max(maxJump, b - last);
      last = b;
    });
    const ev = r.seen.find((s) => s.event === 'track')!;
    expect(bars).toContain(ev.bar);
    // One 60 fps frame at 150 BPM is 0.042 beats.
    expect(maxJump).toBeLessThan(0.05);
  });

  it('a second toggle while a swap is armed undoes it (targetTrack follows)', async () => {
    const r = rig();
    await toMix(r);
    r.advance(MBAR * 3.2);
    expect(await r.clock.setTrack('synth')).toBe(true);
    expect(r.clock.track).toBe('mix');
    expect(r.clock.targetTrack).toBe('synth');
    expect(await r.clock.setTrack('mix')).toBe(true);
    expect(r.clock.targetTrack).toBe('mix');
    r.advance(BAR * 3);
    expect(r.clock.track).toBe('mix');
    expect(r.seen.filter((s) => s.event === 'track').map((s) => s.track)).toEqual(['mix']);
    // And from the synth side: arm the mix, then cancel before it lands.
    const s = rig();
    s.advance(BAR * 1.3);
    await s.clock.setTrack('mix');
    expect(s.clock.targetTrack).toBe('mix');
    await s.clock.setTrack('synth');
    expect(s.clock.targetTrack).toBe('synth');
    s.advance(BAR * 3);
    expect(s.seen.filter((x) => x.event === 'track')).toHaveLength(0);
  });

  it('a visual drop never swallows the mix’s own build and drop', async () => {
    const r = rig();
    const ev = await toMix(r);
    const swapAt = 1000 + ev.bar * BAR;
    const base = ev.bar;
    r.advance(swapAt + sinceSwap(5.5) - r.time()); // mix breakdown (4..8); its build is at 8, drop at 12
    const before = r.seen.length;
    r.clock.queueDrop('new-cat');
    r.advance(swapAt + sinceSwap(12.5) - r.time());
    const after = r.seen.slice(before);
    expect(after.filter((s) => s.event === 'drop').map((s) => [s.bar - base, s.cause])).toEqual([
      [6, 'new-cat'],
      [12, 'arrangement'],
    ]);
    expect(after.find((s) => s.event === 'build')?.bar).toBe(base + 8);
  });

  it('a visual drop ending inside a mix drop does not fire that drop again', async () => {
    const r = rig();
    const ev = await toMix(r);
    const swapAt = 1000 + ev.bar * BAR;
    const base = ev.bar;
    r.advance(swapAt + sinceSwap(15.5) - r.time()); // mix drop 12..28, sectionBar 3
    const before = r.seen.length;
    r.clock.queueDrop('viewer');
    r.advance(MBAR * 12);
    const after = r.seen.slice(before);
    expect(after.filter((s) => s.event === 'drop').map((s) => [s.bar - base, s.cause])).toEqual([[16, 'viewer']]);
    expect(r.clock.now().section).toBe('drop');
  });
});

// ---------------------------------------------------------------------------------------------
// With a fake AudioContext and a fake mix player: the audible paths.
// ---------------------------------------------------------------------------------------------

/** A node that accepts any call or property (connect, gain.setValueAtTime, start, …). */
function anyNode(): unknown {
  const store: Record<string | symbol, unknown> = {};
  const fn = function () {};
  return new Proxy(fn, {
    get(_t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then') return undefined;
      if (k === 'value') return store[k] ?? 0;
      if (!(k in store)) store[k] = anyNode();
      return store[k];
    },
    set(_t, k, v) {
      store[k] = v;
      return true;
    },
    apply() {
      return anyNode();
    },
  });
}

interface FakeCtx {
  currentTime: number;
  state: string;
  onstatechange: (() => void) | null;
}

class FakePlayer {
  anchor: number | null = null;
  calls: string[] = [];
  starts: number[] = [];
  onError: (err: Error) => void = () => {};
  async start(when: number, sec: number) {
    this.calls.push('start');
    this.starts.push(sec);
    this.anchor = when - sec;
  }
  stop() {
    this.calls.push('stop');
    this.anchor = null;
  }
  fade(to: number) {
    this.calls.push(`fade ${to}`);
  }
  pump() {}
  async preload() {}
  release() {
    this.calls.push('release');
  }
  dispose() {}
}

async function audibleRig() {
  let t = 1000;
  let ctxFrozen = false;
  let ctxBase = 5;
  const ctx: FakeCtx & Record<string, unknown> = {
    currentTime: 5,
    state: 'suspended',
    onstatechange: null,
    sampleRate: 48000,
    outputLatency: 0,
    baseLatency: 0,
    destination: anyNode(),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    resume: async () => {
      ctx.state = 'running';
      ctx.onstatechange?.();
    },
    suspend: async () => {
      ctx.state = 'suspended';
      ctx.onstatechange?.();
    },
    close: async () => {},
  };
  const proxied = new Proxy(ctx, {
    get(target, k) {
      if (k in target) return target[k as string];
      if (typeof k === 'string' && k.startsWith('create')) return () => anyNode();
      return undefined;
    },
  });
  const g = globalThis as Record<string, unknown>;
  g.window = { AudioContext: function () { return proxied; }, addEventListener() {}, removeEventListener() {} };
  g.document = { hidden: false, addEventListener() {}, removeEventListener() {}, documentElement: { dataset: {} } };
  const player = new FakePlayer();
  const clock = createBeatClock({ muted: false, now: () => t, mixLoader: okLoader(), playerFactory: () => player });
  const syncCtx = () => {
    if (!ctxFrozen) ctx.currentTime = ctxBase + (t - 1000);
  };
  const advance = (seconds: number) => {
    const end = t + seconds;
    while (t < end - 1e-9) {
      t = Math.min(end, t + 1 / 60);
      syncCtx();
      clock.tick();
    }
  };
  expect(await clock.unlock()).toBe(true);
  advance(BAR * 1.3);
  expect(await clock.setTrack('mix')).toBe(true);
  advance(BAR * 3);
  expect(clock.track).toBe('mix');
  return {
    clock,
    ctx,
    player,
    advance,
    /** Freeze the context's clock (an interruption) or let it run on from where it stopped. */
    freeze(on: boolean) {
      if (on) ctxFrozen = true;
      else {
        ctxBase = ctx.currentTime - (t - 1000);
        ctxFrozen = false;
      }
    },
    cleanup() {
      clock.dispose();
      delete g.window;
      delete g.document;
    },
  };
}

describe('audible mix (fake AudioContext)', () => {
  it('mute then unmute inside 150 ms fades the mix back up and never stops it', async () => {
    vi.useFakeTimers();
    const a = await audibleRig();
    try {
      expect(a.player.calls.filter((c) => c === 'start')).toHaveLength(1);
      a.player.calls.length = 0;
      a.clock.setMuted(true);
      vi.advanceTimersByTime(50);
      a.clock.setMuted(false);
      await Promise.resolve();
      await Promise.resolve();
      vi.advanceTimersByTime(300);
      expect(a.player.calls).toContain('fade 0');
      expect(a.player.calls.at(-1)).toBe('fade 1');
      expect(a.player.calls).not.toContain('stop');
    } finally {
      a.cleanup();
      vi.useRealTimers();
    }
  });

  it('an interrupted context re-seeks the mix to the virtual playhead; the beat keeps going', async () => {
    const a = await audibleRig();
    try {
      a.advance(MBAR * 4);
      const beat0 = a.clock.now().beat;
      a.ctx.state = 'interrupted';
      a.ctx.onstatechange?.();
      expect(a.player.anchor).toBeNull();
      a.freeze(true);
      a.advance(30);
      a.freeze(false);
      a.ctx.state = 'running';
      a.ctx.onstatechange?.();
      a.advance(1);
      const beat1 = a.clock.now().beat;
      // 31 s at 150 BPM ≈ 77.5 beats: no freeze.
      expect(beat1 - beat0).toBeGreaterThan(70);
      const sec = a.player.starts.at(-1)!;
      expect(sec).toBeGreaterThan(0.6 + MBAR * 4 + 29);
    } finally {
      a.cleanup();
    }
  });

  it('a stall the clock was not told about (no statechange) re-seeks instead of freezing the beat', async () => {
    const a = await audibleRig();
    try {
      a.advance(MBAR * 4);
      const starts = a.player.starts.length;
      const beat0 = a.clock.now().beat;
      // The context stops (pump stands still) and comes back, with no event either way.
      a.ctx.state = 'interrupted';
      a.freeze(true);
      a.advance(20);
      a.freeze(false);
      a.ctx.state = 'running';
      a.advance(1);
      expect(a.player.starts.length).toBe(starts + 1);
      expect(a.clock.now().beat - beat0).toBeGreaterThan(45);
      let last = a.clock.now().beat;
      a.advance(2);
      expect(a.clock.now().beat - last).toBeGreaterThan(4);
      last = a.clock.now().beat;
    } finally {
      a.cleanup();
    }
  });

  it('landing back on the synth releases the decoded segments', async () => {
    const a = await audibleRig();
    try {
      a.advance(MBAR * 3);
      await a.clock.setTrack('synth');
      a.advance(BAR * 3);
      expect(a.clock.track).toBe('synth');
      expect(a.player.calls).toContain('release');
    } finally {
      a.cleanup();
    }
  });
});
