import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { GUEST_ALLOW_LIST } from 'src/common/guards/guest-allow-list';
import type { MmRoomRecord } from '../mm/mm-room.schema';
import { readPresence } from './presence';
import {
    FRIENDS_CAP,
    formatPlayerCode,
    generatePlayerCode,
    parsePlayerCode,
    PLAYER_CODE_ALPHABET,
} from './social.contracts';
import { PawlegendsSocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialMemoryModel, TestClock } from './social-model.helper-spec';

const ACCS = ['A', 'B', 'C', 'D', 'K'];

function mmRoom(id: string, clock: TestClock): MmRoomRecord {
    const m = (slot: number, accountId: string | null) => ({
        slot,
        identityHash: `h-${slot}`,
        accountId,
        joinedTick: 0,
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
        members: [m(0, 'A'), m(1, 'B'), m(3, 'C'), m(4, 'K'), m(5, 'G')],
        outcome: 'won',
        endedAt: new Date(clock.ms - 3600_000),
        createdAt: new Date(clock.ms - 4000_000),
    };
}

function harness() {
    const clock = new TestClock();
    const now = clock.now;
    const models = {
        social: new SocialMemoryModel([], [{ fields: ['code'] }, { fields: ['_id'] }], now),
        friends: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        blocks: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        presence: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        invites: new SocialMemoryModel([], [], now),
        buyers: new SocialMemoryModel(
            [
                { key: 'account:A', ageBand: '18+' },
                { key: 'account:B', ageBand: '16-17' },
                { key: 'account:C', ageBand: '18+' },
                { key: 'account:K', ageBand: 'under16' },
            ],
            [{ fields: ['key'] }],
            now
        ),
        rooms: new SocialMemoryModel([mmRoom('r1', clock)], [], now),
        users: new SocialMemoryModel(
            [
                ...ACCS.map(id => ({ _id: id, isGuest: false, pawlegendsMatches: { hard: id === 'A' ? 12 : 2 } })),
                { _id: 'G', isGuest: true },
            ],
            [],
            now
        ),
        cats: new SocialMemoryModel([{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Mochi', owner: 'A' }], [], now),
    };
    const svc = new SocialService(
        models.social,
        models.friends,
        models.blocks,
        models.presence,
        models.invites,
        models.buyers,
        models.rooms,
        models.users,
        models.cats,
        clock
    );
    return { clock, models, svc };
}

const codeOf = async (svc: SocialService, id: string) => formatPlayerCode((await svc.profile(id)).code);

describe('pawlegends social core (SOCIAL-RANKED.md §2, §3)', () => {
    it('player codes: Crockford base32, 8 characters, typed forms parse back', () => {
        const code = generatePlayerCode();
        expect(code).toMatch(new RegExp(`^[${PLAYER_CODE_ALPHABET}]{8}$`));
        expect(formatPlayerCode('7KQ2M9XR')).toBe('PL-7KQ2-M9XR');
        expect(parsePlayerCode('pl-7kq2-m9xr')).toBe('7KQ2M9XR');
        expect(parsePlayerCode(' 7kq2 m9xr ')).toBe('7KQ2M9XR');
        expect(parsePlayerCode('OIL00000')).toBe('01100000');
        expect(parsePlayerCode('7KQ2M9X')).toBeNull();
        expect(parsePlayerCode({})).toBeNull();
    });

    it('creates the profile lazily with a unique code; under 16 starts with recent adds off', async () => {
        const { models, svc } = harness();
        const a = await svc.profile('A');
        expect(a.allowRecent).toBe(true);
        expect((await svc.profile('A')).code).toBe(a.code);
        expect((await svc.profile('K')).allowRecent).toBe(false);
        expect(new Set(models.social.docs.map(d => d.code)).size).toBe(2);
    });

    it('a request by code, then the other side requesting auto-accepts', async () => {
        const { svc } = harness();
        expect(await svc.request('A', (await svc.targetOf('A', { code: await codeOf(svc, 'B') })).id, 'code')).toEqual({
            state: 'sent',
        });
        const b = await svc.state('B');
        expect(b.requests.in).toHaveLength(1);
        expect(JSON.stringify(b)).not.toMatch(/"A"/);
        expect(await svc.request('B', 'A', 'code')).toEqual({ state: 'friends' });
        const a = await svc.state('A');
        expect(a.friends).toHaveLength(1);
        expect(a.friends[0].presence).toEqual({ state: 'offline' });
    });

    it('accept, decline and remove by code', async () => {
        const { svc } = harness();
        await svc.request('A', 'B', 'code');
        await svc.accept('B', await codeOf(svc, 'A'));
        expect((await svc.state('A')).friends).toHaveLength(1);
        await svc.remove('A', await codeOf(svc, 'B'));
        expect((await svc.state('A')).friends).toHaveLength(0);
        await svc.request('A', 'C', 'code');
        await svc.remove('C', await codeOf(svc, 'A'));
        expect((await svc.state('A')).requests.out).toHaveLength(0);
    });

    it('refuses self, guests, unknown codes, and enforces the caps', async () => {
        const { models, svc } = harness();
        await expect(svc.targetOf('A', { code: await codeOf(svc, 'A') })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_SELF' },
        });
        await expect(svc.targetOf('A', { code: 'PL-0000-0000' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_NOT_FOUND' },
        });
        await expect(svc.request('A', 'G', 'code')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_REFUSED' },
        });
        await expect(svc.request('G', 'A', 'code')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_NEED_ACCOUNT' },
        });
        for (let i = 0; i < FRIENDS_CAP; i++)
            models.friends.docs.push({ _id: `A:Z${i}`, a: 'A', b: `Z${i}`, from: 'A', state: 'accepted', via: 'code' });
        await expect(svc.request('A', 'B', 'code')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_CAP' },
        });
    });

    it('block removes the edge, hides presence both ways and refuses requests and invites', async () => {
        const { clock, models, svc } = harness();
        await svc.request('A', 'B', 'code');
        await svc.request('B', 'A', 'code');
        models.presence.docs.push({
            _id: 'B',
            relay: { state: 'party', party: 'ABCD', joinable: true, at: clock.now() },
            exp: new Date(clock.ms + 60_000),
        });
        expect((await svc.state('A')).friends[0].presence).toMatchObject({ state: 'party', party: 'ABCD' });
        await svc.block('B', { code: await codeOf(svc, 'A') });
        expect((await svc.state('A')).friends).toHaveLength(0);
        await expect(svc.request('A', 'B', 'code')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_REFUSED' },
        });
        await expect(svc.invite('B', await codeOf(svc, 'A'))).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_REFUSED' },
        });
        expect(await svc.leaderBlocked('B', 'A')).toBe(true);
        expect((await svc.state('B')).blocks).toHaveLength(1);
        await svc.unblock('B', await codeOf(svc, 'A'));
        expect(await svc.leaderBlocked('B', 'A')).toBe(false);
    });

    it('recent players: no account ids, canAdd honours bands, guests, bots and friends', async () => {
        const { svc } = harness();
        await svc.request('A', 'C', 'code');
        const { players } = await svc.recent('A');
        expect(JSON.stringify(players)).not.toMatch(/"(B|C|K|G)"/);
        const bySlot = new Map(players.map(p => [p.slot, p]));
        expect(bySlot.get(1)).toMatchObject({ team: 'ally', canAdd: true });
        expect(bySlot.get(3)).toMatchObject({ team: 'foe', canAdd: false }); // pending already
        expect(bySlot.get(4)).toMatchObject({ canAdd: false }); // under 16
        expect(bySlot.get(5)).toMatchObject({ canAdd: false }); // guest
        expect(bySlot.has(2)).toBe(false); // bot seat
        expect((await svc.request('A', (await svc.targetOf('A', { room: 'r1', slot: 1 })).id, 'recent')).state).toBe(
            'sent'
        );
        // under 16 can neither send nor receive from recent
        await expect(svc.request('K', 'A', 'recent')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_REFUSED' },
        });
        await expect(svc.request('C', 'K', 'recent')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_REFUSED' },
        });
        // but by code works (real-life contact)
        expect((await svc.request('K', 'C', 'code')).state).toBe('sent');
        await expect(svc.targetOf('D', { room: 'r1', slot: 1 })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_NOT_FOUND' },
        });
    });

    it('recent players: a backfilled slot lists only the player Add and Block would reach', async () => {
        const { svc, models } = harness();
        // B left slot 1 and D backfilled it at tick 900
        models.rooms.docs[0].members.push({
            slot: 1,
            identityHash: 'h-d',
            accountId: 'D',
            joinedTick: 900,
            backfill: true,
            ratingAtStart: null,
        });
        const { players } = await svc.recent('A');
        expect(players.filter(p => p.slot === 1)).toHaveLength(1);
        expect((await svc.targetOf('A', { room: 'r1', slot: 1 })).id).toBe('D');
    });

    it('settings: a cat name only of your own cat, allowRecent forced off for under 16, age stricter wins', async () => {
        const { svc } = harness();
        const me = await svc.setMe('A', { name: 'aaaaaaaaaaaaaaaaaaaaaaaa', invisible: true });
        expect(me.me).toMatchObject({ name: 'Mochi', invisible: true });
        await expect(svc.setMe('B', { name: 'aaaaaaaaaaaaaaaaaaaaaaaa' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVALID' },
        });
        await expect(svc.setMe('B', { name: 'Free text' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVALID' },
        });
        expect((await svc.setMe('K', { allowRecent: true })).me.allowRecent).toBe(false);
        expect(await svc.setAge('A', 'under16')).toEqual({ ageBand: 'under16' });
        expect(await svc.setAge('A', '18+')).toEqual({ ageBand: 'under16' });
        expect((await svc.profile('A')).allowRecent).toBe(false);
    });

    it('rotates the code at most 3 times a day', async () => {
        const { clock, svc } = harness();
        const first = await codeOf(svc, 'A');
        const seen = new Set([first]);
        for (let i = 0; i < 3; i++) seen.add((await svc.rotateCode('A')).code);
        expect(seen.size).toBe(4);
        await expect(svc.rotateCode('A')).rejects.toMatchObject({ response: { code: 'PAWLEGENDS_SOCIAL_LIMIT' } });
        clock.advance(86_400_000);
        await expect(svc.rotateCode('A')).resolves.toBeTruthy();
    });

    it('invites need a joinable party (relay presence) and an accepted friend; the target sees them', async () => {
        const { clock, models, svc } = harness();
        await svc.request('A', 'B', 'code');
        await svc.request('B', 'A', 'code');
        await expect(svc.invite('A', await codeOf(svc, 'B'))).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_NO_PARTY' },
        });
        models.presence.docs.push({
            _id: 'A',
            relay: { state: 'party', party: 'WXYZ', joinable: true, at: clock.now() },
            exp: new Date(clock.ms + 60_000),
        });
        await svc.invite('A', await codeOf(svc, 'B'));
        await expect(svc.invite('A', await codeOf(svc, 'B'))).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_LIMIT' },
        });
        const b = await svc.state('B');
        expect(b.invites).toEqual([
            expect.objectContaining({ party: 'WXYZ', from: expect.objectContaining({ code: await codeOf(svc, 'A') }) }),
        ]);
        clock.advance(4 * 60_000);
        expect((await svc.state('B')).invites).toEqual([]);
    });
});

