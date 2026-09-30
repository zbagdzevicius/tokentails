import { Types } from 'mongoose';
import { CODEX_RESET_JOB_NAME, claimCodexResetPeriod } from './codex-reset';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const skip = require('../../scripts/skip-codex-cycle.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const catOwners = require('../../scripts/audit-cat-owners.js');

/** In-memory stand-in for the jobruns collection, with MongoDB's upsert and duplicate-key rules. */
function memoryJobRuns(doc: Record<string, any> | null) {
    let stored = doc ? { ...doc } : null;
    const matches = (filter: Record<string, any>) =>
        !!stored &&
        Object.entries(filter).every(([key, value]) =>
            value && typeof value === 'object' && '$ne' in value ? stored![key] !== value.$ne : stored![key] === value
        );
    return {
        get: () => stored,
        async updateOne(filter: Record<string, any>, update: Record<string, any>, options: Record<string, any> = {}) {
            if (matches(filter)) {
                stored = { ...stored, ...update.$set };
                return { matchedCount: 1, modifiedCount: 1 };
            }
            if (!options.upsert) {
                return { matchedCount: 0, modifiedCount: 0 };
            }
            if (stored && stored._id === filter._id) {
                throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
            }
            stored = { _id: filter._id, ...update.$set };
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        },
    };
}

describe('scripts/skip-codex-cycle.js', () => {
    it('uses the job name of the codex reset', () => {
        expect(skip.JOB_NAME).toBe(CODEX_RESET_JOB_NAME);
    });

    it('requires --period YYYY-MM and is a dry run unless --apply', () => {
        expect(() => skip.parseArgs([])).toThrow();
        expect(skip.parseArgs(['--period', '2026-10'])).toEqual({ apply: false, period: '2026-10' });
        expect(skip.parseArgs(['--period', '2026-10', '--apply']).apply).toBe(true);
    });

    it('makes the new job skip the period on a fresh jobruns collection', async () => {
        const jobRuns = memoryJobRuns(null);
        const plan = skip.planSkip(null, '2026-10');
        await jobRuns.updateOne(plan.filter, plan.update, plan.options);

        await expect(claimCodexResetPeriod(jobRuns, '2026-10', new Date())).resolves.toBe(false);
        // The next cycle still runs.
        await expect(claimCodexResetPeriod(jobRuns, '2026-11', new Date())).resolves.toBe(true);
    });

    it('does nothing when the period is already taken or a run is in progress', () => {
        expect(skip.planSkip({ _id: 'codex-reset', period: '2026-10', status: 'done' }, '2026-10').skip).toBeTruthy();
        expect(
            skip.planSkip({ _id: 'codex-reset', period: '2026-09', status: 'running' }, '2026-10').skip
        ).toBeTruthy();
        expect(
            skip.planSkip({ _id: 'codex-reset', period: '2026-09', status: 'done' }, '2026-10').skip
        ).toBeUndefined();
    });
});

describe('scripts/audit-cat-owners.js', () => {
    it('is read-only: no write stages in its pipeline', () => {
        const stages = catOwners.ownerMismatchPipeline().map((stage: object) => Object.keys(stage)[0]);
        expect(stages).not.toContain('$merge');
        expect(stages).not.toContain('$out');
    });

    it('summarizes cats without an owner and cats owned by someone else', () => {
        const user = new Types.ObjectId();
        expect(
            catOwners.summarize([
                { user, cat: new Types.ObjectId(), ownerMissing: true },
                { user, cat: new Types.ObjectId(), ownerMissing: false },
            ])
        ).toEqual({ mismatchedCats: 2, usersAffected: 1, ownerMissing: 1, ownedByAnotherUser: 1 });
    });
});
