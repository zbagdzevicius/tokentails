#!/usr/bin/env node
// Trailer "Wild Rivals" story frames: one Gemini image (gemini-3-pro-image-preview) per job and aspect, real champion
// renders (brand kit) as references so the champions stay on-model. No text is ever asked for; type, logo and season
// glyphs are composited in code (mg.js).
// node tools/wildrivals/gemini.mjs <kitRenders> <outDir> [--only A,B]   (GEMINI_API_KEY from the environment)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [R, outDir] = process.argv.slice(2);
const styleArg = process.argv.indexOf('--style');
// --style <jpg>: the approved end poster (C); the M and L frames copy its look so every still reads as one identity
const STYLE_REF = styleArg > 0 ? process.argv[styleArg + 1] : null;
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY is not set');
const r = (n) => join(R, `pawlegends-${n}-render.png`);
const NO_TEXT = 'Absolutely no text, letters, numbers, logos, signatures, labels or watermarks anywhere in the image. Family friendly, no injury.';
const ON_MODEL = 'Every animal is one of the champions in the reference renders and must stay exactly on-model (body shape, fur colours, markings, outfit, accessories, big glossy eyes).';
const SKETCH = 'Style: a naturalist field sketchbook: pencil line drawings with loose watercolour washes on warm cream paper (#F4EAD8) with a faint paper grain, no handwriting, no annotations, no captions and no words of any kind (the only marks besides the drawings are tiny paw-print and arrow doodles), ink in deep plum (#3A1748), touches of magenta (#E0358C) on the cats and electric blue (#2F6BFF) on the dogs, one small yellow lightning-bolt doodle (#FFD23F). Elegant, charming, hand made, like a nature documentary illustrator\'s notebook.';
const PAINT = 'Style: the Paw Legends v6 "Lightning Rivalry" key-art look: bold clean ink outlines, cel shading, saturated candy colours, the cats side in magenta/rose, the dogs side in electric blue, a yellow lightning bolt motif, plum night (#12091F) shadows.';
const COMIC = 'Style: match the FIRST reference image exactly (the approved end poster): the same bold clean ink outlines, cel shading, glossy big eyes, plum night sky (#12091F to #471F5D) with soft stars, the cats side rim-lit magenta-rose (#FF3D9A), the dogs side rim-lit electric blue (#2E8BFF), and a jagged yellow lightning bolt (#FFD21F) between the two sides. Same rendering, same palette, same line weight: it must look like the next panel of the same comic.';
const JOBS = [
  { id: 'M', refs: ['clem', 'meatball', 'sage', 'sir-brutus', 'chili', 'nugget'], style: COMIC, styleRef: true,
    prompt: 'First snow at night: the two herds meet. A wide shot of a snowy valley at night, a frozen river ford in the middle. On the left bank the cats (Clem the white knight cat with a sword, Meatball the chubby orange cat, Sage the archer cat) lead a column of small cat minions; on the right bank the dogs (Sir Brutus the armoured pug knight, Chili the chihuahua, Nugget the corgi) lead a column of small dog minions. Both leaders stare across the ice at each other, ready to charge. Snow falling, a crackling yellow lightning bolt strikes the ice between them. Keep the centre third clear of characters (only the bolt and the ice).' },
  { id: 'L', refs: ['howler', 'pixel', 'duchess'], style: COMIC, styleRef: true,
    prompt: 'Lantern night: on the right, the husky-like dog (Howler) stands on a rock, head thrown back, howling at a huge full moon tinted red; on the left, two cats (Pixel and Duchess) peek over a low stone wall with glowing paper lanterns, ears flat, eyes wide, about to pounce. Autumn leaves drifting. Keep the middle of the frame open for the moon and the bolt.' },
  { id: 'A', refs: ['meatball', 'chili', 'bravo', 'howler'], style: SKETCH,
    prompt: 'A double-page spread of a naturalist sketchbook studying four behaviours, each a separate vignette study with a little ground shadow: (1) a chubby orange cat (Meatball) curled into a perfect bread-loaf shape, eyes shut, hibernating; (2) a tiny chihuahua (Chili) hiding inside a stylish handbag with only his eyes and ears peeking out; (3) a pug in a costume (Bravo) lying on his back legs up, tongue out, playing dead very dramatically; (4) a husky-like dog (Howler) sitting with his head thrown back, howling at a small crescent moon. Plenty of cream paper around each study.' },
  { id: 'B', refs: ['clem', 'meatball', 'sage', 'sir-brutus', 'chili', 'nugget'], style: PAINT,
    prompt: 'An epic painted panorama: "the great migration". Two herds cross a snowy autumn forest valley (Hearthwood) in first snow, coming from the left and right toward each other across a frozen river ford: on the left the cats (Clem the white knight cat with a sword, Meatball the chubby orange cat, Sage the archer cat) leading a column of small magenta-clad cat minions with magenta banners; on the right the dogs (Sir Brutus the armoured pug knight, Chili the chihuahua, Nugget the corgi) leading a column of small blue-clad dog minions with blue banners. Soft snowfall, orange and red autumn trees dusted with snow, golden low sun, breath clouds, a sense of scale like a wildlife documentary. A yellow lightning glint in the sky between the herds. Wide cinematic composition with depth.' },
  { id: 'C', refs: ['clem', 'sir-brutus'], style: PAINT,
    prompt: 'End poster: an extreme close-up, face to face in profile, of a white cat (Clem) on the left and a pug knight (Sir Brutus) on the right, nose to nose, staring each other down through tall swaying meadow grass at dusk; a jagged yellow lightning bolt crackles vertically in the narrow gap between their noses. Left side lit magenta-rose, right side lit electric blue, plum night sky. Keep the upper third of the image calm dark plum sky with soft stars (space for a logo).' },
  { id: 'D', refs: ['clem', 'nugget'], style: SKETCH,
    prompt: 'A sketchbook page with a large perfect circle drawn in pencil and watercolour in the centre, like a seasons wheel: an empty painted ring (a soft watercolour band, no symbols on it at all) with, inside the ring, a white cat (Clem) and a corgi (Nugget) sitting back to back, each looking out over its shoulder at the other with a smirk. The ring and the animals are centred with even cream paper margins around them.' },
  { id: 'E', refs: ['pixel'], style: PAINT,
    prompt: 'A comic gag panel: a plain cardboard box sitting alone in a sunny green meadow with wild flowers, a pair of binoculars poking out of a small slot in its side, two big cat eyes (Pixel, the cat from the reference) glinting inside the dark slot behind the binoculars. A single cat tail sticks out of the back of the box. Funny, quiet, hide-and-seek wildlife photographer mood.' },
];
const SIZES = { '16:9': '4K', '9:16': '4K', '1:1': '2K' };
const jobs = JOBS.filter((j) => !only || only.includes(j.id)).flatMap((j) => Object.keys(SIZES).map((a) => ({ ...j, aspect: a })));
await Promise.all(jobs.map(async (j) => {
  const out = join(outDir, `${j.id}-${j.aspect.replace(':', 'x')}.jpg`);
  if (existsSync(out)) return console.log(`${out}: exists`);
  const lay = j.aspect === '16:9' ? 'Wide landscape composition.' : j.aspect === '9:16' ? 'Tall portrait composition: stack the subjects vertically to fill the tall frame.' : 'Square composition.';
  const parts = [{ text: `${j.prompt} ${lay}\n\n${j.style}\n${ON_MODEL}\n${NO_TEXT}` }];
  if (j.styleRef) { if (!STYLE_REF) throw new Error(`${j.id} needs --style <end poster jpg>`); parts.push({ inline_data: { mime_type: 'image/jpeg', data: readFileSync(STYLE_REF).toString('base64') } }); }
  for (const n of j.refs) parts.push({ inline_data: { mime_type: 'image/png', data: readFileSync(r(n)).toString('base64') } });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: j.aspect, imageSize: SIZES[j.aspect] } } }),
    });
    const body = await res.json().catch(() => ({}));
    const img = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
    if (img) { writeFileSync(out, Buffer.from((img.inlineData ?? img.inline_data).data, 'base64')); return console.log(`${j.id} ${j.aspect}: ok`); }
    console.error(`${j.id} ${j.aspect}: attempt ${attempt + 1} failed ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
}));
