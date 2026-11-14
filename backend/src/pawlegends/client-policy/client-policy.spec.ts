import { constants, generateKeyPairSync, sign } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { canonicalPolicy, parseClientPolicyQuery } from 'src/shared-contracts/client-policy';
import { PAWLEGENDS_THROTTLES, PawlegendsController } from '../pawlegends.controller';
import { PAWLEGENDS_SIM_INFO } from '../pawlegends-sim-info';
import { PAWLEGENDS_OTA_PUBLIC_KEY_PEM } from './ota-public-key';
import {
    CLIENT_POLICY_CACHE_MS,
    CLIENT_POLICY_STALE_MS,
    ClientPolicyDeps,
    PawlegendsClientPolicyService,
    verifiedPolicy,
    webEntry,
} from './client-policy.service';

/**
 * GET /pawlegends/client-policy (docs/plans/moba/FORCE-UPDATE.md §3.2): the decision table over the signed
 * policy.json and the backend's own sims, the 60 s cache, the 24 h stale copy on a failed fetch, a bad signature
 * ignored, an old client (no parameters) answered `ok`, the throttle and the cache header.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const NOW = Date.parse('2026-11-14T12:00:00Z');
const SIMS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];

function policy(over: Record<string, unknown> = {}, key = privatePem): Record<string, unknown> {
    const p: Record<string, unknown> = {
        schema: 1,
        kind: 'policy',
        platform: 'ios',
        compat: 2,
        minCompat: 2,
        minSim: 26,
        channels: {
            stable: {
                version: '20261114000348-d4e754c',
                seq: 20261114000348,
                simVersion: 26,
                minNative: '1.0.0',
                rollback: false,
                requiredFrom: '2026-11-14T06:00:00Z',
            },
            beta: {
                version: '20261114031325-9c5c82e',
                seq: 20261114031325,
                simVersion: 27,
                minNative: '1.0.0',
                rollback: false,
                requiredFrom: '2026-11-14T03:14:00Z',
            },
        },
        store: 'https://apps.apple.com/app/id6832032981',
        web: 'https://pawlegends.app/play',
        maintenance: null,
        issuedAt: '2026-11-14T06:20:00Z',
        ...over,
    };
    p.signature = sign('sha256', Buffer.from(canonicalPolicy(p)), {
        key,
        padding: constants.RSA_PKCS1_PADDING,
    }).toString('base64');
    return p;
}

function setup(o: { files?: Record<string, unknown>; sims?: number[] } = {}) {
    let t = NOW;
    const files: Record<string, unknown> = {
        'https://u/ios/2/policy.json': policy(),
        'https://w/version.json': { sha: 'abc1234', builtAt: '2026-11-14T06:00:00Z', simVersion: 27 },
        ...(o.files ?? {}),
    };
    const fetchJson = jest.fn(async (url: string) => {
        const v = files[url];
        if (v === undefined || v instanceof Error) throw v ?? new Error('404');
        return JSON.parse(JSON.stringify(v));
    });
    const deps: Partial<ClientPolicyDeps> = {
        fetchJson,
        now: () => t,
        updatesUrl: 'https://u',
        webVersionUrl: 'https://w/version.json',
        publicKeyPem: publicPem,
        acceptedSims: () => o.sims ?? SIMS,
        liveSim: () => 27,
    };
    const svc = new PawlegendsClientPolicyService(deps);
    const q = (s: string) => svc.answer(parseClientPolicyQuery(Object.fromEntries(new URLSearchParams(s))));
    return { svc, q, files, fetchJson, tick: (ms: number) => (t += ms) };
}

const APP = 'platform=ios&compat=2&channel=stable&native=1.1.0';

describe('GET /pawlegends/client-policy: the decision', () => {
    it('no parameters (an old client): ok', async () => {
        const { q } = setup();
        expect(await q('')).toMatchObject({
            schema: 1,
            action: 'ok',
            reason: 'current',
            acceptedSims: SIMS,
            liveSim: 27,
        });
    });
    it('ok: the installed bundle is the channel latest', async () => {
        const { q } = setup();
        const a = await q(`${APP}&bundle=20261114000348-d4e754c&seq=20261114000348&sim=26`);
        expect(a).toMatchObject({ action: 'ok', latest: { version: '20261114000348-d4e754c' }, minSim: 26 });
        expect(a.store).toBe('https://apps.apple.com/app/id6832032981');
    });
    it('update: an older bundle; rollback; a sim the backend does not replay', async () => {
        const { q, files } = setup();
        expect(await q(`${APP}&bundle=20261113220028-f4b8472&seq=20261113220028&sim=26`)).toMatchObject({
            action: 'update',
            reason: 'older-bundle',
        });
        expect(await q(`${APP}&bundle=20261113220028-f4b8472&seq=20261113220028&sim=9`)).toMatchObject({
            action: 'update',
            reason: 'sim-not-accepted',
        });
        const r = setup({
            files: {
                'https://u/ios/2/policy.json': policy({
                    channels: {
                        stable: {
                            ...(policy().channels as any).stable,
                            version: '20261110123949-cfc4fb7',
                            seq: 20261110123949,
                            rollback: true,
                        },
                    },
                }),
            },
        });
        expect(files).toBeTruthy();
        expect(await r.q(`${APP}&bundle=20261114000348-d4e754c&seq=20261114000348&sim=26`)).toMatchObject({
            action: 'update',
            reason: 'rollback',
        });
    });
    it('store: a retired compat; a native shell too old for the latest', async () => {
        const { q } = setup({ files: { 'https://u/ios/1/policy.json': policy({ compat: 1, minSim: 0 }) } });
        expect(await q('platform=ios&compat=1&sim=19&bundle=20261111112457-ef22d35&seq=20261111112457')).toMatchObject({
            action: 'store',
            reason: 'compat-retired',
        });
        const n = setup({
            files: {
                'https://u/ios/2/policy.json': policy({
                    channels: { stable: { ...(policy().channels as any).stable, minNative: '1.2.0' } },
                }),
            },
        });
        expect(await n.q(`${APP}&bundle=20261113220028-f4b8472&seq=20261113220028&sim=26`)).toMatchObject({
            action: 'store',
            reason: 'native-too-old',
        });
    });
    it('maintenance: on while the window lasts, with its message', async () => {
        const { q } = setup({
            files: {
                'https://u/ios/2/policy.json': policy({
                    maintenance: { message: 'Moving servers', until: '2026-11-14T13:00:00Z' },
                }),
            },
        });
        expect(await q(APP)).toMatchObject({
            action: 'maintenance',
            maintenance: { message: 'Moving servers' },
        });
    });
    it("the backend's sims always win: its floor lifts the policy's", async () => {
        const { q } = setup({ sims: [26, 27] });
        expect(await q(`${APP}&bundle=x1&sim=20`)).toMatchObject({
            action: 'update',
            reason: 'sim-not-accepted',
            minSim: 26,
        });
    });
    it('web: version.json decides; a tab on an older sha reloads', async () => {
        const { q } = setup();
        expect(await q('platform=web&bundle=abc1234&sim=27')).toMatchObject({
            action: 'ok',
            latest: { version: 'abc1234' },
        });
        expect(await q('platform=web&bundle=old0001&sim=27')).toMatchObject({
            action: 'update',
            reason: 'older-bundle',
        });
        expect(await q('platform=web&bundle=old0001&sim=9')).toMatchObject({
            action: 'update',
            reason: 'sim-not-accepted',
        });
    });
    it('mac (no OTA): ok, or the store when its sim is not replayed', async () => {
        const { q } = setup();
        expect(await q('platform=mac&sim=26')).toMatchObject({ action: 'ok' });
        expect(await q('platform=mac&sim=9')).toMatchObject({
            action: 'store',
            store: 'https://apps.apple.com/app/id6832032981',
        });
    });
});

describe('GET /pawlegends/client-policy: sources', () => {
    it('caches 60 s', async () => {
        const { q, fetchJson, tick } = setup();
        await q(APP);
        await q(APP);
        expect(fetchJson).toHaveBeenCalledTimes(1);
        tick(CLIENT_POLICY_CACHE_MS + 1);
        await q(APP);
        expect(fetchJson).toHaveBeenCalledTimes(2);
    });
    it('a failed fetch serves the last good copy for up to 24 h, then decides on sims alone', async () => {
        const { q, files, tick } = setup();
        expect(await q(`${APP}&bundle=old-1&seq=1&sim=26`)).toMatchObject({ action: 'update' });
        files['https://u/ios/2/policy.json'] = new Error('down');
        tick(CLIENT_POLICY_CACHE_MS + 1);
        expect(await q(`${APP}&bundle=old-1&seq=1&sim=26`)).toMatchObject({ action: 'update' });
        tick(CLIENT_POLICY_STALE_MS);
        expect(await q(`${APP}&bundle=old-1&seq=1&sim=26`)).toMatchObject({ action: 'ok', latest: null });
        expect(await q(`${APP}&bundle=old-1&seq=1&sim=9`)).toMatchObject({
            action: 'store',
            reason: 'sim-not-accepted',
        });
    });
    it('a policy with a bad signature (or for another platform) is ignored', async () => {
        const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
            .privateKey.export({ type: 'pkcs1', format: 'pem' })
            .toString();
        const { q } = setup({ files: { 'https://u/ios/2/policy.json': policy({}, other) } });
        expect(await q(`${APP}&bundle=old-1&seq=1&sim=26`)).toMatchObject({ action: 'ok', latest: null });
        expect(verifiedPolicy({ ...policy(), minSim: 1 }, publicPem)).toBeNull();
        expect(verifiedPolicy(policy(), publicPem)).not.toBeNull();
        const a = setup({ files: { 'https://u/ios/2/policy.json': policy({ platform: 'android' }) } });
        expect(await a.q(`${APP}&bundle=old-1&seq=1&sim=26`)).toMatchObject({ action: 'ok', latest: null });
    });
    it('version.json: only a sha and a sim', () => {
        expect(webEntry({ sha: 'abc1234', simVersion: 27 })).toMatchObject({
            version: 'abc1234',
            seq: 0,
            simVersion: 27,
        });
        expect(webEntry({ sha: '<x>', simVersion: 27 })).toBeNull();
        expect(webEntry(null)).toBeNull();
    });
    it('the defaults: the live sims, and the OTA public key copy matches pawlegends-app/ota/public-key.pem', async () => {
        const committed = readFileSync(join(__dirname, '../../../../pawlegends-app/ota/public-key.pem'), 'utf8');
        expect(PAWLEGENDS_OTA_PUBLIC_KEY_PEM.trim()).toBe(committed.trim());
        const svc = new PawlegendsClientPolicyService({ fetchJson: async () => Promise.reject(new Error('offline')) });
        expect(await svc.answer({})).toMatchObject({
            action: 'ok',
            acceptedSims: [...PAWLEGENDS_SIM_INFO.simVersions],
            liveSim: PAWLEGENDS_SIM_INFO.simVersion,
        });
    });
});

describe('PawlegendsController.clientPolicy', () => {
    it('is throttled per client IP (120 a minute), cached 60 s, and answers through the service', async () => {
        expect(PAWLEGENDS_THROTTLES.clientPolicy).toEqual({ limit: 120, ttl: 60_000 });
        const consume = jest.fn(async () => undefined);
        const { svc } = setup();
        const controller = new PawlegendsController(
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            { consume } as any,
            undefined,
            undefined,
            undefined,
            undefined,
            svc
        );
        const a = await controller.clientPolicy(
            { platform: 'ios', compat: '2', sim: '26', bundle: 'old-1', seq: '1' },
            {},
            {}
        );
        expect(a).toMatchObject({ action: 'update' });
        expect(consume).toHaveBeenCalledWith(
            'PawlegendsController.clientPolicy',
            {},
            PAWLEGENDS_THROTTLES.clientPolicy,
            {}
        );
        const headers = Reflect.getMetadata('__headers__', PawlegendsController.prototype.clientPolicy);
        expect(headers).toEqual([{ name: 'Cache-Control', value: 'public, max-age=60, stale-if-error=86400' }]);
    });
});
