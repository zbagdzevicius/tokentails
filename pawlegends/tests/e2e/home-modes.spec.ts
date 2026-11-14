import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

// The one play path (docs/plans/moba/HOME-MODES.md §5, Nov 12): Home → PLAY → Mode Select (mode) → the variant (vs Bots
// with its difficulty, Co-op, PvP, With Friends) → the champion select → LOCK IN → a live match. At 667x375, 844x390,
// 1280x720 and 1440x900: no scroll, every control at least 44 px and on top, Enter plays, Esc backs out one step.
// The first-ever match keeps its one-tap guided start. Co-op, PvP and With Friends need the relay: tests/e2e/mp/
// play-path.spec.ts. PLAY_SHOTS=1 saves each step to ~/Downloads/paw-legends/play-flow/.

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };
const SHOTS = process.env.PLAY_SHOTS ? `${homedir()}/Downloads/paw-legends/play-flow` : '';

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
        .map((b) => `${b.className || b.tagName} ${b.getAttribute('data-a') ?? b.getAttribute('data-v') ?? b.getAttribute('data-d') ?? ''} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`),
    [root, String(min)] as const,
  );

/** Every visible control inside `root` that leaves the viewport (none expected). */
const outside = (page: Page, root: string): Promise<string[]> =>
  page.evaluate(
    (r) =>
      Array.from(document.querySelectorAll<HTMLElement>(`${r} button`))
        .filter((b) => {
          if (b.closest('[hidden]') || getComputedStyle(b).visibility === 'hidden') return false;
          const q = b.getBoundingClientRect();
          return q.width > 0 && (q.left < -0.5 || q.top < -0.5 || q.right > innerWidth + 0.5 || q.bottom > innerHeight + 0.5);
        })
        .map((b) => b.className),
    root,
  );

