import { describe, expect, it } from 'vitest';
import { DEFAULT_CAT, rgb565, type CatSpec, type Pattern } from '../types';
import { canAdd, canDelete, catsReducer, initCats, nextSlot, applySlotEffects, type CatsState } from './cats-manager';
import { colourRoles, ownedCosmetics, patternLabel } from './CatMaker';
import { filterHandle } from './handle';
import { analyseCoat, coatClass, guessPattern, coatFeatures, paletteRoles } from './pattern-guess';
import { coatRegion, kmeans } from './photo-palette';
import { createPhotoStore, MAX_CAT_SLOTS } from './photo-store';
import { OPENER_VIDEO_MAX_BYTES, reencodeSize, scaleCrop, videoGate } from './video-opener';

const S = 48;
type RGB = number;
function img(f: (x: number, y: number) => RGB, w = S, h = S): Uint8ClampedArray {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = f(x, y);
      const i = (y * w + x) * 4;
      p[i] = (c >> 16) & 0xff;
      p[i + 1] = (c >> 8) & 0xff;
      p[i + 2] = c & 0xff;
      p[i + 3] = 255;
    }
  return p;
}
/** Small deterministic noise (±5 per channel) so fixtures are not perfectly flat. */
function noisy(c: RGB, x: number, y: number): RGB {
  const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const d = (n % 11) - 5;
  const ch = (v: number): number => Math.max(0, Math.min(255, v + d));
  return (ch((c >> 16) & 0xff) << 16) | (ch((c >> 8) & 0xff) << 8) | ch(c & 0xff);
}

const GREY = 0x9a9aa2;
const STRIPE = 0x3a3a42;
const BLACK = 0x201c1c;
const WHITE = 0xf4f2ee;
const GINGER = 0xd9823b;
const CREAM = 0xe8d8c0;
const SEAL = 0x3e2c22;

const FIXTURES: Record<Pattern, Uint8ClampedArray> = {
  solid: img((x, y) => noisy(GREY, x, y)),
  tabby: img((x, y) => noisy(x % 6 < 3 ? GREY : STRIPE, x, y)),
  tuxedo: img((x, y) => noisy(x >= 16 && x < 32 && y >= 28 ? WHITE : BLACK, x, y)),
  bicolor: img((x, y) => noisy(y < 22 ? BLACK : WHITE, x, y)),
  calico: img((x, y) => noisy(x < 24 && y < 20 ? GINGER : x >= 24 && y >= 28 ? BLACK : WHITE, x, y)),
  tortie: img((x, y) => noisy(((x / 6) | 0) % 2 === ((y / 6) | 0) % 2 ? GINGER : BLACK, x, y)),
  colorpoint: img((x, y) => noisy(y < 14 || y >= 42 ? SEAL : CREAM, x, y)),
};

describe('k-means palette (k = 3)', () => {
  const three = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < 300; i++) out.push(noisy(i % 3 === 0 ? BLACK : i % 3 === 1 ? WHITE : GINGER, i, i * 7));
    return out;
  };

  it('finds three well-separated colours and converges', () => {
    const r = kmeans(three());
    expect(r.converged).toBe(true);
    expect(r.clusters).toHaveLength(3);
    const shares = r.clusters.map((c) => Math.round(c.share * 100));
    expect(shares.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(99);
    const classes = r.clusters.map((c) => coatClass(c.rgb)).sort();
    expect(classes).toEqual(['dark', 'orange', 'white']);
  });

  it('is deterministic: the same input gives the same clusters and assignment', () => {
    const a = kmeans(three());
    const b = kmeans(three());
    expect(b.clusters).toEqual(a.clusters);
    expect([...b.assign]).toEqual([...a.assign]);
    expect(b.iterations).toBe(a.iterations);
  });

  it('sorts clusters by size and handles fewer colours than k and empty input', () => {
    const cols = [...Array(30).fill(BLACK), ...Array(10).fill(WHITE)];
    const r = kmeans(cols);
    expect(r.clusters).toHaveLength(2);
    expect(r.clusters[0].rgb).toBe(BLACK);
    expect(r.clusters[0].count).toBe(30);
    expect(kmeans([]).clusters).toEqual([]);
  });

  it('coat region covers the head and the body below, clamped to the photo', () => {
    const r = coatRegion({ x: 100, y: 50, w: 100, h: 100 }, 400, 300);
    expect(r).toEqual({ x: 70, y: 40, w: 160, h: 230 });
    const c = coatRegion({ x: 0, y: 0, w: 100, h: 100 }, 120, 150);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    expect(c.x + c.w).toBeLessThanOrEqual(120);
    expect(c.y + c.h).toBeLessThanOrEqual(150);
  });
});

