import { PORTRAIT_LEGACY_GRACE_MS, PORTRAIT_USD_PRICE_CHANGED_AT, getPackPriceCents } from 'src/payments/price-table';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { getOrderCatalogueCents } from './order-catalogue';
import { PackType, ProductType } from './order.schema';

const CHANGED = PORTRAIT_USD_PRICE_CHANGED_AT.getTime();
const LEGACY_END = CHANGED + PORTRAIT_LEGACY_GRACE_MS;

const image = (createdAt?: Date, id: string = ProductType.DIGITAL) => ({ entityType: EntityType.IMAGE, id, createdAt });

describe('getOrderCatalogueCents', () => {
    it('prices a digital portrait at the retired $6 when created before the change plus the grace', () => {
        expect(getOrderCatalogueCents(image(new Date(CHANGED - 1)))).toBe(600);
        expect(getOrderCatalogueCents(image(new Date(LEGACY_END - 1)))).toBe(600);
    });

    it('prices a digital portrait at $16 once the grace is over', () => {
        expect(getOrderCatalogueCents(image(new Date(LEGACY_END)))).toBe(1600);
        expect(getOrderCatalogueCents(image(new Date(LEGACY_END + 86_400_000)))).toBe(1600);
    });

    it('reads a stored createdAt string, and an order without one is priced as created now', () => {
        expect(getOrderCatalogueCents({ ...image(), createdAt: new Date(CHANGED - 1).toISOString() })).toBe(600);
        // Only Date is faked (same list as order-audit.spec.ts).
        jest.useFakeTimers({
            now: new Date(LEGACY_END + 1),
            doNotFake: [
                'nextTick',
                'setImmediate',
                'clearImmediate',
                'setTimeout',
                'clearTimeout',
                'setInterval',
                'clearInterval',
                'queueMicrotask',
                'hrtime',
                'performance',
            ],
        });
        try {
            expect(getOrderCatalogueCents(image())).toBe(1600);
        } finally {
            jest.useRealTimers();
        }
    });

    it('keeps print and canvas at $49 and $69 whatever the date', () => {
        expect(getOrderCatalogueCents(image(new Date(CHANGED - 1), ProductType.PRINT))).toBe(4900);
        expect(getOrderCatalogueCents(image(new Date(LEGACY_END + 1), ProductType.CANVAS))).toBe(6900);
    });

    it('leaves packs unchanged', () => {
        for (const pack of Object.values(PackType)) {
            expect(getOrderCatalogueCents({ entityType: EntityType.PACK, id: pack })).toBe(getPackPriceCents(pack));
        }
        expect(getOrderCatalogueCents({ entityType: EntityType.PACK, id: PackType.STARTER })).toBe(500);
        expect(getOrderCatalogueCents({ entityType: EntityType.PACK, id: PackType.INFLUENCER })).toBe(2500);
    });

    it('refuses an unknown portrait product', () => {
        expect(getOrderCatalogueCents(image(new Date(), 'poster'))).toBeNull();
    });
});
