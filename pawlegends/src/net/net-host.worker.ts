/**
 * The party client's sim worker (MULTIPLAYER.md §4.1): runs the golden self-test, creates the match from the relay's
 * config and steps TURNs as they arrive: the Pacer steps a due turn on arrival and otherwise sleeps until the
 * LockstepRunner's playout time, on the worker's own timer (never main-thread rAF). The socket stays on the main
 * thread; turns cross as transferable ArrayBuffers.
 */
import { NetCore, type CoreIn, type CoreOut } from './net-core';
import { Pacer } from './pacer';

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
}
const scope = self as unknown as WorkerScope;
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
