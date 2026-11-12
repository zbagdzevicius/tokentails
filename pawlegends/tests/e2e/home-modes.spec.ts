import { expect, test, type Page } from '@playwright/test';

// Home and Mode Select (docs/plans/moba/HOME-MODES.md): at 844x390 (landscape project) and 1280x720 (desktop) a
// returning player goes Home → mode pill → Mode Select → Classic → Confirm → PLAY into a live 5v5 match. Home and Mode
// Select never scroll, every control is at least 44 px and on top, and the zones keep apart (profile top left, PLAY
// bottom right, the nav at the bottom, nothing overlapping PLAY).

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };

async function seed(page: Page): Promise<void> {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
  }, JSON.stringify(PLAYED));
}

async function onTop(page: Page, sel: string): Promise<boolean> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }, sel);
}

/** Waits out the entrance animations (the bars drop in, the tiles pop in); the looping ones keep running. */
const settle = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'), null, { timeout: 10_000 });

const noScroll = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);

/** Every visible control inside `root` that is smaller than `min` px in either direction (none expected). */
const small = (page: Page, root: string, min = 44): Promise<string[]> =>
  page.evaluate(
    ([r, m]) =>
      Array.from(document.querySelectorAll<HTMLElement>(`${r} button, ${r} summary`))
        .filter((b) => {
          const s = getComputedStyle(b);
          if (s.display === 'none' || s.visibility === 'hidden' || b.closest('[hidden]') || b.classList.contains('lb-ver')) return false;
          const q = b.getBoundingClientRect();
          return q.width > 0 && q.height > 0 && (q.width < Number(m) - 0.5 || q.height < Number(m) - 0.5);
        })
        .map((b) => `${b.className || b.tagName} ${b.getAttribute('data-a') ?? b.getAttribute('data-q') ?? ''} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`),
    [root, String(min)] as const,
  );

const box = async (page: Page, sel: string): Promise<{ x: number; y: number; w: number; h: number }> => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`no box for ${sel}`);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const apart = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;

test('home → mode select → Classic → PLAY into a live 5v5 match', async ({ page }) => {
  // a 5v5 Hearthwood match loads on SwiftShader here
  test.setTimeout(150_000);
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await settle(page);
  const play = page.locator('[data-testid="home-play"]');
  await expect(play).toBeInViewport();
  expect(await onTop(page, '[data-testid="home-play"]')).toBe(true);
  await expect(play).toHaveAttribute('aria-label', 'Play as Sage');
  await expect(page.locator('html')).toHaveAttribute('data-lobby-bg', /^legends/);
  expect(await noScroll(page)).toBe(true);
  expect(await small(page, '.pl-home')).toEqual([]);
  // zones: profile top left, PLAY bottom right, the nav bottom left; none overlaps PLAY or the pill
  const vp = page.viewportSize()!;
  const pb = await box(page, '[data-testid="home-play"]');
  const prof = await box(page, '[data-testid="home-profile"]');
  const nav = await box(page, '.hm-nav');
  const pill = await box(page, '[data-testid="mode-pill"]');
  expect(prof.x).toBeLessThan(vp.width / 3);
  expect(prof.y).toBeLessThan(vp.height / 4);
  expect(pb.x + pb.w).toBeGreaterThan(vp.width * 0.8);
  expect(pb.y + pb.h).toBeGreaterThan(vp.height * 0.8);
  expect(pb.x + pb.w).toBeLessThanOrEqual(vp.width);
  expect(pb.y + pb.h).toBeLessThanOrEqual(vp.height);
  expect(nav.y + nav.h).toBeGreaterThan(vp.height * 0.85);
  for (const b of [prof, nav]) expect(apart(b, pb)).toBe(true);
  expect(apart(nav, pill)).toBe(true);
  expect(pb.w).toBeGreaterThanOrEqual(80);
  // no money words on Home
  await expect(page.locator('.pl-home')).not.toContainText(/\$|€|price|buy|donate/i);

  await page.locator('[data-testid="mode-pill"]').click();
  const ms = page.locator('[data-testid="mode-select"]');
  await expect(ms).toBeVisible();
  await expect(ms.locator('.ms-pick')).toHaveCount(6);
  await settle(page);
  expect(await noScroll(page)).toBe(true);
  expect(await small(page, '.ms-overlay')).toEqual([]);
  // every tile row item is inside the screen (the row is the only scroll region and 6 fit at 844x390)
  const tiles = await ms.locator('.ms-ring').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.right, r.top, r.bottom]));
  for (const [l, r, t, b] of tiles) {
    expect(l).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(vp.width);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(vp.height);
  }
  // a locked tile shakes and explains; it never becomes the choice
  await ms.locator('[data-testid="mode-ranked"]').click({ force: true }); // aria-disabled: Playwright would wait for it
  await expect(ms.locator('.ms-toast')).toContainText('Ranked');
  await ms.locator('[data-testid="mode-classic"]').click();
  await expect(ms.locator('[data-testid="mode-classic"]')).toHaveAttribute('aria-checked', 'true');
  await ms.locator('[data-testid="queue-bots"]').click();
  await ms.locator('[data-testid="mode-confirm"]').click();
  await expect(ms).toHaveCount(0);
  await expect(page.locator('[data-testid="mode-pill"]')).toContainText('Classic 5v5');
  // the choice survives a reload (per-viewer convenience)
  await page.reload();
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(page.locator('[data-testid="mode-pill"]')).toContainText('Classic 5v5');
  await page.locator('[data-testid="home-play"]').click();
  await page.waitForSelector('html[data-match="live"]', { timeout: 90_000 });
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'match');
});

