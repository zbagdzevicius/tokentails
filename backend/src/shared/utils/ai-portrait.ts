import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import { Types } from 'mongoose';
import fetch from 'node-fetch';
import { ImageRepository } from 'src/image/image.repository';
import { v4 as generateFilename } from 'uuid';
import { uploadFileImage } from './image.utils';
import { ImageStyle } from 'src/image/image.schema';

dotenv.config();

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

/**
 * Generates an AI portrait for an existing image and updates the image's aiUrl property
 * @param imageId - The ID of the image to generate a portrait for
 * @param imageRepository - The ImageRepository instance to fetch and update the image
 * @returns The generated AI image URL
 */
export async function generatePortraitForImage(
    imageId: string,
    imageRepository: ImageRepository,
    style?: ImageStyle
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

        // Fetch the input image from URL
        const imageResponse = await fetch(image.url);
        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');

        // Determine MIME type from the image URL or response headers
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        const mimeType = contentType.split(';')[0];

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
            },
        });

        // Extract the generated image from the response
        const generatedImagePart = result.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData);

        if (!generatedImagePart?.inlineData?.data) {
            throw new Error('No image generated in the response');
        }

        // Convert base64 image to buffer
        const generatedImageBase64 = generatedImagePart.inlineData.data;
        const generatedImageBuffer = Buffer.from(generatedImageBase64, 'base64');

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
