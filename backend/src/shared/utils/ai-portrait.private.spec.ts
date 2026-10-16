import sharp = require('sharp');
import { generatePortraitForImage, loadImageBytes, publishPaidPortrait, watermarkedPreview } from './ai-portrait';

/*
 * Known issue KI-08: a `/portrait` output is stored privately (s3private://portraits/<uuid>.png) and only a
 * watermarked ~1024 px webp is public until the order is COMPLETE; then publishPaidPortrait copies it to a
 * public uuid key. `yourcat` and older images keep the public 4K webp.
 */

// sharp encodes real 1500x2000 images here; under a full parallel `npm test` that can pass jest's 5 s default.
jest.setTimeout(30_000);

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
    class Command {
        constructor(readonly input: Record<string, any>) {}
    }
    return {
        S3: jest.fn(() => ({ send: (...args: unknown[]) => mockSend(...args) })),
        GetObjectCommand: class GetObjectCommand extends Command {},
        PutObjectCommand: class PutObjectCommand extends Command {},
        DeleteObjectCommand: class DeleteObjectCommand extends Command {},
    };
});
const mockFetch = jest.fn();
jest.mock('node-fetch', () => ({ __esModule: true, default: (...args: unknown[]) => mockFetch(...args) }));
const mockGenerate = jest.fn();
jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn(() => ({ models: { generateContent: (...args: unknown[]) => mockGenerate(...args) } })),
}));
jest.mock('dotenv', () => ({ config: jest.fn() }));

const IMAGE_ID = '64b7f0c2a1b2c3d4e5f60718';
const png = (width = 1500, height = 2000) =>
    sharp({ create: { width, height, channels: 3, background: '#7a4b2a' } })
        .png()
        .toBuffer();

const commands = (name: string) =>
    mockSend.mock.calls.map(([command]) => command).filter(command => command.constructor.name === name);

function repository(image: Record<string, unknown>) {
    return {
        findOne: jest.fn().mockResolvedValue(image),
        update: jest.fn().mockResolvedValue({}),
    };
}

beforeEach(() => {
    mockSend.mockReset().mockResolvedValue({});
    mockFetch.mockReset();
    mockGenerate.mockReset();
    process.env.DO_SPACES_CDN = 'https://cdn.test';
    process.env.DO_SPACES_NAME = 'bucket';
});

describe('loadImageBytes private scopes', () => {
    it("'portrait' reads only portraits/ keys; true and 'yourcat' read only yourcat originals", async () => {
        mockSend.mockResolvedValue({
            ContentType: 'image/png',
            Body: { transformToByteArray: async () => new Uint8Array([1]) },
        });
        await expect(loadImageBytes('s3private://portraits/a.png', { allowPrivate: 'portrait' })).resolves.toEqual({
            data: Buffer.from([1]),
            mimeType: 'image/png',
        });
        for (const [url, scope] of [
            ['s3private://portraits/a.png', true],
            ['s3private://portraits/a.png', 'yourcat'],
            ['s3private://portraits/a.png', false],
            ['s3private://yourcat/originals/a.webp', 'portrait'],
            ['s3private://portraits/../yourcat/originals/a.webp', 'portrait'],
        ] as const) {
            await expect(loadImageBytes(url, { allowPrivate: scope })).rejects.toThrow('private image URL refused');
        }
    });
});

describe('watermarkedPreview', () => {
    it('is a webp at most 1024 px on its longest side, and differs from a plain resize', async () => {
        const source = await png(1500, 2000);
        const preview = await watermarkedPreview(source);
        const meta = await sharp(preview).metadata();
        expect(meta.format).toBe('webp');
        expect(Math.max(meta.width!, meta.height!)).toBe(1024);

        const plain = await sharp(source).resize(1024, 1024, { fit: 'inside' }).raw().toBuffer();
        const marked = await sharp(preview).removeAlpha().raw().toBuffer();
        let different = 0;
        for (let i = 0; i < plain.length; i += 3) {
            if (Math.abs(plain[i] - marked[i]) > 12) {
                different++;
            }
        }
        expect(different / (plain.length / 3)).toBeGreaterThan(0.05);
    });

    it('never enlarges a small output', async () => {
        const meta = await sharp(await watermarkedPreview(await png(600, 800))).metadata();
        expect([meta.width, meta.height]).toEqual([600, 800]);
    });
});

