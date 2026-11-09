/**
 * Champion identity, batch 2 (CHAMP-IDENTITY.md §3, §5a): Chili, Clem, Domino, Duchess and Frankie. Every skill plays
 * its nature sound plus the champion layer (own motif ping, override or ult voice); the motif painter draws in the
 * hero's colour pair; each hero's skill FX script draws the skill's nature accent and the motif on every skill, and no
 * longer plays the generic cast cues the framework now replaces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAMP_AUDIO } from '../../src/audio/champ';
import type { MotifPainter } from '../../src/audio/champ/types';
import { PL_SFX, sfx } from '../../src/audio/sfx';
import { zzfxDuration } from '../../src/audio/sfxDefs.js';
import { identityDefs, planSkillSfx } from '../../src/audio/skillSfx';
import type { HeroId } from '../../src/data/heroes/types';
import { IDENTITY, MIX, SKILL_KEYS, natureOf, type SkillKey } from '../../src/data/identity';
import { PROJECTILE_KIND } from '../../src/data/towers';
import { abilNumbers } from '../../src/render/anim/timing';
import type { FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, SkillFxSet, Slot } from '../../src/render/anim/types';
import { setFunSink } from '../../src/render/fx/fun/funKit';
import { NATURE_FX } from '../../src/render/fx/natureFx';
import { SHAPE } from '../../src/render/fx/Particles.js';
import { SKILL_FX as CHILI } from '../../src/render/skillfx/chili';
import { SKILL_FX as CLEM, resetClemFx } from '../../src/render/skillfx/clem';
import { SKILL_FX as DOMINO } from '../../src/render/skillfx/domino';
import { SKILL_FX as DUCHESS } from '../../src/render/skillfx/duchess';
import { SKILL_FX as FRANKIE } from '../../src/render/skillfx/frankie';

const BATCH: readonly HeroId[] = ['chili', 'clem', 'domino', 'duchess', 'frankie'];
const SETS: Readonly<Record<string, SkillFxSet>> = { chili: CHILI, clem: CLEM, domino: DOMINO, duchess: DUCHESS, frankie: FRANKIE };
const { defs, aliases } = identityDefs();
const known = (n: string): boolean => n in defs || n in aliases || n in PL_SFX;
const names = (h: HeroId, k: SkillKey, ph: 'cast' | 'impact' | 'travel'): string[] => planSkillSfx(h, k, ph).map((p) => p.name);

describe('batch 2 sounds: nature + champion on every skill', () => {
  it.each(BATCH)('%s: each cast plays its nature, then exactly one champion layer', (h) => {
    for (const k of ['q', 'w', 'e', 'r'] as SkillKey[]) {
      const plan = planSkillSfx(h, k, 'cast');
      expect(plan[0].name, `${h} ${k}`).toBe(`n:${natureOf(h, k)}:cast`);
      const champ = plan.slice(1);
      expect(champ.length, `${h} ${k} champion layer`).toBe(1);
      if (k === 'r') expect(champ[0]).toMatchObject({ layer: 'ultVoice', name: `v:${h}:ult` });
      else expect(champ[0].layer).toBe('motif');
      for (const p of plan) expect(known(p.name), p.name).toBe(true);
    }
    expect(names(h, 'basic', 'impact').concat(planSkillSfx(h, 'basic', 'impact', true).map((p) => p.name))).toContain(`v:${h}:basic`);
  });

  it.each(BATCH)('%s: its own motif ping (not the basic voice), short, under the caps, a melody across Q/W/E', (h) => {
    const c = CHAMP_AUDIO[h];
    expect(c.motif).toBeTruthy();
    expect(c.motif).not.toEqual(IDENTITY[h].voice.basic.zzfx);
    expect(zzfxDuration(c.motif as number[])).toBeLessThanOrEqual(MIX.maxSeconds.cast);
    expect(c.motif![0]).toBeLessThanOrEqual(MIX.volCap.motif);
    expect(c.motif![1]).toBe(0);
    for (const [k, z] of Object.entries(c.sounds ?? {})) {
      expect(defs[`c:${h}:${k}`], k).toBeTruthy();
      expect(zzfxDuration(z as number[]), k).toBeLessThanOrEqual(MIX.maxSeconds.impact);
      expect(z[0], k).toBeLessThanOrEqual(MIX.volCap.motif);
      expect(z[1], `${k}: deterministic bake`).toBe(0);
    }
    const r = c.motifRate ?? {};
    expect(new Set([r.q ?? 1, r.w ?? 1, r.e ?? 1]).size).toBeGreaterThan(1);
    // the scripts draw the motif themselves: no extra framework burst on owned casts
    expect(c.fx?.ownedMotif).toBe(false);
  });

  it('script moments and overrides resolve to the champion sounds', () => {
    expect(names('chili', 'e', 'cast')).toEqual(['n:guard:cast', 'c:chili:purseSnap']);
    expect(names('clem', 'w', 'impact')).toEqual(['n:guard:impact', 'c:clem:sunTing']);
    expect(names('clem', 'q', 'impact')).toEqual(['n:slash:impact', 'c:clem:ray']);
    expect(names('duchess', 'w', 'cast')).toEqual(['n:shadow:cast', 'c:duchess:hmph']);
    expect(names('duchess', 'passive', 'impact')).toEqual(['n:shadow:impact', 'c:duchess:crownTing']);
    expect(names('duchess', 'q', 'travel')).toEqual(['n:projectile:travel']);
    expect(names('domino', 'q', 'travel')).toEqual(['n:projectile:travel']);
    expect(names('domino', 'w', 'cast')).toEqual(['n:splash:cast', 'dominoSplat']);
    expect(names('domino', 'e', 'cast')).toEqual(['n:impact:cast', 'dominoShake']);
    expect(names('domino', 'r', 'impact')).toEqual(['n:arcane:impact', 'c:domino:star']);
    expect(names('frankie', 'w', 'impact')).toEqual(['n:impact:impact', 'frankieDig']);
    expect(names('frankie', 'r', 'impact')).toEqual(['n:fire:impact', 'frankieSnap']);
    expect(names('frankie', 'passive', 'impact')).toEqual(['n:splash:impact', 'c:frankie:cork']);
  });
});

// ------------------------------------------------------------------------------------------------ motif painters

function fakePainter(h: HeroId) {
  const used = new Set<number>();
  let drawn = 0;
  const rec = (_p: unknown, o: Record<string, unknown>): void => {
    used.add(o.color as number);
    drawn += (o.n as number | undefined) ?? 1;
  };
  const p: MotifPainter = { burst: rec, single: rec, ring: rec, shape: SHAPE as unknown as Record<string, number>, colors: { ...IDENTITY[h].colors } };
  return { p, used, drawn: () => drawn };
}

describe('batch 2 motif painters', () => {
  it.each(BATCH)('%s: paints its motif in both colours of its pair, never over the budget', (h) => {
    const paint = CHAMP_AUDIO[h].fx?.paint;
    expect(paint).toBeTruthy();
    const { primary, secondary } = IDENTITY[h].colors;
    for (const k of SKILL_KEYS)
      for (const n of [1, 2, 4, 6, 12]) {
        const f = fakePainter(h);
        expect(paint!(f.p, { x: 0, y: 0, z: 0 }, n, n & 1 ? null : { x: 1, z: 0 }, k)).toBe(true);
        expect(f.used.has(primary) || f.used.has(secondary), `${h} ${k} n=${n}`).toBe(true);
        expect(f.drawn(), `${h} ${k} n=${n}`).toBeGreaterThan(0);
        expect(f.drawn(), `${h} ${k} n=${n}`).toBeLessThanOrEqual(n);
        if (n >= 6) expect(f.used.has(primary) && f.used.has(secondary), `${h} ${k} both colours`).toBe(true);
      }
  });
});

// ------------------------------------------------------------------------------------------------ skill FX scripts

/** Colours the identity layer drew (bursts, singles and rings through the fun sink). */
const colors = new Set<number>();
const rec = (_p: unknown, o: Record<string, unknown>): void => void colors.add(o.color as number);
const pool = {
  begin: () => ({}) as Record<string, number>,
  emit: () => 0,
  scaled: (n: number) => n,
  burst: rec,
  single: rec,
  ring: rec,
};

