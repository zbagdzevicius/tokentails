import { Types } from 'mongoose';
import { GameType } from 'src/game/game.schema';
import {
    PAWLEGENDS_LEVEL_CAPS,
    PAWLEGENDS_MAX_TICKS,
    PAWLEGENDS_TOTAL_CAP,
    TOTAL_CATNIP_CAP,
} from 'src/shared-contracts/caps';
import { IGuestLifecycleDeps, resumeGuestMerges, runGuestMerge, startGuestMerge } from 'src/user/guest/guest-lifecycle';
import { createIdentityHarness, guestSeed } from 'src/user/guest/identity-harness.helper-spec';
import { recomputeGameTotals } from 'src/user/utils/live-game';
import { pawlegendsBestsUpdate, pawlegendsFieldRepair, pawlegendsMatchesInc } from './pawlegends-merge';

jest.mock('src/shared/encryption.service', () => ({
    EncryptionService: class {
        encrypt = () => ({ iv: 'iv', content: 'secret' });
    },
}));

/*
 * D44: a guest who played Pawlegends and then signs in keeps its first-win catnip, fastest wins and match counts.
 * Carried by the existing resumable guest merge (src/user/guest/guest-lifecycle.ts), never by a second score
 * writer: the PAWLEGENDS Game rows are re-parented, nothing is created. The catnip stays within the per-difficulty
 * caps (PAWLEGENDS_TOTAL_CAP, TOTAL_CATNIP_CAP) and a difficulty both accounts claimed pays once.
 */

