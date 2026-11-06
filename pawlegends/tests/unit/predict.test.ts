/** Party play N5 (MULTIPLAYER.md §4.3): cosmetic prediction is bounded and converges. */
import { describe, expect, it } from 'vitest';
import { Predictor } from '../../src/net/predict';

describe('Predictor', () => {
  it('leads toward the move target by at most speed × latency, and converges within 150 ms', () => {
    const p = new Predictor();
    const speed = 120;
    const latency = 150;
    p.move(10_000, 0, 0);
    let maxLead = 0;
    for (let t = 0; t <= 400; t += 16) {
      const o = p.offset({ x: 0, y: 0, locked: false, speed }, latency, t);
      maxLead = Math.max(maxLead, Math.hypot(o.dx, o.dy));
    }
    expect(maxLead).toBeLessThanOrEqual((speed * latency) / (1000 / 30) + 1e-6);
    expect(maxLead).toBeGreaterThan(0);
    // the authoritative hero reached the target: the shown offset converges to 0 within 150 ms
    const start = 1000;
    p.offset({ x: 10_000, y: 0, locked: false, speed }, latency, start);
    const o = p.offset({ x: 10_000, y: 0, locked: false, speed }, latency, start + 150);
    expect(Math.hypot(o.dx, o.dy)).toBeLessThan(1);
  });

  it('per render frame: the drawn hero starts moving on the next frame and the lead follows speed × time exactly', () => {
    const p = new Predictor();
    const speed = 160;
    p.move(10_000, 0, 0);
    const at = (t: number) => p.offset({ x: 0, y: 0, locked: false, speed, moving: false }, 300, t).dx;
    expect(at(0)).toBe(0);
    expect(at(16)).toBeGreaterThan(0);
    // no blend lag once it runs smoothly: after 200 ms the lead is speed × 200 ms
    let d = 0;
    for (let t = 32; t <= 200; t += 16) d = at(t);
    expect(d).toBeCloseTo((speed * 192) / (1000 / 30), 0);
  });

  it('a Move the sim never started stops leading after the latency plus the stall grace', () => {
    const p = new Predictor();
    p.move(10_000, 0, 0);
    const o = (t: number) => p.offset({ x: 0, y: 0, locked: false, speed: 160, moving: false }, 200, t);
    for (let t = 0; t < 100; t += 16) o(t);
    expect(Math.hypot(o(100).dx, o(100).dy)).toBeGreaterThan(0);
    o(400);
    expect(p.heading).toBeNull();
    // and the shown offset blends back to 0
    expect(Math.hypot(o(400 + 130).dx, o(400 + 130).dy)).toBeLessThan(1);
  });

  it('no lead under crowd control', () => {
    const p = new Predictor();
    p.move(10_000, 0, 0);
    const o = p.offset({ x: 0, y: 0, locked: true, speed: 120 }, 150, 1000);
    expect(o).toEqual({ dx: 0, dy: 0 });
  });
});
