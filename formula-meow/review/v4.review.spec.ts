// Iteration 4 final-pass review (`npm run review:v4`): every playtest fix and new feature at desktop 1440x900 and
// phone 390x844 (plus the landscape phone 844x390 where the playtest found the problem). Screenshots in
// review/v4/<size>-<feature>.png (gitignored). Fails on a page error or a frame over 120 draw calls.
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { LEGACY } from './v3-legacy-codes';

const DESK = { name: '1440x900', opts: { viewport: { width: 1440, height: 900 } } };
const PHONE = { name: '390x844', opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } };
const LAND = { name: '844x390', opts: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } };
const SIZES: Array<{ name: string; opts: BrowserContextOptions }> = [DESK, PHONE];

type Ctx = { page: Page; errors: string[]; close(): Promise<void> };
async function open(browser: Browser, opts: BrowserContextOptions): Promise<Ctx> {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  return { page, errors, close: () => ctx.close() };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const tick = (page: Page) => page.evaluate(() => (window as any).__fm?.shell.world?.st.tick ?? 0);
const calls = (page: Page) => page.evaluate(() => (window as any).__fm.shell.stage.renderer.info.render.calls as number);
const shot = (page: Page, size: string, name: string) => page.screenshot({ path: `review/v4/${size}-${name}.png` });

async function done(c: Ctx): Promise<void> {
  expect(await calls(c.page)).toBeLessThanOrEqual(120);
  expect(c.errors).toEqual([]);
  await c.close();
}

test('the TAP! ring lies flat on the ramp run-up, never over the kart', async ({ browser }) => {
  for (const s of SIZES) {
    const c = await open(browser, s.opts);
    await c.page.goto('/?bot=1&seed=3&track=kitchen');
    await c.page.waitForFunction(
      () => {
        const sh = (window as any).__fm?.shell;
        const m = sh?.stage.scene.getObjectByName('paw-rings');
        if (!m || !m.visible) return false;
        const a = m.geometry.getAttribute('aPulse').array;
        for (let i = 0; i < m.count; i++)
          if (a[i] >= 0.99) {
            sh.simSpeed = 0;
            return true;
          }
        return false;
      },
      null,
      { timeout: 240_000, polling: 'raf' },
    );
    await c.page.waitForTimeout(250);
    await shot(c.page, s.name, 'tap-ring');
    await done(c);
  }
});

test('dare card, duel countdown and the live gap pill (landscape included)', async ({ browser }) => {
  for (const s of [...SIZES, LAND]) {
    const c = await open(browser, s.opts);
    await c.page.goto(`/#g=${LEGACY.dare11}&n=Zyg`);
    await expect(c.page.locator('.fm-dare-card')).toBeVisible({ timeout: 20_000 });
    await expect(c.page.locator('.fm-dare-time b')).toHaveText(/\d:\d\d\.\d\d/, { timeout: 20_000 });
    await c.page.waitForTimeout(400);
    await shot(c.page, s.name, 'dare-card');
    await c.page.locator('[data-act="dare-go"]').click();
    await expect.poll(() => tick(c.page), { timeout: 15_000 }).toBeGreaterThan(60);
    await c.page.waitForTimeout(300);
    await shot(c.page, s.name, 'duel-countdown');
    await expect(c.page.locator('.fm-gap-pill:not(.fm-lap-pill) b')).toHaveText(/^[+−]\d+\.\d\d$/, { timeout: 30_000 });
    await c.page.waitForTimeout(1500);
    await shot(c.page, s.name, 'duel-gap');
    await done(c);
  }
});

test('Laundry: the hanging sheet fades between the camera and the kart', async ({ browser }) => {
  for (const s of SIZES) {
    const c = await open(browser, s.opts);
    await c.page.goto('/?bot=1&seed=3&track=laundry');
    await expect.poll(() => tick(c.page), { timeout: 30_000 }).toBeGreaterThan(240);
    await c.page.evaluate(() => {
      const w = window as any;
      const sh = w.__fm.shell;
      const hz = sh.world.track.hazards.find((p: any) => p.kind === 'laundry');
      const h = Math.atan2(hz.tx, hz.tz);
      const x = hz.x + hz.tx * 2.5;
      const z = hz.z + hz.tz * 2.5;
      const pin = () => Object.assign(sh.world.st.karts[sh.me], { x, y: hz.y, z, vx: hz.tx * 0.01, vz: hz.tz * 0.01, heading: h });
      pin();
      sh.camera.snap(x, hz.y, z, h);
      w.__pin = true;
      const loop = () => {
        if (!w.__pin) return;
        pin();
        requestAnimationFrame(loop);
      };
      loop();
    });
    await expect.poll(() => c.page.evaluate(() => Math.min(...(window as any).__fmTracks.sheetAlpha)), { timeout: 5_000 }).toBeLessThan(0.3);
    await c.page.waitForTimeout(300);
    await shot(c.page, s.name, 'laundry-sheet-fade');
    await c.page.evaluate(() => ((window as any).__pin = false));
    await done(c);
  }
});

test('battle: DOUBLE POINTS sits under the held item name', async ({ browser }) => {
  for (const s of [DESK, { name: '390x844', opts: { viewport: { width: 390, height: 844 } } }, { name: '844x390', opts: { viewport: { width: 844, height: 390 } } }]) {
    const c = await open(browser, s.opts);
    await c.page.goto('/?bot=1&track=rug&speed=8');
    await expect(c.page.locator('.fm-mode-hud.frenzy .fm-mh-frenzy')).toBeVisible({ timeout: 240_000 });
    await c.page.evaluate(() => {
      (window as any).__fm.shell.simSpeed = 0;
      const n = document.querySelector('.fm-item-name') as HTMLElement;
      n.textContent = 'Cucumber';
      n.classList.add('on');
    });
    await c.page.waitForTimeout(300);
    await shot(c.page, s.name, 'battle-frenzy');
    await done(c);
  }
});

test('results: a toast drops in at the top; desktop keeps the player row out of the fade; ON FIRE and SIDE BY SIDE in the race HUD', async ({ browser }) => {
  for (const s of [...SIZES, LAND]) {
    const c = await open(browser, s.opts);
    await c.page.goto('/?bot=1&seed=5&speed=4');
    await expect.poll(() => tick(c.page), { timeout: 30_000 }).toBeGreaterThan(900);
    // the race HUD with ON FIRE (under the place) and a wheel-to-wheel gap chip, frozen
    await c.page.evaluate(() => {
      const sh = (window as any).__fm.shell;
      sh.simSpeed = 0;
      sh.hud.fx.fire('ON FIRE', 0.7);
      sh.hud.fx.gaps(0.02, 0.4, 'catch');
    });
    await c.page.waitForTimeout(250);
    await shot(c.page, s.name, 'hud-fire-side-by-side');
    await c.page.evaluate(() => ((window as any).__fm.shell.simSpeed = 4));
    await expect(c.page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 150_000 });
    await c.page.waitForTimeout(1500);
    await c.page.evaluate(() => {
      const host = document.createElement('div');
      host.className = 'fm-ui-toasts';
      host.innerHTML = '<div class="fm-ui-toast">👻 Achievement: Ghostbuster +25 🐟</div>';
      document.body.append(host);
    });
    await shot(c.page, s.name, 'results-toast');
    if (s.name === '1440x900') {
      await c.page.evaluate(() => {
        document.querySelector('.fm-ui-toasts')?.remove();
        const rows = [...document.querySelectorAll<HTMLElement>('.fm-overlay.on .fm-table tr')];
        for (const r of rows) r.classList.remove('me');
        rows[rows.length - 1].classList.add('me');
        const sc = document.querySelector<HTMLElement>('.fm-overlay.on .fm-res-scroll')!;
        sc.scrollTop = 0;
        sc.dispatchEvent(new Event('scroll'));
      });
      await c.page.waitForTimeout(300);
      await shot(c.page, s.name, 'results-last-row');
    }
    await done(c);
  }
});

