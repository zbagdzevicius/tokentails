import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cat } from 'src/cat/cat.schema';
import { PawlegendsMmRoom } from '../mm/mm-room.schema';
import type { MmRoomMember, MmRoomRecord } from '../mm/mm-room.schema';
import { pawlegendsError } from '../pawlegends.errors';
import { PawlegendsBuyer } from '../pawlegends.schema';
import { displayNames } from './display-name';
import { accountIntel, heroBaselines, intelZ, INTEL } from './intel';
import {
    isReportReason,
    isStoredReportReason,
    REPORT_FLAGS,
    REPORT_LIMITS,
    REPORTABLE_QUEUES,
    RESOLVE_ACTIONS,
    ResolveAction,
    SANCTION_KINDS,
    SanctionKind,
} from './report.contracts';
import { PawlegendsReport, PawlegendsSanction, PawlegendsSocial } from './social.schema';

/*
 * PvP player reports and their review (SOCIAL-RANKED.md §8, lane L1). A report stores the minimum: room, reporter,
 * target, reason, an optional moderator-only note (16+ bands only) and the tick. No IP, no name, no stats. The
 * reporter's id is never returned by any route. Sanctions are written only by the moderator resolve route; nothing is
 * applied automatically: the flags (F1..F5) only sort the review list.
 */

const DAY = 86_400_000;
const PAGE = 20;

type AnyModel = any;

export interface ReportInput {
    room?: unknown;
    slot?: unknown;
    reason?: unknown;
    note?: unknown;
    tick?: unknown;
}

