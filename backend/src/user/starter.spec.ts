import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import mongoose, { Connection, Model, Types } from 'mongoose';
import { BlessingRepository } from 'src/blessing/blessing.repository';
import { BlessingSchema, BlessingStatus, PORTRAIT_SHELTER_ID } from 'src/blessing/blessing.schema';
import { PACK_SHELTER_IDS } from 'src/blessing/featured-shelters';
import { CatNameService } from 'src/cat/cat-name.service';
import { CatRepository } from 'src/cat/cat.repository';
import { CatSchema } from 'src/cat/cat.schema';
import { CatService } from 'src/cat/cat.service';
import { ImageSchema } from 'src/image/image.schema';
import { ShelterSchema } from 'src/shelter/shelter.schema';
import { ALLOW_GUEST_KEY } from 'src/common/decorators/allow-guest.decorator';
import { GUEST_ALLOW_LIST } from 'src/common/guards/guest-allow-list';
import { ErrorCode } from 'src/shared-contracts/errors';
import { StarterBreed } from 'src/shared-contracts/enums';
import { PackType } from 'src/web3/order.schema';
import { ensureStarterCat, STARTER_ART } from './guest/starter';
import { CAT_UNIQUE_INDEXES, MemoryModel, memoryRepository } from './guest/memory-model.helper-spec';
import { StarterController } from './starter.controller';
import { UserRepository } from './user.repository';
import { FOLLOWING_LIMIT, ONBOARDING_VERSION, UserSchema } from './user.schema';

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('src/shared/encryption.service', () => ({
    EncryptionService: class {
        encrypt = () => ({ iv: 'iv', content: 'secret' });
    },
}));
jest.mock('src/shared/utils/ai.utils', () => ({ generateCat: jest.fn() }));
jest.mock('src/shared/utils/ai-avatar', () => ({ generateAvatarFromImage: jest.fn() }));

/*
 * Plan G3 acceptance, server side: POST /user/starter (one atomic commit, 409 STARTER_LOCKED after,
 * never targets user.cat), the follow routes, and the allow-list. The opt-in block at the end runs
 * the commit race and the pack pool on a real MongoDB.
 */

const userId = new Types.ObjectId();

async function setup({
    onboarding = { state: 'pending', version: ONBOARDING_VERSION } as Record<string, unknown> | undefined,
    starter = 'new' as 'new' | 'guest' | 'locked' | 'none',
    reserved = [] as string[],
    blessings = [] as Record<string, unknown>[],
} = {}) {
    const users = new MemoryModel([{ _id: userId, name: 'Player', cats: [], ...(onboarding ? { onboarding } : {}) }]);
    const cats = new MemoryModel([], CAT_UNIQUE_INDEXES);
    const blessingModel = new MemoryModel(blessings);
    if (starter !== 'none') {
        await ensureStarterCat(cats as any, users as any, userId, {
            guest: starter === 'guest',
            locked: starter === 'locked',
        });
    }
    const featured = { reservedNames: async () => reserved };
    const names = new CatNameService({ model: cats } as any, { model: new MemoryModel() } as any, featured as any);
    const controller = new StarterController(
        { ...memoryRepository(users), model: users } as any,
        { ...memoryRepository(cats), model: cats } as any,
        { ...memoryRepository(blessingModel), model: blessingModel } as any,
        names
    );
    const now = new Date('2026-10-01T12:00:00Z');
    controller.now = () => now;
    return { controller, users, cats, now };
}

const user = (users: MemoryModel) => users.docs.find(doc => String(doc._id) === String(userId))!;
const starterOf = (cats: MemoryModel) => cats.docs.find(doc => doc.isStarter)!;

