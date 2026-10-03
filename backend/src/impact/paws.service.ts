import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { Game, GameDocument, GameType } from 'src/game/game.schema';
import { DonationBroadcastError, ShelterChain } from 'src/shelter/onchain/shelter-chain';
import { utcDay } from 'src/shelter/onchain/shelter-donate.service';
import { readShelterConfig, ShelterOnchainConfig } from 'src/shelter/onchain/shelter-onchain.config';
import { ILeaseCollection, isDuplicateKeyError, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { User, UserDocument } from 'src/user/user.schema';
import {
    accountFactsOf,
    DAILY_PAW_MIN_RUNS,
    dailyPawPolicy,
    EligibilityResult,
    spacedScoringRuns,
} from './eligibility';
import { impactJobsEnabled } from './impact.config';
import { errorClass } from './impact-indexer.service';
import { buildMerkleTree, MerkleTree, merkleProof, pawLeaf, pawMemo, pawUserHash } from './merkle';
import { perPawWei, PawsConfig, readPawsConfig, settlementAmountWei, suggestedBudgetWei } from './paws.config';
import {
    PAW_SETTLEMENT_FROZEN,
    Paw,
    PawDocument,
    PawSettlement,
    PawSettlementDocument,
    PawSettlementStatus,
} from './paws.schema';

export const PAW_SETTLEMENT_JOB = 'paw-settlement';
/** 00:30 UTC (plan G4). Settles the UTC day that just ended. */
export const PAW_SETTLEMENT_CRON = '30 0 * * *';
export const PAW_SETTLEMENT_LEASE_MS = 60 * 60 * 1000;
export const PAW_RECONCILE_JOB = 'paw-reconcile';
export const PAW_RECONCILE_CRON = '*/10 * * * *';
/** Days a missed 00:30 run is caught up for (the nightly run and the hourly catch-up both look back this far). */
export const PAW_CATCH_UP_DAYS = 3;
/** The catch-up leaves a day to the nightly run for this long after its 00:30 settlement time. */
export const PAW_CATCH_UP_GRACE_MS = 60 * 60 * 1000;
export const PAW_RECONCILE_LEASE_MS = 9 * 60 * 1000;
/** A `sending` row this old never got a signed hash: nothing left the process, so it is sendable again. */
export const PAW_SENDING_STALE_MS = 10 * 60 * 1000;
/** A signed transaction the node does not know after this long, with its nonce still free, was dropped. */
export const PAW_DROPPED_AFTER_MS = 30 * 60 * 1000;
/** Days averaged for `suggestedBudgetWei` (decision #26). */
export const PAW_BUDGET_WINDOW_DAYS = 30;
const USER_BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Game rows that can earn a paw. Heist saves are replay-checked but not played with the cat (as for treats). */
export const pawRunFilter = (start: Date, end: Date) => ({
    createdAt: { $gte: start, $lt: end },
    points: { $gt: 0 },
    type: { $ne: GameType.CATNIP_HEIST },
});

export type SettleOutcome = 'built' | 'sent' | 'empty' | 'already-settled' | 'send-held' | 'send-failed';

export interface PublicPawSettlement {
    day: string;
    status: PawSettlementStatus;
    pawCount: number;
    amountWei: string;
    symbol: 'USDC';
    root: string | null;
    memo: string | null;
    txHash: string | null;
}

export interface PawProof {
    day: string;
    pawId: string;
    /**
     * The paw's own salt, returned only to its owner (GET /impact/me), so they can check that
     * `userHash` = keccak256(userId + salt) is really theirs. Never in a public response.
     */
    salt: string;
    userHash: string;
    leaf: string;
    proof: string[];
    root: string;
    memo: string;
    status: PawSettlementStatus;
    txHash: string | null;
}

export interface PawsMe {
    today: {
        day: string;
        qualifyingRuns: number;
        runsNeeded: number;
        remaining: number;
        /** Two spaced scoring runs today and eligible at tonight's settlement. */
        earned: boolean;
        /** The account check at tonight's settlement (age, verified email). */
        eligibility: EligibilityResult;
        settlesAt: string;
        message: string;
    };
    lifetime: number;
    latestSettlement: PublicPawSettlement | null;
    /** The caller's most recent paw in a built settlement, with its Merkle proof. */
    proof: PawProof | null;
}

/** 00:30 UTC after `day`. */
export function settlementTimeFor(day: string): Date {
    return new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS + 30 * 60 * 1000);
}

