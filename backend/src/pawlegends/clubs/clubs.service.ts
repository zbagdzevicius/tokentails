import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomInt } from 'crypto';
import { Types } from 'mongoose';
import { CHAT_LIMITS } from '../../shared-contracts/chat';
import { pawlegendsError } from '../pawlegends.errors';
import { PawlegendsStore } from '../pawlegends.schema';
import { isoWeek } from '../ranked/boards';
import { clubThreadId } from '../social/chat-ids';
import { ChatService } from '../social/chat.service';
import { SocialService } from '../social/social.service';
import { displayNames } from '../social/display-name';
import { payChest, previewReward, rewardName } from './club-rewards';
import {
    CLUB_CHEST_TIERS,
    CLUB_CHEST_YARN,
    CLUB_CODE_ALPHABET,
    CLUB_CODE_LENGTH,
    CLUB_LIMITS,
    clubNameText,
    formatClubCode,
    parseClubCode,
    parseClubName,
    tiersReached,
} from './clubs.contracts';
import {
    PawlegendsClub,
    PawlegendsClubClaim,
    PawlegendsClubMember,
    PawlegendsClubWeek,
    PawlegendsClubWin,
} from './clubs.schema';

/*
 * Clubs (docs/plans/moba/CLUBS-KUDOS.md): create with a generated name, join by code, up to 30 members, one club per
 * account, registered accounts only. A block either way between a joiner and any member refuses the join with the same
 * generic answer as a full or unknown club, so a block cannot be probed. The club chat is a `club` thread of the friends
 * chat (ChatService): the same filter, limits, sanctions, reports and age tiers. The owner can remove a member, who can
 * then not join that club again.
 *
 * The weekly chest grows ONLY in `applyClubChest`, which only the `/live` save calls (pawlegends-party-live.ts), after
 * the Game row exists, from a verified party or PvP win of a registered member (club-no-write.spec.ts holds this). A
 * member who added a win that week claims each reached tier once per week, whatever club.
 */

type AnyModel = any;
const DAY = 86_400_000;
const WEEK_KEEP_MS = 35 * DAY;

