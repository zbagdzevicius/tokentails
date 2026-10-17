import { describe, expect, it } from 'vitest';
import { BRUSH_REVEAL_MM, BUSHES, mirrorX } from '../../src/data/map';
import { Op } from '../../src/sim/api';
import { dealDamage } from '../../src/sim/combat/damage';
import { reveal } from '../../src/sim/effects';
import { snapshot, step } from '../../src/sim/index';
import { bushAt, refreshVision, visibleTo } from '../../src/sim/map/brush';
import { applyOrder } from '../../src/sim/units/hero';
import { targetable } from '../../src/sim/units/kinds';
import { stepStructures } from '../../src/sim/units/tower';
import { Kind } from '../../src/sim/world';
import { heroMatch, hold, place, steps } from './heroes/kit-helpers';
import { putMinion, towerId } from './sim-helpers';

const BUSH = BUSHES[0]; // Purrhaven Sunny-side bush (40, 44), 3 × 6 m
const HIDER = 3; // Woof hero
const SEER = 1; // Purrhaven hero

function bushMatch() {
  const m = heroMatch(['clem', 'sage', 'brutus', 'cacklejaw', 'clem', 'sage']);
  for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 1000, 5000 + (id % 3) * 2000, 0);
  place(m, HIDER, BUSH.x, BUSH.y, 0);
  hold(m, 0, 1, 2, 3, 4, 5);
  return m;
}

const inSnap = (m: ReturnType<typeof bushMatch>, team: 0 | 1, id: number): boolean => snapshot(m, team).entities.some((e) => e.id === id);

describe('brush (§7.3, §15 item 9)', () => {
  it('four bushes, mirrored', () => {
    expect(bushAt(BUSH.x, BUSH.y)).toBe(0);
    expect(bushAt(mirrorX(BUSH.x), BUSH.y)).toBe(BUSHES.length);
    expect(bushAt(BUSH.x + BUSH.w, BUSH.y)).toBe(-1);
    expect(bushAt(BUSHES[1].x, BUSHES[1].y)).toBe(1);
  });

  it('a unit in a bush is absent from the other team’s snapshot, present in its own', () => {
    const m = bushMatch();
    step(m);
    expect(inSnap(m, 0, HIDER)).toBe(false);
    expect(inSnap(m, 1, HIDER)).toBe(true);
    const own = snapshot(m, 1).entities.find((e) => e.id === HIDER)!;
    expect(own.buffs & (1 << 9)).not.toBe(0); // InBrush
  });

  it('visible when an enemy is within 2 m', () => {
    const m = bushMatch();
    place(m, SEER, BUSH.x - BRUSH_REVEAL_MM - 1000, BUSH.y, 0);
    expect(inSnap(m, 0, HIDER)).toBe(false);
    place(m, SEER, BUSH.x - BRUSH_REVEAL_MM, BUSH.y, 0);
    expect(inSnap(m, 0, HIDER)).toBe(true);
  });

  it('visible when an enemy stands in the same bush, even more than 2 m away', () => {
    const m = bushMatch();
    place(m, HIDER, BUSH.x, BUSH.y - 2500, 0);
    place(m, SEER, BUSH.x, BUSH.y + 2500, 0);
    expect(visibleTo(m.world, HIDER, 0)).toBe(true);
    expect(visibleTo(m.world, SEER, 1)).toBe(true);
    // A different bush does not count.
    place(m, SEER, BUSHES[1].x, BUSHES[1].y, 0);
    expect(visibleTo(m.world, HIDER, 0)).toBe(false);
  });

  it('a minion in a bush is hidden too; a revealed (marked) unit shows through the bush', () => {
    const m = bushMatch();
    const minion = putMinion(m, 1, BUSH.x, BUSH.y + 2000);
    refreshVision(m.world);
    expect(inSnap(m, 0, minion)).toBe(false);
    reveal(m.world, HIDER, 30);
    refreshVision(m.world);
    expect(inSnap(m, 0, HIDER)).toBe(true);
  });

  it('nothing targets an absent unit: auto-attacks, attack orders, towers, minions', () => {
    const m = bushMatch();
    const w = m.world;
    // Sage (range 6 m) idles 4 m from the bush: the hidden hero is in range but absent.
    place(m, SEER, BUSH.x - 4000, BUSH.y, 0);
    w.attackTimer[SEER] = 0;
    expect(targetable(w, HIDER, 0)).toBe(false);
    steps(m, 40);
    expect(w.hp[HIDER]).toBe(w.maxHp[HIDER]);
    // An explicit attack order on it is refused.
    applyOrder(m, SEER, { op: Op.Attack, id: HIDER });
    expect(w.target[SEER]).not.toBe(HIDER);
    // A minion of the viewing team walking past does not acquire it (but reveals it once within 2 m).
    const minion = putMinion(m, 0, BUSH.x - 5000, BUSH.y);
    steps(m, 1);
    expect(w.target[minion]).not.toBe(HIDER);
    // Once seen, it is fair game.
    place(m, SEER, BUSH.x - 1500, BUSH.y, 0);
    expect(targetable(w, HIDER, 0)).toBe(true);
  });

  it('a tower ignores a hidden hero in range', () => {
    const m = bushMatch();
    const w = m.world;
    // A Purrhaven tower moved next to the bush (test-only geometry): the hidden Woof hero is in its range.
    const purrTower = towerId(0, 0);
    expect(w.kind[purrTower]).toBe(Kind.Tower);
    w.x[purrTower] = BUSH.x - 5000;
    w.y[purrTower] = BUSH.y;
    stepStructures(m);
    expect(w.target[purrTower]).not.toBe(HIDER);
  });

  it('events from a hidden unit reach the other team anonymised; its casts not at all', () => {
    const m = bushMatch();
    place(m, SEER, BUSH.x - 4000, BUSH.y, 0);
    step(m);
    dealDamage(m, HIDER, 1, Kind.Hero, SEER, 10, 'basic');
    m.events.push({ type: 'cast', tick: 0, src: HIDER, slot: 0, x: 0, y: 0, target: -1 });
    const theirs = snapshot(m, 0).events;
    const hit = theirs.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' ? hit.src : 0).toBe(-1);
    expect(theirs.some((e) => e.type === 'cast')).toBe(false);
    expect(snapshot(m, 1).events.some((e) => e.type === 'cast')).toBe(true);
  });
});
