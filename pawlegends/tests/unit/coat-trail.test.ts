/**
 * gaps5 skins v2: coat trails (render/skins/coatTrail.ts). The Mythic Paper Parade Dragon grows its parade body with
 * level and takedowns, stretches to twelve lanterns after the ultimate, fires one stage-up per new stage (never on first
 * sight), keeps to one instanced mesh, caps Low, hides with the hero; the ground trails (Robo-Vac stripes, Soft Serve
 * drips) are dropped while moving and fade.
 */
import { describe, expect, it } from 'vitest';
import { CoatTrail, PARADE_LOW_MAX, PARADE_SEGMENTS, PARADE_ULT_SEGMENTS, evolveWords, isEvolving, paradeStage, setTrailPreview, trailOf, type TrailInput } from '../../src/render/skins/coatTrail';
import { EFFECT_COATS, MYTHIC_COATS } from '../../src/money/catalog';
import { formGeometry } from '../../src/render/skins/coatForms';
import { COAT_PARTS } from '../../src/render/chars/coatParts';

const input = (o: Partial<TrailInput> = {}): TrailInput => ({ x: 0, z: 0, hidden: false, level: 1, takedowns: 0, sinceUlt: 1e9, self: true, low: false, moving: true, yaw: 0, ...o });

/** Walk `t` along +x for `s` seconds at 4 m/s (60 fps), with the input `o`. */
function walk(t: CoatTrail, s: number, o: Partial<TrailInput> = {}, from = 0): number {
  let x = from;
  for (let i = 0; i < s * 60; i++) {
    x += 4 / 60;
    t.update(1 / 60, input({ x, ...o }));
  }
  return x;
}

