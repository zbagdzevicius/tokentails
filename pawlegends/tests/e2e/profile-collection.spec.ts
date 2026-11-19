import { expect, test, type Frame, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mockHost, openHost } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * Profile, founder round Nov 19: Matches lists every match (no mode chips); Champions puts the owned ones first and a
 * card opens a sheet with Select (Home's main champion) and Abilities & lore; the Collection shows one kind at a time
 * behind a segmented control with the counts, wears owned items with a tap and says where a locked one comes from; a
 * Treat Track title ("Raspberry's Pal", a profile unlock, not an entitlement) is owned in the Collection and Edit
 * profile alike. Screenshots go to PROFILE_SHOTS when set. Desktop project only; each case sets its viewport.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop project only (each case sets its viewport)'));

const OUT = process.env.PROFILE_SHOTS ?? '';
if (OUT) mkdirSync(OUT, { recursive: true });
const PROFILE = { v: 1, sessions: 40, matches: 60, wins: 33, firstWinDone: true, hero: 'sage', side: 'cat', veteran: true, firstPlaySession: 1, unlocks: ['title.champ.aviete', 'frame.champ.lambo'], wornTitle: 'title.champ.aviete' };
const OWNED = ['sage', 'pixel', 'lambo', 'nova', 'ranger'];
const CHAMPS = { owned: OWNED.map((hero) => ({ hero, source: 'purchase' })), founders: false, rotation: { week: 0 }, yarn: { balance: 922, matches: 20, picksLeft: 0, nextPickAt: null }, bundles: [] };
const at = Date.now() - 3_600_000;
const rows = [
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', at, mode: 'ranked', map: 'crossing', mutator: null, difficulty: 'normal', outcome: 'won', seconds: 754, hero: 'sage', k: 7, d: 2, a: 9, grade: 'S', mvp: 'mvp' },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa2', at: at - 86_400_000, mode: 'blitz', map: 'crossing', mutator: 'blitz', difficulty: 'easy', outcome: 'lost', seconds: 420, hero: 'clem', k: 2, d: 5, a: 3, grade: 'B', mvp: null },
];

