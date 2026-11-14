/**
 * The spectate host (docs/plans/moba/SPECTATE.md §3): a MatchHost over the relay's delayed TURN stream. It re-simulates
 * the match with this build's frozen sim in the same net-host worker the players run (NetCore, paced by the
 * LockstepRunner), so the normal match view draws it. It sends nothing that could reach the match: no commands, no
 * hashes, no votes; only `sync` when a turn is missing (the relay answers from the delayed log).
 *
 * The view follows one hero's team (fog and events are that team's, as the players see them); the spectate bar moves
 * the camera to any hero or frees it.
 */
import { SIM_VERSION } from '../sim/version';
import type { Command, MatchResult, ReplayRecord, SimEvent, Snapshot } from '../sim/api';
import { decodeSnap, type MatchHost, type WelcomeMsg } from '../host/protocol';
import type { HostListener, JoinOptions } from '../host/local-host';
import { catchupBodies, Frame, type MatchMsg, type ServerBinary, type ServerJson } from '../net/proto';
import type { CoreIn, CoreOut } from '../net/net-core';
import { inlineTransport, workerTransport } from '../net/net-host';
import type { PartySocket } from '../net/socket';

const golden = (): string => (typeof __SIM_GOLDEN__ !== 'undefined' ? __SIM_GOLDEN__ : '');

/** What the spectate bar hears from the host. */
export interface SpectateEvents {
  /** Catch-up to the delayed turn (0..100), then done. */
  progress?(pct: number, done: boolean): void;
  /** The newest snapshot (the bar reads hero positions and the score from it). */
  snap?(s: Snapshot): void;
  /** The local sim reached the end (the relay's `end` came or will within 1.5 s). */
  ended?(r: MatchResult): void;
  /** This build's sim failed the golden self-test: it cannot re-run the match. */
  update?(): void;
}

export class SpectateHost implements MatchHost {
  private listener: HostListener = {};
  private transport: { post(m: CoreIn, transfer?: Transferable[]): void; close(): void };
  kind: 'worker' | 'inline' = 'inline';
  restarts = 0;
  welcome: WelcomeMsg | null = null;
  /** The last applied turn (-1: none) and the newest snapshot tick. */
  lastTurn = -1;
  tick = 0;
  private disposed = false;
  private result: MatchResult | null = null;
  private serverEnd = false;
  private gapAt = -1;
  private lastSyncMs = -Infinity;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  events: SpectateEvents = {};

  constructor(
    readonly socket: PartySocket,
    readonly match: MatchMsg,
    /** The hero slot the view follows (its team's fog and events). */
    readonly follow: number,
    private readonly opts: { worker?: boolean; now?: () => number } = {},
  ) {
    const onMsg = (m: CoreOut | { t: 'error'; message: string }) => this.fromCore(m);
    const w = opts.worker === false ? null : workerTransport(onMsg, (msg) => this.workerFailed(msg));
    if (w) {
      this.transport = w;
      this.kind = 'worker';
    } else this.transport = inlineTransport(onMsg, this.now);
  }

  private get now(): () => number {
    return this.opts.now ?? (() => performance.now());
  }

  /** Turns and frames from the spectate socket (the viewer forwards them). */
  binary(f: ServerBinary, raw: Uint8Array): void {
    if (this.disposed) return;
    if (f.type === Frame.TURN) {
      const body = raw.slice(1);
      this.transport.post({ t: 'turns', bytes: body.buffer as ArrayBuffer }, [body.buffer as ArrayBuffer]);
    } else if (f.type === Frame.CATCHUP) {
      const body = catchupBodies(raw);
      this.transport.post({ t: 'turns', bytes: body.buffer as ArrayBuffer, catchup: true }, [body.buffer as ArrayBuffer]);
    }
  }

  json(m: ServerJson): void {
    if (this.disposed) return;
    if (m.t === 'end') {
      this.serverEnd = true;
      // no more turns will come: step every queued one now
      this.transport.post({ t: 'drain' });
      this.maybeEnd();
    } else if (m.t === 'match' && m.room === this.match.room) {
      // the socket came back (a drop or a relay move): the stream continues from the next turn this sim lacks
      this.sync(this.lastTurn + 1, true);
    } else if (m.t === 'paused') this.transport.post({ t: 'paused', paused: m.paused });
  }

  listen(l: HostListener): void {
    this.listener = l;
  }

  join(_o?: JoinOptions): void {
    this.begin();
  }

