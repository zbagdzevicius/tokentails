import { expect, test, type Browser, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost } from '../host';
import { closeAll, joinByLink, player, RELAY, tap, title } from './party.helpers';

/*
 * LoL-style invites, friend DMs and join by code (docs/plans/moba/SOCIAL-INVITES.md), two browsers against the local
 * party relay (playwright.mp.config.ts). Both friends play in the mock embed host (tests/e2e/host.ts); their social
 * API is one stateful fake server in this test (every `api-request` goes through the host, as on pawlegends.app), the
 * party is the real relay. A opens a party (PLAY → Skirmish → With Friends), taps "Invite friends" and Invite on B's
 * row; B's game shows the invite card within the 4 s inbox poll, B accepts and lands in A's lobby. A messages B: B gets
 * the DM toast live and reads the thread, and again after a reload. A third player joins by typing the party code.
 */

type Who = 'A' | 'B';
const CODE: Record<Who, string> = { A: 'PL-AAAA-AAAA', B: 'PL-BBBB-BBBB' };
const NAME: Record<Who, string> = { A: 'Witty Biscuit', B: 'Sunny Pudding' };
const AV: Record<Who, { i: string }> = { A: { i: 'h:sage' }, B: { i: 'h:lambo' } };
const other = (w: Who): Who => (w === 'A' ? 'B' : 'A');

test.afterEach(closeAll);
// The game frame on 127.0.0.1 sits in a host page on a public origin: Chrome's Local Network Access would refuse its
// loopback relay calls (production uses public origins only), so this file turns that check off.
test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'],
  },
});

