// Meow Run trailer: render the text cards of each cut (edl.mjs) as a transparent PNG sequence: build/cards/<cut>/f0000.png ...
// Frames without a card are hard links to one blank PNG. Served by the trailer's vite server (fonts load over http).
//   node tools/trailer/render-cards.mjs [trailer|mode ...]
import fs from 'node:fs';
import path from 'node:path';
import { CUTS, layout } from './edl.mjs';
import * as L from './lib.mjs';

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CUTS);
await L.startServer();
const browser = await L.getBrowser();
try {
  for (const id of want) {
    const cut = CUTS[id];
    const [W, H] = L.ASPECTS[cut.aspect].size;
    const { frames } = layout(cut);
    const dir = path.join(L.BUILD, 'cards', id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto(`${L.BASE}/tools/trailer/cards.html`);
    await page.evaluate(() => window.__ready);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const shoot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
    const blank = path.join(dir, 'blank.png');
    await page.evaluate(() => window.show([], 0, ''));
    fs.writeFileSync(blank, await shoot());
    let n = 0;
    for (let f = 0; f < frames; f++) {
      const file = path.join(dir, `f${String(f).padStart(4, '0')}.png`);
      const on = await page.evaluate(([c, f, a]) => window.show(c, f, a), [cut.cards, f, cut.aspect]);
      if (on) {
        fs.writeFileSync(file, await shoot());
        n++;
      } else fs.linkSync(blank, file);
    }
    await page.close();
    fs.writeFileSync(path.join(dir, 'copy.json'), JSON.stringify(cut.cards.map((c) => [c.text, c.sub].filter(Boolean).join(' / '))));
    console.log(`${id}: ${frames} frames, ${n} with a card`);
  }
} finally {
  await L.closeBrowser();
  L.stopServer();
}
