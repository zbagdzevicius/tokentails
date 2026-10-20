// Iteration 2 final review (`npm run review:v2`): every mode and screen at desktop 1440x900 and phone 390x844, with
// screenshots in review/v2/<device>-<name>.png (gitignored). The returning player comes from a v1 save
// (`fm:progress` / `fm:settings`), so the run also checks the v1 → v2 migration. Fails on any page error.
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

const DEVICES: Array<{ name: string; opts: BrowserContextOptions }> = [
  { name: 'desktop', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'phone', opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
];
const TRACKS = ['kitchen', 'rooftops', 'laundry', 'yarn', 'cafe', 'shelter'];

type Ctx = { page: Page; errors: string[]; close(): Promise<void> };

async function open(browser: Browser, opts: BrowserContextOptions, v1 = true): Promise<Ctx> {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  if (v1)
    await page.addInitScript(() => {
      if (localStorage.getItem('fm:save')) return;
      localStorage.setItem('fm:progress', JSON.stringify({ races: 9, unlocked: 2, pounces: 3, drifts: 3, bestTimes: { 'kitchen:1': 80.5 } }));
      localStorage.setItem('fm:settings', JSON.stringify({ autoGas: false, oneThumb: true, reducedMotion: false, muted: true, cls: 1 }));
    });
  return { page, errors, close: () => ctx.close() };
}

const shot = (page: Page, dev: string, name: string) => page.screenshot({ path: `review/v2/${dev}-${name}.png` });
const topId = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.fm-screen:not([hidden])')].pop()?.dataset.screen ?? null);
const phase = (page: Page) => page.evaluate(() => (window as any).__fm?.shell.world?.st.phase ?? null);
const player = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__fm?.shell.world;
    if (!w) return null;
    const k = w.st.karts[w.cfg.humans[0] ?? 0];
    return { driftTier: k.driftTier, proj: (w.st.items.s?.proj.length ?? 0) + (w.st.items.s?.traps.length ?? 0) };
  });
async function tap(page: Page, sel: string): Promise<void> {
  const l = page.locator(sel).first();
  if ((page.viewportSize()?.width ?? 1000) < 500) await l.tap();
  else await l.click();
}
async function toMenu(page: Page): Promise<void> {
  await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 20_000 });
  await tap(page, '[data-act="start"]');
  await expect(page.locator('[data-screen="menu"]')).toBeVisible();
}

