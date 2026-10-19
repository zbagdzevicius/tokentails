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
  it('ends with a ranked winner within 3 minutes, with real fights', () => {
    const report: string[] = [];
    let pops = 0;
    let decided = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const w = run(battleCfg(seed));
      const b = battleOf(w.st);
      expect(w.done).toBe(true);
      expect(w.tick - w.ctx.goTick).toBeLessThanOrEqual(BATTLE_TICKS + 1);
      const r = w.result();
      // places 1..8, each once; the winner is still in
      expect(r.places.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(w.st.karts[r.places[0].kart].out).toBe(0);
      expect(r.battle?.balloons.length).toBe(8);
      // nobody still in ranks below a cat that is out
      const outs = r.places.map((p) => w.st.karts[p.kart].out);
      const firstOut = outs.indexOf(1);
      expect(firstOut < 0 || outs.slice(firstOut).every((o) => o === 1)).toBe(true);
      const p = b.pops.reduce((a, x) => a + x, 0);
      const s = b.steals.reduce((a, x) => a + x, 0);
      pops += p;
      const alive = w.st.karts.filter((k) => !k.out).length;
      if (alive === 1) decided++;
      report.push(`seed ${seed}: ${((w.tick - w.ctx.goTick) / 60).toFixed(1)} s, alive ${alive}, pops ${p}, steals ${s}, out ${outs.filter((o) => o).length}`);
    }
    if (process.env.FM_BATTLE_PRINT) process.stderr.write(report.join('\n') + '\n');
    // a fight, not a parade: balloons pop in every round, and some rounds end with one cat left
    expect(pops).toBeGreaterThan(8 * 6);
    expect(decided).toBeGreaterThan(0);
  });

  it('replays exactly (same seed, same hashes)', () => {
    const a = new SimWorld(battleCfg(3), createSimPlugins(battleCfg(3)));
    const b = new SimWorld(battleCfg(3), createSimPlugins(battleCfg(3)));
    for (let i = 0; i < 3000; i++) {
      a.step([]);
      b.step([]);
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('a human who is out ends the round 4 s later', () => {
    const cfg = battleCfg(5, 1, [0]);
    cfg.racers[0] = { ...cfg.racers[0], ai: undefined };
    const w = new SimWorld(cfg, createSimPlugins(cfg));
    while (w.st.phase !== 'race') w.step([]);
    for (let n = 0; n < 3; n++) {
      battleOf(w.st).imm[0] = 0;
      w.plugins.mode!.onHit!(w.ctx, 0, 1, 'spin');
    }
    expect(w.st.karts[0].out).toBe(1);
    const at = w.tick;
    while (!w.done && w.tick < at + 600) w.step([]);
    expect(w.done).toBe(true);
    expect(w.tick - at).toBeLessThanOrEqual(4 * 60 + 2);
  });
});
