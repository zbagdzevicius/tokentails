import { describe, expect, it } from 'vitest';
import { CAT_SHAPE, PART, buildCatGeometry } from './catGeometry';
import { FLAG_ATLAS, FlagCells, cellOrigin, createFlagAtlas } from './flags';

describe('flag cells', () => {
  it('gives each country one stable cell and paints it once', () => {
    const painted: string[] = [];
    const cells = new FlagCells(4, (code) => painted.push(code));
    expect(cells.cellOf('LT')).toBe(0);
    expect(cells.cellOf(' lt ')).toBe(0);
    expect(cells.cellOf('US')).toBe(1);
    expect(cells.cellOf('LT')).toBe(0);
    expect(painted).toEqual(['LT', 'US']);
    expect(cells.size).toBe(2);
  });

  it('no flag for unknown, Cloudflare XX / Tor T1, junk and a full atlas', () => {
    const cells = new FlagCells(1);
    for (const v of [null, undefined, '', 'XX', 'T1', 'EU', 'LTU', 42, {}]) expect(cells.cellOf(v)).toBe(-1);
    expect(cells.cellOf('DE')).toBe(0);
    expect(cells.cellOf('FR')).toBe(-1);
    expect(cells.cellOf('DE')).toBe(0);
  });

  it('the atlas holds every country and cells do not overlap', () => {
    expect(FLAG_ATLAS.cols * FLAG_ATLAS.rows).toBeGreaterThanOrEqual(250);
    expect(cellOrigin(0)).toEqual({ x: 0, y: 0 });
    expect(cellOrigin(FLAG_ATLAS.cols + 1)).toEqual({ x: FLAG_ATLAS.cellW, y: FLAG_ATLAS.cellH });
    // The painted flag (inside the gutter) keeps the cloth's 3:2 aspect so flags are not stretched.
    const iw = FLAG_ATLAS.cellW - 2 * FLAG_ATLAS.padX;
    const ih = FLAG_ATLAS.cellH - 2 * FLAG_ATLAS.padY;
    expect(iw / ih).toBeCloseTo(CAT_SHAPE.flag.w / CAT_SHAPE.flag.h, 2);
    // A gutter of at least 4 px vertically keeps two mip levels free of a neighbour's colours.
    expect(Math.min(FLAG_ATLAS.padX, FLAG_ATLAS.padY)).toBeGreaterThanOrEqual(4);
  });

  it('without a DOM nobody holds a flag (no crash)', () => {
    const a = createFlagAtlas();
    expect(a.texture).toBeNull();
    expect(a.cellOf('LT')).toBe(-1);
  });
});

describe('cat silhouette (cute, not phallic)', () => {
  const g = buildCatGeometry();
  const pos = g.getAttribute('position');
  const part = g.getAttribute('aPart');
  const top = (p: number) => {
    let y = -Infinity;
    for (let i = 0; i < pos.count; i++) if (part.getX(i) === p) y = Math.max(y, pos.getY(i));
    return y;
  };

  it('paws stay below the ear tips, beside the head (no arms raised above it)', () => {
    expect(top(PART.paw)).toBeLessThan(top(PART.ear) - 0.05);
    expect(top(PART.arm)).toBeLessThan(top(PART.head));
  });

  it('no visible forearm: the mitten sits at the cheek and almost hides the stub', () => {
    const S = CAT_SHAPE;
    // Exposed stub: shoulder to the mitten's edge, shorter than the stub is wide (no rod from above).
    const exposed = Math.hypot(S.paw.x - S.shoulder.x, S.paw.y - S.shoulder.y) - S.paw.r;
    expect(exposed).toBeLessThan(S.armR);
    // The paw never reaches past the head's side by more than its own radius (no knob on a stick).
    expect(S.paw.x + S.paw.r).toBeLessThan(S.head.r[0] + S.paw.r * 1.3);
    // Paws below the eyes, beside the head.
    expect(S.paw.y).toBeLessThan(S.head.y);
    // A ball paw on a thinner arm (a mitten), not a rod with a rounded, pink end.
    expect(S.paw.r).toBeGreaterThanOrEqual(S.armR * 1.5);
  });

  it('the tail is thick and starts at the lower back, not at the hips', () => {
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) if (part.getX(i) === PART.tail) minY = Math.min(minY, pos.getY(i));
    expect(minY).toBeGreaterThan(0.15);
    expect(CAT_SHAPE.tail.y).toBeGreaterThanOrEqual(0.22);
  });

  it('the flag pole clears the ear and the cloth flies above it, off the head', () => {
    const F = CAT_SHAPE.flag;
    let earMaxX = 0;
    for (let i = 0; i < pos.count; i++) if (part.getX(i) === PART.ear) earMaxX = Math.max(earMaxX, pos.getX(i));
    expect(F.x - F.poleR).toBeGreaterThan(earMaxX);
    expect(F.x - F.poleR).toBeGreaterThan(CAT_SHAPE.head.r[0]);
    expect(F.y1 - F.h).toBeGreaterThan(CAT_SHAPE.head.y + CAT_SHAPE.head.r[1] - 0.05);
  });

  it('has the flag (pole + cloth), and holograms leave it out', () => {
    expect(top(PART.pole)).toBeCloseTo(CAT_SHAPE.flag.y1, 3);
    expect(top(PART.cloth)).toBeCloseTo(CAT_SHAPE.flag.y1, 3);
    const holo = buildCatGeometry({ flag: false });
    const hp = holo.getAttribute('aPart');
    for (let i = 0; i < hp.count; i++) expect(hp.getX(i)).toBeLessThan(PART.pole);
  });
});
