import { expect, test, type Frame, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ALL_CHAMPS, mockHost, openHost } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * The Profile screen (founder, Nov 18: one full-width, League of Legends style profile) at every target viewport, for a
 * guest, a new player, a veteran and another player's read-only profile (from a friend's row): every tab is checked for
 * horizontal scroll, overlapping cards, Home showing through, text under 13 px and controls under 44 px; Back, Escape and
 * the Android back (a synthetic Escape on the focused element, pawlegends-app/src/shell/back.ts) return to Home.
 * Screenshots go to PROFILE_SHOTS when set. Runs once (the desktop project); each case makes its own viewport.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop project only (each case sets its viewport)'));

const OUT = process.env.PROFILE_SHOTS ?? '';
if (OUT) mkdirSync(OUT, { recursive: true });
const SIZES: [string, number, number, boolean][] = [
  ['1440x900', 1440, 900, false],
  ['1920x1080', 1920, 1080, false],
  ['844x390', 844, 390, true],
  ['667x375', 667, 375, true],
  ['390x844', 390, 844, false],
];
const at = Date.now() - 3_600_000;
const rows = [
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', at, mode: 'ranked', map: 'crossing', mutator: null, difficulty: 'normal', outcome: 'won', seconds: 754, hero: 'sage', k: 7, d: 2, a: 9, grade: 'S', mvp: 'mvp' },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa2', at: at - 86_400_000, mode: 'blitz', map: 'crossing', mutator: 'blitz', difficulty: 'easy', outcome: 'lost', seconds: 420, hero: 'clem', k: 2, d: 5, a: 3, grade: 'B', mvp: null },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa3', at: at - 2 * 86_400_000, mode: 'pvp', map: 'crossing', mutator: null, difficulty: 'normal', outcome: 'won', seconds: 640, hero: 'duchess', k: 11, d: 3, a: 4, grade: 'A', mvp: null },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa4', at: at - 3 * 86_400_000, mode: 'classic', map: 'hearthwood', mutator: null, difficulty: 'normal', outcome: 'won', seconds: 940, hero: 'lambo', k: 3, d: 1, a: 15, grade: 'A', mvp: 'svp' },
];
const VET = { v: 1, sessions: 40, matches: 60, wins: 33, firstWinDone: true, hero: 'sage', side: 'cat', veteran: true, firstPlaySession: 1 };
const NEW = { v: 1, sessions: 1, matches: 0, wins: 0, firstWinDone: false, hero: 'sage', side: 'cat' };
const MASTERY = { sage: { m: 40, w: 26 }, lambo: { m: 22, w: 14 }, duchess: { m: 9, w: 5 }, clem: { m: 4, w: 1 } };
const SEASON = { id: 's1', xp: 2400, tier: 12, premium: 'none', skips: 0, claimed: [], endsAt: '2027-01-05T00:00:00.000Z' };

// vet: realistic store item ids (the bridge drops unknown ones); the Founder title is worn (social.get), so owned too
const VET_ITEMS = ['frame.store.goldpaw', 'title.store.goldpaw', 'coat.sage.store_silver_tabby', 'coat.pixel.store_moonwhisker'];
const seat = (slot: number, team: 0 | 1, hero: string, extra: Record<string, unknown> = {}) => ({
  slot, team, hero, name: null, bot: true, owner: false, level: 9, k: 3, d: 3, a: 4, damage: 8_200 + slot * 900, taken: 9_000 - slot * 500, tower: 1200, heal: 0, fish: 6_400, toys: 3, cs: 42, grade: 'A', ...extra,
});
const MATCH = {
  ...rows[0], slot: 0, winner: 0, mvpSlot: 0, svpSlot: 4, reason: 'core',
  players: [
    seat(0, 0, 'sage', { name: 'Witty Biscuit', bot: false, owner: true, level: 12, k: 7, d: 2, a: 9, grade: 'S' }),
    seat(1, 0, 'pixel', { name: 'Rex', bot: false, code: 'PL-BBBB-CCCC' }),
    seat(2, 0, 'lambo'),
    seat(3, 1, 'meatball'),
    seat(4, 1, 'brutus', { grade: 'S' }),
    seat(5, 1, 'chili'),
  ],
};
const PLAYER = { matches: 31, ranked: { placementsLeft: 0, placementsOf: 5, tierIdx: 7, tier: 'alley', label: 'Alley II · 40 / 100', points: 40, peak: 'Alley I' }, av: { i: 'h:pixel', f: 'frame.store.moonlit', t: 'title.store.moonlit' }, cc: 'LT' };

