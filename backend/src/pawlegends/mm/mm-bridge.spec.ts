import { PartyService } from '../party/party.service';
import { MmBridge, type MmRelayApi, type MmSock } from './mm-bridge';
import { MM_LIMITS } from './mm-limits';
import { identityHash, MemoryMmRoomStore } from './mm-room.schema';
import { MemoryRatingSource } from './rating.schema';

/* The relay glue without sockets (M1A-IMPL.md §4.4, §4.5): caps by address, queue size, ratings and the leaver ladder. */

function make() {
    const clock = { now: 1_700_000_000_000 };
    const sent: { to: string; msg: Record<string, any> }[] = [];
    const socks = new Map<string, MmSock>();
    /** Identity keys the live-room cap blocks (canSeat false); `release` frees the ones in `stale`. */
    const blocked = new Set<string>();
    const stale = new Set<string>();
    const released: string[] = [];
    const parties = new PartyService(
        {
            heroes: ['clem', 'sage', 'nugget'],
            tricks: ['pounce'],
            difficulties: ['rookie', 'easy', 'normal', 'hard'],
            sideOf: h => (h === 'nugget' ? 'dog' : 'cat'),
            newbieHero: 'clem',
        },
        { changed: () => undefined, send: () => undefined, startMatch: () => undefined },
        () => clock.now
    );
    const api: MmRelayApi = {
        parties,
        now: () => clock.now,
        log: () => undefined,
        sock: m => socks.get(m) ?? null,
        send: (to, msg) => sent.push({ to, msg }),
        canSeat: i => !blocked.has(i.key),
        room: () => null,
        leaveParty: m => parties.leave(m),
        backfill: () => false,
        evict: () => undefined,
        release: i => {
            released.push(i.key);
            if (stale.has(i.key)) blocked.delete(i.key);
        },
        rejoin: () => false,
    };
    const rooms = new MemoryMmRoomStore();
    const ratings = new MemoryRatingSource();
    const bridge = new MmBridge(api, { rooms, ratings });
    let n = 0;
    const sock = (over: Partial<MmSock> = {}): MmSock => {
        const id = `member${++n}`;
        const s: MmSock = {
            member: id,
            proto: 2,
            identity: {
                accountId: `acc${n}`,
                guestKeyHash: null,
                key: `acct:acc${n}`,
                ticketed: true,
                guest: false,
                ipKey: `h${n}`,
            },
            ip: `10.0.${n >> 8}.${n & 255}`,
            netKey: `net${n}`,
            sim: { version: 14, hash: 'abc' },
            conn: 'on',
            ...over,
        };
        socks.set(s.member, s);
        return s;
    };
    const join = async (s: MmSock, side = 'any') => {
        bridge.onJson(s.member, { t: 'mm.join', queue: 'coop', side });
        for (let i = 0; i < 5; i++) await Promise.resolve();
        await new Promise(r => setImmediate(r));
    };
    const last = (to: string, t: string) => [...sent].reverse().find(x => x.to === to && x.msg.t === t)?.msg;
    return { clock, sent, bridge, rooms, ratings, sock, join, last, parties, blocked, stale, released };
}

