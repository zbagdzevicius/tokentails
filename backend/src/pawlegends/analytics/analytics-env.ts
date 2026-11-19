import { createHash } from 'crypto';

/*
 * Server-side PostHog for Paw Legends (docs/BACKEND.md "Pawlegends server analytics"). No on/off flag: events are sent
 * only while `POSTHOG_PROJECT_TOKEN` is set (the same public project token the game and pawlegends.app inline as
 * NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN), and per account only after that account's consent. Nothing here reads a file.
 */

export type AnalyticsEnv = Record<string, string | undefined>;

/** PostHog's US ingestion host (the project lives in the US cloud). */
export const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com';
/** PostHog's US app host (the private API: person deletion). */
export const POSTHOG_DEFAULT_API_HOST = 'https://us.posthog.com';

const clean = (v: string | undefined) => (typeof v === 'string' ? v.trim() : '');
const origin = (v: string, fallback: string) => {
    const s = v || fallback;
    return /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(s) ? s.replace(/\/+$/, '') : fallback;
};

/** `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` (default the US host), or null without a token. */
export function posthogConfig(env: AnalyticsEnv = process.env): { token: string; host: string } | null {
    const token = clean(env.POSTHOG_PROJECT_TOKEN);
    if (!token) return null;
    return { token, host: origin(clean(env.POSTHOG_HOST), POSTHOG_DEFAULT_HOST) };
}

/**
 * Optional, for account deletion only: `POSTHOG_PERSONAL_API_KEY` (a secret personal key with person write access) and
 * `POSTHOG_PROJECT_ID`, else null (a deleted account's PostHog person is then removed by hand, docs/BACKEND.md).
 */
export function posthogAdminConfig(
    env: AnalyticsEnv = process.env
): { key: string; projectId: string; host: string } | null {
    const key = clean(env.POSTHOG_PERSONAL_API_KEY);
    const projectId = clean(env.POSTHOG_PROJECT_ID);
    if (!key || !/^\d{1,12}$/.test(projectId)) return null;
    return { key, projectId, host: origin(clean(env.POSTHOG_API_HOST), POSTHOG_DEFAULT_API_HOST) };
}

/**
 * The analytics id of a Firebase uid: `pl_` + the first 32 hex of SHA-256(`pawlegends:<uid>`). The same function as
 * pawlegends-web/analytics/client.ts `accountDistinctId`, so the site, the game and the server name one player alike.
 * Never the raw uid, an email or the account id.
 */
export function analyticsDistinctId(uid: string): string {
    return `pl_${createHash('sha256').update(`pawlegends:${uid}`).digest('hex').slice(0, 32)}`;
}

export const DISTINCT_ID_RE = /^pl_[0-9a-f]{32}$/;

/** Where an account was made, from the request's Origin: pawlegends.app or the Android app, the shared iOS origin, or Token Tails. */
export function surfaceOf(originHeader: unknown): 'pawlegends' | 'app' | 'tokentails' {
    const o = typeof originHeader === 'string' ? originHeader.trim().toLowerCase() : '';
    if (o === 'https://pawlegends.app' || o === 'https://www.pawlegends.app' || o === 'https://localhost')
        return 'pawlegends';
    if (o === 'capacitor://localhost') return 'app';
    return 'tokentails';
}
