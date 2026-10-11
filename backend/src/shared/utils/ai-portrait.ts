import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import { Types } from 'mongoose';
import { AiCallOptions, geminiImageUsage } from 'src/ai-budget/ai-cost';
import { ImageRepository } from 'src/image/image.repository';
import {
    deleteObject,
    loadImageBytes,
    PORTRAIT_PRIVATE_PREFIX,
    PRIVATE_URL_PREFIX,
    privateKeyOf,
    uploadFile,
    uploadPrivateObject,
} from './aws.utils';
import { v4 as generateFilename } from 'uuid';
import { uploadFileImage } from './image.utils';
import { ImageStyle } from 'src/image/image.schema';
import sharp = require('sharp');

dotenv.config();

export { loadImageBytes };

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

export const PORTRAIT_PROMPT_MAP: Record<ImageStyle, string> = {
    [ImageStyle.HIGHNESS]: `Transform the provided pet photo into a refined European Old Masters oil painting inspired by late-17th-century aristocratic portraiture.

Preserve identity exactly: same facial structure, fur pattern, coloration, eyes, whiskers, and expression. No stylization drift.

Compose a formal royal portrait: centered, balanced, vertical museum proportions, medium distance (waist-up equivalent), front or subtle 3/4 view, paws visible and relaxed. Multiple pets allowed only if present in input, arranged hierarchically.

Dress subjects in understated aristocratic regalia: ivory or warm cream embroidered cloaks, restrained gold trim with subtle floral or baroque motifs, minimal elegant gold jewelry only. No crowns unless extremely subtle.

Setting: plush velvet cushion in muted olive or deep moss green with gold tassels. Background is neutral drapery or a dark painterly void in warm umber, brown-gray, or muted taupe.

Lighting: authentic Baroque chiaroscuro (single soft light from upper left), gentle highlights on eyes and muzzle, warm deep shadows, no harsh blacks. Palette limited to creams, golds, olives, warm browns.

Painterly oil-on-canvas execution with visible brushwork, layered pigments, soft edges, subtle canvas grain. Fur rendered painterly, not photographic.

Mood: quiet authority, timeless, museum-grade.
Ultra-high resolution. No modern objects, no fantasy anatomy, no text.`,
    [ImageStyle.MONARCH]: `A monarch pet seated gracefully in a relaxed yet regal pose (non-human), head held gracefully, eyes open and attentive, body partially draped with a heavy velvet cloak, only the head, front paws, and part of the body visible. Classical oil painting style, dark fantasy fable portrait, 17th century old master aesthetic, dramatic chiaroscuro lighting, deep shadows, rich textures, painterly realism, museum-quality fine art, cinematic mood, realistic fur detail, dark neutral background, no modern elements, no text, no watermark. add royal crown on the head if the pet is a king/queen.`,
    [ImageStyle.ARISTOCRAT]: `A aristocrat pet seated gracefully on a velvet pillow, head held sideways or slightly tilted, body partially covered by an elegant emerald and midnight-blue velvet cloak, refined and subtle ornamentation. Intelligent, thoughtful expression, conveying quiet nobility rather than power. Classical oil-painted portrait, baroque lighting, soft shadows, rich fabric textures, painterly realism, dark atmospheric background, fine art fable aesthetic. Add painting style-matching aristocratic accessory`,
    [ImageStyle.COMMANDER]: `A commander pet seated regally on a worn velvet pillow, body wrapped in a dark burgundy or black military-style cloak fastened with a metal clasp, subtle chain detail. Eyes sharp and vigilant, exuding a battle-hardened presence, calm and authoritative. Renaissance oil painting style, dramatic low-key lighting, deep contrast, heavy fabric textures, cinematic realism, dark fantasy fable mood, museum-quality fine art. Add painting style-matching military accessory`,
};

/** Longest side of the public, watermarked `/portrait` preview (KI-08). */
export const PORTRAIT_PREVIEW_MAX_PX = 1024;

