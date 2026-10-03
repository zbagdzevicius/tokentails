import type {
  NameModerationAction,
  NameReportReason,
  NameReportStatus
} from '@/shared-contracts/name';
import { request } from './api';

/*
 * Player cat name reports (plan G3, App Store guideline 1.2). Backed by
 * GET /cat/name-reports and PUT /cat/:id/name/moderate (MODERATOR and above).
 */

// The report vocabulary is shared with the backend (shared/name.ts).
export {
  NAME_MODERATION_ACTIONS,
  NAME_REPORT_REASONS,
  NAME_REPORT_STATUSES
} from '@/shared-contracts/name';
export type {
  NameModerationAction,
  NameReportReason,
  NameReportStatus
} from '@/shared-contracts/name';

export const NAME_REPORT_REASON_LABELS: Record<NameReportReason, string> = {
  offensive: 'Offensive',
  impersonation: 'Impersonation',
  'personal-info': 'Personal info',
  other: 'Other'
};

export interface INameReportGroup {
  cat: {
    _id: string;
    name?: string;
    catImg?: string;
    starterBreed?: string;
    nameChangedAt?: string;
    nameModeratedAt?: string;
    missing?: boolean;
  };
  status: NameReportStatus;
  count: number;
  reasons: Partial<Record<NameReportReason, number>>;
  names: string[];
  notes: string[];
  firstAt?: string;
  lastAt?: string;
  action?: NameModerationAction;
  resolvedAt?: string;
}

export interface IModerationResult {
  success: boolean;
  cat: { _id: string; name: string };
  resolved: number;
}

const list = (status: NameReportStatus, page = 0) =>
  request<INameReportGroup[]>(
    `/cat/name-reports?status=${encodeURIComponent(status)}&page=${page}`,
    'GET'
  );

const moderate = (catId: string, action: NameModerationAction, name?: string) =>
  request<IModerationResult>(
    `/cat/${encodeURIComponent(catId)}/name/moderate`,
    'PUT',
    action === 'rename' ? { action, name } : { action }
  );

export const NAME_REPORTS_API = { list, moderate };
