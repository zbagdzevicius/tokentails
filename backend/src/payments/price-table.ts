import { PackType, ProductType } from 'src/web3/order.schema';

/**
 * Server-side catalogue prices in USD cents. Stripe amounts are computed from this table only;
 * amounts sent by the client are ignored.
 *
 * Portraits match the client purchase options (client/features/portrait/components/PreviewPage.tsx).
 *
 * DISCREPANCY: the Legendary pack is $350 here, taken from the backend odds comment in
 * src/shared/utils/content.utils.ts. The client pack modal (client/components/shared/PacksModal.tsx)
 * displays $400. Until a human picks one price, buyers are shown $400 and charged $350.
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

export function getPackPriceCents(packType: PackType): number {
    const price = PACK_PRICES_CENTS[packType];
    if (!price) {
        throw new Error(`No server price for pack "${packType}"`);
    }
    return price;
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