describe('POST /user/starter', () => {
    it('commits breed, look and name, and marks onboarding done', async () => {
        const { controller, users, cats, now } = await setup();

        const result = await controller.commitStarter(String(userId), { breed: StarterBreed.MISTY, name: ' Nimbus ' });

        expect(result.cat).toMatchObject({ name: 'Nimbus', starterBreed: 'MISTY', starterLockedAt: now });
        expect(starterOf(cats)).toMatchObject({
            name: 'Nimbus',
            starterBreed: 'MISTY',
            spriteImg: STARTER_ART.MISTY.spriteImg,
            catImg: STARTER_ART.MISTY.catImg,
            origin: 'starter',
            starterLockedAt: now,
        });
        expect(user(users).onboarding).toEqual({
            state: 'done',
            starterChosenAt: now,
            skipped: false,
            version: ONBOARDING_VERSION,
        });
    });

    it('ten concurrent commits give one update and nine 409 STARTER_LOCKED', async () => {
        const { controller, cats } = await setup();
        const names = ['Nimbus', 'Comet', 'Pebble', 'Biscuit', 'Mochi', 'Olive', 'Pepper', 'Ziggy', 'Mango', 'Tofu'];

        const results = await Promise.allSettled(
            names.map((name, index) =>
                controller.commitStarter(String(userId), {
                    breed: index % 2 ? StarterBreed.SUNNY : StarterBreed.SHADOW,
                    name,
                })
            )
        );

        const fulfilled = results.filter(result => result.status === 'fulfilled');
        const rejected = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(9);
        rejected.forEach(({ reason }) => {
            expect(reason).toBeInstanceOf(ConflictException);
            expect(reason.getResponse()).toMatchObject({ code: ErrorCode.STARTER_LOCKED });
        });
        const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value.cat;
        expect(starterOf(cats)).toMatchObject({ name: winner.name, starterBreed: winner.starterBreed });
        expect(cats.docs.filter(doc => doc.isStarter)).toHaveLength(1);
    });

    it('a retry after success is a safe 409', async () => {
        const { controller, users } = await setup();
        await controller.commitStarter(String(userId), { breed: StarterBreed.PINKIE, name: 'Rosie' });

        await expect(controller.commitStarter(String(userId), { breed: StarterBreed.SCOUT })).rejects.toBeInstanceOf(
            ConflictException
        );
        expect(user(users).onboarding.state).toBe('done');
    });

    it('a 409 heals onboarding left pending by a crash between the two writes', async () => {
        const { controller, users, cats } = await setup();
        starterOf(cats).starterLockedAt = new Date('2026-09-01');

        await expect(controller.commitStarter(String(userId), { breed: StarterBreed.SCOUT })).rejects.toBeInstanceOf(
            ConflictException
        );
        expect(user(users).onboarding).toMatchObject({ state: 'done' });
    });

    it('existing users get 409: legacy accounts, createUser and manager starters', async () => {
        for (const starter of ['none', 'locked'] as const) {
            const { controller, cats } = await setup({ onboarding: null as any, starter });
            const before = JSON.stringify(cats.docs);

            const error = await controller.commitStarter(String(userId), { breed: StarterBreed.SCOUT }).catch(e => e);

            expect(error).toBeInstanceOf(ConflictException);
            expect(error.getResponse()).toMatchObject({ code: ErrorCode.STARTER_LOCKED });
            expect(JSON.stringify(cats.docs)).toBe(before);
        }
    });

    it('an existing account gets 409, not 400, even with a bad name (pending is checked first)', async () => {
        for (const name of ['Bybis', 123, 'x']) {
            const { controller } = await setup({ onboarding: null as any, starter: 'locked' });
            const error = await controller
                .commitStarter(String(userId), { breed: StarterBreed.SCOUT, name })
                .catch(e => e);
            expect(error).toBeInstanceOf(ConflictException);
            expect(error.getResponse()).toMatchObject({ code: ErrorCode.STARTER_LOCKED });
        }
    });

    it('merge-created starter on a legacy account gives 409 and stays unlocked', async () => {
        // ensureStarterCat on sign-in or a guest merge creates an UNLOCKED starter for an account that
        // has no onboarding (legacy, means done) or a finished one. Neither may commit it.
        // `null`, not `undefined`: undefined would take setup's default (pending).
        for (const onboarding of [null, { state: 'done', version: ONBOARDING_VERSION }]) {
            const { controller, users, cats } = await setup({ onboarding: onboarding as any, starter: 'new' });
            expect(starterOf(cats).starterLockedAt).toBeUndefined();

            const error = await controller
                .commitStarter(String(userId), { breed: StarterBreed.SHADOW, name: 'Nimbus' })
                .catch(e => e);

            expect(error).toBeInstanceOf(ConflictException);
            expect(error.getResponse()).toMatchObject({ code: ErrorCode.STARTER_LOCKED });
            expect(starterOf(cats)).toMatchObject({ name: STARTER_ART.SCOUT.name });
            expect(starterOf(cats).starterLockedAt).toBeUndefined();
            expect(user(users).onboarding).toEqual(onboarding ?? undefined);
        }
    });

    it('SKIP commits the default breed and name, and records skipped', async () => {
        const { controller, users, cats } = await setup();

        await controller.commitStarter(String(userId), { skipped: true, name: 'Ignored' });

        expect(starterOf(cats)).toMatchObject({ name: 'Scout', starterBreed: 'SCOUT' });
        expect(user(users).onboarding).toMatchObject({ state: 'done', skipped: true });
    });

    it('validates the breed and the name before writing', async () => {
        const { controller, cats } = await setup({ reserved: ['Mila'] });

        await expect(controller.commitStarter(String(userId), { breed: 'LION' })).rejects.toBeInstanceOf(
            BadRequestException
        );
        await expect(controller.commitStarter(String(userId), { name: 'Nimbus' })).rejects.toBeInstanceOf(
            BadRequestException
        );
        for (const [name, code] of [
            ['аdmin', ErrorCode.NAME_CHARS],
            ['Mila', ErrorCode.NAME_RESERVED],
            ['Bybis', ErrorCode.NAME_BLOCKED],
            [123, ErrorCode.NAME_CHARS],
            [{ toString: () => 'Nimbus' }, ErrorCode.NAME_CHARS],
            [['Nimbus'], ErrorCode.NAME_CHARS],
        ] as [unknown, ErrorCode][]) {
            const error = await controller
                .commitStarter(String(userId), { breed: StarterBreed.SCOUT, name })
                .catch(e => e);
            expect(error.getResponse()).toMatchObject({ code });
        }
        expect(starterOf(cats).starterLockedAt).toBeUndefined();
    });

    it('never targets user.cat: another active cat stays active', async () => {
        const other = new Types.ObjectId();
        const { controller, users, cats } = await setup();
        cats.docs.push({ _id: other, name: 'Luna', owner: userId });
        user(users).cat = other;
        await controller.commitStarter(String(userId), { breed: StarterBreed.SHADOW });
        expect(String(user(users).cat)).toBe(String(other));
    });

    it('works for a guest starter (guests allowed once the session exists)', async () => {
        const { controller, cats } = await setup({ starter: 'guest' });
        await controller.commitStarter(String(userId), { breed: StarterBreed.SUNNY, name: 'Sol' });
        expect(starterOf(cats)).toMatchObject({ name: 'Sol', isGuestStarter: true, starterBreed: 'SUNNY' });
    });
});

