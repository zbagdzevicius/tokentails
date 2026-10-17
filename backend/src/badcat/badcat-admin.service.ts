import { Injectable } from '@nestjs/common';
import {
    BADCAT_SKUS,
    BadcatServerStatus,
    BadcatSku,
    CREATOR_CODE_PATTERN,
    CREATOR_MIN_PAYOUT_CENTS,
    CREATOR_SHARE_BPS,
    CREATOR_WINDOW_MONTHS,
    isBadcatSku,
} from './badcat.contracts';
import { BADCAT_ERRORS } from './badcat.errors';
import {
    badcatCheckoutReady,
    badcatPublicUrl,
    badcatStripeKey,
    badcatVapidKeys,
    Env,
    sendgridConfigured,
} from './badcat-flags';
import { BadcatStore } from './badcat.schema';
import { ACTIVE_SUB_STATUSES } from './badcat-account.service';
import { typedKey } from './badcat-cameo.service';
import { BadcatStripeService } from './badcat-stripe.service';
import { addMonths, MS_DAY, normalizeEmail, utcDateKey } from './badcat-util';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';

/*
 * Status, creator codes, the typed-arrival counter and the admin stats. Purchases are counted from the
 * Stripe metadata mirrored by the webhook (GDD 14), so buyers who declined analytics count too.
 */

/** Stripe's US card fee, used only to estimate net revenue in the creator report (2.9 % + 30 c). */
export const estimateStripeFee = (cents: number) => (cents > 0 ? Math.round(cents * 0.029) + 30 : 0);

/** Gross monthly recurring revenue of one subscription row (founding: the first-year price / 12). */
export function monthlyCents(sku: BadcatSku): number {
    const def = BADCAT_SKUS[sku];
    if (!def?.recurring || !def.revenueBearing) return 0;
    return def.recurring === 'year' ? Math.round(def.cents / 12) : def.cents;
}

export interface Bucket {
    count: number;
    cents: number;
}

@Injectable()
export class BadcatAdminService {
    now: () => Date = () => new Date();

    constructor(private readonly store: BadcatStore, private readonly stripe: BadcatStripeService) {}

    /**
     * GET /badcat/status. Every feature is on; the secret-backed ones report whether their secrets are set:
     * checkout (and gifts, brand) needs the Stripe key, BADCAT_STRIPE_WEBHOOK_SECRET and the entitlement key;
     * restore and streak emails need SendGrid; push needs the BADCAT_VAPID_* keys.
     */
    async status(env: Env = process.env): Promise<BadcatServerStatus> {
        const key = badcatStripeKey(env);
        const checkout = badcatCheckoutReady(env);
        const email = sendgridConfigured(env);
        const status: BadcatServerStatus = {
            enabled: true,
            checkout,
            cameos: true,
            gifts: checkout,
            restoreEmail: email,
            faceUploads: true,
            creatorCodes: true,
            brand: checkout,
            testMode: key.usable && key.testMode,
            // Phase 2 (GDD 10, 17.3)
            scores: true,
            boards: true,
            accounts: true,
            shortLinks: true,
            feed: true,
            meter: true,
            push: !!badcatVapidKeys(env),
            streakEmail: email,
            creatorDashboard: true,
        };
        if (checkout) status.foundingLeft = await this.stripe.foundingLeft();
        return status;
    }

    // ---------------------------------------------------------------------------------------------
    // Creator codes
    // ---------------------------------------------------------------------------------------------

    async requestCreatorCode(code: unknown, email: unknown): Promise<{ ok: boolean; status: 'pending' }> {
        const value = typeof code === 'string' ? code.trim().toLowerCase() : '';
        if (!CREATOR_CODE_PATTERN.test(value)) throw BADCAT_ERRORS.invalid('code must be 6-12 of a-z, 0-9, _');
        const address = normalizeEmail(email);
        if (!address) throw BADCAT_ERRORS.invalid('email is not valid');
        try {
            await this.store.creatorCodes.create({ code: value, email: address, status: 'pending' });
        } catch (error) {
            if (isDuplicateKeyError(error)) throw BADCAT_ERRORS.conflict('That code is taken');
            throw error;
        }
        return { ok: true, status: 'pending' };
    }

