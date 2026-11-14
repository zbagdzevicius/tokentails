import { describe, expect, it } from 'vitest';
import { PROTO, PROTO_WATCH, ProtoError, SPECTATE_DELAY_MS, SPECTATE_LIMITS, parseClientJson, parseServerJson } from '../../src/net/proto';
import { rowAction } from '../../src/social/socialSheet';
import { watchFromUrl } from '../../src/share/partyLink';
import { delayText, followSlot, winnerText } from '../../src/spectate/viewer';

/* Live spectating (docs/plans/moba/SPECTATE.md): the wire frames, the entry points and the bar's pure helpers. */

describe('spectate wire (PROTO 7)', () => {
  it('is PROTO 7 with a room or featured target, never both or neither', () => {
    expect(PROTO).toBeGreaterThanOrEqual(PROTO_WATCH);
    expect(parseClientJson(JSON.stringify({ t: 'spectate', room: 'abcdef123456' }))).toEqual({ t: 'spectate', room: 'abcdef123456' });
    expect(parseClientJson(JSON.stringify({ t: 'spectate', featured: true }))).toEqual({ t: 'spectate', featured: true });
    expect(parseClientJson(JSON.stringify({ t: 'spectate.leave' }))).toEqual({ t: 'spectate.leave' });
    for (const bad of [{ t: 'spectate' }, { t: 'spectate', room: 'abcdef123456', featured: true }, { t: 'spectate', featured: false }, { t: 'spectate', room: 'ABC' }, { t: 'spectate', room: 'abcdef123456', slot: 1 }])
      expect(() => parseClientJson(JSON.stringify(bad))).toThrow(ProtoError);
  });

  it('hello may say watch:false (Let friends watch off); the server frames parse', () => {
    const h = parseClientJson(JSON.stringify({ t: 'hello', proto: PROTO, sim: 26, simHash: '0123456789abcdef', build: 'x', hint: { maxDifficulty: 'hard', newbie: false, watch: false } }));
    expect((h as { hint?: { watch?: boolean } }).hint?.watch).toBe(false);
    expect(() => parseClientJson(JSON.stringify({ t: 'hello', proto: PROTO, sim: 26, simHash: '0123456789abcdef', build: 'x', hint: { maxDifficulty: 'hard', newbie: false, watch: 'no' } }))).toThrow(ProtoError);
    expect(parseServerJson(JSON.stringify({ t: 'spectate', viewers: 3 }))).toEqual({ t: 'spectate', viewers: 3 });
  });

  it('delays grow with what a spectator could give away; caps are set', () => {
    expect(SPECTATE_DELAY_MS.coop).toBeLessThanOrEqual(SPECTATE_DELAY_MS.casual);
    expect(SPECTATE_DELAY_MS.casual).toBeLessThan(SPECTATE_DELAY_MS.ranked);
    expect(SPECTATE_LIMITS.perRoom).toBe(20);
  });
});

describe('spectate entry points', () => {
  it('a friend in a watchable match shows Watch (not while in a party)', () => {
    expect(rowAction({ state: 'match', room: 'abcdef123456' }, false)).toBe('watch');
    expect(rowAction({ state: 'match', room: 'abcdef123456' }, true)).toBe('more');
    expect(rowAction({ state: 'match' }, false)).toBe('more');
    expect(rowAction({ state: 'match', room: 'bad' }, false)).toBe('more');
  });

  it('?watch= takes a room id or featured, nothing else', () => {
    expect(watchFromUrl('?watch=abcdef123456')).toEqual({ room: 'abcdef123456', name: '' });
    expect(watchFromUrl('?watch=featured')).toEqual({ featured: true });
    expect(watchFromUrl('?watch=<script>')).toBeNull();
    expect(watchFromUrl('')).toBeNull();
  });
});

describe('spectate bar helpers', () => {
  it('follows the friend by name, else the relay pick', () => {
    const m = { names: ['Mira', null, null, 'Tom', null, null], watch: { follow: 0 } };
    expect(followSlot(m, 'Tom')).toBe(3);
    expect(followSlot(m, 'Nobody')).toBe(0);
    expect(followSlot(m)).toBe(0);
  });

  it('says the delay and the winner', () => {
    expect(delayText(15_000)).toBe('15 s behind live');
    expect(delayText(90_000)).toBe('1:30 behind live');
    expect(winnerText({ winner: 1 }, ['cat', 'dog'])).toBe('Dogs win');
    expect(winnerText({ winner: 0 }, ['cat', 'cat'])).toBe('Team Blue wins');
    expect(winnerText({ winner: -1 as never }, ['cat', 'dog'])).toBe('Draw');
  });
});
