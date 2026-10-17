import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayoutDiff, PayoutSnapshot } from '../types';
import { buildSnapshot, normalizeEvent, raveOrderIdFromMemo, raveOrderIdOf, sourceOf, stripMemo, SOURCE_LABEL, type RawPayoutEvent } from './index';
import {
  catNameAt,
  cleanXHandle,
  createRaveOrders,
  FEED_REFRESH_AFTER_ONCHAIN_MS,
  indexRaveCats,
  ORDERS_FAST_FOR_MS,
  ORDERS_FAST_MS,
  parseOrder,
  shoutoutText,
  xUrlOf,
  type FeedLike,
  type NameShoutout,
} from './rave-orders';

const HEX = 'abcdef0123456789';
const HEX2 = '0123456789abcdef';
const OID = `rv_${HEX}`;
const OID2 = `rv_${HEX2}`;
const usd18 = (usd: string) => (BigInt(Math.round(Number(usd) * 1e6)) * 10n ** 12n).toString();
const tx = (i: number) => `0x${i.toString(16).padStart(64, '0')}`;
const NOW_S = 2_000_000_000;
const ev = (i: number, usd: string, extra: Partial<RawPayoutEvent> = {}): RawPayoutEvent => ({
  chainId: 5042,
  txHash: tx(i),
  logIndex: 0,
  timestamp: NOW_S - 10_000 + i,
  symbol: 'USDC',
  amount18: usd18(usd),
  source: 'treat',
  ...extra,
});
const snap = (events: RawPayoutEvent[], origin: 'live' | 'snapshot' = 'live', demoCats: number | null = null): PayoutSnapshot =>
  buildSnapshot({ asOf: new Date(NOW_S * 1000).toISOString(), events: events.map(stripMemo) }, { origin, demoCats });

const order = (extra: Record<string, unknown> = {}) => ({
  orderId: OID,
  cats: 5,
  names: ['Mochi', 'Pixel', 'Noodle', 'Bean', 'Tofu'],
  x: 'someone',
  status: 'paid',
  method: 'card',
  createdAt: new Date(NOW_S * 1000 - 60_000).toISOString(),
  ...extra,
});

function fakeFeed(initial: PayoutSnapshot): FeedLike & { set(s: PayoutSnapshot): void; refresh: ReturnType<typeof vi.fn> } {
  let current = initial;
  const subs = new Set<(s: PayoutSnapshot, d: PayoutDiff) => void>();
  return {
    get current() {
      return current;
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    refresh: vi.fn(async () => current),
    set(s) {
      current = s;
      for (const cb of subs) cb(s, { newPayouts: [], newCats: [] });
    },
  };
}

type Route = (url: string) => { status: number; body: unknown };
function fakeFetch(route: Route) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    const r = route(url);
    return { status: r.status, json: async () => r.body } as unknown as Response;
  });
  return { fn, calls };
}

