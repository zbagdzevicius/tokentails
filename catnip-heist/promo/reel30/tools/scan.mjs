import { launch, boot, startReplay } from './common.mjs';
import fs from 'node:fs';
const out = {};
const { browser, page } = await launch({ width: 640, height: 360 });
for (let i = 1; i <= 8; i++) {
  const level = 'heist-0' + i;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await boot(page);
      await startReplay(page, level);
      const r = await page.evaluate(() => {
        const ev = []; let s; let n = 0;
        const ld = window.__heist.app.renderer.levelDef;
        while (n++ < 4000) { s = window.__heist.step(1); if (!s) break; const e = s.events.filter(e => e.type !== 'STEP').map(e => e.type + (e.open === undefined ? '' : (e.open ? '+' : '-'))); if (e.length) ev.push(s.tick + ':' + e.join(',')); if (s.won) break; }
        return { w: ld?.width, h: ld?.height, name: ld?.name, crate: ld?.crate, end: s?.tick, ev };
      });
      out[level] = r; console.log(level, r.name, r.w, r.h, r.end, JSON.stringify(r.crate), '\n ', r.ev.join(' ')); break;
    } catch (e) { console.log('retry', level, e.message.slice(0, 80)); }
  }
}
fs.writeFileSync('scan-log.json', JSON.stringify(out, null, 1));
await browser.close();
