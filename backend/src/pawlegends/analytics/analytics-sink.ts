import type { ServerEvent, ServerProps } from './analytics-events';

/*
 * The one way other services report a server-side analytics event (docs/BACKEND.md "Pawlegends server analytics").
 * PawlegendsAnalyticsService registers itself when Nest starts it; without it (tests, the relay process) these are
 * no-ops. They never throw and never wait: analytics is never part of the action it describes. The service checks the
 * account's stored consent and drops the event without it.
 */

export interface AnalyticsSink {
    /** An event of a consenting account. `key` makes a retried fact one event (the match id, the session id). */
    track(accountId: string, event: ServerEvent, props: ServerProps, key?: string): Promise<void>;
    /** A count with no person (a random id each). */
    anonymous(event: ServerEvent, props: ServerProps, key?: string): Promise<void>;
    /** Under the account when it consented, else as an anonymous count: totals (revenue) never depend on consent. */
    trackOrCount(accountId: string | null, event: ServerEvent, props: ServerProps, key?: string): Promise<void>;
    /** Account deletion: the consent row, waiting events and (when configured) the PostHog person go. */
    forget(accountId: string): Promise<void>;
}

let sink: AnalyticsSink | null = null;

/** PawlegendsAnalyticsService.onModuleInit; tests pass null to reset. */
export function setAnalyticsSink(s: AnalyticsSink | null): void {
    sink = s;
}

export function serverTrack(
    accountId: string | null | undefined,
    event: ServerEvent,
    props: ServerProps,
    key?: string
): void {
    if (!sink || !accountId) return;
    try {
        void sink.track(String(accountId), event, props, key).catch(() => undefined);
    } catch {
        // analytics never fails its caller
    }
}

export function serverTrackAnonymous(event: ServerEvent, props: ServerProps, key?: string): void {
    if (!sink) return;
    try {
        void sink.anonymous(event, props, key).catch(() => undefined);
    } catch {
        // analytics never fails its caller
    }
}

export function serverTrackOrCount(
    accountId: string | null | undefined,
    event: ServerEvent,
    props: ServerProps,
    key?: string
): void {
    if (!sink) return;
    try {
        void sink.trackOrCount(accountId ? String(accountId) : null, event, props, key).catch(() => undefined);
    } catch {
        // analytics never fails its caller
    }
}

/** Awaited by account deletion (it reads the stored id before the row goes); never throws. */
export async function serverForget(accountId: string | null | undefined): Promise<void> {
    if (!sink || !accountId) return;
    try {
        await sink.forget(String(accountId));
    } catch {
        // deletion never fails on analytics
    }
}
