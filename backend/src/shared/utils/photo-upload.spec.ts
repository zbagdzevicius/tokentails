import { deflateSync } from 'zlib';
import sharp = require('sharp');
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    convertHeicInWorker,
    heicIo,
    heicPixelCount,
    PhotoError,
    PhotoTypeError,
    PHOTO_MAX_BYTES,
    PHOTO_MULTER_OPTIONS,
    sanitizePhoto,
    Slots,
} from './photo-upload';

// heic-convert is pure JS and slow (and runs in a worker); the spec decides what it returns.
const convert = jest.fn();
heicIo.convert = convert;

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#3a7' } });

async function codeOf(promise: Promise<unknown>): Promise<string> {
    const error = await promise.then(
        () => null,
        e => e
    );
    expect(error).toBeInstanceOf(PhotoError);
    return (error as PhotoError).code;
}

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        let c = (crc ^ byte) & 0xff;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

/** A tiny PNG whose header declares width x height (nothing is decoded before the pixel check). */
function pngHeader(width: number, height: number): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(Buffer.alloc(16))),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function box(type: string, payload: Buffer): Buffer {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length, 0);
    header.write(type, 4, 'latin1');
    return Buffer.concat([header, payload]);
}

/** A HEIC skeleton: `ftyp heic` and, optionally, `meta > iprp > ipco > ispe` with the given size. */
function heic(size?: { width: number; height: number }): Buffer {
    const ftyp = box('ftyp', Buffer.concat([Buffer.from('heic', 'latin1'), Buffer.alloc(4), Buffer.from('mif1heic')]));
    if (!size) {
        return Buffer.concat([ftyp, box('mdat', Buffer.alloc(32))]);
    }
    const ispePayload = Buffer.alloc(12);
    ispePayload.writeUInt32BE(size.width, 4);
    ispePayload.writeUInt32BE(size.height, 8);
    const thumbnail = Buffer.alloc(12);
    thumbnail.writeUInt32BE(320, 4);
    thumbnail.writeUInt32BE(240, 8);
    const ipco = box('ipco', Buffer.concat([box('ispe', thumbnail), box('ispe', ispePayload)]));
    const meta = box('meta', Buffer.concat([Buffer.alloc(4), box('hdlr', Buffer.alloc(24)), box('iprp', ipco)]));
    return Buffer.concat([ftyp, meta, box('mdat', Buffer.alloc(32))]);
}

