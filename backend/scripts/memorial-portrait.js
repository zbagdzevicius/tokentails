#!/usr/bin/env node
/*
 * Rainbow Bridge memorial portrait, Etsy fulfilment (internal CLI, launch item YC-L2,
 * docs/plans/revenue-kickstart.md section 4). Never wired to an API route, the public portrait styles or
 * the Stripe price tables: the prompt lives only in this file.
 *
 * Two steps, so a person picks 1 of the 4 variants in between:
 *
 *   cd backend
 *   export GOOGLE_AI_API_KEY=<the billed Gemini key>      # read from the shell; .env files are never read
 *
 *   # 1. Paint: 4 Gemini calls (about $1), 4 variants plus a contact sheet with the name and dates.
 *   node scripts/memorial-portrait.js paint --photo ~/orders/1234/biscuit.jpg \
 *       --name "Biscuit" --dates "2010 – 2026" --order 1234 --yes
 *
 *   # 2. Export the chosen variant: 8x10, A4 and 12x16 at 300 dpi, and a phone wallpaper (no AI call).
 *   node scripts/memorial-portrait.js export --dir scripts/memorial-out/1234-biscuit --pick 2
 *
 * Options (paint):
 *   --photo <path>     The buyer's photo (repeat for up to 3 photos of the same pet).
 *   --name <text>      The pet's name, as it appears on the portrait (max 40 characters).
 *   --dates <text>     Free text under the name, e.g. "2010 – 2026" (max 40 characters, optional).
 *   --order <id>       Etsy order number, used in the folder name (optional).
 *   --out <dir>        Parent folder (default scripts/memorial-out, git-ignored).
 *   --yes              Required: confirms the 4 billed Gemini calls.
 * Options (both):
 *   --font <file.ttf>  An OFL font for the overlay (default ../cat-assets/fonts/nunito/Nunito-SemiBold.ttf,
 *                      or MEMORIAL_FONT_FILE). The font's own licence field must name the SIL Open Font
 *                      License, otherwise the script stops.
 *
 * Personal data: the buyer's photos and every file here are personal data. Keep them only in the
 * git-ignored output folder, never in the repo or a shared drive, and delete the order folder 30 days after
 * delivery (DELETE-AFTER.txt in the folder holds the date). The order tracker lives outside the repo.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MODEL = 'gemini-3.1-flash-image-preview';
const VARIANTS = 4;
const RETENTION_DAYS = 30;
const DEFAULT_OUT = path.join(__dirname, 'memorial-out');
const DEFAULT_FONT = path.join(__dirname, '..', '..', 'cat-assets', 'fonts', 'nunito', 'Nunito-SemiBold.ttf');
const MAX_TEXT = 40;

/** Print sizes at 300 dpi, portrait orientation, and the phone wallpaper (19.5:9). */
const EXPORTS = [
    { file: 'print-8x10in-300dpi.jpg', width: 2400, height: 3000 },
    { file: 'print-A4-300dpi.jpg', width: 2480, height: 3508 },
    { file: 'print-12x16in-300dpi.jpg', width: 3600, height: 4800 },
    { file: 'phone-wallpaper-1290x2796.jpg', width: 1290, height: 2796, wallpaper: true },
];

/** The memorial prompt. Internal only: not an ImageStyle, not in ai-portrait.ts. */
const RAINBOW_BRIDGE_PROMPT = `Paint a gentle memorial portrait of the pet in the provided photo(s).

Identity first: keep the exact face shape, fur colours and markings, eye colour, ear shape and expression. If several photos are given, they show the same pet; use them together for accuracy. Do not change the breed, do not add or remove markings.

Scene: the pet sits or rests calmly in a soft sunlit meadow of wildflowers at golden hour. Far in the background, a faint, soft rainbow arcs through a warm, hazy sky. The mood is peaceful and loving, not sad and not dramatic.

Style: painterly fine-art portrait, soft oil or gouache brushwork, warm light from behind and slightly to one side, gentle rim light on the fur, pastel sky, shallow depth of field. Fur painted with care, not photographic.

Composition: vertical 4:5 portrait, the pet centred in the upper two thirds, eyes sharp. Keep the lowest fifth of the image calm and uncluttered (soft grass and flowers) so a name can be added later.

Avoid: halos, angel wings, clouds the pet stands on, tears, graves, people, collars or tags unless clearly in the photo, any text, letters, numbers, signatures or watermarks.`;

