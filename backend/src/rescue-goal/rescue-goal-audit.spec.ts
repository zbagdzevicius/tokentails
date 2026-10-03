import { Logger } from '@nestjs/common';
import mongoose, { Connection, Types } from 'mongoose';
import { PLEDGE_DAILY_CAP } from 'src/shared-contracts/caps';
import { UserSchema } from 'src/user/user.schema';
import { PLEDGE_STEP_DEADLINE_MS, PLEDGE_SWEEP_GRACE_MS, RESCUE_GOAL_COLLECTIONS } from './rescue-goal.constants';
import { ENV_OPEN, seedGoal, seedUser, uuid } from './rescue-goal.helpers-spec';
import { RescueGoalPledgeService, SagaStep } from './rescue-goal-pledge.service';
import {
    RescueGoalHelperSchema,
    RescueGoalPledgeDaySchema,
    RescueGoalPledgeSchema,
    RescueGoalReceiptSchema,
    RescueGoalSchema,
} from './rescue-goal.schema';
import { RescueGoalStore } from './rescue-goal.store';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require('../../scripts/rescue-goal-audit.js');

/*
 * scripts/rescue-goal-audit.js: the read-only ledger audit. The constant checks always run; the
 * audit itself runs against a real MongoDB only when MONGO_IT_URI (or IDENTITY_SPEC_MONGO_URL) is set,
 * in a throwaway database that is dropped afterwards.
 */

describe('rescue-goal-audit script', () => {
    it('uses the same collection names and daily cap as the backend', () => {
        expect(script.COLLECTIONS).toMatchObject({
            goals: RESCUE_GOAL_COLLECTIONS.goals,
            pledges: RESCUE_GOAL_COLLECTIONS.pledges,
            days: RESCUE_GOAL_COLLECTIONS.days,
        });
        expect(script.PLEDGE_DAILY_CAP).toBe(PLEDGE_DAILY_CAP);
        // The audit's "stuck" bar is the plan's 10 minutes, above what the sweeper needs.
        expect(script.STUCK_MS).toBe(10 * 60 * 1000);
        expect(PLEDGE_STEP_DEADLINE_MS + 2 * PLEDGE_SWEEP_GRACE_MS).toBeLessThan(script.STUCK_MS);
    });

    it('refuses unknown options', () => {
        expect(script.parseArgs(['--db', 'x', '--json'])).toEqual({ db: 'x', json: true });
        expect(() => script.parseArgs(['--apply'])).toThrow('Unknown option --apply');
    });
});

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

maybe('rescue-goal-audit on a real MongoDB', () => {
    jest.setTimeout(60000);
    let connection: Connection;
    let store: RescueGoalStore;
    let service: CrashingPledgeService;

    beforeAll(async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        connection = await mongoose
            .createConnection(url!, { dbName: `tt_rescue_goal_audit_${new Types.ObjectId().toString()}` })
            .asPromise();
        const loose = () => new mongoose.Schema({}, { strict: false });
        store = new RescueGoalStore(
            connection.model('RescueGoal', RescueGoalSchema),
            connection.model('RescueGoalPledge', RescueGoalPledgeSchema),
            connection.model('RescueGoalPledgeDay', RescueGoalPledgeDaySchema),
            connection.model('RescueGoalHelper', RescueGoalHelperSchema),
            connection.model('RescueGoalReceipt', RescueGoalReceiptSchema),
            connection.model('User', UserSchema),
            connection.model('Shelter', loose()),
            connection.model('ShelterDonation', loose())
        );
        service = new CrashingPledgeService(store, { savedGames: async () => 3 } as any);
    });

    afterAll(async () => {
        await connection?.db?.dropDatabase();
        await connection?.close();
    });

    beforeEach(async () => {
        await Promise.all(
            ['rescuegoals', 'rescuegoalpledges', 'rescuegoalpledgedays', 'rescuegoalhelpers', 'users'].map(name =>
                connection.db.collection(name).deleteMany({})
            )
        );
    });

    const give = (auth: Record<string, unknown>, goal: Types.ObjectId, amount: number) =>
        service.pledge(auth as any, String(goal), { amount, pledgeId: uuid() }, new Date(), ENV_OPEN);

    it('finds nothing wrong after parallel gives fill a goal', async () => {
        const goal = await seedGoal(store.goals, { targetTails: 500 });
        const players = await Promise.all(Array.from({ length: 8 }, () => seedUser(store.users, { tails: 300 })));
        await Promise.allSettled(players.map(player => give(player.auth, goal, 100)));

        const report = await script.audit(connection.db);
        expect(report.problems).toEqual([]);
        expect(report.ok).toBe(true);
        expect(report.goals.byStatus).toEqual({ FILLED: 1 });
        expect(report.pledges.byStatus.CONFIRMED).toBe(5);
    });

    it('reports a stuck give until the sweeper settles it', async () => {
        const goal = await seedGoal(store.goals, { targetTails: 5000 });
        const player = await seedUser(store.users, { tails: 1000 });
        service.crashAt = 'debited';
        await expect(give(player.auth, goal, 400)).rejects.toThrow();
        const later = new Date(Date.now() + 11 * 60 * 1000);

        const before = await script.audit(connection.db, later);
        expect(before.ok).toBe(false);
        expect(before.problems.join('\n')).toMatch(/PENDING for more than 10 minutes/);

        await service.sweepOnce(new Date(Date.now() + PLEDGE_STEP_DEADLINE_MS + PLEDGE_SWEEP_GRACE_MS + 1000));
        const after = await script.audit(connection.db, later);
        expect(after.problems).toEqual([]);
        expect((await store.users.findOne({ _id: player._id }))!.tails).toBe(1000);
    });

    it('reports a drifted total, an overfill and a goal without money set aside', async () => {
        await seedGoal(store.goals, { targetTails: 100, raisedTails: 150, status: 'FILLED' });
        await seedGoal(store.goals, { targetTails: 1000, funding: { setAside: false } });
        await connection.db
            .collection('rescuegoalpledgedays')
            .insertOne({ _id: 'x:2026-10-02' as any, reserved: PLEDGE_DAILY_CAP + 1 });

        const report = await script.audit(connection.db);
        const text = report.problems.join('\n');
        expect(report.ok).toBe(false);
        expect(text).toMatch(/raisedTails 150 but confirmed \+ counted gives sum to 0/);
        expect(text).toMatch(/overfilled \(150 of 100\)/);
        expect(text).toMatch(/OPEN without money set aside/);
        expect(text).toMatch(/daily reservation\(s\) above 5000/);
        // Counts and goal ids only: no user ids in the output.
        const users = await store.users.find({}).toArray();
        users.forEach(user => expect(text).not.toContain(String(user._id)));
    });
});
