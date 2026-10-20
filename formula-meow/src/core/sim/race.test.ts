import { describe, expect, it } from 'vitest';
import { packInput, unpackInput, type RaceClass, type TickInput } from '../../types';
import { RACE } from '../../tuning';
import { TRACKS, KITCHEN } from '../track/tracks';
import { ovalTrack, raceConfig, world } from '../../test/fixtures';
import { createSimPlugins } from '../../items-ai';
import { playerBot } from '../../items-ai/balance/bots';
import { lapOf } from './race';
import { simulate, ReplayRecorder } from './replay';
import { GO_TICK } from './world';
import { followLine } from './autopilot';

const input = (p: Partial<TickInput> = {}): TickInput => ({ steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false, ...p });

describe('race rules (GDD 1.2)', () => {
  it('lapOf counts from the start line', () => {
    expect(lapOf(-5, 700)).toBe(0);
    expect(lapOf(0, 700)).toBe(1);
    expect(lapOf(699.9, 700)).toBe(1);
    expect(lapOf(700, 700)).toBe(2);
    expect(lapOf(2100, 700)).toBe(4);
  });

  // [tracks lane] six tracks now: a longer timeout
  it('every authored track runs an AI-only race to the end in every class, nobody stuck', { timeout: 120_000 }, () => {
    for (const def of TRACKS)
      for (const cls of [0, 1, 2] as RaceClass[]) {
        const run = simulate({ ...raceConfig(def, { seed: 11, cls }), tailTicks: 60 * 60 }, createSimPlugins(), undefined);
        const w = run.world;
        expect(w.done).toBe(true);
        expect(w.st.karts.every((k) => k.finished)).toBe(true);
        const times = run.result.places.map((p) => p.time!);
        // [tracks lane] ITERATION-2.md: laps are 900–1100 m (35–40 s at 100cc), so Kitten on the longest track stays
        // under 160 s (GDD 1.2's 75–95 s was for the 650–750 m v1 laps)
        expect(Math.max(...times)).toBeLessThan(160);
        expect(Math.min(...times)).toBeGreaterThan(45);
        // respawns (big hand) are rare
        expect(w.st.events.filter((e) => e.type === 'respawn').length).toBeLessThanOrEqual(4);
        // places are 1..8, by finish time
        const sorted = [...run.result.places].sort((a, b) => a.time! - b.time!);
        expect(sorted.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      }
  });

  it('driving backwards over the line takes the lap back', () => {
    const w = world(raceConfig(ovalTrack(), { humans: [0], solo: true }));
    while (w.tick < GO_TICK + 1) w.step([input()]);
    const k = w.st.karts[0];
    let t = 0;
    while (k.dist < 15 && t++ < 600) {
      const o = input();
      followLine(w.ctx, 0, o, 0);
      w.step([o]);
    }
    expect(k.lap).toBe(1);
    // stop and reverse back behind the line
    t = 0;
    while (k.dist > -6 && t++ < 900) w.step([input({ brake: true })]);
    expect(k.dist).toBeLessThan(0);
    expect(k.lap).toBe(0);
    t = 0;
    while (k.dist < 10 && t++ < 900) {
      const o = input();
      followLine(w.ctx, 0, o, 0);
      w.step([o]);
    }
    expect(k.lap).toBe(1);
  });

  it('positions and finish order are consistent with distance (within the 0.6 m hysteresis, B3)', () => {
    const w = world(raceConfig(KITCHEN, { seed: 5 }));
    for (let i = 0; i < 1500; i++) w.step();
    const ord = w.st.order;
    for (let p = 1; p < ord.length; p++) expect(w.st.karts[ord[p - 1]].dist).toBeGreaterThanOrEqual(w.st.karts[ord[p]].dist - RACE.leadMargin);
    ord.forEach((kart, p) => expect(w.st.karts[kart].place).toBe(p + 1));
  });
});

describe('determinism (GDD 3.1)', () => {
  it('same config + inputs → identical state hashes every 60 ticks', () => {
    const cfg = raceConfig(KITCHEN, { seed: 42, humans: [5] });
    const a = simulate(cfg, createSimPlugins());
    const b = simulate(cfg, createSimPlugins());
    expect(a.hashes.length).toBeGreaterThan(60);
    expect(a.hashes).toEqual(b.hashes);
    const c = simulate({ ...cfg, seed: 43 }, createSimPlugins());
    expect(c.hashes).not.toEqual(a.hashes);
  });

  it('golden hash: Kitchen, seed 42, AI-only, 10 s after GO (bump SIM_VERSION when this changes on purpose)', () => {
    const w = world(raceConfig(KITCHEN, { seed: 42 }));
    while (w.tick < GO_TICK + 600) w.step();
    expect(w.hash()).toMatchInlineSnapshot(`3800600056`);
  });

  it('a replay re-simulates to the exact same finish time and final hash', () => {
    const cfg = raceConfig(KITCHEN, { seed: 9, humans: [5] });
    const w = world(cfg);
    const rec = new ReplayRecorder();
    while (!w.done) {
      const i = playerBot(w.ctx, 5, 0.7);
      rec.push(i);
      w.step([i]);
    }
    // [tracks lane] the same plugins as the live race (its hazards and track rules), as replay.ts asks
    const again = simulate(cfg, createSimPlugins(cfg), rec.replay());
    expect(again.result.player.time).not.toBeNull();
    expect(again.result.player.time).toBe(w.result().player.time);
    expect(again.world.hash()).toBe(w.hash());
  });

  it('packed inputs round-trip', () => {
    for (let s = -7; s <= 7; s++)
      for (const f of [0, 1, 2, 4, 8, 16, 31]) {
        const i: TickInput = { steer: s, gas: !!(f & 1), brake: !!(f & 2), drift: !!(f & 4), item: !!(f & 8), itemBack: !!(f & 16) };
        expect(unpackInput(packInput(i))).toEqual(i);
      }
  });
});
