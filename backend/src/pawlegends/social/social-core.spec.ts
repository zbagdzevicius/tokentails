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

    it('recent rows carry when, the queue, my result and how often we played together', async () => {
        const { clock, svc } = harness();
        const { players } = await svc.recent('A');
        const b = players.find(p => p.slot === 1)!;
        // r1: team 0 won; A sits on team 0, so A won with B (ally) and against C (slot 3, team 1)
        expect(b).toMatchObject({ queue: 'casual', won: true, together: 1, at: clock.ms - 4000_000 });
        expect(players.find(p => p.slot === 3)).toMatchObject({ won: true });
        const { players: asC } = await svc.recent('C');
        expect(asC.find(p => p.slot === 0)).toMatchObject({ won: false });
    });

    it('away, a preset status note and favourites: friends see away and the note, favourites stay mine', async () => {
        const { clock, models, svc } = harness();
        await svc.request('A', 'B', 'code');
        await svc.request('B', 'A', 'code');
        const bCode = await codeOf(svc, 'B');
        // Away and a note: validated (a boolean, an index into the preset list or null)
        await expect(svc.setMe('B', { away: 'yes' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVALID' },
        });
        await expect(svc.setMe('B', { note: 99 })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVALID' },
        });
        await expect(svc.setMe('B', { note: 'Free text' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVALID' },
        });
        const meB = await svc.setMe('B', { away: true, note: 2 });
        expect(meB.me).toMatchObject({ away: true, note: 2 });
        // offline: no away flag and no note
        let fr = (await svc.state('A')).friends.find(f => f.code === bCode)!;
        expect(fr.presence).toEqual({ state: 'offline' });
        expect(fr).not.toHaveProperty('note');
        // online in the menus: Away and the note
        models.presence.docs.push({ _id: 'B', api: { at: clock.now() }, exp: new Date(clock.ms + 60_000) });
        fr = (await svc.state('A')).friends.find(f => f.code === bCode)!;
        expect(fr.presence).toEqual({ state: 'online', away: true });
        expect(fr).toMatchObject({ note: 2 });
        // in a lobby: the lobby wins over Away
        models.presence.docs[models.presence.docs.length - 1].relay = {
            state: 'party',
            party: 'P1',
            joinable: true,
            at: clock.now(),
        };
        fr = (await svc.state('A')).friends.find(f => f.code === bCode)!;
        expect(fr.presence.away).toBeUndefined();
        await svc.setMe('B', { note: null, away: false });
        expect((await svc.state('A')).friends.find(f => f.code === bCode)).not.toHaveProperty('note');
        // a request row says when it was made
        await svc.request('C', 'A', 'code');
        expect((await svc.state('A')).requests.in[0]).toMatchObject({ at: clock.ms });
        // favourites: an accepted friend only, by code; the friend never sees it
        const pin = await svc.setMe('A', { fav: { code: bCode, on: true } });
        expect(pin.friends.find(f => f.code === bCode)).toMatchObject({ fav: true });
        expect((await svc.state('B')).friends.every(f => !('fav' in f))).toBe(true);
        await expect(svc.setMe('A', { fav: { code: await codeOf(svc, 'C'), on: true } })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_REFUSED' },
        });
        await expect(svc.setMe('A', { fav: { code: bCode } })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVALID' },
        });
        const unpin = await svc.setMe('A', { fav: { code: bCode, on: false } });
        expect(unpin.friends.find(f => f.code === bCode)).not.toHaveProperty('fav');
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

    it('gaps5: a Ranked duo invite carries mode ranked to the friend; any other mode is a plain invite', async () => {
        const { clock, models, svc } = harness();
        await svc.request('A', 'B', 'code');
        await svc.request('B', 'A', 'code');
        await svc.request('A', 'C', 'code');
        await svc.request('C', 'A', 'code');
        models.presence.docs.push({
            _id: 'A',
            relay: { state: 'party', party: 'WXYZ', joinable: true, at: clock.now() },
            exp: new Date(clock.ms + 60_000),
        });
        await svc.invite('A', await codeOf(svc, 'B'), 'ranked');
        await svc.invite('A', await codeOf(svc, 'C'), 'hax');
        expect((await svc.state('B')).invites).toEqual([expect.objectContaining({ party: 'WXYZ', mode: 'ranked' })]);
        const c = (await svc.state('C')).invites as Array<Record<string, unknown>>;
        expect(c).toHaveLength(1);
        expect(c[0].mode).toBeUndefined();
    });
});

