import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { readCryptoPayConfig } from 'src/payments/crypto/crypto-pay.config';
import { ILeaseCollection, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { ShelterGoalView } from 'src/shared-contracts/shelter-goal';
import { publicRpcUrl } from '../onchain/shelter-onchain.config';
import {
    GOAL_WINDOW_BLOCKS,
    GoalCampaign,
    GoalCursorState,
    GoalRpcLog,
    ShareRoutes,
    goalCampaign,
    goalView,
    inflowFilter,
    sumInflows,
} from './shelter-goal';
import { ShelterGoalCursor, ShelterGoalCursorDocument } from './shelter-goal.schema';

/** The goals the backend counts (facts with a counting campaign). */
export const SHELTER_GOAL_IDS: readonly string[] = ['C-001'];

export const SHELTER_GOAL_JOB = 'shelter-goal-scan';

/** Windows per run: 40 x 9,999 blocks, about 400,000 blocks (some 55 hours of Arc) a minute. */
export const GOAL_MAX_WINDOWS = 40;

/** Pause between two eth_getLogs calls: the public Arc RPC rate-limits bursts. */
export const GOAL_PAUSE_MS = 300;

/** The cron's lease: a run is at most 40 windows a few hundred ms apart, well under a minute. */
export const GOAL_LEASE_MS = 55_000;

/** A page view nudges the scan at most this often per goal (the cron runs every minute anyway). */
export const GOAL_KICK_MS = 60_000;

/** On unless SHELTER_GOAL_SCAN=off (the count is public chain data; no key is involved). */
export const goalScanEnabled = (env: NodeJS.ProcessEnv = process.env) =>
    (env.SHELTER_GOAL_SCAN || '').trim().toLowerCase() !== 'off';

/** SHELTER_GOAL_RPC_URL, else the chain's keyless public RPC. */
export const goalRpcUrl = (chainId: number, env: NodeJS.ProcessEnv = process.env) =>
    (env.SHELTER_GOAL_RPC_URL || '').trim() || publicRpcUrl(chainId);

export type GoalRpc = (url: string, method: string, params: unknown[]) => Promise<any>;

class GoalRpcError extends Error {
    constructor(public code: string) {
        super(code);
        this.name = 'GoalRpcError';
    }
}

/** A plain JSON-RPC call with a timeout. Errors carry a code only, never the URL. */
export const fetchRpc: GoalRpc = async (url, method, params) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            signal: ctl.signal,
        });
        if (!res.ok) throw new GoalRpcError(`HTTP_${res.status}`);
        const body = (await res.json()) as { result?: unknown; error?: { code?: number } };
        if (body.error) throw new GoalRpcError(`RPC_${body.error.code ?? 'ERROR'}`);
        return body.result;
    } finally {
        clearTimeout(timer);
    }
};

/** Whether a shop share can reach the campaign chain's split today (route `split`, crypto pay on). */
export function shareRoutesFor(chainId: number, env: NodeJS.ProcessEnv = process.env): ShareRoutes {
    try {
        const cfg = readCryptoPayConfig(env);
        return { splitOnChain: !!cfg.enabled && cfg.splits.some(s => s.chainId === chainId) };
    } catch {
        return { splitOnChain: false };
    }
}

export interface GoalScanResult {
    state: 'scanned' | 'unknown' | 'no-rpc' | 'error' | 'raced';
    windows?: number;
    scannedTo?: number | null;
    head?: number;
}

const errorClass = (error: unknown) =>
    String((error as { code?: string })?.code || (error as Error)?.name || 'Error').slice(0, 64);

function toState(row: Partial<ShelterGoalCursor> | null): GoalCursorState | null {
    if (!row || typeof row.configKey !== 'string') return null;
    return {
        configKey: row.configKey,
        lastScannedBlock: typeof row.lastScannedBlock === 'number' ? row.lastScannedBlock : null,
        raised18: typeof row.raised18 === 'string' && /^\d+$/.test(row.raised18) ? row.raised18 : '0',
        transfers: typeof row.transfers === 'number' ? row.transfers : 0,
        head: typeof row.head === 'number' ? row.head : null,
        lastSuccessAt: row.lastSuccessAt ?? null,
    };
}

/**
 * The goal meter's count (GET /shelter/goal/:id): the USDC that came in to the campaign wallets,
 * scanned from the chain in 9,999-block windows, a few hundred milliseconds apart, and kept in
 * `sheltergoalcursors`. The cron advances it every minute; a page view nudges it too.
 */
