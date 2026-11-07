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

  it('a held joystick (a Move re-issued every 100 ms ahead of the hero) keeps a steady lead: no surge, never backwards', () => {
    const v = 4.9; // mm per ms (4900 mm/s)
    const L = 220;
    const spd = (v * 1000) / 30;
    const p = new Predictor();
    let target = 2000;
    let lastMove = 0;
    p.move(target, 0, 0);
    const drawn: number[] = [];
    const dt = 1000 / 60;
    for (let t = 0; t <= 2000; t += dt) {
      const auth = Math.max(0, t - L) * v;
      if (Math.abs(target - auth) < 1500 && t - lastMove >= 100) {
        target = auth + 2500;
        lastMove = t;
        p.move(target, 0, t);
      }
      drawn.push(auth + p.offset({ x: auth, y: 0, locked: false, speed: spd, moving: t > L }, L, t).dx);
    }
    const vel = drawn.slice(1).map((d, i) => (d - drawn[i]) / dt).slice(30);
    expect(Math.min(...vel)).toBeGreaterThan(v * 0.9);
    expect(Math.max(...vel)).toBeLessThan(v * 1.1);
  });

  it('a re-issued Move that turns more than 30° starts a new lead', () => {
    const p = new Predictor();
    p.move(10_000, 0, 0);
    const o = (t: number) => p.offset({ x: 0, y: 0, locked: false, speed: 160, moving: true }, 300, t);
    for (let t = 0; t <= 200; t += 16) o(t);
    expect(p.leading).toBe(true);
    // 20° off: the lead keeps its age (no pull back)
    p.move(10_000, 3640, 208);
    const kept = o(224);
    expect(Math.hypot(kept.dx, kept.dy)).toBeGreaterThan(800);
    // 90° off: a new lead, blended from the shown one
    p.move(0, 10_000, 240);
    for (let t = 240; t <= 240 + 140; t += 16) o(t);
    const fresh = o(400);
    expect(fresh.dy).toBeLessThan((160 * 170) / (1000 / 30) + 1);
    expect(fresh.dx).toBeLessThan(1);
  });
});

