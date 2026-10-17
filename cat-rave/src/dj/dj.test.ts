import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { BeatInfo } from '../types';
import { layoutBubble } from './bubble';
import { BOW_FLOOR_Y, BOW_REST, BOW_SHRINK, BOW_TUMBLE_MAX, BowSim } from './confetti-sim';
import { RIG, computePose, createPose, nodCurve, solveTwoBone, swordEnvelope } from './motion';

const beat = (o: Partial<BeatInfo> = {}): BeatInfo => ({
  bpm: 136,
  beat: 0,
  bar: 0,
  beatInBar: 0,
  phase: 0,
  section: 'groove',
  sectionProgress: 0,
  energy: 0.6,
  kick: 1,
  hat: 0,
  held: false,
  ...o,
});

/** Deterministic rng. */
function lcg(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe('two-bone IK', () => {
  const a = RIG.upperArm;
  const b = RIG.foreArm;
  const shoulder = new Vector3(0.16, 0.28, 0.06);
  const pole = new Vector3(1, -0.7, -0.5).normalize();

  it('reaches a target in range with exact bone lengths', () => {
    const target = new Vector3(0.3, 0.1, 0.35);
    const elbow = new Vector3();
    const end = new Vector3();
    solveTwoBone(shoulder, target, a, b, pole, elbow, end);
    expect(end.distanceTo(target)).toBeLessThan(1e-5);
    expect(elbow.distanceTo(shoulder)).toBeCloseTo(a, 5);
    expect(end.distanceTo(elbow)).toBeCloseTo(b, 5);
    // Elbow bends towards the pole side.
    expect(elbow.clone().sub(shoulder).dot(pole)).toBeGreaterThan(0);
  });

  it('clamps an unreachable target onto the line at full reach', () => {
    const target = new Vector3(2, 2, 2);
    const elbow = new Vector3();
    const end = new Vector3();
    solveTwoBone(shoulder, target, a, b, pole, elbow, end);
    expect(end.distanceTo(shoulder)).toBeCloseTo(a + b, 3);
    const dir = target.clone().sub(shoulder).normalize();
    expect(end.clone().sub(shoulder).normalize().dot(dir)).toBeGreaterThan(0.9999);
  });

  it('survives a target on the shoulder and a pole parallel to the arm', () => {
    const elbow = new Vector3();
    const end = new Vector3();
    solveTwoBone(shoulder, shoulder.clone(), a, b, pole, elbow, end);
    expect(Number.isFinite(elbow.x + elbow.y + elbow.z + end.x + end.y + end.z)).toBe(true);
    const t = shoulder.clone().add(new Vector3(0, 0.3, 0));
    solveTwoBone(shoulder, t, a, b, new Vector3(0, 1, 0), elbow, end);
    expect(end.distanceTo(t)).toBeLessThan(1e-5);
    expect(elbow.distanceTo(shoulder)).toBeCloseTo(a, 5);
  });
});

describe('beat curves', () => {
  it('nod is 0 on the kick, peaks right after it, and is continuous across beats', () => {
    expect(nodCurve(0)).toBe(0);
    expect(nodCurve(0.12)).toBeCloseTo(1, 5);
    expect(nodCurve(0.999)).toBeLessThan(0.001);
    expect(nodCurve(1.12)).toBeCloseTo(1, 5);
  });

  it('sword envelope: overshoots on the raise, holds, then lowers to 0', () => {
    expect(swordEnvelope(-0.1)).toBe(0);
    expect(swordEnvelope(0)).toBe(0);
    const peak = Math.max(...Array.from({ length: 70 }, (_, i) => swordEnvelope(i / 1000)));
    expect(peak).toBeGreaterThan(1);
    expect(swordEnvelope(0.5)).toBe(1);
    expect(swordEnvelope(1)).toBeCloseTo(0, 5);
    expect(swordEnvelope(1.1)).toBe(0);
  });
});

describe('pose', () => {
  it('groove: both paws on the decks', () => {
    const p = computePose({ beat: beat(), time: 1, swordP: -1, pointDir: null, pointK: 0, pointYaw: 0 }, createPose());
    expect(p.right.w).toBe(0);
    expect(p.left.w).toBe(0);
    expect(p.sword).toBe(0);
  });

  it('sword: right paw goes overhead in body space, eyes wide, mouth open', () => {
    const p = computePose({ beat: beat({ section: 'drop', energy: 1 }), time: 1, swordP: 0.5, pointDir: null, pointK: 0, pointYaw: 0 }, createPose());
    expect(p.right.w).toBe(1);
    expect(p.right.body.y).toBeGreaterThan(RIG.shoulderR[1] + 0.3);
    expect(p.sword).toBe(1);
    expect(p.eyes).toBe('wide');
    expect(p.mouth).toBeGreaterThan(0.5);
  });

  it('build (or hold): both paws on the channel faders', () => {
    const p = computePose({ beat: beat({ held: true }), time: 1, swordP: -1, pointDir: null, pointK: 0, pointYaw: 0 }, createPose());
    expect(p.right.deck.x).toBeLessThan(0);
    expect(p.left.deck.x).toBeGreaterThan(0);
    expect(Math.abs(p.right.deck.x)).toBeLessThan(0.15);
    expect(p.lean).toBeGreaterThan(0.15);
  });

  it('breakdown: happy eyes and a paw in the air', () => {
    const p = computePose({ beat: beat({ section: 'breakdown', energy: 0.3 }), time: 1, swordP: -1, pointDir: null, pointK: 0, pointYaw: 0 }, createPose());
    expect(p.eyes).toBe('happy');
    expect(p.left.w).toBe(1);
  });

  it('point: right arm reaches along the direction and the head turns', () => {
    const dir = new Vector3(0.5, 0, 1).normalize();
    const p = computePose({ beat: beat(), time: 1, swordP: -1, pointDir: dir, pointK: 1, pointYaw: 0.6 }, createPose());
    expect(p.right.w).toBe(1);
    const s = new Vector3(...RIG.shoulderR);
    expect(p.right.body.clone().sub(s).normalize().dot(dir)).toBeGreaterThan(0.999);
    expect(p.headYaw).toBeCloseTo(0.6, 5);
    const l = computePose({ beat: beat(), time: 1, swordP: -1, pointDir: dir, pointLeft: true, pointK: 1, pointYaw: 0.6 }, createPose());
    expect(l.left.w).toBe(1);
    expect(l.right.w).toBe(0);
  });

  it('the sword wins over pointing', () => {
    const dir = new Vector3(1, 0, 0);
    const p = computePose({ beat: beat({ section: 'drop' }), time: 1, swordP: 0.5, pointDir: dir, pointK: 1, pointYaw: 0.9 }, createPose());
    expect(p.right.body.y).toBeGreaterThan(0.6);
  });
});

describe('bow confetti sim', () => {
  const burst = { cx: 0, cy: 1.1, cz: 0, radius: 9, cannon: 0.35 };

  it('caps spawns at the limit and recycles landed bows for a new drop', () => {
    const sim = new BowSim(100, 40);
    expect(sim.burst(60, burst, lcg(1))).toBe(40);
    expect(sim.count).toBe(40);
    for (let i = 0; i < 400; i++) sim.step(1 / 60);
    // Bows on the floor (and free room) are reused by a new burst; airborne ones are kept.
    const landed = Array.from({ length: sim.count }, (_, i) => sim.landed[i] >= 0).filter(Boolean).length;
    expect(landed).toBeGreaterThan(5);
    const room = 40 - sim.count;
    expect(sim.burst(20, burst, lcg(2))).toBe(Math.min(20, room + landed));
    expect(sim.count).toBeLessThanOrEqual(40);
  });

  it('falls slowly, lands flat on the floor, then disappears', () => {
    const sim = new BowSim(200);
    sim.burst(200, { ...burst, cannon: 0 }, lcg(3));
    let maxDown = 0;
    for (let i = 0; i < 60; i++) {
      sim.step(1 / 60);
      for (let k = 0; k < sim.count; k++) if (sim.landed[k] < 0) maxDown = Math.max(maxDown, -sim.vel[k * 3 + 1]);
    }
    // Ribbon-light: terminal speed well under free fall.
    expect(maxDown).toBeLessThan(2.2);
    // Airborne bows only tilt ±35° from facing the camera (never edge-on petals).
    for (let k = 0; k < sim.count; k++) {
      if (sim.landed[k] >= 0) continue;
      for (let a = 0; a < 3; a++) expect(Math.abs(sim.rot[k * 3 + a])).toBeLessThanOrEqual(BOW_TUMBLE_MAX + 1e-6);
    }
    for (let i = 0; i < 60 * 12; i++) sim.step(1 / 60);
    for (let k = 0; k < sim.count; k++) {
      expect(sim.pos[k * 3 + 1]).toBeGreaterThanOrEqual(BOW_FLOOR_Y - 1e-6);
      if (sim.landed[k] >= 0) expect(sim.rot[k * 3]).toBeCloseTo(-Math.PI / 2, 5);
    }
    for (let i = 0; i < 60 * (BOW_REST + BOW_SHRINK + 15); i++) sim.step(1 / 60);
    expect(sim.count).toBe(0);
  });

  it('lowering the limit trims live bows', () => {
    const sim = new BowSim(100);
    sim.burst(100, burst, lcg(4));
    sim.setLimit(30);
    expect(sim.count).toBe(30);
    expect(sim.burst(10, burst, lcg(5))).toBeLessThanOrEqual(10);
    expect(sim.count).toBeLessThanOrEqual(30);
  });
});

describe('speech bubble layout', () => {
  const measure = (s: string, px: number) => s.length * px * 0.62;

  it('fits a short line big and wraps a long one', () => {
    const short = layoutBubble('DROP IT!', measure, 600, 200);
    expect(short.lines).toEqual(['DROP IT!']);
    expect(short.px).toBeGreaterThanOrEqual(80);
    const long = layoutBubble('CAT #10 JUST LANDED! THANKS TO A WALLET GIFT ON ARC', measure, 600, 200);
    expect(long.lines.length).toBeGreaterThan(1);
    expect(long.lines.length).toBeLessThanOrEqual(3);
    for (const l of long.lines) expect(measure(l, long.px)).toBeLessThanOrEqual(600);
  });
});