export function previousUtcDay(now: Date): string {
    return utcDay(new Date(now.getTime() - DAY_MS));
}

export function pawProgressMessage(remaining: number, eligibility: EligibilityResult): string {
    if (remaining > 0) {
        return `${remaining} more run${remaining === 1 ? '' : 's'} for today's paw`;
    }
    if (eligibility.eligible) {
        return "Today's paw is earned. Token Tails settles it tonight at 00:30 UTC.";
    }
    if (eligibility.reason === 'email-unverified') {
        return "Verify your email to earn today's paw.";
    }
    if (eligibility.reason === 'account-too-new') {
        return 'Paws start once your account is a day old.';
    }
    return "Sign in to earn today's paw.";
}

function publicSettlement(row: Record<string, any> | null | undefined): PublicPawSettlement | null {
    if (!row) {
        return null;
    }
    return {
        day: String(row._id),
        status: row.status,
        pawCount: Number(row.pawCount) || 0,
        amountWei: /^\d+$/.test(String(row.amountWei || '')) ? String(row.amountWei) : '0',
        symbol: 'USDC',
        root: row.root || null,
        memo: row.memo || null,
        txHash: ['signed', 'sent', 'confirmed', 'failed'].includes(row.status) ? row.txHash || null : null,
    };
}

const sendReady = (config: ShelterOnchainConfig) => !!(config.rpcUrl && config.splitAddress && config.privateKey);

/**
 * Nightly paw settlement (plan G4 "Paws", F7.5, F8). Reads `games` read-only: this service never
 * creates, changes or deletes a Game row and does not import the `/live` path
 * (`src/impact/impact-no-game-writes.spec.ts`).
 *
 * At 00:30 UTC one leased run settles the UTC day that ended: every registered, verified account at
 * least 24 h old at settlement with two `/live` rows of `points > 0` at least 3 minutes apart gets one
 * paw (unique per user and day); the paws form a Merkle tree; one ShelterSplit
 * `donate('tt:paws:<day>:<root>')` pays min(budget, paws x amount), only when PAWS_SETTLEMENT_ENABLED.
 * Every step is idempotent: the day's row fixes the instant, the tree and the single send.
 */
@Injectable()
export class PawSettlementService {
    private readonly logger = new Logger(PawSettlementService.name);
    /** Trees by day, for proofs. Rebuilt from the stored leaves and checked against the stored root. */
    private trees = new Map<string, { root: string; tree: MerkleTree; index: Map<string, number> }>();
    /** Overridable in specs. */
    pawsConfig: () => PawsConfig = () => readPawsConfig();
    shelterConfig: () => ShelterOnchainConfig = () => readShelterConfig();

    constructor(
        @InjectModel(Paw.name) private pawModel: Model<PawDocument>,
        @InjectModel(PawSettlement.name) private settlementModel: Model<PawSettlementDocument>,
        @InjectModel(Game.name) private gameModel: Model<GameDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        private chain: ShelterChain
    ) {}

    private jobRuns() {
        return this.settlementModel.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection;
    }

