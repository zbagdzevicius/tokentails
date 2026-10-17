import { createDecipheriv, createECDH, createHmac, createPublicKey, generateKeyPairSync, verify } from 'crypto';
import { Types } from 'mongoose';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import { badcatVapidKeys } from './badcat-flags';
import { BadcatOnlineStore } from './badcat-online.schema';
import { BadcatPushService, streakEmailHtml } from './badcat-push.service';
import { b64url, buildPushRequest, encryptPayload, fromB64url, isPushEndpoint, vapidJwt } from './badcat-webpush';

/*
 * Web push without a dependency (RFC 8291 + RFC 8292) and the reminder jobs. The spec plays the browser: it holds the
 * subscription's private key and decrypts what the server sent.
 */

function vapid() {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwkPriv = privateKey.export({ format: 'jwk' }) as any;
    const jwkPub = publicKey.export({ format: 'jwk' }) as any;
    const pub = Buffer.concat([Buffer.from([4]), fromB64url(jwkPub.x), fromB64url(jwkPub.y)]);
    return { publicKey: b64url(pub), privateKey: jwkPriv.d as string, subject: 'mailto:hello@tokentails.com' };
}

function browser() {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const auth = Buffer.from('0123456789abcdef');
    return { ecdh, p256dh: b64url(ecdh.getPublicKey()), auth: b64url(auth), authBuf: auth };
}

const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) => {
    const prk = createHmac('sha256', salt).update(ikm).digest();
    return createHmac('sha256', prk)
        .update(Buffer.concat([info, Buffer.from([1])]))
        .digest()
        .subarray(0, len);
};

/** RFC 8291 decryption, as a browser does it. */
function decrypt(body: Buffer, ua: ReturnType<typeof browser>): string {
    const salt = body.subarray(0, 16);
    const idLen = body[20];
    const asPublic = body.subarray(21, 21 + idLen);
    const sealed = body.subarray(21 + idLen);
    const shared = ua.ecdh.computeSecret(asPublic);
    const info = Buffer.concat([Buffer.from('WebPush: info\0'), ua.ecdh.getPublicKey(), asPublic]);
    const ikm = hkdf(ua.authBuf, shared, info, 32);
    const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
    const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(sealed.subarray(sealed.length - 16));
    const plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
    expect(plain[plain.length - 1]).toBe(2);
    return plain.subarray(0, plain.length - 1).toString('utf8');
}

