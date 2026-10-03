import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { ShelterDonationStatus } from 'src/shared-contracts/enums';
import { RescueGoalStatus } from 'src/shared-contracts/enums';
import { seasonTimes } from 'src/user/codex-reset';
import { GOALS_PER_BUDGET_MONTH_MAX, TREAT_GIVER_TREATS } from './rescue-goal.constants';
import { fakeEligibility, fakeRescueGoalDb, FakeRescueGoalDb } from './rescue-goal.fakes-spec';
import { DAY_MS, ENV_OPEN, seedGoal, seedShelter, seedUser, uuid } from './rescue-goal.helpers-spec';
import { RescueGoalPledgeService } from './rescue-goal-pledge.service';
import { publicGoalView, RescueGoalService, toCents } from './rescue-goal.service';
import { RescueGoalStore } from './rescue-goal.store';
import sharp = require('sharp');

/*
 * Rescue Goals lifecycle and views (plan G5, decision #37): MANAGER create, edit, deliver, cancel;
 * the public view leaves out money, funding line, proof owner and saga fields; the player's own gives
 * and the Treat Giver badge.
 */

const MANAGER = { _id: new Types.ObjectId(), permission: 4 } as any;

const goalInput = (shelter: Types.ObjectId, fields: Record<string, unknown> = {}) => ({
    shelter: String(shelter),
    title: 'Kitten food for October',
    description: 'Wet food for the kitten room.',
    deliverable: '10 kg of kitten food',
    targetTails: 20000,
    budgetMonth: '2026-10',
    proofOwner: 'Shelter liaison',
    fundingSetAside: true,
    fundingLine: 'October sponsor budget',
    fundingAmount: '49.90',
    fundingCurrency: 'EUR',
    ...fields,
});

