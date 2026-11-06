/**
 * NetHost (docs/plans/moba/MULTIPLAYER.md §4.1): the party match host, with the same listener API as the LocalHost
 * (`welcome` with `slot = you.slot`, `snap`, `events`, `end`), so MatchSession runs a party match unchanged. TURN and
 * CATCHUP frames from the PartySocket go to the net-host worker (or the inline core when Workers fail: the same retry
 * and fallback as local-host.ts); its snapshots come back as transferable buffers.
 *
 * In-match messages (catch-up %, waiting for server, teammates dropped and back, re-syncing, another tab) go to the
 * top notification rail through `notify` (never mid-screen on phones).
 */
import { encodeCommand } from '../sim/commands';
import { Op, type Command, type MatchResult, type PartyReplayRecord, type ReplayRecord, type SimEvent, type Snapshot } from '../sim/api';
import { SIM_VERSION } from '../sim/version';
import { decodeSnap, type WelcomeMsg } from '../host/protocol';
import type { HostListener } from '../host/local-host';
import { Frame, SocialLimiter, catchupBodies, clampSocialPoint, socialIdOk, type MatchMsg, type ServerBinary, type ServerJson, type SocialKind, type VoteKind } from './proto';
import type { PartyLink, PartyLinkListener, SeatInfo, SlotReasonText } from '../app/mpTypes';
import { socialLine } from '../data/social';
import type { PartySocket } from './socket';
import { MoveCoalescer } from './input';
import { Predictor } from './predict';
import { NetCore, type CoreIn, type CoreOut } from './net-core';
import { TURN_MS } from './lockstep';
import { watchVisibility } from './visibility';

export interface NetNote {
  key: string;
  title: string;
  tone: 'good' | 'bad' | 'gold' | 'info';
  ttl?: number;
}

export interface NetHostOptions {
  worker?: boolean;
  /** Test seam: a worker-like transport. */
  makeWorker?: (onMsg: (m: CoreOut | { t: 'error'; message: string }) => void, onFail: (msg: string) => void) => { post(m: CoreIn, transfer?: Transferable[]): void; close(): void } | null;
  notify?: (n: NetNote) => void;
  /** Party analytics (MULTIPLAYER.md §10): mp_disconnect and mp_rejoin, flat props only. */
  track?: (event: string, props: Record<string, string | number | boolean>) => void;
  /** Watch tab visibility (off in node tests). */
  visibility?: boolean;
  now?: () => number;
}

/** The party result a NetHost hands to MatchSession's `end` (display only: the score posts as v:2, §6). */
export interface PartyEnd {
  room: string;
  slot: number;
  record: PartyReplayRecord | null;
  scored: boolean | null;
  why?: string;
  /** Lane M6: the relay's display names per slot (null = a bot) and the share of turns a bot flew each slot. */
  names?: (string | null)[];
  pilotPct?: number[];
}

/** `?e2e=1`: the hash trail and the applied turn on <html data-*> (the multi-client e2e compares them). */
const E2E = (() => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('e2e') === '1';
  } catch {
    return false;
  }
})();

const golden = (): string => (typeof __SIM_GOLDEN__ !== 'undefined' ? __SIM_GOLDEN__ : '');

function workerTransport(onMsg: (m: CoreOut | { t: 'error'; message: string }) => void, onFail: (msg: string) => void) {
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./net-host.worker.ts', import.meta.url), { type: 'module', name: 'pawlegends-net' });
    w.addEventListener('message', (e) => onMsg(e.data));
    w.addEventListener('error', (e) => {
      e.preventDefault?.();
      onFail(e.message || 'net worker failed');
    });
    return { post: (m: CoreIn, transfer?: Transferable[]) => w.postMessage(m, transfer ?? []), close: () => w.terminate() };
  } catch {
    return null;
  }
}

