import { Injectable } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import {
    CAMEO_KINDS,
    CAMEO_LOADS_GUARANTEE,
    CAMEO_SHUFFLES,
    CAMEO_WEIGHTS,
    CameoBundle,
    CameoEntry,
    CameoKind,
    FACE_MAX_BYTES,
    FRIDGE_CAMEO_WEIGHT,
    FRIDGE_MAGNETS,
    MAX_GUEST_STARS,
    MAX_SPECTATORS,
    SeenResponse,
} from './badcat.contracts';
import { BADCAT_ERRORS } from './badcat.errors';
import { Env } from './badcat-flags';
import { BadcatStore } from './badcat.schema';
import { BadcatAccountService } from './badcat-account.service';
import {
    dayNoOf,
    filterName,
    hash32,
    isCatCode,
    isInt,
    shuffleSeed,
    weekdayOf,
    weekStartOf,
    weightedSample,
    xorshift32,
} from './badcat-util';

/*
 * Cameos (GDD 6.5). Each page load gets one of CAMEO_SHUFFLES shuffles of the day; a shuffle is a seeded,
 * weighted sample of the day's pool, built once and stored in `badcatshuffles`. A bundle can be built
 * before its day starts (players east of UTC ask for tomorrow), so rows booked for its own day after it was
 * stored are merged in on read (`mergeLate`): late guest stars always show, late spectators take a free or
 * unpaid seat. Every request adds one to that shuffle's load counter; a cat's
 * seen count and a cameo's load count are sums of the counters of the shuffles it is in. No per-cat writes,
 * no personal data in counters.
 */

/** Paid, guest star and gift cameos stay in later days' pools until they reach the load guarantee. */
export const CARRY_KINDS: CameoKind[] = ['paid', 'guest_star', 'gift'];
/** How many days back a cameo still short of its guarantee is carried. */
export const CARRY_DAYS = 30;
/** Oldest day a bundle may be asked for (archive replays), relative to today. */
export const ARCHIVE_DAYS_BACK = 400;
/** Admin-granted cameo kinds (`POST /badcat/admin/cameo`). */
export const ADMIN_CAMEO_KINDS: CameoKind[] = ['free', 'streak', 'reply', 'community', 'pinkpaw'];

/** Rows created this close before a stored shuffle still count as late (the build reads, then stores). */
export const LATE_MARGIN_MS = 10_000;

export const loadKey = (dayNo: number, shuffle: number) => `load:${dayNo}:${shuffle}`;
export const typedKey = (date: string) => `typed:${date}`;
export const facePath = (faceId: string) => `/badcat/face/${faceId}.png`;

interface PoolItem {
    entry: CameoEntry;
    weight: number;
    cameoId?: string;
}

/** Keeps one item per cat code (the heaviest; ties: the first), in a stable order by id. */
function dedupe(items: PoolItem[]): PoolItem[] {
    const best = new Map<string, PoolItem>();
    for (const item of items) {
        const seen = best.get(item.entry.catCode);
        if (!seen || item.weight > seen.weight) best.set(item.entry.catCode, item);
    }
    return [...best.values()].sort((a, b) => (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));
}

/** A stored entry without any face (faces are attached at read time). */
const stripFace = (entry: CameoEntry): CameoEntry => {
    const rest: CameoEntry = { ...entry };
    delete rest.faceUrl;
    return rest;
};

@Injectable()
export class BadcatCameoService {
    now: () => Date = () => new Date();

    constructor(private readonly store: BadcatStore, private readonly account: BadcatAccountService) {}

    /** Checks `day` and `s`; throws 400. Returns today's day number. */
    checkDay(dayNo: number, shuffle: number): number {
        const today = dayNoOf(this.now());
        if (!isInt(dayNo) || dayNo > today + 1 || dayNo < today - ARCHIVE_DAYS_BACK) {
            throw BADCAT_ERRORS.invalid('day is out of range');
        }
        if (!isInt(shuffle) || shuffle < 0 || shuffle >= CAMEO_SHUFFLES) {
            throw BADCAT_ERRORS.invalid(`s must be 0..${CAMEO_SHUFFLES - 1}`);
        }
        return today;
    }

