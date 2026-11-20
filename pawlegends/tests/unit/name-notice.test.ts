// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { myNameNotice, refreshMyName, resetMyName, seenMyNameNotice } from '../../src/meta/myName';
import { nameNoticeCard } from '../../src/social/inviteInbox';
import { checkLine, noticeOf, noticeText } from '../../src/ui/profile/name';

/* Founder, Nov 20: the nickname is the unique username. An assigned name is told once; the live check's line. */

const ok = (body: unknown): ApiResult => ({ id: 'x', ok: true, status: 200, body });

afterEach(() => {
  resetMyName();
  document.body.innerHTML = '';
});

describe('assigned-name notice', () => {
  it('parses only the known kinds and a short old name', () => {
    expect(noticeOf({ notice: { kind: 'taken', from: 'Scout' } })).toEqual({ kind: 'taken', from: 'Scout' });
    expect(noticeOf({ notice: { kind: 'reset' } })).toEqual({ kind: 'reset' });
    expect(noticeOf({ notice: { kind: 'taken', from: 'x'.repeat(41) } })).toEqual({ kind: 'taken' });
    expect(noticeOf({ notice: { kind: 'other' } })).toBeNull();
    expect(noticeOf({ notice: null })).toBeNull();
    expect(noticeOf(undefined)).toBeNull();
  });

  it('says why the name changed and that the next pick is free', () => {
    expect(noticeText({ kind: 'taken', from: 'Scout' }, 'Scout2')).toBe('"Scout" was already taken, so you are Scout2 now. Pick your own name: your next change is free.');
    expect(noticeText({ kind: 'invalid', from: 'Mr. Whiskers!' }, 'Plucky Shadow')).toMatch(/^"Mr\. Whiskers!" can't be a player name, so you are Plucky Shadow now/);
    expect(noticeText({ kind: 'reset' }, 'Sunny Tabby')).toMatch(/moderator reset your name/);
  });

  it('name.get keeps the notice; seen tells the server once and forgets it', async () => {
    const api = vi.fn(async (op: string): Promise<ApiResult> => (op === 'name.get' ? ok({ name: 'Scout2', notice: { kind: 'taken', from: 'Scout' } }) : ok({ ok: true })));
    await refreshMyName(api as never, true);
    expect(myNameNotice()).toEqual({ kind: 'taken', from: 'Scout' });
    seenMyNameNotice(api as never);
    seenMyNameNotice(api as never);
    expect(api.mock.calls.filter((c) => c[0] === 'name.seen')).toHaveLength(1);
    expect(myNameNotice()).toBeNull();
  });

  it('the card offers Choose a name and Keep it, and goes away on either', () => {
    const choose = vi.fn();
    const keep = vi.fn();
    nameNoticeCard(document, noticeText({ kind: 'taken', from: 'Scout' }, 'Scout2'), choose, keep);
    expect(document.querySelector('[data-testid="name-notice"]')!.textContent).toContain('Scout2');
    document.querySelector<HTMLElement>('[data-testid="name-notice-choose"]')!.click();
    expect(choose).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="name-notice"]')).toBeNull();
    nameNoticeCard(document, 'x', choose, keep);
    document.querySelector<HTMLElement>('[data-testid="name-notice-keep"]')!.click();
    expect(keep).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="name-notice"]')).toBeNull();
  });
});

describe('live name check line', () => {
  it('available, taken, mine and a rule message', () => {
    expect(checkLine({ name: 'Mira', available: true })).toEqual(['Mira is available', true]);
    expect(checkLine({ name: 'Mira', available: false, reason: 'taken' })).toEqual(['That name is taken. Try another one.', false]);
    expect(checkLine({ name: 'Mira', available: true, mine: true })).toEqual(['That is already your name.', false]);
    expect(checkLine({ name: 'x', available: false, reason: 'NAME_TOO_SHORT', message: 'Use at least 2 characters.' })).toEqual(['Use at least 2 characters.', false]);
  });
});
