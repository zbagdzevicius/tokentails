/**
 * The sim v15 dogs' move sets and skill FX (DOGS-V15 §1, lane RENDER): every dog is filled (no stub art left), each
 * clip binds to the sim timings (basic contact or release, dashes on travelEnd, windups on windupStart), compiles on
 * its own rig, keeps the root caps, and the viral moments are wired: Rocket's roach nap for the `clip` event 'zzz'
 * (his own lying pose, held for the 18 t nap), Frankie's dig form hold (additive, only while untargetable, so the
 * FOOTLONG flight keeps him drawn) and his grab for 'footlong', Domino's dot-to-dot drawn nearest first through the
 * heroes the R hit on its cast tick. The skill FX draw at the sim's own radii.
 */
import { describe, expect, it } from 'vitest';
import type { HeroId } from '../../src/sim/api';
import { BuffFlag } from '../../src/sim/api';
import { makeHero, HERO_BUILD, HERO_TOP } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, SIM_TIMING, TICK_S, abilNumbers } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { HERO_ANIM } from '../../src/render/anim/registry';
import type { ClipDef, FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, MoveSet, SkillFxSet } from '../../src/render/anim/types';
import { NAP_S, ROACH, ROCKET_CLIPS } from '../../src/render/moves/rocket';
import { DIG_SCALE, FRANKIE_CLIPS } from '../../src/render/moves/frankie';
import { DOMINO_CLIPS } from '../../src/render/moves/domino';
import * as ROCKET from '../../src/render/chars/heroes/rocket';
import * as FRANKIE from '../../src/render/chars/heroes/frankie';
import * as DOMINO from '../../src/render/chars/heroes/domino';
import { spotPips } from '../../src/ui/overhead';

const FRAME = 1 / 60;
const DOGS = ['rocket', 'frankie', 'domino'] as const;
const CLIPS: Record<(typeof DOGS)[number], readonly ClipDef[]> = { rocket: ROCKET_CLIPS, frankie: FRANKIE_CLIPS, domino: DOMINO_CLIPS };
const MODS = { rocket: ROCKET, frankie: FRANKIE, domino: DOMINO } as const;
const moves = async (h: HeroId): Promise<MoveSet> => (await HERO_ANIM[h].moves()).MOVES;
const fxOf = async (h: HeroId): Promise<SkillFxSet> => (await HERO_ANIM[h].fx()).SKILL_FX;

