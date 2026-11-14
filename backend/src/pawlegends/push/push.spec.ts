import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from 'crypto';
import {
    afterSend,
    decide,
    endpointAllowed,
    inQuietHours,
    keyOk,
    parseCategories,
    parseTz,
    PUSH_DAILY_CAP,
    safePath,
} from './push.rules';
import { pushVapid } from './push-env';
import { pushBroadcast, pushNotify, setPushSink } from './push-sink';
import { PushService, subId } from './push.service';
import {
    b64u,
    encryptPayload,
    generateVapidKeys,
    sendWebPush,
    unb64u,
    vapidAuthorization,
    vapidKeysValid,
} from './web-push';

/*
 * Push notifications (docs/plans/moba/SHARE-PUSH.md §2): the RFC 8291 payload decrypts on the browser side, the VAPID
 * JWT verifies with the public key, only push-service endpoints are accepted, quiet hours / gaps / the daily cap hold,
 * a 410 deletes the device, events are announced once, Winter Nap reminds at 18:00 device time.
 */

// ------------------------------------------------------------------ the browser side of RFC 8291 (decrypt)

const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) => {
    const prk = createHmac('sha256', salt).update(ikm).digest();
    return createHmac('sha256', prk)
        .update(Buffer.concat([info, Buffer.from([1])]))
        .digest()
        .subarray(0, len);
};

function browserKeys() {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const auth = Buffer.from('0123456789abcdef');
    return { ua, sub: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) }, auth };
}

function decrypt(body: Buffer, ua: ReturnType<typeof createECDH>, auth: Buffer): string {
    const salt = body.subarray(0, 16);
    const idlen = body[20];
    const asPublic = body.subarray(21, 21 + idlen);
    const ct = body.subarray(21 + idlen);
    const shared = ua.computeSecret(asPublic);
    const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32);
    const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
    const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    expect(plain[plain.length - 1]).toBe(2);
    return plain.subarray(0, plain.length - 1).toString();
}

const FCM = 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuvwxyz0123456789';

describe('web push crypto', () => {
    it('encrypts a payload the browser decrypts (aes128gcm)', () => {
        const { ua, sub, auth } = browserKeys();
        const body = encryptPayload(Buffer.from('{"t":"Party invite"}'), sub.p256dh, sub.auth);
        expect(body.readUInt32BE(16)).toBe(4096);
        expect(decrypt(body, ua, auth)).toBe('{"t":"Party invite"}');
    });

    it('signs a VAPID JWT for the endpoint origin that verifies with the public key', () => {
        const k = generateVapidKeys();
        expect(vapidKeysValid(k.publicKey, k.privateKey)).toBe(true);
        expect(vapidKeysValid(k.publicKey, generateVapidKeys().privateKey)).toBe(false);
        const h = vapidAuthorization(FCM, { ...k, subject: 'https://pawlegends.app' }, 1_800_000_000);
        const m = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
        expect(m[2]).toBe(k.publicKey);
        const [head, body, sig] = m[1].split('.');
        const claims = JSON.parse(unb64u(body).toString());
        expect(claims).toEqual({
            aud: 'https://fcm.googleapis.com',
            exp: 1_800_000_000 + 12 * 3600,
            sub: 'https://pawlegends.app',
        });
        const pub = unb64u(k.publicKey);
        const key = createPublicKey({
            key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) },
            format: 'jwk',
        });
        expect(verify('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }, unb64u(sig))).toBe(
            true
        );
    });

    it('a private key with a leading zero byte (31 bytes, ~1 in 256) is padded: valid, signs, and the env accepts it', () => {
        // find such a key the way the documented one-liner makes one (getPrivateKey drops leading zeros)
        let pub = '';
        let short = '';
        for (let i = 0; i < 5000 && !short; i++) {
            const e = createECDH('prime256v1');
            e.generateKeys();
            if (e.getPrivateKey().length < 32) {
                pub = b64u(e.getPublicKey());
                short = b64u(e.getPrivateKey());
            }
        }
        expect(short.length).toBeGreaterThan(0);
        expect(short.length).toBeLessThan(43);
        expect(vapidKeysValid(pub, short)).toBe(true);
        const keys = pushVapid({ PAWLEGENDS_VAPID_PUBLIC_KEY: pub, PAWLEGENDS_VAPID_PRIVATE_KEY: short });
        expect(keys?.privateKey).toHaveLength(43);
        expect(vapidAuthorization(FCM, keys!, 1_800_000_000)).toMatch(/^vapid t=[^,]+, k=/);
        // the generator always gives 43 characters
        for (let i = 0; i < 600; i++) expect(generateVapidKeys().privateKey).toHaveLength(43);
    });

    it('maps the push service answer: 201 sent, 410 gone, 500 failed; sends TTL, encoding and topic', async () => {
        const k = { ...generateVapidKeys(), subject: 'https://pawlegends.app' };
        const { sub } = browserKeys();
        const seen: any[] = [];
        const fetch = (status: number) => async (url: string, init: any) => {
            seen.push({ url, init });
            return { status };
        };
        expect(
            await sendWebPush({ endpoint: FCM, ...sub }, { t: 'x' }, k, {
                ttlSec: 120,
                topic: 'invite',
                fetch: fetch(201),
            })
        ).toBe('sent');
        expect(seen[0].init.headers).toMatchObject({ TTL: '120', 'Content-Encoding': 'aes128gcm', Topic: 'invite' });
        expect(await sendWebPush({ endpoint: FCM, ...sub }, { t: 'x' }, k, { ttlSec: 1, fetch: fetch(410) })).toBe(
            'gone'
        );
        expect(await sendWebPush({ endpoint: FCM, ...sub }, { t: 'x' }, k, { ttlSec: 1, fetch: fetch(500) })).toBe(
            'failed'
        );
    });
});

