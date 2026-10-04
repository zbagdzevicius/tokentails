import { NotFoundException } from '@nestjs/common';
import { FACTS } from 'src/impact/facts.generated';
import {
    GOAL_WINDOW_BLOCKS,
    GoalCampaign,
    TRANSFER_TOPIC,
    addressTopic,
    goalCampaign,
    goalView,
    inflowFilter,
    liveSources,
    sumInflows,
    usdcText,
} from './shelter-goal';
import { ShelterGoalController } from './shelter-goal.controller';
import { ShelterGoalService, goalScanEnabled, shareRoutesFor } from './shelter-goal.service';

const SYS = '0x' + 'ff'.repeat(19) + 'fe';
const HELD = '0x' + '11'.repeat(20);
const OWN = '0x' + '22'.repeat(20);
const DONOR = '0x' + '33'.repeat(20);
const FOOD = '0x' + '44'.repeat(20);
const E18 = BigInt(10) ** BigInt(18);

function campaign(over: Partial<GoalCampaign> = {}): GoalCampaign {
    const base = {
        id: 'C-001',
        chainId: 5042,
        goalUsdc: '50000',
        startBlock: 100,
        wallets: [{ wallet: HELD, fromBlock: 100, toBlock: null, holder: 'token-tails' as const }],
        inflowLog: { address: SYS, decimals: 18 },
        ...over,
    };
    return {
        ...base,
        configKey: JSON.stringify({ chainId: base.chainId, inflowLog: base.inflowLog, wallets: base.wallets }),
    };
}

/** Pink Paw rotated: the held wallet closed at block 500, the shelter's own wallet from 501. */
const rotated = () =>
    campaign({
        wallets: [
            { wallet: HELD, fromBlock: 100, toBlock: 500, holder: 'token-tails' },
            { wallet: OWN, fromBlock: 501, toBlock: null, holder: 'shelter' },
        ],
    });

let logIndex = 0;
const transfer = (from: string, to: string, usdc: number, block: number, over: Record<string, unknown> = {}) => ({
    address: SYS,
    topics: [TRANSFER_TOPIC, addressTopic(from), addressTopic(to)],
    data: '0x' + (BigInt(Math.round(usdc * 1e6)) * BigInt(10) ** BigInt(12)).toString(16),
    blockNumber: '0x' + block.toString(16),
    transactionHash: '0x' + (logIndex + 1).toString(16).padStart(64, '0'),
    logIndex: '0x' + (logIndex++).toString(16),
    ...over,
});

describe('goalCampaign (from the facts copy)', () => {
    it('reads C-001: the held wallet from the campaign start, on the Arc system Transfer log', () => {
        const c = goalCampaign('C-001')!;
        const fact = FACTS['C-001'];
        expect(c.chainId).toBe(5042);
        expect(c.goalUsdc).toBe(String(fact.value));
        expect(c.startBlock).toBe(fact.campaign!.fromBlock);
        expect(c.wallets).toEqual([
            {
                wallet: fact.campaign!.wallet!.toLowerCase(),
                fromBlock: fact.campaign!.fromBlock,
                toBlock: null,
                holder: 'token-tails',
            },
        ]);
        expect(c.inflowLog).toEqual({ address: SYS, decimals: 18 });
    });

    it('is null for a fact without a counting campaign', () => {
        expect(goalCampaign('C-004')).toBeNull();
        expect(goalCampaign('nope')).toBeNull();
        expect(goalCampaign('__proto__')).toBeNull();
    });
});

