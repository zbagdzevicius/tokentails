// @vitest-environment happy-dom
/**
 * Quick Play M1a (docs/plans/moba/M1A-IMPL.md §1, §9.3): "Play online" on the title, first in the friends row, one tap;
 * hidden in a dare and without a relay. The party lobby's leader button for a party of 1 or 2.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lobbyScreen, type LobbyScreenOpts } from '../../src/ui/lobby/lobbyScreen';
import { lobbyHtml } from '../../src/party/ui/partyLobby';
import { lastQueueSide, setLastQueueSide } from '../../src/meta/partyPrefs';
import type { PartyView } from '../../src/net/proto';

const base = (o: Partial<LobbyScreenOpts> = {}): LobbyScreenOpts => ({
  firstTime: false,
  last: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
  dare: null,
  muted: false,
  identity: { name: 'Clem', sub: 'Clem the Fighter', element: 'FIRE', role: 'Fighter', card: false },
  signedIn: false,
  difficulties: ['easy', 'normal', 'hard'],
  cardCount: 0,
  peek: [],
  onPlay: vi.fn(),
  onChoose: vi.fn(),
  onMute: vi.fn(),
  ...o,
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('Play online (M1a)', () => {
  it('shows first in the friends row with onOnline, and one tap calls it', () => {
    const onOnline = vi.fn();
    const root = lobbyScreen(document.body, base({ onOnline, onParty: vi.fn(), onJoinCode: vi.fn() }));
    const row = root.querySelector('.lb-friends-row')!;
    expect(row.firstElementChild?.getAttribute('data-testid')).toBe('play-online');
    (root.querySelector('[data-testid="play-online"]') as HTMLButtonElement).click();
    expect(onOnline).toHaveBeenCalledTimes(1);
    // Play (solo) stays the one big button
    expect(root.querySelectorAll('.pl-btn.big')).toHaveLength(1);
  });

  it('hidden without onOnline (no relay, or before the first match) and in a dare', () => {
    expect(lobbyScreen(document.body, base({ onParty: vi.fn() })).querySelector('[data-testid="play-online"]')).toBeNull();
    document.body.innerHTML = '';
    const dare = lobbyScreen(document.body, base({ onOnline: vi.fn(), dare: { hero: 'sage', trick: 'pounce', difficulty: 'easy', seed: 7, time: 300 } as never }));
    expect(dare.querySelector('[data-testid="play-online"]')).toBeNull();
  });

  it('the side default is remembered per viewer ("either" when unknown or blocked)', () => {
    expect(lastQueueSide()).toBe('any');
    setLastQueueSide('dog');
    expect(lastQueueSide()).toBe('dog');
    setLastQueueSide('any');
    expect(lastQueueSide()).toBe('any');
    localStorage.setItem('pl.party.queueSide', 'bogus');
    expect(lastQueueSide()).toBe('any');
  });

  it('the party lobby: the leader of 1 or 2 gets Play online; never 3, never a member, never without PROTO 2', () => {
    const v = (n: number, you = 'a'): PartyView => ({
      t: 'party',
      code: 'K7QX2M',
      phase: 'lobby',
      leader: 'a',
      difficulty: 'easy',
      openSeats: false,
      locked: false,
      members: ['a', 'b', 'c'].slice(0, n).map((id) => ({ id, name: id, guest: true, conn: 'on' as const })),
      you,
    });
    const has = (view: PartyView, online = true): boolean => {
      const d = document.createElement('div');
      d.innerHTML = lobbyHtml({ view, qr: '', error: null, startAnyway: false, nudged: new Set(), difficulties: ['easy'], online });
      return !!d.querySelector('[data-testid="party-queue"]');
    };
    expect(has(v(1))).toBe(true);
    expect(has(v(2))).toBe(true);
    expect(has(v(3))).toBe(false);
    expect(has(v(2, 'b'))).toBe(false);
    expect(has(v(2), false)).toBe(false);
  });
});