    /** Spectator loads of cameos so far (sum of the load counters of the shuffles that showed them). */
    async loadsOf(cameoIds: string[]): Promise<Map<string, number>> {
        const loads = new Map<string, number>(cameoIds.map(id => [id, 0]));
        if (!cameoIds.length) return loads;
        const shuffles = (await this.store.shuffles.find({ cameoIds: { $in: cameoIds } }).lean()) as any[];
        const counts = await this.counterValues(shuffles.map(row => loadKey(row.dayNo, row.shuffle)));
        for (const row of shuffles) {
            const n = counts.get(loadKey(row.dayNo, row.shuffle)) || 0;
            // A cameo merged in late counts only the loads after it joined (`lateBase`: the counter then).
            const base = (row.lateBase || {}) as Record<string, number>;
            for (const id of row.cameoIds as string[]) {
                if (loads.has(id)) loads.set(id, loads.get(id)! + Math.max(0, n - (base[id] || 0)));
            }
        }
        return loads;
    }

    async counterValues(keys: string[]): Promise<Map<string, number>> {
        const values = new Map<string, number>();
        if (!keys.length) return values;
        const rows = (await this.store.counters.find({ key: { $in: [...new Set(keys)] } }).lean()) as any[];
        for (const row of rows) values.set(row.key, row.n || 0);
        return values;
    }

    /** Cameo session ids whose purchase was refunded or whose gift was canceled (never shown). */
    async voidedSessions(rows: any[]): Promise<Set<string>> {
        const voided = new Set<string>();
        const sessionIds = rows.map(row => row.sessionId).filter((id): id is string => typeof id === 'string');
        const paid = sessionIds.filter(id => !id.startsWith('gift:') && !id.startsWith('admin:'));
        const codes = sessionIds.filter(id => id.startsWith('gift:')).map(id => id.slice(5));
        if (paid.length) {
            const refunded = (await this.store.purchases
                .find({ sessionId: { $in: paid }, status: 'refunded' })
                .lean()) as any[];
            for (const row of refunded) voided.add(row.sessionId);
        }
        if (codes.length) {
            const canceled = (await this.store.gifts
                .find({ code: { $in: codes }, canceledAt: { $exists: true } })
                .lean()) as any[];
            for (const row of canceled) if (row.canceledAt) voided.add(`gift:${row.code}`);
        }
        return voided;
    }

