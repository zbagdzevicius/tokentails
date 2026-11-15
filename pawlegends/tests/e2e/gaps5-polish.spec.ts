import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { seedSide } from './helpers';

// gaps5 polish: a lazy chunk that fails once is retried (no crash card), and Clem's coat chips never run under the
// Ultimate / Recall / Takedown tabs. Desktop 1280x720 and a phone held sideways (844x390). Screenshots to
// ~/Downloads/paw-legends/gaps5/polish/ when ~/Downloads/paw-legends exists (never in CI).
const ROOT = path.join(os.homedir(), 'Downloads', 'paw-legends');
const SHOTS = path.join(ROOT, 'gaps5', 'polish');
const shots = fs.existsSync(ROOT) && !process.env.CI;
if (shots) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string, project: string): Promise<void> => {
  if (shots) await page.screenshot({ path: path.join(SHOTS, `${name}-${project}.png`) });
};

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only');
});

const tapper = (page: Page, touch: boolean) => async (sel: string): Promise<void> => {
  const l = page.locator(sel).first();
  if (touch) await l.tap();
  else await l.click();
};

test('a lazy chunk that fails once loads on the retry: Heroes opens, no crash card', async ({ page }, info) => {
  const touch = info.project.name === 'landscape';
  const tap = tapper(page, touch);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedSide(page, 'cat', { sessions: 3, matches: 5, wins: 2, veteran: true });
  // the champion browser chunk fails its first request (a deploy swapping files), then serves normally
  let failed = 0;
  await page.route(/\/build\/champBrowser-[^/]+\.js(\?.*)?$/, async (route) => {
    if (failed++ === 0) return route.abort('connectionreset');
    return route.continue();
  });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await tap('.hm-nav [data-a="heroes"]');
  await expect(page.locator('.pl-champ[data-ready="1"]')).toBeVisible({ timeout: 30_000 });
  expect(failed).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#crash')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Clem's five coat chips stay clear of the effect tabs", async ({ page }, info) => {
  test.setTimeout(120_000);
  const touch = info.project.name === 'landscape';
  const tap = tapper(page, touch);
  await seedSide(page, 'cat', { sessions: 3, matches: 5, wins: 2, veteran: true });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await tap('.hm-nav [data-a="heroes"]');
  const dlg = page.locator('.pl-champ[data-ready="1"]');
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 25 && (await dlg.locator('.cb-name').textContent()) !== 'Clem'; i++) await tap('.cb-next');
  await expect(dlg.locator('.cb-name')).toHaveText('Clem');
  await tap('.cb-tab[data-tab="coats"]');
  await expect(dlg).toHaveAttribute('data-tab', 'coats');
  const chips = dlg.locator('.cb-coat-chip');
  expect(await chips.count()).toBeGreaterThanOrEqual(5);
  await page.waitForTimeout(400);
  await shot(page, 'clem-coats', info.project.name);
  // the chip row ends before the first effect tab, or sits on its own row above them
  const row = (await dlg.locator('.cb-coat-chips').boundingBox())!;
  const tabs = (await dlg.locator('.cb-cfx').boundingBox())!;
  const apart = row.x + row.width <= tabs.x + 1 || row.y + row.height <= tabs.y + 1;
  expect(apart).toBe(true);
  // every chip can be reached: the last one scrolls fully into the row and is clickable
  const last = chips.last();
  await last.scrollIntoViewIfNeeded();
  const lb = (await last.boundingBox())!;
  expect(lb.x + lb.width).toBeLessThanOrEqual(row.x + row.width + 1);
  await tap('.cb-coat-chip >> nth=-1');
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  // the panel still fits the screen
  const vp = page.viewportSize()!;
  const panel = (await dlg.locator('.cb-panel').boundingBox())!;
  expect(panel.y + panel.height).toBeLessThanOrEqual(vp.height + 1);
  const clip = (await dlg.locator('.cb-clip').boundingBox())!;
  expect(clip.height).toBeGreaterThan(touch ? 100 : 200);
  await shot(page, 'clem-coats-last', info.project.name);
});
