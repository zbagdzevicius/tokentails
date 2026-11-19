import { expect, test, type Frame } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ALL_CHAMPS, mockHost, openHost } from './host';
import { limit } from '../unit/cpu-budget';
import { SIM_VERSION } from '../../src/sim/version';

/*
 * Profile → Matches rows (Nov 19, founder: "show more stats than that"): every row shows the portrait with its level,
 * the real queue name (an Arcade match by its own mode), the map, K / D / A with the ratio, grade and MVP / ACE, CS,
 * Fish, damage with its bar, kill participation, team score, Toys, the party, length and when. Older rows without the
 * stats line show no zeros. At phone landscape 844x390 / 667x375, a narrow window 390x844 and desktop 1440x900: text
 * 14 px and up in the rows, nothing clipped, no sideways scroll; the Recordings card's best moment is shown in full.
 * Screenshots go to MATCHROWS_SHOTS when set.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop project only (each case sets its viewport)'));

const OUT = process.env.MATCHROWS_SHOTS ?? '';
if (OUT) mkdirSync(OUT, { recursive: true });
const SIZES: [string, number, number][] = [
  ['1440x900', 1440, 900],
  ['844x390', 844, 390],
  ['667x375', 667, 375],
  ['390x844', 390, 844],
];
const at = Date.now() - 3 * 3_600_000;
const ROWS = [
  { id: 'bbbbbbbbbbbbbbbbbbbbbbb1', at, mode: 'pvp', map: 'crossing', mutator: null, difficulty: 'normal', outcome: 'won', seconds: 754, hero: 'sage', k: 7, d: 2, a: 9, grade: 'S', mvp: 'mvp', lv: 12, cs: 48, fish: 7400, dmg: 12_400, dmgTop: 12_400, kp: 84, score: [19, 7], toys: 4, party: 2 },
  { id: 'bbbbbbbbbbbbbbbbbbbbbbb2', at: at - 3_600_000, mode: 'arcade', map: 'crossing', mutator: 'toybox', difficulty: 'normal', outcome: 'lost', seconds: 350, hero: 'sage', k: 6, d: 3, a: 6, grade: 'A', mvp: 'svp', lv: 10, cs: 31, fish: 5100, dmg: 7_900, dmgTop: 11_200, kp: 63, score: [19, 23], toys: 3 },
  { id: 'bbbbbbbbbbbbbbbbbbbbbbb3', at: at - 7_200_000, mode: 'ranked', map: 'ridge', mutator: null, difficulty: 'normal', outcome: 'won', seconds: 1_012, hero: 'lambo', k: 2, d: 0, a: 15, grade: 'A', mvp: null, lv: 13, cs: 12, fish: 6_200, dmg: 4_300, dmgTop: 13_900, kp: 71, score: [24, 11], toys: 2, party: 1 },
  { id: 'bbbbbbbbbbbbbbbbbbbbbbb4', at: at - 86_400_000, mode: 'classic', map: 'hearthwood', mutator: null, difficulty: 'normal', outcome: 'won', seconds: 940, hero: 'duchess', k: 11, d: 4, a: 8, grade: 'A', mvp: null, lv: 15, cs: 96, fish: 11_300, dmg: 21_800, dmgTop: 21_800, kp: 59, score: [32, 18], toys: 4 },
  // an older row: no stats line stored (no zeros shown)
  { id: 'bbbbbbbbbbbbbbbbbbbbbbb5', at: at - 2 * 86_400_000, mode: 'arcade', map: 'crossing', mutator: 'cannon', difficulty: 'normal', outcome: 'lost', seconds: 420, hero: 'clem', k: 2, d: 5, a: 3, grade: 'B', mvp: null },
];
const VET = { v: 1, sessions: 40, matches: 60, wins: 33, firstWinDone: true, hero: 'sage', side: 'cat', veteran: true, firstPlaySession: 1 };
// a replay this device kept, with a long best moment (it was cut off: "Shut down! +100 Fish")
const LOCAL = [{ id: 'loc1', at: at + 60_000, hero: 'sage', mode: 'skirmish', difficulty: 'normal', outcome: 'won', grade: 'A', k: 6, d: 3, a: 6, seconds: 350, best: 'Shut down! +100 Fish', simVersion: SIM_VERSION, replay: true }];

const api = async (op: string): Promise<{ status: number; body?: unknown }> => {
  const name = 'Witty Biscuit';
  switch (op) {
    case 'name.get':
      return { status: 200, body: { name, nick: name, changes: 1, free: false, price: 1500, cost: 1500, cooldownDays: 7, nextAt: null, yarn: 922 } };
    case 'social.get':
      return { status: 200, body: { me: { code: 'PL-7KQ2-M9XR', name, invisible: false, allowRecent: true, ageBand: '18+', av: { i: 'h:sage' }, title: null, frame: null }, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r1' } };
    case 'social.pulse':
    case 'social.inbox':
      return { status: 204 };
    case 'ranked.me':
      return { status: 200, body: { ranked: { placementsLeft: 0, placementsOf: 5, tierIdx: 4, points: 42 } } };
    case 'history.list':
      return { status: 200, body: { owner: { name, self: true }, rows: ROWS, next: null, stats: { season: 's1', name: 'Season 1', matches: 24, wins: 14, winRate: 58, kda: 3.4, mvp: 5, favourites: [{ hero: 'sage', matches: 12, wins: 8, winRate: 67 }] } } };
    case 'club.get':
      return { status: 200, body: { club: null, kudos: { month: '2026-11', endsAt: '2026-12-01T00:00:00.000Z', n: 0, tiers: [5, 15, 30], paid: [], got: [], next: { id: 'x', name: 'Yarn' } } } };
    default:
      return { status: 0 };
  }
};

/** Row problems: small text, clipped text, children outside their row, sideways scroll. */
async function audit(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const out: string[] = [];
    const se = document.scrollingElement!;
    if (se.scrollWidth > innerWidth + 1) out.push(`page scrolls sideways: ${se.scrollWidth} > ${innerWidth}`);
    const pane = document.querySelector<HTMLElement>('.pfx-pane');
    if (pane && pane.scrollWidth > pane.clientWidth + 1) out.push(`pane scrolls sideways: ${pane.scrollWidth} > ${pane.clientWidth}`);
    const boxes = [...document.querySelectorAll<HTMLElement>('[data-testid="profile-match-list"] .pfx-mrowi, .pfx-rec')];
    if (!boxes.length) out.push('no rows');
    for (const row of boxes) {
      const rb = row.getBoundingClientRect();
      if (rb.left < -1 || rb.right > innerWidth + 1) out.push(`row off screen ${rb.left}..${rb.right}`);
      for (const el of row.querySelectorAll<HTMLElement>('*')) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(el).display === 'none') continue;
        if (b.left < rb.left - 1 || b.right > rb.right + 1 || b.top < rb.top - 1 || b.bottom > rb.bottom + 1) out.push(`${el.className || el.tagName} sticks out of its row`);
        const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!text) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 13.9) out.push(`small text ${el.className || el.tagName} ${fs}px "${el.textContent!.trim().slice(0, 20)}"`);
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`clipped ${el.className || el.tagName} "${el.textContent!.trim().slice(0, 24)}"`);
      }
    }
    return out;
  });
}

