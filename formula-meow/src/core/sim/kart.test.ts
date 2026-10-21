import { describe, expect, it } from 'vitest';
import { BoostSource, type TickInput } from '../../types';
import { BOOST, CLASSES, DRIFT, ticks } from '../../tuning';
import { ovalTrack, raceConfig, world } from '../../test/fixtures';
import { GO_TICK, type SimWorld } from './world';
import { applyBoost, applyHit, speedOf, startRespawn } from './kart';
import { followLine } from './autopilot';

const input = (p: Partial<TickInput> = {}): TickInput => ({ steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false, ...p });

/** A solo kart on a "parking lot": the oval with road everywhere and the walls far away. */
function lot(cls: 0 | 1 | 2 = 0, halfW = 400): SimWorld {
  const w = world(raceConfig(ovalTrack(), { cls, humans: [0], solo: true }));
  w.track.halfW.fill(halfW);
  w.track.wallL.fill(1000);
  w.track.wallR.fill(1000);
  return w;
}

function toGo(w: SimWorld): void {
  while (w.tick < GO_TICK + 20) w.step([input()]);
}

describe('kart physics (GDD 3.3–3.6)', () => {
  it('reaches 90 % of top speed in the class time (±0.15 s) and holds top speed', () => {
    for (const c of [0, 1, 2] as const) {
      const w = lot(c);
      toGo(w);
      const top = CLASSES[c].topSpeed;
      let t = 0;
      while (speedOf(w.st.karts[0]) < 0.9 * top && t < 600) {
        w.step([input({ gas: true })]);
        t++;
      }
      expect(Math.abs(t / 60 - CLASSES[c].zeroTo90)).toBeLessThan(0.15);
      for (let i = 0; i < 240; i++) w.step([input({ gas: true })]);
      const v = speedOf(w.st.karts[0]);
      expect(v).toBeLessThanOrEqual(top + 1e-9);
      expect(v).toBeGreaterThan(top * 0.99);
    }
  });

  it('drift charges blue / orange / pink at 0.5 / 1.0 / 1.7 s and releases the tier boost', () => {
    const w = lot(0);
    toGo(w);
    for (let i = 0; i < 120; i++) w.step([input({ gas: true })]);
    const k = w.st.karts[0];
    w.step([input({ gas: true, drift: true, steer: -3 })]); // hop + steer left (≈ 0.43 of lock: neutral charge rate)
    expect(k.driftDir).toBe(-1);
    const tierAt: number[] = [];
    for (let i = 1; i <= 130; i++) {
      const before = k.driftTier;
      w.step([input({ gas: true, drift: true, steer: -3 })]);
      if (k.driftTier > before) tierAt.push(i);
    }
    expect(tierAt.length).toBe(3);
    DRIFT.tiers.forEach((s, j) => expect(Math.abs(tierAt[j] - ticks(s))).toBeLessThanOrEqual(3));
    w.step([input({ gas: true, drift: false })]);
    expect(k.driftDir).toBe(0);
    expect(k.boostTicks).toBeGreaterThan(ticks(DRIFT.boost[2]) - 3);
    expect(w.st.events.some((e) => e.type === 'miniTurbo' && e.a === 3)).toBe(true);
  });

  it('releasing before blue cancels with nothing gained', () => {
    const w = lot(0);
    toGo(w);
    for (let i = 0; i < 120; i++) w.step([input({ gas: true })]);
    const k = w.st.karts[0];
    w.step([input({ gas: true, drift: true, steer: 5 })]);
    // steering into the turn charges 1.5× faster: blue comes at 0.5 s / 1.5 = 20 ticks, so let go at 15
    for (let i = 0; i < 15; i++) w.step([input({ gas: true, drift: true, steer: 5 })]);
    expect(k.driftTier).toBe(0);
    w.step([input({ gas: true })]);
    expect(k.driftDir).toBe(0);
    expect(k.boostTicks).toBe(0);
  });

  it('steering into the turn charges 1.5× faster (blue in ≈ 20 ticks at full lock into the drift)', () => {
    const w = lot(0);
    toGo(w);
    for (let i = 0; i < 120; i++) w.step([input({ gas: true })]);
    const k = w.st.karts[0];
    w.step([input({ gas: true, drift: true, steer: 7 })]);
    expect(k.driftDir).toBe(1);
    let t = 0;
    while (k.driftTier === 0 && t < 60) {
      w.step([input({ gas: true, drift: true, steer: 7 })]);
      t++;
    }
    expect(Math.abs(t - ticks(DRIFT.tiers[0]) / DRIFT.tightFactor)).toBeLessThanOrEqual(4);
  });

  it('boosts refresh instead of stacking: level capped at 1.35 and speed at 1.35 × top', () => {
    const w = lot(0);
    toGo(w);
    for (let i = 0; i < 200; i++) {
      if (i % 20 === 0) {
        applyBoost(w.ctx, 0, BOOST.pad.level, BOOST.pad.time, BoostSource.Pad);
        applyBoost(w.ctx, 0, 1.3, 1.4, BoostSource.MiniTurbo);
        applyBoost(w.ctx, 0, 1.9, 1.0, BoostSource.Catnip);
      }
      w.step([input({ gas: true })]);
      expect(w.st.karts[0].boostLevel).toBeLessThanOrEqual(BOOST.cap);
      expect(speedOf(w.st.karts[0])).toBeLessThanOrEqual(CLASSES[0].topSpeed * BOOST.cap + 1e-6);
    }
  });

  it('off-road slows to 60 % of top, unless boosting', () => {
    const w = lot(0, 2); // a 4 m road, everything else off-road
    toGo(w);
    for (let i = 0; i < 300; i++) w.step([input({ gas: true, steer: i < 20 ? 2 : 0 })]);
    const k = w.st.karts[0];
    expect(Math.abs(k.d)).toBeGreaterThan(3);
    expect(speedOf(k)).toBeLessThanOrEqual(CLASSES[0].topSpeed * 0.6 + 1e-6);
    for (let i = 0; i < 40; i++) {
      applyBoost(w.ctx, 0, BOOST.catnip.level, BOOST.catnip.time, BoostSource.Catnip);
      w.step([input({ gas: true })]);
    }
    expect(speedOf(k)).toBeGreaterThan(CLASSES[0].topSpeed);
  });

  it('a wall graze costs speed but never stops the kart; a head-on bounces back', () => {
    const w = world(raceConfig(ovalTrack(), { humans: [0], solo: true }));
    toGo(w);
    for (let i = 0; i < 90; i++) w.step([input({ gas: true })]);
    const k = w.st.karts[0];
    const v0 = speedOf(k);
    let hit = false;
    for (let i = 0; i < 120 && !hit; i++) {
      w.step([input({ gas: true, steer: 2 })]);
      hit = w.st.events.some((e) => e.type === 'wall');
    }
    expect(hit).toBe(true);
    expect(speedOf(k)).toBeGreaterThan(v0 * 0.5);
    // head-on: aim straight at the wall
    const w2 = lot(0);
    toGo(w2);
    w2.track.wallR.fill(8);
    w2.track.wallL.fill(8);
    const k2 = w2.st.karts[0];
    k2.heading = -Math.PI / 2 + Math.atan2(w2.track.tx[k2.si], w2.track.tz[k2.si]); // face the right wall
    for (let i = 0; i < 60 && !w2.st.events.some((e) => e.type === 'wall' && e.a === 2); i++) w2.step([input({ gas: true })]);
    expect(w2.st.events.some((e) => e.type === 'wall' && e.a === 2)).toBe(true);
    expect(speedOf(k2)).toBeGreaterThan(0);
  });

  it('a ramp launches the kart and it lands again', () => {
    const w = world(raceConfig(ovalTrack([{ s: 20, kind: 'ramp', side: 0 }]), { humans: [0], solo: true }));
    toGo(w);
    let air = false;
    for (let i = 0; i < 600 && !w.st.events.some((e) => e.type === 'land'); i++) {
      const out = input();
      followLine(w.ctx, 0, out, 0);
      w.step([out]);
      air ||= w.st.karts[0].air === 1;
    }
    expect(w.st.events.some((e) => e.type === 'ramp')).toBe(true);
    expect(air).toBe(true);
    expect(w.st.events.some((e) => e.type === 'land')).toBe(true);
  });

  it('a spin-out costs about 1.3 s and never more than 1.6 s (GDD 3.6)', () => {
    const run = (hitAt: number | null) => {
      // no coin trails: a clean run would pick up coins the spun run drops, which is not the spin's own cost
      const w = world(raceConfig({ ...ovalTrack(), lineCoins: false }, { humans: [0], solo: true }));
      toGo(w);
      for (let i = 0; i < 600; i++) {
        if (i === hitAt) expect(applyHit(w.ctx, 0, 'spin')).toBe(true);
        const out = input();
        followLine(w.ctx, 0, out, 0);
        w.step([out]);
      }
      return w.st.karts[0].dist;
    };
    const clean = run(null);
    const hit = run(150);
    const lost = (clean - hit) / CLASSES[0].topSpeed;
    expect(lost).toBeGreaterThan(0.8);
    expect(lost).toBeLessThan(1.6);
  });

  it('Pounce Start: a press within ±0.15 s of GO boosts; an early press stalls from race 2 on', () => {
    for (const [press, forgiving, expectEvent] of [
      [GO_TICK - 5, false, 'pounce'],
      [GO_TICK + 6, false, 'pounce'],
      [GO_TICK - 40, false, 'stall'],
      [GO_TICK - 40, true, null],
    ] as const) {
      const w = world(raceConfig(ovalTrack(), { humans: [0], solo: true, forgiving }));
      while (w.tick < GO_TICK + 30) w.step([input({ gas: w.tick >= press })]);
      const types = w.st.events.filter((e) => e.kart === 0).map((e) => e.type);
      if (expectEvent) expect(types).toContain(expectEvent);
      else {
        expect(types).not.toContain('pounce');
        expect(types).not.toContain('stall');
      }
    }
  });
});

