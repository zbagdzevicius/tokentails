import { getBigInt } from 'ethers';
import {
    attributePayout,
    decodePayoutLog,
    isPayoutLog,
    PAW_MEMO_PREFIX,
    PAYOUT_BUCKETS,
    sumBy,
    to18,
} from './shelter-logs';
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

describe('wallet and match attribution (F2)', () => {
    const ROUTER = '0x4444444444444444444444444444444444444444';
    const HOT = '0x3333333333333333333333333333333333333333';
    const STRANGER = '0x9999999999999999999999999999999999999999';
    const MATCH_TX = '0x' + 'a1'.repeat(32);
    const lookups = () => ({
        donationSourceByTx: new Map<string, string>(),
        x402Txs: new Set<string>(['0x' + 'b2'.repeat(32)]),
        pawSenders: new Set<string>([HOT]),
        matchTxs: new Set<string>([MATCH_TX]),
        router: ROUTER,
    });

    it('keeps the bucket names fixed by the spec', () => {
        expect(PAYOUT_BUCKETS).toEqual(['heist', 'page', 'paws', 'x402', 'wallet', 'match', 'direct']);
    });

    it('counts a match only from a Token Tails sender in a recorded match tx', () => {
        const memo = 'tt:match:0a1b2c3d';
        expect(attributePayout({ txHash: MATCH_TX, memo, from: HOT }, lookups())).toBe('match');
        // A stranger can write the memo; it stays direct.
        expect(attributePayout({ txHash: MATCH_TX, memo, from: STRANGER }, lookups())).toBe('direct');
        // The hot wallet with the memo but no ShelterMatch row: direct.
        expect(attributePayout({ txHash: '0x' + 'c3'.repeat(32), memo, from: HOT }, lookups())).toBe('direct');
        // Unknown sender: direct (asked again later).
        expect(attributePayout({ txHash: MATCH_TX, memo }, lookups())).toBe('direct');
    });

    it('counts a wallet gift only when the batch payer is the router and the donor is public', () => {
        const tx = '0x' + 'd4'.repeat(32);
        const DONOR = '0x1212121212121212121212121212121212121212';
        const TEAM = '0x8888888888888888888888888888888888888888';
        const SHELTER = '0x2222222222222222222222222222222222222222';
        const gift = (memo: string, over: Record<string, unknown> = {}) =>
            attributePayout(
                { txHash: tx, memo, payer: ROUTER, donor: DONOR, shelter: SHELTER, ...over },
                { ...lookups(), notPublic: new Set([HOT, TEAM]) }
            );
        expect(gift('tt:wallet:0a1b2c3d')).toBe('wallet');
        // The router pays the split for any memo a donor chose (donateNative(memo)).
        expect(gift('hello')).toBe('wallet');
        expect(gift('tt:wallet:0a1b2c3d', { payer: ROUTER.toUpperCase().replace('0X', '0x') })).toBe('wallet');
        // A flush pushes untraced plain transfers: never a public wallet gift.
        expect(gift('tt:flush')).toBe('direct');
        // Not public: Token Tails senders, team wallets, the shelter paying itself, an unknown donor.
        expect(gift('tt:wallet:0a1b2c3d', { donor: TEAM })).toBe('direct');
        expect(gift('tt:wallet:0a1b2c3d', { donor: HOT })).toBe('direct');
        expect(gift('tt:wallet:0a1b2c3d', { donor: SHELTER })).toBe('direct');
        expect(gift('tt:wallet:0a1b2c3d', { donor: null })).toBe('direct');
        // Not paid by the router.
        expect(gift('tt:wallet:0a1b2c3d', { payer: STRANGER })).toBe('direct');
        expect(gift('tt:wallet:0a1b2c3d', { payer: null })).toBe('direct');
        expect(
            attributePayout(
                { txHash: tx, memo: 'tt:wallet:0a1b2c3d', payer: ROUTER, donor: DONOR },
                { ...lookups(), router: null }
            )
        ).toBe('direct');
    });

    it('still reads x402 by tx hash and direct otherwise', () => {
        expect(attributePayout({ txHash: '0x' + 'b2'.repeat(32), memo: '' }, lookups())).toBe('x402');
        expect(attributePayout({ txHash: '0x' + 'e5'.repeat(32), memo: 'tt:paws:x', from: STRANGER }, lookups())).toBe(
            'direct'
        );
    });
});
