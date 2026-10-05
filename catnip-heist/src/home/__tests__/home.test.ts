import { describe, expect, it, vi } from 'vitest';
import type { SheetSource, VoxelSheet } from '../../render/voxel/sheets';
import { isContextLost, type YardAPI, type YardOptions } from '../../yard/Yard';
import type { HomeYardCat } from '../../shared-contracts/home-yard';
import { CAT_ROWS } from '../../types';
import {
  AURA_COLORS,
  createHomeYard,
  FALLBACK_SHEET,
  HOME_YARD_API_VERSION,
  homeCard,
  homeFact,
  homeTag,
  homeZoom,
  loadHomeEntries,
  withActiveSheet,
  type HomeYardDeps,
} from '../index';

const cat = (id: string, extra: Partial<HomeYardCat> = {}): HomeYardCat => ({
  id,
  name: id.toUpperCase(),
  sheetUrl: `https://cdn.example/${id}.png`,
  active: false,
  hungry: false,
  ...extra,
});

const fakeSheet = (src: SheetSource, base: string): VoxelSheet => ({
  id: src.id,
  name: src.name,
  url: /^(https?:|\/)/.test(src.sheet) ? src.sheet : base + src.sheet,
  frame: 48,
  cols: src.cols,
  rows: (src.rowNames ?? []).map((name) => ({ name, frames: 4, bounds: { minX: 0, minY: 0, maxX: 47, maxY: 47 } })),
  pixels: { width: 720, height: 480, data: new Uint8ClampedArray(4) },
  anchorX: 24,
  anchorY: 48,
});

function harness(fail: string[] = []) {
  const yards: { opts: YardOptions; api: YardAPI & { calls: string[] } }[] = [];
  const loadSheet = vi.fn(async (src: SheetSource, base?: string) => {
    if (fail.some((f) => src.sheet.includes(f))) throw new Error(`404 ${src.sheet}`);
    return fakeSheet(src, base ?? '');
  });
  const createYard = vi.fn((_el: HTMLElement, _m: unknown, opts: YardOptions = {}) => {
    const calls: string[] = [];
    const api = {
      calls,
      el: {} as HTMLElement,
      ready: Promise.resolve(),
      selected: null,
      start: () => calls.push('start'),
      stop: () => calls.push('stop'),
      select: (id: string | null) => calls.push(`select:${id}`),
      focus: (id: string) => calls.push(`focus:${id}`),
      setZoom: () => undefined,
      lookAt: () => undefined,
      setHighlight: (id: string | null, label?: string) => calls.push(`highlight:${id}:${label}`),
      refreshCard: () => calls.push('refresh'),
      feed: async (id: string) => {
        calls.push(`feed:${id}`);
      },
      stats: () => ({ calls: 0, triangles: 0, cats: 0, loaded: 0, hiDetail: 0, fps: 0, zoom: 1, pendingFrames: 0 }),
      screenPositions: () => [],
      dispose: () => calls.push('dispose'),
    } as unknown as YardAPI & { calls: string[] };
    yards.push({ opts, api });
    return api;
  });
  const deps = { loadSheet, createYard } as unknown as HomeYardDeps;
  return { yards, loadSheet, createYard, deps };
}

const el = {} as HTMLElement;
const BASE = '/heist-game/assets/';

