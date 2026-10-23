/**
 * Sage move set and skill FX (ANIM-SPEC §14 "Sage"): every clip binds to the sim timings (basic release, Hop Back
 * travel, Sun Snare arm, Moonshot windup), compiles on her rig inside the root caps, full turns never unwind in the
 * blend-out, the Steady Paw pick predicts the 4th basic without allocating, and the skill FX use the sim shapes
 * (arrow count, arc, range and speed; trap radius and arm; ult line) and never draw traps for enemies.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeHero } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, SIM_TIMING, TICK_S, abilNumbers } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { ANCHOR_INDEX, newAnchors, Prio, type ClipDef, type FxCtx, type MeshFxKind, type MeshFxSpawn, type MoveCtx, type Slot } from '../../src/render/anim/types';
import { MOVES, SAGE_CLIPS, SAGE_SPANS, STEADY } from '../../src/render/moves/sage';
import { SKILL_FX, resetSageFx } from '../../src/render/skillfx/sage';
import { PROJECTILE_KIND } from '../../src/data/towers';
import { HEROES } from '../../src/data/heroes';

const FRAME = 1 / 60;
const T = SIM_TIMING.sage;

describe('sage moves', () => {
  it('is filled and every attack binds to its sim anchor', () => {
    expect(MOVES.stub).toBe(false);
    // A B C A BL C: the side hop alternates sides every combo cycle
    expect(MOVES.basic.map((c) => c.id)).toEqual(['sage.basicA', 'sage.basicB', 'sage.basicC', 'sage.basicA', 'sage.basicBL', 'sage.basicC']);
    const sideB = SAGE_CLIPS.basicB.root?.side ?? [];
    const sideBL = SAGE_CLIPS.basicBL.root?.side ?? [];
    expect(Math.max(...sideB.map((k) => k[1]))).toBeCloseTo(0.3, 9);
    expect(Math.min(...sideBL.map((k) => k[1]))).toBeCloseTo(-0.3, 9);
    for (const c of [...MOVES.basic, SAGE_CLIPS.steady]) {
      expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S), c.id).toBeLessThanOrEqual(FRAME);
      expect(c.warp).toEqual([['contact', 'release']]);
      // hands over before the next swing starts
      expect(c.len, c.id).toBeLessThan(T.period * TICK_S);
      expect(c.prio).toBe(Prio.Basic);
    }
    // instant casts pin contact on the cast tick
    for (const c of [MOVES.slots.q.cast, MOVES.slots.q.branch!, MOVES.slots.w.cast]) expect(c.warp[0]).toEqual(['contact', 'cast']);
    expect(MOVES.slots.q.branch?.id).toBe('sage.qLance');
  });

  it('Sun Snare: the toss on the cast, the twirl done by PEEK + 0.2; the arm (15 t) is the skill FX, past the hand-over', () => {
    const w = MOVES.slots.w.cast;
    expect(w.warp).toEqual([['contact', 'cast']]);
    expect(T.slots.w.arm).toBe(15);
    const yaw = w.root?.yaw ?? [];
    const full = yaw.find((k) => k[1] === 1);
    expect((full?.[0] ?? 9) - SAGE_SPANS.peek).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(w.len - (w.blendOut ?? 0)).toBeLessThan((w.markers.contact ?? 0) + T.slots.w.arm * TICK_S);
  });

  it('every ability hands over by cast + 0.25 s, so a woven basic is never refused for long', () => {
    for (const c of [MOVES.slots.q.cast, MOVES.slots.q.branch!, MOVES.slots.w.cast, MOVES.slots.e.cast, MOVES.slots.r.cast]) {
      const handover = c.len - (c.blendOut ?? 0.12) - (c.markers.contact ?? NaN);
      expect(handover, c.id).toBeLessThanOrEqual(SAGE_SPANS.handover + 0.02 + 1e-9);
    }
  });

  it('a basic woven 3 ticks after a cast plays sage.basic* by its release (refused only inside the hand-over)', () => {
    const ch = makeHero('sage', 0, null, { detail: 0.62 });
    const stack = ch.anim.stack;
    const W = BASIC_WINDUP * TICK_S;
    const cases: [ClipDef, number][] = [
      [MOVES.slots.q.cast, 0],
      [MOVES.slots.q.branch!, 0],
      [MOVES.slots.w.cast, 0],
      [MOVES.slots.r.cast, SAGE_SPANS.moonWind],
    ];
    for (const [ability, windup] of cases) {
      for (const lagTicks of [3, 8]) {
        stack.reset();
        const t0 = 1;
        const castAt = t0 + windup + SAGE_SPANS.peek;
        const a = newAnchors();
        a[ANCHOR_INDEX.windupStart] = t0;
        a[ANCHOR_INDEX.cast] = castAt;
        let now = windup > 0 ? t0 : castAt - SAGE_SPANS.peek;
        stack.update(now, 0);
        expect(stack.play(ability, { anchors: a })).toBe(true);
        const swingAt = castAt + lagTicks * TICK_S;
        const releaseAt = swingAt + W;
        const b = newAnchors();
        b[ANCHOR_INDEX.swingStart] = swingAt;
        b[ANCHOR_INDEX.contact] = b[ANCHOR_INDEX.release] = releaseAt;
        let tried = false;
        let retried = false;
        let fromStart = false;
        for (; now < releaseAt + 0.1; now += FRAME) {
          stack.update(now, FRAME);
          // the director: the swing at its start; a refused one replays impact-led on the bolt (ClockOut.ImpactLed)
          if (!tried && now >= swingAt) {
            tried = true;
            fromStart = stack.play(SAGE_CLIPS.basicA, { anchors: b });
          }
          if (tried && !fromStart && !retried && now >= releaseAt) {
            retried = true;
            expect(stack.play(SAGE_CLIPS.basicA, { anchors: b }), `${ability.id} +${lagTicks}t retry`).toBe(true);
          }
        }
        expect(stack.current()?.bin?.id, `${ability.id} +${lagTicks}t`).toMatch(/^sage\.(basic|steady)/);
        // a swing started past the hand-over keeps its whole draw
        if (lagTicks * TICK_S >= SAGE_SPANS.handover + 0.02) expect(fromStart, `${ability.id} +${lagTicks}t from the start`).toBe(true);
      }
    }
    ch.dispose();
  });

  it('Hop Back: take-off on the cast, landing on travelEnd after the 5 dash ticks, apex 0.95 m', () => {
    const e = MOVES.slots.e.cast;
    expect(e.warp).toEqual([['takeoff', 'cast'], ['land', 'travelEnd']]);
    expect(T.slots.e.dashTicks).toBe(5);
    expect((e.markers.land ?? NaN) - (e.markers.takeoff ?? NaN)).toBeCloseTo(T.slots.e.dashTicks * TICK_S, 9);
    expect(Math.max(...(e.root?.up ?? []).map((k) => k[1]))).toBeCloseTo(0.95, 9);
    // a backflip: one full turn backwards, 0.9 of it by the landing
    const pitch = e.root?.pitch ?? [];
    const land = pitch.find((k) => Math.abs(k[0] - (e.markers.land ?? NaN)) < 1e-9);
    expect(land?.[1]).toBeCloseTo(-0.9, 9);
    expect(Math.min(...pitch.map((k) => k[1]))).toBe(-1);
  });

  it('Moonshot: coil on windupStart, release on the cast 30 t later, charge markers inside the windup', () => {
    const r = MOVES.slots.r.cast;
    expect(r.prio).toBe(Prio.Ult);
    expect(r.warp).toEqual([['coil', 'windupStart'], ['contact', 'cast']]);
    expect(T.slots.r.windup).toBe(30);
    expect((r.markers.contact ?? NaN) - (r.markers.coil ?? NaN)).toBeCloseTo(SAGE_SPANS.moonWind, 9);
    expect(SAGE_SPANS.moonWind).toBeCloseTo(30 * TICK_S, 9);
    expect(r.markers.charge1).toBeLessThan(r.markers.charge2);
    expect(r.markers.charge2).toBeLessThan(r.markers.contact ?? 0);
  });

  it('every clip compiles on her rig, keeps the root caps and never unwinds a full turn', () => {
    const ch = makeHero('sage', 0, null, { detail: 0.62 });
    for (const c of Object.values(SAGE_CLIPS)) {
      const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
      for (let i = 0; i < bin.q.length; i++) expect(Number.isFinite(bin.q[i]), c.id).toBe(true);
      for (let i = 0; i < bin.p.length; i++) expect(Number.isFinite(bin.p[i]), c.id).toBe(true);
      const r = c.root ?? {};
      const dead = c.prio === Prio.Death;
      for (const k of ['fwd', 'side'] as const) {
        const ks = r[k];
        if (!ks) continue;
        for (const [, v] of ks) expect(Math.abs(v), `${c.id} ${k}`).toBeLessThanOrEqual(dead ? ROOT_CAPS.horizDead : ROOT_CAPS.horiz);
        if (!dead) expect(ks[ks.length - 1][1], `${c.id} ${k} ends at 0`).toBe(0);
      }
      for (const [, v] of r.up ?? []) expect(v >= 0 && v <= ROOT_CAPS.upClip, `${c.id} up`).toBe(true);
      // the blend-out scales the root by the weight: a held full turn would visibly unwind, so it wraps to 0
      if (!dead)
        for (const k of ['yaw', 'pitch', 'roll'] as const) {
          const ks = r[k];
          if (ks) expect(ks[ks.length - 1][1], `${c.id} ${k} ends at 0`).toBe(0);
        }
      // §9 rule 6: a full spin lasts ≤ 0.3 s (the wrap step is instant)
      for (const k of ['yaw', 'pitch'] as const) {
        const ks = r[k] ?? [];
        for (let i = 1; i < ks.length; i++)
          if (Math.abs(ks[i][1] - ks[i - 1][1]) >= 0.5 && ks[i][2] !== 'step' && k === 'yaw') expect(ks[i][0] - ks[i - 1][0], `${c.id} spin`).toBeLessThanOrEqual(0.3 + 1e-9);
      }
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i][0], c.id).toBeGreaterThanOrEqual(c.keys[i - 1][0]);
      expect(c.keys[c.keys.length - 1][0], c.id).toBeLessThanOrEqual(c.len + 1e-9);
      for (const m of Object.values(c.markers)) expect(m >= 0 && m <= c.len + 1e-9, c.id).toBe(true);
    }
    ch.dispose();
  });

  it('landings leave the squash to RootState: no authored sy squash where the root lands', () => {
    for (const c of [SAGE_CLIPS.respawn, SAGE_CLIPS.victory, SAGE_CLIPS.emote, SAGE_CLIPS.levelUp]) {
      const up = c.root?.up ?? [];
      for (let i = 1; i < up.length; i++) {
        if (!(up[i - 1][1] > 0.12 && up[i][1] === 0)) continue;
        const land = up[i][0];
        for (const [t, v] of c.root?.sy ?? []) if (Math.abs(t - land) <= 0.2) expect(v, `${c.id} sy at ${t}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('Death: the knees buckle before the fall, the thud lands with the back (not the last frame)', () => {
    const d = SAGE_CLIPS.death;
    const buckle = d.keys.find((k) => Math.abs(k[0] - 0.6) < 1e-9);
    expect(buckle?.[2]?.kneeL?.[0]).toBeGreaterThanOrEqual(1.4);
    expect(d.keys[d.keys.length - 1][3]).not.toBe('in');
    const land = d.cues?.find((c) => c[1] === 'land');
    expect(d.markers[land?.[0] as string] ?? land?.[0]).toBeCloseTo(0.75, 9);
  });

  it('Steady Paw: the knee-drop shot is picked for every 4th basic, without allocating', () => {
    const ctx = { hero: 'sage', id: 2, branch: false, talents: [], comboIndex: 0, recastIndex: 0, basicCount: 0, charged: false, resource: 0, buffs: 0, stealthed: false, ultActive: false, targetBehind: false, targetCc: false } as MoveCtx;
    const pick = MOVES.basicPick!;
    const n = HEROES.sage.passive.everyNth ?? 4;
    STEADY[2] = 0;
    const got: (string | null)[] = [];
    for (let i = 0; i < n * 2; i++) {
      got.push(pick(ctx)?.id ?? null);
      // the FX counts every own hero bolt; the pierce bolt resyncs to 0
      if (STEADY[2] % n === n - 1) SKILL_FX.onProjectile!(2, PROJECTILE_KIND.pierce, 0, fakeFx().fx);
      else SKILL_FX.onProjectile!(2, PROJECTILE_KIND.hero, 0, fakeFx().fx);
    }
    expect(got).toEqual([null, null, null, 'sage.steady', null, null, null, 'sage.steady']);
    STEADY[2] = n - 1;
    expect(pick(ctx)).toBe(pick(ctx));
    // out-of-range ids never pick
    expect(pick({ ...ctx, id: 99 })).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

interface Spawned {
  kind: MeshFxKind;
  o: MeshFxSpawn;
  at: number;
}

function fakeFx(rel: 'own' | 'enemy' = 'own', branch = false, talents: string[] = []) {
  const spawned: Spawned[] = [];
  const ribbons: { slot: number; color: number; width: number; feeds: [number, number, number][]; ended: number }[] = [];
  let now = 0;
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 5, z: 0 } };
  const fx = {
    tier: 'high',
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o }, at: now }), spawned.length) },
    ribbons: {
      point: (_s: unknown, color: number, width: number) => (ribbons.push({ slot: ribbons.length, color, width, feeds: [], ended: -1 }), ribbons.length - 1),
      feed: (slot: number, x: number, y: number, z: number) => ribbons[slot].feeds.push([x, y, z]),
      end: (slot: number) => (ribbons[slot].ended = now),
    },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? rel : 'enemy'),
    rim: (id: number) => (id === 0 && rel === 'own' ? 0xffd34d : 0xff3040),
    abil: (_id: number, slot: Slot) => abilNumbers('sage', slot, talents, branch),
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
  return { fx, spawned, ribbons, step };
}

const cast = (slot: number, x = 5000, y = 0) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target: 0xff });
const ctx = (branch = false) => ({ comboIndex: 0, branch }) as MoveCtx;

describe('sage skill FX', () => {
  beforeEach(() => resetSageFx());

  it('owns every slot it draws', () => {
    expect(SKILL_FX.stub).toBe(false);
    expect(SKILL_FX.owns).toMatchObject({ q: true, w: true, e: true, r: true });
  });

  it('Volley: one ribbon per arrow across the exact arc, flying at the arrow speed to the 7 m range', () => {
    for (const talents of [[], ['wide-volley']]) {
      const f = fakeFx('own', false, talents);
      SKILL_FX.onCast!(cast(0), f.fx, ctx());
      const a = abilNumbers('sage', 'q', talents);
      expect(f.ribbons.length).toBe(a.arrows);
      const fan = f.spawned.find((s) => s.kind === 'crescent');
      expect(fan?.o.p0).toBeCloseTo((a.arc / 4096) * Math.PI * 2, 9);
      f.step(0.2);
      // after 0.2 s every arrow is speed × 0.2 out (±1 frame)
      for (const r of f.ribbons) {
        const [x, , z] = r.feeds[r.feeds.length - 1];
        expect(Math.abs(Math.hypot(x, z) - (a.speed / 1000) * 0.2)).toBeLessThanOrEqual((a.speed / 1000) * FRAME + 1e-6);
      }
      f.step(1);
      for (const r of f.ribbons) {
        expect(r.ended).toBeGreaterThan(0);
        const [x, , z] = r.feeds[r.feeds.length - 1];
        expect(Math.hypot(x, z)).toBeCloseTo(a.range / 1000, 5);
        // range / speed = 0.35 s of flight
        expect(r.ended).toBeLessThanOrEqual(a.range / a.speed + FRAME + 1e-9);
      }
      // the edge arrows sit on the arc edges
      const half = ((a.arc / 4096) * Math.PI * 2) / 2;
      const ang = f.ribbons.map((r) => Math.atan2(-r.feeds[0][2], r.feeds[0][0]));
      expect(Math.min(...ang)).toBeCloseTo(-half, 4);
      expect(Math.max(...ang)).toBeCloseTo(half, 4);
    }
  });

  it('Piercing Shot (branch): one spear ribbon, 9 m at 24 m/s, the lance width', () => {
    const f = fakeFx('own', true);
    SKILL_FX.onCast!(cast(0), f.fx, ctx(true));
    expect(f.ribbons.length).toBe(1);
    const a = abilNumbers('sage', 'q', [], true);
    expect(a.range).toBe(9000);
    expect(f.ribbons[0].width).toBeCloseTo(a.width / 1000, 9);
    f.step(1);
    const [x] = f.ribbons[0].feeds[f.ribbons[0].feeds.length - 1];
    expect(x).toBeCloseTo(9, 5);
    expect(f.ribbons[0].ended).toBeLessThanOrEqual(a.range / a.speed + FRAME + 1e-9);
  });

  it('Piercing Shot: only a short muzzle beam on the cast; the line grows with the lance head and the slash comes at the range', () => {
    const f = fakeFx('own', true);
    const glyphs: number[] = [];
    (f.fx as unknown as { linger: { add: () => void } }).linger.add = () => void glyphs.push(1);
    SKILL_FX.onCast!(cast(0), f.fx, ctx(true));
    const a = abilNumbers('sage', 'q', [], true);
    const speed = a.speed / 1000;
    for (const b of f.spawned.filter((s) => s.kind === 'beam')) expect(b.o.sx).toBeLessThanOrEqual(1.5);
    expect(glyphs.length).toBe(0);
    const n = f.spawned.length;
    f.step(0.6);
    const grown = f.spawned.slice(n).filter((s) => s.kind === 'beam');
    expect(grown.length).toBeGreaterThan(2);
    // never ahead of the real lance head (± a frame)
    for (const b of grown) expect(b.o.sx).toBeLessThanOrEqual(speed * b.at + speed * FRAME + 1e-6);
    expect(Math.max(...grown.map((b) => b.o.sx))).toBeCloseTo(a.range / 1000, 5);
    expect(glyphs.length).toBe(1);
  });

  it('Moonshot release: a short muzzle, the beam grows with the 60 m/s head to 9 m, small low shocks', () => {
    const f = fakeFx();
    const shocks: { r1: number; height: number }[] = [];
    (f.fx as unknown as { shock: { start: (p: unknown, o: { r1: number; height: number }) => null } }).shock.start = (_p, o) => (shocks.push({ ...o }), null);
    SKILL_FX.onCast!(cast(3, 40000, 0), f.fx, ctx());
    for (const b of f.spawned.filter((s) => s.kind === 'beam')) expect(b.o.sx).toBeLessThanOrEqual(1.5);
    expect(shocks[0].r1).toBeLessThanOrEqual(1.6);
    expect(shocks[0].height).toBeLessThanOrEqual(0.3);
    const n = f.spawned.length;
    f.step(0.3);
    const grown = f.spawned.slice(n).filter((s) => s.kind === 'beam');
    for (const b of grown) expect(b.o.sx).toBeLessThanOrEqual(60 * b.at + 60 * FRAME + 1e-6);
    expect(Math.max(...grown.map((b) => b.o.sx))).toBeCloseTo(9, 5);
    SKILL_FX.onHit!({ type: 'hit', tick: 3, src: 0, dst: 3, amount: 200, shielded: 0, kind: 'ability' }, f.fx, ctx());
    expect(shocks[shocks.length - 1].height).toBeLessThanOrEqual(0.5);
  });

  it('Moonshot windup: the twister stays ankle-high (none on Low); the charge moon is the biggest piece, over her head', () => {
    for (const tier of ['low', 'high'] as const) {
      const f = fakeFx();
      (f.fx as unknown as { tier: string }).tier = tier;
      SKILL_FX.onWindup!({ type: 'windup', tick: 0, src: 0, slot: 3, x: 40000, y: 0, ticks: 30 }, f.fx);
      f.step(0.5);
      const tw = f.spawned.filter((s) => s.kind === 'twister');
      if (tier === 'low') expect(tw.length).toBe(0);
      for (const t of tw) expect(t.o.sy).toBeLessThanOrEqual(0.25);
      const n = f.spawned.length;
      SKILL_FX.onMarker!(0, 'sage.r', 'charge1', f.fx);
      const moon = f.spawned.slice(n).find((s) => s.kind === 'glow');
      expect(moon?.o.sx).toBeGreaterThan(Math.max(...f.spawned.slice(0, n).map((s) => s.o.sx)));
      expect(moon?.o.y).toBeGreaterThanOrEqual(1.7);
    }
  });

  it('Sun Snare: the flower fits the trap radius and unfolds over exactly the arm; never drawn for enemies', () => {
    const f = fakeFx('own');
    SKILL_FX.onCast!(cast(1, 4000, 0), f.fx, ctx());
    const arm = T.slots.w.arm * TICK_S;
    const petals = f.spawned.filter((s) => s.kind === 'crescent');
    expect(petals.length).toBe(6);
    for (const p of petals) {
      expect(p.o.sx).toBeCloseTo(abilNumbers('sage', 'w').radius / 1000, 9);
      expect(p.o.x).toBeCloseTo(4, 9);
      // unfolding from the lob's landing to exactly the arm
      expect((p.o.life ?? 0) + (p.o.delay ?? 0)).toBeCloseTo(arm, 9);
    }
    // the arm flash fires on the zone's real arm (onZone 'arm'), never on a render timer
    SKILL_FX.onZone!(7, 'spawn', f.fx);
    const before = f.spawned.length;
    f.step(arm);
    expect(f.spawned.slice(before).filter((s) => s.kind === 'glow').length).toBe(0);
    SKILL_FX.onZone!(7, 'arm', f.fx);
    const flash = f.spawned.slice(before).filter((s) => s.kind === 'glow');
    expect(flash.length).toBeGreaterThan(0);
    expect(flash[0].o.x).toBeCloseTo(4, 9);
    const e = fakeFx('enemy');
    SKILL_FX.onCast!(cast(1), e.fx, ctx());
    e.step(1);
    expect(e.spawned.length).toBe(0);
    expect(e.ribbons.length).toBe(0);
  });

  it('Hop Back: the path ribbon follows the snapshot for the dash ticks, never the aim', () => {
    const f = fakeFx();
    SKILL_FX.onCast!(cast(2, -3000, 0), f.fx, ctx());
    expect(f.ribbons.length).toBe(1);
    f.step(1);
    expect(f.ribbons[0].ended).toBeGreaterThan(0);
    expect(f.ribbons[0].ended).toBeLessThanOrEqual(T.slots.e.dashTicks * TICK_S + 0.12 + FRAME + 1e-9);
    // fed from heroPos (0,0): never the cast point
    for (const [x] of f.ribbons[0].feeds) expect(x).toBe(0);
  });

  it('Moonshot: windup wind stays within 1.5 m; the moon ribbon runs the 40 m line at 60 m/s and stops on the hero hit', () => {
    const f = fakeFx();
    SKILL_FX.onWindup!({ type: 'windup', tick: 0, src: 0, slot: 3, x: 40000, y: 0, ticks: 30 }, f.fx);
    for (const s of f.spawned) expect(Math.hypot(s.o.x, s.o.z) + s.o.sx).toBeLessThanOrEqual(1.5 + 0.6 + 1e-9);
    for (const s of f.spawned) expect(s.o.sx).toBeLessThanOrEqual(1.5);
    f.step(1);
    SKILL_FX.onCast!(cast(3, 40000, 0), f.fx, ctx());
    const a = abilNumbers('sage', 'r');
    const moon = f.ribbons[f.ribbons.length - 1];
    expect(moon.width).toBeCloseTo(a.width / 1000, 9);
    f.step(5 / 60);
    const [x] = moon.feeds[moon.feeds.length - 1];
    expect(x).toBeCloseTo((a.speed / 1000) * (5 / 60), 0);
    SKILL_FX.onHit!({ type: 'hit', tick: 3, src: 0, dst: 3, amount: 200, shielded: 0, kind: 'ability' }, f.fx, ctx());
    expect(moon.ended).toBeGreaterThan(0);
  });
});

describe('sage Sun Snare root', () => {
  beforeEach(() => resetSageFx());
  it('a sprung trap (0-damage zone hit) coils the victim for the root time, own team only', () => {
    const f = fakeFx('own');
    SKILL_FX.onCast!(cast(1, 5000, 0), f.fx, ctx());
    f.step(T.slots.w.arm * TICK_S + 0.1);
    const n = f.spawned.length;
    SKILL_FX.onHit!({ type: 'hit', tick: 30, src: 0, dst: 3, amount: 0, shielded: 0, kind: 'zone' }, f.fx, ctx());
    const coil = f.spawned.slice(n).find((s) => s.kind === 'twister');
    expect(coil?.o.x).toBeCloseTo(5, 9);
    expect(coil?.o.life).toBeCloseTo(abilNumbers('sage', 'w').root * TICK_S, 9);
    const e = fakeFx('enemy');
    SKILL_FX.onHit!({ type: 'hit', tick: 30, src: 0, dst: 3, amount: 0, shielded: 0, kind: 'zone' }, e.fx, ctx());
    expect(e.spawned.length).toBe(0);
  });
});
