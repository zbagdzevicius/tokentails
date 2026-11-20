import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { GUEST_ALLOW_LIST } from 'src/common/guards/guest-allow-list';
import type { MmRoomRecord } from '../mm/mm-room.schema';
import { PawlegendsRankedController } from '../ranked/ranked.controller';
import type { PublicPlayerCard } from '../ranked/ranked.service';
import { playerCodes, withoutCodes } from '../social/player-codes';
import { SocialMemoryModel, TestClock } from '../social/social-model.helper-spec';
import { SocialService } from '../social/social.service';
import { CARD_CACHE_MS, PawlegendsHistoryController } from './history.controller';

/*
 * The Player Card (docs/plans/moba/PLAYER-CARD.md): another player's first history page carries a whitelisted `player`
 * block with the viewer's relation and an online flag; an end-of-match seat resolves to a code (never "bot"); board
 * rows carry codes for signed-in callers only.
 */

function room(clock: TestClock, id = 'r1', ageMs = 3600_000): MmRoomRecord {
    const m = (slot: number, accountId: string | null, joinedTick = 0) => ({
        slot,
        identityHash: `h-${slot}`,
        accountId,
        joinedTick,
        backfill: false,
        ratingAtStart: null,
    });
    return {
        _id: id,
        queue: 'casual',
        mode: 'casual',
        region: 'eu',
        side: 'cat',
        difficulty: 'hard',
        sim: '19',
        fill: [2],
        queueMs: {},
        // slot 2 is a bot (no member); slot 4 was taken over by D after C left
        members: [m(0, 'A'), m(1, 'B'), m(3, 'C'), m(4, 'C'), m(4, 'D', 50), m(5, 'E')],
        outcome: 'won',
        endedAt: new Date(clock.ms - ageMs),
        createdAt: new Date(clock.ms - ageMs - 600_000),
    };
}

function harness() {
    const clock = new TestClock();
    const now = clock.now;
    const models = {
        social: new SocialMemoryModel(
            [
                {
                    _id: 'A',
                    code: 'AAAAAAAA',
                    name: { kind: 'generated' },
                    invisible: false,
                    allowRecent: true,
                    rev: 0,
                },
                {
                    _id: 'B',
                    code: 'BBBBBBBB',
                    name: { kind: 'generated' },
                    invisible: false,
                    allowRecent: true,
                    rev: 0,
                },
                { _id: 'C', code: 'CCCCCCCC', name: { kind: 'generated' }, invisible: true, allowRecent: true, rev: 0 },
                {
                    _id: 'D',
                    code: 'DDDDDDDD',
                    name: { kind: 'generated' },
                    invisible: false,
                    allowRecent: true,
                    rev: 0,
                },
                {
                    _id: 'E',
                    code: 'EEEEEEEE',
                    name: { kind: 'generated' },
                    invisible: false,
                    allowRecent: true,
                    rev: 0,
                },
            ],
            [{ fields: ['code'] }, { fields: ['_id'] }],
            now
        ),
        friends: new SocialMemoryModel(
            [
                { _id: 'A:B', a: 'A', b: 'B', from: 'A', state: 'accepted', via: 'code' },
                { _id: 'A:C', a: 'A', b: 'C', from: 'A', state: 'pending', via: 'code' },
                { _id: 'A:D', a: 'A', b: 'D', from: 'D', state: 'pending', via: 'code' },
            ],
            [{ fields: ['_id'] }],
            now
        ),
        blocks: new SocialMemoryModel([{ _id: 'A:E', blocker: 'A', blocked: 'E' }], [{ fields: ['_id'] }], now),
        presence: new SocialMemoryModel(
            [
                { _id: 'B', api: { at: now() } },
                { _id: 'C', api: { at: now() } },
            ],
            [{ fields: ['_id'] }],
            now
        ),
        invites: new SocialMemoryModel([], [], now),
        buyers: new SocialMemoryModel([], [{ fields: ['key'] }], now),
        rooms: new SocialMemoryModel([room(clock), room(clock, 'old', 40 * 86_400_000)], [], now),
        users: new SocialMemoryModel(
            ['A', 'B', 'C', 'D', 'E'].map(id => ({ _id: id, isGuest: false })),
            [],
            now
        ),
    };
    const social = new SocialService(
        models.social,
        models.friends,
        models.blocks,
        models.presence,
        models.invites,
        models.buyers,
        models.rooms,
        models.users,
        undefined,
        clock
    );
    return { clock, models, social };
}