/** The fake social server: A and B are friends; invites, answers, the inbox rev and one DM thread. */
function server(opts: { friends?: boolean } = {}) {
  const rev: Record<Who, number> = { A: 1, B: 1 };
  /** SOCIAL-INVITES.md: friends from the start (default), or only after Add by nickname. */
  let friends = opts.friends ?? true;
  /** Players the server reads as offline (an invite still goes out, the answer says `offline`). */
  const offline = new Set<Who>();
  /** The nicknames the search finds. */
  const NICK: Record<Who, string> = { A: 'zygis', B: 'Mira' };
  const partyOf: Partial<Record<Who, string>> = {};
  const invites: { id: string; from: Who; to: Who; party: string; sim?: string; answer?: 'accepted' | 'declined'; seen?: boolean; later?: boolean; laterSeen?: boolean; exp: number }[] = [];
  const msgs: { mid: string; from: Who; k: string; text?: string; id?: number; at: string }[] = [];
  const read: Record<Who, number> = { A: 0, B: 0 };
  const thread = `d${'A'.repeat(22)}`;
  let n = 0;
  const unread = (w: Who) => msgs.slice(read[w]).filter((m) => m.from !== w).length;
  const chat = (w: Who) => {
    const u = unread(w);
    const last = msgs[msgs.length - 1];
    return u && last ? { unread: u, top: { thread, fromName: NAME[last.from], preview: last.k === 't' ? last.text : `[${last.k}:${last.id}]`, code: CODE[last.from] } } : { unread: u };
  };
  const view = (w: Who, m: (typeof msgs)[number]) => ({ mid: m.mid, mine: m.from === w, k: m.k, ...(m.k === 't' ? { text: m.text } : { id: m.id }), at: m.at });
  const presence = (w: Who) => (partyOf[w] ? { state: 'party', joinable: true, party: partyOf[w] } : { state: 'online' });
  const pending = (w: Who) =>
    invites
      .filter((i) => i.to === w && !i.answer && i.exp > Date.now())
      .map((i) => ({ id: i.id, from: { code: CODE[i.from], name: NAME[i.from] }, party: i.party, ...(i.sim ? { sim: i.sim } : {}), ttl: i.exp - Date.now() }));
  return {
    partyOf,
    invites,
    msgs,
    offline,
    handle(w: Who, op: string, a: Record<string, any>): { status: number; body?: unknown } {
      const f = other(w);
      switch (op) {
        case 'social.get':
          return {
            status: 200,
            body: {
              me: { code: CODE[w], name: NAME[w], invisible: false, allowRecent: true, ageBand: '18+', av: AV[w], frame: null, title: null },
              friends: friends ? [{ code: CODE[f], name: NAME[f], presence: offline.has(f) ? { state: 'offline' } : presence(f), av: AV[f] }] : [],
              requests: { in: [], out: [] },
              blocks: [],
              invites: pending(w),
              rev: String(rev[w]),
              chat: chat(w),
            },
          };
        case 'social.pulse':
          return { status: 204 };
        case 'social.inbox': {
          if (a.rev === `i${rev[w]}`) return { status: 204 };
          const answers = [
            ...invites.filter((i) => i.from === w && i.answer && !i.seen).map((i) => ((i.seen = true), { id: i.id, name: NAME[i.to], answer: i.answer })),
            // Nov 19: the friend's game got it in a match (`later`), told once
            ...invites.filter((i) => i.from === w && i.later && !i.laterSeen && !i.answer).map((i) => ((i.laterSeen = true), { id: i.id, name: NAME[i.to], answer: 'later' })),
          ];
          return { status: 200, body: { rev: `i${rev[w]}`, invites: pending(w), answers, chat: chat(w) } };
        }
        case 'social.search':
          return { status: 200, body: { players: NICK[f].toLowerCase().startsWith(String(a.name ?? '').toLowerCase()) ? [{ name: NICK[f], av: AV[f], ...(friends ? { rel: 'friend' } : {}) }] : [] } };
        case 'friend.add':
          if (a.name !== undefined && String(a.name).toLowerCase() !== NICK[f].toLowerCase()) return { status: 404, body: { code: 'PAWLEGENDS_SOCIAL_NO_NAME' } };
          friends = true;
          rev.A++;
          rev.B++;
          return { status: 200, body: { state: 'friends' } };
        case 'invite.send': {
          if (a.to !== CODE[f]) return { status: 404, body: { code: 'PAWLEGENDS_SOCIAL_NOT_FOUND' } };
          if (!partyOf[w]) return { status: 409, body: { code: 'PAWLEGENDS_SOCIAL_NO_PARTY' } };
          const id = (++n).toString(16).padStart(24, '0');
          invites.push({ id, from: w, to: f, party: partyOf[w]!, sim: a.sim, exp: Date.now() + 60_000 });
          rev[f]++;
          return { status: 200, body: { ok: true, id, ttl: 60_000, ...(offline.has(f) ? { offline: true } : partyOf[f] ? { busy: 'party' } : {}) } };
        }
        case 'invite.answer': {
          const i = invites.find((x) => x.id === a.invite && x.to === w);
          if (!i || i.answer || i.exp < Date.now()) return a.answer !== 'accept' ? { status: 200, body: { ok: true } } : { status: 410, body: { code: 'PAWLEGENDS_SOCIAL_INVITE_GONE' } };
          if (a.answer === 'later') {
            // held for the match end (the server keeps it 40 min); the inviter hears it once
            if (!i.later) rev[i.from]++;
            i.later = true;
            i.exp = Date.now() + 40 * 60_000;
            return { status: 200, body: { ok: true } };
          }
          i.answer = a.answer === 'accept' ? 'accepted' : 'declined';
          rev[i.from]++;
          return { status: 200, body: a.answer === 'accept' ? { ok: true, party: i.party } : { ok: true } };
        }
        case 'chat.list':
          return {
            status: 200,
            body: { threads: msgs.length ? [{ id: thread, kind: 'dm', with: { code: CODE[f], name: NAME[f], av: AV[f] }, tier: 'text', lastAt: '', lastPreview: '', lastMine: false, unread: unread(w), muted: false, readOnly: false }] : [] },
          };
        case 'chat.open':
          return { status: 200, body: { thread, tier: 'text' } };
        case 'chat.history':
          return { status: 200, body: { thread: { id: thread, tier: 'text', muted: false, readOnly: false }, messages: msgs.map((m) => view(w, m)), more: false } };
        case 'chat.since': {
          const i = msgs.findIndex((m) => m.mid === a.after);
          const fresh = msgs.slice(i + 1);
          return fresh.length ? { status: 200, body: { messages: fresh.map((m) => view(w, m)) } } : { status: 204 };
        }
        case 'chat.send': {
          const m = { mid: (++n).toString(16).padStart(24, '0'), from: w, k: a.k, ...(a.k === 't' ? { text: a.text } : { id: a.pid }), at: new Date().toISOString() };
          msgs.push(m);
          read[w] = msgs.length;
          rev[f]++;
          return { status: 200, body: { message: view(w, m) } };
        }
        case 'chat.read':
          read[w] = msgs.length;
          return { status: 200, body: { ok: true } };
        default:
          return { status: 200, body: {} };
      }
    },
  };
}

