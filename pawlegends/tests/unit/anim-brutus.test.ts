/**
 * Sir Brutus move set and skill FX (ANIM-SPEC §14): the clips bind to the sim timings (basic windup, Pug Charge
 * travel, Guard Post length), stay inside the root caps, compile on his rig, the picks are allocation-free and
 * correct, and the skill FX draw at the sim radii and stop on the sim's last tick.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, DASH_SPEED, SIM_TIMING, TICK_S, abilNumbers, travelTicks } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import type { FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, Slot } from '../../src/render/anim/types';
import { BRUTUS_CLIPS, CHARGE_AIR, MOVES, POST_S, brutusBasicPick } from '../../src/render/moves/brutus';
import { SKILL_FX, resetBrutusFx } from '../../src/render/skillfx/brutus';

const FRAME = 1 / 60;

describe('brutus moves', () => {
  it('is filled and binds to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.basic.length).toBe(3);
    for (const c of MOVES.basic) {
      expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S)).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toContainEqual(['contact', 'contact']);
      expect(c.len).toBeLessThan(SIM_TIMING.brutus.period * TICK_S);
    }
    // Pug Charge: take-off on the cast, landing on travelEnd, nominal air = 8 t; the skid on the landing
    const e = MOVES.slots.e.cast;
    expect(e.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
    expect(SIM_TIMING.brutus.slots.e.dashTicks).toBe(8);
    expect(Math.abs(e.markers.land - e.markers.takeoff - CHARGE_AIR)).toBeLessThan(1e-9);
    expect(e.markers.skid).toBe(e.markers.land);
    // the sim always dashes the full 5 m (director: travelEnd from the full length), so there is no short-aim pick
    expect(MOVES.slots.e.pick).toBeUndefined();
    expect(SIM_TIMING.brutus.slots.e.aimClamped).toBe(false);
    expect(MOVES.slots.e.onHit?.warp).toEqual([['contact', 'contact']]);
    // instant casts pin the contact on the cast tick
    for (const s of ['q', 'w', 'r'] as Slot[]) expect(MOVES.slots[s].cast.warp[0]).toEqual(['contact', 'cast']);
    // Guard Post spans exactly postDuration (60 t): contact → cast, release → stateEnd
    const post = MOVES.slots.w.branch!;
    expect(POST_S).toBeCloseTo(60 * TICK_S, 9);
    expect(post.warp).toEqual([['contact', 'cast'], ['release', 'stateEnd']]);
    expect(Math.abs((post.markers.release ?? NaN) - (post.markers.contact ?? NaN) - POST_S)).toBeLessThanOrEqual(0.1);
  });

  it('every clip compiles on his rig with finite values and keeps the root caps', () => {
    const ch = makeHero('brutus', 0, null, { detail: 0.62 });
    for (const c of BRUTUS_CLIPS) {
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
      // §9 rule 6: a full spin lasts ≤ 0.3 s
      const yaw = r.yaw ?? [];
      for (let i = 1; i < yaw.length; i++) if (Math.abs(yaw[i][1] - yaw[i - 1][1]) >= 0.5) expect(yaw[i][0] - yaw[i - 1][0], `${c.id} spin`).toBeLessThanOrEqual(0.3 + 1e-9);
      // keys in time order inside the clip
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0]).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
    }
    ch.dispose();
  });

  it('E: three full stride cycles end on the skid key; lean ≈ 25°; bounce ≤ 0.06 m', () => {
    const e = MOVES.slots.e.cast;
    const t0 = e.markers.takeoff;
    const t1 = e.markers.skid;
    // the leading thigh at the take-off and at each 1/6 of the travel alternates L / R: six half cycles
    const lead = (t: number): number => {
      const k = e.keys.find((x) => Math.abs(x[0] - t) < 1e-9);
      expect(k, `key at ${t}`).toBeDefined();
      const d = k![2] as Record<string, readonly number[]>;
      return Math.sign((d.thighL?.[0] ?? 0) - (d.thighR?.[0] ?? 0));
    };
    let prev = lead(t0);
    for (let i = 1; i <= 5; i++) {
      const cur = lead(t0 + ((t1 - t0) * i) / 6);
      expect(cur).toBe(-prev);
      prev = cur;
    }
    expect(e.keys.some((k) => Math.abs(k[0] - t1) < 1e-9)).toBe(true);
    const pitch = Math.max(...(e.root?.pitch ?? []).map((k) => k[1]));
    expect(pitch * 360).toBeGreaterThan(10);
    expect(pitch * 360).toBeLessThan(15);
    for (const [t, v] of e.root?.up ?? []) if (t > t0 && t < t1) expect(v).toBeLessThanOrEqual(0.06);
  });

  it('Q and R leave the legs to the gait (instant casts: he may walk on the cast tick)', () => {
    expect(MOVES.slots.q.cast.mask).toBe('upper');
    expect(MOVES.slots.r.cast.mask).toBe('upper');
    const ctx = { talents: ['rally-howl'] } as unknown as MoveCtx;
    expect(MOVES.slots.r.pick!(ctx)?.mask).toBe('upper');
  });

  it('death topples backward (away from the killer in front) and eases into the lying pose after the bounce', () => {
    const d = MOVES.death;
    const impact = d.markers.impact;
    const pitch = d.root?.pitch ?? [];
    const atImpact = pitch.find((k) => Math.abs(k[0] - impact) < 1e-9);
    expect(atImpact?.[1]).toBeLessThanOrEqual(-0.22);
    for (const [, v] of d.root?.fwd ?? []) expect(v).toBeLessThanOrEqual(0);
    // no pose switch on the impact key: the lying pose arrives ≥ 0.15 s later
    const firstPose = d.keys.find((k) => k[1] !== null);
    expect(firstPose![0] - impact).toBeGreaterThanOrEqual(0.15);
  });

  it('picks: Honour bash on the finisher while shielded, Rally Howl variant; no allocation', () => {
    const ctx = { hero: 'brutus', id: 0, branch: false, talents: [] as string[], comboIndex: 2, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false } as MoveCtx;
    expect(brutusBasicPick(ctx)).toBeNull();
    (ctx as { buffs: number }).buffs = 1 << 7;
    expect(brutusBasicPick(ctx)?.id).toBe('brutus.basicHonour');
    (ctx as { comboIndex: number }).comboIndex = 1;
    expect(brutusBasicPick(ctx)).toBeNull();
    // planted in Guard Post (the branch + Blocking): every swing is the kneeling chop, which keeps the kneel
    (ctx as { branch: boolean }).branch = true;
    (ctx as { buffs: number }).buffs = 1 << 12;
    const chop = brutusBasicPick(ctx)!;
    expect(chop.id).toBe('brutus.postChop');
    expect(chop.keys.every((k) => k[1] === 'kneel')).toBe(true);
    expect(Math.abs((chop.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S)).toBeLessThanOrEqual(FRAME);
    expect(chop.len).toBeLessThan(SIM_TIMING.brutus.period * TICK_S);
    // Front Guard (no branch) keeps the normal combo
    (ctx as { branch: boolean }).branch = false;
    expect(brutusBasicPick(ctx)).toBeNull();
    (ctx as { buffs: number }).buffs = 1 << 7;
    const pick = MOVES.slots.r.pick!;
    expect(pick(ctx)).toBeNull();
    (ctx as unknown as { talents: string[] }).talents = ['bulwark', 'rally-howl'];
    expect(pick(ctx)?.id).toBe('brutus.rHowl');
    expect(pick(ctx)).toBe(pick(ctx));
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

function fakeFx(rel: 'own' | 'enemy' = 'own', branch = false, tier: 'low' | 'med' | 'high' = 'high') {
  const spawned: Spawned[] = [];
  const debris: number[] = [];
  let now = 0;
  /** Muzzle offset (the animated head → mouth); a spinning clip turns it away from the sim facing. */
  const muzzle = { x: 0.2, z: 0 };
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 4, z: 0 } };
  const fx = {
    tier,
    reduced: false,
    // the Low caps: no wall or chain slots (fxkit/meshFx.ts MESH_CAPS.low)
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (tier === 'low' && (kind === 'wall' || kind === 'chain') ? -1 : (spawned.push({ kind, o: { ...o }, at: now }), spawned.length)) },
    ribbons: { point: () => 1, feed: () => {}, end: () => {} },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => debris.push(now) },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? rel : 'enemy'),
    rim: (id: number) => (id === 0 && rel === 'own' ? 0xffd34d : 0xff3040),
    abil: (_id: number, slot: Slot) => abilNumbers('brutus', slot, null, branch),
    heroPos: (id: number, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x;
      out.y = 0;
      out.z = p.z;
      return true;
    },
    bonePos: (id: number, bone: string, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      // facing +x: the muzzle sits 0.2 m ahead of the head (the FX reads facing head → mouth)
      out.x = p.x + (bone === 'mouth' ? muzzle.x : 0);
      out.y = 1;
      out.z = p.z + (bone === 'mouth' ? muzzle.z : 0);
      return true;
    },
  } as unknown as FxCtx;
  const step = (s: number) => {
    for (let t = 0; t < s; t += FRAME) {
      now += FRAME;
      SKILL_FX.update!(FRAME, fx);
    }
  };
  return { fx, spawned, step, time: () => now, pos, muzzle, debris };
}

