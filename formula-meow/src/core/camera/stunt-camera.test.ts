/**
 * Set-piece camera comfort (SIM_VERSION 8, SETPIECES.md section 8): through the stunt lab's loop the camera's up follows
 * the surface (upside down at the top) but never turns faster than STUNT_CAM.upRate; on a wall lane it rolls at most
 * STUNT_CAM.wallRoll; with reduced motion the up stays the world's and a loop is watched from a still TV camera.
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { TickInput } from '../../types';
import { raceConfig, stuntLab, world } from '../../test/fixtures';
import { GO_TICK, type SimWorld } from '../sim/world';
import { placeOnTrack, speedOf } from '../sim/kart';
import { kartStuntPose, type StuntPose } from '../render/stunt-pose';
import { ChaseCamera, STUNT_CAM } from './chase-camera';

const input = (p: Partial<TickInput> = {}): TickInput => ({ steer: 0, gas: false, brake: false, drift: false, item: false, itemBack: false, ...p });
const DEG = Math.PI / 180;

function rig(w: SimWorld, reduced: boolean): { cam: ChaseCamera; frame: () => void } {
  const cam = new ChaseCamera(390 / 844);
  cam.feel.reducedMotion = reduced;
  const k = w.st.karts[0];
  const pose: StuntPose = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
  const at = () => (kartStuntPose(w.track, k, pose) ? pose : null);
  cam.source = {
    track: w.track,
    me: 0,
    displayPos: (_i, out) => Object.assign(out, { x: k.x, y: k.y, z: k.z, heading: k.heading }),
    displayBasis: (_i, out) => {
      const p = at();
      if (!p) return false;
      Object.assign(out, { ux: p.ux, uy: p.uy, uz: p.uz, fx: p.fx, fy: p.fy, fz: p.fz });
      return true;
    },
  };
  const frame = () => {
    const p = at();
    cam.update(k, p ? p.x : k.x, p ? p.y : k.y, p ? p.z : k.z, k.heading, speedOf(k), 24, 1 / 60);
  };
  return { cam, frame };
}

function soloBefore(kind: 'loop' | 'wall', back: number): SimWorld {
  const w = world(raceConfig(stuntLab(), { humans: [0], solo: true }));
  while (w.tick < GO_TICK) w.step([input()]);
  const t = w.track;
  const pc = t.pieces.find((p) => p.kind === kind)!;
  const k = w.st.karts[0];
  const i = ((kind === 'loop' ? pc.strip : pc.i0) - Math.round(back / t.step) + t.n) % t.n;
  placeOnTrack(w.ctx, k, i, 0);
  k.vx = t.tx[i] * 22;
  k.vz = t.tz[i] * 22;
  k.dist = i * t.step;
  k.progDist = k.dist;
  return w;
}

describe('set-piece camera (SIM_VERSION 8)', () => {
  it('through a loop the up follows the surface, never faster than the comfort rate', () => {
    const w = soloBefore('loop', 10);
    const { cam, frame } = rig(w, false);
    const k = w.st.karts[0];
    const prev = new Vector3(0, 1, 0);
    let maxRate = 0;
    let minUpY = 1;
    let railed = 0;
    for (let n = 0; n < 60 * 6; n++) {
      w.step([input({ gas: true })]);
      frame();
      const up = cam.upVector;
      const ang = Math.acos(Math.max(-1, Math.min(1, prev.dot(up))));
      maxRate = Math.max(maxRate, ang * 60);
      prev.copy(up);
      minUpY = Math.min(minUpY, up.y);
      if (k.rail > 0) railed++;
    }
    expect(railed).toBeGreaterThan(60);
    expect(maxRate).toBeLessThanOrEqual(STUNT_CAM.upRate * DEG + 1e-6);
    // it really went round: upside down at the top
    expect(minUpY).toBeLessThan(-0.5);
    // and back to the world's up after the exit
    expect(cam.upVector.y).toBeGreaterThan(0.999);
  });

  it('on a wall lane the camera rolls at most STUNT_CAM.wallRoll degrees', () => {
    const w = soloBefore('wall', 6);
    const { cam, frame } = rig(w, false);
    const k = w.st.karts[0];
    let maxRoll = 0;
    let onLane = 0;
    for (let n = 0; n < 60 * 4; n++) {
      w.step([input({ gas: true, steer: n < 30 ? 4 : 0 })]);
      frame();
      if (k.surface === 6) onLane++;
      maxRoll = Math.max(maxRoll, Math.acos(Math.min(1, cam.upVector.y)));
    }
    expect(onLane).toBeGreaterThan(30);
    expect(maxRoll).toBeGreaterThan(3 * DEG);
    expect(maxRoll).toBeLessThanOrEqual(STUNT_CAM.wallRoll * DEG + 1e-6);
  });

  it('reduced motion: world up always, and the loop is watched from a still TV camera', () => {
    const w = soloBefore('loop', 10);
    const { cam, frame } = rig(w, true);
    const k = w.st.karts[0];
    const tv: Vector3[] = [];
    for (let n = 0; n < 60 * 6; n++) {
      w.step([input({ gas: true })]);
      frame();
      expect(cam.upVector.y).toBeCloseTo(1, 9);
      if (k.rail > 0) tv.push(cam.cam.position.clone());
    }
    expect(tv.length).toBeGreaterThan(60);
    for (const p of tv) expect(p.distanceTo(tv[0])).toBeLessThan(1e-6);
  });
});