type Srv = ReturnType<typeof server>;

/** A signed-in friend in the mock embed host, its own browser context (and profile, closed in afterEach). */
async function friend(browser: Browser, baseURL: string, who: Who, srv: Srv, account?: string): Promise<{ page: Page; game: () => Frame; reopen(): Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // closeAll (party.helpers) closes the contexts it opened; this one is closed with the test's own list below
  contexts.push(context);
  // the veteran profile in the game frame's own storage (the host writes it on its origin only)
  await context.addInitScript((p) => {
    try {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p));
    } catch {
      /* opaque origin */
    }
  }, { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true });
  await context.exposeFunction('plApi', async (op: string, args: Record<string, unknown>) => {
    const r = srv.handle(who, op, args);
    if (process.env.MP_API_LOG) console.log(`[${who}] ${op} ${JSON.stringify(args)} -> ${r.status}`);
    return r;
  });
  // a registered account on the relay (the harness mints its ticket), so the lobby shows the account's nickname
  if (account)
    await context.exposeFunction('plTicket', async () => {
      const r = await fetch(`${RELAY}/e2e/ticket?account=${account}`);
      return ((await r.json()) as { ticket: string }).ticket;
    });
  await mockHost(context, baseURL, {
    app: { isApp: false, store: true },
    signedIn: true,
    liveApi: true,
    ...(account ? { ticketFn: true } : { partyTicket: null }),
    pass: [new URL(RELAY).origin],
    // the game frame on the preview's own origin (a loopback page may open the loopback relay socket), the host stays
    // on its allowlisted origin; the host's posts go to '*' (the frame is another origin)
    gameOrigin: baseURL,
    sendTarget: '*',
    profile: { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
  });
  // the preview serves the game at /: map the host's /pawlegends-game/ path onto it
  await context.route(new RegExp(`^${baseURL.replace(/[.]/g, '\\.')}/pawlegends-game/`), async (route) => {
    const url = new URL(route.request().url());
    const rest = url.pathname.slice('/pawlegends-game/'.length) || 'index.html';
    try {
      return await route.fulfill({ response: await route.fetch({ url: `${baseURL}/${rest}${url.search}` }) });
    } catch {
      return route.abort().catch(() => undefined);
    }
  });
  if (process.env.MP_CONSOLE) context.on('console', (m) => console.log(`[${who}] ${m.type()} ${m.text().slice(0, 200)}`));
  const page = await context.newPage();
  let frame = await openHost(page);
  return {
    page,
    game: () => frame,
    async reopen() {
      frame = await openHost(page);
    },
  };
}
const contexts: import('@playwright/test').BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => undefined)));
});

