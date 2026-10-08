// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DISBURSED_TOPIC, fetchShelterPayouts, loadShelterPayouts, prefetchShelterPayouts, resetShelterPayoutsCache, shelterTotalLine, totalText, type ShelterPayouts } from '../payouts';
import { createPayoutsModal, type PayoutsModal } from '../shelter-payouts';

// The "Sent to shelters" modal must not wait for the game to load, nor for the slowest chain: the
// payouts are read ahead of it (a `?payouts` link at boot, else the title), and the backend index's
// rows paint as soon as they land; the newest blocks (the RPC tail) follow in a second paint.
const SPLIT = '0x' + 'ab'.repeat(20);
const SHELTER = '0x' + 'e2'.repeat(20);
const API = 'https://api.test';
const T = Math.floor(Date.now() / 1000);
const hash = (n: number) => '0x' + n.toString(16).padStart(64, '0');
const word = (n: bigint) => '0x' + n.toString(16).padStart(64, '0') + '0'.repeat(64);
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const event = (block: number, amount: bigint, tx: number) => ({
  chainId: 42161, contract: SPLIT, txHash: hash(tx), logIndex: 0, blockNumber: block, timestamp: T - 300,
  shelter: SHELTER, kind: 'token', amount18: String(amount * 10n ** 12n), memo: 'tt:page:0000abcd',
});
const index = (time = T - 60) => ({
  network: 'mainnet',
  contracts: [{ chainId: 42161, contract: SPLIT, count: 2, indexedThrough: { block: 1000, time, at: null } }],
  events: [event(900, 1_000_000n, 1), event(950, 2_000_000n, 2)],
  nextCursor: null,
});

/**
 * A fake network: the list, the index and the RPC each answer when the test says so (`hold`), so the
 * order of the reads can be checked. Every request is logged in `calls`.
 */
function network(opts: { indexBody?: () => unknown; holdList?: boolean; holdLogs?: boolean } = {}) {
  const calls: string[] = [];
  const list = deferred<void>();
  const logs = deferred<void>();
  if (!opts.holdList) list.resolve();
  if (!opts.holdLogs) logs.resolve();
  const f = (async (url: string, init?: RequestInit) => {
    if (url === '/d.json') {
      calls.push('list');
      await list.promise;
      return json([{ chainId: 42161, address: SPLIT, tx: hash(99), network: 'mainnet' }]);
    }
    if (url.startsWith(API)) {
      calls.push('index');
      return json((opts.indexBody ?? index)());
    }
    const body = JSON.parse(String(init?.body));
    calls.push(body.method);
    if (body.method === 'eth_getLogs') {
      await logs.promise;
      return json({ result: [{ topics: [DISBURSED_TOPIC, '0x' + '0'.repeat(24) + SHELTER.slice(2)], data: word(3_000_000n), blockNumber: '0x3ed', transactionHash: hash(3) }] });
    }
    if (body.method === 'eth_getBlockByNumber') return json({ result: { timestamp: '0x' + (T - 5).toString(16) } });
    if (body.method === 'eth_getTransactionReceipt') return json({ result: { blockNumber: '0x64' } });
    return json({ result: '0x400' });
  }) as typeof fetch;
  return { f, calls, releaseList: () => list.resolve(), releaseLogs: () => logs.resolve() };
}

