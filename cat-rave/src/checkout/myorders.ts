/**
 * F-CHECKOUT: this viewer's own rave orders, kept in localStorage (per-viewer convenience only;
 * the server is the record). Every access is wrapped: storage can be missing, full, or blocked.
 */
import { ORDER_ID_RE } from './api';

export const MY_ORDERS_KEY = 'tt.rave.myorders.v1';
export const MY_ORDERS_MAX = 20;

export interface MyOrder {
  orderId: string;
  /** ms since epoch. */
  at: number;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function store(s?: StorageLike | null): StorageLike | null {
  if (s !== undefined) return s;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readMyOrders(s?: StorageLike | null): MyOrder[] {
  const st = store(s);
  if (!st) return [];
  try {
    const raw = JSON.parse(st.getItem(MY_ORDERS_KEY) || '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((o): o is MyOrder => !!o && typeof o === 'object' && ORDER_ID_RE.test(String((o as MyOrder).orderId)) && Number.isFinite((o as MyOrder).at))
      .slice(0, MY_ORDERS_MAX);
  } catch {
    return [];
  }
}

/** Newest first, de-duplicated, at most 20. Returns the new list (also when storage fails). */
export function addMyOrder(orderId: string, at = Date.now(), s?: StorageLike | null): MyOrder[] {
  if (!ORDER_ID_RE.test(orderId)) return readMyOrders(s);
  const next = [{ orderId, at }, ...readMyOrders(s).filter((o) => o.orderId !== orderId)].slice(0, MY_ORDERS_MAX);
  const st = store(s);
  try {
    st?.setItem(MY_ORDERS_KEY, JSON.stringify(next));
  } catch {
    /* private window or full storage: the order still exists server side */
  }
  return next;
}

/** Just the ids, newest first (what `createRaveOrders({ myOrders })` takes). */
export function readMyOrderIds(s?: StorageLike | null): string[] {
  return readMyOrders(s).map((o) => o.orderId);
}

/** Drops one id (the server says it is gone: 404, canceled, refunded, expired). */
export function forgetMyOrder(orderId: string, s?: StorageLike | null): MyOrder[] {
  const next = readMyOrders(s).filter((o) => o.orderId !== orderId);
  const st = store(s);
  try {
    st?.setItem(MY_ORDERS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
