import { expect, test, type Browser, type Frame } from '@playwright/test';
import { mockHost, openHost, received } from './host';

/*
 * Friends chat and avatars (docs/plans/moba/CHAT-AVATARS.md §8): two friends in two browsers share a stateful fake
 * server (the host answers every `api-request` from it). One DMs a phrase and text; the other sees the unread badge
 * and the message, then a reply arrives in the open thread within 5 s (the 4 s poll). An under-16 friend's thread is
 * phrases only on both sides. Avatars show on the friend rows. Every call goes through the host: no URL, no token.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

type Who = 'A' | 'B' | 'K';
const CODE: Record<Who, string> = { A: 'PL-AAAA-AAAA', B: 'PL-BBBB-BBBB', K: 'PL-KKKK-KKKK' };
const NAME: Record<Who, string> = { A: 'Witty Biscuit', B: 'Sunny Pudding', K: 'Tiny Mochi' };
const BAND: Record<Who, string> = { A: '18+', B: '16-17', K: 'under16' };
const AV: Record<Who, { i: string }> = { A: { i: 'h:sage' }, B: { i: 'h:lambo' }, K: { i: 'h:clem' } };
const PHRASES = ['Wanna play?', 'Join my party!'];

/** The fake server: friends A–B and A–K, one DM thread per pair, the tier by the strictest band. */
function server() {
  const threads = new Map<string, { members: [Who, Who]; msgs: { mid: string; from: Who; k: string; text?: string; id?: number; at: string }[]; read: Record<string, number> }>();
  const rev: Record<Who, number> = { A: 1, B: 1, K: 1 };
  let n = 0;
  const tid = (a: Who, b: Who) => `d${[a, b].sort().join('')}${'A'.repeat(20)}`;
  const friendsOf = (w: Who): Who[] => (w === 'A' ? ['B', 'K'] : ['A']);
  const tier = (a: Who, b: Who) => (BAND[a] !== 'under16' && BAND[b] !== 'under16' ? 'text' : 'quick');
  const unread = (w: Who, t: { msgs: { from: Who }[]; read: Record<string, number> }) => t.msgs.slice(t.read[w] ?? 0).filter((m) => m.from !== w).length;
  const summary = (w: Who) => {
    let total = 0;
    for (const t of threads.values()) if (t.members.includes(w)) total += unread(w, t);
    return { unread: total };
  };
  const view = (w: Who, m: { mid: string; from: Who; k: string; text?: string; id?: number; at: string }) => ({ mid: m.mid, mine: m.from === w, k: m.k, ...(m.k === 't' ? { text: m.text } : { id: m.id }), at: m.at });
  return {
    sent: [] as unknown[],
    handle(w: Who, op: string, a: Record<string, any>): { status: number; body?: unknown } {
      this.sent.push({ w, op, a });
      const other = (t: { members: [Who, Who] }) => t.members.find((x) => x !== w)!;
      switch (op) {
        case 'social.get':
          return {
            status: 200,
            body: {
              me: { code: CODE[w], name: NAME[w], invisible: false, allowRecent: true, ageBand: BAND[w], av: AV[w], frame: null, title: null },
              friends: friendsOf(w).map((f) => ({ code: CODE[f], name: NAME[f], presence: { state: 'online' }, av: AV[f] })),
              requests: { in: [], out: [] },
              blocks: [],
              invites: [],
              rev: String(rev[w]),
              chat: summary(w),
            },
          };
        case 'social.pulse':
          return a.rev === String(rev[w]) ? { status: 204 } : { status: 200, body: { rev: String(rev[w]), invites: [], chat: summary(w) } };
        case 'chat.list': {
          const list = [...threads.entries()]
            .filter(([, t]) => t.members.includes(w) && t.msgs.length)
            .map(([id, t]) => ({ id, kind: 'dm', with: { code: CODE[other(t)], name: NAME[other(t)], av: AV[other(t)] }, tier: tier(w, other(t)), lastAt: '', lastPreview: '', lastMine: false, unread: unread(w, t), muted: false, readOnly: false }));
          return { status: 200, body: { threads: list } };
        }
        case 'chat.open': {
          const f = (Object.keys(CODE) as Who[]).find((x) => CODE[x] === a.code)!;
          const id = tid(w, f);
          if (!threads.has(id)) threads.set(id, { members: [w, f], msgs: [], read: {} });
          return { status: 200, body: { thread: id, tier: tier(w, f) } };
        }
        case 'chat.history': {
          const t = threads.get(a.thread)!;
          return { status: 200, body: { thread: { id: a.thread, tier: tier(w, other(t)), muted: false, readOnly: false }, messages: t.msgs.map((m) => view(w, m)), more: false } };
        }
        case 'chat.since': {
          const t = threads.get(a.thread)!;
          const i = t.msgs.findIndex((m) => m.mid === a.after);
          const fresh = t.msgs.slice(i + 1);
          return fresh.length ? { status: 200, body: { messages: fresh.map((m) => view(w, m)) } } : { status: 204 };
        }
        case 'chat.send': {
          const t = threads.get(a.thread)!;
          if (a.k === 't' && tier(w, other(t)) !== 'text') return { status: 409, body: { code: 'PAWLEGENDS_CHAT_QUICK_ONLY' } };
          const m = { mid: (++n).toString(16).padStart(24, '0'), from: w, k: a.k, ...(a.k === 't' ? { text: a.text } : { id: a.pid }), at: new Date(Date.UTC(2026, 10, 11, 12, 0, n)).toISOString() };
          t.msgs.push(m);
          t.read[w] = t.msgs.length;
          rev[other(t)]++;
          return { status: 200, body: { message: view(w, m) } };
        }
        case 'chat.read': {
          const t = threads.get(a.thread)!;
          t.read[w] = t.msgs.length;
          return { status: 200, body: { ok: true } };
        }
        default:
          return { status: 200, body: {} };
      }
    },
  };
}

