/**
 * LATENCY-PLAN M1 and C2 (docs/plans/moba/LATENCY-NEXT.md): the party socket's RTT percentiles from ECHO frames, and
 * the lobby connect that opens the WebSocket while the party ticket is still being fetched.
 */
import { describe, expect, it } from 'vitest';
import { PartySocket, type SocketEnv, type SocketLike } from '../../src/net/socket';
import { encodeEcho } from '../../src/net/proto';

class FakeWs implements SocketLike {
  readyState = 0;
  binaryType = '';
  sent: (string | Uint8Array)[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  send(d: string | ArrayBufferLike | Uint8Array): void {
    this.sent.push(typeof d === 'string' ? d : new Uint8Array(d as ArrayBuffer));
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  bin(b: Uint8Array): void {
    this.onmessage?.({ data: b.buffer.slice(b.byteOffset, b.byteOffset + b.length) });
  }
  hellos(): Record<string, unknown>[] {
    return this.sent.filter((x): x is string => typeof x === 'string').map((x) => JSON.parse(x)).filter((m) => m.t === 'hello');
  }
}

function setup() {
  let now = 0;
  const sockets: FakeWs[] = [];
  const timers = new Set<{ at: number; fn: () => void }>();
  const env: SocketEnv = {
    open: () => {
      const w = new FakeWs();
      sockets.push(w);
      return w;
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.add(t);
      return t;
    },
    clearTimer: (h) => void timers.delete(h as never),
    random: () => 0.5,
  };
  const s = new PartySocket('ws://x/pawlegends/ws', { sim: 19, simHash: '0123456789abcdef', build: 'test', guestKey: 'g'.repeat(32) }, env);
  return {
    s,
    sockets,
    advance(ms: number) {
      now += ms;
      for (const t of [...timers]) if (t.at <= now) {
        timers.delete(t);
        t.fn();
      }
    },
    setNow(v: number) {
      now = v;
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('PartySocket rttStats (M1)', () => {
  it('is empty before the first ECHO', () => {
    const { s } = setup();
    expect(s.rttStats()).toEqual({ p50: 0, p95: 0, jitterP95: 0, n: 0 });
  });

  it('reports p50 and p95 of the ECHO samples (not the EWMA twice) and a jitter p95', () => {
    const f = setup();
    f.s.connect();
    f.sockets[0].open();
    // 19 fast samples and one slow one: p95 sees the tail, p50 does not
    const rtts = [...Array.from({ length: 19 }, (_, i) => 40 + (i % 5)), 220];
    for (const r of rtts) {
      f.setNow(10_000);
      f.sockets[0].bin(encodeEcho({ clientMs: 10_000 - r, serverMs: 0 }));
    }
    const st = f.s.rttStats();
    expect(st.n).toBe(20);
    expect(st.p50).toBeGreaterThanOrEqual(40);
    expect(st.p50).toBeLessThanOrEqual(44);
    expect(st.p95).toBe(220);
    expect(st.p95).not.toBe(st.p50);
    expect(st.jitterP95).toBeGreaterThan(0);
  });

  it('keeps the last 64 samples only', () => {
    const f = setup();
    f.s.connect();
    f.sockets[0].open();
    f.setNow(5000);
    for (let i = 0; i < 100; i++) f.sockets[0].bin(encodeEcho({ clientMs: 5000 - (i < 36 ? 300 : 30), serverMs: 0 }));
    const st = f.s.rttStats();
    expect(st.n).toBe(64);
    expect(st.p95).toBe(30);
  });
});
