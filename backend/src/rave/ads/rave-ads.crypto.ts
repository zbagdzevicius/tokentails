import { randomInt } from 'crypto';
import { amountKey, AMOUNT_TAG_MAX, AMOUNT_TAG_MIN, priceBase } from 'src/payments/crypto/crypto-evm';
import { readCryptoPayConfig } from 'src/payments/crypto/crypto-pay.config';
import { RAVE_USDC_CHAIN_IDS } from '../rave.config';

/*
 * Moon Rave ad crypto: USDC on Arc only, a plain ERC-20 `transfer` to the Token Tails treasury
 * (treasury.public.ts, via readCryptoPayConfig, so the checkout network and the custody rule apply). Ad money
 * is Token Tails revenue, so it goes to the treasury, not the shelter split. The payment is bound to the ad by
 * its exact amount: $100 plus RAVE_AD_TAG_OFFSET plus a unique tag of 1 to 9,999 base units (about one cent
 * in all), the crypto checkout's `amount` binding (crypto-evm.ts priceBase / amountKey / checkPayment). The
 * offset keeps ad amounts out of the range a crypto pack checkout of the same price uses (its tags are
 * 1 to 9,999 on the same treasury), so one transfer can never match both an ad and a pack. No card fee. A rejected ad, or a
 * payment that lands after its slot went to someone else, is refunded BY HAND to the paying wallet
 * (`refund.state: 'manual'`); there is no automatic on-chain refund.
 */

export interface RaveAdUsdcTarget {
    chainId: number;
    rpcUrl: string;
    /** The USDC token contract (6 decimals on Arc). */
    token: string;
    decimals: number;
    /** The Token Tails treasury on that chain. */
    recipient: string;
    testnet: boolean;
}

/** The ad payment (`usdc` on the ad): what the wallet sends and, once seen, the tx that paid it. */
export interface RaveAdUsdc {
    chainId: number;
    token: string;
    decimals: number;
    recipient: string;
    /** Exact base units, decimal string. */
    amount: string;
    txHash?: string;
    reportedAt?: Date;
    payer?: string;
    paidAt?: Date;
    /** A transfer to the treasury a little below `amount` (not accepted; refund by hand). */
    underpaidTx?: string;
    underpaidAmount?: string;
}

/**
 * The Arc USDC payment target of the checkout network, or null when none resolves: no Arc chain on the
 * network, no treasury there, or a testnet in production.
 */
export function raveAdUsdcTarget(env: NodeJS.ProcessEnv, production: boolean): RaveAdUsdcTarget | null {
    const pay = readCryptoPayConfig(env);
    for (const resolved of pay.chains) {
        if (!RAVE_USDC_CHAIN_IDS.includes(resolved.chain.chainId) || !resolved.treasury) continue;
        if (production && resolved.chain.testnet) continue;
        const usdc = resolved.tokens.find(t => t.token === 'USDC' && !t.testOnly);
        if (!usdc) continue;
        return {
            chainId: resolved.chain.chainId,
            rpcUrl: resolved.rpcUrl,
            token: usdc.address,
            decimals: usdc.decimals,
            recipient: resolved.treasury,
            testnet: resolved.chain.testnet,
        };
    }
    return null;
}

/**
 * Added to every ad amount, above the crypto checkout's largest tag (AMOUNT_TAG_MAX): an ad's $100.01xxxx
 * never equals a $100 pack's $100.00xxxx on the same treasury.
 */
export const RAVE_AD_TAG_OFFSET = AMOUNT_TAG_MAX + 1;

/** `priceCents` in USDC base units plus RAVE_AD_TAG_OFFSET plus a random tag in [AMOUNT_TAG_MIN, AMOUNT_TAG_MAX]. */
export function raveAdUsdcAmount(
    priceCents: number,
    decimals: number,
    tag: number = randomInt(AMOUNT_TAG_MIN, AMOUNT_TAG_MAX + 1)
) {
    return priceBase(priceCents, 'USDC', decimals) + BigInt(RAVE_AD_TAG_OFFSET) + BigInt(tag);
}

/** The least and most a USDC ad of `priceCents` may ask for (the client checks the server's amount against it). */
export function raveAdUsdcRange(priceCents: number, decimals: number): { min: bigint; max: bigint } {
    const base = priceBase(priceCents, 'USDC', decimals) + BigInt(RAVE_AD_TAG_OFFSET);
    return { min: base + BigInt(AMOUNT_TAG_MIN), max: base + BigInt(AMOUNT_TAG_MAX) };
}

export const raveAdAmountKey = (target: Pick<RaveAdUsdcTarget, 'chainId' | 'token'>, amount: bigint) =>
    amountKey(target.chainId, target.token, amount);
