// Arc mainnet's public RPC answers about two calls a second and refuses eth_getLogs over 10,000
// blocks (measured 2026-10-08). The Heist payouts modal spaces its Arc calls out instead of
// burning retries on 429s.
import { afterEach, describe, expect, it } from 'vitest';
import { PAYOUT_CHAINS, getLogsRange, setPayoutsClock, setPayoutsSleep } from '../payouts';

describe('Arc mainnet RPC pacing', () => {
  afterEach(() => {
    setPayoutsSleep((ms) => new Promise((r) => setTimeout(r, ms)));
    setPayoutsClock(() => Date.now());
  });

  it('knows the call gap, like the client table', () => {
    expect(PAYOUT_CHAINS[5042].minCallGapMs).toBeGreaterThanOrEqual(500);
  });

  it('scans in 10,000-block windows with the gap between calls', async () => {
    let t = 1_000_000;
    const waits: number[] = [];
    const sent: { at: number; method: string; from?: string; to?: string }[] = [];
    setPayoutsClock(() => t);
    setPayoutsSleep(async (ms) => {
      waits.push(ms);
      t += ms;
    });
    const f = (async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body));
      sent.push({ at: t, method: body.method, from: body.params[0]?.fromBlock, to: body.params[0]?.toBlock });
      if (body.params[0]?.toBlock === 'latest') return new Response(JSON.stringify({ error: { code: -32012, message: 'requested range too large' } }));
      if (body.method === 'eth_blockNumber') return new Response(JSON.stringify({ result: '0x' + (30_000 - 1).toString(16) }));
      return new Response(JSON.stringify({ result: [] }));
    }) as unknown as typeof fetch;
    const { rpc, maxLogRange, minCallGapMs } = PAYOUT_CHAINS[5042];
    await getLogsRange(f, rpc, { address: '0x457c89e10a6e66633eda5bf82fd086febb5db147', topics: [[]] }, 0, new AbortController().signal, maxLogRange);
    // The refused full range, the head, then three 10,000-block windows.
    expect(sent.map((s) => s.method)).toEqual(['eth_getLogs', 'eth_blockNumber', 'eth_getLogs', 'eth_getLogs', 'eth_getLogs']);
    expect(sent.slice(2).map((s) => [s.from, s.to])).toEqual([['0x0', '0x270f'], ['0x2710', '0x4e1f'], ['0x4e20', '0x752f']]);
    for (let i = 1; i < sent.length; i++) expect(sent[i].at - sent[i - 1].at).toBeGreaterThanOrEqual(minCallGapMs!);
  });

  it('spaces parallel scans of the two Arc splits one gap apart', async () => {
    let t = 5_000_000;
    const sent: number[] = [];
    setPayoutsClock(() => t);
    // A real-ish timer: each sleep resolves at its own deadline, in deadline order.
    const timers: { at: number; resolve: () => void }[] = [];
    setPayoutsSleep((ms) => new Promise<void>((resolve) => timers.push({ at: t + ms, resolve })));
    const f = (async (_url: string, init?: { body?: string }) => {
      sent.push(t);
      const body = JSON.parse(String(init?.body));
      if (body.params[0]?.toBlock === 'latest') return new Response(JSON.stringify({ error: { code: -32012, message: 'requested range too large' } }));
      return new Response(JSON.stringify({ result: body.method === 'eth_blockNumber' ? '0x2710' : [] }));
    }) as unknown as typeof fetch;
    const { rpc, maxLogRange, minCallGapMs } = PAYOUT_CHAINS[5042];
    const scan = (from: number) => getLogsRange(f, rpc, { address: '0x457c89e10a6e66633eda5bf82fd086febb5db147', topics: [[]] }, from, new AbortController().signal, maxLogRange);
    const all = Promise.all([scan(0), scan(0), scan(0)]);
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 0));
      timers.sort((a, b) => a.at - b.at);
      const next = timers.shift();
      if (!next) break;
      t = Math.max(t, next.at);
      next.resolve();
    }
    await all;
    expect(sent.length).toBe(12); // three scans: the refused full range, the head and two windows each
    for (let i = 1; i < sent.length; i++) expect(sent[i] - sent[i - 1]).toBeGreaterThanOrEqual(minCallGapMs!);
  });

  it('does not pace other chains', async () => {
    const waits: number[] = [];
    setPayoutsSleep(async (ms) => {
      waits.push(ms);
    });
    const f = (async () => new Response(JSON.stringify({ result: [] }))) as unknown as typeof fetch;
    await getLogsRange(f, PAYOUT_CHAINS[42161].rpc, { address: '0x457c89e10a6e66633eda5bf82fd086febb5db147', topics: [[]] }, 0, new AbortController().signal);
    expect(waits).toEqual([]);
  });
});