// ------------------------------------------------------------------ rules

describe('push rules', () => {
    it('accepts only https push-service endpoints (the server POSTs there)', () => {
        expect(endpointAllowed(FCM)).toBe(true);
        expect(endpointAllowed('https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk')).toBe(true);
        expect(endpointAllowed('https://web.push.apple.com/QGuQyavXutnMH0123456789')).toBe(true);
        expect(endpointAllowed('https://evil.example.com/fcm.googleapis.com/x')).toBe(false);
        expect(endpointAllowed('http://fcm.googleapis.com/fcm/send/abcdefghijk')).toBe(false);
        expect(endpointAllowed('https://user:pw@fcm.googleapis.com/fcm/send/abcdefghijk')).toBe(false);
        expect(endpointAllowed('https://fcm.googleapis.com:8443/fcm/send/abcdefghijk')).toBe(false);
        expect(endpointAllowed('https://169.254.169.254/latest/meta-data/xx')).toBe(false);
    });

    it('parses keys, categories, offsets and paths', () => {
        const { sub } = browserKeys();
        expect(keyOk(sub.p256dh, 65, 65)).toBe(true);
        expect(keyOk(sub.auth, 16, 32)).toBe(true);
        expect(keyOk('nope!', 16, 32)).toBe(false);
        expect(parseCategories('invite,club,bogus,club')).toEqual(['invite', 'club']);
        expect(parseCategories('')).toEqual([]);
        expect(parseTz(-180)).toBe(-180);
        expect(parseTz(99999)).toBe(720);
        expect(parseTz('x')).toBe(0);
        expect(safePath('/play')).toBe('/play');
        expect(safePath('//evil.com')).toBe('/play');
        expect(safePath('https://evil.com')).toBe('/play');
    });

    it('quiet hours 22:00-09:00 device time', () => {
        // 20:00 UTC is 23:00 in Vilnius (UTC+3, offset -180) and 20:00 in London
        const t = new Date('2026-11-14T20:00:00Z');
        expect(inQuietHours(t, -180)).toBe(true);
        expect(inQuietHours(t, 0)).toBe(false);
        expect(inQuietHours(new Date('2026-11-14T06:30:00Z'), 0)).toBe(true);
        expect(inQuietHours(new Date('2026-11-14T09:00:00Z'), 0)).toBe(false);
    });

    it('a category off, quiet hours, the per-category gap and the daily cap each hold a push back', () => {
        const now = new Date('2026-11-14T12:00:00Z');
        const all = ['invite', 'club', 'ranked', 'event', 'nap'];
        expect(decide({ cats: ['club'], tz: 0, state: {}, cat: 'invite', now })).toBe('off');
        expect(decide({ cats: all, tz: -12 * 60, state: {}, cat: 'invite', now })).toBe('quiet');
        let st = afterSend({}, 'club', now);
        expect(decide({ cats: all, tz: 0, state: st, cat: 'club', now: new Date(now.getTime() + 3600_000) })).toBe(
            'gap'
        );
        expect(decide({ cats: all, tz: 0, state: st, cat: 'invite', now: new Date(now.getTime() + 1000) })).toBe(
            'send'
        );
        for (let i = 0; i < PUSH_DAILY_CAP; i++)
            st = afterSend(st, 'invite', new Date(now.getTime() + (i + 1) * 120_000));
        expect(decide({ cats: all, tz: 0, state: st, cat: 'event', now: new Date(now.getTime() + 3600_000) })).toBe(
            'cap'
        );
        // a day later the cap is free again
        expect(
            decide({ cats: all, tz: 0, state: st, cat: 'event', now: new Date(now.getTime() + 25 * 3600_000) })
        ).toBe('send');
    });
});

