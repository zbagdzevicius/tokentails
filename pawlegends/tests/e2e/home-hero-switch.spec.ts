import { expect, test, type Frame, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { toChampSelect } from './helpers';
import { ALL_CHAMPS, mockHost, openHost } from './host';

// Home hero switch (Nov 12, the founder: "maybe it would be enough to add SELECT / BUY as a button in here"): the Home
// nameplate opens the champion browser on the Home hero; its one button under the description SELECTs an owned hero
// (Home follows in place, no rebuild, and the champion select opens on it), BUYs a locked one on the web (the store's
// champion detail) or UNLOCKs it in the app (no price). Nothing here starts a match. HERO_SHOTS=1 saves screenshots to
// ~/Downloads/paw-legends/play-flow/hero-select/.

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', side: 'cat', firstPlaySession: 1 };
const NEW_GUEST = { ...ALL_CHAMPS, owned: [], founders: false, yarn: { balance: 9000, matches: 40, picksLeft: 0, nextPickAt: null } };
const SHOTS = process.env.HERO_SHOTS ? `${homedir()}/Downloads/paw-legends/play-flow/hero-select` : '';

type Root = Page | Frame;

async function seed(page: Page): Promise<void> {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
  }, JSON.stringify(PLAYED));
}

const shot = async (page: Page, name: string): Promise<void> => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const v = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${v.width}x${v.height}-${name}.png` });
};

/** The browser's hero panel fits: no page scroll, the button on screen, on top and at least 44 px. */
async function fits(root: Root): Promise<{ scroll: boolean; btn: { w: number; h: number; inView: boolean; onTop: boolean } | null; order: boolean }> {
  return root.evaluate(() => {
    const b = document.querySelector<HTMLElement>('.pl-champ [data-testid="hero-action"]');
    const scroll = document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1;
    const hook = document.querySelector('.cb-hook')!.getBoundingClientRect();
    const count = document.querySelector('.cb-count')!.getBoundingClientRect();
    if (!b) return { scroll, btn: null, order: false };
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      scroll,
      btn: { w: r.width, h: r.height, inView: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5, onTop: !!hit && (hit === b || b.contains(hit)) },
      order: r.top >= hook.bottom - 0.5 && r.bottom <= count.top + 0.5,
    };
  });
}

/** Walk the browser's arrows until the button says `word` (at most once round the 20 champions). */
async function walkTo(root: Root, word: string): Promise<string> {
  const dlg = root.locator('.pl-champ[data-ready="1"]');
  for (let i = 0; i < 21; i++) {
    if ((await dlg.locator('[data-testid="hero-action"]').count()) && (await dlg.locator('[data-testid="hero-action"]').textContent()) === word) return (await dlg.getAttribute('data-hero')) ?? '';
    await dlg.locator('.cb-next').click();
  }
  throw new Error(`no champion with ${word}`);
}

test('the nameplate opens the browser; SELECT switches the Home hero in place and the champion select opens on it', async ({ page }, info) => {
  test.setTimeout(180_000);
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  const plate = page.locator('[data-testid="home-plate"]');
  await expect(plate.locator('.hm-plate-n')).toContainText('Sage');
  // mark this Home: a rebuild would drop the mark
  await page.evaluate(() => ((document.querySelector('.pl-home') as HTMLElement & { __mark?: number }).__mark = 7));
  await shot(page, '1-home');
  await plate.click();
  const dlg = page.locator('.pl-champ[data-ready="1"]');
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  await expect(dlg).toHaveAttribute('data-hero', 'sage');
  const btn = dlg.locator('[data-testid="hero-action"]');
  await expect(btn).toHaveText('SELECTED');
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  await shot(page, '2-browser-selected');
  // the next owned hero: SELECT (standalone: every champion is open), pressed with the keyboard
  await dlg.locator('.cb-next').click();
  const next = (await dlg.getAttribute('data-hero'))!;
  expect(next).not.toBe('sage');
  await expect(btn).toHaveText('SELECT');
  const f = await fits(page);
  expect(f.scroll).toBe(false);
  expect(f.btn).toMatchObject({ inView: true, onTop: true });
  expect(f.btn!.h).toBeGreaterThanOrEqual(44);
  expect(f.order).toBe(true);
  await shot(page, '3-browser-select');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(btn).toHaveText('SELECTED');
  await expect(btn).toBeFocused();
  // Home followed in place: same element, the nameplate shows the new hero, no match, no champion select
  const name = await dlg.locator('.cb-name').textContent();
  await expect(page.locator('[data-testid="home-plate"] .hm-plate-n')).toContainText(name!);
  expect(await page.evaluate(() => (document.querySelector('.pl-home') as HTMLElement & { __mark?: number }).__mark)).toBe(7);
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'title');
  expect(await page.evaluate(() => document.documentElement.dataset.match ?? '')).toBe('');
  await expect(page.locator('html')).toHaveAttribute('data-look', new RegExp(`^${next}:`));
  await shot(page, '4-selected');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pl-champ')).toHaveCount(0);
  await shot(page, '5-home-after');
  // a reload remembers it
  await page.reload();
  await page.waitForSelector('html[data-screen="title"]');
  await expect(page.locator('[data-testid="home-plate"] .hm-plate-n')).toContainText(name!);
  // the champion select opens on the selected hero
  await toChampSelect(page);
  await expect(page.locator('.cs-tile.on')).toHaveAttribute('data-h', next);
  expect(await page.evaluate(() => document.documentElement.dataset.match ?? '')).toBe('');
  void info;
});

test('the button fits 667x375, 844x390, 1280x720 and 1440x900', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'sizes are set here');
  test.setTimeout(180_000);
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  for (const [w, h] of [[667, 375], [844, 390], [1280, 720], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.locator('[data-testid="home-plate"]').click();
    const dlg = page.locator('.pl-champ[data-ready="1"]');
    await expect(dlg).toBeVisible({ timeout: 30_000 });
    await dlg.locator('.cb-next').click();
    const f = await fits(page);
    expect(f.scroll, `${w}x${h} scroll`).toBe(false);
    expect(f.btn, `${w}x${h}`).toMatchObject({ inView: true, onTop: true });
    expect(f.btn!.h, `${w}x${h} height`).toBeGreaterThanOrEqual(44);
    expect(f.order, `${w}x${h} under the description, above the count`).toBe(true);
    if ((w === 844 && h === 390) || (w === 1440 && h === 900)) await shot(page, 'fit-browser');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pl-champ')).toHaveCount(0);
    const pb = await page.locator('[data-testid="home-plate"]').boundingBox();
    expect(pb!.height, `${w}x${h} plate`).toBeGreaterThanOrEqual(44);
  }
});

test('web: BUY on a locked champion opens its store detail; nothing starts a match', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'store panels are viewport independent');
  test.setTimeout(180_000);
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: PLAYED, champState: NEW_GUEST, store: { items: [], season: null } });
  const game = await openHost(page);
  await game.locator('[data-testid="home-plate"]').click();
  await expect(game.locator('.pl-champ[data-ready="1"]')).toBeVisible({ timeout: 30_000 });
  const locked = await walkTo(game, 'BUY');
  await game.locator('.pl-champ [data-testid="hero-action"]').click();
  await expect(game.locator('.pl-champ')).toHaveCount(0);
  const detail = game.locator('.pl-shop .cst-detail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.cst-dpanel')).toHaveAttribute('data-hero', locked);
  await expect(detail.locator(`[data-buy="pl_champ_${locked}"]`)).toHaveCount(1);
  await expect(game.locator('html')).toHaveAttribute('data-screen', 'title');
  expect(await game.evaluate(() => document.documentElement.dataset.match ?? '')).toBe('');
});

test('app: UNLOCK opens the same detail with Yarn only, no price anywhere', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'store panels are viewport independent');
  test.setTimeout(180_000);
  await mockHost(context, baseURL!, { app: { isApp: true, store: false }, signedIn: true, profile: PLAYED, champState: NEW_GUEST });
  const game = await openHost(page);
  await game.locator('[data-testid="home-plate"]').click();
  await expect(game.locator('.pl-champ[data-ready="1"]')).toBeVisible({ timeout: 30_000 });
  const locked = await walkTo(game, 'UNLOCK');
  await expect(game.locator('.pl-champ')).not.toContainText(/\$|€|BUY/);
  await game.locator('.pl-champ [data-testid="hero-action"]').click();
  const detail = game.locator('.pl-shop .cst-detail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.cst-dpanel')).toHaveAttribute('data-hero', locked);
  await expect(detail.locator('[data-unlock="yarn"]')).toHaveCount(1);
  await expect(detail.locator('[data-buy]')).toHaveCount(0);
  await expect(game.locator('.pl-shop')).not.toContainText(/\$|€/);
  expect(await game.evaluate(() => document.documentElement.dataset.match ?? '')).toBe('');
});
