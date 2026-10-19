import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { HAT_IDS, TRAIL_IDS } from '../../content/ids';
import { HAT_INFO, HAT_PRICES, TRAIL_INFO, TRAIL_RULES } from '../../content/cosmetics';
import { HAT_NAME, hatGeometry, wearHat } from './hats';
import { trailGeometry } from './trail';

describe('cosmetics', () => {
  it('every hat id has a small mesh, a price, a name and an icon', () => {
    HAT_IDS.forEach((id, i) => {
      expect(HAT_INFO[id].name.length).toBeGreaterThan(0);
      if (i === 0) {
        expect(hatGeometry(0)).toBeNull();
        expect(HAT_PRICES[id]).toBe(0);
        return;
      }
      const g = hatGeometry(i)!;
      const verts = g.getAttribute('position').count;
      expect(verts).toBeGreaterThan(30);
      expect(verts).toBeLessThan(3000); // a hat is a few hundred triangles at most
      expect(HAT_PRICES[id]).toBeGreaterThanOrEqual(60);
      expect(HAT_PRICES[id]).toBeLessThanOrEqual(250);
      g.dispose();
    });
    expect(hatGeometry(99)).toBeNull();
  });

  it('wearing a hat replaces the previous one', () => {
    const head = new Group();
    wearHat(head, 1);
    wearHat(head, 2);
    expect(head.children.filter((c) => c.name === HAT_NAME)).toHaveLength(1);
    expect(wearHat(head, 0)).toBeNull();
    expect(head.children.filter((c) => c.name === HAT_NAME)).toHaveLength(0);
  });

  it('every trail has colours, a track that unlocks it and a particle shape', () => {
    TRAIL_IDS.forEach((id, i) => {
      if (i === 0) return;
      expect(TRAIL_INFO[id].colors.length).toBeGreaterThan(0);
      expect(TRAIL_RULES[id]).toMatch(/^[a-z]+$/);
      const g = trailGeometry(id);
      expect(g.getAttribute('position').count).toBeGreaterThan(0);
      g.dispose();
    });
  });
});
