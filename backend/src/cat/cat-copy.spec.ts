import { Types } from 'mongoose';
import { BlessingStatus } from 'src/blessing/blessing.schema';
import { PACK_SHELTER_IDS } from 'src/blessing/featured-shelters';
import { CAT_UNIQUE_INDEXES, MemoryModel, memoryRepository } from 'src/user/guest/memory-model.helper-spec';
import { PackType } from 'src/web3/order.schema';
import { Tier } from './cat.schema';
import { buildCatCopy, CAT_COPY_STRIPPED_FIELDS, CatService } from './cat.service';

jest.mock('src/shared/utils/ai.utils', () => ({ generateCat: jest.fn() }));
jest.mock('src/shared/utils/ai-avatar', () => ({ generateAvatarFromImage: jest.fn() }));
jest.mock('src/user/user.service', () => ({ UserService: class {}, generateRandomNumber: () => 1 }));
jest.mock('node-fetch', () => jest.fn());

/*
 * Plan G3 "Explicit fixes" and section 7:
 * - ownership dedupe by blessing or sourceCat, never by name (cat.controller.ts:196, cat.service.ts:86);
 * - pack and redeem copies never inherit starter flags and carry origin and sourceCat (the spread at
 *   cat.service.ts:27-39);
 * - the pack pool excludes owned, ADOPTED and HEAVEN cats, and an empty pool is null, never a crash.
 */

const userId = new Types.ObjectId();
const blessingX = new Types.ObjectId();
const look = { spriteImg: 'https://tokentails.com/cats/black/sprites/x.png', catImg: 'https://cdn/x.gif' };

const catalogue = (fields: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    name: 'Luna',
    type: 'ICE',
    tier: Tier.COMMON,
    status: { EAT: 0 },
    resqueStory: 'A real cat from Pink Paw',
    ...look,
    ...fields,
});

function setup(cats: Record<string, unknown>[] = []) {
    // The schema's unique partial indexes: starter_per_owner and copy_per_owner_source.
    const catModel = new MemoryModel(cats, [
        ...CAT_UNIQUE_INDEXES,
        { fields: ['owner', 'sourceCat'], partial: { sourceCat: { $exists: true } } },
    ]);
    const userModel = new MemoryModel([{ _id: userId, name: 'Player', cats: [] }]);
    const repository = { ...memoryRepository(catModel), model: catModel };
    const userRepository = { ...memoryRepository(userModel), model: userModel };
    const aggregate = jest.fn<Promise<any[]>, [unknown]>(async () => []);
    const service = new CatService(
        repository as any,
        userRepository as any,
        { model: { aggregate: (pipeline: any) => ({ exec: () => aggregate(pipeline) }) } } as any,
        {} as any,
        {} as any
    );
    return { service, catModel, userModel, aggregate };
}

const ownedBy = (model: MemoryModel) => model.docs.filter(doc => String(doc.owner) === String(userId));