const cast = (slot: number, x = 4000, y = 0, target = 3) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target });
const ctx = {} as MoveCtx;

describe('brutus skill FX', () => {
  beforeEach(() => resetBrutusFx());

  it('owns every slot', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: true, passive: true });
  });

  it('Q rings sit at the sim radius (Wide Slam 3.8 m) and spikes stay inside it', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(0), f.fx, ctx);
    const R = abilNumbers('brutus', 'q').radius / 1000;
    const rings = f.spawned.filter((s) => s.kind === 'ring');
    expect(rings.length).toBe(2);
    for (const r of rings) expect(r.o.sx).toBeCloseTo(R, 9);
    for (const p of f.spawned.filter((s) => s.kind === 'pillar')) expect(Math.hypot(p.o.x, p.o.z) + p.o.sx).toBeLessThanOrEqual(R + 1e-6);
    expect(abilNumbers('brutus', 'q', ['wide-slam']).radius).toBe(3800);
  });

  it('W wall: the 120° arc at 1.8 m, refreshed for exactly the duration', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    f.step(4);
    const walls = f.spawned.filter((s) => s.kind === 'wall');
    expect(walls.length).toBeGreaterThan(10);
    for (const w of walls) {
      expect(w.o.sx).toBeCloseTo(1.8, 9);
      expect(w.o.p0).toBeCloseTo((1365 / 4096) * Math.PI * 2, 9);
      expect(w.o.yaw ?? 0).toBeCloseTo(0, 6);
      // nothing lives past the guard's last tick
      expect(w.at + w.o.life).toBeLessThanOrEqual(75 * TICK_S + 0.05);
    }
    // never undrawn while the guard stands (the last 500 ms dim, never skip): consecutive copies overlap
    const sorted = walls.filter((w) => w.o.life < 0.3).sort((a, b) => a.at - b.at);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].at).toBeLessThanOrEqual(sorted[i - 1].at + sorted[i - 1].o.life);
    expect(sorted[sorted.length - 1].at + sorted[sorted.length - 1].o.life).toBeGreaterThan(75 * TICK_S - 0.05);
    const late = sorted.filter((w) => w.at > 75 * TICK_S - 0.5);
    expect(late.some((w) => (w.o.p3 ?? 1) < 2)).toBe(true);
    expect(late.every((w) => (w.o.p3 ?? 0) > 0.5)).toBe(true);
    // a short life: a walking Brutus leaves no stale copy behind (≤ 0.12 s at 60 fps)
    for (const w of sorted) expect(w.o.life).toBeLessThanOrEqual(0.12);
    // the ground band: a solid ≥ 0.15 m band ending at the 1.8 m reach
    const bands = f.spawned.filter((s) => s.kind === 'arc' && s.at > 0);
    expect(bands.length).toBeGreaterThan(20);
    for (const b of bands) {
      expect(b.o.sx).toBeCloseTo(1.8, 9);
      expect((1 - (b.o.p1 ?? 0)) * 1.8).toBeGreaterThanOrEqual(0.15);
    }
  });

  it('W wall follows the sim facing (aim, then movement, then basic targets), never the animated head', () => {
    const f = fakeFx();
    // a spin clip points the muzzle backwards: ignored
    f.muzzle.x = -0.2;
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    f.step(0.3);
    const yawAt = (t: number) => f.spawned.filter((s) => s.kind === 'wall' && s.at >= t && s.o.life < 0.3)[0].o.yaw ?? NaN;
    expect(yawAt(0.1)).toBeCloseTo(0, 6);
    // he walks south (+z): the sim faces the walk, the mesh yaw is −90°
    for (let i = 0; i < 20; i++) {
      f.pos[0].z += 0.08;
      f.step(1 / 60);
    }
    expect(yawAt(f.time() - 0.06)).toBeCloseTo(-Math.PI / 2, 6);
    // he swings at a hero to the east: the swing turns him (and the wall)
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, dmg: 10, kind: 'basic' } as never, f.fx, { buffs: 0 } as MoveCtx);
    const t = f.time();
    f.step(0.1);
    expect(yawAt(t)).toBeCloseTo(Math.atan2(-(0 - f.pos[0].z), 4), 6);
  });

  it('Guard Post dome at the post radius, gone by the last tick', () => {
    const f = fakeFx('own', true);
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    f.step(3);
    const domes = f.spawned.filter((s) => s.kind === 'dome');
    expect(domes.length).toBeGreaterThan(2);
    for (const d of domes) expect(d.o.sx).toBeCloseTo(3, 9);
    // the shimmers fade out by the end (the shatter flash spawns at the end)
    for (const d of domes) if (d.at < 60 * TICK_S - 0.02) expect(d.at + d.o.life).toBeLessThanOrEqual(60 * TICK_S + 0.05);
    // the shimmer reaches the last tick (no blank tail)
    const shimmerEnd = Math.max(...domes.filter((d) => d.at > 0.01 && d.at < 60 * TICK_S - 0.02).map((d) => d.at + d.o.life));
    expect(shimmerEnd).toBeGreaterThan(60 * TICK_S - 0.05);
    expect(f.spawned.some((s) => s.kind === 'wall')).toBe(false);
    // the ground band at the dome radius from the cast tick to exactly the last tick, never a gap
    const bands = f.spawned.filter((s) => s.kind === 'arc').sort((a, b) => a.at - b.at);
    expect(bands[0].at).toBe(0);
    for (const b of bands) {
      expect(b.o.sx).toBeCloseTo(3, 9);
      expect(b.o.p0).toBeCloseTo(Math.PI * 2, 9);
      expect(b.at + b.o.life).toBeLessThanOrEqual(60 * TICK_S + 0.02);
    }
    for (let i = 1; i < bands.length; i++) expect(bands[i].at).toBeLessThanOrEqual(bands[i - 1].at + bands[i - 1].o.life);
    expect(bands[bands.length - 1].at + bands[bands.length - 1].o.life).toBeGreaterThan(60 * TICK_S - 0.05);
  });

  it('R: obelisks inside the 6 m edge, the chain only for the duration, enemy rim red', () => {
    const f = fakeFx('enemy');
    SKILL_FX.onCast!(cast(3), f.fx, ctx);
    f.step(4);
    const ob = f.spawned.filter((s) => s.kind === 'pillar');
    expect(ob.length).toBeGreaterThanOrEqual(12);
    for (const p of ob) {
      const d = Math.hypot(p.o.x, p.o.z);
      expect(d + p.o.sx).toBeLessThanOrEqual(6 + 1e-6);
      expect(d).toBeGreaterThan(5);
      expect(p.o.rim).toBe(0xff3040);
      expect(p.o.rel).toBe('enemy');
      if (p.at > 0.01) expect(p.at + p.o.life).toBeLessThanOrEqual(90 * TICK_S + 0.05);
      expect(p.o.sy).toBeLessThanOrEqual(1.4);
      // others' obelisks stay faint (the telegraphs inside read)
      expect(p.o.p3 ?? 1).toBeLessThanOrEqual(0.6);
    }
    // the arena edge band at 6 m for the whole duration
    const bands = f.spawned.filter((s) => s.kind === 'arc').sort((a, b) => a.at - b.at);
    expect(bands[0].at).toBe(0);
    for (const b of bands) expect(b.o.sx).toBeCloseTo(6, 9);
    for (let i = 1; i < bands.length; i++) expect(bands[i].at).toBeLessThanOrEqual(bands[i - 1].at + bands[i - 1].o.life);
    expect(bands[bands.length - 1].at + bands[bands.length - 1].o.life).toBeGreaterThan(90 * TICK_S - 0.05);
    // the slam is his own impact, not a 6 m damage ring
    const before = f.spawned.length;
    SKILL_FX.onMarker!(0, 'brutus.r', 'rSlam', f.fx);
    for (const s of f.spawned.slice(before)) if (s.kind === 'ring') expect(s.o.sx).toBeLessThanOrEqual(2.5);
    const chains = f.spawned.filter((s) => s.kind === 'chain');
    expect(chains.length).toBeGreaterThan(20);
    for (const c of chains) {
      expect(c.o.sx).toBeCloseTo(4, 6);
      expect(c.at + c.o.life).toBeLessThanOrEqual(90 * TICK_S + 0.05);
    }
  });

  it('E: a 2 m aim still charges the full 5 m: the wake runs the whole 8 t travel', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(2, 2000, 0), f.fx, ctx);
    f.step(0.6);
    const lastWake = Math.max(...f.debris);
    expect(lastWake).toBeGreaterThan(travelTicks(5000, DASH_SPEED) * TICK_S);
    expect(lastWake).toBeLessThanOrEqual(travelTicks(5000, DASH_SPEED) * TICK_S + 0.12 + 1e-9);
  });

  it('E: the dust streak follows the travelled path; the update allocates no records past the pool', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(2, 5000, 0), f.fx, ctx);
    expect(travelTicks(5000, DASH_SPEED)).toBe(8);
    f.step(1);
    SKILL_FX.onMarker!(0, 'brutus.e', 'eSkid', f.fx);
    // he did not move in the fake: no streak drawn along the aim
    expect(f.spawned.some((s) => s.kind === 'meteor')).toBe(false);
    for (let i = 0; i < 20; i++) SKILL_FX.onCast!(cast(i % 4), f.fx, ctx);
    f.step(5);
  });

  it('Low: the guard falls back to the ground arc and the tether to a beam (no wall / chain slots)', () => {
    const f = fakeFx('own', false, 'low');
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    f.step(1);
    const arcs = f.spawned.filter((s) => s.kind === 'arc');
    expect(arcs.length).toBeGreaterThan(3);
    for (const a of arcs) expect(a.o.sx).toBeCloseTo(1.8, 9);
    resetBrutusFx();
    const g = fakeFx('own', false, 'low');
    SKILL_FX.onCast!(cast(3), g.fx, ctx);
    g.step(1);
    expect(g.spawned.filter((s) => s.kind === 'beam').length).toBeGreaterThan(3);
    // the arena edge reads on Low too
    expect(g.spawned.filter((s) => s.kind === 'arc' && Math.abs(s.o.sx - 6) < 1e-9).length).toBeGreaterThanOrEqual(3);
  });
});
