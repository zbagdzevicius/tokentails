/**
 * Meatball move set and skill FX (sim v11, CATS-V11 §2.1): the clips bind to the sim timings (melee contact, the
 * Bowling Roll travel, the Loaf Mode and Chonk states), stay inside the root caps, compile on his rig, and the skill
 * FX draw at the sim's own radii and widths and stop by the sim's last tick.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, DASH_SPEED, SIM_TIMING, TICK_S, abilNumbers, travelTicks } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { TimeWarp } from '../../src/render/anim/warp';
import { ANCHOR_INDEX, newAnchors, type FxCtx, type HeroStatus, type MeshFxKind, type MeshFxSpawn, type MoveCtx } from '../../src/render/anim/types';
import { MEATBALL_CLIPS, MOVES } from '../../src/render/moves/meatball';
import { SKILL_FX, meatballFxLive, resetMeatballFx } from '../../src/render/skillfx/meatball';
import { HERO_BUILD, HERO_TOP } from '../../src/render/chars';
import { ACCENT, HEIGHT, RING, TOP } from '../../src/render/chars/heroes/meatball';

const FRAME = 1 / 60;
const T = SIM_TIMING.meatball;
const m = (c: { markers: Readonly<Record<string, number>> }, k: string): number => c.markers[k] ?? NaN;

describe('meatball moves', () => {
  it('is filled and binds every move to the sim', () => {
    expect(MOVES.stub).toBe(false);
    expect(MOVES.basic.length).toBe(3);
    for (const c of MOVES.basic) {
      expect(Math.abs(m(c, 'contact') - BASIC_WINDUP * TICK_S)).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toContainEqual(['contact', 'contact']);
      expect(c.len).toBeLessThan(T.period * TICK_S);
    }
    // Q: take-off on the cast, unrolled by travelEnd (6 m at 20 m/s = 9 t)
    const q = MOVES.slots.q.cast;
    expect(q.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
    expect(T.slots.q.dashTicks).toBe(travelTicks(6000, DASH_SPEED));
    expect(m(q, 'land') - m(q, 'takeoff')).toBeCloseTo(T.slots.q.dashTicks * TICK_S, 9);
    // W and R: instant, with a hold for the state and an end clip on stateEnd
    for (const s of ['w', 'r'] as const) {
      const sm = MOVES.slots[s];
      expect(sm.cast.warp).toEqual([['contact', 'cast']]);
      expect(sm.hold?.id).toBe(`meatball.${s}Hold`);
      expect(sm.end?.warp).toEqual([['contact', 'stateEnd']]);
    }
    expect(T.slots.w.duration).toBe(60);
    expect(T.slots.r.duration).toBe(120);
    // E: no sim dash length (it depends on the ally): bound to the cast only
    expect(T.slots.e.dashMm).toBe(0);
    expect(MOVES.slots.e.cast.warp).toEqual([['takeoff', 'cast']]);
  });

  it('every clip compiles on his rig with finite values, keeps the root caps and wraps whole turns', () => {
    const ch = makeHero('meatball', 0, null, { detail: 0.62 });
    for (const c of MEATBALL_CLIPS) {
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
      // §9 rule 6: a full spin lasts ≤ 0.3 s (a step back to 0 is the wrap, not motion)
      for (const k of ['yaw', 'pitch'] as const) {
        const ks = r[k] ?? [];
        for (let i = 1; i < ks.length; i++) {
          const turns = Math.abs(ks[i][1] - ks[i - 1][1]);
          if (turns >= 0.5 && ks[i][2] !== 'step') expect((ks[i][0] - ks[i - 1][0]) / turns, `${c.id} ${k} spin`).toBeLessThanOrEqual(0.36 + 1e-9);
        }
      }
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0]).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0]).toBeLessThanOrEqual(c.len + 1e-9);
      if (c.prio >= 4 && c.prio <= 7 && !/Hold$/.test(c.id)) expect(Number.isFinite(m(c, 'contact')), c.id).toBe(true);
    }
    ch.dispose();
  });

  it('Chonk swells him to 1.15 for the whole state; the loaf squashes him wide and low', () => {
    const rh = MOVES.slots.r.hold!;
    for (const k of ['sx', 'sy'] as const) for (const [, v] of rh.root![k]!) expect(v).toBeCloseTo(1.15, 9);
    const wh = MOVES.slots.w.hold!;
    for (const [, v] of wh.root!.sy!) expect(v).toBeLessThan(0.9);
    for (const [, v] of wh.root!.sx!) expect(v).toBeGreaterThan(1.05);
  });

  it('Q: a short click still rolls the full 6 m (the warp lands on travelEnd)', () => {
    const q = MOVES.slots.q.cast;
    const castS = 10;
    const anchors = newAnchors();
    anchors[ANCHOR_INDEX.cast] = castS;
    anchors[ANCHOR_INDEX.release] = castS;
    anchors[ANCHOR_INDEX.contact] = castS;
    anchors[ANCHOR_INDEX.travelEnd] = castS + T.slots.q.dashTicks * TICK_S;
    const w = new TimeWarp();
    w.build(q, anchors, castS - 0.2);
    expect(w.time(castS + T.slots.q.dashTicks * TICK_S)).toBeCloseTo(m(q, 'land'), 6);
    expect(w.time(castS + 2 * TICK_S)).toBeLessThan(m(q, 'land') - 0.1);
  });

  it('the basic combo cycles A → B → C by the clock combo index', () => {
    const ctx = { comboIndex: 0 } as unknown as MoveCtx;
    const ids: string[] = [];
    for (let n = 0; n < 4; n++) {
      (ctx as { comboIndex: number }).comboIndex = n;
      ids.push(MOVES.basicPick!(ctx)!.id);
    }
    expect(ids).toEqual(['meatball.basicA', 'meatball.basicB', 'meatball.basicC', 'meatball.basicA']);
  });

  it('render constants: the measured top, his element accent, a ring wide enough for the ball', () => {
    // per-hero visual size (render/chars/heroSize.ts): the drawn top is the authored one × his build height
    expect(HERO_TOP.meatball).toBeCloseTo(TOP * HERO_BUILD.meatball.h, 2);
    expect(ACCENT).toBeNull();
    expect(RING).toBeGreaterThan(2);
    expect(HEIGHT).toBe(2.5);
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

/** Meatball is 0 at the origin; ally 1 at (−4, 0); enemy 3 at (3, 0). */
function fakeFx(rel: 'own' | 'enemy' = 'own', talents: string[] = []) {
  const spawned: Spawned[] = [];
  const ribbons: { width: number; color: number }[] = [];
  let now = 0;
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 1: { x: -4, z: 0 }, 3: { x: 3, z: 0 } };
  const status: Record<number, HeroStatus> = {};
  const relOf = (id: number) => (id === 0 ? rel : id === 1 ? (rel === 'own' ? 'ally' : 'enemy') : rel === 'own' ? 'enemy' : 'ally');
  const fx = {
    tier: 'high',
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o }, at: now }), spawned.length) },
    ribbons: { point: (_s: unknown, color: number, width: number) => (ribbons.push({ width, color }), ribbons.length), feed: () => {}, end: () => {} },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: relOf,
    rim: (id: number) => (relOf(id) === 'enemy' ? 0xff3040 : 0xffd34d),
    abil: (id: number, slot: 'q' | 'w' | 'e' | 'r' | 'passive') => (id === 0 ? abilNumbers('meatball', slot, talents) : pos[id] ? abilNumbers('clem', slot) : {}),
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
      out.hp = st.hp;
      out.maxHp = st.maxHp;
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

