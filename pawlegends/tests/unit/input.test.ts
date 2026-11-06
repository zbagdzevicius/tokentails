/** Party play N5 (MULTIPLAYER.md §4.1 input.ts, B4): move coalescing and the joystick flood. */
import { describe, expect, it } from 'vitest';
import { MOVE_EVERY_MS, MoveCoalescer } from '../../src/net/input';
import { Op, type Command } from '../../src/sim/api';

function fakeEnv() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    env: {
      now: () => now,
      setTimer: (fn: () => void, ms: number) => {
        const t = { at: now + ms, fn };
        timers.push(t);
        return t;
      },
      clearTimer: (h: unknown) => {
        const i = timers.indexOf(h as never);
        if (i >= 0) timers.splice(i, 1);
      },
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) break;
        timers.shift();
        now = t.at;
        t.fn();
      }
      now = end;
    },
  };
}

describe('MoveCoalescer', () => {
  it('joystick flood: 60 Hz moves for 3 s, then release: at most 1 move per 133 ms, and the final target lands', () => {
    const f = fakeEnv();
    const sent: { at: number; cmd: Command }[] = [];
    const c = new MoveCoalescer((cmd) => sent.push({ at: f.env.now(), cmd }), f.env);
    let last: Command = { op: Op.Move, x: 0, y: 0 };
    for (let i = 0; i < 180; i++) {
      last = { op: Op.Move, x: 10_000 + i * 100, y: 20_000 + i * 50 };
      c.send(last);
      f.advance(1000 / 60);
    }
    f.advance(500);
    expect(sent[sent.length - 1].cmd).toEqual(last);
    for (let i = 1; i < sent.length; i++) expect(sent[i].at - sent[i - 1].at).toBeGreaterThanOrEqual(MOVE_EVERY_MS - 1e-6);
    expect(sent.length).toBeLessThanOrEqual(Math.ceil(3000 / MOVE_EVERY_MS) + 2);
  });

  it('never coalesces non-move commands; one replaces a pending move', () => {
    const f = fakeEnv();
    const sent: Command[] = [];
    const c = new MoveCoalescer((cmd) => sent.push(cmd), f.env);
    c.send({ op: Op.Move, x: 1, y: 1 });
    c.send({ op: Op.Move, x: 2, y: 2 });
    c.send({ op: Op.Cast, slot: 0, x: 3, y: 3, id: 255 });
    c.send({ op: Op.Stop });
    f.advance(1000);
    expect(sent.map((s) => s.op)).toEqual([Op.Move, Op.Cast, Op.Stop]);
  });
});
