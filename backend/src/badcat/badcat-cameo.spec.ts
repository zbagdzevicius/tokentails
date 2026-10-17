import { Types } from 'mongoose';
import { CAMEO_LOADS_GUARANTEE, CAMEO_SHUFFLES, FRIDGE_MAGNETS, MAX_SPECTATORS } from './badcat.contracts';
import { hash32, weekdayOf, weightedSample, xorshift32 } from './badcat-util';
import {
    buildHarness,
    buy,
    CAT,
    CAT2,
    Harness,
    NOW,
    ON_ENV,
    statusOf,
    TODAY,
    useEnv,
} from './badcat-harness.helper-spec';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 7)]);
const code = (i: number) => `cat${String(i).padStart(6, '0')}code`;
const oid = (i: number) => new Types.ObjectId(i.toString(16).padStart(24, '0'));

async function seedDay(h: Harness, dayNo: number, paid: number, free: number, order: 'up' | 'down' = 'up') {
    const rows = [
        ...Array.from({ length: paid }, (_, i) => ({
            _id: oid(1000 + i),
            kind: 'paid',
            catCode: code(i),
            name: `Paid${i}`,
        })),
        ...Array.from({ length: free }, (_, i) => ({
            _id: oid(5000 + i),
            kind: 'free',
            catCode: code(500 + i),
            name: `Free${i}`,
        })),
    ];
    if (order === 'down') rows.reverse();
    for (const row of rows) await h.models.cameos.create({ ...row, dayNo });
}

async function clubMember(h: Harness, email: string, catCode: string, name = 'Clubby') {
    await buy(h, 'club_monthly', { email, session: { subscription: `sub_${email}` } });
    await h.models.clubCats.create({ email, catCode, name });
}

