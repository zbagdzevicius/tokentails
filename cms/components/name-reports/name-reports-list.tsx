'use client';

import {
  INameReportGroup,
  NameModerationAction,
  NameReportStatus
} from '@/api/name-reports-api';
import { NameReportCard } from './name-report-card';

const EMPTY: Record<NameReportStatus, string> = {
  open: 'No open name reports. Nice and kind out there.',
  actioned: 'No names have been reset or replaced yet.',
  dismissed: 'No reports have been dismissed yet.'
};

export interface NameReportsListProps {
  status: NameReportStatus;
  groups?: INameReportGroup[] | null;
  isLoading?: boolean;
  onModerate: (
    group: INameReportGroup,
    action: NameModerationAction,
    name?: string
  ) => Promise<boolean>;
}

export function NameReportsList({
  status,
  groups,
  isLoading,
  onModerate
}: NameReportsListProps) {
  if (isLoading) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading reports…
      </p>
    );
  }
  if (!groups?.length) {
    return (
      <p role="status" className="rounded-lg bg-background/80 p-6 text-center">
        {EMPTY[status]}
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <NameReportCard
          key={`${group.cat._id}-${group.status}`}
          group={group}
          onModerate={(action, name) => onModerate(group, action, name)}
        />
      ))}
    </div>
  );
}
