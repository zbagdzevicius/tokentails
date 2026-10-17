import { Injectable } from '@nestjs/common';
import { InjectThrottlerStorage, ThrottlerStorage } from '@nestjs/throttler';
import { createHash, randomBytes } from 'crypto';
import { escapeHtml, FetchLike } from 'src/badcat/badcat-email';
import { normalizeEmail } from 'src/badcat/badcat-util';
import { isPawlegendsSku, PawlegendsEntitlementResponse, PawlegendsSku } from './pawlegends.contracts';
import { PAWLEGENDS_ERRORS } from './pawlegends.errors';
import { PawlegendsStore } from './pawlegends.schema';
import {
    Env,
    pawlegendsDevLinksAllowed,
    pawlegendsEmailReady,
    pawlegendsEntitlementSecret,
    pawlegendsPublicUrl,
} from './pawlegends-env';
import { isDeviceId, PawlegendsIdentity, identityClauses } from './pawlegends-stripe.service';
import {
    PAWLEGENDS_TOKEN_TTL_MS,
    PawlegendsTokenPayload,
    signPawlegendsToken,
    verifyPawlegendsToken,
} from './pawlegends-token';

/*
 * Entitlements, restore by email and the "Legends Pass: notify me" list (POC.md §8.2 steps 5 and 6, §8.7).
 *
 * - After Checkout the host has the session id (Stripe's return URL): `GET /pawlegends/entitlements?sessionId=`
 *   answers a token for the purchases of that session's device. Later the host refreshes it with the token itself.
 * - `POST /pawlegends/restore { email }` mails a single-use 30-minute link; `/restore/verify { t }` answers a token
 *   that speaks for every purchase of the email (`ev: 1`).
 * - Notify-me is double opt-in: the sign-up mails a confirmation link; only confirmed addresses are on the list.
 */

export const RESTORE_TTL_MS = 30 * 60 * 1000;
/** At most this many restore or notify emails per address and hour (the per-IP limit is in the controller). */
export const EMAIL_LIMIT = { limit: 3, ttl: 60 * 60 * 1000 };
/** A refreshed token may be this long past its expiry (the identity, not the items, is what counts). */
export const REFRESH_GRACE_MS = 365 * 24 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const RAW_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const SESSION_ID = /^cs_[A-Za-z0-9_]{8,200}$/;

const frame = (body: string) =>
    `<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">` +
    `<div style="max-width: 560px; margin: 0 auto; padding: 20px;">${body}` +
    `<p style="margin-top: 28px; color: #777; font-size: 13px;">Pawlegends by Token Tails.</p></div></body></html>`;

const button = (link: string, label: string) =>
    `<p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(link)}" ` +
    `style="background:#7b2cbf;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;">${label}</a></p>`;

export const restoreEmailHtml = (link: string) =>
    frame(
        `<h2>Your Pawlegends items, back where they belong</h2>` +
            `<p>Tap the button within 30 minutes to restore your items in this browser.</p>` +
            button(link, 'Restore my items') +
            `<p style="font-size:13px;color:#777;">Did not ask for this? Ignore it: nothing changes.</p>`
    );

export const notifyEmailHtml = (link: string) =>
    frame(
        `<h2>One tap to join the Legends Pass list</h2>` +
            `<p>Confirm and we will email you once, when the Legends Pass opens.</p>` +
            button(link, 'Yes, tell me') +
            `<p style="font-size:13px;color:#777;">Did not sign up? Ignore it: you will not hear from us.</p>`
    );

@Injectable()
export class PawlegendsAccountService {
    now: () => Date = () => new Date();
    /** Replaceable in specs. */
    fetchImpl: FetchLike = (url, init) => fetch(url, init);

    constructor(
        private readonly store: PawlegendsStore,
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage
    ) {}

    secret(env: Env = process.env): string {
        const secret = pawlegendsEntitlementSecret(env);
        if (!secret) throw PAWLEGENDS_ERRORS.secretMissing();
        return secret;
    }

    /** The token payload if valid (expired ones within `graceMs`), else null. */
    readToken(token: unknown, env: Env = process.env, graceMs = 0): PawlegendsTokenPayload | null {
        const secret = pawlegendsEntitlementSecret(env);
        return secret ? verifyPawlegendsToken(token, secret, this.now().getTime(), graceMs) : null;
    }

