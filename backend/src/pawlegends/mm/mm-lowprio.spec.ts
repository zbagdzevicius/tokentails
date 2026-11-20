import { Matchmaker, type MmEntry, type MmMember, type MmSideChoice } from './matchmaker';
import { MM_CASUAL, MM_LIMITS } from './mm-limits';

/*
 * Founder, 2026-11-20: "matchmaking is broken, even though it's filled with bots it's still keep going". Two searches
 * ran past the 15 s team of bots: (1) a search with a low-priority wait (leaver ladder, dodges): the wait counted as
 * search time, so the card's clock and bot pips ran while nothing could seat it, and the 40 s switch moved it to co-op
 * before the wait ended; (2) a rating under ~990 or over ~2010: the fairness band kept the team of bots out of every
 * plan, so the search sat alone until the co-op switch (45 s). Fake clock, pure matchmaker; the entry is shaped as
 * mm-bridge.ts makes it (the search starts when the wait ends).
 */

let n = 0;
const member = (key: string, r = 1500): MmMember => ({
    member: `m-${key}`,
    identityKey: `acct:${key}`,
    accountId: key,
    ipKey: `ip-${key}`,
    netKey: `net-${key}`,
    rating: { r, rd: 100 },
    newbie: false,
    maxDifficulty: null,
});

function make() {
    const clock = { now: 1_000_000 };
    let ids = 0;
    const mm = new Matchmaker(
        () => clock.now,
        () => `id${String(++ids).padStart(10, '0')}`
    );
    const start = clock.now;
    const entry = (key: string, o: { r?: number; side?: MmSideChoice; waitMs?: number } = {}): MmEntry => ({
        id: `e${++n}`,
        partyId: null,
        members: [member(key, o.r)],
        queue: 'casual',
        side: o.side ?? 'any',
        region: 'eu',
        sim: '16:abc',
        // mm-bridge.ts: a low-priority wait comes before the search
        enqueuedMs: clock.now + (o.waitMs ?? 0),
        notBeforeMs: o.waitMs ? clock.now + o.waitMs : 0,
        awaySinceMs: null,
    });
    const events: string[] = [];
    const until = (ms: number) => {
        while (clock.now - start < ms) {
            clock.now += MM_LIMITS.tickMs;
            const t = mm.tick();
            for (const e of t.switched) events.push(`switch ${e.id} @${clock.now - start}`);
            for (const m of t.matches) events.push(`${m.mode} ${m.humans}+${m.bots} @${clock.now - start}`);
        }
        return events;
    };
    return { clock, mm, entry, until, start, events };
}

describe('a search never runs alone past the team of bots (founder, 2026-11-20)', () => {
    it('a 60 s low-priority wait: no search clock, no bot seat and no co-op switch while it runs; a team of bots 15 s after', () => {
        const t = make();
        const e = t.entry('leaver', { waitMs: 60_000 });
        t.mm.join(e);
        // at the join: a search clock at 0 and an estimate of the wait plus the 15 s fill
        expect(t.mm.status(e.id)).toMatchObject({ waitedMs: 0, lowPriorityMs: 60_000, estimateMs: 75_000 });
        t.until(59_500);
        expect(t.events).toEqual([]);
        expect(t.mm.status(e.id)).toMatchObject({ waitedMs: 0, lowPriorityMs: 500 });
        t.until(74_500);
        expect(t.events).toEqual([]);
        expect(t.mm.status(e.id)!.waitedMs).toBe(14_500);
        t.until(90_000);
        // casual PvP against a team of bots at 15 s of search, never the co-op switch
        expect(t.events).toEqual(['casual 1+5 @75000']);
    });

    it('a player waiting out a penalty never jumps the queue: a player who searched first is seated first', () => {
        const t = make();
        const late = t.entry('late', { waitMs: 60_000 });
        t.mm.join(late);
        t.mm.join(t.entry('a'));
        expect(t.until(16_000)).toEqual(['casual 1+5 @15000']);
        expect(t.mm.status(late.id)).not.toBeNull();
    });

    it.each([700, 950, 1000, 1500, 2000, 2200, 2600])('rating %i alone: a team of bots at 15 s', r => {
        const t = make();
        t.mm.join(t.entry('solo', { r }));
        expect(t.until(MM_CASUAL.switchMs + 10_000)).toEqual(['casual 1+5 @15000']);
    });

    it.each(['cat', 'dog', 'any'] as const)('side %s alone: a team of bots at 15 s, on the side asked for', side => {
        const t = make();
        t.mm.join(t.entry('solo', { side }));
        const out: string[] = [];
        while (t.clock.now - t.start < 20_000) {
            t.clock.now += MM_LIMITS.tickMs;
            for (const m of t.mm.tick().matches) {
                out.push(`${m.humans}+${m.bots} @${t.clock.now - t.start}`);
                const mine = m.teams!.find(x => x.humans === 1)!;
                if (side !== 'any') expect(mine.species).toBe(side);
            }
        }
        expect(out).toEqual(['1+5 @15000']);
    });

    it('a cancel and a new search start the trickle again from the new join', () => {
        const t = make();
        const first = t.entry('solo');
        t.mm.join(first);
        t.until(10_000);
        t.mm.leave(first.id);
        t.mm.join(t.entry('solo'));
        // 10 s + 15 s: the new search's own team of bots
        expect(t.until(40_000)).toEqual(['casual 1+5 @25000']);
    });

    it('two players far apart (and beyond the bots) never meet; each plays its own team of bots at 15 s', () => {
        const t = make();
        t.mm.join(t.entry('low', { r: 900 }));
        t.mm.join(t.entry('high', { r: 2300 }));
        expect(t.until(30_000)).toEqual(['casual 1+5 @15000', 'casual 1+5 @15000']);
    });
});
