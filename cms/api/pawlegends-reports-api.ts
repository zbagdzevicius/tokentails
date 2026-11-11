import { request } from './api';

/*
 * Pawlegends PvP reports (docs/plans/moba/SOCIAL-RANKED.md section 8.5). Backed by
 * GET /pawlegends/admin/reports, GET /pawlegends/admin/reports/:accountId,
 * GET /pawlegends/admin/reports/stats and POST /pawlegends/admin/reports/:accountId/resolve
 * (MODERATOR and above). Reporter ids never come back from any of them.
 */

export const PL_REPORT_REASON_LABELS: Record<string, string> = {
  afk: 'AFK',
  grief: 'Griefing',
  cheat: 'Cheating / map hack',
  name: 'Offensive name',
  chat: 'Chat message'
};

/** Chat report sub-reasons (CHAT-AVATARS.md section 2.7; shared/chat.ts CHAT_REPORT_KINDS). */
export const PL_CHAT_KIND_LABELS: Record<string, string> = {
  harass: 'Harassment',
  sexual: 'Sexual',
  contact: 'Contact details',
  spam: 'Spam',
  other: 'Other'
};

export const PL_FLAG_LABELS: Record<string, string> = {
  F1: '3+ reporters in 7 days',
  F2: 'Reported in 5%+ of matches',
  F3: 'Map-hack signal z > 4',
  F4: 'Win-trade pair',
  F5: '2+ confirmed AFK',
  F6: '20+ chat filter hits today'
};

export const PL_RESOLVE_ACTIONS = [
  'dismiss',
  'warn',
  'queue_lock',
  'ranked_lock',
  'board_exclude',
  'pvp_ban',
  'chat_mute'
] as const;
export type PlResolveAction = (typeof PL_RESOLVE_ACTIONS)[number];

export const PL_STATUSES = ['open', 'actioned', 'dismissed', 'all'] as const;
export type PlStatus = (typeof PL_STATUSES)[number];

export interface IPlReportGroup {
  target: { accountId: string; name: string };
  counts: Record<string, number>;
  reporters7d: number;
  rooms: number;
  flags: string[];
  intel: { z: number | null; matches: number } | null;
  lastAt: string;
}

export interface IPlReportList {
  groups: IPlReportGroup[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IPlReportDetail {
  target: { accountId: string; name: string };
  intel: { z: number | null; matches: number; hid: number; opp: number };
  reports: Array<{
    id: string;
    room: string;
    queue: string;
    reason: string;
    note: string | null;
    tick: number | null;
    status: string;
    createdAt: string;
    /** Chat reports: the sub-reason and the copied message with up to 6 earlier lines. */
    chatKind?: string | null;
    snapshot?: IPlChatSnapshot | null;
  }>;
  rooms: Array<{
    room: string;
    gone?: boolean;
    queue?: string;
    map?: string;
    team?: number | null;
    outcome?: string | null;
    members?: Array<{
      slot: number;
      event: string | null;
      intel: { acts: number; hid: number; opp: number; hero?: string } | null;
    }>;
    replay?: string;
  }>;
  sanctions: Array<{
    id: string;
    kind: string;
    until: string | null;
    reasonCode: string;
    createdAt: string;
  }>;
}

export interface IPlChatLine {
  from: string;
  k: 't' | 'q' | 's';
  text?: string;
  id?: number;
  at: string;
}

export interface IPlChatSnapshot extends IPlChatLine {
  thread: string;
  kind: 'dm' | 'party';
  context: IPlChatLine[];
}

export interface IPlStats {
  days: number;
  pvpMatches: number;
  rankedMatches: number;
  reports: number;
  mapHackConfirmed: number;
  rate: number;
  base: 'ranked' | 'pvp';
}

const list = (status: PlStatus, page = 0, flagOnly = false) =>
  request<IPlReportList>(
    `/pawlegends/admin/reports?status=${encodeURIComponent(
      status
    )}&page=${page}${flagOnly ? '&flag=1' : ''}`,
    'GET'
  );

const detail = (accountId: string) =>
  request<IPlReportDetail>(
    `/pawlegends/admin/reports/${encodeURIComponent(accountId)}`,
    'GET'
  );

const stats = (days = 14) =>
  request<IPlStats>(`/pawlegends/admin/reports/stats?days=${days}`, 'GET');

const resolve = (
  accountId: string,
  action: PlResolveAction,
  reasonCode: string,
  days?: number
) =>
  request<{
    updated: number;
    sanction: { id: string; kind: string; until: string | null } | null;
  }>(
    `/pawlegends/admin/reports/${encodeURIComponent(accountId)}/resolve`,
    'POST',
    { action, reasonCode, ...(days ? { days } : {}) }
  );

export const PAWLEGENDS_REPORTS_API = { list, detail, stats, resolve };
