// @vitest-environment happy-dom
/**
 * The add-friend sheet (social/friendsSheet.ts, friends panel Nov 20): everything the old sidebar did to find and answer
 * people, in one place: add by name with suggestions, incoming and sent requests, recent players, my status and note,
 * copy my name, the age question, a guest's Sign in; and the party lobby's invite list (Home's rows with their +).
 * Names are text only. It is not a friends list.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { FriendsSheet, type FriendsSheetDeps } from '../../src/social/friendsSheet';
import type { FriendRow } from '../../src/social/presence';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

const state = (over: Record<string, unknown> = {}) => ({
  me: { code: 'PL-7KQ2-M9XR', name: 'Witty Biscuit', invisible: false, allowRecent: true, ageBand: '18+', note: null },
  friends: [{ code: 'PL-AAAA-AAA1', name: 'Mochi', presence: { state: 'online' } }],
  requests: { in: [{ code: 'PL-BBBB-BBBB', name: '<img src=x onerror=alert(1)>', at: Date.now() - 7_200_000 }], out: [{ code: 'PL-CCCC-CCCC', name: 'Luna' }] },
  blocks: [],
  invites: [],
  rev: 'abc',
  ...over,
});

function sheet(opts: { signedIn?: boolean; answer?: (op: string, args: any) => ApiResult | null; deps?: Partial<FriendsSheetDeps>; mode?: 'add' | 'invite'; st?: Record<string, unknown> } = {}) {
  const calls: { op: string; args: any }[] = [];
  const api = vi.fn(async (op: string, args?: unknown): Promise<ApiResult> => {
    calls.push({ op, args });
    const custom = opts.answer?.(op, args);
    if (custom) return custom;
    if (op === 'social.get') return { id: 'x', ok: true, status: 200, body: state(opts.st) };
    if (op === 'social.recent') return { id: 'x', ok: true, status: 200, body: { players: [{ room: 'r1', slot: 2, name: 'Pepper', team: 'ally', canAdd: true, hero: 'sage' }, { room: 'r1', slot: 3, name: 'Nope', team: 'foe', canAdd: false }] } };
    if (op === 'social.search') return { id: 'x', ok: true, status: 200, body: { players: [{ name: 'Mira' }, { name: 'Miro', rel: 'friend' }, { name: 'Mika', rel: 'asked' }] } };
    if (op === 'friend.add') return { id: 'x', ok: true, status: 200, body: { state: 'sent' } };
    return { id: 'x', ok: true, status: 200, body: {} };
  });
  const onChanged = vi.fn();
  const signIn = vi.fn();
  const s = new FriendsSheet(document.body, { api: api as never, signedIn: () => opts.signedIn ?? true, signIn, onChanged, ...opts.deps }, opts.mode ?? 'add');
  return { s, calls, onChanged, signIn };
}

const q = (sel: string) => document.querySelector<HTMLElement>(sel);

describe('add-friend sheet', () => {
  it('a guest sees Sign in and nothing else', async () => {
    const t = sheet({ signedIn: false });
    await flush();
    expect(q('[data-testid="friends-sheet-guest"]')).not.toBeNull();
    expect(q('[data-testid="social-add-input"]')).toBeNull();
    q('[data-a="signin"]')!.click();
    expect(t.signIn).toHaveBeenCalledTimes(1);
    expect(t.s.closed).toBe(true);
  });

  it('is a modal dialog with the add field focused; Esc closes it', async () => {
    const t = sheet();
    await flush();
    expect(t.s.root.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(q('[data-testid="social-add-input"]'));
    t.s.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.s.closed).toBe(true);
    expect(document.querySelector('.pl-fsheet, .pl-fsheet-scrim')).toBeNull();
  });

  it('requests: names as text, Accept and Decline and Cancel call the server and tell Home', async () => {
    const t = sheet();
    await flush();
    const row = q('[data-testid="sheet-request-in"]')!;
    expect(row.querySelector('.pl-social-name')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img[src="x"], [onerror]')).toBeNull();
    expect(row.textContent).toContain('2h ago');
    q('[data-testid="sheet-accept"]')!.click();
    await flush();
    expect(t.calls.find((c) => c.op === 'friend.accept')?.args).toEqual({ code: 'PL-BBBB-BBBB' });
    expect(t.onChanged).toHaveBeenCalled();
    q('[data-testid="sheet-decline"]')!.click();
    await flush();
    expect(t.calls.find((c) => c.op === 'friend.decline')?.args).toEqual({ code: 'PL-BBBB-BBBB' });
    q('[data-testid="sheet-cancel"]')!.click();
    await flush();
    expect(t.calls.filter((c) => c.op === 'friend.decline').map((c) => c.args.code)).toContain('PL-CCCC-CCCC');
    expect(q('.pl-social-note')!.textContent).toBe('Request cancelled');
  });

  it('add by name: suggestions as you type, Add on one, Enter on the field', async () => {
    vi.useFakeTimers();
    const t = sheet();
    await flush();
    const input = q('[data-testid="social-add-input"]') as HTMLInputElement;
    input.value = 'Mi';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(320);
    await flush();
    expect(t.calls.find((c) => c.op === 'social.search')?.args).toEqual({ name: 'Mi' });
    const rows = document.querySelectorAll('[data-testid="social-suggest"]');
    expect(rows).toHaveLength(3);
    // a friend has no Add; one who asked first gets Accept
    expect(rows[1]!.querySelector('[data-a="add-name"]')).toBeNull();
    expect(rows[2]!.querySelector('[data-a="add-name"]')!.getAttribute('aria-label')).toBe('Accept Mika');
    rows[0]!.querySelector<HTMLElement>('[data-a="add-name"]')!.click();
    await flush();
    expect(t.calls.find((c) => c.op === 'friend.add')?.args).toEqual({ name: 'Mira' });
    expect(q('.pl-social-note')!.textContent).toBe('Request sent to Mira');
    const again = q('[data-testid="social-add-input"]') as HTMLInputElement;
    again.value = 'Whiskers';
    again.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(t.calls.filter((c) => c.op === 'friend.add').map((c) => c.args)).toContainEqual({ name: 'Whiskers' });
  });

  it('recent players: only addable ones, Add sends the match seat', async () => {
    const t = sheet();
    await flush();
    await flush();
    const rec = document.querySelectorAll('[data-testid="sheet-recent"]');
    expect(rec).toHaveLength(1);
    expect(rec[0]!.textContent).toContain('Teammate · Sage');
    rec[0]!.querySelector<HTMLElement>('[data-a="add-recent"]')!.click();
    await flush();
    expect(t.calls.find((c) => c.op === 'friend.add')?.args).toEqual({ room: 'r1', slot: 2 });
  });

  it('my status, my note and my name', async () => {
    const writes: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (s: string) => void writes.push(s) } });
    const t = sheet();
    await flush();
    expect(q('[data-testid="sheet-status-online"]')!.getAttribute('aria-checked')).toBe('true');
    q('[data-testid="sheet-status-away"]')!.click();
    await flush();
    expect(t.calls.find((c) => c.op === 'social.me')?.args).toEqual({ invisible: false, away: true });
    expect(q('[data-testid="sheet-status-away"]')!.getAttribute('aria-checked')).toBe('true');
    const sel = q('[data-testid="social-note"]') as HTMLSelectElement;
    sel.value = '2';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(t.calls.filter((c) => c.op === 'social.me').map((c) => c.args)).toContainEqual({ note: 2 });
    q('[data-testid="social-copy-name"]')!.click();
    await flush();
    expect(writes).toEqual(['Witty Biscuit']);
  });

  it('asks the age band once before anything else', async () => {
    const t = sheet({ st: { me: { code: 'PL-7KQ2-M9XR', name: 'Me', invisible: false, allowRecent: true, ageBand: null } } });
    await flush();
    expect(q('[data-testid="social-add-input"]')).toBeNull();
    q('[data-age="18+"]')!.click();
    await flush();
    expect(t.calls.find((c) => c.op === 'social.age')?.args).toEqual({ ageBand: '18+' });
  });
});

describe('party lobby invite list', () => {
  const friends: FriendRow[] = [
    { code: 'PL-AAAA-AAA1', name: 'Mochi', presence: { state: 'online' } },
    { code: 'PL-AAAA-AAA2', name: 'Luna', presence: { state: 'match' } },
    { code: 'PL-AAAA-AAA3', name: 'Tofu', presence: { state: 'party', party: 'MINE1234' } },
  ];
  it('shows Home rows with their +: invites the free, says why for the others', async () => {
    const invite = vi.fn();
    const t = sheet({ mode: 'invite', deps: { friends: () => friends, myParty: () => 'MINE1234', invite } });
    await flush();
    expect(t.s.root.getAttribute('aria-label')).toBe('Invite friends');
    expect(t.calls.some((c) => c.op === 'social.get')).toBe(false);
    expect(document.querySelectorAll('[data-testid="home-friend"]')).toHaveLength(3);
    q('[data-testid="home-friend-invite"]')!.click();
    expect(invite).toHaveBeenCalledTimes(1);
    expect(invite).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mochi' }));
    document.querySelectorAll<HTMLElement>('[data-testid="home-friend-noinvite"]')[0]!.click();
    expect(q('.pl-social-note')!.textContent).toBe('Tofu: Already in your party');
  });
});
