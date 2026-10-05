// Test helpers for the shelter on-chain specs: in-memory stand-ins for the Mongo models.
// The name ends in `-spec.ts`, so tsconfig.build.json leaves it out of dist, and jest does not run it.
// Not imported by application code.
import { duplicateKey, memoryModel } from 'src/impact/memory-model.fakes-spec';

export { duplicateKey };

export const SPLIT = '0x1111111111111111111111111111111111111111';
export const SHELTER_WALLET = '0x2222222222222222222222222222222222222222';
/** A throwaway value for the hot-wallet variable. `Wallet` is mocked, so it never signs anything. */
export const FAKE_KEY = '0x' + 'ab'.repeat(32);

/** The fake hot wallet's address. */
export const HOT_WALLET = '0x3333333333333333333333333333333333333333';

/**
 * A stand-in for ethers' `Wallet` in the donate specs. `send(request)` plays the signer: it resolves
 * with `{ hash }` (or rejects: nothing was signed). The "signed bytes" are that hash, and the specs mock
 * `keccak256` to return a 32-byte hex unchanged, so the stored hash is the one the spec chose.
 * Nonces count up from `nonce.next`.
 */
export function fakeWallet(send: jest.Mock, nonce: { next: number } = { next: 0 }) {
    return {
        address: HOT_WALLET,
        populateTransaction: async (request: Record<string, unknown>) => ({ ...request, nonce: nonce.next++ }),
        signTransaction: async (request: Record<string, unknown>) => (await send(request)).hash,
    };
}

/** For the specs' `jest.mock('ethers')`: identity on a 32-byte hex (the fake signed bytes). */
export function fakeKeccak(actual: (data: string) => string) {
    return (data: string) => (/^0x[0-9a-f]{64}$/i.test(String(data)) ? data : actual(data));
}

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
    'SHELTER_ROUTER_ADDRESS',
    'SHELTER_ROUTER_FROM_BLOCK',
    'SHELTER_RELAY_ENABLED',
    'SHELTER_RELAY_DAILY_TX',
    'SHELTER_RELAY_MIN_USDC',
    'SHELTER_RELAY_MAX_USDC',
    'SHELTER_HANDED_OVER',
    'SHELTER_MATCH_ENABLED',
    'SHELTER_MATCH_PER_GIFT',
    'SHELTER_MATCH_MIN_GIFT',
    'SHELTER_MATCH_DAILY',
    'SHELTER_MATCH_POOL',
    'SHELTER_TREASURY_ADDRESS',
    'SHELTER_CLAIM_ALLOWED_WALLETS',
    'SHELTER_MATCH_EXCLUDE',
    'SHELTER_RELAY_IP_PEPPER',
    'SHELTER_NETWORK',
];

/**
 * Resets the SHELTER_* env to `values`. The specs model a production instance, so the default main
 * chain stays Arc mainnet (SHELTER_NETWORK=mainnet) unless `values` names SHELTER_NETWORK itself
 * (undefined there means "unset", the NODE_ENV-driven default).
 */
export function withShelterEnv(values: Record<string, string | undefined>) {
    for (const key of SHELTER_ENV_KEYS) {
        delete process.env[key];
    }
    if (!('SHELTER_NETWORK' in values)) {
        process.env.SHELTER_NETWORK = 'mainnet';
    }
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) {
            process.env[key] = value;
        }
    }
}

/** `shelterdonations` with its unique (user, day) index. `now` drives the fake timestamps. */
export function fakeDonationModel(now?: () => Date) {
    return memoryModel({ unique: [['user', 'day']], now });
}

/** `shelterdonatedays`: findOneAndUpdate({ day, count: { $lt } }, { $inc }, { upsert }) against a unique `day`. */
export function fakeDayModel() {
    const model = memoryModel({ unique: [['day']] });
    return {
        ...model,
        counts: {
            get: (day: string): number | undefined => model.rows.find(r => r.day === day)?.count,
        },
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
