import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * What's New (meta/showcase.ts, ui/showcase; founder Nov 19): Home has no promo card; after the first guided match the
 * news opens ONCE as comic pages over Home (the drop first, then the Legends Pass season). The button opens the owning
 * screen; a reload does not show the page again; a new item does. Reduced motion keeps no animation. At 1440x900,
 * 1920x1080, 844x390, 667x375 and 390x844 the page fits the screen: nothing overlaps or scrolls sideways, targets are
 * 44 px, text 14 px or more. Screenshots: $SHOWCASE_SHOTS (a folder), when set.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const SHOTS = process.env.SHOWCASE_SHOTS ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const day = 86_400_000;
const iso = (t: number): string => new Date(t).toISOString();
const now = Date.now();
const profile = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };
const SEASON = { id: 's1', xp: 400, tier: 1, premium: 'none', skips: 0, claimed: [] as string[], endsAt: '2027-01-05T00:00:00.000Z' };
const COATS = ['coat.brutus.store_chairman', 'coat.meatball.store_double_stack', 'coat.meatball.store_mega_meal'];
const drop = (id = 'drop-2026-11', name = 'November Drop: Boardroom & Lunch Rush') => ({ id, name, coats: COATS, startsAt: iso(now - day), endsAt: iso(now + 11 * day + 4 * 3_600_000), next: null });
const ART = fileURLToPath(new URL('../../../pawlegends-web/public/pawlegends-art/', import.meta.url));

/** A tiny live-ops server the test can change between page loads (a new drop goes live). */
function server(state: { drop: unknown; nap?: unknown }) {
  return async (op: string) => {
    if (op === 'liveops.config') return { status: 200, body: { v: 1, now: iso(Date.now()), events: [], featuredQuests: [], drop: state.drop, ...(state.nap ? { nap: state.nap } : {}) } };
    if (op === 'liveops.me') return { status: 200, body: { nap: { days: 0, earned: 0, claimed: 0, playedToday: false }, items: [] } };
    if (op === 'social.pulse') return { status: 204 };
    return { status: 200, body: {} };
  };
}

/** The art origin (pawlegends.app) served from this checkout, so the spec runs before the art deploy. */
async function serveArt(page: Page): Promise<void> {
  await page.route('https://pawlegends.app/pawlegends-art/**', (r) => {
    const rest = decodeURIComponent(new URL(r.request().url()).pathname.slice('/pawlegends-art/'.length));
    if (!/^[a-z0-9/._-]+\.webp$/i.test(rest) || rest.includes('..')) return r.fulfill({ status: 404 });
    return r.fulfill({ path: `${ART}${rest}`, contentType: 'image/webp', headers: { 'access-control-allow-origin': '*' } }).catch(() => r.fulfill({ status: 404 }));
  });
}

async function open(context: BrowserContext, page: Page, baseURL: string, state: { drop: unknown; nap?: unknown }, o: { isApp?: boolean } = {}): Promise<Frame> {
  // the e2e build skips What's New unless a spec asks for it (the older specs drive Home without it)
  await context.addInitScript(() => void ((window as unknown as { __plShowcase: boolean }).__plShowcase = true));
  await context.exposeFunction('plApi', server(state));
  await mockHost(context, baseURL, { app: { isApp: !!o.isApp, store: !o.isApp }, signedIn: true, liveApi: true, viewport: true, profile, store: { items: [], season: SEASON } });
  await serveArt(page);
  return openHost(page);
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** The page fits its screen: inside the viewport and the book, art and info apart, no sideways scroll, 44 px, 14 px. */
async function checkLayout(game: Frame, tag: string): Promise<void> {
  // measure the settled page: the entrance (≤ 900 ms) scales and slides the boxes while it runs
  await game.evaluate(async () => {
    const ov = document.querySelector('.sc-ov');
    const mine = document.getAnimations().filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target;
      return !!ov && !!t && ov.contains(t) && a.effect?.getTiming().iterations !== Infinity;
    });
    await Promise.all(mine.map((a) => a.finished.catch(() => undefined)));
  });
  const r = await game.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    const vis = (el: Element) => getComputedStyle(el).display !== 'none' && (el as HTMLElement).getBoundingClientRect().width > 0;
    const info = Array.from(document.querySelectorAll('.sc-info > *, .sc-thing')).filter(vis).map(box);
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.sc-cta, .sc-next, .sc-dot')).filter(vis).map((b) => ({ ...box(b)!, cls: b.className }));
    const x = document.querySelector('.sc-x')!;
    const xr = x.getBoundingClientRect();
    const xa = getComputedStyle(x, '::after');
    const texts = Array.from(document.querySelectorAll<HTMLElement>('.sc-kicker, .sc-bubble, .sc-thing b, .sc-time, .sc-cta, .sc-next')).filter(vis).map((e) => ({ cls: e.className, px: parseFloat(getComputedStyle(e).fontSize) }));
    return {
      vw: innerWidth,
      vh: innerHeight,
      sw: document.documentElement.scrollWidth,
      book: box(document.querySelector('.sc-book')),
      art: box(document.querySelector('.sc-art')),
      infoCol: box(document.querySelector('.sc-info')),
      info,
      targets,
      x: { w: xr.width, h: xr.height, after: xa.content !== 'none' && xa.content !== 'normal' },
      texts,
    };
  });
  expect(r.sw, `${tag}: no sideways scroll`).toBeLessThanOrEqual(r.vw);
  const b = r.book!;
  expect(b.x, tag).toBeGreaterThanOrEqual(0);
  expect(b.y, tag).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, tag).toBeLessThanOrEqual(r.vw + 0.5);
  expect(b.y + b.height, tag).toBeLessThanOrEqual(r.vh + 0.5);
  // the art panel and the info column never overlap (side by side, or stacked on a portrait phone)
  expect(overlaps(r.art!, r.infoCol!), `${tag}: art over info`).toBe(false);
  // every info row sits inside the book (nothing clipped at the bottom) and the rows do not overlap each other
  for (const e of r.info) {
    expect(e!.y + e!.height, `${tag}: an info row runs off the page`).toBeLessThanOrEqual(b.y + b.height + 0.5);
    expect(e!.x + e!.width, `${tag}: an info row runs off the side`).toBeLessThanOrEqual(b.x + b.width + 0.5);
  }
  for (const t of r.targets) expect(t.height, `${tag}: ${t.cls} target`).toBeGreaterThanOrEqual(44);
  expect(r.x.w >= 44 || r.x.after, `${tag}: close target`).toBe(true);
  for (const t of r.texts) expect(t.px, `${tag}: ${t.cls} text`).toBeGreaterThanOrEqual(14);
}

