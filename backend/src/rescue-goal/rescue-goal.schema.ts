import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RescueGoalStatus } from 'src/shared-contracts/enums';
import { RESCUE_GOAL_COLLECTIONS, RescueGoalPledgeStatus } from './rescue-goal.constants';

/*
 * Rescue Goals storage (plan G5). The service writes through the native collections (pipeline
 * updates, conditional upserts); these schemas register the models, declare the fields and build
 * the indexes. Fields marked "saga" are bookkeeping for crash recovery and never leave the backend.
 */

export const GOAL_FUNDING_CURRENCIES = ['EUR', 'USD', 'USDC'] as const;
export type GoalFundingCurrency = typeof GOAL_FUNDING_CURRENCIES[number];

/** The money set aside for a goal. Manager-only: never in a public view (decision #37). */
@Schema({ _id: false })
export class RescueGoalFunding {
    @Prop({ required: true })
    setAside: boolean;

    /** The budget or sponsor line the money comes from. */
    @Prop({ required: true })
    line: string;

    /** Minor units (cents). */
    @Prop({ required: true })
    amountCents: number;

    @Prop({ required: true, enum: GOAL_FUNDING_CURRENCIES })
    currency: GoalFundingCurrency;

    @Prop({ required: false })
    note?: string;

    @Prop({ required: true, type: Date })
    setAsideAt: Date;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    setAsideBy: Types.ObjectId;
}

@Schema({ _id: false })
export class RescueGoalDelivery {
    /** Public URL of the delivery photo (re-encoded, metadata stripped). */
    @Prop({ required: true })
    photoUrl: string;

    @Prop({ required: true })
    photoSha256: string;

    /** The receipt itself stays private (`rescuegoalreceipts`); its hash is public. */
    @Prop({ required: true })
    receiptSha256: string;

    @Prop({ required: true })
    receiptMime: string;

    @Prop({ required: true })
    receiptSize: number;

    @Prop({ required: false })
    note?: string;

    /** Shown on web only (F11 app-build rules); `?surface=app` views drop it. */
    @Prop({ required: false })
    txHash?: string;

    @Prop({ required: true, type: Date })
    deliveredAt: Date;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    deliveredBy: Types.ObjectId;
}

@Schema({ timestamps: true, collection: RESCUE_GOAL_COLLECTIONS.goals })
export class RescueGoal {
    @Prop({ required: true, type: Types.ObjectId, ref: 'Shelter' })
    shelter: Types.ObjectId;

    @Prop({ required: true })
    title: string;

    @Prop({ required: false })
    description?: string;

    /** What the money buys, in plain words ("10 kg of kitten food"). Public. */
    @Prop({ required: true })
    deliverable: string;

    @Prop({ required: false })
    image?: string;

    @Prop({ required: true })
    targetTails: number;

    @Prop({ required: true, default: 0 })
    raisedTails: number;

    @Prop({ required: true, default: 0 })
    pledgeCount: number;

    @Prop({ required: true, enum: Object.values(RescueGoalStatus), default: RescueGoalStatus.OPEN })
    status: RescueGoalStatus;

    /** Decision #37: the monthly budget the goal belongs to (`YYYY-MM`). */
    @Prop({ required: true })
    budgetMonth: string;

    /** Decision #37: the named person who delivers the proof. Manager-only. */
    @Prop({ required: true })
    proofOwner: string;

    @Prop({ required: true, type: RescueGoalFunding })
    funding: RescueGoalFunding;

    @Prop({ required: false, type: Date })
    endsAt?: Date;

    @Prop({ required: false, type: Date })
    filledAt?: Date;

    @Prop({ required: false, type: RescueGoalDelivery })
    delivery?: RescueGoalDelivery;

    @Prop({ required: false, type: Date })
    cancelledAt?: Date;

    @Prop({ required: false, type: Types.ObjectId, ref: 'User' })
    cancelledBy?: Types.ObjectId;

    @Prop({ required: false })
    cancelReason?: string;

    /** Saga: refunds of a cancelled goal are re-run until then (gives that were mid-flight). */
    @Prop({ required: false, type: Date })
    refundUntil?: Date;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    createdBy: Types.ObjectId;

    /** Saga: gives whose Tails this goal counted but whose give is not settled yet. */
    @Prop({ type: [Types.ObjectId], default: undefined })
    pendingTakes?: Types.ObjectId[];

    /** Saga: gives the sweeper took over; the goal refuses to count them from then on. */
    @Prop({ type: [Types.ObjectId], default: undefined })
    fencedPledges?: Types.ObjectId[];
}

export type RescueGoalDocument = HydratedDocument<RescueGoal>;
export const RescueGoalSchema = SchemaFactory.createForClass(RescueGoal);
RescueGoalSchema.index({ status: 1, createdAt: -1 }, { name: 'goal_status_created' });
RescueGoalSchema.index({ budgetMonth: 1, status: 1 }, { name: 'goal_budget_month' });
RescueGoalSchema.index(
    { status: 1, refundUntil: 1 },
    { name: 'goal_cancel_refunds', partialFilterExpression: { refundUntil: { $exists: true } } }
);

