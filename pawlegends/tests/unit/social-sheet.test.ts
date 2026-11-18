// @vitest-environment happy-dom
/**
 * The Social sheet (SOCIAL-RANKED.md §14.2–§14.4, Nov 18 redesign): grouped friends that fold (no pages), the header
 * tabs and More, search, the row menu, the row action rules, names through textContent only, guests see the sign-in
 * panel, and add-by-code calls friend.add.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { groupFolded, INVITE_PARTY_RETRY_MS, looksLikeCode, pageOf, rowAction, rowsForHeight, SocialSheet } from '../../src/social/socialSheet';

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
    height: () => opts.height ?? 375,
  });
  return { s, calls, joinParty };
}

describe('social sheet', () => {
  it('hide ladder and paging (the Clubs panel still pages)', () => {
    expect([400, 375, 340, 320, 300, 280].map(rowsForHeight)).toEqual([5, 5, 4, 4, 3, 3]);
    expect(pageOf([1, 2, 3, 4, 5, 6, 7], 1, 5)).toEqual({ rows: [6, 7], page: 1, pages: 2 });
    expect(pageOf([], 3, 5)).toEqual({ rows: [], page: 0, pages: 1 });
  });

  it('row actions: Join a joinable party, Invite from your party, else more', () => {
    expect(rowAction({ state: 'party', joinable: true, party: 'AB' }, false)).toBe('join');
    expect(rowAction({ state: 'online' }, true)).toBe('invite');
    expect(rowAction({ state: 'match' }, true)).toBe('more');
    expect(rowAction({ state: 'offline' }, false)).toBe('more');
    // SOCIAL-INVITES.md: in a party, Invite any online friend not already in it (even one in their own lobby)
    expect(rowAction({ state: 'party', joinable: true, party: 'AB' }, true, 'CD')).toBe('invite');
    expect(rowAction({ state: 'party', joinable: true, party: 'CD' }, true, 'CD')).toBe('more');
    expect(rowAction({ state: 'queue' }, true, 'CD')).toBe('invite');
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
    // the Friends tab has one badge: 1 request
    expect(document.querySelector('[data-testid="social-unread"]')!.textContent).toBe('1');
    document.querySelector<HTMLElement>('[data-a="join"]')!.click();
    expect(t.joinParty).toHaveBeenCalledWith('WXYZ');
    expect(t.s.closed).toBe(true);
  });

  it('header: three tabs plus More (Ranked, Leaderboards) and Close outside the tablist', async () => {
    sheet();
    await flush();
    expect([...document.querySelectorAll('[role="tab"]')].map((b) => b.textContent!.replace(/\d+$/, ''))).toEqual(['Friends', 'Recent', 'Clubs']);
    expect(document.querySelector('[role="tablist"] [data-a="close"]')).toBeNull();
    const more = document.querySelector<HTMLElement>('[data-a="tabs-more"]')!;
    expect(document.querySelector<HTMLElement>('.pl-social-moremenu')!.hidden).toBe(true);
    more.click();
    expect(document.querySelector<HTMLElement>('.pl-social-moremenu')!.hidden).toBe(false);
    document.querySelector<HTMLElement>('.pl-social-moremenu [data-tab="boards"]')!.click();
    await flush();
    expect(document.querySelector('.pl-social-more')!.classList.contains('is-current')).toBe(true);
    expect(document.querySelector('[role="tab"][aria-selected="true"]')).toBeNull();
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

  it('search filters the groups as you type and keeps the field focused', async () => {
    sheet({ friends: 7 });
    await flush();
    const q = document.querySelector<HTMLInputElement>('input[name="q"]')!;
    q.focus();
    q.value = 'friend 3';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect([...document.querySelectorAll('.pl-fr .pl-social-name')].map((n) => n.textContent)).toEqual(['Friend 3']);
    expect(document.activeElement).toBe(q);
    q.value = 'zzz';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('[data-testid="social-search-none"]')).toBeTruthy();
    // Esc clears the search first, then closes the sheet
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelectorAll('.pl-fr')).toHaveLength(7);
  });

  it('a row opens its menu (tap, right-click); Remove takes two taps; Esc closes the menu then the sheet', async () => {
    const t = sheet({ friends: 3 });
    await flush();
    const main = document.querySelector<HTMLElement>('.pl-fr-main[data-code="PL-AAAA-AAA2"]')!;
    main.click();
    const menu = () => document.querySelector<HTMLElement>('.pl-fr-menu');
    expect(menu()).toBeTruthy();
    expect(menu()!.querySelector('.pl-fr-menu-name')!.textContent).toBe('Friend 2');
    expect([...menu()!.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Message', 'Remove friend', 'Block']);
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
    expect(row.querySelector('.pl-social-preview')!.textContent).toBe('gg! one more?');
    expect(row.querySelector('[data-testid="chat-unread"]')!.textContent).toBe('2');
    expect(document.querySelector('[data-testid="social-unread"]')!.textContent).toBe('2');
  });

  it('guests see the sign-in panel and no social call is made', async () => {
    const t = sheet({ signedIn: false });
    await flush();
    expect(document.querySelector('[data-a="signin"]')).toBeTruthy();
    expect(t.calls.filter((c) => c.op === 'social.get')).toEqual([]);
  });

  it('add by code sends friend.add with the typed code', async () => {
    const t = sheet();
    await flush();
    document.querySelector<HTMLElement>('[data-a="add"]')!.click();
    // the add form shows my own friend code to share
    expect(document.querySelector('.pl-social-mycode strong')!.textContent).toBe('PL-7KQ2-M9XR');
    const input = document.querySelector<HTMLInputElement>('input[name="code"]')!;
    input.value = 'pl-7kq2-m9xr';
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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
    expect(api.mock.calls.at(-1)?.[1]).toEqual({ rev: 'r2' });
    s.dispose();
  });

  it('a status note clears itself after 3 s', async () => {
    vi.useFakeTimers();
    try {
      const t = sheet();
      await flush();
      document.querySelector<HTMLElement>('[data-a="add"]')!.click();
      document.querySelector<HTMLElement>('[data-a="copy"]')!.click();
      expect(document.querySelector('.pl-social-note')).toBeTruthy();
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
    expect(['PL-7KQ2-M9XR', 'pl-7kq2-m9xr', '7KQ2M9XR', ' 7kq2 m9xr '].map(looksLikeCode)).toEqual([true, true, true, true]);
    expect(['zygis', 'Mira', 'Big Cat 7', 'PL-7KQ2'].map(looksLikeCode)).toEqual([false, false, false, false]);
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
      expect(input.placeholder).toBe('Name or PL-XXXX-XXXX');
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
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(t.calls.find((c) => c.op === 'friend.add')?.args).toEqual({ name: 'Nobody Here' });
    expect(document.querySelector('.pl-social-note')!.textContent).toBe('No player has this name.');
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
