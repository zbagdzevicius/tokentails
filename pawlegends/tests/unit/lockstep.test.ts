/** Party play N5 (MULTIPLAYER.md §4.2): the lockstep runner's playout clock on a fake clock. */
import { describe, expect, it } from 'vitest';
import { LockstepRunner, MAX_B, MAX_MARGIN_MS, TURN_MS } from '../../src/net/lockstep';
import { Pacer } from '../../src/net/pacer';

/** A fake event loop: timers fire in time order; `run(until)` advances the clock. */
function fakeLoop() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      timers.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    /** Run timers and scheduled callbacks up to `until`. */
    run(until: number, at: { t: number; fn: () => void }[] = []) {
      const ext = [...at].sort((a, b) => a.t - b.t);
      for (;;) {
        let next: { key: number; at: number } | null = null;
        for (const [key, t] of timers) if (!next || t.at < next.at) next = { key, at: t.at };
        const e = ext[0];
        const tn = Math.min(next?.at ?? Infinity, e?.t ?? Infinity);
        if (tn > until) break;
        now = Math.max(now, tn);
        if (e && e.t <= (next?.at ?? Infinity)) {
          ext.shift();
          e.fn();
        } else if (next) {
          const t = timers.get(next.key)!;
          timers.delete(next.key);
          t.fn();
        }
      }
      now = until;
    },
  };
}