async function signedIn(browser: Browser, baseURL: string, who: Who, srv: ReturnType<typeof server>, viewport: { width: number; height: number }): Promise<{ game: Frame; page: import('@playwright/test').Page }> {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1000 });
  await context.exposeFunction('plApi', async (op: string, args: Record<string, unknown>) => srv.handle(who, op, args));
  await mockHost(context, baseURL, {
    app: { isApp: false, store: true },
    signedIn: true,
    liveApi: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
  });
  const page = await context.newPage();
  const game = await openHost(page);
  return { game, page };
}

test('two friends: a phrase and text DM, the unread badge, the reply in the open thread within 5 s; avatars on rows', async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000);
  const srv = server();
  const vp = info.project.name === 'landscape' ? { width: 844, height: 390 } : { width: 1280, height: 720 };
  const a = await signedIn(browser, baseURL!, 'A', srv, vp);
  const b = await signedIn(browser, baseURL!, 'B', srv, { width: 667, height: 375 });

  // A opens Social: friend rows carry avatars; Chat on Sunny's row opens the thread
  await a.game.locator('[data-testid="lobby-social"]').click({ timeout: 60_000 });
  const rowB = a.game.locator(`.pl-social-row[data-code="${CODE.B}"]`);
  await expect(rowB).toBeVisible();
  await expect(rowB.locator('.pl-av')).toHaveCount(1);
  await rowB.locator('[data-a="chat"]').click();
  const chatA = a.game.locator('[data-testid="chat-sheet"]');
  await expect(chatA).toBeVisible();
  // 18+ and 16-17: free text (with the server filter) plus phrases
  await chatA.locator('[data-a="tray"]').click();
  await chatA.locator('[data-a="say"][data-id="0"]').click();
  await expect(chatA.locator('.pl-chat-msg.mine .pl-chat-bubble').last()).toHaveText(PHRASES[0]);
  await chatA.locator('[data-testid="chat-input"]').fill('see you at 7');
  await chatA.locator('[data-testid="chat-send"]').click();
  await expect(chatA.locator('.pl-chat-msg.mine .pl-chat-bubble').last()).toHaveText('see you at 7');
  // no document scroll: only the message list scrolls
  expect(await chatA.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);

  // B: the Social sheet shows the unread badge and the dot on A's row; the thread shows both messages
  await b.game.locator('[data-testid="lobby-social"]').click({ timeout: 60_000 });
  await expect(b.game.locator('[data-testid="social-unread"]')).toHaveText('2');
  const rowA = b.game.locator(`.pl-social-row[data-code="${CODE.A}"]`);
  await expect(rowA.locator('[data-testid="chat-unread"]')).toHaveText('2');
  await rowA.locator('[data-a="chat"]').click();
  const chatB = b.game.locator('[data-testid="chat-sheet"]');
  await expect(chatB.locator('.pl-chat-bubble')).toHaveText([PHRASES[0], 'see you at 7']);
  expect(await chatB.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);

  // A writes again while B's thread is open: B sees it within 5 s (the open-thread poll)
  const t0 = Date.now();
  await chatA.locator('[data-testid="chat-input"]').fill('bring snacks');
  await chatA.locator('[data-testid="chat-send"]').click();
  await expect(chatB.locator('.pl-chat-bubble').last()).toHaveText('bring snacks', { timeout: 5_000 });
  expect(Date.now() - t0).toBeLessThan(5_500);

  // every call went through the host as an allowlisted op: no URL, no token
  for (const p of [a.page, b.page]) {
    const reqs = (await received(p)).filter((m) => m.type === 'api-request');
    expect(reqs.length).toBeGreaterThan(0);
    for (const r of reqs) expect(JSON.stringify(r)).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]{6}/);
  }
});

test('an under-16 friend: phrases and stickers only on both sides', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const srv = server();
  const k = await signedIn(browser, baseURL!, 'K', srv, { width: 844, height: 390 });
  await k.game.locator('[data-testid="lobby-social"]').click({ timeout: 60_000 });
  await k.game.locator(`.pl-social-row[data-code="${CODE.A}"] [data-a="chat"]`).click();
  const sheet = k.game.locator('[data-testid="chat-sheet"]');
  await expect(sheet.locator('[data-testid="chat-tray"]')).toBeVisible();
  await expect(sheet.locator('[data-testid="chat-input"]')).toHaveCount(0);
  await expect(sheet.locator('[data-testid="chat-quick-note"]')).toBeVisible();
  await sheet.locator('[data-a="say"][data-id="0"]').click();
  await expect(sheet.locator('.pl-chat-msg.mine .pl-chat-bubble').last()).toHaveText(PHRASES[0]);
  expect(await sheet.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  const a = await signedIn(browser, baseURL!, 'A', srv, { width: 1280, height: 720 });
  await a.game.locator('[data-testid="lobby-social"]').click({ timeout: 60_000 });
  await a.game.locator(`.pl-social-row[data-code="${CODE.K}"] [data-a="chat"]`).click();
  const sheetA = a.game.locator('[data-testid="chat-sheet"]');
  await expect(sheetA.locator('.pl-chat-bubble')).toHaveText([PHRASES[0]]);
  await expect(sheetA.locator('[data-testid="chat-input"]')).toHaveCount(0);
});
