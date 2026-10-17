/*
 * worker_threads entry of the Pawlegends replay check (POC.md §11.5). Runs the vendored sim's `verifyReplay` off the
 * main thread: a full match re-sim takes up to 1.5 s, far above the 50 ms p95 that `src/user/heist/replay-queue.ts`
 * allows on the event loop. One message in, one out: `{ id, record }` → `{ id, result, threadId }` or
 * `{ id, error, threadId }`. Relative imports only: it is loaded by path, without the `src/` alias.
 */
import { parentPort, threadId } from 'worker_threads';
import { verifyReplay } from '../vendor/pawlegends-sim';

parentPort?.on('message', (message: { id: number; record: unknown }) => {
    try {
        parentPort!.postMessage({ id: message.id, result: verifyReplay(message.record), threadId });
    } catch (error) {
        parentPort!.postMessage({ id: message.id, error: String((error as Error)?.message || error), threadId });
    }
});