/** Drive a runner through a Pacer: turn k arrives at `arrive(k)`; returns each turn's step time. */
function play(arrive: (k: number) => number, turns: number, opts: { endAt?: number } = {}) {
  const loop = fakeLoop();
  const r = new LockstepRunner<number>(0);
  const stepped: number[] = [];
  const core = {
    pace: (now: number) => {
      for (const k of r.due(now)) stepped[k] = now;
    },
    wakeAt: (now: number) => r.wakeAt(now),
  };
  const pacer = new Pacer(core, loop);
  pacer.start();
  const events = Array.from({ length: turns }, (_, k) => ({
    t: arrive(k),
    fn: () => {
      r.push(k, loop.now());
      pacer.kick();
    },
  }));
  loop.run(opts.endAt ?? arrive(turns - 1) + 2000, events);
  return { r, stepped, arrivals: Array.from({ length: turns }, (_, k) => arrive(k)) };
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

describe('LockstepRunner (playout clock)', () => {
  it('a clean link: every turn steps the moment it arrives (no standing queue, B stays 1)', () => {
    const { r, stepped, arrivals } = play((k) => 40 + k * TURN_MS, 300);
    const waits = arrivals.map((a, k) => stepped[k] - a);
    expect(Math.max(...waits)).toBeLessThan(1);
    expect(r.B).toBe(1);
    expect(r.queue.length).toBe(0);
  });

  it('a jittery link (±25 ms): the margin covers most of it, turns wait at most the margin, nothing strands', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    // order kept, like TCP
    const at: number[] = [];
    for (let k = 0; k < 600; k++) at.push(Math.max(at[k - 1] ?? 0, 75 + k * TURN_MS + rnd() * 25));
    const { r, stepped } = play((k) => at[k], 600);
    const waits = at.map((a, k) => stepped[k] - a);
    expect(stepped.filter((s) => s !== undefined)).toHaveLength(600);
    expect(Math.max(...waits)).toBeLessThanOrEqual(MAX_MARGIN_MS + 1);
    expect(r.marginMs).toBeGreaterThan(10);
    expect(r.marginMs).toBeLessThan(55);
    // even pacing: steps of the last 300 turns are mostly a turn apart
    const gaps = stepped.slice(301).map((s, i) => s - stepped[300 + i]);
    const even = gaps.filter((g) => Math.abs(g - TURN_MS) < 12).length / gaps.length;
    expect(even).toBeGreaterThan(0.8);
    expect(median(waits)).toBeLessThan(40);
  });

  it('a burst after a stall catches up at 2 turns per half turn, never a standing queue afterwards', () => {
    // turns 100..109 stall 600 ms and land together
    const arrive = (k: number) => (k >= 100 && k < 110 ? 50 + 110 * TURN_MS : 50 + k * TURN_MS);
    const { r, stepped, arrivals } = play(arrive, 200);
    expect(stepped.filter((s) => s !== undefined)).toHaveLength(200);
    // the backlog is gone within ~3 turns of the burst
    expect(stepped[109] - arrivals[109]).toBeLessThan(3 * TURN_MS);
    // later turns step on arrival again
    const tail = arrivals.slice(150).map((a, i) => stepped[150 + i] - a);
    expect(Math.max(...tail)).toBeLessThan(1);
    expect(r.catchups).toBeGreaterThan(0);
  });

  it('catch-up frames (no sample) are due at once and do not raise the margin', () => {
    const r = new LockstepRunner<number>(0);
    for (let i = 0; i < 20; i++) r.push(i, 1000, false);
    expect(r.marginMs).toBe(0);
    // more than 6 due: 5 per call (10 ticks), then half a turn later the next
    expect(r.due(1000)).toEqual([0, 1, 2, 3, 4]);
    expect(r.wakeAt(1000)).toBeCloseTo(1000 + TURN_MS / 2);
    for (let t = 1040; r.queue.length > 4; t += 40) r.due(t);
    // a small backlog: 2 per call
    expect(r.due(2000)).toHaveLength(2);
  });

  it('the margin falls slowly after the jitter goes away (smooth), and rises at once', () => {
    const r = new LockstepRunner<number>(0);
    let k = 0;
    for (; k < 45; k++) r.push(k, 50 + k * TURN_MS + (k % 2 ? 60 : 0));
    const high = r.marginMs;
    expect(high).toBeGreaterThan(50);
    r.push(k, 50 + k * TURN_MS);
    k++;
    expect(r.marginMs).toBeGreaterThan(high - TURN_MS / 8 - 0.01);
    for (; k < 200; k++) r.push(k, 50 + k * TURN_MS);
    expect(r.marginMs).toBe(0);
    expect(r.B).toBe(1);
    expect(r.B).toBeLessThanOrEqual(MAX_B);
  });

  it('a pause or a long stall (lateness > the largest margin) never inflates the margin', () => {
    const r = new LockstepRunner<number>(0);
    let k = 0;
    for (; k < 30; k++) r.push(k, 50 + k * TURN_MS);
    // paused by vote for 20 s: the turn clock resumes 20 s late
    for (; k < 120; k++) r.push(k, 20_050 + k * TURN_MS);
    expect(r.marginMs).toBe(0);
    // and the turns after it step on arrival
    const now = 20_050 + 119 * TURN_MS;
    expect(r.due(now).length).toBeGreaterThan(0);
  });

  it('drain: after the end every queued turn is due at once', () => {
    const r = new LockstepRunner<number>(0);
    for (let k = 0; k < 10; k++) r.push(k, k * TURN_MS + (k % 2) * 80);
    r.push(10, 10 * TURN_MS - 60);
    r.push(11, 10 * TURN_MS - 59);
    r.drain();
    const out = [r.due(800), r.due(840), r.due(880)].flat();
    expect(out.length).toBeGreaterThan(0);
    // a new match (clear) is not draining, and a lone first turn is due on arrival
    r.clear();
    r.push(9, 2000);
    expect(r.due(2000)).toEqual([9]);
  });

  it('waiting after 500 ms of holding, never while paused by vote; a hold needs 1.5 turns without an arrival', () => {
    const r = new LockstepRunner<number>(0);
    r.due(0);
    expect(r.waiting(400)).toBe(false);
    r.due(600);
    expect(r.waiting(600)).toBe(true);
    const p = new LockstepRunner<number>(0);
    p.paused = true;
    p.due(0);
    p.due(800);
    expect(p.waiting(800)).toBe(false);
    const h = new LockstepRunner<number>(0);
    h.push(0, 1000);
    h.due(1000);
    h.due(1000 + TURN_MS);
    expect(h.holds).toBe(0);
    h.due(1000 + 2 * TURN_MS);
    expect(h.holds).toBe(1);
  });
});
