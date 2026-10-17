import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLED,
  buildSnapshot,
  catsForTxIn,
  createPayoutFeed,
  describeCat,
  diffSnapshots,
  fetchPayouts,
  findCatIn,
  findTxIn,
  formatUsd,
  MAX_DROP_INS,
  MAX_PAGES,
  normalizeEvent,
  pollDelay,
  sendTreat,
  staleChainsOf,
  stripMemo,
  toUsdMicro,
  treatStatus,
  type RawPayoutEvent,
  type SnapshotFile,
} from './index';

const E18 = 10n ** 18n;
const usd18 = (usd: string) => (BigInt(Math.round(Number(usd) * 1e6)) * 10n ** 12n).toString();
const tx = (i: number) => `0x${i.toString(16).padStart(64, '0')}`;
const ev = (i: number, usd: string, extra: Partial<RawPayoutEvent> = {}): RawPayoutEvent => ({
  chainId: 5042,
  txHash: tx(i),
  logIndex: 0,
  timestamp: 1_000 + i,
  symbol: 'USDC',
  amount18: usd18(usd),
  source: 'treat',
  ...extra,
});

describe('normalization', () => {
  it('converts every counted symbol to micro-USD, truncating', () => {
    expect(toUsdMicro('USDC', usd18('0.01'))).toBe(10_000);
    expect(toUsdMicro('USDC.e', usd18('0.1'))).toBe(100_000);
    expect(toUsdMicro('USDG', usd18('5'))).toBe(5_000_000);
    expect(toUsdMicro('EURC', usd18('0.1'))).toBe(100_000); // fixed 1:1, documented in config
    expect(toUsdMicro('USDC', '1999999999999')).toBe(1); // 1.999999999999e-6 USD truncates to 1 micro
    expect(toUsdMicro('ETH', E18.toString())).toBeNull();
    expect(toUsdMicro('MON', E18.toString())).toBeNull();
    expect(toUsdMicro('USDC', 'not-a-number')).toBeNull();
  });

  it('builds a payout with chain, explorer link, text amount and source', () => {
    const p = normalizeEvent(ev(7, '0.1', { chainId: 8453, txHash: tx(7).toUpperCase().replace('0X', '0x'), logIndex: 3 }))!;
    expect(p.id).toBe(`8453:${tx(7)}:3`);
    expect(p.chainName).toBe('Base');
    expect(p.amountText).toBe('0.1');
    expect(p.explorerTxUrl).toBe(`https://basescan.org/tx/${tx(7)}`);
    expect(p.source).toBe('treat');
  });

  it('drops unknown chains, gas coins, zero amounts and malformed hashes', () => {
    expect(normalizeEvent(ev(1, '1', { chainId: 1 }))).toBeNull();
    expect(normalizeEvent(ev(1, '1', { symbol: 'AVAX' }))).toBeNull();
    expect(normalizeEvent(ev(1, '0'))).toBeNull();
    expect(normalizeEvent(ev(1, '1', { txHash: '0xabc' }))).toBeNull();
  });

  it('reduces raw memos to labels and never keeps them', () => {
    const raw = { ...ev(1, '0.02'), source: undefined, memo: 'motored:user-51' };
    const s = stripMemo(raw);
    expect(s.source).toBe('partner');
    expect(JSON.stringify(s)).not.toMatch(/user-51/);
    expect(stripMemo({ ...raw, memo: 'tt:cat:abc' }).source).toBe('adoption');
    expect(stripMemo({ ...raw, memo: 'tt:wallet:x' }).source).toBe('wallet');
    expect(stripMemo({ ...raw, memo: null }).source).toBe('gift');
  });

  it('formats dollars and cents', () => {
    expect(formatUsd(9_970_000)).toBe('$9.97');
    expect(formatUsd(30_000, { cents: true })).toBe('3¢');
    expect(formatUsd(12_345_670_000)).toBe('$12,345.67');
  });
});