    /** The pool and the sample of (day, shuffle); pure apart from the reads. */
    async build(
        dayNo: number,
        shuffle: number
    ): Promise<{ bundle: CameoBundle; cameoIds: string[]; catCodes: string[] }> {
        const now = this.now();
        const dayRows = ((await this.store.cameos.find({ dayNo, hidden: { $ne: true } }).lean()) as any[]).filter(
            row => CAMEO_KINDS.includes(row.kind) && row.kind !== 'club'
        );
        const carryRows = (await this.store.cameos
            .find({
                dayNo: { $gte: dayNo - CARRY_DAYS, $lt: dayNo },
                kind: { $in: CARRY_KINDS },
                hidden: { $ne: true },
            })
            .lean()) as any[] as any[];
        const voided = await this.voidedSessions([...dayRows, ...carryRows]);
        if (voided.size) {
            for (const list of [dayRows, carryRows]) {
                for (let i = list.length - 1; i >= 0; i--) if (voided.has(list[i].sessionId)) list.splice(i, 1);
            }
        }
        const carryLoads = await this.loadsOf(carryRows.map(row => String(row._id)));
        const carried = carryRows.filter(row => (carryLoads.get(String(row._id)) || 0) < CAMEO_LOADS_GUARANTEE);

        const cameoItem = (row: any): PoolItem => ({
            entry: { id: String(row._id), name: filterName(row.name), catCode: row.catCode, kind: row.kind },
            weight: CAMEO_WEIGHTS[row.kind as CameoKind] ?? 1,
            cameoId: String(row._id),
        });

        const clubEmails = await this.account.activeClubEmails(now);
        const clubRows = clubEmails.size
            ? ((await this.store.clubCats.find({ email: { $in: [...clubEmails] } }).lean()) as any[])
            : [];
        const clubItem = (row: any): PoolItem => ({
            entry: {
                id: `club:${String(row._id)}`,
                name: filterName(row.name),
                catCode: row.catCode,
                kind: 'club',
                club: true,
            },
            weight: CAMEO_WEIGHTS.club,
        });
        // One weekly cameo per Club cat: the weekday picked by a hash of the member's email.
        const weekday = weekdayOf(dayNo);
        const weeklyClub = clubRows.filter(row => hash32('badcat-club-day', row.email) % 7 === weekday);

        const rng = xorshift32(shuffleSeed(dayNo, shuffle));
        const spectatorPool = dedupe([
            ...dayRows.map(cameoItem),
            ...carried.map(cameoItem),
            ...weeklyClub.map(clubItem),
        ]);
        const spectators = weightedSample(
            spectatorPool.map(item => ({ item, weight: item.weight })),
            MAX_SPECTATORS,
            rng
        );
        const fridgePool = dedupe([
            ...clubRows.map(clubItem),
            ...[...dayRows, ...carried].map(row => ({ ...cameoItem(row), weight: FRIDGE_CAMEO_WEIGHT })),
        ]);
        const fridge = weightedSample(
            fridgePool.map(item => ({ item, weight: item.weight })),
            FRIDGE_MAGNETS,
            rng
        );
        const guestStars = dayRows
            .filter(row => row.kind === 'guest_star')
            .sort(
                (a, b) =>
                    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
                    (String(a._id) < String(b._id) ? -1 : 1)
            )
            .slice(0, MAX_GUEST_STARS)
            .map(cameoItem);

        const cameoIds = [
            ...new Set([...spectators, ...guestStars].map(item => item.cameoId).filter(Boolean) as string[]),
        ];
        const catCodes = [...new Set([...spectators, ...fridge, ...guestStars].map(item => item.entry.catCode))];
        return {
            bundle: {
                dayNo,
                shuffle,
                spectators: spectators.map(item => item.entry),
                fridge: fridge.map(item => item.entry),
                guestStars: guestStars.map(item => item.entry),
                source: 'server',
            },
            cameoIds,
            catCodes,
        };
    }

    /**
     * GET /badcat/cameos?day=&s=: the stored bundle of (day, shuffle), built and stored on first request;
     * one counter increment per request. Faces are attached at read time (approved only).
     */
    async bundle(dayNo: number, shuffle: number): Promise<CameoBundle> {
        this.checkDay(dayNo, shuffle);
        let stored = (await this.store.shuffles.findOne({ dayNo, shuffle }).lean()) as any;
        if (stored) {
            stored = await this.mergeLate(stored);
        } else {
            const built = await this.build(dayNo, shuffle);
            stored = await this.store.shuffles
                .findOneAndUpdate(
                    { dayNo, shuffle },
                    {
                        $setOnInsert: {
                            spectators: built.bundle.spectators,
                            fridge: built.bundle.fridge,
                            guestStars: built.bundle.guestStars,
                            cameoIds: built.cameoIds,
                            catCodes: built.catCodes,
                        },
                    },
                    { upsert: true, new: true }
                )
                .lean();
        }
        await this.store.counters.updateOne({ key: loadKey(dayNo, shuffle) }, { $inc: { n: 1 } }, { upsert: true });
        const faces = await this.approvedFaces(stored.catCodes || []);
        const withFace = (entry: CameoEntry): CameoEntry => ({
            ...stripFace(entry),
            name: filterName(entry.name),
            faceUrl: faces.get(entry.catCode) ?? null,
        });
        return {
            dayNo,
            shuffle,
            spectators: (stored.spectators || []).map(withFace),
            fridge: (stored.fridge || []).map(withFace),
            guestStars: (stored.guestStars || []).map(withFace),
            source: 'server',
        };
    }

