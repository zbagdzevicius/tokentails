import { describe, expect, it } from 'vitest';
import { NO_INPUT, type ItemId, type Personality, type TickInput } from '../../types';
import { KITCHEN } from '../../core/track/tracks';
import { raceConfig, world } from '../../test/fixtures';
import { GO_TICK } from '../../core/sim/world';
import { newBrain, threatened, useItems } from './item-brain';
import { bandScale, skillBase } from './rubber-band';
import { personalityFor } from './personalities';
import { itemsOf, ProjKind } from '../items/state';
import { CLASSES } from '../../tuning';
import { applyHit } from '../../core/sim/kart';

const P: Personality = { skill: 0.8, aggression: 0.5, mistakeRate: 0, lineBias: 0 };

function setup() {
  const w = world(raceConfig(KITCHEN, { seed: 12 }));
  while (w.tick < GO_TICK + 30) w.step();
  // spread everyone far apart, kart 0 in the middle
  w.st.karts.forEach((k, i) => (k.dist = 1000 + (i === 0 ? 0 : i * 300)));
  w.st.karts[0].dist = 900;
  return w;
}

function hold(w: ReturnType<typeof setup>, item: ItemId, ticks: number): TickInput[] {
  const k = w.st.karts[0];
  k.item = item;
  k.itemCount = 1;
  k.rouletteTicks = 0;
  const m = newBrain();
  const outs: TickInput[] = [];
  for (let t = 0; t < ticks; t++) {
    const o = { ...NO_INPUT };
    useItems(w.ctx, 0, o, m, P);
    outs.push(o);
  }
  return outs;
}

describe('AI item brain (GDD 5.2)', () => {
  it('holds a Yarn as a shield while a rival tailgates, throws it when a rival is ahead', () => {
    const w = setup();
    w.st.karts[1].dist = 892; // 8 m behind
    expect(hold(w, 'yarn', 200).some((o) => o.item)).toBe(false);
    w.st.karts[1].dist = 600;
    w.st.karts[2].dist = 930; // 30 m ahead
    const outs = hold(w, 'yarn', 200);
    const i = outs.findIndex((o) => o.item);
    expect(i).toBeGreaterThan(0);
    expect(outs[i].itemBack).toBe(false);
  });

  it('drops a Cucumber on a tailgater in its lane', () => {
    const w = setup();
    w.st.karts[1].dist = 885;
    w.st.karts[1].d = w.st.karts[0].d;
    const o = hold(w, 'cucumber', 200).find((x) => x.item);
    expect(o?.itemBack).toBe(true);
  });

  it('keeps the Cardboard Box until something is coming, then uses it', () => {
    const w = setup();
    expect(hold(w, 'box', 120).some((o) => o.item)).toBe(false);
    const k = w.st.karts[0];
    itemsOf(w.st).proj.push({ id: 99, kind: ProjKind.Hairball, owner: 3, x: 0, y: 0, z: 0, vx: 0, vz: 0, si: k.si, dist: k.dist - 10, d: k.d, life: 100, bounces: 0, target: -1, imm: 0, hitMask: 0, age: 0 });
    expect(threatened(w.ctx, 0)).toBe(true);
    expect(hold(w, 'box', 120).some((o) => o.item)).toBe(true);
  });

  it('presses Catnip with fresh edges so all three charges fire', () => {
    const w = setup();
    const outs = hold(w, 'catnip', 400);
    let edges = 0;
    for (let t = 1; t < outs.length; t++) if (outs[t].item && !outs[t - 1].item) edges++;
    expect(edges).toBeGreaterThanOrEqual(3);
  });
});

