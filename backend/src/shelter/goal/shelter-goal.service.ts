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
    GoalChainLeg,
    GoalCursorState,
    GoalRpcLog,
    InflowSum,
    ShareRoutes,
    goalCampaign,
    goalChainLegs,
    goalView,
    inflowFilter,
    legCursorId,
    legInflowFilter,
    sumInflows,
    sumLegInflows,
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

/** A chain leg's RPC: SHELTER_GOAL_RPC_URL_<chainId>, else the operator's public RPC from the chain table. */
export const legRpcUrl = (leg: GoalChainLeg, env: NodeJS.ProcessEnv = process.env) =>
    (env[`SHELTER_GOAL_RPC_URL_${leg.chainId}`] || '').trim() || leg.publicRpc || publicRpcUrl(leg.chainId);

/**
 * A chain leg's first block: SHELTER_GOAL_FROM_BLOCK_<chainId> when set, else found once on the chain
 * (the first block at or after the goal's start date, 00:00 UTC) and kept in the leg's cursor.
 */
export const legFromBlockEnv = (chainId: number, env: NodeJS.ProcessEnv = process.env): number | null => {
    const raw = (env[`SHELTER_GOAL_FROM_BLOCK_${chainId}`] || '').trim();
    const n = Number(raw);
    return raw && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/** Which chains to count besides the campaign chain. SHELTER_GOAL_CHAINS=off counts the campaign chain only. */
export const goalLegsEnabled = (env: NodeJS.ProcessEnv = process.env) =>
    (env.SHELTER_GOAL_CHAINS || '').trim().toLowerCase() !== 'off';

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
    /** Each other chain's run, keyed by chain id (absent when the goal counts one chain). */
    legs?: Record<number, GoalScanResult>;
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

/** What one cursor counts: the campaign chain (its inflow log) or a chain leg (its stablecoins). */
interface ScanSpec {
    cursorId: string;
    label: string;
    configKey: string;
    url: string | null;
    window: number;
    /** The first block counted, or null when it cannot be known yet. */
    startBlock: (state: GoalCursorRow) => Promise<number | null>;
    filter: (from: number, to: number) => Record<string, unknown> | null;
    sum: (logs: GoalRpcLog[], from: number, to: number) => InflowSum;
}

type GoalCursorRow = GoalCursorState & { startBlock: number | null };

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
        const legs = goalLegsEnabled(env) ? goalChainLegs(campaign) : [];
        const [row, ...legRows] = await Promise.all([
            this.model.findOne({ _id: id }).lean(),
            ...legs.map(leg => this.model.findOne({ _id: legCursorId(id, leg.chainId) }).lean()),
        ]);
        if (goalScanEnabled(env) && now - (this.lastKick.get(id) ?? 0) >= GOAL_KICK_MS) {
            this.lastKick.set(id, now);
            void this.advance(id, { env }).catch(() => undefined);
        }
        return goalView(
            campaign,
            toState(row as Partial<ShelterGoalCursor> | null),
            shareRoutesFor(campaign.chainId, env),
            legs.map((leg, i) => ({ leg, cursor: toState(legRows[i] as Partial<ShelterGoalCursor> | null) }))
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

    /**
     * One run: the campaign chain and every chain leg, side by side (each has its own RPC and cursor,
     * so a slow or broken chain never holds the others back). The result is the campaign chain's;
     * `legs` has each leg's, keyed by chain id.
     */
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
        const legs = goalLegsEnabled(env) ? goalChainLegs(c) : [];
        const main: ScanSpec = {
            cursorId: id,
            label: id,
            configKey: c.configKey,
            url: goalRpcUrl(c.chainId, env),
            window: GOAL_WINDOW_BLOCKS,
            startBlock: async () => c.startBlock,
            filter: (from, to) => inflowFilter(c, from, to),
            sum: (logs, from, to) => sumInflows(c, logs, from, to),
        };
        const legSpecs: ScanSpec[] = legs.map(leg => {
            const url = legRpcUrl(leg, env);
            return {
                cursorId: legCursorId(id, leg.chainId),
                label: legCursorId(id, leg.chainId),
                configKey: leg.configKey,
                url,
                window: leg.window,
                startBlock: async row =>
                    legFromBlockEnv(leg.chainId, env) ??
                    row.startBlock ??
                    (url ? this.firstBlockAtOrAfter(url, leg.startTime) : null),
                filter: (from, to) => legInflowFilter(leg, from, to),
                sum: (logs, from, to) => sumLegInflows(leg, logs, from, to),
            };
        });
        const [result, ...legResults] = await Promise.all([
            this.scanOne(main, maxWindows),
            ...legSpecs.map(spec => this.scanOne(spec, maxWindows).catch(() => ({ state: 'error' } as GoalScanResult))),
        ]);
        return legSpecs.length
            ? { ...result, legs: Object.fromEntries(legs.map((leg, i) => [leg.chainId, legResults[i]])) }
            : result;
    }

    /**
     * The first block whose timestamp is at or after `time` (unix seconds), by binary search over
     * eth_getBlockByNumber (about 25 reads, once per chain: the answer is kept in the cursor).
     */
    async firstBlockAtOrAfter(url: string, time: number): Promise<number> {
        const head = parseInt(String(await this.rpc(url, 'eth_blockNumber', [])), 16);
        if (!Number.isInteger(head) || head < 0) throw new GoalRpcError('BAD_HEAD');
        const stamp = async (n: number) => {
            const block = await this.rpc(url, 'eth_getBlockByNumber', ['0x' + n.toString(16), false]);
            const t = parseInt(String(block?.timestamp), 16);
            if (!Number.isFinite(t)) throw new GoalRpcError('BAD_BLOCK');
            return t;
        };
        if ((await stamp(head)) < time) return head + 1;
        let lo = 0;
        let hi = head;
        while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if ((await stamp(mid)) >= time) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }

    private async scanOne(spec: ScanSpec, maxWindows: number): Promise<GoalScanResult> {
        const { cursorId } = spec;
        if (!spec.url) return { state: 'no-rpc' };
        const url = spec.url;
        const fresh = {
            lastScannedBlock: null,
            raised18: '0',
            transfers: 0,
            head: null,
            lastSuccessAt: null,
            startBlock: null,
        };
        await this.model.updateOne(
            { _id: cursorId },
            { $setOnInsert: { configKey: spec.configKey, ...fresh } },
            { upsert: true }
        );
        // The counted set changed (a handover, a new coin): count again from the first block.
        await this.model.updateOne(
            { _id: cursorId, configKey: { $ne: spec.configKey } },
            { $set: { configKey: spec.configKey, ...fresh } }
        );
        const row = (await this.model.findOne({ _id: cursorId }).lean()) as Partial<ShelterGoalCursor> | null;
        const initial = toState(row);
        if (!initial) return { state: 'error' };
        let state: GoalCursorRow = {
            ...initial,
            startBlock: typeof row?.startBlock === 'number' ? row.startBlock : null,
        };
        try {
            const start = await spec.startBlock(state);
            if (start === null) throw new GoalRpcError('NO_START_BLOCK');
            if (state.startBlock !== start) {
                await this.model.updateOne(
                    { _id: cursorId, configKey: spec.configKey },
                    { $set: { startBlock: start } }
                );
                state = { ...state, startBlock: start };
            }
            const head = parseInt(String(await this.rpc(url, 'eth_blockNumber', [])), 16);
            if (!Number.isInteger(head) || head < 0) throw new GoalRpcError('BAD_HEAD');
            let windows = 0;
            while (windows < maxWindows) {
                const last = state.lastScannedBlock;
                const from = last === null ? start : last + 1;
                if (from > head) break;
                const to = Math.min(from + spec.window - 1, head);
                const filter = spec.filter(from, to);
                const logs: GoalRpcLog[] = filter ? (await this.rpc(url, 'eth_getLogs', [filter])) || [] : [];
                const add = spec.sum(logs, from, to);
                const next: Omit<GoalCursorState, 'configKey'> = {
                    lastScannedBlock: to,
                    raised18: (BigInt(state.raised18) + add.sum18).toString(),
                    transfers: state.transfers + add.count,
                    head,
                    lastSuccessAt: new Date(),
                };
                // Compare-and-set: another replica that already counted this window wins; this run stops.
                const res = await this.model.updateOne(
                    { _id: cursorId, configKey: spec.configKey, lastScannedBlock: last },
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
                { _id: cursorId, configKey: spec.configKey },
                { $set: { lastSuccessAt: new Date() }, $max: { head } }
            );
            return { state: 'scanned', windows, scannedTo: state.lastScannedBlock, head };
        } catch (error) {
            const code = errorClass(error);
            this.logger.warn(`goal ${spec.label} scan stopped: ${code}`);
            await this.model.updateOne({ _id: cursorId }, { $set: { lastErrorAt: new Date(), lastError: code } });
            return { state: 'error', scannedTo: state.lastScannedBlock };
        }
    }
}