test('invite a friend LoL style, they accept into your lobby; a DM arrives live and survives a reload; join by code', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const srv = server();
  const a = await friend(browser, baseURL!, 'A', srv);
  const b = await friend(browser, baseURL!, 'B', srv);

  // A: Party: the lobby with its code and "Invite friends"
  const ga = a.game();
  await expect(ga.locator('.pl-home[data-variants~="friends"]')).toBeVisible({ timeout: 60_000 });
  // Home's Party (MODE-UNLOCKS.md: Mode Select's With Friends left with one main queue)
  await ga.locator('[data-testid=\"home-party\"]').click();
  const codeEl = ga.locator('[data-testid="party-code"]');
  await expect(codeEl).toBeVisible({ timeout: 60_000 });
  const code = ((await codeEl.textContent()) ?? '').replace(/\s/g, '');
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  srv.partyOf.A = code;

  // A: Invite friends → the Friends sheet over the lobby → Invite on B's row
  await ga.locator('[data-testid="party-invite-friends"]').click();
  const rowB = ga.locator(`.pl-social-row[data-code="${CODE.B}"]`);
  await expect(rowB.locator('.pl-social-st')).toHaveText('Online');
  await rowB.locator('[data-testid="social-invite"]').click();
  await expect(ga.locator('.pl-social-note')).toContainText(`Invite sent to ${NAME.B}`);
  const sentAt = Date.now();
  expect(srv.invites[0]).toMatchObject({ from: 'A', to: 'B', party: code });
  expect(srv.invites[0].sim).toMatch(/^\d+\.[A-Za-z0-9]+$/);

  // B (on Home): the invite card within the 4 s inbox poll, with a countdown, Accept and Decline
  const gb = b.game();
  const card = gb.locator('[data-testid="invite-toast"]');
  await expect(card).toBeVisible({ timeout: 6_000 });
  expect(Date.now() - sentAt).toBeLessThan(6_500);
  await expect(card).toContainText(`${NAME.A} invites you to a party`);
  await expect(card.locator('[data-testid="invite-left"]')).toHaveText(/^[1-6]?\ds$/);
  await expect(card.locator('[data-testid="invite-decline"]')).toBeVisible();
  await expect(card.locator('[data-testid="invite-update"]')).toHaveCount(0);
  await card.locator('[data-testid="invite-accept"]').click();

  // both in one lobby on the relay
  await expect(gb.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 60_000 });
  await expect(ga.locator('[data-testid="party-seat"]')).toHaveCount(2, { timeout: 30_000 });
  await expect(gb.locator('[data-testid="party-seat"]')).toHaveCount(2);
  await expect.poll(() => srv.invites[0].answer).toBe('accepted');
  // A hears the answer on its next inbox poll
  await expect(ga.locator('[data-testid="invite-answer-accepted"]')).toContainText(`${NAME.B} is joining your party`, { timeout: 6_000 });

  // A messages B from the Friends sheet (still open over A's lobby): B gets the DM toast live, in its lobby
  await rowB.locator('[data-a="chat"]').click();
  const chatA = ga.locator('[data-testid="chat-sheet"]');
  await expect(chatA).toBeVisible();
  await chatA.locator('[data-testid="chat-input"]').fill('gl hf, mid is yours');
  await chatA.locator('[data-testid="chat-send"]').click();
  await expect(chatA.locator('.pl-chat-msg.mine .pl-chat-bubble').last()).toHaveText('gl hf, mid is yours');
  const dm = gb.locator('[data-testid="dm-toast"]');
  await expect(dm).toContainText(`${NAME.A}: gl hf, mid is yours`, { timeout: 6_000 });
  await dm.locator('[data-testid="dm-open"]').click();
  const chatB = gb.locator('[data-testid="chat-sheet"]');
  await expect(chatB.locator('.pl-chat-bubble').last()).toHaveText('gl hf, mid is yours', { timeout: 15_000 });

  // B reloads: back in A's lobby (the party seat resumes), and the message is still there (server-side history) from
  // the Friends sheet's Chat on A's row
  await b.reopen();
  const gb2 = b.game();
  await expect(gb2.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 60_000 });
  await gb2.locator('[data-testid="party-invite-friends"]').click();
  await gb2.locator(`.pl-social-row[data-code="${CODE.A}"] [data-a="chat"]`).click();
  await expect(gb2.locator('[data-testid="chat-sheet"] .pl-chat-bubble').last()).toHaveText('gl hf, mid is yours', { timeout: 15_000 });

  // a third player (a guest, no host) types the party code: Join with code
  const c = await player(browser, 'desktop');
  await title(c);
  await tap(c, c.page.locator('[data-testid="join-code"]'));
  await expect(c.page.locator('.pp-box')).toHaveCount(6, { timeout: 30_000 });
  await c.page.locator('.pp-box').first().focus();
  await c.page.keyboard.type(code.toLowerCase());
  await expect(c.page.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 60_000 });
  await expect(ga.locator('[data-testid="party-seat"]')).toHaveCount(3, { timeout: 30_000 });
});

