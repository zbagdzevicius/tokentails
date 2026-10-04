import { getAddress, getBigInt } from 'ethers';
import { DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC, shelterSplitInterface } from 'src/shelter/onchain/shelter-chain';

/*
 * ShelterSplit payout logs, decoded the same way as client/components/shelter-payouts/logs.ts and
 * catnip-heist/src/ui/payouts.ts (plan F7.3). shared/fixtures/shelter-logs.json pins all three to
 * identical totals. Memos are decoded in full: never reuse the 64-character truncation of
 * shelter-rail/src/widget.js:111, which is for display only.
 */

export const PAYOUT_TOPICS = [DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC];

/** A log exactly as `eth_getLogs` returns it over JSON-RPC (hex quantities). */
export interface RpcLog {
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
    blockHash?: string;
    removed?: boolean;
}

export type PayoutKind = 'token' | 'native';

export interface DecodedPayout {
    kind: PayoutKind;
    contract: string;
    shelter: string;
    /** Raw units of the payout: native decimals for `native`, token decimals for `token`. */
    amount: bigint;
    /** Rescaled to 18 decimals, so native and token amounts of one symbol add up. */
    amount18: bigint;
    symbol: string;
    memo: string;
    txHash: string;
    blockNumber: number;
    blockHash: string | null;
    logIndex: number;
}

/** Decimals and symbol per chain, the same table as the client's `chains.ts` for the Arc chains. */
export interface ChainUnits {
    decimals: number;
    symbol: string;
    nativeDecimals: number;
    nativeSymbol: string;
}

export const IMPACT_CHAIN_UNITS: Record<number, ChainUnits> = {
    5042: { decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'USDC' },
    5042002: { decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'USDC' },
};

/** Arc's units apply to any chain not listed (ShelterSplit is deployed on Arc only, decision #97). */
export const unitsFor = (chainId: number): ChainUnits => IMPACT_CHAIN_UNITS[chainId] || IMPACT_CHAIN_UNITS[5042];

const hexNumber = (value: string): number => {
    const n = Number.parseInt(String(value), 16);
    if (!Number.isSafeInteger(n) || n < 0) {
        throw new Error(`bad hex quantity: ${value}`);
    }
    return n;
};

export function to18(amount: bigint, decimals: number): bigint {
    if (decimals > 18 || decimals < 0) {
        throw new Error('unsupported decimals');
    }
    return amount * getBigInt('1' + '0'.repeat(18 - decimals));
}

/** True for a Disbursed or NativeDisbursed log. Anything else in a receipt is not a payout. */
export function isPayoutLog(log: Pick<RpcLog, 'topics'>): boolean {
    const topic = log?.topics?.[0]?.toLowerCase();
    return topic === DISBURSED_TOPIC || topic === NATIVE_DISBURSED_TOPIC;
}

/** Decodes one payout log. Throws on anything that is not a well-formed Disbursed/NativeDisbursed. */
export function decodePayoutLog(log: RpcLog, chainId: number): DecodedPayout {
    if (!isPayoutLog(log)) {
        throw new Error('not a Disbursed or NativeDisbursed log');
    }
    const parsed = shelterSplitInterface.parseLog({ topics: log.topics, data: log.data });
    if (!parsed) {
        throw new Error('undecodable payout log');
    }
    const kind: PayoutKind = log.topics[0].toLowerCase() === NATIVE_DISBURSED_TOPIC ? 'native' : 'token';
    const units = unitsFor(chainId);
    const decimals = kind === 'native' ? units.nativeDecimals : units.decimals;
    const amount = getBigInt(parsed.args.amount);
    return {
        kind,
        contract: getAddress(log.address).toLowerCase(),
        shelter: getAddress(parsed.args.shelter).toLowerCase(),
        amount,
        amount18: to18(amount, decimals),
        symbol: kind === 'native' ? units.nativeSymbol : units.symbol,
        memo: String(parsed.args.memo),
        txHash: String(log.transactionHash).toLowerCase(),
        blockNumber: hexNumber(log.blockNumber),
        blockHash: log.blockHash ? String(log.blockHash).toLowerCase() : null,
        logIndex: hexNumber(log.logIndex),
    };
}

/**
 * Where a payout came from (plan F7.3, attribution by tx hash). Never drops a log: anything that
 * matches no known source is `direct`.
 */
export const PAYOUT_BUCKETS = ['heist', 'page', 'paws', 'x402', 'wallet', 'match', 'direct'] as const;
export type PayoutBucket = typeof PAYOUT_BUCKETS[number];

export const PAW_MEMO_PREFIX = 'tt:paws:';
/** Token Tails' 1:1 match of a wallet gift (ShelterMatch). */
export const MATCH_MEMO_PREFIX = 'tt:match:';
/**
 * Memos the router writes: relayed wallet gifts (`tt:wallet:<hex>`) and flushes (`tt:flush`). A flush
 * pushes untraced plain transfers to the router into the split: it is never a public wallet gift.
 */
