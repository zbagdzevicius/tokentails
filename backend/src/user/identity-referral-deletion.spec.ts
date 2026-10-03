import { generateKeyPairSync, createVerify } from 'crypto';
import { Types } from 'mongoose';
import { REWARDS } from 'src/shared-contracts/caps';
import { BOARD_FIELD_RESET, deleteAccount, PERSONAL_FIELDS } from './guest/account-deletion';
import { appleClientSecret, appleConfig, revokeAppleAuthorization } from './guest/apple-revoke';
import { emailDomain, isDisposableEmail } from './guest/disposable-domains';
import { firebaseTokenFromHeader } from './guest/firebase-identity';
import { createIdentityHarness, guestSeed, httpError, rejection } from './guest/identity-harness.helper-spec';
import { identityConfig } from './guest/identity-config';
import { isUsableClientIp, IpWindowThrottle, requestIp } from './guest/ip-throttle';
import { applyReferral, referralWindowStart } from './guest/referral';
import { canonicalEmail, sameInbox } from './guest/canonical-email';

jest.mock('src/shared/encryption.service', () => ({
    EncryptionService: class {
        encrypt = () => ({ iv: 'iv', content: 'secret' });
    },
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-30T12:00:00Z');

describe('referral (decision #12)', () => {
    const account = (fields: Record<string, unknown> = {}) => ({
        _id: new Types.ObjectId(),
        name: 'Player',
        isGuest: false,
        tails: 0,
        referrals: [],
        promotedAt: new Date(NOW.getTime() - DAY),
        ...fields,
    });

    it('pays once per referred account, ever, even under parallel calls or other referrers', async () => {
        const [a, b, referred] = [account(), account(), account()];
        const { users } = createIdentityHarness({ users: [a, b, referred] });

        const results = await Promise.allSettled([
            applyReferral(users as any, String(referred._id), String(a._id), NOW),
            applyReferral(users as any, String(referred._id), String(a._id), NOW),
            applyReferral(users as any, String(referred._id), String(b._id), NOW),
        ]);

        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        const paid = users.docs.filter(doc => doc.tails > 0);
        expect(paid).toHaveLength(2);
        expect(users.docs.find(doc => String(doc._id) === String(referred._id))!.tails).toBe(REWARDS.INVITE_FRIEND);
        expect(users.docs.reduce((sum, doc) => sum + doc.tails, 0)).toBe(2 * REWARDS.INVITE_FRIEND);
    });

    it('never overwrites referredBy', async () => {
        const original = new Types.ObjectId();
        const [referrer, referred] = [account(), account({ referredBy: original })];
        const { users } = createIdentityHarness({ users: [referrer, referred] });

        expect(
            httpError(await rejection(applyReferral(users as any, String(referred._id), String(referrer._id), NOW)))
                .status
        ).toBe(409);
        expect(String(users.docs[1].referredBy)).toBe(String(original));
    });

    it('is refused after 7 days from promotion (403), counted from createdAt for older accounts', async () => {
        const referrer = account();
        const late = account({ promotedAt: new Date(NOW.getTime() - 8 * DAY) });
        const legacy = account({ promotedAt: undefined, createdAt: new Date(NOW.getTime() - 400 * DAY) });
        const { users } = createIdentityHarness({ users: [referrer, late, legacy] });

        for (const referred of [late, legacy]) {
            const error = await rejection(applyReferral(users as any, String(referred._id), String(referrer._id), NOW));
            expect(httpError(error).status).toBe(403);
        }
        expect(users.docs.every(doc => doc.tails === 0)).toBe(true);
        expect(referralWindowStart({ createdAt: '2026-01-01' })).toEqual(new Date('2026-01-01'));
    });

    it('refuses guests on either side, unknown referrers and self referral', async () => {
        const referrer = account();
        const { user: guest } = guestSeed('uid-g');
        const { users } = createIdentityHarness({ users: [referrer, guest] });

        expect(
            httpError(await rejection(applyReferral(users as any, String(guest._id), String(referrer._id), NOW))).status
        ).toBe(403);
        expect(
            httpError(await rejection(applyReferral(users as any, String(referrer._id), String(guest._id), NOW))).status
        ).toBe(400);
        expect(httpError(await rejection(applyReferral(users as any, String(referrer._id), 'nope', NOW))).status).toBe(
            400
        );
        expect(
            httpError(await rejection(applyReferral(users as any, String(referrer._id), String(referrer._id), NOW)))
                .status
        ).toBe(400);
    });
});

describe('Gmail aliases (2a review finding #5)', () => {
    afterEach(() => delete process.env.IDENTITY_BACKFILL_DONE);

    const account = (fields: Record<string, unknown> = {}) => ({
        _id: new Types.ObjectId(),
        name: 'Player',
        isGuest: false,
        tails: 0,
        referrals: [],
        promotedAt: new Date(NOW.getTime() - DAY),
        ...fields,
    });

    it('canonicalEmail strips Gmail dots and +tags, maps googlemail.com, leaves other domains alone', () => {
        expect(canonicalEmail(' M.e+1@Gmail.com ')).toBe('me@gmail.com');
        expect(canonicalEmail('m.e+promo@googlemail.com')).toBe('me@gmail.com');
        expect(canonicalEmail('first.last+tag@example.com')).toBe('first.last+tag@example.com');
        expect(canonicalEmail('+x@gmail.com')).toBeNull();
        expect(canonicalEmail('no-at-sign')).toBeNull();
        expect(canonicalEmail(undefined)).toBeNull();
        expect(sameInbox('me@gmail.com', 'm.e+2@gmail.com')).toBe(true);
        expect(sameInbox('me@example.com', 'me+2@example.com')).toBe(false);
        expect(sameInbox(undefined, undefined)).toBe(false);
    });

    it('refuses a referral between two aliases of one inbox, with nothing paid', async () => {
        const referrer = account({ email: 'me@gmail.com' });
        const alias = account({ email: 'm.e+1@gmail.com' });
        const { users } = createIdentityHarness({ users: [referrer, alias] });

        const error = await rejection(applyReferral(users as any, String(alias._id), String(referrer._id), NOW));

        expect(httpError(error).status).toBe(400);
        expect(users.docs.every(doc => doc.tails === 0 && !doc.referredBy)).toBe(true);
    });

    it('after the backfill, a second alias of an already referred inbox is refused (409)', async () => {
        process.env.IDENTITY_BACKFILL_DONE = 'true';
        const [a, b] = [account({ email: 'a@example.com' }), account({ email: 'b@example.com' })];
        const first = account({ email: 'pat@gmail.com', emailCanonical: 'pat@gmail.com', referredBy: a._id });
        const second = account({ email: 'pat+2@gmail.com', emailCanonical: 'pat@gmail.com' });
        const other = account({ email: 'sam@gmail.com', emailCanonical: 'sam@gmail.com' });
        const { users } = createIdentityHarness({ users: [a, b, first, second, other] });

        const error = await rejection(applyReferral(users as any, String(second._id), String(b._id), NOW));
        expect(httpError(error).status).toBe(409);
        await expect(applyReferral(users as any, String(other._id), String(b._id), NOW)).resolves.toMatchObject({
            success: true,
        });
        expect(users.docs.find(doc => String(doc._id) === String(second._id))!.referredBy).toBeUndefined();
    });
});

describe('DELETE /user/me (deleteAccount, decision #4)', () => {
    function setup() {
        const userId = new Types.ObjectId();
        const starter = { _id: new Types.ObjectId(), owner: userId, isStarter: true, name: 'Scout' };
        const adopted = { _id: new Types.ObjectId(), owner: userId, name: 'Luna', staked: new Date() };
        const ctx = createIdentityHarness({
            users: [
                {
                    _id: userId,
                    name: 'Pat',
                    email: 'pat@example.com',
                    firebaseUids: ['uid-google', 'uid-password'],
                    twitter: 'pat',
                    discord: 'pat',
                    wallets: { stellar: { walletAddress: 'GABC' } },
                    tails: 700,
                    catnipCount: 90,
                    cat: starter._id,
                    cats: [starter._id, adopted._id],
                },
            ],
            cats: [starter, adopted, { _id: new Types.ObjectId(), name: 'Someone else', owner: new Types.ObjectId() }],
        });
        const audit = ctx.users.db.collection('accountdeletions');
        const deps = { users: ctx.users as any, cats: ctx.cats as any, firebase: ctx.firebase, audit, now: () => NOW };
        return { ctx, deps, userId, adopted, audit };
    }

    // Changed by the 2a review: board fields are zeroed, so a deleted account never ranks or earns
    // the weekly top-200 reward.
    it('anonymises the record, zeroes board fields, keeps the wallet, deletes the Firebase users', async () => {
        const { ctx, deps, userId } = setup();

        const result = await deleteAccount(deps, String(userId));

        const doc = ctx.users.docs[0];
        expect(doc).toMatchObject({ name: 'Deleted player', cats: [], deletedAt: NOW, ...BOARD_FIELD_RESET });
        PERSONAL_FIELDS.forEach(field => expect(doc[field]).toBeUndefined());
        expect(doc.wallets.stellar.walletAddress).toBe('GABC');
        expect(ctx.firebase.deleted).toEqual(['uid-google', 'uid-password']);
        expect(result).toMatchObject({
            success: true,
            catsReleased: 1,
            firebaseUsersDeleted: 2,
            apple: 'skipped-no-code',
        });
    });

    it('releases adopted cats to the shelter pool (owner null, stake cleared) and removes the starter', async () => {
        const { ctx, deps, userId, adopted } = setup();

        await deleteAccount(deps, String(userId));

        expect(ctx.cats.docs.map(cat => cat.name).sort()).toEqual(['Luna', 'Someone else']);
        const luna = ctx.cats.docs.find(cat => String(cat._id) === String(adopted._id))!;
        expect(luna.owner).toBeNull();
        expect(luna.staked).toBeUndefined();
        expect(luna.releasedAt).toEqual(NOW);
    });

    // 2a review fix #6: GET /cat/sale lists `owner: {$exists: false}`, so `owner: null` hid released
    // rescue cats. A rescue cat with no adoptable cat left in the pool goes back to it; a copy whose
    // catalogue cat is still adoptable, and a paid portrait, are detached. Two released copies of one
    // catalogue cat must not collide on `copy_per_owner_source`.
    it('returns rescue cats to the shelter pool only when their blessing has no adoptable cat left', async () => {
        const userId = new Types.ObjectId();
        const otherId = new Types.ObjectId();
        const listedBlessing = new Types.ObjectId();
        const goneBlessing = new Types.ObjectId();
        const catalogue = { _id: new Types.ObjectId(), name: 'Listed', blessing: listedBlessing };
        const copy = {
            _id: new Types.ObjectId(),
            owner: userId,
            name: 'Copy',
            blessing: listedBlessing,
            sourceCat: catalogue._id,
            staked: new Date(),
        };
        const otherCopy = { ...copy, _id: new Types.ObjectId(), owner: otherId, name: 'Other copy' };
        const lastOfRescue = { _id: new Types.ObjectId(), owner: userId, name: 'Last', blessing: goneBlessing };
        const portrait = {
            _id: new Types.ObjectId(),
            owner: userId,
            name: 'Portrait',
            blessing: new Types.ObjectId(),
            origin: 'portrait',
        };
        const ctx = createIdentityHarness({
            users: [
                { _id: userId, name: 'Pat', firebaseUids: ['uid-a'], cats: [] },
                { _id: otherId, name: 'Sam', firebaseUids: ['uid-b'], cats: [] },
            ],
            cats: [catalogue, copy, otherCopy, lastOfRescue, portrait],
        });
        const audit = ctx.users.db.collection('accountdeletions');
        const deps = { users: ctx.users as any, cats: ctx.cats as any, firebase: ctx.firebase, audit, now: () => NOW };

        const first = await deleteAccount(deps, String(userId));
        await expect(deleteAccount(deps, String(otherId))).resolves.toMatchObject({ catsReleased: 1 });

        expect(first).toMatchObject({ catsReleased: 3, catsToShelterPool: 1 });
        const byName = (name: string) => ctx.cats.docs.find(cat => cat.name === name)!;
        expect('owner' in byName('Last')).toBe(false);
        expect(byName('Last').releasedAt).toEqual(NOW);
        expect(byName('Copy')).toMatchObject({ owner: null, releasedSourceCat: catalogue._id, releasedAt: NOW });
        expect(byName('Copy').sourceCat).toBeUndefined();
        expect(byName('Copy').staked).toBeUndefined();
        expect(byName('Other copy')).toMatchObject({ owner: null, releasedSourceCat: catalogue._id });
        expect(byName('Portrait').owner).toBeNull();
        expect('owner' in byName('Listed')).toBe(false);
    });

    it('zeroes the Heist board and cleared levels, so a deleted player never ranks on a Heist board', async () => {
        const { ctx, deps, userId } = setup();
        Object.assign(ctx.users.docs[0], { heistScore: [300], heistStars: [7], match3Cleared: [0, 1] });

        await deleteAccount(deps, String(userId));

        expect(ctx.users.docs[0]).toMatchObject({ heistScore: [], heistStars: [], match3Cleared: [] });
    });

    it('writes an audit record without personal data', async () => {
        const { deps, userId, audit } = setup();

        await deleteAccount(deps, String(userId), 'apple-code');

        expect(audit.docs).toHaveLength(1);
        const record = JSON.stringify(audit.docs[0]);
        expect(record).not.toContain('pat@example.com');
        expect(record).not.toContain('uid-google');
        expect(audit.docs[0]).toMatchObject({ user: userId, catsReleased: 1, apple: 'skipped-no-config' });
    });

    it('revokes Sign in with Apple first when a code is sent', async () => {
        const { deps, userId } = setup();
        const order: string[] = [];
        deps.firebase.deleteUsers = async () => {
            order.push('firebase');
            return 2;
        };

        const result = await deleteAccount(
            {
                ...deps,
                revokeApple: async code => {
                    order.push(`apple:${code}`);
                    return 'revoked';
                },
            },
            String(userId),
            'fresh-code'
        );

        expect(order).toEqual(['apple:fresh-code', 'firebase']);
        expect(result.apple).toBe('revoked');
    });

    it('404 for a guest or a missing account', async () => {
        const { user } = guestSeed('uid-g');
        const ctx = createIdentityHarness({ users: [user] });
        const deps = {
            users: ctx.users as any,
            cats: ctx.cats as any,
            firebase: ctx.firebase,
            audit: ctx.users.db.collection('a'),
        };

        expect(httpError(await rejection(deleteAccount(deps, String(user._id)))).status).toBe(404);
        expect(httpError(await rejection(deleteAccount(deps, String(new Types.ObjectId())))).status).toBe(404);
    });
});

describe('Sign in with Apple revocation', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const config = {
        teamId: 'TEAM',
        keyId: 'KEY',
        clientId: 'com.tokentails.app',
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };

    it('builds an ES256 client secret Apple can verify', () => {
        const secret = appleClientSecret(config, 1000);
        const [header, payload, signature] = secret.split('.');
        const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64').toString());

        expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY' });
        expect(decode(payload)).toEqual({
            iss: 'TEAM',
            iat: 1000,
            exp: 1300,
            aud: 'https://appleid.apple.com',
            sub: 'com.tokentails.app',
        });
        const verifier = createVerify('SHA256');
        verifier.update(`${header}.${payload}`);
        expect(verifier.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64'))).toBe(
            true
        );
    });

    it('exchanges the code and revokes the refresh token', async () => {
        const calls: { url: string; body: string }[] = [];
        const request = async (url: string, init: any) => {
            calls.push({ url, body: init.body });
            return { ok: true, json: async () => ({ refresh_token: 'refresh-1' }) };
        };

        await expect(revokeAppleAuthorization('code-1', config, request)).resolves.toBe('revoked');
        expect(calls.map(call => call.url)).toEqual([
            'https://appleid.apple.com/auth/token',
            'https://appleid.apple.com/auth/revoke',
        ]);
        expect(calls[0].body).toContain('code=code-1');
        expect(calls[1].body).toContain('token=refresh-1');
        expect(calls[1].body).toContain('token_type_hint=refresh_token');
    });

    it('skips without a code or config, and reports failures without throwing', async () => {
        await expect(revokeAppleAuthorization(undefined, config)).resolves.toBe('skipped-no-code');
        await expect(revokeAppleAuthorization('code', null)).resolves.toBe('skipped-no-config');
        await expect(
            revokeAppleAuthorization('code', config, async () => ({ ok: false, json: async () => ({}) }))
        ).resolves.toBe('failed');
        await expect(
            revokeAppleAuthorization('code', config, async () => {
                throw new Error('network');
            })
        ).resolves.toBe('failed');
        expect(appleConfig({})).toBeNull();
        expect(
            appleConfig({ APPLE_TEAM_ID: 't', APPLE_KEY_ID: 'k', APPLE_CLIENT_ID: 'c', APPLE_PRIVATE_KEY: 'a\\nb' })
        ).toEqual({
            teamId: 't',
            keyId: 'k',
            clientId: 'c',
            privateKey: 'a\nb',
        });
    });
});

describe('identity helpers', () => {
    it('identityConfig defaults: enforce verified new accounts, App Check off, existing unverified allowed, crons off outside production', () => {
        expect(identityConfig({})).toMatchObject({
            enforceEmailVerified: true,
            requireVerifiedExisting: false,
            appCheckEnforce: false,
            newAccountsPerIpPerHour: 10,
            guestSessionsPerIpPerHour: 30,
            extraDisposableDomains: [],
            cronsEnabled: false,
        });
        // Guest crons: on under NODE_ENV=production, CRONS_ENABLED wins either way (review finding #4).
        expect(identityConfig({ NODE_ENV: 'production' }).cronsEnabled).toBe(true);
        expect(identityConfig({ NODE_ENV: 'development' }).cronsEnabled).toBe(false);
        expect(identityConfig({ NODE_ENV: 'production', CRONS_ENABLED: 'false' }).cronsEnabled).toBe(false);
        expect(identityConfig({ CRONS_ENABLED: 'true' }).cronsEnabled).toBe(true);
        expect(identityConfig({ CRONS_ENABLED: 'false' }).cronsEnabled).toBe(false);
        expect(
            identityConfig({
                AUTH_ENFORCE_EMAIL_VERIFIED: 'false',
                APP_CHECK_ENFORCE: 'TRUE',
                NEW_ACCOUNTS_PER_IP_PER_HOUR: '-3',
                DISPOSABLE_EMAIL_DOMAINS: ' A.test, ,b.test',
            })
        ).toMatchObject({
            enforceEmailVerified: false,
            appCheckEnforce: true,
            newAccountsPerIpPerHour: 10,
            extraDisposableDomains: ['a.test', 'b.test'],
        });
    });

    it('fb token headers', () => {
        expect(firebaseTokenFromHeader('fbabc')).toBe('abc');
        expect(firebaseTokenFromHeader('fb')).toBeNull();
        expect(firebaseTokenFromHeader('Bearer x')).toBeNull();
        expect(firebaseTokenFromHeader(undefined)).toBeNull();
    });

    it('disposable domains match subdomains but not look-alikes', () => {
        expect(isDisposableEmail('a@MAILINATOR.com')).toBe(true);
        expect(isDisposableEmail('a@x.yopmail.com')).toBe(true);
        expect(isDisposableEmail('a@notmailinator.com')).toBe(false);
        expect(isDisposableEmail('a@gmail.com')).toBe(false);
        expect(emailDomain('no-at-sign')).toBe('');
    });

    it('IpWindowThrottle counts recorded creations per IP in a sliding hour', () => {
        let now = 0;
        const throttle = new IpWindowThrottle(
            () => 2,
            'slow down',
            1000,
            () => now
        );
        throttle.record('203.0.113.1');
        throttle.record('203.0.113.1');
        expect(() => throttle.check('203.0.113.1')).toThrow('slow down');
        expect(() => throttle.check('198.51.100.2')).not.toThrow();
        now = 1500;
        expect(() => throttle.check('203.0.113.1')).not.toThrow();
        expect(requestIp({ ips: ['1.1.1.1', '2.2.2.2'], ip: '3.3.3.3' })).toBe('1.1.1.1');
        expect(requestIp({ ip: '3.3.3.3' })).toBe('3.3.3.3');
        expect(requestIp(undefined)).toBe('unknown');
    });

    // 2a review fix #3: behind a load balancer with TRUST_PROXY unset every request carries the
    // balancer's private address; one shared bucket would 429 every new player of the site.
    it('IpWindowThrottle fails open for addresses that cannot identify a client', () => {
        const throttle = new IpWindowThrottle(() => 1, 'slow down');
        for (const ip of [
            'unknown',
            '',
            '10.0.0.4',
            '172.20.1.1',
            '192.168.1.9',
            '127.0.0.1',
            '::1',
            '::ffff:10.1.2.3',
            'fd00::1',
            'fe80::1',
            '100.64.0.1',
        ]) {
            throttle.record(ip);
            throttle.record(ip);
            expect(() => throttle.check(ip)).not.toThrow();
        }
        throttle.record('::ffff:203.0.113.9');
        expect(() => throttle.check('::ffff:203.0.113.9')).toThrow('slow down');
        throttle.record('2001:db8::1');
        expect(() => throttle.check('2001:db8::1')).toThrow('slow down');
        expect(isUsableClientIp('172.32.0.1')).toBe(true);
        expect(isUsableClientIp('8.8.8.8')).toBe(true);
        expect(isUsableClientIp('999.1.1.1')).toBe(false);
    });
});