describe('sim v15 dog moves', () => {
  for (const h of DOGS) {
    it(`${h}: filled, basics on the windup, dashes on travelEnd, windups on windupStart`, async () => {
      const m = await moves(h);
      const T = SIM_TIMING[h];
      expect(m.stub).toBe(false);
      expect(m.basic.length).toBeGreaterThanOrEqual(2);
      for (const c of m.basic) {
        expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S), c.id).toBeLessThanOrEqual(FRAME);
        expect(c.warp.some(([k, a]) => k === 'contact' && a === (T.ranged ? 'release' : 'contact')), c.id).toBe(true);
      }
      for (const s of ['q', 'w', 'e', 'r'] as const) {
        const c = m.slots[s].cast;
        if (T.slots[s].dashMm > 0) expect(c.warp.some(([, a]) => a === 'travelEnd'), c.id).toBe(true);
        if (T.slots[s].windup > 0) {
          expect(c.warp.some(([, a]) => a === 'windupStart'), c.id).toBe(true);
          expect((c.markers.contact ?? 0) - (c.markers.coil ?? 0)).toBeCloseTo(T.slots[s].windup * TICK_S, 6);
        }
      }
    });

    it(`${h}: every clip compiles on its rig with finite values and keeps the root caps`, () => {
      const ch = makeHero(h, 0, null, { detail: 0.62 });
      for (const c of CLIPS[h]) {
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
        for (const [, v] of r.up ?? []) {
          expect(v, `${c.id} up`).toBeGreaterThanOrEqual(0);
          expect(v, `${c.id} up`).toBeLessThanOrEqual(ROOT_CAPS.upClip);
        }
      }
      ch.dispose();
    });

    it(`${h}: the drawn top is the measured one`, () => {
      const mod = MODS[h];
      expect(HERO_TOP[h]).toBeCloseTo(mod.TOP * HERO_BUILD[h].h, 2);
      expect(mod.RING).toBe(HERO_BUILD[h].ring);
    });
  }

  it('the sizes read: Rocket is the tallest of the new dogs (over Howler), Frankie the lowest hero', () => {
    const dogs: HeroId[] = ['nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino'];
    expect(Math.max(...dogs.map((h) => HERO_TOP[h]))).toBe(HERO_TOP.rocket);
    expect(HERO_TOP.rocket).toBeGreaterThan(HERO_TOP.howler);
    expect(HERO_TOP.rocket).toBeLessThan(HERO_TOP.brutus);
    expect(Math.min(...Object.values(HERO_TOP))).toBe(HERO_TOP.frankie);
  });

  it('Rocket: the zzz clip is his roach pose, held through the 18 t nap, with a whole spin into it', async () => {
    const m = await moves('rocket');
    const zzz = m.clips?.zzz;
    expect(zzz).toBeDefined();
    expect(NAP_S).toBeCloseTo((abilNumbers('rocket', 'r').nap ?? 0) * TICK_S, 9);
    expect(zzz!.len).toBeGreaterThanOrEqual(NAP_S);
    expect(ROCKET.POSES[ROACH]?.body?.r?.[0]).toBeCloseTo(-Math.PI / 2, 6);
    const lying = zzz!.keys.filter((k) => k[1] === ROACH).map((k) => k[0]);
    expect(Math.max(...lying) - Math.min(...lying)).toBeGreaterThanOrEqual(NAP_S - 0.25);
    expect(zzz!.root?.yaw?.some(([, v]) => v === 1)).toBe(true);
    expect(zzz!.cues?.some(([, kind, arg]) => kind === 'fx' && arg === 'rk:zzz')).toBe(true);
  });

  it('Frankie: the dig hides him (additive, near zero) only while he is untargetable; the grab clip plays for footlong', async () => {
    const m = await moves('frankie');
    expect(m.formHold?.mode).toBe('additive');
    expect(m.formHold?.root?.sx?.[0][1]).toBe(DIG_SCALE);
    expect(DIG_SCALE).toBeLessThan(0.1);
    const ctx = { buffs: BuffFlag.Untargetable, form: true, comboIndex: 0 } as unknown as MoveCtx;
    expect(m.formHoldWhen?.(ctx)).toBe(true);
    (ctx as { buffs: number }).buffs = 0;
    // the FOOTLONG flight sets the form bit too, and keeps him drawn
    expect(m.formHoldWhen?.(ctx)).toBe(false);
    expect(m.clips?.footlong).toBeDefined();
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

/** The dog is 0 at the origin, enemy cats 3 at (3, 0), 4 at (6, 1) and 5 at (1, 4). */
function fakeFx(hero: HeroId) {
  const spawned: { kind: MeshFxKind; o: MeshFxSpawn }[] = [];
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 3, z: 0 }, 4: { x: 6, z: 1 }, 5: { x: 1, z: 4 } };
  const fx = {
    tier: 'high',
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (spawned.push({ kind, o: { ...o } }), spawned.length) },
    ribbons: { point: () => 1, feed: () => {}, end: () => {} },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    relation: (id: number) => (id === 0 ? 'own' : 'enemy'),
    rim: () => 0xffd34d,
    abil: (id: number, slot: 'q' | 'w' | 'e' | 'r' | 'passive') => (id === 0 ? abilNumbers(hero, slot) : abilNumbers('clem', slot)),
    heroPos: (id: number, out: { x: number; y: number; z: number }) => {
      const p = pos[id];
      if (!p) return false;
      out.x = p.x;
      out.y = 0;
      out.z = p.z;
      return true;
    },
    bonePos: () => false,
    facing: (_id: number, out: { x: number; y: number; z: number }) => ((out.x = 1), (out.y = 0), (out.z = 0), true),
  } as unknown as FxCtx;
  return { fx, spawned };
}
const cast = (slot: number, x = 4000, y = 0, tick = 0) => ({ type: 'cast' as const, tick, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target: -1 });
const windup = (slot: number, ticks: number, x = 4000, y = 0) => ({ type: 'windup' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, ticks });
const hit = (dst: number, tick = 0) => ({ type: 'hit' as const, tick, src: 0, dst, amount: 120, shielded: 0, kind: 'ability' as const });
const ctx = { form: false, buffs: 0, resource: 0 } as unknown as MoveCtx;

