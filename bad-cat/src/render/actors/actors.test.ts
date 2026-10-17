import { describe, expect, it } from 'vitest';
import { Group, InstancedMesh, Line, Mesh, MeshLambertMaterial, Object3D, PerspectiveCamera, Points, Sprite, Vector3 } from 'three';
import { CELL_M, COSMETICS, DEFAULT_CAT, FRIDGE_MAGNETS, HumanSt, PATTERNS, type CameoEntry, type ClipPlan } from '../../types';
import { boundsPoints, editorPose, fitRoomCamera, ndcBox, portraitPose, roomPose, streamerPose, PORTRAIT_WINDOW_CELLS } from '../camera';
import { buildCatRig } from '../cat-rig';
import { CLIP_FRAMES, OPENER_FRAMES, TAIL_FRAMES, blinkAt, clipFrameToTick, clipFrames, clipSize, closeUpUntil, shotForFrame } from '../clip-pass';
import { buildHumanRig, HumanView, scoopPhase, SCOOP } from '../human-rig';
import { cellX, cellZ, levelY } from '../space';
import { bossFixture, fixturePlay, fixtureState } from '../test-fixtures';
import { buildRoom } from '../room-view';
import { PropsView } from '../props-view';
import { VisionCone } from '../vision-cone';
import { CameoViews, fridgeMagnetLayout, MAGNET_R, spectatorSlotsOf } from './cameos';
import { COLLAR_BUILDERS, HAT_BUILDERS, TRAIL_STYLES, cosmeticIds } from './cosmetics';
import { gridLines, EditorOverlayView } from './editor-overlay';
import { ExtraCones, mirrorCells, webcamCells } from './extra-cones';
import { ATLAS_SLOTS, FaceAtlas } from './face-atlas';
import { PATTERN_ORDER, PATTERN_SAMPLES, patternMask } from './patterns';
import { PERSONAS, PERSONA_IDS, humanLook, personaFor } from './personas';
import { edgeArrow, ndcRay, pickHeightmap, projectCell } from './screen';
import { AccompliceActor, propIcon } from './accomplice';
import { TrailFx } from './fx';

describe('coat patterns', () => {
  it('has a mask for every pattern, in PATTERNS order', () => {
    expect(PATTERN_ORDER).toEqual(PATTERNS);
  });
  it('gives 7 distinct masks over the cat', () => {
    const sig = PATTERN_ORDER.map((_, pi) => PATTERN_SAMPLES.map(([x, y, z]) => patternMask(pi, x, y, z)));
    for (let a = 0; a < sig.length; a++)
      for (let b = a + 1; b < sig.length; b++) {
        let diff = 0;
        for (let i = 0; i < PATTERN_SAMPLES.length; i++) diff += Math.abs(sig[a][i].sec - sig[b][i].sec) + Math.abs(sig[a][i].ter - sig[b][i].ter);
        expect(diff / PATTERN_SAMPLES.length, `${PATTERN_ORDER[a]} vs ${PATTERN_ORDER[b]}`).toBeGreaterThan(0.03);
      }
  });
  it('puts the white where each pattern has it', () => {
    const tux = PATTERN_ORDER.indexOf('tuxedo');
    expect(patternMask(tux, 0, 0.02, 0.07).ter).toBeGreaterThan(0.9); // white sock
    expect(patternMask(tux, 0.07, 0.22, -0.1).ter).toBeLessThan(0.1); // black back
    const cp = PATTERN_ORDER.indexOf('colorpoint');
    expect(patternMask(cp, 0, 0.03, -0.05).sec).toBeGreaterThan(0.9); // dark leg
    expect(patternMask(cp, 0.06, 0.13, 0).sec).toBeLessThan(0.3); // pale flank
    const tortie = PATTERN_ORDER.indexOf('tortie');
    for (const [x, y, z] of PATTERN_SAMPLES) expect(patternMask(tortie, x, y, z).ter).toBe(0);
  });
  it('builds a rig for every pattern', () => {
    for (const pattern of PATTERNS) {
      const r = buildCatRig({ ...DEFAULT_CAT, pattern });
      expect(r.fur.userData.uniforms.uPattern.value).toBe(PATTERN_ORDER.indexOf(pattern));
    }
  });
});

