import { HttpException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Types } from 'mongoose';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import { ReplayQueue } from 'src/user/heist/replay-queue';
import { BadcatLinksService, cardSvg, cardTitle, normaliseGamePath } from './badcat-links.service';
import { BadcatOnlineController } from './badcat-online.controller';
import { BadcatOnlineStore } from './badcat-online.schema';
import { BadcatOnlineService, isAvatarUrl } from './badcat-online.service';
import { BadcatPushService } from './badcat-push.service';
import { buildHarness, NOW, useEnv } from './badcat-harness.helper-spec';
import sharp = require('sharp');

/*
 * Phase 2 reads and writes outside /live: short links and server OG cards, the room feed, the board, the account
 * summary and purchase claim, the live meter, the creator dashboard and the /yourcat cameo face. Every route is 404
 * while its flag is off.
 */

const golden = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'badcat-golden.json'), 'utf8'));
const statusOf = async (p: Promise<unknown>) => {
    try {
        await p;
        return 200;
    } catch (error) {
        if (error instanceof HttpException) return error.getStatus();
        throw error;
    }
};

function onlineStore(now: () => Date) {
    return {
        links: new MemoryModel([], [{ fields: ['slug'] }, { fields: ['pathHash'] }], now),
        rooms: new MemoryModel([], [{ fields: ['slug'] }, { fields: ['gameplayHash'] }], now),
        pushSubs: new MemoryModel([], [{ fields: ['endpoint'] }], now),
        streakEmails: new MemoryModel([], [{ fields: ['user'] }], now),
    };
}

/** A Game model with the one aggregate the board runs, over plain rows (users looked up from `users`). */
function fakeGames(rows: any[], users: Map<string, any>) {
    const model = new MemoryModel(rows) as any;
    model.aggregate = (pipeline: any[]) => ({
        exec: async () => {
            const match = pipeline[0].$match;
            let out = model.docs.filter(
                (d: any) =>
                    d.type === match.type &&
                    d.level === match.level &&
                    (match.score?.$gt === undefined || d.score > match.score.$gt)
            );
            out = out.filter((d: any) => {
                const u = users.get(String(d.user));
                return u && !u.isGuest && !u.deletedAt;
            });
            if (pipeline.some(stage => stage.$count)) return out.length ? [{ n: out.length }] : [];
            return out.sort((a: any, b: any) => b.score - a.score).slice(0, 100);
        },
    });
    return model;
}

function setup(env: Record<string, string>) {
    const restore = useEnv(env);
    const h = buildHarness();
    const now = () => new Date(NOW.getTime());
    const online = onlineStore(now);
    const userA = new Types.ObjectId();
    const userB = new Types.ObjectId();
    const guest = new Types.ObjectId();
    const users = new Map<string, any>([
        [String(userA), { _id: userA, email: 'buyer@example.com', emailVerifiedAt: new Date() }],
        [String(userB), { _id: userB, email: 'b@example.com' }],
        [String(guest), { _id: guest, isGuest: true }],
    ]);
    const games = fakeGames(
        [
            {
                type: 'BAD_CAT',
                level: 'd5',
                user: userA,
                score: 900,
                stamp: 'clean',
                catName: 'Mochi',
                catCode: 'AbCdEfGhIjKlMnOpQr',
            },
            { type: 'BAD_CAT', level: 'd5', user: userB, score: 1200, stamp: 'perfect', catName: 'Luna' },
            { type: 'BAD_CAT', level: 'd5', user: guest, score: 5000, stamp: 'perfect', catName: 'Ghost' },
            { type: 'BAD_CAT', level: 'd4', user: userA, score: 700, stamp: 'clean' },
        ],
        users
    );
    const userModel = new MemoryModel([...users.values()]) as any;
    const yourcats = new MemoryModel([]) as any;
    const service = new BadcatOnlineService(
        games,
        userModel,
        yourcats,
        h.store,
        online as unknown as BadcatOnlineStore,
        h.account
    );
    service.now = now;
    const links = new BadcatLinksService(online as unknown as BadcatOnlineStore);
    links.now = now;
    links.queue = new ReplayQueue({ concurrency: 1, maxQueued: 4 });
    const push = new BadcatPushService(online as unknown as BadcatOnlineStore, games);
    const controller = new BadcatOnlineController(service, links, push, {
        consume: jest.fn(async () => undefined),
    } as any);
    return { h, online, service, links, controller, users, userA, userB, guest, yourcats, restore };
}