@Schema({ timestamps: true, collection: RESCUE_GOAL_COLLECTIONS.pledges })
export class RescueGoalPledge {
    /** The client's UUID: the idempotency key, unique per user. */
    @Prop({ required: true })
    clientId: string;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    user: Types.ObjectId;

    @Prop({ required: true, type: Types.ObjectId, ref: 'RescueGoal' })
    goal: Types.ObjectId;

    @Prop({ required: true })
    amount: number;

    /** UTC day of the daily cap reservation. */
    @Prop({ required: true })
    day: string;

    @Prop({ required: true, enum: Object.values(RescueGoalPledgeStatus) })
    status: RescueGoalPledgeStatus;

    @Prop({ required: false })
    reason?: string;

    /** The player's first give to this goal: it counted into `goalsHelped`. */
    @Prop({ required: false })
    firstForGoal?: boolean;

    /** Saga: the last season counter reset before the give (decides whether a refund touches `monthTailsGiven`). */
    @Prop({ required: true, type: Date })
    counterEpoch: Date;

    /** Saga: the request does nothing after this; the sweeper starts a grace period later. */
    @Prop({ required: true, type: Date })
    deadline: Date;

    /** Saga: every hold of this give (user, day, goal) is cleared. */
    @Prop({ required: true, default: false })
    settled: boolean;

    /** Saga: one more idempotent clean-up pass at this time (late writes after a sweep). */
    @Prop({ required: false, type: Date })
    recheckAt?: Date;

    @Prop({ required: false })
    transaction?: boolean;

    @Prop({ required: false, type: Date })
    confirmedAt?: Date;

    @Prop({ required: false, type: Date })
    refundedAt?: Date;
}

export type RescueGoalPledgeDocument = HydratedDocument<RescueGoalPledge>;
export const RescueGoalPledgeSchema = SchemaFactory.createForClass(RescueGoalPledge);
RescueGoalPledgeSchema.index({ user: 1, clientId: 1 }, { unique: true, name: 'pledge_client_id' });
RescueGoalPledgeSchema.index({ status: 1, deadline: 1 }, { name: 'pledge_sweep' });
RescueGoalPledgeSchema.index(
    { settled: 1, deadline: 1 },
    { name: 'pledge_unsettled', partialFilterExpression: { settled: false } }
);
RescueGoalPledgeSchema.index(
    { recheckAt: 1 },
    { name: 'pledge_recheck', partialFilterExpression: { recheckAt: { $exists: true } } }
);
RescueGoalPledgeSchema.index({ goal: 1, status: 1 }, { name: 'pledge_goal_status' });
RescueGoalPledgeSchema.index({ user: 1, createdAt: -1 }, { name: 'pledge_user_recent' });

/** One per user and UTC day: the daily cap reservation. `_id` is `<userId>:<YYYY-MM-DD>`. */
@Schema({ collection: RESCUE_GOAL_COLLECTIONS.days })
export class RescueGoalPledgeDay {
    @Prop({ required: true })
    _id: string;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    user: Types.ObjectId;

    @Prop({ required: true })
    day: string;

    @Prop({ required: true, default: 0 })
    reserved: number;

    /** The gives that hold part of `reserved`. */
    @Prop({ type: [Types.ObjectId], default: [] })
    pledges: Types.ObjectId[];

    /** For the TTL index: day documents expire a week after the day. */
    @Prop({ required: true, type: Date })
    expiresAt: Date;
}

export const RescueGoalPledgeDaySchema = SchemaFactory.createForClass(RescueGoalPledgeDay);
RescueGoalPledgeDaySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'pledge_day_ttl' });

/** One per (goal, user): who helped a goal, and which give was their first. `_id` is `<goalId>:<userId>`. */
@Schema({ collection: RESCUE_GOAL_COLLECTIONS.helpers })
export class RescueGoalHelper {
    @Prop({ required: true })
    _id: string;

    @Prop({ required: true, type: Types.ObjectId, ref: 'RescueGoal' })
    goal: Types.ObjectId;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    user: Types.ObjectId;

    @Prop({ required: true, type: Types.ObjectId })
    firstPledge: Types.ObjectId;

    @Prop({ required: true, type: Date })
    createdAt: Date;
}

export const RescueGoalHelperSchema = SchemaFactory.createForClass(RescueGoalHelper);
RescueGoalHelperSchema.index({ goal: 1 }, { name: 'helper_goal' });

/** The delivery receipt (private; managers download it, the public sees its SHA-256). `_id` is the goal id. */
@Schema({ collection: RESCUE_GOAL_COLLECTIONS.receipts })
export class RescueGoalReceipt {
    @Prop({ required: true, type: Types.ObjectId })
    _id: Types.ObjectId;

    @Prop({ required: true, type: Buffer })
    data: Buffer;

    @Prop({ required: true })
    mime: string;

    @Prop({ required: true })
    sha256: string;

    @Prop({ required: true, type: Date })
    uploadedAt: Date;
}

export const RescueGoalReceiptSchema = SchemaFactory.createForClass(RescueGoalReceipt);
