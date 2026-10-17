// Dev only (not shipped): screenshots of every meta screen at 390x844 from the running dev server.
// Run from bad-cat/: node src/meta/dev-shots.mjs  (writes test-results/meta-*.png)
import { chromium } from '@playwright/test';
const out = '/Users/zygimantasbagdzevicius/me/tokentails-app/bad-cat/test-results';
const shots = [
  ['archive', ''], ['archive-club', 'screen=archive&club=1'], ['archive-empty', 'screen=archive&empty=1'],
  ['rapsheet', 'screen=rapsheet'], ['rapsheet-club', 'screen=rapsheet&club=1'], ['rapsheet-empty', 'screen=rapsheet&empty=1'],
  ['season', 'screen=season'], ['season-club', 'screen=season&club=1'],
  ['settings', 'screen=settings&persistent=0'], ['settings-club', 'screen=settings&club=1'],
  ['friends', 'screen=friends'], ['friends-empty', 'screen=friends&empty=1'],
  ['weekly', 'screen=weekly&club=1'], ['weekly-free-sofar', 'screen=weekly&ready=0'], ['weekly-empty', 'screen=weekly&empty=1'],
  ['consent', 'screen=consent'], ['rooms', 'screen=rooms'], ['rooms-empty', 'screen=rooms&empty=1'],
];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
for (const [name, qs] of shots) {
  await page.goto(`http://localhost:5174/src/meta/dev.html?${qs || 'screen=archive'}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(name.startsWith('weekly') ? 1800 : 900);
  await page.screenshot({ path: `${out}/meta-${name}.png` });
  const overflow = await page.evaluate(() => { const s = document.querySelector('.bc-screen'); return s ? s.scrollWidth - s.clientWidth : 0; });
  if (overflow > 0) errs.push(`${name}: horizontal overflow ${overflow}px`);
}
// settings full-page: scroll the screen and capture a tall shot after export
await page.goto('http://localhost:5174/src/meta/dev.html?screen=settings&club=1', { waitUntil: 'networkidle' });
await page.click('.bmt-export');
await page.waitForTimeout(300);
await page.evaluate(() => { const s = document.querySelector('.bc-screen'); s.scrollTop = s.scrollHeight * 0.55; });
await page.screenshot({ path: `${out}/meta-settings-savecode.png` });
await page.evaluate(() => { const s = document.querySelector('.bc-screen'); s.scrollTop = s.scrollHeight; });
await page.screenshot({ path: `${out}/meta-settings-bottom.png` });
console.log(JSON.stringify(errs));
await browser.close();
