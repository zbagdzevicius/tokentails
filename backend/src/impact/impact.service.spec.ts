import { Types } from 'mongoose';
import { SPLIT, withShelterEnv } from 'src/shelter/onchain/shelter-onchain.fakes-spec';
import { uploadPublicObject } from 'src/shared/utils/aws.utils';
import * as impactConfig from './impact.config';
import { readCdnConfig } from './impact.config';
import { cursorIdFor } from './impact-indexer.service';
import { hourBucket, PublicImpact } from './impact-public';
import { IMPACT_SNAPSHOT_JOB, servedSnapshot } from './impact.service';
import { impactFixture, NOW } from './impact.fixture-spec';

// The crons are opt-in per instance (IMPACT_JOBS_ENABLED); these specs exercise them switched on.
const JOBS_ENV = process.env.IMPACT_JOBS_ENABLED;
beforeEach(() => {
    process.env.IMPACT_JOBS_ENABLED = 'true';
});
afterAll(() => {
    if (JOBS_ENV === undefined) delete process.env.IMPACT_JOBS_ENABLED;
    else process.env.IMPACT_JOBS_ENABLED = JOBS_ENV;
});

jest.mock('src/shared/utils/aws.utils', () => ({ uploadPublicObject: jest.fn() }));

const DAY_MS = 24 * 60 * 60 * 1000;
const CURSOR_ID = cursorIdFor(5042, SPLIT);

const deployedEnv = (fromBlock = '1000') => {
    withShelterEnv({ SHELTER_SPLIT_ADDRESS: SPLIT });
    process.env.SHELTER_SPLIT_FROM_BLOCK = fromBlock;
};

beforeEach(() => {
    withShelterEnv({});
    delete process.env.SHELTER_SPLIT_FROM_BLOCK;
    jest.clearAllMocks();
});
afterAll(() => {
    withShelterEnv({});
    delete process.env.SHELTER_SPLIT_FROM_BLOCK;
});

