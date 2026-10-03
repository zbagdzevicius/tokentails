'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ANIMAL_NAME,
  IOutcome,
  IOutcomeInput,
  OUTCOME_TYPE_LABELS,
  OUTCOME_TYPES,
  OutcomeType
} from '@/models/outcome';
import { useId, useState } from 'react';

const FIELD =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const today = () => new Date().toISOString().slice(0, 10);

export interface OutcomeFormProps {
  shelters: { _id: string; name: string }[];
  outcome?: IOutcome | null;
  onSubmit: (input: IOutcomeInput) => Promise<boolean>;
  onCancel?: () => void;
}

/**
 * Outcome fields (plan G11): type, date, amount, the animal's name only and an optional payout link.
 * Saving any change clears the redaction check and approval, so the reviewers see the final text.
 */
export function OutcomeForm({
  shelters,
  outcome,
  onSubmit,
  onCancel
}: OutcomeFormProps) {
  const uid = useId();
  const [shelter, setShelter] = useState(
    outcome?.shelterId || shelters[0]?._id || ''
  );
  const [type, setType] = useState<OutcomeType>(outcome?.type || 'treatment');
  const [date, setDate] = useState(outcome?.date || today());
  const [animalName, setAnimalName] = useState(outcome?.animalName || '');
  const [amount, setAmount] = useState(outcome?.amount || '');
  const [symbol, setSymbol] = useState(
    outcome?.symbol || (outcome ? '' : 'EUR')
  );
  const [payout, setPayout] = useState(outcome?.payoutId || '');
  const [busy, setBusy] = useState(false);

  const nameError =
    animalName && !ANIMAL_NAME.test(animalName.trim())
      ? "The animal's name only: letters, spaces, apostrophes, dots and hyphens (40 at most)."
      : '';
  const amountError =
    amount && !/^\d{1,12}(\.\d{1,18})?$/.test(amount)
      ? 'Use a number like 120.50'
      : '';
  // A currency without an amount is dropped on save, so only a missing currency is an error.
  const symbolError =
    amount && !/^[A-Za-z]{3,5}$/.test(symbol)
      ? 'An amount needs its currency (EUR, USD…)'
      : '';
  const payoutError =
    payout && !/^p-[0-9a-f]{12}$/.test(payout)
      ? 'A payout id looks like p-1a2b3c4d5e6f'
      : '';
  const blocked =
    !shelter ||
    !date ||
    !!(nameError || amountError || symbolError || payoutError);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked || busy) return;
    setBusy(true);
    try {
      await onSubmit({
        shelter,
        type,
        date,
        animalName: animalName.trim(),
        amount,
        symbol: amount ? symbol.toUpperCase() : '',
        payout
      });
    } finally {
      setBusy(false);
    }
  };

  const error = (id: string, text: string) =>
    text ? (
      <p id={id} className="text-xs font-semibold text-rose-800" role="alert">
        {text}
      </p>
    ) : null;

  return (
    <form
      className="grid gap-4"
      onSubmit={submit}
      aria-label={outcome ? 'Edit outcome' : 'New outcome'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-shelter`} className="text-sm font-bold">
            Shelter
          </label>
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
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-type`} className="text-sm font-bold">
            What happened
          </label>
          <select
            id={`${uid}-type`}
            className={FIELD}
            value={type}
            onChange={(e) => setType(e.target.value as OutcomeType)}
          >
            {OUTCOME_TYPES.map((t) => (
              <option key={t} value={t}>
                {OUTCOME_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-date`} className="text-sm font-bold">
            Date
          </label>
          <Input
            id={`${uid}-date`}
            type="date"
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-name`} className="text-sm font-bold">
            Animal&apos;s name (optional)
          </label>
          <Input
            id={`${uid}-name`}
            maxLength={40}
            value={animalName}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? `${uid}-name-error` : undefined}
            onChange={(e) => setAnimalName(e.target.value)}
          />
          {error(`${uid}-name-error`, nameError)}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-amount`} className="text-sm font-bold">
            Amount (optional)
          </label>
          <Input
            id={`${uid}-amount`}
            inputMode="decimal"
            value={amount}
            aria-invalid={!!amountError}
            onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
          />
          {error(`${uid}-amount-error`, amountError)}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-symbol`} className="text-sm font-bold">
            Currency
          </label>
          <Input
            id={`${uid}-symbol`}
            maxLength={5}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
          {error(`${uid}-symbol-error`, symbolError)}
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor={`${uid}-payout`} className="text-sm font-bold">
            Linked payout id (optional)
          </label>
          <Input
            id={`${uid}-payout`}
            placeholder="p-1a2b3c4d5e6f"
            value={payout}
            onChange={(e) => setPayout(e.target.value.trim())}
          />
          <p className="text-xs text-muted-foreground">
            The outcome shows the payout&apos;s evidence tier once that payout
            is confirmed or signed.
          </p>
          {error(`${uid}-payout-error`, payoutError)}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="sm:w-auto" disabled={blocked || busy}>
          {busy ? 'Saving…' : outcome ? 'Save changes' : 'Create outcome'}
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
