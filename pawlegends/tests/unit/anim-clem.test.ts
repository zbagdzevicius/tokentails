/**
 * Clem's move set and skill FX (ANIM-SPEC §14 "Clem"): the clips bind to the sim timings (basic windup, Tumble's
 * dash, The Stand's block end, the instant casts), stay inside the root caps and the spin rule, compile on her rig, the
 * picks follow the sim's combo / every-3rd-wave counting without allocating, and the skill FX draw the sim's shapes
 * (the Paw Combo cone, The Stand's front half for exactly the block, the Golden Hour wave's line and speed).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeHero } from '../../src/render/chars';
import { compileClip, ROOT_INDEX } from '../../src/render/anim/compile';
import { sampleClip, sampleScalar } from '../../src/render/anim/sampler';
import { BONES } from '../../src/render/anim/masks';
import { BONE_INDEX } from '../../src/render/chars/skeleton';
import { WEAPON_TIP } from '../../src/render/anim/fxctx';
import { BASIC_WINDUP, DASH_SPEED, SIM_TIMING, TICK_S, abilNumbers, travelTicks } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { PROJECTILE_KIND } from '../../src/data/towers';
import type { ClipDef, FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, Slot } from '../../src/render/anim/types';
import { CLEM_CLIPS, CLEM_LIVE, MOVES, SUN_CLEAVE_C_TURN } from '../../src/render/moves/clem';
import { SKILL_FX, resetClemFx } from '../../src/render/skillfx/clem';

const FRAME = 1 / 60;
const CLIPS = Object.values(CLEM_CLIPS) as ClipDef[];

function mctx(o: Partial<MoveCtx> = {}): MoveCtx {
  return { hero: 'clem', id: 0, branch: false, talents: [], comboIndex: 0, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false, ...o } as MoveCtx;
}

describe('clem moves', () => {
  it('is filled and binds every strike to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.hero).toBe('clem');
    expect(MOVES.basic.length).toBe(3);
    const period = SIM_TIMING.clem.period;
    // Golden Hour's +40% attack speed: the basic and the sun-cleave fit the shortened period too
    const fast = Math.floor(period / 1.4);
    for (const c of [...MOVES.basic, CLEM_CLIPS.sunCleave]) {
      expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S), c.id).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toContainEqual(['contact', 'contact']);
      expect(c.len, c.id).toBeLessThanOrEqual(period * TICK_S);
      expect(c.len, c.id).toBeLessThanOrEqual(fast * TICK_S + 0.05);
      expect(c.cancel).toBe('afterContact');
    }
    // the instant casts pin the strike on the cast tick
    expect(MOVES.slots.q.cast.warp).toEqual([['contact', 'cast']]);
    for (const c of MOVES.slots.q.recasts ?? []) expect(c.warp).toEqual([['contact', 'cast']]);
    expect(MOVES.slots.q.recasts?.length).toBe(SIM_TIMING.clem.slots.q.recasts);
    expect(MOVES.slots.r.cast.warp).toEqual([['contact', 'cast']]);
    // Golden Hour (no damage, +40% attack speed): Prio Ult only until before the earliest Golden Hour basic contact
    const r = MOVES.slots.r.cast;
    expect(r.len - (r.blendOut ?? 0.12)).toBeLessThanOrEqual(BASIC_WINDUP * TICK_S);
    // The Stand: guard on the cast, a held guard the director loops while the block lasts, the twirl on its end
    expect(MOVES.slots.w.cast.warp).toEqual([['contact', 'cast']]);
    expect(MOVES.slots.w.hold?.id).toBe('clem.wHold');
    expect(MOVES.slots.w.end?.warp).toEqual([['contact', 'stateEnd']]);
    for (const c of [MOVES.slots.w.cast, MOVES.slots.w.hold!, MOVES.slots.w.end!]) {
      expect(c.prio).toBe(4);
      expect(c.cancel).toBe('any');
    }
    // Tumble: take-off on the cast, landing on the dash's last tick (4 m at 20 m/s = 6 t)
    const e = MOVES.slots.e.cast;
    expect(e.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
    expect(SIM_TIMING.clem.slots.e.dashTicks).toBe(travelTicks(abilNumbers('clem', 'e').dash, DASH_SPEED));
    expect(SIM_TIMING.clem.slots.e.dashTicks).toBe(6);
    // the authored air time is within the warp clamp of the sim's dash (0.5–2.5×)
    const air = (e.markers.land ?? 0) - (e.markers.takeoff ?? 0);
    const sim = SIM_TIMING.clem.slots.e.dashTicks * TICK_S;
    expect(air / sim).toBeGreaterThanOrEqual(0.5);
    expect(air / sim).toBeLessThanOrEqual(2.5);
    // every attack / ability clip has a contact marker
    for (const c of CLIPS) expect(c.markers.contact, c.id).toBeDefined();
    expect(MOVES.death.prio).toBe(9);
  });

  it('every clip compiles on her rig with finite values, inside the root caps and the spin rule', () => {
    const ch = makeHero('clem', 0, null, { detail: 0.62 });
    for (const c of CLIPS) {
      const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
      for (let i = 0; i < bin.q.length; i++) expect(Number.isFinite(bin.q[i]), c.id).toBe(true);
      for (let i = 0; i < bin.p.length; i++) expect(Number.isFinite(bin.p[i]), c.id).toBe(true);
      const r = c.root ?? {};
      const dead = c.prio === 9;
      for (const k of ['fwd', 'side'] as const) {
        const ks = r[k];
        if (!ks) continue;
        for (const [, v] of ks) expect(Math.abs(v), `${c.id} ${k}`).toBeLessThanOrEqual(dead ? ROOT_CAPS.horizDead : ROOT_CAPS.horiz);
        if (!dead) expect(ks[ks.length - 1][1], `${c.id} ${k} ends at 0`).toBe(0);
      }
      for (const [, v] of r.up ?? []) expect(v >= 0 && v <= ROOT_CAPS.upClip, `${c.id} up ${v}`).toBe(true);
      // §9 rule 6: a full spin lasts ≤ 0.3 s; whole turns step back to 0 (no unwinding)
      for (const k of ['yaw', 'pitch', 'roll'] as const) {
        const ks = r[k] ?? [];
        for (let i = 1; i < ks.length; i++) if (Math.abs(ks[i][1] - ks[i - 1][1]) >= 0.5 && ks[i][2] !== 'step') expect(ks[i][0] - ks[i - 1][0], `${c.id} ${k} spin`).toBeLessThanOrEqual(k === 'yaw' ? 0.3 + 1e-9 : 0.4);
        if (ks.length) expect(Math.abs(ks[ks.length - 1][1]) < 0.05 || Math.abs(ks[ks.length - 1][1] - Math.round(ks[ks.length - 1][1])) < 1e-9, `${c.id} ${k} ends whole`).toBe(true);
        // a spin gets calmed under reduce motion
        if (ks.some(([, v]) => Math.abs(v) > 0.25)) expect(c.calm?.[k], `${c.id} calm ${k}`).toBe(0);
      }
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0], c.id).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      for (const m of Object.values(c.markers)) expect(m >= 0 && m <= c.len + 1e-9, `${c.id} marker`).toBe(true);
    }
    ch.dispose();
  });

  it('acrobatics: Q3 somersault, Tumble roll, Golden Hour sun-leap and the sun-cleave spin', () => {
    const peak = (c: ClipDef, k: 'pitch' | 'yaw' | 'up') => Math.max(...(c.root?.[k] ?? [[0, 0]]).map(([, v]) => v));
    expect(peak(CLEM_CLIPS.q3, 'pitch')).toBe(1);
    expect(peak(CLEM_CLIPS.q3, 'up')).toBeCloseTo(0.8, 6);
    expect(peak(CLEM_CLIPS.e, 'pitch')).toBe(1);
    expect(peak(CLEM_CLIPS.r, 'yaw')).toBe(1);
    expect(peak(CLEM_CLIPS.r, 'up')).toBeGreaterThanOrEqual(0.8);
    expect(peak(CLEM_CLIPS.q2, 'yaw')).toBe(1);
    expect(peak(CLEM_CLIPS.sunCleave, 'yaw')).toBe(1);
    expect(peak(CLEM_CLIPS.basicC, 'up')).toBeGreaterThanOrEqual(0.25);
  });

  it('planted swings keep the root ≤ 0.06 m (lockFeet is a no-op); Q2, Q3 and R start from the current pose', () => {
    for (const c of [...MOVES.basic, CLEM_CLIPS.q1, CLEM_CLIPS.w, CLEM_CLIPS.wHold, CLEM_CLIPS.wEnd]) {
      for (const [, v] of c.root?.fwd ?? []) expect(Math.abs(v), c.id).toBeLessThanOrEqual(0.06);
    }
    for (const c of [CLEM_CLIPS.q2, CLEM_CLIPS.q3, CLEM_CLIPS.r]) {
      expect(c.keys[0][1], c.id).toBeNull();
      expect(c.keys[0][2], c.id).toBeNull();
      expect(c.root?.sy?.[0][1], c.id).toBe(1);
      expect(c.keys[1][0], c.id).toBeGreaterThanOrEqual(0.03);
    }
  });

  it('sun-cleave: the blade points at the aim on the contact frame', () => {
    const ch = makeHero('clem', 0, null, { detail: 0.62 });
    const c = CLEM_CLIPS.sunCleave;
    const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
    const Qb = Array.from({ length: BONES }, () => new THREE.Quaternion());
    const Pb = Array.from({ length: BONES }, () => new THREE.Vector3());
    const ones = new Float32Array(BONES).fill(1);
    const C = c.markers.contact!;
    sampleClip(bin, C, Qb, Pb, ones, 1, 0, { k: 0 });
    for (let b = 0; b < BONES; b++) {
      ch.rig.bones[b].quaternion.copy(Qb[b]);
      ch.rig.bones[b].position.copy(Pb[b]);
    }
    const turn = sampleScalar(bin.root[ROOT_INDEX.yaw], C);
    expect(turn).toBeCloseTo(SUN_CLEAVE_C_TURN, 6);
    ch.mover.rotation.set(0, turn * Math.PI * 2, 0);
    ch.object.updateMatrixWorld(true);
    const chest = new THREE.Vector3().setFromMatrixPosition(ch.rig.bones[BONE_INDEX.chest].matrixWorld);
    const tip = new THREE.Vector3(0, WEAPON_TIP, 0).applyMatrix4(ch.rig.bones[BONE_INDEX.weapon].matrixWorld);
    // the object faces +x: the blade's ground direction within 25° of it
    const a = Math.atan2(-(tip.z - chest.z), tip.x - chest.x);
    expect(Math.abs(a)).toBeLessThanOrEqual((25 * Math.PI) / 180);
    ch.dispose();
  });

  it('picks: A → B → C by confirmed basics, Paw Combo stages, every 3rd basic in Golden Hour is the sun-cleave', () => {
    const c = mctx();
    const pick = MOVES.basicPick!;
    const ids: string[] = [];
    for (let n = 0; n < 6; n++) ids.push((pick(mctx({ basicCount: n })) as ClipDef).id);
    expect(ids).toEqual(['clem.basicA', 'clem.basicB', 'clem.basicC', 'clem.basicA', 'clem.basicB', 'clem.basicC']);
    const q = MOVES.slots.q.pick!;
    expect(q(mctx({ recastIndex: 0 }))?.id).toBe('clem.q1');
    expect(q(mctx({ recastIndex: 1 }))?.id).toBe('clem.q2');
    expect(q(mctx({ recastIndex: 2 }))?.id).toBe('clem.q3');
    // Golden Hour cast after 4 basics: the sim counts 1, 2, 3 → the wave on the 3rd (and the 6th)
    CLEM_LIVE.now = 100;
    MOVES.slots.r.pick!(mctx({ basicCount: 4 }));
    const r: string[] = [];
    for (let n = 4; n < 10; n++) r.push((pick(mctx({ basicCount: n })) as ClipDef).id);
    expect(r).toEqual(['clem.basicB', 'clem.basicC', 'clem.sunCleave', 'clem.basicB', 'clem.basicC', 'clem.sunCleave']);
    // after Golden Hour ends: back to the plain combo
    CLEM_LIVE.now = 100 + 240 * TICK_S;
    expect((pick(mctx({ basicCount: 6 })) as ClipDef).id).toBe('clem.basicA');
    // the picks return shared clips (no allocation)
    expect(pick(c)).toBe(pick(c));
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

function fakeFx(rel: 'own' | 'enemy' = 'own', talents: string[] = [], tier: 'low' | 'med' | 'high' = 'high', reduced = false) {
  const spawned: Spawned[] = [];
  const lingers: string[] = [];
  const lingerAt: { k: string; x: number; z: number; size: number; yaw: number }[] = [];
  const ribbonEnds: number[] = [];
  const shocks: number[] = [];
  let ribbons = 0;
  let now = 0;
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 1.5, z: 0 } };
  const fx = {
    tier,
    reduced,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o }, at: now }), spawned.length) },
    ribbons: { point: () => ++ribbons, feed: () => {}, end: () => ribbonEnds.push(now) },
    linger: {
      add: (k: string, x: number, z: number, size: number, yaw: number) => {
        lingers.push(k);
        lingerAt.push({ k, x, z, size, yaw });
      },
    },
    particles: { lightning: () => {}, debris: () => {}, bigHit: () => {}, pillar: () => {} },
    shock: { start: () => (shocks.push(now), null) },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? rel : 'enemy'),
    rim: (id: number) => (id === 0 && rel === 'own' ? 0xffd34d : 0xff3040),
    abil: (_id: number, slot: Slot) => abilNumbers('clem', slot, talents),
    heroPos: (id: number, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x;
      out.y = 0;
      out.z = p.z;
      return true;
    },
    // facing +x: the muzzle is ahead of the head
    bonePos: (id: number, bone: string, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x + (bone === 'mouth' ? 0.1 : 0);
      out.y = 1;
      out.z = p.z;
      return true;
    },
  } as unknown as FxCtx;
  const step = (s: number) => {
    for (let t = 0; t < s - 1e-9; t += FRAME) {
      now += FRAME;
      SKILL_FX.update!(FRAME, fx);
    }
  };
  return { fx, spawned, lingers, lingerAt, ribbonEnds, shocks, step, time: () => now };
}

const cast = (slot: number, x = 1500, y = 0, target = 3) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target });
const hit = (kind: 'basic' | 'ability') => ({ type: 'hit' as const, tick: 0, src: 0, dst: 3, amount: 60, shielded: 0, kind });

describe('clem skill FX', () => {
  beforeEach(() => resetClemFx());

  it('owns every slot', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: true, passive: true });
  });

  it('Paw Combo: each stage sweeps exactly the 90° cone at the sim range (Long Swipe 3 m); Q3 leaves the knock crack', () => {
    for (const [talents, range] of [[[], 2.4], [['long-swipe'], 3]] as const) {
      for (let stage = 0; stage < 3; stage++) {
        resetClemFx();
        const f = fakeFx('own', [...talents]);
        SKILL_FX.onCast!(cast(0), f.fx, mctx({ recastIndex: stage }));
        const main = f.spawned[0];
        expect(main.kind).toBe('crescent');
        expect(main.o.sx).toBeCloseTo(range, 9);
        expect(main.o.p0).toBeCloseTo(Math.PI / 2, 9);
        expect(main.o.yaw).toBeCloseTo(0, 9);
        // nothing reaches past the cone
        for (const s of f.spawned) if (s.kind === 'crescent') expect(s.o.sx).toBeLessThanOrEqual(range + 1e-9);
        if (stage === 2) {
          // the crack is drawn per target where the sim knocks it: from the target, away from Clem, the knock length
          expect(f.lingers).not.toContain('crackLine');
          SKILL_FX.onHit!(hit('ability'), f.fx, mctx({ recastIndex: 2 }));
          const crack = f.lingerAt.find((l) => l.k === 'crackLine')!;
          expect(crack).toBeDefined();
          expect(crack.x - crack.size).toBeCloseTo(1.5, 6);
          expect(crack.size * 2).toBeCloseTo(1.5, 6);
          expect(crack.z).toBeCloseTo(0, 6);
        }
      }
    }
  });

  it('Pounce Finish: the launcher stuns instead of knocking, so a stun ring on the target and no crack', () => {
    const f = fakeFx('own', ['pounce-finish']);
    SKILL_FX.onCast!(cast(0), f.fx, mctx({ recastIndex: 2 }));
    const n0 = f.spawned.length;
    SKILL_FX.onHit!(hit('ability'), f.fx, mctx({ recastIndex: 2 }));
    expect(f.lingers).not.toContain('crackLine');
    const ring = f.spawned.slice(n0).find((s) => s.kind === 'ring')!;
    expect(ring.o.x).toBeCloseTo(1.5, 9);
    expect(ring.o.life).toBeCloseTo(15 * TICK_S, 9);
  });

  it('Valor: a full bar seen before the cast empowers Q even when the cast snapshot already reads 0', () => {
    const VALOR = 0xff9cc8;
    const q = MOVES.slots.q.pick!;
    // the bar fills on a basic hit (the snapshot after it reads 100), then she casts Q; the sim spent it: 0
    SKILL_FX.onHit!(hit('basic'), fakeFx().fx, mctx({ resource: 100, basicCount: 1 }));
    expect(CLEM_LIVE.valorFull[0]).toBe(1);
    q(mctx({ resource: 0 }));
    expect(CLEM_LIVE.empowered[0]).toBe(1);
    expect(CLEM_LIVE.valorFull[0]).toBe(0);
    const f = fakeFx();
    SKILL_FX.onCast!(cast(0), f.fx, mctx({ resource: 0 }));
    expect(f.spawned.some((s) => s.o.color === VALOR)).toBe(true);
    expect(f.spawned.filter((s) => s.kind === 'crescent' && s.o.color === 0xfff6d8).length).toBe(1);
    // a late pre-cast reading (still 100) inside the peek window does not re-arm the spent bar
    SKILL_FX.onHit!(hit('ability'), f.fx, mctx({ resource: 100, recastIndex: 0 }));
    expect(CLEM_LIVE.valorFull[0]).toBe(0);
    // the next Q, the bar not full again: plain
    f.step(0.5);
    SKILL_FX.onHit!(hit('basic'), f.fx, mctx({ resource: 30, basicCount: 2 }));
    q(mctx({ resource: 30 }));
    expect(CLEM_LIVE.empowered[0]).toBe(0);
    const n0 = f.spawned.length;
    SKILL_FX.onCast!(cast(0), f.fx, mctx({ resource: 30 }));
    expect(f.spawned.slice(n0).some((s) => s.o.color === VALOR)).toBe(false);
    // Golden Hour spends it the same way (the pre-cast reading itself is full here)
    q(mctx({ resource: 0 }));
    MOVES.slots.r.pick!(mctx({ resource: 100 }));
    expect(CLEM_LIVE.empowered[0]).toBe(1);
  });

  it("Tumble: the trail lasts the sim's full 4 m dash (6 t) even when the aim is 1 m away", () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(2, 1000, 0), f.fx, mctx());
    f.step(1);
    expect(f.ribbonEnds.length).toBe(1);
    expect(f.ribbonEnds[0]).toBeGreaterThanOrEqual(6 * TICK_S + 0.05 - 1e-9);
    expect(f.ribbonEnds[0]).toBeLessThanOrEqual(6 * TICK_S + 0.05 + FRAME + 1e-9);
  });

  it('Golden Hour slam: body-centric (≤ 1.5 m, no ring, no shockwave) since the cast deals no damage', () => {
    const f = fakeFx();
    SKILL_FX.onMarker!(0, 'clem.r', 'fxRSlam', f.fx);
    expect(f.shocks.length).toBe(0);
    expect(f.spawned.some((s) => s.kind === 'ring')).toBe(false);
    // sx is the radius (meshFx scales by 2 sx): a ≤ 1.5 m wide body flare
    for (const s of f.spawned) expect(s.o.sx).toBeLessThanOrEqual(0.75);
    for (const l of f.lingerAt) expect(l.size).toBeLessThanOrEqual(1);
    expect(CLEM_CLIPS.r.cues).toContainEqual(['slam', 'shake', 2]);
  });

  it('quality tiers: Low trims the wave, the sun column and the petals; reduce motion caps the petal spiral', () => {
    const count = (tier: 'low' | 'med' | 'high', reduced = false) => {
      resetClemFx();
      const f = fakeFx('own', [], tier, reduced);
      SKILL_FX.onCast!(cast(3), f.fx, mctx());
      const pillars = f.spawned.filter((s) => s.kind === 'pillar').length;
      const petals = f.lingers.filter((k) => k === 'petals').length;
      f.step(0.5);
      const n0 = f.spawned.length;
      SKILL_FX.onProjectile!(0, PROJECTILE_KIND.wave, -1, f.fx);
      SKILL_FX.onHit!(hit('basic'), f.fx, mctx({ basicCount: 3 }));
      const wave = f.spawned.slice(n0).filter((s) => s.kind === 'crescent' && (s.o.delay ?? 0) > 0).length;
      return { pillars, petals, wave };
    };
    expect(count('low')).toEqual({ pillars: 1, petals: 1, wave: 2 });
    expect(count('med')).toEqual({ pillars: 2, petals: 3, wave: 3 });
    expect(count('high')).toEqual({ pillars: 2, petals: 5, wave: 5 });
    expect(count('high', true).petals).toBe(2);
  });

  it("The Stand: the wall takes the view object's yaw (the sim facing), not the head → muzzle bones", () => {
    const f = fakeFx();
    // object (sim facing +90°) → mover → inner → body; the bones in the fake still say +x
    const object = new THREE.Group();
    const mover = new THREE.Group();
    mover.name = 'mover';
    const inner = new THREE.Group();
    const body = new THREE.Bone();
    object.add(mover);
    mover.add(inner);
    inner.add(body);
    object.rotation.y = Math.PI / 2;
    mover.rotation.y = 0.9;
    (f.fx as unknown as { lookup: unknown }).lookup = { bone: (id: number) => (id === 0 ? body : null) };
    SKILL_FX.onCast!(cast(1), f.fx, mctx());
    f.step(0.3);
    const walls = f.spawned.filter((s) => s.kind === 'wall');
    expect(walls.length).toBeGreaterThan(1);
    for (const w of walls) expect(w.o.yaw).toBeCloseTo(Math.PI / 2, 9);
  });

  it('The Stand: the front-half wall at 1.4 m, bright for the parry window, gone by the block end (Steady Stand 38 t)', () => {
    for (const [talents, dur] of [[[], 23], [['steady-stand'], 38]] as const) {
      resetClemFx();
      const f = fakeFx('own', [...talents]);
      SKILL_FX.onCast!(cast(1), f.fx, mctx());
      expect(f.spawned[0].kind).toBe('wall');
      expect(f.spawned[0].o.life).toBeCloseTo(9 * TICK_S, 9);
      f.step(dur * TICK_S + 0.5);
      const walls = f.spawned.filter((s) => s.kind === 'wall');
      expect(walls.length).toBeGreaterThan(dur / 6);
      for (const w of walls) {
        expect(w.o.sx).toBeCloseTo(1.4, 9);
        expect(w.o.p0).toBeCloseTo(Math.PI, 9);
        expect(w.at + w.o.life).toBeLessThanOrEqual(dur * TICK_S + 0.05);
      }
    }
  });

  it('Golden Hour wave: a 5 m × 1.2 m line timed at 25 m/s, whichever of the hit and the wave bolt arrives first', () => {
    for (const order of ['hitFirst', 'boltFirst'] as const) {
      resetClemFx();
      const f = fakeFx();
      SKILL_FX.onCast!(cast(3), f.fx, mctx());
      f.step(0.5);
      const n0 = f.spawned.length;
      if (order === 'hitFirst') {
        SKILL_FX.onHit!(hit('basic'), f.fx, mctx({ basicCount: 3 }));
        f.step(FRAME * 2);
        SKILL_FX.onProjectile!(0, PROJECTILE_KIND.wave, -1, f.fx);
      } else {
        SKILL_FX.onProjectile!(0, PROJECTILE_KIND.wave, -1, f.fx);
        f.step(FRAME * 2);
        SKILL_FX.onHit!(hit('basic'), f.fx, mctx({ basicCount: 3 }));
      }
      const w = f.spawned.slice(n0);
      const beams = w.filter((s) => s.kind === 'beam');
      expect(beams.length, order).toBe(1);
      expect(beams[0].o.sx).toBeCloseTo(5, 9);
      expect(beams[0].o.sz).toBeCloseTo(1.2, 9);
      const cres = w.filter((s) => s.kind === 'crescent' && (s.o.delay ?? 0) > 0);
      expect(cres.length).toBe(5);
      // the last crescent leaves when the 25 m/s wave reaches it
      const last = cres[cres.length - 1];
      const d = Math.hypot(last.o.x, last.o.z) + 0.6;
      expect(last.o.delay).toBeCloseTo(d / 25, 2);
      for (const c of cres) expect(Math.hypot(c.o.x, c.o.z) + c.o.sx).toBeLessThanOrEqual(5 + 1e-6);
    }
  });

  it('Tumble ribbon follows the hero for the dash only; enemy effects take the danger rim', () => {
    const f = fakeFx('enemy');
    SKILL_FX.onCast!(cast(2, 4000, 0), f.fx, mctx());
    for (const s of f.spawned) {
      expect(s.o.rim).toBe(0xff3040);
      expect(s.o.rel).toBe('enemy');
    }
    f.step(1);
    SKILL_FX.onCast!(cast(0), f.fx, mctx());
    for (const s of f.spawned) expect(s.o.rim).toBe(0xff3040);
  });

  it('survives every slot back to back and missing heroes', () => {
    const f = fakeFx();
    for (let i = 0; i < 24; i++) {
      SKILL_FX.onCast!(cast(i % 4), f.fx, mctx({ recastIndex: i % 3, resource: i % 5 === 0 ? 100 : 0 }));
      SKILL_FX.onHit!(hit(i % 2 ? 'basic' : 'ability'), f.fx, mctx({ basicCount: i, recastIndex: i % 3 }));
      f.step(0.1);
    }
    for (const m of ['fxRApex', 'fxRSlam', 'fxE1', 'fxRespawn', 'other']) SKILL_FX.onMarker!(0, 'clem.r', m, f.fx);
    SKILL_FX.onCast!({ ...cast(0), src: 9 }, f.fx, mctx());
    for (const s of f.spawned) {
      expect(Number.isFinite(s.o.x) && Number.isFinite(s.o.z) && Number.isFinite(s.o.sx) && Number.isFinite(s.o.life)).toBe(true);
    }
  });
});
