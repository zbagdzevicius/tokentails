/**
 * PERF-IOS §8 Track B (CPU and garbage): the per-frame paths reuse their records instead of allocating, the shadow
 * casters keep one depth-material variant each (no program-key rebuild on a steady frame), and the audio graph reuses
 * its output chains and baked music notes. Render and audio only; nothing under src/sim changes.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { EntitySnap, Snapshot } from '../../src/sim/api';
import { SnapBuffer, copyView, type ViewEntity } from '../../src/render/interp';
import { layoutBodies, layoutBodiesInto, layoutScratch, clearOfObstacles, SEPARATION } from '../../src/render/views/heroView';
import { pushOutDir } from '../../src/render/views/minionInstances';
import { casterDepthMaterial } from '../../src/render/views/rig';

const ent = (o: Partial<EntitySnap> & { id: number }): EntitySnap => ({
  kind: 'minion',
  team: 0,
  slot: 0,
  x: 1000,
  y: 2000,
  hp: 100,
  maxHp: 100,
  shield: 0,
  state: 'idle',
  facing: 0,
  buffs: 0,
  ...o,
});
const snap = (tick: number, entities: EntitySnap[]): Snapshot =>
  ({
    team: 0,
    clock: { tick, seconds: 0, phase: 'play', nextPhaseIn: 0 },
    score: { kills: [0, 0], towers: [0, 0] },
    entities,
    projectiles: [],
    zones: [],
    events: [],
  }) as unknown as Snapshot;

describe('SnapBuffer reuses its frame records', () => {
  it('one record per id across frames, with the same values a fresh spread gave', () => {
    const b = new SnapBuffer();
    b.push(snap(10, [ent({ id: 0, kind: 'hero', hero: 'clem', x: 1000 }), ent({ id: 40, x: 5000 })]));
    b.push(snap(11, [ent({ id: 0, kind: 'hero', hero: 'clem', x: 2000, charmed: true }), ent({ id: 40, x: 5000 })]));
    const f1 = b.sample(10.5)!;
    const h1 = f1.byId.get(0)!;
    expect(h1.fx).toBeCloseTo(1500);
    expect(h1.charmed).toBe(true);
    expect(h1.hero).toBe('clem');
    const f2 = b.sample(11)!;
    expect(f2.byId.get(0)).toBe(h1);
    expect(f2.entities[0]).toBe(h1);
    expect(h1.fx).toBe(2000);
    // an optional field the next snapshot leaves out is cleared, as a fresh `{ ...e }` would have left it out
    b.push(snap(12, [ent({ id: 0, kind: 'hero', hero: 'clem', x: 2000 })]));
    const f3 = b.sample(12)!;
    expect(f3.byId.get(0)).toBe(h1);
    expect(h1.charmed).toBeUndefined();
    // id 40 left the snapshot: gone from byId and the list
    expect(f3.byId.has(40)).toBe(false);
    expect(f3.entities.length).toBe(1);
  });

  it('copyView matches a spread on every EntitySnap field', () => {
    const e = ent({ id: 3, kind: 'hero', hero: 'sage', level: 4, cooldowns: [1, 2, 3, 4, 5], respawnIn: 9, xp: 70, talents: [0, 1, -1], resource: 12, branch: true, charged: true, charging: true, lockout: 2, charmed: true, form: true, channel: true, stacks: 2, dots: 3, fish: 40, toy: 1, bountyStreak: 3, lane: 'sunny', variant: 'x', sub: undefined });
    const v = copyView({} as ViewEntity, e, 1, 2, 3, 4);
    const want: Record<string, unknown> = { ...e, fx: 1, fy: 2, yaw: 3, speed: 4 };
    for (const k of Object.keys(want)) expect((v as unknown as Record<string, unknown>)[k], k).toEqual(want[k]);
  });

  it('projectiles are interpolated into reused records', () => {
    const b = new SnapBuffer();
    const p = (x: number) => ({ index: 2, team: 0, owner: 1, x, y: 0, vx: 100, vy: 0, kind: 0 });
    b.push({ ...snap(10, []), projectiles: [p(1000)] } as unknown as Snapshot);
    b.push({ ...snap(11, []), projectiles: [p(1100)] } as unknown as Snapshot);
    const a = b.sample(10.5)!.projectiles[0];
    expect(a.fx).toBeCloseTo(1050);
    expect(b.sample(11)!.projectiles[0]).toBe(a);
    expect(a.fx).toBe(1100);
  });
});

describe('hero layout writes into scratch arrays', () => {
  const pts = [
    { x: 0, z: 0 },
    { x: 0.3, z: 0.1 },
    { x: 5, z: 5 },
    { x: 5.2, z: 5.4 },
  ];
  const obs = [{ x: 0.5, z: 0.5, r: 1 }];
  const warm = [
    { x: 0.1, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0.2 },
    { x: 0, z: 0 },
  ];
  const radii = [0.7, 0.8, 0.6, 0.9];

  it('layoutBodiesInto gives layoutBodies` offsets and reuses its records', () => {
    const want = layoutBodies(pts, obs, warm, SEPARATION.min, SEPARATION.cap, radii);
    const ws = layoutScratch();
    layoutBodiesInto(pts, obs, warm, SEPARATION.min, SEPARATION.cap, radii, ws);
    const first = ws.out[0];
    for (let i = 0; i < pts.length; i++) {
      expect(ws.out[i].x).toBeCloseTo(want[i].x, 12);
      expect(ws.out[i].z).toBeCloseTo(want[i].z, 12);
    }
    layoutBodiesInto(pts, obs, warm, SEPARATION.min, SEPARATION.cap, radii, ws);
    expect(ws.out[0]).toBe(first);
    expect(ws.out[0].x).toBeCloseTo(want[0].x, 12);
  });

  it('clearOfObstacles and pushOutDir fill the record they are given', () => {
    const o = { x: 9, z: 9 };
    expect(clearOfObstacles(0.3, 0.2, obs, 0.5, 3.2, o)).toBe(o);
    expect(o).toEqual(clearOfObstacles(0.3, 0.2, obs));
    const d = { x: 0, z: 0 };
    expect(pushOutDir(1, 0, 0, 0, 2, d)).toBe(d);
    expect(d.x).toBeCloseTo(pushOutDir(1, 0, 0, 0, 2).x, 12);
  });
});

describe('shadow casters keep one depth-material variant each', () => {
  it('skinned, instanced and coloured-instanced casters get their own shared depth material', async () => {
    const s = casterDepthMaterial('skinned');
    const i = casterDepthMaterial('instanced');
    const c = casterDepthMaterial('instanced-color');
    expect(s).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect(new Set([s, i, c]).size).toBe(3);
    expect(casterDepthMaterial('instanced')).toBe(i);
    const { MinionInstances } = await import('../../src/render/views/minionInstances');
    const m = new MinionInstances();
    const meshes = m.group.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh === true && o.name.startsWith('minions-'));
    expect(meshes.length).toBe(6);
    for (const mesh of meshes) expect(mesh.customDepthMaterial).toBe(i);
  });
});

// ---------------------------------------------------------------------------------------------------------- audio
class Param {
  value = 0;
  setValueAtTime(): this {
    return this;
  }
  linearRampToValueAtTime(): this {
    return this;
  }
  exponentialRampToValueAtTime(): this {
    return this;
  }
  setTargetAtTime(): this {
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}
class Node0 {
  connect(): void {}
  disconnect(): void {}
}
class FakeCtx {
  static made = 0;
  currentTime = 0;
  state = 'running';
  sampleRate = 8000;
  destination = new Node0();
  nodes = 0;
  sources: { onended: (() => void) | null; stop(): void }[] = [];
  resume(): Promise<void> {
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
  createGain() {
    this.nodes++;
    return Object.assign(new Node0(), { gain: new Param() });
  }
  createStereoPanner() {
    this.nodes++;
    return Object.assign(new Node0(), { pan: new Param() });
  }
  createBiquadFilter() {
    this.nodes++;
    return Object.assign(new Node0(), { type: '', frequency: new Param() });
  }
  createOscillator() {
    this.nodes++;
    return Object.assign(new Node0(), { type: '', frequency: new Param(), start() {}, stop() {} });
  }
  createBufferSource() {
    this.nodes++;
    const s = Object.assign(new Node0(), {
      buffer: null as unknown,
      playbackRate: new Param(),
      onended: null as (() => void) | null,
      start() {},
      stop() {
        s.onended?.();
      },
    });
    this.sources.push(s);
    return s;
  }
  createBuffer(_c: number, len: number, rate: number) {
    return { duration: len / rate, length: len, getChannelData: () => new Float32Array(len) };
  }
}
class FakeOffline extends FakeCtx {
  constructor(_c: number, readonly length: number, rate: number) {
    super();
    this.sampleRate = rate;
  }
  startRendering() {
    return Promise.resolve(this.createBuffer(1, this.length, this.sampleRate));
  }
}

describe('audio reuses its nodes', () => {
  it('a sound effect builds one BufferSource; its gain (and panner) come from a pool', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const prev = g.AudioContext;
    g.AudioContext = FakeCtx;
    try {
      const { Sfx } = await import('../../src/audio/sfx');
      const s = new Sfx();
      s.unlock();
      const ac = s.context as unknown as FakeCtx;
      // let the zzfx bake slices finish
      for (let i = 0; i < 200 && (s as unknown as { buffers: Map<string, unknown> }).buffers.size < 5; i++) await new Promise((r) => setTimeout(r, 0));
      const name = [...(s as unknown as { buffers: Map<string, unknown> }).buffers.keys()][0];
      expect(name).toBeTruthy();
      const before = ac.nodes;
      for (let k = 0; k < 20; k++) {
        ac.currentTime += 0.1;
        s.play(name as never, k % 2 ? { at: { x: 6, z: 0 } } : {});
        // the sound ends before the next one
        ac.sources[ac.sources.length - 1].onended?.();
      }
      // 20 sources, plus one centred chain (1 gain) and one panned chain (gain + panner)
      expect(ac.nodes - before).toBe(20 + 3);
      expect(s.chainNodes).toBe(3);
    } finally {
      g.AudioContext = prev;
    }
  });

  it('a baked music note plays as one BufferSource', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const prevA = g.AudioContext;
    const prevO = g.OfflineAudioContext;
    g.AudioContext = FakeCtx;
    g.OfflineAudioContext = FakeOffline;
    try {
      const { sfx } = await import('../../src/audio/sfx');
      const { Music } = await import('../../src/audio/music');
      sfx.unlock();
      const ac = sfx.context as unknown as FakeCtx;
      const m = new Music();
      m.start();
      const tone = (m as unknown as { tone: (...a: unknown[]) => void }).tone.bind(m);
      tone(1, 'triangle', 440, 1, 0.2, 0.1, 0.005, 0.1);
      expect(m.livePlays).toBe(1);
      await new Promise((r) => setTimeout(r, 0));
      const before = ac.nodes;
      tone(1, 'triangle', 440, 2, 0.2, 0.1, 0.005, 0.1);
      expect(m.bakedPlays).toBe(1);
      expect(ac.nodes - before).toBe(1);
      m.stop();
    } finally {
      g.AudioContext = prevA;
      g.OfflineAudioContext = prevO;
    }
  });
});