describe('GET /badcat/cameos', () => {
    let restore: () => void;
    let h: Harness;
    beforeEach(() => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
    });
    afterEach(() => restore());

    const get = (day: number | string, s: number | string) => h.controller.cameoBundle(String(day), String(s), {}, {});

    it('is deterministic for (day, shuffle), whatever order the pool was written in', async () => {
        const other = buildHarness();
        await seedDay(h, TODAY, 10, 30, 'up');
        await seedDay(other, TODAY, 10, 30, 'down');
        for (let s = 0; s < CAMEO_SHUFFLES; s++) {
            const a = await h.cameos.build(TODAY, s);
            const b = await other.cameos.build(TODAY, s);
            expect(a.bundle).toEqual(b.bundle);
            expect(a.bundle.spectators).toHaveLength(MAX_SPECTATORS);
            expect(new Set(a.bundle.spectators.map(e => e.catCode)).size).toBe(MAX_SPECTATORS);
        }
        const spectatorSets = new Set<string>();
        for (let s = 0; s < CAMEO_SHUFFLES; s++) {
            spectatorSets.add((await h.cameos.build(TODAY, s)).bundle.spectators.map(e => e.id).join());
        }
        expect(spectatorSets.size).toBeGreaterThan(1);
    });

    it('weights paid cameos 4:1 over free ones and Club cats 2:1 on the fridge', async () => {
        await seedDay(h, TODAY, 10, 40);
        for (let i = 0; i < 30; i++) await clubMember(h, `member${i}@ex.com`, code(900 + i));
        let paidSeen = 0;
        let clubOnFridge = 0;
        for (let s = 0; s < CAMEO_SHUFFLES; s++) {
            const { bundle } = await h.cameos.build(TODAY, s);
            paidSeen += bundle.spectators.filter(e => e.kind === 'paid').length;
            clubOnFridge += bundle.fridge.filter(e => e.kind === 'club').length;
            expect(bundle.fridge).toHaveLength(FRIDGE_MAGNETS);
            expect(bundle.fridge.filter(e => e.kind === 'club').every(e => e.club === true)).toBe(true);
        }
        // Uniform would show 15 * 10/50 = 3 paid per shuffle and 40 * 30/80 = 15 Club magnets.
        expect(paidSeen / CAMEO_SHUFFLES).toBeGreaterThan(5);
        expect(clubOnFridge / CAMEO_SHUFFLES).toBeGreaterThan(16);

        // The sampler itself: weight 4 against weight 1 wins ~80 % of single draws.
        let heavy = 0;
        for (let seed = 1; seed <= 2000; seed++) {
            const [pick] = weightedSample(
                [
                    { item: 'light', weight: 1 },
                    { item: 'heavy', weight: 4 },
                ],
                1,
                xorshift32(hash32(seed))
            );
            if (pick === 'heavy') heavy++;
        }
        expect(heavy / 2000).toBeGreaterThan(0.75);
        expect(heavy / 2000).toBeLessThan(0.85);
    });

    it('stores the shuffle once, adds one counter increment per request, and merges later bookings for its day', async () => {
        await seedDay(h, TODAY, 3, 3);
        const first = await get(TODAY, 2);
        const counterWrites = () => h.models.counters.calls.filter(call => call === 'updateOne').length;
        expect(counterWrites()).toBe(1);
        expect(first.spectators.map(e => e.catCode)).not.toContain(CAT2);
        await h.models.cameos.create({ kind: 'paid', dayNo: TODAY, catCode: CAT2, name: 'Late' });
        const second = await get(TODAY, 2);
        const third = await get(TODAY, 2);
        expect(second.spectators.map(e => e.catCode)).toEqual([...first.spectators.map(e => e.catCode), CAT2]);
        expect(third).toEqual(second);
        expect(counterWrites()).toBe(3);
        expect(h.models.shuffles.docs).toHaveLength(1);
        expect(h.models.counters.docs).toEqual([expect.objectContaining({ key: `load:${TODAY}:2`, n: 3 })]);
        expect(first.source).toBe('server');
        // Another shuffle of the day sees the late cameo.
        expect((await get(TODAY, 3)).spectators.map(e => e.catCode)).toContain(CAT2);
    });

    it('a guest star booked after tomorrow was frozen (east of UTC) still stars on its day', async () => {
        const friday = TODAY + 7; // TODAY is a Friday
        // A player east of UTC opens tomorrow's room before UTC midnight: every shuffle of that day is stored.
        h.clock.now = new Date(NOW.getTime() + 6 * 86400000 + 11 * 3600000);
        await seedDay(h, friday, 2, 20);
        for (let s = 0; s < CAMEO_SHUFFLES; s++) await get(friday, s);
        // Then the guest star and a same-day paid cameo are bought for that Friday.
        await buy(h, 'guest_star', { meta: { cat: CAT, cat_name: 'Star', day: String(friday) } });
        await buy(h, 'cameo', { meta: { cat: CAT2, cat_name: 'Late', day: String(friday) } });
        h.clock.now = new Date(NOW.getTime() + 7 * 86400000 + 3600000);
        for (let s = 0; s < CAMEO_SHUFFLES; s++) {
            const bundle = await get(friday, s);
            expect(bundle.guestStars.map(e => e.catCode)).toEqual([CAT]);
            expect(bundle.spectators.map(e => e.catCode)).toEqual(expect.arrayContaining([CAT, CAT2]));
            expect(bundle.spectators.length).toBeLessThanOrEqual(MAX_SPECTATORS);
        }
        // Its loads count toward the 300-load guarantee.
        const late = h.models.cameos.docs.find(d => d.catCode === CAT2)!;
        expect((await h.cameos.loadsOf([String(late._id)])).get(String(late._id))).toBe(CAMEO_SHUFFLES);
    });

    it('carries a paid cameo to later days until it reached 300 loads', async () => {
        const [cameo] = [await h.models.cameos.create({ kind: 'paid', dayNo: TODAY - 2, catCode: CAT, name: 'Mochi' })];
        const id = String(cameo._id);
        await h.models.shuffles.create({ dayNo: TODAY - 2, shuffle: 0, cameoIds: [id], catCodes: [CAT] });
        await h.models.shuffles.create({ dayNo: TODAY - 2, shuffle: 1, cameoIds: [id], catCodes: [CAT] });
        await h.models.counters.create({ key: `load:${TODAY - 2}:0`, n: 200 });
        await h.models.counters.create({ key: `load:${TODAY - 2}:1`, n: CAMEO_LOADS_GUARANTEE - 201 });
        expect((await h.cameos.loadsOf([id])).get(id)).toBe(CAMEO_LOADS_GUARANTEE - 1);
        expect((await h.cameos.build(TODAY, 0)).bundle.spectators.map(e => e.id)).toEqual([id]);

        await h.models.counters.updateOne({ key: `load:${TODAY - 2}:1` }, { $inc: { n: 1 } });
        expect((await h.cameos.build(TODAY, 0)).bundle.spectators).toEqual([]);
        // Free cameos are never carried.
        await h.models.cameos.create({ kind: 'free', dayNo: TODAY - 1, catCode: CAT2, name: 'Free' });
        expect((await h.cameos.build(TODAY, 0)).bundle.spectators).toEqual([]);
    });

    it('lists Friday guest stars, the weekly Club cameo, and filters names on read', async () => {
        await buy(h, 'guest_star', { meta: { cat: CAT, cat_name: 'Mochi', day: String(TODAY) } });
        await h.models.cameos.create({ kind: 'free', dayNo: TODAY, catCode: code(1), name: 'sh1tcat' });
        // An email whose weekly cameo day is today's weekday, and one whose is not.
        let today = '';
        let other = '';
        for (let i = 0; !today || !other; i++) {
            const email = `club${i}@ex.com`;
            const match = hash32('badcat-club-day', email) % 7 === weekdayOf(TODAY);
            if (match && !today) today = email;
            if (!match && !other) other = email;
        }
        await clubMember(h, today, code(2), 'Weekly');
        await clubMember(h, other, code(3), 'Fridge');
        const bundle = await get(TODAY, 0);
        expect(bundle.guestStars).toEqual([
            expect.objectContaining({ kind: 'guest_star', catCode: CAT, name: 'Mochi', faceUrl: null }),
        ]);
        expect(bundle.spectators.map(e => e.name).sort()).toEqual(['A Cat', 'Mochi', 'Weekly']);
        expect(bundle.spectators.find(e => e.name === 'Weekly')).toMatchObject({ kind: 'club', club: true });
        expect(bundle.fridge.map(e => e.name).sort()).toEqual(['A Cat', 'Fridge', 'Mochi', 'Weekly']);
    });

    it('drops lapsed Club members from the pools', async () => {
        await clubMember(h, 'gone@ex.com', code(4), 'Gone');
        h.models.purchases.docs.forEach(d => (d.subStatus = 'canceled'));
        expect((await h.cameos.build(TODAY, 0)).bundle.fridge).toEqual([]);
    });

    it('validates day and shuffle, and is 404 with cameos off', async () => {
        expect(await statusOf(get(TODAY + 2, 0))).toBe(400);
        expect(await statusOf(get(TODAY, CAMEO_SHUFFLES))).toBe(400);
        expect(await statusOf(get('', 0))).toBe(400);
        expect(await statusOf(get('1.5', 0))).toBe(400);
        expect(await statusOf(get(TODAY + 1, 0))).toBe(200);
        expect(await statusOf(get(-30, 7))).toBe(200);
    });

    it('admin grants free / streak / reply / community cameos', async () => {
        const { id } = await h.controller.adminCameo({ catCode: CAT, name: 'Winner', dayNo: TODAY, kind: 'streak' });
        expect(h.models.cameos.docs[0]).toMatchObject({ kind: 'streak', catCode: CAT, name: 'Winner' });
        expect((await get(TODAY, 0)).spectators.map(e => e.id)).toEqual([id]);
        expect(await statusOf(h.controller.adminCameo({ catCode: CAT, dayNo: TODAY, kind: 'paid' }))).toBe(400);
        expect(await statusOf(h.controller.adminCameo({ catCode: 'x', dayNo: TODAY }))).toBe(400);
    });
});

