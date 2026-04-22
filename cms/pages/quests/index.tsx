'use client';

import { QUEST_API } from '@/api/quest-api';
import { QuestsTable } from '@/components/quests/quests-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Labeled } from '@/components/ui/labeled';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@uidotdev/usehooks';
import { PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function QuestsPage() {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const debouncedSearchParams = useDebounce([page, query], 250);

  const { data: quests, refetch } = useQuery({
    queryKey: ['quest', ...debouncedSearchParams],
    queryFn: () => QUEST_API.questsFetch()
  });

  async function onDelete(_id: string) {
    await QUEST_API.questDelete(_id);
    refetch();
  }

  return (
    <Tabs defaultValue="all">
      <div className="ml-auto flex items-center gap-2 mb-2">
        <Link href={'/quests/create'}>
          <Button size="sm" className="h-8 gap-1">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Add Quest
            </span>
          </Button>
        </Link>
      </div>
      <div className="flex items-center gap-4 mb-4">
        <Labeled label="SEARCH QUEST BY NAME">
          <Input
            placeholder="Quest name"
            className="w-full rounded-lg bg-background pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Labeled>
      </div>
      <TabsContent value="all">
        <QuestsTable
          quests={quests || []}
          totalQuests={quests?.length!}
          onDelete={onDelete}
        />
      </TabsContent>
    </Tabs>
  );
}
