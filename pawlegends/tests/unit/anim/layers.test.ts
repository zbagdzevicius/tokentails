/**
 * ANIM-SPEC §4.4: the layer stack. Blend-in weights, masks (an upper clip keeps the gait legs), priorities (lower
 * refused, higher interrupts, equal cross-fades), additive layers, the directional reaction slot (a hit never cancels
 * the caster's own clip), the local freeze, and the Animator skipping the legacy swing under a clip.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeHero } from '../../../src/render/chars';
import { BONE_INDEX, BONE_NAMES } from '../../../src/render/chars/skeleton';
import { LayerStack } from '../../../src/render/anim/layers';
import { newAnchors, Prio, type ClipDef } from '../../../src/render/anim/types';

const bones = (): { q: THREE.Quaternion[]; p: THREE.Vector3[] } => ({ q: BONE_NAMES.map(() => new THREE.Quaternion()), p: BONE_NAMES.map(() => new THREE.Vector3()) });

const raise = (id: string, mask: ClipDef['mask'], prio: Prio, extra: Partial<ClipDef> = {}): ClipDef => ({
  id,
  len: 1,
  mask,
  mode: 'override',
  prio,
  blendIn: 0.1,
  keys: [[0, null, { shoulderR: [-1.5, 0, 0], thighL: [-1, 0, 0] }], [1, null, { shoulderR: [-1.5, 0, 0], thighL: [-1, 0, 0] }]],
  markers: {},
  warp: [],
  ...extra,
});

function stackOf(): { stack: LayerStack; idle: string } {
  const ch = makeHero('clem', 0, null, { detail: 0.62 });
  return { stack: ch.anim.stack, idle: ch.anim.profile.idle };
}

describe('LayerStack', () => {
  it('blends in over blendIn and masks the legs out of an upper clip', () => {
    const { stack } = stackOf();
    stack.update(0, 0);
    expect(stack.play(raise('a.up', 'upper', Prio.Basic), { anchors: newAnchors() })).toBe(true);
    stack.update(0.05, 0.05);
    const w = stack.overrideWeight();
    expect(w).toBeGreaterThan(0.2);
    expect(w).toBeLessThan(0.8);
    stack.update(0.3, 0.25);
    expect(stack.overrideWeight()).toBeCloseTo(1, 5);
    const b = bones();
    stack.applyOverride(b.q, b.p);
    // the arm moved, the leg (masked out) did not
    expect(b.q[BONE_INDEX.shoulderR].angleTo(new THREE.Quaternion())).toBeGreaterThan(0.3);
    expect(b.q[BONE_INDEX.thighL].angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
  });

  it('refuses a lower priority, interrupts with a higher one, cross-fades equal ones', () => {
    const { stack } = stackOf();
    stack.update(0, 0);
    stack.play(raise('a.cast', 'full', Prio.Ability), { anchors: newAnchors() });
    stack.update(0.2, 0.2);
    expect(stack.play(raise('a.basic', 'full', Prio.Basic), { anchors: newAnchors() })).toBe(false);
    expect(stack.play(raise('a.ult', 'full', Prio.Ult), { anchors: newAnchors() })).toBe(true);
    expect(stack.current()?.bin?.id).toBe('a.ult');
    expect(stack.play(raise('a.ult2', 'full', Prio.Ult), { anchors: newAnchors() })).toBe(true);
    stack.update(0.22, 0.02);
    // two playing: the new one in, the old one fading
    expect(stack.over.filter((p) => p.active).length).toBe(2);
    expect(stack.playing('a.ult')).toBeNull();
  });

  it('cancel rules: an equal-priority clip waits for afterContact', () => {
    const { stack } = stackOf();
    stack.update(0, 0);
    const c = raise('a.q1', 'full', Prio.Ability, { cancel: 'afterContact', markers: { contact: 0.3 } });
    stack.play(c, { anchors: newAnchors() });
    stack.update(0.1, 0.1);
    expect(stack.play(raise('a.q2', 'full', Prio.Ability), { anchors: newAnchors() })).toBe(false);
    stack.update(0.4, 0.3);
    expect(stack.play(raise('a.q2', 'full', Prio.Ability), { anchors: newAnchors() })).toBe(true);
  });

  it('additive layers multiply on top', () => {
    const { stack } = stackOf();
    stack.update(0, 0);
    const add: ClipDef = { ...raise('a.add', 'full', Prio.Emote), mode: 'additive', blendIn: 0 };
    stack.play(add, { anchors: newAnchors() });
    stack.update(0.01, 0.01);
    const b = bones();
    b.q[BONE_INDEX.shoulderR].setFromEuler(new THREE.Euler(0.2, 0, 0));
    stack.applyAdditive(b.q, b.p, 0.01);
    expect(new THREE.Euler().setFromQuaternion(b.q[BONE_INDEX.shoulderR]).x).toBeCloseTo(0.2 - 1.5, 3);
  });

  it('the reaction slot never cancels the caster clip; it is directional', () => {
    const { stack } = stackOf();
    stack.update(0, 0);
    stack.play(raise('a.cast', 'full', Prio.Ability), { anchors: newAnchors() });
    stack.update(0.2, 0.2);
    stack.yaw = 0;
    // pushed toward +x (from behind): the body lurches forward (+fwd), not back
    stack.react('light', 1, 0);
    stack.sumRoot();
    const b = bones();
    stack.applyAdditive(b.q, b.p, 0.05);
    expect(stack.root.fwd).toBeGreaterThan(0);
    expect(stack.current()?.bin?.id).toBe('a.cast');
  });

  it('a local freeze holds the clip clock, then repays', () => {
    const { stack } = stackOf();
    stack.update(0, 0);
    stack.play(raise('a.cast', 'full', Prio.Ability), { anchors: newAnchors() });
    stack.update(0.2, 0.2);
    const t0 = stack.current()!.t;
    stack.freeze(100);
    stack.update(0.25, 0.05);
    expect(stack.current()!.t).toBeCloseTo(t0, 6);
    expect(stack.freezeLeft).toBeGreaterThan(0);
  });

  it('the Animator plays the legacy swing only when no clip overrides', () => {
    const ch = makeHero('clem', 0, null, { detail: 0.62 });
    const inp = { state: 'idle' as const, speed: 0, height: ch.height, yawRate: 0, now: 0 };
    ch.anim.update(1 / 60, inp);
    const before = ch.rig.bones[BONE_INDEX.shoulderR].quaternion.clone();
    ch.anim.stack.play(raise('c.full', 'full', Prio.Ability, { blendIn: 0 }), { anchors: newAnchors() });
    ch.anim.swing(0);
    for (let i = 1; i <= 6; i++) ch.anim.update(1 / 60, { ...inp, now: i / 60 });
    const after = ch.rig.bones[BONE_INDEX.shoulderR].quaternion;
    // the clip's raised arm wins over the legacy slash arc
    expect(after.angleTo(before)).toBeGreaterThan(0.5);
    ch.dispose();
  });
});
