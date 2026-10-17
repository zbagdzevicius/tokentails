/**
 * Pink Paw (Rožinė pėdutė) cast for the daily accomplice (GDD 3.4, 4.6). M0 ships a small static snapshot;
 * M1 replaces it with `public/pink-paw-cats.json` from `tools/sync-pink-paw.mjs` (GET /cat/sale).
 *
 * Honesty: names, ids and statuses come from the shelter's data (the Catnip Heist snapshot of
 * 2026-10-04, catnip-heist/src/ui/levels/rescue-cats.ts). A local copy cannot know when a cat is adopted,
 * so `statusAsOf` must be shown with the status. Colours/patterns are a stylised match of each cat's
 * coat for the toon renderer, not a claim about the cat; bios say only what the shelter's data says.
 */
import { rgb565, type CatSpec, type Pattern } from '../types';

export const PINK_PAW_SHELTER = 'Pink Paw (Rožinė pėdutė)';
export const PINK_PAW_LINE = 'Real cat at Pink Paw shelter, Lithuania';
export const PINK_PAW_STATUS_AS_OF = '2026-10-04';
export const PINK_PAW_SITE = 'https://tokentails.com';

export type PinkPawStatus = 'WAITING' | 'RECOVERING' | 'ADOPTED';

export interface PinkPawCat {
  id: string; // Token Tails backend id (24 hex)
  name: string;
  status: PinkPawStatus;
  /** Stylised coat for the toon renderer. */
  pattern: Pattern;
  base: number; // 0xRRGGBB
  secondary: number;
  tertiary: number;
  eyes: number; // EYE_COLORS index
  bio: string;
  /** Shelter page for adoption (default: pinkPawAdoptUrl). */
  adoptUrl?: string;
  /** Same-origin licensed photo path under `pink-paw/` (face decal); null/absent = none shipped. */
  photo?: string | null;
}

export const PINK_PAW_CATS: readonly PinkPawCat[] = Object.freeze([
  { id: '6992227d890a12f52a317e22', name: 'Gabė', status: 'WAITING', pattern: 'solid', base: 0xeadfcf, secondary: 0x5a4434, tertiary: 0xf6f0e6, eyes: 2, bio: 'Seal-point face. Waiting at Pink Paw.' },
  { id: '69a5341d3ee4d7b657941bb8', name: 'Medutis', status: 'WAITING', pattern: 'tabby', base: 0xe39a4f, secondary: 0xb46a2c, tertiary: 0xf7e3c8, eyes: 0, bio: 'Ginger. Waiting at Pink Paw.' },
  { id: '6987c3a51fc0c504e354d2cc', name: 'Tita', status: 'WAITING', pattern: 'solid', base: 0xc9c7cc, secondary: 0x9c9aa2, tertiary: 0xefedf0, eyes: 1, bio: 'Pale grey, long hair. Waiting at Pink Paw.' },
  { id: '699221a0890a12f52a317dca', name: 'Aukste', status: 'WAITING', pattern: 'solid', base: 0xf4efe7, secondary: 0xe0904a, tertiary: 0xf4efe7, eyes: 0, bio: 'White with ginger patches. Waiting at Pink Paw.' },
  { id: '6a085bc0a885f725f7a94d0a', name: 'Unis', status: 'WAITING', pattern: 'tabby', base: 0x9a9aa2, secondary: 0x55555f, tertiary: 0xefebe4, eyes: 1, bio: 'Grey tabby. Waiting at Pink Paw.' },
  { id: '6a30473c1d6649b19b03622b', name: 'Lambo', status: 'WAITING', pattern: 'tabby', base: 0x6e5440, secondary: 0x3a2a20, tertiary: 0xcdb79c, eyes: 0, bio: 'Dark brown tabby. Waiting at Pink Paw.' },
  { id: '6a30507d1d6649b19b036626', name: 'Mora', status: 'WAITING', pattern: 'solid', base: 0x4a4850, secondary: 0x2e2c33, tertiary: 0x77757c, eyes: 3, bio: 'Dark smoke coat. Waiting at Pink Paw.' },
  { id: '69d27ed0a885f725f7a52631', name: 'Vane', status: 'WAITING', pattern: 'solid', base: 0xf6f4f0, secondary: 0xe6e1d8, tertiary: 0xffffff, eyes: 2, bio: 'White, long hair. Waiting at Pink Paw.' },
] as PinkPawCat[]);

/** The cat's page on tokentails.com (adopt link on the result screen). */
export function pinkPawAdoptUrl(cat: Pick<PinkPawCat, 'id'>, site: string = PINK_PAW_SITE): string {
  return `${site.replace(/\/+$/, '')}/cats/${encodeURIComponent(cat.id)}`;
}