    async listCreatorCodes() {
        const rows = (await this.store.creatorCodes.find({}).lean()) as any[];
        return rows
            .map(row => ({
                code: row.code,
                email: row.email,
                status: row.status,
                createdAt: row.createdAt,
                approvedAt: row.approvedAt,
            }))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    async reviewCreatorCode(code: string, decision: 'approve' | 'reject') {
        const status = decision === 'approve' ? 'approved' : 'rejected';
        const result = await this.store.creatorCodes.updateOne(
            { code: String(code || '').toLowerCase() },
            { $set: { status, ...(decision === 'approve' ? { approvedAt: this.now() } : {}) } }
        );
        if (!(result as any)?.matchedCount) throw BADCAT_ERRORS.notFound();
        return { ok: true, status };
    }

    /**
     * Net revenue per approved creator code (GDD 9.2): every revenue-bearing, unrefunded purchase and renewal
     * with `via=<code>` inside the first 6 months after the buyer's first purchase through that code. Net is
     * gross minus an estimated Stripe fee; the share is 20 %, paid from $25.
     */
    async creatorReport() {
        const codes = ((await this.store.creatorCodes.find({ status: 'approved' }).lean()) as any[]).map(
            row => row.code
        );
        const rows = (await this.store.purchases.find({ 'meta.via': { $in: codes } }).lean()) as any[];
        return codes.map(code => {
            const mine = rows
                .filter(row => row.meta?.via === code)
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            const firstAt = new Map<string, Date>();
            let grossCents = 0;
            let netCents = 0;
            const buyers = new Set<string>();
            for (const row of mine) {
                const buyer = row.email || row.customerId || row.sessionId;
                if (!firstAt.has(buyer)) firstAt.set(buyer, new Date(row.createdAt));
                if (
                    row.status === 'refunded' ||
                    !isBadcatSku(row.sku) ||
                    !BADCAT_SKUS[row.sku as BadcatSku].revenueBearing
                ) {
                    continue;
                }
                if (new Date(row.createdAt) >= addMonths(firstAt.get(buyer)!, CREATOR_WINDOW_MONTHS)) continue;
                buyers.add(buyer);
                grossCents += row.amountTotal || 0;
                netCents += (row.amountTotal || 0) - estimateStripeFee(row.amountTotal || 0);
            }
            const shareCents = Math.floor((netCents * CREATOR_SHARE_BPS) / 10000);
            return {
                code,
                buyers: buyers.size,
                grossCents,
                netCents,
                shareCents,
                payable: shareCents >= CREATOR_MIN_PAYOUT_CENTS,
                note: `20% of net for each buyer's first ${CREATOR_WINDOW_MONTHS} months; $25 minimum payout; fees estimated`,
            };
        });
    }

    // ---------------------------------------------------------------------------------------------
    // Typed redirect and stats
    // ---------------------------------------------------------------------------------------------

    /** GET /badcat/t: counts one typed arrival for today (UTC) and returns the redirect target. */
    async typedArrival(env: Env = process.env): Promise<string> {
        await this.store.counters.updateOne(
            { key: typedKey(utcDateKey(this.now())) },
            { $inc: { n: 1 } },
            { upsert: true }
        );
        return `${badcatPublicUrl(env)}/badcat/pick?e=t`;
    }

    async stats(days = 30) {
        const now = this.now();
        const span = Math.min(Math.max(Math.trunc(days) || 30, 1), 120);
        const dates = Array.from({ length: span }, (_, i) => utcDateKey(new Date(now.getTime() - i * MS_DAY)));
        const typedRows = (await this.store.counters.find({ key: { $in: dates.map(typedKey) } }).lean()) as any[];
        const typedByKey = new Map(typedRows.map(row => [row.key, row.n || 0]));
        const typed = dates.map(date => ({ date, n: typedByKey.get(typedKey(date)) || 0 }));

        const since = new Date(now.getTime() - span * MS_DAY);
        const purchases = (await this.store.purchases.find({ createdAt: { $gte: since } }).lean()) as any[];
        const group = (key: (row: any) => string) => {
            const out: Record<string, Bucket> = {};
            for (const row of purchases) {
                if (row.kind === 'renewal' || row.status === 'refunded') continue;
                const name = key(row) || '(none)';
                out[name] = out[name] || { count: 0, cents: 0 };
                out[name].count++;
                out[name].cents += row.amountTotal || 0;
            }
            return out;
        };
        const revenueBearing = (row: any) => isBadcatSku(row.sku) && BADCAT_SKUS[row.sku as BadcatSku].revenueBearing;
        const live = purchases.filter(row => row.status !== 'refunded');

        const subs = (await this.store.purchases
            .find({
                kind: 'subscription',
                status: 'paid',
                subStatus: { $in: ACTIVE_SUB_STATUSES },
                periodEnd: { $gt: now },
            })
            .lean()) as any[];
        const mrrBySku: Record<string, number> = {};
        for (const row of subs) {
            if (!isBadcatSku(row.sku)) continue;
            mrrBySku[row.sku] = (mrrBySku[row.sku] || 0) + monthlyCents(row.sku);
        }
        const queue = (await this.store.purchases.find({ queue: 'queued' }).lean()) as any[];

        return {
            days: span,
            typed,
            purchases: {
                bySku: group(row => row.sku),
                byTrigger: group(row => row.meta?.trigger),
                byVia: group(row => row.meta?.via),
                byFromInApp: group(row => row.meta?.from_in_app),
                byAbArm: group(row => row.meta?.ab_arm),
            },
            revenueCents: live.filter(revenueBearing).reduce((sum, row) => sum + (row.amountTotal || 0), 0),
            /** The Pink Paw collar: a donation, not revenue (GDD 9.2). */
            donationCents: live
                .filter(row => !revenueBearing(row))
                .reduce((sum, row) => sum + (row.amountTotal || 0), 0),
            activeSubscriptions: subs.length,
            mrrCents: Object.values(mrrBySku).reduce((sum, value) => sum + value, 0),
            mrrBySku,
            foundingTaken: await this.stripe.foundingTaken(),
            brandQueue: queue.map(row => ({
                sessionId: row.sessionId,
                sku: row.sku,
                email: row.email,
                dayNo: row.dayNo,
                brand: row.brand,
                createdAt: row.createdAt,
            })),
        };
    }
}
