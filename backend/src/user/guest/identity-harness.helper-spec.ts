/*
 * Shared set-up of the identity specs (plan F5): a UserService over in-memory users, cats and games
 * with the same unique indexes as MongoDB, plus token builders. Not a spec (no `.spec.ts`).
 *
 * Specs that import it must mock the encryption service first (it derives a key from an env secret
 * at import time):
 *
 *   jest.mock('src/shared/encryption.service', () => ({ EncryptionService: class { encrypt = () => ({}) } }));
 */
import { Types } from 'mongoose';
import { UserService } from '../user.service';
import { CAT_UNIQUE_INDEXES, MemoryModel, memoryRepository, USER_UNIQUE_INDEXES } from './memory-model.helper-spec';
import { IFirebaseIdentity } from './firebase-identity';

export const EMAIL = 'player@example.com';

type Doc = Record<string, any>;

export interface IIdentityHarness {
    users: MemoryModel;
    cats: MemoryModel;
    games: MemoryModel;
    userRepository: ReturnType<typeof memoryRepository>;
    catRepository: ReturnType<typeof memoryRepository>;
    gameRepository: ReturnType<typeof memoryRepository>;
    service: UserService;
    firebase: IFirebaseIdentity & { deleted: string[]; appChecks: string[]; missing: Set<string>; linked: Set<string> };
    clock: { now: Date };
}

/**
 * A fake Firebase Admin: tokens are `anon:<uid>` or `reg:<uid>`; deleted uids are recorded and then
 * no longer exist, as do the uids added to `missing`. Uids in `linked` have a provider linked (no
 * longer anonymous), so `deleteAnonymousUsers` keeps them.
 */
export function fakeFirebase(): IIdentityHarness['firebase'] {
    const deleted: string[] = [];
    const appChecks: string[] = [];
    const missing = new Set<string>();
    const linked = new Set<string>();
    return {
        deleted,
        appChecks,
        missing,
        linked,
        async userExists(uid: string) {
            return !missing.has(uid) && !deleted.includes(uid);
        },
        async verifyIdToken(token: string) {
            const [kind, uid] = token.split(':');
            if (!uid || (kind !== 'anon' && kind !== 'reg')) {
                throw new Error('auth/argument-error');
            }
            return { uid, firebase: { sign_in_provider: kind === 'anon' ? 'anonymous' : 'google.com' } };
        },
        async deleteUsers(uids: string[]) {
            deleted.push(...uids);
            return uids.length;
        },
        async deleteAnonymousUsers(uids: string[]) {
            const anonymous = uids.filter(uid => !linked.has(uid));
            deleted.push(...anonymous);
            return anonymous.length;
        },
        async verifyAppCheck(token: string) {
            appChecks.push(token);
            if (token !== 'valid-app-check') {
                throw new Error('app-check/invalid');
            }
        },
    };
}

export function createIdentityHarness(seed: { users?: Doc[]; cats?: Doc[]; games?: Doc[] } = {}): IIdentityHarness {
    const clock = { now: new Date('2026-09-30T12:00:00Z') };
    const now = () => new Date(clock.now);
    const users = new MemoryModel(seed.users || [], USER_UNIQUE_INDEXES, now);
    const cats = new MemoryModel(seed.cats || [], CAT_UNIQUE_INDEXES, now);
    const games = new MemoryModel(seed.games || [], [], now);
    const userRepository = memoryRepository(users);
    const catRepository = memoryRepository(cats);
    const gameRepository = memoryRepository(games);
    const encryption = { encrypt: () => ({ iv: 'iv', content: 'secret' }) };
    const service = new UserService(
        userRepository as any,
        catRepository as any,
        encryption as any,
        gameRepository as any
    );
    const firebase = fakeFirebase();
    service.firebase = firebase;
    return {
        users,
        cats,
        games,
        userRepository,
        catRepository,
        gameRepository,
        service,
        firebase,
        clock,
    };
}

/** A decoded Firebase ID token of a real provider. Unverified password sign-in by default. */
export const registeredToken = (overrides: Doc = {}) =>
    ({
        uid: 'uid-player',
        email: EMAIL,
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
        ...overrides,
    } as any);

export const verifiedToken = (overrides: Doc = {}) => registeredToken({ email_verified: true, ...overrides });

export const googleToken = (overrides: Doc = {}) =>
    registeredToken({ email_verified: true, firebase: { sign_in_provider: 'google.com' }, ...overrides });

export const anonymousToken = (uid = 'uid-guest') => ({ uid, firebase: { sign_in_provider: 'anonymous' } } as any);

/** A persisted guest doc (as POST /user/guest/session writes it) plus its starter. */
export function guestSeed(uid = 'uid-guest', fields: Doc = {}) {
    const _id = new Types.ObjectId();
    const catId = new Types.ObjectId();
    return {
        user: {
            _id,
            name: 'Guest',
            firebaseUids: [uid],
            isGuest: true,
            onboarding: { state: 'pending', version: 1 },
            pendingTails: 0,
            guestMergedTails: 0,
            cat: catId,
            cats: [catId],
            ...fields,
        },
        cat: { _id: catId, owner: _id, isStarter: true, isGuestStarter: true, name: 'Scout', starterBreed: 'SCOUT' },
    };
}

/** Resolves with the thrown error, or fails the spec when the promise resolves. */
export async function rejection(promise: Promise<unknown>): Promise<any> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('expected a rejection');
}

/** `{status, code}` of an HttpException. */
export function httpError(error: any): { status: number; code?: string } {
    const body = typeof error?.getResponse === 'function' ? error.getResponse() : undefined;
    return { status: typeof error?.getStatus === 'function' ? error.getStatus() : -1, code: body?.code };
}

/** Write calls a MemoryModel recorded (reads excluded). */
export const writes = (model: MemoryModel) =>
    model.calls.filter(call => !['findOne', 'find', 'collection.findOne'].includes(call));