// ----- arguments -----

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = { photo: [] };
    for (let index = 0; index < rest.length; index++) {
        const key = rest[index];
        if (!key.startsWith('--')) {
            throw new Error(`Unexpected argument ${key}`);
        }
        const name = key.slice(2);
        if (name === 'yes') {
            options.yes = true;
            continue;
        }
        const value = rest[index + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`${key} needs a value`);
        }
        index += 1;
        if (name === 'photo') {
            options.photo.push(value);
        } else {
            options[name] = value;
        }
    }
    return { command, options };
}

const expandHome = value => (value && value.startsWith('~/') ? path.join(require('os').homedir(), value.slice(2)) : value);

function cleanText(value, label, required) {
    const text = String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (required && !text) {
        throw new Error(`${label} is required`);
    }
    if (text.length > MAX_TEXT) {
        throw new Error(`${label} is longer than ${MAX_TEXT} characters`);
    }
    return text;
}

const slug = value =>
    String(value || '')
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .slice(0, 40) || 'pet';

// ----- fonts (OFL only) -----

/** The name table of a TrueType/OpenType file: { 1: family, 13: licence, ... } (Windows or Mac records). */
function fontNames(file) {
    const data = fs.readFileSync(file);
    const tables = data.readUInt16BE(4);
    for (let index = 0; index < tables; index++) {
        const record = 12 + 16 * index;
        if (data.toString('latin1', record, record + 4) !== 'name') {
            continue;
        }
        const offset = data.readUInt32BE(record + 8);
        const count = data.readUInt16BE(offset + 2);
        const strings = offset + data.readUInt16BE(offset + 4);
        const names = {};
        for (let entry = 0; entry < count; entry++) {
            const at = offset + 6 + 12 * entry;
            const platform = data.readUInt16BE(at);
            const nameId = data.readUInt16BE(at + 6);
            const length = data.readUInt16BE(at + 8);
            const start = strings + data.readUInt16BE(at + 10);
            const raw = data.subarray(start, start + length);
            let text;
            if (platform === 0 || platform === 3) {
                const swapped = Buffer.from(raw);
                swapped.swap16();
                text = swapped.toString('utf16le');
            } else {
                text = raw.toString('latin1');
            }
            if (!names[nameId] || platform === 3) {
                names[nameId] = text;
            }
        }
        return names;
    }
    throw new Error(`${file} has no name table`);
}

function loadFont(option) {
    const file = path.resolve(expandHome(option || process.env.MEMORIAL_FONT_FILE || DEFAULT_FONT));
    if (!fs.existsSync(file) || !/\.(ttf|otf)$/i.test(file)) {
        throw new Error(
            `Font ${file} not found. Pass --font <file.ttf> with an OFL font (Nunito, Bebas Neue, or any ` +
                'Google Fonts family under the SIL Open Font License).'
        );
    }
    const names = fontNames(file);
    const licence = `${names[13] || ''} ${names[14] || ''}`;
    if (!/open font license|scripts\.sil\.org\/OFL|openfontlicense\.org/i.test(licence)) {
        throw new Error(`${path.basename(file)} does not declare the SIL Open Font License; only OFL fonts are allowed.`);
    }
    return { file, family: names[1] || path.basename(file, path.extname(file)) };
}

// ----- images -----

function sharpModule() {
    return require('sharp');
}

const escapeMarkup = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One line of text as a transparent PNG that fits width x height. */
async function textImage(text, font, width, height) {
    const sharp = sharpModule();
    return sharp({
        text: {
            text: `<span foreground="#fffaf0">${escapeMarkup(text)}</span>`,
            font: font.family,
            fontfile: font.file,
            width,
            height,
            align: 'centre',
            rgba: true,
        },
    })
        .png()
        .toBuffer();
}