describe('buildCatCopy', () => {
    it('strips identity, ownership and every starter flag, and records origin and source', () => {
        const source = catalogue({
            owner: new Types.ObjectId(),
            isStarter: true,
            isGuestStarter: true,
            starterLockedAt: new Date(),
            starterBreed: 'SCOUT',
            nameChangedAt: new Date(),
            renameOffer: true,
            staked: new Date(),
            releasedAt: new Date(),
            releasedSourceCat: new Types.ObjectId(),
            origin: 'starter',
            sourceCat: new Types.ObjectId(),
            blessing: blessingX,
        });
        const owner = new Types.ObjectId();

        const copy = buildCatCopy(source, { owner, tier: Tier.RARE, packType: PackType.STARTER, origin: 'pack' });

        for (const field of [
            'isStarter',
            'isGuestStarter',
            'starterLockedAt',
            'starterBreed',
            'nameChangedAt',
            'renameOffer',
            'staked',
            'releasedAt',
            'releasedSourceCat',
        ]) {
            expect(copy).not.toHaveProperty(field);
        }
        expect(copy).toMatchObject({
            owner,
            tier: Tier.RARE,
            packType: PackType.STARTER,
            packed: true,
            isBlueprint: false,
            origin: 'pack',
            blessing: blessingX,
            name: 'Luna',
        });
        expect(String(copy.sourceCat)).toBe(String(source._id));
        expect(String(copy._id)).not.toBe(String(source._id));
        expect(CAT_COPY_STRIPPED_FIELDS).toEqual(
            expect.arrayContaining(['isStarter', 'isGuestStarter', 'starterLockedAt'])
        );
    });

    it('never inherits the minted token, the token id or the redeem code', () => {
        const source = catalogue({
            token: { stellar: 'minted-asset' },
            tokenId: 987654,
            nftId: 'nft-1',
            code: 'secret-redeem-code',
        });

        const copy = buildCatCopy(source, { owner: new Types.ObjectId(), origin: 'redeem' });

        expect(copy).not.toHaveProperty('token');
        expect(copy).not.toHaveProperty('nftId');
        expect(copy).not.toHaveProperty('code');
        // A fresh token id (generateRandomNumber is mocked to 1), so GET /cat/nft/:tokenId is one cat.
        expect(copy.tokenId).toBe(1);
        expect(CAT_COPY_STRIPPED_FIELDS).toEqual(expect.arrayContaining(['token', 'tokenId', 'nftId', 'code']));
    });
});