const ALL_ON = {
    BADCAT_ENABLED: 'true',
    BADCAT_CHECKOUT_ENABLED: 'true',
    BADCAT_STRIPE_SECRET_KEY: 'sk_test_badcat_spec',
    BADCAT_ENTITLEMENT_SECRET: 'entitlement-secret-for-specs',
    BADCAT_BOARDS_ENABLED: 'true',
    BADCAT_ACCOUNTS_ENABLED: 'true',
    BADCAT_SHORT_LINKS_ENABLED: 'true',
    BADCAT_FEED_ENABLED: 'true',
    BADCAT_METER_ENABLED: 'true',
    BADCAT_FACE_UPLOADS_ENABLED: 'true',
    BADCAT_CREATOR_DASHBOARD_ENABLED: 'true',
    BADCAT_CAMEOS_ENABLED: 'true',
    BADCAT_CREATOR_CODES_ENABLED: 'true',
};

describe('short links and server OG', () => {
    it('accepts only shareable game paths', () => {
        expect(normaliseGamePath('/badcat/d/18?g=abc&c=AbCd&n=Mochi%20%F0%9F%90%BE')).toBe(
            '/badcat/d/18?g=abc&c=AbCd&n=Mochi%20%F0%9F%90%BE'
        );
        expect(normaliseGamePath('/badcat/r?r=XYZ_-1')).toBe('/badcat/r?r=XYZ_-1');
        expect(normaliseGamePath('/badcat/restore?t=secret')).toBeNull();
        expect(normaliseGamePath('/badcat/d/3?t=secret')).toBeNull();
        expect(normaliseGamePath('https://evil.example/badcat/d/1')).toBeNull();
        expect(normaliseGamePath('//evil.example/badcat/d/1')).toBeNull();
        expect(normaliseGamePath('/badcat/thanks?session_id=cs_test_x')).toBeNull();
    });

    it('writes the dare line and escapes the card text', () => {
        expect(cardTitle({ kind: 'dare', name: 'Mochi', score: 8420 })).toBe("Mochi scored 8,420. Your cat can't.");
        expect(cardSvg('<script>', 'x')).toContain('&lt;script&gt;');
    });

    it('makes one stable short id per long link, serves the OG page and the PNG', async () => {
        const t = setup(ALL_ON);
        try {
            const a = await t.controller.link(
                { path: '/badcat/d/5?g=abc', kind: 'dare', name: 'Mochi', score: 8420 },
                {},
                {}
            );
            const b = await t.controller.link({ path: '/badcat/d/5?g=abc', kind: 'dare' }, {}, {});
            expect(a.id).toMatch(/^[A-Za-z0-9]{8}$/);
            expect(b.id).toBe(a.id);
            expect(a.url).toBe(`https://api.tokentails.com/badcat/s/${a.id}`);
            let html = '';
            const res: any = { set: jest.fn(), send: (body: string) => (html = body) };
            await t.controller.shortLink(a.id, {}, res);
            expect(html).toContain('Mochi scored 8,420. Your cat can&#39;t.');
            expect(html).toContain('https://tokentails.com/badcat/d/5?g=abc');
            expect(html).toContain(`/badcat/og/${a.id}.png`);
            let png: Buffer | null = null;
            await t.controller.ogImage(`${a.id}.png`, {}, { set: jest.fn(), send: (b: Buffer) => (png = b) });
            expect(png!.subarray(1, 4).toString()).toBe('PNG');
            expect(await statusOf(t.controller.shortLink('nope1234', {}, res))).toBe(404);
        } finally {
            t.restore();
        }
    });
});

