/**
 * The party client (docs/plans/moba/MULTIPLAYER.md §5, §8, lane P3). LAZY: only the party chunk imports it.
 *
 * Two halves:
 * - `reduceParty` (pure): server frames in, the next state and a list of effects out (send a frame, start the solo
 *   match, start the party match, a note, a vibration, close). Unit-tested without a DOM or a socket.
 * - `PartyClient`: owns the socket, runs the effects, and draws the pre-match screens (lobby, join by code, shared
 *   pick, loading, the "This party has ended" and other error screens). In-match it stays hidden; the match runs on
 *   a NetHost over the same socket, and the party view keeps updating through `socket.tap`, so the results land on a
 *   current lobby.
 */
import { SIM_VERSION } from '../sim/version';
import { NetHost, type NetNote } from '../net/net-host';
import { PartySocket, browserSocketEnv, type SocketEnv } from '../net/socket';
import { WS_PATH, normalizeCode, type ClientJson, type MatchMsg, type PartyView, type ServerJson } from '../net/proto';
import { TRICK_IDS } from '../data/tricks';
import { HERO_IDS } from '../data/heroes';
import { COPY, errorText, esc } from './ui/copy';
import { lobbyHtml, qrSheetHtml, shownName } from './ui/partyLobby';
import { joinCodeHtml, wireCodeBoxes } from './ui/joinCode';
import { decoratePick, heroBlock, lockedByOthers, pickHtml } from './ui/partyPick';
import { HERO_TEXT } from '../ui/heroText';
import { loadingHtml } from './ui/partyLoading';
import { qrSvg } from './qr';
import { cleanArt } from '../embed/bridge';
import { hideNames } from '../meta/partyPrefs';
import type { SeatInfo } from '../app/mpTypes';
import type { SlotStats } from '../sim/api';
import { againLabel, partyRows, partyRowsHtml } from './ui/partyResults';

// ------------------------------------------------------------------------------------------------ the reducer

/** How the party chunk was opened: the title's first tap, a link, "Join with code", or a reload with a seat. */
export type OpenMode = 'create' | 'join' | 'code' | 'resume';

export interface PartyState {
  mode: OpenMode;
  /** The code to join (`join` mode, or typed in `code` mode). */
  code: string | null;
  view: PartyView | null;
  inMatch: boolean;
  /** A solo match from a party of one runs (D10): the party stays open behind it. */
  solo: boolean;
  /** create/join already sent for this connection. */
  asked: boolean;
  welcomed: boolean;
  error: { code: string; retryMs?: number } | null;
}

export type PartyEffect =
  | { t: 'send'; msg: ClientJson }
  | { t: 'decide-later' }
  | { t: 'solo'; difficulty: string }
  | { t: 'match'; match: MatchMsg }
  | { t: 'note'; note: NetNote }
  | { t: 'vibrate' }
  | { t: 'close' }
  | { t: 'retry-start'; ms: number };

export type PartyEvent = { e: 'server'; m: ServerJson } | { e: 'decide' } | { e: 'join'; code: string } | { e: 'create' };

export const initialParty = (mode: OpenMode, code: string | null = null): PartyState => ({
  mode,
  code,
  view: null,
  inMatch: false,
  solo: false,
  asked: false,
  welcomed: false,
  error: null,
});

/** The screen a state shows. */
export type PartyScreen = 'connecting' | 'joincode' | 'ended' | 'error' | 'lobby' | 'pick' | 'loading' | 'match';

const ENDED = new Set(['party_not_found', 'party_ended', 'party_full', 'party_locked', 'party_busy', 'kicked', 'code_changed', 'already_in_party']);
const FATAL = new Set(['update_required', 'seat_elsewhere']);

export function screenOf(s: PartyState): PartyScreen {
  if (s.inMatch || s.solo) return 'match';
  if (s.error && FATAL.has(s.error.code)) return 'error';
  if (!s.view) {
    if (s.error && ENDED.has(s.error.code)) return s.mode === 'code' && s.error.code !== 'kicked' ? 'joincode' : 'ended';
    if (s.mode === 'code' && !s.asked) return 'joincode';
    return 'connecting';
  }
  if (s.view.phase === 'pick') return 'pick';
  if (s.view.phase === 'loading') return 'loading';
  if (s.view.phase === 'match') return 'loading';
  return 'lobby';
}

const nameIn = (v: PartyView | null, id: string): string => {
  const m = v?.members.find((x) => x.id === id);
  return m && v ? shownName(v, m) : 'A teammate';
};

