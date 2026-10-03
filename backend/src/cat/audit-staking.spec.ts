import { Types } from 'mongoose';
import { Tier } from './cat.schema';
import { getTailsCraft } from './cat-staking.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const auditStaking = require('../../scripts/audit-staking.js');

/** A db stand-in that records every call, so the spec can prove the script only reads. */
function recordingDb(counts: Record<string, number>, overCrafted: any[] = []) {
    const calls: string[] = [];
    const collection = (name: string) =>
        new Proxy(
            {
                countDocuments: async (filter: Record<string, unknown>) => {
                    calls.push(`${name}.countDocuments`);
                    return counts[`${name}:${JSON.stringify(Object.keys(filter))}`] ?? 0;
                },
                aggregate: () => {
                    calls.push(`${name}.aggregate`);
                    return { toArray: async () => overCrafted };
                },
            } as Record<string, any>,
            {
                get(target, prop: string) {
                    if (!(prop in target)) {
                        calls.push(`${name}.${prop}`);
                        throw new Error(`audit-staking must not call ${name}.${prop}`);
                    }
                    return target[prop];
                },
            }
        );
    return { db: { collection }, calls };
}

describe('scripts/audit-staking.js', () => {
    it('only counts: countDocuments and aggregate, nothing else', async () => {
        const { db, calls } = recordingDb({}, [{ flaggedUsers: 3, excessTails: 9000, maxExcessTails: 5000 }]);

        const summary = await auditStaking.audit(db, new Date('2026-09-30T00:00:00Z'));

        expect(new Set(calls)).toEqual(new Set(['cats.countDocuments', 'users.countDocuments', 'cats.aggregate']));
        expect(summary).toMatchObject({
            usersFlaggedOverHonestMax: 3,
            excessCraftedTails: 9000,
            maxExcessCraftedTailsForOneUser: 5000,
        });
    });

    it('prints counts only: every summary value is a number', async () => {
        const { db } = recordingDb({});
        const summary = await auditStaking.audit(db);
        Object.values(summary).forEach(value => expect(typeof value).toBe('number'));
    });

    it('has no apply mode', () => {
        expect(() => auditStaking.parseArgs(['--apply'])).toThrow('Unknown option --apply');
        expect(auditStaking.parseArgs(['--db', 'x'])).toEqual({ db: 'x' });
    });

    it('the pipeline ends in one anonymous group, so no user id is output', () => {
        const pipeline = auditStaking.overCraftedPipeline();
        expect(pipeline[pipeline.length - 1].$group._id).toBeNull();
        expect(JSON.stringify(pipeline)).not.toMatch(/email|name|wallet/);
    });

    it('never joins per user and never loads whole cat documents', () => {
        const pipeline = auditStaking.overCraftedPipeline();
        const text = JSON.stringify(pipeline);
        // No $lookup: `cats` has no {owner: 1} index, so a join would scan cats once per user.
        expect(text).not.toContain('$lookup');
        // The first projection keeps only what the reward needs (resqueStory etc. are dropped).
        const project = pipeline.find((stage: any) => stage.$project).$project;
        expect(Object.keys(project).sort()).toEqual(['_id', 'owner', 'reward']);
        expect(pipeline.some((stage: any) => stage.$unionWith?.coll === 'users')).toBe(true);
    });

    it('judges claims at the OLD reward, which the flat cat nap replaced (task 4e)', () => {
        // The audit's evidence (`monthTailsCrafted`) was earned under the old tier formula, so the
        // audit keeps it. The service now pays a flat nap; scripts/flag-board-exclusions.js raises
        // each cat's bound to the larger of the two so a mixed month is never over-flagged.
        expect(auditStaking.REWARD_BY_TIER).toEqual({ COMMON: 100, RARE: 500, EPIC: 2000, LEGENDARY: 10000 });
        expect(auditStaking.REWARD_WITHOUT_BLESSING).toBe(10);
        const blessing = new Types.ObjectId();
        for (const tier of Object.values(Tier)) {
            expect(getTailsCraft({ blessing, tier })).toBe(50);
        }
    });
});
