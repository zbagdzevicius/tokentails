// @vitest-environment happy-dom
/**
 * My avatar, one source of truth (founder Nov 19: Home's chip and the friends list showed different pictures): every
 * `social.get` / `social.me` answer that carries `me.av` updates the one copy, listeners hear it, a reload reads it
 * back, signing out forgets it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { myAvatar, observeMyAvatar, onMyAvatar, refreshMyAvatar, resetMyAvatar, setMyAvatar } from '../../src/meta/myAvatar';

const ok = (body: unknown): ApiResult => ({ id: 'x', ok: true, status: 200, body });

beforeEach(() => {
  localStorage.clear();
  resetMyAvatar();
});
afterEach(() => resetMyAvatar());

describe('my avatar', () => {
  it('Profile saving an icon (social.me) updates it and tells the listeners once', () => {
    const heard = vi.fn();
    onMyAvatar(heard);
    observeMyAvatar('social.me', ok({ me: { av: { i: 'h:nova', f: 'frame.store.goldpaw' } } }));
    expect(myAvatar()).toEqual({ i: 'h:nova', f: 'frame.store.goldpaw' });
    expect(heard).toHaveBeenCalledTimes(1);
    // the same answer again (the friends list's social.get): no second redraw
    observeMyAvatar('social.get', ok({ me: { av: { i: 'h:nova', f: 'frame.store.goldpaw' } } }));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('ignores other ops, failures and bad shapes', () => {
    observeMyAvatar('board.get', ok({ me: { av: { i: 'h:nova' } } }));
    observeMyAvatar('social.me', { id: 'x', ok: false, status: 500, body: { me: { av: { i: 'h:nova' } } } });
    observeMyAvatar('social.get', ok({ me: { av: { i: 'javascript:alert(1)' } } }));
    observeMyAvatar('social.get', ok({ me: {} }));
    expect(myAvatar()).toBeNull();
  });

  it('kept on this device (a reload draws it at once); signing out forgets it', () => {
    setMyAvatar({ i: 'h:clem' });
    resetMyAvatar();
    expect(myAvatar()).toEqual({ i: 'h:clem' });
    setMyAvatar(null);
    resetMyAvatar();
    expect(myAvatar()).toBeNull();
  });

  it('refresh reads social.get, then waits 5 minutes unless forced', async () => {
    const api = vi.fn(async () => ok({ me: { av: { i: 'h:sage' } } }));
    expect(await refreshMyAvatar(api as never, false, 1_000)).toBe(true);
    expect(await refreshMyAvatar(api as never, false, 2_000)).toBe(false);
    expect(api).toHaveBeenCalledTimes(1);
    await refreshMyAvatar(api as never, true, 3_000);
    expect(api).toHaveBeenCalledTimes(2);
    expect(myAvatar()).toEqual({ i: 'h:sage' });
  });
});