/** Playable/renderable CatSpec for a Pink Paw cat (name clipped to 12 chars). */
export function pinkPawCatSpec(cat: PinkPawCat): CatSpec {
  return {
    pattern: cat.pattern,
    ears: 'normal',
    tail: 'normal',
    body: 'normal',
    eyes: cat.eyes,
    base: rgb565(cat.base),
    secondary: rgb565(cat.secondary),
    tertiary: rgb565(cat.tertiary),
    collar: 0,
    hat: 0,
    name: cat.name.slice(0, 12),
  };
}

/** Adoptable cats only (ADOPTED cats move to the alumni list). */
export function pinkPawWaiting(): PinkPawCat[] {
  return PINK_PAW_CATS.filter((c) => c.status !== 'ADOPTED');
}
export function pinkPawAlumni(): PinkPawCat[] {
  return PINK_PAW_CATS.filter((c) => c.status === 'ADOPTED');
}

/**
 * Today's accomplice. `daily/index.json` (L2) may name one by id; otherwise a deterministic rotation by
 * dayNo over the waiting cats. Null only if no cat is waiting.
 */
export function accompliceFor(dayNo: number, id?: string | null): PinkPawCat | null {
  if (id) {
    const named = PINK_PAW_CATS.find((c) => c.id === id);
    if (named && named.status !== 'ADOPTED') return named;
  }
  const pool = pinkPawWaiting();
  if (pool.length === 0) return null;
  const d = Math.floor(Number.isFinite(dayNo) ? dayNo : 1);
  const i = (((d - 1) % pool.length) + pool.length) % pool.length;
  return pool[i];
}

// ---------------------------------------------------------------------------------------------
// FULL build: `public/pink-paw-cats.json` (generated from this snapshot now; `tools/sync-pink-paw.mjs`
// refreshes it in wave 2), still waiting / alumni helpers, guest specs, face photo URLs.
// ---------------------------------------------------------------------------------------------

export const PINK_PAW_JSON = 'pink-paw-cats.json';
export const FOUND_A_HOME = 'Found a home 🏡';

/** JSON shape of `public/pink-paw-cats.json` (colours as "#rrggbb"). */
export interface PinkPawSnapshot {
  asOf: string;
  shelter: string;
  source?: string;
  cats: {
    id: string;
    name: string;
    status: PinkPawStatus;
    pattern: Pattern;
    base: string;
    secondary: string;
    tertiary: string;
    eyes: number;
    bio: string;
    adoptUrl?: string;
    photo?: string | null;
  }[];
}

const hex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
const unhex = (v: unknown): number | null => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? parseInt(v.slice(1), 16) : null);
const PATTERN_SET: readonly Pattern[] = ['solid', 'tabby', 'tuxedo', 'bicolor', 'calico', 'colorpoint', 'tortie'];
const STATUS_SET: readonly PinkPawStatus[] = ['WAITING', 'RECOVERING', 'ADOPTED'];
const PHOTO_RE = /^pink-paw\/[a-z0-9][a-z0-9-]{0,60}\.(jpg|jpeg|webp|png)$/;

/** The built-in snapshot in the JSON shape (what `public/pink-paw-cats.json` holds until the sync tool runs). */
export function pinkPawSnapshot(cats: readonly PinkPawCat[] = PINK_PAW_CATS, asOf = PINK_PAW_STATUS_AS_OF): PinkPawSnapshot {
  return {
    asOf,
    shelter: PINK_PAW_SHELTER,
    source: 'catnip-heist rescue-cats snapshot (refresh: npm run sync:pinkpaw)',
    cats: cats.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      pattern: c.pattern,
      base: hex(c.base),
      secondary: hex(c.secondary),
      tertiary: hex(c.tertiary),
      eyes: c.eyes,
      bio: c.bio,
      adoptUrl: c.adoptUrl ?? pinkPawAdoptUrl(c),
      photo: c.photo ?? null,
    })),
  };
}

/** Validate a snapshot (from JSON). Bad entries are dropped; null when nothing usable is left. */
export function parsePinkPawSnapshot(raw: unknown): { asOf: string; cats: PinkPawCat[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.cats)) return null;
  const cats: PinkPawCat[] = [];
  for (const it of r.cats) {
    if (!it || typeof it !== 'object') continue;
    const c = it as Record<string, unknown>;
    const base = unhex(c.base);
    const secondary = unhex(c.secondary);
    const tertiary = unhex(c.tertiary);
    if (typeof c.id !== 'string' || !/^[a-f0-9]{24}$/.test(c.id)) continue;
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 40) continue;
    if (base === null || secondary === null || tertiary === null) continue;
    const adopt = typeof c.adoptUrl === 'string' && /^https:\/\/[^\s]+$/.test(c.adoptUrl) ? c.adoptUrl : undefined;
    cats.push({
      id: c.id,
      name: c.name.trim(),
      status: STATUS_SET.includes(c.status as PinkPawStatus) ? (c.status as PinkPawStatus) : 'WAITING',
      pattern: PATTERN_SET.includes(c.pattern as Pattern) ? (c.pattern as Pattern) : 'solid',
      base,
      secondary,
      tertiary,
      eyes: typeof c.eyes === 'number' && Number.isInteger(c.eyes) && c.eyes >= 0 && c.eyes < 6 ? c.eyes : 0,
      bio: typeof c.bio === 'string' ? c.bio.slice(0, 160) : '',
      adoptUrl: adopt,
      photo: typeof c.photo === 'string' && PHOTO_RE.test(c.photo) ? c.photo : null,
    });
  }
  if (!cats.length) return null;
  const asOf = typeof r.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.asOf) ? r.asOf : PINK_PAW_STATUS_AS_OF;
  return { asOf, cats };
}

