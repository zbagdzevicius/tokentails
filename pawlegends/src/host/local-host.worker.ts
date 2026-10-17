/**
 * LocalHost Worker (POC.md §3, §11.2): runs the sim at 30 Hz off the main thread, filters snapshots for the human's
 * team and records the replay. Speaks the Phase 2 protocol (src/host/protocol.ts) over postMessage; `snap` buffers
 * are transferred, not copied.
 */
import { isClientMsg, type HostMsg } from './protocol';
import { TickLoop } from './tick-loop';

/** The bits of DedicatedWorkerGlobalScope we use (the project compiles against the DOM lib). */
interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
}
const scope = self as unknown as WorkerScope;

const loop = new TickLoop({
  now: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  post: (msg: HostMsg) => {
    if (msg.t === 'snap') scope.postMessage(msg, [msg.buf]);
    else scope.postMessage(msg);
  },
});

scope.addEventListener('message', (e: MessageEvent) => {
  if (!isClientMsg(e.data)) return;
  try {
    loop.handle(e.data);
  } catch (err) {
    // Surface to the main thread's crash overlay instead of dying silently.
    scope.postMessage({ t: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
