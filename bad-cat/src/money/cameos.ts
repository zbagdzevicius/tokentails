/**
 * Cameo bundles (GDD 6.5). Each page load gets one of CAMEO_SHUFFLES shuffles per day:
 * shuffle = fnv1a(sessionId + ':' + dayNo) % CAMEO_SHUFFLES. The server samples the pool per shuffle and counts
 * one load per GET (no per-cat writes, no personal data). Offline = Pink Paw cats (waiting, then alumni).
 */
import { CAMEO_SHUFFLES, FRIDGE_MAGNETS, type CameoBundle, type CameoEntry, type CameoKind } from '../types';
import { PINK_PAW_CATS, pinkPawCatSpec } from '../platform';
import { encodeCat } from '../codec';

/** FNV-1a 32-bit over UTF-16 code units. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shuffleFor(sessionId: string, dayNo: number): number {
  return fnv1a(`${sessionId}:${Math.trunc(dayNo)}`) % CAMEO_SHUFFLES;
}

const KINDS: readonly CameoKind[] = ['paid', 'guest_star', 'club', 'free', 'gift', 'streak', 'reply', 'community', 'pinkpaw'];
const CAT_CODE_RE = /^[A-Za-z0-9_-]{8,40}$/;

function cleanEntry(raw: unknown): CameoEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || r.id.length > 64) return null;
  if (typeof r.catCode !== 'string' || !CAT_CODE_RE.test(r.catCode)) return null;
  const kind = KINDS.includes(r.kind as CameoKind) ? (r.kind as CameoKind) : 'free';
  const name = typeof r.name === 'string' ? r.name.slice(0, 12) : '';
  const e: CameoEntry = { id: r.id, name, catCode: r.catCode, kind };
  if (typeof r.faceUrl === 'string' && /^(https:\/\/|\/)/.test(r.faceUrl) && r.faceUrl.length < 300) e.faceUrl = r.faceUrl;
  else e.faceUrl = null;
  if (r.club === true) e.club = true;
  if (r.alumni === true) e.alumni = true;
  return e;
}
function cleanList(raw: unknown, max: number): CameoEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CameoEntry[] = [];
  for (const v of raw) {
    const e = cleanEntry(v);
    if (e) out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

/** Validates a server bundle (never trusts lengths or strings). Null when it is not a bundle. */
export function sanitizeBundle(raw: unknown, dayNo: number, shuffle: number, spectators: number): CameoBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.spectators) && !Array.isArray(r.fridge) && !Array.isArray(r.guestStars)) return null;
  return {
    dayNo,
    shuffle,
    spectators: cleanList(r.spectators, Math.max(0, spectators)),
    fridge: cleanList(r.fridge, FRIDGE_MAGNETS),
    guestStars: cleanList(r.guestStars, 4),
    source: 'server',
  };
}

/** Offline bundle: Pink Paw waiting cats then alumni, rotated by the shuffle and day; empty fridge. */
export function offlineBundle(dayNo: number, shuffle: number, spectators: number): CameoBundle {
  const n = Math.max(0, Math.min(15, Math.floor(Number.isFinite(spectators) ? spectators : 0)));
  const waiting = PINK_PAW_CATS.filter((c) => c.status !== 'ADOPTED');
  const alumni = PINK_PAW_CATS.filter((c) => c.status === 'ADOPTED');
  const pool = [...waiting, ...alumni];
  const list: CameoEntry[] = [];
  if (pool.length > 0 && n > 0) {
    const d = Math.trunc(Number.isFinite(dayNo) ? dayNo : 0);
    const start = (((d + shuffle) % pool.length) + pool.length) % pool.length;
    for (let i = 0; i < Math.min(n, pool.length); i++) {
      const c = pool[(start + i) % pool.length];
      const e: CameoEntry = { id: `pp-${c.id}`, name: c.name.slice(0, 12), catCode: encodeCat(pinkPawCatSpec(c)), kind: 'pinkpaw', faceUrl: null };
      if (c.status === 'ADOPTED') e.alumni = true;
      list.push(e);
    }
  }
  return { dayNo, shuffle, spectators: list, fridge: [], guestStars: [], source: 'offline' };
}
