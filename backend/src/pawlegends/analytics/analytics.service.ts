import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/user/user.schema';
import { pawlegendsError } from '../pawlegends.errors';
import { AnalyticsEnv, analyticsDistinctId, DISTINCT_ID_RE, posthogAdminConfig, posthogConfig } from './analytics-env';
import { cleanProps, ServerEvent, ServerProps } from './analytics-events';
import { AnalyticsSink, setAnalyticsSink } from './analytics-sink';
import { PawlegendsAnalyticsConsent } from './analytics.schema';
import { newUuid, PosthogBatcher, PosthogFetch, stableUuid } from './posthog-batcher';

type AnyModel = any;

/*
 * Server-side analytics for Paw Legends (docs/BACKEND.md "Pawlegends server analytics"). The game, pawlegends.app and
 * the app shell ask the player; the answer reaches `POST /pawlegends/analytics/consent` and is stored per account
 * (`pawlegendsanalytics`). Only then does a server event carry that account, under the same hashed id the clients
 * use (`pl_` + SHA-256 of a Firebase uid of the account, never the uid, email or account id). A denial or withdrawal
 * stops it at once (the cache is updated in the same request; other processes re-read within CACHE_MS) and drops
 * what was waiting. Guests with a guest account consent the same way; a transient guest (no account yet) sends nothing.
 * No token, no events: `POSTHOG_PROJECT_TOKEN` unset is the only off switch.
 */

/** How long a process trusts its cached consent read (another process may have stored a withdrawal). */
export const CONSENT_CACHE_MS = 60_000;
const CACHE_MAX = 20_000;
const VERSION_RE = /^[A-Za-z0-9_.-]{1,24}$/;

export interface ConsentView {
    granted: boolean;
    /** The hashed analytics id while granted (the clients may identify with it), else null. */
    distinctId: string | null;
    /** Server events are sent at all (a project token is set). */
    configured: boolean;
}

export interface AnalyticsServiceOptions {
    env?: AnalyticsEnv;
    fetch?: PosthogFetch;
    now?: () => number;
    flushMs?: number;
}

const ANALYTICS_ERRORS = {
    invalid: (field: string) =>
        pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_ANALYTICS_INVALID', `${field} is not valid`),
    noIdentity: () =>
        pawlegendsError(
            HttpStatus.CONFLICT,
            'PAWLEGENDS_ANALYTICS_NO_IDENTITY',
            'The account has no sign-in to key it'
        ),
};

