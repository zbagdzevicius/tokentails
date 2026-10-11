import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { guestSessionRequired } from 'src/common/guards/auth-errors';
import { clientIp } from 'src/shared/client-ip';
import { verifyAppCheckToken } from 'src/user/guest/app-check';
import { firebaseIdentity, IFirebaseIdentity } from 'src/user/guest/firebase-identity';
import { YOURCAT_ERRORS } from 'src/yourcat/yourcat.errors';
import { AiBudgetService, AiTicket, envNumber, utcDay } from './ai-budget.service';
import { AiKind } from './ai-cost';

/*
 * Admission for paid AI calls (bet #3, docs/plans/yourcat-v2.md section 3.1). Used by `POST /yourcat`
 * (kind `yourcat`) and by `POST /image/portrait` and its regenerate (kind `portrait-preview`). The layers,
 * in order: identity, client IP, App Check, per-IP daily quota, per-IP failure cap, per-user daily quota,
 * global budget reservation. Any refusal returns before the photo is processed, and every slot this call
 * already claimed is given back first, so an honest visitor never loses an attempt to a later refusal.
 */

export const APP_CHECK_HEADER = 'x-firebase-appcheck';

interface IKindLimits {
    ipVerified: number;
    ipUnverified: number;
    failures: number;
    user: number;
    enforceAppCheck: boolean;
}

/**
 * The one bucket every unprovable preview address shares in production. Keying those requests on the raw
 * `cf-connecting-ip` let a forger mint a fresh per-IP slot per request; one shared key caps them all.
 */
export const UNTRUSTED_IP_BUCKET = 'untrusted';

/** Previews per day for the shared untrusted bucket and its failure cap (production, no proven IP). */
export function untrustedPreviewLimits(env: NodeJS.ProcessEnv = process.env): { daily: number; failures: number } {
    return {
        daily: envNumber('AI_PREVIEW_UNTRUSTED_DAILY', 5, env),
        failures: envNumber('AI_PREVIEW_UNTRUSTED_FAILURES_DAILY', 20, env),
    };
}

export function kindLimits(kind: AiKind, env: NodeJS.ProcessEnv = process.env): IKindLimits {
    const failures = envNumber('AI_UPLOAD_IP_FAILURES_DAILY', 5, env);
    if (kind === 'portrait-preview') {
        return {
            ipVerified: envNumber('AI_PREVIEW_IP_DAILY', 3, env),
            ipUnverified: envNumber('AI_PREVIEW_IP_DAILY_UNVERIFIED', 1, env),
            failures,
            user: envNumber('AI_PREVIEW_USER_DAILY', 3, env),
            enforceAppCheck: env.AI_PREVIEW_APPCHECK_ENFORCE === 'true',
        };
    }
    return {
        ipVerified: envNumber('AI_UPLOAD_IP_DAILY', 3, env),
        ipUnverified: envNumber('AI_UPLOAD_IP_DAILY_UNVERIFIED', 0, env),
        failures,
        user: envNumber('AI_UPLOAD_USER_DAILY', 3, env),
        enforceAppCheck: env.AI_UPLOAD_APPCHECK_ENFORCE === 'true',
    };
}

export const isProduction = (env: NodeJS.ProcessEnv = process.env) => env.NODE_ENV === 'production';

/** The HMAC salt for the per-IP day key; null in production when neither secret is set. */
export function ipSalt(env: NodeJS.ProcessEnv = process.env): string | null {
    const configured = env.AI_UPLOAD_IP_SALT || env.INVALIDATE_CACHE_SECRET;
    if (configured) {
        return configured;
    }
    return isProduction(env) ? null : 'tt-dev-ai-upload-salt';
}

/** First 32 hex chars of HMAC-SHA256(salt, "<UTC day>|<ip key>"): no raw address is stored. */
export function ipDayKey(salt: string, day: string, ipKey: string): string {
    return createHmac('sha256', salt).update(`${day}|${ipKey}`).digest('hex').slice(0, 32);
}

export const quotaId = (kind: AiKind, scope: 'ip' | 'user' | 'fail', key: string, day: string) =>
    `${kind}:${scope}:${key}:${day}`;

@Injectable()
export class AiUploadGate {
    /** The Firebase adapter (App Check), replaceable in specs. */
    firebase: Pick<IFirebaseIdentity, 'verifyAppCheck' | 'verifyAppCheckConsuming'> = firebaseIdentity;

    constructor(private readonly budget: AiBudgetService) {}

