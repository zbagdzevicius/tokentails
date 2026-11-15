/**
 * gaps5 (first-load JS): the coat part builders are their own chunk (render/chars/coatParts.ts). Until they load a coat
 * hero builds plain; once in, the cache key changes and the hero is rebuilt with its parts. Its own file: the module
 * state starts unloaded here.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COAT_PARTS, coatPartsRev, loadCoatParts } from '../../src/render/chars/coatParts';
import { COAT_BUILDERS } from '../../src/render/chars/coatPartsBuild';
import { DETAIL, heroBuilt } from '../../src/render/chars';

const shapeSum = (g: THREE.BufferGeometry): number => {
  const p = g.getAttribute('position');
  let s = p.count;
  for (let i = 0; i < p.count; i++) s += p.getX(i) + p.getY(i) * 3 + p.getZ(i) * 7;
  return Math.round(s * 1000);
};

describe('lazy coat parts', () => {
  it('gaps5: the builders load on first need (their own chunk); until then a coat hero builds plain', async () => {
    expect(coatPartsRev()).toBe(0);
    const plain = heroBuilt('frankie', 0, { coat: null, chroma: null }, DETAIL.med).geometry;
    const early = heroBuilt('frankie', 0, { coat: 'coat.frankie.store_paper_parade', chroma: null }, DETAIL.med).geometry;
    expect(shapeSum(early)).toBe(shapeSum(plain));
    await loadCoatParts();
    expect(coatPartsRev()).toBe(1);
    const late = heroBuilt('frankie', 0, { coat: 'coat.frankie.store_paper_parade', chroma: null }, DETAIL.med).geometry;
    expect(shapeSum(late)).not.toBe(shapeSum(plain));
    expect(Object.keys(COAT_BUILDERS).sort()).toEqual(Object.keys(COAT_PARTS).sort());
  });
});