describe('pawlegends invites, LoL style (SOCIAL-INVITES.md)', () => {
    async function friendsInParty() {
        const h = harness();
        await h.svc.request('A', 'B', 'code');
        await h.svc.request('B', 'A', 'code');
        h.models.presence.docs.push({
            _id: 'A',
            relay: { state: 'party', party: 'WXYZ', joinable: true, at: h.clock.now() },
            exp: new Date(h.clock.ms + 60_000),
        });
        return h;
    }

    it('an invite lives 60 s, carries the sim build and the time left, and says when the friend is offline', async () => {
        const { clock, models, svc } = await friendsInParty();
        const sent = await svc.invite('A', await codeOf(svc, 'B'), undefined, '33.abc123def4');
        expect(sent).toEqual(expect.objectContaining({ ok: true, ttl: 60_000, offline: true }));
        expect(sent.id).toMatch(/^[a-f0-9]{24}$/);
        const inv = (await svc.state('B')).invites as Array<Record<string, unknown>>;
        expect(inv).toEqual([
            expect.objectContaining({ id: sent.id, party: 'WXYZ', sim: '33.abc123def4', ttl: 60_000 }),
        ]);
        // a bad sim is dropped, never stored
        expect(models.invites.docs.every(d => d.sim === undefined || /^\d+\./.test(d.sim))).toBe(true);
        clock.advance(61_000);
        expect((await svc.state('B')).invites).toEqual([]);
        // once expired, the same friend can be invited again at once
        models.presence.docs[0].relay.at = clock.now();
        await expect(svc.invite('A', await codeOf(svc, 'B'), undefined, '<script>')).resolves.toMatchObject({
            ok: true,
        });
        expect(models.invites.docs[1].sim).toBeUndefined();
    });

    it('an online friend: no offline flag', async () => {
        const { clock, models, svc } = await friendsInParty();
        models.presence.docs.push({ _id: 'B', api: { at: clock.now() }, exp: new Date(clock.ms + 60_000) });
        const sent = await svc.invite('A', await codeOf(svc, 'B'));
        expect(sent.offline).toBeUndefined();
    });

    it('accept answers the party code once; the inviter sees the answer once in the inbox', async () => {
        const { svc } = await friendsInParty();
        const { id } = await svc.invite('A', await codeOf(svc, 'B'));
        const before = await svc.inbox('A', undefined);
        expect(before.changed).toBe(true);
        await expect(svc.answerInvite('B', id, 'accept')).resolves.toEqual({ ok: true, party: 'WXYZ' });
        // answered: gone from the toasts, a second accept is refused
        expect((await svc.state('B')).invites).toEqual([]);
        await expect(svc.answerInvite('B', id, 'accept')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVITE_GONE' },
        });
        const a1 = await svc.inbox('A', (before as { rev: string }).rev);
        expect(a1).toEqual(
            expect.objectContaining({ changed: true, answers: [expect.objectContaining({ id, answer: 'accepted' })] })
        );
        expect(JSON.stringify(a1)).not.toMatch(/"B"/);
        const a2 = await svc.inbox('A', undefined);
        expect((a2 as { answers: unknown[] }).answers).toEqual([]);
    });

    it('decline: always ok, the inviter learns it, and only the invited friend can answer', async () => {
        const { svc } = await friendsInParty();
        const { id } = await svc.invite('A', await codeOf(svc, 'B'));
        await expect(svc.answerInvite('C', id, 'accept')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVITE_GONE' },
        });
        await expect(svc.answerInvite('B', id, 'decline')).resolves.toEqual({ ok: true });
        await expect(svc.answerInvite('B', id, 'decline')).resolves.toEqual({ ok: true });
        const inbox = (await svc.inbox('A', undefined)) as { answers: Array<{ answer: string; name: string }> };
        expect(inbox.answers).toEqual([expect.objectContaining({ answer: 'declined' })]);
        expect(typeof inbox.answers[0].name).toBe('string');
        await expect(svc.answerInvite('B', 'nope', 'accept')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVALID' },
        });
        await expect(svc.answerInvite('B', id, 'maybe')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVALID' },
        });
    });

    it('accepting an expired invite is refused (410)', async () => {
        const { clock, svc } = await friendsInParty();
        const { id } = await svc.invite('A', await codeOf(svc, 'B'));
        clock.advance(60_001);
        await expect(svc.answerInvite('B', id, 'accept')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVITE_GONE' },
            status: 410,
        });
    });

    it('the inbox: one read while nothing changed, then the invite; a DM-style rev bump wakes it too', async () => {
        const { models, svc } = await friendsInParty();
        const first = (await svc.inbox('B', undefined)) as { changed: true; rev: string; invites: unknown[] };
        expect(first.changed).toBe(true);
        expect(await svc.inbox('B', first.rev)).toEqual({ changed: false });
        await svc.invite('A', await codeOf(svc, 'B'));
        const next = (await svc.inbox('B', first.rev)) as {
            changed: true;
            rev: string;
            invites: Array<{ party: string }>;
        };
        expect(next.changed).toBe(true);
        expect(next.invites).toEqual([expect.objectContaining({ party: 'WXYZ' })]);
        await models.social.updateOne({ _id: 'B' }, { $inc: { rev: 1 } });
        expect((await svc.inbox('B', next.rev)).changed).toBe(true);
        // a player with no social row yet: empty, no write
        const before = models.social.docs.length;
        expect(await svc.inbox('D', undefined)).toEqual({ changed: true, rev: 'i0', invites: [], answers: [] });
        expect(models.social.docs.length).toBe(before);
    });

    it('a block after the invite: the toast is gone and accept is refused', async () => {
        const { svc } = await friendsInParty();
        const { id } = await svc.invite('A', await codeOf(svc, 'B'));
        await svc.block('A', { code: await codeOf(svc, 'B') });
        expect((await svc.state('B')).invites).toEqual([]);
        await expect(svc.answerInvite('B', id, 'accept')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVITE_GONE' },
        });
    });
});

