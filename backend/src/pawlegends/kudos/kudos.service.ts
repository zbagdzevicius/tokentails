import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { pawlegendsError } from '../pawlegends.errors';
import { PawlegendsStore } from '../pawlegends.schema';
import { MongoRoomStore } from '../party/room-store';
import type { StoredParty, StoredRoom } from '../party/room-store';
import { ChatService } from '../social/chat.service';
import { payChest, previewReward, rewardName } from '../clubs/club-rewards';
import {
    KUDOS_CHEST_TIERS,
    KUDOS_CHEST_YARN,
    KUDOS_PER_DAY,
    KUDOS_WINDOW_MS,
    monthKey,
    tiersReached,
} from '../clubs/clubs.contracts';
import { PawlegendsKudos, PawlegendsKudosMonth } from '../clubs/clubs.schema';

/*
 * Good-teammate kudos (docs/plans/moba/CLUBS-KUDOS.md §5): after a PvP match a registered player gives a thumbs-up to a
 * teammate from the results screen. Checked against the stored room, never the client: the room ended verified, is a
 * PvP room that was not voided and ended within 2 hours; both are seated in it on the same team; the teammate is a
 * registered account and not a pre-made party mate (the matched party's `premade` slot groups; a friends' own party
 * room is all pre-made); no block either way. Once per teammate per match (the row id), 40 a day. Received kudos fill
 * the monthly good-teammate chest, which pays the next free-row item the player does not own, else Yarn.
 */

type AnyModel = any;
const DAY = 86_400_000;

