import { Connection, createConnection, Model } from 'mongoose';
import { AiBudgetDay, AiBudgetDaySchema, AiQuota, AiQuotaSchema } from './ai-budget.schema';
import { AiBudgetService } from './ai-budget.service';

/*
 * Real-MongoDB concurrency checks for the AI budget (bet #3). Opt-in, like shared/jobs/lease-mongo.spec.ts:
 * skipped unless MONGO_IT_URI points at a disposable database. Run before merging stream A:
 *   MONGO_IT_URI=mongodb://localhost:27017/tt-it npx jest ai-budget.mongo
 */

const uri = process.env.MONGO_IT_URI;
const describeIfMongo = uri ? describe : describe.skip;

describeIfMongo('AiBudgetService against MongoDB', () => {
    let connection: Connection;
    let days: Model<any>;
    let quotas: Model<any>;

    beforeAll(async () => {
        connection = await createConnection(uri as string).asPromise();
        days = connection.model(AiBudgetDay.name, AiBudgetDaySchema);
        quotas = connection.model(AiQuota.name, AiQuotaSchema);
        await days.deleteMany({});
        await quotas.deleteMany({});
        await days.syncIndexes();
        await quotas.syncIndexes();
    });

    afterAll(async () => {
        await days?.deleteMany({});
        await quotas?.deleteMany({});
        await connection?.close();
    });

    it('100 parallel reservations never push committedMicroEur above the cap', async () => {
        process.env.AI_BUDGET_EUR_PER_DAY = '1';
        const service = new AiBudgetService(days as any, quotas as any);
        const results = await Promise.allSettled(
            Array.from({ length: 100 }, () => service.reserve('yourcat', 80_000, '2026-10-11'))
        );
        const admitted = results.filter(result => result.status === 'fulfilled').length;
        const doc: any = await days.findOne({ day: '2026-10-11' }).lean();
        expect(doc.committedMicroEur).toBeLessThanOrEqual(1_000_000);
        expect(doc.committedMicroEur).toBe(admitted * 80_000);
        expect(admitted).toBe(12);
        delete process.env.AI_BUDGET_EUR_PER_DAY;
    });

    it('two parallel first claims on one AiQuota _id both succeed under a limit of 2', async () => {
        const service = new AiBudgetService(days as any, quotas as any);
        const id = 'yourcat:user:race:2026-10-11';
        const results = await Promise.all([
            service.claimQuota(id, 2, '2026-10-11'),
            service.claimQuota(id, 2, '2026-10-11'),
        ]);
        expect(results).toEqual([true, true]);
        expect(await service.claimQuota(id, 2, '2026-10-11')).toBe(false);
        expect(await service.quotaCount(id)).toBe(2);
    });
});
