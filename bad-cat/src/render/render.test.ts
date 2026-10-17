import { describe, expect, it } from 'vitest';
import { Box3, Mesh, PerspectiveCamera, Vector3, MeshLambertMaterial } from 'three';
import { CLIP_H, CLIP_W, DEFAULT_CAT, FACE_RECT, HumanSt, PROP_KINDS, PropSt, rgb565, type ClipPlan, type CatSpec } from '../types';
import { boundsPoints, fitRoomCamera, ndcBox } from './camera';
import { CLOSEUP_DIR, FACE_W, FOLLOW_MAX_DIST, closeUpPose, followPose } from './clip-camera';
import { CLIP_FRAMES, MATCH_FRAME, blinkAt, clipFrameToTick, shotForFrame } from './clip-pass';
import { buildPropGeometry, PropsView } from './props-view';
import { catColors, mixHex, shadeHex, desaturateHex } from './palette';
import { DprGovernor, startDpr } from './quality';
import { buildCatRig } from './cat-rig';
import { paintFace } from './face-decal-material';
import { buildHumanRig, doubleTake } from './human-rig';
import { buildRoom } from './room-view';
import { fallbackCone } from './vision-cone';
import { Shards } from './shards';
import { facingYaw, angleDelta } from './space';
import { fixturePlay, fixtureState } from './test-fixtures';

const ROOM = { minX: -2.5, maxX: 2.4, minZ: -2.1, maxZ: 2.0, top: 2.4, bottom: -0.2 };

describe('camera fit', () => {
  for (const [name, aspect] of [
    ['9:16', 9 / 16],
    ['3:4', 3 / 4],
    ['390x844', 390 / 844],
    ['16:9 desktop', 16 / 9],
  ] as const) {
    it(`keeps the whole room on screen at ${name}`, () => {
      const pose = fitRoomCamera(aspect, ROOM, { centerY: aspect < 0.8 ? 0.14 : 0 });
      const cam = new PerspectiveCamera(pose.fov, aspect, 0.05, 100);
      cam.position.copy(pose.position);
      cam.lookAt(pose.target);
      cam.updateProjectionMatrix();
      const b = ndcBox(cam, boundsPoints(ROOM));
      expect(b.minX).toBeGreaterThanOrEqual(-1);
      expect(b.maxX).toBeLessThanOrEqual(1);
      expect(b.minY).toBeGreaterThanOrEqual(-1);
      expect(b.maxY).toBeLessThanOrEqual(1);
      // in portrait the width is the binding constraint: the room fills most of the width
      if (aspect < 1) expect(b.maxX - b.minX).toBeGreaterThan(1.8);
      // pitch ≈ 52°
      const dir = pose.target.clone().sub(pose.position).normalize();
      expect(Math.asin(-dir.y) * (180 / Math.PI)).toBeCloseTo(52, 0);
    });
  }
  it('keeps a human head (2 m) at the back wall on screen', () => {
    const pose = fitRoomCamera(9 / 16, ROOM, { centerY: 0.14 });
    const cam = new PerspectiveCamera(pose.fov, 9 / 16, 0.05, 100);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);
    const p = new Vector3(0, 2.0, -1.2).project(cam);
    expect(Math.abs(p.x)).toBeLessThan(1);
    expect(Math.abs(p.y)).toBeLessThan(1);
  });
});

