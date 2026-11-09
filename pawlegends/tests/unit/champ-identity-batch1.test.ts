/**
 * Champion identity, batch 1 (CHAMP-IDENTITY.md §3, §5a): Avietė, Bengas, Bravo, Sir Brutus and Cacklejaw. Every skill
 * plays its nature sound plus the champion layer (own motif ping, override or ult voice), the motif painter draws in the
 * hero's colour pair, and each hero's skill FX script stamps its motif (raspberry, toast crumb / camellia, spotlight /
 * tear, crest, lime grin) on its own skills.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHAMP_AUDIO } from '../../src/audio/champ';
import type { MotifPainter } from '../../src/audio/champ/types';
import { PL_SFX } from '../../src/audio/sfx';
import { zzfxDuration } from '../../src/audio/sfxDefs.js';
import { identityDefs, planSkillSfx } from '../../src/audio/skillSfx';
import type { HeroId } from '../../src/data/heroes/types';
import { IDENTITY, MIX, SKILL_KEYS, natureOf, type SkillKey } from '../../src/data/identity';
import { abilNumbers } from '../../src/render/anim/timing';
import type { FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, SkillFxSet, Slot } from '../../src/render/anim/types';
import { setFunSink } from '../../src/render/fx/fun/funKit';
import { SHAPE } from '../../src/render/fx/Particles.js';
import { SKILL_FX as AVIETE, resetAvieteFx } from '../../src/render/skillfx/aviete';
import { SKILL_FX as BENGAS, resetBengasFx } from '../../src/render/skillfx/bengas';
import { SKILL_FX as BRAVO } from '../../src/render/skillfx/bravo';
import { SKILL_FX as BRUTUS, resetBrutusFx } from '../../src/render/skillfx/brutus';
import { SKILL_FX as CACKLEJAW, resetCacklejawFx } from '../../src/render/skillfx/cacklejaw';

const BATCH: readonly HeroId[] = ['aviete', 'bengas', 'bravo', 'brutus', 'cacklejaw'];
const { defs, aliases } = identityDefs();
const known = (n: string): boolean => n in defs || n in aliases || n in PL_SFX;

describe('batch 1 sounds: nature + champion on every skill', () => {
  it.each(BATCH)('%s: each cast plays its nature, then its own motif / override / ult voice', (h) => {
    for (const k of ['q', 'w', 'e', 'r'] as SkillKey[]) {
      const plan = planSkillSfx(h, k, 'cast');
      expect(plan[0].name, `${h} ${k}`).toBe(`n:${natureOf(h, k)}:cast`);
      expect(plan[0].layer).toBe('cast');
      const champ = plan.slice(1);
      expect(champ.length, `${h} ${k} champion layer`).toBe(1);
      if (k === 'r') expect(champ[0]).toMatchObject({ layer: 'ultVoice', name: `v:${h}:ult` });
      else {
        expect(champ[0].layer).toBe('motif');
        expect(champ[0].name.startsWith(`c:${h}:`) || champ[0].name in PL_SFX, `${h} ${k} ${champ[0].name}`).toBe(true);
      }
      for (const p of plan) expect(known(p.name), p.name).toBe(true);
    }
    // a basic hit: the nature impact and the hero's basic voice
    const b = planSkillSfx(h, 'basic', 'impact', true);
    expect(b.map((p) => p.name)).toEqual([`n:${natureOf(h, 'basic')}:impact`, `v:${h}:basic`]);
  });

  it.each(BATCH)('%s: an own motif ping (not the basic voice), short and under the caps', (h) => {
    const c = CHAMP_AUDIO[h];
    expect(c.motif).toBeTruthy();
    expect(c.motif).not.toEqual(IDENTITY[h].voice.basic.zzfx);
    expect(zzfxDuration(c.motif as number[])).toBeLessThanOrEqual(MIX.maxSeconds.cast);
    expect(c.motif![0]).toBeLessThanOrEqual(MIX.volCap.motif);
    for (const [k, z] of Object.entries(c.sounds ?? {})) {
      expect(defs[`c:${h}:${k}`], k).toBeTruthy();
      expect(zzfxDuration(z as number[]), k).toBeLessThanOrEqual(MIX.maxSeconds.ultVoice);
      expect(z[1], `${k}: deterministic bake`).toBe(0);
    }
    // the Q, W, E pings are not all the same pitch (a little melody across the kit)
    const r = c.motifRate ?? {};
    expect(new Set([r.q ?? 1, r.w ?? 1, r.e ?? 1]).size).toBeGreaterThan(1);
  });

  it('script-only moments resolve to champion sounds', () => {
    // Avietė's Charged proc: only her raspberry pop (the hit already played the electric impact)
    expect(planSkillSfx('aviete', 'passive', 'impact').map((p) => p.name)).toEqual(['c:aviete:drupe']);
    // Bengas's toast sizzles in flight on the fire travel layer
    expect(planSkillSfx('bengas', 'q', 'travel').map((p) => p.name)).toEqual(['n:fire:travel']);
    // Bravo's landing thud is the impact nature's
    expect(planSkillSfx('bravo', 'e', 'impact').map((p) => p.name)).toEqual(['n:impact:impact']);
    for (const n of ['c:bengas:crunch', 'c:bengas:roll', 'c:bravo:tada', 'c:brutus:anvil', 'c:brutus:crest', 'c:cacklejaw:hee']) expect(known(n), n).toBe(true);
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

describe('batch 1 motif painters', () => {
  it.each(BATCH)('%s: paints its motif in its colour pair on every skill, within the budget', (h) => {
    const paint = CHAMP_AUDIO[h].fx?.paint;
    expect(paint).toBeTruthy();
    const { primary, secondary } = IDENTITY[h].colors;
    for (const k of SKILL_KEYS)
      for (const n of [2, 6, 12]) {
        const f = fakePainter(h);
        expect(paint!(f.p, { x: 0, y: 0, z: 0 }, n, { x: 1, z: 0 }, k)).toBe(true);
        expect(f.used.has(primary) || f.used.has(secondary), `${h} ${k}`).toBe(true);
        expect(f.drawn()).toBeGreaterThan(0);
        // at most one sprite over (a grin needs 3 dots, a crest 2 sprites)
        expect(f.drawn(), `${h} ${k} n=${n}`).toBeLessThanOrEqual(Math.max(n + 1, 3));
      }
  });
});

// ------------------------------------------------------------------------------------------------ skill FX scripts

/** Sprites the fun kit emits, by colour (the scripts' stickers and showers draw through the fun sink). */
const sprites: { r: number; g: number; b: number }[] = [];
const particles = {
  begin: () => {
    const s = { r: 0, g: 0, b: 0 } as Record<string, number>;
    sprites.push(s as { r: number; g: number; b: number });
    return s;
  },
  emit: () => sprites.length - 1,
  scaled: (n: number) => n,
};
const C = new THREE.Color();
const drewColor = (hex: number): boolean => {
  C.set(hex);
  return sprites.some((s) => Math.abs(s.r - C.r) < 1e-4 && Math.abs(s.g - C.g) < 1e-4 && Math.abs(s.b - C.b) < 1e-4);
};

