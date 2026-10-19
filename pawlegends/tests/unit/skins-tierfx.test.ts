/**
 * Card skin rarity effects (GDD §7.2, render/skins/tierFx.ts): one addition per rung, quality and team-fight caps,
 * the particle-pool guard, preallocated emits, stealth and Off, no gold on another player's hero, and the shared
 * aura layer is never written.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ELEMENTS, type CatTier, type Element } from '../../src/meta/roster';
import { COSMETIC_MAX, TierFx, glintColor, isGoldFamily, type FxHero, type FxParticles } from '../../src/render/skins/tierFx';
import { FOIL_STRENGTH } from '../../src/render/chars/charMaterial';
import { HeroView } from '../../src/render/views/heroView';
import { RELATION } from '../../src/render/palette';

function pool(): FxParticles & { bursts: { pos: THREE.Vector3; o: Record<string, unknown> }[]; rings: number } {
  const p = {
    add: { count: 0, limit: 1000 },
    alpha: { count: 0, limit: 600 },
    bursts: [] as { pos: THREE.Vector3; o: Record<string, unknown> }[],
    rings: 0,
    burst(pos: THREE.Vector3, o: Record<string, unknown>) {
      p.bursts.push({ pos, o });
    },
    ring() {
      p.rings++;
    },
  };
  return p;
}

const hero = (over: Partial<FxHero> = {}): FxHero => ({ id: 0, x: 0, z: 0, rung: 'EPIC', element: 'FIRE', self: true, moving: true, stealth: false, dead: false, napping: false, phase: 0, ...over });
const alone = [{ x: 0, z: 0, dead: false }];

/** Walk `steps` frames 0.35 s apart, one footfall each (the first frame only registers the stride). */
function walk(fx: TierFx, h: FxHero, steps: number, heroes = alone): number[] {
  const foils: number[] = [];
  for (let i = 0; i < steps; i++) {
    fx.begin(0.35, 0, 0, heroes);
    h.phase += Math.PI * 1.01;
    foils.push(fx.hero(h));
    fx.end();
  }
  return foils;
}

describe('rarity ladder (one addition per rung)', () => {
  it('Common and Rare emit nothing; Epic glints on footfalls; Legendary also has foil', () => {
    for (const rung of ['COMMON', 'RARE'] as CatTier[]) {
      const p = pool();
      const fx = new TierFx(p);
      expect(walk(fx, hero({ rung }), 10).every((f) => f === 0)).toBe(true);
      expect(p.bursts.length).toBe(0);
    }
    const p = pool();
    const fx = new TierFx(p);
    expect(walk(fx, hero({ rung: 'EPIC' }), 10).every((f) => f === 0)).toBe(true);
    expect(p.bursts.length).toBe(9);
    const q = pool();
    expect(walk(new TierFx(q), hero({ rung: 'LEGENDARY' }), 4)).toEqual([FOIL_STRENGTH, FOIL_STRENGTH, FOIL_STRENGTH, FOIL_STRENGTH]);
  });
  it('glints: one STAR8, alpha ≤ 0.35, size 0.08–0.12, at most one per 0.3 s', () => {
    const p = pool();
    const fx = new TierFx(p);
    const h = hero();
    for (let i = 0; i < 20; i++) {
      fx.begin(0.05, 0, 0, alone);
      h.phase += Math.PI;
      fx.hero(h);
    }
    expect(p.bursts.length).toBeLessThanOrEqual(Math.ceil((20 * 0.05) / 0.3) + 1);
    const o = p.bursts[0].o;
    expect(o.shape).toBe(10);
    expect(o.n).toBe(1);
    expect(o.alpha as number).toBeLessThanOrEqual(0.35);
    expect(o.size).toEqual([0.08, 0.12]);
  });
  it('the Legendary recall flourish: one cream + element ring when a Nap recall lands', () => {
    const p = pool();
    const fx = new TierFx(p);
    const h = hero({ rung: 'LEGENDARY', moving: false, napping: true, x: 40 });
    fx.begin(0.1, 0, 0, alone);
    fx.hero(h);
    h.napping = false;
    h.x = 0;
    fx.begin(0.1, 0, 0, alone);
    fx.hero(h);
    expect(p.rings).toBe(2);
  });
});

