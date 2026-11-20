import { Module } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PawlegendsRankedController } from '../ranked/ranked.controller';
import { RankedService } from '../ranked/ranked.service';
import { SocialMemoryModel, TestClock } from '../social/social-model.helper-spec';
import { LeaderboardService } from './leaderboard.service';

/*
 * Guest Boards (LEADERBOARDS.md, founder Nov 20 "yes"): `GET /pawlegends/boards/countries` over HTTP, with no token.
 * Top countries only: country code, rank, players count and level total; no player names, ids or codes. The per-IP
 * fallback limit (anonymous callers at 10x) does not block a guest opening Boards.
 */

const uniq = () => [{ fields: ['_id'] }];
const t = new Date(Date.UTC(2026, 10, 1));
const user = (id: string, matches: number) => ({ _id: id, pawlegendsMatches: { easy: matches } });

function service() {
    const clock = new TestClock();
    const users = [user('A', 50), user('B', 40), user('C', 30), user('H', 90), user('L', 99), user('M', 2)];
    const mem = (rows: any[], idx: any[] = uniq()) => new SocialMemoryModel(rows, idx, clock.now);
    return new LeaderboardService(
        mem(users.map(u => ({ _id: u._id, m: u.pawlegendsMatches.easy, at: t }))),
        mem([]),
        mem([]),
        mem(users),
        mem([]),
        mem([]),
        mem([], []),
        mem(
            users.map(u => ({ _id: u._id, name: { kind: 'nick' }, nick: `Nick${u._id}` })),
            []
        ),
        mem(
            [
                { _id: 'A', cc: 'LT', off: false, at: t },
                { _id: 'B', cc: 'LT', off: false, at: t },
                { _id: 'C', cc: 'LT', off: false, at: t },
                { _id: 'H', cc: 'LT', off: true, at: t },
                { _id: 'L', cc: 'LV', off: false, at: t },
                { _id: 'M', cc: null, off: false, at: t },
            ],
            []
        ),
        undefined,
        undefined,
        mem([]),
        clock
    );
}

describe('GET /pawlegends/boards/countries (public, HTTP)', () => {
    let app: any;
    let base = '';
    const storage = new ThrottlerStorageService();

    beforeAll(async () => {
        @Module({
            controllers: [PawlegendsRankedController],
            providers: [
                { provide: RankedService, useValue: { board: async () => ({ rows: [] }) } },
                {
                    provide: ClientIpThrottlerGuard,
                    useValue: new ClientIpThrottlerGuard(storage, new Reflector()),
                },
                { provide: LeaderboardService, useValue: service() },
            ],
        })
        class CountriesE2eModule {}
        app = await NestFactory.create(CountriesE2eModule, { logger: false });
        await app.listen(0, '127.0.0.1');
        base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    });

    afterAll(async () => {
        await app?.close();
        storage.onApplicationShutdown();
    });

    it('answers with no token: country code, rank, players and level total only', async () => {
        const r = await fetch(`${base}/pawlegends/boards/countries`);
        expect(r.status).toBe(200);
        const body = await r.json();
        // LT: A Lv 14 + B Lv 12 + C Lv 11 = 37 (H hid the flag); LV: L Lv 18; M shows no country
        expect(body).toEqual({
            countries: {
                rows: [
                    { rank: 1, cc: 'LT', players: 3, levels: 37 },
                    { rank: 2, cc: 'LV', players: 1, levels: 18 },
                ],
                mine: null,
                total: 2,
            },
        });
        for (const row of body.countries.rows)
            expect(Object.keys(row).sort()).toEqual(['cc', 'levels', 'players', 'rank']);
        const text = JSON.stringify(body);
        for (const leak of ['Nick', '"_id"', '"code"', '"name"', '"me"']) expect(text).not.toContain(leak);
    });

    it('My country stays signed-in only', async () => {
        const r = await fetch(`${base}/pawlegends/boards/country`);
        expect(r.status).toBe(403);
    });

    it('a guest reopening Boards many times a minute is not refused (per-IP fallback at 10x)', async () => {
        const codes = new Set<number>();
        for (let i = 0; i < 80; i++) codes.add((await fetch(`${base}/pawlegends/boards/countries`)).status);
        expect([...codes]).toEqual([200]);
    });
});
