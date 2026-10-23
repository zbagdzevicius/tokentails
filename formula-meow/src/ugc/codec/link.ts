/**
 * UGC track links (GDD 8.3). Pure string helpers, no DOM, shared with the share lane.
 *   play:  `?t=CODE` (also `#t=CODE`, the hash form never reaches the server logs)
 *   make:  `?make`, `#make` or a path ending in `/make`
 */

export const TRACK_PARAM = 't';

const CODE_RE = /^[A-Za-z0-9_-]{8,400}$/;

function hashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ''));
}

/** The track code carried by a URL, or null. Junk that is not base64url is ignored here (it fails decode later). */
export function readTrackCode(search: string, hash: string): string | null {
  const raw = new URLSearchParams(search).get(TRACK_PARAM) ?? hashParams(hash).get(TRACK_PARAM);
  if (raw == null) return null;
  const code = raw.trim();
  return code ? code : null;
}

export function looksLikeCode(code: string): boolean {
  return CODE_RE.test(code);
}

/** Pull a code out of whatever the player pasted: a full link, `t=CODE`, or the bare code. */
export function extractCode(pasted: string): string | null {
  const s = pasted.trim();
  if (!s) return null;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      return readTrackCode(u.search, u.hash);
    }
  } catch {
    /* not a URL */
  }
  const m = /(?:^|[?#&])t=([A-Za-z0-9_-]+)/.exec(s);
  if (m) return m[1];
  return looksLikeCode(s) ? s : null;
}

export function wantsEditor(search: string, hash: string, pathname: string): boolean {
  return new URLSearchParams(search).has('make') || hashParams(hash).has('make') || /\/make\/?$/.test(pathname);
}

/**
 * Page link that plays `code`: same origin and game path, only `?t=`. The route suffix is stripped (`/make`, `/t`, and
 * the dare `/r` and Daily Cup `/d/<n>` pages, whose link shells would show a ghost or Daily Cup preview).
 */
export function trackLink(code: string, loc: { origin: string; pathname: string }, cls?: number): string {
  const path = loc.pathname.replace(/\/index\.html$/, '/').replace(/\/(make|t|r|d\/\d{1,4})(\.html)?\/?$/, '') || '/';
  // the class the code's lap was driven at: the friend races that class (when unlocked), so the lap is a fair target
  const c = cls != null && Number.isInteger(cls) && cls >= 0 && cls <= 2 ? `&${CLASS_PARAM}=${cls}` : '';
  return `${loc.origin}${path}?${TRACK_PARAM}=${code}${c}`;
}

/** The query key for the class a link's lap was driven at (the shell's own `?cls=`, so the race starts there). */
export const CLASS_PARAM = 'cls';

/** The lap class a URL carries (`?cls=` or `#cls=`, 0–2), or null. */
export function readLapClass(search: string, hash: string): number | null {
  const raw = new URLSearchParams(search).get(CLASS_PARAM) ?? hashParams(hash).get(CLASS_PARAM);
  const n = raw == null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : null;
}

/** The lap class in whatever the player pasted (a full link), or null. */
export function extractLapClass(pasted: string): number | null {
  const s = pasted.trim();
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      return readLapClass(u.search, u.hash);
    }
  } catch {
    /* not a URL */
  }
  const m = /(?:^|[?#&])cls=(\d)/.exec(s);
  return m ? readLapClass(`?cls=${m[1]}`, '') : null;
}
