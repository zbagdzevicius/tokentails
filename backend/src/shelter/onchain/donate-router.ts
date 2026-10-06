import { getAddress, getBigInt, Interface, keccak256, AbiCoder, Signature, toUtf8Bytes } from 'ethers';

/*
 * DonateRouter (feature F1, contracts/shelter-split): an ownerless router in
 * front of ShelterSplit. A donor signs an EIP-3009 `receiveWithAuthorization` for USDC with the router
 * as the payee; anyone may submit it (the Token Tails relay pays the gas), and the router pulls the
 * USDC straight from the donor and disburses it through ShelterSplit in the same transaction. The
 * router has no owner and keeps no balance. The donor also signs the payout list (recipientsHash: every
 * shelter wallet and its exact amount), so a gift reverts with RecipientsChanged if that list changes
 * between signing and submitting. Until the shelter holds its own key (handover), the registered shelter
 * wallet is held by Token Tails; the relay refuses mainnet gifts until then.
 *
 * This file is the backend's copy of the shared interface. It does not change the Solidity.
 */

/** The signed fields of a gasless gift, as the router's `Gift` struct. */
const GIFT_TUPLE =
    'tuple(address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 salt, bytes32 recipients) gift';

export const DONATE_ROUTER_ABI = [
    `function donateWithAuthorization(${GIFT_TUPLE}, string memo, bytes signature) returns (uint256)`,
    `function donateWithAuthorizationVRS(${GIFT_TUPLE}, string memo, uint8 v, bytes32 r, bytes32 s) returns (uint256)`,
    'function donateNative(string memo, bytes32 expectedRecipients) payable returns (uint256)',
    'function flush(string memo) returns (uint256)',
    'function authNonce(bytes32 salt, string memo, bytes32 recipients) view returns (bytes32)',
    'function recipientsHash(uint256 amount) view returns (bytes32)',
    'function canDonate(uint256 value) view returns (bool, uint256)',
    'function split() view returns (address)',
    'function usdc() view returns (address)',
    'event RouterDonation(address indexed donor, uint256 amount, uint256 indexed batchId, uint8 path, string memo, bytes32 indexed nonce)',
    'error RecipientsChanged(bytes32 expected, bytes32 actual)',
    'error TreasuryShare(uint256 toTreasury)',
    'error SplitPaused()',
    'error ZeroAmount()',
    'error MemoTooLong()',
    'error WrongToken()',
    'error Reentrancy()',
    'error ApproveFailed()',
];

export const donateRouterInterface = new Interface(DONATE_ROUTER_ABI);

/** keccak256("RouterDonation(address,uint256,uint256,uint8,string,bytes32)"), lowercased. */
export const ROUTER_DONATION_TOPIC = donateRouterInterface.getEvent('RouterDonation')!.topicHash.toLowerCase();

/** `RouterDonation.path`: a signed authorization, a native-coin gift, or a flush of a stray balance. */
export const ROUTER_PATH = { AUTH: 0, NATIVE: 1, FLUSH: 2 } as const;
export type RouterPath = typeof ROUTER_PATH[keyof typeof ROUTER_PATH];

/** The minimal ERC-20 slice the relay and the match use. */
export const ERC20_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function name() view returns (string)',
    'function version() view returns (string)',
    'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
];
export const erc20Interface = new Interface(ERC20_ABI);

/** Memo of a wallet gift relayed by Token Tails: `tt:wallet:<8 hex>`, random, no personal data. */
export const RELAY_MEMO_RE = /^tt:wallet:[0-9a-f]{8}$/;
/** Memo the flush keeper sends. */
export const FLUSH_MEMO = 'tt:flush';
export const MATCH_MEMO_PREFIX = 'tt:match:';
export const WALLET_MEMO_PREFIX = 'tt:wallet';

/** The match memo for a donor transaction: `tt:match:<first 8 hex of the donor tx>`. */
export const matchMemo = (donorTxHash: string): string =>
    `${MATCH_MEMO_PREFIX}${String(donorTxHash).toLowerCase().slice(2, 10)}`;

