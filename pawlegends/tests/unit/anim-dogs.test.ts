/**
 * The sim v14 dogs' move sets and skill FX (DOGS-V13 §1, lane RENDER): every dog is filled (no stub art left), each
 * clip binds to the sim timings (basic contact, dashes on travelEnd, windups on windupStart), compiles on its own rig,
 * keeps the root caps, and the viral moments are wired: Nugget's sploot pose, Bravo's flop clip for the `clip` event,
 * Chili's BIG DOG form hold (additive, 1.35×, never in the bag), Howler's inhale over the 21 t windup with the wide
 * mouth, and Marshmallow's ice cube on the frozen cat for the sim freeze. The skill FX draw at the sim's own radii.
 */
import { describe, expect, it } from 'vitest';
import type { HeroId } from '../../src/sim/api';
import { makeHero, HERO_BUILD, HERO_TOP } from '../../src/render/chars';
import { compileClip } from '../../src/render/anim/compile';
import { BASIC_WINDUP, SIM_TIMING, TICK_S, abilNumbers } from '../../src/render/anim/timing';
import { ROOT_CAPS } from '../../src/render/anim/root';
import { HERO_ANIM } from '../../src/render/anim/registry';
import type { ClipDef, FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, MoveSet, SkillFxSet } from '../../src/render/anim/types';
import { NUGGET_CLIPS } from '../../src/render/moves/nugget';
import { MARSHMALLOW_CLIPS } from '../../src/render/moves/marshmallow';
import { BRAVO_CLIPS } from '../../src/render/moves/bravo';
import { BIG, CHILI_CLIPS } from '../../src/render/moves/chili';
import { HOWLER_CLIPS } from '../../src/render/moves/howler';
import * as NUGGET from '../../src/render/chars/heroes/nugget';
import * as MARSHMALLOW from '../../src/render/chars/heroes/marshmallow';
import * as BRAVO from '../../src/render/chars/heroes/bravo';
import * as CHILI from '../../src/render/chars/heroes/chili';
import * as HOWLER from '../../src/render/chars/heroes/howler';

const FRAME = 1 / 60;
const DOGS = ['nugget', 'marshmallow', 'bravo', 'chili', 'howler'] as const;
const CLIPS: Record<(typeof DOGS)[number], readonly ClipDef[]> = { nugget: NUGGET_CLIPS, marshmallow: MARSHMALLOW_CLIPS, bravo: BRAVO_CLIPS, chili: CHILI_CLIPS, howler: HOWLER_CLIPS };
const MODS = { nugget: NUGGET, marshmallow: MARSHMALLOW, bravo: BRAVO, chili: CHILI, howler: HOWLER } as const;
const moves = async (h: HeroId): Promise<MoveSet> => (await HERO_ANIM[h].moves()).MOVES;
const fxOf = async (h: HeroId): Promise<SkillFxSet> => (await HERO_ANIM[h].fx()).SKILL_FX;

