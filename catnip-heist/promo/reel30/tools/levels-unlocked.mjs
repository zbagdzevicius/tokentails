// Level select with all 8 heists won (3 stars each): wins every bundled solution as a live run first.
import { launch, boot } from './common.mjs';
import path from 'node:path';
const ST = path.resolve(import.meta.dirname, '../assets/clips/stills');
const { browser, page } = await launch();
await boot(page);
await page.clock.install({ time: 5_000_000 });
for (let i = 1; i <= 8; i++) {
  const level = 'heist-0' + i;
  await page.evaluate(async (level) => {
    const j = await (await fetch(`/src/levels/${level}.solution.json`)).json();
    window.__heist.freeze(true);
    await window.__heist.start(j.catIds, level);
    window.__heist.freeze(true);
    try { if (window.__heist.briefOpen()) window.__heist.closeBrief(); } catch {}
    window.__heist.feed(j.runs);
    window.__heist.freeze(false);
  }, level);
  let k = 0; while ((await page.evaluate(() => window.__heist.screen())) !== 'results' && k++ < 400) await page.clock.runFor(100);
  console.log(level, k, JSON.stringify(await page.evaluate(() => window.__heist.progress())).slice(0, 120));
}
await page.evaluate(() => window.__heist.levels());
await page.clock.runFor(2500);
await page.screenshot({ path: path.join(ST, 'level-select-all.jpg'), type: 'jpeg', quality: 92 });
for (const [n, sel] of [[4, 'heist-04'], [8, 'heist-08']]) {
  const ok = await page.evaluate((id) => { const b = [...document.querySelectorAll('.ch-ui button')].find(b => (b.dataset.level || b.getAttribute('data-id') || '') === id); if (b) { b.click(); return true; } return false; }, sel);
  await page.clock.runFor(800);
  if (ok) await page.screenshot({ path: path.join(ST, `level-select-${sel}.jpg`), type: 'jpeg', quality: 92 });
  console.log('select', sel, ok);
}
console.log(await page.evaluate(() => document.querySelector('.ch-ui')?.innerText.slice(0, 1500)));
await browser.close();
