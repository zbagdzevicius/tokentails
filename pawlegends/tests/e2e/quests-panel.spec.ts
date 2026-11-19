import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * Nov 19 Quests facelift (the "sticker board", ui/home/goalsPanel.ts): at every target size and in three states (none
 * done with live events, some done after a vote, all done with no events) the panel is visible (never stuck at
 * opacity 0), on screen, clear of the profile, nav, promo, PLAY and (desktop) the champion nameplate, with no
 * horizontal scroll or clipped text, 44 px targets and 14 px text at least. Landscape phones use the Today / Events
 * tabs. Screenshots go to $QUESTS_SHOTS when set (never in CI).
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'sizes are set per describe; desktop project only'));

const SHOTS = process.env.QUESTS_SHOTS ?? '';
const day = 86_400_000;
const iso = (t: number): string => new Date(t).toISOString();
const now = Date.now();

const config = (events: boolean) => ({
  v: 1,
  now: iso(now),
  events: [],
  featuredMode: { id: 'skirmish', endsAt: iso(now + 3 * day) },
  featuredQuests: [],
  goal: events
    ? { id: 'g1-paws-together', label: 'Play 2,000 matches together', metric: 'matches', target: 2000, progress: 23, reached: false, rewardItem: 'coat.clem.loop.honey', rewardName: 'Honey coat for Clem', startsAt: iso(now - 5 * day), endsAt: iso(now + 25 * day + 10 * 3_600_000) }
    : null,
  vote: events
    ? {
        id: 'v1-winter-coat',
        question: 'Which coat should we make next?',
        options: [
          { id: 'a', name: 'Aurora Frost', hero: 'sage', colors: ['#8fc8ff', '#eef6ff', '#9be3c4'] },
          { id: 'b', name: 'Candy Cane', hero: 'brutus', colors: ['#ff3d7f', '#fff3e3', '#c8102e'] },
        ],
        open: true,
        tallies: { a: 1, b: 0 },
        startsAt: iso(now - 5 * day),
        endsAt: iso(now + 25 * day + 10 * 3_600_000),
      }
    : null,
  nap: events
    ? { id: 'nap-2026', name: 'Winter Nap', startsAt: iso(Math.floor(now / day + 26) * day), endsAt: iso(Math.floor(now / day + 47) * day), open: false, today: iso(now).slice(0, 10), gifts: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, item: i === 6 ? 'coat.cacklejaw.frost' : 'coat.sage.loop.slate', name: `Gift ${i + 1}` })) }
    : null,
});

type State = 'none' | 'some' | 'all';
const me = (s: State) => ({ goal: { id: 'g1-paws-together', claimed: false }, nap: { days: 0, earned: 0, claimed: 0, playedToday: false }, vote: { id: 'v1-winter-coat', choice: s === 'some' ? 'a' : null }, items: [] });
const profile = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };

