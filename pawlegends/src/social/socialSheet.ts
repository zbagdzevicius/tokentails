/**
 * The Social sheet (docs/plans/moba/SOCIAL-RANKED.md §14.2–§14.4, social sidebar redesign Nov 18): a right-side panel
 * over the lobby's 3D half, built like a game client's friends list (League of Legends' social panel is the bar).
 *
 * - One header row: the title, my status (a small dot button: Online, Away or Appear offline, a status note, my friend
 *   code), the invite gift, Add a friend, Close. Founder Nov 19: no self card (my own name and "Online" told me nothing),
 *   no avatar picker (the avatar is changed in Profile only), no Recent tab, no Compact list, no leaderboards (Boards
 *   on Home opens them in their own window). Under the header one tab bar: Friends, Clubs, More (Ranked, Watch a live
 *   match) and Search. No number on the Friends tab (its groups and rows carry the counts); a dot while another tab is
 *   open and something waits. Arrows move between tabs; Esc closes the top layer.
 * - Friends: Search opens a field under the tabs; Add opens a card over the top of the list (a name or a friend code,
 *   with nickname suggestions; the list stays under it); the gift opens the invite card there (a new player sees it in
 *   the empty state, the only share button). Then collapsible groups with counts: Requests, Online, In match, Offline,
 *   Sent, with opaque sticky headers. The list scrolls (one scroll region) instead of the old 3-to-5-row pages.
 * - A friend row: avatar with a presence ring and dot, the full name (ellipsis only when it cannot fit; the title and
 *   the row menu show it whole), the flag, and a status line that never disappears (an unread message is added after
 *   it). Quick actions are small icon buttons: with a mouse they show on hover and keyboard focus; on touch only a
 *   time-sensitive one shows (Join, Watch; Chat when unread), Invite and Ask sit in the row's sheet. Tapping the row,
 *   right-click or a long press opens its menu (a floating context menu with a mouse, a bottom sheet on touch):
 *   Message, Match history, Remove (tap twice) and Block (5 s Undo).
 * - Round 7: Enter on a row opens the DM with focus in its composer (Esc closes the DM only); a request's Tab stop is
 *   the person, never Accept.
 *
 * Names are always set with `textContent`. Every call goes through the host (`api-request`); the game never sees a
 * token, an account id or a URL. Polling: one pulse every 30 s while the sheet or the title is shown and the tab is
 * visible; never in a match.
 */
import { rememberAgeBand } from './ageBand';
import { ccHtmlOrNone } from './flags';
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { pulseDevice } from '../embed/api';
import { parseRankedStatus, primeTimeText, rankedLabel, rankedLiveText } from '../meta/ranked';
import { HEROES } from '../data/heroes';
import { isAvatarView, previewText, type AvatarView } from '../data/chatPhrases';
import { avatarHtml } from '../ui/avatar';
import { ChatSheet, type ChatTab } from './chatSheet';
import { InviteRow } from '../share/invite';
import { ClubsPanel } from './clubs/clubsPanel';
import { buildSim } from './inviteInbox';
import { icon } from './socialIcons';
import { sheetDevice } from './sheetDevice';
import './socialSheet.css';

export type SocialTab = 'friends' | 'requests' | 'clubs' | 'ranked';
export const SOCIAL_TABS: readonly SocialTab[] = Object.freeze(['friends', 'requests', 'clubs', 'ranked']);
/** The tabs in the header; Requests is a group at the top of Friends (LoL style), Ranked sits under More. */
export const MAIN_TABS = Object.freeze(['friends', 'clubs'] as const);
export const MORE_TABS = Object.freeze(['ranked'] as const);
const TAB_LABEL: Readonly<Record<SocialTab, string>> = Object.freeze({
  friends: 'Friends',
  requests: 'Requests',
  clubs: 'Clubs',
  ranked: 'Ranked',
});

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
}
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
    avatar?: { kind: string; hero?: string; catId?: string; icon?: string } | null;
    frame?: string | null;
    title?: string | null;
    dmPolicy?: 'friends' | 'off';
  };
  friends: FriendRow[];
  requests: { in: PersonRow[]; out: PersonRow[] };
  blocks: PersonRow[];
  invites: { id: string; from: { code: string; name: string }; party: string; mode?: 'ranked' }[];
  rev: string;
  /** CHAT-AVATARS §4: unread DMs (the Friends tab and the landing badge). */
  chat?: { unread: number; top?: { thread: string; fromName: string; preview: string } };
  /** SPECTATE.md: a featured live match can be watched now (the Friends tab's "Watch live" strip). */
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

/**
 * The friend groups (LoL style): Favourites (pinned, any state), Online (online, away, in a lobby or a queue), In
 * match, Offline; each in friendOrder. A favourite shows once, in Favourites. Pure.
 */
export type FriendGroupId = 'requests' | 'fav' | 'online' | 'match' | 'offline' | 'sent';
export function friendGroups(list: readonly FriendRow[]): { id: 'fav' | 'online' | 'match' | 'offline'; rows: FriendRow[] }[] {
  const sorted = friendOrder(list);
  const rest = sorted.filter((f) => !f.fav);
  return [
    { id: 'fav' as const, rows: sorted.filter((f) => f.fav) },
    { id: 'online' as const, rows: rest.filter((f) => f.presence.state === 'online' || f.presence.state === 'party' || f.presence.state === 'queue') },
    { id: 'match' as const, rows: rest.filter((f) => f.presence.state === 'match') },
    { id: 'offline' as const, rows: rest.filter((f) => f.presence.state === 'offline') },
  ];
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

/**
 * Is a group folded? Friend requests never fold (LoL keeps them open at the top: someone is waiting for an answer).
 * Otherwise the player's own choice wins; by default Sent is folded and Offline folds once friends are online and more
 * than 6 are offline. Pure.
 */
export function groupFolded(id: FriendGroupId, choice: boolean | undefined, counts: { on: number; off: number }): boolean {
  if (id === 'requests') return false;
  if (typeof choice === 'boolean') return choice;
  if (id === 'sent') return true;
  if (id === 'offline') return counts.on > 0 && counts.off > 6;
  return false;
}

/** A short screen (a phone held sideways): the invite card and my own row fold into the tools row. */
export const SHORT_PX = 500;
/** A wide screen: a DM thread docks beside the list instead of covering it. */
export const DOCK_MIN_PX = 1100;
/** Open conversations kept as tabs on the thread (LoL stacks its chat windows). */
export const MAX_CONVOS = 5;

/** Under this many friends the list ends with a short "find or invite" line (it fills the empty panel). */
const GROW_UNDER = 4;

/** Rows a page shows at a viewport height (§14.2 hide ladder; the Clubs panel still pages by it). Pure. */
export function rowsForHeight(h: number): number {
  if (h <= 300) return 3;
  if (h <= 340) return 4;
  return 5;
}

/** One page of a list and the page count (at least 1). Pure. */
export function pageOf<T>(list: readonly T[], page: number, per: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(list.length / per));
  const p = Math.max(0, Math.min(pages - 1, page));
  return { rows: list.slice(p * per, p * per + per), page: p, pages };
}

export const PRESENCE_TEXT: Readonly<Record<ShownState, string>> = Object.freeze({
  offline: 'Offline',
  online: 'Online',
  away: 'Away',
  // SOCIAL-INVITES.md: LoL's words (a friend in a party is in its lobby)
  party: 'In lobby',
  queue: 'In queue',
  match: 'In match',
});

const ROOM = /^[a-z0-9]{12}$/;

const MODE_TEXT: Readonly<Record<string, string>> = Object.freeze({ ranked: 'Ranked', casual: 'Casual', pvp: 'Casual', classic: '5v5 Classic', bots: 'Vs bots', practice: 'Practice', custom: 'Custom' });

/** A champion's name from its id ("sage" → "Sage"); '' for an unknown id (a newer champion than this build). Pure. */
export function champText(id: unknown): string {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(HEROES, id) ? ((HEROES as Record<string, { name?: string }>)[id]?.name ?? '') : '';
}

/** "Played together 2d ago · 4 games" (the row menu), from `played`; '' when we never played. Pure. */
export function playedText(p: FriendRow['played'], now = Date.now()): string {
  if (!p || typeof p.at !== 'number') return '';
  const ago = agoText(p.at, now);
  if (!ago) return '';
  return `Played together ${ago.toLowerCase()}${p.n > 1 ? ` · ${p.n} games` : ''}`;
}

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

/** The DM phrase "Ask to join" sends (chatPhrases.ts id 0: "Wanna play?"). */
export const ASK_PHRASE = 0;

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
  /** The champion this player played in that match (round 6). */
  hero?: string;
}

const QUEUE_TEXT: Readonly<Record<string, string>> = Object.freeze({ coop: 'Vs bots', casual: 'Casual', classic: '5v5 Classic', ranked: 'Ranked' });

/** Recent players grouped by match, newest first, each match's header ("Casual · Victory · 2h ago"). Pure. */
export function recentMatches(rows: readonly RecentRow[], now = Date.now()): { room: string; title: string; won?: boolean; rows: RecentRow[] }[] {
  const out: { room: string; title: string; won?: boolean; rows: RecentRow[] }[] = [];
  for (const r of rows) {
    let g = out.find((x) => x.room === r.room);
    if (!g) {
      const ago = agoText(r.at, now);
      const title = [QUEUE_TEXT[r.queue ?? ''] ?? 'Match', r.won === true ? 'Victory' : r.won === false ? 'Defeat' : '', ago].filter(Boolean).join(' · ');
      g = { room: r.room, title, ...(typeof r.won === 'boolean' ? { won: r.won } : {}), rows: [] };
      out.push(g);
    }
    g.rows.push(r);
  }
  return out;
}

/** "2h ago", "3d ago", "Just now"; '' for a missing time. Pure. */
export function agoText(at: number | undefined, now = Date.now()): string {
  const t = spanText(at, now);
  return !t ? '' : t === 'now' ? 'Just now' : `${t} ago`;
}

/**
 * Invites queued for after a friend's match or queue (LoL lets you invite a friend in game: it arrives when they are
 * back). Kept for this session (module scope: the sheet can close and open again), dropped after LATER_MS.
 */
export const LATER = new Map<string, { name: string; at: number }>();
export const LATER_MS = 90 * 60_000;

/**
 * What to do with a queued invite now (round 6): wait while the friend is busy (queue or match), send it once they are
 * free (online or in a lobby) and I have a party, tell me when they are free and I have no party, drop it when they
 * went offline or it is too old. Pure.
 */
export function laterStep(p: Presence | undefined, queuedAt: number, inParty: boolean, now = Date.now()): 'wait' | 'send' | 'tell' | 'drop' {
  if (!p || now - queuedAt > LATER_MS) return 'drop';
  if (p.state === 'match' || p.state === 'queue') return 'wait';
  if (p.state === 'offline') return 'drop';
  return inParty ? 'send' : 'tell';
}

/** Why a friend can't be invited now (the row menu shows Invite greyed with this), or '' when they can. Pure. */
export function busyText(p: Presence, myParty: string | null = null): string {
  if (myParty && p.party === myParty) return 'Already in your party';
  if (p.state === 'queue') return 'In a queue: invite after it';
  if (p.state === 'match') return 'In a match: invite after it';
  if (p.state === 'party') return 'In another lobby';
  return '';
}

/** A typed friend code (`PL-7KQ2-M9XR`, any case, with or without dashes); anything else is a nickname. */
/** The list's last child: a bar stuck to its bottom edge naming the groups below the fold (`moreBelow`). */
const MORE_BELOW = '<button type="button" class="pl-more-below" data-a="more-below" data-testid="social-more-below" hidden></button>';

/** The one separator of a status line ("In match · Ranked · 8m · Sage"): the same gap on both sides everywhere. */
// the spaces keep the text readable when copied or read aloud ("In match · Ranked"); they take no room (CSS)
export const SEP_HTML = '<span class="pl-sep"><i class="pl-sp"> </i>·<i class="pl-sp"> </i></span>';