describe('sim v14 dog moves', () => {
  for (const h of DOGS) {
    it(`${h}: filled, basics on the windup, dashes on travelEnd, windups on windupStart`, async () => {
      const m = await moves(h);
      const T = SIM_TIMING[h];
      expect(m.stub).toBe(false);
      expect(m.basic.length).toBeGreaterThanOrEqual(2);
      for (const c of m.basic) {
        expect(Math.abs((c.markers.contact ?? NaN) - BASIC_WINDUP * TICK_S), c.id).toBeLessThanOrEqual(FRAME);
        expect(c.warp.some(([k, a]) => k === 'contact' && (a === (T.ranged ? 'release' : 'contact'))), c.id).toBe(true);
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

  it('the sizes read: Chili is the smallest dog, Howler the tallest, Bravo smaller than Sir Brutus', () => {
    const tops = DOGS.map((h) => HERO_TOP[h]);
    expect(Math.min(...tops)).toBe(HERO_TOP.chili);
    expect(Math.max(...tops)).toBe(HERO_TOP.howler);
    expect(HERO_TOP.bravo).toBeLessThan(HERO_TOP.brutus);
  });

  it('Nugget: the sploot is his own lying pose, held for the 45 t state with an end on stateEnd', async () => {
    const m = await moves('nugget');
    expect(NUGGET.POSES.sploot.body?.r?.[0]).toBeCloseTo(Math.PI / 2, 6);
    expect(m.slots.e.cast.keys.some((k) => k[1] === 'sploot')).toBe(true);
    expect(m.slots.e.hold?.keys.every((k) => k[1] === 'sploot')).toBe(true);
    expect(m.slots.e.end?.warp).toEqual([['contact', 'stateEnd']]);
    expect(SIM_TIMING.nugget.slots.e.duration).toBe(45);
    expect(m.victory.keys.every((k) => k[1] === 'sploot')).toBe(true);
  });

  it('Bravo: the flop clip plays for the `clip` event and lasts the sim flop (30 t) before he pops up', async () => {
    const m = await moves('bravo');
    const flop = m.clips?.flop;
    expect(flop).toBeDefined();
    expect(flop!.len).toBeGreaterThanOrEqual((abilNumbers('bravo', 'passive').duration ?? 30) * TICK_S);
    expect(flop!.keys.some((k) => k[1] === 'playDead')).toBe(true);
    expect(flop!.cues?.some(([, kind, arg]) => kind === 'fx' && arg === 'bv:bravo')).toBe(true);
  });

  it('Chili: BIG DOG is an additive 1.35× form hold, never while he hides in the purse', async () => {
    const m = await moves('chili');
    expect(BIG).toBe(1.35);
    expect(m.formHold?.mode).toBe('additive');
    expect(m.formHold?.root?.sx?.[0][1]).toBe(BIG);
    expect(m.formHold?.root?.sy?.[0][1]).toBe(BIG);
    const ctx = { buffs: 0, form: true, comboIndex: 0 } as unknown as MoveCtx;
    expect(m.formHoldWhen?.(ctx)).toBe(true);
    expect(m.basicPick?.(ctx)?.id).toBe('chili.basicBig');
    (ctx as { buffs: number }).buffs = 1 << 1;
    expect(m.formHoldWhen?.(ctx)).toBe(false);
    expect(m.basicPick?.(ctx)?.id).not.toBe('chili.basicBig');
  });

  it('Howler: the inhale fills the 21 t windup and THE SCREAM opens the mouth wide on the cast', async () => {
    const r = (await moves('howler')).slots.r.cast;
    expect(SIM_TIMING.howler.slots.r.windup).toBe(21);
    expect(r.warp).toEqual([['coil', 'windupStart'], ['contact', 'cast']]);
    const sx = r.root?.sx ?? [];
    expect(Math.max(...sx.filter(([t]) => t <= (r.markers.contact ?? 0)).map(([, v]) => v))).toBeGreaterThanOrEqual(1.25);
    expect(r.cues?.some(([at, kind, arg]) => at === 'contact' && kind === 'mouthOpen' && typeof arg === 'string' && Number(arg.split('*')[1]) >= 2.5)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------ skill FX

/** The dog is 0 at the origin, an enemy cat 3 at (3, 0). */
function fakeFx(hero: HeroId) {
  const spawned: { kind: MeshFxKind; o: MeshFxSpawn }[] = [];
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 3, z: 0 } };
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
const cast = (slot: number, x = 4000, y = 0) => ({ type: 'cast' as const, tick: 0, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target: -1 });
const ctx = { form: false, buffs: 0, resource: 0 } as unknown as MoveCtx;

describe('sim v14 dog skill FX', () => {
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

  it('Nugget: the Sploot heal ring is exactly the sim radius for the sim duration', async () => {
    const f = fakeFx('nugget');
    (await fxOf('nugget')).onCast!(cast(2, 0, 0), f.fx, ctx);
    const a = abilNumbers('nugget', 'e');
    const ring = f.spawned.find((s) => s.kind === 'ring')!;
    expect(ring.o.sx).toBeCloseTo(a.radius / 1000, 9);
    expect(ring.o.life).toBeCloseTo(a.duration * TICK_S, 9);
  });

  it('Marshmallow: a frozen cat gets the ice cube for exactly the sim freeze', async () => {
    const f = fakeFx('marshmallow');
    (await fxOf('marshmallow')).onClip!(3, 'frozen', f.fx);
    const cube = f.spawned.find((s) => s.kind === 'pillar')!;
    expect(cube.o.x).toBe(3);
    expect(cube.o.life).toBeCloseTo(abilNumbers('marshmallow', 'r').freeze * TICK_S, 9);
    // another dog's moment draws no ice
    const g = fakeFx('marshmallow');
    (await fxOf('marshmallow')).onClip!(3, 'flop', g.fx);
    expect(g.spawned.length).toBe(0);
  });

  it('Howler: AWOO and THE SCREAM roll out to exactly the sim range', async () => {
    const f = fakeFx('howler');
    const fxs = await fxOf('howler');
    fxs.onCast!(cast(0), f.fx, ctx);
    const qr = Math.max(...f.spawned.filter((s) => s.kind === 'crescent').map((s) => s.o.sx));
    expect(qr).toBeCloseTo(abilNumbers('howler', 'q').range / 1000, 9);
    const g = fakeFx('howler');
    fxs.onCast!(cast(3), g.fx, ctx);
    const rr = Math.max(...g.spawned.filter((s) => s.kind === 'crescent').map((s) => s.o.sx));
    expect(rr).toBeCloseTo(abilNumbers('howler', 'r').range / 1000, 9);
  });
});