describe('POST/DELETE /user/following/:blessingId', () => {
    const rescue = { _id: new Types.ObjectId(), name: 'Mila', kind: 'rescue', status: BlessingStatus.WAITING };
    const portrait = {
        _id: new Types.ObjectId(),
        name: 'My Pet',
        kind: 'portrait',
        shelter: new Types.ObjectId(PORTRAIT_SHELTER_ID),
    };

    it('follows a rescue cat once and unfollows it', async () => {
        const { controller, users } = await setup({ blessings: [rescue, portrait] });

        await expect(controller.follow(String(userId), String(rescue._id))).resolves.toEqual({
            success: true,
            following: [String(rescue._id)],
        });
        await controller.follow(String(userId), String(rescue._id));
        expect(user(users).following).toHaveLength(1);
        await expect(controller.unfollow(String(userId), String(rescue._id))).resolves.toEqual({
            success: true,
            following: [],
        });
    });

    it('refuses portraits, unknown cats and bad ids', async () => {
        const { controller } = await setup({ blessings: [rescue, portrait] });
        await expect(controller.follow(String(userId), String(portrait._id))).rejects.toBeInstanceOf(NotFoundException);
        await expect(controller.follow(String(userId), String(new Types.ObjectId()))).rejects.toBeInstanceOf(
            NotFoundException
        );
        await expect(controller.follow(String(userId), 'x')).rejects.toBeInstanceOf(BadRequestException);
    });

    it(`stops at ${FOLLOWING_LIMIT}`, async () => {
        const many = Array.from({ length: FOLLOWING_LIMIT + 1 }, (_v, index) => ({
            _id: new Types.ObjectId(),
            name: `Cat ${index}`,
            kind: 'rescue',
        }));
        const { controller, users } = await setup({ blessings: many });
        user(users).following = many.slice(0, FOLLOWING_LIMIT).map(doc => doc._id);

        await expect(controller.follow(String(userId), String(many[FOLLOWING_LIMIT]._id))).rejects.toBeInstanceOf(
            ConflictException
        );
        // Following one already in the list is still fine at the limit.
        await expect(controller.follow(String(userId), String(many[0]._id))).resolves.toMatchObject({ success: true });
    });
});

describe('registration and the guest allow-list', () => {
    it('allows guests (with a session) on the G3 routes, and registers StarterController in AppModule', () => {
        for (const handler of ['commitStarter', 'follow', 'unfollow'] as const) {
            expect(Reflect.getMetadata(ALLOW_GUEST_KEY, StarterController.prototype[handler])).toEqual({
                transient: false,
            });
        }
        expect(GUEST_ALLOW_LIST).toMatchObject({
            'POST /user/starter': {},
            'PUT /cat/:id/name': {},
            'POST /user/following/:blessingId': {},
            'DELETE /user/following/:blessingId': {},
        });
        for (const name of ['OPENAI_API_KEY', 'INVALIDATE_CACHE_SECRET']) {
            process.env[name] ??= 'test-placeholder';
        }
        jest.isolateModules(() => {
            jest.doMock('src/user/firebase-admin.module', () => ({
                FirebaseAdminModule: { forRoot: () => ({ module: class FirebaseAdminStub {} }) },
            }));
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { AppModule } = require('src/app.module');
            const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule).map((c: any) => c.name);
            const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule).map((p: any) => p?.name);
            expect(controllers).toContain('StarterController');
            expect(providers).toEqual(
                expect.arrayContaining(['CatNameService', 'NameReportRepository', 'FeaturedBlessingService'])
            );
        });
    });
});

