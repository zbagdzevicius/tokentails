/**
 * The 7-day Welcome Path (gap plan P2, GAPS.md N11): a gift on each of a new player's first seven days of play. The
 * server counts the days (a UTC day with a verified match, inside the `/live` save) and pays each gift as a grant
 * (meta/lucky.ts `Grant`, kind 'welcome'); this file mirrors the path for display and parses the server's view. Never
 * resets for a missed day, never expires, never an offer (so nothing here is ever a reason to show one in session 1).
 */
import { treatReward } from './treats';

export interface WelcomeGift {
  day: number;
  item?: string;
  xp: number;
}

export const WELCOME_DAYS = 7;

/** The backend's WELCOME_PATH (backend/src/pawlegends/progress/welcome.ts). */
export const WELCOME_PATH: readonly WelcomeGift[] = Object.freeze([
  { day: 1, xp: 100 },
  { day: 2, item: 'emote.wave', xp: 150 },
  { day: 3, xp: 200 },
  { day: 4, item: 'coat.clem.lilac', xp: 200 },
  { day: 5, xp: 250 },
  { day: 6, item: 'frame.champ.lambo', xp: 250 },
  { day: 7, item: 'coat.sage.fern', xp: 300 },
]);

export interface WelcomeState {
  /** Days of play counted (0..7). */
  days: number;
  /** Today (UTC) already counted. */
  today: boolean;
}

export function parseWelcome(raw: unknown): WelcomeState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const days = typeof o.days === 'number' && Number.isFinite(o.days) ? Math.max(0, Math.min(WELCOME_DAYS, Math.floor(o.days))) : 0;
  return { days, today: o.today === true };
}

/** A gift's short label ("Wave emote", "+150 Treat XP"). Pure. */
export function giftLabel(g: Pick<WelcomeGift, 'item' | 'xp'>): string {
  const r = g.item ? treatReward(g.item) : null;
  return r ? r.name : `+${g.xp} Treat XP`;
}

/** The path is shown while it runs (days 0..6 claimed) and for the day it finished. Pure. */
export function welcomeVisible(s: WelcomeState | null): boolean {
  return !!s && (s.days < WELCOME_DAYS || s.today);
}
