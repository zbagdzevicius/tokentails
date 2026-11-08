/**
 * DEV: screenshots of the champion browser (src/ui/champBrowser/) in the real app, at the phone landscapes and on desktop.
 * Needs a Vite server (`npm run dev`); usage: GPU=1 node tools/champ-browser-shots.mjs <base url> <out dir> [only]
 *
 * States per viewport: the pick screen with its "i" dots, the browser on Skills (Q auto-playing), the passive, the
 * ultimate, the Lore tab, a jump to the rival, the next champion (swipe), the collection's browser, and in a match the
 * long-press skill peek (touch viewports). GPU=1 runs headed on the machine's GPU (the clip draws real frames there).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [base, outDir, only] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const gpu = process.env.GPU === '1';
const browser = await chromium.launch(
  gpu ? { headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
);
const PROFILE_KEY = 'tt.pawlegends.profile.v1';
const VIEWS = [
  { name: '667x375', width: 667, height: 375, touch: true },
  { name: '844x390', width: 844, height: 390, touch: true },
  { name: '1440x900', width: 1440, height: 900, touch: false },
].filter((v) => !only || v.name === only);
const errors = [];
const wait = (page, ms) => page.waitForTimeout(ms);

async function shot(page, view, name) {
  const path = `${outDir}/${view.name}-${name}.png`;
  await page.screenshot({ path, timeout: 60000 });
  console.log(path);
}

for (const view of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, hasTouch: view.touch, isMobile: view.touch, deviceScaleFactor: view.touch ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${view.name}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${view.name}: ${m.text()}`));
  const profile = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'clem', side: 'cat' };
  await page.addInitScript(([k, j]) => { try { localStorage.setItem(k, j); } catch { /* blocked */ } }, [PROFILE_KEY, JSON.stringify(profile)]);
  await page.goto(`${base}/?e2e=1`);
  await page.waitForSelector('html[data-screen="title"]', { timeout: 90000 });
  await wait(page, 800);
  await page.locator('[data-a="choose"]').click();
  await page.waitForSelector('html[data-screen="pick"]');
  await wait(page, 900);
  await shot(page, view, '01-pick-info-dots');
  const tap = (sel) => (view.touch ? page.locator(sel).first().tap() : page.locator(sel).first().click());
  // the "i" on Sage's tile
  await tap('.hero-card[data-h="sage"] .hero-info');
  await page.waitForSelector('.pl-champ[data-ready="1"]', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('.pl-champ')?.dataset.clip === 'playing' || document.querySelector('.pl-champ')?.dataset.clip === 'none', null, { timeout: 60000 }).catch(() => undefined);
  await wait(page, gpu ? 1600 : 4000);
  await shot(page, view, '02-skills-q-autoplay');
  await tap('.pl-champ .cb-skill-btn[data-slot="passive"]');
  await wait(page, 300);
  await shot(page, view, '03-skills-passive');
  await tap('.pl-champ .cb-skill-btn[data-slot="r"]');
  await wait(page, gpu ? 2200 : 5000);
  await shot(page, view, '04-skills-ultimate');
  await tap('.pl-champ .cb-tab[data-tab="lore"]');
  await wait(page, 300);
  await shot(page, view, '05-lore');
  await page.locator('.pl-champ .cb-lore').evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await wait(page, 200);
  await shot(page, view, '06-lore-bottom');
  await tap('.pl-champ .cb-link[data-rel="rival"]');
  await wait(page, 400);
  await shot(page, view, '07-lore-jump-to-rival');
  // next champion (keyboard on desktop, the arrow on touch)
  if (view.touch) await tap('.pl-champ .cb-next');
  else await page.keyboard.press('ArrowRight');
  await wait(page, 400);
  await tap('.pl-champ .cb-tab[data-tab="skills"]');
  await wait(page, gpu ? 1800 : 4000);
  await shot(page, view, '08-next-champion-skills');
  // world lore
  await tap('.pl-champ .cb-tab[data-tab="lore"]');
  await tap('.pl-champ .cb-world-btn');
  await wait(page, 300);
  await shot(page, view, '09-world');
  await page.keyboard.press('Escape');
  await wait(page, 300);
  // Select from the browser: the picker's hero changes
  await tap('.pl-pick .detail [data-a="codex"]');
  await page.waitForSelector('.pl-champ[data-ready="1"]');
  await wait(page, 400);
  await shot(page, view, '10-from-detail-button');
  await tap('.pl-champ .cb-next');
  await wait(page, 300);
  await tap('.pl-champ .cb-select');
  await wait(page, 500);
  await shot(page, view, '11-after-select');
  // collection: Champions
  await tap('[data-a="back"]');
  await page.waitForSelector('html[data-screen="title"]');
  const col = page.locator('[data-a="collection"]');
  if (await col.count()) {
    await tap('[data-a="collection"]');
    await wait(page, 600);
    await tap('.pl-collection [data-a="champions"]');
    await page.waitForSelector('.pl-champ[data-ready="1"]');
    await wait(page, gpu ? 1500 : 3500);
    await shot(page, view, '12-collection-browser');
    await page.keyboard.press('Escape');
    await wait(page, 200);
    await page.keyboard.press('Escape');
    await wait(page, 300);
  }
  // in a match: long-press the W button (touch) or the W slot (desktop)
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]', { timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 60000 });
  await wait(page, 1500);
  const sel = view.touch ? '.pl-tbtn[data-b="r"]' : '.pl-slot[data-i="3"]';
  const box = await page.locator(sel).first().boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (view.touch) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await wait(page, 900);
      await shot(page, view, '13-match-longpress-peek');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await wait(page, 900);
      await shot(page, view, '13-match-longpress-peek');
      await page.mouse.up();
    }
  }
  await ctx.close();
}
console.log(JSON.stringify({ errors: errors.slice(0, 20) }, null, 1));
await browser.close();
