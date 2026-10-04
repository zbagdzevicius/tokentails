// @vitest-environment happy-dom
// The payouts modal's "Testnet proof": its own list and per-chain totals, after the real payouts and
// never added to them; receipt links to the website; the same list and role lines as the client page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DISBURSED_TOPIC, fetchShelterPayouts, isTestnetDeployment, type ChainRow, type PayoutRow, type ShelterPayouts } from '../payouts';
import { createPayoutsModal, testnetCards, type PayoutsModal } from '../shelter-payouts';
import { PAYOUT_CHAIN_ROLES, TESTNET_CHAIN_IDS, payoutChainRole, receiptHref } from '../shelter-payouts-chains';

const E18 = 10n ** 18n;
const A = '0x' + 'ab'.repeat(20);
const B = '0x' + 'cd'.repeat(20);
const tx = (n: number) => '0x' + n.toString(16).padStart(64, '0');
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const tick = () => new Promise((r) => setTimeout(r, 0));

const row = (chainId: number, address: string, symbol: string, totals: [string, bigint][], extra: Partial<ChainRow> = {}): ChainRow => ({
  chainId, name: `Chain ${chainId}`, explorer: `https://x${chainId}.test`, address, symbol, totals: new Map(totals), count: totals.length, ok: true, ...extra,
});
const pay = (chainId: number, symbol: string, amount18: bigint, n: number, time?: number): PayoutRow => ({
  chainId, chainName: `Chain ${chainId}`, explorer: `https://x${chainId}.test`, symbol, amount18, shelter: '', memo: '', tx: tx(n), block: n, ...(time ? { time } : {}),
});

/** All seven testnets, out of order, with two contracts on Arc and Fuji and an unread Base contract. */
const testnetData = (): ShelterPayouts => ({
  status: 'ok',
  totals: new Map([['USDC', 99n * E18]]),
  chains: [
    row(46630, A, 'mUSDC', [['mUSDC', E18]]),
    row(5042002, A, 'USDC', [['USDC', 2n * E18]]),
    row(5042002, B, 'EURC', [['EURC', E18]], { proofTxs: [tx(9)] }),
    row(42431, A, 'pathUSD', [['pathUSD', 3n * E18]]),
    row(421614, A, 'USDC', [['USDC', E18], ['ETH', E18 / 1000n]]),
    row(43113, A, 'USDC', [['USDC', E18]]),
    row(43113, B, 'USDC', [['USDC', E18]]),
    row(84532, A, 'USDC', [], { ok: false, count: 0, proofTxs: [tx(7)] }),
    row(10143, A, 'USDC', [['USDC', E18], ['MON', E18 / 100n]]),
    // A mainnet row in the testnet read never becomes a card.
    row(5042, A, 'USDC', [['USDC', 50n * E18]]),
  ],
  payouts: [pay(5042002, 'USDC', E18, 3, 1_790_000_000), pay(42431, 'pathUSD', 3n * E18, 2), pay(5042002, 'EURC', E18, 1)],
});

describe('receiptHref', () => {
  it('links the website receipt for a transaction hash', () => {
    expect(receiptHref('https://tokentails.com/shelter-payouts', 84532, tx(1))).toBe(`https://tokentails.com/shelter-payouts/receipt?chain=84532&tx=${tx(1)}`);
    expect(receiptHref('/shelter-payouts/', 42431, tx(2))).toBe(`/shelter-payouts/receipt?chain=42431&tx=${tx(2)}`);
    expect(receiptHref('https://tokentails.com/shelter-payouts?x=1#y', 5042002, tx(3))).toBe(`https://tokentails.com/shelter-payouts/receipt?chain=5042002&tx=${tx(3)}`);
  });
  it('is empty without a site link or with a bad hash', () => {
    expect(receiptHref('', 84532, tx(1))).toBe('');
    expect(receiptHref('/shelter-payouts', 84532, '0x1234')).toBe('');
    expect(receiptHref('/shelter-payouts', 84532, `${tx(1)}&x=1`)).toBe('');
  });
});

describe('testnetCards', () => {
  it('groups contracts per chain in the wave order, with totals for that chain only', () => {
    const cards = testnetCards(testnetData());
    expect(cards.map((c) => c.chainId)).toEqual([5042002, 42431, 421614, 43113, 84532, 46630, 10143]);
    const arc = cards[0];
    expect(arc.name).toBe('Arc Testnet');
    expect(arc.symbols).toEqual(['USDC', 'EURC']);
    expect([...arc.totals]).toEqual([['USDC', 2n * E18], ['EURC', E18]]);
    expect(arc.payouts.map((p) => p.symbol)).toEqual(['USDC', 'EURC']);
    expect(arc.proofTxs).toEqual([tx(9)]);
    // Fuji's two USDC contracts add up within the chain; nothing from another chain or mainnet.
    expect([...cards[3].totals]).toEqual([['USDC', 2n * E18]]);
    expect(cards[3].contracts).toHaveLength(2);
    expect(cards[4]).toMatchObject({ unread: 1, count: 0, proofTxs: [tx(7)] });
    for (const c of cards) expect(c.role).toBe(payoutChainRole(c.chainId));
    expect(cards.every((c) => c.role.length > 0)).toBe(true);
  });
});

