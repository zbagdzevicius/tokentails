import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as generateFilename } from 'uuid';
import { uploadFileImage } from './image.utils';
import { randomObjectFromArray } from 'src/common/utils';
import { CatAbilityType, CatAbilityTypes } from 'src/cat/cat.schema';
const sharp = require('sharp');
dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });

const POSES: string[] = [
    'idle stance with lifted tail',
    'light forward leap',
    'grounded defensive stance',
    'mid-step movement',
    'crouched ready position',
    'upright alert posture',
    'side-facing agile turn',
    'low stalking movement',
    'balanced landing pose',
    'paw raised preparing an action',
];

const EMOTIONS: string[] = [
    'calm and confident',
    'focused and determined',
    'curious and alert',
    'playful excitement',
    'quiet intensity',
    'brave resolve',
    'mild aggression',
    'surprised awareness',
    'proud dominance',
    'serene control',
];

export const TYPE_LOCATIONS: Record<CatAbilityType, string[]> = {
    ICE: [
        'frozen tundra',
        'snow-covered forest',
        'glacier field',
        'ice cavern',
        'frostbitten valley',
        'polar shoreline',
        'blizzard-swept plains',
        'crystal ice lake',
        'icy mountain pass',
        'snowy cliff ridge',
    ],

    ELECTRIC: [
        'storm-charged plateau',
        'lightning-struck plains',
        'power-scarred ruins',
        'windy highland ridge',
        'metallic canyon',
        'thunder valley',
        'storm cloud overlook',
        'electrified wasteland',
        'ancient tower ruins',
        'rain-soaked battlefield',
    ],

    FIRE: [
        'volcanic foothills',
        'lava-scorched plains',
        'smoldering canyon',
        'charred forest edge',
        'molten rock field',
        'ash-covered valley',
        'burning plateau',
        'cracked obsidian ground',
        'fiery mountain pass',
        'smoke-filled ravine',
    ],

    WIND: [
        'wind-swept plains',
        'high-altitude ridge',
        'floating rock field',
        'open sky plateau',
        'storm corridor',
        'cloud-level cliffs',
        'whispering canyon',
        'mountain updraft pass',
        'aerial overlook',
        'rolling highlands',
    ],

    DARK: [
        'shadowed ruins',
        'moonlit forest',
        'abandoned fortress',
        'fog-choked valley',
        'underground chamber',
        'obsidian canyon',
        'twilight battlefield',
        'forgotten shrine',
        'haunted clearing',
        'nightfall wasteland',
    ],

    WATER: [
        'riverbank',
        'lakeside shore',
        'waterfall basin',
        'coastal cliffs',
        'ocean shallows',
        'tidal flats',
        'misty wetlands',
        'sunken ruins',
        'rain-soaked delta',
        'crystal lagoon',
    ],

    GRASS: [
        'sunlit meadow',
        'lush forest clearing',
        'overgrown ruins',
        'flower-filled valley',
        'ancient grove',
        'rolling grasslands',
        'vine-covered plateau',
        'hidden glade',
        'woodland trail',
        'fertile plains',
    ],

    SAND: [
        'endless desert dunes',
        'wind-carved canyon',
        'sun-baked wasteland',
        'ancient desert ruins',
        'dust storm plains',
        'rocky badlands',
        'salt flats',
        'sandstone cliffs',
        'buried temple',
        'arid valley',
    ],

    FAIRY: [
        'enchanted grove',
        'glowing meadow',
        'crystal garden',
        'fae woodland',
        'luminescent clearing',
        'ancient fairy ruins',
        'floating petal field',
        'mystic glade',
        'sparkling forest path',
        'dreamlike valley',
    ],

    STELLAR: [
        'cosmic plateau',
        'star-lit ruins',
        'celestial observatory',
        'void-touched valley',
        'astral battlefield',
        'floating island cluster',
        'nebula-lit canyon',
        'orbiting stone field',
        'ancient cosmic altar',
        'galactic horizon plain',
    ],
};

const FALLBACK_LOCATIONS: string[] = [
    'open battlefield',
    'natural clearing',
    'rocky terrain',
    'wide plateau',
    'rolling plains',
    'ancient stone ground',
    'weathered trail',
    'valley floor',
    'lowland field',
    'neutral highlands',
];

