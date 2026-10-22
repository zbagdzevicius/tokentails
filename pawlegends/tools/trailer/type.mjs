#!/usr/bin/env node
/**
 * Motion graphics render (storyboard §8 step 4): drives type.html (mg.js) in Playwright Chromium frame by frame and
 * writes PNG sequences with frame numbers of each cut:
 *
 *   <out>/<cut>/<aspect>/overlay/fNNNN.png   transparent: kinetic type, the whip-zooming photo card, end-card
 *                                            graphics, flashes, the end fade (only frames that draw anything)
 *   <out>/<cut>/<aspect>/plate/fNNNN.png     opaque: the S04 photo card over the blurred turntable, the end-card
 *                                            background from the captured lobby frames
 *   <out>/manifest.json                      frame ranges per layer, and the post list (shakes, rgbashift, pushes)
 *   <out>/preview/<cut>-<aspect>.mp4         with --preview: footage + plate + overlay at half size, with the score
 *
 *   node tools/trailer/type.mjs --shots <capture dir> [--out DIR] [--cut 30|15|both] [--aspect 16x9|9x16|both]
 *                               [--preview] [--audio <dir with score.wav, score-15.wav>] [--every N]
 *
 * The copy gate (lint-copy.mjs) runs first and stops the render on any finding. The Gabė photo is upscaled with
 * Lanczos and unsharp in ffmpeg (1.2x for 16:9, 1.6x plus 3 % grain for 9:16; never AI upscaling).
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { argValue, hasFlag } from '../lib/args.mjs';
import { lintTrailerCopy } from './lint-copy.mjs';
import { ASPECTS, CUTS, overlayRanges, plateRanges, post, sourceFrame } from './mg-timeline.mjs';

export { sourceFrame };

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const OUT = resolve(argValue('--out') ?? join(HERE, 'out', 'mg'));
const SHOTS = argValue('--shots') ? resolve(argValue('--shots')) : null;
const AUDIO = argValue('--audio') ? resolve(argValue('--audio')) : null;
const CUT_ARG = argValue('--cut') ?? 'both';
const ASPECT_ARG = argValue('--aspect') ?? 'both';
const EVERY = Number(argValue('--every') ?? 1);
const PREVIEW = hasFlag('--preview');
const cuts = CUT_ARG === 'both' ? ['30', '15'] : [CUT_ARG];
const aspects = ASPECT_ARG === 'both' ? ['16x9', '9x16'] : [ASPECT_ARG];
const pad = (f) => `f${String(f).padStart(4, '0')}.png`;

// ---------------------------------------------------------------- copy gate

const copy = JSON.parse(readFileSync(join(HERE, 'copy.json'), 'utf8'));
const lint = lintTrailerCopy(copy);
if (lint.findings.length) {
  for (const f of lint.findings) console.error(`  ${f.id}: ${f.rule} ${f.message}`);
  console.error(`[type] copy gate failed (${lint.findings.length} findings): nothing rendered`);
  process.exit(1);
}
console.log(`[type] copy gate: ${lint.lines} lines, 0 findings`);

// ---------------------------------------------------------------- the photo

const WORK = join(OUT, 'work');
mkdirSync(WORK, { recursive: true });
const PHOTO = join(REPO, 'client/public/swordcat-game/pink-paw/gabe-photo.webp');
const photoFor = {
  '16x9': { w: 405, h: 540, vf: 'scale=405:540:flags=lanczos,unsharp=5:5:0.4,colorchannelmixer=rr=1.03:bb=0.97' },
  '9x16': { w: 540, h: 720, vf: 'scale=540:720:flags=lanczos,unsharp=5:5:0.4,colorchannelmixer=rr=1.03:bb=0.97,noise=alls=8:allf=0' },
};
for (const a of aspects) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', PHOTO, '-vf', photoFor[a].vf, '-frames:v', '1', join(WORK, `gabe-${a}.png`)]);

// ---------------------------------------------------------------- footage index (capture.mjs layout: <shot>/<aspect>/fNNNN.png)

function footageIndex(aspect) {
  const map = new Map();
  if (!SHOTS || !existsSync(SHOTS)) return map;
  for (const shot of readdirSync(SHOTS).sort()) {
    const dir = join(SHOTS, shot, aspect);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      const m = /^f(\d{4})\.png$/.exec(f);
      if (m && !map.has(Number(m[1]))) map.set(Number(m[1]), `/shots/${shot}/${aspect}/${f}`);
    }
  }
  return map;
}


// ---------------------------------------------------------------- static server

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const ROOTS = { '/repo/': REPO, '/shots/': SHOTS ?? WORK, '/work/': WORK, '/mg/': HERE };

function serve() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const prefix = Object.keys(ROOTS).find((p) => url.startsWith(p));
    if (!prefix) return res.writeHead(404).end();
    const root = ROOTS[prefix];
    const path = normalize(join(root, url.slice(prefix.length)));
    if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(path).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const writeData = (path, dataUrl) => writeFileSync(path, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));

function* frames(ranges) {
  for (const [a, b] of ranges) for (let f = a; f <= b; f++) if ((f - a) % EVERY === 0) yield f;
}

// ---------------------------------------------------------------- main

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const manifest = { generated: 'tools/trailer/type.mjs', copyLint: { lines: lint.lines, findings: 0 }, cuts: {} };
try {
  for (const cut of cuts) {
    manifest.cuts[cut] = { frames: CUTS[cut], post: post(cut), aspects: {} };
    for (const aspect of aspects) {
      const t0 = Date.now();
      const { W, H } = ASPECTS[aspect];
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => console.error(`[type] page error: ${e.message}`));
      await page.goto(`${base}/mg/type.html`);
      const foot = footageIndex(aspect);
      const bg05 = foot.get(180) ? `${base}${foot.get(180)}` : null;
      const info = await page.evaluate((o) => window.mgInit(o), { cut, aspect, copy, photoUrl: `${base}/work/gabe-${aspect}.png`, bg05Url: bg05 });
      if (!info.fonts) throw new Error('Fredoka did not load');
      const dir = join(OUT, cut, aspect);
      mkdirSync(join(dir, 'overlay'), { recursive: true });
      mkdirSync(join(dir, 'plate'), { recursive: true });
      const ov = overlayRanges(cut, aspect, copy);
      let n = 0;
      for (const f of frames(ov)) {
        writeData(join(dir, 'overlay', pad(f)), await page.evaluate((x) => window.mgOverlay(x), f));
        n++;
      }
      const pl = plateRanges(cut);
      let np = 0;
      for (const [kind, range] of Object.entries(pl)) {
        for (const f of frames([range])) {
          // the photo's background is the game world: the bridge of the drop (S06, f240+) running under the card, held
          // on one frame through the whip-zoom, then running on under Gabė's champion (S05, keyed) to the drop
          const sf = sourceFrame(cut, f);
          const bgF = sf < 180 ? 240 + sf - 120 : sf <= 185 ? 299 : 300 + (sf - 186);
          const src = kind === 'photo' ? foot.get(bgF) : foot.get(sf);
          const fg = kind === 'photo' && sf >= 180 ? foot.get(sf) : null;
          const data = await page.evaluate(([x, u, g]) => window.mgPlate(x, u, g), [f, src ? `${base}${src}` : null, fg ? `${base}${fg}` : null]);
          if (data) {
            writeData(join(dir, 'plate', pad(f)), data);
            np++;
          }
        }
      }
      manifest.cuts[cut].aspects[aspect] = { size: [W, H], overlay: ov, plate: pl, overlayFrames: n, plateFrames: np, photo: info.photo, bg05: info.bg05 };
      console.log(`[type] ${cut}s ${aspect}: ${n} overlay + ${np} plate frames (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      if (PREVIEW) {
        const pdir = join(OUT, 'preview', `${cut}-${aspect}`);
        mkdirSync(pdir, { recursive: true });
        const scale = 0.5;
        for (let f = 0; f < CUTS[cut]; f++) {
          const sf = sourceFrame(cut, f);
          const src = foot.get(sf);
          const data = await page.evaluate(([x, fu, eu, s]) => window.mgPreview(x, fu, eu, s), [f, src ? `${base}${src}` : null, src ? `${base}${src}` : null, scale]);
          writeData(join(pdir, `f${String(f).padStart(4, '0')}.jpg`), data);
        }
        const mp4 = join(OUT, 'preview', `${cut}-${aspect}.mp4`);
        const wav = AUDIO ? join(AUDIO, cut === '30' ? 'score.wav' : 'score-15.wav') : null;
        const args = ['-v', 'error', '-y', '-framerate', '60', '-i', join(pdir, 'f%04d.jpg')];
        if (wav && existsSync(wav)) args.push('-i', wav, '-c:a', 'aac', '-b:a', '256k');
        args.push('-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
        execFileSync('ffmpeg', args);
        console.log(`[type] preview ${mp4}`);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`[type] ${join(OUT, 'manifest.json')}`);
