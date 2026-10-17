import { PAWLEGENDS_LEVELS } from 'src/shared-contracts/caps';
import { BUNDLE_SHA256, PLACEHOLDER, SIM_VERSION } from 'src/vendor/pawlegends-sim';

/**
 * Which Pawlegends sim this backend replays with. Served by `GET /pawlegends/sim` (the game's deploy runs
 * `npm run vendor-sim:check-remote -- <backend url>` in pawlegends/) and attached to every PAWLEGENDS_SIM_VERSION /
 * PAWLEGENDS_REPLAY_INVALID 400, so the game can keep a queued replay until the backend reports its SIM_VERSION.
 */
export const PAWLEGENDS_SIM_INFO = Object.freeze({
    simVersion: SIM_VERSION,
    bundleSha256: BUNDLE_SHA256,
    /** True while only the placeholder bundle is vendored (every replay is refused). */
    placeholder: PLACEHOLDER,
    levels: PAWLEGENDS_LEVELS,
});

/** The part of `PAWLEGENDS_SIM_INFO` a 400 body carries. */
export const pawlegendsSimErrorDetail = () => ({
    sim: { simVersion: PAWLEGENDS_SIM_INFO.simVersion, bundleSha256: PAWLEGENDS_SIM_INFO.bundleSha256 },
});
