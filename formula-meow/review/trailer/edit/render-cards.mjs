// Renders the trailer's overlay layer (edit/cards.html) to transparent PNG frames with headless Chromium.
// Usage (from formula-meow/): node review/trailer/edit/render-cards.mjs [16x9|9x16|poster ...]
// Output: review/trailer/build/cards/<aspect>/f0000.png .. f1799.png (empty frames are copies of one blank PNG),
//         review/trailer/build/cards/poster-<aspect>.png (1080x1080 title lockup), build/cards/copy.json.
// A throwaway static server on an ephemeral 127.0.0.1 port serves review/trailer/ (fonts load over http).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'build', 'cards');
const FRAMES = 1800;
const MIME = { '.html': 'text/html', '.woff2': 'font/woff2', '.webp': 'image/webp', '.js': 'text/javascript' };

const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!p.startsWith(ROOT) || p.includes(`${path.sep}build${path.sep}`) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/edit/cards.html`;

const want = process.argv.slice(2);
const jobs = want.length ? want : ['16x9', '9x16', 'poster'];
const browser = await chromium.launch();
try {
  for (const job of jobs) {
    const posterOf = job === 'poster' ? ['16x9', '9x16'] : null;
    for (const aspect of posterOf || [job]) {
      const poster = !!posterOf;
      const [w, h] = poster ? [1080, 1080] : aspect === '16x9' ? [1920, 1080] : [1080, 1920];
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(`${base}?aspect=${aspect}${poster ? '&poster=1' : ''}`);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async () => {
        await document.fonts.load('900 80px "Passion One"');
        await document.fonts.load('900 40px "Nunito"');
        await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
      });
      const ok = await page.evaluate(() => document.fonts.check('900 80px "Passion One"') && document.fonts.check('900 40px "Nunito"'));
      if (!ok) throw new Error('fonts did not load');
      // warm the logo image so frame 1625 has it decoded
      await page.evaluate(() => window.drawFrame(1700));
      await page.waitForTimeout(100);
      if (poster) {
        await page.evaluate(() => window.drawFrame(0));
        await page.waitForTimeout(50);
        fs.mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: path.join(OUT, `poster-${aspect}.png`), omitBackground: true });
        console.log(`poster ${aspect} done`);
      } else {
        const dir = path.join(OUT, aspect);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        await page.evaluate(() => { document.getElementById('stage').innerHTML = ''; });
        const blank = path.join(dir, 'blank.png');
        await page.screenshot({ path: blank, omitBackground: true });
        let drawn = 0;
        for (let f = 0; f < FRAMES; f++) {
          const file = path.join(dir, `f${String(f).padStart(4, '0')}.png`);
          if (!(await page.evaluate(n => window.hasContent(n), f))) { fs.copyFileSync(blank, file); continue; }
          await page.evaluate(n => window.drawFrame(n), f);
          await page.screenshot({ path: file, omitBackground: true });
          drawn++;
        }
        console.log(`${aspect}: ${drawn} drawn frames, ${FRAMES - drawn} blank`);
      }
      if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
      if (!poster && aspect === '16x9') {
        const copy = await page.evaluate(() => window.TRAILER_COPY);
        fs.writeFileSync(path.join(OUT, 'copy.json'), JSON.stringify(copy, null, 2));
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
