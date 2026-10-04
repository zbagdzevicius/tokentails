import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PinkPawGallery, PinkPawGalleryCat } from '../../../shared-contracts/pink-paw';
import {
  RESCUE_FALLBACK,
  RESCUE_LEVEL_IDS,
  RESCUE_RETRY_MS,
  RESCUE_STORAGE_KEY,
  assignRescueCats,
  fallbackRescueCat,
  fetchRescueGallery,
  getRescueCat,
  getRescueCatCached,
  rescueAssignment,
  rescueName,
  rescueStatusLabel,
  renameIn,
  resetRescueCats,
  safeImageUrl,
  withRescueName,
} from '../rescue-cats';

const ROOT = resolve(__dirname, '../../../../');
const PINK_PAW = resolve(ROOT, 'public/assets/images/pink-paw');

const hex = (n: number) => n.toString(16).padStart(24, '0');
const cat = (n: number, status: PinkPawGalleryCat['status'] = 'WAITING', name = `Cat${n}`): PinkPawGalleryCat => ({
  id: hex(n),
  name,
  status,
  art: `https://cdn.example/${n}-art.webp`,
  photo: `https://cdn.example/${n}.webp`,
});
const pinned = (i: number, status: PinkPawGalleryCat['status'] = 'WAITING'): PinkPawGalleryCat => ({
  ...cat(0, status),
  id: RESCUE_FALLBACK[i].id,
  name: RESCUE_FALLBACK[i].name,
});

class MemStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const jsonFetch = (routes: Record<string, unknown>) => {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const path = new URL(url).pathname;
    if (!(path in routes)) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => routes[path] };
  };
  return { f, calls };
};

afterEach(() => resetRescueCats());

describe('rescue cats: local fallback', () => {
  it('pins one distinct real cat per campaign level, with the level crate sprite', () => {
    expect(RESCUE_FALLBACK.map((c) => c.levelId)).toEqual([...RESCUE_LEVEL_IDS]);
    expect(new Set(RESCUE_FALLBACK.map((c) => c.id)).size).toBe(RESCUE_FALLBACK.length);
    for (const c of RESCUE_FALLBACK) {
      expect(c.id).toMatch(/^[0-9a-f]{24}$/);
      const level = JSON.parse(readFileSync(resolve(ROOT, `src/levels/${c.levelId}.json`), 'utf8')) as { crate: { catId: string } };
      expect(c.spriteCatId, c.levelId).toBe(level.crate.catId);
    }
  });

  it('ships one small, sharp (336x448) webp photo per pinned cat and no unused card art', () => {
    let total = 0;
    for (const c of RESCUE_FALLBACK) {
      const file = resolve(PINK_PAW, `${c.file}-photo.webp`);
      expect(existsSync(file), file).toBe(true);
      const buf = readFileSync(file);
      expect(buf.subarray(8, 12).toString('ascii'), file).toBe('WEBP');
      expect(buf.length, file).toBeLessThanOrEqual(20_000);
      total += buf.length;
      // Nothing in the rescue UI shows card art, so none ships for these cats.
      expect(existsSync(resolve(PINK_PAW, `${c.file}-card.webp`)), `${c.file}-card.webp`).toBe(false);
    }
    expect(total).toBeLessThanOrEqual(160_000);
  });

  it('gives a local, dated cat under the asset base', () => {
    const c = fallbackRescueCat('heist-02', '/a/', '');
    expect(c).toMatchObject({ levelId: 'heist-02', name: 'Medutis', spriteCatId: 'cheesy', source: 'fallback', status: 'WAITING', statusAsOf: '2026-10-04' });
    expect(c.photo).toBe('/a/images/pink-paw/medutis-photo.webp');
    expect(c.art).toBeUndefined();
    expect(c.profileUrl).toBeUndefined();
    expect(c.shelterName).toContain('Pink Paw');
  });

  it('links the cat page when the build has a site', () => {
    const c = fallbackRescueCat('heist-01', '/a/', 'https://tokentails.com/shelter-payouts');
    expect(c.profileUrl).toBe(`https://tokentails.com/cats/${RESCUE_FALLBACK[0].id}`);
  });

  it('maps an unknown level id onto a pinned cat', () => {
    expect(fallbackRescueCat('heist-10', '/a/', '').name).toBe(RESCUE_FALLBACK[1].name);
    expect(fallbackRescueCat('dev', '/a/', '').name).toBe(RESCUE_FALLBACK[0].name);
  });
});

