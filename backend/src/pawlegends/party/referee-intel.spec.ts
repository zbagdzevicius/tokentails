import { withIntel } from '../mm/mm-bridge';
import type { MmRoomMember } from '../mm/mm-room.schema';
import { accountIntel, heroBaselines, intelZ } from '../social/intel';
import { IntelCounter, OP_ATTACK, OP_CAST, SIGHT_STRIDE } from './referee-intel';
import { liveSim, RefereeRoom } from './referee-core';

/*
 * The referee's "acts on hidden" signal (SOCIAL-RANKED.md §9.2, §9.3) with a scripted sight: slot 0 (team 0) acts on
 * slot 3 (team 1). Team 0 sees slot 3 until tick `hideAt`, then not.
 */

function counter(hideAt: number) {
    let tick = 0;
    const read = (out: Int32Array) => {
        for (let h = 0; h < 6; h++) {
            const o = h * SIGHT_STRIDE;
            out[o] = h === 3 ? 5000 : 1000 * h; // slot 3 stands 5 m from slot 0
            out[o + 1] = 0;
            out[o + 2] = 1;
            // everyone sees their own team; team 0 stops seeing slot 3 at hideAt
            const team = h >= 3 ? 1 : 0;
            out[o + 3] = (1 << team) | (h === 3 && tick >= hideAt ? 0 : 1);
        }
    };
    const c = new IntelCounter(6, 3, [0, 3], read, ['clem', 'sage', 'brutus', 'gabe', 'pixel', 'stilts']);
    const run = (to: number, at: (t: number) => { op: number; [k: string]: number }[], pilotMask = 0) => {
        for (; tick < to; tick++) {
            const per = Array.from({ length: 6 }, () => [] as { op: number; [k: string]: number }[]);
            per[0] = at(tick);
            c.beforeStep(tick, per, pilotMask);
            c.afterStep(tick + 1);
        }
    };
    return { c, run };
}

describe('referee intel: acts on hidden (SOCIAL-RANKED.md §9.2)', () => {
    it('attacking a hero hidden for 2 s counts hid and opp', () => {
        const { c, run } = counter(100);
        run(160, t => (t === 159 ? [{ op: OP_ATTACK, id: 3 }] : []));
        expect(c.result()[0]).toMatchObject({ slot: 0, acts: 1, hid: 1, opp: 1, hero: 'clem' });
    });

    it('a hero revealed or hidden only 0.5 s ago does not count', () => {
        const { c, run } = counter(100);
        run(116, t => (t === 115 ? [{ op: OP_ATTACK, id: 3 }] : []));
        expect(c.result()[0]).toMatchObject({ acts: 1, hid: 0, opp: 0 });
    });

    it('a cast aimed within 1.5 m of the hidden hero counts; one far away is only an opportunity', () => {
        const { c, run } = counter(10);
        run(80, t =>
            t === 70
                ? [{ op: OP_CAST, slot: 0, x: 5500, y: 400, id: 255 }]
                : t === 75
                ? [{ op: OP_CAST, slot: 1, x: 0, y: 8000, id: 255 }]
                : []
        );
        expect(c.result()[0]).toMatchObject({ acts: 2, hid: 1, opp: 2 });
    });

    it('pilot commands are ignored', () => {
        const { c, run } = counter(10);
        run(80, t => (t === 70 ? [{ op: OP_ATTACK, id: 3 }] : []), 1);
        expect(c.result()[0]).toMatchObject({ acts: 0, hid: 0, opp: 0 });
    });

    it('intel is absent on sims without heroSight (every vendored bundle today)', () => {
        const sim = liveSim();
        expect((sim as { heroSight?: unknown }).heroSight).toBeUndefined();
        const room = new RefereeRoom(sim, {
            seed: 1,
            picks: ['clem', 'sage', 'brutus', 'gabe', 'pixel', 'stilts'],
            tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'],
            difficulty: 'hard',
            humans: [0, 3],
            mode: 'pvp',
        });
        expect((room as unknown as { intel: unknown }).intel).toBeNull();
    });

    it('the relay stores intel on the slot last holder, accounts only', () => {
        const members: MmRoomMember[] = [
            { slot: 0, identityHash: 'a', accountId: 'A', joinedTick: 0, backfill: false, ratingAtStart: null },
            { slot: 3, identityHash: 'c', accountId: 'C', joinedTick: 0, backfill: false, ratingAtStart: null },
            { slot: 3, identityHash: 'e', accountId: 'E', joinedTick: 900, backfill: true, ratingAtStart: null },
        ];
        withIntel(members, [
            { slot: 0, acts: 5, hid: 1, opp: 3, hero: 'clem' },
            { slot: 3, acts: 7, hid: 6, opp: 6, hero: 'gabe' },
        ]);
        expect(members.map(m => m.intel ?? null)).toEqual([
            { acts: 5, hid: 1, opp: 3, hero: 'clem' },
            null,
            { acts: 7, hid: 6, opp: 6, hero: 'gabe' },
        ]);
    });
});

describe('map-hack score (SOCIAL-RANKED.md §9.3)', () => {
    it('a fixture map-hacker gets z > 4; honest players stay under 2', () => {
        const rooms = [];
        // 30 honest accounts: ~10% of their chances are hidden-target actions
        for (let a = 0; a < 30; a++)
            for (let r = 0; r < 6; r++)
                rooms.push({
                    members: [
                        { accountId: `h${a}`, intel: { acts: 40, hid: 1 + ((a + r) % 3), opp: 20, hero: 'clem' } },
                    ],
                });
        // the cheater acts on hidden heroes most of the time
        const cheat = Array.from({ length: 20 }, () => ({
            members: [{ accountId: 'X', intel: { acts: 40, hid: 15, opp: 20, hero: 'clem' } }],
        }));
        const base = heroBaselines([...rooms, ...cheat]);
        expect(intelZ(accountIntel(cheat, 'X'), base).z!).toBeGreaterThan(4);
        for (let a = 0; a < 30; a++) {
            const mine = rooms.filter(r => r.members[0].accountId === `h${a}`);
            expect(Math.abs(intelZ(accountIntel(mine, `h${a}`), base).z!)).toBeLessThan(2);
        }
    });
});
