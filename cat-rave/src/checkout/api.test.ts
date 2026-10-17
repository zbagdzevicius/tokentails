import { describe, expect, it, vi } from 'vitest';
import type { RaveStatusOn } from './types';
import { RaveApiError, createRaveApi, newClientKey, parseCheckout, parseOrder, parseStatus, toApiError } from './api';

const ON = {
  enabled: true,
  livemode: false,
  publishableKey: 'pk_test_abc123',
  card: true,
  usdc: { enabled: true, chains: [5042] },
  prices: { fixed: [1, 5], customMin: 10, max: 500 },
  fee: { percentBps: 290, fixedCents: 30 },
  payoutsDelayed: false,
};

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('parseStatus', () => {
  const on = (body: unknown): RaveStatusOn => {
    const st = parseStatus(body);
    if (!st.enabled) throw new Error(`expected on, got ${st.reason}`);
    return st;
  };
  it('passes a good status through', () => {
    expect(parseStatus(ON)).toEqual({ ...ON, reasons: { card: null, usdc: null } });
  });
  it('not ready, zero cap, nothing open → enabled false', () => {
    expect(parseStatus({ enabled: false, reason: 'keeper' })).toEqual({ enabled: false, reason: 'keeper' });
    expect(parseStatus(null)).toEqual({ enabled: false, reason: 'unknown' });
    expect(parseStatus({ ...ON, prices: { ...ON.prices, max: 0 } })).toEqual({ enabled: false, reason: 'cap' });
    expect(parseStatus({ ...ON, publishableKey: 'sk_live_x', usdc: { enabled: false, chains: [] } })).toEqual({ enabled: false, reason: 'stripe' });
    expect(parseStatus({ ...ON, card: false, publishableKey: undefined, usdc: { enabled: false, chains: [] }, reasons: { card: 'keeper' } })).toEqual({ enabled: false, reason: 'keeper' });
  });
  it('crypto alone opens the sheet: card false needs no publishable key', () => {
    const st = on({ ...ON, card: false, publishableKey: undefined, reasons: { card: 'stripe' } });
    expect(st.card).toBe(false);
    expect(st.publishableKey).toBeNull();
    expect(st.usdc).toEqual({ enabled: true, chains: [5042] });
    expect(st.reasons).toEqual({ card: 'stripe', usdc: null });
  });
  it('a bad key closes card only', () => {
    const st = on({ ...ON, publishableKey: 'sk_live_x' });
    expect(st).toMatchObject({ card: false, publishableKey: null, reasons: { card: 'stripe', usdc: null } });
  });
  it('card alone opens the sheet; usdc is off without chains', () => {
    const st = on({ ...ON, usdc: { enabled: true, chains: [] } });
    expect(st.card).toBe(true);
    expect(st.usdc.enabled).toBe(false);
    expect(st.reasons.usdc).toBe('off');
  });
  it('crypto is Arc only: other chains are dropped, a non-Arc list closes crypto', () => {
    expect(on({ ...ON, usdc: { enabled: true, chains: [8453, 5042, 42161, 5042002] } }).usdc.chains).toEqual([5042, 5042002]);
    const st = on({ ...ON, usdc: { enabled: true, chains: [8453, 42161] } });
    expect(st.usdc).toEqual({ enabled: false, chains: [] });
    expect(st.reasons.usdc).toBe('chain');
  });
});

describe('parse answers', () => {
  it('keeps only a well-formed client secret and memo', () => {
    const a = parseCheckout({ orderId: 'rv_3f9a0c1b7e2d4a65', clientSecret: 'pi_123_secret_abc', amountCents: 546, donationCents: 500, feeCents: 46, cats: 5, names: ['Mochi'], x: 'someone' });
    expect(a.clientSecret).toBe('pi_123_secret_abc');
    expect(parseCheckout({ orderId: 'rv_3f9a0c1b7e2d4a65', clientSecret: 'javascript:1' }).clientSecret).toBeNull();
    expect(parseCheckout({ orderId: 'rv_3f9a0c1b7e2d4a65', memo: 'tt:rave:3f9a0c1b7e2d4a65' }).memo).toBe('tt:rave:3f9a0c1b7e2d4a65');
    expect(parseCheckout({ orderId: 'rv_3f9a0c1b7e2d4a65', memo: 'tt:wallet:1' }).memo).toBeUndefined();
    expect(() => parseCheckout({ orderId: 'nope' })).toThrow(RaveApiError);
  });
  it('drops unknown statuses and bad tx hashes', () => {
    expect(parseOrder({ orderId: 'rv_3f9a0c1b7e2d4a65', status: 'weird', cats: 1 })).toBeNull();
    const o = parseOrder({ orderId: 'rv_3f9a0c1b7e2d4a65', status: 'onchain', cats: 2, names: ['A', 3], payoutTx: '0x12' });
    expect(o).toMatchObject({ status: 'onchain', cats: 2, names: ['A'], payoutTx: null });
  });
});

