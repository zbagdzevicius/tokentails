import { HttpException } from '@nestjs/common';
import { AiBudgetService } from './ai-budget.service';
import { AiUploadGate, ipDayKey } from './ai-upload-gate';
import { FakeCollection } from './fake-collection.helper-spec';

const DAY = '2026-10-11';
const VISITOR = '203.0.113.7';
const USER = { _id: '64b7f0c2a1b2c3d4e5f60719', isGuest: true };

function setup(envOverrides: Record<string, string | undefined> = {}) {
    const days = new FakeCollection('day');
    const quotas = new FakeCollection('_id');
    const budget = new AiBudgetService(days as any, quotas as any);
    budget.now = () => new Date(`${DAY}T12:00:00Z`);
    budget.alert = jest.fn().mockResolvedValue(true);
    const gate = new AiUploadGate(budget);
    const appChecks: string[] = [];
    gate.firebase = {
        verifyAppCheck: jest.fn(),
        verifyAppCheckConsuming: jest.fn(async (token: string) => {
            appChecks.push(token);
            if (token === 'bad') {
                throw new Error('invalid');
            }
            return { alreadyConsumed: token === 'used' };
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
    return { gate, budget, days, quotas, env, appChecks };
}

const req = (appCheck?: string, headers: Record<string, string> = {}) => ({
    ip: '10.0.0.4',
    ips: [],
    headers: {
        'cf-connecting-ip': VISITOR,
        'x-tt-origin-auth': 'origin',
        ...(appCheck ? { 'x-firebase-appcheck': appCheck } : {}),
        ...headers,
    },
});

const refusal = async (promise: Promise<unknown>) => {
    const error = await promise.then(
        () => null,
        e => e
    );
    expect(error).toBeInstanceOf(HttpException);
    const response = (error as HttpException).getResponse() as any;
    return { status: (error as HttpException).getStatus(), code: response.code };
};

describe('AiUploadGate', () => {
    it('verified App Check gets the per-IP cap; unverified (0 for yourcat) is refused', async () => {
        const { gate, env } = setup({ AI_UPLOAD_USER_DAILY: '10' });
        for (let index = 0; index < 3; index++) {
            await gate.admit(req(`token-${index}`), USER, 'yourcat', env);
        }
        expect((await refusal(gate.admit(req('token-x'), USER, 'yourcat', env))).code).toBe('YOURCAT_IP_DAILY_CAP');

        const other = setup();
        expect((await refusal(other.gate.admit(req(), USER, 'yourcat', other.env))).code).toBe('YOURCAT_IP_DAILY_CAP');
    });

    it('enforce mode: missing token 401 REQUIRED, invalid or replayed 401 INVALID', async () => {
        const { gate, env } = setup({ AI_UPLOAD_APPCHECK_ENFORCE: 'true' });
        expect(await refusal(gate.admit(req(), USER, 'yourcat', env))).toEqual({
            status: 401,
            code: 'YOURCAT_APP_CHECK_REQUIRED',
        });
        expect((await refusal(gate.admit(req('bad'), USER, 'yourcat', env))).code).toBe('YOURCAT_APP_CHECK_INVALID');
        expect((await refusal(gate.admit(req('used'), USER, 'yourcat', env))).code).toBe('YOURCAT_APP_CHECK_INVALID');
        await expect(gate.admit(req('fresh'), USER, 'yourcat', env)).resolves.toMatchObject({ kind: 'yourcat' });
    });

    it('a replayed token gets the unverified cap when not enforced', async () => {
        const { gate, env } = setup({ AI_PREVIEW_IP_DAILY: '3', AI_PREVIEW_IP_DAILY_UNVERIFIED: '1' });
        await gate.admit(req('used'), USER, 'portrait-preview', env);
        expect((await refusal(gate.admit(req('used'), USER, 'portrait-preview', env))).code).toBe(
            'YOURCAT_IP_DAILY_CAP'
        );
    });

    it('an untrusted IP in production refuses yourcat; previews share one untrusted bucket', async () => {
        const { gate, env } = setup({ AI_PREVIEW_UNTRUSTED_DAILY: '2', AI_PREVIEW_USER_DAILY: '50' });
        const forged = req('token', { 'x-tt-origin-auth': 'wrong' });
        expect(await refusal(gate.admit(forged, USER, 'yourcat', env))).toEqual({
            status: 503,
            code: 'YOURCAT_NO_CLIENT_IP',
        });
        // A new forged cf-connecting-ip per request no longer opens a new slot.
        const untrusted = (token: string, ip: string) =>
            req(token, { 'x-tt-origin-auth': 'wrong', 'cf-connecting-ip': ip });
        await gate.admit(untrusted('t1', '198.51.100.1'), USER, 'portrait-preview', env);
        await gate.admit(untrusted('t2', '198.51.100.2'), USER, 'portrait-preview', env);
        expect((await refusal(gate.admit(untrusted('t3', '198.51.100.3'), USER, 'portrait-preview', env))).code).toBe(
            'YOURCAT_IP_DAILY_CAP'
        );
        // A proven visitor keeps its own per-IP slot.
        await gate.admit(req('t4'), USER, 'portrait-preview', env);
    });

    it('the shared untrusted bucket defaults to 5 previews a day', async () => {
        const { gate, env } = setup({ AI_PREVIEW_USER_DAILY: '50', AI_BUDGET_PREVIEW_EUR_PER_DAY: '5' });
        for (let index = 0; index < 5; index++) {
            await gate.admit(
                req(`t${index}`, { 'x-tt-origin-auth': 'wrong', 'cf-connecting-ip': `198.51.100.${index + 1}` }),
                USER,
                'portrait-preview',
                env
            );
        }
        expect(
            (
                await refusal(
                    gate.admit(
                        req('t9', { 'x-tt-origin-auth': 'wrong', 'cf-connecting-ip': '198.51.100.99' }),
                        USER,
                        'portrait-preview',
                        env
                    )
                )
            ).code
        ).toBe('YOURCAT_IP_DAILY_CAP');
    });

    it('outside production an unproven preview address keeps its own key', async () => {
        const { gate, env } = setup({ NODE_ENV: 'development', AI_PREVIEW_IP_DAILY_UNVERIFIED: '1' });
        await gate.admit(req(undefined, { 'x-tt-origin-auth': 'wrong' }), USER, 'portrait-preview', env);
        await gate.admit(
            req(undefined, { 'x-tt-origin-auth': 'wrong', 'cf-connecting-ip': '198.51.100.5' }),
            USER,
            'portrait-preview',
            env
        );
    });

    it('applies the per-user cap across addresses', async () => {
        const { gate, env } = setup({ AI_UPLOAD_USER_DAILY: '2' });
        await gate.admit(req('a'), USER, 'yourcat', env);
        await gate.admit(req('b', { 'cf-connecting-ip': '198.51.100.1' }), USER, 'yourcat', env);
        expect(
            (await refusal(gate.admit(req('c', { 'cf-connecting-ip': '198.51.100.2' }), USER, 'yourcat', env))).code
        ).toBe('YOURCAT_USER_DAILY_CAP');
    });

    it('the failure cap refuses at 5 and release never lowers it', async () => {
        const { gate, env } = setup({ AI_UPLOAD_IP_DAILY: '50', AI_UPLOAD_USER_DAILY: '50' });
        for (let index = 0; index < 5; index++) {
            const ticket = await gate.admit(req(`t${index}`), USER, 'yourcat', env);
            await gate.refuseBeforeAi(ticket);
            await gate.release(ticket);
        }
        expect(await refusal(gate.admit(req('t9'), USER, 'yourcat', env))).toEqual({
            status: 429,
            code: 'YOURCAT_FAILURE_DAILY_CAP',
        });
    });

    it('when the budget refuses after the IP and user slots were claimed, both are released', async () => {
        const { gate, quotas, env, budget } = setup({ AI_BUDGET_EUR_PER_DAY: '0.1' });
        process.env.AI_BUDGET_EUR_PER_DAY = '0.1';
        await gate.admit(req('a'), USER, 'yourcat', env);
        expect((await refusal(gate.admit(req('b'), USER, 'yourcat', env))).code).toBe('YOURCAT_BUDGET_EXHAUSTED');
        const counts = quotas.docs.filter(doc => !doc._id.includes(':fail:')).map(doc => doc.count);
        expect(counts).toEqual([1, 1]);
        delete process.env.AI_BUDGET_EUR_PER_DAY;
        expect(budget).toBeDefined();
    });

    it('release gives the attempt back once only', async () => {
        const { gate, quotas, env } = setup();
        await gate.admit(req('a'), USER, 'yourcat', env);
        const ticket = await gate.admit(req('b'), USER, 'yourcat', env);
        await gate.release(ticket);
        await gate.release(ticket);
        expect(quotas.docs.filter(doc => !doc._id.includes(':fail:')).map(doc => doc.count)).toEqual([1, 1]);
    });

    it('the HMAC key never contains the IP', async () => {
        const { gate, quotas, env } = setup();
        await gate.admit(req('a'), USER, 'yourcat', env);
        for (const doc of quotas.docs) {
            expect(doc._id).not.toContain(VISITOR);
        }
        expect(ipDayKey('salt', DAY, VISITOR)).toMatch(/^[0-9a-f]{32}$/);
        expect(quotas.docs.map(doc => doc._id)).toContain(`yourcat:ip:${ipDayKey('salt', DAY, VISITOR)}:${DAY}`);
    });

    it('a missing salt in production is 503', async () => {
        const { gate, env } = setup({ AI_UPLOAD_IP_SALT: undefined, INVALIDATE_CACHE_SECRET: undefined });
        expect(await refusal(gate.admit(req('a'), USER, 'yourcat', env))).toEqual({
            status: 503,
            code: 'YOURCAT_NO_CLIENT_IP',
        });
    });

    it('a transient guest never reaches the AI (428)', async () => {
        const { gate, env } = setup();
        expect((await refusal(gate.admit(req('a'), { transient: true, isGuest: true }, 'yourcat', env))).status).toBe(
            428
        );
    });

    it('manual cats use the per-user quota only', async () => {
        const { gate, env, days } = setup({ AI_MANUAL_USER_DAILY: '1' });
        process.env.AI_MANUAL_USER_DAILY = '1';
        await gate.admitManual(USER, env);
        expect((await refusal(gate.admitManual(USER, env))).code).toBe('YOURCAT_USER_DAILY_CAP');
        expect(days.docs).toEqual([]);
        delete process.env.AI_MANUAL_USER_DAILY;
    });
});
