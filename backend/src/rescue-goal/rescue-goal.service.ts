import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { IAuthUser, isGuestUser } from 'src/common/decorators/auth-user.decorator';
import { guestForbidden } from 'src/common/guards/auth-errors';
import { isHouseShelter } from 'src/impact/impact-public';
import { redactOutcomeImage } from 'src/impact/outcome-image';
import { ShelterDonationStatus } from 'src/shared-contracts/enums';
import { uploadFile } from 'src/shared/utils/aws.utils';
import { seasonTimes } from 'src/user/codex-reset';
import {
    BUDGET_MONTH_PATTERN,
    GOAL_PHOTO_MAX_BYTES,
    GOAL_PHOTO_MIMES,
    GOAL_TARGET_MAX,
    GOAL_TARGET_MIN,
    goalImageHosts,
    GOALS_PER_BUDGET_MONTH_MAX,
    GOALS_PER_BUDGET_MONTH_MIN_HINT,
    PLEDGE_MAX,
    PLEDGE_MIN,
    pledgesOpen,
    RESCUE_GOAL_ERROR,
    rescueGoalError,
    RescueGoalPledgeStatus,
    RescueGoalStatus,
    TREAT_GIVER_BADGE,
    TREAT_GIVER_TREATS,
} from './rescue-goal.constants';
import {
    DailyView,
    isExpired,
    PledgeView,
    pledgeView,
    remainingOf,
    RescueGoalPledgeService,
} from './rescue-goal-pledge.service';
import { GOAL_FUNDING_CURRENCIES, GoalFundingCurrency } from './rescue-goal.schema';
import { Doc, objectIdOrNull, RescueGoalStore } from './rescue-goal.store';

/*
 * Rescue Goals: public views, the player's own gives, and the MANAGER lifecycle (plan G5).
 *
 * - Public views carry what a goal is for, its shelter, progress and proof. They never carry the
 *   money amount, the funding line, the proof owner or saga bookkeeping: shown next to a Tails target,
 *   a money amount would publish the internal budgeting ratio of decision #37, and "Tails have no cash
 *   value" (F11).
 * - A goal opens only when its money is marked set aside (`fundingSetAside: true` with a line and an
 *   amount); there is no draft state. At most 10 goals per budget month (decision #37: 4 to 10).
 * - Delivery needs a photo (re-encoded to WebP with no metadata, then public) and a receipt (kept
 *   private; its SHA-256 is public). `txHash` is web-only: `surface=app` views drop it (F11).
 * - Cancel refunds every give (the pledge service, re-run by the sweeper for 15 minutes).
 * - An OPEN goal past its `endsAt` refuses gives. It is `expired: true` in every view, is left out
 *   of the current and open lists and of the open count, and waits for a manager to deliver or
 *   cancel it (the CMS flags it).
 */

export type GoalSurface = 'web' | 'app';

export interface PublicShelter {
    _id: string;
    name: string;
    slug: string | null;
    image: string | null;
    country: string | null;
    countryCode: string | null;
}

export interface PublicGoal {
    id: string;
    title: string;
    description: string | null;
    deliverable: string;
    image: string | null;
    shelter: PublicShelter | null;
    status: RescueGoalStatus;
    /** OPEN but past `endsAt`: it takes no more gives; a manager delivers or cancels it. */
    expired: boolean;
    targetTails: number;
    raisedTails: number;
    remainingTails: number;
    pledgeCount: number;
    endsAt: string | null;
    filledAt: string | null;
    createdAt: string | null;
    delivery: {
        photoUrl: string;
        receiptSha256: string;
        note: string | null;
        deliveredAt: string;
        txHash?: string | null;
    } | null;
    cancelledAt: string | null;
}

export interface ManagerGoal extends PublicGoal {
    budgetMonth: string;
    proofOwner: string;
    funding: {
        setAside: boolean;
        line: string;
        amountCents: number;
        currency: GoalFundingCurrency;
        note: string | null;
        setAsideAt: string | null;
    };
    cancelReason: string | null;
    pledges: Record<RescueGoalPledgeStatus, number>;
    receipt: { sha256: string; mime: string; size: number } | null;
    budgetMonthGoals: number;
}

