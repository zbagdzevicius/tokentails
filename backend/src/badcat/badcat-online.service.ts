import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { IAuthUser, isGuestUser } from 'src/common/decorators/auth-user.decorator';
import { Game, GameDocument, GameType } from 'src/game/game.schema';
import { User, UserDocument } from 'src/user/user.schema';
import { YourCat } from 'src/yourcat/yourcat.schema';
import { dayNoUtc, dayTitle } from 'src/vendor/badcat-sim';
import {
    AccountResponse,
    BADCAT_SKUS,
    BadcatSku,
    BOARD_SIZE,
    BoardMeResponse,
    BoardResponse,
    BoardRow,
    CREATOR_MIN_PAYOUT_CENTS,
    CREATOR_SHARE_BPS,
    CREATOR_WINDOW_MONTHS,
    CreatorDashboard,
    EntitlementResponse,
    FACE_MAX_BYTES,
    isBadcatSku,
} from './badcat.contracts';
import { BADCAT_ERRORS } from './badcat.errors';
import { Env } from './badcat-flags';
import { badcatLevel } from './badcat-live';
import { BadcatStore } from './badcat.schema';
import { BadcatOnlineStore } from './badcat-online.schema';
import { BadcatAccountService } from './badcat-account.service';
import { estimateStripeFee } from './badcat-admin.service';
import { addMonths, normalizeEmail } from './badcat-util';
import sharp = require('sharp');

/*
 * Bad Cat Daily Phase 2 reads (GDD 10, 17.3): the daily board, the signed-in player's account summary, the purchase
 * claim by verified email, the live treat meter and the creator dashboard. Nothing here writes a score: board rows are
 * the BAD_CAT `Game` rows the one score route (`/live` in the user module) saved. Guests save but never rank (NOT_GUEST rule, plan F5).
 */

/** Pink Paw's share (GDD 9.2): 10 % of net game revenue, plus 100 % of the charity collar (net of the card fee). */
export const SHELTER_SHARE_BPS = 1000;
/** Board answers are cached per day for this long (the route also sends Cache-Control max-age=30). */
export const BOARD_CACHE_MS = 30_000;
/** Rows read before dropping guests (guests rarely outnumber registered players 3:1 at the top). */
const BOARD_SCAN = BOARD_SIZE * 4;

export interface TreatMeterView {
    month: string;
    cents: number;
    currency: string;
    collars: number;
    updated: string;
}

@Injectable()
export class BadcatOnlineService {
    private readonly logger = new Logger(BadcatOnlineService.name);
    now: () => Date = () => new Date();
    private readonly boardCache = new Map<number, { at: number; value: BoardResponse }>();

    constructor(
        @InjectModel(Game.name) private readonly games: Model<GameDocument>,
        @InjectModel(User.name) private readonly users: Model<UserDocument>,
        @InjectModel(YourCat.name) private readonly yourcats: Model<any>,
        private readonly store: BadcatStore,
        private readonly online: BadcatOnlineStore,
        private readonly account: BadcatAccountService
    ) {}

    // ---------------------------------------------------------------------------------------------
    // Boards
    // ---------------------------------------------------------------------------------------------

    /** The day must be a played or current day: not more than a day past today (UTC). */
    private checkDay(dayNo: number): void {
        if (!Number.isInteger(dayNo) || dayNo < -400 || dayNo > dayNoUtc(this.now().getTime()) + 1) {
            throw BADCAT_ERRORS.invalid('day is not a played day');
        }
    }

    /** GET /badcat/board/:day: top BOARD_SIZE registered players, best first, ties by the earlier save. */
    async board(dayNo: number): Promise<BoardResponse> {
        this.checkDay(dayNo);
        const at = this.now().getTime();
        const hit = this.boardCache.get(dayNo);
        if (hit && at - hit.at < BOARD_CACHE_MS) return hit.value;
        const rows = (await this.games
            .aggregate([
                { $match: { type: GameType.BAD_CAT, level: badcatLevel(dayNo) } },
                { $sort: { score: -1, createdAt: 1 } },
                { $limit: BOARD_SCAN },
                {
                    $lookup: {
                        from: this.users.collection.name,
                        localField: 'user',
                        foreignField: '_id',
                        as: 'owner',
                        pipeline: [{ $project: { isGuest: 1, deletedAt: 1 } }],
                    },
                },
                { $match: { 'owner.0': { $exists: true }, 'owner.isGuest': { $ne: true }, 'owner.deletedAt': null } },
                { $limit: BOARD_SIZE },
                { $project: { score: 1, stamp: 1, catName: 1, catCode: 1 } },
            ])
            .exec()) as any[];
        const value: BoardResponse = {
            dayNo,
            label: dayTitle(dayNo),
            rows: rows.map(
                (row, i): BoardRow => ({
                    rank: i + 1,
                    score: Number(row.score) || 0,
                    stamp: typeof row.stamp === 'string' ? row.stamp : 'clean',
                    name: typeof row.catName === 'string' && row.catName ? row.catName : 'A bad cat',
                    ...(typeof row.catCode === 'string' ? { catCode: row.catCode } : {}),
                })
            ),
            updatedAt: new Date(at).toISOString(),
        };
        this.boardCache.set(dayNo, { at, value });
        if (this.boardCache.size > 64) this.boardCache.delete(this.boardCache.keys().next().value as number);
        return value;
    }