/** The day's quests from browser storage: none, the hero quest done and one step on the rest, or all done. */
function seed(s: State): void {
  const p = (n: number): string => String(n).padStart(2, '0');
  const d = new Date();
  const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const ids = ['takedowns5', 'pudding', 'win', 'play2', 'towers2', 'combo3', 'takedowns10', 'champion', 'pudding2', 'party2'];
  const heroes = ['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'aviete', 'bengas', 'gabe', 'meatball', 'pixel', 'duchess', 'stilts', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino', 'mochi', 'ziggy', 'biscuit', 'champ', 'nova', 'dusty', 'barkula', 'ranger'].map((h) => `win_${h}`);
  const goal: Record<string, number> = { takedowns5: 5, pudding: 1, win: 1, play2: 2, towers2: 2, combo3: 3, takedowns10: 10, champion: 1, pudding2: 2, party2: 2 };
  const progress: Record<string, number> = {};
  let done: string[] = [];
  if (s === 'some') {
    for (const id of ids) progress[id] = 1;
    for (const id of heroes) progress[id] = 1;
    done = [...heroes];
  } else if (s === 'all') {
    for (const id of ids.filter((x) => x !== 'party2')) progress[id] = goal[id]!;
    for (const id of heroes) progress[id] = 1;
    done = [...ids.filter((x) => x !== 'party2'), ...heroes];
  }
  try {
    localStorage.setItem('tt.pawlegends.quests.v1', JSON.stringify({ v: 1, day: key, progress, done }));
    const lucky = { odds: [{ rarity: 'common', pct: 62, items: 128, dupXp: 100 }, { rarity: 'rare', pct: 28, items: 54, dupXp: 200 }, { rarity: 'epic', pct: 10, items: 8, dupXp: 300 }], floor: 10, dailyTreatXp: 150, n: 0, eligible: true };
    if (!localStorage.getItem('tt.pawlegends.cloud.v1')) localStorage.setItem('tt.pawlegends.cloud.v1', JSON.stringify({ applied: [], opened: [], lucky, welcome: { days: 2, today: false } }));
  } catch {
    /* no storage */
  }
}

async function open(game: Frame, s: State): Promise<import('@playwright/test').Locator> {
  const btn = game.locator('[data-testid="home-goals"]');
  await expect(btn).toBeVisible({ timeout: limit(60_000) });
  await btn.click();
  const panel = game.locator('[data-testid="goals-panel"]');
  await expect(panel).toBeVisible();
  if (s !== 'all') await expect(panel.locator('.lo-card').first()).toBeAttached({ timeout: limit(10_000) });
  // settle: the fade (180 ms), late live-ops answers, Home patches
  await game.waitForTimeout(1200);
  return panel;
}

type Box = { x: number; y: number; width: number; height: number };
const meets = (a: Box, b: Box): boolean => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** The visible panel's layout faults: tiny text, small targets, clipped text, overflow. */
async function faults(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const out: string[] = [];
    const panel = document.querySelector<HTMLElement>('[data-testid="goals-panel"]')!;
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    if (Number(getComputedStyle(panel).opacity) < 0.99) out.push(`panel opacity ${getComputedStyle(panel).opacity}`);
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!;
      if (!n.textContent?.trim() || !shown(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 14) out.push(`text ${fs}px: "${n.textContent.trim()}"`);
    }
    for (const b of panel.querySelectorAll<HTMLElement>('button')) {
      if (!shown(b)) continue;
      const r = b.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) out.push(`target ${Math.round(r.width)}x${Math.round(r.height)}: ${b.className}`);
    }
    for (const el of panel.querySelectorAll<HTMLElement>('.tx, .lo-h b, .lo-h small, .lo-opt .t b, .lo-opt .t small, .rw-lrow b, .rw-lrow small, .lo-prize, .hm-gp-clock, .hm-gp-tab, .rw-bub')) {
      if (!shown(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`clipped: "${el.textContent?.trim()}"`);
    }
    const body = panel.querySelector<HTMLElement>('.hm-gp-body')!;
    if (body.scrollWidth > body.clientWidth + 1) out.push(`panel body scrolls sideways ${body.scrollWidth} > ${body.clientWidth}`);
    const pr = panel.getBoundingClientRect();
    for (const el of panel.querySelectorAll<HTMLElement>('.q, .lo-card, .rw-wp, .rw-lrow, .rw-bub')) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) out.push(`sticks out of the panel: ${el.className}`);
    }
    const se = document.scrollingElement!;
    if (se.scrollWidth > innerWidth + 1) out.push(`page scrolls sideways ${se.scrollWidth} > ${innerWidth}`);
    return out;
  });
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

