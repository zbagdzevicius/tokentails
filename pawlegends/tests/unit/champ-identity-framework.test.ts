/**
 * Champion identity framework (CHAMP-IDENTITY.md §4–§5): every hero's every skill resolves to a nature with sound and
 * VFX, every planned sound is baked, the champion files are all registered, and the mix obeys its caps.
 */
import { describe, expect, it } from 'vitest';
import { CHAMP_AUDIO } from '../../src/audio/champ';
import { MIX_LAYERS, VoiceMixer, cappedVol, mixPriority, relationGain, type MixRequest } from '../../src/audio/identityMix';
import { PL_SFX } from '../../src/audio/sfx';
import { zzfxDuration } from '../../src/audio/sfxDefs.js';
import { basicVoiceAllowed, identityDefs, planSkillSfx, skillKey } from '../../src/audio/skillSfx';
import { HERO_IDS } from '../../src/data/heroes';
import { MIX, NATURE, NATURES, SKILL_KEYS, natureOf } from '../../src/render/identity';
import { NATURE_FX, NATURE_FX_BUDGET, NatureFx } from '../../src/render/fx/natureFx';
import { SHAPE } from '../../src/render/fx/Particles.js';

const { defs, aliases } = identityDefs();
const known = (n: string): boolean => n in defs || n in aliases || n in PL_SFX;

describe('champion identity framework', () => {
  it('registers one champion file per hero', () => {
    expect(Object.keys(CHAMP_AUDIO).sort()).toEqual([...HERO_IDS].sort());
    for (const h of HERO_IDS) expect(CHAMP_AUDIO[h].hero).toBe(h);
  });

  it('maps every hero skill to a nature with sound and VFX', () => {
    for (const h of HERO_IDS)
      for (const k of SKILL_KEYS) {
        const n = natureOf(h, k);
        expect(NATURES).toContain(n);
        expect(NATURE[n].cast.length).toBeGreaterThan(0);
        expect(NATURE_FX[n]).toBeTruthy();
      }
    for (const n of NATURES) {
      expect(defs[`n:${n}:cast`]).toBeTruthy();
      expect(defs[`n:${n}:impact`]).toBeTruthy();
      expect(NATURE_FX[n].shape in SHAPE).toBe(true);
      expect(NATURE_FX[n].count.cast).toBeGreaterThan(0);
    }
  });

  it('plans baked sounds for every hero, skill and phase', () => {
    for (const h of HERO_IDS)
      for (const k of SKILL_KEYS)
        for (const ph of ['cast', 'impact', 'travel'] as const)
          for (const p of planSkillSfx(h, k, ph, true)) expect(known(p.name), `${h} ${k} ${ph} ${p.name}`).toBe(true);
  });

  it('casts play the nature layer and the champion layer', () => {
    for (const h of HERO_IDS) {
      const q = planSkillSfx(h, 0, 'cast');
      expect(q[0].name).toBe(`n:${natureOf(h, 'q')}:cast`);
      expect(q.some((p) => p.layer === 'motif')).toBe(true);
      const r = planSkillSfx(h, 3, 'cast');
      expect(r.some((p) => p.layer === 'ultVoice' && p.name === `v:${h}:ult`)).toBe(true);
      expect(planSkillSfx(h, 'basic', 'impact', true).some((p) => p.layer === 'basicVoice')).toBe(true);
      expect(planSkillSfx(h, 'basic', 'impact', false).some((p) => p.layer === 'basicVoice')).toBe(false);
    }
    expect(skillKey(2)).toBe('e');
    expect(skillKey(9)).toBe('basic');
  });

  it('keeps the champion sounds short and under their caps', () => {
    for (const h of HERO_IDS) {
      const c = CHAMP_AUDIO[h];
      if (c.motif) {
        expect(zzfxDuration(c.motif as number[])).toBeLessThanOrEqual(MIX.maxSeconds.cast + 1e-9);
        expect(c.motif[0]).toBeLessThanOrEqual(MIX.volCap.basicVoice);
      }
      for (const z of Object.values(c.sounds ?? {})) expect(zzfxDuration(z as number[])).toBeLessThanOrEqual(MIX.maxSeconds.ultVoice + 1e-9);
    }
  });
});

const req = (o: Partial<MixRequest>): MixRequest => ({ name: 'x', layer: 'cast', priority: 3, relation: 'enemy', vol: 0.4, baked: 0.4, dur: 0.3, ...o });

