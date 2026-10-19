/**
 * Feel lane render checks that run headless (three.js builds geometry in Node): every body and hat builds, the kart
 * animation never produces NaN in any state, the respawn carry starts at the kart and ends where the sim puts it, and
 * the camera modes behave.
 */
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { DEFAULT_CAT, type BodyId, type KartState, type RacerInfo } from '../../types';
import { BODY_IDS, HAT_IDS } from '../../content/ids';
import { KART_BODIES } from '../../content/karts';
import { KITCHEN, ROOFTOPS } from '../track/tracks';
import { buildTrack } from '../track/build';
import { newKart } from '../sim/kart';
import { raceConfig, world } from '../../test/fixtures';
import { GO_TICK } from '../sim/world';
import { bodyGeo } from './kart-bodies';
import { buildHat } from './hats';
import { KartView } from './kart-view';
import { carryPose, respawnSpot } from './respawn-hand';
import { ChaseCamera, ORBIT } from '../camera/chase-camera';
import { autoFlyover, flyoverKeys } from '../camera/flyover';

const look = (body: number) => ({ body: body as BodyId, paint: [0xff5a5f, 0xfff3dc, 0x2a1a22] as [number, number, number], number: 7 });
const racer = (body = 0, hat = 0): RacerInfo => ({ name: 'Test', cat: DEFAULT_CAT, kart: look(body), hat });

describe('kart bodies and hats', () => {
  it('every body id builds a distinct, non-empty mesh with the shared exhaust pipes', () => {
    const sizes = new Set<number>();
    for (const id of BODY_IDS) {
      const g = bodyGeo(look(id)).build();
      const n = g.getAttribute('position').count;
      expect(n).toBeGreaterThan(300);
      sizes.add(n);
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      // kart-sized: about 2 m long, under 1.6 m tall (teacup tag included)
      expect(bb.max.z - bb.min.z).toBeGreaterThan(1.8);
      expect(bb.max.y).toBeLessThan(1.8);
      g.dispose();
    }
    expect(sizes.size).toBe(6);
  });

  it('every hat id but "none" builds a hat; the propeller spins', () => {
    expect(buildHat(0)).toBeNull();
    for (let i = 1; i < HAT_IDS.length; i++) {
      const h = buildHat(i);
      expect(h, HAT_IDS[i]).not.toBeNull();
    }
    expect(buildHat(HAT_IDS.indexOf('propeller'))!.userData.blades).toBeTruthy();
  });

  it('body stats stay inside the 1..5 steps and the 0.8..1.3 weight, and no body is best at everything', () => {
    for (const id of BODY_IDS) {
      const b = KART_BODIES[id];
      for (const v of [b.speed, b.accel, b.handling]) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(5);
      }
      expect(b.weight).toBeGreaterThanOrEqual(0.8);
      expect(b.weight).toBeLessThanOrEqual(1.3);
      // a stat point above 3 is paid for somewhere
      expect(b.speed + b.accel + b.handling).toBeLessThanOrEqual(10);
    }
  });
});

