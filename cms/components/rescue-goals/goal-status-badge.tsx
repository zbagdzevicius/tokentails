'use client';

import { cn } from '@/lib/utils';
import {
  RESCUE_GOAL_STATUS_LABELS,
  RescueGoalStatus,
  progressPercent,
  tailsText
} from '@/models/rescue-goal';
import { Ban, CircleDot, Hourglass, PackageCheck, Trophy } from 'lucide-react';

/* Status chips: text plus an icon, never colour alone (same rule as the payout chips). */
const STYLE: Record<
  RescueGoalStatus,
  { className: string; Icon: typeof CircleDot }
> = {
  [RescueGoalStatus.OPEN]: {
    className: 'border-sky-500 bg-sky-50 text-sky-900',
    Icon: CircleDot
  },
  [RescueGoalStatus.FILLED]: {
    className: 'border-amber-500 bg-amber-50 text-amber-900',
    Icon: Trophy
  },
  [RescueGoalStatus.DELIVERED]: {
    className: 'border-emerald-600 bg-emerald-50 text-emerald-900',
    Icon: PackageCheck
  },
  [RescueGoalStatus.CANCELLED]: {
    className: 'border-rose-400 bg-rose-50 text-rose-900',
    Icon: Ban
  }
};

/** An OPEN goal past its end date: no more gives; a manager delivers or cancels it. */
const EXPIRED = {
  className: 'border-slate-500 bg-slate-100 text-slate-900',
  Icon: Hourglass,
  label: 'Ended, needs action'
};

export function GoalStatusBadge({
  status,
  expired,
  className
}: {
  status: RescueGoalStatus;
  expired?: boolean;
  className?: string;
}) {
  if (expired && status === RescueGoalStatus.OPEN) {
    const { className: tone, Icon, label } = EXPIRED;
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
          tone,
          className
        )}
        data-testid="goal-expired"
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
    );
  }
  const { className: tone, Icon } =
    STYLE[status] || STYLE[RescueGoalStatus.OPEN];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
        tone,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {RESCUE_GOAL_STATUS_LABELS[status] || status}
    </span>
  );
}

/** The Tails bar: raised of target, with the numbers as text for screen readers. */
export function GoalProgress({
  raisedTails,
  targetTails,
  className
}: {
  raisedTails: number;
  targetTails: number;
  className?: string;
}) {
  const percent = progressPercent({ raisedTails, targetTails });
  const label = `${tailsText(raisedTails)} of ${tailsText(targetTails)}`;
  return (
    <div className={cn('grid gap-1', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full rounded-full bg-amber-500 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-semibold">{percent}%</span>
      </p>
    </div>
  );
}
