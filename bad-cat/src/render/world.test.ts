/**
 * W1-RENDER-WORLD tests (Node, no WebGL): every prop kind has a mesh within its bounds, every furniture type has a
 * builder, every shell (content + synthetic) builds within the draw-call and triangle budgets, themes stay cheap,
 * and the world dynamics run on synthetic v5 states without throwing or allocating per frame.
 */
import { describe, expect, it } from 'vitest';
import { Box3, MeshLambertMaterial, Vector3 } from 'three';
import { PROP_KINDS, PropSt, propKind, type PlayableRoom, type RoomTheme, type SimEvent } from '../types';
import { SHELLS, content } from '../content';
import { PropsView, buildPropGeometry, buildStackPieceGeometry, shardColors, stackLayout } from './props-view';
import { buildRoom } from './room-view';
import { Shards, burstStyle } from './shards';
import { createWorldDynamics } from './world-dynamics';
import { countDrawCalls, countTriangles } from './world/budget';
import { FURNITURE_BUILDERS, furnitureAnchors, makeCtx } from './world/furniture';
import { GeoBuilder } from './geo';
import { ALL_FURNITURE, denseProps, fixturePlayFor, fixtureShell, fixtureStateFor, type FixtureShell } from './world/fixtures';
import { buildBoxGeometry, buildClothGeometry } from './world/prop-shapes';

const mat = () => new MeshLambertMaterial({ vertexColors: true });
const THEMES: RoomTheme[] = ['default', 'xmas', 'birthday', 'wedding', 'nye', 'valentine', 'thanksgiving', 'spring'];
const FIXTURES: FixtureShell[] = ['kitchen', 'living', 'bath-bed', 'boss'];

/** Draw calls of the world part of a frame (room + props + dynamics). Actors (cat, humans, cone, HUD) need the rest. */
const WORLD_DRAW_BUDGET = 48;
const ACTOR_RESERVE_TRIS = 15_000;

function world(play: PlayableRoom) {
  const m = mat();
  const room = buildRoom(play, m);
  const props = new PropsView(play, m);
  const dyn = createWorldDynamics(play, m);
  return { room, props, dyn };
}

describe('prop meshes', () => {
  it('builds every kind in PROP_KINDS with position + colour within its bounds', () => {
    expect(PROP_KINDS.length).toBe(64);
    for (const k of PROP_KINDS) {
      const g = buildPropGeometry(k.kind);
      const pos = g.getAttribute('position');
      expect(pos.count, k.id).toBeGreaterThan(0);
      expect(pos.count % 3, k.id).toBe(0);
      expect(g.getAttribute('color'), k.id).toBeTruthy();
      const bb = new Box3().setFromBufferAttribute(pos as never);
      const h = bb.max.y - bb.min.y;
      const fx = bb.max.x - bb.min.x;
      const fz = bb.max.z - bb.min.z;
      expect(bb.min.y, k.id).toBeGreaterThanOrEqual(k.kind === 14 ? -0.07 : -0.04);
      if (k.tall !== undefined) {
        // the Christmas tree: ~1.6 m tall, under a 0.8 m spread
        expect(h, k.id).toBeGreaterThan(1.4);
        expect(h, k.id).toBeLessThan(1.8);
        expect(Math.max(fx, fz), k.id).toBeLessThan(0.8);
      } else if (k.pull === 'cloth') {
        expect(fx, k.id).toBeCloseTo(0.4, 1);
        expect(fz, k.id).toBeLessThan(0.42);
      } else if (k.enterable) {
        expect(Math.max(fx, fz), k.id).toBeLessThanOrEqual(0.5);
        expect(h, k.id).toBeLessThan(0.45);
      } else {
        expect(h, k.id).toBeLessThan(0.45);
        expect(fx, k.id).toBeLessThan(0.45);
        expect(fz, k.id).toBeLessThan(0.45);
      }
    }
  });

  it('splits every stack kind into its items, each with a piece mesh', () => {
    for (const k of PROP_KINDS.filter((p) => p.stack)) {
      const lay = stackLayout(k.kind)!;
      expect(lay, k.id).toBeTruthy();
      expect(lay.items.length, k.id).toBe(k.stack!.items);
      expect(lay.variants, k.id).toBe(1);
      expect(buildStackPieceGeometry(k.kind).getAttribute('position').count, k.id).toBeGreaterThan(0);
      for (const it of lay.items) expect(it.k, k.id).toBeGreaterThan(0.5);
    }
    expect(stackLayout(1)).toBeNull();
  });

  it('spans the cloth over w x d cells and opens the box', () => {
    const bb = new Box3().setFromBufferAttribute(buildClothGeometry(3, 2).getAttribute('position') as never);
    expect(bb.max.x - bb.min.x).toBeCloseTo(1.2, 1);
    expect(bb.max.z - bb.min.z).toBeCloseTo(0.8, 1);
    const closed = new Box3().setFromBufferAttribute(buildBoxGeometry(false).getAttribute('position') as never);
    const open = new Box3().setFromBufferAttribute(buildBoxGeometry(true).getAttribute('position') as never);
    expect(open.max.x - open.min.x).toBeGreaterThan(closed.max.x - closed.min.x + 0.1);
  });

  it('gives every breakable or spilling kind a material burst style and a tagged palette', () => {
    expect(burstStyle(28)).toBe('confetti');
    expect(burstStyle(37)).toBe('cloud');
    expect(burstStyle(22)).toBe('popcorn');
    expect(burstStyle(1)).toBe('glitter');
    expect(burstStyle(48)).toBe('splat');
    expect(burstStyle(53)).toBe('paper');
    expect(burstStyle(16)).toBe('tinsel');
    for (const k of PROP_KINDS) expect(shardColors(k.kind).length, k.id).toBeGreaterThan(1);
  });
});