describe('web push (RFC 8291 / 8292)', () => {
    it('encrypts a payload the subscription can decrypt', () => {
        const ua = browser();
        const body = encryptPayload(Buffer.from('{"hi":1}'), ua.p256dh, ua.auth);
        expect(body.readUInt32BE(16)).toBe(4096);
        expect(decrypt(body, ua)).toBe('{"hi":1}');
    });

    it('signs a VAPID JWT the public key verifies, for the endpoint origin', () => {
        const keys = vapid();
        const jwt = vapidJwt('https://fcm.googleapis.com/fcm/send/abc', keys, 1_800_000_000);
        const [h, c, s] = jwt.split('.');
        expect(JSON.parse(fromB64url(c).toString())).toEqual({
            aud: 'https://fcm.googleapis.com',
            exp: 1_800_000_000 + 43200,
            sub: 'mailto:hello@tokentails.com',
        });
        const pub = fromB64url(keys.publicKey);
        const key = createPublicKey({
            key: { kty: 'EC', crv: 'P-256', x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33)) },
            format: 'jwk',
        });
        expect(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, fromB64url(s))).toBe(
            true
        );
        expect(
            badcatVapidKeys({ BADCAT_VAPID_PUBLIC_KEY: keys.publicKey, BADCAT_VAPID_PRIVATE_KEY: keys.privateKey })
        ).toEqual(keys);
        expect(badcatVapidKeys({})).toBeNull();
    });

    it('only talks to known push services', () => {
        expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
        expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
        expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
        expect(isPushEndpoint('https://169.254.169.254/latest')).toBe(false);
        expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
        expect(isPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    });

    it('builds the request headers', () => {
        const ua = browser();
        const keys = vapid();
        const req = buildPushRequest(
            { endpoint: 'https://fcm.googleapis.com/x', p256dh: ua.p256dh, auth: ua.auth },
            { a: 1 },
            keys,
            1
        );
        expect(req.headers['Content-Encoding']).toBe('aes128gcm');
        expect(req.headers.Authorization).toMatch(
            new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`)
        );
        expect(JSON.parse(decrypt(req.body, ua))).toEqual({ a: 1 });
    });
});

describe('BadcatPushService', () => {
    const NOW = new Date('2026-11-20T08:00:00Z'); // day 5, 08:00 UTC
    function setup(env: Record<string, string>) {
        const now = () => new Date(NOW.getTime());
        const pushSubs = new MemoryModel([], [{ fields: ['endpoint'] }], now);
        pushSubs.extraCollections.set('jobruns', new MemoryModel([], [{ fields: ['_id'] }], now));
        const streakEmails = new MemoryModel([], [{ fields: ['user'] }], now);
        streakEmails.extraCollections.set('jobruns', new MemoryModel([], [{ fields: ['_id'] }], now));
        const games = new MemoryModel([], [], now);
        const store = { pushSubs, streakEmails } as unknown as BadcatOnlineStore;
        const service = new BadcatPushService(store, games as any);
        service.now = now;
        const sent: { url: string; body: Buffer }[] = [];
        service.fetchImpl = jest.fn(async (url: string, init: any) => {
            sent.push({ url, body: init.body });
            return { status: url.includes('gone') ? 410 : 201 };
        });
        return { service, pushSubs, streakEmails, games, sent, env };
    }

    it('stores a subscription with the hour in UTC and sends once a day', async () => {
        const keys = vapid();
        const env = {
            BADCAT_ENABLED: 'true',
            BADCAT_PUSH_ENABLED: 'true',
            BADCAT_VAPID_PUBLIC_KEY: keys.publicKey,
            BADCAT_VAPID_PRIVATE_KEY: keys.privateKey,
        };
        const h = setup(env);
        const ua = browser();
        // 10:00 in UTC+2 (offset -120) = 08:00 UTC
        await expect(
            h.service.subscribe(
                {
                    subscription: {
                        endpoint: 'https://fcm.googleapis.com/fcm/send/a',
                        keys: { p256dh: ua.p256dh, auth: ua.auth },
                    },
                    hour: 10,
                    tzOffsetMin: -120,
                },
                env
            )
        ).resolves.toEqual({ ok: true, utcHour: 8 });
        await h.service.subscribe(
            {
                subscription: {
                    endpoint: 'https://fcm.googleapis.com/fcm/send/gone',
                    keys: { p256dh: ua.p256dh, auth: ua.auth },
                },
                hour: 8,
                tzOffsetMin: 0,
            },
            env
        );
        const first = await h.service.sendReminders(env);
        expect(first).toEqual({ sent: 1, failed: 0, removed: 1 });
        expect(JSON.parse(decrypt(h.sent[0].body, ua))).toMatchObject({
            title: expect.stringContaining('room is open'),
            url: expect.stringContaining('/badcat/d/5'),
        });
        expect(h.pushSubs.docs).toHaveLength(1);
        expect(await h.service.sendReminders(env)).toMatchObject({ skipped: 'claimed' });
        await expect(
            h.service.subscribe(
                {
                    subscription: { endpoint: 'https://evil.example/x', keys: { p256dh: ua.p256dh, auth: ua.auth } },
                    hour: 1,
                    tzOffsetMin: 0,
                },
                env
            )
        ).rejects.toThrow();
    });

    it('does nothing while off', async () => {
        const h = setup({});
        expect(await h.service.sendReminders({})).toMatchObject({ skipped: 'disabled' });
        expect(await h.service.sendStreakEmails({})).toMatchObject({ skipped: 'disabled' });
    });

    it('emails a streak that ends tonight (played yesterday, not today)', async () => {
        const env = {
            BADCAT_ENABLED: 'true',
            BADCAT_ACCOUNTS_ENABLED: 'true',
            BADCAT_STREAK_EMAIL_ENABLED: 'true',
            SENDGRID_API_KEY: 'SG.test',
        };
        const h = setup(env);
        const saved = process.env.SENDGRID_API_KEY;
        process.env.SENDGRID_API_KEY = 'SG.test';
        try {
            const a = new Types.ObjectId();
            const b = new Types.ObjectId();
            h.games.docs.push(
                { type: 'BAD_CAT', user: a, level: 'd4' },
                { type: 'BAD_CAT', user: a, level: 'd3' },
                { type: 'BAD_CAT', user: b, level: 'd4' },
                { type: 'BAD_CAT', user: b, level: 'd5' }
            );
            h.streakEmails.docs.push({ _id: new Types.ObjectId(), user: a, email: 'a@example.com', on: true });
            h.streakEmails.docs.push({ _id: new Types.ObjectId(), user: b, email: 'b@example.com', on: true });
            expect(await h.service.streakEndingTonight(a, 5)).toBe(2);
            expect(await h.service.streakEndingTonight(b, 5)).toBe(0);
            const mails: string[] = [];
            h.service.emailFetch = jest.fn(async (_url: string, init: any) => {
                mails.push(JSON.parse(init.body).personalizations[0].to[0].email);
                return { ok: true, status: 202 };
            });
            const res = await h.service.sendStreakEmails(env);
            expect(res).toMatchObject({ sent: 1 });
            expect(mails).toEqual(['a@example.com']);
            expect(streakEmailHtml(2, 'Kitchen #5', 'https://x/<b>')).toContain('&lt;b&gt;');
        } finally {
            if (saved === undefined) delete process.env.SENDGRID_API_KEY;
            else process.env.SENDGRID_API_KEY = saved;
        }
    });
});
