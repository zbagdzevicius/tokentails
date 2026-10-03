import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fetchShelterTotals, PAYOUT_CHAINS, payoutOf, type PayoutLog } from '../payouts';

/*
 * Parity (plan F7.3): the win-screen total, the backend indexer (backend/src/impact/shelter-logs.ts)
 * and the client payouts page (client/components/shelter-payouts/logs.ts) decode the same recorded
 * logs in shared/fixtures/shelter-logs.json to identical totals. The Heist shows totals only and
 * never reads memos, so it cannot truncate one; the full-memo round-trip is asserted by the backend
 * and client parity tests on the same fixture.
 */

interface Fixture {
  chainId: number;
  contract: string;
  logs: (PayoutLog & { transactionHash: string })[];
  expected: {
    payoutCount: number;
    total18BySymbol: Record<string, string>;
    total18ByKind: Record<string, string>;
    rawAmounts: string[];
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const fixture: Fixture = JSON.parse(
  readFileSync(join(here, '..', '..', '..', '..', 'shared', 'fixtures', 'shelter-logs.json'), 'utf8'),
);
const chain = PAYOUT_CHAINS[fixture.chainId];

const sums = (logs: PayoutLog[]) => {
  const totals = new Map<string, bigint>();
  for (const log of logs) {
    const p = payoutOf(log, chain);
    if (p) totals.set(p.symbol, (totals.get(p.symbol) ?? 0n) + p.amount18);
  }
  return Object.fromEntries([...totals].map(([s, v]) => [s, v.toString()]));
};

describe('Heist payout totals match the backend and the client (shared fixture)', () => {
  it('skips the non-payout log and counts every payout', () => {
    const read = fixture.logs.map((log) => payoutOf(log, chain)).filter(Boolean);
    expect(read).toHaveLength(fixture.expected.payoutCount);
  });

  it('decodes identical 18-decimal totals per symbol', () => {
    expect(sums(fixture.logs)).toEqual(fixture.expected.total18BySymbol);
  });

  it('decodes identical totals per kind (native vs token)', () => {
    const byKind: Record<string, bigint> = {};
    for (const log of fixture.logs) {
      const p = payoutOf(log, chain);
      if (!p) continue;
      const kind = log.topics[0].toLowerCase().startsWith('0xc859') ? 'native' : 'token';
      byKind[kind] = (byKind[kind] ?? 0n) + p.amount18;
    }
    expect(Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.toString()]))).toEqual(
      fixture.expected.total18ByKind,
    );
  });

  it('fetchShelterTotals over a fake RPC serving the fixture gives the same total', async () => {
    const fakeFetch = (async (url: string, init?: { body?: string }) => {
      if (url === '/deployments.json') {
        return new Response(JSON.stringify([{ chainId: fixture.chainId, address: fixture.contract, fromBlock: 1 }]));
      }
      const body = JSON.parse(String(init?.body));
      expect(body.method).toBe('eth_getLogs');
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: fixture.logs }));
    }) as unknown as typeof fetch;
    const totals = await fetchShelterTotals('/deployments.json', fakeFetch);
    expect(Object.fromEntries([...totals].map(([s, v]) => [s, v.toString()]))).toEqual(fixture.expected.total18BySymbol);
  });
});
