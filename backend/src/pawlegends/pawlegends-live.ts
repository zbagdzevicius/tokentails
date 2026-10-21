import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { GamePlatform, GameType } from 'src/game/game.schema';
import { PAWLEGENDS_LEVEL_CAPS, PAWLEGENDS_LEVELS, PAWLEGENDS_TICK_HZ } from 'src/shared-contracts/caps';
import { ErrorCode } from 'src/shared-contracts/errors';
import { FailedReplayCache, FAILED_HEIST_REPLAYS } from 'src/user/heist/failed-replay-cache';
import { ReplayQueue } from 'src/user/heist/replay-queue';
import { ILiveGameRow, recomputeCatnipCount } from 'src/user/utils/live-game';
import { PawlegendsReplayRecord, PawlegendsVerifyResult, SIM_VERSIONS } from 'src/vendor/pawlegends-sim';
import { Worker } from 'worker_threads';
import { PawlegendsReplayDto } from './pawlegends-replay.dto';
import { pawlegendsSimErrorDetail } from './pawlegends-sim-info';

export { PAWLEGENDS_SIM_INFO, pawlegendsSimErrorDetail } from './pawlegends-sim-info';

/**
 * The replay-verified PAWLEGENDS branch of `POST /user/catbassadors/live` (POC.md §11.5). There is no other
 * Pawlegends score route: this is still the one score writer.
 *
 * 1. The DTO checked the record's shape and work bounds. A `simVersion` outside SIM_VERSIONS (sim v10, GAPS B0: the
 *    live v10 and the frozen v9, each re-simmed by its own vendored sim) is a 400 PAWLEGENDS_SIM_VERSION naming the
 *    backend's sim, before anything is queued, so the game keeps the replay queued until the backend runs its sim.
 * 2. The digest of the canonical record is looked up first: a record that already failed is the same 400 again, and
 *    one that already saved (from any account) is 409 PAWLEGENDS_DUPLICATE, both without a re-sim.
 * 3. The vendored sim re-simulates it in a `worker_threads` worker (a match takes up to 1.5 s) through its own
 *    bounded queue: concurrency 1, 8 waiting, 429 with Retry-After when full, before any work starts. Outcome and
 *    final hash must match; a mismatch is 400 and nothing is written.
 * 4. The `Game` row takes the server's outcome and time and carries the globally unique `replayDigest`. The user
 *    gets `$min pawlegendsFastestWin.<difficulty>` (wins only), `$max pawlegendsCatnip.<difficulty>` to the
 *    difficulty's PAWLEGENDS_LEVEL_CAPS entry (the first win pays it once; later wins add nothing),
 *    `$inc pawlegendsMatches.<difficulty>` and `lastPlayedAt`. A match with a mutator other than 'none' (none exist
 *    in v10; GAPS §8 item 1) counts as a match only: no fastest win and no catnip. Sim v10 (GAPS B2): a forfeited
 *    match is a loss (outcome 'lost' in the re-sim): no catnip, no fastest win, the row's outcome is 'quit'.
 */

/** Pawlegends replays: one at a time in the worker, up to 8 waiting (about 12 s of worst-case matches). */
export const PAWLEGENDS_REPLAY_QUEUE = { concurrency: 1, maxQueued: 8 };
/** A re-sim that takes longer than this kills its worker (a fresh one starts for the next replay). */
export const PAWLEGENDS_REPLAY_TIMEOUT_MS = 10_000;

export const PAWLEGENDS_CATNIP_FIELD = 'pawlegendsCatnip';
export const PAWLEGENDS_FASTEST_FIELD = 'pawlegendsFastestWin';
export const PAWLEGENDS_MATCHES_FIELD = 'pawlegendsMatches';
const PAWLEGENDS_FIELDS = [PAWLEGENDS_CATNIP_FIELD, PAWLEGENDS_FASTEST_FIELD, PAWLEGENDS_MATCHES_FIELD];

export const pawlegendsError = (code: string, message: string) =>
    new BadRequestException({
        statusCode: 400,
        message,
        error: 'Bad Request',
        code,
        ...(code === ErrorCode.PAWLEGENDS_SIM_VERSION || code === ErrorCode.PAWLEGENDS_REPLAY_INVALID
            ? pawlegendsSimErrorDetail()
            : {}),
    });

export const pawlegendsDuplicate = () =>
    new ConflictException({
        statusCode: 409,
        message: 'This match is already saved',
        error: 'Conflict',
        code: ErrorCode.PAWLEGENDS_DUPLICATE,
    });

