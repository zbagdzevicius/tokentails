'use client';

import { OUTCOMES_API } from '@/api/outcomes-api';
import { errorText } from '@/api/payouts-api';
import { SHELTER_API } from '@/api/shelter-api';
import { OutcomeForm } from '@/components/outcomes/outcome-form';
import { OutcomesTable } from '@/components/outcomes/outcomes-table';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useToast } from '@/context/ToastContext';
import { IOutcomeInput } from '@/models/outcome';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Filter = 'all' | 'unpublished' | 'published';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unpublished', label: 'Waiting' },
  { value: 'published', label: 'Published' }
];

/** Shelter outcomes (plan G11): draft, redact, second-reviewer approval. MANAGER and above. */
export default function OutcomesPage() {
  const toast = useToast();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { data: outcomes, isLoading } = useQuery({
    queryKey: ['outcomes', filter],
    queryFn: async () => {
      const result = await OUTCOMES_API.list(
        filter === 'all' ? undefined : filter
      );
      if (!result.ok) {
        setError(errorText(result.error));
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
  const options = (shelters || [])
    .filter((s) => s._id)
    .map((s) => ({ _id: s._id as string, name: s.name }));

  const create = async (input: IOutcomeInput) => {
    const result = await OUTCOMES_API.create(input);
    if (!result.ok) {
      toast({ message: errorText(result.error) });
      return false;
    }
    toast({ message: 'Outcome drafted. Add a photo or send it for review.' });
    router.push(`/outcomes/${result.data.id}`);
    return true;
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Shelter outcomes</h1>
          <p className="text-sm text-muted-foreground">
            What happened after money reached a shelter. Published ones appear
            on tokentails.com/impact.
          </p>
        </div>
        {!creating && (
          <Button
            size="sm"
            className="h-9 w-auto gap-1"
            onClick={() => setCreating(true)}
          >
            <PlusCircle className="h-4 w-4" aria-hidden />
            New outcome
          </Button>
        )}
      </div>
      <div role="tablist" aria-label="Outcome status" className="flex gap-2">
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            role="tab"
            aria-selected={option.value === filter}
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
            <CardTitle>New outcome</CardTitle>
            <CardDescription className="normal-case">
              The animal&apos;s name only. You cannot approve an outcome you
              wrote.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {options.length ? (
              <OutcomeForm
                shelters={options}
                onSubmit={create}
                onCancel={() => setCreating(false)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Loading shelters…</p>
            )}
          </CardContent>
        </Card>
      )}
      <OutcomesTable outcomes={outcomes} isLoading={isLoading} />
    </div>
  );
}