// ------------------------------------------------------------------ the service, on an in-memory model

type Doc = Record<string, any>;
const get = (d: Doc, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d as any);
const setPath = (d: Doc, path: string, v: unknown) => {
    const ks = path.split('.');
    let o = d;
    for (const k of ks.slice(0, -1)) o = o[k] ??= {};
    o[ks[ks.length - 1]] = v;
};
function matches(d: Doc, filter: Doc): boolean {
    return Object.entries(filter).every(([k, cond]) => {
        const v = get(d, k);
        if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
            if ('$exists' in cond) return (v !== undefined) === cond.$exists;
            if ('$ne' in cond) return Array.isArray(v) ? !v.includes(cond.$ne) : v !== cond.$ne;
            if ('$in' in cond) return cond.$in.includes(v);
            if ('$gt' in cond) return v > cond.$gt;
        }
        return Array.isArray(v) && !Array.isArray(cond) ? v.includes(cond) : v === cond;
    });
}
class FakeModel {
    docs = new Map<string, Doc>();
    private chain(rows: Doc[]) {
        const c: any = {
            sort: (s: Doc) => {
                const [[k, dir]] = Object.entries(s);
                rows.sort((a, b) => (a[k] < b[k] ? -dir : a[k] > b[k] ? dir : 0));
                return c;
            },
            select: () => c,
            limit: (n: number) => {
                rows = rows.slice(0, n);
                return c;
            },
            lean: async () => JSON.parse(JSON.stringify(rows)),
        };
        return c;
    }
    findById(id: string) {
        const d = this.docs.get(id);
        return { lean: async () => (d ? JSON.parse(JSON.stringify(d)) : null) };
    }
    find(filter: Doc) {
        return this.chain([...this.docs.values()].filter(d => matches(d, filter)));
    }
    async deleteOne(filter: Doc) {
        const hit = [...this.docs.values()].find(d => matches(d, filter));
        if (hit) this.docs.delete(hit._id);
        return { deletedCount: hit ? 1 : 0 };
    }
    async deleteMany(filter: Doc) {
        for (const d of [...this.docs.values()].filter(x => matches(x, filter))) this.docs.delete(d._id);
    }
    async updateOne(filter: Doc, update: Doc, opts: { upsert?: boolean } = {}) {
        const hit = [...this.docs.values()].find(d => matches(d, filter));
        let doc = hit as Doc;
        if (!doc) {
            if (!opts.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
            if (this.docs.has(filter._id)) throw Object.assign(new Error('E11000'), { code: 11000 });
            doc = { _id: filter._id, updatedAt: Date.now() };
            this.docs.set(filter._id, doc);
            for (const [k, v] of Object.entries(update.$setOnInsert ?? {})) setPath(doc, k, v);
        }
        for (const [k, v] of Object.entries(update.$inc ?? {})) setPath(doc, k, (get(doc, k) ?? 0) + (v as number));
        for (const [k, v] of Object.entries(update.$set ?? {})) setPath(doc, k, v);
        for (const [k, v] of Object.entries(update.$addToSet ?? {})) {
            const arr: unknown[] = get(doc, k) ?? [];
            if (!arr.includes(v)) arr.push(v);
            setPath(doc, k, arr);
        }
        doc.updatedAt = Date.now();
        return hit
            ? { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
            : { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
}

const KEYS = generateVapidKeys();
const ENV_KEYS = ['PAWLEGENDS_VAPID_PUBLIC_KEY', 'PAWLEGENDS_VAPID_PRIVATE_KEY', 'PAWLEGENDS_VAPID_SUBJECT'] as const;
const saved: Record<string, string | undefined> = {};

function make(nowIso: string, liveops?: any) {
    const clock = {
        t: new Date(nowIso),
        now() {
            return this.t;
        },
    };
    const subs = new FakeModel();
    const state = new FakeModel();
    const svc = new PushService(subs as any, state as any, liveops, clock);
    const sent: Array<{ url: string; body: Buffer }> = [];
    let status = 201;
    svc.fetchImpl = async (url, init) => {
        sent.push({ url, body: init.body });
        return { status };
    };
    return { svc, subs, state, clock, sent, setStatus: (s: number) => (status = s) };
}

function device(n: number) {
    const { ua, sub, auth } = browserKeys();
    return { endpoint: `${FCM}-${n}`, ...sub, ua, authBuf: auth };
}

beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.PAWLEGENDS_VAPID_PUBLIC_KEY = KEYS.publicKey;
    process.env.PAWLEGENDS_VAPID_PRIVATE_KEY = KEYS.privateKey;
    delete process.env.PAWLEGENDS_VAPID_SUBJECT;
});
afterEach(() => {
    for (const k of ENV_KEYS)
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    setPushSink(null);
});

describe('push service', () => {
    it('without keys: no key, no subscribe, nothing sent', async () => {
        delete process.env.PAWLEGENDS_VAPID_PRIVATE_KEY;
        expect(pushVapid()).toBeNull();
        const { svc, sent } = make('2026-11-14T12:00:00Z');
        expect(svc.key().key).toBeNull();
        const d = device(1);
        await expect(
            svc.subscribe('acc1', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth })
        ).rejects.toMatchObject({ status: 503 });
        await svc.notify(['acc1'], { cat: 'invite', title: 't', body: 'b', path: '/play', tag: 'invite' });
        expect(sent).toHaveLength(0);
    });

    it('subscribes a device (all categories by default), refuses other hosts, moves a device between accounts, caps 5 a account', async () => {
        const { svc, subs } = make('2026-11-14T12:00:00Z');
        expect(svc.key().key).toBe(KEYS.publicKey);
        const d = device(1);
        await expect(
            svc.subscribe('acc1', {
                endpoint: 'https://example.com/push/abcdefghijklmnop',
                p256dh: d.p256dh,
                auth: d.auth,
            })
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            svc.subscribe('acc1', { endpoint: d.endpoint, p256dh: 'short', auth: d.auth })
        ).rejects.toMatchObject({ status: 400 });
        const r = await svc.subscribe('acc1', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, tz: -120 });
        expect(r).toEqual({ on: true, cats: ['invite', 'club', 'ranked', 'event', 'nap'], tz: -120 });
        await svc.subscribe('acc2', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, cats: 'club' });
        expect(subs.docs.size).toBe(1);
        expect(subs.docs.get(subId(d.endpoint))).toMatchObject({ acc: 'acc2', cats: ['club'] });
        for (let i = 2; i <= 7; i++) {
            const x = device(i);
            await svc.subscribe('acc2', { endpoint: x.endpoint, p256dh: x.p256dh, auth: x.auth });
        }
        expect([...subs.docs.values()].filter(x => x.acc === 'acc2')).toHaveLength(5);
    });

