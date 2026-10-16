import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'crypto';
import { getAddress, Wallet } from 'ethers';
import { shelterSplitInterface } from '../onchain/shelter-chain';

/*
 * Motored × Stripe (tracks/motored-stripe/PLAN.md): one gift to Pink Paw for every real Motored order
 * paid through Stripe. No on/off flag: motored is open whenever every required secret below is set
 * (motoredMissing() is empty). The chain, split and shelter come from the live shelter config
 * (readShelterConfig: Arc mainnet in production), so the keeper follows the same network as every
 * other shelter payout; the constants here are that mainnet truth, used as the split-safety check's
 * expectation and as the defaults when the shelter config has no split yet.
 *
 * Required secrets (names in backend/.env.example; the founder fills backend/.env and the production
 * env, the AI never reads or writes .env):
 * - MOTORED_STRIPE_WEBHOOK_SECRET: the signing secret of POST /shelter/motored/stripe.
 * - MOTORED_FUNDER_KEY: the key of the Motored funder 0xF1d7…688f, which holds the USDC to give and
 *   tops up each customer wallet (amount + gas) before it donates.
 * - MOTORED_WALLET_KEK: key-encryption key; every customer wallet key is stored in motored_wallets
 *   encrypted at rest with this (aes-128-ctr), never logged, never returned by an API.
 * - MOTORED_CUSTOMER_SALT: HMAC/derive salt for customerKey = sha256(salt + stripe customer id).
 * - MOTORED_AMOUNT_SALT: salt for the deterministic per-order amount.
 * - MOTORED_DAILY_CAP_USD: above this, due rows wait (as `due`) and an alert goes out.
 */

/** The Motored funder (related party: Motored is the founder's company). */
export const MOTORED_FUNDER = '0xF1d715677877428aE8E95E8ff5385EC44F84688f';
/** The Arc mainnet ShelterSplit 100% to Pink Paw. */
export const MOTORED_SPLIT = '0x457c89e10a6e66633eda5bf82fd086febb5db147';
/** Pink Paw's wallet. */
export const MOTORED_SHELTER = '0x3c833562e682dB66C2415b34961595df135f4771';
/** Arc mainnet (chainId 5042); the keeper follows the shelter config's chain for tests (5042002). */
export const MOTORED_MAINNET_CHAIN_ID = 5042;

/** Amount rule: random whole cents 1¢ to $1.00 per paid order, independent of the order total. */
export const MOTORED_AMOUNT_RULE = 'random-1-100c-v1';
export const MOTORED_AMOUNT_MIN_CENTS = 1;
export const MOTORED_AMOUNT_MAX_CENTS = 100;

/**
 * The first real-customer label: round 3 ended at user-480, so the Stripe customers start at user-481
 * (round labels user-1..user-480 are never reused — a wallet must always map to exactly one customer).
 */
export const MOTORED_FIRST_CUSTOMER_N = 481;

/** How long a `sent` gift without a receipt and a used nonce is `failed` for a person to check. */
export const MOTORED_STUCK_MS = 30 * 60 * 1000;
/** The keeper runs every 5 minutes and only retries `due` rows (never resends a `sent` row). */
export const MOTORED_GIFT_CRON = '*/5 * * * *';
/** Funder low-balance alert threshold: below 3 days of the average confirmed gift. */
export const MOTORED_LOW_BALANCE_DAYS = 3;
/** The donate() gas-limit estimate (same fallback as the event's plan.mjs; the fee cap scales with live gas). */
export const MOTORED_DONATE_ESTIMATE = 60000;

export interface MotoredConfig {
    webhookSecret: string | null;
    funderKey: string | null;
    /** The funder's address, derived from funderKey (lowercased); null when the key is unusable. */
    funderAddress: string | null;
    walletKek: string | null;
    customerSalt: string | null;
    amountSalt: string | null;
    dailyCapUsd: number;
    /** Optional fixed EUR -> USD rate recorded on EUR rows (default 1.0; USD rows omit it). */
    eurUsdRate: number;
    production: boolean;
}

export function readMotoredConfig(env: NodeJS.ProcessEnv = process.env): MotoredConfig {
    const webhookSecret = (env.MOTORED_STRIPE_WEBHOOK_SECRET || '').trim() || null;
    const funderKey = (env.MOTORED_FUNDER_KEY || '').trim() || null;
    const walletKek = (env.MOTORED_WALLET_KEK || '').trim() || null;
    const customerSalt = (env.MOTORED_CUSTOMER_SALT || '').trim() || null;
    const amountSalt = (env.MOTORED_AMOUNT_SALT || '').trim() || null;
    const rawCap = (env.MOTORED_DAILY_CAP_USD || '').trim();
    const dailyCapUsd = /^\d{1,7}(\.\d{1,4})?$/.test(rawCap) ? Number(rawCap) : 0;
    const rawRate = (env.MOTORED_EUR_USD_RATE || '').trim();
    const eurUsdRate = /^\d{1,3}(\.\d{1,6})?$/.test(rawRate) ? Number(rawRate) : 1;
    let funderAddress: string | null = null;
    try {
        funderAddress = funderKey ? getAddress(new Wallet(funderKey).address).toLowerCase() : null;
    } catch {
        funderAddress = null;
    }
    return {
        webhookSecret,
        funderKey,
        funderAddress,
        walletKek,
        customerSalt,
        amountSalt,
        dailyCapUsd,
        eurUsdRate,
        production: (env.NODE_ENV || '').trim().toLowerCase() === 'production',
    };
}

