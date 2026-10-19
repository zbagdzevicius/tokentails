import { expect, test, type Page } from '@playwright/test';

/**
 * Lane "modes" (iteration 2): title → menu → Grand Prix (4 races) → podium → menu; time trial saves a ghost and the
 * next run races it; balloon battle ends with a winner within 3 minutes of sim time; every menu screen opens by
 * touch, keyboard and a (simulated) gamepad with a visible focus; the first visit is the FTUE race; deep links skip
 * the title; quitting a Grand Prix race asks first and the cup can be resumed.
 */

type Win = {
  __fm?: { shell: { world: { done: boolean; st: { tick: number; phase: string; karts: Array<{ out: number; balloons: number; finished: number }>; order: number[] }; ctx: { goTick: number }; cfg: { mode?: string } } | null; attract: boolean; setup: unknown } };
  __fmModes?: { ttGhost: { live: boolean; label: string | null }; save: { tt: Record<string, { best: number; ghost?: string }>; cup: { race: number } | null; trophies: Record<string, number> } };
  __pad?: { buttons: Array<{ pressed: boolean; value: number }>; axes: number[]; connected: boolean; index: number; id: string; mapping: string };
};

/** A returning player (so a plain visit opens on the title): 4 races done, 100cc open. */
async function returning(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('fm:save')) localStorage.setItem('fm:save', JSON.stringify({ v: 2, settings: {}, slots: { core: { races: 4, unlocked: 1, pounces: 2, drifts: 2, bestTimes: {} } } }));
  });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const top = (page: Page) => page.locator('.fm-screen:not([hidden])').last();
const topId = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.fm-screen:not([hidden])')].pop()?.dataset.screen ?? null);

async function toMenu(page: Page): Promise<void> {
  await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-act="start"]').click();
  await expect(page.locator('[data-screen="menu"]')).toBeVisible();
}

test('title → menu → Grand Prix, four races → standings → podium → menu, with no console errors', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  await returning(page);
  await page.goto('/?bot=1&speed=8');
  // the title sits over the attract race (the bot drives it, no HUD)
  await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__fm?.shell.attract), { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: 'e2e/screens/modes-title.png' });
  await toMenu(page);
  await page.screenshot({ path: 'e2e/screens/modes-menu.png' });
  await page.locator('[data-tile="gp"]').click();
  await expect(page.locator('[data-screen="select"]')).toBeVisible();
  await page.locator('[data-act="ready"]').click();
  await page.locator('[data-act="class-0"]').click();
  await page.locator('[data-act="cup-kibble"]').click();
  for (let race = 1; race <= 4; race++) {
    await expect(page.locator('[data-act="mode-continue"]')).toBeVisible({ timeout: 200_000 });
    // a cup race shows Continue, never Again / Next
    await expect(page.locator('[data-act="again"]')).toHaveCount(0);
    await expect(page.locator('.fm-m-res')).toContainText('point');
    await page.locator('[data-act="mode-continue"]').click();
    await expect(page.locator('[data-screen="standings"]')).toBeVisible();
    await expect(page.locator('.fm-m-srow')).toHaveCount(8);
    if (race === 1) await page.screenshot({ path: 'e2e/screens/modes-standings.png' });
    await page.locator('[data-screen="standings"] [data-act="continue"]').click();
  }
  await expect(page.locator('[data-screen="podium"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/screens/modes-podium.png' });
  const after = await page.evaluate(() => (window as unknown as Win).__fmModes!.save);
  expect(after.cup).toBeNull();
  await page.locator('[data-screen="podium"] [data-act="menu"]').click();
  // [integrator] the progression lane's cup rewards (fish from the four races, the trophy) open over the menu
  await expect.poll(() => topId(page), { timeout: 10_000 }).toBe('rewards');
  await expect(page.locator('[data-screen="rewards"] .fm-prog-reasons')).toContainText('cup');
  await page.screenshot({ path: 'e2e/screens/modes-rewards.png' });
  await page.locator('[data-screen="rewards"] [data-act="continue"]').click();
  await expect(page.locator('[data-screen="menu"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__fm?.shell.attract), { timeout: 20_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('time trial: the first run saves a personal-best ghost and Retry races it', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await returning(page);
  await page.goto('/?bot=1&speed=8');
  await toMenu(page);
  await page.locator('[data-tile="tt"]').click();
  await page.locator('[data-act="ready"]').click();
  await expect(page.locator('[data-screen="tt"]')).toBeVisible();
  await expect(page.locator('.fm-m-medals')).toContainText('🥇', { timeout: 20_000 });
  await page.locator('[data-act="track-kitchen"]').click();
  await page.locator('[data-screen="tt"] [data-act="start"]').click();
  // no PB yet: the dev ghost runs
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fmModes!.ttGhost.label), { timeout: 20_000 }).toBe('Dev ghost');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fmModes!.ttGhost.live)).toBe(true);
  const field = await page.evaluate(() => (window as unknown as Win).__fm!.shell.world!.st.karts.length);
  expect(field).toBe(1);
  await expect(page.locator('[data-act="mode-again"]')).toBeVisible({ timeout: 200_000 });
  await expect(page.locator('.fm-m-res')).toContainText('record');
  await page.screenshot({ path: 'e2e/screens/modes-tt-results.png' });
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__fmModes!.save.tt['kitchen:0']?.ghost), { timeout: 10_000 }).toBe(true);
  await page.locator('[data-act="mode-again"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fmModes!.ttGhost.label), { timeout: 20_000 }).toBe('Your best');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fmModes!.ttGhost.live)).toBe(true);
  expect(errors).toEqual([]);
});