const FRAME = 1 / 60;
function fakeFx(hero: HeroId) {
  const meshes: { kind: MeshFxKind; color: number }[] = [];
  const pos: Record<number, { x: number; z: number }> = { 0: { x: 0, z: 0 }, 3: { x: 3, z: 0.4 } };
  const fx = {
    tier: 'high',
    reduced: false,
    mesh: { spawn: (kind: MeshFxKind, o: MeshFxSpawn) => (meshes.push({ kind, color: o.color }), meshes.length) },
    ribbons: { point: () => 1, feed: () => {}, end: () => {} },
    linger: { add: () => {} },
    particles: { lightning: () => {}, debris: () => {} },
    shock: { start: () => null },
    cam: { tier: () => {}, punch: () => {} },
    juice: { kick: () => {} },
    sfx: { cue: () => {} },
    lookup: { heroOf: (id: number) => (id === 0 ? hero : id === 3 ? 'clem' : null) },
    relation: (id: number) => (id === 0 ? 'own' : 'enemy'),
    rim: (id: number) => (id === 0 ? 0xffd34d : 0xff3040),
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
    status: () => false,
  } as unknown as FxCtx;
  return { fx, meshes, pos };
}

const ctx = { charged: false, recastIndex: 0, targetCc: false, buffs: 0 } as unknown as MoveCtx;
const cast = (slot: number, x = 3000, y = -400, target = 3) => ({ type: 'cast' as const, tick: 7, src: 0, slot: slot as 0 | 1 | 2 | 3, x, y, target });
const hit = (kind: 'basic' | 'ability', amount = 80) => ({ type: 'hit' as const, tick: 9, src: 0, dst: 3, kind, amount, shielded: 0 });
const step = (set: SkillFxSet, fx: FxCtx, s: number): void => {
  for (let t = 0; t < s; t += FRAME) set.update?.(FRAME, fx);
};