describe('rave memos in the payout feed', () => {
  it('parses tt:rave:<16 hex> (also a Tempo bytes32 with trailing NULs) and nothing else', () => {
    expect(raveOrderIdFromMemo(`tt:rave:${HEX}`)).toBe(OID);
    expect(raveOrderIdFromMemo(`tt:rave:${HEX}\u0000\u0000\u0000`)).toBe(OID);
    expect(raveOrderIdFromMemo(`tt:rave:${HEX}x`)).toBeNull();
    expect(raveOrderIdFromMemo('tt:rave:short')).toBeNull();
    expect(raveOrderIdFromMemo(`tt:cat:${HEX}`)).toBeNull();
    expect(sourceOf(`tt:rave:${HEX}`)).toBe('rave');
    expect(SOURCE_LABEL.rave).toBe('Moon Rave cat');
  });

  it('keeps only the public order id when stripping the memo', () => {
    const s = stripMemo({ ...ev(1, '5'), source: undefined, memo: `tt:rave:${HEX}` });
    expect(s).toMatchObject({ source: 'rave', raveOrderId: OID });
    expect('memo' in s).toBe(false);
    const p = normalizeEvent(s)!;
    expect(p.source).toBe('rave');
    expect(raveOrderIdOf(p)).toBe(OID);
    // A forged id in a bundle is ignored.
    expect(normalizeEvent({ ...ev(2, '1'), raveOrderId: 'rv_<script>' })!.source).toBe('treat');
  });

  it('a rave payout follows the floor(total) rule and is counted once', () => {
    const s = snap([ev(1, '0.37'), { ...ev(2, '5'), memo: `tt:rave:${HEX}` }, { ...ev(2, '5'), memo: `tt:rave:${HEX}` }]);
    expect(s.realCats).toBe(5);
    expect(s.totalUsdMicro).toBe(5_370_000);
    const idx = indexRaveCats(s);
    expect(idx.catsByOrder.get(OID)!.map((c) => c.index)).toEqual([0, 1, 2, 3, 4]);
    expect([...idx.byCat.values()].map((v) => v.position)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('order parsing and names', () => {
  it('expands names: fields first, then "Rest 11", "Rest 12"', () => {
    const o = parseOrder(order({ cats: 12, names: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11-dropped'], restName: 'Disco' }))!;
    expect(o.names).toHaveLength(10);
    expect(catNameAt(o, 0)).toBe('A1');
    expect(catNameAt(o, 9)).toBe('A10');
    expect(catNameAt(o, 10)).toBe('Disco 11');
    expect(catNameAt(o, 11)).toBe('Disco 12');
    expect(catNameAt(o, 12)).toBeNull();
  });

  it('re-checks names and handles for display; refuses bad ids, statuses and amounts', () => {
    const o = parseOrder(order({ names: ['ok', 'x'.repeat(17), 'bad\u0007', 5, '  Spaced   Out '], x: 'https://evil.example' }))!;
    expect(o.names).toEqual(['ok', 'Cat 2', 'Cat 3', 'Cat 4', 'Spaced Out']);
    expect(o.x).toBeNull();
    expect(parseOrder(order({ orderId: 'rv_123' }))).toBeNull();
    expect(parseOrder(order({ status: 'canceled' }))).toBeNull();
    expect(parseOrder(order({ cats: 0 }))).toBeNull();
    expect(parseOrder(order({ cats: 2.5 }))).toBeNull();
    expect(parseOrder(order({ status: 'review' }))!.status).toBe('paid');
  });

  it('builds X links only from a checked handle', () => {
    expect(cleanXHandle('some_one1')).toBe('some_one1');
    expect(cleanXHandle('@someone')).toBeNull();
    expect(cleanXHandle('a'.repeat(16))).toBeNull();
    expect(cleanXHandle('javascript:alert(1)')).toBeNull();
    expect(xUrlOf('someone')).toBe('https://x.com/someone');
    expect(xUrlOf('x.com/evil')).toBeNull();
  });

  it('writes the DJ shout-out', () => {
    expect(shoutoutText(['Mochi'], 1, null)).toBe('Shout-out to Mochi!');
    expect(shoutoutText(['Mochi', 'Pixel'], 2, null)).toBe('Shout-out to Mochi and Pixel!');
    expect(shoutoutText(['Mochi', 'Pixel', 'Noodle'], 3, 'someone')).toBe('Shout-out to Mochi, Pixel and Noodle! Shout-out to @someone!');
    expect(shoutoutText(['Mochi', 'Pixel', 'Noodle'], 5, 'someone')).toBe('Shout-out to Mochi, Pixel and 3 more! Shout-out to @someone!');
    expect(shoutoutText([], 2, 'bad handle')).toBe('Shout-out to 2 new cats!');
  });
});

describe('createRaveOrders', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_S * 1000);
  });
  afterEach(() => vi.useRealTimers());

  const base = [ev(1, '0.37')];

  it('dances a paid order right away and shouts once; its payout landing later adds nothing', async () => {
    const feed = fakeFeed(snap(base));
    let listed: unknown[] = [order()];
    const { fn } = fakeFetch(() => ({ status: 200, body: { asOf: 'x', orders: listed } }));
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null });
    const shouts: NameShoutout[] = [];
    store.onLanded((e) => shouts.push(e));
    await store.load();

    // Paid: no hologram, five real cats ahead of the payout, named, shouted out once.
    expect(store.arriving().count).toBe(0);
    const ahead = store.aheadCats(7);
    expect(ahead.map((c) => c.index)).toEqual([7, 8, 9, 10, 11]);
    expect(ahead.every((c) => !c.demo && c.payout === null && c.order?.id === OID)).toBe(true);
    expect(store.namesForCat(ahead[1])).toEqual({ orderId: OID, position: 1, name: 'Pixel', x: 'someone', xUrl: 'https://x.com/someone', country: null });
    expect(store.recent()[0]).toMatchObject({ orderId: OID, phase: 'landed', xUrl: 'https://x.com/someone' });
    expect(shouts).toHaveLength(1);
    expect(shouts[0].text).toBe('Shout-out to Mochi, Pixel and 3 more! Shout-out to @someone!');
    expect(shouts[0].cats).toEqual([]);

    // The payout lands (block time now): its cats take the place of the ahead ones, no new shout.
    listed = [order({ status: 'onchain', chainId: 5042, payoutTx: tx(9) })];
    feed.set(snap([...base, { ...ev(9, '5', { timestamp: NOW_S - 30 }), memo: `tt:rave:${HEX}` }]));
    expect(store.aheadCats(5)).toEqual([]);
    expect(shouts).toHaveLength(1);
    expect(feed.current!.realCats).toBe(5);

    const cat = feed.current!.catList[3];
    expect(store.namesForCat(cat)).toEqual({ orderId: OID, position: 3, name: 'Bean', x: 'someone', xUrl: 'https://x.com/someone', country: null });
    expect(store.recent()[0]).toMatchObject({ orderId: OID, phase: 'landed' });

    // Re-delivery of the same snapshot / later polls never shout again.
    feed.set(snap([...base, { ...ev(9, '5', { timestamp: NOW_S - 30 }), memo: `tt:rave:${HEX}` }]));
    await store.refresh();
    expect(shouts).toHaveLength(1);
    store.dispose();
  });

  it('does not shout for orders already in the feed at load, nor for old payouts first seen on a bundle', async () => {
    const old = { ...ev(5, '3', { timestamp: NOW_S - 86_400 }), memo: `tt:rave:${HEX}` };
    const feed = fakeFeed(snap([...base, old], 'snapshot'));
    const { fn } = fakeFetch(() => ({ status: 200, body: { orders: [order({ cats: 3, names: ['A', 'B', 'C'], status: 'onchain' }), order({ orderId: OID2, cats: 1, names: ['Zed'], status: 'onchain', createdAt: new Date((NOW_S - 86_100) * 1000).toISOString() })] } }));
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null });
    const shouts: NameShoutout[] = [];
    store.onLanded((e) => shouts.push(e));
    await store.load();
    expect(shouts).toHaveLength(0);
    expect(store.namesForCat(feed.current!.catList[0])?.name).toBe('A');

    // OID2 was "arriving" against a bundle only; its day-old payout must not shout on the live swap.
    feed.set(snap([...base, old, { ...ev(6, '1', { timestamp: NOW_S - 86_000 }), memo: `tt:rave:${HEX2}` }], 'live'));
    expect(shouts).toHaveLength(0);
    expect(store.namesForCat(feed.current!.catList[3])?.name).toBe('Zed');
    store.dispose();
  });

  it('shouts an old-block payout when it was seen confirming against the live feed', async () => {
    const feed = fakeFeed(snap(base, 'live'));
    const old = new Date((NOW_S - 86_100) * 1000).toISOString();
    const { fn } = fakeFetch(() => ({ status: 200, body: { orders: [order({ orderId: OID2, cats: 1, names: ['Zed'], status: 'pending', createdAt: old })] } }));
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null });
    const shouts: NameShoutout[] = [];
    store.onLanded((e) => shouts.push(e));
    await store.load();
    expect(store.arriving().count).toBe(1);
    feed.set(snap([...base, { ...ev(6, '1', { timestamp: NOW_S - 86_000 }), memo: `tt:rave:${HEX2}` }]));
    expect(shouts.map((s) => s.text)).toEqual(['Shout-out to Zed! Shout-out to @someone!']);
    store.dispose();
  });

  it('names cats by payout tx when the memo was lost (bundle)', async () => {
    const feed = fakeFeed(snap([{ ...ev(7, '2'), source: 'gift' }]));
    const { fn } = fakeFetch(() => ({ status: 200, body: { orders: [order({ cats: 2, names: ['Kiwi', 'Mango'], status: 'onchain', chainId: 5042, payoutTx: tx(7) })] } }));
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null });
    await store.load();
    expect(store.namesForCat(feed.current!.catList[1])?.name).toBe('Mango');
    expect(store.arriving().count).toBe(0);
    store.dispose();
  });

  it('track() shows the buyer\'s order at once, polls fast for 2 min, and drops it when the server says it is gone', async () => {
    const feed = fakeFeed(snap(base));
    let own: { status: number; body: unknown } = { status: 200, body: order({ status: 'paid' }) };
    const { fn, calls } = fakeFetch((url) => (url.includes('/rave/orders/') ? own : { status: 200, body: { orders: [] } }));
    const goneIds: string[] = [];
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null, onOrderGone: (id, why) => goneIds.push(`${id}:${why}`) });
    await store.load();
    store.startPolling();
    const t = store.track({ orderId: OID, cats: 5, names: ['Mochi', 'Pixel', 'Noodle', 'Bean', 'Tofu'], x: 'someone', clientSecret: 'pi_secret' });
    expect(t).toMatchObject({ orderId: OID, mine: true, status: 'paid' });
    expect(store.arriving().count).toBe(0);
    expect(store.aheadCats(0)).toHaveLength(5);

    calls.length = 0;
    await vi.advanceTimersByTimeAsync(ORDERS_FAST_MS * 3);
    expect(calls.filter((u) => u.endsWith(`/rave/orders/${OID}`)).length).toBe(3);

    own = { status: 404, body: { code: 'NOT_FOUND' } };
    await vi.advanceTimersByTimeAsync(ORDERS_FAST_MS);
    expect(goneIds).toEqual([`${OID}:missing`]);
    expect(store.aheadCats(0)).toHaveLength(0);

    calls.length = 0;
    await vi.advanceTimersByTimeAsync(ORDERS_FAST_FOR_MS);
    const before = calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls.length).toBe(before); // back to the slow cadence
    store.dispose();
  });

  it('an own order that is still "created" is not arriving; the own GET overrides a stale public row', async () => {
    const feed = fakeFeed(snap(base));
    const { fn } = fakeFetch((url) => (url.includes('/rave/orders/') ? { status: 200, body: order({ status: 'created' }) } : { status: 200, body: { orders: [] } }));
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null, myOrders: () => [OID] });
    await store.load();
    expect(store.order(OID)?.status).toBe('created');
    expect(store.arriving().count).toBe(0);
    store.dispose();
  });

  it('re-reads the payout feed after an order turns onchain', async () => {
    const feed = fakeFeed(snap(base));
    const { fn } = fakeFetch(() => ({ status: 200, body: { orders: [order({ status: 'onchain', chainId: 5042, payoutTx: tx(9) })] } }));
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null });
    await store.load();
    expect(store.recent()[0].payoutUrl).toBe(`https://explorer.arc.io/tx/${tx(9)}`);
    await vi.advanceTimersByTimeAsync(FEED_REFRESH_AFTER_ONCHAIN_MS[1]);
    expect(feed.refresh).toHaveBeenCalledTimes(2);
    store.dispose();
  });

  it('a failed /rave/cats read leaves the feed untouched and backs off', async () => {
    const feed = fakeFeed(snap(base));
    const { fn } = fakeFetch(() => ({ status: 404, body: { message: 'Cannot GET' } }));
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null });
    await store.load();
    expect(store.lastError).toMatch(/404/);
    expect(store.arriving().count).toBe(0);
    expect(store.namesForCat(feed.current!.catList[0] ?? null)).toBeNull();
    store.dispose();
  });

  it('with no API it names nothing and fetches nothing', async () => {
    const feed = fakeFeed(snap([...base, { ...ev(9, '1'), memo: `tt:rave:${HEX}` }]));
    const { fn } = fakeFetch(() => ({ status: 200, body: {} }));
    const store = createRaveOrders({ api: null, feed, fetch: fn, visibility: null });
    await store.load();
    expect(fn).not.toHaveBeenCalled();
    expect(store.namesForCat(feed.current!.catList[0])).toMatchObject({ orderId: OID, name: null });
    store.dispose();
  });

  it('DEMO cats are never named', async () => {
    const feed = fakeFeed(snap(base, 'live', 3));
    const store = createRaveOrders({ api: null, feed, visibility: null });
    await store.load();
    expect(feed.current!.catList.every((c) => store.namesForCat(c) === null)).toBe(true);
    store.dispose();
  });
});

