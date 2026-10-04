/**
 * A real Pink Paw (Rožinė pėdutė) shelter cat for every heist: when a level is picked, the player sees
 * the pixel cat they will free next to a real cat at the shelter, its real name and its real status.
 *
 *   const cat = getRescueCatCached('heist-03');      // sync, for first paint (never throws)
 *   const live = await getRescueCat('heist-03');     // the live cat once the API answers
 *   const lvForUi = withRescueName(level);           // UI-only copy: brief, crate label, toasts, results
 *
 * Data: the same public gallery as the payouts modal (src/ui/pink-paw.ts): `GET {api}/shelter/
 * rozine-pedute/gallery`, else the storefront `GET {api}/cat/sale`, both checked by the shared parser
 * (shared/pink-paw.ts: 24-hex ids, https images only, HEAVEN never shown). The API base is the
 * Heist's runtime config (src/ui/rail.ts `heistRuntimeConfig`: window.__TT_HEIST_CONFIG__, the
 * `heist:api-url` meta, else the host table: tokentails.com and the local client on :3000/:3001).
 * Any other host (portals, itch, file://), a CORS block, an error or a 6 s timeout gives the local
 * copies below, so the feature works offline.
 *
 * Assignment (stable across reloads, see `assignRescueCats`):
 *   1. the level's pinned cat (RESCUE_FALLBACK) when it is still at the shelter;
 *   2. else the cat this browser was shown last time, when it is still at the shelter;
 *   3. else a cat still at the shelter: the unused ones sorted by id, level index -> cat;
 *   4. else (nobody left at the shelter) an adopted cat, shown as a happy ending, same order;
 *   5. else the local copy.
 *
 * Sprite: the level's own `crate.catId` is kept (the 3D crate renders that sheet; changing it would
 * need level JSON edits and break the SIM hashes). Instead the pinned cats were picked by eye
 * (4 Oct 2026) to look like their level's sprite: a seal-point cat for the Siamese, a ginger for
 * Cheesy, and so on (`look` below). A live replacement cat keeps the level sprite too.
 *
 * Honesty: names, photos and statuses come only from the shelter's data. A local copy cannot know
 * when a cat is adopted, so its status is the one recorded on RESCUE_FALLBACK_FETCHED and
 * `rescueStatusLabel` says "as of" that date. Nothing here touches the sim, the level JSON or the
 * solutions: the real name is a display override keyed by level id.
 */
import { parsePinkPawGalleryBody, pinkPawGalleryPath, storefrontGalleryResult, type PinkPawCatStatus, type PinkPawGallery, type PinkPawGalleryCat } from '../../shared-contracts/pink-paw';
import { ASSET_BASE, PAYOUTS_URL } from '../../types';
import { PINK_PAW_DIR, pinkPawCatUrl } from '../pink-paw';
import { heistRuntimeConfig } from '../rail';

/** The shelter, as shown next to the photo. */
export const RESCUE_SHELTER_NAME = 'Pink Paw (Rožinė pėdutė)';
/** The line shown with every real cat. */
export const RESCUE_SHELTER_LINE = 'Real cat at Pink Paw shelter, Lithuania';
/** When the local copies (images and statuses) were taken from GET /cat/sale on api.tokentails.com. */
export const RESCUE_FALLBACK_FETCHED = '2026-10-04';

/** The campaign's levels, in order (src/levels/heist-0N.json). */
export const RESCUE_LEVEL_IDS = ['heist-01', 'heist-02', 'heist-03', 'heist-04', 'heist-05', 'heist-06', 'heist-07', 'heist-08'] as const;

export interface RescueFallbackCat {
  levelId: string;
  /** The cat's id in the Token Tails backend (its page is /cats/<id>). */
  id: string;
  name: string;
  /** File stem under PINK_PAW_DIR: `<file>-photo.webp` (336x448; no card art is shipped, nothing here shows it). */
  file: string;
  /** Status on RESCUE_FALLBACK_FETCHED. */
  status: PinkPawCatStatus;
  /** The level's crate sprite (crate.catId), kept as is. */
  spriteCatId: string;
  /** Why this cat was pinned to this level (not shown to players). */
  look: string;
}

