/**
 * Party links (docs/plans/moba/MULTIPLAYER.md §5.3): `?party=K7QX2M` opens the party chunk straight into "Joining…".
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

/** The invite link for a code: always the Token Tails page that embeds the game (D12). */
export const inviteUrl = (code: string): string => `https://tokentails.com/pawlegends?party=${code}`;

/** Backend origin per page host (as Bad Cat does): the hosted game on tokentails.com talks to the production API. */
const API_BY_HOST: Readonly<Record<string, string>> = Object.freeze({
  'tokentails.com': 'https://api.tokentails.com',
  'www.tokentails.com': 'https://api.tokentails.com',
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
