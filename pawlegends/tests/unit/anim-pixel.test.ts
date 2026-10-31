/**
 * Pixel move set and skill FX (sim v11, docs/plans/moba/CATS-V11.md §2.2 "Moves and VFX"): the clips bind to the sim
 * timings (basic release, the instant Q and R, the Laser Pointer and Duck and Cover ending on stateEnd at their sim
 * durations), stay inside the root caps, compile on her rig, the BOXBOT basic pick is allocation-free, and the skill FX
 * draw at the sim numbers: the beam at the sim length and width for the sim duration (Overclock included), broken by
 * a stun or another cast; the duck dome for exactly its duration; the BOXBOT splash ring at the sim radius.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, SIM_TIMING, TICK_S, abilNumbers } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import type { ClipDef, FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, Slot } from '../../src/render/anim/types';
import { BOXBOT_SCALE, E_DUR_S, MOVES, PIXEL_CLIPS, R_DUR_S, W_DUR_S } from '../../src/render/moves/pixel';
import { SKILL_FX, beamOn, resetPixelFx, BEAM_GLOW_W } from '../../src/render/skillfx/pixel';
import { PROJECTILE_KIND } from '../../src/data/towers';

const FRAME = 1 / 60;
const T = SIM_TIMING.pixel;

describe('pixel moves', () => {
  it('is filled and binds to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(T.ranged).toBe(true);
    for (const c of [...MOVES.basic, PIXEL_CLIPS.basicBoxbot]) {
      expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S), c.id).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toEqual([['contact', 'release']]);
      expect(c.len, c.id).toBeLessThan(T.period * TICK_S);
    }
    // Q and R are instant: contact on the cast tick
    expect(T.slots.q.windup).toBe(0);
    expect(MOVES.slots.q.cast.warp).toEqual([['contact', 'cast']]);
    expect(MOVES.slots.r.cast.warp).toEqual([['contact', 'cast']]);
    // W: the click, a held pointer loop, the drop on stateEnd (cast + 45 t)
    expect(W_DUR_S).toBeCloseTo(45 * TICK_S, 9);
    expect(MOVES.slots.w.cast.warp).toEqual([['contact', 'cast']]);
    expect(MOVES.slots.w.hold?.mask).toBe('upper');
    expect(MOVES.slots.w.end?.warp).toEqual([['contact', 'stateEnd']]);
    // E: curled in the box from the cast to stateEnd (30 t), then the pop
    const e = MOVES.slots.e.cast;
    expect(e.warp).toEqual([['contact', 'cast'], ['out', 'stateEnd']]);
    expect(e.markers.out - e.markers.contact!).toBeCloseTo(E_DUR_S, 9);
    expect(E_DUR_S).toBeCloseTo(30 * TICK_S, 9);
    // R: the BOXBOT window is the sim's 7 s; the loop holds the bigger box, the end settles it on stateEnd
    expect(R_DUR_S).toBeCloseTo(210 * TICK_S, 9);
    const hold = MOVES.slots.r.hold!;
    expect(hold.root!.sx![0][1]).toBe(BOXBOT_SCALE);
    expect(MOVES.slots.r.end?.warp).toEqual([['contact', 'stateEnd']]);
    expect(MOVES.slots.r.end!.root!.sx!.at(-1)![1]).toBe(1);
  });

  it('every clip compiles on her rig with finite values and keeps the root caps', () => {
    const ch = makeHero('pixel', 0, null, { detail: 0.62 });
    for (const c of Object.values(PIXEL_CLIPS) as ClipDef[]) {
      const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
      for (let i = 0; i < bin.q.length; i++) expect(Number.isFinite(bin.q[i]), c.id).toBe(true);
      for (let i = 0; i < bin.p.length; i++) expect(Number.isFinite(bin.p[i]), c.id).toBe(true);
      const r = c.root ?? {};
      for (const key of ['fwd', 'side'] as const) {
        const ks = r[key];
        if (!ks) continue;
        for (const [, v] of ks) expect(Math.abs(v), `${c.id} ${key}`).toBeLessThanOrEqual(c.prio === 9 ? ROOT_CAPS.horizDead : ROOT_CAPS.horiz);
        if (c.prio !== 9) expect(ks[ks.length - 1][1], `${c.id} ${key} ends at 0`).toBe(0);
      }
      for (const [, v] of r.up ?? []) expect(v >= 0 && v <= ROOT_CAPS.upClip, `${c.id} up`).toBe(true);
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0], c.id).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      for (const [, t] of Object.entries(c.markers)) expect(t >= 0 && t <= c.len + 1e-9, c.id).toBe(true);
    }
    ch.dispose();
  }, 60000);

  it('BOXBOT pick: the big-box basic only in form, no allocation', () => {
    const ctx = { hero: 'pixel', id: 0, branch: false, talents: [] as string[], comboIndex: 0, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false, form: false } as MoveCtx;
    expect(MOVES.basicPick!(ctx)).toBeNull();
    (ctx as { form: boolean }).form = true;
    expect(MOVES.basicPick!(ctx)?.id).toBe('pixel.basicBoxbot');
    expect(MOVES.basicPick!(ctx)).toBe(MOVES.basicPick!(ctx));
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

function fakeFx(talents: string[] = []) {
  const spawned: Spawned[] = [];
  const buffs: Record<number, number | undefined> = { 0: 0, 3: 0 };
  let now = 0;
  // 0 = Pixel at the origin facing +x; 3 = an enemy 5 m in front
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 5, z: 0 } };
  const fx = {
    tier: 'low',
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o }, at: now }), spawned.length) },
    ribbons: { point: () => 7, feed: () => {}, end: () => {} },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? 'own' : 'enemy'),
    rim: () => 0xffd34d,
    abil: (_id: number, slot: Slot) => abilNumbers('pixel', slot, talents),
    heroPos: (id: number, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x;
      out.y = 0;
      out.z = p.z;
      return true;
    },
    facing: (_id: number, out: { x: number; y: number; z: number }) => {
      out.x = 1;
      out.y = 0;
      out.z = 0;
      return true;
    },
    status: (id: number, out: { buffs: number; shield: number }) => {
      const b = buffs[id];
      if (b === undefined) return false;
      out.buffs = b;
      out.shield = 0;
      return true;
    },
    bonePos: (id: number, _bone: string, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x;
      out.y = 1;
      out.z = p.z;
      return true;
    },
    projPos: () => false,
  } as unknown as FxCtx;
  const step = (s: number) => {
    const n = Math.round(s / FRAME);
    for (let i = 0; i < n; i++) {
      now += FRAME;
      SKILL_FX.update!(FRAME, fx);
    }
  };
  return { fx, spawned, step, buffs };
}

const cast = (slot: number, x = 5000, y = 0) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target: -1 });
const ctx = { form: false } as MoveCtx;
const STUNNED = 1 << 3;

describe('pixel skill FX', () => {
  beforeEach(() => resetPixelFx());

  it('owns every slot and the basic', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: true, passive: false });
  });

  it('W: the beam at the sim length and width along her facing, for the sim duration (Overclock longer)', () => {
    for (const [talents, tier] of [[[], 'low'], [['overclock'], 'low'], [[], 'med']] as const) {
      resetPixelFx();
      const f = fakeFx([...talents]);
      (f.fx as { tier: string }).tier = tier;
      const a = abilNumbers('pixel', 'w', [...talents]);
      SKILL_FX.onCast!(cast(1), f.fx, ctx);
      f.step(0.2);
      const beams = f.spawned.filter((s) => s.kind === 'beam');
      // two layers: the hit lane on the ground at exactly the sim width, and the laser at paw height, whose glow quad
      // is wider so its bright core (the shader's falloff) is the sim width
      const lane = beams.filter((b) => (b.o.y ?? 0) < 0.1);
      const laser = beams.filter((b) => (b.o.y ?? 0) >= 0.1);
      expect(laser.length).toBeGreaterThan(2);
      expect(lane.length).toBe(tier === 'low' ? 0 : laser.length);
      for (const b of beams) {
        expect(b.o.sx).toBeCloseTo(a.range / 1000, 6);
        expect(b.o.yaw).toBeCloseTo(0, 6);
      }
      for (const b of lane) expect(b.o.sz).toBeCloseTo(a.width / 1000, 6);
      for (const b of laser) expect(b.o.sz).toBeCloseTo((a.width / 1000) * BEAM_GLOW_W, 6);
      // at most two alive at once per layer (Low caps beams at 2 and draws the laser only)
      if (lane.length) expect(lane[1].at - lane[0].at).toBeGreaterThanOrEqual(lane[0].o.life - 0.04);
      expect(laser[1].at - laser[0].at).toBeGreaterThanOrEqual(laser[0].o.life - 0.04);
      const dot = f.spawned.find((s) => s.kind === 'glow' && s.o.x > 1);
      expect(dot?.o.x).toBeCloseTo(a.range / 1000, 6);
      f.step(a.duration * TICK_S - 0.25);
      expect(beamOn(0)).toBe(true);
      f.step(0.1);
      expect(beamOn(0)).toBe(false);
    }
  });

  it('W: a stun or another cast breaks the beam', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    f.step(0.1);
    f.buffs[0] = STUNNED;
    f.step(FRAME);
    expect(beamOn(0)).toBe(false);
    f.buffs[0] = 0;
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    f.step(0.1);
    SKILL_FX.onCast!(cast(2), f.fx, ctx);
    expect(beamOn(0)).toBe(false);
    const n = f.spawned.filter((s) => s.kind === 'beam').length;
    f.step(0.2);
    expect(f.spawned.filter((s) => s.kind === 'beam').length).toBe(n);
  });

  it('E: a frost dome for exactly the duck and a ring at the melee reach', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(2, 0, 0), f.fx, ctx);
    const a = abilNumbers('pixel', 'e');
    const dome = f.spawned.find((s) => s.kind === 'dome')!;
    expect(dome.o.life).toBeCloseTo(a.duration * TICK_S, 9);
    const ring = f.spawned.find((s) => s.kind === 'ring')!;
    expect(ring.o.sx).toBeCloseTo(a.meleeRange / 1000, 9);
  });

  it('R: a basic under BOXBOT draws the splash ring at the sim radius (Big Boom wider); a plain basic does not', () => {
    for (const talents of [[], ['big-boom']]) {
      resetPixelFx();
      const f = fakeFx(talents);
      const hit = { type: 'hit' as const, tick: 0, src: 0, dst: 3, amount: 50, shielded: 0, kind: 'basic' as const };
      SKILL_FX.onHit!(hit, f.fx, { form: false } as MoveCtx);
      expect(f.spawned.some((s) => s.kind === 'ring')).toBe(false);
      SKILL_FX.onHit!(hit, f.fx, { form: true } as MoveCtx);
      const ring = f.spawned.find((s) => s.kind === 'ring')!;
      expect(ring.o.sx).toBeCloseTo(abilNumbers('pixel', 'r', talents).splash / 1000, 9);
      expect([ring.o.x, ring.o.z]).toEqual([5, 0]);
    }
  });

  it('Q: the cap ribbon follows only her own cap bolt', () => {
    const f = fakeFx();
    let pointed = 0;
    (f.fx as unknown as { ribbons: { point: () => number } }).ribbons.point = () => (pointed++, 3);
    (f.fx as unknown as { projPos: (i: number, o: { x: number; y: number; z: number }) => boolean }).projPos = (_i, o) => ((o.x = 0), (o.y = 1), (o.z = 0), true);
    SKILL_FX.onProjectile!(0, PROJECTILE_KIND.hero, 0, f.fx, 4);
    expect(pointed).toBe(0);
    SKILL_FX.onProjectile!(0, PROJECTILE_KIND.cap, 0, f.fx, 4);
    expect(pointed).toBe(1);
  });
});
