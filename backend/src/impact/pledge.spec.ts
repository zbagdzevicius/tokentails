import { Types } from 'mongoose';
import { FACTS } from './facts.generated';
import { memoryModel } from './memory-model.fakes-spec';
import { pledgeConfigFromFacts, pledgedCents, pledgeRows, pledgeStatus } from './pledge';
import { PledgeService } from './pledge.service';

/*
 * Purchase pledge (plan G4, decision #27): COMPLETE orders from C-purchase_share.effectiveAt only,
 * pledged against paid per month in USD with the shortfall. Nothing is claimed for earlier orders.
 */

const facts = (entry: Record<string, unknown>) => ({ 'C-002': { id: 'C-002', key: 'purchase_share', ...entry } });

describe('purchase pledge config', () => {
    it('is not started while the registry has no public purchase_share with a value and a date', () => {
        expect(pledgeConfigFromFacts(FACTS as any)).toBeNull();
        expect(pledgeConfigFromFacts(facts({ value: null, effectiveAt: '2026-11-01' }))).toBeNull();
        expect(pledgeConfigFromFacts(facts({ value: '5', effectiveAt: null }))).toBeNull();
        expect(pledgeConfigFromFacts(facts({ value: '150', effectiveAt: '2026-11-01' }))).toBeNull();
        expect(pledgeConfigFromFacts(facts({ value: '5', effectiveAt: '2026-11-01' }))).toEqual({
            bps: 500,
            effectiveAt: '2026-11-01',
        });
        expect(pledgeConfigFromFacts(facts({ value: 2.5, effectiveAt: '2026-11-01' }))?.bps).toBe(250);
    });

    it('is scheduled before effectiveAt and active from it', () => {
        const config = { bps: 500, effectiveAt: '2026-11-01' };
        expect(pledgeStatus(null, new Date())).toBe('not-started');
        expect(pledgeStatus(config, new Date('2026-10-31T23:59:59Z'))).toBe('scheduled');
        expect(pledgeStatus(config, new Date('2026-11-01T00:00:00Z'))).toBe('active');
    });

    it('rounds the pledge up so it is never understated, and shows the shortfall', () => {
        expect(pledgedCents(999, 500)).toBe(50); // 49.95 -> 50
        const rows = pledgeRows(
            new Map([
                ['2026-11', { cents: 10000, orders: 4 }],
                ['2026-12', { cents: 2000, orders: 1 }],
            ]),
            new Map([['2026-11', 600]]),
            500
        );
        expect(rows).toEqual([
            {
                month: '2026-12',
                symbol: 'USD',
                pledgedWei: '1000000000000000000',
                paidWei: '0',
                shortfallWei: '1000000000000000000',
                orders: 1,
            },
            {
                month: '2026-11',
                symbol: 'USD',
                pledgedWei: '5000000000000000000',
                paidWei: '6000000000000000000',
                shortfallWei: '0',
                orders: 4,
            },
        ]);
    });
});

describe('PledgeService.table', () => {
    function setup() {
        const orders = memoryModel();
        const payouts = { pledgePaidCents: jest.fn(async () => new Map([['2026-11', 150]])) };
        const service = new PledgeService(orders as any, payouts as any);
        const order = (createdAt: string, fields: Record<string, unknown> = {}) =>
            orders.rows.push({
                _id: new Types.ObjectId(),
                status: 'COMPLETE',
                priceUsd: 10,
                price: 10,
                createdAt: new Date(createdAt),
                user: new Types.ObjectId(),
                ...fields,
            });
        return { orders, service, order, payouts };
    }

    it('returns no rows while not started', async () => {
        const t = setup();
        t.order('2026-11-02T00:00:00Z');
        t.service.config = () => null;
        expect(await t.service.table()).toEqual({ status: 'not-started', bps: null, effectiveAt: null, rows: [] });
    });

    it('counts COMPLETE, USD-priced orders from effectiveAt by UTC month, and only those', async () => {
        const t = setup();
        t.service.config = () => ({ bps: 500, effectiveAt: '2026-11-01' });
        t.order('2026-10-31T23:59:59Z'); // before the date: nothing claimed
        t.order('2026-11-01T00:00:00Z');
        t.order('2026-11-15T12:00:00Z', { priceUsd: 30 });
        t.order('2026-11-20T12:00:00Z', { status: 'PENDING' });
        t.order('2026-11-21T12:00:00Z', { status: 'FAILED_GRANT' });
        t.order('2026-11-22T12:00:00Z', { priceUsd: undefined }); // no USD price: not summed
        t.order('2026-12-01T00:00:00Z', { priceUsd: 4.99 });

        const table = await t.service.table(new Date('2026-12-05T00:00:00Z'));

        expect(table.status).toBe('active');
        expect(table.rows).toEqual([
            expect.objectContaining({ month: '2026-12', pledgedWei: '250000000000000000', paidWei: '0', orders: 1 }),
            expect.objectContaining({
                month: '2026-11',
                pledgedWei: '2000000000000000000',
                paidWei: '1500000000000000000',
                shortfallWei: '500000000000000000',
                orders: 2,
            }),
        ]);
        expect(JSON.stringify(table)).not.toMatch(/"[0-9a-f]{24}"/);
    });
});
