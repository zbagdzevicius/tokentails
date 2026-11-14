import { PAWLEGENDS_LEVELS } from 'src/shared-contracts/caps';
import {
    BUNDLE_SHA256,
    BUNDLE_SHA256_BY_VERSION,
    PLACEHOLDER,
    SIM_VERSION,
    SIM_VERSIONS,
    simFor,
} from 'src/vendor/pawlegends-sim';
import { PROTO } from 'src/vendor/pawlegends-net/pawlegends-net.bundle';

/**
 * Which Pawlegends sim this backend replays with. Served by `GET /pawlegends/sim` (the game's deploy runs
 * `npm run vendor-sim:check-remote -- <backend url>` in pawlegends/) and attached to every PAWLEGENDS_SIM_VERSION /
 * PAWLEGENDS_REPLAY_INVALID 400, so the game can keep a queued replay until the backend reports its SIM_VERSION.
 */
export const PAWLEGENDS_SIM_INFO = Object.freeze({
    /** The live sim (the newest accepted version). */
    simVersion: SIM_VERSION,
    bundleSha256: BUNDLE_SHA256,
    /** Sim v10 (GAPS B0): every version `/live` re-sims, each with its own vendored sim. */
    simVersions: SIM_VERSIONS,
    bundles: BUNDLE_SHA256_BY_VERSION,
    /** True while only the placeholder bundle is vendored (every replay is refused). */
    placeholder: PLACEHOLDER,
    levels: PAWLEGENDS_LEVELS,
    /**
     * Casual PvP (docs/plans/moba/V16.md §1 item 7): the first sim with PvP, or null. The game shows its PvP chip only
     * when its own sim is in `simVersions` and >= this (a capability check, no flag).
     */
    pvpSince: simFor(SIM_VERSION)?.party?.PVP_SINCE ?? null,
    /** The newest relay wire protocol (pawlegends/src/net/proto.ts PROTO): the game's deploy gate waits for it. */
    proto: PROTO,
});

/** The part of `PAWLEGENDS_SIM_INFO` a 400 body carries. */
export const pawlegendsSimErrorDetail = () => ({
    sim: {
        simVersion: PAWLEGENDS_SIM_INFO.simVersion,
        bundleSha256: PAWLEGENDS_SIM_INFO.bundleSha256,
        simVersions: PAWLEGENDS_SIM_INFO.simVersions,
    },
});

/**
 * Force update (docs/plans/moba/FORCE-UPDATE.md §5.3): a PAWLEGENDS_SIM_VERSION 400 also says what to do, so the
 * game shows "Update needed" instead of a silent rejection (additive: older hosts and games ignore it).
 */
export const pawlegendsUpdateDetail = () => ({
    update: {
        action: 'update' as const,
        minSim: Math.min(...PAWLEGENDS_SIM_INFO.simVersions),
        liveSim: PAWLEGENDS_SIM_INFO.simVersion,
        web: 'https://pawlegends.app/play',
    },
});
