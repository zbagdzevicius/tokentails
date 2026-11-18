/**
 * Spell sounds (audio/spellSfx.ts; founder ask Nov 18: "spells (like flash) lack in-game sound"). Every Paw Trick and
 * the Nap has its own procedural sounds; every hero's Q/W/E/R has a cast sound; the plays go through the identity mix
 * (voice caps, relation gain, distance) and an unseen caster makes no sound.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PCM_RATE, zzfxDuration, zzfxSamples } from '../../src/audio/sfxDefs.js';
import { sfx } from '../../src/audio/sfx';
import { VoiceMixer, mixPriority } from '../../src/audio/identityMix';
import { planSkillSfx } from '../../src/audio/skillSfx';
import { SPELL_DEFS, SPELL_IDS, SPELL_SFX, planSpellSfx, playSpellSfx, pounceLanding, spellAudible, spellSound, type SpellSound } from '../../src/audio/spellSfx';
import { TRICK_IDS, TRICKS } from '../../src/data/tricks';
import { HERO_IDS } from '../../src/data/heroes';

const ROOT = join(__dirname, '../..');

afterEach(() => vi.restoreAllMocks());

describe('the spell sound library', () => {
  it('each sound bakes to short, finite, audible PCM (≤ 0.5 s)', () => {
    for (const [k, p] of Object.entries(SPELL_DEFS)) {
      expect(zzfxDuration(p), k).toBeLessThanOrEqual(0.5);
      const pcm = zzfxSamples(p, PCM_RATE);
      expect(pcm.length, k).toBeGreaterThan(PCM_RATE * 0.08);
      let peak = 0;
      for (const v of pcm) {
        expect(Number.isFinite(v), k).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak, k).toBeGreaterThan(0.05);
      expect(peak, k).toBeLessThanOrEqual(1.01);
    }
  });

  it('the sounds are distinct (no two defs alike)', () => {
    const seen = new Set(Object.values(SPELL_DEFS).map((p) => p.join(',')));
    expect(seen.size).toBe(Object.keys(SPELL_DEFS).length);
  });

  it('the bake knows every spell sound by its sp: name', () => {
    for (const k of Object.keys(SPELL_DEFS)) expect(sfx.knows(spellSound(k as SpellSound)), k).toBe(true);
  });
});

describe('the spell map', () => {
  it('every Paw Trick and the Nap has a cast sound, and every layer names a real sound', () => {
    expect(SPELL_IDS).toEqual([...TRICK_IDS, 'nap']);
    for (const id of SPELL_IDS) {
      const cast = planSpellSfx(id, 'cast');
      expect(cast.length, id).toBeGreaterThan(0);
      for (const l of [...cast, ...planSpellSfx(id, 'cancel')]) {
        expect(l.sound in SPELL_DEFS, `${id} ${l.sound}`).toBe(true);
        expect(l.vol).toBeGreaterThan(0);
        expect(l.vol).toBeLessThanOrEqual(0.6);
      }
    }
    expect(planSpellSfx('nap', 'cancel').length).toBe(1);
  });

  it('each Trick sounds different from the others (its own lead sound)', () => {
    const leads = TRICK_IDS.map((t) => SPELL_SFX[t].cast![0].sound);
    expect(new Set(leads).size).toBe(TRICK_IDS.length);
  });

  it('Pounce (the Flash) is a whoosh where it leaves and a sparkle where it lands', () => {
    expect(planSpellSfx('pounce').map((l) => `${l.sound}@${l.where}`)).toEqual(['blinkOut@src', 'blinkIn@dest']);
    const max = TRICKS.pounce.blink / 1000;
    expect(pounceLanding({ x: 0, z: 0 }, { x: 10, z: 0 })).toEqual({ x: max, z: 0 });
    expect(pounceLanding({ x: 1, z: 1 }, { x: 2, z: 1 })).toEqual({ x: 2, z: 1 });
  });

  it("every hero's Q, W, E and R has a cast sound and an impact sound", () => {
    for (const h of HERO_IDS)
      for (const k of ['q', 'w', 'e', 'r'] as const) {
        expect(planSkillSfx(h, k, 'cast').length, `${h} ${k} cast`).toBeGreaterThan(0);
        expect(planSkillSfx(h, k, 'impact').length, `${h} ${k} impact`).toBeGreaterThan(0);
      }
  });
});

describe('who hears a spell', () => {
  it("the player's own always; others only while seen (brush, fog, stealth: silent)", () => {
    expect(spellAudible('mine', false)).toBe(true);
    expect(spellAudible('enemy', false)).toBe(false);
    expect(spellAudible('ally', false)).toBe(false);
    expect(spellAudible('enemy', true)).toBe(true);
    expect(spellAudible('enemy', undefined)).toBe(true);
  });

  it('an unseen enemy Pounce plays nothing; a seen one plays both layers at their spots', () => {
    const spy = vi.spyOn(sfx, 'playLayer').mockReturnValue(true);
    expect(playSpellSfx('pounce', 'cast', { at: { x: 5, z: 5 }, dest: { x: 9, z: 5 }, relation: 'enemy', visible: false, hero: 'clem' })).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(playSpellSfx('pounce', 'cast', { at: { x: 5, z: 5 }, dest: { x: 9, z: 5 }, relation: 'enemy', visible: true, hero: 'clem' })).toBe(2);
    const calls = spy.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.name)).toEqual(['sp:blinkOut', 'sp:blinkIn']);
    expect(calls[0].at).toEqual({ x: 5, z: 5 });
    expect(calls[1].at).toEqual({ x: 9, z: 5 });
    expect(calls.every((c) => c.layer === 'cast' && c.relation === 'enemy' && c.priority === mixPriority({ relation: 'enemy' }))).toBe(true);
  });

  it("the player's own: centred at the caster, higher priority, heard even when hidden", () => {
    const spy = vi.spyOn(sfx, 'playLayer').mockReturnValue(true);
    expect(playSpellSfx('snack', 'cast', { at: { x: 1, z: 2 }, relation: 'mine', visible: false, hero: 'sage' })).toBe(2);
    for (const [c] of spy.mock.calls) {
      expect(c.at).toBeUndefined();
      expect(c.relation).toBe('mine');
      expect(c.priority).toBeGreaterThan(mixPriority({ relation: 'enemy' }));
    }
  });
});

describe('a teamfight of spells', () => {
  it('the mix caps them: ten enemy Pounces at once never stack past the per-spell cap; the own one steals a slot', () => {
    const m = new VoiceMixer();
    let admitted = 0;
    for (let i = 0; i < 10; i++) {
      const d = m.admit({ name: `sp:blinkOut#${i}`, layer: 'cast', hero: `h${i}`, nature: 'spell:pounce', priority: mixPriority({ relation: 'enemy' }), relation: 'enemy', vol: 0.55, baked: 0.6, dur: 0.18 }, 1);
      if (d) {
        admitted++;
        m.add({ name: `sp:blinkOut#${i}`, layer: 'cast', hero: `h${i}`, nature: 'spell:pounce', priority: 3, relation: 'enemy', vol: 0.55, dur: 0.18 }, 1, null);
      }
    }
    expect(admitted).toBe(3);
    const own = m.admit({ name: 'sp:blinkOut', layer: 'cast', hero: 'me', nature: 'spell:pounce', priority: mixPriority({ relation: 'mine' }), relation: 'mine', vol: 0.55, baked: 0.6, dur: 0.18 }, 1);
    expect(own).not.toBeNull();
    expect(own!.steals.length).toBe(1);
  });
});

describe('the wiring', () => {
  it('the Trick cast, the predicted own Trick and the Nap play spell sounds (no borrowed generic sounds left)', () => {
    const fx = readFileSync(join(ROOT, 'src/render/effects.ts'), 'utf8');
    const trick = fx.slice(fx.indexOf('private trick('), fx.indexOf('private windup('));
    expect(trick).toContain("playSpellSfx(trick, 'cast'");
    expect(trick).toContain('visible: this.hooks.visible?.(src.id)');
    expect(trick).not.toMatch(/sfx\.play\(/);
    const ms = readFileSync(join(ROOT, 'src/app/matchSession.ts'), 'utf8');
    expect(ms).toContain("a.kind === 'trick'");
    expect(ms).toContain('ownTrickHeard');
    const life = readFileSync(join(ROOT, 'src/render/fx/lifecycle.ts'), 'utf8');
    expect(life).toContain("playSpellSfx('nap', phase");
  });

  it('render and audio only: the sim never imports the spell sounds', () => {
    const fx = readFileSync(join(ROOT, 'src/audio/spellSfx.ts'), 'utf8');
    expect(fx).not.toMatch(/from '\.\.\/sim/);
  });
});
