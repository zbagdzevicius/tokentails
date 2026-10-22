/**
 * Cacklejaw move set and skill FX (ANIM-SPEC §14): clips bind to the sim timings (basic windup, Jeer Slash dash,
 * Pack Hunt life), stay inside the root caps and the spin rule (yaw, pitch and roll), give the root back only while
 * airborne, compile on his rig, the basic pick is allocation-free and correct, and the skill FX draw at the sim sizes,
 * standing (ribbons / walls) where a floor would vanish.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, DASH_SPEED, SIM_TIMING, TICK_S, abilNumbers, travelTicks } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import type { ClipDef, FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, Slot } from '../../src/render/anim/types';
import { EXTRA, MOVES } from '../../src/render/moves/cacklejaw';
import { SKILL_FX, resetCacklejawFx } from '../../src/render/skillfx/cacklejaw';

const FRAME = 1 / 60;

/** Linear sample of scalar keys (the eases are ignored: a coarse airborne check). */
function lerpKeys(ks: readonly (readonly [number, number, ...unknown[]])[], t: number): number {
  if (!ks.length) return 0;
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) return ks[i - 1][1] + ((ks[i][1] - ks[i - 1][1]) * (t - ks[i - 1][0])) / Math.max(1e-9, ks[i][0] - ks[i - 1][0]);
  return ks[ks.length - 1][1];
}

const ALL: ClipDef[] = (() => {
  const set = new Map<string, ClipDef>();
  const add = (c?: ClipDef) => c && set.set(c.id, c);
  MOVES.basic.forEach(add);
  for (const s of ['q', 'w', 'e', 'r'] as Slot[]) {
    const m = MOVES.slots[s];
    add(m.cast);
    m.recasts?.forEach(add);
    add(m.hold);
    add(m.end);
    add(m.onHit);
    add(m.branch);
  }
  [MOVES.idle, MOVES.victory, MOVES.emote, MOVES.death, MOVES.respawn, MOVES.levelUp].forEach(add);
  MOVES.fidgets.forEach(([c]) => add(c));
  Object.values(EXTRA).forEach(add);
  return [...set.values()];
})();