const prompt = (type: CatAbilityType) => `
Using the provided real cat photo as strict reference, create a 2:3 aspect high-quality Pokémon-style creature

STYLE LOCK:
– Modern official Pokémon creature image style (Pokédex / card art)
– Clean anime linework, thin outlines
– Soft painterly shading with smooth gradients
– Bright, readable colors
– Rounded anatomy, simplified forms
– Clarity over aggression, no cinematic motion

CANVAS & CROP LOCK (NON-NEGOTIABLE):
– The image must fill the entire image canvas edge-to-edge
– No outer canvas padding or margins
– No white or solid-colored border around the image
– Scene must touch all four edges of the image
– The final output must appear fully cropped, as if printed edge-to-edge
– Do NOT center the image on a larger canvas

COMPOSITION BAN:
– No borders, frames, margins, or padding
– No visible canvas edge
– No empty or flat-colored areas
- No fragments of actual input cat

IDENTITY LOCK:
– Cat must clearly match the input photo
– Preserve fur color, markings, face shape, proportions
– Stylization must not break recognizability

CREATURE DESIGN:
– Invent a Pokémon-like creature interpretation of the cat
– Keep facial likeness, proportions, and identity recognizable
– Introduce ONE major fantastical trait that defines this creature
– Trait must feel biological or elemental, not cosmetic
– No accessories
– Result should feel like an official Pokémon species design

CONSTRAINTS:
– No card frames, UI, text, symbols
– No trainers or other creatures
– No photorealism
– One cat only
– Full-bleed image, background fills entire canvas

ELEMENT:
– ${type}-type expressed through subtle energy, aura, or environmental interaction
– Element enhances the cat but does not overpower it
- One strong ${type} element to further enhance the cat

SCENE:
– ${randomObjectFromArray(
    CatAbilityTypes.includes(type) ? TYPE_LOCATIONS[type] : FALLBACK_LOCATIONS
)} suited to the element
– Simplified Pokémon-style background with slight depth blur

POSE & EMOTION:
– ${randomObjectFromArray(POSES)}
– ${randomObjectFromArray(EMOTIONS)}
– Single clear action

BACKGROUND LOCK (NON-NEGOTIABLE):
– Background must be fully filled and environment-based
– No white, transparent, flat, or empty background
– No studio lighting or isolated subject
– Environment must exist behind and beneath the cat
– Ground, horizon, and depth must be visible
– Image must look like a Pokémon card artwork background, not a sticker
– If background is missing, regenerate with full environment

IMPORTANT: aspect ratio must be 2:3
`;

/**
 * Detects if an image has white borders by analyzing edge pixels
 * @param imageBuffer - The image buffer to analyze
 * @param threshold - Percentage of white pixels on edges to consider it a border (0-1)
 * @param whiteThreshold - RGB value threshold to consider a pixel "white" (0-255)
 * @returns true if white borders are detected
 */
async function hasWhiteBorders(
    imageBuffer: Buffer,
    threshold = 0.3, // 30% of edge pixels must be white
    whiteThreshold = 240 // RGB values above this are considered white
): Promise<boolean> {
    try {
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();
        const { width, height } = metadata;

        if (!width || !height) {
            return false;
        }

        // Extract edge pixels: top, bottom, left, right
        const edgeWidth = Math.max(1, Math.floor(width * 0.05)); // 5% of width for edges
        const edgeHeight = Math.max(1, Math.floor(height * 0.05)); // 5% of height for edges

        // Extract raw pixel data
        const { data } = await image.raw().toBuffer({ resolveWithObject: true });

        let whitePixelCount = 0;
        let totalEdgePixels = 0;

        // Check top edge
        for (let y = 0; y < edgeHeight; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4; // RGBA format
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
                    whitePixelCount++;
                }
                totalEdgePixels++;
            }
        }

        // Check bottom edge
        for (let y = height - edgeHeight; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
                    whitePixelCount++;
                }
                totalEdgePixels++;
            }
        }

        // Check left edge
        for (let x = 0; x < edgeWidth; x++) {
            for (let y = 0; y < height; y++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
                    whitePixelCount++;
                }
                totalEdgePixels++;
            }
        }

        // Check right edge
        for (let x = width - edgeWidth; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
                    whitePixelCount++;
                }
                totalEdgePixels++;
            }
        }

        const whitePercentage = whitePixelCount / totalEdgePixels;
        return whitePercentage >= threshold;
    } catch (error) {
        console.error('Error detecting white borders:', error);
        // If detection fails, assume no white borders to avoid blocking generation
        return false;
    }
}

/**
 * Generates a single image with retry logic for white border detection
 */
async function generateSingleImage(
    imageBase64: string,
    mimeType: string,
    type: CatAbilityType,
    attempt = 1,
    maxAttempts = 3
): Promise<Buffer> {
    const contents = [
        {
            inlineData: {
                data: imageBase64,
                mimeType: mimeType,
            },
        },
        {
            text: prompt(type),
        },
    ];

    const result = await genAI.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents,
        config: {
            imageConfig: {
                aspectRatio: '2:3',
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

    // Check for white borders
    const hasBorders = await hasWhiteBorders(generatedImageBuffer);

    if (hasBorders && attempt < maxAttempts) {
        console.log(`White borders detected on attempt ${attempt}, regenerating...`);
        // Retry with a more emphatic prompt
        return generateSingleImage(imageBase64, mimeType, type, attempt + 1, maxAttempts);
    }

    if (hasBorders) {
        console.warn(`White borders detected after ${maxAttempts} attempts, proceeding anyway`);
    }

    return generatedImageBuffer;
}

export async function generateAvatarFromImage(imageUrl: string, type: CatAbilityType): Promise<string> {
    try {
        // Fetch the input image from URL
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');

        // Determine MIME type from the image URL or response headers
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        const mimeType = contentType.split(';')[0];

        // Generate image with white border detection and retry
        const generatedImageBuffer = await generateSingleImage(imageBase64, mimeType, type);

        // Generate a unique filename
        const filename = `${generateFilename()}.webp`;

        // Upload the generated image
        await uploadFileImage(generatedImageBuffer, filename);

        // Return the CDN URL
        return `${process.env.DO_SPACES_CDN}/${filename}`;
    } catch (error) {
        console.error('Error generating avatar from image:', error);
        throw error;
    }
}