describe('rescue cats: assignment', () => {
  const gallery = (atShelter: PinkPawGalleryCat[], adopted: PinkPawGalleryCat[] = []): PinkPawGallery => ({ atShelter, adopted });

  it('keeps a pinned cat on its level while it is at the shelter', () => {
    const g = gallery([cat(5), pinned(2, 'RECOVERING'), cat(3)]);
    const a = assignRescueCats(g);
    expect(a['heist-03'].id).toBe(RESCUE_FALLBACK[2].id);
    expect(a['heist-03'].status).toBe('RECOVERING');
  });

  it('is deterministic: the same cats in any order give the same picks', () => {
    const cats = Array.from({ length: 20 }, (_, i) => cat(100 + i));
    const a = assignRescueCats(gallery(cats));
    const b = assignRescueCats(gallery([...cats].reverse()));
    expect(b).toEqual(a);
    const ids = RESCUE_LEVEL_IDS.map((id) => a[id].id);
    expect(new Set(ids).size).toBe(8);
    // Level index -> unused cats in id order.
    expect(a['heist-01'].id).toBe(hex(100));
  });

  it('prefers cats at the shelter, then adopted ones as happy endings', () => {
    const a = assignRescueCats(gallery([cat(1), cat(2)], [cat(50, 'ADOPTED'), cat(51, 'ADOPTED'), pinned(7, 'ADOPTED')]));
    const statuses = RESCUE_LEVEL_IDS.map((id) => a[id]?.status);
    expect(statuses.filter((s) => s === 'WAITING').length).toBe(2);
    expect(statuses.filter((s) => s === 'ADOPTED').length).toBe(3);
    expect(Object.keys(a).length).toBe(5);
  });

  it('keeps the cat shown last time when its pin is gone', () => {
    const cats = Array.from({ length: 12 }, (_, i) => cat(200 + i));
    const a = assignRescueCats(gallery(cats), RESCUE_LEVEL_IDS, { 'heist-04': hex(209) });
    expect(a['heist-04'].id).toBe(hex(209));
    const ids = RESCUE_LEVEL_IDS.map((id) => a[id].id);
    expect(new Set(ids).size).toBe(8);
  });

  it('skips cats with unsafe images or ids', () => {
    const bad = [
      { ...cat(1), photo: 'http://cdn.example/1.webp' },
      { ...cat(2), art: 'javascript:alert(1)' },
      { ...cat(3), photo: 'https://cdn.example/a".webp' },
      { ...cat(4), id: 'nope' },
    ];
    expect(assignRescueCats(gallery(bad))).toEqual({});
  });

  it('fills levels with no live cat from the local copies', () => {
    const r = rescueAssignment(gallery([cat(1)]), { base: '/a/', siteUrl: '' });
    expect(r.source).toBe('live');
    expect(r.cats['heist-01']).toMatchObject({ source: 'live', id: hex(1), spriteCatId: 'siamese' });
    expect(r.cats['heist-02']).toMatchObject({ source: 'fallback', name: 'Medutis' });
    expect(rescueAssignment(null, { base: '/a/', siteUrl: '' }).source).toBe('fallback');
  });
});

describe('rescue cats: URL validation', () => {
  it('accepts https and local copies only', () => {
    expect(safeImageUrl('https://cdn.example/x.webp')).toBe('https://cdn.example/x.webp');
    expect(safeImageUrl(' https://cdn.example/x.webp ')).toBe('https://cdn.example/x.webp');
    expect(safeImageUrl('http://cdn.example/x.webp')).toBeNull();
    expect(safeImageUrl('//cdn.example/x.webp')).toBeNull();
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('https://cdn.example/x y.webp')).toBeNull();
    expect(safeImageUrl('https://cdn.example/<x>.webp')).toBeNull();
    expect(safeImageUrl(42)).toBeNull();
    expect(safeImageUrl('/a/images/pink-paw/gabe-photo.webp', '/a/')).toBe('/a/images/pink-paw/gabe-photo.webp');
    expect(safeImageUrl('/a/images/pink-paw/../x.webp', '/a/')).toBeNull();
    expect(safeImageUrl('/elsewhere/x.webp', '/a/')).toBeNull();
  });
});

