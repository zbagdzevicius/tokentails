import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost } from './host';
import { seedSide } from './helpers';

// gaps3 coat-fx: the champion browser's Coats tab (Home → Heroes, and the store's coat detail "Preview effects") plays
// a coat's Ultimate, Recall and Takedown clips in the live preview canvas, the card names the three effects, there is
// no price in it, and the page fits (desktop 1280x720 and a phone held sideways, 844x390). Screenshots for the review
// go to ~/Downloads/paw-legends/gaps3/coat-fx/ when that folder exists (never in CI).
const SHOTS = path.join(os.homedir(), 'Downloads', 'paw-legends', 'gaps3', 'coat-fx');
const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'clem', trick: 'pounce', difficulty: 'easy', veteran: true };
const SEASON = { id: 's1', xp: 0, tier: 0, premium: 'none', skips: 0, claimed: [] as string[], endsAt: '2027-01-05T00:00:00.000Z' };

const tapper = (f: Page | Frame, touch: boolean) => async (sel: string): Promise<void> => {
  const l = f.locator(sel).first();
  if (touch) await l.tap();
  else await l.click();
};

test('Home → Heroes → Coats: every clip plays and the page fits', async ({ page }, info) => {
  test.setTimeout(240_000);
  const touch = info.project.name === 'landscape';
  const tap = tapper(page, touch);
  // a returning dog player: Home's hero is Sir Brutus (Thunderpaw, Legendary) and Heroes is in the nav
  await seedSide(page, 'dog', { sessions: 3, matches: 5, wins: 2, veteran: true });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await tap('.hm-nav [data-a="heroes"]');
  const dlg = page.locator('.pl-champ[data-ready="1"]');
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  // walk to Sir Brutus (Thunderpaw, Legendary) with the arrows
  for (let i = 0; i < 25 && (await dlg.locator('.cb-name').textContent()) !== 'Sir Brutus'; i++) await tap('.cb-next');
  await expect(dlg.locator('.cb-name')).toHaveText('Sir Brutus');
  await tap('.cb-tab[data-tab="coats"]');
  await expect(dlg).toHaveAttribute('data-tab', 'coats');
  await expect(dlg.locator('.cb-coat-chip').first()).toContainText('Thunderpaw');
  await expect(dlg.locator('.cb-card')).toContainText('Three lightning bolts strike the ring');
  await expect(dlg).not.toContainText(/\$|€|Buy/);
  await expect.poll(() => dlg.getAttribute('data-clip'), { timeout: 60_000 }).toBe('playing');
  const vp = page.viewportSize()!;
  const box = (await dlg.locator('.cb-panel').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  const clip = (await dlg.locator('.cb-clip').boundingBox())!;
  expect(clip.height).toBeGreaterThan(touch ? 120 : 200);
  // the chips and the clip buttons share one row on a phone held sideways
  const chipBox = (await dlg.locator('.cb-coat-chip').first().boundingBox())!;
  const cfxBox = (await dlg.locator('.cb-cfx-btn').first().boundingBox())!;
  if (touch) expect(Math.abs(chipBox.y - cfxBox.y)).toBeLessThan(12);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  const shots = fs.existsSync(path.dirname(SHOTS)) && !process.env.CI;
  if (shots) fs.mkdirSync(SHOTS, { recursive: true });
  const shot = async (name: string): Promise<void> => {
    if (shots) await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-brutus-${name}.png`) });
  };
  await page.waitForTimeout(1500);
  await shot('ult');
  for (const k of ['recall', 'takedown'] as const) {
    await tap(`.cb-cfx-btn[data-cfx="${k}"]`);
    await expect(dlg.locator('.cb-cfx-btn.on')).toHaveAttribute('data-cfx', k);
    await expect(dlg.locator('.cb-coat-fx li.on')).toContainText(k === 'recall' ? 'Recall' : 'Takedown');
    await expect.poll(() => dlg.getAttribute('data-clip'), { timeout: 60_000 }).toBe('playing');
    await page.waitForTimeout(k === 'recall' ? 4300 : 1400);
    await shot(k);
  }
  // a Rare coat of the same champion: the shared Rare set
  await tap('.cb-coat-chip[data-rung="RARE"]');
  await expect(dlg.locator('.cb-coat-rung')).toContainText('Rare coat');
  await expect(dlg.locator('.cb-card')).toContainText('A three-motif stamp in the coat pattern');
  // Skills goes back to the kit, and Coats comes back
  await tap('.cb-tab[data-tab="skills"]');
  await expect(dlg).toHaveAttribute('data-tab', 'skills');
  await expect(dlg.locator('.cb-skill-btn')).not.toHaveCount(0);
  await tap('.cb-tab[data-tab="coats"]');
  await expect(dlg).toHaveAttribute('data-tab', 'coats');
});

test('store coat detail → Preview effects opens the Coats tab on that coat', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'the store flow is viewport independent');
  test.setTimeout(180_000);
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: VETERAN, store: { items: [], season: SEASON } });
  const game = await openHost(page);
  const tap = tapper(game, false);
  await tap('.hm-nav [data-a="store"]');
  const shop = game.locator('.pl-shop');
  await expect(shop).toBeVisible();
  await tap('.cst-tabs [data-tab="coats"]');
  await tap('[data-sel="pl_coat_sage_bloomtail"]');
  await expect(shop.locator('.cst-detail')).toContainText('Ultimate: a petal storm');
  await tap('.cst-detail [data-a="coat-fx"]');
  const dlg = game.locator('.pl-champ[data-ready="1"]');
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  await expect(dlg).toHaveAttribute('data-tab', 'coats');
  await expect(dlg.locator('.cb-name')).toHaveText('Sage');
  await expect(dlg.locator('.cb-coat-chip.on')).toContainText('Bloomtail');
  await expect.poll(() => dlg.getAttribute('data-clip'), { timeout: 60_000 }).toBe('playing');
  // the browser's tabs are its own: a tap on Lore does not switch the store's tab under it (both carry data-tab)
  await tap('.cb-tab[data-tab="lore"]');
  await expect(dlg).toHaveAttribute('data-tab', 'lore');
  await expect(shop.locator('.cst-tab.on')).toHaveAttribute('data-tab', 'coats');
  await tap('.cb-x');
  await expect(game.locator('.pl-champ')).toHaveCount(0);
  await expect(shop.locator('.cst-detail')).toBeVisible();
});
