import { expect, test, type BrowserContext, type Frame, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { limit } from '../unit/cpu-budget';
import { mockHost, openHost } from './host';
import { SIM_VERSION } from '../../src/sim/version';

/*
 * One main queue (docs/plans/moba/MODE-UNLOCKS.md, founder Nov 19: "keep: 3v3 as main queue. Practise appears from
 * Level 5 only ... Ranked appears from level 10 ... a button PLAY for main queue ... Ranked And practise will show up
 * once they'll be unlocked").
 * - A new player sees PLAY alone; PLAY goes straight to the 3v3 champion select (this build has no party server, so the
 *   main queue is a match vs bots), then a live 3v3 match.
 * - Lv 4: still PLAY alone. Lv 5: Practice beside PLAY. Lv 10 (in the embed, where the PvP queue answers): Ranked too,
 *   and PLAY is the PvP queue. A player below Lv 10 whose ranked card shows games keeps Ranked.
 * - A button a match just unlocked is revealed once ("New: Practice").
 * - The PLAY cluster fits and keeps 44 px targets at 667x375, 844x390, 1280x720, 1440x900 and in portrait.
 * Screenshots: test-results/one-queue/.
 */

const SHOTS = 'test-results/one-queue';
const profile = (matches: number, extra: Record<string, unknown> = {}) => ({ v: 1, sessions: 3, matches, wins: Math.floor(matches / 2), firstWinDone: true, hero: 'sage', firstPlaySession: 1, ...extra });

async function seed(page: Page, p: Record<string, unknown>, local: Record<string, string> = {}): Promise<void> {
  await page.addInitScript(
    ([v, l]) => {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) {
        localStorage.setItem('tt.pawlegends.profile.v1', v);
        for (const [k, x] of Object.entries(JSON.parse(l) as Record<string, string>)) localStorage.setItem(k, x);
      }
    },
    [JSON.stringify(p), JSON.stringify(local)] as const,
  );
}

const home = async (page: Page): Promise<void> => {
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
};

