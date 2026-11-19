import { createHash } from 'crypto';
import { PAWLEGENDS_TICK_HZ } from 'src/shared-contracts/caps';
import { matchSavedProps } from '../history/history.service';
import { reportPurchase } from '../pawlegends-webhook.service';
import { analyticsDistinctId, posthogAdminConfig, posthogConfig, surfaceOf } from './analytics-env';
import { cleanProps, SERVER_EVENTS } from './analytics-events';
import { AnalyticsSink, serverForget, serverTrack, serverTrackOrCount, setAnalyticsSink } from './analytics-sink';
import { PawlegendsAnalyticsService } from './analytics.service';
import { PosthogBatcher, PosthogFetch, stableUuid } from './posthog-batcher';

/*
 * Server-side PostHog (docs/BACKEND.md "Pawlegends server analytics"): fetch is mocked everywhere, nothing leaves.
 */

const TOKEN = 'phc_test_token_not_real';
const HOST = 'https://us.i.posthog.com';

interface Call {
    url: string;
    body: any;
    headers: Record<string, string>;
}

function mockFetch(statuses: number[] = []): { fetch: PosthogFetch; calls: Call[] } {
    const calls: Call[] = [];
    const fetch: PosthogFetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
        const status = statuses.length ? (statuses.shift() as number) : 200;
        if (status === 0) throw new Error('network down');
        return { ok: status >= 200 && status < 300, status };
    };
    return { fetch, calls };
}

const event = (distinctId = 'pl_a', name = 'match_saved') => ({
    event: name,
    distinct_id: distinctId,
    properties: { distinct_id: distinctId },
    timestamp: new Date(0).toISOString(),
    uuid: stableUuid(`${name}:${distinctId}`),
});

describe('analytics env', () => {
    it('needs a token; the host defaults to the US ingestion host and must be https', () => {
        expect(posthogConfig({})).toBeNull();
        expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: '  ' })).toBeNull();
        expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: TOKEN })).toEqual({ token: TOKEN, host: HOST });
        expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: TOKEN, POSTHOG_HOST: 'https://eu.i.posthog.com/' })).toEqual({
            token: TOKEN,
            host: 'https://eu.i.posthog.com',
        });
        expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: TOKEN, POSTHOG_HOST: 'http://evil.example' })?.host).toBe(HOST);
    });

    it('person deletion needs a personal key and a numeric project id', () => {
        expect(posthogAdminConfig({ POSTHOG_PERSONAL_API_KEY: 'phx_k' })).toBeNull();
        expect(posthogAdminConfig({ POSTHOG_PERSONAL_API_KEY: 'phx_k', POSTHOG_PROJECT_ID: 'abc' })).toBeNull();
        expect(posthogAdminConfig({ POSTHOG_PERSONAL_API_KEY: 'phx_k', POSTHOG_PROJECT_ID: '123' })).toEqual({
            key: 'phx_k',
            projectId: '123',
            host: 'https://us.posthog.com',
        });
    });

    it('the distinct id is pawlegends-web accountDistinctId: pl_ + 32 hex of sha256("pawlegends:" + uid)', () => {
        const hex = createHash('sha256').update('pawlegends:uid-1').digest('hex');
        expect(analyticsDistinctId('uid-1')).toBe(`pl_${hex.slice(0, 32)}`);
        expect(analyticsDistinctId('uid-1')).not.toContain('uid-1');
    });

    it('names the surface from the Origin header', () => {
        expect(surfaceOf('https://pawlegends.app')).toBe('pawlegends');
        expect(surfaceOf('https://localhost')).toBe('pawlegends');
        expect(surfaceOf('capacitor://localhost')).toBe('app');
        expect(surfaceOf('https://tokentails.com')).toBe('tokentails');
        expect(surfaceOf(undefined)).toBe('tokentails');
    });
});

