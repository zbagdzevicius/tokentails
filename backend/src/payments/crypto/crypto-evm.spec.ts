import { decodeBytes32String } from 'ethers';
import { shelterSplitInterface } from 'src/shelter/onchain/shelter-chain';
import {
    amountKey,
    catSplitMemo,
    checkPayment,
    erc20PayInterface,
    formatBase,
    paymentSteps,
    priceBase,
    ReceiptLog,
    tip20Memo,
    tip20MemoInterface,
} from './crypto-evm';

const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OTHER_TOKEN = '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42';
const TREASURY = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const SPLIT = '0x1111111111111111111111111111111111111111';
const BUYER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const SHELTER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const ORDER = 'co_9f2c4e1a7b3d5e60';

function transferLog(token: string, from: string, to: string, value: bigint): ReceiptLog {
    const { topics, data } = erc20PayInterface.encodeEventLog('Transfer', [from, to, value]);
    return { address: token, topics, data };
}

function memoLog(token: string, from: string, to: string, value: bigint, memo: string): ReceiptLog {
    const { topics, data } = tip20MemoInterface.encodeEventLog('TransferWithMemo', [from, to, value, memo]);
    return { address: token, topics, data };
}

function batchLog(split: string, payer: string, amount: bigint, toShelters: bigint, memo: string): ReceiptLog {
    const { topics, data } = shelterSplitInterface.encodeEventLog('DisbursementBatch', [
        7,
        payer,
        amount,
        toShelters,
        amount - toShelters,
        1,
        memo,
    ]);
    return { address: split, topics, data };
}

describe('priceBase', () => {
    it('prices USDC 1:1 with USD in base units', () => {
        expect(priceBase(500, 'USDC', 6)).toBe(BigInt(5000000));
        expect(priceBase(35000, 'USDC', 6)).toBe(BigInt(350000000));
        expect(priceBase(500, 'USDC', 18)).toBe(BigInt('5000000000000000000'));
    });

    it('prices EURC from the table rate, rounded up so the buyer never pays below the table', () => {
        expect(priceBase(500, 'EURC', 6)).toBe(BigInt(5000000));
        expect(priceBase(500, 'EURC', 6, BigInt(920000))).toBe(BigInt(4600000));
        // 0.333333 EURC per USD on $1: 0.333333 exactly; on 1 cent: 3333.33 -> 3334 base units.
        expect(priceBase(1, 'EURC', 6, BigInt(333333))).toBe(BigInt(3334));
    });

    it('refuses a non-positive or fractional price', () => {
        expect(() => priceBase(0, 'USDC', 6)).toThrow();
        expect(() => priceBase(1.5, 'USDC', 6)).toThrow();
    });
});

describe('formatting and memos', () => {
    it('formats base units without trailing zeros', () => {
        expect(formatBase(BigInt(5000137), 6)).toBe('5.000137');
        expect(formatBase(BigInt(5000000), 6)).toBe('5');
    });

    it('builds a readable TIP-20 memo and a split memo from the order id', () => {
        expect(decodeBytes32String(tip20Memo(ORDER))).toBe(`tt:${ORDER}`);
        expect(catSplitMemo(ORDER)).toBe('tt:cat:9f2c4e1a7b3d5e60');
    });

    it('keys a reserved amount by chain, token (case-insensitive) and exact amount', () => {
        expect(amountKey(8453, TOKEN, BigInt(5000137))).toBe(`8453:${TOKEN.toLowerCase()}:5000137`);
    });
});

describe('paymentSteps', () => {
    it('is one ERC-20 transfer to the recipient', () => {
        const [step] = paymentSteps({
            route: 'transfer',
            tokenAddress: TOKEN,
            recipient: TREASURY,
            amount: BigInt(7),
            memo: null,
        });
        expect(step.to).toBe(TOKEN);
        const [to, amount] = erc20PayInterface.decodeFunctionData('transfer', step.data);
        expect([to, amount]).toEqual([TREASURY, BigInt(7)]);
    });

    it('is a TIP-20 transferWithMemo on Tempo', () => {
        const memo = tip20Memo(ORDER);
        const [step] = paymentSteps({
            route: 'transferWithMemo',
            tokenAddress: TOKEN,
            recipient: TREASURY,
            amount: BigInt(7),
            memo,
        });
        const decoded = tip20MemoInterface.decodeFunctionData('transferWithMemo', step.data);
        expect(decoded[2]).toBe(memo);
    });

    it('is approve then disburse with the memo on the split route', () => {
        const steps = paymentSteps({
            route: 'split',
            tokenAddress: TOKEN,
            recipient: SPLIT,
            amount: BigInt(5),
            memo: 'tt:cat:ab',
        });
        expect(steps.map(s => s.kind)).toEqual(['approve', 'disburse']);
        expect(steps[1].to).toBe(SPLIT);
        expect(shelterSplitInterface.decodeFunctionData('disburse', steps[1].data)).toEqual([BigInt(5), 'tt:cat:ab']);
    });
});