describe('material shards', () => {
  it('stays inside the 300 pool, stays deterministic and makes confetti flutter slower than chunks', () => {
    const fallTime = (kind: number) => {
      const sh = new Shards();
      sh.burst(new Vector3(0, 0.9, 0), 0, { count: 30, colors: shardColors(kind), seed: 3 });
      let t = 0;
      for (; t < 300; t++) {
        sh.update(1 / 30);
        // y of shard 0
        if (sh.mesh.instanceMatrix.array[13] <= 0.01) break;
      }
      return { t, alive: sh.alive, m: Array.from(sh.mesh.instanceMatrix.array.slice(0, 32)) };
    };
    const conf = fallTime(28);
    const glass = fallTime(1);
    expect(conf.t).toBeGreaterThan(glass.t);
    expect(fallTime(28).m).toEqual(conf.m);
    // a huge burst never overruns the pool
    const sh = new Shards();
    for (let i = 0; i < 20; i++) sh.burst(new Vector3(0, 0.9, 0), 0, { count: 60, colors: shardColors(22), seed: i, hero: 5 });
    sh.update(1 / 30);
    expect(sh.alive).toBeLessThanOrEqual(300);
    // the flour cloud fades away
    const fl = new Shards();
    fl.burst(new Vector3(0, 0.9, 0), 0, { count: 20, colors: shardColors(37), seed: 1 });
    for (let i = 0; i < 120; i++) fl.update(1 / 30);
    expect(fl.alive).toBe(0);
  });
});

describe('furniture', () => {
  it('has a builder for every FurnitureType', () => {
    expect(Object.keys(FURNITURE_BUILDERS).sort()).toEqual([...ALL_FURNITURE].sort());
  });

  it('draws every type in every orientation (back wall, west wall, island) with geometry', () => {
    const play = fixturePlayFor(fixtureShell('living'), 'default', []);
    for (const type of ALL_FURNITURE) {
      if (type === 'window') continue;
      for (const [x, z] of [
        [3, 0],
        [0, 3],
        [4, 4],
        [10, 4],
      ]) {
        const g = new GeoBuilder();
        const level = type === 'wardrobe' || type === 'bookcase' || type === 'shelf' || type === 'fridge' ? 3 : type === 'rug' || type === 'mirror' || type === 'door' || type === 'arch' || type === 'webcam' || type === 'cat-bed' ? 0 : 2;
        FURNITURE_BUILDERS[type](makeCtx(g, { type, x, z, w: 2, d: 2, level }, play));
        expect(g.vertexCount, `${type} at ${x},${z}`).toBeGreaterThan(0);
      }
    }
  });

  it('anchors the TV picture, the fire and the REC light', () => {
    const kinds = [...furnitureAnchors(fixtureShell('living')), ...furnitureAnchors(fixtureShell('boss'))].map((a) => a.kind).sort();
    expect(kinds).toEqual(['fire', 'rec', 'tv']);
  });
});