describe('room feed', () => {
    it('checks a room on the server, stores it once and lists it after approval', async () => {
        const t = setup(ALL_ON);
        try {
            const { code, clear } = golden.room;
            expect(await statusOf(t.controller.publishRoom({ code: 'garbage', feed: false }, {}, {}))).toBe(400);
            expect(await statusOf(t.controller.publishRoom({ code, feed: true }, {}, {}))).toBe(400); // no clear run
            expect(await statusOf(t.controller.publishRoom({ code, clear: [[0, 0, 0, 30]], feed: true }, {}, {}))).toBe(
                400
            );
            const pub = await t.controller.publishRoom({ code, clear, feed: true }, {}, {});
            expect(pub).toMatchObject({ status: 'pending', feed: true });
            expect(pub.url).toMatch(/\/badcat\/s\/[A-Za-z0-9]{8}$/);
            const again = await t.controller.publishRoom({ code, clear, feed: true }, {}, {});
            expect(again.id).toBe(pub.id);
            expect((await t.controller.feed('new', '', {}, {})).rooms).toEqual([]);
            await t.links.reviewRoom(pub.id, 'approve');
            const feed = await t.controller.feed('new', '', {}, {});
            expect(feed.rooms.map(r => [r.id, r.title, r.author])).toEqual([[pub.id, 'Golden kitchen', 'Mia']]);
            expect(await t.controller.play(pub.id, {}, {})).toEqual({ ok: true });
            expect((await t.controller.room(pub.id, {}, {})).plays).toBe(1);
            for (let i = 0; i < 3; i++) await t.controller.report(pub.id, {}, {});
            expect((await t.controller.feed('new', '', {}, {})).rooms).toEqual([]);
            expect(await statusOf(t.controller.room(pub.id, {}, {}))).toBe(404);
        } finally {
            t.restore();
        }
    });

    it('auto-approves with BADCAT_FEED_AUTO_APPROVE', async () => {
        const t = setup({ ...ALL_ON, BADCAT_FEED_AUTO_APPROVE: 'true' });
        try {
            const pub = await t.controller.publishRoom({ ...golden.room, feed: true }, {}, {});
            expect(pub.status).toBe('approved');
        } finally {
            t.restore();
        }
    });
});

describe('boards, accounts, meter, creator dashboard', () => {
    it('ranks registered players only, best first', async () => {
        const t = setup(ALL_ON);
        try {
            const board = await t.controller.board('5', {}, {});
            expect(board.rows.map(r => [r.rank, r.name, r.score])).toEqual([
                [1, 'Luna', 1200],
                [2, 'Mochi', 900],
            ]);
            expect(await t.controller.boardMe('5', { _id: t.userA }, {}, {})).toEqual({
                dayNo: 5,
                saved: true,
                guest: false,
                score: 900,
                stamp: 'clean',
                rank: 2,
            });
            expect(await t.controller.boardMe('5', { _id: t.guest, isGuest: true }, {}, {})).toEqual({
                dayNo: 5,
                saved: true,
                guest: true,
                score: 5000,
                stamp: 'perfect',
            });
            expect(await statusOf(t.controller.board('9999', {}, {}))).toBe(400);
        } finally {
            t.restore();
        }
    });

    it('summarises the account and claims purchases by verified email', async () => {
        const t = setup(ALL_ON);
        try {
            const acc = await t.controller.account({ _id: t.userA }, {}, {});
            expect(acc).toEqual({
                signedIn: true,
                guest: false,
                emailVerified: true,
                ranked: { days: 2, best: 900, lastDay: 5, streak: 2 },
                streakEmail: false,
                canClaim: true,
            });
            const claim = await t.controller.claim({ _id: t.userA }, {}, {});
            expect(claim.token).toBeTruthy();
            expect(claim.entitlements.email).toBe('buyer@example.com');
            expect(await statusOf(t.controller.claim({ _id: t.userB }, {}, {}))).toBe(400); // unverified email
        } finally {
            t.restore();
        }
    });

    it('computes the treat meter: 10 % of net plus the collar', async () => {
        const t = setup(ALL_ON);
        try {
            const now = new Date(NOW.getTime());
            t.h.models.purchases.docs.push(
                {
                    sessionId: 'a',
                    sku: 'club_monthly',
                    amountTotal: 499,
                    currency: 'usd',
                    status: 'paid',
                    createdAt: now,
                },
                {
                    sessionId: 'b',
                    sku: 'collar_pinkpaw',
                    amountTotal: 499,
                    currency: 'usd',
                    status: 'paid',
                    createdAt: now,
                },
                { sessionId: 'c', sku: 'cameo', amountTotal: 499, currency: 'usd', status: 'refunded', createdAt: now }
            );
            const meter = await t.controller.meter({}, {});
            // net 499 - (14 + 30) = 455: 45 for Club + 455 for the collar
            expect(meter).toEqual({ month: '2026-11', cents: 500, currency: 'usd', collars: 1, updated: '2026-11-20' });
        } finally {
            t.restore();
        }
    });

    it('shows a creator their own codes', async () => {
        const t = setup(ALL_ON);
        try {
            t.h.models.creatorCodes.docs.push({ code: 'mochi_tv', email: 'buyer@example.com', status: 'approved' });
            t.h.models.purchases.docs.push({
                sessionId: 'x',
                sku: 'club_monthly',
                amountTotal: 499,
                status: 'paid',
                email: 'fan@example.com',
                meta: { via: 'mochi_tv' },
                createdAt: new Date(NOW.getTime()),
            });
            const dash = await t.controller.creator({ _id: t.userA }, {}, {});
            expect(dash.rows).toEqual([
                { code: 'mochi_tv', status: 'approved', purchases: 1, grossCents: 499, shareCents: 91 },
            ]);
        } finally {
            t.restore();
        }
    });

    it("approves a cameo face from the account's ready /yourcat portrait (no AI call)", async () => {
        const t = setup(ALL_ON);
        try {
            const cameoId = new Types.ObjectId();
            t.h.models.cameos.docs.push({
                _id: cameoId,
                email: 'buyer@example.com',
                catCode: 'AbCdEfGhIjKlMnOpQr',
                sessionId: 's1',
            });
            const avatarUrl = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/yourcat/a.png';
            expect(await statusOf(t.controller.faceFromYourcat(String(cameoId), { _id: t.userA }, {}, {}))).toBe(400);
            t.yourcats.docs.push({ owner: t.userA, avatarStatus: 'ready', deletedAt: null, avatarUrl });
            const png = await sharp({ create: { width: 768, height: 768, channels: 3, background: '#d08a4c' } })
                .png()
                .toBuffer();
            const fetched: string[] = [];
            t.service.fetchImpl = async (url: string) => {
                fetched.push(url);
                return {
                    ok: true,
                    arrayBuffer: async () =>
                        png.buffer.slice(png.byteOffset, png.byteOffset + png.length) as ArrayBuffer,
                };
            };
            expect(await t.controller.faceFromYourcat(String(cameoId), { _id: t.userA }, {}, {})).toEqual({
                ok: true,
                status: 'approved',
            });
            expect(fetched).toEqual([avatarUrl]);
            const face = t.h.models.faces.docs[0];
            expect(face).toMatchObject({ status: 'approved', catCode: 'AbCdEfGhIjKlMnOpQr' });
            expect(face.bytes).toBeLessThanOrEqual(64 * 1024);
            expect(await statusOf(t.controller.faceFromYourcat(String(cameoId), { _id: t.userA }, {}, {}))).toBe(409);
            expect(await statusOf(t.controller.faceFromYourcat(String(cameoId), { _id: t.userB }, {}, {}))).toBe(400);
        } finally {
            t.restore();
        }
    });

    it('only accepts /yourcat portraits from the CDN', () => {
        expect(isAvatarUrl('https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png')).toBe(true);
        expect(isAvatarUrl('http://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/a.png')).toBe(false);
        expect(isAvatarUrl('https://evil.example/a.png')).toBe(false);
    });
});