for (const d of DEVICES) {
  test(`${d.name}: title, menu, every menu screen`, async ({ browser }) => {
    test.setTimeout(480_000);
    const c = await open(browser, d.opts);
    const { page } = c;
    await page.goto('/?bot=1');
    await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await shot(page, d.name, 'title');
    // v1 → v2 migration: unlocks, races and the class pick survive
    const mig = await page.evaluate(() => {
      const b = JSON.parse(localStorage.getItem('fm:save') ?? 'null');
      return { v: b?.v, core: b?.slots?.core, cls: b?.settings?.cls, v1Kept: !!localStorage.getItem('fm:progress') };
    });
    expect(mig.v).toBe(2);
    expect(mig.core.unlocked).toBe(2);
    expect(mig.core.races).toBe(9);
    expect(mig.core.bestTimes['race:kitchen:1:0']).toBe(80.5);
    expect(mig.cls).toBe(1);
    expect(mig.v1Kept).toBe(true);
    await toMenu(page);
    await page.waitForTimeout(1800); // the paw-iris wipe runs ~1 s
    await shot(page, d.name, 'menu');
    for (const [tile, screen] of [
      ['garage', 'garage'],
      ['achievements', 'achievements'],
      ['stats', 'stats'],
      ['pinkpaw', 'pinkpaw'],
      ['settings', 'settings'],
      ['howto', 'howto'],
      ['doodle', 'tracks'],
    ] as const) {
      await tap(page, `[data-tile="${tile}"]`);
      await expect.poll(() => topId(page), { timeout: 10_000 }).toBe(screen);
      await page.waitForTimeout(900);
      await shot(page, d.name, `screen-${screen}`);
      if (tile === 'pinkpaw') await expect(page.locator('[data-screen="pinkpaw"]')).toContainText('2026-10-04');
      await page.keyboard.press('Escape');
      await expect.poll(() => topId(page), { timeout: 10_000 }).toBe('menu');
    }
    // your cat (the maker is an overlay, not a screen)
    await tap(page, '[data-tile="yourcat"]');
    await page.waitForTimeout(1200);
    await shot(page, d.name, 'yourcat');
    await page.keyboard.press('Escape');
    expect(c.errors).toEqual([]);
    await c.close();
  });

  test(`${d.name}: Grand Prix, character select → 4 races → standings → podium`, async ({ browser }) => {
    test.setTimeout(1_200_000);
    const c = await open(browser, d.opts);
    const { page } = c;
    await page.goto('/?bot=1&speed=8');
    await toMenu(page);
    await tap(page, '[data-tile="gp"]');
    await expect(page.locator('[data-screen="select"]')).toBeVisible();
    await page.waitForTimeout(1200);
    await shot(page, d.name, 'character-select');
    await tap(page, '[data-act="ready"]');
    await expect.poll(() => topId(page)).toBe('class');
    await page.waitForTimeout(1500);
    await shot(page, d.name, 'class');
    await tap(page, '[data-act="class-1"]');
    await expect.poll(() => topId(page)).toBe('cup');
    await page.waitForTimeout(500);
    await shot(page, d.name, 'cup');
    await tap(page, '[data-act="cup-kibble"]');
    for (let race = 1; race <= 4; race++) {
      if (race === 1) {
        await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('race');
        await page.waitForTimeout(1500);
        await shot(page, d.name, 'gp-race');
      }
      await expect(page.locator('[data-act="mode-continue"]')).toBeVisible({ timeout: 300_000 });
      await page.waitForTimeout(600);
      if (race === 1) await shot(page, d.name, 'gp-results');
      await tap(page, '[data-act="mode-continue"]');
      await expect(page.locator('[data-screen="standings"]')).toBeVisible();
      await page.waitForTimeout(2600); // rows count up, then slide into the new order
      if (race === 1 || race === 4) await shot(page, d.name, `gp-standings-${race}`);
      await tap(page, '[data-screen="standings"] [data-act="continue"]');
    }
    await expect(page.locator('[data-screen="podium"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4500);
    await shot(page, d.name, 'podium');
    await tap(page, '[data-screen="podium"] [data-act="menu"]');
    await expect.poll(() => topId(page), { timeout: 10_000 }).toBe('rewards');
    await page.waitForTimeout(900);
    await shot(page, d.name, 'rewards');
    expect(c.errors).toEqual([]);
    await c.close();
  });

  test(`${d.name}: every track, drift, items, results`, async ({ browser }) => {
    test.setTimeout(900_000);
    const c = await open(browser, d.opts);
    const { page } = c;
    for (const [i, id] of TRACKS.entries()) {
      await page.goto(`/?track=${id}&bot=1&seed=${7 + i}&cls=1`);
      if (d.name === 'phone') await page.touchscreen.tap(195, 300).catch(() => {});
      await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('race');
      await page.waitForTimeout(6000);
      await shot(page, d.name, `track-${id}`);
      expect(await page.evaluate(() => (window as any).__fm.shell.setup.track.id)).toBe(id);
    }
    // drift and items on the last track
    await expect.poll(async () => (await player(page))?.driftTier ?? 0, { timeout: 60_000, intervals: [100] }).toBeGreaterThan(0);
    await shot(page, d.name, 'drift');
    await page.evaluate(() => {
      const w = (window as any).__fm.shell.world;
      const k = w.st.karts[w.cfg.humans[0] ?? 0];
      k.item = 'yarn';
      k.itemCount = 3;
      k.rouletteTicks = 0;
    });
    await page.waitForTimeout(60); // the bot fires items quickly
    await shot(page, d.name, 'items-held');
    await expect.poll(async () => (await player(page))?.proj ?? 0, { timeout: 60_000, intervals: [200] }).toBeGreaterThan(0);
    await shot(page, d.name, 'items-flying');
    // results: a single race at speed 8 from the menu
    await page.goto('/?bot=1&speed=8');
    await toMenu(page);
    await tap(page, '[data-tile="race"]');
    await tap(page, '[data-act="ready"]');
    await expect.poll(() => topId(page)).toBe('race');
    await tap(page, '[data-act="track-cafe"]');
    await page.waitForTimeout(300);
    await shot(page, d.name, 'single-race-pick');
    await tap(page, '[data-screen="race"] [data-act="start"]');
    // a single race ends on the shared results card (Next / Again / Menu), not the modes card
    await expect(page.locator('.fm-overlay.on button', { hasText: 'Again' }).first()).toBeVisible({ timeout: 300_000 });
    await page.waitForTimeout(1500);
    await shot(page, d.name, 'results');
    expect(c.errors).toEqual([]);
    await c.close();
  });

  test(`${d.name}: battle, time trial, daily cup`, async ({ browser }) => {
    test.setTimeout(600_000);
    const c = await open(browser, d.opts);
    const { page } = c;
    await page.goto('/?bot=1');
    await toMenu(page);
    await tap(page, '[data-tile="battle"]');
    await tap(page, '[data-act="ready"]');
    await expect.poll(() => topId(page)).toBe('battle');
    await page.waitForTimeout(1500);
    await shot(page, d.name, 'battle-setup');
    await tap(page, '[data-screen="battle"] [data-act="start"]');
    await expect.poll(() => page.evaluate(() => (window as any).__fm?.shell.world?.cfg.mode ?? null), { timeout: 30_000 }).toBe('battle');
    await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('race');
    await page.waitForTimeout(9000);
    await shot(page, d.name, 'battle');
    // time trial
    await page.goto('/?bot=1');
    await toMenu(page);
    await tap(page, '[data-tile="tt"]');
    await tap(page, '[data-act="ready"]');
    await expect(page.locator('[data-screen="tt"]')).toBeVisible();
    await expect(page.locator('.fm-m-medals')).toContainText('🥇', { timeout: 30_000 });
    await page.waitForTimeout(1000);
    await shot(page, d.name, 'tt-setup');
    await tap(page, '[data-act="track-rooftops"]');
    await tap(page, '[data-screen="tt"] [data-act="start"]');
    await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('race');
    await page.waitForTimeout(7000);
    await shot(page, d.name, 'tt-race');
    // Daily Cup from its link
    await page.goto('/?daily=1&bot=1');
    await expect.poll(() => page.evaluate(() => (window as any).__fm?.shell.setup?.mode ?? null), { timeout: 30_000 }).toBe('daily');
    await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('race');
    await page.waitForTimeout(3000);
    await shot(page, d.name, 'daily');
    expect(c.errors).toEqual([]);
    await c.close();
  });

  test(`${d.name}: editor → race it → track code in a fresh page`, async ({ browser }) => {
    test.setTimeout(480_000);
    const c = await open(browser, d.opts);
    const { page } = c;
    await page.goto('/?make&seed=4');
    await expect(page.locator('.fm-ed')).toBeVisible();
    const box = (await page.locator('.fm-ed-canvas').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, rx = box.width * 0.34, ry = box.height * 0.3;
    await page.mouse.move(cx + rx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2 * 0.97;
      await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * (1 + 0.15 * Math.sin(3 * a)));
    }
    await page.mouse.up();
    await expect(page.locator('.fm-ed-status')).toContainText('Drivable', { timeout: 10_000 });
    await shot(page, d.name, 'editor');
    await page.locator('.fm-ed-actions .primary').click();
    await expect(page.locator('.fm-ed')).toHaveCount(0);
    await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('race');
    await page.waitForTimeout(3000);
    await shot(page, d.name, 'editor-race');
    const url = page.url();
    expect(url).toContain('t=');
    const id = await page.evaluate(() => (window as any).__fm.shell.setup.track.id);
    const c2 = await open(browser, d.opts, false);
    await c2.page.goto(url);
    await expect.poll(() => c2.page.evaluate(() => (window as any).__fm?.shell.setup?.track.id ?? null), { timeout: 20_000 }).toBe(id);
    // a damaged track code fails gracefully: no page error, the game still runs
    const c3 = await open(browser, d.opts, false);
    await c3.page.goto('/?t=AAAAbroken');
    await expect.poll(() => c3.page.evaluate(() => !!(window as any).__fm?.shell), { timeout: 20_000 }).toBe(true);
    await c3.page.waitForTimeout(2500);
    await shot(c3.page, d.name, 'track-code-broken');
    expect([...c.errors, ...c2.errors, ...c3.errors]).toEqual([]);
    await c.close();
    await c2.close();
    await c3.close();
  });
}

test('dare link: make one, open it fresh, and a broken / old one fails gracefully', async ({ browser }) => {
  test.setTimeout(300_000);
  const c = await open(browser, DEVICES[1].opts);
  const { page } = c;
  await page.addInitScript(() => {
    (window as any).__shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (x: any) => (window as any).__shared.push(x.text ?? '') });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  });
  await page.goto('/?bot=1&seed=5&speed=8&track=kitchen');
  await expect(page.locator('.fm-overlay.on .fm-place, [data-act="mode-again"]').first()).toBeVisible({ timeout: 200_000 });
  await page.waitForTimeout(800);
  await shot(page, 'phone', 'results-ftue');
  await page.locator('.fm-overlay [data-x="1"]').click();
  await page.locator('.fm-dare-name input').fill('Mia');
  await page.locator('.fm-dare-name [type="submit"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(1);
  const text: string = await page.evaluate(() => (window as any).__shared[0]);
  const link = text.split('\n').find((l) => l.includes('#g='))!;
  const hash = link.slice(link.indexOf('#'));
  const c2 = await open(browser, DEVICES[0].opts, false);
  await c2.page.goto('/' + hash);
  await expect(c2.page.locator('.fm-dare-banner')).toBeVisible({ timeout: 20_000 });
  expect(await c2.page.evaluate(() => !!(window as any).__fm.shell.stage.scene.getObjectByName('kart-Mia'))).toBe(true);
  await c2.page.waitForTimeout(6000); // past the first flyover frames
  await shot(c2.page, 'desktop', 'dare');
  const c3 = await open(browser, DEVICES[0].opts, false);
  await c3.page.goto('/#g=' + hash.slice(4, 30) + 'xx');
  await expect.poll(() => c3.page.evaluate(() => !!(window as any).__fm?.shell), { timeout: 20_000 }).toBe(true);
  await c3.page.waitForTimeout(6000);
  await shot(c3.page, 'desktop', 'dare-broken');
  console.log('dare text:\n' + text);
  expect([...c.errors, ...c2.errors, ...c3.errors]).toEqual([]);
  await c.close();
  await c2.close();
  await c3.close();
});