describe('pawlegends invite routes (SOCIAL-INVITES.md)', () => {
    function routes() {
        const h = harness();
        const hits = new Map<string, number>();
        const storage = {
            increment: async (key: string) => {
                hits.set(key, (hits.get(key) ?? 0) + 1);
                return { totalHits: hits.get(key)!, timeToExpire: 60 };
            },
        };
        const ctl = new PawlegendsSocialController(h.svc, { consume: async () => undefined } as any, storage as any);
        const res = () => {
            const r: any = { code: 200, headers: {} };
            r.status = (c: number) => ((r.code = c), r);
            r.header = (k: string, v: unknown) => (r.headers[k] = v);
            return r;
        };
        return { ...h, ctl, res };
    }

    it('the inbox answers 204 while nothing changed, then the invite and an empty chat badge', async () => {
        const { ctl, res, svc, models, clock } = routes();
        await svc.request('A', 'B', 'code');
        await svc.request('B', 'A', 'code');
        const r1 = res();
        const first = (await ctl.inbox(undefined as any, { user: { _id: 'B' } }, r1)) as any;
        expect(r1.code).toBe(200);
        const r2 = res();
        expect(await ctl.inbox(first.rev, { user: { _id: 'B' } }, r2)).toBeUndefined();
        expect(r2.code).toBe(204);
        models.presence.docs.push({
            _id: 'A',
            relay: { state: 'party', party: 'WXYZ', joinable: true, at: clock.now() },
            exp: new Date(clock.ms + 60_000),
        });
        await ctl.invite({ to: await codeOf(svc, 'B'), sim: '33.abcdef12' }, { user: { _id: 'A' } }, res());
        const out = (await ctl.inbox(first.rev, { user: { _id: 'B' } }, res())) as any;
        expect(out.invites).toEqual([expect.objectContaining({ party: 'WXYZ', sim: '33.abcdef12' })]);
        expect(out.chat).toEqual({ unread: 0 });
        expect(out.answers).toEqual([]);
        const answered = await ctl.answer(out.invites[0].id, { answer: 'accept' }, { user: { _id: 'B' } }, res());
        expect(answered).toEqual({ ok: true, party: 'WXYZ' });
    });

    it('guests and transient callers are refused; the inbox has its own per-account bucket (40 a minute)', async () => {
        const { ctl, res } = routes();
        await expect(ctl.inbox('x', { user: { _id: 'G', isGuest: true } }, res())).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_NEED_ACCOUNT' },
        });
        for (let i = 0; i < 40; i++) await ctl.inbox('x', { user: { _id: 'C' } }, res());
        const r = res();
        await expect(ctl.inbox('x', { user: { _id: 'C' } }, r)).rejects.toThrow();
        expect(r.headers['Retry-After']).toBe(60);
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
            'inbox',
            'answer',
        ])
            expect(Reflect.getMetadata(GUARDS_METADATA, proto[name])).toEqual([AppAuthGuard]);
        expect(Object.keys(GUEST_ALLOW_LIST).filter(k => k.includes('/pawlegends/social'))).toEqual([]);
    });
});