function api() {
  let me: { av: unknown; title: string | null; frame: string | null } = { av: { i: 'h:sage' }, title: null, frame: null };
  return async (op: string, args: Record<string, unknown>): Promise<{ status: number; body?: unknown }> => {
    switch (op) {
      case 'name.get':
        return { status: 200, body: { name: 'Zygis', nick: 'Zygis', changes: 1, free: false, price: 1500, cost: 1500, cooldownDays: 7, nextAt: null, yarn: 922 } };
      case 'social.get':
        return { status: 200, body: { me: { code: 'PL-7KQ2-M9XR', name: 'Zygis', ...me }, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r1' } };
      case 'social.me':
        me = { av: args.avatarRef ? { i: `h:${String(args.avatarRef)}` } : me.av, title: args.title !== undefined ? (args.title === 'none' ? null : String(args.title)) : me.title, frame: args.frame !== undefined ? (args.frame === 'none' ? null : String(args.frame)) : me.frame };
        return { status: 200, body: { me } };
      case 'history.list':
        return { status: 200, body: { owner: { name: 'Zygis', self: true }, rows, next: null, stats: { season: 's1', name: 'Season 1', matches: 24, wins: 14, winRate: 58, kda: 3.4, mvp: 5, favourites: [{ hero: 'sage', matches: 12, wins: 8, winRate: 67 }] } } };
      case 'ranked.me':
        return { status: 200, body: { ranked: { placementsLeft: 5, placementsOf: 5 } } };
      case 'club.get':
        return { status: 200, body: { club: null, kudos: { month: '2026-11', endsAt: '2026-12-01T00:00:00.000Z', n: 0, tiers: [5, 15, 30], paid: [], got: [], next: null } } };
      default:
        return { status: op === 'social.pulse' || op === 'social.inbox' ? 204 : 0 };
    }
  };
}

/** Page scroll sideways, controls under 44 px, text under 13 px inside the screen. */
const audit = (game: Frame): Promise<string[]> =>
  game.evaluate(() => {
    const out: string[] = [];
    if (document.scrollingElement!.scrollWidth > innerWidth + 1) out.push('page scrolls sideways');
    const scr = document.querySelector('[data-testid="profile-screen"]')!;
    for (const el of scr.querySelectorAll<HTMLElement>('.pfx-segb, .pfx-ccard, .pfx-item, .pfx-wear, [data-testid="profile-sheet"] .pl-btn')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.height && (b.height < 43.5 || b.width < 43.5)) out.push(`small target ${el.className} ${b.width}x${b.height}`);
    }
    for (const el of scr.querySelectorAll<HTMLElement>('.pfx-main small, .pfx-main b, .pfx-sheet small')) {
      const b = el.getBoundingClientRect();
      if (b.width && parseFloat(getComputedStyle(el).fontSize) < 13) out.push(`small text ${el.className || el.tagName} "${el.textContent}"`);
    }
    return out;
  });

async function shot(page: Page, name: string): Promise<void> {
  if (!OUT) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

for (const [vp, w, h, notch] of [['1440x900', 1440, 900, false], ['844x390', 844, 390, true]] as const)
  test(`profile: matches, champions, collection and the Treat Track title at ${vp}`, async ({ browser, baseURL }) => {
    test.setTimeout(limit(150_000));
    const phone = w < 1000;
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
    try {
      await context.exposeFunction('plApi', api());
      await context.addInitScript(() => {
        try {
          localStorage.setItem('tt.pawlegends.mastery.v1', JSON.stringify({ sage: { m: 40, w: 26 }, nova: { m: 5, w: 2 } }));
        } catch {
          /* the host page's origin may refuse */
        }
      });
      const page = await context.newPage();
      await mockHost(context, baseURL!, { app: { isApp: false, store: true }, viewport: true, signedIn: true, liveApi: true, profile: PROFILE, champState: CHAMPS, store: { items: ['frame.store.goldpaw', 'title.store.goldpaw'], season: null } } as never);
      const game = await openHost(page);
      if (notch)
        await game.evaluate(() => {
          const r = document.documentElement.style;
          r.setProperty('--safe-l', '47px');
          r.setProperty('--safe-r', '47px');
          r.setProperty('--safe-b', '21px');
        });
      await game.locator('[data-testid="home-profile"]').first().click({ timeout: limit(60_000) });
      const screen = game.locator('[data-testid="profile-screen"]');
      await expect(screen.locator('.pfx-skel')).toHaveCount(0, { timeout: limit(10_000) });
      const problems: string[] = [];

      // Matches: every match, no mode chips
      await screen.locator('[data-testid="profile-tab-matches"]').click();
      await expect(screen.locator('[data-testid="profile-match-list"] [data-a="match"]')).toHaveCount(2);
      await expect(screen.locator('[data-a="filter"], .pfx-filters')).toHaveCount(0);
      problems.push(...(await audit(game)).map((p) => `matches: ${p}`));
      await shot(page, `after-${vp}-matches`);

      // Champions: owned first (starters too), the main champion marked; Select makes another one the main
      await screen.locator('[data-testid="profile-tab-champions"]').click();
      const cards = screen.locator('[data-testid="profile-champ-grid"] [data-a="champ"]');
      const owned = await cards.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.owned));
      const firstLocked = owned.indexOf('0');
      expect(firstLocked).toBeGreaterThanOrEqual(OWNED.length);
      expect(owned.slice(firstLocked).every((x) => x === '0')).toBe(true);
      await expect(screen.locator('.pfx-ccard.main')).toHaveAttribute('data-hero', 'sage');
      problems.push(...(await audit(game)).map((p) => `champions: ${p}`));
      await shot(page, `after-${vp}-champions`);
      await screen.locator('[data-a="champ"][data-hero="nova"]').click();
      await expect(screen.locator('[data-testid="profile-sheet"]')).toContainText('Nova');
      await expect(screen.locator('[data-testid="profile-champ-lore"]')).toBeVisible();
      problems.push(...(await audit(game)).map((p) => `champion sheet: ${p}`));
      await shot(page, `after-${vp}-champion-sheet`);
      await screen.locator('[data-testid="profile-champ-select"]').click();
      await expect(screen.locator('[data-testid="profile-sheet"]')).toHaveCount(0);
      await expect(screen.locator('.pfx-ccard.main')).toHaveAttribute('data-hero', 'nova');
      // the same setting Home's champion uses
      expect(await game.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}').hero)).toBe('nova');

      // Collection: one kind at a time; the Treat Track title is owned and wearable
      await screen.locator('[data-testid="profile-tab-collection"]').click();
      await expect(screen.locator('[data-testid="profile-count-icons"]')).toHaveAttribute('aria-selected', 'true');
      await expect(screen.locator('[data-testid="profile-count-titles"] b')).toHaveText(/^2 \//);
      problems.push(...(await audit(game)).map((p) => `collection: ${p}`));
      await shot(page, `after-${vp}-collection`);
      await screen.locator('[data-testid="profile-count-titles"]').click();
      const pal = screen.locator('[data-a="wear"][data-id="title.champ.aviete"]');
      await expect(pal).toContainText("Raspberry's Pal");
      await pal.click();
      await expect(pal).toHaveAttribute('aria-pressed', 'true');
      await shot(page, `after-${vp}-collection-titles`);
      await screen.locator('[data-testid="profile-count-frames"]').click();
      await expect(screen.locator('[data-a="wear"][data-id="frame.champ.lambo"]')).toBeVisible();
      await shot(page, `after-${vp}-collection-borders`);
      await screen.locator('[data-a="locked"][data-id="frame.store.moonlit"]').click();
      await expect(screen.locator('[data-testid="profile-lock-where"]')).toHaveText('Get it in the Store.');
      problems.push(...(await audit(game)).map((p) => `locked sheet: ${p}`));
      await shot(page, `after-${vp}-locked-sheet`);
      await page.keyboard.press('Escape');
      await expect(screen.locator('[data-testid="profile-sheet"]')).toHaveCount(0);
      await screen.locator('[data-testid="profile-count-coats"]').click();
      await expect(screen.locator('.pfx-cgroup').first()).toBeVisible();
      problems.push(...(await audit(game)).map((p) => `coats: ${p}`));
      await shot(page, `after-${vp}-collection-coats`);

      // Edit profile lists the same titles
      await screen.locator('[data-testid="profile-tab-overview"]').click();
      await screen.locator('[data-testid="profile-edit"]').click();
      await expect(screen.locator('[data-testid="profile-titles"]')).toContainText("Raspberry's Pal");
      await expect(screen.locator('[data-a="pick-title"][data-id="title.champ.aviete"]')).toHaveAttribute('aria-pressed', 'true');
      await shot(page, `after-${vp}-edit`);
      expect(problems, problems.join('\n')).toEqual([]);
    } finally {
      await context.close();
    }
  });
