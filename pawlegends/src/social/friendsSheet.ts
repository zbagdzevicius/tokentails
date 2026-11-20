/**
 * The add-friend sheet (friends panel, Nov 20; docs/plans/moba/FRIENDS.md): a centred window (full screen on a phone)
 * opened from the add-friend button on Home's friends panel. It is NOT a friends list: Home's panel is the only one.
 * Everything about finding and answering people lives here, each thing once:
 *
 * - Add by name: a field with nickname suggestions as you type (`social.search`, 2+ letters, 300 ms), Add on each.
 * - Friend requests: incoming (Accept, Decline) and sent (Cancel).
 * - From your recent matches: players to add (`social.recent`).
 * - You: your status (Online, Away, Appear offline), a status note from a safe list, your name to copy.
 * - The invite gift (share/invite.ts): Share link and Claim (no invite code in the game since Nov 20).
 * - Watch a live match, when one is featured.
 * A guest sees Sign in; an account with no age band is asked once.
 *
 * `invite` mode (the party lobby's "Invite friends"): the same rows as Home's panel with their +, to invite while the
 * lobby covers Home.
 *
 * Names are set with textContent (data-name holes). Every call goes through the host (`api-request`).
 */
import './social.css';
import './friendsSheet.css';
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { isAvatarView } from '../data/chatPhrases';
import { avatarHtml } from '../ui/avatar';
import { railInvite, railListHtml, RAIL_META } from '../ui/home/friendsRail';
import { InviteRow } from '../share/invite';
import { rememberAgeBand } from './ageBand';
import { ccHtmlOrNone } from './flags';
import { icon } from './socialIcons';
import type { FriendRow } from './presence';
import { agoText, champText, looksLikeCode, noteText, socialErrorText, STATUS_NOTES, type PersonRow, type RecentRow, type SocialState, type Suggestion } from './socialState';

export type FriendsSheetMode = 'add' | 'invite';

