/**
 * The replay viewer's MatchHost (MATCH-MOMENTS.md §2). A ReplayEngine owns one sim Worker (the game's own
 * local-host.worker.ts, `r:` messages) for the whole viewing, so its keyframes survive a seek; each MatchSession the
 * viewer builds gets a thin ReplayHost over it. Without Workers the same ReplayLoop runs on the main thread.
 */
import type { Command, MatchResult, ReplayRecord, SimEvent, Snapshot } from '../sim/api';
import type { HostListener, JoinOptions } from '../host/local-host';
import { decodeSnap, type MatchHost, type WelcomeMsg } from '../host/protocol';
import type { ReplayError, ReplayInfo, ReplayRecordLike } from './core';
import { ReplayLoop, clampReplaySpeed, isReplayHostMsg, type ReplayClientMsg, type ReplayHostMsg, type ReplaySpeed } from './loop';

interface Transport {
  readonly kind: 'worker' | 'inline';
  send(m: ReplayClientMsg): void;
  close(): void;
}

function inlineTransport(onMsg: (m: unknown) => void): Transport {
  const loop = new ReplayLoop({
    now: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    post: (m) => onMsg(m),
  });
  return {
    kind: 'inline',
    send: (m) => {
      try {
        loop.handle(m);
      } catch (err) {
        onMsg({ t: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    },
    close: () => loop.handle({ t: 'r:leave' }),
  };
}

function workerTransport(onMsg: (m: unknown) => void, onFail: () => void): Transport | null {
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('../host/local-host.worker.ts', import.meta.url), { type: 'module', name: 'pawlegends-sim' });
    w.addEventListener('message', (e) => onMsg(e.data));
    w.addEventListener('error', (e) => {
      e.preventDefault?.();
      onFail();
    });
    return { kind: 'worker', send: (m) => w.postMessage(m), close: () => w.terminate() };
  } catch {
    return null;
  }
}

export interface EngineListener {
  info?(i: ReplayInfo): void;
  error?(why: ReplayError | 'crash'): void;
}

export class ReplayEngine {
  private transport: Transport;
  private heard = false;
  private lastLoad: ReplayClientMsg | null = null;
  private host: ReplayHost | null = null;
  private userPaused = false;
  private hostPaused = true;
  private disposed = false;
  info: ReplayInfo | null = null;
  speed: ReplaySpeed = 1;
  listener: EngineListener = {};

  constructor(private readonly record: ReplayRecordLike, opts: { worker?: boolean } = {}) {
    this.transport = (opts.worker !== false ? workerTransport(this.onMsg, () => this.workerFailed()) : null) ?? inlineTransport(this.onMsg);
  }

  get kind(): 'worker' | 'inline' {
    return this.transport.kind;
  }

  get paused(): boolean {
    return this.userPaused;
  }

  private readonly onMsg = (m: unknown): void => {
    if (this.disposed) return;
    this.heard = true;
    const err = m as { t?: string; message?: string };
    if (err?.t === 'error') {
      this.listener.error?.('crash');
      return;
    }
    if (!isReplayHostMsg(m)) return;
    const msg = m as ReplayHostMsg;
    if (msg.t === 'r:info') {
      this.info = msg.info;
      this.listener.info?.(msg.info);
      return;
    }
    if (msg.t === 'r:error') {
      this.listener.error?.(msg.why);
      return;
    }
    this.host?.receive(msg);
  };

  /** A Worker that never answered (its script did not load): the inline loop takes over and the load is sent again. */
  private workerFailed(): void {
    if (this.disposed) return;
    if (this.heard) {
      this.listener.error?.('crash');
      return;
    }
    this.transport.close();
    this.transport = inlineTransport(this.onMsg);
    if (this.lastLoad) this.transport.send(this.lastLoad);
  }

  /** A MatchHost for one MatchSession, starting the replay at tick `at`. */
  hostAt(at: number): ReplayHost {
    this.host?.detach();
    const h = new ReplayHost(this, at);
    this.host = h;
    return h;
  }

  /** @internal ReplayHost.join */
  load(host: ReplayHost, at: number): void {
    if (host !== this.host) return;
    this.hostPaused = true;
    this.lastLoad = { t: 'r:load', record: this.record, at, speed: this.speed };
    this.transport.send(this.lastLoad);
  }

  /** @internal the session's own pause (countdown, menu, hidden tab) */
  hostPause(host: ReplayHost, p: boolean): void {
    if (host !== this.host) return;
    this.hostPaused = p;
    this.sync();
  }

  /** @internal */
  detached(host: ReplayHost): void {
    if (host !== this.host) return;
    this.host = null;
    this.transport.send({ t: 'r:pause', paused: true });
  }

  /** The viewer's play/pause button. */
  setPaused(p: boolean): void {
    this.userPaused = p;
    this.sync();
  }

  setSpeed(s: number): void {
    this.speed = clampReplaySpeed(s);
    this.transport.send({ t: 'r:speed', speed: this.speed });
  }

  private sync(): void {
    this.transport.send({ t: 'r:pause', paused: this.userPaused || this.hostPaused });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.host?.detach();
    this.host = null;
    this.transport.send({ t: 'r:leave' });
    this.transport.close();
    this.listener = {};
  }
}

/** One MatchSession's view of the engine. Commands are ignored: a replay plays only what was recorded. */
export class ReplayHost implements MatchHost {
  private listener: HostListener = {};
  private attached = true;
  welcome: WelcomeMsg | null = null;
  readonly restarts = 0;
  /** The newest snapshot tick (the viewer's bar reads it). */
  tick = 0;

  constructor(
    private readonly engine: ReplayEngine,
    private readonly at: number,
  ) {}

  get kind(): 'worker' | 'inline' {
    return this.engine.kind;
  }

  listen(l: HostListener): void {
    this.listener = l;
  }

  join(_o: JoinOptions): void {
    this.engine.load(this, this.at);
  }

  send(_cmd: Command): void {
    /* a replay takes no input */
  }

  pause(paused: boolean): void {
    if (this.attached) this.engine.hostPause(this, paused);
  }

  leave(): void {
    this.pause(true);
  }

  dispose(): void {
    this.detach();
  }

  /** @internal */
  detach(): void {
    if (!this.attached) return;
    this.engine.detached(this);
    this.attached = false;
    this.listener = {};
  }

  /** @internal a host message from the engine */
  receive(msg: Exclude<ReplayHostMsg, { t: 'r:info' } | { t: 'r:error' }>): void {
    if (!this.attached) return;
    switch (msg.t) {
      case 'welcome':
        this.welcome = msg;
        this.listener.welcome?.(msg);
        break;
      case 'snap': {
        const s: Snapshot = decodeSnap(msg.buf);
        this.tick = s.clock.tick;
        this.listener.snap?.(s);
        break;
      }
      case 'events':
        this.listener.events?.(msg.tick, msg.list as SimEvent[]);
        break;
      case 'end':
        this.listener.end?.(msg.result as MatchResult, msg.replay as ReplayRecord);
        break;
    }
  }
}
