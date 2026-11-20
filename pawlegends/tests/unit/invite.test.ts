// @vitest-environment happy-dom
/**
 * Invite and comeback codes in the Social sheet (share/invite.ts, backend pawlegends/growth): the state is cleaned, the
 * row shows the code, progress and a Claim button only when a coat is ready, a typed code goes to `growth.redeem`, a
 * claim to `growth.claim`, and names stay text. No price anywhere (the row shows in the apps too).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { cleanInviteCode, coatLabel, inviteError, inviteLine, inviteStateOf } from '../../src/share/invite';
import { FriendsSheet } from '../../src/social/friendsSheet';

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
  const s = new FriendsSheet(document.body, { api: api as never, signedIn: () => true, signIn: vi.fn() });
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

describe('the invite row in the add-friend sheet', () => {

  it('Share link copies the link (never the bare code); the card has no fold (its own section)', async () => {
    const writes: string[] = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void writes.push(t) } });
    const t = sheet(invite({ invited: [], accepted: null }));
    await flush();
    const row = () => document.querySelector<HTMLElement>('[data-testid="invite-row"]')!;
    expect(row().querySelector('.pl-social-name')!.textContent).toBe('Invite a friend');
    expect(row().textContent).toContain('They play 3 matches, you both get a coat');
    document.querySelector<HTMLElement>('[data-testid="invite-share"]')!.click();
    await flush();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('https://pawlegends.app/?ref=K7QX2MP');
    expect(document.querySelector('.pl-social-note')!.textContent).toBe('Invite link copied');
    expect(document.querySelector('[data-a="inv-fold"]')).toBeNull();
    t.s.dispose();
  });

  it('shows the progress (no invite code), takes the first row, and keeps names as text', async () => {
    sheet(invite());
    await flush();
    const row = document.querySelector('[data-testid="invite-row"]')!;
    expect(row).toBeTruthy();
    // founder, Nov 20: the 7-character code is not shown, copied or typed in the game
    expect(row.textContent).not.toContain('K7QX2MP');
    expect(row.textContent).not.toMatch(/invite code|enter a code/i);
    expect(row.querySelector('.pl-social-name')!.textContent).toBe('<b>Mia</b>: 1/3 matches');
    expect(document.querySelector('b b, .pl-invite-row b:not(:only-child) b')).toBeNull();
    expect(document.querySelector('[data-testid="invite-claim"]')).toBeNull();
    // its own section in the sheet (Home's panel is the friends list); Share link is the one button
    expect(row.closest('[data-g="gift"]')).not.toBeNull();
    expect(row.querySelector('[data-testid="invite-copy"]')).toBeNull();
    expect(row.querySelector('[data-testid="invite-enter"]')).toBeNull();
    expect(row.querySelector('[data-testid="invite-share"]')).toBeTruthy();
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

  it('there is no way to type a code in the game any more (the server still redeems old links on the web)', async () => {
    sheet(invite());
    await flush();
    expect(document.querySelector('[data-testid="invite-enter"]')).toBeNull();
    expect(document.querySelector('[data-testid="invite-code-form"]')).toBeNull();
  });

  it('no row when the server has no invite state (an older backend)', async () => {
    sheet({});
    await flush();
    expect(document.querySelector('[data-testid="invite-row"]')).toBeNull();
    expect(document.querySelector('[data-testid="social-add-input"]')).not.toBeNull();
  });
});
