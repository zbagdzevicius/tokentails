/** Home poster (docs/plans/moba/HOME-POSTER.md): the side, the rival, the bolt's mirror math and the HUD-clear framing. Pure. */
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { BOLT, BOLT_SHIFT, boltPoints, boltX, posterBox, posterFlip, posterSide, rivalBox, rivalFor, silhouetteFile, type Rect } from '../../src/render/lobby/poster';

const hits = (a: Rect, b: Rect): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

describe('Home poster layout', () => {
  it('a cat champion takes the rose field (left), a dog the sky field (right, the mirror)', () => {
    expect(posterSide('clem')).toBe('cat');
    expect(posterSide('brutus')).toBe('dog');
    expect(posterFlip('cat')).toBe(1);
    expect(posterFlip('dog')).toBe(-1);
    for (const side of ['cat', 'dog'] as const) {
      const b = posterBox({ w: 844, h: 390, side, aspect: 0.7, hud: [] });
      if (side === 'cat') expect(b.cx).toBeLessThan(422);
      else expect(b.cx).toBeGreaterThan(422);
      // big: well over half the screen height
      expect(b.bottom - b.top).toBeGreaterThan(390 * 0.55);
    }
  });

  it('the two layouts are mirror images', () => {
    const cat = posterBox({ w: 1440, h: 900, side: 'cat', aspect: 0.8, hud: [] });
    const dog = posterBox({ w: 1440, h: 900, side: 'dog', aspect: 0.8, hud: [] });
    expect(cat.cx + dog.cx).toBeCloseTo(1440, 6);
    expect(cat.top).toBeCloseTo(dog.top, 6);
    const rc = rivalBox({ w: 1440, h: 900, side: 'cat', imgAspect: 0.6 });
    const rd = rivalBox({ w: 1440, h: 900, side: 'dog', imgAspect: 0.6 });
    // a cat champion's rival (a dog) stands right of centre, a dog champion's rival left, mirrored
    expect((rc[0] + rc[2]) / 2).toBeGreaterThan(0.5);
    expect((rd[0] + rd[2]) / 2).toBeLessThan(0.5);
    expect(rc[0] + rd[2]).toBeCloseTo(1, 6);
  });

  it('the bolt mirrors through the centre: flip -1 negates every x, flip 0 stands upright on the centre', () => {
    const cat = boltPoints(1);
    const dog = boltPoints(-1);
    expect(cat).toHaveLength(BOLT.length);
    cat.forEach(([x, y], i) => {
      expect(dog[i][0]).toBeCloseTo(-x, 9);
      expect(dog[i][1]).toBe(y);
    });
    for (const [x] of boltPoints(0)) expect(x).toBeCloseTo(0, 9);
    // a cat champion's bolt leans right at the top and crosses the centre lower down
    expect(boltX(1.08, 1)).toBeCloseTo(BOLT[0][0] + BOLT_SHIFT, 9);
    expect(boltX(0.8, 1)).toBeGreaterThan(0);
    for (const y of [0, 0.25, 0.5, 0.55, 0.75, 1]) expect(boltX(y, -1)).toBeCloseTo(-boltX(y, 1), 9);
  });

  it('every champion has a rival of the other species and the same role, one to one', () => {
    const seen = new Set<string>();
    for (const h of HERO_IDS) {
      const r = rivalFor(h);
      expect(HEROES[r].side).not.toBe(HEROES[h].side);
      expect(HEROES[r].role).toBe(HEROES[h].role);
      expect(rivalFor(r)).toBe(h);
      seen.add(r);
    }
    expect(seen.size).toBe(HERO_IDS.length);
    expect(rivalFor('clem')).toBe('howler');
    expect(silhouetteFile('howler')).toBe('silhouettes/howler-640.webp');
  });

  it('the champion keeps clear of the Home HUD (844x390: the nav under a cat, the name plate, PLAY beside a dog)', () => {
    const w = 844;
    const h = 390;
    const hud: Rect[] = [
      { left: 16, top: 6, right: 205, bottom: 54 }, // profile
      { left: 14, top: 64, right: 74, bottom: 182 }, // Events, quests
      { left: 365, top: 56, right: 480, bottom: 100 }, // the name plate
      { left: 655, top: 66, right: 830, bottom: 156 }, // promo
      { left: 16, top: 330, right: 216, bottom: 384 }, // nav
      { left: 720, top: 272, right: 834, bottom: 386 }, // PLAY
    ];
    for (const side of ['cat', 'dog'] as const) {
      for (const aspect of [0.55, 0.8, 1.1]) {
        const b = posterBox({ w, h, side, aspect, hud });
        const half = ((b.bottom - b.top) * aspect) / 2;
        const box = { left: b.cx - half, right: b.cx + half, top: b.top, bottom: b.bottom };
        for (const r of hud) expect(hits(box, r), `${side} ${aspect} vs ${JSON.stringify(r)}`).toBe(false);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(w);
        expect(b.bottom - b.top).toBeGreaterThanOrEqual(h * 0.4);
      }
    }
  });
});