const RECORD_KEYS: (keyof PawlegendsReplayRecord)[] = [
    'v',
    'simVersion',
    'seed',
    'difficulty',
    'hero',
    'trick',
    'ticks',
    'inputs',
    'outcome',
    'finalHash',
    'mutator',
];

/** The first sim version whose records carry `mutator` (GAPS B0). */
export const PAWLEGENDS_MUTATOR_SINCE = 10;

/**
 * The record with its fields in a fixed order and nothing else: what the worker gets and the digest covers. From
 * v10 `mutator` is always present (a missing one is 'none', so the same match cannot be saved twice by dropping the
 * field); a v9 record never carries it, so its digest is the one v9 stored.
 */
export const canonicalRecord = (replay: PawlegendsReplayDto | PawlegendsReplayRecord): PawlegendsReplayRecord => {
    const source = replay as any;
    const entries: [string, unknown][] = [];
    for (const key of RECORD_KEYS) {
        if (key !== 'mutator') entries.push([key, source[key]]);
        else if (source.simVersion >= PAWLEGENDS_MUTATOR_SINCE) entries.push([key, source.mutator ?? 'none']);
    }
    return Object.fromEntries(entries) as unknown as PawlegendsReplayRecord;
};

/** GAPS §8 item 1: only a match without a mutator counts toward the fastest win and catnip. */
export const pawlegendsRanked = (record: PawlegendsReplayRecord): boolean => (record.mutator ?? 'none') === 'none';

/** sha256 of the canonical record: what `Game.replayDigest` stores for a PAWLEGENDS row. */
export const pawlegendsDigest = (replay: PawlegendsReplayDto | PawlegendsReplayRecord): string =>
    createHash('sha256')
        .update(`pawlegends:${JSON.stringify(canonicalRecord(replay))}`)
        .digest('hex');

// ---------------------------------------------------------------------------------------------------------------
// The worker

export interface IWorkerVerdict {
    result: PawlegendsVerifyResult;
    /** The worker's thread id (never 0, the main thread's). */
    threadId: number;
}

interface IPending {
    resolve: (verdict: IWorkerVerdict) => void;
    reject: (error: unknown) => void;
    timer: NodeJS.Timeout;
    worker: Worker;
}

/**
 * One long-lived worker thread that runs `verifyReplay`. Built JavaScript (`dist/`) loads the compiled worker file;
 * from TypeScript sources (jest, ts-node) the worker registers ts-node first. A crash or a timeout rejects the
 * replays in flight with 503 and the next replay starts a fresh worker.
 */
export class PawlegendsReplayWorker {
    private worker?: Worker;
    private seq = 0;
    private readonly pending = new Map<number, IPending>();

    constructor(private readonly timeoutMs = PAWLEGENDS_REPLAY_TIMEOUT_MS) {}

    private spawn(): Worker {
        const js = join(__dirname, 'pawlegends-replay.worker.js');
        const worker = existsSync(js)
            ? new Worker(js)
            : new Worker(
                  `require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });` +
                      `require(${JSON.stringify(join(__dirname, 'pawlegends-replay.worker.ts'))});`,
                  { eval: true }
              );
        // Never keeps the process alive (shutdown, jest).
        worker.unref();
        worker.on(
            'message',
            (message: { id: number; result?: PawlegendsVerifyResult; error?: string; threadId: number }) => {
                const entry = this.pending.get(message.id);
                if (!entry) return;
                this.pending.delete(message.id);
                clearTimeout(entry.timer);
                if (message.result) entry.resolve({ result: message.result, threadId: message.threadId });
                else entry.reject(new ServiceUnavailableException(`Replay check failed: ${message.error}`));
            }
        );
        const fail = (error: unknown) => {
            if (this.worker === worker) this.worker = undefined;
            for (const [id, entry] of this.pending) {
                // A timed-out worker exits after a fresh one took new replays: reject only its own.
                if (entry.worker !== worker) continue;
                clearTimeout(entry.timer);
                this.pending.delete(id);
                entry.reject(
                    new ServiceUnavailableException(
                        `Replay worker stopped: ${String((error as Error)?.message || error)}`
                    )
                );
            }
        };
        worker.on('error', fail);
        worker.on('exit', code => fail(`exit ${code}`));
        return worker;
    }

