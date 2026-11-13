import { CHAT_MESSAGES_COLLECTION, CHAT_THREADS_COLLECTION } from './chat.schema';

/*
 * Account deletion of the Pawlegends social rows (CHAT-AVATARS.md §2.8, §10 #7): called by `deleteAccount`
 * (user/guest/account-deletion.ts). Removes every chat message the account sent, every DM thread it is in with all of
 * that thread's messages, its party-thread memberships, and its social profile (code, name choice, avatar, cooldown),
 * friendships, blocks either way, presence and invites either way. Friends get a rev bump so their next pulse drops the
 * row. Reports keep their 180-day evidence (the reporter id stays until expiry, as for every report).
 */

export interface PurgeCollection {
    deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount?: number } | unknown>;
    updateMany(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>;
    find(filter: Record<string, unknown>, options?: Record<string, unknown>): { toArray(): Promise<any[]> };
}

export interface PurgeDb {
    collection(name: string): PurgeCollection;
}

export const SOCIAL_PURGE_COLLECTIONS = Object.freeze({
    social: 'pawlegendssocial',
    friends: 'pawlegendsfriends',
    blocks: 'pawlegendsblocks',
    presence: 'pawlegendspresence',
    invites: 'pawlegendsinvites',
    threads: CHAT_THREADS_COLLECTION,
    messages: CHAT_MESSAGES_COLLECTION,
    // CLUBS-KUDOS.md: the club seat (the club's size drops by one) and the kudos the account gave or got
    clubMembers: 'pawlegendsclubmembers',
    clubs: 'pawlegendsclubs',
    kudos: 'pawlegendskudos',
});

export async function purgePawlegendsSocial(db: PurgeDb, accountIdIn: unknown): Promise<{ threads: number }> {
    const id = String(accountIdIn);
    const c = (name: keyof typeof SOCIAL_PURGE_COLLECTIONS) => db.collection(SOCIAL_PURGE_COLLECTIONS[name]);

    // chat: DM threads with all their messages, the account's messages anywhere, party memberships
    const dms = await c('threads')
        .find({ members: id, kind: 'dm' }, { projection: { _id: 1 } })
        .toArray();
    const dmIds = dms.map(t => t._id);
    if (dmIds.length) {
        await c('messages').deleteMany({ thread: { $in: dmIds } });
        await c('threads').deleteMany({ _id: { $in: dmIds } });
    }
    await c('messages').deleteMany({ from: id });
    await c('threads').updateMany(
        { members: id },
        { $pull: { members: id, muted: id }, $unset: { [`read.${id}`]: 1 } }
    );

    // friends see the row vanish on their next pulse
    const edges = await c('friends')
        .find({ $or: [{ a: id }, { b: id }] }, { projection: { a: 1, b: 1 } })
        .toArray();
    const others = [...new Set(edges.map(e => (e.a === id ? e.b : e.a)))];
    if (others.length) await c('social').updateMany({ _id: { $in: others } }, { $inc: { rev: 1 } });
    await c('friends').deleteMany({ $or: [{ a: id }, { b: id }] });
    await c('blocks').deleteMany({ $or: [{ blocker: id }, { blocked: id }] });
    await c('invites').deleteMany({ $or: [{ from: id }, { to: id }] });
    const seat = await c('clubMembers')
        .find({ _id: id }, { projection: { club: 1 } })
        .toArray();
    if (seat[0]?.club) await c('clubs').updateMany({ _id: seat[0].club }, { $inc: { size: -1 } });
    await c('clubMembers').deleteMany({ _id: id });
    await c('kudos').deleteMany({ $or: [{ from: id }, { to: id }] });
    await c('presence').deleteMany({ _id: id });
    await c('social').deleteMany({ _id: id });
    return { threads: dmIds.length };
}