test('first visit: the guided match from PLAY, the nav shown with locked items', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(page.locator('[data-testid="mode-pill"]')).toHaveCount(0);
  await expect(page.locator('.hm-line')).toContainText('first match');
  await settle(page);
  expect(await page.locator('.hm-nav .hm-ni.locked').count()).toBeGreaterThanOrEqual(2);
  expect(await noScroll(page)).toBe(true);
  expect(await small(page, '.pl-home')).toEqual([]);
});

for (const [w, h] of [
  [667, 375],
  [844, 390],
  [1440, 900],
  [667, 300],
] as const) {
  test(`no overflow and nothing overlapping PLAY at ${w}x${h}`, async ({ page }) => {
    await seed(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?e2e=1');
    await page.waitForSelector('html[data-screen="title"] .pl-home');
    await settle(page);
    expect(await noScroll(page)).toBe(true);
    const pb = await box(page, '[data-testid="home-play"]');
    expect(pb.x + pb.w).toBeLessThanOrEqual(w);
    expect(pb.y + pb.h).toBeLessThanOrEqual(h);
    // every visible Home control stays in the viewport and none sits on PLAY
    const bad = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="home-play"]')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll<HTMLElement>('.pl-home button, .pl-home summary'))
        .filter((b) => !b.closest('[data-testid="home-play"]') && !b.classList.contains('lb-ver') && getComputedStyle(b).visibility !== 'hidden')
        .filter((b) => {
          if (b.closest('.hm-slide') && !b.classList.contains('on')) return false;
          const r = b.getBoundingClientRect();
          if (!r.width || !r.height) return false;
          const out = r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5;
          const hit = !(r.right <= p.left || p.right <= r.left || r.bottom <= p.top || p.bottom <= r.top);
          return out || hit;
        })
        .map((b) => b.className);
    });
    expect(bad).toEqual([]);
    await page.locator('[data-testid="mode-pill"]').click();
    await expect(page.locator('[data-testid="mode-confirm"]')).toBeInViewport();
    await settle(page);
    expect(await noScroll(page)).toBe(true);
    expect(await onTop(page, '[data-testid="mode-confirm"]')).toBe(true);
  });
}
