/**
 * Main-thread client of the LocalHost (POC.md §3). Starts the sim Worker and speaks the §11.2 protocol to it; where
 * Workers are missing (tests, odd embeds) it runs the same TickLoop on the main thread, so the message stream is
 * identical either way. Snapshots arrive as transferable buffers and are decoded here.
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

function workerTransport(onMsg: (m: unknown) => void): HostTransport | null {
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./local-host.worker.ts', import.meta.url), { type: 'module', name: 'pawlegends-sim' });
    w.addEventListener('message', (e) => onMsg(e.data));
    w.addEventListener('error', (e) => onMsg({ t: 'error', message: e.message || 'sim worker failed' }));
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

export class LocalHost {
  private readonly transport: HostTransport;
  private listener: HostListener = {};
  private lastTick = 0;
  welcome: WelcomeMsg | null = null;

  constructor(opts: { worker?: boolean } = {}) {
    const onMsg = (m: unknown): void => this.receive(m);
    this.transport = (opts.worker !== false ? workerTransport(onMsg) : null) ?? inlineTransport(onMsg);
  }

  get kind(): 'worker' | 'inline' {
    return this.transport.kind;
  }

  listen(l: HostListener): void {
    this.listener = l;
  }

  join(o: JoinOptions): void {
    this.welcome = null;
    this.lastTick = 0;
    this.transport.send({ t: 'join', slot: 0, hero: o.hero, trick: o.trick, difficulty: o.difficulty, seed: o.seed, speed: o.speed });
  }

  /** One command for the host's next tick. */
  send(cmd: Command): void {
    this.transport.send({ t: 'cmd', tick: this.lastTick, bytes: encodeCommand(cmd) });
  }

  pause(paused: boolean): void {
    this.transport.send({ t: 'pause', paused });
  }

  leave(): void {
    this.transport.send({ t: 'leave' });
  }

  dispose(): void {
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
