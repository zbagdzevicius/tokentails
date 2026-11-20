import { describe, expect, it } from 'vitest';
import { presenceText } from '../../src/social/presence';
import { champText, LATER_MS, laterStep, playedText } from '../../src/social/socialState';

/* Social sidebar round 6 (beat LoL's friends list): the champion in a match, invite after a match, last played together. */
describe('social sidebar round 6', () => {
  it('a match names the champion (an unknown id shows nothing) and the queue', () => {
    expect(champText('sage')).toBe('Sage');
    expect(champText('not-a-hero')).toBe('');
    expect(champText(undefined)).toBe('');
    expect(champText('__proto__')).toBe('');
    const now = Date.UTC(2026, 10, 19, 12);
    expect(presenceText({ state: 'match', mode: 'classic', since: now - 8 * 60_000 }, now)).toBe('In match · 5v5 Classic · 8m');
    expect(presenceText({ state: 'match', mode: 'bots' }, now)).toBe('In match · Vs bots');
  });

  it('an invite queued for after a match waits, then goes, tells or drops', () => {
    const now = 1_000_000_000;
    expect(laterStep({ state: 'match' }, now - 1000, true, now)).toBe('wait');
    expect(laterStep({ state: 'queue' }, now - 1000, true, now)).toBe('wait');
    expect(laterStep({ state: 'online' }, now - 1000, true, now)).toBe('send');
    expect(laterStep({ state: 'party', party: 'X' }, now - 1000, true, now)).toBe('send');
    expect(laterStep({ state: 'online' }, now - 1000, false, now)).toBe('tell');
    expect(laterStep({ state: 'offline' }, now - 1000, true, now)).toBe('drop');
    expect(laterStep(undefined, now - 1000, true, now)).toBe('drop');
    expect(laterStep({ state: 'match' }, now - LATER_MS - 1, true, now)).toBe('drop');
  });

  it('last played together reads as a time and a count', () => {
    const now = Date.UTC(2026, 10, 19, 12);
    expect(playedText({ at: now - 2 * 86_400_000 - 1000, n: 4 }, now)).toBe('Played together 2d ago · 4 games');
    expect(playedText({ at: now - 3 * 3_600_000, n: 1 }, now)).toBe('Played together 3h ago');
    expect(playedText(undefined, now)).toBe('');
  });
});