describe('ImpactService snapshot (plan F7.3)', () => {
    it('reports the not-deployed rail state today, with Mongo figures and no money', async () => {
        const { service } = impactFixture();
        const data = await service.build(NOW);

        expect(data).toMatchObject({
            _v: 1,
            bucket: '2026-10-02T12:00Z',
            sources: { chain: 'not-deployed', mongo: 'ok' },
            asOf: { chain: null, mongo: NOW.toISOString() },
            money: { bySymbol: {}, byBucket: {}, eventCount: 0, custody: 'held-by-token-tails' },
            rail: { state: 'not-deployed', splitAddress: null, treatsLeftToday: 0 },
            // Guests excluded; the legacy doc without isGuest counts as registered.
            players: { registeredAllTime: 3, active30d: 2 },
            heists: { verified: null },
            // House zones are not shelters; countries of active partners only.
            shelters: { total: 3, partners: 1, countries: ['LT'] },
            // Rescue blessings only: portraits (kinded or legacy, by the portrait shelter) are excluded;
            // legacy shelter cats count as the backfill will classify them.
            rescueCats: { total: 3, adopted: 2 },
            treats: { confirmedCount: 1, onTheirWayCount: 1, totalConfirmedWei: '10000000000000000' },
            // The fixture's ledger rows (task 4f): one published outcome, the pledge month, one settlement.
            outcomes: {
                published: 1,
                items: [expect.objectContaining({ id: 'o-0000000000b1', tier: 'shelter-confirmed' })],
            },
            pledges: { status: 'active', bps: 500, rows: [expect.objectContaining({ month: '2026-09' })] },
            pawSettlements: { count: 1, totalPaws: 1, latest: expect.objectContaining({ day: '2026-10-01' }) },
            attestations: { items: [expect.objectContaining({ id: 'p-0000000000a1', tier: 'shelter-confirmed' })] },
            rescueGoals: { open: 0, items: [] },
        });
    });

    it('reports active30d as null, not 0, while nothing writes lastPlayedAt', async () => {
        const { service, users } = impactFixture();
        users.rows.forEach(row => delete row.lastPlayedAt);
        const data = await service.build(NOW);
        expect(data.players).toEqual({ registeredAllTime: 3, active30d: null });
    });

    it('leaves deleted accounts out of registeredAllTime and active30d', async () => {
        const { service, users } = impactFixture();
        users.rows.push({
            _id: new Types.ObjectId(),
            isGuest: false,
            deletedAt: new Date(NOW.getTime() - DAY_MS),
            lastPlayedAt: new Date(NOW.getTime() - DAY_MS),
        });
        const data = await service.build(NOW);
        expect(data.players).toEqual({ registeredAllTime: 3, active30d: 2 });
    });

    it('leaves house zones out of the shelter total and list, by role or by slug before the backfill', async () => {
        const { service, shelters } = impactFixture();
        shelters.rows.push({ _id: new Types.ObjectId(), name: 'Home', slug: 'home', partnerStatus: 'active' });
        const data = await service.build(NOW);
        expect(data.shelters.total).toBe(3);
        expect(data.shelters.partners).toBe(1);
        expect(data.shelters.items.map(s => s.slug).sort()).toEqual(['legacy', 'past', 'rozine-pedute']);
    });

    it('serves chain totals from a healthy cursor', async () => {
        deployedEnv();
        const { service, cursors, events } = impactFixture();
        cursors.rows.push({
            _id: CURSOR_ID,
            chainId: 5042,
            contract: SPLIT,
            lastScannedBlock: 2000,
            totals: { page: { USDC: '10' }, direct: { USDC: '5' } },
            eventCount: 2,
            lastTxHash: '0xabc',
            lastSuccessAt: new Date(NOW.getTime() - 60000),
        });
        events.rows.push({
            _id: new Types.ObjectId(),
            chainId: 5042,
            contract: SPLIT,
            shelter: '0x2222222222222222222222222222222222222222',
        });

        const data = await service.build(NOW);
        expect(data.sources.chain).toBe('ok');
        expect(data.money).toEqual({
            custody: 'held-by-token-tails',
            bySymbol: { USDC: '15' },
            byBucket: { page: { USDC: '10' }, direct: { USDC: '5' } },
            eventCount: 2,
            lastTxHash: '0xabc',
        });
        expect(data.asOf.chain).toBe(new Date(NOW.getTime() - 60000).toISOString());
        expect(data.chain).toEqual({ chainId: 5042, contract: SPLIT, fromBlock: 1000, lastScannedBlock: 2000 });
        expect(data.rail.state).toBe('paused');
    });

    it('carries forward on RPC failure with the old asOf and sources.chain error, never zeros', async () => {
        deployedEnv();
        const { service, cursors, snapshots } = impactFixture();
        const oldAsOf = '2026-10-02T10:00:00.000Z';
        const previous = await service.build(NOW);
        previous.bucket = '2026-10-02T11:00Z';
        previous.sources = { chain: 'ok', mongo: 'ok' };
        previous.asOf = { chain: oldAsOf, mongo: oldAsOf };
        previous.money = {
            ...previous.money,
            bySymbol: { USDC: '42' },
            byBucket: { page: { USDC: '42' } },
            eventCount: 4,
        };
        snapshots.rows.push({ _id: previous.bucket, data: previous });
        // The indexer last succeeded two hours ago and has failed since, and its totals look empty.
        cursors.rows.push({
            _id: CURSOR_ID,
            chainId: 5042,
            contract: SPLIT,
            totals: {},
            lastSuccessAt: new Date(oldAsOf),
            lastErrorAt: new Date(NOW.getTime() - 60000),
        });

        const data = await service.build(NOW);
        expect(data.sources.chain).toBe('error');
        expect(data.asOf.chain).toBe(oldAsOf);
        expect(data.money.bySymbol).toEqual({ USDC: '42' });
        expect(data.money.eventCount).toBe(4);
    });

    it('writes one row per hour, whoever runs it; two instances run the job once per tick', async () => {
        const { service, make, snapshots, jobRuns } = impactFixture();
        await service.snapshotOnce(NOW);
        await service.snapshotOnce(new Date(NOW.getTime() + 60000));
        expect(snapshots.rows.map(r => r._id)).toEqual(['2026-10-02T12:00Z']);

        const other = make();
        const a = jest.spyOn(service, 'snapshotOnce').mockResolvedValue({} as PublicImpact);
        const b = jest.spyOn(other, 'snapshotOnce').mockResolvedValue({} as PublicImpact);
        const outcomes = await Promise.all([service.snapshotCron(), other.snapshotCron()]);
        expect(outcomes.sort()).toEqual(['lease-held', 'ran']);
        expect(a.mock.calls.length + b.mock.calls.length).toBe(1);
        expect(jobRuns.rows.find(r => r._id === IMPACT_SNAPSHOT_JOB)).toMatchObject({ status: 'done' });
    });

    it('serves the latest row, or a live build before the first snapshot', async () => {
        const { service, snapshots } = impactFixture();
        const live = await service.latest(NOW);
        expect(live.bucket).toBe('2026-10-02T12:00Z');
        expect(snapshots.rows).toHaveLength(0);

        snapshots.rows.push({ _id: '2026-10-02T13:00Z', data: { ...live, bucket: '2026-10-02T13:00Z' } });
        // A live build is cached for 10 minutes (it counts users); a stored row replaces it after that.
        expect((await service.latest(new Date(NOW.getTime() + 2 * 60000))).bucket).toBe('2026-10-02T12:00Z');
        expect((await service.latest(new Date(NOW.getTime() + 11 * 60000))).bucket).toBe('2026-10-02T13:00Z');
        // A stored row is cached for one minute only.
        snapshots.rows.push({ _id: '2026-10-02T14:00Z', data: { ...live, bucket: '2026-10-02T14:00Z' } });
        expect((await service.latest(new Date(NOW.getTime() + 13 * 60000))).bucket).toBe('2026-10-02T14:00Z');
    });

    it('serves the rail daily counters live, not frozen at the snapshot hour', async () => {
        const { service, snapshots, donate } = impactFixture();
        const data = await service.build(NOW);
        const frozen = { ...data.rail, treatsLeftToday: 7, resetsAt: '2026-10-02T00:00:00.000Z' };
        snapshots.rows.push({ _id: data.bucket, data: { ...data, rail: frozen } });
        const live = await donate.status(NOW);

        const served = await service.latest(NOW);
        expect(served.rail).toMatchObject({
            treatsLeftToday: live.treatsLeftToday,
            resetsAt: live.resetsAt,
            state: live.railState,
        });
        expect(served.rail.resetsAt > NOW.toISOString()).toBe(true);
        // The stored row itself is not rewritten.
        expect(snapshots.rows[0].data.rail.treatsLeftToday).toBe(7);
    });

    it('serves the snapshot rail unchanged when the live donate status read fails', async () => {
        const { service, snapshots, donate } = impactFixture();
        const data = await service.build(NOW);
        snapshots.rows.push({ _id: data.bucket, data: { ...data, rail: { ...data.rail, treatsLeftToday: 7 } } });
        jest.spyOn(donate, 'status').mockRejectedValue(new Error('mongo down'));
        expect((await service.latest(NOW)).rail.treatsLeftToday).toBe(7);
    });

    it('serves a snapshot older than two hours flagged as carried forward, with its old timestamps', async () => {
        deployedEnv();
        const { service, snapshots } = impactFixture();
        const data = await service.build(NOW);
        const stored = { ...data, sources: { chain: 'ok', mongo: 'ok' } as PublicImpact['sources'] };
        snapshots.rows.push({ _id: data.bucket, data: stored });

        const fresh = await service.latest(new Date(NOW.getTime() + 60 * 60000));
        expect(fresh.sources).toEqual({ chain: 'ok', mongo: 'ok' });

        const later = new Date(NOW.getTime() + 3 * 60 * 60000);
        const stale = await service.latest(later);
        expect(stale.sources).toEqual({ chain: 'error', mongo: 'error' });
        expect(stale.generatedAt).toBe(NOW.toISOString());
        expect(stale.asOf).toEqual(stored.asOf);
        expect(stale.players).toEqual(stored.players);
        // The stored row is untouched.
        expect(snapshots.rows[0].data.sources).toEqual({ chain: 'ok', mongo: 'ok' });
        // `not-deployed` stays what it is.
        expect(servedSnapshot({ ...data, sources: { chain: 'not-deployed', mongo: 'ok' } }, later).sources).toEqual({
            chain: 'not-deployed',
            mongo: 'error',
        });
    });

    it('leaves house-zone blessings out of the rescued cats, by role or by slug before the backfill', async () => {
        const { service, shelters, blessings } = impactFixture();
        const house = shelters.rows.find(r => r.role === 'house')!;
        const bySlug = { _id: new Types.ObjectId(), name: 'Event', slug: 'token-tails-2' };
        shelters.rows.push(bySlug);
        blessings.rows.push(
            { _id: new Types.ObjectId(), kind: 'rescue', status: 'ADOPTED', shelter: house._id },
            { _id: new Types.ObjectId(), status: 'WAITING', shelter: bySlug._id }
        );
        const data = await service.build(NOW);
        expect(data.rescueCats).toEqual({ total: 3, adopted: 2 });
    });

    it('compacts rows older than two days to the last row of each UTC day', async () => {
        const { service, snapshots } = impactFixture();
        const hours = Array.from({ length: 24 * 4 }, (_, i) => hourBucket(new Date(NOW.getTime() - i * 3600000)));
        hours.forEach(id => snapshots.rows.push({ _id: id, data: {} }));

        const { deleted } = await service.compactOnce(NOW);
        const cutoff = hourBucket(new Date(NOW.getTime() - 2 * DAY_MS));
        const kept = snapshots.rows.map(r => r._id as string);
        expect(deleted).toBeGreaterThan(0);
        expect(kept.filter(id => id >= cutoff)).toHaveLength(hours.filter(id => id >= cutoff).length);
        const oldKept = kept.filter(id => id < cutoff);
        expect(new Set(oldKept.map(id => id.slice(0, 10))).size).toBe(oldKept.length);
        expect(oldKept).toContain('2026-09-29T23:00Z');

        await expect(service.compactOnce(NOW)).resolves.toEqual({ deleted: 0 });
    });

    it('history returns compact points for the requested span', async () => {
        const { service, snapshots } = impactFixture();
        const data = await service.build(NOW);
        snapshots.rows.push({ _id: '2026-09-01T00:00Z', data }, { _id: '2026-10-02T11:00Z', data });
        const points = await service.history(7, NOW);
        expect(points).toEqual([
            {
                bucket: '2026-10-02T11:00Z',
                bySymbol: {},
                players: data.players,
                treatsConfirmed: 1,
                chain: 'not-deployed',
            },
        ]);
    });

    it('never mirrors to the CDN under Jest, even with IMPACT_CDN_ENABLED', async () => {
        process.env.IMPACT_CDN_ENABLED = 'true';
        try {
            const { service } = impactFixture();
            await service.snapshotOnce(NOW);
            expect(uploadPublicObject).not.toHaveBeenCalled();
        } finally {
            delete process.env.IMPACT_CDN_ENABLED;
        }
        expect(readCdnConfig({ IMPACT_CDN_ENABLED: 'true', DO_SPACES_NAME: 'tt' } as any)).toEqual({
            enabled: true,
            objectKey: 'impact/impact.json',
            bucket: 'tt',
        });
        expect(readCdnConfig({ IMPACT_CDN_ENABLED: 'true', JEST_WORKER_ID: '1' } as any).enabled).toBe(false);
        expect(readCdnConfig({} as any).enabled).toBe(false);
    });

    it('mirrors impact/impact.json with Cache-Control public, max-age=300 when the CDN is configured', async () => {
        // The real config is never on under Jest; this stands in for a configured production instance.
        const spy = jest
            .spyOn(impactConfig, 'readCdnConfig')
            .mockReturnValue({ enabled: true, objectKey: 'impact/impact.json', bucket: 'tt-bucket' });
        try {
            const { service } = impactFixture();
            const data = await service.snapshotOnce(NOW);
            expect(uploadPublicObject).toHaveBeenCalledTimes(1);
            const [call] = (uploadPublicObject as jest.Mock).mock.calls[0];
            expect(call).toMatchObject({
                key: 'impact/impact.json',
                contentType: 'application/json',
                cacheControl: 'public, max-age=300',
                bucket: 'tt-bucket',
            });
            expect(JSON.parse(call.body)).toEqual(JSON.parse(JSON.stringify(data)));

            // A failed upload never fails the snapshot: the stored row is the source of truth.
            (uploadPublicObject as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'S3Error' }));
            await expect(service.snapshotOnce(NOW)).resolves.toMatchObject({ bucket: data.bucket });
        } finally {
            spy.mockRestore();
        }
    });
});

