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
import { WS_PATH, normalizeCode, type ClientJson, type MatchMsg, type MmSide, type PartyView, type ServerJson } from '../net/proto';
import { TRICK_IDS } from '../data/tricks';
import { HERO_IDS } from '../data/heroes';
import { COPY, clockText, errorText, esc } from './ui/copy';
import { queueCardHtml, type QueueStop } from './ui/queueCard';
import { acceptCardHtml } from './ui/acceptCard';
import { lobbyHtml, qrSheetHtml, shownName } from './ui/partyLobby';
import { joinCodeHtml, wireCodeBoxes } from './ui/joinCode';
import { decoratePick, firstFree, heroBlock, lockedByOthers, pickHtml } from './ui/partyPick';
import { HERO_TEXT } from '../ui/heroText';
import { loadingHtml } from './ui/partyLoading';
import { qrSvg } from './qr';
import { cleanArt } from '../embed/bridge';
import { hideNames } from '../meta/partyPrefs';
import type { SeatInfo } from '../app/mpTypes';
import type { SlotStats } from '../sim/api';
import { againLabel, partyRows, partyRowsHtml } from './ui/partyResults';

// ------------------------------------------------------------------------------------------------ the reducer

/**
 * How the party chunk was opened: the title's first tap, a link, "Join with code", a reload with a seat, or "Play
 * online" (Quick Play co-op, M1A-IMPL.md §6: `mm.join` goes out by itself after `welcome`), or `back`: a closed tab
 * that was a stranger in a live Quick Play match (no code to rejoin by) asks for its own seat with `mm.back`.
 */
export type OpenMode = 'create' | 'join' | 'code' | 'resume' | 'queue' | 'back';

/** What the queue found (`mm.found`: counts only, never names). */
export interface MmFound {
  side: 'cat' | 'dog';
  humans: number;
  bots: number;
  difficulty: string;
}

/** The last `mm.status`. */
export interface QueueStatus {
  waitedMs: number;
  estimateMs: number;
  found: number;
  lowPriorityMs?: number;
  warn?: 'leaver';
}

/** Quick Play: this player (or its friend party) searching, matched, or stopped. */
export interface QueueState {
  side: MmSide;
  /** 'casual': PvP (PROTO 3, V16.md §4.1). */
  mode: 'coop' | 'casual';
  /** Casual: no opponent by 45 s, the search moved to co-op (the card offers Keep waiting). */
  toCoop?: boolean;
  /** Casual: back at the front after someone declined a found match. */
  requeued?: boolean;
  /** Casual: humans found on the other team. */
  theirs?: number;
  status: QueueStatus | null;
  /** The search stopped (the card offers Search again), or null while searching. */
  stopped: QueueStop | null;
  retryMs?: number;
  /** `mm.found` arrived: the card shows "Match found" until `found-shown` (1.2 s). */
  found: MmFound | null;
  /** A friend party queued together (its leader sent `mm.join`). */
  party: boolean;
  /** The party view said it is queued (a later view without `queue` means the search ended). */
  seen: boolean;
  /** Play again after a Quick Play match (analytics). */
  requeue: boolean;
}

/** A backfill offer (`mm.backfill.offer`) waiting for Join or Keep searching. */
export interface OfferState {
  id: string;
  side: 'cat' | 'dog';
  clockS: number;
  score: [number, number];
  expiresMs: number;
}

/** Casual PvP: a found match waiting for Accept (10 s). */
export interface AcceptState {
  match: string;
  side: 'cat' | 'dog';
  mine: [number, number];
  theirs: [number, number];
  totalMs: number;
  accepted: boolean;
  yes: number;
  need: number;
}

export interface PartyState {
  mode: OpenMode;
  /** Casual PvP: the Accept card, or null. */
  accept: AcceptState | null;
  /** Casual PvP: the last match was voided by a remake (the void screen). */
  voided: boolean;
  /** The relay speaks casual PvP (`welcome.proto` >= 3). */
  pvpOk: boolean;
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
  /** Quick Play (PROTO 2). */
  queue: QueueState | null;
  /** The last match the queue found (the pick's "2 players + 1 bot" line). */
  found: MmFound | null;
  offer: OfferState | null;
  /** The relay speaks Quick Play (`welcome.proto` ≥ 2). */
  mmOk: boolean;
}

export type PartyEffect =
  | { t: 'send'; msg: ClientJson }
  | { t: 'decide-later' }
  | { t: 'solo'; difficulty: string }
  | { t: 'match'; match: MatchMsg }
  | { t: 'note'; note: NetNote }
  | { t: 'vibrate' }
  | { t: 'close' }
  | { t: 'retry-start'; ms: number }
  /** Quick Play: hold "Match found" for 1.2 s, then the pick. */
  | { t: 'found-hold' }
  /** A backfill took this player's seat: end the running match, if any. */
  | { t: 'seat-taken' }
  /** `mm.cancel{server}`: wait for the restarted relay's welcome, and search again by ourselves if none comes. */
  | { t: 'server-wait' }
  | { t: 'track'; event: string; props: Record<string, string | number | boolean> }
  /** Casual PvP: the Accept card's 10 s clock starts. */
  | { t: 'accept-clock' }
  /** Casual PvP: a remake voided the running match (end it, show the void screen). */
  | { t: 'voided' };