describe('rubber band (GDD 5.3)', () => {
  it('is capped per class and never lifts an AI above the unboosted top speed', () => {
    for (const cls of [0, 1, 2] as const) {
      const w = world(raceConfig(KITCHEN, { seed: 3, cls, humans: [5] }));
      while (w.tick < GO_TICK + 10) w.step([NO_INPUT]);
      const p = personalityFor(3, 0, cls);
      const base = skillBase(cls, p.skill);
      w.st.karts[5].dist = w.st.karts[0].dist + 500; // player far ahead
      const up = bandScale(w.ctx, 0, p);
      w.st.karts[5].dist = w.st.karts[0].dist - 500; // player far behind
      const down = bandScale(w.ctx, 0, p);
      expect(up).toBeLessThanOrEqual(1);
      expect(up).toBeLessThanOrEqual(base * (1 + CLASSES[cls].bandUp) + 1e-9);
      expect(down).toBeCloseTo(base * (1 - CLASSES[cls].bandDown), 9);
    }
  });

  it('the skill base runs from aiTop (least skilled) to aiTopHi (most skilled), never above 1', () => {
    for (const cls of [0, 1, 2] as const) {
      const [lo, hi] = CLASSES[cls].aiSkill;
      expect(skillBase(cls, lo)).toBeCloseTo(CLASSES[cls].aiTop, 9);
      expect(skillBase(cls, hi)).toBeCloseTo(Math.min(1, CLASSES[cls].aiTopHi), 9);
      expect(skillBase(cls, hi, true)).toBeLessThanOrEqual(1);
      let prev = 0;
      for (let u = 0; u <= 1; u += 0.1) {
        const b = skillBase(cls, lo + (hi - lo) * u);
        expect(b).toBeGreaterThanOrEqual(prev);
        prev = b;
      }
    }
  });

  it('every field is spread across the skill band (rank spread): a front-runner and a straggler each race', () => {
    for (let seed = 1; seed <= 30; seed++)
      for (const cls of [0, 1, 2] as const) {
        const [lo, hi] = CLASSES[cls].aiSkill;
        const sk = [0, 1, 2, 3, 4, 5, 6, 7].map((slot) => personalityFor(seed, slot, cls).skill);
        expect(Math.max(...sk) - Math.min(...sk)).toBeGreaterThan((hi - lo) * 0.8);
        for (const s of sk) {
          expect(s).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(s).toBeLessThanOrEqual(hi + 1e-9);
        }
      }
  });

  it('the rival rides a stronger band (+4 % base, up to +8 % behind) but still never above 1', () => {
    const cfg = raceConfig(KITCHEN, { seed: 3, cls: 0, humans: [5] });
    cfg.racers[0] = { ...cfg.racers[0], rival: true };
    const w = world(cfg);
    while (w.tick < GO_TICK + 10) w.step([NO_INPUT]);
    const p = cfg.racers[0].ai!;
    w.st.karts[5].dist = w.st.karts[0].dist + 500;
    const rival = bandScale(w.ctx, 0, p);
    expect(rival).toBeLessThanOrEqual(1);
    expect(rival).toBeCloseTo(Math.min(1, skillBase(0, p.skill, true) * 1.08), 9);
    expect(rival).toBeGreaterThan(Math.min(1, skillBase(0, p.skill) * (1 + CLASSES[0].bandUp)));
  });

  it('difficulty rises with the class: 150cc AI is more skilled than 50cc AI', () => {
    let s0 = 0;
    let s2 = 0;
    for (let seed = 1; seed <= 20; seed++)
      for (let slot = 0; slot < 8; slot++) {
        s0 += personalityFor(seed, slot, 0).skill;
        s2 += personalityFor(seed, slot, 2).skill;
      }
    expect(s2).toBeGreaterThan(s0 * 1.15);
  });
});

describe('rival and racecraft (feel lane)', () => {
  it('the player hitting their rival starts a 20 s grudge (one `grudge` event, b = the player)', () => {
    const cfg = raceConfig(KITCHEN, { seed: 4, cls: 1, humans: [5] });
    cfg.racers[2] = { ...cfg.racers[2], rival: true };
    const w = world(cfg);
    while (w.tick < GO_TICK + 120) w.step([{ ...NO_INPUT, gas: true }]);
    applyHit(w.ctx, 2, 'wobble', 5);
    for (let i = 0; i < 3; i++) w.step([{ ...NO_INPUT, gas: true }]);
    const g = w.st.events.filter((e) => e.type === 'grudge');
    expect(g.length).toBe(1);
    expect(g[0].kart).toBe(2);
    expect(g[0].b).toBe(5);
    // a hit on a non-rival never starts one
    applyHit(w.ctx, 3, 'wobble', 5);
    for (let i = 0; i < 3; i++) w.step([{ ...NO_INPUT, gas: true }]);
    expect(w.st.events.filter((e) => e.type === 'grudge').length).toBe(1);
  });

  it('AI cats trick off ramps (skilled ones nearly always)', () => {
    const w = world({ ...raceConfig(KITCHEN, { seed: 6, cls: 2 }), tailTicks: 60 });
    while (!w.done) w.step();
    const ramps = w.st.events.filter((e) => e.type === 'ramp').length;
    const tricks = w.st.events.filter((e) => e.type === 'trick').length;
    expect(ramps).toBeGreaterThan(0);
    expect(tricks / ramps).toBeGreaterThan(0.5);
  });

  it('low-skill cats miss more mini-turbos per drift than skilled ones', () => {
    const rate = (skill: number) => {
      let mts = 0;
      let drifts = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const cfg = { ...raceConfig(KITCHEN, { seed, cls: 0 }), tailTicks: 60 };
        cfg.racers = cfg.racers.map((r) => ({ ...r, ai: { skill, aggression: 0.5, mistakeRate: (1 - skill) * 0.9, lineBias: 0 } }));
        const w = world(cfg);
        while (!w.done) w.step();
        mts += w.st.events.filter((e) => e.type === 'miniTurbo').length;
        drifts += w.st.events.filter((e) => e.type === 'driftStart').length;
      }
      return mts / Math.max(1, drifts);
    };
    expect(rate(0.95)).toBeGreaterThan(rate(0.4));
  });
});
