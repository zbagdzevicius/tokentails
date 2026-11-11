/*
 * PvP report contracts (docs/plans/moba/SOCIAL-RANKED.md §8). REPORT_REASONS is duplicated in the game as
 * `pawlegends/src/social/report.ts`; `tests/unit/report-reasons.test.ts` there deep-compares the two copies.
 */

export const REPORT_REASONS = ['afk', 'grief', 'cheat', 'name'] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export const isReportReason = (v: unknown): v is ReportReason =>
    typeof v === 'string' && (REPORT_REASONS as readonly string[]).includes(v);

/**
 * Chat message reports (CHAT-AVATARS.md §3.4): reason `chat` with a sub-reason (shared/chat.ts CHAT_REPORT_KINDS).
 * Kept out of REPORT_REASONS on purpose: that list is the PvP flag's chips, and a PvP report can never say `chat`.
 * STORED_REPORT_REASONS is what a report row may hold.
 */
export const CHAT_REPORT_REASON = 'chat' as const;
export const STORED_REPORT_REASONS = [...REPORT_REASONS, CHAT_REPORT_REASON] as const;
export type StoredReportReason = typeof STORED_REPORT_REASONS[number];
export const isStoredReportReason = (v: unknown): v is StoredReportReason =>
    typeof v === 'string' && (STORED_REPORT_REASONS as readonly string[]).includes(v);

export const REPORT_STATUSES = ['open', 'corroborated', 'actioned', 'dismissed'] as const;
export type ReportStatus = typeof REPORT_STATUSES[number];

/** `chat_mute` (CHAT-AVATARS.md §3.4): no DM, party or in-match chat until it ends (1, 7, 30 days or permanent). */
export const SANCTION_KINDS = ['warn', 'queue_lock', 'ranked_lock', 'board_exclude', 'pvp_ban', 'chat_mute'] as const;
export type SanctionKind = typeof SANCTION_KINDS[number];
export const RESOLVE_ACTIONS = ['dismiss', ...SANCTION_KINDS] as const;
export type ResolveAction = typeof RESOLVE_ACTIONS[number];

/** The PvP queues of an mm room a report may name. */
export const REPORTABLE_QUEUES = ['casual', 'classic', 'ranked'] as const;

export const REPORT_LIMITS = Object.freeze({
    /** Reports per reporter per 24 h (registered / guest). */
    perDay: 10,
    perDayGuest: 3,
    /**
     * Reports per room against one target (all reporters): caps a brigade on one player. Counted per target, not per
     * room, so one side cannot use up a room's reports before the other side files theirs.
     */
    perRoom: 5,
    /** Reports one reporter may file in one room (any targets): stops "report everyone" spam. */
    perRoomReporter: 2,
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
    /** F6 (chat): filter strikes in one UTC day (shared/chat.ts CHAT_LIMITS.strikeFlagPerDay). */
    f6Strikes: 20,
    f1Reporters: 3,
    f1Rooms: 2,
    f1Days: 7,
    f2Share: 0.05,
    f2MinRooms: 20,
    f3Z: 4,
    f5Afk: 2,
    windowDays: 14,
});
