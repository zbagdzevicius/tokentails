'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  GOAL_FUNDING_CURRENCIES,
  GOAL_TARGET_MAX,
  GOAL_TARGET_MIN,
  GOALS_PER_BUDGET_MONTH_MAX,
  GOALS_PER_BUDGET_MONTH_MIN_HINT,
  GoalFundingCurrency,
  goalInputProblems,
  IRescueGoal,
  IRescueGoalInput,
  IRescueGoalUpdate,
  monthOf
} from '@/models/rescue-goal';
import { useId, useState } from 'react';

export interface GoalShelterOption {
  _id: string;
  name: string;
}

const FIELD =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

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
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** `YYYY-MM-DD` from the date input to the end of that day, UTC. Empty stays empty. */
export const endOfDayIso = (day: string) =>
  day ? new Date(`${day}T23:59:59.000Z`).toISOString() : '';

export interface GoalFormProps {
  shelters: GoalShelterOption[];
  /** Editing: only wording, picture, end date and proof owner can change. */
  goal?: IRescueGoal | null;
  /** How many goals each budget month already holds (not counting cancelled ones). */
  monthCounts?: Record<string, number>;
  onCreate?: (input: IRescueGoalInput) => Promise<boolean>;
  onUpdate?: (input: IRescueGoalUpdate) => Promise<boolean>;
  onCancel?: () => void;
  now?: Date;
}

/**
 * Open a Rescue Goal (plan G5, decision #37). There is no draft: a goal opens the moment it is saved,
 * so the form refuses to send until the money is marked set aside with its line and amount. The
 * amount and the line stay in the CMS; players see only the Tails target and what it buys.
 */
