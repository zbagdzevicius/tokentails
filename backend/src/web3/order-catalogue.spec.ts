import { getPackPriceCents } from 'src/payments/price-table';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { getOrderCatalogueCents } from './order-catalogue';
import { PackType, ProductType } from './order.schema';

const image = (createdAt?: Date, id: string = ProductType.DIGITAL) => ({ entityType: EntityType.IMAGE, id, createdAt });

describe('getOrderCatalogueCents', () => {
    it('prices a digital portrait at $16 whatever its createdAt', () => {
        for (const at of [
            new Date('2025-01-01T00:00:00Z'),
            new Date('2026-10-11T23:59:59Z'),
            new Date('2027-06-01T00:00:00Z'),
        ]) {
            expect(getOrderCatalogueCents(image(at))).toBe(1600);
        }
        expect(getOrderCatalogueCents(image())).toBe(1600);
        expect(getOrderCatalogueCents({ ...image(), createdAt: '2026-10-01T00:00:00Z' } as any)).toBe(1600);
    });

    it('keeps print and canvas at $49 and $69 whatever the date', () => {
        expect(getOrderCatalogueCents(image(new Date('2026-10-01T00:00:00Z'), ProductType.PRINT))).toBe(4900);
        expect(getOrderCatalogueCents(image(new Date('2027-06-01T00:00:00Z'), ProductType.CANVAS))).toBe(6900);
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
