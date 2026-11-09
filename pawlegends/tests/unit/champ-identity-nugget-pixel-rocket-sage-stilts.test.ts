/**
 * Champion identity, batch 4 (Nugget, Pixel, Rocket, Sage, Stilts; CHAMP-IDENTITY.md §3): every skill plays its
 * nature sound plus the hero's own champion sound, the hero's motif painter draws its own shape in its colour pair,
 * and each hero's skill FX script puts the motif on its skills and plays its script-only moments through the identity
 * mix (travel whirrs, landings, trap sets), with the generic stand-in cues gone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAMP_AUDIO } from '../../src/audio/champ';
import { PROJECTILE_KIND } from '../../src/data/towers';
import type { MotifPainter } from '../../src/audio/champ/types';
import { sfx } from '../../src/audio/sfx';
import { zzfxDuration } from '../../src/audio/sfxDefs.js';
import { identityDefs, planSkillSfx } from '../../src/audio/skillSfx';
import type { HeroId } from '../../src/data/heroes/types';
import { IDENTITY, MIX, natureOf } from '../../src/data/identity';
import { abilNumbers } from '../../src/render/anim/timing';
import type { FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, SkillFxSet, Slot } from '../../src/render/anim/types';
import { SHAPE } from '../../src/render/fx/Particles.js';
import { resetFunKit, setFunSink } from '../../src/render/fx/fun/funKit';
import { SKILL_FX as NUGGET } from '../../src/render/skillfx/nugget';
import { SKILL_FX as PIXEL, resetPixelFx } from '../../src/render/skillfx/pixel';
import { SKILL_FX as ROCKET } from '../../src/render/skillfx/rocket';
import { SKILL_FX as SAGE, resetSageFx } from '../../src/render/skillfx/sage';
import { SKILL_FX as STILTS, resetStiltsFx } from '../../src/render/skillfx/stilts';

const BATCH: readonly HeroId[] = ['nugget', 'pixel', 'rocket', 'sage', 'stilts'];
const SETS: Readonly<Record<string, SkillFxSet>> = { nugget: NUGGET, pixel: PIXEL, rocket: ROCKET, sage: SAGE, stilts: STILTS };
/** The particle shape each hero's motif must show (render/fx/Particles.js SHAPE). */
const MOTIF_SHAPE: Readonly<Record<string, readonly number[]>> = {
  nugget: [SHAPE.RING, SHAPE.BONE],
  pixel: [SHAPE.CONFETTI],
  rocket: [SHAPE.CONFETTI],
  sage: [SHAPE.FEATHER],
  stilts: [SHAPE.PAW],
};
const { defs, aliases } = identityDefs();

describe('batch 4 champion sounds', () => {
  it('every Q / W / E plays its nature sound plus a champion sound in the hero timbre', () => {
    for (const h of BATCH)
      for (const k of ['q', 'w', 'e'] as const) {
        const plan = planSkillSfx(h, k, 'cast');
        expect(plan[0].name, `${h} ${k}`).toBe(`n:${natureOf(h, k)}:cast`);
        const champ = plan.filter((p) => p.layer === 'motif');
        expect(champ.length, `${h} ${k}`).toBe(1);
        expect(champ[0].name.startsWith(`c:${h}:`), `${h} ${k} ${champ[0].name}`).toBe(true);
        expect(champ[0].name in defs).toBe(true);
      }
  });

  it('R plays the nature cast and the ult voice; basics the nature impact and the basic voice', () => {
    for (const h of BATCH) {
      const r = planSkillSfx(h, 'r', 'cast');
      expect(r.map((p) => p.name)).toEqual([`n:${natureOf(h, 'r')}:cast`, `v:${h}:ult`]);
      const b = planSkillSfx(h, 'basic', 'impact', true);
      expect(b.map((p) => p.name)).toEqual([`n:${natureOf(h, 'basic')}:impact`, `v:${h}:basic`]);
      expect(`v:${h}:basic` in defs || `v:${h}:basic` in aliases).toBe(true);
    }
  });

  it('each hero has its own motif (not the basic voice stand-in), short and under the motif cap', () => {
    const seen = new Set<string>();
    for (const h of BATCH) {
      const c = CHAMP_AUDIO[h];
      expect(c.motif).not.toBeNull();
      expect(c.motif).not.toEqual(IDENTITY[h].voice.basic.zzfx);
      expect(zzfxDuration(c.motif as number[])).toBeLessThanOrEqual(MIX.maxSeconds.cast);
      expect(c.motif![0]).toBeLessThanOrEqual(MIX.volCap.basicVoice);
      seen.add(JSON.stringify(c.motif));
      for (const [k, z] of Object.entries(c.sounds ?? {})) {
        expect(defs[`c:${h}:${k}`]).toBe(z);
        expect(zzfxDuration(z as number[]), `${h} ${k}`).toBeLessThanOrEqual(MIX.maxSeconds.cast);
        expect(z[0]).toBeLessThanOrEqual(MIX.volCap.motif);
      }
      // Q, W and E are told apart: a different sound or a different pitch of the motif
      const keys = (['q', 'w', 'e'] as const).map((k) => {
        const p = planSkillSfx(h, k, 'cast').find((x) => x.layer === 'motif')!;
        return `${p.name}@${p.rate}`;
      });
      expect(new Set(keys).size, `${h} ${keys.join(' ')}`).toBe(3);
    }
    expect(seen.size).toBe(BATCH.length);
  });
});

