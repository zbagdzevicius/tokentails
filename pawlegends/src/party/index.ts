/**
 * Party play client entry (docs/plans/moba/MULTIPLAYER.md §5, §8). LAZY: app.ts imports this chunk only when the
 * player taps "Play with friends" or opens a `?party=` link, so it never counts toward first load.
 *
 * Built in lane N as the minimal flow the netcode needs end to end: create on the first tap, join by code or link,
 * the lobby (code, Share or Copy, seats, difficulty, Open seats, Start), the shared pick, loading, the match through
 * NetHost, and back to the party after the results. Lane P replaces these screens with the full designs (§8).
 */
import { HERO_IDS, HEROES } from '../data/heroes';
import { TRICK_IDS } from '../data/tricks';
import { HERO_TEXT } from '../ui/heroText';
import { SIM_VERSION } from '../sim/version';
import { PartySocket, browserSocketEnv } from '../net/socket';
import { NetHost, type NetNote } from '../net/net-host';
import { WS_PATH, displayCode, normalizeCode, type MatchMsg, type PartyView, type ServerJson } from '../net/proto';
import './party.css';

export interface PartyHooks {
  root: HTMLElement;
  /** The backend origin (https://api.tokentails.com), already validated. */
  api: string;
  hero: string;
  trick: string;
  difficulty: string;
  /** Highest tier this player unlocked (hint only, lowers a UI default). */
  maxDifficulty: string;
  newbie: boolean;
  build: string;
  /** A single-use party ticket from the host (embed), or null (standalone: an unscored guest). */
  ticket(): Promise<string | null>;
  guestKey(): string;
  /** Start the party match in the app (a MatchSession on this NetHost). */
  startMatch(host: () => NetHost, match: MatchMsg, view: PartyView): void;
  /** D10: a party of one with Open seats off plays a normal local match. */
  startSolo(difficulty: string): void;
  /** The rail of the running match (in-match notes). */
  notify(n: NetNote): void;
  /** Back to the title. */
  close(): void;
  /** The invite URL for a code (the embed URL, D12). */
  inviteUrl(code: string): string;
  share?(url: string, text: string): boolean;
  analytics?(event: string, props: Record<string, string | number | boolean>): void;
}

const simHash = (): string => (typeof __SIM_HASH__ !== 'undefined' ? __SIM_HASH__ : '0000000000000000');
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ERRORS: Readonly<Record<string, string>> = {
  update_required: 'Update to play together',
  party_not_found: 'This party has ended',
  party_ended: 'This party has ended',
  party_full: 'This party is full',
  party_busy: 'This party is in a match',
  party_locked: 'This party is locked',
  kicked: 'You were removed from the party',
  server_busy: 'Servers busy, retrying soon',
  rate_limited: 'Slow down a moment',
  seat_elsewhere: 'Playing in another tab',
  bad_ticket: 'Sign-in expired: playing as a guest',
};

export class PartyClient {
  readonly socket: PartySocket;
  private el: HTMLElement;
  view: PartyView | null = null;
  private match: MatchMsg | null = null;
  private host: NetHost | null = null;
  inMatch = false;
  private hover: string;
  private trick: string;
  private lastError: string | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private wantJoin: string | null;
  private closed = false;

  constructor(private readonly h: PartyHooks, opts: { code?: string | null; create?: boolean }) {
    this.hover = h.hero;
    this.trick = h.trick;
    this.wantJoin = opts.code ?? null;
    const url = `${h.api.replace(/^http/, 'ws').replace(/\/+$/, '')}${WS_PATH}`;
    this.el = document.createElement('div');
    this.el.className = 'pl-party';
    this.el.dataset.testid = 'party';
    h.root.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.socket = new PartySocket(url, { sim: SIM_VERSION, simHash: simHash(), build: h.build, guestKey: h.guestKey(), hint: { maxDifficulty: h.maxDifficulty, newbie: h.newbie } }, browserSocketEnv());
    this.socket.listen({
      json: (m) => this.onJson(m, opts.create === true),
      state: (s) => {
        if (s === 'reconnecting' && !this.inMatch) this.render();
      },
    });
    this.render();
    void h.ticket().then((t) => {
      if (this.closed) return;
      if (t) (this.socket as unknown as { hello: { ticket?: string } }).hello.ticket = t;
      this.socket.connect();
    });
    this.tick = setInterval(() => {
      if (this.view?.phase === 'pick' && !this.inMatch) this.renderTimer();
    }, 250);
  }

