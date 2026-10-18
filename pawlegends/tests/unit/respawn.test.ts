/**
 * Respawn and walking (sim v4, data/xp.ts RESPAWN, ZOOMIES, PANIC; data/bots.ts DIFFICULTY_RULES): short respawns,
 * Zoomies out of the fountain, and Rookie's help for the human (faster respawn and regen, Scaredy cat).
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_RULES } from '../../src/data/bots';
import { FOUNTAIN } from '../../src/data/map';
import { HERO_RULES, PANIC, RESPAWN, ZOOMIES } from '../../src/data/xp';
import { dealDamage, resolveDeaths, respawnTicks } from '../../src/sim/combat/damage';
import { step } from '../../src/sim/index';
import { moveSpeed } from '../../src/sim/units/kinds';
import { G, Kind } from '../../src/sim/world';
import { putHero, quietMatch } from './sim-helpers';

const bp = (x: number, b: number): number => Math.trunc((x * b) / 10000);

describe('respawn and walking (sim v4)', () => {
  it('respawn 3 s + 0.6 s a level, max 9 s, at most 4 s before 2:00', () => {
    expect([RESPAWN.base, RESPAWN.perLevel, RESPAWN.cap, RESPAWN.earlyCap, RESPAWN.earlyUntil]).toEqual([90, 18, 270, 120, 3600]);
    expect([1, 2, 5, 10].map((l) => respawnTicks(l, 4000))).toEqual([108, 126, 180, 270]);
    expect([1, 2, 5, 10].map((l) => respawnTicks(l, 0))).toEqual([108, 120, 120, 120]);
  });

  it('Rookie: the human respawns × 0.6, the enemy × 1.5, the allies as usual', () => {
    const timerOf = (slot: number): number => {
      const m = quietMatch(1, false, 'rookie');
      putHero(m, slot, 50000, 30000);
      m.world.hp[slot] = 0;
      resolveDeaths(m);
      return m.world.timer[slot];
    };
    const r = DIFFICULTY_RULES.rookie;
    expect(timerOf(0)).toBe(bp(108, r.humanRespawnBp));
    expect(timerOf(1)).toBe(108);
    expect(timerOf(3)).toBe(bp(108, r.enemyRespawnBp));
  });

  it('Zoomies: +80% move speed for 6 s out of the fountain, refreshed inside it, ended by damage', () => {
    const m = quietMatch(1, false, 'normal');
    const w = m.world;
    w.globals[G.Tick] = 300;
    putHero(m, 1, FOUNTAIN.x, FOUNTAIN.y);
    step(m);
    expect(w.zoomT[1]).toBe(ZOOMIES.ticks);
    const fast = moveSpeed(w, 1);
    putHero(m, 1, 40000, 30000);
    step(m);
    expect(w.zoomT[1]).toBe(ZOOMIES.ticks - 1);
    dealDamage(m, 6, 1, Kind.Minion, 1, 50, 'basic');
    expect(w.zoomT[1]).toBe(0);
    expect(fast).toBe(Math.trunc((moveSpeed(w, 1) * (10000 + ZOOMIES.speedBp)) / 10000));
  });

  it('Rookie Scaredy cat: the human (only) moves faster below 25% HP; off on Normal', () => {
    const speeds = (difficulty: 'rookie' | 'normal', slot: number): [number, number] => {
      const m = quietMatch(1, false, difficulty);
      const w = m.world;
      putHero(m, slot, 50000, 30000);
      w.zoomT[slot] = 0;
      const full = moveSpeed(w, slot);
      w.hp[slot] = bp(w.maxHp[slot], PANIC.hpBp) - 1;
      return [full, moveSpeed(w, slot)];
    };
    const [full, low] = speeds('rookie', 0);
    expect(low).toBe(bp(full, 10000 + DIFFICULTY_RULES.rookie.humanPanicBp));
    const [allyFull, allyLow] = speeds('rookie', 1);
    expect(allyLow).toBe(allyFull);
    const [nFull, nLow] = speeds('normal', 0);
    expect(nLow).toBe(nFull);
  });

  it('Rookie: the human regenerates × humanRegenBp out of combat; Normal as everyone', () => {
    const regen = (difficulty: 'rookie' | 'normal'): number => {
      const m = quietMatch(1, false, difficulty);
      const w = m.world;
      putHero(m, 0, 50000, 30000);
      w.hp[0] = 100;
      const t0 = w.globals[G.Tick];
      while (w.globals[G.Tick] < t0 + 30) step(m);
      return w.hp[0] - 100;
    };
    const per = (b: number) => bp(620, bp(HERO_RULES.regenBpPerSecond, b));
    expect(regen('normal')).toBe(per(10000));
    expect(regen('rookie')).toBe(per(DIFFICULTY_RULES.rookie.humanRegenBp));
  });
});
