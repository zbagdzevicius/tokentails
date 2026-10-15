import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TREAT_BRIDGE_CHANNEL,
  TREAT_BRIDGE_VERSION,
  createBridgeTreatSender,
  createDirectTreatSender,
  outcomeFromResponse,
  parseOutcome,
  safeReceipt,
  type TreatSender,
} from '../treat-bridge';

// Every fetch here is a fake: no request ever leaves the test.
const API = 'https://api.example';
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('outcomeFromResponse (POST /shelter/donate/guest)', () => {
  it('maps every answer', () => {
    expect(outcomeFromResponse(200, { explorerUrl: 'https://arcscan.app/tx/0xabc' })).toEqual({ kind: 'sent', receipt: 'https://arcscan.app/tx/0xabc' });
    expect(outcomeFromResponse(200, {})).toEqual({ kind: 'sent' });
    expect(outcomeFromResponse(200, null)).toEqual({ kind: 'sent' });
    expect(outcomeFromResponse(429, { code: 'DONATE_ALREADY_TODAY' })).toEqual({ kind: 'already' });
    expect(outcomeFromResponse(429, { message: { code: 'DONATE_ALREADY_TODAY' } })).toEqual({ kind: 'already' });
    expect(outcomeFromResponse(429, {})).toEqual({ kind: 'failed' });
    expect(outcomeFromResponse(409, { code: 'DONATE_BUDGET_SPENT' })).toEqual({ kind: 'used-up' });
    expect(outcomeFromResponse(409, { code: 'DONATE_PAUSED' })).toEqual({ kind: 'paused' });
    expect(outcomeFromResponse(409, {})).toEqual({ kind: 'paused' });
    expect(outcomeFromResponse(503, null)).toEqual({ kind: 'paused' });
    expect(outcomeFromResponse(424, { code: 'DONATE_SEND_FAILED' })).toEqual({ kind: 'failed' });
    expect(outcomeFromResponse(424, null)).toEqual({ kind: 'failed' });
    expect(outcomeFromResponse(500, null)).toEqual({ kind: 'failed' });
  });

  it('only keeps an https receipt', () => {
    expect(safeReceipt('https://arcscan.app/tx/0x1')).toBe('https://arcscan.app/tx/0x1');
    for (const bad of ['http://arcscan.app/tx/0x1', 'javascript:alert(1)', 'data:text/html,x', '/shelter-payouts', '', 42, null, 'https://' + 'a'.repeat(600)]) {
      expect(safeReceipt(bad)).toBeUndefined();
    }
    expect(outcomeFromResponse(200, { explorerUrl: 'javascript:alert(1)' })).toEqual({ kind: 'sent' });
    expect(parseOutcome({ kind: 'sent', receipt: 'javascript:alert(1)' })).toEqual({ kind: 'sent' });
    expect(parseOutcome({ kind: 'nope' })).toBeNull();
    expect(parseOutcome(null)).toBeNull();
  });
});

