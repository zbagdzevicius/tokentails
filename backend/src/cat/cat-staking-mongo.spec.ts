import mongoose, { Connection, Model, Types } from 'mongoose';
import { UserRepository } from 'src/user/user.repository';
import { UserSchema } from 'src/user/user.schema';
import { CatStakingService, getTailsCraft, STAKE_PERIOD_MS } from './cat-staking.service';
import { CatRepository } from './cat.repository';
import { CatSchema, Tier } from './cat.schema';

/*
 * CatStakingService against a REAL MongoDB (opt-in). `cat-staking.service.spec.ts` checks the filter
 * logic against an in-memory model; this one checks that MongoDB evaluates the same filters
 * (`staked: null`, `$exists`/`$ne`/`$lte`) and that parallel claims race on one document the way the
 * W1 hotfix relies on.
 *
 * Skipped unless MONGO_IT_URI (or IDENTITY_SPEC_MONGO_URL, the older name) is set. It creates and
 * drops its own scratch database, so it is safe next to a local dev server:
 *
 *   MONGO_IT_URI=mongodb://localhost:27017 npx jest src/cat/cat-staking-mongo.spec.ts
 */

const url = process.env.MONGO_IT_URI || process.env.IDENTITY_SPEC_MONGO_URL;
const maybe = url ? describe : describe.skip;

maybe('CatStakingService on a real MongoDB', () => {
    jest.setTimeout(60000);
    let connection: Connection;
    let cats: Model<any>;
    let users: Model<any>;
    let service: CatStakingService;

    beforeAll(async () => {
        connection = await mongoose
            .createConnection(url!, { dbName: `tt_staking_spec_${new Types.ObjectId().toString()}` })
            .asPromise();
        cats = connection.model('Cat', CatSchema);
        users = connection.model('User', UserSchema);
        await Promise.all([cats.init(), users.init()]);
        service = new CatStakingService(new CatRepository(cats as any), new UserRepository(users as any));
    });

    afterAll(async () => {
        await connection?.db?.dropDatabase();
        await connection?.close();
    });

    beforeEach(async () => {
        await Promise.all([cats.deleteMany({}), users.deleteMany({})]);
    });

    const seed = async (cat: Record<string, unknown> = {}) => {
        const owner = new Types.ObjectId();
        await users.collection.insertOne({ _id: owner, tails: 0, monthTailsCrafted: 0, monthTails: 0 });
        const catId = new Types.ObjectId();
        await cats.collection.insertOne({ _id: catId, owner, name: 'Mia', tier: Tier.RARE, ...cat });
        return { owner, catId };
    };

    it('five parallel claims of one finished stake credit once', async () => {
        const blessing = new Types.ObjectId();
        const { owner, catId } = await seed({ blessing, staked: new Date(Date.now() - 1000) });
        const expected = getTailsCraft({ blessing, tier: Tier.RARE } as any);

        const results = await Promise.all(
            Array.from({ length: 5 }, () => service.claim(String(catId), owner).catch(error => error))
        );

        const paid = results.filter(result => result?.success === true);
        expect(paid).toHaveLength(1);
        expect(paid[0].tails).toBe(expected);
        // The losers find the cat no longer staked.
        expect(results.filter(result => result?.status === 400)).toHaveLength(4);

        const user = await users.collection.findOne({ _id: owner });
        expect(user).toMatchObject({
            tails: expected,
            tailsEarned: expected,
            monthTailsCrafted: expected,
            monthTails: expected,
        });
        expect(user).not.toHaveProperty('staked');
        const cat = await cats.collection.findOne({ _id: catId });
        expect(cat).not.toHaveProperty('staked');
    });

    it('stake matches a missing and a null `staked`, and a second stake is 409', async () => {
        const { owner, catId } = await seed();
        const nullCat = await seed({ staked: null });
        const now = new Date();

        await expect(service.stake(String(catId), owner, now)).resolves.toMatchObject({ success: true });
        await expect(service.stake(String(nullCat.catId), nullCat.owner, now)).resolves.toMatchObject({
            success: true,
        });
        const stored = await cats.collection.findOne({ _id: catId });
        expect(stored?.staked?.getTime()).toBe(now.getTime() + STAKE_PERIOD_MS);

        const parallel = await Promise.all(
            Array.from({ length: 3 }, () => service.stake(String(catId), owner, now).catch(error => error))
        );
        expect(parallel.every(result => result?.status === 409)).toBe(true);
        const user = await users.collection.findOne({ _id: owner });
        expect(user).not.toHaveProperty('staked');
    });

    it("another user's cat is 404 for stake and claim, and nothing is written", async () => {
        const { catId } = await seed({ staked: new Date(Date.now() - 1000) });
        const stranger = new Types.ObjectId();

        await expect(service.claim(String(catId), stranger)).rejects.toMatchObject({ status: 404 });
        await expect(service.stake(String(catId), stranger)).rejects.toMatchObject({ status: 404 });
        const cat = await cats.collection.findOne({ _id: catId });
        expect(cat?.staked).toBeInstanceOf(Date);
    });

    it('a running stake pays nothing and keeps `staked`', async () => {
        const { owner, catId } = await seed({ staked: new Date(Date.now() + 60000) });

        await expect(service.claim(String(catId), owner)).resolves.toEqual(
            expect.objectContaining({ success: false, tails: 0 })
        );
        const cat = await cats.collection.findOne({ _id: catId });
        expect(cat?.staked).toBeInstanceOf(Date);
        const user = await users.collection.findOne({ _id: owner });
        expect(user?.tails).toBe(0);
    });

    it('cat nap (G5 P2): ten parallel stakes of ten cats leave at most 3 napping', async () => {
        const owner = new Types.ObjectId();
        await users.collection.insertOne({ _id: owner, tails: 0 });
        const ids = Array.from({ length: 10 }, () => new Types.ObjectId());
        await cats.collection.insertMany(ids.map(_id => ({ _id, owner, name: 'Nap', tier: Tier.COMMON })));

        const results = await Promise.allSettled(ids.map(id => service.stake(String(id), owner)));

        const napping = await cats.collection.countDocuments({ owner, staked: { $exists: true, $ne: null } });
        expect(napping).toBeLessThanOrEqual(3);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(napping);
        // Sequential stakes then fill the remaining slots, and the 4th is refused.
        for (const id of ids) {
            await service.stake(String(id), owner).catch(() => undefined);
        }
        expect(await cats.collection.countDocuments({ owner, staked: { $exists: true, $ne: null } })).toBe(3);
    });
});
