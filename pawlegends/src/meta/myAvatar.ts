/**
 * My avatar, one source of truth (founder Nov 19: "avatar on left should be the same as right one, they must be in
 * sync"). The server's avatar view (`me.av` of `social.get` / `social.me`: the icon, the border and the title picked in
 * Profile) is what Home's profile chip, the Profile screen, the friends list and chat all draw. Every answer that
 * carries `me.av` updates it (`observeMyAvatar`, wired on the app's one api path), so a change in Profile shows on
 * Home at once. Kept on this device so a reload draws it before the server answers; null for a guest.
 */
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { isAvatarView, type AvatarView } from '../data/avatarView';

type Api = (op: ApiOp, args?: ApiArgs) => Promise<ApiResult>;

const KEY = 'pl.myAv.v1';
const REFRESH_MS = 5 * 60_000;
let av: AvatarView | null = null;
let loaded = false;
let lastRead = 0;
const subs = new Set<(v: AvatarView | null) => void>();

const same = (a: AvatarView | null, b: AvatarView | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The last known avatar view of the signed-in player, or null (a guest, or never answered). */
export function myAvatar(): AvatarView | null {
  if (!loaded) {
    loaded = true;
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
      av = isAvatarView(v) ? v : null;
    } catch {
      av = null;
    }
  }
  return av;
}

/** Remember my avatar view (null forgets it: signed out). Listeners hear a change. True when it changed. */
export function setMyAvatar(v: unknown): boolean {
  const next = isAvatarView(v) ? { ...v } : null;
  if (same(next, myAvatar())) return false;
  av = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: memory only
  }
  for (const f of [...subs]) {
    try {
      f(next);
    } catch {
      // a listener's bug never stops the others
    }
  }
  return true;
}

/** Hear every change of my avatar view; returns the unsubscribe. */
export function onMyAvatar(f: (v: AvatarView | null) => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

/** An api answer that carries my avatar (`social.get`, `social.me`): remember it. Never throws. */
export function observeMyAvatar(op: ApiOp, r: ApiResult | null | undefined): void {
  if (op !== 'social.get' && op !== 'social.me') return;
  if (!r?.ok || !r.body || typeof r.body !== 'object') return;
  const me = (r.body as { me?: { av?: unknown } }).me;
  if (me && isAvatarView(me.av)) setMyAvatar(me.av);
}

/** Read my avatar from the server (at most every 5 minutes unless `force`). Resolves true when it changed. */
export async function refreshMyAvatar(api: Api, force = false, nowMs = Date.now()): Promise<boolean> {
  if (!force && nowMs - lastRead < REFRESH_MS && myAvatar()) return false;
  lastRead = nowMs;
  try {
    const r = await api('social.get');
    const before = myAvatar();
    observeMyAvatar('social.get', r);
    return !same(before, myAvatar());
  } catch {
    return false;
  }
}

/** Tests only. */
export function resetMyAvatar(): void {
  av = null;
  loaded = false;
  lastRead = 0;
  subs.clear();
}
