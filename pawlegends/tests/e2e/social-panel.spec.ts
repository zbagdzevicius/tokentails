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
  requests: { in: [{ code: 'PL-REQQ-0001', name: 'Duke Barkington the Bold', at: Date.now() - 2 * 3_600_000 }, { code: 'PL-REQQ-0002', name: 'Mochi' }], out: [{ code: 'PL-REQQ-0003', name: 'Taffy' }] },
  blocks: [],
  invites: [],
  rev: 'r1',
  chat: { unread: 2 },
  live: { featured: true },
};
// round 5: friends[4] is Away with a status note, friends[2] a favourite; requests say when they were made
(friends[4].presence as Record<string, unknown>).away = true;
Object.assign(friends[4], { note: 0 });
Object.assign(friends[2], { fav: true });
// round 6: friends[3] plays Sage in a ranked match; friends[13] (online) last played with me 2 days ago (4 games)
Object.assign(friends[3].presence, { hero: 'sage' });
Object.assign(friends[13], { played: { at: Date.now() - 2 * 86_400_000 - 60_000, n: 4 } });
// round 8: friends[1] plays on a phone (the mobile mark by the name)
Object.assign(friends[1].presence, { dev: 'm' });
const threads = {
  threads: [
    { id: 't1', with: { code: friends[1].code, name: friends[1].name }, tier: 'text', lastPreview: 'gg! one more? I am queuing ranked right now', lastMine: false, unread: 2, muted: false },
    { id: 't8', with: { code: friends[8].code, name: friends[8].name }, tier: 'text', lastPreview: 'yo', lastMine: false, unread: 1, muted: false },
  ],
};
const chatHistory = {
  thread: { tier: 'text', muted: false },
  messages: [
    { mid: 'm1', at: '2026-11-18T20:00:00.000Z', k: 't', text: 'gg! one more?', mine: false },
    { mid: 'm2', at: '2026-11-18T20:00:30.000Z', k: 't', text: 'I am queuing ranked right now', mine: false },
    { mid: 'm3', at: '2026-11-18T20:01:00.000Z', k: 't', text: 'sure, invite me', mine: true },
  ],
  more: false,
};
const recent = {
  players: [
    { room: 'roomaaaaaaaa', slot: 1, name: 'Marshmallow Fan', team: 'ally', canAdd: true, av: { i: 'h:clem' }, at: Date.now() - 2 * 3_600_000, queue: 'casual', won: true, together: 3, hero: 'clem' },
    { room: 'roomaaaaaaaa', slot: 4, name: 'Rocket Rex', team: 'enemy', canAdd: true, at: Date.now() - 2 * 3_600_000, queue: 'casual', won: true },
  ],
};
const invite = { code: 'EZ77A64', link: 'https://pawlegends.app/?ref=EZ77A64', need: 3, invited: [], accepted: null, claimable: 0, nextCoat: null, earned: 0, cap: 5 };

async function openSheet(
  context: Parameters<typeof mockHost>[0],
  page: Page,
  baseURL: string,
  over: Record<string, { status: number; body?: unknown; delay?: number }> = {},
): Promise<{ game: Frame; sheet: ReturnType<Frame['locator']> }> {
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
      'chat.send': { status: 200, body: { message: { mid: 'm9', at: new Date().toISOString(), k: 'q', id: 0, mine: true } } },
      ...over,
    },
  });
  const game = await openHost(page);
  const btn = game.locator('[data-testid="lobby-social"]');
  await expect(btn).toBeVisible({ timeout: limit(60_000) });
  await btn.click();
  const sheet = game.locator('.pl-social');
  // the e2e build holds CSS animations at their first frame: the sheet's slide-in would leave it 24 px to the right
  await game.addStyleTag({ content: '.pl-social, .pl-chat, .pl-fr-menu, .pl-me-card, .pl-social-moremenu, .pl-inv-sheet, .pl-chat-msgmenu, .pl-fr-scrim { animation: none !important; } .pl-social *, .pl-chat * { transition: none !important; }' });
  await expect(sheet.locator('.pl-fr').first()).toBeVisible();
  // friends to show: the invite folds into the header's gift
  await expect(sheet.locator('[data-testid="invite-open"]')).toBeVisible();
  // the device starts on the default chat dock (a choice remembered by an earlier test would change the layout)
  await game.evaluate(() => {
    try {
      localStorage.removeItem('pl.chat.dock.v1');
    } catch {}
  });
  return { game, sheet };
}

