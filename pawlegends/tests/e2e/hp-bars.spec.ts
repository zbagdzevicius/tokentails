import { expect, test, type Page } from '@playwright/test';
import { playFromHome, seedSide, toChampSelect } from './helpers';

// Health bars in a running match (Nov 12 regression). The overhead plates draw with the live WebGLRenderer
// (render/renderer.ts liveRenderer). The champion browser's skill clip made its own renderer, took that slot and
// cleared it on close, so every match after a Heroes / Preview visit drew no bar over any hero, minion or tower. And
// sim v22's standard Hearthwood threw while building its scenery (an empty merge), so Classic 5v5 never started.

type Stats = { quads: number; draws: number };
const stats = (page: Page): Promise<Stats | null> =>
  page.evaluate(() => {
    const w = (window as unknown as { __plWorld?: { overhead: { stats: Stats } } }).__plWorld;
    return w ? { quads: w.overhead.stats.quads, draws: w.overhead.stats.draws } : null;
  });

/** The plates draw every frame: quads this frame and the overlay's draw count keeps growing. */
async function barsDraw(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 60_000 });
  await expect.poll(async () => (await stats(page))?.quads ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
  // a 5v5 frame on SwiftShader can take a while: the count only has to keep moving
  const a = (await stats(page))!.draws;
  await expect.poll(async () => (await stats(page))?.draws ?? 0, { timeout: 30_000 }).toBeGreaterThan(a + 5);
  expect((await stats(page))!.quads).toBeGreaterThan(0);
}

const press = async (page: Page, sel: string, touch: boolean): Promise<void> => {
  if (touch) await page.locator(sel).first().tap();
  else await page.locator(sel).first().click();
};

test('health bars draw in a match after a skill clip in the champion browser', async ({ page }, info) => {
  test.setTimeout(240_000);
  const touch = info.project.name === 'landscape';
  await seedSide(page, 'cat');
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await toChampSelect(page);
  await page.waitForSelector('html[data-screen="pick"]');
  await press(page, '.cs-tile[data-h="sage"]', touch);
  await press(page, '.cs-sk[data-slot="q"]', touch);
  await press(page, '.cs-panel [data-a="codex"]', touch);
  const dlg = page.locator('.pl-champ[data-ready="1"]');
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => dlg.getAttribute('data-clip'), { timeout: 60_000 }).toMatch(/playing|loading/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pl-champ')).toHaveCount(0);
  await press(page, '[data-a="start"]', touch);
  await page.waitForSelector('html[data-match="live"]', { timeout: 90_000 });
  await barsDraw(page);
});

test('Home → PLAY → Classic → vs Bots → LOCK IN reaches a live 5v5 match with health bars', async ({ page }) => {
  // a 5v5 Hearthwood match loads on SwiftShader here
  test.setTimeout(180_000);
  await seedSide(page, 'cat', { matches: 6, sessions: 3, hero: 'sage' });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  // the one play path: PLAY → Classic → vs Bots → champion select → LOCK IN
  await playFromHome(page, { mode: 'classic', timeout: 60_000 });
  await page.waitForSelector('html[data-match="live"]', { timeout: 120_000 });
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'match');
  // ten heroes: a 5v5 match
  await expect.poll(async () => (await page.evaluate(() => document.documentElement.dataset.plateNames ?? '')).split('|').filter(Boolean).length).toBe(10);
  await barsDraw(page);
});
