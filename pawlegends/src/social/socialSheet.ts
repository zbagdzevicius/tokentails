/**
 * The Social sheet (docs/plans/moba/SOCIAL-RANKED.md §14.2–§14.4, social sidebar redesign Nov 18): a right-side panel
 * over the lobby's 3D half, built like a game client's friends list (League of Legends' social panel is the bar).
 *
 * - One header: three tabs (Friends with one badge for unread DMs and requests, Recent, Clubs), a More menu for Ranked
 *   and Leaderboards (not friend-list content), and Close. Arrow keys move between tabs; Esc closes the top layer.
 * - Friends: search your friends and Add (a name or a friend code, with nickname suggestions), the invite card (folds
 *   to one line), then collapsible groups with counts: Requests, Online, In match, Offline, Sent. The list scrolls (one
 *   scroll region) instead of the old 3-to-5-row pages.
 * - A friend row: avatar with a presence ring and dot, the full name (ellipsis only when it cannot fit; the title and
 *   the row menu show it whole), the flag, and a status line that never disappears (an unread message is added after
 *   it). Quick actions are small icon buttons: with a mouse they show on hover and keyboard focus; on touch only the one
 *   that matters shows (Join, Invite or Watch; Chat when unread). Tapping the row, right-click or a long press opens
 *   its menu: Message, Match history, Remove (tap twice) and Block (5 s Undo).
 *
 * Names are always set with `textContent`. Every call goes through the host (`api-request`); the game never sees a
 * token, an account id or a URL. Polling: one pulse every 30 s while the sheet or the title is shown and the tab is
 * visible; never in a match.
 */
import { rememberAgeBand } from './ageBand';
import { ccHtmlOrNone } from './flags';
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { parseRankedStatus, primeTimeText, rankedLabel, rankedLiveText } from '../meta/ranked';
import { HERO_IDS } from '../data/heroes';
import { isAvatarView, previewText, type AvatarView } from '../data/chatPhrases';
import { avatarHtml, titleText } from '../ui/avatar';
import { ChatSheet } from './chatSheet';
import { InviteRow } from '../share/invite';
import { ClubsPanel } from './clubs/clubsPanel';
import { buildSim } from './inviteInbox';
import { icon } from './socialIcons';
import './socialSheet.css';

