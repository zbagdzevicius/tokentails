import { expect, test, type Frame, type Page } from '@playwright/test';
import { attr, playFromHome, toChampSelect } from './helpers';
import { mockHost, openHost } from './host';

// Playtest round 1 regressions: on a landscape phone the pick screen's Play button sat under the lobby canvas (the
// scrolling column's fade mask clipped it), and on results the "X marched with you" card covered Play again.

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'clem' };

/** Is the element matched by `sel` the topmost thing at its own centre (nothing covers it)? */
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

test('Heroes → Sir Brutus → LOCK IN starts the match (LOCK IN is never covered)', async ({ page }, info) => {
  await page.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), VETERAN);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await toChampSelect(page);
  await page.waitForSelector('html[data-screen="pick"]');
  // sim v14: Sir Brutus is behind the Dogs tab
  await page.locator('.side-tab.dog').click();
  await page.locator('[data-h="brutus"]').click();
  await expect(page.locator('.cs-fc [data-a="start"]')).toBeVisible();
  expect(await topmost(page, '.cs-fc [data-a="start"]')).toBe(true);
  // the Paw Trick row fits above the fold at 844×390; sim v10 (GAPS B5): the 4th trick, Purr-ify, too, marked for
  // Sir Brutus with the Tank hint (sim v14: a dog's Purr-ify is called Shake Off)
  await expect(page.locator('.pl-pick .trick-hint')).toContainText('Shake Off');
  await expect(page.locator('[data-t="purrify"]')).toHaveAttribute('data-rec', '1');
  await expect(page.locator('[data-t="purrify"]')).toContainText('Shake Off');
  const trick = await page.locator('[data-t="purrify"]').boundingBox();
  expect(trick && trick.y + trick.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 720) + 1);
  if (info.project.name === 'landscape') await page.locator('.cs-fc [data-a="start"]').tap();
  else await page.locator('.cs-fc [data-a="start"]').click();
  await page.waitForSelector('html[data-screen="match"]');
  await expect.poll(() => attr(page, 'screen')).toBe('match');
});

test('the pick screen shows ability numbers on request and the bots chip says what it means', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  await page.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), VETERAN);
  await page.goto('/?e2e=1');
  await toChampSelect(page);
  await page.locator('.cs-sk[data-slot="q"]').click();
  await expect(page.locator('.cs-meta')).not.toContainText(/Cooldown/);
  await page.locator('[data-cs="numbers"]').click();
  await expect(page.locator('.cs-meta')).toContainText(/Cooldown \d/);
  await page.locator('[data-d="hard"]').click();
  // the hint is visible text, not a hover title: under the bots on a desktop, over LOCK IN for a few seconds on a phone
  await expect(page.locator('.bots-hint:visible')).toContainText(/five Hard bots/);
  await expect(page.locator('.cs-lock')).toContainText('vs Hard bots');
});

test('results: Play again is the topmost element at its centre, also with a squad cat card', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'the mock host flow runs on desktop');
  test.setTimeout(150_000);
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    roster: [{ id: 's1', name: 'Scout', type: 'WIND', tier: 'COMMON', isStarter: true, starterBreed: 'SCOUT', origin: 'starter' }],
    profile: VETERAN,
    query: '&speed=64',
  });
  const game = await openHost(page);
  await playFromHome(game);
  await game.waitForSelector('html[data-screen="results"]', { timeout: 130_000 });
  await game.waitForSelector('.pl-results.actions-in', { timeout: 15_000 });
  await expect(game.locator('.plc-dock .plc-with')).toBeVisible();
  expect(await topmost(game, '[data-a="again"]')).toBe(true);
  // one takedown definition: the card reads K / D / A
  await expect(game.locator('.pl-results .stats [data-kda]')).toContainText(/\d+ \/ \d+ \/ \d+/);
});
