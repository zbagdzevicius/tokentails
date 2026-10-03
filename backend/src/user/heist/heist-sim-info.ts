import { BUNDLE_SHA256, LEVELS, SIM_VERSION } from 'src/vendor/heist-sim';

/**
 * Which Heist sim this backend replays with. Served by `GET /user/catbassadors/heist-sim` and
 * attached to every HEIST_SIM_VERSION / HEIST_REPLAY_INVALID 400 (review 3b finding 1), so:
 *
 * - the Heist Pages deploy can refuse to publish a sim the live backend does not run yet
 *   (`npm run vendor-sim:check-remote -- <backend url>` in catnip-heist/);
 * - a client that gets a stale-sim 400 can keep its queued logs until the backend reports the
 *   client's own SIM_VERSION, instead of dropping them (plan F5.6).
 */
export interface IHeistSimInfo {
    simVersion: number;
    bundleSha256: string;
    levels: string[];
}

export const HEIST_SIM_INFO: IHeistSimInfo = Object.freeze({
    simVersion: SIM_VERSION,
    bundleSha256: BUNDLE_SHA256,
    levels: LEVELS.map(level => level.id),
}) as IHeistSimInfo;

/** The part of `HEIST_SIM_INFO` a 400 body carries. */
export const heistSimErrorDetail = () => ({
    sim: { simVersion: HEIST_SIM_INFO.simVersion, bundleSha256: HEIST_SIM_INFO.bundleSha256 },
});