describe('buyer countries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_S * 1000);
  });
  afterEach(() => vi.useRealTimers());

  it('parses the order country (unknown / XX / junk → null)', () => {
    expect(parseOrder(order({ country: 'lt' }))!.country).toBe('LT');
    expect(parseOrder(order({ country: 'XX' }))!.country).toBeNull();
    expect(parseOrder(order({ country: '<b>' }))!.country).toBeNull();
    expect(parseOrder(order())!.country).toBeNull();
  });

  it('gives each rave cat its order country, ahead cats and holograms too, and builds the leaderboard', async () => {
    const OID3 = 'rv_1111111111111111';
    const feed = fakeFeed(snap([ev(1, '0.37'), { ...ev(9, '5', { timestamp: NOW_S - 30 }), memo: `tt:rave:${HEX}` }]));
    const { fn } = fakeFetch(() => ({
      status: 200,
      body: {
        orders: [
          order({ country: 'LT', status: 'onchain', chainId: 5042, payoutTx: tx(9) }),
          order({ orderId: OID2, cats: 2, names: ['Zed', 'Ari'], country: 'DE' }),
          order({ orderId: OID3, cats: 1, names: ['Nox'], status: 'pending' }),
        ],
      },
    }));
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null });
    await store.load();
    expect(store.namesForCat(feed.current!.catList[0])!.country).toBe('LT');
    expect(store.aheadCats(5).map((c) => [store.namesForCat(c)!.name, c.country])).toEqual([
      ['Zed', 'DE'],
      ['Ari', 'DE'],
    ]);
    expect(store.arrivingNames(10).map((n) => [n.name, n.country])).toEqual([['Nox', null]]);
    const b = store.countries();
    expect(b.rows.map((r) => [r.code, r.cats, r.landed])).toEqual([
      ['LT', 5, 5],
      ['DE', 2, 2],
    ]);
    expect(b.unknownCats).toBe(1);
    // The viewer's own unpaid USDC order is not on the board.
    store.track({ orderId: 'rv_1111222233334444', cats: 7, names: ['Tux'], country: 'US' }, 'pending');
    expect(store.countries().rows.map((r) => r.code)).toEqual(['LT', 'DE']);
    store.dispose();
  });

  it('a checkout answer without a country does not erase the server one', async () => {
    const feed = fakeFeed(snap([ev(1, '0.37')]));
    const { fn } = fakeFetch(() => ({ status: 200, body: { orders: [order({ country: 'FR' })] } }));
    const store = createRaveOrders({ api: 'https://api.test', feed, fetch: fn, visibility: null });
    await store.load();
    store.track({ orderId: OID, cats: 5, names: ['Mochi'] });
    expect(store.order(OID)!.country).toBe('FR');
    store.dispose();
  });
});