describe('cacklejaw moves', () => {
  it('is filled and binds to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.basic.length).toBe(3);
    const T = SIM_TIMING.cacklejaw;
    for (const c of [...MOVES.basic, EXTRA.pounce, EXTRA.flankA, EXTRA.flankB, EXTRA.flankC]) {
      expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S), c.id).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toContainEqual(['contact', 'contact']);
      expect(c.len, c.id).toBeLessThan(T.period * TICK_S);
    }
    // C: one full turn, 270° on the contact
    const yaw = MOVES.basic[2].root!.yaw!;
    const atC = yaw.find(([t]) => Math.abs(t - BASIC_WINDUP * TICK_S) < 1e-9);
    expect(atC?.[1]).toBeCloseTo(-0.75, 9);
    expect(yaw[yaw.length - 1][1]).toBe(-1);
    // Q and its recast: take-off on the cast, landing on travelEnd; nominal air = 4 m at 20 m/s = 6 t
    expect(T.slots.q.dashTicks).toBe(travelTicks(4000, DASH_SPEED));
    expect(T.slots.q.dashTicks).toBe(6);
    for (const q of [MOVES.slots.q.cast, ...(MOVES.slots.q.recasts ?? [])]) {
      expect(q.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
      expect(q.markers.land! - q.markers.takeoff!).toBeCloseTo(6 * TICK_S, 9);
    }
    expect(MOVES.slots.q.recasts?.length).toBe(T.slots.q.recasts);
    // W / E: instant casts on the cast tick; E's hold / end last until the Stealth bit falls (brush extends it, an
    // attack breaks it), not cast + 90 t
    expect(MOVES.slots.w.cast.warp[0]).toEqual(['contact', 'cast']);
    expect(MOVES.slots.e.cast.warp[0]).toEqual(['contact', 'cast']);
    expect(MOVES.slots.e.hold).toBe(EXTRA.eHold);
    expect(MOVES.slots.e.end).toBe(EXTRA.eEnd);
    expect(MOVES.slots.e.endOnBuff).toBe(1);
    expect(EXTRA.eHold).toBeDefined();
    expect(EXTRA.eEnd?.warp).toEqual([['contact', 'stateEnd']]);
    // R: the howl snap on the cast, the body pitched forward from the first key (the root moves at 24 m/s from the
    // cast tick), bounds for the hunt's whole sim life (30 t), no predicted landing; the maul starts on the hit
    const r = MOVES.slots.r.cast;
    expect(r.warp).toEqual([['contact', 'cast']]);
    const ra = abilNumbers('cacklejaw', 'r');
    const life = travelTicks(ra.range * 2, ra.speed);
    expect(life).toBe(30);
    expect(r.markers.contact).toBeLessThanOrEqual(0.05);
    expect(r.markers.leap).toBeUndefined();
    const lastBound = r.keys[r.keys.length - 2][0];
    expect(lastBound - r.markers.contact!).toBeCloseTo(life * TICK_S, 9);
    for (const [t, , d] of r.keys) if (t > 0 && d) expect((d.body?.[0] ?? 0) >= 0.4, `R lean at ${t}`).toBe(true);
    expect(MOVES.slots.r.onHit?.warp).toEqual([['contact', 'contact']]);
    // W laugh never outlasts the fear
    expect(MOVES.slots.w.cast.len).toBeLessThanOrEqual(abilNumbers('cacklejaw', 'w').fear * TICK_S + 1e-9);
  });

  it('every clip compiles on his rig, keeps the root caps and the 0.3 s spin rule', () => {
    const ch = makeHero('cacklejaw', 0, null, { detail: 0.62 });
    expect(ALL.length).toBeGreaterThanOrEqual(22);
    for (const c of ALL) {
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
      // §9 rule 6 on every rotation channel: a turn lasts ≤ 0.3 s, and (readability) never under 0.2 s (12 frames)
      for (const ch of ['yaw', 'pitch', 'roll'] as const) {
        const ks = r[ch] ?? [];
        for (let i = 1; i < ks.length; i++)
          if (Math.abs(ks[i][1] - ks[i - 1][1]) >= 0.5) {
            const dt = ks[i][0] - ks[i - 1][0];
            expect(dt, `${c.id} ${ch} spin`).toBeLessThanOrEqual(0.3 + 1e-9);
            expect(dt, `${c.id} ${ch} spin`).toBeGreaterThanOrEqual(0.2 - 1e-9);
          }
      }
      // the root comes back (fwd falling by > 0.1 m) only while airborne: no moonwalk on planted feet
      const fwd = r.fwd ?? [];
      if (c.prio !== 9)
        for (let i = 1; i < fwd.length; i++)
          if (fwd[i][1] - fwd[i - 1][1] < -0.1) expect(lerpKeys(r.up ?? [], (fwd[i][0] + fwd[i - 1][0]) * 0.5), `${c.id} fwd back at ${fwd[i][0]}`).toBeGreaterThan(0.05);
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0], c.id).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      for (const m of Object.values(c.markers)) expect(m, c.id).toBeLessThanOrEqual(c.len + 1e-9);
      // big spins and flips have a reduce-motion scale
      const big = (ks?: readonly (readonly [number, number, ...unknown[]])[]) => (ks ?? []).some(([, v]) => Math.abs(v) > 0.25);
      if (big(r.yaw)) expect(c.calm?.yaw, `${c.id} calm yaw`).toBeDefined();
      if (big(r.pitch)) expect(c.calm?.pitch, `${c.id} calm pitch`).toBeDefined();
      if (big(r.roll)) expect(c.calm?.roll, `${c.id} calm roll`).toBeDefined();
    }
    ch.dispose();
  }, 60000);

  it('basic pick: pounce out of stealth, Pack Flank from behind, no allocation', () => {
    const ctx = { hero: 'cacklejaw', id: 0, branch: false, talents: [], comboIndex: 0, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false } as unknown as { -readonly [K in keyof MoveCtx]: MoveCtx[K] };
    const pick = MOVES.basicPick!;
    expect(pick(ctx)).toBeNull();
    ctx.targetBehind = true;
    for (let i = 0; i < 3; i++) {
      ctx.comboIndex = i;
      expect(pick(ctx)?.id).toBe(['cacklejaw.flankA', 'cacklejaw.flankB', 'cacklejaw.flankC'][i]);
      expect(pick(ctx)).toBe(pick(ctx));
    }
    ctx.stealthed = true;
    expect(pick(ctx)?.id).toBe('cacklejaw.pounce');
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

function fakeFx(rel: 'own' | 'enemy' = 'own', talents: string[] = [], tier: 'low' | 'med' | 'high' = 'high') {
  const spawned: Spawned[] = [];
  const ribbons: { w: number; color: number; y: number }[] = [];
  const lingerColors: number[] = [];
  const lingers: string[] = [];
  let now = 0;
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 4, z: 0 } };
  const fx = {
    tier,
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o }, at: now }), spawned.length) },
    ribbons: { point: (p: { y: number }, color: number, w: number) => (tier === 'low' ? -1 : (ribbons.push({ w, color, y: p.y }), ribbons.length - 1)), feed: () => {}, end: () => {} },
    linger: { add: (g: string, _x: number, _z: number, _s: number, _y: number, c: number) => (lingers.push(g), lingerColors.push(c)) },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? rel : rel === 'own' ? 'enemy' : 'own'),
    rim: (id: number) => (id === 0 && rel === 'own' ? 0xffd34d : 0xff3040),
    abil: (_id: number, slot: Slot) => abilNumbers('cacklejaw', slot, talents),
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
      out.x = p.x + 0.3;
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
  return { fx, spawned, ribbons, lingers, lingerColors, step, pos };
}

