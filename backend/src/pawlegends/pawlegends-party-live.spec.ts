import { readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PAWLEGENDS_LEVEL_CAPS, PAWLEGENDS_LEVELS } from 'src/shared-contracts/caps';
import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { LiveGameDto } from 'src/user/dto/live-game.dto';
import { encodeTurnBody, type TurnEntry } from './party/net';
import { checkRoomLog, liveSim, RefereeRoom } from './party/referee-core';
import { MemoryRoomStore, type StoredRoom } from './party/room-store';
import { PARTY_DAILY_CAP, partyDigest, savePawlegendsPartyMatch } from './pawlegends-party-live';
import { savePawlegendsMatch } from './pawlegends-live';
import { SIM_VERSION } from '../vendor/pawlegends-sim';
import { PartyRelayService } from './party/party-relay.service';

/* Party play N8 (MULTIPLAYER.md §6, §12 N8): scoring through /live against the stored, verified room log. */

const ACCOUNT_A = '64b000000000000000000001';
const ACCOUNT_B = '64b000000000000000000002';

function room(over: Partial<StoredRoom> = {}): StoredRoom {
    const now = new Date('2026-11-12T12:00:00Z');
    return {
        _id: 'room1',
        party: 'p1',
        simVersion: SIM_VERSION,
        simHash: 'x',
        config: { seed: 1, picks: [], tricks: [], difficulty: 'normal', humans: [0, 1] },
        occupants: [
            { slot: 0, accountId: ACCOUNT_A, guestKeyHash: null, name: 'Sunny Tabby', ticketed: true },
            { slot: 1, accountId: ACCOUNT_B, guestKeyHash: null, name: 'Brave Paws', ticketed: true },
        ],
        chunks: [],
        lastTurn: 4000,
        lastSeq: [1, 1, 0],
        pilotTicks: {
            '0': { drop: 0, away: 0, afk: 0, late: 0, desync: 0, restore: 0, open: 0 },
            '1': { drop: 0, away: 0, afk: 0, late: 0, desync: 0, restore: 0, open: 0 },
        },
        openUnclaimedAt1800: false,
        unscored: null,
        status: 'ended',
        verdict: { finalHash: 'abcdef12', outcome: 'won', ticks: 8000, winner: 0, reason: 'core', verified: true },
        owner: 'boot',
        epoch: 0,
        handoff: false,
        resume: {},
        createdAt: now,
        updatedAt: now,
        ...over,
    };
}

function setup(r: StoredRoom = room()) {
    const users = new FakeUsers();
    const games = new FakeGames();
    const a = users.add({});
    const b = users.add({});
    for (const o of r.occupants)
        o.accountId = o.accountId === ACCOUNT_A ? a : o.accountId === ACCOUNT_B ? b : o.accountId;
    const store = new MemoryRoomStore();
    store.rooms.set(r._id, r);
    const deps = {
        users: users as any,
        games: games as any,
        rooms: store,
        now: () => new Date('2026-11-12T13:00:00Z'),
        logger: { warn: () => undefined, log: () => undefined },
    };
    const body = (slot: number, over: Record<string, unknown> = {}) => ({
        pawlegends: {
            v: 2 as const,
            room: r._id,
            slot,
            simVersion: SIM_VERSION,
            ticks: 8000,
            outcome: 'won' as const,
            finalHash: 'abcdef12',
            ...over,
        },
    });
    return {
        users,
        games,
        store,
        deps,
        a,
        b,
        body,
        save: (user: string, b2: ReturnType<typeof body>) => savePawlegendsPartyMatch(deps, user, b2 as any),
    };
}

const codeOf = async (p: Promise<unknown>) => {
    try {
        await p;
        return 'ok';
    } catch (e) {
        return (e as { response?: { code?: string } }).response?.code ?? String(e);
    }
};

