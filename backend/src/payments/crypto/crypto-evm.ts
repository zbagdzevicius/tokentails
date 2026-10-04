import { encodeBytes32String, getAddress, Interface } from 'ethers';
import { shelterSplitInterface, TOKEN_BATCH_TOPIC } from 'src/shelter/onchain/shelter-chain';
import { CryptoPayTokenKind } from './crypto-chains';

/*
 * Pure EVM helpers of the crypto checkout: prices in token base units, the order binding (unique
 * amount or memo), the calldata a wallet sends, and the receipt check. No network or database here,
 * so every rule is unit tested (crypto-evm.spec.ts).
 */

export const ERC20_PAY_ABI = [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
];
export const erc20PayInterface = new Interface(ERC20_PAY_ABI);

/** TIP-20 (Tempo) memo transfer; the event signature is pinned in shelter-split/test/Tip20Compat.t.sol. */
export const TIP20_MEMO_ABI = [
    'function transferWithMemo(address to, uint256 amount, bytes32 memo)',
    'event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo)',
];
export const tip20MemoInterface = new Interface(TIP20_MEMO_ABI);

export const TRANSFER_TOPIC = erc20PayInterface.getEvent('Transfer')!.topicHash.toLowerCase();
export const TRANSFER_WITH_MEMO_TOPIC = tip20MemoInterface.getEvent('TransferWithMemo')!.topicHash.toLowerCase();
export { TOKEN_BATCH_TOPIC };

export type PaymentRoute = 'transfer' | 'transferWithMemo' | 'split';
export type PaymentBinding = 'amount' | 'memo';

/** The unique tag added to an `amount`-bound price: 1 to 9,999 base units (under one cent at 6 decimals). */
export const AMOUNT_TAG_MIN = 1;
export const AMOUNT_TAG_MAX = 9999;

const TEN = BigInt(10);
const HUNDRED = BigInt(100);
const MICRO = BigInt(1000000);

/**
 * The price in token base units. USDC is 1:1 with USD. EURC uses the dated table rate
 * (`eurcPerUsdMicro` EURC millionths per USD), rounded up so the buyer never pays less than the table.
 */
export function priceBase(
    priceUsdCents: number,
    token: CryptoPayTokenKind,
    decimals: number,
    eurcPerUsdMicro: bigint = MICRO
): bigint {
    if (!Number.isSafeInteger(priceUsdCents) || priceUsdCents <= 0) {
        throw new Error('price must be a positive whole number of cents');
    }
    if (!Number.isInteger(decimals) || decimals < 2 || decimals > 36) {
        throw new Error('unsupported token decimals');
    }
    const cents = BigInt(priceUsdCents);
    const unit = TEN ** BigInt(decimals);
    if (token === 'USDC') {
        return (cents * unit) / HUNDRED;
    }
    const numerator = cents * unit * eurcPerUsdMicro;
    const denominator = HUNDRED * MICRO;
    return (numerator + denominator - BigInt(1)) / denominator;
}

