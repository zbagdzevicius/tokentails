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
 * The host has a viewport meta (`viewport: true`): without it the phone project lays out at 980 px and scales down.
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
  if (state === 'match' && i < 14) Object.assign(presence, { room: `room${String(i).padStart(8, '0')}`, mode: i % 2 ? 'ranked' : 'casual', since: Date.now() - (5 + i) * 60_000 });
  if (state === 'queue' && i < 14) Object.assign(presence, { mode: 'ranked', since: Date.now() - 2 * 60_000 });
  if (state === 'party' && i < 14) Object.assign(presence, { size: 2, max: 3 });
  if (presence.state === 'offline') presence.seen = Date.now() - (i + 1) * 3_600_000 * 7;
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
const chatHistory = {
  thread: { tier: 'text', muted: false },
  messages: [
    { mid: 'm1', at: '2026-11-18T20:00:00.000Z', k: 't', text: 'gg! one more?', mine: false },
    { mid: 'm2', at: '2026-11-18T20:00:30.000Z', k: 't', text: 'I am queuing ranked right now', mine: false },
    { mid: 'm3', at: '2026-11-18T20:01:00.000Z', k: 't', text: 'sure, invite me', mine: true },
  ],
  more: false,
};
const recent = { players: [{ room: 'roomaaaaaaaa', slot: 1, name: 'Marshmallow Fan', team: 'ally', canAdd: true, av: { i: 'h:clem' } }, { room: 'roomaaaaaaaa', slot: 4, name: 'Rocket Rex', team: 'enemy', canAdd: true }] };
const invite = { code: 'EZ77A64', link: 'https://pawlegends.app/?ref=EZ77A64', need: 3, invited: [], accepted: null, claimable: 0, nextCoat: null, earned: 0, cap: 5 };

