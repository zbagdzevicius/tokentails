/**
 * The social data shapes and their pure helpers (SOCIAL-RANKED.md §14, friends panel Nov 20). They outlived the old
 * collapsible Friends sidebar: Home's friends panel (ui/home/friendsRail.ts), the add-friend sheet (friendsSheet.ts),
 * the DM host (dmHost.ts), the Player Card and the app share them. Pure and small: no DOM, no CSS.
 */
import type { ApiResult } from '../embed/api';
import type { AvatarView } from '../data/chatPhrases';
import { HEROES } from '../data/heroes';
import { spanText, type FriendRow, type Presence } from './presence';
export type { FriendRow, Presence } from './presence';

export interface PersonRow {
  code: string;
  name: string;
  av?: AvatarView;
  /** When the request was made (epoch ms; absent from an older backend). */
  at?: number;
}

export interface SocialState {
  me: {
    code: string;
    name: string;
    invisible: boolean;
    /** Away (LoL's status): friends see "Away" while this player is in the menus. */
    away?: boolean;
    /** My preset status note (an index into STATUS_NOTES), or null. */
    note?: number | null;
    allowRecent: boolean;
    ageBand: string | null;
    av?: AvatarView;
    dmPolicy?: 'friends' | 'off';
  };
  friends: FriendRow[];
  requests: { in: PersonRow[]; out: PersonRow[] };
  blocks: PersonRow[];
  invites: { id: string; from: { code: string; name: string }; party: string; mode?: 'ranked' }[];
  rev: string;
  /** CHAT-AVATARS §4: unread DMs. */
  chat?: { unread: number; top?: { thread: string; fromName: string; preview: string } };
  /** SPECTATE.md: a featured live match can be watched now. */
  live?: { featured?: boolean };
}

/** One DM thread as `chat.list` returns it. */
export interface ChatThreadRow {
  id: string;
  with: { code: string; name: string; av?: AvatarView };
  tier: 'text' | 'quick';
  lastPreview: string;
  lastMine: boolean;
  unread: number;
  muted: boolean;
}

/** "Teammate"/"Opponent" rows of one match, as `social.recent` sends them (newest match first). */
export interface RecentRow {
  room: string;
  slot: number;
  name: string;
  team: string;
  canAdd: boolean;
  av?: AvatarView;
  /** When the match started (epoch ms), its queue, my result, matches played together in the last 7 days. */
  at?: number;
  queue?: string;
  won?: boolean;
  together?: number;
  /** The champion this player played in that match. */
  hero?: string;
}

/** One nickname suggestion (`social.search`): never a code or an account id. */
export interface Suggestion {
  name: string;
  av?: AvatarView;
  cc?: string;
  /** Already a friend, a request sent, or one they sent. */
  rel?: 'friend' | 'sent' | 'asked';
}

/**
 * Preset status notes (LoL's status message, safe for every age: never free text). Index order is the wire format;
 * the backend's copy is STATUS_NOTE_COUNT in backend/src/pawlegends/social/social.contracts.ts (keep both in step).
 */
export const STATUS_NOTES: readonly string[] = Object.freeze([
  'Looking for a duo',
  'Up for Ranked',
  'Chill games only',
  'Learning a new champion',
  'Back in 10 minutes',
  'Grinding the pass',
  'Invite me!',
  'Just hanging out',
]);
export const noteText = (n: unknown): string => (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < STATUS_NOTES.length ? STATUS_NOTES[n] : '');

/** A champion's name from its id ("sage" → "Sage"); '' for an unknown id. Pure. */
export function champText(id: unknown): string {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(HEROES, id) ? ((HEROES as Record<string, { name?: string }>)[id]?.name ?? '') : '';
}

/** "2h ago", "3d ago", "Just now"; '' for a missing time. Pure. */
export function agoText(at: number | undefined, now = Date.now()): string {
  const t = spanText(at, now);
  return !t ? '' : t === 'now' ? 'Just now' : `${t} ago`;
}

/** "Played together 2d ago · 4 games" (the Player Card), from `played`; '' when we never played. Pure. */
export function playedText(p: FriendRow['played'], now = Date.now()): string {
  if (!p || typeof p.at !== 'number') return '';
  const ago = agoText(p.at, now);
  if (!ago) return '';
  return `Played together ${ago.toLowerCase()}${p.n > 1 ? ` · ${p.n} games` : ''}`;
}

/** The DM phrase "Ask to join" sends (chatPhrases.ts id 0: "Wanna play?"). */
export const ASK_PHRASE = 0;

/**
 * Invites queued for after a friend's match or queue (the Player Card's "Invite when their match ends"; LoL's in-game
 * invite). Kept for this session, dropped after LATER_MS.
 */
export const LATER = new Map<string, { name: string; at: number }>();
export const LATER_MS = 90 * 60_000;

/**
 * What to do with a queued invite now: wait while the friend is busy (queue or match), send it once they are free
 * (online or in a lobby) and I have a party, tell me when they are free and I have no party, drop it when they went
 * offline or it is too old. Pure.
 */
export function laterStep(p: Presence | undefined, queuedAt: number, inParty: boolean, now = Date.now()): 'wait' | 'send' | 'tell' | 'drop' {
  if (!p || now - queuedAt > LATER_MS) return 'drop';
  if (p.state === 'match' || p.state === 'queue') return 'wait';
  if (p.state === 'offline') return 'drop';
  return inParty ? 'send' : 'tell';
}

// Nov 20: only an explicit `PL-` code counts. Eight letters ("Whiskers", "Fuzz Ball") are a name first.
export const looksLikeCode = (v: string): boolean => /^\s*pl[-\s]?[0-9a-z]{4}[-\s]?[0-9a-z]{4}\s*$/i.test(v);

/** A social call's failure, in words. */
export function socialErrorText(r: ApiResult): string {
  const code = (r.body as { code?: string } | undefined)?.code ?? '';
  if (r.status === 0) return 'No connection. Try again.';
  if (r.status === 429) return 'Too many tries. Wait a minute.';
  if (code === 'PAWLEGENDS_SOCIAL_NOT_FOUND') return 'No player found.';
  if (code === 'PAWLEGENDS_SOCIAL_NO_NAME') return 'No player has this name.';
  if (code === 'PAWLEGENDS_SOCIAL_INVALID') return "Type a player's name.";
  if (code === 'PAWLEGENDS_SOCIAL_SELF') return "That's you.";
  if (code === 'PAWLEGENDS_SOCIAL_CAP') return 'Your friends list is full.';
  if (code === 'PAWLEGENDS_SOCIAL_REFUSED') return "You can't add this player.";
  if (code === 'PAWLEGENDS_SOCIAL_NO_PARTY') return "Your party isn't ready. Try again in a moment.";
  if (code === 'PAWLEGENDS_SOCIAL_LIMIT') return 'Invite already sent. Wait for an answer.';
  return 'Something went wrong. Try again.';
}

/** Keep only well-formed friend rows of a `social.get` answer (names are host data; the shapes are checked). */
export function friendRowsOf(list: unknown): FriendRow[] | null {
  if (!Array.isArray(list)) return null;
  return list.filter(
    (f): f is FriendRow =>
      !!f && typeof f === 'object' && typeof (f as { code?: unknown }).code === 'string' && typeof (f as { name?: unknown }).name === 'string' && !!(f as { presence?: unknown }).presence,
  );
}
