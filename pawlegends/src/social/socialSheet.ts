/**
 * The Social sheet (docs/plans/moba/SOCIAL-RANKED.md §14.2–§14.4): Friends, Requests, Recent, Ranked and Boards in one
 * right-side sheet over the lobby's 3D half. Phone first and no-scroll: pages of rows (`< 1/3 >`) instead of a scroll,
 * a hide ladder by height, 44 px targets, no confirm dialogs (Block has a 5 s Undo). Names are always set with
 * `textContent`. Every call goes through the host (`api-request`); the game never sees a token, an account id or a URL.
 * Polling: one pulse every 30 s while the sheet or the title is shown and the tab is visible; never in a match.
 */
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { RANKED_OPEN_FALLBACK, rankedLabel } from '../meta/ranked';

export type SocialTab = 'friends' | 'requests' | 'recent' | 'ranked' | 'boards';
export const SOCIAL_TABS: readonly SocialTab[] = Object.freeze(['friends', 'requests', 'recent', 'ranked', 'boards']);
const TAB_LABEL: Readonly<Record<SocialTab, string>> = Object.freeze({
  friends: 'Friends',
  requests: 'Requests',
  recent: 'Recent',
  ranked: 'Ranked',
  boards: 'Boards',
});

export interface Presence {
  state: 'offline' | 'online' | 'party' | 'queue' | 'match';
  joinable?: boolean;
  party?: string;
}
export interface FriendRow {
  code: string;
  name: string;
  presence: Presence;
}
export interface SocialState {
  me: { code: string; name: string; invisible: boolean; allowRecent: boolean; ageBand: string | null };
  friends: FriendRow[];
  requests: { in: { code: string; name: string }[]; out: { code: string; name: string }[] };
  blocks: { code: string; name: string }[];
  invites: { id: string; from: { code: string; name: string }; party: string }[];
  rev: string;
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

/** The friend row's one action (§14.2): Join a joinable party, Invite when you are in one, else the "…" menu. Pure. */
export function rowAction(p: Presence, inParty: boolean): 'join' | 'invite' | 'more' {
  if (p.state === 'party' && p.joinable && p.party) return 'join';
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
  signIn(): void;
  /** Ranked closed: Play Casual (the PvP queue). */
  playCasual(): void;
  /** Analytics (no names, codes or ids in props). */
  track?(event: string, props?: Record<string, string | number | boolean>): void;
  /** The viewport height (the hide ladder); default window.innerHeight. */
  height?(): number;
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
  private recent: { room: string; slot: number; name: string; team: string; canAdd: boolean }[] | null = null;
  private ranked: { status?: Record<string, any>; me?: Record<string, any> } = {};
  private board: { kind: 'global' | 'friends' | 'weekly'; page: number; data: Record<string, any> | null } = { kind: 'weekly', page: 0, data: null };
  private adding = false;
  private note = '';
  private undo: { code: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

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
      void this.addByCode();
    });
    parent.appendChild(this.root);
    this.deps.track?.('social_open', { tab });
    this.render();
    void this.load();
    this.pulseTimer = setInterval(() => void this.pulse(), 30_000);
  }

  private get per(): number {
    return rowsForHeight(this.deps.height?.() ?? (typeof window !== 'undefined' ? window.innerHeight : 640));
  }

  private async load(): Promise<void> {
    if (this.tab === 'ranked') return this.loadRanked();
    if (this.tab === 'boards') return this.loadBoard();
    if (!this.deps.signedIn()) return this.render();
    if (this.tab === 'recent') {
      const r = await this.deps.api('social.recent');
      this.recent = r.ok ? ((r.body as { players?: SocialSheet['recent'] })?.players ?? []) : [];
    }
    const s = await this.deps.api('social.get');
    if (s.ok && s.body) this.state = s.body as SocialState;
    else if (!s.ok) this.note = errorText(s);
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
    if (r.ok && r.status !== 204 && r.body) await this.load();
  }

  private esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  }

  /** Markup with `data-name` holes; names are filled by textContent after. */
  render(): void {
    if (this.disposed) return;
    const tabs = SOCIAL_TABS.map((t) => {
      const badge = t === 'requests' && this.state?.requests.in.length ? ` <i class="pl-social-badge">${this.state.requests.in.length}</i>` : '';
      return `<button type="button" role="tab" class="pl-social-tab" data-tab="${t}" aria-selected="${t === this.tab}">${TAB_LABEL[t]}${badge}</button>`;
    }).join('');
    this.root.innerHTML = `<header class="pl-social-head" role="tablist">${tabs}<button type="button" class="pl-social-x" data-a="close" aria-label="Close">&times;</button></header><div class="pl-social-body">${this.body()}</div><footer class="pl-social-foot">${this.footer()}</footer>${this.note ? `<p class="pl-social-note" role="status">${this.esc(this.note)}</p>` : ''}`;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = el.dataset.name ?? '';
  }

  private guestPanel(): string {
    return `<div class="pl-social-empty"><p>Sign in to add friends and see who's online.</p><button type="button" class="pl-btn small" data-a="signin">Sign in</button></div>`;
  }

  private agePanel(): string {
    return `<div class="pl-social-empty"><p>How old are you? We ask once.</p><div class="pl-social-age"><button type="button" class="pl-btn ghost small" data-age="under16">Under 16</button><button type="button" class="pl-btn ghost small" data-age="16-17">16 or 17</button><button type="button" class="pl-btn ghost small" data-age="18+">18 or older</button></div></div>`;
  }

  private body(): string {
    if (this.tab === 'ranked') return this.rankedBody();
    if (this.tab === 'boards') return this.boardBody();
    if (!this.deps.signedIn()) return this.guestPanel();
    const s = this.state;
    if (!s) return `<p class="pl-social-empty">Loading…</p>`;
    if (!s.me.ageBand) return this.agePanel();
    if (this.tab === 'friends') {
      if (!s.friends.length) return `<p class="pl-social-empty">No friends yet. Share your code or add theirs.</p>`;
      const { rows } = pageOf(s.friends, this.page, this.per);
      const inParty = !!this.deps.partyCode();
      return rows
        .map((f) => {
          const act = rowAction(f.presence, inParty);
          const btn =
            act === 'join'
              ? `<button type="button" class="pl-btn small" data-a="join" data-party="${this.esc(f.presence.party ?? '')}">Join</button>`
              : act === 'invite'
                ? `<button type="button" class="pl-btn ghost small" data-a="invite" data-code="${this.esc(f.code)}">Invite</button>`
                : `<button type="button" class="pl-btn ghost small pl-more" data-a="more" data-code="${this.esc(f.code)}" aria-label="More">&hellip;</button>`;
          return `<div class="pl-social-row" data-state="${f.presence.state}"><i class="pl-dot" data-state="${f.presence.state}"></i><span class="pl-social-name" data-name="${this.esc(f.name)}"></span><small class="pl-social-st">${PRESENCE_TEXT[f.presence.state]}</small>${btn}</div>`;
        })
        .join('');
    }
    if (this.tab === 'requests') {
      const list = [...s.requests.in.map((r) => ({ ...r, dir: 'in' as const })), ...s.requests.out.map((r) => ({ ...r, dir: 'out' as const }))];
      if (!list.length) return `<p class="pl-social-empty">No requests.</p>`;
      const { rows } = pageOf(list, this.page, this.per);
      return rows
        .map((r) =>
          r.dir === 'in'
            ? `<div class="pl-social-row"><span class="pl-social-name" data-name="${this.esc(r.name)}"></span><button type="button" class="pl-btn small" data-a="accept" data-code="${this.esc(r.code)}">Accept</button><button type="button" class="pl-btn ghost small" data-a="decline" data-code="${this.esc(r.code)}">Decline</button></div>`
            : `<div class="pl-social-row"><span class="pl-social-name" data-name="${this.esc(r.name)}"></span><small class="pl-social-st">Sent</small><button type="button" class="pl-btn ghost small" data-a="decline" data-code="${this.esc(r.code)}">Cancel</button></div>`,
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
          `<div class="pl-social-row"><span class="pl-social-name" data-name="${this.esc(p.name)}"></span><small class="pl-social-st">${p.team === 'ally' ? 'Teammate' : 'Opponent'}</small>${p.canAdd ? `<button type="button" class="pl-btn ghost small" data-a="add-recent" data-room="${this.esc(p.room)}" data-slot="${p.slot}" aria-label="Add friend">+</button>` : ''}</div>`,
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
    const rows = ((d.rows ?? []) as { rank: number; name: string; value: number; tier?: string; me?: boolean }[]).slice(0, this.per + 1);
    const list = rows.length
      ? rows
          .map(
            (r) =>
              `<div class="pl-social-row${r.me ? ' me' : ''}"><b class="pl-rank">${r.rank}</b><span class="pl-social-name" data-name="${this.esc(String(r.name))}"></span><small class="pl-social-st">${r.tier ? this.esc(r.tier) : `${r.value} wins`}</small></div>`,
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
          ? pageOf(this.state?.friends ?? [], 0, this.per).pages
          : this.tab === 'requests'
            ? pageOf([...(this.state?.requests.in ?? []), ...(this.state?.requests.out ?? [])], 0, this.per).pages
            : this.tab === 'recent'
              ? pageOf(this.recent ?? [], 0, this.per).pages
              : 1;
    const page = this.tab === 'boards' ? this.board.page : Math.min(this.page, pages - 1);
    const pager = pages > 1 ? `<span class="pl-pager"><button type="button" class="pl-btn ghost small" data-a="prev" aria-label="Previous page"${page <= 0 ? ' disabled' : ''}>&lsaquo;</button><small>${page + 1}/${pages}</small><button type="button" class="pl-btn ghost small" data-a="next" aria-label="Next page"${page >= pages - 1 ? ' disabled' : ''}>&rsaquo;</button></span>` : '';
    if (this.tab !== 'friends' || !this.state || !this.deps.signedIn() || !this.state.me.ageBand) return pager;
    if (this.adding)
      return `<form class="pl-social-add"><input name="code" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="PL-XXXX-XXXX" aria-label="Friend code" inputmode="text"><button type="submit" class="pl-btn small">Add</button><button type="button" class="pl-btn ghost small" data-a="add-cancel" aria-label="Cancel">&times;</button></form>`;
    return `${pager}<span class="pl-social-code">My code <b>${this.esc(this.state.me.code)}</b></span><button type="button" class="pl-btn ghost small" data-a="copy">Copy</button><button type="button" class="pl-btn small" data-a="add">Add</button>`;
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
    const age = t.closest<HTMLElement>('[data-age]')?.dataset.age;
    if (age) {
      void this.act('social.age', { ageBand: age });
      return;
    }
    const el = t.closest<HTMLElement>('[data-a]');
    const a = el?.dataset.a;
    if (!a || !el || el.hasAttribute('disabled')) return;
    const code = el.dataset.code ?? '';
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
    if (this.undo) clearTimeout(this.undo.timer);
    this.root.remove();
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
