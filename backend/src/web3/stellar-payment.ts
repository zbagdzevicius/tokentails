import { CurrencyType } from 'src/shared/interfaces/currency.interface';

/**
 * Pure Stellar payment checks shared by `Web3Service.validatePrice` (live verification) and
 * `scripts/audit-orders.js` (read-only audit of past orders). No network or database access here.
 */

/** Public receiving account. Same value as `recipientStellar` in client/web3/contracts.ts. */
export const DEFAULT_STELLAR_TREASURY = 'GD7GM5KP5B7MQ3NLYTLWA2EXEGGCWOTUVDP6WZIQDUPLQ7E2F67QKHSW';
/** Circle USDC issuer. Same value as `currencyContracts.STELLAR.USDC` in client/web3/contracts.ts. */
export const DEFAULT_STELLAR_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

/**
 * The client quotes XLM as ceil(usdPrice / rate) using GET /cat/rates (Binance XLMUSDC) and pays
 * immediately. Verification re-reads the live rate, so allow this much movement in between.
 */
export const XLM_RATE_TOLERANCE = 0.03;

const STROOPS_PER_UNIT = 10_000_000;
const STELLAR_HASH = /^[0-9a-f]{64}$/i;

export function getStellarTreasury(): string {
    return process.env.STELLAR_TREASURY_ADDRESS || DEFAULT_STELLAR_TREASURY;
}

export function getStellarUsdcIssuer(): string {
    return process.env.STELLAR_USDC_ISSUER || DEFAULT_STELLAR_USDC_ISSUER;
}

export function isStellarTxHash(hash: unknown): hash is string {
    return typeof hash === 'string' && STELLAR_HASH.test(hash);
}

export type StellarAsset = { type: 'native' } | { type: 'credit'; code: string; issuer: string };

/** The asset a Stellar order must be paid in, or null when the currency is not accepted. */
export function expectedStellarAsset(currencyType?: CurrencyType | string): StellarAsset | null {
    if (currencyType === CurrencyType.XLM) {
        return { type: 'native' };
    }
    if (currencyType === CurrencyType.USDC) {
        return { type: 'credit', code: CurrencyType.USDC, issuer: getStellarUsdcIssuer() };
    }
    // USDT has no configured Stellar issuer and the client does not offer it.
    return null;
}

/**
 * Parses a Horizon amount string ("12.3400000") into integer stroops without floating point error.
 * Integers stay exact up to about 900 million units, far above any order here.
 */
export function toStroops(amount: string | number | undefined | null): number {
    if (amount === undefined || amount === null) {
        return 0;
    }
    const text = typeof amount === 'number' ? amount.toFixed(7) : amount.trim();
    const match = /^(\d+)(?:\.(\d{0,7}))?$/.exec(text);
    if (!match) {
        return 0;
    }
    const [, whole, fraction = ''] = match;
    return Number(whole) * STROOPS_PER_UNIT + Number(fraction.padEnd(7, '0'));
}

export function stroopsToUnits(stroops: number): number {
    return stroops / STROOPS_PER_UNIT;
}

/**
 * Smallest amount, in stroops of the paid asset, that covers `priceUsdCents`.
 * USDC is 1:1 with USD. XLM uses the live USD rate minus `XLM_RATE_TOLERANCE`.
 */
export function minimumStroops(asset: StellarAsset, priceUsdCents: number, xlmUsdRate?: number): number {
    // 1 cent = 100,000 stroops of a USD stablecoin.
    const stablecoinStroops = Math.ceil(priceUsdCents) * 100_000;
    if (asset.type === 'credit') {
        return stablecoinStroops;
    }
    if (!xlmUsdRate || !Number.isFinite(xlmUsdRate) || xlmUsdRate <= 0) {
        throw new Error('A positive XLM/USD rate is required to price an XLM payment');
    }
    const xlm = ((priceUsdCents / 100) * (1 - XLM_RATE_TOLERANCE)) / xlmUsdRate;
    return Math.floor(xlm * STROOPS_PER_UNIT);
}

