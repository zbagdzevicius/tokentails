'use client';

import {
  INameReportGroup,
  NAME_REPORT_STATUSES,
  NAME_REPORTS_API,
  NameModerationAction,
  NameReportStatus
} from '@/api/name-reports-api';
import { NameReportsList } from '@/components/name-reports/name-reports-list';
import { Button } from '@/components/ui/button';
import { useToast } from '@/context/ToastContext';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

const STATUS_LABELS: Record<NameReportStatus, string> = {
  open: 'Open',
  actioned: 'Actioned',
  dismissed: 'Dismissed'
};

const PAGE_SIZE = 20;

/**
 * Moderation queue for player cat names (plan G3, App Store guideline 1.2). Reports come from
 * POST /cat/:id/report in the game; each action resolves every open report of that cat.
 */
export default function NameReportsPage() {
  const [status, setStatus] = useState<NameReportStatus>('open');
  const [page, setPage] = useState(0);
  const toast = useToast();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['name-reports', status, page],
    queryFn: () => NAME_REPORTS_API.list(status, page)
  });

  const moderate = async (
    group: INameReportGroup,
    action: NameModerationAction,
    name?: string
  ): Promise<boolean> => {
    const result = await NAME_REPORTS_API.moderate(group.cat._id, action, name);
    if (!result?.success) {
      return false;
    }
    toast({
      message:
        action === 'dismiss'
          ? `Dismissed ${result.resolved} report(s)`
          : `Renamed to ${result.cat.name}`
    });
    await refetch();
    return true;
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cat name reports</h1>
          <p className="text-sm text-muted-foreground">
            Names players reported. Reset gives the cat its breed name. The
            owner can pick a new name after 30 days. Minted cats can be
            moderated too: this also changes their NFT metadata name.
          </p>
        </div>
        <div role="tablist" aria-label="Report status" className="flex gap-2">
          {NAME_REPORT_STATUSES.map((option) => (
            <Button
              key={option}
              role="tab"
              aria-selected={option === status}
              size="sm"
              className="w-auto text-sm"
              variant={option === status ? 'default' : 'outline'}
              onClick={() => {
                setStatus(option);
                setPage(0);
              }}
            >
              {STATUS_LABELS[option]}
            </Button>
          ))}
        </div>
      </div>
      <NameReportsList
        status={status}
        groups={data}
        isLoading={isLoading}
        onModerate={moderate}
      />
      {(page > 0 || (data?.length || 0) >= PAGE_SIZE) && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            className="w-auto"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(Math.max(0, page - 1))}
          >
            Previous
          </Button>
          <span className="text-sm">Page {page + 1}</span>
          <Button
            size="sm"
            className="w-auto"
            variant="outline"
            disabled={(data?.length || 0) < PAGE_SIZE}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