describe('sumInflows: what came in, never what is left', () => {
    it('counts transfers to a campaign wallet inside its range, scaled to 18 decimals', () => {
        const c = campaign();
        const r = sumInflows(c, [transfer(DONOR, HELD, 1.5, 120), transfer(DONOR, HELD, 0.01, 130)], 100, 200);
        expect(r).toEqual({ sum18: (BigInt(151) * E18) / BigInt(100), count: 2 });
        // A 6-decimal token log (the 0x3600 view) scales up.
        const six = campaign({ inflowLog: { address: SYS, decimals: 6 } });
        const log = { ...transfer(DONOR, HELD, 0, 120), data: '0x' + (2_500_000).toString(16) };
        expect(sumInflows(six, [log], 100, 200).sum18).toBe((BigInt(25) * E18) / BigInt(10));
    });

    it('ignores spending: an outgoing transfer is never read, so the count never goes down', () => {
        const c = campaign();
        const r = sumInflows(c, [transfer(DONOR, HELD, 10, 120), transfer(HELD, FOOD, 8, 130)], 100, 200);
        expect(r.sum18).toBe(BigInt(10) * E18);
    });

    it('counts a handover sweep once: a transfer between campaign wallets is skipped', () => {
        const c = rotated();
        const logs = [
            transfer(DONOR, HELD, 3, 200), // a treat to the held wallet
            transfer(HELD, OWN, 3, 501), // the sweep at handover
            transfer(DONOR, OWN, 7, 600), // a gift to the shelter's own wallet
        ];
        expect(sumInflows(c, logs, 100, 700)).toEqual({ sum18: BigInt(10) * E18, count: 2 });
    });

    it('counts a wallet only inside its block range', () => {
        const c = rotated();
        const logs = [
            transfer(DONOR, HELD, 1, 99), // before the campaign
            transfer(DONOR, HELD, 2, 501), // the held wallet after it closed
            transfer(DONOR, OWN, 4, 500), // the new wallet before it opened
        ];
        expect(sumInflows(c, logs, 0, 700).count).toBe(0);
    });

    it('skips other contracts, other events, removed and duplicate logs, and logs outside the window', () => {
        const c = campaign();
        const ok = transfer(DONOR, HELD, 1, 120);
        const logs = [
            ok,
            { ...ok },
            { ...transfer(DONOR, HELD, 1, 121), address: '0x' + '36'.repeat(20) },
            {
                ...transfer(DONOR, HELD, 1, 122),
                topics: ['0x' + '00'.repeat(32), addressTopic(DONOR), addressTopic(HELD)],
            },
            { ...transfer(DONOR, HELD, 1, 123), removed: true },
            { ...transfer(DONOR, HELD, 1, 124), data: 'oops' },
            transfer(DONOR, HELD, 1, 300),
        ];
        expect(sumInflows(c, logs as never, 100, 200).count).toBe(1);
    });
});

describe('the eth_getLogs filter', () => {
    it('asks only for the wallets counted in the window', () => {
        const c = rotated();
        expect(inflowFilter(c, 100, 400)!.topics[2]).toEqual([addressTopic(HELD)]);
        expect(inflowFilter(c, 400, 600)!.topics[2]).toEqual([addressTopic(HELD), addressTopic(OWN)]);
        expect(inflowFilter(c, 0, 50)).toBeNull();
        expect(inflowFilter(c, 100, 200)).toMatchObject({ address: SYS, fromBlock: '0x64', toBlock: '0xc8' });
    });
});

describe('liveSources: only what can reach the open wallet today', () => {
    it('is sponsored treats while Token Tails holds the wallet', () => {
        expect(liveSources(campaign(), { splitOnChain: false })).toEqual(['treats']);
    });
    it('adds shop shares only while a checkout settles through the split', () => {
        expect(liveSources(campaign(), { splitOnChain: true })).toEqual(['treats', 'purchase-shares']);
    });
    it('is gifts, the match, treats and x402 once the shelter holds its own wallet', () => {
        expect(liveSources(rotated(), { splitOnChain: false })).toEqual(['gifts', 'match', 'treats', 'x402']);
    });
    it('reads the split route from the crypto pay settings (off by default)', () => {
        expect(shareRoutesFor(5042, {})).toEqual({ splitOnChain: false });
    });
});

describe('goalView', () => {
    const c = campaign();
    const cursor = {
        configKey: c.configKey,
        lastScannedBlock: 1000,
        raised18: ((BigInt(125) * E18) / BigInt(10)).toString(),
        transfers: 3,
        head: 1100,
        lastSuccessAt: new Date('2026-10-04T10:00:00Z'),
    };
    it('reports the count, how far it reaches and whether it is up to date', () => {
        expect(goalView(c, cursor, { splitOnChain: false })).toMatchObject({
            raised: '12.5',
            scannedTo: 1000,
            head: 1100,
            upToDate: true,
            transfers: 3,
            liveSources: ['treats'],
            updatedAt: '2026-10-04T10:00:00.000Z',
        });
        expect(goalView(c, { ...cursor, head: 5000 }, { splitOnChain: false }).upToDate).toBe(false);
    });
    it('claims nothing from a cursor counted for another wallet set, or before the first window', () => {
        expect(goalView(c, { ...cursor, configKey: 'old' }, { splitOnChain: false })).toMatchObject({
            raised: '0',
            scannedTo: null,
            upToDate: false,
        });
        expect(goalView(c, null, { splitOnChain: false })).toMatchObject({ raised: '0', scannedTo: null });
    });
    it('formats USDC with at most 6 decimals, rounded down', () => {
        expect(usdcText(BigInt(0))).toBe('0');
        expect(usdcText(E18 / BigInt(3))).toBe('0.333333');
        expect(usdcText(BigInt(50000) * E18)).toBe('50000');
    });
});

