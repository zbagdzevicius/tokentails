import sharp = require('sharp');
import { hasWhiteBorders } from './ai-avatar';

jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn(() => ({ models: { generateContent: jest.fn() } })) }));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('./image.utils', () => ({ uploadFileImage: jest.fn() }));
jest.mock('src/cat/cat.schema', () => ({ CatAbilityType: {}, CatAbilityTypes: [] }));

/** A `width` x `height` image of `fill`, with a `border`-pixel white frame when `border` > 0. */
async function framed(channels: 3 | 4, border: number, width = 100, height = 100, fill = '#3a5f2b') {
    const base = sharp({ create: { width, height, channels, background: '#ffffff' } });
    if (!border) {
        return sharp({ create: { width, height, channels, background: fill } })
            .png()
            .toBuffer();
    }
    const inner = await sharp({
        create: { width: width - 2 * border, height: height - 2 * border, channels, background: fill },
    })
        .png()
        .toBuffer();
    const composed = await base
        .composite([{ input: inner, left: border, top: border }])
        .png()
        .toBuffer();
    // `composite` adds an alpha channel; drop it again for the 3-channel case.
    return channels === 3 ? sharp(composed).removeAlpha().png().toBuffer() : composed;
}

describe('hasWhiteBorders (KI-23)', () => {
    it('finds a white frame on a 3-channel (RGB) PNG', async () => {
        const png = await framed(3, 5);
        expect((await sharp(png).metadata()).channels).toBe(3);
        await expect(hasWhiteBorders(png)).resolves.toBe(true);
    });

    it('finds a white frame on an RGBA PNG', async () => {
        await expect(hasWhiteBorders(await framed(4, 5))).resolves.toBe(true);
    });

    it('a full-bleed RGB image with no white edge is not framed', async () => {
        await expect(hasWhiteBorders(await framed(3, 0))).resolves.toBe(false);
    });

    it('a non-square RGB image with a white frame is found too', async () => {
        await expect(hasWhiteBorders(await framed(3, 6, 120, 180))).resolves.toBe(true);
    });

    it('undecodable bytes are treated as no border', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(hasWhiteBorders(Buffer.from('nope'))).resolves.toBe(false);
    });
});
