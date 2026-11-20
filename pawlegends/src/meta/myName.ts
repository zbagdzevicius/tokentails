/**
 * The name other players see (SOCIAL-RANKED.md §2.3): the nickname, a cat name or the generated name, as
 * `GET /pawlegends/name` last answered (through the host's `name.get`). Home, the match HUD and the results show it for
 * a signed-in player; it is kept on this device so a reload shows it at once, and re-read at most once a minute.
 */
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { noticeOf, type NameNotice } from '../ui/profile/name';

type Api = (op: ApiOp, args?: ApiArgs) => Promise<ApiResult>;

const KEY = 'pl.myName';
const REFRESH_MS = 60_000;
let name: string | null = null;
let loaded = false;
let lastRead = 0;
/** Nov 20: the assigned-name notice from the last `name.get` (shown once, then `name.seen`). */
let notice: NameNotice | null = null;

/** The pending assigned-name notice, or null. */
export const myNameNotice = (): NameNotice | null => notice;

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() && v.length <= 32 ? v.trim() : null);

/** The last known public name of the signed-in player, or null. */
export function myName(): string | null {
  if (!loaded) {
    loaded = true;
    try {
      name = clean(localStorage.getItem(KEY));
    } catch {
      name = null;
    }
  }
  return name;
}

/** Remember the public name (null forgets it: signed out). True when it changed. */
export function setMyName(v: unknown): boolean {
  const next = clean(v);
  const changed = next !== myName();
  name = next;
  try {
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: memory only
  }
  return changed;
}

/** Read the public name from the server (at most once a minute unless `force`). Resolves true when it changed. */
export async function refreshMyName(api: Api, force = false, nowMs = Date.now()): Promise<boolean> {
  if (!force && nowMs - lastRead < REFRESH_MS) return false;
  lastRead = nowMs;
  try {
    const r = await api('name.get');
    if (r.ok) notice = noticeOf(r.body);
    return r.ok ? setMyName((r.body as { name?: unknown } | undefined)?.name) : false;
  } catch {
    return false;
  }
}

/** The notice was shown: tell the server (it never shows again on any device). */
export function seenMyNameNotice(api: Api): void {
  if (!notice) return;
  notice = null;
  void api('name.seen').catch(() => undefined);
}

/** Tests only. */
export function resetMyName(): void {
  notice = null;
  name = null;
  loaded = false;
  lastRead = 0;
}