/*
 * Founder report (Nov 20): "when I click invite friend I get into party and see Reconnecting … also friend invite doesn't
 * result in a confirmation modal". Invite on a friend's row from Home (no party yet) opens the party lobby, then sends
 * the invite; production's draining second relay bounced the lobby's socket (the harness bounces two the same way).
 */
test('Nov 20: Invite from Home with no party: the lobby opens through relay bounces, the friend gets the card, Accept joins', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const srv = server();
  const a = await friend(browser, baseURL!, 'A', srv);
  const b = await friend(browser, baseURL!, 'B', srv);
  const ga = a.game();
  await expect(ga.locator('.pl-home[data-variants~="friends"]')).toBeVisible({ timeout: 60_000 });
  await ga.locator('[data-testid="lobby-social"]').click();
  const invite = ga.locator(`[data-code="${CODE.B}"] [data-testid="social-invite"]`).first();
  await expect(invite).toBeVisible({ timeout: 15_000 });
  await fetch(`${RELAY}/e2e/bounce?n=2`);
  const t0 = Date.now();
  await invite.click();
  // the party lobby opens with its code (never "Connecting…" under "Reconnecting…")
  const codeEl = ga.locator('[data-testid="party-code"]');
  await expect(codeEl).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(8_000);
  await expect(ga.locator('.pp-notes')).not.toContainText('Reconnecting');
  const code = ((await codeEl.textContent()) ?? '').replace(/\s/g, '');
  // the relay's presence write, as the API would see it
  srv.partyOf.A = code;
  // the inviter's confirmation, then the friend's Accept / Decline card
  await expect(ga.locator('[data-testid="invite-sent"]')).toContainText(`Invite sent to ${NAME.B}`, { timeout: 10_000 });
  const gb = b.game();
  const card = gb.locator('[data-testid="invite-toast"]');
  await expect(card).toBeVisible({ timeout: 6_000 });
  await expect(card).toContainText(`${NAME.A} invites you to a party`);
  await card.locator('[data-testid="invite-accept"]').click();
  await expect(gb.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 30_000 });
  await expect(ga.locator('[data-testid="party-seat"]')).toHaveCount(2, { timeout: 30_000 });
});

test('Decline: the card closes and the inviter is told', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const srv = server();
  const a = await friend(browser, baseURL!, 'A', srv);
  const b = await friend(browser, baseURL!, 'B', srv);
  const ga = a.game();
  await expect(ga.locator('.pl-home[data-variants~="friends"]')).toBeVisible({ timeout: 60_000 });
  // Home's Party (MODE-UNLOCKS.md: Mode Select's With Friends left with one main queue)
  await ga.locator('[data-testid=\"home-party\"]').click();
  const codeEl = ga.locator('[data-testid="party-code"]');
  await expect(codeEl).toBeVisible({ timeout: 60_000 });
  srv.partyOf.A = ((await codeEl.textContent()) ?? '').replace(/\s/g, '');
  await ga.locator('[data-testid="party-invite-friends"]').click();
  await ga.locator(`.pl-social-row[data-code="${CODE.B}"] [data-testid="social-invite"]`).click();
  const card = b.game().locator('[data-testid="invite-toast"]');
  await expect(card).toBeVisible({ timeout: 6_000 });
  await card.locator('[data-testid="invite-decline"]').click();
  await expect(card).toHaveCount(0);
  await expect.poll(() => srv.invites[0].answer).toBe('declined');
  await expect(ga.locator('[data-testid="invite-answer-declined"]')).toContainText(`${NAME.B} declined your invite`, { timeout: 6_000 });
  await expect(ga.locator('[data-testid="party-seat"]')).toHaveCount(1);
});