    it('prefs turn categories off for this device only; unsubscribe forgets it', async () => {
        const { svc, subs, sent } = make('2026-11-14T12:00:00Z');
        const d = device(1);
        await svc.subscribe('acc1', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth });
        expect(await svc.prefs('other', { endpoint: d.endpoint, cats: '' })).toMatchObject({ on: false });
        expect(await svc.prefs('acc1', { endpoint: d.endpoint, cats: 'club,nap' })).toEqual({
            on: true,
            cats: ['club', 'nap'],
        });
        await svc.notify(['acc1'], { cat: 'invite', title: 'Party invite', body: 'b', path: '/play', tag: 'invite' });
        expect(sent).toHaveLength(0);
        await svc.unsubscribe('acc1', { endpoint: d.endpoint });
        expect(subs.docs.size).toBe(0);
    });

    it('a party invite reaches the friend once (the gap), encrypted for the device', async () => {
        const { svc, sent, clock } = make('2026-11-14T12:00:00Z');
        const d = device(1);
        await svc.subscribe('friend', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, tz: 0 });
        setPushSink(svc);
        pushNotify(['friend'], {
            cat: 'invite',
            title: 'Party invite',
            body: 'Mochi invited you to their party. Tap to join.',
            path: '/play',
            tag: 'invite',
        });
        await new Promise(r => setTimeout(r, 20));
        expect(sent).toHaveLength(1);
        expect(sent[0].url).toBe(d.endpoint);
        expect(JSON.parse(decrypt(sent[0].body, d.ua, d.authBuf))).toEqual({
            t: 'Party invite',
            b: 'Mochi invited you to their party. Tap to join.',
            u: '/play',
            g: 'invite',
            c: 'invite',
        });
        await svc.notify(['friend'], {
            cat: 'invite',
            title: 'Party invite',
            body: 'again',
            path: '/play',
            tag: 'invite',
        });
        expect(sent).toHaveLength(1);
        clock.t = new Date(clock.t.getTime() + 61_000);
        await svc.notify(['friend'], {
            cat: 'invite',
            title: 'Party invite',
            body: 'again',
            path: '/play',
            tag: 'invite',
        });
        expect(sent).toHaveLength(2);
    });

    it('quiet hours hold a push back; a 410 deletes the device; five failures drop it', async () => {
        const { svc, subs, sent, setStatus, clock } = make('2026-11-14T23:30:00Z');
        const d = device(1);
        await svc.subscribe('a', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, tz: 0 });
        await svc.notify(['a'], { cat: 'club', title: 'Club chest ready', body: 'b', path: '/play', tag: 'club' });
        expect(sent).toHaveLength(0);
        clock.t = new Date('2026-11-15T12:00:00Z');
        setStatus(410);
        await svc.notify(['a'], { cat: 'club', title: 'Club chest ready', body: 'b', path: '/play', tag: 'club' });
        expect(sent).toHaveLength(1);
        expect(subs.docs.size).toBe(0);
        await svc.subscribe('a', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, tz: 0 });
        setStatus(500);
        for (let i = 0; i < 5; i++) {
            clock.t = new Date(clock.t.getTime() + 13 * 3600_000);
            // stay inside the day window (09:00-22:00 UTC)
            if (inQuietHours(clock.t, 0)) clock.t = new Date(clock.t.getTime() + 12 * 3600_000);
            await svc.notify(['a'], { cat: 'club', title: 't', body: 'b', path: '/play', tag: 'club' });
        }
        expect(subs.docs.size).toBe(0);
    });

    it('broadcasts ranked opening to every device with ranked on, through the sink', async () => {
        const { svc, sent } = make('2026-11-14T12:00:00Z');
        for (let i = 1; i <= 3; i++) {
            const d = device(i);
            await svc.subscribe(`a${i}`, {
                endpoint: d.endpoint,
                p256dh: d.p256dh,
                auth: d.auth,
                cats: i === 3 ? 'club' : 'ranked',
            });
        }
        setPushSink(svc);
        pushBroadcast({ cat: 'ranked', title: 'Ranked is open', body: 'b', path: '/play', tag: 'ranked' });
        await new Promise(r => setTimeout(r, 20));
        expect(sent.map(s => s.url).sort()).toEqual([`${FCM}-1`, `${FCM}-2`]);
    });

    it('announces a live-ops event once, only when it just began', async () => {
        const events = [
            {
                id: 'goal-x',
                kind: 'goal',
                title: 'Community goal',
                sub: 'Until Nov 30',
                startsAt: '2026-11-14T11:30:00Z',
                endsAt: '2026-11-30T00:00:00Z',
            },
            {
                id: 'old',
                kind: 'vote',
                title: 'Fan vote',
                sub: 'Until Nov 20',
                startsAt: '2026-11-10T00:00:00Z',
                endsAt: '2026-11-20T00:00:00Z',
            },
        ];
        const liveops = { config: async () => ({ events, nap: null }), me: async () => null };
        const { svc, sent } = make('2026-11-14T12:00:00Z', liveops);
        const d = device(1);
        await svc.subscribe('a', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, tz: 0 });
        expect(await svc.announceEvents()).toEqual(['goal-x']);
        expect(await svc.announceEvents()).toEqual([]);
        expect(sent).toHaveLength(1);
        expect(JSON.parse(decrypt(sent[0].body, d.ua, d.authBuf))).toMatchObject({
            t: 'New in Paw Legends',
            c: 'event',
        });
    });

    it("Winter Nap: at 18:00 device time, a waiting gift or today's gift to earn; nothing otherwise", async () => {
        const nap = { open: true, gifts: [1, 2, 3, 4, 5, 6, 7] };
        const state: Record<string, any> = {
            waiting: { nap: { days: 2, earned: 2, claimed: 1, playedToday: true } },
            toEarn: { nap: { days: 1, earned: 1, claimed: 1, playedToday: false } },
            done: { nap: { days: 1, earned: 1, claimed: 1, playedToday: true } },
        };
        const liveops = { config: async () => ({ events: [], nap }), me: async (acc: string) => state[acc] };
        // 15:00 UTC is 18:00 in Vilnius (UTC+3)
        const { svc, sent } = make('2026-11-14T15:00:00Z', liveops);
        for (const [i, acc] of ['waiting', 'toEarn', 'done'].entries()) {
            const d = device(i);
            await svc.subscribe(acc, { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, tz: -180 });
        }
        const d = device(9);
        await svc.subscribe('waiting', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, tz: 0 });
        expect(await svc.remindNap()).toBe(2);
        expect(sent.map(s => s.url).sort()).toEqual([`${FCM}-0`, `${FCM}-1`]);
    });
});