describe('Phase 2 flags default off', () => {
    it('answers 404 on every route with no env', async () => {
        const t = setup({});
        try {
            const u = { _id: t.userA };
            const calls: Promise<unknown>[] = [
                t.controller.sim({}, {}),
                t.controller.board('5', {}, {}),
                t.controller.boardMe('5', u, {}, {}),
                t.controller.account(u, {}, {}),
                t.controller.claim(u, {}, {}),
                t.controller.streakEmail(u, { on: true }, {}, {}),
                t.controller.creator(u, {}, {}),
                t.controller.faceFromYourcat('x', u, {}, {}),
                t.controller.link({ path: '/badcat/d/1', kind: 'day' }, {}, {}),
                t.controller.shortLink('abcdefgh', {}, {}),
                t.controller.ogImage('abcdefgh.png', {}, {}),
                t.controller.publishRoom(golden.room, {}, {}),
                t.controller.room('abcdefgh', {}, {}),
                t.controller.play('abcdefgh', {}, {}),
                t.controller.report('abcdefgh', {}, {}),
                t.controller.feed('new', '', {}, {}),
                t.controller.meter({}, {}),
                t.controller.pushKey({}, {}),
                t.controller.pushSubscribe({} as any, {}, {}),
                t.controller.pushUnsubscribe({}, {}, {}),
                t.controller.adminRooms('pending', {}),
                t.controller.reviewRoom('abcdefgh', 'approve', {}),
            ];
            for (const call of calls) expect(await statusOf(call)).toBe(404);
            expect(t.online.links.docs).toHaveLength(0);
            expect(t.online.rooms.docs).toHaveLength(0);
        } finally {
            t.restore();
        }
    });
});
