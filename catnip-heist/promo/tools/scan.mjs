import { launch, boot, startReplay } from './common.mjs';
import fs from 'node:fs';
const { browser, page } = await launch();
await boot(page);
const out = {};
for (let n = 1; n <= 8; n++) {
  const level = `heist-0${n}`;
  await startReplay(page, level);
  const r = await page.evaluate(() => {
    const ev = []; let s = window.__heist.getState();
    const cams = [];
    while (s && !s.won) {
      const prevTick = s.tick;
      s = window.__heist.step(1);
      if (!s || s.tick === prevTick) break;
      for (const e of s.events) if (e.type !== 'STEP') ev.push([s.tick, e.type, e.cat ?? '', e.id ?? '', e.open ?? '']);
      for (const g of s.guards) if (g.mode !== 'PATROL' && g.mode !== 'IDLE') {}
    }
    return { ticks: s?.tick, ev, guardModes: [...new Set(s.guards.map(g => g.mode))] };
  });
  out[level] = r;
  console.log(level, r.ticks, r.ev.map(e => e.slice(0,3).join(':')).join(' '));
}
fs.writeFileSync('/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/5b2edd56-881c-4754-b42e-7d5561832e7b/scratchpad/events.json', JSON.stringify(out));
await browser.close();
