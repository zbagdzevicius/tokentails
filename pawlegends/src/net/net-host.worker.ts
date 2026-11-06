/**
 * The party client's sim worker (MULTIPLAYER.md §4.1): runs the golden self-test, creates the match from the relay's
 * config and steps TURNs as they arrive, paced by the LockstepRunner on the worker's own timer (never main-thread
 * rAF). The socket stays on the main thread; turns cross as transferable ArrayBuffers.
 */
import { NetCore, type CoreIn, type CoreOut } from './net-core';
import { TURN_MS } from './lockstep';

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
}
const scope = self as unknown as WorkerScope;
const core = new NetCore((m: CoreOut, transfer?: Transferable[]) => scope.postMessage(m, transfer ?? []));

let base = 0;
let n = 0;
function pace(): void {
  try {
    core.pace(performance.now());
  } catch (err) {
    scope.postMessage({ t: 'error', message: err instanceof Error ? err.message : String(err) });
    return;
  }
  n++;
  // drift-corrected 15 Hz
  setTimeout(pace, Math.max(0, base + n * TURN_MS - performance.now()));
}

scope.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as CoreIn;
  try {
    core.handle(msg);
    if (msg.t === 'start' && base === 0) {
      base = performance.now();
      setTimeout(pace, TURN_MS);
    }
  } catch (err) {
    scope.postMessage({ t: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
