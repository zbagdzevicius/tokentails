'use client';

import { BlessingsTable } from '@/components/blessings/blessings-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Labeled } from '@/components/ui/labeled';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfile } from '@/context/ProfileContext';
import { PERMISSION_LEVEL } from '@/models/profile';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDebounce } from '@uidotdev/usehooks';
import { BLESSING_API } from '@/api/blessing-api';
import { SHELTER_API } from '@/api/shelter-api';

export default function BlessingsPage() {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const { profile } = useProfile();
  const [shelter, setShelter] = useState<string>(profile?.shelter || '');
  const debouncedSearchParams = useDebounce([page, query, shelter], 250);
  const { data: cats, refetch } = useQuery({
    queryKey: ['blessing', ...debouncedSearchParams],
    queryFn: () => BLESSING_API.blessingsFetch({ page, query, shelter })
  });
  const { data: shelters } = useQuery({
    queryKey: ['shelter', profile?._id],
    queryFn: () => SHELTER_API.sheltersFetch()
  });
  useEffect(() => {
    setShelter(profile?.shelter!);
  }, [profile, shelters]);

  async function onDelete(_id: string) {
    await BLESSING_API.blessingDelete(_id);
    refetch();
  }

  return (
    <Tabs defaultValue="all">
      <div className="ml-auto flex items-center gap-2 mb-2">
        <Link href={'/individual/create'}>
          <Button size="sm" className="h-8 gap-1">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Add Custom Blessing
            </span>
          </Button>
        </Link>
      </div>
      <div className="flex items-center gap-4 mb-4">
        <Labeled label="SHELTER">
          {(profile?.permission || 0) >= PERMISSION_LEVEL.MANAGER ? (
            <div className="flex gap-2">
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
      <BlessingsTable
        custom={true}
        cats={cats || []}
        totalBlessings={cats?.length!}
        onUpdateStatus={() => {}}
      />
    </Tabs>
  );
}
