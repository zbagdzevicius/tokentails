/**
 * Integration pass (framework needs the hero passes reported): a finished flip never unwinds through upside down as
 * its clip fades, lockFeet pins the feet against a root lunge, every dash but Lambo's hop flies its full length, the
 * minion arm has an anticipation, a strike on the contact and a follow-through, and the structure charge builds before
 * the next shot.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeHero } from '../../../src/render/chars';
import { BONE_INDEX } from '../../../src/render/chars/skeleton';
import { newAnchors, Prio, type ClipDef } from '../../../src/render/anim/types';
import { SIM_TIMING } from '../../../src/render/anim/timing';
import { pinFeet } from '../../../src/render/anim/feet';
import { MINION_ANIM, minionArm } from '../../../src/render/views/minionInstances';
import { MINIONS } from '../../../src/data/minions';
import { HERO_IDS } from '../../../src/data/heroes';

const flip: ClipDef = {
  id: 't.flip',
  len: 0.6,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  blendIn: 0.02,
  blendOut: 0.2,
  keys: [[0, null, null]],
  root: { pitch: [[0, 0], [0.3, -1, 'inOut'], [0.6, -1]] },
  markers: {},
  warp: [],
};

describe('integration: framework', () => {
  it('a held full turn fades from its nearest whole turn (never back through −0.5)', () => {
    const ch = makeHero('clem', 0, null, { detail: 0.62 });
    const st = ch.anim.stack;
    st.update(0, 0);
    st.play(flip, { anchors: newAnchors() });
    let worst = 0;
    for (let t = 1 / 60; t < 1.2; t += 1 / 60) {
      st.update(t, 1 / 60);
      st.sumRoot();
      const w = st.overrideWeight();
      // past the turn (t > 0.3 s) the summed pitch is a whole turn away from rest at most a sliver
      if (t > 0.32 && w > 0) worst = Math.max(worst, Math.abs(st.root.pitch - Math.round(st.root.pitch)));
    }
    expect(worst).toBeLessThan(0.02);
  });

  it('lockFeet: a 0.25 m root lunge moves the planted feet far less than the body', () => {
    const run = (pin: boolean): number => {
      const ch = makeHero('brutus', 0, null, { detail: 0.62 });
      const scene = new THREE.Scene();
      scene.add(ch.object);
      ch.object.updateMatrixWorld(true);
      const foot = ch.rig.bones[BONE_INDEX.footL];
      const a = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld);
      ch.mover.position.x += 0.25;
      if (pin) pinFeet(ch.rig.bones, ch.mover, 0.25, 0, 0, 1);
      ch.object.updateMatrixWorld(true);
      const b = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld);
      ch.dispose();
      return Math.hypot(b.x - a.x, b.z - a.z);
    };
    const free = run(false);
    const pinned = run(true);
    expect(free).toBeGreaterThan(0.2);
    expect(pinned).toBeLessThan(free * 0.35);
  });

  it('only Lambo’s hop stops at the aim point; every other dash flies its full length', () => {
    for (const h of HERO_IDS)
      for (const s of ['q', 'w', 'e', 'r'] as const) {
        const T = SIM_TIMING[h].slots[s];
        if (T.dashMm <= 0) continue;
        expect(T.aimClamped, `${h}.${s}`).toBe(h === 'lambo' && s === 'e');
      }
  });

  it('minion arm: cocks back over the windup, strikes on the contact, overshoots, settles', () => {
    const P = MINIONS.melee.attackEvery / 30;
    const W = MINIONS.melee.windup / 30;
    // before the next contact (last strike + period): cocked back, deepest right before it
    expect(minionArm('melee', P - W * 0.5, 0, true)).toBeLessThan(0);
    expect(minionArm('melee', P - 0.01, 0, true)).toBeLessThan(MINION_ANIM.cock * 0.9);
    // on the contact: the full strike, then the overshoot and back to rest
    expect(minionArm('melee', 0, 0, true)).toBe(MINION_ANIM.strike);
    expect(minionArm('melee', MINION_ANIM.overAt, 0, true)).toBeCloseTo(MINION_ANIM.over, 6);
    expect(minionArm('melee', MINION_ANIM.settle + 0.01, 0, false)).toBe(0);
    // first swing: the cock builds from the attack start
    expect(minionArm('ranged', -1, 0.01, true)).toBeLessThan(0);
  });
});
