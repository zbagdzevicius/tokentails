import { loadImageBytes } from './ai-portrait';

// One fake S3 client for the module (aws.utils creates it at import time).
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
    class Command {
        constructor(readonly input: Record<string, unknown>) {}
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
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn(() => ({ models: { generateContent: jest.fn() } })) }));
jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('loadImageBytes', () => {
    beforeEach(() => {
        mockSend.mockReset();
        mockFetch.mockReset();
    });

    it('refuses s3private:// when allowPrivate is false', async () => {
        await expect(loadImageBytes('s3private://yourcat/originals/a.webp', { allowPrivate: false })).rejects.toThrow(
            'private image URL refused'
        );
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('refuses private keys outside yourcat/originals/', async () => {
        for (const url of [
            's3private://yourcat/avatars/a.png',
            's3private://secrets.json',
            's3private://yourcat/originals/../x',
        ]) {
            await expect(loadImageBytes(url, { allowPrivate: true })).rejects.toThrow('private image URL refused');
        }
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('reads an allowed private original and returns the S3 ContentType as mimeType', async () => {
        mockSend.mockResolvedValue({
            ContentType: 'image/webp',
            Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
        });
        const result = await loadImageBytes('s3private://yourcat/originals/a.webp', { allowPrivate: true });
        expect(result).toEqual({ data: Buffer.from([1, 2, 3]), mimeType: 'image/webp' });
        expect(mockSend.mock.calls[0][0].input).toMatchObject({ Key: 'yourcat/originals/a.webp' });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches a public URL and reads its content-type', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new Uint8Array([9]).buffer,
            headers: { get: () => 'image/png; charset=binary' },
        });
        await expect(loadImageBytes('https://cdn.test/a.png', { allowPrivate: false })).resolves.toEqual({
            data: Buffer.from([9]),
            mimeType: 'image/png',
        });
    });
});