/** Set an e2e account's nickname on the relay harness (as a nickname change on the API would). */
const nickname = async (account: string, name: string) => {
  const r = await fetch(`${RELAY}/e2e/name?account=${account}&name=${name}`);
  expect(r.ok).toBe(true);
};
const seatNames = (g: Frame) => g.locator('[data-testid="party-seat"] .pp-nm b').allTextContents();

test('add a friend by nickname, invite them (offline feedback too), they accept from Home; lobbies show nicknames and a rename', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  await nickname('e2e-nick-a', 'zygis');
  await nickname('e2e-nick-b', 'Mira');
  const srv = server({ friends: false });
  const a = await friend(browser, baseURL!, 'A', srv, 'e2e-nick-a');
  const b = await friend(browser, baseURL!, 'B', srv, 'e2e-nick-b');

  // A opens a party: their own seat shows the nickname from the first view (not a generated "Fancy Calico")
  const ga = a.game();
  await expect(ga.locator('.pl-home[data-variants~="friends"]')).toBeVisible({ timeout: 60_000 });
  // Home's Party (MODE-UNLOCKS.md: Mode Select's With Friends left with one main queue)
  await ga.locator('[data-testid=\"home-party\"]').click();
  const codeEl = ga.locator('[data-testid="party-code"]');
  await expect(codeEl).toBeVisible({ timeout: 60_000 });
  const code = ((await codeEl.textContent()) ?? '').replace(/\s/g, '');
  srv.partyOf.A = code;
  await expect.poll(() => seatNames(ga), { timeout: 15_000 }).toEqual(['zygis']);

  // A: Invite friends → Add → types "mi" → the suggestion "Mira" → Add: friends now
  await ga.locator('[data-testid="party-invite-friends"]').click();
  await expect(ga.locator('.pl-social-empty')).toContainText('No friends yet');
  await ga.locator('.pl-social [data-a="add"]').click();
  await ga.locator('[data-testid="social-add-input"]').pressSequentially('mi', { delay: 60 });
  const sug = ga.locator('[data-testid="social-suggest"]');
  await expect(sug).toHaveCount(1, { timeout: 5_000 });
  await expect(sug.locator('.pl-social-name')).toHaveText('Mira');
  await sug.locator('[data-a="add-name"]').click();
  await expect(ga.locator('.pl-social-note')).toHaveText('You are friends now');
  const rowB = ga.locator(`.pl-social-row[data-code="${CODE.B}"]`);
  await expect(rowB).toBeVisible();

  // an offline friend can be invited too; the inviter is told (they get a notification)
  srv.offline.add('B');
  await ga.locator('.pl-social [data-a="close"]').first().click();
  await ga.locator('[data-testid="party-invite-friends"]').click();
  await rowB.locator('[data-testid="social-invite"]').click();
  await expect(ga.locator('.pl-social-note')).toContainText('is offline: they get a notification.');
  srv.offline.delete('B');

  // B, on Home, gets the invite card within the 4 s inbox poll and accepts
  const gb = b.game();
  const card = gb.locator('[data-testid="invite-toast"]');
  await expect(card).toBeVisible({ timeout: 8_000 });
  await card.locator('[data-testid="invite-accept"]').click();
  await expect(gb.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 60_000 });
  await expect.poll(async () => (await seatNames(ga)).sort(), { timeout: 30_000 }).toEqual(['Mira', 'zygis']);
  await expect.poll(async () => (await seatNames(gb)).sort(), { timeout: 30_000 }).toEqual(['Mira', 'zygis']);

  // B renames while in the lobby: both lobbies show the new name within the relay's name watch (10 s)
  await nickname('e2e-nick-b', 'Mirabel');
  await expect.poll(async () => (await seatNames(ga)).sort(), { timeout: 30_000 }).toEqual(['Mirabel', 'zygis']);
  await expect.poll(async () => (await seatNames(gb)).sort(), { timeout: 30_000 }).toEqual(['Mirabel', 'zygis']);
});

