import { describe, expect, it } from 'vitest';
import { TOWER_SPOTS } from '../../src/data/map';
import { SUNSET } from '../../src/data/timeline';
import { DIFFICULTY_RULES } from '../../src/data/bots';
import { TOWERS } from '../../src/data/towers';
import { dealDamage, resolveDeaths } from '../../src/sim/combat/damage';
import { Buff, G, Kind } from '../../src/sim/world';
import { stepStructures } from '../../src/sim/units/tower';
import { coreId, putHero, putMinion, quietMatch as quietOn, towerId } from './sim-helpers';

/** Normal: no first-match help changes the human's (slot 0) damage, and cores open at once (no coreOpenAt). */
const quietMatch = (seed = 1) => quietOn(seed, false, 'normal');

const OUTER = TOWER_SPOTS[0]; // Purrhaven Sunny outer (34, 51)

/** Run the structure step until `tower` fires (a hero target waits out the lock-on first); returns the bolt's damage. */
function nextShot(m: ReturnType<typeof quietMatch>, tower: number): number {
  const w = m.world;
  for (let i = 0; i < TOWERS.lockOnTicks + TOWERS.outer.attackEvery + 1; i++) {
    w.pAlive.fill(0);
    stepStructures(m);
    for (let p = 0; p < w.pAlive.length; p++) if (w.pAlive[p] === 1 && w.pOwner[p] === tower) return w.pDmg[p];
  }
  throw new Error('no shot');
}