describe('pawlegends party live (N8)', () => {
    const normal = PAWLEGENDS_LEVELS.indexOf('normal');

    it('a valid post saves catnip once; a second post is PAWLEGENDS_DUPLICATE; the row carries the room+slot digest', async () => {
        const s = setup();
        const r = await s.save(s.a, s.body(0));
        expect(r).toMatchObject({ party: true, difficulty: 'normal', catnipPaid: PAWLEGENDS_LEVEL_CAPS[normal] });
        expect(await codeOf(s.save(s.a, s.body(0)))).toBe('PAWLEGENDS_DUPLICATE');
        expect(s.games.rows.some((g: any) => g.replayDigest === partyDigest('room1', 0))).toBe(true);
        // the other member saves their own slot
        expect(await codeOf(s.save(s.b, s.body(1)))).toBe('ok');
    });

    it('one account seated twice in a room saves once (the second seat is PAWLEGENDS_DUPLICATE)', async () => {
        const s = setup(
            room({
                occupants: [
                    { slot: 0, accountId: ACCOUNT_A, guestKeyHash: null, name: 'Sunny Tabby', ticketed: true },
                    { slot: 1, accountId: ACCOUNT_A, guestKeyHash: null, name: 'Sunny Tabby 2', ticketed: true },
                ],
            })
        );
        expect(await codeOf(s.save(s.a, s.body(0)))).toBe('ok');
        expect(await codeOf(s.save(s.a, s.body(1)))).toBe('PAWLEGENDS_DUPLICATE');
    });

    it('wrong account → PAWLEGENDS_PARTY_SLOT; forged hash or outcome → PAWLEGENDS_REPLAY_INVALID; unknown room → PAWLEGENDS_PARTY_ROOM', async () => {
        const s = setup();
        expect(await codeOf(s.save(s.b, s.body(0)))).toBe('PAWLEGENDS_PARTY_SLOT');
        expect(await codeOf(s.save(s.a, s.body(0, { finalHash: '00000000' })))).toBe('PAWLEGENDS_REPLAY_INVALID');
        expect(await codeOf(s.save(s.a, s.body(0, { outcome: 'lost' })))).toBe('PAWLEGENDS_REPLAY_INVALID');
        expect(await codeOf(s.save(s.a, s.body(0, { room: 'nope' })))).toBe('PAWLEGENDS_PARTY_ROOM');
        const unverified = setup(
            room({ verdict: { finalHash: 'abcdef12', outcome: 'won', ticks: 8000, winner: 0, verified: false } })
        );
        expect(await codeOf(unverified.save(unverified.a, unverified.body(0)))).toBe('PAWLEGENDS_PARTY_ROOM');
    });

    it('51% drop/away/afk → PAWLEGENDS_PARTY_AFK, while 90% late or desync still scores', async () => {
        const afk = setup(
            room({
                pilotTicks: { '0': { drop: 2000, away: 1000, afk: 1100, late: 0, desync: 0, restore: 0, open: 0 } },
            })
        );
        expect(await codeOf(afk.save(afk.a, afk.body(0)))).toBe('PAWLEGENDS_PARTY_AFK');
        const late = setup(
            room({ pilotTicks: { '0': { drop: 0, away: 0, afk: 0, late: 4000, desync: 3200, restore: 0, open: 0 } } })
        );
        expect(await codeOf(late.save(late.a, late.body(0)))).toBe('ok');
    });

    it('simVersion below PARTY_SINCE (or a non-party bundle) → PAWLEGENDS_SIM_VERSION', async () => {
        const s = setup();
        expect(await codeOf(s.save(s.a, s.body(0, { simVersion: 10 })))).toBe('PAWLEGENDS_SIM_VERSION');
        // sim v12 is vendored (frozen) but shipped without party code: party play needs v13 (PARTY_SINCE)
        expect(await codeOf(s.save(s.a, s.body(0, { simVersion: 12 })))).toBe('PAWLEGENDS_SIM_VERSION');
    });

    it('never a fastest win from a party; an unclaimed open seat pays a tier lower', async () => {
        const s = setup(room({ openUnclaimedAt1800: true }));
        const r = await s.save(s.a, s.body(0));
        expect(r.catnipDifficulty).toBe(PAWLEGENDS_LEVELS[normal - 1]);
        expect(r.catnipPaid).toBe(PAWLEGENDS_LEVEL_CAPS[normal - 1]);
        expect(s.users.get(s.a).pawlegendsFastestWin).toBeUndefined();
    });

    it(`the ${PARTY_DAILY_CAP + 1}st party match of the day counts but pays no catnip`, async () => {
        const s = setup();
        for (let i = 0; i < PARTY_DAILY_CAP; i++) {
            const old = room({ _id: `old${i}`, updatedAt: new Date('2026-11-12T08:00:00Z') });
            old.occupants[0].accountId = s.a;
            s.store.rooms.set(old._id, old);
        }
        const r = await s.save(s.a, s.body(0));
        expect(r).toMatchObject({ catnipPaid: 0, why: 'daily' });
        expect(s.users.get(s.a).pawlegendsMatches.normal).toBe(1);
    });

    it('the /live DTO picks the party shape for v: 2 and the solo replay shape otherwise', () => {
        const party = plainToInstance(LiveGameDto, {
            type: 'PAWLEGENDS',
            pawlegends: {
                v: 2,
                room: 'room1',
                slot: 1,
                simVersion: SIM_VERSION,
                ticks: 10,
                outcome: 'won',
                finalHash: 'abcdef12',
            },
        });
        expect(
            validateSync(party, { whitelist: true, forbidNonWhitelisted: true }).filter(
                e => e.property === 'pawlegends'
            )
        ).toEqual([]);
        const bad = plainToInstance(LiveGameDto, {
            type: 'PAWLEGENDS',
            pawlegends: {
                v: 2,
                room: 'ROOM!',
                slot: 6,
                simVersion: SIM_VERSION,
                ticks: 10,
                outcome: 'won',
                finalHash: 'abcdef12',
            },
        });
        expect(
            validateSync(bad, { whitelist: true, forbidNonWhitelisted: true }).some(e => e.property === 'pawlegends')
        ).toBe(true);
        expect(
            JSON.stringify({
                v: 2,
                room: 'abcdefghijkl',
                slot: 2,
                simVersion: SIM_VERSION,
                ticks: 19800,
                outcome: 'lost',
                finalHash: 'abcdef12',
            }).length
        ).toBeLessThan(300);
    });

    it('the solo path still refuses a v: 2 body (it never re-sims a party result as a solo replay)', async () => {
        const s = setup();
        const code = await codeOf(
            savePawlegendsMatch({ users: s.users as any, games: s.games as any } as any, s.a, {
                pawlegends: s.body(0).pawlegends as any,
            })
        );
        expect(code).not.toBe('ok');
    });

    it('turn log → record conversion keeps pilot commands and the injected forfeit; the chain verifies', () => {
        jest.setTimeout(60_000);
        const sim = liveSim();
        const seats = [
            { slot: 0, hero: 'clem', trick: 'pounce' },
            { slot: 1, hero: 'sage', trick: 'snack' },
        ];
        const { picks, tricks } = sim.fillPicksParty(5, seats as never);
        const config = {
            seed: 5,
            picks: picks as string[],
            tricks: tricks as string[],
            difficulty: 'normal',
            humans: [0, 1],
        };
        const ref = new RefereeRoom(sim, config);
        const log: Uint8Array[] = [];
        let pilot: Uint8Array[] = [];
        const forfeitAt = Math.ceil(sim.forfeitFromOf('normal') / 2) + 5;
        for (let turn = 0; !ref.ended && turn < 20000; turn++) {
            const entries: TurnEntry[] = pilot.slice(-1).map(cmd => ({ slot: 1, sub: 0, pilot: true, cmd }));
            if (turn === forfeitAt) entries.push({ slot: 0, sub: 1, pilot: false, cmd: new Uint8Array([10]) });
            const body = encodeTurnBody({ turn, modeMask: 0b10, acks: [], entries });
            log.push(body);
            pilot = ref.applyTurn(body).pilot.flatMap(p => p.cmds);
        }
        const end = ref.ended!;
        expect(end.reason).toBe('forfeit');
        expect(end.record!.inputs[1].length).toBeGreaterThan(0); // slot 1's pilot commands are in the record
        const all = new Uint8Array(log.reduce((n, b) => n + b.length, 0));
        let at = 0;
        for (const b of log) {
            all.set(b, at);
            at += b.length;
        }
        expect(checkRoomLog(sim, config, all, end)).toMatchObject({ ok: true });
    });
});

describe('party relay never writes scores', () => {
    it('no relay provider injects UserRepository or GameRepository, and no party file imports them', () => {
        const dir = join(__dirname, 'party');
        for (const f of [
            'party-relay.ts',
            'party-relay.service.ts',
            'party.service.ts',
            'room.ts',
            'room-scheduler.ts',
            'referee-pool.ts',
            'referee-host.ts',
            'referee-core.ts',
            'room-store.ts',
            'party-ticket.service.ts',
        ]) {
            const src = readFileSync(join(dir, f), 'utf8');
            expect(src).not.toMatch(/import[^;]*(UserRepository|GameRepository|user\.repository|game\.repository)/);
            expect(src).not.toMatch(/private\s+(readonly\s+)?\w+\s*:\s*(UserRepository|GameRepository)/);
        }
        const params: unknown[] = Reflect.getMetadata('design:paramtypes', PartyRelayService) ?? [];
        expect(params.map(p => (p as { name?: string })?.name)).not.toContain('UserRepository');
        expect(params.map(p => (p as { name?: string })?.name)).not.toContain('GameRepository');
    });
});