    @Cron(PAW_SETTLEMENT_CRON, { name: PAW_SETTLEMENT_JOB, timeZone: 'UTC' })
    async settlementCron(now: Date = new Date()) {
        if (!impactJobsEnabled()) {
            return 'disabled';
        }
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: PAW_SETTLEMENT_JOB,
            ttlMs: PAW_SETTLEMENT_LEASE_MS,
            logger: this.logger,
            now,
            run: async () => {
                const result = await this.settleDay(previousUtcDay(now), now);
                await this.catchUp(now);
                return result;
            },
        });
    }

    /**
     * Settles any of the last PAW_CATCH_UP_DAYS days that has no settlement row: a jobs instance that was
     * down or redeploying at 00:30 must not cost players the paws they were told they earned. A day is
     * left to the nightly run until PAW_CATCH_UP_GRACE_MS after its settlement time. Each day is judged
     * at its own 00:30 settlement time (see settleDay), not at the late run's time.
     */
    async catchUp(now: Date = new Date()): Promise<string[]> {
        const settled: string[] = [];
        for (let back = 1; back <= PAW_CATCH_UP_DAYS; back++) {
            const day = utcDay(new Date(now.getTime() - back * DAY_MS));
            if (settlementTimeFor(day).getTime() + PAW_CATCH_UP_GRACE_MS > now.getTime()) {
                continue;
            }
            if (await this.settlementModel.findOne({ _id: day }, { _id: 1 }).lean()) {
                continue;
            }
            try {
                await this.settleDay(day, now);
                settled.push(day);
                this.logger.warn(`paw settlement for ${day} was missed at 00:30 UTC: caught up`);
            } catch (error) {
                this.logger.error(`paw catch-up for ${day} failed: ${errorClass(error)}`);
            }
        }
        return settled;
    }

    @Cron(PAW_RECONCILE_CRON, { name: PAW_RECONCILE_JOB })
    async reconcileCron(now: Date = new Date()) {
        if (!impactJobsEnabled()) {
            return 'disabled';
        }
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: PAW_RECONCILE_JOB,
            ttlMs: PAW_RECONCILE_LEASE_MS,
            logger: this.logger,
            now,
            run: async () => {
                const result = await this.reconcileOnce(now);
                // Once an hour, settle a day the 00:30 run missed (no-op when every day has its row).
                if (now.getUTCMinutes() < 10) {
                    await this.catchUp(now);
                }
                return result;
            },
        });
    }

    /**
     * Settles `day` (idempotent). Builds the paws and the tree once; sends at most one transaction for
     * the day, ever. A rerun after a crash continues where the last run stopped.
     */
    async settleDay(day: string, now: Date = new Date()): Promise<{ outcome: SettleOutcome; settlement: any }> {
        if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
            throw new BadRequestException('day must be YYYY-MM-DD');
        }
        const end = new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS);
        if (end.getTime() > now.getTime()) {
            throw new BadRequestException('That UTC day has not ended yet');
        }
        // A late run (catch-up or a manual ADMIN settle days later) still judges the 24 h account age at the
        // day's own 00:30 settlement time, so an account created after it cannot count as old enough.
        const settlementAt = new Date(Math.min(now.getTime(), settlementTimeFor(day).getTime()));
        try {
            await this.settlementModel.updateOne(
                { _id: day },
                { $setOnInsert: { status: 'building', settlementAt, candidateCount: 0, pawCount: 0 } },
                { upsert: true }
            );
        } catch (error) {
            // Two instances inserting the same day: the other one won; carry on with its row.
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
        }
        let row: any = await this.settlementModel.findOne({ _id: day }).lean();
        if (PAW_SETTLEMENT_FROZEN.includes(row.status)) {
            return { outcome: row.status === 'empty' ? 'empty' : 'already-settled', settlement: row };
        }
        if (row.status === 'building') {
            row = await this.build(day, new Date(row.settlementAt), now);
            if (row.status === 'empty') {
                return { outcome: 'empty', settlement: row };
            }
        }
        return this.send(day, row, now);
    }

    /** Lets an ADMIN retry a day whose single transaction certainly did not pay (refused or reverted). */
    async retryFailed(day: string, now: Date = new Date()) {
        const reset = await this.settlementModel.findOneAndUpdate(
            { _id: day, status: 'failed', failedReason: { $in: ['send-refused', 'reverted', 'dropped'] } },
            {
                $set: { status: 'built', lastError: 'retried' },
                $unset: { txHash: 1, nonce: 1, from: 1, failedReason: 1, failedAt: 1, sendingAt: 1, signedAt: 1 },
            },
            { new: true }
        );
        if (!reset) {
            throw new BadRequestException('Only a failed settlement that certainly did not pay can be retried');
        }
        return this.settleDay(day, now);
    }

    private async build(day: string, settlementAt: Date, now: Date) {
        const start = new Date(`${day}T00:00:00Z`);
        const end = new Date(start.getTime() + DAY_MS);
        const groups: { _id: Types.ObjectId; times: Date[] }[] = await this.gameModel
            .aggregate([
                { $match: { ...pawRunFilter(start, end), user: { $exists: true, $ne: null } } },
                { $group: { _id: '$user', times: { $push: '$createdAt' } } },
            ])
            .exec();
        const runsByUser = new Map<string, Date[]>();
        for (const group of groups || []) {
            const runs = (group.times || []).map(createdAt => ({ points: 1, createdAt }));
            if (group._id && spacedScoringRuns(runs) >= DAILY_PAW_MIN_RUNS) {
                runsByUser.set(String(group._id), group.times);
            }
        }

        const ids = [...runsByUser.keys()];
        let created = 0;
        for (let i = 0; i < ids.length; i += USER_BATCH) {
            const batch = ids.slice(i, i + USER_BATCH).map(id => new Types.ObjectId(id));
            const users: any[] = await this.userModel
                .find(
                    { _id: { $in: batch } },
                    {
                        _id: 1,
                        isGuest: 1,
                        transient: 1,
                        emailVerifiedAt: 1,
                        createdAt: 1,
                        promotedAt: 1,
                        deletedAt: 1,
                        mergedInto: 1,
                    }
                )
                .lean();
            for (const user of users || []) {
                if (user.deletedAt || user.mergedInto) {
                    continue;
                }
                const runs = (runsByUser.get(String(user._id)) || []).map(createdAt => ({ points: 1, createdAt }));
                if (!dailyPawPolicy({ ...accountFactsOf(user), runs }, settlementAt).eligible) {
                    continue;
                }
                if (await this.insertPaw(user._id, day)) {
                    created++;
                }
            }
        }

        const paws: { pawId: string; leaf: string }[] = await this.pawModel
            .find({ day }, { pawId: 1, leaf: 1 })
            .sort({ pawId: 1 })
            .lean();
        const pawCount = (paws || []).length;
        if (!pawCount) {
            return this.settlementModel
                .findOneAndUpdate(
                    { _id: day, status: 'building' },
                    { $set: { status: 'empty', candidateCount: groups?.length || 0, pawCount: 0, builtAt: now } },
                    { new: true }
                )
                .lean();
        }
        const tree = buildMerkleTree(paws.map(paw => paw.leaf));
        const config = this.pawsConfig();
        const amount = settlementAmountWei(pawCount, config);
        const recent = await this.recentDailyPaws(day);
        const built = await this.settlementModel
            .findOneAndUpdate(
                { _id: day, status: 'building' },
                {
                    $set: {
                        status: 'built',
                        candidateCount: groups?.length || 0,
                        pawCount,
                        root: tree.root,
                        memo: pawMemo(day, tree.root),
                        budgetWei: config.dailyBudgetWei.toString(),
                        pawAmountWei: config.amountWei.toString(),
                        amountWei: amount.toString(),
                        perPawWei: perPawWei(amount, pawCount).toString(),
                        suggestedBudgetWei: suggestedBudgetWei([...recent, pawCount], config.amountWei).toString(),
                        builtAt: now,
                    },
                },
                { new: true }
            )
            .lean();
        this.trees.delete(day);
        this.logger.log(
            `paws ${day}: ${pawCount} paws (${created} new) from ${groups?.length || 0} players; ` +
                `pays ${amount} wei of a ${config.dailyBudgetWei} wei budget`
        );
        // Another instance finished the build first: its row is the truth.
        return built || this.settlementModel.findOne({ _id: day }).lean();
    }

    /** Inserts the paw if this user has none for the day. True when this call created it. */
    private async insertPaw(userId: Types.ObjectId, day: string): Promise<boolean> {
        const pawId = randomBytes(16).toString('hex');
        const salt = `0x${randomBytes(32).toString('hex')}`;
        const userHash = pawUserHash(String(userId), salt);
        try {
            const result = await this.pawModel.updateOne(
                { user: userId, day },
                { $setOnInsert: { user: userId, day, pawId, salt, userHash, leaf: pawLeaf({ pawId, userHash, day }) } },
                { upsert: true }
            );
            return (result?.upsertedCount || 0) > 0;
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                return false;
            }
            throw error;
        }
    }

    private async recentDailyPaws(day: string): Promise<number[]> {
        const since = utcDay(new Date(Date.parse(`${day}T00:00:00Z`) - PAW_BUDGET_WINDOW_DAYS * DAY_MS));
        const rows: any[] = await this.settlementModel
            .find({ _id: { $gte: since, $lt: day } }, { pawCount: 1 })
            .lean()
            .catch(() => []);
        return (rows || []).map(row => Number(row.pawCount) || 0);
    }

    private async send(day: string, row: any, now: Date): Promise<{ outcome: SettleOutcome; settlement: any }> {
        if (row.status !== 'built') {
            return { outcome: 'already-settled', settlement: row };
        }
        const paws = this.pawsConfig();
        const config = this.shelterConfig();
        const skipped = !paws.sendEnabled
            ? 'disabled'
            : !sendReady(config)
            ? 'not-configured'
            : !(BigInt(row.amountWei || '0') > BigInt(0))
            ? 'zero-amount'
            : null;
        if (skipped) {
            const settlement = await this.settlementModel
                .findOneAndUpdate({ _id: day, status: 'built' }, { $set: { sendSkipped: skipped } }, { new: true })
                .lean();
            return { outcome: 'built', settlement: settlement || row };
        }
        // The one atomic step that allows a send: only one caller ever moves `built` to `sending`.
        const claimed: any = await this.settlementModel
            .findOneAndUpdate(
                { _id: day, status: 'built', txHash: { $exists: false } },
                { $set: { status: 'sending', sendingAt: now, chainId: config.chainId }, $unset: { sendSkipped: 1 } },
                { new: true }
            )
            .lean();
        if (!claimed) {
            return { outcome: 'already-settled', settlement: await this.settlementModel.findOne({ _id: day }).lean() };
        }
        try {
            const tx = await this.chain.sendDonation(config, claimed.memo, BigInt(claimed.amountWei), async signed => {
                await this.settlementModel.updateOne(
                    { _id: day, status: 'sending' },
                    {
                        $set: {
                            status: 'signed',
                            txHash: signed.hash,
                            nonce: signed.nonce,
                            from: signed.from,
                            signedAt: new Date(),
                        },
                    }
                );
            });
            const settlement = await this.settlementModel
                .findOneAndUpdate(
                    { _id: day, status: 'signed', txHash: tx.hash },
                    { $set: { status: 'sent', sentAt: new Date() } },
                    { new: true }
                )
                .lean();
            this.logger.log(`paws ${day}: sent ${claimed.amountWei} wei in ${tx.hash}`);
            return { outcome: 'sent', settlement };
        } catch (error) {
            if (error instanceof DonationBroadcastError) {
                if (error.definite) {
                    const settlement = await this.settlementModel
                        .findOneAndUpdate(
                            { _id: day, status: 'signed' },
                            {
                                $set: {
                                    status: 'failed',
                                    failedReason: 'send-refused',
                                    lastError: error.code,
                                    failedAt: new Date(),
                                },
                            },
                            { new: true }
                        )
                        .lean();
                    return { outcome: 'send-failed', settlement };
                }
                // Ambiguous: it may still be mined. Stays `signed`; the reconcile settles it.
                this.logger.warn(`paws ${day}: broadcast unclear (${error.code}), left for reconcile`);
                return { outcome: 'send-held', settlement: await this.settlementModel.findOne({ _id: day }).lean() };
            }
            // Failed before signing: nothing left the process, so the day is sendable again.
            await this.settlementModel.updateOne(
                { _id: day, status: 'sending', txHash: { $exists: false } },
                { $set: { status: 'built', lastError: errorClass(error) }, $unset: { sendingAt: 1 } }
            );
            this.logger.error(`paws ${day}: send failed before signing: ${errorClass(error)}`);
            return { outcome: 'send-failed', settlement: await this.settlementModel.findOne({ _id: day }).lean() };
        }
    }

    /** Moves `signed` and `sent` rows to `confirmed` or `failed` by their receipt; frees stuck `sending` rows. */
    async reconcileOnce(now: Date = new Date()) {
        await this.settlementModel.updateMany(
            {
                status: 'sending',
                txHash: { $exists: false },
                sendingAt: { $lt: new Date(now.getTime() - PAW_SENDING_STALE_MS) },
            },
            { $set: { status: 'built', lastError: 'stale-sending' }, $unset: { sendingAt: 1 } }
        );
        const config = this.shelterConfig();
        const open: any[] = await this.settlementModel
            .find({ status: { $in: ['signed', 'sent'] }, txHash: { $exists: true } })
            .lean();
        const result = { confirmed: 0, failed: 0, waiting: 0 };
        if (!config.rpcUrl) {
            result.waiting = (open || []).length;
            return result;
        }
        for (const row of open || []) {
            try {
                const receipt = await this.chain.getReceipt(config, row.txHash);
                if (receipt) {
                    const ok = Number(receipt.status) === 1;
                    await this.settlementModel.updateOne(
                        { _id: row._id, status: row.status },
                        ok
                            ? { $set: { status: 'confirmed', confirmedAt: now, blockNumber: receipt.blockNumber } }
                            : {
                                  $set: {
                                      status: 'failed',
                                      failedReason: 'reverted',
                                      failedAt: now,
                                      blockNumber: receipt.blockNumber,
                                  },
                              }
                    );
                    ok ? result.confirmed++ : result.failed++;
                    continue;
                }
                const known = await this.chain.getTransaction(config, row.txHash);
                const signedAt = new Date(row.signedAt || row.sendingAt || now).getTime();
                if (!known && row.from && typeof row.nonce === 'number') {
                    const mined = await this.chain.minedNonce(config, row.from);
                    const reason =
                        mined > row.nonce
                            ? 'replaced'
                            : now.getTime() - signedAt > PAW_DROPPED_AFTER_MS
                            ? 'dropped'
                            : null;
                    if (reason) {
                        await this.settlementModel.updateOne(
                            { _id: row._id, status: row.status },
                            { $set: { status: 'failed', failedReason: reason, failedAt: now } }
                        );
                        result.failed++;
                        continue;
                    }
                }
                result.waiting++;
            } catch (error) {
                this.logger.error(`paw reconcile ${row._id}: ${errorClass(error)}`);
                result.waiting++;
            }
        }
        return result;
    }

    private async treeFor(day: string, settlement: any) {
        const cached = this.trees.get(day);
        if (cached && cached.root === settlement.root) {
            return cached;
        }
        const leaves: { pawId: string; leaf: string }[] = await this.pawModel
            .find({ day }, { pawId: 1, leaf: 1 })
            .sort({ pawId: 1 })
            .lean();
        if (!leaves?.length || leaves.length !== settlement.pawCount) {
            this.logger.error(
                `paws ${day}: ${leaves?.length || 0} leaves stored, settlement says ${settlement.pawCount}`
            );
            return null;
        }
        const tree = buildMerkleTree(leaves.map(paw => paw.leaf));
        if (tree.root !== settlement.root) {
            this.logger.error(`paws ${day}: stored leaves do not rebuild the settled root`);
            return null;
        }
        const entry = { root: tree.root, tree, index: new Map(leaves.map((paw, i) => [paw.pawId, i])) };
        this.trees.set(day, entry);
        while (this.trees.size > 3) {
            this.trees.delete(this.trees.keys().next().value as string);
        }
        return entry;
    }

    /** The caller's proof for `paw`, or null while its day is not built (or the tree does not check out). */
    async proofFor(paw: any): Promise<PawProof | null> {
        const settlement: any = await this.settlementModel.findOne({ _id: paw.day }).lean();
        if (!settlement?.root || settlement.status === 'building') {
            return null;
        }
        const entry = await this.treeFor(paw.day, settlement);
        const index = entry?.index.get(paw.pawId);
        if (!entry || index === undefined) {
            return null;
        }
        return {
            day: paw.day,
            pawId: paw.pawId,
            salt: paw.salt,
            userHash: paw.userHash,
            leaf: paw.leaf,
            proof: merkleProof(entry.tree, index),
            root: settlement.root,
            memo: settlement.memo,
            status: settlement.status,
            txHash: publicSettlement(settlement)?.txHash || null,
        };
    }

    /** `paws` of GET /impact/me. Reads games read-only. */
    async me(user: Record<string, any>, now: Date = new Date()): Promise<PawsMe> {
        const day = utcDay(now);
        const start = new Date(`${day}T00:00:00Z`);
        const settlesAt = settlementTimeFor(day);
        const userId = Types.ObjectId.isValid(String(user?._id)) ? new Types.ObjectId(String(user._id)) : null;
        const runs: { points?: number; createdAt: Date }[] = userId
            ? await this.gameModel
                  .find(
                      { ...pawRunFilter(start, new Date(start.getTime() + DAY_MS)), user: userId },
                      { points: 1, createdAt: 1 }
                  )
                  .sort({ createdAt: 1 })
                  .limit(500)
                  .lean()
            : [];
        const qualifyingRuns = spacedScoringRuns(runs || []);
        const remaining = Math.max(0, DAILY_PAW_MIN_RUNS - qualifyingRuns);
        const policy = dailyPawPolicy({ ...accountFactsOf(user), runs: runs || [] }, settlesAt);
        // The account part only: runs are reported separately as `remaining`.
        const eligibility: EligibilityResult =
            policy.reason === 'not-enough-runs' ? { eligible: true, reason: null, eligibleAt: null } : policy;
        const [lifetime, latestPaw, latest] = await Promise.all([
            userId ? this.pawModel.countDocuments({ user: userId }) : 0,
            userId ? this.pawModel.findOne({ user: userId }).sort({ day: -1 }).lean() : null,
            this.latestSettlement(),
        ]);
        return {
            today: {
                day,
                qualifyingRuns,
                runsNeeded: DAILY_PAW_MIN_RUNS,
                remaining,
                earned: remaining === 0 && eligibility.eligible,
                eligibility,
                settlesAt: settlesAt.toISOString(),
                message: pawProgressMessage(remaining, eligibility),
            },
            lifetime: Number(lifetime) || 0,
            latestSettlement: latest,
            proof: latestPaw ? await this.proofFor(latestPaw) : null,
        };
    }

    async latestSettlement(): Promise<PublicPawSettlement | null> {
        const row = await this.settlementModel
            .findOne({ status: { $nin: ['building', 'empty'] } })
            .sort({ _id: -1 })
            .lean();
        return publicSettlement(row);
    }

    /** A settlement row for the ADMIN routes: everything but internal timestamps. No user data is in it. */
    adminView(row: any) {
        if (!row) {
            return null;
        }
        const date = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
        return {
            day: String(row._id),
            status: row.status,
            settlementAt: date(row.settlementAt),
            candidateCount: row.candidateCount || 0,
            pawCount: row.pawCount || 0,
            root: row.root || null,
            memo: row.memo || null,
            budgetWei: row.budgetWei || null,
            pawAmountWei: row.pawAmountWei || null,
            amountWei: row.amountWei || null,
            perPawWei: row.perPawWei || null,
            suggestedBudgetWei: row.suggestedBudgetWei || null,
            sendSkipped: row.sendSkipped || null,
            txHash: row.txHash || null,
            failedReason: row.failedReason || null,
            lastError: row.lastError || null,
            builtAt: date(row.builtAt),
            sentAt: date(row.sentAt),
            confirmedAt: date(row.confirmedAt),
        };
    }

    async adminList(limit = 60) {
        const rows: any[] = await this.settlementModel.find({}).sort({ _id: -1 }).limit(limit).lean();
        return (rows || []).map(row => this.adminView(row));
    }

    /** `pawSettlements` of the public snapshot. No user ids, no per-paw amounts. */
    async publicSummary() {
        const rows: any[] = await this.settlementModel
            .find({ status: { $nin: ['building', 'empty'] } }, { pawCount: 1, amountWei: 1, status: 1 })
            .lean();
        const config = this.pawsConfig();
        const paid = (rows || [])
            .filter(row => row.status === 'confirmed')
            .reduce((sum, row) => sum + BigInt(/^\d+$/.test(String(row.amountWei)) ? row.amountWei : '0'), BigInt(0));
        return {
            count: (rows || []).length,
            totalPaws: (rows || []).reduce((sum, row) => sum + (Number(row.pawCount) || 0), 0),
            confirmedWei: paid.toString(),
            latest: await this.latestSettlement(),
            pawAmountWei: config.amountWei.toString(),
            dailyBudgetWei: config.dailyBudgetWei.toString(),
            sendEnabled: config.sendEnabled,
        };
    }
}
