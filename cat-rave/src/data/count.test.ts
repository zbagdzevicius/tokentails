import { describe, expect, it } from 'vitest';
import { BUNDLED, buildSnapshot } from './index';

const ev = (i: number, usd: string, extra: Partial<{ symbol: string; chainId: number; timestamp: number }> = {}) => ({
  chainId: extra.chainId ?? 5042,
  txHash: `0x${i.toString(16).padStart(64, '0')}`,
  logIndex: 0,
  timestamp: extra.timestamp ?? 1000 + i,
  symbol: extra.symbol ?? 'USDC',
  amount18: (BigInt(Math.round(Number(usd) * 1e6)) * 10n ** 12n).toString(),
  source: 'treat',
});

describe('count rule', () => {
  it('100 treats of $0.01 make exactly one cat', () => {
    const s = buildSnapshot({ asOf: 'x', events: Array.from({ length: 100 }, (_, i) => ev(i, '0.01')) }, { origin: 'snapshot' });
    expect(s.realCats).toBe(1);
    expect(s.catList[0].contributors).toBe(100);
    expect(s.progressToNext).toBe(0);
  });

  it('one $5 payout is five cats named by the same tx', () => {
    const s = buildSnapshot({ asOf: 'x', events: [ev(1, '0.5'), ev(2, '5')] }, { origin: 'snapshot' });
    expect(s.realCats).toBe(5);
    expect(new Set(s.catList.map((c) => c.payout?.txHash)).size).toBe(1);
    expect(s.progressToNext).toBeCloseTo(0.5);
  });

  it('ignores gas coins and unknown chains, counts EURC at the fixed rate', () => {
    const s = buildSnapshot(
      { asOf: 'x', events: [ev(1, '1', { symbol: 'ETH' }), ev(2, '1', { chainId: 1 }), ev(3, '1', { symbol: 'EURC' })] },
      { origin: 'snapshot' },
    );
    expect(s.realCats).toBe(1);
  });

  it('DEMO override keeps real cats and labels the rest', () => {
    const s = buildSnapshot({ asOf: 'x', events: [ev(1, '2')] }, { origin: 'snapshot', demoCats: 5 });
    expect(s.demo).toBe(true);
    expect(s.catList.filter((c) => !c.demo)).toHaveLength(2);
    expect(s.catList.filter((c) => c.demo && c.payout === null)).toHaveLength(3);
  });

  it('bundled snapshot is real data with no raw memos', () => {
    const s = buildSnapshot(BUNDLED, { origin: 'snapshot' });
    expect(s.payouts.length).toBe(BUNDLED.events.length);
    expect(JSON.stringify(BUNDLED)).not.toMatch(/motored:user/);
    expect(s.realCats).toBe(Math.floor(s.totalUsdMicro / 1e6));
  });
});
