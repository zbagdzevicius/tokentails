import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { createHash } from 'crypto';
import sharp = require('sharp');
import { Worker } from 'worker_threads';
import { isHeicImage } from './image.utils';

/*
 * Visitor photo uploads (bet #3 `/yourcat` and `POST /image/portrait`; docs/plans/yourcat-v2.md section
 * 2.6). Modelled on impact/outcome-image.ts (copied, not imported):
 *
 * 1. size and type limits, with the pixel count checked before any decode or HEIC conversion;
 * 2. decode JPEG, PNG or WebP (HEIC/HEIF converted first), single frame only;
 * 3. apply the EXIF orientation, fit inside 1024 px, re-encode as WebP with no metadata (sharp writes
 *    none unless asked: no EXIF, GPS, XMP or ICC name).
 */

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_EDGE = 1024;
export const PHOTO_MAX_INPUT_PIXELS = 40_000_000;
/**
 * HEIC is decoded in pure JS (`heic-convert`: libheif wasm and jpeg-js), so its cap is lower: 25 MP
 * still takes the 24 MP default of current iPhones (5712 x 4284) and halves the worst-case memory.
 */
export const PHOTO_MAX_HEIC_PIXELS = 25_000_000;
/** The conversion runs in a worker thread, which is terminated after this long. */
export const HEIC_CONVERT_TIMEOUT_MS = 15_000;
/** Conversions at once per process; further ones wait for a free slot. */
export const HEIC_MAX_CONCURRENT = 2;
/** Conversions waiting for a slot; one more is refused at once (NOT_DECODABLE) instead of queueing. */
export const HEIC_MAX_WAITING = 8;

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
/** Some browsers send HEIC as `application/octet-stream` or with no type: the byte sniff decides. */
const SNIFFED_MIME_TYPES = ['application/octet-stream', ''];
const DECODED_FORMATS = ['jpeg', 'png', 'webp'];

/** Raised by the multer file filter; `PhotoUploadExceptionFilter` maps it to 400 FILE_TYPE. */
export class PhotoTypeError extends Error {
    constructor(message = 'Use a JPEG, PNG, WebP or HEIC photo') {
        super(message);
        this.name = 'PhotoTypeError';
    }
}

export type PhotoErrorCode = 'FILE_REQUIRED' | 'FILE_TOO_LARGE' | 'FILE_TYPE' | 'NOT_DECODABLE';

export class PhotoError extends Error {
    constructor(readonly code: PhotoErrorCode, message: string = code) {
        super(message);
        this.name = 'PhotoError';
    }
}

export const PHOTO_MULTER_OPTIONS: MulterOptions = {
    limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 5, fieldSize: 1024 },
    fileFilter: (_req: any, file: { mimetype?: string }, callback: (error: Error | null, accept: boolean) => void) => {
        const type = (file?.mimetype || '').toLowerCase();
        if (PHOTO_MIME_TYPES.includes(type) || SNIFFED_MIME_TYPES.includes(type)) {
            callback(null, true);
            return;
        }
        callback(new PhotoTypeError(), false);
    },
};

export interface SanitizedPhoto {
    data: Buffer;
    width: number;
    height: number;
    sha256: string;
}

interface IBox {
    type: string;
    start: number;
    end: number;
}

/** The ISO-BMFF boxes between `start` and `end` (HEIC is an ISO base media file). */
function boxes(buffer: Buffer, start: number, end: number): IBox[] {
    const found: IBox[] = [];
    let offset = start;
    while (offset + 8 <= end) {
        let size = buffer.readUInt32BE(offset);
        const type = buffer.toString('latin1', offset + 4, offset + 8);
        let header = 8;
        if (size === 1) {
            if (offset + 16 > end) {
                break;
            }
            size = Number(buffer.readBigUInt64BE(offset + 8));
            header = 16;
        } else if (size === 0) {
            size = end - offset;
        }
        if (size < header || offset + size > end) {
            break;
        }
        found.push({ type, start: offset + header, end: offset + size });
        offset += size;
    }
    return found;
}

const child = (buffer: Buffer, parent: IBox, type: string, skip = 0) =>
    boxes(buffer, parent.start + skip, parent.end).filter(box => box.type === type);

/**
 * The largest image size declared by the HEIC `ispe` (image spatial extent) properties, as a pixel
 * count, without decoding anything: `meta` (a full box) > `iprp` > `ipco` > `ispe`. Null when there is
 * no `ispe` box. The largest one is the primary image or its grid, never a thumbnail.
 */
export function heicPixelCount(buffer: Buffer): number | null {
    let largest = 0;
    for (const meta of boxes(buffer, 0, buffer.length).filter(box => box.type === 'meta')) {
        for (const iprp of child(buffer, meta, 'iprp', 4)) {
            for (const ipco of child(buffer, iprp, 'ipco')) {
                for (const ispe of child(buffer, ipco, 'ispe')) {
                    if (ispe.end - ispe.start < 12) {
                        continue;
                    }
                    // Full box: version and flags (4 bytes), then width and height.
                    const width = buffer.readUInt32BE(ispe.start + 4);
                    const height = buffer.readUInt32BE(ispe.start + 8);
                    largest = Math.max(largest, width * height);
                }
            }
        }
    }
    return largest > 0 ? largest : null;
}

/*
 * HEIC conversion off the main thread. `heic-convert` is synchronous pure JS: run inline, a 40 MP file
 * blocks the event loop for seconds (every other route stalls) and a `Promise.race` timeout cannot fire.
 * In a worker the main thread stays free and a stuck conversion is terminated. The worker loads the
 * module by its resolved path, so it works from `src/` (specs) and `dist/` alike.
 */
