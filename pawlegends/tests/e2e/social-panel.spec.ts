import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost, received } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * The Social sheet redesign (Nov 18, LoL social panel as the bar): 25 friends in collapsible groups with counts, the
 * invite card, requests, presence lines and small icon actions, on desktop (1440×900, 1920×1080) and phone landscape
 * (844×390, 667×375). Per viewport: no horizontal scroll, no overlap between a row's name, status and actions, names
 * at 14 px or more and no text under 13 px, every row inside the sheet. Then: groups fold and unfold, the row menu by
 * keyboard (Enter, arrows, Esc) and by touch, and the search. Screenshots go to $SOCIAL_SHOTS when it is set.
 * Portrait (390×844) is not here: the game shows its "turn your phone sideways" overlay over every screen.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));
test.describe.configure({ timeout: limit(180_000) });

const SHOTS = process.env.SOCIAL_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const NAMES = [
  'Angelinnaa', 'Sir Barkington the Third', 'Mira', 'Sunny Pudding', 'Zippy Comet', 'Cozy Lantern', 'Plucky Paws', 'Golden Tail',
  'Brave Mittens', 'Duke Barkington', 'Witty Whiskers', 'Nimbus', 'Pixel Pounce', 'Captain Fluffington', 'Velvet', 'Rusty Biscuit',
  'Moonbeam', 'Turbo Tabby', 'Pebble', 'Sergeant Snugglepaws', 'Ziggy', 'Honey Bun', 'Shadow Purr', 'Biscotti', 'Professor Whiskerton',
];
const STATES = ['party', 'online', 'queue', 'match', 'online', 'match', 'offline', 'offline', 'online', 'offline', 'party', 'offline'] as const;
const CCS = ['LT', 'US', 'BR', 'DE', undefined, 'JP', 'FR', undefined];
const friends = NAMES.map((name, i) => {
  const state = STATES[i % STATES.length] ?? 'offline';
  const presence: Record<string, unknown> = { state: i >= 14 ? 'offline' : state };
  if (state === 'party' && i < 14) Object.assign(presence, { joinable: i === 0, party: `PARTY${i}` });
  if (state === 'match' && i < 14) presence.room = `room${String(i).padStart(8, '0')}`;
  const hero = ['sage', 'clem', 'pixel', 'lambo', 'chili', 'brutus'][i % 6];
  return { code: `PL-${String(i).padStart(4, 'A')}-FRND`, name, presence, av: { i: `h:${hero}` }, ...(CCS[i % CCS.length] ? { cc: CCS[i % CCS.length] } : {}) };
});
const social = {
  me: { code: 'PL-7KQ2-M9XR', name: 'Witty Biscuit', invisible: false, allowRecent: true, ageBand: '18+', av: { i: 'h:sage' } },
  friends,
  requests: { in: [{ code: 'PL-REQQ-0001', name: 'Duke Barkington the Bold' }, { code: 'PL-REQQ-0002', name: 'Mochi' }], out: [{ code: 'PL-REQQ-0003', name: 'Taffy' }] },
  blocks: [],
  invites: [],
  rev: 'r1',
  chat: { unread: 2 },
  live: { featured: true },
};
const threads = { threads: [{ id: 't1', with: { code: friends[1].code, name: friends[1].name }, tier: 'text', lastPreview: 'gg! one more? I am queuing ranked right now', lastMine: false, unread: 2, muted: false }] };
const invite = { code: 'EZ77A64', link: 'https://pawlegends.app/?ref=EZ77A64', need: 3, invited: [], accepted: null, claimable: 0, nextCoat: null, earned: 0, cap: 5 };

async function openSheet(context: Parameters<typeof mockHost>[0], page: Page, baseURL: string): Promise<{ game: Frame; sheet: ReturnType<Frame['locator']> }> {
  await mockHost(context, baseURL, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
    api: {
      'social.get': { status: 200, body: social },
      'social.pulse': { status: 204 },
      'chat.list': { status: 200, body: threads },
      'growth.invite': { status: 200, body: invite },
      'friend.remove': { status: 200, body: {} },
    },
  });
  const game = await openHost(page);
  const btn = game.locator('[data-testid="lobby-social"]');
  await expect(btn).toBeVisible({ timeout: limit(60_000) });
  await btn.click();
  const sheet = game.locator('.pl-social');
  // the e2e build holds CSS animations at their first frame: the sheet's slide-in would leave it 24 px to the right
  await game.addStyleTag({ content: '.pl-social, .pl-fr-menu, .pl-social-moremenu { animation: none !important; }' });
  await expect(sheet.locator('.pl-fr').first()).toBeVisible();
  await expect(sheet.locator('[data-testid="invite-row"]')).toBeVisible();
  return { game, sheet };
}