  private created = false;

  private onJson(m: ServerJson, create: boolean): void {
    switch (m.t) {
      case 'welcome':
        if (!this.view && !this.created) {
          if (this.wantJoin) this.socket.sendJson({ t: 'party.join', code: this.wantJoin });
          else if (create) {
            this.created = true;
            this.socket.sendJson({ t: 'party.create', difficulty: this.h.difficulty });
            this.h.analytics?.('party_create', { difficulty: this.h.difficulty });
          }
        }
        return;
      case 'party': {
        const prev = this.view?.phase;
        if ((m as PartyView & { left?: boolean }).left) {
          this.view = null;
          return;
        }
        this.view = m;
        this.wantJoin = null;
        this.lastError = null;
        if (m.phase === 'pick' && prev !== 'pick') {
          const me = m.members.find((x) => x.id === m.you);
          this.hover = me?.hero ?? this.hover;
          if (!m.members.some((x) => x.id !== m.you && x.locked && x.hero === this.hover)) this.socket.sendJson({ t: 'pick.hover', hero: this.hover });
        }
        if (m.phase === 'loading' && prev !== 'loading') {
          // match assets load during the lobby and the pick (§5.1): ready at once
          this.socket.sendJson({ t: 'loaded' });
        }
        if (!this.inMatch) this.render();
        return;
      }
      case 'match':
        if (this.inMatch) return;
        this.match = m;
        this.inMatch = true;
        this.el.hidden = true;
        this.h.startMatch(
          () => {
            this.host = new NetHost(this.socket, m, { notify: (n) => this.h.notify(n) });
            return this.host;
          },
          m,
          this.view!,
        );
        return;
      case 'local':
        this.h.startSolo(m.difficulty);
        return;
      case 'end':
        return;
      case 'nudge':
        this.h.notify({ key: 'mp-nudge', title: 'A teammate nudged you', tone: 'info' });
        return;
      case 'vote':
        if (m.kind === 'rematch' && m.result === 'pass') this.h.notify({ key: 'mp-rematch', title: 'Leader started a rematch', tone: 'info', ttl: 3000 });
        return;
      case 'error':
        this.lastError = m.code;
        if (!this.inMatch) this.render();
        return;
      default:
        return;
    }
  }

  /** The app finished the match and the results: show the party again. */
  matchOver(): void {
    this.inMatch = false;
    this.host = null;
    this.match = null;
    this.el.hidden = false;
    this.render();
  }

  get partyMatch(): MatchMsg | null {
    return this.match;
  }

  private me() {
    return this.view?.members.find((m) => m.id === this.view!.you) ?? null;
  }