describe('rescue cats: status and name', () => {
  it('labels statuses honestly, dating local copies', () => {
    expect(rescueStatusLabel({ status: 'WAITING', source: 'live' })).toBe('waiting for a home');
    expect(rescueStatusLabel({ status: 'RECOVERING', source: 'live' })).toBe('recovering');
    expect(rescueStatusLabel({ status: 'ADOPTED', source: 'live' })).toBe('adopted ❤');
    expect(rescueStatusLabel({ status: null, source: 'live' })).toBeNull();
    expect(rescueStatusLabel({ status: 'WAITING', source: 'fallback', statusAsOf: '2026-10-04' })).toBe('waiting for a home as of 4 Oct 2026');
  });

  it('overrides the crate name on a UI copy only', () => {
    const level = { id: 'heist-01', crate: { id: 'crate', tile: { x: 1, y: 1 }, catId: 'siamese', catName: 'Mochi' } };
    const ui = withRescueName(level, 'Gabė');
    expect(ui.crate.catName).toBe('Gabė');
    expect(ui.crate.catId).toBe('siamese');
    expect(level.crate.catName).toBe('Mochi');
    expect(withRescueName(level, 'Mochi')).toBe(level);
    expect(withRescueName(level, '')).toBe(level);
    expect(rescueName('heist-01', { storage: null })).toBe('Gabė');
    expect(withRescueName({ ...level }).crate.catName).toBe(rescueName('heist-01'));
  });

  it('swaps the story name in the intro too, so one brief never names two cats', () => {
    for (const id of RESCUE_LEVEL_IDS) {
      const level = JSON.parse(readFileSync(resolve(ROOT, `src/levels/${id}.json`), 'utf8')) as { id: string; crate: { catName: string }; meta: { intro?: string } };
      const ui = withRescueName(level, 'Gabė');
      expect(ui.meta.intro ?? '', id).not.toMatch(new RegExp(`\\b${level.crate.catName}\\b`));
      if (level.meta.intro?.includes(level.crate.catName)) expect(ui.meta.intro, id).toContain('Gabė');
    }
    expect(renameIn('Free Mochi. Mochiko stays. (Mochi!)', 'Mochi', 'Gabė')).toBe('Free Gabė. Mochiko stays. (Gabė!)');
    expect(renameIn('Bring Clover home.', 'Clover', 'A$&b')).toBe('Bring A$&b home.');
  });

  it('never touches the level JSON (sim hashes stay byte-identical)', () => {
    for (const id of RESCUE_LEVEL_IDS) {
      const raw = readFileSync(resolve(ROOT, `src/levels/${id}.json`), 'utf8');
      const level = JSON.parse(raw) as { id: string; crate: { catName: string } };
      const ui = withRescueName(level, 'Someone');
      expect(ui).not.toBe(level);
      expect(JSON.stringify(level)).toBe(JSON.stringify(JSON.parse(raw)));
    }
  });
});