/** Notes for lobby changes between two views (joins, leaves, a new leader). Only outside a match. */
function diffNotes(prev: PartyView | null, next: PartyView): NetNote[] {
  if (!prev || prev.code === '' || next.phase === 'match') return [];
  const out: NetNote[] = [];
  const before = new Set(prev.members.map((m) => m.id));
  const after = new Set(next.members.map((m) => m.id));
  for (const m of next.members) if (!before.has(m.id) && m.id !== next.you) out.push({ key: `pp-join-${m.id}`, title: COPY.joinedNote(shownName(next, m)), tone: 'good' });
  for (const m of prev.members) if (!after.has(m.id) && m.id !== next.you) out.push({ key: `pp-left-${m.id}`, title: COPY.leftNote(shownName(prev, m)), tone: 'info' });
  if (prev.leader !== next.leader && after.has(next.leader))
    out.push({ key: 'pp-leader', title: next.leader === next.you ? COPY.youLead : COPY.leaderNote(nameIn(next, next.leader)), tone: 'info' });
  return out;
}

/** The party state machine of the client. Pure. */
export function reduceParty(s: PartyState, ev: PartyEvent): { state: PartyState; effects: PartyEffect[] } {
  const fx: PartyEffect[] = [];
  const send = (msg: ClientJson) => fx.push({ t: 'send', msg });
  switch (ev.e) {
    case 'create':
      return { state: { ...s, mode: 'create', asked: true, error: null }, effects: [{ t: 'send', msg: { t: 'party.create', difficulty: 'easy' } }] };
    case 'join':
      return { state: { ...s, mode: s.mode === 'code' ? 'code' : 'join', code: ev.code, asked: true, error: null }, effects: [{ t: 'send', msg: { t: 'party.join', code: ev.code } }] };
    case 'decide': {
      // after `welcome`: a resumed seat already got its party frame; otherwise do what the player opened us for
      if (s.view || s.asked || !s.welcomed) return { state: s, effects: [] };
      // a closed tab's party (its code kept, no token): join it again; the relay hands back this player's own seat
      if (s.mode === 'resume' && s.code) {
        send({ t: 'party.join', code: s.code });
        return { state: { ...s, asked: true }, effects: fx };
      }
      if (s.mode === 'resume') return { state: s, effects: [{ t: 'close' }] };
      if (s.mode === 'join' && s.code) {
        send({ t: 'party.join', code: s.code });
        return { state: { ...s, asked: true }, effects: fx };
      }
      if (s.mode === 'create') {
        // the difficulty is filled in by the client (the player's last pick)
        send({ t: 'party.create', difficulty: '' });
        return { state: { ...s, asked: true }, effects: fx };
      }
      return { state: s, effects: [] };
    }
    case 'server':
      break;
  }
  const m = ev.m;
  switch (m.t) {
    case 'welcome':
      // a reconnect keeps the view (the relay re-sends the party right after welcome)
      return { state: { ...s, welcomed: true, asked: s.view ? s.asked : false }, effects: s.view ? [] : [{ t: 'decide-later' }] };
    case 'party': {
      if ((m as PartyView & { left?: boolean }).left || !m.code) return { state: { ...s, view: null }, effects: [{ t: 'close' }] };
      const notes = s.inMatch || s.solo ? [] : diffNotes(s.view, m);
      for (const n of notes) fx.push({ t: 'note', note: n });
      // the error of a refused action clears with the next good view, except a fatal one
      const error = s.error && FATAL.has(s.error.code) ? s.error : null;
      // the app ends a match (`matchOver`) once its results are done; the view keeps updating meanwhile
      return { state: { ...s, view: m, error, asked: true, code: m.code }, effects: fx };
    }
    case 'match':
      if (s.inMatch) return { state: s, effects: [] };
      return { state: { ...s, inMatch: true, solo: false, error: null }, effects: [{ t: 'match', match: m }] };
    case 'local':
      return { state: { ...s, solo: true }, effects: [{ t: 'solo', difficulty: m.difficulty }] };
    case 'nudge':
      return {
        state: s,
        effects: [{ t: 'note', note: { key: 'mp-nudge', title: COPY.nudgedYou(nameIn(s.view, m.from)), tone: 'info', ttl: 4000 } }, { t: 'vibrate' }],
      };
    case 'vote':
      if (m.kind === 'rematch' && m.result === 'pass') return { state: s, effects: [{ t: 'note', note: { key: 'mp-rematch', title: COPY.rematchNote, tone: 'info', ttl: 3000 } }] };
      return { state: s, effects: [] };
    case 'error': {
      if (s.inMatch) return { state: s, effects: [] }; // NetHost shows in-match errors on the rail
      const error = { code: m.code, ...(m.retryMs !== undefined ? { retryMs: m.retryMs } : {}) };
      if (m.code === 'kicked') return { state: { ...s, view: null, error, asked: false }, effects: [] };
      if (m.code === 'bad_ticket') return { state: s, effects: [{ t: 'note', note: { key: 'pp-ticket', title: COPY.badTicket, tone: 'info', ttl: 5000 } }] };
      if (m.code === 'rate_limited') return { state: { ...s, error }, effects: [] };
      if (m.code === 'server_busy') {
        const leader = !!s.view && s.view.leader === s.view.you;
        return { state: { ...s, error }, effects: leader ? [{ t: 'retry-start', ms: m.retryMs ?? 15_000 }] : [] };
      }
      // a quiet resume of a party that is gone: back to the title, no error screen
      if (s.mode === 'resume' && ENDED.has(m.code) && !s.view) return { state: { ...s, error, asked: false }, effects: [{ t: 'close' }] };
      // a refused join leaves us without a party (the code screen or the ended screen)
      if (ENDED.has(m.code) && !s.view) return { state: { ...s, error, asked: false }, effects: [] };
      return { state: { ...s, error }, effects: [] };
    }
    default:
      return { state: s, effects: [] };
  }
}

