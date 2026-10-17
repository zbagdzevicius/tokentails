import { BUNDLE_SHA256, MAX_RUN_TICKS, SIM_VERSION, TICK_HZ } from 'src/vendor/badcat-sim';

/**
 * Which Bad Cat sim this backend replays with. Served by `GET /badcat/sim` (the game's deploy runs
 * `npm run vendor-sim:check-remote -- <backend url>` in bad-cat/ before publishing a new sim) and attached to every
 * BADCAT_SIM_VERSION / BADCAT_REPLAY_INVALID 400, so the game can keep a queued ranked run until the backend reports
 * its own SIM_VERSION instead of dropping it.
 */
export interface IBadcatSimInfo {
    simVersion: number;
    bundle: string;
    tickHz: number;
    maxRunTicks: number;
}

export const BADCAT_SIM_INFO: IBadcatSimInfo = Object.freeze({
    simVersion: SIM_VERSION,
    bundle: BUNDLE_SHA256,
    tickHz: TICK_HZ,
    maxRunTicks: MAX_RUN_TICKS,
}) as IBadcatSimInfo;

/** The part of `BADCAT_SIM_INFO` a 400 body carries. */
export const badcatSimErrorDetail = () => ({
    sim: { simVersion: BADCAT_SIM_INFO.simVersion, bundle: BADCAT_SIM_INFO.bundle },
});