describe('kart animation', () => {
  function anyNaN(v: KartView): boolean {
    let bad = false;
    v.root.traverse((o) => {
      for (const n of [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z]) if (!Number.isFinite(n)) bad = true;
    });
    return bad;
  }

  it('poses every hit, boost, drift, air, item and finish state without NaN', () => {
    const v = new KartView(racer(4, 5));
    const k: KartState = newKart();
    const states: Array<Partial<KartState>> = [
      {},
      { driftDir: 1, driftTier: 3, steer: 0.8 },
      { boostTicks: 40, boostLevel: 1.35 },
      { hopTicks: 5 },
      { air: 1 },
      { air: 0 },
      { spinTicks: 50 },
      { leapTicks: 30, air: 1 },
      { wobbleTicks: 30 },
      { chaseTicks: 20 },
      { shieldTicks: 100 },
      { autoTicks: 100, boostTicks: 100 },
    ];
    for (const s of states) {
      Object.assign(k, newKart(), s);
      for (let f = 0; f < 20; f++) v.update(k, 1, 0, 2, 0.3, 0, 0, 20, 1 / 60, 26);
      expect(anyNaN(v)).toBe(false);
    }
    v.lookAtDot(5, 5);
    for (const type of ['overtake', 'trick', 'itemUse', 'hit', 'wall', 'finish'] as const) {
      v.onEvent({ tick: 0, type, kart: 0, a: 1, item: 'hairball' });
      for (let f = 0; f < 30; f++) v.update(k, 1, 0, 2, 0.3, 0, 0, 20, 1 / 60, 26);
      expect(anyNaN(v)).toBe(false);
    }
    v.dispose();
  });

  it('a drift leans the kart 0.28 rad into the turn and counter-steers the front wheels', () => {
    const v = new KartView(racer());
    const k = Object.assign(newKart(), { driftDir: 1, steer: 1 });
    for (let f = 0; f < 120; f++) v.update(k, 0, 0, 0, 0, 0, 0, 20, 1 / 60, 26);
    expect(v.body.rotation.z).toBeCloseTo(0.28, 2);
    expect(v.frontPivot.rotation.y).toBeCloseTo(0.35, 2);
    v.dispose();
  });

  it('a boost stretches the kart (z 1.12, y 0.92)', () => {
    const v = new KartView(racer());
    const k = Object.assign(newKart(), { boostTicks: 600, boostLevel: 1.3 });
    for (let f = 0; f < 120; f++) v.update(k, 0, 0, 0, 0, 0, 0, 20, 1 / 60, 26);
    expect(v.body.scale.z).toBeCloseTo(1.12, 2);
    expect(v.body.scale.y).toBeCloseTo(0.92, 2);
    v.dispose();
  });
});

describe('respawn carry', () => {
  it('starts on the kart, rises in the middle and ends on the respawn spot facing forward', () => {
    const t = buildTrack(KITCHEN, 0);
    const from = { x: t.px[300] + 3, y: t.py[300], z: t.pz[300], heading: 1 };
    const spot = { x: 0, y: 0, z: 0, heading: 0 };
    respawnSpot(t, 300, spot);
    const pose = { x: 0, y: 0, z: 0, heading: 0, hx: 0, hy: 0, hz: 0, hVisible: false };
    carryPose(t, 300, from, 72, pose);
    expect(pose.x).toBeCloseTo(from.x, 6);
    expect(pose.z).toBeCloseTo(from.z, 6);
    expect(pose.hy).toBeGreaterThan(from.y + 5); // the hand is still coming down
    carryPose(t, 300, from, 36, pose);
    expect(pose.y).toBeGreaterThan(Math.max(from.y, spot.y) + 2);
    carryPose(t, 300, from, 0, pose);
    expect(pose.x).toBeCloseTo(spot.x, 6);
    expect(pose.z).toBeCloseTo(spot.z, 6);
    expect(pose.heading).toBeCloseTo(spot.heading, 6);
  });

  it('matches where the sim puts the kart back', () => {
    // one kart alone (no contact can push it after it is placed)
    const w = world(raceConfig(KITCHEN, { seed: 4, solo: true }));
    while (w.tick < GO_TICK + 200) w.step();
    const k = w.st.karts[0];
    const spot = { x: 0, y: 0, z: 0, heading: 0 };
    respawnSpot(w.track, k.si, spot);
    k.respawnTicks = 1;
    w.step();
    expect(k.respawnTicks).toBe(0);
    expect(k.x).toBeCloseTo(spot.x, 6);
    expect(k.z).toBeCloseTo(spot.z, 6);
  });
});

