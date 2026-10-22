/*
 * Origins allowed by CORS (main.ts). `credentials: true` stays on, so each entry must be exact: a string
 * is compared for equality and a RegExp must be anchored (the `cors` package calls `regex.test(origin)`).
 *
 * The landing lab (Vercel project `tokentails-landing-lab`, `landing-poc/`) runs the in-page club and
 * donation checkouts, so its production alias and its per-deployment URLs
 * (`tokentails-landing-<hash>-zbagdzevicius-projects.vercel.app`, https only) are allowed. Nothing else on
 * vercel.app is: any Vercel user can deploy there.
 */

export const LANDING_LAB_PRODUCTION_ORIGIN = 'https://tokentails-landing-lab.vercel.app';

export const LANDING_LAB_PREVIEW_ORIGIN =
    /^https:\/\/tokentails-landing-[a-z0-9]+-zbagdzevicius-projects\.vercel\.app$/;

export type CorsOrigin = string | RegExp;

export function corsOrigins(frontEndUrls: string | undefined = process.env.FRONT_END_URLS): CorsOrigin[] {
    return [
        'http://localhost',
        'capacitor://localhost',
        'http://localhost:3000',
        'http://localhost:3001',
        'https://cats.tokentails.com',
        'https://test.tokentails.com',
        'https://tokentails.com',
        // the Bad Cat embed on www defaults its API to api.tokentails.com too
        'https://www.tokentails.com',
        LANDING_LAB_PRODUCTION_ORIGIN,
        LANDING_LAB_PREVIEW_ORIGIN,
        // Unchanged: unset FRONT_END_URLS adds the literal '*', which `cors` compares by equality only.
        ...(frontEndUrls?.split(',') || ['*']),
    ];
}

/** The `cors` package's array check: string equality or RegExp test. */
export function isCorsOriginAllowed(origin: string, allowed: CorsOrigin[] = corsOrigins()): boolean {
    return allowed.some(entry => (entry instanceof RegExp ? entry.test(origin) : entry === origin));
}
