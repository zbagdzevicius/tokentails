// @vitest-environment happy-dom
/**
 * Quick Play M1a (docs/plans/moba/M1A-IMPL.md §1, §9.3): "Play online" on the title, first in the friends row, one tap;
 * hidden in a dare and without a relay. The party lobby's leader button for a party of 1 or 2.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lobbyScreen, type LobbyScreenOpts } from '../../src/ui/lobby/lobbyScreen';
import { lobbyHtml } from '../../src/party/ui/partyLobby';
import { PVP_UNLOCK_MATCHES, lastQueueSide, setLastQueueSide } from '../../src/meta/partyPrefs';
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

  it('Co-op and PvP are two direct buttons in one online row (no mode chip): each one tap, each remembers its mode', () => {
    const onOnline = vi.fn();
    const onMode = vi.fn();
    const root = lobbyScreen(document.body, base({ onOnline, onParty: vi.fn(), onJoinCode: vi.fn(), onlineMode: { mode: 'coop', locked: false, onMode } }));
    expect(root.querySelector('[data-testid="online-mode"], [data-a="mode"]')).toBeNull();
    const row = [...root.querySelectorAll<HTMLElement>('.lb-online-row > button')].map((b) => b.dataset.testid);
    expect(row).toEqual(['play-online', 'play-pvp', 'play-friends', 'join-code']);
    (root.querySelector('[data-testid="play-pvp"]') as HTMLElement).click();
    expect(onMode).toHaveBeenLastCalledWith('pvp');
    expect(onOnline).toHaveBeenCalledTimes(1);
    (root.querySelector('[data-testid="play-online"]') as HTMLElement).click();
    expect(onMode).toHaveBeenLastCalledWith('coop');
    expect(onOnline).toHaveBeenCalledTimes(2);
  });

  it('the 5-match lock is lifted: a 0-match player\'s PvP button is open and one tap queues PvP', () => {
    expect(PVP_UNLOCK_MATCHES).toBe(0);
    const onOnline = vi.fn();
    const onMode = vi.fn();
    const played = 0;
    // the options app.ts builds for a brand-new guest
    const root = lobbyScreen(
      document.body,
      base({ onOnline, onlineMode: { mode: 'coop', locked: played < PVP_UNLOCK_MATCHES, played, needed: PVP_UNLOCK_MATCHES, onMode } }),
    );
    const pvp = root.querySelector('[data-testid="play-pvp"]') as HTMLElement;
    expect(pvp.getAttribute('aria-disabled')).toBeNull();
    expect(pvp.textContent).not.toContain('🔒');
    expect(pvp.textContent).not.toContain('/');
    pvp.click();
    expect(onMode).toHaveBeenLastCalledWith('pvp');
    expect(onOnline).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.lb-toast')?.textContent ?? '').not.toContain('unlocks');
  });

  it('if the lock is raised again: PvP before 5 matches reads "PvP 🔒 2/5", and a tap explains it instead of queueing', () => {
    const onOnline = vi.fn();
    const onMode = vi.fn();
    const root = lobbyScreen(document.body, base({ onOnline, onlineMode: { mode: 'coop', locked: true, played: 2, needed: 5, onMode } }));
    const pvp = root.querySelector('[data-testid="play-pvp"]') as HTMLElement;
    expect(pvp.getAttribute('aria-disabled')).toBe('true');
    expect(pvp.textContent).toContain('2/5');
    pvp.click();
    expect(onOnline).not.toHaveBeenCalled();
    expect(onMode).not.toHaveBeenCalled();
    expect(root.querySelector('.lb-toast')?.textContent).toContain('PvP unlocks after 5 matches');
  });

  it('if the lock is raised again: 5v5 Classic picked has no lock (it queues 5v5); back on 3v3 the lock returns', () => {
    const onOnline = vi.fn();
    const onMode = vi.fn();
    const root = lobbyScreen(
      document.body,
      base({ onOnline, onlineMode: { mode: 'coop', locked: true, played: 1, needed: 5, onMode }, matchMode: { mode: 'classic', onMode: vi.fn() } }),
    );
    const pvp = () => root.querySelector('[data-testid="play-pvp"]') as HTMLElement;
    expect(pvp().getAttribute('aria-disabled')).toBeNull();
    expect(pvp().textContent).not.toContain('1/5');
    expect(pvp().getAttribute('aria-label')).toContain('5v5 Classic');
    (root.querySelector('[data-testid="map-skirmish"]') as HTMLElement).click();
    expect(pvp().getAttribute('aria-disabled')).toBe('true');
    expect(pvp().textContent).toContain('1/5');
    (root.querySelector('[data-testid="map-classic"]') as HTMLElement).click();
    pvp().click();
    expect(onMode).toHaveBeenLastCalledWith('pvp');
    expect(onOnline).toHaveBeenCalledTimes(1);
  });

  it('no PvP sim on the backend: Co-op alone, no PvP button', () => {
    const root = lobbyScreen(document.body, base({ onOnline: vi.fn(), onParty: vi.fn() }));
    expect(root.querySelector('[data-testid="play-pvp"]')).toBeNull();
    expect(root.querySelector('[data-testid="play-online"]')?.textContent).toContain('Co-op');
  });
});