describe('direct sender (standalone)', () => {
  it('posts once to the guest route with source heist and the chain, no credentials', async () => {
    const f = vi.fn(async () => res(200, { explorerUrl: 'https://arcscan.app/tx/0xabc' }));
    const s = createDirectTreatSender({ apiUrl: API + '/', fetch: f });
    expect(s.mode).toBe('direct');
    expect(await s.send({ chainId: 5042, cat: 'Judas' })).toEqual({ kind: 'sent', receipt: 'https://arcscan.app/tx/0xabc' });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/shelter/donate/guest`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(String(init.body))).toEqual({ source: 'heist', chainId: 5042 });
    expect((init.headers as Record<string, string>).accesstoken).toBeUndefined();
  });

  it('drops a malformed chain id', async () => {
    const f = vi.fn(async () => res(200, {}));
    const s = createDirectTreatSender({ apiUrl: API, fetch: f });
    await s.send({ chainId: -1 });
    await s.send({ chainId: 1.5 });
    for (const call of f.mock.calls as unknown as [string, RequestInit][]) expect(JSON.parse(String(call[1].body))).toEqual({ source: 'heist' });
  });

  it('reads today from the guest me route', async () => {
    const answers = [res(200, { today: { status: 'CONFIRMED' } }), res(200, { today: null }), res(200, { today: { status: 'FAILED' } }), res(500, null)];
    const f = vi.fn(async () => answers.shift()!);
    const s = createDirectTreatSender({ apiUrl: API, fetch: f });
    expect(await s.today()).toBe('sent');
    expect(await s.today()).toBe('none');
    expect(await s.today()).toBe('none');
    expect(await s.today()).toBe('unknown');
    expect((f.mock.calls as unknown as [string][])[0][0]).toBe(`${API}/shelter/donate/guest/me`);
  });

  it('a blocked request (CORS, offline) offers one retry, then unavailable', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const s = createDirectTreatSender({ apiUrl: API, fetch: f });
    expect(await s.send()).toEqual({ kind: 'failed' });
    expect(await s.send()).toEqual({ kind: 'unavailable' });
  });

  it('times out as failed', async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn((_url: string, init: { signal?: AbortSignal }) => new Promise<never>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
      const s = createDirectTreatSender({ apiUrl: API, fetch: f as never, timeoutMs: 15000 });
      const p = s.send();
      await vi.advanceTimersByTimeAsync(15001);
      expect(await p).toEqual({ kind: 'failed' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('without an API it is unavailable and never fetches', async () => {
    const f = vi.fn();
    const s = createDirectTreatSender({ apiUrl: '', fetch: f as never });
    expect(s.mode).toBe('none');
    expect(await s.send()).toEqual({ kind: 'unavailable' });
    expect(await s.today()).toBe('unknown');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('bridge sender (embedded in /heist)', () => {
  const ORIGIN = 'https://tokentails.com';
  function harness() {
    const listeners = new Set<(e: MessageEvent) => void>();
    const win = {
      addEventListener: (_: 'message', fn: (e: MessageEvent) => void) => void listeners.add(fn),
      removeEventListener: (_: 'message', fn: (e: MessageEvent) => void) => void listeners.delete(fn),
      location: { origin: ORIGIN },
    };
    const posted: Array<{ type: string; reqId?: string; origin: string; msg: Record<string, unknown> }> = [];
    const parent = { postMessage: (msg: unknown, origin: string) => void posted.push({ ...(msg as { type: string; reqId?: string }), origin, msg: msg as Record<string, unknown> }) };
    const fromHost = (data: Record<string, unknown>, source: unknown = parent, origin = ORIGIN) =>
      listeners.forEach((fn) => fn({ data: { channel: TREAT_BRIDGE_CHANNEL, v: TREAT_BRIDGE_VERSION, ...data }, source, origin } as MessageEvent));
    const fallback: TreatSender & { send: ReturnType<typeof vi.fn>; today: ReturnType<typeof vi.fn> } = {
      mode: 'direct',
      send: vi.fn(async () => ({ kind: 'sent' as const })),
      today: vi.fn(async () => 'none' as const),
    };
    return { win, parent, posted, fromHost, fallback, listeners };
  }
  afterEach(() => vi.useRealTimers());

  it('says hello, then sends through the host and maps its answer', async () => {
    const t = harness();
    const s = createBridgeTreatSender({ win: t.win, parent: t.parent, fallback: t.fallback, newId: () => 'r1' });
    expect(t.posted[0]).toMatchObject({ type: 'treat-hello', origin: ORIGIN });
    t.fromHost({ type: 'treat-ready' });
    expect(s.mode).toBe('bridge');
    const p = s.send({ chainId: 5042, cat: 'x'.repeat(100) });
    await Promise.resolve();
    const sent = t.posted.find((m) => m.type === 'treat-send')!;
    expect(sent.msg).toEqual({ channel: TREAT_BRIDGE_CHANNEL, v: 1, type: 'treat-send', reqId: 'r1', chainId: 5042, cat: 'x'.repeat(64) });
    t.fromHost({ type: 'treat-result', reqId: 'r1', outcome: { kind: 'sent', receipt: 'https://arcscan.app/tx/0x1' } });
    expect(await p).toEqual({ kind: 'sent', receipt: 'https://arcscan.app/tx/0x1' });
    expect(t.fallback.send).not.toHaveBeenCalled();
  });

  it('ignores messages from another source, origin or channel', async () => {
    vi.useFakeTimers();
    const t = harness();
    const s = createBridgeTreatSender({ win: t.win, parent: t.parent, fallback: t.fallback, helloWaitMs: 1500 });
    t.fromHost({ type: 'treat-ready' }, {});
    t.fromHost({ type: 'treat-ready' }, t.parent, 'https://evil.example');
    t.listeners.forEach((fn) => fn({ data: { channel: 'tt-heist-bridge', v: 1, type: 'treat-ready' }, source: t.parent, origin: ORIGIN } as MessageEvent));
    expect(s.mode).toBe('direct');
    const p = s.send();
    await vi.advanceTimersByTimeAsync(1600);
    expect(await p).toEqual({ kind: 'sent' });
    expect(t.fallback.send).toHaveBeenCalledTimes(1);
  });

  it('no answer to a bridge send is failed, and never falls back to a direct POST', async () => {
    vi.useFakeTimers();
    const t = harness();
    const s = createBridgeTreatSender({ win: t.win, parent: t.parent, fallback: t.fallback, answerMs: 20000 });
    t.fromHost({ type: 'treat-ready' });
    const p = s.send();
    await vi.advanceTimersByTimeAsync(20001);
    expect(await p).toEqual({ kind: 'failed' });
    expect(t.fallback.send).not.toHaveBeenCalled();
  });

  it('reads today through the host', async () => {
    const t = harness();
    const s = createBridgeTreatSender({ win: t.win, parent: t.parent, fallback: t.fallback, newId: () => 'm1' });
    t.fromHost({ type: 'treat-ready' });
    const p = s.today();
    await Promise.resolve();
    expect(t.posted.some((m) => m.type === 'treat-me' && m.reqId === 'm1')).toBe(true);
    t.fromHost({ type: 'treat-me-result', reqId: 'm1', today: 'sent' });
    expect(await p).toBe('sent');
    expect(t.fallback.today).not.toHaveBeenCalled();
  });
});