describe('cat mapping', () => {
  it('cat i is the payout that crossed dollar i, oldest first regardless of input order', () => {
    const events = [ev(3, '0.6', { timestamp: 30 }), ev(1, '0.6', { timestamp: 10 }), ev(2, '1.0', { timestamp: 20 })];
    const s = buildSnapshot({ asOf: 'x', events }, { origin: 'live' });
    // running: 0.6, 1.6 (cat 1 by tx 2), 2.2 (cat 2 by tx 3)
    expect(s.realCats).toBe(2);
    expect(s.catList[0].payout?.txHash).toBe(tx(2));
    expect(s.catList[0].completedAt).toBe(20);
    expect(s.catList[0].contributors).toBe(2);
    expect(s.catList[1].payout?.txHash).toBe(tx(3));
    expect(s.catList[1].contributors).toBe(1);
    expect(s.progressToNext).toBeCloseTo(0.2);
    expect(s.microToNext).toBe(800_000);
  });

  it('ties break by chainId then logIndex; duplicates count once', () => {
    const a = ev(1, '0.5', { timestamp: 5, chainId: 8453, logIndex: 0 });
    const b = ev(2, '0.5', { timestamp: 5, chainId: 5042, logIndex: 9 });
    const s = buildSnapshot({ asOf: 'x', events: [a, b, a, { ...a }] }, { origin: 'live' });
    expect(s.payouts).toHaveLength(2);
    expect(s.payouts[0].chainId).toBe(5042);
    expect(s.catList[0].payout?.chainId).toBe(8453);
  });

  it('per-chain totals and seeds are stable', () => {
    const s1 = buildSnapshot({ asOf: 'x', events: [ev(1, '1.5'), ev(2, '0.5', { chainId: 143 })] }, { origin: 'live' });
    const s2 = buildSnapshot({ asOf: 'x', events: [ev(2, '0.5', { chainId: 143 }), ev(1, '1.5')] }, { origin: 'live' });
    expect(s1.byChain[0]).toMatchObject({ chainId: 5042, usdMicro: 1_500_000, count: 1 });
    expect(s1.catList.map((c) => c.seed)).toEqual(s2.catList.map((c) => c.seed));
  });

  it('bundled snapshot matches its own totals and has its as-of date', () => {
    const s = buildSnapshot(BUNDLED, { origin: 'snapshot' });
    expect(Date.parse(BUNDLED.asOf)).toBeGreaterThan(Date.parse('2026-10-16T00:00:00Z'));
    const totals = (BUNDLED as unknown as { totals: { symbol: string; amount18: string }[] }).totals;
    const expected = totals.reduce((sum, t) => sum + (toUsdMicro(t.symbol, t.amount18) ?? 0), 0);
    expect(s.totalUsdMicro).toBe(expected);
    expect(s.realCats).toBeGreaterThanOrEqual(9);
  });
});

