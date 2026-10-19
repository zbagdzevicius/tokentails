import { expect, test, type Frame, type Page } from '@playwright/test';
import { startFirstMatch } from './helpers';
import { mockHost, openHost } from './host';

// Playtest round 2 regressions: the pick screen's Look row (where owned cats pay off) sat under the footer at
// 1280×720; several centre-screen messages showed on top of each other in fights; the results gave no reason for a
// loss; a returning player waited 10 s for Play again.

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'clem', veteran: true };

async function topmost(where: Page | Frame, sel: string): Promise<boolean> {
  return where.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  }, sel);
}

test('pick at 1280×720: the first chroma chip is visible and on top (the Look row is above the kit)', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'the 1280×720 layout');
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    roster: [
      { id: 'c1', name: 'Blaze', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'pack' },
      { id: 'c2', name: 'Queenie', type: 'FAIRY', tier: 'LEGENDARY', isStarter: false, origin: 'adopted' },
    ],
    profile: VETERAN,
  });
  const game = await openHost(page);
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('html[data-screen="pick"]');
  const chip = game.locator('.pl-pick .chip.chroma[data-chroma]:not([data-chroma=""])').first();
  await expect(chip).toBeVisible();
  const box = await chip.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(720);
  expect(await topmost(game, '.pl-pick .chip.chroma[data-chroma]:not([data-chroma=""])')).toBe(true);
  // the squad chip names the tier positively, never "no frame"
  await expect(game.locator('body')).not.toContainText('no frame');
});

test('in a match at most one centre banner or callout is visible at a time', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  test.setTimeout(90_000);
  await startFirstMatch(page, '&speed=8');
  let most = 0;
  let what = '';
  for (let i = 0; i < 120; i++) {
    const shownNow = await page.evaluate(() => {
      const shown = (el: Element): boolean => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5 && r.width > 0 && r.height > 0;
      };
      return [...document.querySelectorAll('.pl-banner.on, .pl-callout, .pl-alert.on')].filter(shown).map((e) => `${e.className}: ${e.textContent?.slice(0, 40)}`);
    });
    if (shownNow.length > most) {
      most = shownNow.length;
      what = `${shownNow.join(' | ')} (stage ${await page.evaluate(() => document.documentElement.dataset.stage)})`;
    }
    if (await page.evaluate(() => document.documentElement.dataset.screen === 'results')) break;
    await page.waitForTimeout(250);
  }
  expect(most, what).toBeLessThanOrEqual(1);
});

test('results: a returning player gets Play again at once and a line saying what decided the match', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  test.setTimeout(150_000);
  await page.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), VETERAN);
  await page.goto('/?e2e=1&speed=64');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-screen="results"]', { timeout: 130_000 });
  await expect(page.locator('.pl-results [data-cause]')).toContainText(/core|Time ran out/);
  // quick reveal (round 2): Play again within a second of the screen opening, even at 1× it is End + 2.5 s
  await page.waitForSelector('.pl-results.actions-in', { timeout: 3_000 });
  await expect(page.locator('[data-a="change"]')).toContainText('Switch cat');
});

test('short landscape: the hero sits below the middle, with room above it under the top HUD', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'the 844×390 camera');
  await startFirstMatch(page);
  await page.waitForTimeout(1500);
  const [x, y] = (await page.evaluate(() => document.documentElement.dataset.meScreen ?? '')).split(',').map(Number);
  const h = page.viewportSize()?.height ?? 390;
  expect(Number.isFinite(x)).toBe(true);
  info.annotations.push({ type: 'meScreen', description: `${x},${y} of ${h} (${Math.round((100 * y) / h)}%)` });
  console.log(`meScreen ${x},${y} of ${h}: ${Math.round((100 * y) / h)}%`);
  // round 2: it was ~43% (y 168 of 390); the camera now looks north of the hero
  expect(y / h).toBeGreaterThanOrEqual(0.52);
  expect(y / h).toBeLessThanOrEqual(0.63);
});
