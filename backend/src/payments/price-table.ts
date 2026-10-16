import { PackType, ProductType } from 'src/web3/order.schema';

/**
 * Server-side catalogue prices. Stripe amounts are computed from this table only; amounts sent by the
 * client are ignored.
 *
 * Portraits (bet #3, docs/plans/yourcat-v2.md section 6): the card checkout (Stripe Checkout Session on
 * /portrait, /portraits and /yourcat) charges euros, €14 / €49 / €69 (`PORTRAIT_CHECKOUT_PRICES_CENTS`).
 * The USD rails (the codex PaymentIntent and POST /web3/confirm) sell the digital portrait only, at $16
 * (`PORTRAIT_PRICES_CENTS`). Client copies: client/models/portrait-prices.ts, pinned by
 * client/__test__/portrait-prices.test.tsx (docs/DEVELOPMENT.md lists every copy).
 *
 * The Legendary pack's regular price is $350 (founder, 2026-10-04). Until LEGENDARY_PROMO_ENDS_AT it is
 * on sale for $100; `getPackPriceCents` applies the sale, so Stripe and the crypto checkout charge the
 * same amount. Client copies: `packPrices` and `LEGENDARY_PROMO` in client/models/order.ts
 * (docs/DEVELOPMENT.md lists every copy).
 */

/** USD rails (codex PaymentIntent, POST /web3/confirm), in USD cents. Digital only is sold there. */
export const PORTRAIT_PRICES_CENTS: Readonly<Record<ProductType, number>> = {
    [ProductType.DIGITAL]: 1600,
    [ProductType.PRINT]: 4900,
    [ProductType.CANVAS]: 6900,
};

/**
 * The retired $6 USD digital price. New intents are never created at it. The order audit accepts it as a
 * historical price, so digital portraits bought before the $16 price have no finding. A Stripe
 * PaymentIntent is verified against the amount the server stored on it (`expectedAmount`). The old backend
 * stored none, so a digital portrait intent without `expectedAmount` is held to this $6 floor: a payment
 * started before the deploy and confirmed after it still verifies. There is no date switch.
 */
export const PORTRAIT_LEGACY_DIGITAL_USD_CENTS = 600;

/** Card checkout (Stripe Checkout Session) for portraits: euros. Client copy: client/models/portrait-prices.ts. */
export const PORTRAIT_CHECKOUT_CURRENCY = 'eur' as const;

/** Card checkout prices in euro cents. */
export const PORTRAIT_CHECKOUT_PRICES_CENTS: Readonly<Record<ProductType, number>> = {
    [ProductType.DIGITAL]: 1400,
    [ProductType.PRINT]: 4900,
    [ProductType.CANVAS]: 6900,
};

/**
 * Stats only (user `spent`, order `priceUsd`); never charged or shown. Not a `currencyRate` entry, so
 * EUR never appears in GET /cat/rates or the web3 rate table.
 */
export const PORTRAIT_STATS_USD_PER_EUR = 1.15;

export const PACK_PRICES_CENTS: Readonly<Record<PackType, number>> = {
    [PackType.STARTER]: 500,
    [PackType.INFLUENCER]: 2500,
    [PackType.LEGENDARY]: 35000,
};

/** Legendary pack sale: $100 through 27 Nov 2026 23:59:59 UTC, then back to the regular price. */
export const LEGENDARY_PROMO_PRICE_CENTS = 10000;
/** First instant the sale no longer applies (exclusive end). Client copy: client/models/order.ts. */
export const LEGENDARY_PROMO_ENDS_AT = new Date('2026-11-28T00:00:00Z');

export function isLegendaryPromoActive(now: Date = new Date()): boolean {
    return now.getTime() < LEGENDARY_PROMO_ENDS_AT.getTime();
}

/**
 * A shelter cat bought on its own (Stripe or the crypto checkout): the basic tier only, $5 and never
 * discounted (founder, 2026-10-04: "each cat costs $5 and not less"). Higher tiers come only from
 * packs. One fixed price, with no env override, so the client copy (`Prices.shelterCat` in
 * client/models/cats.ts, docs/DEVELOPMENT.md) can never show a different amount than is charged.
 */
export const SHELTER_CAT_MIN_PRICE_CENTS = 500;

export function getShelterCatPriceCents(): number {
    return SHELTER_CAT_MIN_PRICE_CENTS;
}

/** Largest discount a code can give; see `discountPercentageForCode`. */
export const MAX_DISCOUNT_PERCENTAGE = 20;

export function isProductType(value: unknown): value is ProductType {
    return Object.values(ProductType).includes(value as ProductType);
}

export function isPackType(value: unknown): value is PackType {
    return Object.values(PackType).includes(value as PackType);
}

/** The price new USD portrait payments are created at: always the current table. */
export function getPortraitPriceCents(productType: ProductType): number {
    const price = PORTRAIT_PRICES_CENTS[productType];
    if (!price) {
        throw new Error(`No server price for portrait product "${productType}"`);
    }
    return price;
}

/** The card checkout price of a portrait, in euro cents. */
export function getPortraitCheckoutPrice(productType: ProductType): { cents: number; currency: 'eur' } {
    const cents = PORTRAIT_CHECKOUT_PRICES_CENTS[productType];
    if (!cents) {
        throw new Error(`No checkout price for portrait product "${productType}"`);
    }
    return { cents, currency: PORTRAIT_CHECKOUT_CURRENCY };
}

/** USD value, in dollars rounded to cents, of a euro-cent amount, for stats (user `spent`, order `priceUsd`). */
export function portraitPriceUsdForStats(eurCents: number): number {
    return Math.round(eurCents * PORTRAIT_STATS_USD_PER_EUR) / 100;
}

/** The regular (list) price, without the time-boxed sale. */
export function getPackRegularPriceCents(packType: PackType): number {
    const price = PACK_PRICES_CENTS[packType];
    if (!price) {
        throw new Error(`No server price for pack "${packType}"`);
    }
    return price;
}

/** The price charged now: the regular price, or the Legendary sale price while it runs. */
export function getPackPriceCents(packType: PackType, now: Date = new Date()): number {
    const regular = getPackRegularPriceCents(packType);
    if (packType === PackType.LEGENDARY && isLegendaryPromoActive(now)) {
        return LEGENDARY_PROMO_PRICE_CENTS;
    }
    return regular;
}

/**
 * Mirrors `POST /web3/validate-discount`: an existing code gives 10% for `sei` and `intern`,
 * 20% for any other code. The caller must first check the code belongs to a user.
 */
export function discountPercentageForCode(code: string): number {
    return ['sei', 'intern'].includes(code.toLowerCase()) ? 10 : MAX_DISCOUNT_PERCENTAGE;
}

export function applyDiscountCents(amountCents: number, percentage: number): number {
    if (!percentage) {
        return amountCents;
    }
    return Math.round((amountCents * (100 - percentage)) / 100);
}
