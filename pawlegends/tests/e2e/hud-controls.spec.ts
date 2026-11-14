import { expect, test, type Page } from '@playwright/test';
import { attr, playFromHome, seedSide } from './helpers';

/**
 * Gaps round 3 (hud-controls): the HUD layout editor (Settings → HUD layout → Edit) and the per-ability cast modes, end
 * to end on a landscape phone. A layout made in the editor is what the match lays out (Q and the minimap group where they
 * were dropped); a drop on another button slides back; "Quick cast with indicator" shows the aim on the press;
 * "Normal" arms the skill and the next tap on the field casts it.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

const SHOTS = process.env.PL_SHOTS ?? 'test-results/hud-controls';

async function centre(page: Page, sel: string): Promise<{ x: number; y: number }> {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  await page.mouse.up();
}

async function live(page: Page): Promise<void> {
  await playFromHome(page);
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
  const vp = page.viewportSize()!;
  await page.touchscreen.tap(vp.width * 0.3, vp.height * 0.85);
  await expect(page.locator('.pl-touch.on')).toBeVisible();
}

test('the editor: drag, refuse an overlap, save; the match lays out what was saved', async ({ page }) => {
  test.setTimeout(150_000);
  await seedSide(page, 'cat', { sessions: 3, matches: 5, wins: 2, veteran: true });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('[data-a="settings"]').first().click();
  await page.locator('[data-testid="hud-edit"]').click();
  const ed = page.locator('[data-testid="hud-editor"]');
  await expect(ed).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/editor-default.png` });
  // Q onto W: slides back, with the reason
  const q0 = await centre(page, '[data-testid="hud-ctl-q"]');
  await drag(page, q0, await centre(page, '[data-testid="hud-ctl-w"]'));
  expect(await centre(page, '[data-testid="hud-ctl-q"]')).toEqual(q0);
  await expect(page.locator('[data-testid="hud-hint"]')).toContainText('overlap W');
  // Q to open ground, the minimap right and down
  await drag(page, q0, { x: q0.x - 300, y: q0.y - 150 });
  const q1 = await centre(page, '[data-testid="hud-ctl-q"]');
  expect(q1.x).toBeLessThan(q0.x - 280);
  const m0 = await centre(page, '[data-testid="hud-ctl-minimap"]');
  await drag(page, m0, { x: 500, y: m0.y + 60 });
  const m1 = await centre(page, '[data-testid="hud-ctl-minimap"]');
  expect(Math.abs(m1.x - 500)).toBeLessThanOrEqual(8);
  // R bigger by one step
  const r = await centre(page, '[data-testid="hud-ctl-r"]');
  await page.mouse.click(r.x, r.y);
  await page.locator('[data-a="bigger"]').click();
  await expect(page.locator('[data-testid="hud-size"]')).toHaveText('R 110%');
  await page.screenshot({ path: `${SHOTS}/editor-moved.png` });
  await page.locator('[data-testid="hud-save"]').click();
  await expect(ed).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pawlegends.hudLayout.v1') ?? '{}'));
  expect(Object.keys(stored['phone-l']).sort()).toEqual(['minimap', 'q', 'r']);
  await page.locator('.pl-settings [data-a="close"]').click();

  await live(page);
  await expect(page.locator('.pl-touch')).toHaveAttribute('data-hud-layout', 'custom');
  // polled: the cluster can still be settling for a frame or two after the controls show
  await expect
    .poll(async () => {
      const qm = await centre(page, '.pl-tbtn.q');
      return Math.max(Math.abs(qm.x - q1.x), Math.abs(qm.y - q1.y));
    }, { timeout: 5000 })
    .toBeLessThanOrEqual(2);
  const mm = (await page.locator('.pl-minimap').boundingBox())!;
  // the editor's group is the box plus the Fish chip's 18 px under it; its top-left is the box's
  const groupTop = m1.y - (mm.height + 18) / 2;
  expect(Math.abs(mm.x + mm.width / 2 - m1.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(mm.y - groupTop)).toBeLessThanOrEqual(3);
  // the ping paw rides with the minimap
  const ping = (await page.locator('.pl-pingbtn').boundingBox())!;
  expect(ping.x).toBeGreaterThan(mm.x);
  expect(ping.x + ping.width).toBeLessThanOrEqual(mm.x + mm.width + 1);
  const rb = (await page.locator('.pl-tbtn.r').boundingBox())!;
  expect(rb.width).toBeGreaterThan(44);
  await page.screenshot({ path: `${SHOTS}/match-custom.png` });
});

test('the default layout is untouched with no layout saved; the minimap model matches the HUD', async ({ page }) => {
  test.setTimeout(120_000);
  for (const [w, h] of [
    [844, 390],
    [667, 375],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await seedSide(page, 'cat', { sessions: 3, matches: 5, wins: 2, veteran: true });
    await page.goto('/?e2e=1');
    await page.waitForSelector('html[data-screen="title"]');
    await live(page);
    await expect(page.locator('.pl-touch')).toHaveAttribute('data-hud-layout', 'default');
    expect(await page.evaluate(() => document.documentElement.dataset.hudMm ?? '')).toBe('');
    const mm = (await page.locator('.pl-minimap').boundingBox())!;
    const s = h <= 380 ? 104 : 112;
    expect(Math.round(mm.width), `${w}x${h}`).toBe(s);
    expect(Math.round(mm.x)).toBe(8);
  }
});

test('cast modes: Indicator shows the aim on the press; Normal arms, then a field tap casts', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem('pawlegends.tcast.q', 'n100');
    localStorage.setItem('pawlegends.tcast.w', 'i100');
  });
  await seedSide(page, 'cat', { sessions: 3, matches: 5, wins: 2, veteran: true, hero: 'clem' });
  await page.goto('/?e2e=1&speed=4');
  await page.waitForSelector('html[data-screen="title"]');
  await live(page);
  // the input goes live when the gates open (0:03)
  await expect.poll(async () => Number(await attr(page, 'tick')), { timeout: 30_000 }).toBeGreaterThan(130);
  const cdp = await page.context().newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchEnd', x: number, y: number): Promise<void> =>
    void (await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] }));
  // Indicator (W): the aim goes up on the press (Quick waits for a 180 ms hold)
  const w = await centre(page, '.pl-tbtn.w');
  const castsW = Number(await attr(page, 'casts'));
  await touch('touchStart', w.x, w.y);
  // the press itself drew the aim (counted on the press; a loaded machine may be slow to paint the next frame)
  await expect.poll(async () => (await attr(page, 'castModes')).split(',')[2], { timeout: 10_000 }).toBe('1');
  await expect.poll(async () => attr(page, 'aim'), { timeout: 10_000 }).toBe('1');
  await touch('touchEnd', w.x, w.y);
  // the release cast W (wait for it, so it is not counted against Q below)
  await expect.poll(async () => Number(await attr(page, 'casts')), { timeout: 10_000 }).toBeGreaterThan(castsW);
  // Normal (Q): a tap arms it (the button glows, no cast yet), a tap on the field casts it
  await page.waitForTimeout(400);
  const casts0 = Number(await attr(page, 'casts'));
  const q = await centre(page, '.pl-tbtn.q');
  await page.touchscreen.tap(q.x, q.y);
  await expect(page.locator('.pl-tbtn.q.armed-cast')).toHaveCount(1);
  await expect.poll(async () => (await attr(page, 'castModes')).split(',')[0]).toBe('1');
  expect(Number(await attr(page, 'casts'))).toBe(casts0);
  await page.screenshot({ path: `${SHOTS}/normal-armed.png` });
  const vp = page.viewportSize()!;
  await page.touchscreen.tap(vp.width * 0.62, vp.height * 0.3);
  await expect(page.locator('.pl-tbtn.q.armed-cast')).toHaveCount(0);
  await expect.poll(async () => (await attr(page, 'castModes')).split(',')[1]).toBe('1');
  await expect.poll(async () => Number(await attr(page, 'casts'))).toBeGreaterThan(casts0);
});

test('Settings: frame rate, ability casting and the HUD layout rows on a phone', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('[data-a="settings"]').first().click();
  await expect(page.locator('[data-testid="fps-row"] [data-fps="60"].on')).toHaveCount(1);
  await page.locator('[data-testid="tcast"] summary').click();
  await expect(page.locator('.tcast')).toHaveCount(5);
  await page.locator('.tcast[data-slot="r"] [data-tcast="indicator"]').click();
  expect(await page.evaluate(() => localStorage.getItem('pawlegends.tcast.r'))).toBe('i100');
  await expect(page.locator('[data-testid="tcast"]')).toHaveAttribute('open', '');
  await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });
});