/** The in-match seats of a party view (lane M1): name, connection and card art per human slot. Pure. */
export function seatsOf(v: PartyView): SeatInfo[] {
  return v.members
    .filter((m) => typeof m.slot === 'number' && m.slot >= 0 && m.slot < 3)
    .map((m) => ({ slot: m.slot!, name: m.id === v.you ? (m.ownName ?? m.name) : m.name, conn: m.conn, art: cleanArt(m.card?.image) ?? null }));
}

// ------------------------------------------------------------------------------------------------ the client

export interface PartyHooks {
  root: HTMLElement;
  /** The backend origin (https://api.tokentails.com), already validated. */
  api: string;
  hero: string;
  trick: string;
  difficulty: string;
  /** The difficulties the leader can pick (the relay's list). */
  difficulties?: readonly string[];
  /** Highest tier this player unlocked (hint only, lowers a UI default). */
  maxDifficulty: string;
  newbie: boolean;
  build: string;
  /** A single-use party ticket from the host (embed), or null (standalone: an unscored guest). */
  ticket(): Promise<string | null>;
  guestKey(): string;
  /** The worn card's cat id (the relay resolves it and checks ownership), or null. */
  cardId?(): string | null;
  /** Start loading the match chunk and assets (during the lobby and the pick). */
  preload?(): Promise<unknown>;
  /** Start the party match in the app (a MatchSession on this NetHost). */
  startMatch(host: () => NetHost, match: MatchMsg, view: PartyView): void;
  /** D10: a party of one with Open seats off plays a normal local match (the party stays open). */
  startSolo(difficulty: string): void;
  /** The rail of the running match (in-match notes). */
  notify(n: NetNote): void;
  /** The party closed: back to the title. */
  close(): void;
  /** The invite URL for a code (the embed URL, D12). */
  inviteUrl(code: string): string;
  /** The embed host's share sheet; false when there is no host. */
  share?(url: string, text: string): boolean;
  analytics?(event: string, props: Record<string, string | number | boolean>): void;
  /** Test seams. */
  env?: SocketEnv;
  now?(): number;
}

/** The party code this browser is in (or null when it left): a closed tab rejoins by it (src/app/app.ts). */
function rememberParty(code: string | null): void {
  try {
    if (code) localStorage.setItem('pl.party.last', JSON.stringify({ code, at: Date.now() }));
    else localStorage.removeItem('pl.party.last');
  } catch {
    /* private mode */
  }
}

const heroName = (h: string): string => (h in HERO_TEXT ? HERO_TEXT[h as keyof typeof HERO_TEXT].title : h);

const simHash = (): string => (typeof __SIM_HASH__ !== 'undefined' ? __SIM_HASH__ : '0000000000000000');
const DIFFS = ['easy', 'normal', 'hard'] as const;

export class PartyClient {
  readonly socket: PartySocket;
  readonly el: HTMLElement;
  private readonly card: HTMLElement;
  private readonly notes: HTMLElement;
  state: PartyState;
  private host: NetHost | null = null;
  private hover: string;
  private trick: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private decideTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private deadlineAt = 0;
  private waitingAt = 0;
  private nudged = new Map<string, number>();
  private drawn = '';
  private qrCache = { code: '', svg: '' };
  private cardSent = false;
  private preloading: Promise<unknown> | null = null;
  private closed = false;
  private readonly now: () => number;
  private readonly unwatch: () => void;

