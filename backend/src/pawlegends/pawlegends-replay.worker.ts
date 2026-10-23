/*
 * worker_threads entry of the Pawlegends replay check (POC.md §11.5). Runs the vendored sim's `verifyReplay` off the
 * main thread: a full match re-sim takes up to 1.5 s, far above the 50 ms p95 that `src/user/heist/replay-queue.ts`
 * allows on the event loop. One message in, one out: `{ id, record }` → `{ id, result, threadId }` or
 * `{ id, error, threadId }`. Relative imports only: it is loaded by path, without the `src/` alias.
 *
 * Sim v10 (GAPS B0 dual verifier): the record is re-simmed by the vendored sim of its own `simVersion` (v9 frozen,
 * v10 live); any other version is refused with PAWLEGENDS_SIM_VERSION and nothing is simulated.
 */
import { parentPort, threadId } from 'worker_threads';
import { SIM_VERSIONS, simFor, type PawlegendsVerifyResult } from '../vendor/pawlegends-sim';

export function verifyBySimVersion(record: unknown): PawlegendsVerifyResult {
    const version = (record as { simVersion?: unknown } | null)?.simVersion;
    const sim = simFor(version);
    if (!sim) {
        return {
            ok: false,
            code: 'PAWLEGENDS_SIM_VERSION',
            message: `simVersion ${String(version)} is not one of ${SIM_VERSIONS.join(', ')}`,
        };
    }
    return sim.verifyReplay(record);
}

parentPort?.on('message', (message: { id: number; record: unknown }) => {
    try {
        parentPort!.postMessage({ id: message.id, result: verifyBySimVersion(message.record), threadId });
    } catch (error) {
        parentPort!.postMessage({ id: message.id, error: String((error as Error)?.message || error), threadId });
    }
});