const err = (status: HttpStatus, code: string, message: string) => pawlegendsError(status, code, message);
export const CLUB_ERRORS = {
    needAccount: () => err(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', 'Sign in to join a club'),
    invalid: (m: string) => err(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_CLUB_INVALID', m),
    /** Unknown code, full club, removed, or a block either way: one answer. */
    unavailable: () => err(HttpStatus.FORBIDDEN, 'PAWLEGENDS_CLUB_UNAVAILABLE', 'This club cannot be joined'),
    inClub: () => err(HttpStatus.CONFLICT, 'PAWLEGENDS_CLUB_ALREADY', 'Leave your club first'),
    noClub: () => err(HttpStatus.NOT_FOUND, 'PAWLEGENDS_CLUB_NONE', 'You are not in a club'),
    cooldown: () => err(HttpStatus.TOO_MANY_REQUESTS, 'PAWLEGENDS_CLUB_COOLDOWN', 'Wait an hour after leaving a club'),
    notOwner: () => err(HttpStatus.FORBIDDEN, 'PAWLEGENDS_CLUB_OWNER', 'Only the club owner can do that'),
    needWin: () => err(HttpStatus.CONFLICT, 'PAWLEGENDS_CLUB_NEED_WIN', 'Win a match this week to share the chest'),
    rate: () => err(HttpStatus.TOO_MANY_REQUESTS, 'PAWLEGENDS_CLUB_RATE', 'Too many clubs today'),
};

/** An opaque member id inside one club (never the account id): the kick target. */
export const memberId = (clubId: string, accountId: string): string =>
    createHash('sha256').update(`clubm|${clubId}|${accountId}`).digest('hex').slice(0, 12);

export interface ClubRow {
    _id: string;
    code: string;
    name: number[];
    owner: string;
    size: number;
    thread: string;
    banned?: string[];
    createdAt: Date;
}

export interface ClubChestInput {
    accountId: string;
    room: string;
    won: boolean;
    registered: boolean;
    now: Date;
}

export interface ClubChestGain {
    week: string;
    wins: number;
    /** False when the member's daily share was already full (the win counted for the player, not the chest). */
    counted: boolean;
}

const genCode = (rand: (max: number) => number = randomInt) => {
    let s = '';
    for (let i = 0; i < CLUB_CODE_LENGTH; i++) s += CLUB_CODE_ALPHABET[rand(CLUB_CODE_ALPHABET.length)];
    return s;
};

/** The week before `week` (a Monday 7 days earlier). */
const prevWeek = (now: Date) => isoWeek(new Date(now.getTime() - 7 * DAY));

/** The next Monday 00:00 UTC (the chest resets). */
export function weekEndsAt(now: Date): Date {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay() || 7;
    return new Date(d.getTime() + (8 - day) * DAY);
}

@Injectable()
export class ClubsService {
    private readonly logger = new Logger('PawlegendsClubs');

    constructor(
        @InjectModel(PawlegendsClub.name) readonly clubs: AnyModel,
        @InjectModel(PawlegendsClubMember.name) readonly members: AnyModel,
        @InjectModel(PawlegendsClubWeek.name) readonly weeks: AnyModel,
        @InjectModel(PawlegendsClubWin.name) readonly wins: AnyModel,
        @InjectModel(PawlegendsClubClaim.name) readonly claims: AnyModel,
        private readonly social: SocialService,
        private readonly chat: ChatService,
        private readonly store: PawlegendsStore,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    now(): Date {
        return this.clock?.now() ?? new Date();
    }

    private async registered(id: string): Promise<boolean> {
        return (await this.chat.registered([id])).has(id);
    }

    private async blockedWithAny(me: string, ids: readonly string[]): Promise<boolean> {
        return (await this.chat.blockedAmong(me, ids)).size > 0;
    }

    private async memberRow(me: string) {
        return (await this.members.findById(me).lean()) as {
            _id: string;
            club?: string;
            joinedAt?: Date | null;
            leftAt?: Date | null;
        } | null;
    }

    private async memberIds(clubId: string): Promise<string[]> {
        const rows = (await this.members.find({ club: clubId }).sort({ joinedAt: 1 }).lean()) as Array<{
            _id: string;
        }>;
        return rows.map(r => String(r._id));
    }

    /** May `me` start or join a club now: registered, not in one, not inside the rejoin cooldown. */
    private async canEnter(me: string) {
        if (!(await this.registered(me))) throw CLUB_ERRORS.needAccount();
        const row = await this.memberRow(me);
        if (row?.club) throw CLUB_ERRORS.inClub();
        if (row?.leftAt && this.now().getTime() - new Date(row.leftAt).getTime() < CLUB_LIMITS.rejoinMs)
            throw CLUB_ERRORS.cooldown();
        return row;
    }

    /** Seats `me` in the club (the member row); false on a race (already seated elsewhere). */
    private async seat(me: string, clubId: string, existed: boolean): Promise<boolean> {
        const now = this.now();
        if (existed) {
            const r = await this.members.updateOne(
                { _id: me, club: '' },
                { $set: { club: clubId, joinedAt: now, leftAt: null } }
            );
            return (r?.modifiedCount ?? 0) > 0;
        }
        try {
            await this.members.create({ _id: me, club: clubId, joinedAt: now, leftAt: null });
            return true;
        } catch (error) {
            if ((error as { code?: unknown })?.code === 11000) return false;
            throw error;
        }
    }

    /** The club thread exists and lists the members (a quiet club's thread may have expired). */
    private async syncThread(club: ClubRow, ids: readonly string[]) {
        const now = this.now();
        await this.chat.threads.updateOne(
            { _id: club.thread },
            {
                $setOnInsert: {
                    kind: 'club',
                    tier: 'quick',
                    lastAt: now,
                    lastFrom: '',
                    lastPreview: '',
                    read: {},
                    muted: [],
                    closedAt: null,
                    createdBy: club.owner,
                    createdAt: now,
                },
                $set: { members: [...ids] },
                $max: { exp: new Date(now.getTime() + CHAT_LIMITS.retentionDays * DAY) },
            },
            { upsert: true }
        );
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Create, join, leave, remove

    async create(me: string, nameIn: unknown) {
        const name = parseClubName(nameIn);
        if (!name) throw CLUB_ERRORS.invalid('name');
        const row = await this.canEnter(me);
        const now = this.now();
        const today = await this.clubs.countDocuments({
            owner: me,
            createdAt: { $gte: new Date(now.getTime() - DAY) },
        });
        if (today >= 2) throw CLUB_ERRORS.rate();
        const id = new Types.ObjectId().toHexString();
        let club: ClubRow | null = null;
        for (let i = 0; i < 5 && !club; i++) {
            const doc: ClubRow = {
                _id: id,
                code: genCode(),
                name,
                owner: me,
                size: 1,
                thread: clubThreadId(id),
                banned: [],
                createdAt: now,
            };
            try {
                await this.clubs.create(doc);
                club = doc;
            } catch (error) {
                if ((error as { code?: unknown })?.code !== 11000) throw error;
            }
        }
        if (!club) throw CLUB_ERRORS.rate();
        if (!(await this.seat(me, club._id, !!row))) {
            await this.clubs.deleteOne({ _id: club._id });
            throw CLUB_ERRORS.inClub();
        }
        await this.syncThread(club, [me]);
        return this.view(me);
    }

    async join(me: string, codeIn: unknown) {
        const code = parseClubCode(codeIn);
        if (!code) throw CLUB_ERRORS.invalid('code');
        const row = await this.canEnter(me);
        const club = (await this.clubs.findOne({ code }).lean()) as ClubRow | null;
        if (!club || (club.banned ?? []).includes(me)) throw CLUB_ERRORS.unavailable();
        const ids = await this.memberIds(club._id);
        if (await this.blockedWithAny(me, ids)) throw CLUB_ERRORS.unavailable();
        // the 30 cap: one conditional increment reserves the seat
        const r = await this.clubs.updateOne(
            { _id: club._id, size: { $lt: CLUB_LIMITS.members } },
            { $inc: { size: 1 } }
        );
        if (!(r?.modifiedCount ?? 0)) throw CLUB_ERRORS.unavailable();
        if (!(await this.seat(me, club._id, !!row))) {
            await this.clubs.updateOne({ _id: club._id }, { $inc: { size: -1 } });
            throw CLUB_ERRORS.inClub();
        }
        await this.chat.threads.updateOne({ _id: club.thread }, { $addToSet: { members: me } });
        await this.syncThread(club, await this.memberIds(club._id));
        return this.view(me);
    }

    /** Takes `who` out of their club (leave or removal); the last member out closes the club and its chat. */
    private async unseat(who: string, clubId: string): Promise<void> {
        const now = this.now();
        const r = await this.members.updateOne({ _id: who, club: clubId }, { $set: { club: '', leftAt: now } });
        if (!(r?.modifiedCount ?? 0)) return;
        await this.clubs.updateOne({ _id: clubId }, { $inc: { size: -1 } });
        const club = (await this.clubs.findById(clubId).lean()) as ClubRow | null;
        if (!club) return;
        await this.chat.threads.updateOne({ _id: club.thread }, { $pull: { members: who, muted: who } });
        const rest = await this.memberIds(clubId);
        if (!rest.length) {
            await this.clubs.deleteOne({ _id: clubId });
            await this.chat.messages.deleteMany({ thread: club.thread });
            await this.chat.threads.deleteOne({ _id: club.thread });
            return;
        }
        // the owner left: the longest-standing member takes over
        if (club.owner === who) await this.clubs.updateOne({ _id: clubId }, { $set: { owner: rest[0] } });
    }

    async leave(me: string) {
        const row = await this.memberRow(me);
        if (!row?.club) throw CLUB_ERRORS.noClub();
        await this.unseat(me, row.club);
        return this.view(me);
    }

    /** The owner removes a member (`to` = the opaque member id); the removed account cannot join this club again. */
    async remove(me: string, toIn: unknown) {
        if (typeof toIn !== 'string' || !/^[a-f0-9]{12}$/.test(toIn)) throw CLUB_ERRORS.invalid('to');
        const row = await this.memberRow(me);
        if (!row?.club) throw CLUB_ERRORS.noClub();
        const club = (await this.clubs.findById(row.club).lean()) as ClubRow | null;
        if (!club) throw CLUB_ERRORS.noClub();
        const ids = await this.memberIds(club._id);
        if (this.ownerOf(club, ids) !== me) throw CLUB_ERRORS.notOwner();
        const target = ids.find(id => memberId(club._id, id) === toIn);
        if (!target || target === me) throw CLUB_ERRORS.invalid('to');
        await this.clubs.updateOne({ _id: club._id }, { $addToSet: { banned: target } });
        await this.unseat(target, club._id);
        return this.view(me);
    }

    /** The owner, or the longest-standing member when the owner row is gone (an erased account). */
    private ownerOf(club: ClubRow, ids: readonly string[]): string {
        return ids.includes(club.owner) ? club.owner : ids[0] ?? club.owner;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // The weekly chest

    /**
     * The `/live` hook (pawlegends-party-live.ts, after the Game row): one verified win of a registered member adds
     * one to the club's weekly chest, once per room and account, at most CLUB_LIMITS.winsPerMemberPerDay a UTC day.
     * Never throws: the Game row and the catnip are the score, the chest is a meta track.
     */
    async applyClubChest(input: ClubChestInput): Promise<ClubChestGain | null> {
        try {
            if (!input.won || !input.registered) return null;
            const acc = String(input.accountId);
            const row = await this.memberRow(acc);
            if (!row?.club) return null;
            const now = input.now;
            const day = now.toISOString().slice(0, 10);
            const week = isoWeek(now);
            const id = `${row.club}:${week}`;
            if ((await this.wins.countDocuments({ acc, day })) >= CLUB_LIMITS.winsPerMemberPerDay) {
                const wk = await this.weeks.findById(id).lean();
                return { week, wins: Number(wk?.wins) || 0, counted: false };
            }
            try {
                await this.wins.create({
                    _id: `${input.room}:${acc}`,
                    acc,
                    club: row.club,
                    day,
                    exp: new Date(now.getTime() + WEEK_KEEP_MS),
                });
            } catch (error) {
                if ((error as { code?: unknown })?.code === 11000) return null;
                throw error;
            }
            const wk = await this.weeks
                .findOneAndUpdate(
                    { _id: id },
                    {
                        $inc: { wins: 1, [`by.${acc}`]: 1 },
                        $setOnInsert: { club: row.club, week, exp: new Date(now.getTime() + WEEK_KEEP_MS) },
                    },
                    { upsert: true, new: true }
                )
                .lean();
            return { week, wins: Number(wk?.wins) || 0, counted: true };
        } catch (error) {
            this.logger.warn(`club chest failed: ${String((error as Error)?.message || error).slice(0, 200)}`);
            return null;
        }
    }

    /** POST /pawlegends/clubs/chest/claim: every reached, unclaimed tier of this week and last week. */
    async claim(me: string) {
        const row = await this.memberRow(me);
        if (!row?.club) throw CLUB_ERRORS.noClub();
        const now = this.now();
        const got: string[] = [];
        let contributed = false;
        for (const week of [prevWeek(now), isoWeek(now)]) {
            const wk = (await this.weeks.findById(`${row.club}:${week}`).lean()) as {
                wins?: number;
                by?: Record<string, number>;
            } | null;
            if (!wk || !(Number(wk.by?.[me]) > 0)) continue;
            contributed = true;
            for (const tier of tiersReached(CLUB_CHEST_TIERS, Number(wk.wins) || 0)) {
                // the claim is recorded first (a crash in between loses a tier, never pays one twice)
                let fresh = false;
                try {
                    const r = await this.claims.updateOne(
                        { _id: `${me}:${week}`, tiers: { $ne: tier } },
                        { $addToSet: { tiers: tier }, $setOnInsert: { exp: new Date(now.getTime() + WEEK_KEEP_MS) } },
                        { upsert: true }
                    );
                    fresh = (r?.modifiedCount ?? 0) > 0 || (r?.upsertedCount ?? 0) > 0;
                } catch (error) {
                    if ((error as { code?: unknown })?.code !== 11000) throw error;
                }
                if (fresh) got.push(await payChest(this.store, me, 'club', CLUB_CHEST_YARN));
            }
        }
        if (!contributed) throw CLUB_ERRORS.needWin();
        return { got: got.map(g => ({ id: g, name: rewardName(g) })), ...(await this.view(me)) };
    }

    // ---------------------------------------------------------------------------------------------------------------
    // The view

    /** GET /pawlegends/clubs/me: the caller's club (or null), its members, the chat thread and the chest. */
    async view(me: string) {
        const row = await this.memberRow(me);
        const club = row?.club ? ((await this.clubs.findById(row.club).lean()) as ClubRow | null) : null;
        if (!club) return { club: null };
        const ids = await this.memberIds(club._id);
        const now = this.now();
        const week = isoWeek(now);
        const [wk, claimed, names, avatars, { tier }] = await Promise.all([
            this.weeks.findById(`${club._id}:${week}`).lean() as Promise<{
                wins?: number;
                by?: Record<string, number>;
            } | null>,
            this.claims.findById(`${me}:${week}`).lean() as Promise<{ tiers?: number[] } | null>,
            displayNames({ social: this.social.social, cats: this.social.cats }, ids),
            this.social.avatarsOf(ids),
            this.chat.tierOf(ids),
        ]);
        await this.syncThread(club, ids);
        const owner = this.ownerOf(club, ids);
        const wins = Number(wk?.wins) || 0;
        const took = new Set(claimed?.tiers ?? []);
        const mine = Number(wk?.by?.[me]) || 0;
        const reached = tiersReached(CLUB_CHEST_TIERS, wins);
        // last week's chest too (claimable until it is taken or the member leaves)
        const last = (await this.weeks.findById(`${club._id}:${prevWeek(now)}`).lean()) as {
            wins?: number;
            by?: Record<string, number>;
        } | null;
        const lastTook = new Set(
            ((await this.claims.findById(`${me}:${prevWeek(now)}`).lean()) as { tiers?: number[] } | null)?.tiers ?? []
        );
        const lastOpen =
            last && Number(last.by?.[me]) > 0
                ? tiersReached(CLUB_CHEST_TIERS, Number(last.wins) || 0).filter(t => !lastTook.has(t)).length
                : 0;
        const next = await previewReward(this.store, me, CLUB_CHEST_YARN);
        return {
            club: {
                code: formatClubCode(club.code),
                name: clubNameText(club.name[0], club.name[1]),
                size: ids.length,
                cap: CLUB_LIMITS.members,
                owner: owner === me,
                thread: club.thread,
                tier,
                members: ids.map(id => ({
                    mid: memberId(club._id, id),
                    name: names.get(id) ?? '',
                    av: avatars.get(id),
                    owner: id === owner,
                    you: id === me,
                    wins: Number(wk?.by?.[id]) || 0,
                })),
                chest: {
                    week,
                    endsAt: weekEndsAt(now).toISOString(),
                    wins,
                    tiers: CLUB_CHEST_TIERS,
                    claimed: [...took].sort(),
                    // a tier is open once reached and the member added a win this week
                    open: mine > 0 ? reached.filter(t => !took.has(t)).length + lastOpen : lastOpen,
                    mine,
                    perDay: CLUB_LIMITS.winsPerMemberPerDay,
                    next: { id: next, name: rewardName(next) },
                },
            },
        };
    }
}
