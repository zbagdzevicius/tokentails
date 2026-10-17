import { describe, expect, it } from 'vitest';
import { DEFAULT_CAT } from '../types';
import { approxMeasure, cameoLine, crimeCount, fitText, makeYourCatLine, mostWantedLine, plural, rapSheetStats, wantedFor } from './card-text';

describe('card text', () => {
  it('WANTED FOR line', () => {
    const s = { total: 300, framed: 9, topCrimes: [{ name: 'Vase', icon: '🏺', count: 212 }, { name: 'Cake', icon: '🎂', count: 14 }, { name: 'Mug', icon: '☕', count: 3 }] };
    expect(wantedFor(s)).toBe('WANTED FOR: 212 vases, 14 cakes, framed the Roomba 9×');
    expect(wantedFor({ ...s, framed: 0 })).toBe('WANTED FOR: 212 vases, 14 cakes, 3 mugs');
    expect(wantedFor({ total: 0, framed: 0, topCrimes: [] })).toBe('WANTED FOR: being suspiciously innocent');
    expect(crimeCount({ name: 'Wine glass', count: 12345 })).toBe('12,345 wine glasses');
    expect(plural('Wine glass', 1)).toBe('wine glass');
    expect(plural('Strawberry', 2)).toBe('strawberries');
    expect(plural('Box', 2)).toBe('boxes');
  });

  it('stats, Most Wanted and cameo lines', () => {
    expect(rapSheetStats({ streak: 12, total: 1, distinct: 1, catalog: 48 })).toBe('🔥 12-day streak · 1 crime · 1/48 on file');
    expect(mostWantedLine({ mostWanted: ['Mochi', ' ', 'Luna'] })).toBe('MOST WANTED: Mochi, Luna');
    expect(mostWantedLine({ mostWanted: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBe('MOST WANTED: a, b, c, d +2');
    expect(mostWantedLine(null)).toBeNull();
    expect(cameoLine({ name: 'Mochi' }, 'Kitchen #18', 'fridge')).toBe('Mochi is in Kitchen #18 · find her on the fridge');
    expect(cameoLine({ name: '' }, 'Kitchen #18', 'guest_star')).toBe(`${DEFAULT_CAT.name} is in Kitchen #18 · she's today's guest star`);
    expect(makeYourCatLine('https://tokentails.com/badcat/')).toBe('Make your cat: tokentails.com/badcat');
  });

  it('fitText shrinks long names and numbers, then cuts with an ellipsis', () => {
    const short = fitText(approxMeasure, 'Mochi', 600, 1, 72, 30);
    expect(short).toEqual({ px: 72, lines: ['Mochi'], cut: false });
    const long = fitText(approxMeasure, 'WANTED FOR: 1,234,567,890 wine glasses, 987,654,321 strawberries, framed the Roomba 4,294,967,295×', 900, 3, 54, 30);
    expect(long.lines.length).toBeLessThanOrEqual(3);
    for (const l of long.lines) expect(approxMeasure(l, long.px)).toBeLessThanOrEqual(900);
    const huge = fitText(approxMeasure, 'word '.repeat(200), 400, 2, 50, 30);
    expect(huge.cut).toBe(true);
    expect(huge.lines).toHaveLength(2);
    expect(huge.lines[1].endsWith('…')).toBe(true);
    for (const l of huge.lines) expect(approxMeasure(l, 30)).toBeLessThanOrEqual(400);
    const oneWord = fitText(approxMeasure, 'Supercalifragilisticexpialidocious', 200, 1, 50, 30);
    expect(approxMeasure(oneWord.lines[0], oneWord.px)).toBeLessThanOrEqual(200);
  });
});
