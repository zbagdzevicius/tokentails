import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countryLeaderboard } from '../data/countries';
import { BADGE_ROW_MIN_WIDTH, boardKey, boardSummary, chipLabel, countryLabel, isTied, rankLabel } from './board';

describe('countries leaderboard helpers', () => {
  const board = countryLeaderboard([
    { country: 'LT', cats: 25 },
    { country: 'LT', cats: 5 },
    { country: 'US', cats: 12 },
    { country: 'DE', cats: 1 },
    { country: null, cats: 5 },
  ]);

  it('labels the podium with medals, then ranks; a shared place is "=N", not a row of medals', () => {
    expect([1, 2, 3, 4, 12].map((r) => rankLabel(r))).toEqual(['🥇', '🥈', '🥉', '#4', '#12']);
    expect(rankLabel(3, true)).toBe('=3');
    const tied = countryLeaderboard([
      { country: 'LT', cats: 9 },
      { country: 'CA', cats: 7 },
      { country: 'DE', cats: 7 },
      { country: 'US', cats: 2 },
    ]).rows;
    expect(tied.map((r, i) => rankLabel(r.rank, isTied(tied, i)))).toEqual(['🥇', '=2', '=2', '#4']);
  });

  it('summarises countries and flagged cats', () => {
    expect(boardSummary(board)).toBe('43 cats from 3 countries (rave buyers)');
    expect(boardSummary(countryLeaderboard([{ country: 'JP', cats: 1 }]))).toBe('1 cat from 1 country (rave buyers)');
    expect(boardSummary(null)).toBe('No flags on the floor yet.');
    expect(boardSummary({ ...board, demo: true })).toBe('DEMO · 43 cats from 3 countries (rave buyers)');
    expect(boardKey({ ...board, demo: true })).not.toBe(boardKey(board));
    expect(boardSummary(countryLeaderboard([{ country: null, cats: 3 }]))).toBe('No flags on the floor yet.');
    expect(chipLabel(board)).toBe('3 countries');
    expect(chipLabel(null)).toBe('Countries');
  });

  it('boardKey changes only when the shown board changes', () => {
    const same = countryLeaderboard([
      { country: 'US', cats: 12 },
      { country: 'LT', cats: 30 },
      { country: 'DE', cats: 1 },
      { country: 'XX', cats: 5 },
    ]);
    expect(boardKey(same)).toBe(boardKey(board));
    expect(boardKey(countryLeaderboard([{ country: 'LT', cats: 31 }]))).not.toBe(boardKey(board));
    expect(boardKey(null)).toBe('');
  });

  it('card country label: flag and English name, empty for unknown', () => {
    expect(countryLabel('LT')).toBe('🇱🇹 Lithuania');
    expect(countryLabel('us')).toBe('🇺🇸 United States');
    expect(countryLabel(null)).toBe('');
    expect(countryLabel('XX')).toBe('');
  });
});

describe('Arc badge layout', () => {
  it('the CSS breakpoints match BADGE_ROW_MIN_WIDTH (bottom-right corner, pill below)', () => {
    const css = readFileSync(new URL('../arc/arc.css', import.meta.url), 'utf8');
    expect(css).toContain(`@media (min-width: ${BADGE_ROW_MIN_WIDTH}px)`);
    expect(css).toContain(`@media (max-width: ${BADGE_ROW_MIN_WIDTH - 1}px)`);
    // The old column-under-the-tools layout (over the right moon-ring ad slot) is gone, and the wide
    // badge is pinned to the bottom corner, out of the top band with the moon-ring slots.
    expect(css).not.toContain('@media (max-width: 759px)');
    expect(css).toMatch(/\.rv-arc-badge\s*\{[^}]*position:\s*fixed;[^}]*bottom:/);
  });
});
