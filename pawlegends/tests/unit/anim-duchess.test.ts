/**
 * Duchess move set and skill FX (sim v11, docs/plans/moba/CATS-V11.md §2.3): the clips bind to the sim timings (basic
 * release, Not Amused and Royal Decree windups, Cushion Glide at her own 12 m/s), stay inside the root caps, compile on
 * her rig, and the skill FX draw at the sim's own width, range, arc and radii and stop on the sim's last tick.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, SIM_TIMING, TICK_S, abilNumbers, travelTicks } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { type FxCtx, type HeroStatus, type MeshFxKind, type MeshFxSpawn, type MoveCtx } from '../../src/render/anim/types';
import { UPPER } from '../../src/render/anim/masks';
import { BONE_INDEX, type BoneName } from '../../src/render/chars/skeleton';
import { HERO_MOTION } from '../../src/render/chars';
import { DUCHESS_CLIPS, E_TICKS, MOVES } from '../../src/render/moves/duchess';
import { SKILL_FX, duchessFxLive, resetDuchessFx } from '../../src/render/skillfx/duchess';

const FRAME = 1 / 60;
const T = SIM_TIMING.duchess;
const m = (c: { markers: Readonly<Record<string, number>> }, k: string): number => c.markers[k] ?? NaN;

describe('duchess moves', () => {
  it('is filled and binds every move to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.basic.length).toBe(2);
    for (const c of MOVES.basic) {
      expect(Math.abs(m(c, 'contact') - BASIC_WINDUP * TICK_S)).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toContainEqual(['contact', 'release']);
      expect(c.len).toBeLessThan(T.period * TICK_S);
    }
    expect(MOVES.slots.q.cast.warp).toEqual([['contact', 'cast']]);
    // W: the snub on windupStart, the glare on the cast 11 t later
    const w = MOVES.slots.w.cast;
    expect(w.warp).toEqual([['coil', 'windupStart'], ['contact', 'cast']]);
    expect(T.slots.w.windup).toBe(11);
    expect(m(w, 'contact') - m(w, 'coil')).toBeCloseTo(11 * TICK_S, 9);
    // E: 4 m at her own 12 m/s = 10 t (not the shared 20 m/s dash's 6 t)
    const e = MOVES.slots.e.cast;
    expect(e.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
    const a = abilNumbers('duchess', 'e');
    expect(E_TICKS).toBe(travelTicks(a.dash, a.speed));
    expect(E_TICKS).toBe(10);
    expect(m(e, 'land') - m(e, 'takeoff')).toBeCloseTo(10 * TICK_S, 9);
    // R: the rise from windupStart, the stamp on the cast 18 t later
    const r = MOVES.slots.r.cast;
    expect(r.warp).toEqual([['coil', 'windupStart'], ['contact', 'cast']]);
    expect(T.slots.r.windup).toBe(18);
    expect(m(r, 'contact') - m(r, 'coil')).toBeCloseTo(18 * TICK_S, 9);
  });

  it('every clip compiles on her rig with finite values, keeps the root caps and the spin rule', () => {
    const ch = makeHero('duchess', 0, null, { detail: 0.62 });
    for (const c of DUCHESS_CLIPS) {
      const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
      for (let i = 0; i < bin.q.length; i++) expect(Number.isFinite(bin.q[i]), c.id).toBe(true);
      for (let i = 0; i < bin.p.length; i++) expect(Number.isFinite(bin.p[i]), c.id).toBe(true);
      const r = c.root ?? {};
      for (const k of ['fwd', 'side'] as const) {
        const ks = r[k];
        if (!ks) continue;
        for (const [, v] of ks) expect(Math.abs(v), `${c.id} ${k}`).toBeLessThanOrEqual(c.prio === 9 ? ROOT_CAPS.horizDead : ROOT_CAPS.horiz);
        if (c.prio !== 9) expect(ks[ks.length - 1][1], `${c.id} ${k} ends at 0`).toBe(0);
      }
      for (const [, v] of r.up ?? []) expect(v >= 0 && v <= ROOT_CAPS.upClip, `${c.id} up`).toBe(true);
      for (const k of ['yaw', 'roll', 'pitch'] as const) {
        const ks = r[k];
        if (ks) expect(ks[ks.length - 1][1], `${c.id} ${k} ends at 0`).toBe(0);
      }
      // §9 rule 6: a half turn takes ≤ 0.3 s
      const yaw = r.yaw ?? [];
      for (let i = 1; i < yaw.length; i++) if (Math.abs(yaw[i][1] - yaw[i - 1][1]) >= 0.5 && yaw[i][2] !== 'step') expect(yaw[i][0] - yaw[i - 1][0], `${c.id} spin`).toBeLessThanOrEqual(0.3 + 1e-9);
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0]).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      if (c.prio >= 4 && c.prio <= 7) expect(Number.isFinite(m(c, 'contact')), c.id).toBe(true);
    }
    ch.dispose();
  });

  it('post-contact tails are short, and the upper-mask basics keep the root still', () => {
    const { q, w, e, r } = { q: MOVES.slots.q.cast, w: MOVES.slots.w.cast, e: MOVES.slots.e.cast, r: MOVES.slots.r.cast };
    for (const c of [q, w]) {
      expect(m(c, 'land') - m(c, 'contact'), c.id).toBeLessThanOrEqual(0.35);
      expect(c.len - m(c, 'land'), c.id).toBeLessThanOrEqual(0.15);
    }
    expect(e.len - m(e, 'land')).toBeLessThanOrEqual(0.25);
    expect(r.len - m(r, 'contact')).toBeLessThanOrEqual(0.3);
    for (const c of MOVES.basic) {
      expect(c.mask).toBe('upper');
      for (const [, , d] of c.keys) for (const b of Object.keys(d ?? {})) expect(UPPER[BONE_INDEX[b as BoneName]], `${c.id} ${b}`).toBeGreaterThan(0);
      for (const [, v] of c.root?.up ?? []) expect(v).toBeLessThanOrEqual(0.06);
      for (const k of ['fwd', 'side'] as const) for (const [, v] of c.root?.[k] ?? []) expect(Math.abs(v)).toBeLessThanOrEqual(0.04);
    }
  });

  it('the basic combo alternates A → B; the idle floats (the root never touches down)', () => {
    const ctx = { comboIndex: 0 } as unknown as MoveCtx;
    const ids: string[] = [];
    for (let n = 0; n < 3; n++) {
      (ctx as { comboIndex: number }).comboIndex = n;
      ids.push(MOVES.basicPick!(ctx)!.id);
    }
    expect(ids).toEqual(['duchess.basicA', 'duchess.basicB', 'duchess.basicA']);
    for (const [, v] of MOVES.idle.root!.up!) expect(v).toBeGreaterThan(0.02);
    // the shared tables read her own profile: idle on her feet inside the cushion, groom cast, paw attack
    expect(HERO_MOTION.duchess).toMatchObject({ idle: 'stand', cast: 'groom', attack: 'paw' });
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

/** Duchess is 0 at the origin; ally 1 at (2, 0); enemy 3 at (4, 0). */
function fakeFx(rel: 'own' | 'enemy' = 'own', talents: string[] = [], tier: 'low' | 'med' | 'high' = 'high') {
  const spawned: Spawned[] = [];
  let now = 0;
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 1: { x: 2, z: 0 }, 3: { x: 4, z: 0 } };
  const status: Record<number, HeroStatus> = {};
  const relOf = (id: number) => (id === 0 ? rel : id === 1 ? (rel === 'own' ? 'ally' : 'enemy') : rel === 'own' ? 'enemy' : 'ally');
  const fx = {
    tier,
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o }, at: now }), spawned.length) },
    ribbons: { point: () => -1, feed: () => {}, end: () => {} },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: relOf,
    rim: (id: number) => (relOf(id) === 'enemy' ? 0xff3040 : 0xffd34d),
    abil: (_id: number, slot: 'q' | 'w' | 'e' | 'r') => abilNumbers('duchess', slot, talents),
    heroPos: (id: number, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x;
      out.y = 0;
      out.z = p.z;
      return true;
    },
    bonePos: () => false,
    status: (id: number, out: HeroStatus) => {
      const st = status[id];
      if (!st) return false;
      out.buffs = st.buffs;
      out.shield = st.shield;
      return true;
    },
  } as unknown as FxCtx;
  const step = (s: number) => {
    for (let t = 0; t < s - 1e-9; t += FRAME) {
      now += FRAME;
      SKILL_FX.update!(FRAME, fx);
    }
  };
  return { fx, spawned, step };
}

