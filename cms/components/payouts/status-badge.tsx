'use client';

import { PAYOUT_STATUS_LABELS, PayoutStatus } from '@/api/payouts-api';
import { cn } from '@/lib/utils';
import { Ban, CheckCircle2, FileClock, PenLine } from 'lucide-react';

/*
 * Evidence chips as the public site shows them (plan F7.2): text plus an icon, never colour alone.
 * SHELTER-CONFIRMED is amber, SHELTER-SIGNED is green, a draft is grey and earns no tier.
 */
const STYLE: Record<
  PayoutStatus,
  { className: string; Icon: typeof CheckCircle2 }
> = {
  DRAFT: {
    className: 'border-slate-400 bg-slate-100 text-slate-800',
    Icon: FileClock
  },
  SHELTER_CONFIRMED: {
    className: 'border-amber-500 bg-amber-50 text-amber-900',
    Icon: CheckCircle2
  },
  SHELTER_SIGNED: {
    className: 'border-emerald-600 bg-emerald-50 text-emerald-900',
    Icon: PenLine
  },
  VOID: { className: 'border-rose-400 bg-rose-50 text-rose-900', Icon: Ban }
};

export function PayoutStatusBadge({
  status,
  className
}: {
  status: PayoutStatus;
  className?: string;
}) {
  const { className: tone, Icon } = STYLE[status] || STYLE.DRAFT;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
        tone,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {PAYOUT_STATUS_LABELS[status] || status}
    </span>
  );
}