describe('cleanProps', () => {
    it('keeps only declared keys of the declared kind, never free text or personal data', () => {
        const out = cleanProps('purchase_completed', {
            sku: 'pl_founder',
            amount_cents: 499,
            currency: 'usd',
            email: 'player@example.com',
            accountId: '64f0c0ffee',
            item: 'has spaces and @',
            method: 42,
        });
        expect(out).toEqual({ sku: 'pl_founder', amount_cents: 499, currency: 'usd' });
    });

    it('every event declares its properties', () => {
        for (const props of Object.values(SERVER_EVENTS)) expect(Object.keys(props).length).toBeGreaterThan(0);
    });
});

describe('PosthogBatcher', () => {
    it('sends one batch to /batch/ with the project token', async () => {
        const { fetch, calls } = mockFetch();
        const b = new PosthogBatcher({ token: TOKEN, host: HOST, fetch, flushMs: 60_000 });
        b.enqueue(event('pl_a'));
        b.enqueue(event('pl_b'));
        await b.flush();
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(`${HOST}/batch/`);
        expect(calls[0].body.api_key).toBe(TOKEN);
        expect(calls[0].body.batch.map((e: any) => e.distinct_id)).toEqual(['pl_a', 'pl_b']);
        expect(b.size).toBe(0);
        expect(b.stats.sent).toBe(2);
        await b.close();
    });

    it('flushes by itself when a batch fills', async () => {
        const { fetch, calls } = mockFetch();
        const b = new PosthogBatcher({ token: TOKEN, host: HOST, fetch, flushMs: 60_000, maxBatch: 2 });
        b.enqueue(event('pl_a'));
        b.enqueue(event('pl_b'));
        await b.flush();
        expect(calls).toHaveLength(1);
        await b.close();
    });

    it('keeps a batch after a 5xx or a network error, backs off, and sends it later', async () => {
        let t = 1_000_000;
        const { fetch, calls } = mockFetch([503, 0, 200]);
        const warn = jest.fn();
        const b = new PosthogBatcher({ token: TOKEN, host: HOST, fetch, flushMs: 1000, now: () => t, log: { warn } });
        b.enqueue(event('pl_a'));
        await b.flush();
        expect(b.size).toBe(1);
        await b.flush(); // still backing off: nothing sent
        expect(calls).toHaveLength(1);
        t += 120_000;
        await b.flush(); // network error
        expect(b.size).toBe(1);
        t += 120_000;
        await b.flush();
        expect(b.size).toBe(0);
        expect(calls).toHaveLength(3);
        expect(b.stats.sent).toBe(1);
        expect(warn).toHaveBeenCalledTimes(2); // two failures two minutes apart: one warning a minute at most
        await b.close();
    });

    it('drops a batch PostHog refuses (4xx) and an event after maxAttempts', async () => {
        const { fetch } = mockFetch([400]);
        const b = new PosthogBatcher({ token: TOKEN, host: HOST, fetch, flushMs: 60_000 });
        b.enqueue(event('pl_a'));
        await b.flush();
        expect(b.size).toBe(0);
        expect(b.stats.dropped).toBe(1);

        let t = 0;
        const failing = mockFetch([500, 500]);
        const c = new PosthogBatcher({
            token: TOKEN,
            host: HOST,
            fetch: failing.fetch,
            flushMs: 1,
            maxAttempts: 2,
            now: () => t,
        });
        c.enqueue(event('pl_b'));
        await c.flush();
        t += 1_000_000;
        await c.flush();
        expect(c.size).toBe(0);
        expect(c.stats.dropped).toBe(1);
        await b.close();
        await c.close();
    });

    it('drops the oldest events past maxQueue, and every waiting event of a withdrawn id', async () => {
        const { fetch } = mockFetch();
        const b = new PosthogBatcher({ token: TOKEN, host: HOST, fetch, flushMs: 60_000, maxQueue: 3, maxBatch: 100 });
        for (const id of ['pl_1', 'pl_2', 'pl_3', 'pl_4']) b.enqueue(event(id));
        expect(b.size).toBe(3);
        expect(b.drop('pl_3')).toBe(1);
        expect(b.size).toBe(2);
        await b.close();
    });

    it('close() sends what is left, then refuses new events', async () => {
        const { fetch, calls } = mockFetch();
        const b = new PosthogBatcher({ token: TOKEN, host: HOST, fetch, flushMs: 60_000, maxBatch: 2 });
        for (const id of ['pl_1', 'pl_2', 'pl_3']) b.enqueue(event(id));
        await b.close();
        expect(calls.reduce((n, c) => n + c.body.batch.length, 0)).toBe(3);
        b.enqueue(event('pl_4'));
        expect(b.size).toBe(0);
    });

    it('stable uuids: the same fact, the same uuid', () => {
        expect(stableUuid('a')).toBe(stableUuid('a'));
        expect(stableUuid('a')).not.toBe(stableUuid('b'));
        expect(stableUuid('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// The service, over in-memory models

function models(users: Record<string, { firebaseUids?: string[] }>) {
    const rows = new Map<string, any>();
    const consents = {
        rows,
        findById: (id: string) => ({ lean: async () => (rows.has(id) ? { ...rows.get(id) } : null) }),
        updateOne: async (filter: { _id: string }, update: { $set: Record<string, unknown> }) => {
            rows.set(filter._id, { _id: filter._id, ...(rows.get(filter._id) ?? {}), ...update.$set });
            return { matchedCount: 1 };
        },
        deleteOne: async (filter: { _id: string }) => {
            rows.delete(filter._id);
            return { deletedCount: 1 };
        },
    };
    const userModel = {
        findOne: (filter: { _id: string }) => ({ lean: async () => users[filter._id] ?? null }),
    };
    return { consents, users: userModel };
}

function service(env: Record<string, string> = { POSTHOG_PROJECT_TOKEN: TOKEN }) {
    const m = models({ acc1: { firebaseUids: ['uid-a', 'uid-b'] }, acc2: { firebaseUids: ['uid-c'] }, acc3: {} });
    const net = mockFetch();
    const svc = new PawlegendsAnalyticsService(m.consents, m.users, {
        env,
        fetch: net.fetch,
        now: () => 1_700_000_000_000,
        flushMs: 60_000,
    });
    return { svc, m, net };
}

const sent = (calls: Call[]) => calls.filter(c => c.url.endsWith('/batch/')).flatMap(c => c.body.batch);

describe('PawlegendsAnalyticsService', () => {
    afterEach(() => setAnalyticsSink(null));

    it('without a token nothing is built and nothing is sent', async () => {
        const { svc, net } = service({});
        expect(svc.batcher).toBeNull();
        await svc.setConsent('acc1', { granted: true });
        await svc.track('acc1', 'match_saved', { mode: 'skirmish' });
        expect((await svc.state('acc1')).configured).toBe(false);
        expect(net.calls).toHaveLength(0);
    });

    it('sends nothing for an account that never answered or denied', async () => {
        const { svc, net } = service();
        await svc.track('acc1', 'match_saved', { mode: 'skirmish' });
        await svc.setConsent('acc2', { granted: false });
        await svc.track('acc2', 'match_saved', { mode: 'skirmish' });
        await svc.batcher!.flush(true);
        expect(net.calls).toHaveLength(0);
        await svc.onModuleDestroy();
    });

    it('keeps a claimed id only when it hashes one of the account own uids', async () => {
        const { svc, m } = service();
        const own = analyticsDistinctId('uid-b');
        expect(await svc.setConsent('acc1', { granted: true, distinctId: own, version: '2026-11-19' })).toEqual({
            granted: true,
            distinctId: own,
            configured: true,
        });
        const other = analyticsDistinctId('uid-c');
        expect((await svc.setConsent('acc1', { granted: true, distinctId: other })).distinctId).toBe(
            analyticsDistinctId('uid-a')
        );
        expect(m.consents.rows.get('acc1')).toMatchObject({ granted: true, v: null });
        await svc.onModuleDestroy();
    });

    it('refuses malformed answers and an account with no uid', async () => {
        const { svc } = service();
        await expect(svc.setConsent('acc1', { granted: 'yes' })).rejects.toBeDefined();
        await expect(svc.setConsent('acc1', { granted: true, distinctId: 'raw-uid' })).rejects.toBeDefined();
        await expect(svc.setConsent('acc1', { granted: true, version: 'a b' })).rejects.toBeDefined();
        await expect(svc.setConsent('acc3', { granted: true })).rejects.toBeDefined();
        await svc.onModuleDestroy();
    });

    it('a consenting account: the event goes under its hashed id with only the allowed properties', async () => {
        const { svc, net } = service();
        await svc.setConsent('acc1', { granted: true });
        await svc.track('acc1', 'match_saved', { mode: 'ranked', hero: 'clem', email: 'x@example.com' }, 'm1');
        await svc.track('acc1', 'match_saved', { mode: 'ranked', hero: 'clem' }, 'm1');
        await svc.onModuleDestroy();
        const [a, b] = sent(net.calls);
        expect(a.distinct_id).toBe(analyticsDistinctId('uid-a'));
        expect(a.properties).toMatchObject({
            mode: 'ranked',
            hero: 'clem',
            $lib: 'pawlegends-server',
            source: 'server',
            $geoip_disable: true,
        });
        expect(a.properties.email).toBeUndefined();
        expect(JSON.stringify(a)).not.toContain('acc1');
        expect(JSON.stringify(a)).not.toContain('uid-a');
        // the same fact twice (a retried save) carries one uuid: PostHog keeps one
        expect(b.uuid).toBe(a.uuid);
    });

    it('a withdrawal stops events at once and drops the ones waiting', async () => {
        const { svc, net } = service();
        await svc.setConsent('acc1', { granted: true });
        await svc.track('acc1', 'yarn_granted', { reason: 'match', amount: 10 });
        expect(svc.batcher!.size).toBe(1);
        await svc.setConsent('acc1', { granted: false });
        expect(svc.batcher!.size).toBe(0);
        await svc.track('acc1', 'yarn_granted', { reason: 'match', amount: 10 });
        await svc.onModuleDestroy();
        expect(sent(net.calls)).toHaveLength(0);
        expect(await svc.state('acc1')).toMatchObject({ granted: false, distinctId: null });
    });

    it('anonymous counts carry no person; trackOrCount picks the account only with consent', async () => {
        const { svc, net } = service();
        await svc.anonymous('account_created', { kind: 'guest', surface: 'pawlegends' });
        await svc.trackOrCount('acc2', 'purchase_completed', { amount_cents: 500, currency: 'usd' }, 's1');
        await svc.setConsent('acc1', { granted: true });
        await svc.trackOrCount('acc1', 'purchase_completed', { amount_cents: 500, currency: 'usd' }, 's2');
        await svc.onModuleDestroy();
        const [anon, count, mine] = sent(net.calls);
        expect(anon.distinct_id).toMatch(/^srv_/);
        expect(anon.properties.$process_person_profile).toBe(false);
        expect(count.distinct_id).toMatch(/^srv_/);
        expect(mine.distinct_id).toBe(analyticsDistinctId('uid-a'));
        expect(mine.properties.$process_person_profile).toBeUndefined();
    });

    it('forget: drops waiting events, deletes the PostHog person when configured, removes the row', async () => {
        const { svc, m, net } = service({
            POSTHOG_PROJECT_TOKEN: TOKEN,
            POSTHOG_PERSONAL_API_KEY: 'phx_test',
            POSTHOG_PROJECT_ID: '42',
        });
        await svc.setConsent('acc1', { granted: true });
        await svc.track('acc1', 'match_saved', { mode: 'skirmish' });
        await svc.forget('acc1');
        expect(svc.batcher!.size).toBe(0);
        expect(m.consents.rows.has('acc1')).toBe(false);
        const del = net.calls.find(c => c.url.includes('/persons/bulk_delete/'))!;
        expect(del.url).toBe('https://us.posthog.com/api/projects/42/persons/bulk_delete/');
        expect(del.headers.authorization).toBe('Bearer phx_test');
        expect(del.body).toEqual({
            distinct_ids: expect.arrayContaining([analyticsDistinctId('uid-a'), analyticsDistinctId('uid-b')]),
            delete_events: true,
        });
        // never answered: no person exists, nothing to delete
        await svc.forget('acc2');
        expect(net.calls.filter(c => c.url.includes('bulk_delete'))).toHaveLength(1);
        await svc.onModuleDestroy();
    });

    it('the sink: no-ops without a service, never throws into the caller', async () => {
        expect(() => serverTrack('acc1', 'match_saved', {})).not.toThrow();
        await expect(serverForget('acc1')).resolves.toBeUndefined();
        const broken: AnalyticsSink = {
            track: () => Promise.reject(new Error('x')),
            anonymous: () => Promise.reject(new Error('x')),
            trackOrCount: () => {
                throw new Error('sync');
            },
            forget: () => Promise.reject(new Error('x')),
        };
        setAnalyticsSink(broken);
        expect(() => serverTrack('acc1', 'match_saved', {})).not.toThrow();
        expect(() => serverTrackOrCount('acc1', 'purchase_completed', {})).not.toThrow();
        await expect(serverForget('acc1')).resolves.toBeUndefined();
    });
});

describe('event sources', () => {
    afterEach(() => setAnalyticsSink(null));

    it('match_saved: the verified row as properties (mode, map, takedowns, grade, MVP, party, bots)', () => {
        const stats = [0, 1, 2, 3, 4, 5].map(slot => ({
            slot,
            hero: slot === 0 ? 'clem' : 'pixel',
            kills: slot === 0 ? 5 : 1,
            deaths: 1,
            assists: slot === 0 ? 3 : 0,
            heroDamage: slot === 0 ? 9000 : 100,
            towerDamage: 0,
        }));
        const props = matchSavedProps({
            accountId: 'acc1',
            matchId: 'party:ROOM1',
            at: new Date('2026-11-19T10:00:00Z'),
            mode: 'coop',
            map: 'crossing',
            mutator: null,
            difficulty: 'normal',
            outcome: 'won',
            reason: 'core',
            ticks: PAWLEGENDS_TICK_HZ * 600,
            finalHash: 'h',
            slot: 0,
            stats,
            humans: new Map([
                [0, 'acc1'],
                [1, 'acc2'],
            ]),
            simVersion: 38,
        })!;
        expect(props).toMatchObject({
            mode: 'coop',
            map: 'crossing',
            outcome: 'won',
            length_s: 600,
            hero: 'clem',
            takedowns: 8,
            mvp: true,
            party_size: 2,
            humans: 2,
            bots: 4,
            solo: false,
            sim_version: 38,
        });
        expect(JSON.stringify(props)).not.toContain('acc');
    });

    it('purchases go through trackOrCount with the session as key, never the email', () => {
        const calls: unknown[][] = [];
        setAnalyticsSink({
            track: async () => undefined,
            anonymous: async () => undefined,
            trackOrCount: async (...args: unknown[]) => {
                calls.push(args);
            },
            forget: async () => undefined,
        });
        reportPurchase('purchase_completed', 'acc1', 'cs_test_1', { sku: 'pl_founder', amount_cents: 999 });
        reportPurchase('purchase_refunded', undefined, 'cs_test_2', { sku: 'pl_founder', reason: 'refund' });
        expect(calls).toEqual([
            [
                'acc1',
                'purchase_completed',
                { store: 'pawlegends', method: 'card', sku: 'pl_founder', amount_cents: 999 },
                'pl:cs_test_1',
            ],
            [
                null,
                'purchase_refunded',
                { store: 'pawlegends', method: 'card', sku: 'pl_founder', reason: 'refund' },
                'pl:cs_test_2',
            ],
        ]);
    });
});