/** The name and dates over a soft dark band at the bottom of a width x height canvas. */
async function overlay(width, height, name, dates, font) {
    const sharp = sharpModule();
    const band = Math.round(height * 0.2);
    const gradient = Buffer.from(
        `<svg width="${width}" height="${band}" xmlns="http://www.w3.org/2000/svg">` +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#1c1410" stop-opacity="0"/>' +
            '<stop offset="1" stop-color="#1c1410" stop-opacity="0.62"/>' +
            `</linearGradient></defs><rect width="${width}" height="${band}" fill="url(#g)"/></svg>`
    );
    const layers = [{ input: gradient, top: height - band, left: 0 }];
    const textWidth = Math.round(width * 0.8);
    const nameHeight = Math.round(band * (dates ? 0.36 : 0.44));
    const nameImage = await textImage(name, font, textWidth, nameHeight);
    const nameMeta = await sharp(nameImage).metadata();
    const nameTop = height - band + Math.round(band * (dates ? 0.3 : 0.4));
    layers.push({ input: nameImage, top: nameTop, left: Math.round((width - nameMeta.width) / 2) });
    if (dates) {
        const datesImage = await textImage(dates, font, Math.round(width * 0.6), Math.round(band * 0.16));
        const datesMeta = await sharp(datesImage).metadata();
        layers.push({
            input: datesImage,
            top: Math.min(height - datesMeta.height - 4, nameTop + nameMeta.height + Math.round(band * 0.06)),
            left: Math.round((width - datesMeta.width) / 2),
        });
    }
    return layers;
}

/** A print: the portrait cropped to the size (kept to the top, where the face is), then the overlay. */
async function renderPrint(source, target, name, dates, font) {
    const sharp = sharpModule();
    const base = await sharp(source)
        .resize(target.width, target.height, { fit: 'cover', position: 'north', kernel: 'lanczos3' })
        .toBuffer();
    return sharp(base)
        .composite(await overlay(target.width, target.height, name, dates, font))
        .withMetadata({ density: 300 })
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();
}

/** The wallpaper: the whole portrait over a blurred copy of itself, the name in the lower part. */
async function renderWallpaper(source, target, name, dates, font) {
    const sharp = sharpModule();
    const background = await sharp(source)
        .resize(target.width, target.height, { fit: 'cover' })
        .blur(40)
        .modulate({ brightness: 0.7 })
        .toBuffer();
    const portrait = await sharp(source).resize({ width: target.width, kernel: 'lanczos3' }).toBuffer();
    const meta = await sharp(portrait).metadata();
    const top = Math.max(0, Math.round((target.height - meta.height) / 2 - target.height * 0.04));
    return sharp(background)
        .composite([{ input: portrait, top, left: 0 }, ...(await overlay(target.width, target.height, name, dates, font))])
        .jpeg({ quality: 92 })
        .toBuffer();
}

// ----- Gemini -----

async function paintVariant(ai, photos, attempt) {
    const contents = [
        ...photos.map(photo => ({ inlineData: { data: photo.toString('base64'), mimeType: 'image/jpeg' } })),
        { text: `${RAINBOW_BRIDGE_PROMPT}\n\nVariant ${attempt + 1} of ${VARIANTS}: vary the meadow and the light a little.` },
    ];
    const result = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
            imageConfig: { aspectRatio: '4:5', imageSize: '4K' },
            temperature: 0.4 + attempt * 0.15,
        },
    });
    const part = result.candidates?.[0]?.content?.parts?.find(candidate => candidate.inlineData?.data);
    if (!part) {
        const reason = result.candidates?.[0]?.finishReason || result.promptFeedback?.blockReason || 'no image';
        throw new Error(`variant ${attempt + 1}: ${reason}`);
    }
    return Buffer.from(part.inlineData.data, 'base64');
}

// ----- commands -----

function retentionNote(dir) {
    const deleteAfter = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fs.writeFileSync(
        path.join(dir, 'DELETE-AFTER.txt'),
        `Buyer photos and portraits are personal data. Delete this folder on or after ${deleteAfter} ` +
            `(${RETENTION_DAYS} days after delivery), or earlier if the buyer asks.\n`
    );
    return deleteAfter;
}

