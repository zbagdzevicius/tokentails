// Shared fixture for the impact specs: in-memory models with private data planted in them (emails,
// wallets, keys, member lists), so the privacy spec can prove none of it reaches a public response.
// Not a spec itself (jest runs `*.spec.ts` only; the build leaves `-spec.ts` out).
import { Types } from 'mongoose';
import { PORTRAIT_SHELTER_ID } from 'src/blessing/blessing.schema';
import { ShelterChain } from 'src/shelter/onchain/shelter-chain';
import { ShelterDonateService } from 'src/shelter/onchain/shelter-donate.service';
import { fakeDayModel } from 'src/shelter/onchain/shelter-onchain.fakes-spec';
import { JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { ImpactService } from './impact.service';
import { matches, memoryModel } from './memory-model.fakes-spec';
import { ShelterOutcomeService } from './outcomes.service';
import { PawSettlementService } from './paws.service';
import { ImpactPayoutService } from './payouts.service';
import { PledgeService } from './pledge.service';

export const NOW = new Date('2026-10-02T12:34:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

export function impactFixture(now = NOW) {
    const jobRuns = memoryModel();
    const collections = { [JOB_RUNS_COLLECTION]: jobRuns };
    const snapshots = memoryModel({ collections });
    const cursors = memoryModel();
    const events = memoryModel();
    const userRows = memoryModel();
    const users = {
        ...userRows,
        collection: {
            countDocuments: async (f: any) => userRows.rows.filter(r => matches(r, f)).length,
            findOne: async (f: any) => {
                const row = userRows.rows.find(r => matches(r, f));
                return row ? { _id: row._id } : null;
            },
        },
    };
    const shelters = memoryModel();
    const blessings = memoryModel();
    const donations = memoryModel({ unique: [['user', 'day']] });
    const days = fakeDayModel();
    const donate = new ShelterDonateService(donations as any, days as any, new ShelterChain());
    // G4 and G11 ledger models (task 4f), with private fields planted in them too.
    const paws = memoryModel({ unique: [['user', 'day']] });
    const settlements = memoryModel({ collections });
    const games = memoryModel();
    const payouts = memoryModel({ unique: [['publicId']] });
    const outcomes = memoryModel({ unique: [['publicId']] });
    const outcomeImages = memoryModel();
    const orders = memoryModel();
    const pawService = new PawSettlementService(
        paws as any,
        settlements as any,
        games as any,
        userRows as any,
        {} as any
    );
    pawService.pawsConfig = () => ({
        sendEnabled: false,
        dailyBudgetWei: BigInt('1000000000000000000'),
        amountWei: BigInt('10000000000000000'),
    });
    const payoutService = new ImpactPayoutService(payouts as any, shelters as any);
    const outcomeService = new ShelterOutcomeService(
        outcomes as any,
        outcomeImages as any,
        shelters as any,
        payouts as any,
        payoutService
    );
    const pledge = new PledgeService(orders as any, payoutService);
    pledge.config = () => ({ bps: 500, effectiveAt: '2026-09-01' });
    const make = () =>
        new ImpactService(
            snapshots as any,
            cursors as any,
            events as any,
            users as any,
            shelters as any,
            blessings as any,
            donations as any,
            donate,
            pawService,
            payoutService,
            outcomeService,
            pledge
        );
    const service = make();

    const recent = new Date(now.getTime() - 2 * DAY_MS);
    const stale = new Date(now.getTime() - 40 * DAY_MS);
    userRows.rows.push(
        // Registered and active; registered and idle; a legacy doc without isGuest; two guests.
        {
            _id: new Types.ObjectId(),
            email: 'a@example.test',
            isGuest: false,
            lastPlayedAt: recent,
            wallets: { stellar: { walletPrivateKey: 'x' } },
        },
        { _id: new Types.ObjectId(), email: 'b@example.test', isGuest: false, lastPlayedAt: stale },
        { _id: new Types.ObjectId(), email: 'c@example.test', lastPlayedAt: recent },
        { _id: new Types.ObjectId(), isGuest: true, lastPlayedAt: recent },
        { _id: new Types.ObjectId(), isGuest: true }
    );
    shelters.rows.push(
        {
            _id: new Types.ObjectId(),
            name: 'Pink Paw',
            slug: 'rozine-pedute',
            countryCode: 'LT',
            partnerStatus: 'active',
            role: 'partner',
            handoverStatus: 'held-by-token-tails',
            publicWallet: '0x2222222222222222222222222222222222222222',
            wallets: { stellar: { walletAddress: 'G', walletPrivateKey: { iv: 'i', content: 'secret' } } },
            users: [new Types.ObjectId()],
            code: 'secret-code',
        },
        {
            _id: new Types.ObjectId(),
            name: 'Past',
            slug: 'past',
            countryCode: 'PL',
            partnerStatus: 'past',
            role: 'partner',
        },
        {
            _id: new Types.ObjectId(),
            name: 'Token Tails',
            slug: 'token-tails',
            countryCode: 'EE',
            partnerStatus: 'active',
            role: 'house',
        },
        { _id: new Types.ObjectId(), name: 'Legacy', slug: 'legacy', country: 'Lithuania' }
    );
    blessings.rows.push(
        { _id: new Types.ObjectId(), kind: 'rescue', status: 'ADOPTED', creator: new Types.ObjectId() },
        { _id: new Types.ObjectId(), kind: 'rescue', status: 'WAITING' },
        { _id: new Types.ObjectId(), kind: 'portrait', status: 'ADOPTED' },
        // Not backfilled yet: a legacy shelter cat counts as rescue, a legacy portrait does not.
        { _id: new Types.ObjectId(), status: 'ADOPTED', shelter: new Types.ObjectId() },
        { _id: new Types.ObjectId(), status: 'ADOPTED', shelter: new Types.ObjectId(PORTRAIT_SHELTER_ID) }
    );
    const donor = new Types.ObjectId();
    donations.rows.push(
        {
            _id: new Types.ObjectId(),
            user: donor,
            day: '2026-10-01',
            status: 'CONFIRMED',
            amountWei: '10000000000000000',
        },
        {
            _id: new Types.ObjectId(),
            user: new Types.ObjectId(),
            day: '2026-10-01',
            status: 'SENT',
            amountWei: '10000000000000000',
        },
        {
            _id: new Types.ObjectId(),
            user: new Types.ObjectId(),
            day: '2026-10-01',
            status: 'FAILED',
            amountWei: '10000000000000000',
        }
    );
    const pinkPaw = shelters.rows[0];
    const staff = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    const payoutId = new Types.ObjectId();
    payouts.rows.push(
        {
            _id: payoutId,
            publicId: 'p-0000000000a1',
            shelter: pinkPaw._id,
            status: 'SHELTER_CONFIRMED',
            purpose: 'purchase-pledge',
            pledgeMonth: '2026-09',
            amount: '5000000000000000000',
            symbol: 'USD',
            paidAt: new Date('2026-09-28'),
            method: 'bank-transfer',
            reference: 'INV-7',
            receipt: { sha256: 'ab'.repeat(32), size: 10, mime: 'application/pdf', uploadedAt: now },
            attestationHash: 'cd'.repeat(32),
            createdBy: staff[0],
            confirmedBy: staff[1],
        },
        {
            _id: new Types.ObjectId(),
            publicId: 'p-0000000000a2',
            shelter: pinkPaw._id,
            status: 'DRAFT',
            purpose: 'general',
            amount: '7000000000000000000',
            symbol: 'EUR',
            paidAt: new Date('2026-09-29'),
            method: 'cash',
            reference: 'SecretDraftReference',
            receipt: { sha256: 'ef'.repeat(32), size: 10, mime: 'application/pdf', uploadedAt: now },
            attestationHash: '12'.repeat(32),
            createdBy: staff[0],
        }
    );
    outcomes.rows.push(
        {
            _id: new Types.ObjectId(),
            publicId: 'o-0000000000b1',
            shelter: pinkPaw._id,
            type: 'surgery',
            date: new Date('2026-09-25'),
            animalName: 'Murka',
            amount: '5000000000000000000',
            symbol: 'USD',
            payout: payoutId,
            image: {
                sha256: 'aa',
                width: 10,
                height: 10,
                regions: [],
                processedAt: now,
                url: 'https://cdn.test/o.webp',
            },
            redacted: true,
            redactedBy: staff[1],
            approvedBy: staff[2],
            published: true,
            createdBy: staff[0],
        },
        {
            _id: new Types.ObjectId(),
            publicId: 'o-0000000000b2',
            shelter: pinkPaw._id,
            type: 'adoption',
            date: new Date('2026-09-26'),
            animalName: 'SecretDraftCat',
            image: { sha256: 'bb', width: 10, height: 10, regions: [], processedAt: now },
            redacted: false,
            published: false,
            createdBy: staff[0],
        }
    );
    const pawUser = userRows.rows[0];
    paws.rows.push({
        _id: new Types.ObjectId(),
        user: pawUser._id,
        day: '2026-10-01',
        pawId: '0'.repeat(31) + '1',
        salt: '0xsecretsalt',
        userHash: '0x' + '34'.repeat(32),
        leaf: '0x' + '56'.repeat(32),
    });
    settlements.rows.push({
        _id: '2026-10-01',
        status: 'built',
        settlementAt: now,
        pawCount: 1,
        root: '0x' + '56'.repeat(32),
        memo: `tt:paws:2026-10-01:0x${'56'.repeat(32)}`,
        amountWei: '10000000000000000',
        sendSkipped: 'disabled',
    });
    orders.rows.push({
        _id: new Types.ObjectId(),
        status: 'COMPLETE',
        priceUsd: 40,
        price: 40,
        createdAt: new Date('2026-09-10'),
        user: pawUser._id,
        walletAddress: 'GSECRETWALLET',
        hash: 'secret-hash',
    });
    return {
        service,
        make,
        paws,
        settlements,
        games,
        payouts,
        outcomes,
        orders,
        pawService,
        outcomeService,
        staff,
        donate,
        days,
        snapshots,
        cursors,
        events,
        users: userRows,
        shelters,
        blessings,
        donations,
        jobRuns,
        donor,
    };
}
