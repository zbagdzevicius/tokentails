import { describe, expect, it } from 'vitest';
import { emojiCard, emojiTimeline, formatThousands } from './emoji-card';
import { fallBreak, fixtureRoom, fixtureRun } from './test-fixtures';

const play = fixtureRoom();

describe('emoji card (GDD 7.2)', () => {
  it('formats thousands without the locale', () => {
    expect(formatThousands(8420)).toBe('8,420');
    expect(formatThousands(1234567)).toBe('1,234,567');
    expect(formatThousands(999)).toBe('999');
    expect(formatThousands(0)).toBe('0');
  });

  it('builds the five-line card', () => {
    const r = fixtureRun([
      ...fallBreak(1, 300),
      { t: 'seen', tick: 800, suspicion: 30_000 },
      { t: 'loaf', tick: 1010 },
      { t: 'seen', tick: 1000, suspicion: 40_000 },
      { t: 'framed', tick: 1500, prop: 3 },
      { t: 'target', tick: 2100, prop: 0 },
    ]);
    const card = emojiCard(r, play, { shortUrl: 'tokentails.com/badcat' });
    const lines = card.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('BAD CAT DAILY #18 🍳');
    expect(lines[1]).toBe('🐾💥🐾🙀🧊🐾🤖🐾🎯🐾');
    expect(lines[2]).toBe('chaos 8,420 · ×6 combo · never spotted'); // round 3: a Perfect Crime never says "seen"
    expect(lines[3]).toBe('🟢 PERFECT CRIME · Agent of Chaos');
    expect(lines[4]).toBe('tokentails.com/badcat/d/18');
  });

  it('caught runs end on 😾 and the red stamp; FTUE is 5 buckets', () => {
    const r = fixtureRun([{ t: 'seen', tick: 1000, suspicion: 100_000 }, { t: 'caught', tick: 1100 }], {
      stamp: 'caught',
      rank: 'Mildly Naughty',
      score: 120,
      ticks: 1200,
    });
    const card = emojiCard(r, play, { shortUrl: 'https://tokentails.com/badcat/' });
    expect(emojiTimeline(r, play)).toBe('🐾🐾🐾🐾😾');
    expect(card.split('\n')[3]).toBe('🔴 CAUGHT · Mildly Naughty');
    expect(card.split('\n')[4]).toBe('tokentails.com/badcat/d/18');
  });

  it('uses the sim timeline when present, the glass link for The Glass', () => {
    const glass = fixtureRoom({ room: { ...play.room, id: 'glass', title: undefined }, dayNo: undefined });
    const card = emojiCard(fixtureRun([], { timeline: '🐾💥', stamp: 'clean' }), glass, { shortUrl: 'tokentails.com/badcat' });
    expect(card.split('\n')[0]).toBe('BAD CAT DAILY · The Glass 🍷');
    expect(card.split('\n')[1]).toBe('🐾💥');
    expect(card.split('\n')[3].startsWith('🟡 CLEAN-ISH')).toBe(true);
    expect(card.split('\n')[4]).toBe('tokentails.com/badcat/glass');
  });

  it('names the room it was played in (round 3: every room copied "Kitchen 🍳")', () => {
    const bath = fixtureRoom({ shell: { ...play.shell, name: 'Bathroom' }, dayNo: 3, room: { ...play.room, title: 'Bathroom #3' } });
    expect(emojiCard(fixtureRun([]), bath, { shortUrl: 'tokentails.com/badcat' }).split('\n')[0]).toBe('BAD CAT DAILY #3 🛁');
    const preview = fixtureRoom({ shell: { ...play.shell, name: 'Bedroom' }, dayNo: -4, room: { ...play.room, title: 'Bedroom' } });
    expect(emojiCard(fixtureRun([]), preview, { shortUrl: 'tokentails.com/badcat' }).split('\n')[0]).toBe('BAD CAT DAILY · Bedroom 🛏️');
  });
});
