'use client';

import {
  IPayout,
  IPayoutInput,
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHODS,
  PAYOUT_PURPOSE_LABELS,
  PAYOUT_PURPOSES,
  PayoutMethod,
  PayoutPurpose,
  sha256OfFile
} from '@/api/payouts-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useId, useState } from 'react';

export interface ShelterOption {
  _id: string;
  name: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const FIELD =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/** A labelled control: the label is always visible and tied to the input. */
function Field({
  id,
  label,
  hint,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface PayoutFormProps {
  shelters: ShelterOption[];
  /** Editing a draft: fields start from it and the receipt is optional. */
  draft?: IPayout | null;
  onSubmit: (input: IPayoutInput, receipt: File | null) => Promise<boolean>;
  onCancel?: () => void;
}

/**
 * Draft a payout with its receipt (plan G4 "Attestation"). The receipt is hashed in the browser so the
 * author sees the SHA-256 the server will store; the file itself is never kept by the backend.
 */
export function PayoutForm({
  shelters,
  draft,
  onSubmit,
  onCancel
}: PayoutFormProps) {
  const uid = useId();
  const [shelter, setShelter] = useState(
    draft?.shelter._id || shelters[0]?._id || ''
  );
  const [purpose, setPurpose] = useState<PayoutPurpose>(
    draft?.purpose || 'outcome'
  );
  const [amount, setAmount] = useState(draft?.amount || '');
  const [symbol, setSymbol] = useState(draft?.symbol || 'EUR');
  const [paidAt, setPaidAt] = useState(draft?.paidAt || today());
  const [method, setMethod] = useState<PayoutMethod>(
    draft?.method || 'bank-transfer'
  );
  const [pledgeMonth, setPledgeMonth] = useState(draft?.pledgeMonth || '');
  const [usdCents, setUsdCents] = useState(
    draft?.usdEquivalent ? String(draft.usdEquivalent.cents) : ''
  );
  const [fxDate, setFxDate] = useState(draft?.usdEquivalent?.fxDate || '');
  const [fxSource, setFxSource] = useState(
    draft?.usdEquivalent?.fxSource || ''
  );
  const [reference, setReference] = useState(draft?.reference || '');
  const [txHash, setTxHash] = useState(draft?.txHash || '');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptHash, setReceiptHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsUsd =
    purpose === 'purchase-pledge' && symbol.toUpperCase() !== 'USD';
  const missing = [
    !shelter && 'shelter',
    !/^\d{1,12}(\.\d{1,18})?$/.test(amount) && 'amount',
    !/^[A-Za-z]{3,5}$/.test(symbol) && 'currency',
    !paidAt && 'date paid',
    purpose === 'purchase-pledge' && !pledgeMonth && 'pledge month',
    needsUsd && (!usdCents || !fxDate || !fxSource) && 'USD equivalent',
    method === 'onchain' &&
      !/^0x[0-9a-fA-F]{64}$/.test(txHash) &&
      'transaction hash',
    !draft && !receipt && 'receipt'
  ].filter(Boolean) as string[];

  const pickReceipt = async (file: File | null) => {
    setReceipt(file);
    setReceiptHash(file ? await sha256OfFile(file) : null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || missing.length) return;
    setBusy(true);
    try {
      await onSubmit(
        {
          shelter,
          purpose,
          amount,
          symbol: symbol.toUpperCase(),
          paidAt,
          method,
          pledgeMonth: purpose === 'purchase-pledge' ? pledgeMonth : '',
          usdCents: needsUsd || usdCents ? usdCents : '',
          fxDate: needsUsd || usdCents ? fxDate : '',
          fxSource: needsUsd || usdCents ? fxSource : '',
          reference,
          txHash: method === 'onchain' ? txHash : ''
        },
        receipt
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={submit}
      aria-label={draft ? 'Edit draft payout' : 'New draft payout'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${uid}-shelter`} label="Shelter">
          <select
            id={`${uid}-shelter`}
            className={FIELD}
            value={shelter}
            onChange={(e) => setShelter(e.target.value)}
          >
            {shelters.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${uid}-purpose`} label="Purpose">
          <select
            id={`${uid}-purpose`}
            className={FIELD}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as PayoutPurpose)}
          >
            {PAYOUT_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {PAYOUT_PURPOSE_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={`${uid}-amount`}
          label="Amount"
          hint="As on the receipt, e.g. 40.00"
        >
          <Input
            id={`${uid}-amount`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
          />
        </Field>
        <Field id={`${uid}-symbol`} label="Currency" hint="EUR, USD, USDC…">
          <Input
            id={`${uid}-symbol`}
            value={symbol}
            maxLength={5}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
        </Field>
        <Field id={`${uid}-paid`} label="Date paid">
          <Input
            id={`${uid}-paid`}
            type="date"
            max={today()}
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </Field>
        <Field id={`${uid}-method`} label="Paid by">
          <select
            id={`${uid}-method`}
            className={FIELD}
            value={method}
            onChange={(e) => setMethod(e.target.value as PayoutMethod)}
          >
            {PAYOUT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYOUT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        {purpose === 'purchase-pledge' && (
          <Field id={`${uid}-month`} label="Pledge month covered">
            <Input
              id={`${uid}-month`}
              type="month"
              value={pledgeMonth}
              onChange={(e) => setPledgeMonth(e.target.value)}
            />
          </Field>
        )}
        {method === 'onchain' && (
          <Field id={`${uid}-tx`} label="Transaction hash">
            <Input
              id={`${uid}-tx`}
              value={txHash}
              placeholder="0x…"
              onChange={(e) => setTxHash(e.target.value.trim())}
            />
          </Field>
        )}
        <Field
          id={`${uid}-ref`}
          label="Reference (optional)"
          hint="Invoice or transfer number. No names, emails, phone numbers or IBANs."
        >
          <Input
            id={`${uid}-ref`}
            value={reference}
            maxLength={80}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
      </div>

      {(needsUsd || purpose === 'purchase-pledge') && (
        <fieldset className="grid gap-4 rounded-md border border-amber-400 bg-amber-50/70 p-3 sm:grid-cols-3">
          <legend className="px-1 text-sm font-bold">
            USD equivalent{' '}
            {needsUsd ? '(required: the pledge is in USD)' : '(optional)'}
          </legend>
          <Field id={`${uid}-usd`} label="USD cents">
            <Input
              id={`${uid}-usd`}
              inputMode="numeric"
              value={usdCents}
              onChange={(e) => setUsdCents(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field id={`${uid}-fxdate`} label="FX date">
            <Input
              id={`${uid}-fxdate`}
              type="date"
              value={fxDate}
              onChange={(e) => setFxDate(e.target.value)}
            />
          </Field>
          <Field id={`${uid}-fxsrc`} label="FX source">
            <Input
              id={`${uid}-fxsrc`}
              value={fxSource}
              placeholder="ECB reference rate"
              maxLength={80}
              onChange={(e) => setFxSource(e.target.value)}
            />
          </Field>
        </fieldset>
      )}

      <Field
        id={`${uid}-receipt`}
        label={draft ? 'Replace receipt (optional)' : 'Receipt'}
        hint="PDF or image, up to 10 MB. Only its SHA-256 is stored; the shelter confirms with the same file."
      >
        <input
          id={`${uid}-receipt`}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          className="text-sm"
          onChange={(e) => pickReceipt(e.target.files?.[0] || null)}
        />
        {receiptHash && (
          <p className="break-all font-mono text-xs" data-testid="receipt-hash">
            SHA-256 {receiptHash}
          </p>
        )}
      </Field>

      {missing.length > 0 && (
        <p className="text-sm text-muted-foreground" role="status">
          Still needed: {missing.join(', ')}.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          disabled={busy || missing.length > 0}
          className="sm:w-auto"
        >
          {busy ? 'Saving…' : draft ? 'Save draft' : 'Create draft'}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="sm:w-auto"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
