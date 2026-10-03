import { Types } from 'mongoose';
import { CATNIP_CHAOS_LEVEL_CAPS, GUEST_TAILS_LIFETIME_CAP } from 'src/shared-contracts/caps';
import {
    cleanupIdleGuests,
    eraseGuest,
    IGuestLifecycleDeps,
    mergedCodex,
    resumeGuestMerges,
    runGuestMerge,
    startGuestMerge,
} from './guest/guest-lifecycle';
import { createIdentityHarness, guestSeed, httpError, rejection } from './guest/identity-harness.helper-spec';
import { recomputeGameTotals } from './utils/live-game';

jest.mock('src/shared/encryption.service', () => ({
    EncryptionService: class {
        encrypt = () => ({ iv: 'iv', content: 'secret' });
    },
}));

/*
 * G1 resumable guest merge (started -> gamesMoved -> bestsMerged -> done), guest erase and the idle
 * cleanup (decision #11). Acceptance: merge retry at each state without double counting, bests equal
 * the elementwise max, caps are never exceeded, cleanup deletes only guests idle over 30 days.
 */

const DAY = 24 * 60 * 60 * 1000;

function scenario(targetFields: Record<string, unknown> = {}, guestFields: Record<string, unknown> = {}) {
    const targetId = new Types.ObjectId();
    const targetCat = new Types.ObjectId();
    const target = {
        _id: targetId,
        name: 'Registered',
        email: 'target@example.com',
        firebaseUids: ['uid-target'],
        isGuest: false,
        tails: 1000,
        cat: targetCat,
        cats: [targetCat],
        catnipChaos: [100, 0, 5],
        match3: [],
        match3Score: [300],
        seasonEvent: [],
        codex: [1, 0],
        ...targetFields,
    };
    const { user: guest, cat: guestStarter } = guestSeed('uid-guest', {
        pendingTails: 500,
        catnipChaos: [80, 8, 0, 3],
        match3Score: [100, 700],
        codex: [0, 1, 1],
        ...guestFields,
    });
    const ctx = createIdentityHarness({
        users: [target, guest],
        cats: [{ _id: targetCat, owner: targetId, name: 'Luna' }, guestStarter],
        games: [
            { user: guest._id, cat: guest.cat, type: 'CATNIP_CHAOS', level: '1', points: 80 },
            { user: guest._id, cat: guest.cat, type: 'CATNIP_CHAOS', level: '2', points: 120 },
            { user: targetId, cat: targetCat, type: 'CATNIP_CHAOS', level: '1', points: 100 },
        ],
    });
    const deps: IGuestLifecycleDeps = {
        users: ctx.users as any,
        cats: ctx.cats as any,
        games: ctx.games as any,
        firebase: ctx.firebase,
        recomputeTotals: id => recomputeGameTotals(ctx.userRepository, id),
        now: () => new Date(ctx.clock.now),
    };
    return { ctx, deps, targetId, targetCat, guest };
}

async function merge(deps: IGuestLifecycleDeps, guestId: Types.ObjectId, targetId: Types.ObjectId) {
    const claimed = await startGuestMerge(deps, guestId, targetId);
    return claimed ? runGuestMerge(deps, claimed) : null;
}

/** The parts of the final state a double count would change. */
function snapshot(s: ReturnType<typeof scenario>) {
    const target = s.ctx.users.docs.find(doc => String(doc._id) === String(s.targetId))!;
    return {
        users: s.ctx.users.docs.length,
        tails: target.tails,
        guestMergedTails: target.guestMergedTails,
        catnipChaos: target.catnipChaos,
        catnipChaosCount: target.catnipChaosCount,
        catnipCount: target.catnipCount,
        match3Score: target.match3Score,
        match3ScoreCount: target.match3ScoreCount,
        codex: target.codex,
        gamesOfTarget: s.ctx.games.docs.filter(game => String(game.user) === String(s.targetId)).length,
        gamesOfGuest: s.ctx.games.docs.filter(game => String(game.user) === String(s.guest._id)).length,
        guestCats: s.ctx.cats.docs.filter(cat => String(cat.owner) === String(s.guest._id)).length,
        firebaseDeleted: [...new Set(s.ctx.firebase.deleted)],
    };
}

