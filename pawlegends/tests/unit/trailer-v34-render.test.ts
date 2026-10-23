// @vitest-environment happy-dom
/**
 * Render bugs from the trailer v3.3 review (render only; nothing under src/sim changes): a dog hero whose stealth
 * lasted a few ticks snapped to a pale see-through grey copy and back, the bodies froze in one pose after the match
 * ended (the render clock stops there), and the dog tower's crack flash turned it pale and see-through-looking.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ViewFrame } from '../../src/render/interp';
import { animStep, END_IDLE, STEALTH_LOOK, stealthAlpha } from '../../src/render/views/heroView';

const frame = (entities: object[]): ViewFrame => ({ entities, projectiles: [], byId: new Map((entities as { id: number }[]).map((e) => [e.id, e])) }) as unknown as ViewFrame;
const base = { team: 1, hp: 100, maxHp: 100, shield: 0, buffs: 0, yaw: 0, speed: 0, state: 'idle' };

describe('a short stealth is a shimmer, not a grey copy popping in', () => {
  it('a 3-tick stealth (6 drawn frames) keeps the body above 0.6 alpha and its outline on', () => {
    let a = 1;
    let low = 1;
    for (let f = 0; f < 6; f++) {
      a = stealthAlpha(a, true, 1 / 60);
      low = Math.min(low, a);
    }
    for (let f = 0; f < 60; f++) a = stealthAlpha(a, false, 1 / 60);
    expect(low).toBeGreaterThanOrEqual(STEALTH_LOOK.outlineBelow);
    expect(a).toBe(1);
  });
  it('a held stealth still reaches the stealth look within half a second, and never jumps more than 0.15 a frame', () => {
    let a = 1;
    let jump = 0;
    for (let f = 0; f < 30; f++) {
      const b = stealthAlpha(a, true, 1 / 60);
      jump = Math.max(jump, Math.abs(b - a));
      a = b;
    }
    expect(a).toBe(STEALTH_LOOK.alpha);
    expect(jump).toBeLessThanOrEqual(0.15);
  });
});

describe('the bodies keep idling after the match ends', () => {
  it('the render clock step during play (a hit-stop holds the pose), real time once the ended clock stands still', () => {
    expect(animStep(0, 1 / 60, false, 5)).toBe(0);
    expect(animStep(0, 1 / 60, true, END_IDLE.after / 2)).toBe(0);
    expect(animStep(0, 1 / 60, true, END_IDLE.after)).toBeCloseTo(1 / 60);
    expect(animStep(0.02, 1 / 60, true, 0)).toBe(0.02);
  });
});

describe('the dog tower cracks with a warm faint glow (no pale see-through frame)', () => {
  it('its crack tint is warm and at most FALL_FLASH.tower', async () => {
    const { StructureView, FALL_FLASH } = await import('../../src/render/views/towerView');
    expect(FALL_FLASH.tower).toBeLessThanOrEqual(0.1);
    const v = new StructureView();
    const tower = { ...base, id: 50, kind: 'tower', team: 1, fx: 70000, fy: 30000, hp: 10, maxHp: 1000 };
    v.update(frame([tower]), 1 / 60);
    type Item = { rig: { uFlashK: { value: number }; uFlash: { value: THREE.Color } } };
    const item = (v as unknown as { items: Map<number, Item> }).items.get(50) as Item;
    v.update(frame([]), 1 / 60);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      v.update(frame([]), 1 / 60);
      peak = Math.max(peak, item.rig.uFlashK.value);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(FALL_FLASH.tower + 1e-6);
    expect(item.rig.uFlash.value.getHex()).toBe(FALL_FLASH.color);
  });
});