const err = (status: HttpStatus, code: string, message: string) => pawlegendsError(status, code, message);
export const KUDOS_ERRORS = {
    needAccount: () => err(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', 'Sign in to give a thumbs-up'),
    invalid: (m: string) => err(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_KUDOS_INVALID', m),
    /** Not your match, not a teammate, a bot or guest seat, too late, or a block: one answer. */
    unavailable: () => err(HttpStatus.FORBIDDEN, 'PAWLEGENDS_KUDOS_UNAVAILABLE', 'No thumbs-up for this player'),
    premade: () => err(HttpStatus.FORBIDDEN, 'PAWLEGENDS_KUDOS_PREMADE', 'Party mates do not count'),
    rate: () => err(HttpStatus.TOO_MANY_REQUESTS, 'PAWLEGENDS_KUDOS_RATE', 'That is a lot of thumbs-ups today'),
};

const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface KudosRooms {
    get(id: string): Promise<StoredRoom | null>;
    getParty(id: string): Promise<StoredParty | null>;
}

/** The pre-made slot groups of a matched room, or null when the room is a friends' own party (all pre-made). */
export function premadeGroups(party: StoredParty | null): number[][] | null {
    const mm = (party?.doc as { mm?: { casual?: { premade?: unknown } } } | undefined)?.mm;
    if (!mm) return null;
    const groups = mm.casual?.premade;
    return Array.isArray(groups)
        ? groups.filter((g): g is number[] => Array.isArray(g) && g.every(n => Number.isInteger(n)))
        : [];
}

@Injectable()
export class KudosService {
    constructor(
        @InjectModel(PawlegendsKudos.name) readonly kudos: AnyModel,
        @InjectModel(PawlegendsKudosMonth.name) readonly months: AnyModel,
        private readonly chat: ChatService,
        private readonly store: PawlegendsStore,
        private readonly rooms: MongoRoomStore,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    now(): Date {
        return this.clock?.now() ?? new Date();
    }

    /** POST /pawlegends/kudos `{room, slot}`. */
    async give(me: string, roomIn: unknown, slotIn: unknown): Promise<{ ok: true; already?: boolean }> {
        if (typeof roomIn !== 'string' || !ROOM_RE.test(roomIn)) throw KUDOS_ERRORS.invalid('room');
        const slot = Number(slotIn);
        if (!Number.isInteger(slot) || slot < 0 || slot > 9) throw KUDOS_ERRORS.invalid('slot');
        const rooms = this.rooms as unknown as KudosRooms;
        const room = await rooms.get(roomIn);
        const now = this.now();
        if (
            !room ||
            room.status !== 'ended' ||
            room.verdict?.verified !== true ||
            room.config?.mode !== 'pvp' ||
            room.void ||
            now.getTime() - new Date(room.updatedAt).getTime() > KUDOS_WINDOW_MS
        )
            throw KUDOS_ERRORS.unavailable();
        const teamSize = room.config.map === 'hearthwood' ? 5 : 3;
        const teamOf = (s: number) => (s >= teamSize ? 1 : 0);
        const mine = room.occupants.find(o => o.accountId === me);
        const them = room.occupants.find(o => o.slot === slot);
        if (!mine || !them?.accountId || them.accountId === me || teamOf(mine.slot) !== teamOf(slot))
            throw KUDOS_ERRORS.unavailable();
        const to = them.accountId;
        const reg = await this.chat.registered([me, to]);
        if (!reg.has(me)) throw KUDOS_ERRORS.needAccount();
        if (!reg.has(to)) throw KUDOS_ERRORS.unavailable();
        const groups = premadeGroups(await rooms.getParty(room.party).catch(() => null));
        if (!groups || groups.some(g => g.includes(mine.slot) && g.includes(slot))) throw KUDOS_ERRORS.premade();
        if ((await this.chat.blockedAmong(me, [to])).size) throw KUDOS_ERRORS.unavailable();
        const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        if ((await this.kudos.countDocuments({ from: me, at: { $gte: dayStart } })) >= KUDOS_PER_DAY)
            throw KUDOS_ERRORS.rate();
        try {
            await this.kudos.create({
                _id: `${room._id}:${me}:${to}`,
                from: me,
                to,
                at: now,
                exp: new Date(now.getTime() + 60 * DAY),
            });
        } catch (error) {
            if ((error as { code?: unknown })?.code === 11000) return { ok: true, already: true };
            throw error;
        }
        await this.fill(to, now);
        return { ok: true };
    }

    /** One received kudos: the month's count, then every newly reached chest tier paid once. */
    private async fill(to: string, now: Date) {
        const id = `${to}:${monthKey(now)}`;
        const row = await this.months
            .findOneAndUpdate(
                { _id: id },
                { $inc: { n: 1 }, $setOnInsert: { paid: [], got: [], exp: new Date(now.getTime() + 70 * DAY) } },
                { upsert: true, new: true }
            )
            .lean();
        for (const tier of tiersReached(KUDOS_CHEST_TIERS, Number(row?.n) || 0)) {
            if ((row?.paid ?? []).includes(tier)) continue;
            const r = await this.months.updateOne({ _id: id, paid: { $ne: tier } }, { $addToSet: { paid: tier } });
            if (!(r?.modifiedCount ?? 0)) continue;
            const got = await payChest(this.store, to, 'kudos', KUDOS_CHEST_YARN);
            await this.months.updateOne({ _id: id }, { $push: { got } });
        }
    }

    /** GET /pawlegends/kudos/me: this month's thumbs-ups, the tiers and what the chest gave and gives next. */
    async me(me: string) {
        const now = this.now();
        const row = (await this.months.findById(`${me}:${monthKey(now)}`).lean()) as {
            n?: number;
            paid?: number[];
            got?: string[];
        } | null;
        const next = await previewReward(this.store, me, KUDOS_CHEST_YARN);
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        return {
            month: monthKey(now),
            endsAt: end.toISOString(),
            n: Number(row?.n) || 0,
            tiers: KUDOS_CHEST_TIERS,
            paid: row?.paid ?? [],
            got: (row?.got ?? []).map(g => ({ id: g, name: rewardName(g) })),
            next: { id: next, name: rewardName(next) },
        };
    }
}
