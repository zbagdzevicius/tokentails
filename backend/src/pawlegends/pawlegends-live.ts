import { BadRequestException, ConflictException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { GamePlatform, GameType } from 'src/game/game.schema';
import { PAWLEGENDS_LEVEL_CAPS, PAWLEGENDS_LEVELS, PAWLEGENDS_TICK_HZ } from 'src/shared-contracts/caps';
import { ErrorCode } from 'src/shared-contracts/errors';
import { FailedReplayCache, FAILED_HEIST_REPLAYS } from 'src/user/heist/failed-replay-cache';
import { ReplayQueue, ReplayQueueFullException } from 'src/user/heist/replay-queue';
import { ILiveGameRow, recomputeCatnipCount } from 'src/user/utils/live-game';
import { PawlegendsReplayRecord, PawlegendsVerifyResult, SIM_VERSIONS } from 'src/vendor/pawlegends-sim';
import { Worker } from 'worker_threads';
import { PAWLEGENDS_V27_MUTATORS, PawlegendsReplayDto } from './pawlegends-replay.dto';
import { pawlegendsSimErrorDetail } from './pawlegends-sim-info';
import type { SeasonXpGain, SeasonXpMatch } from './pawlegends-season.service';
import { applyInviteProgress, type InviteProgressDep } from './growth/apply-invite-progress';
import { applyCommunityGoal } from './liveops/liveops-live';

export { PAWLEGENDS_SIM_INFO, pawlegendsSimErrorDetail } from './pawlegends-sim-info';

/**
 * The replay-verified PAWLEGENDS branch of `POST /user/catbassadors/live` (POC.md §11.5). There is no other
 * Pawlegends score route: this is still the one score writer.
 *
 * 1. The DTO checked the record's shape and work bounds. A `simVersion` outside SIM_VERSIONS (sim v10, GAPS B0: the
 *    live v15 and the frozen v10 to v14, each re-simmed by its own vendored sim) is a 400 PAWLEGENDS_SIM_VERSION naming the
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
 *
 * Every save that does not write (a rejected replay, a duplicate, a full queue, a stopped worker) logs one line through
 * `Logger` ('PawlegendsLive'): the kind, the error code, simVersion and difficulty, never a user id or the record. A
 * run of `rejected ... PAWLEGENDS_OUTCOME_MISMATCH` or `PAWLEGENDS_SIM_VERSION` lines means the game and backend sims
 * drifted apart (LAUNCH.md a.8 step 4).
 */

/** Pawlegends replays: one at a time in the worker, up to 8 waiting (about 12 s of worst-case matches). */
export const PAWLEGENDS_REPLAY_QUEUE = { concurrency: 1, maxQueued: 8 };
/** A re-sim that takes longer than this kills its worker (a fresh one starts for the next replay). */
export const PAWLEGENDS_REPLAY_TIMEOUT_MS = 10_000;
/**
 * A fresh worker loads every vendored sim (16 bundles from sim v25) before it can answer; a replay's own timeout starts
 * once it reports ready, and a worker that is not ready within this long is given up (503, a fresh one next time).
 * From TypeScript sources (jest, ts-node) the load alone takes about 10 s.
 */
export const PAWLEGENDS_REPLAY_START_MS = 60_000;

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
/** Sim v22 (WR-BS-PLAN.md §4): the first sim version that plays a mutator other than 'none' (Blitz). */
export const PAWLEGENDS_MUTATOR_PLAY_SINCE = 22;
/** Sim v27: the first sim version that plays Cannon Chaos and the weekly twists (PAWLEGENDS_V27_MUTATORS). */
export const PAWLEGENDS_V27_MUTATOR_SINCE = 27;

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

/** Per worker: has it loaded its sims (its `ready` message), and the replays waiting for that to start their timeout. */
interface IWorkerStart {
    ready: boolean;
    waiting: (() => void)[];
}

/**
 * One long-lived worker thread that runs `verifyReplay`. Built JavaScript (`dist/`) loads the compiled worker file;
 * from TypeScript sources (jest, ts-node) the worker registers ts-node first. A crash or a timeout rejects the
 * replays in flight with 503 and the next replay starts a fresh worker. A replay's timeout runs from when the worker
 * reported its sims loaded (`ready`), so a cold start does not eat it; the start itself is capped by `startMs`.
 */
export class PawlegendsReplayWorker {
    private worker?: Worker;
    private seq = 0;
    private readonly pending = new Map<number, IPending>();
    private readonly starts = new WeakMap<Worker, IWorkerStart>();

    constructor(
        private readonly timeoutMs = PAWLEGENDS_REPLAY_TIMEOUT_MS,
        private readonly startMs = PAWLEGENDS_REPLAY_START_MS
    ) {}

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
        const start: IWorkerStart = { ready: false, waiting: [] };
        this.starts.set(worker, start);
        worker.on(
            'message',
            (message: {
                id: number;
                ready?: boolean;
                result?: PawlegendsVerifyResult;
                error?: string;
                threadId: number;
            }) => {
                if (message.ready) {
                    start.ready = true;
                    for (const arm of start.waiting.splice(0)) arm();
                    return;
                }
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
        const start = this.starts.get(worker);
        return new Promise<IWorkerVerdict>((resolve, reject) => {
            const giveUp = (why: string) => () => {
                if (!this.pending.has(id)) return;
                this.pending.delete(id);
                reject(new ServiceUnavailableException(why));
                if (this.worker === worker) this.worker = undefined;
                void worker.terminate();
            };
            const ready = !start || start.ready;
            const timer = setTimeout(
                giveUp(ready ? 'Replay check timed out' : 'Replay worker did not start'),
                ready ? this.timeoutMs : this.startMs
            );
            timer.unref?.();
            const entry: IPending = { resolve, reject, timer, worker };
            this.pending.set(id, entry);
            if (!ready) {
                // The worker loads its sims first: this replay's own timeout starts once it is ready.
                start!.waiting.push(() => {
                    if (this.pending.get(id) !== entry) return;
                    clearTimeout(entry.timer);
                    entry.timer = setTimeout(giveUp('Replay check timed out'), this.timeoutMs);
                    entry.timer.unref?.();
                });
            }
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
    /** Where saves that do not write are logged (default: Nest's Logger, context 'PawlegendsLive'). */
    logger?: Pick<Logger, 'warn' | 'log'>;
    /**
     * Legends Pass Season XP (STORE-PASS.md §5, PawlegendsSeasonService.addXp): called once, after the Game row was
     * created, so a duplicate save never pays. Cosmetic progress only; never fails the save.
     */
    season?: { addXp(userId: string, m: SeasonXpMatch): Promise<SeasonXpGain | null> };
    /** Growth (growth/apply-invite-progress.ts): an accepted invite counts this verified match. Never fails the save. */
    growth?: InviteProgressDep;
    /**
     * Account progress (gap plan P2, progress/progress.service.ts `applyLive`): champion mastery, the Welcome Path day
     * and the Lucky Treat, after the Game row exists. Cosmetic only; never fails the save.
     */
    rewards?: { applyLive(userId: string, m: { won: boolean; hero?: string | null }): Promise<unknown> };
}

/** Kills plus assists of one slot in a stats list (the re-sim's or a party verdict's), 0 when absent. */
export function takedownsOf(stats: unknown, slot: number): number {
    if (!Array.isArray(stats)) return 0;
    const s = stats.find(x => !!x && typeof x === 'object' && (x as { slot?: unknown }).slot === slot) as
        | { kills?: unknown; assists?: unknown }
        | undefined;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    return s ? n(s.kills) + n(s.assists) : 0;
}

/** What `/live` answers about the pass: the XP this match paid and the tier after it. */
export interface IPawlegendsSeasonAnswer {
    seasonId: string;
    xp: number;
    tier: number;
    prevTier: number;
    gained: number;
}

const pawlegendsLiveLogger = new Logger('PawlegendsLive');

/** What a save that does not write was: `duplicate` is routine (a retried save), the others are warnings. */
export type PawlegendsSaveProblem = 'rejected' | 'duplicate' | 'queue-full' | 'unavailable';

/** The one log line of a save that did not write. No user id, no record: only what tells sim drift apart. */
export function pawlegendsSaveLogLine(
    kind: PawlegendsSaveProblem,
    code: string,
    replay: { simVersion?: unknown; difficulty?: unknown } | undefined,
    cached = false
): string {
    const simVersion = Number.isInteger(replay?.simVersion) ? String(replay?.simVersion) : 'unknown';
    const difficulty = PAWLEGENDS_LEVELS.includes(replay?.difficulty as string)
        ? String(replay?.difficulty)
        : 'unknown';
    return `pawlegends save ${kind}: code=${code} simVersion=${simVersion} difficulty=${difficulty}${
        cached ? ' cached' : ''
    }`;
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
    /** Sim v10 (GAPS B2): how the re-simmed match ended ('forfeit': the player forfeited; sim v22 'timeUp': a Blitz match
     *  reached 3:15); absent for v9 replays. */
    reason?: 'core' | 'safetyEnd' | 'forfeit' | 'timeUp';
    /** Legends Pass Season XP this save paid (absent when the pass service is not wired). */
    season?: IPawlegendsSeasonAnswer;
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
    const logger = deps.logger || pawlegendsLiveLogger;
    const reject = (code: string, message: string, cached = false) => {
        logger.warn(pawlegendsSaveLogLine('rejected', code, replay, cached));
        return pawlegendsError(code, message);
    };
    const duplicate = () => {
        logger.log(pawlegendsSaveLogLine('duplicate', ErrorCode.PAWLEGENDS_DUPLICATE, replay));
        return pawlegendsDuplicate();
    };
    if (!replay) throw reject(ErrorCode.PAWLEGENDS_REPLAY_INVALID, 'pawlegends is required for PAWLEGENDS');
    if (body.replay !== undefined || body.badcat !== undefined) {
        throw reject(ErrorCode.PAWLEGENDS_REPLAY_INVALID, 'replay and badcat are for other games');
    }
    if (!SIM_VERSIONS.includes(replay.simVersion)) {
        throw reject(
            ErrorCode.PAWLEGENDS_SIM_VERSION,
            `simVersion ${replay.simVersion} is not one of this backend's ${SIM_VERSIONS.join(', ')}`
        );
    }
    const index = PAWLEGENDS_LEVELS.indexOf(replay.difficulty);
    if (index < 0) throw reject(ErrorCode.PAWLEGENDS_REPLAY_INVALID, 'unknown difficulty');
    // Sim v22: Blitz exists from v22 on; an older sim never played it (its own verifier would refuse it too).
    if ((replay.mutator ?? 'none') !== 'none' && replay.simVersion < PAWLEGENDS_MUTATOR_PLAY_SINCE) {
        throw reject(
            ErrorCode.PAWLEGENDS_REPLAY_INVALID,
            `mutator ${replay.mutator} needs simVersion ${PAWLEGENDS_MUTATOR_PLAY_SINCE} or later`
        );
    }
    if (
        PAWLEGENDS_V27_MUTATORS.includes(replay.mutator ?? 'none') &&
        replay.simVersion < PAWLEGENDS_V27_MUTATOR_SINCE
    ) {
        throw reject(
            ErrorCode.PAWLEGENDS_REPLAY_INVALID,
            `mutator ${replay.mutator} needs simVersion ${PAWLEGENDS_V27_MUTATOR_SINCE} or later`
        );
    }

    const record = canonicalRecord(replay);
    const digest = pawlegendsDigest(record);
    const failures = deps.failures || failedPawlegendsReplays;
    const failed = failures.get(digest);
    // The sim is deterministic: the same record fails the same way. No re-sim, no queue slot.
    if (failed) throw reject(failed.code, failed.reason, true);
    const saved = await deps.games.findOne({ searchObject: { replayDigest: digest }, projection: '_id user' });
    if (saved) throw duplicate();

    // Throws the 429 synchronously when the queue is full: nothing has been simulated.
    const verify = deps.verify || workerVerify;
    let result: PawlegendsVerifyResult;
    try {
        result = await (deps.queue || pawlegendsReplayQueue).runAsync(() => verify(record));
    } catch (error) {
        if (error instanceof ReplayQueueFullException) {
            logger.warn(pawlegendsSaveLogLine('queue-full', 'HTTP_429', replay));
        } else if (error instanceof ServiceUnavailableException) {
            logger.warn(pawlegendsSaveLogLine('unavailable', 'HTTP_503', replay));
        }
        throw error;
    }
    if (!result.ok) {
        failures.set(digest, { code: result.code, reason: result.message });
        throw reject(result.code, result.message);
    }
    if (result.outcome !== replay.outcome || result.finalHash !== replay.finalHash || result.ticks !== replay.ticks) {
        // verifyReplay already compares them; this guards a sim that would not.
        failures.set(digest, { code: ErrorCode.PAWLEGENDS_OUTCOME_MISMATCH, reason: 'result differs from the record' });
        throw reject(ErrorCode.PAWLEGENDS_OUTCOME_MISMATCH, 'result differs from the record');
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
        if (isDuplicateKey(error)) throw duplicate();
        throw error;
    }

    await deps.users.update(userId, {
        ...(won && ranked ? { $min: { [`${PAWLEGENDS_FASTEST_FIELD}.${difficulty}`]: result.ticks } } : {}),
        $inc: { [`${PAWLEGENDS_MATCHES_FIELD}.${difficulty}`]: 1 },
        $set: { lastPlayedAt: (deps.now || (() => new Date()))() },
    });
    // The catnip reaches the account's Token Tails total (catnipCount), as Catnip Chaos and Paw Match do.
    const catnipCount = await recomputeCatnipCount(deps.users, userId);
    // Legends Pass Season XP: after the Game row (unique digest) exists, so this match pays once. The human is slot 0.
    const season = deps.season
        ? await deps.season.addXp(String(userId), {
              won,
              forfeit: result.reason === 'forfeit',
              takedowns: takedownsOf((result as { stats?: unknown }).stats, 0),
              // Sim v22 (Blitz): paid per minute like Skirmish, and a draw pays the loss plus half the win bonus
              ...(ranked ? {} : { ticks: result.ticks }),
              ...((result as { draw?: boolean }).draw ? { draw: true } : {}),
              // Daily cap and real-time gap: a solo seed is the client's, so replays could be made offline.
              soloMs: (result.ticks / PAWLEGENDS_TICK_HZ) * 1000,
              // CHAMPION-STORE.md: Yarn once per save; the hero must have been the player's to pick (§8.5)
              ref: digest,
              hero: replay.hero,
          })
        : null;
    await applyInviteProgress(deps.growth, String(userId), {
        ref: digest,
        ticks: result.ticks,
        forfeit: result.reason === 'forfeit',
    });
    // rewards-cloud: mastery, the Welcome Path day and the Lucky Treat (applyLuckyTreat), once per saved match
    if (deps.rewards) await deps.rewards.applyLive(String(userId), { won, hero: replay.hero });
    // Live ops (LIVEOPS.md): the community goal and the Winter Nap day, once, from the re-sim's own numbers
    await applyCommunityGoal({
        accountId: String(userId),
        won,
        forfeit: result.reason === 'forfeit',
        takedowns: takedownsOf((result as { stats?: unknown }).stats, 0),
        now: (deps.now || (() => new Date()))(),
    });

    return {
        difficulty,
        outcome: result.outcome,
        ticks: result.ticks,
        finalHash: result.finalHash,
        catnipPaid,
        catnipCount,
        fastestWin: won && ranked ? Math.min(result.ticks, heldFastest ?? result.ticks) : heldFastest,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(season ? { season } : {}),
    };
}