/** Base units to a decimal string without trailing zeros ("5.000137", "5"). */
export function formatBase(amount: bigint, decimals: number): string {
    const unit = TEN ** BigInt(decimals);
    const whole = amount / unit;
    const frac = (amount % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : String(whole);
}

/** `co_<16 hex>`. */
export const ORDER_ID_RE = /^co_[0-9a-f]{16}$/;

/** The 32-byte TIP-20 memo of an order: the ASCII text `tt:<orderId>`, right-padded with zeros. */
export const tip20Memo = (orderId: string): string => encodeBytes32String(`tt:${orderId}`).toLowerCase();

/** The ShelterSplit memo of a shelter cat order: `tt:cat:<16 hex>` (also the keeper's memo). */
export const catSplitMemo = (orderId: string): string => `tt:cat:${orderId.replace(/^co_/, '')}`;

/** Unique key of a reserved `amount`-bound option: one open order per chain, token and exact amount. */
export const amountKey = (chainId: number, tokenAddress: string, amount: bigint): string =>
    `${chainId}:${tokenAddress.toLowerCase()}:${amount.toString()}`;

export interface TxStep {
    kind: 'transfer' | 'transferWithMemo' | 'approve' | 'disburse';
    to: string;
    data: string;
    value: '0';
}

export function paymentSteps({
    route,
    tokenAddress,
    recipient,
    amount,
    memo,
}: {
    route: PaymentRoute;
    tokenAddress: string;
    recipient: string;
    amount: bigint;
    memo: string | null;
}): TxStep[] {
    const token = getAddress(tokenAddress);
    const to = getAddress(recipient);
    if (route === 'transfer') {
        return [
            {
                kind: 'transfer',
                to: token,
                data: erc20PayInterface.encodeFunctionData('transfer', [to, amount]),
                value: '0',
            },
        ];
    }
    if (route === 'transferWithMemo') {
        return [
            {
                kind: 'transferWithMemo',
                to: token,
                data: tip20MemoInterface.encodeFunctionData('transferWithMemo', [to, amount, memo]),
                value: '0',
            },
        ];
    }
    return [
        { kind: 'approve', to: token, data: erc20PayInterface.encodeFunctionData('approve', [to, amount]), value: '0' },
        {
            kind: 'disburse',
            to,
            data: shelterSplitInterface.encodeFunctionData('disburse', [amount, memo]),
            value: '0',
        },
    ];
}

/** The fields of a JSON-RPC / ethers receipt log the check reads. */
export interface ReceiptLog {
    address: string;
    topics: readonly string[];
    data: string;
}

export interface PaymentOptionToCheck {
    route: PaymentRoute;
    binding: PaymentBinding;
    tokenAddress: string;
    recipient: string;
    /** Base units, decimal string. */
    amount: string;
    memo: string | null;
}

export type PaymentCheckFailure = 'NO_MATCHING_TRANSFER' | 'UNDERPAID';

export interface PaymentCheck {
    ok: boolean;
    reason?: PaymentCheckFailure;
    /** What reached the recipient for this order, in base units. */
    paid?: bigint;
    /** The token sender of the matched log (lowercased). */
    payer?: string;
    /** Split route: what the split paid its shelters in this batch (base units). */
    toShelters?: bigint;
    toTreasury?: bigint;
}

const topicAddress = (topic: string | undefined) => ('0x' + String(topic || '').slice(-40)).toLowerCase();
const same = (a: string, b: string) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function transfersTo(logs: readonly ReceiptLog[], token: string, recipient: string) {
    const out: { from: string; value: bigint }[] = [];
    for (const log of logs || []) {
        if (!same(log.address, token) || String(log.topics?.[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
        if (log.topics.length < 3 || topicAddress(log.topics[2]) !== recipient.toLowerCase()) continue;
        try {
            out.push({ from: topicAddress(log.topics[1]), value: BigInt(log.data) });
        } catch {
            // A malformed log is not a payment.
        }
    }
    return out;
}

/**
 * Checks the logs of a successful receipt against one accepted option. Only logs emitted by the
 * option's token contract (and, for the split route, by the split itself) count, so another contract
 * cannot fake a payment.
 *
 * - `transfer` + `amount`: a `Transfer(_, recipient, amount)` of exactly `amount`. A transfer to the
 *   recipient a little below it (an exchange withdrawal that took a fee) is `UNDERPAID`, so support can
 *   find it; it is never accepted.
 * - `transferWithMemo` + `memo`: a `TransferWithMemo(_, recipient, value, memo)` with value >= amount.
 *   Only the memo binds: a memo-route amount carries no unique tag, so every order of one item has the
 *   same amount, and a plain `Transfer` (which TIP-20 also emits for every memo transfer) never counts.
 *   Otherwise anyone could confirm another buyer's payment against their own order.
 * - `split` + `memo`: the split's `DisbursementBatch` with this memo and amount >= `amount`, and a token
 *   `Transfer` into the split in the same transaction.
 */
export function checkPayment(logs: readonly ReceiptLog[], option: PaymentOptionToCheck): PaymentCheck {
    const amount = BigInt(option.amount);
    const token = option.tokenAddress;
    const recipient = option.recipient;

    if (option.route === 'split') {
        let underpaid: bigint | null = null;
        for (const log of logs || []) {
            if (!same(log.address, recipient) || String(log.topics?.[0] || '').toLowerCase() !== TOKEN_BATCH_TOPIC) {
                continue;
            }
            let parsed;
            try {
                parsed = shelterSplitInterface.parseLog({ topics: [...log.topics], data: log.data });
            } catch {
                continue;
            }
            if (!parsed || String(parsed.args.memo) !== option.memo) continue;
            const batchAmount = BigInt(parsed.args.amount);
            if (batchAmount < amount) {
                underpaid = batchAmount;
                continue;
            }
            const pulled = transfersTo(logs, token, recipient);
            if (!pulled.length) continue;
            return {
                ok: true,
                paid: batchAmount,
                payer: String(parsed.args.payer).toLowerCase(),
                toShelters: BigInt(parsed.args.toShelters),
                toTreasury: BigInt(parsed.args.toTreasury),
            };
        }
        return underpaid !== null
            ? { ok: false, reason: 'UNDERPAID', paid: underpaid }
            : { ok: false, reason: 'NO_MATCHING_TRANSFER' };
    }

    if (option.route === 'transferWithMemo' && option.memo) {
        let underpaid: bigint | null = null;
        for (const log of logs || []) {
            if (!same(log.address, token) || String(log.topics?.[0] || '').toLowerCase() !== TRANSFER_WITH_MEMO_TOPIC) {
                continue;
            }
            if (log.topics.length < 4 || topicAddress(log.topics[2]) !== recipient.toLowerCase()) continue;
            if (String(log.topics[3]).toLowerCase() !== option.memo.toLowerCase()) continue;
            let value: bigint;
            try {
                value = BigInt(log.data);
            } catch {
                continue;
            }
            if (value < amount) {
                underpaid = value;
                continue;
            }
            return { ok: true, paid: value, payer: topicAddress(log.topics[1]) };
        }
        return underpaid !== null
            ? { ok: false, reason: 'UNDERPAID', paid: underpaid }
            : { ok: false, reason: 'NO_MATCHING_TRANSFER' };
    }
    if (option.binding !== 'amount') {
        // A memo-bound option is matched by its memo only (above); never by amount.
        return { ok: false, reason: 'NO_MATCHING_TRANSFER' };
    }

    const transfers = transfersTo(logs, token, recipient);
    const exact = transfers.find(t => t.value === amount);
    if (exact) {
        return { ok: true, paid: exact.value, payer: exact.from };
    }
    const near = transfers.find(
        t => t.value < amount && t.value * UNDERPAID_WINDOW_DEN >= amount * UNDERPAID_WINDOW_NUM
    );
    return near ? { ok: false, reason: 'UNDERPAID', paid: near.value } : { ok: false, reason: 'NO_MATCHING_TRANSFER' };
}

/** A transfer within 5% below the exact amount is reported as UNDERPAID (support can match it by hand). */
const UNDERPAID_WINDOW_NUM = BigInt(95);
const UNDERPAID_WINDOW_DEN = BigInt(100);

export const TX_HASH_RE = /^0x[0-9a-f]{64}$/;