describe('rescue cats: loading', () => {
  it('reads the gallery endpoint first, with adopted cats', async () => {
    const { f, calls } = jsonFetch({
      '/shelter/rozine-pedute/gallery': { atShelter: [{ ...pinned(0) }], adopted: [{ ...cat(9, 'ADOPTED') }] },
    });
    const g = await fetchRescueGallery('http://api.test/', f);
    expect(calls).toEqual(['http://api.test/shelter/rozine-pedute/gallery']);
    expect(g?.atShelter.map((c) => c.name)).toEqual(['Gabė']);
    expect(g?.adopted.length).toBe(1);
  });

  it('falls back to the storefront when the gallery endpoint is missing', async () => {
    const raw = (n: number, status: string, name: string) => ({ _id: hex(n), name, blessing: { name, status, image: { url: `https://cdn.example/${n}.webp` }, catAvatar: { url: `https://cdn.example/${n}a.webp` } } });
    const { f } = jsonFetch({ '/cat/sale': { 'rozine-pedute': [raw(1, 'WAITING', 'AMSIS'), raw(2, 'ADOPTED', 'Bob'), raw(3, 'HEAVEN', 'Gone')] } });
    const g = await fetchRescueGallery('http://api.test', f);
    expect(g?.atShelter.map((c) => c.name)).toEqual(['Amsis']);
    expect(g?.adopted.map((c) => c.name)).toEqual(['Bob']);
  });

  it('gives null offline, blocked (throwing fetch) or without an API', async () => {
    expect(await fetchRescueGallery('', jsonFetch({}).f)).toBeNull();
    expect(await fetchRescueGallery('http://api.test', jsonFetch({}).f)).toBeNull();
    expect(await fetchRescueGallery('http://api.test', async () => Promise.reject(new TypeError('CORS')))).toBeNull();
  });

  it('serves the local copy without an API, then retries on the next call', async () => {
    const storage = new MemStorage();
    const c = await getRescueCat('heist-05', { apiUrl: '', base: '/a/', siteUrl: '', storage });
    expect(c).toMatchObject({ source: 'fallback', name: 'Unis', photo: '/a/images/pink-paw/unis-photo.webp' });
    const { f } = jsonFetch({ '/shelter/rozine-pedute/gallery': { atShelter: [pinned(4, 'RECOVERING')], adopted: [] } });
    await Promise.resolve();
    const live = await getRescueCat('heist-05', { apiUrl: 'http://api.test', fetch: f, base: '/a/', siteUrl: '', storage });
    expect(live).toMatchObject({ source: 'live', name: 'Unis', status: 'RECOVERING', spriteCatId: 'olive' });
  });

  it('remembers live cats for the next first paint, and fetches once per page', async () => {
    const storage = new MemStorage();
    const { f, calls } = jsonFetch({ '/shelter/rozine-pedute/gallery': { atShelter: [cat(1, 'WAITING', 'Amsis')], adopted: [] } });
    expect(getRescueCatCached('heist-01', { base: '/a/', siteUrl: '', storage }).source).toBe('fallback');
    const opts = { apiUrl: 'http://api.test', fetch: f, base: '/a/', siteUrl: '', storage };
    await getRescueCat('heist-01', opts);
    await getRescueCat('heist-02', opts);
    expect(calls.length).toBe(1);
    expect(getRescueCatCached('heist-01', { storage }).name).toBe('Amsis');
    // A new page load: the remembered cat paints first.
    resetRescueCats();
    const remembered = getRescueCatCached('heist-01', { base: '/a/', siteUrl: '', storage });
    expect(remembered).toMatchObject({ name: 'Amsis', source: 'remembered', status: 'WAITING' });
    // Its status is dated: it was true when this browser saw it, and may not be now.
    expect(remembered.statusAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rescueStatusLabel(remembered)).toMatch(/^waiting for a home as of \d{1,2} \w{3} \d{4}$/);
    expect(JSON.parse(storage.getItem(RESCUE_STORAGE_KEY)!)['heist-01'].id).toBe(hex(1));
  });

  it('drops the status of a remembered cat that has no date (older storage)', () => {
    const storage = new MemStorage();
    storage.setItem(RESCUE_STORAGE_KEY, JSON.stringify({ 'heist-01': cat(1, 'WAITING', 'Amsis') }));
    const c = getRescueCatCached('heist-01', { base: '/a/', siteUrl: '', storage });
    expect(c).toMatchObject({ name: 'Amsis', source: 'remembered', status: null });
    expect(rescueStatusLabel(c)).toBeNull();
  });

  it('shares a failed load for a while instead of waiting out the timeout again', async () => {
    let calls = 0;
    const f = async () => {
      calls++;
      throw new TypeError('offline');
    };
    const opts = { apiUrl: 'http://api.test', fetch: f, base: '/a/', siteUrl: '', storage: null };
    expect((await getRescueCat('heist-01', opts)).source).toBe('fallback');
    const after = calls;
    expect(after).toBeGreaterThan(0);
    expect((await getRescueCat('heist-02', opts)).source).toBe('fallback');
    expect(calls).toBe(after);
    expect(RESCUE_RETRY_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('ignores tampered or broken storage', () => {
    const storage = new MemStorage();
    storage.setItem(RESCUE_STORAGE_KEY, JSON.stringify({ 'heist-01': { ...cat(1), photo: 'javascript:alert(1)' }, 'heist-02': { ...cat(2), name: 'x'.repeat(80) }, evil: cat(3) }));
    expect(getRescueCatCached('heist-01', { base: '/a/', siteUrl: '', storage }).source).toBe('fallback');
    expect(getRescueCatCached('heist-02', { base: '/a/', siteUrl: '', storage }).source).toBe('fallback');
    storage.setItem(RESCUE_STORAGE_KEY, '{not json');
    expect(getRescueCatCached('heist-01', { base: '/a/', siteUrl: '', storage }).name).toBe('Gabė');
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(getRescueCatCached('heist-01', { base: '/a/', siteUrl: '', storage: throwing }).name).toBe('Gabė');
  });
});
