// @vitest-environment happy-dom
/**
 * The Social sheet (SOCIAL-RANKED.md §14.2–§14.4, Nov 18 redesign): grouped friends that fold (no pages), the header
 * tabs and More, search, the row menu, the row action rules, names through textContent only, guests see the sign-in
 * panel, and add-by-code calls friend.add.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { busyText, groupFolded, INVITE_PARTY_RETRY_MS, looksLikeCode, pageOf, presenceText, rowAction, rowsForHeight, SocialSheet, spanText } from '../../src/social/socialSheet';

afterEach(() => {
  document.body.innerHTML = '';
});

const state = (n: number) => ({
  me: { code: 'PL-7KQ2-M9XR', name: 'Witty Biscuit', invisible: false, allowRecent: true, ageBand: '18+' },
  friends: Array.from({ length: n }, (_, i) => ({ code: `PL-AAAA-AAA${i}`, name: i === 0 ? '<img src=x onerror=alert(1)>' : `Friend ${i}`, presence: { state: i === 1 ? 'party' : 'offline', ...(i === 1 ? { joinable: true, party: 'WXYZ' } : {}) } })),
  requests: { in: [{ code: 'PL-BBBB-BBBB', name: 'Mira' }], out: [] },
  blocks: [],
  invites: [],
  rev: 'abc',
});

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function sheet(opts: { signedIn?: boolean; friends?: number; height?: number; party?: string | null; answer?: (op: string, args: any) => ApiResult | null; onInviteSent?: (i: unknown) => void } = {}) {
  const calls: { op: string; args: unknown }[] = [];
  const api = vi.fn(async (op: string, args?: unknown): Promise<ApiResult> => {
    calls.push({ op, args });
    const custom = opts.answer?.(op, args);
    if (custom) return custom;
    if (op === 'social.get') return { id: 'x', ok: true, status: 200, body: state(opts.friends ?? 7) };
    if (op === 'friend.add') return { id: 'x', ok: true, status: 200, body: { state: 'sent' } };
    return { id: 'x', ok: true, status: 200, body: {} };
  });
  const joinParty = vi.fn();
  const s = new SocialSheet(document.body, {
    api: api as never,
    signedIn: () => opts.signedIn ?? true,
    partyCode: () => opts.party ?? null,
    joinParty,
    ...(opts.onInviteSent ? { onInviteSent: opts.onInviteSent } : {}),
    signIn: vi.fn(),
    playCasual: vi.fn(),
    height: () => opts.height ?? 800,
  });
  return { s, calls, joinParty };
}

describe('social sheet', () => {
  it('hide ladder and paging (the Clubs panel still pages)', () => {
    expect([400, 375, 340, 320, 300, 280].map(rowsForHeight)).toEqual([5, 5, 4, 4, 3, 3]);
    expect(pageOf([1, 2, 3, 4, 5, 6, 7], 1, 5)).toEqual({ rows: [6, 7], page: 1, pages: 2 });
    expect(pageOf([], 3, 5)).toEqual({ rows: [], page: 0, pages: 1 });
  });

  it('row actions: Join a joinable party, Invite a free friend, nothing for a busy one (the menu says why)', () => {
    expect(rowAction({ state: 'party', joinable: true, party: 'AB' }, false)).toBe('join');
    expect(rowAction({ state: 'online' }, true)).toBe('invite');
    expect(rowAction({ state: 'match' }, true)).toBe('more');
    expect(rowAction({ state: 'offline' }, false)).toBe('more');
    // LoL greys invite out for busy friends: in a queue, already in my party. Nov 19: a friend in another lobby gets
    // Invite (their card asks "Leave your party and join …?")
    expect(rowAction({ state: 'party', joinable: true, party: 'AB' }, true, 'CD')).toBe('invite');
    expect(rowAction({ state: 'party', joinable: true, party: 'CD' }, true, 'CD')).toBe('more');
    expect(rowAction({ state: 'queue' }, true, 'CD')).toBe('more');
    expect(rowAction({ state: 'queue', mode: 'ranked' }, false)).toBe('more');
    // a lobby that is not open: Ask to join (a "Wanna play?" in their DM), LoL's ask-to-join
    expect(rowAction({ state: 'party', size: 2, max: 3, party: 'AB' }, false)).toBe('ask');
    expect(busyText({ state: 'queue' })).toBe('In a queue: invite after it');
    expect(busyText({ state: 'party', party: 'CD' }, 'CD')).toBe('Already in your party');
    expect(busyText({ state: 'party', party: 'AB' })).toBe('In another lobby');
    expect(busyText({ state: 'online' })).toBe('');
    // an offline friend is invited too (a notification; the inviter is told they are offline); one in a match is not
    expect(rowAction({ state: 'offline' }, true, 'CD')).toBe('invite');
    expect(rowAction({ state: 'match' }, true, 'CD')).toBe('more');
    // out of a party, an online friend gets Invite (the party opens through PLAY first)
    expect(rowAction({ state: 'online' }, false)).toBe('invite');
  });

  it('lists every friend in groups (no pages), sets names as text, and joins in one tap', async () => {
    const t = sheet({ friends: 7 });
    await flush();
    // 7 friends and Mira's request: one row each, no pager anywhere
    expect(document.querySelectorAll('.pl-fr')).toHaveLength(7);
    expect(document.querySelectorAll('.pl-rq')).toHaveLength(1);
    expect(document.querySelector('.pl-pager')).toBeNull();
    // names never become markup: the only pictures are painted hero faces (ui/art.ts)
    expect(document.querySelector('img:not([src*="/assets/faces/"])')).toBeNull();
    // groups with counts: requests first, then online (Friend 1 in a joinable lobby), then offline A–Z
    expect([...document.querySelectorAll('.pl-group')].map((g) => (g as HTMLElement).dataset.g)).toEqual(['requests', 'online', 'offline']);
    expect([...document.querySelectorAll('.pl-group-n')].map((n) => n.textContent)).toEqual(['1', '1', '6']);
    const first = document.querySelector('.pl-fr')!;
    expect(first.querySelector('.pl-social-name')!.textContent).toBe('Friend 1');
    expect(first.querySelector('.pl-social-st')!.textContent).toBe('In lobby · open');
    // the full name is the tooltip (an ellipsis never hides it for good)
    expect((first.querySelector('.pl-social-name') as HTMLElement).title).toBe('Friend 1');
    expect([...document.querySelectorAll('.pl-social-name')].map((n) => n.textContent)).toContain('<img src=x onerror=alert(1)>');
    // on Friends the groups show the counts: the tab itself has no badge (no number to misread)
    expect(document.querySelector('[data-testid="social-unread"]')).toBeNull();
    document.querySelector<HTMLElement>('[data-a="join"]')!.click();
    expect(t.joinParty).toHaveBeenCalledWith('WXYZ');
    expect(t.s.closed).toBe(true);
  });

  it('header: Friends and Clubs plus More (Ranked; founder Nov 19: no Recent, no Compact list, no leaderboards)', async () => {
    sheet();
    await flush();
    expect([...document.querySelectorAll('[role="tab"]')].map((b) => b.textContent)).toEqual(['Friends', 'Clubs']);
    expect(document.querySelector('[role="tablist"] [data-a="close"]')).toBeNull();
    const more = document.querySelector<HTMLElement>('[data-a="tabs-more"]')!;
    expect(document.querySelector<HTMLElement>('.pl-social-moremenu')!.hidden).toBe(true);
    more.click();
    expect(document.querySelector<HTMLElement>('.pl-social-moremenu')!.hidden).toBe(false);
    expect([...document.querySelectorAll('.pl-social-moremenu .pl-mi')].map((b) => b.textContent)).toEqual(['Ranked']);
    expect(document.querySelector('[data-testid="social-density"]')).toBeNull();
    expect(document.querySelector('[data-tab="boards"], [data-tab="recent"], [data-board]')).toBeNull();
    document.querySelector<HTMLElement>('.pl-social-moremenu [data-tab="ranked"]')!.click();
    await flush();
    expect(document.querySelector('.pl-social-more')!.classList.contains('is-current')).toBe(true);
    expect(document.querySelector('[role="tab"][aria-selected="true"]')).toBeNull();
  });

  it('presence lines carry the detail the backend sends (mode, time, seats, last seen) and never invent it', () => {
    const now = Date.UTC(2026, 10, 19, 12, 0, 0);
    expect(presenceText({ state: 'match', mode: 'ranked', since: now - 12 * 60_000 }, now)).toBe('In match · Ranked · 12m');
    expect(presenceText({ state: 'queue', mode: 'casual', since: now - 2 * 60_000 }, now)).toBe('In queue · Casual · 2m');
    expect(presenceText({ state: 'party', joinable: true, party: 'AB', size: 2, max: 3 }, now)).toBe('In lobby · 2/3 · open');
    expect(presenceText({ state: 'offline', seen: now - 2 * 86_400_000 }, now)).toBe('Offline · 2d');
    // an older backend: the state alone; an unknown mode or a future time is left out
    expect(presenceText({ state: 'match', room: 'abcdefghijkl' }, now)).toBe('In match');
    expect(presenceText({ state: 'match', mode: '<b>x</b>', since: now + 3_600_000 }, now)).toBe('In match');
    expect(presenceText({ state: 'party', size: 9, max: 3 }, now)).toBe('In lobby');
    expect([30_000, 5 * 60_000, 3 * 3_600_000, 3 * 86_400_000].map((d) => spanText(now - d, now))).toEqual(['now', '5m', '3h', '3d']);
  });

  it('one header row on every screen and tab: the title, my status dot, the invite gift, Add, Close; requests never fold', async () => {
    // friend requests stay open at the top (LoL), whatever was chosen before
    expect(groupFolded('requests', undefined, { on: 1, off: 0 })).toBe(false);
    expect(groupFolded('requests', true, { on: 1, off: 0 })).toBe(false);
    expect(groupFolded('offline', undefined, { on: 1, off: 7 })).toBe(true);
    localStorage.removeItem('pl.social.groups.v1');
    localStorage.removeItem('pl.social.inviteFolded');
    const { calls } = sheet({
      height: 375,
      answer: (op) => (op === 'growth.invite' ? { id: 'x', ok: true, status: 200, body: { code: 'K7QX2MP', link: 'https://pawlegends.app/?ref=K7QX2MP', need: 3, invited: [], accepted: null, claimable: 0, nextCoat: null, earned: 0, cap: 5 } } : null),
    });
    await flush();
    // never folded: a short screen keeps the "Friend requests" heading like every other screen (round 7); the row's
    // Tab stop is the person, never Accept
    expect(document.querySelector('[data-group="requests"]')!.tagName).toBe('H3');
    expect(document.querySelector('[data-group="requests"]')!.getAttribute('aria-label')).toMatch(/^Friend requests, \d+$/);
    expect(document.querySelectorAll('.pl-rq').length).toBeGreaterThan(0);
    expect(document.querySelector('.pl-rq [data-a="accept"]')!.hasAttribute('data-nav')).toBe(false);
    expect(document.querySelector('.pl-rq .pl-rq-main')!.hasAttribute('data-nav')).toBe(true);
    // friends to show: the invite card starts folded into the header's gift; no search field until Search is tapped
    expect(document.querySelector('[data-testid="invite-row"]')).toBeNull();
    expect(document.querySelector('.pl-social-head [data-testid="invite-open"]')).toBeTruthy();
    // founder Nov 19: no self card (my own name and "Online" told me nothing): the title and a status dot
    expect(document.querySelector('.pl-social-head .pl-me')).toBeNull();
    expect(document.querySelector('.pl-social-head')!.textContent).not.toContain('Witty Biscuit');
    expect(document.querySelector('.pl-social-head .pl-social-title')!.textContent).toBe('Friends');
    expect(document.querySelector('.pl-social-head [data-testid="social-status"]')!.getAttribute('aria-label')).toBe('My status: Online. Change status');
    expect(document.querySelector('.pl-social-head .pl-av')).toBeNull();
    expect(document.querySelector('input[name="q"]')).toBeNull();
    // Clubs selected: Friends shows a dot that names what waits (1 request)
    document.querySelector<HTMLElement>('[role="tab"][data-tab="clubs"]')!.click();
    await flush();
    expect(document.querySelector('[data-testid="social-unread"]')).toBeTruthy();
    expect(document.querySelector('[role="tab"][data-tab="friends"]')!.getAttribute('aria-label')).toBe('Friends, 1 request');
    // the header does not change with the tab: my status, the gift and Add stay
    expect(document.querySelector('.pl-social-head [data-testid="social-status"]')).toBeTruthy();
    expect(document.querySelector('.pl-social-head [data-testid="invite-open"]')).toBeTruthy();
    document.querySelector<HTMLElement>('[role="tab"][data-tab="friends"]')!.click();
    await flush();
    // a short screen (round 8): the gift opens the card as a sheet over the list (the list stays as it was); its ×,
    // the scrim or Esc folds it again, and it never comes back open by itself
    document.querySelector<HTMLElement>('[data-testid="invite-open"]')!.click();
    await flush();
    expect(document.querySelector('.pl-social-body [data-testid="invite-row"]')).toBeNull();
    expect(document.querySelector('.pl-inv-sheet [data-testid="invite-row"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="invite-open"]')!.getAttribute('aria-expanded')).toBe('true');
    document.querySelector<HTMLElement>('[data-testid="invite-row"] [data-a="inv-fold"]')!.click();
    await flush();
    expect(document.querySelector('[data-testid="invite-row"]')).toBeNull();
    document.querySelector<HTMLElement>('[data-testid="invite-open"]')!.click();
    await flush();
    document.querySelector('.pl-inv-sheet')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(document.querySelector('[data-testid="invite-row"]')).toBeNull();
    expect(document.querySelector('.pl-social')).toBeTruthy();
    localStorage.removeItem('pl.social.inviteFolded');
    // the status dot opens my status card (no Change avatar: Profile only); Appear offline goes to social.me
    document.querySelector<HTMLElement>('[data-testid="social-status"]')!.click();
    await flush();
    expect(document.querySelector('[data-testid="social-me-card"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="avatar-open"]')).toBeNull();
    document.querySelector<HTMLElement>('.pl-me-opt[data-v="invisible"]')!.click();
    await flush();
    expect(calls.find((c) => c.op === 'social.me')?.args).toEqual({ invisible: true, away: false });
    expect(document.querySelector('[data-testid="social-me-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="social-status"]')!.getAttribute('aria-label')).toContain('Appear offline');
  });

  it('request rows: Decline quiet, Accept the filled primary, in the shared columns', async () => {
    sheet({ height: 900 });
    await flush();
    const rq = document.querySelector('.pl-rq')!;
    expect(rq.querySelector('[data-a="decline"]')!.classList.contains('pl-act-1')).toBe(true);
    expect(rq.querySelector('[data-a="accept"]')!.classList.contains('pl-act-2')).toBe(true);
    expect(rq.querySelector('[data-a="accept"]')!.classList.contains('is-primary')).toBe(true);
    const inv = document.querySelector('[data-testid="social-invite"]');
    if (inv) expect(inv.getAttribute('title')).toBe('Invite to party');
  });

  it('the live match sits in More, not in the list', async () => {
    const api = vi.fn(async (op: string): Promise<ApiResult> => {
      if (op === 'social.get') return { id: 'x', ok: true, status: 200, body: { ...state(2), live: { featured: true } } };
      return { id: 'x', ok: true, status: 200, body: {} };
    });
    const watch = vi.fn();
    new SocialSheet(document.body, { api: api as never, signedIn: () => true, partyCode: () => null, joinParty: vi.fn(), signIn: vi.fn(), playCasual: vi.fn(), watch, height: () => 800 });
    await flush();
    expect(document.querySelector('.pl-social-body [data-testid="social-watch-live"]')).toBeNull();
    document.querySelector<HTMLElement>('[data-a="tabs-more"]')!.click();
    document.querySelector<HTMLElement>('.pl-social-moremenu [data-testid="social-watch-live"]')!.click();
    expect(watch).toHaveBeenCalledWith({ featured: true });
  });

  it('groups fold and unfold; Offline starts folded when friends are online and more than 6 are offline', async () => {
    expect(groupFolded('offline', undefined, { on: 1, off: 7 })).toBe(true);
    expect(groupFolded('offline', undefined, { on: 0, off: 30 })).toBe(false);
    expect(groupFolded('offline', false, { on: 1, off: 7 })).toBe(false);
    expect(groupFolded('sent', undefined, { on: 0, off: 0 })).toBe(true);
    localStorage.removeItem('pl.social.groups.v1');
    sheet({ friends: 9 });
    await flush();
    const offline = () => document.querySelector<HTMLElement>('[data-group="offline"]')!;
    expect(offline().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('.pl-fr')).toHaveLength(1);
    offline().click();
    expect(offline().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('.pl-fr')).toHaveLength(9);
    expect(JSON.parse(localStorage.getItem('pl.social.groups.v1')!)).toEqual({ offline: false });
    localStorage.removeItem('pl.social.groups.v1');
  });

  it('search opens from the tab bar, filters the groups as you type and keeps the field focused', async () => {
    sheet({ friends: 7 });
    await flush();
    document.querySelector<HTMLElement>('[data-a="search"]')!.click();
    const q = document.querySelector<HTMLInputElement>('input[name="q"]')!;
    q.focus();
    q.value = 'friend 3';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect([...document.querySelectorAll('.pl-fr .pl-social-name')].map((n) => n.textContent)).toEqual(['Friend 3']);
    expect(document.activeElement).toBe(q);
    q.value = 'zzz';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('[data-testid="social-search-none"]')).toBeTruthy();
    // Esc clears the search first, then closes the field
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelectorAll('.pl-fr')).toHaveLength(7);
    document.querySelector('input[name="q"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('input[name="q"]')).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[data-a="search"]'));
  });

  it('a row opens its menu (tap, right-click); Remove takes two taps; Esc closes the menu then the sheet', async () => {
    const t = sheet({ friends: 3 });
    await flush();
    const main = document.querySelector<HTMLElement>('.pl-fr-main[data-code="PL-AAAA-AAA2"]')!;
    main.click();
    const menu = () => document.querySelector<HTMLElement>('.pl-fr-menu');
    expect(menu()).toBeTruthy();
    expect(menu()!.querySelector('.pl-fr-menu-name')!.textContent).toBe('Friend 2');
    expect([...menu()!.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Message', 'Pin to favourites', 'Remove friend', 'Block']);
    menu()!.querySelector<HTMLElement>('[data-a="remove"]')!.click();
    expect(t.calls.some((c) => c.op === 'friend.remove')).toBe(false);
    expect(menu()!.querySelector('[data-a="remove"]')!.textContent).toBe('Tap again to remove');
    menu()!.querySelector<HTMLElement>('[data-a="remove"]')!.click();
    await flush();
    expect(t.calls.find((c) => c.op === 'friend.remove')?.args).toEqual({ code: 'PL-AAAA-AAA2' });
    document.querySelector('.pl-fr')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(menu()).toBeTruthy();
    document.querySelector('.pl-social')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu()).toBeNull();
    expect(t.s.closed).toBe(false);
    document.querySelector('.pl-social')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.s.closed).toBe(true);
  });

  it('a friend with unread messages keeps the presence line and adds the preview after it', async () => {
    const api = vi.fn(async (op: string): Promise<ApiResult> => {
      if (op === 'social.get') return { id: 'x', ok: true, status: 200, body: { ...state(2), requests: { in: [], out: [] }, chat: { unread: 2 } } };
      if (op === 'chat.list') return { id: 'x', ok: true, status: 200, body: { threads: [{ id: 't', with: { code: 'PL-AAAA-AAA1', name: 'Friend 1' }, tier: 'text', lastPreview: 'gg! one more?', lastMine: false, unread: 2, muted: false }] } };
      return { id: 'x', ok: true, status: 200, body: {} };
    });
    new SocialSheet(document.body, { api: api as never, signedIn: () => true, partyCode: () => null, joinParty: vi.fn(), signIn: vi.fn(), playCasual: vi.fn(), height: () => 375 });
    await flush();
    const row = document.querySelector('.pl-fr[data-code="PL-AAAA-AAA1"]')!;
    expect(row.querySelector('.pl-social-st')!.textContent).toBe('In lobby · open');
    expect(row.querySelector('.pl-social-msg')!.textContent).toBe('gg! one more?');
    expect(row.querySelector('[data-testid="chat-unread"]')!.textContent).toBe('2');
    // one line: the preview sits inside the status line, after the status
    expect(row.querySelector('.pl-social-line .pl-social-msg')).toBeTruthy();
    expect((row.querySelector('.pl-social-msg') as HTMLElement).title).toBe('gg! one more?');
  });

  it('guests see the sign-in panel and no social call is made', async () => {
    const t = sheet({ signedIn: false });
    await flush();
    expect(document.querySelector('[data-a="signin"]')).toBeTruthy();
    expect(t.calls.filter((c) => c.op === 'social.get')).toEqual([]);
  });

  it('an old friend code typed or pasted still sends friend.add by code (Nov 20: nothing shows or asks for one)', async () => {
    const t = sheet();
    await flush();
    document.querySelector<HTMLElement>('[data-a="add"]')!.click();
    // the add card sits above the list (the list stays); no code anywhere (the nickname is the username)
    expect(document.querySelector('.pl-social-body > [data-testid="social-add-card"]')).toBeTruthy();
    expect(document.querySelectorAll('.pl-fr').length).toBeGreaterThan(0);
    expect(document.querySelector('.pl-social-mycode')).toBeNull();
    expect(document.body.textContent).not.toMatch(/PL-|friend code/i);
    const input = document.querySelector<HTMLInputElement>('input[name="code"]')!;
    input.value = 'pl-7kq2-m9xr';
    document.querySelector('[data-testid="social-add-card"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(t.calls.find((c) => c.op === 'friend.add')?.args).toEqual({ code: 'pl-7kq2-m9xr' });
  });
});

describe('social sheet pulse', () => {
  it('on the Ranked tab a changed pulse keeps the rev and does not refetch', async () => {
    const calls: string[] = [];
    const rev = 'r2';
    const api = vi.fn(async (op: string, args?: { rev?: string }): Promise<ApiResult> => {
      calls.push(op);
      if (op === 'social.get') return { id: 'x', ok: true, status: 200, body: state(2) };
      if (op === 'social.pulse') return args?.rev === rev ? { id: 'x', ok: true, status: 204 } : { id: 'x', ok: true, status: 200, body: { rev, invites: [] } };
      return { id: 'x', ok: true, status: 200, body: {} };
    });
    const s = new SocialSheet(document.body, { api: api as never, signedIn: () => true, partyCode: () => null, joinParty: vi.fn(), signIn: vi.fn(), playCasual: vi.fn(), height: () => 375 });
    await flush();
    document.querySelector<HTMLElement>('[data-a="tabs-more"]')!.click();
    document.querySelector<HTMLElement>('[data-tab="ranked"]')!.click();
    await flush();
    calls.length = 0;
    await s.pulse();
    await s.pulse();
    expect(calls).toEqual(['social.pulse', 'social.pulse']);
    expect(api.mock.calls.at(-1)?.[1]).toEqual({ rev: 'r2', dev: 'd' });
    s.dispose();
  });

  it('a status note clears itself after 3 s', async () => {
    vi.useFakeTimers();
    try {
      const t = sheet();
      await flush();
      document.querySelector<HTMLElement>('[data-testid="social-status"]')!.click();
      // Nov 20: my card copies my name (friends add you by it), never a code
      const copy = document.querySelector<HTMLElement>('[data-testid="social-copy-name"]')!;
      expect(copy.textContent).not.toMatch(/PL-|code/i);
      copy.click();
      expect(document.querySelector('.pl-social-note')!.textContent).toBe('Name copied');
      vi.advanceTimersByTime(3100);
      expect(document.querySelector('.pl-social-note')).toBeNull();
      t.s.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('social sheet: add by nickname, invites (SOCIAL-INVITES.md)', () => {
  it('a code is a code; anything else is a nickname', () => {
    expect(['PL-7KQ2-M9XR', 'pl-7kq2-m9xr', 'PL7KQ2M9XR', ' pl 7kq2 m9xr '].map(looksLikeCode)).toEqual([true, true, true, true]);
    // 8-letter names are names (a bare code goes out as a name; the server falls back to the code)
    expect(['zygis', 'Mira', 'Big Cat 7', 'PL-7KQ2', 'Whiskers', 'Fuzz Ball', '7KQ2M9XR'].map(looksLikeCode)).toEqual([false, false, false, false, false, false, false]);
  });

  it('typing a name shows suggestions (names as text) and Add sends friend.add by the exact name', async () => {
    vi.useFakeTimers();
    try {
      const t = sheet({
        answer: (op, args) =>
          op === 'social.search'
            ? { id: 'x', ok: true, status: 200, body: { players: [{ name: 'zygis', cc: 'LT' }, { name: 'Zygimantas<b>', rel: 'friend' }] } }
            : op === 'friend.add' && args?.name
              ? { id: 'x', ok: true, status: 200, body: { state: 'sent' } }
              : null,
      });
      await flush();
      document.querySelector<HTMLElement>('[data-a="add"]')!.click();
      const input = document.querySelector<HTMLInputElement>('input[name="code"]')!;
      expect(input.placeholder).toBe('Player name');
      input.value = 'zy';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      await flush();
      expect(t.calls.find((c) => c.op === 'social.search')?.args).toEqual({ name: 'zy' });
      const rows = [...document.querySelectorAll('[data-testid="social-suggest"]')];
      expect(rows.map((r) => r.querySelector('.pl-social-name')!.textContent)).toEqual(['zygis', 'Zygimantas<b>']);
      expect(document.querySelector('b')).toBeNull();
      // already a friend: no Add button; the input kept its text
      expect(rows[1].querySelector('[data-a="add-name"]')).toBeNull();
      expect(document.querySelector<HTMLInputElement>('input[name="code"]')!.value).toBe('zy');
      rows[0].querySelector<HTMLElement>('[data-a="add-name"]')!.click();
      await flush();
      expect(t.calls.find((c) => c.op === 'friend.add')?.args).toEqual({ name: 'zygis' });
      expect(document.querySelector('.pl-social-note')!.textContent).toBe('Request sent to zygis');
    } finally {
      vi.useRealTimers();
    }
  });

  it('submitting a typed nickname adds by name; an unknown one says so', async () => {
    const t = sheet({ answer: (op) => (op === 'friend.add' ? { id: 'x', ok: false, status: 404, body: { code: 'PAWLEGENDS_SOCIAL_NO_NAME' } } : null) });
    await flush();
    document.querySelector<HTMLElement>('[data-a="add"]')!.click();
    document.querySelector<HTMLInputElement>('input[name="code"]')!.value = 'Nobody Here';
    document.querySelector('[data-testid="social-add-card"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(t.calls.find((c) => c.op === 'friend.add')?.args).toEqual({ name: 'Nobody Here' });
    expect(document.querySelector('.pl-social-note')!.textContent).toBe('No player has this name.');
  });

  it('an 8-letter nickname ("Whiskers") is added by name; only a PL- code goes out as a code', async () => {
    const t = sheet({ answer: (op) => (op === 'friend.add' ? { id: 'x', ok: true, status: 200, body: { state: 'sent' } } : null) });
    await flush();
    const submit = async (text: string) => {
      document.querySelector<HTMLElement>('[data-a="add"]')!.click();
      document.querySelector<HTMLInputElement>('input[name="code"]')!.value = text;
      document.querySelector('[data-testid="social-add-card"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flush();
    };
    await submit('Whiskers');
    await submit('PL-7KQ2-M9XR');
    expect(t.calls.filter((c) => c.op === 'friend.add').map((c) => c.args)).toEqual([{ name: 'Whiskers' }, { code: 'PL-7KQ2-M9XR' }]);
  });

  it('Invite from a fresh lobby retries "no party" until the relay wrote it, then says sent and reports the id', async () => {
    vi.useFakeTimers();
    try {
      let tries = 0;
      const sent: unknown[] = [];
      const t = sheet({
        party: 'K7QX2M',
        onInviteSent: (i) => sent.push(i),
        answer: (op) =>
          op === 'invite.send'
            ? ++tries < 3
              ? { id: 'x', ok: false, status: 409, body: { code: 'PAWLEGENDS_SOCIAL_NO_PARTY' } }
              : { id: 'x', ok: true, status: 200, body: { ok: true, id: 'a'.repeat(24), ttl: 60_000, offline: true } }
            : null,
      });
      await flush();
      document.querySelector<HTMLElement>('[data-a="invite"]')!.click();
      await flush();
      expect(document.querySelector('.pl-social-note')!.textContent).toMatch(/^Inviting /);
      await vi.advanceTimersByTimeAsync(INVITE_PARTY_RETRY_MS * 2 + 10);
      await flush();
      expect(t.calls.filter((c) => c.op === 'invite.send')).toHaveLength(3);
      expect(document.querySelector('.pl-social-note')!.textContent).toMatch(/is offline: they get a notification\.$/);
      expect(sent).toEqual([{ id: 'a'.repeat(24), name: expect.any(String), ttl: 60_000 }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
