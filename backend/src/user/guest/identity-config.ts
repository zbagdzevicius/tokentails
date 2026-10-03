/*
 * Identity settings (plan F5, G1, G9). Read per call from `process.env`, because `.env` is loaded in
 * main.ts after the modules are imported. Names are documented in docs/BACKEND.md.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Guests idle longer than this are deleted by the leased cleanup cron (decision #11). */
export const GUEST_IDLE_DAYS = 30;
export const GUEST_IDLE_MS = GUEST_IDLE_DAYS * DAY_MS;

/** At most one guest merge per target account in this window (G1). */
export const GUEST_MERGE_COOLDOWN_MS = 30 * DAY_MS;

/** A referral is paid only if claimed within this window after the referred account's promotion (decision #12). */
export const REFERRAL_WINDOW_MS = 7 * DAY_MS;

/** `lastSeenAt` is written at most this often per account (F5.1). */
export const LAST_SEEN_INTERVAL_MS = DAY_MS;

/** A merge left unfinished this long is resumed by the leased merge-resume cron. */
export const MERGE_RESUME_AFTER_MS = 5 * 60 * 1000;

/** Placeholder name of guest docs; the schema requires a name and guests have no email. */
export const GUEST_NAME = 'Guest';

/** Name of an anonymised (deleted) account (decision #4). */
export const DELETED_ACCOUNT_NAME = 'Deleted player';

const flag = (value: string | undefined, fallback: boolean) =>
    value === undefined || value === '' ? fallback : value.trim().toLowerCase() === 'true';

const positiveInt = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export interface IIdentityConfig {
    /**
     * F5.2 step 3: a verified email (or a Google/Apple sign-in) is required to CREATE an account.
     * Default true. `AUTH_ENFORCE_EMAIL_VERIFIED=false` restores the old behaviour (an unverified
     * password user gets a new account bound to its uid) for the F5.3 rollout.
     */
    enforceEmailVerified: boolean;
    /**
     * Decision #3: an account that already OWNS its uid but whose password token is still
     * unverified must verify on its next sign-in. Default false. Such accounts exist only if they
     * were created while `AUTH_ENFORCE_EMAIL_VERIFIED=false`: legacy accounts own no uid (main signed
     * in by email only, and the uid backfill skips unverified users), so a legacy unverified password
     * user gets 403 EMAIL_UNVERIFIED from the first request after this deploy whatever this flag
     * says (W1 rule: an unverified token never binds). The heads-up email and the 3a verification
     * screen must therefore ship before or with this deploy (2a review finding #3).
     */
    requireVerifiedExisting: boolean;
    /** Reject `POST /user/guest/session` without a valid `x-firebase-appcheck` token. Default false until the console setup. */
    appCheckEnforce: boolean;
    /** `NewAccountThrottle`: new registered accounts per IP per hour. */
    newAccountsPerIpPerHour: number;
    /** Guest sessions per IP per hour (backstop behind App Check, F5.5). */
    guestSessionsPerIpPerHour: number;
    /** Extra disposable email domains, comma separated (decision #5). */
    extraDisposableDomains: string[];
    /**
     * The guest crons (idle cleanup, merge resume) run only when true. `CRONS_ENABLED` wins when
     * set; otherwise they run only under `NODE_ENV=production`, so a dev box (`nest start --watch`,
     * NODE_ENV unset) that points at a shared or production database never wins a lease tick with
     * unreleased code and deletes guests (2a review finding #4). Production must set
     * `CRONS_ENABLED=true` or `NODE_ENV=production` (manual deploy step).
     */
    cronsEnabled: boolean;
}

export function identityConfig(env: NodeJS.ProcessEnv = process.env): IIdentityConfig {
    return {
        enforceEmailVerified: flag(env.AUTH_ENFORCE_EMAIL_VERIFIED, true),
        requireVerifiedExisting: flag(env.AUTH_REQUIRE_VERIFIED_EXISTING, false),
        appCheckEnforce: flag(env.APP_CHECK_ENFORCE, false),
        newAccountsPerIpPerHour: positiveInt(env.NEW_ACCOUNTS_PER_IP_PER_HOUR, 10),
        guestSessionsPerIpPerHour: positiveInt(env.GUEST_SESSIONS_PER_IP_PER_HOUR, 30),
        extraDisposableDomains: (env.DISPOSABLE_EMAIL_DOMAINS || '')
            .split(',')
            .map(domain => domain.trim().toLowerCase())
            .filter(Boolean),
        cronsEnabled: flag(env.CRONS_ENABLED, env.NODE_ENV === 'production'),
    };
}