    /** The identity a token speaks for. */
    identityOfToken(payload: PawlegendsTokenPayload | null): PawlegendsIdentity {
        if (!payload) return {};
        return {
            email: payload.ev === 1 ? payload.email : undefined,
            sessionIds: (payload.sids || []).slice(0, 200),
            deviceId: (payload.dids || []).find(isDeviceId),
        };
    }

    /** Signs a token over every paid purchase matching `identity`. */
    async issue(
        identity: PawlegendsIdentity,
        env: Env,
        verifiedEmail?: string
    ): Promise<PawlegendsEntitlementResponse> {
        const secret = this.secret(env);
        const clauses = identityClauses(identity);
        // Paid rows, and rows refunded under the presale terms (their items delivered now stay; GDD §8.3).
        const rows = clauses.length
            ? ((await this.store.purchases
                  .find({
                      $and: [
                          { $or: [{ status: 'paid' }, { status: 'refunded', termsRefund: true }] },
                          { $or: clauses },
                      ],
                  })
                  .lean()) as any[])
            : [];
        const items = [...new Set(rows.flatMap(row => (Array.isArray(row.items) ? row.items : [])))].sort();
        const skus = [
            ...new Set(
                rows
                    .filter(row => row.status === 'paid')
                    .map(row => row.sku)
                    .filter(isPawlegendsSku)
            ),
        ].sort() as PawlegendsSku[];
        const dids = [...new Set([identity.deviceId, ...rows.map(row => row.deviceId)].filter(isDeviceId))].slice(
            0,
            20
        );
        const payload: PawlegendsTokenPayload = {
            items,
            skus,
            expiresAt: this.now().getTime() + PAWLEGENDS_TOKEN_TTL_MS,
            sids: [...new Set(rows.map(row => String(row.sessionId)))].slice(0, 200),
            ...(dids.length ? { dids } : {}),
            ...(verifiedEmail ? { email: verifiedEmail, ev: 1 as const } : {}),
        };
        return { token: signPawlegendsToken(payload, secret), items, skus, expiresAt: payload.expiresAt };
    }

    /** GET /pawlegends/entitlements: from a Checkout session id, or by refreshing a token. */
    async entitlements(
        query: { sessionId?: string; token?: string },
        env: Env = process.env
    ): Promise<PawlegendsEntitlementResponse> {
        this.secret(env);
        if (query.token !== undefined) {
            const payload = this.readToken(query.token, env, REFRESH_GRACE_MS);
            if (!payload) throw PAWLEGENDS_ERRORS.badToken();
            return this.issue(this.identityOfToken(payload), env, payload.ev === 1 ? payload.email : undefined);
        }
        if (typeof query.sessionId !== 'string' || !SESSION_ID.test(query.sessionId)) {
            throw PAWLEGENDS_ERRORS.invalid('sessionId or token is required');
        }
        const row = (await this.store.purchases.findOne({ sessionId: query.sessionId }).lean()) as any;
        if (!row) throw PAWLEGENDS_ERRORS.notFound();
        // Pending (the webhook has not arrived yet): the host polls again; the token lists nothing yet.
        return this.issue({ sessionIds: [query.sessionId], deviceId: row.deviceId }, env);
    }

    /**
     * Restore and notify send an email; without SENDGRID_API_KEY they answer 503 (the host hides both forms when
     * GET /pawlegends/status says `email: false`), never a silent `ok`. Local testing: PAWLEGENDS_DEV_LINKS=true.
     */
    private emailOrDevLinks(env: Env): void {
        if (!pawlegendsEmailReady(env) && !pawlegendsDevLinksAllowed(env)) throw PAWLEGENDS_ERRORS.emailUnavailable();
    }

    private async underEmailLimit(scope: string, email: string): Promise<boolean> {
        const { totalHits } = await this.storage.increment(`${scope}:${sha256(email)}`, EMAIL_LIMIT.ttl);
        return totalHits <= EMAIL_LIMIT.limit;
    }

