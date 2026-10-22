import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectThrottlerStorage, ThrottlerStorage } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'crypto';
import { Model } from 'mongoose';
import { subscriptionPeriodEnd } from 'src/badcat/badcat-webhook.service';
import { normalizeEmail } from 'src/badcat/badcat-util';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { RAVE_CLIENT_KEY_RE } from 'src/rave/rave.service';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import { canonicalEmail } from 'src/user/guest/canonical-email';
import { firebaseIdentity, IFirebaseIdentity } from 'src/user/guest/firebase-identity';
import { User, UserDocument } from 'src/user/user.schema';
import Stripe from 'stripe';
import {
    CLUB_PLANS,
    CLUB_PORTAL_EMAILS_PER_DAY,
    CLUB_RETURN_URL,
    CLUB_SHELTER_BPS,
    ClubConfig,
    clubMissing,
    clubPlanOfPrice,
    ClubPlan,
    clubPriceId,
    readClubConfig,
} from './club.config';
import { portalEmailHtml, sendClubEmail } from './club-email';
import { CLUB_ERRORS } from './club.errors';
import { CLUB_ACTIVE_STATUSES, ClubMember, ClubMemberDocument } from './club.schema';
import { CLUB_MANAGE_TTL_MS, CLUB_OPEN_TTL_MS, signClubToken, verifyClubToken } from './club-token';

/*
 * Tails Club checkout (docs/BACKEND.md "Tails Club"). Subscriptions API with the Payment Element, not Checkout:
 * POST /club/checkout creates (or reuses) a Customer and a `default_incomplete` Subscription and returns the
 * first invoice's confirmation secret; the landing confirms it in place. The webhook (club-webhook.service.ts)
 * and the buyer's poll (GET /club/subscriptions/:id) both write the subscription's state through
 * syncSubscription. Pink Paw's half of each paid invoice is queued by the webhook.
 *
 * Never double-charge: one subscription per clientKey (unique row, Stripe idempotency keys `club:cus:<key>` and
 * `club:sub:<key>`), and an inbox that already has an active membership gets 409 alreadyMember.
 */

export const CLUB_SUBSCRIPTION_ID_RE = /^sub_[A-Za-z0-9]{1,255}$/;
const CAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const CLUB_PRICE_CACHE_MS = 10 * 60 * 1000;
/** A failed price read is retried after this long, so a Stripe outage is not hammered by every visitor. */
export const CLUB_PRICE_FAIL_CACHE_MS = 60 * 1000;
export const CLUB_STRIPE_POLL_MS = 5 * 1000;
export const CLUB_INCOMPLETE_WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export type ClubOffReason = 'config' | 'price';

export interface ClubPriceInfo {
    amount: number;
    currency: string;
}

export interface ClubStatus {
    enabled: boolean;
    reason?: ClubOffReason;
    publishableKey?: string;
    prices?: { month: ClubPriceInfo; year: ClubPriceInfo };
    shelterBps: number;
}

export interface ClubCheckoutBody {
    plan?: unknown;
    email?: unknown;
    catId?: unknown;
    clientKey?: unknown;
}

export interface ClubCheckoutResponse {
    clientSecret: string | null;
    subscriptionId: string;
    status?: string;
}

export interface ClubSubscriptionView {
    status: string;
    plan: string;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    manageToken?: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const isActive = (status: unknown) => (CLUB_ACTIVE_STATUSES as readonly string[]).includes(String(status));
const idOf = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : (value as { id?: string } | null | undefined)?.id || undefined;

function sameHash(a: string, b: string): boolean {
    const x = Buffer.from(String(a || ''), 'utf8');
    const y = Buffer.from(String(b || ''), 'utf8');
    return x.length === y.length && timingSafeEqual(x, y);
}

@Injectable()
export class ClubService {
    private readonly logger = new Logger(ClubService.name);
    /** Read on every call; tests replace it. Never logged or returned. */
    env: NodeJS.ProcessEnv = process.env;
    /** Firebase token check for the optional accesstoken at checkout; tests replace it. */
    identity: IFirebaseIdentity = firebaseIdentity;
    /** SendGrid transport; tests replace it. */
    sendEmail: (to: string, subject: string, html: string) => Promise<boolean> = (to, subject, html) =>
        sendClubEmail(to, subject, html, this.env);
    private priceCache: { at: number; key: string; ok: boolean; prices?: ClubStatus['prices'] } | null = null;
    private readonly lastStripePoll = new Map<string, number>();