/**
 * The pinned cat per level, and the offline copies. All were WAITING at the shelter on
 * RESCUE_FALLBACK_FETCHED and shown in the public gallery. Images resized from the CDN URLs the API
 * returned (https only). Re-check before a demo: `npm run check:pink-paw` covers the modal's four.
 */
export const RESCUE_FALLBACK: readonly RescueFallbackCat[] = [
  { levelId: 'heist-01', id: '6992227d890a12f52a317e22', name: 'Gabė', file: 'gabe', status: 'WAITING', spriteCatId: 'siamese', look: 'seal-point face, like the Siamese sprite' },
  { levelId: 'heist-02', id: '69a5341d3ee4d7b657941bb8', name: 'Medutis', file: 'medutis', status: 'WAITING', spriteCatId: 'cheesy', look: 'ginger, like Cheesy' },
  { levelId: 'heist-03', id: '6987c3a51fc0c504e354d2cc', name: 'Tita', file: 'tita', status: 'WAITING', spriteCatId: 'mist', look: 'pale grey long hair, like Mist' },
  { levelId: 'heist-04', id: '699221a0890a12f52a317dca', name: 'Aukste', file: 'aukste', status: 'WAITING', spriteCatId: 'peachies', look: 'white with ginger patches, like Peachies' },
  { levelId: 'heist-05', id: '6a085bc0a885f725f7a94d0a', name: 'Unis', file: 'unis', status: 'WAITING', spriteCatId: 'olive', look: 'grey tabby, like Olive' },
  { levelId: 'heist-06', id: '6a30473c1d6649b19b03622b', name: 'Lambo', file: 'lambo', status: 'WAITING', spriteCatId: 'maine', look: 'dark brown tabby, like Maine' },
  { levelId: 'heist-07', id: '6a30507d1d6649b19b036626', name: 'Mora', file: 'mora', status: 'WAITING', spriteCatId: 'grey', look: 'dark smoke coat, like Grey' },
  { levelId: 'heist-08', id: '69d27ed0a885f725f7a52631', name: 'Vane', file: 'vane', status: 'WAITING', spriteCatId: 'white', look: 'white long hair, like White' },
];

export interface RescueCat {
  levelId: string;
  /** The cat's backend id (24 hex). */
  id: string;
  /** The real name, as the shelter typed it (shared `pinkPawCatName`). */
  name: string;
  /** Live: the shelter's current status. Fallback: the status on `statusAsOf`. */
  status: PinkPawCatStatus | null;
  /** The shelter's own photo (https, or a local copy under the asset base). */
  photo: string;
  /** The cat's Token Tails card art (live cats only; checked, stored, not shown by the rescue UI). */
  art?: string;
  /** The sprite sheet id shown beside the photo (the level's crate.catId). */
  spriteCatId: string;
  shelterName: string;
  /** The cat's page on the Token Tails site; absent when the build has no site link. */
  profileUrl?: string;
  /**
   * live: this page's API answer. remembered: what this browser was shown on an earlier visit (the
   * API has not answered on this page). fallback: the bundled copy.
   */
  source: 'live' | 'remembered' | 'fallback';
  /** Remembered and fallback: the date `status` was recorded (YYYY-MM-DD), shown as "as of". */
  statusAsOf?: string;
}

/** The level -> cat map, and where its cats came from. */
export interface RescueAssignment {
  cats: Record<string, RescueCat>;
  source: 'live' | 'fallback';
}

/**
 * Only https image URLs without quotes, spaces or angle brackets (the shared parser's rule, applied
 * again here so a cat from any source is checked before it reaches an <img>), or a local copy under
 * `base` when one is given.
 */
