// Stills (title, cat pick, level select, Cat Yard) and a Cat Yard clip.
import { launch, boot } from './common.mjs';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const ST = path.join(ROOT, 'assets/clips/stills');
fs.mkdirSync(ST, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(ST, name), type: 'jpeg', quality: 92 });

let { browser, page } = await launch();
await boot(page);
await page.waitForTimeout(2500);
await shot(page, 'title.jpg');
const hide = await page.addStyleTag({ content: '.ch-title > *:not(.ch-stars){visibility:hidden !important} .ch-ui button{visibility:hidden !important}' });
await page.waitForTimeout(300);
await shot(page, 'title-clean.jpg');
await browser.close();

({ browser, page } = await launch());
await boot(page, '&screen=pick');
await page.waitForTimeout(1500);
await shot(page, 'cat-pick.jpg');
await browser.close();

({ browser, page } = await launch());
await boot(page, '&screen=levels');
await page.waitForTimeout(1500);
await shot(page, 'level-select.jpg');
await browser.close();

({ browser, page } = await launch());
await boot(page, '&screen=yard');
await page.evaluate(() => window.__heist.yardReady());
await page.waitForTimeout(2500);
await shot(page, 'cat-yard.jpg');
await page.clock.install({ time: 2_000_000 });
await page.clock.runFor(200);
await page.addStyleTag({ content: '.ch-ui{visibility:hidden !important}' });
await page.clock.runFor(100);
await shot(page, 'cat-yard-clean.jpg');
const dir = path.join(ROOT, 'assets/clips/yard-wander');
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
for (let f = 1; f <= 120; f++) {
  await page.clock.runFor(1000 / 30);
  await page.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 });
}
await browser.close();
console.log('ok');