    /** GET /badcat/board/:day/me: the caller's saved run and rank among registered players. */
    async boardMe(dayNo: number, user: IAuthUser): Promise<BoardMeResponse> {
        this.checkDay(dayNo);
        const guest = isGuestUser(user);
        const id = user?._id ? String(user._id) : '';
        if (!isValidObjectId(id)) return { dayNo, saved: false, guest };
        const mine = (await this.games
            .findOne({ type: GameType.BAD_CAT, level: badcatLevel(dayNo), user: new Types.ObjectId(id) })
            .lean()) as any;
        if (!mine) return { dayNo, saved: false, guest };
        const out: BoardMeResponse = { dayNo, saved: true, guest, score: mine.score, stamp: mine.stamp };
        if (guest) return out;
        const ahead = (await this.games
            .aggregate([
                {
                    $match: {
                        type: GameType.BAD_CAT,
                        level: badcatLevel(dayNo),
                        score: { $gt: Number(mine.score) || 0 },
                    },
                },
                {
                    $lookup: {
                        from: this.users.collection.name,
                        localField: 'user',
                        foreignField: '_id',
                        as: 'owner',
                        pipeline: [{ $project: { isGuest: 1, deletedAt: 1 } }],
                    },
                },
                { $match: { 'owner.0': { $exists: true }, 'owner.isGuest': { $ne: true }, 'owner.deletedAt': null } },
                { $count: 'n' },
            ])
            .exec()) as any[];
        out.rank = (ahead[0]?.n || 0) + 1;
        return out;
    }

    // ---------------------------------------------------------------------------------------------
    // Account
    // ---------------------------------------------------------------------------------------------

    private async userDoc(user: IAuthUser): Promise<any | null> {
        const id = user?._id ? String(user._id) : '';
        if (!isValidObjectId(id)) return null;
        return this.users.findOne({ _id: id }, { email: 1, emailVerifiedAt: 1, isGuest: 1 }).lean();
    }

    /** A registered account with a verified email, or null. */
    private async verifiedEmail(user: IAuthUser): Promise<{ id: string; email: string } | null> {
        if (isGuestUser(user)) return null;
        const doc = await this.userDoc(user);
        const email = normalizeEmail(doc?.email);
        if (!doc || doc.isGuest || !doc.emailVerifiedAt || !email) return null;
        return { id: String(doc._id), email };
    }

    /** GET /badcat/account: what the game shows in Settings (no email, no name). */
    async accountSummary(user: IAuthUser): Promise<AccountResponse> {
        const guest = isGuestUser(user);
        const id = user?._id ? String(user._id) : '';
        const doc = await this.userDoc(user);
        const verified = !guest && !!doc?.emailVerifiedAt && !!normalizeEmail(doc?.email);
        const rows = isValidObjectId(id)
            ? ((await this.games
                  .find({ type: GameType.BAD_CAT, user: new Types.ObjectId(id) }, { level: 1, score: 1 })
                  .lean()) as any[])
            : [];
        const days = rows
            .map(row => Number(/^d(-?\d+)$/.exec(String(row.level))?.[1]))
            .filter(n => Number.isInteger(n))
            .sort((a, b) => b - a);
        const best = rows.reduce((m, row) => Math.max(m, Number(row.score) || 0), 0);
        const today = dayNoUtc(this.now().getTime());
        let streak = 0;
        if (days.length && days[0] >= today - 1) {
            const set = new Set(days);
            for (let d = days[0]; set.has(d); d--) streak++;
        }
        const optIn = isValidObjectId(id)
            ? ((await this.online.streakEmails.findOne({ user: new Types.ObjectId(id) }).lean()) as any)
            : null;
        return {
            signedIn: !guest && !!doc,
            guest,
            emailVerified: verified,
            ranked: { days: days.length, best, lastDay: days[0] ?? null, streak },
            streakEmail: !!optIn?.on && verified,
            canClaim: verified,
        };
    }

