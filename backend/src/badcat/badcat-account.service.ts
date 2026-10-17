import { Injectable } from '@nestjs/common';
import { InjectThrottlerStorage, ThrottlerStorage } from '@nestjs/throttler';
import { createHash, randomBytes } from 'crypto';
import {
    BadcatSku,
    CheckoutCompletion,
    CLUB_LIMITS,
    CLUB_SKUS,
    ENTITLEMENT_TTL_MS,
    EntitlementResponse,
    Entitlements,
    FREE_LIMITS,
    OWNED_SKUS,
    RedeemRequest,
    RedeemResponse,
} from './badcat.contracts';
import { BADCAT_ERRORS } from './badcat.errors';
import { FetchLike, restoreEmailHtml, sendBadcatEmail } from './badcat-email';
import {
    badcatEntitlementSecret,
    badcatFlags,
    badcatPublicUrl,
    Env,
    restoreDevLinkAllowed,
    sendgridConfigured,
} from './badcat-flags';
import { BadcatStore } from './badcat.schema';
import { BadcatStripeService, MAX_BOOK_AHEAD_DAYS } from './badcat-stripe.service';
import { signEntitlements, TokenClaims, verifyEntitlementToken } from './badcat-token';
import { addMonths, bookableDays, dayNoOf, filterName, isCatCode, isInt, normalizeEmail } from './badcat-util';

/*
 * Entitlements by email (GDD 10): Stripe is the source of truth (the webhook mirrors it into
 * `badcatpurchases`), the signed token is only a cache on the device. No accounts.
 *
 * Two kinds of token:
 * - verified (`ev: 1`): issued only after the restore magic link proved the email. Its entitlements merge
 *   every purchase and redeemed gift of that email; the portal, the Club cat and face uploads trust it.
 * - scoped (`sids`): issued by the thanks page (a Checkout Session id) and by a gift redeem. The email in it
 *   was typed by the buyer and is never trusted: its entitlements come only from the purchases and gifts it
 *   names, the portal opens only those purchases' customers, and a face upload only reaches those cameos.
 */

export const ACTIVE_SUB_STATUSES = ['active', 'trialing', 'past_due'];
export const RESTORE_TTL_MS = 30 * 60 * 1000;
/** Refresh and the portal accept a token up to a year after it expired: they read the identity, not the perks. */
export const IDENTITY_GRACE_MS = 365 * 24 * 60 * 60 * 1000;
/** A Checkout Session id is a bearer secret on the thanks page for this long after the purchase. */
export const COMPLETION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const RESTORE_EMAIL_LIMIT = { limit: 3, ttl: 60 * 60 * 1000 };
export const GIFT_CLUB_MONTHS = 3;
export const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]{8,200}$/;
export const GIFT_CODE_PATTERN = /^[A-Z2-9]{10}$/;
/** A scoped token names at most this many purchases (oldest dropped). */
export const MAX_TOKEN_SCOPE = 40;
export const GIFT_SCOPE_PREFIX = 'gift:';

/** The caller of a token: its email, whether a magic link verified it, and its purchase scope. */
export interface TokenIdentity {
    email: string;
    verified: boolean;
    sids: string[];
}

const mergeScope = (...lists: (string[] | undefined)[]): string[] => {
    const all = [...new Set(lists.flatMap(list => list || []))].filter(
        sid => typeof sid === 'string' && sid.length <= 220
    );
    return all.slice(Math.max(0, all.length - MAX_TOKEN_SCOPE));
};

const PLAN_OF: Partial<Record<BadcatSku, Entitlements['plan']>> = {
    club_monthly: 'monthly',
    club_annual: 'annual',
    founding: 'founding',
};
const PLAN_RANK: Record<string, number> = { founding: 3, annual: 2, monthly: 1, gift: 0 };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function freeEntitlements(now: number, email?: string): Entitlements {
    return {
        club: false,
        skus: [],
        cosmetics: [],
        ...FREE_LIMITS,
        expiresAt: now + ENTITLEMENT_TTL_MS,
        ...(email ? { email } : {}),
        source: 'server',
    };
}

@Injectable()
export class BadcatAccountService {
    now: () => Date = () => new Date();
    /** SendGrid transport; specs replace it. */
    fetchImpl?: FetchLike;

    constructor(
        private readonly store: BadcatStore,
        private readonly stripe: BadcatStripeService,
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage
    ) {}

