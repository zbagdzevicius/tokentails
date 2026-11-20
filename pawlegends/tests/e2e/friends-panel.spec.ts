import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost } from './host';
import { playFromHome } from './helpers';
import { limit } from '../unit/cpu-budget';

/*
 * Home's friends panel (founder Nov 20, the "top 1" concept; ui/home/friendsRail.ts). THE friends list on Home, always
 * on screen: a panel at the top right on desktop and tablet, a strip of avatar chips at the top on phones. No round
 * Friends, Settings or Sound button on Home (Settings and Sound are on the Profile screen; Settings also in a match's
 * pause menu). With 0, 3 and 12 friends at 1440x900, 1600x900, 844x390 and 667x375 the panel overlaps neither PLAY
 * and its pills, the champion, the nav, the profile, the currencies nor the nameplate; its buttons are 44 px targets.
 * A row opens the Player Card; + opens a party lobby and invites; add friend opens the add-friend sheet; Profile has
 * Settings and Sound. Placeholder names only. Screenshots: FR_SHOTS (default test-results/friends-panel).
 */
const SHOTS = process.env.FR_SHOTS ?? 'test-results/friends-panel';
mkdirSync(SHOTS, { recursive: true });

type Presence = Record<string, unknown> & { state: string };
const NOW = Date.now();
const fr = (name: string, hero: string, presence: Presence, rk?: number) => ({
  code: `PL-${name.toUpperCase().slice(0, 4).padEnd(4, 'X')}-${hero.slice(0, 4).toUpperCase().padEnd(4, 'Q')}`,
  name,
  presence,
  av: { i: `h:${hero}` },
  ...(rk !== undefined ? { rk } : {}),
});
const TWELVE = [
  fr('Whiskerwind', 'clem', { state: 'online' }, 10),
  fr('BiscuitBoss', 'brutus', { state: 'match', since: NOW - (12 * 60 + 40) * 1000, mode: 'casual' }, 4),
  fr('Mochi_7', 'sage', { state: 'online' }, 1),
  fr('NapQueen', 'nova', { state: 'offline', seen: NOW - 3 * 60_000 }),
  fr('Sockthief', 'marshmallow', { state: 'offline', seen: NOW - 3_600_000 }),
  fr('Pepper', 'nova', { state: 'online', away: true }),
  fr('Nori', 'marshmallow', { state: 'queue', since: NOW - 2 * 60_000 }),
  fr('Tofu', 'brutus', { state: 'match', since: NOW - 15 * 60_000 }),
  fr('Waffle', 'clem', { state: 'party', joinable: true, party: 'ABCD2345', size: 2, max: 3 }),
  fr('Pickle', 'sage', { state: 'offline', seen: NOW - 2 * 86_400_000 }),
  fr('Sprout', 'nova', { state: 'offline' }),
  fr('Toast', 'sage', { state: 'online' }),
];
const FIVE = TWELVE.slice(0, 5);
const FIXTURES = { 0: [], 5: FIVE, 12: TWELVE } as const;
const SIZES = [
  [1440, 900],
  [1600, 900],
  [844, 390],
  [667, 375],
] as const;

const me = { code: 'PL-7KQ2-M9XR', name: 'Player', invisible: false, allowRecent: true, ageBand: '18+', av: { i: 'h:nova' } };

async function home(browser: Browser, baseURL: string, w: number, h: number, friends: readonly unknown[], requests = 0): Promise<{ page: Page; game: Frame; calls: string[]; close(): Promise<void> }> {
  const touch = w < 1000;
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const calls: string[] = [];
  await context.exposeFunction('plApi', async (op: string) => {
    calls.push(op);
    if (op === 'social.get')
      return { status: 200, body: { me, friends, requests: { in: Array.from({ length: requests }, (_, i) => ({ code: `PL-REQ${i}-AAAA`, name: `Asker${i}` })), out: [] }, blocks: [], invites: [], rev: 'r1' } };
    if (op === 'social.pulse') return { status: 204 };
    if (op === 'history.list') return { status: 200, body: { rows: [], owner: { name: 'Whiskerwind' } } };
    return { status: 200, body: {} };
  });
  await mockHost(context, baseURL, {
    app: { isApp: false, store: true },
    signedIn: true,
    liveApi: true,
    viewport: true,
    profile: { v: 1, sessions: 3, matches: 12, wins: 6, firstWinDone: true, hero: 'brutus', trick: 'hiss', difficulty: 'easy', veteran: true, firstPlaySession: 1 },
  });
  const page = await context.newPage();
  const game = await openHost(page);
  return { page, game, calls, close: () => context.close() };
}

type Box = { x: number; y: number; width: number; height: number; sel?: string };
const overlaps = (a: Box, b: Box): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;

