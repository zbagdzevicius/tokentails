import { describe, expect, it } from 'vitest';
import { LocalHost, WORKER_ATTEMPTS, type HostTransport } from '../../src/host/local-host';
import type { ClientMsg } from '../../src/host/protocol';

// perf-2: a sim Worker that fails before `welcome` (its module script did not load) is retried once, then the match
// runs on the inline loop; a failure after `welcome`, or an error the sim posts itself, stays fatal.

interface FakeWorker {
  sent: ClientMsg[];
  closed: boolean;
  fail(message?: string): void;
  post(m: unknown): void;
}

function fakes(): { made: FakeWorker[]; make: (onMsg: (m: unknown) => void, onFail: (m: string) => void) => HostTransport } {
  const made: FakeWorker[] = [];
  return {
    made,
    make: (onMsg, onFail) => {
      const f: FakeWorker = { sent: [], closed: false, fail: (m = 'sim worker failed') => onFail(m), post: (m) => onMsg(m) };
      made.push(f);
      return { kind: 'worker', send: (msg) => f.sent.push(msg), close: () => (f.closed = true) };
    },
  };
}

const join = { hero: 'clem', trick: 'pounce', difficulty: 'easy', seed: 1234 } as const;

describe('LocalHost worker start fallback', () => {
  it('retries a Worker that fails before welcome, replaying join and pause', () => {
    const f = fakes();
    const host = new LocalHost({ makeWorker: f.make });
    const errors: string[] = [];
    host.listen({ error: (m) => errors.push(m) });
    host.join(join);
    host.pause(true);
    f.made[0].fail();
    expect(f.made).toHaveLength(2);
    expect(f.made[0].closed).toBe(true);
    expect(f.made[1].sent.map((m) => m.t)).toEqual(['join', 'pause']);
    expect(host.kind).toBe('worker');
    expect(host.restarts).toBe(1);
    expect(errors).toEqual([]);
  });

  it('falls back to the inline loop after the retry fails too, and the match starts', () => {
    const f = fakes();
    const host = new LocalHost({ makeWorker: f.make });
    const errors: string[] = [];
    let seed = -1;
    host.listen({ error: (m) => errors.push(m), welcome: (w) => (seed = w.seed) });
    host.join(join);
    host.pause(true);
    f.made[0].fail();
    f.made[1].fail();
    expect(f.made).toHaveLength(WORKER_ATTEMPTS);
    expect(host.kind).toBe('inline');
    expect(host.restarts).toBe(2);
    expect(seed).toBe(1234);
    expect(host.welcome?.seed).toBe(1234);
    expect(errors).toEqual([]);
    host.dispose();
  });

  it('ignores late events from a replaced Worker', () => {
    const f = fakes();
    const host = new LocalHost({ makeWorker: f.make });
    const errors: string[] = [];
    host.listen({ error: (m) => errors.push(m) });
    host.join(join);
    f.made[0].fail();
    f.made[0].fail();
    f.made[0].post({ t: 'error', message: 'stale' });
    expect(f.made).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it('stays fatal after welcome, and for errors the sim posts itself', () => {
    const f = fakes();
    const host = new LocalHost({ makeWorker: f.make });
    const errors: string[] = [];
    host.listen({ error: (m) => errors.push(m) });
    host.join(join);
    f.made[0].post({ t: 'error', message: 'boom' });
    expect(errors).toEqual(['boom']);
    expect(f.made).toHaveLength(1);
    // a real welcome from the inline loop marks the start; any later Worker failure is fatal
    const g = fakes();
    const h2 = new LocalHost({ makeWorker: g.make });
    const e2: string[] = [];
    h2.listen({ error: (m) => e2.push(m) });
    h2.join(join);
    g.made[0].fail();
    g.made[1].fail();
    expect(h2.welcome).not.toBeNull();
    h2.dispose();
    const h3 = new LocalHost({ makeWorker: g.make });
    h3.listen({ error: (m) => e2.push(m) });
    h3.join(join);
    (h3 as unknown as { welcome: unknown }).welcome = h2.welcome;
    g.made[2].fail('Uncaught Error: x');
    expect(e2).toEqual(['Uncaught Error: x']);
    expect(g.made).toHaveLength(3);
  });

  it('does nothing after dispose', () => {
    const f = fakes();
    const host = new LocalHost({ makeWorker: f.make });
    host.join(join);
    host.dispose();
    f.made[0].fail();
    expect(f.made).toHaveLength(1);
  });
});
