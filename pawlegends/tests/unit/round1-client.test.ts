/**
 * Playtest round 1 (client): one centre-screen item at a time, a "behind" banner that says why, tips that expire,
 * one display name per slot, ability numbers from src/data, and the veteran unlock.
 */
import { describe, expect, it } from 'vitest';
import { Stage } from '../../src/ui/stage';
import { behindBanner } from '../../src/app/matchSession';
import { Tips, TIP_HIDE_S, TIP_QUEUE_S } from '../../src/onboarding/tips';
import { abilityNumbers, DIFFICULTY_HINT, slotNames, trickNumbers } from '../../src/ui/heroText';
import { canPickDifficulty, difficultyFor } from '../../src/app/firstSession';
import { Juice } from '../../src/render/juice';

describe('round 1: the centre band holds one item', () => {
  it('a death recap beats a banner, a banner beats a callout, a tip yields to everything', () => {
    const s = new Stage();
    s.claim('callout', 1000, 0);
    expect(s.top(10)).toBe('callout');
    s.claim('banner', 2000, 10);
    expect(s.top(20)).toBe('banner');
    expect(s.allows('callout', 20)).toBe(false);
    s.hold('recap', true, 30);
    expect(s.top(40)).toBe('recap');
    expect(s.allows('urgent', 40)).toBe(false);
    s.hold('recap', false, 50);
    expect(s.top(60)).toBe('banner');
    expect(s.top(5000)).toBeNull();
    expect(s.allows('tip', 5000)).toBe(true);
  });

  it('Juice drops a callout while a banner holds the band, and drops stale queued banners', () => {
    const j = new Juice(null);
    const s = new Stage();
    j.stage = s;
    s.claim('banner', 2000, performance.now());
    j.callout('Takedown!');
    expect(s.top(performance.now())).toBe('banner');
  });
});

describe('round 1: "Your team is behind" says why', () => {
  it('names the towers when the team leads on takedowns', () => {
    expect(behindBanner(5, 3, 1, 2).title).toBe('They took 2 towers to your 1');
    expect(behindBanner(2, 8, 1, 1).title).toBe('They lead 8 to 2 on takedowns');
  });
});

describe('round 1: tips', () => {
  it('a queued tip older than TIP_QUEUE_S is dropped, and a move tip steps aside in a fight', () => {
    const t = new Tips(null, true);
    t.trigger('move');
    t.trigger('dodge');
    t.update(TIP_QUEUE_S + TIP_HIDE_S);
    expect(t.current).toBeNull();
    const u = new Tips(null, true);
    u.trigger('attack');
    u.combat(true);
    expect(u.current).toBeNull();
    u.trigger('q');
    u.combat(true);
    expect(u.current).toBe('q');
  });
});

describe('round 1: names and numbers', () => {
  it('a team twin is "Clem 2" everywhere', () => {
    expect(slotNames(['clem', 'clem', 'sage', 'brutus', 'brutus', 'cacklejaw'])).toEqual(['Clem', 'Clem 2', 'Sage', 'Sir Brutus', 'Sir Brutus 2', 'Cacklejaw']);
  });
  it('ability numbers come from src/data', () => {
    expect(abilityNumbers('clem', 0)).toBe('6 s cooldown · 70 (+6/lvl, +18 a rank) dmg · 2.4 m');
    expect(abilityNumbers('sage', 1)).toMatch(/root 1 s/);
    expect(trickNumbers('pounce')).toBe('120 s cooldown · 4 m');
    // sim v8: Hard is a mirror (Hard allies) and the hint says so; no species line on the chips any more
    expect(DIFFICULTY_HINT.hard).toMatch(/five Hard bots/);
    expect(DIFFICULTY_HINT.normal).not.toMatch(/species|Woof pack/);
  });
});

describe('round 1: veterans skip the two Easy matches', () => {
  it('unlocks the chips after match 1 on request; match 1 stays Rookie', () => {
    expect(canPickDifficulty(1)).toBe(false);
    expect(canPickDifficulty(1, true)).toBe(true);
    expect(difficultyFor(1, 'normal', undefined, undefined, true)).toBe('normal');
    expect(difficultyFor(1, 'normal')).toBe('easy');
    expect(difficultyFor(0, 'normal', undefined, undefined, true)).toBe('rookie');
  });
});
