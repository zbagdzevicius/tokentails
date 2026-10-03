import { getBigInt } from 'ethers';
import { attributePayout, decodePayoutLog, isPayoutLog, PAW_MEMO_PREFIX, sumBy, to18 } from './shelter-logs';
import { loadShelterLogsFixture } from './shelter-logs.fixture-spec';

/*
 * Parity (plan F7.3): this decoder, client/components/shelter-payouts/logs.ts
 * (client/__test__/shelter-logs-parity.test.ts) and catnip-heist/src/ui/payouts.ts
 * (catnip-heist/src/ui/__tests__/payouts-parity.test.ts) decode shared/fixtures/shelter-logs.json
 * to the same totals.
 */
const fixture = loadShelterLogsFixture();
const payouts = fixture.logs.filter(isPayoutLog).map(log => decodePayoutLog(log, fixture.chainId));

describe('ShelterSplit log decoder (shared fixture)', () => {
    it('skips the non-payout log and decodes every payout', () => {
        expect(fixture.logs).toHaveLength(fixture.expected.payoutCount + 1);
        expect(payouts).toHaveLength(fixture.expected.payoutCount);
        expect(payouts.map(p => p.amount.toString())).toEqual(fixture.expected.rawAmounts);
    });

    it('decodes identical totals per symbol and per kind', () => {
        expect(
            sumBy(
                payouts,
                p => p.symbol,
                p => p.amount18
            )
        ).toEqual(fixture.expected.total18BySymbol);
        expect(
            sumBy(
                payouts,
                p => p.kind,
                p => p.amount18
            )
        ).toEqual(fixture.expected.total18ByKind);
    });

    it('round-trips every memo in full, including the 85-byte paw settlement memo', () => {
        expect(payouts.map(p => p.memo)).toEqual(fixture.expected.memos);
        const paw = payouts.find(p => p.memo.startsWith(PAW_MEMO_PREFIX))!;
        expect(paw.memo).toBe(fixture.expected.pawMemo);
        expect(Buffer.byteLength(paw.memo, 'utf8')).toBe(fixture.expected.pawMemoBytes);
        expect(fixture.expected.pawMemoBytes).toBeGreaterThan(64);
        expect(paw.memo).toMatch(/^tt:paws:\d{4}-\d{2}-\d{2}:0x[0-9a-f]{64}$/);
    });

    it('reads positions, the shelter and the contract lowercased', () => {
        expect(payouts[0]).toMatchObject({
            kind: 'native',
            contract: fixture.contract,
            shelter: fixture.shelter,
            blockNumber: fixture.expected.fromBlock,
            logIndex: 0,
            symbol: 'USDC',
        });
        expect(payouts[4]).toMatchObject({ kind: 'token', logIndex: 3 });
        expect(payouts[payouts.length - 1].blockNumber).toBe(fixture.expected.toBlock);
    });

    it('attributes by tx hash and never drops an unmatched log', () => {
        const lookups = {
            donationSourceByTx: new Map(fixture.attribution.donations.map(d => [d.txHash, d.source])),
            x402Txs: new Set(fixture.attribution.x402UsedTxs),
            pawSenders: new Set(fixture.attribution.pawSenders),
        };
        const withFrom = payouts.map(p => ({ ...p, from: fixture.attribution.txFrom[p.txHash] || null }));
        const buckets = Object.fromEntries(withFrom.map(p => [p.txHash, attributePayout(p, lookups)]));
        expect(buckets).toEqual(fixture.expected.buckets);
        expect(
            sumBy(
                withFrom,
                p => attributePayout(p, lookups),
                p => p.amount18
            )
        ).toEqual(fixture.expected.total18ByBucket);
    });

    it('counts a tt:paws: memo as paws only from a paw sender (donate(memo) is public)', () => {
        const paw = payouts.find(p => p.memo.startsWith(PAW_MEMO_PREFIX))!;
        const sender = fixture.attribution.txFrom[paw.txHash];
        const lookups = {
            donationSourceByTx: new Map<string, string>(),
            x402Txs: new Set<string>(),
            pawSenders: new Set(fixture.attribution.pawSenders),
        };
        expect(attributePayout({ ...paw, from: sender }, lookups)).toBe('paws');
        expect(attributePayout({ ...paw, from: sender.toUpperCase().replace('0X', '0x') }, lookups)).toBe('paws');
        expect(attributePayout({ ...paw, from: '0x' + '9'.repeat(40) }, lookups)).toBe('direct');
        expect(attributePayout({ ...paw, from: null }, lookups)).toBe('direct');
        expect(attributePayout({ ...paw, from: sender }, { ...lookups, pawSenders: new Set() })).toBe('direct');
    });

    it('rejects anything that is not a payout', () => {
        const transfer = fixture.logs.find(log => !isPayoutLog(log))!;
        expect(() => decodePayoutLog(transfer, fixture.chainId)).toThrow('not a Disbursed');
        expect(() => to18(getBigInt(1), 19)).toThrow();
    });
});