/**
 * The EIP-3009 nonce the router uses for (salt, memo, recipients):
 * `keccak256(abi.encode(router, keccak256(bytes(memo)), salt, recipients))`. Binding the memo means a
 * relayer cannot swap the donor's memo, binding the router means the signature is useless to any other
 * payee, and binding `recipients` (router.recipientsHash(value) at signing) means the donor signs exactly
 * who gets paid.
 */
export function authNonce(router: string, salt: string, memo: string, recipients: string): string {
    const encoded = AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes32', 'bytes32', 'bytes32'],
        [getAddress(router), keccak256(toUtf8Bytes(memo)), salt, recipients]
    );
    return keccak256(encoded).toLowerCase();
}

/**
 * `keccak256(abi.encode(wallets, amounts))` of ShelterSplit.preview(amount), the same as
 * DonateRouter.recipientsHash: lets a client hash the payout list it shows the donor.
 */
export function recipientsHashOf(wallets: string[], amounts: (bigint | string | number)[]): string {
    const encoded = AbiCoder.defaultAbiCoder().encode(
        ['address[]', 'uint256[]'],
        [wallets.map(w => getAddress(w)), amounts.map(a => getBigInt(a))]
    );
    return keccak256(encoded).toLowerCase();
}

/** EIP-712 types of USDC's `receiveWithAuthorization` (EIP-3009). */
export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
    ReceiveWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
    ],
};

export interface UsdcDomain {
    /** The token's `name()`: "USDC" on Arc testnet (checked read-only 2026-10-04), "USD Coin" elsewhere. */
    name: string;
    /** The token's `version()`: "2" for Circle's FiatToken v2. */
    version: string;
    chainId: number;
    verifyingContract: string;
}

export interface RelayAuthorization {
    from: string;
    value: bigint | string;
    validAfter: bigint | string | number;
    validBefore: bigint | string | number;
    salt: string;
    memo: string;
    /** router.recipientsHash(value) when the donor signed. */
    recipients: string;
}

/**
 * The full typed-data payload a wallet signs (`eth_signTypedData_v4` or ethers `signTypedData`): the
 * payee is the router and the nonce is `authNonce(router, salt, memo, recipients)`.
 */
export function receiveWithAuthorizationTypedData(domain: UsdcDomain, router: string, auth: RelayAuthorization) {
    return {
        domain: { ...domain, verifyingContract: getAddress(domain.verifyingContract) },
        types: RECEIVE_WITH_AUTHORIZATION_TYPES,
        primaryType: 'ReceiveWithAuthorization' as const,
        message: {
            from: getAddress(auth.from),
            to: getAddress(router),
            value: getBigInt(auth.value).toString(),
            validAfter: getBigInt(auth.validAfter).toString(),
            validBefore: getBigInt(auth.validBefore).toString(),
            nonce: authNonce(router, auth.salt, auth.memo, auth.recipients),
        },
    };
}

const giftTuple = (auth: RelayAuthorization) => [
    getAddress(auth.from),
    getBigInt(auth.value),
    getBigInt(auth.validAfter),
    getBigInt(auth.validBefore),
    auth.salt,
    auth.recipients,
];

/** Calldata for the `bytes signature` overload. */
export function encodeDonateWithAuthorization(auth: RelayAuthorization, signature: string): string {
    return donateRouterInterface.encodeFunctionData('donateWithAuthorization', [giftTuple(auth), auth.memo, signature]);
}

/**
 * Calldata for the `(v, r, s)` overload, for tokens whose EIP-3009 only takes split signatures.
 * Null when `signature` is not a well-formed 65-byte signature.
 */
export function encodeDonateWithAuthorizationVRS(auth: RelayAuthorization, signature: string): string | null {
    const sig = splitSignature65(signature);
    if (!sig) {
        return null;
    }
    return donateRouterInterface.encodeFunctionData('donateWithAuthorizationVRS', [
        giftTuple(auth),
        auth.memo,
        sig.v,
        sig.r,
        sig.s,
    ]);
}

