import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { ForbiddenException } from '@nestjs/common';
import {
    SHELTER_MANAGER_FIELDS,
    SHELTER_PUBLIC_FIELDS,
    SHELTER_PUBLIC_PROJECTION,
    ShelterController,
    ShelterWriteDto,
    shelterWrite,
    shelterWritePipe,
} from './shelter.controller';
import { ShelterSchema } from './shelter.schema';

// UserService pulls in Stellar and Mongoose models; the GET routes never use it.
jest.mock('src/user/user.service', () => ({ UserService: class {} }));

/*
 * W1 security hotfix (F7.7, pulled forward): GET /shelter and GET /shelter/:id returned `wallets`,
 * including the encrypted Stellar private key, to any signed-in user.
 */

const FORBIDDEN_KEYS = ['wallets', 'walletPrivateKey', 'users', 'code', 'blessing'];

// A shelter as stored today, with every private field set.
const storedShelter = () => ({
    _id: new Types.ObjectId(),
    name: 'Rožinė pėdutė',
    slug: 'rozine-pedute',
    description: 'A shelter',
    address: 'Street 1',
    website: 'https://example.org',
    facebook: 'fb',
    twitter: 'tw',
    tiktok: 'tt',
    foundedAt: new Date('2019-01-01'),
    country: 'Lithuania',
    countryCode: 'LT',
    partnerStatus: 'active',
    role: 'partner',
    handoverStatus: 'held-by-token-tails',
    handoverAt: new Date('2026-09-01'),
    handoverTx: '0x' + 'ab'.repeat(32),
    publicWallet: '0x' + '22'.repeat(20),
    image: { _id: new Types.ObjectId(), url: 'https://cdn/x.webp' },
    blessing: [new Types.ObjectId()],
    users: [new Types.ObjectId()],
    code: 'secret-code',
    wallets: { stellar: { walletAddress: 'GABC', walletPrivateKey: 'encrypted-secret' } },
    createdAt: new Date(),
    updatedAt: new Date(),
});

/** Applies a Mongo projection string the way MongoDB does, inclusion or exclusion. */
function project(doc: Record<string, any>, projection: string) {
    const keys = projection.split(' ').filter(Boolean);
    const exclusion = keys.every(key => key.startsWith('-'));
    if (exclusion) {
        const out = { ...doc };
        keys.forEach(key => delete out[key.slice(1)]);
        return out;
    }
    const out: Record<string, any> = { _id: doc._id };
    keys.forEach(key => {
        if (key in doc) out[key] = doc[key];
    });
    return out;
}

function createController(shelters = [storedShelter(), storedShelter()]) {
    const repository = {
        find: jest.fn(async ({ projection }: any) => shelters.map(shelter => project(shelter, projection))),
        findOne: jest.fn(async ({ searchObject, projection }: any) => {
            const shelter = shelters.find(s => s._id.toString() === searchObject._id.toString());
            return shelter ? project(shelter, projection) : null;
        }),
    };
    return { controller: new ShelterController(repository as any, {} as any), repository, shelters };
}

const containsKeyDeep = (value: unknown, key: string): boolean => {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(item => containsKeyDeep(item, key));
    return Object.entries(value).some(
        ([k, v]) => k === key || (!(v instanceof Types.ObjectId) && containsKeyDeep(v, key))
    );
};