describe('find + diff', () => {
  const five = tx(0xabcdef12);
  const s = buildSnapshot({ asOf: 'x', events: [ev(1, '0.5'), { ...ev(2, '5'), txHash: five }] }, { origin: 'live' });

  it('finds by #N, N, full hash or 8-hex prefix', () => {
    expect(findCatIn(s, '#2')?.index).toBe(1);
    expect(findCatIn(s, '1')?.index).toBe(0);
    expect(findCatIn(s, '0')).toBeNull();
    expect(findCatIn(s, '99')).toBeNull();
    expect(findCatIn(s, five)?.index).toBe(0);
    expect(findCatIn(s, `0x${five.slice(2, 60)}`)?.index).toBe(0);
    expect(findCatIn(s, 'hello')).toBeNull();
  });

  it('finds the cat any payout fed, and a payout that is part of a forming cat', () => {
    // $0.5 (tx 1) + $5 (five) + $0.3 (tx 3): tx 1 fed cat #1, tx 3 feeds the forming cat #6.
    const s2 = buildSnapshot({ asOf: 'x', events: [ev(1, '0.5'), { ...ev(2, '5'), txHash: five }, ev(3, '0.3')] }, { origin: 'live' });
    expect(s2.payouts.map((p) => p.fedCat)).toEqual([0, 0, 5]);
    expect(findCatIn(s2, tx(1))?.index).toBe(0);
    expect(catsForTxIn(s2, tx(1)).map((c) => c.index)).toEqual([0]);
    expect(findCatIn(s2, tx(3))).toBeNull();
    expect(catsForTxIn(s2, tx(3))).toEqual([]);
    expect(findTxIn(s2, tx(3))).toMatchObject({ catIndex: 5, complete: false });
    expect(findTxIn(s2, tx(3))?.progress).toBeCloseTo(0.8, 6);
    expect(findTxIn(s2, tx(1))).toMatchObject({ catIndex: 0, complete: true, progress: 1 });
    expect(findCatIn(s2, 'cat 3')?.index).toBe(2);
    expect(findCatIn(s2, 'cat #3')?.index).toBe(2);
  });

  it('catsForTx returns every cat a $5 gift made', () => {
    expect(catsForTxIn(s, five).map((c) => c.index)).toEqual([0, 1, 2, 3, 4]);
    expect(catsForTxIn(s, tx(99))).toEqual([]);
  });

  it('describes a cat for the card', () => {
    const d = describeCat(s.catList[0]);
    expect(d.title).toBe('Cat #1');
    expect(d.line).toMatch(/^5 USDC on Arc · Jan 1, 1970 · free treat$/);
    expect(d.extra).toBe('made of 2 payouts');
    expect(d.url).toContain('/tx/0x');
  });

  it('diff lists new payouts and new cats only', () => {
    const prev = buildSnapshot({ asOf: 'x', events: [ev(1, '0.97')] }, { origin: 'live' });
    const next = buildSnapshot({ asOf: 'y', events: [ev(1, '0.97'), ev(2, '0.05')] }, { origin: 'live' });
    const d = diffSnapshots(prev, next);
    expect(d.newPayouts.map((p) => p.txHash)).toEqual([tx(2)]);
    expect(d.newCats.map((c) => c.index)).toEqual([0]);
    expect(diffSnapshots(next, next)).toEqual({ newPayouts: [], newCats: [] });
  });

  it('diff caps drop-ins and filters by recency; never drops demo cats', () => {
    const prev = buildSnapshot({ asOf: 'x', events: [] }, { origin: 'snapshot' });
    const next = buildSnapshot({ asOf: 'y', events: [ev(1, '100', { timestamp: 50 }), ev(2, '2', { timestamp: 500 })] }, { origin: 'live' });
    expect(diffSnapshots(prev, next).newCats).toHaveLength(MAX_DROP_INS);
    expect(diffSnapshots(prev, next, { recentSince: 400 }).newCats.map((c) => c.index)).toEqual([100, 101]);
    const demoPrev = buildSnapshot({ asOf: 'x', events: [] }, { origin: 'live', demoCats: 50 });
    const demoNext = buildSnapshot({ asOf: 'x', events: [ev(1, '3')] }, { origin: 'live', demoCats: 50 });
    expect(diffSnapshots(demoPrev, demoNext).newCats).toEqual([]);
  });
});

describe('staleness', () => {
  const at = (iso: string, failed = false) => ({ chainId: 5042, symbol: 'USDC', indexedThrough: { at: iso }, lastRunFailed: failed });
  it('flags splits behind by 15 min or with a failed run', () => {
    const asOf = Date.parse('2026-10-16T15:41:00Z');
    expect(staleChainsOf([at('2026-10-16T15:40:00Z')], asOf)).toEqual([]);
    expect(staleChainsOf([at('2026-10-16T15:20:00Z')], asOf)).toHaveLength(1);
    expect(staleChainsOf([at('2026-10-16T15:40:00Z', true)], asOf)[0]).toMatchObject({ name: 'Arc', lastRunFailed: true });
    expect(staleChainsOf([{ ...at('2026-10-08T00:00:00Z'), chainId: 1 }], asOf)).toEqual([]); // not ours
  });
});

// ---------------------------------------------------------------------------------------------
// Network: fake fetch
// ---------------------------------------------------------------------------------------------

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
function fakeFetch(handler: Handler) {
  const calls: string[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    const r = await handler(url, init);
    return { status: r.status, json: async () => r.body } as unknown as Response;
  });
  return Object.assign(f, { calls });
}

const indexBody = (events: RawPayoutEvent[], extra: Record<string, unknown> = {}) => ({
  network: 'mainnet',
  generatedAt: '2026-10-16T15:41:00.000Z',
  contracts: [{ chainId: 5042, symbol: 'USDC', indexedThrough: { at: '2026-10-16T15:40:00.000Z' }, lastRunFailed: false, count: events.length }],
  events,
  nextCursor: null,
  ...extra,
});