/** Layout facts inside the sheet: overflow, overlaps, text sizes. Returns a list of problems (empty = good). */
async function layoutProblems(game: Frame, touch = false): Promise<string[]> {
  return game.evaluate((touch) => {
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
          // an open popover (More) and the touch row menu (a bottom sheet with its scrim) float over the list on purpose
          // (a DM thread over the list on a phone covers it all on purpose)
          // (round 8: the more-below bar on the list's bottom edge names the headers under it on purpose)
          if (el && !h.contains(el) && !el.closest('.pl-social-moremenu, .pl-fr-menu, .pl-me-card, .pl-fr-scrim, .pl-chat, .pl-more-below, .pl-inv-sheet')) out.push(`group header covered at ${Math.round(x - r.left)},${Math.round(y - r.top)} by .${(el as HTMLElement).className || el.tagName}`);
        }
      const bg = getComputedStyle(h).backgroundColor;
      if (!/^rgb\(/.test(bg)) out.push(`group header not opaque: ${bg}`);
    }
    // nothing is cut: no status, label or menu item ends in an ellipsis or is clipped. A name keeps one line (rows are
    // one height): when it is cut its tooltip holds it whole; the one-line unread preview is cut on purpose too
    for (const el of sheet.querySelectorAll<HTMLElement>('.pl-social-row .pl-social-name, .pl-social-st, .pl-inv-sub, .pl-social-tab span, .pl-social-more span, .pl-group-t, .pl-mi span')) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < body.top || r.top > body.bottom + 400) continue;
      const name = el.classList.contains('pl-social-name');
      if (name && el.scrollHeight > el.clientHeight + 2) out.push(`name on two lines: "${el.textContent}"`);
      if (name && el.title === el.textContent) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) out.push(`text cut: "${el.textContent!.trim().slice(0, 40)}" .${el.className}`);
    }
    // every friend row is one height (a long name or an unread line never makes a row taller)
    const heights = new Set([...sheet.querySelectorAll<HTMLElement>('.pl-social-body .pl-fr, .pl-social-body .pl-rq')].map((r) => Math.round(r.getBoundingClientRect().height)).filter(Boolean));
    if (heights.size > 1) out.push(`rows of different heights: ${[...heights].join(',')}`);
    // the trailing actions share one right edge per column (the row's action, then Chat)
    for (const col of ['.pl-act-1', '.pl-act-2']) {
      const rights = new Set([...sheet.querySelectorAll<HTMLElement>(`.pl-social-body .pl-group-list .pl-fr ${col}`)].filter((b) => b.getBoundingClientRect().width).map((b) => Math.round(b.getBoundingClientRect().right)));
      if (rights.size > 1) out.push(`${col} not aligned: ${[...rights].join(',')}`);
    }
    // an unread badge sits on its icon's corner
    for (const badge of sheet.querySelectorAll<HTMLElement>('.pl-chat-unread')) {
      const svg = badge.parentElement!.querySelector('svg')!.getBoundingClientRect();
      if (!hit(badge.getBoundingClientRect(), svg)) out.push('unread badge detached from its icon');
    }
    // the text floor (round 5): 14 px for every word in the sheet and an open DM; count pills and badges 13 px
    const chat = document.querySelector<HTMLElement>('.pl-chat');
    for (const scope of chat ? [sheet, chat] : [sheet])
      for (const el of scope.querySelectorAll<HTMLElement>('*')) {
        if (el.closest('.pl-av, .pl-cc, svg, .pl-chat-bubble.sticker, .pl-chat-chip.sticker')) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!own) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || r.bottom < body.top - 200 || getComputedStyle(el).visibility === 'hidden') continue;
        const pill = !!el.closest('.pl-group-n, .pl-chat-unread, .pl-back-n, .pl-chat-tab-u, .pl-chat-new, .pl-social-badge, .pl-chat-count, .pl-mb-n');
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < (pill ? 13 : 14)) out.push(`text under ${pill ? 13 : 14}px (${fs}px): "${el.textContent!.trim().slice(0, 30)}" .${el.className}`);
      }
    // targets: 44×44 on touch for every control in the sheet and an open DM (LoL is mouse-only; we are not); with a
    // mouse 40 px at least (WCAG 2.5.8 asks 24)
    const min = touch ? 44 : 40;
    const controls = [...sheet.querySelectorAll<HTMLElement>('button, input, select, [role="tab"]'), ...(chat ? chat.querySelectorAll<HTMLElement>('button, input') : [])];
    for (const b of controls) {
      const r = b.getBoundingClientRect();
      if (!r.width || getComputedStyle(b).display === 'none' || getComputedStyle(b).visibility === 'hidden' || b.closest('[hidden]')) continue;
      // a control scrolled out of the list, or a message's hidden "…" (mouse: hover-only, opacity 0)
      if (b.closest('.pl-social-body') && (r.bottom < body.top || r.top > body.bottom)) continue;
      if (b.classList.contains('pl-chat-more') && getComputedStyle(b).opacity === '0') continue;
      if (b.classList.contains('pl-sr') || (r.width <= 1 && r.height <= 1)) continue;
      if (Math.round(r.height) < min || Math.round(r.width) < min) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)}: ${b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 30)}`);
    }
    // round 6: every popover (my status card, a row menu, More, the search row, the invite card) sits inside the
    // screen, and one taller than its room scrolls (nothing is cut off and unreachable)
    for (const el of document.querySelectorAll<HTMLElement>('.pl-me-card, .pl-fr-menu, .pl-social-moremenu:not([hidden]), .pl-social-searchrow, .pl-add-card, .pl-inv-sheet, .pl-chat-msgmenu')) {
      const r = el.getBoundingClientRect();
      if (!r.height) continue;
      if (r.bottom > innerHeight + 0.5 || r.top < -0.5) out.push(`popover off screen: .${el.className} ${Math.round(r.top)}-${Math.round(r.bottom)} of ${innerHeight}`);
      const oy = getComputedStyle(el).overflowY;
      if (el.scrollHeight > el.clientHeight + 1 && oy !== 'auto' && oy !== 'scroll') out.push(`popover cut without a scroll: .${el.className}`);
    }
    // the list keeps room for rows unless a bottom sheet covers it on purpose
    if (!sheet.querySelector('.pl-fr-scrim') && body.height < 44) out.push(`list squeezed to ${Math.round(body.height)}px`);
    // AA contrast (4.5:1) on every rose pill, badge and CTA
    const lum = (c: string) => {
      const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const el of document.querySelectorAll<HTMLElement>('.pl-social .pl-group-n, .pl-social .pl-chat-unread, .pl-social .pl-btn.cta, .pl-chat .pl-back-n, .pl-chat .pl-chat-tab-u, .pl-chat .pl-chat-new')) {
      if (!el.getBoundingClientRect().width) continue;
      const bg = getComputedStyle(el).backgroundColor;
      if (!/^rgb\(/.test(bg)) continue; // a translucent pill sits on the night panel: its tint is checked by eye
      const [a, b] = [lum(getComputedStyle(el).color), lum(bg)];
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 4.5) out.push(`low contrast ${ratio.toFixed(2)}:1 on .${el.className} "${el.textContent?.trim()}"`);
    }
    // a group header half pushed out by the next one (a sliver over the stuck header)
    for (const h of sheet.querySelectorAll<HTMLElement>('.pl-social-body .pl-group-h')) {
      const r = h.getBoundingClientRect();
      if (r.top < body.top - 0.5 && r.bottom > body.top + 0.5) out.push(`header sliver: ${h.textContent?.trim()} ${Math.round(r.bottom - body.top)}px`);
    }
    return [...new Set(out)];
  }, touch);
}

/** Presence colours (round 5): their own palette, never the bolt of Join/Accept or the rose of unread and requests. */
async function presencePalette(game: Frame): Promise<Record<string, string>> {
  return game.evaluate(() => {
    const out: Record<string, string> = {};
    for (const av of document.querySelectorAll<HTMLElement>('.pl-social .pl-fr .pl-fr-av')) {
      const st = av.dataset.state!;
      if (!out[st]) out[st] = getComputedStyle(av.querySelector('.pl-dot')!).backgroundColor + ' / ' + getComputedStyle(av).getPropertyValue('--ring').trim();
    }
    return out;
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

/**
 * Round 8: every " · " separator inside `sel` has the same room on both sides, measured on the glyphs (no "8m  · Sage"
 * double gap, no "Casual ·Victory"). Returns problems (empty = good).
 */
async function separatorGaps(game: Frame, sel: string): Promise<string[]> {
  return game.evaluate((sel) => {
    const out: string[] = [];
    for (const scope of document.querySelectorAll<HTMLElement>(sel)) {
      if (!scope.getBoundingClientRect().width) continue;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      const chars: { node: Text; i: number; dot: boolean }[] = [];
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const t = n.textContent ?? '';
        if (!n.parentElement?.getClientRects().length) continue;
        for (let i = 0; i < t.length; i++) if (t[i].trim()) chars.push({ node: n, i, dot: t[i] === '·' });
      }
      const rect = (c: { node: Text; i: number }) => {
        const r = document.createRange();
        r.setStart(c.node, c.i);
        r.setEnd(c.node, c.i + 1);
        return r.getBoundingClientRect();
      };
      const gaps: number[] = [];
      chars.forEach((c, k) => {
        if (!c.dot) return;
        const d = rect(c);
        const [p, q] = [chars[k - 1], chars[k + 1]];
        if (p) {
          const pr = rect(p);
          if (pr.width && Math.abs(pr.top - d.top) < 6) gaps.push(d.left - pr.right);
        }
        if (q) {
          const qr = rect(q);
          if (qr.width && Math.abs(qr.top - d.top) < 6) gaps.push(qr.left - d.right);
        }
      });
      if (gaps.length && (Math.max(...gaps) - Math.min(...gaps) > 2 || Math.min(...gaps) < 3))
        out.push(`uneven separators ${gaps.map((g) => g.toFixed(1)).join(',')} in "${scope.textContent?.trim()}"`);
    }
    return out;
  }, sel);
}

/**
 * Round 8: the invite card's buttons form an even grid (each row two equal halves or one full-width button, never a
 * lone half), and its lines end on at least two words (no orphan "coat").
 */
async function inviteCardProblems(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const out: string[] = [];
    for (const card of document.querySelectorAll<HTMLElement>('.pl-social [data-testid="invite-row"]')) {
      const acts = card.querySelector<HTMLElement>('.pl-inv-acts');
      if (!acts || !acts.getBoundingClientRect().width) continue;
      const aw = acts.getBoundingClientRect().width;
      const rows = new Map<number, DOMRect[]>();
      for (const b of acts.children) {
        const r = b.getBoundingClientRect();
        if (!r.width) continue;
        const k = Math.round(r.top);
        rows.set(k, [...(rows.get(k) ?? []), r]);
      }
      for (const [, rs] of rows) {
        if (rs.length === 1 && Math.abs(rs[0].width - aw) > 1) out.push(`lone half-width button (${Math.round(rs[0].width)} of ${Math.round(aw)})`);
        if (rs.length === 2 && Math.abs(rs[0].width - rs[1].width) > 1) out.push(`unequal pair ${Math.round(rs[0].width)} / ${Math.round(rs[1].width)}`);
        if (rs.length > 2) out.push(`${rs.length} buttons on one row`);
      }
      for (const el of card.querySelectorAll<HTMLElement>('.pl-inv-sub')) {
        const node = el.firstChild as Text | null;
        if (!node) continue;
        const text = node.textContent ?? '';
        const tops: number[] = [];
        let at = 0;
        for (const w of text.split(' ')) {
          const r = document.createRange();
          r.setStart(node, at);
          r.setEnd(node, at + w.length);
          tops.push(Math.round(r.getBoundingClientRect().top));
          at += w.length + 1;
        }
        const last = Math.max(...tops);
        if (new Set(tops).size > 1 && tops.filter((t) => t === last).length < 2) out.push(`orphan word on the invite line: "${text}"`);
      }
    }
    return out;
  });
}

/** Round 8: a stuck group header always has its own rows under it (never another header stacked right below). */
async function stuckHeaderProblems(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const out: string[] = [];
    const body = document.querySelector<HTMLElement>('.pl-social .pl-social-body')!;
    const br = body.getBoundingClientRect();
    for (const h of body.querySelectorAll<HTMLElement>('.pl-group-h')) {
      const r = h.getBoundingClientRect();
      if (r.top < br.top - 0.5 && r.bottom > br.top + 0.5) out.push(`header sliver: ${h.textContent?.trim()} ${Math.round(r.bottom - br.top)}px`);
      if (Math.abs(r.top - br.top) > 1 || h.parentElement!.firstElementChild !== h) continue;
      const own = h.parentElement!.getBoundingClientRect();
      // stuck (its section started above the list's top): rows of its own must still show under it
      if (own.top < br.top - 1 && own.bottom - r.bottom < 20) out.push(`stuck header with no rows: ${h.textContent?.trim()} (${Math.round(own.bottom - r.bottom)}px of its rows)`);
    }
    return out;
  });
}

/** Round 8: the row sheet's two columns never leave a lone cell (an odd count leads with a full-width first action). */
async function sheetOrphans(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const out: string[] = [];
    for (const grid of document.querySelectorAll<HTMLElement>('.pl-fr-menu.is-sheet .pl-fr-menu-acts, .pl-fr-menu.is-sheet .pl-fr-menu-danger')) {
      const gw = grid.getBoundingClientRect().width;
      const items = [...grid.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width);
      const cols = new Set(items.map((r) => Math.round(r.left))).size;
      if (cols < 2) continue;
      const rows = new Map<number, DOMRect[]>();
      for (const r of items) rows.set(Math.round(r.top), [...(rows.get(Math.round(r.top)) ?? []), r]);
      [...rows.values()].forEach((rs, i) => {
        if (rs.length === 1 && (i > 0 || Math.abs(rs[0].width - gw) > 1)) out.push(`lone cell on row ${i + 1} (${Math.round(rs[0].width)} of ${Math.round(gw)})`);
      });
    }
    return out;
  });
}

test('Social panel: groups, presence, actions, no overlap at every viewport', async ({ context, page, baseURL }, info) => {
  const touch = info.project.name === 'landscape';
  const { game, sheet } = await openSheet(context, page, baseURL!);
  const views: [number, number][] = touch ? [[844, 390], [667, 375]] : [[1440, 900], [1920, 1080]];

  // groups with counts: requests (open at the top, never folded), favourites, online (lobby/queue/online/away), in
  // match, offline (folded: friends are online), sent
  const groups = sheet.locator('.pl-group-h');
  // round 7: every screen (a phone sideways too) heads its requests with "Friend requests" and a count
  await expect(groups).toHaveCount(6);
  await expect(sheet.locator('[data-group="requests"] .pl-group-n')).toHaveText('2');
  await expect(sheet.locator('[data-group="requests"]')).toHaveJSProperty('tagName', 'H3');
  await expect(sheet.locator('.pl-group[data-g="requests"] .pl-rq')).toHaveCount(2);
  // a request says when it came ("2h ago"), not "Wants to be friends" twice; Accept and Decline weigh the same
  await expect(sheet.locator('.pl-rq[data-code="PL-REQQ-0001"] .pl-social-st')).toHaveText('2h ago');
  await expect(sheet.locator('.pl-rq[data-code="PL-REQQ-0002"] .pl-social-st')).toHaveText('Friend request');
  const [dec, acc] = [await sheet.locator('.pl-rq[data-code="PL-REQQ-0001"] [data-a="decline"] .pl-ic').boundingBox(), await sheet.locator('.pl-rq[data-code="PL-REQQ-0001"] [data-a="accept"] .pl-ic').boundingBox()];
  expect([Math.round(dec!.width), Math.round(dec!.height)]).toEqual([Math.round(acc!.width), Math.round(acc!.height)]);
  // favourites first (after requests), shown once
  await expect(sheet.locator('.pl-group[data-g="fav"] .pl-fr')).toHaveCount(1);
  await expect(sheet.locator(`.pl-fr[data-code="${friends[2].code}"]`)).toHaveCount(1);
  // Away with a status note: its own state and colour, the note after it
  const away = sheet.locator(`.pl-fr[data-code="${friends[4].code}"]`);
  await expect(away.locator('.pl-social-st')).toHaveText('Away');
  await expect(away.locator('.pl-st-note')).toHaveText('Looking for a duo');
  await expect(away.locator('.pl-fr-av')).toHaveAttribute('data-state', 'away');
  // presence has its own palette: no state uses the bolt (Join, Accept) or the rose (unread, requests)
  const palette = await presencePalette(game);
  // (offline rows are folded here)
  expect(Object.keys(palette).sort()).toEqual(['away', 'match', 'online', 'party', 'queue']);
  for (const [st, c] of Object.entries(palette)) {
    expect(c, st).not.toContain('255, 225, 74');
    expect(c, st).not.toMatch(/#ffe14a|#ff3d7f/i);
    expect(c, st).not.toContain('255, 61, 127');
  }
  expect(new Set(Object.values(palette)).size).toBe(5);
  await expect(sheet.locator('[data-group="offline"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(sheet.locator('[data-group="sent"]')).toHaveAttribute('aria-expanded', 'false');
  // the unread friend keeps their presence line and adds the message after it
  const unreadRow = sheet.locator(`.pl-fr[data-code="${friends[1].code}"]`);
  await expect(unreadRow.locator('.pl-social-st')).toHaveText('Online');
  await expect(unreadRow.locator('.pl-social-msg')).toHaveText('gg! one more? I am queuing ranked right now');
  // presence detail: mode and time in a match, seats in a lobby
  await expect(sheet.locator(`.pl-fr[data-code="${friends[3].code}"] .pl-social-st`)).toHaveText(/^In match · Ranked · \d+m$/);
  // round 6: the champion they play (LoL's "In Game · Sage"), and when we last played together on a friend's row
  await expect(sheet.locator(`.pl-fr[data-code="${friends[3].code}"] [data-testid="social-champ"]`)).toHaveText('Sage');
  await expect(sheet.locator(`.pl-fr[data-code="${friends[3].code}"] .pl-fr-main`)).toHaveAttribute('aria-label', /playing Sage/);
  await expect(sheet.locator(`.pl-fr[data-code="${friends[13].code}"] [data-testid="social-played"]`)).toHaveText('Played 2d ago · 4 games');
  // touch (round 8): a free friend (online or away) carries Invite to party as one 44 px icon (one tap, LoL's hover
  // invite); Join and Watch are named beside their icon; Ask stays in the row's sheet
  if (touch) {
    const inv = sheet.locator(`.pl-fr[data-code="${friends[4].code}"] [data-testid="social-invite"]`);
    await expect(inv).toBeVisible();
    const ib = (await inv.boundingBox())!;
    expect([Math.round(ib.width), Math.round(ib.height)]).toEqual([44, 44]);
    await expect(inv.locator('.pl-act-t')).toBeHidden();
    await expect(sheet.locator(`.pl-fr[data-code="${friends[0].code}"] [data-a="join"] .pl-act-t`)).toBeVisible();
    expect(await sheet.locator('.pl-social-body .pl-fr [data-a="ask"]:visible').count()).toBe(0);
    // the names and status lines get the room: a status line is never cut by a button column
    const cut = await game.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.pl-social .pl-fr .pl-st-note')].filter((l) => l.getBoundingClientRect().width > 0 && l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent),
    );
    expect(cut, 'status notes cut on touch').toEqual([]);
  } else await expect(sheet.locator(`.pl-fr[data-code="${friends[4].code}"] [data-testid="social-invite"] .pl-act-t`)).toBeHidden();
  await expect(sheet.locator(`.pl-fr[data-code="${friends[0].code}"] .pl-social-st`)).toHaveText('In lobby · 2/3 · open');
  // on Friends the tab has no badge: requests and unread messages show their own counts (no "4" to misread)
  await expect(sheet.locator('[data-testid="social-unread"]')).toHaveCount(0);
  // one header row (founder Nov 19: no self card, no avatar there: a status dot), no live chip, no search field yet
  await expect(sheet.locator('.pl-social-head [data-testid="social-status"]')).toBeVisible();
  await expect(sheet.locator('.pl-social-head .pl-av, .pl-social-head .pl-me')).toHaveCount(0);
  await expect(sheet.locator('input[name="q"]')).toHaveCount(0);
  await expect(sheet.locator('.pl-social-body [data-testid="social-watch-live"]')).toHaveCount(0);
  // the joinable lobby shows Join (one tap), a free friend a small Invite icon, a closed lobby Ask to join; a queued
  // friend none
  await expect(sheet.locator(`.pl-fr[data-code="${friends[0].code}"] [data-a="join"]`)).toBeVisible();
  await expect(sheet.locator(`.pl-fr[data-code="${friends[2].code}"] [data-a="invite"]`)).toHaveCount(0);
  await expect(sheet.locator(`.pl-fr[data-code="${friends[10].code}"] [data-a="invite"]`)).toHaveCount(0);
  await expect(sheet.locator(`.pl-fr[data-code="${friends[10].code}"] [data-testid="social-ask"]`)).toHaveCount(1);
  await expect(sheet.locator(`.pl-fr[data-code="${friends[4].code}"] [data-a="invite"]`)).toHaveCount(1);
  // the flag sits before the name (a long name's "…" never hides it)
  const flagFirst = await sheet.locator(`.pl-fr[data-code="${friends[1].code}"] .pl-social-nm`).evaluate((nm) => nm.querySelector('.pl-cc')!.getBoundingClientRect().right <= nm.querySelector('.pl-social-name')!.getBoundingClientRect().left + 0.5);
  expect(flagFirst).toBe(true);
  // the unread line: a bubble icon then the text (no stray opening quote)
  await expect(unreadRow.locator('.pl-social-msg svg')).toHaveCount(1);

  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    await realViewport(page, game);
    expect(await layoutProblems(game, touch), `${w}x${h}`).toEqual([]);
    // phones: the open requests, then friends (the list says there is more: the scroll cue); desktop: all online
    // and in-match friends
    expect(await friendsOnFirstScreen(game), `${w}x${h} friends on the first screen`).toBeGreaterThanOrEqual(touch ? (h >= 390 ? 2 : 1) : 10);
    // the list is cut: the scroll cue shows, and a group header below the fold is named on the bottom edge (round 8);
    // a list that fits has neither
    const over = await sheet.locator('.pl-social-body').evaluate((el) => el.scrollHeight > el.clientHeight + 4);
    if (over) await expect(sheet).toHaveClass(/has-more/);
    else await expect(sheet).not.toHaveClass(/has-more/);
    if (!touch && w === 1440) await expect(sheet.locator('[data-testid="social-more-below"]')).toContainText(/Offline/);
    // the chrome above the list: one header row and the tab bar (LoL uses about 90 px)
    const chrome = await game.evaluate(() => document.querySelector('.pl-social .pl-social-body')!.getBoundingClientRect().top - document.querySelector('.pl-social')!.getBoundingClientRect().top);
    expect(chrome, `${w}x${h} chrome`).toBeLessThanOrEqual(touch ? 104 : 112);
    await shot(page, 'list');
    // scrolled a little: the stuck header stays opaque and on top
    await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, 70));
    await page.waitForTimeout(100);
    const scrolledProblems = (await layoutProblems(game, touch)).filter((p) => !p.startsWith('header sliver'));
    expect(scrolledProblems, `${w}x${h} scrolled`).toEqual([]);
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

  // fold and unfold: Offline opens (more rows); Requests has no fold (a click does nothing)
  const before = await sheet.locator('.pl-fr').count();
  await sheet.locator('[data-group="offline"]').click();
  await expect(sheet.locator('[data-group="offline"]')).toHaveAttribute('aria-expanded', 'true');
  expect(await sheet.locator('.pl-fr').count()).toBeGreaterThan(before);
  if (!touch) await sheet.locator('[data-group="requests"]').click();
  await expect(sheet.locator('.pl-group[data-g="requests"] .pl-rq')).toHaveCount(2);
  // the list scrolls (the one scroll region); the sheet itself never does
  expect(await sheet.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(100);
  expect((await layoutProblems(game, touch)).filter((p) => !p.startsWith('header sliver'))).toEqual([]);
  // at the end of the list the scroll cue goes
  await expect(sheet).not.toHaveClass(/has-more/);
  await shot(page, 'offline-open');
  if (!touch) {
    // the last row's menu opens in view, with no half-pushed group header over the stuck one
    const last = sheet.locator('.pl-group[data-g="offline"] .pl-fr').last();
    await last.locator('.pl-fr-main').click();
    await expect(sheet.locator('.pl-fr-menu')).toBeVisible();
    expect(await layoutProblems(game, touch)).toEqual([]);
    await shot(page, 'menu-last');
    await page.keyboard.press('Escape');
    await expect(sheet.locator('.pl-fr-menu')).toHaveCount(0);
  }
  await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, 0));

  // the row menu: by touch a tap on the row, by mouse a click; keyboard: Enter opens, arrows move, Esc closes
  const row = sheet.locator(`.pl-fr[data-code="${friends[3].code}"]`);
  // what follows the row in the list (the next group's header): it must not move when the menu opens
  const nextRow = sheet.locator('[data-group="offline"]');
  const nextY = touch ? 0 : (await nextRow.boundingBox())!.y;
  if (touch) await row.locator('.pl-fr-main').tap();
  else await row.locator('.pl-fr-main').click();
  const menu = sheet.locator('.pl-fr-menu');
  await expect(menu).toBeVisible();
  if (!touch) {
    // round 7: with a mouse a floating context menu (LoL): the rows below stay where they were, one column of
    // actions, inside the sheet, by its row
    await expect(menu).toHaveClass(/is-pop/);
    expect((await nextRow.boundingBox())!.y).toBe(nextY);
    const xs = new Set(await menu.locator('[role="menuitem"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left))));
    expect(xs.size, 'one column').toBe(1);
    const [mb, sbx, rb] = [(await menu.boundingBox())!, (await sheet.boundingBox())!, (await row.boundingBox())!];
    expect(mb.x).toBeGreaterThanOrEqual(sbx.x);
    expect(mb.x + mb.width).toBeLessThanOrEqual(sbx.x + sbx.width + 0.5);
    expect(Math.min(Math.abs(mb.y - (rb.y + rb.height)), Math.abs(mb.y + mb.height - rb.y))).toBeLessThanOrEqual(4);
    expect(mb.width).toBeLessThanOrEqual(260);
  }
  await expect(menu.locator('.pl-fr-menu-name')).toHaveText(friends[3].name);
  await expect(menu.locator('[data-a="chat"]')).toBeVisible();
  // a friend in a match: invite them for after it (LoL's in-game invite), one short line; no greyed dead end
  await expect(menu.locator('[data-testid="social-invite-busy"]')).toHaveCount(0);
  await expect(menu.locator('[data-testid="social-invite-later"]')).toHaveText('Invite when their match ends');
  expect((await menu.locator('[data-testid="social-invite-later"]').boundingBox())!.height).toBeLessThanOrEqual(52);
  if (touch) {
    // touch: a bottom sheet inside the panel, never past the bottom of the screen; it names the friend once
    await expect(menu).toHaveClass(/is-sheet/);
    const mb = (await menu.boundingBox())!;
    expect(mb.y).toBeGreaterThanOrEqual(0);
    expect(mb.y + mb.height).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
    // it shows the friend (avatar with status, name, status line) and ends with Cancel
    await expect(menu.locator('.pl-fr-menu-who .pl-fr-av')).toHaveAttribute('data-state', 'match');
    await expect(menu.locator('.pl-fr-menu-who .pl-social-st')).toHaveText(/^In match/);
    await expect(menu.locator('.pl-fr-cancel')).toBeVisible();
  } else await expect(menu.locator('.pl-fr-menu-name')).toHaveClass(/pl-sr/);
  expect(await layoutProblems(game, touch)).toEqual([]);
  await shot(page, 'menu');
  // queue the invite: the row says so, the menu offers to cancel it
  await menu.locator('[data-testid="social-invite-later"]').click();
  await expect(menu).toHaveCount(0);
  await expect(sheet.locator('.pl-social-note')).toContainText('gets your invite when their match ends');
  await expect(row.locator('[data-testid="social-later-tag"]')).toHaveText('Invite queued');
  if (touch) await row.locator('.pl-fr-main').tap();
  else await row.locator('.pl-fr-main').click();
  await expect(menu.locator('[data-testid="social-later-cancel"]')).toBeVisible();
  await menu.locator('[data-testid="social-later-cancel"]').click();
  await expect(row.locator('[data-testid="social-later-tag"]')).toHaveCount(0);
  // a joinable lobby's menu offers Join and no contradicting "In another lobby"; a friend we played with shows when
  const joinRow = sheet.locator(`.pl-fr[data-code="${friends[0].code}"]`);
  if (touch) await joinRow.locator('.pl-fr-main').tap();
  else await joinRow.locator('.pl-fr-main').click();
  await expect(menu.locator('[data-a="join"]')).toBeVisible();
  await expect(menu.locator('[data-testid="social-invite-busy"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  const favRow = sheet.locator(`.pl-fr[data-code="${friends[13].code}"]`);
  await favRow.scrollIntoViewIfNeeded();
  if (touch) await favRow.locator('.pl-fr-main').tap();
  else await favRow.locator('.pl-fr-main').click();
  await expect(menu.locator('[data-testid="social-menu-played"]')).toHaveText('Played together 2d ago · 4 games');
  expect(await layoutProblems(game, touch)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(sheet).toBeVisible();
  if (touch) {
    // a tap on the scrim closes the sheet
    await row.locator('.pl-fr-main').tap();
    await expect(menu).toBeVisible();
    await sheet.locator('.pl-fr-scrim').tap({ position: { x: 20, y: 20 } });
    await expect(menu).toHaveCount(0);
    // Cancel closes it too
    await row.locator('.pl-fr-main').tap();
    await menu.locator('.pl-fr-cancel').tap();
    await expect(menu).toHaveCount(0);
  }

  if (!touch) {
    // one Tab stop for the whole list (a roving tabindex); arrows move inside it. Tab walks no buttons (founder, Nov 19;
    // input/tabGuard.ts): focus stays on the row
    const navStops = await game.evaluate(() => ({
      nav: document.querySelectorAll('.pl-social-body [data-nav][tabindex="0"]').length,
      acts: document.querySelectorAll('.pl-social-body .pl-fr-acts button:not([tabindex="-1"])').length,
    }));
    expect(navStops).toEqual({ nav: 1, acts: 0 });
    await sheet.locator('.pl-social-body [data-nav][tabindex="0"]').focus();
    await page.keyboard.press('Tab');
    expect(await game.evaluate(() => document.activeElement?.matches('.pl-social-body [data-nav][tabindex="0"]') ?? false)).toBe(true);
    // a request: Decline and Accept are one row (ArrowLeft from Accept reaches Decline)
    await sheet.locator('.pl-rq[data-code="PL-REQQ-0001"] [data-a="accept"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(sheet.locator('.pl-rq[data-code="PL-REQQ-0001"] [data-a="decline"]')).toBeFocused();
    // round 7: a request's Tab stop is the person, never Accept: Enter there accepts nothing; ArrowRight reaches
    // Decline, then Accept
    const rqMain = sheet.locator('.pl-rq[data-code="PL-REQQ-0001"] .pl-rq-main');
    await expect(sheet.locator('.pl-rq [data-a="accept"][data-nav]')).toHaveCount(0);
    await rqMain.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    expect((await received(page)).filter((m: any) => m.type === 'api-request' && m.op === 'friend.accept')).toHaveLength(0);
    await page.keyboard.press('ArrowRight');
    await expect(sheet.locator('.pl-rq[data-code="PL-REQQ-0001"] [data-a="decline"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(sheet.locator('.pl-rq[data-code="PL-REQQ-0001"] [data-a="accept"]')).toBeFocused();
    // Home lands on the first request in full view under its stuck "Friend requests" heading (never behind it)
    await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, 300));
    await sheet.locator(`.pl-fr[data-code="${friends[2].code}"] .pl-fr-main`).focus();
    await page.keyboard.press('Home');
    await expect(sheet.locator('.pl-social-body [data-nav]').first()).toBeFocused();
    const underHead = await game.evaluate(() => {
      const f = document.activeElement!.closest('.pl-social-row')!.getBoundingClientRect();
      const body = document.querySelector('.pl-social-body')!.getBoundingClientRect();
      const heads = [...document.querySelectorAll('.pl-social-body .pl-group-h')].map((h) => h.getBoundingClientRect()).filter((h) => h.top <= body.top + 1 && h.bottom > body.top);
      const stuck = Math.max(body.top, ...heads.map((h) => h.bottom));
      return { top: f.top, stuck, bottom: f.bottom, bodyBottom: body.bottom };
    });
    expect(underHead.top, 'focused row under the stuck header').toBeGreaterThanOrEqual(underHead.stuck - 0.5);
    expect(underHead.bottom).toBeLessThanOrEqual(underHead.bodyBottom + 0.5);
    const main = sheet.locator(`.pl-fr[data-code="${friends[2].code}"] .pl-fr-main`);
    await main.focus();
    await expect(main).toHaveAttribute('tabindex', '0');
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
    // Home and End jump to the first and the last row (no half-pushed header after the jump), PageDown moves a screen
    await page.keyboard.press('End');
    const lastNav = sheet.locator('[data-nav]').last();
    await expect(lastNav).toBeFocused();
    expect(await layoutProblems(game, touch)).toEqual([]);
    await page.keyboard.press('Home');
    await expect(sheet.locator('[data-nav]').first()).toBeFocused();
    await page.keyboard.press('PageDown');
    const after = await game.evaluate(() => [...document.querySelectorAll('.pl-social [data-nav]')].indexOf(document.activeElement!));
    expect(after).toBeGreaterThan(3);
    await main.focus();
    // Space opens the row menu; Enter opens the chat (LoL)
    await page.keyboard.press(' ');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[role="menuitem"]:not([disabled])').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(main).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(game.locator('[data-testid="chat-sheet"]')).toBeVisible();
    await expect(game.locator('[data-testid="chat-sheet"] .pl-chat-who-h .pl-social-name')).toHaveText(friends[2].name);
    // round 7: focus lands in the composer (LoL), and Tab stays inside the thread
    await expect(game.locator('[data-testid="chat-sheet"] [data-testid="chat-input"]')).toBeFocused();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await game.evaluate(() => !!document.activeElement?.closest('[data-testid="chat-sheet"]')), `Tab ${i + 1} stays in the chat`).toBe(true);
    }
    // one Esc closes the thread only: the panel stays, focus is back on the friend's row; a second Esc closes the panel
    await game.locator('[data-testid="chat-sheet"] [data-testid="chat-input"]').focus();
    await page.keyboard.press('Escape');
    await expect(game.locator('[data-testid="chat-sheet"]')).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(main).toBeFocused();
    // tabs: arrows move and select
    await sheet.locator('[role="tab"][data-tab="friends"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(sheet.locator('[role="tab"][data-tab="clubs"]')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(sheet.locator('[role="tab"][data-tab="friends"]')).toHaveAttribute('aria-selected', 'true');
  } else {
    // touch (round 8): Invite is one tap on the row's 44 px icon, and the sheet's first action too; Ask lives in the
    // sheet; chat shows only when unread
    await expect(sheet.locator(`.pl-fr[data-code="${friends[4].code}"] [data-testid="social-invite"]`)).toBeVisible();
    await expect(sheet.locator(`.pl-fr[data-code="${friends[4].code}"] [data-a="chat"]`)).toBeHidden();
    await sheet.locator(`.pl-fr[data-code="${friends[4].code}"] .pl-fr-main`).tap();
    await expect(menu.locator('[role="menuitem"]').first()).toHaveAttribute('data-a', 'invite');
    await menu.locator('.pl-fr-cancel').tap();
    // the closed lobby's Ask to join (in its sheet) sends a "Wanna play?" to their DM
    await sheet.locator(`.pl-fr[data-code="${friends[10].code}"] .pl-fr-main`).scrollIntoViewIfNeeded();
    await sheet.locator(`.pl-fr[data-code="${friends[10].code}"] .pl-fr-main`).tap();
    await menu.locator('[role="menuitem"][data-a="ask"]').tap();
    await expect(sheet.locator('.pl-social-note')).toContainText('Asked');
    await expect.poll(async () => ((await received(page)).filter((m: any) => m.type === 'api-request' && m.op === 'chat.send').at(-1) as any)?.args).toMatchObject({ k: 'q', pid: 0 });
    await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, 0));
    // Join is a 44 px target
    const jb = await sheet.locator(`.pl-fr[data-code="${friends[0].code}"] [data-a="join"]`).boundingBox();
    expect(Math.round(jb!.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(jb!.height)).toBeGreaterThanOrEqual(44);
    await expect(unreadRow.locator('[data-a="chat"]')).toBeVisible();
  }

  // search: Search in the tab bar opens the field; it filters as you type
  await sheet.locator('[data-a="search"]').click();
  await expect(sheet.locator('input[name="q"]')).toBeFocused();
  await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, 200));
  await sheet.locator('input[name="q"]').fill('bark');
  await expect(sheet.locator('.pl-fr')).toHaveCount(2);
  await expect(sheet.locator('.pl-rq')).toHaveCount(1);
  // the matches start at the top, the matched letters are marked, and the row's one × is the only one
  expect(await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(sheet.locator('.pl-fr .pl-hl').first()).toHaveText(/bark/i);
  await expect(sheet.locator('.pl-social-searchrow button')).toHaveCount(1);
  expect(await layoutProblems(game, touch)).toEqual([]);
  await shot(page, 'search');
  await sheet.locator('input[name="q"]').fill('Zorro');
  await expect(sheet.locator('[data-testid="social-search-none"]')).toBeVisible();
  expect(await layoutProblems(game, touch)).toEqual([]);
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
  expect(await layoutProblems(game, touch)).toEqual([]);
  await shot(page, 'add');
  await addCard.locator('[data-a="add-cancel"]').click();
  await expect(addCard).toHaveCount(0);

  // the invite: folded into the header's gift (friends first); the gift opens the card at the top of the list
  const card = sheet.locator('[data-testid="invite-row"]');
  await expect(card).toHaveCount(0);
  await sheet.locator('[data-testid="invite-open"]').click();
  await expect(card).toBeVisible();
  // founder, Nov 20: no invite code on the card (Share link only)
  await expect(card.locator('[data-testid="invite-share"]')).toBeVisible();
  await expect(card.locator('[data-testid="invite-copy"]')).toHaveCount(0);
  await expect(card).not.toContainText('Invite code');
  await expect(sheet.locator('[data-testid="invite-open"]')).toHaveAttribute('aria-expanded', 'true');
  expect(await layoutProblems(game, touch)).toEqual([]);
  expect(await inviteCardProblems(game)).toEqual([]);
  await shot(page, 'invite-open');
  if (touch) {
    // round 8: a short screen opens the card as a sheet over the list; the list itself keeps its friends in place
    await expect(sheet.locator('.pl-inv-sheet [data-testid="invite-row"]')).toBeVisible();
    expect(await friendsOnFirstScreen(game)).toBeGreaterThanOrEqual(1);
    // the first Esc folds the card (the panel stays), focus back on the gift
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect(sheet.locator('.pl-social-body')).toBeVisible();
    await expect(sheet.locator('[data-testid="invite-open"]')).toBeFocused();
    await sheet.locator('[data-testid="invite-open"]').click();
    await expect(card).toBeVisible();
  }
  // one popover at a time: the status card folds the open invite card away (never stacked)
  if (touch) await sheet.locator('.pl-inv-sheet [data-a="inv-fold"]').click();
  await sheet.locator('[data-testid="social-status"]').click();
  await expect(sheet.locator('[data-testid="social-me-card"]')).toBeVisible();
  await expect(card).toHaveCount(0);
  // touch: the status card is a bottom sheet over a scrim; its × (or the scrim) closes it
  if (touch) await sheet.locator('.pl-me-card [data-a="me-close"]').click();
  else {
    await sheet.locator('[data-testid="social-status"]').click();
    await expect(card).toBeVisible();
    await card.locator('[data-a="inv-fold"]').click();
  }
  await expect(card).toHaveCount(0);

  // my status card (Online / Away / Appear offline), a status note, my code; no Change avatar (Profile only)
  const listTop = (await sheet.locator('.pl-social-body').boundingBox())!.y;
  await sheet.locator('[data-testid="social-status"]').click();
  await expect(sheet.locator('[data-testid="social-me-card"]')).toBeVisible();
  await expect(sheet.locator('.pl-me-opt')).toHaveCount(3);
  await expect(sheet.locator('[data-testid="avatar-open"]')).toHaveCount(0);
  // round 7: with a mouse it floats under the header (the list does not move); touch: a bottom sheet
  expect((await sheet.locator('.pl-social-body').boundingBox())!.y, 'the list stays put under the me card').toBe(listTop);
  expect(await layoutProblems(game, touch)).toEqual([]);
  await shot(page, 'me');
  if (touch) {
    // a bottom sheet inside the screen at every phone size; its last control (Copy my name) can be reached
    await expect(sheet.locator('.pl-me-card')).toHaveClass(/is-sheet/);
    for (const [w, h] of [[844, 390], [667, 375]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(200);
      expect(await layoutProblems(game, touch), `${w}x${h} me`).toEqual([]);
      await sheet.locator('.pl-me-card [data-a="copy"]').scrollIntoViewIfNeeded();
      const ab = (await sheet.locator('.pl-me-card [data-a="copy"]').boundingBox())!;
      expect(ab.y + ab.height, `${w}x${h} copy name on screen`).toBeLessThanOrEqual(h + 0.5);
      // round 7: the three statuses each on one line ("Appear offline" never wraps)
      const lines = await sheet.locator('.pl-me-opt b').evaluateAll((els) => els.map((b) => Math.round(b.getBoundingClientRect().height / parseFloat(getComputedStyle(b).lineHeight || '18'))));
      expect(lines, `${w}x${h} status labels on one line`).toEqual([1, 1, 1]);
      await shot(page, 'me-sheet');
    }
  }
  await sheet.locator('[data-testid="social-note"]').selectOption('2');
  await expect(sheet.locator('[data-testid="social-status"]')).toHaveAttribute('aria-label', /Chill games only/);
  await expect.poll(async () => ((await received(page)).filter((m: any) => m.type === 'api-request' && m.op === 'social.me').at(-1) as any)?.args).toEqual({ note: 2 });
  await sheet.locator('.pl-me-opt[data-v="away"]').click();
  await expect(sheet.locator('[data-testid="social-status"]')).toHaveAttribute('aria-label', /: Away/);
  await sheet.locator('[data-testid="social-status"]').click();
  await sheet.locator('.pl-me-opt[data-v="invisible"]').click();
  await expect(sheet.locator('[data-testid="social-me-card"]')).toHaveCount(0);
  await expect(sheet.locator('[data-testid="social-status"]')).toHaveAttribute('aria-label', /Appear offline/);

  // a DM: docked beside the list on a wide screen (the list stays usable), over the list at its width on a phone
  await unreadRow.locator('[data-a="chat"]').click();
  const chat = game.locator('[data-testid="chat-sheet"]');
  await expect(chat).toBeVisible();
  await expect(chat.locator('.pl-chat-who-h .pl-social-st')).toHaveText('Online');
  await expect(chat.locator('.pl-chat-msg')).toHaveCount(3);
  const [cb, sb] = [await chat.boundingBox(), await sheet.boundingBox()];
  // opening the thread reads it: the row's badge and quoted preview go at once
  await expect(unreadRow.locator('[data-testid="chat-unread"]')).toHaveCount(0);
  await expect(unreadRow.locator('.pl-social-msg')).toHaveCount(0);
  // one time line over the three messages (minutes apart); no "…" showing on every bubble
  await expect(chat.locator('.pl-chat-day')).toHaveCount(1);
  // round 7: each run of messages ends with its own time (theirs at 20:00/20:00:30, mine at 20:01: two runs)
  const times = chat.locator('[data-testid="chat-time"]');
  await expect(times).toHaveCount(2);
  for (const t of await times.all()) await expect(t).toHaveText(/^\d\d:\d\d$/);
  expect(await chat.locator('.pl-chat-bubble').first().getAttribute('title')).toMatch(/\d\d:\d\d/);
  for (const more of await chat.locator('.pl-chat-more').all())
    expect(await more.evaluate((el) => getComputedStyle(el).opacity === '0' || el.getBoundingClientRect().width <= 1)).toBe(true);
  await expect(chat.locator('[data-a="tray"]')).toHaveAttribute('aria-label', 'Quick phrases and stickers');
  // several conversations (LoL's chat tabs): this one and the other unread thread, with its count
  const tabs = chat.locator('[data-testid="chat-tabs"] [role="tab"]');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1).locator('.pl-chat-tab-u')).toHaveText('1');
  // round 6: the selected tab names the friend; the head shows no second avatar or name, Back no second count
  await expect(chat.locator('.pl-chat-head > .pl-fr-av')).toHaveCount(0);
  await expect(chat.locator('.pl-chat-head .pl-social-name')).toHaveClass(/pl-sr/);
  await expect(chat.locator('.pl-back-n')).toHaveCount(0);
  // the selected tab's name is whole when the strip has room
  expect(await tabs.nth(0).locator('.pl-chat-tab-n').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await layoutProblems(game, touch)).toEqual([]);
  if (touch) {
    // touch: a tap on a friend's message shows its "…" as a 44 px target
    await chat.locator('.pl-chat-msg:not(.mine) .pl-chat-bubble').first().tap();
    const more = chat.locator('.pl-chat-msg.is-picked .pl-chat-more');
    await expect(more).toBeVisible();
    const mb = (await more.boundingBox())!;
    expect(Math.min(mb.width, mb.height)).toBeGreaterThanOrEqual(44);
    expect(await layoutProblems(game, touch)).toEqual([]);
    await shot(page, 'dm-picked');
    // with tabs the counts sit on the tabs (Back has none of its own: never the same count twice)
    await expect(chat.locator('[data-a="back"] .pl-back-n')).toHaveCount(0);
  }
  // a tab switches the conversation without going Back; the other thread is read now
  await tabs.nth(1).click();
  await expect(chat.locator('.pl-chat-who-h .pl-social-name')).toHaveText(friends[8].name);
  await expect(chat.locator('[data-testid="chat-tabs"] [role="tab"]')).toHaveCount(2);
  await expect(chat.locator('[data-testid="chat-tabs"] [role="tab"]').nth(1)).toHaveAttribute('aria-selected', 'true');
  await shot(page, 'dm-tabs');
  await chat.locator('[data-testid="chat-tabs"] [role="tab"]').nth(0).click();
  await expect(chat.locator('.pl-chat-who-h .pl-social-name')).toHaveText(friends[1].name);
  if (touch) expect(Math.round((await chat.boundingBox())!.width)).toBe(Math.round(sb!.width));
  else {
    expect(cb!.x + cb!.width).toBeLessThanOrEqual(sb!.x + 1);
    await expect(sheet.locator(`.pl-fr[data-code="${friends[1].code}"]`)).toHaveClass(/is-chat/);
    // docked clear of the bottom menu bar, at both desktop sizes
    for (const [w, h] of [[1920, 1080], [1440, 900]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(300);
      const clash = await game.evaluate(() => {
        const c = document.querySelector('[data-testid="chat-sheet"]')!.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('.hm-nav, .lb-rail')].some((n) => {
          const r = n.getBoundingClientRect();
          return r.width > 0 && r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top;
        });
      });
      expect(clash, `${w}x${h} DM over the menu bar`).toBe(false);
      await shot(page, 'dm');
    }
    // Minimise folds it to its head (LoL's chat tab); a click on the head opens it again
    await chat.locator('[data-a="min"]').click();
    await expect(chat).toHaveClass(/is-min/);
    expect((await chat.boundingBox())!.height).toBeLessThanOrEqual(72);
    await shot(page, 'dm-min');
    await chat.locator('.pl-chat-head').click({ position: { x: 60, y: 20 } });
    await expect(chat).not.toHaveClass(/is-min/);
    await expect(chat.locator('.pl-chat-msg')).toHaveCount(3);
    // round 7: one row of chrome (the tabs are the head; options, minimise and close on the same row), a real chat
    // window (at least 280 px of messages at 1440x900), the newest message on the composer
    await expect(chat.locator('.pl-chat-head [data-testid="chat-tabs"]')).toHaveCount(1);
    const rowY = await chat.evaluate((el) => ['[data-testid="chat-tabs"]', '[data-a="min"]', '[data-a="back"]'].map((q) => {
      const r = el.querySelector(q)!.getBoundingClientRect();
      return Math.round(r.top + r.height / 2);
    }));
    expect(Math.max(...rowY) - Math.min(...rowY), 'tabs, minimise and close on one row').toBeLessThanOrEqual(4);
    await expect(chat.locator('.pl-chat-tab[aria-selected="true"] .pl-chat-tab-s')).toHaveText('Online');
    const room = await chat.evaluate((el) => {
      const ul = el.querySelector('.pl-chat-list')!;
      const last = [...ul.querySelectorAll('.pl-chat-msg')].at(-1)!.getBoundingClientRect();
      return { h: ul.clientHeight, gap: ul.getBoundingClientRect().bottom - last.bottom };
    });
    expect(room.h, 'messages area').toBeGreaterThanOrEqual(280);
    expect(room.gap, 'newest message on the composer').toBeLessThanOrEqual(40);
    // the corner grip resizes the window (drag up and left: bigger; arrow keys too), within the screen
    const before = (await chat.boundingBox())!;
    const grip = chat.locator('[data-testid="chat-grip"]');
    const gb = (await grip.boundingBox())!;
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x - 60, gb.y - 80, { steps: 4 });
    await page.mouse.up();
    const grown = (await chat.boundingBox())!;
    expect(Math.round(grown.width - before.width)).toBeGreaterThanOrEqual(50);
    expect(Math.round(grown.height - before.height)).toBeGreaterThanOrEqual(70);
    await grip.focus();
    await page.keyboard.press('ArrowDown');
    expect(Math.round((await chat.boundingBox())!.height)).toBe(Math.round(grown.height) - 24);
    expect(await layoutProblems(game, touch)).toEqual([]);
    await shot(page, 'dm-resized');
    // the docked × closes this conversation: the other open one takes its place, then the last × closes chat
    await chat.locator('[data-a="back"]').click();
    await expect(chat).toBeVisible();
    await expect(chat.locator('.pl-chat-who-h .pl-social-name')).toHaveText(friends[8].name);
    await expect(chat.locator('[data-testid="chat-tabs"]')).toHaveCount(0);
  }
  if (touch) await shot(page, 'dm');
  await chat.locator('[data-a="back"]').click();
  await expect(chat).toHaveCount(0);

  // favourites: pin from the row menu, the friend moves to the top group
  const pinRow = sheet.locator(`.pl-fr[data-code="${friends[4].code}"]`);
  if (touch) await pinRow.locator('.pl-fr-main').tap();
  else await pinRow.locator('.pl-fr-main').click();
  await sheet.locator('[data-testid="social-fav"]').click();
  await expect(sheet.locator(`.pl-group[data-g="fav"] .pl-fr[data-code="${friends[4].code}"]`)).toHaveCount(1);
  await expect.poll(async () => ((await received(page)).filter((m: any) => m.type === 'api-request' && m.op === 'social.me').at(-1) as any)?.args).toEqual({ code: friends[4].code, favOn: true });

  // Clubs: the header stays the same (my status, the gift, Add, Close: no layout jump); founder Nov 19: no Recent tab
  const headH = (await sheet.locator('.pl-social-head').boundingBox())!.height;
  await expect(sheet.locator('[role="tab"][data-tab="recent"]')).toHaveCount(0);
  await sheet.locator('[role="tab"][data-tab="clubs"]').click();
  await expect(sheet.locator('[data-testid="club-code"]')).toBeVisible();
  await expect(sheet.locator('.pl-social-head [data-testid="social-status"]')).toBeVisible();
  await expect(sheet.locator('.pl-social-head [data-testid="invite-open"]')).toBeVisible();
  // round 8: the gift is pressed only while its card is in sight (never on Clubs)
  await expect(sheet.locator('[data-testid="invite-open"]')).toHaveAttribute('aria-expanded', 'false');
  expect((await sheet.locator('.pl-social-head').boundingBox())!.height).toBe(headH);
  await expect(sheet.locator('[data-a="search"]')).toBeVisible();
  expect(await layoutProblems(game, touch)).toEqual([]);
  await shot(page, 'clubs');
  await sheet.locator('[role="tab"][data-tab="friends"]').click();

  // More: Ranked and the live match (founder Nov 19: no leaderboards, no Compact list here)
  await sheet.locator('[data-a="tabs-more"]').click();
  await expect(sheet.locator('.pl-social-moremenu')).toBeVisible();
  await expect(sheet.locator('.pl-social-moremenu [data-tab="ranked"]')).toBeVisible();
  await expect(sheet.locator('.pl-social-moremenu [data-tab="boards"], [data-testid="social-density"]')).toHaveCount(0);
  // the featured live match lives in More
  await expect(sheet.locator('.pl-social-moremenu [data-testid="social-watch-live"]')).toBeVisible();
  expect(await layoutProblems(game, touch)).toEqual([]);
  await shot(page, 'more');
  await page.keyboard.press('Escape');

  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request') as any[];
  for (const r of reqs) expect(JSON.stringify({ op: r.op, args: r.args })).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]/);
});

test('Social panel: empty list and a guest', async ({ context, page, baseURL }, info) => {
  const touch = info.project.name === 'landscape';
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
  await game.addStyleTag({ content: '.pl-social, .pl-inv-sheet, .pl-fr-scrim, .pl-fr-menu, .pl-chat-msgmenu { animation: none !important; }' });
  await expect(sheet.locator('.pl-social-none')).toContainText('No friends yet');
  // one way to add (Find a player), one share CTA (the invite card's), players from recent matches to add
  await expect(sheet.locator('.pl-social-none [data-a="add-empty"]')).toBeVisible();
  await expect(sheet.locator('[data-a="inv-share"]')).toHaveCount(1);
  await expect(sheet.locator('[data-testid="invite-row"] [data-a="inv-share"]')).toBeVisible();
  await expect(sheet.locator('[data-testid="invite-row"] [data-a="inv-fold"]')).toHaveCount(0);
  await expect(sheet.locator('[data-testid="invite-open"]')).toHaveCount(0);
  await expect(sheet.locator('.pl-rc')).toHaveCount(2);
  expect(await layoutProblems(game, touch)).toEqual([]);
  // the coat is promised once (the invite card), never again in the empty line
  expect(await sheet.evaluate((el) => (el.textContent ?? '').split('you both get a coat').length - 1)).toBe(1);
  // round 8: the card's buttons are an even grid, and its line ends on two words at least
  expect(await inviteCardProblems(game)).toEqual([]);
  // founder, Nov 20: no "Enter a code" (the code is not typed in the game any more)
  await expect(sheet.locator('[data-testid="invite-enter"]')).toHaveCount(0);
  // a sideways phone: Share link sits above the fold
  for (const [w, h] of touch ? ([[844, 390], [667, 375]] as const) : ([] as const)) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    for (const id of ['invite-share']) {
      const b = (await sheet.locator(`[data-testid="${id}"]`).boundingBox())!;
      expect(b.y + b.height, `${w}x${h} ${id} above the fold`).toBeLessThanOrEqual(h + 0.5);
    }
    // round 8: "No friends yet" and Find come first, on one row above the fold; nothing repeats the card's offer
    const empty = sheet.locator('[data-testid="social-empty"]');
    const eb = (await empty.boundingBox())!;
    const card = (await sheet.locator('[data-testid="invite-row"]').boundingBox())!;
    expect(eb.y + eb.height, `${w}x${h} empty line before the card`).toBeLessThanOrEqual(card.y + 0.5);
    const fb = (await empty.locator('[data-a="add-empty"]').boundingBox())!;
    expect(fb.y + fb.height, `${w}x${h} Find above the fold`).toBeLessThanOrEqual(h + 0.5);
    expect(await sheet.evaluate((el) => (el.textContent ?? '').includes('share your invite'))).toBe(false);
    expect(await inviteCardProblems(game)).toEqual([]);
    expect(await layoutProblems(game, touch)).toEqual([]);
    await shot(page, 'empty-short');
  }
  await shot(page, 'empty');
  // a phone held upright: the panel takes the whole width
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const box = (await sheet.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(390);
  expect(await layoutProblems(game, touch)).toEqual([]);
  await shot(page, 'empty');
});

test('Social panel: one friend fills the panel with a way to find more', async ({ context, page, baseURL }, info) => {
  const touch = info.project.name === 'landscape';
  await mockHost(context, baseURL!, {
    viewport: true,
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
    api: {
      'social.get': { status: 200, body: { ...social, friends: [friends[7]], requests: { in: [], out: [] }, chat: { unread: 0 }, live: {} } },
      'social.pulse': { status: 204 },
      'chat.list': { status: 200, body: { threads: [] } },
      'growth.invite': { status: 200, body: invite },
    },
  });
  const game = await openHost(page);
  const btn = game.locator('[data-testid="lobby-social"]');
  await expect(btn).toBeVisible({ timeout: limit(60_000) });
  await btn.click();
  const sheet = game.locator('.pl-social');
  await game.addStyleTag({ content: '.pl-social, .pl-inv-sheet, .pl-fr-scrim, .pl-fr-menu, .pl-chat-msgmenu { animation: none !important; }' });
  await expect(sheet.locator('.pl-fr')).toHaveCount(1);
  const grow = sheet.locator('[data-testid="social-grow"]');
  await expect(grow).toBeVisible();
  await expect(grow.locator('[data-a="add-empty"]')).toBeVisible();
  expect(await layoutProblems(game, touch)).toEqual([]);
  await shot(page, 'one');
  await grow.locator('[data-a="add-empty"]').click();
  await expect(sheet.locator('[data-testid="social-add-input"]')).toBeFocused();
});

test('Social panel: a phone held upright with friends (full width, 44 px targets, requests open, DM tabs)', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch only');
  const { game, sheet } = await openSheet(context, page, baseURL!, { 'chat.history': { status: 200, body: chatHistory, delay: 1500 } });
  await page.setViewportSize({ width: 390, height: 844 });
  // the game's "turn your phone sideways" overlay covers every screen upright: hidden here to test the panel itself
  await game.addStyleTag({ content: '.pl-rotate { display: none !important; }' });
  await page.waitForTimeout(300);
  await realViewport(page, game);
  const box = (await sheet.boundingBox())!;
  expect([Math.round(box.x), Math.round(box.width)]).toEqual([0, 390]);
  await expect(sheet.locator('.pl-group[data-g="requests"] .pl-rq')).toHaveCount(2);
  expect(await layoutProblems(game, true)).toEqual([]);
  expect(await friendsOnFirstScreen(game)).toBeGreaterThanOrEqual(6);
  // round 8: a free friend's Invite is one 44 px icon (one tap), and the status notes stay whole beside it
  for (const b of await sheet.locator('.pl-social-body .pl-fr [data-a="invite"]:visible').all()) expect(Math.round((await b.boundingBox())!.width)).toBe(44);
  expect(await sheet.locator('.pl-social-body .pl-fr [data-a="invite"]:visible').count()).toBeGreaterThanOrEqual(1);
  const cutNotes = await game.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pl-social .pl-fr .pl-st-note')].filter((l) => l.getBoundingClientRect().width > 0 && l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent));
  expect(cutNotes).toEqual([]);
  await shot(page, 'portrait-list');
  // the row menu: a bottom sheet inside the screen
  await sheet.locator(`.pl-fr[data-code="${friends[3].code}"] .pl-fr-main`).tap();
  const menu = sheet.locator('.pl-fr-menu.is-sheet');
  await expect(menu).toBeVisible();
  const mb = (await menu.boundingBox())!;
  expect(mb.y + mb.height).toBeLessThanOrEqual(844.5);
  expect(await layoutProblems(game, true)).toEqual([]);
  await shot(page, 'portrait-menu');
  await menu.locator('.pl-fr-cancel').tap();
  // a DM takes the whole width, its tabs and controls are 44 px. The history is slow here (1.5 s): the thread shows a
  // skeleton and the composer in place meanwhile (round 7), never a bare "Loading…"
  await sheet.locator(`.pl-fr[data-code="${friends[1].code}"] [data-a="chat"]`).tap();
  const chat = game.locator('[data-testid="chat-sheet"]');
  await expect(chat).toBeVisible();
  await expect(chat.locator('[data-testid="chat-loading"]')).toBeAttached();
  await expect(chat.locator('.pl-chat-skel')).toHaveCount(3);
  await expect(chat.locator('.pl-chat-form')).toBeVisible();
  await expect(chat.locator('.pl-chat-list')).toHaveAttribute('aria-busy', 'true');
  expect(await chat.evaluate((el) => (el.textContent ?? '').includes('Loading…'))).toBe(false);
  // focus moved into the thread (its Back), never left on the covered list; the list behind it is inert
  expect(await game.evaluate(() => !!document.activeElement?.closest('[data-testid="chat-sheet"]'))).toBe(true);
  expect(await sheet.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await shot(page, 'portrait-dm-loading');
  await expect(chat.locator('.pl-chat-msg')).toHaveCount(3);
  await expect(chat.locator('.pl-chat-skel')).toHaveCount(0);
  expect(Math.round((await chat.boundingBox())!.width)).toBe(390);
  await expect(chat.locator('[data-testid="chat-tabs"] [role="tab"]')).toHaveCount(2);
  expect(await layoutProblems(game, true)).toEqual([]);
  await shot(page, 'portrait-dm');
  await chat.locator('[data-a="back"]').tap();
  await expect(chat).toHaveCount(0);
  expect(await sheet.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
});

test('Social panel: one friend and requests on a short phone keep Find and Invite above the fold', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch only');
  await mockHost(context, baseURL!, {
    viewport: true,
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
    api: {
      'social.get': { status: 200, body: { ...social, friends: [friends[7]], chat: { unread: 0 }, live: {} } },
      'social.pulse': { status: 204 },
      'chat.list': { status: 200, body: { threads: [] } },
      'growth.invite': { status: 200, body: invite },
    },
  });
  const game = await openHost(page);
  const btn = game.locator('[data-testid="lobby-social"]');
  await expect(btn).toBeVisible({ timeout: limit(60_000) });
  await btn.click();
  const sheet = game.locator('.pl-social');
  await game.addStyleTag({ content: '.pl-social, .pl-inv-sheet, .pl-fr-scrim, .pl-fr-menu, .pl-chat-msgmenu { animation: none !important; }' });
  await expect(sheet.locator('.pl-fr')).toHaveCount(1);
  for (const [w, h] of [[667, 375], [844, 390]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    // the requests keep their heading; Find a player and Invite sit pinned under the list, on the screen
    await expect(sheet.locator('[data-group="requests"]')).toBeVisible();
    const grow = sheet.locator('[data-testid="social-grow"]');
    await expect(grow).toHaveCount(1);
    for (const b of await grow.locator('button').all()) {
      const r = (await b.boundingBox())!;
      expect(r.y + r.height, `${w}x${h} grow CTA above the fold`).toBeLessThanOrEqual(h + 0.5);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expect(grow.locator('[data-a="add-empty"]')).toBeVisible();
    expect(await layoutProblems(game, true)).toEqual([]);
    // the friend is on the first screen
    expect(await friendsOnFirstScreen(game), `${w}x${h} friend in sight`).toBeGreaterThanOrEqual(1);
    await shot(page, 'one-requests');
  }
  // round 8: the invite opens as a sheet over the list (the friend row stays in place under it), and it starts
  // folded again after the panel is closed and reopened, and after the screen turns
  await page.setViewportSize({ width: 667, height: 375 });
  await page.waitForTimeout(300);
  await sheet.locator('[data-testid="invite-open"]').tap();
  await expect(sheet.locator('.pl-inv-sheet [data-testid="invite-row"]')).toBeVisible();
  expect(await friendsOnFirstScreen(game)).toBeGreaterThanOrEqual(1);
  expect(await layoutProblems(game, true)).toEqual([]);
  expect(await inviteCardProblems(game)).toEqual([]);
  await shot(page, 'one-invite');
  // (the scrim covers the header while the sheet is open: the panel's × is clicked directly here)
  await game.evaluate(() => document.querySelector<HTMLElement>('.pl-social-x')!.click());
  await expect(sheet).toHaveCount(0);
  await btn.tap();
  await expect(sheet.locator('.pl-fr')).toHaveCount(1);
  await expect(sheet.locator('[data-testid="invite-row"]')).toHaveCount(0);
  expect(await friendsOnFirstScreen(game)).toBeGreaterThanOrEqual(1);
  await sheet.locator('[data-testid="invite-open"]').tap();
  await expect(sheet.locator('[data-testid="invite-row"]')).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(sheet.locator('[data-testid="invite-row"]')).toHaveCount(0);
  expect(await friendsOnFirstScreen(game)).toBeGreaterThanOrEqual(1);
});

test('Social panel round 8 (desktop): focus returns, the list names what is below, DM message menu, minimised bar', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse only');
  const { game, sheet } = await openSheet(context, page, baseURL!);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  // a friend on a phone carries the mobile mark by the name (and says so to a screen reader)
  const mob = sheet.locator(`.pl-fr[data-code="${friends[1].code}"]`);
  await expect(mob.locator('[data-testid="social-mobile"]')).toBeVisible();
  await expect(mob.locator('.pl-fr-main')).toHaveAttribute('aria-label', /on mobile/);
  await expect(sheet.locator('[data-testid="social-mobile"]')).toHaveCount(1);
  // the status lines: one even separator everywhere ("In match · Ranked · 8m · Sage")
  await expect(sheet.locator(`.pl-fr[data-code="${friends[3].code}"] .pl-social-line`)).toHaveText(/^In match · Ranked · \d+m · Sage$/);
  expect(await separatorGaps(game, '.pl-social-body .pl-fr .pl-social-line')).toEqual([]);
  // 25 friends: the groups below the fold are named on the list's bottom edge (LoL always shows its Offline header)
  const below = sheet.locator('[data-testid="social-more-below"]');
  await expect(below).toBeVisible();
  await expect(below).toContainText(/Offline\s*15/);
  await expect(below).toHaveAttribute('aria-label', /Offline, 15/);
  const [bb, body] = [(await below.boundingBox())!, (await sheet.locator('.pl-social-body').boundingBox())!];
  expect(Math.abs(bb.y + bb.height - (body.y + body.height))).toBeLessThanOrEqual(1);
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'r8-below');
  await below.click();
  await expect.poll(async () => {
    const [h, b] = [(await sheet.locator('[data-group="match"], [data-group="offline"]').first().boundingBox())!, (await sheet.locator('.pl-social-body').boundingBox())!];
    return Math.abs(h.y - b.y) <= 1 || !(await below.isVisible());
  }).toBe(true);
  await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(below).toBeHidden();
  await sheet.locator('.pl-social-body').evaluate((el) => el.scrollTo(0, 0));

  // a DM: a message's "…" opens a small context menu over the thread (Copy text, Report message, Block); the
  // messages never move; Report message shows its reasons under a heading
  const row = sheet.locator(`.pl-fr[data-code="${friends[1].code}"]`);
  await row.hover();
  await row.locator('[data-a="chat"]').click();
  const chat = game.locator('[data-testid="chat-sheet"]');
  await expect(chat.locator('.pl-chat-msg')).toHaveCount(3);
  const bubble = chat.locator('.pl-chat-msg:not(.mine)').first();
  const before = (await chat.locator('.pl-chat-msg').last().boundingBox())!;
  await bubble.hover();
  await bubble.locator('.pl-chat-more').click();
  const mm = chat.locator('[data-testid="chat-msg-menu"]');
  await expect(mm).toBeVisible();
  expect(await mm.evaluate((el) => !el.closest('.pl-chat-list'))).toBe(true);
  expect((await chat.locator('.pl-chat-msg').last().boundingBox())!.y).toBe(before.y);
  await expect(mm.locator('[role="menuitem"]')).toHaveText(['Copy text', 'Report message', `Block ${friends[1].name}`]);
  await expect(mm.locator('[role="menuitem"]').first()).toBeFocused();
  const [mb, cb] = [(await mm.boundingBox())!, (await chat.boundingBox())!];
  expect(mb.x >= cb.x && mb.y >= cb.y && mb.x + mb.width <= cb.x + cb.width + 0.5 && mb.y + mb.height <= cb.y + cb.height + 0.5).toBe(true);
  await mm.locator('[data-a="report-open"]').click();
  await expect(mm.locator('.pl-chat-msgmenu-h')).toHaveText('Report message');
  expect(await mm.locator('.pl-report-chip').count()).toBeGreaterThanOrEqual(3);
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'r8-msg-report');
  await page.keyboard.press('Escape');
  await expect(mm.locator('.pl-chat-msgmenu-h')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(mm).toHaveCount(0);
  await expect(bubble.locator('.pl-chat-more')).toBeFocused();
  await expect(chat).toBeVisible();

  // minimised: a bar on the screen's bottom edge under the list (never over the menu bar), restored by an up chevron
  await chat.locator('[data-a="min"]').click();
  await expect(chat).toHaveClass(/is-min/);
  const tray = game.locator('[data-testid="chat-tray"]');
  await expect(tray).toBeVisible();
  const tb = (await chat.boundingBox())!;
  expect(Math.abs(tb.y + tb.height - 900)).toBeLessThanOrEqual(1);
  const sb = (await sheet.boundingBox())!;
  expect(Math.abs(tb.x - sb.x)).toBeLessThanOrEqual(1);
  expect((await sheet.locator('.pl-social-body').boundingBox())!.y + (await sheet.locator('.pl-social-body').boundingBox())!.height).toBeLessThanOrEqual(tb.y + 1);
  const clash = await game.evaluate(() => {
    const c = document.querySelector('[data-testid="chat-sheet"]')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.hm-nav, .lb-rail')].some((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top;
    });
  });
  expect(clash, 'minimised DM over the menu bar').toBe(false);
  const restore = chat.locator('[data-a="min"]');
  await expect(restore).toHaveAttribute('aria-label', 'Open chat');
  expect(await restore.locator('path').getAttribute('d')).toBe('m6 15 6-6 6 6');
  expect(await layoutProblems(game)).toEqual([]);
  await shot(page, 'r8-dm-min');
  await restore.click();
  await expect(chat).not.toHaveClass(/is-min/);
  await expect(sheet).not.toHaveClass(/has-chat-tray/);

  // Esc closes the DM (focus back on its row), then the panel: focus returns to the lobby's Friends button
  await chat.locator('[data-testid="chat-input"]').focus();
  await page.keyboard.press('Escape');
  await expect(chat).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(game.locator('[data-testid="lobby-social"]')).toBeFocused();
  // the × too
  await game.locator('[data-testid="lobby-social"]').click();
  await expect(sheet.locator('.pl-fr').first()).toBeVisible();
  await sheet.locator('.pl-social-x').click();
  await expect(game.locator('[data-testid="lobby-social"]')).toBeFocused();
});

test('Social panel round 8 (phones sideways): stuck headers, row sheets without a lone cell, one row of DM chrome', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch only');
  const { game, sheet } = await openSheet(context, page, baseURL!);
  const body = sheet.locator('.pl-social-body');
  for (const [w, h] of [[844, 390], [667, 375]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    // mid-scroll at rest: a stuck header always has its rows under it (no empty "Friend requests" with Favourites
    // stacked below it)
    for (const f of [0.2, 0.4, 0.6, 0.8]) {
      await body.evaluate((el, f) => el.scrollTo(0, (el.scrollHeight - el.clientHeight) * f), f);
      await expect.poll(() => stuckHeaderProblems(game), { message: `${w}x${h} at ${f * 100}%` }).toEqual([]);
      expect((await layoutProblems(game, true)).filter((p) => p.startsWith('header sliver'))).toEqual([]);
      if (f === 0.4) await shot(page, 'r8-scroll40');
    }
    await body.evaluate((el) => el.scrollTo(0, 0));
    // the row's bottom sheet: never a lone cell (a match, an away, an offline friend, a joinable lobby)
    for (const i of [3, 4, 7, 0]) {
      const r = sheet.locator(`.pl-fr[data-code="${friends[i].code}"]`);
      if (!(await r.count())) continue;
      await r.scrollIntoViewIfNeeded();
      await r.locator('.pl-fr-main').tap();
      await expect(sheet.locator('.pl-fr-menu.is-sheet')).toBeVisible();
      expect(await sheetOrphans(game), `${w}x${h} friend ${i}`).toEqual([]);
      expect(await layoutProblems(game, true)).toEqual([]);
      if (i === 3) await shot(page, 'r8-menu-match');
      await sheet.locator('.pl-fr-cancel').tap();
      await expect(sheet.locator('.pl-fr-menu')).toHaveCount(0);
    }
  }
  // a DM on a phone: one row of chrome (Back, the conversations with the friend's status in the selected tab, options)
  const row = sheet.locator(`.pl-fr[data-code="${friends[1].code}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.locator('[data-a="chat"]').tap();
  const chat = game.locator('[data-testid="chat-sheet"]');
  await expect(chat.locator('.pl-chat-msg')).toHaveCount(3);
  await expect(chat.locator('[data-testid="chat-tabs"] [role="tab"]')).toHaveCount(2);
  await expect(chat.locator('.pl-chat-tab[aria-selected="true"] .pl-chat-tab-s')).toHaveText('Online');
  const ys = await chat.evaluate((el) => ['[data-testid="chat-tabs"]', '[data-a="back"]', '[data-a="menu"]'].map((q) => {
    const r = el.querySelector(q)!.getBoundingClientRect();
    return Math.round(r.top + r.height / 2);
  }));
  expect(Math.max(...ys) - Math.min(...ys), 'Back, tabs and options on one row').toBeLessThanOrEqual(4);
  const chrome = await chat.evaluate((el) => el.querySelector('.pl-chat-list')!.getBoundingClientRect().top - el.getBoundingClientRect().top);
  expect(chrome, 'DM chrome height').toBeLessThanOrEqual(64);
  expect(await layoutProblems(game, true)).toEqual([]);
  await shot(page, 'r8-dm');
  // touch: a long press on a friend's message opens the same small menu (never chips in the thread)
  await chat.locator('.pl-chat-msg:not(.mine) .pl-chat-bubble').first().tap();
  await chat.locator('.pl-chat-msg.is-picked .pl-chat-more').tap();
  await expect(chat.locator('[data-testid="chat-msg-menu"]')).toBeVisible();
  expect(await layoutProblems(game, true)).toEqual([]);
  await page.keyboard.press('Escape');
  await chat.locator('[data-a="back"]').tap();
  await expect(chat).toHaveCount(0);
});