test('balloon battle ends with a winner within 3 minutes of sim time', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await returning(page);
  await page.goto('/?bot=1&speed=8');
  await toMenu(page);
  await page.locator('[data-tile="battle"]').click();
  await page.locator('[data-act="ready"]').click();
  await page.locator('[data-screen="battle"] [data-act="start"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fm?.shell.world?.cfg.mode ?? null), { timeout: 20_000 }).toBe('battle');
  await expect(page.locator('.fm-mode-hud.on .fm-mh-list .r')).toHaveCount(8, { timeout: 20_000 });
  await page.screenshot({ path: 'e2e/screens/modes-battle.png' });
  await expect(page.locator('[data-act="mode-again"]')).toBeVisible({ timeout: 300_000 });
  const end = await page.evaluate(() => {
    const w = (window as unknown as Win).__fm!.shell.world!;
    const win = w.st.karts[w.st.order[0]];
    return { done: w.done, secs: (w.st.tick - w.ctx.goTick) / 60, winnerOut: win.out, winnerBalloons: win.balloons };
  });
  expect(end.done).toBe(true);
  expect(end.secs).toBeLessThanOrEqual(180.05);
  expect(end.winnerOut).toBe(0);
  expect(end.winnerBalloons).toBeGreaterThan(0);
  await expect(page.locator('.fm-m-res')).toContainText('battle');
  expect(errors).toEqual([]);
});

test('every menu screen opens by touch and goes back', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await returning(page);
  await page.goto('/?bot=1');
  await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 20_000 });
  await page.touchscreen.tap(195, 420);
  await expect(page.locator('[data-screen="menu"]')).toBeVisible();
  const expectTop: Record<string, string> = { gp: 'select', race: 'select', tt: 'select', battle: 'select', doodle: 'tracks', garage: 'garage', pinkpaw: 'pinkpaw', settings: 'settings', howto: 'howto', achievements: 'achievements', stats: 'stats' };
  for (const [tile, screen] of Object.entries(expectTop)) {
    await page.locator(`[data-tile="${tile}"]`).tap();
    await expect.poll(() => topId(page), { timeout: 10_000 }).toBe(screen);
    if (tile === 'pinkpaw') await expect(top(page)).toContainText('2026-10-04');
    await page.keyboard.press('Escape');
    await expect.poll(() => topId(page), { timeout: 10_000 }).toBe('menu');
  }
  // the racer → class → cup chain, by touch, and back out with the back buttons
  await page.locator('[data-tile="gp"]').tap();
  await page.locator('[data-act="ready"]').tap();
  await expect.poll(() => topId(page)).toBe('class');
  await page.locator('[data-act="class-0"]').tap();
  await expect.poll(() => topId(page)).toBe('cup');
  await page.screenshot({ path: 'e2e/screens/modes-cup-phone.png' });
  for (const id of ['class', 'select', 'menu']) {
    await top(page).locator('[data-act="back"]').tap();
    await expect.poll(() => topId(page)).toBe(id);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});

