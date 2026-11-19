import { describe, expect, it } from 'vitest';
import { agoText, friendGroups, friendOrder, noteText, presenceText, recentMatches, rowAction, shownState, STATUS_NOTES, type FriendRow } from '../../src/social/socialSheet';

/* Social sidebar round 5 (beat LoL's friends list): Away, preset status notes, favourites, recent matches grouped. */
const f = (name: string, presence: FriendRow['presence'], extra: Partial<FriendRow> = {}): FriendRow => ({ code: `PL-${name}`, name, presence, ...extra });

describe('social sidebar round 5', () => {
  it('Away is online with a flag; a lobby, queue or match always wins', () => {
    expect(shownState({ state: 'online', away: true })).toBe('away');
    expect(shownState({ state: 'party', away: true })).toBe('party');
    expect(presenceText({ state: 'online', away: true })).toBe('Away');
    // away sorts after online and before in match
    expect(friendOrder([f('B', { state: 'online', away: true }), f('C', { state: 'match' }), f('A', { state: 'online' })]).map((x) => x.name)).toEqual(['A', 'B', 'C']);
  });

  it('favourites: their own group first, shown once', () => {
    const g = friendGroups([f('A', { state: 'online' }, { fav: true }), f('B', { state: 'online' }), f('C', { state: 'offline' }, { fav: true })]);
    expect(g.map((x) => [x.id, x.rows.map((r) => r.name)])).toEqual([
      ['fav', ['A', 'C']],
      ['online', ['B']],
      ['match', []],
      ['offline', []],
    ]);
  });

  it('status notes are presets by index (never free text)', () => {
    expect(STATUS_NOTES).toHaveLength(8);
    expect(noteText(0)).toBe('Looking for a duo');
    expect(noteText(8)).toBe('');
    expect(noteText('Free text')).toBe('');
    expect(noteText(1.5)).toBe('');
  });

  it('a closed lobby gets Ask to join; an open one Join', () => {
    expect(rowAction({ state: 'party', party: 'AB', joinable: false }, false)).toBe('ask');
    expect(rowAction({ state: 'party', party: 'AB', joinable: true }, false)).toBe('join');
  });

  it('recent players group by match with the queue, the result and when', () => {
    const now = Date.UTC(2026, 10, 19, 12);
    const rows = [
      { room: 'r2', slot: 1, name: 'A', team: 'ally', canAdd: true, at: now - 2 * 3_600_000, queue: 'casual', won: true, together: 3 },
      { room: 'r2', slot: 4, name: 'B', team: 'foe', canAdd: true, at: now - 2 * 3_600_000, queue: 'casual', won: true },
      { room: 'r1', slot: 2, name: 'C', team: 'ally', canAdd: false, at: now - 3 * 86_400_000, queue: 'ranked', won: false },
      { room: 'r0', slot: 2, name: 'D', team: 'ally', canAdd: false },
    ];
    expect(recentMatches(rows, now).map((m) => [m.title, m.rows.length])).toEqual([
      ['Casual · Victory · 2h ago', 2],
      ['Ranked · Defeat · 3d ago', 1],
      ['Match', 1],
    ]);
    expect(agoText(now - 10_000, now)).toBe('Just now');
    expect(agoText(undefined, now)).toBe('');
  });
});