export type SocialTab = 'friends' | 'requests' | 'recent' | 'clubs' | 'ranked' | 'boards';
export const SOCIAL_TABS: readonly SocialTab[] = Object.freeze(['friends', 'requests', 'recent', 'clubs', 'ranked', 'boards']);
/** The tabs in the header; Requests is a group at the top of Friends (LoL style), Ranked and Boards sit under More. */
export const MAIN_TABS = Object.freeze(['friends', 'recent', 'clubs'] as const);
export const MORE_TABS = Object.freeze(['ranked', 'boards'] as const);
const TAB_LABEL: Readonly<Record<SocialTab, string>> = Object.freeze({
  friends: 'Friends',
  requests: 'Requests',
  recent: 'Recent',
  clubs: 'Clubs',
  ranked: 'Ranked',
  boards: 'Leaderboards',
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
}
export interface FriendRow {
  code: string;
  name: string;
  presence: Presence;
  /** CHAT-AVATARS §7.3: the friend's avatar (absent from an older backend). */
  av?: AvatarView;
  /** FLAGS.md: the friend's country flag (absent: hidden, unknown or an older backend). */
  cc?: string;
}
export interface PersonRow {
  code: string;
  name: string;
  av?: AvatarView;
}
export interface SocialState {
  me: {
    code: string;
    name: string;
    invisible: boolean;
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
  const rank = (p: Presence) => (p.state === 'party' && p.joinable ? 0 : ({ party: 1, queue: 2, online: 3, match: 4, offline: 5 } as const)[p.state]);
  return [...list].sort((a, b) => rank(a.presence) - rank(b.presence) || a.name.localeCompare(b.name));
}

/** The friend groups (LoL style): Online (online, in a lobby or a queue), In match, Offline; each in friendOrder. Pure. */
export type FriendGroupId = 'requests' | 'online' | 'match' | 'offline' | 'sent';
export function friendGroups(list: readonly FriendRow[]): { id: 'online' | 'match' | 'offline'; rows: FriendRow[] }[] {
  const sorted = friendOrder(list);
  return [
    { id: 'online' as const, rows: sorted.filter((f) => f.presence.state === 'online' || f.presence.state === 'party' || f.presence.state === 'queue') },
    { id: 'match' as const, rows: sorted.filter((f) => f.presence.state === 'match') },
    { id: 'offline' as const, rows: sorted.filter((f) => f.presence.state === 'offline') },
  ];
}

/**
 * Is a group folded? The player's own choice wins; by default Sent is folded, Offline folds once friends are online
 * and more than 6 are offline, and on a short screen (a phone held sideways) Requests folds to its one header row
 * ("Friend requests 2") while friends are online: the people you can play with stay on the first screen. Pure.
 */
export function groupFolded(id: FriendGroupId, choice: boolean | undefined, counts: { on: number; off: number }, short = false): boolean {
  if (typeof choice === 'boolean') return choice;
  if (id === 'sent') return true;
  if (id === 'offline') return counts.on > 0 && counts.off > 6;
  if (id === 'requests') return short && counts.on > 0;
  return false;
}

/** A short screen (a phone held sideways): the invite card and my own row fold into the tools row. */
export const SHORT_PX = 500;
/** A wide screen: a DM thread docks beside the list instead of covering it. */
export const DOCK_MIN_PX = 1100;

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

export const PRESENCE_TEXT: Readonly<Record<Presence['state'], string>> = Object.freeze({
  offline: 'Offline',
  online: 'Online',
  // SOCIAL-INVITES.md: LoL's words (a friend in a party is in its lobby)
  party: 'In lobby',
  queue: 'In queue',
  match: 'In match',
});

const ROOM = /^[a-z0-9]{12}$/;

const MODE_TEXT: Readonly<Record<string, string>> = Object.freeze({ ranked: 'Ranked', casual: 'Casual', pvp: 'Casual', bots: 'Vs bots', practice: 'Practice', custom: 'Custom' });

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
  const parts: string[] = [PRESENCE_TEXT[p.state]];
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
 * The friend row's one action (§14.2, SOCIAL-INVITES.md): in a party, Invite any friend not already in it (LoL style;
 * an offline friend gets the invite as a notification and the inviter is told they are offline); out of one, Join a friend's joinable party, Watch a friend's live match (SPECTATE.md, when the
 * friend lets friends watch), Invite an online friend (the party opens through PLAY first: the one play path), else the
 * row menu only. `myParty`: this player's party code, or null. Pure.
 */
export function rowAction(p: Presence, inParty: boolean, myParty: string | null = null): 'join' | 'watch' | 'invite' | 'more' {
  const online = p.state === 'online' || p.state === 'party' || p.state === 'queue';
  if (inParty) return p.state !== 'match' && !(myParty && p.party === myParty) ? 'invite' : 'more';
  if (p.state === 'party' && p.joinable && p.party) return 'join';
  if (p.state === 'match' && p.room && ROOM.test(p.room)) return 'watch';
  return online ? 'invite' : 'more';
}

/** A typed friend code (`PL-7KQ2-M9XR`, any case, with or without dashes); anything else is a nickname. */
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
  /** Owned store and pass items (frames and titles the avatar picker offers). */
  ownedItems?(): readonly string[];
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
  private recent: { room: string; slot: number; name: string; team: string; canAdd: boolean; av?: AvatarView }[] | null = null;
  private ranked: { status?: Record<string, any>; me?: Record<string, any> } = {};
  private board: { kind: 'global' | 'friends' | 'weekly'; page: number; data: Record<string, any> | null } = { kind: 'weekly', page: 0, data: null };
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
  /** My status card (Online / Appear offline, my code, Change avatar). */
  private meOpen = false;
  private readonly unwatch: () => void;
  private armed: string | null = null;
  private armTimer: ReturnType<typeof setTimeout> | null = null;
  private folds = readFolds();
  private note = '';
  private undo: { code: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  /** DM threads by friend code (unread dots on the rows). */
  private threads = new Map<string, ChatThreadRow>();
  private chat: ChatSheet | null = null;
  /** The avatar picker (Me): its page and the choice not saved yet. */
  private picking: { avatarKind: string; avatarRef: string; frame: string } | null = null;
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
    this.root = parent.ownerDocument.createElement('aside');
    this.root.className = 'pl-social';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Friends');
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    // right-click, or a long press on touch, opens a friend's row menu
    this.root.addEventListener('contextmenu', (e) => {
      const row = (e.target as HTMLElement).closest?.<HTMLElement>('.pl-fr');
      if (!row?.dataset.code) return;
      e.preventDefault();
      if (this.menuFor !== row.dataset.code) this.openMenu(row.dataset.code);
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
        return;
      }
      // Add friend: nickname suggestions while typing (300 ms after the last key, 2 letters at least)
      if (input?.name !== 'code') return;
      this.addText = input.value;
      if (this.suggestTimer) clearTimeout(this.suggestTimer);
      this.suggestTimer = setTimeout(() => void this.findNames(), 300);
    });
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
    const onShort = () => this.render();
    mq?.addEventListener?.('change', onShort);
    this.unwatch = () => mq?.removeEventListener?.('change', onShort);
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
    if (this.tab === 'boards') return this.loadBoard();
    if (!this.deps.signedIn()) {
      rememberAgeBand(null);
      return this.render();
    }
    if (this.tab === 'friends') void this.invite.load();
    if (this.tab === 'recent') {
      const r = await this.deps.api('social.recent');
      this.recent = r.ok ? ((r.body as { players?: SocialSheet['recent'] })?.players ?? []) : [];
    }
    const [s, threads] = await Promise.all([
      this.deps.api('social.get'),
      this.tab === 'friends' ? this.deps.api('chat.list') : Promise.resolve(null),
      this.tab === 'clubs' ? this.clubs.load() : Promise.resolve(),
    ]);
    if (s.ok && s.body) {
      this.state = s.body as SocialState;
      rememberAgeBand(this.state.me?.ageBand);
      this.deps.onUnread?.(this.state.chat?.unread ?? 0);
    } else if (!s.ok) this.note = errorText(s);
    if (threads?.ok) {
      this.threads = new Map(((threads.body as { threads?: ChatThreadRow[] })?.threads ?? []).map((t) => [t.with.code, t]));
    }
    this.render();
    const want = this.chatWhenLoaded;
    this.chatWhenLoaded = null;
    if (want && this.state && !this.disposed) this.openChat(want);
  }

  private async loadRanked(): Promise<void> {
    const [status, me] = await Promise.all([this.deps.api('ranked.status'), this.deps.signedIn() ? this.deps.api('ranked.me') : Promise.resolve(null)]);
    this.ranked = { status: status.ok ? (status.body as Record<string, any>) : undefined, me: me?.ok ? (me.body as Record<string, any>) : undefined };
    const st = this.ranked.status;
    this.deps.track?.('ranked_view', { state: !this.deps.signedIn() ? 'locked' : st?.open ? 'open' : 'closed' });
    this.render();
  }

  private async loadBoard(): Promise<void> {
    const b = this.board;
    if (b.kind === 'friends' && !this.deps.signedIn()) b.kind = 'weekly';
    const args: ApiArgs = { kind: b.kind, page: b.page, ...(this.deps.signedIn() ? { name: 'me' } : {}) };
    const r = await this.deps.api('board.get', args);
    b.data = r.ok ? (r.body as Record<string, any>) : { rows: [], error: errorText(r) };
    this.deps.track?.('board_view', { kind: b.kind });
    this.render();
  }

  /** The pulse (§4.3): 204 while nothing changed, else refetch. Paused in hidden tabs. */
  async pulse(): Promise<void> {
    if (this.disposed || !this.deps.signedIn()) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const r = await this.deps.api('social.pulse', this.state?.rev ? { rev: this.state.rev } : {});
    if (!r.ok || r.status === 204 || !r.body) return;
    // keep the rev current on every tab (the Ranked and Boards tabs never refetch `social.get`, so without this every
    // later pulse would answer "changed" again), and refetch only the lists that show friends' state. Never while the
    // add field is open: a re-render would wipe what the player is typing.
    const rev = (r.body as { rev?: unknown }).rev;
    if (this.state && typeof rev === 'string') this.state.rev = rev;
    const chat = (r.body as { chat?: SocialState['chat'] }).chat;
    if (chat && typeof chat.unread === 'number') {
      if (this.state) this.state.chat = chat;
      this.deps.onUnread?.(chat.unread);
    }
    if (this.picking) return;
    // an open DM thread polls itself; its Back reloads the list, so nothing renders under it meanwhile
    if (this.chat && !this.chat.closed && !this.chat.docked) return;
    if (this.adding || this.meOpen || this.invite.entering || this.tab === 'ranked' || this.tab === 'boards' || this.tab === 'clubs') return;
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
    const sel = ['data-a', 'data-tab', 'data-code', 'data-group', 'data-board', 'data-age', 'role']
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
    this.invite.autoFold = this.short || (this.state?.friends.length ?? 0) >= 5;
    this.root.innerHTML = `${this.head()}${this.meRow()}${this.tools()}${this.meCard()}<div class="pl-social-body" id="pl-social-panel" role="tabpanel" aria-label="${TAB_LABEL[this.shownTab]}">${this.body()}</div>${note}${foot ? `<footer class="pl-social-foot">${foot}</footer>` : ''}`;
    this.fillNames(this.root);
    const body = this.root.querySelector<HTMLElement>('.pl-social-body');
    if (body && scroll) body.scrollTop = scroll;
    if (focus) {
      const el = this.root.querySelector<HTMLElement>(focus.sel);
      el?.focus({ preventScroll: true });
      if (el instanceof HTMLInputElement && focus.caret !== undefined) el.setSelectionRange(focus.caret, focus.caret);
    }
    this.armNote();
  }

  /** Names by textContent; a name that can be cut by an ellipsis carries its full text as a tooltip. */
  private fillNames(scope: HTMLElement): void {
    for (const el of scope.querySelectorAll<HTMLElement>('[data-name]')) {
      el.textContent = el.dataset.name ?? '';
      if (el.classList.contains('pl-social-name')) el.title = el.dataset.name ?? '';
    }
  }

  /** Repaint the list only (the search): the header keeps its focus, caret and the typed text. */
  private paintBody(): void {
    const body = this.root.querySelector<HTMLElement>('.pl-social-body');
    if (!body) return;
    body.innerHTML = this.body();
    this.fillNames(body);
  }

  private head(): string {
    const unread = this.state?.chat?.unread ?? 0;
    const asks = this.state?.requests.in.length ?? 0;
    const tabs = MAIN_TABS.map((t) => {
      const n = t === 'friends' ? unread + asks : 0;
      const what = [unread ? `${unread} unread` : '', asks ? `${asks} ${asks === 1 ? 'request' : 'requests'}` : ''].filter(Boolean).join(', ');
      const badge = n ? `<i class="pl-social-badge" data-testid="social-unread" aria-hidden="true">${Math.min(99, n)}</i>` : '';
      const on = this.shownTab === t;
      const label = n ? ` aria-label="${TAB_LABEL[t]}, ${what}"` : '';
      return `<button type="button" role="tab" class="pl-social-tab" id="pl-social-tab-${t}" data-tab="${t}" aria-selected="${on}" aria-controls="pl-social-panel" tabindex="${on ? 0 : -1}"${label}><span>${TAB_LABEL[t]}</span>${badge}</button>`;
    }).join('');
    const inMore = (MORE_TABS as readonly SocialTab[]).includes(this.shownTab);
    const more = `<button type="button" class="pl-social-more${inMore ? ' is-current' : ''}" data-a="tabs-more" aria-haspopup="menu" aria-expanded="${this.moreOpen}" aria-label="More: Ranked and leaderboards"><span>${inMore ? (this.shownTab === 'boards' ? 'Boards' : TAB_LABEL[this.shownTab]) : 'More'}</span>${icon('chevron', 16)}</button>`;
    const menu = `<div class="pl-social-moremenu" role="menu" aria-label="More"${this.moreOpen ? '' : ' hidden'}>${MORE_TABS.map((t) => `<button type="button" role="menuitem" class="pl-mi" data-tab="${t}" aria-current="${this.shownTab === t}">${TAB_LABEL[t]}</button>`).join('')}</div>`;
    return `<header class="pl-social-head"><div class="pl-social-tabs" role="tablist" aria-label="Social">${tabs}</div>${more}<button type="button" class="pl-social-x" data-a="close" aria-label="Close" title="Close (Esc)">${icon('close', 20)}</button>${menu}</header>`;
  }

  /** A short screen (a phone held sideways, ≤ 500 px): my row and the invite card fold into the tools row. */
  private get short(): boolean {
    return (this.deps.height?.() ?? (typeof window !== 'undefined' ? window.innerHeight : 640)) <= SHORT_PX;
  }

  /** The Friends tools can show (signed in, age asked, not picking an avatar). */
  private get friendsTools(): boolean {
    return this.shownTab === 'friends' && this.deps.signedIn() && !!this.state?.me.ageBand && !this.picking;
  }

  /** My status word ("Online" or "Appear offline") and its presence state for the dot. */
  private myStatus(): { text: string; state: Presence['state'] } {
    return this.state?.me.invisible ? { text: 'Appear offline', state: 'offline' } : { text: 'Online', state: 'online' };
  }

  /** My avatar with my status dot (the same ring and dot as a friend's row). */
  private myAvatar(size: number): string {
    const st = this.myStatus().state;
    return `<span class="pl-fr-av" data-state="${st}">${avatarHtml(this.state?.me.av, size as 32)}<i class="pl-dot" data-state="${st}"></i></span>`;
  }

  /** LoL's top block: me (avatar, name, status ▾) on a tall screen; it opens my status card. */
  private meRow(): string {
    if (!this.friendsTools || this.short || this.adding) return '';
    const me = this.state!.me;
    const st = this.myStatus();
    return `<div class="pl-me-row"><button type="button" class="pl-me" data-a="me" data-testid="social-me" aria-haspopup="true" aria-expanded="${this.meOpen}" aria-controls="pl-me-card" aria-label="${this.esc(`${me.name}, ${st.text}. Status, friend code and avatar`)}">${this.myAvatar(36)}<span class="pl-social-who"><span class="pl-social-nm"><span class="pl-social-name" data-name="${this.esc(me.name)}"></span></span><small class="pl-social-line"><span class="pl-social-st" data-state="${st.state}">${st.text}</span>${icon('chevron', 14)}</small></span></button></div>`;
  }

  /** My status card (under the tools, in the flow): Online or Appear offline, my friend code, Change avatar. */
  private meCard(): string {
    if (!this.meOpen || !this.friendsTools || this.adding) return '';
    const me = this.state!.me;
    const radio = (v: 'online' | 'invisible', text: string, sub: string) => {
      const on = v === 'invisible' ? me.invisible : !me.invisible;
      const st = v === 'invisible' ? 'offline' : 'online';
      return `<button type="button" role="radio" class="pl-mi pl-me-opt" data-a="status" data-v="${v}" aria-checked="${on}"><i class="pl-dot" data-state="${st}"></i><span><b>${text}</b><small>${sub}</small></span>${on ? icon('check', 18) : ''}</button>`;
    };
    return `<div class="pl-me-card" id="pl-me-card" data-testid="social-me-card"><p class="pl-me-card-name" data-name="${this.esc(me.name)}"></p><div role="radiogroup" aria-label="My status">${radio('online', 'Online', 'Friends see you and can invite you')}${radio('invisible', 'Appear offline', 'You still see your friends')}</div><div class="pl-me-card-acts"><button type="button" class="pl-mi" data-a="copy" aria-label="${this.esc(`Copy your friend code ${me.code}`)}">${icon('copy', 18)}<span>Friend code <b class="pl-me-code">${this.esc(me.code)}</b></span></button><button type="button" class="pl-mi" data-a="avatar" data-testid="avatar-open">${icon('friends', 18)}<span>Change avatar</span></button></div></div>`;
  }

  /** The Friends tools under the header: search, the live match, the invite (folded on a short screen) and Add. */
  private tools(): string {
    const s = this.state;
    if (!this.friendsTools || !s) return '';
    if (this.adding)
      return `<form class="pl-social-add pl-social-tools" data-form="add"><button type="button" class="pl-ico" data-a="add-cancel" aria-label="Back to friends" title="Back">${icon('close', 20)}</button><input name="code" maxlength="24" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Name or PL-XXXX-XXXX" aria-label="Friend's name or code" inputmode="text" enterkeyhint="send" data-testid="social-add-input" value="${this.esc(this.addText)}"><button type="submit" class="pl-btn small" data-testid="social-add-send">Add</button></form>`;
    const short = this.short;
    const me = short
      ? `<button type="button" class="pl-me-av" data-a="me" data-testid="social-me" aria-haspopup="true" aria-expanded="${this.meOpen}" aria-controls="pl-me-card" aria-label="${this.esc(`${s.me.name}, ${this.myStatus().text}. Status, friend code and avatar`)}" title="Me">${this.myAvatar(32)}</button>`
      : '';
    // SPECTATE.md: the featured live match is a chip here (never a row that pushes friends down)
    const live =
      this.deps.watch && s.live?.featured && !this.deps.partyCode()
        ? `<button type="button" class="pl-live-chip" data-a="watch-live" data-testid="social-watch-live" aria-label="Watch the featured live match" title="Watch a live match"><i class="pl-live-dot" aria-hidden="true"></i><span>Live</span></button>`
        : '';
    const gift =
      short && this.invite.isFolded && this.invite.state
        ? `<button type="button" class="pl-ico pl-ico-gift" data-a="inv-fold" data-testid="invite-open" aria-expanded="false" aria-label="Invite friends: your invite code" title="Invite friends">${icon('gift', 22)}</button>`
        : '';
    return `<div class="pl-social-tools">${me}<label class="pl-social-search">${icon('search', 18)}<input type="search" name="q" autocomplete="off" spellcheck="false" placeholder="${short ? 'Search' : 'Search friends'}" aria-label="Search friends" enterkeyhint="search" value="${this.esc(this.query)}"></label>${live}${gift}<button type="button" class="pl-ico pl-ico-add" data-a="add" aria-label="Add a friend" title="Add a friend">${icon('addUser', 22)}</button></div>`;
  }

  private guestPanel(): string {
    return `<div class="pl-social-empty"><p>Sign in to add friends and see who's online.</p><button type="button" class="pl-btn small" data-a="signin">Sign in</button></div>`;
  }

  private agePanel(): string {
    return `<div class="pl-social-empty"><p>How old are you? We ask once.</p><div class="pl-social-age"><button type="button" class="pl-btn ghost small" data-age="under16">Under 16</button><button type="button" class="pl-btn ghost small" data-age="16-17">16 or 17</button><button type="button" class="pl-btn ghost small" data-age="18+">18 or older</button></div><button type="button" class="pl-social-later" data-a="close">Not now</button></div>`;
  }

  private body(): string {
    if (this.tab === 'ranked') return this.rankedBody();
    if (this.tab === 'boards') return this.boardBody();
    if (!this.deps.signedIn()) return this.guestPanel();
    const s = this.state;
    if (!s) return `<p class="pl-social-empty">Loading…</p>`;
    if (!s.me.ageBand) return this.agePanel();
    if (this.picking) return this.pickerBody();
    if (this.tab === 'clubs') return this.clubs.body(this.per);
    if (this.tab === 'recent') return this.recentBody();
    if (this.adding) return this.addBody();
    return this.friendsBody(s);
  }

  private friendsBody(s: SocialState): string {
    const typed = this.query.trim();
    const q = typed.toLowerCase();
    const hit = (n: string) => !q || n.toLowerCase().includes(q);
    const friends = s.friends.filter((f) => hit(f.name));
    const asks = s.requests.in.filter((r) => hit(r.name));
    const sent = s.requests.out.filter((r) => hit(r.name));
    // the invite card: on a short screen only when unfolded (folded, it is the gift in the tools row)
    const top = q || (this.short && this.invite.isFolded) ? '' : this.invite.html();
    if (!s.friends.length && !s.requests.in.length && !s.requests.out.length) return `${top}${this.emptyFriends()}`;
    if (q && !friends.length && !asks.length && !sent.length)
      return `<div class="pl-social-empty pl-social-none" data-testid="social-search-none"><span class="pl-none-art" aria-hidden="true">${icon('search', 28)}</span><p>No friend matches "<span data-name="${this.esc(typed)}"></span>".</p><small>Look for this name among all players.</small><button type="button" class="pl-btn small cta" data-a="add-empty" data-q="${this.esc(typed)}">${icon('addUser', 18)}<span>Find this player</span></button></div>`;
    const myParty = this.deps.partyCode();
    const groups = friendGroups(friends);
    const counts = { on: groups[0].rows.length + groups[1].rows.length, off: groups[2].rows.length };
    const now = Date.now();
    let html = top;
    if (asks.length) html += this.group('requests', asks.length, counts, asks.map((r) => this.requestRow(r, 'in')).join(''));
    for (const g of groups) if (g.rows.length) html += this.group(g.id, g.rows.length, counts, g.rows.map((f) => this.friendRow(f, myParty, now)).join(''));
    if (sent.length) html += this.group('sent', sent.length, counts, sent.map((r) => this.requestRow(r, 'out')).join(''));
    return html;
  }

  /** No friends yet: what to do (no second Add button: Add sits in the tools row), and players from recent matches. */
  private emptyFriends(): string {
    const rec = (this.recent ?? []).filter((p) => p.canAdd).slice(0, 3);
    if (this.recent === null && this.deps.signedIn()) void this.loadRecentForEmpty();
    const recent = rec.length
      ? `<p class="pl-social-hint pl-none-sub">From your recent matches</p><div class="pl-group-list" role="list">${rec.map((p) => this.recentRow(p)).join('')}</div>`
      : '';
    const share = this.invite.state ? `<button type="button" class="pl-btn small cta" data-a="inv-share">${icon('share', 18)}<span>Share invite link</span></button>` : '';
    return `<div class="pl-social-empty pl-social-none" data-testid="social-empty"><span class="pl-none-art" aria-hidden="true">${icon('friends', 32)}</span><p>No friends yet</p><small>Tap ${icon('addUser', 16)} above to add someone by name or friend code, or share your invite link.</small>${share}</div>${recent}`;
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

  /** A collapsible group: a header button with a count, then its rows (none while folded; a search unfolds all). */
  private group(id: FriendGroupId, n: number, counts: { on: number; off: number }, rows: string): string {
    const open = !!this.query.trim() || !groupFolded(id, this.folds[id], counts, this.short);
    return `<section class="pl-group" data-g="${id}"><button type="button" class="pl-group-h" data-a="fold" data-group="${id}" data-nav aria-expanded="${open}" aria-controls="pl-g-${id}" aria-label="${this.esc(`${GROUP_LABEL[id]}, ${n}`)}">${icon('chevron', 16)}<span class="pl-group-t">${GROUP_LABEL[id]}</span><span class="pl-group-n">${n}</span></button>${open ? `<div class="pl-group-list" id="pl-g-${id}" role="list">${rows}</div>` : ''}</section>`;
  }

  /**
   * A friend row. The trailing actions sit in two fixed columns: Chat, then the row's one action flush right (Join
   * filled bolt, Invite to party or Watch as icons), so every icon lines up down the list.
   */
  private friendRow(f: FriendRow, myParty: string | null, now = Date.now()): string {
    const act = rowAction(f.presence, !!myParty, myParty);
    const name = f.name;
    const st = presenceText(f.presence, now);
    const t = this.threads.get(f.code);
    const unread = t?.unread && !t.muted ? t.unread : 0;
    const code = this.esc(f.code);
    const primary =
      act === 'join'
        ? `<button type="button" class="pl-ico pl-act-2 is-primary" data-a="join" data-party="${this.esc(f.presence.party ?? '')}" data-code="${code}" data-testid="social-join" aria-label="${this.esc(`Join ${name}'s lobby`)}" title="Join lobby">${icon('join', 20)}</button>`
        : act === 'watch' && this.deps.watch
          ? `<button type="button" class="pl-ico pl-act-2" data-a="watch" data-room="${this.esc(f.presence.room ?? '')}" data-code="${code}" data-testid="social-watch" aria-label="${this.esc(`Watch ${name}'s match`)}" title="Watch match">${icon('eye')}</button>`
          : act === 'invite'
            ? `<button type="button" class="pl-ico pl-act-2" data-a="invite" data-code="${code}" data-testid="social-invite" aria-label="${this.esc(`Invite ${name} to your party`)}" title="Invite to party">${icon('party', 22)}</button>`
            : '';
    const chat = `<button type="button" class="pl-ico pl-act-1 pl-chat-btn${unread ? ' is-unread' : ''}" data-a="chat" data-code="${code}" aria-label="${this.esc(`Chat with ${name}${unread ? `, ${unread} unread` : ''}`)}" title="Message"><span class="pl-ic">${icon('chat')}${unread ? `<i class="pl-chat-unread" data-testid="chat-unread">${Math.min(99, unread)}</i>` : ''}</span></button>`;
    const preview = unread ? `<small class="pl-social-msg" data-name="${this.esc(previewText(t!.lastPreview))}"></small>` : '';
    const open = this.menuFor === f.code;
    const label = `${name}, ${st}${unread ? `, ${unread} unread` : ''}`;
    const chatting = this.chatCode === f.code && !!this.chat && !this.chat.closed;
    return `<div class="pl-social-row pl-fr${open ? ' is-open' : ''}${unread ? ' has-msg' : ''}${chatting ? ' is-chat' : ''}" role="listitem" data-state="${f.presence.state}" data-code="${code}"><button type="button" class="pl-fr-main" data-a="menu" data-code="${code}" data-nav aria-haspopup="menu" aria-expanded="${open}" aria-label="${this.esc(label)}"><span class="pl-fr-av" data-state="${f.presence.state}">${avatarHtml(f.av, 40)}<i class="pl-dot" data-state="${f.presence.state}"></i></span><span class="pl-social-who"><span class="pl-social-nm"><span class="pl-social-name" data-name="${this.esc(name)}"></span>${ccHtmlOrNone(f.cc)}</span><small class="pl-social-line"><span class="pl-social-st" data-state="${f.presence.state}">${this.esc(st)}</span></small>${preview}</span></button><span class="pl-fr-acts">${chat}${primary}</span></div>${open ? this.rowMenu(f, act) : ''}`;
  }

  /** A friend's row menu (under the row, in the list's flow: nothing covers another row). */
  private rowMenu(f: FriendRow, act: ReturnType<typeof rowAction>): string {
    const code = this.esc(f.code);
    const mi = (a: string, ic: string, text: string, extra = '') => `<button type="button" role="menuitem" class="pl-mi" data-a="${a}" data-code="${code}"${extra}>${icon(ic, 18)}<span>${text}</span></button>`;
    const first =
      act === 'join'
        ? mi('join', 'join', 'Join lobby', ` data-party="${this.esc(f.presence.party ?? '')}"`)
        : act === 'watch' && this.deps.watch
          ? mi('watch', 'eye', 'Watch match', ` data-room="${this.esc(f.presence.room ?? '')}"`)
          : act === 'invite'
            ? mi('invite', 'party', 'Invite to party')
            : '';
    const armed = this.armed === `remove:${f.code}`;
    const remove = `<button type="button" role="menuitem" class="pl-mi danger${armed ? ' armed' : ''}" data-a="remove" data-code="${code}">${icon('remove', 18)}<span>${armed ? 'Tap again to remove' : 'Remove friend'}</span></button>`;
    return `<div class="pl-fr-menu" role="menu" aria-label="${this.esc(`${f.name}: options`)}"><div class="pl-fr-menu-h"><p class="pl-fr-menu-name" data-name="${this.esc(f.name)}"></p><small>${this.esc(presenceText(f.presence))}</small></div><div class="pl-fr-menu-acts">${first}${mi('chat', 'chat', 'Message')}${this.deps.history ? mi('history', 'history', 'Match history') : ''}</div><div class="pl-fr-menu-danger">${remove}${mi('block', 'block', 'Block').replace('class="pl-mi"', 'class="pl-mi danger"')}</div></div>`;
  }

  /** A request row: Accept (a check) and Decline (a cross) as icons in the same two columns as a friend's actions. */
  private requestRow(r: PersonRow, dir: 'in' | 'out'): string {
    const code = this.esc(r.code);
    const acts =
      dir === 'in'
        ? `<button type="button" class="pl-ico pl-act-1 is-accept" data-a="accept" data-code="${code}" aria-label="${this.esc(`Accept ${r.name}`)}" title="Accept">${icon('check', 22)}</button><button type="button" class="pl-ico pl-act-2" data-a="decline" data-code="${code}" aria-label="${this.esc(`Decline ${r.name}`)}" title="Decline">${icon('close')}</button>`
        : `<button type="button" class="pl-ico pl-act-2" data-a="decline" data-code="${code}" aria-label="${this.esc(`Cancel the request to ${r.name}`)}" title="Cancel request">${icon('close')}</button>`;
    return `<div class="pl-social-row pl-rq" role="listitem" data-code="${code}"><span class="pl-fr-av">${avatarHtml(r.av, 40)}</span><span class="pl-social-who"><span class="pl-social-nm"><span class="pl-social-name" data-name="${this.esc(r.name)}"></span></span><small class="pl-social-line"><span class="pl-social-st">${dir === 'in' ? 'Wants to be friends' : 'Request sent'}</span></small></span><span class="pl-fr-acts is-shown">${acts}</span></div>`;
  }

  /** A recent player: the team and when ("Teammate"), Add as an icon in the Chat column. */
  private recentRow(p: NonNullable<SocialSheet['recent']>[number]): string {
    return `<div class="pl-social-row pl-rc" role="listitem" data-team="${p.team === 'ally' ? 'ally' : 'enemy'}"><span class="pl-fr-av">${avatarHtml(p.av, 40)}</span><span class="pl-social-who"><span class="pl-social-nm"><span class="pl-social-name" data-name="${this.esc(p.name)}"></span></span><small class="pl-social-line"><span class="pl-social-st pl-team">${p.team === 'ally' ? 'Teammate' : 'Opponent'}</span></small></span><span class="pl-fr-acts is-shown">${p.canAdd ? `<button type="button" class="pl-ico pl-act-2" data-a="add-recent" data-room="${this.esc(p.room)}" data-slot="${p.slot}" aria-label="${this.esc(`Add ${p.name} as a friend`)}" title="Add friend">${icon('addUser')}</button>` : ''}</span></div>`;
  }

  private recentBody(): string {
    const rec = this.recent;
    if (!rec) return `<p class="pl-social-empty">Loading…</p>`;
    if (!rec.length) return `<div class="pl-social-empty pl-social-none"><span class="pl-none-art" aria-hidden="true">${icon('history', 28)}</span><p>No recent players yet</p><small>Players from your matches in the last 7 days show here.</small></div>`;
    return `<p class="pl-social-hint">From your matches in the last 7 days</p><div class="pl-group-list" role="list">${rec.map((p) => this.recentRow(p)).join('')}</div>`;
  }

  /** Add friend: my own friend code to share, then the nickname suggestions. */
  private addBody(): string {
    const me = this.state?.me;
    const mine = me
      ? `<div class="pl-social-mycode"><span><small>Your friend code</small><strong>${this.esc(me.code)}</strong></span><button type="button" class="pl-btn small ghost" data-a="copy" aria-label="${this.esc(`Copy your friend code ${me.code}`)}">${icon('copy', 16)}<span>Copy</span></button></div>`
      : '';
    return `${mine}<div class="pl-social-suggest">${this.suggestBody()}</div>`;
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

  private boardBody(): string {
    const b = this.board;
    const sub = (['weekly', 'global', 'friends'] as const)
      .filter((k) => k !== 'friends' || this.deps.signedIn())
      .map((k) => `<button type="button" class="pl-btn ghost small" data-board="${k}" aria-pressed="${b.kind === k}">${k === 'weekly' ? 'Weekly' : k === 'global' ? 'Global' : 'Friends'}</button>`)
      .join('');
    const d = b.data;
    if (!d) return `<div class="pl-social-sub">${sub}</div><p class="pl-social-empty">Loading…</p>`;
    // the list scrolls: every row the server sent shows (the old page cut the last one behind the footer)
    const rows = (d.rows ?? []) as { rank: number; name: string; value: number; tier?: string; me?: boolean; av?: AvatarView; cc?: string }[];
    const list = rows.length
      ? rows
          .map(
            (r) =>
              `<div class="pl-social-row pl-bd${r.me ? ' me' : ''}"><b class="pl-rank">${r.rank}</b>${isAvatarView(r.av) ? avatarHtml(r.av, 32) : ''}<span class="pl-social-nm"><span class="pl-social-name" data-name="${this.esc(String(r.name))}"></span>${ccHtmlOrNone(r.cc)}</span><small class="pl-social-st">${r.tier ? this.esc(r.tier) : `${r.value} wins`}</small></div>`,
          )
          .join('')
      : `<p class="pl-social-empty">${d.error ? this.esc(String(d.error)) : 'No one here yet this week.'}</p>`;
    const me = d.me ? `<div class="pl-social-row pl-bd me"><b class="pl-rank">#${Number(d.me.rank)}</b><span class="pl-social-nm">You</span><small class="pl-social-st">${Number(d.me.value)}</small></div>` : '';
    return `<div class="pl-social-sub">${sub}</div>${list}${me}`;
  }

  private footer(): string {
    if (this.picking)
      return `<button type="button" class="pl-btn ghost small" data-a="pick-cancel">Cancel</button><button type="button" class="pl-btn small" data-a="pick-save" data-testid="avatar-save">Save</button>`;
    if (this.tab === 'clubs' && this.state?.me.ageBand && this.deps.signedIn()) return this.clubs.footer(this.per);
    if (this.tab !== 'boards') return '';
    const pages = Math.max(1, Number(this.board.data?.pages ?? 1));
    const page = this.board.page;
    return pages > 1
      ? `<span class="pl-pager"><button type="button" class="pl-btn ghost small" data-a="prev" aria-label="Previous page"${page <= 0 ? ' disabled' : ''}>&lsaquo;</button><small>${page + 1}/${pages}</small><button type="button" class="pl-btn ghost small" data-a="next" aria-label="Next page"${page >= pages - 1 ? ' disabled' : ''}>&rsaquo;</button></span>`
      : '';
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
    if (!this.suggest || this.suggest.q !== q) return `<p class="pl-social-hint">Type a friend's name or their friend code.</p>`;
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
    this.render();
    this.root.querySelector<HTMLElement>(`[role="tab"][data-tab="${this.tab}"], .pl-social-more`)?.focus({ preventScroll: true });
    void this.load();
  }

  private openMenu(code: string): void {
    this.menuFor = this.menuFor === code ? null : code;
    this.armed = null;
    this.render();
    if (!this.menuFor) return;
    const menu = this.root.querySelector<HTMLElement>('.pl-fr-menu');
    menu?.scrollIntoView?.({ block: 'nearest' });
    menu?.querySelector<HTMLElement>('.pl-mi')?.focus({ preventScroll: true });
  }

  private closeMenu(): void {
    const code = this.menuFor;
    this.menuFor = null;
    this.armed = null;
    this.render();
    if (code) this.root.querySelector<HTMLElement>(`.pl-fr-main[data-code=${attr(code)}]`)?.focus({ preventScroll: true });
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
      if (t instanceof HTMLInputElement && t.name === 'q' && t.value) {
        this.query = '';
        t.value = '';
        this.paintBody();
        return;
      }
      if (this.adding) {
        this.adding = false;
        this.addText = '';
        this.suggest = null;
        this.render();
        this.root.querySelector<HTMLElement>('[data-a="add"]')?.focus({ preventScroll: true });
        return;
      }
      if (this.invite.entering) return void this.invite.act('inv-cancel');
      if (this.picking) {
        this.picking = null;
        return this.render();
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
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (t.hasAttribute('data-nav') || t.getAttribute('role') === 'menuitem' || t.closest('.pl-fr-acts'))) {
      const inMenu = t.getAttribute('role') === 'menuitem';
      const scope = inMenu ? (t.closest('[role="menu"]') ?? this.root) : this.root;
      const items = [...scope.querySelectorAll<HTMLElement>(inMenu ? '[role="menuitem"]' : '[data-nav]')];
      const from = inMenu ? t : (t.closest('.pl-fr')?.querySelector<HTMLElement>('[data-nav]') ?? t);
      const i = items.indexOf(from);
      const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        e.preventDefault();
        next.focus();
        next.scrollIntoView?.({ block: 'nearest' });
      }
      return;
    }
    if (e.key === 'ArrowRight' && t.classList.contains('pl-fr-main')) {
      const act = t.parentElement?.querySelector<HTMLElement>('.pl-fr-acts button');
      if (act) {
        e.preventDefault();
        act.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && t.closest('.pl-fr-acts')) {
      e.preventDefault();
      t.closest('.pl-fr')?.querySelector<HTMLElement>('.pl-fr-main')?.focus();
      return;
    }
    if (e.key === 'Tab') {
      // the sheet keeps focus while it is open (a dialog)
      const all = [...this.root.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')].filter((el) => !el.closest('[hidden]') && el.getAttribute('tabindex') !== '-1');
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
    const board = t.closest<HTMLElement>('[data-board]')?.dataset.board as 'weekly' | 'global' | 'friends' | undefined;
    if (board) {
      this.board = { kind: board, page: 0, data: null };
      this.render();
      void this.loadBoard();
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
    if (this.menuFor && a !== 'menu' && !el.closest('.pl-fr-menu')) this.menuFor = null;
    if (a !== 'remove') this.armed = null;
    if (this.meOpen && a !== 'me' && a !== 'status' && a !== 'copy' && !el.closest('.pl-me-card')) this.meOpen = false;
    if (a.startsWith('inv-')) {
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
        this.render();
        if (this.meOpen) this.root.querySelector<HTMLElement>('.pl-me-opt[aria-checked="true"]')?.focus({ preventScroll: true });
        return;
      case 'status':
        void this.setInvisible(el.dataset.v === 'invisible');
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
      case 'prev':
      case 'next':
        this.board.page = Math.max(0, this.board.page + (a === 'next' ? 1 : -1));
        void this.loadBoard();
        return;
      case 'add-name':
        void this.addByCode(el.dataset.nick ?? '');
        return;
      case 'add':
      case 'add-empty':
        this.tab = 'friends';
        this.adding = true;
        this.addText = el.dataset.q ?? '';
        this.suggest = null;
        this.query = '';
        this.render();
        this.root.querySelector<HTMLInputElement>('input[name="code"]')?.focus();
        if (this.addText) void this.findNames();
        return;
      case 'add-cancel':
        this.adding = false;
        this.addText = '';
        this.suggest = null;
        this.render();
        this.root.querySelector<HTMLElement>('[data-a="add"]')?.focus({ preventScroll: true });
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
        this.openChat(code);
        return;
      case 'avatar':
        this.meOpen = false;
        this.openPicker();
        return;
      case 'pick-icon':
        if (this.picking) {
          this.picking.avatarKind = el.dataset.kind ?? 'hero';
          this.picking.avatarRef = el.dataset.ref ?? '';
        }
        this.render();
        return;
      case 'pick-frame':
        if (this.picking) this.picking.frame = el.dataset.frame ?? 'none';
        this.render();
        return;
      case 'pick-cancel':
        this.picking = null;
        this.render();
        return;
      case 'pick-save':
        void this.saveAvatar();
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

  /** Appear offline (friends see you offline; `social.me {invisible}`), or Online again. */
  private async setInvisible(invisible: boolean): Promise<void> {
    if (!this.state || this.state.me.invisible === invisible) {
      this.meOpen = false;
      return this.render();
    }
    const r = await this.deps.api('social.me', { invisible });
    if (this.disposed) return;
    if (r.ok) {
      const body = r.body as SocialState | undefined;
      if (body?.me && Array.isArray(body.friends)) this.state = body;
      else this.state.me.invisible = invisible;
      this.deps.track?.('social_status', { invisible });
      this.note = invisible ? 'You appear offline' : 'You are online';
    } else this.note = errorText(r);
    this.meOpen = false;
    this.render();
    this.root.querySelector<HTMLElement>('[data-a="me"]')?.focus({ preventScroll: true });
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
    if (this.pulseTimer) clearInterval(this.pulseTimer);
    if (this.noteTimer) clearTimeout(this.noteTimer);
    if (this.suggestTimer) clearTimeout(this.suggestTimer);
    if (this.armTimer) clearTimeout(this.armTimer);
    if (this.undo) clearTimeout(this.undo.timer);
    this.chat?.dispose();
    this.unwatch();
    this.root.remove();
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
    const b = r.body as { offline?: boolean; code?: string; id?: string; ttl?: number } | undefined;
    if (r.ok) {
      this.note = b?.offline ? `Invite sent. ${name || 'Your friend'} is offline: they get a notification.` : `Invite sent to ${who}`;
      if (typeof b?.id === 'string') this.deps.onInviteSent?.({ id: b.id, name: name || 'Your friend', ttl: typeof b.ttl === 'number' ? b.ttl : 60_000 });
    } else this.note = errorText(r);
    this.render();
  }

  /** The friend whose DM thread is open (their row is marked while the thread is docked beside the list). */
  private chatCode: string | null = null;

  /** A DM to open once the friends list has loaded (the DM toast's Open). */
  private chatWhenLoaded: string | null = null;

  /** Open the DM thread with a friend over the sheet (CHAT-AVATARS §6.2); back reloads the unread dots. */
  openChat(code: string): void {
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
      onClose: () => {
        this.chat = null;
        this.chatCode = null;
        void this.load();
        this.root.querySelector<HTMLElement>(`.pl-fr-main[data-code=${attr(code)}]`)?.focus({ preventScroll: true });
      },
      onBlocked: () => {
        this.note = 'Blocked';
      },
    });
    if (docked) this.render();
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
      onClose: () => {
        this.chat = null;
      },
    });
  }

  private openPicker(): void {
    const me = this.state?.me;
    if (!me) return;
    const a = me.avatar;
    // NO-TOKENTAILS.md (Your call 4): a cat avatar chosen earlier keeps showing, but the picker offers champions only
    this.picking = {
      avatarKind: a?.kind === 'icon' ? 'icon' : 'hero',
      avatarRef: a?.kind === 'icon' ? (a.icon ?? '') : (a?.hero ?? (me.av?.i.startsWith('h:') ? me.av.i.slice(2) : 'clem')),
      frame: me.frame ?? 'none',
    };
    this.deps.track?.('avatar_open');
    this.render();
  }

  /** The preview of the choice not saved yet. */
  private pickedView(): AvatarView {
    const p = this.picking!;
    const v: AvatarView = { i: `h:${p.avatarRef || 'clem'}` };
    if (p.frame !== 'none') v.f = p.frame;
    const t = this.state?.me.title;
    if (t) v.t = t;
    return v;
  }

  /** Avatar picker (CHAT-AVATARS §7.4): champions (the one scroll region), owned borders, a live preview. */
  private pickerBody(): string {
    const p = this.picking!;
    const tiles = HERO_IDS.map((h) => `<button type="button" class="pl-av-tile" data-a="pick-icon" data-kind="hero" data-ref="${h}" aria-pressed="${p.avatarKind === 'hero' && p.avatarRef === h}" aria-label="${this.esc(h)}">${avatarHtml({ i: `h:${h}` }, 40)}</button>`).join('');
    const frames = ['none', ...(this.deps.ownedItems?.() ?? []).filter((i) => /^frame\.(store|s1)\.[a-z0-9._-]+$|^frame\.(legend|founder)$/.test(i))].slice(0, 7);
    const ring = frames
      .map((f) => `<button type="button" class="pl-av-tile" data-a="pick-frame" data-frame="${this.esc(f)}" aria-pressed="${p.frame === f}" aria-label="${f === 'none' ? 'No border' : this.esc(f)}">${avatarHtml({ i: `h:${p.avatarKind === 'hero' ? p.avatarRef || 'clem' : 'clem'}`, ...(f !== 'none' ? { f } : {}) }, 32)}</button>`)
      .join('');
    const title = this.state?.me.title ? `<small class="pl-social-st">${this.esc(titleText(this.state.me.title))}</small>` : '';
    return `<div class="pl-av-pick" data-testid="avatar-picker"><div class="pl-av-preview">${avatarHtml(this.pickedView(), 56)}<span class="pl-social-name" data-name="${this.esc(this.state?.me.name ?? '')}"></span>${title}</div><div class="pl-av-grid">${tiles}</div><div class="pl-av-frames" aria-label="Border">${ring}</div></div>`;
  }

  private async saveAvatar(): Promise<void> {
    const p = this.picking;
    if (!p) return;
    const r = await this.deps.api('social.me', { avatarKind: p.avatarKind, avatarRef: p.avatarRef, frame: p.frame });
    if (r.ok) {
      this.picking = null;
      this.deps.track?.('avatar_save', { kind: p.avatarKind });
      this.note = 'Avatar saved';
      if (r.body) this.state = r.body as SocialState;
      this.render();
      return;
    }
    this.note = "Couldn't save your avatar. Try again.";
    this.render();
  }

  get closed(): boolean {
    return this.disposed;
  }
}
