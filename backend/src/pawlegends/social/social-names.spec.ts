import { NicknameService } from './nickname.service';
import { SocialService } from './social.service';
import { SocialMemoryModel, TestClock } from './social-model.helper-spec';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import { readPresence } from './presence';

/*
 * Friends by nickname (SOCIAL-INVITES.md): suggestions while typing and Add by the exact name. Only chosen nicknames
 * are found (unique, case- and look-alike-insensitive), never the caller, a blocked player or a guest, and an answer
 * never carries a player code or an account id. The fast inbox keeps a player on any menu "online" for friends.
 */

function harness() {
    const clock = new TestClock();
    const now = clock.now;
    const m = {
        social: new SocialMemoryModel(
            [],
            [
                { fields: ['code'] },
                { fields: ['_id'] },
                { fields: ['nickKey'], partial: { nickKey: { $exists: true } } },
            ],
            now
        ),
        friends: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        blocks: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        presence: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        users: new SocialMemoryModel(
            [...['me', 'z1', 'z2', 'z3', 'blk'].map(_id => ({ _id, isGuest: false })), { _id: 'gst', isGuest: true }],
            [],
            now
        ),
        empty: () => new SocialMemoryModel([], [], now),
    };
    const svc = new SocialService(
        m.social,
        m.friends,
        m.blocks,
        m.presence,
        m.empty(),
        m.empty(),
        m.empty(),
        m.users,
        m.empty(),
        clock
    );
    const names = new NicknameService(
        svc,
        new MemoryModel([], [{ fields: ['_id'] }], now),
        new MemoryModel([], [{ fields: ['accountId', 'ref'] }], now),
        clock
    );
    return { clock, m, svc, names };
}

describe('friends by nickname (SOCIAL-INVITES.md)', () => {
    it('suggests nicknames by prefix, case- and look-alike-insensitive; never self, blocked, guests or codes', async () => {
        const { svc, names, m } = harness();
        await names.change('me', { name: 'Zed' });
        await names.change('z1', { name: 'zygis' });
        await names.change('z2', { name: 'Zygimantas' });
        await names.change('z3', { name: 'Mira' });
        await names.change('blk', { name: 'Zylo' });
        await names.change('gst', { name: 'Zyra' });
        await m.blocks.create({ _id: 'blk:me', blocker: 'blk', blocked: 'me' });
        const r = await svc.search('me', 'ZY');
        expect(r.players.map(p => p.name)).toEqual(['Zygimantas', 'zygis']);
        expect(JSON.stringify(r)).not.toMatch(/PL-|"z1"|"z2"|code/);
        expect((await svc.search('me', 'Z')).players).toEqual([]);
        expect((await svc.search('me', 'Ze')).players).toEqual([]);
        await expect(svc.search('me', 'x'.repeat(41))).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_INVALID' },
        });
        // a friendship shows as `rel`
        await svc.request('me', 'z1', 'code');
        expect((await svc.search('me', 'zygis')).players).toEqual([
            expect.objectContaining({ name: 'zygis', rel: 'sent' }),
        ]);
    });

    it('Add by the exact nickname (any case); an unknown or generated name is "no player with this name"', async () => {
        const { svc, names } = harness();
        await names.change('z1', { name: 'zygis' });
        expect(await svc.targetOf('me', { name: 'ZYGIS' })).toEqual({ id: 'z1', via: 'name' });
        await expect(svc.targetOf('me', { name: 'zygi' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_NO_NAME' },
        });
        await names.change('me', { name: 'Zed' });
        await expect(svc.targetOf('me', { name: 'zed' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_SOCIAL_SELF' },
        });
        const t = await svc.targetOf('me', { name: 'zygis' });
        expect(await svc.request('me', t.id, t.via)).toEqual({ state: 'sent' });
    });

    it('the fast inbox marks the player online for friends (a friend on Heroes or Recordings can be invited)', async () => {
        const { svc, m, clock } = harness();
        await svc.profile('z1');
        await svc.inbox('z1', undefined);
        const row = m.presence.docs.find(d => d._id === 'z1');
        expect(readPresence(row as any, clock.now().getTime()).state).toBe('online');
    });
});