const cast = (slot: number, x = 6000, y = 0) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target: -1 });
const ctx = {} as MoveCtx;

describe('meatball skill FX', () => {
  beforeEach(() => resetMeatballFx());

  it('owns every slot and the passive', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toEqual({ q: true, w: true, e: true, r: true, basic: false, passive: true });
  });

  it('Q: the grass skid is exactly the touch zone wide and ends with the roll', () => {
    for (const [talents, ticks] of [[[], 9], [['hungry-roll'], 12]] as const) {
      resetMeatballFx();
      const f = fakeFx('own', [...talents]);
      SKILL_FX.onCast!(cast(0), f.fx, ctx);
      expect(f.ribbons[0].width).toBeCloseTo((2 * abilNumbers('meatball', 'q').touch) / 1000, 9);
      f.step((ticks - 1) * TICK_S);
      expect(meatballFxLive()).toBe(1);
      f.step(3 * TICK_S);
      expect(meatballFxLive()).toBe(0);
    }
  });

  it('W: the sleepy ring at exactly the charm radius, pulses only while the loaf lasts (Long Loaf too)', () => {
    for (const [talents, dur] of [[[], 60], [['long-loaf'], 75]] as const) {
      resetMeatballFx();
      const f = fakeFx('own', [...talents]);
      SKILL_FX.onCast!(cast(1, 0, 0), f.fx, ctx);
      const R = abilNumbers('meatball', 'w').radius / 1000;
      expect(f.spawned.some((s) => s.kind === 'ring' && Math.abs(s.o.sx - R) < 1e-9)).toBe(true);
      f.step(4);
      const pulses = f.spawned.filter((s) => s.kind === 'ring' && Math.abs(s.o.sx - R) < 1e-9);
      expect(pulses.length).toBeGreaterThan(2);
      for (const p of pulses) expect(p.at + p.o.life).toBeLessThanOrEqual(dur * TICK_S + 0.55 + 1e-6);
      expect(meatballFxLive()).toBe(0);
    }
  });

  it('E: the shield bubble and the push ring land on the ally nearest the aim, at exactly the push radius; alone, on himself', () => {
    const f = fakeFx('own');
    SKILL_FX.onCast!(cast(2, -4200, 300), f.fx, ctx);
    expect(f.spawned.some((s) => s.kind === 'dome')).toBe(false);
    f.step(0.4);
    const dome = f.spawned.find((s) => s.kind === 'dome')!;
    expect(dome.o.x).toBeCloseTo(-4, 6);
    const R = abilNumbers('meatball', 'e').radius / 1000;
    const ring = f.spawned.find((s) => s.kind === 'ring' && Math.abs(s.o.sx - R) < 1e-9)!;
    expect(ring.o.x).toBeCloseTo(-4, 6);
    // the landing is the sim's: the dash to the friend (4 m − radii − gap) plus the kit step
    const hop = travelTicks(4000 - 1000 - 300, DASH_SPEED) + 1;
    expect(Math.abs(dome.at - hop * TICK_S)).toBeLessThanOrEqual(FRAME + 1e-9);
    f.step(3);
    expect(meatballFxLive()).toBe(0);
    // aimed far from anyone: a bubble on himself, no push ring
    resetMeatballFx();
    const g = fakeFx('own');
    SKILL_FX.onCast!(cast(2, 9000, 0), g.fx, ctx);
    g.step(0.5);
    expect(g.spawned.find((s) => s.kind === 'dome')?.o.x).toBeCloseTo(0, 6);
    expect(g.spawned.some((s) => s.kind === 'ring' && Math.abs(s.o.sx - R) < 1e-9)).toBe(false);
  });

  it('R: a leafy wave on each bump during the state only; enemy shapes carry the red rim', () => {
    const f = fakeFx('enemy');
    SKILL_FX.onCast!(cast(3, 0, 0), f.fx, ctx);
    const before = f.spawned.length;
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 10, shielded: 0, kind: 'ability' }, f.fx, ctx);
    expect(f.spawned.slice(before).some((s) => s.kind === 'ring' && Math.abs(s.o.x - 3) < 1e-6)).toBe(true);
    for (const s of f.spawned) {
      expect(s.o.rim).toBe(0xff3040);
      expect(s.o.rel).toBe('enemy');
    }
    f.step(abilNumbers('meatball', 'r').duration * TICK_S + 0.4);
    expect(meatballFxLive()).toBe(0);
    for (const s of f.spawned) expect(s.at + s.o.life).toBeLessThanOrEqual(abilNumbers('meatball', 'r').duration * TICK_S + 0.5);
    // after the state a stray ability hit draws nothing
    const after = f.spawned.length;
    SKILL_FX.onHit!({ type: 'hit', tick: 0, src: 0, dst: 3, amount: 10, shielded: 0, kind: 'ability' }, f.fx, ctx);
    expect(f.spawned.length).toBe(after);
  });

  it('Food Coma: a big shield jump while he is low shows a Zzz bubble until the shield breaks', () => {
    const f = fakeFx('own');
    const max = 780;
    f.status[0] = { buffs: 0, shield: 0, hp: 200, maxHp: max };
    f.step(0.1);
    f.status[0] = { buffs: 0, shield: Math.trunc((max * 1500) / 10000), hp: 200, maxHp: max };
    f.step(0.1);
    const bubbles = () => f.spawned.filter((s) => s.kind === 'dome' && (s.o.y ?? 0) > 2.5).length;
    expect(bubbles()).toBe(1);
    f.step(0.7);
    expect(bubbles()).toBe(2);
    f.status[0] = { buffs: 0, shield: 0, hp: 200, maxHp: max };
    f.step(1.5);
    expect(bubbles()).toBe(2);
    expect(meatballFxLive()).toBe(0);
    // a healthy Meatball gaining a shield (Big Brother alone) is no nap
    resetMeatballFx();
    const g = fakeFx('own');
    g.status[0] = { buffs: 0, shield: 0, hp: 700, maxHp: max };
    g.step(0.1);
    g.status[0] = { buffs: 0, shield: 200, hp: 700, maxHp: max };
    g.step(0.5);
    expect(g.spawned.filter((s) => s.kind === 'dome').length).toBe(0);
  });
});
