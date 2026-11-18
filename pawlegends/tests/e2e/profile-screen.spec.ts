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

type Kind = 'guest' | 'new' | 'vet' | 'other';
function api(kind: Kind) {
  const name = kind === 'new' ? 'Quiet Pebble' : 'Witty Biscuit';
  return async (op: string, args: Record<string, unknown>): Promise<{ status: number; body?: unknown }> => {
    if (kind === 'guest') return { status: 0 };
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
        if (args.code) return { status: 200, body: { owner: { name: 'Mira', self: false }, rows: rows.slice(0, 3).map((r) => ({ ...r, hero: r.hero === 'sage' ? 'pixel' : r.hero })), next: null, stats: { season: 's1', name: 'Season 1', matches: 31, wins: 19, winRate: 61, kda: 4.1, mvp: 8, favourites: [{ hero: 'pixel', matches: 15, wins: 10, winRate: 67 }, { hero: 'duchess', matches: 9, wins: 5, winRate: 56 }] } } };
        return {
          status: 200,
          body: vet
            ? { owner: { name, self: true }, rows, next: null, stats: { season: 's1', name: 'Season 1', matches: 24, wins: 14, winRate: 58, kda: 3.4, mvp: 5, favourites: [{ hero: 'sage', matches: 12, wins: 8, winRate: 67 }, { hero: 'lambo', matches: 7, wins: 5, winRate: 71 }, { hero: 'clem', matches: 5, wins: 1, winRate: 20 }] } }
            : { owner: { name, self: true }, rows: [], next: null, stats: { season: 's1', name: 'Season 1', matches: 0, wins: 0, winRate: null, kda: 0, mvp: 0, favourites: [] } },
        };
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
    const boxes = [...scr.querySelectorAll('.pfx-card, .pfx-banner, .pfx-ccard, .pfx-ctile, .pfx-mrowi')].map((e) => ({ e, b: vis(e) })).filter((x) => x.b) as { e: Element; b: DOMRect }[];
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
    for (const el of scr.querySelectorAll('.pfx-card, .pfx-banner, .cst-back, .cst-wallet, .pfx-ctile')) {
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
      else if (Math.min(b.height, b.width) < 43.5 && !el.matches('.pfx-mtile, .pfx-mrowi, .pfx-ctile')) out.push(`thin target ${el.className || el.tagName} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return out;
  });
}

async function shot(page: Page, name: string): Promise<void> {
  if (!OUT) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

for (const kind of ['guest', 'new', 'vet', 'other'] as Kind[])
  for (const [vp, w, h, notch] of SIZES)
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
          signedIn: kind !== 'guest',
          liveApi: true,
          profile: kind === 'new' || kind === 'guest' ? NEW : VET,
          champState: { ...ALL_CHAMPS, yarn: { balance: 922, matches: 20, picksLeft: 0, nextPickAt: null } },
          store: { items: kind === 'vet' ? ['title.founder', 'frame.store.goldpaw', 'coat.sage.moon'] : [], season: kind === 'vet' ? SEASON : null },
        } as never);
        const game = await openHost(page);
        if (notch) await notchIt(game);
        const tag = `${kind}-${vp}`;
        const screen = game.locator('[data-testid="profile-screen"]');
        if (kind === 'other') {
          await game.locator('[data-testid="lobby-social"]').first().click({ timeout: limit(60_000) });
          await game.locator('.pl-social-hist').first().click({ timeout: limit(10_000) });
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
        if (kind === 'vet') {
          await screen.locator('[data-testid="profile-tab-overview"]').click();
          await expect(screen.locator('[data-testid="profile-rank"]')).toHaveText('Tabby II');
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
            await game.locator('.pl-social-hist').first().click();
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
