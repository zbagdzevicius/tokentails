import { acquireLease, ILeaseCollection } from '../../shared/jobs/lease';
import { displayNames } from './display-name';
import { assignAutoNick } from './nick-assign';

/*
 * Migration `pl-nick-backfill-v1` (founder, Nov 20: the nickname is the unique username; the PL- code is no longer
 * shown). Every social row without a nickname gets one (nick-assign.ts), oldest row first, so when two players showed
 * the same name the older account keeps it and the later one gets a number and a one-time notice in game.
 * Then every registered account that has Paw Legends progress but never opened a social screen gets its social row
 * (and so its nickname), so boards and history show unique names for them too.
 *
 * Runs on boot on every API instance and is safe with any number of them:
 *   - one lease in `jobruns` (`_id` = the migration name) lets one instance work at a time; the lease is renewed after
 *     each batch and expires if that instance dies, so another one resumes;
 *   - each assignment is a compare-and-set on "no nickname yet" (idempotent), and the unique `nickKey` index decides
 *     between two writers;
 *   - `doneAt` marks it finished; later boots read it and stop. A new version is a new `_id`.
 */

export const NICK_BACKFILL_JOB = 'pl-nick-backfill-v1';
const LEASE_MS = 5 * 60_000;
const BATCH = 200;

type AnyModel = any;

export interface NickBackfillDeps {
    social: AnyModel;
    cats?: AnyModel | null;
    progress?: AnyModel | null;
    jobRuns: ILeaseCollection & { findOne(filter: Record<string, unknown>): Promise<any> };
    registered(ids: readonly string[]): Promise<Set<string>>;
    /** Creates the social row of a registered account (SocialService.profile: it assigns the nickname). */
    ensureProfile(id: string): Promise<unknown>;
    now?: () => Date;
    log?: (msg: string) => void;
}

export type NickBackfillOutcome =
    | { state: 'done'; assigned: number; noticed: number; created: number }
    | { state: 'already-done' }
    | { state: 'lease-held' };

export async function runNickBackfill(deps: NickBackfillDeps): Promise<NickBackfillOutcome> {
    const now = () => deps.now?.() ?? new Date();
    const marker = await deps.jobRuns.findOne({ _id: NICK_BACKFILL_JOB });
    if (marker?.doneAt) return { state: 'already-done' };
    if (!(await acquireLease(deps.jobRuns, NICK_BACKFILL_JOB, LEASE_MS, now()))) return { state: 'lease-held' };
    const renew = () =>
        deps.jobRuns.updateOne(
            { _id: NICK_BACKFILL_JOB },
            { $set: { lockedUntil: new Date(now().getTime() + LEASE_MS) } }
        );

    let assigned = 0;
    let noticed = 0;
    let created = 0;

    // 1. rows without a nickname, oldest first (ties by id, so every instance walks the same order)
    const rows = (await deps.social
        .find({ nickKey: { $exists: false } })
        .select({ _id: 1, createdAt: 1 })
        .sort({ createdAt: 1, _id: 1 })
        .lean()) as Array<{ _id: string }>;
    for (let i = 0; i < rows.length; i += BATCH) {
        const ids = rows.slice(i, i + BATCH).map(r => String(r._id));
        const [reg, names] = await Promise.all([
            deps.registered(ids),
            displayNames({ social: deps.social, cats: deps.cats ?? null }, ids),
        ]);
        for (const id of ids) {
            if (!reg.has(id)) continue;
            const r = await assignAutoNick(deps.social, id, names.get(id) ?? '', { notice: true });
            if (r) {
                assigned++;
                if (r.notice) noticed++;
            }
        }
        await renew();
    }

    // 2. registered players with progress and no social row yet
    if (deps.progress) {
        const ids = ((await deps.progress.find({}).select({ _id: 1 }).lean()) as Array<{ _id: unknown }>).map(r =>
            String(r._id)
        );
        for (let i = 0; i < ids.length; i += BATCH) {
            const chunk = ids.slice(i, i + BATCH);
            const have = new Set(
                (
                    (await deps.social
                        .find({ _id: { $in: chunk } })
                        .select({ _id: 1 })
                        .lean()) as Array<{ _id: unknown }>
                ).map(r => String(r._id))
            );
            const missing = chunk.filter(id => !have.has(id));
            const reg = missing.length ? await deps.registered(missing) : new Set<string>();
            for (const id of missing) {
                if (!reg.has(id)) continue;
                await deps.ensureProfile(id);
                created++;
            }
            await renew();
        }
    }

    await deps.jobRuns.updateOne(
        { _id: NICK_BACKFILL_JOB },
        { $set: { status: 'done', doneAt: now(), assigned, noticed, created, lockedUntil: now() } }
    );
    deps.log?.(`${NICK_BACKFILL_JOB}: done, ${assigned} assigned (${noticed} told), ${created} rows created`);
    return { state: 'done', assigned, noticed, created };
}
