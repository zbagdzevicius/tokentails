/**
 * Nicknames (SOCIAL-RANKED.md §2.3): the quick client check, the price line and the refusal text for the Profile
 * screen's name change. The server's shared/name.ts check, price and cooldown are the real ones. Pure.
 */
import type { ApiResult } from '../../embed/api';

export interface NameInfo {
  name: string;
  nick: string | null;
  changes: number;
  free: boolean;
  price: number;
  cost: number;
  cooldownDays: number;
  nextAt: number | null;
  yarn: number;
}

export const NAME_MIN = 2;
export const NAME_MAX = 16;
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ0-9' -]+$/;

/** The quick client check: an error line or null. Pure. */
export function nameProblem(raw: string): string | null {
  const v = raw.trim().replace(/\s+/g, ' ');
  if (v.length < NAME_MIN) return `Use at least ${NAME_MIN} characters.`;
  if (v.length > NAME_MAX) return `Use at most ${NAME_MAX} characters.`;
  if (!NAME_RE.test(v)) return 'Use letters, numbers, spaces, apostrophes or hyphens.';
  return null;
}

export const yarnText = (n: number): string => `${Math.max(0, Math.floor(n)).toLocaleString('en-US')} Yarn`;

/** Days until `at` (at least 1 while it is in the future). Pure. */
export const daysLeft = (at: number, now: number): number => Math.max(1, Math.ceil((at - now) / 86_400_000));

/** What the next change costs, as one line. Pure. */
export function priceLine(i: NameInfo, now: number): string {
  if (i.free) return i.changes === 0 ? 'First change free' : 'Your next change is free';
  if (i.nextAt && i.nextAt > now) {
    const d = daysLeft(i.nextAt, now);
    return `Next change in ${d} ${d === 1 ? 'day' : 'days'}`;
  }
  return `Change: ${yarnText(i.price)} · you have ${yarnText(i.yarn)}`;
}

/** The player-facing line for a refused change. Pure. */
export function nameErrorText(r: ApiResult, info: NameInfo | null, now: number): string {
  const b = (r.body ?? {}) as { code?: string; message?: string; nextAt?: number };
  if (r.status === 0) return 'No connection. Try again.';
  switch (b.code) {
    case 'PAWLEGENDS_NAME_TAKEN':
      return 'That name is taken. Try another one.';
    case 'PAWLEGENDS_NAME_INVALID':
      return typeof b.message === 'string' && b.message.length < 80 ? b.message : 'That name is not allowed.';
    case 'PAWLEGENDS_NAME_SAME':
      return 'That is already your name.';
    case 'PAWLEGENDS_NAME_YARN':
      return info ? `Not enough Yarn: you need ${yarnText(info.cost)}, you have ${yarnText(info.yarn)}.` : 'Not enough Yarn.';
    case 'PAWLEGENDS_NAME_COOLDOWN': {
      const d = typeof b.nextAt === 'number' ? daysLeft(b.nextAt, now) : 7;
      return `You can change your name again in ${d} ${d === 1 ? 'day' : 'days'}.`;
    }
    case 'PAWLEGENDS_NEED_ACCOUNT':
      return 'Sign in to choose your name.';
    case 'PAWLEGENDS_NAME_BUSY':
    case 'PAWLEGENDS_NAME_CHANGED':
      return 'Your name just changed. Try again.';
  }
  if (r.status === 429) return 'Too many tries. Wait a minute.';
  return 'Something went wrong. Try again.';
}