/*
 * Opt-in, against a REAL MongoDB (a scratch database that is dropped afterwards):
 *
 *   IDENTITY_SPEC_MONGO_URL=mongodb://localhost:27017 npx jest src/user/starter.spec.ts
 */
const url = process.env.IDENTITY_SPEC_MONGO_URL;
const maybe = url ? describe : describe.skip;

maybe('starter commit and pack pool on a real MongoDB', () => {
    jest.setTimeout(60000);
    let connection: Connection;
    let users: Model<any>;
    let cats: Model<any>;
    let blessings: Model<any>;

    beforeAll(async () => {
        connection = await mongoose
            .createConnection(url!, { dbName: `tt_starter_spec_${new Types.ObjectId().toString()}` })
            .asPromise();
        users = connection.model('User', UserSchema);
        cats = connection.model('Cat', CatSchema);
        blessings = connection.model('Blessing', BlessingSchema);
        // Populated by CatService.getCat after an adoption.
        connection.model('Image', ImageSchema);
        connection.model('Shelter', ShelterSchema);
        await Promise.all([users.init(), cats.init(), blessings.init()]);
    });

    afterAll(async () => {
        await connection?.db?.dropDatabase();
        await connection?.close();
    });

    beforeEach(async () => {
        await Promise.all([users.deleteMany({}), cats.deleteMany({}), blessings.deleteMany({})]);
    });

    it('ten concurrent commits give one update and nine 409s', async () => {
        await users.create({ _id: userId, name: 'Player', onboarding: { state: 'pending', version: 1 } });
        await ensureStarterCat(cats, users, userId, {});
        const featured = { reservedNames: async () => [] };
        const names = new CatNameService(new CatRepository(cats as any), { model: {} } as any, featured as any);
        const controller = new StarterController(
            new UserRepository(users as any),
            new CatRepository(cats as any),
            new BlessingRepository(blessings as any),
            names
        );

        const results = await Promise.allSettled(
            Array.from({ length: 10 }, (_v, index) =>
                controller.commitStarter(String(userId), { breed: StarterBreed.MISTY, name: `Nimbus${index}` })
            )
        );

        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(result => result.status === 'rejected')).toHaveLength(9);
        expect(await cats.countDocuments({ owner: userId, isStarter: true, starterLockedAt: { $exists: true } })).toBe(
            1
        );
        expect((await users.findById(userId).lean<any>()).onboarding.state).toBe('done');
    });

    it('the pack pool skips owned, ADOPTED, HEAVEN and portrait cats, then is empty', async () => {
        await users.create({ _id: userId, name: 'Player' });
        const pinkPaw = new Types.ObjectId(PACK_SHELTER_IDS.pinkPaw);
        const make = async (status: BlessingStatus, kind: 'rescue' | 'portrait' = 'rescue') => {
            const catId = new Types.ObjectId();
            const blessing = await blessings.create({
                name: `Cat ${status}`,
                description: 'x',
                status,
                kind,
                image: new Types.ObjectId(),
                shelter: pinkPaw,
                cat: catId,
            });
            await cats.create({
                _id: catId,
                name: `Cat ${status}`,
                type: 'ICE',
                tier: 'COMMON',
                spriteImg: 's',
                catImg: 'c',
                status: { EAT: 0 },
                blessing: blessing._id,
                shelter: pinkPaw,
            });
            return catId;
        };
        const waiting = await make(BlessingStatus.WAITING);
        await make(BlessingStatus.ADOPTED);
        await make(BlessingStatus.HEAVEN);
        await make(BlessingStatus.WAITING, 'portrait');
        const service = new CatService(
            new CatRepository(cats as any),
            new UserRepository(users as any),
            new BlessingRepository(blessings as any),
            {} as any,
            {} as any
        );

        for (let i = 0; i < 5; i++) {
            expect(String(await service.pickPackCat(userId, PackType.STARTER))).toBe(String(waiting));
        }
        const adoption = await service.adopt(waiting, String(userId), undefined, PackType.STARTER, 'pack');
        expect(adoption.message).toBe('Congratz on your new cat!');
        await expect(service.pickPackCat(userId, PackType.STARTER)).resolves.toBeNull();
        const copy = await cats.findOne({ owner: userId }).lean<any>();
        expect(copy).toMatchObject({ origin: 'pack' });
        expect(String(copy.sourceCat)).toBe(String(waiting));
        expect(copy.isStarter).toBeUndefined();
    });
});