const FRAME = 1 / 60;
function fakeFx(hero: HeroId, rel: 'own' | 'enemy' = 'own') {
  const cues: string[] = [];
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 3, z: 0.4 } };
  const fx = {
    tier: 'high',
    reduced: false,
    mesh: { spawn: (_kind: MeshFxKind, _o: MeshFxSpawn) => 1 },
    ribbons: { point: () => 1, feed: () => {}, end: () => {} },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: (n: string) => void cues.push(n) },
    lookup: { heroOf: (id: number) => (id === 0 ? hero : id === 3 ? 'clem' : null), bone: () => null },
    relation: (id: number) => (id === 0 ? rel : rel === 'own' ? 'enemy' : 'own'),
    rim: () => 0xff3040,
    abil: (id: number, slot: Slot) => (id === 0 || id === 3 ? abilNumbers(id === 0 ? hero : 'clem', slot, null, false) : {}),
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
    facing: (_id: number, out: { x: number; y: number; z: number }) => ((out.x = 1), (out.y = 0), (out.z = 0), true),
    projPos: (_i: number, out: { x: number; y: number; z: number }) => ((out.x = 1), (out.y = 0.6), (out.z = 0), true),
    status: () => false,
  } as unknown as FxCtx;
  return { fx, cues };
}

const ctx = { form: false, buffs: 0, resource: 0, recastIndex: 0, talents: [], basicCount: 1, charged: false, comboIndex: 0 } as unknown as MoveCtx;
const cast = (slot: number, tick = 7) => ({ type: 'cast' as const, tick, src: 0, slot: slot as 0 | 1 | 2 | 3, x: 3000, y: -400, target: 3 });
const hit = (kind: 'basic' | 'ability', tick = 9) => ({ type: 'hit' as const, tick, src: 0, dst: 3, kind, amount: 80, shielded: 0 });
const step = (set: SkillFxSet, fx: FxCtx, s: number): void => {
  for (let t = 0; t < s; t += FRAME) set.update?.(FRAME, fx);
};