  private get isLeader(): boolean {
    return !!this.view && this.view.leader === this.view.you;
  }

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null;
    if (!t) return;
    const a = t.dataset.p!;
    const s = this.socket;
    switch (a) {
      case 'start':
        s.sendJson({ t: 'party.start' });
        this.h.analytics?.('party_start', { members: this.view?.members.length ?? 0 });
        return;
      case 'leave':
        s.sendJson({ t: 'party.leave' });
        this.close();
        return;
      case 'share':
      case 'copy': {
        if (!this.view) return;
        const url = this.h.inviteUrl(this.view.code);
        if (a === 'share' && this.h.share?.(url, 'Play Paw Legends with me')) return;
        void navigator.clipboard?.writeText(url).then(
          () => this.h.notify({ key: 'mp-copy', title: 'Link copied', tone: 'good' }),
          () => undefined,
        );
        this.flash(t, 'Copied');
        return;
      }
      case 'diff':
        s.sendJson({ t: 'party.set', difficulty: t.dataset.v! });
        return;
      case 'open':
        s.sendJson({ t: 'party.set', openSeats: !this.view?.openSeats });
        return;
      case 'hero':
        this.hover = t.dataset.v!;
        s.sendJson({ t: 'pick.hover', hero: this.hover });
        this.render();
        return;
      case 'trick':
        this.trick = t.dataset.v!;
        this.render();
        return;
      case 'lock':
        s.sendJson({ t: 'pick.lock', hero: this.hover, trick: this.trick });
        return;
      case 'rematch':
        s.sendJson({ t: 'vote', kind: 'rematch', yes: true });
        return;
      case 'join': {
        const input = this.el.querySelector('input[name=code]') as HTMLInputElement | null;
        const code = normalizeCode(input?.value ?? '');
        if (!code) {
          this.lastError = 'party_not_found';
          this.render();
          return;
        }
        s.sendJson({ t: 'party.join', code });
        return;
      }
      case 'solo':
        this.close();
        return;
      case 'reload':
        location.reload();
        return;
    }
  }

  private flash(el: HTMLElement, text: string): void {
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => (el.textContent = old), 1200);
  }

  private renderTimer(): void {
    const t = this.el.querySelector('[data-timer]');
    if (t && this.view?.deadlineMs !== undefined) t.textContent = `${Math.max(0, Math.ceil(this.view.deadlineMs / 1000))}s`;
  }

  render(): void {
    if (this.closed) return;
    const v = this.view;
    const err = this.lastError ? `<p class="pp-err" role="alert">${esc(ERRORS[this.lastError] ?? 'Something went wrong')}</p>` : '';
    if (!v) {
      const joining = this.wantJoin ? `Joining ${esc(displayCode(this.wantJoin))}…` : 'Connecting…';
      const ended = this.lastError === 'party_not_found' || this.lastError === 'party_ended';
      this.el.innerHTML = `<div class="pp-card pp-narrow">
        <h2>Play with friends</h2>
        ${ended ? `<p class="pp-big">This party has ended</p><div class="pp-row"><button class="pl-btn" data-p="solo">Play now</button><button class="pl-btn ghost" data-p="leave">Close</button></div>` : this.lastError ? err : `<p class="pp-dim">${joining}</p>`}
        ${this.lastError === 'update_required' ? '<button class="pl-btn" data-p="reload">Reload</button>' : ''}
        <div class="pp-join"><input name="code" maxlength="7" autocomplete="off" spellcheck="false" placeholder="Code" aria-label="Party code"><button class="pl-btn small" data-p="join">Join</button></div>
        <button class="pl-btn ghost small" data-p="leave">Back</button>
      </div>`;
      return;
    }
    if (v.phase === 'pick') return this.renderPick(v, err);
    if (v.phase === 'loading' || v.phase === 'match') {
      this.el.innerHTML = `<div class="pp-card pp-narrow"><h2>Loading match…</h2><p class="pp-dim">Bots cover anyone still loading.</p></div>`;
      return;
    }
    const seats = [0, 1, 2]
      .map((i) => {
        const m = v.members[i];
        if (!m) return `<li class="pp-seat empty"><button class="pp-invite" data-p="share">Invite</button></li>`;
        const lead = m.id === v.leader ? '<span class="pp-crown" title="Leader">★</span>' : '';
        return `<li class="pp-seat" data-conn="${m.conn}"><i class="pp-dot"></i><b>${esc(m.ownName ?? m.name)}</b>${lead}${m.guest ? '<small>guest</small>' : ''}${m.id === v.you ? '<small>you</small>' : ''}</li>`;
      })
      .join('');
    const diffs = ['easy', 'normal', 'hard'];
    const leader = this.isLeader;
    const diffCtl = leader
      ? `<div class="pp-seg" role="radiogroup" aria-label="Bots">${diffs.map((d) => `<button role="radio" aria-checked="${v.difficulty === d}" data-p="diff" data-v="${d}">${d[0].toUpperCase()}${d.slice(1)}</button>`).join('')}</div>`
      : `<p class="pp-dim">Leader picks: ${esc(v.difficulty)}</p>`;
    const waiting = v.waiting?.length ? `<p class="pp-chip">Waiting for ${esc(v.members.find((m) => m.id === v.waiting![0])?.name ?? 'a friend')}</p>` : '';
    const results = v.phase === 'results' ? `<button class="pl-btn" data-p="rematch">Play again together</button>` : '';
    this.el.innerHTML = `<div class="pp-card">
      <div class="pp-head"><h2>Party</h2><button class="pl-btn ghost small" data-p="leave">Leave party</button></div>
      <div class="pp-grid">
        <div class="pp-code-col">
          <small>Party code</small>
          <div class="pp-code" data-testid="party-code">${esc(displayCode(v.code))}</div>
          <div class="pp-row"><button class="pl-btn" data-p="share">Share</button><button class="pl-btn ghost small" data-p="copy">Copy link</button></div>
        </div>
        <ul class="pp-seats">${seats}</ul>
        <div class="pp-ctl">
          <small>Bots</small>${diffCtl}
          ${leader ? `<label class="pp-check"><input type="checkbox" data-p="open" ${v.openSeats ? 'checked' : ''}> Open seats</label>` : ''}
          ${waiting}${err}
          ${results}
          ${leader ? `<button class="pl-btn big" data-p="start" data-testid="party-start">${v.members.length === 1 && !v.openSeats ? 'Play' : 'Start'}</button>` : '<p class="pp-dim">Waiting for leader</p>'}
        </div>
      </div>
    </div>`;
  }

  private renderPick(v: PartyView, err: string): void {
    const me = this.me();
    const leaderHero = v.members.find((m) => m.id === v.leader)?.hero;
    const side = leaderHero ? HEROES[leaderHero as keyof typeof HEROES]?.side : null;
    const takenBy = new Map(v.members.filter((m) => m.id !== v.you && m.locked && m.hero).map((m) => [m.hero!, m.name]));
    const heroes = HERO_IDS.map((id) => {
      const other = takenBy.get(id);
      const wrongSide = !this.isLeader && side && HEROES[id].side !== side;
      const dis = !!other || !!wrongSide || !!me?.locked;
      return `<button class="pp-hero" data-p="hero" data-v="${id}" aria-pressed="${this.hover === id}" ${dis ? 'disabled' : ''}>${esc(HERO_TEXT[id]?.title ?? id)}${other ? `<small>${esc(other)}</small>` : ''}</button>`;
    }).join('');
    const tricks = TRICK_IDS.map((t) => `<button class="pp-trick" data-p="trick" data-v="${t}" aria-pressed="${this.trick === t}" ${me?.locked ? 'disabled' : ''}>${esc(t)}</button>`).join('');
    const strip = v.members.map((m) => `<li data-locked="${!!m.locked}"><b>${esc(m.name)}</b><span>${esc(m.hero ? (HERO_TEXT[m.hero as keyof typeof HERO_TEXT]?.title ?? m.hero) : '…')}</span></li>`).join('');
    this.el.innerHTML = `<div class="pp-card pp-pick">
      <div class="pp-head"><h2>Pick your hero</h2><span class="pp-timer" data-timer>${Math.ceil((v.deadlineMs ?? 0) / 1000)}s</span></div>
      <ul class="pp-strip">${strip}</ul>
      <div class="pp-heroes">${heroes}</div>
      <div class="pp-tricks">${tricks}</div>
      ${err}
      <button class="pl-btn big" data-p="lock" data-testid="party-lock" ${me?.locked ? 'disabled' : ''}>${me?.locked ? 'Locked in' : 'Lock in'}</button>
    </div>`;
  }

  close(): void {
    this.closed = true;
    if (this.tick) clearInterval(this.tick);
    this.socket.close(true);
    this.el.remove();
    this.h.close();
  }
}

/** Open the party flow: create a party at once (the first tap), or join `code` from a link. */
export function openParty(h: PartyHooks, opts: { code?: string | null; create?: boolean }): PartyClient {
  return new PartyClient(h, opts);
}