/** A opens a party (Home's Party) and the fake server knows it. */
async function aParty(ga: Frame, srv: Srv): Promise<string> {
  await expect(ga.locator('.pl-home[data-variants~="friends"]')).toBeVisible({ timeout: 60_000 });
  await ga.locator('[data-testid="home-party"]').click();
  const codeEl = ga.locator('[data-testid="party-code"]');
  await expect(codeEl).toBeVisible({ timeout: 60_000 });
  const code = ((await codeEl.textContent()) ?? '').replace(/\s/g, '');
  srv.partyOf.A = code;
  return code;
}

/** A taps Invite on B's row (the Friends sheet over A's lobby) and sees the note; returns when it was sent. */
async function inviteB(ga: Frame, note: string | RegExp = `Invite sent to ${NAME.B}`): Promise<number> {
  if (!(await ga.locator('.pl-social-row').count())) await ga.locator('[data-testid="party-invite-friends"]').click();
  await ga.locator(`.pl-social-row[data-code="${CODE.B}"] [data-testid="social-invite"]`).click();
  await expect(ga.locator('.pl-social-note')).toContainText(note);
  return Date.now();
}

/** B (the host frame) opens its own party and C, a guest, joins it by link: a party of two for champion select. */
async function bPartyWithC(browser: Browser, gb: Frame, srv: Srv): Promise<string> {
  await expect(gb.locator('.pl-home[data-variants~="friends"]')).toBeVisible({ timeout: 60_000 });
  await gb.locator('[data-testid="home-party"]').click();
  const codeEl = gb.locator('[data-testid="party-code"]');
  await expect(codeEl).toBeVisible({ timeout: 60_000 });
  const code = ((await codeEl.textContent()) ?? '').replace(/\s/g, '');
  srv.partyOf.B = code;
  const c = await player(browser, 'desktop');
  await joinByLink(c, code);
  await expect(gb.locator('[data-testid="party-seat"]')).toHaveCount(2, { timeout: 30_000 });
  return code;
}

/*
 * Founder report (Nov 19): "My friend invite me … while was in party, it was written invitation sent but I haven't
 * received anything anywhere. Popup should've appeared for me to either confirm or reject". A is in a party and
 * invites B wherever B is: the card shows within the 4 s poll, Accept joins A, Decline tells A.
 */