  constructor(
    private readonly h: PartyHooks,
    opts: { mode: OpenMode; code?: string | null },
  ) {
    this.now = h.now ?? (() => Date.now());
    this.openedAt = this.now();
    this.hover = h.hero;
    this.trick = h.trick;
    this.state = initialParty(opts.mode, opts.code ?? null);
    const url = `${h.api.replace(/^http/, 'ws').replace(/\/+$/, '')}${WS_PATH}`;
    this.el = document.createElement('div');
    this.el.className = 'pl-party';
    this.el.dataset.testid = 'party';
    this.el.innerHTML = '<div class="pp-notes" aria-live="polite"></div><div class="pp-body"></div>';
    this.notes = this.el.firstElementChild as HTMLElement;
    this.card = this.el.lastElementChild as HTMLElement;
    h.root.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => this.onChange(e));
    this.socket = new PartySocket(
      url,
      { sim: SIM_VERSION, simHash: simHash(), build: h.build, guestKey: h.guestKey(), hint: { maxDifficulty: h.maxDifficulty, newbie: h.newbie } },
      h.env ?? browserSocketEnv(),
    );
    this.socket.tap({
      json: (m) => this.dispatch({ e: 'server', m }),
      state: (s) => {
        if (s === 'reconnecting' && !this.state.inMatch) this.note({ key: 'pp-net', title: COPY.offline, tone: 'info', ttl: 3000 });
      },
    });
    // the lobby's own presence: a hidden tab is "away" (the waiting chip, §5.1); in a match NetHost does it
    const onVis = (): void => {
      if (this.state.inMatch || this.state.solo || !this.state.view) return;
      this.socket.sendJson({ t: document.hidden ? 'away' : 'back' });
    };
    document.addEventListener('visibilitychange', onVis);
    this.unwatch = () => document.removeEventListener('visibilitychange', onVis);
    this.render();
    void h.ticket().then(
      (t) => this.connect(t),
      () => this.connect(null),
    );
    this.timer = setInterval(() => this.everySecond(), 250);
  }

  private connect(ticket: string | null): void {
    if (this.closed) return;
    if (ticket) (this.socket as unknown as { hello: { ticket?: string } }).hello.ticket = ticket;
    this.socket.connect();
  }

  // -------------------------------------------------------------------------------------------- state and effects

  dispatch(ev: PartyEvent): void {
    if (this.closed) return;
    const prev = this.state;
    const { state, effects } = reduceParty(prev, ev);
    this.state = state;
    if (state.view?.deadlineMs !== undefined && ev.e === 'server' && ev.m.t === 'party') this.deadlineAt = this.now() + state.view.deadlineMs;
    if (state.view?.waiting?.length && !prev.view?.waiting?.length) this.waitingAt = this.now();
    if (!state.view?.waiting?.length) this.waitingAt = 0;
    // results together (M6): the rematch passed: hand the screen back to the party first, so "Leader started a
    // rematch" shows on the party's own band (the match rail is gone with the match)
    if (ev.e === 'server' && ev.m.t === 'vote' && ev.m.kind === 'rematch' && ev.m.result === 'pass' && this.resultsDone) {
      const done = this.resultsDone;
      this.resultsEl = null;
      this.resultsDone = null;
      done();
    }
    for (const f of effects) this.run(f);
    // in a match, the party HUD keeps names, connection dots and card art current (a friend dropped, came back, joined)
    if (this.host && state.view && state.view !== prev.view) this.host.setSeats(seatsOf(state.view));
    if (ev.e === 'server' && ev.m.t === 'vote' && ev.m.kind === 'rematch' && ev.m.result === 'pass')
      this.h.analytics?.('mp_rematch', { members: state.view?.members.length ?? 0, kept_heroes: this.keepHero });
    // results together (M6): the label counts who pressed Play again; the pick takes over once the rematch passed
    if (this.resultsEl && state.view && state.view !== prev.view) {
      const b = this.resultsEl.querySelector<HTMLElement>('[data-a="again"]');
      if (b) b.textContent = againLabel(state.view, this.againPressed);
      if (state.view.phase === 'pick') {
        const done = this.resultsDone;
        this.resultsEl = null;
        this.resultsDone = null;
        done?.();
      }
    }
    if (state.view && !prev.view) this.enteredParty();
    if (state.view?.code && state.view.code !== prev.view?.code) rememberParty(state.view.code);
    if (state.view?.phase === 'pick' && prev.view?.phase !== 'pick') this.enteredPick();
    else if (state.view?.phase === 'pick' && prev.view?.phase === 'pick') this.pickChanged(prev.view, state.view);
    if (state.view?.phase === 'loading' && prev.view?.phase !== 'loading') void this.enteredLoading();
    if (!state.inMatch && !state.solo) this.render();
  }

  private run(f: PartyEffect): void {
    switch (f.t) {
      case 'send':
        if (f.msg.t === 'party.create') {
          this.socket.sendJson({ t: 'party.create', difficulty: this.h.difficulty });
          this.h.analytics?.('party_create', { difficulty: this.h.difficulty });
        } else this.socket.sendJson(f.msg);
        return;
      case 'decide-later':
        if (this.decideTimer) clearTimeout(this.decideTimer);
        this.decideTimer = setTimeout(() => this.dispatch({ e: 'decide' }), 300);
        return;
      case 'solo':
        this.el.hidden = true;
        this.h.startSolo(f.difficulty);
        return;
      case 'match':
        this.el.hidden = true;
        this.h.startMatch(
          () => {
            this.host = new NetHost(this.socket, f.match, { notify: (n) => this.h.notify(n), track: (e, p) => this.h.analytics?.(e, p) });
            if (this.state.view) this.host.setSeats(seatsOf(this.state.view));
            return this.host;
          },
          f.match,
          this.state.view!,
        );
        return;
      case 'note':
        this.note(f.note);
        return;
      case 'vibrate':
        try {
          navigator.vibrate?.(200);
        } catch {
          /* not allowed */
        }
        return;
      case 'close':
        this.close();
        return;
      case 'retry-start':
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.socket.sendJson({ t: 'party.start' }), f.ms);
        return;
    }
  }

  private enteredParty(): void {
    const via = this.state.mode === 'create' ? 'create' : this.state.mode === 'resume' ? 'resume' : this.state.mode === 'code' ? 'code' : 'link';
    if (via !== 'create') this.h.analytics?.('party_join', { via, members: this.state.view?.members.length ?? 0 });
    // match assets load during the lobby and the pick (§5.1)
    this.preloading ??= this.h.preload?.() ?? Promise.resolve();
    const v = this.state.view!;
    if (!this.cardSent && (v.phase === 'lobby' || v.phase === 'results')) {
      this.cardSent = true;
      const id = this.h.cardId?.() ?? null;
      if (id) this.socket.sendJson({ t: 'party.card', catId: id });
    }
  }

  private enteredPick(): void {
    const v = this.state.view!;
    const me = v.members.find((m) => m.id === v.you);
    // rematch prefills the last pick; otherwise the title's hero, when free
    if (me?.hero) this.hover = me.hero;
    if (me?.trick) this.trick = me.trick;
    if (!heroBlock(v, this.hover)) this.socket.sendJson({ t: 'pick.hover', hero: this.hover });
    // M6 "Play again together": the same hero, locked at once ("Change hero" leaves the pick open)
    if (this.keepHero && me?.hero && !heroBlock(v, me.hero)) this.socket.sendJson({ t: 'pick.lock', hero: me.hero, trick: me.trick ?? this.trick });
    this.keepHero = false;
    this.againPressed = false;
  }

  /**
   * The pick view changed under us: a hero we hovered was just locked by a friend (or is on the other side now), so the
   * local hover falls back to what the relay holds for us; a lock the leader's side switch undid says so.
   */
  private unlocking = false;
  private pickChanged(prev: PartyView, v: PartyView): void {
    const me = v.members.find((m) => m.id === v.you);
    const was = prev.members.find((m) => m.id === prev.you);
    if (was?.locked && me && !me.locked && !this.unlocking) this.note({ key: 'pp-side', title: COPY.sideSwitched, tone: 'info', ttl: 4000 });
    if (me && !me.locked) this.unlocking = false;
    if (me?.locked || !this.hover) return;
    const taker = lockedByOthers(v).get(this.hover);
    if (!taker && !heroBlock(v, this.hover)) return;
    if (taker) this.note({ key: 'pp-taken', title: COPY.heroTaken(heroName(this.hover), taker), tone: 'info', ttl: 3500 });
    this.hover = me?.hero && !heroBlock(v, me.hero) ? me.hero : '';
    this.drawn = '';
  }

  // -------------------------------------------------------------------------------------------- results together (M6)

  private resultsEl: HTMLElement | null = null;
  private resultsDone: (() => void) | null = null;
  private againPressed = false;
  private keepHero = false;

  /** The party rows of the results screen (names honour Hide names; card art from the party view). */
  resultsRows(stats: readonly SlotStats[], mySlot: number, baseNames: readonly string[], end: { names?: (string | null)[]; pilotPct?: number[] }): string {
    const v = this.state.view;
    const art: (string | null)[] = [null, null, null, null, null, null];
    if (v) for (const s of seatsOf(v)) art[s.slot] = s.art;
    return partyRowsHtml(
      partyRows({ stats, mySlot, partyNames: end.names ?? [], baseNames, pilotPct: end.pilotPct ?? [], art, hide: hideNames() }),
    );
  }

  /** "Play again together (0/2)" now. */
  againText(): string {
    return againLabel(this.state.view, this.againPressed);
  }

  /** The app's results screen is up: keep its Play again label current; `done` hands the screen back for the pick. */
  bindResults(el: HTMLElement, done: () => void): void {
    this.resultsEl = el;
    this.resultsDone = done;
    this.againPressed = false;
  }

  /** "Play again together" (keep the hero) or "Change hero" (the pick stays open). */
  again(keepHero: boolean): void {
    this.keepHero = keepHero;
    this.againPressed = true;
    this.socket.sendJson({ t: 'vote', kind: 'rematch', yes: true });
    const b = this.resultsEl?.querySelector<HTMLElement>('[data-a="again"]');
    if (b) b.textContent = againLabel(this.state.view, true);
    this.resultsEl?.querySelectorAll<HTMLButtonElement>('[data-a="again"], [data-a="change"]').forEach((x) => x.classList.add('pressed'));
  }

  /** "Leave party" from the results screen (the app then goes back to the title). */
  leaveParty(): void {
    this.resultsEl = null;
    this.resultsDone = null;
    if (this.state.view) this.socket.sendJson({ t: 'party.leave' });
    this.h.analytics?.('party_leave', { phase: 'results', reason: 'button' });
    this.close();
  }

  private async enteredLoading(): Promise<void> {
    this.socket.sendJson({ t: 'load', pct: 50 });
    try {
      await this.preloading;
    } catch {
      /* the match still loads on demand */
    }
    if (!this.closed) this.socket.sendJson({ t: 'loaded' });
  }

  /** The app finished the match (or the solo match) and the results: show the party again. */
  matchOver(): void {
    this.state = { ...this.state, inMatch: false, solo: false };
    this.host = null;
    this.resultsEl = null;
    this.resultsDone = null;
    this.el.hidden = false;
    this.drawn = '';
    this.render();
  }

  get suspended(): boolean {
    return this.state.solo || this.state.inMatch;
  }

  // -------------------------------------------------------------------------------------------- notes

  /** A note: the match rail in a match, the screen's own top band otherwise (never mid-screen). */
  note(n: NetNote): void {
    if (this.state.inMatch) return this.h.notify(n);
    const el = document.createElement('div');
    el.className = `pp-note-item tone-${n.tone}`;
    el.dataset.key = n.key;
    el.textContent = n.title;
    this.notes.querySelector(`[data-key="${CSS.escape(n.key)}"]`)?.remove();
    this.notes.appendChild(el);
    while (this.notes.children.length > 2) this.notes.firstElementChild?.remove();
    setTimeout(() => el.remove(), n.ttl ?? 3500);
  }

  // -------------------------------------------------------------------------------------------- input

  private onChange(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.dataset.p === 'open') this.socket.sendJson({ t: 'party.set', openSeats: t.checked });
    else if (t.dataset.p === 'lock') this.socket.sendJson({ t: 'party.set', locked: t.checked });
  }

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    const a = t.dataset.p!;
    const v = this.state.view;
    const s = this.socket;
    switch (a) {
      case 'start':
        s.sendJson({ t: 'party.start' });
        this.h.analytics?.('party_start', { members: v?.members.length ?? 0, waited_s: this.waitingAt ? Math.round((this.now() - this.waitingAt) / 1000) : 0 });
        return;
      case 'rematch':
        s.sendJson({ t: 'vote', kind: 'rematch', yes: true });
        t.setAttribute('disabled', '');
        return;
      case 'leave':
        // one tap arms it ("Tap again to leave"), the second within 3 s leaves: a stray tap never drops the party
        if (v && v.members.length > 1 && !this.armed(t, 'leave')) return;
        if (v) s.sendJson({ t: 'party.leave' });
        this.h.analytics?.('party_leave', { phase: v?.phase ?? 'none' });
        this.close();
        return;
      case 'unlock':
        this.unlocking = true;
        s.sendJson({ t: 'pick.unlock' });
        return;
      case 'back':
        this.close();
        return;
      case 'share':
        return this.share(t);
      case 'copy':
        return this.copy(t);
      case 'qr':
        if (!v) return;
        this.card.insertAdjacentHTML('beforeend', qrSheetHtml(this.qr(v.code), v.code));
        this.h.analytics?.('party_share', { method: 'qr' });
        return;
      case 'qr-close':
        this.card.querySelector('.pp-sheet')?.remove();
        return;
      case 'diff':
        s.sendJson({ t: 'party.set', difficulty: t.dataset.v! });
        return;
      case 'newcode':
        s.sendJson({ t: 'party.newcode' });
        return;
      case 'kick':
        if (!this.armed(t, `kick:${t.dataset.m}`)) return;
        s.sendJson({ t: 'party.kick', member: t.dataset.m! });
        return;
      case 'lead':
        s.sendJson({ t: 'party.lead', member: t.dataset.m! });
        return;
      case 'nudge': {
        const id = t.dataset.m!;
        s.sendJson({ t: 'party.nudge', member: id });
        this.nudged.set(id, this.now());
        this.drawn = '';
        this.render();
        return;
      }
      case 'hero':
        if (!HERO_IDS.includes(t.dataset.v as never)) return;
        this.hover = t.dataset.v!;
        s.sendJson({ t: 'pick.hover', hero: this.hover });
        this.drawn = '';
        this.render();
        return;
      case 'trick':
        if (!TRICK_IDS.includes(t.dataset.v as never)) return;
        this.trick = t.dataset.v!;
        this.drawn = '';
        this.render();
        return;
      case 'lock':
        if (!v || !this.hover || heroBlock(v, this.hover)) return;
        s.sendJson({ t: 'pick.lock', hero: this.hover, trick: this.trick });
        this.h.analytics?.('party_pick', { hero: this.hover, locked_s_left: Math.max(0, Math.round((this.deadlineAt - this.now()) / 1000)), auto: false, newbie: this.h.newbie });
        return;
      case 'join-code': {
        const code = normalizeCode(this.codeValue());
        if (!code) {
          this.state = { ...this.state, error: { code: 'bad_code' } };
          this.drawn = '';
          this.render();
          return;
        }
        this.dispatch({ e: 'join', code });
        return;
      }
      case 'paste':
        void navigator.clipboard?.readText?.().then(
          (text) => this.codeBoxes?.fill(text),
          () => undefined,
        );
        return;
      case 'solo':
        // "This party has ended" → Play now: a normal solo match
        this.close();
        this.h.startSolo(this.h.difficulty);
        return;
      case 'own':
        // "Start your own party"
        this.state = { ...initialParty('create'), welcomed: this.state.welcomed };
        this.drawn = '';
        if (this.state.welcomed) this.dispatch({ e: 'create' });
        else this.render();
        return;
      case 'tocode':
        this.state = { ...initialParty('code'), welcomed: this.state.welcomed };
        this.drawn = '';
        this.render();
        return;
      case 'reload':
        location.reload();
        return;
    }
  }

  /** A two-tap confirm: the first tap marks the button (`data-sure`, "Tap again…") for 3 s; true on the second. */
  private sure: { key: string; until: number } | null = null;
  private armed(btn: HTMLElement, key: string): boolean {
    const now = this.now();
    if (this.sure && this.sure.key === key && now < this.sure.until) {
      this.sure = null;
      return true;
    }
    this.sure = { key, until: now + 3000 };
    btn.dataset.sure = '1';
    const label = key === 'leave' ? COPY.leaveSure : COPY.removeSure;
    const old = btn.innerHTML;
    if (key === 'leave') btn.textContent = label;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    setTimeout(() => {
      if (!btn.isConnected) return;
      delete btn.dataset.sure;
      if (key === 'leave') btn.innerHTML = old;
    }, 3000);
    return false;
  }

  private codeBoxes: ReturnType<typeof wireCodeBoxes> | null = null;
  private codeValue(): string {
    return this.codeBoxes?.value() ?? '';
  }

  private share(btn: HTMLElement): void {
    const v = this.state.view;
    if (!v) return;
    const url = this.h.inviteUrl(v.code);
    const text = 'Play Paw Legends with me';
    if (this.h.share?.(url, text)) {
      this.h.analytics?.('party_share', { method: 'share' });
      return;
    }
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      this.h.analytics?.('party_share', { method: 'share' });
      void nav.share({ title: text, url }).catch(() => undefined);
      return;
    }
    this.copy(btn);
  }

  private copy(btn: HTMLElement): void {
    const v = this.state.view;
    if (!v) return;
    const url = this.h.inviteUrl(v.code);
    this.h.analytics?.('party_share', { method: 'copy' });
    const done = (): void => {
      this.note({ key: 'pp-copy', title: COPY.linkCopied, tone: 'good', ttl: 2500 });
      const old = btn.textContent;
      btn.textContent = COPY.copied;
      setTimeout(() => (btn.textContent = old), 1200);
    };
    const fallback = (): void => {
      // the old way, for a frame without clipboard permission
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
      if (ok) done();
    };
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(url).then(done, fallback);
    else fallback();
  }

  private qr(code: string): string {
    if (this.qrCache.code !== code) this.qrCache = { code, svg: qrSvg(this.h.inviteUrl(code), COPY.scanToJoin) };
    return this.qrCache.svg;
  }

  // -------------------------------------------------------------------------------------------- drawing

  private everySecond(): void {
    if (this.closed || this.state.inMatch || this.state.solo) return;
    if (screenOf(this.state) === 'connecting') this.render();
    const v = this.state.view;
    if (v?.phase === 'pick') {
      const t = this.card.querySelector('[data-timer]');
      if (t) t.textContent = `${this.secondsLeft()}s`;
    }
    // the "Start anyway" label 10 s after someone went away, and the nudge cooldown
    const anyway = !!this.waitingAt && this.now() - this.waitingAt >= 10_000;
    let changed = anyway !== this.anyway;
    this.anyway = anyway;
    for (const [id, at] of this.nudged)
      if (this.now() - at >= 10_000) {
        this.nudged.delete(id);
        changed = true;
      }
    if (changed) this.render();
  }
  private anyway = false;
  private openedAt = 0;

  private secondsLeft(): number {
    return Math.max(0, Math.ceil((this.deadlineAt - this.now()) / 1000));
  }

  render(): void {
    if (this.closed) return;
    const s = this.state;
    const screen = screenOf(s);
    const err = s.error ? errorText(s.error.code, Math.ceil((s.error.retryMs ?? 0) / 1000)) : null;
    this.el.dataset.screen = screen;
    let html = '';
    switch (screen) {
      case 'match':
        return;
      case 'connecting': {
        const waited = Math.floor((this.now() - this.openedAt) / 1000);
        const slow = waited >= 6 ? `<p class="pp-dim pp-slow" data-testid="party-slow">${esc(COPY.slowJoin(waited))}</p>` : '';
        html = `<div class="pp-card pp-narrow" data-testid="party-connecting"><h2>${COPY.title}</h2><p class="pp-dim">${esc(s.code ? COPY.joining(`${s.code.slice(0, 3)} ${s.code.slice(3)}`) : COPY.connecting)}</p>${slow}<button type="button" class="pl-btn ghost small" data-p="back">${COPY.back}</button></div>`;
        break;
      }
      case 'joincode':
        html = joinCodeHtml(err, s.code ?? '');
        break;
      case 'ended': {
        const title = errorText(s.error?.code ?? 'party_ended');
        html = `<div class="pp-card pp-narrow pp-ended" data-testid="party-ended"><h2>${esc(title)}</h2><div class="pp-col"><button type="button" class="pl-btn big" data-p="solo" data-testid="party-play-now">${COPY.playNow}</button><button type="button" class="pl-btn ghost" data-p="own" data-testid="party-own">${COPY.ownParty}</button><button type="button" class="pl-btn ghost small" data-p="back">${COPY.back}</button></div></div>`;
        break;
      }
      case 'error':
        html = `<div class="pp-card pp-narrow" data-testid="party-error"><h2>${esc(err ?? COPY.generic)}</h2><div class="pp-col">${s.error?.code === 'update_required' ? `<button type="button" class="pl-btn big" data-p="reload">${COPY.reload}</button>` : ''}<button type="button" class="pl-btn ghost small" data-p="back">${COPY.back}</button></div></div>`;
        break;
      case 'lobby':
        html = lobbyHtml({
          view: s.view!,
          qr: this.qr(s.view!.code),
          error: err,
          startAnyway: this.anyway,
          nudged: new Set(this.nudged.keys()),
          difficulties: this.h.difficulties ?? DIFFS,
          hideNames: hideNames(),
        });
        break;
      case 'pick':
        html = pickHtml({ view: s.view!, hover: this.hover, trick: this.trick, secondsLeft: this.secondsLeft(), error: err, hideNames: hideNames() });
        break;
      case 'loading':
        html = loadingHtml(s.view!);
        break;
    }
    // the timer text changes every second; skip identical redraws (keeps focus and the code boxes)
    const key = screen === 'pick' ? html.replace(/data-timer[^>]*>\d+s/, '') : html;
    if (key === this.drawn) return;
    const keepSheet = this.card.querySelector('.pp-sheet');
    this.drawn = key;
    this.card.innerHTML = html;
    if (keepSheet && screen === 'lobby') this.card.appendChild(keepSheet);
    if (screen === 'pick') decoratePick(this.card, s.view!);
    if (screen === 'joincode') {
      this.codeBoxes = wireCodeBoxes(this.card, (code) => {
        const c = normalizeCode(code);
        if (c && !this.state.asked) this.dispatch({ e: 'join', code: c });
      });
    } else this.codeBoxes = null;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    rememberParty(null);
    if (this.timer) clearInterval(this.timer);
    if (this.decideTimer) clearTimeout(this.decideTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.unwatch();
    this.socket.close(true);
    this.el.remove();
    this.h.close();
  }

  /** Open the party screen again after the title asked (the party survived a solo match). */
  show(): void {
    this.matchOver();
  }
}

/** Open the party flow: create a party at once (the first tap), join `code` (a link), type a code, or resume a seat. */
export function openParty(h: PartyHooks, opts: { mode: OpenMode; code?: string | null }): PartyClient {
  return new PartyClient(h, opts);
}
