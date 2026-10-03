import { model, models } from 'mongoose';
import { NOT_GUEST_FILTER } from 'src/common/decorators/auth-user.decorator';
import { GUEST_ALLOW_LIST } from 'src/common/guards/guest-allow-list';
import { UserController } from './user.controller';
import { UserSchema } from './user.schema';

// The real services pull in Mongoose models, AI and wallet code; the boards only use the repository.
jest.mock('./user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * Guests never rank or earn from a board (plan F5, G1). `POST /user/catbassadors/live` is guest
 * allowed and keeps a guest's scores (the merge carries them into the account, F5.2), so every board
 * query excludes guests instead. Must hold before task 2a creates the first guest document.
 */

const USER_ID = '65f000000000000000000001';

function createController() {
    const filters: Record<string, unknown[]> = {
        find: [],
        count: [],
        modelFind: [],
        countDocuments: [],
        updateMany: [],
    };
    const chain = (rows: unknown) => {
        const query: any = {
            sort: () => query,
            limit: () => query,
            maxTimeMS: () => query,
            lean: () => query,
            exec: async () => rows,
        };
        return query;
    };
    const controller = Object.create(UserController.prototype);
    controller.pawMatchLeaderboardCache = new Map();
    controller.repository = {
        find: jest.fn(async (params: any) => (filters.find.push(params.searchObject), [])),
        count: jest.fn(async (filter: unknown) => (filters.count.push(filter), 0)),
        findOne: jest.fn(async () => ({ _id: USER_ID, name: 'Me', tails: 5, catnipCount: 5, match3Score: [7] })),
        model: {
            find: jest.fn((filter: unknown) => (filters.modelFind.push(filter), chain([]))),
            countDocuments: jest.fn((filter: unknown) => (filters.countDocuments.push(filter), chain(0))),
            updateMany: jest.fn(async (filter: unknown) => (filters.updateMany.push(filter), {})),
        },
    };
    return { controller, filters };
}

const excludesGuests = (filter: any) => expect(filter).toEqual(expect.objectContaining(NOT_GUEST_FILTER));

describe('guests never appear on boards (hotfix before task 2a)', () => {
    it('/live is still guest allowed, so the boards must filter guests', () => {
        expect(GUEST_ALLOW_LIST['POST /user/catbassadors/live']).toBeDefined();
        expect(NOT_GUEST_FILTER).toEqual({ isGuest: { $ne: true } });
    });

    it('Tails, catnip and catbassadors top lists exclude guests', async () => {
        const { controller, filters } = createController();
        await controller.leaderboard();
        await controller.leaderboardCatnip();
        await controller.Tleaderboard();

        expect(filters.find).toHaveLength(3);
        filters.find.forEach(excludesGuests);
        expect(filters.find[1]).toEqual({
            catnipCount: { $lte: expect.any(Number) },
            ...NOT_GUEST_FILTER,
            // Flagged accounts are off every board too (G5, decision #35).
            boardExcludedAt: { $exists: false },
            // Deleted ("Deleted player") accounts too (4e review fix #2).
            deletedAt: { $exists: false },
        });
    });

    it('the weekly top-200 reward reads the guest-free Tails board', async () => {
        const { controller, filters } = createController();
        await controller.leaderboard(200);
        excludesGuests(filters.find[0]);
    });

    it('Paw Match board and every position query exclude guests', async () => {
        const { controller, filters } = createController();
        await controller.leaderboardPawMatch('1', undefined);
        await controller.position(USER_ID);
        await controller.positionCatnip(USER_ID);
        await controller.leaderboardPawMatchPosition('1', USER_ID);

        expect(filters.modelFind).toHaveLength(2);
        filters.modelFind.forEach(excludesGuests);
        expect(filters.count).toHaveLength(2);
        filters.count.forEach(excludesGuests);
        expect(filters.countDocuments).toHaveLength(1);
        filters.countDocuments.forEach(excludesGuests);
    });

    it('the one-off catnip Tails grant skips guests', async () => {
        const { controller, filters } = createController();
        await controller.giveTails();
        excludesGuests(filters.updateMany[0]);
    });

    it('Mongoose keeps the isGuest filter (the path is declared, so strictQuery does not strip it)', () => {
        const User = models.GuestBoardsUser || model('GuestBoardsUser', UserSchema);
        const cast = User.find({ tails: { $gt: 1 }, ...NOT_GUEST_FILTER }).cast();
        expect(cast).toEqual({ tails: { $gt: 1 }, isGuest: { $ne: true } });
    });
});
