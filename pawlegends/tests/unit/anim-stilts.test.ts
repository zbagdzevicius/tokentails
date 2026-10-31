/**
 * Stilts move set and skill FX (sim v11, docs/plans/moba/CATS-V11.md §2.4): the clips bind to the sim timings (8 t
 * basic windup, instant casts on the cast tick, High Leap's air time at its own leap speed, Swat-Swat's gap, the
 * Zoomies duration), stay inside the root caps and compile on her rig; the pounce pick reads full Stride or Zoomies
 * without allocating; the skill FX draw at the sim's (talent-resolved) shapes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, SIM_TIMING, TICK_S, abilNumbers, travelTicks } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { Prio, type FxCtx, type MeshFxKind, type MeshFxSpawn, type MoveCtx, type Slot } from '../../src/render/anim/types';
import { MOVES, STILTS_CLIPS, STILTS_LEAP_S, STILTS_PERIOD_S, STILTS_STATE, STILTS_SWAT_GAP_S, STILTS_ZOOMIES_S, STRIDE_MAX, resetStiltsMoves } from '../../src/render/moves/stilts';
import { PRINT_SIZE, SKILL_FX, resetStiltsFx, zoomEndOf } from '../../src/render/skillfx/stilts';

const FRAME = 1 / 60;
const byId = (id: string) => STILTS_CLIPS.find((c) => c.id === id)!;
const mkCtx = (over: Partial<MoveCtx> = {}): MoveCtx => ({ hero: 'stilts', id: 0, branch: false, talents: [], comboIndex: 0, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false, ...over });

describe('stilts moves', () => {
  beforeEach(() => {
    resetStiltsMoves();
    resetStiltsFx();
  });

  it('is filled and binds to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.basic.length).toBe(2);
    const T = SIM_TIMING.stilts;
    expect(STILTS_PERIOD_S).toBeCloseTo(T.period * TICK_S, 9);
    for (const c of [...MOVES.basic, byId('stilts.pounce')]) {
      expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S)).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toEqual([['contact', 'contact']]);
      expect(c.len).toBeLessThan(T.period * TICK_S);
      expect(c.prio).toBe(Prio.Basic);
    }
    // every cast is instant in the kit: the contact (Q: the take-off) pins to the cast tick
    for (const s of ['q', 'w', 'e', 'r'] as Slot[]) {
      expect(T.slots[s].windup).toBe(0);
      expect(MOVES.slots[s].cast.warp[0][1]).toBe('cast');
    }
    // High Leap lands on the sim's travel end; its nominal air time is the full leap at its own speed
    expect(MOVES.slots.q.cast.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
    const q = abilNumbers('stilts', 'q');
    expect(STILTS_LEAP_S).toBeCloseTo(travelTicks(q.dash, q.speed) * TICK_S, 9);
    expect(MOVES.slots.q.cast.markers.land! - MOVES.slots.q.cast.markers.takeoff!).toBeCloseTo(STILTS_LEAP_S, 9);
    // Swat-Swat's second swat lands exactly `gap` ticks after the first
    const e = MOVES.slots.e.cast;
    expect(STILTS_SWAT_GAP_S).toBeCloseTo(abilNumbers('stilts', 'e').gap * TICK_S, 9);
    expect(e.markers.swat2! - e.markers.contact!).toBeCloseTo(STILTS_SWAT_GAP_S, 9);
    // Zoomies: the ult prio, its end clip after the data's duration
    expect(MOVES.slots.r.cast.prio).toBe(Prio.Ult);
    expect(STILTS_ZOOMIES_S).toBeCloseTo(abilNumbers('stilts', 'r').duration * TICK_S, 9);
    expect(MOVES.slots.r.end!.keys[0][2]).toBeNull();
    expect(MOVES.gait.variants.haste?.stride ?? 0).toBeGreaterThan(MOVES.gait.stride);
  });

  it('every clip compiles on her rig with finite values and keeps the root caps', () => {
    const ch = makeHero('stilts', 0, null, { detail: 0.62 });
    for (const c of STILTS_CLIPS) {
      const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
      for (let i = 0; i < bin.q.length; i++) expect(Number.isFinite(bin.q[i]), c.id).toBe(true);
      for (let i = 0; i < bin.p.length; i++) expect(Number.isFinite(bin.p[i]), c.id).toBe(true);
      const r = c.root ?? {};
      for (const k of ['fwd', 'side'] as const) {
        const ks = r[k];
        if (!ks) continue;
        for (const [, v] of ks) expect(Math.abs(v), `${c.id} ${k}`).toBeLessThanOrEqual(ROOT_CAPS.horiz);
        expect(ks[ks.length - 1][1], `${c.id} ${k} ends at 0`).toBe(0);
      }
      for (const [, v] of r.up ?? []) expect(v >= 0 && v <= ROOT_CAPS.upClip, `${c.id} up`).toBe(true);
      // §9 rule 6: a full spin lasts ≤ 0.3 s, and a whole turn snaps back to 0 with a step
      for (const ch2 of ['yaw', 'pitch', 'roll'] as const) {
        const ks = r[ch2] ?? [];
        for (let i = 1; i < ks.length; i++) if (Math.abs(ks[i][1] - ks[i - 1][1]) >= 0.5 && ks[i][2] !== 'step') expect(ks[i][0] - ks[i - 1][0], `${c.id} spin`).toBeLessThanOrEqual(0.3 + 1e-9);
        if (ks.length) expect(ks[ks.length - 1][1], `${c.id} ${ch2} ends at 0`).toBe(0);
        for (let i = 0; i < ks.length - 1; i++) if (Math.abs(ks[i][1]) >= 1 && ks[i + 1][1] === 0) expect(ks[i + 1][2]).toBe('step');
      }
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0]).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      for (const [m] of c.warp) expect(c.markers[m], `${c.id} ${m}`).toBeTypeOf('number');
      for (const cue of c.cues ?? []) if (typeof cue[0] === 'string') expect(c.markers[cue[0]], `${c.id} cue ${cue[0]}`).toBeTypeOf('number');
    }
    ch.dispose();
  });

  it('High Leap is the tallest arc in her set and lands crouched; the pounce is a short hop', () => {
    const top = (id: string) => Math.max(...(byId(id).root?.up ?? [[0, 0]]).map((k) => k[1]));
    expect(top('stilts.q')).toBe(ROOT_CAPS.upClip);
    expect(top('stilts.pounce')).toBeGreaterThan(0.3);
    expect(top('stilts.pounce')).toBeLessThan(top('stilts.q'));
    // the pounce lands its claws on the contact: both paws down from high
    const pk = byId('stilts.pounce').keys;
    const at = (t: number) => pk.find((k) => Math.abs(k[0] - t) < 1e-9)![2] as Record<string, number[]>;
    expect(at(0.17).shoulderL[0]).toBeLessThan(-2);
    expect(at(BASIC_WINDUP * TICK_S).shoulderL[0]).toBeGreaterThan(-1.2);
  });

  it('picks: full Stride or Zoomies → the pounce, noted for the FX; same object, no allocation', () => {
    expect(MOVES.basicPick!(mkCtx())).toBeNull();
    expect(STILTS_STATE.pounce[0]).toBe(0);
    expect(MOVES.basicPick!(mkCtx({ resource: STRIDE_MAX - 1 }))).toBeNull();
    const p = MOVES.basicPick!(mkCtx({ resource: STRIDE_MAX }));
    expect(p?.id).toBe('stilts.pounce');
    expect(STILTS_STATE.pounce[0]).toBe(1);
    // an enemy's view: no resource, but Zoomies' form bit shows every attack is a pounce
    expect(MOVES.basicPick!(mkCtx({ form: true }))).toBe(p);
    // out-of-range ids never index the state
    expect(MOVES.basicPick!(mkCtx({ id: 99, resource: STRIDE_MAX }))).toBe(p);
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
}

function fakeFx(rel: 'own' | 'enemy' = 'own', talents: string[] = []) {
  const spawned: Spawned[] = [];
  const lingers: { kind: string; r: number }[] = [];
  let ribbons = 0;
  let ended = 0;
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 2, z: 0 } };
  const ents = new Map<number, { hp: number; resource?: number; form?: boolean }>();
  const fx = {
    ents,
    tier: 'high',
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o } }), spawned.length) },
    ribbons: { point: () => (ribbons++, 1), feed: () => {}, end: () => ended++ },
    linger: { add: (kind: string, _x: number, _z: number, r: number) => lingers.push({ kind, r }) },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? rel : 'enemy'),
    rim: (id: number) => (id === 0 && rel === 'own' ? 0xffd34d : 0xff3040),
    abil: (id: number, slot: Slot) => (id === 0 ? abilNumbers('stilts', slot, talents) : id === 3 ? abilNumbers('brutus', slot) : {}),
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
    for (let t = 0; t < s; t += FRAME) SKILL_FX.update!(FRAME, fx);
  };
  return { fx, spawned, lingers, pos, ents, step, ribbons: () => ribbons, ended: () => ended };
}

const cast = (slot: number, x = 4000, y = 0, target = -1) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target });
const hit = (dst: number, kind: 'basic' | 'ability' = 'basic') => ({ type: 'hit' as const, tick: 0, src: 0, dst, amount: 60, shielded: 0, kind });

describe('stilts skill FX', () => {
  beforeEach(() => {
    resetStiltsMoves();
    resetStiltsFx();
  });

  it('owns every slot', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: true, passive: true });
  });

  it('Q marks the landing at the touch radius, clamped to the leap reach; the landing dust ring matches it', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(0, 20000, 0), f.fx, mkCtx());
    const a = abilNumbers('stilts', 'q');
    const mark = f.spawned.find((s) => s.kind === 'arc')!;
    expect(mark.o.sx).toBeCloseTo(a.touch / 1000, 9);
    expect(mark.o.x).toBeCloseTo(a.dash / 1000, 6);
    SKILL_FX.onMarker!(0, 'stilts.q', 'leapLand', f.fx);
    const ring = f.spawned.find((s) => s.kind === 'ring')!;
    expect(ring.o.sx).toBeCloseTo(a.touch / 1000, 9);
    expect(f.lingers.some((l) => l.kind === 'crater')).toBe(true);
  });

  it('W rings out to exactly the reveal radius (Big Ears 11 m)', () => {
    for (const talents of [[], ['big-ears']]) {
      resetStiltsFx();
      const f = fakeFx('own', talents);
      SKILL_FX.onCast!(cast(1, 0, 0), f.fx, mkCtx());
      const R = abilNumbers('stilts', 'w', talents).radius / 1000;
      const rings = f.spawned.filter((s) => s.kind === 'ring' || s.kind === 'arc');
      expect(rings.length).toBeGreaterThanOrEqual(2);
      for (const r of rings) expect(r.o.sx).toBeCloseTo(R, 9);
    }
  });

  it('E draws the exact line per swat; the second on its marker, the same way', () => {
    const f = fakeFx('enemy');
    SKILL_FX.onCast!(cast(2, 0, -3000), f.fx, mkCtx());
    const a = abilNumbers('stilts', 'e');
    const beams = () => f.spawned.filter((s) => s.kind === 'beam');
    expect(beams().length).toBe(1);
    expect(beams()[0].o.sx).toBeCloseTo(a.range / 1000, 9);
    expect(beams()[0].o.sz).toBeCloseTo(a.width / 1000, 9);
    expect(beams()[0].o.rim).toBe(0xff3040);
    f.pos[0] = { x: 0.5, z: 0 };
    SKILL_FX.onMarker!(0, 'stilts.e', 'swat2', f.fx);
    expect(beams().length).toBe(2);
    expect(beams()[1].o.x).toBe(0.5);
    expect(beams()[1].o.yaw).toBeCloseTo(beams()[0].o.yaw!, 6);
  });

  it('R: prints and a speed-line ribbon for the Zoomies duration, then nothing', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(3, 0, 0), f.fx, mkCtx());
    expect(zoomEndOf(0)).toBeCloseTo(STILTS_ZOOMIES_S, 9);
    expect(f.ribbons()).toBe(1);
    f.step(1);
    const prints = f.spawned.filter((s) => s.kind === 'glow' && s.o.sx === PRINT_SIZE).length;
    expect(prints).toBeGreaterThan(4);
    f.step(STILTS_ZOOMIES_S);
    expect(f.ended()).toBe(1);
    const n = f.spawned.length;
    f.step(1);
    expect(f.spawned.length).toBe(n);
  });

  it('R ends early when the snapshot drops the form bit', () => {
    const f = fakeFx();
    f.ents.set(0, { hp: 500, form: true });
    SKILL_FX.onCast!(cast(3, 0, 0), f.fx, mkCtx());
    f.step(0.5);
    expect(zoomEndOf(0)).toBeGreaterThan(0);
    f.ents.set(0, { hp: 0, form: false });
    f.step(FRAME);
    expect(zoomEndOf(0)).toBe(0);
  });

  it('the pounce streaks fire once, on a hero only', () => {
    const f = fakeFx();
    MOVES.basicPick!(mkCtx({ resource: STRIDE_MAX }));
    SKILL_FX.onHit!(hit(7), f.fx, mkCtx()); // a minion: no streaks
    expect(f.spawned.length).toBe(0);
    SKILL_FX.onHit!(hit(3), f.fx, mkCtx());
    expect(f.spawned.filter((s) => s.kind === 'crescent').length).toBe(2);
    expect(f.lingers.some((l) => l.kind === 'scratches')).toBe(true);
    const n = f.spawned.length;
    SKILL_FX.onHit!(hit(3), f.fx, mkCtx());
    expect(f.spawned.length).toBe(n);
  });

  it('Long Stride: a ring flashes once when the own snapshot shows Stride full', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(1, 0, 0), f.fx, mkCtx()); // seen
    const n0 = f.spawned.length;
    f.ents.set(0, { hp: 500, resource: 60 });
    f.step(FRAME);
    expect(f.spawned.length).toBe(n0);
    f.ents.set(0, { hp: 500, resource: STRIDE_MAX });
    f.step(FRAME * 3);
    expect(f.spawned.length).toBe(n0 + 1);
  });
});