describe('towers (§5 tower rules, §15 item 8)', () => {
  it('targets the nearest enemy minion, then switches to a hero that hits an allied hero in range', () => {
    const m = quietMatch();
    const w = m.world;
    const t = towerId(0, 0);
    const far = putMinion(m, 1, OUTER.x + 5000, OUTER.y);
    const near = putMinion(m, 1, OUTER.x + 3000, OUTER.y);
    const enemyHero = putHero(m, 3, OUTER.x + 2000, OUTER.y - 1000);
    const ally = putHero(m, 1, OUTER.x + 1000, OUTER.y - 1000);
    stepStructures(m);
    expect(w.target[t]).toBe(near);
    expect(far).not.toBe(near);
    // The enemy hero hits our hero inside the tower's range: aggro.
    dealDamage(m, enemyHero, 1, Kind.Hero, ally, 30, 'basic');
    expect(w.target[t]).toBe(enemyHero);
    expect(w.forced[t]).toBe(1);
    stepStructures(m);
    expect(w.target[t]).toBe(enemyHero); // a forced target holds while it is in range
    // Out of range: the tower drops it and goes back to the minions.
    putHero(m, 3, OUTER.x + 20000, OUTER.y);
    stepStructures(m);
    expect(w.target[t]).toBe(near);
    expect(w.forced[t]).toBe(0);
  });
  it('a hero merely standing in range is shot only when no minion is', () => {
    const m = quietMatch();
    const t = towerId(0, 0);
    const hero = putHero(m, 3, OUTER.x + 2000, OUTER.y);
    stepStructures(m);
    expect(m.world.target[t]).toBe(hero);
    const minion = putMinion(m, 1, OUTER.x + 4000, OUTER.y);
    stepStructures(m);
    expect(m.world.target[t]).toBe(minion);
  });
  it('hero damage (sim v4): 90, +20% per consecutive hit, capped at +60%; minions take 110', () => {
    const m = quietMatch();
    const t = towerId(0, 0);
    putHero(m, 3, OUTER.x + 2000, OUTER.y);
    const shots = [0, 1, 2, 3, 4, 5].map(() => nextShot(m, t));
    expect(shots).toEqual([90, 108, 126, 144, 144, 144]);
    // Switching target resets the ramp.
    const minion = putMinion(m, 1, OUTER.x + 1000, OUTER.y);
    expect(nextShot(m, t)).toBe(TOWERS.minionDamage);
    m.world.alive[minion] = 0;
    expect(nextShot(m, t)).toBe(90);
  });
  it('a melee minion dies in 3 tower hits', () => {
    const m = quietMatch();
    const t = towerId(0, 0);
    const id = putMinion(m, 1, OUTER.x + 1000, OUTER.y);
    for (let i = 0; i < 3; i++) {
      expect(m.world.alive[id]).toBe(1);
      dealDamage(m, t, 0, Kind.Tower, id, TOWERS.minionDamage, 'tower');
      resolveDeaths(m);
    }
    expect(m.world.alive[id]).toBe(0);
  });
  it('inner towers are invulnerable until that lane outer falls; the core until one inner falls', () => {
    const m = quietMatch();
    const w = m.world;
    const outer = towerId(1, 0);
    const inner = towerId(1, 1);
    const innerOther = towerId(1, 3);
    const core = coreId(1);
    const minion = putMinion(m, 0, w.x[inner] - 1000, w.y[inner]); // no backdoor
    expect(dealDamage(m, minion, 0, Kind.Minion, inner, 100, 'basic')).toBe(0);
    expect(dealDamage(m, minion, 0, Kind.Minion, core, 100, 'basic')).toBe(0);
    stepStructures(m);
    expect(w.buffs[inner] & Buff.Invulnerable).not.toBe(0);
    expect(w.buffs[outer] & Buff.Invulnerable).toBe(0);
    // The Puddle outer falling does not open the Sunny inner.
    w.hp[towerId(1, 2)] = 0;
    resolveDeaths(m);
    expect(dealDamage(m, minion, 0, Kind.Minion, inner, 100, 'basic')).toBe(0);
    expect(dealDamage(m, minion, 0, Kind.Minion, innerOther, 100, 'basic')).toBeGreaterThan(0);
    w.hp[outer] = 0;
    resolveDeaths(m);
    expect(w.globals[G.Towers0]).toBe(2);
    expect(dealDamage(m, minion, 0, Kind.Minion, inner, 100, 'basic')).toBe(66); // 100 × 100 / 150
    expect(dealDamage(m, minion, 0, Kind.Minion, core, 100, 'basic')).toBe(0);
    w.hp[inner] = 0;
    resolveDeaths(m);
    putMinion(m, 0, w.x[core] - 1000, w.y[core]);
    expect(dealDamage(m, minion, 0, Kind.Minion, core, 100, 'basic')).toBe(66);
    // Easy (sim v4) keeps the cores shut until DifficultyRules.coreOpenAt as well.
    const easy = quietOn(1, false, 'easy');
    const ew = easy.world;
    for (const k of [0, 1, 2, 3]) ew.hp[towerId(1, k)] = 0;
    resolveDeaths(easy);
    const em = putMinion(easy, 0, ew.x[core] - 1000, ew.y[core]);
    expect(dealDamage(easy, em, 0, Kind.Minion, core, 100, 'basic')).toBe(0);
    ew.globals[G.Tick] = DIFFICULTY_RULES.easy.coreOpenAt; // 6:00, after Sunset: × 2
    expect(dealDamage(easy, em, 0, Kind.Minion, core, 100, 'basic')).toBe(132);
  });
  it('backdoor protection: heroes deal 50% less when no allied minion is within 8 m', () => {
    const m = quietMatch();
    const w = m.world;
    const outer = towerId(1, 0);
    const hero = putHero(m, 0, w.x[outer] - 2000, w.y[outer]);
    const alone = dealDamage(m, hero, 0, Kind.Hero, outer, 100, 'basic');
    expect(alone).toBe(35); // idiv(100 × 100, 140) = 71, halved
    const helper = putMinion(m, 0, w.x[outer] - 7000, w.y[outer]);
    expect(dealDamage(m, hero, 0, Kind.Hero, outer, 100, 'basic')).toBe(71);
    w.x[helper] = w.x[outer] - 9000; // just outside 8 m
    expect(dealDamage(m, hero, 0, Kind.Hero, outer, 100, 'basic')).toBe(35);
    // Minions are never backdoor-reduced.
    expect(dealDamage(m, helper, 0, Kind.Minion, outer, 100, 'basic')).toBe(71);
  });
  it('Sunset (sim v4): towers and cores take +100% damage', () => {
    const m = quietMatch();
    const w = m.world;
    const outer = towerId(1, 0);
    const minion = putMinion(m, 0, w.x[outer] - 1000, w.y[outer]);
    w.globals[G.Tick] = w.globals[G.Sunset]; // the match's own Sunset (Normal: 6:00 since sim v5)
    expect(SUNSET.structureDamageBp).toBe(20000);
    expect(dealDamage(m, minion, 0, Kind.Minion, outer, 100, 'basic')).toBe(142); // 71 × 2
  });
  it('a destroyed tower frees its nav cells and counts for the other team', () => {
    const m = quietMatch();
    const w = m.world;
    const outer = towerId(1, 0);
    const cell = Math.floor(w.y[outer] / 1000) * 100 + Math.floor(w.x[outer] / 1000);
    expect(m.grid.blocked[cell]).toBe(1);
    w.hp[outer] = 0;
    resolveDeaths(m);
    expect(m.grid.blocked[cell]).toBe(0);
    expect(w.globals[G.Towers0]).toBe(1);
    expect(m.events.some((e) => e.type === 'tower' && e.id === outer && e.destroyedBy === 0)).toBe(true);
  });
});
