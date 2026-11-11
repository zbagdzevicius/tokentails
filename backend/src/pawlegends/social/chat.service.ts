import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Cat } from 'src/cat/cat.schema';
import { User } from 'src/user/user.schema';
import {
    accountChatTier,
    ChatAgeBand,
    ChatBody,
    CHAT_LIMITS,
    CHAT_REPORT_KINDS,
    ChatReportKind,
    ChatTier,
    crossesAdultLine,
    isPhraseId,
    isStickerId,
    phraseInScope,
    threadChatTier,
} from '../../shared-contracts/chat';
import { filterChatText } from '../../shared-contracts/chat-filter';
import { isAgeBand } from '../pawlegends.contracts';
import { pawlegendsError } from '../pawlegends.errors';
import { PawlegendsBuyer } from '../pawlegends.schema';
import { ChatBus } from './chat-bus';
import { dmThreadId, MESSAGE_ID_RE, THREAD_ID_RE } from './chat-ids';
import { ChatLimiter } from './chat-limits';
import { PawlegendsChatMessage, PawlegendsChatThread } from './chat.schema';
import { displayNames } from './display-name';
import { REPORT_LIMITS } from './report.contracts';
import { formatPlayerCode, pairId, parsePlayerCode } from './social.contracts';
import { PawlegendsBlock, PawlegendsFriend, PawlegendsReport, PawlegendsSanction, PawlegendsSocial } from './social.schema';

/*
 * Friends chat over the API (CHAT-AVATARS.md §2, §4): DM threads between accepted friends only. Every send is checked
 * here in order: member, friends, not blocked, DM policy, `chat_mute` sanction, cooldown, tier (free text only when
 * both sides are registered and 16+), phrase scope, rate limits, then the text filter. Rejected text is never stored.
 * Clients never see an account id: threads are opaque ids, the other side is a player code and a derived name, and a
 * message says only whether it is `mine`. Party chat goes through the relay (party-relay.ts `chat.say`, ChatSink).
 */

const DAY = 86_400_000;
const RETAIN_MS = CHAT_LIMITS.retentionDays * DAY;
type AnyModel = any;

const err = (status: HttpStatus, code: string, message: string, extra?: Record<string, unknown>) => {
    const e = pawlegendsError(status, code, message);
    if (extra) Object.assign(e.getResponse() as Record<string, unknown>, extra);
    return e;
};