describe('generatePortraitForImage', () => {
    const gemini = async () => ({
        candidates: [
            { content: { parts: [{ inlineData: { data: (await png()).toString('base64'), mimeType: 'image/png' } }] } },
        ],
        usageMetadata: { promptTokenCount: 10 },
    });

    beforeEach(() => {
        mockFetch.mockResolvedValue({
            arrayBuffer: async () => new Uint8Array(await png(64, 64)).buffer,
            headers: { get: () => 'image/png' },
        });
    });

    it("a 'portrait' image: the 4K PNG goes private into aiUrl, a public watermarked webp into previewUrl", async () => {
        mockGenerate.mockImplementation(gemini);
        const repo = repository({ _id: IMAGE_ID, url: 'https://cdn.test/photo.webp', source: 'portrait' });

        const returned = await generatePortraitForImage(IMAGE_ID, repo as any);

        const puts = commands('PutObjectCommand').map(command => command.input);
        const privatePut = puts.find(input => input.ACL === 'private');
        const publicPut = puts.find(input => input.ACL === 'public-read');
        expect(puts).toHaveLength(2);
        expect(privatePut).toMatchObject({ ContentType: 'image/png' });
        expect(privatePut!.Key).toMatch(/^portraits\/[0-9a-f-]{36}\.png$/);
        expect(publicPut!.Key).toMatch(/^[0-9a-f-]{36}\.webp$/);
        expect(publicPut!.Key).not.toContain(privatePut!.Key.slice('portraits/'.length, -4));
        expect(
            Math.max(
                ...(await sharp(publicPut!.Body)
                    .metadata()
                    .then(m => [m.width!, m.height!]))
            )
        ).toBe(1024);

        const [, fields] = repo.update.mock.calls[0];
        expect(fields).toEqual({
            aiUrl: `s3private://${privatePut!.Key}`,
            previewUrl: `https://cdn.test/${publicPut!.Key}`,
        });
        expect(returned).toBe(fields.previewUrl);
    });

    it('a regenerate deletes the previous private output', async () => {
        mockGenerate.mockImplementation(gemini);
        const repo = repository({
            _id: IMAGE_ID,
            url: 'https://cdn.test/photo.webp',
            source: 'portrait',
            aiUrl: 's3private://portraits/old.png',
        });
        await generatePortraitForImage(IMAGE_ID, repo as any);
        expect(commands('DeleteObjectCommand').map(command => command.input.Key)).toEqual(['portraits/old.png']);
    });

    it('a legacy image keeps the public 4K webp in aiUrl and gets no previewUrl', async () => {
        mockGenerate.mockImplementation(gemini);
        const repo = repository({ _id: IMAGE_ID, url: 'https://cdn.test/photo.webp' });
        const returned = await generatePortraitForImage(IMAGE_ID, repo as any);
        const puts = commands('PutObjectCommand').map(command => command.input);
        expect(puts.every(input => input.ACL === 'public-read')).toBe(true);
        expect(repo.update.mock.calls[0][1]).toEqual({ aiUrl: returned });
        expect(returned).toMatch(/^https:\/\/cdn\.test\/[0-9a-f-]{36}\.webp$/);
    });

    it('passes the AbortSignal to Gemini', async () => {
        mockGenerate.mockImplementation(gemini);
        const controller = new AbortController();
        const repo = repository({ _id: IMAGE_ID, url: 'https://cdn.test/photo.webp', source: 'portrait' });
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await generatePortraitForImage(IMAGE_ID, repo as any, undefined, { signal: controller.signal });
        expect(mockGenerate.mock.calls[0][0].config.abortSignal).toBe(controller.signal);
    });
});

describe('publishPaidPortrait', () => {
    it('copies the private 4K to a new public uuid key and points aiUrl at it', async () => {
        mockSend.mockImplementation(async (command: any) =>
            command.constructor.name === 'GetObjectCommand'
                ? { ContentType: 'image/png', Body: { transformToByteArray: async () => new Uint8Array([7, 7]) } }
                : {}
        );
        const repo = repository({});
        const url = await publishPaidPortrait(
            { _id: IMAGE_ID, aiUrl: 's3private://portraits/abc.png', source: 'portrait' },
            repo as any
        );
        expect(commands('GetObjectCommand')[0].input.Key).toBe('portraits/abc.png');
        const put = commands('PutObjectCommand')[0].input;
        expect(put).toMatchObject({ ACL: 'public-read', ContentType: 'image/png', Body: Buffer.from([7, 7]) });
        expect(put.Key).toMatch(/^[0-9a-f-]{36}\.png$/);
        expect(url).toBe(`https://cdn.test/${put.Key}`);
        expect(repo.update).toHaveBeenCalledWith(IMAGE_ID, { aiUrl: url });
    });

    it('returns a public aiUrl as is, and refuses to publish a private URL of another source', async () => {
        const repo = repository({});
        await expect(
            publishPaidPortrait({ aiUrl: 'https://cdn.test/a.png', source: 'portrait' }, repo as any)
        ).resolves.toBe('https://cdn.test/a.png');
        await expect(
            publishPaidPortrait({ aiUrl: 's3private://yourcat/originals/a.webp', source: 'yourcat' }, repo as any)
        ).resolves.toBeNull();
        expect(mockSend).not.toHaveBeenCalled();
    });
});