describe('identity mix', () => {
  it('caps every layer volume', () => {
    for (const l of MIX_LAYERS) {
      const m = new VoiceMixer();
      const d = m.admit(req({ layer: l, vol: 5, baked: 0.5, relation: 'mine' }), 0)!;
      const cap = l === 'motif' ? MIX.volCap.motif : MIX.volCap[l as keyof typeof MIX.volCap];
      expect(d.gain * 0.5).toBeLessThanOrEqual(cap * MIX.relationGain.mine + 1e-9);
      expect(cappedVol(l, 5)).toBe(cap);
    }
    expect(relationGain('ally')).toBe(MIX.relationGain.ally);
  });

  it('drops a repeat inside the layer window and lets it through after', () => {
    const m = new VoiceMixer();
    expect(m.admit(req({}), 0)).not.toBeNull();
    expect(m.admit(req({}), 0.03)).toBeNull();
    expect(m.admit(req({}), 0.07)).not.toBeNull();
  });

  it('steals the oldest lower-priority voice of the same hero, never an equal one', () => {
    const m = new VoiceMixer();
    for (let i = 0; i < MIX.maxPerHero; i++) {
      const r = req({ name: `a${i}`, hero: 'clem', priority: 2 });
      m.admit(r, i * 0.01);
      m.add(r, i * 0.01, null);
    }
    expect(m.admit(req({ name: 'b', hero: 'clem', priority: 2 }), 0.05)).toBeNull();
    const d = m.admit(req({ name: 'c', hero: 'clem', priority: mixPriority({ relation: 'mine', ult: true }) }), 0.05)!;
    expect(d.steals.map((v) => v.name)).toEqual(['a0']);
  });

  it('holds at most MIX.maxVoices and ducks once busy', () => {
    const m = new VoiceMixer();
    let gainBusy = 0;
    for (let i = 0; i < MIX.maxVoices; i++) {
      const r = req({ name: `v${i}`, nature: `n${i}`, hero: `h${i}`, priority: 1 });
      const d = m.admit(r, 0)!;
      if (i === MIX.duckAt) gainBusy = d.gain;
      m.add(r, 0, null);
    }
    expect(gainBusy).toBeCloseTo((0.4 * MIX.duckGain) / 0.4);
    expect(m.admit(req({ name: 'late', priority: 1 }), 0.01)).toBeNull();
    expect(m.admit(req({ name: 'ult', priority: MIX.priority.myUlt }), 0.01)).not.toBeNull();
  });

  it('thins other heroes basic voices by range and count', () => {
    expect(basicVoiceAllowed('mine', 99, 1)).toBe(true);
    expect(basicVoiceAllowed('enemy', 4, 0)).toBe(true);
    expect(basicVoiceAllowed('enemy', 4, 1)).toBe(false);
    expect(basicVoiceAllowed('ally', MIX.basicVoiceRange + 1, 0)).toBe(false);
  });
});

describe('nature VFX', () => {
  const fake = () => {
    let n = 0;
    const count = (_p: unknown, o: { n?: number }): void => {
      n += o.n ?? 1;
    };
    const particles = { burst: count, single: () => void n++, ring: count };
    const shock = { start: () => undefined, crack: () => undefined };
    return { fx: new NatureFx(particles as never, shock as never), drawn: () => n };
  };

  it('draws every hero skill phase within the quality budget', () => {
    const { fx } = fake();
    fx.setTier('low', false);
    for (const h of HERO_IDS)
      for (const k of SKILL_KEYS) {
        fx.tick(0.1);
        const before = fx.spent;
        fx.skillFx(h, k, 'cast', { x: 0, y: 0, z: 0 }, { x: 1, z: 0 });
        fx.skillFx(h, k, 'impact', { x: 0, y: 0, z: 0 });
        expect(fx.spent - before).toBeGreaterThan(0);
        expect(fx.spent - before).toBeLessThanOrEqual(NATURE_FX_BUDGET.low);
      }
  });

  it('stops once a window is spent', () => {
    const { fx } = fake();
    fx.setTier('low', true);
    for (let i = 0; i < 50; i++) fx.motifBurst('domino', { x: 0, y: 0, z: 0 }, 6);
    expect(fx.spent).toBeLessThanOrEqual(NATURE_FX_BUDGET.low);
  });
});