describe('rooms within budget', () => {
  const shells = [
    ...SHELLS.map((s) => ({ name: `content:${s.name}`, shell: s })),
    ...FIXTURES.map((f) => ({ name: `fixture:${f}`, shell: fixtureShell(f) })),
  ];
  for (const { name, shell } of shells) {
    it(`${name} builds a room with <= ${WORLD_DRAW_BUDGET} world draw calls (80 total) in every theme`, () => {
      for (const theme of THEMES) {
        const play = fixturePlayFor(shell, theme, denseProps(shell, shell.width >= 14 ? 60 : 45), { sponsor: { propIndex: 0, label: 'Purrfect Snacks' } });
        const w = world(play);
        const s = fixtureStateFor(play);
        w.props.update(s, 0, 0, null, true);
        w.dyn.update(s, 0, []);
        // + 3 pooled meshes for props in mid-fall
        const calls = countDrawCalls(w.room.group) + countDrawCalls(w.props.group) + countDrawCalls(w.dyn.group) + 3;
        expect(calls, `${name}/${theme}`).toBeLessThanOrEqual(WORLD_DRAW_BUDGET);
        expect(countDrawCalls(w.room.group), `${name}/${theme} room`).toBe(3);
        w.room.dispose();
        w.props.dispose();
        w.dyn.dispose();
      }
    });
  }

  it('every content daily room (days 1..42) stays within the world draw-call budget mid-run', () => {
    for (let n = 1; n <= 42; n++) {
      const room = content.dailyRoom(n);
      const play = content.resolve(room, 'practice', n);
      const w = world(play);
      const s = fixtureStateFor(play);
      w.props.update(s, 0, 0, null, true);
      w.dyn.update(s, 0, []);
      // a puddle and a pop burst are live, three props mid-fall
      s.grid.puddle![s.grid.w + 1] = 1;
      w.dyn.update(s, 1, [{ t: 'puddle', tick: 1, x: 1, z: 1, kind: 1 }]);
      const calls = countDrawCalls(w.room.group) + countDrawCalls(w.props.group) + countDrawCalls(w.dyn.group) + 3;
      expect(calls, `${room.id} (${play.shell.name}, ${room.theme ?? 'default'})`).toBeLessThanOrEqual(WORLD_DRAW_BUDGET);
      w.room.dispose();
      w.props.dispose();
      w.dyn.dispose();
    }
  });

  it('keeps the largest boss room with all decorations under 60k triangles (actors included as a reserve)', () => {
    const shell = fixtureShell('boss');
    for (const theme of THEMES) {
      const play = fixturePlayFor(shell, theme, denseProps(shell, 60));
      const w = world(play);
      const s = fixtureStateFor(play);
      w.props.update(s, 0, 0, null, true);
      w.dyn.update(s, 0, []);
      const tris = countTriangles(w.room.group) + countTriangles(w.props.group) + countTriangles(w.dyn.group);
      expect(tris + ACTOR_RESERVE_TRIS, theme).toBeLessThanOrEqual(60_000);
    }
  });

  it('theme decorations add at most 6 draw calls', () => {
    for (const f of FIXTURES) {
      const shell = fixtureShell(f);
      const props = denseProps(shell);
      const base = (() => {
        const w = world(fixturePlayFor(shell, 'default', props));
        return countDrawCalls(w.room.group) + countDrawCalls(w.dyn.group);
      })();
      for (const theme of THEMES) {
        const w = world(fixturePlayFor(shell, theme, props));
        const calls = countDrawCalls(w.room.group) + countDrawCalls(w.dyn.group);
        expect(calls - base, `${f}/${theme}`).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('props view (v5)', () => {
  it('splits a falling stack into tumbling pieces that stay scattered after landing', () => {
    const shell = fixtureShell('kitchen');
    const play = fixturePlayFor(shell, 'default', [{ kind: 15, x: 5, z: 5, level: 2, rot: 0, target: true }]);
    const view = new PropsView(play, mat());
    const s = fixtureStateFor(play);
    view.update(s, 0, 0, null, true);
    const pieces = view.group.children.filter((c) => c.name.startsWith('stack-15'));
    expect(pieces.length).toBe(1); // one mesh per stack kind, colours per instance
    const p = s.props[0];
    Object.assign(p, { state: PropSt.FALLING, fromX: 5, fromZ: 5, fromLevel: 2, x: 5, z: 7, level: 0, fallTicks: 13, fallTimer: 13, dir: 5 });
    s.tick = 1;
    view.update(s, 1, 0.5, null, true);
    Object.assign(p, { fallTimer: 2 });
    s.tick = 12;
    view.update(s, 12, 0.5, null, true);
    Object.assign(p, { state: PropSt.LANDED, fallTimer: 0, restTick: 14 });
    for (let t = 14; t < 40; t++) {
      s.tick = t;
      view.update(s, t, 0, null, true);
    }
    // every piece sits near the floor around the landing cell
    const ys: number[] = [];
    for (const m of pieces as never as { count: number; instanceMatrix: { array: Float32Array } }[])
      for (let i = 0; i < m.count; i++) ys.push(m.instanceMatrix.array[i * 16 + 13]);
    expect(ys.length).toBe(5);
    for (const y of ys) expect(y).toBeLessThan(0.25);
  });

  it('hands the Roomba to dynamics, opens the box with the cat inside and topples the tree', () => {
    const shell = fixtureShell('living');
    const play = fixturePlayFor(shell, 'xmas', [
      { kind: 20, x: 3, z: 3, level: 0, rot: 0 },
      { kind: 54, x: 9, z: 8, level: 0, rot: 0 },
      { kind: 17, x: 1, z: 8, level: 0, rot: 0 },
    ]);
    const view = new PropsView(play, mat());
    const s = fixtureStateFor(play);
    view.update(s, 0, 0, null, true);
    expect(view.propPosition(0, new Vector3())!.x).toBeCloseTo(-1.0, 1);
    s.inBox = 1;
    view.update(s, 1, 0, null, true);
    expect(view.group.getObjectByName('box-open')?.visible).toBe(true);
    s.inBox = -1;
    view.update(s, 2, 0, null, true);
    expect(view.group.getObjectByName('box-open')?.visible).toBe(false);
    const tree = s.props[2];
    Object.assign(tree, { state: PropSt.FALLING, fromX: 1, fromZ: 8, fromLevel: 3, x: 5, z: 8, level: 0, dir: 3, fallTicks: 18, fallTimer: 18 });
    s.tick = 3;
    view.update(s, 3, 0, null, true);
    Object.assign(tree, { fallTimer: 0 });
    view.update(s, 21, 0, null, true);
    const top = view.propPosition(2, new Vector3())!;
    expect(top.y).toBeLessThan(0.5);
  });
});

describe('props view hand-back', () => {
  it('keeps the dropped cloth and the toppled tree drawn after their animations end', () => {
    const shell = fixtureShell('living');
    const play = fixturePlayFor(shell, 'xmas', [
      { kind: 14, x: 4, z: 4, level: 1, rot: 0, w: 2, d: 1 },
      { kind: 17, x: 1, z: 8, level: 0, rot: 0 },
    ]);
    const view = new PropsView(play, mat());
    const s = fixtureStateFor(play);
    const cloth = s.props[0];
    const tree = s.props[1];
    const inst = (name: string) => view.group.getObjectByName(name) as unknown as { instanceMatrix: { array: Float32Array } };
    for (let t = 0; t < 120; t++) {
      s.tick = t;
      if (t === 10) cloth.z = 5;
      if (t === 30) Object.assign(cloth, { state: PropSt.LANDED, restTick: 30, fromX: cloth.x, fromZ: cloth.z });
      if (t === 40) Object.assign(tree, { state: PropSt.FALLING, fromX: 1, fromZ: 8, fromLevel: 3, x: 5, z: 8, level: 0, dir: 3, fallTicks: 18, fallTimer: 18 });
      if (t > 40 && tree.state === PropSt.FALLING) tree.fallTimer = Math.max(0, 58 - t);
      if (t === 58) Object.assign(tree, { state: PropSt.LANDED, restTick: 58 });
      view.update(s, t, 0, null, true);
    }
    // both are back in their instanced meshes with a non-zero scale, and no pooled mesh is left showing
    expect(inst('prop-14:2:1').instanceMatrix.array[0]).not.toBe(0);
    expect(inst('prop-17').instanceMatrix.array[0]).not.toBe(0);
    expect(view.group.children.filter((c) => c.type === 'Mesh' && c.visible && !c.name).length).toBe(0);
    // the tree lies down: its top is near the floor, toward +x
    const m = inst('prop-17').instanceMatrix.array;
    expect(m[13]).toBeLessThan(0.2);
  });
});

describe('world dynamics', () => {
  const scenarios: { name: string; shell: FixtureShell; theme: RoomTheme }[] = [
    { name: 'living xmas (Roomba, cable, tree, fire, TV)', shell: 'living', theme: 'xmas' },
    { name: 'boss nye (Roomba, webcam, disco)', shell: 'boss', theme: 'nye' },
    { name: 'bath birthday', shell: 'bath-bed', theme: 'birthday' },
    { name: 'kitchen default', shell: 'kitchen', theme: 'default' },
  ];
  for (const sc of scenarios) {
    it(`${sc.name}: updates synthetic v5 states without throwing or allocating after warm-up`, () => {
      const shell = fixtureShell(sc.shell);
      const props = denseProps(shell);
      if (!props.some((p) => p.kind === 17)) props.push({ kind: 17, x: 1, z: shell.depth - 1, level: 0, rot: 0 });
      if (!props.some((p) => p.kind === 9)) props.push({ kind: 9, x: 2, z: shell.depth - 1, level: 0, rot: 0, cable: { x: 3, z: shell.depth - 1 } });
      const play = fixturePlayFor(shell, sc.theme, props);
      const dyn = createWorldDynamics(play, mat());
      const s = fixtureStateFor(play);
      const lamp = props.findIndex((p) => p.kind === 9);
      const tree = props.findIndex((p) => p.kind === 17);
      const W = shell.width;
      // puddles, a Roomba driving its loop, a cable tug, a topple, a framed crash, an ad break
      const events: SimEvent[][] = [
        [{ t: 'puddle', tick: 0, x: 3, z: 4, kind: 1 }],
        [{ t: 'pull', tick: 0, prop: lamp, dir: 5, kind: 'cable', moved: 1 }],
        [{ t: 'topple', tick: 0, prop: tree, cells: 4, dir: 3 }],
        [{ t: 'framed', tick: 0, prop: 0 }],
        [],
      ];
      const loop = shell.roombaLoop;
      const v = new Vector3();
      const empty: SimEvent[] = [];
      const frame = (tick: number, withEvents: boolean) => {
        s.tick = tick;
        const r = s.roomba;
        if (r && loop) {
          const step = Math.floor(tick / 24);
          const a = loop[step % loop.length];
          const b = loop[(step + 1) % loop.length];
          r.fromX = a.x;
          r.fromZ = a.z;
          r.x = b.x;
          r.z = b.z;
          r.stepProgress = tick % 24;
          r.pause = step % 5 === 4 ? 10 : 0;
        }
        if (tick === 30) {
          s.grid.puddle![4 * W + 3] = 1;
          s.grid.puddle![5 * W + 3] = 2;
        }
        s.eventActive = tick % 200 < 100 ? 1 : 0;
        if (tree >= 0 && tick === 60) Object.assign(s.props[tree], { state: PropSt.FALLING, fromX: s.props[tree].x, fromZ: s.props[tree].z, x: Math.min(W - 1, s.props[tree].x + 4), fallTicks: 18, fallTimer: 18, dir: 3 });
        if (lamp >= 0 && tick === 90) Object.assign(s.props[lamp], { state: PropSt.BROKEN, restTick: 90 });
        dyn.update(s, (tick % 7) / 7, withEvents && tick % 50 === 0 ? events[(tick / 50) % events.length] : empty);
        dyn.roombaPosition(v);
      };
      // warm-up with every event kind (events may allocate a little: a pop burst, a sticker), then steady frames
      for (let t = 0; t < 4000; t++) frame(t, true);
      if (loop) expect(dyn.roombaPosition(new Vector3())).not.toBeNull();
      else expect(dyn.roombaPosition(new Vector3())).toBeNull();
      for (let t = 4000; t < 6000; t++) frame(t, false);
      // allocation check: steady frames (Roomba driving and pausing, puddles, wet tracks, ad break, twinkle) must
      // not grow the heap. An empty loop shows ~50-80 KB of noise per 3000 frames; one Vector3 per frame adds ~150 KB.
      // The minimum of three windows filters out the JIT re-optimising in the middle of one.
      let best = Infinity;
      let t0 = 6000;
      for (let w = 0; w < 3; w++) {
        const before = process.memoryUsage().heapUsed;
        for (let t = t0; t < t0 + 3000; t++) frame(t, false);
        t0 += 3000;
        best = Math.min(best, process.memoryUsage().heapUsed - before);
      }
      expect(best).toBeLessThan(140_000);
      dyn.dispose();
      expect(dyn.group.children.length).toBe(0);
    });
  }

  it('has no Roomba when the room has none (v4 rooms keep the static prop)', () => {
    const play = fixturePlayFor(fixtureShell('kitchen'), 'default', [{ kind: 20, x: 6, z: 3, level: 0, rot: 0 }]);
    const dyn = createWorldDynamics(play, mat());
    const s = fixtureStateFor(play);
    s.roomba = null;
    dyn.update(s, 0, []);
    expect(dyn.roombaPosition(new Vector3())).toBeNull();
    expect(propKind(20)?.actor).toBe('roomba');
  });
});

