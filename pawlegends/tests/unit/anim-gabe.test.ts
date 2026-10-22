/**
 * Gabė move set and skill FX (ANIM-SPEC §14): the clips bind to the sim timings (basic release, Heart Balloon arm,
 * Chase the Wind travel, Under Her Spell windup), stay inside the root caps, compile on her rig, and the skill FX draw
 * at the sim's own radii, range and arc and stop on the sim's last tick.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, DASH_SPEED, SIM_TIMING, TICK_S, abilNumbers, travelTicks } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { TimeWarp } from '../../src/render/anim/warp';
import { ANCHOR_INDEX, newAnchors, type FxCtx, type HeroStatus, type MeshFxKind, type MeshFxSpawn, type MoveCtx } from '../../src/render/anim/types';
import { MESH_CAPS } from '../../src/render/anim/fxkit/meshFx';
import { UPPER } from '../../src/render/anim/masks';
import { BONE_INDEX, type BoneName } from '../../src/render/chars/skeleton';
import { BuffFlag } from '../../src/sim/api';
import { PROJECTILE_KIND } from '../../src/data/towers';
import { GABE_CLIPS, MOVES } from '../../src/render/moves/gabe';
import { SKILL_FX, gabeFxLive, resetGabeFx } from '../../src/render/skillfx/gabe';

const FRAME = 1 / 60;
const T = SIM_TIMING.gabe;
const m = (c: { markers: Readonly<Record<string, number>> }, k: string): number => c.markers[k] ?? NaN;

describe('gabe moves', () => {
  it('is filled and binds every move to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.basic.length).toBe(3);
    for (const c of MOVES.basic) {
      expect(Math.abs(m(c, 'contact') - BASIC_WINDUP * TICK_S)).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toContainEqual(['contact', 'release']);
      expect(c.len).toBeLessThan(T.period * TICK_S);
    }
    // Q: the throw on the cast (the pop 15 t later is the FX's beat: no held clap that would freeze her legs)
    const q = MOVES.slots.q.cast;
    expect(q.warp).toEqual([['contact', 'cast']]);
    expect(T.slots.q.arm).toBe(15);
    // W: instant, the contact on the cast
    expect(MOVES.slots.w.cast.warp).toEqual([['contact', 'cast']]);
    // E: take-off on the cast, landing 4 m at 20 m/s = 6 t later (Aim.Dir: always the full dash; the landing binds to
    // travelEnd, which the director predicts from the full length)
    const e = MOVES.slots.e.cast;
    expect(e.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
    expect(T.slots.e.aimClamped).toBe(false);
    expect(T.slots.e.dashTicks).toBe(travelTicks(4000, DASH_SPEED));
    expect(T.slots.e.dashTicks).toBe(6);
    expect(m(e, 'land') - m(e, 'takeoff')).toBeCloseTo(6 * TICK_S, 9);
    // R: the twirl starts on windupStart, the kiss lands on the cast 15 t later
    const r = MOVES.slots.r.cast;
    expect(r.warp).toEqual([['coil', 'windupStart'], ['contact', 'cast']]);
    expect(T.slots.r.windup).toBe(15);
    expect(m(r, 'contact') - m(r, 'coil')).toBeCloseTo(15 * TICK_S, 9);
  });

  it('every clip compiles on her rig with finite values, keeps the root caps and the spin rule', () => {
    const ch = makeHero('gabe', 0, null, { detail: 0.62 });
    for (const c of GABE_CLIPS) {
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
      // every whole-turn rotation wraps back to 0 (a blend-out never unwinds a spin)
      for (const k of ['yaw', 'roll', 'pitch'] as const) {
        const ks = r[k];
        if (ks) expect(ks[ks.length - 1][1], `${c.id} ${k} ends at 0`).toBe(0);
      }
      // §9 rule 6: a full spin lasts ≤ 0.3 s, except the R twirl locked to the sim windup
      const yaw = r.yaw ?? [];
      if (c.id !== 'gabe.r')
        for (let i = 1; i < yaw.length; i++) if (Math.abs(yaw[i][1] - yaw[i - 1][1]) >= 0.5 && yaw[i][2] !== 'step') expect(yaw[i][0] - yaw[i - 1][0], `${c.id} spin`).toBeLessThanOrEqual(0.3 + 1e-9);
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0]).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      // an attack / ability clip always carries a contact marker
      if (c.prio >= 4 && c.prio <= 7) expect(Number.isFinite(m(c, 'contact')), c.id).toBe(true);
    }
    ch.dispose();
  });

  it('post-contact full-mask tails are short (the gait owns the legs again before her feet would slide)', () => {
    const { q, w, e, r } = { q: MOVES.slots.q.cast, w: MOVES.slots.w.cast, e: MOVES.slots.e.cast, r: MOVES.slots.r.cast };
    // the landing beat comes within 0.35 s of the contact, and the clip is gone 0.15 s after it
    for (const c of [q, w]) {
      expect(m(c, 'land') - m(c, 'contact'), c.id).toBeLessThanOrEqual(0.35);
      expect(c.len - m(c, 'land'), c.id).toBeLessThanOrEqual(0.15);
    }
    expect(e.len - m(e, 'land')).toBeLessThanOrEqual(0.25);
    expect(r.len - m(r, 'contact')).toBeLessThanOrEqual(0.3);
    // W: the bloom opens as the feather swirl reaches the ally (0.18 s after the cast), the shield's visible moment
    expect(m(w, 'bloom') - m(w, 'contact')).toBeCloseTo(0.18, 6);
  });

  it('the basic combo cycles A → B → C by the clock combo index without allocating', () => {
    const ctx = { hero: 'gabe', id: 0, branch: false, talents: [], comboIndex: 0, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false } as unknown as MoveCtx;
    const ids: string[] = [];
    for (let n = 0; n < 4; n++) {
      (ctx as { comboIndex: number }).comboIndex = n;
      ids.push(MOVES.basicPick!(ctx)!.id);
    }
    expect(ids).toEqual(['gabe.basicA', 'gabe.basicB', 'gabe.basicC', 'gabe.basicA']);
  });

  it('E lands on cast + 6 t whatever the aim distance (a 1 m click still flies the full 4 m)', () => {
    const e = MOVES.slots.e.cast;
    for (const aimMm of [1000, 1500, 4000]) {
      const castS = 10;
      const anchors = newAnchors();
      anchors[ANCHOR_INDEX.cast] = castS;
      anchors[ANCHOR_INDEX.release] = castS;
      anchors[ANCHOR_INDEX.contact] = castS;
      // the director's travelEnd prediction: the full 4 m whatever the aim (aimMm is ignored)
      void aimMm;
      anchors[ANCHOR_INDEX.travelEnd] = castS + T.slots.e.dashTicks * TICK_S;
      const w = new TimeWarp();
      w.build(e, anchors, castS - 0.2);
      const landAt = castS + (m(e, 'land') - m(e, 'takeoff'));
      expect(landAt - castS).toBeCloseTo(6 * TICK_S, 9);
      expect(w.time(landAt)).toBeCloseTo(m(e, 'land'), 6);
      // a 1 m aim: two ticks in, she is still mid-flight (not in the landing pose)
      expect(w.time(castS + 2 * TICK_S)).toBeLessThan(m(e, 'land') - 0.05);
    }
  });

  it('upper-mask basics keep the root still and key nothing the mask drops; the R lunge is airborne', () => {
    for (const c of [MOVES.basic[0], MOVES.basic[1]]) {
      expect(c.mask).toBe('upper');
      for (const [, , d] of c.keys) for (const b of Object.keys(d ?? {})) expect(UPPER[BONE_INDEX[b as BoneName]], `${c.id} ${b}`).toBeGreaterThan(0);
      for (const [, v] of c.root?.up ?? []) expect(v).toBeLessThanOrEqual(0.06);
      for (const k of ['fwd', 'side'] as const) for (const [, v] of c.root?.[k] ?? []) expect(Math.abs(v)).toBeLessThanOrEqual(0.04);
    }
    // R: the root only moves forward / back while she is off the ground (sampled every 10 ms)
    const r = MOVES.slots.r.cast;
    const R_WIND = T.slots.r.windup * TICK_S;
    const lin = (ks: readonly (readonly [number, number, ...unknown[]])[], t: number): number => {
      for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) return ks[i - 1][1] + ((ks[i][1] - ks[i - 1][1]) * (t - ks[i - 1][0])) / (ks[i][0] - ks[i - 1][0] || 1);
      return ks[ks.length - 1][1];
    };
    const fwd = r.root!.fwd ?? [[0, 0]];
    const up = r.root!.up!;
    for (const [, v] of fwd) expect(Math.abs(v)).toBeLessThanOrEqual(0.05);
    for (let t = R_WIND; t < r.len - 0.01; t += 0.01) {
      const moving = Math.abs(lin(fwd, t + 0.01) - lin(fwd, t)) > 0.002;
      if (moving) expect(lin(up, t) + lin(up, t + 0.01), `R slides at ${t.toFixed(2)}`).toBeGreaterThan(0.01);
    }
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

/** Gabė is 0 at the origin; ally 1 at (2, 0); enemy 3 at (4, 0). */
function fakeFx(rel: 'own' | 'enemy' = 'own', talents: string[] = [], tier: 'low' | 'med' | 'high' = 'high', caps = false, bones = false) {
  const spawned: Spawned[] = [];
  const ribbons: { width: number; color: number }[] = [];
  let now = 0;
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 1: { x: 2, z: 0 }, 3: { x: 4, z: 0 } };
  const status: Record<number, HeroStatus> = {};
  const live = (kind: MeshFxKind) => spawned.filter((s) => s.kind === kind && s.at + (s.o.delay ?? 0) * 0 + s.o.life > now + 1e-9).length;
  const relOf = (id: number) => (id === 0 ? rel : id === 1 ? (rel === 'own' ? 'ally' : 'enemy') : rel === 'own' ? 'enemy' : 'ally');
  const fx = {
    tier,
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (caps && live(kind) >= MESH_CAPS[tier][kind] ? -1 : (spawned.push({ kind, o: { ...o }, at: now }), spawned.length)) },
    ribbons: { point: (_s: unknown, color: number, width: number) => (tier === 'low' ? -1 : (ribbons.push({ width, color }), ribbons.length)), feed: () => {}, end: () => {} },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: relOf,
    rim: (id: number) => (relOf(id) === 'enemy' ? 0xff3040 : 0xffd34d),
    abil: (_id: number, slot: 'q' | 'w' | 'e' | 'r') => abilNumbers('gabe', slot, talents),
    heroPos: (id: number, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x;
      out.y = 0;
      out.z = p.z;
      return true;
    },
    // bones: Gabė (0) faces +x (head → mouth), her right paw ahead of her chest; nobody else has bones
    bonePos: (id: number, bone: string, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!bones || id !== 0 || !p) return false;
      const off = bone === 'head' ? [0, 1.8] : bone === 'mouth' ? [0.1, 1.7] : bone === 'pawR' ? [0.2, 1.3] : null;
      if (!off) return false;
      out.x = p.x + off[0];
      out.y = off[1];
      out.z = p.z;
      return true;
    },
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
  return { fx, spawned, ribbons, step, pos, status, time: () => now };
}

