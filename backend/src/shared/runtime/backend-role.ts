/*
 * Process role (infra/gcp/RUNBOOK.md, docs/BACKEND.md "Process roles"). One image, three ways to start it:
 *
 * - `all` (default, BACKEND_ROLE unset): everything in one process, exactly as before. DigitalOcean and local dev.
 * - `api`: the HTTP API and the leased crons, without the party relay. On Google Cloud this is the Cloud Run service
 *   `tt-api`; it never attaches to `/pawlegends/ws`, so it never restores (claims) relay rooms players cannot reach.
 * - `relay`: the party relay alone (`/pawlegends/ws`, `/healthz`, `/readyz`). No crons, no hot-wallet or Stripe
 *   providers. On Google Cloud this is the relay VM.
 *
 * This is how a process is wired, not a feature switch: every feature stays on in the role that serves it.
 */
export type BackendRole = 'all' | 'api' | 'relay';

export const BACKEND_ROLES: readonly BackendRole[] = Object.freeze(['all', 'api', 'relay']);

/** Injection token: the role the root module was built for. */
export const BACKEND_ROLE = 'BACKEND_ROLE';

export function backendRole(env: NodeJS.ProcessEnv = process.env): BackendRole {
    const raw = (env.BACKEND_ROLE ?? '').trim().toLowerCase();
    if (!raw) return 'all';
    if ((BACKEND_ROLES as readonly string[]).includes(raw)) return raw as BackendRole;
    throw new Error(`BACKEND_ROLE must be one of ${BACKEND_ROLES.join(', ')} (got "${raw}")`);
}

/** Whether this role serves the party relay WebSocket. */
export const servesRelay = (role: BackendRole): boolean => role === 'all' || role === 'relay';

/**
 * The production environment check. `IS_PROD` (mainnet Stellar, live config) without `NODE_ENV=production` would run
 * the shelter rail and crypto checkout on testnet defaults and turn the guest and impact jobs off, silently. A split
 * role (`api`, `relay`) only runs on Google Cloud, where the container must set NODE_ENV itself: there it is fatal.
 * Under `all` (DigitalOcean, where the buildpack sets NODE_ENV) it is a loud error only, so a deploy never dies on it.
 */
export function productionEnvProblem(env: NodeJS.ProcessEnv = process.env): string | null {
    const isProd = (env.IS_PROD ?? '').trim();
    if (isProd && !/^(0|false|no|off)$/i.test(isProd) && env.NODE_ENV !== 'production') {
        return `IS_PROD is set but NODE_ENV is "${
            env.NODE_ENV ?? ''
        }", not "production": mainnet config would run with testnet defaults`;
    }
    return null;
}

export function checkProductionEnv(
    role: BackendRole,
    env: NodeJS.ProcessEnv = process.env,
    log: (msg: string) => void = msg => console.error(msg),
    exit: (code: number) => void = code => process.exit(code)
): void {
    const problem = productionEnvProblem(env);
    if (!problem) return;
    log(`FATAL CONFIG: ${problem}`);
    if (role !== 'all') exit(1);
}
