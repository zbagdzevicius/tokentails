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
import { Frame, catchupBodies, type MatchMsg, type ServerBinary, type ServerJson } from './proto';
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

export class NetHost {
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
  private readonly names: (string | null)[];
  /** Turn mode bits of the last applied turn: slot s piloted. */
  piloted(slot: number): boolean {
    return ((this.lastMask >>> slot) & 1) === 1;
  }

  constructor(readonly socket: PartySocket, readonly match: MatchMsg, private readonly opts: NetHostOptions = {}) {
    this.now = opts.now ?? (() => performance.now());
    this.names = match.names;
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
        if (s === 'reconnecting') this.note({ key: 'mp-net', title: 'Reconnecting…', tone: 'info', ttl: 4000 });
      },
    });
    if (opts.visibility !== false && typeof document !== 'undefined') {
      this.unwatch = watchVisibility({
        hidden: () => {
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

  listen(l: HostListener): void {
    this.listener = l;
  }

  private note(n: NetNote): void {
    this.opts.notify?.(n);
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
      // an AFK player reclaims with any command; other pilot reasons need `back`
      this.socket.beatNow();
      this.socket.sendJson({ t: 'back' });
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
          return;
        }
        const name = this.names[m.slot] ?? `Teammate ${m.slot + 1}`;
        if (m.reason === 'back') this.note({ key: `mp-pilot-${m.slot}`, title: `${short(name)} is back`, tone: 'good' });
        else if (m.reason === 'drop' || m.reason === 'away' || m.reason === 'afk' || m.reason === 'left') this.note({ key: `mp-pilot-${m.slot}`, title: `${short(name)} dropped · bot plays`, tone: 'bad' });
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
        this.note({ key: 'mp-pause', title: m.paused ? 'Paused' : 'Resumed', tone: 'info' });
        return;
      case 'vote':
        if (m.result) this.note({ key: `mp-vote-${m.kind}`, title: `${m.kind === 'surrender' ? 'Surrender' : 'Pause'} vote ${m.result === 'pass' ? 'passed' : 'failed'}`, tone: m.result === 'pass' ? 'gold' : 'info' });
        else if (m.yes && m.need) this.note({ key: `mp-vote-${m.kind}`, title: `${m.kind === 'surrender' ? 'Surrender' : 'Pause'}? ${m.yes.length}/${m.need}`, tone: 'info', ttl: 5000 });
        return;
      case 'social': {
        const from = this.names[m.slot] ?? 'Teammate';
        this.note({ key: `mp-social-${m.from}`, title: `${short(from)}: ${socialText(m.kind, m.id)}`, tone: 'info' });
        return;
      }
      case 'error':
        if (m.code === 'seat_elsewhere') this.note({ key: 'mp-tab', title: 'Playing in another tab', tone: 'bad', ttl: 8000 });
        else if (m.code === 'room_gone') this.note({ key: 'mp-net', title: 'Reconnecting…', tone: 'info' });
        return;
      case 'end':
        this.serverEnd = m;
        this.endInfo.scored = m.scored;
        if (m.why) this.endInfo.why = m.why;
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
        }
        this.lastTurn = m.lastTurn;
        this.socket.lastTurn = m.lastTurn;
        this.lastMask = m.modeMask;
        if (m.waiting && !this.waitingShown) {
          this.waitingShown = true;
          this.note({ key: 'mp-wait', title: 'Waiting for server…', tone: 'bad', ttl: 3000 });
        } else if (!m.waiting) this.waitingShown = false;
        return;
      case 'progress':
        this.note({ key: 'mp-catchup', title: `Catching up ${m.pct}%`, tone: 'info', ttl: m.done ? 1200 : 4000 });
        if (m.done) this.caughtUp();
        return;
      case 'gap': {
        // one sync per 5 s (the relay's limit): the catch-up it starts also covers later gaps
        const now = this.now();
        if (now - this.lastSyncMs >= 5000) {
          this.lastSyncMs = now;
          this.socket.sendJson({ t: 'sync', fromTurn: m.expected });
        }
        return;
      }
      case 'end':
        this.result = { r: m.result, record: m.record };
        this.endInfo.record = m.record;
        this.maybeEnd();
        return;
      case 'error':
        this.listener.error?.(m.message);
        return;
    }
  }

  /** Caught up after a reload, a resync or a hidden tab: tell the relay and take the hero back. */
  private caughtUp(): void {
    this.catching = false;
    this.socket.beatNow();
    if (this.piloted(this.match.you.slot)) this.socket.sendJson({ t: 'back' });
  }

  private endTimer: ReturnType<typeof setTimeout> | null = null;

  /** The local sim ended: hand the result to the session (the relay's `end` adds the private save status). */
  private maybeEnd(): void {
    if (!this.result) return;
    const go = () => {
      if (!this.result || this.disposed) return;
      const res = this.result;
      this.result = null;
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

const short = (name: string): string => (name.length > 14 ? `${name.slice(0, 13)}…` : name);

const CHAT = ['Nice!', 'On my way', 'Help me', 'Group up', 'Back off', 'Push', 'Thanks', 'GG'];
function socialText(kind: string, id: number): string {
  if (kind === 'chat') return CHAT[id] ?? '…';
  if (kind === 'emote') return 'Emote';
  return 'Ping!';
}
