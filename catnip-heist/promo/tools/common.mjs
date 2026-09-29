import { chromium } from '/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist/node_modules/playwright/index.mjs';
export const BASE = 'http://127.0.0.1:5199/';
export async function launch() {
  const C = '/Users/zygimantasbagdzevicius/Library/Caches/ms-playwright';
  const browser = await chromium.launch({ executablePath: C + '/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell', headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  return { browser, page };
}
export async function boot(page, qs = '') {
  await page.goto(BASE + '?qa=1' + qs);
  await page.waitForFunction(() => document.getElementById('app')?.dataset.ready === '1', null, { timeout: 60000 });
}
export async function startReplay(page, level) {
  await page.evaluate(async (level) => {
    const j = await (await fetch(`/src/levels/${level}.solution.json`)).json();
    window.__heist.freeze(true);
    await window.__heist.loadReplay(j);
    window.__heist.freeze(true);
  }, level);
}
