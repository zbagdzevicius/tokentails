import { describe, expect, it } from 'vitest';
import type { BeatInfo, Section } from '../types';
import { FlashEnvelope, aimToDir, autoLaserMode, beamSplit, beamViolet, laserAim, spotPath, strobeOn } from './show';
import { hazeDepths } from './haze';

const beat = (section: Section, extra: Partial<BeatInfo> = {}): BeatInfo => ({
  bpm: 136, beat: 10.25, bar: 2, beatInBar: 2, phase: 0.25, section, sectionProgress: 0.5,
  energy: 0.6, kick: 0.3, hat: 0.1, held: false, ...extra,
});

describe('world show', () => {
  it('picks laser modes from the music, never strobes with reduced motion', () => {
    expect(autoLaserMode(beat('intro'))).toBe('idle');
    expect(autoLaserMode(beat('groove'))).toBe('sweep');
    expect(autoLaserMode(beat('build'))).toBe('fan');
    expect(autoLaserMode(beat('groove', { held: true }))).toBe('fan');
    expect(autoLaserMode(beat('drop', { sectionProgress: 0 }))).toBe('strobe');
    expect(autoLaserMode(beat('drop', { sectionProgress: 0 }), true)).toBe('sweep');
    expect(autoLaserMode(beat('breakdown'))).toBe('idle');
  });

  it('aims side beams up and outwards (15–80° off vertical, never across the centre)', () => {
    const d = { x: 0, y: 0, z: 0 };
    for (const mode of ['idle', 'sweep', 'fan', 'strobe'] as const)
      for (const side of [-1, 1] as const)
        for (let k = 0; k < 6; k++) {
          const a = laserAim(mode, side, k, 6, beat('drop'));
          aimToDir(a.yaw, a.pitch, d);
          expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
          expect(Math.sign(d.x)).toBe(side);
          const off = Math.acos(d.y);
          expect(off).toBeGreaterThanOrEqual((15 * Math.PI) / 180 - 1e-9);
          expect(off).toBeLessThanOrEqual((80 * Math.PI) / 180 + 1e-9);
          expect(a.pitch).toBeGreaterThan(0);
          expect(a.pitch).toBeLessThan(Math.PI / 2);
          expect(Number.isFinite(a.intensity)).toBe(true);
          expect(a.intensity).toBeGreaterThanOrEqual(0);
        }
    // Centre spike points (almost) straight up.
    expect(laserAim('sweep', 0, 0, 2, beat('groove')).pitch).toBeGreaterThan(1.1);
  });

  it('strobes at most at 8th notes', () => {
    let toggles = 0;
    let prev = strobeOn(beat('drop', { beat: 0 }));
    for (let i = 1; i <= 1000; i++) {
      const on = strobeOn(beat('drop', { beat: i / 250 })); // 4 beats
      if (on !== prev) toggles++;
      prev = on;
    }
    expect(toggles).toBeLessThanOrEqual(16);
  });

  it('rate-limits flashes to 3 per second and decays', () => {
    const f = new FlashEnvelope();
    let started = 0;
    for (let t = 0; t < 1; t += 0.05) if (f.trigger(t, [1, 0, 0], 1)) started++;
    expect(started).toBeLessThanOrEqual(3);
    f.step(2);
    expect(f.level).toBe(0);
  });

  it('keeps spot targets on the floor near the crowd', () => {
    for (let i = 0; i < 4; i++) {
      const p = spotPath(i, 4, beat('drop', { beat: i * 37.3 }), 12);
      expect(Math.hypot(p.x, p.z - 1.5)).toBeLessThan(13);
    }
  });

  it('splits laser budgets and haze layers sensibly', () => {
    expect(beamSplit(4).reduce((a, b) => a + b)).toBeLessThanOrEqual(24);
    expect(beamSplit(12).reduce((a, b) => a + b)).toBeLessThanOrEqual(24);
    expect(beamSplit(6)).toEqual([3, 1, 3]);
    expect(beamSplit(8)).toEqual([4, 1, 4]);
    // Violet to green 1:3 with 4 beams per rig.
    let violet = 0;
    for (const side of [-1, 1] as const) for (let k = 0; k < 4; k++) if (beamViolet(side, k, 4, 0, false)) violet++;
    expect(violet).toBe(2);
    expect(hazeDepths(1)).toHaveLength(1);
    expect(hazeDepths(3)).toHaveLength(3);
  });
});
