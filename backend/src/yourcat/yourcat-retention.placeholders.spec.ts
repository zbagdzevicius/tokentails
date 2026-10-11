import { Types } from 'mongoose';
import { memoryRepository } from 'src/user/guest/memory-model.helper-spec';
import { YourcatRetentionJob } from './yourcat-retention.job';
import { guestUser, harness, NOW } from './yourcat-harness.helper-spec';

/*
 * Retention steps 3 and 4 (KI-01, KI-18): stale placeholders are hard-deleted, placeholders are skipped
 * by the other steps, and avatars still pending after 10 minutes are stored as failed.
 */

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

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function setup() {
    const alive = guestUser();
    const gone = guestUser({ deletedAt: new Date('2026-10-01T00:00:00Z') });
    const h = harness({ users: [alive, gone] });
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
            originalDeleteAfter: new Date(NOW.getTime() + 10 * DAY_MS),
            avatarKey: null,
            avatarStatus: 'ready',
            portraitImage: null,
            deletedAt: null,
            ...fields,
        });
    return { h, job, record, alive, gone };
}

describe('YourcatRetentionJob: placeholders and pending avatars', () => {
    it('hard-deletes a placeholder older than 10 minutes with its original; keeps a fresh one', async () => {
        const { h, job, record, alive } = setup();
        await record(alive._id, 'stale', { cat: null, creatingAt: new Date(NOW.getTime() - 11 * MINUTE_MS) });
        await record(alive._id, 'fresh', { cat: null, creatingAt: new Date(NOW.getTime() - 2 * MINUTE_MS) });
        await record(alive._id, 'done');

        await expect(job.runOnce()).resolves.toMatchObject({ placeholdersRemoved: 1 });
        expect(h.s3).toEqual(['delete:yourcat/originals/stale.webp']);
        expect(h.yourcats.docs.map(doc => doc.originalKey)).toEqual([
            'yourcat/originals/fresh.webp',
            'yourcat/originals/done.webp',
        ]);
    });

    it('the expiry and orphan steps skip placeholders', async () => {
        const { h, job, record, gone } = setup();
        const creatingAt = new Date(NOW.getTime() - 2 * MINUTE_MS);
        await record(gone._id, 'orphan-placeholder', {
            cat: null,
            creatingAt,
            originalDeleteAfter: new Date(NOW.getTime() - DAY_MS),
        });

        await expect(job.runOnce()).resolves.toMatchObject({
            originalsDeleted: 0,
            orphansRemoved: 0,
            placeholdersRemoved: 0,
        });
        expect(h.s3).toEqual([]);
        expect(h.yourcats.docs).toHaveLength(1);
    });

    it('marks avatars pending for more than 10 minutes as failed (KI-18)', async () => {
        const { h, job, record, alive } = setup();
        await record(alive._id, 'stuck', {
            avatarStatus: 'pending',
            createdAt: new Date(NOW.getTime() - 11 * MINUTE_MS),
        });
        await record(alive._id, 'drawing', {
            avatarStatus: 'pending',
            createdAt: new Date(NOW.getTime() - 30 * 1000),
        });
        await record(alive._id, 'ready', { createdAt: new Date(NOW.getTime() - DAY_MS) });

        await expect(job.runOnce()).resolves.toMatchObject({ avatarsTimedOut: 1 });
        expect(h.yourcats.docs.map(doc => doc.avatarStatus)).toEqual(['failed', 'pending', 'ready']);
    });
});
