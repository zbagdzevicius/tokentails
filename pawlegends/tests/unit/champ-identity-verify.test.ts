/**
 * Champion identity, final pass (CHAMP-IDENTITY.md): every hero's every skill plays its nature plus a champion layer
 * and draws its nature plus its motif; the shared script helpers (render/skillfx/identityFx.ts) keep gold for "you";
 * the framework's own motif bursts pale gold on enemies; every hero script uses the shared helpers instead of a copy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAMP_AUDIO } from '../../src/audio/champ';
import { planSkillSfx } from '../../src/audio/skillSfx';
import { HERO_IDS } from '../../src/data/heroes';
import { IDENTITY, natureOf } from '../../src/data/identity';
import { NATURE_FX, NatureFx, motifColors, paleGold } from '../../src/render/fx/natureFx';
import { MIX_REL } from '../../src/render/skillfx/identityFx';

const KEYS = ['q', 'w', 'e', 'r'] as const;

/** A saturated gold (hue 38°–58°, saturation ≥ 0.55, lightness 0.35–0.8): what an enemy must never draw. */
const isGold = (c: number): boolean => paleGold(c) !== c;

function fakeParticles() {
  const colors: number[] = [];
  const rec = (_p: unknown, o: Record<string, unknown>) => {
    if (typeof o.color === 'number') colors.push(o.color);
  };
  return { colors, p: { burst: rec, single: rec, ring: rec } };
}

describe('champion identity: every skill has nature + motif', () => {
  it('Q/W/E casts play the nature layer and a champion layer; R plays the nature and the ult voice', () => {
    for (const h of HERO_IDS)
      for (const k of KEYS) {
        const plan = planSkillSfx(h, k, 'cast');
        const nature = natureOf(h, k);
        const champ = plan.filter((p) => p.layer === 'motif' || p.layer === 'ultVoice' || p.name.startsWith(`c:${h}:`));
        // the nature layer, or a champion sound that replaces it on purpose (replace: true)
        const replaced = CHAMP_AUDIO[h].skills?.[k]?.cast;
        if (!(replaced && replaced.replace)) expect(plan.some((p) => p.name === `n:${nature}:cast`), `${h} ${k} nature`).toBe(true);
        expect(champ.length, `${h} ${k} champion layer`).toBeGreaterThan(0);
        if (k === 'r') expect(plan.some((p) => p.layer === 'ultVoice'), `${h} r ult voice`).toBe(true);
      }
  });

  it('every skill cast and impact draws its nature colour and the motif colours, within the tier budget', () => {
    for (const h of HERO_IDS)
      for (const k of KEYS) {
        const { colors, p } = fakeParticles();
        const fx = new NatureFx(p as never, null);
        fx.setTier('high', false);
        fx.skillFx(h, k, 'cast', { x: 0, y: 0, z: 0 }, { x: 1, z: 0 });
        expect(colors, `${h} ${k} nature`).toContain(NATURE_FX[natureOf(h, k)].color);
        const c = IDENTITY[h].colors;
        expect(colors.includes(c.primary) || colors.includes(c.secondary), `${h} ${k} motif`).toBe(true);
        expect(fx.spent).toBeLessThanOrEqual(110);
      }
  });

  it('enemy motifs never draw saturated gold (gold means "you")', () => {
    for (const h of HERO_IDS) {
      const out = { primary: 0, secondary: 0 };
      motifColors(h, true, out);
      expect(isGold(out.primary), `${h} primary`).toBe(false);
      expect(isGold(out.secondary), `${h} secondary`).toBe(false);
      motifColors(h, false, out);
      expect(out).toEqual(IDENTITY[h].colors);
      const { colors, p } = fakeParticles();
      const fx = new NatureFx(p as never, null);
      for (const k of KEYS) fx.motifBurst(h, { x: 0, y: 0, z: 0 }, 6, null, k, true);
      for (const col of colors) {
        if (col === IDENTITY[h].colors.primary || col === IDENTITY[h].colors.secondary) expect(isGold(col), `${h} drew gold on an enemy`).toBe(false);
      }
    }
    expect(paleGold(0xe8b020)).not.toBe(0xe8b020); // mustard
    expect(paleGold(0xffcf4a)).not.toBe(0xffcf4a); // crown gold
    expect(paleGold(0xc83a8c)).toBe(0xc83a8c); // raspberry
    expect(paleGold(0x1e1a2a)).toBe(0x1e1a2a); // ink
  });

  it('maps viewer relations onto the mix', () => {
    expect(MIX_REL).toEqual({ own: 'mine', ally: 'ally', enemy: 'enemy' });
  });

  it('hero scripts use the shared identity helpers, not a copy', () => {
    const dir = path.resolve(__dirname, '../../src/render/skillfx');
    for (const h of HERO_IDS) {
      const src = fs.readFileSync(path.join(dir, `${h}.ts`), 'utf8');
      expect(src, h).not.toMatch(/const MIX_?REL\s*[:=]/);
      expect(src, h).not.toMatch(/^function natureAccent\(/m);
    }
  });
});