export function safeImageUrl(value: unknown, base?: string): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (/^https:\/\/[^\s"'<>\\]+$/i.test(url)) {
    try {
      return new URL(url).protocol === 'https:' ? url : null;
    } catch {
      return null;
    }
  }
  if (base && url.startsWith(`${base}${PINK_PAW_DIR}`) && /^[\w./:-]+\.webp$/.test(url) && !url.includes('..')) return url;
  return null;
}

const levelIndex = (levelId: string, levelIds: readonly string[]) => levelIds.indexOf(levelId);
const fallbackFor = (levelId: string) => RESCUE_FALLBACK.find((c) => c.levelId === levelId);
/** The level's crate sprite: the pinned entry's copy of crate.catId (a test keeps them equal). */
const spriteFor = (levelId: string) => fallbackFor(levelId)?.spriteCatId ?? 'mist';

/** A level id outside the campaign gets the pinned cat of `heist-0((n-1) mod 8 + 1)`, else heist-01's. */
function pinnedFor(levelId: string): RescueFallbackCat {
  const own = fallbackFor(levelId);
  if (own) return own;
  const n = Number(/(\d+)$/.exec(levelId)?.[1] ?? '1');
  return RESCUE_FALLBACK[(((Number.isFinite(n) ? n : 1) - 1) % RESCUE_FALLBACK.length + RESCUE_FALLBACK.length) % RESCUE_FALLBACK.length];
}

/** The local copy of a level's pinned cat. */
export function fallbackRescueCat(levelId: string, base: string = ASSET_BASE, siteUrl: string | undefined = PAYOUTS_URL): RescueCat {
  const c = pinnedFor(levelId);
  const profileUrl = pinkPawCatUrl(siteUrl, c.id);
  return {
    levelId,
    id: c.id,
    name: c.name,
    status: c.status,
    photo: `${base}${PINK_PAW_DIR}${c.file}-photo.webp`,
    spriteCatId: fallbackFor(levelId)?.spriteCatId ?? c.spriteCatId,
    shelterName: RESCUE_SHELTER_NAME,
    ...(profileUrl ? { profileUrl } : {}),
    source: 'fallback',
    statusAsOf: RESCUE_FALLBACK_FETCHED,
  };
}

const byId = (a: PinkPawGalleryCat, b: PinkPawGalleryCat) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Pure: picks one real cat per level from a gallery (see the module comment for the order). The
 * result depends only on the gallery's set of cats (not their order) and `previous`, so it is
 * stable across reloads. Cats with an unsafe image are skipped. Levels with no cat left are absent.
 */
export function assignRescueCats(
  gallery: PinkPawGallery,
  levelIds: readonly string[] = RESCUE_LEVEL_IDS,
  previous: Readonly<Record<string, string>> = {},
): Record<string, PinkPawGalleryCat> {
  const ok = (c: PinkPawGalleryCat) => !!safeImageUrl(c.photo) && !!safeImageUrl(c.art) && /^[0-9a-f]{24}$/i.test(c.id);
  const atShelter = gallery.atShelter.filter((c) => c.status !== 'ADOPTED' && ok(c)).sort(byId);
  const adopted = [...gallery.adopted, ...gallery.atShelter.filter((c) => c.status === 'ADOPTED')].filter(ok).sort(byId);
  const used = new Set<string>();
  const out: Record<string, PinkPawGalleryCat> = {};
  const take = (levelId: string, cat: PinkPawGalleryCat | undefined) => {
    if (!cat || used.has(cat.id) || out[levelId]) return;
    out[levelId] = cat;
    used.add(cat.id);
  };
  const find = (list: PinkPawGalleryCat[], id: string | undefined) => (id ? list.find((c) => c.id === id) : undefined);
  // 1. Pinned cats still at the shelter (all levels first, so a later level's pin is never taken).
  for (const id of levelIds) take(id, find(atShelter, fallbackFor(id)?.id));
  // 2. The cat shown last time, if still at the shelter and not pinned elsewhere.
  const pinned = new Set(RESCUE_FALLBACK.map((c) => c.id));
  for (const id of levelIds) {
    const prev = find(atShelter, previous[id]);
    if (prev && (!pinned.has(prev.id) || fallbackFor(id)?.id === prev.id)) take(id, prev);
  }
  // 3 and 4. The rest, level index -> the unused cats in id order (at the shelter, then adopted).
  for (const pool of [atShelter, adopted]) {
    for (const id of levelIds) {
      if (out[id]) continue;
      const free = pool.filter((c) => !used.has(c.id));
      if (!free.length) break;
      const i = Math.max(0, levelIndex(id, levelIds));
      take(id, free[i % free.length]);
    }
  }
  return out;
}

