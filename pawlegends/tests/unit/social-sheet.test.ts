// @vitest-environment happy-dom
/**
 * The Social sheet (SOCIAL-RANKED.md §14.2–§14.4): the hide ladder, paging instead of scrolling, the row action rules,
 * names through textContent only, guests see the sign-in panel, and add-by-code calls friend.add.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { INVITE_PARTY_RETRY_MS, looksLikeCode, pageOf, rowAction, rowsForHeight, SocialSheet } from '../../src/social/socialSheet';

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
  it('hide ladder and paging', () => {
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

  it('pages friends, sets names as text, and joins in one tap', async () => {
    const t = sheet({ friends: 7 });
    await flush();
    const rows = document.querySelectorAll('.pl-social-row');
    expect(rows).toHaveLength(5);
    // names never become markup: the only pictures are painted hero faces (ui/art.ts)
    expect(document.querySelector('img:not([src*="/assets/faces/"])')).toBeNull();
    // CHAT-AVATARS §6.1: a joinable party first (Friend 1), then offline A–Z; names stay text
    expect(rows[0].querySelector('.pl-social-name')!.textContent).toBe('Friend 1');
    expect([...document.querySelectorAll('.pl-social-name')].map((n) => n.textContent)).toContain('<img src=x onerror=alert(1)>');
    expect(document.querySelector('.pl-pager small')!.textContent).toBe('1/2');
    document.querySelector<HTMLElement>('[data-a="join"]')!.click();
    expect(t.joinParty).toHaveBeenCalledWith('WXYZ');
    expect(t.s.closed).toBe(true);
  });

  it('at 300 px tall, 3 rows a page', async () => {
    sheet({ friends: 7, height: 300 });
    await flush();
    expect(document.querySelectorAll('.pl-social-row')).toHaveLength(3);
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