    secret(env: Env = process.env): string {
        const secret = badcatEntitlementSecret(env);
        if (!secret) throw BADCAT_ERRORS.secretMissing();
        return secret;
    }

    /** Emails with Club right now: an active Club subscription, or an unexpired redeemed Club gift. */
    async activeClubEmails(now: Date = this.now()): Promise<Set<string>> {
        const subs = await this.store.purchases
            .find({
                kind: 'subscription',
                sku: { $in: CLUB_SKUS },
                status: 'paid',
                subStatus: { $in: ACTIVE_SUB_STATUSES },
                periodEnd: { $gt: now },
            })
            .lean();
        const gifts = await this.store.gifts.find({ sku: 'gift_club_3m', clubUntil: { $gt: now } }).lean();
        const emails = new Set<string>();
        for (const row of subs as any[]) if (row.email) emails.add(row.email);
        for (const row of gifts as any[]) if (row.redeemedEmail) emails.add(row.redeemedEmail);
        return emails;
    }

    /** Every purchase and gift of an email. Only for a verified email (magic link), never a typed one. */
    async entitlementsFor(email: string | null | undefined, now: Date = this.now()): Promise<Entitlements> {
        const at = now.getTime();
        if (!email) return freeEntitlements(at);
        const purchases = (await this.store.purchases.find({ email }).lean()) as any[];
        const gifts = (await this.store.gifts
            .find({ redeemedEmail: email, sku: 'gift_club_3m', clubUntil: { $gt: now } })
            .lean()) as any[];
        return this.entitlementsOf(email, purchases, gifts, at);
    }

    /** Only the purchases (Checkout Session ids) and redeemed gifts (`gift:<code>`) a scoped token names. */
    async entitlementsForScope(
        email: string | null | undefined,
        sids: string[],
        now: Date = this.now()
    ): Promise<Entitlements> {
        const at = now.getTime();
        const sessionIds = sids.filter(sid => !sid.startsWith(GIFT_SCOPE_PREFIX));
        const codes = sids
            .filter(sid => sid.startsWith(GIFT_SCOPE_PREFIX))
            .map(sid => sid.slice(GIFT_SCOPE_PREFIX.length));
        const purchases = sessionIds.length
            ? ((await this.store.purchases.find({ sessionId: { $in: sessionIds } }).lean()) as any[])
            : [];
        const gifts = codes.length
            ? ((await this.store.gifts
                  .find({ code: { $in: codes }, sku: 'gift_club_3m', clubUntil: { $gt: now } })
                  .lean()) as any[])
            : [];
        return this.entitlementsOf(email || undefined, purchases, gifts, at);
    }

    private entitlementsOf(email: string | undefined, purchases: any[], gifts: any[], at: number): Entitlements {
        let plan: Entitlements['plan'] | undefined;
        let clubUntil = 0;
        for (const row of purchases) {
            const rowPlan = PLAN_OF[row.sku as BadcatSku];
            if (row.kind !== 'subscription' || !rowPlan || row.status !== 'paid') continue;
            const end = row.periodEnd ? new Date(row.periodEnd).getTime() : 0;
            if (!ACTIVE_SUB_STATUSES.includes(row.subStatus) || end <= at) continue;
            if (!plan || PLAN_RANK[rowPlan] > PLAN_RANK[plan]) plan = rowPlan;
            clubUntil = Math.max(clubUntil, end);
        }
        for (const gift of gifts) {
            if (gift.canceledAt) continue;
            const end = new Date(gift.clubUntil).getTime();
            if (end <= at) continue;
            plan = plan || 'gift';
            clubUntil = Math.max(clubUntil, end);
        }
        const skus = [
            ...new Set(
                purchases
                    .filter(row => row.kind === 'one_off' && row.status === 'paid' && OWNED_SKUS.includes(row.sku))
                    .map(row => row.sku as string)
            ),
        ].sort();
        const club = !!plan;
        return {
            club,
            ...(plan ? { plan } : {}),
            skus,
            cosmetics: [],
            ...(club ? CLUB_LIMITS : FREE_LIMITS),
            expiresAt: club ? Math.min(at + ENTITLEMENT_TTL_MS, clubUntil) : at + ENTITLEMENT_TTL_MS,
            ...(email ? { email } : {}),
            source: 'server',
        };
    }

