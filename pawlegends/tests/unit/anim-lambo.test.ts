/**
 * Lambo move set and skill FX (ANIM-SPEC §14 "Lambo"): the clips bind to the sim timings (basic windup, Belly Flop
 * travel + ring tick, Tangled Lights windup and pull), stay inside the root caps, compile on his rig, and the skill
 * FX draw at the sim radii (talents included) and stop on the sim's last tick.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, FLOP_RING_DELAY, KNOCK_TICKS, SIM_TIMING, TICK_S, abilNumbers } from '../../src/render/anim/timing';
import { BasicClock, ClockOut, COMBO_RESET_TICKS } from '../../src/render/anim/basicClock';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { ANCHOR_INDEX, newAnchors, type ClipDef, type FxCtx, type MeshFxKind, type MeshFxSpawn, type MoveCtx, type Slot } from '../../src/render/anim/types';
import { BuffFlag } from '../../src/sim/api';
import { FLOP_AIR, FLOP_SPLAT_DELAY, LAMBO_CLIPS, MOVES, pickBellyFlop, resetLamboMoves } from '../../src/render/moves/lambo';
import { SKILL_FX, resetLamboFx } from '../../src/render/skillfx/lambo';

const FRAME = 1 / 60;

describe('lambo moves', () => {
  it('is filled and binds to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.hero).toBe('lambo');
    expect(MOVES.basic.length).toBe(3);
    for (const c of MOVES.basic) {
      expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S)).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toContainEqual(['contact', 'contact']);
      expect(c.len).toBeLessThan(SIM_TIMING.lambo.period * TICK_S);
    }
    // instant casts pin the strike on the cast tick
    for (const s of ['q', 'w'] as Slot[]) expect(MOVES.slots[s].cast.warp).toEqual([['contact', 'cast']]);
    // Belly Flop: take-off on the cast, land on travelEnd, the splat one tick later
    const e = MOVES.slots.e.cast;
    expect(e.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
    expect(SIM_TIMING.lambo.slots.e.dashTicks).toBe(8);
    expect(e.markers.land - e.markers.takeoff).toBeCloseTo(FLOP_AIR, 9);
    expect(FLOP_SPLAT_DELAY).toBeCloseTo(FLOP_RING_DELAY * TICK_S, 9);
    expect(e.markers.splat - e.markers.land).toBeCloseTo(FLOP_SPLAT_DELAY, 9);
    // the ring is skillfx's, bound to the sim landing: no clip-time ring cue, no extra freeze on the splat
    expect(e.cues?.some(([, k, a]) => k === 'fx' && a === 'splat')).toBe(false);
    expect(e.cues?.some(([, k]) => k === 'freeze')).toBe(false);
    // Tangled Lights: the windup spin spans windupStart → cast (15 t), the haul the 6 t pull
    const r = MOVES.slots.r.cast;
    expect(r.warp).toEqual([['coil', 'windupStart'], ['contact', 'cast']]);
    expect(SIM_TIMING.lambo.slots.r.windup).toBe(15);
    expect((r.markers.contact ?? 0) - (r.markers.coil ?? 0)).toBeCloseTo(15 * TICK_S, 9);
    const yaw = r.root?.yaw ?? [];
    // one whole turn, 'inOut' (peak ≈ 1.5 × 1 turn / 0.44 s ≈ 3.4 turns/s, 0.11 turn a 30 fps frame), 10–15° past
    // square on the cast, settled back on the whole turn within 3 frames
    const atCast = yaw.find(([t]) => Math.abs(t - (r.markers.contact ?? 0)) < 1e-9);
    expect(atCast?.[2]).toBe('inOut');
    const over = ((atCast?.[1] ?? 0) - 1) * 360;
    expect(over).toBeGreaterThanOrEqual(10);
    expect(over).toBeLessThanOrEqual(15);
    const settle = yaw.find(([t, v]) => t > (r.markers.contact ?? 0) && v === 1);
    expect((settle?.[0] ?? 9) - (r.markers.contact ?? 0)).toBeLessThanOrEqual(0.1 + 1e-9);
    // the haul tips the whole silhouette back (root pitch), not only the chest
    expect(Math.min(...(r.root?.pitch ?? [[0, 0]]).map(([, v]) => v))).toBeLessThanOrEqual(-0.06);
    // movement / a new cast may cut the tails: no 'none' cancel, Q and W leave the legs to the gait
    expect(r.cancel).toBe('afterContact');
    for (const s of ['q', 'w'] as Slot[]) expect(MOVES.slots[s].cast.mask).toBe('upper');
    expect((r.markers.plant ?? 0) - (r.markers.contact ?? 0)).toBeCloseTo(KNOCK_TICKS * TICK_S + 0.16, 9);
  });

  it('every clip compiles on his rig with finite values and keeps the root caps', () => {
    const ch = makeHero('lambo', 0, null, { detail: 0.62 });
    for (const c of LAMBO_CLIPS) {
      const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
      for (let i = 0; i < bin.q.length; i++) expect(Number.isFinite(bin.q[i]), c.id).toBe(true);
      for (let i = 0; i < bin.p.length; i++) expect(Number.isFinite(bin.p[i]), c.id).toBe(true);
      const root = c.root ?? {};
      for (const k of ['fwd', 'side'] as const) {
        const ks = root[k];
        if (!ks) continue;
        for (const [, v] of ks) expect(Math.abs(v), `${c.id} ${k}`).toBeLessThanOrEqual(ROOT_CAPS.horiz);
        if (c.id !== 'lambo.death') expect(ks[ks.length - 1][1], `${c.id} ${k} ends at 0`).toBe(0);
      }
      const upCap = c.id.startsWith('lambo.e') ? ROOT_CAPS.upMax : ROOT_CAPS.upClip;
      for (const [, v] of root.up ?? []) expect(v >= 0 && v <= upCap, `${c.id} up ${v}`).toBe(true);
      // §9 rule 6: a full spin lasts ≤ 0.3 s, except the windup spin locked to the sim windup (R)
      if (c.id !== 'lambo.r') {
        const y = root.yaw ?? [];
        for (let i = 1; i < y.length; i++) if (Math.abs(y[i][1] - y[i - 1][1]) >= 0.5) expect(y[i][0] - y[i - 1][0], `${c.id} spin`).toBeLessThanOrEqual(0.3 + 1e-9);
      }
      // spins end on a whole turn (the facing never drifts)
      const y = root.yaw ?? [];
      if (y.length) expect(Number.isInteger(y[y.length - 1][1]), `${c.id} whole turn`).toBe(true);
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0]).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      for (const m of Object.values(c.markers)) expect(m).toBeLessThanOrEqual(c.len + 1e-9);
      // big spins have a reduce-motion setting
      if (y.some(([, v]) => Math.abs(v) > 0.25)) expect(c.calm?.yaw, `${c.id} calm`).toBe(0);
      // a whole-turn spin is back on 0 before the blend-out (the stack scales root channels: 2 turns would unwind)
      if (y.length) {
        const out = c.len - (c.blendOut ?? 0.12);
        for (const [t, v] of y) if (t >= out - 1e-9) expect(v, `${c.id} yaw at ${t}`).toBe(0);
      }
    }
    ch.dispose();
  });

  it('basics A / B and the R haul plant their feet: a planted foot slides < 0.12 m (it was ≈ 0.3 m)', () => {
    const win: Record<string, [number, number]> = { 'lambo.basicA': [0, 99], 'lambo.basicB': [0, 99], 'lambo.r': [SIM_TIMING.lambo.slots.r.windup * TICK_S, 99] };
    for (const [id, [from, to]] of Object.entries(win)) {
      const s = footSlide(LAMBO_CLIPS.find((c) => c.id === id)!, from, to);
      expect(s.L, `${id} left`).toBeLessThan(0.12);
      expect(s.R, `${id} right`).toBeLessThan(0.12);
    }
  });

  it('the combo picks A, B, C, A at swing start and resets to A after 1.5 s without a hit', () => {
    resetLamboMoves();
    const clock = new BasicClock(SIM_TIMING.lambo.period);
    const ctx = { id: 0, comboIndex: 0, basicCount: 0 } as MoveCtx;
    const c = ctx as { comboIndex: number; basicCount: number };
    const ids: string[] = [];
    const attack = (from: number, to: number) => {
      for (let t = from; t <= to; t++) {
        if (clock.frame(t, true) === ClockOut.Start) {
          c.comboIndex = clock.combo;
          c.basicCount = clock.basicCount;
          ids.push(MOVES.basicPick!(ctx)!.id);
        }
        if (clock.swingOn && t === clock.contact) clock.confirm(t);
      }
    };
    const P = SIM_TIMING.lambo.period;
    attack(100, 100 + P * 5 - 1);
    expect(ids.slice(0, 5)).toEqual(['lambo.basicA', 'lambo.basicB', 'lambo.basicC', 'lambo.basicA', 'lambo.basicB']);
    clock.frame(100 + P * 5, false);
    const n = ids.length;
    const t1 = 100 + P * 5 + COMBO_RESET_TICKS + 10;
    attack(t1, t1 + P + 1);
    expect(ids[n]).toBe('lambo.basicA');
    expect(ids[n + 1]).toBe('lambo.basicB');
  });

  it('E: the full hop peaks ≥ 1.5 m, is flat on the ground by travelEnd and squashes deepest on the ring tick', () => {
    const ch = makeHero('lambo', 0, null, { detail: 0.62 });
    const clip = MOVES.slots.e.cast;
    const an = newAnchors();
    const t0 = 1;
    const travelEnd = t0 + FLOP_AIR;
    an[ANCHOR_INDEX.cast] = an[ANCHOR_INDEX.contact] = an[ANCHOR_INDEX.release] = t0;
    an[ANCHOR_INDEX.travelEnd] = travelEnd;
    const marks: [string, number][] = [];
    ch.anim.stack.heroId = 0;
    ch.anim.stack.onMarker = (_id, _c, m) => void marks.push([m, now]);
    let now = 0;
    for (; now < t0 - 0.2; now += FRAME) ch.anim.update(FRAME, { state: 'idle', speed: 0, height: ch.height, yawRate: 0, now });
    ch.anim.stack.play(clip, { anchors: an });
    let apex = 0;
    let upAtLand = NaN;
    for (; now < t0 + 0.9; now += FRAME) {
      ch.anim.update(FRAME, { state: 'idle', speed: 0, height: ch.height, yawRate: 0, now });
      const up = ch.mover.position.y + ch.inner.position.y * ch.mover.scale.y;
      apex = Math.max(apex, up);
      if (upAtLand !== upAtLand && now >= travelEnd - 1e-9) upAtLand = up;
    }
    expect(apex).toBeGreaterThanOrEqual(1.5);
    expect(upAtLand).toBeLessThan(0.03);
    const splat = marks.find(([m]) => m === 'splat');
    // the sim's ring tick: travelEnd + FLOP_RING_DELAY, ±1 display frame
    expect(Math.abs((splat?.[1] ?? 99) - (travelEnd + FLOP_RING_DELAY * TICK_S))).toBeLessThanOrEqual(FRAME + 1e-9);
    ch.dispose();
  });

  it('death holds the authored pose (on his back, paws up) with no blend back and no body jump', () => {
    const d = MOVES.death;
    expect(d.keys[d.keys.length - 1][3]).toBe('hold');
    // the blend-out (back to the legacy faint pose at the hitbox) starts only once heroView has hidden the body (2.6 s)
    expect(d.len - (d.blendOut ?? 0.12)).toBeGreaterThanOrEqual(2.6 - 1e-9);
    const ch = makeHero('lambo', 0, null, { detail: 0.62 });
    const an = newAnchors();
    let now = 0;
    for (; now < 0.5; now += FRAME) ch.anim.update(FRAME, { state: 'idle', speed: 0, height: ch.height, yawRate: 0, now });
    an[ANCHOR_INDEX.contact] = now;
    ch.anim.stack.play(d, { anchors: an });
    const v = new THREE.Vector3();
    const prev = new THREE.Vector3();
    let first = true;
    let maxStep = 0;
    const end = now + d.len - 0.06;
    let held = new THREE.Vector3();
    for (; now < end; now += FRAME) {
      ch.anim.update(FRAME, { state: 'dead', speed: 0, height: ch.height, yawRate: 0, now });
      ch.object.updateMatrixWorld(true);
      ch.rig.bone('chest')!.getWorldPosition(v);
      if (!first) maxStep = Math.max(maxStep, v.distanceTo(prev));
      prev.copy(v);
      first = false;
      if (now - an[ANCHOR_INDEX.contact] < 1.25) held = v.clone();
    }
    expect(maxStep).toBeLessThan(0.3);
    // from 1.2 s on, the chest stays where the fall left it (lying down: low), not back at the feet upright
    expect(v.distanceTo(held)).toBeLessThan(0.05);
    expect(v.y).toBeLessThan(0.6 * ch.height);
    ch.dispose();
  });

  it('E: a short flop gets a lower hop (apex 1.6·k m), the full 5 m one the 1.6 m arc; it may be cut after landing', () => {
    const apex = (c: ClipDef) => Math.max(...(c.root?.up ?? []).map(([, v]) => v));
    const full = pickBellyFlop({ aimDist: 5 } as MoveCtx);
    expect(full.id).toBe('lambo.e');
    expect(pickBellyFlop({ aimDist: NaN } as MoveCtx).id).toBe('lambo.e');
    expect(pickBellyFlop({ aimDist: 9 } as MoveCtx).id).toBe('lambo.e');
    expect(apex(full)).toBeCloseTo(1.6, 9);
    // 1 m: 1.5 travel ticks of 8 → k clamps to 0.25
    const short = pickBellyFlop({ aimDist: 1 } as MoveCtx);
    expect(apex(short)).toBeCloseTo(0.4, 9);
    const mid = pickBellyFlop({ aimDist: 2.5 } as MoveCtx);
    expect(apex(mid)).toBeGreaterThan(apex(short));
    expect(apex(mid)).toBeLessThan(1.6);
    for (const c of [full, short, mid]) {
      expect(c.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
      expect(c.cancel).toBe('afterContact');
      // the ring's shake / dust ring are skillfx's (confirmed landings only), not blind clip cues
      expect(c.cues?.some(([m, k]) => m === 'splat' && (k === 'shake' || k === 'dustRing' || k === 'punch'))).toBe(false);
    }
  });
});

/** Planted-foot travel (m) per foot over [from, to] s of the clip on the real rig (y < 8 cm counts as planted). */
function footSlide(clip: ClipDef, from: number, to: number): { L: number; R: number } {
  const ch = makeHero('lambo', 0, null, { detail: 0.62 });
  const an = newAnchors();
  const t0 = 1;
  an[ANCHOR_INDEX.contact] = an[ANCHOR_INDEX.cast] = t0 + (clip.markers.contact ?? 0);
  an[ANCHOR_INDEX.windupStart] = an[ANCHOR_INDEX.swingStart] = t0;
  for (let t = 0; t < t0; t += FRAME) ch.anim.update(FRAME, { state: 'idle', speed: 0, height: ch.height, yawRate: 0, now: t });
  ch.anim.stack.play(clip, { anchors: an });
  const v = new THREE.Vector3();
  const prev = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  const out = { L: 0, R: 0 };
  let first = true;
  const end = Math.min(clip.len - (clip.blendOut ?? 0.12), to);
  for (let t = t0; t <= t0 + end; t += FRAME) {
    ch.anim.update(FRAME, { state: 'idle', speed: 0, height: ch.height, yawRate: 0, now: t });
    ch.object.updateMatrixWorld(true);
    for (const f of ['L', 'R'] as const) {
      const p = ch.rig.bone(f === 'L' ? 'footL' : 'footR')!.getWorldPosition(v);
      if (!first && t - t0 >= from && p.y < 0.08 && prev[f].y < 0.08) out[f] += Math.hypot(p.x - prev[f].x, p.z - prev[f].z);
      prev[f].copy(p);
    }
    first = false;
  }
  ch.dispose();
  return out;
}

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

