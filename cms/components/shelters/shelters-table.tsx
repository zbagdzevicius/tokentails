'use client';

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
import Shelter from '../shelter';

export function SheltersTable({
  items,
  total
}: {
  items: any[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Shelters</CardTitle>
        <CardDescription>
          Manage your shelters and view their status
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <Shelter key={item._id} shelter={item} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        <form className="flex items-center w-full justify-between">
          <div className="text-xs text-muted-foreground">
            Showing <strong>{items.length}</strong> of{' '}
            <strong>{total || 0}</strong> shelters
          </div>
        </form>
      </CardFooter>
    </Card>
  );
}
