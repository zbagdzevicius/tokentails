/**
 * Friend presence (SOCIAL-RANKED.md §14.2, CHAT-AVATARS §6.1): the row types, their order, the status words and the
 * row's one action. Pure and small, so Home's friends rail (ui/home/friendsRail.ts) can use it without the social
 * sheet's chunk. The sheet re-exports everything here.
 */
import type { AvatarView } from '../data/chatPhrases';
export interface Presence {
  state: 'offline' | 'online' | 'party' | 'queue' | 'match';
  joinable?: boolean;
  party?: string;
  /** SPECTATE.md: a watchable live match (absent when the friend keeps matches private, or an older backend). */
  room?: string;
  /**
   * Optional detail (LoL's "In Game · Ranked 12m"), shown when the backend sends it; an older backend leaves it out and
   * the line shows the state alone: the mode of the queue or match, when the state began (epoch ms), the lobby's
   * size and seats, and when an offline friend was last seen (epoch ms).
   */
  mode?: string;
  since?: number;
  size?: number;
  max?: number;
  seen?: number;
  /** Online in the menus but set Away (LoL's status); the backend never sends it with a lobby, queue or match. */
  away?: boolean;
  /** In a match: the champion played (a hero id; round 6, LoL's "In Game · Sage"). */
  hero?: string;
  /** Round 8: on a phone or tablet (a small phone mark by the name, LoL's mobile marker); absent on a computer. */
  dev?: 'm';
}
export interface FriendRow {
  code: string;
  name: string;
  presence: Presence;
  /** Pinned by this player (the Favourites group at the top); friends never see it. */
  fav?: boolean;
  /** The friend's preset status note (an index into STATUS_NOTES), while they are not offline. */
  note?: number;
  /** CHAT-AVATARS §7.3: the friend's avatar (absent from an older backend). */
  av?: AvatarView;
  /** FLAGS.md: the friend's country flag (absent: hidden, unknown or an older backend). */
  cc?: string;
  /** Round 6: when we last played together (epoch ms) and how often in the last 30 days (absent: never). */
  played?: { at: number; n: number };
  /** Home friends panel (Nov 20): the ranked tier index 0..12 when placed this season (absent: unranked or placing). */
  rk?: number;
}

/**
 * Friends order (CHAT-AVATARS §6.1): a joinable party first, then in a party, in a queue, online, in a match, offline;
 * names A–Z inside a group. Pure.
 */
export function friendOrder(list: readonly FriendRow[]): FriendRow[] {
  const rank = (p: Presence) => (p.state === 'party' && p.joinable ? 0 : ({ party: 1, queue: 2, online: 3, away: 3.5, match: 4, offline: 5 } as const)[shownState(p)]);
  return [...list].sort((a, b) => rank(a.presence) - rank(b.presence) || a.name.localeCompare(b.name));
}

/** The state a row shows: Away is "online" with the away flag (a lobby, queue or match always wins). Pure. */
export type ShownState = Presence['state'] | 'away';
export const shownState = (p: Presence): ShownState => (p.state === 'online' && p.away ? 'away' : p.state);

export const PRESENCE_TEXT: Readonly<Record<ShownState, string>> = Object.freeze({
  offline: 'Offline',
  online: 'Online',
  away: 'Away',
  // SOCIAL-INVITES.md: LoL's words (a friend in a party is in its lobby)
  party: 'In lobby',
  queue: 'In queue',
  match: 'In match',
});

export const ROOM = /^[a-z0-9]{12}$/;

const MODE_TEXT: Readonly<Record<string, string>> = Object.freeze({ ranked: 'Ranked', casual: 'Casual', pvp: 'Casual', classic: '5v5 Classic', bots: 'Vs bots', practice: 'Practice', custom: 'Custom' });

/** "12m", "3h", "2d": a short span from `at` to `now` (epoch ms); '' for a missing or future time. Pure. */
export function spanText(at: number | undefined, now: number): string {
  if (typeof at !== 'number' || !Number.isFinite(at) || at > now + 60_000) return '';
  const m = Math.max(0, Math.floor((now - at) / 60_000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/**
 * The status line (LoL style): the presence word, then what helps you decide: the mode and time in a queue or match
 * ("In match · Ranked · 12m"), the lobby's seats and whether it is open ("In lobby · 2/3 · open"), how long ago an
 * offline friend was seen ("Offline · 2d"). Detail the backend did not send is left out. Pure.
 */
export function presenceText(p: Presence, now = Date.now()): string {
  const parts: string[] = [PRESENCE_TEXT[shownState(p)]];
  const mode = typeof p.mode === 'string' ? MODE_TEXT[p.mode] : undefined;
  if (p.state === 'party') {
    if (typeof p.size === 'number' && typeof p.max === 'number' && p.size > 0 && p.max >= p.size && p.max <= 10) parts.push(`${p.size}/${p.max}`);
    if (p.joinable && p.party) parts.push('open');
  } else if (p.state === 'queue' || p.state === 'match') {
    if (mode) parts.push(mode);
    const t = spanText(p.since, now);
    if (t && t !== 'now') parts.push(t);
  } else if (p.state === 'offline') {
    const t = spanText(p.seen, now);
    if (t && t !== 'now') parts.push(t);
  }
  return parts.join(' · ');
}

/**
 * The friend row's one action (§14.2, SOCIAL-INVITES.md, LoL greys invite out for busy friends): Join a friend's
 * joinable lobby, Watch a friend's live match (SPECTATE.md), Invite a friend who is free (online; from your own party
 * an offline friend too: they get a notification). A friend in a queue, in a match without Watch, or in another lobby
 * that is not open has no quick action: the menu says why (`busyText`). `myParty`: this player's party code, or null.
 * Pure.
 */
export function rowAction(p: Presence, inParty: boolean, myParty: string | null = null): 'join' | 'watch' | 'invite' | 'ask' | 'more' {
  if (inParty) {
    if (myParty && p.party === myParty) return 'more';
    // SPECTATE.md: no Watch from a party (watching would leave it). Nov 19: a friend in another lobby can be invited
    // too (LoL): their card asks "Leave your party and join …?"
    return p.state === 'online' || p.state === 'offline' || p.state === 'party' ? 'invite' : 'more';
  }
  if (p.state === 'party' && p.joinable && p.party) return 'join';
  // a lobby that is not open: ask to join (a "Wanna play?" in their DM), LoL's "Ask to join"
  if (p.state === 'party') return 'ask';
  if (p.state === 'match' && p.room && ROOM.test(p.room)) return 'watch';
  return p.state === 'online' ? 'invite' : 'more';
}
