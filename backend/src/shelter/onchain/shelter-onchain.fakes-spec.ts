// Test helpers for the shelter on-chain specs: in-memory stand-ins for the Mongo models.
// The name ends in `-spec.ts`, so tsconfig.build.json leaves it out of dist, and jest does not run it.
// Not imported by application code.
import { Types } from 'mongoose';

export const duplicateKey = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

export const SPLIT = '0x1111111111111111111111111111111111111111';
export const SHELTER_WALLET = '0x2222222222222222222222222222222222222222';
/** A throwaway value for the hot-wallet variable. `Wallet` is mocked, so it never signs anything. */
export const FAKE_KEY = '0x' + 'ab'.repeat(32);

export const SHELTER_ENV_KEYS = [
    'SHELTER_DONATE_ENABLED',
    'SHELTER_CHAIN_ID',
    'SHELTER_ARC_RPC_URL',
    'SHELTER_SPLIT_ADDRESS',
    'SHELTER_DONATE_PRIVATE_KEY',
    'SHELTER_DONATE_AMOUNT_WEI',
    'SHELTER_DONATE_DAILY_BUDGET_WEI',
    'SHELTER_X402_ENABLED',
    'SHELTER_X402_PRICE_WEI',
];

export function withShelterEnv(values: Record<string, string | undefined>) {
    for (const key of SHELTER_ENV_KEYS) {
        delete process.env[key];
    }
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) {
            process.env[key] = value;
        }
    }
}

export function fakeDonationModel() {
    const rows: any[] = [];
    return {
        rows,
        create: jest.fn(async (doc: any) => {
            if (rows.some(r => String(r.user) === String(doc.user) && r.day === doc.day)) {
                throw duplicateKey();
            }
            const row = { ...doc, _id: new Types.ObjectId() };
            rows.push(row);
            return row;
        }),
        deleteOne: jest.fn(async ({ _id }: any) => {
            const index = rows.findIndex(r => r._id.equals(_id));
            if (index >= 0) {
                rows.splice(index, 1);
            }
        }),
        updateOne: jest.fn(async ({ _id }: any, { $set }: any) => {
            Object.assign(
                rows.find(r => r._id.equals(_id)),
                $set
            );
        }),
    };
}

/** Mimics findOneAndUpdate({ day, count: { $lt } }, { $inc }, { upsert }) against a unique `day` index. */
export function fakeDayModel() {
    const counts = new Map<string, number>();
    return {
        counts,
        findOne: jest.fn(async ({ day }: any) => (counts.has(day) ? { day, count: counts.get(day) } : null)),
        findOneAndUpdate: jest.fn(async ({ day, count }: any, { $inc }: any) => {
            const current = counts.get(day);
            if (current === undefined) {
                counts.set(day, $inc.count);
                return { day, count: $inc.count };
            }
            if (current < count.$lt) {
                counts.set(day, current + $inc.count);
                return { day, count: current + $inc.count };
            }
            throw duplicateKey();
        }),
        updateOne: jest.fn(async ({ day }: any, { $inc }: any) => {
            counts.set(day, (counts.get(day) || 0) + $inc.count);
        }),
    };
}

function nonceMatches(row: any, filter: any): boolean {
    return row.nonce === filter.nonce && row.usedAt === null && row.expiresAt > filter.expiresAt.$gt;
}

export function fakeNonceModel() {
    const rows: any[] = [];
    return {
        rows,
        create: jest.fn(async (doc: any) => {
            if (rows.some(r => r.nonce === doc.nonce)) {
                throw duplicateKey();
            }
            rows.push({ ...doc });
            return doc;
        }),
        findOne: jest.fn(async (filter: any) => rows.find(r => nonceMatches(r, filter)) || null),
        findOneAndUpdate: jest.fn(async (filter: any, { $set }: any) => {
            const row = rows.find(r => nonceMatches(r, filter));
            if (!row) {
                return null;
            }
            Object.assign(row, $set);
            return row;
        }),
    };
}

export function fakeUsedTxModel() {
    const rows: any[] = [];
    return {
        rows,
        create: jest.fn(async (doc: any) => {
            if (rows.some(r => r.txHash === doc.txHash)) {
                throw duplicateKey();
            }
            rows.push(doc);
            return doc;
        }),
    };
}