describe('cosmetics', () => {
  const verts = (collar: number, hat: number): number => buildCatRig({ ...DEFAULT_CAT, collar, hat }).body.geometry.getAttribute('position').count;
  it('maps every COSMETICS collar and hat id to an attachment', () => {
    for (const id of cosmeticIds('collar')) expect(COLLAR_BUILDERS[id], `collar ${id}`).toBeTypeOf('function');
    for (const id of cosmeticIds('hat')) expect(HAT_BUILDERS[id], `hat ${id}`).toBeTypeOf('function');
    for (const id of cosmeticIds('trail')) expect(TRAIL_STYLES[id], `trail ${id}`).toBeDefined();
    expect(cosmeticIds('collar').length).toBe(COSMETICS.filter((c) => c.slot === 'collar').length);
  });
  it('adds geometry for each collar and hat, and ignores unknown ids', () => {
    const none = verts(0, 0);
    for (const id of cosmeticIds('collar')) expect(verts(id, 0), `collar ${id}`).toBeGreaterThan(none);
    for (const id of cosmeticIds('hat')) expect(verts(0, id), `hat ${id}`).toBeGreaterThan(none);
    expect(verts(99, 250)).toBe(none);
  });
  it('is one skinned fur mesh with an outline and a face', () => {
    const r = buildCatRig({ ...DEFAULT_CAT, collar: 2, hat: 5 });
    let meshes = 0;
    r.root.traverse((o) => {
      if ((o as Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(3);
    expect((r.body as unknown as { isSkinnedMesh: boolean }).isSkinnedMesh).toBe(true);
    expect(r.body.geometry.getAttribute('aCat')).toBeTruthy();
  });
  it('spawns trail particles as the cat walks', () => {
    const t = new TrailFx();
    t.set(3);
    for (let i = 0; i < 20; i++) t.update(new Vector3(i * 0.05, 0, 0), 0, 0, i, 1, true);
    expect(t.mesh.count).toBeGreaterThan(5);
    t.update(new Vector3(), 0, 0, 30, 1, false);
    expect(t.mesh.count).toBe(0);
  });
});

describe('personas and humans', () => {
  it('has a persona config for every persona', () => {
    for (const id of PERSONA_IDS) {
      const p = PERSONAS[id];
      expect(p.id).toBe(id);
      expect(p.turnScale).toBeGreaterThan(0);
    }
    expect(PERSONAS.grandma.turnScale).toBeGreaterThan(1);
  });
  it('resolves a persona from the routine or its name and applies overrides', () => {
    const base = fixturePlay().routine;
    expect(personaFor(base).id).toBe('chef-dad');
    expect(personaFor({ ...base, name: 'Couch Potato' }).id).toBe('couch-potato');
    expect(personaFor({ ...base, kind: 'napper' }).id).toBe('napper');
    const l = humanLook({ ...base, persona: 'caterer', outfitColor: 0x123456, holding: 'book', pose: 'sit' });
    expect(l.outfit).toBe(0x123456);
    expect(l.holding).toBe('book');
    expect(l.posture).toBe('sit');
  });
  it('builds every persona as one skinned mesh in Node', () => {
    const play = fixturePlay();
    for (const id of PERSONA_IDS) {
      const rig = buildHumanRig(play, new MeshLambertMaterial(), { ...play.routine, persona: id });
      let meshes = 0;
      rig.root.traverse((o) => {
        if ((o as Mesh).isMesh) meshes++;
      });
      expect(meshes, id).toBe(1);
      expect(rig.look.id).toBe(id);
    }
  });
  it('lays the Napper on the bed while asleep and sits it up for the wake yawn', () => {
    const play = bossFixture({ napper: true });
    const hv = new HumanView(play, new MeshLambertMaterial(), 1);
    const s = fixtureState(play);
    const h = { ...s.humans[0], state: HumanSt.NAP, timer: 100, stateTicks: 100 };
    const f = { T: 0, alpha: 0, dtTicks: 30, seen: false, scooping: false, caughtOther: false, caughtTicks: 0, catWorld: new Vector3(), w: 14, d: 12 };
    for (let i = 0; i < 20; i++) hv.update(h, { ...f, T: i * 30 });
    expect(Math.abs(hv.rig.root.rotation.x)).toBeGreaterThan(1.4);
    expect(hv.asleep).toBeGreaterThan(0.9);
    for (let i = 0; i < 20; i++) hv.update({ ...h, state: HumanSt.TELEGRAPH, timer: 20, stateTicks: 24 }, { ...f, T: 600 + i * 30 });
    expect(Math.abs(hv.rig.root.rotation.x)).toBeLessThan(0.1);
  });
  it('scoops: walks up, leans in, lifts, then hugs, all inside the 75-tick cuddle', () => {
    let prev = { approach: 0, reach: 0, lift: 0, hug: 0 };
    for (let t = 0; t <= 75; t++) {
      const p = scoopPhase(t);
      expect(p.approach).toBeGreaterThanOrEqual(prev.approach);
      expect(p.lift).toBeGreaterThanOrEqual(prev.lift);
      prev = p;
    }
    expect(scoopPhase(SCOOP.lift + 8).hug).toBe(1);
    expect(SCOOP.lift + 8).toBeLessThan(75);
    const play = fixturePlay();
    const hv = new HumanView(play, new MeshLambertMaterial());
    const s = fixtureState(play);
    const cat = new Vector3(cellX(2, 12), 0, cellZ(7, 10));
    const f = { T: 0, alpha: 0, dtTicks: 1, seen: false, scooping: true, caughtOther: false, caughtTicks: 0, catWorld: cat, w: 12, d: 10 };
    hv.update(s.humans[0], f);
    const start = hv.rig.root.position.clone();
    for (let t = 1; t <= 40; t++) hv.update(s.humans[0], { ...f, T: t, caughtTicks: t });
    expect(hv.rig.root.position.distanceTo(cat)).toBeLessThan(start.distanceTo(cat));
    expect(hv.bubble).toBe('heart');
    expect(hv.rig.held.scale.x).toBe(0);
  });
});

describe('screen maths', () => {
  const play = fixturePlay();
  const W = 12;
  const D = 10;
  const pose = roomPose(3 / 4, (W * CELL_M) / 2, (D * CELL_M) / 2, null);
  const cam = new PerspectiveCamera(pose.fov, 3 / 4, 0.05, 60);
  cam.position.copy(pose.position);
  cam.lookAt(pose.target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  it('picks the cell under a screen point (floor and counter top)', () => {
    for (const [x, z] of [
      [6, 8],
      [1, 7],
      [3, 1], // counter (L2)
      [11, 5], // cabinet (L2)
    ]) {
      const lv = play.shell.levels[z * W + x];
      const p = new Vector3(cellX(x, W), levelY(lv), cellZ(z, D)).project(cam);
      const { origin, dir } = ndcRay(cam, p.x, p.y);
      expect(pickHeightmap(origin, dir, play.shell.levels, W, D)).toEqual({ x, z, level: lv });
    }
    // above the room: nothing
    const { origin, dir } = ndcRay(cam, 0, 0.999);
    const miss = pickHeightmap(origin, dir.clone().setY(Math.abs(dir.y)), play.shell.levels, W, D);
    expect(miss).toBeNull();
  });
  it('round-trips projectWorld through the pick ray (cells not hidden behind a taller one)', () => {
    let n = 0;
    for (let z = 2; z < D; z++)
      for (let x = 0; x < W; x++) {
        const lv = play.shell.levels[z * W + x];
        let hidden = false;
        for (let k = 1; k <= 3 && z + k < D; k++) if (play.shell.levels[(z + k) * W + x] > lv) hidden = true;
        if (hidden) continue;
        n++;
        const sp = projectCell(cam, x, z, lv, W, D);
        expect(sp.onScreen).toBe(true);
        const { origin, dir } = ndcRay(cam, sp.x * 2 - 1, 1 - sp.y * 2);
        expect(pickHeightmap(origin, dir, play.shell.levels, W, D)).toEqual({ x, z, level: lv });
      }
    expect(n).toBeGreaterThan(40);
  });
  it('places the edge arrow on the border toward an off-screen head', () => {
    expect(edgeArrow({ x: 0.2, y: -0.4, z: 0.9 }, 0.5)).toBeNull();
    const r = edgeArrow({ x: 3, y: 0.6, z: 0.9 }, 0.5, 0.1)!;
    expect(r.x).toBeCloseTo(0.9);
    expect(r.y).toBeCloseTo(0.18);
    expect(r.angle).toBeGreaterThan(0);
    expect(r.angle).toBeLessThan(Math.PI / 2);
    const up = edgeArrow({ x: 0, y: 2, z: 0.9 }, 1, 0.1)!;
    expect(up.y).toBeCloseTo(0.9);
    expect(up.angle).toBeCloseTo(Math.PI / 2);
    // behind the camera: mirrored
    const back = edgeArrow({ x: 0.5, y: 0.2, z: 1.2 }, 1, 0.1)!;
    expect(back.x).toBeLessThan(0);
  });
});

describe('camera fit for boss rooms (14 x 12)', () => {
  const play = bossFixture();
  const hw = (14 * CELL_M) / 2;
  const hd = (12 * CELL_M) / 2;
  const heads = [new Vector3(cellX(5, 14), 2, cellZ(3, 12)), new Vector3(cellX(11, 14), 2, cellZ(7, 12))];
  const check = (pose: { fov: number; position: Vector3; target: Vector3 }, aspect: number, pts: Vector3[]) => {
    const cam = new PerspectiveCamera(pose.fov, aspect, 0.05, 100);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateProjectionMatrix();
    const b = ndcBox(cam, pts);
    expect(b.minX).toBeGreaterThanOrEqual(-1.001);
    expect(b.maxX).toBeLessThanOrEqual(1.001);
    expect(b.minY).toBeGreaterThanOrEqual(-1.001);
    expect(b.maxY).toBeLessThanOrEqual(1.001);
  };
  it('fits the whole room and both heads at 3:4 and 16:9', () => {
    for (const aspect of [3 / 4, 16 / 9]) {
      const pts = boundsPoints({ minX: -hw, maxX: hw, minZ: -hd, maxZ: hd, top: 0.3, bottom: 0 }).concat(heads);
      check(roomPose(aspect, hw, hd, heads), aspect, pts);
      check(streamerPose(aspect, hw, hd, heads), aspect, pts);
    }
    expect(play.shell.width).toBe(14);
  });
  it('editor pose: the whole room on a phone and a desktop, from a steeper pitch than the run', () => {
    const pitch = (p: { position: Vector3; target: Vector3 }): number => {
      const d = p.position.clone().sub(p.target);
      return Math.atan2(d.y, Math.hypot(d.x, d.z));
    };
    for (const aspect of [9 / 16, 3 / 4, 16 / 9]) {
      const pts = boundsPoints({ minX: -hw, maxX: hw, minZ: -hd, maxZ: hd, top: 0.3, bottom: 0 });
      const pose = editorPose(aspect, hw, hd);
      check(pose, aspect, pts);
      expect(pitch(pose)).toBeGreaterThan(pitch(roomPose(aspect, hw, hd, heads)) + 0.2);
    }
  });
  it('fits the full depth in the 9:16 window with the heads in height', () => {
    const aspect = 9 / 16;
    const ww = (PORTRAIT_WINDOW_CELLS * CELL_M) / 2;
    const pts = boundsPoints({ minX: -ww, maxX: ww, minZ: -hd, maxZ: hd, top: 0.3, bottom: 0 }).concat(heads.map((h) => new Vector3(0, h.y, h.z)));
    check(portraitPose(aspect, hd, heads), aspect, pts);
  });
  it('keeps a plain fit consistent with the old kitchen fit', () => {
    const pose = fitRoomCamera(16 / 9, { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd, top: 0.3 });
    expect(pose.position.y).toBeGreaterThan(0);
  });
});

describe('clip frames and sizes', () => {
  const base: ClipPlan = {
    matchCutTick: 300,
    crime: { prop: 0, fromTick: 300, breakTick: 420, toTick: 465 },
    slowMo: { fromTick: 400, toTick: 440, speed: 0.35 },
    pick: 'tension',
    hook: '',
    urlLine: '',
  };
  /** Share's clipFrameTick rule, restated for any frame count. */
  const reference = (plan: ClipPlan, f: number): number => {
    const n = plan.frames ?? 360;
    if (f < 60 || f >= n - 30) return plan.matchCutTick;
    const g = f - 60;
    const { fromTick, toTick, speed } = plan.slowMo;
    if (speed >= 1 || speed <= 0 || toTick <= fromTick || toTick <= plan.matchCutTick) return plan.matchCutTick + g;
    const ss = Math.max(plan.matchCutTick, fromTick);
    if (g <= ss - plan.matchCutTick) return plan.matchCutTick + g;
    const sf = (toTick - ss) / speed;
    const gs = g - (ss - plan.matchCutTick);
    return gs <= sf ? ss + gs * speed : toTick + (gs - sf);
  };
  for (const frames of [360, 180]) {
    it(`maps ${frames} frames like share's clipFrameTick`, () => {
      const plan = { ...base, frames };
      expect(clipFrames(plan)).toBe(frames);
      for (let f = 0; f < frames; f++) expect(clipFrameToTick(plan, f), `frame ${f}`).toBeCloseTo(reference(plan, f), 6);
      expect(clipFrameToTick(plan, OPENER_FRAMES - 1)).toBe(300);
      expect(clipFrameToTick(plan, frames - TAIL_FRAMES)).toBe(300);
      expect(clipFrameToTick(plan, OPENER_FRAMES + 10)).toBe(310);
      // shots: close-up through the hold, the crime after, the blink inside the hold
      expect(shotForFrame(plan, closeUpUntil(frames) - 1, 300).closeUp).toBe(true);
      expect(shotForFrame(plan, closeUpUntil(frames), 340).closeUp).toBe(false);
      expect(blinkAt(66, frames)).toBe(true);
      expect(blinkAt(closeUpUntil(frames), frames)).toBe(false);
    });
  }
  it('matches share for the default 360 frames without `frames`', () => {
    expect(clipFrames(base)).toBe(CLIP_FRAMES);
    for (let f = 0; f < CLIP_FRAMES; f += 7) expect(clipFrameToTick(base, f)).toBeCloseTo(reference(base, f), 6);
  });
  it('uses the plan size or 720 x 1280', () => {
    expect(clipSize(base)).toEqual({ w: 720, h: 1280 });
    expect(clipSize({ ...base, size: { w: 720, h: 640 } })).toEqual({ w: 720, h: 640 });
  });
});

describe('cameos', () => {
  const play = bossFixture();
  it('fits 40 magnets on the fridge wall without overlap', () => {
    const L = fridgeMagnetLayout(play.shell)!;
    expect(L.pts.length).toBe(FRIDGE_MAGNETS);
    for (const p of L.pts) {
      expect(p.x - MAGNET_R).toBeGreaterThanOrEqual(L.box.x0 - 0.01);
      expect(p.x + MAGNET_R).toBeLessThanOrEqual(L.box.x1 + 0.01);
      expect(p.y - MAGNET_R).toBeGreaterThanOrEqual(L.box.y0 - 0.01);
      expect(p.y + MAGNET_R).toBeLessThanOrEqual(L.box.y1 + 0.01);
    }
    for (let i = 0; i < L.pts.length; i++) for (let j = i + 1; j < L.pts.length; j++) expect(L.pts[i].distanceTo(L.pts[j])).toBeGreaterThan(MAGNET_R * 2);
    expect(fridgeMagnetLayout({ ...play.shell, fridgeWall: undefined })).toBeNull();
  });
  it('fills spectator slots and the fridge from a bundle, with a face atlas', () => {
    const entries: CameoEntry[] = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, name: `Cat ${i}`, catCode: 'not-a-code', kind: 'free' }));
    const v = new CameoViews(play.shell);
    v.set({ dayNo: 1, shuffle: 0, spectators: entries.slice(0, 20), fridge: entries, guestStars: [], source: 'offline' });
    // review round 1: slots on the human's back wall are skipped
    const free = spectatorSlotsOf(play.shell).length;
    expect(free).toBeLessThan((play.shell.spectatorSlots ?? []).length);
    expect(v.spectators.count).toBe(Math.min(15, free));
    expect(v.fridge.count).toBe(40);
    expect(v.atlas.size).toBe(Math.min(15, free)); // faces only for spectators (fridge magnets without a face are colour dots)
    v.set(null);
    expect(v.spectators.count).toBe(0);
  });
  it('gives each face a distinct atlas slot and stops when full', () => {
    const a = new FaceAtlas();
    expect(a.slot('a', DEFAULT_CAT)).toBe(0);
    expect(a.slot('b', DEFAULT_CAT)).toBe(1);
    expect(a.slot('a', DEFAULT_CAT)).toBe(0);
    for (let i = 0; i < ATLAS_SLOTS; i++) a.slot(`x${i}`, DEFAULT_CAT);
    expect(a.slot('overflow', DEFAULT_CAT)).toBe(-1);
    expect(a.uv(9)).toEqual({ u: 1 / 8, v: 1 / 8 });
  });
  it('shows the accomplice with a wish icon', () => {
    expect(propIcon(21)).toBe('🐟');
    expect(propIcon(999)).toBe('🎁');
    const a = new AccompliceActor({ spec: DEFAULT_CAT, name: 'Mila', x: 13, z: 6, level: 2, wishProp: 4, granted: false, badge: 'accomplice' });
    expect(a.update(0, false, null, 14, 12)).toBe(false);
    expect(a.update(1, true, null, 14, 12)).toBe(true); // the grant frame
    expect(a.update(2, true, null, 14, 12)).toBe(false);
  });
});

describe('mirror, webcam and editor', () => {
  it('draws the mirror cone only while BUSY and the webcam always', () => {
    const play = bossFixture();
    const s = fixtureState(play);
    s.humans[0].state = HumanSt.BUSY;
    // v6: the mirror watches only in its check phase (after the glint), here 50 ticks into BUSY
    s.humans[0].stateTicks = 200;
    s.humans[0].timer = 150;
    expect(Array.from(mirrorCells(s, play)).length).toBeGreaterThan(3);
    expect(Array.from(webcamCells(s, play)).length).toBeGreaterThan(3);
    s.humans[0].state = HumanSt.LOOK;
    expect(Array.from(mirrorCells(s, play)).length).toBe(0);
    expect(Array.from(webcamCells(s, play)).length).toBeGreaterThan(3);
    expect(Array.from(mirrorCells(s, fixturePlay()))).toEqual([]);
    const ex = new ExtraCones(play, 14 * 12);
    ex.update(s, 0, 30, true);
    expect(ex.cam.mesh.visible).toBe(true);
  });
  it('builds grid lines for every cell and an overlay mesh', () => {
    const play = fixturePlay();
    expect(gridLines(play.shell.levels, 12, 10).length).toBe(12 * 10 * 4 * 6);
    const ov = new EditorOverlayView(play);
    ov.set({ grid: true, hover: { x: 2, z: 3 }, bad: [5, 6], targets: [0], spawn: { x: 1, z: 8 } }, play.room.props);
    expect(ov.group.visible).toBe(true);
    ov.set(null, play.room.props);
    expect(ov.group.visible).toBe(false);
  });
});

/** Draw calls of a scene as three would issue them (visible meshes, lines, points, sprites; instanced = 1). */
function drawCalls(root: Object3D): number {
  let n = 0;
  const walk = (o: Object3D) => {
    if (!o.visible) return;
    const m = o as Mesh;
    if ((m.isMesh || (o as Line).isLine || (o as Points).isPoints || (o as Sprite).isSprite) && !((o as InstancedMesh).isInstancedMesh && (o as InstancedMesh).count === 0)) {
      const mats = Array.isArray(m.material) ? m.material.length : 1;
      n += mats;
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return n;
}

describe('draw-call budget (estimate without WebGL)', () => {
  it('stays within 80 in a boss room with 2 humans, 2 ghosts, 15 spectators and the fridge wall', () => {
    const fx = bossFixture();
    // a Saturday boss room has no mirror or webcam (those are the Wednesday / Thursday twists)
    const play = { ...fx, shell: { ...fx.shell, mirror: undefined, webcam: undefined } };
    const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const scene = new Group();
    scene.add(buildRoom(play, mat).group);
    const props = new PropsView(play, mat);
    props.update(fixtureState(play), 0, 0, null, true);
    scene.add(props.group);
    const cone = new VisionCone(14 * 12);
    scene.add(cone.mesh);
    scene.add(new HumanView(play, mat, 0).rig.root, new HumanView(play, mat, 1).rig.root);
    scene.add(buildCatRig(DEFAULT_CAT).root);
    for (let i = 0; i < 2; i++) {
      const g = buildCatRig(DEFAULT_CAT);
      g.root.traverse((o) => {
        if (o.name === 'cat-outline') o.visible = false;
      });
      scene.add(g.root);
    }
    const cameos = new CameoViews(play.shell);
    const entries: CameoEntry[] = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, name: `Cat ${i}`, catCode: '', kind: 'club' }));
    cameos.set({ dayNo: 1, shuffle: 0, spectators: entries.slice(0, 15), fridge: entries, guestStars: [], source: 'offline' });
    scene.add(cameos.group);
    const acc = new AccompliceActor({ spec: DEFAULT_CAT, name: 'Mila', x: 13, z: 6, level: 2, wishProp: 4, granted: false, badge: 'accomplice' });
    scene.add(acc.rig.root);
    const calls = drawCalls(scene);
    const world = drawCalls(scene.children[0]) + drawCalls(scene.children[1]);
    const actors = calls - world;
    // meshes: player cat 3, 2 ghosts x 2 (no outline), 2 humans, spectators 2, fridge 1, accomplice 3, cone 1
    expect(actors).toBeLessThanOrEqual(16);
    // worst case of the sprites and overlays on at once: blob shadows, shards, puddles, cat ring, look dim, the
    // suspicion ring, 2 bubbles + the "hm?" label, 2 look rings, 2 ghost labels, the accomplice bubble + badge,
    // "YOU", the "!" over the cat, the impact flash = 18; the world gets the rest of the 80 (W1-RENDER-WORLD: 48)
    expect(actors + 18).toBeLessThanOrEqual(34);
    expect(world + actors + 18).toBeLessThanOrEqual(80);
  });
});