// ---------- the scan: a fake cursor collection and a fake chain ----------

type Doc = Record<string, any>;
function fakeModel() {
    const docs = new Map<string, Doc>();
    const matches = (doc: Doc | undefined, filter: Doc) =>
        !!doc &&
        Object.entries(filter).every(([k, v]) =>
            v && typeof v === 'object' && '$ne' in v ? doc[k] !== v.$ne : doc[k] === v
        );
    return {
        docs,
        findOne: (filter: Doc) => ({
            lean: async () => (matches(docs.get(filter._id), filter) ? { ...docs.get(filter._id) } : null),
        }),
        updateOne: async (filter: Doc, update: Doc, opts: Doc = {}) => {
            const doc = docs.get(filter._id);
            if (!doc && opts.upsert) {
                docs.set(filter._id, { _id: filter._id, ...(update.$setOnInsert || {}) });
                return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            if (!matches(doc, filter)) return { matchedCount: 0, modifiedCount: 0 };
            Object.assign(doc!, update.$set || {});
            for (const [k, v] of Object.entries(update.$max || {}))
                doc![k] = doc![k] == null || (v as number) > doc![k] ? v : doc![k];
            return { matchedCount: 1, modifiedCount: 1 };
        },
    };
}

/** A chain with these logs and head; `fail` makes eth_getLogs throw from that call on. */
function fakeChain(logs: Doc[], head: number, { fail = Infinity } = {}) {
    const calls: { method: string; params: any[] }[] = [];
    let getLogs = 0;
    const rpc = async (_url: string, method: string, params: any[]) => {
        calls.push({ method, params });
        if (method === 'eth_blockNumber') return '0x' + head.toString(16);
        if (method !== 'eth_getLogs') throw new Error('unexpected ' + method);
        if (++getLogs >= fail) throw Object.assign(new Error('rate limit'), { code: 'RPC_-32005' });
        const f = params[0];
        const from = parseInt(f.fromBlock, 16);
        const to = parseInt(f.toBlock, 16);
        if (to - from + 1 > GOAL_WINDOW_BLOCKS) throw new Error('requested range too large');
        const want = new Set(f.topics[2]);
        return logs.filter(l => {
            const b = parseInt(l.blockNumber, 16);
            return b >= from && b <= to && want.has(l.topics[2]);
        });
    };
    return { rpc, calls };
}

function service(model = fakeModel()) {
    const s = new ShelterGoalService(model as never);
    s.pause = async () => undefined;
    return { s, model };
}

const ENV = { SHELTER_GOAL_RPC_URL: 'http://rpc.test' } as NodeJS.ProcessEnv;

describe('ShelterGoalService scan', () => {
    it('catches up in windows the public RPC accepts and stores the count', async () => {
        const c = campaign();
        const chain = fakeChain(
            [transfer(DONOR, HELD, 1, 150), transfer(DONOR, HELD, 2, 15_000), transfer(DONOR, HELD, 4, 25_050)],
            25_100
        );
        const { s, model } = service();
        s.rpc = chain.rpc;
        expect(await s.advance('C-001', { env: ENV, campaign: c })).toMatchObject({
            state: 'scanned',
            windows: 3,
            scannedTo: 25_100,
        });
        const row = model.docs.get('C-001')!;
        expect([row.raised18, row.transfers, row.lastScannedBlock, row.head]).toEqual([
            (BigInt(7) * E18).toString(),
            3,
            25_100,
            25_100,
        ]);
        // The next run starts after the last block: nothing is counted twice.
        expect(await s.advance('C-001', { env: ENV, campaign: c })).toMatchObject({ windows: 0 });
        expect(model.docs.get('C-001')!.raised18).toBe((BigInt(7) * E18).toString());
    });

    it('keeps counting across a handover and counts the sweep once', async () => {
        const c = rotated();
        const chain = fakeChain(
            [
                transfer(DONOR, HELD, 3, 200),
                transfer(HELD, OWN, 3, 501),
                transfer(DONOR, OWN, 7, 600),
                transfer(OWN, FOOD, 9, 650),
            ],
            700
        );
        const { s, model } = service();
        s.rpc = chain.rpc;
        await s.advance('C-001', { env: ENV, campaign: c });
        expect(model.docs.get('C-001')!.raised18).toBe((BigInt(10) * E18).toString());
    });

    it('starts again from the first block when the counted wallet set changes', async () => {
        const { s, model } = service();
        const logs = [transfer(DONOR, HELD, 3, 200), transfer(DONOR, OWN, 7, 600)];
        s.rpc = fakeChain(logs, 700).rpc;
        await s.advance('C-001', { env: ENV, campaign: campaign() });
        expect(model.docs.get('C-001')!.raised18).toBe((BigInt(3) * E18).toString());
        await s.advance('C-001', { env: ENV, campaign: rotated() });
        expect(model.docs.get('C-001')!).toMatchObject({
            configKey: rotated().configKey,
            raised18: (BigInt(10) * E18).toString(),
            lastScannedBlock: 700,
        });
    });

    it('stops at a window another replica already counted (compare-and-set)', async () => {
        const c = campaign();
        const { s, model } = service();
        const chain = fakeChain([], 30_000);
        s.rpc = async (url, method, params) => {
            const out = await chain.rpc(url, method, params);
            // Another replica moves the cursor while this one reads the chain.
            if (method === 'eth_getLogs') model.docs.get('C-001')!.lastScannedBlock = 99_999;
            return out;
        };
        expect(await s.advance('C-001', { env: ENV, campaign: c })).toMatchObject({ state: 'raced', windows: 0 });
    });

    it('keeps what it counted when the RPC refuses, and records only the error class', async () => {
        const c = campaign();
        const { s, model } = service();
        s.rpc = fakeChain([transfer(DONOR, HELD, 1, 150)], 30_000, { fail: 2 }).rpc;
        expect(await s.advance('C-001', { env: ENV, campaign: c })).toMatchObject({
            state: 'error',
            scannedTo: 100 + GOAL_WINDOW_BLOCKS - 1,
        });
        const row = model.docs.get('C-001')!;
        expect([row.raised18, row.lastError]).toEqual([E18.toString(), 'RPC_-32005']);
    });

    it('shares one run per goal in a process', async () => {
        const { s } = service();
        let heads = 0;
        s.rpc = async (_u, method) => (method === 'eth_blockNumber' ? (heads++, '0x64') : []);
        const c = campaign();
        await Promise.all([
            s.advance('C-001', { env: ENV, campaign: c }),
            s.advance('C-001', { env: ENV, campaign: c }),
        ]);
        expect(heads).toBe(1);
    });

    it('serves the view for C-001 only, and nudges the scan at most once a minute', async () => {
        const { s } = service();
        let nudges = 0;
        s.advance = (async () => {
            nudges++;
            return { state: 'scanned' };
        }) as never;
        const v = await s.view('C-001', 1_000_000, ENV);
        expect(v).toMatchObject({ id: 'C-001', raised: '0', scannedTo: null, liveSources: ['treats'] });
        await s.view('C-001', 1_030_000, ENV);
        await s.view('C-001', 1_070_000, ENV);
        expect(nudges).toBe(2);
        await expect(s.view('C-004', 0, ENV)).rejects.toBeInstanceOf(NotFoundException);
        await s.view('C-001', 2_000_000, { SHELTER_GOAL_SCAN: 'off' } as never);
        expect(nudges).toBe(2);
        expect(goalScanEnabled({})).toBe(true);
        expect(goalScanEnabled({ SHELTER_GOAL_SCAN: 'OFF' } as never)).toBe(false);
    });
});

describe('ShelterGoalController', () => {
    it('refuses ids and slugs of another shape before any read', async () => {
        const goals = { view: jest.fn(async () => ({})) };
        const galleries = { gallery: jest.fn(async () => ({})) };
        const ctl = new ShelterGoalController(goals as never, galleries as never);
        await expect(ctl.goal('../x')).rejects.toBeInstanceOf(NotFoundException);
        await expect(ctl.gallery('Rozine Pedute')).rejects.toBeInstanceOf(NotFoundException);
        await ctl.goal('C-001');
        await ctl.gallery('rozine-pedute');
        expect(goals.view).toHaveBeenCalledWith('C-001');
        expect(galleries.gallery).toHaveBeenCalledWith('rozine-pedute');
    });
});