describe('ImpactService snapshot ledger parts (task 4f)', () => {
    it('keeps the previous outcomes, pledge table, paws and payouts when one of them fails, never zeros', async () => {
        const ctx = impactFixture();
        const first = await ctx.service.snapshotOnce(NOW);
        jest.spyOn(ctx.outcomeService, 'publicOutcomes').mockRejectedValue(new Error('mongo down'));
        jest.spyOn(ctx.pawService, 'publicSummary').mockRejectedValue(new Error('mongo down'));
        ctx.outcomes.rows.splice(0);
        ctx.settlements.rows.splice(0);

        const next = await ctx.service.build(new Date(NOW.getTime() + 60 * 60 * 1000));

        expect(next.outcomes).toEqual(first.outcomes);
        expect(next.pawSettlements).toEqual(first.pawSettlements);
        expect(next.attestations).toEqual(first.attestations);
        expect(next.pledges).toEqual(first.pledges);
    });

    it('withdrawOutcome strips an unpublished outcome from every stored snapshot at once', async () => {
        const ctx = impactFixture();
        const data = await ctx.service.build(NOW);
        const item = (id: string) => ({ id, type: 'food', date: '2026-09-01', shelter: 's', imageUrl: 'u' });
        const outcomes = { published: 2, items: [item('o-aaaaaaaaaaaa'), item('o-bbbbbbbbbbbb')] };
        ctx.snapshots.rows.push(
            { _id: '2026-10-02T11:00Z', data: { ...data, bucket: '2026-10-02T11:00Z', outcomes } },
            { _id: '2026-10-02T12:00Z', data: { ...data, outcomes } }
        );
        expect((await ctx.service.latest(NOW)).outcomes.items).toHaveLength(2);

        expect(await ctx.service.withdrawOutcome('o-aaaaaaaaaaaa')).toBe(2);
        for (const row of ctx.snapshots.rows) {
            expect(row.data.outcomes).toEqual({ published: 1, items: [item('o-bbbbbbbbbbbb')] });
        }
        // The one-minute cache is dropped too.
        expect((await ctx.service.latest(NOW)).outcomes.items.map((i: any) => i.id)).toEqual(['o-bbbbbbbbbbbb']);
    });
});