describe('fetchShelterPayouts with the testnet filter', () => {
  it('reads only the wave testnets, never a mainnet entry, and keeps the proof payouts', async () => {
    const list = [
      { chainId: 84532, address: A, network: 'testnet', proofTxs: [tx(5), 'junk'] },
      { chainId: 8453, address: B, network: 'mainnet' },
      { chainId: 421614, address: B, network: 'mainnet' },
      { chainId: 999999, address: A, network: 'testnet' },
    ];
    const asked: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      if (url === '/t.json') return json(list);
      asked.push(url);
      if (url.includes('?')) return json({ status: '1', result: [{ address: A, topics: [DISBURSED_TOPIC], data: '0x' + (10n ** 6n).toString(16).padStart(64, '0'), blockNumber: '0x5', transactionHash: tx(5) }] });
      const body = JSON.parse(String(init?.body));
      return json({ result: body.method === 'eth_blockNumber' ? '0x10' : [] });
    }) as typeof fetch;
    const r = await fetchShelterPayouts('/t.json', f, 8000, { only: isTestnetDeployment });
    expect(r.chains.map((c) => [c.chainId, c.address])).toEqual([[84532, A]]);
    expect(r.chains[0].proofTxs).toEqual([tx(5)]);
    expect(r.payouts.map((p) => p.tx)).toEqual([tx(5)]);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((u) => u.includes('sepolia'))).toBe(true);
  });
  it('isTestnetDeployment', () => {
    expect(isTestnetDeployment({ chainId: 43113, address: A })).toBe(true);
    expect(isTestnetDeployment({ chainId: 43113, address: A, network: 'mainnet' })).toBe(false);
    expect(isTestnetDeployment({ chainId: 43114, address: A, network: 'testnet' })).toBe(false);
  });
});

describe('payouts modal: testnet proof', () => {
  let root: HTMLElement;
  let modal: PayoutsModal | null = null;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    modal?.dispose();
    modal = null;
  });

  const mainnet = (): ShelterPayouts => ({
    status: 'ok',
    totals: new Map([['USDC', 5n * E18]]),
    chains: [row(42161, A, 'USDC', [['USDC', 5n * E18]], { name: 'Arbitrum One' })],
    payouts: [pay(42161, 'USDC', 5n * E18, 1)],
  });
  const make = (loadTestnet: () => Promise<ShelterPayouts>, extra: Partial<Parameters<typeof createPayoutsModal>[1]> = {}) =>
    (modal = createPayoutsModal(root, {
      deploymentsUrl: '/d.json', testnetUrl: '/t.json', base: '/a/', payoutsUrl: 'https://tokentails.com/shelter-payouts', pinkPaw: false,
      load: async () => mainnet(), loadTestnet, ...extra,
    }));

  it('comes after the real payouts, labelled, with a card per testnet and its own totals', async () => {
    const m = make(async () => testnetData());
    await m.show();
    await tick();
    const q = (s: string) => m.el.querySelector<HTMLElement>(`[data-testid="${s}"]`);
    // The real headline is the mainnet read alone.
    expect(q('payouts-amount')?.textContent).toBe('5 USDC');
    const section = q('payouts-testnet')!;
    expect(section.hidden).toBe(false);
    const boxes = [...m.el.querySelectorAll('.ch-pay-col:not(.ch-pay-side) > .ch-pay-box')].map((b) => b.getAttribute('data-testid'));
    expect(boxes.indexOf('payouts-testnet')).toBe(boxes.length - 1);
    expect(boxes.indexOf('payouts-latest')).toBeLessThan(boxes.indexOf('payouts-testnet'));
    expect(section.querySelector('h3')?.textContent).toBe('Testnet proof');
    expect(q('testnet-label')?.textContent).toMatch(/test coins.*no real money/i);
    // Base Sepolia could not be read: the count is a floor and the headline says how many contracts were read.
    expect(q('testnet-status')?.textContent).toBe('Live on 7 testnets · at least 10 test payouts on 9 contracts · 8 of 9 contracts read');
    const cards = [...section.querySelectorAll<HTMLElement>('[data-testid="testnet-card"]')];
    expect(cards.map((c) => c.dataset.chain)).toEqual(TESTNET_CHAIN_IDS.map(String));
    expect(cards[0].querySelector('h4')?.textContent).toBe('Arc Testnet');
    expect(cards[0].querySelector('.ch-pay-role')?.textContent).toBe(PAYOUT_CHAIN_ROLES.arc);
    expect(cards[0].querySelector('[data-testid="testnet-total"]')?.textContent).toBe('2 USDC + 1 EURC');
    expect([...cards[0].querySelectorAll('[data-testid="testnet-token"]')].map((t) => t.textContent)).toEqual(['USDC', 'EURC']);
    expect(cards[2].querySelector('[data-testid="testnet-total"]')?.textContent).toBe('1 USDC + 0.001 ETH');
    // Explorer and receipt links for each shown payout.
    const arcLinks = [...cards[0].querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(arcLinks).toContain(`https://explorer.testnet.arc.io/address/${A}`);
    expect(arcLinks).toContain(`https://explorer.testnet.arc.io/tx/${tx(3)}`);
    expect(arcLinks).toContain(`https://tokentails.com/shelter-payouts/receipt?chain=5042002&tx=${tx(3)}`);
    // An unread chain says so and still links its recorded proof payout.
    expect(cards[4].textContent).toContain('Could not read right now');
    expect(cards[4].querySelector('[data-testid="testnet-proof-tx"] [data-testid="testnet-receipt"]')?.getAttribute('href')).toBe(`https://tokentails.com/shelter-payouts/receipt?chain=84532&tx=${tx(7)}`);
    // The mainnet row in the testnet read never shows, and no testnet total is in the headline.
    expect(cards.some((c) => c.dataset.chain === '5042')).toBe(false);
    expect(q('payouts-amount')?.textContent).not.toMatch(/EURC|pathUSD|mUSDC/);
  });

  it('is hidden with no testnet list, with an empty list, and without a site link has no receipts', async () => {
    const off = make(async () => testnetData(), { testnetUrl: '' });
    await off.show();
    await tick();
    expect(off.el.querySelector<HTMLElement>('[data-testid="payouts-testnet"]')?.hidden).toBe(true);
    off.dispose();

    const none = make(async () => ({ status: 'empty', totals: new Map(), chains: [], payouts: [] }));
    await none.show();
    await tick();
    expect(none.el.querySelector<HTMLElement>('[data-testid="payouts-testnet"]')?.hidden).toBe(true);
    none.dispose();

    const noSite = make(async () => testnetData(), { payoutsUrl: '' });
    await noSite.show();
    await tick();
    expect(noSite.el.querySelectorAll('[data-testid="testnet-card"]')).toHaveLength(7);
    expect(noSite.el.querySelector('[data-testid="testnet-receipt"]')).toBeNull();
  });

  it('a caller with its own payouts reads no testnet unless it passes loadTestnet', async () => {
    modal = createPayoutsModal(root, { deploymentsUrl: '/d.json', testnetUrl: '/t.json', base: '/a/', pinkPaw: false, load: async () => mainnet() });
    await modal.show();
    await tick();
    expect(modal.el.querySelector<HTMLElement>('[data-testid="payouts-testnet"]')?.hidden).toBe(true);
  });

  it('shows a retry when the testnet read fails, and the real section is untouched', async () => {
    let calls = 0;
    const m = make(async () => {
      calls++;
      if (calls === 1) throw new Error('down');
      return testnetData();
    });
    await m.show();
    await tick();
    expect(m.el.querySelector('[data-testid="payouts-amount"]')?.textContent).toBe('5 USDC');
    const retry = m.el.querySelector<HTMLButtonElement>('[data-testid="testnet-retry"]');
    expect(retry).not.toBeNull();
    retry!.click();
    await tick();
    await tick();
    expect(m.el.querySelectorAll('[data-testid="testnet-card"]')).toHaveLength(7);
  });
});