    /** A verified token: only after the restore magic link (or for a token that was already verified). */
    async issue(email: string | null | undefined, env: Env = process.env): Promise<EntitlementResponse> {
        const secret = this.secret(env);
        const entitlements = await this.entitlementsFor(email);
        const claims: TokenClaims = email ? { ev: 1 } : {};
        return { token: signEntitlements(entitlements, secret, claims), entitlements };
    }

    /** A scoped token: the typed email is shown, never trusted (see the header). */
    async issueScoped(
        email: string | null | undefined,
        sids: string[],
        env: Env = process.env
    ): Promise<EntitlementResponse> {
        const secret = this.secret(env);
        const scope = mergeScope(sids);
        const entitlements = await this.entitlementsForScope(email, scope);
        return { token: signEntitlements(entitlements, secret, { sids: scope }), entitlements };
    }

    /** The token's caller (signature checked; `graceMs` past its expiry accepted). */
    caller(token: unknown, env: Env = process.env, graceMs = 0): TokenIdentity {
        const payload = verifyEntitlementToken(token, this.secret(env), { now: this.now().getTime(), graceMs });
        if (!payload) throw BADCAT_ERRORS.badToken();
        const email = normalizeEmail(payload.email) || '';
        const verified = payload.ev === 1 && !!email;
        const sids = Array.isArray(payload.sids) ? mergeScope(payload.sids.filter(sid => typeof sid === 'string')) : [];
        if (!verified && !sids.length) throw BADCAT_ERRORS.badToken();
        return { email, verified, sids };
    }

    /** Re-issues a token of the same kind (verified or scoped), optionally adding purchases to the scope. */
    private reissue(who: TokenIdentity, env: Env, addSids: string[] = [], email?: string) {
        if (who.verified) return this.issue(who.email, env);
        return this.issueScoped(email || who.email, mergeScope(who.sids, addSids), env);
    }

    /**
     * A verified token's email (signature checked; `graceMs` past its expiry accepted). A scoped token
     * (thanks page, gift redeem) is refused: its email was typed, not proved.
     */
    identity(token: unknown, env: Env = process.env, graceMs = 0): string {
        const who = this.caller(token, env, graceMs);
        if (!who.verified) throw BADCAT_ERRORS.badToken();
        return who.email;
    }