/** The env names still missing (or unusable) for motored to open; empty when ready. */
export function motoredMissing(cfg: MotoredConfig): string[] {
    const missing: string[] = [];
    if (!cfg.webhookSecret) missing.push('MOTORED_STRIPE_WEBHOOK_SECRET');
    if (!cfg.funderKey || !cfg.funderAddress) missing.push('MOTORED_FUNDER_KEY');
    if (!cfg.walletKek) missing.push('MOTORED_WALLET_KEK');
    if (!cfg.customerSalt) missing.push('MOTORED_CUSTOMER_SALT');
    if (!cfg.amountSalt) missing.push('MOTORED_AMOUNT_SALT');
    if (!cfg.dailyCapUsd) missing.push('MOTORED_DAILY_CAP_USD');
    return missing;
}

export const motoredReady = (env: NodeJS.ProcessEnv = process.env) =>
    motoredMissing(readMotoredConfig(env)).length === 0;

// ------------------------------------------------------------------ pure helpers (ported from motored-event/lib.mjs)

/** `motored:user-N` — the N-th real Motored customer, kept for every order of that customer. */
export const motoredMemo = (n: number) => `motored:user-${n}`;
/** `motored:user-N-final` — the sweep memo, only when the customer is closed out (see Sweeps). */
export const motoredSweepMemo = (n: number) => `motored:user-${n}-final`;

/** sha256 hex of `MOTORED_CUSTOMER_SALT + id`; no raw customer id, email or name is ever stored. */
export function customerKey(customerId: string, salt: string): string {
    return createHash('sha256').update(`${salt}${customerId}`).digest('hex');
}

/** sha256 hex of `MOTORED_CUSTOMER_SALT + paymentId`: the unique gift key (idempotency) and the row key. */
export function paymentKey(paymentId: string, salt: string): string {
    return createHash('sha256').update(`${salt}${paymentId}`).digest('hex');
}

/**
 * The deterministic per-order amount, 1¢ to $1.00: `cents = 1 + uint32(sha256(MOTORED_AMOUNT_SALT +
 * paymentKey)) mod 100`. Anyone given the salt after the event can recompute every gift from its row;
 * there is no `Math.random()`. The public wording must be "Motored gives up to $1 to Pink Paw for
 * every order" — never a round-up or a percentage of the order.
 */
export function amountFor(paymentKeyValue: string, amountSalt: string): number {
    const digest = createHash('sha256').update(`${amountSalt}${paymentKeyValue}`).digest();
    const uint32 = digest.readUInt32LE(0);
    return MOTORED_AMOUNT_MIN_CENTS + (uint32 % (MOTORED_AMOUNT_MAX_CENTS - MOTORED_AMOUNT_MIN_CENTS + 1));
}

/** Gas terms from the live price and the donate() estimate (ported from motored-event/lib.mjs). */
export function motoredGasTerms({
    gasPriceWei,
    donateEstimate,
    fundEstimate = 21000,
}: {
    gasPriceWei: bigint;
    donateEstimate: number;
    fundEstimate?: number;
}): { feeCapWei: bigint; donateGasLimit: number; fundGasLimit: number } {
    const feeSafety = 1.5; // fee cap = live gas price x 1.5
    const limitMargin = 1.25; // donate() gas limit = estimate x 1.25
    const feeCapWei = BigInt(Math.round(Number(gasPriceWei) * feeSafety));
    return {
        feeCapWei,
        donateGasLimit: Math.ceil(donateEstimate * limitMargin),
        fundGasLimit: fundEstimate,
    };
}

/** The 128-bit AES key derived from MOTORED_WALLET_KEK (stable per kek, so rows survive key rotation). */
function walletKekKey(kek: string): Buffer {
    return Buffer.from(kek).length === 16 ? Buffer.from(kek) : scryptSync(kek, 'motored-wallet-v1', 16);
}

/** Encrypt a customer wallet's private key at rest with MOTORED_WALLET_KEK (aes-128-ctr, random IV). */
export function encryptWalletKey(privateKey: string, kek: string): { iv: string; content: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-128-ctr', walletKekKey(kek), iv);
    const content = Buffer.concat([cipher.update(Buffer.from(privateKey, 'utf8')), cipher.final()]);
    return { iv: iv.toString('hex'), content: content.toString('hex') };
}

/** Decrypt a customer wallet's private key stored with encryptWalletKey. */
export function decryptWalletKey(data: { iv: string; content: string }, kek: string): string {
    const iv = Buffer.from(data.iv, 'hex');
    const decipher = createDecipheriv('aes-128-ctr', walletKekKey(kek), iv);
    return Buffer.concat([decipher.update(Buffer.from(data.content, 'hex')), decipher.final()]).toString('utf8');
}

/** The donate() calldata for `memo`. */
export const motoredDonateData = (memo: string) => shelterSplitInterface.encodeFunctionData('donate', [memo]);