describe('early payouts read', () => {
  it('asks for the index while the list is still loading', async () => {
    const net = network({ holdList: true });
    const done = fetchShelterPayouts('/d.json', net.f, 8000, { apiUrl: API, network: 'mainnet' });
    await tick();
    // The index request does not wait for the list.
    expect([...net.calls].sort()).toEqual(['index', 'list']);
    net.releaseList();
    const out = await done;
    // One index request for the whole read: the list's contracts reuse it.
    expect(net.calls.filter((c) => c === 'index')).toHaveLength(1);
    expect(out.totals.get('USDC')).toBe(6n * 10n ** 18n);
  });

  it('hands over the index rows before the newest blocks are read, then the full read', async () => {
    const net = network({ holdLogs: true });
    const early: ShelterPayouts[] = [];
    const done = fetchShelterPayouts('/d.json', net.f, 8000, { apiUrl: API, network: 'mainnet', times: true, onIndexed: (e) => early.push(e) });
    for (let i = 0; i < 5 && !early.length; i++) await tick();
    expect(early).toHaveLength(1);
    expect(early[0]).toMatchObject({ status: 'ok', partial: true });
    expect(early[0].totals.get('USDC')).toBe(3n * 10n ** 18n);
    expect(early[0].payouts.map((p) => p.block)).toEqual([950, 900]);
    expect(early[0].payouts[0].time).toBe(T - 300);
    expect(early[0].chains[0]).toMatchObject({ ok: true, count: 2, indexed: true, name: 'Arbitrum One' });
    net.releaseLogs();
    const out = await done;
    expect(out.partial).toBeUndefined();
    expect(out.totals.get('USDC')).toBe(6n * 10n ** 18n);
    expect(early).toHaveLength(1);
  });

  it('gives no early read when the index does not cover every contract freshly', async () => {
    const net = network({ indexBody: () => index(T - 3600) });
    const early: ShelterPayouts[] = [];
    const out = await fetchShelterPayouts('/d.json', net.f, 8000, { apiUrl: API, network: 'mainnet', onIndexed: (e) => early.push(e) });
    await tick();
    expect(early).toHaveLength(0);
    // The RPC fallback still reads the chain from the deploy block.
    expect(net.calls).toContain('eth_getTransactionReceipt');
    expect(out.totals.get('USDC')).toBe(3n * 10n ** 18n);
  });
});

describe('prefetched payouts', () => {
  beforeEach(() => {
    resetShelterPayoutsCache();
    (window as unknown as { __TT_HEIST_CONFIG__?: { apiUrl: string } }).__TT_HEIST_CONFIG__ = { apiUrl: API };
  });
  afterEach(() => {
    resetShelterPayoutsCache();
    delete (window as unknown as { __TT_HEIST_CONFIG__?: unknown }).__TT_HEIST_CONFIG__;
  });

  it('shares one read, and gives a later caller the early read at once', async () => {
    const net = network({ holdLogs: true });
    loadShelterPayouts('/d.json', net.f);
    for (let i = 0; i < 5; i++) await tick();
    let early: ShelterPayouts | null = null;
    const final = loadShelterPayouts('/d.json', net.f, (e) => (early = e));
    // Synchronously: the modal paints in the same frame it opens.
    expect(early).not.toBeNull();
    expect(early!.partial).toBe(true);
    expect(net.calls.filter((c) => c === 'list')).toHaveLength(1);
    net.releaseLogs();
    expect((await final).totals.get('USDC')).toBe(6n * 10n ** 18n);
    // Once the full read is in, there is no early read to paint any more.
    let late: ShelterPayouts | null = null;
    await loadShelterPayouts('/d.json', net.f, (e) => (late = e));
    expect(late).toBeNull();
    expect(net.calls.filter((c) => c === 'list')).toHaveLength(1);
  });

  it('prefetchShelterPayouts starts the read the modal later uses', async () => {
    const calls: string[] = [];
    const real = globalThis.fetch;
    const net = network();
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push(String(url));
      return net.f(url, init);
    }) as typeof fetch;
    try {
      prefetchShelterPayouts('/d.json');
      expect(calls).toContain('/d.json');
      expect(calls.some((u) => u.startsWith(`${API}/shelter/payouts?network=mainnet`))).toBe(true);
      const before = calls.length;
      await loadShelterPayouts('/d.json');
      expect(calls.filter((u) => u === '/d.json')).toHaveLength(1);
      expect(calls.length).toBeGreaterThanOrEqual(before);
    } finally {
      globalThis.fetch = real;
    }
  });
  it('the win-screen total reuses the shared read instead of reading the chains again', async () => {
    const net = network();
    const full = await loadShelterPayouts('/d.json', net.f);
    const before = net.calls.length;
    const line = await shelterTotalLine('/d.json', net.f);
    expect(net.calls.length).toBe(before);
    expect(line).not.toBe('');
    expect(line).toBe(totalText(full.totals));
    expect(full.totals.get('USDC')).toBe(6n * 10n ** 18n);
  });

  it('a win-screen total after a failed read reads again', async () => {
    let fail = true;
    const net = network();
    const f = (async (url: string, init?: RequestInit) => {
      if (fail && url === '/d.json') return json({}, 500);
      return net.f(url, init);
    }) as typeof fetch;
    expect(await shelterTotalLine('/d.json', f)).toBe('');
    fail = false;
    expect(await shelterTotalLine('/d.json', f)).toBe(totalText(new Map([['USDC', 6n * 10n ** 18n]])));
  });

  it("the win-screen total is '' without a list", async () => {
    expect(await shelterTotalLine('')).toBe('');
  });
});