export interface GoalWriteInput {
    shelter?: string;
    title?: string;
    description?: string | null;
    deliverable?: string;
    image?: string | null;
    targetTails?: number;
    endsAt?: string | null;
    budgetMonth?: string;
    proofOwner?: string;
    fundingSetAside?: boolean | string;
    fundingLine?: string;
    fundingAmount?: string | number;
    fundingCurrency?: string;
    fundingNote?: string | null;
}

export interface DeliveryInput {
    note?: string | null;
    txHash?: string | null;
}

export interface UploadedFileLike {
    buffer?: Buffer;
    mimetype?: string;
    size?: number;
}

export interface TreatGiverBadge {
    id: typeof TREAT_GIVER_BADGE;
    earned: boolean;
    confirmedTreats: number;
    needed: number;
    seasonStartedAt: string;
}

export interface MyGives {
    pledges: (PledgeView & { goalTitle: string | null })[];
    daily: DailyView;
    balance: { tails: number };
    totals: { tailsGiven: number; goalsHelped: number; monthTailsGiven: number; monthGoalsHelped: number };
    eligibility: { eligible: boolean; reason: string | null; eligibleAt: string | null; open: boolean };
    limits: { min: number; max: number };
    badges: TreatGiverBadge[];
}

export type GoalPhotoUploader = (key: string, data: Buffer) => Promise<string>;

/** Uploads a delivery photo to the Spaces bucket the image uploads use. Off under Jest and without storage. */
export const defaultGoalPhotoUploader: GoalPhotoUploader = async (key, data) => {
    const cdn = (process.env.DO_SPACES_CDN || '').trim();
    if (process.env.JEST_WORKER_ID || !cdn || !process.env.DO_SPACES_NAME) {
        throw new ServiceUnavailableException('Image storage is not configured on this instance');
    }
    await uploadFile(key, data, 'webp');
    return `${cdn.replace(/\/+$/, '')}/${key}`;
};

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const RECEIPT_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const TX_HASH = /^(0x)?[0-9a-fA-F]{64}$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/i;

/** OPEN rows still taking gives (no end date, or one in the future). */
const takingGives = (now: Date): Doc => ({
    status: RescueGoalStatus.OPEN,
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
});

const hostOf = (url: string) => {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
};
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const PUBLIC_SHELTER_PROJECTION = { name: 1, slug: 1, image: 1, country: 1, countryCode: 1, role: 1 } as const;

/** Euro-style "12.50" or "12" to cents. Null when it is not a positive amount with at most 2 decimals. */
export function toCents(value: unknown): number | null {
    const raw = String(value ?? '').trim();
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(raw)) {
        return null;
    }
    const [whole, fraction = ''] = raw.split('.');
    const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
    return cents > 0 ? cents : null;
}

@Injectable()
export class RescueGoalService {
    private readonly logger = new Logger(RescueGoalService.name);
    photoUploader: GoalPhotoUploader = defaultGoalPhotoUploader;

    constructor(private readonly store: RescueGoalStore, private readonly pledges: RescueGoalPledgeService) {}

    // ---------------------------------------------------------------------------------------------
    // Public
    // ---------------------------------------------------------------------------------------------