    constructor(
        @InjectModel(ClubMember.name) private members: Model<ClubMemberDocument>,
        @InjectModel(User.name) private users: Model<UserDocument>,
        private stripePayments: StripePaymentService,
        @InjectThrottlerStorage() private throttleStorage: ThrottlerStorage
    ) {}

    private get stripe(): Stripe {
        return this.stripePayments.stripe;
    }

    config(): ClubConfig {
        return readClubConfig(this.env);
    }

    // ------------------------------------------------------------------ status

    /** Both prices from Stripe, cached CLUB_PRICE_CACHE_MS; null when a read failed or a price is unusable. */
    async prices(cfg: ClubConfig, now: Date = new Date()): Promise<ClubStatus['prices'] | null> {
        const key = `${cfg.secretKeyMode}|${cfg.prices.month}|${cfg.prices.year}`;
        const cached = this.priceCache;
        if (cached && cached.key === key) {
            const age = now.getTime() - cached.at;
            if (cached.ok && age < CLUB_PRICE_CACHE_MS) return cached.prices!;
            if (!cached.ok && age < CLUB_PRICE_FAIL_CACHE_MS) return null;
        }
        try {
            const out: Record<string, ClubPriceInfo> = {};
            for (const plan of CLUB_PLANS) {
                const price: any = await this.stripe.prices.retrieve(clubPriceId(cfg, plan)!);
                const interval = price?.recurring?.interval;
                if (
                    !price?.active ||
                    price.currency !== 'usd' ||
                    interval !== plan ||
                    (price.recurring?.interval_count ?? 1) !== 1 ||
                    !Number.isSafeInteger(price.unit_amount) ||
                    price.unit_amount <= 0
                ) {
                    this.logger.error(`club: price for ${plan} is not an active USD 1-${plan} recurring price`);
                    this.priceCache = { at: now.getTime(), key, ok: false };
                    return null;
                }
                if (price.tax_behavior !== 'inclusive') {
                    this.logger.warn(`club: price for ${plan} is not tax_behavior inclusive (copy says "incl. VAT")`);
                }
                out[plan] = { amount: price.unit_amount, currency: 'usd' };
            }
            const prices = { month: out.month, year: out.year };
            this.priceCache = { at: now.getTime(), key, ok: true, prices };
            return prices;
        } catch (error) {
            this.logger.warn(`club: prices not read: ${(error as Error)?.message}`);
            this.priceCache = { at: now.getTime(), key, ok: false };
            return null;
        }
    }

    async status(now: Date = new Date()): Promise<ClubStatus> {
        const cfg = this.config();
        if (clubMissing(cfg).length) return { enabled: false, reason: 'config', shelterBps: CLUB_SHELTER_BPS };
        const prices = await this.prices(cfg, now);
        if (!prices) return { enabled: false, reason: 'price', shelterBps: CLUB_SHELTER_BPS };
        return { enabled: true, publishableKey: cfg.publishableKey!, prices, shelterBps: CLUB_SHELTER_BPS };
    }

    /** 503 CLUB_OFF unless GET /club/status would say enabled. */
    async assertOpen(now: Date = new Date()): Promise<ClubConfig> {
        const status = await this.status(now);
        if (!status.enabled) throw CLUB_ERRORS.off(status.reason || 'config');
        return this.config();
    }

    // ------------------------------------------------------------------ checkout

    /**
     * The optional `accesstoken` of a signed-in, non-guest player: its user id, else undefined. Never throws:
     * a bad or guest token simply buys without a linked account.
     */
    async optionalUserId(header: unknown): Promise<string | undefined> {
        if (typeof header !== 'string' || !header.startsWith('fb') || header.length < 10) return undefined;
        try {
            const decoded: any = await this.identity.verifyIdToken(header.slice(2));
            if (!decoded?.uid || decoded.firebase?.sign_in_provider === 'anonymous') return undefined;
            const user: any = await this.users
                .findOne(
                    { firebaseUids: decoded.uid, isGuest: { $ne: true }, deletedAt: { $exists: false } },
                    { _id: 1 }
                )
                .lean();
            return user?._id ? String(user._id) : undefined;
        } catch {
            return undefined;
        }
    }