    /**
     * POST /badcat/entitlement { sessionId, token? }: the thanks page (pending until the webhook landed). The
     * token it signs is scoped to this purchase (plus the scope of a token the device already held), never
     * to every purchase of the email typed in Checkout.
     */
    async complete(sessionId: unknown, env: Env = process.env, priorToken?: unknown): Promise<CheckoutCompletion> {
        this.secret(env);
        if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
            throw BADCAT_ERRORS.invalid('sessionId is not a Checkout Session id');
        }
        const purchase = (await this.store.purchases.findOne({ sessionId }).lean()) as any;
        if (!purchase) return { ok: false, pending: true };
        if (this.now().getTime() - new Date(purchase.createdAt).getTime() > COMPLETION_WINDOW_MS) {
            return { ok: false, error: 'expired' };
        }
        let prior: TokenIdentity | null = null;
        if (priorToken !== undefined && priorToken !== null && priorToken !== '') {
            try {
                prior = this.caller(priorToken, env, IDENTITY_GRACE_MS);
            } catch {
                prior = null;
            }
        }
        const issued =
            prior?.verified && prior.email === purchase.email
                ? await this.issue(prior.email, env)
                : await this.issueScoped(
                      purchase.email,
                      mergeScope(prior && !prior.verified ? prior.sids : [], [sessionId]),
                      env
                  );
        const completion: CheckoutCompletion = {
            ok: true,
            sku: purchase.sku,
            token: issued.token,
            entitlements: issued.entitlements,
        };
        const gift = (await this.store.gifts.findOne({ sessionId }).lean()) as any;
        if (gift) completion.gift = { code: gift.code, sku: gift.sku };
        const cameo = (await this.store.cameos.findOne({ sessionId }).lean()) as any;
        if (cameo) {
            completion.cameoId = String(cameo._id);
            completion.dayNo = cameo.dayNo;
        }
        return completion;
    }

    /** POST /badcat/entitlement { token }: recomputed from the token's verified email, or from its scope. */
    async refresh(token: unknown, env: Env = process.env): Promise<EntitlementResponse> {
        return this.reissue(this.caller(token, env, IDENTITY_GRACE_MS), env);
    }

    /**
     * POST /badcat/restore: the same answer whether or not the email bought anything. A link is made for
     * every valid email (at most 3 an hour per address); it is emailed only with BADCAT_RESTORE_EMAIL_ENABLED
     * and SendGrid, else returned as `devLink` only when BADCAT_RESTORE_DEV_LINK=true outside production.
     */
    async restore(rawEmail: unknown, env: Env = process.env): Promise<{ ok: boolean; devLink?: string }> {
        this.secret(env);
        const email = normalizeEmail(rawEmail);
        if (!email) throw BADCAT_ERRORS.invalid('email is not valid');
        const { totalHits } = await this.storage.increment(
            `badcat-restore-email:${sha256(email)}`,
            RESTORE_EMAIL_LIMIT.ttl
        );
        if (totalHits > RESTORE_EMAIL_LIMIT.limit) return { ok: true };
        const raw = randomBytes(24).toString('base64url');
        await this.store.restoreTokens.create({
            tokenHash: sha256(raw),
            email,
            expiresAt: new Date(this.now().getTime() + RESTORE_TTL_MS),
        });
        const link = `${badcatPublicUrl(env)}/badcat/restore?t=${raw}`;
        if (badcatFlags(env).restoreEmail && sendgridConfigured(env)) {
            await sendBadcatEmail(
                email,
                'Restore your Bad Cat Daily purchases',
                restoreEmailHtml(link),
                this.fetchImpl
            );
            return { ok: true };
        }
        return restoreDevLinkAllowed(env) ? { ok: true, devLink: link } : { ok: true };
    }

    /** POST /badcat/restore/verify { t }: single use, 30 minutes. */
    async verifyRestore(raw: unknown, env: Env = process.env): Promise<EntitlementResponse> {
        this.secret(env);
        if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(raw)) throw BADCAT_ERRORS.badToken();
        const now = this.now();
        const row = (await this.store.restoreTokens
            .findOneAndUpdate(
                { tokenHash: sha256(raw), usedAt: null, expiresAt: { $gt: now } },
                { $set: { usedAt: now } },
                { new: true }
            )
            .lean()) as any;
        if (!row) throw BADCAT_ERRORS.badToken();
        return this.issue(row.email, env);
    }

    /**
     * POST /badcat/portal { token }: the Stripe customer portal of the token's verified email, or of the
     * purchases a scoped token names (each Checkout makes its own Customer, so that is the buyer's own).
     */
    async portal(token: unknown, env: Env = process.env): Promise<{ url: string }> {
        const who = this.caller(token, env, IDENTITY_GRACE_MS);
        const sessionIds = who.sids.filter(sid => !sid.startsWith(GIFT_SCOPE_PREFIX));
        if (!who.verified && !sessionIds.length) throw BADCAT_ERRORS.noCustomer();
        const filter = who.verified
            ? { email: who.email, customerId: { $exists: true } }
            : { sessionId: { $in: sessionIds }, customerId: { $exists: true } };
        const rows = (await this.store.purchases.find(filter).lean()) as any[];
        const latest = rows
            .filter(row => typeof row.customerId === 'string' && row.customerId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (!latest) throw BADCAT_ERRORS.noCustomer();
        return { url: await this.stripe.portalUrl(latest.customerId, env) };
    }

    /**
     * POST /badcat/redeem. A gift cameo becomes the recipient's cameo; a Club gift is 3 months of Club for
     * the recipient's email (an entitlement, never a subscription). A code redeems once. The email is typed,
     * not proved, so the token returned is scoped to this gift (`gift:<code>`): it never speaks for the email
     * (portal, Club cat, other cameos). The email's own devices pick the gift up after a restore link.
     */
    async redeem(req: RedeemRequest, env: Env = process.env): Promise<RedeemResponse> {
        const email = normalizeEmail(req?.email);
        if (!email) throw BADCAT_ERRORS.invalid('email is not valid');
        const code = typeof req.code === 'string' ? req.code.trim().toUpperCase() : '';
        if (!GIFT_CODE_PATTERN.test(code)) return { ok: false, error: 'unknown_code' };
        const gift = (await this.store.gifts.findOne({ code }).lean()) as any;
        if (!gift) return { ok: false, error: 'unknown_code' };
        if (gift.redeemedAt) return { ok: false, error: 'already_redeemed' };
        if (gift.canceledAt || (await this.purchaseRefunded(gift.sessionId))) return { ok: false, error: 'refunded' };

        const now = this.now();
        let cameoInput: { catCode: string; name: string; dayNo: number } | null = null;
        if (gift.sku === 'gift_cameo') {
            const { min, max } = bookableDays(dayNoOf(now), MAX_BOOK_AHEAD_DAYS);
            if (!isCatCode(req.catCode)) throw BADCAT_ERRORS.invalid('catCode is required');
            if (typeof req.catName !== 'string' || !req.catName.trim())
                throw BADCAT_ERRORS.invalid('catName is required');
            if (!isInt(req.dayNo) || req.dayNo < min || req.dayNo > max) {
                throw BADCAT_ERRORS.invalid(`dayNo must be between ${min} and ${max}`);
            }
            cameoInput = { catCode: req.catCode, name: filterName(req.catName), dayNo: req.dayNo };
        }

        const set: Record<string, unknown> = { redeemedAt: now, redeemedEmail: email };
        if (gift.sku === 'gift_club_3m') set.clubUntil = addMonths(now, GIFT_CLUB_MONTHS);
        const claimed = await this.store.gifts
            .findOneAndUpdate({ code, redeemedAt: null, canceledAt: null }, { $set: set }, { new: true })
            .lean();
        if (!claimed) return { ok: false, error: 'already_redeemed' };

        const response: RedeemResponse = { ok: true, kind: gift.sku === 'gift_cameo' ? 'cameo' : 'club' };
        if (cameoInput) {
            const cameo = await this.store.cameos.create({
                kind: 'gift',
                ...cameoInput,
                email,
                sessionId: `${GIFT_SCOPE_PREFIX}${code}`,
            });
            response.cameoId = String(cameo._id);
            await this.store.gifts.updateOne({ code }, { $set: { cameoId: response.cameoId } });
        }
        if (badcatEntitlementSecret(env)) {
            let prior: TokenIdentity | null = null;
            try {
                prior = req.token ? this.caller(req.token, env, IDENTITY_GRACE_MS) : null;
            } catch {
                prior = null;
            }
            const scope = `${GIFT_SCOPE_PREFIX}${code}`;
            const issued =
                prior?.verified && prior.email === email
                    ? await this.issue(email, env)
                    : await this.issueScoped(
                          email,
                          mergeScope(prior && !prior.verified ? prior.sids : [], [scope]),
                          env
                      );
            response.token = issued.token;
            response.entitlements = issued.entitlements;
        }
        return response;
    }

    /** The purchase of a Checkout Session was refunded (gifts and cameos of it are void). */
    async purchaseRefunded(sessionId: unknown): Promise<boolean> {
        if (typeof sessionId !== 'string' || !sessionId) return false;
        const row = (await this.store.purchases.findOne({ sessionId }).lean()) as any;
        return row?.status === 'refunded';
    }

    /** POST /badcat/club/cat: which cat a Club member shows (weekly cameo, fridge wall, seen email). */
    async setClubCat(
        token: unknown,
        catCode: unknown,
        name: unknown,
        env: Env = process.env
    ): Promise<{ ok: boolean }> {
        const who = this.caller(token, env);
        if (!isCatCode(catCode)) throw BADCAT_ERRORS.invalid('catCode is required');
        const entitlements = who.verified
            ? await this.entitlementsFor(who.email)
            : await this.entitlementsForScope(who.email, who.sids);
        if (!entitlements.club || !who.email) throw BADCAT_ERRORS.notClub();
        const email = who.email;
        if (!who.verified) {
            // A typed email may start a Club cat row, or change one its own purchase started; never another's.
            const row = (await this.store.clubCats.findOne({ email }).lean()) as any;
            if (row && !(row.scope && who.sids.includes(row.scope))) throw BADCAT_ERRORS.forbidden();
            const scope = row?.scope || who.sids[who.sids.length - 1];
            await this.store.clubCats.updateOne(
                { email },
                { $set: { catCode, name: filterName(name), scope } },
                { upsert: true }
            );
            return { ok: true };
        }
        await this.store.clubCats.updateOne(
            { email },
            { $set: { catCode, name: filterName(name) }, $unset: { scope: 1 } },
            { upsert: true }
        );
        return { ok: true };
    }
}
