// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INDEX_STALE_MS, fetchShelterPayouts, type ShelterPayouts } from '../payouts';
import { createPayoutsModal, updatingLabel, type PayoutsModal } from '../shelter-payouts';

// A chain whose index is behind and whose RPC read fails keeps the index's last-known payouts and
// totals, labelled "updating" with the indexedThrough time, instead of dropping out of the totals.
const SPLIT = '0x' + 'ab'.repeat(20);
const SHELTER = '0x' + 'e2'.repeat(20);
const API = 'https://api.test';
const NOW = Date.parse('2026-10-08T12:00:00Z');
const T = Math.floor(NOW / 1000);
const hash = (n: number) => '0x' + n.toString(16).padStart(64, '0');
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });

const event = (block: number, amount: bigint, tx: number) => ({
  chainId: 42161, contract: SPLIT, txHash: hash(tx), logIndex: 0, blockNumber: block, timestamp: T - 7200,
  shelter: SHELTER, kind: 'token', amount: String(amount), decimals: 6, symbol: 'USDC', amount18: String(amount * 10n ** 12n), memo: '',
});
const index = (time: number) => ({
  network: 'mainnet', contracts: [{ chainId: 42161, contract: SPLIT, count: 2, indexedThrough: { block: 1000, time, at: null } }],
  events: [event(900, 1_000_000n, 1), event(950, 2_000_000n, 2)], nextCursor: null,
});

/** The index answers; every chain RPC call fails (rate-limited or down). */
function busyChain(body: unknown) {
  const rpcCalls: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (url === '/d.json') return json([{ chainId: 42161, address: SPLIT, tx: hash(99), network: 'mainnet' }]);
    if (url.startsWith(API)) return json(body);
    rpcCalls.push(JSON.parse(String(init?.body)).method);
    return new Response('down', { status: 503 });
  }) as typeof fetch;
  return { f, rpcCalls };
}

describe('a busy chain keeps its indexed payouts', () => {
  it.each([
    ['fresh index, tail read fails', 60],
    ['index behind (stale), full read fails', INDEX_STALE_MS / 1000 + 7200],
  ])('%s: totals and payouts stay, marked updating', async (_label, age) => {
    const { f, rpcCalls } = busyChain(index(T - age));
    const out = await fetchShelterPayouts('/d.json', f, 8000, { apiUrl: API, nowMs: NOW });
    expect(rpcCalls.length).toBeGreaterThan(0);
    expect(out.status).toBe('ok');
    expect(out.chains[0]).toMatchObject({ ok: true, count: 2, updating: { block: 1000, time: T - age } });
    expect(out.totals.get('USDC')).toBe(3n * 10n ** 18n);
    expect(out.payouts.map((p) => p.block)).toEqual([950, 900]);
  });

  it('a contract the index does not list is still dropped (and said to be) when its chain fails', async () => {
    const { f } = busyChain({ network: 'mainnet', contracts: [], events: [], nextCursor: null });
    const out = await fetchShelterPayouts('/d.json', f, 8000, { apiUrl: API, nowMs: NOW });
    expect(out.status).toBe('error');
    expect(out.chains[0].ok).toBe(false);
    expect(out.chains[0].updating).toBeUndefined();
  });

  it('a stale index whose full chain read succeeds is not marked updating', async () => {
    const f = (async (url: string, init?: RequestInit) => {
      if (url === '/d.json') return json([{ chainId: 42161, address: SPLIT, fromBlock: 100, network: 'mainnet' }]);
      if (url.startsWith(API)) return json(index(T - INDEX_STALE_MS / 1000 - 60));
      const body = JSON.parse(String(init?.body));
      return json({ jsonrpc: '2.0', id: body.id, result: body.method === 'eth_getLogs' ? [] : '0x400' });
    }) as typeof fetch;
    const out = await fetchShelterPayouts('/d.json', f, 8000, { apiUrl: API, nowMs: NOW });
    expect(out.chains[0].ok).toBe(true);
    expect(out.chains[0].updating).toBeUndefined();
  });
});

describe('payouts modal: updating label', () => {
  let root: HTMLElement;
  let modal: PayoutsModal | null = null;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => modal?.dispose());

  it('counts the last-known payouts, labels the chain subtly, and never says it could not be read', async () => {
    const chain = {
      chainId: 42161, name: 'Arbitrum One', explorer: 'https://arbiscan.io', address: SPLIT, symbol: 'USDC',
      totals: new Map([['USDC', 3n * 10n ** 18n]]), count: 2, ok: true, indexed: true, updating: { block: 1000, time: T - 7200 },
    };
    const data: ShelterPayouts = { status: 'ok', totals: new Map([['USDC', 3n * 10n ** 18n]]), chains: [chain], payouts: [] };
    modal = createPayoutsModal(root, { deploymentsUrl: '/d.json', base: '/a/', payoutsUrl: '/shelter-payouts', load: async () => data, now: () => NOW });
    await modal.show();
    expect(modal.el.querySelector('[data-testid="payouts-amount"]')?.textContent).toContain('3');
    expect(modal.el.querySelector('[data-testid="payouts-partial"]')).toBeNull();
    expect(modal.el.textContent).not.toContain('could not be read');
    const row = modal.el.querySelector('[data-testid="chain-row"]')!;
    expect(row.textContent).toContain('2 payouts');
    expect(row.querySelector('[data-testid="chain-updating"]')?.textContent).toBe('Updating · as of 2 h ago');
    expect(modal.el.querySelector('[data-testid="payouts-updating"]')?.textContent).toContain('Arbitrum One shows its indexed payouts as of 2 h ago');
    // Nothing re-reads on its own inside the open modal: the reader gets a way to check again.
    expect(modal.el.querySelector('[data-testid="payouts-retry"]')).not.toBeNull();
    expect(updatingLabel({ time: T - 300 }, NOW)).toBe('Updating · as of 5 min ago');
  });
});