describe('clip timeline', () => {
  const plan: ClipPlan = {
    matchCutTick: 300,
    crime: { prop: 0, fromTick: 300, breakTick: 420, toTick: 465 },
    slowMo: { fromTick: 400, toTick: 440, speed: 0.35 },
    pick: 'tension',
    hook: 'POV',
    urlLine: 'x',
  };
  it('holds the match cut through the opener, is monotonic through the take and holds the tail', () => {
    let prev = -1;
    for (let f = 0; f < CLIP_FRAMES - 30; f++) {
      const t = clipFrameToTick(plan, f);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(clipFrameToTick(plan, MATCH_FRAME)).toBe(300);
    expect(clipFrameToTick(plan, 0)).toBe(300);
    expect(clipFrameToTick(plan, 59)).toBe(300);
    expect(clipFrameToTick(plan, CLIP_FRAMES - 30)).toBe(300);
  });
  it('slows to 0.35x inside the slow-motion window and back to 1x after', () => {
    // frame where t reaches 400: 60 + 100 = 160
    expect(clipFrameToTick(plan, 160)).toBeCloseTo(400);
    expect(clipFrameToTick(plan, 161) - clipFrameToTick(plan, 160)).toBeCloseTo(0.35);
    const end = 160 + 40 / 0.35;
    expect(clipFrameToTick(plan, Math.ceil(end) + 1) - clipFrameToTick(plan, Math.ceil(end))).toBeCloseTo(1);
  });
  it('handles a missing or zero slow motion and clamps the frame range', () => {
    const p2 = { ...plan, slowMo: { fromTick: 0, toTick: 0, speed: 0 } };
    expect(clipFrameToTick(p2, 100) - clipFrameToTick(p2, 99)).toBe(1);
    expect(clipFrameToTick(plan, 9999)).toBe(clipFrameToTick(plan, CLIP_FRAMES - 1));
    expect(clipFrameToTick({ ...plan, matchCutTick: 10 }, 0)).toBe(10);
  });
  it('picks close-up, crime and loop shots', () => {
    expect(shotForFrame(plan, 0, 240).closeUp).toBe(true);
    expect(shotForFrame(plan, 70, 310)).toEqual({ focusProp: -1, push: 1, closeUp: true });
    const s = shotForFrame(plan, 200, 360);
    expect(s.closeUp).toBe(false);
    expect(s.focusProp).toBe(0);
    expect(s.push).toBeCloseTo(0.5);
    // round 3: the tail frames the wreck (the composer loops back to the opener photo when there is one)
    expect(shotForFrame(plan, 340, 600)).toMatchObject({ closeUp: false, focusProp: 0, push: 1 });
    // review round 1: from 11.5 s the clip cuts back to frame 0's close-up framing (the loop joins)
    expect(shotForFrame(plan, 359, 600)).toEqual({ focusProp: -1, push: 0, closeUp: true });
    // round 3 (virality): the crime frames are locked to the cat-plus-target box; 9–11 s is the prop + human 2-shot
    expect(shotForFrame({ ...plan, crime: { ...plan.crime, lookTick: 330 } }, 200, 360).crimeBox).toBe(true);
    expect(shotForFrame(plan, 280, 500).twoShot).toBe(true);
    expect(blinkAt(70)).toBe(true);
    expect(blinkAt(90)).toBe(false);
  });
});

describe('clip camera', () => {
  it('puts the face quad into FACE_RECT at the match cut', () => {
    const face = new Vector3(0.3, 0.3, -0.4);
    const pose = closeUpPose(face, 1);
    const cam = new PerspectiveCamera(pose.fov, CLIP_W / CLIP_H, 0.01, 50);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);
    const toPx = (v: Vector3) => {
      const p = v.clone().project(cam);
      return { x: ((p.x + 1) / 2) * CLIP_W, y: ((1 - p.y) / 2) * CLIP_H };
    };
    const c = toPx(face);
    expect(Math.abs(c.x - (FACE_RECT.x + FACE_RECT.w / 2))).toBeLessThan(12);
    expect(Math.abs(c.y - (FACE_RECT.y + FACE_RECT.h / 2))).toBeLessThan(12);
    // the quad (FACE_W wide, facing the camera) spans ≈ FACE_RECT.w
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), CLOSEUP_DIR).normalize();
    const l = toPx(face.clone().addScaledVector(right, -FACE_W / 2));
    const r = toPx(face.clone().addScaledVector(right, FACE_W / 2));
    expect(Math.abs(Math.abs(r.x - l.x) - FACE_RECT.w)).toBeLessThan(30);
  });
  it('pushes in on the follow shot with a FOV narrowing (the camera does not move)', () => {
    const a = followPose(new Vector3(), new Vector3(1, 0.9, 0), 0);
    const b = followPose(new Vector3(), new Vector3(1, 0.9, 0), 1);
    expect(b.fov).toBeCloseTo(a.fov * 0.94);
    expect(b.position.distanceTo(a.position)).toBeLessThan(1e-9);
    expect(a.position.distanceTo(a.target)).toBeGreaterThanOrEqual(1.6);
  });
  it('a far human only pulls the camera back to FOLLOW_MAX_DIST; the cat and the crime stay in frame', () => {
    const cat = new Vector3(-0.4, 0.9, 0);
    const prop = new Vector3(0, 0.9, 0);
    const head = new Vector3(3.5, 1.8, -3);
    const pose = followPose(cat, prop, 0, CLIP_W / CLIP_H, [], [head]);
    const own = followPose(cat, prop, 0, CLIP_W / CLIP_H);
    // the human adds no distance past max(the crime's own framing, FOLLOW_MAX_DIST)
    expect(pose.position.distanceTo(pose.target)).toBeLessThanOrEqual(Math.max(FOLLOW_MAX_DIST, own.position.distanceTo(own.target)) + 1e-6);
    const cam = new PerspectiveCamera(pose.fov, CLIP_W / CLIP_H, 0.01, 50);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);
    for (const q of [cat, prop]) {
      const v = q.clone().project(cam);
      expect(Math.abs(v.x)).toBeLessThan(0.62);
      expect(Math.abs(v.y)).toBeLessThan(0.5);
    }
  });
  it('keeps the cat, the prop, its landing point and a near human head inside the safe box at full push', () => {
    const cat = new Vector3(-0.4, 0.9, 0);
    const prop = new Vector3(0, 0.9, 0);
    const landing = new Vector3(0.4, 0, 0);
    const head = new Vector3(0.3, 1.3, 0);
    const pose = followPose(cat, prop, 1, CLIP_W / CLIP_H, [landing], [head]);
    const cam = new PerspectiveCamera(pose.fov, CLIP_W / CLIP_H, 0.01, 50);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);
    for (const q of [cat, prop, landing, head]) {
      const v = q.clone().project(cam);
      expect(Math.abs(v.x)).toBeLessThan(0.62);
      expect(Math.abs(v.y)).toBeLessThan(0.5);
    }
  });
});

