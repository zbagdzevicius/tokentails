import { DEFAULT_TAILS_MODE, TailsMode, TAILS_MODES } from 'src/shared-contracts/copy';

/*
 * `GET /user/token-status` (plan G5 Vault, decision #39): public, cached, and POINTS by default.
 *
 *   TAILS_TOKEN_MODE   POINTS (default; also any unknown value) or TOKEN
 *   TAILS_TGE_AT       ISO date. Read only in TOKEN mode; in POINTS mode `tgeAt` is always null,
 *                      so no launch date leaves the backend until the founder switches the mode.
 *
 * The web client renders the VAULT tab only when this says TOKEN; app builds never call it, and any
 * fetch error means POINTS.
 */

export interface ITokenStatus {
    mode: TailsMode;
    tgeAt: string | null;
}

/** Cache-Control of the route: cheap to serve, and a mode switch shows within five minutes. */
export const TOKEN_STATUS_CACHE_CONTROL = 'public, max-age=300';

export function tokenStatus(env: NodeJS.ProcessEnv = process.env): ITokenStatus {
    const raw = (env.TAILS_TOKEN_MODE || '').trim().toUpperCase();
    const mode: TailsMode = (TAILS_MODES as readonly string[]).includes(raw) ? (raw as TailsMode) : DEFAULT_TAILS_MODE;
    if (mode !== 'TOKEN') {
        return { mode, tgeAt: null };
    }
    const at = env.TAILS_TGE_AT ? new Date(env.TAILS_TGE_AT) : null;
    return { mode, tgeAt: at && Number.isFinite(at.getTime()) ? at.toISOString() : null };
}