/*
 * Nov 19 (founder: "points on mobile overlaps"): a phone got the desktop popover over the list. The friend menu is a
 * bottom sheet on every phone-like device (touch, no hover, the app WebView, an Android browser that reports a fine
 * pointer, any screen up to 900 px wide or 500 px tall); only a wide screen with a mouse keeps the popover, and that
 * one never covers its own row and stays on screen. Screenshots go to $SOCIAL_SHOTS/devices when it is set.
 */
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const DEVICES = [
  { name: 'phone-390x844', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, sheet: true },
  { name: 'phone-844x390', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, sheet: true },
  { name: 'phone-667x375', viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, sheet: true },
  { name: 'android-fine-412x915', viewport: { width: 412, height: 915 }, hasTouch: false, isMobile: true, userAgent: ANDROID_UA, sheet: true },
  { name: 'desktop-1440x900', viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, sheet: false },
] as const;

for (const d of DEVICES) {
  test(`Social panel friend menu on ${d.name}: ${d.sheet ? 'a bottom sheet over a backdrop' : 'a popover by its row'}`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== 'desktop', 'own device contexts');
    // a touch phone upright shows the game's "turn your phone sideways" overlay over the lobby: the panel opens
    // sideways, then the phone turns upright (as the portrait test above does)
    const upright = d.hasTouch && d.viewport.height > d.viewport.width;
    const context = await browser.newContext({
      viewport: upright ? { width: d.viewport.height, height: d.viewport.width } : d.viewport,
      hasTouch: d.hasTouch,
      isMobile: d.isMobile,
      ...('userAgent' in d ? { userAgent: d.userAgent } : {}),
    });
    try {
      const page = await context.newPage();
      const { game, sheet } = await openSheet(context, page, baseURL!);
      // the "turn your phone sideways" overlay covers every screen upright: hidden to look at the panel itself
      await game.addStyleTag({ content: '.pl-rotate { display: none !important; }' });
      if (upright) {
        await page.setViewportSize(d.viewport);
        await page.waitForTimeout(300);
      }
      const dir = SHOTS ? join(SHOTS, 'devices') : null;
      if (dir) mkdirSync(dir, { recursive: true });
      const snap = async (n: string) => {
        if (dir) await page.screenshot({ path: join(dir, `${d.name}-${n}.png`) });
      };
      // the founder's case: an online friend near the top, with groups below it
      const f = friends[1];
      const row = sheet.locator(`.pl-fr[data-code="${f.code}"]`);
      // a turn re-renders the panel: tap and click wait for the row and scroll it into view themselves
      await expect(row).toBeVisible();
      if (d.hasTouch) await row.locator('.pl-fr-main').tap();
      else await row.locator('.pl-fr-main').click();
      const menu = sheet.locator('.pl-fr-menu');
      await expect(menu).toBeVisible();
      await snap('menu');
      const vp = d.viewport;
      const mb = (await menu.boundingBox())!;
      if (d.sheet) {
        await expect(menu).toHaveClass(/is-sheet/);
        // attached to the bottom edge of the screen, full width of the panel (at most 480 px, centred)
        expect(Math.abs(mb.y + mb.height - vp.height), 'sheet on the bottom edge').toBeLessThanOrEqual(1);
        const sb = (await sheet.boundingBox())!;
        const want = Math.min(sb.width, 480);
        expect(Math.abs(mb.width - want), 'sheet width').toBeLessThanOrEqual(1);
        expect(Math.abs(mb.x + mb.width / 2 - (sb.x + sb.width / 2)), 'sheet centred').toBeLessThanOrEqual(1);
        // it names the friend, with 44 px or taller rows and Cancel
        await expect(menu.locator('.pl-fr-menu-who .pl-fr-menu-name')).toHaveText(f.name);
        for (const h of await menu.locator('.pl-mi, .pl-fr-cancel').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)))
          expect(h).toBeGreaterThanOrEqual(44);
        // nothing of the list is reachable behind the backdrop: every point of the list hits the backdrop, the list is inert
        const behind = await game.evaluate(() => {
          const out: string[] = [];
          const m = document.querySelector('.pl-fr-menu')!.getBoundingClientRect();
          for (const el of document.querySelectorAll<HTMLElement>('.pl-social .pl-social-row, .pl-social .pl-group-h, .pl-social-head button, .pl-social .pl-social-none')) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            if (y >= m.top || y < 0 || y > innerHeight) continue;
            const hit = document.elementFromPoint(x, y);
            if (!hit?.closest('.pl-fr-scrim')) out.push(`${el.className} reachable at ${Math.round(x)},${Math.round(y)}`);
          }
          const body = document.querySelector<HTMLElement>('.pl-social-body')!;
          if (!body.inert) out.push('list not inert');
          return out;
        });
        expect(behind).toEqual([]);
        // focus stays in the sheet (a trap): Tab from Cancel wraps to the first action
        await menu.locator('.pl-fr-cancel').focus();
        await page.keyboard.press('Tab');
        expect(await game.evaluate(() => !!document.activeElement?.closest('.pl-fr-menu'))).toBe(true);
        await page.keyboard.press('Shift+Tab');
        expect(await game.evaluate(() => !!document.activeElement?.closest('.pl-fr-menu'))).toBe(true);
        // a tap on the backdrop closes it, focus back on the row
        const sc = (await sheet.locator('.pl-fr-scrim').boundingBox())!;
        if (d.hasTouch) await page.touchscreen.tap(sc.x + sc.width / 2, sc.y + 20);
        else await page.mouse.click(sc.x + sc.width / 2, sc.y + 20);
        await expect(menu).toHaveCount(0);
        expect(await game.evaluate((c) => (document.activeElement as HTMLElement | null)?.dataset.code === c, f.code)).toBe(true);
        expect(await sheet.locator('.pl-social-body').evaluate((el) => (el as HTMLElement).inert)).toBe(false);
        // Esc (the Android back button sends Escape) closes it too, focus back on the row
        if (d.hasTouch) await row.locator('.pl-fr-main').tap();
        else await row.locator('.pl-fr-main').click();
        await expect(menu).toHaveClass(/is-sheet/);
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await expect(sheet).toBeVisible();
        expect(await game.evaluate((c) => (document.activeElement as HTMLElement | null)?.dataset.code === c, f.code)).toBe(true);
      } else {
        await expect(menu).toHaveClass(/is-pop/);
        await expect(sheet.locator('.pl-fr-scrim')).toHaveCount(0);
        // never over its own row, inside the screen and the panel
        const check = async (label: string) => {
          const m = (await menu.boundingBox())!;
          const r = (await row.boundingBox())!;
          const s = (await sheet.boundingBox())!;
          const overlap = Math.min(m.y + m.height, r.y + r.height) - Math.max(m.y, r.y);
          expect(overlap, `${label}: popover over its row`).toBeLessThanOrEqual(0.5);
          expect(m.y, label).toBeGreaterThanOrEqual(-0.5);
          expect(m.y + m.height, label).toBeLessThanOrEqual(vp.height + 0.5);
          expect(m.x, label).toBeGreaterThanOrEqual(s.x - 0.5);
          expect(m.x + m.width, label).toBeLessThanOrEqual(s.x + s.width + 0.5);
        };
        await check('near the top');
        // a row near the bottom of the list: the popover flips above it
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        const last = await sheet.locator('.pl-fr').evaluateAll((els) => {
          const body = document.querySelector('.pl-social-body')!.getBoundingClientRect();
          const seen = els.filter((e) => e.getBoundingClientRect().bottom <= body.bottom - 2);
          return (seen[seen.length - 1] as HTMLElement).dataset.code!;
        });
        const lastRow = sheet.locator(`.pl-fr[data-code="${last}"]`);
        await lastRow.locator('.pl-fr-main').click();
        await expect(menu).toHaveClass(/is-pop/);
        const m = (await menu.boundingBox())!;
        const r = (await lastRow.boundingBox())!;
        expect(Math.min(m.y + m.height, r.y + r.height) - Math.max(m.y, r.y), 'popover over the last row').toBeLessThanOrEqual(0.5);
        expect(m.y + m.height).toBeLessThanOrEqual(vp.height + 0.5);
        await snap('menu-low');
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        expect(await game.evaluate((c) => (document.activeElement as HTMLElement | null)?.dataset.code === c, last)).toBe(true);
      }
    } finally {
      await context.close();
    }
  });
}