describe('payouts modal with an early read', () => {
  let root: HTMLElement;
  let modal: PayoutsModal | null = null;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => modal?.dispose());

  const row = (block: number, tx: number) => ({ chainId: 42161, chainName: 'Arbitrum One', explorer: 'https://arbiscan.io', symbol: 'USDC', amount18: 10n ** 18n, shelter: SHELTER, memo: '', tx: hash(tx), block, time: T - 60 });
  const read = (n: number, partial: boolean): ShelterPayouts => ({
    status: 'ok',
    totals: new Map([['USDC', BigInt(n) * 10n ** 18n]]),
    chains: [{ chainId: 42161, name: 'Arbitrum One', explorer: 'https://arbiscan.io', address: SPLIT, totals: new Map([['USDC', BigInt(n) * 10n ** 18n]]), count: n, ok: true, indexed: true }],
    payouts: Array.from({ length: n }, (_, i) => row(1000 - i, i + 1)),
    ...(partial ? { partial: true } : {}),
  });

  it('paints the index rows the moment it opens, then the full read', async () => {
    const full = deferred<ShelterPayouts>();
    modal = createPayoutsModal(root, {
      deploymentsUrl: '/d.json', base: '/a/', payoutsUrl: '/shelter-payouts', pinkPaw: false,
      load: (_url, onEarly) => {
        onEarly?.(read(2, true));
        return full.promise;
      },
    });
    const shown = modal.show();
    // No await: the early read is on screen in the same task the modal opened in.
    expect(modal.el.querySelectorAll('[data-testid="payout-row"]')).toHaveLength(2);
    expect(modal.el.dataset.partial).toBe('1');
    expect(modal.el.querySelector('[data-testid="payouts-source"]')?.textContent).toContain('checking the newest blocks');
    expect(modal.el.querySelector('.ch-pay-caption')?.textContent).toBe('Token Tails has sent at least this to shelters so far');
    full.resolve(read(3, false));
    await shown;
    expect(modal.el.querySelectorAll('[data-testid="payout-row"]')).toHaveLength(3);
    expect(modal.el.dataset.partial).toBeUndefined();
    expect(modal.el.querySelector('[data-testid="payouts-source"]')?.textContent).toContain('plus the newest blocks');
    expect(modal.el.querySelector('.ch-pay-caption')?.textContent).toBe('Token Tails has sent this to shelters so far');
  });

  it('ignores an early read that lands after the modal closed', async () => {
    const full = deferred<ShelterPayouts>();
    let early: ((e: ShelterPayouts) => void) | undefined;
    modal = createPayoutsModal(root, {
      deploymentsUrl: '/d.json', base: '/a/', pinkPaw: false,
      load: (_url, onEarly) => {
        early = onEarly;
        return full.promise;
      },
    });
    void modal.show();
    modal.hide();
    early?.(read(2, true));
    expect(modal.el.querySelectorAll('[data-testid="payout-row"]')).toHaveLength(0);
    full.resolve(read(3, false));
  });
});
