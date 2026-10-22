/**
 * ANIM-SPEC §4.3 / §12 basicClock.test: on a synthetic stream the predicted contact equals the sim's hit tick at
 * periods 30 and 21 (after the period is measured), a missed hit becomes a feint, a contact with no swing running is
 * impact-led, and the combo / basic counters advance and reset.
 */
import { describe, expect, it } from 'vitest';
import { BasicClock, ClockOut, COMBO_RESET_TICKS } from '../../../src/render/anim/basicClock';

/** Run `ticks` of a hero attacking from `t0`, hitting every `P` ticks (swing start + 8). Returns predicted vs hit. */
function run(base: number, P: number, swings: number): { predicted: number[]; hits: number[]; outs: ClockOut[] } {
  const c = new BasicClock(base);
  const predicted: number[] = [];
  const hits: number[] = [];
  const outs: ClockOut[] = [];
  const t0 = 100;
  const hitTicks = new Set<number>();
  for (let i = 0; i < swings; i++) hitTicks.add(t0 + 8 + i * P);
  for (let t = t0; t <= t0 + swings * P + 10; t++) {
    const o = c.frame(t, true);
    if (o === ClockOut.Start) predicted.push(c.contact);
    if (hitTicks.has(t)) {
      hits.push(t);
      outs.push(c.confirm(t));
    }
  }
  return { predicted, hits, outs };
}

describe('BasicClock', () => {
  it('period 30: every predicted contact is the hit tick', () => {
    const r = run(30, 30, 6);
    expect(r.hits.length).toBe(6);
    expect(r.predicted.slice(0, 6)).toEqual(r.hits);
    expect(r.outs.every((o) => o === ClockOut.Confirmed)).toBe(true);
  });

  it('period 21 (Golden Hour): contact on the hit once the period is measured', () => {
    const r = run(30, 21, 8);
    // swings 3+ are predicted from the measured period
    const tail = r.hits.slice(2);
    for (const h of tail) expect(r.predicted).toContain(h);
    // the miss before the period was measured is impact-led (never late)
    expect(r.outs.includes(ClockOut.ImpactLed)).toBe(true);
  });

  it('a missed hit becomes a feint', () => {
    const c = new BasicClock(30);
    expect(c.frame(100, true)).toBe(ClockOut.Start);
    let feint = -1;
    for (let t = 101; t < 120; t++) if (c.frame(t, true) === ClockOut.Feint) feint = t;
    // first swing: 4 ticks of slack after the predicted contact (108)
    expect(feint).toBe(113);
  });

  it('a contact with no swing running is impact-led', () => {
    const c = new BasicClock(30);
    expect(c.confirm(50)).toBe(ClockOut.ImpactLed);
    expect(c.start).toBe(42);
  });

  it('combo advances per confirmed swing and resets after 1.5 s', () => {
    const c = new BasicClock(30);
    c.confirm(10);
    c.confirm(40);
    c.confirm(70);
    expect(c.combo).toBe(2);
    expect(c.basicCount).toBe(3);
    c.confirm(70 + COMBO_RESET_TICKS + 1);
    expect(c.combo).toBe(0);
  });

  it('the swing that starts sees A, B, C in order (picked at swing start), and a pause starts over at A', () => {
    const c = new BasicClock(30);
    const seen: number[] = [];
    for (let t = 100; t <= 100 + 30 * 4; t++) {
      if (c.frame(t, true) === ClockOut.Start) seen.push(c.combo);
      if (t === c.contact && c.swingOn) c.confirm(t);
    }
    expect(seen.slice(0, 4)).toEqual([0, 1, 2, 3]);
    // stop attacking for > 1.5 s, then start again
    const t1 = 100 + 30 * 4 + COMBO_RESET_TICKS + 30;
    c.frame(t1 - 1, false);
    expect(c.frame(t1, true)).toBe(ClockOut.Start);
    expect(c.combo).toBe(0);
  });
});
