import { Types } from 'mongoose';
import { RescueGoalStatus } from 'src/shared-contracts/enums';
import { Doc, ICollectionLike } from './rescue-goal.store';

/* Seed helpers shared by the in-memory and the real-Mongo Rescue Goal specs (not a spec itself). */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ENV_OPEN = { TAILS_EARNED_BACKFILL_DONE: 'true' } as NodeJS.ProcessEnv;

let uuidCounter = 0;
/** A fresh v4-shaped UUID. */
export function uuid(): string {
    uuidCounter += 1;
    const hex = (uuidCounter.toString(16) + Math.random().toString(16).slice(2) + '0'.repeat(32)).slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function seedUser(users: ICollectionLike, fields: Doc = {}) {
    const _id = new Types.ObjectId();
    const doc = {
        _id,
        isGuest: false,
        createdAt: new Date(Date.now() - 10 * DAY_MS),
        tails: 10000,
        tailsEarned: 10000,
        tailsGiven: 0,
        monthTailsGiven: 0,
        goalsHelped: 0,
        monthGoalsHelped: 0,
        ...fields,
    };
    await users.insertOne(doc);
    // What AppAuthGuard puts on req.user: the lean document.
    return { _id, auth: { ...doc } as Doc };
}

export async function seedShelter(shelters: ICollectionLike, fields: Doc = {}) {
    const _id = new Types.ObjectId();
    await shelters.insertOne({ _id, name: 'Pink Paw', slug: 'rozine-pedute', role: 'partner', ...fields });
    return _id;
}

export async function seedGoal(goals: ICollectionLike, fields: Doc = {}) {
    const _id = new Types.ObjectId();
    await goals.insertOne({
        _id,
        shelter: new Types.ObjectId(),
        title: 'Kitten food',
        deliverable: '10 kg of kitten food',
        targetTails: 1000,
        raisedTails: 0,
        pledgeCount: 0,
        status: RescueGoalStatus.OPEN,
        budgetMonth: '2026-10',
        proofOwner: 'Proof Owner',
        funding: { setAside: true, line: 'Sponsor', amountCents: 5000, currency: 'EUR' },
        createdBy: new Types.ObjectId(),
        createdAt: new Date(),
        ...fields,
    });
    return _id;
}
