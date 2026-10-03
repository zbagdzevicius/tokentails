'use client';

import { goalErrorText, RESCUE_GOALS_API } from '@/api/rescue-goals-api';
import { GoalForm } from '@/components/rescue-goals/goal-form';
import {
  CancelPanel,
  DeliverInput,
  DeliverPanel,
  GoalSummary
} from '@/components/rescue-goals/goal-panels';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/context/ToastContext';
import { canEdit, IRescueGoal, IRescueGoalUpdate } from '@/models/rescue-goal';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

/** One goal: progress, funding, proof; edit wording, deliver with photo and receipt, or cancel. */
export default function RescueGoalPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || '';
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['rescue-goal', id],
    queryFn: () => RESCUE_GOALS_API.get(id),
    enabled: !!id
  });
  const goal: IRescueGoal | null = data?.ok ? data.data : null;

  const handle = async (
    result: Awaited<ReturnType<typeof RESCUE_GOALS_API.get>>,
    message: string
  ) => {
    if (!result.ok) {
      toast({ message: goalErrorText(result.error) });
      return false;
    }
    toast({ message });
    await refetch();
    return true;
  };

  const save = async (change: IRescueGoalUpdate) => {
    if (!Object.keys(change).length) {
      setEditing(false);
      return true;
    }
    const ok = await handle(
      await RESCUE_GOALS_API.update(id, change),
      'Goal saved.'
    );
    if (ok) setEditing(false);
    return ok;
  };

  const deliver = async (input: DeliverInput) =>
    handle(
      await RESCUE_GOALS_API.deliver(id, input),
      'Delivered. The photo and receipt hash are public now.'
    );

  const cancel = async (reason: string) =>
    handle(
      await RESCUE_GOALS_API.cancel(id, reason),
      'Goal cancelled. Every give is going back to the players.'
    );

  const openReceipt = async () => {
    const url = await RESCUE_GOALS_API.receiptUrl(id);
    if (!url) {
      toast({ message: 'The receipt could not be loaded.' });
      return;
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt-${id}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 pb-16">
      <Link
        href="/rescue-goals"
        className="text-sm font-semibold underline underline-offset-4"
      >
        ← All goals
      </Link>
      {isLoading && <p className="text-sm">Loading…</p>}
      {data && !data.ok && (
        <p className="rounded-md bg-white/80 p-3 text-sm" role="alert">
          {goalErrorText(data.error)}
        </p>
      )}
      {goal && (
        <>
          <GoalSummary goal={goal} onReceipt={openReceipt} />
          {canEdit(goal) &&
            (editing ? (
              <Card>
                <CardHeader>
                  <CardTitle>Edit goal</CardTitle>
                </CardHeader>
                <CardContent>
                  <GoalForm
                    shelters={[]}
                    goal={goal}
                    onUpdate={save}
                    onCancel={() => setEditing(false)}
                  />
                </CardContent>
              </Card>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-auto justify-self-start"
                onClick={() => setEditing(true)}
              >
                Edit wording
              </Button>
            ))}
          <DeliverPanel goal={goal} onDeliver={deliver} />
          <CancelPanel goal={goal} onCancelGoal={cancel} />
        </>
      )}
    </div>
  );
}
