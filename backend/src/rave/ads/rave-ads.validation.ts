import { isBlockedCatName } from 'src/shared-contracts/name';

/*
 * Ad text fields. The page mirrors these rules in cat-rave/src/ads/form.ts for inline messages only; the
 * server is authoritative. Everything is rendered as text (textContent / canvas), never as HTML, and the
 * destination is opened with rel="noopener nofollow sponsored".
 */

export const RAVE_AD_NAME_MIN = 2;
export const RAVE_AD_NAME_MAX = 32;
export const RAVE_AD_URL_MAX = 300;

export type AdUrlResult = { ok: true; url: string } | { ok: false; code: 'URL_INVALID' | 'URL_NOT_HTTPS' };
export type AdNameResult =
    | { ok: true; name: string }
    | { ok: false; code: 'NAME_LENGTH' | 'NAME_CHARS' | 'NAME_BLOCKED' };

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
// Letters, digits, spaces and a little punctuation. No `<`, `>`, quotes, slashes or `@`.
const NAME_CHARS_RE = /^[\p{L}\p{N} &.,'!+\-_:]+$/u;
const LETTER_OR_DIGIT_RE = /[\p{L}\p{N}]/u;
const URLISH_RE = /(:\/\/|www\.|\.(com|net|org|io|xyz|app|gg|co|me|ly|link|site|online|shop)\b)/i;

/** https only, no credentials, a public DNS name (no IP, no localhost), at most 300 characters. */
export function normalizeAdUrl(input: unknown): AdUrlResult {
    if (typeof input !== 'string') return { ok: false, code: 'URL_INVALID' };
    const raw = input.trim();
    if (!raw || raw.length > RAVE_AD_URL_MAX || /[\s<>"'`\\]/.test(raw)) return { ok: false, code: 'URL_INVALID' };
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { ok: false, code: /^[a-z][a-z0-9+.-]*:/i.test(raw) ? 'URL_NOT_HTTPS' : 'URL_INVALID' };
    }
    if (url.protocol !== 'https:') return { ok: false, code: 'URL_NOT_HTTPS' };
    if (url.username || url.password || url.port) return { ok: false, code: 'URL_INVALID' };
    const host = url.hostname.toLowerCase();
    if (IPV4_RE.test(host) || host.startsWith('[') || !HOST_RE.test(host) || /(^|\.)localhost$/.test(host)) {
        return { ok: false, code: 'URL_INVALID' };
    }
    const href = url.href;
    if (href.length > RAVE_AD_URL_MAX) return { ok: false, code: 'URL_INVALID' };
    return { ok: true, url: href };
}

/** The sponsor's display name: 2–32 characters, no URLs, no blocked words. Spaces are collapsed. */
export function normalizeAdName(input: unknown): AdNameResult {
    if (typeof input !== 'string') return { ok: false, code: 'NAME_LENGTH' };
    const name = input.normalize('NFC').replace(/\s+/g, ' ').trim();
    const length = [...name].length;
    if (length < RAVE_AD_NAME_MIN || length > RAVE_AD_NAME_MAX) return { ok: false, code: 'NAME_LENGTH' };
    if (!NAME_CHARS_RE.test(name) || !LETTER_OR_DIGIT_RE.test(name) || URLISH_RE.test(name)) {
        return { ok: false, code: 'NAME_CHARS' };
    }
    const words = name.split(/[\s&.,'!+\-_:]+/).filter(Boolean);
    if (isBlockedCatName(name) || words.some(w => isBlockedCatName(w))) return { ok: false, code: 'NAME_BLOCKED' };
    return { ok: true, name };
}