describe('phone layout', () => {
  it('gives Close its own row under 720 px, so it never covers a row', () => {
    const m = createPayoutsModal(document.body, { deploymentsUrl: '', base: '/a/', load: async () => ({ status: 'empty', totals: new Map(), chains: [], payouts: [] }) });
    const css = document.getElementById('ch-pay-styles')?.textContent ?? '';
    const phone = /@media \(max-width: 719px\) \{([^}]*\{[^}]*\}[^}]*)+\}/.exec(css)?.[0] ?? '';
    expect(phone).toMatch(/\.ch-pay-close \{ position: relative;[^}]*align-self: flex-end/);
    m.dispose();
  });
});

describe('parity with the client', () => {
  const repo = join(__dirname, '../../../..');
  it('ships the same testnet list as the client page', () => {
    const heist = JSON.parse(readFileSync(join(repo, 'catnip-heist/public/payouts/testnet-deployments.json'), 'utf8'));
    const client = JSON.parse(readFileSync(join(repo, 'client/public/shelter-payouts/testnet-deployments.json'), 'utf8'));
    expect(heist).toEqual(client);
    expect(heist.every((d: { chainId: number; network?: string }) => isTestnetDeployment(d as never))).toBe(true);
    expect(new Set(heist.map((d: { chainId: number }) => d.chainId))).toEqual(new Set(TESTNET_CHAIN_IDS));
  });
  it('uses the client role lines', () => {
    const src = readFileSync(join(repo, 'client/components/shelter-payouts/chains.ts'), 'utf8');
    const block = /CHAIN_ROLES: Record<string, string> = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? '';
    const roles = Object.fromEntries([...block.matchAll(/^\s*(\w+): "((?:[^"\\]|\\.)*)",?$/gm)].map((m) => [m[1], m[2]]));
    expect(Object.keys(roles).length).toBeGreaterThanOrEqual(6);
    expect(PAYOUT_CHAIN_ROLES).toEqual(roles);
  });
});
