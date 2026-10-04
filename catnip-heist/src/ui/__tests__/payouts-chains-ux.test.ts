// @vitest-environment happy-dom
// Base's small eth_getLogs caps, Arc's 429s, token labels and the modal's per-network wording.
import { afterEach, describe, expect, it } from 'vitest';
import {
  DISBURSED_TOPIC,
  MIN_LOG_WINDOW,
  PAYOUT_CHAINS,
  deploymentUnits,
  fetchShelterPayouts,
  rangeLimitFrom,
  setPayoutsSleep,
  type ShelterPayouts,
} from '../payouts';
import { amountsText, createPayoutsModal, type PayoutsModal } from '../shelter-payouts';

const SPLIT = '0x' + 'ab'.repeat(20);
const word = (n: bigint) => '0x' + n.toString(16).padStart(64, '0') + '0'.repeat(64);
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
const E18 = 10n ** 18n;

describe('eth_getLogs range caps', () => {
  it('reads the cap from the RPC refusal', () => {
    expect(rangeLimitFrom(new Error('eth_getLogs: HTTP 413 {"error":{"code":-32614,"message":"eth_getLogs is limited to a 1,000 range"}}'))).toBe(1000);
    expect(rangeLimitFrom(new Error('eth_getLogs: max block range 100000'))).toBe(100000);
    expect(rangeLimitFrom(new Error('exceed maximum block range: 50000'))).toBe(50000);
    expect(rangeLimitFrom(new Error('requested range too large'))).toBeNull();
  });

  it('reads Base Sepolia in 1,000-block windows (its known cap), never a full-range call', async () => {
    expect(PAYOUT_CHAINS[84532].maxLogRange).toBe(1000);
    expect(PAYOUT_CHAINS[8453].maxLogRange).toBe(2000);
    const ranges: [number, number][] = [];
    const f = (async (url: string, init?: { body?: string }) => {
      if (url === '/d.json') return json([{ chainId: 84532, address: SPLIT, fromBlock: 100 }]);
      const body = JSON.parse(String(init?.body));
      if (body.method === 'eth_blockNumber') return json({ result: '0x' + (2600).toString(16) });
      const { fromBlock, toBlock } = body.params[0];
      if (toBlock === 'latest') throw new Error('full-range call');
      const from = parseInt(fromBlock, 16);
      const to = parseInt(toBlock, 16);
      if (to - from + 1 > 1000) return json({ error: { code: -32614, message: 'eth_getLogs is limited to a 1,000 range' } }, 413);
      ranges.push([from, to]);
      return json({ result: from === 100 ? [{ topics: [DISBURSED_TOPIC], data: word(1_000_000n), blockNumber: '0x64' }] : [] });
    }) as unknown as typeof fetch;
    const r = await fetchShelterPayouts('/d.json', f);
    expect(r.chains[0].ok).toBe(true);
    expect(r.totals.get('USDC')).toBe(E18);
    expect(ranges).toEqual([[100, 1099], [1100, 2099], [2100, 2600]]);
  });

  it('drops to the cap an unknown RPC names in its HTTP 413 refusal', async () => {
    const sizes: number[] = [];
    const f = (async (url: string, init?: { body?: string }) => {
      if (url === '/d.json') return json([{ chainId: 421614, address: SPLIT, fromBlock: 0 }]);
      const body = JSON.parse(String(init?.body));
      if (body.method === 'eth_blockNumber') return json({ result: '0x' + (1999).toString(16) });
      const { fromBlock, toBlock } = body.params[0];
      if (toBlock === 'latest' || parseInt(toBlock, 16) - parseInt(fromBlock, 16) + 1 > 800) {
        return new Response('{"jsonrpc":"2.0","error":{"code":-32614,"message":"eth_getLogs is limited to a 800 range"}}', { status: 413 });
      }
      sizes.push(parseInt(toBlock, 16) - parseInt(fromBlock, 16) + 1);
      return json({ result: [] });
    }) as unknown as typeof fetch;
    const r = await fetchShelterPayouts('/d.json', f);
    expect(r.chains[0].ok).toBe(true);
    expect(sizes).toEqual([800, 800, 400]);
    expect(MIN_LOG_WINDOW).toBeLessThan(1000);
  });
});

