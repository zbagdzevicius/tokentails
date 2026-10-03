'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { formatFunding, IRescueGoal } from '@/models/rescue-goal';
import Link from 'next/link';
import { GoalProgress, GoalStatusBadge } from './goal-status-badge';

/** Goals newest first. Rows link to the goal page; on phones they stack as cards. */
export function GoalsTable({
  goals,
  isLoading
}: {
  goals: IRescueGoal[] | undefined;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals</CardTitle>
        <CardDescription className="normal-case">
          Players give Tails to choose which goal gets delivered first. The
          money is already set aside, so every goal here gets bought.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !goals?.length ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="goals-empty"
          >
            No goals here yet. Open one once its money is set aside.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" data-testid="goals-list">
            {goals.map((goal) => (
              <li key={goal.id}>
                <Link
                  href={`/rescue-goals/${goal.id}`}
                  className="grid gap-x-4 gap-y-2 rounded-md px-2 py-3 hover:bg-white/60 focus-visible:outline focus-visible:outline-2 sm:grid-cols-[1fr_15rem] sm:items-center"
                >
                  <span className="grid min-w-0 gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-semibold">
                        {goal.title}
                      </span>
                      <GoalStatusBadge
                        status={goal.status}
                        expired={goal.expired}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {goal.shelter?.name || 'Unknown shelter'} ·{' '}
                      {goal.deliverable}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {goal.budgetMonth} ·{' '}
                      {formatFunding(
                        goal.funding.amountCents,
                        goal.funding.currency
                      )}{' '}
                      set aside · {goal.pledgeCount} gives
                    </span>
                  </span>
                  <GoalProgress
                    raisedTails={goal.raisedTails}
                    targetTails={goal.targetTails}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