/** Escape a " · "-joined line and draw each separator as `SEP_HTML`. */
export function dotsHtml(text: string): string {
  return text
    .split(' · ')
    .map((p) => p.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`))
    .join(SEP_HTML);
}

export const looksLikeCode = (v: string): boolean => /^\s*(pl[-\s]?)?[0-9a-z]{4}[-\s]?[0-9a-z]{4}\s*$/i.test(v);

/** One nickname suggestion (`social.search`): never a code or an account id. */
export interface Suggestion {
  name: string;
  av?: AvatarView;
  cc?: string;
  /** Already a friend, a request sent, or one they sent. */
  rel?: 'friend' | 'sent' | 'asked';
}

export interface SocialSheetDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  signedIn(): boolean;
  /** The player's party code when in a friend party lobby (Invite shows), else null. */
  partyCode(): string | null;
  /** gaps5 polish 4: 'ranked' while this player's party is a Ranked duo (the invite says so; the friend checks its unlock). */
  partyMode?(): 'ranked' | null;
  /** Join a friend's party by its code (the existing `party.join`). */
  joinParty(code: string): void;
  /** SPECTATE.md: watch a friend's live match (its room), or the featured live match; absent: no Watch buttons. */
  watch?(target: { room: string; name: string } | { featured: true }): void;
  signIn(): void;
  /** Ranked closed: Play Casual (the PvP queue). */
  playCasual(): void;
  /** Analytics (no names, codes or ids in props). */
  track?(event: string, props?: Record<string, string | number | boolean>): void;
  /** The viewport height (the Clubs panel's hide ladder); default window.innerHeight. */
  height?(): number;
  /** A match runs: chat polls pause. */
  inMatch?(): boolean;
  /** The unread DM count changed (the landing badge). */
  onUnread?(n: number): void;
  /** MATCH-HISTORY.md: open a friend's match history (Match history in the row menu). */
  history?(friend: { code: string; name: string }): void;
  /**
   * SOCIAL-INVITES.md: Invite on a friend's row while not in a party. The app opens PLAY's Mode Select on With Friends
   * (the one play path: the leader picks the mode) and sends the invite once the party lobby is up. Absent: a note.
   */
  inviteFriend?(friend: { code: string; name: string }): void;
  /** An invite went out (its id and how long it lives): the app tells the inviter when it expires unanswered. */
  onInviteSent?(invite: { id: string; name: string; ttl: number }): void;
}

const errorText = (r: ApiResult): string => {
  const code = (r.body as { code?: string } | undefined)?.code ?? '';
  if (r.status === 0) return 'No connection. Try again.';
  if (r.status === 429) return 'Too many tries. Wait a minute.';
  if (code === 'PAWLEGENDS_SOCIAL_NOT_FOUND') return 'No player has this code.';
  if (code === 'PAWLEGENDS_SOCIAL_NO_NAME') return 'No player has this name.';
  if (code === 'PAWLEGENDS_SOCIAL_INVALID') return 'Type a name or a code.';
  if (code === 'PAWLEGENDS_SOCIAL_SELF') return "That's your own code.";
  if (code === 'PAWLEGENDS_SOCIAL_CAP') return 'Your friends list is full.';
  if (code === 'PAWLEGENDS_SOCIAL_REFUSED') return "You can't add this player.";
  if (code === 'PAWLEGENDS_SOCIAL_NO_PARTY') return "Your party isn't ready. Try again in a moment.";
  if (code === 'PAWLEGENDS_SOCIAL_LIMIT') return 'Invite already sent. Wait for an answer.';
  return 'Something went wrong. Try again.';
};

/** "No party" on an invite right after the lobby opened: retried this many times, this far apart. */
export const INVITE_PARTY_RETRIES = 4;
export const INVITE_PARTY_RETRY_MS = 2_000;

/** The folded groups, remembered on this device only (a per-viewer convenience; storage can fail). */
const FOLD_KEY = 'pl.social.groups.v1';
function readFolds(): Partial<Record<FriendGroupId, boolean>> {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Partial<Record<FriendGroupId, boolean>>) : {};
  } catch {
    return {};
  }
}

const GROUP_LABEL: Readonly<Record<FriendGroupId, string>> = Object.freeze({
  requests: 'Friend requests',
  fav: 'Favourites',
  online: 'Online',
  match: 'In match',
  offline: 'Offline',
  sent: 'Sent requests',
});

/** A CSS attribute value, quoted for a selector. */
const attr = (v: string): string => `"${v.replace(/["\\]/g, '\\$&')}"`;

