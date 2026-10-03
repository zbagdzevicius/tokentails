import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Blessing, BlessingDocument, BlessingStatus, rescueBlessingFilter } from 'src/blessing/blessing.schema';
import { ShelterDonateService } from 'src/shelter/onchain/shelter-donate.service';
import { readShelterConfig } from 'src/shelter/onchain/shelter-onchain.config';
import {
    ShelterDonation,
    ShelterDonationDocument,
    ShelterDonationStatus,
} from 'src/shelter/onchain/shelter-onchain.schema';
import { Shelter, ShelterDocument } from 'src/shelter/shelter.schema';
import { ILeaseCollection, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { uploadPublicObject } from 'src/shared/utils/aws.utils';
import { User, UserDocument } from 'src/user/user.schema';
import {
    IMPACT_CDN_CACHE_CONTROL,
    impactJobsDisabledWarning,
    impactJobsEnabled,
    readCdnConfig,
    readIndexerConfig,
} from './impact.config';
import { cursorIdFor, errorClass } from './impact-indexer.service';
import {
    ChainSource,
    custodyOf,
    hourBucket,
    houseShelterIds,
    IMPACT_SNAPSHOT_VERSION,
    isHouseShelter,
    MongoSource,
    PublicImpact,
    publicShelter,
    PublicShelter,
    totalsBySymbol,
} from './impact-public';
import {
    ImpactChainCursor,
    ImpactChainCursorDocument,
    ImpactSnapshot,
    ImpactSnapshotDocument,
    ShelterPayoutEvent,
    ShelterPayoutEventDocument,
} from './impact.schema';
import { ShelterOutcomeService } from './outcomes.service';
import { PawSettlementService } from './paws.service';
import { ImpactPayoutService } from './payouts.service';
import { PledgeService } from './pledge.service';

export const IMPACT_SNAPSHOT_JOB = 'impact-snapshot';
export const IMPACT_SNAPSHOT_CRON = '7 * * * *';
export const IMPACT_SNAPSHOT_LEASE_MS = 50 * 60 * 1000;
export const IMPACT_COMPACT_JOB = 'impact-compact';
export const IMPACT_COMPACT_CRON = '20 0 * * *';
export const IMPACT_COMPACT_LEASE_MS = 60 * 60 * 1000;
/** Hourly rows are kept this long, then only the last row of each UTC day. */
export const IMPACT_HOURLY_KEEP_MS = 48 * 60 * 60 * 1000;
/** The indexer runs every 5 minutes; a cursor not refreshed for this long means the RPC is failing. */
export const CHAIN_STALE_MS = 30 * 60 * 1000;
export const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Served snapshots are cached per instance this long. */
export const IMPACT_CACHE_MS = 60 * 1000;
/**
 * A live build (no stored snapshot yet, e.g. an instance without IMPACT_JOBS_ENABLED) counts the
 * users collection, so it is cached longer.
 */
export const IMPACT_LIVE_BUILD_CACHE_MS = 10 * 60 * 1000;
export const HISTORY_MAX_DAYS = 90;
/**
 * A stored snapshot older than this (two missed hourly runs) is served flagged: `sources.mongo` and a
 * healthy `sources.chain` become 'error', with the old `generatedAt` and `asOf`, so a stopped job reads
 * as carried-forward figures, never as fresh ones.
 */
export const SNAPSHOT_STALE_MS = 2 * 60 * 60 * 1000;

/** `data` as served at `now`: unchanged while fresh, flagged as carried forward once stale. */
export function servedSnapshot(data: PublicImpact, now: Date): PublicImpact {
    const generated = new Date(data?.generatedAt || 0).getTime();
    if (Number.isFinite(generated) && now.getTime() - generated <= SNAPSHOT_STALE_MS) {
        return data;
    }
    const chain = data?.sources?.chain === 'ok' ? 'error' : data?.sources?.chain || 'error';
    return { ...data, sources: { ...(data?.sources || {}), chain, mongo: 'error' } };
}

/**
 * Registered, live accounts. `isGuest: {$ne: true}` also matches legacy docs without the field (plan
 * F5.1 backfill pending); `deletedAt` leaves out accounts closed through account deletion, which keep
 * `isGuest: false` but are no longer players.
 */
export const REGISTERED_PLAYER_FILTER = Object.freeze({ isGuest: { $ne: true }, deletedAt: { $exists: false } });
const REGISTERED = REGISTERED_PLAYER_FILTER;

export interface ImpactHistoryPoint {
    bucket: string;
    bySymbol: Record<string, string>;
    players: PublicImpact['players'];
    treatsConfirmed: number;
    chain: ChainSource;
}

/**
 * The hourly impact snapshot (plan F7.3): one leased job per hour writes `impactsnapshots` with
 * `_id` = the hour bucket, so any number of replicas make one row. On an RPC failure the money is
 * carried forward with its old `asOf` and `sources.chain = 'error'`; it is never replaced by zeros.
 */
@Injectable()
export class ImpactService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ImpactService.name);
    private latestCache: { expiresAt: number; value: Promise<PublicImpact> } | null = null;

    constructor(
        @InjectModel(ImpactSnapshot.name) private snapshotModel: Model<ImpactSnapshotDocument>,
        @InjectModel(ImpactChainCursor.name) private cursorModel: Model<ImpactChainCursorDocument>,
        @InjectModel(ShelterPayoutEvent.name) private eventModel: Model<ShelterPayoutEventDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        @InjectModel(Shelter.name) private shelterModel: Model<ShelterDocument>,
        @InjectModel(Blessing.name) private blessingModel: Model<BlessingDocument>,
        @InjectModel(ShelterDonation.name) private donationModel: Model<ShelterDonationDocument>,
        private donateService: ShelterDonateService,
        @Optional() private paws?: PawSettlementService,
        @Optional() private payouts?: ImpactPayoutService,
        @Optional() private outcomeService?: ShelterOutcomeService,
        @Optional() private pledge?: PledgeService
    ) {}

    onApplicationBootstrap() {
        const warning = impactJobsDisabledWarning();
        if (warning) {
            this.logger.warn(warning);
        }
    }

    private jobRuns() {
        return this.snapshotModel.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection;
    }

    @Cron(IMPACT_SNAPSHOT_CRON, { name: IMPACT_SNAPSHOT_JOB })
    async snapshotCron() {
        if (!impactJobsEnabled()) {
            return 'disabled';
        }
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: IMPACT_SNAPSHOT_JOB,
            ttlMs: IMPACT_SNAPSHOT_LEASE_MS,
            logger: this.logger,
            run: () => this.snapshotOnce(),
        });
    }

    @Cron(IMPACT_COMPACT_CRON, { name: IMPACT_COMPACT_JOB })
    async compactCron() {
        if (!impactJobsEnabled()) {
            return 'disabled';
        }
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: IMPACT_COMPACT_JOB,
            ttlMs: IMPACT_COMPACT_LEASE_MS,
            logger: this.logger,
            run: () => this.compactOnce(),
        });
    }

    /** Builds and stores this hour's snapshot, then mirrors it to the CDN when configured. */
    async snapshotOnce(now: Date = new Date()): Promise<PublicImpact> {
        const data = await this.build(now);
        await this.snapshotModel.updateOne({ _id: data.bucket }, { $set: { data } }, { upsert: true });
        this.latestCache = null;
        await this.mirror(data);
        return data;
    }

    /** Keeps the last row of each UTC day for rows older than IMPACT_HOURLY_KEEP_MS. */
    async compactOnce(now: Date = new Date()): Promise<{ deleted: number }> {
        const cutoff = hourBucket(new Date(now.getTime() - IMPACT_HOURLY_KEEP_MS));
        const old: { _id: string }[] = await this.snapshotModel.find({ _id: { $lt: cutoff } }, { _id: 1 }).lean();
        const lastOfDay = new Map<string, string>();
        for (const { _id } of old || []) {
            const day = String(_id).slice(0, 10);
            if (!lastOfDay.has(day) || String(_id) > lastOfDay.get(day)!) {
                lastOfDay.set(day, String(_id));
            }
        }
        const keep = new Set(lastOfDay.values());
        const drop = (old || []).map(row => String(row._id)).filter(id => !keep.has(id));
        if (drop.length) {
            await this.snapshotModel.deleteMany({ _id: { $in: drop } });
        }
        return { deleted: drop.length };
    }

    /**
     * Strips an unpublished outcome from every stored snapshot (and the CDN mirror of the latest), so it
     * stops being served at once rather than at the next hourly build. Returns the rows changed.
     */
    async withdrawOutcome(publicId: string): Promise<number> {
        const rows: any[] = await this.snapshotModel
            .find({ 'data.outcomes.items.id': publicId }, { data: 1 })
            .sort({ _id: -1 })
            .lean();
        const latest: any = await this.snapshotModel.findOne({}, { _id: 1 }).sort({ _id: -1 }).lean();
        let changed = 0;
        for (const row of rows || []) {
            const outcomes = row.data?.outcomes;
            if (!outcomes?.items) {
                continue;
            }
            const items = outcomes.items.filter((item: { id: string }) => item.id !== publicId);
            const next = {
                ...outcomes,
                items,
                published: Math.max(0, Number(outcomes.published || 0) - (outcomes.items.length - items.length)),
            };
            await this.snapshotModel.updateOne({ _id: row._id }, { $set: { 'data.outcomes': next } });
            changed += 1;
            if (latest && String(latest._id) === String(row._id)) {
                await this.mirror({ ...row.data, outcomes: next });
            }
        }
        this.latestCache = null;
        return changed;
    }

    /**
     * The hourly snapshot freezes the rail's daily counters, so `treatsLeftToday` and `resetsAt` could
     * be up to an hour old (and `resetsAt` in the past just after midnight). Serving overlays them from
     * the live donate status; if that read fails the snapshot's own rail is served unchanged.
     */
    private async withLiveRail(data: PublicImpact, now: Date): Promise<PublicImpact> {
        const status = await this.donateService.status(now).catch(() => null);
        if (!status) {
            return data;
        }
        return {
            ...data,
            rail: {
                ...data.rail,
                state: status.railState,
                giftsPerDayCap: status.giftsPerDayCap,
                treatsLeftToday: status.treatsLeftToday,
                resetsAt: status.resetsAt,
            },
        };
    }

    /** GET /impact: the latest stored snapshot, or a live build before the first one exists. */
    latest(now: Date = new Date()): Promise<PublicImpact> {
        const cached = this.latestCache;
        if (cached && cached.expiresAt > now.getTime()) {
            return cached.value;
        }
        const entry = { expiresAt: now.getTime() + IMPACT_CACHE_MS, value: null as unknown as Promise<PublicImpact> };
        entry.value = this.snapshotModel
            .findOne({}, { data: 1 })
            .sort({ _id: -1 })
            .lean()
            .then(row => {
                if (row?.data) {
                    const stored = row.data as unknown as PublicImpact;
                    const served = servedSnapshot(stored, now);
                    if (served !== stored) {
                        this.logger.warn(`latest impact snapshot ${row._id} is stale: served as carried forward`);
                    }
                    return this.withLiveRail(served, now);
                }
                entry.expiresAt = now.getTime() + IMPACT_LIVE_BUILD_CACHE_MS;
                return this.build(now);
            });
        const value = entry.value;
        this.latestCache = entry;
        value.catch(() => {
            if (this.latestCache?.value === value) {
                this.latestCache = null;
            }
        });
        return value;
    }

    async history(days: number, now: Date = new Date()): Promise<ImpactHistoryPoint[]> {
        const span = Math.min(Math.max(Math.floor(days) || 30, 1), HISTORY_MAX_DAYS);
        const since = hourBucket(new Date(now.getTime() - span * 24 * 60 * 60 * 1000));
        const rows = await this.snapshotModel
            .find({ _id: { $gte: since } }, { data: 1 })
            .sort({ _id: 1 })
            .limit(span * 24)
            .lean();
        return (rows || []).map(row => {
            const data = row.data as unknown as PublicImpact;
            return {
                bucket: String(row._id),
                bySymbol: data?.money?.bySymbol || {},
                players: data?.players || { registeredAllTime: null, active30d: null },
                treatsConfirmed: data?.treats?.confirmedCount || 0,
                chain: data?.sources?.chain || 'error',
            };
        });
    }

    async build(now: Date = new Date()): Promise<PublicImpact> {
        const previous = (
            await this.snapshotModel
                .findOne({}, { data: 1 })
                .sort({ _id: -1 })
                .lean()
                .catch(() => null)
        )?.data as unknown as PublicImpact | undefined;
        const config = readShelterConfig();
        const indexer = readIndexerConfig();

        // Mongo-side figures. A failure keeps the previous values rather than showing zeros.
        let mongo: MongoSource = 'ok';
        let players: PublicImpact['players'] = previous?.players || { registeredAllTime: null, active30d: null };
        let shelters: PublicImpact['shelters'] = previous?.shelters || {
            total: 0,
            partners: 0,
            countries: [],
            items: [],
        };
        let rescueCats: PublicImpact['rescueCats'] = previous?.rescueCats || { total: 0, adopted: 0 };
        let treats: PublicImpact['treats'] = previous?.treats || {
            confirmedCount: 0,
            onTheirWayCount: 0,
            totalConfirmedWei: '0',
        };
        try {
            [players, shelters, rescueCats, treats] = await Promise.all([
                this.players(now),
                this.shelters(),
                this.rescueCats(),
                this.treats(now),
            ]);
        } catch (error) {
            mongo = 'error';
            this.logger.error(`impact snapshot: mongo figures failed: ${errorClass(error)}`);
        }

        const status = await this.donateService.status(now).catch(() => null);
        const rail: PublicImpact['rail'] = status
            ? {
                  state: status.railState,
                  chainId: status.chainId,
                  splitAddress: status.splitAddress,
                  amountWei: status.amountWei,
                  dailyBudgetWei: status.dailyBudgetWei,
                  giftsPerDayCap: status.giftsPerDayCap,
                  treatsLeftToday: status.treatsLeftToday,
                  resetsAt: status.resetsAt,
              }
            : previous?.rail || {
                  state: config.splitAddress ? 'paused' : 'not-deployed',
                  chainId: config.chainId,
                  splitAddress: config.splitAddress,
                  amountWei: config.amountWei.toString(),
                  dailyBudgetWei: config.dailyBudgetWei.toString(),
                  giftsPerDayCap: 0,
                  treatsLeftToday: 0,
                  resetsAt: new Date(
                      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
                  ).toISOString(),
              };

        const { outcomes, pledges, pawSettlements, attestations } = await this.ledger(now, previous);

        const { money, chain, chainSource, chainAsOf } = await this.money(
            now,
            config,
            indexer.fromBlock,
            shelters.items,
            previous
        );

        return {
            _v: IMPACT_SNAPSHOT_VERSION,
            bucket: hourBucket(now),
            generatedAt: now.toISOString(),
            asOf: { chain: chainAsOf, mongo: mongo === 'ok' ? now.toISOString() : previous?.asOf?.mongo || null },
            sources: { chain: chainSource, mongo },
            money,
            chain,
            players,
            heists: { verified: null },
            shelters,
            rescueCats,
            outcomes,
            rail,
            treats,
            pledges,
            pawSettlements,
            attestations,
            rescueGoals: { open: 0, items: [] },
        };
    }

    /**
     * Outcomes, pledge table, paw settlements and attested payouts (G4, G11). Each part that fails keeps
     * its previous value (never zeros), like the Mongo figures above.
     */
    private async ledger(now: Date, previous: PublicImpact | undefined) {
        const keep = async <T>(name: string, read: (() => Promise<T>) | null, fallback: T): Promise<T> => {
            if (!read) {
                return fallback;
            }
            try {
                return await read();
            } catch (error) {
                this.logger.error(`impact snapshot: ${name} failed: ${errorClass(error)}`);
                return fallback;
            }
        };
        const emptyPaws: PublicImpact['pawSettlements'] = {
            count: 0,
            totalPaws: 0,
            confirmedWei: '0',
            latest: null,
            pawAmountWei: '0',
            dailyBudgetWei: '0',
            sendEnabled: false,
        };
        const [outcomes, pledges, pawSettlements, bySymbol, items] = await Promise.all([
            keep(
                'outcomes',
                this.outcomeService ? () => this.outcomeService!.publicOutcomes(now) : null,
                previous?.outcomes || { published: 0, items: [] }
            ),
            keep(
                'pledges',
                this.pledge ? () => this.pledge!.table(now) : null,
                previous?.pledges?.bps !== undefined
                    ? previous.pledges
                    : { status: 'not-started' as const, bps: null, effectiveAt: null, rows: [] }
            ),
            keep(
                'paw settlements',
                this.paws ? () => this.paws!.publicSummary() : null,
                previous?.pawSettlements?.totalPaws !== undefined ? previous.pawSettlements : emptyPaws
            ),
            keep(
                'payout totals',
                this.payouts ? () => this.payouts!.totalsByTier() : null,
                previous?.attestations?.bySymbol || { 'shelter-confirmed': {}, 'shelter-signed': {} }
            ),
            keep(
                'payouts',
                this.payouts ? () => this.payouts!.publicPayouts() : null,
                previous?.attestations?.items || []
            ),
        ]);
        return { outcomes, pledges, pawSettlements, attestations: { bySymbol, items } };
    }

    private async money(
        now: Date,
        config: ReturnType<typeof readShelterConfig>,
        fromBlock: number | null,
        shelters: PublicShelter[],
        previous: PublicImpact | undefined
    ) {
        const empty: PublicImpact['money'] = {
            custody: 'held-by-token-tails',
            bySymbol: {},
            byBucket: {},
            eventCount: 0,
            lastTxHash: null,
        };
        const chain: PublicImpact['chain'] = {
            chainId: config.chainId,
            contract: config.splitAddress ? config.splitAddress.toLowerCase() : null,
            fromBlock,
            lastScannedBlock: null,
        };
        if (!config.splitAddress || !config.rpcUrl) {
            return { money: empty, chain, chainSource: 'not-deployed' as ChainSource, chainAsOf: null };
        }
        const contract = config.splitAddress.toLowerCase();
        const cursor: any = await this.cursorModel
            .findOne({ _id: cursorIdFor(config.chainId, contract) })
            .lean()
            .catch(() => null);
        if (!cursor || fromBlock === null) {
            return { money: empty, chain, chainSource: 'idle' as ChainSource, chainAsOf: null };
        }
        chain.lastScannedBlock = typeof cursor.lastScannedBlock === 'number' ? cursor.lastScannedBlock : null;
        const lastSuccess = cursor.lastSuccessAt ? new Date(cursor.lastSuccessAt) : null;
        const lastError = cursor.lastErrorAt ? new Date(cursor.lastErrorAt) : null;
        const healthy =
            !!lastSuccess &&
            now.getTime() - lastSuccess.getTime() <= CHAIN_STALE_MS &&
            (!lastError || lastError.getTime() <= lastSuccess.getTime());

        if (!healthy && previous?.money && previous.sources?.chain !== 'not-deployed') {
            // Carry forward: the previous figures with the previous date, flagged as an error.
            return {
                money: previous.money,
                chain,
                chainSource: 'error' as ChainSource,
                chainAsOf: previous.asOf?.chain || null,
            };
        }
        const byBucket = (cursor.totals || {}) as Record<string, Record<string, string>>;
        const recipients: string[] = await this.eventModel
            .distinct('shelter', { chainId: config.chainId, contract })
            .catch(() => []);
        const money: PublicImpact['money'] = {
            custody: custodyOf(recipients as string[], shelters),
            bySymbol: totalsBySymbol(byBucket),
            byBucket,
            eventCount: cursor.eventCount || 0,
            lastTxHash: cursor.lastTxHash || null,
        };
        return {
            money,
            chain,
            chainSource: (healthy ? 'ok' : 'error') as ChainSource,
            chainAsOf: lastSuccess ? lastSuccess.toISOString() : null,
        };
    }

    // Counts use the native collection, so the filter paths reach Mongo exactly as written.
    // `lastPlayedAt` is declared on the User schema but nothing writes it yet (task 3b sets it in
    // /live; today only a guest merge copies it). Until one document carries it, `active30d` is null
    // ("not measured"), never a 0 that reads as "nobody played".
    private async players(now: Date): Promise<PublicImpact['players']> {
        const users = this.userModel.collection;
        const [registeredAllTime, measured] = await Promise.all([
            users.countDocuments(REGISTERED),
            users.findOne({ ...REGISTERED, lastPlayedAt: { $exists: true } }, { projection: { _id: 1 } }),
        ]);
        const active30d = measured
            ? await users.countDocuments({
                  ...REGISTERED,
                  lastPlayedAt: { $gte: new Date(now.getTime() - ACTIVE_WINDOW_MS) },
              })
            : null;
        return { registeredAllTime, active30d };
    }

    private async shelters(): Promise<PublicImpact['shelters']> {
        const rows: any[] = await this.shelterModel
            .find(
                {},
                { slug: 1, name: 1, countryCode: 1, partnerStatus: 1, role: 1, handoverStatus: 1, publicWallet: 1 }
            )
            .sort({ name: 1 })
            .lean();
        // House zones (Token Tails' own) are not shelters: left out of the total, the list and the
        // partners. Partner means `active` (2.13 #25).
        const items = (rows || []).filter(row => !isHouseShelter(row)).map(publicShelter);
        const partners = items.filter(s => s.partnerStatus === 'active');
        const countries = [...new Set(partners.map(s => s.countryCode).filter((c): c is string => !!c))].sort();
        return { total: items.length, partners: partners.length, countries, items };
    }

    /** Rescue blessings outside the house zones, so this figure and `shelters` agree (F7.8). */
    private async rescueCats(): Promise<PublicImpact['rescueCats']> {
        const rescue = rescueBlessingFilter(await houseShelterIds(this.shelterModel));
        const [total, adopted] = await Promise.all([
            this.blessingModel.countDocuments(rescue),
            this.blessingModel.countDocuments({ ...rescue, status: BlessingStatus.ADOPTED }),
        ]);
        return { total, adopted };
    }

    private async treats(now: Date): Promise<PublicImpact['treats']> {
        const [confirmedCount, onTheirWayCount, totalConfirmedWei] = await Promise.all([
            this.donationModel.countDocuments({ status: ShelterDonationStatus.CONFIRMED }),
            this.donationModel.countDocuments({ status: ShelterDonationStatus.SENT }),
            this.donateService.communityTotalConfirmedWei(now),
        ]);
        return { confirmedCount, onTheirWayCount, totalConfirmedWei };
    }

    /** impact/impact.json on the Spaces bucket, only when IMPACT_CDN_ENABLED; never under Jest. */
    private async mirror(data: PublicImpact) {
        const cdn = readCdnConfig();
        if (!cdn.enabled) {
            return;
        }
        try {
            await uploadPublicObject({
                key: cdn.objectKey,
                body: JSON.stringify(data),
                contentType: 'application/json',
                cacheControl: IMPACT_CDN_CACHE_CONTROL,
                bucket: cdn.bucket,
            });
        } catch (error) {
            // The stored snapshot is the source of truth; the mirror retries next hour.
            this.logger.error(`impact CDN mirror failed: ${errorClass(error)}`);
        }
    }
}
