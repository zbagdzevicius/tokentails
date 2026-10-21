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
export function trackLink(code: string, loc: { origin: string; pathname: string }): string {
  const path = loc.pathname.replace(/\/index\.html$/, '/').replace(/\/(make|t|r|d\/\d{1,4})(\.html)?\/?$/, '') || '/';
  return `${loc.origin}${path}?${TRACK_PARAM}=${code}`;
}
