import { AiBudgetService } from './ai-budget.service';
import { AI_BUDGET_DAY_COUNTERS } from './ai-budget.schema';
import { AiUploadGate } from './ai-upload-gate';
import { FakeCollection } from './fake-collection.helper-spec';

/*
 * Launch item YC-L8: every AiUploadGate refusal is counted on the day's stats, by layer, and
 * GET /yourcat/stats (AiBudgetService.stats) returns the counters.
 */

const DAY = '2026-10-11';
const USER = { _id: '64b7f0c2a1b2c3d4e5f60719', isGuest: true };

function setup(envOverrides: Record<string, string | undefined> = {}) {
    const days = new FakeCollection('day');
    const quotas = new FakeCollection('_id');
    const budget = new AiBudgetService(days as any, quotas as any);
    budget.now = () => new Date(`${DAY}T12:00:00Z`);
    budget.alert = jest.fn().mockResolvedValue(true);
    const gate = new AiUploadGate(budget);
    gate.firebase = {
        verifyAppCheck: jest.fn(),
        verifyAppCheckConsuming: jest.fn(async (token: string) => {
            if (token === 'bad') {
                throw new Error('invalid');
            }
            return { alreadyConsumed: false };
        }),
    };
    const env = {
        NODE_ENV: 'production',
        CF_ORIGIN_SECRET: 'origin',
        AI_UPLOAD_IP_SALT: 'salt',
        ...envOverrides,
    } as NodeJS.ProcessEnv;
    for (const key of Object.keys(env)) {
        if (env[key] === undefined) {
            delete env[key];
        }
    }
    const counts = async () => (await budget.stats(1, budget.now()))[0]?.counts || {};
    return { gate, budget, env, counts };
}

const req = (appCheck?: string, headers: Record<string, string> = {}) => ({
    ip: '10.0.0.4',
    ips: [],
    headers: {
        'cf-connecting-ip': '203.0.113.7',
        'x-tt-origin-auth': 'origin',
        ...(appCheck ? { 'x-firebase-appcheck': appCheck } : {}),
        ...headers,
    },
});

const fails = (promise: Promise<unknown>) =>
    promise.then(
        () => Promise.reject(new Error('admitted')),
        () => undefined
    );

describe('AiUploadGate refusal counters (YC-L8)', () => {
    it('the counters exist on the day document schema', () => {
        for (const counter of [
            'refusedNoClientIp',
            'refusedAppCheck',
            'refusedIpCap',
            'refusedUserCap',
            'refusedFailureCap',
            'refusedBudget',
        ]) {
            expect(AI_BUDGET_DAY_COUNTERS).toContain(counter);
        }
    });

    it('counts a missing or unprovable client IP and a missing salt as refusedNoClientIp', async () => {
        const { gate, env, counts } = setup();
        await fails(gate.admit(req('a', { 'x-tt-origin-auth': 'wrong' }), USER, 'yourcat', env));
        await fails(gate.admit({ headers: {}, ips: [] }, USER, 'portrait-preview', env));
        const noSalt = setup({ AI_UPLOAD_IP_SALT: undefined, INVALIDATE_CACHE_SECRET: undefined });
        await fails(noSalt.gate.admit(req('a'), USER, 'yourcat', noSalt.env));
        expect((await counts()).refusedNoClientIp).toBe(2);
        expect((await noSalt.counts()).refusedNoClientIp).toBe(1);
    });

    it('counts App Check refusals in enforce mode', async () => {
        const { gate, env, counts } = setup({ AI_UPLOAD_APPCHECK_ENFORCE: 'true' });
        await fails(gate.admit(req(), USER, 'yourcat', env));
        await fails(gate.admit(req('bad'), USER, 'yourcat', env));
        expect((await counts()).refusedAppCheck).toBe(2);
    });

    it('counts the per-IP, per-user and failure caps', async () => {
        const ipCap = setup({ AI_UPLOAD_IP_DAILY: '1', AI_UPLOAD_USER_DAILY: '10' });
        await ipCap.gate.admit(req('a'), USER, 'yourcat', ipCap.env);
        await fails(ipCap.gate.admit(req('b'), USER, 'yourcat', ipCap.env));
        expect((await ipCap.counts()).refusedIpCap).toBe(1);

        const userCap = setup({ AI_UPLOAD_USER_DAILY: '1' });
        await userCap.gate.admit(req('a'), USER, 'yourcat', userCap.env);
        await fails(userCap.gate.admit(req('b', { 'cf-connecting-ip': '198.51.100.1' }), USER, 'yourcat', userCap.env));
        expect((await userCap.counts()).refusedUserCap).toBe(1);

        const failureCap = setup({
            AI_UPLOAD_IP_DAILY: '50',
            AI_UPLOAD_USER_DAILY: '50',
            AI_UPLOAD_IP_FAILURES_DAILY: '1',
        });
        const ticket = await failureCap.gate.admit(req('a'), USER, 'yourcat', failureCap.env);
        await failureCap.gate.refuseBeforeAi(ticket);
        await fails(failureCap.gate.admit(req('b'), USER, 'yourcat', failureCap.env));
        expect((await failureCap.counts()).refusedFailureCap).toBe(1);
    });

    it('counts a budget refusal as refusedBudget, and GET /yourcat/stats returns it', async () => {
        const { gate, env, budget } = setup();
        process.env.AI_BUDGET_EUR_PER_DAY = '0.1';
        try {
            await gate.admit(req('a'), USER, 'yourcat', env);
            await fails(gate.admit(req('b'), USER, 'yourcat', env));
        } finally {
            delete process.env.AI_BUDGET_EUR_PER_DAY;
        }
        const [day] = await budget.stats(14, budget.now());
        expect(day).toMatchObject({
            day: DAY,
            counts: expect.objectContaining({ refusedBudget: 1, yourcatAdmitted: 1 }),
        });
    });
});
