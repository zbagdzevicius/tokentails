// @vitest-environment happy-dom
/**
 * Invite and comeback codes in the Social sheet (share/invite.ts, backend pawlegends/growth): the state is cleaned, the
 * row shows the code, progress and a Claim button only when a coat is ready, a typed code goes to `growth.redeem`, a
 * claim to `growth.claim`, and names stay text. No price anywhere (the row shows in the apps too).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { cleanInviteCode, coatLabel, inviteError, inviteLine, inviteStateOf } from '../../src/share/invite';
import { SocialSheet } from '../../src/social/socialSheet';

afterEach(() => {
  document.body.innerHTML = '';
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const social = (n: number) => ({
  me: { code: 'PL-7KQ2-M9XR', name: 'Witty Biscuit', invisible: false, allowRecent: true, ageBand: '18+' },
  friends: Array.from({ length: n }, (_, i) => ({ code: `PL-AAAA-AAA${i}`, name: `Friend ${i}`, presence: { state: 'offline' } })),
  requests: { in: [], out: [] },
  blocks: [],
  invites: [],
  rev: 'abc',
});

const invite = (over: Record<string, unknown> = {}) => ({
  code: 'K7QX2MP',
  link: 'https://pawlegends.app/?ref=K7QX2MP',
  need: 3,
  invited: [{ name: '<b>Mia</b>', kind: 'new', matches: 1, need: 3, status: 'pending', claimable: false }],
  accepted: null,
  claimable: 0,
  nextCoat: 'coat.sage.store_silver_tabby',
  earned: 0,
  cap: 5,
  ...over,
});

function sheet(inv: Record<string, unknown>, friends = 7) {
  const calls: { op: string; args: unknown }[] = [];
  const api = vi.fn(async (op: string, args?: unknown): Promise<ApiResult> => {
    calls.push({ op, args });
    if (op === 'social.get') return { id: 'x', ok: true, status: 200, body: social(friends) };
    if (op === 'growth.invite') return { id: 'x', ok: true, status: 200, body: inv };
    if (op === 'growth.claim')
      return { id: 'x', ok: true, status: 200, body: { granted: ['coat.sage.store_silver_tabby'], state: invite({ claimable: 0 }) } };
    if (op === 'growth.redeem')
      return (args as { code?: string })?.code === 'ABCDEFG'
        ? { id: 'x', ok: true, status: 200, body: invite({ accepted: { name: 'Leo', kind: 'new', matches: 0, need: 3, status: 'pending', claimable: false } }) }
        : { id: 'x', ok: false, status: 404, body: { code: 'PAWLEGENDS_INVITE_UNKNOWN' } };
    return { id: 'x', ok: true, status: 200, body: {} };
  });
  const s = new SocialSheet(document.body, {
    api: api as never,
    signedIn: () => true,
    partyCode: () => null,
    joinParty: vi.fn(),
    signIn: vi.fn(),
    playCasual: vi.fn(),
    height: () => 375,
  });
  return { s, calls };
}

describe('invite helpers', () => {
  it('cleans the state and refuses a body that is not one', () => {
    expect(inviteStateOf({})).toBeNull();
    expect(inviteStateOf({ code: 'K7QX2M0' })).toBeNull();
    const s = inviteStateOf({ ...invite(), link: 'https://evil.example/?ref=K7QX2MP', nextCoat: '<x>' })!;
    // a link that is not Paw Legends' own is rebuilt from the code
    expect(s.link).toBe('https://pawlegends.app/?ref=K7QX2MP');
    expect(s.nextCoat).toBeNull();
    expect(cleanInviteCode('k7qx-2mp')).toBe('K7QX2MP');
    expect(cleanInviteCode('K7QX2M')).toBeNull();
    expect(coatLabel('coat.sage.store_silver_tabby')).toBe('Silver Tabby coat for Sage');
    expect(inviteError({ ok: false, status: 403, body: { code: 'PAWLEGENDS_INVITE_NOT_ELIGIBLE' } })).toMatch(/21 days/);
    expect(inviteLine(inviteStateOf(invite())!)).toBe('<b>Mia</b>: 1/3 matches');
  });
});

describe('the invite row in the Social sheet', () => {
  it('shows the code and progress, takes the first row, and keeps names as text', async () => {
    sheet(invite());
    await flush();
    const row = document.querySelector('[data-testid="invite-row"]')!;
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('K7QX2MP');
    expect(row.querySelector('.pl-social-name')!.textContent).toBe('<b>Mia</b>: 1/3 matches');
    expect(document.querySelector('b b, .pl-invite-row b:not(:only-child) b')).toBeNull();
    expect(document.querySelector('[data-testid="invite-claim"]')).toBeNull();
    // the invite row plus 4 friends: the page still has 5 rows
    expect(document.querySelectorAll('.pl-social-row')).toHaveLength(5);
    expect(document.body.textContent).not.toMatch(/[$€]\s?\d/);
  });

  it('Claim sends growth.claim and names the coat', async () => {
    const t = sheet(invite({ claimable: 1, invited: [{ name: 'Mia', kind: 'new', matches: 3, need: 3, status: 'done', claimable: true }] }));
    await flush();
    document.querySelector<HTMLElement>('[data-testid="invite-claim"]')!.click();
    await flush();
    expect(t.calls.some((c) => c.op === 'growth.claim')).toBe(true);
    expect(document.querySelector('.pl-social-note')!.textContent).toBe('New coat: Silver Tabby coat for Sage');
    expect(document.querySelector('[data-testid="invite-claim"]')).toBeNull();
    t.s.dispose();
  });

  it('a typed code goes to growth.redeem; a bad one says why', async () => {
    const t = sheet(invite());
    await flush();
    document.querySelector<HTMLElement>('[data-testid="invite-enter"]')!.click();
    await flush();
    const form = document.querySelector<HTMLFormElement>('[data-testid="invite-code-form"]')!;
    form.querySelector<HTMLInputElement>('input[name="invite"]')!.value = 'zzzz-zzz';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(t.calls.find((c) => c.op === 'growth.redeem')?.args).toEqual({ code: 'ZZZZZZZ' });
    expect(document.querySelector('.pl-social-note')!.textContent).toBe('No invite with this code');
    // friend.add is never called for the invite form
    expect(t.calls.some((c) => c.op === 'friend.add')).toBe(false);
    const again = document.querySelector<HTMLFormElement>('[data-testid="invite-code-form"]')!;
    again.querySelector<HTMLInputElement>('input[name="invite"]')!.value = 'abcdefg';
    again.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(document.querySelector('.pl-social-note')!.textContent).toMatch(/Invite accepted/);
    expect(document.querySelector('[data-testid="invite-code-form"]')).toBeNull();
    // the accepted invite is the row's line now, and the code button is gone
    expect(document.querySelector('[data-testid="invite-row"] .pl-social-name')!.textContent).toBe("Leo's invite: 0/3 matches");
    expect(document.querySelector('[data-testid="invite-enter"]')).toBeNull();
    t.s.dispose();
  });

  it('no row when the server has no invite state (an older backend)', async () => {
    sheet({});
    await flush();
    expect(document.querySelector('[data-testid="invite-row"]')).toBeNull();
    expect(document.querySelectorAll('.pl-social-row')).toHaveLength(5);
  });
});