const HEIC_WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
Promise.resolve()
    .then(() => require(workerData.modulePath)({ buffer: workerData.input, format: 'JPEG', quality: 0.92 }))
    .then(
        output => parentPort.postMessage({ ok: true, data: Buffer.from(output) }),
        error => parentPort.postMessage({ ok: false, message: String((error && error.message) || error) })
    );
`;

/** Converts one HEIC buffer to JPEG in a worker thread; rejects (and terminates it) after `timeoutMs`. */
export function convertHeicInWorker(
    input: Buffer,
    options: { timeoutMs?: number; modulePath?: string } = {}
): Promise<Buffer> {
    const timeoutMs = options.timeoutMs ?? HEIC_CONVERT_TIMEOUT_MS;
    const modulePath = options.modulePath ?? require.resolve('heic-convert');
    return new Promise<Buffer>((resolve, reject) => {
        let settled = false;
        const worker = new Worker(HEIC_WORKER_SOURCE, { eval: true, workerData: { input, modulePath } });
        const finish = (error: Error | null, data?: Buffer) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            void worker.terminate();
            if (error) {
                reject(error);
            } else {
                resolve(data as Buffer);
            }
        };
        const timer = setTimeout(() => finish(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
        worker.on('message', (message: { ok: boolean; data?: Uint8Array; message?: string }) =>
            message?.ok && message.data
                ? finish(null, Buffer.from(message.data))
                : finish(new Error(message?.message || 'HEIC conversion failed'))
        );
        worker.on('error', error => finish(error));
        worker.on('exit', code => finish(new Error(`HEIC worker exited with code ${code}`)));
    });
}

/** A small counting semaphore: at most `limit` holders, at most `maxWaiting` in the queue. */
export class Slots {
    private active = 0;
    private readonly waiting: (() => void)[] = [];

    constructor(private readonly limit: number, private readonly maxWaiting: number) {}

    /** Resolves with a release function, or with null when the queue is full. */
    acquire(): Promise<(() => void) | null> {
        if (this.active < this.limit) {
            this.active += 1;
            return Promise.resolve(this.releaser());
        }
        if (this.waiting.length >= this.maxWaiting) {
            return Promise.resolve(null);
        }
        return new Promise(resolve => this.waiting.push(() => resolve(this.releaser())));
    }

    private releaser(): () => void {
        let released = false;
        return () => {
            if (released) {
                return;
            }
            released = true;
            const next = this.waiting.shift();
            if (next) {
                next();
            } else {
                this.active -= 1;
            }
        };
    }
}

const heicSlots = new Slots(HEIC_MAX_CONCURRENT, HEIC_MAX_WAITING);

/** The HEIC converter, replaceable in specs (the worker does not see jest module mocks). */
export const heicIo = { convert: (input: Buffer) => convertHeicInWorker(input) };

const SHARP_INPUT = { limitInputPixels: PHOTO_MAX_INPUT_PIXELS, failOn: 'error' as const };

/** Checks, decodes and re-encodes a visitor photo. Throws `PhotoError`; never stores anything. */
export async function sanitizePhoto(input: Buffer): Promise<SanitizedPhoto> {
    if (!Buffer.isBuffer(input) || !input.length) {
        throw new PhotoError('FILE_REQUIRED', 'No photo was sent');
    }
    if (input.length > PHOTO_MAX_BYTES) {
        throw new PhotoError('FILE_TOO_LARGE', 'The photo is larger than 10 MB');
    }

    let decodable = input;
    if (isHeicImage(input)) {
        const pixels = heicPixelCount(input);
        if (pixels === null) {
            throw new PhotoError('NOT_DECODABLE', 'The HEIC photo has no image size');
        }
        if (pixels > PHOTO_MAX_HEIC_PIXELS) {
            throw new PhotoError('FILE_TOO_LARGE', 'The photo has too many pixels');
        }
        const release = await heicSlots.acquire();
        if (!release) {
            throw new PhotoError('NOT_DECODABLE', 'Too many HEIC photos are being converted; try again');
        }
        try {
            decodable = await heicIo.convert(input);
        } catch {
            throw new PhotoError('NOT_DECODABLE', 'The HEIC photo could not be converted');
        } finally {
            release();
        }
    }

    let metadata: sharp.Metadata;
    try {
        // Header only. sharp 0.34 refuses an over-limit header here with a generic error, so the limit is
        // lifted for this read and the pixel count is checked explicitly below (FILE_TOO_LARGE, not a
        // decode error). The decode further down runs with the limit.
        metadata = await sharp(decodable, { limitInputPixels: false, failOn: 'error' }).metadata();
    } catch {
        throw new PhotoError('NOT_DECODABLE', 'The photo could not be read');
    }
    if (!metadata.format || !DECODED_FORMATS.includes(metadata.format) || (metadata.pages ?? 1) > 1) {
        throw new PhotoError('FILE_TYPE', 'Use a JPEG, PNG, WebP or HEIC photo');
    }
    if (!metadata.width || !metadata.height) {
        throw new PhotoError('NOT_DECODABLE', 'The photo has no size');
    }
    if (metadata.width * metadata.height > PHOTO_MAX_INPUT_PIXELS) {
        throw new PhotoError('FILE_TOO_LARGE', 'The photo has too many pixels');
    }

    try {
        const { data, info } = await sharp(decodable, SHARP_INPUT)
            .rotate()
            .resize(PHOTO_MAX_EDGE, PHOTO_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer({ resolveWithObject: true });
        return {
            data,
            width: info.width,
            height: info.height,
            sha256: createHash('sha256').update(data).digest('hex'),
        };
    } catch {
        throw new PhotoError('NOT_DECODABLE', 'The photo could not be decoded');
    }
}
