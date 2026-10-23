// @vitest-environment happy-dom
/**
 * Render bugs from the trailer v3.1 review (render only; nothing under src/sim changes): minion health bars that
 * floated over a fallen core with no unit under them (the minion view had stopped drawing the minion), bars of units
 * at 0 HP on the match-end frame, and the plate options the trailer rig uses (the hero's own name, no edge arrows,
 * no status chips, no minion bars, plate boxes for the type QC).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Overhead } from '../../src/ui/overhead';
import { MinionInstances } from '../../src/render/views/minionInstances';
import type { ViewFrame } from '../../src/render/interp';

const frame = (entities: object[]): ViewFrame => ({ entities, projectiles: [], byId: new Map((entities as { id: number }[]).map((e) => [e.id, e])) }) as unknown as ViewFrame;
const base = { team: 1, hp: 100, maxHp: 100, shield: 0, buffs: 0, yaw: 0, speed: 0, state: 'idle' };
const minion = (id: number, fx: number) => ({ ...base, id, kind: 'minion', variant: 'melee', fx, fy: 30000 });
const hero = (id: number, hero: string, team: number, fx: number) => ({ ...base, id, kind: 'hero', hero, team, level: 3, fx, fy: 30000 });

/** A 2D context stand-in that records the bars' fillRect widths and the text drawn. */
function fakeCtx() {
  const rects: number[][] = [];
  const texts: string[] = [];
  const ctx = new Proxy(
    { rects, texts },
    {
      get(t, k) {
        if (k === 'rects' || k === 'texts') return t[k as 'rects' | 'texts'];
        if (k === 'fillRect') return (...a: number[]) => rects.push(a);
        if (k === 'fillText') return (s: string) => texts.push(s);
        if (k === 'measureText') return (s: string) => ({ width: s.length * 6 });
        if (k === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
        return () => undefined;
      },
      set: () => true,
    },
  );
  return ctx as unknown as CanvasRenderingContext2D & { rects: number[][]; texts: string[] };
}

function setup(): { o: Overhead; ctx: ReturnType<typeof fakeCtx>; cam: THREE.PerspectiveCamera } {
  const o = new Overhead(document.body);
  const ctx = fakeCtx();
  (o as unknown as { g: CanvasRenderingContext2D }).g = ctx;
  const cam = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 500);
  cam.position.set(90, 25, -10);
  cam.lookAt(90, 0, -30);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return { o, ctx, cam };
}

describe('overhead bars follow what is drawn', () => {
  it('a minion the minion view does not draw gets no bar; a drawn one sits over its drawn body', () => {
    const { o, ctx, cam } = setup();
    o.boxes = [];
    const f = frame([minion(100, 89000), minion(101, 91000)]);
    o.draw(f, cam, () => 1);
    expect(o.boxes.filter((b) => b.kind === 'minion')).toHaveLength(2);
    o.minionAt = (id) => (id === 100 ? { x: 89.5, z: -30 } : null);
    ctx.rects.length = 0;
    o.draw(f, cam, () => 1);
    const bars = o.boxes.filter((b) => b.kind === 'minion');
    expect(bars.map((b) => b.id)).toEqual([100]);
    // over the drawn x (89.5 m), not the sim x (89 m)
    const v = new THREE.Vector3(89.5, 1.9, -30).project(cam);
    expect(Math.abs((bars[0].x0 + bars[0].x1) / 2 - (v.x * 0.5 + 0.5) * window.innerWidth)).toBeLessThan(1);
  });

  it('a unit at 0 HP (the match-end frame) gets no bar', () => {
    const { o, cam } = setup();
    o.boxes = [];
    o.draw(frame([{ ...minion(100, 89000), hp: 0 }, { ...base, id: 55, kind: 'core', fx: 90000, fy: 30000, hp: 0, maxHp: 5000 }]), cam, () => 1);
    expect(o.boxes).toHaveLength(0);
  });

  it('the minion view records where it drew each minion and forgets the ones it no longer draws', () => {
    const m = new MinionInstances();
    m.update(frame([minion(100, 89000), minion(101, 91000)]), 1 / 60, 0);
    expect([...m.drawnAt.keys()].sort()).toEqual([100, 101]);
    m.clearZones = [{ x: 91, z: -30, r: 2 }];
    m.update(frame([minion(100, 89000), minion(101, 91000)]), 1 / 60, 0.1);
    expect([...m.drawnAt.keys()]).toEqual([100]);
  });
});

describe('trailer plate options (defaults keep the game as it was)', () => {
  it('selfName shows the hero name on the own plate; statusChips off drops the chip; edge arrows can be turned off', () => {
    const { o, ctx, cam } = setup();
    o.mySlot = 0;
    o.myTeam = 0;
    const stunned = { ...hero(0, 'lambo', 0, 90000), buffs: 1 << 30 };
    o.draw(frame([stunned]), cam, () => 1);
    expect(ctx.texts).toContain('You');
    ctx.texts.length = 0;
    o.selfName = true;
    o.draw(frame([stunned]), cam, () => 1);
    expect(ctx.texts).toContain('Lambo');
    expect(ctx.texts).not.toContain('You');
    expect(o.edgeArrows && o.statusChips && o.minionBars).toBe(true);
    o.minionBars = false;
    o.boxes = [];
    o.draw(frame([minion(100, 89000), hero(1, 'clem', 0, 90000)]), cam, () => 1);
    expect(o.boxes.map((b) => b.kind)).toEqual(['hero']);
  });
});

describe('a falling core is drawn solid, with a glow (no grey ghost box)', () => {
  it('the fall starts opaque even when an x-ray fade was under way, and its flash stays a tint', async () => {
    const { StructureView, FALL_FLASH } = await import('../../src/render/views/towerView');
    const v = new StructureView();
    const core = { ...base, id: 55, kind: 'core', team: 1, fx: 90000, fy: 30000, hp: 100, maxHp: 1000 };
    v.update(frame([core]), 1 / 60);
    type Item = { material: THREE.Material & { transparent: boolean }; rig: { uFlashK: { value: number }; uOpacity: { value: number } }; dieT: number };
    const it = (v as unknown as { items: Map<number, Item> }).items.get(55) as Item;
    it.rig.uOpacity.value = 0.4;
    it.material.transparent = true;
    v.update(frame([]), 1 / 60);
    expect(it.dieT).toBe(0);
    expect(it.rig.uOpacity.value).toBe(1);
    expect(it.material.transparent).toBe(false);
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      v.update(frame([]), 1 / 60);
      peak = Math.max(peak, it.rig.uFlashK.value);
      expect(it.material.transparent).toBe(false);
    }
    expect(peak).toBeLessThanOrEqual(FALL_FLASH.core + 1e-6);
    expect(peak).toBeGreaterThan(0.1);
  });
});