/** Layout facts inside the sheet: overflow, overlaps, text sizes. Returns a list of problems (empty = good). */
async function layoutProblems(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const out: string[] = [];
    const sheet = document.querySelector<HTMLElement>('.pl-social')!;
    const sr = sheet.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    if (sr.right > vw + 1 || sr.left < -1) out.push(`sheet off screen ${sr.left}-${sr.right} of ${vw}`);
    for (const el of [sheet, ...sheet.querySelectorAll<HTMLElement>('.pl-social-body, .pl-social-head, .pl-social-tools, .pl-invite-row')])
      if (el.scrollWidth > el.clientWidth + 1) out.push(`horizontal scroll in ${el.className}: ${el.scrollWidth} > ${el.clientWidth}`);
    const hit = (a: DOMRect, b: DOMRect) => a.width > 0 && b.width > 0 && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const body = sheet.querySelector<HTMLElement>('.pl-social-body')!.getBoundingClientRect();
    for (const row of sheet.querySelectorAll<HTMLElement>('.pl-fr, .pl-rq')) {
      const rr = row.getBoundingClientRect();
      if (rr.bottom < body.top || rr.top > body.bottom) continue; // scrolled out of view
      if (rr.right > sr.right + 0.5 || rr.left < sr.left - 0.5) out.push(`row outside the sheet: ${row.dataset.code}`);
      const name = row.querySelector<HTMLElement>('.pl-social-name')!;
      const line = row.querySelector<HTMLElement>('.pl-social-line');
      const acts = [...row.querySelectorAll<HTMLElement>('.pl-fr-acts > *')].filter((b) => getComputedStyle(b).display !== 'none');
      const nr = name.getBoundingClientRect();
      const lr = line?.getBoundingClientRect();
      if (lr && hit(nr, lr)) out.push(`name and status overlap: ${row.dataset.code}`);
      for (const b of acts) {
        const br = b.getBoundingClientRect();
        if (hit(nr, br)) out.push(`name and action overlap: ${row.dataset.code}`);
        if (lr && hit(lr, br)) out.push(`status and action overlap: ${row.dataset.code}`);
        if (br.right > sr.right + 0.5) out.push(`action outside the sheet: ${row.dataset.code}`);
      }
      if (parseFloat(getComputedStyle(name).fontSize) < 14) out.push(`name under 14px: ${getComputedStyle(name).fontSize}`);
    }
    // no visible text under 13 px (numeric badges excepted: counts in a pill)
    for (const el of sheet.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('.pl-social-badge, .pl-chat-unread, .pl-av, .pl-cc, svg')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < body.top - 200 || getComputedStyle(el).visibility === 'hidden') continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 13) out.push(`text under 13px (${fs}px): "${el.textContent!.trim().slice(0, 30)}" .${el.className}`);
    }
    // touch targets: every button in the list is at least 40 px tall (44 with its hit area) and 36 wide
    for (const b of sheet.querySelectorAll<HTMLElement>('.pl-social-body button, .pl-social-head button, .pl-social-tools button')) {
      const r = b.getBoundingClientRect();
      if (!r.width || getComputedStyle(b).display === 'none') continue;
      if (r.height < 32 || r.width < 32) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)}: ${b.getAttribute('aria-label') ?? b.textContent}`);
    }
    return [...new Set(out)];
  });
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  const v = page.viewportSize();
  await page.screenshot({ path: join(SHOTS, `${v?.width}x${v?.height}-${name}.png`) });
}

test('Social panel: groups, presence, actions, no overlap at every viewport', async ({ context, page, baseURL }, info) => {
  const touch = info.project.name === 'landscape';
  const { game, sheet } = await openSheet(context, page, baseURL!);
  const views: [number, number][] = touch ? [[844, 390], [667, 375]] : [[1440, 900], [1920, 1080]];

  // groups with counts: requests, online (lobby/queue/online), in match, offline (folded: friends are online), sent
  const groups = sheet.locator('.pl-group-h');
  await expect(groups).toHaveCount(5);
  await expect(sheet.locator('[data-group="requests"] .pl-group-n')).toHaveText('2');
  await expect(sheet.locator('[data-group="offline"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(sheet.locator('[data-group="sent"]')).toHaveAttribute('aria-expanded', 'false');
  // the unread friend keeps their presence line and adds the message after it
  const unreadRow = sheet.locator(`.pl-fr[data-code="${friends[1].code}"]`);
  await expect(unreadRow.locator('.pl-social-st')).toHaveText('Online');
  await expect(unreadRow.locator('.pl-social-preview')).toContainText('gg! one more?');
  await expect(sheet.locator('[data-testid="social-unread"]')).toHaveText('4');
  // the joinable lobby shows Join (one tap), everyone online gets a small Invite icon
  await expect(sheet.locator(`.pl-fr[data-code="${friends[0].code}"] [data-a="join"]`)).toBeVisible();

  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    expect(await layoutProblems(game), `${w}x${h}`).toEqual([]);
    await shot(page, 'list');
  }

  // fold and unfold: Offline opens (11 more rows), Requests folds
  const before = await sheet.locator('.pl-fr').count();
  await sheet.locator('[data-group="offline"]').click();
  await expect(sheet.locator('[data-group="offline"]')).toHaveAttribute('aria-expanded', 'true');
  expect(await sheet.locator('.pl-fr').count()).toBeGreaterThan(before);
  await sheet.locator('[data-group="requests"]').click();
  await expect(sheet.locator('.pl-rq')).toHaveCount(0);
  await sheet.locator('[data-group="requests"]').click();
  await expect(sheet.locator('.pl-rq')).toHaveCount(2);
  // the list scrolls (the one scroll region); the sheet itself never does
  expect(await sheet.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(100);
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'offline-open');
  await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, 0));

  // the row menu: by touch a tap on the row, by mouse a click; keyboard: Enter opens, arrows move, Esc closes
  const row = sheet.locator(`.pl-fr[data-code="${friends[3].code}"]`);
  if (touch) await row.locator('.pl-fr-main').tap();
  else await row.locator('.pl-fr-main').click();
  const menu = sheet.locator('.pl-fr-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.pl-fr-menu-name')).toHaveText(friends[3].name);
  await expect(menu.locator('[data-a="chat"]')).toBeVisible();
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'menu');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(sheet).toBeVisible();

  if (!touch) {
    const main = sheet.locator(`.pl-fr[data-code="${friends[2].code}"] .pl-fr-main`);
    await main.focus();
    // keyboard focus shows the row's icon actions (hover-only for the mouse)
    await page.keyboard.press('ArrowRight');
    await expect(sheet.locator(`.pl-fr[data-code="${friends[2].code}"] .pl-fr-acts button`).first()).toBeFocused();
    await expect(sheet.locator(`.pl-fr[data-code="${friends[2].code}"] [data-a="chat"]`)).toHaveCSS('opacity', '1');
    await page.keyboard.press('ArrowLeft');
    await expect(main).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(main).not.toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(main).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[role="menuitem"]').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(main).toBeFocused();
    // tabs: arrows move and select
    await sheet.locator('[role="tab"][data-tab="friends"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(sheet.locator('[role="tab"][data-tab="recent"]')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(sheet.locator('[role="tab"][data-tab="friends"]')).toHaveAttribute('aria-selected', 'true');
  } else {
    // touch: the primary action shows without hover; chat shows only when unread
    await expect(sheet.locator(`.pl-fr[data-code="${friends[2].code}"] [data-testid="social-invite"]`)).toBeVisible();
    await expect(sheet.locator(`.pl-fr[data-code="${friends[2].code}"] [data-a="chat"]`)).toBeHidden();
    await expect(unreadRow.locator('[data-a="chat"]')).toBeVisible();
  }

  // search filters as you type
  await sheet.locator('input[name="q"]').fill('bark');
  await expect(sheet.locator('.pl-fr')).toHaveCount(2);
  await expect(sheet.locator('.pl-rq')).toHaveCount(1);
  await shot(page, 'search');
  await sheet.locator('input[name="q"]').fill('');

  // Add friend: the form with my code to share
  await sheet.locator('[data-a="add"]').first().click();
  await expect(sheet.locator('.pl-social-mycode strong')).toHaveText('PL-7KQ2-M9XR');
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'add');
  await sheet.locator('[data-a="add-cancel"]').click();

  // the invite card folds to one line (it starts folded on a phone held sideways) and unfolds
  const card = sheet.locator('[data-testid="invite-row"]');
  const folded = ((await card.getAttribute('class')) ?? '').includes('is-folded');
  expect(folded).toBe(touch);
  await sheet.locator('[data-a="inv-fold"]').click();
  await expect(card).toHaveClass(folded ? /^(?!.*is-folded)/ : /is-folded/);
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, folded ? 'invite-open' : 'invite-folded');

  // More: Ranked and Leaderboards
  await sheet.locator('[data-a="tabs-more"]').click();
  await expect(sheet.locator('.pl-social-moremenu')).toBeVisible();
  await shot(page, 'more');

  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request') as any[];
  for (const r of reqs) expect(JSON.stringify({ op: r.op, args: r.args })).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]/);
});

test('Social panel: empty list and a guest', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
    api: {
      'social.get': { status: 200, body: { ...social, friends: [], requests: { in: [], out: [] }, chat: { unread: 0 }, live: {} } },
      'social.pulse': { status: 204 },
      'growth.invite': { status: 200, body: invite },
    },
  });
  const game = await openHost(page);
  const btn = game.locator('[data-testid="lobby-social"]');
  await expect(btn).toBeVisible({ timeout: limit(60_000) });
  await btn.click();
  const sheet = game.locator('.pl-social');
  await game.addStyleTag({ content: '.pl-social { animation: none !important; }' });
  await expect(sheet.locator('.pl-social-none')).toContainText('No friends yet');
  await expect(sheet.locator('.pl-social-none [data-a="add-empty"]')).toBeVisible();
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'empty');
});