/** One skill's identity, as the script draws it: its cast plus what follows (projectile, hits, a few frames). */
function drawSkill(h: HeroId, slot: number, fx: FxCtx): void {
  const set = SETS[h];
  set.onCast?.(cast(slot), fx, ctx);
  if (h === 'domino' && slot === 3) set.onHit?.(hit('ability', 7), fx, ctx);
  step(set, fx, 0.1);
}

describe('batch 2 skill FX scripts: nature accent + champion motif on every skill', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let layers: string[];
  beforeEach(() => {
    colors.clear();
    setFunSink({ particles: pool });
    resetClemFx();
    layers = [];
    play = vi.spyOn(sfx, 'play');
    vi.spyOn(sfx, 'playLayer').mockImplementation((req: { name: string }) => (layers.push(req.name), false));
  });
  afterEach(() => {
    setFunSink({});
    vi.restoreAllMocks();
  });

  for (const h of BATCH)
    it(`${h}: Q, W, E and R each draw their nature colour and the motif pair`, () => {
      const { primary, secondary } = IDENTITY[h].colors;
      for (const slot of [0, 1, 2, 3]) {
        colors.clear();
        const { fx } = fakeFx(h);
        drawSkill(h, slot, fx);
        const k = (['q', 'w', 'e', 'r'] as const)[slot];
        expect(colors.has(NATURE_FX[natureOf(h, k)].color), `${h} ${k} nature ${natureOf(h, k)}`).toBe(true);
        expect(colors.has(primary) || colors.has(secondary), `${h} ${k} motif`).toBe(true);
      }
    });

  for (const h of BATCH)
    it(`${h}: no generic cast cues and no doubled cast voices from the script`, () => {
      const { fx, cues } = fakeFx(h);
      for (const slot of [0, 1, 2, 3]) SETS[h].onCast?.(cast(slot), fx, ctx);
      expect(cues).toEqual([]);
      const played = (play.mock.calls as unknown[][]).map((c) => c[0] as string);
      const doubled = [IDENTITY[h].voice.ult.reuse, IDENTITY[h].voice.basic.reuse, 'frankieStretch', 'dominoSplat', 'dominoShake', 'dominoBoop', 'chiliBigBark'];
      for (const n of doubled) if (n) expect(played, `${h} ${n}`).not.toContain(n);
    });

  it('script-only moments play the champion layer through the identity mix', () => {
    const d = fakeFx('domino');
    DOMINO.onProjectile?.(0, PROJECTILE_KIND.fluff, 0, d.fx, 1);
    const c = fakeFx('clem');
    CLEM.onProjectile?.(0, PROJECTILE_KIND.hero, 1, c.fx, 1);
    const f = fakeFx('frankie');
    FRANKIE.onClip?.(0, 'footlong', f.fx);
    expect(layers).toEqual(expect.arrayContaining(['n:projectile:travel', 'c:clem:sunTing', 'n:guard:impact', 'frankieSnap', 'n:fire:impact']));
    expect(c.cues).not.toContain('tingParry');
    // Duchess's fluffball whooshes as it rolls
    layers.length = 0;
    const q = fakeFx('duchess');
    DUCHESS.onCast?.(cast(0), q.fx, ctx);
    step(DUCHESS, q.fx, 0.5);
    expect(layers.filter((n) => n === 'n:projectile:travel').length).toBeGreaterThanOrEqual(1);
  });

  it('Spot On, the Combo and the pepper crown stamp the motif', () => {
    // Domino: Spot On's star glint on an ability hit
    const d = fakeFx('domino');
    DOMINO.onHit?.(hit('ability', 50), d.fx, ctx);
    expect(colors.has(IDENTITY.domino.colors.secondary)).toBe(true);
    // Frankie: two hits on the same hero in a tick = the Combo X (and its squirt)
    colors.clear();
    const f = fakeFx('frankie');
    FRANKIE.onHit?.(hit('ability', 60), f.fx, ctx);
    FRANKIE.onHit?.(hit('ability', 60), f.fx, ctx);
    expect(colors.has(IDENTITY.frankie.colors.secondary) && colors.has(NATURE_FX.splash.color)).toBe(true);
    expect(layers).toContain('c:frankie:cork');
    // Chili: a basic at 5 Rage puts the pepper crown over his head
    colors.clear();
    const c = fakeFx('chili');
    CHILI.onHit?.(hit('basic', 70), c.fx, { ...ctx, resource: 255 } as unknown as MoveCtx);
    expect(colors.has(IDENTITY.chili.colors.primary) && colors.has(IDENTITY.chili.colors.secondary)).toBe(true);
  });

  it('gold stays "you": on an enemy the gold half of the pair is a pale glint', () => {
    for (const [h, gold] of [
      ['frankie', IDENTITY.frankie.colors.primary],
      ['clem', IDENTITY.clem.colors.secondary],
      ['duchess', IDENTITY.duchess.colors.secondary],
    ] as const) {
      colors.clear();
      const { fx } = fakeFx(h, 'enemy');
      for (const slot of [0, 1, 2, 3]) drawSkill(h, slot, fx);
      expect(colors.has(gold), h).toBe(false);
      colors.clear();
      const own = fakeFx(h, 'own');
      for (const slot of [0, 1, 2, 3]) drawSkill(h, slot, own.fx);
      expect(colors.has(gold), h).toBe(true);
    }
  });
});
