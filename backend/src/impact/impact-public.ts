import { Types } from 'mongoose';
import { HandoverStatus, PartnerStatus, ShelterRole } from 'src/shared-contracts/enums';
import { RailState } from 'src/shelter/onchain/shelter-donate.service';
import type { AttestationTier } from './attestation';
import type { PublicOutcomeItem } from './outcomes.service';
import type { PublicPawSettlement } from './paws.service';
import type { PublicPayout } from './payouts.service';
import type { PledgeRow, PledgeStatus } from './pledge';
import { PayoutBucket } from './shelter-logs';

/*
 * The public impact shape (plan F7.3): what GET /impact serves, what `impactsnapshots.data` stores and
 * what the CDN mirror publishes as impact/impact.json. Built field by field from whitelisted values,
 * so no email, wallet key, user list or user id can reach it. Amounts are integer strings in
 * 18-decimal units per symbol; there are no mixed-currency sums.
 */

export const IMPACT_SNAPSHOT_VERSION = 1;

/** `ok`: fresh chain data; `error`: the RPC failed, figures carried forward with their old asOf. */
export type ChainSource = 'ok' | 'error' | 'not-deployed' | 'idle';
export type MongoSource = 'ok' | 'error';

export interface PublicShelter {
    slug: string;
    name: string;
    countryCode: string | null;
    partnerStatus: PartnerStatus | null;
    role: ShelterRole | null;
    handoverStatus: HandoverStatus | null;
    publicWallet: string | null;
}

export interface PublicImpact {
    _v: number;
    /** Hour bucket `YYYY-MM-DDTHH:00Z` this snapshot belongs to. */
    bucket: string;
    generatedAt: string;
    /** When each figure family was last read successfully. A carried-forward figure keeps its old date. */
    asOf: { chain: string | null; mongo: string | null };
    sources: { chain: ChainSource; mongo: MongoSource };
    money: {
        /** `held-by-token-tails` unless every paid shelter wallet is a handed-over shelter's (F7.2 tiers). */
        custody: HandoverStatus;
        bySymbol: Record<string, string>;
        byBucket: Partial<Record<PayoutBucket, Record<string, string>>>;
        eventCount: number;
        lastTxHash: string | null;
        /**
         * Per chain id, per symbol: present only when more chains than the main one are indexed
         * (the wallet.config.ts chains). `bySymbol` is already their sum.
         */
        byChain?: Record<string, Record<string, string>>;
    };
    chain: {
        chainId: number;
        contract: string | null;
        fromBlock: number | null;
        lastScannedBlock: number | null;
    };
    players: { registeredAllTime: number | null; active30d: number | null };
    /** Replay-verified Heist wins; null until G2 layer 2 ships. */
    heists: { verified: number | null };
    shelters: { total: number; partners: number; countries: string[]; items: PublicShelter[] };
    /** `Blessing.kind: 'rescue'` only (F7.8); portraits never count. */
    rescueCats: { total: number; adopted: number };
    /**
     * Published shelter outcomes only (G11): redacted and approved by a second reviewer. Each carries
     * the tier of its linked payout, if any.
     */
    outcomes: { published: number; items: PublicOutcomeItem[] };
    rail: {
        state: RailState;
        chainId: number;
        splitAddress: string | null;
        amountWei: string;
        dailyBudgetWei: string;
        giftsPerDayCap: number;
        treatsLeftToday: number;
        resetsAt: string;
    };
    /** Server-paid treats: CONFIRMED counts, SENT shows as "on its way". No giver counts. */
    treats: { confirmedCount: number; onTheirWayCount: number; totalConfirmedWei: string };
    /**
     * Purchase pledge table (G4): pledged against paid per month in USD, from C-002 `effectiveAt`.
     * `not-started` (and no rows) until the registry carries the share and the date.
     */
    pledges: { status: PledgeStatus; bps: number | null; effectiveAt: string | null; rows: PledgeRow[] };
    /** Nightly paw settlements (G4). In-game paws; the money is the settlement's donate. */
    pawSettlements: {
        count: number;
        totalPaws: number;
        confirmedWei: string;
        latest: PublicPawSettlement | null;
        pawAmountWei: string;
        dailyBudgetWei: string;
        sendEnabled: boolean;
    };
    /**
     * Off-chain payouts with shelter evidence (G4 attestation, F7.2): SHELTER-CONFIRMED (amber) and
     * SHELTER-SIGNED (green), per symbol. Drafts and voided payouts never appear.
     */
    attestations: {
        bySymbol: Record<AttestationTier, Record<string, string>>;
        items: PublicPayout[];
    };
    /** Open Rescue Goals (G5), so the landing needs one fetch; empty until they ship. */
    rescueGoals: { open: number; items: unknown[] };
}