    async list(
        query: { status?: string; limit?: number | string } = {},
        surface: GoalSurface = 'web',
        now: Date = new Date()
    ): Promise<PublicGoal[]> {
        const limit = Math.min(50, Math.max(1, Math.trunc(num(query.limit) || 20)));
        const status = text(query.status).toUpperCase();
        let filter: Doc;
        if (!status || status === 'CURRENT') {
            filter = { status: { $in: [RescueGoalStatus.OPEN, RescueGoalStatus.FILLED, RescueGoalStatus.DELIVERED] } };
        } else if (status === 'ALL') {
            filter = {};
        } else if ((Object.values(RescueGoalStatus) as string[]).includes(status)) {
            filter = { status };
        } else {
            throw new BadRequestException('status must be current, all, open, filled, delivered or cancelled');
        }
        // Expired OPEN goals take no gives, so the current and open lists leave them out ("all" keeps them).
        const hideExpired = !status || status === 'CURRENT' || status === RescueGoalStatus.OPEN;
        const rows = (await this.store.goals.find(filter, { sort: { createdAt: -1 }, limit: 200 }).toArray()).filter(
            row => !hideExpired || !isExpired(row, now)
        );
        // Open goals first (closest to filled first), then filled, delivered, cancelled; newest first inside.
        const order = [
            RescueGoalStatus.OPEN,
            RescueGoalStatus.FILLED,
            RescueGoalStatus.DELIVERED,
            RescueGoalStatus.CANCELLED,
        ];
        rows.sort((a, b) => {
            const byStatus = order.indexOf(a.status) - order.indexOf(b.status);
            if (byStatus) return byStatus;
            if (a.status === RescueGoalStatus.OPEN) {
                const byRemaining = remainingOf(a) - remainingOf(b);
                if (byRemaining) return byRemaining;
            }
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
        return this.publicViews(rows.slice(0, limit), surface, now);
    }

    async getPublic(id: string, surface: GoalSurface = 'web', now: Date = new Date()): Promise<PublicGoal> {
        const row = await this.goal(id);
        return (await this.publicViews([row], surface, now))[0];
    }

    /**
     * Open goals for the impact snapshot (`PublicImpact.rescueGoals`, plan F7 "one fetch"): the count of
     * OPEN goals still taking gives and up to `limit` of those or FILLED goals in list order. Expired
     * OPEN goals are not counted or listed. Web surface (the snapshot is web).
     * Exported for the impact snapshot owner (tasks 6a/7b); reads only.
     */
    async openGoalsSummary(limit = 6, now: Date = new Date()): Promise<{ open: number; items: PublicGoal[] }> {
        const [open, items] = await Promise.all([
            this.store.goals.countDocuments(takingGives(now)),
            this.list({ status: 'current', limit: 50 }, 'web', now),
        ]);
        return {
            open,
            items: items.filter(goal => goal.status !== RescueGoalStatus.DELIVERED).slice(0, limit),
        };
    }

    // ---------------------------------------------------------------------------------------------
    // The player's own gives
    // ---------------------------------------------------------------------------------------------

    async myGives(user: IAuthUser, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<MyGives> {
        if (!user || isGuestUser(user)) {
            throw guestForbidden();
        }
        const userId = objectIdOrNull(user._id);
        if (!userId) {
            throw guestForbidden();
        }
        const [rows, daily, account, policy, badge] = await Promise.all([
            this.store.pledges.find({ user: userId }, { sort: { createdAt: -1 }, limit: 50 }).toArray(),
            this.pledges.daily(userId, now),
            this.store.users.findOne(
                { _id: userId },
                { projection: { tails: 1, tailsGiven: 1, goalsHelped: 1, monthTailsGiven: 1, monthGoalsHelped: 1 } }
            ),
            this.pledges.policy(user, now),
            this.treatGiverBadge(userId, now),
        ]);
        const goalIds = [...new Set(rows.map(row => String(row.goal)))].map(id => new Types.ObjectId(id));
        const goals = goalIds.length
            ? await this.store.goals.find({ _id: { $in: goalIds } }, { projection: { title: 1 } }).toArray()
            : [];
        const titles = new Map(goals.map(goal => [String(goal._id), goal.title as string]));
        return {
            pledges: rows.map(row => ({ ...pledgeView(row), goalTitle: titles.get(String(row.goal)) || null })),
            daily,
            balance: { tails: num(account?.tails) },
            totals: {
                tailsGiven: num(account?.tailsGiven),
                goalsHelped: num(account?.goalsHelped),
                monthTailsGiven: num(account?.monthTailsGiven),
                monthGoalsHelped: num(account?.monthGoalsHelped),
            },
            eligibility: {
                eligible: policy.eligible,
                reason: policy.reason,
                eligibleAt: policy.eligibleAt ?? null,
                open: pledgesOpen(env),
            },
            limits: { min: PLEDGE_MIN, max: PLEDGE_MAX },
            badges: [badge],
        };
    }

    /**
     * Treat Giver (plan G5 "Treats"): five CONFIRMED treats this season. Computed on read, cosmetic,
     * grants nothing. Exported for the IMPACT tab and profile owners.
     */
    async treatGiverBadge(userId: unknown, now: Date = new Date()): Promise<TreatGiverBadge> {
        const seasonStartedAt = seasonTimes(now).startedAt;
        const id = objectIdOrNull(userId);
        const confirmedTreats = id
            ? await this.store.donations.countDocuments(
                  {
                      user: id,
                      status: ShelterDonationStatus.CONFIRMED,
                      confirmedAt: { $gte: new Date(seasonStartedAt) },
                  },
                  { limit: TREAT_GIVER_TREATS }
              )
            : 0;
        return {
            id: TREAT_GIVER_BADGE,
            earned: confirmedTreats >= TREAT_GIVER_TREATS,
            confirmedTreats,
            needed: TREAT_GIVER_TREATS,
            seasonStartedAt,
        };
    }

    // ---------------------------------------------------------------------------------------------
    // MANAGER
    // ---------------------------------------------------------------------------------------------

    async managerList(query: { status?: string; budgetMonth?: string } = {}): Promise<ManagerGoal[]> {
        const filter: Doc = {};
        const status = text(query.status).toUpperCase();
        if (status && status !== 'ALL') {
            if (!(Object.values(RescueGoalStatus) as string[]).includes(status)) {
                throw new BadRequestException('Unknown status');
            }
            filter.status = status;
        }
        if (query.budgetMonth) {
            if (!BUDGET_MONTH_PATTERN.test(query.budgetMonth)) {
                throw new BadRequestException('budgetMonth must be YYYY-MM');
            }
            filter.budgetMonth = query.budgetMonth;
        }
        const rows = await this.store.goals.find(filter, { sort: { createdAt: -1 }, limit: 200 }).toArray();
        return Promise.all(rows.map(row => this.managerView(row)));
    }

    async managerGet(id: string): Promise<ManagerGoal> {
        return this.managerView(await this.goal(id));
    }

    async create(input: GoalWriteInput, user: IAuthUser, now: Date = new Date()): Promise<ManagerGoal> {
        const createdBy = objectIdOrNull(user?._id);
        if (!createdBy) {
            throw guestForbidden();
        }
        const funding = this.fundingOf(input, createdBy, now);
        const shelter = await this.partnerShelter(input.shelter);
        const budgetMonth = text(input.budgetMonth);
        if (!BUDGET_MONTH_PATTERN.test(budgetMonth)) {
            throw new BadRequestException('budgetMonth must be YYYY-MM');
        }
        const inMonth = await this.goalsInBudgetMonth(budgetMonth);
        if (inMonth >= GOALS_PER_BUDGET_MONTH_MAX) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_BUDGET_FULL, { budgetMonthGoals: inMonth });
        }
        const targetTails = Number(input.targetTails);
        if (!Number.isInteger(targetTails) || targetTails < GOAL_TARGET_MIN || targetTails > GOAL_TARGET_MAX) {
            throw new BadRequestException(
                `targetTails must be a whole number from ${GOAL_TARGET_MIN} to ${GOAL_TARGET_MAX}`
            );
        }
        const fields = this.textFields(input, true, now);
        const row: Doc = {
            _id: new Types.ObjectId(),
            shelter: shelter._id,
            ...fields,
            targetTails,
            raisedTails: 0,
            pledgeCount: 0,
            status: RescueGoalStatus.OPEN,
            budgetMonth,
            funding,
            createdBy,
            createdAt: now,
            updatedAt: now,
        };
        await this.store.goals.insertOne(row);
        this.logger.log(`goal ${String(row._id)} opened by ${String(createdBy)} (${budgetMonth})`);
        return this.managerView(row);
    }

    /** Text fields, image, end date and proof owner, while the goal is OPEN or FILLED. Never the target or funding. */
    async update(id: string, input: GoalWriteInput, now: Date = new Date()): Promise<ManagerGoal> {
        const row = await this.goal(id);
        const fields = this.textFields(input, false, now);
        if (!Object.keys(fields).length) {
            throw new BadRequestException('Nothing to change');
        }
        const unset: Doc = {};
        for (const [key, value] of Object.entries(fields)) {
            if (value === null) {
                unset[key] = '';
                delete fields[key];
            }
        }
        const result = await this.store.goals.updateOne(
            { _id: row._id, status: { $in: [RescueGoalStatus.OPEN, RescueGoalStatus.FILLED] } },
            { $set: { ...fields, updatedAt: now }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }
        );
        if (!result.matchedCount) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_NOT_EDITABLE);
        }
        return this.managerGet(id);
    }

    async deliver(
        id: string,
        input: DeliveryInput,
        files: { photo?: UploadedFileLike; receipt?: UploadedFileLike },
        user: IAuthUser,
        now: Date = new Date()
    ): Promise<ManagerGoal> {
        const deliveredBy = objectIdOrNull(user?._id);
        if (!deliveredBy) {
            throw guestForbidden();
        }
        const row = await this.goal(id);
        if (row.status !== RescueGoalStatus.OPEN && row.status !== RescueGoalStatus.FILLED) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_NOT_DELIVERABLE, { status: row.status });
        }
        const txHash = text(input?.txHash);
        if (txHash && !TX_HASH.test(txHash)) {
            throw new BadRequestException('txHash must be a 32-byte hex hash');
        }
        const note = text(input?.note).slice(0, 500);
        const receipt = files?.receipt;
        if (!receipt?.buffer?.length) {
            throw new BadRequestException('Attach the receipt');
        }
        if (receipt.buffer.length > RECEIPT_MAX_BYTES) {
            throw new BadRequestException('The receipt is larger than 10 MB');
        }
        const receiptMime = String(receipt.mimetype || '').toLowerCase();
        if (!RECEIPT_MIMES.includes(receiptMime)) {
            throw new BadRequestException('The receipt must be a PDF or an image');
        }
        if (!files?.photo?.buffer?.length) {
            throw new BadRequestException('Attach the delivery photo');
        }
        if (!GOAL_PHOTO_MIMES.includes(String(files.photo.mimetype || '').toLowerCase())) {
            throw new BadRequestException('The photo must be a JPEG, PNG or WebP image');
        }
        if (files.photo.buffer.length > GOAL_PHOTO_MAX_BYTES) {
            throw new BadRequestException('The photo is larger than 5 MB');
        }
        // Re-encoded WebP: EXIF, GPS and other metadata never reach the public copy.
        const photo = await redactOutcomeImage(files.photo.buffer, []);
        const receiptSha256 = createHash('sha256').update(receipt.buffer).digest('hex');
        const photoUrl = await this.photoUploader(`rescue-goals/${String(row._id)}/${photo.sha256}.webp`, photo.data);

        const delivery: Doc = {
            photoUrl,
            photoSha256: photo.sha256,
            receiptSha256,
            receiptMime,
            receiptSize: receipt.buffer.length,
            deliveredAt: now,
            deliveredBy,
        };
        if (note) delivery.note = note;
        if (txHash) delivery.txHash = txHash.startsWith('0x') ? txHash.toLowerCase() : `0x${txHash.toLowerCase()}`;
        // The goal turns DELIVERED first, guarded by its status, so of two deliveries (a double submit, two
        // managers) or a delivery racing a cancel exactly one wins. Only the winner stores its receipt, so
        // the private receipt always matches the public `receiptSha256`.
        const result = await this.store.goals.updateOne(
            { _id: row._id, status: { $in: [RescueGoalStatus.OPEN, RescueGoalStatus.FILLED] } },
            { $set: { status: RescueGoalStatus.DELIVERED, delivery, updatedAt: now } }
        );
        if (!result.modifiedCount) {
            this.logger.warn(`goal ${String(row._id)}: delivery photo ${photoUrl} uploaded but the goal changed state`);
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_NOT_DELIVERABLE);
        }
        try {
            await this.store.receipts.updateOne(
                { _id: row._id },
                { $set: { data: receipt.buffer, mime: receiptMime, sha256: receiptSha256, uploadedAt: now } },
                { upsert: true }
            );
        } catch (error) {
            // No receipt stored: put the goal back, so the proof is never published without it. Its Tails
            // are frozen while DELIVERED, so a full goal goes back to FILLED and any other to OPEN.
            const current = await this.store.goals.findOne(
                { _id: row._id },
                { projection: { raisedTails: 1, targetTails: 1 } }
            );
            const back = current && !remainingOf(current) ? RescueGoalStatus.FILLED : RescueGoalStatus.OPEN;
            await this.store.goals.updateOne(
                { _id: row._id, status: RescueGoalStatus.DELIVERED, 'delivery.receiptSha256': receiptSha256 },
                { $set: { status: back, updatedAt: now }, $unset: { delivery: '' } }
            );
            this.logger.error(`goal ${String(row._id)}: receipt not stored, delivery undone`, (error as Error)?.stack);
            throw new ServiceUnavailableException('The receipt could not be stored. Try the delivery again.');
        }
        this.logger.log(`goal ${String(row._id)} delivered by ${String(deliveredBy)}`);
        return this.managerGet(id);
    }

    async cancel(id: string, reason: string, user: IAuthUser, now: Date = new Date()): Promise<ManagerGoal> {
        const cancelledBy = objectIdOrNull(user?._id);
        if (!cancelledBy) {
            throw guestForbidden();
        }
        const why = text(reason);
        if (why.length < 3 || why.length > 300) {
            throw new BadRequestException('Give a reason (3 to 300 characters)');
        }
        const row = await this.goal(id);
        const result = await this.store.goals.updateOne(
            { _id: row._id, status: { $in: [RescueGoalStatus.OPEN, RescueGoalStatus.FILLED] } },
            {
                $set: {
                    status: RescueGoalStatus.CANCELLED,
                    cancelledAt: now,
                    cancelledBy,
                    cancelReason: why,
                    refundUntil: RescueGoalPledgeService.cancelRefundUntil(now),
                    updatedAt: now,
                },
            }
        );
        if (!result.modifiedCount) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_NOT_CANCELLABLE, { status: row.status });
        }
        const refunded = await this.pledges.refundCancelledGoal(row._id, now);
        this.logger.log(`goal ${String(row._id)} cancelled by ${String(cancelledBy)}; ${refunded} gives refunded`);
        return this.managerGet(id);
    }

    async receipt(id: string): Promise<{ data: Buffer; mime: string; sha256: string }> {
        const goalId = objectIdOrNull(id);
        const row = goalId ? await this.store.receipts.findOne({ _id: goalId }) : null;
        if (!row) {
            throw new NotFoundException('No receipt for this goal');
        }
        const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data?.buffer || row.data || []);
        return { data, mime: row.mime, sha256: row.sha256 };
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    private async goal(id: string): Promise<Doc> {
        const goalId = objectIdOrNull(id);
        const row = goalId ? await this.store.goals.findOne({ _id: goalId }) : null;
        if (!row) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_NOT_FOUND);
        }
        return row;
    }

    private goalsInBudgetMonth(budgetMonth: string) {
        return this.store.goals.countDocuments({ budgetMonth, status: { $ne: RescueGoalStatus.CANCELLED } });
    }

    private fundingOf(input: GoalWriteInput, by: Types.ObjectId, now: Date): Doc {
        const setAside = input.fundingSetAside === true || input.fundingSetAside === 'true';
        const line = text(input.fundingLine);
        const amountCents = toCents(input.fundingAmount);
        const currency = text(input.fundingCurrency).toUpperCase() as GoalFundingCurrency;
        if (!setAside || !line || !amountCents || !GOAL_FUNDING_CURRENCIES.includes(currency)) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_FUNDING_REQUIRED, {
                missing: [
                    !setAside && 'fundingSetAside',
                    !line && 'fundingLine',
                    !amountCents && 'fundingAmount',
                    !GOAL_FUNDING_CURRENCIES.includes(currency) && 'fundingCurrency',
                ].filter(Boolean),
            });
        }
        const funding: Doc = {
            setAside: true,
            line: line.slice(0, 80),
            amountCents,
            currency,
            setAsideAt: now,
            setAsideBy: by,
        };
        const note = text(input.fundingNote);
        if (note) funding.note = note.slice(0, 300);
        return funding;
    }

    private async partnerShelter(id: unknown): Promise<Doc> {
        const shelterId = objectIdOrNull(id);
        const shelter = shelterId
            ? await this.store.shelters.findOne({ _id: shelterId }, { projection: PUBLIC_SHELTER_PROJECTION })
            : null;
        if (!shelter) {
            throw new BadRequestException('Pick an existing shelter');
        }
        if (isHouseShelter(shelter)) {
            throw rescueGoalError(RESCUE_GOAL_ERROR.GOAL_HOUSE_SHELTER);
        }
        return shelter;
    }

    /** Validated text fields. On create the required ones must be present; on update only given keys. */
    private textFields(input: GoalWriteInput, creating: boolean, now: Date): Doc {
        const out: Doc = {};
        const has = (key: keyof GoalWriteInput) => input[key] !== undefined;
        const bounded = (key: keyof GoalWriteInput, min: number, max: number, required: boolean) => {
            if (!has(key)) {
                if (required) throw new BadRequestException(`${key} is required`);
                return;
            }
            const value = text(input[key]);
            if (!value && !required) {
                out[key] = null;
                return;
            }
            if (value.length < min || value.length > max) {
                throw new BadRequestException(`${key} must be ${min} to ${max} characters`);
            }
            out[key] = value;
        };
        bounded('title', 3, 80, creating);
        bounded('deliverable', 3, 140, creating);
        bounded('proofOwner', 2, 80, creating);
        bounded('description', 0, 600, false);
        if (has('image')) {
            const image = text(input.image);
            if (image && !HTTPS_URL.test(image)) {
                throw new BadRequestException('image must be an https URL');
            }
            if (image && !goalImageHosts().includes(hostOf(image))) {
                throw new BadRequestException('image must be uploaded to Token Tails storage (use the image upload)');
            }
            out.image = image || null;
        }
        if (has('endsAt')) {
            const raw = text(input.endsAt);
            if (!raw) {
                out.endsAt = null;
            } else {
                const endsAt = new Date(raw);
                if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= now.getTime()) {
                    throw new BadRequestException('endsAt must be a future date');
                }
                out.endsAt = endsAt;
            }
        }
        if (creating) {
            for (const key of Object.keys(out)) {
                if (out[key] === null) delete out[key];
            }
        }
        return out;
    }

    private async shelters(ids: unknown[]): Promise<Map<string, PublicShelter>> {
        const unique = [...new Set(ids.map(String))].map(id => objectIdOrNull(id)).filter(Boolean);
        if (!unique.length) {
            return new Map();
        }
        const rows = await this.store.shelters
            .find({ _id: { $in: unique } }, { projection: PUBLIC_SHELTER_PROJECTION })
            .toArray();
        return new Map(
            rows.map(row => [
                String(row._id),
                {
                    _id: String(row._id),
                    name: String(row.name || ''),
                    slug: row.slug || null,
                    image: row.image || null,
                    country: row.country || null,
                    countryCode: row.countryCode || null,
                },
            ])
        );
    }

    private async publicViews(rows: Doc[], surface: GoalSurface, now: Date = new Date()): Promise<PublicGoal[]> {
        const shelters = await this.shelters(rows.map(row => row.shelter));
        return rows.map(row => publicGoalView(row, shelters.get(String(row.shelter)) || null, surface, now));
    }

    private async managerView(row: Doc): Promise<ManagerGoal> {
        const [view] = await this.publicViews([row], 'web');
        const counts = {} as Record<RescueGoalPledgeStatus, number>;
        await Promise.all(
            Object.values(RescueGoalPledgeStatus).map(async status => {
                counts[status] = await this.store.pledges.countDocuments({ goal: row._id, status });
            })
        );
        const budgetMonthGoals = await this.goalsInBudgetMonth(row.budgetMonth);
        const funding = row.funding || {};
        return {
            ...view,
            budgetMonth: row.budgetMonth,
            proofOwner: row.proofOwner,
            funding: {
                setAside: !!funding.setAside,
                line: funding.line || '',
                amountCents: num(funding.amountCents),
                currency: funding.currency,
                note: funding.note || null,
                setAsideAt: iso(funding.setAsideAt),
            },
            cancelReason: row.cancelReason || null,
            pledges: counts,
            receipt: row.delivery
                ? {
                      sha256: row.delivery.receiptSha256,
                      mime: row.delivery.receiptMime,
                      size: num(row.delivery.receiptSize),
                  }
                : null,
            budgetMonthGoals,
        };
    }
}

