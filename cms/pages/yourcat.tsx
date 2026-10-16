'use client';

import { request } from '@/api/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';

/*
 * Bet #3 AI spend and refusals (launch item YC-L8). Reads GET /yourcat/stats?days=14, which is
 * admins only (role 5, PermissionGuard(ADMIN)); `request` sends the lowercase `accesstoken` header.
 * One row per UTC day: the cap, the measured spend, the committed amount (reservations plus
 * settled differences) and the anonymous daily counters, AiUploadGate refusals first.
 */

export interface IYourcatStatsDay {
  day: string;
  capEur: number;
  spentEur: number;
  committedEur: number;
  counts: Record<string, number | undefined>;
}

export const STATS_DAYS = 14;

/** Always shown, in this order: the refusal counters of AiUploadGate, by layer. */
export const REFUSAL_COUNTERS = [
  'refusedNoClientIp',
  'refusedAppCheck',
  'refusedIpCap',
  'refusedUserCap',
  'refusedFailureCap',
  'refusedBudget'
] as const;

/**
 * Shown as the last column, outside `statsColumns`: paid `/yourcat` portraits painted but whose email
 * SendGrid did not accept, one per failed send (KI-11). The backend sends it as 0 on a day without one.
 */
export const EMAIL_FAILED_COUNTER = 'portraitsEmailFailed';

export const fetchYourcatStats = async (
  days = STATS_DAYS
): Promise<IYourcatStatsDay[] | null> => {
  const result = await request<{ days: IYourcatStatsDay[] }>(
    `/yourcat/stats?days=${days}`,
    'GET'
  );
  return result?.days ?? null;
};

/**
 * The refusal counters, then every other counter any day has, in first-seen order. The failed-email
 * counter is left out here: it has its own last column.
 */
export function statsColumns(days: IYourcatStatsDay[]): string[] {
  const columns: string[] = [...REFUSAL_COUNTERS];
  for (const day of days) {
    for (const key of Object.keys(day.counts || {})) {
      if (key !== EMAIL_FAILED_COUNTER && !columns.includes(key)) {
        columns.push(key);
      }
    }
  }
  return columns;
}

const euros = (value: number) => `€${(Number(value) || 0).toFixed(2)}`;

/** Bold and red above 0: a buyer is waiting for a link (the alert email has the order id). */
function EmailFailedCell({ value }: { value: number }) {
  return (
    <TableCell className={value > 0 ? 'font-bold text-destructive' : undefined}>
      {value}
    </TableCell>
  );
}

export function YourcatStatsTable({
  days,
  isLoading
}: {
  days?: IYourcatStatsDay[] | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <p role="status">Loading…</p>;
  }
  if (!days) {
    return (
      <p role="status">
        No stats. This view needs an admin account (role 5).
      </p>
    );
  }
  if (!days.length) {
    return <p role="status">No AI activity in the last {STATS_DAYS} days.</p>;
  }
  const columns = statsColumns(days);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Day (UTC)</TableHead>
          <TableHead>Cap</TableHead>
          <TableHead>Spent</TableHead>
          <TableHead>Committed</TableHead>
          {columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
          <TableHead>{EMAIL_FAILED_COUNTER} (paid, not emailed)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {days.map((day) => (
          <TableRow key={day.day}>
            <TableCell>{day.day}</TableCell>
            <TableCell>{euros(day.capEur)}</TableCell>
            <TableCell>{euros(day.spentEur)}</TableCell>
            <TableCell>{euros(day.committedEur)}</TableCell>
            {columns.map((column) => (
              <TableCell key={column}>{day.counts?.[column] ?? 0}</TableCell>
            ))}
            <EmailFailedCell value={day.counts?.[EMAIL_FAILED_COUNTER] ?? 0} />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function YourcatStatsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['yourcat-stats', STATS_DAYS],
    queryFn: () => fetchYourcatStats(STATS_DAYS)
  });

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Photo cats: AI spend</h1>
        <p className="text-sm text-muted-foreground">
          The last {STATS_DAYS} UTC days of /yourcat and /portrait AI calls:
          the daily cap, the measured spend, what is committed (reservations
          plus settled differences) and the counters. The refused columns count
          requests the upload gate turned away, by the layer that refused them.
          The last column counts paid portraits that were painted but whose
          email was not accepted, one per failed send; the sweeper retries the
          email and an alert email names the order.
        </p>
      </div>
      <YourcatStatsTable days={data} isLoading={isLoading} />
    </div>
  );
}