describe('BE-3: other chains count while the main chain is not deployed or not indexed yet', () => {
    const ARB = '0x' + '4a'.repeat(20);
    afterEach(() => {
        delete process.env.SHELTER_RELAY_CHAINS;
        delete process.env.SHELTER_CHAIN_42161_SPLIT_ADDRESS;
    });

    it('serves an Arbitrum payout with no Arc mainnet split recorded', async () => {
        withShelterEnv({});
        process.env.SHELTER_RELAY_CHAINS = '42161';
        process.env.SHELTER_CHAIN_42161_SPLIT_ADDRESS = ARB;
        const { service, cursors } = impactFixture();
        const at = new Date(NOW.getTime() - 60000);
        cursors.rows.push({
            _id: cursorIdFor(42161, ARB),
            chainId: 42161,
            contract: ARB,
            fromBlock: 1,
            lastScannedBlock: 50,
            totals: { direct: { USDC: '100000' } },
            eventCount: 1,
            lastSuccessAt: at,
        });
        const data = await service.build(NOW);
        expect(data.money.bySymbol).toEqual({ USDC: '100000' });
        expect(data.money.eventCount).toBe(1);
        expect(data.sources.chain).toBe('ok');
        expect(data.asOf.chain).toBe(at.toISOString());
        // the main chain itself is still reported as not deployed
        expect(data.chain.contract).toBeNull();
    });
});
