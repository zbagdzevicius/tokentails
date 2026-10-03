import { describe, expect, it } from 'vitest';
import { DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC, PAYOUT_CHAINS, deploymentUnits, fetchShelterTotals, formatAmount, payoutOf, totalText } from '../payouts';

const word = (n: bigint) => '0x' + n.toString(16).padStart(64, '0') + '0'.repeat(64);
const SPLIT = '0x' + 'ab'.repeat(20);

describe('payoutOf', () => {
  const arc = PAYOUT_CHAINS[5042];
  it('reads ERC-20 payouts in the token decimals (Arc USDC: 6)', () => {
    expect(payoutOf({ topics: [DISBURSED_TOPIC], data: word(1_500_000n) }, arc)).toEqual({ symbol: 'USDC', amount18: 1_500_000_000_000_000_000n });
  });
  it('reads native payouts in native decimals (Arc native USDC: 18)', () => {
    expect(payoutOf({ topics: [NATIVE_DISBURSED_TOPIC.toUpperCase().replace('0X', '0x')], data: word(10n ** 18n) }, arc)).toEqual({ symbol: 'USDC', amount18: 10n ** 18n });
  });
  it('ignores other events and bad data', () => {
    expect(payoutOf({ topics: ['0x' + '00'.repeat(32)], data: word(1n) }, arc)).toBeNull();
    expect(payoutOf({ topics: [DISBURSED_TOPIC], data: '0x12' }, arc)).toBeNull();
  });
});

describe('formatting', () => {
  it('rounds to cents and trims', () => {
    expect(formatAmount(2n * 10n ** 18n, 'USDC')).toBe('2 USDC');
    expect(formatAmount(1_505_000_000_000_000_000n, 'USDC')).toBe('1.51 USDC');
    // A small native gift never reads as zero.
    expect(formatAmount(2_100_000_000_000_000n, 'ETH')).toBe('0.0021 ETH');
    expect(formatAmount(1_000_000_000_000_000n, 'ETH')).toBe('0.001 ETH');
    expect(formatAmount(1n, 'ETH')).toBe('<0.000001 ETH');
    expect(formatAmount(1_500_000_000_000_000_000n, 'EURC')).toBe('1.5 EURC');
  });
  it('joins symbols and hides an empty total', () => {
    expect(totalText(new Map())).toBe('');
    expect(totalText(new Map([['USDC', 0n]]))).toBe('');
    expect(totalText(new Map([['USDC', 3n * 10n ** 18n], ['EURC', 10n ** 18n]]))).toBe('Token Tails has sent 3 USDC + 1 EURC to shelters so far, on-chain');
  });
});

describe('fetchShelterTotals', () => {
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
  it('sums native and token payouts across chains and skips a failing RPC', async () => {
    const deployments = [
      { chainId: 5042, address: SPLIT, fromBlock: 10 },
      { chainId: 42161, address: SPLIT, tx: '0x' + '11'.repeat(32) },
      { chainId: 43114, address: SPLIT },
      { chainId: 999999, address: SPLIT },
    ];
    const calls: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      if (url === '/d.json') return json(deployments);
      const body = JSON.parse(String(init?.body));
      calls.push(`${url} ${body.method}`);
      if (url.includes('avax')) return new Response('down', { status: 503 });
      if (body.method === 'eth_getTransactionReceipt') return json({ result: { blockNumber: '0x20' } });
      if (url.includes('arc')) {
        expect(body.params[0].fromBlock).toBe('0xa');
        return json({ result: [{ topics: [DISBURSED_TOPIC], data: word(1_000_000n) }, { topics: [NATIVE_DISBURSED_TOPIC], data: word(10n ** 18n) }] });
      }
      expect(body.params[0].fromBlock).toBe('0x20');
      return json({ result: [{ topics: [DISBURSED_TOPIC], data: word(500_000n) }] });
    }) as typeof fetch;
    const totals = await fetchShelterTotals('/d.json', f);
    expect(totalText(totals)).toBe('Token Tails has sent 2.5 USDC to shelters so far, on-chain');
    expect(calls.some((c) => c.includes('avax'))).toBe(true);
  });
  it('returns nothing when the list is missing', async () => {
    const f = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    expect((await fetchShelterTotals('/d.json', f)).size).toBe(0);
  });
});

describe('deployment token', () => {
  it('sums an EURC instance as EURC, never as USDC', () => {
    const arc = PAYOUT_CHAINS[5042];
    expect(payoutOf({ topics: [DISBURSED_TOPIC], data: word(1_000_000n) }, deploymentUnits({ token: 'EURC' }, arc))?.symbol).toBe('EURC');
    expect(deploymentUnits({ token: 'USDC' }, arc)).toBe(arc);
    expect(deploymentUnits({}, arc)).toBe(arc);
  });
});

describe('Robinhood Chain (USDG)', () => {
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
  it('reads Robinhood payouts as USDG and keeps them out of the USDC total', async () => {
    const rh = PAYOUT_CHAINS[4663];
    expect(rh).toMatchObject({ decimals: 6, symbol: 'USDG', nativeSymbol: 'ETH' });
    expect(PAYOUT_CHAINS[8453]).toMatchObject({ decimals: 6, symbol: 'USDC' });
    const deployments = [
      { chainId: 8453, address: SPLIT, fromBlock: 1 },
      { chainId: 4663, address: SPLIT, fromBlock: 1, token: 'USDG' },
    ];
    const f = (async (url: string) => {
      if (url === '/d.json') return json(deployments);
      return json({ result: [{ topics: [DISBURSED_TOPIC], data: word(url.includes('robinhood') ? 2_000_000n : 1_000_000n) }] });
    }) as typeof fetch;
    const totals = await fetchShelterTotals('/d.json', f);
    expect(totals.get('USDC')).toBe(10n ** 18n);
    expect(totals.get('USDG')).toBe(2n * 10n ** 18n);
    expect(totalText(totals)).toBe('Token Tails has sent 1 USDC + 2 USDG to shelters so far, on-chain');
  });
});
