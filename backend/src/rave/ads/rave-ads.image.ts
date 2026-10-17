import { createHash } from 'crypto';
import sharp = require('sharp');
import { RaveAdSlotSpec } from './rave-ads.slots';

/*
 * Ad image: PNG, JPEG or WebP up to 2 MB, single frame. Decoded with a pixel cap, EXIF-rotated,
 * cropped to the slot's aspect (centre), resized to the slot's pixel size and re-encoded as WebP with no
 * metadata (sharp writes none unless asked). The stored file is never the upload itself.
 */

export const RAVE_AD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const RAVE_AD_IMAGE_MAX_PIXELS = 40_000_000;
export const RAVE_AD_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const DECODED_FORMATS = ['png', 'jpeg', 'webp'];

export type AdImageErrorCode = 'IMAGE_REQUIRED' | 'IMAGE_TOO_LARGE' | 'IMAGE_TYPE' | 'IMAGE_DECODE';

export class AdImageError extends Error {
    constructor(readonly code: AdImageErrorCode) {
        super(code);
        this.name = 'AdImageError';
    }
}

export interface SanitizedAdImage {
    data: Buffer;
    width: number;
    height: number;
    sha256: string;
}

export async function sanitizeAdImage(
    input: Buffer | undefined | null,
    slot: Pick<RaveAdSlotSpec, 'width' | 'height'>
): Promise<SanitizedAdImage> {
    if (!input || !input.length) throw new AdImageError('IMAGE_REQUIRED');
    if (input.length > RAVE_AD_IMAGE_MAX_BYTES) throw new AdImageError('IMAGE_TOO_LARGE');
    let meta: sharp.Metadata;
    try {
        meta = await sharp(input, { limitInputPixels: RAVE_AD_IMAGE_MAX_PIXELS }).metadata();
    } catch {
        throw new AdImageError('IMAGE_DECODE');
    }
    if (!meta.format || !DECODED_FORMATS.includes(meta.format)) throw new AdImageError('IMAGE_TYPE');
    if ((meta.pages || 1) > 1) throw new AdImageError('IMAGE_TYPE');
    if (!meta.width || !meta.height || meta.width * meta.height > RAVE_AD_IMAGE_MAX_PIXELS) {
        throw new AdImageError('IMAGE_DECODE');
    }
    let data: Buffer;
    let info: sharp.OutputInfo;
    try {
        const out = await sharp(input, { limitInputPixels: RAVE_AD_IMAGE_MAX_PIXELS, pages: 1 })
            .rotate()
            .resize(slot.width, slot.height, { fit: 'cover', position: 'centre' })
            .flatten({ background: '#05140a' })
            .webp({ quality: 86 })
            .toBuffer({ resolveWithObject: true });
        data = out.data;
        info = out.info;
    } catch {
        throw new AdImageError('IMAGE_DECODE');
    }
    return {
        data,
        width: info.width,
        height: info.height,
        sha256: createHash('sha256').update(data).digest('hex'),
    };
}
