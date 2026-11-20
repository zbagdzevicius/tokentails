// @vitest-environment happy-dom
/**
 * Home's friends panel (founder Nov 20, the "top 1" concept; ui/home/friendsRail.ts): THE friends list on Home, always
 * visible. Order online > in a queue or match > offline (most recently seen first), favourites first in their group;
 * the status line ("In match · 12:40", "3m ago"); the + invite rule (greyed with its reason in a match or queue,
 * offline, already in my party); the rank badge; header badges (requests, unread DMs); 0 friends and guest states;
 * the round Friends, Settings and Sound buttons gone from Home; names escaped. Placeholder names only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clockText, railCount, railInvite, railListHtml, railOrder, railStatus, rankBadge, RAIL_META, seenText } from '../../src/ui/home/friendsRail';
import { disposeHome, homeScreen, patchHome, setHomeFriends, type HomeScreenOpts } from '../../src/ui/home/homeScreen';
import { modeList } from '../../src/ui/modeSelect/modes';
import type { FriendRow } from '../../src/social/presence';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const f = (name: string, presence: FriendRow['presence'], extra: Partial<FriendRow> = {}): FriendRow => ({ code: `PL-${name.toUpperCase().slice(0, 4).padEnd(4, 'X')}-0000`, name, presence, ...extra });

const MIXED: FriendRow[] = [
  f('Pepper', { state: 'offline', seen: NOW - 2 * 86_400_000 }),
  f('Mochi', { state: 'online' }, { rk: 4 }),
  f('Luna', { state: 'match', since: NOW - (12 * 60 + 40) * 1000, mode: 'ranked' }, { rk: 9 }),
  f('Nori', { state: 'online', away: true }),
  f('Biscuit', { state: 'party', joinable: true, party: 'ABCD1234', size: 2, max: 3 }),
  f('Tofu', { state: 'queue', since: NOW - 3 * 60_000 }),
  f('Waffle', { state: 'online' }, { fav: true }),
  f('Ziggy', { state: 'offline', seen: NOW - 3 * 60_000 }),
  f('Kiwi', { state: 'offline' }),
];

describe('friends panel rows', () => {
  it('orders online (favourites first) > in a queue or match > offline, most recently seen first', () => {
    expect(railOrder(MIXED).map((r) => r.name)).toEqual(['Waffle', 'Biscuit', 'Mochi', 'Nori', 'Luna', 'Tofu', 'Ziggy', 'Pepper', 'Kiwi']);
  });

  it('writes the status line of the concept', () => {
    expect(railStatus({ state: 'online' }, NOW)).toBe('Online');
    expect(railStatus({ state: 'match', since: NOW - (12 * 60 + 40) * 1000 }, NOW)).toBe('In match · 12:40');
    expect(railStatus({ state: 'queue' }, NOW)).toBe('In queue');
    expect(railStatus({ state: 'party', size: 2, max: 3 }, NOW)).toBe('In lobby · 2/3');
    expect(railStatus({ state: 'online', away: true }, NOW)).toBe('Away');
    expect(railStatus({ state: 'offline', seen: NOW - 3 * 60_000 }, NOW)).toBe('3m ago');
    expect(railStatus({ state: 'offline', seen: NOW - 3_600_000 }, NOW)).toBe('1h ago');
    expect(railStatus({ state: 'offline' }, NOW)).toBe('Offline');
    expect(clockText(NOW - 3_725_000, NOW)).toBe('1:02:05');
    expect(clockText(undefined, NOW)).toBe('');
    expect(seenText(NOW - 3 * 86_400_000, NOW)).toBe('3d ago');
  });

  it('+ invites free friends; in a match, a queue, offline or already in my party it says why', () => {
    expect(railInvite({ state: 'online' })).toEqual({ ok: true });
    expect(railInvite({ state: 'online', away: true })).toEqual({ ok: true });
    expect(railInvite({ state: 'party', party: 'OTHER123' }, 'MINE1234')).toEqual({ ok: true });
    expect(railInvite({ state: 'party', party: 'MINE1234' }, 'MINE1234')).toEqual({ ok: false, why: 'Already in your party' });
    expect(railInvite({ state: 'match' })).toEqual({ ok: false, why: 'In a match' });
    expect(railInvite({ state: 'queue' })).toEqual({ ok: false, why: 'In a queue' });
    expect(railInvite({ state: 'offline' })).toEqual({ ok: false, why: 'Offline' });
    // from my own party lobby an offline friend can be invited (a notification)
    expect(railInvite({ state: 'offline' }, 'MINE1234')).toEqual({ ok: true });
  });

  it('rank badge: the tier group when placed, nothing otherwise', () => {
    expect(rankBadge(0)?.name).toBe('Kitten');
    expect(rankBadge(4)?.name).toBe('Tabby');
    expect(rankBadge(9)?.name).toBe('Lion');
    expect(rankBadge(12)?.name).toBe('Legend');
    expect(rankBadge(undefined)).toBeNull();
    expect(rankBadge(13)).toBeNull();
    expect(rankBadge('4')).toBeNull();
  });

  it('counts not-offline over all; marks offline rows; greys the + with its reason', () => {
    expect(railCount(MIXED)).toBe('6/9');
    expect(railCount(null)).toBe('');
    const html = railListHtml(MIXED, RAIL_META, NOW);
    expect(html.match(/data-testid="home-friend"/g)?.length).toBe(9);
    expect(html.match(/data-group="off"/g)?.length).toBe(3);
    expect(html.match(/data-testid="home-friend-invite"/g)?.length).toBe(4);
    expect(html).toContain('aria-label="Can&#39;t invite Luna: In a match"');
    expect(html).toContain('data-tier="lion"');
    expect(html).toContain('In match · 12:40');
  });

  it('0 friends: Add friend; loading: quiet rows; a guest: Sign in', () => {
    expect(railListHtml([], RAIL_META, NOW)).toContain('data-testid="home-friends-empty"');
    expect(railListHtml(null, RAIL_META, NOW)).toContain('fr-wait');
    expect(railListHtml(MIXED, { ...RAIL_META, guest: true }, NOW)).toContain('data-testid="home-friends-signin"');
  });

  it('escapes names', () => {
    const html = railListHtml([f('<img src=x onerror=alert(1)>', { state: 'online' })], RAIL_META, NOW);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

const base = (o: Partial<HomeScreenOpts> = {}): HomeScreenOpts => ({
  firstTime: false,
  last: { hero: 'sage', trick: 'pounce', difficulty: 'easy' },
  dare: null,
  muted: false,
  identity: { name: 'Sage', sub: 'Sage the Marksman', element: 'WIND', role: 'Marksman' },
  signedIn: true,
  difficulties: ['easy', 'normal', 'hard'],
  onPlay: vi.fn(),
  onChoose: vi.fn(),
  onMute: vi.fn(),
  onStart: vi.fn(),
  profile: { name: 'Zygis', tier: null, pct: 0, xp: null, matches: 4 },
  modes: modeList(NOW),
  modeChoice: { mode: 'skirmish', queue: 'bots' },
  onModeChoice: vi.fn(),
  base: './',
  friendsOn: true,
  ...o,
});

afterEach(() => {
  for (const el of document.querySelectorAll<HTMLElement>('.pl-home')) disposeHome(el);
  document.body.innerHTML = '';
});

describe('Home with the friends panel', () => {
  it('has no round Friends, Settings or Sound button (and no sidebar entry point)', () => {
    const root = homeScreen(document.body, base({ friends: MIXED, onSettings: vi.fn() }));
    expect(root.querySelector('.hm-corner, [data-a="settings"], [data-a="mute"], [data-a="social"], [data-testid="lobby-social"]')).toBeNull();
    expect(root.querySelectorAll('.fr-rail')).toHaveLength(1);
    expect(root.querySelectorAll('[data-testid="home-friend"]')).toHaveLength(9);
  });

  it('row opens the card, + invites, a greyed + says why, add and chat open their sheets', () => {
    const onFriendOpen = vi.fn();
    const onFriendInvite = vi.fn();
    const onAddFriend = vi.fn();
    const onFriendChat = vi.fn();
    const root = homeScreen(document.body, base({ friends: MIXED, friendsMeta: { requests: 2, unread: 3 }, onFriendOpen, onFriendInvite, onAddFriend, onFriendChat }));
    root.querySelector<HTMLElement>('[data-testid="home-friend"] .fr-main')!.click();
    expect(onFriendOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'Waffle' }));
    root.querySelector<HTMLElement>('[data-testid="home-friend-invite"]')!.click();
    expect(onFriendInvite).toHaveBeenCalledWith(expect.objectContaining({ name: 'Waffle' }));
    root.querySelector<HTMLElement>('[data-testid="home-friend-noinvite"]')!.click();
    expect(onFriendInvite).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.hm-toast')!.textContent).toBe('Luna: In a match');
    expect(root.querySelector('[data-testid="home-friends-requests"]')!.textContent).toBe('2');
    expect(root.querySelector('[data-testid="home-friends-unread"]')!.textContent).toBe('3');
    root.querySelector<HTMLElement>('[data-testid="home-friends-add"]')!.click();
    expect(onAddFriend).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLElement>('[data-testid="home-friends-chat"]')!.click();
    expect(onFriendChat).toHaveBeenCalledTimes(1);
  });

  it('greys the + of a friend already in my party', () => {
    const root = homeScreen(document.body, base({ friends: [f('Mochi', { state: 'party', party: 'MINE1234' })], friendsMeta: { myParty: 'MINE1234' } }));
    expect(root.querySelector('[data-testid="home-friend-noinvite"]')!.getAttribute('aria-label')).toBe("Can't invite Mochi: Already in your party");
  });

  it('a refresh redraws in place with new badges; no chat button without unread DMs', () => {
    const root = homeScreen(document.body, base({ friends: MIXED }));
    expect(root.querySelector('[data-testid="home-friends-chat"]')).toBeNull();
    expect(setHomeFriends(root, [...MIXED, f('Pickle', { state: 'offline' })], { unread: 1 })).toBe(true);
    expect(root.querySelectorAll('[data-testid="home-friend"]').length).toBe(10);
    expect(root.querySelector('[data-testid="home-friends-count"]')?.textContent).toBe('6/10');
    expect(root.querySelector('[data-testid="home-friends-unread"]')?.textContent).toBe('1');
  });

  it('draws the loading state, then 0 friends; a patch carries new friends', () => {
    const root = homeScreen(document.body, base({ friends: null }));
    expect(root.querySelector('.fr-wait')).toBeTruthy();
    setHomeFriends(root, []);
    expect(root.querySelector<HTMLElement>('[data-testid="home-friends-empty"]')).toBeTruthy();
    expect(patchHome(root, base({ friends: MIXED.slice(1, 3) }))).toBe(true);
    expect(root.querySelectorAll('[data-testid="home-friend"]').length).toBe(2);
  });

  it('a guest sees Sign in', () => {
    const onFriendsSignIn = vi.fn();
    const root = homeScreen(document.body, base({ friends: [], friendsMeta: { guest: true }, onFriendsSignIn }));
    expect(root.querySelector('[data-testid="home-friends-add"]')).toBeNull();
    root.querySelector<HTMLElement>('[data-testid="home-friends-signin"]')!.click();
    expect(onFriendsSignIn).toHaveBeenCalledTimes(1);
  });

  it('has no panel without a host session or on the first match', () => {
    expect(homeScreen(document.body, base({ friendsOn: false })).querySelector('.fr-rail')).toBeNull();
    expect(homeScreen(document.body, base({ firstTime: true })).querySelector('.fr-rail')).toBeNull();
    expect(setHomeFriends(document.querySelector<HTMLElement>('.pl-home'), [])).toBe(false);
  });
});
