import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../types';
import { emojiTimeline, eventBanner, formatClock, formatScore, kitchenLabel, rankFor, seenText } from './copy';
import { countUp } from './screens/Result';

describe('copy helpers', () => {
  it('formats scores, clocks and ranks', () => {
    expect(formatScore(8420)).toBe('8,420');
    expect(formatScore(1234567)).toBe('1,234,567');
    expect(formatScore(-5)).toBe('0');
    expect(formatClock(2250)).toBe('1:15');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(rankFor(0)).toBe('Nap Champion');
    expect(rankFor(1)).toBe('Mildly Naughty');
    expect(rankFor(2000)).toBe('Menace');
    expect(rankFor(14000)).toBe('Legendary Bad Cat');
    expect(eventBanner(0, 180)).toBe('DELIVERY! 6 seconds');
    expect(eventBanner(1, 20)).toBe('KETTLE! 1 second');
  });

  it('emoji timeline: one glyph per 8 s bucket, strongest event wins', () => {
    const ev: SimEvent[] = [
      { t: 'break', tick: 10, prop: 0, points: 100, combo: 1 },
      { t: 'seen', tick: 250, suspicion: 1000 },
      { t: 'target', tick: 260, prop: 1 },
      { t: 'caught', tick: 700 },
    ];
    expect(emojiTimeline(ev, 2250)).toBe('💥🎯😾🐾🐾🐾🐾🐾🐾🐾');
    expect(emojiTimeline([], 0)).toBe('🐾');
  });

  it('count-up eases to the exact target', () => {
    expect(countUp(1000, 0)).toBe(0);
    expect(countUp(1000, 1)).toBe(1000);
    expect(countUp(1000, 2)).toBe(1000);
    expect(countUp(1000, 0.5)).toBeGreaterThan(500);
  });
});

describe('round 3 copy', () => {
  it('a Perfect Crime never reads "seen"', () => {
    expect(seenText(2, 'perfect')).toBe('spotted 2×, never suspected');
    expect(seenText(0, 'perfect')).toBe('never spotted');
    expect(seenText(3, 'clean')).toBe('seen 3×');
    expect(seenText(0, 'caught')).toBe('never seen');
  });
  it('preview days do not repeat "Preview" in labels', () => {
    expect(kitchenLabel(-30)).toBe("today's Kitchen");
    expect(kitchenLabel(18)).toBe('Kitchen #18');
  });
});
