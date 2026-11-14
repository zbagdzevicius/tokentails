/**
 * The Social sheet (docs/plans/moba/SOCIAL-RANKED.md §14.2–§14.4): Friends, Requests, Recent, Ranked and Boards in one
 * right-side sheet over the lobby's 3D half. Phone first and no-scroll: pages of rows (`< 1/3 >`) instead of a scroll,
 * a hide ladder by height, 44 px targets, no confirm dialogs (Block has a 5 s Undo). Names are always set with
 * `textContent`. Every call goes through the host (`api-request`); the game never sees a token, an account id or a URL.
 * Polling: one pulse every 30 s while the sheet or the title is shown and the tab is visible; never in a match.
 */
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { RANKED_OPEN_FALLBACK, rankedLabel } from '../meta/ranked';
import { HERO_IDS } from '../data/heroes';
import { isAvatarView, previewText, type AvatarView } from '../data/chatPhrases';
import { avatarHtml, titleText } from '../ui/avatar';
import { ChatSheet } from './chatSheet';
import { InviteRow } from '../share/invite';
import { ClubsPanel } from './clubs/clubsPanel';

export type SocialTab = 'friends' | 'requests' | 'recent' | 'clubs' | 'ranked' | 'boards';
export const SOCIAL_TABS: readonly SocialTab[] = Object.freeze(['friends', 'requests', 'recent', 'clubs', 'ranked', 'boards']);
const TAB_LABEL: Readonly<Record<SocialTab, string>> = Object.freeze({
  friends: 'Friends',
  requests: 'Requests',
  recent: 'Recent',
  clubs: 'Clubs',
  ranked: 'Ranked',
  boards: 'Boards',
});

export interface Presence {
  state: 'offline' | 'online' | 'party' | 'queue' | 'match';
  joinable?: boolean;
  party?: string;
  /** SPECTATE.md: a watchable live match (absent when the friend keeps matches private, or an older backend). */
  room?: string;
}
export interface FriendRow {
  code: string;
  name: string;
  presence: Presence;
  /** CHAT-AVATARS §7.3: the friend's avatar (absent from an older backend). */
  av?: AvatarView;
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
  invites: { id: string; from: { code: string; name: string }; party: string }[];
  rev: string;
  /** CHAT-AVATARS §4: unread DMs (the Friends tab and the landing badge). */
  chat?: { unread: number; top?: { thread: string; fromName: string; preview: string } };
  /** SPECTATE.md: a featured live match can be watched now (the Friends tab's "Watch live" row). */
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

/** Rows a page shows at a viewport height (§14.2 hide ladder). Pure. */
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
  party: 'In party',
  queue: 'In queue',
  match: 'In match',
});

/**
 * The friend row's one action (§14.2): Join a joinable party, Watch a friend's live match (SPECTATE.md, when the
 * friend lets friends watch and this player is not in a party), Invite when you are in one, else the "…" menu. Pure.
 */
export function rowAction(p: Presence, inParty: boolean): 'join' | 'watch' | 'invite' | 'more' {
  if (p.state === 'party' && p.joinable && p.party) return 'join';
  if (p.state === 'match' && p.room && /^[a-z0-9]{12}$/.test(p.room) && !inParty) return 'watch';
  if (inParty && p.state !== 'offline' && p.state !== 'match') return 'invite';
  return 'more';
}

export interface SocialSheetDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  signedIn(): boolean;
  /** The player's party code when in a friend party lobby (Invite shows), else null. */
  partyCode(): string | null;
  /** Join a friend's party by its code (the existing `party.join`). */
  joinParty(code: string): void;
  /** SPECTATE.md: watch a friend's live match (its room), or the featured live match; absent: no Watch buttons. */
  watch?(target: { room: string; name: string } | { featured: true }): void;
  signIn(): void;
  /** Ranked closed: Play Casual (the PvP queue). */
  playCasual(): void;
  /** Analytics (no names, codes or ids in props). */
  track?(event: string, props?: Record<string, string | number | boolean>): void;
  /** The viewport height (the hide ladder); default window.innerHeight. */
  height?(): number;
  /** Owned store and pass items (frames and titles the avatar picker offers). */
  ownedItems?(): readonly string[];
  /** A match runs: chat polls pause. */
  inMatch?(): boolean;
  /** The unread DM count changed (the landing badge). */
  onUnread?(n: number): void;
}