    private async send(to: string, subject: string, html: string): Promise<boolean> {
        const key = process.env.SENDGRID_API_KEY;
        if (!key) return false;
        try {
            const res = await this.fetchImpl('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    personalizations: [{ to: [{ email: to }], subject }],
                    from: { email: process.env.SENDGRID_FROM_EMAIL || 'hello@tokentails.com', name: 'Pawlegends' },
                    content: [{ type: 'text/html', value: html }],
                }),
            });
            return res.ok;
        } catch (error) {
            console.error('Pawlegends email failed:', (error as Error)?.message);
            return false;
        }
    }

    /**
     * POST /pawlegends/restore: the same answer whether or not the email bought anything. The link is mailed only
     * when SendGrid is configured and the address has a purchase; `devLink` only with PAWLEGENDS_DEV_LINKS=true
     * outside production.
     */
    async restore(rawEmail: unknown, env: Env = process.env): Promise<{ ok: boolean; devLink?: string }> {
        this.secret(env);
        this.emailOrDevLinks(env);
        const email = normalizeEmail(rawEmail);
        if (!email) throw PAWLEGENDS_ERRORS.invalid('email is not valid');
        if (!(await this.underEmailLimit('pawlegends-restore-email', email))) return { ok: true };
        const raw = randomBytes(24).toString('base64url');
        await this.store.restoreTokens.create({
            tokenHash: sha256(raw),
            email,
            expiresAt: new Date(this.now().getTime() + RESTORE_TTL_MS),
        });
        const link = `${pawlegendsPublicUrl(env)}/pawlegends?restore=${raw}`;
        if (pawlegendsEmailReady(env)) {
            if (await this.store.purchases.findOne({ email, status: 'paid' }).lean()) {
                await this.send(email, 'Restore your Pawlegends items', restoreEmailHtml(link));
            }
            return { ok: true };
        }
        return pawlegendsDevLinksAllowed(env) ? { ok: true, devLink: link } : { ok: true };
    }

    /** POST /pawlegends/restore/verify { t }: single use, 30 minutes. */
    async verifyRestore(raw: unknown, env: Env = process.env): Promise<PawlegendsEntitlementResponse> {
        this.secret(env);
        if (typeof raw !== 'string' || !RAW_TOKEN.test(raw)) throw PAWLEGENDS_ERRORS.badToken();
        const now = this.now();
        const row = (await this.store.restoreTokens
            .findOneAndUpdate(
                { tokenHash: sha256(raw), usedAt: null, expiresAt: { $gt: now } },
                { $set: { usedAt: now } },
                { new: true }
            )
            .lean()) as any;
        if (!row) throw PAWLEGENDS_ERRORS.badToken();
        return this.issue({ email: row.email }, env, row.email);
    }

    /**
     * POST /pawlegends/notify { email, source }: double opt-in. Answers the same whether or not the address is new;
     * a confirmed address is not mailed again.
     */
    async notify(
        rawEmail: unknown,
        source: unknown,
        env: Env = process.env
    ): Promise<{ ok: boolean; devLink?: string }> {
        this.emailOrDevLinks(env);
        const email = normalizeEmail(rawEmail);
        if (!email) throw PAWLEGENDS_ERRORS.invalid('email is not valid');
        const existing = (await this.store.notify.findOne({ email }).lean()) as any;
        if (existing?.confirmedAt) return { ok: true };
        if (!(await this.underEmailLimit('pawlegends-notify-email', email))) return { ok: true };
        const raw = randomBytes(24).toString('base64url');
        await this.store.notify.updateOne(
            { email },
            {
                $set: { tokenHash: sha256(raw) },
                $setOnInsert: { source: source === 'store' ? 'store' : 'results' },
            },
            { upsert: true }
        );
        const link = `${pawlegendsPublicUrl(env)}/pawlegends?notify=${raw}`;
        if (pawlegendsEmailReady(env)) {
            await this.send(email, 'Confirm: Legends Pass news', notifyEmailHtml(link));
            return { ok: true };
        }
        return pawlegendsDevLinksAllowed(env) ? { ok: true, devLink: link } : { ok: true };
    }

    /** POST /pawlegends/notify/confirm { t }. */
    async confirmNotify(raw: unknown): Promise<{ ok: boolean }> {
        if (typeof raw !== 'string' || !RAW_TOKEN.test(raw)) throw PAWLEGENDS_ERRORS.badToken();
        const row = (await this.store.notify
            .findOneAndUpdate({ tokenHash: sha256(raw) }, { $set: { confirmedAt: this.now() } }, { new: true })
            .lean()) as any;
        if (!row) throw PAWLEGENDS_ERRORS.badToken();
        return { ok: true };
    }
}