/** `YYYY-MM-DDTHH:00Z` for the UTC hour of `now`. Sorts as a string. */
export function hourBucket(now: Date): string {
    return `${now.toISOString().slice(0, 13)}:00Z`;
}

/**
 * Token Tails' own zones. Same list as DEFAULT_HOUSE_SLUGS in scripts/backfill-shelter-fields.js, so a
 * shelter without `role` (before that backfill) is classified the way the backfill will classify it.
 */
export const HOUSE_SHELTER_SLUGS: readonly string[] = ['token-tails', 'token-tails-2', 'home'];

/** `role: 'house'`, or no role yet and a house slug. House zones are never shelters in the figures. */
export function isHouseShelter(row: { role?: unknown; slug?: unknown }): boolean {
    return row.role === 'house' || (!row.role && HOUSE_SHELTER_SLUGS.includes(String(row.slug || '')));
}

/** A collection that can list shelters (a Mongoose model or the native driver's collection). */
export interface IShelterLister {
    find(filter: Record<string, unknown>, projection?: Record<string, unknown>): any;
}

/**
 * Ids of the house zones (`isHouseShelter`), for `rescueBlessingFilter(excludeShelters)`. Lists every
 * shelter (a handful) and classifies in code, so a row before the role backfill is judged by slug the
 * same way the shelter figures judge it.
 */
export async function houseShelterIds(shelters: IShelterLister): Promise<Types.ObjectId[]> {
    const query = shelters.find({}, { _id: 1, slug: 1, role: 1 });
    const rows: any[] = await (typeof query?.lean === 'function' ? query.lean() : query.toArray());
    return (rows || [])
        .filter(row => isHouseShelter(row))
        .map(row => (row._id instanceof Types.ObjectId ? row._id : new Types.ObjectId(String(row._id))));
}

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export function publicShelter(row: Record<string, any>): PublicShelter {
    return {
        slug: String(row.slug || ''),
        name: String(row.name || ''),
        countryCode: str(row.countryCode),
        partnerStatus: str(row.partnerStatus) as PartnerStatus | null,
        role: str(row.role) as ShelterRole | null,
        handoverStatus: str(row.handoverStatus) as HandoverStatus | null,
        publicWallet: str(row.publicWallet),
    };
}

/** Sums `{ bucket: { symbol: amount } }` into `{ symbol: amount }`. */
export function totalsBySymbol(byBucket: Record<string, Record<string, string>>): Record<string, string> {
    const totals = new Map<string, bigint>();
    for (const symbols of Object.values(byBucket || {})) {
        for (const [symbol, amount] of Object.entries(symbols || {})) {
            if (/^\d+$/.test(String(amount))) {
                totals.set(symbol, (totals.get(symbol) || BigInt(0)) + BigInt(amount));
            }
        }
    }
    return Object.fromEntries([...totals].map(([symbol, amount]) => [symbol, amount.toString()]));
}

/**
 * Custody of the paid money: handed over only when every recipient wallet belongs to a shelter whose
 * handover is `handed-over`. Unknown recipients count as custodial (the conservative amber tier).
 */
export function custodyOf(recipients: string[], shelters: PublicShelter[]): HandoverStatus {
    if (!recipients.length) {
        return 'held-by-token-tails';
    }
    const handedOver = new Set(
        shelters
            .filter(s => s.handoverStatus === 'handed-over' && s.publicWallet)
            .map(s => String(s.publicWallet).toLowerCase())
    );
    return recipients.every(wallet => handedOver.has(String(wallet).toLowerCase()))
        ? 'handed-over'
        : 'held-by-token-tails';
}