describe('W1-HF shelter GET projection (F7.7 whitelist)', () => {
    const roles = [
        ['a player', { _id: 'u1', permission: PERMISSION_LEVEL.USER }],
        ['a manager', { _id: 'm1', permission: PERMISSION_LEVEL.MANAGER }],
        ['an admin', { _id: 'a1', permission: PERMISSION_LEVEL.ADMIN }],
    ] as const;

    it.each(roles)('GET /shelter returns no private field to %s', async (_label, user) => {
        const { controller } = createController();
        const response = await controller.find(user as any);

        expect(response).toHaveLength(2);
        FORBIDDEN_KEYS.forEach(key => expect(containsKeyDeep(response, key)).toBe(false));
    });

    it.each(roles)('GET /shelter/:id returns no private field to %s', async (_label, user) => {
        const { controller, shelters } = createController();
        const response = await controller.findOne(shelters[0]._id.toString(), user as any);

        expect(response).toMatchObject({ name: 'Rožinė pėdutė', slug: 'rozine-pedute' });
        FORBIDDEN_KEYS.forEach(key => expect(containsKeyDeep(response, key)).toBe(false));
    });

    it('is an explicit inclusion whitelist of exactly the F7.7 fields', async () => {
        expect([...SHELTER_PUBLIC_FIELDS]).toEqual([
            '_id',
            'name',
            'slug',
            'description',
            'image',
            'country',
            'countryCode',
            'partnerStatus',
            'role',
            'publicWallet',
        ]);
        const { controller, repository, shelters } = createController();
        await controller.find({ permission: PERMISSION_LEVEL.USER } as any);
        await controller.findOne(shelters[0]._id.toString(), { permission: PERMISSION_LEVEL.USER } as any);

        for (const call of [repository.find.mock.calls[0][0], repository.findOne.mock.calls[0][0]]) {
            expect(call.projection).toBe(SHELTER_PUBLIC_PROJECTION);
            expect(call.projection).not.toMatch(/(^|\s)-/);
            expect(call.populate).toEqual([{ path: 'image', select: 'url' }]);
        }
    });

    it('a player gets only whitelisted keys; a field added to the schema later stays private', async () => {
        const shelter = { ...storedShelter(), someFutureSecret: 'x' };
        const { controller } = createController([shelter]);
        const [row] = await controller.find({ permission: PERMISSION_LEVEL.USER } as any);

        Object.keys(row).forEach(key => expect(SHELTER_PUBLIC_FIELDS as readonly string[]).toContain(key));
    });

    it('a manager also gets the contact fields the CMS editor writes back, and nothing private', async () => {
        const { controller, shelters } = createController();
        const row = await controller.findOne(shelters[0]._id.toString(), {
            permission: PERMISSION_LEVEL.MANAGER,
        } as any);

        SHELTER_MANAGER_FIELDS.forEach(field => expect(row).toHaveProperty(field));
        Object.keys(row).forEach(key =>
            expect([...SHELTER_PUBLIC_FIELDS, ...SHELTER_MANAGER_FIELDS] as string[]).toContain(key)
        );
    });

    it('both GETs stay behind AppAuthGuard', () => {
        const proto = ShelterController.prototype as any;
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.find)).toEqual([AppAuthGuard]);
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.findOne)).toEqual([AppAuthGuard]);
    });
});

