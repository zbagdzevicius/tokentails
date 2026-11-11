import { deleteAccount } from 'src/user/guest/account-deletion';
import { purgePawlegendsSocial, SOCIAL_PURGE_COLLECTIONS } from './social-purge';
import { SocialMemoryModel } from './social-model.helper-spec';

/*
 * Account deletion of the Pawlegends social and chat rows (CHAT-AVATARS.md §2.8, §10 #7): the account's messages, its
 * DM threads with every message in them, its party memberships, its profile (avatar, cooldown), friendships, blocks,
 * presence and invites; friends get a rev bump. Other accounts' rows stay.
 */

function db() {
    const cols: Record<string, SocialMemoryModel> = {};
    for (const name of Object.values(SOCIAL_PURGE_COLLECTIONS))
        cols[name] = new SocialMemoryModel([], [{ fields: ['_id'] }]);
    const wrap = (m: SocialMemoryModel) => ({
        deleteMany: (f: Record<string, unknown>) => m.deleteMany(f),
        updateMany: (f: Record<string, unknown>, u: Record<string, unknown>) => m.updateMany(f, u),
        find: (f: Record<string, unknown>) => ({ toArray: () => m.find(f).lean().exec() }),
    });
    return { cols, db: { collection: (name: string) => wrap(cols[name]) } };
}

describe('purgePawlegendsSocial', () => {
    it('removes the account everywhere and keeps everyone else', async () => {
        const { cols, db: d } = db();
        const c = SOCIAL_PURGE_COLLECTIONS;
        await cols[c.social].create({
            _id: 'X',
            code: 'XXXXXXXX',
            rev: 0,
            avatar: { kind: 'hero', hero: 'clem' },
            chatCooldownUntil: new Date(),
        });
        await cols[c.social].create({ _id: 'F', code: 'FFFFFFFF', rev: 0 });
        await cols[c.friends].create({ _id: 'F:X', a: 'F', b: 'X', state: 'accepted' });
        await cols[c.friends].create({ _id: 'F:G', a: 'F', b: 'G', state: 'accepted' });
        await cols[c.blocks].create({ _id: 'X:Z', blocker: 'X', blocked: 'Z' });
        await cols[c.blocks].create({ _id: 'Z:X', blocker: 'Z', blocked: 'X' });
        await cols[c.presence].create({ _id: 'X' });
        await cols[c.invites].create({ _id: 'i1', from: 'X', to: 'F' });
        await cols[c.threads].create({ _id: 'dXF', kind: 'dm', members: ['F', 'X'] });
        await cols[c.threads].create({ _id: 'dFG', kind: 'dm', members: ['F', 'G'] });
        await cols[c.threads].create({
            _id: 'pP',
            kind: 'party',
            members: ['F', 'X', 'G'],
            muted: ['X'],
            read: { X: new Date(), F: new Date() },
        });
        await cols[c.messages].create({ _id: 'm1', thread: 'dXF', from: 'F', k: 'q', id: 0 });
        await cols[c.messages].create({ _id: 'm2', thread: 'dXF', from: 'X', k: 't', text: 'hi' });
        await cols[c.messages].create({ _id: 'm3', thread: 'pP', from: 'X', k: 'q', id: 12 });
        await cols[c.messages].create({ _id: 'm4', thread: 'pP', from: 'G', k: 'q', id: 12 });
        await cols[c.messages].create({ _id: 'm5', thread: 'dFG', from: 'F', k: 'q', id: 0 });

        expect(await purgePawlegendsSocial(d, 'X')).toEqual({ threads: 1 });
        expect(cols[c.messages].docs.map(m => m._id).sort()).toEqual(['m4', 'm5']);
        expect(cols[c.threads].docs.map(t => t._id).sort()).toEqual(['dFG', 'pP']);
        const party = cols[c.threads].docs.find(t => t._id === 'pP')!;
        expect(party.members).toEqual(['F', 'G']);
        expect(party.muted).toEqual([]);
        expect(Object.keys(party.read)).toEqual(['F']);
        expect(cols[c.social].docs.map(p => p._id)).toEqual(['F']);
        expect(cols[c.social].docs[0].rev).toBe(1);
        expect(cols[c.friends].docs.map(e => e._id)).toEqual(['F:G']);
        expect(cols[c.blocks].docs).toHaveLength(0);
        expect(cols[c.presence].docs).toHaveLength(0);
        expect(cols[c.invites].docs).toHaveLength(0);
    });

    it('deleteAccount calls the purge, and a purge failure never fails the deletion', async () => {
        const ids: string[] = [];
        const id = '0123456789abcdef01234567';
        const deps = (purge: (a: string) => Promise<unknown>) => ({
            users: {
                findOne: () => ({ lean: async () => ({ _id: id, isGuest: false }) }),
                updateOne: async () => ({}),
            } as any,
            cats: {
                deleteMany: async () => ({}),
                find: () => ({ lean: async () => [] }),
                updateMany: async () => ({}),
            } as any,
            firebase: { deleteUsers: async () => 0 } as any,
            audit: { insertOne: async () => ({}) },
            revokeApple: async () => 'skipped' as any,
            purgeSocial: purge,
        });
        await deleteAccount(
            deps(async a => void ids.push(a)),
            id
        );
        expect(ids).toEqual([id]);
        await expect(
            deleteAccount(
                deps(async () => {
                    throw new Error('db down');
                }),
                id
            )
        ).resolves.toMatchObject({ success: true });
    });
});
