'use client';

import {
  goalErrorText,
  GoalFilter,
  RESCUE_GOALS_API
} from '@/api/rescue-goals-api';
import { SHELTER_API } from '@/api/shelter-api';
import { GoalForm } from '@/components/rescue-goals/goal-form';
import { GoalsTable } from '@/components/rescue-goals/goals-table';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useToast } from '@/context/ToastContext';
import { IRescueGoalInput, monthCountsOf } from '@/models/rescue-goal';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

const FILTERS: { value: GoalFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'FILLED', label: 'Filled' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' }
];

/** Rescue Goals (plan G5): open funded goals, deliver them with proof, cancel with refunds. MANAGER. */
export default function RescueGoalsPage() {
  const toast = useToast();
  const router = useRouter();
  const [filter, setFilter] = useState<GoalFilter>('ALL');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { data: goals, isLoading } = useQuery({
    queryKey: ['rescue-goals'],
    queryFn: async () => {
      const result = await RESCUE_GOALS_API.list();
      if (!result.ok) {
        setError(goalErrorText(result.error));
        return [];
      }
      setError('');
      return result.data;
    }
  });
  const { data: shelters } = useQuery({
    queryKey: ['shelter'],
    queryFn: () => SHELTER_API.sheltersFetch()
  });
  // House zones (Token Tails' own cats) cannot hold goals; the backend refuses them too.
  const options = (shelters || [])
    .filter((s) => s._id && (s as { role?: string }).role !== 'house')
    .map((s) => ({ _id: s._id as string, name: s.name }));
  const visible = useMemo(
    () =>
      (goals || []).filter(
        (goal) => filter === 'ALL' || goal.status === filter
      ),
    [goals, filter]
  );
  const monthCounts = useMemo(() => monthCountsOf(goals || []), [goals]);

  const create = async (input: IRescueGoalInput) => {
    const result = await RESCUE_GOALS_API.create(input);
    if (!result.ok) {
      toast({ message: goalErrorText(result.error) });
      return false;
    }
    toast({ message: 'Goal opened. Players can give to it now.' });
    router.push(`/rescue-goals/${result.data.id}`);
    return true;
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Rescue Goals</h1>
          <p className="text-sm text-muted-foreground">
            Shelter purchases whose money is already set aside. Players give
            Tails to pick which one gets delivered first.
          </p>
        </div>
        {!creating && (
          <Button
            size="sm"
            className="h-9 w-auto gap-1"
            onClick={() => setCreating(true)}
          >
            <PlusCircle className="h-4 w-4" aria-hidden />
            New goal
          </Button>
        )}
      </div>
      <div
        role="group"
        aria-label="Show goals by status"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            type="button"
            aria-pressed={option.value === filter}
            size="sm"
            className="w-auto text-sm"
            variant={option.value === filter ? 'default' : 'outline'}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {error && (
        <p className="rounded-md bg-white/80 p-3 text-sm" role="status">
          {error}
        </p>
      )}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>New goal</CardTitle>
            <CardDescription className="normal-case">
              It opens as soon as you save it. Players see the title, what it
              buys and the Tails target, never the money.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {options.length ? (
              <GoalForm
                shelters={options}
                monthCounts={monthCounts}
                onCreate={create}
                onCancel={() => setCreating(false)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Loading shelters…</p>
            )}
          </CardContent>
        </Card>
      )}
      <GoalsTable goals={visible} isLoading={isLoading} />
    </div>
  );
}
