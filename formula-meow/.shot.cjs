// usage: node shot.cjs <url-path> <out.png> [w] [h] [mode]
// mode: results (wait for results), wait:<ms>, clickx:<sel>
const { chromium } = require('@playwright/test');
(async () => {
  const [, , path, out, w = '390', h = '844', ...steps] = process.argv;
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const touch = Number(w) < 600;
  const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => {
    window.__shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared.push(d.text ?? ''); } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  });
  await page.goto('http://127.0.0.1:6409' + path);
  let n = 0;
  for (const s of steps) {
    const [k, ...rest] = s.split(':');
    const v = rest.join(':');
    if (k === 'results') await page.locator('.fm-overlay.on .fm-results').waitFor({ timeout: 180000 });
    else if (k === 'wait') await page.waitForTimeout(Number(v));
    else if (k === 'click') await page.locator(v).first().click();
    else if (k === 'tap') await page.locator(v).first().tap();
    else if (k === 'see') await page.locator(v).first().waitFor({ timeout: 60000 });
    else if (k === 'shot') await page.screenshot({ path: out.replace(/\.png$/, `-${++n}.png`) });
    else if (k === 'eval') console.log(JSON.stringify(await page.evaluate(v)));
    else if (k === 'key') await page.keyboard.press(v);
  }
  await page.screenshot({ path: out });
  console.log('shared:', JSON.stringify(await page.evaluate(() => window.__shared)));
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