describe('sim v15 dog skill FX', () => {
  for (const h of DOGS) {
    it(`${h}: owns all four slots, every cast and update draws without throwing`, async () => {
      const fxs = await fxOf(h);
      expect(fxs.stub).toBe(false);
      expect([fxs.owns.q, fxs.owns.w, fxs.owns.e, fxs.owns.r]).toEqual([true, true, true, true]);
      const f = fakeFx(h);
      for (let s = 0; s < 4; s++) fxs.onCast?.(cast(s), f.fx, ctx);
      for (let i = 0; i < 120; i++) fxs.update?.(FRAME, f.fx);
      expect(f.spawned.length).toBeGreaterThan(0);
    });
  }

  it('Rocket: the SQUIRREL! telegraph is exactly the sim radius for the windup', async () => {
    const f = fakeFx('rocket');
    const a = abilNumbers('rocket', 'e');
    (await fxOf('rocket')).onWindup!(windup(2, a.windup), f.fx);
    const ring = f.spawned.find((s) => s.kind === 'ring')!;
    expect(ring.o.sx).toBeCloseTo(a.radius / 1000, 9);
    expect(ring.o.life).toBeGreaterThanOrEqual(a.windup * TICK_S);
  });

  it('Frankie: the dig pop ring is exactly the sim radius, on the untargetable edge after a dig only', async () => {
    const fxs = await fxOf('frankie');
    const f = fakeFx('frankie');
    // any earlier dig is long over (its 2 s failsafe)
    for (let i = 0; i < 180; i++) fxs.update!(FRAME, f.fx);
    f.spawned.length = 0;
    fxs.onStatus!(0, 0, BuffFlag.Untargetable, f.fx);
    expect(f.spawned.length).toBe(0);
    fxs.onCast!(cast(1), f.fx, ctx);
    const before = f.spawned.length;
    fxs.onStatus!(0, 0, BuffFlag.Untargetable, f.fx);
    const ring = f.spawned.slice(before).find((s) => s.kind === 'ring')!;
    expect(ring.o.sx).toBeCloseTo(abilNumbers('frankie', 'w').radius / 1000, 9);
  });

  it('Domino: CONNECT THE DOTS! links the heroes hit on the cast tick, nearest first from the last link', async () => {
    const fxs = await fxOf('domino');
    const f = fakeFx('domino');
    fxs.onCast!(cast(3, 0, 0, 50), f.fx, ctx);
    // hit order is not path order: 4 (far), 5, 3 (nearest Domino)
    for (const d of [4, 5, 3]) fxs.onHit!(hit(d, 50), f.fx, ctx);
    fxs.update!(0.05, f.fx);
    const beams = f.spawned.filter((s) => s.kind === 'beam');
    expect(beams).toHaveLength(3);
    // Domino (0,0) → 3 (3,0) → 4 (6,1) → 5 (1,4): each link starts where the last one ended
    expect([beams[0].o.x, beams[0].o.z]).toEqual([0, 0]);
    expect([beams[1].o.x, beams[1].o.z]).toEqual([3, 0]);
    expect([beams[2].o.x, beams[2].o.z]).toEqual([6, 1]);
    expect(beams[0].o.sx).toBeCloseTo(3, 9);
    expect(beams.map((b) => b.o.delay)).toEqual([0, 0.1, 0.2]);
  });

  it('Domino: a hit on another tick is a Spot, not a dot-to-dot link', async () => {
    const fxs = await fxOf('domino');
    const f = fakeFx('domino');
    fxs.onCast!(cast(3, 0, 0, 60), f.fx, ctx);
    fxs.onHit!(hit(3, 61), f.fx, ctx);
    fxs.update!(0.05, f.fx);
    expect(f.spawned.filter((s) => s.kind === 'beam')).toHaveLength(0);
  });

  it('Spot pips: from the snapshot dots on any live hero, capped at 4', () => {
    expect(spotPips({ kind: 'hero', dots: 2, state: 'idle' })).toBe(2);
    expect(spotPips({ kind: 'hero', dots: 9, state: 'idle' })).toBe(4);
    expect(spotPips({ kind: 'hero', dots: 3, state: 'dead' })).toBe(0);
    expect(spotPips({ kind: 'minion', dots: 3, state: 'idle' })).toBe(0);
    expect(spotPips({ kind: 'hero', state: 'idle' })).toBe(0);
  });
});