const CARD: PublicPlayerCard = {
    matches: 42,
    ranked: {
        placementsLeft: 0,
        placementsOf: 5,
        tierIdx: 7,
        tier: 'alley',
        label: 'Alley II',
        points: 40,
        peak: 'Alley I',
    },
    av: { i: 'h:clem', f: 'frame.gold', t: 'title.founder' } as never,
    cc: 'LT',
};

function controller(social: SocialService, opts: { card?: jest.Mock } = {}) {
    const ids: Record<string, string> = { 'PL-BBBB-BBBB': 'B', 'PL-CCCC-CCCC': 'C', 'PL-DDDD-DDDD': 'D' };
    const history = {
        list: jest.fn(async () => ({
            owner: { name: 'Bee', self: false },
            rows: [],
            next: null,
            stats: { season: 's7', matches: 3 },
        })),
        ownerOf: jest.fn(async (viewer: string, code: string) => ({ id: ids[code], self: ids[code] === viewer })),
        match: jest.fn(),
        setVisibility: jest.fn(),
        people: { names: async (list: string[]) => new Map(list.map(id => [id, `Name ${id}`])) },
    };
    const ranked = { publicCard: opts.card ?? jest.fn(async () => ({ ...CARD })) };
    const throttler = { consume: jest.fn(async () => undefined) };
    const ctl = new PawlegendsHistoryController(history as never, throttler as never, ranked as never, social);
    return { ctl, history, ranked, throttler };
}

const req = (id: string, guest = false) => ({ user: { _id: id, isGuest: guest } });

describe('Player Card: another player’s card (GET /pawlegends/history/u/:code)', () => {
    it('answers only whitelisted fields, with the viewer’s relation and an online flag', async () => {
        const { social } = harness();
        const { ctl } = controller(social);
        const page = (await ctl.theirs('PL-BBBB-BBBB', {}, req('A'), {})) as { player: Record<string, unknown> };
        expect(page.player).toEqual({ ...CARD, rel: 'friend', online: true });
        expect(Object.keys(page.player).sort()).toEqual(['av', 'cc', 'matches', 'online', 'ranked', 'rel']);
        // nothing private: no account id, email, auth id, provider, age band, presence detail
        expect(JSON.stringify(page)).not.toMatch(/accountId|email|uid|provider|ageBand|"_id"|party|room|queue/);
    });

    it('rel reads sent / asked / none, and an invisible player reads offline', async () => {
        const { social } = harness();
        const { ctl } = controller(social);
        const c = (await ctl.theirs('PL-CCCC-CCCC', {}, req('A'), {})) as { player: Record<string, unknown> };
        expect(c.player).toMatchObject({ rel: 'sent', online: false });
        const d = (await ctl.theirs('PL-DDDD-DDDD', {}, req('A'), {})) as { player: Record<string, unknown> };
        expect(d.player).toMatchObject({ rel: 'asked', online: false });
        expect(await social.relationOf('B', 'D')).toBe('none');
        expect(await social.relationOf('B', 'B')).toBe('self');
    });

    it('caches the card body per player, never the relation', async () => {
        const { social, models } = harness();
        const card = jest.fn(async () => ({ ...CARD }));
        const { ctl } = controller(social, { card });
        await ctl.theirs('PL-DDDD-DDDD', {}, req('A'), {});
        models.friends.docs.find(e => e._id === 'A:D')!.state = 'accepted';
        const again = (await ctl.theirs('PL-DDDD-DDDD', {}, req('A'), {})) as { player: Record<string, unknown> };
        expect(card).toHaveBeenCalledTimes(1);
        expect(again.player.rel).toBe('friend');
        expect(CARD_CACHE_MS).toBeLessThanOrEqual(60_000);
    });

    it('a guest is refused (need_account); a later page carries no card', async () => {
        const { social } = harness();
        const { ctl } = controller(social);
        await expect(ctl.theirs('PL-BBBB-BBBB', {}, req('G', true), {})).rejects.toMatchObject({ status: 403 });
        const later = (await ctl.theirs('PL-BBBB-BBBB', { before: 'a'.repeat(24) }, req('A'), {})) as object;
        expect('player' in later).toBe(false);
    });
});

