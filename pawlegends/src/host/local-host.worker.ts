/**
 * LocalHost Worker (POC.md §3, §11.2): runs the sim at 30 Hz off the main thread, filters snapshots for the human's
 * team and records the replay. Speaks the Phase 2 protocol (src/host/protocol.ts) over postMessage; `snap` buffers
 * are transferred, not copied.
 *
 * The same Worker file is the party client's net host when started with the name `NET_WORKER_NAME`
 * (net/net-worker.ts): one worker copy of the sim in the build instead of two.
 */
import { isClientMsg, type HostMsg } from './protocol';
import { TickLoop } from './tick-loop';
import { isReplayClientMsg, ReplayLoop } from '../replay/loop';
import { NET_WORKER_NAME, runNetWorker } from '../net/net-worker';

/** The bits of DedicatedWorkerGlobalScope we use (the project compiles against the DOM lib). */
interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
}
const scope = self as unknown as WorkerScope;

const workerName = (self as unknown as { name?: string }).name;
if (workerName === NET_WORKER_NAME) runNetWorker(scope);
else runLocalHost();

function runLocalHost(): void {
  const loop = new TickLoop({
    now: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    post: (msg: HostMsg) => {
      if (msg.t === 'snap') scope.postMessage(msg, [msg.buf]);
      else scope.postMessage(msg);
    },
  });

  // MATCH-MOMENTS.md §2: the replay viewer runs in this same Worker (one sim copy in the build); `r:` messages only
  let replay: ReplayLoop | null = null;

  scope.addEventListener('message', (e: MessageEvent) => {
    if (isReplayClientMsg(e.data)) {
      try {
        replay ??= new ReplayLoop({
          now: () => performance.now(),
          setTimer: (fn, ms) => setTimeout(fn, ms),
          clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
          post: (msg) => {
            if (msg.t === 'snap') scope.postMessage(msg, [msg.buf]);
            else scope.postMessage(msg);
          },
        });
        replay.handle(e.data);
      } catch (err) {
        scope.postMessage({ t: 'error', message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
    if (!isClientMsg(e.data)) return;
    try {
      loop.handle(e.data);
    } catch (err) {
      // Surface to the main thread's crash overlay instead of dying silently.
      scope.postMessage({ t: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  });
}
