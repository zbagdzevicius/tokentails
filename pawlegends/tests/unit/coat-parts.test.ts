/**
 * gaps2 coats-models: every Epic and Legendary coat changes the model in a match (render/chars/coatParts.ts), with
 * its own effect colours (render/skins/coatVfx.ts), inside POC.md §10 (one skinned mesh, ≤ 6k triangles at Med with
 * a chroma on top), and Low builds fewer of them.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { HeroId } from '../../src/sim/api';
import { PAID_COATS } from '../../src/render/cosmetics';
import { COAT_PARTS, coatParts } from '../../src/render/chars/coatParts';
import { DETAIL, heroBuilt, makeHero } from '../../src/render/chars';
import { COAT_VFX } from '../../src/render/skins/coatVfx';
import { profileFromCoat } from '../../src/render/skins/coatRung';
import { rungAtLeast } from '../../src/render/skins/registry';
import { coatLine } from '../../src/ui/store';

const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
/** The mesh's shape, as one number (a palette swap leaves it unchanged; any added or swapped part moves it). */
const shapeSum = (g: THREE.BufferGeometry): number => {
  const p = g.getAttribute('position');
  let s = p.count;
  for (let i = 0; i < p.count; i++) s += p.getX(i) + p.getY(i) * 3 + p.getZ(i) * 7;
  return Math.round(s * 1000);
};
const EPIC_PLUS = Object.entries(PAID_COATS).filter(([, c]) => rungAtLeast(c.rung, 'EPIC'));

describe('Epic and Legendary coats change the model (coat parts)', () => {
  it('there are Epic+ coats, and every one declares parts for its own hero', () => {
    expect(EPIC_PLUS.length).toBeGreaterThanOrEqual(6);
    for (const [id, c] of EPIC_PLUS) {
      const p = COAT_PARTS[id];
      expect(p, `${id} has no coat parts`).toBeTruthy();
      expect(p.hero).toBe(c.hero);
      expect(COAT_VFX[id], `${id} has no signature colours and part names`).toBeTruthy();
      expect(COAT_VFX[id].parts.length).toBeGreaterThanOrEqual(2);
      expect(coatLine(id)).toContain(COAT_VFX[id].parts[0]);
    }
    // nothing below Epic carries parts (Rare stays a palette and pattern)
    for (const id of [...Object.keys(COAT_PARTS), ...Object.keys(COAT_VFX)]) expect(rungAtLeast(PAID_COATS[id]?.rung ?? 'COMMON', 'EPIC')).toBe(true);
    // a Rare coat's store line has no parts
    expect(coatLine('coat.clem.store_calico')).not.toContain('In a match it adds');
  });

  it('a Rare coat stays a palette and pattern swap (the shape check below means something)', () => {
    const base = heroBuilt('sage', 0, { coat: null, chroma: null }, DETAIL.med).geometry;
    const rare = heroBuilt('sage', 0, { coat: 'coat.sage.store_silver_tabby', chroma: null }, DETAIL.med).geometry;
    expect(PAID_COATS['coat.sage.store_silver_tabby'].rung).toBe('RARE');
    expect(shapeSum(rare)).toBe(shapeSum(base));
  });

  it('parts never go on another hero', () => {
    for (const [id, c] of EPIC_PLUS) {
      expect(coatParts(id, c.hero as HeroId)).not.toBeNull();
      expect(coatParts(id, (c.hero === 'clem' ? 'sage' : 'clem') as HeroId)).toBeNull();
    }
  });

  for (const [id, c] of EPIC_PLUS) {
    const hero = c.hero as HeroId;
    it(`${id}: adds geometry in a match, ≤ 6k triangles at Med (with a chroma), lighter at Low, one mesh`, () => {
      for (const team of [0, 1] as const) {
        const base = heroBuilt(hero, team, { coat: null, chroma: null }, DETAIL.med).geometry;
        const med = heroBuilt(hero, team, { coat: id, chroma: null }, DETAIL.med).geometry;
        const chroma = heroBuilt(hero, team, { coat: id, chroma: 'FIRE' }, DETAIL.med).geometry;
        const low = heroBuilt(hero, team, { coat: id, chroma: null }, DETAIL.low).geometry;
        const lowBase = heroBuilt(hero, team, { coat: null, chroma: null }, DETAIL.low).geometry;
        if (team === 0) console.log(`${id}: ${tris(base)} → ${tris(med)} at Med (${tris(chroma)} with a chroma), ${tris(lowBase)} → ${tris(low)} at Low`);
        // the coat changes the mesh, not only its colours (a part swap may even keep the triangle count)
        expect(shapeSum(med)).not.toBe(shapeSum(base));
        expect(shapeSum(low)).not.toBe(shapeSum(lowBase));
        expect(tris(chroma)).toBeLessThanOrEqual(6000);
        expect(tris(low)).toBeLessThan(tris(med));
        // Low keeps the coat cheap: it adds at most 260 triangles over the plain hero there
        expect(tris(low) - tris(lowBase)).toBeLessThanOrEqual(260);
      }
      const h = makeHero(hero, 0, { coat: id, chroma: null }, { detail: DETAIL.low, match: true });
      let meshes = 0;
      h.object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      expect(meshes).toBe(1);
      h.dispose();
    });
  }

  it('the effect profile takes the coat signature colours on your own hero (team-safe on others)', () => {
    for (const [id, c] of EPIC_PLUS) {
      const mine = profileFromCoat(id, c.hero as HeroId, 0, true, 0, true, false)!;
      expect(mine.tint).toBe(COAT_VFX[id].glow);
      expect(mine.accent).toBe(COAT_VFX[id].accent);
      const theirs = profileFromCoat(id, c.hero as HeroId, 3, false, 1, true, false)!;
      expect(typeof theirs.tint).toBe('number');
    }
  });
});
