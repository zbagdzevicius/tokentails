/**
 * ANIM-SPEC §12 timing.contract.test: SIM_TIMING (derived from the hero data, effects and hero rules) matches the
 * spec's §15 table, and every filled MoveSet's anchored spans match it within one 60 Hz frame: basic clips contact at
 * the 8 t windup, dash clips bind their landing to travelEnd, windup clips bind windupStart. A balance retune breaks
 * this test instead of desyncing the animation.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { BASIC_WINDUP, DASH_SPEED, SIM_TIMING, TICK_S, abilNumbers, slotTimingFrom, travelTicks } from '../../../src/render/anim/timing';
import { HERO_ANIM } from '../../../src/render/anim/registry';
import { SLOTS } from '../../../src/render/anim/types';

const FRAME = 1 / 60;

describe('SIM_TIMING (§15)', () => {
  it('basic windup and periods', () => {
    expect(BASIC_WINDUP).toBe(8);
    const P = Object.fromEntries(HERO_IDS.map((h) => [h, SIM_TIMING[h].period]));
    expect(P).toEqual({ clem: 30, sage: 27, brutus: 36, cacklejaw: 29, lambo: 30, aviete: 28, bengas: 30, gabe: 28 });
  });

  it('dashes at 20 m/s', () => {
    expect(DASH_SPEED).toBe(20000);
    const d = (h: (typeof HERO_IDS)[number], s: 'q' | 'e', ids: string[] = []) => slotTimingFrom(h, s, abilNumbers(h, s, ids)).dashTicks;
    expect(d('clem', 'e')).toBe(6);
    expect(d('sage', 'e')).toBe(5);
    expect(d('brutus', 'e')).toBe(8);
    expect(d('cacklejaw', 'q')).toBe(6);
    expect(d('cacklejaw', 'q', ['long-jeer'])).toBe(9);
    expect(d('lambo', 'e')).toBe(8);
    expect(d('lambo', 'e', ['flop-further'])).toBe(10);
    expect(d('bengas', 'e')).toBe(6);
    expect(d('bengas', 'e', ['long-hop'])).toBe(7);
    expect(d('gabe', 'e')).toBe(6);
  });

  it('windups, zones and projectiles', () => {
    expect(SIM_TIMING.sage.slots.r.windup).toBe(30);
    expect(SIM_TIMING.lambo.slots.r.windup).toBe(15);
    expect(SIM_TIMING.gabe.slots.r.windup).toBe(15);
    expect(SIM_TIMING.bengas.slots.w.windup).toBe(9);
    expect(SIM_TIMING.sage.slots.w.arm).toBe(15);
    expect(SIM_TIMING.gabe.slots.q.arm).toBe(15);
    expect(SIM_TIMING.bengas.slots.r.arm).toBe(18);
    expect(SIM_TIMING.bengas.slots.r.every).toBe(15);
    expect(SIM_TIMING.sage.slots.q.projTicks).toBeCloseTo(10.5, 6);
    expect(SIM_TIMING.sage.slots.r.projTicks).toBeCloseTo(20, 6);
    expect(SIM_TIMING.clem.slots.r.projTicks).toBeCloseTo(6, 6);
    expect(slotTimingFrom('sage', 'q', abilNumbers('sage', 'q', null, true)).projTicks).toBeCloseTo(11.25, 6);
    expect(SIM_TIMING.lambo.slots.q.projTicks).toBeCloseTo(11.25, 6);
    expect(SIM_TIMING.bengas.slots.q.projTicks).toBeCloseTo(11.67, 2);
    expect(travelTicks(12000, 24000)).toBe(15);
  });

  it('durations', () => {
    expect(SIM_TIMING.clem.slots.w.duration).toBe(23);
    expect(slotTimingFrom('clem', 'w', abilNumbers('clem', 'w', ['steady-stand'])).duration).toBe(38);
    expect(SIM_TIMING.clem.slots.r.duration).toBe(180);
    expect(SIM_TIMING.brutus.slots.w.duration).toBe(75);
    expect(slotTimingFrom('brutus', 'w', abilNumbers('brutus', 'w', null, true)).duration).toBe(60);
    expect(SIM_TIMING.brutus.slots.r.duration).toBe(90);
    expect(SIM_TIMING.cacklejaw.slots.e.duration).toBe(90);
    expect(SIM_TIMING.clem.slots.q.recasts).toBe(2);
    expect(SIM_TIMING.clem.slots.q.recastWindow).toBe(90);
  });
});

describe('every filled MoveSet binds to the sim timings', () => {
  it('basics contact at the windup; dashes land on travelEnd; windup casts bind windupStart', async () => {
    for (const h of HERO_IDS) {
      const m = (await HERO_ANIM[h].moves()).MOVES;
      if (m.stub) continue;
      for (const c of m.basic) {
        expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S), `${c.id} contact`).toBeLessThanOrEqual(FRAME);
        expect(c.warp.some(([mk, a]) => mk === 'contact' && (a === 'contact' || a === 'release')), `${c.id} binds contact`).toBe(true);
      }
      for (const s of SLOTS) {
        const t = SIM_TIMING[h].slots[s];
        const c = m.slots[s].cast;
        if (t.dashMm > 0) expect(c.warp.some(([, a]) => a === 'travelEnd' || a === 'homingEnd'), `${c.id} binds its landing`).toBe(true);
        if (t.windup > 0) expect(c.warp.some(([, a]) => a === 'windupStart'), `${c.id} binds windupStart`).toBe(true);
        if (t.arm > 0 && s !== 'r') expect(c.warp.some(([, a]) => a === 'zoneArm' || a === 'cast'), `${c.id} binds the zone`).toBe(true);
      }
    }
  });
});
