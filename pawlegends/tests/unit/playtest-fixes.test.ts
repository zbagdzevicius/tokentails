// @vitest-environment happy-dom
/**
 * Playtest fixes (render, UI and input side only; the sim is unchanged): results copy by margin and its tip, the
 * honest dare and offer lines, wheel zoom, nameplates for mirrored heroes, reachable move goals, the tower guard on
 * the Attack button's walk-in, the talent auto-pick and the store's safeguards and glossary.
 */
import { describe, expect, it } from 'vitest';
import { endsText } from '../../src/money/offer';
import { dareText } from '../../src/share/dare';
import { resultLine, resultTip } from '../../src/ui/screens';
import { clampZoom, wheelZoom, ZOOM_MAX, ZOOM_MIN } from '../../src/render/camera/zoom';
import { plateName } from '../../src/ui/overhead';
import { reachableGoal } from '../../src/input/orders';
import { attackPriority, guardedByTower, type Unit } from '../../src/input/targeting';
import { TALENT_AUTO_S, TalentPicker } from '../../src/ui/talents';
import { glossaryFor, safeguardsLine } from '../../src/ui/store';
import { createGrid, cellOf, snapCell } from '../../src/sim/map/grid';
import { tipText } from '../../src/onboarding/tips';

describe('results copy', () => {
  it('picks the defeat line by the margin (a 1–14 loss is not "so close")', () => {
    expect(resultLine({ won: false, kills: 0, teamKills: [1, 14], difficulty: 'easy' })).toMatch(/^Tough one/);
    expect(resultLine({ won: false, kills: 0, teamKills: [1, 11], difficulty: 'normal' })).toMatch(/Try Easy bots/);
    expect(resultLine({ won: false, kills: 2, teamKills: [5, 9], difficulty: 'easy' })).toMatch(/pulled ahead/);
    expect(resultLine({ won: false, kills: 2, teamKills: [7, 8], difficulty: 'easy' })).toMatch(/^So close/);
    expect(resultLine({ won: true, kills: 0, teamKills: [5, 3], difficulty: 'easy' })).toMatch(/jump into a fight/);
  });
  it('gives one concrete tip from how the player was knocked out', () => {
    expect(resultTip({ won: false, kills: 0, deaths: 3, level: 5, seconds: 500, deathsBy: { tower: 3 } })).toMatch(/Towers knocked you out 3 times/);
    expect(resultTip({ won: false, kills: 1, deaths: 6, level: 5, seconds: 500, deathsBy: { hero: 5 }, touch: true })).toMatch(/tap Nap/);
    expect(resultTip({ won: false, kills: 1, deaths: 6, level: 5, seconds: 500, deathsBy: { hero: 5 } })).toMatch(/press B to Nap/);
    expect(resultTip({ won: false, kills: 0, deaths: 1, level: 2, seconds: 526, deathsBy: { hero: 1 } })).toMatch(/levels/);
    expect(resultTip({ won: true, kills: 3, deaths: 0, level: 7, seconds: 480, deathsBy: {} })).toBeNull();
  });
});

describe('honest lines', () => {
  it('dares on the time only before Sudden Death (10:00); later it is "win my match"', () => {
    expect(dareText({ seed: 1, hero: 'clem', trick: 'pounce', difficulty: 'easy', seconds: 432 })).toBe('Beat my 7:12 vs Easy bots in Pawlegends!');
    expect(dareText({ seed: 1, hero: 'clem', trick: 'pounce', difficulty: 'normal', seconds: 620 })).toBe('Win my match vs Normal bots in Pawlegends!');
    expect(dareText({ seed: 1, hero: 'clem', trick: 'pounce', difficulty: 'normal', seconds: 0 })).toBe('Win my match vs Normal bots in Pawlegends!');
  });
  it('the starter window line says that the CARD hides and the price stays', () => {
    expect(endsText(47 * 3600e3 + 10, 0)).toBe('This card hides in 47 h. Same price in the store after that.');
    expect(endsText(5 * 60e3, 0)).toMatch(/hides in 5 min/);
    expect(endsText(null, 0)).toBe('');
  });
  it('the store names its safeguards and explains the planned extras', () => {
    expect(safeguardsLine('eur')).toBe("Prices include VAT. Under 16 can't buy. Spending limit €30 (age 16 to 17) or €200 (18+) per 30 days.");
    expect(safeguardsLine('usd')).toMatch(/\$30 .* \$200/);
    expect(glossaryFor('3-day Pride Club trial (bonus)')).toEqual(['Pride Club: a planned monthly membership, not on sale yet.']);
    expect(glossaryFor('Season 1 Legends Pass+, 1 month Pride Club')).toHaveLength(2);
    expect(glossaryFor('Season 1 Legends Pass, your name')[0]).toMatch(/^Legends Pass:/);
  });
  it('touch tips name the skill, not a key letter', () => {
    const n = { q: 'Sunrise Slash', e: 'Tumble', r: 'Golden Hour' };
    expect(tipText('q', true, n)).toBe('Enemy hero! Tap Sunrise Slash (glowing) to strike');
    expect(tipText('ult', true, n)).not.toMatch(/\bR\b/);
    expect(tipText('q', false, n)).toMatch(/Press Q/);
  });
});

