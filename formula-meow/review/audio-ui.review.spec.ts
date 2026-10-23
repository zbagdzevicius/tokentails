// Audio-ui review run (part of `npm run review`): screenshots of the redesigned HUD (portrait, landscape, desktop,
// battle and time-trial extras, incoming-item arrows, high contrast), the settings and how-to screens, the results
// and the paw iris, plus the audio state after a race. Screenshots land in review/ui-*.png (gitignored).
import { expect, test, type Page } from '@playwright/test';

const DEVICES = [
  { name: 'phone', opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
  { name: 'land', opts: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
  { name: 'desktop', opts: { viewport: { width: 1440, height: 900 } } },
];

const tick = (page: Page) => page.evaluate(() => (window as any).__fm?.shell.world?.st.tick ?? 0);

/** Put every HUD extra on screen: coins, GP index, a split, a rival, an item, a homing yarn ball behind the player. */
const dressHud = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__fm.shell;
    const st = s.world.st;
    const me = st.karts[5];
    me.coins = 6;
    me.item = 'catnip';
    me.itemCount = 3;
    me.rouletteTicks = 0;
    s.hudExtras({ showCoins: true, gpRace: { n: 2, of: 4 }, splits: [-0.42], rival: { kart: 2, name: s.racers[2].name } });
    const it = st.items.s ?? (st.items.s = { proj: [], traps: [] });
    it.proj.push({ id: 990, kind: 1, owner: 2, x: me.x - Math.sin(me.heading) * 18 + 3, y: me.y, z: me.z - Math.cos(me.heading) * 18, vx: Math.sin(me.heading) * 30, vz: Math.cos(me.heading) * 30, si: me.si, dist: me.dist - 18, d: 0, life: 9999, bounces: 0, target: 5, imm: 0, hitMask: 0, age: 0 });
  });

for (const d of DEVICES) {
  test(`${d.name}: HUD, battle extras, high contrast, settings, how to play`, async ({ browser }) => {
    const ctx = await browser.newContext(d.opts);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?seed=11');
    await page.mouse.click(200, 200);
    await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(300);
    await dressHud(page);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `review/ui-${d.name}-hud.png` });
    await page.evaluate(() => {
      const s = (window as any).__fm.shell;
      s.world.st.karts[5].balloons = 2;
      s.world.st.karts[1].out = 1;
      s.hudExtras({ mode: 'battle', timeLeft: 8.4 });
      s.updateSettings({ highContrast: true });
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `review/ui-${d.name}-battle-contrast.png` });
    await page.evaluate(() => (window as any).__fm.shell.updateSettings({ highContrast: false }));
    await page.keyboard.press('Escape');
    await page.locator('[data-screen="pause"] [data-act="settings"]').click();
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-screen="settings"] [role="tab"]').nth(i).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `review/ui-${d.name}-settings-${i}.png` });
    }
    await page.keyboard.press('Escape');
    await page.evaluate(() => void (window as any).__fm.shell.screens.push('howto'));
    for (let i = 0; i < 4; i++) {
      await page.locator('[data-screen="howto"] [role="tab"]').nth(i).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `review/ui-${d.name}-howto-${i}.png` });
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('phone: a full race with the announcer, captions and results', async ({ browser }) => {
  const ctx = await browser.newContext(DEVICES[0].opts);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('fm:save', JSON.stringify({ v: 2, settings: { captions: true }, slots: {} }));
  });
  await page.goto('/?bot=1&seed=5&speed=4');
  await page.mouse.click(200, 200);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(200);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'review/ui-phone-go-caption.png' });
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 200_000 });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'review/ui-phone-results.png' });
  console.log('audio', JSON.stringify(await page.evaluate(() => (window as any).__fm.shell.audio.state)), JSON.stringify(await page.evaluate(() => (window as any).__fmUi)));
  await ctx.close();
});