export type PartyEvent =
  | { e: 'server'; m: ServerJson }
  | { e: 'decide' }
  | { e: 'join'; code: string }
  | { e: 'create' }
  /** Quick Play: search (the title's "Play online", the lobby's leader button, Search again, Play again). */
  | { e: 'queue'; side: MmSide; requeue?: boolean; mode?: 'coop' | 'casual' }
  /** Casual PvP: Accept or Decline the found match (null: the 10 s ran out locally). */
  | { e: 'accept'; yes: boolean | null }
  /** Casual PvP: Keep waiting after the move to co-op. */
  | { e: 'keep' }
  /** Cancel the search. */
  | { e: 'unqueue' }
  | { e: 'side'; side: MmSide }
  | { e: 'found-shown' }
  | { e: 'offer'; yes: boolean | null };

/** A fresh search. */
export const searching = (side: MmSide, o: { party?: boolean; requeue?: boolean; mode?: 'coop' | 'casual' } = {}): QueueState => ({
  side,
  mode: o.mode ?? 'coop',
  status: null,
  stopped: null,
  found: null,
  party: !!o.party,
  seen: false,
  requeue: !!o.requeue,
});

export const initialParty = (mode: OpenMode, code: string | null = null, side: MmSide = 'any', queueMode: 'coop' | 'casual' = 'coop'): PartyState => ({
  mode,
  accept: null,
  voided: false,
  pvpOk: false,
  code,
  view: null,
  inMatch: false,
  solo: false,
  asked: false,
  welcomed: false,
  error: null,
  queue: mode === 'queue' ? searching(side, { mode: queueMode }) : null,
  found: null,
  offer: null,
  mmOk: false,
});

/** This player is a stranger in a Quick Play party (a stranger's view never carries the code). */
export const isStranger = (v: PartyView | null): boolean => !!v?.mm && v.code === '';

/** The screen a state shows. */
export type PartyScreen = 'connecting' | 'joincode' | 'ended' | 'error' | 'lobby' | 'pick' | 'loading' | 'match' | 'queue' | 'accept' | 'void';

const ENDED = new Set(['party_not_found', 'party_ended', 'party_full', 'party_locked', 'party_busy', 'kicked', 'code_changed', 'already_in_party', 'seat_taken']);
const FATAL = new Set(['update_required', 'seat_elsewhere']);

