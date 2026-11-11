/**
 * V20-CHASE.md I1 (Wild Rift edge range): the client's reach checks measure edge to edge with both bodies, exactly as
 * the sim's `inAttackRange` does (attack range + both radii, centre to centre), with the sim's chase leeway as the
 * slack. Before, the client subtracted only the target's body and was 500 mm short of the sim (200 mm with its slack).
 */
import { describe, expect, it } from 'vitest';
import { HERO_RULES } from '../../src/data/xp';
import { HERO_IDS } from '../../src/data/heroes';
import { basicRange } from '../../src/input/abilities';
import { attackPriority, CHASE_LEEWAY_MM, edgeGap, inAttackReach, inReach, lastHitTarget, type Unit } from '../../src/input/targeting';
import { autoAttackTarget } from '../../src/input/touch/assist';
import { inAttackRange } from '../../src/sim/combat/attack';
import { heroMatch, hold, place } from './heroes/kit-helpers';

const u = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 100): Unit => ({ id, kind, team, x, y, hp, maxHp: 100, state: 'idle' });

describe('V20 I1: the client reach equals the sim reach (edge to edge, both bodies)', () => {
  it('the leeway is the sim chase leeway', () => {
    expect(CHASE_LEEWAY_MM).toBe(HERO_RULES.chaseLeeway);
  });

  it('inAttackReach agrees with the sim inAttackRange + leeway within ±10 mm for every hero, hero and minion targets', () => {
    const m = heroMatch(['clem', 'clem', 'clem', 'clem', 'clem', 'clem']);
    const w = m.world;
    for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
    hold(m, 1, 2, 4, 5);
    for (const hero of HERO_IDS) {
      w.sub[0] = HERO_IDS.indexOf(hero);
      const range = basicRange(hero);
      place(m, 0, 30000, 35000, 0);
      const me = u(0, 'hero', 0, 30000, 35000);
      // walk the target out in 37 mm steps; outside ±10 mm of the boundary the two must agree
      for (let d = 500; d < range + 3000; d += 37) {
        place(m, 3, 30000 + d, 35000, 0);
        const sim = inAttackRange(w, 0, 3, HERO_RULES.chaseLeeway);
        const client = inAttackReach(u(3, 'hero', 1, 30000 + d, 35000), me, range);
        const boundary = range + 500 + 500 + HERO_RULES.chaseLeeway;
        if (Math.abs(d - boundary) > 10) expect(client, `${hero} d=${d}`).toBe(sim);
      }
    }
  });

  it('a minion target: edge gap = distance − 500 − 400', () => {
    const me = u(0, 'hero', 0, 0, 0);
    expect(edgeGap(me, u(20, 'minion', 1, 3000, 0))).toBe(2100);
    expect(inReach(me, u(20, 'minion', 1, 1600 + 900 + CHASE_LEEWAY_MM, 0), 1600)).toBe(true);
    expect(inReach(me, u(20, 'minion', 1, 1600 + 900 + CHASE_LEEWAY_MM + 20, 0), 1600)).toBe(false);
  });

  it('attackPriority, lastHitTarget and the idle auto-attack take a unit at the sim edge (they missed the last 500 mm)', () => {
    const me = u(0, 'hero', 0, 10000, 10000);
    const range = 1600;
    const edge = 10000 + range + 500 + 500 + CHASE_LEEWAY_MM - 20;
    expect(attackPriority([me, u(3, 'hero', 1, edge, 10000)], me, 0, range)).toBe(3);
    const minionEdge = 10000 + range + 500 + 400 + CHASE_LEEWAY_MM - 20;
    expect(lastHitTarget([me, u(20, 'minion', 1, minionEdge, 10000, 5)], me, 0, range)).toBe(20);
    expect(autoAttackTarget([me, u(20, 'minion', 1, minionEdge, 10000)], me, 0, range + CHASE_LEEWAY_MM)).toBe(20);
  });
});
