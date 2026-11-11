import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Cat } from 'src/cat/cat.schema';
import { User } from 'src/user/user.schema';
import { PawlegendsMmRoom } from '../mm/mm-room.schema';
import type { MmRoomRecord } from '../mm/mm-room.schema';
import { playedOf } from '../mm/rating.schema';
import { AgeBand, isAgeBand, stricterBand } from '../pawlegends.contracts';
import { pawlegendsError } from '../pawlegends.errors';
import { PawlegendsBuyer, PawlegendsOwned } from '../pawlegends.schema';
import type { AvatarView } from '../../shared-contracts/chat';
import { checkAvatarChoice, liveHeroIds, resolveAvatars } from './avatar';
import { ChatService } from './chat.service';
import { RANKED_MIN_MATCHES } from '../ranked/tiers';
import { displayNames } from './display-name';
import { PresenceRow, presenceUpdate, PresenceView, readPresence } from './presence';
import {
    BLOCKS_CAP,
    CODE_ROTATIONS_PER_DAY,
    formatPlayerCode,
    FRIENDS_CAP,
    generatePlayerCode,
    INVITE_TTL_MS,
    pairId,
    parsePlayerCode,
    PENDING_OUT_CAP,
    PENDING_TTL_DAYS,
    PRESENCE,
    RECENT_DAYS,
    RECENT_ROOMS,
    REQUESTS_PER_DAY,
} from './social.contracts';
import {
    PawlegendsBlock,
    PawlegendsFriend,
    PawlegendsInvite,
    PawlegendsPresence,
    PawlegendsSocial,
} from './social.schema';

/*
 * Friends, blocks, recent players, invites and the API side of presence (SOCIAL-RANKED.md §2–§5, lane L2). Registered
 * accounts only: guests get 403 PAWLEGENDS_NEED_ACCOUNT. Clients only ever see player codes and display names, never an
 * account id; a request "from recent" names a (room, slot), resolved here. No free text exists: the only input is the
 * 8-character code.
 */

const DAY = 86_400_000;
type AnyModel = any;

type Via = 'code' | 'recent' | 'party';

export const SOCIAL_ERRORS = {
    needAccount: () => pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', 'Sign in to add friends'),
    invalid: (m: string) => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_SOCIAL_INVALID', m),
    notFound: () => pawlegendsError(HttpStatus.NOT_FOUND, 'PAWLEGENDS_SOCIAL_NOT_FOUND', 'No player with this code'),
    self: () => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_SOCIAL_SELF', 'That is your own code'),
    cap: (what: string) => pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_SOCIAL_CAP', `${what} limit reached`),
    refused: () => pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_SOCIAL_REFUSED', 'This player cannot be added'),
    limit: () =>
        pawlegendsError(HttpStatus.TOO_MANY_REQUESTS, 'PAWLEGENDS_SOCIAL_LIMIT', 'Too many requests, try later'),
    noParty: () => pawlegendsError(HttpStatus.CONFLICT, 'PAWLEGENDS_SOCIAL_NO_PARTY', 'Open a party first'),
};

export interface SocialProfile {
    _id: string;
    code: string;
    name: { kind: 'generated' } | { kind: 'cat'; catId: string };
    invisible: boolean;
    allowRecent: boolean;
    rev: number;
    rotations?: { day: string; n: number } | null;
}

interface Edge {
    _id: string;
    a: string;
    b: string;
    from: string;
    state: 'pending' | 'accepted';
    via: Via;
}

const other = (e: Pick<Edge, 'a' | 'b'>, me: string) => (e.a === me ? e.b : e.a);
const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const recentOk = (band: string | null) => band === '16-17' || band === '18+';

@Injectable()
export class SocialService {
    /** accountId → last api.at write (ms): the pulse writes at most once a minute per account. */
    private readonly pulseWrites = new Map<string, number>();

    constructor(
        @InjectModel(PawlegendsSocial.name) readonly social: AnyModel,
        @InjectModel(PawlegendsFriend.name) readonly friends: AnyModel,
        @InjectModel(PawlegendsBlock.name) readonly blocks: AnyModel,
        @InjectModel(PawlegendsPresence.name) readonly presence: AnyModel,
        @InjectModel(PawlegendsInvite.name) readonly invites: AnyModel,
        @InjectModel(PawlegendsBuyer.name) readonly buyers: AnyModel,
        @InjectModel(PawlegendsMmRoom.name) readonly rooms: AnyModel,
        @InjectModel(User.name) readonly users: AnyModel,
        @Optional() @InjectModel(Cat.name) readonly cats?: AnyModel,
        @Optional() private readonly clock?: { now(): Date },
        @Optional() @InjectModel(PawlegendsOwned.name) readonly owned?: AnyModel,
        @Optional() private readonly chat?: ChatService
    ) {}