    /**
     * Rows booked for the stored bundle's own day after it was built (a purchase made after an east-of-UTC
     * player froze tomorrow's shuffles, or a same-day cameo): guest stars join `guestStars`, other rows take
     * an empty spectator seat or replace an unpaid one. Written back only when something changed.
     */
    async mergeLate(stored: any): Promise<any> {
        const dayNo = stored.dayNo;
        const known = new Set<string>([
            ...((stored.cameoIds as string[]) || []),
            ...((stored.lateIds as string[]) || []),
        ]);
        // A margin covers rows written while the bundle was being built (read, then stored).
        const builtAt = stored.createdAt ? new Date(stored.createdAt).getTime() - LATE_MARGIN_MS : 0;
        const rows = ((await this.store.cameos.find({ dayNo, hidden: { $ne: true } }).lean()) as any[]).filter(
            row =>
                CAMEO_KINDS.includes(row.kind) &&
                row.kind !== 'club' &&
                !known.has(String(row._id)) &&
                (!row.createdAt || new Date(row.createdAt).getTime() >= builtAt)
        );
        if (!rows.length) return stored;
        const voided = await this.voidedSessions(rows);
        const late = rows
            .filter(row => !voided.has(row.sessionId))
            .sort(
                (a, b) =>
                    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
                    (String(a._id) < String(b._id) ? -1 : 1)
            );
        if (!late.length) return stored;
        const entryOf = (row: any): CameoEntry => ({
            id: String(row._id),
            name: filterName(row.name),
            catCode: row.catCode,
            kind: row.kind,
        });
        const spectators: CameoEntry[] = [...(stored.spectators || [])];
        const guestStars: CameoEntry[] = [...(stored.guestStars || [])];
        const cameoIds = new Set<string>((stored.cameoIds as string[]) || []);
        const lateIds = new Set<string>((stored.lateIds as string[]) || []);
        const paidKinds: CameoKind[] = ['paid', 'guest_star', 'gift'];
        for (const row of late) {
            const entry = entryOf(row);
            lateIds.add(entry.id);
            let placed = false;
            if (row.kind === 'guest_star' && guestStars.length < MAX_GUEST_STARS) {
                if (!guestStars.some(e => e.catCode === entry.catCode)) {
                    guestStars.push(entry);
                    placed = true;
                }
            }
            if (!spectators.some(e => e.catCode === entry.catCode)) {
                if (spectators.length < MAX_SPECTATORS) {
                    spectators.push(entry);
                    placed = true;
                } else if (paidKinds.includes(row.kind)) {
                    // Replace the last unpaid spectator (free, admin or Club): a booked cat outranks it.
                    for (let i = spectators.length - 1; i >= 0; i--) {
                        if (!paidKinds.includes(spectators[i].kind)) {
                            const out = spectators[i];
                            if (!guestStars.some(e => e.id === out.id)) cameoIds.delete(out.id);
                            spectators[i] = entry;
                            placed = true;
                            break;
                        }
                    }
                }
            } else {
                placed = placed || guestStars.some(e => e.id === entry.id);
            }
            if (placed) {
                cameoIds.add(entry.id);
            }
        }
        const fridgeCodes = ((stored.fridge as CameoEntry[]) || []).map(e => e.catCode);
        const before = new Set<string>((stored.cameoIds as string[]) || []);
        const counter =
            (await this.counterValues([loadKey(dayNo, stored.shuffle)])).get(loadKey(dayNo, stored.shuffle)) || 0;
        const lateBase: Record<string, number> = { ...((stored.lateBase as Record<string, number>) || {}) };
        for (const id of cameoIds) if (!before.has(id)) lateBase[id] = counter;
        const update = {
            spectators,
            guestStars,
            cameoIds: [...cameoIds],
            catCodes: [...new Set([...spectators, ...guestStars].map(e => e.catCode).concat(fridgeCodes))],
            lateIds: [...lateIds],
            lateBase,
        };
        await this.store.shuffles.updateOne({ dayNo, shuffle: stored.shuffle }, { $set: update });
        return { ...stored, ...update };
    }