describe('camera modes', () => {
  const t = buildTrack(ROOFTOPS, 0);
  const k = Object.assign(newKart(), { x: t.px[10], y: t.py[10], z: t.pz[10], heading: Math.atan2(t.tx[10], t.tz[10]), si: 10 });

  it('auto flyover: 4 keys over 3.5 s, ordered in time, ending behind the grid', () => {
    const keys = autoFlyover(t, { x: k.x, y: k.y, z: k.z, heading: k.heading, si: 10 });
    expect(keys.length).toBe(4);
    for (let i = 1; i < keys.length; i++) expect(keys[i].t).toBeGreaterThan(keys[i - 1].t);
    expect(keys[keys.length - 1].t).toBeCloseTo(3.5, 6);
    const last = keys[keys.length - 1];
    const back = (last.x - k.x) * Math.sin(k.heading) + (last.z - k.z) * Math.cos(k.heading);
    expect(back).toBeLessThan(0);
    // own keys are used (and mirrored) when the track has them
    const own = { ...t, def: { ...t.def, flyover: [keys[0], keys[1]] }, mirrored: true };
    const m = flyoverKeys(own, { x: k.x, y: k.y, z: k.z, heading: k.heading });
    expect(m[0].x).toBeCloseTo(-keys[0].x, 6);
  });

  it('a flyover runs, then hands over to the chase rig and calls onDone; skip() cuts it short', () => {
    const cam = new ChaseCamera(390 / 844);
    cam.source = { track: t, me: 0, displayPos: () => k };
    let done = 0;
    cam.setMode('flyover', { keys: autoFlyover(t, { x: k.x, y: k.y, z: k.z, heading: k.heading, si: 10 }), onDone: () => done++ });
    for (let f = 0; f < 60; f++) cam.update(k, k.x, k.y, k.z, k.heading, 0, 26, 1 / 60);
    expect(cam.mode).toBe('flyover');
    cam.skip();
    for (let f = 0; f < 60; f++) cam.update(k, k.x, k.y, k.z, k.heading, 0, 26, 1 / 60);
    expect(cam.mode).toBe('chase');
    expect(done).toBe(1);
    // without keys a flyover is just the chase rig
    cam.setMode('flyover', {});
    expect(cam.mode).toBe('chase');
  });

  it('the finish orbit ends in front of the kart at 3 m', () => {
    const cam = new ChaseCamera(390 / 844);
    for (let f = 0; f < 30; f++) cam.update(k, k.x, k.y, k.z, k.heading, 0, 26, 1 / 60);
    cam.setMode('finishOrbit');
    for (let f = 0; f < 60 * (ORBIT.time + 0.5); f++) cam.update(k, k.x, k.y, k.z, k.heading, 0, 26, 1 / 60);
    const p = cam.cam.position;
    const fwd = (p.x - k.x) * Math.sin(k.heading) + (p.z - k.z) * Math.cos(k.heading);
    expect(fwd).toBeGreaterThan(1.5);
    expect(Math.hypot(p.x - k.x, p.z - k.z)).toBeCloseTo(ORBIT.radius, 0);
  });

  it('the chase camera never sits outside the track walls (B59: scenery lives there)', () => {
    const cam = new ChaseCamera(390 / 844);
    cam.source = { track: t, me: 0, displayPos: () => k };
    // a kart hugging the left wall, facing across the road: the rig behind it would be outside
    for (let i = 0; i < t.n; i += 37) {
      const lat = -(t.wallL[i] - 1);
      const kk = Object.assign(newKart(), { x: t.px[i] - t.tz[i] * lat, z: t.pz[i] + t.tx[i] * lat, y: t.py[i], si: i, heading: Math.atan2(t.tx[i], t.tz[i]) - 1.2 });
      cam.snap(kk.x, kk.y, kk.z, kk.heading);
      for (let f = 0; f < 90; f++) cam.update(kk, kk.x, kk.y, kk.z, kk.heading, 0, 26, 1 / 60);
      const p = cam.cam.position;
      const ox = p.x - t.px[i];
      const oz = p.z - t.pz[i];
      // lateral offset from the nearby centre line, roughly (bends make it approximate): inside the wall plus a margin
      const d = ox * -t.tz[i] + oz * t.tx[i];
      expect(Math.abs(d)).toBeLessThan(Math.max(t.wallL[i], t.wallR[i]) + 1.5);
    }
  });

  it('podium and attract keep the camera near their target', () => {
    const cam = new ChaseCamera(1);
    cam.setMode('podium', { x: 10, y: 0, z: 10, radius: 6 });
    for (let f = 0; f < 60; f++) cam.update(k, k.x, k.y, k.z, k.heading, 0, 26, 1 / 60);
    expect(Math.hypot(cam.cam.position.x - 10, cam.cam.position.z - 10)).toBeCloseTo(6, 0);
    cam.setMode('attract');
    for (let f = 0; f < 600; f++) cam.update(k, k.x, k.y, k.z, k.heading, 0, 26, 1 / 60);
    expect(Math.hypot(cam.cam.position.x - k.x, cam.cam.position.z - k.z)).toBeLessThan(9);
  });
});

describe('render scene builds in Node', () => {
  it('a KartView for every body joins a scene and disposes', () => {
    const scene = new Scene();
    for (const id of BODY_IDS) {
      const v = new KartView(racer(id, (id % 8) + 1));
      scene.add(v.root);
      v.dispose();
      scene.remove(v.root);
    }
    expect(scene.children.length).toBe(0);
  });
});
