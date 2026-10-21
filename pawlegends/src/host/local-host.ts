/**
 * Main-thread client of the LocalHost (POC.md §3). Starts the sim Worker and speaks the §11.2 protocol to it; where
 * Workers are missing (tests, odd embeds) it runs the same TickLoop on the main thread, so the message stream is
 * identical either way. Snapshots arrive as transferable buffers and are decoded here.
 *
 * A Worker that fails before its first `welcome` (the module script did not load: a network blip, a stale hashed
 * chunk after a deploy) is retried once and then replaced by the inline loop, replaying what was sent since `join`,
 * so a failed fetch never reaches the crash overlay. After `welcome` a Worker error is a real sim failure and stays
 * fatal. Errors the sim posts itself (`{t:'error'}`) are deterministic and are never retried.
 */
import { encodeCommand } from '../sim/commands';
import type { Command, Difficulty, HeroId, MatchResult, ReplayRecord, SimEvent, Snapshot, TrickId } from '../sim/api';
import { decodeSnap, isHostMsg, type ClientMsg, type HostMsg, type WelcomeMsg } from './protocol';
import { TickLoop } from './tick-loop';

export interface JoinOptions {
  hero: HeroId;
  trick: TrickId;
  difficulty: Difficulty;
  seed?: number;
  speed?: number;
}

export interface HostListener {
  welcome?(w: WelcomeMsg): void;
  snap?(s: Snapshot): void;
  events?(tick: number, list: SimEvent[]): void;
  end?(result: MatchResult, replay: ReplayRecord): void;
  error?(message: string): void;
}

export interface HostTransport {
  send(msg: ClientMsg): void;
  close(): void;
  readonly kind: 'worker' | 'inline';
}

/** Worker attempts before the inline fallback (the first start plus one retry). */
export const WORKER_ATTEMPTS = 2;

function workerTransport(onMsg: (m: unknown) => void, onFail: (message: string) => void): HostTransport | null {
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./local-host.worker.ts', import.meta.url), { type: 'module', name: 'pawlegends-sim' });
    w.addEventListener('message', (e) => onMsg(e.data));
    w.addEventListener('error', (e) => {
      e.preventDefault?.();
      onFail(e.message || 'sim worker failed');
    });
    return {
      kind: 'worker',
      send: (msg) => w.postMessage(msg),
      close: () => w.terminate(),
    };
  } catch {
    return null;
  }
}

function inlineTransport(onMsg: (m: unknown) => void): HostTransport {
  const loop = new TickLoop({
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    post: (m) => onMsg(m),
  });
  return {
    kind: 'inline',
    send: (msg) => {
      try {
        loop.handle(msg);
      } catch (err) {
        onMsg({ t: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    },
    close: () => loop.handle({ t: 'leave' }),
  };
}

export interface LocalHostOptions {
  worker?: boolean;
  /** Test seam: builds the worker transport (default: the real module Worker). */
  makeWorker?: (onMsg: (m: unknown) => void, onFail: (message: string) => void) => HostTransport | null;
}

export class LocalHost {
  private transport: HostTransport;
  private listener: HostListener = {};
  private lastTick = 0;
  private attempts = 0;
  private disposed = false;
  /** Everything sent since the last `join`, until `welcome` arrives: replayed on a fresh transport after a failed start. */
  private pending: ClientMsg[] | null = null;
  private readonly makeWorker: NonNullable<LocalHostOptions['makeWorker']>;
  welcome: WelcomeMsg | null = null;
  /** How many times the Worker failed to start and was replaced (0 on a clean start). */
  restarts = 0;

  constructor(opts: LocalHostOptions = {}) {
    this.makeWorker = opts.makeWorker ?? workerTransport;
    this.transport = (opts.worker !== false ? this.startWorker() : null) ?? inlineTransport(this.onMsg);
  }

  get kind(): 'worker' | 'inline' {
    return this.transport.kind;
  }

  private readonly onMsg = (m: unknown): void => this.receive(m);

  private startWorker(): HostTransport | null {
    this.attempts++;
    const t: HostTransport | null = this.makeWorker(
      (m) => {
        if (this.transport === t) this.onMsg(m);
      },
      (message) => {
        if (this.transport === t) this.workerFailed(message);
      },
    );
    return t;
  }

  private workerFailed(message: string): void {
    if (this.disposed) return;
    if (this.welcome) {
      // past `welcome` the script loaded: an uncaught sim failure, fatal as before
      this.listener.error?.(message);
      return;
    }
    this.transport.close();
    this.restarts++;
    const next = (this.attempts < WORKER_ATTEMPTS ? this.startWorker() : null) ?? inlineTransport(this.onMsg);
    this.transport = next;
    for (const msg of this.pending ?? []) next.send(msg);
  }

  private post(msg: ClientMsg): void {
    if (this.pending && !this.welcome) this.pending.push(msg);
    this.transport.send(msg);
  }

  listen(l: HostListener): void {
    this.listener = l;
  }

  join(o: JoinOptions): void {
    this.welcome = null;
    this.lastTick = 0;
    this.pending = [];
    this.post({ t: 'join', slot: 0, hero: o.hero, trick: o.trick, difficulty: o.difficulty, seed: o.seed, speed: o.speed });
  }

  /** One command for the host's next tick. */
  send(cmd: Command): void {
    this.post({ t: 'cmd', tick: this.lastTick, bytes: encodeCommand(cmd) });
  }

  pause(paused: boolean): void {
    this.post({ t: 'pause', paused });
  }

  leave(): void {
    this.post({ t: 'leave' });
  }

  dispose(): void {
    this.disposed = true;
    this.pending = null;
    this.transport.close();
    this.listener = {};
  }

  private receive(m: unknown): void {
    const err = m as { t?: string; message?: string };
    if (err && err.t === 'error') {
      this.listener.error?.(String(err.message ?? 'sim error'));
      return;
    }
    if (!isHostMsg(m)) return;
    const msg = m as HostMsg;
    switch (msg.t) {
      case 'welcome':
        this.welcome = msg;
        this.pending = null;
        this.listener.welcome?.(msg);
        break;
      case 'snap': {
        const s = decodeSnap(msg.buf);
        this.lastTick = s.clock.tick;
        this.listener.snap?.(s);
        break;
      }
      case 'events':
        this.listener.events?.(msg.tick, msg.list);
        break;
      case 'end':
        this.listener.end?.(msg.result, msg.replay);
        break;
    }
  }
}