    /** Admits one paid AI call of `kind` for `user`, or throws the first refusal. */
    async admit(req: any, user: IAuthUser, kind: Exclude<AiKind, 'manual'>, env = process.env): Promise<AiTicket> {
        // 1. Identity: transient guests never reach the AI.
        if (!user?._id || user.transient) {
            throw guestSessionRequired();
        }
        const day = utcDay(this.budget.now());
        const limits = kindLimits(kind, env);

        // 2. Client IP.
        const ip = clientIp(req, env);
        if (!ip) {
            throw YOURCAT_ERRORS.noClientIp();
        }
        if (kind === 'yourcat' && isProduction(env) && !ip.trusted) {
            // A forged `cf-connecting-ip` would otherwise give unlimited per-IP quota.
            throw YOURCAT_ERRORS.noClientIp();
        }
        const salt = ipSalt(env);
        if (!salt) {
            throw YOURCAT_ERRORS.noClientIp();
        }

        // 3. App Check, with replay protection.
        const appCheck = await verifyAppCheckToken(this.firebase, req?.headers?.[APP_CHECK_HEADER], {
            enforce: limits.enforceAppCheck,
            consume: true,
        });
        if (limits.enforceAppCheck && appCheck !== 'verified') {
            throw appCheck === 'missing' ? YOURCAT_ERRORS.appCheckRequired() : YOURCAT_ERRORS.appCheckInvalid();
        }
        // A preview from an address we cannot prove (production only; `yourcat` refused it above) shares
        // one bucket with every other such request, with its own daily and failure caps.
        const shared = kind === 'portrait-preview' && isProduction(env) && !ip.trusted;
        const verified = appCheck === 'verified' && !shared;
        const untrusted = untrustedPreviewLimits(env);
        const ipLimit = shared ? untrusted.daily : verified ? limits.ipVerified : limits.ipUnverified;
        const failureLimit = shared ? untrusted.failures : limits.failures;

        const ipKey = shared ? UNTRUSTED_IP_BUCKET : ipDayKey(salt, day, ip.key);
        const ticket: AiTicket = {
            kind,
            day,
            reservationMicroEur: 0,
            quotaKeys: [],
            failureKey: quotaId(kind, 'fail', ipKey, day),
        };
        try {
            // 4. Per-IP daily quota.
            const ipQuota = quotaId(kind, 'ip', ipKey, day);
            if (!(await this.budget.claimQuota(ipQuota, ipLimit, day))) {
                throw YOURCAT_ERRORS.ipDailyCap();
            }
            ticket.quotaKeys.push(ipQuota);

            // 5. Per-IP failure cap (read only here; failures are never released).
            if ((await this.budget.quotaCount(ticket.failureKey as string)) >= failureLimit) {
                throw YOURCAT_ERRORS.failureDailyCap();
            }

            // 6. Per-user daily quota.
            const userQuota = quotaId(kind, 'user', String(user._id), day);
            if (!(await this.budget.claimQuota(userQuota, limits.user, day))) {
                throw YOURCAT_ERRORS.userDailyCap();
            }
            ticket.quotaKeys.push(userQuota);

            // 7. Global daily budget.
            const est = this.budget.estimateMicroEur(kind);
            await this.budget.reserve(kind, est, day);
            ticket.reservationMicroEur = est;
        } catch (error) {
            await this.release(ticket);
            throw error;
        }
        return ticket;
    }

    /** `POST /yourcat/manual`: the per-user quota only (no AI, no IP layer, no budget). */
    async admitManual(user: IAuthUser, env = process.env): Promise<void> {
        if (!user?._id || user.transient) {
            throw guestSessionRequired();
        }
        const day = utcDay(this.budget.now());
        const limit = envNumber('AI_MANUAL_USER_DAILY', 5, env);
        if (!(await this.budget.claimQuota(quotaId('manual', 'user', String(user._id), day), limit, day))) {
            throw YOURCAT_ERRORS.userDailyCap();
        }
    }

    /** Gives every claimed attempt back, once. */
    async release(ticket: AiTicket): Promise<void> {
        if (ticket.released) {
            return;
        }
        ticket.released = true;
        for (const key of ticket.quotaKeys) {
            await this.budget.releaseQuota(key);
        }
    }

    /** Counts a failed upload against the address; never released. */
    async recordFailure(ticket: AiTicket): Promise<void> {
        if (ticket.failureKey) {
            await this.budget.addFailure(ticket.failureKey, ticket.day);
        }
    }

    settle(ticket: AiTicket, actualMicro: number): Promise<void> {
        return this.budget.settle(ticket, actualMicro);
    }

    cancel(ticket: AiTicket): Promise<void> {
        return this.budget.cancel(ticket);
    }

    /** A photo we could not use: the attempt back, a failure counted, the reservation cancelled. */
    async refuseBeforeAi(ticket: AiTicket): Promise<void> {
        await this.release(ticket);
        await this.recordFailure(ticket);
        await this.cancel(ticket);
    }

    /** A photo the AI looked at and refused: the attempt back, a failure counted, the cost settled. */
    async refuseAfterAi(ticket: AiTicket, costMicro: number): Promise<void> {
        await this.release(ticket);
        await this.recordFailure(ticket);
        await this.settle(ticket, costMicro);
    }
}