for (const [vp, w, h] of SIZES)
  test(`profile match rows at ${vp}`, async ({ browser, baseURL }) => {
    test.setTimeout(limit(150_000));
    const phone = w < 1000 && h < w;
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
    try {
      await context.exposeFunction('plApi', api);
      await context.addInitScript((rows) => {
        try {
          localStorage.setItem('tt.pawlegends.history.v1', JSON.stringify(rows));
        } catch {
          /* the host page's origin may refuse */
        }
      }, LOCAL);
      const page = await context.newPage();
      await mockHost(context, baseURL!, {
        app: { isApp: false, store: true },
        viewport: true,
        signedIn: true,
        liveApi: true,
        profile: VET,
        champState: { ...ALL_CHAMPS, yarn: { balance: 922, matches: 20, picksLeft: 0, nextPickAt: null } },
        store: { items: [], season: null },
      } as never);
      const game = await openHost(page);
      if (phone)
        await game.evaluate(() => {
          const r = document.documentElement.style;
          r.setProperty('--safe-l', '47px');
          r.setProperty('--safe-r', '47px');
          r.setProperty('--safe-b', '21px');
        });
      await game.locator('[data-testid="home-profile"]').first().click({ timeout: limit(60_000) });
      const screen = game.locator('[data-testid="profile-screen"]');
      await screen.locator('[data-testid="profile-tab-matches"]').click();
      const list = screen.locator('[data-testid="profile-match-list"] [data-a="match"]');
      await expect(list).toHaveCount(5, { timeout: limit(10_000) });
      // the real queue names (an Arcade match by its own mode), the stats line, no zeros on the older row
      await expect(list.nth(0).locator('.pfx-oc small').first()).toHaveText('PvP 3v3');
      await expect(list.nth(1).locator('.pfx-oc small').first()).toHaveText('Toy Box');
      await expect(list.nth(2).locator('.pfx-oc small').first()).toHaveText('Ranked 3v3');
      await expect(list.nth(2).locator('.pfx-mapl')).toHaveText('Ridge');
      await expect(list.nth(4).locator('.pfx-oc small').first()).toHaveText('Cannon Chaos');
      await expect(list.nth(0).locator('[data-s="score"] b')).toHaveText('19–7');
      await expect(list.nth(0).locator('[data-s="kp"]')).toContainText('84%');
      await expect(list.nth(0).locator('[data-s="party"]')).toContainText('With 2 friends');
      await expect(list.nth(0).locator('.pfx-lvb')).toHaveText('12');
      await expect(list.nth(2).locator('.pfx-ratio')).toHaveText('Perfect');
      await expect(list.nth(4).locator('.pfx-s')).toHaveCount(0);
      // Recordings: the best moment in full
      const best = screen.locator('.pfx-recbest').first();
      await expect(best).toHaveText('Shut down! +100 Fish');
      const problems = await audit(game);
      expect(problems, problems.join('\n')).toEqual([]);
      if (OUT) {
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/matches-${vp}.png` });
        await screen.locator('#pfx-recordings').scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${OUT}/matches-${vp}-recordings.png` });
      }
      // a row still opens its match
      await list.nth(0).click();
      await expect(screen.locator('.pfx-mdetail .mh-back')).toBeVisible();
    } finally {
      await context.close();
    }
  });
