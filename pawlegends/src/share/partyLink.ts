/**
 * Party links (docs/plans/moba/MULTIPLAYER.md §5.3, DEEP-LINKS.md): `?party=K7QX2M` opens the party chunk straight into
 * "Joining…"; the app gets `https://pawlegends.app/p/K7QX2M` from the shell (`partyFromLink`, src/app/links.ts).
 * Every invite URL is the embed URL (D12) so a friend lands where a guest ticket exists. First-load code: tiny, no
 * imports from the party chunk.
 */
const CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/** The party code in the page URL (`?party=`, case-folded), or null. */
export function partyFromUrl(search: string = typeof location !== 'undefined' ? location.search : ''): string | null {
  try {
    const raw = new URLSearchParams(search).get('party');
    const c = raw ? raw.toUpperCase().replace(/[\s-]/g, '') : '';
    return CODE.test(c) ? c : null;
  } catch {
    return null;
  }
}

/**
 * SPECTATE.md §1: `?watch=<room>` (a room id a friend's Watch carries, 12 characters base36) or `?watch=featured`
 * opens the live spectate view; anything else is ignored. Pure.
 */
export function watchFromUrl(search: string = typeof location !== 'undefined' ? location.search : ''): { room: string; name: string } | { featured: true } | null {
  try {
    const raw = new URLSearchParams(search).get('watch') ?? '';
    if (raw === 'featured') return { featured: true };
    return /^[a-z0-9]{12}$/.test(raw) ? { room: raw, name: '' } : null;
  } catch {
    return null;
  }
}

/**
 * The invite link for a code (DEEP-LINKS.md): `https://pawlegends.app/p/K7QX2M`, short so the lobby QR stays coarse.
 * A phone with the app opens the app straight into the party (iOS Universal Links, Android App Links); without it,
 * the page `/p/<code>` on Paw Legends' own site joins in the web game (D12). The older `/?party=` links keep working.
 */
export const inviteUrl = (code: string): string => `https://pawlegends.app/p/${code}`;

/** Hosts whose links name a party: Paw Legends' own site (the only domain the app claims). */
const LINK_HOSTS: ReadonlySet<string> = new Set(['pawlegends.app', 'www.pawlegends.app']);

/** What a link the app was opened with asks for: a party to join, a party link whose code is broken, or nothing. */
export type PartyLink = { code: string } | { bad: true } | null;

/**
 * The party of a link the native app was opened with (DEEP-LINKS.md): `https://pawlegends.app/p/K7QX2M` (any case,
 * dashes and spaces ignored, a trailing slash allowed) and the older `?party=` links. `{ bad: true }` for a party link
 * whose code cannot be one (the game says so instead of doing nothing); null for any other URL. Pure, never throws.
 */
export function partyFromLink(raw: unknown): PartyLink {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !LINK_HOSTS.has(u.hostname.toLowerCase())) return null;
  const m = /^\/p\/([^/]*)\/?$/i.exec(u.pathname);
  if (m) {
    let seg = m[1];
    try {
      seg = decodeURIComponent(seg);
    } catch {
      return { bad: true };
    }
    const c = seg.toUpperCase().replace(/[\s-]/g, '');
    return CODE.test(c) ? { code: c } : { bad: true };
  }
  if (!u.searchParams.has('party')) return null;
  return asLink(partyFromUrl(u.search));
}

const asLink = (code: string | null): PartyLink => (code ? { code } : { bad: true });

/** Backend origin per page host (as Bad Cat does): the hosted game on tokentails.com and pawlegends.app talks to the production API. */
const API_BY_HOST: Readonly<Record<string, string>> = Object.freeze({
  'tokentails.com': 'https://api.tokentails.com',
  'www.tokentails.com': 'https://api.tokentails.com',
  // Paw Legends' own domain serves the same pages (client/next.config.js host rewrites)
  'pawlegends.app': 'https://api.tokentails.com',
  'www.pawlegends.app': 'https://api.tokentails.com',
});

/**
 * The relay's origin: VITE_PAWLEGENDS_API (build time, https; http only for localhost), else the host default, else
 * null (no party play: the button stays hidden). Never from the page URL: a link must not point the game at another
 * relay (it would receive the ticket).
 */
export function partyApi(raw: unknown = import.meta.env?.VITE_PAWLEGENDS_API, host: string = typeof location !== 'undefined' ? location.host : ''): string | null {
  if (typeof raw === 'string' && raw) {
    try {
      const u = new URL(raw);
      const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return u.origin;
    } catch {
      /* invalid */
    }
  }
  return API_BY_HOST[host.toLowerCase()] ?? null;
}
