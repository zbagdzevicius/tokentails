/*
 * PvP report contracts (docs/plans/moba/SOCIAL-RANKED.md §8). REPORT_REASONS is duplicated in the game as
 * `pawlegends/src/social/report.ts`; `tests/unit/report-reasons.test.ts` there deep-compares the two copies.
 */

export const REPORT_REASONS = ['afk', 'grief', 'cheat', 'name'] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export const isReportReason = (v: unknown): v is ReportReason =>
    typeof v === 'string' && (REPORT_REASONS as readonly string[]).includes(v);

export const REPORT_STATUSES = ['open', 'corroborated', 'actioned', 'dismissed'] as const;
export type ReportStatus = typeof REPORT_STATUSES[number];

export const SANCTION_KINDS = ['warn', 'queue_lock', 'ranked_lock', 'board_exclude', 'pvp_ban'] as const;
export type SanctionKind = typeof SANCTION_KINDS[number];
export const RESOLVE_ACTIONS = ['dismiss', ...SANCTION_KINDS] as const;
export type ResolveAction = typeof RESOLVE_ACTIONS[number];

/** The PvP queues of an mm room a report may name. */
export const REPORTABLE_QUEUES = ['casual', 'classic', 'ranked'] as const;

export const REPORT_LIMITS = Object.freeze({
    /** Reports per reporter per 24 h (registered / guest). */
    perDay: 10,
    perDayGuest: 3,
    /** Reports per room (all reporters). */
    perRoom: 5,
    /** Per client IP. */
    ipLimit: 20,
    ipTtlMs: 10 * 60_000,
    /** A room can be reported this long after it ended. */
    afterEndMs: 24 * 3600_000,
    noteMax: 140,
    keepDays: 180,
    keepDismissedDays: 90,
});

/** Auto-flags (§8.5): only raise the review priority, never act. */
export const REPORT_FLAGS = Object.freeze({
    f1Reporters: 3,
    f1Rooms: 2,
    f1Days: 7,
    f2Share: 0.05,
    f2MinRooms: 20,
    f3Z: 4,
    f5Afk: 2,
    windowDays: 14,
});