describe('HOME yard module', () => {
  it('exposes the contract version', () => {
    expect(HOME_YARD_API_VERSION).toBe(1);
  });

  it('maps each player cat to a 15-column sheet with CAT_ROWS row names', async () => {
    const h = harness();
    await loadHomeEntries([cat('a', { active: true }), cat('b')], BASE, h.deps.loadSheet);
    const src = h.loadSheet.mock.calls[0][0] as SheetSource;
    expect(src).toMatchObject({ id: 'a', name: 'A', sheet: 'https://cdn.example/a.png', cols: 15 });
    expect(src.rowNames).toEqual(CAT_ROWS);
  });

  it('skips a failed cat, and gives a failed active cat the stand-in sheet', async () => {
    const h = harness(['a.png', 'b.png']);
    const { entries, failed } = await loadHomeEntries([cat('b'), cat('a', { active: true }), cat('c')], BASE, h.deps.loadSheet);
    expect(failed).toEqual(['b', 'a']);
    expect(entries.map((e) => e.id)).toEqual(['a', 'c']);
    expect(entries[0].sheet).toBe(BASE + FALLBACK_SHEET);
    expect(entries[0].name).toBe('A');
  });

  it('builds a yard with the active cat highlighted, focused and its card filled', async () => {
    const h = harness();
    const onSheetError = vi.fn();
    const home = createHomeYard(el, { assetBase: BASE, cats: [cat('b'), cat('a', { active: true, hungry: true, tier: 'RARE', type: 'FIRE', blessed: true })], onSheetError }, h.deps);
    await expect(home.ready).resolves.toEqual({ loaded: 2, failed: [] });
    const { opts } = h.yards[0];
    expect(opts.entries?.map((e) => e.id)).toEqual(['a', 'b']);
    expect(opts.highlight).toBe('a');
    expect(opts.initialFocus).toBe('a');
    expect(opts.highlightLabel).toBe('A · hungry');
    expect(opts.initialZoom).toBe(homeZoom(2));
    expect(opts.describe?.('a')).toEqual({ fact: 'Rare Fire cat · Hungry · Blessed', chooseLabel: 'ACTIVE', chooseDisabled: true });
    expect(opts.describe?.('b')?.chooseLabel).toBe('SELECT');
    expect(opts.aura?.('a')).toBe(AURA_COLORS.FIRE);
    expect(opts.aura?.('b')).toBeNull();
    expect(onSheetError).not.toHaveBeenCalled();
  });

  it('caps the cats it shows', async () => {
    const h = harness();
    const many = Array.from({ length: 30 }, (_, i) => cat(`c${i}`, { active: i === 29 }));
    const home = createHomeYard(el, { assetBase: BASE, cats: many, maxCats: 5 }, h.deps);
    await home.ready;
    const ids = h.yards[0].opts.entries!.map((e) => e.id);
    expect(ids).toHaveLength(5);
    expect(ids[0]).toBe('c29');
  });

  it('SELECT only reaches the client for a cat that is not active', async () => {
    const h = harness();
    const onChoose = vi.fn();
    const home = createHomeYard(el, { assetBase: BASE, cats: [cat('a', { active: true }), cat('b')], onChoose }, h.deps);
    await home.ready;
    h.yards[0].opts.onChoose?.('a');
    h.yards[0].opts.onChoose?.('b');
    expect(onChoose.mock.calls).toEqual([['b']]);
  });

  it('feed() feeds the cat, then reports onFed', async () => {
    const h = harness();
    const onFed = vi.fn();
    const home = createHomeYard(el, { assetBase: BASE, cats: [cat('a', { active: true, hungry: true })], onFed }, h.deps);
    await home.feed('a');
    expect(h.yards[0].api.calls).toContain('feed:a');
    expect(onFed).toHaveBeenCalledWith('a');
  });

  it('setCats with the same ids updates in place; other ids rebuild the yard', async () => {
    const h = harness();
    const home = createHomeYard(el, { assetBase: BASE, cats: [cat('a', { active: true, hungry: true }), cat('b')] }, h.deps);
    await home.ready;
    home.setCats([cat('a'), cat('b', { active: true })]);
    expect(h.createYard).toHaveBeenCalledTimes(1);
    expect(h.yards[0].api.calls).toEqual(expect.arrayContaining(['highlight:b:B', 'refresh']));
    // The card now reads from the new state.
    expect(h.yards[0].opts.describe?.('b')?.chooseLabel).toBe('ACTIVE');

    home.setCats([cat('a'), cat('b', { active: true }), cat('c')]);
    await vi.waitFor(() => expect(h.createYard).toHaveBeenCalledTimes(2));
    expect(h.yards[0].api.calls).toContain('dispose');
    expect(h.yards[1].opts.entries?.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('reports failed sheets and disposes cleanly', async () => {
    const h = harness(['b.png']);
    const onSheetError = vi.fn();
    const home = createHomeYard(el, { assetBase: BASE, cats: [cat('a', { active: true }), cat('b')], onSheetError }, h.deps);
    await expect(home.ready).resolves.toEqual({ loaded: 1, failed: ['b'] });
    expect(onSheetError).toHaveBeenCalledWith('b');
    home.stop();
    home.dispose();
    expect(h.yards[0].api.calls).toEqual(['stop', 'dispose']);
    await home.feed('a'); // no-op after dispose
    expect(h.yards[0].api.calls).not.toContain('feed:a');
  });

  it('an active cat without a sheet still shows, with the stand-in sheet', async () => {
    const h = harness();
    expect(withActiveSheet([cat('a', { active: true, sheetUrl: '' }), cat('b', { sheetUrl: '' })]).map((c) => c.sheetUrl)).toEqual([FALLBACK_SHEET, '']);
    const home = createHomeYard(el, { assetBase: BASE, cats: [cat('a', { active: true, hungry: true, sheetUrl: '' }), cat('b')] }, h.deps);
    await expect(home.ready).resolves.toEqual({ loaded: 2, failed: [] });
    const { opts } = h.yards[0];
    expect(opts.highlight).toBe('a');
    expect(opts.entries?.find((e) => e.id === 'a')?.sheet).toBe(BASE + FALLBACK_SHEET);
    home.setCats([cat('a', { active: true, sheetUrl: '' }), cat('b')]);
    expect(h.createYard).toHaveBeenCalledTimes(1);
  });

  it('a rebuild during a meal resolves feed() without onFed (no EAT save for an unfinished meal)', async () => {
    const h = harness();
    const onFed = vi.fn();
    const home = createHomeYard(el, { assetBase: BASE, cats: [cat('a', { active: true, hungry: true })], onFed }, h.deps);
    await home.ready;
    // The real yard resolves a pending feed when it is disposed.
    let finish: () => void = () => undefined;
    const first = h.yards[0].api;
    first.feed = () => new Promise<void>((r) => (finish = r));
    const origDispose = first.dispose;
    first.dispose = () => {
      origDispose();
      finish();
    };
    const meal = home.feed('a');
    await Promise.resolve();
    home.setCats([cat('a', { active: true, hungry: true }), cat('b')]);
    await vi.waitFor(() => expect(h.createYard).toHaveBeenCalledTimes(2));
    await meal;
    expect(onFed).not.toHaveBeenCalled();
    // The next feed on the new yard reports as usual.
    await home.feed('a');
    expect(onFed).toHaveBeenCalledWith('a');
  });

  it('dispose during a meal resolves feed() without onFed', async () => {
    const h = harness();
    const onFed = vi.fn();
    const home = createHomeYard(el, { assetBase: BASE, cats: [cat('a', { active: true, hungry: true })], onFed }, h.deps);
    await home.ready;
    let finish: () => void = () => undefined;
    h.yards[0].api.feed = () => new Promise<void>((r) => (finish = r));
    const meal = home.feed('a');
    await Promise.resolve();
    home.dispose();
    finish();
    await meal;
    expect(onFed).not.toHaveBeenCalled();
  });

  it('passes a lost WebGL context up, and leaves the Nunito faces to the host page', async () => {
    const h = harness();
    const onContextLost = vi.fn();
    const home = createHomeYard(el, { assetBase: BASE, cats: [cat('a', { active: true })], onContextLost }, h.deps);
    await home.ready;
    expect(h.yards[0].opts.nunitoFace).toBe(false);
    h.yards[0].opts.onContextLost?.();
    expect(onContextLost).toHaveBeenCalledTimes(1);
  });

  it('isContextLost: a lost or unreadable context counts as lost', () => {
    const ctx = (lost: boolean) => ({ getContext: () => ({ isContextLost: () => lost }) as unknown as WebGLRenderingContext });
    expect(isContextLost(ctx(true))).toBe(true);
    expect(isContextLost(ctx(false))).toBe(false);
    expect(isContextLost({ getContext: () => { throw new Error('gone'); } })).toBe(true);
  });

  it('card text helpers', () => {
    expect(homeFact(cat('x'))).toBe('Your cat · Well fed');
    expect(homeTag(cat('x', { hungry: true }))).toBe('X · hungry');
    expect(homeTag(undefined)).toBe('');
    expect(homeCard(undefined)).toBeUndefined();
    expect(homeZoom(1)).toBeGreaterThan(homeZoom(5));
    expect(homeZoom(5)).toBeGreaterThan(homeZoom(30));
  });
});
