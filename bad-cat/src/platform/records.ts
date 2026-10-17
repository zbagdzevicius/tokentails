/**
 * Profile and day records (GDD 13.6 keys `profile`, `days`). Everything read from storage is validated:
 * a corrupt or hand-edited save falls back to defaults instead of crashing the game.
 */
import { COSMETICS, DEFAULT_CAT, PATTERNS, EYE_COLORS, type CatSpec, type DayRecord, type Profile, type ProfilePrefs, type StampId, type Store } from '../types';

export const KEY_PROFILE = 'profile';
export const KEY_DAYS = 'days';
/** Pre-launch preview days (dayNo <= 0) keep their ranked records apart, so Day 1 is fresh on launch day. */
export const KEY_PREVIEW_DAYS = 'previewDays';
export const PREVIEW_DAYS_CAP = 60;
export const DAYS_CAP = 400;
export const FREE_MAX_CATS = 1;
export const CLUB_MAX_CATS = 5;

const STAMPS: readonly StampId[] = ['perfect', 'clean', 'caught'];
const u16 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffff ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
/** A collar / hat id that is not in the catalogue is worn as none (ownership is checked on adopt and import). */
const knownCosmetic = (slot: 'collar' | 'hat', v: unknown): number => {
  const id = u16(v, 0);
  return id && COSMETICS.some((c) => c.slot === slot && c.id === id) ? id : 0;
};

export function sanitizeCat(raw: unknown): CatSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const d = DEFAULT_CAT;
  const name = typeof c.name === 'string' ? c.name.replace(/[\u0000-\u001f]/g, '').slice(0, 12) : d.name;
  return {
    pattern: oneOf(c.pattern, PATTERNS, d.pattern),
    ears: oneOf(c.ears, ['normal', 'fold'] as const, d.ears),
    tail: oneOf(c.tail, ['normal', 'fluffy', 'bob'] as const, d.tail),
    body: oneOf(c.body, ['slim', 'normal', 'chonk'] as const, d.body),
    eyes: typeof c.eyes === 'number' && Number.isInteger(c.eyes) && c.eyes >= 0 && c.eyes < EYE_COLORS.length ? c.eyes : d.eyes,
    base: u16(c.base, d.base),
    secondary: u16(c.secondary, d.secondary),
    tertiary: u16(c.tertiary, d.tertiary),
    collar: knownCosmetic('collar', c.collar),
    hat: knownCosmetic('hat', c.hat),
    name,
  };
}

export function defaultProfile(now = Date.now()): Profile {
  return {
    cats: [{ ...DEFAULT_CAT }],
    active: 0,
    createdAt: now,
    sessions: 0,
    settings: { audio: true, reduceMotion: false, showPhotoInClips: true },
  };
}

const unit = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined);

/** FULL build preferences; unknown or invalid fields are dropped. */
export function sanitizePrefs(raw: unknown): ProfilePrefs | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: ProfilePrefs = {};
  const music = unit(r.music);
  const sfx = unit(r.sfx);
  const master = unit(r.master);
  if (music !== undefined) out.music = music;
  if (sfx !== undefined) out.sfx = sfx;
  if (master !== undefined) out.master = master;
  if (typeof r.streamer === 'boolean') out.streamer = r.streamer;
  if (typeof r.captionStyle === 'number' && Number.isInteger(r.captionStyle) && r.captionStyle >= 0 && r.captionStyle <= 4) out.captionStyle = r.captionStyle;
  if (typeof r.clipMusic === 'boolean') out.clipMusic = r.clipMusic;
  if (typeof r.reminder === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.reminder)) out.reminder = r.reminder;
  return out;
}

/** Fields the FULL build owns on the profile (validated, never passed through raw). */
const FULL_FIELDS = new Set(['prefs', 'abArm', 'trails', 'lastSeenWeekly']);

/**
 * Validate a stored profile. `maxCats` is the STORAGE cap (5): a lapsed Club member keeps every saved cat;
 * use `profileFor()` to apply the current allowance (1 free) to what the game may play.
 */
export function sanitizeProfile(raw: unknown, maxCats = CLUB_MAX_CATS): Profile {
  const p = defaultProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Record<string, unknown>;
  const cap = Math.max(1, Math.min(CLUB_MAX_CATS, Math.floor(Number.isFinite(maxCats) ? maxCats : CLUB_MAX_CATS)));
  const cats = Array.isArray(r.cats) ? (r.cats.map(sanitizeCat).filter(Boolean) as CatSpec[]).slice(0, cap) : [];
  if (cats.length) p.cats = cats;
  p.active = typeof r.active === 'number' && Number.isInteger(r.active) && r.active >= 0 && r.active < p.cats.length ? r.active : 0;
  if (typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && r.createdAt > 0) p.createdAt = r.createdAt;
  if (typeof r.sessions === 'number' && Number.isInteger(r.sessions) && r.sessions >= 0) p.sessions = r.sessions;
  const s = r.settings && typeof r.settings === 'object' ? (r.settings as Record<string, unknown>) : {};
  p.settings = {
    audio: typeof s.audio === 'boolean' ? s.audio : true,
    reduceMotion: typeof s.reduceMotion === 'boolean' ? s.reduceMotion : false,
    showPhotoInClips: typeof s.showPhotoInClips === 'boolean' ? s.showPhotoInClips : true,
  };
  const prefs = sanitizePrefs(r.prefs);
  if (prefs) p.prefs = prefs;
  if (r.abArm === 'A' || r.abArm === 'B') p.abArm = r.abArm;
  if (Array.isArray(r.trails)) {
    p.trails = r.trails.slice(0, p.cats.length).map((t) => (typeof t === 'number' && Number.isInteger(t) && t >= 0 && t <= 255 ? t : 0));
  }
  if (typeof r.lastSeenWeekly === 'string' && /^\d{4}-W\d{2}$/.test(r.lastSeenWeekly)) p.lastSeenWeekly = r.lastSeenWeekly;
  // Unknown extra fields (future lanes) are kept for forward compatibility.
  for (const k of Object.keys(r)) if (!(k in p) && !FULL_FIELDS.has(k)) (p as unknown as Record<string, unknown>)[k] = r[k];
  return p;
}

