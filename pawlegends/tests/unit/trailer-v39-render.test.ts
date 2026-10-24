// @vitest-environment happy-dom
/**
 * Render bugs from the trailer v3.8 review (render only; nothing under src/sim changes):
 * - heroes and cadets walked through a boulder on the lane: the pile left on a fallen tower's base (cells the sim frees)
 *   stood there for the rest of the match; it now sinks away with the rubble line;
 * - the dog core sank into the plaza over 0.8 s and its sunk roof under the dust read as a see-through slab with the
 *   bone floating in it: the core is crushed flat on the spot about 7 frames after its burst and is gone;
 * - a pickup's beam (additive, both walls) summed to a yellow-white light cone over the lane sand: normal blending now;
 * - Sage's victory arrow streak stood on the ground and ran through her head and body: it starts above her bow;
 * - Sage's victory backflip drew the winning hero upside down under VICTORY!: the jump is a spin, she stays upright.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CORE_GONE, FALL_SHAPE, RUBBLE, STRUCT_ANIM, StructureView } from '../../src/render/views/towerView';
import { PICKUP_BEAM, PickupView } from '../../src/render/views/pickupView';
import { SKY_ARROW_Y } from '../../src/render/skillfx/sage';
import { SAGE_CLIPS } from '../../src/render/moves/sage';
import { makeHero } from '../../src/render/chars';
import type { ViewFrame } from '../../src/render/interp';

const frame = (entities: object[]): ViewFrame => ({ entities, projectiles: [], byId: new Map() }) as unknown as ViewFrame;
const tower = { id: 46, kind: 'tower', team: 0, fx: 34000, fy: 51000, hp: 100, maxHp: 1000, buffs: 0, variant: 'outer', yaw: 0, speed: 0 };
const core = { ...tower, id: 55, kind: 'core', team: 1, fx: 90000, fy: 30000, variant: undefined };
type Item = { mesh: THREE.Mesh };
const item = (v: StructureView, id: number): Item => (v as unknown as { items: Map<number, Item> }).items.get(id)!;
const rubble = (v: StructureView): THREE.Mesh[] => (v as unknown as { rubble: THREE.Mesh[] }).rubble;

describe('no rock is left on walkable ground', () => {
  for (const reduced of [false, true]) {
    it(`a fallen tower's base pile sinks away with its rubble line${reduced ? ' (reduce motion)' : ''}`, () => {
      const v = new StructureView();
      v.reduced = reduced;
      v.update(frame([tower]), 1 / 60);
      v.fell(46);
      for (let t = 0; t < STRUCT_ANIM.fallTower + 0.1; t += 1 / 60) v.update(frame([]), 1 / 60);
      expect(rubble(v).length).toBeGreaterThan(0);
      for (let t = 0; t < RUBBLE.hold + RUBBLE.sink + 1; t += 1 / 60) v.update(frame([]), 1 / 60);
      // v3.8: the 7 pieces on the tower's base stayed (the lane boulder Muffin the Brutus walked through)
      expect(rubble(v).length).toBe(0);
      v.dispose();
    });
  }
});

describe('the core is crushed flat and gone, never a sunk see-through slab', () => {
  it('gone about 7 frames after its burst, never below the plaza while drawn', () => {
    const v = new StructureView();
    v.update(frame([core]), 1 / 60);
    v.fell(55);
    let goneAt = -1;
    let minY = 0;
    let t = 0;
    for (; t < STRUCT_ANIM.fallCore + 0.2; t += 1 / 60) {
      v.update(frame([]), 1 / 60);
      const m = item(v, 55).mesh;
      if (m.visible) minY = Math.min(minY, m.position.y);
      else if (goneAt < 0) goneAt = t;
    }
    expect(minY).toBeGreaterThanOrEqual(0);
    const burst = FALL_SHAPE.burst * STRUCT_ANIM.fallCore;
    expect(goneAt).toBeGreaterThan(burst);
    // v3.8: drawn until the end of the 1.3 s fall, the last 0.7 s sunk into the plaza under the dust
    expect((goneAt - burst) * 60).toBeLessThanOrEqual(9);
    expect(CORE_GONE).toBeLessThan(0.2);
    // the rubble is laid on the burst (it grows in under the dust)
    expect(rubble(v).length).toBeGreaterThan(0);
    v.dispose();
  });
});

describe('pickup beam', () => {
  it('is drawn in its own colour with normal blending (no additive white cone on sand)', () => {
    const v = new PickupView();
    v.spawn(1, 'snack', 30000, 50000);
    v.spawn(2, 'frenzy', 40000, 50000);
    const beams: THREE.Mesh[] = [];
    v.group.traverse((o) => {
      if (o.name === 'pickup-beam') beams.push(o as THREE.Mesh);
    });
    expect(beams.length).toBe(2);
    for (const b of beams) {
      const m = b.material as THREE.MeshBasicMaterial;
      expect(m.blending).toBe(THREE.NormalBlending);
      expect(m.opacity).toBeLessThanOrEqual(PICKUP_BEAM.opacity);
      expect(m.opacity).toBeLessThan(0.3);
    }
    v.dispose();
  });
});

describe("Sage's victory arrow", () => {
  it('its streak starts above her head', () => {
    const ch = makeHero('sage', 0, null, { detail: 0.62 });
    expect(SKY_ARROW_Y).toBeGreaterThan(ch.height + 0.3);
    ch.dispose();
  });
});

describe("Sage's victory jump", () => {
  it('turns about the vertical axis (a spin), never pitches her over', () => {
    const r = SAGE_CLIPS.victory.root!;
    for (const [, v] of r.pitch ?? []) expect(Math.abs(v)).toBeLessThan(0.1);
    for (const [, v] of r.roll ?? []) expect(Math.abs(v)).toBeLessThan(0.1);
    expect(Math.max(...(r.yaw ?? []).map(([, v]) => v))).toBe(1);
  });
});