export interface FriendsSheetDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  signedIn(): boolean;
  signIn(): void;
  /** A person's Player Card (a request, a suggestion, a recent player, a friend in invite mode). */
  openCard?(p: { code: string; name: string; av?: unknown; friend?: boolean }): void;
  /** Invite mode: the friends Home knows, my party, and the invite. */
  friends?(): readonly FriendRow[] | null;
  myParty?(): string | null;
  invite?(f: FriendRow): void;
  /** SPECTATE.md: the featured live match (absent: no relay). */
  watchLive?(): void;
  /** Something changed the friends or requests (Home's panel reloads). */
  onChanged?(): void;
  /** The sheet closed. */
  onClose?(): void;
  track?(event: string, props?: Record<string, string | number | boolean>): void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export class FriendsSheet {
  readonly root: HTMLElement;
  private readonly scrim: HTMLElement;
  private state: SocialState | null = null;
  private recent: RecentRow[] | null = null;
  private text = '';
  private suggest: { q: string; rows: Suggestion[] } | null = null;
  private suggestTimer: ReturnType<typeof setTimeout> | null = null;
  private note = '';
  private noteTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly opener: HTMLElement | null;
  private readonly invite: InviteRow;
  private focused = false;

  constructor(
    parent: HTMLElement,
    private readonly deps: FriendsSheetDeps,
    private mode: FriendsSheetMode = 'add',
  ) {
    const doc = parent.ownerDocument;
    const was = doc.activeElement as HTMLElement | null;
    this.opener = was && was !== doc.body ? was : null;
    this.scrim = doc.createElement('div');
    this.scrim.className = 'pl-fsheet-scrim';
    this.scrim.addEventListener('click', () => this.dispose());
    this.root = doc.createElement('aside');
    this.root.className = `pl-social pl-fsheet is-${mode}`;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', mode === 'invite' ? 'Invite friends' : 'Add friends');
    this.root.dataset.testid = 'friends-sheet';
    this.invite = new InviteRow({
      api: (op, args) => this.deps.api(op, args),
      render: () => this.render(),
      note: (t) => this.say(t),
      track: (e, p) => this.deps.track?.(e, p),
    });
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      if (this.invite.entering) return void this.invite.act('inv-cancel');
      this.dispose();
    });
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement | null;
      if (form?.dataset?.form === 'invite') void this.invite.redeem(form.querySelector<HTMLInputElement>('input[name="invite"]')?.value ?? '');
      else void this.addByName();
    });
    this.root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement | null;
      if (t?.getAttribute('name') === 'code') {
        this.text = (t as HTMLInputElement).value;
        if (this.suggestTimer) clearTimeout(this.suggestTimer);
        this.suggestTimer = setTimeout(() => void this.findNames(), 300);
        this.paintSuggest();
      }
    });
    this.root.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement | null;
      if (t?.name === 'note') void this.setNote(Number(t.value));
    });
    parent.append(this.scrim, this.root);
    this.render();
    this.root.querySelector<HTMLElement>('[data-a="close"]')?.focus({ preventScroll: true });
    void this.load();
  }

  get closed(): boolean {
    return this.disposed;
  }

  /** `social.get` (and the invite gift and recent players once). */
  async load(): Promise<void> {
    if (!this.deps.signedIn() || this.mode === 'invite') return this.render();
    const [s] = await Promise.all([this.deps.api('social.get'), this.invite.state ? Promise.resolve() : this.invite.load()]);
    if (this.disposed) return;
    if (s.ok && s.body) {
      this.state = s.body as SocialState;
      rememberAgeBand(this.state.me?.ageBand);
    } else if (!s.ok) this.say(socialErrorText(s));
    this.render();
    // the add field takes focus once it exists (the first answer drew it), unless the player moved on already
    if (!this.focused) {
      this.focused = true;
      const a = this.root.ownerDocument.activeElement;
      if (!a || a === this.root.ownerDocument.body || a.matches('[data-a="close"]')) this.root.querySelector<HTMLInputElement>('input[name="code"]')?.focus({ preventScroll: true });
    }
    if (this.recent === null && this.state?.me.ageBand) void this.loadRecent();
  }

  private async loadRecent(): Promise<void> {
    this.recent = [];
    const r = await this.deps.api('social.recent');
    if (this.disposed) return;
    this.recent = r.ok ? ((r.body as { players?: RecentRow[] } | undefined)?.players ?? []) : [];
    this.render();
  }

  /** Repaint the invite list (invite mode) when Home's friends change. */
  refresh(): void {
    if (this.mode === 'invite') this.render();
  }

  private say(t: string): void {
    this.note = t;
    if (this.noteTimer) clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => {
      this.note = '';
      this.root.querySelector('.pl-social-note')?.remove();
    }, 3500);
  }

  // ------------------------------------------------------------------------------------------------ markup
  private head(): string {
    const title = this.mode === 'invite' ? 'Invite friends' : 'Add friends';
    return `<header class="pl-social-head"><h2 class="pl-social-title">${title}</h2><span class="pl-head-acts"><button type="button" class="pl-ico pl-social-x" data-a="close" data-testid="friends-sheet-close" aria-label="Close" title="Close (Esc)">${icon('close', 20)}</button></span></header>`;
  }

  private section(id: string, title: string, n: number | null, body: string, ic = 'friends'): string {
    return `<section class="pl-group pl-fs-sec" data-g="${id}"><h3 class="pl-group-h is-static">${icon(ic, 16)}<span class="pl-group-t">${esc(title)}</span>${n !== null ? `<span class="pl-group-n">${n}</span>` : ''}</h3><div class="pl-group-list" role="list">${body}</div></section>`;
  }

  private person(p: { name: string; av?: unknown; cc?: string }, line: string, acts: string, attrs = ''): string {
    return `<div class="pl-social-row pl-rq" role="listitem"${attrs}><span class="pl-fr-av">${avatarHtml(p.av as never, 40)}</span><span class="pl-social-who"><span class="pl-social-nm"><span class="pl-social-name" data-name="${esc(p.name)}"></span>${ccHtmlOrNone(p.cc)}</span>${line ? `<small class="pl-social-line"><span class="pl-social-st">${esc(line)}</span></small>` : ''}</span><span class="pl-fr-acts is-shown">${acts}</span></div>`;
  }

  private addCard(): string {
    return `<form class="pl-add-card" data-form="add" data-testid="social-add-card"><div class="pl-add-top"><label class="pl-social-search">${icon('search', 18)}<input name="code" maxlength="24" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Player name" aria-label="Find a player by name" inputmode="text" enterkeyhint="send" data-testid="social-add-input" value="${esc(this.text)}"></label><button type="submit" class="pl-btn small" data-testid="social-add-send">Add</button></div><div class="pl-social-suggest" aria-live="polite">${this.suggestBody()}</div></form>`;
  }

  private suggestBody(): string {
    const q = this.text.trim();
    if (!this.suggest || this.suggest.q !== q) return q.length >= 2 && !looksLikeCode(q) ? '' : `<p class="pl-social-hint">Type 2 letters of a player's name.</p>`;
    if (!this.suggest.rows.length) return `<p class="pl-social-hint" data-testid="social-suggest-none">No player has this name.</p>`;
    const rel = { friend: 'Friends', sent: 'Request sent', asked: 'Wants to be friends' } as const;
    return this.suggest.rows
      .map((p) => {
        const act =
          p.rel === 'friend' || p.rel === 'sent'
            ? ''
            : `<button type="button" class="pl-ico pl-act-2${p.rel === 'asked' ? ' is-accept' : ''}" data-a="add-name" data-nick="${esc(p.name)}" aria-label="${esc(`${p.rel === 'asked' ? 'Accept' : 'Add'} ${p.name}`)}" title="${p.rel === 'asked' ? 'Accept' : 'Add friend'}">${icon(p.rel === 'asked' ? 'check' : 'addUser', 22)}</button>`;
        return this.person(p, p.rel ? rel[p.rel] : '', act, ' data-testid="social-suggest"');
      })
      .join('');
  }

  private requestRow(r: PersonRow, dir: 'in' | 'out'): string {
    const code = esc(r.code);
    const ago = agoText(r.at);
    const line = dir === 'in' ? ago || 'Friend request' : ago ? `Sent ${ago}` : 'Request sent';
    const acts =
      dir === 'in'
        ? `<button type="button" class="pl-ico pl-act-1 is-pill is-decline" data-a="decline" data-code="${code}" data-testid="sheet-decline" aria-label="${esc(`Decline ${r.name}`)}" title="Decline"><span class="pl-ic">${icon('close', 20)}</span></button><button type="button" class="pl-ico pl-act-2 is-primary is-accept" data-a="accept" data-code="${code}" data-testid="sheet-accept" aria-label="${esc(`Accept ${r.name}, friend request`)}" title="Accept"><span class="pl-ic">${icon('check', 20)}</span></button>`
        : `<button type="button" class="pl-ico pl-act-2" data-a="decline" data-code="${code}" data-testid="sheet-cancel" aria-label="${esc(`Cancel the request to ${r.name}`)}" title="Cancel request">${icon('close')}</button>`;
    return this.person(r, line, acts, ` data-code="${code}" data-testid="sheet-request-${dir}"`);
  }

  private recentRow(p: RecentRow): string {
    const champ = champText(p.hero);
    const n = typeof p.together === 'number' && p.together > 1 ? p.together : 0;
    const line = [p.team === 'ally' ? 'Teammate' : 'Opponent', champ, n ? `${n} games` : ''].filter(Boolean).join(' · ');
    const act = p.canAdd
      ? `<button type="button" class="pl-ico pl-act-2" data-a="add-recent" data-room="${esc(p.room)}" data-slot="${p.slot}" aria-label="${esc(`Add ${p.name} as a friend`)}" title="Add friend">${icon('addUser')}</button>`
      : '';
    return this.person(p, line, act, ' data-testid="sheet-recent"');
  }

  private meCard(s: SocialState): string {
    const me = s.me;
    const cur = me.invisible ? 'invisible' : me.away ? 'away' : 'online';
    const radio = (v: 'online' | 'away' | 'invisible', text: string, sub: string): string => {
      const on = v === cur;
      return `<button type="button" role="radio" class="pl-mi pl-me-opt" data-a="status" data-v="${v}" data-testid="sheet-status-${v}" aria-checked="${on}"><i class="pl-dot" data-state="${v === 'invisible' ? 'offline' : v}"></i><span><b>${text}</b><small>${sub}</small></span>${on ? icon('check', 18) : ''}</button>`;
    };
    const opts = [`<option value="-1"${noteText(me.note) ? '' : ' selected'}>No status note</option>`, ...STATUS_NOTES.map((t, i) => `<option value="${i}"${me.note === i ? ' selected' : ''}>${esc(t)}</option>`)].join('');
    const note = `<label class="pl-me-note"><span>Status note<small class="pl-me-note-hint" id="pl-note-hint">Picked from a safe list</small></span><select name="note" data-testid="social-note" aria-label="Status note friends see" aria-describedby="pl-note-hint">${opts}</select></label>`;
    return `<div class="pl-me-card pl-fs-me" data-testid="social-me-card"><div role="radiogroup" aria-label="My status">${radio('online', 'Online', 'Friends can invite you')}${radio('away', 'Away', 'Also set after 10 min idle')}${radio('invisible', 'Appear offline', 'You still see your friends')}</div>${note}<div class="pl-me-card-acts"><button type="button" class="pl-mi" data-a="copy" data-testid="social-copy-name" aria-label="${esc(`Copy your name ${me.name}`)}">${icon('copy', 18)}<span>Friends add you by your name <b class="pl-me-code">${esc(me.name)}</b></span></button></div></div>`;
  }

  private body(): string {
    if (!this.deps.signedIn()) return `<div class="pl-social-empty" data-testid="friends-sheet-guest"><p>Sign in to add friends and see who's online.</p><button type="button" class="pl-btn small" data-a="signin">Sign in</button></div>`;
    if (this.mode === 'invite') {
      const list = this.deps.friends?.() ?? null;
      return `<div class="fr-rail fr-insheet"><ul class="fr-list" aria-label="Friends to invite">${railListHtml(list, { ...RAIL_META, myParty: this.deps.myParty?.() ?? null })}</ul></div>`;
    }
    const s = this.state;
    if (!s) return `<p class="pl-social-empty">Loading…</p>`;
    if (!s.me.ageBand)
      return `<div class="pl-social-empty"><p>How old are you? We ask once.</p><div class="pl-social-age"><button type="button" class="pl-btn ghost small" data-age="under16">Under 16</button><button type="button" class="pl-btn ghost small" data-age="16-17">16 or 17</button><button type="button" class="pl-btn ghost small" data-age="18+">18 or older</button></div><button type="button" class="pl-social-later" data-a="close">Not now</button></div>`;
    let html = this.addCard();
    if (s.requests.in.length) html += this.section('requests', 'Friend requests', s.requests.in.length, s.requests.in.map((r) => this.requestRow(r, 'in')).join(''), 'addUser');
    if (s.requests.out.length) html += this.section('sent', 'Sent requests', s.requests.out.length, s.requests.out.map((r) => this.requestRow(r, 'out')).join(''), 'clock');
    const rec = (this.recent ?? []).filter((p) => p.canAdd).slice(0, 6);
    if (rec.length) html += this.section('recent', 'From your recent matches', null, rec.map((p) => this.recentRow(p)).join(''), 'history');
    html += this.section('me', 'You', null, this.meCard(s), 'smile');
    if (this.invite.state) html += this.section('gift', 'Invite a friend', null, this.invite.html(false), 'gift');
    if (s.live?.featured && this.deps.watchLive)
      html += `<button type="button" class="pl-btn ghost small pl-fs-live" data-a="watch-live" data-testid="social-watch-live">${icon('live', 18)}<span>Watch a live match</span></button>`;
    return html;
  }

  render(): void {
    if (this.disposed) return;
    const focus = this.focusKey();
    const scroll = this.root.querySelector('.pl-social-body')?.scrollTop ?? 0;
    const note = this.note ? `<p class="pl-social-note" role="status">${esc(this.note)}</p>` : '';
    this.root.innerHTML = `${this.head()}<div class="pl-social-body">${this.body()}</div>${note}`;
    this.fillNames(this.root);
    const body = this.root.querySelector<HTMLElement>('.pl-social-body');
    if (body && scroll) body.scrollTop = scroll;
    if (focus) {
      const el = this.root.querySelector<HTMLElement>(focus.sel);
      el?.focus({ preventScroll: true });
      if (el instanceof HTMLInputElement && focus.caret !== undefined) el.setSelectionRange(focus.caret, focus.caret);
    }
  }

  private focusKey(): { sel: string; caret?: number } | null {
    const a = this.root.ownerDocument.activeElement as HTMLElement | null;
    if (!a || !this.root.contains(a)) return null;
    if (a instanceof HTMLInputElement && a.name) return { sel: `input[name="${a.name}"]`, caret: a.selectionStart ?? a.value.length };
    if (a instanceof HTMLSelectElement && a.name) return { sel: `select[name="${a.name}"]` };
    const sel = ['data-a', 'data-code', 'data-v', 'data-nick']
      .map((k) => {
        const v = a.getAttribute(k);
        return v === null ? '' : `[${k}="${v.replace(/["\\]/g, '\\$&')}"]`;
      })
      .join('');
    return sel ? { sel } : null;
  }

  private fillNames(scope: HTMLElement): void {
    for (const el of scope.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = el.dataset.name ?? '';
  }

  private paintSuggest(): void {
    const box = this.root.querySelector<HTMLElement>('.pl-social-suggest');
    if (!box) return;
    box.innerHTML = this.suggestBody();
    this.fillNames(box);
  }

  // ------------------------------------------------------------------------------------------------ actions
  private async findNames(): Promise<void> {
    const q = this.text.trim();
    if (this.disposed) return;
    if (q.length < 2 || looksLikeCode(q)) {
      this.suggest = null;
      return this.paintSuggest();
    }
    const r = await this.deps.api('social.search', { name: q });
    if (this.disposed || this.text.trim() !== q) return;
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

  private async addByName(typed?: string): Promise<void> {
    const text = (typed ?? this.root.querySelector<HTMLInputElement>('input[name="code"]')?.value ?? '').trim();
    if (!text) return;
    const byCode = looksLikeCode(text);
    const r = await this.deps.api('friend.add', byCode ? { code: text } : { name: text });
    if (this.disposed) return;
    if (r.ok) {
      this.text = '';
      this.suggest = null;
      this.deps.track?.('friend_request', { via: byCode ? 'code' : 'name' });
      this.say((r.body as { state?: string })?.state === 'friends' ? 'You are friends now' : `Request sent to ${byCode ? 'your friend' : text}`);
    } else this.say(socialErrorText(r));
    await this.changed();
  }

  private async act(op: ApiOp, args: ApiArgs, ok: string): Promise<void> {
    const r = await this.deps.api(op, args);
    if (this.disposed) return;
    this.say(r.ok ? ok : socialErrorText(r));
    await this.changed();
  }

  private async changed(): Promise<void> {
    this.deps.onChanged?.();
    await this.load();
  }

  private async setStatus(v: 'online' | 'away' | 'invisible'): Promise<void> {
    const me = this.state?.me;
    if (!me) return;
    const invisible = v === 'invisible';
    const away = v === 'away';
    const r = await this.deps.api('social.me', { invisible, away });
    if (this.disposed) return;
    if (r.ok) {
      Object.assign(me, { invisible, away });
      this.deps.track?.('social_status', { invisible, away });
      this.say(invisible ? 'You appear offline' : away ? 'You are away' : 'You are online');
    } else this.say(socialErrorText(r));
    this.render();
  }

  private async setNote(n: number): Promise<void> {
    if (!this.state || !Number.isInteger(n)) return;
    const note = n >= 0 && n < STATUS_NOTES.length ? n : -1;
    const r = await this.deps.api('social.me', { note });
    if (this.disposed) return;
    if (r.ok) {
      this.state.me.note = note < 0 ? null : note;
      this.deps.track?.('social_note', { set: note >= 0 });
      this.say(note < 0 ? 'Status note cleared' : 'Status note set');
    } else this.say(socialErrorText(r));
    this.render();
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const age = t.closest<HTMLElement>('[data-age]')?.dataset.age;
    if (age) return void this.act('social.age', { ageBand: age }, '');
    const el = t.closest<HTMLElement>('[data-a]');
    const a = el?.dataset.a;
    if (!a || !el || el.hasAttribute('disabled')) return;
    const code = el.dataset.code ?? '';
    if (a.startsWith('inv-')) return void this.invite.act(a);
    switch (a) {
      case 'close':
        return this.dispose();
      case 'signin':
        this.dispose();
        return this.deps.signIn();
      case 'add-name':
        this.deps.track?.('friend_request', { via: 'suggest' });
        return void this.addByName(el.dataset.nick ?? '');
      case 'add-recent':
        this.deps.track?.('friend_request', { via: 'recent' });
        return void this.act('friend.add', { room: el.dataset.room ?? '', slot: Number(el.dataset.slot) }, 'Request sent');
      case 'accept':
        this.deps.track?.('friend_accept');
        return void this.act('friend.accept', { code }, 'You are friends now');
      case 'decline':
        return void this.act('friend.decline', { code }, el.dataset.testid === 'sheet-cancel' ? 'Request cancelled' : 'Request declined');
      case 'status':
        return void this.setStatus((el.dataset.v as 'online' | 'away' | 'invisible') ?? 'online');
      case 'copy': {
        const name = this.state?.me.name ?? '';
        void navigator.clipboard
          ?.writeText(name)
          .then(() => this.say('Name copied'))
          .catch(() => this.say(`Your name: ${name}`))
          .finally(() => this.render());
        return;
      }
      case 'fr-add':
        // the invite list's empty state: Add friend switches this window to adding
        this.mode = 'add';
        this.root.className = 'pl-social pl-fsheet is-add';
        this.root.setAttribute('aria-label', 'Add friends');
        this.focused = false;
        return void this.load();
      case 'watch-live':
        this.dispose();
        return this.deps.watchLive?.();
      case 'fr-open': {
        const f = this.deps.friends?.()?.find((x) => x.code === code);
        if (!f) return;
        this.dispose();
        return this.deps.openCard?.({ code: f.code, name: f.name, av: f.av, friend: true });
      }
      case 'fr-invite': {
        const f = this.deps.friends?.()?.find((x) => x.code === code);
        if (!f) return;
        const inv = railInvite(f.presence, this.deps.myParty?.() ?? null);
        if (!inv.ok || el.getAttribute('aria-disabled') === 'true') {
          this.say(`${f.name}: ${inv.ok ? 'not now' : inv.why}`);
          return this.render();
        }
        this.deps.invite?.(f);
        this.say(`Inviting ${f.name}…`);
        return this.render();
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.suggestTimer) clearTimeout(this.suggestTimer);
    if (this.noteTimer) clearTimeout(this.noteTimer);
    const doc = this.root.ownerDocument;
    const act = doc.activeElement;
    const inside = !act || act === doc.body || this.root.contains(act);
    this.root.remove();
    this.scrim.remove();
    if (inside && this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    this.deps.onClose?.();
  }
}
