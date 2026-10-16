import { Types } from 'mongoose';
import { memoryRepository } from 'src/user/guest/memory-model.helper-spec';
import { YourcatRetentionJob } from './yourcat-retention.job';
import { guestUser, harness, NOW } from './yourcat-harness.helper-spec';

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('src/shared/utils/ai.utils', () => ({ generateCat: jest.fn() }));
jest.mock('src/shared/utils/ai-avatar', () => ({ generatePixelAvatar: jest.fn() }));
jest.mock('src/shared/utils/ai-portrait', () => ({ generatePortraitForImage: jest.fn() }));
jest.mock('src/shared/utils/aws.utils', () => ({
    PRIVATE_URL_PREFIX: 's3private://',
    YOURCAT_ORIGINALS_PREFIX: 'yourcat/originals/',
    uploadFile: jest.fn(),
    uploadPrivateObject: jest.fn(),
    uploadPublicObject: jest.fn(),
    deleteObject: jest.fn(),
}));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));

const DAY_MS = 24 * 60 * 60 * 1000;

function setup() {
    const alive = guestUser();
    const deleted = guestUser({ deletedAt: new Date('2026-10-01T00:00:00Z') });
    const h = harness({ users: [alive, deleted] });
    const job = new YourcatRetentionJob(
        memoryRepository(h.yourcats) as any,
        memoryRepository(h.users) as any,
        h.service
    );
    job.now = () => NOW;
    const record = (owner: Types.ObjectId, key: string, fields: Record<string, unknown> = {}) =>
        h.yourcats.create({
            owner,
            source: 'photo',
            name: 'Cat',
            family: 'BLACK',
            cat: new Types.ObjectId(),
            originalKey: `yourcat/originals/${key}.webp`,
            originalSha256: 'abc',
            avatarKey: `yourcat/avatars/${key}.png`,
            avatarStatus: 'ready',
            portraitImage: null,
            deletedAt: null,
            ...fields,
        });
    return { h, job, record, alive, deleted };
}

describe('YourcatRetentionJob', () => {
    it('deletes originals after 30 days and keeps the fresh ones', async () => {
        const { h, job, record, alive } = setup();
        await record(alive._id, 'old', { originalDeleteAfter: new Date(NOW.getTime() - DAY_MS) });
        await record(alive._id, 'new', { originalDeleteAfter: new Date(NOW.getTime() + 10 * DAY_MS) });

        await expect(job.runOnce()).resolves.toMatchObject({ originalsDeleted: 1, originalsKept: 0 });
        expect(h.s3).toEqual(['delete:yourcat/originals/old.webp']);
        const [old, fresh] = h.yourcats.docs;
        expect(old).toMatchObject({ originalKey: null, originalSha256: null });
        expect(fresh.originalKey).toBe('yourcat/originals/new.webp');
    });

    it('keeps the original of an undelivered paid portrait', async () => {
        const { h, job, record, alive } = setup();
        const image: any = await h.images.create({ url: 's3private://x', source: 'yourcat' });
        await h.orders.create({ image: image._id, entityType: 'IMAGE', status: 'COMPLETE', hash: 'cs_1' });
        await record(alive._id, 'paid', {
            originalDeleteAfter: new Date(NOW.getTime() - DAY_MS),
            portraitImage: image._id,
        });

        await expect(job.runOnce()).resolves.toMatchObject({ originalsDeleted: 0, originalsKept: 1 });
        expect(h.s3).toEqual([]);
        expect(h.yourcats.docs[0].originalKey).toBe('yourcat/originals/paid.webp');
    });

    it('deletes the original of a paid portrait whose delivery failed 3 times, at its date', async () => {
        const { h, job, record, alive } = setup();
        const image: any = await h.images.create({ url: 's3private://x', source: 'yourcat' });
        await h.orders.create({ image: image._id, entityType: 'IMAGE', status: 'COMPLETE', hash: 'cs_1' });
        await record(alive._id, 'given-up', {
            originalDeleteAfter: new Date(NOW.getTime() - DAY_MS),
            portraitImage: image._id,
            portraitAttempts: 3,
            deleteOriginalAfterDelivery: true,
        });

        await expect(job.runOnce()).resolves.toMatchObject({ originalsDeleted: 1, originalsKept: 0 });
        expect(h.s3).toEqual(['delete:yourcat/originals/given-up.webp']);
    });

    it('sweeps records whose owner is gone: both objects and the record', async () => {
        const { h, job, record, alive, deleted } = setup();
        await record(alive._id, 'mine', { originalDeleteAfter: new Date(NOW.getTime() + 10 * DAY_MS) });
        await record(deleted._id, 'deleted-account', { originalDeleteAfter: new Date(NOW.getTime() + 10 * DAY_MS) });
        await record(new Types.ObjectId(), 'erased-guest', {
            originalDeleteAfter: new Date(NOW.getTime() + 10 * DAY_MS),
        });

        await expect(job.runOnce()).resolves.toMatchObject({ orphansRemoved: 2 });
        expect(h.yourcats.docs.map(doc => doc.originalKey)).toEqual(['yourcat/originals/mine.webp']);
        expect(h.s3.sort()).toEqual(
            [
                'delete:yourcat/avatars/deleted-account.png',
                'delete:yourcat/originals/deleted-account.webp',
                'delete:yourcat/avatars/erased-guest.png',
                'delete:yourcat/originals/erased-guest.webp',
            ].sort()
        );
    });
});
