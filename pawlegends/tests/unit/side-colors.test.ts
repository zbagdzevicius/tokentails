/**
 * Sim v13 (DOGS-V13 §2, review item 13): the CATS / DOGS switch fills the active side in a neutral species colour
 * (cat rose, bone amber), never a relation hue: blue means "my team" and red "the enemy" everywhere else (palette.ts).
 */
import { describe, expect, it } from 'vitest';
import { SIDE_TAB_CSS } from '../../src/ui/screens';
import { RELATION_CSS } from '../../src/render/palette';

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const dist = (a: string, b: string): number => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

describe('side switch colours', () => {
  it('bone amber for the dogs and a rose for the cats', () => {
    expect(SIDE_TAB_CSS.dog).toBe('#e8c27a');
    expect(SIDE_TAB_CSS.cat).not.toBe(SIDE_TAB_CSS.dog);
  });
  it('neither is the ally or enemy colour, nor close to one', () => {
    for (const c of Object.values(SIDE_TAB_CSS)) {
      expect(c.toLowerCase()).not.toBe(RELATION_CSS.ally.toLowerCase());
      expect(c.toLowerCase()).not.toBe(RELATION_CSS.enemy.toLowerCase());
      expect(dist(c, RELATION_CSS.ally)).toBeGreaterThan(80);
      expect(dist(c, RELATION_CSS.enemy)).toBeGreaterThan(80);
    }
  });
});