const cast = (slot: number, x = 4000, y = 0, target = -1) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target });
const ctx = {} as MoveCtx;

describe('gabe skill FX', () => {
  beforeEach(() => resetGabeFx());

  it('owns every slot', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: true, passive: true });
  });

  it('Q: the balloon pops on the arm tick with rings at exactly the burst radius (Big Balloon 2.8 m)', () => {
    for (const [talents, R] of [[[], 2.2], [['big-balloon'], 2.8]] as const) {
      resetGabeFx();
      const f = fakeFx('own', [...talents]);
      SKILL_FX.onCast!(cast(0, 4000, 0), f.fx, ctx);
      f.step(0.7);
      const rings = f.spawned.filter((s) => s.kind === 'ring' && Math.abs(s.o.sx - R) < 1e-5);
      expect(rings.length).toBe(2);
      for (const r of rings) {
        expect(Math.abs(r.at - 15 * TICK_S)).toBeLessThanOrEqual(FRAME + 1e-9);
        expect(r.o.x).toBeCloseTo(4, 6);
        expect(r.o.z).toBeCloseTo(0, 6);
      }
      // the in-flight balloon has a body (pink domes along the parabola, not one per frame) that rises well above her
      const flight = f.spawned.filter((s) => s.kind === 'dome' && s.at < 15 * TICK_S - 1e-6);
      expect(flight.length).toBeGreaterThan(5);
      expect(flight.length).toBeLessThan(20);
      expect(Math.max(...flight.map((s) => s.o.y ?? 0))).toBeGreaterThan(2.5);
      // and a ground shadow that slides from her to the landing spot, smallest under the apex
      const shadow = f.spawned.filter((s) => s.kind === 'glow' && s.at < 15 * TICK_S - 1e-6 && (s.o.y ?? 1) < 0.07);
      expect(shadow.length).toBeGreaterThan(5);
      expect(Math.min(...shadow.map((s) => s.o.x))).toBeLessThan(0.5);
      expect(Math.max(...shadow.map((s) => s.o.x))).toBeGreaterThan(3.3);
      const mid = shadow.reduce((a, b) => (Math.abs(b.o.x - 2) < Math.abs(a.o.x - 2) ? b : a));
      expect(mid.o.sx).toBeLessThan(shadow[0].o.sx);
      // the pop's mesh dressing never passes the sim radius
      for (const s of f.spawned) if (s.at >= 15 * TICK_S - FRAME && (s.kind === 'ring' || s.kind === 'heart' || s.kind === 'glow')) expect(s.o.sx).toBeLessThanOrEqual(R + 1e-5);
      expect(gabeFxLive()).toBe(0);
    }
  });

  it('W: wraps the ally nearest the aim (else herself) and ends with the shield', () => {
    const f = fakeFx('own');
    SKILL_FX.onCast!(cast(1, 2200, 0), f.fx, ctx);
    f.step(0.3);
    const dome = f.spawned.find((s) => s.kind === 'dome');
    expect(dome?.o.x).toBeCloseTo(2, 6);
    const dur = abilNumbers('gabe', 'w').duration * TICK_S;
    f.step(dur);
    expect(gabeFxLive()).toBe(0);
    for (const s of f.spawned) expect(s.at + s.o.life).toBeLessThanOrEqual(dur + 0.75);
    // haste lines only during the haste (45 t)
    const haste = f.spawned.filter((s) => s.kind === 'ring' && Math.abs(s.o.x - 2) < 1e-6 && s.o.sx === 1.0);
    expect(haste.length).toBeGreaterThan(2);
    for (const h of haste) expect(h.at + h.o.life).toBeLessThanOrEqual(abilNumbers('gabe', 'w').haste * TICK_S + 1e-6);
    // no ally near the aim: herself
    resetGabeFx();
    const g = fakeFx('own');
    SKILL_FX.onCast!(cast(1, -3000, 0), g.fx, ctx);
    g.step(0.3);
    expect(g.spawned.find((s) => s.kind === 'dome')?.o.x).toBeCloseTo(0, 6);
  });

  it('E: the wind band is exactly the touch zone wide and ends by the dash end', () => {
    const f = fakeFx('own');
    SKILL_FX.onCast!(cast(2, 4000, 0), f.fx, ctx);
    expect(f.ribbons[0].width).toBeCloseTo((2 * abilNumbers('gabe', 'e').touch) / 1000, 9);
    f.step(0.4);
    expect(gabeFxLive()).toBe(0);
  });

  it('R: the cone at the exact range and arc, leashes only for the charm, enemy rim red (Long Glance, Smitten)', () => {
    for (const [talents, range, charm] of [[[], 6, 30], [['long-glance', 'smitten'], 7.5, 38]] as const) {
      resetGabeFx();
      const f = fakeFx('enemy', [...talents]);
      SKILL_FX.onWindup!({ type: 'windup', tick: 0, src: 0, slot: 3, x: 4000, y: 0, ticks: 15 }, f.fx);
      const preCast = f.spawned.length;
      SKILL_FX.onCast!(cast(3, 4000, 0), f.fx, ctx);
      const arc = f.spawned.find((s) => s.kind === 'arc')!;
      expect(arc.o.sx).toBeCloseTo(range, 9);
      expect(arc.o.p0).toBeCloseTo(Math.PI / 2, 9);
      expect(arc.o.yaw).toBeCloseTo(0, 9);
      for (const s of f.spawned) {
        expect(s.o.rim).toBe(0xff3040);
        expect(s.o.rel).toBe('enemy');
      }
      // hearts of the wavefront stay inside the cone's range, their whole size included
      for (const h of f.spawned.filter((s) => s.kind === 'heart')) expect(Math.hypot(h.o.x, h.o.z) + h.o.sx).toBeLessThanOrEqual(range + 1e-6);
      // no full-circle burst round her: round shapes at her feet are ≤ 0.8 m (the cone is the only big shape)
      for (const s of f.spawned.slice(preCast)) if ((s.kind === 'ring' || s.kind === 'glow' || s.kind === 'dome') && Math.hypot(s.o.x, s.o.z) < 0.1 && (s.o.y ?? 0) < 0.5) expect(s.o.sx, s.kind).toBeLessThanOrEqual(0.8);
      f.step(2);
      // her enemy 3 (the viewer's ally here) is charmed; nothing outlives the charm
      const beams = f.spawned.filter((s) => s.kind === 'beam');
      expect(beams.length).toBeGreaterThan(5);
      for (const b of beams) expect(b.at + b.o.life).toBeLessThanOrEqual(charm * TICK_S + 1e-6);
      expect(gabeFxLive()).toBe(0);
    }
  });

  it('passive: a basic hit on a hero sends a heart back to her, also on Low (no ribbons); pools stay bounded', () => {
    const f = fakeFx('own', [], 'low');
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 10, shielded: 0, kind: 'basic' }, f.fx, ctx);
    f.step(0.6);
    expect(f.spawned.filter((s) => s.kind === 'glow').length).toBeGreaterThan(2);
    expect(gabeFxLive()).toBe(0);
    for (let i = 0; i < 40; i++) {
      SKILL_FX.onCast!(cast(i % 4), f.fx, ctx);
      SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 10, shielded: 0, kind: 'basic' }, f.fx, ctx);
    }
    expect(gabeFxLive()).toBeLessThanOrEqual(4 + 4 + 3 + 2 + 6);
    f.step(4);
    expect(gabeFxLive()).toBe(0);
  });

  it('R: every charmed head carries a marker that follows it, on every tier with the real caps', () => {
    for (const tier of ['low', 'med', 'high'] as const) {
      resetGabeFx();
      const f = fakeFx('own', [], tier, true);
      f.pos[4] = { x: 3, z: 0.6 };
      SKILL_FX.onCast!(cast(3, 4000, 0), f.fx, ctx);
      const charm = 30 * TICK_S;
      let both = 0;
      let samples = 0;
      for (let t = 0; t < charm - 0.05; t += 0.05) {
        // the charmed walk toward her: the marker goes with them
        f.pos[3].x -= 0.12;
        f.step(0.05);
        for (const id of [3, 4]) {
          const p = f.pos[id];
          const head = f.spawned.filter((s) => (s.kind === 'pillar' || s.kind === 'glow') && (s.o.y ?? 0) > 2 && s.at + s.o.life > f.time() && Math.abs(s.o.x - p.x) < 0.3 && Math.abs(s.o.z - p.z) < 1e-6);
          expect(head.length, `${tier} ${id} at ${t.toFixed(2)}`).toBeGreaterThan(0);
        }
        const liveBeams = f.spawned.filter((s) => s.kind === 'beam' && s.at + s.o.life > f.time());
        expect(liveBeams.length).toBeLessThanOrEqual(MESH_CAPS[tier].beam);
        samples++;
        if (liveBeams.length >= 2) both++;
      }
      // leash beams: one live beam per leash, so both leashes hold even on Low's 2-beam cap
      expect(both / samples, tier).toBeGreaterThan(0.9);
      f.step(0.3);
      expect(gabeFxLive()).toBe(0);
    }
  });

  it('R: the charm marker is a vertical shape over the head, and re-spawned shapes overlap (no strobing)', () => {
    const f = fakeFx('own');
    f.status[3] = { buffs: BuffFlag.Feared, shield: 0 };
    SKILL_FX.onCast!(cast(3, 4000, 0), f.fx, ctx);
    // the marker exists on the cast tick, before any status check
    expect(f.spawned.some((s) => s.kind === 'pillar' && (s.o.y ?? 0) > 2 && Math.abs(s.o.x - 4) < 1e-6)).toBe(true);
    f.step(0.6);
    const heads = f.spawned.filter((s) => s.kind === 'pillar' && (s.o.y ?? 0) > 2);
    const beams = f.spawned.filter((s) => s.kind === 'beam');
    // each spawn lives at least twice the gap to the next one (the previous is still at full alpha, fade from 55%)
    for (const l of [heads, beams]) {
      expect(l.length).toBeGreaterThan(3);
      for (let i = 1; i < l.length - 1; i++) expect(l[i - 1].o.life * 0.55, 'overlap').toBeGreaterThanOrEqual(l[i].at - l[i - 1].at - 1e-6);
    }
  });

  it('R: Purrified enemies, enemies outside the sim cone and unconfirmed charms get no leash or heart', () => {
    const f = fakeFx('own');
    f.status[3] = { buffs: BuffFlag.Purrified, shield: 0 };
    // just outside the 90° cone (45° half arc + a little): the old 0.4 / d slack charmed it
    f.pos[4] = { x: 2.5, z: -2.5 * Math.tan(Math.PI / 4 + 0.08) };
    SKILL_FX.onCast!(cast(3, 4000, 0), f.fx, ctx);
    f.step(1.2);
    expect(f.spawned.filter((s) => s.kind === 'beam').length).toBe(0);
    expect(f.spawned.filter((s) => (s.o.y ?? 0) > 2).length).toBe(0);
    // charmed in render but the snapshot never shows Feared: dropped within the confirm window
    resetGabeFx();
    const g = fakeFx('own');
    g.status[3] = { buffs: 0, shield: 0 };
    SKILL_FX.onCast!(cast(3, 4000, 0), g.fx, ctx);
    g.step(1.2);
    for (const s of g.spawned.filter((s) => s.kind === 'beam' || (s.o.y ?? 0) > 2)) expect(s.at).toBeLessThanOrEqual(0.15 + 1e-6);
    // confirmed: the leash holds for the charm
    resetGabeFx();
    const h = fakeFx('own');
    h.status[3] = { buffs: BuffFlag.Feared | BuffFlag.Slowed, shield: 0 };
    SKILL_FX.onCast!(cast(3, 4000, 0), h.fx, ctx);
    h.step(1.2);
    expect(Math.max(...h.spawned.filter((s) => s.kind === 'beam').map((s) => s.at))).toBeGreaterThan(0.8);
  });

  it('colour: own thin shapes lean to their own colour; enemy shapes keep the danger rim and enemy ribbons are tinted', () => {
    const f = fakeFx('own');
    SKILL_FX.onCast!(cast(3, 4000, 0), f.fx, ctx);
    const arc = f.spawned.find((s) => s.kind === 'arc')!;
    expect(arc.o.rim).not.toBe(0xffd34d);
    // red channel up (pink), blue channel well above gold's 0x4d
    expect(arc.o.rim & 255).toBeGreaterThan(0x4d + 40);
    const glow = f.spawned.find((s) => s.kind === 'glow')!;
    expect(glow.o.rim).toBe(0xffd34d);
    resetGabeFx();
    const own = fakeFx('own');
    SKILL_FX.onCast!(cast(2, 4000, 0), own.fx, ctx);
    resetGabeFx();
    const foe = fakeFx('enemy');
    SKILL_FX.onCast!(cast(2, 4000, 0), foe.fx, ctx);
    expect(own.ribbons[0].color).toBe(0x9ff2dc);
    expect(foe.ribbons[0].color).not.toBe(own.ribbons[0].color);
  });

  it('E on Med / High: touch-zone cards and rim rings at exactly the touch radius along the real path', () => {
    for (const tier of ['med', 'high'] as const) {
      resetGabeFx();
      const f = fakeFx('own', [], tier, true);
      SKILL_FX.onCast!(cast(2, 4000, 0), f.fx, ctx);
      for (let k = 0; k < 12; k++) {
        f.pos[0].x = Math.min(4, f.pos[0].x + 4 / 12);
        f.step(1 / 60);
      }
      f.step(0.3);
      const touch = abilNumbers('gabe', 'e').touch / 1000;
      const cards = f.spawned.filter((s) => s.kind === 'glow' && Math.abs(s.o.sx - touch) < 1e-6);
      const rims = f.spawned.filter((s) => s.kind === 'ring' && Math.abs(s.o.sx - touch) < 1e-6);
      expect(cards.length, tier).toBeGreaterThanOrEqual(3);
      expect(rims.length, tier).toBe(cards.length);
      // the first card at the take-off end, where allies are most often touched
      expect(Math.min(...cards.map((c) => c.o.x))).toBeLessThan(0.1);
      expect(Math.max(...cards.map((c) => c.o.x))).toBeGreaterThan(2.5);
      expect(gabeFxLive()).toBe(0);
    }
  });

  it('E on Low: the touch zone shows as cards along the path (no ribbon)', () => {
    const f = fakeFx('own', [], 'low', true);
    SKILL_FX.onCast!(cast(2, 4000, 0), f.fx, ctx);
    for (let k = 0; k < 12; k++) {
      f.pos[0].x = Math.min(4, f.pos[0].x + 4 / 12);
      f.step(1 / 60);
    }
    f.step(0.3);
    const cards = f.spawned.filter((s) => s.kind === 'glow' && Math.abs(s.o.sx - abilNumbers('gabe', 'e').touch / 1000) < 1e-6);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...cards.map((c) => c.o.x))).toBeGreaterThan(2.5);
  });

  it('W: the shield glow follows the wrapped ally and the swirl ends when the shield breaks', () => {
    const f = fakeFx('own');
    f.status[1] = { buffs: BuffFlag.Shielded | BuffFlag.Hasted, shield: 70 };
    SKILL_FX.onCast!(cast(1, 2200, 0), f.fx, ctx);
    f.step(0.3);
    f.pos[1].x = 4;
    f.step(0.3);
    const glows = f.spawned.filter((s) => s.kind === 'glow' && Math.abs((s.o.y ?? 0) - 0.9) < 1e-6 && s.at > 0.35);
    expect(glows.some((g) => Math.abs(g.o.x - 4) < 1e-6)).toBe(true);
    // each glow outlives the next drop (no strobe) yet never the shield
    for (const g of glows) expect(g.o.life).toBeLessThanOrEqual(0.25 + 1e-6);
    expect(glows[0].o.life).toBeGreaterThanOrEqual(0.2);
    expect(f.spawned.find((s) => s.kind === 'dome')!.o.life).toBeLessThanOrEqual(0.35);
    // the shield breaks: nothing more is drawn for it
    f.status[1] = { buffs: BuffFlag.Hasted, shield: 0 };
    f.step(1 / 30);
    expect(gabeFxLive()).toBe(0);
  });

  it('basic: the heart bolt flies along her facing and bends onto the hero only when the sim hit names it', () => {
    const f = fakeFx('own', [], 'high', false, true);
    SKILL_FX.onProjectile!(0, PROJECTILE_KIND.hero, -1, f.fx);
    expect(f.ribbons.length).toBe(1);
    f.step(0.2);
    // a vertical head (pillar stubs) along +x, at the bolt speed
    const heads = f.spawned.filter((s) => s.kind === 'pillar');
    expect(heads.length).toBeGreaterThan(2);
    for (const h of heads) expect(Math.abs(h.o.z)).toBeLessThan(1e-6);
    expect(Math.max(...heads.map((h) => h.o.x))).toBeGreaterThan(2.5);
    // the sim's hit on enemy 3 arrives: the pop lands on it
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 10, shielded: 0, kind: 'basic' }, f.fx, ctx);
    expect(f.spawned.filter((s) => s.kind === 'glow' && Math.abs(s.o.x - 4) < 1e-6 && Math.abs((s.o.y ?? 0) - 1) < 1e-6 && s.o.life === 0.18).length).toBe(1);
    f.step(0.4);
    expect(gabeFxLive()).toBe(0);
    // a basic at a minion while an enemy hero stands roughly in front: nothing goes to the hero
    resetGabeFx();
    const g = fakeFx('own', [], 'high', false, true);
    g.pos[3] = { x: 3, z: 1.2 };
    SKILL_FX.onProjectile!(0, PROJECTILE_KIND.hero, -1, g.fx);
    g.step(0.15);
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 20, amount: 10, shielded: 0, kind: 'basic' }, g.fx, ctx);
    g.step(0.4);
    for (const s of g.spawned) expect(Math.hypot(s.o.x - 3, s.o.z - 1.2) > 0.5, `${s.kind} at the hero`).toBe(true);
    expect(gabeFxLive()).toBe(0);
    // Low: glow heads; three looks (A pink, B wind, C a bigger heart)
    resetGabeFx();
    const l = fakeFx('own', [], 'low', false, true);
    for (let n = 0; n < 3; n++) {
      SKILL_FX.onProjectile!(0, PROJECTILE_KIND.hero, -1, l.fx);
      l.step(0.6);
    }
    const lows = l.spawned.filter((s) => s.kind === 'glow' && s.at > 0);
    expect(lows.length).toBeGreaterThan(3);
    expect(new Set(lows.map((s) => s.o.color)).size).toBeGreaterThanOrEqual(2);
    expect(gabeFxLive()).toBe(0);
    // another hero's or a minion's bolt is not hers
    resetGabeFx();
    SKILL_FX.onProjectile!(0, PROJECTILE_KIND.ranged, -1, l.fx);
    expect(gabeFxLive()).toBe(0);
  });
});
