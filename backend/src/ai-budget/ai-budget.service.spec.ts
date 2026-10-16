import { HttpException } from '@nestjs/common';
import { AiBudgetService, AiTicket, KIND_COUNTERS } from './ai-budget.service';
import { FakeCollection } from './fake-collection.helper-spec';

const DAY = '2026-10-11';
const est = { yourcat: 80_000, preview: 300_000 };

function setup(env: Record<string, string> = {}) {
    const days = new FakeCollection('day');
    const quotas = new FakeCollection('_id');
    const service = new AiBudgetService(days as any, quotas as any);
    service.now = () => new Date(`${DAY}T12:00:00Z`);
    const alert = jest.fn().mockResolvedValue(true);
    service.alert = alert;
    Object.assign(process.env, env);
    return { service, days, quotas, alert };
}

const codeOf = async (promise: Promise<unknown>) => {
    const error = await promise.then(
        () => null,
        e => e
    );
    expect(error).toBeInstanceOf(HttpException);
    return (error as HttpException).getResponse() as { code: string; statusCode: number };
};

const ticket = (kind: AiTicket['kind'], reservation: number, day = DAY): AiTicket => ({
    kind,
    day,
    reservationMicroEur: reservation,
    quotaKeys: [],
    failureKey: null,
});

describe('AiBudgetService', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        process.env = { ...OLD_ENV };
        delete process.env.AI_BUDGET_EUR_PER_DAY;
        delete process.env.AI_BUDGET_PREVIEW_EUR_PER_DAY;
        delete process.env.AI_ALERT_COST_PER_UPLOAD_EUR;
        delete process.env.AI_ALERT_COST_PER_PREVIEW_EUR;
    });
    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('a day document created by a yourcat reservation, a paid delivery or an alert still admits a preview', async () => {
        for (const seed of ['yourcat', 'delivery', 'alert'] as const) {
            const { service, days } = setup();
            if (seed === 'yourcat') {
                await service.reserve('yourcat', est.yourcat, DAY);
            } else if (seed === 'delivery') {
                await service.recordPaidSpend(500_000, DAY);
            } else {
                await service.alertOnce(DAY, 'budget80SentAt', 'subject', 'text');
            }
            expect(days.byKey(DAY)?.previewCommittedMicroEur).toBeUndefined();

            await service.reserve('portrait-preview', est.preview, DAY);
            expect(days.byKey(DAY)?.previewCommittedMicroEur).toBe(est.preview);
            expect(days.byKey(DAY)?.counts?.previewsAdmitted).toBe(1);
        }
    });

    it('refuses est > cap in code on a day with no document (cap 0), without writing', async () => {
        const { service, days } = setup({ AI_BUDGET_EUR_PER_DAY: '0' });
        expect((await codeOf(service.reserve('yourcat', est.yourcat, DAY))).code).toBe('YOURCAT_BUDGET_EXHAUSTED');
        expect(days.calls).toBe(0);
        expect(days.docs).toEqual([]);
    });

    it('stops previews at the sub-cap while /yourcat reservations still pass', async () => {
        const { service, days } = setup();
        // €3 preview sub-cap: ten €0.30 previews.
        for (let index = 0; index < 10; index++) {
            await service.reserve('portrait-preview', est.preview, DAY);
        }
        expect((await codeOf(service.reserve('portrait-preview', est.preview, DAY))).statusCode).toBe(503);
        await service.reserve('yourcat', est.yourcat, DAY);
        expect(days.byKey(DAY)).toMatchObject({
            committedMicroEur: 3_000_000 + est.yourcat,
            previewCommittedMicroEur: 3_000_000,
        });
    });

    it('stops /yourcat at the global cap', async () => {
        const { service } = setup({ AI_BUDGET_EUR_PER_DAY: '0.2' });
        await service.reserve('yourcat', est.yourcat, DAY);
        await service.reserve('yourcat', est.yourcat, DAY);
        expect((await codeOf(service.reserve('yourcat', est.yourcat, DAY))).code).toBe('YOURCAT_BUDGET_EXHAUSTED');
    });

    it('retries an E11000 on the first upsert once, then succeeds', async () => {
        const { service, days } = setup();
        days.failNextWith11000(1);
        await service.reserve('yourcat', est.yourcat, DAY);
        expect(days.byKey(DAY)?.committedMicroEur).toBe(est.yourcat);

        days.failNextWith11000(2);
        expect((await codeOf(service.reserve('yourcat', est.yourcat, DAY))).code).toBe('YOURCAT_BUDGET_EXHAUSTED');
    });

    it('settle and cancel adjust both fields on the ticket day, even after 00:00 UTC', async () => {
        const { service, days } = setup();
        await service.reserve('portrait-preview', est.preview, DAY);
        await service.reserve('portrait-preview', est.preview, DAY);
        // The clock moved to the next UTC day before the calls finished.
        service.now = () => new Date('2026-10-12T00:05:00Z');

        await service.settle(ticket('portrait-preview', est.preview), 120_000);
        await service.cancel(ticket('portrait-preview', est.preview));
        expect(days.byKey(DAY)).toMatchObject({
            committedMicroEur: 120_000,
            previewCommittedMicroEur: 120_000,
            spentMicroEur: 120_000,
        });
        expect(days.byKey('2026-10-12')).toBeUndefined();
    });

    it('settles or cancels a ticket only once', async () => {
        const { service, days } = setup();
        await service.reserve('yourcat', est.yourcat, DAY);
        const t = ticket('yourcat', est.yourcat);
        await service.settle(t, 50_000);
        await service.settle(t, 50_000);
        await service.cancel(t);
        expect(days.byKey(DAY)).toMatchObject({ committedMicroEur: 50_000, spentMicroEur: 50_000 });
    });

    it('sends each alert at most once a day per kind', async () => {
        const { service, alert } = setup();
        await service.reserve('yourcat', est.yourcat, DAY);
        await service.noteCost('yourcat', DAY, 150_000);
        await service.noteCost('yourcat', DAY, 150_000);
        await service.noteCost('portrait-preview', DAY, 450_000);
        await service.noteCost('portrait-preview', DAY, 450_000);
        expect(alert).toHaveBeenCalledTimes(2);

        await service.checkBudgetAlerts(DAY);
        expect(alert).toHaveBeenCalledTimes(2);
    });

    it('emails at 80 % and 100 % of the cap once each', async () => {
        const { service, alert } = setup({ AI_BUDGET_EUR_PER_DAY: '0.1' });
        await service.reserve('yourcat', est.yourcat, DAY); // 80 %
        await service.checkBudgetAlerts(DAY);
        await service.checkBudgetAlerts(DAY);
        expect(alert.mock.calls.map(call => call[0])).toEqual([`AI budget at 80% for ${DAY}`]);
        await service.recordPaidSpend(20_000, DAY); // 100 %
        await service.checkBudgetAlerts(DAY);
        await service.checkBudgetAlerts(DAY);
        expect(alert).toHaveBeenCalledTimes(2);
    });

    it('a €0.30 preview does not trigger the upload alert', async () => {
        const { service, alert } = setup();
        expect(await service.noteCost('portrait-preview', DAY, 300_000)).toBe(false);
        expect(alert).not.toHaveBeenCalled();
    });

    it('the counter map gives previewsAdmitted for previews', () => {
        expect(KIND_COUNTERS['portrait-preview'].admitted).toBe('previewsAdmitted');
        expect(KIND_COUNTERS.yourcat).toEqual({
            admitted: 'yourcatAdmitted',
            done: 'yourcatDone',
            failed: 'yourcatFailed',
        });
        expect(KIND_COUNTERS.manual.admitted).toBe('manualCats');
    });

    it('claims quota slots under a limit, refuses at the limit, and a limit of 0 writes nothing', async () => {
        const { service, quotas } = setup();
        expect(await service.claimQuota('yourcat:user:u1:2026-10-11', 2, DAY)).toBe(true);
        expect(await service.claimQuota('yourcat:user:u1:2026-10-11', 2, DAY)).toBe(true);
        expect(await service.claimQuota('yourcat:user:u1:2026-10-11', 2, DAY)).toBe(false);
        const calls = quotas.calls;
        expect(await service.claimQuota('yourcat:ip:k:2026-10-11', 0, DAY)).toBe(false);
        expect(quotas.calls).toBe(calls);

        await service.releaseQuota('yourcat:user:u1:2026-10-11');
        expect(await service.quotaCount('yourcat:user:u1:2026-10-11')).toBe(1);
        expect(quotas.byKey('yourcat:user:u1:2026-10-11')?.expiresAt).toBeInstanceOf(Date);
    });

    it('two racing first claims: the E11000 one retries and gets its slot', async () => {
        const { service, quotas } = setup();
        quotas.failNextWith11000(1);
        expect(await service.claimQuota('yourcat:user:u2:2026-10-11', 2, DAY)).toBe(true);
        expect(await service.quotaCount('yourcat:user:u2:2026-10-11')).toBe(1);
    });

    it('a day first written by a counter or a paid delivery stores the cap of that moment', async () => {
        const { service, days } = setup({ AI_BUDGET_EUR_PER_DAY: '5' });
        await service.count('manualCats', DAY);
        await service.recordPaidSpend(100_000, '2026-10-12');
        process.env.AI_BUDGET_EUR_PER_DAY = '9';
        await service.reserve('yourcat', est.yourcat, DAY);
        expect(days.docs.find((doc: any) => doc.day === DAY)?.capMicroEur).toBe(5_000_000);
        expect(days.docs.find((doc: any) => doc.day === '2026-10-12')?.capMicroEur).toBe(5_000_000);
        expect((await service.stats(1, new Date(`${DAY}T12:00:00Z`)))[0].capEur).toBe(5);
    });

    it('stats reports euros per day', async () => {
        const { service } = setup();
        await service.reserve('yourcat', est.yourcat, DAY);
        await service.settle(ticket('yourcat', est.yourcat), 55_000);
        expect(await service.stats(14)).toEqual([
            {
                day: DAY,
                capEur: 5,
                spentEur: 0.06,
                committedEur: 0.06,
                counts: { yourcatAdmitted: 1 },
            },
        ]);
    });
});
