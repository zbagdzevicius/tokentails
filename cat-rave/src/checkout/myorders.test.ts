import { describe, expect, it } from 'vitest';
import { MY_ORDERS_KEY, MY_ORDERS_MAX, addMyOrder, forgetMyOrder, readMyOrderIds, readMyOrders } from './myorders';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const id = (n: number) => `rv_${n.toString(16).padStart(16, '0')}`;

describe('myorders', () => {
  it('adds newest first, dedupes, caps', () => {
    const s = mem();
    for (let i = 1; i <= MY_ORDERS_MAX + 5; i += 1) addMyOrder(id(i), i, s);
    addMyOrder(id(3), 999, s);
    const ids = readMyOrderIds(s);
    expect(ids[0]).toBe(id(3));
    expect(ids).toHaveLength(MY_ORDERS_MAX);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('ignores junk ids and junk storage', () => {
    const s = mem();
    addMyOrder('<script>', 1, s);
    expect(readMyOrders(s)).toEqual([]);
    s.setItem(MY_ORDERS_KEY, '{not json');
    expect(readMyOrders(s)).toEqual([]);
    s.setItem(MY_ORDERS_KEY, JSON.stringify([{ orderId: 'x', at: 1 }, { orderId: id(1), at: 2 }]));
    expect(readMyOrderIds(s)).toEqual([id(1)]);
  });
  it('survives storage that throws or is missing', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readMyOrders(bad)).toEqual([]);
    expect(addMyOrder(id(1), 1, bad)).toEqual([{ orderId: id(1), at: 1 }]);
    expect(readMyOrders(null)).toEqual([]);
  });
  it('forgets one order', () => {
    const s = mem();
    addMyOrder(id(1), 1, s);
    addMyOrder(id(2), 2, s);
    forgetMyOrder(id(1), s);
    expect(readMyOrderIds(s)).toEqual([id(2)]);
  });
});