describe('guest merge', () => {
    it.each(['started', 'gamesMoved', 'bestsMerged', 'done'])(
        'stops at %s when the guest was promoted meanwhile: no Game row moved, no starter or Firebase user deleted',
        async state => {
            const s = scenario();
            const claimed = await startGuestMerge(s.deps, s.guest._id, s.targetId);
            // Another tab promoted the same uid (defence in depth: promotion refuses a claimed guest).
            const doc = s.ctx.users.docs.find(user => String(user._id) === String(s.guest._id))!;
            Object.assign(doc, { isGuest: false, mergeState: state, email: 'guest@example.com' });

            const outcome = await runGuestMerge(s.deps, { ...claimed, mergeState: state }).catch(error => error);

            if (state !== 'done') {
                expect(httpError(outcome).status).toBe(409);
            }
            const final = snapshot(s);
            expect(final.gamesOfGuest).toBe(2);
            expect(final.guestCats).toBe(1);
            expect(final.firebaseDeleted).toEqual([]);
            expect(final.tails).toBe(1000);
            expect(s.ctx.users.docs.some(user => String(user._id) === String(s.guest._id))).toBe(true);
        }
    );

    it('a unique Game index rejecting a row mid-updateMany: rows move one by one, duplicates dropped, merge finishes', async () => {
        const s = scenario();
        const updateOne = s.ctx.games.updateOne.bind(s.ctx.games);
        let firstRow = true;
        jest.spyOn(s.ctx.games, 'updateMany').mockImplementationOnce(async () => {
            throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
        });
        jest.spyOn(s.ctx.games, 'updateOne').mockImplementation(async (filter: any, update: any) => {
            if (firstRow) {
                firstRow = false;
                throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
            }
            return updateOne(filter, update);
        });

        const result = await merge(s.deps, s.guest._id, s.targetId);

        expect(result).toMatchObject({ state: 'done', gamesMoved: 1 });
        const final = snapshot(s);
        expect(final.gamesOfGuest).toBe(0);
        expect(final.gamesOfTarget).toBe(2);
        expect(final.users).toBe(1);
    });

    it('credits monthTails with the pending Tails', async () => {
        const s = scenario({ monthTails: 10 });

        await merge(s.deps, s.guest._id, s.targetId);

        const target = s.ctx.users.docs.find(doc => String(doc._id) === String(s.targetId))!;
        expect(target.monthTails).toBe(510);
    });

    it('re-parents Game rows, merges bests as the elementwise max, codex, capped pending Tails, then deletes the guest', async () => {
        const s = scenario();

        const result = await merge(s.deps, s.guest._id, s.targetId);

        expect(result).toEqual({ state: 'done', gamesMoved: 2, tailsCredited: 500 });
        const final = snapshot(s);
        expect(final).toMatchObject({
            users: 1,
            tails: 1500,
            guestMergedTails: 500,
            codex: [1, 1, 1],
            gamesOfTarget: 3,
            gamesOfGuest: 0,
            guestCats: 0,
            firebaseDeleted: ['uid-guest'],
        });
        // Elementwise max of [100, 0, 5] and [80, 8, 0, 3].
        expect(final.catnipChaos.slice(0, 4)).toEqual([100, 8, 5, 3]);
        expect(final.catnipChaosCount).toBe(116);
        expect(final.match3Score.slice(0, 2)).toEqual([300, 700]);
        // Re-parented rows point at the target's cat (the guest starter is dropped, decision #8).
        expect(s.ctx.games.docs.every(game => String(game.cat) === String(s.targetCat))).toBe(true);
        expect(s.ctx.cats.docs.map(cat => cat.name)).toEqual(['Luna']);
    });

    it('re-derives totals through recomputeGameTotals, so a guest best over a cap is clamped', async () => {
        const s = scenario({}, { catnipChaos: [99999] });

        await merge(s.deps, s.guest._id, s.targetId);

        expect(snapshot(s).catnipChaos[0]).toBe(CATNIP_CHAOS_LEVEL_CAPS[0]);
    });

    it('works for a target without score arrays or codex (stores arrays, not objects)', async () => {
        const s = scenario({ catnipChaos: undefined, match3Score: undefined, codex: undefined, match3: undefined });

        await merge(s.deps, s.guest._id, s.targetId);

        const final = snapshot(s);
        expect(Array.isArray(final.catnipChaos)).toBe(true);
        expect(final.catnipChaos.slice(0, 4)).toEqual([80, 8, 0, 3]);
        expect(final.codex).toEqual([0, 1, 1]);
    });

    it('finishes for a target whose score arrays are null (guarded like /live, never stuck at gamesMoved)', async () => {
        const s = scenario({ catnipChaos: null, match3Score: null, match3: null, seasonEvent: null });

        const result = await merge(s.deps, s.guest._id, s.targetId);

        expect(result?.state).toBe('done');
        const final = snapshot(s);
        // Null padding left by the dotted $max counts as 0, as after a first /live save.
        expect(final.catnipChaos.slice(0, 4).map((v: unknown) => v ?? 0)).toEqual([80, 8, 0, 3]);
        expect(final.catnipChaosCount).toBe(91);
        expect(final.match3Score.slice(0, 2)).toEqual([100, 700]);
        expect(final.match3ScoreCount).toBe(800);
        expect(final.tails).toBe(1500);
        expect(s.ctx.users.docs.some(user => String(user._id) === String(s.guest._id))).toBe(false);
    });

    it('a null array on the target fails a bare dotted $max (the memory model matches MongoDB)', async () => {
        const s = scenario({ catnipChaos: null });

        await expect(s.ctx.users.updateOne({ _id: s.targetId }, { $max: { 'catnipChaos.3': 5 } })).rejects.toThrow(
            /Cannot create field '3'/
        );
    });

    it('credits only the lifetime headroom (GUEST_TAILS_LIFETIME_CAP) and exactly once per guest', async () => {
        const s = scenario({ guestMergedTails: GUEST_TAILS_LIFETIME_CAP - 200 }, { pendingTails: 500 });

        const result = await merge(s.deps, s.guest._id, s.targetId);

        expect(result?.tailsCredited).toBe(200);
        expect(snapshot(s)).toMatchObject({ tails: 1200, guestMergedTails: GUEST_TAILS_LIFETIME_CAP });
    });

    // A crash (process gone, network) at every step boundary, then a retry: the final state equals
    // an uninterrupted merge.
    const crashPoints: [string, (s: ReturnType<typeof scenario>) => void][] = [
        ['before the Game rows move', s => failOnce(s.ctx.games, 'updateMany')],
        [
            'after the Game rows moved',
            s => failOnce(s.ctx.users, 'updateOne', ([filter]) => filter?.mergeState === 'started'),
        ],
        ['before the bests $max', s => failOnce(s.ctx.users, 'updateOne', ([, update]) => !!update?.$max)],
        ['inside recomputeGameTotals', s => failOnceDeps(s, 'recomputeTotals')],
        [
            'after the bests merged',
            s => failOnce(s.ctx.users, 'updateOne', ([filter]) => filter?.mergeState === 'gamesMoved'),
        ],
        [
            'after the Tails credit',
            s => failOnce(s.ctx.users, 'updateOne', ([filter]) => filter?.mergeState === 'bestsMerged'),
        ],
        ['before the guest cats are deleted', s => failOnce(s.ctx.cats, 'deleteMany')],
        ['before the Firebase user is deleted', s => failOnceDeps(s, 'firebase')],
        ['before the guest doc is deleted', s => failOnce(s.ctx.users, 'deleteOne')],
    ];

    function failOnce(model: any, method: string, when: (args: any[]) => boolean = () => true) {
        const original = model[method].bind(model);
        let failed = false;
        jest.spyOn(model, method).mockImplementation((...args: any[]) => {
            if (!failed && when(args)) {
                failed = true;
                return Promise.reject(new Error(`crash in ${method}`));
            }
            return original(...args);
        });
    }

    function failOnceDeps(s: ReturnType<typeof scenario>, what: 'recomputeTotals' | 'firebase') {
        let failed = false;
        if (what === 'recomputeTotals') {
            const original = s.deps.recomputeTotals;
            s.deps.recomputeTotals = id => {
                if (!failed) {
                    failed = true;
                    return Promise.reject(new Error('crash in recompute'));
                }
                return original(id);
            };
            return;
        }
        const original = s.deps.firebase.deleteAnonymousUsers.bind(s.deps.firebase);
        s.deps.firebase = {
            ...s.deps.firebase,
            deleteAnonymousUsers: async uids => {
                if (!failed) {
                    failed = true;
                    throw new Error('crash in firebase');
                }
                return original(uids);
            },
        };
    }

    it.each(crashPoints)(
        'a retry after a crash %s neither double counts nor loses anything',
        async (_label, inject) => {
            const reference = scenario();
            await merge(reference.deps, reference.guest._id, reference.targetId);

            const s = scenario();
            inject(s);
            await expect(merge(s.deps, s.guest._id, s.targetId)).rejects.toThrow(/crash/);
            // The retry: the client calls POST /user/guest/merge again (or the resume cron runs).
            await merge(s.deps, s.guest._id, s.targetId);
            jest.restoreAllMocks();

            expect(snapshot(s)).toEqual(snapshot(reference));
        }
    );

    it('a retry after the merge finished (guest already deleted) is a no-op', async () => {
        const s = scenario();
        await merge(s.deps, s.guest._id, s.targetId);
        const done = snapshot(s);

        await expect(merge(s.deps, s.guest._id, s.targetId)).resolves.toBeNull();
        expect(snapshot(s)).toEqual(done);
    });

    it('two parallel merge requests of one guest credit once', async () => {
        const s = scenario();

        await Promise.allSettled([merge(s.deps, s.guest._id, s.targetId), merge(s.deps, s.guest._id, s.targetId)]);
        await resumeGuestMerges({ ...s.deps, now: () => new Date(Date.now() + DAY) });

        expect(snapshot(s)).toMatchObject({ tails: 1500, users: 1, gamesOfTarget: 3 });
    });

    it('allows one merge per target per 30 days; the refused guest is released and keeps playing', async () => {
        const s = scenario();
        await merge(s.deps, s.guest._id, s.targetId);

        const second = guestSeed('uid-guest-2', { pendingTails: 50 });
        s.ctx.users.docs.push({ ...second.user, createdAt: new Date(s.ctx.clock.now) });
        const error = await rejection(merge(s.deps, second.user._id, s.targetId));

        expect(httpError(error).status).toBe(429);
        const released = s.ctx.users.docs.find(doc => String(doc._id) === String(second.user._id))!;
        expect(released.mergedInto).toBeUndefined();
        expect(released.mergeState).toBeUndefined();

        s.ctx.clock.now = new Date(s.ctx.clock.now.getTime() + 31 * DAY);
        await expect(merge(s.deps, second.user._id, s.targetId)).resolves.toMatchObject({ state: 'done' });
    });

    it('a guest claimed by one account cannot be merged into another (409)', async () => {
        const s = scenario();
        await startGuestMerge(s.deps, s.guest._id, s.targetId);

        const error = await rejection(startGuestMerge(s.deps, s.guest._id, new Types.ObjectId()));

        expect(httpError(error).status).toBe(409);
    });

    it('the resume cron finishes merges that stopped half way, and only those', async () => {
        const s = scenario();
        await startGuestMerge(s.deps, s.guest._id, s.targetId);
        const idle = guestSeed('uid-idle');
        s.ctx.users.docs.push(idle.user);

        // Too recent: a client may still be finishing it.
        expect(await resumeGuestMerges(s.deps)).toBe(0);
        s.ctx.clock.now = new Date(s.ctx.clock.now.getTime() + 10 * 60 * 1000);
        expect(await resumeGuestMerges(s.deps)).toBe(1);

        expect(snapshot(s)).toMatchObject({ tails: 1500, users: 2 });
        expect(s.ctx.users.docs.some(doc => String(doc._id) === String(idle.user._id))).toBe(true);
    });

    it('mergedCodex is the elementwise max and ignores junk', () => {
        expect(mergedCodex([1, 0, null], [0, 1])).toEqual([1, 1, 0]);
        expect(mergedCodex(undefined, [0, 1])).toEqual([0, 1]);
        expect(mergedCodex({ 0: 1 }, ['x'])).toEqual([0]);
    });
});

