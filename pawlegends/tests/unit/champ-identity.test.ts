/** Champion identity data (src/data/identity.ts, docs/plans/moba/CHAMP-IDENTITY.md): complete, short, readable, distinct. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PL_SFX } from '../../src/audio/sfx';
import { zzfxDuration } from '../../src/audio/sfxDefs.js';
import { HERO_IDS } from '../../src/data/heroes';
import { IDENTITY, MIX, NATURE, NATURES, SKILL_KEYS, natureOf, type Zzfx } from '../../src/render/identity';
import { SHAPE } from '../../src/render/fx/Particles.js';
import { RELATION } from '../../src/render/palette';

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const dist = (a: number, b: number): number => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
const ok = (z: Zzfx, maxS: number, maxVol: number): void => {
  expect(z).toHaveLength(21);
  for (const n of z) expect(Number.isFinite(n)).toBe(true);
  expect(z[0]).toBeLessThanOrEqual(maxVol);
  expect(z[1]).toBe(0); // deterministic bakes: variety comes from the playback rate
  expect(zzfxDuration(z as number[])).toBeLessThanOrEqual(maxS + 1e-9);
};

describe('skill natures', () => {
  it('has 10 to 14 natures, each with short, capped sounds and a real particle shape', () => {
    expect(NATURES.length).toBeGreaterThanOrEqual(10);
    expect(NATURES.length).toBeLessThanOrEqual(14);
    for (const n of NATURES) {
      const r = NATURE[n];
      ok(r.cast, MIX.maxSeconds.cast, MIX.volCap.cast);
      ok(r.impact, MIX.maxSeconds.impact, MIX.volCap.impact);
      if (r.travel) ok(r.travel, MIX.maxSeconds.travel, MIX.volCap.travel);
      expect(SHAPE).toHaveProperty(r.vfx.shape);
    }
  });

  it('every nature is used by some skill', () => {
    const used = new Set(HERO_IDS.flatMap((h) => SKILL_KEYS.map((k) => IDENTITY[h].skills[k].nature)));
    for (const n of NATURES) expect(used.has(n), n).toBe(true);
  });
});

describe('champion traits', () => {
  it('covers every hero and every skill (basic, passive, Q/W/E/R)', () => {
    expect(Object.keys(IDENTITY).sort()).toEqual([...HERO_IDS].sort());
    for (const h of HERO_IDS) {
      const c = IDENTITY[h];
      expect(c.hero).toBe(h);
      expect(SHAPE).toHaveProperty(c.motif.shape);
      for (const k of SKILL_KEYS) {
        expect(NATURES).toContain(c.skills[k].nature);
        expect(c.skills[k].motif.length).toBeGreaterThan(8);
      }
    }
    expect(natureOf('clem', 0)).toBe('slash');
    expect(natureOf('marshmallow', 'r')).toBe('frost');
  });

  it('Q/W/E/R names match the ability docs in data/heroes (a renamed ability is renamed here too)', () => {
    for (const h of HERO_IDS) {
      const src = readFileSync(new URL(`../../src/data/heroes/${h}.ts`, import.meta.url), 'utf8');
      for (const k of ['q', 'w', 'e', 'r'] as const) expect(src, `${h} ${k}`).toContain(`* ${IDENTITY[h].skills[k].name}:`);
    }
  });

  it('voices are short and capped; a reused voice matches its PL_SFX sound', () => {
    const pl = PL_SFX as unknown as Record<string, number[]>;
    for (const h of HERO_IDS) {
      const v = IDENTITY[h].voice;
      ok(v.basic.zzfx, MIX.maxSeconds.basicVoice, MIX.volCap.basicVoice);
      ok(v.ult.zzfx, MIX.maxSeconds.ultVoice, MIX.volCap.ultVoice);
      for (const x of [v.basic, v.ult]) {
        if (!x.reuse) continue;
        expect(pl[x.reuse], x.reuse).toBeDefined();
        expect(x.zzfx.slice(1)).toEqual(pl[x.reuse].slice(1));
      }
    }
  });

  it('timbres and traits are all different', () => {
    expect(new Set(HERO_IDS.map((h) => IDENTITY[h].timbre)).size).toBe(HERO_IDS.length);
    expect(new Set(HERO_IDS.map((h) => IDENTITY[h].trait)).size).toBe(HERO_IDS.length);
  });

  it('colour pairs are distinct and no primary is a relation colour', () => {
    const ids = HERO_IDS;
    for (let i = 0; i < ids.length; i++) {
      const a = IDENTITY[ids[i]].colors;
      for (const r of [RELATION.ally, RELATION.enemy, RELATION.self]) expect(dist(a.primary, r), ids[i]).toBeGreaterThanOrEqual(50);
      for (let j = i + 1; j < ids.length; j++) {
        const b = IDENTITY[ids[j]].colors;
        // a pair reads apart when the primaries differ, or the primaries are close but the secondaries differ a lot
        const d = dist(a.primary, b.primary) + 0.5 * dist(a.secondary, b.secondary);
        expect(d, `${ids[i]} vs ${ids[j]}`).toBeGreaterThanOrEqual(70);
      }
    }
  });
});