function fakeFx(rel: 'own' | 'enemy' = 'own', talents: string[] = [], allyAt: { x: number; z: number } | null = { x: 2, z: 0 }, reduced = false) {
  const spawned: Spawned[] = [];
  const lightning: number[] = [];
  const bolts: { at: number; color: number }[] = [];
  const cam = { tier: 0, punch: 0 };
  const status: Record<number, { buffs: number; shield: number }> = { 0: { buffs: 0, shield: 300 }, 1: { buffs: 0, shield: 200 } };
  const ribbons = { started: 0, ended: 0 };
  let now = 0;
  // 0 Lambo, 1 his ally, 3 an enemy hero 3 m away
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 3, z: 0 } };
  if (allyAt) pos[1] = allyAt;
  const fx = {
    tier: 'high',
    reduced,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o }, at: now }), spawned.length) },
    ribbons: { point: () => (ribbons.started++, 1), feed: () => {}, end: () => void ribbons.ended++ },
    linger: { add: () => {} },
    particles: { lightning: (_a: number, _b: number, _c: number, _d: number, _e: number, _f: number, color: number) => (lightning.push(now), void bolts.push({ at: now, color })), debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => void cam.tier++, punch: () => void cam.punch++ },
    status: (id: number, out: { buffs: number; shield: number }) => {
      const s = status[id];
      if (!s) return false;
      out.buffs = s.buffs;
      out.shield = s.shield;
      return true;
    },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? rel : id === 1 ? (rel === 'own' ? 'ally' : 'enemy') : rel === 'own' ? 'enemy' : 'own'),
    rim: (id: number) => (id === 3 || rel === 'enemy' ? 0xff3040 : 0xffd34d),
    abil: (id: number, slot: Slot | 'passive') => abilNumbers(id === 0 ? 'lambo' : 'clem', slot, id === 0 ? talents : null, false),
    heroPos: (id: number, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x;
      out.y = 0;
      out.z = p.z;
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
    for (let t = 0; t < s; t += FRAME) {
      now += FRAME;
      SKILL_FX.update!(FRAME, fx);
    }
  };
  return { fx, spawned, lightning, bolts, ribbons, cam, status, step, time: () => now };
}