describe('DELETE /user/guest (eraseGuest)', () => {
    it('deletes the guest doc, its starter, its Game rows and its anonymous Firebase user', async () => {
        const s = scenario();

        await eraseGuest(s.deps, s.guest._id, ['uid-guest']);

        expect(s.ctx.users.docs.map(doc => doc.name)).toEqual(['Registered']);
        expect(s.ctx.games.docs).toHaveLength(1);
        expect(s.ctx.cats.docs).toHaveLength(1);
        expect(s.ctx.firebase.deleted).toEqual(['uid-guest']);
    });

    it('a transient guest (no doc) only deletes the anonymous Firebase user', async () => {
        const s = scenario();

        await eraseGuest(s.deps, null, ['uid-anon']);

        expect(s.ctx.users.docs).toHaveLength(2);
        expect(s.ctx.firebase.deleted).toEqual(['uid-anon']);
    });

    it('refuses a registered doc and a guest in the middle of a merge (409)', async () => {
        const s = scenario();
        expect(httpError(await rejection(eraseGuest(s.deps, s.targetId, []))).status).toBe(409);

        await startGuestMerge(s.deps, s.guest._id, s.targetId);
        expect(httpError(await rejection(eraseGuest(s.deps, s.guest._id, ['uid-guest']))).status).toBe(409);
        expect(s.ctx.firebase.deleted).toEqual([]);
    });
});