/** The fields of a Horizon transaction record this module reads. */
export interface HorizonTransaction {
    hash?: string;
    successful?: boolean;
    memo?: string;
    memo_type?: string;
    /** Present on a fee-bump transaction: the outer (fee-bump) envelope. */
    fee_bump_transaction?: { hash?: string };
    /** Present on a fee-bump transaction: the wrapped transaction that holds the operations. */
    inner_transaction?: { hash?: string };
}

/**
 * Horizon finds a fee-bump transaction by its own hash and by its inner transaction's hash, so one
 * payment answers to two strings. The key an order must hold is the outer hash: the fee-bump hash
 * when there is one, else the transaction hash.
 */
export function canonicalStellarHash(transaction: HorizonTransaction): string | undefined {
    const hash = transaction?.fee_bump_transaction?.hash || transaction?.hash;
    return hash ? hash.toLowerCase() : undefined;
}

/** Every hash Horizon resolves to this payment, lowercased, the canonical one first. */
export function stellarHashAliases(transaction: HorizonTransaction): string[] {
    const hashes = [
        canonicalStellarHash(transaction),
        transaction?.hash,
        transaction?.inner_transaction?.hash,
        transaction?.fee_bump_transaction?.hash,
    ]
        .filter((hash): hash is string => typeof hash === 'string' && hash !== '')
        .map(hash => hash.toLowerCase());
    return [...new Set(hashes)];
}

/** The fields of a Horizon payment or path payment operation record this module reads. */
export interface HorizonOperation {
    type?: string;
    to?: string;
    amount?: string;
    asset_type?: string;
    asset_code?: string;
    asset_issuer?: string;
    transaction_successful?: boolean;
}

const PAYMENT_TYPES = ['payment', 'path_payment_strict_send', 'path_payment_strict_receive'];

function isAsset(op: HorizonOperation, asset: StellarAsset): boolean {
    if (asset.type === 'native') {
        return op.asset_type === 'native';
    }
    return op.asset_type !== 'native' && op.asset_code === asset.code && op.asset_issuer === asset.issuer;
}

export type StellarPaymentFailure = 'TX_NOT_SUCCESSFUL' | 'NO_PAYMENT_TO_TREASURY' | 'WRONG_ASSET' | 'UNDERPAID';

export interface StellarPaymentCheck {
    ok: boolean;
    reason?: StellarPaymentFailure;
    /** Sum of payments to the treasury in the expected asset, in stroops. */
    paidStroops: number;
}

/**
 * Checks that a transaction succeeded and paid at least `minStroops` of `asset` to `destination`.
 * Several matching operations in one transaction are summed; payments elsewhere are ignored.
 */
export function checkStellarPayment({
    transaction,
    operations,
    destination,
    asset,
    minStroops,
}: {
    transaction: HorizonTransaction;
    operations: HorizonOperation[];
    destination: string;
    asset: StellarAsset;
    minStroops: number;
}): StellarPaymentCheck {
    if (transaction?.successful !== true) {
        return { ok: false, reason: 'TX_NOT_SUCCESSFUL', paidStroops: 0 };
    }

    const toTreasury = (operations || []).filter(
        op => PAYMENT_TYPES.includes(op.type || '') && op.to === destination && op.transaction_successful !== false
    );
    if (!toTreasury.length) {
        return { ok: false, reason: 'NO_PAYMENT_TO_TREASURY', paidStroops: 0 };
    }

    const inAsset = toTreasury.filter(op => isAsset(op, asset));
    if (!inAsset.length) {
        return { ok: false, reason: 'WRONG_ASSET', paidStroops: 0 };
    }

    const paidStroops = inAsset.reduce((sum, op) => sum + toStroops(op.amount), 0);
    if (paidStroops < minStroops) {
        return { ok: false, reason: 'UNDERPAID', paidStroops };
    }
    return { ok: true, paidStroops };
}