describe('palette', () => {
  it('converts the cat spec RGB565 colours', () => {
    const cc = catColors(DEFAULT_CAT);
    expect(rgb565(cc.base)).toBe(DEFAULT_CAT.base);
    expect(rgb565(cc.secondary)).toBe(DEFAULT_CAT.secondary);
    expect(cc.eye).toBe(0xf2c14e);
    expect(Math.abs(((cc.base >> 16) & 255) - 0x9a)).toBeLessThanOrEqual(8);
    const white: CatSpec = { ...DEFAULT_CAT, base: rgb565(0xffffff), eyes: 99 };
    expect(catColors(white).base).toBe(0xffffff);
    expect(catColors(white).eye).toBe(0xb07fd8);
  });
  it('mixes, shades and desaturates', () => {
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(shadeHex(0x808080, 2)).toBe(0xffffff);
    expect(desaturateHex(0xff0000, 1)).toBe(0x4c4c4c);
  });
});

describe('props', () => {
  it('builds a mesh for every MVP kind without a WebGL context', () => {
    // M0 kinds only; the FULL catalog (kinds 9, 12, 13, 16, 17, 21..63) is covered by W1-RENDER-WORLD's own test.
    const MVP = new Set([1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 14, 15, 18, 19, 20]);
    for (const k of PROP_KINDS.filter((p) => MVP.has(p.kind))) {
      const g = buildPropGeometry(k.kind);
      const n = g.getAttribute('position').count;
      expect(n, k.id).toBeGreaterThan(0);
      expect(n % 3).toBe(0);
      const bb = new Box3().setFromBufferAttribute(g.getAttribute('position') as never);
      expect(bb.min.y, k.id).toBeGreaterThanOrEqual(k.kind === 14 ? -0.07 : -0.04);
      expect(bb.max.y - bb.min.y, k.id).toBeLessThan(0.45);
      expect(bb.max.x - bb.min.x, k.id).toBeLessThan(0.45);
      expect(g.getAttribute('color')).toBeTruthy();
      const m = new Mesh(g, new MeshLambertMaterial({ vertexColors: true }));
      expect(m.isMesh).toBe(true);
    }
  });
  it('instances resting props by kind and hands a falling prop to a pooled mesh, emitting a break', () => {
    const play = fixturePlay();
    const view = new PropsView(play, new MeshLambertMaterial({ vertexColors: true }));
    const s = fixtureState(play);
    expect(view.update(s, 0, 0, null, true)).toEqual([]);
    const kindMeshes = view.group.children.filter((c) => c.name.startsWith('prop-'));
    expect(kindMeshes.length).toBe(4);
    const before = view.group.children.length;
    // the wine glass falls off the counter
    const p = s.props[0];
    Object.assign(p, { state: PropSt.FALLING, fromX: 3, fromZ: 1, fromLevel: 2, x: 3, z: 2, level: 0, fallTicks: 13, fallTimer: 13, dir: 5 });
    s.tick = 1;
    view.update(s, 1, 0.5, null, true);
    expect(view.group.children.length).toBe(before + 1);
    const pos = view.propPosition(0, new Vector3())!;
    expect(pos.y).toBeGreaterThan(0.5);
    Object.assign(p, { state: PropSt.BROKEN, fallTimer: 0, restTick: 14 });
    s.tick = 14;
    const fx = view.update(s, 14, 0, null, true);
    expect(fx.map((f) => f.kind)).toEqual(['break']);
    expect(fx[0].pos.y).toBe(0);
    // no fx re-emitted on the next frame, and none on a fresh cache
    expect(view.update(s, 15, 0, null, true)).toEqual([]);
    view.reset();
    expect(view.update(s, 16, 0, null, true)).toEqual([]);
  });
});