describe('guest idle cleanup (decision #11)', () => {
    it('deletes only guests idle for more than 30 days, with their starters and Firebase users', async () => {
        const now = new Date('2026-09-30T12:00:00Z');
        const ago = (days: number) => new Date(now.getTime() - days * DAY);
        const idle = guestSeed('uid-idle', { lastSeenAt: ago(31) });
        const recent = guestSeed('uid-recent', { lastSeenAt: ago(29) });
        const neverSeen = guestSeed('uid-never');
        const merging = guestSeed('uid-merging', {
            lastSeenAt: ago(60),
            mergedInto: new Types.ObjectId(),
            mergeState: 'started',
        });
        const registered = {
            _id: new Types.ObjectId(),
            name: 'Registered',
            isGuest: false,
            lastSeenAt: ago(400),
            createdAt: ago(900),
        };
        const legacy = { _id: new Types.ObjectId(), name: 'Legacy', createdAt: ago(900) };
        const ctx = createIdentityHarness({
            users: [
                idle.user,
                recent.user,
                { ...neverSeen.user, createdAt: ago(40) },
                merging.user,
                registered,
                legacy,
            ],
            cats: [idle.cat, recent.cat, neverSeen.cat, merging.cat],
        });

        const deleted = await cleanupIdleGuests({
            users: ctx.users as any,
            cats: ctx.cats as any,
            games: ctx.games as any,
            firebase: ctx.firebase,
            recomputeTotals: async () => undefined,
            now: () => now,
        });

        expect(deleted).toBe(2);
        expect(ctx.users.docs.map(doc => doc.firebaseUids?.[0] || doc.name).sort()).toEqual(
            ['Legacy', 'Registered', 'uid-merging', 'uid-recent'].sort()
        );
        expect(ctx.cats.docs).toHaveLength(2);
        expect(ctx.firebase.deleted.sort()).toEqual(['uid-idle', 'uid-never']);
    });
});