const shot = async (page: Page, name: string): Promise<void> => {
  if (!SHOTS) return;
  // let the page's entrance settle (≤ 900 ms)
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test('What\'s New: shown once after onboarding, the drop first, Next to the season, its button opens the Pass; a reload does not show it again, a new drop does', async ({ context, page, baseURL }, info) => {
  test.setTimeout(limit(240_000));
  const state = { drop: drop() as unknown };
  const game = await open(context, page, baseURL!, state);
  const sc = game.locator('[data-testid="showcase"]');
  await expect(sc).toBeVisible({ timeout: limit(60_000) });
  // Home has no promo card any more
  await expect(game.locator('.hm-promo')).toHaveCount(0);
  await expect(game.locator('[data-testid="showcase-issue"]')).toHaveText('1/2');
  const pg = sc.locator('.sc-page');
  await expect(pg).toHaveAttribute('data-type', 'store-drop');
  await expect(pg.locator('.sc-title')).toHaveText('November Drop');
  await expect(pg.locator('.sc-thing')).toHaveCount(3);
  await expect(pg.locator('[data-testid="showcase-time"]')).toHaveText(/Ends in 1[01]d \d+h/);
  await expect(pg.locator('[data-testid="showcase-cta"]')).toHaveText('See the coats');
  // the art streams from the art origin and loads
  await expect.poll(() => pg.locator('.sc-art img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  // Home behind it is out of reach: Enter does not start a match
  // (focus off the page's own button first: Enter on the focused button is that button, as it should be)
  await game.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(game.locator('.pl-store')).toHaveCount(0);
  await expect(sc).toBeVisible();
  await shot(page, `${info.project.name}-drop`);
  await checkLayout(game, `${info.project.name} drop`);

  await game.locator('[data-testid="showcase-next"]').click();
  await expect(pg).toHaveAttribute('data-type', 'pass-season');
  await expect(pg.locator('.sc-title')).toHaveText('Legends Pass');
  await expect(game.locator('[data-testid="showcase-next"]')).toHaveText('Got it');
  await shot(page, `${info.project.name}-pass`);
  await checkLayout(game, `${info.project.name} pass`);
  await game.locator('[data-testid="showcase-cta"]').click();
  await expect(sc).toHaveCount(0);
  await expect(game.locator('.pl-collection')).toBeVisible({ timeout: limit(30_000) });

  // a reload: both pages were seen, nothing opens
  await page.reload();
  const again = page.frames().find((f) => f.url().includes('/pawlegends-game/'))!;
  await again.waitForSelector('html[data-ready="1"]');
  await again.locator('[data-testid="home-play"]').waitFor({ timeout: limit(60_000) });
  await again.waitForTimeout(3500);
  await expect(again.locator('[data-testid="showcase"]')).toHaveCount(0);

  // a new drop goes live: only its page shows
  state.drop = drop('drop-2026-12', 'December Drop: Snow Day');
  await page.reload();
  const third = page.frames().find((f) => f.url().includes('/pawlegends-game/'))!;
  await third.waitForSelector('html[data-ready="1"]');
  const sc3 = third.locator('[data-testid="showcase"]');
  await expect(sc3).toBeVisible({ timeout: limit(60_000) });
  await expect(third.locator('[data-testid="showcase-issue"]')).toHaveText('1/1');
  await expect(sc3.locator('.sc-title')).toHaveText('December Drop');
  // Esc closes it and Home is back in reach
  await page.keyboard.press('Escape');
  await expect(sc3).toHaveCount(0);
  await expect(third.locator('[data-testid="home-play"]')).toBeEnabled();
});

test('What\'s New: the drop\'s button opens the store\'s coats on the web; the event page opens Quests on Events', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough for the targets');
  test.setTimeout(limit(240_000));
  const nap = {
    id: 'nap-2026',
    name: 'Winter Nap',
    startsAt: iso(now + 3 * day),
    endsAt: iso(now + 24 * day),
    open: false,
    today: iso(now).slice(0, 10),
    gifts: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, item: i === 6 ? 'coat.cacklejaw.frost' : 'coat.sage.loop.slate', name: i === 6 ? 'Frost coat for Cacklejaw' : `Slate coat for Sage` })),
  };
  const game = await open(context, page, baseURL!, { drop: drop(), nap });
  const sc = game.locator('[data-testid="showcase"]');
  await expect(sc).toBeVisible({ timeout: limit(60_000) });
  await expect(game.locator('[data-testid="showcase-issue"]')).toHaveText('1/3');
  // the event page, pre-announced: "Starts in", gifts 1 to 3 and day 7
  await game.locator('.sc-dot[data-i="2"]').click();
  const pg = sc.locator('.sc-page');
  await expect(pg).toHaveAttribute('data-type', 'event');
  await expect(pg.locator('[data-testid="showcase-time"]')).toHaveText(/Starts in [23]d/);
  await expect(pg.locator('.sc-thing b')).toHaveText(['Day 1', 'Day 2', 'Day 3', 'Day 7']);
  await shot(page, 'desktop-event');
  await checkLayout(game, 'desktop event');
  await game.locator('[data-testid="showcase-cta"]').click();
  const panel = game.locator('[data-testid="goals-panel"]');
  await expect(panel).toBeVisible({ timeout: limit(30_000) });
  await expect(panel).toHaveAttribute('data-tab', 'events');
});