describe('fetchPayouts', () => {
  it('pages with the cursor and strips memos', async () => {
    const f = fakeFetch((url) =>
      url.includes('cursor=c1')
        ? { status: 200, body: indexBody([{ ...ev(1, '0.5'), source: undefined, memo: 'motored:user-1' }]) }
        : { status: 200, body: indexBody([ev(2, '0.6')], { nextCursor: 'c1' }) },
    );
    const file = await fetchPayouts('https://api.example/', f);
    expect(f.calls[0]).toBe('https://api.example/shelter/payouts?network=mainnet&limit=2000');
    expect(f.calls[1]).toContain('&cursor=c1');
    expect(file.events).toHaveLength(2);
    expect(JSON.stringify(file)).not.toMatch(/user-1/);
    expect(file.asOf).toBe('2026-10-16T15:41:00.000Z');
  });

  it('marks a read that came back short of the index count as truncated', async () => {
    const f = fakeFetch(() => ({ status: 200, body: indexBody([ev(1, '0.5')], { count: 3 }) }));
    expect((await fetchPayouts('https://api.example', f)).truncated).toBe(true);
    const full = fakeFetch(() => ({ status: 200, body: indexBody([ev(1, '0.5')], { count: 1 }) }));
    expect((await fetchPayouts('https://api.example', full)).truncated).toBeUndefined();
  });

  it('polls read only the newest pages until a known event, then merge', async () => {
    const known = [ev(3, '0.3'), ev(2, '0.2'), ev(1, '0.1')].map(stripMemo);
    // Page 0: two new events and one known; page 1 (older) must never be requested.
    const f = fakeFetch((url) =>
      url.includes('cursor=')
        ? { status: 500, body: null }
        : { status: 200, body: indexBody([ev(5, '0.5'), ev(4, '0.4'), ev(3, '0.3')], { nextCursor: 'c1', count: 5 }) },
    );
    const file = await fetchPayouts('https://api.example', f, known);
    expect(f.calls).toHaveLength(1);
    expect(file.truncated).toBeUndefined();
    expect(file.events.map((e) => e.timestamp)).toEqual([1005, 1004, 1003, 1002, 1001]);
  });

  it('falls back to one full read when the merged count disagrees with the index', async () => {
    const known = [ev(3, '0.3'), ev(2, '0.2')].map(stripMemo);
    // A lagging chain caught up: ev(1) is older than everything known, so only a full read finds it.
    const all = [ev(4, '0.4'), ev(3, '0.3'), ev(2, '0.2'), ev(1, '0.1', { chainId: 8453 })];
    const f = fakeFetch((url) =>
      url.includes('cursor=c1')
        ? { status: 200, body: indexBody(all.slice(2), { count: 4 }) }
        : { status: 200, body: indexBody(all.slice(0, 2), { nextCursor: 'c1', count: 4 }) },
    );
    const file = await fetchPayouts('https://api.example', f, known);
    expect(file.events).toHaveLength(4);
    expect(file.truncated).toBeUndefined();
    expect(f.calls.filter((u) => !u.includes('cursor='))).toHaveLength(2);
  });

  it('never caps a full read below 50 pages (the snapshot script reads 50)', () => {
    expect(MAX_PAGES).toBeGreaterThanOrEqual(50);
  });

  it('throws with the error code on 424', async () => {
    const f = fakeFetch(() => ({ status: 424, body: { code: 'PAYOUTS_INDEX_UNAVAILABLE' } }));
    await expect(fetchPayouts('https://api.example', f)).rejects.toMatchObject({ status: 424, code: 'PAYOUTS_INDEX_UNAVAILABLE' });
  });
});