describe('camera zoom', () => {
  it('a wheel step scales with the delta, so one big delta moves the whole range', () => {
    expect(wheelZoom(1, 800)).toBe(ZOOM_MAX);
    expect(wheelZoom(1, -1600)).toBe(ZOOM_MIN);
    const notch = wheelZoom(1, 100);
    expect(notch).toBeGreaterThan(1.07);
    expect(notch).toBeLessThan(1.12);
    expect(wheelZoom(1, 3, 1)).toBeCloseTo(wheelZoom(1, 99), 5);
    expect(clampZoom(Number.NaN)).toBeGreaterThan(0);
  });
});

describe('nameplates', () => {
  it('reads "You" for the player and prefixes the enemy copy of a mirrored hero with its team', () => {
    const mirrored = new Set(['sage']);
    expect(plateName({ id: 0, team: 0, hero: 'sage' }, 0, 0, mirrored)).toBe('You');
    expect(plateName({ id: 4, team: 1, hero: 'sage' }, 0, 0, mirrored)).toBe('Woof Sage');
    expect(plateName({ id: 1, team: 0, hero: 'brutus' }, 0, 0, mirrored)).toBe('Sir Brutus');
    expect(plateName({ id: 3, team: 1, hero: 'clem' }, 0, 0, mirrored)).toBe('Clem');
  });
});

describe('input: move goals and the Attack button', () => {
  it('a click deep in a wall walks to the last reachable point on the line toward the hero', () => {
    const g = createGrid();
    // find a blocked cell far from walkable ground (the sim ignores such a goal)
    let deep = -1;
    for (let c = 0; c < g.walls.length && deep < 0; c++) if (snapCell(g, c) < 0) deep = c;
    if (deep < 0) return; // no such cell on this map: nothing to fix
    const x = (deep % 100) * 1000 + 500;
    const y = Math.floor(deep / 100) * 1000 + 500;
    const hero = { x: 50000, y: 30000 };
    const goal = reachableGoal(hero.x, hero.y, x, y);
    expect(snapCell(g, cellOf(goal.x, goal.y))).toBeGreaterThanOrEqual(0);
    // a goal on open ground is kept as is
    expect(reachableGoal(hero.x, hero.y, hero.x + 3000, hero.y)).toEqual({ x: hero.x + 3000, y: hero.y });
  });
  it('the Attack button does not walk the player in to a hero under an untanked enemy tower', () => {
    const me: Unit = { id: 0, kind: 'hero', team: 0, x: 60000, y: 30000, hp: 600, maxHp: 600, state: 'idle' };
    const tower: Unit = { id: 40, kind: 'tower', team: 1, x: 66000, y: 30000, hp: 2500, maxHp: 2500, state: 'idle' };
    const foe: Unit = { id: 3, kind: 'hero', team: 1, x: 64500, y: 30000, hp: 300, maxHp: 600, state: 'idle' };
    expect(guardedByTower([me, tower, foe], foe, 0)).toBe(true);
    expect(attackPriority([me, tower, foe], me, 0, 1500)).toBeNull();
    // with an allied minion tanking the tower, the walk-in is fine
    const tank: Unit = { id: 20, kind: 'minion', team: 0, x: 63000, y: 30000, hp: 300, maxHp: 300, state: 'idle' };
    expect(guardedByTower([me, tower, foe, tank], foe, 0)).toBe(false);
    expect(attackPriority([me, tower, foe, tank], me, 0, 1500)).toBe(foe.id);
  });
});

describe('talent picker', () => {
  it('takes option 1 for the player after TALENT_AUTO_S unpaused seconds', () => {
    const root = document.createElement('div');
    const picks: [number, number][] = [];
    const t = new TalentPicker(root, 'clem', (tier, c) => picks.push([tier, c]));
    t.offer(0);
    expect(t.open).toBe(true);
    t.update(0);
    t.update(TALENT_AUTO_S - 0.5);
    expect(t.open).toBe(true);
    t.update(1);
    expect(t.open).toBe(false);
    expect(picks).toEqual([[0, 0]]);
    expect(t.auto).toEqual([0]);
    // the player's own pick is not marked auto
    t.offer(1);
    t.pick(1);
    expect(picks[1]).toEqual([1, 1]);
    expect(t.auto).toEqual([0]);
  });
});
