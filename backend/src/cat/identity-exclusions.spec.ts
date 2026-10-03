import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppController } from 'src/app.controller';
import { MemoryModel, memoryRepository } from 'src/user/guest/memory-model.helper-spec';
import { UserRepository } from 'src/user/user.repository';
import { CatController } from './cat.controller';

// The real CatService pulls in AI and image utilities; these routes do not use it.
jest.mock('./cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * Decision #13 and G1: public traction counts, public cat pages and NFT metadata exclude guests and
 * guest starter cats; guests are reported apart as `guestSessions`.
 */

const owner = new Types.ObjectId();
const guestId = new Types.ObjectId();

function stores() {
    const users = new MemoryModel([
        { _id: owner, name: 'Registered', isGuest: false },
        { _id: new Types.ObjectId(), name: 'Legacy' },
        { _id: guestId, name: 'Guest', isGuest: true },
        { _id: new Types.ObjectId(), name: 'Guest 2', isGuest: true },
    ]);
    const cats = new MemoryModel([
        { _id: new Types.ObjectId(), name: 'Luna', owner, tokenId: 11, resqueStory: 'real', catImg: 'luna.gif' },
        { _id: new Types.ObjectId(), name: 'Scout', owner, isStarter: true, tokenId: 12 },
        {
            _id: new Types.ObjectId(),
            name: 'Guest Scout',
            owner: guestId,
            isStarter: true,
            isGuestStarter: true,
            tokenId: 13,
            catImg: 'guest.gif',
        },
        { _id: new Types.ObjectId(), name: 'Staked', owner, staked: new Date() },
    ]);
    return { users, cats };
}

describe('traction counts (GET /count)', () => {
    afterEach(() => delete process.env.IDENTITY_BACKFILL_DONE);

    it('count registered users and non-guest cats; guests are reported as guestSessions', async () => {
        const { users, cats } = stores();
        const weekly = jest.fn(async () => []);
        const repo = (model: MemoryModel) => ({ ...memoryRepository(model), weeklyCount: weekly });
        const controller = new AppController(
            repo(new MemoryModel()) as any,
            repo(cats) as any,
            repo(users) as any,
            repo(new MemoryModel([{ status: 'COMPLETE' }])) as any
        );

        await controller.refreshCounts();
        const final = await controller.getCounts();

        // Registered plus legacy (no isGuest field); the two guests are not users.
        expect(final.users.count).toBe(2);
        expect(final.cats).toEqual({ count: 3, staked: 1 });
        expect(final.guestSessions).toBe(2);
    });

    it('the weekly sign-up buckets exclude guests', async () => {
        const aggregate = jest.fn(async () => []);
        const repository = new UserRepository({ aggregate } as any);

        await repository.weeklyCount();

        const pipeline = (aggregate.mock.calls[0] as any)[0];
        expect(pipeline[0].$match).toMatchObject({ isGuest: { $ne: true } });
        process.env.IDENTITY_BACKFILL_DONE = 'true';
        await repository.weeklyCount();
        expect((aggregate.mock.calls[1] as any)[0][0].$match).toMatchObject({ isGuest: false });
    });
});

describe('public cat routes', () => {
    function controller() {
        const { cats: model } = stores();
        return { model, cats: new CatController(memoryRepository(model) as any, {} as any, {} as any, {} as any) };
    }

    it("GET /cat/:id is 404 for a guest's starter and works for registered cats", async () => {
        const { cats, model } = controller();
        const guestCat = model.docs.find(cat => cat.isGuestStarter)!;
        const luna = model.docs.find(cat => cat.name === 'Luna')!;

        await expect(cats.findOne(String(guestCat._id))).rejects.toBeInstanceOf(NotFoundException);
        await expect(cats.findOne(String(luna._id))).resolves.toMatchObject({ name: 'Luna' });
    });

    it('NFT metadata never describes a guest starter', async () => {
        const { cats } = controller();

        await expect(cats.nftId('13')).resolves.toEqual({
            name: undefined,
            description: undefined,
            image: 'https://tokentails.com/logo/logo.webp',
        });
        await expect(cats.nftId(11 as any)).resolves.toMatchObject({ name: 'Luna', image: 'luna.gif' });
    });
});
