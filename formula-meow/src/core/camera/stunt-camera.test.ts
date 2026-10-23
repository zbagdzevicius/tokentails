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

function soloBefore(kind: 'loop' | 'wall' | 'jump' | 'tunnel', back: number): SimWorld {
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
    let exitTick = -1;
    let upAfterExit = -1;
    let minEntryLift = 99;
    const pose: StuntPose = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
    for (let n = 0; n < 60 * 6; n++) {
      const was = k.rail;
      w.step([input({ gas: true })]);
      frame();
      const up = cam.upVector;
      const ang = Math.acos(Math.max(-1, Math.min(1, prev.dot(up))));
      maxRate = Math.max(maxRate, ang * 60);
      prev.copy(up);
      minUpY = Math.min(minUpY, up.y);
      if (k.rail > 0) railed++;
      // playtest B1: just past the zone start the rig (7.5 m back on the ribbon) collapsed to deck height
      if (k.rail > 0 && k.su > 0.5 && k.su < 7 && kartStuntPose(w.track, k, pose)) {
        const c = cam.cam.position;
        minEntryLift = Math.min(minEntryLift, (c.x - pose.x) * pose.ux + (c.y - pose.y) * pose.uy + (c.z - pose.z) * pose.uz);
      }
      if (was > 0 && k.rail === 0) exitTick = n;
      if (exitTick >= 0 && n === exitTick + 18) upAfterExit = up.y;
    }
    expect(railed).toBeGreaterThan(60);
    // the cap follows the pitch rate on the rail (speed / radius × margin), never a snap
    expect(maxRate).toBeLessThanOrEqual(12);
    expect(minEntryLift).toBeGreaterThan(1);
    // playtest B3: no longer upside down after the exit (0.3 s later the up is near the world's)
    expect(upAfterExit).toBeGreaterThan(0.8);
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

  it('reduced motion: the TV camera stands where the race view says for that loop (its clearest spot)', () => {
    const w = soloBefore('loop', 10);
    const { cam, frame } = rig(w, true);
    const k = w.st.karts[0];
    const asked: number[] = [];
    cam.source!.tvSpot = (pi, out) => {
      asked.push(pi);
      const pc = w.track.pieces[pi];
      Object.assign(out, { x: w.track.px[pc.i0] + 3, y: 30, z: w.track.pz[pc.i0] - 4 });
      return true;
    };
    let railed = 0;
    for (let n = 0; n < 60 * 6; n++) {
      w.step([input({ gas: true })]);
      frame();
      if (k.rail > 0) {
        railed++;
        const pc = w.track.pieces[k.rail - 1];
        expect(cam.cam.position.distanceTo(new Vector3(w.track.px[pc.i0] + 3, 30, w.track.pz[pc.i0] - 4))).toBeLessThan(1e-6);
      }
    }
    expect(railed).toBeGreaterThan(60);
    expect(new Set(asked).size).toBe(1);
    expect(w.track.pieces[asked[0]].kind).toBe('loop');
  });

  it('juice: inside a loop the view rolls at most STUNT_CAM.loopRoll degrees, and the FOV opens by loopFov', () => {
    const w = soloBefore('loop', 10);
    const { cam, frame } = rig(w, false);
    const k = w.st.karts[0];
    let maxRoll = 0;
    let maxFov = -99;
    let railed = 0;
    for (let n = 0; n < 60 * 6; n++) {
      // a steering thumb on the rail moves sd (the corkscrew sway and the lateral offset are what could roll)
      w.step([input({ gas: true, steer: n % 90 < 45 ? 7 : -7 })]);
      frame();
      if (k.rail > 0) {
        railed++;
        maxRoll = Math.max(maxRoll, Math.abs(cam.loopRollDeg(k.si)));
        maxFov = Math.max(maxFov, cam.stuntFeel.fov);
      }
    }
    expect(railed).toBeGreaterThan(60);
    expect(maxRoll).toBeLessThanOrEqual(STUNT_CAM.loopRoll + 1e-6);
    expect(maxFov).toBeGreaterThan(STUNT_CAM.loopFov * 0.8);
    // after the exit the FOV term settles back
    for (let n = 0; n < 120; n++) {
      w.step([input({ gas: true })]);
      frame();
    }
    expect(Math.abs(cam.stuntFeel.fov)).toBeLessThan(1);
  });

  it('juice: a jump gap lifts the rig, leans the look toward the landing ring and opens the FOV; no slow-mo', () => {
    const w = soloBefore('jump', 30);
    const { cam, frame } = rig(w, false);
    const k = w.st.karts[0];
    let flown = 0;
    let maxAir = 0;
    let maxFov = 0;
    for (let n = 0; n < 60 * 4; n++) {
      w.step([input({ gas: true })]);
      frame();
      if (k.gapLaunch > 0) flown++;
      maxAir = Math.max(maxAir, cam.stuntFeel.air);
      maxFov = Math.max(maxFov, cam.stuntFeel.fov);
    }
    expect(flown).toBeGreaterThan(20);
    expect(maxAir).toBeGreaterThan(0.8);
    expect(maxFov).toBeGreaterThan(STUNT_CAM.airFov * 0.7);
    expect(maxFov).toBeLessThanOrEqual(STUNT_CAM.airFov + 1e-6);
    expect(cam.stuntFeel.air).toBeLessThan(0.05);
  });

  it('juice: a tunnel tightens the FOV and closes the rig in, blended at the portals; reduced motion keeps the FOV', () => {
    for (const reduced of [false, true]) {
      const w = soloBefore('tunnel', 20);
      const { cam, frame } = rig(w, reduced);
      const k = w.st.karts[0];
      let inside = 0;
      let minFov = 0;
      let maxStep = 0;
      let last = 0;
      for (let n = 0; n < 60 * 4; n++) {
        w.step([input({ gas: true })]);
        frame();
        if (w.track.tunnelMask[k.si]) inside++;
        const tk = cam.stuntFeel.tunnel;
        maxStep = Math.max(maxStep, Math.abs(tk - last));
        last = tk;
        minFov = Math.min(minFov, cam.stuntFeel.fov);
      }
      expect(inside).toBeGreaterThan(20);
      // the blend takes STUNT_CAM.tunnelBlend s, never a cut
      expect(maxStep).toBeLessThanOrEqual(1 / 60 / STUNT_CAM.tunnelBlend + 1e-9);
      if (reduced) expect(minFov).toBe(0);
      else expect(minFov).toBeLessThan(STUNT_CAM.tunnelFov * 0.8);
    }
  });
});