async function paint(options) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_AI_API_KEY is not set. Export the billed Gemini key in this shell (no .env file is read).');
    }
    if (!options.photo.length || options.photo.length > 3) {
        throw new Error('Pass 1 to 3 --photo files.');
    }
    const name = cleanText(options.name, '--name', true);
    const dates = cleanText(options.dates, '--dates', false);
    const font = loadFont(options.font);
    if (!options.yes) {
        throw new Error(`This makes ${VARIANTS} billed Gemini image calls (about $1). Add --yes to go ahead.`);
    }

    const sharp = sharpModule();
    // Re-encoded: EXIF (location, camera) is dropped, the orientation applied, the size bounded.
    const photos = await Promise.all(
        options.photo.map(file =>
            sharp(fs.readFileSync(path.resolve(expandHome(file))))
                .rotate()
                .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 92 })
                .toBuffer()
        )
    );

    const parent = path.resolve(expandHome(options.out || DEFAULT_OUT));
    const dir = path.join(parent, [options.order ? slug(options.order) : null, slug(name)].filter(Boolean).join('-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'order.json'), JSON.stringify({ name, dates, model: MODEL, createdAt: new Date().toISOString() }, null, 2));
    const deleteAfter = retentionNote(dir);

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const previews = [];
    for (let attempt = 0; attempt < VARIANTS; attempt++) {
        try {
            const image = await paintVariant(ai, photos, attempt);
            const png = await sharp(image).png().toBuffer();
            fs.writeFileSync(path.join(dir, `variant-${attempt + 1}.png`), png);
            const preview = await renderPrint(png, { width: 800, height: 1000 }, name, dates, font);
            previews.push(preview);
            fs.writeFileSync(path.join(dir, `variant-${attempt + 1}-preview.jpg`), preview);
            console.log(`variant ${attempt + 1} written`);
        } catch (error) {
            console.error(`variant ${attempt + 1} failed: ${error.message}`);
        }
    }
    if (previews.length) {
        const sheet = sharp({ create: { width: 1600, height: 2000, channels: 3, background: '#ffffff' } }).composite(
            previews.map((input, index) => ({ input, left: (index % 2) * 800, top: Math.floor(index / 2) * 1000 }))
        );
        fs.writeFileSync(path.join(dir, 'contact-sheet.jpg'), await sheet.jpeg({ quality: 85 }).toBuffer());
    }

    console.log(`\n${previews.length} of ${VARIANTS} variants in ${dir}`);
    console.log('Check likeness and tone, pick one, then:');
    console.log(`  node scripts/memorial-portrait.js export --dir ${path.relative(process.cwd(), dir)} --pick <1-${VARIANTS}>`);
    printReminder(deleteAfter);
}

async function exportPick(options) {
    const dir = path.resolve(expandHome(options.dir || ''));
    const pick = Number(options.pick);
    if (!options.dir || !fs.existsSync(path.join(dir, 'order.json'))) {
        throw new Error('Pass --dir <order folder written by paint>.');
    }
    if (!Number.isInteger(pick) || pick < 1 || pick > VARIANTS) {
        throw new Error(`Pass --pick 1 to ${VARIANTS}.`);
    }
    const source = path.join(dir, `variant-${pick}.png`);
    if (!fs.existsSync(source)) {
        throw new Error(`${source} does not exist (that variant failed?).`);
    }
    const order = JSON.parse(fs.readFileSync(path.join(dir, 'order.json'), 'utf8'));
    const name = cleanText(options.name || order.name, '--name', true);
    const dates = cleanText(options.dates !== undefined ? options.dates : order.dates, '--dates', false);
    const font = loadFont(options.font);
    const image = fs.readFileSync(source);
    const exportDir = path.join(dir, `export-variant-${pick}`);
    fs.mkdirSync(exportDir, { recursive: true });
    for (const target of EXPORTS) {
        const output = target.wallpaper
            ? await renderWallpaper(image, target, name, dates, font)
            : await renderPrint(image, target, name, dates, font);
        fs.writeFileSync(path.join(exportDir, target.file), output);
        console.log(`${target.file} (${target.width}x${target.height})`);
    }
    console.log(`\nFiles for the buyer in ${exportDir}`);
    printReminder(retentionNote(dir));
}

function printReminder(deleteAfter) {
    console.log(
        `\nReminder: the buyer's photos are personal data. Delete the photos and this order folder ` +
            `${RETENTION_DAYS} days after delivery (by ${deleteAfter}), or sooner on request. Never commit them.`
    );
}

async function main() {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (command === 'paint') {
        await paint(options);
    } else if (command === 'export') {
        await exportPick(options);
    } else {
        console.log('Usage: node scripts/memorial-portrait.js paint|export [options] (see the header of this file)');
        process.exitCode = command ? 1 : 0;
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