/** The panel's box and Home's other pieces. */
async function measure(game: Frame) {
  return game.evaluate(() => {
    const box = (el: Element, sel: string) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height, sel };
    };
    const rail = document.querySelector('.fr-rail')!;
    const panel = box(rail, 'panel');
    const others: { x: number; y: number; width: number; height: number; sel: string }[] = [];
    for (const sel of ['.hm-play', '.hm-alt', '.hm-nav', '.hm-profile', '.hm-cur', '.hm-plate', '.hm-left > *', '.hm-line'])
      for (const el of document.querySelectorAll(`.pl-home ${sel}`)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') others.push(box(el, sel));
      }
    const hero = (document.documentElement.dataset.posterHero ?? '').split(',').filter(Boolean).map(Number);
    if (hero.length === 4) others.push({ x: hero[0]!, y: hero[1]!, width: hero[2]! - hero[0]!, height: hero[3]! - hero[1]!, sel: 'champion' });
    const list = rail.querySelector('.fr-list')!.getBoundingClientRect();
    const targets = [...rail.querySelectorAll('button')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && getComputedStyle(b).display !== 'none' && (b.closest('.fr-head') || (r.bottom > list.top && r.top < list.bottom && r.right > list.left && r.left < list.right));
      })
      .map((b) => ({ w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height, label: b.getAttribute('aria-label') ?? '', main: b.classList.contains('fr-main') }));
    const ul = rail.querySelector<HTMLElement>('.fr-list')!;
    return {
      panel,
      others,
      targets,
      strip: rail.classList.contains('is-strip'),
      scrolls: ul.scrollHeight > ul.clientHeight + 2 || ul.scrollWidth > ul.clientWidth + 2,
      rows: [...rail.querySelectorAll('.fr-row')].filter((r) => {
        const b = r.getBoundingClientRect();
        return b.bottom <= list.bottom + 1 && b.right <= list.right + 1;
      }).length,
      hero: hero.length === 4,
    };
  });
}

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'sizes and touch are set per test'));