// 2a review fix #7: a guest can link an email/password credential it never verifies. Promotion is
// refused (403), so the doc stays a guest, but its Firebase user is a real login now.
describe('guest paths never delete a Firebase user that has a linked provider', () => {
    it('idle cleanup removes the guest doc but keeps the linked Firebase user', async () => {
        const now = new Date('2026-09-30T12:00:00Z');
        const linked = guestSeed('uid-linked', { lastSeenAt: new Date(now.getTime() - 40 * DAY) });
        const anonymous = guestSeed('uid-anon', { lastSeenAt: new Date(now.getTime() - 40 * DAY) });
        const ctx = createIdentityHarness({ users: [linked.user, anonymous.user], cats: [linked.cat, anonymous.cat] });
        ctx.firebase.linked.add('uid-linked');

        const deleted = await cleanupIdleGuests({
            users: ctx.users as any,
            cats: ctx.cats as any,
            games: ctx.games as any,
            firebase: ctx.firebase,
            recomputeTotals: async () => undefined,
            now: () => now,
        });

        expect(deleted).toBe(2);
        expect(ctx.firebase.deleted).toEqual(['uid-anon']);
    });

    it('erase keeps a linked Firebase user', async () => {
        const s = scenario();
        s.ctx.firebase.linked.add('uid-guest');

        await eraseGuest(s.deps, s.guest._id, ['uid-guest']);

        expect(s.ctx.users.docs.map(doc => doc.name)).toEqual(['Registered']);
        expect(s.ctx.firebase.deleted).toEqual([]);
    });

    it('the merge done step keeps a linked Firebase user', async () => {
        const s = scenario();
        s.ctx.firebase.linked.add('uid-guest');

        await expect(merge(s.deps, s.guest._id, s.targetId)).resolves.toMatchObject({ state: 'done' });

        expect(s.ctx.users.docs).toHaveLength(1);
        expect(s.ctx.firebase.deleted).toEqual([]);
    });
});
