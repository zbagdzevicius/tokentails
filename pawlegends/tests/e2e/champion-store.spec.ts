import { expect, test, type Frame } from '@playwright/test';
import { ALL_CHAMPS, mockHost, openHost, received } from './host';

// CHAMPION-STORE.md: a new guest sees the 6 starters and the week's 6 free champions; every other tile is locked with
// its unlock row and plays as Practice (nothing posted to /live); an existing player with the Founders roster keeps
// every champion; the app build never shows a price.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'pick panels are viewport independent'));

const PLAYED = { v: 1, sessions: 2, matches: 4, wins: 2, firstWinDone: true, hero: 'clem' };
const NEW_GUEST = { ...ALL_CHAMPS, owned: [], founders: false, yarn: { balance: 0, matches: 0, picksLeft: 0, nextPickAt: 5 } };

async function toPick(game: Frame): Promise<void> {
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('.pl-pick .cs');
}

/** The week's rotation as the game computes it (the e2e clock is real time). */
async function freeThisWeek(game: Frame): Promise<string[]> {
  return game.evaluate(() => [...document.querySelectorAll('.cs-tile .champ-free')].map((e) => (e.closest('.cs-tile') as HTMLElement).dataset.h ?? ''));
}

test('a new guest: 12 open tiles (starters and the free 6), the rest locked with Yarn to go and Practice', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: false, profile: PLAYED, champState: NEW_GUEST });
  const game = await openHost(page);
  await toPick(game);
  await expect(game.locator('.cs-grid .cs-tile')).toHaveCount(20);
  await expect(game.locator('.cs-grid .cs-tile:not(.locked)')).toHaveCount(12);
  for (const h of ['clem', 'sage', 'gabe', 'brutus', 'frankie', 'marshmallow']) await expect(game.locator(`.cs-tile[data-h="${h}"]`)).not.toHaveClass(/locked/);
  expect(await freeThisWeek(game)).toHaveLength(6);
  // a locked champion: its skills show, LOCK IN is Practice, the unlock row says how far the Yarn is
  const locked = await game.evaluate(() => (document.querySelector('.cs-grid .cs-tile.locked[data-side="cat"]') as HTMLElement).dataset.h ?? '');
  await game.locator(`.cs-grid [data-h="${locked}"]`).click();
  await expect(game.locator('.cs-panel')).toHaveAttribute('data-hero', locked);
  await expect(game.locator('.cs-lock')).toContainText('PRACTICE');
  await expect(game.locator('[data-testid="champ-togo"]')).toContainText('Yarn to go');
  await expect(game.locator('[data-testid="champ-buy"]')).toHaveCount(1);
});

test('an existing player with the Founders roster keeps every champion', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: PLAYED });
  const game = await openHost(page);
  await toPick(game);
  await expect(game.locator('.cs-grid .cs-tile.locked')).toHaveCount(0);
});

test('a Yarn unlock is asked of the host; the app build shows no price', async ({ context, page, baseURL }) => {
  const rich = { ...NEW_GUEST, yarn: { balance: 9000, matches: 40, picksLeft: 0, nextPickAt: null } };
  await mockHost(context, baseURL!, { app: { isApp: true, store: false }, signedIn: true, profile: PLAYED, champState: rich });
  const game = await openHost(page);
  await toPick(game);
  const locked = await game.evaluate(() => (document.querySelector('.cs-grid .cs-tile.locked[data-side="cat"]') as HTMLElement).dataset.h ?? '');
  await game.locator(`.cs-grid [data-h="${locked}"]`).click();
  await expect(game.locator('[data-testid="champ-buy"]')).toHaveCount(0);
  await expect(game.locator('.pl-pick')).not.toContainText(/\$|€/);
  await game.locator('[data-testid="champ-unlock"]').click();
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'champ-unlock').map((m) => m.hero)).toEqual([locked]);
});