const errorText = (r: ApiResult): string => {
  const code = (r.body as { code?: string } | undefined)?.code ?? '';
  if (r.status === 0) return 'No connection. Try again';
  if (r.status === 429) return 'Too many tries. Wait a minute';
  if (code === 'PAWLEGENDS_SOCIAL_NOT_FOUND') return 'No player with this code';
  if (code === 'PAWLEGENDS_SOCIAL_SELF') return 'That is your own code';
  if (code === 'PAWLEGENDS_SOCIAL_CAP') return 'Friends list is full';
  if (code === 'PAWLEGENDS_SOCIAL_REFUSED') return 'This player cannot be added';
  if (code === 'PAWLEGENDS_SOCIAL_NO_PARTY') return 'Open a party first';
  return 'Something went wrong. Try again';
};

export class SocialSheet {
  readonly root: HTMLElement;
  private tab: SocialTab = 'friends';
  private page = 0;
  private state: SocialState | null = null;
  private recent: { room: string; slot: number; name: string; team: string; canAdd: boolean; av?: AvatarView }[] | null = null;
  private ranked: { status?: Record<string, any>; me?: Record<string, any> } = {};
  private board: { kind: 'global' | 'friends' | 'weekly'; page: number; data: Record<string, any> | null } = { kind: 'weekly', page: 0, data: null };
  private adding = false;
  private note = '';
  private undo: { code: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  /** DM threads by friend code (unread dots on the rows). */
  private threads = new Map<string, ChatThreadRow>();
  private chat: ChatSheet | null = null;
  /** The avatar picker (Me): its page and the choice not saved yet. */
  private picking: { avatarKind: string; avatarRef: string; frame: string } | null = null;
  /** Invite and comeback codes (share/invite.ts): the first row of the Friends tab. */
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
    this.tab = tab;
    this.root = parent.ownerDocument.createElement('aside');
    this.root.className = 'pl-social';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Friends and ranked');
    this.root.addEventListener('click', (e) => this.onClick(e));
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
    this.invite = new InviteRow({
      api: (op, args) => this.deps.api(op, args),
      render: () => this.render(),
      note: (text) => {
        this.note = text;
      },
      track: (event, props) => this.deps.track?.(event, props),
    });
    parent.appendChild(this.root);
    this.deps.track?.('social_open', { tab });
    this.render();
    void this.load();
    this.pulseTimer = setInterval(() => void this.pulse(), 30_000);
  }

  /** Friend rows per page: one row fewer while the invite row shows, and one fewer for the "Watch live" row. */
  private get friendsPer(): number {
    return Math.max(1, this.per - (this.invite.state || this.invite.entering ? 1 : 0) - (this.liveRow() ? 1 : 0));
  }

  /** SPECTATE.md: the featured live match row (only when one is live and the host can open the viewer). */
  private liveRow(): string {
    if (!this.deps.watch || !this.state?.live?.featured || this.deps.partyCode()) return '';
    return `<div class="pl-social-row pl-social-live" data-testid="social-watch-live"><i class="pl-live-dot" aria-hidden="true"></i><span class="pl-social-who"><b>A match is live</b><small class="pl-social-st">Watch the featured match</small></span><button type="button" class="pl-btn small" data-a="watch-live">Watch live</button></div>`;
  }

  private get per(): number {
    return rowsForHeight(this.deps.height?.() ?? (typeof window !== 'undefined' ? window.innerHeight : 640));
  }

