import { Types } from 'mongoose';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { withShelterEnv } from 'src/shelter/onchain/shelter-onchain.fakes-spec';
import { ImpactEligibilityService } from './eligibility.service';
import { impactFixture, NOW } from './impact.fixture-spec';
import { ImpactController } from './impact.controller';
import { memoryModel } from './memory-model.fakes-spec';

jest.mock('src/shared/utils/aws.utils', () => ({ uploadPublicObject: jest.fn() }));

/*
 * Plan F7.3 privacy rule: no public impact response contains `email`, `wallets`, `walletPrivateKey`,
 * `users` or a raw user id. The fixture plants all of them in the models the snapshot reads.
 */
const FORBIDDEN_KEYS = ['email', 'wallets', 'walletPrivateKey', 'users', 'code', 'user', 'creator', 'owner'];

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(value)) value.forEach(item => keysDeep(item, out));
    else if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
            out.add(key);
            keysDeep(inner, out);
        }
    }
    return out;
}

function assertPublic(response: unknown, ctx: ReturnType<typeof impactFixture>) {
    const json = JSON.stringify(response);
    const keys = keysDeep(JSON.parse(json));
    FORBIDDEN_KEYS.forEach(key => expect({ key, present: keys.has(key) }).toEqual({ key, present: false }));
    const privateIds = [
        ...ctx.users.rows.map(r => String(r._id)),
        ...ctx.donations.rows.map(r => String(r.user)),
        ...ctx.shelters.rows.flatMap(r => (r.users || []).map(String)),
        ...ctx.blessings.rows.filter(r => r.creator).map(r => String(r.creator)),
        ...ctx.staff.map(String),
        ...ctx.paws.rows.map(r => String(r.user)),
        ...ctx.orders.rows.map(r => String(r.user)),
    ];
    privateIds.forEach(id => expect(json).not.toContain(id));
    expect(json).not.toMatch(/@example\.test/);
    expect(json).not.toContain('secret');
    // Drafts (payouts and outcomes), receipts' references and paw salts never reach a public response.
    expect(json).not.toMatch(/SecretDraft/);
    expect(json).not.toContain('salt');
    expect(json).not.toContain('pawId');
    // No Mongo ObjectId of any kind: shelters are named by slug.
    expect(json).not.toMatch(/"[0-9a-f]{24}"/);
}

function controllerFor(ctx: ReturnType<typeof impactFixture>) {
    const eligibility = new ImpactEligibilityService(memoryModel() as any);
    return new ImpactController(ctx.service, ctx.donate, eligibility, ctx.pawService, ctx.outcomeService);
}

beforeEach(() => withShelterEnv({}));
afterAll(() => withShelterEnv({}));

describe('impact privacy (plan F7.3)', () => {
    it('GET /impact, /impact/history and /impact/outcomes carry no private field or user id', async () => {
        const ctx = impactFixture();
        await ctx.service.snapshotOnce(NOW);
        const controller = controllerFor(ctx);

        const latest = await controller.latest();
        expect(latest.shelters.items.map(s => s.slug)).toContain('rozine-pedute');
        assertPublic(latest, ctx);
        assertPublic(await controller.history('30'), ctx);
        assertPublic(await controller.outcomes(), ctx);
        assertPublic(ctx.snapshots.rows[0].data, ctx);

        // The ledger parts are in the snapshot: one published outcome with its payout tier, the
        // confirmed payout, the pledge table and the paw settlement (no draft, no paw).
        expect(latest.outcomes.items.map(o => o.id)).toEqual(['o-0000000000b1']);
        expect(latest.outcomes.items[0]).toEqual(
            expect.objectContaining({ tier: 'shelter-confirmed', imageUrl: 'https://cdn.test/o.webp' })
        );
        expect(latest.attestations.items.map(p => p.id)).toEqual(['p-0000000000a1']);
        expect(latest.pledges).toEqual(
            expect.objectContaining({
                status: 'active',
                rows: [
                    expect.objectContaining({
                        month: '2026-09',
                        pledgedWei: '2000000000000000000',
                        paidWei: '5000000000000000000',
                    }),
                ],
            })
        );
        expect(latest.pawSettlements).toEqual(
            expect.objectContaining({ count: 1, totalPaws: 1, latest: expect.objectContaining({ day: '2026-10-01' }) })
        );
        expect((await controller.outcomes()).items.map(o => o.id)).toEqual(['o-0000000000b1']);
    });

    it('GET /shelter/donate/status stays user-free', async () => {
        const ctx = impactFixture();
        assertPublic(await ctx.donate.status(NOW), ctx);
    });

    it('the public routes are unguarded and /impact/me needs an account', () => {
        const proto = ImpactController.prototype as any;
        for (const route of ['latest', 'history', 'outcomes']) {
            expect(Reflect.getMetadata(GUARDS_METADATA, proto[route])).toBeUndefined();
        }
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.me)).toEqual([AppAuthGuard]);
    });

    it('GET /impact/me answers with the caller totals and paws only; pledge null until G5', async () => {
        const ctx = impactFixture();
        const controller = controllerFor(ctx);
        const me = await controller.me({
            _id: ctx.donor,
            createdAt: new Date('2026-01-01'),
            emailVerifiedAt: new Date(),
        });
        expect(me).toEqual({
            treats: {
                confirmedCount: 1,
                onTheirWayCount: 0,
                totalConfirmedWei: '10000000000000000',
                lastConfirmedAt: null,
            },
            instantTreat: { eligible: true, reason: null },
            paws: expect.objectContaining({
                lifetime: 0,
                proof: null,
                today: expect.objectContaining({ remaining: 2, message: "2 more runs for today's paw" }),
                latestSettlement: expect.objectContaining({ day: '2026-10-01', pawCount: 1 }),
            }),
            pledge: null,
        });
        expect(JSON.stringify(me)).not.toContain(String(ctx.donor));
    });

    it("GET /impact/me gives a paw owner their own proof and nobody else's salt", async () => {
        const ctx = impactFixture();
        const controller = controllerFor(ctx);
        const owner = ctx.users.rows[0];
        ctx.paws.rows.push({
            _id: new Types.ObjectId(),
            // Another player's paw (another day, so the fixture's one-leaf tree still matches its root).
            user: new Types.ObjectId(),
            day: '2026-09-30',
            pawId: '0'.repeat(31) + '2',
            salt: '0xsomeoneelsesalt',
            userHash: '0x' + '78'.repeat(32),
            leaf: '0x' + '9a'.repeat(32),
        });
        const me = await controller.me({
            _id: owner._id,
            createdAt: new Date('2026-01-01'),
            emailVerifiedAt: new Date(),
        });
        expect(me.paws?.lifetime).toBe(1);
        expect(me.paws?.proof).toEqual(
            expect.objectContaining({ day: '2026-10-01', root: '0x' + '56'.repeat(32), proof: [] })
        );
        const json = JSON.stringify(me);
        expect(json).not.toContain(String(owner._id));
        // Their own salt (to check userHash is theirs), never another paw's.
        expect(me.paws?.proof?.salt).toBe('0xsecretsalt');
        expect(json).not.toContain('someoneelsesalt');
    });
});