/** A gallery cat as the rescue cat of a level. */
export function toRescueCat(levelId: string, cat: PinkPawGalleryCat, siteUrl: string | undefined = PAYOUTS_URL): RescueCat {
  const profileUrl = pinkPawCatUrl(siteUrl, cat.id);
  return {
    levelId,
    id: cat.id,
    name: cat.name,
    status: cat.status,
    photo: cat.photo,
    art: cat.art,
    spriteCatId: spriteFor(levelId),
    shelterName: RESCUE_SHELTER_NAME,
    ...(profileUrl ? { profileUrl } : {}),
    source: 'live',
  };
}

/** Every level's cat from a gallery; a level with no live cat gets its local copy. */
export function rescueAssignment(
  gallery: PinkPawGallery | null,
  opts: { base?: string; siteUrl?: string; levelIds?: readonly string[]; previous?: Readonly<Record<string, string>> } = {},
): RescueAssignment {
  const base = opts.base ?? ASSET_BASE;
  const siteUrl = 'siteUrl' in opts ? opts.siteUrl : PAYOUTS_URL;
  const levelIds = opts.levelIds ?? RESCUE_LEVEL_IDS;
  const picked = gallery ? assignRescueCats(gallery, levelIds, opts.previous) : {};
  const cats: Record<string, RescueCat> = {};
  let live = 0;
  for (const id of levelIds) {
    const cat = picked[id];
    cats[id] = cat ? toRescueCat(id, cat, siteUrl) : fallbackRescueCat(id, base, siteUrl);
    if (cat) live++;
  }
  return { cats, source: live ? 'live' : 'fallback' };
}

const STATUS_LABEL: Record<PinkPawCatStatus, string> = {
  WAITING: 'waiting for a home',
  RECOVERING: 'recovering',
  ADOPTED: 'adopted ❤',
};

/**
 * "waiting for a home" / "recovering" / "adopted ❤"; a local or remembered copy adds "as of 4 Oct
 * 2026" (it cannot know about an adoption since). Null when unknown.
 */
