import { describe, expect, it } from 'vitest';
import { DISBURSED_TOPIC, INDEX_STALE_MS, fetchShelterPayouts, indexedFor } from '../payouts';

// The modal reads the backend's payout index (GET /shelter/payouts) first and only the blocks after
// its indexedThrough from the chain; a stale or unreachable index falls back to the chain scan.
const SPLIT = '0x' + 'ab'.repeat(20);
const SHELTER = '0x' + 'e2'.repeat(20);
const API = 'https://api.test';
const NOW = Date.parse('2026-10-08T12:00:00Z');
const T = Math.floor(NOW / 1000);
const hash = (n: number) => '0x' + n.toString(16).padStart(64, '0');
const word = (n: bigint) => '0x' + n.toString(16).padStart(64, '0') + '0'.repeat(64);
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });

const event = (block: number, amount: bigint, tx: number) => ({
  chainId: 42161, contract: SPLIT, txHash: hash(tx), logIndex: 0, blockNumber: block, timestamp: T - 300,
  shelter: SHELTER, kind: 'token', amount: String(amount), decimals: 6, symbol: 'USDC', amount18: String(amount * 10n ** 12n), memo: 'tt:page:0000abcd',
});
const index = (time: number, events = [event(900, 1_000_000n, 1), event(950, 2_000_000n, 2)]) => ({
  network: 'mainnet', contracts: [{ chainId: 42161, contract: SPLIT, count: events.length, indexedThrough: { block: 1000, time, at: null } }], events, nextCursor: null,
});

function fake(indexAnswer: () => Response | Promise<Response>) {
  const calls: { url: string; method?: string; params?: any[] }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (url === '/d.json') return json([{ chainId: 42161, address: SPLIT, tx: hash(99), network: 'mainnet' }]);
    if (url.startsWith(API)) {
      calls.push({ url });
      return indexAnswer();
    }
    const body = JSON.parse(String(init?.body));
    calls.push({ url, method: body.method, params: body.params });
    if (body.method === 'eth_getTransactionReceipt') return json({ result: { blockNumber: '0x64' } });
    if (body.method === 'eth_getBlockByNumber') return json({ result: { timestamp: '0x' + (T - 5).toString(16) } });
    if (body.method === 'eth_getLogs') {
      return json({ result: [{ topics: [DISBURSED_TOPIC, '0x' + '0'.repeat(24) + SHELTER.slice(2)], data: word(3_000_000n), blockNumber: '0x3ed', transactionHash: hash(3) }] });
    }
    return json({ result: '0x400' });
  }) as typeof fetch;
  return { f, calls };
}

describe('payout index in the Heist', () => {
  it('reads the index plus only the blocks after indexedThrough', async () => {
    const { f, calls } = fake(() => json(index(T - 60)));
    const out = await fetchShelterPayouts('/d.json', f, 8000, { apiUrl: API, nowMs: NOW });
    expect(out.status).toBe('ok');
    expect(out.totals.get('USDC')).toBe(6n * 10n ** 18n);
    expect(out.chains[0]).toMatchObject({ ok: true, count: 3 });
    expect(out.payouts.map((p) => p.block)).toEqual([1005, 950, 900]);
    expect(out.payouts.find((p) => p.block === 950)?.time).toBe(T - 300);
    const getLogs = calls.filter((c) => c.method === 'eth_getLogs');
    expect(getLogs).toHaveLength(1);
    expect(getLogs[0].params?.[0].fromBlock).toBe('0x3e9');
    expect(calls.some((c) => c.method === 'eth_getTransactionReceipt')).toBe(false);
  });

  it('times the payouts newer than the index, so they sort first across chains', async () => {
    const { f } = fake(() => json(index(T - 60)));
    const out = await fetchShelterPayouts('/d.json', f, 8000, { apiUrl: API, nowMs: NOW, times: true });
    expect(out.payouts.find((p) => p.block === 1005)?.time).toBe(T - 5);
    expect(out.payouts[0].block).toBe(1005);
  });

  it('keeps the index when the newest blocks cannot be read', async () => {
    const { f } = fake(() => json(index(T - 60)));
    const failing = (async (url: string, init?: RequestInit) => (String(url).includes('arb1') ? new Response('down', { status: 500 }) : f(url, init))) as typeof fetch;
    const out = await fetchShelterPayouts('/d.json', failing, 8000, { apiUrl: API, nowMs: NOW });
    expect(out.chains[0].ok).toBe(true);
    expect(out.totals.get('USDC')).toBe(3n * 10n ** 18n);
  });

  it.each([
    ['stale', () => json(index(T - INDEX_STALE_MS / 1000 - 60))],
    ['refused (409)', () => json({ code: 'PAYOUTS_NOT_INDEXED' }, 409)],
    ['unreachable', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('reads the chain from the deploy block when the index is %s', async (_label, answer) => {
    const { f, calls } = fake(answer);
    const out = await fetchShelterPayouts('/d.json', f, 8000, { apiUrl: API, nowMs: NOW });
    expect(out.totals.get('USDC')).toBe(3n * 10n ** 18n);
    expect(calls.find((c) => c.method === 'eth_getLogs')?.params?.[0].fromBlock).toBe('0x64');
  });

  it('never asks the backend without an API URL', async () => {
    const { f, calls } = fake(() => json(index(T)));
    await fetchShelterPayouts('/d.json', f, 8000, { nowMs: NOW });
    expect(calls.some((c) => c.url.startsWith(API))).toBe(false);
  });

  it('refuses an index whose list is shorter than its count', () => {
    const body = index(T);
    body.contracts[0].count = 5;
    expect(indexedFor(body as never, 42161, SPLIT, NOW)).toBeNull();
    body.contracts[0].count = 2;
    expect(indexedFor(body as never, 42161, SPLIT.toUpperCase().replace('0X', '0x'), NOW)?.through).toBe(1000);
  });
});
