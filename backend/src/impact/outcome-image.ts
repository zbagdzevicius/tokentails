import { BadRequestException } from '@nestjs/common';
import sharp = require('sharp');
import { sha256Hex } from './attestation';

/*
 * Outcome image redaction (plan G11 `ShelterOutcome`), on the same sharp pipeline as the image uploads
 * (shared/utils/image.utils.ts: decode, webp, resize to fit 1000-ish px):
 *
 * 1. decode (JPEG, PNG or WebP only) and apply the EXIF orientation;
 * 2. fit inside OUTCOME_IMAGE_MAX px;
 * 3. pixelate every reviewer-drawn box (faces, documents, addresses, plates);
 * 4. re-encode as WebP with no metadata (sharp writes none unless asked: no EXIF, GPS or ICC names).
 *
 * The result stays private (Mongo) until a second reviewer publishes the outcome.
 */

export const OUTCOME_IMAGE_MAX = 1200;
export const OUTCOME_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const OUTCOME_IMAGE_MAX_REGIONS = 20;
/** Pixel blocks across the shorter side of a box: coarse enough that no face or text survives. */
const PIXELATE_BLOCKS = 8;
const FORMATS = ['jpeg', 'png', 'webp'];

export interface RedactionRegion {
    /** Normalised to the image: 0..1 from the top-left corner. */
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface RedactedImage {
    data: Buffer;
    width: number;
    height: number;
    sha256: string;
    regions: RedactionRegion[];
}

/** Parses the `regions` field (a JSON string from a multipart form, or an array). Throws 400. */
export function parseRegions(raw: unknown): RedactionRegion[] {
    if (raw === undefined || raw === null || raw === '') {
        return [];
    }
    let value: unknown = raw;
    if (typeof raw === 'string') {
        try {
            value = JSON.parse(raw);
        } catch {
            throw new BadRequestException('regions must be JSON');
        }
    }
    if (!Array.isArray(value) || value.length > OUTCOME_IMAGE_MAX_REGIONS) {
        throw new BadRequestException(`regions must be a list of up to ${OUTCOME_IMAGE_MAX_REGIONS} boxes`);
    }
    return value.map(box => {
        const { x, y, w, h } = (box || {}) as Record<string, unknown>;
        const nums = [x, y, w, h].map(Number);
        if (nums.some(n => !Number.isFinite(n) || n < 0 || n > 1) || nums[2] <= 0 || nums[3] <= 0) {
            throw new BadRequestException('each region needs x, y, w, h between 0 and 1');
        }
        return { x: nums[0], y: nums[1], w: Math.min(nums[2], 1 - nums[0]), h: Math.min(nums[3], 1 - nums[1]) };
    });
}

export async function redactOutcomeImage(input: Buffer, regions: RedactionRegion[] = []): Promise<RedactedImage> {
    if (!Buffer.isBuffer(input) || !input.length) {
        throw new BadRequestException('An image file is required');
    }
    if (input.length > OUTCOME_IMAGE_MAX_BYTES) {
        throw new BadRequestException('The image is larger than 10 MB');
    }
    let format: string | undefined;
    try {
        format = (await sharp(input).metadata()).format;
    } catch {
        throw new BadRequestException('The file is not an image');
    }
    if (!format || !FORMATS.includes(format)) {
        throw new BadRequestException('Use a JPEG, PNG or WebP image');
    }
    const { data: base, info } = await sharp(input)
        .rotate()
        .resize(OUTCOME_IMAGE_MAX, OUTCOME_IMAGE_MAX, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;

    const overlays: sharp.OverlayOptions[] = [];
    for (const region of regions) {
        const left = Math.max(0, Math.floor(region.x * width));
        const top = Math.max(0, Math.floor(region.y * height));
        const w = Math.max(1, Math.min(width - left, Math.ceil(region.w * width)));
        const h = Math.max(1, Math.min(height - top, Math.ceil(region.h * height)));
        const block = Math.max(1, Math.round(Math.min(w, h) / PIXELATE_BLOCKS));
        const small = await sharp(base)
            .extract({ left, top, width: w, height: h })
            .resize(Math.max(1, Math.round(w / block)), Math.max(1, Math.round(h / block)), { fit: 'fill' })
            .toBuffer();
        const tile = await sharp(small).resize(w, h, { fit: 'fill', kernel: 'nearest' }).png().toBuffer();
        overlays.push({ input: tile, left, top });
    }
    const data = await sharp(base).composite(overlays).webp({ quality: 80 }).toBuffer();
    return { data, width, height, sha256: sha256Hex(data), regions };
}
