/**
 * F-CHECKOUT: the buyer's X (Twitter) handle. Client mirror of the server's `normalizeXHandle`
 * (CHECKOUT-SPEC.md section 7). Only the bare handle is ever stored; the profile URL is built here
 * from a re-validated handle, never taken from input or from the API.
 */
import { isBlockedCatName } from '../../../shared/name';

export const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const X_URL_RE = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#\s]+)\/?(?:[?#].*)?$/i;
const INVISIBLE_RE = /[­᠎​-‏‪-‮⁠-⁤﻿]/g;
const RAW_LIMIT = 100;

/** X's own top-level pages: never a person. */
export const X_RESERVED: readonly string[] = Object.freeze([
  'home', 'i', 'intent', 'share', 'search', 'explore', 'settings', 'messages', 'notifications', 'compose',
  'login', 'logout', 'signup', 'tos', 'privacy', 'hashtag', 'account', 'about', 'download', 'jobs',
]);

export type XHandleCode = 'X_HANDLE_INVALID' | 'X_HANDLE_BLOCKED';
export type XHandleResult = { ok: true; handle: string | null } | { ok: false; code: XHandleCode; message: string };

export const X_HANDLE_MESSAGES: Readonly<Record<XHandleCode, string>> = Object.freeze({
  X_HANDLE_INVALID: 'Use @handle or an x.com profile link.',
  X_HANDLE_BLOCKED: 'Please use a different account.',
});

const fail = (code: XHandleCode): XHandleResult => ({ ok: false, code, message: X_HANDLE_MESSAGES[code] });

/**
 * '@someone', 'someone', 'x.com/someone', 'https://twitter.com/someone?s=21' → 'someone'.
 * Empty → `{ ok: true, handle: null }`. Other hosts, deeper paths (/someone/status/1), X's own
 * pages (home, settings, …), and anything outside [A-Za-z0-9_]{1,15} → X_HANDLE_INVALID.
 * A handle that trips the cat-name profanity check → X_HANDLE_BLOCKED (the DJ reads it out).
 */
export function normalizeXHandle(raw: unknown): XHandleResult {
  if (raw === null || raw === undefined) return { ok: true, handle: null };
  if (typeof raw !== 'string') return fail('X_HANDLE_INVALID');
  if (!raw.trim()) return { ok: true, handle: null };
  if (raw.length > RAW_LIMIT) return fail('X_HANDLE_INVALID');
  const s = raw.normalize('NFKC').replace(INVISIBLE_RE, '').trim();
  if (!s) return { ok: true, handle: null };
  let candidate: string;
  const url = X_URL_RE.exec(s);
  // Any other host or a deeper path keeps its '.', ':' or '/', so the handle check below refuses it.
  if (url) candidate = url[1];
  else candidate = s.startsWith('@') ? s.slice(1) : s;
  if (!X_HANDLE_RE.test(candidate)) return fail('X_HANDLE_INVALID');
  if (X_RESERVED.includes(candidate.toLowerCase())) return fail('X_HANDLE_INVALID');
  if (isBlockedCatName(candidate)) return fail('X_HANDLE_BLOCKED');
  return { ok: true, handle: candidate };
}

/** https://x.com/<handle> for a valid handle, else null. Never echoes input. */
export function xProfileUrl(handle: unknown): string | null {
  return typeof handle === 'string' && X_HANDLE_RE.test(handle) ? `https://x.com/${handle}` : null;
}

/**
 * An `<a>` to the profile: text `@handle`, new tab, `rel="noopener nofollow ugc"`. Null for an
 * invalid handle (render nothing rather than something unsafe).
 */
export function xLink(handle: unknown, doc: Document = document): HTMLAnchorElement | null {
  const href = xProfileUrl(handle);
  if (!href) return null;
  const a = doc.createElement('a');
  a.className = 'rvc-x-link';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener nofollow ugc';
  a.textContent = `@${handle as string}`;
  return a;
}