    async checkout(body: ClubCheckoutBody, userId?: string, now: Date = new Date()): Promise<ClubCheckoutResponse> {
        const cfg = await this.assertOpen(now);
        if (!body || typeof body !== 'object') throw CLUB_ERRORS.invalid('Expected a JSON body');
        if (!CLUB_PLANS.includes(body.plan as ClubPlan)) throw CLUB_ERRORS.invalid('plan must be month or year');
        const plan = body.plan as ClubPlan;
        const email = normalizeEmail(body.email);
        const emailKey = email ? canonicalEmail(email) : null;
        if (!email || !emailKey) throw CLUB_ERRORS.invalid('Enter a valid email');
        if (
            body.catId !== undefined &&
            body.catId !== null &&
            (typeof body.catId !== 'string' || !CAT_ID_RE.test(body.catId))
        ) {
            throw CLUB_ERRORS.invalid('catId is not valid');
        }
        const catId = typeof body.catId === 'string' ? body.catId : undefined;
        if (typeof body.clientKey !== 'string' || !RAVE_CLIENT_KEY_RE.test(body.clientKey)) {
            throw CLUB_ERRORS.invalid('clientKey must be a UUID');
        }
        const clientKey = body.clientKey;
        const bodyHash = sha256(JSON.stringify({ plan, email, catId: catId || null }));

        let member: any = await this.members.findOne({ clientKey }).lean();
        if (member) {
            if (member.bodyHash !== bodyHash) throw CLUB_ERRORS.keyReused();
            if (member.subscriptionId) return this.repeatCheckout(member);
        } else {
            if (
                await this.members
                    .findOne({ emailCanonical: emailKey, subStatus: { $in: CLUB_ACTIVE_STATUSES } })
                    .lean()
            ) {
                throw CLUB_ERRORS.alreadyMember();
            }
            // Card-testing brake: incomplete subscriptions created in the last 15 minutes.
            const incomplete = await this.members
                .countDocuments({
                    subStatus: 'incomplete',
                    createdAt: { $gte: new Date(now.getTime() - CLUB_INCOMPLETE_WINDOW_MS) },
                })
                .exec();
            if (incomplete >= cfg.incompletePer15Min) throw CLUB_ERRORS.busy();
            try {
                const created: any = await this.members.create({
                    email,
                    emailCanonical: emailKey,
                    ...(userId ? { userId } : {}),
                    plan,
                    ...(catId ? { catId } : {}),
                    subStatus: 'incomplete',
                    cancelAtPeriodEnd: false,
                    clientKey,
                    clientKeyHash: sha256(clientKey),
                    bodyHash,
                } as any);
                member = typeof created?.toObject === 'function' ? created.toObject() : created;
            } catch (error) {
                if (!isDuplicateKeyError(error)) throw error;
                member = await this.members.findOne({ clientKey }).lean();
                if (!member) throw error;
                if (member.bodyHash !== bodyHash) throw CLUB_ERRORS.keyReused();
                if (member.subscriptionId) return this.repeatCheckout(member);
            }
        }

        let sub: any;
        try {
            const customerId = member.customerId || (await this.customerFor(member, clientKey));
            sub = await this.stripe.subscriptions.create(
                {
                    customer: customerId,
                    items: [{ price: clubPriceId(cfg, plan)! }],
                    payment_behavior: 'default_incomplete',
                    payment_settings: { save_default_payment_method: 'on_subscription' },
                    expand: ['latest_invoice.confirmation_secret'],
                    description: `Tails Club (${plan === 'month' ? 'monthly' : 'yearly'})`,
                    metadata: {
                        club: '1',
                        plan,
                        clientKey,
                        ...(catId ? { catId } : {}),
                        ...(member.userId || userId ? { userId: member.userId || userId } : {}),
                    },
                },
                { idempotencyKey: `club:sub:${clientKey}` }
            );
        } catch (error) {
            if ((error as any)?.getStatus) throw error;
            this.logger.warn(`club ${clientKey}: subscription not created: ${(error as Error)?.message}`);
            // Nothing was charged; drop the row so it does not count toward the brake. A retry makes a new one.
            await this.members.deleteOne({ clientKey, subscriptionId: { $exists: false } });
            throw CLUB_ERRORS.stripe();
        }
        await this.members.updateOne(
            { clientKey },
            {
                $set: {
                    subscriptionId: sub.id,
                    customerId: idOf(sub.customer),
                    subStatus: sub.status,
                    livemode: !!sub.livemode,
                    ...(subscriptionPeriodEnd(sub) ? { periodEnd: subscriptionPeriodEnd(sub) } : {}),
                },
            }
        );
        return this.checkoutResponse(sub);
    }

