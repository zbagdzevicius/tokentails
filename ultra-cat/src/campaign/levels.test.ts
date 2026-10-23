import { describe, expect, it } from 'vitest';
import { ENEMY_IDS, LEVEL_ORDER } from '../core/types';
import { LEVELS, POC_HELI, POC_WANTED } from './levels';
import { BASE, DOCKS, DOWNTOWN, NEON, SUBURBIA, themeExtras } from './themes';

// Pool capacities (core/state.ts CAPS; state.ts imports three, so the numbers are mirrored here).
const CAPS = { cars: 90, people: 420, fish: 4 };

describe('level config sanity', () => {
  it('has the 5 cities, unique ids, indices 0..4 in campaign order', () => {
    expect(LEVELS).toHaveLength(5);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(5);
    expect([...LEVELS].sort((a, b) => a.index - b.index).map((l) => l.id)).toEqual([...LEVEL_ORDER]);
    expect(LEVELS.map((l) => l.index).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  for (const l of LEVELS) {
    describe(l.id, () => {
      it('respects the pool caps and grid limit', () => {
        expect(l.fishTrucks).toBeGreaterThanOrEqual(0);
        expect(l.fishTrucks).toBeLessThanOrEqual(CAPS.fish);
        expect(l.cars).toBeLessThanOrEqual(CAPS.cars);
        expect(l.people).toBeLessThanOrEqual(CAPS.people);
        expect(l.world.n).toBeLessThanOrEqual(11);
        expect(l.world.n).toBeGreaterThanOrEqual(5);
        expect(l.world.street).toBeLessThan(l.world.block);
      });
      it('has exactly 3 objectives with positive targets and labels', () => {
        expect(l.objectives).toHaveLength(3);
        for (const o of l.objectives) {
          expect(o.target).toBeGreaterThan(0);
          expect(o.label.length).toBeGreaterThan(3);
        }
      });
      it('kill objectives name an enemy that appears in this level', () => {
        const present = new Set([...l.enemies.map((e) => e.type), ...(l.boss ? [l.boss.type] : [])]);
        for (const o of l.objectives) if (o.kind === 'kills' && o.enemy) expect(present.has(o.enemy)).toBe(true);
      });
      it('a boss level has a boss objective or a kill objective for the boss', () => {
        if (!l.boss) return;
        const ok = l.objectives.some((o) => o.kind === 'boss' || (o.kind === 'kills' && o.enemy === l.boss!.type));
        expect(ok).toBe(true);
        expect(l.boss.at).toBeGreaterThan(0);
        expect(l.boss.at).toBeLessThan(l.duration - l.frenzyAt);
      });
      it('only uses known enemy ids, and specs are sane', () => {
        for (const e of l.enemies) {
          expect(ENEMY_IDS).toContain(e.type);
          expect(e.minEvery).toBeGreaterThan(0);
          expect(e.every).toBeGreaterThanOrEqual(e.minEvery);
          expect(e.delay).toBeGreaterThanOrEqual(0);
          expect(e.max).toBeGreaterThanOrEqual(1);
          expect(e.maxRamp).toBeGreaterThanOrEqual(0);
        }
        expect(new Set(l.enemies.map((e) => e.type)).size).toBe(l.enemies.length);
      });
      it('timing: frenzy before the end, wanted landmarks inside the round', () => {
        expect(l.frenzyAt).toBeGreaterThan(0);
        expect(l.frenzyAt).toBeLessThan(l.duration);
        expect(l.wanted.first).toBeLessThan(l.duration);
        expect(l.wanted.every).toBeGreaterThan(0);
        expect(l.valueMul).toBeGreaterThan(0);
        expect(l.catnipBase).toBeGreaterThan(0);
      });
      it('unlockStars is reachable: <= 3 x index', () => {
        expect(l.unlockStars).toBeLessThanOrEqual(3 * l.index);
      });
    });
  }

  it('unlockStars never decreases along the campaign, and the first city needs nothing', () => {
    const sorted = [...LEVELS].sort((a, b) => a.index - b.index);
    expect(sorted[0].unlockStars).toBe(0);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].unlockStars).toBeGreaterThanOrEqual(sorted[i - 1].unlockStars);
  });

  it('damage stars escalate city by city', () => {
    const dmg = [...LEVELS].sort((a, b) => a.index - b.index).map((l) => l.objectives.find((o) => o.kind === 'damage')!.target);
    for (let i = 1; i < dmg.length; i++) expect(dmg[i]).toBeGreaterThan(dmg[i - 1]);
  });

  it('every city has its own seed, layout and theme', () => {
    expect(new Set(LEVELS.map((l) => l.world.seed)).size).toBe(5);
    expect(new Set(LEVELS.map((l) => l.world.layout)).size).toBe(5);
    expect(new Set(LEVELS.map((l) => l.world.theme)).size).toBe(5);
  });

  it('only the first city runs the tutorial', () => {
    expect(LEVELS.filter((l) => l.tutorial).map((l) => l.id)).toEqual(['meowhattan']);
  });
});

describe('Meowhattan stays the POC', () => {
  const m = LEVELS.find((l) => l.id === 'meowhattan')!;
  it('world, helicopter spawner and wanted timings', () => {
    expect(m.world.seed).toBe(7);
    expect(m.world.n).toBe(9);
    expect(m.world.layout).toBe('downtown');
    expect(m.world.theme).toBe(DOWNTOWN);
    expect(m.enemies).toEqual([{ type: 'heli', delay: 12, every: 9, minEvery: 3, everyRamp: 1, max: 1, maxRamp: 15 }]);
    expect(m.enemies[0]).toBe(POC_HELI);
    expect(m.wanted).toEqual({ first: 5, every: 20, bonus: 50, timeBonus: 2, minHeight: 28 });
    expect(m.wanted).toBe(POC_WANTED);
    expect(m.duration).toBe(90);
    expect(m.valueMul).toBe(1);
  });
  it('has no shader extras (the POC look)', () => {
    expect(themeExtras(DOWNTOWN).emit).toBe(0);
    expect(themeExtras(DOWNTOWN).glow2).toBe(DOWNTOWN.windowGlow);
  });
});

describe('themes', () => {
  const all = [DOWNTOWN, DOCKS, SUBURBIA, NEON, BASE];
  it('are distinct skies with sensible fog and colours', () => {
    expect(new Set(all.map((t) => t.sky)).size).toBe(5);
    for (const t of all) {
      expect(t.fogNear).toBeLessThan(t.fogFar);
      expect(t.windowLit).toBeGreaterThanOrEqual(0);
      expect(t.windowLit).toBeLessThanOrEqual(1);
      expect(t.taxiShare).toBeGreaterThanOrEqual(0);
      expect(t.taxiShare).toBeLessThanOrEqual(1);
      expect(t.palette.length).toBeGreaterThan(2);
      expect(t.carColors.length).toBeGreaterThan(0);
    }
  });
  it('Nekotown is the night city and glows', () => {
    expect(NEON.night).toBe(true);
    expect(themeExtras(NEON).emit).toBeGreaterThan(0);
    expect(all.filter((t) => t.night)).toEqual([NEON]);
  });
});
