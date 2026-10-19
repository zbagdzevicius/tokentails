// Adversarial review run (`npm run review`, ~7 min): full races at desktop 1440x900 and phone 390x844, the share-code
// roundtrip and the dare ghost in fresh pages, no console errors. Screenshots land in review/*.png (gitignored).
import { expect, test, type Page } from '@playwright/test';

const st = (page: Page) => page.evaluate(() => {
  const w = (window as any).__fm?.shell.world;
  if (!w) return null;
  const k = w.st.karts[5];
  return { tick: w.st.tick, phase: w.st.phase, dist: k.dist, lap: k.lap, finished: k.finished, driftDir: k.driftDir, driftTier: k.driftTier, item: k.item, proj: (w.st.items.s?.proj.length ?? 0) + (w.st.items.s?.traps.length ?? 0) };
});

function watch(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
}

const DEVICES = [
  { name: 'desktop', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'phone', opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 } },
];

for (const d of DEVICES) {
  test(`${d.name}: full race start/race/drift/item/finish`, async ({ browser }) => {
    const ctx = await browser.newContext(d.opts);
    const page = await ctx.newPage();
    const errors: string[] = [];
    watch(page, errors);
    await page.goto('/?seed=21&bot=1');
    await expect(page.locator('canvas.fm-canvas')).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `review/${d.name}-start.png` });
    if (d.name === 'phone') await page.touchscreen.tap(195, 200);
    await expect.poll(async () => (await st(page))?.phase, { timeout: 40_000 }).toBe('race');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `review/${d.name}-race.png` });
    await expect.poll(async () => (await st(page))?.driftTier ?? 0, { timeout: 60_000, intervals: [100] }).toBeGreaterThan(0);
    await page.screenshot({ path: `review/${d.name}-drift.png` });
    await page.evaluate(() => { const k = (window as any).__fm.shell.world.st.karts[5]; k.item = 'hairball'; k.itemCount = 1; k.rouletteTicks = 0; });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `review/${d.name}-item.png` });
    await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 280_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `review/${d.name}-finish.png` });
    console.log(d.name, 'final', JSON.stringify(await st(page)));
    console.log(d.name, 'errors', JSON.stringify(errors));
    expect(errors.filter((e) => !e.startsWith('warning'))).toEqual([]);
    await ctx.close();
  });

  test(`${d.name}: editor, share code roundtrip in a fresh page`, async ({ browser }) => {
    const ctx = await browser.newContext(d.opts);
    const page = await ctx.newPage();
    const errors: string[] = [];
    watch(page, errors);
    await page.goto('/?make&seed=4');
    await expect(page.locator('.fm-ed')).toBeVisible();
    const box = (await page.locator('.fm-ed-canvas').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, rx = box.width * 0.34, ry = box.height * 0.3;
    await page.mouse.move(cx + rx, cy); await page.mouse.down();
    for (let i = 1; i <= 64; i++) { const a = (i / 64) * Math.PI * 2 * 0.97; await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * (1 + 0.15 * Math.sin(3 * a))); }
    await page.mouse.up();
    await expect(page.locator('.fm-ed-status')).toContainText('Drivable', { timeout: 10_000 });
    await page.screenshot({ path: `review/${d.name}-editor.png` });
    await page.locator('.fm-ed-actions .primary').click();
    await expect(page.locator('.fm-ed')).toHaveCount(0);
    const url = page.url();
    const before = await page.evaluate(() => { const t = (window as any).__fm.shell.setup.track; return { id: t.id, name: t.name, n: JSON.stringify(t).length }; });
    const fresh = await browser.newContext(d.opts);
    const p2 = await fresh.newPage();
    watch(p2, errors);
    await p2.goto(url);
    await expect.poll(() => p2.evaluate(() => (window as any).__fm?.shell.setup?.track.id ?? null), { timeout: 20_000 }).toBe(before.id);
    const after = await p2.evaluate(() => { const t = (window as any).__fm.shell.setup.track; return { id: t.id, name: t.name, n: JSON.stringify(t).length }; });
    console.log(d.name, 'roundtrip', url.length, JSON.stringify(before), JSON.stringify(after));
    expect(after).toEqual(before);
    await p2.waitForTimeout(1500);
    await p2.screenshot({ path: `review/${d.name}-ugc-fresh.png` });
    console.log(d.name, 'editor errors', JSON.stringify(errors));
    expect(errors.filter((e) => !e.startsWith('warning'))).toEqual([]);
    await ctx.close(); await fresh.close();
  });
}

test('ghost link loads in a fresh page', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  watch(page, errors);
  await page.addInitScript(() => { (window as any).__shared = []; Object.defineProperty(navigator, 'share', { configurable: true, value: async (x: any) => (window as any).__shared.push(x.text ?? '') }); Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }); });
  await page.goto('/?bot=1&seed=5&speed=8');
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  await page.locator('.fm-overlay [data-x="1"]').click();
  await page.locator('.fm-dare-name input').fill('Mia');
  await page.locator('.fm-dare-name [type="submit"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(1);
  const text: string = await page.evaluate(() => (window as any).__shared[0]);
  console.log('dare text:\n' + text);
  const link = text.split('\n').find((l) => l.includes('#g='))!;
  const hash = link.slice(link.indexOf('#'));
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await fresh.newPage();
  watch(p2, errors);
  await p2.goto('/' + hash);
  await expect(p2.locator('.fm-dare-banner')).toBeVisible({ timeout: 15_000 });
  const g = await p2.evaluate(() => !!(window as any).__fm.shell.stage.scene.getObjectByName('kart-Mia'));
  expect(g).toBe(true);
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: 'review/desktop-ghost-dare.png' });
  console.log('ghost errors', JSON.stringify(errors));
  expect(errors.filter((e) => !e.startsWith('warning'))).toEqual([]);
  await ctx.close(); await fresh.close();
});