type Kind = 'guest' | 'new' | 'vet' | 'other' | 'fail';
function api(kind: Kind) {
  const name = kind === 'new' ? 'Quiet Pebble' : 'Witty Biscuit';
  return async (op: string, args: Record<string, unknown>): Promise<{ status: number; body?: unknown }> => {
    if (kind === 'guest') return { status: 0 };
    // signed in, every profile source down (social.get too): each card says it couldn't load
    if (kind === 'fail') return op === 'social.pulse' || op === 'social.inbox' ? { status: 204 } : { status: 503 };
    const vet = kind !== 'new';
    switch (op) {
      case 'name.get':
        return { status: 200, body: { name, nick: vet ? name : null, changes: vet ? 1 : 0, free: !vet, price: vet ? 1500 : 0, cost: 1500, cooldownDays: 7, nextAt: null, yarn: 922 } };
      case 'social.get':
        return {
          status: 200,
          body: {
            me: { code: 'PL-7KQ2-M9XR', name, invisible: false, allowRecent: true, ageBand: '18+', av: { i: 'h:sage', ...(vet ? { f: 'frame.store.goldpaw' } : {}) }, title: vet ? 'title.founder' : null, frame: vet ? 'frame.store.goldpaw' : null },
            friends: vet ? [{ code: 'PL-AAAA-AAAA', name: 'Mira', presence: { state: 'online' }, av: { i: 'h:pixel' }, cc: 'LT' }] : [],
            requests: { in: [], out: [] },
            blocks: [],
            invites: [],
            rev: 'r1',
          },
        };
      case 'social.pulse':
      case 'social.inbox':
        return { status: 204 };
      case 'ranked.me':
        return { status: 200, body: vet ? { ranked: { placementsLeft: 0, placementsOf: 5, tierIdx: 4, points: 42, peak: 'Alley III' } } : { ranked: { placementsLeft: 5, placementsOf: 5 } } };
      case 'history.list':
        if (args.code) return { status: 200, body: { owner: { name: args.code === 'PL-BBBB-CCCC' ? 'Rex' : 'Mira', self: false }, player: PLAYER, rows: rows.slice(0, 3).map((r) => ({ ...r, hero: r.hero === 'sage' ? 'pixel' : r.hero })), next: null, stats: { season: 's1', name: 'Season 1', matches: 31, wins: 19, winRate: 61, kda: 4.1, mvp: 8, favourites: [{ hero: 'pixel', matches: 15, wins: 10, winRate: 67 }, { hero: 'duchess', matches: 9, wins: 5, winRate: 56 }] } } };
        return {
          status: 200,
          body: vet
            ? { owner: { name, self: true }, rows, next: null, stats: { season: 's1', name: 'Season 1', matches: 24, wins: 14, winRate: 58, kda: 3.4, mvp: 5, favourites: [{ hero: 'sage', matches: 12, wins: 8, winRate: 67 }, { hero: 'lambo', matches: 7, wins: 5, winRate: 71 }, { hero: 'clem', matches: 5, wins: 1, winRate: 20 }] } }
            : { owner: { name, self: true }, rows: [], next: null, stats: { season: 's1', name: 'Season 1', matches: 0, wins: 0, winRate: null, kda: 0, mvp: 0, favourites: [] } },
        };
      case 'history.match':
        return { status: 200, body: MATCH };
      case 'club.get':
        return { status: 200, body: { club: vet ? { code: 'C1', name: 'Night Owls', size: 4, cap: 30, owner: false, thread: 't', tier: 'text', members: [], chest: {} } : null, kudos: { month: '2026-11', endsAt: '2026-12-01T00:00:00.000Z', n: vet ? 7 : 0, tiers: [5, 15, 30], paid: vet ? [5] : [], got: [], next: { id: 'x', name: 'Yarn' } } } };
      case 'friend.add':
        return { status: 201, body: { state: 'sent' } };
      case 'block.add':
        return { status: 200, body: {} };
      case 'flag.get':
        return { status: 200, body: { cc: 'LT', hidden: false } };
      default:
        return { status: 0 };
    }
  };
}