@Injectable()
export class PawlegendsAnalyticsService implements AnalyticsSink, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger('PawlegendsAnalytics');
    readonly batcher: PosthogBatcher | null;
    private readonly cache = new Map<string, { id: string | null; until: number }>();
    private readonly env: AnalyticsEnv;
    private readonly fetchImpl: PosthogFetch;
    private readonly now: () => number;

    constructor(
        @InjectModel(PawlegendsAnalyticsConsent.name) readonly consents: AnyModel,
        @InjectModel(User.name) readonly users: AnyModel,
        @Optional() options?: AnalyticsServiceOptions
    ) {
        this.env = options?.env ?? process.env;
        this.now = options?.now ?? (() => Date.now());
        this.fetchImpl = options?.fetch ?? ((url, init) => (globalThis as any).fetch(url, init));
        const config = posthogConfig(this.env);
        this.batcher = config
            ? new PosthogBatcher({
                  ...config,
                  fetch: this.fetchImpl,
                  now: this.now,
                  flushMs: options?.flushMs,
                  log: this.logger,
              })
            : null;
    }

    onModuleInit(): void {
        setAnalyticsSink(this);
    }

    async onModuleDestroy(): Promise<void> {
        setAnalyticsSink(null);
        await this.batcher?.close();
    }

    // -----------------------------------------------------------------------------------------------------------
    // Consent

    private remember(accountId: string, id: string | null): void {
        if (this.cache.size >= CACHE_MAX) this.cache.clear();
        this.cache.set(accountId, { id, until: this.now() + CONSENT_CACHE_MS });
    }

    /** The account's analytics id while it consents, else null. */
    async consentedId(accountId: string): Promise<string | null> {
        const hit = this.cache.get(accountId);
        if (hit && hit.until > this.now()) return hit.id;
        const row = (await this.consents.findById(accountId).lean()) as PawlegendsAnalyticsConsent | null;
        const id = row?.granted && typeof row.id === 'string' && DISTINCT_ID_RE.test(row.id) ? row.id : null;
        this.remember(accountId, id);
        return id;
    }

    /** GET /pawlegends/analytics/consent. */
    async state(accountId: string): Promise<ConsentView & { at: string | null; version: string | null }> {
        const row = (await this.consents.findById(accountId).lean()) as PawlegendsAnalyticsConsent | null;
        return {
            granted: !!row?.granted,
            distinctId: row?.granted ? row.id ?? null : null,
            configured: !!this.batcher,
            at: row?.at ? new Date(row.at).toISOString() : null,
            version: row?.v ?? null,
        };
    }

    /**
     * POST /pawlegends/analytics/consent `{granted, distinctId?, version?}`. `distinctId` is the id the client already
     * uses; it is kept only when it is the hash of one of this account's own uids (else the first uid's hash), so a
     * client can never file events under someone else's id.
     */
    async setConsent(
        accountId: string,
        body: { granted?: unknown; distinctId?: unknown; version?: unknown }
    ): Promise<ConsentView> {
        if (typeof body?.granted !== 'boolean') throw ANALYTICS_ERRORS.invalid('granted');
        if (
            body.version !== undefined &&
            body.version !== null &&
            !(typeof body.version === 'string' && VERSION_RE.test(body.version))
        )
            throw ANALYTICS_ERRORS.invalid('version');
        if (
            body.distinctId !== undefined &&
            body.distinctId !== null &&
            !(typeof body.distinctId === 'string' && DISTINCT_ID_RE.test(body.distinctId))
        )
            throw ANALYTICS_ERRORS.invalid('distinctId');
        const at = new Date(this.now());
        const v = typeof body.version === 'string' ? body.version : null;
        if (!body.granted) {
            const old = (await this.consents.findById(accountId).lean()) as PawlegendsAnalyticsConsent | null;
            await this.consents.updateOne(
                { _id: accountId },
                { $set: { granted: false, id: null, v, at } },
                { upsert: true }
            );
            this.remember(accountId, null);
            if (old?.id) this.batcher?.drop(old.id);
            return { granted: false, distinctId: null, configured: !!this.batcher };
        }
        const user = (await this.users.findOne({ _id: accountId }, { firebaseUids: 1 }).lean()) as {
            firebaseUids?: unknown;
        } | null;
        const uids = Array.isArray(user?.firebaseUids)
            ? (user!.firebaseUids as unknown[]).filter((u): u is string => typeof u === 'string' && !!u)
            : [];
        const ids = uids.map(analyticsDistinctId);
        if (!ids.length) throw ANALYTICS_ERRORS.noIdentity();
        const id = typeof body.distinctId === 'string' && ids.includes(body.distinctId) ? body.distinctId : ids[0];
        await this.consents.updateOne({ _id: accountId }, { $set: { granted: true, id, v, at } }, { upsert: true });
        this.remember(accountId, id);
        return { granted: true, distinctId: id, configured: !!this.batcher };
    }

    // -----------------------------------------------------------------------------------------------------------
    // Events

    private base(event: ServerEvent, props: ServerProps): Record<string, unknown> {
        return {
            ...cleanProps(event, props),
            $lib: 'pawlegends-server',
            source: 'server',
            // the request comes from our server: its address says nothing about the player
            $geoip_disable: true,
        };
    }

    async track(accountId: string, event: ServerEvent, props: ServerProps, key?: string): Promise<void> {
        if (!this.batcher || !accountId) return;
        const id = await this.consentedId(accountId);
        if (!id) return;
        this.batcher.enqueue({
            event,
            distinct_id: id,
            properties: { ...this.base(event, props), distinct_id: id },
            timestamp: new Date(this.now()).toISOString(),
            uuid: key ? stableUuid(`${event}:${id}:${key}`) : newUuid(),
        });
    }

    async trackOrCount(accountId: string | null, event: ServerEvent, props: ServerProps, key?: string): Promise<void> {
        if (!this.batcher) return;
        const id = accountId ? await this.consentedId(accountId) : null;
        if (id) return this.track(accountId!, event, props, key);
        return this.anonymous(event, props, key);
    }

    async anonymous(event: ServerEvent, props: ServerProps, key?: string): Promise<void> {
        if (!this.batcher) return;
        const id = `srv_${newUuid()}`;
        this.batcher.enqueue({
            event,
            distinct_id: id,
            properties: { ...this.base(event, props), distinct_id: id, $process_person_profile: false },
            timestamp: new Date(this.now()).toISOString(),
            uuid: key ? stableUuid(`${event}:anon:${key}`) : newUuid(),
        });
    }

    /**
     * Account deletion: every analytics id of the account (the stored one and the hash of each uid it still has) loses
     * its waiting events and, with `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID`, its PostHog person and events;
     * then the consent row goes. Never throws.
     */
    async forget(accountId: string): Promise<void> {
        try {
            const row = (await this.consents.findById(accountId).lean()) as PawlegendsAnalyticsConsent | null;
            const user = (await this.users.findOne({ _id: accountId }, { firebaseUids: 1 }).lean()) as {
                firebaseUids?: unknown;
            } | null;
            const ids = new Set<string>();
            if (row?.id) ids.add(row.id);
            if (Array.isArray(user?.firebaseUids))
                for (const u of user!.firebaseUids as unknown[])
                    if (typeof u === 'string' && u) ids.add(analyticsDistinctId(u));
            for (const id of ids) this.batcher?.drop(id);
            this.remember(accountId, null);
            // a person exists in PostHog only for an account that consented at some point
            if (row) await this.deletePersons([...ids]);
            await this.consents.deleteOne({ _id: accountId });
        } catch (error) {
            this.logger.warn(`analytics forget failed: ${String((error as Error)?.message || error).slice(0, 200)}`);
        }
    }

    private async deletePersons(distinctIds: string[]): Promise<void> {
        const admin = posthogAdminConfig(this.env);
        if (!admin || !distinctIds.length) return;
        try {
            const res = await this.fetchImpl(`${admin.host}/api/projects/${admin.projectId}/persons/bulk_delete/`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.key}` },
                body: JSON.stringify({ distinct_ids: distinctIds, delete_events: true }),
            });
            if (!res.ok) this.logger.warn(`posthog person delete answered ${res.status}`);
        } catch (error) {
            this.logger.warn(
                `posthog person delete failed: ${String((error as Error)?.message || error).slice(0, 200)}`
            );
        }
    }
}