    /**
     * A new Stripe Customer for every checkout (idempotent per clientKey). Never the inbox's earlier customer:
     * whoever types an address does not prove they own it, and a reused customer would hand its past invoices,
     * receipts and saved cards to that person's manage link (GET /club/subscriptions/:id issues it to the payer).
     */
    private async customerFor(member: any, clientKey: string): Promise<string> {
        const customer = await this.stripe.customers.create(
            { email: member.email, metadata: { club: '1' } },
            { idempotencyKey: `club:cus:${clientKey}` }
        );
        await this.members.updateOne(
            { clientKey, customerId: { $exists: false } },
            { $set: { customerId: customer.id } }
        );
        return customer.id;
    }

    private async repeatCheckout(member: any): Promise<ClubCheckoutResponse> {
        let sub: any;
        try {
            sub = await this.stripe.subscriptions.retrieve(member.subscriptionId, {
                expand: ['latest_invoice.confirmation_secret'],
            });
        } catch (error) {
            this.logger.warn(`club ${member.subscriptionId}: not read: ${(error as Error)?.message}`);
            throw CLUB_ERRORS.stripe();
        }
        await this.syncSubscription(sub);
        return this.checkoutResponse(sub);
    }

    private checkoutResponse(sub: any): ClubCheckoutResponse {
        const secret = sub?.status === 'incomplete' ? sub?.latest_invoice?.confirmation_secret?.client_secret : null;
        return { clientSecret: secret || null, subscriptionId: sub.id, status: sub.status };
    }

    // ------------------------------------------------------------------ state

    /**
     * Writes a subscription's current state onto its member row (webhook and poll). Only club subscriptions
     * (`metadata.club === '1'`). A row is matched by subscription id, else by the metadata clientKey (a crash
     * between Stripe's create and our write); a club subscription with no row at all is rebuilt from metadata
     * when the customer's email is known. Returns the outcome.
     */
    async syncSubscription(sub: any): Promise<string> {
        if (sub?.metadata?.club !== '1' || !CLUB_SUBSCRIPTION_ID_RE.test(String(sub?.id || ''))) return 'ignored';
        const cfg = this.config();
        const md = sub.metadata || {};
        const priceId = idOf(sub?.items?.data?.[0]?.price);
        const plan = clubPlanOfPrice(cfg, priceId) || (CLUB_PLANS.includes(md.plan) ? md.plan : undefined);
        const periodEnd = subscriptionPeriodEnd(sub);
        const set: Record<string, unknown> = {
            subscriptionId: sub.id,
            subStatus: String(sub.status || 'incomplete'),
            cancelAtPeriodEnd: !!sub.cancel_at_period_end || !!sub.cancel_at,
            livemode: !!sub.livemode,
            ...(idOf(sub.customer) ? { customerId: idOf(sub.customer) } : {}),
            ...(periodEnd ? { periodEnd } : {}),
            ...(plan ? { plan } : {}),
        };
        const byId = await this.members.updateOne({ subscriptionId: sub.id }, { $set: set });
        if ((byId as any)?.matchedCount) {
            if (typeof md.userId === 'string' && md.userId) {
                await this.members.updateOne(
                    { subscriptionId: sub.id, userId: { $exists: false } },
                    { $set: { userId: md.userId } }
                );
            }
            return 'synced';
        }
        if (typeof md.clientKey === 'string' && RAVE_CLIENT_KEY_RE.test(md.clientKey)) {
            const byKey = await this.members.updateOne(
                { clientKey: md.clientKey, subscriptionId: { $exists: false } },
                { $set: set }
            );
            if ((byKey as any)?.matchedCount) return 'synced';
        }
        const email = normalizeEmail((sub.customer as any)?.email);
        const emailKey = email ? canonicalEmail(email) : null;
        if (!email || !emailKey || !plan) {
            this.logger.error(`club ${sub.id}: club subscription without a member row and no email; check by hand`);
            return 'orphan';
        }
        const clientKey =
            typeof md.clientKey === 'string' && RAVE_CLIENT_KEY_RE.test(md.clientKey)
                ? md.clientKey
                : `recovered-${sub.id}`;
        try {
            await this.members.create({
                ...set,
                email,
                emailCanonical: emailKey,
                ...(typeof md.userId === 'string' && md.userId ? { userId: md.userId } : {}),
                ...(typeof md.catId === 'string' && CAT_ID_RE.test(md.catId) ? { catId: md.catId } : {}),
                clientKey,
                clientKeyHash: sha256(clientKey),
                bodyHash: sha256(JSON.stringify({ plan, email, catId: md.catId || null })),
            } as any);
            this.logger.warn(`club ${sub.id}: member row rebuilt from the subscription`);
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
            await this.members.updateOne({ subscriptionId: sub.id }, { $set: set });
        }
        return 'recovered';
    }

