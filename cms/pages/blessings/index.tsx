'use client';

import { BLESSING_API } from '@/api/blessing-api';
import { SHELTER_API } from '@/api/shelter-api';
import { BlessingsFilters } from '@/components/blessings/blessings-filters';
import { BlessingsTable } from '@/components/blessings/blessings-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Labeled } from '@/components/ui/labeled';
import { Loader } from '@/components/ui/loader';
import { Tabs } from '@/components/ui/tabs';
import { useProfile } from '@/context/ProfileContext';
import { useToast } from '@/context/ToastContext';
import { IBlessing } from '@/models/blessing';
import { BlessingStatus } from '@/models/cats';
import { PERMISSION_LEVEL } from '@/models/profile';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@uidotdev/usehooks';
import { PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function BlessingsPage() {
  const [page] = useState(0);
  const [query, setQuery] = useState('');
  const { profile } = useProfile();
  const [shelter, setShelter] = useState<string>(() => profile?.shelter || '');
  const toast = useToast();
  const debouncedSearchParams = useDebounce([page, query, shelter], 250);
  const { data: blessings, isLoading } = useQuery({
    queryKey: ['blessing', ...debouncedSearchParams],
    queryFn: () =>
      BLESSING_API.blessingsFetch({ page, query, shelter, perPage: 300 })
  });
  const [status, setStatus] = useState<BlessingStatus | null>(null);
  // Track status mutations by blessing ID
  const [statusMutations, setStatusMutations] = useState<
    Map<string, BlessingStatus>
  >(new Map());

  // Apply mutations to blessings and filter by status
  const mutatedBlessings = useMemo(() => {
    if (!blessings) return [];

    // Apply local status mutations
    const withMutations = blessings.map((blessing) => {
      const mutatedStatus = statusMutations.get(blessing._id || '');
      if (mutatedStatus !== undefined) {
        return {
          ...blessing,
          status: mutatedStatus as unknown as IBlessing['status']
        };
      }
      return blessing;
    });

    // Filter by status if set
    if (!status) return withMutations;
    return withMutations.filter(
      (blessing) => blessing?.status === (status as unknown)
    );
  }, [blessings, statusMutations, status]);

  const { data: shelters } = useQuery({
    queryKey: ['shelter', profile?._id],
    queryFn: () => SHELTER_API.sheltersFetch()
  });

  // Track previous profile shelter to avoid unnecessary updates
  const prevProfileShelter = useRef<string | undefined>(profile?.shelter);

  // Update shelter when profile changes (only if different)
  useEffect(() => {
    if (profile?.shelter && profile.shelter !== prevProfileShelter.current) {
      prevProfileShelter.current = profile.shelter;
      setShelter(profile.shelter);
    }
  }, [profile]);

  async function updateStatus(id: string, newStatus: BlessingStatus) {
    // Optimistically update local state immediately
    setStatusMutations((prev) => {
      const next = new Map(prev);
      next.set(id, newStatus);
      return next;
    });
    // Then update on server
    await BLESSING_API.blessingUpdateStatus(id, newStatus);
    toast({ message: 'Status updated successfully' });
  }

  return (
    <Tabs defaultValue="all">
      <div className="ml-auto flex items-center gap-2 mb-2">
        <Link href={'/blessings/create'}>
          <Button size="sm" className="h-8 gap-1">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Add Shelter Cat
            </span>
          </Button>
        </Link>
      </div>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <Labeled label="SHELTER">
          {(profile?.permission || 0) >= PERMISSION_LEVEL.MANAGER ? (
            <div className="flex gap-2 flex-wrap">
              {shelters?.map((shelterOption) => (
                <Button
                  variant={
                    shelterOption._id === shelter ? 'default' : 'outline'
                  }
                  key={shelterOption._id}
                  onClick={() => setShelter(shelterOption._id!)}
                >
                  {shelterOption.name}
                </Button>
              ))}
              <Button
                variant={shelter ? 'outline' : 'default'}
                onClick={() => setShelter('')}
              >
                All Shelters
              </Button>
            </div>
          ) : (
            <Button>
              {shelters?.find(
                (shelterOption) => shelterOption._id === profile?.shelter
              )?.name || ''}
            </Button>
          )}
        </Labeled>
        <Labeled label="SEARCH CAT BY NAME">
          <Input
            placeholder="Shelter Cat name"
            className="w-full rounded-lg bg-background pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Labeled>
      </div>
      {isLoading && <Loader isLoading={isLoading} />}
      <BlessingsFilters status={status} setStatus={setStatus} />
      <BlessingsTable
        cats={mutatedBlessings || []}
        totalBlessings={mutatedBlessings?.length || 0}
        onUpdateStatus={updateStatus}
      />
    </Tabs>
  );
}
