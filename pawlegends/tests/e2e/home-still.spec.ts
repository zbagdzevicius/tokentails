import { expect, test, type Page } from '@playwright/test';

// The Home re-render fix (Nov 12): opening and closing a panel over Home, or switching the Treat Track | Legends Pass
// tabs, rebuilt Home under it, so every entrance animation (the bars dropping in, the left stack and promo sliding, PLAY
// popping in) replayed behind the panel. Home now stays the same node and still while the panels come and go; data the
// panel changed (here the Sound switch) is patched into it. The entrance still plays on the first Home of the visit.

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };
const ENTRANCE = ['hm-drop', 'hm-slide-l', 'hm-slide-r', 'hm-rise', 'hm-rise-c', 'hm-pop-in'];

type Probe = { starts: number; churn: number; same: boolean };

async function seed(page: Page): Promise<void> {
  await page.addInitScript(
    ([v, names]) => {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
      const entr = new Set(names);
      const w = window as unknown as { __entr: number };
      w.__entr = 0;
      document.addEventListener(
        'animationstart',
        (e) => {
          const t = e.target as Element | null;
          if (t?.closest?.('.pl-home') && entr.has(e.animationName)) w.__entr++;
        },
        true,
      );
    },
    [JSON.stringify(PLAYED), ENTRANCE] as const,
  );
}

/** Waits out the entrance animations; the looping ones keep running. */
const settle = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'), null, { timeout: 30_000 });

/** Remember this Home node and watch its direct children (a rebuilt region or Home shows up as churn). */
const watch = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const w = window as unknown as { __home: Element | null; __churn: number; __mo?: MutationObserver; __entr: number };
    w.__home = document.querySelector('.pl-home');
    w.__churn = 0;
    w.__entr = 0;
    w.__mo?.disconnect();
    w.__mo = new MutationObserver((ms) => {
      for (const m of ms) for (const n of [...m.addedNodes, ...m.removedNodes]) if (!(n as Element).classList?.contains('ms-overlay')) w.__churn++;
    });
    if (w.__home) w.__mo.observe(w.__home, { childList: true });
  });

const probe = (page: Page): Promise<Probe> =>
  page.evaluate(() => {
    const w = window as unknown as { __home: Element | null; __churn: number; __entr: number };
    return { starts: w.__entr, churn: w.__churn, same: document.querySelector('.pl-home') === w.__home && !!w.__home?.isConnected };
  });

test('Home stays mounted and still while the Treat Track, Legends Pass, Cards and Settings come and go', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await settle(page);
  // the first Home of the visit plays its entrance
  expect(await page.evaluate(() => (window as unknown as { __entr: number }).__entr)).toBeGreaterThan(0);
  await watch(page);
  const still = async (step: string): Promise<void> => {
    // a replayed entrance starts within a frame or two of the redraw
    await page.waitForTimeout(400);
    expect(await probe(page), step).toEqual({ starts: 0, churn: 0, same: true });
  };

  // the Treat Track, its Legends Pass tab and back, then Done
  await page.locator('.hm-nav [data-a="collection"]').click();
  await expect(page.locator('.pl-collection')).toBeVisible();
  await still('treat track open');
  await page.locator('.pl-collection [data-a="pass"]').click();
  await expect(page.locator('[data-a="track"]')).toBeVisible();
  await still('legends pass tab');
  await page.locator('[data-a="track"]').click();
  await expect(page.locator('.pl-collection')).toBeVisible();
  await still('treat track tab');
  await page.locator('.pl-collection [data-a="close"]').click();
  await expect(page.locator('.pl-collection')).toHaveCount(0);
  await still('treat track closed');

  // the profile chip opens it too; Esc closes it
  await page.locator('[data-a="profile"]').click();
  await expect(page.locator('.pl-collection')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pl-collection')).toHaveCount(0);
  await still('treat track via profile, Esc');

  // Cards
  await page.locator('.hm-nav [data-a="cards"]').click();
  await expect(page.locator('.pl-deck')).toBeVisible();
  await still('cards open');
  await page.locator('.dk-close').click();
  await expect(page.locator('.pl-deck')).toHaveCount(0);
  await still('cards closed');

  // Settings: turning Sound off there patches Home's Sound switch, nothing else
  const mute = page.locator('.pl-home [data-a="mute"]');
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.hm-corner [data-a="settings"]').click();
  await expect(page.locator('.pl-settings')).toBeVisible();
  await still('settings open');
  await page.locator('.pl-settings [data-a="sound"]').click();
  await page.locator('.pl-settings [data-a="close"]').click();
  await expect(page.locator('.pl-settings')).toHaveCount(0);
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await still('settings closed');

  // Mode Select (it mounts inside Home; Home behind it stays put)
  await page.locator('[data-testid="home-play"]').click();
  await expect(page.locator('[data-testid="mode-select"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="mode-select"]')).toHaveCount(0);
  await still('mode select');
});