    async memberBySubscription(subscriptionId: string): Promise<any | null> {
        if (!CLUB_SUBSCRIPTION_ID_RE.test(String(subscriptionId || ''))) return null;
        return this.members.findOne({ subscriptionId }).lean();
    }

    // ------------------------------------------------------------------ buyer poll

    /** GET /club/subscriptions/:id?k=: 404 unless `k` is the clientKey that started it. */
    async getSubscription(id: string, k: unknown, now: Date = new Date()): Promise<ClubSubscriptionView> {
        if (!CLUB_SUBSCRIPTION_ID_RE.test(String(id || '')) || typeof k !== 'string' || !RAVE_CLIENT_KEY_RE.test(k)) {
            throw CLUB_ERRORS.notFound();
        }
        let member: any = await this.members.findOne({ subscriptionId: id }).lean();
        if (!member || !sameHash(member.clientKeyHash, sha256(k))) throw CLUB_ERRORS.notFound();
        if (member.subStatus === 'incomplete') {
            await this.pollStripe(id, now);
            member = await this.members.findOne({ subscriptionId: id }).lean();
        }
        const active = isActive(member.subStatus);
        const secret = this.config().tokenSecret;
        return {
            status: member.subStatus,
            plan: member.plan,
            periodEnd: member.periodEnd ? new Date(member.periodEnd).toISOString() : null,
            cancelAtPeriodEnd: !!member.cancelAtPeriodEnd,
            ...(active && secret
                ? {
                      manageToken: signClubToken(
                          { t: 'manage', sub: id, exp: now.getTime() + CLUB_MANAGE_TTL_MS },
                          secret
                      ),
                  }
                : {}),
        };
    }

    /** subscriptions.retrieve at most once per CLUB_STRIPE_POLL_MS per subscription (a slow webhook). */
    private async pollStripe(id: string, now: Date) {
        const last = this.lastStripePoll.get(id) || 0;
        if (now.getTime() - last < CLUB_STRIPE_POLL_MS) return;
        if (this.lastStripePoll.size > 5000) this.lastStripePoll.clear();
        this.lastStripePoll.set(id, now.getTime());
        try {
            const sub = await this.stripe.subscriptions.retrieve(id);
            await this.syncSubscription(sub);
        } catch (error) {
            this.logger.warn(`club ${id}: not read: ${(error as Error)?.message}`);
        }
    }

    // ------------------------------------------------------------------ portal

