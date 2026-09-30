import { Types } from 'mongoose';
import { currentCodexPeriodStart } from './codex-reset';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const repair = require('../../scripts/repair-codex-counters.js');

const alice = new Types.ObjectId();
const bob = new Types.ObjectId();
const carol = new Types.ObjectId();

describe('repair-codex-counters', () => {
    it('uses the same window as the cron', () => {
        for (const now of [
            '2026-09-29T12:00:00Z',
            '2026-10-08T22:59:59Z',
            '2026-10-08T23:00:00Z',
            '2027-01-02T00:00:00Z',
        ]) {
            expect(repair.currentPeriodStart(new Date(now)).toISOString()).toBe(
                currentCodexPeriodStart(new Date(now)).toISOString()
            );
        }
    });

    it('counts IMAGE orders as portraits and every other order as a pack', () => {
        const recomputed = repair.recomputeFromOrders([
            { user: alice, entityType: 'IMAGE' },
            { user: alice, entityType: 'PACK' },
            { user: alice, entityType: 'CAT' },
            { user: bob, entityType: 'IMAGE' },
            { entityType: 'PACK' },
        ]);

        expect(recomputed.get(alice.toString())).toMatchObject({ monthPacks: 2, monthPortraitPurchases: 1 });
        expect(recomputed.get(bob.toString())).toMatchObject({ monthPacks: 0, monthPortraitPurchases: 1 });
        expect(recomputed.size).toBe(2);
    });

    it('only raises counters unless lowering is allowed', () => {
        const recomputed = repair.recomputeFromOrders([
            { user: alice, entityType: 'PACK' },
            { user: alice, entityType: 'PACK' },
            { user: bob, entityType: 'IMAGE' },
        ]);
        const users = [
            { _id: alice, monthPacks: 1, monthPortraitPurchases: 0 },
            { _id: bob, monthPacks: 3, monthPortraitPurchases: 1 },
            { _id: carol, monthPacks: 0, monthPortraitPurchases: 2 },
        ];

        const raiseOnly = repair.buildRepairPlan(users, recomputed);
        expect(raiseOnly).toEqual([expect.objectContaining({ _id: alice, set: { monthPacks: 2 } })]);

        const exact = repair.buildRepairPlan(users, recomputed, { allowLower: true });
        expect(exact.map((entry: any) => [entry._id, entry.set])).toEqual([
            [alice, { monthPacks: 2 }],
            [bob, { monthPacks: 0 }],
            [carol, { monthPortraitPurchases: 0 }],
        ]);
    });

    it('writes raises with $max and lowers with $set', () => {
        expect(
            repair.toUpdate({
                before: { monthPacks: 1, monthPortraitPurchases: 3 },
                set: { monthPacks: 2, monthPortraitPurchases: 0 },
            })
        ).toEqual({ $max: { monthPacks: 2 }, $set: { monthPortraitPurchases: 0 } });
    });

    it('is a dry run unless --apply is passed', () => {
        expect(repair.parseArgs([])).toMatchObject({ apply: false, allowLower: false });
        expect(repair.parseArgs(['--apply', '--allow-lower', '--db', 'tokentails'])).toMatchObject({
            apply: true,
            allowLower: true,
            db: 'tokentails',
        });
        expect(() => repair.parseArgs(['--yes'])).toThrow('Unknown argument --yes');
    });
});
