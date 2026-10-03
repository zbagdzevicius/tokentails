'use client';

import { errorText, IShelterMember, PAYOUTS_API } from '@/api/payouts-api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { ShelterOption } from './payout-form';

/**
 * ADMIN: who may confirm a shelter's payouts (PUT /shelter/:id/members). Members need a registered
 * account with a verified email and must be shelter people: Token Tails staff (manager or admin) are
 * refused. A draft's author and editors can never confirm it, member or not.
 */
export function MembersPanel({ shelters }: { shelters: ShelterOption[] }) {
  const uid = useId();
  const [shelter, setShelter] = useState(shelters[0]?._id || '');
  const [entry, setEntry] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['shelter-members', shelter],
    queryFn: async () => {
      if (!shelter) return [];
      const result = await PAYOUTS_API.members(shelter);
      return result.ok ? result.data : [];
    }
  });

  const change = async (body: { add?: string[]; remove?: string[] }) => {
    setBusy(true);
    setError('');
    const result = await PAYOUTS_API.changeMembers(shelter, body);
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setEntry('');
    await refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shelter confirmers</CardTitle>
        <CardDescription className="normal-case">
          Admins only. People from the shelter who confirm payouts. Add them by
          email or user id. Token Tails staff accounts cannot be members.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <label htmlFor={`${uid}-shelter`} className="text-sm font-bold">
          Shelter
        </label>
        <select
          id={`${uid}-shelter`}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={shelter}
          onChange={(e) => setShelter(e.target.value)}
        >
          {shelters.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !(data as IShelterMember[] | undefined)?.length ? (
          <p className="text-sm text-muted-foreground">No confirmers yet.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Confirmers">
            {(data as IShelterMember[]).map((m) => (
              <li
                key={m._id}
                className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-3 py-2"
              >
                <span className="text-sm">
                  <span className="font-semibold">{m.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {m._id}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-auto text-sm"
                  disabled={busy}
                  onClick={() => change({ remove: [m._id] })}
                  aria-label={`Remove ${m.name}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (entry.trim()) change({ add: [entry.trim()] });
          }}
        >
          <label htmlFor={`${uid}-add`} className="sr-only">
            Email or user id
          </label>
          <Input
            id={`${uid}-add`}
            placeholder="Email or user id"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
          />
          <Button
            type="submit"
            className="sm:w-auto"
            disabled={busy || !entry.trim()}
          >
            Add
          </Button>
        </form>
        {error && (
          <p className="text-sm font-semibold text-rose-800" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