  private async load(): Promise<void> {
    if (this.tab === 'ranked') return this.loadRanked();
    if (this.tab === 'boards') return this.loadBoard();
    if (!this.deps.signedIn()) return this.render();
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
      this.deps.onUnread?.(this.state.chat?.unread ?? 0);
    } else if (!s.ok) this.note = errorText(s);
    if (threads?.ok) {
      this.threads = new Map(((threads.body as { threads?: ChatThreadRow[] })?.threads ?? []).map((t) => [t.with.code, t]));
    }
    this.render();
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
    // add-code field is open: a re-render would wipe what the player is typing.
    const rev = (r.body as { rev?: unknown }).rev;
    if (this.state && typeof rev === 'string') this.state.rev = rev;
    const chat = (r.body as { chat?: SocialState['chat'] }).chat;
    if (chat && typeof chat.unread === 'number') {
      if (this.state) this.state.chat = chat;
      this.deps.onUnread?.(chat.unread);
    }
    if (this.picking) return;
    // an open DM thread polls itself; its Back reloads the list, so nothing renders under it meanwhile
    if (this.chat && !this.chat.closed) return;
    if (this.adding || this.invite.entering || this.tab === 'ranked' || this.tab === 'boards' || this.tab === 'clubs') return;
    await this.load();
  }

  private noteTimer: ReturnType<typeof setTimeout> | null = null;
  private noteShown = '';

  /** A status note fades after 3 s: it sits over the last row and its buttons. */
  private armNote(): void {
    if (!this.note || this.note === this.noteShown) return;
    this.noteShown = this.note;
    if (this.noteTimer) clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => {
      this.noteTimer = null;
      this.note = '';
      this.noteShown = '';
      this.root.querySelector('.pl-social-note')?.remove();
    }, 3000);
  }

  private esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  }

  /** Markup with `data-name` holes; names are filled by textContent after. */
  render(): void {
    if (this.disposed) return;
    const tabs = SOCIAL_TABS.map((t) => {
      const unread = this.state?.chat?.unread ?? 0;
      const badge =
        t === 'requests' && this.state?.requests.in.length
          ? ` <i class="pl-social-badge">${this.state.requests.in.length}</i>`
          : t === 'friends' && unread
            ? ` <i class="pl-social-badge" data-testid="social-unread">${Math.min(99, unread)}</i>`
            : '';
      return `<button type="button" role="tab" class="pl-social-tab" data-tab="${t}" aria-selected="${t === this.tab}">${TAB_LABEL[t]}${badge}</button>`;
    }).join('');
    this.root.innerHTML = `<header class="pl-social-head" role="tablist">${tabs}<button type="button" class="pl-social-x" data-a="close" aria-label="Close">&times;</button></header><div class="pl-social-body">${this.body()}</div><footer class="pl-social-foot">${this.footer()}</footer>${this.note ? `<p class="pl-social-note" role="status">${this.esc(this.note)}</p>` : ''}`;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = el.dataset.name ?? '';
    this.armNote();
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
    if (this.tab === 'friends') {
      // the invite row (share/invite.ts) takes the first row's place
      const inv = this.invite.html() + this.liveRow();
      if (!s.friends.length) return `${inv}<p class="pl-social-empty">No friends yet. Share your code or add theirs.</p>`;
      const { rows } = pageOf(friendOrder(s.friends), this.page, this.friendsPer);
      const inParty = !!this.deps.partyCode();
      return rows
        .map((f) => {
          const act = rowAction(f.presence, inParty);
          const btn =
            act === 'join'
              ? `<button type="button" class="pl-btn small" data-a="join" data-party="${this.esc(f.presence.party ?? '')}">Join</button>`
              : act === 'watch' && this.deps.watch
                ? `<button type="button" class="pl-btn small" data-a="watch" data-room="${this.esc(f.presence.room ?? '')}" data-code="${this.esc(f.code)}" data-testid="social-watch" aria-label="${this.esc(`Watch ${f.name}'s match`)}">Watch</button>`
                : act === 'invite'
                ? `<button type="button" class="pl-btn ghost small" data-a="invite" data-code="${this.esc(f.code)}">Invite</button>`
                : `<button type="button" class="pl-btn ghost small pl-more" data-a="more" data-code="${this.esc(f.code)}" aria-label="More">&hellip;</button>`;
          const t = this.threads.get(f.code);
          const dot = t?.unread && !t.muted ? `<i class="pl-chat-unread" data-testid="chat-unread">${Math.min(99, t.unread)}</i>` : '';
          const chat = `<button type="button" class="pl-btn ghost small pl-chat-btn" data-a="chat" data-code="${this.esc(f.code)}" aria-label="${this.esc(`Chat with ${f.name}${dot ? `, ${t!.unread} unread` : ''}`)}">💬${dot}</button>`;
          const sub = t?.unread && !t.muted ? `<small class="pl-social-st pl-social-preview" data-name="${this.esc(previewText(t.lastPreview))}"></small>` : `<small class="pl-social-st">${PRESENCE_TEXT[f.presence.state]}</small>`;
          return `<div class="pl-social-row" data-state="${f.presence.state}" data-code="${this.esc(f.code)}">${avatarHtml(f.av, 40)}<i class="pl-dot" data-state="${f.presence.state}"></i><span class="pl-social-who"><span class="pl-social-name" data-name="${this.esc(f.name)}"></span>${sub}</span>${btn}${chat}</div>`;
        })
        .reduce((html, row) => html + row, inv);
    }
    if (this.tab === 'requests') {
      const list = [...s.requests.in.map((r) => ({ ...r, dir: 'in' as const })), ...s.requests.out.map((r) => ({ ...r, dir: 'out' as const }))];
      if (!list.length) return `<p class="pl-social-empty">No requests.</p>`;
      const { rows } = pageOf(list, this.page, this.per);
      return rows
        .map((r) =>
          r.dir === 'in'
            ? `<div class="pl-social-row">${avatarHtml(r.av, 40)}<span class="pl-social-name" data-name="${this.esc(r.name)}"></span><button type="button" class="pl-btn small" data-a="accept" data-code="${this.esc(r.code)}">Accept</button><button type="button" class="pl-btn ghost small" data-a="decline" data-code="${this.esc(r.code)}">Decline</button></div>`
            : `<div class="pl-social-row">${avatarHtml(r.av, 40)}<span class="pl-social-name" data-name="${this.esc(r.name)}"></span><small class="pl-social-st">Sent</small><button type="button" class="pl-btn ghost small" data-a="decline" data-code="${this.esc(r.code)}">Cancel</button></div>`,
        )
        .join('');
    }
    // recent
    const rec = this.recent;
    if (!rec) return `<p class="pl-social-empty">Loading…</p>`;
    if (!rec.length) return `<p class="pl-social-empty">Players from your matches in the last 7 days show here.</p>`;
    const { rows } = pageOf(rec, this.page, this.per);
    return rows
      .map(
        (p) =>
          `<div class="pl-social-row">${avatarHtml(p.av, 40)}<span class="pl-social-name" data-name="${this.esc(p.name)}"></span><small class="pl-social-st">${p.team === 'ally' ? 'Teammate' : 'Opponent'}</small>${p.canAdd ? `<button type="button" class="pl-btn ghost small" data-a="add-recent" data-room="${this.esc(p.room)}" data-slot="${p.slot}" aria-label="Add friend">+</button>` : ''}</div>`,
      )
      .join('');
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
    const open = !!st?.open;
    const gate = open
      ? `<p class="pl-ranked-line">Ranked is open · ${Number(st?.online ?? 0)} players online</p>`
      : `<p class="pl-ranked-line">Ranked opens at ${Number(st?.need ?? RANKED_OPEN_FALLBACK)} players online · ${Number(st?.online ?? 0)} online now</p>`;
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
    const rows = ((d.rows ?? []) as { rank: number; name: string; value: number; tier?: string; me?: boolean; av?: AvatarView }[]).slice(0, this.per + 1);
    const list = rows.length
      ? rows
          .map(
            (r) =>
              `<div class="pl-social-row${r.me ? ' me' : ''}"><b class="pl-rank">${r.rank}</b>${isAvatarView(r.av) ? avatarHtml(r.av, 32) : ''}<span class="pl-social-name" data-name="${this.esc(String(r.name))}"></span><small class="pl-social-st">${r.tier ? this.esc(r.tier) : `${r.value} wins`}</small></div>`,
          )
          .join('')
      : `<p class="pl-social-empty">${d.error ? this.esc(String(d.error)) : 'No one here yet this week.'}</p>`;
    const me = d.me ? `<div class="pl-social-row me"><b class="pl-rank">#${Number(d.me.rank)}</b><span>You</span><small class="pl-social-st">${Number(d.me.value)}</small></div>` : '';
    return `<div class="pl-social-sub">${sub}</div>${list}${me}`;
  }

  private footer(): string {
    const pages =
      this.tab === 'boards'
        ? Math.max(1, Number(this.board.data?.pages ?? 1))
        : this.tab === 'friends'
          ? pageOf(this.state?.friends ?? [], 0, this.friendsPer).pages
          : this.tab === 'requests'
            ? pageOf([...(this.state?.requests.in ?? []), ...(this.state?.requests.out ?? [])], 0, this.per).pages
            : this.tab === 'recent'
              ? pageOf(this.recent ?? [], 0, this.per).pages
              : 1;
    const page = this.tab === 'boards' ? this.board.page : Math.min(this.page, pages - 1);
    const pager = pages > 1 ? `<span class="pl-pager"><button type="button" class="pl-btn ghost small" data-a="prev" aria-label="Previous page"${page <= 0 ? ' disabled' : ''}>&lsaquo;</button><small>${page + 1}/${pages}</small><button type="button" class="pl-btn ghost small" data-a="next" aria-label="Next page"${page >= pages - 1 ? ' disabled' : ''}>&rsaquo;</button></span>` : '';
    if (this.picking)
      return `<button type="button" class="pl-btn ghost small" data-a="pick-cancel">Cancel</button><button type="button" class="pl-btn small" data-a="pick-save" data-testid="avatar-save">Save</button>`;
    if (this.tab === 'clubs' && this.state?.me.ageBand && this.deps.signedIn()) return this.clubs.footer(this.per);
    if (this.tab !== 'friends' || !this.state || !this.deps.signedIn() || !this.state.me.ageBand) return pager;
    if (this.adding)
      return `<form class="pl-social-add"><input name="code" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="PL-XXXX-XXXX" aria-label="Friend code" inputmode="text"><button type="submit" class="pl-btn small">Add</button><button type="button" class="pl-btn ghost small" data-a="add-cancel" aria-label="Cancel">&times;</button></form>`;
    return `${pager}<button type="button" class="pl-me-av" data-a="avatar" aria-label="My avatar" data-testid="avatar-open">${avatarHtml(this.state.me.av, 40)}</button><span class="pl-social-code">My code <b>${this.esc(this.state.me.code)}</b></span><button type="button" class="pl-btn ghost small" data-a="copy">Copy</button><button type="button" class="pl-btn small" data-a="add">Add</button>`;
  }

  private async act(op: ApiOp, args: ApiArgs, ok?: string): Promise<boolean> {
    const r = await this.deps.api(op, args);
    this.note = r.ok ? (ok ?? '') : errorText(r);
    await this.load();
    return r.ok;
  }

  private async addByCode(): Promise<void> {
    const input = this.root.querySelector<HTMLInputElement>('input[name="code"]');
    const code = (input?.value ?? '').trim();
    if (!code) return;
    const r = await this.deps.api('friend.add', { code });
    if (r.ok) {
      this.adding = false;
      this.deps.track?.('friend_request', { via: 'code' });
      this.note = (r.body as { state?: string })?.state === 'friends' ? 'You are friends now' : 'Request sent';
    } else this.note = errorText(r);
    await this.load();
  }

  private onClick(e: Event): void {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>('[data-tab]')?.dataset.tab as SocialTab | undefined;
    if (tab) {
      this.tab = tab;
      this.page = 0;
      this.note = '';
      this.render();
      void this.load();
      return;
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
    if (a.startsWith('inv-')) {
      void this.invite.act(a).then(() => {
        if (this.invite.entering) this.root.querySelector<HTMLInputElement>('input[name="invite"]')?.focus();
      });
      return;
    }
    switch (a) {
      case 'close':
        this.dispose();
        return;
      case 'signin':
        this.deps.signIn();
        return;
      case 'casual':
        this.dispose();
        this.deps.playCasual();
        return;
      case 'prev':
      case 'next':
        if (this.tab === 'boards') {
          this.board.page = Math.max(0, this.board.page + (a === 'next' ? 1 : -1));
          void this.loadBoard();
        } else {
          this.page = Math.max(0, this.page + (a === 'next' ? 1 : -1));
          this.render();
        }
        return;
      case 'add':
        this.adding = true;
        this.render();
        this.root.querySelector<HTMLInputElement>('input[name="code"]')?.focus();
        return;
      case 'add-cancel':
        this.adding = false;
        this.render();
        return;
      case 'copy': {
        const c = this.state?.me.code ?? '';
        void (typeof navigator !== 'undefined' ? navigator.clipboard?.writeText(c) : undefined)?.catch(() => undefined);
        this.note = 'Code copied';
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
        if (!/^[a-z0-9]{12}$/.test(room) || !this.deps.watch) return;
        this.dispose();
        this.deps.watch({ room, name });
        return;
      }
      case 'watch-live':
        if (!this.deps.watch) return;
        this.dispose();
        this.deps.watch({ featured: true });
        return;
      case 'invite':
        this.deps.track?.('party_invite', { action: 'sent' });
        void this.act('invite.send', { to: code }, 'Invite sent');
        return;
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
      case 'more':
        this.moreMenu(el, code);
        return;
      case 'chat':
        this.openChat(code);
        return;
      case 'avatar':
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
        void this.act('friend.remove', { code }, 'Removed');
        return;
      case 'block':
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

  /** The "…" row menu: Remove, Block (no confirm; Block has a 5 s Undo). */
  private moreMenu(anchor: HTMLElement, code: string): void {
    const row = anchor.closest<HTMLElement>('.pl-social-row');
    if (!row) return;
    row.querySelector('.pl-social-menu')?.remove();
    const m = row.ownerDocument.createElement('span');
    m.className = 'pl-social-menu';
    m.innerHTML = `<button type="button" class="pl-btn ghost small" data-a="remove" data-code="${this.esc(code)}">Remove</button><button type="button" class="pl-btn ghost small" data-a="block" data-code="${this.esc(code)}">Block</button>`;
    row.appendChild(m);
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
      this.undo = { code, timer: setTimeout(() => (this.undo = null), 5000) };
      this.note = '';
      void this.load().then(() => {
        const foot = this.root.querySelector('.pl-social-foot');
        if (foot && this.undo) foot.insertAdjacentHTML('afterbegin', '<span class="pl-social-undo">Blocked <button type="button" class="pl-btn ghost small" data-a="undo">Undo</button></span>');
      });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pulseTimer) clearInterval(this.pulseTimer);
    if (this.noteTimer) clearTimeout(this.noteTimer);
    if (this.undo) clearTimeout(this.undo.timer);
    this.chat?.dispose();
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

  /** Open the DM thread with a friend over the sheet (CHAT-AVATARS §6.2); back reloads the unread dots. */
  openChat(code: string): void {
    const f = this.state?.friends.find((x) => x.code === code);
    if (!f || !this.root.parentElement) return;
    this.chat?.dispose();
    this.chat = new ChatSheet(this.root.parentElement, {
      api: (op, args) => this.deps.api(op, args),
      friend: { code: f.code, name: f.name, av: f.av },
      inMatch: () => this.deps.inMatch?.() ?? false,
      track: this.deps.track,
      onClose: () => {
        this.chat = null;
        void this.load();
      },
      onBlocked: () => {
        this.note = 'Blocked';
      },
    });
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
    this.note = "Couldn't save that avatar";
    this.render();
  }

  get closed(): boolean {
    return this.disposed;
  }
}

/** "Mira invites you to a party · Join" (§14.6): 44 px, 30 s, one at a time. Names by textContent. */
export function inviteToast(doc: Document, from: string, onJoin: () => void, ms = 30_000): HTMLElement {
  doc.querySelector('.pl-invite-toast')?.remove();
  const el = doc.createElement('div');
  el.className = 'pl-invite-toast pl-report-toast';
  el.setAttribute('role', 'status');
  const text = doc.createElement('span');
  text.textContent = `${from} invites you to a party`;
  const join = doc.createElement('button');
  join.type = 'button';
  join.className = 'pl-btn small';
  join.textContent = 'Join';
  join.addEventListener('click', () => {
    el.remove();
    onJoin();
  });
  el.append(text, join);
  doc.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}
