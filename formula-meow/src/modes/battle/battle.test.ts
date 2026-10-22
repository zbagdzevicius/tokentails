import { describe, expect, it } from 'vitest';
import { buildField, createSimPlugins } from '../../items-ai';
import { SimWorld } from '../../core/sim/world';
import { RUG } from '../../core/track/tracks';
import type { RaceClass, RaceConfig } from '../../types';
import { registerModesRules } from '../sim-rules';
import { BATTLE, BATTLE_TICKS, FRENZY_TICK, battleOf } from './rules';
import { applyHit, speedOf } from '../../core/sim/kart';

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

  it('the last 30 s are a frenzy: one frenzy event on its tick, and pops and steals score 2 from then on', () => {
    expect(FRENZY_TICK).toBe(BATTLE_TICKS - 1800);
    const w = run(battleCfg(2));
    const b = battleOf(w.st);
    const go = w.ctx.goTick;
    const fr = w.st.events.filter((e) => e.type === 'frenzy');
    expect(fr.length).toBe(1);
    expect(fr[0].tick - go).toBe(FRENZY_TICK);
    // every point comes from the pop / steal log: 1 each before the frenzy, 2 in it, minus one per pop-out (floor 0)
    const late = w.st.events.filter((e) => (e.type === 'balloonPop' || e.type === 'balloonSteal') && e.tick - go >= FRENZY_TICK && (e.b ?? -1) >= 0 && e.b !== e.kart);
    expect(late.length).toBeGreaterThan(0);
    const n = w.st.karts.length;
    const want = new Array<number>(n).fill(0);
    for (const e of w.st.events) {
      if ((e.type === 'balloonPop' || e.type === 'balloonSteal') && (e.b ?? -1) >= 0 && e.b !== e.kart) want[e.b!] += e.tick - go >= FRENZY_TICK ? BATTLE.frenzyPoints : 1;
      if (e.type === 'eliminated') want[e.kart] = Math.max(0, want[e.kart] - BATTLE.outCost);
    }
    expect(b.score).toEqual(want);
  }, 60_000);

  it('golden hash: Rug, seed 4, 8 AI, the full round with the frenzy (bump SIM_VERSION when this changes on purpose)', () => {
    const w = run(battleCfg(4));
    expect(w.hash()).toMatchInlineSnapshot(`3144453215`);
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

  // SIM_VERSION 10: a cat with its tail to the arena's wall backed into it for up to 48 s (Rug, seed 5, 100cc), and
  // about a quarter of all item hits landed on balloon-immune cats (a wasted item, a free spin)
  it('no cat sits stuck for long, and no item hit lands on a balloon-immune cat', () => {
    let longest = 0;
    let where = '';
    let immHits = 0;
    let hits = 0;
    for (let seed = 1; seed <= 6; seed++)
      for (const cls of [0, 1, 2] as const) {
        const cfg = battleCfg(seed, cls);
        const w = new SimWorld(cfg, createSimPlugins(cfg));
        const run = new Array<number>(8).fill(0);
        let ev = 0;
        while (!w.done && w.tick < 60 * 400) {
          const imm = battleOf(w.st)?.imm.slice() ?? [];
          w.step([]);
          for (; ev < w.st.events.length; ev++) {
            const e = w.st.events[ev];
            if (e.type !== 'hit' || (e.b ?? -1) < 0 || e.b === e.kart) continue;
            hits++;
            if (imm[e.kart] > 0) immHits++;
          }
          if (w.tick < w.ctx.goTick + 60) continue;
          for (let i = 0; i < 8; i++) {
            const k = w.st.karts[i];
            if (!k.out && k.respawnTicks === 0 && k.spinTicks === 0 && speedOf(k) < 2) {
              if (++run[i] > longest) {
                longest = run[i];
                where = `seed ${seed} cls ${cls} kart ${i} t${w.tick}`;
              }
            } else run[i] = 0;
          }
        }
      }
    // the watchdog flips a wedged cat's escape every 2 s (furniture can hold one for two goes)
    expect(longest, where).toBeLessThan(5 * 60);
    expect(hits).toBeGreaterThan(500);
    // (a respawn can shorten the cover by a tick or two at the edges)
    expect(immHits / hits).toBeLessThan(0.01);
  }, 120_000);

  it('a balloon-immune cat is not spun again (the hit is blocked)', () => {
    const cfg = battleCfg(2, 1, [0, 1]);
    cfg.racers[0] = { ...cfg.racers[0], ai: undefined };
    cfg.racers[1] = { ...cfg.racers[1], ai: undefined };
    const w = new SimWorld(cfg, createSimPlugins(cfg));
    while (w.st.phase !== 'race') w.step([]);
    const k = w.st.karts[0];
    expect(applyHit(w.ctx, 0, 'spin', 1)).toBe(true);
    expect(k.balloons).toBe(2);
    k.spinTicks = 0;
    k.vx = 10;
    expect(applyHit(w.ctx, 0, 'spin', 1)).toBe(false);
    expect(k.spinTicks).toBe(0);
    expect(k.vx).toBe(10);
    expect(k.balloons).toBe(2);
  });
});