describe('CatService.adopt ownership dedupe', () => {
    it('a starter named "Luna" does not block adopting a real Luna', async () => {
        const realLuna = catalogue({ blessing: blessingX });
        const { service, catModel } = setup([
            { _id: new Types.ObjectId(), name: 'Luna', owner: userId, isStarter: true, starterLockedAt: new Date() },
            realLuna,
        ]);

        const result = await service.adopt(realLuna._id, String(userId), Tier.COMMON, PackType.STARTER, 'pack');

        expect(result.success).toBe(true);
        expect(ownedBy(catModel)).toHaveLength(2);
    });

    it('owning Blessing X blocks adopting X twice, also through another catalogue row of X', async () => {
        const x = catalogue({ blessing: blessingX });
        const xDuplicate = catalogue({ blessing: blessingX, name: 'Luna (copy)' });
        const { service, catModel } = setup([x, xDuplicate]);

        await expect(service.adopt(x._id, String(userId), undefined, undefined, 'pack')).resolves.toMatchObject({
            success: true,
        });
        await expect(service.adopt(x._id, String(userId))).resolves.toEqual({
            success: false,
            message: 'User already owns this NFT cat',
        });
        await expect(service.adopt(xDuplicate._id, String(userId))).resolves.toMatchObject({ success: false });
        expect(ownedBy(catModel)).toHaveLength(1);
    });

    it('two parallel adopts of the same cat give one copy: the unique index refuses the second', async () => {
        const x = catalogue();
        const { service, catModel } = setup([x]);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const results = await Promise.all([
            service.adopt(x._id, String(userId), undefined, undefined, 'redeem'),
            service.adopt(x._id, String(userId), undefined, undefined, 'redeem'),
        ]);

        expect(results.filter(result => result.success)).toHaveLength(1);
        expect(results.filter(result => !result.success)).toEqual([
            { success: false, message: 'User already owns this NFT cat' },
        ]);
        expect(ownedBy(catModel)).toHaveLength(1);
        // Both passed ownsCopyOf: the second copy reached the database and was refused there.
        expect(catModel.calls.filter(call => call === 'create')).toHaveLength(2);
        expect(console.error).not.toHaveBeenCalled();
    });

    it('a different cat with the same name as an owned one is still adoptable', async () => {
        const first = catalogue({ blessing: blessingX });
        const otherLuna = catalogue({ blessing: new Types.ObjectId() });
        const { service } = setup([first, otherLuna]);

        await service.adopt(first._id, String(userId));
        await expect(service.adopt(otherLuna._id, String(userId))).resolves.toMatchObject({ success: true });
    });

    it('dedupes a cat without a blessing by source cat, and legacy copies by their exact look', async () => {
        const redeemCat = catalogue({ name: 'Gamenight' });
        const { service, catModel } = setup([redeemCat]);

        await expect(
            service.adopt(redeemCat._id, String(userId), undefined, undefined, 'redeem')
        ).resolves.toMatchObject({
            success: true,
        });
        await expect(service.adopt(redeemCat._id, String(userId))).resolves.toMatchObject({ success: false });

        // A copy made before `sourceCat` existed: same name and look, no sourceCat.
        const legacyOwner = setup([
            redeemCat,
            { _id: new Types.ObjectId(), name: 'Gamenight', ...look, owner: userId },
        ]);
        await expect(legacyOwner.service.adopt(redeemCat._id, String(userId))).resolves.toMatchObject({
            success: false,
        });
        expect(ownedBy(catModel)[0]).toMatchObject({ origin: 'redeem' });
    });

    it('a starter that looks like a catalogue cat does not count as a legacy copy', async () => {
        const redeemCat = catalogue({ name: 'Scout' });
        const { service } = setup([
            redeemCat,
            { _id: new Types.ObjectId(), name: 'Scout', ...look, owner: userId, isStarter: true },
        ]);

        await expect(service.adopt(redeemCat._id, String(userId))).resolves.toMatchObject({ success: true });
    });

    it('never copies a starter, and pack copies never inherit starter flags', async () => {
        const someonesStarter = catalogue({ isStarter: true, owner: new Types.ObjectId() });
        const leaky = catalogue({
            blessing: blessingX,
            starterLockedAt: new Date(),
            starterBreed: 'MISTY',
            renameOffer: true,
        });
        const { service, catModel } = setup([someonesStarter, leaky]);

        await expect(service.adopt(someonesStarter._id, String(userId))).resolves.toEqual({
            success: false,
            message: 'This cat can not be adopted',
        });
        await service.adopt(leaky._id, String(userId), Tier.EPIC, PackType.INFLUENCER, 'pack');
        const [copy] = ownedBy(catModel);
        expect(copy).toMatchObject({ origin: 'pack', tier: Tier.EPIC, packType: PackType.INFLUENCER });
        expect(String(copy.sourceCat)).toBe(String(leaky._id));
        ['isStarter', 'isGuestStarter', 'starterLockedAt', 'starterBreed', 'renameOffer'].forEach(field =>
            expect(copy).not.toHaveProperty(field)
        );
    });

    it('answers "not found" for invalid ids instead of throwing', async () => {
        const { service } = setup();
        await expect(service.adopt('not-an-id', String(userId))).resolves.toMatchObject({ success: false });
    });
});

