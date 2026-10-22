/**
 * ANIM-SPEC §4.5 / §12 root.test: every clip (shared clips, templates, every hero's MoveSet) compiles against all 8
 * hero layouts with no NaN quaternion; horizontal root channels end at 0; the caps hold (|fwd|, |side| ≤ 0.30 m,
 * 0 ≤ up ≤ 1.2 m except Lambo E ≤ 1.75 m); the runtime clamps and the mover keeps the feet on the ground.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HERO_IDS } from '../../../src/data/heroes';
import { makeHero } from '../../../src/render/chars';
import { compileClip } from '../../../src/render/anim/compile';
import { COMMON, flip, kneelShot, leap, pose, roll, slam, spinSlash, swing, taunt, thrust, throwOverhand } from '../../../src/render/anim/common';
import { HERO_ANIM } from '../../../src/render/anim/registry';
import { RootState, ROOT_CAPS, COM_SHARE } from '../../../src/render/anim/root';
import type { ClipDef, MoveSet } from '../../../src/render/anim/types';

const TEMPLATES: ClipDef[] = [
  swing({ id: 't.swing' }),
  thrust({ id: 't.thrust' }),
  spinSlash({ id: 't.spin' }),
  flip({ id: 't.flip' }),
  flip({ id: 't.backflip', dir: -1, apex: 1.1 }),
  roll({ id: 't.roll' }),
  leap({ id: 't.leap' }),
  slam({ id: 't.slam' }),
  throwOverhand({ id: 't.throw' }),
  kneelShot({ id: 't.kneel' }),
  taunt({ id: 't.taunt' }),
  pose({ id: 't.pose', pose: 'cheer' }),
];

function clipsOf(m: MoveSet): ClipDef[] {
  const out: ClipDef[] = [...m.basic, m.idle, m.victory, m.emote, m.death];
  if (m.respawn) out.push(m.respawn);
  if (m.levelUp) out.push(m.levelUp);
  for (const [c] of m.fidgets) out.push(c);
  for (const s of Object.values(m.slots)) {
    out.push(s.cast);
    for (const c of [s.branch, s.hold, s.end, s.onHit, ...(s.recasts ?? [])]) if (c) out.push(c);
  }
  return out;
}

async function allClips(): Promise<ClipDef[]> {
  const out = [...TEMPLATES, ...Object.values(COMMON)];
  for (const h of HERO_IDS) out.push(...clipsOf((await HERO_ANIM[h].moves()).MOVES));
  return out;
}

describe('root motion', { timeout: 60000 }, () => {
  it('every clip compiles on all 8 layouts with finite quaternions', async () => {
    const clips = await allClips();
    for (const h of HERO_IDS) {
      const ch = makeHero(h, 0, null, { detail: 0.62 });
      for (const c of clips) {
        const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
        for (let i = 0; i < bin.q.length; i++) expect(Number.isFinite(bin.q[i])).toBe(true);
        for (let i = 0; i < bin.p.length; i++) expect(Number.isFinite(bin.p[i])).toBe(true);
      }
      ch.dispose();
    }
  }, 60000);

  it('caps and horizontal channels ending at 0', async () => {
    for (const c of await allClips()) {
      const r = c.root ?? {};
      for (const ch of ['fwd', 'side'] as const) {
        const ks = r[ch];
        if (!ks) continue;
        for (const [, v] of ks) expect(Math.abs(v), `${c.id} ${ch}`).toBeLessThanOrEqual(c.prio === 9 ? ROOT_CAPS.horizDead : ROOT_CAPS.horiz);
        // a death may leave the body flung; everything else returns to the hitbox
        if (c.prio !== 9) expect(ks[ks.length - 1][1], `${c.id} ${ch} ends at 0`).toBe(0);
      }
      const up = r.up;
      if (up) {
        const cap = /^lambo\.e/.test(c.id) ? ROOT_CAPS.upMax : ROOT_CAPS.upClip;
        for (const [, v] of up) {
          expect(v, `${c.id} up`).toBeGreaterThanOrEqual(0);
          expect(v, `${c.id} up`).toBeLessThanOrEqual(cap);
        }
      }
    }
  });

  it('the runtime clamps and keeps the feet on the ground under a squash', () => {
    const mover = new THREE.Group();
    const inner = new THREE.Group();
    const r = new RootState();
    r.fwd = 2;
    r.side = -2;
    r.up = 5;
    r.sy = 0.6;
    r.apply(mover, inner, 2.6, 1 / 60);
    expect(mover.position.x).toBeCloseTo(ROOT_CAPS.horiz, 6);
    expect(mover.position.z).toBeCloseTo(-ROOT_CAPS.horiz, 6);
    // feet at mover.y + inner.y × sy = up (≤ upMax)
    const feet = mover.position.y + inner.position.y * mover.scale.y;
    expect(feet).toBeCloseTo(ROOT_CAPS.upMax, 5);
    expect(inner.position.y).toBeCloseTo(-COM_SHARE * 2.6, 6);
    // a front flip (+pitch) tips the head forward (+x)
    r.reset();
    r.pitch = 0.25;
    r.apply(mover, inner, 2.6, 1 / 60);
    const head = new THREE.Vector3(0, 1, 0).applyEuler(mover.rotation);
    expect(head.x).toBeGreaterThan(0.9);
  });
});