const cast = (slot: number, x = 4000, y = 0) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target: -1 });
const ctx = { recastIndex: 0 } as MoveCtx;
const TAU = Math.PI * 2;

describe('cacklejaw skill FX', () => {
  beforeEach(() => resetCacklejawFx());

  it('owns every slot', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: true, passive: true });
  });

  it('Q: the ribbon is exactly the dash width; the path beam is drawn from the travelled path only', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(0), f.fx, ctx);
    expect(f.ribbons[0].w).toBeCloseTo(abilNumbers('cacklejaw', 'q').width / 1000, 9);
    // he never moved in the fake: no beam along the aim
    f.step(0.5);
    expect(f.spawned.some((s) => s.kind === 'beam')).toBe(false);
    // he moved 4 m: the beam spans the travelled path at the hit width
    resetCacklejawFx();
    const g = fakeFx();
    SKILL_FX.onCast!(cast(0), g.fx, ctx);
    g.pos[0] = { x: 4, z: 0 };
    g.step(0.5);
    const beam = g.spawned.find((s) => s.kind === 'beam')!;
    expect(beam.o.sx).toBeCloseTo(4, 6);
    expect(beam.o.sz).toBeCloseTo(1, 9);
    expect(beam.o.x).toBeCloseTo(0, 6);
    expect(g.lingers).toContain('crackLine');
  });

  it('W: the dim floor and sound arcs sit inside the exact cone (Wide Gloat too)', () => {
    for (const t of [[], ['wide-gloat']]) {
      resetCacklejawFx();
      const f = fakeFx('own', t);
      SKILL_FX.onCast!(cast(1), f.fx, ctx);
      const a = abilNumbers('cacklejaw', 'w', t);
      const arcs = f.spawned.filter((s) => s.kind === 'arc' || s.kind === 'crescent' || s.kind === 'wall');
      expect(arcs.length).toBeGreaterThanOrEqual(4);
      for (const s of arcs) {
        expect(s.o.sx).toBeLessThanOrEqual(a.range / 1000 + 1e-9);
        expect(s.o.p0).toBeCloseTo((a.arc / 4096) * TAU, 9);
      }
      expect(Math.max(...arcs.map((s) => s.o.sx))).toBeCloseTo(a.range / 1000, 9);
    }
  });

  it('R: the howl, the jaw sigil over the hunted hero and the maul at the victim; enemy casts take the danger rim', () => {
    const f = fakeFx('enemy');
    SKILL_FX.onCast!(cast(3, 0, 0), f.fx, ctx);
    f.step(0.15);
    const sig = f.spawned.filter((s) => s.kind === 'pillar');
    expect(sig.length).toBeGreaterThan(0);
    expect(sig[0].o.x).toBeCloseTo(4, 9);
    for (const s of f.spawned) {
      expect(s.o.rim).toBe(0xff3040);
      expect(s.o.rel).toBe('enemy');
    }
    const n = f.spawned.length;
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 200, kind: 'ability' } as never, f.fx, ctx);
    const maul = f.spawned.slice(n);
    expect(maul.some((s) => s.kind === 'ring' && Math.abs(s.o.x - 4) < 1e-9)).toBe(true);
    expect(f.lingers).toContain('crackStar');
    // small and short: never a screen-filling white sheet over enemy telegraphs
    for (const s of maul.filter((m) => m.kind === 'ring')) {
      expect(s.o.sx).toBeLessThanOrEqual(2.2 + 1e-9);
      expect(s.o.life).toBeLessThanOrEqual(0.3 + 1e-9);
    }
    // the claw X stands on the victim's body (two strokes at chest height)
    expect(f.ribbons.filter((r) => r.y > 0.5).length).toBeGreaterThanOrEqual(2);
  });

  it('R: a long chase (hit at 25 t, after the old 17 t window) still mauls, once per cast; no maul after the sim life', () => {
    const f = fakeFx('own');
    SKILL_FX.onCast!(cast(3, 0, 0), f.fx, ctx);
    f.step(25 * TICK_S);
    const hit = { type: 'hit', tick: 0, src: 0, dst: 3, amount: 200, kind: 'ability' } as never;
    let n = f.spawned.length;
    SKILL_FX.onHit!(hit, f.fx, ctx);
    expect(f.spawned.slice(n).some((s) => s.kind === 'ring')).toBe(true);
    n = f.spawned.length;
    SKILL_FX.onHit!(hit, f.fx, ctx);
    expect(f.spawned.length).toBe(n);
    // a new cast, no hit within its 30 t life: a late ability hit draws no maul
    SKILL_FX.onCast!(cast(3, 0, 0), f.fx, ctx);
    f.step(34 * TICK_S);
    n = f.spawned.length;
    SKILL_FX.onHit!(hit, f.fx, ctx);
    expect(f.spawned.slice(n).some((s) => s.kind === 'ring')).toBe(false);
  });

  it('Q: the per-hit X cut stands at chest height (Low: ground beams)', () => {
    const f = fakeFx('own');
    SKILL_FX.onCast!(cast(0), f.fx, ctx);
    const r0 = f.ribbons.length;
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 60, kind: 'ability' } as never, f.fx, ctx);
    expect(f.ribbons.slice(r0).filter((r) => r.y > 0.5).length).toBe(2);
    resetCacklejawFx();
    const g = fakeFx('own', [], 'low');
    SKILL_FX.onCast!(cast(0), g.fx, ctx);
    const n = g.spawned.length;
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 60, kind: 'ability' } as never, g.fx, ctx);
    expect(g.spawned.slice(n).filter((s) => s.kind === 'beam').length).toBe(2);
  });

  it('W: the rim stands, the edges are outlined at the exact cone; enemy casts carry the danger rim', () => {
    const f = fakeFx('enemy');
    SKILL_FX.onCast!(cast(1), f.fx, ctx);
    const a = abilNumbers('cacklejaw', 'w');
    const R = a.range / 1000;
    const arc = (a.arc / 4096) * TAU;
    expect(f.spawned.some((s) => s.kind === 'wall' && Math.abs(s.o.sx - R) < 1e-9)).toBe(true);
    // the outline ribbon in the danger colour (lifted off the ground); no posts when ribbons exist
    expect(f.ribbons.some((r) => r.color === 0xff3040 && r.y > 0.2)).toBe(true);
    expect(f.spawned.filter((s) => s.kind === 'pillar').length).toBe(0);
    expect(f.lingers.filter((g) => g === 'crackLine').length).toBe(2);
    // Low: the two rim-corner posts at the exact cone edges
    resetCacklejawFx();
    const g = fakeFx('enemy', [], 'low');
    SKILL_FX.onCast!(cast(1), g.fx, ctx);
    const posts = g.spawned.filter((s) => s.kind === 'pillar');
    expect(posts.length).toBe(2);
    for (const p of posts) {
      expect(Math.hypot(p.o.x, p.o.z)).toBeCloseTo(R, 6);
      expect(Math.abs(Math.atan2(-p.o.z, p.o.x))).toBeCloseTo(arc / 2, 6);
    }
    for (const s of f.spawned) expect(s.o.rim).toBe(0xff3040);
  });

  it('E: a shadow puff where he vanishes; the stealthed dive cue never draws for enemies', () => {
    const f = fakeFx('enemy');
    SKILL_FX.onCast!(cast(2, 0, 0), f.fx, ctx);
    const n = f.spawned.length;
    expect(n).toBeGreaterThan(0);
    SKILL_FX.onMarker!(0, 'cacklejaw.e', 'eDive', f.fx);
    expect(f.spawned.length).toBe(n);
  });

  it('basics: the rake marker and the hit pair up whichever comes first; a whiff still draws once', () => {
    const f = fakeFx();
    SKILL_FX.onMarker!(0, 'cacklejaw.basicA', 'contact', f.fx);
    expect(f.spawned.length).toBe(0);
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 60, kind: 'basic' } as never, f.fx, ctx);
    // three standing strokes at the victim's chest, no flat floor rake
    expect(f.ribbons.length).toBe(3);
    for (const r of f.ribbons) expect(r.y).toBeGreaterThan(0.6);
    expect(f.spawned.filter((s) => s.kind === 'crescent').length).toBe(0);
    const rakes = f.spawned.length;
    const ribs = f.ribbons.length;
    f.step(0.3);
    expect(f.spawned.length).toBe(rakes);
    expect(f.ribbons.length).toBe(ribs);
    // C (a whiff here): the spin's standing wall ring
    SKILL_FX.onMarker!(0, 'cacklejaw.basicC', 'contact', f.fx);
    f.step(0.3);
    expect(f.spawned.some((s) => s.kind === 'wall' && Math.abs(s.o.p0! - TAU) < 1e-9)).toBe(true);
    // spam every slot: nothing throws, the state stays bounded
    for (let i = 0; i < 40; i++) SKILL_FX.onCast!(cast(i % 4), f.fx, ctx);
    f.step(1);
  });

  it('basics on Low (no ribbons, no walls): a deep-violet normal-blend scratch glyph stands in', () => {
    const f = fakeFx('own', [], 'low');
    SKILL_FX.onMarker!(0, 'cacklejaw.basicB', 'contact', f.fx);
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 60, kind: 'basic' } as never, f.fx, ctx);
    expect(f.ribbons.length).toBe(0);
    expect(f.lingers).toContain('scratches');
    expect(f.lingerColors[f.lingers.indexOf('scratches')]).toBe(0x6a3cc0);
  });
});
