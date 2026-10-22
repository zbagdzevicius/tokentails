import { describe, expect, it } from 'vitest';
import { NO_INPUT, type ItemId, type Personality, type TickInput } from '../../types';
import { KITCHEN } from '../../core/track/tracks';
import { raceConfig, world } from '../../test/fixtures';
import { GO_TICK } from '../../core/sim/world';
import { newBrain, threatened, useItems } from './item-brain';
import { bandScale, skillBase } from './rubber-band';
import { personalityFor } from './personalities';
import { itemsOf, ProjKind } from '../items/state';
import { AI, CLASSES } from '../../tuning';
import { applyHit, placeOnTrack } from '../../core/sim/kart';
import { wallGuard } from './driver';
import { ovalTrack } from '../../test/fixtures';
import { cosL, sinL } from '../../core/sim/fixed';

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
  k.boostTicks = 0; // the world is not stepped while holding: a start boost would never run out
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
    itemsOf(w.st).proj.push({ id: 99, kind: ProjKind.Hairball, owner: 3, x: 0, y: 0, z: 0, vx: 0, vz: 0, si: k.si, dist: k.dist - 10, d: k.d, life: 100, bounces: 0, target: -1, imm: 0, hitMask: 0, age: 0, dir: 1, branch: -1 });
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
  it('is capped per class: above the class top speed only behind a leading player, never above maxScale', () => {
    for (const cls of [0, 1, 2] as const) {
      const w = world(raceConfig(KITCHEN, { seed: 3, cls, humans: [5] }));
      while (w.tick < GO_TICK + 10) w.step([NO_INPUT]);
      const p = personalityFor(3, 0, cls);
      const base = skillBase(cls, p.skill);
      w.st.karts[5].dist = w.st.karts[0].dist + 500; // player far ahead
      const up = bandScale(w.ctx, 0, p);
      w.st.karts[5].dist = w.st.karts[0].dist - 500; // player far behind
      const down = bandScale(w.ctx, 0, p);
      expect(up).toBeLessThanOrEqual(CLASSES[cls].maxScale + 1e-9);
      expect(up).toBeLessThanOrEqual(base * (1 + CLASSES[cls].bandUp) + 1e-9);
      expect(up).toBeGreaterThan(base);
      expect(down).toBeLessThanOrEqual(1);
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

  it('the rival rides a stronger band behind the player (no 50cc base bonus), capped at maxScale', () => {
    const cfg = raceConfig(KITCHEN, { seed: 3, cls: 1, humans: [5] });
    cfg.racers[0] = { ...cfg.racers[0], rival: true };
    const w = world(cfg);
    // SIM_VERSION 11: past the band's ramp-in after GO (AI.bandRampTicks)
    while (w.tick < GO_TICK + AI.bandRampTicks + 10) w.step([NO_INPUT]);
    const p = cfg.racers[0].ai!;
    w.st.karts[5].dist = w.st.karts[0].dist + 500;
    const rival = bandScale(w.ctx, 0, p);
    expect(rival).toBeLessThanOrEqual(CLASSES[1].maxScale + 1e-9);
    expect(rival).toBeCloseTo(Math.min(CLASSES[1].maxScale, skillBase(1, p.skill, true) * (1 + CLASSES[1].bandUp + AI.rival.bandUp)), 9);
    expect(skillBase(0, p.skill, true)).toBe(skillBase(0, p.skill)); // 50cc: no head start, the rival never runs away
    // ahead of the player the rival gets no extra pull
    w.st.karts[5].dist = w.st.karts[0].dist - 500;
    const cfg2 = raceConfig(KITCHEN, { seed: 3, cls: 1, humans: [5] });
    const w2 = world(cfg2);
    while (w2.tick < GO_TICK + AI.bandRampTicks + 10) w2.step([NO_INPUT]);
    w2.st.karts.forEach((k, i) => (k.dist = w.st.karts[i].dist));
    expect(bandScale(w.ctx, 0, p) / skillBase(1, p.skill, true)).toBeCloseTo(bandScale(w2.ctx, 0, p) / skillBase(1, p.skill), 9);
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

describe('wall guard (SIM_VERSION 10)', () => {
  // Kitchen 150cc: the guard read the reverse's sideways speed as if the kart drove forward, steered "away" and kept
  // the kart's tail on the wall: it backed along it at 7 m/s for 4 s
  it('leaves a kart backing up (the three-point turn) alone; steers a kart driving into the wall away', () => {
    const w = world(raceConfig(ovalTrack(), { seed: 1 }));
    while (w.tick < GO_TICK + 1) w.step();
    const t = w.track;
    const k = w.st.karts[0];
    const si = 40;
    placeOnTrack(w.ctx, k, si, t.wallR[si] - 1.2);
    const rx = -t.tz[k.si];
    const rz = t.tx[k.si];
    const fx = sinL(k.heading);
    const fz = cosL(k.heading);
    const guard = (vf: number) => {
      // 1.5 m/s toward the right wall, `vf` along the heading
      k.vx = fx * vf + rx * 1.5;
      k.vz = fz * vf + rz * 1.5;
      const out: TickInput = { ...NO_INPUT, steer: 7, brake: true };
      wallGuard(w.ctx, 0, out, P);
      return out;
    };
    const back = guard(-7);
    expect(back.steer).toBe(7);
    expect(back.brake).toBe(true);
    expect(back.gas).toBe(false);
    // control: the same sideways speed driving forward is steered off the wall
    expect(guard(7).steer).toBeLessThan(0);
  });
});
