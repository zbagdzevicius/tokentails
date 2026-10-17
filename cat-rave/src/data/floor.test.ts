import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayoutDiff, PayoutSnapshot } from '../types';
import { buildSnapshot, stripMemo, type RawPayoutEvent } from './index';
import { createFloor } from './floor';
import { createRaveOrders, type FeedLike } from './rave-orders';

const HEX = 'abcdef0123456789';
const OID = `rv_${HEX}`;
const usd18 = (usd: string) => (BigInt(Math.round(Number(usd) * 1e6)) * 10n ** 12n).toString();
const tx = (i: number) => `0x${i.toString(16).padStart(64, '0')}`;
const NOW_S = 2_000_000_000;
const ev = (i: number, usd: string, extra: Partial<RawPayoutEvent> = {}): RawPayoutEvent => ({
  chainId: 5042, txHash: tx(i), logIndex: 0, timestamp: NOW_S - 10_000 + i, symbol: 'USDC', amount18: usd18(usd), source: 'treat', ...extra,
});
const snap = (events: RawPayoutEvent[]): PayoutSnapshot =>
  buildSnapshot({ asOf: new Date(NOW_S * 1000).toISOString(), events: events.map(stripMemo) }, { origin: 'live', demoCats: null });
function fakeFeed(initial: PayoutSnapshot) {
  let current = initial;
  const subs = new Set<(s: PayoutSnapshot, d: PayoutDiff) => void>();
  return {
    get current() {
      return current;
    },
    subscribe(cb: (s: PayoutSnapshot, d: PayoutDiff) => void) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    refresh: vi.fn(async () => current),
    set(s: PayoutSnapshot) {
      current = s;
      for (const cb of subs) cb(s, { newPayouts: [], newCats: [] });
    },
  } as FeedLike & { set(s: PayoutSnapshot): void };
}
const paidOrder = { orderId: OID, cats: 5, names: ['Mochi', 'Pixel', 'Noodle', 'Bean', 'Tofu'], status: 'paid', method: 'card', createdAt: new Date(NOW_S * 1000).toISOString() };

describe('createFloor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_S * 1000);
  });
  afterEach(() => vi.useRealTimers());

  it('re-applying a floored snapshot does not add the ahead cats twice', () => {
    const feed = fakeFeed(snap([ev(1, '0.37')]));
    const orders = createRaveOrders({ api: null, feed, visibility: null });
    orders.track(paidOrder, 'paid');
    const floor = createFloor(orders);
    const once = floor.apply(feed.current!);
    const twice = floor.apply(once.snapshot);
    expect(once.snapshot.catList).toHaveLength(5);
    expect(twice.snapshot.catList).toHaveLength(5);
    expect(twice.snapshot.totalUsdMicro).toBe(5_370_000);
    expect(twice.fresh).toEqual([]);
    expect(floor.raw(twice.snapshot)).toBe(feed.current);
  });

  it('a treat landing while an order dances ahead is the fresh cat, not the order cat', () => {
    const feed = fakeFeed(snap([ev(1, '0.37')]));
    const orders = createRaveOrders({ api: null, feed, visibility: null });
    orders.track(paidOrder, 'paid');
    const floor = createFloor(orders);
    floor.apply(feed.current!);
    feed.set(snap([ev(1, '0.37'), ev(2, '1')]));
    const { snapshot, fresh } = floor.apply(feed.current!);
    expect(snapshot.catList).toHaveLength(6);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].payout).not.toBeNull();
    expect(fresh[0].order).toBeUndefined();
  });

  it('a newly paid order is fresh once', () => {
    const feed = fakeFeed(snap([ev(1, '2')]));
    const orders = createRaveOrders({ api: null, feed, visibility: null });
    const floor = createFloor(orders);
    expect(floor.apply(feed.current!).fresh).toEqual([]);
    orders.track(paidOrder, 'paid');
    const a = floor.apply(feed.current!);
    expect(a.fresh.map((c) => c.order?.position)).toEqual([0, 1, 2, 3, 4]);
    expect(floor.apply(feed.current!).fresh).toEqual([]);
  });
});
