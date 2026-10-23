/**
 * Avietė move set and skill FX (ANIM-SPEC §14): the clips bind to the sim timings (8 t basic windup, instant casts on
 * the cast tick, the 60 t Live Wire window, the 60 t Shiny Coat haste), stay inside the root caps and compile on her
 * rig, the picks choose the right clip without allocating, and the skill FX draw at the sim's (talent-resolved)
 * shapes: the Q cone, the E wire for exactly the return window, the R dazzle ring at the 3 m radius.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, SIM_TIMING, TICK_S, abilNumbers } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { Prio, type FxCtx, type MeshFxKind, type MeshFxSpawn, type MoveCtx, type Slot } from '../../src/render/anim/types';
import { AVI_CLIPS, AVI_HASTE_S, AVI_PERIOD_S, AVI_STATE, AVI_WIRE_S, MOVES } from '../../src/render/moves/aviete';
import { SKILL_FX, resetAvieteFx } from '../../src/render/skillfx/aviete';

const FRAME = 1 / 60;
const byId = (id: string) => AVI_CLIPS.find((c) => c.id === id)!;
const mkCtx = (over: Partial<MoveCtx> = {}): MoveCtx => ({ hero: 'aviete', id: 0, branch: false, talents: [], comboIndex: 0, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false, ...over });

describe('aviete moves', () => {
  beforeEach(() => resetAvieteFx());

  it('is filled and binds to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.basic.length).toBe(3);
    const T = SIM_TIMING.aviete;
    expect(AVI_PERIOD_S).toBeCloseTo(T.period * TICK_S, 9);
    for (const c of [...MOVES.basic, byId('aviete.charged')]) {
      expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S)).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toEqual([['contact', 'contact']]);
      // a swing ends before the next one starts
      expect(c.len).toBeLessThan(T.period * TICK_S);
      expect(c.prio).toBe(Prio.Basic);
    }
    // every Q / W / E / R is instant in the kit: the contact pins to the cast tick
    for (const s of ['q', 'w', 'e', 'r'] as Slot[]) {
      expect(T.slots[s].windup).toBe(0);
      expect(T.slots[s].dashMm).toBe(0);
      expect(MOVES.slots[s].cast.warp).toEqual([['contact', 'cast']]);
    }
    expect(byId('aviete.eBack').warp).toEqual([['contact', 'cast']]);
    expect(MOVES.slots.r.cast.prio).toBe(Prio.Ult);
    // durations from the data: Live Wire's return window and Shiny Coat's haste are both 60 t
    expect(AVI_WIRE_S).toBeCloseTo(T.slots.e.recastWindow * TICK_S, 9);
    expect(T.slots.e.recastWindow).toBe(60);
    expect(AVI_HASTE_S).toBeCloseTo(T.slots.w.duration * TICK_S, 9);
    // W keeps the legs running; no frozen hold clip (the gait's haste variant carries the sprint), and the haste
    // end starts from her current pose (no pop into a sprint lean after a swing)
    expect(MOVES.slots.w.cast.mask).toBe('upper');
    expect(MOVES.slots.w.hold).toBeUndefined();
    expect(MOVES.gait.variants.haste?.lean ?? 0).toBeGreaterThan(MOVES.gait.lean);
    expect(MOVES.slots.w.end!.keys[0][1]).toBeNull();
    expect(MOVES.slots.w.end!.keys[0][2]).toBeNull();
  });

  it('every clip compiles on her rig with finite values and keeps the root caps', () => {
    const ch = makeHero('aviete', 0, null, { detail: 0.62 });
    for (const c of AVI_CLIPS) {
      const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
      for (let i = 0; i < bin.q.length; i++) expect(Number.isFinite(bin.q[i]), c.id).toBe(true);
      for (let i = 0; i < bin.p.length; i++) expect(Number.isFinite(bin.p[i]), c.id).toBe(true);
      const r = c.root ?? {};
      for (const k of ['fwd', 'side'] as const) {
        const ks = r[k];
        if (!ks) continue;
        for (const [, v] of ks) expect(Math.abs(v), `${c.id} ${k}`).toBeLessThanOrEqual(c.prio === Prio.Death ? ROOT_CAPS.horizDead : ROOT_CAPS.horiz);
        if (c.prio !== Prio.Death) expect(ks[ks.length - 1][1], `${c.id} ${k} ends at 0`).toBe(0);
      }
      for (const [, v] of r.up ?? []) expect(v >= 0 && v <= ROOT_CAPS.upClip, `${c.id} up`).toBe(true);
      // §9 rule 6: a full spin lasts ≤ 0.3 s
      const yaw = r.yaw ?? [];
      for (let i = 1; i < yaw.length; i++) if (Math.abs(yaw[i][1] - yaw[i - 1][1]) >= 0.5) expect(yaw[i][0] - yaw[i - 1][0], `${c.id} spin`).toBeLessThanOrEqual(0.3 + 1e-9);
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0]).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      // every marker the warp names exists
      for (const [m] of c.warp) expect(c.markers[m], `${c.id} ${m}`).toBeTypeOf('number');
    }
    ch.dispose();
  });

  it('the flips and the axe kick are real acrobatics', () => {
    const r = MOVES.slots.r.cast;
    const minOf = (ks: readonly (readonly [number, number, ...unknown[]])[]) => Math.min(...ks.map((k) => k[1]));
    expect(minOf(r.root!.pitch!)).toBe(-1); // a full backflip off the victim
    expect(Math.max(...r.root!.up!.map((k) => k[1]))).toBeGreaterThanOrEqual(0.9);
    expect(minOf(byId('aviete.eBack').root!.pitch!)).toBe(-1);
    const c = MOVES.basic[2].root!.yaw!;
    // the back-kick: half a turn (back to the victim) exactly on the contact, the rest in the follow-through
    const half = c.find((k) => Math.abs(k[1]) === 0.5)!;
    expect(half[0]).toBeCloseTo(BASIC_WINDUP * TICK_S, 9);
    expect(half[2]).toBe('inOut');
    const full = c.find((k) => Math.abs(k[1]) === 1)!;
    expect(full[0] - half[0]).toBeGreaterThan(0.1);
    // the kick leg is driven out BEHIND her (positive thigh pitch, knee straight)
    const ck = MOVES.basic[2].keys.find((k) => Math.abs(k[0] - BASIC_WINDUP * TICK_S) < 1e-9)!;
    const cd = ck[2] as Record<string, number[]>;
    expect(cd.thighR[0]).toBeGreaterThan(1);
    expect(Math.abs(cd.kneeR[0])).toBeLessThan(0.1);
    expect(minOf(MOVES.victory!.root!.pitch!)).toBe(-2);
  });

  it('every spin and flip snaps back to 0 the instant its whole turn completes (no unspin in the fade-out)', () => {
    for (const c of AVI_CLIPS) {
      for (const ch of ['yaw', 'pitch', 'roll'] as const) {
        const ks = c.root?.[ch];
        if (!ks) continue;
        const last = ks[ks.length - 1][1];
        expect(Math.abs(last - Math.round(last)), `${c.id} ${ch} whole turns`).toBeLessThan(1e-9);
        expect(last, `${c.id} ${ch} ends at 0`).toBe(0);
        // a whole-turn key is followed by a step snap to 0 within 2 ms (sampled: never an in-between frame)
        for (let i = 0; i < ks.length - 1; i++) {
          if (Math.abs(ks[i][1]) < 1 || ks[i + 1][1] !== 0) continue;
          expect(Number.isInteger(ks[i][1]), `${c.id} ${ch} snaps from a whole turn`).toBe(true);
          expect(ks[i + 1][0] - ks[i][0], `${c.id} ${ch} snap`).toBeLessThanOrEqual(0.002);
          expect(ks[i + 1][2], `${c.id} ${ch} snap ease`).toBe('step');
        }
      }
    }
  });

  it('R: she arrives with the leg high and the heel chops down one tick after the contact; the impact cues ride the heel', () => {
    const r = MOVES.slots.r.cast;
    const contact = r.markers.contact!;
    const heel = r.markers.heel!;
    expect(heel - contact).toBeCloseTo(TICK_S, 9);
    const thighAt = (t: number) => (r.keys.find((k) => Math.abs(k[0] - t) < 1e-9)![2] as Record<string, number[]>).thighR[0];
    expect(thighAt(contact)).toBeLessThan(-1.6); // still high: the downswing is still to come
    expect(thighAt(heel)).toBeGreaterThan(-1.2); // chopped down
    expect(r.cues!.some((c) => c[0] === 'contact' && c[1] === 'smear')).toBe(true);
    expect(r.cues!.some((c) => c[0] === 'contact' && c[1] === 'trailOn' && c[2] === 'footR')).toBe(true);
    expect(r.cues!.some((c) => c[0] === 'heel' && c[1] === 'fx' && c[2] === 'heel')).toBe(true);
    for (const kind of ['freeze', 'shake', 'punch'] as const) expect(r.cues!.find((c) => c[1] === kind)![0]).toBe('heel');
    // only the line squeeze lifts her at the origin (≤ 0.1 m before the snap one tick ahead of the contact)
    for (const [t, v] of r.root!.up!) if (t < contact - TICK_S + 1e-9) expect(v).toBeLessThanOrEqual(0.1);
    // the landing is upright: chest and body not leaning toward the victim, the root tipped back (never forward)
    const land = r.keys.find((k) => Math.abs(k[0] - r.markers.land!) < 1e-9)![2] as Record<string, number[]>;
    expect(land.chest[0]).toBeLessThanOrEqual(0);
    expect(land.body[0]).toBeLessThanOrEqual(0);
    for (const [t, v] of r.root!.pitch!) if (t >= r.markers.land!) expect(v).toBeLessThanOrEqual(0);
    // the backflip starts within 0.08 s of the contact; the fwd excursion is home before the landing
    const pitch = r.root!.pitch!;
    const first = pitch.findIndex((k) => k[1] < 0);
    expect(pitch[first - 1][0] - contact).toBeLessThanOrEqual(0.08);
    const fwd = r.root!.fwd!;
    for (const [t, v] of fwd) if (t >= r.markers.land!) expect(v).toBe(0);
  });

  it('Q: on the contact she faces the aim (yaw 0) and holds it 3 frames; a small coil before, the spin after', () => {
    const q = MOVES.slots.q.cast;
    const yaw = q.root!.yaw!;
    const C = q.markers.contact!;
    const at = yaw.find((k) => Math.abs(k[0] - C) < 1e-9)!;
    expect(at[1]).toBe(0);
    const coil = Math.max(...yaw.filter((k) => k[0] < C).map((k) => k[1]));
    expect(coil).toBeGreaterThan(0.08);
    expect(coil).toBeLessThanOrEqual(0.15);
    // the held facing: within 0.05 turn for 3 frames after the contact
    const hold = yaw.find((k) => k[0] > C)!;
    expect(hold[0] - C).toBeGreaterThanOrEqual(3 * FRAME - 1e-9);
    expect(Math.abs(hold[1])).toBeLessThanOrEqual(0.05);
    expect(q.keys.some((k) => Math.abs(k[0] - hold[0]) < 1e-9)).toBe(true);
    const spin = yaw.find((k) => k[1] === -1)!;
    expect(spin[2]).toBe('inOut');
    expect(Math.min(...yaw.map((k) => k[1]))).toBe(-1);
  });

  it('no foot skating: the basics, the knee, R and idle keep the root fwd still while she stands', () => {
    for (const id of ['aviete.basicA', 'aviete.basicB', 'aviete.basicC', 'aviete.charged', 'aviete.r', 'aviete.idle']) {
      const c = byId(id);
      expect(c.lockFeet, id).toBe(true);
      const fwd = c.root?.fwd;
      if (!fwd) continue;
      // after the landing (or for a grounded basic, after the recovery step) the fwd channel is flat at 0
      const settle = c.markers.land ?? (c.markers.contact ?? 0) + 0.28;
      for (const [t, v] of fwd) if (t >= settle) expect(v, `${id} fwd at ${t}`).toBe(0);
    }
  });

  it('picks: Charged → flying knee (hero target only), Live Wire return inside the window; same objects, no allocation', () => {
    const ctx = mkCtx();
    expect(MOVES.basicPick!(ctx)).toBeNull();
    // Charged at a minion or a tower: a plain basic (the sim spends the charge on a hero only)
    expect(MOVES.basicPick!(mkCtx({ charged: true }))).toBeNull();
    AVI_STATE.swingHero[0] = 1;
    const charged = MOVES.basicPick!(mkCtx({ charged: true }));
    expect(charged?.id).toBe('aviete.charged');
    expect(MOVES.basicPick!(mkCtx({ charged: true }))).toBe(charged);

    const pick = MOVES.slots.e.pick!;
    expect(pick(ctx)?.id).toBe('aviete.e');
    expect(AVI_STATE.isReturn[0]).toBe(0);
    AVI_STATE.clock = 5;
    AVI_STATE.wireUntil[0] = 5 + AVI_WIRE_S;
    expect(pick(ctx)?.id).toBe('aviete.eBack');
    expect(AVI_STATE.isReturn[0]).toBe(1);
    AVI_STATE.clock = 5 + AVI_WIRE_S + 0.5;
    expect(pick(ctx)?.id).toBe('aviete.e');
    // out-of-range ids never index the state
    expect(pick(mkCtx({ id: 99 }))?.id).toBe('aviete.e');
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
  const lingers: { kind: string; r: number }[] = [];
  let bolts = 0;
  let now = 0;
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 4, z: 0 } };
  const ents = new Map<number, { id: number; kind: string; team: number; hp: number; fx: number; fy: number; yaw: number; charged?: boolean }>();
  const fx = {
    ents,
    tier: 'high',
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o }, at: now }), spawned.length) },
    ribbons: { point: () => 1, feed: () => {}, end: () => {} },
    linger: { add: (kind: string, _x: number, _z: number, r: number) => lingers.push({ kind, r }) },
    particles: { lightning: () => bolts++, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? rel : 'enemy'),
    rim: (id: number) => (id === 0 && rel === 'own' ? 0xffd34d : 0xff3040),
    abil: (id: number, slot: Slot) => (id === 0 ? abilNumbers('aviete', slot, talents) : id === 3 ? abilNumbers('brutus', slot) : {}),
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
  return { fx, spawned, lingers, pos, ents, step, bolts: () => bolts, time: () => now };
}

const cast = (slot: number, x = 4000, y = 0, target = 3) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target });
const hit = (dst: number, kind: 'basic' | 'ability' = 'basic') => ({ type: 'hit' as const, tick: 0, src: 0, dst, amount: 60, shielded: 0, kind });

describe('aviete skill FX', () => {
  beforeEach(() => resetAvieteFx());

  it('owns every slot', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: true, passive: true });
  });

  it('Q sweeps the exact cone (2.2 m, 100°; Wide Swipe 120°) toward the aim', () => {
    for (const talents of [[], ['wide-swipe']]) {
      resetAvieteFx();
      const f = fakeFx('own', talents);
      SKILL_FX.onCast!(cast(0), f.fx, mkCtx());
      const a = abilNumbers('aviete', 'q', talents);
      const outer = f.spawned.filter((s) => s.kind === 'arc');
      expect(outer.length).toBeGreaterThanOrEqual(2);
      for (const c of outer) {
        expect(c.o.sx).toBeLessThanOrEqual(a.range / 1000 + 1e-9);
        expect(c.o.p0!).toBeLessThanOrEqual((a.arc / 4096) * Math.PI * 2 + 1e-9);
        // every slice sits inside the cone
        expect(Math.abs(c.o.yaw ?? 0) + c.o.p0! / 2).toBeLessThanOrEqual((a.arc / 4096) * Math.PI + 1e-9);
      }
      expect(outer[0].o.sx).toBeCloseTo(a.range / 1000, 9);
      expect(outer[0].o.p0!).toBeCloseTo((a.arc / 4096) * Math.PI * 2, 9);
      // the fill dominates: full-cone spawns with both lead sides at p3 ≥ 2.5 alive ≥ 0.35 s; the slices are faint
      const fill = outer.filter((c) => Math.abs(c.o.p0! - (a.arc / 4096) * Math.PI * 2) < 1e-9 && (c.o.p1 ?? 0) < 0.5);
      expect(new Set(fill.map((c) => Math.sign(c.o.p2!)))).toEqual(new Set([-1, 1]));
      for (const c of fill) {
        expect(c.o.p3!).toBeGreaterThanOrEqual(2.5);
        expect(c.o.life).toBeGreaterThanOrEqual(0.35);
      }
      for (const c of outer) if (c.o.p0! < (a.arc / 4096) * Math.PI * 2 - 1e-9) expect(c.o.p3!).toBeLessThanOrEqual(1.5);
      expect(f.bolts()).toBeGreaterThan(3);
    }
  });

  it('E opens the wire for exactly the 60 t window; the return closes it and flies to the anchor', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(2, 4000, 0), f.fx, mkCtx());
    expect(AVI_STATE.wireUntil[0]).toBeCloseTo(AVI_WIRE_S, 9);
    f.pos[0] = { x: 4, z: 0 };
    f.step(1);
    const beams = f.spawned.filter((s) => s.kind === 'beam');
    expect(beams.length).toBeGreaterThan(3);
    for (const b of beams) expect(b.o.sx).toBeCloseTo(4, 6);
    // one live beam per wire (Low's beam pool is 2): each lives no longer than the gap to the next
    for (let i = 1; i < beams.length; i++) expect(beams[i - 1].o.life).toBeLessThanOrEqual(beams[i].at - beams[i - 1].at + 0.03);
    expect(beams[0].o.life).toBeLessThan(0.26);
    // nothing past the window
    f.step(AVI_WIRE_S + 0.5 - 1);
    for (const b of f.spawned.filter((s) => s.kind === 'beam')) expect(b.at).toBeLessThanOrEqual(AVI_WIRE_S + FRAME);
    // a fresh blink and its return
    resetAvieteFx();
    const g = fakeFx();
    SKILL_FX.onCast!(cast(2, 9000, 0), g.fx, mkCtx());
    g.pos[0] = { x: 4.5, z: 0 };
    g.step(0.5);
    expect(MOVES.slots.e.pick!(mkCtx())?.id).toBe('aviete.eBack');
    const before = g.spawned.length;
    SKILL_FX.onCast!(cast(2, 0, 0), g.fx, mkCtx());
    expect(AVI_STATE.wireUntil[0]).toBe(0);
    g.step(0.5);
    expect(g.spawned.slice(before).some((s) => s.kind === 'beam')).toBe(false);
    // the out blink clamps to the (talent) range: Long Wire 5.5 m
    resetAvieteFx();
    const h = fakeFx('own', ['long-wire']);
    SKILL_FX.onCast!(cast(2, 20000, 0), h.fx, mkCtx());
    const line = h.lingers.find((l) => l.kind === 'crackLine')!;
    expect(line.r * 2).toBeCloseTo(5.5, 6);
  });

  it('R: the dazzle ring sits at exactly 3 m round the landing; enemy rim red; Blinding Shine burns white', () => {
    const f = fakeFx('enemy');
    SKILL_FX.onCast!(cast(3, 4000, 0, 3), f.fx, mkCtx());
    const R = abilNumbers('aviete', 'r').dazzleRadius / 1000;
    const rings = f.spawned.filter((s) => s.kind === 'ring' || s.kind === 'arc');
    expect(rings.length).toBe(2);
    for (const r of rings) {
      expect(r.o.sx).toBeCloseTo(R, 9);
      expect(r.o.rim).toBe(0xff3040);
      expect(r.o.rel).toBe('enemy');
      // she lands beside the target, on her side of it
      expect(r.o.x).toBeGreaterThanOrEqual(2.9);
      expect(r.o.x).toBeLessThan(4);
    }
    expect(AVI_STATE.wireUntil[0]).toBeCloseTo(AVI_WIRE_S, 9);
    resetAvieteFx();
    const g = fakeFx('own', ['blinding-shine']);
    SKILL_FX.onCast!(cast(3, 4000, 0, 3), g.fx, mkCtx());
    expect(g.spawned.find((s) => s.kind === 'ring')!.o.color).toBe(0xffffff);
  });

  it('the Charged proc fires once, on a hero only', () => {
    const f = fakeFx();
    MOVES.basicPick!(mkCtx({ charged: true }));
    SKILL_FX.onHit!(hit(7), f.fx, mkCtx()); // a minion: no proc
    expect(f.spawned.length).toBe(0);
    SKILL_FX.onHit!(hit(3), f.fx, mkCtx());
    const n = f.spawned.length;
    expect(f.spawned.some((s) => s.kind === 'ring' && s.o.x === 4)).toBe(true);
    SKILL_FX.onHit!(hit(3), f.fx, mkCtx());
    expect(f.spawned.length).toBe(n);
  });

  it('the swing target and the snapshot charge: knee only at a hero, a stale Charged flag clears', () => {
    const f = fakeFx();
    const me = { id: 0, kind: 'hero', team: 0, hp: 500, fx: 0, fy: 0, yaw: 0, charged: true };
    f.ents.set(0, me);
    f.ents.set(7, { id: 7, kind: 'minion', team: 1, hp: 300, fx: 1500, fy: 0, yaw: Math.PI });
    f.ents.set(3, { id: 3, kind: 'hero', team: 1, hp: 500, fx: 0, fy: 2200, yaw: 0 });
    MOVES.basicPick!(mkCtx({ charged: true }));
    f.step(FRAME);
    // she faces the minion (+x, the nearer one): a plain basic
    expect(AVI_STATE.swingHero[0]).toBe(0);
    expect(MOVES.basicPick!(mkCtx({ charged: true }))).toBeNull();
    // she turns to the hero (+y)
    me.yaw = Math.PI / 2;
    f.ents.delete(7);
    f.step(FRAME);
    expect(AVI_STATE.swingHero[0]).toBe(1);
    expect(MOVES.basicPick!(mkCtx({ charged: true }))?.id).toBe('aviete.charged');
    // the charge decays in the sim (4 s outside brush): the stale flag clears, a later hero hit is no proc
    me.charged = false;
    f.step(0.5);
    expect(AVI_STATE.charged[0]).toBe(0);
    expect(AVI_STATE.swingHero[0]).toBe(0);
    const n = f.spawned.length;
    SKILL_FX.onHit!(hit(3, 'ability'), f.fx, mkCtx());
    expect(f.spawned.length).toBe(n);
  });

  it('R FX never walls off the area: a thin short band, one short pillar from the heel up, Low drops the glow', () => {
    for (const tier of ['high', 'low'] as const) {
      resetAvieteFx();
      const f = fakeFx('enemy');
      (f.fx as { tier: string }).tier = tier;
      SKILL_FX.onCast!(cast(3, 4000, 0, 3), f.fx, mkCtx());
      const band = f.spawned.find((s) => s.kind === 'arc')!;
      expect(band.o.life).toBeLessThanOrEqual(0.45);
      expect(band.o.p1!).toBeGreaterThanOrEqual(0.97);
      expect(band.o.p3 ?? 1).toBeLessThanOrEqual(1);
      for (const p of f.spawned.filter((s) => s.kind === 'pillar')) {
        expect(p.o.sx).toBeLessThanOrEqual(0.5);
        expect(p.o.life).toBeLessThanOrEqual(0.18);
      }
      const atLanding = (k: string) => f.spawned.filter((s) => s.kind === k && s.o.x > 2.5);
      expect(atLanding('pillar').length).toBe(1);
      // the sky column stands from the heel (2 m) up and is gone in 0.12 s: her contact pose and the victim stay clear
      expect(atLanding('pillar')[0].o.y).toBeGreaterThanOrEqual(2);
      expect(atLanding('pillar')[0].o.life).toBeLessThanOrEqual(0.12);
      if (tier === 'low') expect(atLanding('glow').length).toBe(0);
    }
  });

  it('W: the cast leaves her body clear (ring + bolts), the shine pops a short column; sparks only for the haste', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(1), f.fx, mkCtx());
    for (const k of ['pillar', 'twister', 'glow'] as MeshFxKind[]) expect(f.spawned.some((s) => s.kind === k), k).toBe(false);
    expect(f.spawned.some((s) => s.kind === 'ring')).toBe(true);
    SKILL_FX.onMarker!(0, 'aviete.w', 'shine', f.fx);
    const col = f.spawned.filter((s) => s.kind === 'pillar' || s.kind === 'twister');
    expect(col.length).toBeGreaterThan(0);
    for (const c of col) {
      expect(c.o.sy!).toBeLessThanOrEqual(1.6);
      expect(c.o.life).toBeLessThanOrEqual(0.15);
    }
    f.step(AVI_HASTE_S);
    const b = f.bolts();
    f.step(1);
    expect(f.bolts()).toBe(b);
  });
});
