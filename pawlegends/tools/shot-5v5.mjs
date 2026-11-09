// Screenshot helper for the 5v5 Classic client (dev only): node tools/shot-5v5.mjs <url> <outDir> [w] [h] [touch] [waitMs]
import { chromium } from '@playwright/test';
const [url = 'http://localhost:5186', out = '.', w = '844', h = '390', touch = '1', wait = '9000', tag = ''] = process.argv.slice(2);
const VET = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'normal', veteran: true };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: touch === '1', isMobile: touch === '1', deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.stack));
await page.addInitScript((p) => { localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)); localStorage.setItem('pawlegends.matchMode', p.mode); }, { ...VET, mode: process.env.MODE ?? 'classic' });
await page.goto(url + '/?e2e=1' + (process.env.SPEED ? `&speed=${process.env.SPEED}` : ''));
await page.waitForSelector('html[data-screen="title"]', { timeout: 60000 });
await page.waitForTimeout(1500);
const pre = `${out}/${tag}${w}x${h}`;
await page.screenshot({ path: `${pre}-lobby.png` });
await page.locator('.pl-btn.big').first().click();
await page.waitForSelector('html[data-match="live"]', { timeout: 90000 });
await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 60000 });
await page.waitForTimeout(+wait);
await page.screenshot({ path: `${pre}-match.png` });
// MOVE=<seconds>: walk toward the enemy base (screen up-right) and shoot again (desktop: right-click; touch: the stick)
if (process.env.MOVE) {
  const end = Date.now() + +process.env.MOVE * 1000;
  while (Date.now() < end) {
    if (touch === '1') {
      const cdp = await ctx.newCDPSession(page);
      const x0 = +w * 0.16, y0 = +h * 0.7;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
      for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + i * 8, y: y0 - i * 8, id: 1 }] });
      await page.waitForTimeout(2500);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.click(+w * 0.72, +h * 0.3, { button: 'right' });
      await page.waitForTimeout(1200);
    }
  }
  await page.screenshot({ path: `${pre}-moved.png` });
}
if (process.env.SCORE) {
  await page.keyboard.down('Tab');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${pre}-score.png` });
  await page.keyboard.up('Tab');
}
// PEEK=x,y (m): hold the camera over a map point (the minimap peek) and shoot it
if (process.env.PEEK) {
  for (const [i, pt] of process.env.PEEK.split(';').entries()) {
    const [px, py] = pt.split(',').map(Number);
    await page.evaluate(([x, y]) => window.__plWorld.view.peekHold(x, -y), [px, py]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${pre}-peek${i}.png` });
  }
}
console.log(JSON.stringify({ me: await page.evaluate(() => document.documentElement.dataset.me), errors: logs.slice(0, 15) }));
await browser.close();
