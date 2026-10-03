'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  IOutcome,
  OUTCOME_STATUS_LABELS,
  OUTCOME_TYPE_LABELS,
  OutcomeStatus
} from '@/models/outcome';
import { CheckCircle2, EyeOff, ImageOff, UserCheck } from 'lucide-react';
import Link from 'next/link';

const STATUS_STYLE: Record<
  OutcomeStatus,
  { className: string; Icon: typeof CheckCircle2 }
> = {
  draft: {
    className: 'border-slate-400 bg-slate-100 text-slate-800',
    Icon: EyeOff
  },
  'awaiting-redaction': {
    className: 'border-amber-500 bg-amber-50 text-amber-900',
    Icon: ImageOff
  },
  'awaiting-approval': {
    className: 'border-sky-500 bg-sky-50 text-sky-900',
    Icon: UserCheck
  },
  published: {
    className: 'border-emerald-600 bg-emerald-50 text-emerald-900',
    Icon: CheckCircle2
  }
};

export function OutcomeStatusBadge({ status }: { status: OutcomeStatus }) {
  const { className, Icon } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {OUTCOME_STATUS_LABELS[status]}
    </span>
  );
}

export function OutcomesTable({
  outcomes,
  isLoading
}: {
  outcomes?: IOutcome[];
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Shelter outcomes</CardTitle>
        <CardDescription className="normal-case">
          Treatments, adoptions and supplies, with the animal&apos;s name only.
          Nothing is public until the photo and text are checked and a second
          reviewer approves.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !outcomes?.length ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="outcomes-empty"
          >
            No outcomes yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" data-testid="outcomes-list">
            {outcomes.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/outcomes/${o.id}`}
                  className="grid grid-cols-2 items-center gap-x-3 gap-y-1 rounded-md px-2 py-3 hover:bg-white/60 sm:grid-cols-[7rem_1fr_12rem]"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {o.date}
                  </span>
                  <span className="justify-self-end sm:order-last sm:justify-self-start">
                    <OutcomeStatusBadge status={o.status} />
                  </span>
                  <span className="col-span-2 font-semibold sm:col-span-1">
                    {OUTCOME_TYPE_LABELS[o.type]} ·{' '}
                    {o.animalName || 'A shelter animal'}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {o.shelter}
                      {o.hasImage ? ' · photo' : ''}
                      {o.tier ? ` · ${o.tier}` : ''}
                    </span>
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