/** v, r, s of a 65-byte signature, or null for anything else (an ERC-1271 blob, a 64-byte compact one). */
export function splitSignature65(signature: string): { v: number; r: string; s: string } | null {
    if (!/^0x[0-9a-fA-F]{130}$/.test(String(signature))) {
        return null;
    }
    try {
        const sig = Signature.from(signature);
        return { v: sig.v, r: sig.r, s: sig.s };
    } catch {
        return null;
    }
}

export interface DecodedRouterDonation {
    donor: string;
    amount: bigint;
    batchId: bigint;
    path: number;
    /** Untrusted on the flush path: whoever calls flush first sets it. Never attribute a flush memo. */
    memo: string;
    /** The EIP-3009 nonce the donor signed (signed path); 0x00…00 on the native and flush paths. */
    nonce: string;
    txHash: string;
    blockNumber: number;
    logIndex: number;
    router: string;
}

/** Decodes one RouterDonation log (RPC shape or ethers Log). Null for any other log. */
export function decodeRouterDonation(log: {
    address: string;
    topics: readonly string[];
    data: string;
    transactionHash?: string;
    blockNumber?: number | string;
    logIndex?: number | string;
    index?: number;
}): DecodedRouterDonation | null {
    if (String(log?.topics?.[0] || '').toLowerCase() !== ROUTER_DONATION_TOPIC) {
        return null;
    }
    try {
        const parsed = donateRouterInterface.parseLog({ topics: [...log.topics], data: log.data });
        if (!parsed) {
            return null;
        }
        const num = (value: unknown) =>
            typeof value === 'number' ? value : value === undefined ? 0 : Number.parseInt(String(value), 16);
        return {
            donor: String(parsed.args.donor).toLowerCase(),
            amount: getBigInt(parsed.args.amount),
            batchId: getBigInt(parsed.args.batchId),
            path: Number(parsed.args.path),
            memo: String(parsed.args.memo),
            nonce: String(parsed.args.nonce).toLowerCase(),
            txHash: String(log.transactionHash || '').toLowerCase(),
            blockNumber: num(log.blockNumber),
            logIndex: num(log.logIndex ?? log.index),
            router: String(log.address).toLowerCase(),
        };
    } catch {
        return null;
    }
}

/**
 * Relay refusals. Bodies are `{ statusCode, code, message }` like the treat errors; the codes are
 * local to the relay (they are not in shared/errors.ts, so they never reach the game's error UI).
 */
export const RELAY_ERRORS = {
    RELAY_OFF: 'Wallet gifts through Token Tails are off right now.',
    RELAY_AWAITING_HANDOVER: 'Wallet gifts open once the shelter holds its own wallet.',
    RELAY_WRONG_CHAIN: 'This gift was signed for a different network.',
    RELAY_BAD_MEMO: 'The gift memo must look like tt:wallet:<8 hex>.',
    RELAY_AMOUNT: 'The gift amount is outside the allowed range.',
    RELAY_WINDOW:
        'The signature must be valid now (send validAfter 0) and stay valid for between 30 seconds and 10 minutes.',
    RELAY_DAILY_CAP: 'Token Tails has relayed all the wallet gifts it pays gas for today. You can still give directly.',
    RELAY_SIGNER_CAP: 'This wallet has used its relayed gifts for today. You can still give directly.',
    RELAY_REPLAY: 'This authorization was already used.',
    RELAY_BAD_SIGNATURE: 'The signature does not match the gift.',
    RELAY_RECIPIENTS_CHANGED: 'The shelter list changed after you signed. Nothing left your wallet. Please sign again.',
    RELAY_REJECTED: 'The network would refuse this gift.',
    RELAY_SPLIT_UNAVAILABLE:
        'The shelter split cannot take this gift right now (paused, or part would not reach a shelter). Nothing left your wallet.',
    RELAY_SEND_FAILED: 'The gift could not be relayed. Nothing left your wallet. Please try again later.',
} as const;
export type RelayErrorCode = keyof typeof RELAY_ERRORS;
