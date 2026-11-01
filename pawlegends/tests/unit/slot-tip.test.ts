import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { TRICKS } from '../../src/data/tricks';
import type { TrickId } from '../../src/sim/api';
import { HERO_TEXT, TRICK_TEXT, abilityRows, attackRows } from '../../src/ui/heroText';
import { attackTip, slotTip, tipHtml, type TipState } from '../../src/ui/slotTip';
import { desktopHover } from '../../src/ui/hud';

const KEYS = ['Q', 'W', 'E', 'R', 'D', 'B'];
const st = (o: Partial<TipState> = {}): TipState => ({ level: 1, choices: [-1, -1, -1], branch: false, cd: 0, dead: false, ...o });
const clean = (s: string): void => {
  expect(s).not.toMatch(/undefined|NaN|null|Infinity|\[object/);
};

describe('desktop skill tooltips', () => {
  it('every hero × every slot has a name, the key, a cooldown and clean numbers, at level 1 and 10 with talents', () => {
    const tricks = Object.keys(TRICKS) as TrickId[];
    for (const hero of HERO_IDS) {
      for (let slot = 0; slot < 6; slot++) {
        for (const [level, choices] of [[1, [-1, -1, -1]], [6, [0, 1, -1]], [10, [1, 0, 1]]] as const) {
          const trick = tricks[slot % tricks.length];
          const t = slotTip(hero, trick, slot, KEYS[slot], st({ level, choices }));
          expect(t.name.length, `${hero} ${slot}`).toBeGreaterThan(1);
          expect(t.key).toBe(KEYS[slot]);
          expect(t.text.length).toBeGreaterThan(5);
          if (slot < 5) expect(t.rows[0][0]).toBe('Cooldown');
          if (slot < 5) expect(t.rows[0][1]).toMatch(/^\d+(\.\d)? s$/);
          const html = tipHtml(t);
          clean(html);
          expect(html).toContain(t.name.replace(/&/g, '&amp;'));
        }
      }
    }
  });

  it('reads the names from heroText (abilities, the Paw Trick, Nap)', () => {
    expect(slotTip('clem', 'pounce', 0, 'Q', st()).name).toBe(HERO_TEXT.clem.abilities[0].name);
    expect(slotTip('pixel', 'hiss', 4, 'D', st()).name).toBe(TRICK_TEXT.hiss.name);
    expect(slotTip('pixel', 'hiss', 4, 'D', st()).kind).toBe('Paw Trick');
    expect(slotTip('sage', 'snack', 5, 'B', st()).name).toBe('Nap');
    expect(slotTip('sage', 'snack', 5, 'B', st()).rows).toEqual([['Channel', '4 s']]);
  });

  it('numbers follow the level and the talents, from the sim tables (no copies)', () => {
    const q1 = abilityRows('pixel', 0, 1);
    const q5 = abilityRows('pixel', 0, 5);
    const dmg = (rows: readonly (readonly [string, string])[]) => Number(rows.find((r) => r[0] === 'Damage')?.[1]);
    // 75 at level 1; level 5 adds 4 × 7 per level and two ranks of 18
    expect(dmg(q1)).toBe(HEROES.pixel.abilities.q.dmg);
    expect(dmg(q5)).toBe(75 + 4 * 7 + 2 * 18);
    expect(q1.find((r) => r[0] === 'Range')?.[1]).toBe('8.5 m');
    // Long Shot (tier 0, option 0) sets the range to 10 m
    expect(abilityRows('pixel', 0, 3, [0, -1, -1]).find((r) => r[0] === 'Range')?.[1]).toBe('10 m');
    // BOXBOT shield grows per level
    expect(abilityRows('pixel', 3, 4).find((r) => r[0] === 'Shield')?.[1]).toBe(String(220 + 3 * 20));
  });

  it('says why a slot cannot be cast: the ultimate before its level, a cooldown with the seconds left', () => {
    const r = slotTip('clem', 'pounce', 3, 'R', st({ level: 2 }));
    expect(r.status).toBe('Unlocks at level 4');
    expect(r.blocked).toBe(true);
    expect(r.rank).toBe('');
    const q = slotTip('clem', 'pounce', 0, 'Q', st({ level: 2, cd: 102 }));
    expect(q.status).toBe('Ready in 3.4 s');
    expect(q.rank).toBe('Rank 2 of 4');
    expect(slotTip('clem', 'pounce', 0, 'Q', st({ cd: 900 })).status).toBe('Ready in 30 s');
    expect(slotTip('clem', 'pounce', 0, 'Q', st()).status).toBe('');
    expect(tipHtml(q)).toContain('class="st no"');
  });

  it('a taken level-6 branch shows on its slot', () => {
    const b = HERO_TEXT.brutus.branch;
    if (!b) throw new Error('brutus branch');
    const t = slotTip('brutus', 'pounce', b.slot, 'W', st({ level: 6, choices: [-1, 1, -1], branch: true }));
    expect(t.name).toBe(b.name);
    expect(t.rows.some((r) => r[0] === 'Dome')).toBe(true);
  });

  it('the portrait card: the passive and the basic attack (range, damage, swings a second) for every hero', () => {
    for (const hero of HERO_IDS) {
      for (const level of [1, 10]) {
        const t = attackTip(hero, level);
        clean(tipHtml(t));
        expect(t.rows.map((r) => r[0])).toEqual(['Range', 'Damage', 'Attack speed']);
        expect(t.text).toContain(HERO_TEXT[hero].passive.name);
      }
    }
    // Sage: 6 m, 52 damage, a swing every 27 ticks (1.11 a second) at level 1
    expect(attackRows('sage', 1)).toEqual([['Range', '6 m'], ['Damage', '52'], ['Attack speed', '1.11 a second']]);
    expect(attackTip('sage', 1).kind).toMatch(/Ranged/);
    expect(attackTip('clem', 1).kind).toMatch(/Melee/);
    expect(Number(attackRows('clem', 10)[1][1])).toBe(HEROES.clem.base.attack + 9 * HEROES.clem.base.attackPerLevel);
  });

  it('only a mouse shows the card (touch and pen never do)', () => {
    expect(desktopHover({ pointerType: 'touch' })).toBe(false);
    expect(desktopHover({ pointerType: 'pen' })).toBe(false);
  });
});
