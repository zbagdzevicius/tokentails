// @vitest-environment happy-dom
/**
 * The Profile sheet and the public name (SOCIAL-RANKED.md §2.3): the price line (free first, Yarn later, the cooldown),
 * the error lines, the confirm step before `name.set`, names through textContent, guests asked to sign in, and the
 * cached public name Home shows after a reload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { myName, refreshMyName, resetMyName, setMyName } from '../../src/meta/myName';
import { daysLeft, nameErrorText, nameProblem, priceLine, ProfileSheet, type NameInfo } from '../../src/social/profileSheet';

const NOW = Date.UTC(2026, 10, 16, 12);
const info = (o: Partial<NameInfo> = {}): NameInfo => ({ name: 'Witty Biscuit', nick: null, changes: 0, free: true, price: 0, cost: 1500, cooldownDays: 7, nextAt: null, yarn: 200, ...o });
const res = (status: number, body?: unknown): ApiResult => ({ id: 'x', ok: status >= 200 && status < 300, status, body });

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  localStorage.clear();
  resetMyName();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('profile sheet rules', () => {
  it('price line: first free, then Yarn with the balance, then the cooldown in days', () => {
    expect(priceLine(info(), NOW)).toBe('First change free');
    expect(priceLine(info({ changes: 2, free: true }), NOW)).toBe('Your next change is free');
    expect(priceLine(info({ changes: 1, free: false, price: 1500, yarn: 2340 }), NOW)).toBe('Change: 1,500 Yarn · you have 2,340 Yarn');
    expect(priceLine(info({ changes: 1, free: false, price: 1500, nextAt: NOW + 2.5 * 86_400_000 }), NOW)).toBe('Next change in 3 days');
    expect(daysLeft(NOW + 1000, NOW)).toBe(1);
  });

  it('quick check and error lines', () => {
    expect(nameProblem(' x ')).toMatch(/at least 2/);
    expect(nameProblem('a'.repeat(17))).toMatch(/at most 16/);
    expect(nameProblem('<b>')).toMatch(/letters/);
    expect(nameProblem('Žygis the 2nd')).toBeNull();
    const i = info({ changes: 1, free: false, price: 1500, yarn: 100 });
    expect(nameErrorText(res(409, { code: 'PAWLEGENDS_NAME_TAKEN' }), i, NOW)).toMatch(/taken/);
    expect(nameErrorText(res(400, { code: 'PAWLEGENDS_NAME_INVALID', message: 'Please choose a kinder name.' }), i, NOW)).toBe('Please choose a kinder name.');
    expect(nameErrorText(res(402, { code: 'PAWLEGENDS_NAME_YARN' }), i, NOW)).toBe('Not enough Yarn: you need 1,500 Yarn, you have 100 Yarn.');
    expect(nameErrorText(res(429, { code: 'PAWLEGENDS_NAME_COOLDOWN', nextAt: NOW + 86_400_000 }), i, NOW)).toMatch(/in 1 day\./);
    expect(nameErrorText(res(403, { code: 'PAWLEGENDS_NEED_ACCOUNT' }), i, NOW)).toMatch(/Sign in/);
    expect(nameErrorText(res(0), i, NOW)).toMatch(/connection/);
  });
});

function open(o: { signedIn?: boolean; set?: ApiResult; get?: NameInfo } = {}) {
  const calls: { op: string; args: unknown }[] = [];
  const onName = vi.fn();
  let cur = o.get ?? info();
  const api = vi.fn(async (op: string, args?: Record<string, unknown>): Promise<ApiResult> => {
    calls.push({ op, args });
    if (op === 'name.get') return res(200, cur);
    if (op === 'social.get') return res(200, { me: { code: 'PL-7KQ2-M9XR', name: cur.name, av: { i: 'h:sage' }, title: null } });
    if (op === 'name.set') {
      if (o.set) return o.set;
      cur = info({ name: String(args?.name), nick: String(args?.name), changes: 1, free: false, price: 1500 });
      return res(200, { ...cur, paid: 0 });
    }
    return res(200, {});
  });
  const sheet = new ProfileSheet(document.body, {
    api: api as never,
    signedIn: () => o.signedIn ?? true,
    signIn: vi.fn(),
    openSettings: vi.fn(),
    ownedItems: () => ['title.s1.rookie'],
    onName,
    suggest: () => 'Zyg',
    now: () => NOW,
  });
  return { sheet, calls, onName };
}

const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;

describe('profile sheet', () => {
  it('guests: sign in to choose a name, no calls', async () => {
    const { calls } = open({ signedIn: false });
    await flush();
    expect(q('[data-testid="profile-guest"]').textContent).toMatch(/Sign in to choose your name/);
    expect(calls).toHaveLength(0);
  });

  it('first change: suggestion prefilled, confirm step, free, then the new name and the price', async () => {
    const { calls, onName } = open();
    await flush();
    expect(q('[data-testid="profile-price"]').textContent).toBe('First change free');
    const input = q('[data-testid="profile-nick-input"]') as HTMLInputElement;
    expect(input.value).toBe('Zyg');
    input.value = '<i>Mira</i>';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    q('[data-testid="profile-nick-change"]').click();
    q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(calls.some((c) => c.op === 'name.set')).toBe(false);
    expect(q('[data-testid="profile-note"]').textContent).toMatch(/letters/);
    const again = q('[data-testid="profile-nick-input"]') as HTMLInputElement;
    again.value = 'Pawsome Zyg';
    again.dispatchEvent(new Event('input', { bubbles: true }));
    q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(q('[data-testid="profile-confirm"]').textContent).toContain('Pawsome Zyg');
    expect(q('[data-testid="profile-confirm-btn"]').textContent).toContain('Free');
    q('[data-testid="profile-confirm-btn"]').click();
    await flush();
    expect(calls.find((c) => c.op === 'name.set')?.args).toEqual({ name: 'Pawsome Zyg' });
    expect(q('[data-testid="profile-name"]').textContent).toBe('Pawsome Zyg');
    expect(q('[data-testid="profile-price"]').textContent).toContain('1,500 Yarn');
    expect(onName).toHaveBeenLastCalledWith('Pawsome Zyg');
  });

  it('a refused change shows the server reason and re-reads the price', async () => {
    const { calls } = open({ set: res(409, { code: 'PAWLEGENDS_NAME_TAKEN' }) });
    await flush();
    q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    q('[data-testid="profile-confirm-btn"]').click();
    await flush();
    expect(q('[data-testid="profile-note"]').textContent).toBe('That name is taken. Try another one.');
    expect(calls.filter((c) => c.op === 'name.get')).toHaveLength(2);
  });

  it('a paid change without the Yarn is refused before a call; the cooldown disables the field', async () => {
    const { calls } = open({ get: info({ name: 'Mira', nick: 'Mira', changes: 1, free: false, price: 1500, yarn: 100 }) });
    await flush();
    const input = q('[data-testid="profile-nick-input"]') as HTMLInputElement;
    input.value = 'Mirabel';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(q('[data-testid="profile-note"]').textContent).toMatch(/Not enough Yarn/);
    expect(calls.some((c) => c.op === 'name.set')).toBe(false);
    document.body.innerHTML = '';
    open({ get: info({ name: 'Mira', nick: 'Mira', changes: 1, free: false, price: 1500, nextAt: NOW + 86_400_000 }) });
    await flush();
    expect((q('[data-testid="profile-nick-input"]') as HTMLInputElement).disabled).toBe(true);
    expect(q('[data-testid="profile-price"]').textContent).toBe('Next change in 1 day');
  });
});

describe('public name cache', () => {
  it('kept on the device, refreshed from name.get at most once a minute, cleared on sign-out', async () => {
    expect(myName()).toBeNull();
    const api = vi.fn(async () => res(200, { name: 'Pawsome Zyg' }));
    expect(await refreshMyName(api as never, false, 1_000_000)).toBe(true);
    expect(await refreshMyName(api as never, false, 1_030_000)).toBe(false);
    expect(api).toHaveBeenCalledTimes(1);
    resetMyName();
    expect(myName()).toBe('Pawsome Zyg');
    expect(setMyName(null)).toBe(true);
    expect(localStorage.getItem('pl.myName')).toBeNull();
  });
});