describe('rate limits (Arc testnet 429)', () => {
  afterEach(() => setPayoutsSleep((ms) => new Promise((r) => setTimeout(r, ms))));

  it('retries five times with capped backoff and sends one request at a time per RPC', async () => {
    const waits: number[] = [];
    setPayoutsSleep(async (ms) => void waits.push(ms));
    let inFlight = 0;
    let maxInFlight = 0;
    let limited = 0;
    const f = (async (url: string) => {
      if (url === '/d.json') {
        return json([
          // An explicit rpc skips the explorer API: this test is about the RPC path.
          { chainId: 5042002, address: SPLIT, fromBlock: 1, rpc: 'https://rpc.testnet.arc.io' },
          { chainId: 5042002, address: '0x' + 'cd'.repeat(20), fromBlock: 1, token: 'EURC', rpc: 'https://rpc.testnet.arc.io' },
        ]);
      }
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      if (limited++ < 5) return new Response('slow down', { status: 429 });
      return json({ result: [{ topics: [DISBURSED_TOPIC], data: word(1_000_000n) }] });
    }) as unknown as typeof fetch;
    const r = await fetchShelterPayouts('/d.json', f);
    expect(r.chains.every((c) => c.ok)).toBe(true);
    expect(waits).toEqual([500, 1000, 2000, 4000, 8000]);
    expect(maxInFlight).toBe(1);
    expect(r.totals.get('USDC')).toBe(E18);
    expect(r.totals.get('EURC')).toBe(E18);
  });
});

describe('explorer logs API (Arc testnet, Base)', () => {
  const api = (logs: unknown[]) => json({ status: logs.length ? '1' : '0', message: logs.length ? 'OK' : 'No logs found', result: logs });

  it('reads every log in one explorer request, with block times, and never scans the RPC', async () => {
    const seen: string[] = [];
    const f = (async (url: string) => {
      seen.push(url);
      if (url === '/d.json') return json([{ chainId: 5042002, address: SPLIT, fromBlock: 65_080_649 }, { chainId: 84532, address: SPLIT, fromBlock: 7 }]);
      if (url.startsWith('https://explorer.testnet.arc.io/api?')) {
        expect(url).toContain('module=logs');
        expect(url).toContain('fromBlock=65080649');
        return api([
          { topics: ['0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0', null], data: '0x', blockNumber: '0x1', transactionHash: '0x01' },
          { address: SPLIT, topics: [DISBURSED_TOPIC, null, null], data: word(1_000_000n), blockNumber: '0x3e10d49', transactionHash: '0x' + '02'.repeat(32), timeStamp: '0x6a000000' },
          // Another contract's payout, or one with no address: never counted for this split.
          { address: '0x' + '99'.repeat(20), topics: [DISBURSED_TOPIC], data: word(5_000_000n), blockNumber: '0x3e10d4a', transactionHash: '0x' + '03'.repeat(32) },
          { topics: [DISBURSED_TOPIC], data: word(7_000_000n), blockNumber: '0x3e10d4b', transactionHash: '0x' + '04'.repeat(32) },
        ]);
      }
      if (url.startsWith('https://base-sepolia.blockscout.com/api?')) return api([]);
      throw new Error('RPC read: ' + url);
    }) as unknown as typeof fetch;
    const r = await fetchShelterPayouts('/d.json', f, 8000, { times: true });
    expect(r.chains.map((c) => c.ok)).toEqual([true, true]);
    expect(r.totals.get('USDC')).toBe(E18);
    expect(r.payouts).toHaveLength(1);
    expect(r.payouts[0].time).toBe(0x6a000000);
    expect(seen.filter((u) => u.startsWith('https://rpc') || u.startsWith('https://sepolia.base.org'))).toEqual([]);
  });

  it('falls back to the RPC scan when the explorer API fails', async () => {
    const f = (async (url: string, init?: { body?: string }) => {
      if (url === '/d.json') return json([{ chainId: 5042002, address: SPLIT, fromBlock: 1 }]);
      if (url.startsWith('https://explorer.testnet.arc.io/')) return new Response('down', { status: 503 });
      expect(JSON.parse(String(init?.body)).method).toBe('eth_getLogs');
      return json({ result: [{ topics: [DISBURSED_TOPIC], data: word(2_000_000n) }] });
    }) as unknown as typeof fetch;
    const r = await fetchShelterPayouts('/d.json', f);
    expect(r.chains[0].ok).toBe(true);
    expect(r.totals.get('USDC')).toBe(2n * E18);
  });
});

