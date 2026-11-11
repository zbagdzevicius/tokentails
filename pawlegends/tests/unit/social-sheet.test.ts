// @vitest-environment happy-dom
/**
 * The Social sheet (SOCIAL-RANKED.md §14.2–§14.4): the hide ladder, paging instead of scrolling, the row action rules,
 * names through textContent only, guests see the sign-in panel, and add-by-code calls friend.add.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { pageOf, rowAction, rowsForHeight, SocialSheet } from '../../src/social/socialSheet';

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

function sheet(opts: { signedIn?: boolean; friends?: number; height?: number } = {}) {
  const calls: { op: string; args: unknown }[] = [];
  const api = vi.fn(async (op: string, args?: unknown): Promise<ApiResult> => {
    calls.push({ op, args });
    if (op === 'social.get') return { id: 'x', ok: true, status: 200, body: state(opts.friends ?? 7) };
    if (op === 'friend.add') return { id: 'x', ok: true, status: 200, body: { state: 'sent' } };
    return { id: 'x', ok: true, status: 200, body: {} };
  });
  const joinParty = vi.fn();
  const s = new SocialSheet(document.body, {
    api: api as never,
    signedIn: () => opts.signedIn ?? true,
    partyCode: () => null,
    joinParty,
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
  });

  it('pages friends, sets names as text, and joins in one tap', async () => {
    const t = sheet({ friends: 7 });
    await flush();
    const rows = document.querySelectorAll('.pl-social-row');
    expect(rows).toHaveLength(5);
    expect(document.querySelector('img')).toBeNull();
    expect(rows[0].querySelector('.pl-social-name')!.textContent).toBe('<img src=x onerror=alert(1)>');
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
