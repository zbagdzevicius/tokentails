'use client';

import {
  IPlReportGroup,
  PAWLEGENDS_REPORTS_API,
  PL_FLAG_LABELS,
  PL_REPORT_REASON_LABELS,
  PL_RESOLVE_ACTIONS,
  PL_STATUSES,
  PlResolveAction,
  PlStatus
} from '@/api/pawlegends-reports-api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/context/ToastContext';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

const STATUS_LABELS: Record<PlStatus, string> = {
  open: 'Open',
  actioned: 'Actioned',
  dismissed: 'Dismissed',
  all: 'All'
};

const ACTION_LABELS: Record<PlResolveAction, string> = {
  dismiss: 'Dismiss',
  warn: 'Warn',
  queue_lock: 'Queue lock',
  ranked_lock: 'Ranked lock',
  board_exclude: 'Board exclude',
  pvp_ban: 'PvP ban'
};

/**
 * Pawlegends PvP reports (docs/plans/moba/SOCIAL-RANKED.md section 8.5). Groups per reported
 * player, flagged first. Flags only sort the list: nothing is applied until a moderator resolves.
 * The stats line is the map-hack 1% trigger (confirmed map-hack rooms / matches, 14 days).
 */
export default function PawlegendsReportsPage() {
  const [status, setStatus] = useState<PlStatus>('open');
  const [page, setPage] = useState(0);
  const [flagOnly, setFlagOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const toast = useToast();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pawlegends-reports', status, page, flagOnly],
    queryFn: () => PAWLEGENDS_REPORTS_API.list(status, page, flagOnly)
  });
  const { data: stats } = useQuery({
    queryKey: ['pawlegends-reports-stats'],
    queryFn: () => PAWLEGENDS_REPORTS_API.stats(14)
  });

  const resolve = async (group: IPlReportGroup, action: PlResolveAction) => {
    const reasonCode = window.prompt(
      'Reason code (a-z, 0-9, _), e.g. map_hack, afk, name',
      action === 'dismiss' ? 'no_violation' : ''
    );
    if (!reasonCode) return;
    let days: number | undefined;
    if (action === 'queue_lock' || action === 'ranked_lock') {
      days = Number(window.prompt('Days (1-365)', '3'));
      if (!Number.isInteger(days) || days < 1) return;
    }
    const result = await PAWLEGENDS_REPORTS_API.resolve(
      group.target.accountId,
      action,
      reasonCode,
      days
    );
    if (!result) return;
    toast({ message: `${ACTION_LABELS[action]}: ${result.updated} report(s)` });
    await refetch();
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Paw Legends PvP reports</h1>
          <p className="text-sm text-muted-foreground">
            Players reported from the scoreboard or the results screen. Reporter
            identities are never shown. Flags only raise the priority.
          </p>
          {stats && (
            <p className="text-sm" data-testid="pl-stats">
              Last {stats.days} days: {stats.mapHackConfirmed} confirmed
              map-hack match(es) in{' '}
              {stats.base === 'ranked' ? stats.rankedMatches : stats.pvpMatches}{' '}
              {stats.base} matches = {(stats.rate * 100).toFixed(2)}% (fog
              fallback trigger: 1% for 2 weeks)
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {PL_STATUSES.map((option) => (
            <Button
              key={option}
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
          <Button
            size="sm"
            className="w-auto text-sm"
            variant={flagOnly ? 'default' : 'outline'}
            onClick={() => {
              setFlagOnly(!flagOnly);
              setPage(0);
            }}
          >
            Flagged only
          </Button>
        </div>
      </div>
      {isLoading && <p role="status">Loading reports…</p>}
      {!isLoading && !data?.groups.length && (
        <p
          role="status"
          className="rounded-lg bg-background/80 p-6 text-center"
        >
          No reports here.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.groups.map((group) => (
          <div
            key={group.target.accountId}
            className="grid gap-2 rounded-lg border bg-background/80 p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <strong>{group.target.name}</strong>
              <code className="text-xs">{group.target.accountId}</code>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              {group.flags.map((flag) => (
                <span
                  key={flag}
                  className="rounded bg-red-100 px-2 py-0.5 text-red-800"
                  title={PL_FLAG_LABELS[flag]}
                >
                  {flag} {PL_FLAG_LABELS[flag]}
                </span>
              ))}
            </div>
            <ul className="text-sm">
              {Object.entries(group.counts).map(([reason, n]) => (
                <li key={reason}>
                  {PL_REPORT_REASON_LABELS[reason] || reason}: {n}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {group.reporters7d} reporter(s) in 7 days · {group.rooms}{' '}
              match(es)
              {group.intel?.z !== undefined && group.intel?.z !== null
                ? ` · map-hack z ${group.intel.z}`
                : ''}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-auto"
              onClick={() =>
                setOpen(
                  open === group.target.accountId
                    ? null
                    : group.target.accountId
                )
              }
            >
              {open === group.target.accountId ? 'Hide' : 'Details'}
            </Button>
            {open === group.target.accountId && (
              <ReportDetail accountId={group.target.accountId} />
            )}
            <div className="flex flex-wrap gap-1">
              {PL_RESOLVE_ACTIONS.map((action) => (
                <Button
                  key={action}
                  size="sm"
                  className="w-auto text-xs"
                  variant={action === 'dismiss' ? 'outline' : 'default'}
                  onClick={() => resolve(group, action)}
                >
                  {ACTION_LABELS[action]}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {data && (page > 0 || data.total > (page + 1) * data.pageSize) && (
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
            disabled={data.total <= (page + 1) * data.pageSize}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function ReportDetail({ accountId }: { accountId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pawlegends-report', accountId],
    queryFn: () => PAWLEGENDS_REPORTS_API.detail(accountId)
  });
  if (isLoading || !data) return <p role="status">Loading…</p>;
  return (
    <div className="grid gap-2 text-xs">
      <p>
        Map-hack signal: {data.intel.z ?? 'n/a'} over {data.intel.matches}{' '}
        match(es) ({data.intel.hid} hidden-target actions / {data.intel.opp}{' '}
        chances)
      </p>
      <ul className="grid gap-1">
        {data.reports.map((report) => (
          <li key={report.id}>
            {new Date(report.createdAt).toLocaleString()} ·{' '}
            {PL_REPORT_REASON_LABELS[report.reason] || report.reason} ·{' '}
            {report.status} · room <code>{report.room}</code>
            {report.tick !== null ? ` @ tick ${report.tick}` : ''}
            {report.note ? (
              <span className="block italic">“{report.note}”</span>
            ) : null}
          </li>
        ))}
      </ul>
      <ul className="grid gap-1">
        {data.rooms.map((room) => (
          <li key={room.room}>
            <code>{room.room}</code>{' '}
            {room.gone
              ? '(expired)'
              : `${room.queue} · team ${room.team} · ${
                  room.outcome ?? 'no result'
                }`}
            {room.members?.map((m) => (
              <span key={m.slot} className="block">
                slot {m.slot}
                {m.event ? ` · ${m.event}` : ''}
                {m.intel
                  ? ` · ${m.intel.hero ?? ''} acts ${m.intel.acts}, hidden ${
                      m.intel.hid
                    }/${m.intel.opp}`
                  : ''}
              </span>
            ))}
          </li>
        ))}
      </ul>
      {data.sanctions.length > 0 && (
        <p>
          Sanctions:{' '}
          {data.sanctions
            .map(
              (s) =>
                `${s.kind}${
                  s.until
                    ? ` until ${new Date(s.until).toLocaleDateString()}`
                    : ''
                } (${s.reasonCode})`
            )
            .join(', ')}
        </p>
      )}
    </div>
  );
}
