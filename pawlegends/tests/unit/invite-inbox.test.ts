// @vitest-environment happy-dom
/**
 * LoL-style invites and the fast inbox (docs/plans/moba/SOCIAL-INVITES.md): the inbox body is cleaned, the sim check
 * says who must update, the invite card counts down 60 s with Accept and Decline (Reload when this game is older),
 * names are text only, the DM toast opens the thread, and the lobby offers "Invite friends" only with a host.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIM_VERSION } from '../../src/sim/version';
import { agoWords, answerLine, buildSim, dmToast, inviteCard, inviteOf, matchNotice, parseInbox, simCheck, simLine } from '../../src/social/inviteInbox';
import { lobbyHtml } from '../../src/party/ui/partyLobby';
import { errorText } from '../../src/party/ui/copy';
import { API_ARG_KEYS, API_OPS, cleanApiArgs } from '../../src/embed/api';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const ID = '0123456789abcdef01234567';
const inv = (o: Record<string, unknown> = {}) => ({ id: ID, from: { code: 'PL-AAAA-AAAA', name: 'Mira' }, party: 'K7QX2M', ttl: 60_000, ...o });

describe('inbox parsing', () => {
  it('keeps clean invites, answers and the DM badge; drops junk', () => {
    const box = parseInbox({
      rev: 'i7',
      invites: [inv({ sim: '33.abcdef12', mode: 'ranked' }), { party: '../x', from: { name: 'Bad' } }, inv({ id: 'nope', ttl: 999_999 })],
      answers: [{ id: ID, name: 'Mira', answer: 'declined' }, { id: ID, name: 'X', answer: 'maybe' }],
      chat: { unread: 3, top: { thread: 'dAAAA', fromName: 'Mira', preview: '[q:0]', code: 'PL-AAAA-AAAA' } },
    });
    expect(box.rev).toBe('i7');
    expect(box.invites).toHaveLength(2);
    expect(box.invites[0]).toEqual({ id: ID, from: { code: 'PL-AAAA-AAAA', name: 'Mira' }, party: 'K7QX2M', mode: 'ranked', sim: '33.abcdef12', ttl: 60_000 });
    // an id that is not an ObjectId is dropped (the toast still joins by code), the ttl is capped at 60 s
    expect(box.invites[1]).toMatchObject({ id: '', ttl: 60_000 });
    expect(box.answers).toEqual([{ id: ID, name: 'Mira', answer: 'declined' }]);
    expect(box.chat).toEqual({ unread: 3, top: { thread: 'dAAAA', fromName: 'Mira', preview: '[q:0]', code: 'PL-AAAA-AAAA' } });
    expect(parseInbox(null)).toEqual({ invites: [], answers: [] });
    // a pulse invite from an older backend (no ttl, no id) still parses
    expect(inviteOf({ from: { name: 'Old' }, party: 'ABCDEF' })).toMatchObject({ id: '', ttl: 60_000 });
  });

  it('answer lines', () => {
    expect(answerLine({ id: ID, name: 'Mira', answer: 'declined' })).toBe('Mira declined your invite');
    expect(answerLine({ id: ID, name: 'Mira', answer: 'accepted' })).toBe('Mira is joining your party');
  });
});

describe('one sim build per party', () => {
  it('says who must update', () => {
    const mine = `${SIM_VERSION}.aaaa1111`;
    expect(buildSim('aaaa1111')).toBe(mine);
    expect(simCheck(undefined, mine)).toBe('ok');
    expect(simCheck(mine, mine)).toBe('ok');
    expect(simCheck(`${SIM_VERSION + 1}.bbbb2222`, mine)).toBe('me');
    expect(simCheck(`${SIM_VERSION - 1}.bbbb2222`, mine)).toBe('them');
    expect(simCheck(`${SIM_VERSION}.bbbb2222`, mine)).toBe('differ');
    expect(simCheck('garbage', mine)).toBe('ok');
    expect(simLine('me', 'Mira')).toMatch(/^Reload to update your game, then join Mira\./);
    expect(simLine('them', 'Mira')).toMatch(/Mira has an older version/);
    expect(simLine('ok', 'Mira')).toBe('');
  });

  it('the relay\'s update_required reads as a clear "update your game" line', () => {
    expect(errorText('update_required')).toMatch(/new version is out. Reload to play together/);
  });
});

describe('the invite card', () => {
  it('Accept and Decline, a countdown, the name as text, gone at 60 s', () => {
    vi.useFakeTimers();
    let t = 0;
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const onExpire = vi.fn();
    const el = inviteCard(document, inv({ from: { code: 'x', name: '<img src=x onerror=alert(1)>' } }) as never, { onAccept, onDecline, onExpire, now: () => t });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)> invites you to a party');
    expect(el.querySelector('[data-testid="invite-left"]')!.textContent).toBe('60s');
    t = 45_500;
    vi.advanceTimersByTime(500);
    expect(el.querySelector('[data-testid="invite-left"]')!.textContent).toBe('15s');
    t = 60_001;
    vi.advanceTimersByTime(500);
    expect(document.querySelector('[data-testid="invite-toast"]')).toBeNull();
    expect(onExpire).toHaveBeenCalledOnce();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('one at a time; Accept and Decline each answer once and close it', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    inviteCard(document, inv() as never, { onAccept: vi.fn(), onDecline: vi.fn() });
    const el = inviteCard(document, inv({ from: { code: 'y', name: 'Rex' } }) as never, { onAccept, onDecline });
    expect(document.querySelectorAll('[data-testid="invite-toast"]')).toHaveLength(1);
    el.querySelector<HTMLElement>('[data-testid="invite-accept"]')!.click();
    expect(onAccept).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="invite-toast"]')).toBeNull();
    const el2 = inviteCard(document, inv() as never, { onAccept, onDecline });
    el2.querySelector<HTMLElement>('[data-testid="invite-decline"]')!.click();
    expect(onDecline).toHaveBeenCalledOnce();
  });

  it('an older game: the update line and Reload instead of Accept; a friend on an older game: the line, Accept stays', () => {
    const onReload = vi.fn();
    const el = inviteCard(document, inv() as never, { sim: 'me', onAccept: vi.fn(), onDecline: vi.fn(), onReload });
    expect(el.querySelector('[data-testid="invite-update"]')!.textContent).toMatch(/^Reload to update your game, then join Mira\./);
    expect(el.querySelector('[data-testid="invite-accept"]')).toBeNull();
    el.querySelector<HTMLElement>('[data-testid="invite-reload"]')!.click();
    expect(onReload).toHaveBeenCalledOnce();
    const el2 = inviteCard(document, inv() as never, { sim: 'them', onAccept: vi.fn(), onDecline: vi.fn(), onReload });
    expect(el2.querySelector('[data-testid="invite-update"]')!.textContent).toMatch(/Mira has an older version/);
    expect(el2.querySelector('[data-testid="invite-accept"]')).not.toBeNull();
  });

  it('a Ranked duo invite names Ranked and carries the lock line', () => {
    const el = inviteCard(document, inv({ mode: 'ranked' }) as never, { locked: '3/10 matches', onAccept: vi.fn(), onDecline: vi.fn() });
    expect(el.textContent).toContain('invites you to a Ranked duo');
    expect(el.querySelector('[data-testid="invite-ranked-lock"]')!.textContent).toContain('3/10 matches');
  });
});

describe('the DM toast', () => {
  it('names the friend, shows a phrase as words, and Open opens the thread', () => {
    const onOpen = vi.fn();
    const el = dmToast(document, 'Mira', '[q:0]', onOpen);
    expect(el.textContent).toContain('Mira: ');
    expect(el.textContent).toContain('Wanna play?');
    el.querySelector<HTMLElement>('[data-testid="dm-open"]')!.click();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="dm-toast"]')).toBeNull();
  });
});

describe('the lobby and the host ops', () => {
  const view = {
    code: 'K7QX2M',
    you: 'm1',
    leader: 'm1',
    phase: 'lobby',
    difficulty: 'easy',
    openSeats: false,
    locked: false,
    members: [{ id: 'm1', name: 'Mira', guest: false, conn: 'on' }],
  } as never;
  const base = { view, qr: '', error: null, startAnyway: false, nudged: new Set<string>(), difficulties: ['easy'] };

  it('"Invite friends" shows with a host (and the party code stays shareable)', () => {
    expect(lobbyHtml({ ...base, friends: true })).toContain('data-testid="party-invite-friends"');
    expect(lobbyHtml({ ...base })).not.toContain('party-invite-friends');
    expect(lobbyHtml({ ...base, friends: true })).toContain('data-testid="party-code"');
  });

  it('the inbox and answer ops are allowlisted with flat args', () => {
    expect(API_OPS).toContain('social.inbox');
    expect(API_OPS).toContain('invite.answer');
    for (const k of ['sim', 'invite', 'answer']) expect(API_ARG_KEYS).toContain(k);
    expect(cleanApiArgs({ invite: ID, answer: 'accept', sim: '33.ab12', evil: { x: 1 } })).toEqual({ invite: ID, answer: 'accept', sim: '33.ab12' });
  });
});

describe('Nov 19: invites never vanish unseen', () => {
  const base = { id: 'a'.repeat(24), from: { code: 'PL-AAAA-AAAA', name: 'Irvidas' }, party: 'ABC123' };

  it('parses a missed or held invite and the `later` answer', () => {
    const box = parseInbox({
      rev: 'i9',
      invites: [{ ...base, ttl: 0, missed: true, age: 180_000 }, { ...base, id: 'b'.repeat(24), ttl: 0, missed: true, age: 'x', held: true }],
      answers: [{ id: 'c'.repeat(24), name: 'Mira', answer: 'later' }],
    });
    expect(box.invites[0]).toMatchObject({ missed: true, age: 180_000, ttl: 0 });
    expect(box.invites[0].held).toBeUndefined();
    expect(box.invites[1]).toMatchObject({ missed: true, age: 0, held: true });
    expect(box.answers).toEqual([{ id: 'c'.repeat(24), name: 'Mira', answer: 'later' }]);
    expect(answerLine(box.answers[0])).toBe('Mira is in a match: they see your invite when it ends');
    expect(agoWords(20_000)).toBe('a moment ago');
    expect(agoWords(180_000)).toBe('3 min ago');
  });

  it('in a party of my own the card asks to leave it, Join answers; a missed invite says how long ago', () => {
    const onAccept = vi.fn();
    const el = inviteCard(document, { ...inviteOf({ ...base, ttl: 0, missed: true, age: 120_000 })!, ttl: 60_000 }, { inParty: true, onAccept, onDecline: vi.fn() });
    expect(el.textContent).toContain('Irvidas invited you to a party 2 min ago');
    expect(el.querySelector('[data-testid="invite-leave"]')?.textContent).toBe('Leave your party and join Irvidas?');
    const join = el.querySelector<HTMLButtonElement>('[data-testid="invite-accept"]')!;
    expect(join.textContent).toBe('Join');
    expect(el.querySelector('[data-testid="invite-left"]')?.textContent).toBe('60s');
    join.click();
    expect(onAccept).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="invite-toast"]')).toBeNull();
  });

  it('in a match: a small notice that takes no input, gone after 5 s', () => {
    vi.useFakeTimers();
    try {
      const el = matchNotice(document, inviteOf({ ...base, ttl: 60_000 })!);
      expect(el.dataset.testid).toBe('invite-notice');
      expect(el.textContent).toBe('Irvidas invited you to a party. Answer after the match.');
      expect(el.querySelector('button')).toBeNull();
      vi.advanceTimersByTime(5_001);
      expect(el.isConnected).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