const escapeXml = (text: string) =>
    text.replace(/[<>&'"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]!));

/**
 * The public preview of a `/portrait` output: at most 1024 px on its longest side, with a tiled diagonal
 * "PREVIEW" watermark and a translucent band (so it still reads as a preview where the server has no
 * fonts), as webp.
 */
export async function watermarkedPreview(buffer: Buffer, label = 'PREVIEW · tokentails.com'): Promise<Buffer> {
    const resized = await sharp(buffer)
        .rotate()
        .resize(PORTRAIT_PREVIEW_MAX_PX, PORTRAIT_PREVIEW_MAX_PX, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true });
    const { width, height } = resized.info;
    const size = Math.max(14, Math.round(Math.min(width, height) / 18));
    const step = size * 8;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="wm" width="${step}" height="${size * 4}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${
          size * 2
      }" font-family="Helvetica, Arial, DejaVu Sans, sans-serif" font-size="${size}" font-weight="700"
        fill="#ffffff" fill-opacity="0.45" stroke="#000000" stroke-opacity="0.25" stroke-width="1">${escapeXml(
            label
        )}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)"/>
  <rect x="0" y="${Math.round(height / 2 - size)}" width="${width}" height="${
        size * 2
    }" fill="#000000" fill-opacity="0.18"/>
</svg>`;
    return sharp(resized.data)
        .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
        .webp({ quality: 80 })
        .toBuffer();
}

export type PaidPortraitImage = { _id?: unknown; aiUrl?: string | null; source?: string | null };

/**
 * A paid `/portrait` image's full 4K output, made public: the private `s3private://portraits/...` object
 * is copied to a new public uuid key and `aiUrl` is set to it. Returns the public URL; an `aiUrl` that is
 * already public is returned as is; null when there is nothing to publish. Call only once its order is
 * COMPLETE. Delivery paths go through `deliverPaidPortraitUrl` (paid-portrait.ts), which uses `outcome`:
 * `outcome.publishedNow` is true only for the one call whose update found `aiUrl` still private (the
 * update returns the document as it was before it, and MongoDB applies updates to one document in turn),
 * so of concurrent publishers exactly one delivers.
 */
export async function publishPaidPortrait(
    image: PaidPortraitImage,
    imageRepository: ImageRepository,
    outcome: { publishedNow?: boolean } = {}
): Promise<string | null> {
    outcome.publishedNow = false;
    if (!image?.aiUrl) {
        return null;
    }
    if (privateKeyOf(image.aiUrl) === null) {
        return image.aiUrl;
    }
    if (image.source !== 'portrait') {
        return null;
    }
    const { data } = await loadImageBytes(image.aiUrl, { allowPrivate: 'portrait' });
    const filename = `${generateFilename()}.png`;
    await uploadFile(filename, data, 'png');
    const url = `${process.env.DO_SPACES_CDN}/${filename}`;
    const before = await imageRepository.update(image._id as any, { aiUrl: url });
    outcome.publishedNow = privateKeyOf((before as { aiUrl?: string } | null)?.aiUrl) !== null;
    return url;
}

/**
 * A `/portrait` output (KI-08): the full 4K PNG goes to a private key (`aiUrl` = `s3private://portraits/
 * <uuid>.png`) and only a watermarked ~1024 px webp is public (`previewUrl`). The previous private output of
 * a regenerated image is deleted. Returns the preview URL.
 */