describe('CatService.pickPackCat', () => {
    it('samples rescue blessings that are not ADOPTED, HEAVEN or already owned', async () => {
        const ownedSource = new Types.ObjectId();
        const { service, aggregate } = setup([
            { _id: new Types.ObjectId(), owner: userId, blessing: blessingX, sourceCat: ownedSource, name: 'Owned' },
            { _id: new Types.ObjectId(), owner: userId, isStarter: true, name: 'Starter' },
        ]);
        const picked = new Types.ObjectId();
        aggregate.mockResolvedValueOnce([{ cat: picked }]);

        await expect(service.pickPackCat(userId, PackType.STARTER)).resolves.toBe(picked);

        const [match, lookup, exists, sample] = (aggregate.mock.calls[0] as any)[0];
        expect(match.$match.status).toEqual({ $nin: [BlessingStatus.ADOPTED, BlessingStatus.HEAVEN] });
        expect(match.$match.$or).toEqual(expect.arrayContaining([{ kind: 'rescue' }]));
        expect(match.$match._id.$nin.map(String)).toEqual([String(blessingX)]);
        expect(match.$match.cat.$nin.map(String)).toEqual([String(ownedSource)]);
        expect(match.$match.shelter.$in.map(String).sort()).toEqual(
            [PACK_SHELTER_IDS.catfluencers, PACK_SHELTER_IDS.pinkPaw].sort()
        );
        expect(lookup.$lookup).toMatchObject({ localField: 'cat', foreignField: '_id' });
        expect(exists.$match).toEqual({ 'catDoc.0': { $exists: true }, 'catDoc.isStarter': { $ne: true } });
        expect(sample).toEqual({ $sample: { size: 1 } });
    });

    it('uses only the catfluencers for the influencer pack', async () => {
        const { service, aggregate } = setup();
        await service.pickPackCat(userId, PackType.INFLUENCER);
        expect((aggregate.mock.calls[0] as any)[0][0].$match.shelter.$in.map(String)).toEqual([
            PACK_SHELTER_IDS.catfluencers,
        ]);
    });

    it('also excludes the catalogue cats passed in, for the retry after a failed grant', async () => {
        const failed = new Types.ObjectId();
        const { service, aggregate } = setup();
        await service.pickPackCat(userId, PackType.STARTER, [failed, 'not-an-id']);
        expect((aggregate.mock.calls[0] as any)[0][0].$match.cat.$nin.map(String)).toEqual([String(failed)]);
    });

    it('returns null for an empty pool', async () => {
        const { service } = setup();
        await expect(service.pickPackCat(userId, PackType.LEGENDARY)).resolves.toBeNull();
    });
});

describe('GET /cat/gift/:catId/:userId and redeem', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CatController, SELF_ADOPT_RETIRED_MESSAGE } = require('./cat.controller');

    it('a gift adds the cat through the blessing dedupe and never touches spent', async () => {
        const realLuna = catalogue({ blessing: blessingX });
        const { service, userModel } = setup([
            { _id: new Types.ObjectId(), name: 'Luna', owner: userId, isStarter: true },
            realLuna,
        ]);
        const userRepository = { update: jest.fn(async () => ({})) };
        const controller = new CatController({} as any, userRepository as any, service, {} as any);

        await expect(controller.gift(String(realLuna._id), String(userId))).resolves.toMatchObject({ success: true });
        await expect(controller.gift(String(realLuna._id), String(userId))).resolves.toEqual({
            success: false,
            message: 'User already owns this NFT cat',
        });
        expect(userRepository.update).toHaveBeenCalledTimes(1);
        expect(userRepository.update).toHaveBeenCalledWith(String(userId), { $inc: { monthCatsAdopted: 1 } });
        expect(userModel.docs[0].spent).toBeUndefined();
    });

    it('GET /cat/adopt/:_id never copies a cat: paid catalogue cats, reward templates and portraits stay put', async () => {
        const paid = catalogue({ blessing: blessingX, isBlueprint: true });
        const template = catalogue({ name: 'Quest Cat', isBlueprint: true });
        const portrait = catalogue({ name: 'My Pet', owner: new Types.ObjectId(), origin: 'portrait' });
        const { service, catModel } = setup([paid, template, portrait]);
        const adopt = jest.spyOn(service, 'adopt');
        const controller = new CatController({} as any, {} as any, service, {} as any);
        for (const cat of [paid, template, portrait]) {
            await expect(controller.adopt(String(cat._id), String(userId))).resolves.toEqual({
                success: false,
                message: SELF_ADOPT_RETIRED_MESSAGE,
            });
        }
        expect(adopt).not.toHaveBeenCalled();
        expect(ownedBy(catModel)).toHaveLength(0);
    });

    it('a redeemed cat is marked origin redeem', async () => {
        const adopt = jest.fn(async () => ({ success: true, message: 'ok', cat: { _id: 'c' } }));
        const controller = new CatController({} as any, {} as any, { adopt } as any, {} as any);
        await controller.redeemCat(String(userId), 'GameNight');
        expect(adopt).toHaveBeenCalledWith('6901f2b47393705e27bc6562', String(userId), undefined, undefined, 'redeem');
    });
});