test('Nov 19: B in the Store, in its own lobby, in champion select: the card every time; Join leaves B\'s party', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const srv = server();
  const a = await friend(browser, baseURL!, 'A', srv);
  const b = await friend(browser, baseURL!, 'B', srv);
  const ga = a.game();
  const gb = b.game();
  await expect(gb.locator('.pl-home[data-variants~="friends"]')).toBeVisible({ timeout: 60_000 });
  const code = await aParty(ga, srv);
  const card = () => b.game().locator('[data-testid="invite-toast"]');

  // B in the Store: the card over it; Decline tells A
  await gb.locator('.hm-ni[data-a="store"]').click();
  let at = await inviteB(ga);
  await expect(card()).toBeVisible({ timeout: 6_000 });
  expect(Date.now() - at).toBeLessThan(6_500);
  await card().locator('[data-testid="invite-decline"]').click();
  await expect(ga.locator('[data-testid="invite-answer-declined"]')).toContainText(`${NAME.B} declined your invite`, { timeout: 6_000 });

  // B in its own lobby (A's row says In lobby and still offers Invite): the card asks to leave B's party
  await b.reopen();
  await bPartyWithC(browser, b.game(), srv);
  await ga.locator('.pl-social [data-a="close"]').first().click();
  at = await inviteB(ga, `Invite sent to ${NAME.B}. They are in another lobby.`);
  await expect(card()).toBeVisible({ timeout: 6_000 });
  await expect(card().locator('[data-testid="invite-leave"]')).toHaveText(`Leave your party and join ${NAME.A}?`);
  await expect(card().locator('[data-testid="invite-accept"]')).toHaveText('Join');
  await card().locator('[data-testid="invite-decline"]').click();

  // B's party starts: champion select. The card shows there too; Join leaves B's party for A's lobby
  const g2 = b.game();
  await g2.locator('[data-p="diff"][data-v="easy"]').click();
  await g2.locator('[data-testid="party-start"]').click();
  await expect(g2.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 30_000 });
  at = await inviteB(ga, /Invite sent to/);
  await expect(card()).toBeVisible({ timeout: 6_000 });
  await card().locator('[data-testid="invite-accept"]').click();
  await expect(g2.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 60_000 });
  await expect(ga.locator('[data-testid="party-seat"]')).toHaveCount(2, { timeout: 30_000 });
  await expect(ga.locator('[data-testid="invite-answer-accepted"]')).toContainText(`${NAME.B} is joining your party`, { timeout: 6_000 });
});

test('Nov 19: B in a match: a small notice (no card mid-match), A hears "in a match", the card when B is back; Join', async ({ browser, baseURL }) => {
  test.setTimeout(480_000);
  const srv = server();
  const a = await friend(browser, baseURL!, 'A', srv);
  const b = await friend(browser, baseURL!, 'B', srv);
  const ga = a.game();
  const gb = b.game();
  const code = await aParty(ga, srv);
  // B and C play a party match
  await bPartyWithC(browser, gb, srv);
  await gb.locator('[data-p="diff"][data-v="easy"]').click();
  await gb.locator('[data-testid="party-start"]').click();
  await expect(gb.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 30_000 });
  await gb.locator('[data-testid="party-lock"]').click();
  await expect(gb.locator('html[data-screen="match"]')).toHaveCount(1, { timeout: 150_000 });
  await gb.page().waitForTimeout(3_000);
  // a software-rendered match starves the frame's timers: measure it (the notice waits on the in-match poll)
  const lag = await gb.evaluate(() => new Promise<number>((r) => { const t = performance.now(); setTimeout(() => r(performance.now() - t - 1000), 1000); }));
  console.log(`B's timer lag in the match: ${Math.round(lag)} ms`);

  // A invites: B gets the notice within the in-match poll (8 s), never the card; A is told B is in a match
  await inviteB(ga, /Invite sent/);
  const notice = gb.locator('[data-testid="invite-notice"]');
  await expect(notice).toContainText(`${NAME.A} invited you to a party. Answer after the match.`, { timeout: 30_000 });
  await expect(gb.locator('[data-testid="invite-toast"]')).toHaveCount(0);
  await expect.poll(() => srv.invites[0].later).toBe(true);
  await expect(ga.locator('[data-testid="invite-answer-later"]')).toContainText(`${NAME.B} is in a match`, { timeout: 8_000 });
  // past the invite's 60 s: still held
  await gb.page().waitForTimeout(62_000);
  await expect(gb.locator('[data-testid="invite-toast"]')).toHaveCount(0);

  // B leaves the match: Home, and the card for the held invite within a beat; Join takes B to A's lobby
  await gb.locator('body').press('Escape');
  await gb.locator('.pl-menu [data-a="leave"]').click();
  await gb.locator('.pl-menu [data-a="leave-yes"]').click();
  const card = gb.locator('[data-testid="invite-toast"]');
  await expect(card).toBeVisible({ timeout: 8_000 });
  await expect(card).toContainText(`${NAME.A} invited you to a party`);
  await card.locator('[data-testid="invite-accept"]').click();
  await expect(gb.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 60_000 });
  await expect.poll(() => srv.invites[0].answer).toBe('accepted');
});
