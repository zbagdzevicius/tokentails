import { describe, expect, it } from 'vitest';
import { HostCore, clampSpeed } from '../../src/host/host-core';
import { decodeSnap, type HostMsg } from '../../src/host/protocol';
import { TickLoop } from '../../src/host/tick-loop';
import { encodeCommand } from '../../src/sim/commands';
import { Op } from '../../src/sim/api';
import { verifyReplay } from '../../src/sim/server';

const join = { t: 'join', slot: 0, hero: 'clem', trick: 'pounce', difficulty: 'easy', seed: 1234 } as const;

describe('HostCore', () => {
  it('welcomes with the seed, the human slot and bot picks from the seed', () => {
    const h = new HostCore();
    const w = h.join(join);
    expect(w.seed).toBe(1234);
    expect(w.slot).toBe(0);
    expect(w.team).toBe(0);
    expect(w.picks).toHaveLength(6);
    expect(w.picks[0]).toBe('clem');
    expect(new HostCore().join(join).picks).toEqual(w.picks);
  });

  it('advance emits one snap per call and decodes back to the team-0 view', () => {
    const h = new HostCore();
    h.join(join);
    const out = h.advance(5);
    const snaps = out.filter((m) => m.t === 'snap');
    expect(snaps).toHaveLength(1);
    const s = decodeSnap((snaps[0] as Extract<HostMsg, { t: 'snap' }>).buf);
    expect(s.team).toBe(0);
    expect(s.clock.tick).toBe(5);
    expect(s.entities.some((e) => e.id === 0 && e.kind === 'hero')).toBe(true);
  });

  it('drops malformed command bytes', () => {
    const h = new HostCore();
    h.join(join);
    expect(h.command(new Uint8Array([0xee, 1, 2]))).toBe(false);
    expect(h.command(encodeCommand({ op: Op.Move, x: 20000, y: 30000 }))).toBe(true);
  });

  it('two hosts fed the same commands produce identical message streams', () => {
    const run = (): string[] => {
      const h = new HostCore();
      h.join(join);
      const out: string[] = [];
      for (let i = 0; i < 40; i++) {
        if (i % 7 === 0) h.command(encodeCommand({ op: Op.Move, x: 12000 + i * 500, y: 30000 }));
        for (const m of h.advance(3)) out.push(m.t === 'snap' ? Buffer.from(m.buf).toString('base64') : JSON.stringify(m));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('a full match ends once, with a replay that verifies', () => {
    const h = new HostCore();
    h.join({ ...join, seed: 7 });
    h.command(encodeCommand({ op: Op.Move, x: 30000, y: 30000 }));
    let end: Extract<HostMsg, { t: 'end' }> | null = null;
    let ends = 0;
    for (let i = 0; i < 2000 && !h.ended; i++) {
      for (const m of h.advance(30)) if (m.t === 'end') {
        end = m;
        ends++;
      }
    }
    expect(ends).toBe(1);
    expect(end).not.toBeNull();
    expect(h.advance(5)).toEqual([]);
    const v = verifyReplay(end!.replay);
    expect(v.ok).toBe(true);
  }, 30_000);

  it('clamps speed to 1..64', () => {
    expect(clampSpeed(undefined)).toBe(1);
    expect(clampSpeed(0)).toBe(1);
    expect(clampSpeed(5.4)).toBe(5);
    expect(clampSpeed(1000)).toBe(64);
  });
});

describe('TickLoop', () => {
  it('runs 30 ticks a wall second, pauses, and drops a long backlog', () => {
    let now = 0;
    const timers: (() => void)[] = [];
    const posts: HostMsg[] = [];
    const loop = new TickLoop({ now: () => now, setTimer: (fn) => timers.push(fn), clearTimer: () => (timers.length = 0), post: (m) => posts.push(m) });
    loop.handle({ ...join });
    expect(posts[0].t).toBe('welcome');
    const fire = (): void => {
      const t = timers.shift();
      t?.();
    };
    now = 1000;
    fire();
    expect(loop.core.tick).toBe(10); // capped catch-up (MAX_CATCHUP)
    now = 1100;
    fire();
    expect(loop.core.tick).toBe(13);
    loop.handle({ t: 'pause', paused: true });
    now = 5000;
    fire();
    expect(loop.core.tick).toBe(13);
    loop.handle({ t: 'pause', paused: false });
    now = 5100;
    fire();
    expect(loop.core.tick).toBe(16);
  });
});