    /**
     * POST /badcat/account/claim: the purchases made with the account's verified email, as a verified entitlement
     * token (the same token "Restore purchases" gives after the magic link). Accounts claim purchases by email (GDD 10).
     */
    async claim(user: IAuthUser, env: Env = process.env): Promise<EntitlementResponse> {
        const who = await this.verifiedEmail(user);
        if (!who) throw BADCAT_ERRORS.invalid('Sign in with a verified email to claim purchases');
        return this.account.issue(who.email, env);
    }

    /** POST /badcat/account/streak-email { on }: the opt-in for "your streak ends tonight" (verified email). */
    async setStreakEmail(user: IAuthUser, on: unknown): Promise<{ ok: boolean; on: boolean }> {
        const who = await this.verifiedEmail(user);
        if (!who) throw BADCAT_ERRORS.invalid('A verified email is needed for streak emails');
        const value = on === true;
        await this.online.streakEmails.updateOne(
            { user: new Types.ObjectId(who.id) },
            { $set: { email: who.email, on: value } },
            { upsert: true }
        );
        return { ok: true, on: value };
    }

    // ---------------------------------------------------------------------------------------------
    // Treat meter (GDD 9.2: 10 % of net, plus 100 % of the charity collar)
    // ---------------------------------------------------------------------------------------------

    private meterCache: { at: number; value: TreatMeterView } | null = null;

    async meter(): Promise<TreatMeterView> {
        const now = this.now();
        if (this.meterCache && now.getTime() - this.meterCache.at < 60_000) return this.meterCache.value;
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const rows = (await this.store.purchases
            .find({ createdAt: { $gte: start }, status: 'paid' }, { sku: 1, amountTotal: 1, currency: 1, livemode: 1 })
            .lean()) as any[];
        let cents = 0;
        let collars = 0;
        for (const row of rows) {
            if (!isBadcatSku(row.sku) || (row.currency && row.currency !== 'usd')) continue;
            const amount = Number(row.amountTotal) || 0;
            const net = Math.max(0, amount - estimateStripeFee(amount));
            if (row.sku === 'collar_pinkpaw') {
                collars++;
                cents += net;
            } else if (BADCAT_SKUS[row.sku as BadcatSku].revenueBearing) {
                cents += Math.floor((net * SHELTER_SHARE_BPS) / 10000);
            }
        }
        const value: TreatMeterView = {
            month: now.toISOString().slice(0, 7),
            cents,
            currency: 'usd',
            collars,
            updated: now.toISOString().slice(0, 10),
        };
        this.meterCache = { at: now.getTime(), value };
        return value;
    }

    // ---------------------------------------------------------------------------------------------
    // Creator dashboard (GDD 9.2 creator codes, Phase 2 "dashboard")
    // ---------------------------------------------------------------------------------------------

    /** GET /badcat/creator/me: the codes requested with the account's verified email and what they earned. */
    async creatorDashboard(user: IAuthUser): Promise<CreatorDashboard> {
        const who = await this.verifiedEmail(user);
        if (!who) throw BADCAT_ERRORS.invalid('Sign in with the email your creator code was requested with');
        const codes = (await this.store.creatorCodes.find({ email: who.email }).lean()) as any[];
        const approved = codes.filter(c => c.status === 'approved').map(c => c.code);
        const purchases = approved.length
            ? ((await this.store.purchases.find({ 'meta.via': { $in: approved } }).lean()) as any[])
            : [];
        const rows = codes.map(code => {
            const mine = purchases
                .filter(row => row.meta?.via === code.code)
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            const firstAt = new Map<string, Date>();
            let count = 0;
            let grossCents = 0;
            let netCents = 0;
            for (const row of mine) {
                const buyer = row.email || row.customerId || row.sessionId;
                if (!firstAt.has(buyer)) firstAt.set(buyer, new Date(row.createdAt));
                if (
                    row.status === 'refunded' ||
                    !isBadcatSku(row.sku) ||
                    !BADCAT_SKUS[row.sku as BadcatSku].revenueBearing
                ) {
                    continue;
                }
                if (new Date(row.createdAt) >= addMonths(firstAt.get(buyer)!, CREATOR_WINDOW_MONTHS)) continue;
                count++;
                grossCents += row.amountTotal || 0;
                netCents += (row.amountTotal || 0) - estimateStripeFee(row.amountTotal || 0);
            }
            return {
                code: code.code,
                status: code.status,
                purchases: count,
                grossCents,
                shareCents: Math.floor((netCents * CREATOR_SHARE_BPS) / 10000),
            };
        });
        return { rows, minPayoutCents: CREATOR_MIN_PAYOUT_CENTS };
    }