    verify(record: PawlegendsReplayRecord): Promise<IWorkerVerdict> {
        if (!this.worker) this.worker = this.spawn();
        const worker = this.worker;
        const id = ++this.seq;
        return new Promise<IWorkerVerdict>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new ServiceUnavailableException('Replay check timed out'));
                if (this.worker === worker) this.worker = undefined;
                void worker.terminate();
            }, this.timeoutMs);
            timer.unref?.();
            this.pending.set(id, { resolve, reject, timer, worker });
            worker.postMessage({ id, record });
        });
    }

    /** Stops the worker (specs, shutdown). */
    async close(): Promise<void> {
        const worker = this.worker;
        this.worker = undefined;
        if (worker) await worker.terminate();
    }
}

/** The process-wide worker, queue and failure cache `/live` uses. */
export const pawlegendsReplayWorker = new PawlegendsReplayWorker();
export const pawlegendsReplayQueue = new ReplayQueue({
    ...PAWLEGENDS_REPLAY_QUEUE,
    fullMessage: 'Too many Pawlegends replays right now, retry shortly',
});
export const failedPawlegendsReplays = new FailedReplayCache(FAILED_HEIST_REPLAYS);

const workerVerify = async (record: PawlegendsReplayRecord) => (await pawlegendsReplayWorker.verify(record)).result;

// ---------------------------------------------------------------------------------------------------------------
// The save

export interface IPawlegendsLiveDeps {
    users: {
        findOne(params: { searchObject: Record<string, unknown>; projection?: string }): Promise<any>;
        update(id: string, update: Record<string, unknown>): Promise<unknown>;
        /** UserRepository.claimBelowCap: the atomic first-win catnip claim. */
        claimBelowCap(id: string, path: string, cap: number): Promise<number | null>;
    };
    games: {
        findOne(params: { searchObject: Record<string, unknown>; projection?: string }): Promise<any>;
        create(row: Record<string, unknown>): Promise<any>;
    };
    queue?: ReplayQueue;
    failures?: FailedReplayCache;
    /** Runs the re-sim (default: the worker thread). */
    verify?: (record: PawlegendsReplayRecord) => Promise<PawlegendsVerifyResult>;
    now?: () => Date;
}

export interface IPawlegendsLiveResult {
    difficulty: string;
    outcome: 'won' | 'lost';
    ticks: number;
    finalHash: string;
    /** Catnip this save paid: the difficulty's cap on its first win, else 0. */
    catnipPaid: number;
    /** The account's catnip total after this save (Catnip Chaos + Paw Match + Pawlegends first wins). */
    catnipCount: number;
    /** Fastest win held for the difficulty after this save, in ticks (null without a win). */
    fastestWin: number | null;
    /** Sim v10 (GAPS B2): how the re-simmed match ended ('forfeit': the player forfeited); absent for v9 replays. */
    reason?: 'core' | 'safetyEnd' | 'forfeit';
}