describe('SIM_VERSION 10 fixes', () => {
  it('the rubber band above the class top speed is real speed: topScale up to maxScale, clamped there', () => {
    for (const c of [0, 1, 2] as const) {
      const vmax = (scale: number): number => {
        const w = lot(c);
        toGo(w);
        for (let i = 0; i < 420; i++) {
          w.st.karts[0].topScale = scale;
          w.step([input({ gas: true })]);
        }
        return speedOf(w.st.karts[0]);
      };
      const top = CLASSES[c].topSpeed;
      const max = CLASSES[c].maxScale;
      expect(max).toBeGreaterThan(1);
      expect(vmax(0.9)).toBeCloseTo(top * 0.9, 1);
      expect(vmax(1)).toBeCloseTo(top, 1);
      expect(vmax(max)).toBeCloseTo(top * max, 1);
      expect(vmax(max)).toBeGreaterThan(top * 1.02);
      // above maxScale the core clamps (world.ts and kart.ts)
      expect(vmax(1.5)).toBeCloseTo(top * max, 1);
    }
  });

  it('a trick tapped before a respawn is lost with it: no free trick boost on the next landing', () => {
    const w = lot(1);
    toGo(w);
    for (let i = 0; i < 60; i++) w.step([input({ gas: true })]);
    const k = w.st.karts[0];
    k.air = 1;
    k.airTicks = 12;
    k.trick = 1;
    k.lipTicks = 5;
    startRespawn(w.ctx, 0);
    expect(k.trick).toBe(0);
    expect(k.lipTicks).toBe(-1);
    let t = 0;
    while ((k.respawnTicks > 0 || k.air) && t++ < 600) w.step([input()]);
    expect(k.respawnTicks).toBe(0);
    expect(k.airTicks).toBe(0);
    const from = w.st.events.length;
    // a small drop right after the hand set the kart down
    k.air = 1;
    k.y += 1.5;
    for (let i = 0; i < 60; i++) w.step([input({ gas: true })]);
    const types = w.st.events.slice(from).filter((e) => e.kart === 0).map((e) => e.type);
    expect(types).toContain('land');
    expect(types).not.toContain('trickLand');
  });
});
