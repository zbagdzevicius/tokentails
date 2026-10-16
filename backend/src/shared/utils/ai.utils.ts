import * as dotenv from 'dotenv';
dotenv.config();
import { OpenAI } from 'openai';
import { AiCallOptions } from 'src/ai-budget/ai-cost';
import { CatAbilityType, CatOriginType } from 'src/cat/cat.schema';

enum EmoteType {
    DIGGING = 'DIGGING',
    GROOMING = 'GROOMING',
    HIT = 'HIT',
    IDLE = 'IDLE',
    JUMPING = 'JUMPING',
    LOAF = 'LOAF',
    RUNNING = 'RUNNING',
    SITTING = 'SITTING',
    SLEEP = 'SLEEP',
    WALKING = 'WALKING',
}

const editions = {
    // first WEEK
    'cat-tate': 'cat-tate',
    cigarette: 'cigarette',
    coins: 'coins',
    'flover-azalea': 'flover-azalea',
    'flover-daisy': 'flover-daisy',
    'flover-moon-camellia': 'flover-moon-camellia',
    'glasses-black': 'glasses-black',
    'glasses-brown': 'glasses-brown',
    'hat-beanie': 'hat-beanie',
    'hat-candle': 'hat-candle',
    // second WEEK
    'hat-captain': 'hat-captain',
    'hat-cleopatra': 'hat-cleopatra',
    'hat-cylinder-black': 'hat-cylinder-black',
    'hat-heisenberg': 'hat-heisenberg',
    'hat-leprechaun': 'hat-leprechaun',
    'hat-magician': 'hat-magician',
    'hat-musketeer-red': 'hat-musketeer-red',
    'hat-pepe': 'hat-pepe',
    'hat-pirate': 'hat-pirate',
    'hat-propeller': 'hat-propeller',
    'hat-samurai': 'hat-samurai',
    // third week
    'hat-sanchez': 'hat-sanchez',
    'hat-ushanka': 'hat-ushanka',
    'hat-ushanka-cigarette': 'hat-ushanka-cigarette',
    'hat-viking': 'hat-viking',
    'hat-wizard-blue': 'hat-wizard-blue',
    'hearted-red': 'hearted-red',
    lighting: 'lighting',
    'wing-black': 'wing-black',
    'wing-white': 'wing-white',

    //halloween
    vampire: 'vampire',
    'pumpkin-head': 'pumpkin-head',
    'bat-effect': 'bat-effect',

    //new one
    'hat-austronaut': 'hat-austronaut',
    'wings-candle': 'wings-candle',
    'hat-beanie-cigarette': 'hat-beanie-cigarette',
    'hat-cylinder-glasses-cigarette': 'hat-cylinder-glasses-cigarette',
    'hat-leprechaun-coin': 'hat-leprechaun-coin',
    'wings-heart': 'wings-heart',
    'hat-valkyrie-wings': 'hat-valkyrie-wings',

    //christmas

    jesus: 'jesus',
    santa: 'santa',
    angel: 'angel',
    'candy-cane': 'candy-cane',
    'festive-lights-tangled': 'festive-lights-tangled',
    'hat-aureola': 'hat-aureola',
    'hat-beanie-winter': 'hat-beanie-winter',
    'hat-christmas-tree': 'hat-christmas-tree',
    'hat-deer': 'hat-deer',
    'hat-elf-green': 'hat-elf-green',
    'hat-elf-red': 'hat-elf-red',
    'hat-gift': 'hat-gift',
    'hat-gingerbread': 'hat-gingerbread',
    'hat-hot-cocoa': 'hat-hot-cocoa',
    'hat-mistletoe': 'hat-mistletoe',
    'hat-nutcracker': 'hat-nutcracker',
    'hat-polar-bear': 'hat-polar-bear',
    'hat-santa-green': 'hat-santa-green',
    'hat-snow-globe': 'hat-snow-globe',
    'hat-star': 'hat-star',
    'hat-wreath': 'hat-wreath',
    jingle: 'jingle',
    'hat-snowman': 'hat-snowman',
    'hat-sock': 'hat-sock',
    'hat-santa': 'hat-santa',
    base: 'base',
    'bow-tie-blue': 'bow-tie-blue',
    'bow-tie-red': 'bow-tie-red',
    'necklace-blue': 'necklace-blue',
    'necklace-gold': 'necklace-gold',
    bandage: 'bandage',
    'soldier-hat': 'soldier-hat',
    saiyan: 'saiyan',
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const getAbilityType = () => {
    return getRandomProperty(CatAbilityType);
};
const getRandomCatEmote = () => {
    const filteredEmotes = Object.values(EmoteType).filter(emote => emote !== 'HIT');
    return filteredEmotes[Math.floor(Math.random() * filteredEmotes.length)];
};
const getRandomProperty = (obj: any) => {
    const keys = Object.keys(obj as any);
    return obj[keys[Math.floor(Math.random() * keys.length)]];
};

const PUBLIC_CDN_ENDPOINT = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com';

const generateNFTCat = ({
    name,
    resqueStory,
    type,
    edition,
    origin,
    emote,
}: {
    name: string;
    resqueStory: string;
    type: CatAbilityType;
    edition: string;
    origin: CatOriginType;
    emote: EmoteType;
}) => {
    return {
        name,
        resqueStory,
        type,
        origin,
        spriteImg: `${PUBLIC_CDN_ENDPOINT}/assets/${origin}/${edition}.png`,
        catImg: `${PUBLIC_CDN_ENDPOINT}/assets/${origin}/${edition}/${emote}.gif`,
    };
};

/** The cat families the classifier picks from (one line each). */
const CAT_TYPE_LIST = `- **BLACK** – A cat that is entirely black.
- **MAINE** – A rugged, fluffy cat with a mix of dark gray and black stripes, resembling a Maine Coon.
- **MERLOT** – Similar to MAINE, but more wine-toned or reddish in its dark fur.
- **YELLOW** – A ginger, orange, or golden-yellow colored cat.
- **GREY** – Solid gray all over.
- **WHITE** – Completely white, no other colors.
- **SIAMESE** – Cream-colored body with darker face, ears, paws, and tail.
- **BALINESE** – Like SIAMESE but longer fur.
- **MIST** – Similar to SIAMESE with a hazier or clouded look.
- **PINKIE** – Mostly white with a splash of pink or another color.
- **PEACHES** – White mixed with orange or ginger patches.
- **OREO** – A black and white cat with clear contrast.
- **FOLD** – White-orange cat with folded ears.
- **OBSIDIAN** – All black with colorful, striking eyes.
- **SAVANHAN** – Brown cat with orange or tiger-like stripes.
- **OBI** – Fully brown cat.
- **OLIVE** – Light gray cat with soft gray stripes.
- **PICKLES** – Gray cat with dark gray stripes.
- **RASCAL** – Orange cat with white patches.
- **SABLE** – Dark brown cat with some white.
- **FICUS** – Mostly dark cat with bits of white.
- **TROUFAS** – Entirely black, fluffier or richer than regular black cat.`;

/**
 * The classifier prompt. Without `screen` it is exactly the prompt `generateCat` always sent. With
 * `screen` (bet #3 `/yourcat`) it starts with a check step and the answer gains a `Person:` field.
 */
export function buildCatPrompt(abilityType: string, screen = false): string {
    if (!screen) {
        return `
You will be shown an image of a cat. Your task is to do two things:

1. Identify the cat’s type based on its visual appearance from the following categories:

${CAT_TYPE_LIST}

2. Then write a short, funny story about the cat for an NFT collection. The story should:
- Be centered around its ${abilityType} nature.
- Avoid using the cat’s name.
- End with a twist or an absurd punchline.
- Be no more than 100 characters.

Respond in this format only:
Cat type: [type]. Story: [story].
`;
    }
    return `
You will be shown a photo. First check it, then do two things.

0. Check: If no real cat is clearly visible, answer Cat type: NONE. If any person, face or body part of a person is visible, answer Person: yes. Otherwise answer Person: no.

1. Identify the cat’s type based on its visual appearance from the following categories:

${CAT_TYPE_LIST}

2. Then write a short, funny story about the cat for an NFT collection. The story should:
- Be centered around its ${abilityType} nature.
- Avoid using the cat’s name.
- End with a twist or an absurd punchline.
- Be no more than 100 characters.

Respond in this format only:
Person: [yes|no]. Cat type: [type|NONE]. Story: [story].
`;
}

export interface CatScreen {
    isCat: boolean;
    personVisible: boolean;
}

/**
 * Parses a screened answer (`Person: yes|no. Cat type: TYPE|NONE. Story: ...`). Null when it does not
 * parse, so a malformed answer fails closed.
 */
export function parseScreenedAnswer(message: string | null | undefined): {
    screen: CatScreen;
    origin: string | null;
    story: string;
} | null {
    if (typeof message !== 'string') {
        return null;
    }
    const match = message.match(
        /Person:\s*(yes|no)\b[\s.]*Cat type:\s*([^.\n]*?)\s*(?:\.|\n|$)\s*(?:Story:\s*([\s\S]*))?/i
    );
    if (!match) {
        return null;
    }
    const personVisible = match[1].toLowerCase() === 'yes';
    const rawType = match[2].trim();
    if (!rawType) {
        return null;
    }
    const isCat = !/^none\b/i.test(rawType);
    return {
        screen: { isCat, personVisible },
        origin: isCat ? rawType : null,
        story: (match[3] || '').trim().replace(/\.$/, ''),
    };
}

export interface GeneratedCat {
    name: string;
    resqueStory: string;
    type: CatAbilityType;
    origin: CatOriginType;
    spriteImg: string;
    catImg: string;
    /** Only with `screen: true`. */
    screen?: CatScreen;
}

/**
 * Classifies a cat photo and writes a story. `imageUrl` may be a URL or a `data:` URL (OpenAI accepts
 * both). `options` (bet #3): `onUsage` receives the token usage, `signal` aborts the request, and
 * `screen` adds the person/no-cat check. Existing callers pass nothing; their prompt is unchanged.
 * With `screen` and no cat the result carries the screen only (`{ screen }`).
 */
export function generateCat(name: string, imageUrl: string): Promise<GeneratedCat | null>;
export function generateCat(
    name: string,
    imageUrl: string,
    options: AiCallOptions & { screen?: boolean }
): Promise<GeneratedCat | { screen: CatScreen } | null>;
export async function generateCat(
    name: string,
    imageUrl: string,
    options: AiCallOptions & { screen?: boolean } = {}
): Promise<GeneratedCat | { screen: CatScreen } | null> {
    const editionKeys = Object.keys(editions);
    const randomEdition = editionKeys[Math.floor(Math.random() * editionKeys.length)];

    const abilityType = getAbilityType();
    const catEmote = getRandomCatEmote();

    try {
        const combinedPrompt = buildCatPrompt(abilityType, !!options.screen);

        const response = await openai.chat.completions.create(
            {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: combinedPrompt,
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl,
                                },
                            },
                        ],
                    },
                ],
            },
            options.signal ? { signal: options.signal } : undefined
        );
        if (options.onUsage) {
            options.onUsage({
                provider: 'openai',
                model: 'gpt-4o-mini',
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
                images: 0,
                imageSize: null,
            });
        }

        const message = response.choices[0].message.content;

        if (options.screen) {
            const parsed = parseScreenedAnswer(message);
            if (!parsed) {
                console.error('Unable to parse the screened cat answer.');
                return null;
            }
            if (!parsed.screen.isCat || !parsed.origin) {
                return { screen: parsed.screen };
            }
            return {
                ...generateNFTCat({
                    name,
                    resqueStory: parsed.story,
                    type: abilityType,
                    edition: randomEdition,
                    origin: parsed.origin as CatOriginType,
                    emote: catEmote,
                }),
                screen: parsed.screen,
            };
        }

        const match = message!.match(/^Cat type:\s*(.*?)\.\s*Story:\s*(.*)/i);

        if (match) {
            const catName = name;
            const catType = match[1];
            const generatedStory = match[2];

            const catData = {
                name: catName,
                story: generatedStory,
                type: abilityType,
                origin: catType,
            };

            if (catData.name && catData.story && catData.type && catData.origin) {
                try {
                    const nftCardData = generateNFTCat({
                        name: catName,
                        resqueStory: generatedStory,
                        type: abilityType,
                        edition: randomEdition,
                        origin: catType as CatOriginType,
                        emote: catEmote,
                    });

                    return nftCardData;
                } catch (error) {
                    console.error('Error generating NFT:', error);
                }
            } else {
                console.error('Incomplete data. Unable to generate NFT.');
            }
        } else {
            console.error('Unable to parse cat type and story from the response.');
        }
        return null;
    } catch (err) {
        console.error('OpenAI API call failed:', err);
        return null;
    }
}