describe('MmBridge', () => {
    it('queued entries per address: 12, and an IPv6 home counts once per /64', async () => {
        const t = make();
        const v6 = (i: number) => t.sock({ ip: `2a02:1234:5678:9abc::${(i + 1).toString(16)}`, netKey: `n${i}` });
        for (let i = 0; i < MM_LIMITS.queued.perIp; i++) await t.join(v6(i));
        expect(t.bridge.counters().mm_queued).toBe(MM_LIMITS.queued.perIp);
        const over = v6(99);
        await t.join(over);
        expect(t.last(over.member, 'error')).toMatchObject({ code: 'mm_locked' });
        // another /64 is another home
        const other = t.sock({ ip: '2a02:1234:5678:9abd::1' });
        await t.join(other);
        expect(t.last(other.member, 'mm.status')).toBeDefined();
    });

    it('Play online with a seat from a closed tab: that seat is given up and the search starts', async () => {
        const t = make();
        const s = t.sock();
        t.blocked.add(s.identity.key);
        t.stale.add(s.identity.key);
        await t.join(s);
        expect(t.released).toEqual([s.identity.key]);
        expect(t.last(s.member, 'mm.status')).toBeDefined();
        expect(t.last(s.member, 'error')).toBeUndefined();
    });

    it('a live-room cap that still binds is refused at once with a time, never a silent mm.cancel{server}', async () => {
        const t = make();
        const s = t.sock();
        t.blocked.add(s.identity.key);
        await t.join(s);
        expect(t.last(s.member, 'error')).toEqual({
            t: 'error',
            code: 'mm_locked',
            retryMs: MM_LIMITS.liveRoomRetryMs,
        });
        expect(t.bridge.queued(s.member)).toBe(false);
        // the cap starts to bind after the join (another tab took a room): at the fill, mm_locked, not `server`
        const u = t.sock();
        await t.join(u);
        t.blocked.add(u.identity.key);
        t.clock.now += 31_000;
        t.bridge.onTick();
        expect(t.last(u.member, 'mm.found')).toBeUndefined();
        expect(t.sent.some(x => x.to === u.member && x.msg.t === 'mm.cancel' && x.msg.reason === 'server')).toBe(false);
        expect(t.last(u.member, 'error')).toMatchObject({ code: 'mm_locked' });
        expect(t.bridge.queued(u.member)).toBe(false);
    });

    it('mm.leave while the join reads run: the join is dropped when they return', async () => {
        const t = make();
        const s = t.sock();
        let release!: () => void;
        const gate = new Promise<void>(r => (release = r));
        const get = t.ratings.get.bind(t.ratings);
        t.ratings.get = async (id: string) => {
            await gate;
            return get(id);
        };
        t.bridge.onJson(s.member, { t: 'mm.join', queue: 'coop', side: 'any' });
        t.bridge.onJson(s.member, { t: 'mm.leave' });
        release();
        for (let i = 0; i < 5; i++) await Promise.resolve();
        await new Promise(r => setImmediate(r));
        expect(t.bridge.queued(s.member)).toBe(false);
        expect(t.last(s.member, 'mm.status')).toBeUndefined();
    });

    it('nothing grows per identity: unstarted matches and old join logs are pruned', async () => {
        const t = make();
        for (let i = 0; i < 5; i++) await t.join(t.sock({ ip: `10.9.0.${i}`, netKey: `nn${i}` }));
        t.clock.now += 31_000;
        t.bridge.onTick();
        const inner = t.bridge as unknown as {
            pending: Map<string, unknown>;
            joins: { byKey: Map<string, unknown>; byIp: Map<string, unknown>; byNet: Map<string, unknown> };
        };
        expect(inner.pending.size).toBeGreaterThan(0);
        // every matched party ends before its room starts (the pick was abandoned)
        for (const p of t.parties.all()) for (const m of [...p.members]) t.parties.leave(m.id);
        t.clock.now += MM_LIMITS.joins.windowMs + 61_000;
        t.bridge.onTick();
        expect(inner.pending.size).toBe(0);
        expect(inner.joins.byKey.size + inner.joins.byIp.size + inner.joins.byNet.size).toBe(0);
    });

    it('a full queue answers server_busy with retryMs 15 s', async () => {
        const t = make();
        for (let i = 0; i < MM_LIMITS.queueMax; i++)
            await t.join(t.sock({ ip: `10.${i >> 8}.${i & 255}.1`, netKey: `n${i}` }));
        expect(t.bridge.counters().mm_queued).toBe(MM_LIMITS.queueMax);
        const late = t.sock({ ip: '11.0.0.1' });
        await t.join(late);
        expect(t.last(late.member, 'error')).toEqual({ t: 'error', code: 'server_busy', retryMs: 15_000 });
    });

    it('the leaver ladder: two events in 7 days queue with a 60 s low-priority wait and the warning', async () => {
        const t = make();
        const s = t.sock();
        const hash = identityHash(s.identity.key);
        for (let i = 0; i < 2; i++)
            await t.rooms.create({
                _id: `old${i}`,
                queue: 'coop',
                region: 'eu',
                side: 'cat',
                difficulty: 'easy',
                sim: '14:abc',
                fill: [],
                queueMs: {},
                members: [
                    {
                        slot: 0,
                        identityHash: hash,
                        accountId: null,
                        joinedTick: 0,
                        backfill: false,
                        ratingAtStart: null,
                        event: 'left',
                        eventTick: 10,
                    },
                ],
                createdAt: new Date(t.clock.now - 86_400_000),
                endedAt: new Date(t.clock.now - 86_400_000),
            });
        await t.join(s);
        const st = t.last(s.member, 'mm.status')!;
        expect(st.warn).toBe('leaver');
        expect(st.lowPriorityMs).toBe(60_000);
        // the wait is a wait, not a refusal: nothing forms before it ends, even after the quiet fill time
        t.clock.now += 20_000;
        t.bridge.onTick();
        expect(t.last(s.member, 'mm.found')).toBeUndefined();
        t.clock.now += 41_000;
        t.bridge.onTick();
        expect(t.last(s.member, 'mm.found')).toBeDefined();
    });

    it('a stored rating drives the room difficulty; an IP-keyed guest gets the hint seed and no ladder', async () => {
        const t = make();
        const s = t.sock();
        t.ratings.rows.set(s.identity.accountId!, {
            _id: `${s.identity.accountId}:coop`,
            accountId: s.identity.accountId!,
            queue: 'coop',
            r: 1900,
            rd: 60,
            sigma: 0.06,
            games: 40,
            wins: 30,
            lastAt: new Date(t.clock.now),
            appliedRooms: [],
            v: 40,
        });
        await t.join(s);
        t.clock.now += 9000;
        t.bridge.onTick();
        expect(t.last(s.member, 'mm.found')).toMatchObject({ difficulty: 'hard', humans: 1, bots: 2 });
        const g = t.sock({
            identity: { accountId: null, guestKeyHash: null, key: 'ip:shared', ticketed: false, guest: true },
            hint: { maxDifficulty: 'rookie', newbie: true },
        });
        await t.join(g);
        t.clock.now += 9000;
        t.bridge.onTick();
        expect(t.last(g.member, 'mm.found')).toMatchObject({ difficulty: 'rookie' });
    });
});