describe('caps', () => {
  it('Low: own-hero glints only, no foil; others nothing', () => {
    const p = pool();
    const fx = new TierFx(p);
    fx.low = true;
    expect(walk(fx, hero({ rung: 'LEGENDARY' }), 5).every((f) => f === 0)).toBe(true);
    expect(p.bursts.length).toBe(4);
    p.bursts.length = 0;
    expect(walk(fx, hero({ id: 3, self: false, rung: 'LEGENDARY' }), 5).every((f) => f === 0)).toBe(true);
    expect(p.bursts.length).toBe(0);
  });
  it('Med: others glint and shine, but not in a team fight (≥ 4 living heroes within 12 m of the focus)', () => {
    const p = pool();
    const fx = new TierFx(p);
    const other = hero({ id: 2, self: false, rung: 'LEGENDARY' });
    expect(walk(fx, other, 3)).toEqual([FOIL_STRENGTH, FOIL_STRENGTH, FOIL_STRENGTH]);
    expect(p.bursts.length).toBe(2);
    const fight = [0, 1, 2, 3].map((i) => ({ x: i * 2, z: 0, dead: false }));
    p.bursts.length = 0;
    expect(walk(fx, other, 3, fight)).toEqual([0, 0, 0]);
    expect(p.bursts.length).toBe(0);
    expect(fx.teamFight).toBe(true);
    // dead heroes do not count, and the player's own hero still shows
    expect(walk(fx, hero({ rung: 'LEGENDARY' }), 2, fight)).toEqual([FOIL_STRENGTH, FOIL_STRENGTH]);
    fx.begin(0.1, 0, 0, fight.map((h, i) => ({ ...h, dead: i > 1 })));
    expect(fx.teamFight).toBe(false);
  });
  it('skips cosmetics while either particle pool is over 80 % of its limit', () => {
    const p = pool();
    const fx = new TierFx(p);
    p.add.count = 801;
    walk(fx, hero(), 5);
    expect(p.bursts.length).toBe(0);
    p.add.count = 0;
    p.alpha.count = 481;
    walk(fx, hero(), 5);
    expect(p.bursts.length).toBe(0);
    p.alpha.count = 0;
    walk(fx, hero(), 5);
    expect(p.bursts.length).toBe(5);
  });
  it(`at most ${COSMETIC_MAX} cosmetic particles alive`, () => {
    const p = pool();
    const fx = new TierFx(p);
    for (let id = 0; id < 60; id++) {
      fx.begin(0, 0, 0, alone);
      fx.hero(hero({ id, phase: 0 }));
    }
    for (let id = 0; id < 60; id++) fx.hero(hero({ id, phase: Math.PI * 3 }));
    expect(fx.alive()).toBeLessThanOrEqual(COSMETIC_MAX);
  });
  it('preallocated: 600 updates reuse the same position and option objects (no allocation per emit)', () => {
    const p = pool();
    const fx = new TierFx(p);
    const h = hero({ rung: 'LEGENDARY' });
    for (let i = 0; i < 600; i++) {
      fx.begin(0.35, 0, 0, alone);
      h.phase += Math.PI * 1.01;
      fx.hero(h);
      fx.end();
    }
    expect(p.bursts.length).toBe(599);
    expect(new Set(p.bursts.map((b) => b.pos)).size).toBe(1);
    expect(new Set(p.bursts.map((b) => b.o)).size).toBe(1);
  });
  it('stealth and Off: no emits and no foil; Mine only: the own hero only', () => {
    const p = pool();
    const fx = new TierFx(p);
    expect(walk(fx, hero({ rung: 'LEGENDARY', stealth: true }), 5).every((f) => f === 0)).toBe(true);
    fx.mode = 'off';
    expect(walk(fx, hero({ rung: 'LEGENDARY' }), 5).every((f) => f === 0)).toBe(true);
    expect(p.bursts.length).toBe(0);
    fx.mode = 'mine';
    expect(walk(fx, hero({ id: 4, self: false, rung: 'LEGENDARY' }), 3)).toEqual([0, 0, 0]);
    expect(walk(fx, hero({ rung: 'LEGENDARY' }), 1)).toEqual([FOIL_STRENGTH]);
  });
});

describe('readability', () => {
  it('never the 0xffd34d ("you") family on another player\'s hero, never the raw element colour', () => {
    expect(isGoldFamily(RELATION.self)).toBe(true);
    for (const el of ELEMENTS as readonly Element[]) {
      expect(isGoldFamily(glintColor(el, false)), el).toBe(false);
      const p = pool();
      walk(new TierFx(p), hero({ id: 5, self: false, element: el }), 2);
      for (const b of p.bursts) expect(isGoldFamily(b.o.color as number), el).toBe(false);
    }
    expect(glintColor('ELECTRIC', true)).not.toBe(0xffe24d);
    expect(glintColor('FAIRY', false)).not.toBe(0xff9fd6);
  });
  it('the shared 8-slot aura layer (Avietė charge, charm, chroma) is never written by a card skin', () => {
    const v = new HeroView();
    const writes: unknown[] = [];
    const auras = (v as unknown as { auras: { add: (...a: unknown[]) => void } }).auras;
    const orig = auras.add.bind(auras);
    auras.add = (...a: unknown[]) => {
      writes.push(a);
      orig(...a);
    };
    v.looks.set(0, { coat: 'cat.any', chroma: null });
    v.tierFx = new TierFx(pool());
    const e = { kind: 'hero', id: 0, hero: 'clem', team: 0, fx: 0, fy: 0, yaw: 0, state: 'moving', buffs: 0, speed: 200, hp: 1, maxHp: 1 };
    for (let i = 0; i < 30; i++) v.update({ entities: [e], byId: new Map([[0, e]]) } as never, 0.1);
    expect(writes.length).toBe(0);
    v.dispose();
  });
});