@Injectable()
export class ShelterGoalService {
    private readonly logger = new Logger(ShelterGoalService.name);
    private inFlight = new Map<string, Promise<GoalScanResult>>();
    private lastKick = new Map<string, number>();
    /** Swappable in tests. */
    rpc: GoalRpc = fetchRpc;
    pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, GOAL_PAUSE_MS));

    constructor(@InjectModel(ShelterGoalCursor.name) private model: Model<ShelterGoalCursorDocument>) {}

    @Cron(CronExpression.EVERY_MINUTE, { name: SHELTER_GOAL_JOB })
    async cron() {
        if (!goalScanEnabled()) return 'disabled';
        // One replica scans per tick (the compare-and-set keeps the count right even without it).
        return runLeased({
            jobRuns: this.model.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection,
            jobName: SHELTER_GOAL_JOB,
            ttlMs: GOAL_LEASE_MS,
            logger: this.logger,
            run: async () => {
                for (const id of SHELTER_GOAL_IDS) await this.advance(id);
            },
        });
    }

    /** The public count. 404 for an id with no counting campaign. */
    async view(id: string, now: number = Date.now(), env: NodeJS.ProcessEnv = process.env): Promise<ShelterGoalView> {
        const campaign = SHELTER_GOAL_IDS.includes(id) ? goalCampaign(id) : null;
        if (!campaign) throw new NotFoundException('No such goal');
        const row = await this.model.findOne({ _id: id }).lean();
        if (goalScanEnabled(env) && now - (this.lastKick.get(id) ?? 0) >= GOAL_KICK_MS) {
            this.lastKick.set(id, now);
            void this.advance(id, { env }).catch(() => undefined);
        }
        return goalView(
            campaign,
            toState(row as Partial<ShelterGoalCursor> | null),
            shareRoutesFor(campaign.chainId, env)
        );
    }

    /** One scan run for `id`; a run already going in this process is shared, never doubled. */
    advance(
        id: string,
        options: { maxWindows?: number; env?: NodeJS.ProcessEnv; campaign?: GoalCampaign | null } = {}
    ): Promise<GoalScanResult> {
        const running = this.inFlight.get(id);
        if (running) return running;
        const run = this.scan(id, options).finally(() => this.inFlight.delete(id));
        this.inFlight.set(id, run);
        return run;
    }

    private async scan(
        id: string,
        {
            maxWindows = GOAL_MAX_WINDOWS,
            env = process.env,
            campaign,
        }: { maxWindows?: number; env?: NodeJS.ProcessEnv; campaign?: GoalCampaign | null }
    ): Promise<GoalScanResult> {
        const c = campaign === undefined ? goalCampaign(id) : campaign;
        if (!c) return { state: 'unknown' };
        const url = goalRpcUrl(c.chainId, env);
        if (!url) return { state: 'no-rpc' };
        const fresh = { lastScannedBlock: null, raised18: '0', transfers: 0, head: null, lastSuccessAt: null };
        await this.model.updateOne(
            { _id: id },
            { $setOnInsert: { configKey: c.configKey, ...fresh } },
            { upsert: true }
        );
        // The counted wallet set changed (a handover): count again from the first block.
        await this.model.updateOne(
            { _id: id, configKey: { $ne: c.configKey } },
            { $set: { configKey: c.configKey, ...fresh } }
        );
        const initial = toState((await this.model.findOne({ _id: id }).lean()) as Partial<ShelterGoalCursor> | null);
        if (!initial) return { state: 'error' };
        let state: GoalCursorState = initial;
        try {
            const head = parseInt(String(await this.rpc(url, 'eth_blockNumber', [])), 16);
            if (!Number.isInteger(head) || head < 0) throw new GoalRpcError('BAD_HEAD');
            let windows = 0;
            while (windows < maxWindows) {
                const last = state.lastScannedBlock;
                const from = last === null ? c.startBlock : last + 1;
                if (from > head) break;
                const to = Math.min(from + GOAL_WINDOW_BLOCKS - 1, head);
                const filter = inflowFilter(c, from, to);
                const logs: GoalRpcLog[] = filter ? (await this.rpc(url, 'eth_getLogs', [filter])) || [] : [];
                const add = sumInflows(c, logs, from, to);
                const next: Omit<GoalCursorState, 'configKey'> = {
                    lastScannedBlock: to,
                    raised18: (BigInt(state.raised18) + add.sum18).toString(),
                    transfers: state.transfers + add.count,
                    head,
                    lastSuccessAt: new Date(),
                };
                // Compare-and-set: another replica that already counted this window wins; this run stops.
                const res = await this.model.updateOne(
                    { _id: id, configKey: c.configKey, lastScannedBlock: last },
                    { $set: next }
                );
                if (!res || !(res as { modifiedCount?: number }).modifiedCount) {
                    return { state: 'raced', windows, scannedTo: last, head };
                }
                state = { ...state, ...next };
                windows++;
                if (to < head && windows < maxWindows) await this.pause();
            }
            await this.model.updateOne(
                { _id: id, configKey: c.configKey },
                { $set: { lastSuccessAt: new Date() }, $max: { head } }
            );
            return { state: 'scanned', windows, scannedTo: state.lastScannedBlock, head };
        } catch (error) {
            const code = errorClass(error);
            this.logger.warn(`goal ${id} scan stopped: ${code}`);
            await this.model.updateOne({ _id: id }, { $set: { lastErrorAt: new Date(), lastError: code } });
            return { state: 'error', scannedTo: state.lastScannedBlock };
        }
    }
}
