import { Logger } from '@nestjs/common';
import mongoose, { Connection, Types } from 'mongoose';
import { RescueGoalStatus } from 'src/shared-contracts/enums';
import { UserSchema } from 'src/user/user.schema';
import { RescueGoalPledgeStatus } from './rescue-goal.constants';
import { DAY_MS, ENV_OPEN, seedGoal, seedUser, uuid } from './rescue-goal.helpers-spec';
import { PLEDGE_HOLDS_FIELD } from './rescue-goal.ledger';
import { RescueGoalPledgeService, SagaStep } from './rescue-goal-pledge.service';
import {
    RescueGoalHelperSchema,
    RescueGoalPledgeDaySchema,
    RescueGoalPledgeSchema,
    RescueGoalReceiptSchema,
    RescueGoalSchema,
} from './rescue-goal.schema';
import { RescueGoalService } from './rescue-goal.service';
import { RescueGoalStore } from './rescue-goal.store';
import sharp = require('sharp');

/*
 * Rescue Goal gives against a REAL MongoDB (opt-in): the pipeline update, `$expr` filter, conditional
 * upserts and `$filter` refunds as the server evaluates them, under real concurrency.
 *
 * Skipped unless MONGO_IT_URI (or IDENTITY_SPEC_MONGO_URL) is set. Creates and drops its own scratch
 * database, so it is safe next to a local dev server:
 *
 *   MONGO_IT_URI=mongodb://localhost:27017 npx jest src/rescue-goal/rescue-goal-mongo.spec.ts
 *
 * The transaction case runs only when the server is a replica set (`hello.setName`).
 */

const url = process.env.MONGO_IT_URI || process.env.IDENTITY_SPEC_MONGO_URL;
const maybe = url ? describe : describe.skip;

class CrashingPledgeService extends RescueGoalPledgeService {
    crashAt: SagaStep | null = null;
    protected async checkpoint(step: SagaStep) {
        if (step === this.crashAt) {
            this.crashAt = null;
            throw new Error(`simulated crash after ${step}`);
        }
    }
}