/**
 * The profile as the game may use it under the current allowance (1 cat free, 5 Club). Extra cats saved
 * while in Club are kept (never deleted when Club lapses) but read-only: the active cat is forced into the
 * allowance (index 0 when it was an extra).
 */
export function profileFor(p: Profile, maxCats: number): Profile {
  const cap = Math.max(1, Math.floor(maxCats) || 1);
  return p.active >= cap ? { ...p, active: 0 } : p;
}

/** Indexes of cats the player may play/edit now (the rest are read-only extras). */
export function editableCats(p: Profile, maxCats: number): number[] {
  const cap = Math.max(1, Math.floor(maxCats) || 1);
  return p.cats.map((_, i) => i).filter((i) => i < cap);
}

/**
 * Merge a profile the UI wants to save with the stored one under the allowance: no new cats beyond
 * `maxCats`; read-only extras (index >= maxCats) keep their stored version unless the player deleted cats
 * (a shorter list is accepted as a deletion); the active cat stays inside the allowance.
 */
export function mergeProfileSave(prev: Profile, next: Profile, maxCats: number): Profile {
  const cap = Math.max(1, Math.min(CLUB_MAX_CATS, Math.floor(maxCats) || 1));
  const n = sanitizeProfile(next);
  const allowed = Math.max(cap, prev.cats.length);
  let cats = n.cats.slice(0, Math.min(allowed, CLUB_MAX_CATS));
  if (cats.length >= prev.cats.length) {
    cats = cats.map((c, i) => (i >= cap && i < prev.cats.length ? prev.cats[i] : c)).slice(0, Math.max(cap, prev.cats.length));
  }
  const out: Profile = { ...n, cats };
  if (out.trails) out.trails = out.trails.slice(0, cats.length);
  out.active = n.active < cats.length && n.active < cap ? n.active : 0;
  return out;
}

export function sanitizeDayRecord(raw: unknown): DayRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.score !== 'number' || !Number.isFinite(r.score) || r.score < 0) return null;
  const out: DayRecord = {
    score: Math.floor(r.score),
    stamp: oneOf(r.stamp, STAMPS, 'clean'),
    rank: typeof r.rank === 'string' ? r.rank.slice(0, 40) : '',
    shared: r.shared === true,
  };
  if (typeof r.inputsB64 === 'string' && r.inputsB64.length <= 16_384) out.inputsB64 = r.inputsB64;
  return out;
}

export type DayMap = Record<string, DayRecord>;

export function readDays(store: Store): DayMap {
  const raw = store.get<unknown>(KEY_DAYS, {});
  const out: DayMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1) continue;
    const r = sanitizeDayRecord(v);
    if (r) out[String(n)] = r;
  }
  return out;
}

/** Keep the newest `cap` dayNos (oldest pruned, GDD 13.6). */
export function pruneDays(days: DayMap, cap = DAYS_CAP): DayMap {
  const keys = Object.keys(days).map(Number).sort((a, b) => b - a);
  if (keys.length <= cap) return days;
  const out: DayMap = {};
  for (const k of keys.slice(0, cap)) out[String(k)] = days[String(k)];
  return out;
}

function readPreviewDays(store: Store): DayMap {
  const raw = store.get<unknown>(KEY_PREVIEW_DAYS, {});
  const out: DayMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n > 0 || n < -100_000) continue;
    const r = sanitizeDayRecord(v);
    if (r) out[String(n)] = r;
  }
  return out;
}

export function readDayRecord(store: Store, dayNo: number): DayRecord | null {
  if (!Number.isInteger(dayNo)) return null;
  if (dayNo < 1) return readPreviewDays(store)[String(dayNo)] ?? null;
  return readDays(store)[String(dayNo)] ?? null;
}

export function writeDayRecord(store: Store, dayNo: number, rec: DayRecord): boolean {
  if (!Number.isInteger(dayNo)) return false;
  if (dayNo < 1) {
    if (dayNo < -100_000) return false;
    const clean = sanitizeDayRecord(rec);
    if (!clean) return false;
    const days = readPreviewDays(store);
    days[String(dayNo)] = clean;
    return store.set(KEY_PREVIEW_DAYS, pruneDays(days, PREVIEW_DAYS_CAP));
  }
  const clean = sanitizeDayRecord(rec);
  if (!clean) return false;
  const days = readDays(store);
  days[String(dayNo)] = clean;
  return store.set(KEY_DAYS, pruneDays(days));
}