async function storePortraitPreview(
    image: { _id: any; aiUrl?: string },
    generated: Buffer,
    mimeType: string | undefined,
    imageRepository: ImageRepository
): Promise<string> {
    const png = mimeType === 'image/png' ? generated : await sharp(generated).png().toBuffer();
    const privateKey = `${PORTRAIT_PRIVATE_PREFIX}${generateFilename()}.png`;
    await uploadPrivateObject(privateKey, png, 'image/png');

    const previewName = `${generateFilename()}.webp`;
    await uploadFile(previewName, await watermarkedPreview(generated), 'webp');
    const previewUrl = `${process.env.DO_SPACES_CDN}/${previewName}`;

    await imageRepository.update(image._id, { aiUrl: `${PRIVATE_URL_PREFIX}${privateKey}`, previewUrl });

    const previous = privateKeyOf(image.aiUrl);
    if (previous && previous.startsWith(PORTRAIT_PRIVATE_PREFIX)) {
        await deleteObject(previous).catch(error => console.error('Could not delete the old portrait output:', error));
    }
    return previewUrl;
}

/**
 * Generates an AI portrait for an existing image and updates the image's aiUrl property. A `source:
 * 'portrait'` image keeps its 4K output private and gets a public watermarked `previewUrl` (KI-08, see
 * `storePortraitPreview`); `yourcat` and older images are unchanged (public 4K webp in `aiUrl`).
 * @param imageId - The ID of the image to generate a portrait for
 * @param imageRepository - The ImageRepository instance to fetch and update the image
 * @returns The generated AI image URL (the preview URL for a `portrait` image)
 */
export async function generatePortraitForImage(
    imageId: string,
    imageRepository: ImageRepository,
    style?: ImageStyle,
    options: AiCallOptions = {}
): Promise<string> {
    try {
        // Fetch the existing image
        const image = await imageRepository.findOne({
            searchObject: { _id: new Types.ObjectId(imageId) },
        });

        if (!image) {
            throw new Error(`Image with id ${imageId} not found`);
        }

        if (!image.url) {
            throw new Error(`Image with id ${imageId} has no URL`);
        }

        // The input image: a public URL is fetched; the private original of a paid /yourcat portrait
        // (`s3private://`) is read from the bucket, and only for `source: 'yourcat'` images.
        const { data: imageBuffer, mimeType } = await loadImageBytes(image.url, {
            allowPrivate: image.source === 'yourcat',
        });
        const imageBase64 = imageBuffer.toString('base64');

        // Generate AI portrait
        const contents = [
            {
                inlineData: {
                    data: imageBase64,
                    mimeType: mimeType,
                },
            },
            {
                text: style ? PORTRAIT_PROMPT_MAP[style] : PORTRAIT_PROMPT_MAP[ImageStyle.HIGHNESS],
            },
        ];

        const result = await genAI.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents,
            config: {
                imageConfig: {
                    aspectRatio: '3:4',
                    imageSize: '4K',
                },
                maxOutputTokens: 40000, // Max quality - increased from default
                temperature: 0.1, // Low temperature for consistent, high-quality output
                topP: 0.5,
                topK: 10,
                abortSignal: options.signal,
            },
        });
        options.onUsage?.(geminiImageUsage(result, '4K'));

        // Extract the generated image from the response
        const generatedImagePart = result.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData);

        if (!generatedImagePart?.inlineData?.data) {
            throw new Error('No image generated in the response');
        }

        // Convert base64 image to buffer
        const generatedImageBase64 = generatedImagePart.inlineData.data;
        const generatedImageBuffer = Buffer.from(generatedImageBase64, 'base64');

        if (image.source === 'portrait') {
            return await storePortraitPreview(
                image as any,
                generatedImageBuffer,
                generatedImagePart.inlineData.mimeType,
                imageRepository
            );
        }

        // Generate a unique filename
        const filename = `${generateFilename()}.webp`;

        // Upload the generated image
        await uploadFileImage(generatedImageBuffer, filename, false);

        // Get the CDN URL
        const aiImageUrl = `${process.env.DO_SPACES_CDN}/${filename}`;

        // Update the image's aiUrl property
        await imageRepository.update(image._id, { aiUrl: aiImageUrl });

        return aiImageUrl;
    } catch (error) {
        console.error('Error generating portrait for image:', error);
        throw error;
    }
}