const err = (status: HttpStatus, code: string, message: string) => pawlegendsError(status, code, message);
export const REPORT_ERRORS = {
    invalid: (m: string) => err(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_REPORT_INVALID', m),
    room: () => err(HttpStatus.NOT_FOUND, 'PAWLEGENDS_REPORT_ROOM', 'No PvP match you played with this id'),
    bot: () => err(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_REPORT_BOT', 'Bots cannot be reported'),
    self: () => err(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_REPORT_SELF', 'You cannot report yourself'),
    limit: () => err(HttpStatus.TOO_MANY_REQUESTS, 'PAWLEGENDS_REPORT_LIMIT', 'Too many reports, try later'),
};

const teamSizeOf = (room: Pick<MmRoomRecord, 'map'>) => (room.map === 'hearthwood' ? 5 : 3);
const teamOf = (room: Pick<MmRoomRecord, 'map'>, slot: number) => (slot >= teamSizeOf(room) ? 1 : 0);

/** The member of `slot` whose tenure covers `tick` (in match), else the slot's last holder (results). */
export function slotHolder(members: readonly MmRoomMember[], slot: number, tick?: number): MmRoomMember | null {
    const held = members.filter(m => m.slot === slot).sort((a, b) => a.joinedTick - b.joinedTick);
    if (!held.length) return null;
    if (tick === undefined) return held[held.length - 1];
    let pick = held[0];
    for (const m of held) if (m.joinedTick <= tick) pick = m;
    return pick;
}

@Injectable()
export class ReportService {
    private readonly logger = new Logger('PawlegendsReports');

    private intelCache: { atMs: number; baselines: ReturnType<typeof heroBaselines> } | null = null;

    constructor(
        @InjectModel(PawlegendsReport.name) private readonly reports: AnyModel,
        @InjectModel(PawlegendsSanction.name) private readonly sanctions: AnyModel,
        @InjectModel(PawlegendsMmRoom.name) private readonly rooms: AnyModel,
        @InjectModel(PawlegendsBuyer.name) private readonly buyers: AnyModel,
        @InjectModel(PawlegendsSocial.name) private readonly social: AnyModel,
        @Optional() @InjectModel(Cat.name) private readonly cats?: AnyModel,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    private now(): Date {
        return this.clock?.now() ?? new Date();
    }

    /** The account's stored age band (the store's `account:<id>` row), or null. */
    private async band(accountId: string): Promise<string | null> {
        const row = await this.buyers.findOne({ key: `account:${accountId}` }).lean();
        return (row?.ageBand as string) ?? null;
    }

    /**
     * File one report. Answers `{created: true}` for a new one, `{created: false}` for a repeat of the same
     * (room, reporter, target): the repeat is idempotent and may add the note once.
     */
    async report(reporter: { id: string; guest: boolean }, input: ReportInput): Promise<{ created: boolean }> {
        const roomId = typeof input.room === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(input.room) ? input.room : null;
        const slot = Number(input.slot);
        if (!roomId || !Number.isInteger(slot) || slot < 0 || slot > 9) throw REPORT_ERRORS.invalid('room and slot');
        if (!isReportReason(input.reason)) throw REPORT_ERRORS.invalid('reason');
        const tick =
            input.tick === undefined || input.tick === null
                ? undefined
                : Number.isInteger(Number(input.tick)) && Number(input.tick) >= 0
                ? Number(input.tick)
                : null;
        if (tick === null) throw REPORT_ERRORS.invalid('tick');
        let note: string | undefined;
        if (input.note !== undefined && input.note !== null && input.note !== '') {
            if (typeof input.note !== 'string' || input.note.length > REPORT_LIMITS.noteMax)
                throw REPORT_ERRORS.invalid('note');
            note = input.note.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || undefined;
        }

        const room = (await this.rooms.findById(roomId).lean()) as MmRoomRecord | null;
        if (!room || !(REPORTABLE_QUEUES as readonly string[]).includes(room.queue)) throw REPORT_ERRORS.room();
        if (!room.members.some(m => m.accountId === reporter.id)) throw REPORT_ERRORS.room();
        const now = this.now();
        const endedAt = room.endedAt ? new Date(room.endedAt).getTime() : null;
        const age = now.getTime() - (endedAt ?? new Date(room.createdAt).getTime());
        if (age > REPORT_LIMITS.afterEndMs) throw REPORT_ERRORS.room();
        const holder = slotHolder(room.members, slot, tick);
        if (!holder || !holder.accountId) throw REPORT_ERRORS.bot();
        if (holder.accountId === reporter.id) throw REPORT_ERRORS.self();
        const target = holder.accountId;

        // the note: moderators only, and only from the 16-17 and 18+ bands (under 16 and unknown: dropped)
        if (note) {
            const band = await this.band(reporter.id);
            if (band !== '16-17' && band !== '18+') note = undefined;
        }

        const existing = await this.reports.findOne({ room: roomId, reporter: reporter.id, target }).lean();
        if (existing) {
            if (note && !existing.note)
                await this.reports.updateOne({ _id: existing._id, note: { $exists: false } }, { $set: { note } });
            return { created: false };
        }
        const since = new Date(now.getTime() - DAY);
        const mine = await this.reports.countDocuments({ reporter: reporter.id, createdAt: { $gte: since } });
        if (mine >= (reporter.guest ? REPORT_LIMITS.perDayGuest : REPORT_LIMITS.perDay)) throw REPORT_ERRORS.limit();
        if (
            (await this.reports.countDocuments({ room: roomId, reporter: reporter.id })) >=
            REPORT_LIMITS.perRoomReporter
        )
            throw REPORT_ERRORS.limit();
        if ((await this.reports.countDocuments({ room: roomId, target })) >= REPORT_LIMITS.perRoom)
            throw REPORT_ERRORS.limit();

        const corroborated = input.reason === 'afk' && (holder.event === 'afk' || holder.event === 'left');
        try {
            await this.reports.create({
                room: roomId,
                queue: room.queue,
                reporter: reporter.id,
                target,
                guest: reporter.guest,
                reason: input.reason,
                ...(note ? { note } : {}),
                ...(tick !== undefined ? { tick } : {}),
                status: corroborated ? 'corroborated' : 'open',
                createdAt: now,
                expireAt: new Date(now.getTime() + REPORT_LIMITS.keepDays * DAY),
            });
        } catch (error) {
            if ((error as { code?: unknown })?.code === 11000) return { created: false };
            throw error;
        }
        return { created: true };
    }

    // ------------------------------------------------------------------------------------------------------------
    // Sanctions (read by mm.join, the boards and /ranked/me)
    // ------------------------------------------------------------------------------------------------------------

    /** The account's sanctions in force now (a lock with a future `until`, or a permanent one). Warns excluded. */
    async active(accountId: string): Promise<Array<{ kind: SanctionKind; until: Date | null }>> {
        const now = this.now();
        const rows = (await this.sanctions
            .find({ accountId, kind: { $ne: 'warn' }, $or: [{ until: null }, { until: { $gt: now } }] })
            .lean()) as Array<{ kind: SanctionKind; until: Date | null }>;
        return rows.map(r => ({ kind: r.kind, until: r.until ?? null }));
    }

    // ------------------------------------------------------------------------------------------------------------
    // Moderator views
    // ------------------------------------------------------------------------------------------------------------

    private async baselines() {
        const nowMs = this.now().getTime();
        if (this.intelCache && nowMs - this.intelCache.atMs < 3600_000) return this.intelCache.baselines;
        const rooms = (await this.rooms
            .find({
                queue: { $in: [...REPORTABLE_QUEUES] },
                createdAt: { $gte: new Date(nowMs - REPORT_FLAGS.windowDays * DAY) },
                'members.intel': { $exists: true },
            })
            .select({ members: 1 })
            .limit(20_000)
            .lean()) as MmRoomRecord[];
        const baselines = heroBaselines(rooms);
        this.intelCache = { atMs: nowMs, baselines };
        return baselines;
    }

    /** The target's last PvP rooms, newest first. */
    private async pvpRooms(accountId: string, limit: number, since?: Date): Promise<MmRoomRecord[]> {
        const rows = (await this.rooms
            .find({
                'members.accountId': accountId,
                queue: { $in: [...REPORTABLE_QUEUES] },
                ...(since ? { createdAt: { $gte: since } } : {}),
            })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean()) as MmRoomRecord[];
        return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    /** F4: an opponent met more than 3 times in 7 days with more than 70% of the results one way. */
    winTradePairs(rooms: readonly MmRoomRecord[], accountId: string): string[] {
        const meet = new Map<string, { n: number; wins: number }>();
        for (const room of rooms) {
            if (room.void || !room.outcome) continue;
            const me = room.members.find(m => m.accountId === accountId);
            if (!me) continue;
            const myTeam = teamOf(room, me.slot);
            const won = (room.outcome === 'won') === (myTeam === 0);
            for (const o of room.members) {
                if (!o.accountId || o.accountId === accountId || teamOf(room, o.slot) === myTeam) continue;
                const s = meet.get(o.accountId) ?? { n: 0, wins: 0 };
                s.n += 1;
                if (won) s.wins += 1;
                meet.set(o.accountId, s);
            }
        }
        return [...meet.entries()]
            .filter(([, s]) => s.n > 3 && Math.max(s.wins, s.n - s.wins) / s.n > 0.7)
            .map(([id]) => id);
    }

    /** Report groups per target, flagged first (§8.5). */
    async list(query: { status?: unknown; reason?: unknown; flag?: unknown; page?: unknown }) {
        const now = this.now();
        const since = new Date(now.getTime() - REPORT_FLAGS.windowDays * DAY);
        const status =
            typeof query.status === 'string' &&
            ['open', 'corroborated', 'actioned', 'dismissed', 'all'].includes(query.status)
                ? query.status
                : 'open';
        const filter: Record<string, unknown> = { createdAt: { $gte: since } };
        if (status === 'open') filter.status = { $in: ['open', 'corroborated'] };
        else if (status !== 'all') filter.status = status;
        if (isStoredReportReason(query.reason)) filter.reason = query.reason;
        const rows = (await this.reports.find(filter).sort({ createdAt: -1 }).limit(5000).lean()) as Array<{
            _id: unknown;
            room: string;
            reporter: string;
            target: string;
            reason: string;
            status: string;
            createdAt: Date;
        }>;
        const week = now.getTime() - REPORT_FLAGS.f1Days * DAY;
        const groups = new Map<
            string,
            {
                counts: Record<string, number>;
                reporters7d: Set<string>;
                rooms: Set<string>;
                rooms7d: Set<string>;
                afk7d: number;
                last: number;
            }
        >();
        for (const r of rows) {
            const g = groups.get(r.target) ?? {
                counts: {},
                reporters7d: new Set<string>(),
                rooms: new Set<string>(),
                rooms7d: new Set<string>(),
                afk7d: 0,
                last: 0,
            };
            g.counts[r.reason] = (g.counts[r.reason] ?? 0) + 1;
            g.rooms.add(r.room);
            const at = new Date(r.createdAt).getTime();
            g.last = Math.max(g.last, at);
            if (at >= week) {
                g.reporters7d.add(r.reporter);
                g.rooms7d.add(r.room);
                if (r.reason === 'afk' && r.status === 'corroborated') g.afk7d += 1;
            }
            groups.set(r.target, g);
        }
        const baselines = await this.baselines();
        const targets = [...groups.keys()];
        const names = await displayNames({ social: this.social, cats: this.cats }, targets);
        const out = [];
        for (const target of targets) {
            const g = groups.get(target)!;
            const recent = await this.pvpRooms(target, Math.max(REPORT_FLAGS.f2MinRooms, INTEL.lastRooms));
            const flags: string[] = [];
            if (g.reporters7d.size >= REPORT_FLAGS.f1Reporters && g.rooms7d.size >= REPORT_FLAGS.f1Rooms)
                flags.push('F1');
            if (recent.length >= REPORT_FLAGS.f2MinRooms) {
                const reported = recent.filter(r => g.rooms.has(r._id)).length;
                if (reported / recent.length >= REPORT_FLAGS.f2Share) flags.push('F2');
            }
            const intel = intelZ(accountIntel(recent, target), baselines);
            if (intel.z !== null && intel.z > REPORT_FLAGS.f3Z) flags.push('F3');
            const week7 = recent.filter(r => new Date(r.createdAt).getTime() >= week);
            const pairs = this.winTradePairs(week7, target);
            if (pairs.length) flags.push('F4');
            if (g.afk7d >= REPORT_FLAGS.f5Afk) flags.push('F5');
            // F6 (CHAT-AVATARS.md §2.6): 20 chat filter rejections today
            const strikes = (await this.social.findOne({ _id: target }).select({ chatStrikes: 1 }).lean()) as {
                chatStrikes?: { day: string; n: number } | null;
            } | null;
            if (
                strikes?.chatStrikes?.day === now.toISOString().slice(0, 10) &&
                strikes.chatStrikes.n >= REPORT_FLAGS.f6Strikes
            )
                flags.push('F6');
            out.push({
                target: { accountId: target, name: names.get(target) },
                counts: g.counts,
                reporters7d: g.reporters7d.size,
                rooms: g.rooms.size,
                flags,
                intel: intel.z === null && !intel.matches ? null : { z: intel.z, matches: intel.matches },
                lastAt: new Date(g.last),
            });
        }
        const flagOnly = query.flag === '1' || query.flag === 1 || query.flag === true;
        const sorted = out
            .filter(g => !flagOnly || g.flags.length)
            .sort(
                (a, b) =>
                    b.flags.length - a.flags.length ||
                    Object.values(b.counts).reduce((x, y) => x + y, 0) -
                        Object.values(a.counts).reduce((x, y) => x + y, 0) ||
                    b.lastAt.getTime() - a.lastAt.getTime()
            );
        const flagged = sorted.filter(g => g.flags.length).length;
        // the daily alert line (Terraform log alert, infra workflow)
        if (flagged) this.logger.log(`pl_reports_flagged ${JSON.stringify({ count: flagged })}`);
        const page = Math.max(0, Math.floor(Number(query.page) || 0));
        return { groups: sorted.slice(page * PAGE, page * PAGE + PAGE), total: sorted.length, page, pageSize: PAGE };
    }

    /** One target: the reports (with notes), each room's queue, team, member events and referee intel. */
    async detail(accountId: string) {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountId)) throw REPORT_ERRORS.invalid('account');
        const now = this.now();
        const rows = (await this.reports
            .find({ target: accountId, createdAt: { $gte: new Date(now.getTime() - 90 * DAY) } })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean()) as Array<Record<string, any>>;
        const roomIds = [...new Set(rows.filter(r => r.reason !== 'chat').map(r => r.room as string))];
        const rooms = (await this.rooms.find({ _id: { $in: roomIds } }).lean()) as MmRoomRecord[];
        const byId = new Map(rooms.map(r => [r._id, r]));
        const sanctions = (await this.sanctions.find({ accountId }).sort({ createdAt: -1 }).limit(50).lean()) as Array<
            Record<string, any>
        >;
        const recent = await this.pvpRooms(accountId, INTEL.lastRooms);
        const intel = intelZ(accountIntel(recent, accountId), await this.baselines());
        const names = await displayNames({ social: this.social, cats: this.cats }, [accountId]);
        return {
            target: { accountId, name: names.get(accountId) },
            intel,
            // the reporter is never in the answer (the name_reports rule)
            reports: rows.map(r => ({
                id: String(r._id),
                room: r.room,
                queue: r.queue,
                reason: r.reason,
                note: r.note ?? null,
                tick: r.tick ?? null,
                // chat reports: the sub-reason and the copied message with its context (moderators only)
                ...(r.reason === 'chat' ? { chatKind: r.chatKind ?? null, snapshot: r.snapshot ?? null } : {}),
                status: r.status,
                createdAt: r.createdAt,
            })),
            rooms: roomIds.map(id => {
                const room = byId.get(id);
                if (!room) return { room: id, gone: true };
                const me = room.members.filter(m => m.accountId === accountId);
                return {
                    room: id,
                    queue: room.queue,
                    map: room.map ?? 'crossing',
                    team: me.length ? teamOf(room, me[0].slot) : null,
                    outcome: room.outcome ?? null,
                    void: room.void ?? null,
                    createdAt: room.createdAt,
                    endedAt: room.endedAt ?? null,
                    members: me.map(m => ({
                        slot: m.slot,
                        joinedTick: m.joinedTick,
                        backfill: m.backfill,
                        event: m.event ?? null,
                        eventTick: m.eventTick ?? null,
                        intel: m.intel ?? null,
                    })),
                    // runReplay takes the room id until the M3 replay viewer ships
                    replay: id,
                };
            }),
            sanctions: sanctions.map(s => ({
                id: String(s._id),
                kind: s.kind,
                until: s.until ?? null,
                reasonCode: s.reasonCode,
                createdAt: s.createdAt,
            })),
        };
    }

    /** Resolve every open report of a target: dismiss, or write one sanction. */
    async resolve(
        accountId: string,
        moderator: string,
        body: { action?: unknown; days?: unknown; reasonCode?: unknown }
    ) {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(accountId)) throw REPORT_ERRORS.invalid('account');
        const action = body.action as ResolveAction;
        if (!(RESOLVE_ACTIONS as readonly string[]).includes(String(action))) throw REPORT_ERRORS.invalid('action');
        const reasonCode =
            typeof body.reasonCode === 'string' && /^[a-z0-9_]{1,40}$/.test(body.reasonCode) ? body.reasonCode : null;
        if (!reasonCode) throw REPORT_ERRORS.invalid('reasonCode');
        // chat_mute: 1, 7 or 30 days, or permanent when no days are sent (CHAT-AVATARS.md §3.4)
        const timed =
            action === 'queue_lock' ||
            action === 'ranked_lock' ||
            (action === 'chat_mute' && body.days !== undefined && body.days !== null);
        const days = Number(body.days);
        if (timed && (!Number.isInteger(days) || days < 1 || days > 365)) throw REPORT_ERRORS.invalid('days');
        const now = this.now();
        const open = (await this.reports
            .find({ target: accountId, status: { $in: ['open', 'corroborated'] } })
            .select({ _id: 1 })
            .lean()) as Array<{ _id: unknown }>;
        const ids = open.map(r => r._id);
        if (action === 'dismiss') {
            await this.reports.updateMany(
                { _id: { $in: ids } },
                {
                    $set: {
                        status: 'dismissed',
                        expireAt: new Date(now.getTime() + REPORT_LIMITS.keepDismissedDays * DAY),
                    },
                }
            );
            return { updated: ids.length, sanction: null };
        }
        if (!(SANCTION_KINDS as readonly string[]).includes(action)) throw REPORT_ERRORS.invalid('action');
        const until = timed ? new Date(now.getTime() + days * DAY) : null;
        const sanction = await this.sanctions.create({
            accountId,
            kind: action,
            until,
            by: moderator,
            reasonCode,
            reports: ids.map(String),
            seenAt: null,
            createdAt: now,
        });
        await this.reports.updateMany({ _id: { $in: ids } }, { $set: { status: 'actioned' } });
        return { updated: ids.length, sanction: { id: String(sanction._id), kind: action, until } };
    }

    /**
     * The 1% trigger (PARITY §3.10 item 4): PvP and ranked matches in the window, map-hack reports a moderator acted
     * on (distinct rooms), and the rate.
     */
    async stats(daysIn: unknown) {
        const days = Math.min(90, Math.max(1, Math.floor(Number(daysIn) || 14)));
        const since = new Date(this.now().getTime() - days * DAY);
        const [pvpMatches, rankedMatches] = await Promise.all([
            this.rooms.countDocuments({
                queue: { $in: [...REPORTABLE_QUEUES] },
                createdAt: { $gte: since },
                void: { $ne: 'remake' },
            }),
            this.rooms.countDocuments({ queue: 'ranked', createdAt: { $gte: since }, void: { $ne: 'remake' } }),
        ]);
        const confirmed = (await this.reports
            .find({ reason: 'cheat', status: 'actioned', createdAt: { $gte: since } })
            .select({ room: 1 })
            .lean()) as Array<{ room: string }>;
        const mapHackConfirmed = new Set(confirmed.map(r => r.room)).size;
        const reportsTotal = await this.reports.countDocuments({ createdAt: { $gte: since } });
        const base = rankedMatches || pvpMatches;
        return {
            days,
            pvpMatches,
            rankedMatches,
            reports: reportsTotal,
            mapHackConfirmed,
            rate: base ? Math.round((mapHackConfirmed / base) * 10_000) / 10_000 : 0,
            base: rankedMatches ? 'ranked' : 'pvp',
        };
    }

    /** A warn not yet shown (the title card); marks it seen. */
    async takeWarn(accountId: string): Promise<boolean> {
        const row = await this.sanctions.findOneAndUpdate(
            { accountId, kind: 'warn', seenAt: null },
            { $set: { seenAt: this.now() } },
            { new: true }
        );
        return !!row;
    }
}
