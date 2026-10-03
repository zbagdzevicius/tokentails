'use client';

import { sha256OfFile } from '@/api/payouts-api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  canCancel,
  canDeliver,
  formatFunding,
  IRescueGoal,
  PHOTO_MAX_BYTES,
  PHOTO_MIMES,
  RECEIPT_MAX_BYTES,
  RECEIPT_MIMES,
  tailsText,
  TX_HASH
} from '@/models/rescue-goal';
import { useId, useState } from 'react';
import { GoalProgress, GoalStatusBadge } from './goal-status-badge';

function Row({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-xs font-bold uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

/** Everything about one goal, including the manager-only funding and proof owner. */
export function GoalSummary({
  goal,
  onReceipt
}: {
  goal: IRescueGoal;
  onReceipt?: () => void;
}) {
  const pledges = goal.pledges || ({} as IRescueGoal['pledges']);
  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="min-w-0 break-words">{goal.title}</CardTitle>
          <GoalStatusBadge status={goal.status} expired={goal.expired} />
        </div>
        <CardDescription className="normal-case">
          {goal.shelter?.name || 'Unknown shelter'} · {goal.deliverable}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {goal.expired && (
          <p className="rounded-md border border-slate-400 bg-slate-50 p-3 text-sm">
            This goal passed its end date, so players can no longer give to it.
            Deliver it if the money is spent, or cancel it to give every Tail
            back.
          </p>
        )}
        <GoalProgress
          raisedTails={goal.raisedTails}
          targetTails={goal.targetTails}
        />
        <dl className="grid gap-3">
          {goal.description && (
            <Row label="Description">{goal.description}</Row>
          )}
          <Row label="Still needed">{tailsText(goal.remainingTails)}</Row>
          <Row label="Gives">
            {pledges.CONFIRMED || 0} confirmed
            {pledges.PENDING ? ` · ${pledges.PENDING} on their way` : ''}
            {pledges.REFUNDED ? ` · ${pledges.REFUNDED} refunded` : ''}
            {pledges.REJECTED ? ` · ${pledges.REJECTED} refused` : ''}
          </Row>
          <Row label="Budget month">
            {goal.budgetMonth} ({goal.budgetMonthGoals} goals that month)
          </Row>
          <Row label="Money set aside">
            <span className="font-mono">
              {formatFunding(goal.funding.amountCents, goal.funding.currency)}
            </span>{' '}
            · {goal.funding.line}
            {goal.funding.note ? ` · ${goal.funding.note}` : ''}
            <span className="block text-xs text-muted-foreground">
              CMS only. Never shown in the game or on the website.
            </span>
          </Row>
          <Row label="Proof owner">{goal.proofOwner}</Row>
          <Row label="Opened">{day(goal.createdAt)}</Row>
          {goal.endsAt && <Row label="Ends">{day(goal.endsAt)}</Row>}
          {goal.filledAt && <Row label="Filled">{day(goal.filledAt)}</Row>}
          {goal.cancelledAt && (
            <Row label="Cancelled">
              {day(goal.cancelledAt)}
              {goal.cancelReason ? ` · ${goal.cancelReason}` : ''}
            </Row>
          )}
        </dl>
        {goal.delivery && (
          <section
            aria-label="Delivery proof"
            className="grid gap-3 rounded-md border border-emerald-500 bg-emerald-50/70 p-3"
          >
            <h4 className="text-sm font-bold">
              Delivered {day(goal.delivery.deliveredAt)}
            </h4>
            <img
              src={goal.delivery.photoUrl}
              alt={`Delivery photo: ${goal.deliverable}`}
              className="max-h-72 w-full rounded-md object-contain"
            />
            <dl className="grid gap-3">
              {goal.delivery.note && (
                <Row label="Note">{goal.delivery.note}</Row>
              )}
              <Row label="Receipt SHA-256">
                <span className="break-all font-mono text-xs">
                  {goal.delivery.receiptSha256}
                </span>
              </Row>
              {goal.delivery.txHash && (
                <Row label="Transaction (web only)">
                  <span className="break-all font-mono text-xs">
                    {goal.delivery.txHash}
                  </span>
                </Row>
              )}
            </dl>
            {onReceipt && goal.receipt && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="sm:w-auto"
                onClick={onReceipt}
              >
                Download receipt
              </Button>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export interface DeliverInput {
  photo: File;
  receipt: File;
  note: string;
  txHash: string;
}

/**
 * Deliver with proof (plan G5): a photo (re-encoded by the server, metadata stripped, then public)
 * and the receipt (kept private; its SHA-256 is public). The transaction hash is optional and shown
 * on the website only, never in the app.
 */
export function DeliverPanel({
  goal,
  onDeliver
}: {
  goal: IRescueGoal;
  onDeliver: (input: DeliverInput) => Promise<boolean>;
}) {
  const uid = useId();
  const [photo, setPhoto] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptHash, setReceiptHash] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [txHash, setTxHash] = useState('');
  const [busy, setBusy] = useState(false);

  if (!canDeliver(goal)) return null;

  const missing = [
    !photo && 'delivery photo',
    photo && !PHOTO_MIMES.includes(photo.type) && 'photo as JPEG, PNG or WebP',
    photo && photo.size > PHOTO_MAX_BYTES && 'photo under 5 MB',
    !receipt && 'receipt',
    receipt &&
      !RECEIPT_MIMES.includes(receipt.type) &&
      'receipt as PDF or image',
    receipt && receipt.size > RECEIPT_MAX_BYTES && 'receipt under 10 MB',
    txHash.trim() &&
      !TX_HASH.test(txHash.trim()) &&
      'a 64-character transaction hash'
  ].filter(Boolean) as string[];

  const pickReceipt = async (file: File | null) => {
    setReceipt(file);
    setReceiptHash(file ? await sha256OfFile(file) : null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || missing.length || !photo || !receipt) return;
    setBusy(true);
    try {
      await onDeliver({ photo, receipt, note, txHash });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deliver</CardTitle>
        <CardDescription className="normal-case">
          {goal.status === 'OPEN'
            ? 'This goal is not filled yet. You can still deliver it; gives stop once it is delivered.'
            : 'Players filled this goal. Buy it, then upload the proof.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={submit}
          aria-label="Deliver goal"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${uid}-photo`} className="text-sm font-bold">
                Delivery photo
              </label>
              <input
                id={`${uid}-photo`}
                type="file"
                accept={PHOTO_MIMES.join(',')}
                className="text-sm"
                onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                Public. No faces, names, addresses or documents in the frame.
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${uid}-receipt`} className="text-sm font-bold">
                Receipt
              </label>
              <input
                id={`${uid}-receipt`}
                type="file"
                accept={RECEIPT_MIMES.join(',')}
                className="text-sm"
                onChange={(e) => pickReceipt(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                PDF or image, up to 10 MB. Private; only its SHA-256 is public.
              </p>
              {receiptHash && (
                <p
                  className="break-all font-mono text-xs"
                  data-testid="goal-receipt-hash"
                >
                  SHA-256 {receiptHash}
                </p>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${uid}-note`} className="text-sm font-bold">
                Note (optional)
              </label>
              <Input
                id={`${uid}-note`}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${uid}-tx`} className="text-sm font-bold">
                Transaction hash (optional)
              </label>
              <Input
                id={`${uid}-tx`}
                value={txHash}
                placeholder="0x…"
                onChange={(e) => setTxHash(e.target.value.trim())}
              />
              <p className="text-xs text-muted-foreground">
                Shown on the website only, never in the app.
              </p>
            </div>
          </div>
          {missing.length > 0 && (
            <p
              id={`${uid}-missing`}
              className="text-sm text-muted-foreground"
              data-testid="deliver-missing"
            >
              Still needed: {missing.join(', ')}.
            </p>
          )}
          <Button
            type="submit"
            aria-describedby={missing.length > 0 ? `${uid}-missing` : undefined}
            disabled={busy || missing.length > 0}
            className="sm:w-auto"
          >
            {busy ? 'Uploading…' : 'Mark delivered'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Cancel with a reason. Every give is refunded to the players; it cannot be undone. */
export function CancelPanel({
  goal,
  onCancelGoal
}: {
  goal: IRescueGoal;
  onCancelGoal: (reason: string) => Promise<boolean>;
}) {
  const uid = useId();
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canCancel(goal)) return null;
  const length = reason.trim().length;
  const ready = length >= 3 && length <= 300 && sure;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    try {
      await onCancelGoal(reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-rose-300">
      <CardHeader>
        <CardTitle>Cancel goal</CardTitle>
        <CardDescription className="normal-case">
          {goal.pledges?.CONFIRMED
            ? `All ${goal.pledges.CONFIRMED} gives (${tailsText(goal.raisedTails)}) go back to the players.`
            : 'No one has given to it yet.'}{' '}
          This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit} aria-label="Cancel goal">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-reason`} className="text-sm font-bold">
              Reason
            </label>
            <Input
              id={`${uid}-reason`}
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <label
            htmlFor={`${uid}-sure`}
            className="flex min-h-[44px] items-center gap-3 text-sm font-bold"
          >
            <input
              id={`${uid}-sure`}
              type="checkbox"
              className="h-5 w-5"
              checked={sure}
              onChange={(e) => setSure(e.target.checked)}
            />
            Refund every give and close this goal.
          </label>
          <Button
            type="submit"
            variant="destructive"
            disabled={busy || !ready}
            className="sm:w-auto"
          >
            {busy ? 'Cancelling…' : 'Cancel goal'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
