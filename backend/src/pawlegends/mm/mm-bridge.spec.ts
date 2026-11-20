import { SIM_VERSION, simFor } from '../../vendor/pawlegends-sim';
import { PartyService } from '../party/party.service';
import type { MmEntry } from './matchmaker';
import { MmBridge, type MmRelayApi, type MmSock } from './mm-bridge';
import { DEFAULT_GLICKO } from './glicko2';
import { MM_CASUAL, MM_LIMITS } from './mm-limits';
import { identityHash, MemoryMmRoomStore } from './mm-room.schema';
import { MemoryRatingSource } from './rating.schema';

/* The relay glue without sockets (M1A-IMPL.md §4.4, §4.5): caps by address, queue size, ratings and the leaver ladder. */

function make(shared?: { rooms: MemoryMmRoomStore; clock: { now: number } }) {
    const clock = shared?.clock ?? { now: 1_700_000_000_000 };
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
    const rooms = shared?.rooms ?? new MemoryMmRoomStore();
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
    it('20 searches from one IP and one /24 network with different accounts all queue (no per-address cap)', async () => {
        const t = make();
        const same = (i: number) =>
            t.sock({
                ip: '85.206.1.7',
                netKey: 'carrier-nat',
                identity: {
                    accountId: `nat${i}`,
                    guestKeyHash: null,
                    key: `acct:nat${i}`,
                    ticketed: true,
                    guest: false,
                    ipKey: 'one-address',
                },
            });
        const all = Array.from({ length: 20 }, (_, i) => same(i));
        for (const s of all) await t.join(s);
        for (const s of all) {
            expect(t.last(s.member, 'error')).toBeUndefined();
            expect(t.last(s.member, 'mm.status')).toBeDefined();
        }
        expect(t.bridge.counters().mm_queued).toBe(20);
    });

    it('one player: rapid Cancel and Search again 40 times is never refused', async () => {
        const t = make();
        const s = t.sock();
        for (let i = 0; i < 40; i++) {
            await t.join(s);
            expect(t.bridge.queued(s.member)).toBe(true);
            t.bridge.onJson(s.member, { t: 'mm.leave' });
            t.clock.now += 300;
        }
        await t.join(s);
        expect(t.sent.filter(x => x.to === s.member && x.msg.t === 'error')).toEqual([]);
        expect(t.bridge.queued(s.member)).toBe(true);
    });

    it('a second socket of the same account searching replaces the first entry (the newest wins)', async () => {
        const t = make();
        const a = t.sock();
        const b = t.sock({ identity: { ...a.identity } });
        await t.join(a);
        await t.join(b);
        expect(t.last(b.member, 'error')).toBeUndefined();
        expect(t.bridge.queued(b.member)).toBe(true);
        expect(t.bridge.queued(a.member)).toBe(false);
        expect(t.bridge.counters().mm_queued).toBe(1);
    });

    it('a script guard per identity only: past 200 searches in 10 minutes one account waits, others do not', async () => {
        const t = make();
        const s = t.sock();
        for (let i = 0; i < MM_LIMITS.joins.perIdentity; i++) {
            await t.join(s);
            t.bridge.onJson(s.member, { t: 'mm.leave' });
        }
        expect(t.sent.filter(x => x.to === s.member && x.msg.t === 'error')).toEqual([]);
        await t.join(s);
        expect(t.last(s.member, 'error')).toMatchObject({ code: 'mm_locked' });
        const other = t.sock({
            ip: s.ip,
            netKey: s.netKey,
            identity: { ...s.identity, key: 'acct:other', accountId: 'other' },
        });
        await t.join(other);
        expect(t.last(other.member, 'error')).toBeUndefined();
    });

    it('an IP-only identity (many players behind one address) is never rate limited', async () => {
        const t = make();
        const s = t.sock({
            identity: {
                accountId: null,
                guestKeyHash: null,
                key: 'ip:shared',
                ticketed: false,
                guest: true,
                ipKey: 'shared',
            },
        });
        for (let i = 0; i < MM_LIMITS.joins.perIdentity + 5; i++) {
            await t.join(s);
            t.bridge.onJson(s.member, { t: 'mm.leave' });
        }
        expect(t.sent.filter(x => x.to === s.member && x.msg.t === 'error')).toEqual([]);
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
            joins: { byKey: Map<string, unknown> };
        };
        expect(inner.pending.size).toBeGreaterThan(0);
        // every matched party ends before its room starts (the pick was abandoned)
        for (const p of t.parties.all()) for (const m of [...p.members]) t.parties.leave(m.id);
        t.clock.now += MM_LIMITS.joins.windowMs + 61_000;
        t.bridge.onTick();
        expect(inner.pending.size).toBe(0);
        expect(inner.joins.byKey.size).toBe(0);
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

    it('the leaver wait is served once: Cancel and Search again waits only what is left, never a fresh 60 s', async () => {
        const t = make();
        const s = t.sock();
        const hash = identityHash(s.identity.key);
        for (let i = 0; i < 2; i++)
            await t.rooms.create({
                _id: `lp${i}`,
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
        expect(t.last(s.member, 'mm.status')!.lowPriorityMs).toBe(60_000);
        t.clock.now += 20_000;
        t.bridge.onJson(s.member, { t: 'mm.leave' });
        await t.join(s);
        expect(t.last(s.member, 'mm.status')!.lowPriorityMs).toBe(40_000);
        t.clock.now += 45_000;
        t.bridge.onJson(s.member, { t: 'mm.leave' });
        await t.join(s);
        // served: no second wait before the next match
        expect(t.last(s.member, 'mm.status')!.lowPriorityMs ?? 0).toBe(0);
    });

    it('two relay instances: the leaver wait counts down once across both, and both read the same ladder', async () => {
        const a = make();
        const b = make({ rooms: a.rooms, clock: a.clock });
        const s = a.sock();
        const hash = identityHash(s.identity.key);
        const leftRoom = (id: string) =>
            a.rooms.create({
                _id: id,
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
                createdAt: new Date(a.clock.now - 3_600_000),
                endedAt: new Date(a.clock.now - 3_600_000),
            });
        await leftRoom('x1');
        // instance B reads the ladder first (1 event: a warning, no wait) and caches it
        const sb = b.sock({ identity: { ...s.identity } });
        await b.join(sb);
        expect(b.last(sb.member, 'mm.status')).toMatchObject({ warn: 'leaver', left: 1 });
        expect(b.last(sb.member, 'mm.status')!.lowPriorityMs ?? 0).toBe(0);
        b.bridge.onJson(sb.member, { t: 'mm.leave' });
        // a second leave is written (as instance A would at a room's end): B sees it within the short cache
        await leftRoom('x2');
        a.clock.now += MM_LIMITS.leaver.cacheMs;
        await a.join(s);
        expect(a.last(s.member, 'mm.status')).toMatchObject({ lowPriorityMs: 60_000, left: 2 });
        a.clock.now += 20_000;
        a.bridge.onJson(s.member, { t: 'mm.leave' });
        // Search again lands on the other instance: the same wait, 40 s left
        await b.join(sb);
        expect(b.last(sb.member, 'mm.status')).toMatchObject({ lowPriorityMs: 40_000, left: 2 });
        a.clock.now += 45_000;
        b.bridge.onJson(sb.member, { t: 'mm.leave' });
        await a.join(s);
        expect(a.last(s.member, 'mm.status')!.lowPriorityMs ?? 0).toBe(0);
    });

    it('held: ask with a live seat answers mm.rejoin (no search); leave and an older game free it with their own loss', async () => {
        const t = make();
        const s = t.sock();
        const losses: string[] = [];
        let seat = true;
        const api = (t.bridge as unknown as { api: MmRelayApi }).api;
        api.rejoinable = () => (seat ? { mode: 'casual', clockS: 95 } : null);
        api.release = (_i, _e, loss) => {
            losses.push(loss ?? 'dropped');
            seat = false;
        };
        t.bridge.onJson(s.member, { t: 'mm.join', queue: 'coop', side: 'any', held: 'ask' });
        await new Promise(r => setImmediate(r));
        expect(t.last(s.member, 'mm.rejoin')).toEqual({ t: 'mm.rejoin', mode: 'casual', clockS: 95 });
        expect(t.bridge.queued(s.member)).toBe(false);
        expect(t.bridge.counters().mm_rejoin_offers).toBe(1);
        // Search new match: the seat goes as a leave
        t.blocked.add(s.identity.key);
        t.stale.add(s.identity.key);
        api.release = (i, _e, loss) => {
            losses.push(loss ?? 'dropped');
            t.blocked.delete(i.key);
        };
        t.bridge.onJson(s.member, { t: 'mm.join', queue: 'coop', side: 'any', held: 'leave' });
        await new Promise(r => setImmediate(r));
        expect(t.bridge.queued(s.member)).toBe(true);
        t.bridge.onJson(s.member, { t: 'mm.leave' });
        // an older game (no held) and a socket our own update reloaded: a drop
        t.blocked.add(s.identity.key);
        await t.join(s);
        const u = t.sock({ identity: { ...s.identity }, updated: true });
        t.bridge.onJson(s.member, { t: 'mm.leave' });
        t.blocked.add(s.identity.key);
        t.bridge.onJson(u.member, { t: 'mm.join', queue: 'coop', side: 'any', held: 'leave' });
        await new Promise(r => setImmediate(r));
        expect(losses).toEqual(['left', 'dropped', 'dropped']);
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
        // the search starts when the wait ends (founder, 2026-11-20): no search time yet, the estimate covers both
        expect(st.waitedMs).toBe(0);
        expect(st.estimateMs).toBe(70_000); // 60 s + the 8 s quiet fill, in 5 s steps
        // the wait is a wait, not a refusal: nothing forms before it ends, even after the quiet fill time
        t.clock.now += 20_000;
        t.bridge.onTick();
        expect(t.last(s.member, 'mm.found')).toBeUndefined();
        t.clock.now += 41_000;
        t.bridge.onTick();
        expect(t.last(s.member, 'mm.found')).toBeUndefined();
        expect(t.last(s.member, 'mm.status')).toMatchObject({ waitedMs: 1000 });
        // the quiet co-op fill 8 s into the search
        t.clock.now += 7000;
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

    it('casual seed reads server records, never the hint; the newbie lock is lifted, so a 0-match guest queues (V16 §4.1)', async () => {
        const t = make();
        const v16 = { version: SIM_VERSION, hash: simFor(SIM_VERSION)!.SIM_SOURCE_HASH! };
        const casual = async (s: MmSock) => {
            t.bridge.onJson(s.member, { t: 'mm.join', queue: 'casual', side: 'any' });
            for (let i = 0; i < 5; i++) await Promise.resolve();
            await new Promise(r => setImmediate(r));
        };
        const entryOf = (s: MmSock): MmEntry | undefined =>
            [...((t.bridge as any).entries as Map<string, MmEntry>).values()].find(e =>
                e.members.some(m => m.member === s.member)
            );
        // the 5-match lock is lifted for now (founder, 2026-11-11: MM_CASUAL.newbieMatches 0): a 0-match guest queues
        expect(MM_CASUAL.newbieMatches).toBe(0);
        const fresh = t.sock({ proto: 3, sim: v16, hint: { maxDifficulty: 'rookie', newbie: true, matches: 0 } });
        await casual(fresh);
        expect(t.last(fresh.member, 'error')).toBeUndefined();
        expect(t.bridge.queued(fresh.member)).toBe(true);
        // no row and no saved match: the middle seed with rd at the newbie line; still a newbie for the fit cost
        expect(entryOf(fresh)!.members[0]).toMatchObject({ rating: { r: DEFAULT_GLICKO.r, rd: 300 }, newbie: true });
        // claims 50 matches and hard, has no saved match and no row: queued, but the 'hard' hint never seeds casual
        const liar = t.sock({ proto: 3, sim: v16, hint: { maxDifficulty: 'hard', newbie: false, matches: 50 } });
        await casual(liar);
        expect(t.last(liar.member, 'error')).toBeUndefined();
        expect(entryOf(liar)!.members[0].rating).toEqual({ r: DEFAULT_GLICKO.r, rd: 300 });
        // 7 saved matches, top easy: queued, seeded at easy (the 'hard' hint is ignored)
        const vet = t.sock({ proto: 3, sim: v16, hint: { maxDifficulty: 'hard', newbie: false, matches: 50 } });
        t.ratings.saved.set(vet.identity.accountId!, { matches: 7, top: 'easy' });
        await casual(vet);
        expect(t.last(vet.member, 'error')).toBeUndefined();
        expect(entryOf(vet)!.members[0].rating).toEqual({ r: 1350, rd: 300 });
        // an IP-only identity has no record: it queues too
        const anon = t.sock({
            proto: 3,
            sim: v16,
            identity: { accountId: null, guestKeyHash: null, key: 'ip:x', ticketed: false, guest: true },
            hint: { maxDifficulty: 'normal', newbie: true, matches: 0 },
        });
        await casual(anon);
        expect(t.last(anon.member, 'error')).toBeUndefined();
        expect(t.bridge.queued(anon.member)).toBe(true);
    });
});
