import { PackType, ProductType } from 'src/web3/order.schema';

/**
 * Server-side catalogue prices in USD cents. Stripe amounts are computed from this table only;
 * amounts sent by the client are ignored.
 *
 * Portraits match the client purchase options (client/features/portrait/components/PreviewPage.tsx).
 *
 * The Legendary pack's regular price is $350 (founder, 2026-10-04). Until LEGENDARY_PROMO_ENDS_AT it is
 * on sale for $100; `getPackPriceCents` applies the sale, so Stripe and the crypto checkout charge the
 * same amount. Client copies: `packPrices` and `LEGENDARY_PROMO` in client/models/order.ts
 * (docs/DEVELOPMENT.md lists every copy).
 */
export const PORTRAIT_PRICES_CENTS: Readonly<Record<ProductType, number>> = {
    [ProductType.DIGITAL]: 600,
    [ProductType.PRINT]: 4900,
    [ProductType.CANVAS]: 6900,
};

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

export function getPortraitPriceCents(productType: ProductType): number {
    const price = PORTRAIT_PRICES_CENTS[productType];
    if (!price) {
        throw new Error(`No server price for portrait product "${productType}"`);
    }
    return price;
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
