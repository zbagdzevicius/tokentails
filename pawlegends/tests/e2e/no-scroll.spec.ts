import { expect, test, type Page } from '@playwright/test';
import { PROFILE_KEY } from './helpers';

// No-scroll landing and champion select (docs/plans/moba/LANDING-PICK-UX.md §0, §A5, §B7): at 667x375 and 844x390
// (touch, 2x), 1440x900 and 667x300, for a new, a returning and a dare profile, nothing scrolls on the landing (the
// document, the column, nothing), every tier 1, tier 2 and rail control sits inside the viewport at a 44 px touch
// size, and on the pick screen only the portrait grid may scroll while LOCK IN, the selected tile, the skill row and
// the trick row stay in view. The online buttons come from a mocked relay answering PvP-capable, as in production.

const RETURNING = { v: 1, sessions: 3, matches: 8, wins: 4, firstWinDone: true, hero: 'sage', side: 'cat', veteran: true, firstPlaySession: 1 };
const SIZES = [
  { name: '667x375', width: 667, height: 375, touch: true },
  { name: '844x390', width: 844, height: 390, touch: true },
  { name: '1440x900', width: 1440, height: 900, touch: false },
  { name: '667x300', width: 667, height: 300, touch: true },
];

/** Every element under the screens that scrolls (content taller than its box with an auto/scroll overflow). */
async function scrollers(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.pl-screen, .pl-screen *')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      })
      .map((el) => (typeof el.className === 'string' ? el.className : el.tagName)),
  );
}

/** Boxes of the visible matches of `sel` that leave the viewport, or are smaller than `min` px on either side. */
async function bad(page: Page, sel: string, min: number): Promise<string[]> {
  return page.evaluate(
    ([s, m]) =>
      [...document.querySelectorAll<HTMLElement>(s as string)]
        .filter((e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden')
        .flatMap((e) => {
          const r = e.getBoundingClientRect();
          const out = r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
          const small = r.width + 0.5 < (m as number) || r.height + 0.5 < (m as number);
          return out || small ? [`${e.getAttribute('aria-label') ?? e.textContent?.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`] : [];
        }),
    [sel, min] as const,
  );
}

for (const size of SIZES) {
  test.describe(`no scroll at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: size.touch ? 2 : 1 });
    test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'the sizes are set per test'));

    for (const profile of ['new', 'returning', 'dare'] as const) {
      test(`landing, ${profile}`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.route('**/pawlegends/sim', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ simVersions: [18], pvpSince: 16 }) }));
        if (profile !== 'new')
          await page.addInitScript(([k, v]) => {
            if (!localStorage.getItem(k)) localStorage.setItem(k, v);
          }, [PROFILE_KEY, JSON.stringify(RETURNING)] as const);
        const q = profile === 'dare' ? '&dare=7.1.0.0.8c' : '';
        await page.goto(`/?e2e=1${q}`);
        await page.waitForSelector('html[data-screen="title"] .pl-lobby');
        await page.waitForTimeout(600);
        expect(await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) <= innerHeight)).toBe(true);
        expect(await page.evaluate(() => (document.scrollingElement?.scrollWidth ?? 0) <= innerWidth)).toBe(true);
        expect(await scrollers(page)).toEqual([]);
        // the column's content fits its box (nothing clipped below the fold)
        expect(await page.evaluate(() => {
          const c = document.querySelector<HTMLElement>('.lb-col')!;
          return c.scrollHeight <= c.clientHeight + 1;
        })).toBe(true);
        // tier 1 (Play), tier 2 (the online row) and the rail: in view and touch sized (the bots radio: 28 px pills in a
        // 34 px segment, each with a 40 px tall hit area)
        expect(await bad(page, '.lb-play .pl-btn.big, .lb-online-row .pl-btn, .lb-rail .lb-ri, .lb-corner .lb-icon', 40)).toEqual([]);
        expect(await bad(page, '.lb-seg button', 26)).toEqual([]);
        if (profile === 'returning') await expect(page.locator('.lb-rail [data-a="choose"]')).toBeInViewport();
        if (profile === 'new') await expect(page.locator('.lb-rail')).toHaveCount(0);
      });
    }

    test('champion select: only the grid scrolls; LOCK IN, the selected tile, the skills and the tricks in view', async ({ page }) => {
      test.setTimeout(120_000);
      await page.addInitScript(([k, v]) => {
        if (!localStorage.getItem(k)) localStorage.setItem(k, v);
      }, [PROFILE_KEY, JSON.stringify(RETURNING)] as const);
      await page.goto('/?e2e=1');
      await page.waitForSelector('html[data-screen="title"] .pl-lobby');
      await page.locator('.lb-rail [data-a="choose"]').click();
      await page.waitForSelector('html[data-screen="pick"] .cs');
      for (const tab of ['cat', 'all'] as const) {
        await page.locator(`[data-cs="side"][data-side="${tab}"]`).click();
        expect(await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) <= innerHeight)).toBe(true);
        expect((await scrollers(page)).filter((c) => !c.includes('cs-grid'))).toEqual([]);
        for (const sel of ['.cs', '.cs-team', '.cs-panel'])
          expect(await page.evaluate((s) => {
            const e = document.querySelector<HTMLElement>(s)!;
            return e.scrollHeight <= e.clientHeight + 1;
          }, sel), sel).toBe(true);
        expect(await bad(page, '.cs-lock, .cs-trick, .cs-sk, .cs-tile.on', 28)).toEqual([]);
        await expect(page.locator('.cs-lock')).toBeInViewport();
      }
      // a skill tapped and a role filter selected
      await page.locator('.cs-sk[data-slot="r"]').click();
      await page.locator('[data-cs="role"][data-role="marksman"]').click();
      await expect(page.locator('.cs-sk-name')).toHaveText('Moonshot');
      await expect(page.locator('.cs-grid .cs-tile:not([hidden])')).toHaveCount(4);
    });
  });
}
