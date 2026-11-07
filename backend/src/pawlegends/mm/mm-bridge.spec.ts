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
        canSeat: () => true,
        room: () => null,
        leaveParty: m => parties.leave(m),
        backfill: () => false,
        evict: () => undefined,
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
    return { clock, sent, bridge, rooms, ratings, sock, join, last, parties };
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
