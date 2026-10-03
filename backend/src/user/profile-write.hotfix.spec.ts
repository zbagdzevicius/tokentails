import { BadRequestException } from '@nestjs/common';
import { ProfileWriteDto, profileWritePipe } from './dto/profile-write.dto';
import { UserController } from './user.controller';

jest.mock('./user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * W1 security hotfix (the G4 scheduled fix, pulled forward): a manager could attach any user,
 * including themselves, to any shelter through POST /user/profile and PUT /user/profile/:id.
 */

const validate = (body: unknown) => profileWritePipe.transform(body, { type: 'body', metatype: ProfileWriteDto });

describe('W1-HF: ProfileWriteDto without shelter', () => {
    it.each([['507f1f77bcf86cd799439011'], [''], [null]])(
        'a manager write containing shelter %j gives 400',
        async shelter => {
            const error = await validate({ name: 'A', email: 'a@example.com', shelter }).catch(e => e);

            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.getStatus()).toBe(400);
            expect(JSON.stringify(error.getResponse())).toContain('shelter');
        }
    );

    it('the DTO has no shelter property', () => {
        expect(Object.keys(new ProfileWriteDto())).not.toContain('shelter');
    });

    it('a write without shelter still passes', async () => {
        await expect(validate({ name: 'A', email: 'a@example.com', discount: '', permission: 1 })).resolves.toEqual({
            name: 'A',
            email: 'a@example.com',
            discount: '',
            permission: 1,
        });
    });

    it('POST /user/profile no longer sets shelter on the created user', async () => {
        const create = jest.fn(async (doc: any) => doc);
        const controller = Object.create(UserController.prototype);
        controller.repository = { create };
        controller.userService = { generateWallets: jest.fn(() => ({})), generateACat: jest.fn() };

        await controller.createProfile(await validate({ name: 'A', email: 'a@example.com' }));

        expect(create.mock.calls[0][0]).not.toHaveProperty('shelter');
    });
});

/*
 * Decision #33 (security, found in the 1b review): a manager could repoint any user's `email` and,
 * with the verified-email binding rule, sign in as them; or grant any role up to ADMIN.
 */
describe('W1-HF: only an ADMIN changes email or permission', () => {
    const TARGET = '507f1f77bcf86cd799439011';
    const manager = { _id: 'm', permission: 4 };
    const admin = { _id: 'a', permission: 5 };

    function controllerWith(stored: Record<string, unknown> | null) {
        const controller = Object.create(UserController.prototype);
        controller.repository = {
            findOne: jest.fn(async () => stored),
            update: jest.fn(async () => ({})),
            create: jest.fn(async (doc: any) => doc),
        };
        controller.userService = { generateWallets: jest.fn(() => ({})), generateACat: jest.fn() };
        return controller;
    }

    it.each([
        ['email', { email: 'attacker@example.com' }],
        ['email (permission unchanged)', { email: 'attacker@example.com', permission: 1 }],
        ['permission', { permission: 5 }],
        ['permission (demotion)', { email: 'victim@example.com', permission: 0 }],
    ])('a manager changing %s gets 403 and nothing is written', async (_label, body) => {
        const controller = controllerWith({ email: 'victim@example.com', permission: 1 });
        const error = await controller.updateProfile(await validate(body), TARGET, manager).catch((e: any) => e);

        expect(error.getStatus()).toBe(403);
        expect(controller.repository.update).not.toHaveBeenCalled();
    });

    it('a manager saving the CMS form with unchanged email and permission still works', async () => {
        const controller = controllerWith({ email: 'Victim@Example.com', permission: 1 });
        const body = await validate({ name: 'New name', email: ' victim@example.com', permission: 1, discount: '' });

        await expect(controller.updateProfile(body, TARGET, manager)).resolves.toEqual({});
        expect(controller.repository.update).toHaveBeenCalledWith(TARGET, body);
    });

    it("an empty permission field matches a user without a stored permission (the CMS sends '' or 0)", async () => {
        for (const permission of ['', 0]) {
            const controller = controllerWith({ email: 'v@example.com' });
            await expect(
                controller.updateProfile(await validate({ email: 'v@example.com', permission }), TARGET, manager)
            ).resolves.toEqual({});
        }
    });

    it('a manager write without email and permission does not read the target', async () => {
        const controller = controllerWith(null);
        await expect(controller.updateProfile(await validate({ name: 'N' }), TARGET, manager)).resolves.toEqual({});
        expect(controller.repository.findOne).not.toHaveBeenCalled();
    });

    it('an admin may change email and permission', async () => {
        const controller = controllerWith({ email: 'victim@example.com', permission: 1 });
        const body = await validate({ email: 'new@example.com', permission: 4 });

        await expect(controller.updateProfile(body, TARGET, admin)).resolves.toEqual({});
        expect(controller.repository.findOne).not.toHaveBeenCalled();
        expect(controller.repository.update).toHaveBeenCalledWith(TARGET, body);
    });

    it('a manager can create users only up to USER; an admin can grant any role', async () => {
        const managerCreate = await controllerWith(null)
            .createProfile(await validate({ name: 'A', permission: 4 }), manager)
            .catch((e: any) => e);
        expect(managerCreate.getStatus()).toBe(403);

        const created = await controllerWith(null).createProfile(await validate({ name: 'A', permission: 1 }), manager);
        expect(created.permission).toBe(1);

        const byAdmin = await controllerWith(null).createProfile(await validate({ name: 'A', permission: 4 }), admin);
        expect(byAdmin.permission).toBe(4);
    });
});
