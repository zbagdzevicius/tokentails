// @vitest-environment happy-dom
/**
 * The Nov 17 starters change (Clem, Sage, Bengal; Howler, Chili, Marshmallow): nothing a new player meets still points
 * at Sir Brutus, who is sold now. The dog default is Howler, the first-win coat is Howler's, and the daily hero quest
 * never asks for a champion the player cannot pick.
 */
import { describe, expect, it } from 'vitest';
import { STARTERS } from '../../src/money/catalog';
import { FIRST_WIN_UNLOCK, freshProfile, heroForSide } from '../../src/meta/profile';
import { FREE_COATS } from '../../src/render/cosmetics';
import { dailyQuests, questHero } from '../../src/meta/quests';
import type { HeroId } from '../../src/sim/api';

describe('Nov 17 starters', () => {
  it('the dog default and the first-win coat are on a starter', () => {
    expect(heroForSide(freshProfile(), 'dog')).toBe('howler');
    expect(STARTERS).toContain(heroForSide(freshProfile(), 'dog'));
    expect(STARTERS).toContain(FREE_COATS[FIRST_WIN_UNLOCK]?.hero);
  });

  it('the daily hero quest moves past a locked champion to one the player can pick', () => {
    const start = Date.UTC(2026, 10, 1);
    const day = (i: number): string => new Date(start + i * 86400000).toISOString().slice(0, 10);
    const playable = (h: HeroId): boolean => STARTERS.includes(h);
    let brutusDays = 0;
    for (let i = 0; i < 60; i++) {
      if (questHero(day(i)) === 'brutus') brutusDays++;
      const hero = questHero(day(i), playable);
      expect(STARTERS).toContain(hero);
      expect(dailyQuests(day(i), undefined, playable).filter((q) => q.hero).map((q) => q.hero)).toEqual([hero]);
      // a playable day's hero stays the round-robin one
      if (playable(questHero(day(i)))) expect(hero).toBe(questHero(day(i)));
    }
    expect(brutusDays).toBeGreaterThan(0);
  });
});