const cast = (slot: number, x = 4000, y = 0, target = -1) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target });
const hit = (dst: number, kind: 'basic' | 'ability') => ({ type: 'hit' as const, tick: 0, src: 0, dst, amount: 10, shielded: 0, kind });
const ctx = {} as MoveCtx;
const STUNNED = 1 << 3;

describe('duchess skill FX', () => {
  beforeEach(() => resetDuchessFx());

  it('owns every slot', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: true, passive: true });
  });

  it('Q: the ground strip is the skillshot width (Double Fluff 1.9 m) and ends at the range at the sim speed', () => {
    for (const [talents, width] of [[[], 1.4], [['double-fluff'], 1.9]] as const) {
      resetDuchessFx();
      const f = fakeFx('own', [...talents]);
      SKILL_FX.onCast!(cast(0), f.fx, ctx);
      const flight = 7.5 / 9;
      f.step(flight - 0.05);
      expect(duchessFxLive().puffs).toBe(1);
      f.step(0.1);
      expect(duchessFxLive().puffs).toBe(0);
      const strips = f.spawned.filter((s) => s.kind === 'beam');
      expect(strips.length).toBe(7);
      for (const s of strips) {
        expect(s.o.sz).toBeCloseTo(width, 9);
        expect(s.o.x + s.o.sx).toBeLessThanOrEqual(7.5 + 1e-6);
      }
    }
  });

  it('W: the glare wedge at the exact range and arc (Grand Glare), the enemy rim red', () => {
    for (const [talents, arc] of [[[], 910], [['grand-glare'], 1200]] as const) {
      resetDuchessFx();
      const f = fakeFx('enemy', [...talents]);
      SKILL_FX.onWindup!({ type: 'windup', tick: 0, src: 0, slot: 1, x: 4000, y: 0, ticks: 11 }, f.fx);
      expect(f.spawned[0].o.life).toBeCloseTo(11 * TICK_S, 9);
      SKILL_FX.onCast!(cast(1), f.fx, ctx);
      const wedge = f.spawned.find((s) => s.kind === 'arc')!;
      expect(wedge.o.sx).toBeCloseTo(5, 9);
      expect(wedge.o.p0).toBeCloseTo((arc / 4096) * Math.PI * 2, 9);
      expect(wedge.o.yaw).toBeCloseTo(0, 9);
      for (const s of f.spawned) expect([s.o.rim, s.o.rel]).toEqual([0xff3040, 'enemy']);
    }
  });

  it('E: the fur cloud at the take-off point, exactly the sim radius (Shedding Season) for exactly its life (Cloud Nine)', () => {
    for (const [talents, rad, ttl] of [[[], 2.2, 75], [['shedding-season', 'cloud-nine'], 3, 120]] as const) {
      resetDuchessFx();
      const f = fakeFx('own', [...talents]);
      SKILL_FX.onCast!(cast(2, -4000, 0), f.fx, ctx);
      const rim = f.spawned.find((s) => s.kind === 'arc')!;
      expect([rim.o.x, rim.o.z]).toEqual([0, 0]);
      expect(rim.o.sx).toBeCloseTo(rad, 9);
      expect(rim.o.life).toBeCloseTo(ttl * TICK_S, 9);
      f.step(ttl * TICK_S - 0.05);
      expect(duchessFxLive().clouds).toBe(1);
      f.step(0.1);
      expect(duchessFxLive().clouds).toBe(0);
      // a pulse ring every 15 t (the first one is the cast), all inside the radius
      const pulses = f.spawned.filter((s) => s.kind === 'ring' && s.at > 0);
      expect(pulses.length).toBe(Math.ceil(ttl / 15) - 1);
      for (const p of pulses) expect(p.o.sx).toBeLessThanOrEqual(rad);
    }
  });

  it('R: the crown wave at exactly the sim radius (Imperial Decree 7.5 m), crown points on the rim', () => {
    for (const [talents, rad] of [[[], 6], [['imperial-decree'], 7.5]] as const) {
      resetDuchessFx();
      const f = fakeFx('own', [...talents], 'low');
      SKILL_FX.onCast!(cast(3, 0, 0), f.fx, ctx);
      const ring = f.spawned.find((s) => s.kind === 'ring')!;
      expect(ring.o.sx).toBeCloseTo(rad, 9);
      const points = f.spawned.filter((s) => s.kind === 'pillar');
      expect(points.length).toBe(5);
      for (const p of points) expect(Math.hypot(p.o.x, p.o.z)).toBeCloseTo(rad * 0.97, 6);
    }
  });

  it('Snub: stars only on a stun shortly after one of her ability hits on that hero', () => {
    const f = fakeFx('own');
    // a stun with no hit of hers: nothing
    SKILL_FX.onStatus!(3, STUNNED, 0, f.fx);
    expect(duchessFxLive().snubs).toBe(0);
    // a basic hit, then a stun: not a Snub
    SKILL_FX.onHit!(hit(3, 'basic'), f.fx, ctx);
    SKILL_FX.onStatus!(3, STUNNED, 0, f.fx);
    expect(duchessFxLive().snubs).toBe(0);
    // an ability hit, then the stun in the next snapshot: a Snub (once)
    SKILL_FX.onHit!(hit(3, 'ability'), f.fx, ctx);
    f.step(0.1);
    SKILL_FX.onStatus!(3, STUNNED, 0, f.fx);
    SKILL_FX.onStatus!(3, STUNNED, 0, f.fx);
    expect(duchessFxLive().snubs).toBe(1);
    // too late after the hit: not hers
    SKILL_FX.onHit!(hit(3, 'ability'), f.fx, ctx);
    f.step(0.5);
    SKILL_FX.onStatus!(3, STUNNED, 0, f.fx);
    expect(duchessFxLive().snubs).toBe(1);
  });
});
