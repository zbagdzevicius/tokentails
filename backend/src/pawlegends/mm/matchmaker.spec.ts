import { entryRating, Matchmaker, type MmEntry, type MmMember, type MmSideChoice } from './matchmaker';
import { MM_LIMITS } from './mm-limits';

/* Quick Play matchmaker (M1A-IMPL.md §2, §3) on a fake clock: pure, deterministic, no sockets. */

let n = 0;
function member(key: string, over: Partial<MmMember> = {}): MmMember {
    return {
        member: `m-${key}`,
        identityKey: `acct:${key}`,
        accountId: key,
        ipKey: `ip-${key}`,
        netKey: `net-${key}`,
        rating: { r: 1500, rd: 100 },
        newbie: false,
        maxDifficulty: null,
        ...over,
    };
}

function entry(clock: { now: number }, keys: string[] | MmMember[], over: Partial<MmEntry> = {}): MmEntry {
    const members = (keys as (string | MmMember)[]).map(k => (typeof k === 'string' ? member(k) : k));
    return {
        id: `e${++n}`,
        partyId: members.length > 1 ? `p${n}` : null,
        members,
        queue: 'coop',
        side: 'any',
        region: 'eu',
        sim: '14:abc',
        enqueuedMs: clock.now,
        notBeforeMs: 0,
        awaySinceMs: null,
        ...over,
    };
}

function make() {
    const clock = { now: 1_000_000 };
    let ids = 0;
    const mm = new Matchmaker(
        () => clock.now,
        () => `id${String(++ids).padStart(10, '0')}`
    );
    const advance = (ms: number) => {
        const out = [];
        for (let t = 0; t < ms; t += MM_LIMITS.tickMs) {
            clock.now += MM_LIMITS.tickMs;
            out.push(mm.tick());
        }
        return out;
    };
    return { clock, mm, advance };
}

const matches = (ticks: ReturnType<Matchmaker['tick']>[]) => ticks.flatMap(t => t.matches);

/** Fill the pool's arrival history so λ lands in a band (distinct addresses in the last 5 minutes). */
function warm(mm: Matchmaker, clock: { now: number }, perMin: number) {
    const total = Math.round(perMin * 5);
    for (let i = 0; i < total; i++) {
        const e = entry(clock, [`warm${perMin}-${i}`], { side: 'cat', sim: '14:abc' });
        mm.join(e);
        mm.leave(e.id);
    }
}

