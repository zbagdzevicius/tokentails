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
        // the native app WebViews: Token Tails Android (http), Pawlegends Android (https), both iOS apps (capacitor)
        'http://localhost',
        'https://localhost',
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

/** Dev-server origins (Next.js and Vite ports on localhost): accepted by the party relay outside production only. */
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

/**
 * The party relay's WebSocket Origin check (`/pawlegends/ws`). The CORS list minus the built-in localhost dev ports in
 * production (unless FRONT_END_URLS names one); the app origins stay (`http://localhost` for
 * the Token Tails Android WebView, `https://localhost` for the Pawlegends Android WebView, `capacitor://localhost` on iOS).
 * Origin is a browser-side guard only: the relay's auth is the ticket inside `hello`, never a cookie.
 */
export function isRelayOriginAllowed(
    origin: string,
    production: boolean = process.env.NODE_ENV === 'production',
    allowed: CorsOrigin[] = corsOrigins(),
    frontEndUrls: string | undefined = process.env.FRONT_END_URLS
): boolean {
    // a dev port in production only when FRONT_END_URLS names it explicitly (a staging box, a soak run)
    if (DEV_ORIGIN.test(origin)) return !production || !!frontEndUrls?.split(',').includes(origin);
    return isCorsOriginAllowed(origin, allowed);
}
