#!/usr/bin/env node
// Trailer 30 story frames: one Gemini image (gemini-3-pro-image-preview) per job, with real champion art as references
// so the champions stay on-model. No text is ever asked for; type and logo are composited in code.
// node tools/trailer30/gemini.mjs <jobs.json> <outDir> [--only id,id]
// jobs: [{ id, prompt, refs: [paths], aspect: '16:9', size: '2K' }]. GEMINI_API_KEY from the environment.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const [jobsFile, outDir] = process.argv.slice(2);
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY is not set');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const STYLE = 'Style: the Paw Legends v6 "Lightning Rivalry" key-art look of the reference images: bold clean ink outlines, cel shading, saturated candy colours, cats side in magenta/rose, dogs side in electric blue, a yellow lightning bolt motif, plum night (#12091F) shadows, comic halftone accents. Keep every champion exactly on-model with the references (face, fur colours, markings, armour, weapons). Absolutely no text, letters, numbers, logos, signatures or watermarks anywhere in the image. Rivals, never enemies: playful heroic energy, no blood, no injury.';

const jobs = JSON.parse(readFileSync(jobsFile, 'utf8')).filter((j) => !only || only.includes(j.id));
await Promise.all(jobs.map(async (j) => {
  const out = join(outDir, `${j.id}.jpg`);
  if (existsSync(out) && !only) return console.log(`${j.id}: exists`);
  const parts = [{ text: `${j.prompt}\n\n${STYLE}` }];
  for (const r of j.refs ?? []) parts.push({ inline_data: { mime_type: MIME[extname(r).toLowerCase()], data: readFileSync(r).toString('base64') } });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: j.aspect ?? '16:9', imageSize: j.size ?? '2K' } } }),
    });
    const body = await res.json().catch(() => ({}));
    const img = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
    if (img) {
      writeFileSync(out, Buffer.from((img.inlineData ?? img.inline_data).data, 'base64'));
      return console.log(`${j.id}: ok`);
    }
    console.error(`${j.id}: attempt ${attempt + 1} failed ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
}));