let live: { asOf: string; cats: PinkPawCat[] } | null = null;

/**
 * Load `pink-paw-cats.json` (a static file next to the game; no API). Falls back to the built-in snapshot.
 * The daily accomplice rotation keeps using PINK_PAW_CATS so a day's accomplice never changes mid-day.
 */
export async function loadPinkPawCats(
  opts: { base?: string; fetch?: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }> } = {},
): Promise<{ asOf: string; cats: PinkPawCat[] }> {
  if (live) return live;
  try {
    const f = opts.fetch ?? (globalThis as { fetch?: (u: string) => Promise<{ ok: boolean; json(): Promise<unknown> }> }).fetch;
    if (f) {
      const res = await f(`${opts.base ?? ''}${PINK_PAW_JSON}`);
      if (res.ok) {
        const parsed = parsePinkPawSnapshot(await res.json());
        if (parsed) return (live = parsed);
      }
    }
  } catch {
    /* offline: built-in snapshot */
  }
  return { asOf: PINK_PAW_STATUS_AS_OF, cats: PINK_PAW_CATS.slice() };
}
/** Test hook. */
export function resetPinkPawCache(): void {
  live = null;
}

/** Cats still waiting for a home (the "still waiting" end line, GDD 4.6). */
export function stillWaiting(cats: readonly PinkPawCat[] = live?.cats ?? PINK_PAW_CATS): PinkPawCat[] {
  return cats.filter((c) => c.status !== 'ADOPTED');
}
/** Adopted cats keep appearing as cameos with the "found a home" badge. */
export function alumni(cats: readonly PinkPawCat[] = live?.cats ?? PINK_PAW_CATS): { cat: PinkPawCat; badge: string }[] {
  return cats.filter((c) => c.status === 'ADOPTED').map((cat) => ({ cat, badge: FOUND_A_HOME }));
}
/**
 * Phase 2 live data (GDD 10 "Pink Paw cats: live", src/online): statuses read from the shelter's public gallery
 * (`GET /shelter/<slug>/gallery`). Display only: the badge, "still waiting" vs "went home" clip lines, the adopt
 * link. The daily rotation (accomplice, Felony Friday) keeps PINK_PAW_CATS so every player and the server's replay see
 * the same room.
 */
let liveStatus: Readonly<Record<string, PinkPawStatus>> | null = null;
export function setLivePinkPawStatus(map: Readonly<Record<string, PinkPawStatus>> | null): void {
  liveStatus = map && typeof map === 'object' ? { ...map } : null;
}
/** The cat's live status when the gallery was read, else its snapshot status. */
export function livePinkPawStatus(cat: Pick<PinkPawCat, 'status'> & { id?: string }): PinkPawStatus {
  const live = cat.id && liveStatus ? liveStatus[cat.id] : undefined;
  return live && STATUS_SET.includes(live) ? live : cat.status;
}

/** Badge for any cat: "Found a home 🏡" for alumni, null otherwise. */
export function pinkPawBadge(cat: Pick<PinkPawCat, 'status'> & { id?: string }): string | null {
  return livePinkPawStatus(cat) === 'ADOPTED' ? FOUND_A_HOME : null;
}
/** Felony Friday guest options: every waiting cat as a playable spec (GDD 3.5). */
export function pinkPawGuestSpecs(cats: readonly PinkPawCat[] = stillWaiting()): { cat: PinkPawCat; spec: CatSpec; line: string }[] {
  return cats.map((cat) => ({ cat, spec: pinkPawCatSpec(cat), line: `Play as ${cat.name}: a real cat still waiting at Pink Paw.` }));
}
/** Friday's playable Pink Paw cat: deterministic by dayNo over the waiting cats. */
export function fridayCriminal(dayNo: number): PinkPawCat | null {
  const pool = pinkPawWaiting();
  if (!pool.length) return null;
  const week = Math.floor((Math.floor(Number.isFinite(dayNo) ? dayNo : 1) - 1) / 7);
  return pool[((week % pool.length) + pool.length) % pool.length];
}
/**
 * Face photo URL for the decal: only an allowed same-origin path (`pink-paw/<slug>.jpg|webp|png`) under the
 * deploy base; null when the cat has no licensed photo shipped (the default today).
 */
export function pinkPawFaceUrl(cat: Pick<PinkPawCat, 'photo'>, base = ''): string | null {
  const p = cat.photo;
  if (typeof p !== 'string' || !PHOTO_RE.test(p)) return null;
  return `${base}${p}`;
}
