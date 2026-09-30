import { getPackPriceCents, getPortraitPriceCents, isPackType, isProductType } from 'src/payments/price-table';
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
 * - IMAGE: `id` is the portrait ProductType (`digital` for POST /web3/confirm and PaymentIntents).
 * - PACK: `id` is the PackType.
 */
export function getOrderCatalogueCents(order: { entityType?: string; id?: unknown }): number | null {
    const id = order.id === undefined || order.id === null ? undefined : String(order.id);

    if (order.entityType === EntityType.IMAGE) {
        const productType = id || ProductType.DIGITAL;
        return isProductType(productType) ? getPortraitPriceCents(productType) : null;
    }
    if (order.entityType === EntityType.PACK) {
        return isPackType(id) ? getPackPriceCents(id) : null;
    }
    if (order.entityType === LOOT_BOX_ENTITY) {
        return id ? null : LOOT_BOX_PRICE_CENTS;
    }
    return null;
}
