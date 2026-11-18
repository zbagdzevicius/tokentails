import { expect, test, type Frame, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALL_CHAMPS, mockHost, openHost, received } from './host';
import { limit } from '../unit/cpu-budget';

// The champion screen (founder Nov 18: "this screen is broken in-app on mobile ... more aligned with other immersive
// screens"). It was a boxed two-column modal sized for desktop: on a phone held sideways its splash took a fixed 2:3
// column, the kit and the buttons sat in a nested scroller under the fold and the close button scrolled away with
// them. Now it is full screen like Home: Back, the five ability chips and the bottom bar (Unlock, Buy) are always on
// screen at every size, with notch insets, and only the info column scrolls (never sideways).

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', side: 'cat', firstPlaySession: 1 };
const LOCKED_PIXEL = { ...ALL_CHAMPS, owned: ALL_CHAMPS.owned.filter((o) => o.hero !== 'pixel'), founders: false, yarn: { balance: 922, matches: 20, picksLeft: 0, nextPickAt: null } };
const SIZES: { w: number; h: number; notch: boolean }[] = [
  { w: 844, h: 390, notch: true },
  { w: 667, h: 375, notch: true },
  { w: 915, h: 412, notch: false },
  { w: 390, h: 844, notch: false },
  { w: 1440, h: 900, notch: false },
];

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'the spec sets each viewport itself'));

async function notch(game: Frame, on: boolean): Promise<void> {
  await game.evaluate((n) => {
    const r = document.documentElement.style;
    for (const [k, v] of [['--safe-l', '47px'], ['--safe-r', '47px'], ['--safe-b', '21px']]) n ? r.setProperty(k, v) : r.removeProperty(k);
  }, on);
}