describe('pawlegends presence (SOCIAL-RANKED.md §4)', () => {
    it('read precedence: fresh relay > fresh api > offline; invisible is offline', () => {
        const now = Date.UTC(2026, 10, 12);
        const at = (ago: number) => new Date(now - ago);
        expect(
            readPresence({ _id: 'x', relay: { state: 'match', at: at(10_000) }, api: { at: at(1000) } }, now)
        ).toEqual({
            state: 'match',
        });
        expect(
            readPresence({ _id: 'x', relay: { state: 'match', at: at(100_000) }, api: { at: at(1000) } }, now)
        ).toEqual({
            state: 'online',
        });
        expect(readPresence({ _id: 'x', api: { at: at(130_000) } }, now)).toEqual({ state: 'offline' });
        expect(readPresence({ _id: 'x', api: { at: at(1000) } }, now, true)).toEqual({ state: 'offline' });
        expect(readPresence(null, now)).toEqual({ state: 'offline' });
    });

    it('the pulse writes api.at at most once a minute (exp with $max, rk from saved matches) and answers unchanged', async () => {
        const { clock, models, svc } = harness();
        const first = await svc.pulse('A', undefined);
        expect(first.changed).toBe(true);
        expect(models.presence.docs[0]).toMatchObject({ _id: 'A', rk: 1, api: { at: clock.now() } });
        const rev = (first as { rev: string }).rev;
        clock.advance(30_000);
        expect(await svc.pulse('A', rev)).toEqual({ changed: false });
        expect(models.presence.calls.filter(c => c === 'updateOne')).toHaveLength(1);
        clock.advance(31_000);
        await svc.pulse('A', rev);
        expect(models.presence.calls.filter(c => c === 'updateOne')).toHaveLength(2);
        // a friend coming online changes the token
        await svc.request('A', 'B', 'code');
        await svc.request('B', 'A', 'code');
        const r2 = (await svc.pulse('A', rev)) as { rev: string };
        models.presence.docs.push({ _id: 'B', api: { at: clock.now() }, exp: new Date(clock.ms + 60_000) });
        expect((await svc.pulse('A', r2.rev)).changed).toBe(true);
    });

    it('routes are registered-only (no @AllowGuest)', () => {
        const proto = PawlegendsSocialController.prototype as any;
        for (const name of [
            'state',
            'pulse',
            'request',
            'accept',
            'decline',
            'remove',
            'block',
            'unblock',
            'setMe',
            'rotate',
            'recent',
            'invite',
            'age',
        ])
            expect(Reflect.getMetadata(GUARDS_METADATA, proto[name])).toEqual([AppAuthGuard]);
        expect(Object.keys(GUEST_ALLOW_LIST).filter(k => k.includes('/pawlegends/social'))).toEqual([]);
    });
});