describe('cat', () => {
  it('builds every M0 variant in Node with cat-space coordinates and a face quad', () => {
    for (const pattern of ['solid', 'tabby', 'tuxedo', 'calico'] as const)
      for (const body of ['slim', 'normal', 'chonk'] as const)
        for (const tail of ['normal', 'fluffy', 'bob'] as const) {
          const rig = buildCatRig({ ...DEFAULT_CAT, pattern, body, tail, ears: body === 'slim' ? 'fold' : 'normal' });
          expect(rig.legs.length).toBe(4);
          expect(rig.tail.length).toBe(tail === 'bob' ? 1 : 3);
          expect((rig.body.geometry.getAttribute('aCat') as unknown) !== undefined).toBe(true);
          expect(rig.face.material).toBe(rig.faceMat);
        }
  });
  it('paints open and closed procedural faces with a feathered alpha', () => {
    const open = paintFace(DEFAULT_CAT, false);
    const closed = paintFace(DEFAULT_CAT, true);
    expect(open.length).toBe(128 * 128 * 4);
    expect(open[3]).toBe(0); // corner transparent
    const mid = (64 * 128 + 64) * 4;
    expect(open[mid + 3]).toBe(255);
    let diff = 0;
    for (let i = 0; i < open.length; i++) if (open[i] !== closed[i]) diff++;
    expect(diff).toBeGreaterThan(200);
  });
});

describe('human double-take', () => {
  it('glances, looks away, snaps back and settles on the look yaw', () => {
    const busy = facingYaw(1);
    const look = facingYaw(5);
    expect(doubleTake(0, busy, look).head).toBeCloseTo(busy);
    const away = doubleTake(0.4, busy, look);
    expect(Math.abs(angleDelta(away.head, look))).toBeGreaterThan(1.5);
    const settled = doubleTake(0.8, busy, look);
    expect(Math.abs(angleDelta(settled.head, look))).toBeLessThan(0.01);
    expect(settled.body).toBeCloseTo(look);
    expect(doubleTake(0.55, busy, look).brow).toBeGreaterThan(0.5);
  });
});