const shot = async (page: Page, step: string): Promise<void> => {
  mkdirSync(SHOTS, { recursive: true });
  const v = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${step}-${v.width}x${v.height}.png` });
};

/** Nothing of a mode the player has not unlocked: no button, no lock, no teaser, no "unlocks at" line. */
async function onlyPlay(root: Page | Frame): Promise<void> {
  await expect(root.locator('[data-testid="home-play"]')).toBeVisible();
  await expect(root.locator('[data-testid="home-extras"], [data-testid="home-ranked"], [data-testid="home-practice"]')).toHaveCount(0);
  await expect(root.locator('.hm-nav [data-a="ranked"], [data-why*="Ranked"]')).toHaveCount(0);
  await expect(root.locator('.pl-home')).not.toContainText(/Ranked|Practice|Unlocks at|Classic|Blitz|Duel|Cannon|Boss Weekend/);
}

test('a new player: PLAY alone, and PLAY goes straight to the 3v3 champion select, then a live 3v3 match', async ({ page }, info) => {
  test.setTimeout(limit(150_000));
  await seed(page, profile(1));
  await home(page);
  await onlyPlay(page);
  await expect(page.locator('[data-testid="home-play"]')).toHaveAttribute('aria-label', 'Play: 3v3 match');
  await expect(page.locator('[data-testid="home-play"]')).toHaveAttribute('data-queue', 'bots');
  await shot(page, `${info.project.name}-lv1-home`);
  const touch = info.project.name === 'landscape';
  const play = page.locator('[data-testid="home-play"]');
  if (touch) await play.tap();
  else await play.click();
  // no mode picker in between
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await expect(page.locator('[data-testid="mode-select"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="pick-mode"]')).toContainText('Skirmish 3v3');
  await shot(page, `${info.project.name}-lv1-pick`);
  const lock = page.locator('.pl-pick .cs-lock:not([disabled])');
  if (touch) await lock.tap();
  else await lock.click();
  await page.waitForSelector('html[data-match="live"]', { timeout: limit(90_000) });
  // a 3v3 match (6 heroes), never the 5v5 Hearthwood
  await expect.poll(async () => (await page.evaluate(() => document.documentElement.dataset.plateNames ?? '')).split('|').filter(Boolean).length, { timeout: limit(30_000) }).toBe(6);
  expect(await page.evaluate(() => document.documentElement.dataset.map ?? '')).not.toBe('hearthwood');
});

test('Lv 4: PLAY alone; Lv 5 and Lv 9: Practice beside PLAY, no Ranked (no party server here)', async ({ page }, info) => {
  test.setTimeout(limit(90_000));
  await seed(page, profile(6));
  await home(page);
  await onlyPlay(page);
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1')!);
    localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ ...p, matches: 8 }));
  });
  await home(page);
  await expect(page.locator('[data-testid="home-practice"]')).toBeVisible();
  await expect(page.locator('[data-testid="home-ranked"]')).toHaveCount(0);
  await expect(page.locator('.pl-home')).not.toContainText(/Ranked|Unlocks at/);
  await shot(page, `${info.project.name}-lv5-home`);
  // Practice: its map pick, then the champion select of Practice
  await page.locator('[data-testid="home-practice"]').click();
  const ms = page.locator('[data-testid="mode-select"]');
  await expect(ms).toHaveAttribute('data-stage', 'variant');
  await expect(ms.locator('[data-testid="practice-maps"]')).toBeVisible();
  await shot(page, `${info.project.name}-lv5-practice`);
  await page.keyboard.press('Escape');
  await expect(ms).toHaveCount(0);
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1')!);
    localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ ...p, matches: 24 }));
  });
  await home(page);
  await expect(page.locator('[data-testid="home-practice"]')).toBeVisible();
  await expect(page.locator('[data-testid="home-ranked"]')).toHaveCount(0);
});

test('a button a match just unlocked is revealed once: NEW on it and "New: Practice"; the next Home is quiet', async ({ page }) => {
  test.setTimeout(limit(60_000));
  await seed(page, profile(8), { 'pawlegends.modes.new': 'practice' });
  await home(page);
  const btn = page.locator('[data-testid="home-practice"]');
  await expect(btn).toHaveClass(/fresh/);
  await expect(btn.locator('.hm-alt-new')).toHaveText('NEW');
  await expect(page.locator('.hm-toast')).toHaveText('New: Practice');
  await home(page);
  await expect(page.locator('[data-testid="home-practice"]')).not.toHaveClass(/fresh/);
});

/** The embed with the PvP queue answering (GET /pawlegends/sim) and a mock relay socket that stays silent. */
async function embed(context: BrowserContext, baseURL: string, matches: number, extra: Record<string, unknown> = {}, api: Record<string, { status: number; body?: unknown }> = {}): Promise<void> {
  await mockHost(context, baseURL, { app: { isApp: false, store: true }, signedIn: true, profile: profile(matches, extra), api, viewport: true });
  // later routes win: the backend says it runs PvP for this sim
  await context.route('https://api.tokentails.com/pawlegends/sim', (r) =>
    r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ simVersions: [SIM_VERSION], pvpSince: 0 }) }),
  );
  await context.routeWebSocket(/\/pawlegends\/ws$/, () => undefined);
}

test('Lv 10 in the embed: Ranked and Practice beside PLAY, PLAY is the PvP queue, Ranked is one tap', async ({ context, page, baseURL }, info) => {
  test.setTimeout(limit(120_000));
  await embed(context, baseURL!, 25);
  const game = await openHost(page);
  await game.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(game.locator('[data-testid="home-ranked"]')).toBeVisible({ timeout: limit(20_000) });
  await expect(game.locator('[data-testid="home-practice"]')).toBeVisible();
  await expect(game.locator('[data-testid="home-play"]')).toHaveAttribute('data-queue', 'pvp');
  // Party sits in the same cluster, under Ranked and Practice (founder Nov 19)
  await expect(game.locator('.hm-alt')).toHaveCount(3);
  expect(await game.locator('.hm-alt').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mode))).toEqual(['ranked', 'practice', 'party']);
  await shot(page, `${info.project.name}-lv10-home`);
});

test('Lv 9 in the embed: no Ranked; a Lv 6 player whose ranked card shows games keeps Ranked', async ({ browser, baseURL }) => {
  test.setTimeout(limit(120_000));
  type Api = Record<string, { status: number; body?: unknown }>;
  const cases: { matches: number; api: Api; ranked: boolean }[] = [
    { matches: 24, api: {}, ranked: false },
    { matches: 10, api: { 'ranked.me': { status: 200, body: { eligible: true, ranked: { tierIdx: 7, points: 40, placementsLeft: 0, placementsOf: 5 } } } }, ranked: true },
  ];
  for (const c of cases) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      await embed(ctx, baseURL!, c.matches, {}, c.api);
      const game = await openHost(await ctx.newPage());
      await game.waitForSelector('html[data-screen="title"] .pl-home');
      await expect(game.locator('[data-testid="home-play"]')).toHaveAttribute('data-queue', 'pvp', { timeout: limit(20_000) });
      await expect(game.locator('[data-testid="home-practice"]')).toBeVisible();
      if (c.ranked) {
        await expect(game.locator('[data-testid="home-ranked"]')).toBeVisible({ timeout: limit(20_000) });
        await expect(game.locator('[data-testid="home-ranked"]')).toContainText('Alley II');
      } else {
        await game.waitForTimeout(1500);
        await expect(game.locator('[data-testid="home-ranked"]')).toHaveCount(0);
      }
    } finally {
      await ctx.close();
    }
  }
});

// Founder Nov 21 ("practise and party and ranked buttons needs to be smaller"): each pill is a small face (<= 0.4 of
// PLAY's height, about 0.3); on touch the button stays a 44 px target around that face (its ::before draws it).
for (const [w, h, touch] of [
  [667, 375, true],
  [844, 390, true],
  [1280, 720, false],
  [1440, 900, false],
  [1600, 900, false],
  [1920, 1080, false],
  [390, 844, true],
] as const) {
  test(`the PLAY cluster fits at ${w}x${h}${touch ? ' (touch)' : ''}: small pills, PLAY dominates, inside the screen, clear of the nav and of each other`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== 'desktop', 'the sizes are set per test');
    test.setTimeout(limit(120_000));
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    try {
      const page = await context.newPage();
      await cluster(context, page, baseURL!, touch);
    } finally {
      await context.close();
    }
  });
}

async function cluster(context: BrowserContext, page: Page, baseURL: string, touch: boolean): Promise<void> {
  {
    await embed(context, baseURL, 25);
    const game = await openHost(page);
    await game.waitForSelector('html[data-screen="title"] .pl-home');
    await expect(game.locator('[data-testid="home-ranked"]')).toBeVisible({ timeout: limit(20_000) });
    await game.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'), null, { timeout: limit(10_000) });
    const boxes = await game.evaluate(() => {
      const r = (s: string) => {
        const b = document.querySelector(s)?.getBoundingClientRect();
        return b ? { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height } : null;
      };
      // a pill's face: its ::before, inset by --alt-pad on touch
      const face = (s: string) => {
        const e = document.querySelector(s);
        return e ? e.getBoundingClientRect().height - 2 * (parseFloat(getComputedStyle(e, '::before').top) || 0) : 0;
      };
      const pills = ['[data-testid="home-ranked"]', '[data-testid="home-practice"]', '[data-testid="home-party"]'];
      return { play: r('[data-testid="home-play"]'), ranked: r(pills[0]!), practice: r(pills[1]!), party: r(pills[2]!), nav: r('.hm-nav'), faces: pills.map(face).filter((x) => x > 0), vw: innerWidth, vh: innerHeight };
    });
    const overlap = (a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    // small pills: each face at most 0.4 of PLAY's height and still at least 28 px
    expect(boxes.faces.length).toBeGreaterThanOrEqual(2);
    for (const f of boxes.faces) {
      expect(f).toBeLessThanOrEqual(boxes.play!.h * 0.4);
      expect(f).toBeGreaterThanOrEqual(28);
    }
    for (const k of ['play', 'ranked', 'practice', 'party'] as const) {
      const b = boxes[k];
      if (!b) continue;
      // touch: 44 px targets; a mouse: at least 32 px tall
      expect(b.w, k).toBeGreaterThanOrEqual(44);
      expect(b.h, k).toBeGreaterThanOrEqual(touch ? 44 : 32);
      expect(b.l, k).toBeGreaterThanOrEqual(0);
      expect(b.t, k).toBeGreaterThanOrEqual(0);
      expect(b.r, k).toBeLessThanOrEqual(boxes.vw);
      expect(b.b, k).toBeLessThanOrEqual(boxes.vh);
      if (boxes.nav) expect(overlap(b, boxes.nav), `${k} vs nav`).toBe(false);
    }
    expect(overlap(boxes.ranked!, boxes.practice!)).toBe(false);
    expect(overlap(boxes.ranked!, boxes.play!)).toBe(false);
    expect(overlap(boxes.practice!, boxes.play!)).toBe(false);
    if (boxes.party) for (const k of ['ranked', 'practice', 'play'] as const) expect(overlap(boxes.party, boxes[k]!), `party vs ${k}`).toBe(false);
    // PLAY stays the big one
    expect(boxes.play!.h).toBeGreaterThan(boxes.ranked!.h);
    expect(await game.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await shot(page, `cluster`);
  }
}