export function screenOf(s: PartyState): PartyScreen {
  if (s.inMatch || s.solo) return 'match';
  if (s.error && FATAL.has(s.error.code)) return 'error';
  if (s.voided && !s.queue) return 'void';
  if (s.accept) return 'accept';
  if (s.error?.code === 'seat_taken' && !s.view) return 'ended';
  // Quick Play: the queue card (searching, "Match found", stopped) over the title, a party lobby or results
  if (s.queue && (!s.view || s.queue.found || s.view.phase === 'lobby' || s.view.phase === 'results')) return 'queue';
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
      // a stranger's closed tab: its own live Quick Play seat back (a guest without one gets party_not_found)
      if (s.mode === 'back') {
        if (!s.mmOk) return { state: s, effects: [{ t: 'close' }] };
        send({ t: 'mm.back' });
        return { state: { ...s, asked: true }, effects: fx };
      }
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
    case 'queue': {
      const party = !!s.view && !isStranger(s.view);
      const mode = ev.mode ?? s.queue?.mode ?? 'coop';
      const queue = searching(ev.side, { party, requeue: ev.requeue, mode });
      const base = { ...s, voided: false, accept: null };
      if (!s.welcomed) return { state: { ...base, queue, error: null, offer: null }, effects: [] };
      if (!s.mmOk || (mode === 'casual' && !s.pvpOk)) return { state: { ...base, queue: { ...queue, stopped: 'update' } }, effects: [] };
      send({ t: 'mm.join', queue: mode, side: ev.side });
      return { state: { ...base, queue, error: null, offer: null, asked: true }, effects: fx };
    }
    case 'accept': {
      const a = s.accept;
      if (!a) return { state: s, effects: [] };
      if (ev.yes === true) {
        send({ t: 'mm.accept', match: a.match, yes: true });
        return { state: { ...s, accept: { ...a, accepted: true, yes: Math.max(a.yes, 1) } }, effects: fx };
      }
      // a decline, or the clock ran out here: the relay answers mm.cancel{declined|timeout}
      if (ev.yes === false) send({ t: 'mm.accept', match: a.match, yes: false });
      return { state: { ...s, accept: ev.yes === false ? null : a }, effects: fx };
    }
    case 'keep': {
      const q = s.queue;
      if (!q || !q.toCoop) return { state: s, effects: [] };
      send({ t: 'mm.join', queue: 'casual', side: q.side });
      return { state: { ...s, queue: { ...q, mode: 'casual', toCoop: false } }, effects: fx };
    }
    case 'unqueue':
      if (s.queue && !s.queue.stopped && s.welcomed) send({ t: 'mm.leave' });
      return { state: { ...s, queue: null, offer: null }, effects: fx };
    case 'side':
      if (!s.queue) return { state: s, effects: [] };
      return { state: { ...s, queue: { ...s.queue, side: ev.side } }, effects: [] };
    case 'found-shown':
      if (!s.queue?.found) return { state: s, effects: [] };
      return { state: { ...s, queue: null }, effects: [] };
    case 'offer': {
      const o = s.offer;
      if (!o) return { state: s, effects: [] };
      if (ev.yes !== null) send({ t: 'mm.backfill', offer: o.id, yes: ev.yes });
      fx.push({ t: 'track', event: 'mm_backfill_join', props: { answer: ev.yes === null ? 'timeout' : ev.yes ? 'yes' : 'no', clock_s: o.clockS } });
      return { state: { ...s, offer: null }, effects: fx };
    }
    case 'server':
      break;
  }
  const m = ev.m;
  switch (m.t) {
    case 'welcome': {
      const mmOk = typeof m.proto === 'number' && m.proto >= 2;
      const pvpOk = typeof m.proto === 'number' && m.proto >= 3;
      const q = s.queue;
      // Quick Play: the first welcome, a reconnect, or a relay restart (`mm.cancel{server}`): (re)send `mm.join`, so
      // the player sees one continuous search. A friend party's search is the leader's to re-send.
      if (q && !q.stopped && !q.found && !s.accept && (!s.view || isStranger(s.view) || s.view.leader === s.view.you)) {
        if (!mmOk || (q.mode === 'casual' && !pvpOk)) return { state: { ...s, welcomed: true, mmOk, pvpOk, asked: true, queue: { ...q, stopped: 'update' } }, effects: [] };
        return { state: { ...s, welcomed: true, mmOk, pvpOk, asked: true }, effects: [{ t: 'send', msg: { t: 'mm.join', queue: q.toCoop ? 'coop' : q.mode, side: q.side } }] };
      }
      if (q && !s.view) return { state: { ...s, welcomed: true, mmOk, pvpOk, asked: true }, effects: [] };
      // a reconnect keeps the view (the relay re-sends the party right after welcome)
      return { state: { ...s, welcomed: true, mmOk, pvpOk, asked: s.view ? s.asked : false }, effects: s.view ? [] : [{ t: 'decide-later' }] };
    }
    case 'party': {
      const left = !!(m as PartyView & { left?: boolean }).left || (!m.code && !m.mm);
      // Quick Play: a stranger's Play again leaves the matched party and searches alone (the card stays up)
      if (left && s.error?.code === 'seat_taken') return { state: s, effects: [] };
      if (left && s.queue && !s.inMatch) return { state: { ...s, view: null, code: null, queue: { ...s.queue, party: false } }, effects: [] };
      if (left) return { state: { ...s, view: null }, effects: [{ t: 'close' }] };
      const notes = s.inMatch || s.solo ? [] : diffNotes(s.view, m);
      for (const n of notes) fx.push({ t: 'note', note: n });
      // the error of a refused action clears with the next good view, except a fatal one
      const error = s.error && FATAL.has(s.error.code) ? s.error : null;
      let queue = s.queue;
      if (m.queue && (!queue || queue.stopped)) queue = { ...searching(m.queue.side, { party: true }), seen: true };
      else if (m.queue && queue) queue = { ...queue, seen: true, party: true };
      else if (queue && queue.party && queue.seen && !queue.found) queue = null; // the party's search ended
      // matched: the shared pick takes over (after the 1.2 s "Match found" strip, when there was one)
      const matched = !!m.mm && (m.phase === 'pick' || m.phase === 'loading' || m.phase === 'match');
      if (queue && !queue.found && matched) queue = null;
      // the app ends a match (`matchOver`) once its results are done; the view keeps updating meanwhile
      return { state: { ...s, view: m, error, asked: true, code: m.code || s.code, queue, accept: matched ? null : s.accept }, effects: fx };
    }
    case 'mm.status': {
      const status: QueueStatus = {
        waitedMs: m.waitedMs,
        estimateMs: m.estimateMs,
        found: m.found,
        ...(m.lowPriorityMs ? { lowPriorityMs: m.lowPriorityMs } : {}),
        ...(m.warn ? { warn: m.warn } : {}),
      };
      const base = s.queue && !s.queue.found ? s.queue : searching(m.side, { party: !!s.view && !isStranger(s.view), mode: m.queue });
      // casual: the 45 s move to co-op (`from: 'casual'`), a requeue after a decline, the other team's humans
      const toCoop = m.from === 'casual' && m.queue === 'coop';
      const pvp = m.queue === 'casual' || toCoop;
      return {
        state: {
          ...s,
          accept: null,
          queue: {
            ...base,
            mode: pvp ? 'casual' : 'coop',
            side: m.side,
            status,
            stopped: null,
            toCoop,
            requeued: m.requeued === true || (!!base.requeued && !toCoop),
            theirs: m.teams?.[1] ?? 0,
          },
        },
        effects: [],
      };
    }
    case 'mm.found': {
      // casual PvP: the Accept card (10 s); the pick comes once everyone accepted
      if (m.mode === 'casual' && m.match && m.teams) {
        const accept: AcceptState = {
          match: m.match,
          side: m.side,
          mine: [m.teams[0][0], m.teams[0][1]],
          theirs: [m.teams[1][0], m.teams[1][1]],
          totalMs: m.acceptByMs ?? 10_000,
          accepted: false,
          yes: 0,
          need: m.teams[0][0] + m.teams[1][0],
        };
        const found: MmFound = { side: m.side, humans: m.humans, bots: m.bots, difficulty: m.difficulty };
        fx.push({ t: 'accept-clock' }, { t: 'vibrate' });
        return { state: { ...s, accept, found, offer: null }, effects: fx };
      }
      const found: MmFound = { side: m.side, humans: m.humans, bots: m.bots, difficulty: m.difficulty };
      const q = s.queue ?? searching(m.side);
      fx.push({ t: 'found-hold' }, { t: 'vibrate' });
      return { state: { ...s, queue: { ...q, found }, found, offer: null }, effects: fx };
    }
    case 'mm.accepted': {
      if (!s.accept || s.accept.match !== m.match) return { state: s, effects: [] };
      return { state: { ...s, accept: { ...s.accept, yes: m.yes, need: m.need } }, effects: [] };
    }
    case 'void':
      // a remake: the running match ends for everyone; nobody gained or lost anything
      return { state: { ...s, voided: true, inMatch: false, accept: null }, effects: [{ t: 'voided' }] };
    case 'mm.cancel': {
      if (!s.queue && !s.accept) return { state: s, effects: [] };
      // casual: this player declined or let the Accept run out (a dodge)
      if (m.reason === 'declined' || m.reason === 'timeout') {
        const q = s.queue ?? searching('any', { mode: 'casual' });
        return { state: { ...s, accept: null, queue: { ...q, stopped: m.reason, status: null }, offer: null }, effects: [] };
      }
      if (!s.queue) return { state: { ...s, accept: null }, effects: [] };
      // a restart: keep searching; the reconnect's welcome re-sends `mm.join` (one continuous timer). If no welcome
      // comes (the socket stayed up), the client searches again by itself: never a card that spins forever
      if (m.reason === 'server') return { state: { ...s, queue: { ...s.queue, status: null } }, effects: [{ t: 'server-wait' }] };
      // a friend party's search ended for everyone: back to its lobby
      if (s.view && !isStranger(s.view) && s.queue.party) {
        const title = m.reason === 'away' ? COPY.stoppedAway : COPY.stoppedParty;
        return { state: { ...s, queue: null, offer: null }, effects: [{ t: 'note', note: { key: 'mm-cancel', title, tone: 'info', ttl: 4000 } }] };
      }
      const stopped: QueueStop = m.reason === 'away' ? 'away' : m.reason === 'update' ? 'update' : m.reason === 'left' ? 'left' : 'party';
      return { state: { ...s, queue: { ...s.queue, stopped, status: null }, offer: null }, effects: [] };
    }
    case 'mm.backfill.offer': {
      if (!s.queue || s.queue.stopped || s.queue.found) return { state: s, effects: [] };
      const offer: OfferState = { id: m.offer, side: m.side, clockS: m.clockS, score: m.score, expiresMs: m.expiresMs };
      fx.push({ t: 'track', event: 'mm_backfill_offer', props: { clock_s: m.clockS, ahead: m.score[0] > m.score[1] } }, { t: 'vibrate' });
      return { state: { ...s, offer }, effects: fx };
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
      // a backfill took this player's seat (a resume, or still connected while a bot flew it): no seat to go back to
      if (m.code === 'seat_taken')
        return { state: { ...s, view: null, inMatch: false, solo: false, queue: null, offer: null, error: { code: 'seat_taken' }, asked: false }, effects: [{ t: 'seat-taken' }] };
      if (s.inMatch) return { state: s, effects: [] }; // NetHost shows in-match errors on the rail
      // casual PvP refused: fewer than 5 matches, or a game without PvP
      if (s.queue && m.code === 'mm_locked' && m.reason === 'pvp_newbie')
        return { state: { ...s, queue: { ...s.queue, stopped: 'newbie', status: null }, offer: null }, effects: [] };
      if (s.queue && m.code === 'pvp_update_required') return { state: { ...s, queue: { ...s.queue, stopped: 'update', status: null }, offer: null }, effects: [] };
      if (s.queue && !s.queue.found && (m.code === 'mm_locked' || m.code === 'server_busy'))
        return { state: { ...s, queue: { ...s.queue, stopped: m.code === 'mm_locked' ? 'locked' : 'busy', retryMs: m.retryMs ?? 15_000, status: null }, offer: null }, effects: [] };
      // the relay refused this search for the party (not the leader, a member offline or still in a match): stop the
      // card with Search again instead of searching forever
      if (s.queue && !s.queue.found && !s.queue.stopped && (m.code === 'party_busy' || m.code === 'party_full'))
        return { state: { ...s, queue: { ...s.queue, stopped: 'party', status: null }, offer: null }, effects: [] };
      const error = { code: m.code, ...(m.retryMs !== undefined ? { retryMs: m.retryMs } : {}) };
      if (m.code === 'kicked') return { state: { ...s, view: null, error, asked: false }, effects: [] };
      if (m.code === 'bad_ticket') return { state: s, effects: [{ t: 'note', note: { key: 'pp-ticket', title: COPY.badTicket, tone: 'info', ttl: 5000 } }] };
      if (m.code === 'rate_limited') return { state: { ...s, error }, effects: [] };
      if (m.code === 'server_busy') {
        const leader = !!s.view && s.view.leader === s.view.you;
        return { state: { ...s, error }, effects: leader ? [{ t: 'retry-start', ms: m.retryMs ?? 15_000 }] : [] };
      }
      // a quiet resume of a party that is gone: back to the title, no error screen
      if ((s.mode === 'resume' || s.mode === 'back') && ENDED.has(m.code) && !s.view) return { state: { ...s, error, asked: false }, effects: [{ t: 'close' }] };
      // a refused join leaves us without a party (the code screen or the ended screen)
      if (ENDED.has(m.code) && !s.view) return { state: { ...s, error, asked: false }, effects: [] };
      return { state: { ...s, error }, effects: [] };
    }
    default:
      return { state: s, effects: [] };
  }
}