    async approvedFaces(catCodes: string[]): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        if (!catCodes.length) return map;
        const rows = (await this.store.faces.find({ catCode: { $in: catCodes }, status: 'approved' }).lean()) as any[];
        for (const row of rows) map.set(row.catCode, facePath(String(row._id)));
        return map;
    }

    /** GET /badcat/seen?cat=: this week's (Monday to today, UTC days) and all-time loads of shuffles with the cat. */
    async seen(catCode: unknown): Promise<SeenResponse> {
        if (!isCatCode(catCode)) throw BADCAT_ERRORS.invalid('cat is not a cat code');
        const today = dayNoOf(this.now());
        const weekStart = weekStartOf(today);
        const shuffles = (await this.store.shuffles.find({ catCodes: catCode }).lean()) as any[];
        const counts = await this.counterValues(shuffles.map(row => loadKey(row.dayNo, row.shuffle)));
        let week = 0;
        let total = 0;
        for (const row of shuffles) {
            const n = counts.get(loadKey(row.dayNo, row.shuffle)) || 0;
            total += n;
            if (row.dayNo >= weekStart && row.dayNo <= today) week += n;
        }
        return { week, total };
    }

    /** POST /badcat/admin/cameo: a free / streak / reply / community / pinkpaw cameo on a day. */
    async grant(input: {
        catCode?: unknown;
        name?: unknown;
        dayNo?: unknown;
        kind?: unknown;
    }): Promise<{ id: string }> {
        if (!isCatCode(input?.catCode)) throw BADCAT_ERRORS.invalid('catCode is required');
        if (!isInt(input.dayNo)) throw BADCAT_ERRORS.invalid('dayNo is required');
        const kind = (input.kind ?? 'free') as CameoKind;
        if (!ADMIN_CAMEO_KINDS.includes(kind))
            throw BADCAT_ERRORS.invalid(`kind must be one of ${ADMIN_CAMEO_KINDS.join(', ')}`);
        const row = await this.store.cameos.create({
            kind,
            dayNo: input.dayNo,
            catCode: input.catCode,
            name: filterName(input.name),
        });
        return { id: String(row._id) };
    }

    // ---------------------------------------------------------------------------------------------
    // Faces: PNG ≤ 64 KB, manual approval once per cat
    // ---------------------------------------------------------------------------------------------

    /** POST /badcat/face/:cameoId { token, png }: pending until an admin approves it. */
    async uploadFace(
        cameoId: string,
        token: unknown,
        png: unknown,
        env: Env = process.env
    ): Promise<{ ok: boolean; status: 'pending' }> {
        // A verified token reaches the cameos of its email; a scoped one (thanks page, gift redeem) only
        // the cameos of the purchases or gift codes it names.
        const who = this.account.caller(token, env);
        if (!isValidObjectId(cameoId)) throw BADCAT_ERRORS.notFound();
        const cameo = (await this.store.cameos.findOne({ _id: cameoId }).lean()) as any;
        if (!cameo || cameo.hidden) throw BADCAT_ERRORS.notFound();
        const mine = who.verified
            ? cameo.email === who.email
            : typeof cameo.sessionId === 'string' && who.sids.includes(cameo.sessionId);
        if (!mine) throw BADCAT_ERRORS.forbidden();
        const email = cameo.email || who.email;
        const bytes = decodePng(png);
        if (await this.store.faces.findOne({ catCode: cameo.catCode, status: 'approved' }).lean()) {
            throw BADCAT_ERRORS.conflict('This cat already has an approved face');
        }
        await this.store.faces.updateOne(
            { catCode: cameo.catCode, email, status: 'pending' },
            { $set: { cameoId, png: bytes, bytes: bytes.length } },
            { upsert: true }
        );
        return { ok: true, status: 'pending' };
    }

    /** GET /badcat/face/:id.png: approved faces only. */
    async facePng(id: string): Promise<Buffer | null> {
        if (!isValidObjectId(id)) return null;
        const row = (await this.store.faces.findOne({ _id: id, status: 'approved' }).lean()) as any;
        return row?.png ? toBuffer(row.png) : null;
    }

    async pendingFaces(limit = 100) {
        const rows = ((await this.store.faces.find({ status: 'pending' }).limit(limit).lean()) as any[]).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return rows.map(row => {
            const png = toBuffer(row.png);
            return {
                id: String(row._id),
                catCode: row.catCode,
                cameoId: row.cameoId,
                createdAt: row.createdAt,
                dataUrl: `data:image/png;base64,${png.toString('base64')}`,
            };
        });
    }

    /** Approve (once per cat: the cat's other pending faces are rejected) or reject a pending face. */
    async reviewFace(id: string, decision: 'approve' | 'reject'): Promise<{ ok: boolean; status: string }> {
        if (!isValidObjectId(id)) throw BADCAT_ERRORS.notFound();
        const face = (await this.store.faces.findOne({ _id: id }).lean()) as any;
        if (!face) throw BADCAT_ERRORS.notFound();
        if (face.status !== 'pending') throw BADCAT_ERRORS.conflict(`Face is already ${face.status}`);
        const now = this.now();
        if (decision === 'reject') {
            await this.store.faces.updateOne({ _id: id }, { $set: { status: 'rejected', reviewedAt: now } });
            return { ok: true, status: 'rejected' };
        }
        if (await this.store.faces.findOne({ catCode: face.catCode, status: 'approved' }).lean()) {
            throw BADCAT_ERRORS.conflict('This cat already has an approved face');
        }
        await this.store.faces.updateOne(
            { _id: id, status: 'pending' },
            { $set: { status: 'approved', reviewedAt: now } }
        );
        await this.store.faces.updateMany(
            { catCode: face.catCode, status: 'pending' },
            { $set: { status: 'rejected', reviewedAt: now } }
        );
        return { ok: true, status: 'approved' };
    }
}

/** A stored PNG as a Buffer: a Buffer, a BSON Binary (`lean()`), a Uint8Array or a plain byte object. */
export function toBuffer(value: any): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (value?.buffer && (Buffer.isBuffer(value.buffer) || value.buffer instanceof Uint8Array)) {
        return Buffer.from(value.buffer);
    }
    if (value && typeof value === 'object') return Buffer.from(Object.values(value) as number[]);
    return Buffer.alloc(0);
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Base64 (optionally a data URL) → PNG bytes; 413 over 64 KB, 400 when not a PNG. */
export function decodePng(value: unknown): Buffer {
    if (typeof value !== 'string' || !value) throw BADCAT_ERRORS.invalid('png is required');
    const base64 = value.replace(/^data:image\/png;base64,/, '');
    // A base64 string longer than this decodes to more than 64 KB.
    if (base64.length > Math.ceil(FACE_MAX_BYTES / 3) * 4 + 4) throw BADCAT_ERRORS.tooLarge();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw BADCAT_ERRORS.invalid('png is not base64');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > FACE_MAX_BYTES) throw BADCAT_ERRORS.tooLarge();
    if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
        throw BADCAT_ERRORS.invalid('png is not a PNG');
    }
    return bytes;
}