describe('treat helpers', () => {
  it('status hides the button unless live with treats left', async () => {
    const live = fakeFetch(() => ({ status: 200, body: { enabled: true, railState: 'live', treatsLeftToday: 89, amountWei: '10000000000000000', chainId: 5042, resetsAt: '2026-10-17T00:00:00.000Z' } }));
    expect(await treatStatus('https://api.example', live)).toMatchObject({ live: true, amountUsdMicro: 10_000, treatsLeftToday: 89 });
    const paused = fakeFetch(() => ({ status: 200, body: { enabled: true, railState: 'paused', treatsLeftToday: 10 } }));
    expect((await treatStatus('https://api.example', paused))?.live).toBe(false);
    const down = fakeFetch(() => Promise.reject(new TypeError('cors')));
    expect(await treatStatus('https://api.example', down)).toBeNull();
  });

  it('send maps the backend codes and CORS failures', async () => {
    const ok = fakeFetch((_u, init) => {
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe('{"source":"page"}');
      return { status: 200, body: { txHash: `0x${'AB'.repeat(32)}`, chainId: 5042, amountWei: '10000000000000000', explorerUrl: 'javascript:alert(1)' } };
    });
    // The explorer link is rebuilt from our chain table, never taken from the response.
    expect(await sendTreat('https://api.example', ok)).toMatchObject({ ok: true, txHash: `0x${'ab'.repeat(32)}`, explorerUrl: `https://explorer.arc.io/tx/0x${'ab'.repeat(32)}` });
    const today = fakeFetch(() => ({ status: 429, body: { code: 'DONATE_ALREADY_TODAY', message: 'Come back tomorrow!' } }));
    expect(await sendTreat('https://api.example', today)).toMatchObject({ ok: false, reason: 'already-today' });
    const cors = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await sendTreat('https://api.example', cors)).toMatchObject({ ok: false, reason: 'blocked' });
  });
});

