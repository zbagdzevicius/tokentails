import {
    getPackPriceCents,
    getShelterCatPriceCents,
    isPackType,
    isProductType,
    portraitUsdFloorCents,
} from 'src/payments/price-table';
import { Types } from 'mongoose';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { ProductType } from './order.schema';

/**
 * `EntityType.LOOT_BOX` exists only in the client (client/models/save.ts). The mystery box page
 * pays `Prices.lootBox` ($1, client/models/cats.ts) through POST /web3/confirm with no `id`, and the
 * controller grants it like a pack with no pack type (a common-tier cat). A loot box order that
 * names an `id` is not a sellable item: the $1 price must never buy a pack's odds.
 */
export const LOOT_BOX_ENTITY = 'LOOT_BOX';
export const LOOT_BOX_PRICE_CENTS = 100;

/**
 * Server catalogue price in USD cents for what an order buys, before any discount, or null when
 * the order does not name a sellable item. Prices come from src/payments/price-table.ts.
 *
 * Order fields as the confirm flows write them:
 * - IMAGE: `id` is the portrait ProductType (`digital` for POST /web3/confirm and PaymentIntents). The
 *   price is the USD floor at the order's `createdAt` (`portraitUsdFloorCents`): $6 for a digital order
 *   created before the $16 change plus its 48 h grace, $16 after. POST /web3/confirm creates the order
 *   right after the client paid, so an in-flight $6 payment still verifies inside the grace; the audit
 *   reads the stored `createdAt`, so legacy $6 orders stay clean. An order without `createdAt` is priced
 *   as created now. Card checkout orders in EUR are not USD: the audit handles them on their own.
 * - PACK: `id` is the PackType.
 * - CAT: `id` is the catalogue (shelter) cat id; a shelter cat costs `getShelterCatPriceCents()`.
 */
export function getOrderCatalogueCents(order: {
    entityType?: string;
    id?: unknown;
    createdAt?: Date | string | null;
}): number | null {
    const id = order.id === undefined || order.id === null ? undefined : String(order.id);

    if (order.entityType === EntityType.IMAGE) {
        const productType = id || ProductType.DIGITAL;
        if (!isProductType(productType)) {
            return null;
        }
        const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
        return portraitUsdFloorCents(productType, Number.isNaN(createdAt.getTime()) ? new Date() : createdAt);
    }
    if (order.entityType === EntityType.PACK) {
        return isPackType(id) ? getPackPriceCents(id) : null;
    }
    if (order.entityType === EntityType.CAT) {
        return id && Types.ObjectId.isValid(id) ? getShelterCatPriceCents() : null;
    }
    if (order.entityType === LOOT_BOX_ENTITY) {
        return id ? null : LOOT_BOX_PRICE_CENTS;
    }
    return null;
}