// The store's Champions view, Wild Rift layout (CHAMPION-STORE.md §10): tall splash cards, filters, a remembered
// sort, a detail with the Yarn unlock and the web price, Esc; it fits each phone and desktop size without a page scroll.
test('store Champions: splash grid, filters, sort remembered, detail unlock and buy, Esc', async ({ context, page, baseURL }) => {
  const rich = { ...NEW_GUEST, yarn: { balance: 9000, matches: 40, picksLeft: 0, nextPickAt: null } };
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: PLAYED, champState: rich, store: { items: [], season: null } });
  const game = await openHost(page);
  await game.locator('.hm-nav [data-a="store"]').click();
  const shop = game.locator('.pl-shop');
  await expect(shop.locator('.cst-tab.on')).toHaveAttribute('data-tab', 'champions');
  await expect(shop.locator('.cst-card[data-hero]')).toHaveCount(20);
  // the splash art loads (lazy, 360 or 720 by width)
  await expect.poll(() => shop.locator('.cst-card[data-hero="clem"] img.cst-art').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await shop.locator('[data-side="dog"]').click();
  await expect(shop.locator('.cst-card[data-hero]')).toHaveCount(10);
  await shop.locator('[data-role="mage"]').click();
  await expect(shop.locator('.cst-card[data-hero]')).toHaveCount(2);
  await shop.locator('[data-side="all"]').click();
  await shop.locator('[data-role="mage"]').click();
  await shop.locator('[data-a="unowned"]').check();
  await expect(shop.locator('.cst-card[data-hero]')).toHaveCount(14);
  await shop.locator('[data-a="sort"]').selectOption('name');
  await expect(shop.locator('.cst-card[data-hero]').first()).toHaveAttribute('data-hero', 'aviete');
  // detail: a locked champion (not in this week's rotation) unlocks with Yarn through the host, or buys on the web
  const locked = await game.evaluate(() => (document.querySelector('.cst-card.st-locked[data-hero]') as HTMLElement).dataset.hero ?? '');
  await shop.locator(`.cst-card[data-hero="${locked}"]`).click();
  const detail = shop.locator('.cst-detail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.cst-skills li')).toHaveCount(5);
  await detail.locator('[data-unlock="yarn"]').click();
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'champ-unlock').map((m) => m.hero)).toEqual([locked]);
  await detail.locator(`[data-buy="pl_champ_${locked}"]`).click();
  await expect.poll(async () => (await received(page)).some((m) => m.type === 'purchase-intent' && m.sku === `pl_champ_${locked}`)).toBe(true);
  await game.locator('body').press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(shop.locator(`.cst-card[data-hero="${locked}"]`)).toBeFocused();
  await game.locator('body').press('Escape');
  await expect(shop).toHaveCount(0);
  // the sort is remembered on the next visit
  await game.locator('.hm-nav [data-a="store"]').click();
  await expect(game.locator('.pl-shop [data-a="sort"]')).toHaveValue('name');
});

test('store fits 667x375, 844x390, 1280x720 and 1440x900: no page scroll, the grid scrolls, controls at least 44 px', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: PLAYED, champState: NEW_GUEST, store: { items: [], season: null } });
  const game = await openHost(page);
  for (const [w, h] of [[667, 375], [844, 390], [1280, 720], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await game.locator('.hm-nav [data-a="store"]').click();
    const shop = game.locator('.pl-shop');
    await expect(shop.locator('.cst-card').first()).toBeVisible();
    for (const t of ['champions', 'featured']) {
      await shop.locator(`.cst-tabs [data-tab="${t}"]`).click();
      const r = await fits(game);
      expect(r.page, `${w}x${h} ${t}`).toEqual({ sh: r.page.ch, sw: r.page.cw, ch: r.page.ch, cw: r.page.cw });
      expect(r.small, `${w}x${h} ${t} small controls`).toEqual([]);
      expect(r.out, `${w}x${h} ${t} outside the screen`).toEqual([]);
      expect(r.cardH, `${w}x${h} ${t} card height`).toBeGreaterThan(150);
    }
    await shop.locator('.cst-tabs [data-tab="champions"]').click();
    await shop.locator('.cst-card[data-hero]').first().click();
    const d = await fits(game);
    expect(d.page.sh).toBe(d.page.ch);
    expect(d.out, `${w}x${h} detail`).toEqual([]);
    await game.locator('body').press('Escape');
    await game.locator('body').press('Escape');
    await expect(shop).toHaveCount(0);
  }
});

async function fits(game: Frame) {
  return game.evaluate(() => {
    const se = document.scrollingElement!;
    const vw = innerWidth;
    const vh = innerHeight;
    const shown = (e: Element): boolean => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !e.closest('[inert]');
    };
    const ctl = [...document.querySelectorAll('.pl-shop .cst-top button, .pl-shop .cst-filters button, .pl-shop .cst-filters select, .pl-shop .cst-filters label, .pl-shop .cst-tabs button, .pl-shop .cst-detail button')].filter(shown);
    const small = ctl.filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => e.outerHTML.slice(0, 60));
    const filters = document.querySelector('.pl-shop .cst-filters');
    const out = [...document.querySelectorAll('.pl-shop .cst-top, .pl-shop .cst-tabs, .pl-shop .cst-dpanel, .pl-shop .cst-filters > *')]
      .filter(shown)
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1;
      })
      .map((e) => e.className);
    if (filters && filters.scrollWidth > filters.clientWidth + 1) out.push('cst-filters overflows');
    const card = document.querySelector('.pl-shop .cst-card');
    return { page: { sh: se.scrollHeight, sw: se.scrollWidth, ch: se.clientHeight, cw: se.clientWidth }, small, out, cardH: card ? card.getBoundingClientRect().height : 0 };
  });
}
