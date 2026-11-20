import { describe, expect, it } from 'vitest';
import { friendOrder, presenceText, rowAction, shownState, type FriendRow } from '../../src/social/presence';
import { agoText, noteText, STATUS_NOTES } from '../../src/social/socialState';

/* Social round 5 (kept after the sidebar went, Nov 20): Away, preset status notes, Ask to join. */
const f = (name: string, presence: FriendRow['presence'], extra: Partial<FriendRow> = {}): FriendRow => ({ code: `PL-${name}`, name, presence, ...extra });

describe('social sidebar round 5', () => {
  it('Away is online with a flag; a lobby, queue or match always wins', () => {
    expect(shownState({ state: 'online', away: true })).toBe('away');
    expect(shownState({ state: 'party', away: true })).toBe('party');
    expect(presenceText({ state: 'online', away: true })).toBe('Away');
    // away sorts after online and before in match
    expect(friendOrder([f('B', { state: 'online', away: true }), f('C', { state: 'match' }), f('A', { state: 'online' })]).map((x) => x.name)).toEqual(['A', 'B', 'C']);
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

  it('ago text', () => {
    const now = Date.UTC(2026, 10, 19, 12);
    expect(agoText(now - 10_000, now)).toBe('Just now');
    expect(agoText(undefined, now)).toBe('');
  });
});