describe('checkPayment', () => {
    const amountOption = {
        route: 'transfer' as const,
        binding: 'amount' as const,
        tokenAddress: TOKEN,
        recipient: TREASURY,
        amount: '5000137',
        memo: null,
    };

    it('accepts the exact unique amount to the treasury in the right token', () => {
        const check = checkPayment([transferLog(TOKEN, BUYER, TREASURY, BigInt(5000137))], amountOption);
        expect(check).toEqual({ ok: true, paid: BigInt(5000137), payer: BUYER.toLowerCase() });
    });

    it('refuses a different amount: the amount is the order binding', () => {
        expect(checkPayment([transferLog(TOKEN, BUYER, TREASURY, BigInt(5000000))], amountOption).ok).toBe(false);
        expect(checkPayment([transferLog(TOKEN, BUYER, TREASURY, BigInt(6000000))], amountOption).ok).toBe(false);
    });

    it('calls a transfer a little below the exact amount underpaid (an exchange fee), never accepted', () => {
        expect(checkPayment([transferLog(TOKEN, BUYER, TREASURY, BigInt(4990000))], amountOption)).toEqual({
            ok: false,
            reason: 'UNDERPAID',
            paid: BigInt(4990000),
        });
        // Far below, or above: no match at all.
        expect(checkPayment([transferLog(TOKEN, BUYER, TREASURY, BigInt(1000000))], amountOption).reason).toBe(
            'NO_MATCHING_TRANSFER'
        );
        expect(checkPayment([transferLog(TOKEN, BUYER, TREASURY, BigInt(5000138))], amountOption).reason).toBe(
            'NO_MATCHING_TRANSFER'
        );
    });

    it('refuses another token contract, another recipient, or a look-alike log from another contract', () => {
        expect(checkPayment([transferLog(OTHER_TOKEN, BUYER, TREASURY, BigInt(5000137))], amountOption).ok).toBe(false);
        expect(checkPayment([transferLog(TOKEN, BUYER, SHELTER, BigInt(5000137))], amountOption).ok).toBe(false);
        expect(checkPayment([transferLog(SPLIT, BUYER, TREASURY, BigInt(5000137))], amountOption).reason).toBe(
            'NO_MATCHING_TRANSFER'
        );
    });

    it('accepts a TIP-20 memo payment of at least the price, and calls a smaller one underpaid', () => {
        const memo = tip20Memo(ORDER);
        const option = {
            ...amountOption,
            route: 'transferWithMemo' as const,
            binding: 'memo' as const,
            amount: '5000000',
            memo,
        };
        expect(checkPayment([memoLog(TOKEN, BUYER, TREASURY, BigInt(5000000), memo)], option).ok).toBe(true);
        expect(checkPayment([memoLog(TOKEN, BUYER, TREASURY, BigInt(4999999), memo)], option).reason).toBe('UNDERPAID');
        expect(
            checkPayment([memoLog(TOKEN, BUYER, TREASURY, BigInt(5000000), tip20Memo('co_0000000000000000'))], option)
                .ok
        ).toBe(false);
    });

    it("never matches a memo order by amount: another buyer's memo transfer cannot be claimed", () => {
        // TIP-20 emits both events for one transferWithMemo. Every memo-route order of one item has the
        // same amount, so the plain Transfer must not count, or anyone could claim this payment.
        const victimMemo = tip20Memo('co_aaaaaaaaaaaaaaaa');
        const victimTx = [
            transferLog(TOKEN, BUYER, TREASURY, BigInt(5000000)),
            memoLog(TOKEN, BUYER, TREASURY, BigInt(5000000), victimMemo),
        ];
        const attacker = {
            ...amountOption,
            route: 'transferWithMemo' as const,
            binding: 'memo' as const,
            amount: '5000000',
            memo: tip20Memo('co_bbbbbbbbbbbbbbbb'),
        };
        expect(checkPayment(victimTx, attacker)).toEqual({ ok: false, reason: 'NO_MATCHING_TRANSFER' });
        // A plain transfer of exactly the amount, without any memo, does not pay a memo order either.
        expect(checkPayment([victimTx[0]], attacker).ok).toBe(false);
        // The victim's own order still matches.
        expect(checkPayment(victimTx, { ...attacker, memo: victimMemo }).ok).toBe(true);
    });

    it('accepts the split route only with the split batch event for this memo and the token pulled into the split', () => {
        const option = {
            route: 'split' as const,
            binding: 'memo' as const,
            tokenAddress: TOKEN,
            recipient: SPLIT,
            amount: '5000000',
            memo: catSplitMemo(ORDER),
        };
        const pulled = transferLog(TOKEN, BUYER, SPLIT, BigInt(5000000));
        const batch = batchLog(SPLIT, BUYER, BigInt(5000000), BigInt(5000000), option.memo);
        expect(checkPayment([pulled, batch], option)).toEqual(
            expect.objectContaining({
                ok: true,
                payer: BUYER.toLowerCase(),
                toShelters: BigInt(5000000),
                toTreasury: BigInt(0),
            })
        );
        // A batch from another contract, another memo, or with no token pulled in does not count.
        expect(
            checkPayment([pulled, batchLog(TREASURY, BUYER, BigInt(5000000), BigInt(1), option.memo)], option).ok
        ).toBe(false);
        expect(
            checkPayment([pulled, batchLog(SPLIT, BUYER, BigInt(5000000), BigInt(1), 'tt:cat:other')], option).ok
        ).toBe(false);
        expect(checkPayment([batch], option).ok).toBe(false);
        expect(
            checkPayment([pulled, batchLog(SPLIT, BUYER, BigInt(4000000), BigInt(1), option.memo)], option).reason
        ).toBe('UNDERPAID');
    });
});
