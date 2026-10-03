import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { BlessingController } from './blessing.controller';
import { blessingKindFor, PORTRAIT_SHELTER_ID, rescueBlessingFilter } from './blessing.schema';
import { BlessingRepository } from './blessing.repository';

// The controller's imports read secrets at import time: ai.utils builds an OpenAI client (throws
// without OPENAI_API_KEY) and user.service pulls in EncryptionService (scrypt of
// INVALIDATE_CACHE_SECRET). CI has neither, so stub them as featured.spec.ts does; these tests call
// neither, and the controller gets an empty UserService below.
jest.mock('src/shared/utils/ai.utils', () => ({ generateCat: jest.fn() }));
jest.mock('src/shared/utils/ai-avatar', () => ({ generateAvatarFromImage: jest.fn() }));
jest.mock('src/user/user.service', () => ({ UserService: class {} }));

const PORTRAIT = new Types.ObjectId(PORTRAIT_SHELTER_ID);

describe('Blessing kind (plan F7.8)', () => {
    it('derives the kind from the shelter: portrait only in the portrait shelter', () => {
        expect(blessingKindFor(PORTRAIT_SHELTER_ID)).toBe('portrait');
        expect(blessingKindFor(PORTRAIT)).toBe('portrait');
        expect(blessingKindFor({ _id: PORTRAIT, name: 'HOME' })).toBe('portrait');
        expect(blessingKindFor(new Types.ObjectId())).toBe('rescue');
        expect(blessingKindFor(undefined)).toBe('rescue');
    });

    it('keeps the plain rescue filter unchanged and adds a shelter exclusion only when asked', () => {
        const plain = rescueBlessingFilter();
        expect(plain).toEqual({
            $or: [{ kind: 'rescue' }, { kind: { $exists: false }, shelter: { $ne: PORTRAIT } }],
        });
        const house = [new Types.ObjectId()];
        expect(rescueBlessingFilter(house)).toEqual({ $and: [plain, { shelter: { $nin: house } }] });
    });

    it('traction counts leave out house zones and portraits', async () => {
        const houseZone = new Types.ObjectId();
        const partner = new Types.ObjectId();
        const shelters = memoryModel();
        shelters.rows.push(
            { _id: houseZone, slug: 'token-tails' },
            { _id: partner, slug: 'rozine-pedute', role: 'partner' }
        );
        const blessings = memoryModel({ collections: { shelters } });
        blessings.rows.push(
            { _id: new Types.ObjectId(), kind: 'rescue', shelter: partner },
            { _id: new Types.ObjectId(), shelter: partner },
            { _id: new Types.ObjectId(), kind: 'rescue', shelter: houseZone },
            { _id: new Types.ObjectId(), kind: 'portrait', shelter: PORTRAIT }
        );
        const repository = new BlessingRepository(blessings as any);
        await expect(repository.rescueCount()).resolves.toBe(2);
    });
});

describe('BlessingController kind on create and update', () => {
    const moderator = new Types.ObjectId();
    function setup(existing: Record<string, unknown>) {
        const repository = {
            findOne: jest.fn(async () => existing),
            update: jest.fn(async (_id: unknown, object: unknown) => object),
            create: jest.fn(async (object: unknown) => object),
        };
        const userRepository = {
            findOne: jest.fn(async () => ({ _id: moderator, permission: 5, shelter: undefined })),
        };
        const catRepository = { update: jest.fn(async () => ({})) };
        const controller = new BlessingController(
            repository as any,
            userRepository as any,
            {} as any,
            {} as any,
            catRepository as any,
            {} as any
        );
        return { controller, repository, catRepository };
    }

    it('refuses to move a shelter cat into the portrait shelter, or a portrait out of it', async () => {
        const rescue = { _id: new Types.ObjectId(), name: 'Mia', kind: 'rescue', shelter: new Types.ObjectId() };
        const a = setup(rescue);
        await expect(
            a.controller.update(
                String(rescue._id),
                { name: 'Mia', shelter: PORTRAIT_SHELTER_ID } as any,
                String(moderator)
            )
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(a.repository.update).not.toHaveBeenCalled();

        // A legacy portrait without `kind` is judged by its shelter.
        const portrait = { _id: new Types.ObjectId(), name: 'Rex', shelter: PORTRAIT };
        const b = setup(portrait);
        await expect(
            b.controller.update(
                String(portrait._id),
                { name: 'Rex', shelter: String(new Types.ObjectId()) } as any,
                String(moderator)
            )
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows a move between rescue shelters and never writes kind from the body', async () => {
        const rescue = { _id: new Types.ObjectId(), name: 'Mia', kind: 'rescue', shelter: new Types.ObjectId() };
        const { controller, repository } = setup(rescue);
        const target = String(new Types.ObjectId());
        await controller.update(
            String(rescue._id),
            { name: 'Mia', shelter: target, kind: 'portrait' } as any,
            String(moderator)
        );
        const written: any = repository.update.mock.calls[0][1];
        expect(String(written.shelter)).toBe(target);
        expect(written.kind).toBeUndefined();
    });

    it('PUT /blessing/:id/custom applies the same kind guard (no cat write on refusal)', async () => {
        const cat = new Types.ObjectId();
        const rescue = { _id: new Types.ObjectId(), cat, kind: 'rescue', shelter: new Types.ObjectId() };
        const a = setup(rescue);
        const body = { name: 'Mia', description: 'd', image: String(new Types.ObjectId()) };
        await expect(
            a.controller.updateCustom(
                String(rescue._id),
                { ...body, shelter: PORTRAIT_SHELTER_ID } as any,
                String(moderator)
            )
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(a.repository.update).not.toHaveBeenCalled();
        expect(a.catRepository.update).not.toHaveBeenCalled();

        const portrait = { _id: new Types.ObjectId(), cat, shelter: PORTRAIT };
        const b = setup(portrait);
        await expect(
            b.controller.updateCustom(
                String(portrait._id),
                { ...body, shelter: String(new Types.ObjectId()) } as any,
                String(moderator)
            )
        ).rejects.toBeInstanceOf(BadRequestException);

        const c = setup(rescue);
        const target = String(new Types.ObjectId());
        await c.controller.updateCustom(String(rescue._id), { ...body, shelter: target } as any, String(moderator));
        expect(String((c.repository.update.mock.calls[0][1] as any).shelter)).toBe(target);
    });
});