describe('sanitizePhoto', () => {
    beforeEach(() => convert.mockReset());

    it('refuses an empty file and one over 10 MB', async () => {
        expect(await codeOf(sanitizePhoto(Buffer.alloc(0)))).toBe('FILE_REQUIRED');
        expect(await codeOf(sanitizePhoto(Buffer.alloc(PHOTO_MAX_BYTES + 1)))).toBe('FILE_TOO_LARGE');
    });

    it('refuses GIF, SVG, TIFF and animated WebP', async () => {
        const frame = (colour: string) =>
            sharp({ create: { width: 8, height: 8, channels: 3, background: colour } })
                .png()
                .toBuffer();
        const animated = await sharp([await frame('#f00'), await frame('#0f0')], { join: { animated: true } })
            .webp()
            .toBuffer();
        const svg = Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>'
        );
        for (const input of [await solid(8, 8).gif().toBuffer(), svg, await solid(8, 8).tiff().toBuffer(), animated]) {
            expect(await codeOf(sanitizePhoto(input))).toBe('FILE_TYPE');
        }
    });

    it('refuses a 50 MP image with the explicit pixel check, before any decode', async () => {
        expect(await codeOf(sanitizePhoto(pngHeader(10000, 5000)))).toBe('FILE_TOO_LARGE');
    });

    it('refuses a HEIC whose ispe box says 50 MP before heic-convert runs', async () => {
        expect(heicPixelCount(heic({ width: 10000, height: 5000 }))).toBe(50_000_000);
        expect(await codeOf(sanitizePhoto(heic({ width: 10000, height: 5000 })))).toBe('FILE_TOO_LARGE');
        expect(convert).not.toHaveBeenCalled();
    });

    it('caps HEIC at 25 MP (a 24 MP iPhone photo passes, 39.9 MP does not)', async () => {
        convert.mockResolvedValueOnce(await solid(40, 30).jpeg().toBuffer());
        await sanitizePhoto(heic({ width: 5712, height: 4284 }));
        expect(await codeOf(sanitizePhoto(heic({ width: 7300, height: 5460 })))).toBe('FILE_TOO_LARGE');
        expect(convert).toHaveBeenCalledTimes(1);
    });

    it('a HEIC without ispe, or one heic-convert rejects, is NOT_DECODABLE', async () => {
        expect(await codeOf(sanitizePhoto(heic()))).toBe('NOT_DECODABLE');
        expect(convert).not.toHaveBeenCalled();

        convert.mockRejectedValueOnce(new Error('broken'));
        expect(await codeOf(sanitizePhoto(heic({ width: 4032, height: 3024 })))).toBe('NOT_DECODABLE');
        expect(convert).toHaveBeenCalledTimes(1);
    });

    it('accepts JPEG, PNG, WebP and HEIC (converted)', async () => {
        const jpeg = await solid(40, 30).jpeg().toBuffer();
        convert.mockResolvedValueOnce(jpeg);
        for (const input of [
            jpeg,
            await solid(40, 30).png().toBuffer(),
            await solid(40, 30).webp().toBuffer(),
            heic({ width: 4032, height: 3024 }),
        ]) {
            const result = await sanitizePhoto(input);
            expect((await sharp(result.data).metadata()).format).toBe('webp');
        }
        expect(convert).toHaveBeenCalledTimes(1);
    });

    it('applies the EXIF orientation and keeps no EXIF, XMP or ICC', async () => {
        const rotated = await solid(40, 20).jpeg().withMetadata({ orientation: 6 }).toBuffer();
        expect((await sharp(rotated).metadata()).exif).toBeDefined();

        const result = await sanitizePhoto(rotated);
        expect([result.width, result.height]).toEqual([20, 40]);
        const metadata = await sharp(result.data).metadata();
        expect(metadata.exif).toBeUndefined();
        expect(metadata.xmp).toBeUndefined();
        expect(metadata.icc).toBeUndefined();
        expect(metadata.orientation).toBeUndefined();
    });

    it('fits the long edge inside 1024 px and gives a stable sha256', async () => {
        const input = await solid(3000, 1500).jpeg().toBuffer();
        const first = await sanitizePhoto(input);
        expect(Math.max(first.width, first.height)).toBe(1024);
        const second = await sanitizePhoto(input);
        expect(second.sha256).toBe(first.sha256);
        expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('PHOTO_MULTER_OPTIONS', () => {
    const filter = (mimetype: string) =>
        new Promise<{ error: Error | null; accept: boolean }>(resolve =>
            (PHOTO_MULTER_OPTIONS.fileFilter as any)({}, { mimetype }, (error: Error | null, accept: boolean) =>
                resolve({ error, accept })
            )
        );

    it('limits one file of 10 MB and few small fields', () => {
        expect(PHOTO_MULTER_OPTIONS.limits).toEqual({
            fileSize: PHOTO_MAX_BYTES,
            files: 1,
            fields: 5,
            fieldSize: 1024,
        });
    });

    it('accepts the photo types and the sniffed ones, refuses others with PhotoTypeError', async () => {
        for (const type of [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
            'application/octet-stream',
            '',
        ]) {
            expect(await filter(type)).toEqual({ error: null, accept: true });
        }
        const refused = await filter('image/gif');
        expect(refused.accept).toBe(false);
        expect(refused.error).toBeInstanceOf(PhotoTypeError);
    });
});

describe('HEIC conversion off the main thread', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-heic-'));
    const moduleFile = (name: string, body: string) => {
        const path = join(dir, name);
        writeFileSync(path, body);
        return path;
    };

    it('converts in a worker and returns the bytes', async () => {
        const modulePath = moduleFile(
            'ok.js',
            'module.exports = async ({ buffer }) => Buffer.concat([Buffer.from("J"), buffer]);'
        );
        const out = await convertHeicInWorker(Buffer.from('heic'), { modulePath, timeoutMs: 5000 });
        expect(out.toString()).toBe('Jheic');
    });

    it('terminates a conversion that blocks, while the main thread keeps running', async () => {
        const modulePath = moduleFile('stuck.js', 'module.exports = () => { for (;;) {} };');
        let ticks = 0;
        const interval = setInterval(() => (ticks += 1), 10);
        const started = Date.now();
        const error = await convertHeicInWorker(Buffer.from('heic'), { modulePath, timeoutMs: 300 }).then(
            () => null,
            e => e
        );
        clearInterval(interval);
        expect(error?.message).toMatch(/timed out/);
        expect(Date.now() - started).toBeLessThan(3000);
        expect(ticks).toBeGreaterThan(5);
    });

    it('a converter that throws rejects', async () => {
        const modulePath = moduleFile('broken.js', 'module.exports = async () => { throw new Error("broken"); };');
        await expect(convertHeicInWorker(Buffer.from('heic'), { modulePath, timeoutMs: 5000 })).rejects.toThrow(
            'broken'
        );
    });

    it('Slots: at most `limit` at once, a bounded queue, FIFO hand-over', async () => {
        const slots = new Slots(2, 1);
        const first = await slots.acquire();
        const second = await slots.acquire();
        let thirdGot = false;
        const third = slots.acquire().then(release => {
            thirdGot = true;
            return release;
        });
        expect(await slots.acquire()).toBeNull();
        await Promise.resolve();
        expect(thirdGot).toBe(false);
        first?.();
        first?.();
        const release = await third;
        expect(thirdGot).toBe(true);
        second?.();
        release?.();
        expect(await slots.acquire()).not.toBeNull();
    });
});