test('the grid banner (Daily Cup) clears the kart; Night: a moon, not a sun', async ({ browser }) => {
  for (const s of SIZES) {
    const c = await open(browser, s.opts);
    await c.page.goto('/?bot=1&daily=1');
    await expect(c.page.locator('.fm-dare-banner')).toContainText('Daily Cup', { timeout: 20_000 });
    await expect.poll(() => c.page.evaluate(() => (window as any).__fm.shell.camera.mode), { timeout: 20_000 }).toBe('chase');
    await c.page.waitForTimeout(600);
    await shot(c.page, s.name, 'grid-banner');
    for (const [track, mods, name] of [['cafe', 0, 'cafe-moon'], ['kitchen', 2, 'kitchen-night-moon']] as const) {
      await c.page.goto(`/?bot=1&track=${track}&seed=2`);
      await expect.poll(() => tick(c.page), { timeout: 30_000 }).toBeGreaterThan(0);
      if (mods) {
        await c.page.evaluate((m) => {
          const sh = (window as any).__fm.shell;
          sh.start({ ...sh.setup, modifiers: m, mode: 'race' });
        }, mods);
        await c.page.waitForTimeout(1500);
      }
      // look back up the start straight at the sky
      await c.page.evaluate(() => ((window as any).__fm.shell.simSpeed = 0));
      await c.page.waitForTimeout(500);
      await shot(c.page, s.name, name);
    }
    await done(c);
  }
});

test('GP standings after race 1: no movement arrows, real places', async ({ browser }) => {
  for (const s of SIZES) {
    const c = await open(browser, s.opts);
    await c.page.addInitScript(() => {
      if (!localStorage.getItem('fm:save')) localStorage.setItem('fm:save', JSON.stringify({ v: 2, settings: {}, slots: { core: { races: 4, unlocked: 1, pounces: 2, drifts: 2, bestTimes: {} } } }));
    });
    await c.page.goto('/?bot=1&speed=8');
    await expect(c.page.locator('[data-screen="title"]')).toBeVisible({ timeout: 20_000 });
    await c.page.locator('[data-act="start"]').click();
    await c.page.locator('[data-tile="gp"]').click();
    if (await c.page.locator('[data-screen="select"]').isVisible()) {
      await c.page.locator('[data-act="ready"]').click();
      await c.page.locator('[data-act="class-0"]').click();
      await c.page.locator('[data-act="cup-kibble"]').click();
    }
    await expect(c.page.locator('[data-act="mode-continue"]')).toBeVisible({ timeout: 200_000 });
    await c.page.locator('[data-act="mode-continue"]').click();
    await expect(c.page.locator('[data-screen="standings"]')).toBeVisible();
    await c.page.waitForTimeout(1800);
    await shot(c.page, s.name, 'gp-standings-race1');
    expect((await c.page.locator('.fm-m-srow .mv').allTextContents()).join('')).toBe('');
    expect(c.errors).toEqual([]);
    await c.close();
  }
});