describe('Matchmaker (M1a co-op)', () => {
    it('the arrival rate counts addresses, not identities: one IP cycling guest keys stays one arrival', () => {
        const { clock, mm } = make();
        for (let i = 0; i < 40; i++) {
            const e = entry(clock, [member(`g${i}`, { identityKey: `guest:g${i}`, ipKey: 'ip-one' })]);
            mm.join(e);
            mm.leave(e.id);
        }
        expect(mm.arrivalsPerMin('eu|coop|14:abc')).toBeLessThanOrEqual(1);
        const probe = entry(clock, ['probe']);
        expect(mm.poolRate(probe)).toBeLessThan(MM_LIMITS.fill.quietPerMin);
    });

    it('prunes offer logs and arrival lists that aged out', () => {
        const { clock, mm } = make();
        const e = entry(clock, ['old']);
        mm.join(e);
        mm.leave(e.id);
        const arrivals = (mm as unknown as { arrivals: Map<string, unknown[]> }).arrivals;
        expect(arrivals.size).toBe(1);
        clock.now += MM_LIMITS.fill.arrivalWindowMs + 61_000;
        mm.tick();
        expect(arrivals.size).toBe(0);
    });

    it('three compatible solos match on the next tick: one side, slot 0 is the oldest entry', () => {
        const { clock, mm, advance } = make();
        const a = entry(clock, ['a'], { side: 'dog' });
        clock.now += 1000;
        const b = entry(clock, ['b']);
        const c = entry(clock, ['c']);
        for (const e of [a, b, c]) expect(mm.join(e)).toBe('ok');
        const [m] = matches(advance(500));
        expect(m).toMatchObject({ humans: 3, bots: 0, side: 'dog', fill: null });
        expect(m.members[0]).toBe('m-a');
        expect(m.entries[0]).toBe(a.id);
        expect(mm.size).toBe(0);
    });

    it('a lone solo fills with bots at 8 s in a quiet pool, 20 s normal, 30 s busy (never later)', () => {
        for (const [perMin, at] of [
            [0, 8000],
            [3, 20_000],
            [12, 30_000],
        ] as const) {
            const { clock, mm, advance } = make();
            warm(mm, clock, perMin);
            const e = entry(clock, ['solo']);
            mm.join(e);
            const ticks = advance(40_000);
            const i = ticks.findIndex(t => t.matches.length);
            expect(i).toBeGreaterThanOrEqual(0);
            const waited = ticks[i].matches[0].waitedMs[e.id];
            expect(waited).toBeGreaterThanOrEqual(at);
            expect(waited).toBeLessThanOrEqual(at + MM_LIMITS.tickMs);
            expect(ticks[i].matches[0]).toMatchObject({ humans: 1, bots: 2 });
        }
    });

    it('two solos match with one bot at the pair-fill time', () => {
        const { clock, mm, advance } = make();
        warm(mm, clock, 3);
        const a = entry(clock, ['a']);
        const b = entry(clock, ['b']);
        mm.join(a);
        mm.join(b);
        const ticks = advance(15_000);
        const m = matches(ticks)[0];
        expect(m).toMatchObject({ humans: 2, bots: 1 });
        expect(m.waitedMs[a.id]).toBeGreaterThanOrEqual(12_000);
        expect(m.waitedMs[a.id]).toBeLessThan(12_600);
    });

    it('cats and dogs never share a team; `any` joins either and the side follows the fixed entry', () => {
        const { clock, mm, advance } = make();
        mm.join(entry(clock, ['cat1'], { side: 'cat' }));
        mm.join(entry(clock, ['dog1'], { side: 'dog' }));
        mm.join(entry(clock, ['any1'], { side: 'any' }));
        const ms = matches(advance(9000));
        for (const m of ms) {
            const sides = m.members.map(x => x.replace('m-', '').replace(/\d/, ''));
            expect(sides.includes('cat') && sides.includes('dog')).toBe(false);
        }
        const withAny = ms.find(m => m.members.includes('m-any1'))!;
        expect(withAny.humans).toBe(2);
        expect(withAny.side).toBe(withAny.members.includes('m-cat1') ? 'cat' : 'dog');
    });

    it('a duo and a solo make a team; two duos never match', () => {
        const { clock, mm, advance } = make();
        const d1 = entry(clock, ['d1a', 'd1b']);
        const d2 = entry(clock, ['d2a', 'd2b']);
        mm.join(d1);
        mm.join(d2);
        expect(matches(advance(1000))).toHaveLength(0);
        const s = entry(clock, ['s']);
        mm.join(s);
        const [m] = matches(advance(500));
        expect(m.humans).toBe(3);
        expect(m.entries).toContain(d1.id);
        expect(m.entries).toContain(s.id);
        expect(m.members.slice(0, 2)).toEqual(['m-d1a', 'm-d1b']);
    });

    it('a duo queues with its party rating: mean + 0.25 × (max − mean)', () => {
        const clock = { now: 0 };
        const e = entry(clock, [
            member('x', { rating: { r: 1200, rd: 50 } }),
            member('y', { rating: { r: 1800, rd: 80 } }),
        ]);
        expect(entryRating(e)).toEqual({ r: 1500 + 0.25 * 300, rd: 80 });
    });

    it('different sims, regions and the same identity twice never match', () => {
        const { clock, mm, advance } = make();
        mm.join(entry(clock, ['a'], { sim: '14:abc' }));
        mm.join(entry(clock, ['b'], { sim: '13:old' }));
        mm.join(entry(clock, ['c'], { region: 'us' }));
        expect(mm.join(entry(clock, ['a']))).toBe('already_queued');
        const ms = matches(advance(1000));
        expect(ms).toHaveLength(0);
        const ip = make();
        // ip: keys are many people behind one address: they may share a match
        ip.mm.join(entry(ip.clock, [member('i1', { identityKey: 'ip:same' })]));
        ip.mm.join(entry(ip.clock, [member('i2', { identityKey: 'ip:same', member: 'm-i2' })]));
        ip.mm.join(entry(ip.clock, ['k']));
        expect(matches(ip.advance(500))[0]?.humans).toBe(3);
    });

    it('away entries are skipped and cancelled after 60 s; notBeforeMs is respected', () => {
        const { clock, mm, advance } = make();
        const away = entry(clock, ['away']);
        mm.join(away);
        mm.setAway(away.id, true);
        const late = entry(clock, ['late'], { notBeforeMs: clock.now + 60_000 });
        mm.join(late);
        const ticks = advance(61_000);
        expect(matches(ticks).some(m => m.entries.includes(away.id))).toBe(false);
        expect(ticks.flatMap(t => t.cancelled).map(c => c.entry.id)).toEqual([away.id]);
        const lm = matches(ticks).find(m => m.entries.includes(late.id))!;
        expect(lm.waitedMs[late.id]).toBeGreaterThanOrEqual(60_000);
    });

    it('the rating window widens with the wait (capped at 600, plus RD over 200)', () => {
        const { clock, mm } = make();
        const e = entry(clock, ['w']);
        expect(mm.window(e, 0)).toBe(150);
        expect(mm.window(e, 10_000)).toBe(300);
        expect(mm.window(e, 300_000)).toBe(600);
        const wide = entry(clock, [member('wide', { rating: { r: 1500, rd: 300 } })]);
        expect(mm.window(wide, 0)).toBe(250);
        // two solos 400 apart: not at once, matched once the window reached 400
        const m2 = make();
        const a = entry(m2.clock, [member('a', { rating: { r: 1100, rd: 50 } })]);
        const b = entry(m2.clock, [member('b', { rating: { r: 1500, rd: 50 } })]);
        const c = entry(m2.clock, [member('c', { rating: { r: 1520, rd: 50 } })]);
        m2.mm.join(a);
        m2.mm.join(b);
        m2.mm.join(c);
        const first = matches(m2.advance(500))[0];
        expect(first).toBeUndefined();
    });

    it('newbies prefer newbies', () => {
        const { clock, mm, advance } = make();
        warm(mm, clock, 3);
        const nb = entry(clock, [member('nb', { newbie: true })]);
        mm.join(nb);
        mm.join(entry(clock, [member('vet', { rating: { r: 1500, rd: 100 } })]));
        mm.join(entry(clock, [member('nb2', { newbie: true, member: 'm-nb2' })]));
        mm.join(entry(clock, [member('vet2', { rating: { r: 1500, rd: 100 } })]));
        // four solos: the oldest (a newbie) takes the other newbie and one more (the earlier veteran)
        const [m] = matches(advance(500));
        expect(m.members[0]).toBe('m-nb');
        expect(m.members).toContain('m-nb2');
        expect(m.members).toContain('m-vet');
    });

    it('identical inputs and clock give identical output', () => {
        const run = () => {
            n = 0;
            const { clock, mm, advance } = make();
            const sides: MmSideChoice[] = ['any', 'cat', 'dog', 'any', 'cat'];
            for (let i = 0; i < 12; i++) {
                mm.join(
                    entry(clock, [member(`k${i}`, { rating: { r: 1200 + i * 37, rd: 100 } })], { side: sides[i % 5] })
                );
                advance(1500);
            }
            return JSON.stringify(matches(advance(40_000)));
        };
        expect(run()).toBe(run());
    });

    it('backfill: a seat goes to the best compatible solo that waited 3 s; decline passes it on; 3 offers per 10 min', () => {
        const { clock, mm, advance } = make();
        const seat = {
            room: 'r1',
            slot: 1,
            side: 'cat' as const,
            sim: '14:abc',
            region: 'eu',
            difficulty: 'normal',
            teamRating: 1500,
            leaverKey: 'acct:leaver',
            inRoomKeys: ['acct:mate'],
            sinceMs: clock.now,
        };
        // a long fill so the solos stay queued (busy pool)
        warm(mm, clock, 12);
        // the leaver and a room mate are never offered the seat (they match among themselves here)
        mm.join(entry(clock, ['leaver'], { side: 'dog' }));
        mm.join(entry(clock, ['mate'], { side: 'dog' }));
        mm.join(entry(clock, ['dogonly'], { side: 'dog' }));
        mm.addBackfillSeat(seat);
        const early = advance(2000);
        expect(early.flatMap(t => t.offers)).toHaveLength(0);
        expect(matches(early)[0]?.humans).toBe(3);
        const late = entry(clock, [member('far', { rating: { r: 1900, rd: 50 } })], { side: 'cat' });
        const good = entry(clock, ['good'], { side: 'any' });
        mm.join(late);
        mm.join(good);
        const offers = advance(3500).flatMap(t => t.offers);
        expect(offers).toHaveLength(1);
        expect(offers[0].entry).toBe(good.id);
        expect(mm.answerOffer(offers[0].offer, false)).toBeNull();
        // declined: not offered again for that seat; nobody else qualifies (far is out of 300)
        expect(advance(1000).flatMap(t => t.offers)).toHaveLength(0);
        mm.dropBackfillSeat('r1', 1);
        // three offers per 10 minutes per identity
        for (let i = 0; i < 4; i++) mm.addBackfillSeat({ ...seat, room: `x${i}` });
        let got = 0;
        for (let i = 0; i < 4; i++) {
            const o = advance(500).flatMap(t => t.offers);
            got += o.length;
            for (const x of o) mm.answerOffer(x.offer, false);
        }
        // the first seat's offer counted too: 3 in all
        expect(got).toBe(2);
        // Yes: the entry leaves the queue and the seat is gone
        const fresh = make();
        fresh.mm.join(entry(fresh.clock, ['f1'], { side: 'cat', enqueuedMs: fresh.clock.now - 5000 }));
        fresh.mm.addBackfillSeat({ ...seat, room: 'y' });
        const [o] = fresh.advance(500).flatMap(t => t.offers);
        expect(fresh.mm.answerOffer(o.offer, true)).toMatchObject({ entry: o.entry });
        expect(fresh.mm.size).toBe(0);
        expect(fresh.mm.hasSeat('y', 1)).toBe(false);
    });

    it('status: waited, a 5 s rounded estimate (at least 3 s), the found count and the low-priority wait', () => {
        const { clock, mm, advance } = make();
        const e = entry(clock, ['s1'], { notBeforeMs: clock.now + 60_000 });
        mm.join(e);
        advance(2000);
        const st = mm.status(e.id)!;
        expect(st.waitedMs).toBe(2000);
        expect(st.lowPriorityMs).toBe(58_000);
        expect(st.estimateMs % 5000).toBe(0);
        expect(st.estimateMs).toBeGreaterThanOrEqual(3000);
        expect(st.found).toBe(1);
        expect(mm.status('nope')).toBeNull();
    });
});