export function GoalForm({
  shelters,
  goal,
  monthCounts = {},
  onCreate,
  onUpdate,
  onCancel,
  now = new Date()
}: GoalFormProps) {
  const uid = useId();
  const editing = !!goal;
  const [shelter, setShelter] = useState(
    goal?.shelter?._id || shelters[0]?._id || ''
  );
  const [title, setTitle] = useState(goal?.title || '');
  const [deliverable, setDeliverable] = useState(goal?.deliverable || '');
  const [description, setDescription] = useState(goal?.description || '');
  const [image, setImage] = useState(goal?.image || '');
  const [targetTails, setTargetTails] = useState(
    goal ? String(goal.targetTails) : ''
  );
  const [endsAt, setEndsAt] = useState(goal?.endsAt?.slice(0, 10) || '');
  const [budgetMonth, setBudgetMonth] = useState(
    goal?.budgetMonth || monthOf(now)
  );
  const [proofOwner, setProofOwner] = useState(goal?.proofOwner || '');
  const [fundingSetAside, setFundingSetAside] = useState(false);
  const [fundingLine, setFundingLine] = useState('');
  const [fundingAmount, setFundingAmount] = useState('');
  const [fundingCurrency, setFundingCurrency] =
    useState<GoalFundingCurrency>('EUR');
  const [fundingNote, setFundingNote] = useState('');
  const [busy, setBusy] = useState(false);

  const createInput: IRescueGoalInput = {
    shelter,
    title,
    deliverable,
    description,
    image,
    targetTails: Number(targetTails),
    endsAt: endOfDayIso(endsAt),
    budgetMonth,
    proofOwner,
    fundingSetAside,
    fundingLine,
    fundingAmount,
    fundingCurrency,
    fundingNote
  };
  const inMonth = monthCounts[budgetMonth] || 0;
  const monthFull = !editing && inMonth >= GOALS_PER_BUDGET_MONTH_MAX;
  const problems = editing
    ? goalInputProblems(
        {
          ...createInput,
          // Fields that cannot change while editing are taken as valid.
          shelter: 'x',
          targetTails: GOAL_TARGET_MIN,
          budgetMonth: goal!.budgetMonth,
          fundingSetAside: true,
          fundingLine: 'xx',
          fundingAmount: '1',
          fundingCurrency: 'EUR',
          endsAt:
            endsAt === goal!.endsAt?.slice(0, 10) ? '' : endOfDayIso(endsAt)
        },
        now
      )
    : goalInputProblems(createInput, now);
  if (monthFull) problems.push(`room in ${budgetMonth}`);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || problems.length) return;
    setBusy(true);
    try {
      if (editing) {
        const change: IRescueGoalUpdate = {};
        const put = <K extends keyof IRescueGoalUpdate>(
          key: K,
          next: string,
          before: string
        ) => {
          if (next.trim() !== before.trim()) change[key] = next.trim();
        };
        put('title', title, goal!.title);
        put('deliverable', deliverable, goal!.deliverable);
        put('description', description, goal!.description || '');
        put('image', image, goal!.image || '');
        put('proofOwner', proofOwner, goal!.proofOwner);
        if (endsAt !== (goal!.endsAt?.slice(0, 10) || '')) {
          change.endsAt = endOfDayIso(endsAt);
        }
        await onUpdate?.(change);
      } else {
        await onCreate?.(createInput);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={submit}
      aria-label={editing ? 'Edit goal' : 'Open a goal'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${uid}-shelter`} label="Shelter">
          <select
            id={`${uid}-shelter`}
            className={FIELD}
            value={shelter}
            disabled={editing}
            onChange={(e) => setShelter(e.target.value)}
          >
            {editing &&
              goal?.shelter &&
              !shelters.some((s) => s._id === shelter) && (
                <option value={goal.shelter._id}>{goal.shelter.name}</option>
              )}
            {shelters.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={`${uid}-title`}
          label="Title"
          hint="What players see on the goal card, e.g. Winter food for Pink Paw"
        >
          <Input
            id={`${uid}-title`}
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          id={`${uid}-deliverable`}
          label="What it buys"
          hint="Plain words, e.g. 10 kg of kitten food"
        >
          <Input
            id={`${uid}-deliverable`}
            value={deliverable}
            maxLength={140}
            onChange={(e) => setDeliverable(e.target.value)}
          />
        </Field>
        <Field
          id={`${uid}-target`}
          label="Tails target"
          hint={`${GOAL_TARGET_MIN.toLocaleString('en-US')} to ${GOAL_TARGET_MAX.toLocaleString('en-US')}. Fixed once the goal opens.`}
        >
          <Input
            id={`${uid}-target`}
            inputMode="numeric"
            value={targetTails}
            disabled={editing}
            onChange={(e) => setTargetTails(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field
          id={`${uid}-month`}
          label="Budget month"
          hint={
            editing
              ? undefined
              : `${inMonth} of ${GOALS_PER_BUDGET_MONTH_MAX} goals this month (aim for ${GOALS_PER_BUDGET_MONTH_MIN_HINT} to ${GOALS_PER_BUDGET_MONTH_MAX}).`
          }
        >
          <Input
            id={`${uid}-month`}
            type="month"
            value={budgetMonth}
            disabled={editing}
            onChange={(e) => setBudgetMonth(e.target.value)}
          />
        </Field>
        <Field
          id={`${uid}-owner`}
          label="Proof owner"
          hint="The person who buys it and uploads the photo and receipt. Not shown to players."
        >
          <Input
            id={`${uid}-owner`}
            value={proofOwner}
            maxLength={80}
            onChange={(e) => setProofOwner(e.target.value)}
          />
        </Field>
        <Field
          id={`${uid}-ends`}
          label="Ends (optional)"
          hint="Gives stop after this day (UTC). Leave empty to keep it open until filled."
        >
          <Input
            id={`${uid}-ends`}
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </Field>
        <Field
          id={`${uid}-image`}
          label="Picture URL (optional)"
          hint="Paste a link from the CMS image upload (Token Tails storage only)"
        >
          <Input
            id={`${uid}-image`}
            value={image}
            maxLength={500}
            placeholder="https://"
            onChange={(e) => setImage(e.target.value)}
          />
        </Field>
      </div>
      <Field id={`${uid}-description`} label="Description (optional)">
        <textarea
          id={`${uid}-description`}
          className={`${FIELD} min-h-[5rem]`}
          value={description}
          maxLength={600}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      {!editing && (
        <fieldset
          className="grid gap-4 rounded-md border border-amber-400 bg-amber-50/70 p-3 sm:grid-cols-3"
          data-testid="funding-fieldset"
        >
          <legend className="px-1 text-sm font-bold">
            Money set aside (required)
          </legend>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            A goal opens only when its money is already set aside. These fields
            stay in the CMS and never appear in the game or on the website.
          </p>
          <Field
            id={`${uid}-line`}
            label="Budget or sponsor line"
            hint="e.g. October budget, Sponsor X"
          >
            <Input
              id={`${uid}-line`}
              value={fundingLine}
              maxLength={80}
              onChange={(e) => setFundingLine(e.target.value)}
            />
          </Field>
          <Field id={`${uid}-amount`} label="Amount" hint="e.g. 49.90">
            <Input
              id={`${uid}-amount`}
              inputMode="decimal"
              value={fundingAmount}
              onChange={(e) =>
                setFundingAmount(e.target.value.replace(',', '.'))
              }
            />
          </Field>
          <Field id={`${uid}-currency`} label="Currency">
            <select
              id={`${uid}-currency`}
              className={FIELD}
              value={fundingCurrency}
              onChange={(e) =>
                setFundingCurrency(e.target.value as GoalFundingCurrency)
              }
            >
              {GOAL_FUNDING_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-3">
            <Field id={`${uid}-note`} label="Funding note (optional)">
              <Input
                id={`${uid}-note`}
                value={fundingNote}
                maxLength={300}
                onChange={(e) => setFundingNote(e.target.value)}
              />
            </Field>
          </div>
          <label
            htmlFor={`${uid}-setaside`}
            className="flex min-h-[44px] items-center gap-3 text-sm font-bold sm:col-span-3"
          >
            <input
              id={`${uid}-setaside`}
              type="checkbox"
              className="h-5 w-5"
              checked={fundingSetAside}
              onChange={(e) => setFundingSetAside(e.target.checked)}
            />
            The money for this goal is set aside and will be spent on it.
          </label>
        </fieldset>
      )}

      {problems.length > 0 && (
        <p
          id={`${uid}-missing`}
          className="text-sm text-muted-foreground"
          data-testid="goal-missing"
        >
          Still needed: {problems.join(', ')}.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          aria-describedby={problems.length > 0 ? `${uid}-missing` : undefined}
          disabled={busy || problems.length > 0}
          className="sm:w-auto"
        >
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Open goal'}
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
