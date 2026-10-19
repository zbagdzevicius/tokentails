import { describe, expect, it } from 'vitest';
import { buildField, createSimPlugins } from '../../items-ai';
import { SimWorld } from '../../core/sim/world';
import { RUG } from '../../core/track/tracks';
import type { RaceClass, RaceConfig } from '../../types';
import { registerModesRules } from '../sim-rules';
import { BATTLE_TICKS, battleOf } from './rules';

registerModesRules();

function battleCfg(seed: number, cls: RaceClass = 1, humans: number[] = []): RaceConfig {
  return { track: RUG, seed, cls, modifiers: 0, racers: buildField({ seed, cls, playerSlot: -1 }), humans, forgiving: false, mode: 'battle', timeLimitTicks: BATTLE_TICKS + 60 };
}

function run(cfg: RaceConfig) {
  const w = new SimWorld(cfg, createSimPlugins(cfg));
  while (!w.done && w.tick < 60 * 400) w.step([]);
  return w;
}

describe('balloon battle', () => {
  it('plays the whole round and ranks by points, with real fights', () => {
    const report: string[] = [];
    let pops = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const w = run(battleCfg(seed));
      const b = battleOf(w.st);
      expect(w.done).toBe(true);
      // nobody is out for good: the round always runs its full clock
      expect(w.tick - w.ctx.goTick).toBeGreaterThanOrEqual(BATTLE_TICKS - 1);
      expect(w.tick - w.ctx.goTick).toBeLessThanOrEqual(BATTLE_TICKS + 1);
      const r = w.result();
      expect(r.places.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(r.battle?.balloons.length).toBe(8);
      expect(r.battle?.score?.length).toBe(8);
      // ranked by points, best first
      const sc = r.places.map((p) => b.score[p.kart]);
      for (let i = 1; i < sc.length; i++) expect(sc[i]).toBeLessThanOrEqual(sc[i - 1]);
      const p = b.pops.reduce((a, x) => a + x, 0);
      pops += p;
      report.push(`seed ${seed}: pops ${p}, steals ${b.steals.reduce((a, x) => a + x, 0)}, outs ${b.outs.reduce((a, x) => a + x, 0)}, top ${sc[0]}`);
    }
    if (process.env.FM_BATTLE_PRINT) process.stderr.write(report.join('\n') + '\n');
    expect(pops).toBeGreaterThan(6 * 6);
  }, 60_000);

  it('replays exactly (same seed, same hashes)', () => {
    const a = new SimWorld(battleCfg(3), createSimPlugins(battleCfg(3)));
    const b = new SimWorld(battleCfg(3), createSimPlugins(battleCfg(3)));
    for (let i = 0; i < 3000; i++) {
      a.step([]);
      b.step([]);
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('a popped-out cat loses a point and comes back with full balloons', () => {
    const cfg = battleCfg(5, 1, [0]);
    cfg.racers[0] = { ...cfg.racers[0], ai: undefined };
    const w = new SimWorld(cfg, createSimPlugins(cfg));
    while (w.st.phase !== 'race') w.step([]);
    const b = battleOf(w.st);
    b.score[0] = 2;
    for (let n = 0; n < 3; n++) {
      b.imm[0] = 0;
      w.plugins.mode!.onHit!(w.ctx, 0, 1, 'spin');
    }
    expect(w.st.karts[0].out).toBe(1);
    expect(b.score[0]).toBe(1);
    expect(b.score[1]).toBeGreaterThanOrEqual(3);
    const at = w.tick;
    while (w.st.karts[0].out && w.tick < at + 600) w.step([]);
    expect(w.done).toBe(false);
    expect(w.st.karts[0].out).toBe(0);
    expect(w.st.karts[0].balloons).toBe(3);
    expect(w.tick - at).toBeLessThanOrEqual(3 * 60);
    expect(b.imm[0]).toBeGreaterThan(0);
  });
});
