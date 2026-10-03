import { BadRequestException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ProfileWriteDto, profileWritePipe } from './dto/profile-write.dto';
import { PERMISSION_LEVEL } from './models/user.model';
import { PROFILE_ADMIN_PROJECTION, UserController } from './user.controller';

// The real services pull in Mongoose models, AI and wallet code; these routes only use the repository.
jest.mock('./user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

const PERSONAL_FIELDS = ['wallets', 'secret', 'tails', 'referrals', 'quests', 'catnipCount', 'streak'];

function handlersFor(method: RequestMethod, path: string) {
    const proto = UserController.prototype as any;
    return Object.getOwnPropertyNames(proto)
        .filter(name => name !== 'constructor' && typeof proto[name] === 'function')
        .map(name => proto[name])
        .filter(fn => Reflect.getMetadata(METHOD_METADATA, fn) === method)
        .filter(fn => `${Reflect.getMetadata(PATH_METADATA, fn)}`.replace(/:[^/]+/g, ':param') === path);
}

function allows(guards: any[], permission?: number) {
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { permission } }) }) } as any;
    const permissionGuards = guards.filter(guard => guard !== AppAuthGuard);
    return permissionGuards.every(Guard => new Guard().canActivate(context));
}

describe('GET /user/profile/:id', () => {
    it('is served by exactly one handler, so no public variant shadows the manager route', () => {
        expect(handlersFor(RequestMethod.GET, 'profile/:param')).toHaveLength(1);
    });

    it('requires AppAuthGuard and at least MANAGER', () => {
        const [handler] = handlersFor(RequestMethod.GET, 'profile/:param');
        const guards = Reflect.getMetadata(GUARDS_METADATA, handler) || [];

        expect(guards[0]).toBe(AppAuthGuard);
        expect(allows(guards, PERMISSION_LEVEL.USER)).toBe(false);
        expect(allows(guards, PERMISSION_LEVEL.EDITOR)).toBe(false);
        expect(allows(guards, PERMISSION_LEVEL.MANAGER)).toBe(true);
    });

    it('selects only the fields the CMS user form reads', async () => {
        const findOne = jest.fn().mockResolvedValue({ name: 'n' });
        const controller = Object.create(UserController.prototype);
        controller.repository = { findOne };
        const [handler] = handlersFor(RequestMethod.GET, 'profile/:param');

        await handler.call(controller, '507f1f77bcf86cd799439011');

        const { projection, populate } = findOne.mock.calls[0][0];
        expect(projection).toBe(PROFILE_ADMIN_PROJECTION);
        expect(populate).toBeUndefined();
        // cms/pages/users/[id].tsx reads these.
        ['name', 'email', 'discount', 'permission', 'shelter'].forEach(field =>
            expect(projection.split(' ')).toContain(field)
        );
        PERSONAL_FIELDS.forEach(field => expect(projection).not.toContain(field));
    });
});

describe('profile write body (POST /user/profile, PUT /user/profile/:id)', () => {
    const validate = (body: unknown) => profileWritePipe.transform(body, { type: 'body', metatype: ProfileWriteDto });

    it('accepts the payloads the CMS user form sends', async () => {
        await expect(
            validate({ name: 'A', discount: '', email: 'a@example.com', permission: 4 })
        ).resolves.toMatchObject({ name: 'A', permission: 4 });
        await expect(validate({ name: 'A', discount: '', email: '', permission: '' })).resolves.toBeDefined();
        await expect(validate({ name: 'A', permission: 0 })).resolves.toBeDefined();
    });

    it.each([
        [{ name: 'A', tails: 1000000 }],
        [{ name: 'A', wallets: { stellar: { walletAddress: 'G', secret: 's' } } }],
        [{ $set: { permission: PERMISSION_LEVEL.ADMIN } }],
        [{ permission: 99 }],
        [{ permission: '5' }],
        // W1 security hotfix: a manager can no longer attach a user to any shelter.
        [{ name: 'A', shelter: '507f1f77bcf86cd799439011' }],
        [{ name: 'A', shelter: '' }],
        [{ name: 'A', shelter: null }],
    ])('rejects %j', async body => {
        await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['createProfile', 'updateProfile'])('%s uses the strict pipe on its body', method => {
        const args = Reflect.getMetadata('__routeArguments__', UserController, method) || {};
        const bodyArg: any = Object.values(args).find((arg: any) => arg.pipes?.includes(profileWritePipe));
        expect(bodyArg).toBeDefined();
        expect(Reflect.getMetadata('design:paramtypes', UserController.prototype, method)).toContain(ProfileWriteDto);
    });

    it('updateProfile passes only whitelisted fields to the repository', async () => {
        const update = jest.fn().mockResolvedValue({});
        const controller = Object.create(UserController.prototype);
        controller.repository = { update };
        const body = await validate({ name: 'A', email: 'a@example.com' });

        // An admin caller: email and permission changes are ADMIN only (profile-write.hotfix.spec.ts).
        await controller.updateProfile(body, '507f1f77bcf86cd799439011', { permission: 5 });

        expect(Object.keys(update.mock.calls[0][1]).sort()).toEqual(['email', 'name']);
    });
    it('updateProfile keeps emailCanonical in step with an email change (2a review finding #5)', async () => {
        const update = jest.fn().mockResolvedValue({});
        const controller = Object.create(UserController.prototype);
        controller.repository = { update };
        const body = await validate({ email: 'Pat.Smith+cms@gmail.com' });

        await controller.updateProfile(body, '507f1f77bcf86cd799439011', { permission: 5 });

        expect(update).toHaveBeenLastCalledWith('507f1f77bcf86cd799439011', { emailCanonical: 'patsmith@gmail.com' });
    });
    it('createProfile maps the empty permission field to the schema default', async () => {
        const create = jest.fn().mockResolvedValue({});
        const controller = Object.create(UserController.prototype);
        controller.repository = { create };
        controller.userService = { generateWallets: jest.fn(() => ({})), generateACat: jest.fn() };
        const body = await validate({ name: 'A', email: '', discount: '', permission: '' });

        await controller.createProfile(body);

        const created = create.mock.calls[0][0];
        expect(created.permission).toBeUndefined();
        expect(created).not.toHaveProperty('tails');
        expect(created).not.toHaveProperty('shelter');
    });
});
