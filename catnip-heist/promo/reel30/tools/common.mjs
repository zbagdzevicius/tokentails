import { chromium } from '/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist/node_modules/playwright/index.mjs';
export const BASE = process.env.HEIST_URL || 'http://127.0.0.1:5173/';
export const EXE = '/Users/zygimantasbagdzevicius/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
export async function launch(vp = { width: 1920, height: 1080 }) {
  const browser = await chromium.launch({ executablePath: EXE, headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', e => console.log('pageerror', e.message));
  return { browser, page };
}
export async function boot(page, qs = '') {
  await page.goto(BASE + '?qa=1' + qs);
  await page.waitForFunction(() => document.getElementById('app')?.dataset.ready === '1', null, { timeout: 90000 });
}
export async function startReplay(page, level) {
  await page.evaluate(async (level) => {
    const j = await (await fetch(`/src/levels/${level}.solution.json`)).json();
    window.__heist.freeze(true);
    await window.__heist.loadReplay(j);
    window.__heist.freeze(true);
  }, level);
}