    /**
     * POST /club/portal. `{manageToken}`: the portal URL at once. `{email}`: always `{sent:true}` (202); if that
     * inbox has a membership (and is under its daily limit), a 15-minute link to GET /club/portal/open is
     * emailed. A bare email never opens the portal.
     */
    async portal(body: { manageToken?: unknown; email?: unknown }, now: Date = new Date()) {
        const cfg = this.config();
        if (!cfg.secretKeyMode || !cfg.tokenSecret) throw CLUB_ERRORS.off('config');
        if (body && body.manageToken !== undefined) {
            const token = verifyClubToken(body.manageToken, cfg.tokenSecret, 'manage', now.getTime());
            if (!token) throw CLUB_ERRORS.badToken();
            const member: any = await this.memberBySubscription(token.sub!);
            if (!member?.customerId) throw CLUB_ERRORS.badToken();
            return { url: await this.portalUrl(member.customerId) };
        }
        const email = normalizeEmail(body?.email);
        const emailKey = email ? canonicalEmail(email) : null;
        if (!email || !emailKey) throw CLUB_ERRORS.invalid('Enter a valid email');
        if (!cfg.sendgrid) throw CLUB_ERRORS.portalOff();
        const { totalHits } = await this.throttleStorage.increment(`club-portal-email:${sha256(emailKey)}`, DAY_MS);
        if (totalHits <= CLUB_PORTAL_EMAILS_PER_DAY) {
            const member: any = await this.members
                .findOne({
                    emailCanonical: emailKey,
                    customerId: { $exists: true },
                    subStatus: { $nin: ['incomplete', 'incomplete_expired'] },
                })
                .sort({ updatedAt: -1 })
                .lean();
            if (member) {
                const t = signClubToken(
                    { t: 'open', cus: member.customerId, exp: now.getTime() + CLUB_OPEN_TTL_MS },
                    cfg.tokenSecret
                );
                const link = `${cfg.apiPublicUrl}/club/portal/open?t=${encodeURIComponent(t)}`;
                // Not awaited: a member and a stranger get the 202 in the same time (no timing oracle).
                void this.sendEmail(member.email, 'Manage your Tails Club membership', portalEmailHtml(link))
                    .then(sent => {
                        if (!sent) this.logger.warn('club: portal email not sent');
                    })
                    .catch(() => this.logger.warn('club: portal email not sent'));
            }
        }
        return { sent: true };
    }

    /** GET /club/portal/open?t=: a fresh portal session URL for a valid `open` token, else null. */
    async openPortal(t: unknown, now: Date = new Date()): Promise<string | null> {
        const cfg = this.config();
        if (!cfg.secretKeyMode || !cfg.tokenSecret) return null;
        const token = verifyClubToken(t, cfg.tokenSecret, 'open', now.getTime());
        if (!token) return null;
        try {
            return await this.portalUrl(token.cus!);
        } catch {
            return null;
        }
    }

    private async portalUrl(customer: string): Promise<string> {
        try {
            const session = await this.stripe.billingPortal.sessions.create({ customer, return_url: CLUB_RETURN_URL });
            return session.url;
        } catch (error) {
            this.logger.warn(`club: portal session not created: ${(error as Error)?.message}`);
            throw CLUB_ERRORS.stripe();
        }
    }

    // ------------------------------------------------------------------ account

    /**
     * GET /club/me: the signed-in player's active membership, matched by user id or, only when the account's
     * email is verified, by its canonical email. A match by email links the row to the account (userId).
     */
    async me(user: any): Promise<{ club: { plan: string; until: string | null } | null }> {
        const userId = user?._id ? String(user._id) : '';
        if (!userId) return { club: null };
        const verifiedEmail = user.emailVerifiedAt ? user.emailCanonical || canonicalEmail(user.email) : null;
        const or: Record<string, unknown>[] = [{ userId }];
        if (verifiedEmail) or.push({ emailCanonical: verifiedEmail });
        const member: any = await this.members
            .findOne({ $or: or, subStatus: { $in: CLUB_ACTIVE_STATUSES } })
            .sort({ periodEnd: -1 })
            .lean();
        if (!member) return { club: null };
        if (!member.userId && verifiedEmail && member.emailCanonical === verifiedEmail) {
            await this.members.updateOne({ _id: member._id, userId: { $exists: false } }, { $set: { userId } });
        }
        return {
            club: { plan: member.plan, until: member.periodEnd ? new Date(member.periodEnd).toISOString() : null },
        };
    }
}