describe('errors', () => {
  it('reads Nest error bodies with fields', () => {
    const e = toApiError(400, { statusCode: 400, code: 'RAVE_NAME', message: 'x', fields: [{ index: 0, code: 'NAME_BLOCKED' }, { index: 'rest', code: 'NAME_CHARS' }, { index: 'z', code: 1 }] });
    expect(e.code).toBe('RAVE_NAME');
    expect(e.fields).toEqual([{ index: 0, code: 'NAME_BLOCKED' }, { index: 'rest', code: 'NAME_CHARS' }]);
    expect(toApiError(429, {}).code).toBe('THROTTLED');
    // Backend shape for a refused X handle: the sub-code rides in `fieldCode`.
    const xe = toApiError(400, { statusCode: 400, code: 'RAVE_X_HANDLE', message: 'That X handle is not allowed', fieldCode: 'X_HANDLE_BLOCKED' });
    expect(xe.code).toBe('RAVE_X_HANDLE');
    expect(xe.fieldCode).toBe('X_HANDLE_BLOCKED');
    expect(toApiError(400, { code: 'RAVE_NAME' }).fieldCode).toBeNull();
    expect(toApiError(503, { code: 'RAVE_CAP' }).message).toMatch(/quota/);
  });
});

describe('createRaveApi', () => {
  it('status never throws (network down → off)', async () => {
    const api = createRaveApi({ base: 'https://api.example', fetchFn: vi.fn().mockRejectedValue(new TypeError('x')) });
    expect(await api.status()).toEqual({ enabled: false, reason: 'unreachable' });
  });
  it('posts checkout as JSON without credentials', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, { orderId: 'rv_3f9a0c1b7e2d4a65', clientSecret: 'pi_1_secret_2', cats: 5 }));
    const api = createRaveApi({ base: 'https://api.example/', fetchFn });
    await api.checkout({ cats: 5, method: 'card', coverFee: true, names: [], restName: '', x: '', clientKey: 'k' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.example/rave/checkout');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body)).toMatchObject({ cats: 5, method: 'card' });
  });
  it('throws a RaveApiError with the code', async () => {
    const api = createRaveApi({ base: 'https://api.example', fetchFn: vi.fn().mockResolvedValue(res(400, { code: 'RAVE_X_HANDLE' })) });
    await expect(api.checkout({ cats: 5, method: 'card', coverFee: true, names: [], restName: '', x: 'a.b', clientKey: 'k' })).rejects.toMatchObject({ code: 'RAVE_X_HANDLE', status: 400 });
  });
  it('order: 404 → null, bad id never fetched', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(404, {}));
    const api = createRaveApi({ base: 'https://api.example', fetchFn });
    expect(await api.order('rv_3f9a0c1b7e2d4a65')).toBeNull();
    expect(await api.order('../admin')).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('usdc-tx validates the hash before sending', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, { orderId: 'rv_3f9a0c1b7e2d4a65', status: 'pending', cats: 5 }));
    const api = createRaveApi({ base: 'https://api.example', fetchFn });
    await expect(api.usdcTx('rv_3f9a0c1b7e2d4a65', 8453, '0x12')).rejects.toBeInstanceOf(RaveApiError);
    const tx = '0x' + 'ab'.repeat(32);
    expect(await api.usdcTx('rv_3f9a0c1b7e2d4a65', 8453, tx)).toMatchObject({ status: 'pending' });
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.example/rave/orders/rv_3f9a0c1b7e2d4a65/usdc-tx');
  });
  it('makes UUID client keys', () => {
    expect(newClientKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('parseStatus with the backend shape', () => {
  it('reads cardReason (and reasons) so the buyer sees why card is closed', () => {
    const body = {
      enabled: true,
      livemode: true,
      card: false,
      cardReason: 'keeper',
      usdc: { enabled: true, chains: [5042] },
      prices: { fixed: [1, 5], customMin: 10, max: 100 },
      fee: { percentBps: 290, fixedCents: 30 },
    };
    const s = parseStatus(body);
    expect(s.enabled && s.reasons.card).toBe('keeper');
    const s2 = parseStatus({ ...body, cardReason: undefined, reasons: { card: 'cap' } });
    expect(s2.enabled && s2.reasons.card).toBe('cap');
  });
});