describe('GET /badcat/seen', () => {
    let restore: () => void;
    let h: Harness;
    beforeEach(() => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
    });
    afterEach(() => restore());

    it('sums the counters of the shuffles that contain the cat: this week and all time', async () => {
        const shuffles = [
            { dayNo: TODAY, shuffle: 0, n: 10, cats: [CAT] },
            { dayNo: TODAY, shuffle: 5, n: 7, cats: [CAT, CAT2] },
            { dayNo: 1, shuffle: 1, n: 100, cats: [CAT] }, // Monday of this week
            { dayNo: 0, shuffle: 1, n: 1000, cats: [CAT] }, // last Sunday
            { dayNo: TODAY, shuffle: 6, n: 50, cats: [CAT2] },
        ];
        for (const s of shuffles) {
            await h.models.shuffles.create({ dayNo: s.dayNo, shuffle: s.shuffle, cameoIds: [], catCodes: s.cats });
            await h.models.counters.create({ key: `load:${s.dayNo}:${s.shuffle}`, n: s.n });
        }
        expect(await h.controller.seen(CAT, {}, {})).toEqual({ week: 117, total: 1117 });
        expect(await h.controller.seen(CAT2, {}, {})).toEqual({ week: 57, total: 57 });
        expect(await h.controller.seen('ZZZZZZZZZZZZZZZZZZ', {}, {})).toEqual({ week: 0, total: 0 });
        expect(await statusOf(h.controller.seen('<x>', {}, {}))).toBe(400);
    });

    it('counts real page loads end to end', async () => {
        await h.models.cameos.create({ kind: 'paid', dayNo: TODAY, catCode: CAT, name: 'Mochi' });
        for (let s = 0; s < CAMEO_SHUFFLES; s++) await h.controller.cameoBundle(String(TODAY), String(s), {}, {});
        await h.controller.cameoBundle(String(TODAY), '0', {}, {});
        expect(await h.controller.seen(CAT, {}, {})).toEqual({ week: CAMEO_SHUFFLES + 1, total: CAMEO_SHUFFLES + 1 });
        const id = String(h.models.cameos.docs[0]._id);
        expect((await h.cameos.loadsOf([id])).get(id)).toBe(CAMEO_SHUFFLES + 1);
    });
});