const cast = (slot: number, x = 4000, y = 0) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target: -1 });
const hit = (dst: number) => ({ type: 'hit' as const, tick: 0, src: 0, dst, amount: 50, shielded: 0, kind: 'ability' as const });
const ctx = {} as MoveCtx;

describe('lambo skill FX', () => {
  beforeEach(() => {
    resetLamboFx();
    resetLamboMoves();
  });

  it('owns the four slots and the passive, not the basic', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: false, passive: true });
  });

  it('Q: the tuna ribbon flies at 16 m/s and ends at the 6 m range (7.5 m with Long Toss), or on the hit', () => {
    for (const [talents, range] of [[[], 6], [['long-toss'], 7.5]] as const) {
      resetLamboFx();
      const f = fakeFx('own', [...talents]);
      SKILL_FX.onCast!(cast(0), f.fx, ctx);
      expect(f.ribbons.started).toBe(1);
      f.step((range / 16) * 0.9);
      expect(f.ribbons.ended).toBe(0);
      f.step((range / 16) * 0.2 + FRAME);
      expect(f.ribbons.ended).toBe(1);
    }
    resetLamboFx();
    const f = fakeFx();
    SKILL_FX.onCast!(cast(0), f.fx, ctx);
    f.step(0.1);
    SKILL_FX.onHit!(hit(3), f.fx, ctx);
    expect(f.ribbons.ended).toBe(1);
    expect(f.spawned.some((s) => s.kind === 'ring' && s.o.x === 3)).toBe(true);
  });

  it('W: heart + shells on Lambo and the nearest ally, shield pulses only for the 75 t duration', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    expect(f.spawned.some((s) => s.kind === 'heart')).toBe(true);
    // the ally's shell is there on the cast tick (the sim shields both on it), not after the 0.4 s ribbon
    expect(f.spawned.filter((s) => s.kind === 'dome').map((d) => d.o.x)).toEqual([0, 2]);
    f.step(4);
    const domes = f.spawned.filter((s) => s.kind === 'dome');
    expect(domes.some((d) => d.o.x === 0)).toBe(true);
    expect(domes.some((d) => d.o.x === 2)).toBe(true);
    const pulses = f.spawned.filter((s) => s.kind === 'ring');
    expect(pulses.length).toBeGreaterThan(4);
    for (const p of pulses) expect(p.at).toBeLessThanOrEqual(75 * TICK_S + FRAME);
    // no ally in range: no arc, no shell on anyone else
    resetLamboFx();
    const g = fakeFx('own', [], { x: 9, z: 0 });
    SKILL_FX.onCast!(cast(1), g.fx, ctx);
    g.step(1);
    expect(g.spawned.filter((s) => s.kind === 'dome').every((d) => d.o.x === 0)).toBe(true);
  });

  it('E: the ring draws on the first slot-2 hit (the sim landing), at exactly 2.2 m, spikes inside, once', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(2), f.fx, ctx);
    f.step(0.2);
    // the clip's splat marker draws nothing (render clip time is not the sim landing)
    let before = f.spawned.length;
    SKILL_FX.onMarker!(0, 'lambo.e', 'splat', f.fx);
    expect(f.spawned.length).toBe(before);
    before = f.spawned.length;
    SKILL_FX.onHit!(hit(3), f.fx, ctx);
    const out = f.spawned.slice(before);
    expect(f.ribbons.ended).toBe(1);
    const R = abilNumbers('lambo', 'e').radius / 1000;
    const rings = out.filter((s) => s.kind === 'ring' || s.kind === 'arc');
    expect(rings.length).toBe(3);
    for (const r of rings) expect(r.o.sx).toBeCloseTo(R, 9);
    for (const p of out.filter((s) => s.kind === 'pillar')) expect(Math.hypot(p.o.x, p.o.z) + p.o.sx).toBeLessThanOrEqual(R + 1e-6);
    // a second victim of the same landing and the ring-tick timer add no second ring
    const n = f.spawned.length;
    SKILL_FX.onHit!(hit(3), f.fx, ctx);
    f.step(0.4);
    expect(f.spawned.slice(n).filter((s) => s.kind === 'ring' && Math.abs(s.o.sx - R) < 1e-9).length).toBe(0);
  });

  it('E: with nobody in the ring the ring still lands on the predicted ring tick (+1 t of grace), not before', () => {
    const f = fakeFx();
    const R = abilNumbers('lambo', 'e').radius / 1000;
    // aimed 2.5 m: 4 travel ticks, ring on tick 5
    SKILL_FX.onCast!(cast(2, 2500, 0), f.fx, ctx);
    const rings = () => f.spawned.filter((s) => s.kind === 'ring' && Math.abs(s.o.sx - R) < 1e-9);
    f.step(5 * TICK_S);
    expect(rings().length).toBe(0);
    f.step(1.5 * TICK_S);
    expect(rings().length).toBe(2);
    expect(rings()[0].at).toBeLessThanOrEqual(6 * TICK_S + 2 * FRAME);
  });

  it('R: the windup spiral reaches the radius on the cast tick (Wide Tangle 5.5 m), strands for the 6 t pull, enemy rim red', () => {
    const f = fakeFx('enemy', ['wide-tangle']);
    SKILL_FX.onWindup!({ type: 'windup', tick: 0, src: 0, slot: 3, x: 0, y: 0, ticks: 15 } as never, f.fx);
    const spiral = f.spawned.filter((s) => s.kind === 'ring');
    expect(spiral.length).toBe(2);
    for (const s of spiral) {
      expect(s.o.sx).toBeCloseTo(5.5, 9);
      expect((s.o.delay ?? 0) + s.o.life).toBeCloseTo(15 * TICK_S, 9);
      expect(s.o.rim).toBe(0xff3040);
      expect(s.o.rel).toBe('enemy');
    }
    f.step(15 * TICK_S);
    const before = f.spawned.length;
    SKILL_FX.onCast!(cast(3), f.fx, ctx);
    const edge = f.spawned.slice(before).filter((s) => s.kind === 'arc' || s.kind === 'ring');
    for (const e of edge) expect(e.o.sx).toBeCloseTo(5.5, 9);
    SKILL_FX.onHit!(hit(3), f.fx, ctx);
    const t0 = f.time();
    f.step(0.6);
    expect(f.lightning.length).toBeGreaterThan(3);
    for (const t of f.lightning) expect(t - t0).toBeLessThanOrEqual(KNOCK_TICKS * TICK_S + 0.05 + FRAME);
    expect(f.spawned.some((s) => s.kind === 'twister' && s.o.x === 3)).toBe(true);
  });

  it('W: the pulses stop when the shield breaks (snapshot shield 0), per hero', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    f.step(1);
    f.status[0].shield = 0;
    const t = f.time();
    f.step(3);
    const late = f.spawned.filter((s) => s.kind === 'ring' && s.at > t + 0.01);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((s) => s.o.x === 2)).toBe(true);
    f.status[1].shield = 0;
    const t2 = f.time();
    f.step(1);
    expect(f.spawned.some((s) => s.kind === 'ring' && s.at > t2 + 0.01)).toBe(false);
  });

  it('Q: a tuna hit plays the splash even when Lambo cast W during the flight', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(0, 3000, 0), f.fx, ctx);
    f.step(0.1);
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    f.step(3 / 16 - 0.1);
    const before = f.spawned.length;
    SKILL_FX.onHit!(hit(3), f.fx, ctx);
    const out = f.spawned.slice(before);
    expect(out.some((s) => s.kind === 'ring' && s.o.x === 3 && s.o.color === 0xd8f6ff)).toBe(true);
    expect(f.ribbons.ended).toBeGreaterThanOrEqual(1);
  });

  it('E: a hop that ends stunned lands nothing: a skid, no ring, no shake; a landed one rings and shakes', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(2), f.fx, ctx);
    f.step(0.1);
    f.status[0].buffs = BuffFlag.Stunned;
    let before = f.spawned.length;
    f.step(0.3);
    expect(f.spawned.slice(before).some((s) => s.kind === 'ring' || s.kind === 'arc' || s.kind === 'pillar')).toBe(false);
    expect(f.cam.tier).toBe(0);
    // landed (a slot-2 hit confirms it even if a stun lands on the same tick)
    SKILL_FX.onCast!(cast(2), f.fx, ctx);
    f.step(0.2);
    before = f.spawned.length;
    SKILL_FX.onHit!(hit(3), f.fx, ctx);
    expect(f.spawned.slice(before).filter((s) => s.kind === 'ring' || s.kind === 'arc').length).toBe(3);
    expect(f.cam.tier).toBe(1);
  });

  it('reduce motion: no splat shake, half the spikes, the pull bolts one colour at ≥ 0.15 s', () => {
    const f = fakeFx('own', [], { x: 2, z: 0 }, true);
    SKILL_FX.onCast!(cast(2), f.fx, ctx);
    f.step(0.2);
    const before = f.spawned.length;
    SKILL_FX.onHit!(hit(3), f.fx, ctx);
    expect(f.cam.tier + f.cam.punch).toBe(0);
    expect(f.spawned.slice(before).filter((s) => s.kind === 'pillar').length).toBeLessThanOrEqual(5);
    SKILL_FX.onCast!(cast(3), f.fx, ctx);
    SKILL_FX.onHit!(hit(3), f.fx, ctx);
    f.step(0.6);
    const pulls = f.bolts.slice(1);
    expect(new Set(pulls.map((b) => b.color)).size).toBeLessThanOrEqual(1);
    for (let i = 1; i < pulls.length; i++) expect(pulls[i].at - pulls[i - 1].at).toBeGreaterThanOrEqual(0.15 - 1e-6);
  });

  it('passive: constellation lines to an ally within 4 m for own view only', () => {
    const f = fakeFx('own', [], { x: 2, z: 0 });
    f.step(1.2);
    expect(f.spawned.some((s) => s.kind === 'beam')).toBe(true);
    resetLamboFx();
    const g = fakeFx('enemy', [], { x: 2, z: 0 });
    g.step(1.2);
    expect(g.spawned.some((s) => s.kind === 'beam')).toBe(false);
  });
});
