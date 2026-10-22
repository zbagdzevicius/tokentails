/**
 * Bengas move set and skill FX (ANIM-SPEC §14 "Bengas"): the clips bind to the sim timings (basic release, Striking
 * Pose's 9 t windup, Camellia Hop's 6 t leap, Curtains Up!'s 18 t arm and 15 t pulses), stay inside the root caps and
 * the spin rule, compile on his rig, the Hot Toast pick is allocation-free, and the skill FX draw at the sim numbers:
 * the exact W cone, the R stage at the sim radius with one pulse per sim pulse, the toast ribbon ending at its range.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, DASH_SPEED, SIM_TIMING, TICK_S, abilNumbers, travelTicks } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import type { ClipDef, FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, Slot } from '../../src/render/anim/types';
import { BENGAS_CLIPS, E_AIR_S, E_LEN, HOLD_BEAT, HOLD_START_S, MOVES, R_ARM_S, R_END_BOW, R_EVERY_S, W_WINDUP_S } from '../../src/render/moves/bengas';
import { SKILL_FX, resetBengasFx } from '../../src/render/skillfx/bengas';

const FRAME = 1 / 60;
const T = SIM_TIMING.bengas;

describe('bengas moves', () => {
  it('is filled and binds to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.basic.length).toBe(3);
    expect(T.ranged).toBe(true);
    for (const c of [...MOVES.basic, BENGAS_CLIPS.basicHot]) {
      expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S), c.id).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toEqual([['contact', 'release']]);
      expect(c.len, c.id).toBeLessThan(T.period * TICK_S);
    }
    // Q: an instant skillshot, the serve's whip on the cast tick
    expect(MOVES.slots.q.cast.warp).toEqual([['contact', 'cast']]);
    // W: the spin-in fills exactly the 9 t windup
    const w = MOVES.slots.w.cast;
    expect(T.slots.w.windup).toBe(9);
    expect(w.warp).toEqual([['coil', 'windupStart'], ['contact', 'cast']]);
    expect(w.markers.contact! - w.markers.coil).toBeCloseTo(W_WINDUP_S, 9);
    const wy = w.root!.yaw!;
    // one full turn, reached exactly on the stun tick (then snapped to 0)
    expect(wy.find(([, v]) => v === 1)?.[0]).toBeCloseTo(W_WINDUP_S, 9);
    // E: take-off on the cast, landing on travelEnd, nominal air = the sim dash (3.5 m at 20 m/s = 6 t)
    const e = MOVES.slots.e.cast;
    expect(e.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
    expect(T.slots.e.dashTicks).toBe(travelTicks(3500, DASH_SPEED));
    expect(e.markers.land - e.markers.takeoff).toBeCloseTo(E_AIR_S, 9);
    expect(travelTicks(abilNumbers('bengas', 'e', ['long-hop']).dash, DASH_SPEED)).toBe(7);
    // the sim hands control back on the landing: the full-body clip is cancellable from there and gone 0.2 s later
    expect(e.cancel).toBe('afterContact');
    expect(e.markers.contact).toBe(e.markers.land);
    expect(E_LEN - e.markers.land).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(e.root?.yaw).toBeUndefined();
    // R: bow on the cast, the curtain raise ends on the zone arm (+18 t)
    const r = MOVES.slots.r.cast;
    expect(r.warp).toEqual([['contact', 'cast'], ['arm', 'zoneArm']]);
    expect(R_ARM_S).toBeCloseTo(18 * TICK_S, 9);
    expect(r.markers.arm - r.markers.contact!).toBeCloseTo(R_ARM_S, 9);
    // the conducting loop: one period, downbeat warped onto pulse 2 (arm + every) wherever the hold starts
    const hold = MOVES.slots.r.hold!;
    expect(hold.len).toBeCloseTo(R_EVERY_S, 9);
    expect(hold.mask).toBe('upper');
    expect(hold.warp).toEqual([['beat', 'pulse']]);
    const beatAt = HOLD_START_S + HOLD_BEAT;
    const k = (beatAt - R_ARM_S) / R_EVERY_S;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    expect(Math.round(k)).toBeGreaterThanOrEqual(1);
    // stage end (stateEnd = cast + duration): the final downbeat on the last pulse (+ arm − every), the bow as the
    // curtains close (the zone lives arm + duration), upper body so he can walk
    const end = MOVES.slots.r.end!;
    expect(end.warp).toEqual([['contact', 'stateEnd']]);
    expect(end.mask).toBe('upper');
    for (const talents of [[], ['encore-performance']]) {
      const a = abilNumbers('bengas', 'r', talents);
      const pulses = Math.floor(a.duration / a.every);
      expect(a.duration + (end.markers.beat - end.markers.contact!) / TICK_S).toBeCloseTo(a.windup + (pulses - 1) * a.every, 6);
    }
    expect(R_END_BOW).toBeCloseTo(T.slots.r.arm * TICK_S, 9);
    expect(end.markers.bow).toBeCloseTo(R_END_BOW, 9);
  });

  it('every clip compiles on his rig with finite values, keeps the root caps and the spin rule', () => {
    const ch = makeHero('bengas', 0, null, { detail: 0.62 });
    for (const c of Object.values(BENGAS_CLIPS) as ClipDef[]) {
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
      // §9 rule 6: a spin segment of half a turn or more lasts ≤ 0.3 s, unless it is W's windup spin
      const yaw = r.yaw ?? [];
      for (let i = 1; i < yaw.length; i++) {
        if (Math.abs(yaw[i][1] - yaw[i - 1][1]) < 0.5 || c.id === 'bengas.w') continue;
        expect(yaw[i][0] - yaw[i - 1][0], `${c.id} spin`).toBeLessThanOrEqual(0.3 + 1e-9);
      }
      // big turns are calmed under reduce motion
      const big = (ks?: readonly (readonly [number, number, ...unknown[]])[]) => (ks ?? []).some(([, v]) => Math.abs(v) > 0.25);
      if (big(r.yaw)) expect(c.calm?.yaw, `${c.id} calm yaw`).toBe(0);
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0], c.id).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      for (const [, t] of Object.entries(c.markers)) expect(t >= 0 && t <= c.len + 1e-9, c.id).toBe(true);
    }
    ch.dispose();
  }, 60000);

  it('acrobatics: the victory backflip, the jeté apex, the spins', () => {
    const peak = (c: ClipDef) => Math.max(0, ...(c.root?.up ?? []).map(([, v]) => v));
    expect(BENGAS_CLIPS.victory.root!.pitch!.some(([, v]) => v === -1)).toBe(true);
    expect(peak(BENGAS_CLIPS.e)).toBeGreaterThanOrEqual(0.6);
    expect(peak(BENGAS_CLIPS.e)).toBeLessThanOrEqual(0.9);
    for (const c of [BENGAS_CLIPS.q, BENGAS_CLIPS.basicB, BENGAS_CLIPS.basicHot, BENGAS_CLIPS.death]) expect(Math.max(...c.root!.yaw!.map(([, v]) => Math.abs(v))), c.id).toBeGreaterThanOrEqual(1);
  });

  it('every turn ends near 0: snapped at full weight, so no blend-out or cancel unwinds a reverse turn', () => {
    for (const c of Object.values(BENGAS_CLIPS) as ClipDef[]) {
      const blendIn = c.blendIn ?? 0.05;
      const blendOut = c.blendOut ?? 0.12;
      for (const ch of ['yaw', 'pitch', 'roll'] as const) {
        const ks = c.root?.[ch];
        if (!ks) continue;
        expect(Math.abs(ks[ks.length - 1][1]), `${c.id} ${ch} ends`).toBeLessThan(0.5);
        // a zero-length key is a snap: between two equivalent angles (whole turns apart), at full weight
        for (let i = 1; i < ks.length; i++) {
          if (ks[i][0] !== ks[i - 1][0]) continue;
          const d = ks[i - 1][1] - ks[i][1];
          expect(Math.abs(d - Math.round(d)), `${c.id} ${ch} snap is a whole turn`).toBeLessThan(1e-9);
          expect(ks[i][0], `${c.id} ${ch} snap after the blend-in`).toBeGreaterThanOrEqual(blendIn);
          expect(ks[i][0], `${c.id} ${ch} snap before the blend-out`).toBeLessThanOrEqual(c.len - blendOut);
        }
      }
    }
  });

  it('the bow is a bend at the waist on a straight standing leg, not a collapse', () => {
    for (const c of [BENGAS_CLIPS.r, BENGAS_CLIPS.rEnd, BENGAS_CLIPS.victory, BENGAS_CLIPS.respawn, BENGAS_CLIPS.fidgetBow]) {
      const bows = c.keys.filter(([, , d]) => d && d.elbowL?.[0] === -1.7 && (d.chest?.[0] ?? 0) > 0.3);
      expect(bows.length, c.id).toBeGreaterThan(0);
      for (const [t, , d] of bows) {
        expect(d!.chest![0], `${c.id} ${t}`).toBeLessThanOrEqual(0.4);
        expect(d!.head![0], `${c.id} ${t}`).toBeLessThanOrEqual(0.1);
        expect(d!.kneeL![0], `${c.id} ${t}`).toBe(0);
        expect(d!.shoulderR![2], `${c.id} ${t}`).toBeLessThanOrEqual(-1.4);
        // no squash below 0.97 while bowing
        const sy = c.root?.sy?.find(([st]) => Math.abs(st - t) < 1e-9);
        if (sy) expect(sy[1], `${c.id} ${t} sy`).toBeGreaterThanOrEqual(0.97);
      }
    }
  });

  it('Q is impact-first: an instant cast has no lead, so contact sits at the start and the serve reads after it', () => {
    const q = BENGAS_CLIPS.q;
    expect(q.markers.contact!).toBeLessThanOrEqual(0.03 + 1e-9);
    // the toss paw is still up on the contact (the serve's echo) and the back leg kicks up on the follow-through
    const contact = q.keys.find(([t]) => t === q.markers.contact)![2]!;
    expect(contact.shoulderL![0]).toBeLessThanOrEqual(-2.4);
    expect(q.keys.some(([t, , d]) => t > q.markers.contact! && (d?.thighR?.[0] ?? 0) >= 0.8)).toBe(true);
  });

  it('the baton arm sweeps out past the body silhouette on the basics and the conducting poses', () => {
    for (const c of [BENGAS_CLIPS.basicA, BENGAS_CLIPS.basicHot]) {
      const contact = c.keys.find(([t]) => t === c.markers.contact)![2]!;
      expect(contact.shoulderR![2], c.id).toBeLessThanOrEqual(-0.5);
    }
    for (const [, , d] of BENGAS_CLIPS.rHold.keys) if (d && d.shoulderL && d.shoulderL[0] < -2) expect(Math.abs(d.shoulderL[2])).toBeGreaterThanOrEqual(0.8);
  });

  it('feet stay planted: the stationary basics and Q move the root at most 0.04 m; the death has no root glide', () => {
    for (const c of [BENGAS_CLIPS.basicA, BENGAS_CLIPS.basicB, BENGAS_CLIPS.basicC, BENGAS_CLIPS.basicHot, BENGAS_CLIPS.q]) {
      for (const [, v] of c.root?.fwd ?? []) expect(Math.abs(v), c.id).toBeLessThanOrEqual(0.04 + 1e-9);
      for (const [, v] of c.root?.side ?? []) expect(Math.abs(v), c.id).toBeLessThanOrEqual(0.04 + 1e-9);
    }
    // the death: no fwd / side track; one turn in ≤ 0.3 s, snapped; a stagger step (right leg back) before the fall
    const d = BENGAS_CLIPS.death;
    expect(d.root?.fwd).toBeUndefined();
    expect(d.root?.side).toBeUndefined();
    const yaw = d.root!.yaw!;
    const i1 = yaw.findIndex(([, v]) => v === 1);
    expect(yaw[i1][0] - yaw[i1 - 1][0]).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(d.keys.some(([t, , p]) => t > 0.2 && t < 0.45 && (p?.thighR?.[0] ?? 0) >= 0.4)).toBe(true);
  });

  it('the vogue reads at gameplay distance: the raised arm clears the head, a hard hip pop, held tall and rolled', () => {
    const w = BENGAS_CLIPS.w;
    const hold = w.keys.find(([t]) => Math.abs(t - W_WINDUP_S) < 1e-9)![2]!;
    expect(hold.shoulderL![0]).toBeLessThanOrEqual(-2.8);
    expect(hold.shoulderL![2]).toBeGreaterThanOrEqual(1.0);
    expect(hold.elbowL![0]).toBeGreaterThanOrEqual(-0.3);
    expect(hold.hips![2]).toBeGreaterThanOrEqual(0.3);
    expect(hold.chest![2]).toBeLessThanOrEqual(-0.25);
    expect(hold.thighR![2]).toBeLessThanOrEqual(-0.4);
    const held = w.root!.sy!.filter(([t]) => t > W_WINDUP_S + 0.02 && t <= W_WINDUP_S + 0.42 + 1e-9);
    for (const [, v] of held) expect(v).toBeGreaterThanOrEqual(1.1);
    expect(Math.max(...w.root!.roll!.map(([, v]) => v))).toBeCloseTo(0.04, 9);
    // the curtsy (E) is deep: root squash 0.78 on the landing, front knee 1.3, arms wide
    const e = BENGAS_CLIPS.e;
    expect(Math.min(...e.root!.sy!.filter(([t]) => t > e.markers.land).map(([, v]) => v))).toBeLessThanOrEqual(0.78);
    const curtsy = e.keys.find(([t]) => t > e.markers.land)![2]!;
    expect(curtsy.kneeL![0]).toBeGreaterThanOrEqual(1.3);
    expect(Math.abs(curtsy.shoulderL![2])).toBeGreaterThanOrEqual(1.5);
  });

  it('Hot Toast pick: only on a crowd-controlled target, no allocation', () => {
    const ctx = { hero: 'bengas', id: 0, branch: false, talents: [] as string[], comboIndex: 0, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false } as MoveCtx;
    expect(MOVES.basicPick!(ctx)).toBeNull();
    (ctx as { targetCc: boolean }).targetCc = true;
    expect(MOVES.basicPick!(ctx)?.id).toBe('bengas.basicHot');
    expect(MOVES.basicPick!(ctx)).toBe(MOVES.basicPick!(ctx));
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

function fakeFx(rel: 'own' | 'enemy' = 'own', talents: string[] = []) {
  const spawned: Spawned[] = [];
  // snapshot buff bits per hero id (BuffFlag: Stunned 1 << 3, Slowed 1 << 6); undefined = not in the frame
  const buffs: Record<number, number | undefined> = { 0: 0, 1: 0, 3: 0, 4: 0 };
  const ended: number[] = [];
  let now = 0;
  // 0 = Bengas at the origin facing +x; 3 = an enemy 3 m in front; 4 = an enemy 3 m behind; 1 = his ally in front
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 3, z: 0 }, 4: { x: -3, z: 0 }, 1: { x: 2, z: 0.2 } };
  const enemyOf0 = (id: number) => id === 3 || id === 4;
  const fx = {
    tier: 'high',
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o }, at: now }), spawned.length) },
    ribbons: { point: () => 7, feed: () => {}, end: () => ended.push(now) },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? rel : enemyOf0(id) ? (rel === 'own' ? 'enemy' : 'ally') : rel === 'own' ? 'ally' : 'enemy'),
    rim: (id: number) => ((id === 0 ? rel : 'x') === 'enemy' || (id !== 0 && enemyOf0(id) === (rel === 'own')) ? 0xff3040 : 0xffd34d),
    abil: (_id: number, slot: Slot) => abilNumbers('bengas', slot, talents),
    heroPos: (id: number, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x;
      out.y = 0;
      out.z = p.z;
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
  } as unknown as FxCtx;
  const step = (s: number) => {
    const n = Math.round(s / FRAME);
    for (let i = 0; i < n; i++) {
      now += FRAME;
      SKILL_FX.update!(FRAME, fx);
    }
  };
  return { fx, spawned, ended, step, buffs, time: () => now };
}

const cast = (slot: number, x = 3000, y = 0, target = 3) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target });
const ctx = { targetCc: false } as MoveCtx;
const STUNNED = 1 << 3;
const SLOWED = 1 << 6;
const FIRE = 0xd02800;

describe('bengas skill FX', () => {
  beforeEach(() => resetBengasFx());

  it('owns every slot', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: true, passive: true });
  });

  it('W: the flash wedge is the exact sim cone and dazzles only the enemies inside it', () => {
    const f = fakeFx();
    f.buffs[3] = STUNNED;
    SKILL_FX.onWindup!({ type: 'windup', tick: 0, src: 0, slot: 1, x: 3000, y: 0, ticks: 9 }, f.fx);
    const spot = f.spawned.find((s) => s.kind === 'glow');
    expect(spot?.o.life).toBeGreaterThanOrEqual(9 * TICK_S);
    // a hollow spotlight: no additive volume over his body (his spin-in and facing are the stun's tell)
    for (const s of f.spawned) {
      if (s.kind === 'pillar') expect(s.o.sx).toBeLessThanOrEqual(0.06);
      else expect(s.o.y!).toBeLessThan(0.2);
      if (s.kind === 'glow' || s.kind === 'pillar') expect(s.o.p3!).toBeLessThanOrEqual(0.15);
    }
    f.spawned.length = 0;
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    const w = abilNumbers('bengas', 'w');
    const wedge = f.spawned.filter((s) => (s.kind === 'arc' || s.kind === 'crescent') && s.o.y! < 1 && Math.abs(s.o.p0! - Math.PI * 2) > 1e-9);
    expect(wedge.length).toBeGreaterThanOrEqual(2);
    for (const s of wedge) {
      expect(s.o.sx).toBeCloseTo(w.range / 1000, 9);
      expect(s.o.p0).toBeCloseTo((w.arc / 4096) * Math.PI * 2, 9);
      expect(s.o.yaw).toBeCloseTo(0, 9);
    }
    // the enemy in front (3) gets a halo at head height; the one behind (4) and the ally (1) do not
    // (the flash bulb over his own head sits at 2.5 m)
    const halos = f.spawned.filter((s) => s.o.y! > 1 && s.o.y! < 2.4);
    expect(halos.length).toBeGreaterThan(0);
    for (const h of halos) expect(h.o.x).toBeCloseTo(3, 9);
  });

  it('W: the star halo only on a hero the sim stunned; a slowed one (facing away) gets a dim ground ring only', () => {
    const f = fakeFx();
    f.buffs[3] = SLOWED;
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    const at3 = f.spawned.filter((s) => Math.abs(s.o.x - 3) < 1e-9);
    expect(at3.filter((s) => s.o.y! > 1).length).toBe(0);
    expect(at3.length).toBe(1);
    expect(at3[0].o.y!).toBeLessThan(0.2);
    expect(at3[0].o.p3!).toBeLessThanOrEqual(0.4);
  });

  it('W: a stun the frame does not show yet is re-checked from the pooled list, and never invented', () => {
    const f = fakeFx();
    f.buffs[3] = 0; // the cast frame: no stun in the snapshot yet
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    expect(f.spawned.filter((s) => Math.abs(s.o.x - 3) < 1e-9).length).toBe(0);
    f.step(FRAME);
    expect(f.spawned.filter((s) => Math.abs(s.o.x - 3) < 1e-9).length).toBe(0);
    f.buffs[3] = STUNNED;
    f.step(FRAME);
    expect(f.spawned.filter((s) => Math.abs(s.o.x - 3) < 1e-9 && s.o.y! > 1).length).toBeGreaterThan(0);
    // a hero never stunned or slowed gets nothing, and the entry expires
    const g = fakeFx();
    g.buffs[3] = undefined;
    SKILL_FX.onCast!(cast(1), g.fx, ctx);
    g.step(0.5);
    g.buffs[3] = STUNNED;
    g.step(0.1);
    expect(g.spawned.filter((s) => Math.abs(s.o.x - 3) < 1e-9).length).toBe(0);
  });

  it('Q: the toast ribbon rides at the sim speed and ends at the sim range', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(0, 7000), f.fx, ctx);
    const q = abilNumbers('bengas', 'q');
    f.step(1);
    expect(f.ended.length).toBe(1);
    expect(Math.abs(f.ended[0] - q.range / q.speed)).toBeLessThanOrEqual(FRAME * 1.01);
  });

  for (const tier of ['high', 'low'] as const) {
    it(`Q: the toast trails a streak at the skillshot width on every tier (${tier})`, () => {
      const f = fakeFx();
      (f.fx as { tier: string }).tier = tier;
      SKILL_FX.onCast!(cast(0, 7000), f.fx, ctx);
      f.spawned.length = 0;
      f.step(0.3);
      const q = abilNumbers('bengas', 'q');
      const streak = f.spawned.filter((s) => s.kind === 'glow' && s.o.color === FIRE);
      // one glow per 0.35 m travelled on every tier: no gaps between the blobs
      const travelled = Math.min(q.range / 1000, (q.speed / 1000) * 0.3);
      expect(streak.length).toBeGreaterThanOrEqual(Math.floor(travelled / 0.35));
      for (let i = 1; i < streak.length; i++) expect(Math.hypot(streak[i].o.x - streak[i - 1].o.x, streak[i].o.z - streak[i - 1].o.z)).toBeLessThanOrEqual(0.35 + 1e-6);
      for (const s of streak) {
        expect(s.o.sx).toBeCloseTo(q.width / 1000, 9);
        expect(s.o.y!).toBeGreaterThan(0.8);
      }
      // the ground strip at the skillshot width, on the floor, along the aim
      const strip = f.spawned.filter((s) => s.kind === 'beam');
      expect(strip.length).toBeGreaterThanOrEqual(3);
      for (const s of strip) {
        expect(s.o.sz).toBeCloseTo(q.width / 1000, 9);
        expect(s.o.y!).toBeCloseTo(0.06, 9);
        expect(s.o.yaw).toBeCloseTo(0, 9);
      }
    });
  }

  it('Q: an R pulse hit far from the toast does not end it; the toast hit does', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(0, 7000), f.fx, ctx);
    f.step(0.1); // the toast is ~1.8 m out
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 4, amount: 25, shielded: 0, kind: 'ability' }, f.fx, ctx);
    expect(f.ended.length).toBe(0);
    f.step(0.06); // ~2.9 m: on the enemy at 3 m
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 70, shielded: 0, kind: 'ability' }, f.fx, ctx);
    expect(f.ended.length).toBe(1);
  });

  for (const talents of [[], ['wide-stage'], ['encore-performance']]) {
    it(`R: the stage sits at the sim radius, curtains part over the arm, one pulse per sim pulse (${talents.join(',') || 'base'})`, () => {
      const f = fakeFx('own', talents);
      const a = abilNumbers('bengas', 'r', talents);
      SKILL_FX.onCast!(cast(3, 5000, 0), f.fx, ctx);
      const rad = a.radius / 1000;
      const curtains = f.spawned.filter((s) => s.kind === 'curtain');
      expect(curtains.length).toBe(2);
      for (const c of curtains) {
        expect(c.o.sx).toBeCloseTo(rad, 9);
        expect(c.o.life).toBeCloseTo(a.windup * TICK_S, 9);
        expect(c.o.sy!).toBeLessThanOrEqual(1.6);
        expect(c.o.p3!).toBe(0);
      }
      // the half facing the camera (+z) is the lower one, so the units inside stay visible
      const facing = (c: Spawned) => -Math.sin(c.o.yaw!);
      const [nearC, farC] = facing(curtains[0]) > facing(curtains[1]) ? [curtains[0], curtains[1]] : [curtains[1], curtains[0]];
      expect(facing(nearC)).toBeCloseTo(1, 6);
      expect(nearC.o.sy!).toBeLessThan(farC.o.sy!);
      const edge = f.spawned.filter((s) => s.kind === 'arc');
      expect(edge.length).toBe(2);
      for (const s of edge) {
        expect(s.o.sx).toBeCloseTo(rad, 9);
        expect(s.o.x).toBeCloseTo(5, 9);
        expect(s.o.life).toBeCloseTo((a.windup + a.duration) * TICK_S, 9);
      }
      f.spawned.length = 0;
      // the conducting downbeats land on the pulses: each one draws its pulse on time
      const pulses = Math.floor(a.duration / a.every);
      for (let k = 0; k < pulses; k++) {
        const at = (a.windup + k * a.every) * TICK_S;
        f.step(at - f.time());
        SKILL_FX.onMarker!(0, 'bengas.r.hold', 'b:beat', f.fx);
      }
      f.step((a.windup + a.duration) * TICK_S + 0.2 - f.time());
      const rings = f.spawned.filter((s) => s.kind === 'ring');
      expect(rings.length).toBe(pulses);
      for (let k = 0; k < rings.length; k++) {
        expect(rings[k].o.sx).toBeCloseTo(rad, 9);
        expect(Math.abs(rings[k].at - (a.windup + k * a.every) * TICK_S)).toBeLessThanOrEqual(FRAME * 1.5);
      }
      // dressing never passes the sim radius
      for (const p of f.spawned.filter((s) => s.kind === 'pillar')) expect(Math.hypot(p.o.x - 5, p.o.z) + p.o.sx * 0.5).toBeLessThanOrEqual(rad);
      // the curtains close at the end
      expect(f.spawned.filter((s) => s.kind === 'curtain').length).toBe(2);
    });
  }

  it('R: a downbeat ahead of the pulse (a hold started early) never draws it early', () => {
    const f = fakeFx();
    const a = abilNumbers('bengas', 'r');
    SKILL_FX.onCast!(cast(3, 5000, 0), f.fx, ctx);
    f.spawned.length = 0;
    // a downbeat 6 t before the first pulse: nothing; the fallback draws it on time
    f.step((a.windup - 6) * TICK_S);
    SKILL_FX.onMarker!(0, 'bengas.r.hold', 'b:beat', f.fx);
    expect(f.spawned.filter((s) => s.kind === 'ring').length).toBe(0);
    f.step(8 * TICK_S);
    const rings = f.spawned.filter((s) => s.kind === 'ring');
    expect(rings.length).toBe(1);
    expect(rings[0].at).toBeGreaterThanOrEqual(a.windup * TICK_S - 1e-9);
    // a downbeat after the last pulse draws nothing
    f.step((a.windup + a.duration) * TICK_S - f.time() - 0.05);
    const n = f.spawned.filter((s) => s.kind === 'ring').length;
    expect(n).toBe(a.duration / a.every);
    SKILL_FX.onMarker!(0, 'bengas.r.end', 'b:beat', f.fx);
    expect(f.spawned.filter((s) => s.kind === 'ring').length).toBe(n);
  });

  it('R: bound to the sim zone: the arm sets the stage clock, the end closes the curtains', () => {
    const f = fakeFx();
    const a = abilNumbers('bengas', 'r');
    SKILL_FX.onCast!(cast(3, 5000, 0), f.fx, ctx);
    SKILL_FX.onZone!(2, 'spawn', f.fx);
    f.spawned.length = 0;
    // the render clock runs 3 t behind the sim (a hitch, hit-stop): the arm still lands the first pulse on it
    f.step((a.windup - 3) * TICK_S);
    expect(f.spawned.filter((s) => s.kind === 'ring').length).toBe(0);
    SKILL_FX.onZone!(2, 'arm', f.fx);
    f.step(FRAME);
    expect(f.spawned.filter((s) => s.kind === 'ring').length).toBe(1);
    // the following pulses on the period from the arm
    f.step(a.every * TICK_S - FRAME * 2.5);
    expect(f.spawned.filter((s) => s.kind === 'ring').length).toBe(1);
    f.step(FRAME);
    expect(f.spawned.filter((s) => s.kind === 'ring').length).toBe(2);
    // a bound stage outlives its own clock until the sim ends the zone; then the curtains close and the pulses stop
    f.step((a.windup + a.duration) * TICK_S + 0.5 - f.time());
    const before = f.spawned.filter((s) => s.kind === 'curtain').length;
    expect(before).toBe(0);
    SKILL_FX.onZone!(2, 'end', f.fx);
    expect(f.spawned.filter((s) => s.kind === 'curtain').length).toBe(2);
    const rings = f.spawned.filter((s) => s.kind === 'ring').length;
    f.step(1);
    expect(f.spawned.filter((s) => s.kind === 'ring').length).toBe(rings);
  });

  it('R: a zone spawned in the same snapshot before the cast still binds', () => {
    const f = fakeFx();
    SKILL_FX.onZone!(5, 'spawn', f.fx);
    SKILL_FX.onCast!(cast(3, 5000, 0), f.fx, ctx);
    f.spawned.length = 0;
    SKILL_FX.onZone!(5, 'end', f.fx);
    expect(f.spawned.filter((s) => s.kind === 'curtain').length).toBe(2);
  });

  it('R: with no downbeats (he walks away) the pulses still draw on the stage clock, never early', () => {
    const f = fakeFx();
    const a = abilNumbers('bengas', 'r');
    SKILL_FX.onCast!(cast(3, 5000, 0), f.fx, ctx);
    f.spawned.length = 0;
    f.step((a.windup + a.duration) * TICK_S + 0.3);
    const rings = f.spawned.filter((s) => s.kind === 'ring');
    expect(rings.length).toBe(a.duration / a.every);
    for (let k = 0; k < rings.length; k++) {
      const late = rings[k].at - (a.windup + k * a.every) * TICK_S;
      expect(late).toBeGreaterThanOrEqual(-1e-9);
      expect(late).toBeLessThanOrEqual(FRAME * 1.5);
    }
  });

  it('an enemy Bengas draws with the danger rim', () => {
    const f = fakeFx('enemy');
    SKILL_FX.onCast!(cast(3, 5000, 0), f.fx, ctx);
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    for (const s of f.spawned) {
      expect(s.o.rel).toBe('enemy');
      expect(s.o.rim).toBe(0xff3040);
    }
  });
});
