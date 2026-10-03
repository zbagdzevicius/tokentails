'use client';

import {
  formatAmount,
  IPayout,
  PAYOUT_PURPOSE_LABELS
} from '@/api/payouts-api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import Link from 'next/link';
import { PayoutStatusBadge } from './status-badge';

/** Payouts newest first. Rows link to the review page; on phones they stack as cards. */
export function PayoutsTable({
  payouts,
  isLoading
}: {
  payouts: IPayout[] | undefined;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payouts</CardTitle>
        <CardDescription className="normal-case">
          Money that reached a shelter outside the on-chain rail. A draft earns
          no evidence tier until a shelter member confirms it with the same
          receipt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !payouts?.length ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="payouts-empty"
          >
            No payouts yet. Draft the first one with its receipt.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" data-testid="payouts-list">
            {payouts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/payouts/${p.id}`}
                  className="grid grid-cols-2 gap-x-3 gap-y-1 py-3 hover:bg-white/60 focus-visible:outline focus-visible:outline-2 sm:grid-cols-[7rem_1fr_9rem_10rem] sm:items-center rounded-md px-2"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.paidAt}
                  </span>
                  <span className="justify-self-end sm:order-last sm:justify-self-start">
                    <PayoutStatusBadge status={p.status} />
                  </span>
                  <span className="col-span-2 font-semibold sm:col-span-1">
                    {p.shelter.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {PAYOUT_PURPOSE_LABELS[p.purpose]}
                      {p.pledgeMonth ? ` · ${p.pledgeMonth}` : ''}
                    </span>
                  </span>
                  <span className="col-span-2 font-mono text-sm sm:col-span-1 sm:text-right">
                    {formatAmount(p.amount, p.symbol)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