/** The public view of one goal (see the header for what it leaves out). */
export function publicGoalView(
    row: Doc,
    shelter: PublicShelter | null,
    surface: GoalSurface = 'web',
    now: Date = new Date()
): PublicGoal {
    const delivery = row.delivery
        ? {
              photoUrl: row.delivery.photoUrl,
              receiptSha256: row.delivery.receiptSha256,
              note: row.delivery.note || null,
              deliveredAt: iso(row.delivery.deliveredAt)!,
              ...(surface === 'web' ? { txHash: row.delivery.txHash || null } : {}),
          }
        : null;
    return {
        id: String(row._id),
        title: row.title,
        description: row.description || null,
        deliverable: row.deliverable,
        image: row.image || null,
        shelter: shelter ? { ...shelter } : null,
        status: row.status,
        expired: isExpired(row, now),
        targetTails: num(row.targetTails),
        raisedTails: num(row.raisedTails),
        remainingTails: remainingOf(row),
        pledgeCount: num(row.pledgeCount),
        endsAt: iso(row.endsAt),
        filledAt: iso(row.filledAt),
        createdAt: iso(row.createdAt),
        delivery,
        cancelledAt: iso(row.cancelledAt),
    };
}

export { GOALS_PER_BUDGET_MONTH_MIN_HINT };