test('keyboard and gamepad move a visible focus through the menus', async ({ page }) => {
  test.setTimeout(240_000);
  await returning(page);
  await page.addInitScript(() => {
    const pad = { id: 'fake pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
    (window as unknown as Win).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
  });
  await page.goto('/?bot=1');
  await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-screen="menu"]')).toBeVisible();
  // keyboard: the arrows move a ring between the tiles, Enter opens, Esc comes back
  const focused = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.tile ?? null);
  await expect.poll(focused).toBe('gp');
  await page.keyboard.press('ArrowRight');
  await expect.poll(focused).toBe('race');
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(ring).not.toBe('none');
  await page.keyboard.press('ArrowDown');
  await expect.poll(focused).not.toBe('race');
  await page.keyboard.press('ArrowUp');
  await expect.poll(focused).toBe('race');
  await page.keyboard.press('Enter');
  await expect.poll(() => topId(page)).toBe('select');
  await page.keyboard.press('Escape');
  await expect.poll(() => topId(page)).toBe('menu');
  // gamepad: D-pad moves, A opens, B backs
  const press = async (b: number) => {
    await page.evaluate((i) => ((window as unknown as Win).__pad!.buttons[i] = { pressed: true, value: 1 }), b);
    await page.waitForTimeout(400);
    await page.evaluate((i) => ((window as unknown as Win).__pad!.buttons[i] = { pressed: false, value: 0 }), b);
    await page.waitForTimeout(400);
  };
  // the menu gives the focus back to the tile that opened the screen
  await expect.poll(focused).toBe('race');
  await page.locator('[data-tile="gp"]').focus();
  await expect.poll(focused).toBe('gp');
  await press(15); // D-pad right
  await expect.poll(focused).toBe('race');
  await page.screenshot({ path: 'e2e/screens/modes-pad-focus.png' });
  await press(0); // A
  await expect.poll(() => topId(page)).toBe('select');
  await press(1); // B
  await expect.poll(() => topId(page)).toBe('menu');
});

test('the first visit races at once (FTUE) and its results lead to the menu; deep links skip the title', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.goto('/?bot=1&speed=8');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fm?.shell.world?.st.phase ?? null), { timeout: 20_000 }).toBe('race');
  await expect(page.locator('[data-screen="title"]')).toHaveCount(0);
  await expect(page.locator('[data-act="menu"]')).toBeVisible({ timeout: 200_000 });
  await page.locator('.fm-overlay [data-act="menu"]').click();
  await expect(page.locator('[data-screen="menu"]')).toBeVisible();
  // a deep link with a save still goes straight to the grid
  await page.goto('/?seed=3');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__fm?.shell.world && !(window as unknown as Win).__fm?.shell.attract), { timeout: 20_000 }).toBe(true);
  await expect(page.locator('[data-screen="title"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('quitting a Grand Prix race asks first, and the cup resumes from the menu', async ({ page }) => {
  test.setTimeout(300_000);
  await returning(page);
  await page.goto('/?bot=1&speed=2');
  await toMenu(page);
  await page.locator('[data-tile="gp"]').click();
  await page.locator('[data-act="ready"]').click();
  await page.locator('[data-act="class-0"]').click();
  await page.locator('[data-act="cup-kibble"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fm?.shell.world?.st.phase ?? null), { timeout: 20_000 }).toBe('race');
  await page.locator('.fm-menu-btn').click();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  await page.locator('[data-screen="pause"] [data-act="menu"]').click();
  await expect(page.locator('.fm-ui-modal')).toContainText('Quit the cup?');
  await page.locator('.fm-ui-modal button').nth(1).click(); // keep racing
  await expect(page.locator('.fm-ui-modal')).toHaveCount(0);
  await page.locator('[data-screen="pause"] [data-act="menu"]').click();
  await page.locator('.fm-ui-modal button').first().click(); // quit
  await expect(page.locator('[data-screen="menu"]')).toBeVisible();
  await expect(page.locator('[data-act="resume"]')).toContainText('Kibble Cup');
  await page.locator('[data-act="resume"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fm?.shell.world?.cfg.mode ?? null), { timeout: 20_000 }).toBe('gp');
});