describe('batch 1 skill FX scripts stamp the champion motif', () => {
  beforeEach(() => {
    sprites.length = 0;
    setFunSink({ particles });
    resetAvieteFx();
    resetBengasFx();
    resetBrutusFx();
    resetCacklejawFx();
  });
  afterEach(() => setFunSink({}));

  const fresh = (): void => {
    sprites.length = 0;
  };

  it('Avietė: every skill ends in a raspberry', () => {
    const RASP = IDENTITY.aviete.colors.primary;
    const { fx } = fakeFx('aviete');
    for (const slot of [0, 1, 2, 3]) {
      fresh();
      AVIETE.onCast!(cast(slot), fx, ctx);
      if (slot === 1) step(AVIETE, fx, 0.4); // Shiny Coat: the shed sparks end in raspberry dots too
      expect(drewColor(RASP), `slot ${slot}`).toBe(true);
    }
    // the Charged proc
    fresh();
    AVIETE.onCast!(cast(0), fx, { ...ctx, charged: true } as MoveCtx);
    fresh();
    AVIETE.onHit!(hit('basic'), fx, ctx);
    expect(drewColor(RASP)).toBe(true);
  });

  it('Bengas: crumbs on his shots, camellia petals on the pose and the hop, crumbs on every curtain pulse', () => {
    const { primary: CRIMSON, secondary: GOLD } = IDENTITY.bengas.colors;
    const { fx } = fakeFx('bengas');
    fresh();
    BENGAS.onHit!(hit('basic'), fx, ctx);
    expect(drewColor(GOLD)).toBe(true);
    for (const slot of [1, 2]) {
      fresh();
      BENGAS.onCast!(cast(slot), fx, ctx);
      expect(drewColor(CRIMSON), `slot ${slot}`).toBe(true);
    }
    fresh();
    BENGAS.onCast!(cast(3), fx, ctx);
    step(BENGAS, fx, 1.0);
    expect(drewColor(GOLD)).toBe(true);
  });

  it('Bravo: a puddle of tears, a spotlight onto the stage boards, spotlights on the charmed', () => {
    const { fx, meshes } = fakeFx('bravo');
    // ENCORE!: cream confetti, then a small spotlight over each hero it charms
    fresh();
    BRAVO.onCast!(cast(3), fx, ctx);
    expect(drewColor(IDENTITY.bravo.colors.secondary)).toBe(true);
    meshes.length = 0;
    BRAVO.onHit!(hit('ability'), fx, ctx);
    expect(meshes.some((m) => m.kind === 'pillar' && m.color === IDENTITY.bravo.colors.secondary)).toBe(true);
    // Stage Dive lands out of a spotlight onto the boards
    meshes.length = 0;
    BRAVO.onMarker!(0, 'bravo.e', 'bv:dive', fx);
    expect(meshes.some((m) => m.kind === 'pillar')).toBe(true);
    expect(meshes.filter((m) => m.kind === 'ring').length).toBe(2);
  });

  it('Sir Brutus: his crest on the slam, the wall, the charge hit, the arena and the Honour bash', () => {
    const STEEL = IDENTITY.brutus.colors.secondary;
    const SAND = IDENTITY.brutus.colors.primary;
    const { fx } = fakeFx('brutus');
    for (const slot of [0, 1, 3]) {
      fresh();
      BRUTUS.onCast!(cast(slot), fx, ctx);
      expect(drewColor(STEEL) && drewColor(SAND), `slot ${slot}`).toBe(true);
    }
    BRUTUS.onCast!(cast(2), fx, ctx);
    fresh();
    BRUTUS.onHit!(hit('ability'), fx, ctx);
    expect(drewColor(STEEL)).toBe(true);
    fresh();
    BRUTUS.onMarker!(0, 'brutus.basicC', 'honour', fx);
    expect(drewColor(STEEL)).toBe(true);
  });

  it('Cacklejaw: lime grins on the dash, the gloat, the slink (own team), the hunt mark and the flank', () => {
    const LIME = IDENTITY.cacklejaw.colors.secondary;
    const { fx, pos } = fakeFx('cacklejaw');
    // Jeer Slash: a row of grins along the travelled path once the dash ends
    CACKLEJAW.onCast!(cast(0), fx, ctx);
    fresh();
    pos[0] = { x: 3.5, z: 0 };
    step(CACKLEJAW, fx, 0.6);
    expect(drewColor(LIME)).toBe(true);
    pos[0] = { x: 0, z: 0 };
    for (const slot of [1, 2]) {
      fresh();
      CACKLEJAW.onCast!(cast(slot), fx, ctx);
      expect(drewColor(LIME), `slot ${slot}`).toBe(true);
    }
    // Pack Hunt: the mark is a big grin over the hunted hero
    fresh();
    CACKLEJAW.onCast!(cast(3), fx, ctx);
    step(CACKLEJAW, fx, 0.1);
    expect(drewColor(LIME)).toBe(true);
  });

  it('Cacklejaw: an enemy Bush Slink leaves no grin', () => {
    const { fx } = fakeFx('cacklejaw');
    (fx as unknown as { relation: (id: number) => string }).relation = () => 'enemy';
    fresh();
    CACKLEJAW.onCast!(cast(2), fx, ctx);
    expect(drewColor(IDENTITY.cacklejaw.colors.secondary)).toBe(false);
  });
});