function inlineTransport(onMsg: (m: CoreOut) => void, now: () => number) {
  const core = new NetCore((m) => onMsg(m));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let base = 0;
  let n = 0;
  const pace = () => {
    core.pace(now());
    n++;
    timer = setTimeout(pace, Math.max(0, base + n * TURN_MS - now()));
  };
  return {
    post: (m: CoreIn) => {
      core.handle(m);
      if (m.t === 'start' && timer === null) {
        base = now();
        timer = setTimeout(pace, TURN_MS);
      }
    },
    close: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

export class NetHost implements PartyLink {
  private listener: HostListener = {};
  private transport: { post(m: CoreIn, transfer?: Transferable[]): void; close(): void };
  private readonly coalescer: MoveCoalescer;
  readonly predictor = new Predictor();
  welcome: WelcomeMsg | null = null;
  restarts = 0;
  kind: 'worker' | 'inline' = 'inline';
  private disposed = false;
  private selftestOk: boolean | null = null;
  private lastMask = 0;
  private lastTurn = -1;
  private catching = false;
  private waitingShown = false;
  private lastSyncMs = -Infinity;
  private endInfo: PartyEnd;
  private result: { r: MatchResult; record: PartyReplayRecord | null } | null = null;
  private serverEnd: Extract<ServerJson, { t: 'end' }> | null = null;
  private unwatch: (() => void) | null = null;
  private readonly now: () => number;
  /** Display names per slot (null = a bot); a friend taking an open seat mid-match fills one in. */
  readonly names: (string | null)[];
  readonly mySlot: number;
  readonly humans: readonly number[];
  seats: SeatInfo[] = [];
  /** The party HUD's names (mute, Hide names); the rail notes use it. */
  nameOf: (slot: number) => string = (slot) => this.names[slot] ?? `Teammate ${slot + 1}`;
  private readonly links = new Set<PartyLinkListener>();
  private readonly bornAt: number;
  private rejoinSent = false;
  private readonly limiter = new SocialLimiter();
  /** Turns each slot was flown by a bot (M6 "bot X%"), and the turns applied. */
  private readonly pilotTurns = [0, 0, 0, 0, 0, 0];
  private countedTurn = -1;
  /** The turn this player's own hero went to a bot (−1: flown by the player). */
  private myPilotFrom = -1;
  private holds = 0;
  catchups = 0;
  /** Turn mode bits of the last applied turn: slot s piloted. */
  piloted(slot: number): boolean {
    return ((this.lastMask >>> slot) & 1) === 1;
  }

  /** The party side of this host (PartyLink): MatchSession's party HUD reads it. */
  get party(): PartyLink {
    return this;
  }

  pilotPct(slot: number): number {
    const total = this.countedTurn + 1;
    return total > 0 ? Math.round((this.pilotTurns[slot] / total) * 100) : 0;
  }

  listen(l: HostListener): void;
  listen(l: PartyLinkListener): () => void;
  listen(l: HostListener | PartyLinkListener): void | (() => void) {
    if (isHostListener(l)) {
      this.listener = l;
      return;
    }
    this.links.add(l);
    return () => void this.links.delete(l);
  }

  private emit<K extends keyof PartyLinkListener>(k: K, ...args: Parameters<NonNullable<PartyLinkListener[K]>>): boolean {
    let any = false;
    for (const l of this.links) {
      const f = l[k] as ((...a: unknown[]) => void) | undefined;
      if (f) {
        any = true;
        f.apply(l, args);
      }
    }
    return any;
  }

  /** A social message (§7 M2-M3): enumerated ids only, clamped integer points, the relay's rate limit mirrored. */
  social(kind: SocialKind, id: number, x?: number, y?: number, target?: number): boolean {
    if (!socialIdOk(kind, id) || !this.limiter.allow(this.now())) return false;
    const msg: { t: 'social'; kind: SocialKind; id: number; x?: number; y?: number; target?: number } = { t: 'social', kind, id };
    if (x !== undefined && y !== undefined) Object.assign(msg, clampSocialPoint(x, y));
    if (target !== undefined && Number.isInteger(target) && target >= 0 && target < 6) msg.target = target;
    this.socket.sendJson(msg);
    return true;
  }

  vote(kind: VoteKind, yes: boolean): void {
    this.socket.sendJson({ t: 'vote', kind, yes });
  }

  net(): { rttMs: number; buffer: number; holds: number; catchups: number } {
    return { rttMs: Math.round(this.socket.rttMs), buffer: this.buffer, holds: this.holds, catchups: this.catchups };
  }
  private buffer = 1;

  /** The party view changed (PartyClient, through the socket tap): names, connection dots and card art per slot. */
  setSeats(seats: SeatInfo[]): void {
    this.seats = seats;
    for (const s of seats) {
      if (s.slot === this.mySlot || s.name === null) continue;
      if (this.names[s.slot] === null) this.names[s.slot] = s.name;
    }
    this.emit('seats', seats);
  }

  constructor(readonly socket: PartySocket, readonly match: MatchMsg, private readonly opts: NetHostOptions = {}) {
    this.now = opts.now ?? (() => performance.now());
    this.names = [...match.names];
    this.mySlot = match.you.slot;
    this.bornAt = this.now();
    this.humans = [...match.config.humans];
    this.endInfo = { room: match.room, slot: match.you.slot, record: null, scored: null };
    this.coalescer = new MoveCoalescer((cmd) => this.socket.sendCmd(encodeCommand(cmd)), {
      now: this.now,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
    const onMsg = (m: CoreOut | { t: 'error'; message: string }) => this.fromCore(m);
    const make = opts.makeWorker ?? workerTransport;
    const w = opts.worker === false ? null : make(onMsg, (msg) => this.workerFailed(msg));
    if (w) {
      this.transport = w;
      this.kind = 'worker';
    } else this.transport = inlineTransport(onMsg, this.now);
    socket.listen({
      json: (m) => this.fromJson(m),
      binary: (f, raw) => this.fromBinary(f, raw),
      state: (s) => {
        if (s === 'reconnecting') {
          this.note({ key: 'mp-net', title: 'Reconnecting…', tone: 'info', ttl: 4000 });
          this.lostAt(this.now(), 'socket');
        }
      },
    });
    if (opts.visibility !== false && typeof document !== 'undefined') {
      this.unwatch = watchVisibility({
        hidden: () => {
          this.lostAt(this.now(), 'hidden');
          this.socket.sendJson({ t: 'away' });
          this.transport.post({ t: 'hidden', hidden: true });
        },
        visible: () => {
          this.transport.post({ t: 'hidden', hidden: false });
          this.catching = true;
          this.lastSyncMs = this.now();
          this.socket.sendJson({ t: 'sync', fromTurn: this.lastTurn + 1 });
        },
      });
    }
  }

  private workerFailed(message: string): void {
    if (this.disposed) return;
    if (this.welcome) {
      this.listener.error?.(message);
      return;
    }
    // a failed module load: the inline core, replaying the start
    this.transport.close();
    this.restarts++;
    this.kind = 'inline';
    this.transport = inlineTransport((m) => this.fromCore(m), this.now);
    this.begin();
  }

  private note(n: NetNote): void {
    this.opts.notify?.(n);
  }

  /**
   * `back` at most once a second (with a fresh BEAT first, so the relay sees the received turn). The relay's JSON limit
   * is 5 per second: a `back` per joystick command used to earn strikes and close the socket, a drop loop.
   */
  private askBack(): void {
    const now = this.now();
    if (now - this.lastBackMs < 1000) return;
    this.lastBackMs = now;
    this.socket.beatNow();
    this.socket.sendJson({ t: 'back' });
  }

  /**
   * Drop and back notes for friends, debounced: "dropped" only when still gone 2 s later, "is back" only after a shown
   * "dropped" (jitter and a busy phone no longer flap the rail). A `laggy` frame (3 s of silence, no takeover) and its
   * `back` say nothing at all.
   */
  private readonly dropTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly dropShown = new Set<number>();
  private friendSlot(slot: number, reason: string, laggy: boolean): void {
    const name = short(this.nameOf(slot));
    if (laggy) return;
    if (reason === 'back') {
      const t = this.dropTimers.get(slot);
      if (t !== undefined) {
        clearTimeout(t);
        this.dropTimers.delete(slot);
      }
      if (this.dropShown.delete(slot)) this.note({ key: `mp-pilot-${slot}`, title: `${name} is back`, tone: 'good' });
      return;
    }
    if (reason === 'left') {
      this.dropShown.add(slot);
      this.note({ key: `mp-pilot-${slot}`, title: `${name} left · bot plays`, tone: 'bad' });
      return;
    }
    if (reason !== 'drop' && reason !== 'away' && reason !== 'afk') return;
    if (this.dropTimers.has(slot) || this.dropShown.has(slot)) return;
    this.dropTimers.set(
      slot,
      setTimeout(() => {
        this.dropTimers.delete(slot);
        if (this.disposed || !this.piloted(slot)) return;
        this.dropShown.add(slot);
        this.note({ key: `mp-pilot-${slot}`, title: `${name} dropped · bot plays`, tone: 'bad' });
      }, DROP_NOTE_MS),
    );
  }

  /** MatchSession calls join(); a party match starts from the relay's `match` config. */
  join(): void {
    this.begin();
  }

  private begin(): void {
    this.transport.post({ t: 'selftest', golden: golden() });
    const m = this.match;
    this.transport.post({ t: 'start', start: { config: m.config, slot: m.you.slot } });
    // the client asks for everything it has not applied (a resume or a reload catches up from turn 0)
    this.lastSyncMs = this.now();
    this.socket.sendJson({ t: 'sync', fromTurn: 0 });
    this.welcome = {
      t: 'welcome',
      matchId: m.room,
      seed: m.config.seed,
      simVersion: m.simVersion ?? SIM_VERSION,
      slot: m.you.slot as WelcomeMsg['slot'],
      team: 0,
      picks: m.config.picks as WelcomeMsg['picks'],
      tricks: m.config.tricks as WelcomeMsg['tricks'],
    };
    // asynchronous, as the LocalHost's (its welcome comes back from the Worker): MatchSession finishes its constructor first
    const w = this.welcome;
    setTimeout(() => {
      if (!this.disposed) this.listener.welcome?.(w);
    }, 0);
  }

  /** The player's command: own commands reach the local sim only through the relay's TURNs (§1.4). */
  send(cmd: Command): void {
    if (cmd.op === Op.Forfeit) {
      // a forfeit is a vote in party play (§4.6)
      this.socket.sendJson({ t: 'vote', kind: 'surrender', yes: true });
      return;
    }
    if (cmd.op === Op.Ping && this.match.you.slot !== 0) {
      // v1: pings from slots 1 and 2 are social markers only (§7 M2)
      this.socket.sendJson({ t: 'social', kind: 'ping', id: cmd.kind, x: Math.round(cmd.x), y: Math.round(cmd.y) });
      return;
    }
    if (cmd.op === Op.Move) this.predictor.move(cmd.x, cmd.y, this.now());
    else this.predictor.stop();
    if (this.piloted(this.match.you.slot)) {
      // an AFK player reclaims with any command; other pilot reasons need `back` (and the player is here: keep asking)
      this.reclaimUntil = Math.max(this.reclaimUntil, this.now() + 10_000);
      this.askBack();
    }
    this.coalescer.send(cmd);
  }

  /** Party play never pauses the sim from one client (Esc opens a local overlay; §4.6). */
  pause(_paused: boolean): void {
    void _paused;
  }

  leave(): void {
    this.socket.sendJson({ t: 'bye' });
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.dropTimers.values()) clearTimeout(t);
    this.dropTimers.clear();
    this.coalescer.dispose();
    this.transport.close();
    this.unwatch?.();
    this.listener = {};
  }

  private fromBinary(f: ServerBinary, raw: Uint8Array): void {
    if (f.type === Frame.TURN) {
      // forward the body (without the type byte) as a transferable buffer
      const body = raw.slice(1);
      this.transport.post({ t: 'turns', bytes: body.buffer as ArrayBuffer }, [body.buffer as ArrayBuffer]);
    } else if (f.type === Frame.CATCHUP) {
      const body = catchupBodies(raw);
      this.transport.post({ t: 'turns', bytes: body.buffer as ArrayBuffer }, [body.buffer as ArrayBuffer]);
      if (f.f.turns.length > 30) this.catching = true;
    }
  }

  private fromJson(m: ServerJson): void {
    switch (m.t) {
      case 'slot': {
        if (m.slot === this.match.you.slot) {
          if (m.reason === 'desync') this.note({ key: 'mp-resync', title: 'Re-syncing…', tone: 'info' });
          this.emit('slot', m.slot, m.reason as SlotReasonText, false);
          return;
        }
        // a friend took an open seat mid-match (§7 "Mira joined"): its name arrives with the frame
        const joined = m.joined === true;
        if (joined && typeof m.name === 'string' && m.name) this.names[m.slot] = m.name;
        const name = this.nameOf(m.slot);
        if (joined) {
          this.dropShown.delete(m.slot);
          this.note({ key: 'mp-join', title: `${short(name)} joined`, tone: 'good' });
        } else this.friendSlot(m.slot, m.reason, (m as { laggy?: boolean }).laggy === true);
        if ((m as { laggy?: boolean }).laggy === true) return;
        this.emit('slot', m.slot, m.reason as SlotReasonText, joined);
        return;
      }
      case 'resync':
        this.transport.post({ t: 'rebuild' });
        this.lastTurn = -1;
        this.catching = true;
        this.note({ key: 'mp-resync', title: 'Re-syncing…', tone: 'info' });
        return;
      case 'afk':
        this.note({ key: 'mp-afk', title: 'Still there? Bot in 15s', tone: 'bad', ttl: 6000 });
        return;
      case 'paused':
        this.transport.post({ t: 'paused', paused: m.paused });
        // the party HUD draws "Paused 0:47 · Resume" with its chip; without it, a plain note
        if (!this.emit('paused', { paused: m.paused, ...(m.leftMs !== undefined ? { leftMs: m.leftMs } : {}), ...(m.resuming ? { resuming: true } : {}) }))
          this.note({ key: 'mp-pause', title: m.paused ? 'Paused' : 'Resumed', tone: 'info' });
        return;
      case 'vote': {
        if (m.kind === 'rematch') return;
        const yes = (m.yes ?? []).map(Number).filter((n) => Number.isInteger(n));
        const v = { kind: m.kind, yes, need: m.need ?? 0, leftMs: m.endsMs ? Math.max(0, m.endsMs - this.serverNow()) : 0, ...(m.result ? { result: m.result } : {}) };
        if (this.emit('vote', v)) return;
        if (m.result) this.note({ key: `mp-vote-${m.kind}`, title: `${m.kind === 'surrender' ? 'Surrender' : 'Pause'} vote ${m.result === 'pass' ? 'passed' : 'failed'}`, tone: m.result === 'pass' ? 'gold' : 'info' });
        else if (m.need) this.note({ key: `mp-vote-${m.kind}`, title: `${m.kind === 'surrender' ? 'Surrender' : 'Pause'}? ${yes.length}/${m.need}`, tone: 'info', ttl: 5000 });
        return;
      }
      case 'social': {
        if (!socialIdOk(m.kind, m.id) || m.slot < 0 || m.slot > 5) return;
        const msg = { slot: m.slot, kind: m.kind, id: m.id, mine: m.slot === this.mySlot, ...(m.x !== undefined && m.y !== undefined ? clampSocialPoint(m.x, m.y) : {}), ...(m.target !== undefined ? { target: m.target } : {}) };
        if (this.emit('social', msg) || msg.mine) return;
        const line = socialLine(this.nameOf(m.slot), m.kind, m.id);
        if (line) this.note({ key: `mp-social-${m.slot}`, title: line, tone: 'info' });
        return;
      }
      case 'error':
        if (m.code === 'seat_elsewhere') this.note({ key: 'mp-tab', title: 'Playing in another tab', tone: 'bad', ttl: 8000 });
        else if (m.code === 'room_gone') this.note({ key: 'mp-net', title: 'Reconnecting…', tone: 'info' });
        return;
      case 'end':
        this.serverEnd = m;
        this.endAtMs = this.now();
        this.endInfo.scored = m.scored;
        if (m.why) this.endInfo.why = m.why;
        // no more TURNs will come: step every queued one now (the jitter buffer would hold the last B forever)
        this.transport.post({ t: 'drain' });
        this.maybeEnd();
        return;
      case 'match':
        // a resume: catch up from the next turn we do not have
        this.lastSyncMs = this.now();
        this.socket.sendJson({ t: 'sync', fromTurn: this.lastTurn + 1 });
        return;
      default:
        return;
    }
  }

  private fromCore(m: CoreOut | { t: 'error'; message: string }): void {
    if (this.disposed) return;
    switch (m.t) {
      case 'selftest':
        this.selftestOk = m.ok;
        if (!m.ok) this.note({ key: 'mp-update', title: 'Update to play together', tone: 'bad', ttl: 10_000 });
        return;
      case 'snap':
        this.listener.snap?.(this.lead(decodeSnap(m.buf)));
        return;
      case 'events':
        this.listener.events?.(m.tick, m.list as SimEvent[]);
        return;
      case 'hash':
        if (!this.catching) this.socket.sendHash(m.tick, m.hash);
        if (E2E) {
          const d = document.documentElement.dataset;
          const trail = (d.mpTrail ?? '').split(' ').filter(Boolean);
          trail.push(`${m.tick}:${(m.hash >>> 0).toString(16)}`);
          d.mpTrail = trail.slice(-40).join(' ');
        }
        return;
      case 'turn':
        if (E2E) {
          document.documentElement.dataset.mpTurn = String(m.lastTurn);
          document.documentElement.dataset.mpMask = String(m.modeMask);
          document.documentElement.dataset.mpBuffer = String(m.B);
          document.documentElement.dataset.mpQueue = String(m.queue ?? '');
          document.documentElement.dataset.mpHigh = String(m.high ?? '');
          document.documentElement.dataset.mpRecv = String(this.socket.receivedTurn ?? '');
          document.documentElement.dataset.mpEnd = this.serverEnd ? (this.coreEnded ? 'both' : 'relay') : this.coreEnded ? 'sim' : '';
        }
        // the core counts every applied turn (a reload's fast-forward too): the bot share and "Bot covered for you"
        // cover the whole stretch, from the drop, not only from the end of the catch-up
        if (m.pilotTurns) for (let s = 0; s < 6; s++) this.pilotTurns[s] = m.pilotTurns[s] ?? this.pilotTurns[s];
        if (typeof m.pilotFrom === 'number' && m.pilotFrom >= 0 && (this.myPilotFrom < 0 || m.pilotFrom < this.myPilotFrom)) this.myPilotFrom = m.pilotFrom;
        this.countPilots(m.lastTurn, m.modeMask, !!m.pilotTurns);
        this.lastTurn = m.lastTurn;
        this.socket.lastTurn = m.lastTurn;
        this.buffer = m.B;
        this.holds = m.holds;
        if (m.modeMask !== this.lastMask) {
          const prev = this.lastMask;
          this.lastMask = m.modeMask;
          this.emit('mask', m.modeMask, prev);
        }
        // a `back` sent before the relay saw our latest BEAT is refused: retry for a while after catching up
        // (a mid-match joiner or a reload takes its hero without having to touch anything first)
        if (!this.catching && this.piloted(this.match.you.slot) && this.now() < this.reclaimUntil) this.askBack();
        if (this.gapAt >= 0) {
          if (m.lastTurn >= this.gapAt) this.gapAt = -1;
          else this.retrySync(this.gapAt);
        }
        // the relay said the match ended but this sim has not: the last turns are missing, ask for them
        if (this.serverEnd && !this.coreEnded && this.now() - this.endAtMs > 2000) this.retrySync(m.lastTurn + 1);
        if (m.waiting && !this.waitingShown) {
          this.waitingShown = true;
          this.note({ key: 'mp-wait', title: 'Waiting for server…', tone: 'bad', ttl: 3000 });
        } else if (!m.waiting) this.waitingShown = false;
        return;
      case 'progress':
        if (!this.catching) this.catchups++;
        this.note({ key: 'mp-catchup', title: `Catching up ${m.pct}%`, tone: 'info', ttl: m.done ? 1200 : 4000 });
        if (m.done) this.caughtUp();
        return;
      case 'gap': {
        // one sync per 5 s (the relay's limit): the catch-up it starts also covers later gaps. The gap is kept, and
        // the sync retried every 5 s from the pacing ticks until it is filled (no more frames may come to retry on)
        if (this.gapAt < 0 || m.expected < this.gapAt) this.gapAt = m.expected;
        this.retrySync(this.gapAt);
        return;
      }
      case 'end':
        this.coreEnded = true;
        this.result = { r: m.result, record: m.record };
        this.endInfo.record = m.record;
        this.maybeEnd();
        return;
      case 'error':
        this.listener.error?.(m.message);
        return;
    }
  }

  /**
   * M6 "bot X%" and M4 "Bot covered for you · 0:42": turns flown by a bot per slot (from the TURN mode bits, in order
   * with the turns), and this player's own covered stretch, timed in turns (right after a catch-up too).
   */
  private countPilots(lastTurn: number, mask: number, counted = false): void {
    if (lastTurn <= this.countedTurn) return;
    const n = lastTurn - this.countedTurn;
    if (!counted) for (let s = 0; s < 6; s++) if ((mask >>> s) & 1) this.pilotTurns[s] += n;
    this.countedTurn = lastTurn;
    const mine = ((mask >>> this.mySlot) & 1) === 1;
    if (mine && this.myPilotFrom < 0) this.myPilotFrom = lastTurn;
    else if (!mine && this.myPilotFrom >= 0) {
      const seconds = Math.round(((lastTurn - this.myPilotFrom) * 2) / 30);
      this.myPilotFrom = -1;
      // a loading start (the first turns) is not "covering"; 2 s or more is worth saying
      if (seconds >= 2 && lastTurn > 60) {
        if (!this.emit('covered', seconds)) this.note({ key: 'mp-covered', title: `Bot covered for you · ${clock(seconds)}`, tone: 'info', ttl: 4000 });
      }
    }
  }

  /** The relay's clock now (vote `endsMs` is server time): local time plus the offset from `welcome`. */
  private serverNow(): number {
    return Date.now() + (this.socket.serverOffsetMs ?? 0);
  }

  /** Caught up after a reload, a resync or a hidden tab: tell the relay and take the hero back. */
  private reclaimUntil = 0;
  private lastBackMs = -Infinity;
  /** The first missing turn after a gap (-1: none), and when the relay's `end` came. */
  private gapAt = -1;
  private endAtMs = 0;
  private coreEnded = false;

  /** `sync` from `fromTurn`, at most once per 5 s (the relay's limit). */
  private retrySync(fromTurn: number): void {
    const now = this.now();
    if (now - this.lastSyncMs < 5000) return;
    this.lastSyncMs = now;
    this.socket.sendJson({ t: 'sync', fromTurn: Math.max(0, fromTurn) });
  }

  /** mp_disconnect, once per outage; the next catch-up reports mp_rejoin. */
  private outage: { at: number; turn: number; via: 'resume' | 'reload' } | null = null;
  private lostAt(now: number, cause: 'socket' | 'hidden'): void {
    if (this.outage) return;
    this.outage = { at: now, turn: this.lastTurn, via: 'resume' };
    this.opts.track?.('mp_disconnect', { cause });
  }

  private caughtUp(): void {
    // a reload starts with no turns: its first catch-up is a rejoin too (reported once)
    if (!this.outage && this.lastTurn > 30 && !this.rejoinSent && this.match.startInMs === 0) this.outage = { at: this.bornAt, turn: 0, via: 'reload' };
    if (this.outage) {
      this.opts.track?.('mp_rejoin', { ms: Math.round(this.now() - this.outage.at), ticks_ff: Math.max(0, this.lastTurn - this.outage.turn) * 2, via: this.outage.via });
      this.outage = null;
      this.rejoinSent = true;
    }
    this.catching = false;
    this.reclaimUntil = this.now() + 10_000;
    this.lastBackMs = -Infinity;
    if (this.piloted(this.match.you.slot)) this.askBack();
    else this.socket.beatNow();
  }

  private endTimer: ReturnType<typeof setTimeout> | null = null;

  /** The local sim ended: hand the result to the session (the relay's `end` adds the private save status). */
  private maybeEnd(): void {
    if (!this.result) return;
    const go = () => {
      if (!this.result || this.disposed) return;
      const res = this.result;
      this.result = null;
      this.endInfo.names = [...this.names];
      this.endInfo.pilotPct = [0, 1, 2, 3, 4, 5].map((slot) => this.pilotPct(slot));
      const me = res.record?.humans.find((h) => h.slot === this.match.you.slot);
      const replay: ReplayRecord & { party?: PartyEnd } = {
        v: 1,
        simVersion: res.record?.simVersion ?? SIM_VERSION,
        seed: this.match.config.seed,
        difficulty: this.match.config.difficulty as ReplayRecord['difficulty'],
        hero: (me?.hero ?? this.match.config.picks[this.match.you.slot]) as ReplayRecord['hero'],
        trick: (me?.trick ?? this.match.config.tricks[this.match.you.slot]) as ReplayRecord['trick'],
        ticks: res.r.ticks,
        inputs: '',
        outcome: res.r.outcome,
        finalHash: res.r.finalHash,
        mutator: 'none',
        party: this.endInfo,
      };
      this.listener.end?.(res.r, replay);
    };
    // wait briefly for the relay's `end` (the private save status), never longer than 1.5 s
    if (this.serverEnd) go();
    else if (this.endTimer === null) this.endTimer = setTimeout(go, 1500);
  }

  /** Cosmetic lead on the player's own hero (§4.3); the sim is never touched. */
  private lead(s: Snapshot): Snapshot {
    const slot = this.match.you.slot;
    const me = s.entities.find((e) => e.id === slot);
    if (!me || me.state === 'dead') return s;
    const locked = (me.buffs & (8 | 16)) !== 0 || me.charmed === true;
    const off = this.predictor.offset({ x: me.x, y: me.y, locked, speed: 120 }, Math.min(250, this.socket.rttMs / 2 + TURN_MS * 1.5), this.now());
    if (off.dx === 0 && off.dy === 0) return s;
    me.x = Math.round(me.x + off.dx);
    me.y = Math.round(me.y + off.dy);
    return s;
  }

  get ready(): boolean | null {
    return this.selftestOk;
  }
}

/** A friend's drop shows on the rail only when it lasts this long (a short blip says nothing). */
export const DROP_NOTE_MS = 2000;

const short = (name: string): string => (name.length > 14 ? `${name.slice(0, 13)}…` : name);
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const isHostListener = (l: HostListener | PartyLinkListener): l is HostListener =>
  'welcome' in l || 'snap' in l || 'events' in l || 'end' in l || 'error' in l;
