/**
 * The party client's sim worker (MULTIPLAYER.md §4.1): runs the golden self-test, creates the match from the relay's
 * config and steps TURNs as they arrive: the Pacer steps a due turn on arrival and otherwise sleeps until the
 * LockstepRunner's playout time, on the worker's own timer (never main-thread rAF). The socket stays on the main
 * thread; turns cross as transferable ArrayBuffers.
 *
 * It runs inside the one sim Worker (host/local-host.worker.ts, started with the name `NET_WORKER_NAME`), so the build
 * ships one worker copy of the sim (MULTIPLAYER.md §8: "the net-host worker reuses the sim worker bundle").
 */
import { NetCore, type CoreIn, type CoreOut } from './net-core';
import { Pacer } from './pacer';

/** The Worker `name` that makes the sim Worker a net host (net/net-host.ts starts it with this name). */
export const NET_WORKER_NAME = 'pawlegends-net';

/** The bits of DedicatedWorkerGlobalScope we use (the project compiles against the DOM lib). */
export interface NetWorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
}

/** Runs the net host on this Worker scope. */
export function runNetWorker(scope: NetWorkerScope): void {
  const core = new NetCore((m: CoreOut, transfer?: Transferable[]) => scope.postMessage(m, transfer ?? []));
  const fail = (err: unknown) => scope.postMessage({ t: 'error', message: err instanceof Error ? err.message : String(err) });
  const pacer = new Pacer(
    core,
    { now: () => performance.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
    fail,
  );

  scope.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as CoreIn;
    try {
      core.handle(msg);
      if (msg.t === 'start') pacer.start();
      else if (msg.t === 'turns' || msg.t === 'drain' || msg.t === 'hidden' || msg.t === 'rebuild') pacer.kick();
    } catch (err) {
      fail(err);
    }
  });
}