    // ---------------------------------------------------------------------------------------------
    // Cameo face from /yourcat (Phase 2: "face uploads through /yourcat moderation")
    // ---------------------------------------------------------------------------------------------

    /**
     * The newest /yourcat pixel portrait of the caller (a photo record whose avatar is ready, so the photo passed the
     * /yourcat checks: App Check, budget, the cat-and-no-person classifier). No AI call is made here: the portrait the
     * player already has is fetched from the CDN and used as an approved cameo face.
     */
    async yourcatAvatar(user: IAuthUser): Promise<{ url: string } | null> {
        const id = user?._id ? String(user._id) : '';
        if (isGuestUser(user) || !isValidObjectId(id)) return null;
        const row = (await this.yourcats
            .findOne({
                owner: new Types.ObjectId(id),
                avatarStatus: 'ready',
                deletedAt: null,
                avatarUrl: { $ne: null },
            })
            .sort({ createdAt: -1 })
            .lean()) as any;
        const url = typeof row?.avatarUrl === 'string' ? row.avatarUrl : '';
        return isAvatarUrl(url) ? { url } : null;
    }

    /** Test seam for the CDN fetch of a /yourcat portrait. */
    fetchImpl: (
        url: string,
        init: { signal?: AbortSignal }
    ) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }> = (url, init) => fetch(url, init as any);

    /**
     * POST /badcat/face/:cameoId/yourcat: the cameo (bought with the account's verified email) shows the player's
     * /yourcat pixel portrait as its face, approved at once because that photo already passed /yourcat moderation.
     * Once per cat, like a manual face.
     */
    async faceFromYourcat(cameoId: string, user: IAuthUser): Promise<{ ok: boolean; status: 'approved' }> {
        const who = await this.verifiedEmail(user);
        if (!who) throw BADCAT_ERRORS.invalid('Sign in with the email you bought the cameo with');
        if (!isValidObjectId(cameoId)) throw BADCAT_ERRORS.notFound();
        const cameo = (await this.store.cameos.findOne({ _id: cameoId }).lean()) as any;
        if (!cameo || cameo.hidden) throw BADCAT_ERRORS.notFound();
        if (cameo.email !== who.email) throw BADCAT_ERRORS.forbidden();
        if (await this.store.faces.findOne({ catCode: cameo.catCode, status: 'approved' }).lean()) {
            throw BADCAT_ERRORS.conflict('This cat already has an approved face');
        }
        const avatar = await this.yourcatAvatar(user);
        if (!avatar) throw BADCAT_ERRORS.invalid('No ready /yourcat portrait on this account');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        let raw: Buffer;
        try {
            const res = await this.fetchImpl(avatar.url, { signal: ctrl.signal });
            if (!res.ok) throw new Error('portrait fetch failed');
            raw = Buffer.from(await res.arrayBuffer());
        } catch {
            throw BADCAT_ERRORS.invalid('The /yourcat portrait could not be loaded, try again');
        } finally {
            clearTimeout(timer);
        }
        if (raw.length > 4 * 1024 * 1024) throw BADCAT_ERRORS.tooLarge();
        const png: Buffer = await sharp(raw, { limitInputPixels: 4096 * 4096 })
            .resize(128, 128, { fit: 'cover', kernel: 'nearest' })
            .png({ palette: true })
            .toBuffer();
        if (png.length > FACE_MAX_BYTES) throw BADCAT_ERRORS.tooLarge();
        await this.store.faces.updateOne(
            { catCode: cameo.catCode, email: who.email, status: { $in: ['pending', 'approved'] } },
            { $set: { cameoId, png, bytes: png.length, status: 'approved', reviewedAt: this.now() } },
            { upsert: true }
        );
        return { ok: true, status: 'approved' };
    }

    /** The verified email of an account (for cameo ownership checks). */
    async accountEmail(user: IAuthUser): Promise<string | null> {
        return (await this.verifiedEmail(user))?.email ?? null;
    }

    log(message: string): void {
        this.logger.warn(message);
    }
}

/** The /yourcat CDN: https on DigitalOcean Spaces (or a tokentails.com host). */
export function isAvatarUrl(url: string): boolean {
    try {
        const u = new URL(url);
        return (
            u.protocol === 'https:' &&
            !u.username &&
            !u.password &&
            (/\.digitaloceanspaces\.com$/.test(u.hostname) || /(^|\.)tokentails\.com$/.test(u.hostname))
        );
    } catch {
        return false;
    }
}
