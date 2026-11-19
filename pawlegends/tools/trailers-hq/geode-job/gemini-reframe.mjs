#!/usr/bin/env node
// The Geode Job, revision 2: one character design in every aspect ratio. The 16:9 story frames (gem/<X>-h.jpg) are the
// approved designs; each 9:16 frame is re-staged by Gemini (gemini-3-pro-image-preview) from its own 16:9 frame as the
// only design reference, so the Chairman, the crew, the geode and the end-card key art match across formats. The
// getaway panel C is redrawn in the Quarry (the river cannon is out of the story). No text is ever asked for.
//   node tools/trailers-hq/geode-job/gemini-reframe.mjs <gemDir> [--only C-h,A-v] [--force]   (GEMINI_API_KEY from env)
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [DIR] = process.argv.slice(2);
const oi = process.argv.indexOf('--only');
const only = oi > 0 ? process.argv[oi + 1].split(',') : null;
const FORCE = process.argv.includes('--force');
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY is not set');
const KIT = '/Users/zygimantasbagdzevicius/Downloads/paw-legends/brandbook/v6-lightning-rivalry/kit/renders';
const NO_TEXT = 'Absolutely no text, letters, numbers, logos, signatures, labels, captions or watermarks anywhere in the image. Family friendly.';
const REFRAME = (what) => `The attached image is approved key art (${what}). Redraw THE SAME illustration as a tall 9:16 portrait frame for a phone screen. It must read as the identical scene and design: every character exactly as drawn in the attached image (same species, face, fur colours, costume, helmet, crown or hat, accessories, pose idea and expression), the same props in the same colours (the crystal geode keeps exactly its colours), the same background setting, palette, lighting, line weight and rendering. Only the layout changes: re-stage the elements vertically to fill the tall frame, extend the background above and below, keep every character whole and inside the frame. Do not add new characters, costumes or objects. ${NO_TEXT}`;
const JOBS = {
  'C-h': {
    aspect: '16:9',
    refs: [join(DIR, 'A-h.jpg'), `${KIT}/pawlegends-duchess-render.png`, `${KIT}/skins/pawlegends-pixel-moonwhisker-render.png`, `${KIT}/pawlegends-stilts-render.png`, '/Users/zygimantasbagdzevicius/Downloads/paw-legends/skins-v2/g1-lunch-rush/double-stack-meatball/splash.jpg'],
    prompt: `Comic book action panel, the getaway: the four cat thieves (the white long-haired Duchess with her little crown, Pixel the black cat in cardboard box armour, Stilts the long-legged spotted acrobat cat, chubby Meatball in a burger costume) sprint gleefully out of a rocky night quarry towards the viewer, each clutching a glowing faceted magenta-and-cyan crystal gem that trails sparkles; behind them in the quarry two blue alarm searchlight beams sweep and a big glowing crystal geode sits on its stand, its glass case smashed. Speed lines, halftone dots, plum night (#12091F to #471F5D), cats rim-lit magenta (#FF3D9A), electric blue (#2E8BFF) searchlights, yellow lightning (#FFD21F) accents. Wide landscape composition. Match the FIRST attached image's art style exactly (same comic rendering, line weight and palette); the other images are the champions' on-model references. ${NO_TEXT}`,
  },
  'A-v': { aspect: '9:16', from: 'A-h', what: 'a cosy cartoon planning corkboard with four cat portrait photos, pink yarn and a map with a purple crystal in the middle', extra: 'The crystal on the map is pale purple and cyan exactly as in the attached image. The yarn runs from each photo to the crystal; the board is upright, viewed straight on.' },
  'B-v': { aspect: '9:16', from: 'B-h', what: 'the villain, Sir Brutus the pug as Chairman of the Board in his gold knight helmet with a pink plume, black suit, gold tie, gold pen, on a gold throne with the glowing geode' },
  'C-v': { aspect: '9:16', from: 'C-h', what: 'the four cat thieves escaping a night quarry with glowing gems', extra: 'The picture is upright (not rotated): the ground is at the bottom, the cats stand and run upright, heads up, towards the viewer, two in front and two behind; the smashed geode case and the two searchlights are above them.' },
  'D-v': { aspect: '9:16', from: 'D-h', what: 'the end-card key art: the villain pug on a throne above, the four cat thieves with glowing gems below, a lightning bolt. Keep the middle band clear and darker for a logo' },
  'E-v': { aspect: '9:16', from: 'E-h', what: 'Ranger the guard dog asleep in a wooden guard booth beside a glowing crystal' },
  'F-v': { aspect: '9:16', from: 'F-h', what: 'a quarry blueprint with a geode and a secret tunnel, a dachshund peeking out of a hole', extra: 'Exactly ONE dachshund in the whole picture, peeking out of one hole directly under the geode; the tunnel winds down below it.' },
};
const mime = (f) => (f.endsWith('.png') ? 'image/png' : 'image/jpeg');
const ids = Object.keys(JOBS).filter((id) => !only || only.includes(id));
async function run(id) {
  const j = JOBS[id];
  const out = join(DIR, `${id}.jpg`);
  if (existsSync(out) && !FORCE && !only) return console.log(`${id}: exists`);
  const refs = j.from ? [join(DIR, `${j.from}.jpg`)] : j.refs;
  const parts = [{ text: j.from ? `${REFRAME(j.what)} ${j.extra ?? ''}` : j.prompt }, ...refs.map((f) => ({ inline_data: { mime_type: mime(f), data: readFileSync(f).toString('base64') } }))];
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: j.aspect, imageSize: '2K' } } }),
    });
    const body = await res.json().catch(() => ({}));
    const img = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
    if (img) {
      if (existsSync(out)) renameSync(out, out.replace(/\.jpg$/, '.r1.jpg'));
      writeFileSync(out, Buffer.from((img.inlineData ?? img.inline_data).data, 'base64'));
      return console.log(`${id}: ok`);
    }
    console.error(`${id}: attempt ${attempt + 1} failed ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
}
// C-h first (C-v is drawn from it), the rest in parallel
if (ids.includes('C-h')) await run('C-h');
await Promise.all(ids.filter((id) => id !== 'C-h').map(run));