// ------------------------------------------------------------------------------------------------ motif painters

function painter(h: HeroId) {
  const out: { shape: number; color: number }[] = [];
  const rec = (_p: unknown, o: Record<string, unknown>): void => {
    const n = typeof o.n === 'number' ? o.n : 1;
    for (let i = 0; i < n; i++) out.push({ shape: o.shape as number, color: o.color as number });
  };
  const p: MotifPainter = { burst: rec, single: rec, ring: rec, shape: SHAPE as unknown as Record<string, number>, colors: { ...IDENTITY[h].colors } };
  return { p, out };
}

describe('batch 4 motif painters', () => {
  it('draw the hero motif shape in its colour pair within the budget', () => {
    for (const h of BATCH) {
      const paint = CHAMP_AUDIO[h].fx?.paint;
      expect(paint, h).toBeTypeOf('function');
      for (const n of [1, 2, 3, 6]) {
        const { p, out } = painter(h);
        expect(paint!(p, { x: 0, y: 0, z: 0 }, n, n % 2 ? { x: 1, z: 0 } : null, 'q')).toBe(true);
        expect(out.length, `${h} n=${n}`).toBeGreaterThan(0);
        expect(out.length, `${h} n=${n}`).toBeLessThanOrEqual(n);
        expect(out.some((s) => MOTIF_SHAPE[h].includes(s.shape)), `${h} n=${n}`).toBe(true);
        const { primary, secondary } = IDENTITY[h].colors;
        for (const s of out) expect([primary, secondary], h).toContain(s.color);
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------ skill FX scripts

/** A fake particle pool: records every sprite's shape (the kit reuses one spec object, like Particles.begin()). */
function pool() {
  const spec: Record<string, number> = {};
  const shapes: number[] = [];
  return { shapes, begin: () => spec, emit: () => (shapes.push(spec.shape), shapes.length - 1), scaled: (n: number) => n };
}

function fakeFx(h: HeroId, cues: string[]) {
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 4, z: 0 } };
  const put = (id: number, out: { x: number; y: number; z: number }, y: number): boolean => {
    const p = pos[id];
    if (!p) return false;
    out.x = p.x;
    out.y = y;
    out.z = p.z;
    return true;
  };
  return {
    tier: 'high',
    reduced: false,
    mesh: { spawn: (_k: MeshFxKind, _o: MeshFxSpawn) => 1 },
    ribbons: { point: () => 1, feed: () => {}, end: () => {} },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: (name: string) => void cues.push(name) },
    relation: (id: number) => (id === 0 ? 'own' : 'enemy'),
    rim: () => 0xffd34d,
    abil: (id: number, slot: Slot) => (id === 0 ? abilNumbers(h, slot) : id === 3 ? abilNumbers('brutus', slot) : {}),
    heroPos: (id: number, out: { x: number; y: number; z: number }) => put(id, out, 0),
    bonePos: (id: number, _b: string, out: { x: number; y: number; z: number }) => put(id, out, 1),
    facing: (_id: number, out: { x: number; y: number; z: number }) => ((out.x = 1), (out.y = 0), (out.z = 0), true),
    projPos: (_i: number, out: { x: number; y: number; z: number }) => ((out.x = 1), (out.y = 1), (out.z = 0), true),
  } as unknown as FxCtx;
}

const cast = (slot: number) => ({ type: 'cast' as const, tick: 30, src: 0, slot: slot as 0 | 1 | 2 | 3, x: 4000, y: 0, target: -1 });
const CTX = { branch: false, form: false } as unknown as MoveCtx;
/** Slots whose cast (and its next half second) draws the motif: Sage's W shows it on the trap's arm instead. */
const MOTIF_SLOTS: Readonly<Record<string, readonly number[]>> = { nugget: [0, 2, 3], pixel: [0, 2, 3], rocket: [0, 2, 3], sage: [0, 2], stilts: [0, 1, 2] };
/** The stand-in generic cues the champion layer replaced. */
const STAND_INS = ['pop', 'zap', 'clang', 'fwoomp', 'whooshM', 'whooshL', 'slash', 'whooshS'];

describe('batch 4 skill FX carry the motif', () => {
  let p: ReturnType<typeof pool>;
  let layers: string[];
  beforeEach(() => {
    resetPixelFx();
    resetSageFx();
    resetStiltsFx();
    p = pool();
    setFunSink({ particles: p });
    layers = [];
    vi.spyOn(sfx, 'playLayer').mockImplementation((req) => (layers.push(req.name), true));
  });
  afterEach(() => {
    setFunSink({});
    resetFunKit();
    vi.restoreAllMocks();
  });

  for (const h of BATCH)
    it(`${h}: each skill shows its motif and no stand-in cue plays`, () => {
      const set = SETS[h];
      for (const slot of MOTIF_SLOTS[h]) {
        const cues: string[] = [];
        const fx = fakeFx(h, cues);
        p.shapes.length = 0;
        set.onWindup?.({ type: 'windup', tick: 20, src: 0, slot: slot as 0 | 1 | 2 | 3, x: 4000, y: 0, ticks: 10 } as never, fx);
        set.onCast!(cast(slot), fx, CTX);
        for (let t = 0; t < 0.5; t += 1 / 30) set.update?.(1 / 30, fx);
        if (h === 'stilts' && slot === 0) set.onMarker!(0, 'q', 'leapLand', fx);
        if (h === 'stilts' && slot === 2) set.onMarker!(0, 'e', 'swat2', fx);
        expect(p.shapes.some((s) => MOTIF_SHAPE[h].includes(s)), `${h} slot ${slot}: ${p.shapes.join(',')}`).toBe(true);
        expect(cues.filter((c) => STAND_INS.includes(c)), `${h} slot ${slot}`).toEqual([]);
      }
    });

  it('Nugget and Pixel play the projectile travel layer under their Q shot', () => {
    NUGGET.onProjectile!(0, PROJECTILE_KIND.frisbee, 0, fakeFx('nugget', []), 2);
    expect(layers).toEqual(['n:projectile:travel']);
    layers.length = 0;
    const fx = fakeFx('pixel', []);
    PIXEL.onCast!(cast(0), fx, CTX);
    PIXEL.onProjectile!(0, PROJECTILE_KIND.cap, 0, fx, 2);
    expect(layers).toEqual(['n:projectile:travel']);
  });

  it('Sage: the trap sets with her flute and springs with the moon closing (arcane impact)', () => {
    const fx = fakeFx('sage', []);
    SAGE.onCast!({ ...cast(1), x: 3000 }, fx, CTX);
    SAGE.onZone!(7, 'spawn', fx);
    SAGE.onZone!(7, 'arm', fx);
    expect(layers).toContain('c:sage:moonSet');
    SAGE.onHit!({ type: 'hit', tick: 60, src: 0, dst: 3, amount: 0, shielded: 0, kind: 'zone' } as never, fx, CTX);
    expect(layers).toContain('n:arcane:impact');
    expect(layers).toContain('c:sage:moonClose');
  });

  it('Stilts: the leap lands on her bongo, the second swat plays slash + bongo higher, a pounce double-slaps', () => {
    const fx = fakeFx('stilts', []);
    STILTS.onMarker!(0, 'q', 'leapLand', fx);
    expect(layers).toEqual(expect.arrayContaining(['c:stilts:land', 'n:mobility:impact']));
    layers.length = 0;
    STILTS.onCast!(cast(2), fx, CTX);
    STILTS.onMarker!(0, 'e', 'swat2', fx);
    expect(layers).toEqual(expect.arrayContaining(['n:slash:cast', 'c:stilts:motif']));
  });

  it('Rocket: the ZOOM crouch beeps once (the start light)', () => {
    const fx = fakeFx('rocket', []);
    ROCKET.onWindup!({ type: 'windup', tick: 20, src: 0, slot: 3, x: 4000, y: 0, ticks: 10 } as never, fx);
    expect(layers).toContain('c:rocket:motif');
  });
});
