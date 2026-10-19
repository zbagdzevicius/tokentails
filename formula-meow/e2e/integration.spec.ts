import { expect, test, type Page } from '@playwright/test';

/**
 * Iteration 2 integration: the lanes wired together. Title → menu → Single race (racer select, class and track) →
 * race → results with the fish → menu; the racer select and the Garage edit one loadout; a battle shows the race
 * HUD's clock and balloons; locks come from the progression rules. `?bot=1&speed=` drives every race.
 */

type Win = {
  __fm?: {
    shell: {
      world: { done: boolean; cfg: { mode?: string; track: { id: string }; cls: number; humans: number[]; racers: Array<{ kart: { body: number; paint: number[] } }> }; st: { phase: string } } | null;
      attract: boolean;
    };
  };
  __fmProg?: { prog(): { fish: number; equip: { paint: number; body: number; hat: number }; stats: { races: number } } };
};

/** A returning player (a plain visit opens on the title): 4 races done, 100cc open. */
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

const topId = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.fm-screen:not([hidden])')].pop()?.dataset.screen ?? null);
const prog = (page: Page) => page.evaluate(() => (window as unknown as Win).__fmProg!.prog());

async function toMenu(page: Page): Promise<void> {
  await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-act="start"]').click();
  await expect(page.locator('[data-screen="menu"]')).toBeVisible();
}

test('title → menu → Single race → racer → track → race → results with fish → menu', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  await returning(page);
  await page.goto('/?bot=1&speed=8');
  await toMenu(page);
  // every mode the main menu promises is a tile
  for (const tile of ['gp', 'race', 'tt', 'battle', 'daily', 'doodle', 'garage']) await expect(page.locator(`[data-tile="${tile}"]`)).toBeVisible();
  const fishBefore = (await prog(page)).fish;
  await page.locator('[data-tile="race"]').click();
  await expect.poll(() => topId(page)).toBe('select');
  // the racer select writes the Garage's loadout: paint 3 here is paint 3 there
  await page.locator('[data-screen="select"] [role="tab"]').nth(2).click();
  await page.locator('[data-screen="select"] .fm-m-paints button').nth(3).click();
  await expect.poll(async () => (await prog(page)).equip.paint).toBe(3);
  await page.locator('[data-act="ready"]').click();
  await expect.poll(() => topId(page)).toBe('race');
  await expect(page.locator('[data-act="track-laundry"]')).toBeVisible();
  await page.locator('[data-act="track-laundry"]').click();
  await page.locator('[data-act="class-1"]').click();
  await page.screenshot({ path: 'e2e/screens/integration-race-pick.png' });
  await page.locator('[data-screen="race"] [data-act="start"]').click();
  await expect.poll(() => page.evaluate(() => {
    const w = (window as unknown as Win).__fm?.shell.world;
    return w && !(window as unknown as Win).__fm!.shell.attract ? `${w.cfg.mode}:${w.cfg.track.id}:${w.cfg.cls}` : null;
  }), { timeout: 20_000 }).toBe('race:laundry:1');
  // the loadout reached the grid
  const paint = await page.evaluate(() => {
    const w = (window as unknown as Win).__fm!.shell.world!;
    return w.cfg.racers[w.cfg.humans[0]].kart.paint[0];
  });
  expect(paint).toBe(0x3bb273); // PAINT_PRESETS[3] (Mint)
  // results: Again / Next / Menu and the fish the race paid
  await expect(page.locator('[data-act="again"]')).toBeVisible({ timeout: 250_000 });
  await expect(page.locator('[data-act="next"]')).toBeVisible();
  await expect(page.locator('.fm-prog-fish')).toBeVisible();
  await expect.poll(async () => (await prog(page)).fish).toBeGreaterThan(fishBefore);
  await page.screenshot({ path: 'e2e/screens/integration-race-results.png' });
  await page.locator('.fm-overlay [data-act="menu"]').click();
  await expect(page.locator('[data-screen="menu"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__fm?.shell.attract), { timeout: 20_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('the Garage and the racer select share one loadout; locked bodies say how to unlock them', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await returning(page);
  await page.goto('/?bot=1');
  await toMenu(page);
  await page.locator('[data-tile="garage"]').click();
  await expect.poll(() => topId(page)).toBe('garage');
  await page.keyboard.press('Escape');
  await expect.poll(() => topId(page)).toBe('menu');
  await page.locator('[data-tile="gp"]').click();
  await page.locator('[data-screen="select"] [role="tab"]').nth(1).click();
  // body 5 (Teacup) costs fish: locked, with the Garage hint
  const teacup = page.locator('[data-act="body-5"]');
  await expect(teacup).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-screen="select"]')).toContainText('fish in the Garage');
  await page.locator('[data-act="body-2"]').click();
  await expect.poll(async () => (await prog(page)).equip.body).toBe(2);
  expect(errors).toEqual([]);
});

test('battle: the race HUD shows the round clock and your balloons; every cat is listed', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  await returning(page);
  await page.goto('/?bot=1&speed=8');
  await toMenu(page);
  await page.locator('[data-tile="battle"]').click();
  await page.locator('[data-act="ready"]').click();
  await page.locator('[data-screen="battle"] [data-act="start"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fm?.shell.world?.cfg.mode ?? null), { timeout: 20_000 }).toBe('battle');
  await expect(page.locator('.fm-hud .fm-lap')).toContainText('⏱', { timeout: 20_000 });
  await expect(page.locator('.fm-hud .fm-balloons.on')).toContainText('🎈');
  await expect(page.locator('.fm-mode-hud.on .fm-mh-list .r')).toHaveCount(8);
  // the mode HUD no longer draws a second clock or rival chip
  await expect(page.locator('.fm-mh-clock')).toBeHidden();
  await page.screenshot({ path: 'e2e/screens/integration-battle-hud.png' });
  await expect(page.locator('[data-act="mode-again"]')).toBeVisible({ timeout: 300_000 });
  expect(errors).toEqual([]);
});