const notchIt = (game: Frame) =>
  game.evaluate(() => {
    const r = document.documentElement.style;
    r.setProperty('--safe-l', '47px');
    r.setProperty('--safe-r', '47px');
    r.setProperty('--safe-b', '21px');
  });

/** Layout problems on the open Profile screen: page scroll, overlapping cards, Home on top, small text and targets. */
async function audit(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const out: string[] = [];
    const W = innerWidth;
    const H = innerHeight;
    const se = document.scrollingElement!;
    if (se.scrollWidth > W + 1) out.push(`page scrolls sideways: ${se.scrollWidth} > ${W}`);
    const scr = document.querySelector<HTMLElement>('[data-testid="profile-screen"]');
    if (!scr) return ['no screen'];
    const r = scr.getBoundingClientRect();
    if (r.left > 0.5 || r.top > 0.5 || r.right < W - 0.5 || r.bottom < H - 0.5) out.push(`screen not full: ${JSON.stringify(r)}`);
    // Home never shows through or over it
    for (const [x, y] of [[8, 8], [W - 8, 8], [W / 2, H / 2], [8, H - 8], [W - 8, H - 8]]) {
      const el = document.elementFromPoint(x, y);
      if (el && !scr.contains(el)) out.push(`(${x},${y}) hits ${el.className || el.tagName}`);
    }
    const vis = (el: Element): DOMRect | null => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' ? b : null;
    };
    // the frame's three bands never overlap
    const bands = ['.cst-top', '.pfx-main', '.cst-tabs'].map((s) => scr.querySelector(s)).map((e) => (e ? vis(e) : null));
    for (let i = 0; i < bands.length - 1; i++) {
      const a = bands[i];
      const b = bands[i + 1];
      if (a && b && a.bottom > b.top + 1) out.push(`band ${i} overlaps band ${i + 1}: ${a.bottom} > ${b.top}`);
    }
    // the open tab shows in the tab bar
    const on = scr.querySelector('.cst-tab.on');
    const ob = on ? vis(on) : null;
    if (!ob || ob.left < -1 || ob.right > W + 1) out.push(`open tab not in view: ${ob ? `${ob.left}..${ob.right}` : 'none'}`);
    // cards, the banner and the tiles never overlap each other
    const boxes = [...scr.querySelectorAll('.pfx-card, .pfx-who, .pfx-ccard, .pfx-ctile, .pfx-mrowi, .pfx-item, .pfx-rec, .pfx-zero, .pfx-filter')].map((e) => ({ e, b: vis(e) })).filter((x) => x.b) as { e: Element; b: DOMRect }[];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].b;
        const b = boxes[j].b;
        if (boxes[i].e.contains(boxes[j].e) || boxes[j].e.contains(boxes[i].e)) continue;
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 1 && iy > 1) out.push(`overlap: ${boxes[i].e.className} / ${boxes[j].e.className}`);
      }
    // nothing sticks out of the screen sideways
    for (const el of scr.querySelectorAll('.pfx-card, .pfx-who, .cst-back, .cst-wallet, .pfx-ctile, .pfx-item')) {
      const b = vis(el);
      if (b && (b.left < -1 || b.right > W + 1)) out.push(`off screen: ${el.className} ${b.left}..${b.right}`);
    }
    // text 13 px or more, controls 44 px or more (in the visible screen, not the hidden tab bar overflow)
    const walker = document.createTreeWalker(scr, NodeFilter.SHOW_TEXT);
    const small = new Set<string>();
    while (walker.nextNode()) {
      const t = walker.currentNode as Text;
      if (!t.data.trim()) continue;
      const p = t.parentElement!;
      if (!vis(p)) continue;
      const fs = parseFloat(getComputedStyle(p).fontSize);
      if (fs < 12.9) small.add(`${p.className || p.tagName}:${fs}px "${t.data.trim().slice(0, 20)}"`);
    }
    for (const s of small) out.push(`small text ${s}`);
    for (const el of scr.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input[type="checkbox"]')) {
      const b = vis(el.matches('input') ? el.closest('label') ?? el : el);
      if (!b) continue;
      if (b.height < 43.5 && b.width < 43.5) out.push(`small target ${el.className || el.tagName} ${Math.round(b.width)}x${Math.round(b.height)}`);
      else if (Math.min(b.height, b.width) < 43.5 && !el.matches('.pfx-mtile, .pfx-mrowi, .pfx-ctile, .pfx-item')) out.push(`thin target ${el.className || el.tagName} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return out;
  });
}

async function shot(page: Page, name: string): Promise<void> {
  if (!OUT) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

for (const kind of ['guest', 'new', 'vet', 'other', 'fail'] as Kind[])
  for (const [vp, w, h, notch] of kind === 'fail' ? SIZES.filter((x) => x[0] === '1440x900' || x[0] === '844x390') : SIZES)
    test(`profile screen: ${kind} at ${vp}`, async ({ browser, baseURL }) => {
      test.setTimeout(limit(150_000));
      // 390x844: a narrow desktop or tablet window (a phone held upright shows the turn-sideways gate)
      const phone = w < 1000 && h < w;
      const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
      try {
        await context.exposeFunction('plApi', api(kind));
        if (kind === 'vet') await context.addInitScript((m) => {
          try {
            localStorage.setItem('tt.pawlegends.mastery.v1', JSON.stringify(m));
          } catch {
            /* the host page's origin may refuse */
          }
        }, MASTERY);
        const page = await context.newPage();
        await mockHost(context, baseURL!, {
          app: { isApp: false, store: true },
        viewport: true,
          signedIn: kind !== 'guest',
          liveApi: true,
          profile: kind === 'new' || kind === 'guest' ? NEW : VET,
          champState: { ...ALL_CHAMPS, yarn: { balance: 922, matches: 20, picksLeft: 0, nextPickAt: null } },
          store: { items: kind === 'vet' ? VET_ITEMS : [], season: kind === 'vet' ? SEASON : null },
        } as never);
        const game = await openHost(page);
        if (notch) await notchIt(game);
        const tag = `${kind}-${vp}`;
        const screen = game.locator('[data-testid="profile-screen"]');
        if (kind === 'other') {
          await game.locator('[data-testid="lobby-social"]').first().click({ timeout: limit(60_000) });
          // the friends list: a row opens its menu, Match history opens their profile
          await game.locator('.pl-social .pl-fr-main').first().click({ timeout: limit(10_000) });
          await game.locator('.pl-fr-menu [data-a="history"]').first().click({ timeout: limit(10_000) });
          await expect(screen).toHaveAttribute('data-self', '0');
          // a friend's row opens their profile on Matches
          await expect(screen).toHaveAttribute('data-tab', 'matches');
          await screen.locator('[data-testid="profile-tab-overview"]').click();
          await expect(screen.locator('[data-testid="profile-name"]')).toHaveText('Mira');
        } else {
          await game.locator('[data-testid="home-profile"]').first().click({ timeout: limit(60_000) });
          await expect(screen).toBeVisible();
        }
        // the data settled (no skeletons)
        await expect(screen.locator('.pfx-skel')).toHaveCount(0, { timeout: limit(10_000) });
        const tabs = await screen.locator('.cst-tab').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tab!));
        if (kind === 'other') expect(tabs).toEqual(['overview', 'matches', 'champions', 'stats']);
        else expect(tabs).toEqual(['overview', 'matches', 'champions', 'stats', 'collection', 'account']);
        const problems: string[] = [];
        for (const t of tabs) {
          await screen.locator(`[data-testid="profile-tab-${t}"]`).click();
          await expect(screen).toHaveAttribute('data-tab', t);
          problems.push(...(await audit(game)).map((p) => `${t}: ${p}`));
          await shot(page, `${tag}-${t}`);
        }
        if (kind === 'fail') {
          await screen.locator('[data-testid="profile-tab-overview"]').click();
          // failures never read as an empty state, and a signed-in player is never "Guest"
          await expect(screen.locator('[data-testid="profile-name"]')).not.toHaveText('Guest');
          await expect(screen.locator('.pfx-rank')).toContainText("Couldn't load");
          await expect(screen.locator('.pfx-rank')).not.toContainText('Unranked');
          await expect(screen.locator('.pfx-recent')).not.toContainText('No matches yet');
          await expect(screen.locator('[data-testid="profile-failed"]').first()).toBeVisible();
          await shot(page, `${tag}-failed`);
        }
        if (kind === 'other') {
          await screen.locator('[data-testid="profile-tab-overview"]').click();
          await expect(screen.locator('[data-testid="profile-rank"]')).toHaveText('Alley II');
          await expect(screen.locator('[data-testid="profile-peak"]')).toHaveText('Best: Alley I');
          await expect(screen.locator('[data-testid="profile-level"]')).toBeVisible();
          await expect(screen.locator('[data-testid="profile-flag-shown"]')).toBeVisible();
          await expect(screen.locator('[data-testid="profile-title"]')).toHaveText('Night Prowler');
          await expect(screen.locator('[data-testid="profile-message"]')).toBeVisible();
          // Match history once: the Matches tab (the card's link goes there), no banner button
          await expect(screen.locator('[data-testid="profile-history"]')).toHaveCount(0);
          await screen.locator('[data-testid="open-history"]').click();
          await expect(screen).toHaveAttribute('data-tab', 'matches');
          await expect(screen.locator('[data-testid="profile-match-list"] [data-a="match"]')).toHaveCount(3);
          await expect(screen.locator('[data-testid="profile-recordings"]')).toHaveCount(0);
        }
        if (kind === 'new') {
          // Stats: one empty state with one action, not empty cards
          await screen.locator('[data-testid="profile-tab-stats"]').click();
          await expect(screen.locator('[data-testid="profile-stats-empty"]')).toBeVisible();
          await expect(screen.locator('.pfx-sgrid')).toHaveCount(0);
          await expect(screen.locator('[data-testid="profile-play-first"]')).toBeVisible();
        }
        if (kind === 'vet') {
          // Collection agrees with Overview: the counts are the owned items (Founder is worn, so owned)
          await screen.locator('[data-testid="profile-tab-collection"]').click();
          await expect(screen.locator('[data-testid="profile-count-titles"] b')).toHaveText(/^2 \//);
          await expect(screen.locator('[data-testid="profile-count-coats"] b')).toHaveText(/^2 \//);
          await expect(screen.locator('[data-testid="profile-count-frames"] b')).toHaveText(/^1 \//);
          await screen.locator('[data-testid="profile-count-titles"]').click();
          await expect(screen.locator('[data-a="wear"][data-id="title.founder"]')).toHaveAttribute('aria-pressed', 'true');
          // keyboard: one Tab stop in the tab bar; arrows move between tabs
          await screen.locator('[data-testid="profile-tab-collection"]').focus();
          await page.keyboard.press('ArrowRight');
          await expect(screen).toHaveAttribute('data-tab', 'account');
          await page.keyboard.press('Home');
          await expect(screen).toHaveAttribute('data-tab', 'overview');
          await expect(screen.locator('.cst-tab[tabindex="0"]')).toHaveCount(1);
          await expect(screen.locator('[data-testid="profile-rank"]')).toHaveText('Tabby II');
          await expect(screen.locator('[data-testid="profile-peak"]')).toHaveText('Best: Alley III');
          // honor and the ladder fill the Overview
          await expect(screen.locator('[data-testid="profile-kudos"]')).toHaveText('7');
          await expect(screen.locator('.pfx-ladder [aria-current="true"]')).toContainText('Tabby');
          // the account lives here: no second Account chip on Home once signed in
          await expect(game.locator('[data-testid="account-chip"]')).toHaveCount(0);
          // Matches: the history inline; a row opens that match inside the screen (LoL), Escape comes back to the list
          await screen.locator('[data-testid="profile-tab-matches"]').click();
          await expect(screen.locator('[data-testid="profile-match-list"] [data-a="match"]')).toHaveCount(4);
          await screen.locator('[data-testid="profile-match-list"] [data-a="match"]').first().click();
          await expect(game.locator('[data-testid="match-history"]')).toHaveCount(0);
          await expect(screen.locator('[data-testid="history-match"]')).toBeVisible();
          await expect(screen.locator('.pfx-skel')).toHaveCount(0, { timeout: limit(10_000) });
          await shot(page, `${tag}-match-detail`);
          const dprob = await audit(game);
          expect(dprob, dprob.join('\n')).toEqual([]);
          await page.keyboard.press('Escape');
          await expect(screen.locator('[data-testid="history-match"]')).toHaveCount(0);
          await expect(screen).toHaveAttribute('data-tab', 'matches');
          await expect(screen.locator('[data-testid="profile-match-list"]')).toBeVisible();
          await screen.locator('[data-testid="profile-tab-overview"]').click();
          await screen.locator('[data-testid="profile-edit"]').click();
          await expect(screen.locator('[data-testid="profile-editor"]')).toBeVisible();
          await shot(page, `${tag}-edit`);
          // Escape closes the editor first
          await page.keyboard.press('Escape');
          await expect(screen.locator('[data-testid="profile-editor"]')).toHaveCount(0);
        }
        if (kind === 'guest') {
          await screen.locator('[data-testid="profile-tab-overview"]').click();
          await expect(screen.locator('[data-testid="profile-signin"]')).toBeVisible();
        }
        expect(problems, problems.join('\n')).toEqual([]);
        // the ways back to Home: Back, Escape, the Android back (a synthetic Escape on the focused element)
        const home = game.locator('[data-testid="home-profile"]');
        const reopen = async (): Promise<void> => {
          if (kind === 'other') {
            await game.locator('[data-testid="lobby-social"]').first().click();
            await game.locator('.pl-social .pl-fr-main').first().click();
            await game.locator('.pl-fr-menu [data-a="history"]').first().click();
          } else await home.first().click();
          await expect(screen).toBeVisible();
        };
        await screen.locator('[data-testid="profile-back"]').click();
        await expect(screen).toHaveCount(0);
        await expect(home.first()).toBeVisible();
        await reopen();
        await page.keyboard.press('Escape');
        await expect(screen).toHaveCount(0);
        await reopen();
        await game.evaluate(() => {
          const t = (document.activeElement as HTMLElement | null) ?? document.body;
          t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
          t.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        });
        await expect(screen).toHaveCount(0);
        await expect(home.first()).toBeVisible();
        // one overlay at a time: the Store does not open beside it
        await reopen();
        await expect(game.locator('.pl-store')).toHaveCount(0);
      } finally {
        await context.close();
      }
    });

// a player in a match's detail opens their profile (the same screen, read-only)
for (const [vp, w, h] of [SIZES[0], SIZES[2]])
  test(`profile screen: a player from match history at ${vp}`, async ({ browser, baseURL }) => {
    test.setTimeout(limit(150_000));
    const phone = w < 1000 && h < w;
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
    try {
      await context.exposeFunction('plApi', api('vet'));
      const page = await context.newPage();
      await mockHost(context, baseURL!, {
        app: { isApp: false, store: true },
        viewport: true,
        signedIn: true,
        liveApi: true,
        profile: VET,
        champState: { ...ALL_CHAMPS, yarn: { balance: 922, matches: 20, picksLeft: 0, nextPickAt: null } },
        store: { items: VET_ITEMS, season: SEASON },
      } as never);
      const game = await openHost(page);
      await game.locator('[data-testid="home-profile"]').first().click({ timeout: limit(60_000) });
      const screen = game.locator('[data-testid="profile-screen"]');
      await screen.locator('[data-testid="open-history"]').click();
      await screen.locator('[data-testid="profile-match-list"] [data-a="match"]').first().click();
      await expect(screen.locator('[data-testid="history-match"]')).toBeVisible();
      await screen.locator('.mh-pbtn[data-profile="PL-BBBB-CCCC"]').click();
      await expect(screen).toHaveAttribute('data-self', '0');
      await expect(screen.locator('[data-testid="profile-name"]')).toHaveText('Rex');
      await expect(screen.locator('.pfx-skel')).toHaveCount(0, { timeout: limit(10_000) });
      // not a friend: Add friend and Block (asked once); no Message or Invite; Match history only once (its tab)
      await expect(screen.locator('[data-testid="profile-message"]')).toHaveCount(0);
      await expect(screen.locator('[data-testid="profile-history"]')).toHaveCount(0);
      await expect(screen.locator('[data-testid="profile-add-friend"]')).toBeVisible();
      const problems = await audit(game);
      expect(problems, problems.join('\n')).toEqual([]);
      await shot(page, `from-history-${vp}`);
      await screen.locator('[data-testid="profile-add-friend"]').click();
      await expect(screen.locator('[data-testid="profile-request-sent"]')).toBeVisible();
      await screen.locator('[data-testid="profile-block"]').click();
      await expect(screen.locator('[data-testid="profile-block-yes"]')).toBeVisible();
      await shot(page, `from-history-${vp}-block`);
      expect((await audit(game)).filter((p) => !p.includes('pfx-ask'))).toEqual([]);
      await screen.locator('[data-testid="profile-block-yes"]').click();
      await expect(screen.locator('[data-testid="profile-blocked"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(screen).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