async function openSheet(context: Parameters<typeof mockHost>[0], page: Page, baseURL: string): Promise<{ game: Frame; sheet: ReturnType<Frame['locator']> }> {
  await mockHost(context, baseURL, {
    viewport: true,
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
    api: {
      'social.get': { status: 200, body: social },
      'social.pulse': { status: 204 },
      'social.recent': { status: 200, body: recent },
      'social.me': { status: 200, body: { ...social, me: { ...social.me, invisible: true } } },
      'chat.list': { status: 200, body: threads },
      'chat.open': { status: 200, body: { thread: 't1', tier: 'text' } },
      'chat.history': { status: 200, body: chatHistory },
      'chat.since': { status: 204 },
      'chat.read': { status: 200, body: {} },
      'club.get': { status: 200, body: { club: null, kudos: null } },
      'growth.invite': { status: 200, body: invite },
      'friend.remove': { status: 200, body: {} },
      'social.search': { status: 200, body: { players: [{ name: 'Mira Moonpaw', av: { i: 'h:clem' }, cc: 'LT' }, { name: 'Mira', rel: 'friend', av: { i: 'h:sage' } }] } },
    },
  });
  const game = await openHost(page);
  const btn = game.locator('[data-testid="lobby-social"]');
  await expect(btn).toBeVisible({ timeout: limit(60_000) });
  await btn.click();
  const sheet = game.locator('.pl-social');
  // the e2e build holds CSS animations at their first frame: the sheet's slide-in would leave it 24 px to the right
  await game.addStyleTag({ content: '.pl-social, .pl-chat, .pl-fr-menu, .pl-me-card, .pl-social-moremenu { animation: none !important; } .pl-social *, .pl-chat * { transition: none !important; }' });
  await expect(sheet.locator('.pl-fr').first()).toBeVisible();
  // friends to show: the invite folds into the header's gift
  await expect(sheet.locator('[data-testid="invite-open"]')).toBeVisible();
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
    for (const el of [sheet, ...sheet.querySelectorAll<HTMLElement>('.pl-social-body, .pl-social-head, .pl-social-tabbar, .pl-social-searchrow, .pl-add-card, .pl-invite-row')])
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
    // a stuck group header is opaque and on top: every point across it belongs to it (no row, dot or avatar shows
    // through or sits over its label), and no row text peeks out above it
    for (const h of sheet.querySelectorAll<HTMLElement>('.pl-group-h')) {
      const r = h.getBoundingClientRect();
      if (r.top < body.top - 0.5 || r.bottom > body.bottom) continue;
      for (let x = r.left + 6; x < r.right - 6; x += 12)
        for (const y of [r.top + 2, r.top + r.height / 2, r.bottom - 2]) {
          const el = document.elementFromPoint(x, y);
          // an open popover (More) floats over the list on purpose
          if (el && !h.contains(el) && !el.closest('.pl-social-moremenu')) out.push(`group header covered at ${Math.round(x - r.left)},${Math.round(y - r.top)} by .${(el as HTMLElement).className || el.tagName}`);
        }
      const bg = getComputedStyle(h).backgroundColor;
      if (!/^rgb\(/.test(bg)) out.push(`group header not opaque: ${bg}`);
    }
    // nothing is cut: no name, status or invite title ends in an ellipsis or is clipped (the one-line unread preview
    // is cut on purpose: its tooltip and the thread show it whole)
    for (const el of sheet.querySelectorAll<HTMLElement>('.pl-social-row .pl-social-name, .pl-social-st, .pl-inv-sub, .pl-social-tab span, .pl-social-more span, .pl-group-t, .pl-mi span')) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < body.top || r.top > body.bottom + 400) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) out.push(`text cut: "${el.textContent!.trim().slice(0, 40)}" .${el.className}`);
    }
    // the trailing actions share one right edge per column (the row's action, then Chat)
    for (const col of ['.pl-act-1', '.pl-act-2']) {
      const rights = new Set([...sheet.querySelectorAll<HTMLElement>(`.pl-social-body .pl-group-list ${col}`)].filter((b) => b.getBoundingClientRect().width).map((b) => Math.round(b.getBoundingClientRect().right)));
      if (rights.size > 1) out.push(`${col} not aligned: ${[...rights].join(',')}`);
    }
    // an unread badge sits on its icon's corner
    for (const badge of sheet.querySelectorAll<HTMLElement>('.pl-chat-unread')) {
      const svg = badge.parentElement!.querySelector('svg')!.getBoundingClientRect();
      if (!hit(badge.getBoundingClientRect(), svg)) out.push('unread badge detached from its icon');
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
    for (const b of sheet.querySelectorAll<HTMLElement>('.pl-social-body button, .pl-social-head button, .pl-social-tabbar button, .pl-social-searchrow button')) {
      const r = b.getBoundingClientRect();
      if (!r.width || getComputedStyle(b).display === 'none') continue;
      if (r.height < 36 || r.width < 36) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)}: ${b.getAttribute('aria-label') ?? b.textContent}`);
    }
    return [...new Set(out)];
  });
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  const v = page.viewportSize();
  await page.screenshot({ path: join(SHOTS, `${v?.width}x${v?.height}-${name}.png`) });
}

/** The game frame lays out at the real viewport (CSS px), not at a 980 px page scaled down. */
async function realViewport(page: Page, game: Frame): Promise<void> {
  const v = page.viewportSize()!;
  expect(await game.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([v.width, v.height]);
}

/** Friend rows fully visible in the list on first paint (LoL: friends first). */
async function friendsOnFirstScreen(game: Frame): Promise<number> {
  return game.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.pl-social .pl-social-body')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.pl-social .pl-fr')].filter((r) => {
      const b = r.getBoundingClientRect();
      return b.top >= body.top - 0.5 && b.bottom <= body.bottom + 0.5;
    }).length;
  });
}

test('Social panel: groups, presence, actions, no overlap at every viewport', async ({ context, page, baseURL }, info) => {
  const touch = info.project.name === 'landscape';
  const { game, sheet } = await openSheet(context, page, baseURL!);
  const views: [number, number][] = touch ? [[844, 390], [667, 375]] : [[1440, 900], [1920, 1080]];

  // groups with counts: requests, online (lobby/queue/online), in match, offline (folded: friends are online), sent
  const groups = sheet.locator('.pl-group-h');
  await expect(groups).toHaveCount(5);
  await expect(sheet.locator('[data-group="requests"] .pl-group-n')).toHaveText('2');
  // a short screen folds Requests to its header (friends first); a tall one shows both requests
  await expect(sheet.locator('[data-group="requests"]')).toHaveAttribute('aria-expanded', touch ? 'false' : 'true');
  await expect(sheet.locator('[data-group="offline"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(sheet.locator('[data-group="sent"]')).toHaveAttribute('aria-expanded', 'false');
  // the unread friend keeps their presence line and adds the message after it
  const unreadRow = sheet.locator(`.pl-fr[data-code="${friends[1].code}"]`);
  await expect(unreadRow.locator('.pl-social-st')).toHaveText('Online');
  await expect(unreadRow.locator('.pl-social-msg')).toHaveText('gg! one more? I am queuing ranked right now');
  // presence detail: mode and time in a match, seats in a lobby
  await expect(sheet.locator(`.pl-fr[data-code="${friends[3].code}"] .pl-social-st`)).toHaveText(/^In match · Ranked · \d+m$/);
  await expect(sheet.locator(`.pl-fr[data-code="${friends[0].code}"] .pl-social-st`)).toHaveText('In lobby · 2/3 · open');
  // on Friends the tab has no badge: requests and unread messages show their own counts (no "4" to misread)
  await expect(sheet.locator('[data-testid="social-unread"]')).toHaveCount(0);
  // one header row, no live chip and no search field until Search is tapped
  await expect(sheet.locator('.pl-social-head [data-testid="social-me"]')).toBeVisible();
  await expect(sheet.locator('input[name="q"]')).toHaveCount(0);
  await expect(sheet.locator('.pl-social-body [data-testid="social-watch-live"]')).toHaveCount(0);
  // the joinable lobby shows Join (one tap), a free friend a small Invite icon; a queued or lobbied friend none
  await expect(sheet.locator(`.pl-fr[data-code="${friends[0].code}"] [data-a="join"]`)).toBeVisible();
  await expect(sheet.locator(`.pl-fr[data-code="${friends[2].code}"] [data-a="invite"]`)).toHaveCount(0);
  await expect(sheet.locator(`.pl-fr[data-code="${friends[10].code}"] [data-a="invite"]`)).toHaveCount(0);
  await expect(sheet.locator(`.pl-fr[data-code="${friends[4].code}"] [data-a="invite"]`)).toHaveCount(1);

  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    await realViewport(page, game);
    expect(await layoutProblems(game), `${w}x${h}`).toEqual([]);
    // phones: 4 friends under the header and the two group headers; desktop: all 10 online and in-match friends
    expect(await friendsOnFirstScreen(game), `${w}x${h} friends on the first screen`).toBeGreaterThanOrEqual(touch ? 4 : 10);
    // the chrome above the first group: one header row and the tab bar (LoL uses about 90 px)
    const chrome = await game.evaluate(() => document.querySelector('.pl-social .pl-group-h')!.getBoundingClientRect().top - document.querySelector('.pl-social')!.getBoundingClientRect().top);
    expect(chrome, `${w}x${h} chrome`).toBeLessThanOrEqual(touch ? 104 : 112);
    await shot(page, 'list');
    // scrolled a little: the stuck header stays opaque and on top
    await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, 70));
    await page.waitForTimeout(100);
    expect(await layoutProblems(game), `${w}x${h} scrolled`).toEqual([]);
    await shot(page, 'scrolled');
    await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, 0));
    if (!touch) {
      // hover shows the row's icons (Invite to party, Chat)
      await sheet.locator(`.pl-fr[data-code="${friends[4].code}"]`).hover();
      await expect(sheet.locator(`.pl-fr[data-code="${friends[4].code}"] [data-testid="social-invite"]`)).toHaveCSS('opacity', '1');
      await shot(page, 'hover');
      await page.mouse.move(5, 5);
    }
  }

  // fold and unfold: Offline opens (11 more rows), Requests folds
  const before = await sheet.locator('.pl-fr').count();
  await sheet.locator('[data-group="offline"]').click();
  await expect(sheet.locator('[data-group="offline"]')).toHaveAttribute('aria-expanded', 'true');
  expect(await sheet.locator('.pl-fr').count()).toBeGreaterThan(before);
  if (touch) {
    await sheet.locator('[data-group="requests"]').click();
    await expect(sheet.locator('.pl-rq')).toHaveCount(2);
    expect(await layoutProblems(game)).toEqual([]);
    await shot(page, 'requests');
  }
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
  // a friend in a match can't be invited: the menu says why (greyed, never a button that does nothing)
  await expect(menu.locator('[data-testid="social-invite-busy"]')).toBeDisabled();
  await expect(menu.locator('[data-testid="social-invite-busy"]')).toContainText('In a match');
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
    await expect(menu.locator('[role="menuitem"]:not([disabled])').first()).toBeFocused();
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
    await expect(sheet.locator(`.pl-fr[data-code="${friends[4].code}"] [data-testid="social-invite"]`)).toBeVisible();
    await expect(sheet.locator(`.pl-fr[data-code="${friends[4].code}"] [data-a="chat"]`)).toBeHidden();
    // Join is a 44 px target
    const jb = await sheet.locator(`.pl-fr[data-code="${friends[0].code}"] [data-a="join"]`).boundingBox();
    expect(Math.round(jb!.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(jb!.height)).toBeGreaterThanOrEqual(44);
    await expect(unreadRow.locator('[data-a="chat"]')).toBeVisible();
  }

  // search: Search in the tab bar opens the field; it filters as you type
  await sheet.locator('[data-a="search"]').click();
  await expect(sheet.locator('input[name="q"]')).toBeFocused();
  await sheet.locator('input[name="q"]').fill('bark');
  await expect(sheet.locator('.pl-fr')).toHaveCount(2);
  await expect(sheet.locator('.pl-rq')).toHaveCount(1);
  await shot(page, 'search');
  await sheet.locator('input[name="q"]').fill('Zorro');
  await expect(sheet.locator('[data-testid="social-search-none"]')).toBeVisible();
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'noresult');
  await sheet.locator('[data-a="search-close"]').click();
  await expect(sheet.locator('input[name="q"]')).toHaveCount(0);
  await expect(sheet.locator('.pl-fr').first()).toBeVisible();

  // Add a friend: a card over the top of the list (the list stays), nickname suggestions as you type, one code only
  await sheet.locator('.pl-social-head [data-a="add"]').click();
  const addCard = sheet.locator('[data-testid="social-add-card"]');
  await expect(addCard).toBeVisible();
  await expect(sheet.locator('[data-testid="social-add-input"]')).toBeFocused();
  await sheet.locator('[data-testid="social-add-input"]').pressSequentially('mir', { delay: 40 });
  await expect(addCard.locator('[data-testid="social-suggest"]')).toHaveCount(2);
  await expect(addCard.locator('[data-testid="social-suggest"]').first().locator('[data-a="add-name"]')).toBeVisible();
  expect(await sheet.locator('.pl-fr').count()).toBeGreaterThan(0);
  await expect(sheet.locator('.pl-social-mycode')).toHaveCount(0);
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'add');
  await addCard.locator('[data-a="add-cancel"]').click();
  await expect(addCard).toHaveCount(0);

  // the invite: folded into the header's gift (friends first); the gift opens the card at the top of the list
  const card = sheet.locator('[data-testid="invite-row"]');
  await expect(card).toHaveCount(0);
  await sheet.locator('[data-testid="invite-open"]').click();
  await expect(card).toBeVisible();
  await expect(card.locator('[data-testid="invite-copy"]')).toContainText('Invite code');
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'invite-open');
  await card.locator('[data-a="inv-fold"]').click();
  await expect(card).toHaveCount(0);

  // me: my status card (Online / Appear offline), my code, Change avatar
  await sheet.locator('[data-testid="social-me"]').click();
  await expect(sheet.locator('[data-testid="social-me-card"]')).toBeVisible();
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'me');
  await sheet.locator('.pl-me-opt[data-v="invisible"]').click();
  await expect(sheet.locator('[data-testid="social-me-card"]')).toHaveCount(0);
  await expect(sheet.locator('[data-testid="social-me"]')).toHaveAttribute('aria-label', /Appear offline/);

  // a DM: docked beside the list on a wide screen (the list stays usable), over the list at its width on a phone
  await unreadRow.locator('[data-a="chat"]').click();
  const chat = game.locator('[data-testid="chat-sheet"]');
  await expect(chat).toBeVisible();
  await expect(chat.locator('.pl-chat-who-h .pl-social-st')).toHaveText('Online');
  await expect(chat.locator('.pl-chat-msg')).toHaveCount(3);
  const [cb, sb] = [await chat.boundingBox(), await sheet.boundingBox()];
  if (touch) expect(Math.round(cb!.width)).toBe(Math.round(sb!.width));
  else {
    expect(cb!.x + cb!.width).toBeLessThanOrEqual(sb!.x + 1);
    await expect(sheet.locator(`.pl-fr[data-code="${friends[1].code}"]`)).toHaveClass(/is-chat/);
  }
  await shot(page, 'dm');
  await chat.locator('[data-a="back"]').click();
  await expect(chat).toHaveCount(0);

  // Recent and Clubs
  await sheet.locator('[role="tab"][data-tab="recent"]').click();
  await expect(sheet.locator('.pl-rc')).toHaveCount(2);
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'recent');
  await sheet.locator('[role="tab"][data-tab="clubs"]').click();
  await expect(sheet.locator('[data-testid="club-code"]')).toBeVisible();
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'clubs');
  await sheet.locator('[role="tab"][data-tab="friends"]').click();

  // More: Ranked and Leaderboards
  await sheet.locator('[data-a="tabs-more"]').click();
  await expect(sheet.locator('.pl-social-moremenu')).toBeVisible();
  // the featured live match lives in More
  await expect(sheet.locator('.pl-social-moremenu [data-testid="social-watch-live"]')).toBeVisible();
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'more');

  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request') as any[];
  for (const r of reqs) expect(JSON.stringify({ op: r.op, args: r.args })).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]/);
});

test('Social panel: empty list and a guest', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    viewport: true,
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
    api: {
      'social.get': { status: 200, body: { ...social, friends: [], requests: { in: [], out: [] }, chat: { unread: 0 }, live: {} } },
      'social.pulse': { status: 204 },
      'growth.invite': { status: 200, body: invite },
      'social.recent': { status: 200, body: recent },
    },
  });
  const game = await openHost(page);
  const btn = game.locator('[data-testid="lobby-social"]');
  await expect(btn).toBeVisible({ timeout: limit(60_000) });
  await btn.click();
  const sheet = game.locator('.pl-social');
  await game.addStyleTag({ content: '.pl-social { animation: none !important; }' });
  await expect(sheet.locator('.pl-social-none')).toContainText('No friends yet');
  // one way to add (Find a player), one share CTA (the invite card's), players from recent matches to add
  await expect(sheet.locator('.pl-social-none [data-a="add-empty"]')).toBeVisible();
  await expect(sheet.locator('[data-a="inv-share"]')).toHaveCount(1);
  await expect(sheet.locator('[data-testid="invite-row"] [data-a="inv-share"]')).toBeVisible();
  await expect(sheet.locator('[data-testid="invite-row"] [data-a="inv-fold"]')).toHaveCount(0);
  await expect(sheet.locator('[data-testid="invite-open"]')).toHaveCount(0);
  await expect(sheet.locator('.pl-rc')).toHaveCount(2);
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'empty');
});