describe('explorer logs API out of keyless requests', () => {
  it('goes straight to the RPC, and skips the explorer for the next contract too', async () => {
    let apiCalls = 0;
    const f = (async (url: string, init?: { body?: string }) => {
      if (url === '/d.json') {
        return json([
          { chainId: 84532, address: SPLIT, fromBlock: 1 },
          { chainId: 84532, address: '0x' + 'cd'.repeat(20), fromBlock: 1 },
        ]);
      }
      if (url.startsWith('https://base-sepolia.blockscout.com/')) {
        apiCalls++;
        return new Response('{}', { status: 429, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1654082' } });
      }
      return json({ result: JSON.parse(String(init?.body)).method === 'eth_blockNumber' ? '0x10' : [] });
    }) as unknown as typeof fetch;
    const r = await fetchShelterPayouts('/d.json', f);
    expect(apiCalls).toBe(1);
    expect(r.chains.map((c) => c.ok)).toEqual([true, true]);
  });
});

describe('token labels', () => {
  it('keeps the recorded spelling of a mixed-case token', () => {
    const tempo = PAYOUT_CHAINS[42431];
    expect(deploymentUnits({ token: 'pathUSD' }, tempo).symbol).toBe('pathUSD');
    expect(deploymentUnits({ token: 'mUSDC' }, PAYOUT_CHAINS[46630]).symbol).toBe('mUSDC');
    expect(deploymentUnits({ token: 'eurc' }, PAYOUT_CHAINS[5042]).symbol).toBe('EURC');
    expect(deploymentUnits({ token: 'usdc' }, PAYOUT_CHAINS[5042])).toBe(PAYOUT_CHAINS[5042]);
  });

  it('lists totals in a fixed order, stablecoins first and gas coins last', () => {
    const a = new Map([['ETH', E18 / 1000n], ['EURC', 2n * E18], ['pathUSD', 2n * E18], ['USDC', 2n * E18], ['AVAX', E18 / 100n]]);
    const b = new Map([...a].reverse());
    expect(amountsText(a)).toBe('2 USDC + 2 EURC + 2 pathUSD + 0.01 AVAX + 0.001 ETH');
    expect(amountsText(b)).toBe(amountsText(a));
  });
});

describe('payouts modal: per-network wording', () => {
  let m: PayoutsModal | null = null;
  afterEach(() => {
    m?.dispose();
    m = null;
    document.body.replaceChildren();
  });
  const make = (data: ShelterPayouts) => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    m = createPayoutsModal(root, { deploymentsUrl: '/d.json', base: '/a/', pinkPaw: false, load: async () => data });
    return m;
  };

  it('puts stablecoins in the headline, gas coins under it, and says when a network could not be read', async () => {
    const modal = make({
      status: 'ok',
      totals: new Map([['ETH', E18 / 1000n], ['EURC', E18], ['USDC', 2n * E18]]),
      chains: [
        { chainId: 421614, name: 'Arbitrum Sepolia', explorer: 'https://sepolia.arbiscan.io', address: SPLIT, symbol: 'USDC', totals: new Map([['USDC', 2n * E18], ['ETH', E18 / 1000n]]), count: 3, ok: true },
        { chainId: 43113, name: 'Avalanche Fuji', explorer: 'https://subnets-test.avax.network/c-chain', address: SPLIT, symbol: 'EURC', totals: new Map([['EURC', E18]]), count: 1, ok: true },
        { chainId: 84532, name: 'Base Sepolia', explorer: 'https://sepolia.basescan.org', address: SPLIT, symbol: 'USDC', totals: new Map(), count: 0, ok: false },
      ],
      payouts: [],
    });
    await modal.show();
    expect(modal.el.querySelector('[data-testid="payouts-amount"]')?.textContent).toBe('2 USDC + 1 EURC');
    expect(modal.el.querySelector('[data-testid="payouts-gas"]')?.textContent).toBe('Plus 0.001 ETH in network coins');
    expect(modal.el.querySelector('[data-testid="payouts-partial"]')?.textContent).toContain('1 payout contract could not be read right now');
    expect(modal.el.querySelector('[data-testid="payouts-retry"]')).not.toBeNull();
    expect(modal.el.querySelector('[data-claim="L-disbursed"]')?.textContent).toContain('at least');
    const tokens = [...modal.el.querySelectorAll('[data-testid="chain-token"]')].map((n) => n.textContent);
    expect(tokens).toEqual(['USDC', 'EURC', 'USDC']);
    expect(modal.el.querySelector('[data-testid="payouts-chains"] h3')?.textContent).toBe('Payout contracts by network');
  });

  it('names internal network-check memos plainly', async () => {
    const modal = make({
      status: 'ok',
      totals: new Map([['AVAX', E18 / 100n]]),
      chains: [],
      payouts: [{ chainId: 43113, chainName: 'Avalanche Fuji', explorer: '', symbol: 'AVAX', amount18: E18 / 100n, shelter: '', memo: 'verify fuji native', tx: '', block: 5 }],
    });
    await modal.show();
    const row = modal.el.querySelector('[data-testid="payout-row"]')!;
    expect(row.textContent).toContain('Network check payout');
    expect(row.textContent).not.toContain('verify fuji');
    // Only a gas coin was paid: it is the headline, with no "plus" line.
    expect(modal.el.querySelector('[data-testid="payouts-amount"]')?.textContent).toBe('0.01 AVAX');
    expect(modal.el.querySelector('[data-testid="payouts-gas"]')).toBeNull();
  });
});