    /** Avatars of these accounts (CHAT-AVATARS.md §7): checked against what each still owns, default hero otherwise. */
    async avatarsOf(ids: readonly string[]): Promise<Map<string, AvatarView>> {
        return resolveAvatars({ social: this.social, owned: this.owned ?? null, cats: this.cats ?? null, heroes: liveHeroIds() }, ids);
    }

    now(): Date {
        return this.clock?.now() ?? new Date();
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Profile
    // ---------------------------------------------------------------------------------------------------------------

    /** The caller's profile, created on the first social call (registered accounts only). */
    async profile(accountId: string): Promise<SocialProfile> {
        const found = (await this.social.findById(accountId).lean()) as SocialProfile | null;
        if (found) return found;
        const band = await this.band(accountId);
        for (let attempt = 0; attempt < 6; attempt++) {
            try {
                const doc = {
                    _id: accountId,
                    code: generatePlayerCode(),
                    name: { kind: 'generated' },
                    invisible: false,
                    allowRecent: recentOk(band),
                    rev: 0,
                    rotations: null,
                    createdAt: this.now(),
                };
                await this.social.create(doc);
                return doc as SocialProfile;
            } catch (error) {
                if ((error as { code?: unknown })?.code !== 11000) throw error;
                // a concurrent first call created it, or the code collided: read again, else retry with a new code
                const again = (await this.social.findById(accountId).lean()) as SocialProfile | null;
                if (again) return again;
            }
        }
        throw new Error('pawlegends social: no free player code');
    }

    async band(accountId: string): Promise<AgeBand | null> {
        const row = await this.buyers.findOne({ key: `account:${accountId}` }).lean();
        return isAgeBand(row?.ageBand) ? row.ageBand : null;
    }

    /** Registered (not a guest, not deleted) accounts only. */
    async registered(ids: readonly string[]): Promise<Set<string>> {
        if (!ids.length) return new Set();
        const rows = (await this.users
            .find({ _id: { $in: [...new Set(ids)] }, isGuest: { $ne: true }, deletedAt: { $exists: false } })
            .select({ _id: 1 })
            .lean()) as Array<{ _id: unknown }>;
        return new Set(rows.map(r => String(r._id)));
    }

    private async bump(ids: readonly string[]): Promise<void> {
        if (ids.length) await this.social.updateMany({ _id: { $in: [...ids] } }, { $inc: { rev: 1 } });
    }

    private async byCode(code: unknown): Promise<SocialProfile> {
        const parsed = parsePlayerCode(code);
        if (!parsed) throw SOCIAL_ERRORS.invalid('code');
        const p = (await this.social.findOne({ code: parsed }).lean()) as SocialProfile | null;
        if (!p) throw SOCIAL_ERRORS.notFound();
        return p;
    }

    async blockedEither(a: string, b: string): Promise<boolean> {
        const n = await this.blocks.countDocuments({ _id: { $in: [`${a}:${b}`, `${b}:${a}`] } });
        return n > 0;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // The Friends sheet
    // ---------------------------------------------------------------------------------------------------------------

    private async edgesOf(me: string): Promise<Edge[]> {
        return (await this.friends.find({ $or: [{ a: me }, { b: me }] }).lean()) as Edge[];
    }

    async presenceOf(ids: readonly string[]): Promise<Map<string, PresenceView>> {
        const out = new Map<string, PresenceView>();
        if (!ids.length) return out;
        const nowMs = this.now().getTime();
        const [rows, profiles] = await Promise.all([
            this.presence.find({ _id: { $in: [...ids] } }).lean() as Promise<PresenceRow[]>,
            this.social
                .find({ _id: { $in: [...ids] } })
                .select({ invisible: 1 })
                .lean() as Promise<Array<{ _id: string; invisible?: boolean }>>,
        ]);
        const invisible = new Set(profiles.filter(p => p.invisible).map(p => String(p._id)));
        const byId = new Map(rows.map(r => [String(r._id), r]));
        for (const id of ids) out.set(id, readPresence(byId.get(id), nowMs, invisible.has(id)));
        return out;
    }

    private async pendingInvites(me: string) {
        const now = this.now();
        const rows = (await this.invites
            .find({ to: me, exp: { $gt: now } })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean()) as Array<{ _id: unknown; from: string; party: string; exp: Date }>;
        const live = [];
        for (const r of rows) if (!(await this.blockedEither(me, r.from))) live.push(r);
        if (!live.length) return [];
        const [names, profiles] = await Promise.all([
            displayNames(
                { social: this.social, cats: this.cats },
                live.map(r => r.from)
            ),
            this.social
                .find({ _id: { $in: live.map(r => r.from) } })
                .select({ code: 1 })
                .lean() as Promise<Array<{ _id: string; code: string }>>,
        ]);
        const codes = new Map(profiles.map(p => [String(p._id), p.code]));
        return live.map(r => ({
            id: String(r._id),
            from: { code: formatPlayerCode(codes.get(r.from) ?? ''), name: names.get(r.from) },
            party: r.party,
            exp: r.exp,
        }));
    }

    async state(me: string) {
        const profile = await this.profile(me);
        const band = await this.band(me);
        const edges = await this.edgesOf(me);
        const blockRows = (await this.blocks.find({ blocker: me }).lean()) as Array<{ blocked: string }>;
        const ids = [...new Set([...edges.map(e => other(e, me)), ...blockRows.map(b => b.blocked)])];
        const profiles = (await this.social
            .find({ _id: { $in: ids } })
            .select({ code: 1 })
            .lean()) as Array<{ _id: string; code: string }>;
        const codes = new Map(profiles.map(p => [String(p._id), formatPlayerCode(p.code)]));
        const names = await displayNames({ social: this.social, cats: this.cats }, ids);
        const accepted = edges.filter(e => e.state === 'accepted').map(e => other(e, me));
        const blockedBy = new Set(
            (
                (await this.blocks.find({ blocker: { $in: accepted }, blocked: me }).lean()) as Array<{
                    blocker: string;
                }>
            ).map(b => b.blocker)
        );
        const presence = await this.presenceOf(accepted.filter(id => !blockedBy.has(id)));
        const avatars = await this.avatarsOf([me, ...ids]);
        const row = (id: string) => ({ code: codes.get(id) ?? '', name: names.get(id) ?? '', av: avatars.get(id) });
        const order = { match: 0, queue: 1, party: 2, online: 3, offline: 4 } as const;
        const friends = accepted
            .map(id => ({ ...row(id), presence: presence.get(id) ?? { state: 'offline' as const } }))
            .sort((x, y) => order[x.presence.state] - order[y.presence.state] || x.name.localeCompare(y.name));
        return {
            me: {
                code: formatPlayerCode(profile.code),
                name: (await displayNames({ social: this.social, cats: this.cats }, [me])).get(me),
                nameKind: profile.name?.kind ?? 'generated',
                invisible: !!profile.invisible,
                allowRecent: !!profile.allowRecent && recentOk(band),
                ageBand: band,
                av: avatars.get(me),
                avatar: (profile as { avatar?: unknown }).avatar ?? null,
                frame: (profile as { frame?: string | null }).frame ?? null,
                title: (profile as { title?: string | null }).title ?? null,
                dmPolicy: (profile as { dmPolicy?: string }).dmPolicy ?? 'friends',
            },
            friends,
            requests: {
                in: edges.filter(e => e.state === 'pending' && e.from !== me).map(e => row(other(e, me))),
                out: edges.filter(e => e.state === 'pending' && e.from === me).map(e => row(other(e, me))),
            },
            blocks: blockRows.map(b => row(b.blocked)),
            invites: await this.pendingInvites(me),
            rev: await this.revToken(me, profile, accepted),
        };
    }

    /** A short token over the caller's rev, the friends' revs and their presence: the pulse answers 204 while equal. */
    private async revToken(me: string, profile: SocialProfile, friendIds?: string[]): Promise<string> {
        const ids = friendIds ?? (await this.edgesOf(me)).filter(e => e.state === 'accepted').map(e => other(e, me));
        const revs = (await this.social
            .find({ _id: { $in: ids } })
            .select({ rev: 1 })
            .lean()) as Array<{ _id: string; rev?: number }>;
        const presence = await this.presenceOf(ids);
        const h = createHash('sha256').update(String(profile.rev ?? 0));
        for (const id of [...ids].sort()) {
            const p = presence.get(id);
            h.update(`|${id}:${revs.find(r => String(r._id) === id)?.rev ?? 0}:${p?.state}:${p?.joinable ? 1 : 0}`);
        }
        return h.digest('base64url').slice(0, 12);
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Pulse: the API side of presence
    // ---------------------------------------------------------------------------------------------------------------

    async pulse(
        me: string,
        rev: unknown
    ): Promise<{ changed: false } | { changed: true; rev: string; invites: unknown[] }> {
        const now = this.now();
        const last = this.pulseWrites.get(me) ?? 0;
        if (now.getTime() - last >= PRESENCE.apiWriteEveryMs) {
            this.pulseWrites.set(me, now.getTime());
            if (this.pulseWrites.size > 20_000)
                for (const k of [...this.pulseWrites.keys()].slice(0, 5000)) this.pulseWrites.delete(k);
            const user = await this.users.findById(me).select({ pawlegendsMatches: 1 }).lean();
            const rk = playedOf(user?.pawlegendsMatches).matches >= RANKED_MIN_MATCHES ? 1 : 0;
            await this.presence.updateOne({ _id: me }, presenceUpdate({ api: { at: now } }, now, rk), { upsert: true });
        }
        const profile = await this.profile(me);
        const token = await this.revToken(me, profile);
        const invites = await this.pendingInvites(me);
        if (token === rev && !invites.length) return { changed: false };
        return { changed: true, rev: token, invites };
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Requests, accept, decline, remove
    // ---------------------------------------------------------------------------------------------------------------

    /** The account a (room, slot) names for `me`, with the checks of §3.2 (recent). */
    private async fromRecent(me: string, roomIn: unknown, slotIn: unknown): Promise<string> {
        const roomId = typeof roomIn === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(roomIn) ? roomIn : null;
        const slot = Number(slotIn);
        if (!roomId || !Number.isInteger(slot) || slot < 0 || slot > 9) throw SOCIAL_ERRORS.invalid('room and slot');
        const room = (await this.rooms.findById(roomId).lean()) as MmRoomRecord | null;
        const now = this.now().getTime();
        if (
            !room ||
            !room.members.some(m => m.accountId === me) ||
            now - new Date(room.endedAt ?? room.createdAt).getTime() > RECENT_DAYS * DAY
        )
            throw SOCIAL_ERRORS.notFound();
        const held = room.members
            .filter(m => m.slot === slot && m.accountId)
            .sort((a, b) => b.joinedTick - a.joinedTick);
        const target = held[0]?.accountId;
        if (!target) throw SOCIAL_ERRORS.refused();
        if (target === me) throw SOCIAL_ERRORS.self();
        return target;
    }

    async targetOf(
        me: string,
        body: { code?: unknown; room?: unknown; slot?: unknown }
    ): Promise<{ id: string; via: Via }> {
        if (body.code !== undefined) {
            const p = await this.byCode(body.code);
            if (p._id === me) throw SOCIAL_ERRORS.self();
            return { id: p._id, via: 'code' };
        }
        return { id: await this.fromRecent(me, body.room, body.slot), via: 'recent' };
    }

    /**
     * A friend request (or the auto-accept of theirs). Via 'party' is called by the relay's SocialHooks with ids it
     * resolved inside the party (never from a client).
     */
    async request(me: string, target: string, via: Via): Promise<{ state: 'sent' | 'friends' }> {
        if (me === target) throw SOCIAL_ERRORS.self();
        const reg = await this.registered([me, target]);
        if (!reg.has(me)) throw SOCIAL_ERRORS.needAccount();
        if (!reg.has(target)) throw SOCIAL_ERRORS.refused();
        if (await this.blockedEither(me, target)) throw SOCIAL_ERRORS.refused();
        if (via === 'recent') {
            const [mine, theirs] = await Promise.all([this.profile(me), this.profile(target)]);
            const [b1, b2] = await Promise.all([this.band(me), this.band(target)]);
            if (!mine.allowRecent || !theirs.allowRecent || !recentOk(b1) || !recentOk(b2))
                throw SOCIAL_ERRORS.refused();
        } else {
            await this.profile(target);
        }
        const id = pairId(me, target);
        const now = this.now();
        const edge = (await this.friends.findById(id).lean()) as Edge | null;
        if (edge?.state === 'accepted') return { state: 'friends' };
        if (edge && edge.from !== me) {
            // they asked first: accept
            await this.acceptEdge(me, target, edge);
            return { state: 'friends' };
        }
        if (edge) return { state: 'sent' };
        const [count, out, today] = await Promise.all([
            this.friends.countDocuments({ $or: [{ a: me }, { b: me }], state: 'accepted' }),
            this.friends.countDocuments({ from: me, state: 'pending' }),
            this.friends.countDocuments({ from: me, createdAt: { $gte: new Date(now.getTime() - DAY) } }),
        ]);
        if (count >= FRIENDS_CAP) throw SOCIAL_ERRORS.cap('Friends');
        if (out >= PENDING_OUT_CAP) throw SOCIAL_ERRORS.cap('Pending requests');
        if (today >= REQUESTS_PER_DAY) throw SOCIAL_ERRORS.limit();
        const [a, b] = me < target ? [me, target] : [target, me];
        try {
            await this.friends.create({
                _id: id,
                a,
                b,
                from: me,
                state: 'pending',
                via,
                createdAt: now,
                acceptedAt: null,
                pendingExpireAt: new Date(now.getTime() + PENDING_TTL_DAYS * DAY),
            });
        } catch (error) {
            if ((error as { code?: unknown })?.code !== 11000) throw error;
            return this.request(me, target, via);
        }
        await this.bump([me, target]);
        return { state: 'sent' };
    }

    private async acceptEdge(me: string, target: string, edge: Edge) {
        const [mine, theirs] = await Promise.all([
            this.friends.countDocuments({ $or: [{ a: me }, { b: me }], state: 'accepted' }),
            this.friends.countDocuments({ $or: [{ a: target }, { b: target }], state: 'accepted' }),
        ]);
        if (mine >= FRIENDS_CAP || theirs >= FRIENDS_CAP) throw SOCIAL_ERRORS.cap('Friends');
        await this.friends.updateOne(
            { _id: edge._id, state: 'pending' },
            { $set: { state: 'accepted', acceptedAt: this.now() }, $unset: { pendingExpireAt: 1 } }
        );
        await this.bump([me, target]);
    }

    async accept(me: string, code: unknown) {
        const p = await this.byCode(code);
        const edge = (await this.friends.findById(pairId(me, p._id)).lean()) as Edge | null;
        if (!edge || edge.state !== 'pending' || edge.from === me) throw SOCIAL_ERRORS.notFound();
        if (await this.blockedEither(me, p._id)) throw SOCIAL_ERRORS.refused();
        await this.acceptEdge(me, p._id, edge);
        return { state: 'friends' as const };
    }

    /** Decline an incoming request, cancel an outgoing one, or remove a friend: the edge goes. */
    async remove(me: string, code: unknown) {
        const p = await this.byCode(code);
        const res = await this.friends.deleteOne({ _id: pairId(me, p._id) });
        if (res?.deletedCount) {
            await this.bump([me, p._id]);
            // CHAT-AVATARS §2.7: the DM thread turns read-only for 24 h, then hides
            await this.chat?.closeDm(me, p._id);
        }
        return { ok: true };
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Blocks
    // ---------------------------------------------------------------------------------------------------------------

    async block(me: string, body: { code?: unknown; room?: unknown; slot?: unknown }) {
        const { id } = await this.targetOf(me, body);
        if ((await this.blocks.countDocuments({ blocker: me })) >= BLOCKS_CAP) throw SOCIAL_ERRORS.cap('Blocks');
        await this.blocks.updateOne(
            { _id: `${me}:${id}` },
            { $setOnInsert: { blocker: me, blocked: id, createdAt: this.now() } },
            { upsert: true }
        );
        await this.friends.deleteOne({ _id: pairId(me, id) });
        await this.chat?.closeDm(me, id);
        await this.invites.deleteMany({
            $or: [
                { from: me, to: id },
                { from: id, to: me },
            ],
        });
        await this.bump([me, id]);
        return { ok: true };
    }

    async unblock(me: string, code: unknown) {
        const p = await this.byCode(code);
        await this.blocks.deleteOne({ _id: `${me}:${p._id}` });
        await this.bump([me]);
        return { ok: true };
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Settings, code rotation, age band
    // ---------------------------------------------------------------------------------------------------------------

    async setMe(
        me: string,
        body: {
            name?: unknown;
            invisible?: unknown;
            allowRecent?: unknown;
            avatar?: unknown;
            frame?: unknown;
            title?: unknown;
            dmPolicy?: unknown;
        }
    ) {
        await this.profile(me);
        const set: Record<string, unknown> = {};
        // CHAT-AVATARS §7.2: every avatar part is checked against what the caller owns
        if (body.avatar !== undefined || body.frame !== undefined || body.title !== undefined) {
            const checked = await checkAvatarChoice(
                {
                    social: this.social,
                    owned: this.owned ?? null,
                    cats: this.cats ?? null,
                    heroes: liveHeroIds(),
                    catById: async id => (this.cats ? this.cats.findOne({ _id: id }).lean() : null),
                },
                me,
                { avatar: body.avatar, frame: body.frame, title: body.title }
            );
            if ('bad' in checked) throw SOCIAL_ERRORS.invalid(checked.bad);
            Object.assign(set, checked.set);
        }
        if (body.dmPolicy !== undefined) {
            if (body.dmPolicy !== 'friends' && body.dmPolicy !== 'off') throw SOCIAL_ERRORS.invalid('dmPolicy');
            set.dmPolicy = body.dmPolicy;
        }
        if (body.name !== undefined) {
            if (body.name === 'generated') set.name = { kind: 'generated' };
            else if (typeof body.name === 'string' && /^[a-f0-9]{24}$/i.test(body.name)) {
                const cat = this.cats ? await this.cats.findOne({ _id: body.name, owner: me }).lean() : null;
                if (!cat) throw SOCIAL_ERRORS.invalid('name');
                set.name = { kind: 'cat', catId: body.name };
            } else throw SOCIAL_ERRORS.invalid('name');
        }
        if (body.invisible !== undefined) {
            if (typeof body.invisible !== 'boolean') throw SOCIAL_ERRORS.invalid('invisible');
            set.invisible = body.invisible;
        }
        if (body.allowRecent !== undefined) {
            if (typeof body.allowRecent !== 'boolean') throw SOCIAL_ERRORS.invalid('allowRecent');
            // forced off for under 16 and unknown bands
            set.allowRecent = body.allowRecent && recentOk(await this.band(me));
        }
        if (Object.keys(set).length) await this.social.updateOne({ _id: me }, { $set: set, $inc: { rev: 1 } });
        return this.state(me);
    }

    async rotateCode(me: string) {
        const p = await this.profile(me);
        const day = utcDay(this.now());
        const n = p.rotations?.day === day ? p.rotations.n : 0;
        if (n >= CODE_ROTATIONS_PER_DAY) throw SOCIAL_ERRORS.limit();
        for (let attempt = 0; attempt < 6; attempt++) {
            const code = generatePlayerCode();
            try {
                await this.social.updateOne({ _id: me }, { $set: { code, rotations: { day, n: n + 1 } } });
                return { code: formatPlayerCode(code) };
            } catch (error) {
                if ((error as { code?: unknown })?.code !== 11000) throw error;
            }
        }
        throw new Error('pawlegends social: no free player code');
    }

    /** The store's age question (same three bands, the stricter answer wins); recent adds turn off for under 16. */
    async setAge(me: string, bandIn: unknown) {
        if (!isAgeBand(bandIn)) throw SOCIAL_ERRORS.invalid('ageBand');
        const prev = await this.band(me);
        const band = stricterBand(prev ?? undefined, bandIn)!;
        await this.buyers.updateOne(
            { key: `account:${me}` },
            { $set: { ageBand: band }, $setOnInsert: { key: `account:${me}` } },
            { upsert: true }
        );
        const p = await this.profile(me);
        if (!recentOk(band) && p.allowRecent)
            await this.social.updateOne({ _id: me }, { $set: { allowRecent: false } });
        return { ageBand: band };
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Recent players
    // ---------------------------------------------------------------------------------------------------------------

    async recent(me: string) {
        const now = this.now();
        const rooms = (await this.rooms
            .find({ 'members.accountId': me, createdAt: { $gte: new Date(now.getTime() - RECENT_DAYS * DAY) } })
            .sort({ createdAt: -1 })
            .limit(RECENT_ROOMS)
            .lean()) as MmRoomRecord[];
        const sorted = [...rooms].sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
        const rows: Array<{ room: string; slot: number; acc: string; team: 'ally' | 'foe' }> = [];
        const seen = new Set<string>();
        for (const room of sorted) {
            const size = room.map === 'hearthwood' ? 5 : 3;
            const mine = room.members.find(m => m.accountId === me);
            if (!mine) continue;
            const myTeam = mine.slot >= size ? 1 : 0;
            // a (room, slot) names the slot's last holder (fromRecent): list only that one, so Add and Block reach the
            // player shown, never a backfiller who took the seat later
            const lastOf = new Map<number, typeof room.members[number]>();
            for (const m of room.members) {
                const prev = lastOf.get(m.slot);
                if (m.accountId && (!prev || m.joinedTick > prev.joinedTick)) lastOf.set(m.slot, m);
            }
            for (const m of room.members) {
                if (!m.accountId || m.accountId === me || seen.has(m.accountId)) continue;
                if (lastOf.get(m.slot) !== m) continue;
                seen.add(m.accountId);
                rows.push({
                    room: room._id,
                    slot: m.slot,
                    acc: m.accountId,
                    team: (m.slot >= size ? 1 : 0) === myTeam ? 'ally' : 'foe',
                });
                if (rows.length >= 20) break;
            }
            if (rows.length >= 20) break;
        }
        const ids = rows.map(r => r.acc);
        const [names, reg, edges, blocks, profiles, myProfile, myBand] = await Promise.all([
            displayNames({ social: this.social, cats: this.cats }, ids),
            this.registered([me, ...ids]),
            this.edgesOf(me),
            this.blocks
                .find({
                    $or: [
                        { blocker: me, blocked: { $in: ids } },
                        { blocker: { $in: ids }, blocked: me },
                    ],
                })
                .lean(),
            this.social
                .find({ _id: { $in: ids } })
                .select({ allowRecent: 1 })
                .lean(),
            this.profile(me),
            this.band(me),
        ]);
        const linked = new Set(edges.map(e => other(e, me)));
        const blocked = new Set(
            (blocks as Array<{ blocker: string; blocked: string }>).map(b => (b.blocker === me ? b.blocked : b.blocker))
        );
        const allow = new Map(
            (profiles as Array<{ _id: string; allowRecent?: boolean }>).map(p => [
                String(p._id),
                p.allowRecent !== false,
            ])
        );
        const bands = new Map<string, AgeBand | null>();
        for (const id of ids) bands.set(id, await this.band(id));
        const meOk = reg.has(me) && myProfile.allowRecent && recentOk(myBand);
        const avatars = await this.avatarsOf(ids);
        return {
            players: rows.map(r => ({
                room: r.room,
                slot: r.slot,
                name: names.get(r.acc),
                av: avatars.get(r.acc),
                team: r.team,
                canAdd:
                    meOk &&
                    reg.has(r.acc) &&
                    !linked.has(r.acc) &&
                    !blocked.has(r.acc) &&
                    (allow.get(r.acc) ?? true) &&
                    recentOk(bands.get(r.acc) ?? null),
            })),
        };
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Party invites
    // ---------------------------------------------------------------------------------------------------------------

    async invite(me: string, to: unknown) {
        const target = await this.byCode(to);
        const edge = (await this.friends.findById(pairId(me, target._id)).lean()) as Edge | null;
        if (!edge || edge.state !== 'accepted' || (await this.blockedEither(me, target._id)))
            throw SOCIAL_ERRORS.refused();
        const now = this.now();
        const row = (await this.presence.findById(me).lean()) as PresenceRow | null;
        const view = readPresence(row, now.getTime());
        if (view.state !== 'party' || !view.party || !view.joinable) throw SOCIAL_ERRORS.noParty();
        const [recent, toTarget] = await Promise.all([
            this.invites.countDocuments({ from: me, createdAt: { $gte: new Date(now.getTime() - 10 * 60_000) } }),
            this.invites.countDocuments({
                from: me,
                to: target._id,
                createdAt: { $gte: new Date(now.getTime() - 60_000) },
            }),
        ]);
        if (recent >= 10 || toTarget >= 1) throw SOCIAL_ERRORS.limit();
        await this.invites.create({
            from: me,
            to: target._id,
            party: view.party,
            exp: new Date(now.getTime() + INVITE_TTL_MS),
            createdAt: now,
        });
        await this.bump([target._id]);
        return { ok: true };
    }

    /** The relay's `party.join` check: did the party's leader block this joiner? (answered as party_full). */
    async leaderBlocked(leader: string, joiner: string): Promise<boolean> {
        return (await this.blocks.countDocuments({ _id: `${leader}:${joiner}` })) > 0;
    }
}