describe('Player Card: an end-of-match seat (GET /pawlegends/history/seat/:room/:slot)', () => {
    it('answers the seat’s last human holder as {code, name} only', async () => {
        const { social } = harness();
        const { ctl } = controller(social);
        expect(await ctl.seat('r1', '1', req('A'), {})).toEqual({ code: 'PL-BBBB-BBBB', name: 'Name B' });
        // a backfiller took slot 4: the card is theirs, not the player who left
        expect(await ctl.seat('r1', '4', req('A'), {})).toEqual({ code: 'PL-DDDD-DDDD', name: 'Name D' });
    });

    it('a bot seat, my own seat, a blocked player, an old room or a room I was not in all read as no player', async () => {
        const { social } = harness();
        const { ctl } = controller(social);
        const noPlayer = { status: 404, response: expect.objectContaining({ code: 'PAWLEGENDS_SOCIAL_NOT_FOUND' }) };
        await expect(ctl.seat('r1', '2', req('A'), {})).rejects.toMatchObject(noPlayer);
        await expect(ctl.seat('r1', '0', req('A'), {})).rejects.toMatchObject(noPlayer);
        await expect(ctl.seat('r1', '5', req('A'), {})).rejects.toMatchObject(noPlayer);
        await expect(ctl.seat('old', '1', req('A'), {})).rejects.toMatchObject(noPlayer);
        await expect(ctl.seat('r1', '1', req('Z'), {})).rejects.toMatchObject(noPlayer);
        // the answer never names a bot
        const err = await ctl.seat('r1', '2', req('A'), {}).catch(e => e);
        expect(JSON.stringify(err.response)).not.toMatch(/bot/i);
    });

    it('needs a registered account and a valid room and slot', async () => {
        const { social } = harness();
        const { ctl } = controller(social);
        await expect(ctl.seat('r1', '1', req('G', true), {})).rejects.toMatchObject({ status: 403 });
        await expect(ctl.seat('r1', '12', req('A'), {})).rejects.toMatchObject({ status: 400 });
        await expect(ctl.seat('bad room!', '1', req('A'), {})).rejects.toMatchObject({ status: 400 });
    });

    it('is a registered-only route behind the app guard (not on the guest allow list)', () => {
        const guards = Reflect.getMetadata(GUARDS_METADATA, PawlegendsHistoryController.prototype.seat) ?? [];
        expect(guards).toContain(AppAuthGuard);
        expect(Object.keys(GUEST_ALLOW_LIST)).not.toContain('GET /pawlegends/history/seat/:room/:slot');
    });
});

describe('Player Card: board rows carry codes for signed-in callers only', () => {
    it('playerCodes formats codes like the friends list; withoutCodes strips them', async () => {
        const { models } = harness();
        const codes = await playerCodes(models.social, ['B', 'nobody']);
        expect([...codes]).toEqual([['B', 'PL-BBBB-BBBB']]);
        const answer = {
            page: 0,
            rows: [
                { rank: 1, name: 'Bee', code: 'PL-BBBB-BBBB' },
                { rank: 2, name: 'Cee' },
            ],
        };
        expect(withoutCodes(answer)).toEqual({
            page: 0,
            rows: [
                { rank: 1, name: 'Bee' },
                { rank: 2, name: 'Cee' },
            ],
        });
        expect(withoutCodes({ cat: 1 })).toEqual({ cat: 1 });
    });

    it('the public board route drops codes; /me keeps them', async () => {
        const rows = [{ rank: 1, name: 'Bee', value: 3, m: 9, code: 'PL-BBBB-BBBB' }];
        const leaderboard = {
            levelBoard: jest.fn(async () => ({ period: 'all', page: 0, pages: 1, rows, me: null })),
            sidesBoard: jest.fn(),
            countryBoard: jest.fn(),
        };
        const ctl = new PawlegendsRankedController(
            {} as never,
            { consume: async () => undefined } as never,
            leaderboard as never
        );
        const pub = (await ctl.board('level', {}, {}, {})) as { rows: object[] };
        expect(pub.rows[0]).not.toHaveProperty('code');
        const mine = (await ctl.boardMe('level', {}, req('A'), {})) as { rows: object[] };
        expect(mine.rows[0]).toHaveProperty('code', 'PL-BBBB-BBBB');
    });
});
