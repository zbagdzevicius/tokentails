/**
 * Champion identity, batch 3 (gabe, howler, lambo, marshmallow, meatball): every skill plays its nature layer plus the
 * hero's own layer, the hero's own sounds replace the generic stand-ins, the motif painter draws in the colour pair,
 * and the skill FX scripts no longer double the identity voices.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAMP_AUDIO } from '../../src/audio/champ';
import type { MotifPainter } from '../../src/audio/champ/types';
import { sfx } from '../../src/audio/sfx';
import { identityDefs, planSkillSfx } from '../../src/audio/skillSfx';
import type { HeroId } from '../../src/data/heroes/types';
import { IDENTITY, SKILL_KEYS, natureOf } from '../../src/data/identity';
import { NatureFx } from '../../src/render/fx/natureFx';
import { SHAPE } from '../../src/render/fx/Particles.js';
import type { FxCtx } from '../../src/render/anim/types';
import { PROJECTILE_KIND } from '../../src/data/towers';
import { SKILL_FX as HOWLER_FX } from '../../src/render/skillfx/howler';
import { SKILL_FX as MARSH_FX } from '../../src/render/skillfx/marshmallow';
import { SKILL_FX as MEATBALL_FX, resetMeatballFx } from '../../src/render/skillfx/meatball';
import { SKILL_FX as LAMBO_FX, resetLamboFx } from '../../src/render/skillfx/lambo';

const BATCH: readonly HeroId[] = ['gabe', 'howler', 'lambo', 'marshmallow', 'meatball'];
const { defs, aliases } = identityDefs();
const names = (h: HeroId, k: Parameters<typeof planSkillSfx>[1], ph: 'cast' | 'impact' | 'travel', voice = false): string[] => planSkillSfx(h, k, ph, voice).map((p) => p.name);

describe('batch 3 champion sounds', () => {
  it('every skill cast plays its nature layer and the champion layer', () => {
    for (const h of BATCH)
      for (const k of ['q', 'w', 'e', 'r'] as const) {
        const plan = planSkillSfx(h, k, 'cast');
        expect(plan[0].name, `${h} ${k}`).toBe(`n:${natureOf(h, k)}:cast`);
        expect(plan.some((p) => p.layer === (k === 'r' ? 'ultVoice' : 'motif')), `${h} ${k}`).toBe(true);
      }
  });

  it('has its own motif ping in its timbre, not the basic voice stand-in', () => {
    for (const h of BATCH) {
      const m = CHAMP_AUDIO[h].motif!;
      expect(m, h).toBeTruthy();
      expect(m.join(), h).not.toBe(IDENTITY[h].voice.basic.zzfx.join());
      expect(defs[`c:${h}:motif`], h).toBeTruthy();
    }
  });

  it('wires the hero sounds onto the right skills', () => {
    expect(names('meatball', 'q', 'impact')).toEqual(['n:impact:impact', 'c:meatball:pins']);
    expect(names('meatball', 'w', 'cast')).toEqual(['n:guard:cast', 'c:meatball:yawn']);
    expect(names('meatball', 'e', 'impact')).toEqual(['n:mobility:impact', 'c:meatball:pins']);
    expect(names('gabe', 'q', 'impact')).toEqual(['n:heal:impact', 'c:gabe:balloonPop']);
    expect(names('gabe', 'w', 'impact')).toEqual(['n:guard:impact', 'c:gabe:wingFlutter']);
    expect(names('gabe', 'r', 'impact')).toEqual(['n:arcane:impact', 'c:gabe:charm']);
    expect(names('howler', 'q', 'cast')).toEqual(['n:sonic:cast', 'howlerAwoo']);
    expect(names('howler', 'e', 'cast')).toEqual(['n:guard:cast', 'howlerArgue']);
    expect(names('howler', 'r', 'cast')).toEqual(['n:sonic:cast', 'v:howler:ult']);
    expect(aliases['v:howler:ult']).toBe('howlerScream');
    expect(names('lambo', 'q', 'impact')).toEqual(['n:splash:impact', 'c:lambo:can']);
    expect(names('lambo', 'e', 'impact')).toEqual(['n:impact:impact', 'c:lambo:bulbRing']);
    expect(names('lambo', 'r', 'impact')).toEqual(['n:electric:impact', 'c:lambo:tink']);
    expect(names('marshmallow', 'q', 'impact')).toEqual(['n:frost:impact', 'marshPoof']);
    expect(names('marshmallow', 'q', 'travel')).toEqual(['n:frost:travel']);
    expect(names('marshmallow', 'r', 'impact')).toEqual(['n:frost:impact', 'c:marshmallow:freeze']);
    expect(aliases['v:marshmallow:ult']).toBe('marshAwoo');
  });

  it('keeps the basic voice on basics', () => {
    for (const h of BATCH) expect(names(h, 'basic', 'impact', true)).toContain(`v:${h}:basic`);
  });
});

describe('batch 3 motif VFX', () => {
  it('paints every skill in the colour pair with the motif shape', () => {
    for (const h of BATCH) {
      const paint = CHAMP_AUDIO[h].fx?.paint;
      expect(paint, h).toBeTruthy();
      for (const k of SKILL_KEYS) {
        const colors = new Set<number>();
        let n = 0;
        const take = (_p: unknown, o: Record<string, unknown>): void => {
          n += (o.n as number | undefined) ?? 1;
          colors.add(o.color as number);
        };
        const p: MotifPainter = { burst: take, single: take, ring: take, shape: SHAPE as unknown as Record<string, number>, colors: { ...IDENTITY[h].colors } };
        expect(paint!(p, { x: 0, y: 0, z: 0 }, 6, { x: 1, z: 0 }, k), `${h} ${k}`).toBe(true);
        expect(n, `${h} ${k}`).toBeGreaterThan(0);
        const pair = [IDENTITY[h].colors.primary, IDENTITY[h].colors.secondary];
        expect([...colors].some((c) => pair.includes(c)), `${h} ${k}`).toBe(true);
      }
    }
  });

  it('draws nature + motif within the low budget', () => {
    const particles = { burst: () => undefined, single: () => undefined, ring: () => undefined };
    const fx = new NatureFx(particles as never, { start: () => undefined, crack: () => undefined } as never);
    fx.setTier('low', false);
    for (const h of BATCH)
      for (const k of SKILL_KEYS) {
        fx.tick(0.1);
        const before = fx.spent;
        fx.skillFx(h, k, 'cast', { x: 0, y: 0, z: 0 }, { x: 1, z: 0 });
        expect(fx.spent - before).toBeGreaterThan(0);
      }
  });
});

/** A do-nothing FxCtx for the skill FX scripts (every pool returns -1, every hero stands at the origin). */
function stubFx(relation: 'own' | 'ally' | 'enemy' = 'own'): FxCtx {
  const nop = (): number => -1;
  return {
    tier: 'med',
    reduced: false,
    mesh: { spawn: nop },
    ribbons: { point: nop, feed: nop, end: nop },
    linger: { add: nop },
    particles: { lightning: nop, debris: nop },
    shock: { start: nop },
    cam: { tier: nop, punch: nop, shake: nop },
    juice: {},
    sfx: { cue: vi.fn() },
    relation: () => relation,
    rim: () => 0xffffff,
    abil: () => ({ range: 6000, radius: 3000, arc: 90, duration: 60, touch: 1200, cooldown: 100 }),
    heroPos: (_id: number, out: { x: number; y: number; z: number }) => ((out.x = 0), (out.y = 0), (out.z = 0), true),
    bonePos: () => false,
  } as unknown as FxCtx;
}