const isDuplicateKey = (error: unknown) => (error as { code?: unknown } | undefined)?.code === 11000;
const isPlainObject = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export async function savePawlegendsMatch(
    deps: IPawlegendsLiveDeps,
    userId: string,
    body: { pawlegends?: PawlegendsReplayDto; replay?: unknown; badcat?: unknown; platform?: GamePlatform }
): Promise<IPawlegendsLiveResult> {
    const replay = body.pawlegends;
    if (!replay) throw pawlegendsError(ErrorCode.PAWLEGENDS_REPLAY_INVALID, 'pawlegends is required for PAWLEGENDS');
    if (body.replay !== undefined || body.badcat !== undefined) {
        throw pawlegendsError(ErrorCode.PAWLEGENDS_REPLAY_INVALID, 'replay and badcat are for other games');
    }
    if (!SIM_VERSIONS.includes(replay.simVersion)) {
        throw pawlegendsError(
            ErrorCode.PAWLEGENDS_SIM_VERSION,
            `simVersion ${replay.simVersion} is not one of this backend's ${SIM_VERSIONS.join(', ')}`
        );
    }
    const index = PAWLEGENDS_LEVELS.indexOf(replay.difficulty);
    if (index < 0) throw pawlegendsError(ErrorCode.PAWLEGENDS_REPLAY_INVALID, 'unknown difficulty');

    const record = canonicalRecord(replay);
    const digest = pawlegendsDigest(record);
    const failures = deps.failures || failedPawlegendsReplays;
    const failed = failures.get(digest);
    // The sim is deterministic: the same record fails the same way. No re-sim, no queue slot.
    if (failed) throw pawlegendsError(failed.code, failed.reason);
    const saved = await deps.games.findOne({ searchObject: { replayDigest: digest }, projection: '_id user' });
    if (saved) throw pawlegendsDuplicate();

    // Throws the 429 synchronously when the queue is full: nothing has been simulated.
    const verify = deps.verify || workerVerify;
    const result = await (deps.queue || pawlegendsReplayQueue).runAsync(() => verify(record));
    if (!result.ok) {
        failures.set(digest, { code: result.code, reason: result.message });
        throw pawlegendsError(result.code, result.message);
    }
    if (result.outcome !== replay.outcome || result.finalHash !== replay.finalHash || result.ticks !== replay.ticks) {
        // verifyReplay already compares them; this guards a sim that would not.
        failures.set(digest, { code: ErrorCode.PAWLEGENDS_OUTCOME_MISMATCH, reason: 'result differs from the record' });
        throw pawlegendsError(ErrorCode.PAWLEGENDS_OUTCOME_MISMATCH, 'result differs from the record');
    }

    const user = await deps.users.findOne({
        searchObject: { _id: userId },
        projection: ['cat', ...PAWLEGENDS_FIELDS].join(' '),
    });
    if (!user) throw new BadRequestException('User not found');

    const difficulty = PAWLEGENDS_LEVELS[index];
    const won = result.outcome === 'won';
    // A mutator match (none exist in v10) is a match, not a record: no fastest win, no catnip (GAPS §8 item 1).
    const ranked = pawlegendsRanked(record);
    const cap = PAWLEGENDS_LEVEL_CAPS[index] ?? 0;
    const heldFastest = num(user[PAWLEGENDS_FASTEST_FIELD]?.[difficulty]);

    // A dotted write into a field that is not a sub-document would fail: make them documents first.
    const broken = PAWLEGENDS_FIELDS.filter(field => user[field] !== undefined && !isPlainObject(user[field]));
    if (broken.length) {
        await deps.users.update(userId, { $set: Object.fromEntries(broken.map(field => [field, {}])) });
    }

    // The first win per difficulty pays catnip once: an atomic claim (below the cap → the cap), so two different
    // winning replays saved at the same time cannot both pay.
    const catnipPath = `${PAWLEGENDS_CATNIP_FIELD}.${difficulty}`;
    const heldCatnip = num(user[PAWLEGENDS_CATNIP_FIELD]?.[difficulty]) ?? 0;
    let claimedFrom: number | null = null;
    if (won && ranked && heldCatnip < cap) claimedFrom = await deps.users.claimBelowCap(userId, catnipPath, cap);
    const catnipPaid = claimedFrom === null ? 0 : cap - claimedFrom;

    const row: ILiveGameRow = {
        type: GameType.PAWLEGENDS,
        level: difficulty,
        points: catnipPaid,
        score: result.ticks,
        time: Math.round((result.ticks / PAWLEGENDS_TICK_HZ) * 100) / 100,
        platform: body.platform ?? GamePlatform.WEB,
        // LIVE_GAME_OUTCOMES has no 'lost'; a lost match is stored as 'died' (as Bad Cat stores a caught run). Sim v10
        // (GAPS B2): a forfeit (the re-sim's own reason, never the client's word) is stored as 'quit', the forfeit-rate
        // measure; it is a loss like any other and pays nothing.
        outcome: won ? 'won' : result.reason === 'forfeit' ? 'quit' : 'died',
        replayDigest: digest,
    };
    try {
        await deps.games.create({ ...row, cat: user.cat, user: user._id });
    } catch (error) {
        // The same replay raced in: it was not saved by this request, so neither is its catnip.
        if (claimedFrom !== null) await deps.users.update(userId, { $set: { [catnipPath]: claimedFrom } });
        if (isDuplicateKey(error)) throw pawlegendsDuplicate();
        throw error;
    }

    await deps.users.update(userId, {
        ...(won && ranked ? { $min: { [`${PAWLEGENDS_FASTEST_FIELD}.${difficulty}`]: result.ticks } } : {}),
        $inc: { [`${PAWLEGENDS_MATCHES_FIELD}.${difficulty}`]: 1 },
        $set: { lastPlayedAt: (deps.now || (() => new Date()))() },
    });
    // The catnip reaches the account's Token Tails total (catnipCount), as Catnip Chaos and Paw Match do.
    const catnipCount = await recomputeCatnipCount(deps.users, userId);

    return {
        difficulty,
        outcome: result.outcome,
        ticks: result.ticks,
        finalHash: result.finalHash,
        catnipPaid,
        catnipCount,
        fastestWin: won && ranked ? Math.min(result.ticks, heldFastest ?? result.ticks) : heldFastest,
        ...(result.reason ? { reason: result.reason } : {}),
    };
}