export const WALLET_MEMO_PREFIXES = ['tt:wallet', 'tt:flush'];
export const FLUSH_MEMO = 'tt:flush';

export interface AttributionLookups {
    /** `ShelterDonation.txHash` (lowercased) to its `source`. */
    donationSourceByTx: Map<string, string>;
    /** `X402UsedTx.txHash` values (lowercased). */
    x402Txs: Set<string>;
    /**
     * Addresses (lowercased) allowed to settle paws: the hot wallet and IMPACT_PAWS_SENDERS. Empty or
     * absent: no payout is ever `paws`.
     */
    pawSenders?: Set<string>;
    /** `ShelterMatch.matchTxHash` values (lowercased): matches Token Tails actually sent. */
    matchTxs?: Set<string>;
    /** The DonateRouter address (lowercased). Absent: no payout is ever `wallet`. */
    router?: string | null;
    /**
     * Donors (lowercased) whose router gifts are not public: Token Tails senders, SHELTER_MATCH_EXCLUDE,
     * the treasury. A router gift from one of them stays `direct`.
     */
    notPublic?: Set<string>;
}

/** True for a memo that claims to be a nightly paw settlement. Anyone can write it; see attributePayout. */
export const hasPawMemo = (memo: string): boolean => String(memo || '').startsWith(PAW_MEMO_PREFIX);
export const hasMatchMemo = (memo: string): boolean => String(memo || '').startsWith(MATCH_MEMO_PREFIX);
export const hasWalletMemo = (memo: string): boolean =>
    WALLET_MEMO_PREFIXES.some(prefix => String(memo || '').startsWith(prefix));
/** Memos whose bucket depends on the transaction sender (a Token Tails sender). */
export const needsSender = (memo: string): boolean => hasPawMemo(memo) || hasMatchMemo(memo);

/**
 * `from` is the transaction sender (lowercased), when known. ShelterSplit.donate(memo) is public, so a
 * `tt:paws:` memo alone proves nothing: a payout is `paws` only when it also comes from a paw sender
 * (until task 4f matches settlement rows). Anything else with that memo is `direct` (or `x402`).
 */
/**
 * `payer` is the ShelterSplit batch event's payer in the same transaction (lowercased), when known;
 * `donor` is the router's RouterDonation donor in that transaction.
 *
 * - `match`: a `tt:match:` memo, sent by a Token Tails sender, in a transaction ShelterMatch recorded.
 * - `wallet`: any memo except `tt:flush` whose batch payer is the router (only the router can be the
 *   payer of its own calls into the split, so a stranger cannot fake it), from a known donor that is
 *   not in `notPublic` and is not the shelter paid (a round trip).
 * Anyone can write either memo by hand; without the second proof it stays `direct`.
 */
export function attributePayout(
    payout: Pick<DecodedPayout, 'txHash' | 'memo'> & {
        from?: string | null;
        payer?: string | null;
        donor?: string | null;
        shelter?: string | null;
    },
    lookups: AttributionLookups
): PayoutBucket {
    const tx = payout.txHash.toLowerCase();
    const source = lookups.donationSourceByTx.get(tx);
    if (source === 'heist' || source === 'page') {
        return source;
    }
    const from = typeof payout.from === 'string' ? payout.from.toLowerCase() : null;
    if (hasPawMemo(payout.memo) && from && lookups.pawSenders?.has(from)) {
        return 'paws';
    }
    if (hasMatchMemo(payout.memo) && from && lookups.pawSenders?.has(from) && lookups.matchTxs?.has(tx)) {
        return 'match';
    }
    const payer = typeof payout.payer === 'string' ? payout.payer.toLowerCase() : null;
    const router = lookups.router ? lookups.router.toLowerCase() : null;
    const donor = typeof payout.donor === 'string' ? payout.donor.toLowerCase() : null;
    const shelter = typeof payout.shelter === 'string' ? payout.shelter.toLowerCase() : null;
    if (
        router &&
        payer === router &&
        !String(payout.memo || '').startsWith(FLUSH_MEMO) &&
        donor &&
        donor !== shelter &&
        !lookups.notPublic?.has(donor)
    ) {
        return 'wallet';
    }
    if (lookups.x402Txs.has(tx)) {
        return 'x402';
    }
    return 'direct';
}

/** Sums 18-decimal amounts per key. Pure; used by the snapshot and the parity spec. */
export function sumBy<T>(items: T[], key: (item: T) => string, amount: (item: T) => bigint): Record<string, string> {
    const totals = new Map<string, bigint>();
    for (const item of items) {
        const k = key(item);
        totals.set(k, (totals.get(k) || getBigInt(0)) + amount(item));
    }
    return Object.fromEntries([...totals].map(([k, v]) => [k, v.toString()]));
}
