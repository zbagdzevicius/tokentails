'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Labeled } from '@/components/ui/labeled';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { UsersTable } from '@/components/users/users-table';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { USER_API } from '@/api/user-api';

export default function UsersPage() {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const { data: users } = useQuery({
    queryKey: ['shelter', page, query],
    queryFn: () => USER_API.usersFetch({ page, query })
  });
  return (
    <Tabs defaultValue="all">
      <div className="flex items-center">
        <div className="flex w-full items-end justify-between gap-2">
          <Labeled label="NAME">
            <Input
              placeholder="User name"
              className="w-full rounded-lg bg-background pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Labeled>
          <Link href={'/users/create'}>
            <Button size="sm" className="h-8 gap-1">
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Add User
              </span>
            </Button>
          </Link>
        </div>
      </div>
      <TabsContent value="all">
        <UsersTable users={users || []} totalUsers={users?.length!} />
      </TabsContent>
    </Tabs>
  );
}