export const CHAT_ERRORS = {
    needAccount: () => err(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', 'Sign in to chat with friends'),
    invalid: (m: string) => err(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_CHAT_INVALID', m),
    /** Not a member, not friends, blocked either way, or DMs off: one generic answer, so a block cannot be probed. */
    unavailable: () => err(HttpStatus.FORBIDDEN, 'PAWLEGENDS_CHAT_UNAVAILABLE', 'Chat is not available'),
    quickOnly: () => err(HttpStatus.CONFLICT, 'PAWLEGENDS_CHAT_QUICK_ONLY', 'Quick chat only in this thread'),
    rejected: (why: string) =>
        err(HttpStatus.UNPROCESSABLE_ENTITY, 'PAWLEGENDS_CHAT_REJECTED', "That message can't be sent", { why }),
    tooLong: () => err(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_CHAT_TOO_LONG', 'Keep it under 120 characters'),
    rate: () => err(HttpStatus.TOO_MANY_REQUESTS, 'PAWLEGENDS_CHAT_RATE', 'Slow down a little'),
    cooldown: (until: Date) =>
        err(HttpStatus.TOO_MANY_REQUESTS, 'PAWLEGENDS_CHAT_COOLDOWN', 'Text chat is paused for a few minutes', {
            until: until.toISOString(),
        }),
    muted: (until: Date | null) =>
        err(HttpStatus.FORBIDDEN, 'PAWLEGENDS_CHAT_MUTED', 'Chat is paused', {
            until: until ? until.toISOString() : null,
        }),
    reportLimit: () => err(HttpStatus.TOO_MANY_REQUESTS, 'PAWLEGENDS_REPORT_LIMIT', 'Too many reports, try later'),
    notFound: () => err(HttpStatus.NOT_FOUND, 'PAWLEGENDS_CHAT_NOT_FOUND', 'No such message'),
};

export interface ThreadRow {
    _id: string;
    kind: 'dm' | 'party';
    members: string[];
    tier?: ChatTier;
    lastAt: Date;
    lastFrom?: string;
    lastPreview?: string;
    read?: Record<string, Date>;
    muted?: string[];
    closedAt?: Date | null;
    createdBy?: string;
    createdAt?: Date;
    exp: Date;
}

export interface MessageRow {
    _id: string;
    thread: string;
    from: string;
    k: 't' | 'q' | 's';
    text?: string;
    id?: number;
    at: Date;
    exp: Date;
}

/** A message as a client sees it: `mine` instead of the sender. */
export interface MessageView {
    mid: string;
    mine: boolean;
    k: 't' | 'q' | 's';
    text?: string;
    id?: number;
    at: Date;
}

const THREAD_RE = THREAD_ID_RE;
const MID_RE = MESSAGE_ID_RE;
export { dmThreadId };

export const previewOf = (m: Pick<MessageRow, 'k' | 'text' | 'id'>) =>
    m.k === 't' ? String(m.text ?? '').slice(0, CHAT_LIMITS.previewMax) : `[${m.k}:${m.id}]`;

export const viewOf = (m: MessageRow, me: string): MessageView => ({
    mid: String(m._id),
    mine: m.from === me,
    k: m.k,
    ...(m.k === 't' ? { text: m.text } : { id: m.id }),
    at: m.at,
});

/** Parses a send body: `{k:'t', text}`, `{k:'q', id}` or `{k:'s', id}`; null when malformed. */
export function parseChatBody(body: unknown): ChatBody | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const b = body as Record<string, unknown>;
    const keys = Object.keys(b);
    if (b.k === 't' && typeof b.text === 'string' && keys.length === 2 && 'text' in b) return { k: 't', text: b.text };
    if (b.k === 'q' && isPhraseId(b.id) && keys.length === 2) return { k: 'q', id: b.id };
    if (b.k === 's' && isStickerId(b.id) && keys.length === 2) return { k: 's', id: b.id };
    return null;
}

@Injectable()
export class ChatService {
    readonly limiter = new ChatLimiter();
    /** The relay's ChatSink buffer (same process): a report may name a party message before it is flushed. */
    private pendingLookup: ((mid: string) => MessageRow | null) | null = null;

    constructor(
        @InjectModel(PawlegendsChatThread.name) readonly threads: AnyModel,
        @InjectModel(PawlegendsChatMessage.name) readonly messages: AnyModel,
        @InjectModel(PawlegendsSocial.name) readonly social: AnyModel,
        @InjectModel(PawlegendsFriend.name) readonly friends: AnyModel,
        @InjectModel(PawlegendsBlock.name) readonly blocks: AnyModel,
        @InjectModel(PawlegendsBuyer.name) readonly buyers: AnyModel,
        @InjectModel(User.name) readonly users: AnyModel,
        @InjectModel(PawlegendsReport.name) readonly reports: AnyModel,
        @InjectModel(PawlegendsSanction.name) readonly sanctions: AnyModel,
        @Optional() readonly bus?: ChatBus,
        @Optional() @InjectModel(Cat.name) readonly cats?: AnyModel,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    now(): Date {
        return this.clock?.now() ?? new Date();
    }

    /** Set by the relay wiring: party messages still in the ChatSink buffer. */
    setPendingLookup(fn: ((mid: string) => MessageRow | null) | null) {
        this.pendingLookup = fn;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Who may talk
    // ---------------------------------------------------------------------------------------------------------------

    async bandOf(accountId: string): Promise<ChatAgeBand | null> {
        const row = await this.buyers.findOne({ key: `account:${accountId}` }).lean();
        return isAgeBand(row?.ageBand) ? row.ageBand : null;
    }

    async registered(ids: readonly string[]): Promise<Set<string>> {
        if (!ids.length) return new Set();
        const rows = (await this.users
            .find({ _id: { $in: [...new Set(ids)] }, isGuest: { $ne: true }, deletedAt: { $exists: false } })
            .select({ _id: 1 })
            .lean()) as Array<{ _id: unknown }>;
        return new Set(rows.map(r => String(r._id)));
    }

    /** The tier of a set of accounts (the strictest wins) and whether the probe filter applies. */
    async tierOf(ids: readonly string[]): Promise<{ tier: ChatTier; probes: boolean }> {
        const [reg, bands] = await Promise.all([this.registered(ids), Promise.all(ids.map(id => this.bandOf(id)))]);
        const tier = threadChatTier(ids.map((id, i) => accountChatTier(bands[i], reg.has(id))));
        return { tier, probes: tier === 'text' && crossesAdultLine(bands) };
    }

    private async blockedEither(a: string, b: string): Promise<boolean> {
        return (await this.blocks.countDocuments({ _id: { $in: [`${a}:${b}`, `${b}:${a}`] } })) > 0;
    }

    private async friendsNow(a: string, b: string): Promise<boolean> {
        const edge = await this.friends.findById(pairId(a, b)).lean();
        return edge?.state === 'accepted';
    }

    /** An active `chat_mute`: its end (null = permanent), or false. */
    async chatMute(accountId: string): Promise<Date | null | false> {
        const now = this.now();
        const rows = (await this.sanctions
            .find({ accountId, kind: 'chat_mute', $or: [{ until: null }, { until: { $gt: now } }] })
            .lean()) as Array<{ until: Date | null }>;
        if (!rows.length) return false;
        if (rows.some(r => !r.until)) return null;
        return new Date(Math.max(...rows.map(r => new Date(r.until as Date).getTime())));
    }

    /**
     * A DM thread `me` may read: a member, not blocked either way, and still friends (or unfriended less than 24 h ago:
     * read-only). Anything else answers the generic `unavailable`.
     */
    private async access(me: string, threadId: unknown): Promise<{ thread: ThreadRow; other: string; readOnly: boolean }> {
        if (typeof threadId !== 'string' || !THREAD_RE.test(threadId)) throw CHAT_ERRORS.unavailable();
        const thread = (await this.threads.findById(threadId).lean()) as ThreadRow | null;
        if (!thread || thread.kind !== 'dm' || !thread.members.includes(me)) throw CHAT_ERRORS.unavailable();
        const other = thread.members.find(m => m !== me);
        if (!other || (await this.blockedEither(me, other))) throw CHAT_ERRORS.unavailable();
        if (await this.friendsNow(me, other)) return { thread, other, readOnly: false };
        const closed = thread.closedAt ? new Date(thread.closedAt).getTime() : 0;
        if (closed && this.now().getTime() - closed < CHAT_LIMITS.unfriendReadOnlyMs)
            return { thread, other, readOnly: true };
        throw CHAT_ERRORS.unavailable();
    }

    private async profileOf(id: string) {
        return (await this.social.findById(id).lean()) as {
            _id: string;
            code: string;
            dmPolicy?: 'friends' | 'off';
            chatCooldownUntil?: Date | null;
            chatStrikes?: { day: string; n: number } | null;
        } | null;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Threads
    // ---------------------------------------------------------------------------------------------------------------

    /** Opens (or creates) the DM thread with a friend named by player code. */
    async open(me: string, code: unknown): Promise<{ thread: string; tier: ChatTier }> {
        const parsed = parsePlayerCode(code);
        if (!parsed) throw CHAT_ERRORS.invalid('code');
        const target = (await this.social.findOne({ code: parsed }).lean()) as { _id: string } | null;
        if (!target || target._id === me) throw CHAT_ERRORS.unavailable();
        const reg = await this.registered([me, target._id]);
        if (!reg.has(me)) throw CHAT_ERRORS.needAccount();
        if (!reg.has(target._id)) throw CHAT_ERRORS.unavailable();
        if (!(await this.friendsNow(me, target._id)) || (await this.blockedEither(me, target._id)))
            throw CHAT_ERRORS.unavailable();
        const id = dmThreadId(me, target._id);
        const { tier } = await this.tierOf([me, target._id]);
        const existing = await this.threads.findById(id).lean();
        if (existing) return { thread: id, tier };
        const now = this.now();
        const today = await this.threads.countDocuments({
            createdBy: me,
            createdAt: { $gte: new Date(now.getTime() - DAY) },
        });
        if (today >= CHAT_LIMITS.newDmThreadsPerDay) throw CHAT_ERRORS.rate();
        try {
            await this.threads.create({
                _id: id,
                kind: 'dm',
                members: [me, target._id].sort(),
                tier,
                lastAt: now,
                lastFrom: '',
                lastPreview: '',
                read: {},
                muted: [],
                closedAt: null,
                createdBy: me,
                createdAt: now,
                exp: new Date(now.getTime() + RETAIN_MS),
            });
        } catch (error) {
            if ((error as { code?: unknown })?.code !== 11000) throw error;
        }
        return { thread: id, tier };
    }

    /** The caller's DM threads, newest first (at most 50), hiding blocked pairs and closed ones after 24 h. */
    async list(me: string) {
        const rows = (await this.threads
            .find({ members: me, kind: 'dm' })
            .sort({ lastAt: -1 })
            .limit(CHAT_LIMITS.threadsMax)
            .lean()) as ThreadRow[];
        const others = rows.map(t => t.members.find(m => m !== me) ?? '').filter(Boolean);
        if (!others.length) return { threads: [] };
        const [blocks, edges, profiles, names] = await Promise.all([
            this.blocks
                .find({
                    $or: [
                        { blocker: me, blocked: { $in: others } },
                        { blocker: { $in: others }, blocked: me },
                    ],
                })
                .lean() as Promise<Array<{ blocker: string; blocked: string }>>,
            this.friends.find({ _id: { $in: others.map(o => pairId(me, o)) }, state: 'accepted' }).lean() as Promise<
                Array<{ _id: string }>
            >,
            this.social
                .find({ _id: { $in: others } })
                .select({ code: 1 })
                .lean() as Promise<Array<{ _id: string; code: string }>>,
            displayNames({ social: this.social, cats: this.cats }, others),
        ]);
        const blocked = new Set(blocks.map(b => (b.blocker === me ? b.blocked : b.blocker)));
        const friends = new Set(edges.map(e => String(e._id)));
        const codes = new Map(profiles.map(p => [String(p._id), formatPlayerCode(p.code)]));
        const nowMs = this.now().getTime();
        const out = [];
        for (const t of rows) {
            const other = t.members.find(m => m !== me);
            if (!other || blocked.has(other)) continue;
            const isFriend = friends.has(pairId(me, other));
            const closed = t.closedAt ? new Date(t.closedAt).getTime() : 0;
            if (!isFriend && !(closed && nowMs - closed < CHAT_LIMITS.unfriendReadOnlyMs)) continue;
            if (!t.lastFrom) continue; // opened, never written
            out.push({
                id: t._id,
                kind: 'dm' as const,
                with: { code: codes.get(other) ?? '', name: names.get(other) ?? '' },
                tier: t.tier ?? 'quick',
                lastAt: t.lastAt,
                lastPreview: t.lastPreview ?? '',
                lastMine: t.lastFrom === me,
                unread: await this.unreadIn(t, me),
                muted: (t.muted ?? []).includes(me),
                readOnly: !isFriend,
            });
        }
        return { threads: out };
    }

    private async unreadIn(t: ThreadRow, me: string): Promise<number> {
        const cursor = t.read?.[me] ? new Date(t.read[me]) : new Date(0);
        if (!t.lastFrom || t.lastFrom === me || new Date(t.lastAt).getTime() <= cursor.getTime()) return 0;
        return Math.min(
            99,
            await this.messages.countDocuments({ thread: t._id, from: { $ne: me }, at: { $gt: cursor } })
        );
    }

    /** The unread DM count and the newest unread thread (the pulse badge). Muted threads do not count. */
    async summary(me: string): Promise<{ unread: number; top?: { thread: string; fromName: string; preview: string } }> {
        const rows = (await this.threads
            .find({ members: me, kind: 'dm' })
            .sort({ lastAt: -1 })
            .limit(CHAT_LIMITS.threadsMax)
            .lean()) as ThreadRow[];
        let unread = 0;
        let top: ThreadRow | null = null;
        for (const t of rows) {
            if ((t.muted ?? []).includes(me)) continue;
            const other = t.members.find(m => m !== me);
            if (!other) continue;
            const n = await this.unreadIn(t, me);
            if (!n) continue;
            if (await this.blockedEither(me, other)) continue;
            unread += n;
            if (!top) top = t;
        }
        if (!top) return { unread };
        const other = top.members.find(m => m !== me)!;
        const names = await displayNames({ social: this.social, cats: this.cats }, [other]);
        return { unread, top: { thread: top._id, fromName: names.get(other) ?? '', preview: top.lastPreview ?? '' } };
    }

    /** History, newest first in pages of 30 (`before` = a message id); oldest first in the answer. */
    async history(me: string, threadId: unknown, before?: unknown, limitIn?: unknown) {
        const { thread, other, readOnly } = await this.access(me, threadId);
        const limit = Math.min(CHAT_LIMITS.historyPage, Math.max(1, Math.floor(Number(limitIn) || CHAT_LIMITS.historyPage)));
        const filter: Record<string, unknown> = { thread: thread._id };
        if (before !== undefined && before !== null && before !== '') {
            if (typeof before !== 'string' || !MID_RE.test(before)) throw CHAT_ERRORS.invalid('before');
            const pivot = (await this.messages.findOne({ _id: before, thread: thread._id }).lean()) as MessageRow | null;
            if (pivot) filter.at = { $lt: pivot.at };
        }
        const rows = (await this.messages
            .find(filter)
            .sort({ at: -1 })
            .limit(limit + 1)
            .lean()) as MessageRow[];
        const more = rows.length > limit;
        const page = rows.slice(0, limit).reverse();
        const [{ tier }, profile, names, social] = await Promise.all([
            this.tierOf([me, other]),
            this.profileOf(other),
            displayNames({ social: this.social, cats: this.cats }, [other]),
            this.profileOf(me),
        ]);
        return {
            thread: {
                id: thread._id,
                with: { code: profile ? formatPlayerCode(profile.code) : '', name: names.get(other) ?? '' },
                tier,
                muted: (thread.muted ?? []).includes(me),
                readOnly,
                cooldownUntil:
                    social?.chatCooldownUntil && new Date(social.chatCooldownUntil).getTime() > this.now().getTime()
                        ? social.chatCooldownUntil
                        : null,
            },
            messages: page.map(m => viewOf(m, me)),
            more,
        };
    }

    /** Messages after `after` (the open-thread poll); null when nothing is new (204). */
    async since(me: string, threadId: unknown, after: unknown): Promise<{ messages: MessageView[] } | null> {
        const { thread } = await this.access(me, threadId);
        if (typeof after !== 'string' || !MID_RE.test(after)) throw CHAT_ERRORS.invalid('after');
        const pivot = (await this.messages.findOne({ _id: after, thread: thread._id }).lean()) as MessageRow | null;
        if (pivot && new Date(thread.lastAt).getTime() <= new Date(pivot.at).getTime() && thread.lastFrom) return null;
        const filter: Record<string, unknown> = { thread: thread._id };
        if (pivot) filter.at = { $gte: pivot.at };
        const rows = (await this.messages
            .find(filter)
            .sort({ at: -1 })
            .limit(CHAT_LIMITS.historyPage)
            .lean()) as MessageRow[];
        const fresh = rows.filter(m => String(m._id) !== after).reverse();
        return fresh.length ? { messages: fresh.map(m => viewOf(m, me)) } : null;
    }

    async markRead(me: string, threadId: unknown, upTo: unknown) {
        const { thread } = await this.access(me, threadId);
        let at = this.now();
        if (typeof upTo === 'string' && MID_RE.test(upTo)) {
            const m = (await this.messages.findOne({ _id: upTo, thread: thread._id }).lean()) as MessageRow | null;
            if (m) at = new Date(m.at);
        }
        await this.threads.updateOne({ _id: thread._id }, { $max: { [`read.${me}`]: at } });
        return { ok: true };
    }

    async mute(me: string, threadId: unknown, muted: unknown) {
        if (typeof muted !== 'boolean') throw CHAT_ERRORS.invalid('muted');
        const { thread } = await this.access(me, threadId);
        await this.threads.updateOne(
            { _id: thread._id },
            muted ? { $addToSet: { muted: me } } : { $pull: { muted: me } }
        );
        return { ok: true, muted };
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Send
    // ---------------------------------------------------------------------------------------------------------------

    async send(me: string, threadId: unknown, bodyIn: unknown): Promise<{ message: MessageView }> {
        const body = parseChatBody(bodyIn);
        if (!body) {
            const b = bodyIn as Record<string, unknown> | null;
            if (b && b.k === 't' && typeof b.text === 'string' && b.text.length > CHAT_LIMITS.rawMax)
                throw CHAT_ERRORS.tooLong();
            throw CHAT_ERRORS.invalid('body');
        }
        const { thread, other, readOnly } = await this.access(me, threadId);
        if (readOnly) throw CHAT_ERRORS.unavailable();
        const [mine, theirs] = await Promise.all([this.profileOf(me), this.profileOf(other)]);
        if (mine?.dmPolicy === 'off' || theirs?.dmPolicy === 'off') throw CHAT_ERRORS.unavailable();
        const mute = await this.chatMute(me);
        if (mute !== false) throw CHAT_ERRORS.muted(mute);
        const now = this.now();
        const { tier, probes } = await this.tierOf([me, other]);
        let text: string | undefined;
        if (body.k === 't') {
            const cd = mine?.chatCooldownUntil ? new Date(mine.chatCooldownUntil) : null;
            if (cd && cd.getTime() > now.getTime()) throw CHAT_ERRORS.cooldown(cd);
            if (tier !== 'text') throw CHAT_ERRORS.quickOnly();
            const checked = filterChatText(body.text, { probes });
            if (!checked.ok) {
                if (checked.why === 'long') throw CHAT_ERRORS.tooLong();
                if (checked.why === 'empty') throw CHAT_ERRORS.invalid('text');
                await this.strike(me, now);
                throw CHAT_ERRORS.rejected(checked.why);
            }
            text = checked.text;
        } else if (body.k === 'q' && !phraseInScope(body.id, 'dm')) throw CHAT_ERRORS.invalid('phrase');
        const hit = this.limiter.take(me, thread._id, now.getTime(), text);
        // a duplicate (the same text 3 times in 60 s) answers like any other rate limit
        if (hit) throw CHAT_ERRORS.rate();
        const row: MessageRow = {
            _id: new Types.ObjectId().toHexString(),
            thread: thread._id,
            from: me,
            k: body.k,
            ...(text !== undefined ? { text } : { id: (body as { id: number }).id }),
            at: now,
            exp: new Date(now.getTime() + RETAIN_MS),
        };
        await this.messages.create(row);
        await this.threads.updateOne(
            { _id: thread._id },
            {
                $set: {
                    lastAt: now,
                    lastFrom: me,
                    lastPreview: previewOf(row),
                    tier,
                    exp: new Date(now.getTime() + RETAIN_MS),
                    closedAt: null,
                    [`read.${me}`]: now,
                },
            }
        );
        if (!(thread.muted ?? []).includes(other)) {
            await this.social.updateOne({ _id: other }, { $inc: { rev: 1 } });
            this.bus?.publish({ to: other, thread: thread._id });
        }
        return { message: viewOf(row, me) };
    }

    /** One filter rejection: 5 in 10 minutes start a 10-minute text cooldown; the day's count feeds CMS flag F6. */
    private async strike(me: string, now: Date) {
        const day = now.toISOString().slice(0, 10);
        const p = await this.profileOf(me);
        const n = p?.chatStrikes?.day === day ? p.chatStrikes.n + 1 : 1;
        const set: Record<string, unknown> = { chatStrikes: { day, n } };
        if (this.limiter.strike(me, now.getTime())) set.chatCooldownUntil = new Date(now.getTime() + CHAT_LIMITS.cooldownMs);
        await this.social.updateOne({ _id: me }, { $set: set });
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Friendship changes (SocialService calls these)
    // ---------------------------------------------------------------------------------------------------------------

    /** An unfriend or a block: the DM thread turns read-only now (24 h), then hides. */
    async closeDm(a: string, b: string) {
        await this.threads.updateOne({ _id: dmThreadId(a, b), closedAt: null }, { $set: { closedAt: this.now() } });
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Report a message
    // ---------------------------------------------------------------------------------------------------------------

    /**
     * Reports one received message (DM or party). The message and up to 6 earlier lines of that thread are copied into
     * the report, so the 30-day chat TTL cannot delete the evidence; the report lives 180 days like every other one.
     */
    async report(reporter: string, input: { msg?: unknown; kind?: unknown; note?: unknown }) {
        if (typeof input.msg !== 'string' || !MID_RE.test(input.msg)) throw CHAT_ERRORS.invalid('msg');
        if (typeof input.kind !== 'string' || !(CHAT_REPORT_KINDS as readonly string[]).includes(input.kind))
            throw CHAT_ERRORS.invalid('kind');
        let note: string | undefined;
        if (input.note !== undefined && input.note !== null && input.note !== '') {
            if (typeof input.note !== 'string' || input.note.length > CHAT_LIMITS.reportNoteMax)
                throw CHAT_ERRORS.invalid('note');
            note = input.note.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || undefined;
        }
        let msg = (await this.messages.findById(input.msg).lean()) as MessageRow | null;
        if (!msg && this.pendingLookup) msg = this.pendingLookup(input.msg);
        if (!msg) throw CHAT_ERRORS.notFound();
        const thread = (await this.threads.findById(msg.thread).lean()) as ThreadRow | null;
        const members = thread?.members ?? [];
        if (!members.includes(reporter)) {
            // a party message still in the sink: the reporter must be in that party (the relay checked the thread id)
            if (thread || !this.pendingLookup) throw CHAT_ERRORS.notFound();
        }
        if (msg.from === reporter) throw CHAT_ERRORS.invalid('own message');
        const now = this.now();
        const band = await this.bandOf(reporter);
        if (note && band !== '16-17' && band !== '18+') note = undefined;
        const since = new Date(now.getTime() - DAY);
        const room = `chat:${msg._id}`;
        if (await this.reports.findOne({ room, reporter, target: msg.from }).lean()) return { created: false };
        const [today, againstSender] = await Promise.all([
            this.reports.countDocuments({ reporter, createdAt: { $gte: since } }),
            this.reports.countDocuments({ reporter, target: msg.from, reason: 'chat', createdAt: { $gte: since } }),
        ]);
        if (today >= REPORT_LIMITS.perDay || againstSender >= CHAT_LIMITS.reportsPerSenderPerDay)
            throw CHAT_ERRORS.reportLimit();
        const context = (await this.messages
            .find({ thread: msg.thread, at: { $lt: msg.at } })
            .sort({ at: -1 })
            .limit(CHAT_LIMITS.reportContext)
            .lean()) as MessageRow[];
        const line = (m: MessageRow) => ({
            from: m.from,
            k: m.k,
            ...(m.k === 't' ? { text: m.text } : { id: m.id }),
            at: m.at,
        });
        try {
            await this.reports.create({
                room,
                queue: 'chat',
                reporter,
                target: msg.from,
                guest: false,
                reason: 'chat',
                chatKind: input.kind as ChatReportKind,
                ...(note ? { note } : {}),
                snapshot: {
                    thread: msg.thread,
                    kind: thread?.kind ?? 'party',
                    ...line(msg),
                    context: context.reverse().map(line),
                },
                status: 'open',
                createdAt: now,
                expireAt: new Date(now.getTime() + REPORT_LIMITS.keepDays * DAY),
            });
        } catch (error) {
            if ((error as { code?: unknown })?.code === 11000) return { created: false };
            throw error;
        }
        return { created: true };
    }
}