describe('RescueGoalService', () => {
    let db: FakeRescueGoalDb;
    let pledges: RescueGoalPledgeService;
    let service: RescueGoalService;
    let shelter: Types.ObjectId;
    let photo: Buffer;

    beforeAll(async () => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#ff8800' } })
            .withMetadata({ exif: { IFD0: { Copyright: 'secret-location' } } })
            .jpeg()
            .toBuffer();
    });

    beforeEach(async () => {
        db = fakeRescueGoalDb();
        pledges = new RescueGoalPledgeService(RescueGoalStore.of(db), fakeEligibility() as any);
        service = new RescueGoalService(RescueGoalStore.of(db), pledges);
        service.photoUploader = jest.fn(async (key: string) => `https://cdn.example/${key}`);
        shelter = await seedShelter(db.shelters);
    });

    describe('create', () => {
        it('opens a goal only when its money is marked set aside', async () => {
            for (const missing of [
                { fundingSetAside: false },
                { fundingSetAside: undefined },
                { fundingLine: '' },
                { fundingAmount: '0' },
                { fundingAmount: '12.345' },
                { fundingCurrency: 'BTC' },
            ]) {
                await expect(service.create(goalInput(shelter, missing) as any, MANAGER)).rejects.toMatchObject({
                    status: 400,
                    response: { code: 'GOAL_FUNDING_REQUIRED' },
                });
            }
            expect(db.goals.docs).toHaveLength(0);

            const goal = await service.create(goalInput(shelter) as any, MANAGER);
            expect(goal).toMatchObject({
                status: RescueGoalStatus.OPEN,
                targetTails: 20000,
                raisedTails: 0,
                remainingTails: 20000,
                funding: { setAside: true, line: 'October sponsor budget', amountCents: 4990, currency: 'EUR' },
                proofOwner: 'Shelter liaison',
                budgetMonthGoals: 1,
                shelter: { name: 'Pink Paw', slug: 'rozine-pedute' },
            });
            expect(db.goals.docs[0].funding.setAsideBy).toEqual(MANAGER._id);
        });

        it(`holds at most ${GOALS_PER_BUDGET_MONTH_MAX} goals in one budget month (decision #37)`, async () => {
            for (let i = 0; i < GOALS_PER_BUDGET_MONTH_MAX; i++) {
                await service.create(goalInput(shelter) as any, MANAGER);
            }
            await expect(service.create(goalInput(shelter) as any, MANAGER)).rejects.toMatchObject({
                response: { code: 'GOAL_BUDGET_FULL' },
            });
            await expect(
                service.create(goalInput(shelter, { budgetMonth: '2026-11' }) as any, MANAGER)
            ).resolves.toBeTruthy();
            // A cancelled goal frees its slot.
            db.goals.docs[0].status = RescueGoalStatus.CANCELLED;
            await expect(service.create(goalInput(shelter) as any, MANAGER)).resolves.toBeTruthy();
        });

        it('refuses house zones, unknown shelters and bad fields', async () => {
            const house = await seedShelter(db.shelters, { slug: 'token-tails', role: undefined });
            await expect(service.create(goalInput(house) as any, MANAGER)).rejects.toMatchObject({
                response: { code: 'GOAL_HOUSE_SHELTER' },
            });
            await expect(service.create(goalInput(new Types.ObjectId()) as any, MANAGER)).rejects.toMatchObject({
                status: 400,
            });
            for (const bad of [
                { targetTails: 50 },
                { targetTails: 1.5 },
                { budgetMonth: '2026-13' },
                { title: 'x' },
                { image: 'http://insecure.example/cat.png' },
                { image: 'https://tracker.example/cat.png' },
                { endsAt: '2020-01-01' },
            ]) {
                await expect(service.create(goalInput(shelter, bad) as any, MANAGER)).rejects.toMatchObject({
                    status: 400,
                });
            }
        });
    });

    describe('cover pictures', () => {
        it('come from Token Tails storage only: the image CDN or the public buckets', async () => {
            const cdn = process.env.DO_SPACES_CDN;
            process.env.DO_SPACES_CDN = 'https://images.tokentails.example';
            try {
                for (const image of [
                    'https://images.tokentails.example/cover.webp',
                    'https://tokentails.fra1.cdn.digitaloceanspaces.com/cover.png',
                ]) {
                    const created = await service.create(goalInput(shelter, { image }) as any, MANAGER);
                    expect(created.image).toBe(image);
                }
                await expect(
                    service.create(
                        goalInput(shelter, { image: 'https://images.tokentails.example.evil.io/x.png' }) as any,
                        MANAGER
                    )
                ).rejects.toMatchObject({ status: 400 });
            } finally {
                if (cdn === undefined) delete process.env.DO_SPACES_CDN;
                else process.env.DO_SPACES_CDN = cdn;
            }
        });
    });

    describe('expired goals', () => {
        it('an OPEN goal past its end date is not counted or listed as open, and is flagged for managers', async () => {
            const live = await seedGoal(db.goals, { shelter, endsAt: new Date(Date.now() + DAY_MS) });
            const expired = await seedGoal(db.goals, { shelter, endsAt: new Date(Date.now() - 1000) });

            const summary = await service.openGoalsSummary();
            expect(summary.open).toBe(1);
            expect(summary.items.map(goal => goal.id)).toEqual([String(live)]);
            expect((await service.list()).map(goal => goal.id)).toEqual([String(live)]);
            expect((await service.list({ status: 'open' })).map(goal => goal.id)).toEqual([String(live)]);

            const all = await service.list({ status: 'all' });
            expect(all.find(goal => goal.id === String(expired))).toMatchObject({ status: 'OPEN', expired: true });
            expect(all.find(goal => goal.id === String(live))).toMatchObject({ expired: false });
            expect(await service.getPublic(String(expired))).toMatchObject({ expired: true });
            expect(await service.managerGet(String(expired))).toMatchObject({ expired: true });
            // It still waits for a manager: cancel works and refunds as usual.
            await expect(service.cancel(String(expired), 'Ran out of time', MANAGER)).resolves.toMatchObject({
                status: RescueGoalStatus.CANCELLED,
                expired: false,
            });
        });
    });

    describe('public views', () => {
        it('never carry the money, funding line, proof owner or saga fields', async () => {
            const created = await service.create(goalInput(shelter) as any, MANAGER);
            db.goals.docs[0].pendingTakes = [new Types.ObjectId()];
            db.goals.docs[0].fencedPledges = [new Types.ObjectId()];

            const view = await service.getPublic(created.id);
            const json = JSON.stringify(view);

            for (const hidden of [
                'funding',
                'amountCents',
                '4990',
                'October sponsor',
                'proofOwner',
                'Shelter liaison',
                'pendingTakes',
                'fencedPledges',
                'createdBy',
                'budgetMonth',
                'EUR',
            ]) {
                expect(json).not.toContain(hidden);
            }
            expect(json).not.toMatch(/tails per/i);
            expect(view).toMatchObject({ deliverable: '10 kg of kitten food', targetTails: 20000 });
            expect(Object.keys(view.shelter!).sort()).toEqual([
                '_id',
                'country',
                'countryCode',
                'image',
                'name',
                'slug',
            ]);
        });

        it('lists open goals first, closest to filled first, and hides cancelled ones by default', async () => {
            const far = await seedGoal(db.goals, { shelter, targetTails: 1000, raisedTails: 100 });
            const near = await seedGoal(db.goals, { shelter, targetTails: 1000, raisedTails: 900 });
            const filled = await seedGoal(db.goals, { shelter, status: RescueGoalStatus.FILLED });
            const cancelled = await seedGoal(db.goals, { shelter, status: RescueGoalStatus.CANCELLED });

            const ids = (await service.list()).map(goal => goal.id);
            expect(ids).toEqual([String(near), String(far), String(filled)]);
            expect((await service.list({ status: 'cancelled' })).map(g => g.id)).toEqual([String(cancelled)]);
            expect(await service.list({ status: 'all' })).toHaveLength(4);
            await expect(service.list({ status: 'nope' })).rejects.toMatchObject({ status: 400 });
        });

        it('drops the txHash for app surfaces (F11)', () => {
            const row = {
                _id: new Types.ObjectId(),
                title: 't',
                deliverable: 'd',
                status: RescueGoalStatus.DELIVERED,
                targetTails: 100,
                raisedTails: 100,
                delivery: {
                    photoUrl: 'https://cdn/x.webp',
                    receiptSha256: 'ab',
                    deliveredAt: new Date(),
                    txHash: '0x' + 'a'.repeat(64),
                },
            };
            expect(publicGoalView(row, null, 'web').delivery).toHaveProperty('txHash', '0x' + 'a'.repeat(64));
            expect(publicGoalView(row, null, 'app').delivery).not.toHaveProperty('txHash');
        });

        it('summarises open goals for the impact snapshot', async () => {
            await seedGoal(db.goals, { shelter });
            await seedGoal(db.goals, { shelter, status: RescueGoalStatus.FILLED });
            await seedGoal(db.goals, { shelter, status: RescueGoalStatus.DELIVERED });
            const summary = await service.openGoalsSummary();
            expect(summary.open).toBe(1);
            expect(summary.items.map(goal => goal.status)).toEqual([RescueGoalStatus.OPEN, RescueGoalStatus.FILLED]);
        });
    });

    describe('deliver and cancel', () => {
        const receipt = { buffer: Buffer.from('%PDF-1.4 receipt'), mimetype: 'application/pdf' };

        it('needs a photo and a receipt; the photo loses its metadata and the receipt stays private', async () => {
            const created = await service.create(goalInput(shelter) as any, MANAGER);
            await expect(service.deliver(created.id, {}, { receipt }, MANAGER)).rejects.toMatchObject({ status: 400 });
            await expect(
                service.deliver(created.id, {}, { photo: { buffer: photo, mimetype: 'image/jpeg' } }, MANAGER)
            ).rejects.toMatchObject({ status: 400 });
            await expect(
                service.deliver(
                    created.id,
                    {},
                    { photo: { buffer: photo }, receipt: { ...receipt, mimetype: 'text/html' } },
                    MANAGER
                )
            ).rejects.toMatchObject({ status: 400 });

            const delivered = await service.deliver(
                created.id,
                { note: 'Delivered on Monday', txHash: 'B'.repeat(64) },
                { photo: { buffer: photo, mimetype: 'image/jpeg' }, receipt },
                MANAGER
            );

            expect(delivered.status).toBe(RescueGoalStatus.DELIVERED);
            expect(delivered.delivery).toMatchObject({ note: 'Delivered on Monday', txHash: '0x' + 'b'.repeat(64) });
            const [key, data] = (service.photoUploader as jest.Mock).mock.calls[0];
            expect(key).toMatch(new RegExp(`^rescue-goals/${created.id}/[0-9a-f]{64}\\.webp$`));
            const meta = await sharp(data).metadata();
            expect(meta.format).toBe('webp');
            expect(meta.exif).toBeUndefined();
            expect(delivered.delivery!.photoUrl).toBe(`https://cdn.example/${key}`);
            expect(delivered.receipt).toMatchObject({ mime: 'application/pdf', size: receipt.buffer.length });
            const file = await service.receipt(created.id);
            expect(file.data.toString()).toBe('%PDF-1.4 receipt');
            // Public view: the receipt's hash, never the file.
            const pub = JSON.stringify(await service.getPublic(created.id));
            expect(pub).toContain(delivered.receipt!.sha256);
            expect(pub).not.toContain('PDF-1.4');

            await expect(
                service.deliver(created.id, {}, { photo: { buffer: photo }, receipt }, MANAGER)
            ).rejects.toMatchObject({ response: { code: 'GOAL_NOT_DELIVERABLE' } });
            await expect(service.cancel(created.id, 'too late', MANAGER)).rejects.toMatchObject({
                response: { code: 'GOAL_NOT_CANCELLABLE' },
            });
            await expect(service.update(created.id, { title: 'Renamed goal' })).rejects.toMatchObject({
                response: { code: 'GOAL_NOT_EDITABLE' },
            });
        });

        it('checks the photo type and size before decoding it', async () => {
            const created = await service.create(goalInput(shelter) as any, MANAGER);
            await expect(
                service.deliver(created.id, {}, { photo: { buffer: photo, mimetype: 'text/html' }, receipt }, MANAGER)
            ).rejects.toMatchObject({ status: 400 });
            await expect(
                service.deliver(
                    created.id,
                    {},
                    { photo: { buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: 'image/png' }, receipt },
                    MANAGER
                )
            ).rejects.toMatchObject({ status: 400 });
            expect(service.photoUploader).not.toHaveBeenCalled();
            expect(db.goals.get(new Types.ObjectId(created.id))!.status).toBe(RescueGoalStatus.OPEN);
        });

        it('two deliveries at once leave exactly one receipt, the one whose hash is published', async () => {
            const created = await service.create(goalInput(shelter) as any, MANAGER);
            const receipts = ['%PDF-1.4 receipt A', '%PDF-1.4 receipt B'].map(body => ({
                buffer: Buffer.from(body),
                mimetype: 'application/pdf',
            }));

            const results = await Promise.allSettled(
                receipts.map(r =>
                    service.deliver(
                        created.id,
                        {},
                        { photo: { buffer: photo, mimetype: 'image/jpeg' }, receipt: r },
                        MANAGER
                    )
                )
            );

            expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
            expect(results.find(r => r.status === 'rejected')).toMatchObject({
                reason: { response: { code: 'GOAL_NOT_DELIVERABLE' } },
            });
            expect(db.receipts.docs).toHaveLength(1);
            const goal = db.goals.get(new Types.ObjectId(created.id))!;
            expect(db.receipts.docs[0].sha256).toBe(goal.delivery.receiptSha256);
            const stored = await service.receipt(created.id);
            expect(createHash('sha256').update(stored.data).digest('hex')).toBe(goal.delivery.receiptSha256);
        });

        it('a delivery racing a cancel stores no receipt when the cancel wins', async () => {
            const created = await service.create(goalInput(shelter) as any, MANAGER);
            const delivering = service.deliver(
                created.id,
                {},
                { photo: { buffer: photo, mimetype: 'image/jpeg' }, receipt },
                MANAGER
            );
            await service.cancel(created.id, 'Shelter closed', MANAGER);
            await expect(delivering).rejects.toMatchObject({ response: { code: 'GOAL_NOT_DELIVERABLE' } });
            expect(db.receipts.docs).toHaveLength(0);
        });

        it('undoes the delivery when the receipt cannot be stored', async () => {
            const created = await service.create(goalInput(shelter) as any, MANAGER);
            jest.spyOn(Logger.prototype, 'error').mockImplementationOnce(() => undefined);
            db.receipts.beforeOp = () => {
                throw new Error('connection lost');
            };
            await expect(
                service.deliver(created.id, {}, { photo: { buffer: photo, mimetype: 'image/jpeg' }, receipt }, MANAGER)
            ).rejects.toMatchObject({ status: 503 });
            db.receipts.beforeOp = null;
            const goal = db.goals.get(new Types.ObjectId(created.id))!;
            expect(goal.status).toBe(RescueGoalStatus.OPEN);
            expect(goal.delivery).toBeUndefined();
            // A retry then succeeds.
            await expect(
                service.deliver(created.id, {}, { photo: { buffer: photo, mimetype: 'image/jpeg' }, receipt }, MANAGER)
            ).resolves.toMatchObject({ status: RescueGoalStatus.DELIVERED });
        });

        it('cancel needs a reason and gives every give back', async () => {
            const created = await service.create(goalInput(shelter) as any, MANAGER);
            const player = await seedUser(db.users, { tails: 3000 });
            await pledges.pledge(
                player.auth as any,
                created.id,
                { amount: 1200, pledgeId: uuid() },
                new Date(),
                ENV_OPEN
            );
            expect(db.users.get(player._id)!.tails).toBe(1800);

            await expect(service.cancel(created.id, '', MANAGER)).rejects.toMatchObject({ status: 400 });
            const cancelled = await service.cancel(created.id, 'The shelter closed the kitten room', MANAGER);

            expect(cancelled).toMatchObject({
                status: RescueGoalStatus.CANCELLED,
                cancelReason: 'The shelter closed the kitten room',
                pledges: { REFUNDED: 1, CONFIRMED: 0 },
            });
            expect(db.users.get(player._id)!).toMatchObject({ tails: 3000, tailsGiven: 0, goalsHelped: 0 });
            expect(db.goals.docs[0].refundUntil).toBeInstanceOf(Date);
        });

        it('edits wording only, never the target or the funding', async () => {
            const created = await service.create(goalInput(shelter) as any, MANAGER);
            const updated = await service.update(created.id, {
                title: 'Kitten food, round two',
                image: '',
                targetTails: 1,
                fundingAmount: '1',
            } as any);
            expect(updated).toMatchObject({ title: 'Kitten food, round two', image: null, targetTails: 20000 });
            expect(updated.funding.amountCents).toBe(4990);
        });
    });

    describe('the player', () => {
        it('sees their gives, the daily cap, totals, eligibility and badges', async () => {
            const goal = await seedGoal(db.goals, { shelter, targetTails: 5000 });
            const player = await seedUser(db.users, { tails: 3000 });
            await pledges.pledge(
                player.auth as any,
                String(goal),
                { amount: 700, pledgeId: uuid() },
                new Date(),
                ENV_OPEN
            );

            const mine = await service.myGives(player.auth as any, new Date(), ENV_OPEN);

            expect(mine).toMatchObject({
                pledges: [{ amount: 700, status: 'CONFIRMED', goalTitle: 'Kitten food' }],
                daily: { used: 700, left: 4300 },
                balance: { tails: 2300 },
                totals: { tailsGiven: 700, goalsHelped: 1, monthTailsGiven: 700, monthGoalsHelped: 1 },
                eligibility: { eligible: true, reason: null, open: true },
                limits: { min: 10, max: 5000 },
                badges: [{ id: 'TREAT_GIVER', earned: false, confirmedTreats: 0, needed: TREAT_GIVER_TREATS }],
            });
            const young = await seedUser(db.users, { createdAt: new Date(Date.now() - DAY_MS) });
            expect((await service.myGives(young.auth as any, new Date(), {})).eligibility).toMatchObject({
                eligible: false,
                reason: 'account-too-new',
                open: false,
            });
        });

        it('rejects guests', async () => {
            await expect(service.myGives({ isGuest: true, _id: new Types.ObjectId() } as any)).rejects.toMatchObject({
                status: 403,
                response: { code: 'GUEST_FORBIDDEN' },
            });
        });

        it('earns Treat Giver with five CONFIRMED treats this season, and grants nothing', async () => {
            const player = await seedUser(db.users, { tails: 100 });
            const season = new Date(seasonTimes(new Date()).startedAt);
            const treat = (status: ShelterDonationStatus, confirmedAt: Date) =>
                db.donations.insertOne({ user: player._id, status, confirmedAt });
            for (let i = 0; i < 4; i++) await treat(ShelterDonationStatus.CONFIRMED, new Date(season.getTime() + 1000));
            await treat(ShelterDonationStatus.SENT, new Date());
            await treat(ShelterDonationStatus.CONFIRMED, new Date(season.getTime() - 1000));
            expect(await service.treatGiverBadge(player._id)).toMatchObject({ earned: false, confirmedTreats: 4 });

            await treat(ShelterDonationStatus.CONFIRMED, new Date());
            expect(await service.treatGiverBadge(player._id)).toMatchObject({ earned: true, confirmedTreats: 5 });
            expect(db.users.get(player._id)!.tails).toBe(100);
        });
    });

    it('converts money amounts to cents', () => {
        expect(toCents('49.90')).toBe(4990);
        expect(toCents('50')).toBe(5000);
        expect(toCents('0.5')).toBe(50);
        expect(toCents('0')).toBeNull();
        expect(toCents('1.234')).toBeNull();
        expect(toCents('-1')).toBeNull();
    });
});