describe('room + budget', () => {
  it('builds the kitchen in Node and stays within the triangle budget', () => {
    const play = fixturePlay();
    const room = buildRoom(play, new MeshLambertMaterial({ vertexColors: true }));
    let tris = room.solid.geometry.getAttribute('position').count / 3;
    expect(tris).toBeGreaterThan(500);
    // a full room: 45 props (3 of each MVP kind), the player's cat, 2 ghosts, 2 humans and the accomplice
    const MVP = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 14, 15, 18, 19, 20];
    for (const k of MVP) tris += (buildPropGeometry(k).getAttribute('position').count / 3) * 3;
    const count = (root: { traverse(f: (o: unknown) => void): void }): number => {
      let n = 0;
      root.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
      });
      return n;
    };
    tris += count(buildCatRig(DEFAULT_CAT).root) * 4;
    tris += count(buildHumanRig(play, new MeshLambertMaterial()).root) * 2;
    expect(tris).toBeLessThan(60_000);
    expect(room.bounds.maxX - room.bounds.minX).toBeCloseTo(5.14);
  });
  it('fallback cone respects occlusion and facing', () => {
    const play = fixturePlay();
    const s = fixtureState(play);
    s.humans[0].state = HumanSt.LOOK;
    s.humans[0].facing = 5;
    const cells = Array.from(fallbackCone(s, 0));
    expect(cells.length).toBeGreaterThan(10);
    expect(cells).toContain(3 * 12 + 5); // right in front
    expect(cells).not.toContain(9 * 12 + 5); // behind the table (z5-6 occludes)
    s.humans[0].state = HumanSt.BUSY;
    expect(fallbackCone(s, 0).length).toBe(0);
  });
});

describe('quality + shards', () => {
  it('starts at 1.25 on Android, 1.5 on iOS, steps down after 2 s under 45 fps and up after 10 s above 58', () => {
    expect(startDpr({ isIOS: false, isAndroid: true, dpr: 3, touch: true })).toBe(1.25);
    expect(startDpr({ isIOS: true, isAndroid: false, dpr: 3, touch: true })).toBe(1.5);
    expect(startDpr({ isIOS: false, isAndroid: false, dpr: 1, touch: false })).toBe(1);
    const g = new DprGovernor(1.5, 3);
    for (let i = 0; i < 30 * 1.9; i++) expect(g.sample(1 / 30)).toBe(false);
    let changed = false;
    for (let i = 0; i < 30; i++) changed = g.sample(1 / 30) || changed;
    expect(changed).toBe(true);
    expect(g.dpr).toBe(1.25);
    for (let i = 0; i < 60 * 10.5; i++) g.sample(1 / 60);
    expect(g.dpr).toBe(1.5);
    g.freeze();
    for (let i = 0; i < 300; i++) g.sample(1 / 10);
    expect(g.dpr).toBe(1.5);
    const capped = new DprGovernor(1.5, 3);
    for (let i = 0; i < 60 * 100; i++) capped.sample(1 / 60);
    expect(capped.dpr).toBe(2);
  });
  it('bursts deterministic shards that settle on the floor', () => {
    const run = () => {
      const sh = new Shards();
      sh.burst(new Vector3(0, 0.9, 0), 0, { count: 20, colors: [0xff0000], seed: 42 });
      for (let i = 0; i < 90; i++) sh.update(1 / 30);
      return Array.from(sh.mesh.instanceMatrix.array.slice(0, 64));
    };
    const a = run();
    expect(a).toEqual(run());
    const sh = new Shards();
    sh.burst(new Vector3(0, 0.9, 0), 0, { count: 20, colors: [0xff0000], seed: 1 });
    for (let i = 0; i < 120; i++) sh.update(1 / 30);
    expect(sh.alive).toBe(20);
    expect(sh.mesh.instanceMatrix.array[13]).toBeLessThan(0.05); // y of shard 0 on the floor
  });
});
