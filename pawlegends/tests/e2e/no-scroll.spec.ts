import { expect, test, type Page } from '@playwright/test';
import { PROFILE_KEY } from './helpers';

// No-scroll Home and champion select (docs/plans/moba/HOME-MODES.md §4, LANDING-PICK-UX.md §B7): at 667x375 and 844x390
// (touch, 2x), 1440x900 and 667x300, for a new, a returning and a dare profile, nothing scrolls on Home, every Home
// control sits inside the viewport at a 44 px touch size, and on the pick screen only the portrait grid may scroll while LOCK IN, the selected tile, the skill row and
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
        await page.waitForSelector('html[data-screen="title"] .pl-home');
        // past Home's entrance animations (the looping ones keep running)
        await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'), null, { timeout: 10_000 });
        expect(await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) <= innerHeight)).toBe(true);
        expect(await page.evaluate(() => (document.scrollingElement?.scrollWidth ?? 0) <= innerWidth)).toBe(true);
        expect(await scrollers(page)).toEqual([]);
        // Home (HOME-MODES.md §4): PLAY, the mode pill, the quick online buttons, the nav, the left stack and the corner:
        // in view and touch sized
        expect(await bad(page, '.hm-play, .hm-pill, .hm-qb, .hm-ni, .hm-left .hm-round, .hm-corner .hm-icon, .hm-profile', 44)).toEqual([]);
        // PLAY is the only pink button: the quick online buttons are butter (Co-op) and glass (PvP)
        const pink = await page.evaluate(() => getComputedStyle(document.querySelector('.hm-play-face')!).backgroundImage);
        for (const bg of await page.locator('.hm-qb').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundImage))) expect(bg).not.toBe(pink);
        if (profile === 'returning') {
          await expect(page.locator('.hm-nav [data-a="choose"]')).toBeInViewport();
          await expect(page.locator('[data-testid="mode-pill"]')).toBeInViewport();
        }
        // a first visit and a dare: Heroes is in the nav but locked (the guided match or the dare is the one call)
        if (profile !== 'returning') {
          await expect(page.locator('.hm-nav [data-a="choose"]')).toHaveCount(0);
          await expect(page.locator('[data-testid="mode-pill"]')).toHaveCount(0);
        }
        // the host's cards slot (the champion's About chip, badges) never covers PLAY or the nav
        await page.evaluate(() => {
          const s = document.querySelector<HTMLElement>('.hm-slot');
          if (s) s.innerHTML = '<div class="plc-champ"><button class="pl-btn ghost small plc-champ-chip">About Bengal</button></div>';
        });
        expect(await page.evaluate(() => {
          const s = document.querySelector<HTMLElement>('.hm-slot');
          if (!s) return true;
          const r = s.getBoundingClientRect();
          if (r.width === 0) return true;
          return ['.hm-play', '.hm-nav'].every((q) => {
            const b = document.querySelector<HTMLElement>(q)!.getBoundingClientRect();
            return r.right <= b.left + 1 || b.right <= r.left + 1 || r.bottom <= b.top + 1 || b.bottom <= r.top + 1;
          });
        })).toBe(true);
        expect(await scrollers(page)).toEqual([]);
      });
    }

    test('champion select: only the grid scrolls; LOCK IN, the selected tile, the skills and the tricks in view', async ({ page }) => {
      test.setTimeout(120_000);
      await page.addInitScript(([k, v]) => {
        if (!localStorage.getItem(k)) localStorage.setItem(k, v);
      }, [PROFILE_KEY, JSON.stringify(RETURNING)] as const);
      await page.goto('/?e2e=1');
      await page.waitForSelector('html[data-screen="title"] .pl-home');
      await page.locator('.hm-nav [data-a="choose"]').click();
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
        expect(await bad(page, '.cs-lock, .cs-trick, .cs-sk, .cs-tile.on', 30)).toEqual([]);
        expect(await bad(page, '.cs-tab, .cs-bots button', size.height <= 320 ? 28 : 36)).toEqual([]);
        await expect(page.locator('.cs-lock')).toBeInViewport();
      }
      // a skill tapped and a role filter selected
      await page.locator('.cs-sk[data-slot="r"]').click();
      await page.locator('[data-cs="role"][data-role="marksman"]').click();
      await expect(page.locator('.cs-sk-name')).toHaveText('Moonshot');
      await expect(page.locator('.cs-grid .cs-tile:not([hidden])')).toHaveCount(4);
      // another hero: its own skill icons (the panel redraw never carries the last hero's icons or Preview over)
      await page.locator('[data-cs="role"][data-role="marksman"]').click();
      await page.locator('[data-cs="side"][data-side="dog"]').click();
      await page.locator('.cs-grid [data-h="nugget"]').click();
      await expect(page.locator('.cs-panel')).toHaveAttribute('data-hero', 'nugget');
      await expect(page.locator('.cs-sk[data-slot="passive"]')).not.toContainText('Preview');
      expect(await page.locator('.cs-sk[data-slot="r"]').getAttribute('aria-label')).toContain('R: ');
      // the name is not cut by Look
      expect(await page.evaluate(() => {
        const n = document.querySelector<HTMLElement>('.cs-name')!;
        return n.scrollWidth <= n.clientWidth + 1;
      })).toBe(true);
    });

    if (size.name === '667x375' || size.name === '844x390')
      test('champion select with notch insets: ten heroes of a side, every tab, no scroll', async ({ page }) => {
        test.setTimeout(120_000);
        await page.addInitScript(([k, v]) => {
          if (!localStorage.getItem(k)) localStorage.setItem(k, v);
        }, [PROFILE_KEY, JSON.stringify(RETURNING)] as const);
        await page.goto('/?e2e=1');
        await page.waitForSelector('html[data-screen="title"] .pl-home');
        // an iPhone in landscape: 47 px on both sides, 21 px at the bottom (env() is 0 here, so the variables are set)
        await page.evaluate(() => {
          const r = document.documentElement.style;
          r.setProperty('--safe-l', '47px');
          r.setProperty('--safe-r', '47px');
          r.setProperty('--safe-b', '21px');
        });
        await page.locator('.hm-nav [data-a="choose"]').click();
        await page.waitForSelector('html[data-screen="pick"] .cs');
        await page.locator('[data-cs="side"][data-side="cat"]').click();
        expect(await page.evaluate(() => {
          const g = document.querySelector<HTMLElement>('.cs-grid')!;
          return g.scrollHeight <= g.clientHeight + 1;
        })).toBe(true);
        await expect(page.locator('.cs-more')).toBeHidden();
        // every tab inside the centre column (none under the hero panel)
        expect(await page.evaluate(() => {
          const mid = document.querySelector<HTMLElement>('.cs-mid')!.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLElement>('.cs-tab')].filter((t) => {
            const r = t.getBoundingClientRect();
            return r.left < mid.left - 1 || r.right > mid.right + 1;
          }).length;
        })).toBe(0);
        for (const sel of ['.cs', '.cs-team', '.cs-panel'])
          expect(await page.evaluate((s) => {
            const e = document.querySelector<HTMLElement>(s)!;
            return e.scrollHeight <= e.clientHeight + 1;
          }, sel), sel).toBe(true);
      });
  });
}