describe('F7.7 shelter write DTO', () => {
    const admin = { _id: 'a1', permission: PERMISSION_LEVEL.ADMIN } as any;
    const manager = { _id: 'm1', permission: PERMISSION_LEVEL.MANAGER } as any;
    const validate = (body: unknown) =>
        shelterWritePipe.transform(body, { type: 'body', metatype: ShelterWriteDto }) as Promise<ShelterWriteDto>;
    const status = (promise: Promise<unknown>) =>
        promise.then(
            () => 'ok',
            (e: any) => e?.getStatus?.() ?? 'error'
        );

    it.each(['LT', 'lt', ' de ', 'US'])('accepts ISO alpha-2 %p and stores it uppercase', async code => {
        const dto = await validate({ countryCode: code });
        expect(dto.countryCode).toBe(code.trim().toUpperCase());
    });

    it.each(['LTU', 'XX', 'Lithuania', 'L', 'UK', 12])('rejects country code %p with 400', async code => {
        expect(await status(validate({ countryCode: code }))).toBe(400);
    });

    it.each(['countryCode', 'partnerStatus', 'role', 'handoverStatus', 'handoverAt', 'handoverTx', 'publicWallet'])(
        'clears %s with a blank string (a form that empties the field) instead of a 400',
        async field => {
            for (const blank of ['', '  ']) {
                const dto: any = await validate({ [field]: blank });
                expect(dto[field]).toBeNull();
            }
        }
    );

    it.each([
        ['partnerStatus', 'active', 'partner'],
        ['role', 'house', 'shelter'],
        ['handoverStatus', 'handed-over', 'given'],
    ])('%s accepts only its enum values', async (field, good, bad) => {
        expect(await status(validate({ [field]: good }))).toBe('ok');
        expect(await status(validate({ [field]: bad }))).toBe(400);
    });

    it.each(['wallets', 'users', 'blessing', 'code', 'slug'])(
        'rejects the private or derived field %s',
        async field => {
            expect(await status(validate({ name: 'x', [field]: 'anything' }))).toBe(400);
        }
    );

    it('normalises the public wallet and handover tx to lowercase and validates them', async () => {
        const wallet = '0x' + 'AB'.repeat(20);
        const dto = await validate({ publicWallet: wallet, handoverTx: '0x' + 'CD'.repeat(32) });
        expect(dto.publicWallet).toBe(wallet.toLowerCase());
        expect(dto.handoverTx).toBe('0x' + 'cd'.repeat(32));
        expect(await status(validate({ publicWallet: '0x1234' }))).toBe(400);
        expect(await status(validate({ handoverTx: '0x1234' }))).toBe(400);
    });

    it('only an admin changes custody fields; handed-over needs a public wallet', () => {
        expect(() => shelterWrite({ handoverStatus: 'handed-over' } as any, manager, {})).toThrow(ForbiddenException);
        expect(() => shelterWrite({ handoverStatus: 'handed-over' } as any, admin, {})).toThrow('publicWallet');
        expect(
            shelterWrite({ handoverStatus: 'handed-over' } as any, admin, { publicWallet: '0x' + '22'.repeat(20) })
        ).toEqual({ handoverStatus: 'handed-over' });
        expect(shelterWrite({ countryCode: 'LT', partnerStatus: 'active' } as any, manager, {})).toEqual({
            countryCode: 'LT',
            partnerStatus: 'active',
        });
    });

    it("a manager's save that sends the loaded custody fields back unchanged is accepted", () => {
        const existing = {
            handoverStatus: 'held-by-token-tails',
            handoverAt: new Date('2026-09-01T00:00:00Z'),
            handoverTx: '0x' + 'ab'.repeat(32),
        } as any;
        const roundTrip = {
            name: 'Pink Paw',
            handoverStatus: 'held-by-token-tails',
            handoverAt: '2026-09-01T00:00:00.000Z',
            handoverTx: '0x' + 'ab'.repeat(32),
        } as any;
        expect(shelterWrite(roundTrip, manager, existing)).toEqual({ name: 'Pink Paw' });
        // Absent on both sides (null in the form, missing in the row) is unchanged too.
        expect(shelterWrite({ name: 'x', handoverAt: null, handoverTx: null } as any, manager, {})).toEqual({
            name: 'x',
        });
        // An actual change is still refused, naming only the changed field.
        expect(() => shelterWrite({ ...roundTrip, handoverStatus: 'handed-over' }, manager, existing)).toThrow(
            'Only an admin can change handoverStatus'
        );
        expect(() => shelterWrite({ ...roundTrip, handoverAt: '2026-09-02T00:00:00Z' }, manager, existing)).toThrow(
            ForbiddenException
        );
    });

    it('a null for a required field is dropped instead of blanking it', () => {
        expect(shelterWrite({ name: null, website: null } as any, manager, {})).toEqual({ website: null });
    });

    it('the schema validates countryCode too (a direct write cannot store a bad code)', () => {
        // Path validators directly: a model would run the unique-validator plugin's queries.
        const path = (name: string) => ShelterSchema.path(name) as any;
        const check = (name: string, value: unknown) => path(name).doValidateSync(path(name).cast(value), {});
        expect(path('countryCode').applySetters(' lt ', {})).toBe('LT');
        expect(check('countryCode', 'LT')).toBeFalsy();
        expect(check('countryCode', 'LTU')).toBeTruthy();
        expect(check('countryCode', 'XX')).toBeTruthy();
        expect(check('partnerStatus', 'nope')).toBeTruthy();
        expect(check('publicWallet', '0x1234')).toBeTruthy();
        expect(check('publicWallet', '0x' + '22'.repeat(20))).toBeFalsy();
    });
});