  private begin(): void {
    const m = this.match;
    this.transport.post({ t: 'selftest', golden: golden() });
    this.transport.post({ t: 'start', start: { config: m.config as never, slot: this.follow } });
    this.sync(0, true);
    const pvp = m.config.mode === 'pvp';
    const lead1 = m.config.map === 'hearthwood' ? 5 : 3;
    this.welcome = {
      t: 'welcome',
      matchId: m.room,
      seed: m.config.seed,
      simVersion: m.simVersion ?? SIM_VERSION,
      slot: this.follow as WelcomeMsg['slot'],
      team: pvp && this.follow >= lead1 ? 1 : 0,
      picks: m.config.picks as WelcomeMsg['picks'],
      tricks: m.config.tricks as WelcomeMsg['tricks'],
      ...(m.config.map === 'hearthwood' ? { map: 'hearthwood' as const } : {}),
    } as WelcomeMsg;
    const w = this.welcome;
    setTimeout(() => {
      if (!this.disposed) this.listener.welcome?.(w);
    }, 0);
  }

  private workerFailed(message: string): void {
    if (this.disposed) return;
    if (this.welcome && this.lastTurn >= 0) {
      this.listener.error?.(message);
      return;
    }
    this.transport.close();
    this.restarts++;
    this.kind = 'inline';
    this.transport = inlineTransport((m) => this.fromCore(m), this.now);
    this.lastTurn = -1;
    if (this.welcome) {
      this.transport.post({ t: 'start', start: { config: this.match.config as never, slot: this.follow } });
      this.sync(0, true);
    }
  }

  /** `sync` from a turn, at most every 5 s (the relay's limit) unless forced by a fresh start or a reconnect. */
  private sync(fromTurn: number, force = false): void {
    const now = this.now();
    if (!force && now - this.lastSyncMs < 5000) return;
    this.lastSyncMs = now;
    this.socket.sendJson({ t: 'sync', fromTurn: Math.max(0, fromTurn) });
  }

  private fromCore(m: CoreOut | { t: 'error'; message: string }): void {
    if (this.disposed) return;
    switch (m.t) {
      case 'selftest':
        if (!m.ok) this.events.update?.();
        return;
      case 'snap': {
        const s = decodeSnap(m.buf);
        this.tick = s.clock.tick;
        this.listener.snap?.(s);
        this.events.snap?.(s);
        return;
      }
      case 'events':
        this.listener.events?.(m.tick, m.list as SimEvent[]);
        return;
      case 'turn':
        this.lastTurn = m.lastTurn;
        this.socket.lastTurn = m.lastTurn;
        if (this.gapAt >= 0) {
          if (m.lastTurn >= this.gapAt) this.gapAt = -1;
          else this.sync(this.gapAt);
        }
        return;
      case 'progress':
        this.events.progress?.(m.pct, m.done);
        return;
      case 'gap':
        if (this.gapAt < 0 || m.expected < this.gapAt) this.gapAt = m.expected;
        this.sync(this.gapAt);
        return;
      case 'end':
        this.result = m.result;
        this.maybeEnd();
        return;
      case 'hash':
        return;
      case 'error':
        this.listener.error?.(m.message);
        return;
    }
  }

  /** The local sim ended: hand the result to the session once the relay's `end` came (or 1.5 s later). */
  private maybeEnd(): void {
    if (!this.result) return;
    const go = () => {
      const r = this.result;
      if (!r || this.disposed) return;
      this.result = null;
      this.events.ended?.(r);
      const m = this.match;
      const replay: ReplayRecord = {
        v: 1,
        simVersion: m.simVersion ?? SIM_VERSION,
        seed: m.config.seed,
        difficulty: m.config.difficulty as ReplayRecord['difficulty'],
        hero: m.config.picks[this.follow] as ReplayRecord['hero'],
        trick: m.config.tricks[this.follow] as ReplayRecord['trick'],
        ticks: r.ticks,
        inputs: '',
        outcome: r.outcome,
        finalHash: r.finalHash,
        mutator: 'none',
      };
      this.listener.end?.(r, replay);
    };
    if (this.serverEnd) go();
    else if (this.endTimer === null) this.endTimer = setTimeout(go, 1500);
  }

  /** A spectator sends nothing that could reach the match. */
  send(_cmd: Command): void {
    /* no input */
  }

  /** The relay's clock drives the match; a spectator cannot pause it. */
  pause(_paused: boolean): void {
    /* never */
  }

  leave(): void {
    this.socket.sendJson({ t: 'spectate.leave' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.endTimer !== null) clearTimeout(this.endTimer);
    this.transport.close();
    this.listener = {};
    this.events = {};
  }
}