export class SocialSheet {
  readonly root: HTMLElement;
  private tab: SocialTab = 'friends';
  private state: SocialState | null = null;
  private recent: RecentRow[] | null = null;
  private ranked: { status?: Record<string, any>; me?: Record<string, any> } = {};
  private adding = false;
  /** Add friend: the typed text, its nickname suggestions, and the debounce timer. */
  private addText = '';
  private suggest: { q: string; rows: Suggestion[] } | null = null;
  private suggestTimer: ReturnType<typeof setTimeout> | null = null;
  /** The friends search (filters the groups as you type; client side). */
  private query = '';
  /** The friend whose row menu is open, the More menu, and an armed Remove (tap twice). */
  private menuFor: string | null = null;
  private moreOpen = false;
  /** The friends search field is open (Search in the tab bar). */
  private searchOpen = false;
  /** My status card (Online / Away / Appear offline, a status note, my friend code). */
  private meOpen = false;
  /** Where a right click opened the row menu (the popover opens at the cursor, LoL's context menu), or null. */
  private menuAt: { x: number; y: number } | null = null;
  private readonly unwatch: () => void;
  private armed: string | null = null;
  private armTimer: ReturnType<typeof setTimeout> | null = null;
  private folds = readFolds();
  private note = '';
  private undo: { code: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  /** The control that opened the panel (the lobby's Friends button): focus returns to it on close. */
  private readonly opener: HTMLElement | null;
  /** A short screen: the invite card is open as a sheet over the list (never remembered: it starts folded). */
  private invShort = false;
  /** DM threads by friend code (unread dots on the rows). */
  private threads = new Map<string, ChatThreadRow>();
  private chat: ChatSheet | null = null;
  /** Invite and comeback codes (share/invite.ts): the card at the top of the Friends tab. */
  private readonly invite: InviteRow;
  /** CLUBS-KUDOS.md §6: the Clubs tab (its own module; the sheet only hosts it). */
  private readonly clubs = new ClubsPanel({
    api: (op, args) => this.deps.api(op, args),
    render: () => this.render(),
    note: (text) => {
      this.note = text;
    },
    openChat: (thread, title) => this.openClubChat(thread, title),
    track: (e, p) => this.deps.track?.(e, p),
  });

  constructor(
    parent: HTMLElement,
    private readonly deps: SocialSheetDeps,
    tab: SocialTab = 'friends',
  ) {
    // Requests is a group at the top of Friends now: opening on it unfolds that group
    this.tab = tab === 'requests' ? 'friends' : tab;
    if (tab === 'requests') this.folds.requests = false;
    // round 8 (WCAG 2.4.3): the control that opened the panel gets focus back when it closes
    const was = parent.ownerDocument.activeElement as HTMLElement | null;
    this.opener = was && was !== parent.ownerDocument.body ? was : null;
    this.root = parent.ownerDocument.createElement('aside');
    this.root.className = 'pl-social';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Friends');
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    // the roving Tab stop follows focus inside the list (a click, an arrow, a row's action)
    this.root.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('.pl-social-body')) return;
      const nav = t.hasAttribute('data-nav') ? t : t.closest('.pl-social-row')?.querySelector<HTMLElement>('[data-nav]');
      if (!nav) return;
      this.navKey = SocialSheet.navKeyOf(nav);
      for (const el of this.root.querySelectorAll<HTMLElement>('.pl-social-body [data-nav]')) el.tabIndex = el === nav ? 0 : -1;
    });
    // right-click, or a long press on touch, opens a friend's row menu
    this.root.addEventListener('contextmenu', (e) => {
      const row = (e.target as HTMLElement).closest?.<HTMLElement>('.pl-fr');
      if (!row?.dataset.code) return;
      e.preventDefault();
      const at = e instanceof MouseEvent && (e.clientX || e.clientY) ? { x: e.clientX, y: e.clientY } : null;
      if (this.menuFor !== row.dataset.code) this.openMenu(row.dataset.code, at);
      else {
        this.menuAt = at;
        this.placeMenu();
      }
    });
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      const club = (e.target as HTMLElement).closest?.('.pl-club-join');
      if (club) {
        void this.clubs.join(club.querySelector<HTMLInputElement>('input[name="club"]')?.value ?? '');
        return;
      }
      const form = e.target as HTMLFormElement | null;
      if (form?.dataset?.form === 'invite') void this.invite.redeem(form.querySelector<HTMLInputElement>('input[name="invite"]')?.value ?? '');
      else void this.addByCode();
    });
    this.root.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement | null;
      if (input?.name === 'q') {
        // the search repaints the list only: the field keeps its focus and caret
        this.query = input.value;
        this.menuFor = null;
        this.paintBody();
        // the matches start at the top (no half row of an earlier scroll above the first group)
        const body = this.root.querySelector<HTMLElement>('.pl-social-body');
        if (body) body.scrollTop = 0;
        return;
      }
      // Add friend: nickname suggestions while typing (300 ms after the last key, 2 letters at least)
      if (input?.name !== 'code') return;
      this.addText = input.value;
      if (this.suggestTimer) clearTimeout(this.suggestTimer);
      this.suggestTimer = setTimeout(() => void this.findNames(), 300);
    });
    // my status note: a preset picked from the me card's list
    this.root.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement | null;
      if (sel?.name === 'note') void this.setNote(Number(sel.value));
    });
    // the list's scroll cue (a fade at the bottom while more rows sit below); the body is rebuilt on render
    this.root.addEventListener('scroll', (e) => {
      if (!(e.target as HTMLElement).classList?.contains('pl-social-body')) return;
      this.scrollCue();
      if (this.menuFor && !this.sheetMenu) this.placeMenu();
    }, true);
    // a scroll that comes to rest with a group header half pushed out by the next: its rows are gone, so the rest of
    // it is nudged out, like a snap (round 8: never a stuck heading with nothing under it)
    this.root.addEventListener('scrollend', (e) => {
      if ((e.target as HTMLElement).classList?.contains('pl-social-body')) this.clearSliver();
    }, true);
    this.invite = new InviteRow({
      api: (op, args) => this.deps.api(op, args),
      render: () => this.render(),
      note: (text) => {
        this.note = text;
      },
      track: (event, props) => this.deps.track?.(event, props),
    });
    parent.appendChild(this.root);
    // a phone turned, or a window resized across the short-screen line: the tools row and groups change shape
    const win = parent.ownerDocument.defaultView;
    const mq = win?.matchMedia?.(`(max-height: ${SHORT_PX}px)`);
    const onShort = () => {
      // a viewport change folds the invite sheet (it never buries the list on a short screen)
      this.invShort = false;
      this.render();
    };
    mq?.addEventListener?.('change', onShort);
    // round 8: the more-below bar sits on the list's bottom edge: it follows the panel's size (a window resized)
    // a phone turned (its width changes; a keyboard only changes the height) folds the invite sheet too
    let lastW = win?.innerWidth ?? 0;
    const fit = () => {
      const w = win?.innerWidth ?? 0;
      if (w !== lastW && this.invShort) {
        this.invShort = false;
        this.render();
      }
      lastW = w;
      // a window resized across the sheet line (or a phone turned) with a friend's menu open: sheet <-> popover
      const open = this.root.querySelector('.pl-fr-menu');
      if (open && open.classList.contains('is-sheet') !== this.sheetMenu) this.render();
      else if (open) this.placeMenu();
      this.scrollCue();
    };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(this.root);
    win?.addEventListener('resize', fit);
    this.unwatch = () => {
      mq?.removeEventListener?.('change', onShort);
      win?.removeEventListener('resize', fit);
      ro?.disconnect();
    };
    this.deps.track?.('social_open', { tab: this.tab });
    this.render();
    // the dialog's first focus: the selected tab (keyboard and screen reader users land inside the sheet)
    this.root.querySelector<HTMLElement>('.pl-social-tab[aria-selected="true"], .pl-social-more')?.focus({ preventScroll: true });
    void this.load();
    this.pulseTimer = setInterval(() => void this.pulse(), 30_000);
  }

  private get per(): number {
    return rowsForHeight(this.deps.height?.() ?? (typeof window !== 'undefined' ? window.innerHeight : 640));
  }

  private async load(): Promise<void> {
    if (this.tab === 'ranked') return this.loadRanked();
    if (!this.deps.signedIn()) {
      rememberAgeBand(null);
      return this.render();
    }
    if (this.tab === 'friends') void this.invite.load();
    const [s, threads] = await Promise.all([
      this.deps.api('social.get'),
      this.tab === 'friends' ? this.deps.api('chat.list') : Promise.resolve(null),
      this.tab === 'clubs' ? this.clubs.load() : Promise.resolve(),
    ]);
    if (s.ok && s.body) {
      this.state = s.body as SocialState;
      rememberAgeBand(this.state.me?.ageBand);
      this.deps.onUnread?.(this.state.chat?.unread ?? 0);
      this.runLater();
    } else if (!s.ok) this.note = errorText(s);
    if (threads?.ok) {
      this.threads = new Map(((threads.body as { threads?: ChatThreadRow[] })?.threads ?? []).map((t) => [t.with.code, t]));
    }
    // the open thread is being read: its row shows no badge or preview (the server catches up on `chat.read`)
    if (this.chatCode && this.chat && !this.chat.closed) {
      this.clearUnread(this.chatCode);
      this.chat.render();
    }
    this.render();
    const want = this.chatWhenLoaded;
    this.chatWhenLoaded = null;
    if (want && this.state && !this.disposed) this.openChat(want);
  }

  /** Queued invites (round 6): send the ones whose friend is free now, say so when I have no party, drop the stale. */
  private runLater(): void {
    if (!this.state || !LATER.size) return;
    const party = this.deps.partyCode();
    for (const [code, q] of [...LATER]) {
      const f = this.state.friends.find((x) => x.code === code);
      const step = laterStep(f?.presence, q.at, !!party);
      if (step === 'wait') continue;
      LATER.delete(code);
      if (step === 'send') void this.sendInvite(code, q.name);
      else if (step === 'tell') this.note = `${q.name} is free now: invite them from their row`;
      else if (f?.presence.state === 'offline') this.note = `${q.name} went offline: invite not sent`;
    }
  }

  private async loadRanked(): Promise<void> {
    const [status, me] = await Promise.all([this.deps.api('ranked.status'), this.deps.signedIn() ? this.deps.api('ranked.me') : Promise.resolve(null)]);
    this.ranked = { status: status.ok ? (status.body as Record<string, any>) : undefined, me: me?.ok ? (me.body as Record<string, any>) : undefined };
    const st = this.ranked.status;
    this.deps.track?.('ranked_view', { state: !this.deps.signedIn() ? 'locked' : st?.open ? 'open' : 'closed' });
    this.render();
  }

  /** The pulse (§4.3): 204 while nothing changed, else refetch. Paused in hidden tabs. */
  async pulse(): Promise<void> {
    if (this.disposed || !this.deps.signedIn()) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const r = await this.deps.api('social.pulse', { ...(this.state?.rev ? { rev: this.state.rev } : {}), dev: pulseDevice() });
    if (!r.ok || r.status === 204 || !r.body) return;
    // keep the rev current on every tab (the Ranked tab never refetches `social.get`, so without this every
    // later pulse would answer "changed" again), and refetch only the lists that show friends' state. Never while the
    // add field is open: a re-render would wipe what the player is typing.
    const rev = (r.body as { rev?: unknown }).rev;
    if (this.state && typeof rev === 'string') this.state.rev = rev;
    const chat = (r.body as { chat?: SocialState['chat'] }).chat;
    if (chat && typeof chat.unread === 'number') {
      if (this.state) this.state.chat = chat;
      this.deps.onUnread?.(chat.unread);
    }
    // an open DM thread polls itself; its Back reloads the list, so nothing renders under it meanwhile. Its tab strip
    // still learns of new messages in other threads (one `chat.list`)
    if (this.chat && !this.chat.closed && !this.chat.docked) {
      if (chat && typeof chat.unread === 'number') {
        const threads = await this.deps.api('chat.list');
        if (threads.ok && !this.disposed) {
          this.threads = new Map(((threads.body as { threads?: ChatThreadRow[] })?.threads ?? []).map((t) => [t.with.code, t]));
          if (this.chatCode) this.clearUnread(this.chatCode);
          this.chat?.render();
        }
      }
      return;
    }
    if (this.adding || this.meOpen || this.invite.entering || this.tab === 'ranked' || this.tab === 'clubs') return;
    await this.load();
  }

  private noteTimer: ReturnType<typeof setTimeout> | null = null;
  private noteShown = '';

  /** A status note fades after 3 s (5 s while Block's Undo shows). It sits under the list, never over a row. */
  private armNote(): void {
    if (!this.note || this.note === this.noteShown) return;
    this.noteShown = this.note;
    if (this.noteTimer) clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(
      () => {
        this.noteTimer = null;
        this.note = '';
        this.noteShown = '';
        if (!this.undo) this.root.querySelector('.pl-social-note')?.remove();
      },
      this.undo ? 5000 : 3000,
    );
  }

  private esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  }

  /** The tab the header shows as selected (Requests lives inside Friends). */
  private get shownTab(): SocialTab {
    return this.tab === 'requests' ? 'friends' : this.tab;
  }

  /** A selector for the focused control, so a re-render (a pulse) puts focus back where it was. */
  private focusKey(): { sel: string; caret?: number } | null {
    const a = this.root.ownerDocument.activeElement as HTMLElement | null;
    if (!a || a === this.root || !this.root.contains(a)) return null;
    if (a instanceof HTMLInputElement && a.name) return { sel: `input[name="${a.name}"]`, caret: a.selectionStart ?? a.value.length };
    // `role` tells a menu item from the row button with the same action (the menu comes after the row)
    const sel = ['data-a', 'data-tab', 'data-code', 'data-group', 'data-age', 'role']
      .map((k) => {
        const v = a.getAttribute(k);
        return v === null ? '' : `[${k}=${attr(v)}]`;
      })
      .join('');
    return sel ? { sel } : null;
  }

  /** Markup with `data-name` holes; names are filled by textContent after. */
  render(): void {
    if (this.disposed) return;
    const focus = this.focusKey();
    const scroll = this.root.querySelector('.pl-social-body')?.scrollTop ?? 0;
    const foot = this.footer();
    const note =
      this.note || this.undo
        ? `<p class="pl-social-note" role="status">${this.esc(this.note || 'Blocked')}${this.undo ? ' <button type="button" class="pl-social-undo" data-a="undo">Undo</button>' : ''}</p>`
        : '';
    this.root.dataset.view = this.shownTab;
    this.root.dataset.short = String(this.short);
    // the invite card starts folded on a short screen and once there are friends to look at (a choice wins)
    this.invite.autoFold = (this.state?.friends.length ?? 0) > 0;
    this.root.innerHTML = `${this.head()}${this.tabBar()}${this.searchRow()}${this.meCard()}<div class="pl-social-body" id="pl-social-panel" role="tabpanel" aria-label="${TAB_LABEL[this.shownTab]}">${this.body()}${MORE_BELOW}</div>${note}${foot ? `<footer class="pl-social-foot">${foot}</footer>` : ''}${this.menuSheet()}${this.inviteSheet()}`;
    this.fillNames(this.root);
    // a friend's bottom sheet is modal: nothing behind the backdrop can be tapped, focused or read (Nov 19)
    if (this.root.querySelector('.pl-fr-menu.is-sheet'))
      for (const el of this.root.children) if (!el.matches('.pl-fr-menu, .pl-fr-scrim')) (el as HTMLElement).inert = true;
    const body = this.root.querySelector<HTMLElement>('.pl-social-body');
    if (body && scroll) body.scrollTop = scroll;
    this.rove();
    this.scrollCue();
    this.placeMenu();
    if (focus) {
      const el = this.root.querySelector<HTMLElement>(focus.sel);
      el?.focus({ preventScroll: true });
      if (el instanceof HTMLInputElement && focus.caret !== undefined) el.setSelectionRange(focus.caret, focus.caret);
    }
    this.armNote();
  }

  /** The fade at the list's bottom edge shows while more rows sit below (the list is cut: scroll for more). */
  private scrollCue(): void {
    const body = this.root.querySelector<HTMLElement>('.pl-social-body');
    if (!body) return;
    const more = body.scrollHeight - body.scrollTop - body.clientHeight > 4;
    this.root.classList.toggle('has-more', more);
    this.moreBelow(body, more);
  }

  /**
   * Round 8 (LoL always shows its Offline header): while group headers sit below the fold, a bar on the list's bottom
   * edge names them with their counts ("Offline 15 · Sent requests 1"); a click scrolls the first one to the top.
   */
  private moreBelow(body: HTMLElement, more: boolean): void {
    const bar = this.root.querySelector<HTMLElement>('.pl-more-below');
    if (!bar) return;
    const br = body.getBoundingClientRect();
    const h = bar.offsetHeight || 40;
    const hidden = more
      ? [...body.querySelectorAll<HTMLElement>('.pl-group > .pl-group-h[data-group]')].filter((g) => g.getBoundingClientRect().top >= br.bottom - h - 2)
      : [];
    if (!hidden.length) {
      bar.hidden = true;
      return;
    }
    const parts = hidden.map((g) => ({ t: GROUP_LABEL[g.dataset.group as FriendGroupId] ?? '', n: g.querySelector('.pl-group-n')?.textContent?.trim() ?? '' }));
    const key = parts.map((p) => `${p.t}${p.n}`).join('|');
    if (bar.dataset.key !== key) {
      bar.dataset.key = key;
      bar.dataset.to = hidden[0].dataset.group ?? '';
      bar.innerHTML = `${icon('chevron', 16)}${parts.map((p) => `<span class="pl-mb-g"><span class="pl-mb-t">${this.esc(p.t)}</span><b class="pl-mb-n">${this.esc(p.n)}</b></span>`).join(SEP_HTML)}`;
      bar.setAttribute('aria-label', `Below: ${parts.map((p) => `${p.t}, ${p.n}`).join('; ')}. Show`);
    }
    bar.hidden = false;
  }

  /**
   * After a scroll the sheet made (a row or its menu brought into view, a keyboard move): a group header that is
   * being pushed out by the next one would show as a sliver above it. Scroll it fully out.
   */
  private clearSliver(max = Infinity): void {
    const body = this.root.querySelector<HTMLElement>('.pl-social-body');
    if (!body) return;
    const top = body.getBoundingClientRect().top;
    for (const h of body.querySelectorAll<HTMLElement>('.pl-group > .pl-group-h')) {
      const r = h.getBoundingClientRect();
      // round 8: a stuck header with less than 20 px of its own rows under it goes too (never a heading over nothing)
      const sec = h.parentElement!.getBoundingClientRect();
      const stuck = sec.top < top - 0.5 && Math.abs(r.top - top) <= 1 && sec.bottom - r.bottom < 20;
      const sliver = r.top < top - 0.5 && r.bottom > top + 0.5;
      if ((sliver || stuck) && sec.bottom - top > 0.5 && sec.bottom - top <= max) {
        const need = Math.ceil(sec.bottom - top);
        // at the end of the list there is no room to scroll it out: a little more room under the last row (this
        // body only; the next render drops it)
        const room = body.scrollHeight - body.clientHeight - body.scrollTop;
        if (room < need) body.style.paddingBottom = `${parseFloat(getComputedStyle(body).paddingBottom) + need - room + 1}px`;
        body.scrollTop += need;
        break;
      }
    }
    this.scrollCue();
  }

  /**
   * A phone-like device (touch, no hover, the app WebView, a mobile browser, or a screen up to 900 px wide or 500 px
   * tall: sheetDevice.ts): a friend's menu is a bottom sheet over a backdrop; a wide screen with a mouse gets the
   * popover by its row. Nov 19: an Android phone that reported a fine pointer got the popover over the list.
   */
  private get sheetMenu(): boolean {
    return this.short || sheetDevice(this.root.ownerDocument.defaultView as unknown as Parameters<typeof sheetDevice>[0]);
  }

  /**
   * A friend's row menu: on touch a bottom sheet over a scrim; with a mouse a compact vertical context menu floating
   * by its row (or at the cursor after a right click), LoL style: it never pushes the rows below it down.
   */
  private menuSheet(): string {
    if (!this.menuFor || this.shownTab !== 'friends' || !this.state) return '';
    const f = this.state.friends.find((x) => x.code === this.menuFor);
    if (!f) return '';
    const myParty = this.deps.partyCode();
    const act = rowAction(f.presence, !!myParty, myParty);
    if (!this.sheetMenu) return this.rowMenu(f, act, myParty, false);
    return `<div class="pl-fr-scrim" data-a="menu-close" aria-hidden="true"></div>${this.rowMenu(f, act, myParty, true)}`;
  }

  /** Place the floating row menu: under its row (above it when there is no room), or at the cursor; inside the sheet. */
  private placeMenu(): void {
    const menu = this.root.querySelector<HTMLElement>('.pl-fr-menu.is-pop');
    if (!menu || !this.menuFor) return;
    const row = this.root.querySelector<HTMLElement>(`.pl-fr[data-code=${attr(this.menuFor)}]`);
    const body = this.root.querySelector<HTMLElement>('.pl-social-body');
    if (!row || !body) return;
    const sr = this.root.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    // the row scrolled out of the list: the menu waits hidden until it is back
    menu.style.visibility = rr.bottom < br.top + 8 || rr.top > br.bottom - 8 ? 'hidden' : '';
    // never over its own row (Nov 19): under it when it fits, else above it, else on the roomier side with a
    // shorter, scrolling menu; a right click keeps the cursor's x only
    menu.style.maxHeight = '';
    const mw = menu.offsetWidth;
    const at = this.menuAt;
    const gap = 2;
    const edge = 8;
    const below = sr.bottom - edge - (rr.bottom + gap);
    const above = rr.top - gap - (sr.top + edge);
    let mh = menu.offsetHeight;
    const under = mh <= below || (mh > above && below >= above);
    if (mh > (under ? below : above)) {
      mh = Math.max(0, Math.floor(under ? below : above));
      menu.style.maxHeight = `${mh}px`;
    }
    const top = under ? rr.bottom + gap - sr.top : rr.top - gap - mh - sr.top;
    let left = at ? at.x - sr.left : sr.width - mw - 12;
    left = Math.max(8, Math.min(left, sr.width - mw - 8));
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
  }

  /**
   * Names by textContent; a name that can be cut by an ellipsis carries its full text as a tooltip. While searching,
   * the matched letters of a friend's name are marked (built from text nodes: a name is never parsed as markup).
   */
  private fillNames(scope: HTMLElement): void {
    const q = this.query.trim().toLowerCase();
    for (const el of scope.querySelectorAll<HTMLElement>('[data-name]')) {
      const name = el.dataset.name ?? '';
      el.textContent = name;
      if (el.classList.contains('pl-social-name') || el.classList.contains('pl-social-msg')) el.title = name;
      const at = q && el.classList.contains('pl-social-name') && el.closest('.pl-social-body') ? name.toLowerCase().indexOf(q) : -1;
      if (at < 0) continue;
      const doc = el.ownerDocument;
      const mark = doc.createElement('mark');
      mark.className = 'pl-hl';
      mark.textContent = name.slice(at, at + q.length);
      el.replaceChildren(doc.createTextNode(name.slice(0, at)), mark, doc.createTextNode(name.slice(at + q.length)));
    }
  }

  /** Repaint the list only (the search): the header keeps its focus, caret and the typed text. */
  private paintBody(): void {
    const body = this.root.querySelector<HTMLElement>('.pl-social-body');
    if (!body) return;
    body.innerHTML = this.body() + MORE_BELOW;
    this.fillNames(body);
    this.rove();
    this.scrollCue();
  }

  /** The list's one Tab stop (round 6, a roving tabindex): the row last focused, else the first. */
  private navKey: string | null = null;
  private static navKeyOf(el: HTMLElement): string {
    return `${el.dataset.a ?? ''}|${el.dataset.code ?? ''}|${el.dataset.group ?? ''}`;
  }

  /**
   * One Tab stop for the whole list (WAI-ARIA's roving tabindex): Tab enters the list on one row and leaves it on the
   * next control; arrows, Home, End and PageUp/PageDown move inside it; ArrowRight reaches a row's actions.
   */
  private rove(): void {
    const body = this.root.querySelector<HTMLElement>('.pl-social-body');
    if (!body) return;
    for (const b of body.querySelectorAll<HTMLElement>('.pl-fr-acts button')) b.tabIndex = -1;
    const items = [...body.querySelectorAll<HTMLElement>('[data-nav]')];
    if (!items.length) return;
    const cur = (this.navKey && items.find((el) => SocialSheet.navKeyOf(el) === this.navKey)) || items[0];
    for (const el of items) el.tabIndex = el === cur ? 0 : -1;
  }

  /** The invite card is in sight on Friends (the gift shows pressed only then: never on Recent or Clubs). */
  private get inviteShown(): boolean {
    if (this.shownTab !== 'friends' || !this.invite.state || this.adding || this.query.trim()) return false;
    return this.short ? this.invShort : !this.invite.isFolded && !this.meOpen;
  }

  /** A short screen: the invite card as a bottom sheet over the list (a scrim behind; Esc or the scrim folds it). */
  private inviteSheet(): string {
    if (!this.short || !this.invShort || !this.inviteShown || !(this.state?.friends.length ?? 0)) return '';
    return `<div class="pl-fr-scrim" data-a="inv-fold" aria-hidden="true"></div><div class="pl-inv-sheet" role="dialog" aria-label="Invite friends" data-testid="invite-sheet">${this.invite.html(true)}</div>`;
  }

  /**
   * The header: the title, then my status (a dot button; founder Nov 19: no self card with my own name and "Online",
   * it told me nothing), the invite gift (once there are friends: the card folds away), Add a friend and Close.
   */
  private head(): string {
    const s = this.state;
    const tools = this.headTools;
    let status = '';
    if (tools && s) {
      const st = this.myStatus();
      const note = noteText(s.me.note);
      status = `<button type="button" class="pl-ico pl-ico-st" data-a="me" data-testid="social-status" data-state="${st.state}" aria-haspopup="true" aria-expanded="${this.meOpen}" aria-controls="pl-me-card" aria-label="${this.esc(`My status: ${st.text}${note ? `, ${note}` : ''}. Change status`)}" title="${this.esc(`My status: ${st.text}`)}"><i class="pl-dot" data-state="${st.state}" aria-hidden="true"></i></button>`;
    }
    const inv = this.invite;
    const gift =
      tools && inv.state && (s?.friends.length ?? 0) > 0
        ? `<button type="button" class="pl-ico pl-ico-gift${inv.state.claimable ? ' has-dot' : ''}" data-a="inv-fold" data-testid="invite-open" aria-expanded="${this.inviteShown}" aria-label="${inv.state.claimable ? 'Invite friends: a coat to claim' : 'Invite friends'}" title="Invite friends">${icon('gift', 20)}</button>`
        : '';
    const add = this.deps.signedIn() && s?.me.ageBand ? `<button type="button" class="pl-ico pl-ico-add" data-a="add" data-testid="social-add" aria-expanded="${this.adding}" aria-label="Add a friend" title="Add a friend">${icon('addUser', 20)}</button>` : '';
    return `<header class="pl-social-head"><h2 class="pl-social-title">Friends</h2><span class="pl-head-acts">${status}${gift}${add}<button type="button" class="pl-ico pl-social-x" data-a="close" aria-label="Close" title="Close (Esc)">${icon('close', 20)}</button></span></header>`;
  }

  /**
   * The tab bar: Friends, Clubs (underlined text tabs on one track), More (Ranked and the live match: not friend-list
   * content) and Search. The Friends tab shows a dot only while another tab is
   * open and something waits there (a request or an unread message); on Friends the groups and rows show the counts.
   */
  private tabBar(): string {
    const unread = this.state?.chat?.unread ?? 0;
    const asks = this.state?.requests.in.length ?? 0;
    const tabs = MAIN_TABS.map((t) => {
      const on = this.shownTab === t;
      const what = [asks ? `${asks} ${asks === 1 ? 'request' : 'requests'}` : '', unread ? `${unread} unread` : ''].filter(Boolean).join(', ');
      const dot = t === 'friends' && !on && what ? `<i class="pl-tab-dot" data-testid="social-unread" aria-hidden="true"></i>` : '';
      const label = dot ? ` aria-label="${TAB_LABEL[t]}, ${what}"` : '';
      return `<button type="button" role="tab" class="pl-social-tab" id="pl-social-tab-${t}" data-tab="${t}" aria-selected="${on}" aria-controls="pl-social-panel" tabindex="${on ? 0 : -1}"${label}><span>${TAB_LABEL[t]}</span>${dot}</button>`;
    }).join('');
    const inMore = (MORE_TABS as readonly SocialTab[]).includes(this.shownTab);
    const more = `<button type="button" class="pl-social-more${inMore ? ' is-current' : ''}" data-a="tabs-more" aria-haspopup="menu" aria-expanded="${this.moreOpen}" aria-label="More: Ranked${this.liveShown ? ', watch live' : ''}"><span>${inMore ? TAB_LABEL[this.shownTab] : 'More'}</span>${icon('chevron', 16)}</button>`;
    // SPECTATE.md: the featured live match sits in More (never a chip or a row in the friends list)
    const live = this.liveShown
      ? `<button type="button" role="menuitem" class="pl-mi" data-a="watch-live" data-testid="social-watch-live">${icon('live', 18)}<span>Watch a live match</span><i class="pl-live-dot" aria-hidden="true"></i></button>`
      : '';
    const menu = `<div class="pl-social-moremenu" role="menu" aria-label="More"${this.moreOpen ? '' : ' hidden'}>${MORE_TABS.map((t) => `<button type="button" role="menuitem" class="pl-mi" data-tab="${t}" aria-current="${this.shownTab === t}">${icon('trophy', 18)}<span>${TAB_LABEL[t]}</span></button>`).join('')}${live}</div>`;
    // round 7: Search on every tab (the bar never changes shape): it searches Friends, and from another tab it opens
    // Friends with the field ready
    const search =
      this.headTools && !this.adding
        ? `<button type="button" class="pl-ico pl-search-btn" data-a="search" data-testid="social-search" aria-expanded="${this.searchShown}" aria-controls="pl-social-q" aria-label="Search friends" title="Search friends">${icon('search', 20)}</button>`
        : '';
    return `<nav class="pl-social-tabbar"><div class="pl-social-tabs" role="tablist" aria-label="Social">${tabs}</div>${more}${search}${menu}</nav>`;
  }

  /** The featured live match can be watched (More shows it). */
  private get liveShown(): boolean {
    return !!this.deps.watch && !!this.state?.live?.featured && !this.deps.partyCode();
  }

  /** The search field shows once opened (Search in the tab bar) or while it holds text. */
  private get searchShown(): boolean {
    return this.shownTab === 'friends' && this.headTools && !this.adding && (this.searchOpen || !!this.query);
  }

  /** The friends search: one row under the tabs, filtering as you type; its × (or Esc) clears and closes it. */
  private searchRow(): string {
    if (!this.searchShown) return '';
    return `<div class="pl-social-searchrow" role="search"><label class="pl-social-search">${icon('search', 18)}<input type="search" id="pl-social-q" name="q" autocomplete="off" spellcheck="false" placeholder="Search friends" aria-label="Search friends" enterkeyhint="search" value="${this.esc(this.query)}"></label><button type="button" class="pl-ico" data-a="search-close" aria-label="Close search" title="Close search">${icon('close', 18)}</button></div>`;
  }

  /** A short screen (a phone held sideways, ≤ 500 px): denser group headers, Requests folds to its header. */
  private get short(): boolean {
    return (this.deps.height?.() ?? (typeof window !== 'undefined' ? window.innerHeight : 640)) <= SHORT_PX;
  }

  /** The header's status, gift and Add show on every tab once signed in and the age is asked. */
  private get headTools(): boolean {
    return this.deps.signedIn() && !!this.state?.me.ageBand;
  }

  /** My status word ("Online", "Away" or "Appear offline") and its presence state for the dot. */
  private myStatus(): { text: string; state: ShownState } {
    const me = this.state?.me;
    if (me?.invisible) return { text: 'Appear offline', state: 'offline' };
    return me?.away ? { text: 'Away', state: 'away' } : { text: 'Online', state: 'online' };
  }

  /**
   * My status card (under the tabs, in the flow): Online, Away or Appear offline, a preset status note, my friend code
   * (the avatar is changed in Profile only). While it is open the invite card stays folded (one popover at a time).
   */
  private meCard(): string {
    if (!this.meOpen || !this.headTools) return '';
    const me = this.state!.me;
    const cur = me.invisible ? 'invisible' : me.away ? 'away' : 'online';
    const radio = (v: 'online' | 'away' | 'invisible', text: string, sub: string) => {
      const on = v === cur;
      const st = v === 'invisible' ? 'offline' : v;
      return `<button type="button" role="radio" class="pl-mi pl-me-opt" data-a="status" data-v="${v}" aria-checked="${on}" tabindex="${on ? 0 : -1}"><i class="pl-dot" data-state="${st}"></i><span><b>${text}</b><small>${sub}</small></span>${on ? icon('check', 18) : ''}</button>`;
    };
    const opts = [`<option value="-1"${noteText(me.note) ? '' : ' selected'}>No status note</option>`, ...STATUS_NOTES.map((t, i) => `<option value="${i}"${me.note === i ? ' selected' : ''}>${this.esc(t)}</option>`)].join('');
    // round 8: notes are picked from a list on purpose (a young audience: no free text to moderate); the card says so
    const note = `<label class="pl-me-note"><span>Status note<small class="pl-me-note-hint" id="pl-note-hint">Picked from a safe list</small></span><select name="note" data-testid="social-note" aria-label="Status note friends see" aria-describedby="pl-note-hint">${opts}</select></label>`;
    // touch or a short screen: a bottom sheet over the panel (it never runs past the screen; it scrolls when tall);
    // a mouse: under the header, in the flow, capped and scrolling
    const sheet = this.sheetMenu;
    const head = sheet
      ? `<div class="pl-me-card-h"><span class="pl-fr-grab" aria-hidden="true"></span><p class="pl-me-card-name">My status</p><button type="button" class="pl-ico" data-a="me-close" aria-label="Close status" title="Close">${icon('close', 18)}</button></div>`
      : '';
    return `${sheet ? '<div class="pl-fr-scrim" data-a="me-close" aria-hidden="true"></div>' : ''}<div class="pl-me-card${sheet ? ' is-sheet' : ''}" id="pl-me-card" data-testid="social-me-card" role="dialog" aria-label="My status">${head}<div role="radiogroup" aria-label="My status">${radio('online', 'Online', 'Friends can invite you')}${radio('away', 'Away', 'Also set after 10 min idle')}${radio('invisible', 'Appear offline', 'You still see your friends')}</div>${note}<div class="pl-me-card-acts"><button type="button" class="pl-mi" data-a="copy" aria-label="${this.esc(`Copy your friend code ${me.code}`)}">${icon('copy', 18)}<span>Friend code <b class="pl-me-code">${this.esc(me.code)}</b></span></button></div></div>`;
  }

  /**
   * Add a friend (LoL's small add box): a card at the top of the list, the list stays under it. A name shows
   * suggestions as you type (2 letters or more); a friend code (PL-XXXX-XXXX) is added as typed.
   */
  private addCard(): string {
    return `<form class="pl-add-card" data-form="add" data-testid="social-add-card"><div class="pl-add-top"><label class="pl-social-search">${icon('addUser', 18)}<input name="code" maxlength="24" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Name or friend code" aria-label="Friend's name or friend code" inputmode="text" enterkeyhint="send" data-testid="social-add-input" value="${this.esc(this.addText)}"></label><button type="submit" class="pl-btn small" data-testid="social-add-send">Add</button><button type="button" class="pl-ico" data-a="add-cancel" aria-label="Close add a friend" title="Close">${icon('close', 18)}</button></div><div class="pl-social-suggest" aria-live="polite">${this.suggestBody()}</div></form>`;
  }

  private guestPanel(): string {
    return `<div class="pl-social-empty"><p>Sign in to add friends and see who's online.</p><button type="button" class="pl-btn small" data-a="signin">Sign in</button></div>`;
  }

  private agePanel(): string {
    return `<div class="pl-social-empty"><p>How old are you? We ask once.</p><div class="pl-social-age"><button type="button" class="pl-btn ghost small" data-age="under16">Under 16</button><button type="button" class="pl-btn ghost small" data-age="16-17">16 or 17</button><button type="button" class="pl-btn ghost small" data-age="18+">18 or older</button></div><button type="button" class="pl-social-later" data-a="close">Not now</button></div>`;
  }

  private body(): string {
    if (this.tab === 'ranked') return this.rankedBody();
    if (!this.deps.signedIn()) return this.guestPanel();
    const s = this.state;
    if (!s) return `<p class="pl-social-empty">Loading…</p>`;
    if (!s.me.ageBand) return this.agePanel();
    if (this.tab === 'clubs') return this.clubs.body(this.per);
    return this.friendsBody(s);
  }

  private friendsBody(s: SocialState): string {
    const typed = this.query.trim();
    const q = typed.toLowerCase();
    const hit = (n: string) => !q || n.toLowerCase().includes(q);
    const friends = s.friends.filter((f) => hit(f.name));
    const asks = s.requests.in.filter((r) => hit(r.name));
    const sent = s.requests.out.filter((r) => hit(r.name));
    // the top of the list: the add card while adding, else the invite card when opened (the gift in the header)
    const none = !s.friends.length && !s.requests.in.length && !s.requests.out.length;
    const top = this.adding ? this.addCard() : q || none || this.meOpen || this.short || this.invite.isFolded ? '' : this.invite.html(true);
    if (none) return `${top}${this.emptyFriends()}`;
    if (q && !friends.length && !asks.length && !sent.length)
      return `<div class="pl-social-empty pl-social-none" data-testid="social-search-none"><span class="pl-none-art" aria-hidden="true">${icon('search', 28)}</span><p>No friend matches "<span data-name="${this.esc(typed)}"></span>".</p><small>Look for this name among all players.</small><button type="button" class="pl-btn small cta" data-a="add-empty" data-q="${this.esc(typed)}">${icon('addUser', 18)}<span>Find this player</span></button></div>`;
    const myParty = this.deps.partyCode();
    const groups = friendGroups(friends);
    const counts = { on: groups[1].rows.length + groups[2].rows.length, off: groups[3].rows.length };
    const now = Date.now();
    let html = top;
    if (asks.length) html += this.group('requests', asks.length, counts, asks.map((r) => this.requestRow(r, 'in')).join(''));
    for (const g of groups) if (g.rows.length) html += this.group(g.id, g.rows.length, counts, g.rows.map((f) => this.friendRow(f, myParty, now)).join(''));
    if (sent.length) html += this.group('sent', sent.length, counts, sent.map((r) => this.requestRow(r, 'out')).join(''));
    return html + (this.short ? '' : this.growHint(s));
  }

  /** No friends yet: what to do (no second Add button: Add sits in the tools row), and players from recent matches. */
  private emptyFriends(): string {
    const rec = (this.recent ?? []).filter((p) => p.canAdd).slice(0, 3);
    if (this.recent === null && this.deps.signedIn()) void this.loadRecentForEmpty();
    const recent = rec.length
      ? `<p class="pl-social-hint pl-none-sub">From your recent matches</p><div class="pl-group-list" role="list">${rec.map((p) => this.recentRow(p)).join('')}</div>`
      : '';
    // one way to add (Find a player) and one way to share (the invite card's Share link): no second share button
    const find = this.adding ? '' : `<button type="button" class="pl-btn small ghost" data-a="add-empty">${icon('addUser', 18)}<span>Find a player by name</span></button>`;
    const card = this.invite.state ? this.invite.html(false) : '';
    // round 8: the empty line says what to do only; the invite card below it says what you both get (nothing twice)
    const lead = `<small>Add a player you met by name.</small>`;
    // a short screen: one compact row first ("No friends yet" and Find, above the fold), then the invite card
    if (this.short)
      return `<div class="pl-social-empty pl-social-none is-compact is-row" data-testid="social-empty"><p>No friends yet</p>${this.adding ? '' : `<button type="button" class="pl-btn small ghost" data-a="add-empty" aria-label="Find a player by name">${icon('addUser', 18)}<span>Find a player</span></button>`}</div>${card}${recent}`;
    return `<div class="pl-social-empty pl-social-none" data-testid="social-empty"><span class="pl-none-art" aria-hidden="true">${icon('friends', 32)}</span><p>No friends yet</p>${lead}${find}</div>${card}${recent}`;
  }

  private recentAsked = false;
  /** The empty Friends tab suggests players from recent matches (one `social.recent`, once). */
  private async loadRecentForEmpty(): Promise<void> {
    if (this.recentAsked) return;
    this.recentAsked = true;
    const r = await this.deps.api('social.recent');
    if (this.disposed) return;
    this.recent = r.ok ? ((r.body as { players?: SocialSheet['recent'] })?.players ?? []) : [];
    if (this.tab === 'friends' && !this.adding) this.paintBody();
  }

  /**
   * A collapsible group: a header button with a count, then its rows (none while folded; a search unfolds all).
   * Friend requests never fold: their header is a plain heading (someone waits for an answer).
   */
  private group(id: FriendGroupId, n: number, counts: { on: number; off: number }, rows: string): string {
    const open = !!this.query.trim() || !groupFolded(id, this.folds[id], counts);
    const label = `${GROUP_LABEL[id]}, ${n}`;
    const head =
      id === 'requests'
        ? `<h3 class="pl-group-h is-static" data-group="${id}" aria-label="${this.esc(label)}">${icon('addUser', 16)}<span class="pl-group-t">${GROUP_LABEL[id]}</span><span class="pl-group-n">${n}</span></h3>`
        : `<button type="button" class="pl-group-h" data-a="fold" data-group="${id}" data-nav aria-expanded="${open}" aria-controls="pl-g-${id}" aria-label="${this.esc(label)}">${icon('chevron', 16)}<span class="pl-group-t">${id === 'fav' ? `${icon('star', 14)}` : ''}${GROUP_LABEL[id]}</span><span class="pl-group-n">${n}</span></button>`;
    return `<section class="pl-group" data-g="${id}">${head}${open ? `<div class="pl-group-list" id="pl-g-${id}" role="list">${rows}</div>` : ''}</section>`;
  }

  /**
   * A friend row. The trailing actions sit in two fixed columns: Chat, then the row's one action flush right (Join
   * filled bolt, Invite to party or Watch as icons), so every icon lines up down the list.
   */
  private friendRow(f: FriendRow, myParty: string | null, now = Date.now()): string {
    const act = rowAction(f.presence, !!myParty, myParty);
    const name = f.name;
    const st = presenceText(f.presence, now);
    // the presence word ("In match"), then its detail (" · Ranked · 12m"), which the compact list leaves out (LoL)
    const word0 = PRESENCE_TEXT[shownState(f.presence)];
    const t = this.threads.get(f.code);
    const unread = t?.unread && !t.muted ? t.unread : 0;
    const code = this.esc(f.code);
    // round 6: on touch the row's one action says what it does in a word beside its icon (no guessing an icon)
    const word = (w: string) => `<span class="pl-act-t">${w}</span>`;
    // the one filled action in the list is Join (bolt); Invite and Watch are quiet icons
    const primary =
      act === 'join'
        ? `<button type="button" class="pl-ico pl-act-2 is-primary" data-a="join" data-party="${this.esc(f.presence.party ?? '')}" data-code="${code}" data-testid="social-join" aria-label="${this.esc(`Join ${name}'s lobby`)}" title="Join lobby"><span class="pl-ic">${icon('join', 20)}${word('Join')}</span></button>`
        : act === 'watch' && this.deps.watch
          ? `<button type="button" class="pl-ico pl-act-2" data-a="watch" data-room="${this.esc(f.presence.room ?? '')}" data-code="${code}" data-testid="social-watch" aria-label="${this.esc(`Spectate ${name}'s match`)}" title="Spectate match">${icon('eye')}${word('Watch')}</button>`
          : act === 'invite'
            ? `<button type="button" class="pl-ico pl-act-2" data-a="invite" data-code="${code}" data-testid="social-invite" aria-label="${this.esc(`Invite ${name} to your party`)}" title="Invite to party">${icon('party', 22)}${word('Invite')}</button>`
            : act === 'ask'
              ? `<button type="button" class="pl-ico pl-act-2" data-a="ask" data-code="${code}" data-testid="social-ask" aria-label="${this.esc(`Ask ${name} to join their lobby`)}" title="Ask to join">${icon('ask', 22)}${word('Ask')}</button>`
              : '';
    const chat = `<button type="button" class="pl-ico pl-act-1 pl-chat-btn${unread ? ' is-unread' : ''}" data-a="chat" data-code="${code}" aria-label="${this.esc(`Chat with ${name}${unread ? `, ${unread} unread` : ''}`)}" title="Message"><span class="pl-ic">${icon('chat')}${unread ? `<i class="pl-chat-unread" data-testid="chat-unread">${Math.min(99, unread)}</i>` : ''}</span></button>`;
    // after the status, one more thing at most (the status never disappears, the row keeps its height): an unread
    // message (a small bubble, no bare quote), an invite queued for after their match, the champion they play in a
    // match (LoL's "In Game · Sage"), their status note, or when we last played together
    const note = noteText(f.note);
    const champ = f.presence.state === 'match' ? champText(f.presence.hero) : '';
    const later = LATER.has(f.code);
    const played = playedText(f.played, now);
    const extra = unread
      ? `<span class="pl-social-msg" title="${this.esc(previewText(t!.lastPreview))}">${icon('chat', 14)}<span data-name="${this.esc(previewText(t!.lastPreview))}"></span></span>`
      : later
        ? `${SEP_HTML}<span class="pl-st-note pl-st-later" data-testid="social-later-tag">${icon('clock', 14)}<span>Invite queued</span></span>`
        : champ
          ? `${SEP_HTML}<span class="pl-st-note pl-st-champ" data-testid="social-champ" data-name="${this.esc(champ)}"></span>`
          : note
            ? `${SEP_HTML}<span class="pl-st-note" data-name="${this.esc(note)}"></span>`
            : played && (f.presence.state === 'online' || f.presence.state === 'offline')
              ? `${SEP_HTML}<span class="pl-st-note pl-st-played" data-testid="social-played">${dotsHtml(played.replace('Played together ', 'Played '))}</span>`
              : '';
    const open = this.menuFor === f.code;
    const shown = shownState(f.presence);
    const mobile = f.presence.dev === 'm' && f.presence.state !== 'offline';
    const label = `${name}${mobile ? ', on mobile' : ''}, ${st}${champ ? `, playing ${champ}` : ''}${note ? `, ${note}` : ''}${unread ? `, ${unread} unread` : ''}${later ? ', invite queued' : ''}${f.fav ? ', favourite' : ''}${played ? `, ${played}` : ''}`;
    const chatting = this.chatCode === f.code && !!this.chat && !this.chat.closed;
    return `<div class="pl-social-row pl-fr${open ? ' is-open' : ''}${unread ? ' has-msg' : ''}${chatting ? ' is-chat' : ''}" role="listitem" data-state="${f.presence.state}" data-code="${code}"><button type="button" class="pl-fr-main" data-a="menu" data-code="${code}" data-nav aria-haspopup="menu" aria-expanded="${open}" aria-label="${this.esc(label)}"><span class="pl-fr-av" data-state="${shown}">${avatarHtml(f.av, 40)}<i class="pl-dot" data-state="${shown}"></i></span><span class="pl-social-who"><span class="pl-social-nm">${ccHtmlOrNone(f.cc)}<span class="pl-social-name" data-name="${this.esc(name)}"></span>${mobile ? `<span class="pl-dev" title="On mobile" data-testid="social-mobile">${icon('phone', 14)}</span>` : ''}</span><small class="pl-social-line"><span class="pl-social-st" data-state="${shown}">${this.esc(word0)}${st.length > word0.length ? `<span class="pl-st-more">${SEP_HTML}${dotsHtml(st.slice(word0.length + 3))}</span>` : ''}</span>${extra}</small></span></button><span class="pl-fr-acts">${chat}${primary}</span></div>`;
  }

  /** A friend's row menu (under the row, in the list's flow: nothing covers another row). */
  private rowMenu(f: FriendRow, act: ReturnType<typeof rowAction>, myParty: string | null, sheet = false): string {
    const code = this.esc(f.code);
    const mi = (a: string, ic: string, text: string, extra = '') => `<button type="button" role="menuitem" class="pl-mi" data-a="${a}" data-code="${code}"${extra}>${icon(ic, 18)}<span>${text}</span></button>`;
    const first =
      act === 'join'
        ? mi('join', 'join', 'Join lobby', ` data-party="${this.esc(f.presence.party ?? '')}"`)
        : act === 'watch' && this.deps.watch
          ? mi('watch', 'eye', 'Spectate match', ` data-room="${this.esc(f.presence.room ?? '')}"`)
          : act === 'invite'
            ? mi('invite', 'party', 'Invite to party')
            : act === 'ask'
              ? mi('ask', 'ask', 'Ask to join')
              : '';
    // a friend in a match or a queue: invite them for after it (LoL's in-game invite: it arrives when they are back);
    // already in my party: greyed with the reason; Join or Ask offered: nothing more (no "In another lobby" beside Join)
    const why = act === 'more' || act === 'watch' ? busyText(f.presence, myParty) : '';
    const busyState = f.presence.state === 'match' || f.presence.state === 'queue';
    const mine = !!myParty && f.presence.party === myParty;
    const busy =
      why && busyState && !mine
        ? LATER.has(f.code)
          ? mi('later-cancel', 'clock', 'Cancel the queued invite', ' data-testid="social-later-cancel"').replace('class="pl-mi"', 'class="pl-mi pl-mi-wide"')
          : mi('later', 'clock', `Invite when their ${f.presence.state === 'queue' ? 'queue' : 'match'} ends`, ' data-testid="social-invite-later"').replace('class="pl-mi"', 'class="pl-mi pl-mi-wide"')
        : why
          ? `<button type="button" role="menuitem" class="pl-mi pl-mi-busy" disabled aria-disabled="true" aria-label="${this.esc(`Invite to party. ${why}`)}" data-testid="social-invite-busy">${icon('party', 18)}<span>${this.esc(why)}</span></button>`
          : '';
    const armed = this.armed === `remove:${f.code}`;
    const remove = `<button type="button" role="menuitem" class="pl-mi danger${armed ? ' armed' : ''}" data-a="remove" data-code="${code}">${icon('remove', 18)}<span>${armed ? 'Tap again to remove' : 'Remove friend'}</span></button>`;
    // under the row the name and status are already in sight (the name stays for screen readers); a bottom sheet
    // covers the row, so it shows the friend as the row did: avatar, name, status (and their note)
    const shown = shownState(f.presence);
    const note = noteText(f.note);
    const champ = f.presence.state === 'match' ? champText(f.presence.hero) : '';
    // round 6 (LoL's friend card): when we last played together, in both menus
    const played = playedText(f.played);
    const info = played ? `<p class="pl-fr-menu-info" data-testid="social-menu-played">${icon('history', 16)}<span>${this.esc(played)}</span></p>` : '';
    const head = sheet
      ? `<div class="pl-fr-menu-h"><span class="pl-fr-grab" aria-hidden="true"></span><div class="pl-fr-menu-who"><span class="pl-fr-av" data-state="${shown}">${avatarHtml(f.av, 40)}<i class="pl-dot" data-state="${shown}"></i></span><span class="pl-social-who"><p class="pl-fr-menu-name" data-name="${this.esc(f.name)}"></p><small class="pl-social-line"><span class="pl-social-st" data-state="${shown}">${dotsHtml(presenceText(f.presence))}</span>${champ ? `${SEP_HTML}<span class="pl-st-note pl-st-champ" data-name="${this.esc(champ)}"></span>` : note ? `${SEP_HTML}<span class="pl-st-note" data-name="${this.esc(note)}"></span>` : ''}</small></span></div>${info}</div>`
      : `<p class="pl-fr-menu-name pl-sr" data-name="${this.esc(f.name)}"></p>${info}`;
    const fav = mi('fav', 'star', f.fav ? 'Unpin from favourites' : 'Pin to favourites', ` data-on="${f.fav ? 0 : 1}" data-testid="social-fav"`);
    const cancel = sheet ? `<button type="button" class="pl-btn ghost pl-fr-cancel" data-a="menu-close">Cancel</button>` : '';
    // round 8: the bottom sheet's two columns never leave a lone cell: with an odd count the first action (Join,
    // Spectate, Invite: the reason the menu was opened) spans the row as the lead
    const items = [first, mi('chat', 'chat', 'Message'), this.deps.history ? mi('history', 'history', 'Match history') : '', fav, busy].filter(Boolean);
    if (sheet && items.length % 2) items[0] = items[0].replace('class="pl-mi', 'class="pl-mi pl-mi-lead');
    return `<div class="pl-fr-menu${sheet ? ' is-sheet' : ' is-pop'}" role="menu" aria-label="${this.esc(`${f.name}: options`)}" data-testid="social-row-menu">${head}<div class="pl-fr-menu-acts">${items.join('')}</div><div class="pl-fr-menu-danger">${remove}${mi('block', 'block', 'Block').replace('class="pl-mi"', 'class="pl-mi danger"')}</div>${cancel}</div>`;
  }

  /** A request row: Decline (a quiet cross), then Accept (the filled bolt check, the row's one primary), lined up with a friend's actions. */
  private requestRow(r: PersonRow, dir: 'in' | 'out'): string {
    const code = this.esc(r.code);
    const acts =
      dir === 'in'
        ? `<button type="button" class="pl-ico pl-act-1 is-pill is-decline" data-a="decline" data-code="${code}" aria-label="${this.esc(`Decline ${r.name}`)}" title="Decline"><span class="pl-ic">${icon('close', 20)}</span></button><button type="button" class="pl-ico pl-act-2 is-primary is-accept" data-a="accept" data-code="${code}" aria-label="${this.esc(`Accept ${r.name}, friend request`)}" title="Accept"><span class="pl-ic">${icon('check', 20)}</span></button>`
        : `<button type="button" class="pl-ico pl-act-2" data-a="decline" data-code="${code}" aria-label="${this.esc(`Cancel the request to ${r.name}`)}" title="Cancel request">${icon('close')}</button>`;
    // the group says what it is ("Friend requests"): the row says when (LoL: "2h ago")
    const ago = agoText(r.at);
    const line = dir === 'in' ? ago || 'Friend request' : ago ? `Sent ${ago}` : 'Request sent';
    // round 7: the row's Tab stop is the person, never Accept (Tab then Enter must not accept by accident); ArrowRight
    // reaches Decline, then Accept
    const label = dir === 'in' ? `${r.name}, friend request${ago ? `, ${ago}` : ''}. Arrow right for Decline and Accept` : `${r.name}, request sent${ago ? ` ${ago}` : ''}. Arrow right to cancel it`;
    return `<div class="pl-social-row pl-rq" role="listitem" data-code="${code}"><span class="pl-fr-av">${avatarHtml(r.av, 40)}</span><span class="pl-social-who pl-rq-main" data-a="rq" data-code="${code}" data-nav tabindex="-1" aria-label="${this.esc(label)}"><span class="pl-social-nm"><span class="pl-social-name" data-name="${this.esc(r.name)}"></span></span><small class="pl-social-line"><span class="pl-social-st">${this.esc(line)}</span></small></span><span class="pl-fr-acts is-shown">${acts}</span></div>`;
  }

  /** A recent player: the team and how often we played together ("Teammate · 3 games"), Add as an icon. */
  private recentRow(p: RecentRow): string {
    // round 6: the champion they played in that match, then how often we played together
    const champ = champText(p.hero);
    // "Clem · 3 games" fits the row; the tooltip and label say the rest ("3 games together in the last 7 days")
    const n = typeof p.together === 'number' && p.together > 1 ? p.together : 0;
    const more = [champ, n ? `${n} games` : ''].filter(Boolean).join(' · ');
    const together = more ? `${SEP_HTML}<span class="pl-st-note"${n ? ` title="${n} games together in the last 7 days"` : ''}>${dotsHtml(more)}</span>` : '';
    return `<div class="pl-social-row pl-rc" role="listitem" data-team="${p.team === 'ally' ? 'ally' : 'enemy'}"><span class="pl-fr-av">${avatarHtml(p.av, 40)}</span><span class="pl-social-who"><span class="pl-social-nm"><span class="pl-social-name" data-name="${this.esc(p.name)}"></span></span><small class="pl-social-line"><span class="pl-social-st pl-team">${p.team === 'ally' ? 'Teammate' : 'Opponent'}</span>${together}</small></span><span class="pl-fr-acts is-shown">${p.canAdd ? `<button type="button" class="pl-ico pl-act-2" data-a="add-recent" data-room="${this.esc(p.room)}" data-slot="${p.slot}" aria-label="${this.esc(`Add ${p.name} as a friend`)}" title="Add friend">${icon('addUser')}</button>` : ''}</span></div>`;
  }

  private rankedBody(): string {
    const st = this.ranked.status;
    const me = this.ranked.me;
    if (!st && !me) return `<p class="pl-social-empty">Loading…</p>`;
    const season = st?.season ? `<p class="pl-ranked-season">Ranked · Season ${this.esc(String(st.season.id).replace(/^s/, ''))}${st.season.endsAt ? ` · ends ${this.esc(new Date(st.season.endsAt).toISOString().slice(0, 10))}` : ''}</p>` : '';
    let card = '';
    if (!this.deps.signedIn()) card = `<p class="pl-ranked-line">Sign in to play Ranked</p><button type="button" class="pl-btn small" data-a="signin">Sign in</button>`;
    else if (me?.why === 'matches') card = `<p class="pl-ranked-line">Ranked unlocks after ${me.matches.need} matches · ${me.matches.have}/${me.matches.need}</p>`;
    else if (me?.why === 'locked') card = `<p class="pl-ranked-line">Ranked is locked for now</p>`;
    else if (me?.why === 'pending') card = `<p class="pl-ranked-line">Saving your last ranked match…</p>`;
    else if (me?.ranked?.label) card = `<p class="pl-ranked-tier" data-tier="${this.esc(String(me.ranked.tier))}">${this.esc(rankedLabel(me.ranked.tierIdx, me.ranked.points))}</p><p class="pl-ranked-line">Peak: ${this.esc(String(me.ranked.peak ?? ''))}</p>`;
    else if (me?.ranked) card = `<p class="pl-ranked-line">Placement ${Math.max(0, (me.ranked.placementsOf ?? 5) - (me.ranked.placementsLeft ?? 5))} / ${me.ranked.placementsOf ?? 5}</p>`;
    // round 4 (SOCIAL-RANKED.md §7.11): always open; the searching count and Prime Time when the server sends them
    const parsed = st ? parseRankedStatus(st) : null;
    const prime = primeTimeText(parsed);
    const gate = `<p class="pl-ranked-line" data-testid="ranked-live">Ranked is open · ${this.esc(rankedLiveText(parsed))}${prime && !parsed?.primeTime?.active ? ` · ${this.esc(prime)}` : ''}</p>`;
    return `${season}${card}${gate}<button type="button" class="pl-btn big" data-a="casual">Play Casual</button>`;
  }

  private footer(): string {
    if (this.tab === 'clubs' && this.state?.me.ageBand && this.deps.signedIn()) return this.clubs.footer(this.per);
    if (this.tab === 'friends' && this.short && this.state?.me.ageBand && this.deps.signedIn() && this.state.friends.length) return this.growHint(this.state, true);
    return '';
  }

  private async act(op: ApiOp, args: ApiArgs, ok?: string): Promise<boolean> {
    const r = await this.deps.api(op, args);
    this.note = r.ok ? (ok ?? '') : errorText(r);
    await this.load();
    return r.ok;
  }

  /** Add friend by what was typed: a friend code, else an exact nickname (case-insensitive on the server). */
  private async addByCode(typed?: string): Promise<void> {
    const input = this.root.querySelector<HTMLInputElement>('input[name="code"]');
    const text = (typed ?? input?.value ?? '').trim();
    if (!text) return;
    const byCode = looksLikeCode(text);
    const r = await this.deps.api('friend.add', byCode ? { code: text } : { name: text });
    if (this.disposed) return;
    if (r.ok) {
      this.adding = false;
      this.addText = '';
      this.suggest = null;
      this.deps.track?.('friend_request', { via: byCode ? 'code' : 'name' });
      this.note = (r.body as { state?: string })?.state === 'friends' ? 'You are friends now' : `Request sent to ${byCode ? 'your friend' : text}`;
    } else this.note = errorText(r);
    await this.load();
  }

  /** Nickname suggestions for the typed text (`social.search`); a code or under 2 letters asks nothing. */
  private async findNames(): Promise<void> {
    const q = this.addText.trim();
    if (!this.adding || this.disposed) return;
    if (q.length < 2 || looksLikeCode(q)) {
      this.suggest = null;
      return this.paintSuggest();
    }
    const r = await this.deps.api('social.search', { name: q });
    if (this.disposed || !this.adding || this.addText.trim() !== q) return;
    const rows = r.ok ? ((r.body as { players?: unknown } | undefined)?.players ?? []) : [];
    this.suggest = {
      q,
      rows: (Array.isArray(rows) ? rows : [])
        .filter((x): x is Suggestion => !!x && typeof (x as Suggestion).name === 'string' && (x as Suggestion).name.length <= 40)
        .slice(0, 5)
        .map((x) => ({ name: x.name, ...(isAvatarView(x.av) ? { av: x.av } : {}), ...(typeof x.cc === 'string' && /^[A-Z]{2}$/.test(x.cc) ? { cc: x.cc } : {}), ...(x.rel === 'friend' || x.rel === 'sent' || x.rel === 'asked' ? { rel: x.rel } : {}) })),
    };
    this.paintSuggest();
  }

  /** The suggestions repaint their own box only: the input keeps its text, focus and caret. */
  private paintSuggest(): void {
    const box = this.root.querySelector<HTMLElement>('.pl-social-suggest');
    if (!box || !this.adding || this.tab !== 'friends') return;
    box.innerHTML = this.suggestBody();
    this.fillNames(box);
  }

  private suggestBody(): string {
    const q = this.addText.trim();
    if (!this.suggest || this.suggest.q !== q) return q.length >= 2 && !looksLikeCode(q) ? '' : `<p class="pl-social-hint">Type 2 letters of a name to see players, or a friend code.</p>`;
    if (!this.suggest.rows.length) return `<p class="pl-social-hint" data-testid="social-suggest-none">No player has this name.</p>`;
    const rel = { friend: 'Friends', sent: 'Request sent', asked: 'Wants to be friends' } as const;
    return this.suggest.rows
      .map((p) => {
        const act =
          p.rel === 'friend' || p.rel === 'sent'
            ? ''
            : `<button type="button" class="pl-ico pl-act-2${p.rel === 'asked' ? ' is-accept' : ''}" data-a="add-name" data-nick="${this.esc(p.name)}" aria-label="${this.esc(`${p.rel === 'asked' ? 'Accept' : 'Add'} ${p.name}`)}" title="${p.rel === 'asked' ? 'Accept' : 'Add friend'}">${icon(p.rel === 'asked' ? 'check' : 'addUser', 22)}</button>`;
        return `<div class="pl-social-row pl-rq" data-testid="social-suggest"><span class="pl-fr-av">${avatarHtml(p.av, 40)}</span><span class="pl-social-who"><span class="pl-social-nm"><span class="pl-social-name" data-name="${this.esc(p.name)}"></span>${ccHtmlOrNone(p.cc)}</span>${p.rel ? `<small class="pl-social-line"><span class="pl-social-st">${rel[p.rel]}</span></small>` : ''}</span><span class="pl-fr-acts is-shown">${act}</span></div>`;
      })
      .join('');
  }

  private setTab(tab: SocialTab): void {
    this.tab = tab === 'requests' ? 'friends' : tab;
    this.note = '';
    this.query = '';
    this.menuFor = null;
    this.moreOpen = false;
    this.meOpen = false;
    this.adding = false;
    this.searchOpen = false;
    this.render();
    this.root.querySelector<HTMLElement>(`[role="tab"][data-tab="${this.tab}"], .pl-social-more`)?.focus({ preventScroll: true });
    void this.load();
  }

  private openMenu(code: string, at: { x: number; y: number } | null = null): void {
    this.menuFor = this.menuFor === code ? null : code;
    this.menuAt = this.menuFor ? at : null;
    this.armed = null;
    if (this.menuFor && !this.sheetMenu) {
      // the row in full view first (below the stuck header), then the menu floats by it
      this.root.querySelector<HTMLElement>(`.pl-fr[data-code=${attr(code)}]`)?.scrollIntoView?.({ block: 'nearest' });
      this.clearSliver();
    }
    this.render();
    if (!this.menuFor) return;
    this.root.querySelector<HTMLElement>('.pl-fr-menu .pl-mi:not(:disabled)')?.focus({ preventScroll: true });
  }

  private closeMenu(): void {
    const code = this.menuFor;
    this.menuFor = null;
    this.menuAt = null;
    this.armed = null;
    this.render();
    if (code) this.root.querySelector<HTMLElement>(`.pl-fr-main[data-code=${attr(code)}]`)?.focus({ preventScroll: true });
  }

  /** Close the search: clear the filter, focus Search again. */
  private closeSearch(): void {
    this.searchOpen = false;
    this.query = '';
    this.render();
    this.root.querySelector<HTMLElement>('[data-a="search"]')?.focus({ preventScroll: true });
  }

  /** Close Add a friend: the list as it was, focus on Add. */
  private closeAdd(): void {
    this.adding = false;
    this.addText = '';
    this.suggest = null;
    this.render();
    this.root.querySelector<HTMLElement>('[data-a="add"]')?.focus({ preventScroll: true });
  }

  /** Keyboard: Esc closes the top layer, arrows move between tabs and through the list, Tab stays inside the sheet. */
  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      if (this.menuFor) return this.closeMenu();
      if (this.meOpen) {
        this.meOpen = false;
        this.render();
        this.root.querySelector<HTMLElement>('[data-a="me"]')?.focus({ preventScroll: true });
        return;
      }
      if (this.moreOpen) {
        this.moreOpen = false;
        this.render();
        this.root.querySelector<HTMLElement>('.pl-social-more')?.focus({ preventScroll: true });
        return;
      }
      // round 7: an open DM is the top layer (one Esc never closes the thread and the whole panel at once)
      if (this.chat && !this.chat.closed) return this.closeChatLayer();
      if (t instanceof HTMLInputElement && t.name === 'q' && t.value) {
        this.query = '';
        t.value = '';
        this.paintBody();
        return;
      }
      if (this.searchShown) return this.closeSearch();
      if (this.adding) return this.closeAdd();
      if (this.invite.entering) return void this.invite.act('inv-cancel');
      if (this.invShort) {
        this.invShort = false;
        this.render();
        this.root.querySelector<HTMLElement>('[data-testid="invite-open"]')?.focus({ preventScroll: true });
        return;
      }
      return this.dispose();
    }
    if (t.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const tabs = [...this.root.querySelectorAll<HTMLElement>('[role="tab"]')];
      const i = tabs.indexOf(t);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      e.preventDefault();
      const tab = tabs[n]?.dataset.tab as SocialTab | undefined;
      if (tab) this.setTab(tab);
      return;
    }
    // Enter on a friend's row opens the chat (LoL); Space (a click) opens its menu
    if (e.key === 'Enter' && t.classList.contains('pl-fr-main') && t.dataset.code && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      this.menuFor = null;
      this.openChat(t.dataset.code, 'input');
      return;
    }
    // a request's own Tab stop (the person): Enter and Space do nothing (never accept by accident), and never reach
    // the lobby's own keys behind the sheet
    if ((e.key === 'Enter' || e.key === ' ') && t.classList.contains('pl-rq-main')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // the list by keyboard: arrows step, Home and End jump to the first and last, PageUp and PageDown move a screen
    const listKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'];
    if (listKeys.includes(e.key) && (t.hasAttribute('data-nav') || t.getAttribute('role') === 'menuitem' || t.closest('.pl-fr-acts'))) {
      const inMenu = t.getAttribute('role') === 'menuitem';
      const scope = inMenu ? (t.closest('[role="menu"]') ?? this.root) : this.root;
      const items = [...scope.querySelectorAll<HTMLElement>(inMenu ? '[role="menuitem"]:not(:disabled)' : '[data-nav]')];
      const from = inMenu ? t : (t.closest('.pl-social-row')?.querySelector<HTMLElement>('[data-nav]') ?? t);
      const i = items.indexOf(from);
      const body = this.root.querySelector<HTMLElement>('.pl-social-body');
      const page = Math.max(1, Math.floor((body?.clientHeight ?? 400) / 52) - 1);
      const to =
        e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : i + ({ ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page } as Record<string, number>)[e.key];
      const next = items[Math.max(0, Math.min(items.length - 1, to))];
      if (next) {
        e.preventDefault();
        next.focus({ preventScroll: true });
        // Home and End go to the list's very top and bottom (the first row sits under its group header, never
        // behind it); a step brings the row into view below the stuck header (scroll-margin-top)
        if (!inMenu && body && (e.key === 'Home' || e.key === 'End')) body.scrollTop = e.key === 'Home' ? 0 : body.scrollHeight;
        else (next.closest<HTMLElement>('.pl-social-row') ?? next).scrollIntoView?.({ block: 'nearest' });
        if (!inMenu) this.clearSliver();
      }
      return;
    }
    // across a row: ArrowRight and ArrowLeft step between the row and its shown actions (Decline ↔ Accept on a request)
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && t.closest('.pl-social-body .pl-social-row') && t.getAttribute('role') !== 'menuitem') {
      const row = t.closest('.pl-social-row')!;
      const btns = [...row.querySelectorAll<HTMLElement>('[data-nav], button')].filter((b) => b.getClientRects().length > 0);
      const next = btns[btns.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1)];
      if (next) {
        e.preventDefault();
        next.focus();
      }
      return;
    }
    if (e.key === 'Tab') {
      // the sheet keeps focus while it is open (a dialog); input/tabGuard.ts cancelled it outside a text field
      if (e.defaultPrevented) return;
      const all = [...this.root.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')].filter((el) => !el.closest('[hidden]') && !el.closest('[inert]') && el.getAttribute('tabindex') !== '-1');
      if (!all.length) return;
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && t === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && t === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  private onClick(e: Event): void {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab as SocialTab | undefined;
    if (tab) {
      this.setTab(tab);
      return;
    }
    // a click outside the More menu closes it
    if (this.moreOpen && !t.closest('.pl-social-moremenu, [data-a="tabs-more"]')) {
      this.moreOpen = false;
      this.root.querySelector('.pl-social-moremenu')?.setAttribute('hidden', '');
      this.root.querySelector('.pl-social-more')?.setAttribute('aria-expanded', 'false');
    }
    // a click outside the floating row menu or my status card closes it (the click does nothing else)
    if (this.menuFor && !this.sheetMenu && !t.closest('.pl-fr-menu, [data-a]')) return this.closeMenu();
    if (this.meOpen && !this.sheetMenu && !t.closest('.pl-me-card, [data-a]')) {
      this.meOpen = false;
      this.render();
      return;
    }
    const club = t.closest<HTMLElement>('[data-club]');
    if (club && this.clubs.click(club)) return;
    const age = t.closest<HTMLElement>('[data-age]')?.dataset.age;
    if (age) {
      void this.act('social.age', { ageBand: age });
      return;
    }
    const el = t.closest<HTMLElement>('[data-a]');
    const a = el?.dataset.a;
    if (!a || !el || el.hasAttribute('disabled')) return;
    const code = el.dataset.code ?? '';
    // any action but the row menu's own buttons closes an open row menu
    if (this.menuFor && a !== 'menu' && a !== 'menu-close' && !el.closest('.pl-fr-menu')) this.menuFor = null;
    if (a !== 'remove') this.armed = null;
    if (this.meOpen && a !== 'me' && a !== 'me-close' && a !== 'status' && a !== 'copy' && !el.closest('.pl-me-card')) this.meOpen = false;
    if (a.startsWith('inv-')) {
      // the gift sits in the header on every tab: it opens the card at the top of Friends (never closes it from there)
      const away = this.tab !== 'friends';
      if (away) {
        this.tab = 'friends';
        this.searchOpen = false;
        this.query = '';
        void this.load();
      }
      this.meOpen = false;
      // round 8: a short screen opens the card as a sheet over the list (the list is never buried); it starts folded
      if (a === 'inv-fold' && this.short && (this.state?.friends.length ?? 0) > 0) {
        this.invShort = away ? true : !this.invShort;
        this.render();
        this.root.querySelector<HTMLElement>(this.invShort ? '.pl-inv-sheet [data-testid="invite-copy"]' : '[data-testid="invite-open"]')?.focus({ preventScroll: true });
        return;
      }
      if (a === 'inv-fold' && away && !this.invite.isFolded) return this.render();
      void this.invite.act(a).then(() => {
        if (this.invite.entering) this.root.querySelector<HTMLInputElement>('input[name="invite"]')?.focus();
        else if (a === 'inv-fold') this.root.querySelector<HTMLElement>('.pl-inv-fold, [data-testid="invite-open"]')?.focus({ preventScroll: true });
      });
      return;
    }
    switch (a) {
      case 'close':
        this.dispose();
        return;
      case 'more-below': {
        // the first group below the fold comes to the top of the list (its header, then its rows)
        const body = this.root.querySelector<HTMLElement>('.pl-social-body');
        const g = body?.querySelector<HTMLElement>(`.pl-group-h[data-group=${attr(el.dataset.to ?? '')}]`);
        if (!body || !g) return;
        body.scrollTop += g.getBoundingClientRect().top - body.getBoundingClientRect().top;
        this.scrollCue();
        g.focus({ preventScroll: true });
        return;
      }
      case 'menu-close':
        this.closeMenu();
        return;
      case 'tabs-more': {
        this.moreOpen = !this.moreOpen;
        const m = this.root.querySelector<HTMLElement>('.pl-social-moremenu');
        if (m) m.hidden = !this.moreOpen;
        el.setAttribute('aria-expanded', String(this.moreOpen));
        if (this.moreOpen) m?.querySelector<HTMLElement>('.pl-mi')?.focus({ preventScroll: true });
        return;
      }
      case 'me':
        this.meOpen = !this.meOpen;
        this.moreOpen = false;
        this.invShort = false;
        this.render();
        if (this.meOpen) this.root.querySelector<HTMLElement>('.pl-me-opt[aria-checked="true"]')?.focus({ preventScroll: true });
        return;
      case 'status':
        void this.setStatus(el.dataset.v === 'invisible' ? 'invisible' : el.dataset.v === 'away' ? 'away' : 'online');
        return;
      case 'fav':
        this.menuFor = null;
        void this.setFav(code, el.dataset.on === '1');
        return;
      case 'ask':
        this.menuFor = null;
        void this.askToJoin(code);
        return;
      case 'later': {
        // LoL's in-game invite: queued here, sent when the friend's match or queue ends (laterStep)
        const f = this.state?.friends.find((x) => x.code === code);
        this.menuFor = null;
        if (!f) return;
        LATER.set(code, { name: f.name, at: Date.now() });
        this.deps.track?.('party_invite', { action: 'later' });
        this.note = `${f.name} gets your invite when their ${f.presence.state === 'queue' ? 'queue' : 'match'} ends`;
        this.render();
        this.root.querySelector<HTMLElement>(`.pl-fr-main[data-code=${attr(code)}]`)?.focus({ preventScroll: true });
        return;
      }
      case 'later-cancel':
        this.menuFor = null;
        LATER.delete(code);
        this.note = 'Queued invite cancelled';
        this.render();
        this.root.querySelector<HTMLElement>(`.pl-fr-main[data-code=${attr(code)}]`)?.focus({ preventScroll: true });
        return;
      case 'me-close':
        this.meOpen = false;
        this.render();
        this.root.querySelector<HTMLElement>('[data-a="me"]')?.focus({ preventScroll: true });
        return;
      case 'menu':
      case 'more':
        this.openMenu(code);
        return;
      case 'fold': {
        const g = el.dataset.group as FriendGroupId | undefined;
        if (!g) return;
        this.folds[g] = el.getAttribute('aria-expanded') === 'true';
        try {
          localStorage.setItem(FOLD_KEY, JSON.stringify(this.folds));
        } catch {
          // private window or blocked storage: the fold lasts while the sheet is open
        }
        this.render();
        return;
      }
      case 'signin':
        this.deps.signIn();
        return;
      case 'casual':
        this.dispose();
        this.deps.playCasual();
        return;
      case 'add-name':
        void this.addByCode(el.dataset.nick ?? '');
        return;
      case 'search':
        if (this.searchShown) return this.closeSearch();
        if (this.tab !== 'friends') {
          this.tab = 'friends';
          this.moreOpen = false;
          void this.load();
        }
        this.searchOpen = true;
        this.menuFor = null;
        this.render();
        this.root.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
        return;
      case 'search-close':
        this.closeSearch();
        return;
      case 'add':
      case 'add-empty': {
        if (a === 'add' && this.adding) {
          this.closeAdd();
          return;
        }
        const was = this.tab;
        this.tab = 'friends';
        this.adding = true;
        this.searchOpen = false;
        this.menuFor = null;
        this.meOpen = false;
        this.addText = el.dataset.q ?? '';
        this.suggest = null;
        this.query = '';
        this.render();
        const body = this.root.querySelector<HTMLElement>('.pl-social-body');
        if (body) body.scrollTop = 0;
        this.root.querySelector<HTMLInputElement>('input[name="code"]')?.focus();
        if (this.addText) void this.findNames();
        if (was !== 'friends') void this.load();
        return;
      }
      case 'add-cancel':
        this.closeAdd();
        return;
      case 'copy': {
        const c = this.state?.me.code ?? '';
        void (typeof navigator !== 'undefined' ? navigator.clipboard?.writeText(c) : undefined)?.catch(() => undefined);
        this.note = 'Friend code copied';
        this.render();
        return;
      }
      case 'join': {
        const party = el.dataset.party ?? '';
        if (!party) return;
        this.deps.track?.('party_invite', { action: 'join' });
        this.dispose();
        this.deps.joinParty(party);
        return;
      }
      case 'watch': {
        const room = el.dataset.room ?? '';
        const name = this.state?.friends.find((f) => f.code === code)?.name ?? '';
        if (!ROOM.test(room) || !this.deps.watch) return;
        this.dispose();
        this.deps.watch({ room, name });
        return;
      }
      case 'watch-live':
        if (!this.deps.watch) return;
        this.dispose();
        this.deps.watch({ featured: true });
        return;
      case 'invite': {
        const f = this.state?.friends.find((x) => x.code === code);
        this.menuFor = null;
        if (!this.deps.partyCode()) {
          // SOCIAL-INVITES.md: no party yet: PLAY → a mode → With Friends opens it, then the invite goes out
          if (f && this.deps.inviteFriend) {
            this.deps.track?.('party_invite', { action: 'open_party' });
            this.dispose();
            this.deps.inviteFriend({ code: f.code, name: f.name });
          } else {
            this.note = 'Open a party first: PLAY, a mode, then With Friends.';
            this.render();
          }
          return;
        }
        this.deps.track?.('party_invite', { action: 'sent' });
        void this.sendInvite(code, f?.name ?? '');
        return;
      }
      case 'accept':
        this.deps.track?.('friend_accept');
        void this.act('friend.accept', { code }, 'You are friends now');
        return;
      case 'decline':
        void this.act('friend.decline', { code });
        return;
      case 'add-recent':
        this.deps.track?.('friend_request', { via: 'recent' });
        void this.act('friend.add', { room: el.dataset.room ?? '', slot: Number(el.dataset.slot) }, 'Request sent');
        return;
      case 'history': {
        const name = this.state?.friends.find((f) => f.code === code)?.name ?? '';
        if (!code || !this.deps.history) return;
        this.deps.track?.('friend_history');
        this.dispose();
        this.deps.history({ code, name });
        return;
      }
      case 'chat':
        this.menuFor = null;
        this.openChat(code, this.finePointer ? 'input' : 'head');
        return;
      case 'remove':
        // Remove has no Undo: the first tap arms it, the second (within 4 s) removes
        if (this.armed !== `remove:${code}`) {
          this.armed = `remove:${code}`;
          if (this.armTimer) clearTimeout(this.armTimer);
          this.armTimer = setTimeout(() => {
            this.armed = null;
            this.render();
          }, 4000);
          this.render();
          return;
        }
        this.armed = null;
        this.menuFor = null;
        void this.act('friend.remove', { code }, 'Removed');
        return;
      case 'block':
        this.menuFor = null;
        this.block(code);
        return;
      case 'undo':
        if (this.undo) {
          clearTimeout(this.undo.timer);
          const c = this.undo.code;
          this.undo = null;
          void this.act('block.remove', { code: c }, 'Unblocked');
        }
        return;
    }
  }

  /** Online, Away or Appear offline (`social.me {invisible, away}`): friends see Away or offline. */
  private async setStatus(v: 'online' | 'away' | 'invisible'): Promise<void> {
    const me = this.state?.me;
    const cur = me?.invisible ? 'invisible' : me?.away ? 'away' : 'online';
    if (!this.state || !me || cur === v) {
      this.meOpen = false;
      return this.render();
    }
    const invisible = v === 'invisible';
    const away = v === 'away';
    const r = await this.deps.api('social.me', { invisible, away });
    if (this.disposed) return;
    if (r.ok) {
      const body = r.body as SocialState | undefined;
      if (body?.me && Array.isArray(body.friends)) this.state = body;
      // the 200 confirms the choice: the card shows it even when the answer is an older shape
      Object.assign(this.state.me, { invisible, away });
      this.deps.track?.('social_status', { invisible, away });
      this.note = invisible ? 'You appear offline' : away ? 'You are away' : 'You are online';
    } else this.note = errorText(r);
    this.meOpen = false;
    this.render();
    this.root.querySelector<HTMLElement>('[data-a="me"]')?.focus({ preventScroll: true });
  }

  /** My preset status note (-1: none). The card stays open (the select keeps its focus). */
  private async setNote(n: number): Promise<void> {
    if (!this.state || !Number.isInteger(n)) return;
    const note = n >= 0 && n < STATUS_NOTES.length ? n : -1;
    const r = await this.deps.api('social.me', { note });
    if (this.disposed) return;
    if (r.ok) {
      const body = r.body as SocialState | undefined;
      if (body?.me && Array.isArray(body.friends)) this.state = body;
      this.state.me.note = note < 0 ? null : note;
      this.deps.track?.('social_note', { set: note >= 0 });
      this.note = note < 0 ? 'Status note cleared' : 'Status note set';
    } else this.note = errorText(r);
    this.render();
  }

  /** Pin a friend to Favourites (or unpin): this player's list only, the friend never sees it. */
  private async setFav(code: string, on: boolean): Promise<void> {
    const f = this.state?.friends.find((x) => x.code === code);
    if (!f || !this.state) return;
    // optimistic: the row moves now, a refusal moves it back
    f.fav = on;
    this.render();
    const r = await this.deps.api('social.me', { code, favOn: on });
    if (this.disposed) return;
    const body = r.body as SocialState | undefined;
    if (r.ok && body?.me && Array.isArray(body.friends)) {
      this.state = body;
      const now = body.friends.find((x) => x.code === code);
      if (now) now.fav = on || undefined;
    } else if (!r.ok) f.fav = !on;
    this.note = r.ok ? (on ? `${f.name} pinned to favourites` : `${f.name} unpinned`) : errorText(r);
    this.deps.track?.('friend_fav', { on });
    this.render();
    this.root.querySelector<HTMLElement>(`.pl-fr-main[data-code=${attr(code)}]`)?.focus({ preventScroll: true });
  }

  /**
   * Ask to join a friend's lobby that is not open (LoL's "Ask to join"): a "Wanna play?" phrase in their DM, so they
   * can invite back. No new route: the existing chat ops.
   */
  private async askToJoin(code: string): Promise<void> {
    const f = this.state?.friends.find((x) => x.code === code);
    if (!f) return;
    this.note = `Asking ${f.name}…`;
    this.render();
    const open = await this.deps.api('chat.open', { code });
    const thread = (open.body as { thread?: string } | undefined)?.thread;
    const r = open.ok && thread ? await this.deps.api('chat.send', { thread, k: 'q', pid: ASK_PHRASE }) : open;
    if (this.disposed) return;
    this.deps.track?.('party_invite', { action: 'ask' });
    this.note = r.ok ? `Asked ${f.name} to play. They can invite you.` : errorText(r);
    this.render();
  }

  private block(code: string): void {
    this.deps.track?.('friend_block');
    void this.deps.api('block.add', { code }).then((r) => {
      if (!r.ok) {
        this.note = errorText(r);
        this.render();
        return;
      }
      if (this.undo) clearTimeout(this.undo.timer);
      this.undo = {
        code,
        timer: setTimeout(() => {
          this.undo = null;
          this.root.querySelector('.pl-social-note')?.remove();
        }, 5000),
      };
      this.note = 'Blocked';
      void this.load();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const doc = this.root.ownerDocument;
    const act = doc.activeElement;
    // focus was in the panel or its DM (or already lost): it goes back to the opener, else the lobby's Friends button
    const inside = !act || act === doc.body || this.root.contains(act) || !!this.chat?.root.contains(act);
    if (this.pulseTimer) clearInterval(this.pulseTimer);
    if (this.noteTimer) clearTimeout(this.noteTimer);
    if (this.suggestTimer) clearTimeout(this.suggestTimer);
    if (this.armTimer) clearTimeout(this.armTimer);
    if (this.undo) clearTimeout(this.undo.timer);
    this.chat?.dispose();
    this.unwatch();
    this.root.remove();
    if (inside) {
      const back = this.opener?.isConnected ? this.opener : doc.querySelector<HTMLElement>('[data-testid="lobby-social"]');
      back?.focus({ preventScroll: true });
    }
  }

  /**
   * A relay `chat.notice` (CHAT-AVATARS §5): the open thread fetches now; otherwise the pulse runs now instead of in up
   * to 30 s (one `social.pulse`, 204 when the notice was for a muted thread).
   */
  dmNotice(thread: string): void {
    if (this.disposed) return;
    if (this.chat && !this.chat.closed) {
      if (!thread || this.chat.threadId === thread) this.chat.poke(thread);
      return;
    }
    void this.pulse();
  }

  /** SOCIAL-INVITES.md: an invite with this build's sim; the note says when the friend is offline. */
  private async sendInvite(code: string, name: string): Promise<void> {
    const who = name || 'your friend';
    this.note = `Inviting ${who}…`;
    this.render();
    let r = await this.deps.api('invite.send', { to: code, sim: buildSim(), ...(this.deps.partyMode?.() === 'ranked' ? { mode: 'ranked' } : {}) });
    // a party opened a moment ago: the relay writes its presence within ~5 s, so "no party" is retried a few times
    for (let i = 0; i < INVITE_PARTY_RETRIES && !r.ok && (r.body as { code?: string } | undefined)?.code === 'PAWLEGENDS_SOCIAL_NO_PARTY' && !this.disposed && this.deps.partyCode(); i++) {
      await new Promise((ok) => setTimeout(ok, INVITE_PARTY_RETRY_MS));
      if (this.disposed) return;
      r = await this.deps.api('invite.send', { to: code, sim: buildSim(), ...(this.deps.partyMode?.() === 'ranked' ? { mode: 'ranked' } : {}) });
    }
    if (this.disposed) return;
    const b = r.body as { offline?: boolean; code?: string; id?: string; ttl?: number; busy?: string } | undefined;
    // Nov 19: "sent" only for a stored invite (the server answers its id); the note says what the friend is doing
    if (r.ok && typeof b?.id === 'string') {
      const them = name || 'Your friend';
      this.note = b.offline
        ? `Invite sent. ${them} is offline: they get a notification.`
        : b.busy === 'match'
          ? `Invite sent. ${them} is in a match: they see it when it ends.`
          : b.busy === 'party'
            ? `Invite sent to ${who}. They are in another lobby.`
            : `Invite sent to ${who}`;
      this.deps.onInviteSent?.({ id: b.id, name: them, ttl: typeof b.ttl === 'number' ? b.ttl : 60_000 });
    } else this.note = r.ok ? `Couldn't invite ${who}. Try again.` : errorText(r);
    this.render();
  }

  /** The friend whose DM thread is open (their row is marked while the thread is docked beside the list). */
  private chatCode: string | null = null;
  /** Open conversations (friend codes, oldest first): the thread's tab strip, LoL's stacked chat tabs. */
  private convos: string[] = [];

  /**
   * The thread's tab strip: the open conversations plus every unread, unmuted thread with a friend (a new message
   * is one tap away, no Back first). Empty while only one conversation exists.
   */
  private chatTabs(active: string): ChatTab[] {
    const codes = [...this.convos];
    for (const [c, t] of this.threads) if (t.unread && !t.muted && !codes.includes(c)) codes.push(c);
    const tabs: ChatTab[] = [];
    for (const c of codes) {
      const f = this.state?.friends.find((x) => x.code === c);
      if (!f) continue;
      const t = this.threads.get(c);
      tabs.push({ code: c, name: f.name, av: f.av, state: shownState(f.presence), unread: c === active || !t || t.muted ? 0 : t.unread, active: c === active });
    }
    return tabs.length > 1 ? tabs : [];
  }

  /** A DM to open once the friends list has loaded (the DM toast's Open). */
  private chatWhenLoaded: string | null = null;

  /** A thread opened: its badge, preview and share of the unread total go at once (LoL clears on open). */
  private clearUnread(code: string): void {
    const t = this.threads.get(code);
    if (!t?.unread) return;
    const was = t.unread;
    t.unread = 0;
    if (this.state?.chat && !t.muted) {
      this.state.chat = { ...this.state.chat, unread: Math.max(0, this.state.chat.unread - was) };
      this.deps.onUnread?.(this.state.chat.unread);
    }
  }

  /** A mouse (or trackpad) is the main pointer: opening a DM may focus its input (no on-screen keyboard pops up). */
  private get finePointer(): boolean {
    return !!this.root.ownerDocument.defaultView?.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  }

  /**
   * A thread that covers the list (a phone) makes the list inert: no Tab, click or screen reader lands on the hidden
   * rows behind it. A docked thread leaves the list usable (LoL).
   */
  private coverList(on: boolean): void {
    this.root.inert = on;
    this.root.classList.toggle('is-covered', on);
  }

  /** Esc with a DM open: close the thread only; focus returns to its friend's row (or the tab it came from). */
  private closeChatLayer(): void {
    const chat = this.chat;
    if (!chat || chat.closed) return;
    chat.close('esc');
  }

  /** Open the DM thread with a friend over the sheet (CHAT-AVATARS §6.2); back reloads the unread dots. */
  openChat(code: string, focus: 'input' | 'head' = 'head'): void {
    const f = this.state?.friends.find((x) => x.code === code);
    if (!this.state) {
      this.chatWhenLoaded = code;
      return;
    }
    if (!f || !this.root.parentElement) return;
    this.chat?.dispose();
    const win = this.root.ownerDocument.defaultView;
    // LoL docks chat beside the list: on a wide screen the list stays usable (invite while you chat)
    const docked = !!win && win.innerWidth >= DOCK_MIN_PX;
    this.chatCode = f.code;
    if (!this.convos.includes(f.code)) {
      this.convos.push(f.code);
      // at most MAX_CONVOS tabs: the oldest one (never this one) goes
      if (this.convos.length > MAX_CONVOS) this.convos.splice(this.convos.findIndex((c) => c !== f.code), 1);
    }
    this.clearUnread(f.code);
    this.chat = new ChatSheet(this.root.parentElement, {
      api: (op, args) => this.deps.api(op, args),
      friend: { code: f.code, name: f.name, av: f.av },
      inMatch: () => this.deps.inMatch?.() ?? false,
      track: this.deps.track,
      docked,
      status: () => {
        const now = this.state?.friends.find((x) => x.code === code);
        return now ? { text: presenceText(now.presence), state: now.presence.state } : null;
      },
      unreadElsewhere: () => {
        let n = 0;
        for (const [c, t] of this.threads) if (c !== code && !t.muted) n += t.unread;
        return n;
      },
      tabs: () => this.chatTabs(code),
      autofocus: focus,
      onTab: (c) => {
        if (c !== code) this.openChat(c, focus);
      },
      onClose: (how) => {
        this.chat = null;
        this.chatCode = null;
        this.coverList(false);
        // Close (a docked window's ×) ends this conversation: the next open one takes its place, like LoL's chat
        // tabs; Back (a phone) only returns to the list and keeps the tabs
        if (how === 'close' || (how === 'esc' && docked)) this.convos = this.convos.filter((c) => c !== code);
        if (how === 'close') {
          const next = this.convos[this.convos.length - 1];
          if (next) {
            this.openChat(next, focus);
            return;
          }
        }
        void this.load();
        this.root.querySelector<HTMLElement>(`.pl-fr-main[data-code=${attr(code)}]`)?.focus({ preventScroll: true });
      },
      onBlocked: () => {
        this.note = 'Blocked';
      },
      // round 8: a minimised DM is a bar on the bottom edge under the list; the list keeps room for it
      onMinimise: (on) => this.root.classList.toggle('has-chat-tray', on),
    });
    this.coverList(!docked);
    // the row under (or beside) the thread drops its badge and preview now
    this.render();
  }

  /**
   * Few friends: one quiet line under the list, so the panel is not a lone row over empty space. On a short screen
   * (a phone sideways) it is a bar pinned under the list instead (round 7: always above the fold, however many
   * requests sit on top).
   */
  private growHint(s: SocialState, bar = false): string {
    if (this.query.trim() || this.adding || s.friends.length >= GROW_UNDER) return '';
    const invite = this.invite.state && (this.short ? !this.invShort : this.invite.isFolded) ? `<button type="button" class="pl-btn small ghost" data-a="inv-fold">${icon('gift', 18)}<span>Invite a friend</span></button>` : '';
    if (bar) return `<div class="pl-social-grow is-bar" data-testid="social-grow" role="group" aria-label="More friends, more parties">${`<button type="button" class="pl-btn small ghost" data-a="add-empty">${icon('addUser', 18)}<span>Find a player</span></button>`}${invite}</div>`;
    return `<div class="pl-social-grow" data-testid="social-grow"><small>More friends, more parties. Find players by name or send an invite.</small><div class="pl-grow-acts"><button type="button" class="pl-btn small ghost" data-a="add-empty">${icon('addUser', 18)}<span>Find a player</span></button>${invite}</div></div>`;
  }

  /** The club chat (CLUBS-KUDOS.md §6): the DM thread sheet on the club's thread; Back returns to the Clubs tab. */
  private openClubChat(thread: string, title: string): void {
    if (!this.root.parentElement) return;
    this.chat?.dispose();
    this.chat = new ChatSheet(this.root.parentElement, {
      api: (op, args) => this.deps.api(op, args),
      friend: { code: '', name: title },
      thread,
      inMatch: () => this.deps.inMatch?.() ?? false,
      track: this.deps.track,
      autofocus: this.finePointer ? 'input' : 'head',
      onClose: () => {
        this.chat = null;
        this.coverList(false);
        this.root.querySelector<HTMLElement>('[role="tab"][data-tab="clubs"]')?.focus({ preventScroll: true });
      },
    });
    this.coverList(true);
  }

  /** Switch an open panel to a tab. */
  showTab(tab: SocialTab): void {
    if (this.disposed) return;
    this.setTab(tab);
  }

  get closed(): boolean {
    return this.disposed;
  }
}