describe('batch 3 skill FX scripts', () => {
  afterEach(() => vi.restoreAllMocks());

  const cast = (slot: number) => ({ type: 'cast', src: 1, slot, x: 3000, y: 0, tick: 10 }) as never;

  it('Howler and Marshmallow no longer double their ult voice (the identity layer plays it)', () => {
    const play = vi.spyOn(sfx, 'play');
    HOWLER_FX.onCast!(cast(3), stubFx(), {} as never);
    HOWLER_FX.onCast!(cast(0), stubFx(), {} as never);
    HOWLER_FX.onCast!(cast(2), stubFx(), {} as never);
    MARSH_FX.onCast!(cast(3), stubFx(), {} as never);
    const played = play.mock.calls.map((c) => c[0]);
    for (const n of ['howlerScream', 'howlerAwoo', 'howlerArgue', 'marshAwoo']) expect(played).not.toContain(n);
  });

  it('Meatball and Lambo drop the generic move cues', () => {
    resetMeatballFx();
    resetLamboFx();
    const fx = stubFx();
    for (let s = 0; s < 4; s++) {
      MEATBALL_FX.onCast!(cast(s), fx, {} as never);
      LAMBO_FX.onCast!(cast(s), fx, {} as never);
    }
    MEATBALL_FX.update!(1, fx);
    LAMBO_FX.update!(1, fx);
    const cues = (fx.sfx.cue as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    for (const n of ['whooshL', 'whooshM', 'bodyThud', 'pop', 'chain', 'lightsJingle', 'kiss']) expect(cues).not.toContain(n);
  });

  it('the scripts play identity sounds at the moments only they see', () => {
    const layer = vi.spyOn(sfx, 'playLayer');
    resetMeatballFx();
    const fx = stubFx();
    MEATBALL_FX.onCast!(cast(2), fx, {} as never);
    MEATBALL_FX.update!(2, fx);
    expect(layer.mock.calls.map((c) => c[0].name)).toContain('c:meatball:pins');
    layer.mockClear();
    const mfx = { ...stubFx(), lookup: { heroOf: () => 'marshmallow' }, projPos: (_i: number, o: { x: number; y: number; z: number }) => ((o.x = 1), (o.y = 1), (o.z = 0), true) };
    MARSH_FX.onProjectile!(1, PROJECTILE_KIND.fluff, 0, mfx as never, 0);
    expect(layer.mock.calls.map((c) => c[0].name)).toContain('n:frost:travel');
    // re-rung while the snowball flies
    layer.mockClear();
    MARSH_FX.update!(0.45, mfx as never);
    expect(layer.mock.calls.map((c) => c[0].name)).toContain('n:frost:travel');
  });
});