describe('pattern guess (all 7)', () => {
  for (const p of Object.keys(FIXTURES) as Pattern[]) {
    it(`guesses ${p}`, () => {
      expect(guessPattern(coatFeatures(FIXTURES[p], S, S))).toBe(p);
    });
  }

  it('maps the palette to the colour roles the renderer expects', () => {
    const cal = analyseCoat(FIXTURES.calico, S, S);
    expect(cal.pattern).toBe('calico');
    expect(coatClass(cal.roles.base)).toBe('orange');
    expect(coatClass(cal.roles.secondary)).toBe('dark');
    expect(coatClass(cal.roles.tertiary)).toBe('white');

    const tux = analyseCoat(FIXTURES.tuxedo, S, S);
    expect(coatClass(tux.roles.base)).toBe('dark');
    expect(coatClass(tux.roles.tertiary)).toBe('white');

    const cp = analyseCoat(FIXTURES.colorpoint, S, S);
    expect(cp.pattern).toBe('colorpoint');
    expect(cp.roles.base).not.toBe(cp.roles.secondary);
    expect(coatClass(cp.roles.secondary)).toBe('dark');

    const tab = analyseCoat(FIXTURES.tabby, S, S);
    expect(tab.pattern).toBe('tabby');
    expect(tab.roles.base).not.toBe(tab.roles.secondary);
  });

  it('falls back to the house colours without clusters', () => {
    const r = paletteRoles('solid', []);
    expect(rgb565(r.base)).toBe(DEFAULT_CAT.base);
  });

  it('every pattern has chip copy and colour roles', () => {
    for (const p of Object.keys(FIXTURES) as Pattern[]) {
      expect(patternLabel(p)).toMatch(/^[A-Z]/);
      expect(colourRoles(p).base).toBeTruthy();
    }
    expect(colourRoles('solid').secondary).toBeNull();
    expect(colourRoles('tabby').secondary).toBe('Stripes');
  });
});

describe('video opener gate', () => {
  it('keeps a small video as is', () => {
    expect(videoGate({ bytes: 2_000_000, duration: 9, canReencode: true }).plan).toBe('keep');
    expect(videoGate({ bytes: OPENER_VIDEO_MAX_BYTES, duration: NaN, canReencode: false }).plan).toBe('keep');
  });
  it('re-encodes a big video when MediaRecorder works, else keeps a still with a note', () => {
    expect(videoGate({ bytes: OPENER_VIDEO_MAX_BYTES + 1, duration: 12, canReencode: true }).plan).toBe('reencode');
    const g = videoGate({ bytes: 40_000_000, duration: 12, canReencode: false });
    expect(g.plan).toBe('still');
    expect(g.note).toMatch(/Still adorable/);
  });
  it('a clip shorter than a blink or video turned off → a still', () => {
    expect(videoGate({ bytes: 100_000, duration: 0.2, canReencode: true }).plan).toBe('still');
    expect(videoGate({ bytes: 100_000, duration: 5, canReencode: true, allowVideo: false }).plan).toBe('still');
  });
  it('re-encode size: short side ≤ 540, even, aspect kept', () => {
    expect(reencodeSize(1080, 1920)).toEqual({ w: 540, h: 960 });
    expect(reencodeSize(3840, 2160)).toEqual({ w: 960, h: 540 });
    expect(reencodeSize(480, 640)).toEqual({ w: 480, h: 640 });
  });
  it('maps a crop between pixel spaces', () => {
    expect(scaleCrop({ x: 100, y: 200, w: 300, h: 300 }, 900, 1600, 540, 960)).toEqual({ x: 60, y: 120, w: 180, h: 180 });
  });
});

describe('studio @handle filter', () => {
  it('keeps @ + [a-z0-9._], lowercases, caps at 24', () => {
    expect(filterHandle('@Luna.Mom')).toBe('@luna.mom');
    expect(filterHandle('luna_the cat!!')).toBe('@luna_thecat');
    expect(filterHandle('@@x')).toBe('@x');
    expect(filterHandle('@abcdefghijklmnopqrstuvwxyz1234')).toBe('@abcdefghijklmnopqrstuvwx');
    expect(filterHandle('@')).toBe('');
    expect(filterHandle('🐈 ...')).toBe('');
    expect(filterHandle('https://evil.com')).toBe('@httpsevil.com');
  });
});

describe('cosmetic chips', () => {
  it('only owned ids that exist, none → empty', () => {
    expect(ownedCosmetics('collar', [])).toEqual([]);
    expect(ownedCosmetics('hat', undefined)).toEqual([]);
    const c = ownedCosmetics('collar', [2, 99]);
    expect(c.map((x) => x.id)).toEqual([2]);
    expect(c[0].name).toMatch(/Pink Paw/);
  });
});