const [EASY_CAP, NORMAL_CAP, ROOKIE_CAP] = PAWLEGENDS_LEVEL_CAPS;
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
        catnipChaos: [100],
        match3: [],
        ...targetFields,
    };
    const { user: guest, cat: guestStarter } = guestSeed('uid-guest', {
        pendingTails: 50,
        pawlegendsCatnip: { easy: EASY_CAP },
        pawlegendsFastestWin: { easy: 9000 },
        pawlegendsMatches: { easy: 3, normal: 2 },
        ...guestFields,
    });
    const ctx = createIdentityHarness({
        users: [target, guest],
        cats: [{ _id: targetCat, owner: targetId, name: 'Luna' }, guestStarter],
        games: [
            {
                user: guest._id,
                cat: guest.cat,
                type: GameType.PAWLEGENDS,
                level: 'easy',
                points: EASY_CAP,
                replayDigest: 'g1',
            },
            {
                user: guest._id,
                cat: guest.cat,
                type: GameType.PAWLEGENDS,
                level: 'normal',
                points: 0,
                replayDigest: 'g2',
            },
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
    return { ctx, deps, targetId, guest };
}

async function merge(deps: IGuestLifecycleDeps, guestId: Types.ObjectId, targetId: Types.ObjectId) {
    const claimed = await startGuestMerge(deps, guestId, targetId);
    return claimed ? runGuestMerge(deps, claimed) : null;
}

function account(s: ReturnType<typeof scenario>) {
    const target = s.ctx.users.docs.find(doc => String(doc._id) === String(s.targetId))!;
    return {
        users: s.ctx.users.docs.length,
        tails: target.tails,
        catnipCount: target.catnipCount,
        pawlegendsCatnip: target.pawlegendsCatnip,
        pawlegendsFastestWin: target.pawlegendsFastestWin,
        pawlegendsMatches: target.pawlegendsMatches,
        pawlegendsGamesOfTarget: s.ctx.games.docs.filter(
            game => String(game.user) === String(s.targetId) && game.type === GameType.PAWLEGENDS
        ).length,
        games: s.ctx.games.docs.length,
    };
}

describe('Pawlegends progress in the guest merge (D44)', () => {
    it('carries first-win catnip, fastest win and matches into an account that never played', async () => {
        const s = scenario();

        await merge(s.deps, s.guest._id, s.targetId);

        expect(account(s)).toEqual({
            users: 1,
            tails: 1050,
            catnipCount: 100 + EASY_CAP,
            pawlegendsCatnip: { easy: EASY_CAP },
            pawlegendsFastestWin: { easy: 9000 },
            pawlegendsMatches: { easy: 3, normal: 2 },
            pawlegendsGamesOfTarget: 2,
            games: 2,
        });
    });

    it('a difficulty both accounts claimed pays once; fastest is the min and matches add up', async () => {
        const s = scenario(
            {
                pawlegendsCatnip: { easy: EASY_CAP, normal: NORMAL_CAP, rookie: ROOKIE_CAP },
                pawlegendsFastestWin: { easy: 12000, normal: 15000, rookie: 9500 },
                pawlegendsMatches: { easy: 1, normal: 4, rookie: 1 },
                catnipCount: 100 + EASY_CAP + NORMAL_CAP + ROOKIE_CAP,
            },
            {
                pawlegendsCatnip: { easy: EASY_CAP, normal: NORMAL_CAP, rookie: ROOKIE_CAP },
                pawlegendsFastestWin: { easy: 9000, normal: 16000, rookie: 9200 },
            }
        );

        await merge(s.deps, s.guest._id, s.targetId);

        expect(account(s)).toMatchObject({
            catnipCount: 100 + PAWLEGENDS_TOTAL_CAP,
            pawlegendsCatnip: { easy: EASY_CAP, normal: NORMAL_CAP, rookie: ROOKIE_CAP },
            pawlegendsFastestWin: { easy: 9000, normal: 15000, rookie: 9200 },
        });
    });

    it('adds the difficulty only the guest claimed to the one the account claimed', async () => {
        const s = scenario(
            { pawlegendsCatnip: { normal: NORMAL_CAP }, catnipCount: 100 + NORMAL_CAP },
            { pawlegendsCatnip: { easy: EASY_CAP } }
        );

        await merge(s.deps, s.guest._id, s.targetId);

        expect(account(s)).toMatchObject({
            catnipCount: 100 + EASY_CAP + NORMAL_CAP,
            pawlegendsCatnip: { easy: EASY_CAP, normal: NORMAL_CAP },
        });
    });

    it('clamps an over-cap guest value, ignores junk and keeps catnip within TOTAL_CATNIP_CAP', async () => {
        const s = scenario(
            { catnipChaos: [500] },
            {
                pawlegendsCatnip: { easy: 999, normal: 'x', hard: 500, __proto__x: 7 },
                pawlegendsFastestWin: { easy: -5, normal: PAWLEGENDS_MAX_TICKS + 1, hard: 10 },
                pawlegendsMatches: { easy: 'many', normal: 2.9, hard: 50 },
            }
        );

        await merge(s.deps, s.guest._id, s.targetId);

        const final = account(s);
        expect(final.pawlegendsCatnip).toEqual({ easy: EASY_CAP });
        expect(final.pawlegendsFastestWin).toBeUndefined();
        expect(final.pawlegendsMatches).toEqual({ normal: 2 });
        expect(final.catnipCount).toBe(500 + EASY_CAP);
        expect(final.catnipCount).toBeLessThanOrEqual(TOTAL_CATNIP_CAP);
    });

    it('a guest that lost every match brings its match counts and no catnip', async () => {
        const s = scenario({}, { pawlegendsCatnip: undefined, pawlegendsFastestWin: undefined });

        await merge(s.deps, s.guest._id, s.targetId);

        expect(account(s)).toMatchObject({
            catnipCount: 100,
            pawlegendsCatnip: undefined,
            pawlegendsMatches: { easy: 3, normal: 2 },
        });
    });

    it.each([
        ['a number', 7],
        ['null', null],
        ['an array', [1, 2]],
    ])('repairs a target field stored as %s (as /live does) and finishes', async (_label, broken) => {
        const s = scenario({ pawlegendsCatnip: broken, pawlegendsFastestWin: broken, pawlegendsMatches: broken });

        const result = await merge(s.deps, s.guest._id, s.targetId);

        expect(result?.state).toBe('done');
        expect(account(s)).toMatchObject({
            catnipCount: 100 + EASY_CAP,
            pawlegendsCatnip: { easy: EASY_CAP },
            pawlegendsFastestWin: { easy: 9000 },
            pawlegendsMatches: { easy: 3, normal: 2 },
        });
    });

    it('creates no Game row and writes no score outside the merge (one writer)', async () => {
        const s = scenario();
        const create = jest.spyOn(s.ctx.games as any, 'create');

        await merge(s.deps, s.guest._id, s.targetId);

        expect(create).not.toHaveBeenCalled();
        expect(account(s).games).toBe(2);
        create.mockRestore();
    });

    // A crash at every step boundary, then a retry: the final state equals an uninterrupted merge (no double
    // match count, no double catnip).
    const crashPoints: [string, (s: ReturnType<typeof scenario>) => void][] = [
        ['before the Game rows move', s => failOnce(s.ctx.games, 'updateMany')],
        ['before the Pawlegends $min', s => failOnce(s.ctx.users, 'updateOne', ([, update]) => !!update?.$min)],
        ['inside recomputeGameTotals', s => failOnceRecompute(s)],
        [
            'after the bests merged',
            s => failOnce(s.ctx.users, 'updateOne', ([filter]) => filter?.mergeState === 'gamesMoved'),
        ],
        [
            'after the Tails and match credit',
            s => failOnce(s.ctx.users, 'updateOne', ([filter]) => filter?.mergeState === 'bestsMerged'),
        ],
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

    function failOnceRecompute(s: ReturnType<typeof scenario>) {
        let failed = false;
        const original = s.deps.recomputeTotals;
        s.deps.recomputeTotals = id => {
            if (!failed) {
                failed = true;
                return Promise.reject(new Error('crash in recompute'));
            }
            return original(id);
        };
    }

    it.each(crashPoints)(
        'a retry after a crash %s neither double counts nor loses anything',
        async (_label, inject) => {
            const targetFields = { pawlegendsCatnip: { easy: EASY_CAP }, pawlegendsMatches: { easy: 1 } };
            const reference = scenario(targetFields);
            await merge(reference.deps, reference.guest._id, reference.targetId);

            const s = scenario(targetFields);
            inject(s);
            await expect(merge(s.deps, s.guest._id, s.targetId)).rejects.toThrow(/crash/);
            await merge(s.deps, s.guest._id, s.targetId);
            jest.restoreAllMocks();

            expect(account(s)).toEqual(account(reference));
            expect(account(s)).toMatchObject({
                catnipCount: 100 + EASY_CAP,
                pawlegendsMatches: { easy: 4, normal: 2 },
            });
        }
    );

    it('two parallel merge requests of one guest add the matches once', async () => {
        const s = scenario();

        await Promise.allSettled([merge(s.deps, s.guest._id, s.targetId), merge(s.deps, s.guest._id, s.targetId)]);
        await resumeGuestMerges({ ...s.deps, now: () => new Date(Date.now() + DAY) });

        expect(account(s)).toMatchObject({
            users: 1,
            catnipCount: 100 + EASY_CAP,
            pawlegendsMatches: { easy: 3, normal: 2 },
        });
    });
});

describe('pawlegends-merge helpers', () => {
    it('pawlegendsBestsUpdate clamps catnip to each cap and keeps valid ticks only', () => {
        expect(
            pawlegendsBestsUpdate({
                pawlegendsCatnip: { easy: 5.7, normal: 1e9 },
                pawlegendsFastestWin: { easy: 0, normal: 1234.9 },
            })
        ).toEqual({
            $max: { 'pawlegendsCatnip.easy': 5, 'pawlegendsCatnip.normal': NORMAL_CAP },
            $min: { 'pawlegendsFastestWin.normal': 1234 },
        });
        expect(pawlegendsBestsUpdate({})).toBeNull();
        expect(pawlegendsBestsUpdate({ pawlegendsCatnip: [20, 40], pawlegendsFastestWin: 'x' })).toBeNull();
    });

    it('pawlegendsMatchesInc reads only known difficulties with positive counts', () => {
        expect(pawlegendsMatchesInc({ pawlegendsMatches: { easy: 2, normal: -1, hard: 3 } })).toEqual({
            'pawlegendsMatches.easy': 2,
        });
        expect(pawlegendsMatchesInc({ pawlegendsMatches: null })).toEqual({});
    });

    it('pawlegendsFieldRepair resets only fields that are not sub-documents', () => {
        expect(pawlegendsFieldRepair({ pawlegendsCatnip: { easy: 20 }, pawlegendsMatches: 3 })).toEqual({
            pawlegendsMatches: {},
        });
        expect(pawlegendsFieldRepair({})).toBeNull();
        expect(pawlegendsFieldRepair(null)).toBeNull();
    });
});
