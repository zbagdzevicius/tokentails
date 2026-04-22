'use client';

import Quest from '@/components/quest';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { IQuest } from '@/models/quest';

export function QuestsTable({
  quests,
  totalQuests,
  onDelete
}: {
  quests: IQuest[];
  totalQuests: number;
  onDelete: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quests</CardTitle>
        <CardDescription>Manage quests and their rewards</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Cat Points</TableHead>
              <TableHead>Tails</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quests.map((quest) => (
              <Quest
                key={quest._id}
                quest={quest}
                onDelete={() => onDelete(quest._id!)}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        <form className="flex items-center w-full justify-between">
          <div className="text-xs text-muted-foreground">
            Showing <strong>{quests.length}</strong> of{' '}
            <strong>{totalQuests || 0}</strong> quests
          </div>
        </form>
      </CardFooter>
    </Card>
  );
}