const SIZES = [
  { name: '1440x900', viewport: { width: 1440, height: 900 }, phone: false },
  { name: '1920x1080', viewport: { width: 1920, height: 1080 }, phone: false },
  { name: '844x390', viewport: { width: 844, height: 390 }, phone: true },
  { name: '667x375', viewport: { width: 667, height: 375 }, phone: true },
];

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, hasTouch: size.phone, isMobile: size.phone });
    for (const s of ['none', 'some', 'all'] as State[]) {
      test(`Quests panel, ${s} done: visible, on screen, clear, readable`, async ({ context, page, baseURL }) => {
        await context.addInitScript(seed, s);
        await mockHost(context, baseURL!, {
          app: { isApp: false, store: true },
          // a phone page has a viewport meta (pawlegends.app/play does): without it a mobile browser lays out 980 px
          viewport: size.phone,
          signedIn: true,
          profile,
          api: { 'liveops.config': { status: 200, body: config(s !== 'all') }, 'liveops.me': { status: 200, body: me(s) }, 'social.pulse': { status: 204 } },
        });
        const game = await openHost(page);
        const panel = await open(game, s);
        const tabs = panel.locator('.hm-gp-tabs');
        // wide screens show both sections side by side; a phone with events uses the tabs
        const tabbed = size.phone && s !== 'all';
        if (tabbed) await expect(tabs).toBeVisible();
        else await expect(tabs).toBeHidden();
        // an event that needs a tap (the open vote) opens a phone on Events: Today first for the checks
        if (tabbed) await panel.locator('[data-gtab="today"]').click();
        await expect(panel.locator('[data-testid="goals-today"]')).toBeVisible();
        await expect(panel.locator('.hm-qlist .q')).toHaveCount(4);
        if (s === 'all') await expect(panel.locator('.hm-gp-chip.all')).toHaveText('3/3 ✓');
        if (s !== 'none') await expect(panel.locator('.q.done .qstamp').first()).toHaveText('Nailed it');
        expect(await faults(game)).toEqual([]);
        const box = (await panel.boundingBox())!;
        const vp = page.viewportSize()!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
        for (const sel of ['.hm-profile', '.hm-nav', '.hm-promo', '.hm-play', '.hm-extras', ...(size.phone ? [] : ['.hm-plate'])]) {
          const b = await game.locator(sel).first().boundingBox();
          if (b && b.width && b.height) expect(meets(box, b), `${size.name} ${s}: panel over ${sel}`).toBe(false);
        }
        await shot(page, `${size.name}-${s}`);
        if (tabbed) {
          await panel.locator('[data-gtab="events"]').click();
          await expect(panel.locator('[data-testid="goals-events"]')).toBeVisible();
          await expect(panel.locator('[data-testid="goals-today"]')).toBeHidden();
          expect(await faults(game)).toEqual([]);
          await shot(page, `${size.name}-${s}-events`);
          await panel.locator('[data-gtab="today"]').click();
          await expect(panel.locator('[data-testid="goals-today"]')).toBeVisible();
        } else if (!size.phone && s !== 'all') {
          await expect(panel.locator('[data-testid="goals-events"]')).toBeVisible();
          expect(await panel.evaluate((p) => p.classList.contains('wide'))).toBe(true);
        }
        if (size.phone) {
          await panel.locator('.hm-gp-body').evaluate((b) => (b.scrollTop = b.scrollHeight));
          await game.waitForTimeout(200);
          await shot(page, `${size.name}-${s}-scrolled`);
        }
      });
    }
  });
}

test.describe('390x844 portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('portrait asks to turn the phone (no panel to lay out), no sideways scroll', async ({ context, page, baseURL }) => {
    await context.addInitScript(seed, 'none' as State);
    await mockHost(context, baseURL!, { app: { isApp: false, store: true }, viewport: true, signedIn: true, profile, api: { 'liveops.config': { status: 200, body: config(true) }, 'liveops.me': { status: 200, body: me('none') }, 'social.pulse': { status: 204 } } });
    const game = await openHost(page);
    await game.waitForTimeout(3000);
    expect(await game.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1)).toBe(true);
    await shot(page, '390x844-portrait');
  });
});
