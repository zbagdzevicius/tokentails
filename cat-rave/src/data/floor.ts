/**
 * The floor: the feed's payout cats plus the cats of paid Moon Rave orders whose payout is not in
 * the feed yet (they dance from the moment the order is paid; the payout later takes their place
 * one for one, so nothing drops in twice). DEMO snapshots stay as they are.
 *
 * `apply` accepts either a raw feed snapshot or one it returned earlier (it re-floors from the raw
 * snapshot, so ahead cats are never added twice), and reports which cats are new on the floor by
 * identity (order id + position for order cats, feed position for other payouts), so a treat that
 * lands while an order dances ahead is celebrated as itself, not as the order's last cat.
 */
import type { PayoutSnapshot, RaveCat } from '../types';

export interface FloorOrders {
  aheadCats(start: number): RaveCat[];
  namesForCat(cat: RaveCat): { orderId: string; position: number } | null;
}

export interface FloorResult {
  snapshot: PayoutSnapshot;
  /** Cats new on the floor since the previous apply (empty on the first apply and for DEMO). */
  fresh: RaveCat[];
}

export function createFloor(orders: FloorOrders) {
  const rawOf = new WeakMap<PayoutSnapshot, PayoutSnapshot>();
  let prevRawLen = -1;
  let prevAhead = new Set<string>();
  const orderKey = (id: string, position: number) => `${id}:${position}`;
  return {
    /** The feed snapshot a floored snapshot was built from (itself when it is raw). */
    raw(s: PayoutSnapshot): PayoutSnapshot {
      return rawOf.get(s) ?? s;
    },
    apply(input: PayoutSnapshot): FloorResult {
      const raw = rawOf.get(input) ?? input;
      if (raw.demo) {
        prevRawLen = -1;
        prevAhead = new Set();
        return { snapshot: raw, fresh: [] };
      }
      const ahead = orders.aheadCats(raw.catList.length);
      const n = ahead.length;
      const snapshot: PayoutSnapshot = n
        ? { ...raw, totalUsdMicro: raw.totalUsdMicro + n * 1_000_000, realCats: raw.realCats + n, cats: raw.cats + n, catList: [...raw.catList, ...ahead] }
        : raw;
      if (snapshot !== raw) rawOf.set(snapshot, raw);
      const aheadKeys = new Set(ahead.map((c) => orderKey(c.order!.id, c.order!.position)));
      const fresh: RaveCat[] = [];
      if (prevRawLen >= 0) {
        // New feed cats, except the payout of an order whose cats already danced ahead of it.
        for (const c of raw.catList.slice(prevRawLen)) {
          const name = orders.namesForCat(c);
          if (!name || !prevAhead.has(orderKey(name.orderId, name.position))) fresh.push(c);
        }
        for (const c of ahead) if (!prevAhead.has(orderKey(c.order!.id, c.order!.position))) fresh.push(c);
        fresh.sort((a, b) => a.index - b.index);
      }
      prevRawLen = raw.catList.length;
      prevAhead = aheadKeys;
      return { snapshot, fresh };
    },
  };
}
