import { publishPaidPortrait } from './ai-portrait';
import { deliverPaidPortraitUrl } from './paid-portrait';

/*
 * CR1-01 / CR1-03: who delivers a paid /portrait. Of concurrent publishers (the webhook or a confirm, and
 * the GET /image/:id retry) only the one whose update still found the private `aiUrl` delivers.
 */

jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn(() => ({ models: { generateContent: jest.fn() } })) }));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('./image.utils', () => ({ uploadFileImage: jest.fn() }));
jest.mock('./aws.utils', () => {
    const privateUrl = jest.requireActual('./private-url');
    return {
        ...privateUrl,
        PORTRAIT_PRIVATE_PREFIX: 'portraits/',
        loadImageBytes: jest.fn(async () => ({ data: Buffer.from([7]), mimeType: 'image/png' })),
        uploadFile: jest.fn(async () => undefined),
        uploadPrivateObject: jest.fn(),
        deleteObject: jest.fn(),
    };
});

const { uploadFile, loadImageBytes } = jest.requireMock('./aws.utils');
const IMAGE_ID = '64b7f0c2a1b2c3d4e5f60718';
const PRIVATE_4K = 's3private://portraits/abc.png';
const image = (aiUrl: string = PRIVATE_4K, source = 'portrait') => ({ _id: IMAGE_ID, aiUrl, source });
/** BaseRepository.update returns the document as it was before the update. */
const repository = (before: Record<string, unknown> | null) => ({ update: jest.fn().mockResolvedValue(before) });

beforeEach(() => {
    jest.clearAllMocks();
    process.env.DO_SPACES_CDN = 'https://cdn.test';
});

describe('publishPaidPortrait outcome', () => {
    it('publishedNow is true for the call whose update found the private aiUrl', async () => {
        const outcome: { publishedNow?: boolean } = {};
        const url = await publishPaidPortrait(image(), repository({ aiUrl: PRIVATE_4K }) as any, outcome);
        expect(url).toMatch(/^https:\/\/cdn\.test\/[0-9a-f-]{36}\.png$/);
        expect(outcome.publishedNow).toBe(true);
        expect(loadImageBytes).toHaveBeenCalledWith(PRIVATE_4K, { allowPrivate: 'portrait' });
    });

    it('publishedNow is false when another caller had already made it public', async () => {
        const outcome: { publishedNow?: boolean } = {};
        await publishPaidPortrait(image(), repository({ aiUrl: 'https://cdn.test/first.png' }) as any, outcome);
        expect(outcome.publishedNow).toBe(false);
    });

    it('publishedNow is false when nothing is published', async () => {
        const outcome: { publishedNow?: boolean } = { publishedNow: true };
        await publishPaidPortrait(image('https://cdn.test/a.png'), repository(null) as any, outcome);
        expect(outcome.publishedNow).toBe(false);
        expect(uploadFile).not.toHaveBeenCalled();
    });
});

describe('deliverPaidPortraitUrl', () => {
    it('publishes a private /portrait 4K and delivers its public URL', async () => {
        const delivery = await deliverPaidPortraitUrl(image(), repository({ aiUrl: PRIVATE_4K }) as any);
        expect(delivery.deliver).toBe(true);
        expect(delivery.url).toMatch(/^https:\/\//);
    });

    it('a lost race: the public URL, but this caller does not deliver', async () => {
        const delivery = await deliverPaidPortraitUrl(image(), repository({ aiUrl: 'https://cdn.test/x.png' }) as any);
        expect(delivery).toEqual({ url: expect.stringMatching(/^https:\/\//), deliver: false });
    });

    it('an already public aiUrl is delivered as is', async () => {
        const repo = repository(null);
        await expect(deliverPaidPortraitUrl(image('https://cdn.test/old.webp'), repo as any)).resolves.toEqual({
            url: 'https://cdn.test/old.webp',
            deliver: true,
        });
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('a failed publish: no URL, no delivery, the error', async () => {
        uploadFile.mockRejectedValueOnce(new Error('spaces down'));
        const delivery = await deliverPaidPortraitUrl(image(), repository(null) as any);
        expect(delivery.url).toBeNull();
        expect(delivery.deliver).toBe(false);
        expect((delivery.error as Error).message).toBe('spaces down');
    });

    it('never hands out a private URL of another source, or nothing', async () => {
        await expect(
            deliverPaidPortraitUrl(image('s3private://yourcat/originals/a.webp', 'yourcat'), repository(null) as any)
        ).resolves.toEqual({ url: null, deliver: false });
        await expect(deliverPaidPortraitUrl(undefined, repository(null) as any)).resolves.toEqual({
            url: null,
            deliver: false,
        });
        expect(loadImageBytes).not.toHaveBeenCalled();
    });
});
