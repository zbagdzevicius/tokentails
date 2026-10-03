'use client';

import {
  ApiResult,
  errorText,
  formatAmount,
  IPayout,
  PAYOUT_METHOD_LABELS,
  PAYOUT_PURPOSE_LABELS,
  sha256OfFile
} from '@/api/payouts-api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useId, useState } from 'react';
import { PayoutStatusBadge } from './status-badge';

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

/** The draft as the confirmer sees it: every field that the attestation hash covers. */
export function PayoutSummary({ payout }: { payout: IPayout }) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{formatAmount(payout.amount, payout.symbol)}</CardTitle>
          <PayoutStatusBadge status={payout.status} />
        </div>
        <CardDescription className="normal-case">
          {payout.shelter.name} · paid {payout.paidAt} · {payout.id}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3">
          <Row label="Purpose">
            {PAYOUT_PURPOSE_LABELS[payout.purpose]}
            {payout.pledgeMonth ? ` (${payout.pledgeMonth})` : ''}
          </Row>
          <Row label="Paid by">{PAYOUT_METHOD_LABELS[payout.method]}</Row>
          {payout.usdEquivalent && (
            <Row label="USD equivalent">
              {(payout.usdEquivalent.cents / 100).toFixed(2)} USD · FX{' '}
              {payout.usdEquivalent.fxDate} · {payout.usdEquivalent.fxSource}
            </Row>
          )}
          {payout.reference && <Row label="Reference">{payout.reference}</Row>}
          {payout.txHash && (
            <Row label="Transaction">
              <span className="break-all font-mono text-xs">
                {payout.txHash}
              </span>
            </Row>
          )}
          <Row label="Receipt SHA-256">
            <span className="break-all font-mono text-xs">
              {payout.receipt.sha256}
            </span>
          </Row>
          {payout.confirmedAt && (
            <Row label="Confirmed">{payout.confirmedAt.slice(0, 10)}</Row>
          )}
          {payout.signature && (
            <Row label="Signed by">
              <span className="break-all font-mono text-xs">
                {payout.signature.signer}
              </span>
            </Row>
          )}
        </dl>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-bold">
            Attestation text
          </summary>
          <pre
            className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-50"
            data-testid="attestation-message"
          >
            {payout.attestationMessage}
          </pre>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            SHA-256 {payout.attestationHash}
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

type Check =
  | { state: 'idle' }
  | { state: 'match' }
  | { state: 'mismatch'; hash: string };

/**
 * SHELTER-CONFIRMED. A shelter member who did not write the draft picks the receipt they hold; the
 * browser hashes it and compares with the stored SHA-256 before anything is sent, and the server
 * checks it again (with the attestation hash, so a draft edited meanwhile is refused).
 */
export function ConfirmPanel({
  payout,
  onConfirm
}: {
  payout: IPayout;
  onConfirm: (
    attestationHash: string,
    receipt: File
  ) => Promise<ApiResult<IPayout>>;
}) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (payout.status !== 'DRAFT') return null;

  const pick = async (next: File | null) => {
    setError('');
    setFile(next);
    if (!next) return setCheck({ state: 'idle' });
    const hash = await sha256OfFile(next);
    setCheck(
      hash === payout.receipt.sha256
        ? { state: 'match' }
        : { state: 'mismatch', hash }
    );
  };

  const confirm = async () => {
    if (!file || busy) return;
    setBusy(true);
    const result = await onConfirm(payout.attestationHash, file);
    setBusy(false);
    if (!result.ok) setError(errorText(result.error));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm as the shelter</CardTitle>
        <CardDescription className="normal-case">
          {payout.canConfirm
            ? 'Check the text above against your own records, then choose the receipt you hold.'
            : payout.createdByMe || payout.editedByMe
              ? 'You wrote or edited this draft, so another member of the shelter has to confirm it.'
              : 'Only a member of this shelter can confirm it. An admin grants membership.'}
        </CardDescription>
      </CardHeader>
      {payout.canConfirm && (
        <CardContent className="grid gap-3">
          <label htmlFor={id} className="text-sm font-bold">
            Your copy of the receipt
          </label>
          <input
            id={id}
            type="file"
            accept="application/pdf,image/*"
            className="text-sm"
            onChange={(e) => pick(e.target.files?.[0] || null)}
          />
          {check.state === 'match' && (
            <p className="text-sm font-semibold text-emerald-800" role="status">
              The file matches the receipt on the draft.
            </p>
          )}
          {check.state === 'mismatch' && (
            <p className="text-sm font-semibold text-rose-800" role="alert">
              This file is different from the receipt on the draft (SHA-256{' '}
              {check.hash.slice(0, 16)}…). Do not confirm.
            </p>
          )}
          {error && (
            <p className="text-sm font-semibold text-rose-800" role="alert">
              {error}
            </p>
          )}
          <Button
            className="sm:w-auto sm:justify-self-start"
            disabled={check.state !== 'match' || busy}
            onClick={confirm}
          >
            {busy ? 'Confirming…' : 'Confirm this payout'}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

/** SHELTER-SIGNED: paste the shelter wallet's personal_sign signature of the attestation text. */
export function SignaturePanel({
  payout,
  onSign
}: {
  payout: IPayout;
  onSign: (signature: string) => Promise<ApiResult<IPayout>>;
}) {
  const id = useId();
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (payout.status === 'SHELTER_SIGNED' || payout.status === 'VOID')
    return null;
  const valid = /^0x[0-9a-fA-F]{130}$/.test(signature.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const result = await onSign(signature);
    setBusy(false);
    if (!result.ok) setError(errorText(result.error));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shelter signature</CardTitle>
        <CardDescription className="normal-case">
          {payout.canSign
            ? 'The shelter signs the attestation text with its own wallet (personal_sign). Paste the signature here.'
            : 'Opens once the shelter holds its own wallet key. Until then the payout can only be confirmed (amber).'}
        </CardDescription>
      </CardHeader>
      {payout.canSign && (
        <CardContent className="grid gap-3">
          <label htmlFor={id} className="text-sm font-bold">
            Signature
          </label>
          <textarea
            id={id}
            rows={3}
            spellCheck={false}
            className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
            placeholder="0x…"
            value={signature}
            onChange={(e) => {
              setError('');
              setSignature(e.target.value);
            }}
          />
          {error && (
            <p className="text-sm font-semibold text-rose-800" role="alert">
              {error}
            </p>
          )}
          <Button
            className="sm:w-auto sm:justify-self-start"
            disabled={!valid || busy}
            onClick={submit}
          >
            {busy ? 'Checking…' : 'Submit signature'}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