export function rescueStatusLabel(cat: Pick<RescueCat, 'status' | 'source' | 'statusAsOf'>): string | null {
  const label = cat.status ? STATUS_LABEL[cat.status] : null;
  if (!label) return null;
  if (cat.source === 'live' || !cat.statusAsOf) return label;
  const d = new Date(`${cat.statusAsOf}T12:00:00Z`);
  const when = Number.isNaN(d.getTime()) ? cat.statusAsOf : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${label} as of ${when}`;
}

type Fetch = (input: string, init?: { signal?: AbortSignal; credentials?: 'omit' }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * The shelter's whole gallery (at the shelter and adopted), or null when the API cannot be reached.
 * Never rejects. Same endpoints and parser as the payouts modal.
 */
export async function fetchRescueGallery(apiUrl: string, f: Fetch | undefined = globalThis.fetch as unknown as Fetch, timeoutMs = 6000): Promise<PinkPawGallery | null> {
  if (!apiUrl || !f) return null;
  const api = apiUrl.replace(/\/+$/, '');
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  const get = async (path: string): Promise<unknown> => {
    try {
      const res = await f(`${api}${path}`, { signal: ctl?.signal, credentials: 'omit' });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  try {
    const gallery = parsePinkPawGalleryBody(await get(pinkPawGalleryPath()));
    if (gallery && (gallery.atShelter.length || gallery.adopted.length)) return gallery;
    // Production has no gallery endpoint yet (404 on 4 Oct 2026): the storefront.
    const sale = await get('/cat/sale');
    if (!sale) return null;
    const { atShelter, adopted } = storefrontGalleryResult(sale);
    return atShelter.length || adopted.length ? { atShelter, adopted } : null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Page-level cache: one fetch per page load, last live picks remembered ---------- */

/**
 * localStorage key: the last live cat per level ({ levelId: { id, name, status, photo, art, seenAt } }),
 * for first paint. `seenAt` (YYYY-MM-DD) dates the status; an entry without it keeps no status.
 */
export const RESCUE_STORAGE_KEY = 'catnip-heist:rescue-cats:v1';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface RescueLoadOptions {
  apiUrl?: string;
  base?: string;
  siteUrl?: string;
  fetch?: Fetch;
  storage?: StorageLike | null;
  timeoutMs?: number;
}

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const defaultApi = (): string => {
  try {
    return typeof window !== 'undefined' ? heistRuntimeConfig(window as never, document).apiUrl : '';
  } catch {
    return '';
  }
};

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * A remembered cat, checked like a live one (ids, https images, a known status, a known level). Its
 * status is dated by `seenAt`, so the UI says "as of"; without a valid date the status is dropped.
 */
function readRemembered(storage: StorageLike | null | undefined, siteUrl: string | undefined): Record<string, RescueCat> {
  const out: Record<string, RescueCat> = {};
  try {
    const raw = storage?.getItem(RESCUE_STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : null;
    if (!data || typeof data !== 'object') return out;
    for (const [levelId, c] of Object.entries(data as Record<string, Partial<PinkPawGalleryCat> & { seenAt?: unknown }>)) {
      if (!(RESCUE_LEVEL_IDS as readonly string[]).includes(levelId) || !c || typeof c !== 'object') continue;
      const photo = safeImageUrl(c.photo);
      const art = safeImageUrl(c.art);
      const seenAt = typeof c.seenAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.seenAt) ? c.seenAt : null;
      const status = seenAt && (c.status === 'WAITING' || c.status === 'RECOVERING' || c.status === 'ADOPTED') ? c.status : null;
      if (!photo || !art || typeof c.id !== 'string' || !/^[0-9a-f]{24}$/i.test(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 40) continue;
      out[levelId] = { ...toRescueCat(levelId, { id: c.id, name: c.name, status, photo, art }, siteUrl), source: 'remembered', ...(seenAt ? { statusAsOf: seenAt } : {}) };
    }
  } catch {
    /* blocked or corrupt storage: no memory */
  }
  return out;
}

function remember(storage: StorageLike | null | undefined, cats: Record<string, RescueCat>): void {
  try {
    const data: Record<string, PinkPawGalleryCat & { seenAt: string }> = {};
    const seenAt = today();
    for (const [id, c] of Object.entries(cats)) if (c.source === 'live' && c.art) data[id] = { id: c.id, name: c.name, status: c.status, photo: c.photo, art: c.art, seenAt };
    if (Object.keys(data).length) storage?.setItem(RESCUE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked */
  }
}

let loading: Promise<RescueAssignment> | null = null;
let loaded: RescueAssignment | null = null;
/** The last failed load: its API and when it ended (a failure is not retried for RESCUE_RETRY_MS). */
let failed: { apiUrl: string; at: number } | null = null;
/** How long an unreachable API is left alone before the next call tries again. */
export const RESCUE_RETRY_MS = 60_000;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Every level's cat, fetched once per page load. While a load runs every caller shares it; a
 * failed load (no API, offline, blocked, timeout) is shared too for RESCUE_RETRY_MS, so the boot
 * and the level select do not each wait out the timeout. A different API URL tries at once.
 * Never rejects. The first call's options win until `resetRescueCats`.
 */
export function loadRescueCats(opts: RescueLoadOptions = {}): Promise<RescueAssignment> {
  const apiUrl = opts.apiUrl ?? defaultApi();
  if (loading && (!failed || (failed.apiUrl === apiUrl && now() - failed.at < RESCUE_RETRY_MS))) return loading;
  failed = null;
  const base = opts.base ?? ASSET_BASE;
  const siteUrl = 'siteUrl' in opts ? opts.siteUrl : PAYOUTS_URL;
  const storage = 'storage' in opts ? opts.storage : defaultStorage();
  const p = (async () => {
    const gallery = await fetchRescueGallery(apiUrl, opts.fetch, opts.timeoutMs).catch(() => null);
    const previous: Record<string, string> = {};
    for (const [id, c] of Object.entries(readRemembered(storage, siteUrl))) previous[id] = c.id;
    const result = rescueAssignment(gallery, { base, siteUrl, previous });
    if (result.source === 'live') {
      loaded = result;
      remember(storage, result.cats);
    }
    return result;
  })();
  loading = p;
  void p.then((r) => {
    if (r.source === 'fallback' && loading === p) failed = { apiUrl, at: now() };
  });
  return p;
}

/** The level's real cat: live when the API answers, else the local copy. Never rejects. */
export async function getRescueCat(levelId: string, opts: RescueLoadOptions = {}): Promise<RescueCat> {
  const r = await loadRescueCats(opts);
  return r.cats[levelId] ?? fallbackRescueCat(levelId, opts.base ?? ASSET_BASE, 'siteUrl' in opts ? opts.siteUrl : PAYOUTS_URL);
}

/**
 * Sync, for first paint: this page's live cat if already loaded, else the one this browser was
 * shown last time (source 'remembered', status dated "as of"), else the local copy. Never throws. Call `getRescueCat` to refresh.
 */
export function getRescueCatCached(levelId: string, opts: Pick<RescueLoadOptions, 'base' | 'siteUrl' | 'storage'> = {}): RescueCat {
  const siteUrl = 'siteUrl' in opts ? opts.siteUrl : PAYOUTS_URL;
  const live = loaded?.cats[levelId];
  if (live) return live;
  const remembered = readRemembered('storage' in opts ? opts.storage : defaultStorage(), siteUrl)[levelId];
  return remembered ?? fallbackRescueCat(levelId, opts.base ?? ASSET_BASE, siteUrl);
}

/** The real cat's name for a level (sync; the cached cat). */
export function rescueName(levelId: string, opts: Pick<RescueLoadOptions, 'base' | 'siteUrl' | 'storage'> = {}): string {
  return getRescueCatCached(levelId, opts).name;
}

/** `text` with every whole-word `from` replaced by `to` (the level's story name in its intro). */
export function renameIn(text: string, from: string, to: string): string {
  if (!from || !to || from === to) return text;
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'gu'), (_, pre: string) => `${pre}${to}`);
}

/**
 * A UI-only copy of a level whose crate shows the real cat's name (brief, crate label, toasts,
 * results), with the level's own story name replaced in `meta.intro` too, so one card never names
 * two cats. Pass it to the UI, never to the sim or the replay/score code: those keep the level as
 * loaded (its hash and solutions are unchanged). `name` pins the name for a run (take it once at
 * run start so a late API answer cannot rename the cat mid-run).
 */
export function withRescueName<T extends { id: string; crate: { catName: string }; meta?: { intro?: string } }>(level: T, name: string = rescueName(level.id)): T {
  const from = level.crate.catName;
  if (!name || name === from) return level;
  const intro = level.meta?.intro;
  const meta = level.meta && typeof intro === 'string' ? { ...level.meta, intro: renameIn(intro, from, name) } : level.meta;
  return { ...level, crate: { ...level.crate, catName: name }, ...(meta ? { meta } : {}) };
}

/** Test hook: forget the page's loaded cats. */
export function resetRescueCats(): void {
  loading = null;
  loaded = null;
  failed = null;
}