describe('up to 5 cats (manage reducer)', () => {
  const cat = (name: string): CatSpec => ({ ...DEFAULT_CAT, name });
  const st = (n: number, max = 5, active = 0): CatsState => initCats(Array.from({ length: n }, (_, i) => cat(`C${i}`)), active, max);

  it('switches the active cat, ignoring bad indices', () => {
    let s = st(3);
    s = catsReducer(s, { type: 'switch', index: 2 }).state;
    expect(s.active).toBe(2);
    expect(catsReducer(s, { type: 'switch', index: 7 }).state.active).toBe(2);
  });

  it('adds into the next slot up to the max, and the new cat becomes the star', () => {
    let s = st(1, 2);
    expect(nextSlot(s)).toBe(1);
    s = catsReducer(s, { type: 'add', spec: cat('New') }).state;
    expect(s.cats.map((c) => c.name)).toEqual(['C0', 'New']);
    expect(s.active).toBe(1);
    expect(canAdd(s)).toBe(false);
    expect(nextSlot(s)).toBe(-1);
    expect(catsReducer(s, { type: 'add', spec: cat('X') }).state.cats).toHaveLength(2);
  });

  it('deletes a cat: later photos shift down, the freed slot is reused by the next add', () => {
    let s = st(4, 5, 3);
    const r = catsReducer(s, { type: 'delete', index: 1 });
    s = r.state;
    expect(s.cats.map((c) => c.name)).toEqual(['C0', 'C2', 'C3']);
    expect(s.active).toBe(2); // C3 stays the star
    expect(r.effects).toEqual({ clear: [1], moves: [[2, 1], [3, 2]] });
    expect(nextSlot(s)).toBe(3);
  });

  it('deleting the active cat picks its neighbour; the last cat cannot be deleted', () => {
    let s = st(2, 5, 1);
    s = catsReducer(s, { type: 'delete', index: 1 }).state;
    expect(s.active).toBe(0);
    expect(canDelete(s)).toBe(false);
    expect(catsReducer(s, { type: 'delete', index: 0 }).state.cats).toHaveLength(1);
  });

  it('clamps the max to 1..5 and keeps existing cats when the max shrank', () => {
    expect(initCats([cat('a')], 0, 99).maxCats).toBe(MAX_CAT_SLOTS);
    expect(initCats([cat('a')], 0, 0).maxCats).toBe(1);
    const lapsed = initCats([cat('a'), cat('b'), cat('c')], 2, 1);
    expect(lapsed.cats).toHaveLength(3);
    expect(lapsed.active).toBe(2);
    expect(canAdd(lapsed)).toBe(false);
  });

  it('applies the slot effects to a photo store', async () => {
    const store = createPhotoStore(undefined);
    const blob = (t: string): Blob => new Blob([t]);
    for (let i = 0; i < 3; i++) await store.put(i, { opener: { media: blob(`o${i}`), kind: 'photo' } });
    const r = catsReducer(st(3), { type: 'delete', index: 0 });
    await applySlotEffects(store, r.effects);
    expect(await (await store.get(0))!.opener!.media.text()).toBe('o1');
    expect(await (await store.get(1))!.opener!.media.text()).toBe('o2');
    expect(await store.get(2)).toBeNull();
  });
});

describe('photo store per slot', () => {
  it('keeps the 5 slots apart (memory fallback) and ignores bad slots', async () => {
    const store = createPhotoStore(undefined);
    expect(store.persistent).toBe(false);
    for (let i = 0; i < MAX_CAT_SLOTS; i++) await store.put(i, { opener: { media: new Blob([`s${i}`]), kind: i % 2 ? 'video' : 'photo' } });
    for (let i = 0; i < MAX_CAT_SLOTS; i++) {
      const r = await store.get(i);
      expect(await r!.opener!.media.text()).toBe(`s${i}`);
      expect(r!.opener!.kind).toBe(i % 2 ? 'video' : 'photo');
    }
    await store.put(5, { opener: { media: new Blob(['x']), kind: 'photo' } });
    await store.put(-1, { opener: { media: new Blob(['x']), kind: 'photo' } });
    expect(await store.get(5)).toBeNull();
    expect(await store.get(-1)).toBeNull();
    await store.remove(2);
    expect(await store.get(2)).toBeNull();
    expect(await store.get(3)).not.toBeNull();
  });

  it('falls back to memory when IndexedDB throws, still per slot', async () => {
    const idb = { open: () => { throw new Error('blocked'); } } as unknown as Pick<IDBFactory, 'open'>;
    const store = createPhotoStore(idb);
    await store.put(0, { opener: { media: new Blob(['a']), kind: 'photo' } });
    await store.put(4, { opener: { media: new Blob(['b']), kind: 'photo' } });
    expect(store.persistent).toBe(false);
    expect(await (await store.get(0))!.opener!.media.text()).toBe('a');
    expect(await (await store.get(4))!.opener!.media.text()).toBe('b');
    await store.move(4, 1);
    expect(await store.get(4)).toBeNull();
    expect(await (await store.get(1))!.opener!.media.text()).toBe('b');
  });
});
