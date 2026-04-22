'use client';

import { SheltersTable } from '@/components/shelters/shelters-table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { SHELTER_API } from '@/api/shelter-api';

export default function SheltersPage() {
  const { data: shelters, refetch } = useQuery({
    queryKey: ['shelter'],
    queryFn: () => SHELTER_API.sheltersFetch()
  });

  return (
    <Tabs defaultValue="all">
      <div className="flex items-center">
        <div className="ml-auto flex items-center gap-2">
          <Link href={'/shelters/create'}>
            <Button size="sm" className="h-8 gap-1">
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Add Shelter
              </span>
            </Button>
          </Link>
        </div>
      </div>
      <TabsContent value="all">
        <SheltersTable items={shelters || []} total={shelters?.length!} />
      </TabsContent>
    </Tabs>
  );
}