maybe('Rescue Goal gives on a real MongoDB', () => {
    jest.setTimeout(60000);
    let connection: Connection;
    let store: RescueGoalStore;
    let service: CrashingPledgeService;
    let replicaSet = false;
    const eligibility = { savedGames: async () => 3 };

    beforeAll(async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        connection = await mongoose
            .createConnection(url!, { dbName: `tt_rescue_goal_spec_${new Types.ObjectId().toString()}` })
            .asPromise();
        const models = {
            goal: connection.model('RescueGoal', RescueGoalSchema),
            pledge: connection.model('RescueGoalPledge', RescueGoalPledgeSchema),
            day: connection.model('RescueGoalPledgeDay', RescueGoalPledgeDaySchema),
            helper: connection.model('RescueGoalHelper', RescueGoalHelperSchema),
            receipt: connection.model('RescueGoalReceipt', RescueGoalReceiptSchema),
            user: connection.model('User', UserSchema),
            shelter: connection.model('Shelter', new mongoose.Schema({}, { strict: false })),
            donation: connection.model('ShelterDonation', new mongoose.Schema({}, { strict: false })),
        };
        await Promise.all(Object.values(models).map(model => model.init()));
        store = new RescueGoalStore(
            models.goal,
            models.pledge,
            models.day,
            models.helper,
            models.receipt,
            models.user,
            models.shelter,
            models.donation
        );
        service = new CrashingPledgeService(store, eligibility as any);
        const hello = await connection.db.admin().command({ hello: 1 });
        replicaSet = !!hello.setName;
    });

    afterAll(async () => {
        await connection?.db?.dropDatabase();
        await connection?.close();
    });

    beforeEach(async () => {
        await Promise.all(
            [
                'rescuegoals',
                'rescuegoalpledges',
                'rescuegoalpledgedays',
                'rescuegoalhelpers',
                'rescuegoalreceipts',
                'shelters',
                'users',
                'jobruns',
            ].map(name => connection.db.collection(name).deleteMany({}))
        );
    });

    const give = (
        auth: Record<string, unknown>,
        goal: Types.ObjectId,
        amount: number,
        pledgeId = uuid(),
        env = ENV_OPEN
    ) => service.pledge(auth as any, String(goal), { amount, pledgeId }, new Date(), env);
    const settle = <T>(p: Promise<T>) =>
        p.then(
            () => true,
            () => false
        );
    const goalDoc = (id: Types.ObjectId) => store.goals.findOne({ _id: id });
    const userDoc = (id: Types.ObjectId) => store.users.findOne({ _id: id });

    it('twenty parallel gives never overfill and FILLED is set in the same write', async () => {
        const goal = await seedGoal(store.goals, { targetTails: 1000 });
        const players = await Promise.all(Array.from({ length: 20 }, () => seedUser(store.users, { tails: 500 })));

        const results = await Promise.all(players.map(player => settle(give(player.auth, goal, 100))));

        const row = (await goalDoc(goal))!;
        expect(results.filter(Boolean)).toHaveLength(10);
        expect(row).toMatchObject({ raisedTails: 1000, pledgeCount: 10, status: RescueGoalStatus.FILLED });
        expect(row.filledAt).toBeInstanceOf(Date);
        expect(row.pendingTakes).toEqual([]);
        const users = await store.users.find({}).toArray();
        expect(users.reduce((sum, user) => sum + user.tails, 0)).toBe(20 * 500 - 1000);
        expect(users.every(user => (user[PLEDGE_HOLDS_FIELD] || []).length === 0)).toBe(true);
    });

    it('the same pledge id debits once', async () => {
        const goal = await seedGoal(store.goals, { targetTails: 5000 });
        const player = await seedUser(store.users, { tails: 2000 });
        const pledgeId = uuid();

        await Promise.all(Array.from({ length: 10 }, () => settle(give(player.auth, goal, 300, pledgeId))));

        expect(await store.pledges.countDocuments({})).toBe(1);
        expect(await userDoc(player._id)).toMatchObject({ tails: 1700, tailsGiven: 300, tailsEarned: 10000 });
        expect((await goalDoc(goal))!.raisedTails).toBe(300);
    });

    it('a crash after the debit is refunded by the sweeper', async () => {
        const goal = await seedGoal(store.goals);
        const player = await seedUser(store.users, { tails: 1000 });
        service.crashAt = 'debited';
        expect(await settle(give(player.auth, goal, 400))).toBe(false);
        expect((await userDoc(player._id))!.tails).toBe(600);

        const swept = await service.sweepOnce(new Date(Date.now() + 3 * 60000));

        expect(swept.refunded).toBe(1);
        expect(await userDoc(player._id)).toMatchObject({ tails: 1000, tailsGiven: 0, [PLEDGE_HOLDS_FIELD]: [] });
        expect(await store.pledges.findOne({})).toMatchObject({
            status: RescueGoalPledgeStatus.REFUNDED,
            settled: true,
        });
        expect((await store.days.findOne({}))!.reserved).toBe(0);
    });

    it('a crash after the goal counted the give rolls forward', async () => {
        const goal = await seedGoal(store.goals);
        const player = await seedUser(store.users, { tails: 1000 });
        service.crashAt = 'taken';
        await settle(give(player.auth, goal, 400));

        expect((await service.sweepOnce(new Date(Date.now() + 3 * 60000))).forwarded).toBe(1);

        expect(await userDoc(player._id)).toMatchObject({ tails: 600, tailsGiven: 400, goalsHelped: 1 });
        expect(await goalDoc(goal)).toMatchObject({ raisedTails: 400, pendingTakes: [], fencedPledges: [] });
    });

    it('a give confirmed while the sweeper looked at it keeps its daily-cap share', async () => {
        const goal = await seedGoal(store.goals);
        const player = await seedUser(store.users, { tails: 1000 });
        await give(player.auth, goal, 400);
        const done = (await store.pledges.findOne({}))!;

        const stale = { ...done, status: RescueGoalPledgeStatus.PENDING, settled: false };
        expect(await service.recover(stale, new Date(Date.now() + 3 * 60000))).toBe('forwarded');

        expect((await store.days.findOne({}))!.reserved).toBe(400);
        expect(await userDoc(player._id)).toMatchObject({ tails: 600, tailsGiven: 400 });
        expect((await store.pledges.findOne({}))!.recheckAt).toBeUndefined();
        expect((await goalDoc(goal))!.fencedPledges).toEqual([]);
    });

    it('two parallel deliveries leave one receipt matching the published hash', async () => {
        const shelter = new Types.ObjectId();
        await store.shelters.insertOne({ _id: shelter, name: 'Pink Paw', role: 'partner' });
        const goal = await seedGoal(store.goals, { shelter });
        const goals = new RescueGoalService(store, service);
        goals.photoUploader = async key => `https://cdn.example/${key}`;
        const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } })
            .png()
            .toBuffer();
        const manager = { _id: new Types.ObjectId() } as any;

        const results = await Promise.allSettled(
            ['A', 'B', 'C'].map(tag =>
                goals.deliver(
                    String(goal),
                    {},
                    {
                        photo: { buffer: photo, mimetype: 'image/png' },
                        receipt: { buffer: Buffer.from(`%PDF receipt ${tag}`), mimetype: 'application/pdf' },
                    },
                    manager
                )
            )
        );

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const receipts = await store.receipts.find({}).toArray();
        expect(receipts).toHaveLength(1);
        expect(receipts[0].sha256).toBe((await goalDoc(goal))!.delivery.receiptSha256);
    });

    it('an expired OPEN goal is not counted as open', async () => {
        await seedGoal(store.goals, { endsAt: new Date(Date.now() - 1000) });
        await seedGoal(store.goals, { endsAt: new Date(Date.now() + DAY_MS) });
        await seedGoal(store.goals);
        const goals = new RescueGoalService(store, service);
        expect((await goals.openGoalsSummary()).open).toBe(2);
    });

    it('parallel gives respect the daily cap and the balance', async () => {
        const goal = await seedGoal(store.goals, { targetTails: 100000 });
        const rich = await seedUser(store.users, { tails: 50000 });
        const poor = await seedUser(store.users, { tails: 1000 });

        const capped = await Promise.all(Array.from({ length: 10 }, () => settle(give(rich.auth, goal, 1000))));
        const broke = await Promise.all(Array.from({ length: 5 }, () => settle(give(poor.auth, goal, 400))));

        expect(capped.filter(Boolean)).toHaveLength(5);
        expect(broke.filter(Boolean)).toHaveLength(2);
        expect((await userDoc(rich._id))!.tails).toBe(45000);
        expect((await userDoc(poor._id))!.tails).toBe(200);
    });

    it('cancel refunds a give once and takes back goalsHelped', async () => {
        const goal = await seedGoal(store.goals, { targetTails: 5000 });
        const player = await seedUser(store.users, { tails: 2000 });
        await give(player.auth, goal, 500);
        await store.goals.updateOne({ _id: goal }, { $set: { status: RescueGoalStatus.CANCELLED } });

        await Promise.all([service.refundCancelledGoal(goal), service.refundCancelledGoal(goal)]);

        expect(await userDoc(player._id)).toMatchObject({
            tails: 2000,
            tailsGiven: 0,
            goalsHelped: 0,
            tailsEarned: 10000,
        });
    });

    it('needs an account at least 72 h old', async () => {
        const goal = await seedGoal(store.goals);
        const young = await seedUser(store.users, { createdAt: new Date(Date.now() - DAY_MS) });
        await expect(give(young.auth, goal, 100)).rejects.toMatchObject({ response: { code: 'PLEDGE_NOT_ELIGIBLE' } });
    });

    it('the transaction path confirms in one transaction (replica set only)', async () => {
        if (!replicaSet) {
            return;
        }
        const goal = await seedGoal(store.goals, { targetTails: 1000 });
        const players = await Promise.all(Array.from({ length: 12 }, () => seedUser(store.users, { tails: 500 })));
        const env = { ...ENV_OPEN, MONGO_TRANSACTIONS: 'true' };

        await Promise.all(players.map(player => settle(give(player.auth, goal, 100, uuid(), env))));

        const row = (await goalDoc(goal))!;
        expect(row.raisedTails).toBe(1000);
        expect(row.status).toBe(RescueGoalStatus.FILLED);
    });
});