for (const [n, list] of Object.entries(FIXTURES)) {
  test(`friends panel with ${n} friends: always on Home, clear of PLAY, the champion and the HUD at every size`, async ({ browser, baseURL }) => {
    test.setTimeout(limit(400_000));
    const bad: string[] = [];
    for (const [w, h] of SIZES) {
      const { page, game, close } = await home(browser, baseURL!, w, h, list, n === '5' ? 2 : 0);
      try {
        const rail = game.locator('[data-testid="home-friends"]');
        await expect(rail).toBeVisible({ timeout: limit(60_000) });
        // founder Nov 20: no round Friends, Settings or Sound button on Home, and no sidebar
        await expect(game.locator('.pl-home [data-a="settings"], .pl-home [data-a="mute"], .pl-home [data-a="social"], .hm-corner, [data-testid="lobby-social"]')).toHaveCount(0);
        if (n === '0') await expect(game.locator('[data-testid="home-friends-empty"]')).toBeVisible();
        else await expect(game.locator('[data-testid="home-friends-count"]')).toHaveText(n === '5' ? '3/5' : '8/12');
        if (n === '5') await expect(game.locator('[data-testid="home-friends-requests"]')).toHaveText('2');
        await expect.poll(() => game.evaluate(() => !!document.documentElement.dataset.posterHero), { timeout: limit(20_000) }).toBe(true);
        await page.waitForTimeout(1500);
        const m = await measure(game);
        await page.screenshot({ path: join(SHOTS, `${w}x${h}-${n}-friends.png`) });
        const tag = `${w}x${h} ${n} friends`;
        if (!m.hero) bad.push(`${tag}: no champion box`);
        if (m.strip !== h <= 500) bad.push(`${tag}: strip ${m.strip}`);
        for (const o of m.others) if (overlaps(m.panel, o)) bad.push(`${tag}: panel overlaps ${o.sel} ${JSON.stringify([o.x, o.y, o.width, o.height].map(Math.round))} panel ${JSON.stringify([m.panel.x, m.panel.y, m.panel.width, m.panel.height].map(Math.round))}`);
        for (const t of m.targets) if (!t.main && (t.w < 28 - 0.5 || t.h < 28 - 0.5)) bad.push(`${tag}: target ${t.label} is ${t.w}x${t.h}`);
        if (!m.strip) for (const t of m.targets) if (!t.main && (t.w < 44 - 0.5 || t.h < 44 - 0.5)) bad.push(`${tag}: target ${t.label} is ${t.w}x${t.h}`);
        if (n === '12' && !m.scrolls) bad.push(`${tag}: 12 friends do not scroll inside the panel`);
        if (n === '12' && !m.strip && h >= 800 && m.rows < 5) bad.push(`${tag}: only ${m.rows} rows show`);
      } finally {
        await close();
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
}

test('friends panel: a row opens the Player Card, add opens the add-friend sheet, + opens a party lobby and invites', async ({ browser, baseURL }) => {
  test.setTimeout(limit(300_000));
  for (const [w, h] of [
    [1600, 900],
    [844, 390],
  ] as const) {
    const { page, game, calls, close } = await home(browser, baseURL!, w, h, FIVE, 1);
    try {
      await expect(game.locator('[data-testid="home-friend"]').first()).toBeVisible({ timeout: limit(60_000) });
      await expect(game.locator('[data-testid="home-friends"]')).toHaveAttribute('aria-label', 'Friends');
      await expect(game.locator('[data-testid="home-friend-invite"]').first()).toHaveAttribute('aria-label', 'Invite Mochi_7 to a party');
      await expect(game.locator('[data-testid="home-friend-noinvite"]').first()).toHaveAttribute('aria-label', "Can't invite BiscuitBoss: In a match");
      // a row: the Player Card (Profile, other-player mode)
      await game.locator('[data-testid="home-friend"] .fr-main').first().click();
      await expect(game.locator('[data-testid="profile-screen"][data-self="0"]')).toBeVisible({ timeout: limit(15_000) });
      await expect(game.locator('[data-testid="profile-message"]')).toBeVisible();
      await page.screenshot({ path: join(SHOTS, `${w}x${h}-card.png`) });
      await page.keyboard.press('Escape');
      await expect(game.locator('[data-testid="profile-screen"]')).toHaveCount(0, { timeout: limit(10_000) });
      // add friend: the add-friend sheet with the field and the request
      await game.locator('[data-testid="home-friends-add"]').click();
      await expect(game.locator('[data-testid="friends-sheet"]')).toBeVisible({ timeout: limit(15_000) });
      await expect(game.locator('[data-testid="social-add-input"]')).toBeVisible();
      await expect(game.locator('[data-testid="sheet-request-in"]')).toHaveCount(1);
      await page.screenshot({ path: join(SHOTS, `${w}x${h}-add-sheet.png`) });
      await page.keyboard.press('Escape');
      await expect(game.locator('[data-testid="friends-sheet"]')).toHaveCount(0, { timeout: limit(5_000) });
      // + on a free friend: a party lobby opens (the invite goes out once it is up)
      await game.locator('[data-testid="home-friend-invite"]').first().click();
      await expect(game.locator('.pl-party')).toBeVisible({ timeout: limit(15_000) });
      await page.screenshot({ path: join(SHOTS, `${w}x${h}-invite.png`) });
      expect(calls).toContain('social.get');
    } finally {
      await close();
    }
  }
});

test('Profile has Settings and Sound; Sound mutes and stays muted', async ({ browser, baseURL }) => {
  test.setTimeout(limit(240_000));
  for (const [w, h] of [
    [1440, 900],
    [667, 375],
  ] as const) {
    const { page, game, close } = await home(browser, baseURL!, w, h, FIVE);
    try {
      await game.locator('[data-a="profile"]').first().click({ timeout: limit(60_000) });
      await expect(game.locator('[data-testid="profile-screen"][data-self="1"]')).toBeVisible({ timeout: limit(15_000) });
      await expect(game.locator('[data-testid="profile-friends"]')).toHaveCount(0);
      const sound = game.locator('[data-testid="profile-sound"]');
      await expect(sound).toBeVisible();
      await expect(sound).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: join(SHOTS, `${w}x${h}-profile.png`) });
      await sound.click();
      await expect(game.locator('[data-testid="profile-sound"]')).toHaveAttribute('aria-pressed', 'false');
      // the mute is saved on the device (the same setter the old Home switch used)
      expect(await game.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}').muted)).toBe(true);
      await game.locator('[data-testid="profile-settings"]').click();
      await expect(game.locator('.pl-menu, [data-testid="settings"]').first()).toBeVisible({ timeout: limit(10_000) });
    } finally {
      await close();
    }
  }
});

test('in a match: Settings stays one tap away in the pause menu (Home has no Settings button)', async ({ page }) => {
  test.setTimeout(limit(180_000));
  await page.addInitScript(() =>
    localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true })),
  );
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await expect(page.locator('.pl-home [data-a="settings"], .pl-home [data-a="mute"]')).toHaveCount(0);
  await playFromHome(page);
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
  await page.keyboard.press('Escape');
  await expect(page.locator('.pl-menu')).toBeVisible();
  await page.locator('.pl-menu [data-a="settings"]').click();
  await expect(page.locator('.pl-settings')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'in-match-settings.png') });
});