describe('coat trails', () => {
  it('the trail coats are effect coats with model parts; the Mythic one evolves', () => {
    for (const id of ['coat.frankie.store_paper_parade', 'coat.nugget.store_robo_vac', 'coat.marshmallow.store_soft_serve']) {
      expect(EFFECT_COATS.some((c) => c.id === id)).toBe(true);
      expect(COAT_PARTS[id]).toBeTruthy();
    }
    expect(trailOf('coat.frankie.store_paper_parade')).toBe('parade');
    expect(trailOf('coat.frankie.store_kebab_king')).toBeNull();
    expect([...MYTHIC_COATS]).toEqual(['coat.frankie.store_paper_parade', 'coat.brutus.store_chairman', 'coat.meatball.store_mega_meal']);
    expect(isEvolving('coat.frankie.store_paper_parade')).toBe(true);
    // gaps6 coat drop: the Chairman and Mega Meal evolve too; Double Stack leaves a ketchup trail
    expect(isEvolving('coat.brutus.store_chairman')).toBe(true);
    expect(isEvolving('coat.meatball.store_mega_meal')).toBe(true);
    expect(trailOf('coat.meatball.store_double_stack')).toBe('ketchup');
    expect(isEvolving('coat.meatball.store_double_stack')).toBe(false);
    expect(evolveWords('coat.brutus.store_chairman')).toContain('office chair');
    expect(evolveWords('coat.meatball.store_mega_meal')).toContain('5-patty');
    expect(evolveWords('coat.domino.store_pizzaiolo')).toBe('');
    expect(isEvolving('coat.domino.store_pizzaiolo')).toBe(false);
  });

  it('the stage follows level or takedowns, whichever is further', () => {
    expect(paradeStage(1, 0)).toBe(1);
    expect(paradeStage(4, 0)).toBe(2);
    expect(paradeStage(1, 2)).toBe(2);
    expect(paradeStage(7, 0)).toBe(3);
    expect(paradeStage(3, 4)).toBe(3);
    expect(paradeStage(10, 0)).toBe(4);
    expect(paradeStage(2, 6)).toBe(4);
  });

  it('the parade grows with the stage, stretches after the ultimate, and fires each new stage once', () => {
    const t = new CoatTrail('parade');
    const stages: number[] = [];
    t.onStage = (s) => stages.push(s);
    let x = walk(t, 2);
    expect(t.shown).toBe(PARADE_SEGMENTS[1]);
    x = walk(t, 3, { level: 4 }, x);
    expect(t.shown).toBe(PARADE_SEGMENTS[2]);
    x = walk(t, 3, { level: 7, takedowns: 3 }, x);
    expect(t.shown).toBe(PARADE_SEGMENTS[3]);
    x = walk(t, 3, { level: 10 }, x);
    expect(t.shown).toBe(PARADE_SEGMENTS[4]);
    x = walk(t, 3, { level: 10, sinceUlt: 1 }, x);
    expect(t.shown).toBe(PARADE_ULT_SEGMENTS);
    expect(stages).toEqual([2, 3, 4]);
    expect(t.mesh.count).toBe(t.shown);
    t.dispose();
  });

  it('a hero first seen at a high level is not a stage-up; standing still still shows the body', () => {
    const t = new CoatTrail('parade');
    let fired = 0;
    t.onStage = () => fired++;
    for (let i = 0; i < 240; i++) t.update(1 / 60, input({ level: 10, moving: false }));
    expect(fired).toBe(0);
    expect(t.shown).toBe(PARADE_SEGMENTS[4]);
    t.dispose();
  });

  it('Low caps the parade; hidden draws nothing', () => {
    const t = new CoatTrail('parade');
    walk(t, 4, { level: 10, sinceUlt: 0, low: true });
    expect(t.shown).toBe(PARADE_LOW_MAX);
    t.update(1 / 60, input({ hidden: true, level: 10 }));
    expect(t.mesh.count).toBe(0);
    t.dispose();
  });

  it('the Evolve preview cycles the stages', () => {
    setTrailPreview(true);
    try {
      const t = new CoatTrail('parade');
      const seen = new Set<number>();
      for (let i = 0; i < 60 * 12; i++) {
        t.update(1 / 60, input({ moving: false }));
        seen.add(t.stage);
      }
      expect([...seen].sort()).toEqual([1, 2, 3, 4]);
      t.dispose();
    } finally {
      setTrailPreview(false);
    }
  });

  it('ground trails drop while moving and fade; another hero on Low draws none', () => {
    for (const kind of ['stripes', 'drips'] as const) {
      const t = new CoatTrail(kind);
      walk(t, 1.5);
      expect(t.shown).toBeGreaterThan(2);
      for (let i = 0; i < 60 * 4; i++) t.update(1 / 60, input({ x: 6, moving: false }));
      expect(t.shown).toBe(0);
      const o = new CoatTrail(kind);
      walk(o, 1.5, { self: false, low: true });
      expect(o.shown).toBe(0);
      t.dispose();
      o.dispose();
    }
  });

  it('gaps6 forms: one instance, its geometry swapped per stage; the Chairman shows nothing as the new hire', () => {
    for (const kind of ['board', 'tower'] as const) {
      const t = new CoatTrail(kind, { h: 3, r: 1.2 });
      const stages: number[] = [];
      t.onStage = (s) => stages.push(s);
      walk(t, 0.5);
      expect([kind, t.stage, t.shown]).toEqual([kind, 1, kind === 'board' ? 0 : 1]);
      const geos = new Set<unknown>();
      for (const level of [4, 7, 10]) {
        walk(t, 0.3, { level });
        expect(t.shown).toBe(1);
        geos.add(t.mesh.geometry);
      }
      expect(geos.size).toBe(3);
      expect(stages).toEqual([2, 3, 4]);
      walk(t, 0.2, { level: 10, hidden: true });
      expect(t.shown).toBe(0);
      t.dispose();
    }
  });

  it('gaps6 forms stay inside the hero ring: the chair and the tray are capped', () => {
    for (const kind of ['board', 'tower'] as const) {
      const g = formGeometry(kind, 4, { h: 3, r: 1.2 })!;
      g.computeBoundingBox();
      const b = g.boundingBox!;
      expect(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z)).toBeLessThan(2.2);
      expect(b.max.y).toBeLessThan(3 * 1.6);
    }
    expect(formGeometry('board', 1, { h: 3, r: 1.2 })).toBeNull();
  });

  it('the ketchup trail drops red splats while he moves and fades them', () => {
    const t = new CoatTrail('ketchup');
    walk(t, 1, { moving: true });
    expect(t.shown).toBeGreaterThan(2);
    for (let i = 0; i < 4 * 60; i++) t.update(1 / 60, input({ x: 99, moving: false }));
    expect(t.shown).toBe(0);
  });
});