describe('feed', () => {
  const bundle: SnapshotFile = { asOf: '2026-10-16T15:00:00.000Z', events: [ev(1, '0.97')] };
  let clock = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    clock = Date.parse('2026-10-16T15:41:00Z');
    vi.setSystemTime(clock);
  });
  afterEach(() => vi.useRealTimers());

  const visibility = () => {
    const cbs = new Set<() => void>();
    return {
      hidden: false,
      addEventListener: (_t: 'visibilitychange', cb: () => void) => void cbs.add(cb),
      removeEventListener: (_t: 'visibilitychange', cb: () => void) => void cbs.delete(cb),
      fire() {
        for (const cb of cbs) cb();
      },
    };
  };

  it('no API: serves the bundle, never fetches', async () => {
    const f = fakeFetch(() => ({ status: 500, body: null }));
    const feed = createPayoutFeed({ api: null, demoCats: null, fetch: f, bundle, visibility: null });
    const s = await feed.load();
    expect(s.origin).toBe('snapshot');
    expect(s.realCats).toBe(0);
    feed.startPolling();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(f).not.toHaveBeenCalled();
  });

  it('fast live answer wins the load', async () => {
    const f = fakeFetch(() => ({ status: 200, body: indexBody([ev(1, '0.97'), ev(2, '0.05')]) }));
    const feed = createPayoutFeed({ api: 'https://api.example', demoCats: null, fetch: f, bundle, visibility: null });
    const s = await feed.load();
    expect(s.origin).toBe('live');
    expect(s.realCats).toBe(1);
    expect(s.stale).toBe(false);
  });

  it('slow live: load answers with the bundle, then notifies with recent cats only', async () => {
    const recent = Math.floor(clock / 1000) - 60;
    const f = fakeFetch(
      () => new Promise((r) => setTimeout(() => r({ status: 200, body: indexBody([ev(1, '0.97'), ev(2, '0.05', { timestamp: recent })]) }), 5_000)),
    );
    const feed = createPayoutFeed({ api: 'https://api.example', demoCats: null, fetch: f, bundle, visibility: null, loadWaitMs: 1_000 });
    const seen: number[][] = [];
    feed.subscribe((_s, d) => seen.push(d.newCats.map((c) => c.index)));
    const p = feed.load();
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await p).origin).toBe('snapshot');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(feed.current?.origin).toBe('live');
    expect(seen).toEqual([[0]]);
  });

  it('failure marks stale and backs off 60 → 120 → 240 → 300 s, then recovers', async () => {
    let fail = true;
    const f = fakeFetch(() => (fail ? { status: 424, body: { code: 'PAYOUTS_INDEX_UNAVAILABLE' } } : { status: 200, body: indexBody([ev(1, '1')]) }));
    const feed = createPayoutFeed({ api: 'https://api.example', demoCats: null, fetch: f, bundle, visibility: null });
    const s = await feed.load();
    expect(s.stale).toBe(true);
    expect(feed.lastError).toMatch(/424/);
    const snaps: boolean[] = [];
    feed.subscribe((n) => snaps.push(n.stale));
    feed.startPolling();
    expect(pollDelay(0)).toBe(60_000);
    expect([1, 2, 3, 9].map(pollDelay)).toEqual([120_000, 240_000, 300_000, 300_000]);
    // load failed once (failures=1). First poll: 60 s after the failed fetch.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(239_000); // failures=2 → 240 s
    expect(f).toHaveBeenCalledTimes(2);
    fail = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f).toHaveBeenCalledTimes(3);
    expect(feed.current).toMatchObject({ origin: 'live', stale: false, realCats: 1 });
    expect(snaps).toEqual([false]);
    feed.dispose();
  });

  it('a failed read after a live one stops saying live (fetchFailed), the next good read clears it', async () => {
    let fail = false;
    const f = fakeFetch(() => (fail ? Promise.reject(new TypeError('Failed to fetch')) : { status: 200, body: indexBody([ev(1, '1')]) }));
    const feed = createPayoutFeed({ api: 'https://api.example', demoCats: null, fetch: f, bundle, visibility: null });
    expect((await feed.load()).origin).toBe('live');
    fail = true;
    await feed.refresh();
    expect(feed.current).toMatchObject({ origin: 'live', stale: true, fetchFailed: true });
    fail = false;
    await feed.refresh();
    expect(feed.current?.fetchFailed).toBeUndefined();
    feed.dispose();
  });

  it('pauses while hidden and refreshes on return', async () => {
    const f = fakeFetch(() => ({ status: 200, body: indexBody([ev(1, '0.5')]) }));
    const vis = visibility();
    const feed = createPayoutFeed({ api: 'https://api.example', demoCats: null, fetch: f, bundle, visibility: vis });
    await feed.load();
    feed.startPolling();
    vis.hidden = true;
    vis.fire();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(f).toHaveBeenCalledTimes(1);
    vis.hidden = false;
    vis.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(f).toHaveBeenCalledTimes(2);
    feed.dispose();
  });

  it('a new payout crossing a dollar emits newCats; a treat goes pending until indexed', async () => {
    let events = [ev(1, '0.99')];
    const f = fakeFetch((url) => {
      if (url.endsWith('/shelter/donate/guest')) return { status: 200, body: { txHash: tx(2), chainId: 5042, amountWei: usd18('0.01') } };
      return { status: 200, body: indexBody(events) };
    });
    const feed = createPayoutFeed({ api: 'https://api.example', demoCats: null, fetch: f, bundle, visibility: null });
    await feed.load();
    const diffs: number[][] = [];
    feed.subscribe((_s, d) => diffs.push(d.newCats.map((c) => c.index)));
    const r = await feed.sendTreat();
    expect(r.ok).toBe(true);
    expect(feed.pendingUsdMicro).toBe(10_000);
    expect(feed.current?.realCats).toBe(0); // pending is never counted
    events = [ev(1, '0.99'), ev(2, '0.01')];
    await vi.advanceTimersByTimeAsync(30_000);
    expect(feed.current?.realCats).toBe(1);
    expect(diffs).toEqual([[0]]);
    expect(feed.pendingUsdMicro).toBe(0);
    expect(feed.findCat(tx(2))?.index).toBe(0);
    feed.dispose();
  });

  it('demo override is flagged and keeps the real total', async () => {
    const f = fakeFetch(() => ({ status: 200, body: indexBody([ev(1, '2.5')]) }));
    const feed = createPayoutFeed({ api: 'https://api.example', demoCats: 300, fetch: f, bundle, visibility: null });
    const s = await feed.load();
    expect(s).toMatchObject({ demo: true, cats: 300, realCats: 2, totalUsdMicro: 2_500_000 });
    expect(s.catList.filter((c) => c.demo)).toHaveLength(298);
  });
});