/** The in-match seats of a party view (lane M1): name, connection and card art per human slot (0..5 in PvP). Pure. */
export function seatsOf(v: PartyView): SeatInfo[] {
  return v.members
    .filter((m) => typeof m.slot === 'number' && m.slot >= 0 && m.slot < 6)
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
  /** Start the party match in the app (a MatchSession on this NetHost). `backfill`: this player took a leaver's seat. */
  startMatch(host: () => NetHost, match: MatchMsg, view: PartyView, info?: { backfill: boolean }): void;
  /** Quick Play: the side of the first search ("Play online"; the last one this viewer used). */
  queueSide?: MmSide;
  /** Casual PvP: the first search's queue (the title's mode chip). */
  queueMode?: 'coop' | 'casual';
  /** Completed matches (the casual PvP newbie lock hint). */
  matches?: number;
  /** Quick Play: the player changed the side (remembered for the next search). */
  saveQueueSide?(side: MmSide): void;
  /** Quick Play analytics context (no ids). */
  mmInfo?(): { surface: 'web' | 'embed' | 'app'; matches: number; guest: boolean };
  /** The hero this player last played on a side (the Quick Play pick's default), or ''. */
  heroForSide?(side: 'cat' | 'dog'): string;
  /** A backfill took this player's seat while the match ran: end it in the app (the party screen says why). */
  endMatch?(): void;
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

/**
 * The party code this browser is in (or null when it left): a closed tab rejoins by it (src/app/app.ts). A stranger in
 * a Quick Play match has no code: `mm` marks it, and a closed tab asks for its own seat back (`mm.back`). Nothing
 * secret is kept here (no token): the relay matches the same guest key or account.
 */
function rememberParty(code: string | null, mm = false): void {
  try {
    if (code || mm) localStorage.setItem('pl.party.last', JSON.stringify(mm && !code ? { mm: true, at: Date.now() } : { code, at: Date.now() }));
    else localStorage.removeItem('pl.party.last');
  } catch {
    /* private mode */
  }
}

const heroName = (h: string): string => (h in HERO_TEXT ? HERO_TEXT[h as keyof typeof HERO_TEXT].title : h);

/** "Match found" stays on the card this long before the pick (M1A-IMPL.md §1.4). */
export const FOUND_HOLD_MS = 1200;
/** The relay takes one `mm.side` per 2 s; the client waits a little longer. */
const SIDE_EVERY_MS = 2100;

/** `mm.cancel{server}` with no restart welcome after this long: search again on the same socket. */
export const SERVER_WAIT_MS = 6000;

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
    this.state = initialParty(opts.mode, opts.code ?? null, h.queueSide ?? 'any', h.queueMode ?? 'coop');
    if (opts.mode === 'queue') this.queueSince = this.now();
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
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.socket = new PartySocket(
      url,
      {
        sim: SIM_VERSION,
        simHash: simHash(),
        build: h.build,
        guestKey: h.guestKey(),
        hint: { maxDifficulty: h.maxDifficulty, newbie: h.newbie, ...(h.matches !== undefined ? { matches: Math.max(0, Math.min(1_000_000, Math.floor(h.matches))) } : {}) },
      },
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
      // a queued solo has no party view: its presence still matters (an away entry is skipped, then cancelled)
      if (this.state.inMatch || this.state.solo || (!this.state.view && !this.state.queue)) return;
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
    this.queueBook(prev, ev);
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
    // a stranger seated in a live Quick Play match: a closed tab (a phone that killed it) comes back to it
    const strangerLive = isStranger(state.view) && (state.inMatch || state.view?.phase === 'match');
    const wasLive = isStranger(prev.view) && (prev.inMatch || prev.view?.phase === 'match');
    if (strangerLive && !wasLive) rememberParty(null, true);
    else if (!strangerLive && wasLive && !state.view?.code) rememberParty(null);
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
        } else {
          if (f.msg.t === 'mm.join') this.trackJoin(f.msg.side);
          this.socket.sendJson(f.msg);
        }
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
          { backfill: this.backfilled },
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
      case 'found-hold':
        if (this.foundTimer) clearTimeout(this.foundTimer);
        this.foundTimer = setTimeout(() => this.dispatch({ e: 'found-shown' }), FOUND_HOLD_MS);
        return;
      case 'server-wait':
        if (this.serverWait) clearTimeout(this.serverWait);
        this.serverWait = setTimeout(() => {
          this.serverWait = null;
          const q = this.state.queue;
          // still waiting with no status (no restart welcome came): search again on this socket
          if (q && !q.stopped && !q.found && !q.status && this.state.welcomed) this.dispatch({ e: 'queue', side: q.side, requeue: q.requeue });
        }, SERVER_WAIT_MS);
        return;
      case 'seat-taken':
        this.backfilled = false;
        if (this.host) {
          this.host = null;
          this.resultsEl = null;
          this.resultsDone = null;
          this.h.endMatch?.();
        }
        this.el.hidden = false;
        this.drawn = '';
        return;
      case 'track':
        this.h.analytics?.(f.event, f.props);
        return;
      case 'accept-clock':
        this.acceptAt = this.now();
        this.h.analytics?.('mm_found', { waited_s: this.waitedS(), mode: 'casual', humans: (this.state.accept?.mine[0] ?? 0) + (this.state.accept?.theirs[0] ?? 0) });
        return;
      case 'voided':
        this.h.analytics?.('mp_void', { reason: 'remake' });
        if (this.host) {
          this.host = null;
          this.resultsEl = null;
          this.resultsDone = null;
          this.h.endMatch?.();
        }
        this.el.hidden = false;
        this.drawn = '';
        return;
    }
  }

  /** Casual PvP: when the Accept card's clock started (local). */
  private acceptAt = 0;
  private acceptLeftS(): number {
    const a = this.state.accept;
    return a ? Math.max(0, (a.totalMs - (this.now() - this.acceptAt)) / 1000) : 0;
  }

  // -------------------------------------------------------------------------------------------- Quick Play (M1a)

  /** When this search started (local clock; synced to the relay's `waitedMs`, never moved later). */
  private queueSince = 0;
  private statusAt = 0;
  private offerAt = 0;
  private foundTimer: ReturnType<typeof setTimeout> | null = null;
  private sideTimer: ReturnType<typeof setTimeout> | null = null;
  private serverWait: ReturnType<typeof setTimeout> | null = null;
  private sideSentAt = -Infinity;
  private joinTracked = false;
  private penaltyTracked = false;
  /** This player took a leaver's seat (analytics: mp_match_* `backfill`). */
  private backfilled = false;

  /** Clocks and analytics of the queue, after each reduce. */
  private queueBook(prev: PartyState, ev: PartyEvent): void {
    const s = this.state;
    const now = this.now();
    const m = ev.e === 'server' ? ev.m : null;
    if (ev.e === 'queue') {
      this.queueSince = now;
      this.joinTracked = false;
      this.penaltyTracked = false;
      this.h.saveQueueSide?.(ev.side);
    }
    // a party member's search started by its leader: the party view says since when
    if (s.queue && !prev.queue && ev.e !== 'queue') this.queueSince = now - (s.view?.queue?.sinceMs ?? 0);
    if (s.queue?.stopped && !prev.queue?.stopped) this.stoppedAt = now;
    if (m?.t === 'mm.status') {
      this.statusAt = now;
      this.queueSince = Math.min(this.queueSince || now, now - m.waitedMs);
      if (m.lowPriorityMs && !this.penaltyTracked) {
        this.penaltyTracked = true;
        this.h.analytics?.('mm_penalty', { level: m.lowPriorityMs <= 60_000 ? 1 : m.lowPriorityMs <= 180_000 ? 2 : 3, wait_s: Math.round(m.lowPriorityMs / 1000) });
      }
    }
    if (m?.t === 'mm.backfill.offer') this.offerAt = now;
    const waited = Math.max(0, Math.round((now - this.queueSince) / 1000));
    if (m?.t === 'mm.found') this.h.analytics?.('mm_found', { waited_s: waited, humans: m.humans, bots: m.bots, difficulty: m.difficulty, side: m.side });
    if (m?.t === 'mm.cancel' && prev.queue && m.reason !== 'left') this.h.analytics?.('mm_cancel', { by: m.reason === 'update' ? 'server' : m.reason, waited_s: waited });
    if (ev.e === 'unqueue' && prev.queue && !prev.queue.stopped) this.h.analytics?.('mm_cancel', { by: 'user', waited_s: waited });
    if (ev.e === 'offer' && ev.yes === true) this.backfilled = true;
    if (m?.t === 'match') this.backfilled = this.backfilled && m.startInMs === 0;
  }

  /** `mm.join` went out: mm_join once per search (a reconnect's re-send is the same search). */
  private trackJoin(side: MmSide): void {
    if (this.joinTracked) return;
    this.joinTracked = true;
    const info = this.h.mmInfo?.() ?? { surface: 'web' as const, matches: 0, guest: true };
    const v = this.state.view;
    this.h.analytics?.('mm_join', {
      queue: 'coop',
      side,
      party_size: v && !isStranger(v) ? v.members.length : 1,
      surface: info.surface,
      matches_bucket: info.matches >= 20 ? '20+' : info.matches >= 5 ? '5-19' : '1-4',
      guest: info.guest,
      requeue: !!this.state.queue?.requeue,
    });
  }

  /** The side chip: at most one `mm.side` per 2 s (the relay's rule); the last choice always goes out. */
  private sendSide(): void {
    const wait = this.sideSentAt + SIDE_EVERY_MS - this.now();
    if (this.sideTimer) return;
    const go = (): void => {
      this.sideTimer = null;
      const q = this.state.queue;
      if (!q || q.stopped || q.found || this.closed) return;
      this.sideSentAt = this.now();
      this.socket.sendJson({ t: 'mm.side', side: q.side });
    };
    if (wait <= 0) go();
    else this.sideTimer = setTimeout(go, wait);
  }

  /** Search (again) with the remembered side (and queue: casual after a PvP match). */
  queueNow(requeue = false, mode?: 'coop' | 'casual'): void {
    const m = mode ?? (this.state.view?.mm?.mode === 'casual' || this.state.voided ? 'casual' : this.state.queue?.mode ?? this.h.queueMode ?? 'coop');
    this.dispatch({ e: 'queue', side: this.state.queue?.side ?? this.h.queueSide ?? 'any', requeue, mode: m });
  }

  /** Seconds searched now. */
  private waitedS(): number {
    return Math.max(0, Math.floor((this.now() - this.queueSince) / 1000));
  }

  private offerLeftS(): number {
    const o = this.state.offer;
    return o ? Math.max(0, (o.expiresMs - (this.now() - this.offerAt)) / 1000) : 0;
  }

  /** The queue card's live texts (timer, countdowns), updated in place. */
  private liveQueue(): void {
    const q = this.state.queue;
    if (!q) return;
    const set = (k: string, text: string): void => {
      const el = this.card.querySelector<HTMLElement>(`[data-live="${k}"]`);
      if (el && el.textContent !== text) el.textContent = text;
    };
    set('waited', clockText(this.waitedS()));
    if (this.state.accept) {
      const left = this.acceptLeftS();
      set('accept', String(Math.ceil(left)));
      const ring = this.card.querySelector<HTMLElement>('.pp-acceptcard .pp-ring');
      ring?.style.setProperty('--pp-ring', `${Math.round((left / Math.max(1, this.state.accept.totalMs / 1000)) * 100)}%`);
      if (left <= 0 && !this.state.accept.accepted) this.dispatch({ e: 'accept', yes: null });
    }
    const low = Math.max(0, (q.status?.lowPriorityMs ?? 0) - (this.now() - this.statusAt));
    if (low > 0) set('low', COPY.lowPriority(clockText(low / 1000)));
    if (this.state.offer) {
      const left = this.offerLeftS();
      set('offer', String(Math.ceil(left)));
      set('clock', COPY.backfillAt(clockText(this.state.offer.clockS + (this.now() - this.offerAt) / 1000)));
      const ring = this.card.querySelector<HTMLElement>('.pp-ring');
      ring?.style.setProperty('--pp-ring', `${Math.round((left / Math.max(1, this.state.offer.expiresMs / 1000)) * 100)}%`);
      if (left <= 0) this.dispatch({ e: 'offer', yes: null });
    }
  }

  private queueModel() {
    const s = this.state;
    const q = s.queue!;
    const retryS = q.retryMs ? Math.max(0, Math.ceil((q.retryMs - (this.now() - this.stoppedAt)) / 1000)) : 0;
    return {
      side: q.side,
      waitedS: this.waitedS(),
      estimateS: q.status ? Math.round(q.status.estimateMs / 1000) : null,
      found: q.status?.found ?? (s.view && !isStranger(s.view) ? s.view.members.length : 1),
      lowPriorityS: Math.max(0, ((q.status?.lowPriorityMs ?? 0) - (this.now() - this.statusAt)) / 1000),
      warn: q.status?.warn === 'leaver',
      party: q.party,
      stopped: q.stopped,
      retryS,
      match: q.found ? { humans: q.found.humans, bots: q.found.bots, side: q.found.side, difficulty: q.found.difficulty } : null,
      ...(q.mode === 'casual' ? { pvp: { theirs: q.theirs ?? 0, toCoop: !!q.toCoop, requeued: !!q.requeued } } : {}),
      offer: s.offer ? { clockS: s.offer.clockS + Math.floor((this.now() - this.offerAt) / 1000), score: s.offer.score, leftS: this.offerLeftS(), totalS: s.offer.expiresMs / 1000 } : null,
    };
  }
  private stoppedAt = 0;

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
    // Quick Play: the side is fixed; a hover on the other side moves to this player's hero of that side
    if (v.mm && heroBlock(v, this.hover)) this.hover = firstFree(v, v.mm.side, this.h.heroForSide?.(v.mm.side));
    if (this.hover && !heroBlock(v, this.hover)) this.socket.sendJson({ t: 'pick.hover', hero: this.hover });
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

  /** "Play again together (0/2)" now; Quick Play: "Play again" (a stranger searches again) or "Back to party". */
  againText(): string {
    const v = this.state.view;
    if (isStranger(v)) return COPY.playAgainOnline;
    if (v?.mm) return COPY.backToParty;
    return againLabel(v, this.againPressed);
  }

  /** The results actions for this player (Quick Play strangers get Play again and Back, no Change hero). */
  resultsActions(): { again: string; leave: string; change: boolean; coop: boolean } {
    const v = this.state.view;
    const stranger = isStranger(v);
    return { again: this.againText(), leave: stranger ? COPY.back : COPY.leave, change: !v?.mm, coop: !!v?.mm };
  }

  /** The app's results screen is up: keep its Play again label current; `done` hands the screen back for the pick. */
  bindResults(el: HTMLElement, done: () => void): void {
    this.resultsEl = el;
    this.resultsDone = done;
    this.againPressed = false;
  }

  /** "Play again together" (keep the hero) or "Change hero" (the pick stays open). */
  again(keepHero: boolean): void {
    const v = this.state.view;
    // Quick Play: a stranger searches again with the same side (the relay moves it out of the matched party); a
    // friend party goes back to its own lobby, where the leader has Play online
    if (v?.mm) {
      const done = this.resultsDone;
      this.resultsEl = null;
      this.resultsDone = null;
      if (done) done();
      else this.matchOver();
      if (isStranger(v)) this.queueNow(true);
      return;
    }
    this.keepHero = keepHero;
    this.againPressed = true;
    this.socket.sendJson({ t: 'vote', kind: 'rematch', yes: true });
    const b = this.resultsEl?.querySelector<HTMLElement>('[data-a="again"]');
    if (b) b.textContent = againLabel(this.state.view, true);
    this.resultsEl?.querySelectorAll<HTMLButtonElement>('[data-a="again"], [data-a="change"]').forEach((x) => x.classList.add('pressed'));
  }

  /** "Leave party" from the results screen, or Leave match in a Quick Play match (the app then shows the title). */
  leaveParty(phase: 'results' | 'match' = 'results'): void {
    this.resultsEl = null;
    this.resultsDone = null;
    if (this.state.view) this.socket.sendJson({ t: 'party.leave' });
    this.h.analytics?.('party_leave', { phase, reason: 'button', coop: !!this.state.view?.mm });
    this.close();
  }

  /** A Quick Play match (strangers, a fixed side): Leave match leaves the party (a backfill or a bot takes the seat). */
  get coop(): boolean {
    return !!this.state.view?.mm;
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
    this.backfilled = false;
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
      // Quick Play
      case 'queue':
        this.queueNow(false);
        return;
      case 'mm-again':
        this.queueNow(false);
        return;
      case 'mm-found-cancel':
        // "Match found" → Cancel: the stranger leaves the matched party before its room starts (a bot takes the seat;
        // no room yet, so no leaver event). `mm.leave` covers a Cancel that crossed `mm.found` on the relay.
        s.sendJson({ t: 'mm.leave' });
        s.sendJson({ t: 'party.leave' });
        this.h.analytics?.('party_leave', { phase: 'found' });
        this.close();
        return;
      case 'mm-cancel': {
        const solo = !this.state.view || isStranger(this.state.view);
        this.dispatch({ e: 'unqueue' });
        if (solo) this.close();
        return;
      }
      case 'mm-side': {
        const side = t.dataset.v as MmSide;
        if (!['cat', 'dog', 'any'].includes(side) || this.state.queue?.side === side) return;
        this.dispatch({ e: 'side', side });
        this.h.saveQueueSide?.(side);
        this.sendSide();
        return;
      }
      case 'bf-yes':
        this.dispatch({ e: 'offer', yes: true });
        return;
      case 'mm-accept':
        this.dispatch({ e: 'accept', yes: true });
        return;
      case 'mm-decline':
        this.dispatch({ e: 'accept', yes: false });
        return;
      case 'mm-keep':
        this.dispatch({ e: 'keep' });
        this.h.analytics?.('mm_keep_waiting', { waited_s: this.waitedS() });
        return;
      case 'void-again':
        this.queueNow(true, 'casual');
        return;
      case 'bf-no':
        this.dispatch({ e: 'offer', yes: false });
        return;
    }
  }

  /** The side chip is a radio group: the arrow keys move the choice (and the focus). */
  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t?.dataset?.p !== 'mm-side') return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const order: MmSide[] = ['cat', 'dog', 'any'];
    const next = order[(order.indexOf(t.dataset.v as MmSide) + step + order.length) % order.length];
    this.dispatch({ e: 'side', side: next });
    this.h.saveQueueSide?.(next);
    this.sendSide();
    this.card.querySelector<HTMLElement>(`[data-p="mm-side"][data-v="${next}"]`)?.focus();
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
    if (screenOf(this.state) === 'queue' || screenOf(this.state) === 'accept') {
      this.liveQueue();
      // a locked or busy stop: Search again turns on when the wait is over
      if (this.state.queue?.stopped && this.state.queue.retryMs) this.render();
    }
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
      case 'queue':
        html = queueCardHtml(this.queueModel());
        break;
      case 'accept': {
        const a = s.accept!;
        html = acceptCardHtml({ side: a.side, mine: a.mine, theirs: a.theirs, leftS: this.acceptLeftS(), totalS: a.totalMs / 1000, accepted: a.accepted, yes: a.yes, need: a.need });
        break;
      }
      case 'void':
        html = `<div class="pp-card pp-narrow pp-void" data-testid="pvp-void" role="status"><h2>${COPY.voided}</h2><div class="pp-col"><button type="button" class="pl-btn big" data-p="void-again" data-testid="pvp-void-again">${COPY.playAgainOnline}</button><button type="button" class="pl-btn ghost small" data-p="mm-cancel" data-testid="pvp-void-back">${COPY.back}</button></div></div>`;
        break;
      case 'ended': {
        const title = errorText(s.error?.code ?? 'party_ended');
        if (s.error?.code === 'seat_taken') {
          html = `<div class="pp-card pp-narrow pp-ended" data-testid="party-ended" data-reason="seat_taken"><h2>${esc(title)}</h2><p class="pp-dim">${COPY.seatTakenNote}</p><div class="pp-col"><button type="button" class="pl-btn big" data-p="mm-again" data-testid="mm-again">${COPY.online}</button><button type="button" class="pl-btn ghost small" data-p="back">${COPY.back}</button></div></div>`;
          break;
        }
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
          online: s.mmOk,
        });
        break;
      case 'pick':
        html = pickHtml({ view: s.view!, hover: this.hover, trick: this.trick, secondsLeft: this.secondsLeft(), error: err, hideNames: hideNames(), found: s.found });
        break;
      case 'loading':
        html = loadingHtml(s.view!);
        break;
    }
    // the timer text changes every second; skip identical redraws (keeps focus and the code boxes)
    const key =
      screen === 'pick'
        ? html.replace(/data-timer[^>]*>\d+s/, '')
        : screen === 'queue' || screen === 'accept'
          ? html.replace(/(data-live="[a-z]+"[^>]*>)[^<]*/g, '$1').replace(/--pp-ring:\d+%/, '')
          : html;
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
    if (this.foundTimer) clearTimeout(this.foundTimer);
    if (this.sideTimer) clearTimeout(this.sideTimer);
    if (this.serverWait) clearTimeout(this.serverWait);
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