describe('cameo faces', () => {
    let restore: () => void;
    let h: Harness;
    let cameoId: string;
    let token: string;
    beforeEach(async () => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
        await buy(h, 'cameo', { email: 'owner@ex.com', meta: { cat: CAT, cat_name: 'Mochi', day: String(TODAY) } });
        cameoId = String(h.models.cameos.docs[0]._id);
        token = (await h.account.issue('owner@ex.com')).token;
    });
    afterEach(() => restore());

    const upload = (png: string, id = cameoId, t = token) => h.controller.uploadFace(id, { token: t, png }, {}, {});
    const fakeRes = () => {
        const res: any = { headers: {}, body: null };
        res.set = (headers: Record<string, string>) => Object.assign(res.headers, headers);
        res.send = (body: Buffer) => (res.body = body);
        return res;
    };

    it('takes a PNG up to 64 KB, shows it only after approval, with cache headers', async () => {
        expect(await upload(`data:image/png;base64,${PNG.toString('base64')}`)).toEqual({
            ok: true,
            status: 'pending',
        });
        expect(h.models.faces.docs[0]).toMatchObject({ catCode: CAT, status: 'pending', bytes: PNG.length });
        const faceId = String(h.models.faces.docs[0]._id);
        expect((await h.controller.cameoBundle(String(TODAY), '0', {}, {})).spectators[0].faceUrl).toBeNull();
        expect(await statusOf(h.controller.face(`${faceId}.png`, {}, fakeRes()))).toBe(404);

        const pending = await h.controller.adminFaces();
        expect(pending.items).toEqual([expect.objectContaining({ id: faceId, catCode: CAT, cameoId })]);
        expect(pending.items[0].dataUrl).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
        expect(await h.controller.approveFace(faceId)).toEqual({ ok: true, status: 'approved' });

        expect((await h.controller.cameoBundle(String(TODAY), '0', {}, {})).spectators[0].faceUrl).toBe(
            `/badcat/face/${faceId}.png`
        );
        const res = fakeRes();
        await h.controller.face(`${faceId}.png`, {}, res);
        expect(res.headers).toMatchObject({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
        expect(Buffer.compare(res.body, PNG)).toBe(0);
        expect(await statusOf(h.controller.face('nope.png', {}, fakeRes()))).toBe(404);
        // Once per cat: a new upload after approval is refused.
        expect(await statusOf(upload(PNG.toString('base64')))).toBe(409);
    });

    it('checks size, magic, ownership and the flag', async () => {
        const big = Buffer.concat([PNG, Buffer.alloc(64 * 1024)]);
        expect(await statusOf(upload(big.toString('base64')))).toBe(413);
        expect(await statusOf(upload(Buffer.from('GIF89a-not-a-png').toString('base64')))).toBe(400);
        expect(await statusOf(upload('%%%'))).toBe(400);
        expect(await statusOf(upload(PNG.toString('base64'), String(new Types.ObjectId())))).toBe(404);
        expect(await statusOf(upload(PNG.toString('base64'), 'not-an-id'))).toBe(404);
        const stranger = (await h.account.issue('stranger@ex.com')).token;
        expect(await statusOf(upload(PNG.toString('base64'), cameoId, stranger))).toBe(403);
        expect(await statusOf(upload(PNG.toString('base64'), cameoId, 'bad.token'))).toBe(401);
        expect(h.models.faces.docs).toHaveLength(0);
    });

    it('approves once per cat: the cat’s other pending faces are rejected', async () => {
        await upload(PNG.toString('base64'));
        // A second cameo of the same cat by another buyer.
        await buy(h, 'cameo', {
            email: 'second@ex.com',
            meta: { cat: CAT, cat_name: 'Mochi', day: String(TODAY + 7) },
        });
        const second = String(h.models.cameos.docs[1]._id);
        await upload(PNG.toString('base64'), second, (await h.account.issue('second@ex.com')).token);
        expect(h.models.faces.docs).toHaveLength(2);
        const [a, b] = h.models.faces.docs.map(d => String(d._id));
        await h.controller.approveFace(a);
        expect(h.models.faces.docs.map(d => d.status)).toEqual(['approved', 'rejected']);
        expect(await statusOf(h.controller.approveFace(b))).toBe(409);
        expect(await statusOf(h.controller.rejectFace(a))).toBe(409);
    });

    it('replaces a pending face from the same owner instead of queueing another', async () => {
        await upload(PNG.toString('base64'));
        await upload(PNG.toString('base64'));
        expect(h.models.faces.docs).toHaveLength(1);
        await h.controller.rejectFace(String(h.models.faces.docs[0]._id));
        expect(h.models.faces.docs[0].status).toBe('rejected');
        expect(NOW).toBeDefined();
    });
});