test('What\'s New: the drop\'s button on the web opens the store on the coats', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough for the targets');
  test.setTimeout(limit(240_000));
  const game = await open(context, page, baseURL!, { drop: drop() });
  await expect(game.locator('[data-testid="showcase-cta"]')).toHaveText('See the coats', { timeout: limit(60_000) });
  await game.locator('[data-testid="showcase-cta"]').click();
  const shop = game.locator('.pl-shop');
  await expect(shop).toBeVisible({ timeout: limit(30_000) });
  await expect(shop.locator('[data-sel^="pl_coat_"]').first()).toHaveAttribute('data-sel', 'pl_coat_brutus_chairman');
});

test('What\'s New: reduced motion runs no animation', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  test.setTimeout(limit(180_000));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const game = await open(context, page, baseURL!, { drop: drop() });
  const sc = game.locator('[data-testid="showcase"]');
  await expect(sc).toBeVisible({ timeout: limit(60_000) });
  await expect(sc).toHaveClass(/reduced/);
  await game.locator('[data-testid="showcase-next"]').click();
  // nothing moves: at most the 150 ms page fade runs, never a transform animation
  const running = await game.evaluate(() =>
    document
      .querySelector('.sc-ov')!
      .getAnimations({ subtree: true })
      .map((a) => (a as CSSAnimation).animationName)
      .filter((n) => n !== 'sc-fade'),
  );
  expect(running).toEqual([]);
});

const SIZES = [
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 844, h: 390 },
  { w: 667, h: 375 },
  { w: 390, h: 844 },
];
test('What\'s New: fits every screen (no overlap, no sideways scroll, 44 px targets, 14 px text)', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'sizes set here');
  test.setTimeout(limit(300_000));
  const game = await open(context, page, baseURL!, { drop: drop() });
  await expect(game.locator('[data-testid="showcase"]')).toBeVisible({ timeout: limit(60_000) });
  for (const s of SIZES) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.waitForTimeout(300);
    for (const i of [0, 1]) {
      await game.locator(`.sc-dot[data-i="${i}"]`).click();
      await expect(game.locator('[data-testid="showcase-issue"]')).toHaveText(`${i + 1}/2`);
      await page.waitForTimeout(950);
      await checkLayout(game, `${s.w}x${s.h} page ${i + 1}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/size-${s.w}x${s.h}-${i + 1}.png` });
    }
    // 667x375: three things at most
    if (s.w <= 720 && s.h <= 500) {
      await game.locator('.sc-dot[data-i="1"]').click();
      const shown = await game.locator('.sc-thing').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
      expect(shown).toBeLessThanOrEqual(3);
    }
  }
});