const shot = async (page: Page, step: string): Promise<void> => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const v = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${step}-${v.width}x${v.height}.png` });
};

test('Home → PLAY → Skirmish → vs Bots Hard → champion select → LOCK IN → a live match', async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  // Home: one PLAY, no other match start
  await expect(page.locator('[data-testid="home-play"]')).toHaveAttribute('aria-label', 'Play: choose a mode');
  for (const sel of ['[data-testid="play-online"]', '[data-testid="play-pvp"]', '[data-testid="play-friends"]', '[data-testid="lobby-exit"]', '.hm-pill', '[data-testid="mode-pill"]'])
    await expect(page.locator(sel), sel).toHaveCount(0);
  await expect(page.locator('.pl-home')).not.toContainText(/\$|€|price|buy|donate/i);
  await page.locator('[data-testid="home-play"]').click();
  const ms = page.locator('[data-testid="mode-select"]');
  await expect(ms).toBeVisible();
  // sim v27: Blitz, Skirmish, Classic, Cannon Chaos, Practice, Ranked and the Weekly Twist (the baked one offline);
  // sim v28: One Lane Brawl, the Duel and Boss Weekend
  await expect(ms.locator('.ms-pick')).toHaveCount(10);
  await ms.locator('[data-testid="mode-skirmish"]').click();
  await ms.locator('[data-testid="mode-next"]').click();
  await expect(ms).toHaveAttribute('data-stage', 'variant');
  // standalone (no relay): Co-op, PvP and With Friends show, locked with the reason
  await expect(ms.locator('[data-testid="variant-coop"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(ms.locator('[data-testid="variant-coop"]')).toContainText('party server');
  await ms.locator('[data-testid="bots-hard"]').click();
  await expect(ms.locator('[data-testid="bots-hard"]')).toHaveAttribute('aria-checked', 'true');
  await ms.locator('[data-testid="mode-go"]').click();
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await expect(page.locator('[data-testid="pick-mode"]')).toHaveText('Skirmish 3v3 · vs Bots');
  await expect(page.locator('.cs-lock')).toContainText('vs Hard bots');
  // the difficulty is remembered at once
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}').difficulty)).toBe('hard');
  await page.locator('.cs-lock').click();
  await page.waitForSelector('html[data-match="live"]', { timeout: 90_000 });
});

test('Ranked (round 4, SOCIAL-RANKED.md §7.11): always open, the rules say bots honestly; standalone says PvP is offline', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  // a returning player: the nav Ranked item is live (never a gate line, never "later season")
  await expect(page.locator('.hm-nav [data-a="ranked"][data-live="1"]')).toBeVisible();
  await expect(page.locator('.pl-home')).not.toContainText(/later season|Opens at/i);
  await page.locator('[data-testid="home-play"]').click();
  const ms = page.locator('[data-testid="mode-select"]');
  const tile = ms.locator('[data-testid="mode-ranked"]');
  await expect(tile).not.toHaveAttribute('aria-disabled', 'true');
  // standalone (no relay, no status): no count is guessed
  await expect(tile).toContainText('Always open');
  await ms.locator('[data-info="ranked"]').click();
  await expect(ms).toContainText('labelled bots fill after 40 s (half points)');
  await expect(ms).toContainText('vs AI (quarter points, none from Alley III)');
  await shot(page, 'r4-ranked-rules');
  await page.keyboard.press('Escape');
  await tile.click();
  await ms.locator('[data-testid="mode-next"]').click();
  await expect(ms.locator('[data-testid="variant-pvp"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(ms.locator('[data-testid="variant-pvp"]')).toContainText('offline');
  await shot(page, 'r4-ranked-variant');
});

test('Classic → vs Bots → LOCK IN → a live 5v5 match on Hearthwood (it never started before, Nov 12)', async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await page.locator('[data-testid="home-play"]').click();
  await page.locator('[data-testid="mode-classic"]').click();
  await page.locator('[data-testid="mode-next"]').click();
  // Classic's own variants only: vs Bots and PvP (co-op and parties are 3v3)
  await expect(page.locator('.ms-var')).toHaveCount(2);
  await page.locator('[data-testid="variant-bots"]').click();
  await page.locator('[data-testid="mode-go"]').click();
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await expect(page.locator('[data-testid="pick-mode"]')).toHaveText('Classic 5v5 · vs Bots');
  // five seats a team (Sim v19: the seats match the match the select starts)
  await expect(page.locator('.cs-seats')).toHaveAttribute('style', /--n:5/);
  await page.locator('.cs-lock').click();
  await expect(page.locator('.pl-loading')).toContainText('Hearthwood', { timeout: 20_000 });
  await page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'match');
  // the choice survives a reload (per-viewer convenience): Home shows PLAY alone, and Mode Select opens on Classic
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(page.locator('[data-testid="mode-pill"]')).toHaveCount(0);
  await expect(page.locator('.hm-playc')).not.toContainText('Classic');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="mode-select"]')).toHaveAttribute('data-stage', 'mode');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-mode'))).toBe('classic');
});

test('keyboard: Enter opens Mode Select, Enter goes on, Esc backs out one step at a time', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  const ms = page.locator('[data-testid="mode-select"]');
  await expect(ms).toHaveAttribute('data-stage', 'mode');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-mode'))).toBe('skirmish');
  await page.keyboard.press('Enter');
  await expect(ms).toHaveAttribute('data-stage', 'variant');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-v'))).toBe('bots');
  await page.keyboard.press('Enter');
  await page.waitForSelector('html[data-screen="pick"] .cs');
  // focus lands on the picked champion (a frame later)
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.pl-pick'))).toBe(true);
  // Esc on the champion select: one step back, to the variant
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="mode-select"]')).toHaveAttribute('data-stage', 'variant');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="mode-select"]')).toHaveAttribute('data-stage', 'mode');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="mode-select"]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'title');
});

test('first visit: the guided match in one tap from PLAY, the nav shown with locked items', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(page.locator('[data-testid="mode-pill"]')).toHaveCount(0);
  await expect(page.locator('.hm-line')).toContainText('first match');
  await settle(page);
  expect(await page.locator('.hm-nav .hm-ni.locked').count()).toBeGreaterThanOrEqual(2);
  expect(await noScroll(page)).toBe(true);
  expect(await small(page, '.pl-home')).toEqual([]);
  await expect(page.locator('[data-testid="home-play"]')).toHaveAttribute('aria-label', 'Play as Clem');
  await page.locator('[data-testid="home-play"]').click();
  await expect(page.locator('[data-testid="mode-select"]')).toHaveCount(0);
  await page.waitForSelector('html[data-match="live"]', { timeout: 90_000 });
});

for (const [w, h] of [
  [667, 375],
  [844, 390],
  [1280, 720],
  [1440, 900],
] as const) {
  test(`every step fits at ${w}x${h}: Home, the modes, the variants, the champion select`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'the sizes are set per test');
    test.setTimeout(120_000);
    await seed(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?e2e=1');
    await page.waitForSelector('html[data-screen="title"] .pl-home');
    await settle(page);
    // Home
    expect(await noScroll(page)).toBe(true);
    expect(await small(page, '.pl-home')).toEqual([]);
    expect(await outside(page, '.pl-home')).toEqual([]);
    expect(await onTop(page, '[data-testid="home-play"]')).toBe(true);
    const bad = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="home-play"]')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll<HTMLElement>('.pl-home button, .pl-home summary'))
        .filter((b) => !b.closest('[data-testid="home-play"]') && !b.classList.contains('lb-ver') && getComputedStyle(b).visibility !== 'hidden')
        .filter((b) => {
          if (b.closest('.hm-slide') && !b.classList.contains('on')) return false;
          const r = b.getBoundingClientRect();
          return r.width > 0 && !(r.right <= p.left || p.right <= r.left || r.bottom <= p.top || p.bottom <= r.top);
        })
        .map((b) => b.className);
    });
    expect(bad).toEqual([]);
    await shot(page, '1-home');
    // the modes
    await page.locator('[data-testid="home-play"]').click();
    const ms = page.locator('[data-testid="mode-select"]');
    await expect(ms).toBeVisible();
    await settle(page);
    expect(await noScroll(page)).toBe(true);
    expect(await small(page, '.ms-overlay')).toEqual([]);
    expect(await outside(page, '.ms-overlay .ms-foot, .ms-overlay .ms-head')).toEqual([]);
    expect(await onTop(page, '[data-testid="mode-next"]')).toBe(true);
    const tiles = await ms.locator('.ms-ring').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.top, r.bottom]));
    for (const [t, b] of tiles) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(h);
    }
    await shot(page, '2-modes');
    // the variants (vs Bots with its difficulty)
    await ms.locator('[data-testid="mode-next"]').click();
    await expect(ms).toHaveAttribute('data-stage', 'variant');
    await settle(page);
    expect(await noScroll(page)).toBe(true);
    expect(await small(page, '.ms-overlay')).toEqual([]);
    expect(await outside(page, '.ms-overlay')).toEqual([]);
    for (const sel of ['[data-testid="mode-go"]', '[data-testid="variant-bots"]', '[data-testid="variant-friends"]', '[data-testid="bots-hard"]', '[data-testid="mode-back"]']) expect(await onTop(page, sel), sel).toBe(true);
    await shot(page, '3-variants');
    // the champion select
    await ms.locator('[data-testid="mode-go"]').click();
    await page.waitForSelector('html[data-screen="pick"] .cs');
    await settle(page);
    expect(await noScroll(page)).toBe(true);
    await expect(page.locator('[data-testid="pick-mode"]')).toBeVisible();
    expect(await onTop(page, '.cs-lock')).toBe(true);
    await shot(page, '4-champion-select');
  });
}