/** Everything that must show: Back, every ability chip, the bar and its buttons, inside the screen and on top. */
async function check(game: Frame) {
  return game.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const se = document.scrollingElement!;
    const need = [...document.querySelectorAll<HTMLElement>('.cst-hd [data-a="detail-close"], .cst-hd .cst-skill, .cst-hd-bar, .cst-hd-bar button, .cst-hd .cst-wallet')];
    const bad = need
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) return true;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !hit || !(hit === e || e.contains(hit));
      })
      .map((e) => `${e.className} ${e.dataset.a ?? e.dataset.skill ?? ''}`);
    const small = [...document.querySelectorAll<HTMLElement>('.cst-hd button')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.height < 43.5 || r.width < 43.5);
    }).map((e) => `${e.className} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const info = document.querySelector<HTMLElement>('.cst-hd-info')!;
    // the last thing in the info column can be scrolled to
    info.scrollTop = 99999;
    const last = info.lastElementChild!.getBoundingClientRect();
    const box = info.getBoundingClientRect();
    const reach = last.bottom <= box.bottom + 1;
    info.scrollTop = 0;
    return { page: se.scrollHeight <= se.clientHeight + 1 && se.scrollWidth <= se.clientWidth + 1, side: info.scrollWidth <= info.clientWidth + 1, bad, small, reach };
  });
}

/** Each size is attached to the report; CHAMP_SHOTS=<dir> also saves them there. */
async function shot(page: Page, name: string): Promise<void> {
  const body = await page.screenshot();
  await test.info().attach(name, { body, contentType: 'image/png' });
  if (process.env.CHAMP_SHOTS) {
    mkdirSync(process.env.CHAMP_SHOTS, { recursive: true });
    writeFileSync(`${process.env.CHAMP_SHOTS}/${name.replace(/\s+/g, '-')}.png`, body);
  }
}

for (const app of [false, true])
  test(`${app ? 'app' : 'web'}: the champion screen fits every phone, tablet and desktop size`, async ({ context, page, baseURL }) => {
    test.setTimeout(limit(240_000));
    await mockHost(context, baseURL!, { app: { isApp: app, store: !app }, signedIn: true, profile: PLAYED, champState: LOCKED_PIXEL, store: { items: [], season: null } });
    const game = await openHost(page);
    // portrait shows "Turn your phone sideways" over the game; the screen under it still lays out (tablets, a rotation)
    await game.addStyleTag({ content: '.pl-rotate{display:none!important}' });
    // through Home's champion browser, as in the app: walk to Pixel, then BUY / UNLOCK
    await game.locator('[data-testid="home-plate"]').click();
    const dlg = game.locator('.pl-champ[data-ready="1"]');
    await expect(dlg).toBeVisible({ timeout: limit(30_000) });
    for (let i = 0; i < 29 && (await dlg.getAttribute('data-hero')) !== 'pixel'; i++) await dlg.locator('.cb-next').click();
    await game.locator('.pl-champ [data-testid="hero-action"]').click();
    const hd = game.locator('.pl-shop .cst-hd');
    await expect(hd).toHaveAttribute('data-hero', 'pixel');
    await expect(hd).toHaveAttribute('data-cside', 'cat');
    await expect(hd.locator('[data-testid="store-unlock"]')).toBeDisabled();
    await expect(hd.locator('[data-testid="store-togo"]')).toHaveText(/You have 922 Yarn\. 2,578 more to go/);
    await expect(hd.locator('[data-buy]')).toHaveCount(app ? 0 : 1);
    if (app) await expect(hd).not.toContainText(/\$|€/);
    for (const s of SIZES) {
      await page.setViewportSize({ width: s.w, height: s.h });
      await notch(game, s.notch);
      await page.waitForTimeout(150);
      const r = await check(game);
      const tag = `${s.w}x${s.h}${s.notch ? ' notch' : ''}`;
      expect(r.page, `${tag} no page scroll`).toBe(true);
      expect(r.side, `${tag} no sideways scroll`).toBe(true);
      expect(r.bad, `${tag} off screen or covered`).toEqual([]);
      expect(r.small, `${tag} under 44 px`).toEqual([]);
      expect(r.reach, `${tag} the info column scrolls to its end`).toBe(true);
      await shot(page, `${app ? 'app' : 'web'}-${tag}-pixel`);
    }
    // a chip picks the ability its line describes
    await hd.locator('.cst-skill[data-skill="4"]').click();
    await expect(hd.locator('.cst-skill-line .k')).toHaveText('R');
    // the hardware/keyboard back closes the screen, then the store
    await game.locator('body').press('Escape');
    await expect(hd).toHaveCount(0);
    await game.locator('body').press('Escape');
    await expect(game.locator('.pl-shop')).toHaveCount(0);
    expect((await received(page)).some((m) => m.type === 'champ-unlock')).toBe(false);
  });

test('web: an owned dog sits on the right, the price lines fold out, nothing to buy', async ({ context, page, baseURL }) => {
  test.setTimeout(limit(180_000));
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: PLAYED, champState: LOCKED_PIXEL, store: { items: [], season: null } });
  const game = await openHost(page);
  await game.locator('.hm-nav [data-a="store"]').click();
  const shop = game.locator('.pl-shop');
  await shop.locator('.cst-card[data-hero="domino"]').click();
  const hd = shop.locator('.cst-hd');
  await expect(hd).toHaveAttribute('data-cside', 'dog');
  await expect(hd).toHaveAttribute('data-bar', 'owned');
  await expect(hd.locator('[data-buy], [data-unlock]')).toHaveCount(0);
  for (const [w, h] of [[844, 390], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    const r = await check(game);
    expect(r.bad, `${w}x${h}`).toEqual([]);
    expect(r.page).toBe(true);
    // the art is on the right half
    const art = await hd.locator('.cst-hd-art').boundingBox();
    expect(art!.x).toBeGreaterThan(w * 0.4);
    await shot(page, `web-${w}x${h}-domino-owned`);
  }
  await game.locator('body').press('Escape');
  // Pixel (locked): Prices and terms open the VAT, spend-limit and terms lines in the scrolling column
  await shop.locator('.cst-card[data-hero="pixel"]').click();
  await expect(shop.locator('.cst-finebox')).toHaveCount(0);
  await shop.locator('[data-a="fine"]').click();
  await expect(shop.locator('.cst-finebox')).toContainText('A bought champion plays the same');
  const r = await check(game);
  expect(r.reach).toBe(true);
  expect(r.bad).toEqual([]);
});
