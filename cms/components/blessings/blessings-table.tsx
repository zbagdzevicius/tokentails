'use client';

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { MarketplaceItem } from './MarketplaceItem';
import { BlessingStatus } from '@/models/cats';

export function BlessingsTable({
  cats,
  totalBlessings,
  custom,
  onUpdateStatus
}: {
  cats: any[];
  totalBlessings: number;
  custom?: boolean;
  onUpdateStatus: (id: string, status: BlessingStatus) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Shelter Cats</CardTitle>
        <CardDescription>
          Manage your cats and view their status
        </CardDescription>
      </CardHeader>
      <div className="flex flex-wrap gap-4 md:gap-12 items-center justify-center">
        {cats.map((blessing) => (
          <MarketplaceItem
            key={blessing._id}
            blessing={blessing}
            custom={custom}
            onUpdateStatus={onUpdateStatus}
          />
        ))}
      </div>
      <CardFooter>
        <form className="flex items-center w-full justify-between">
          <div className="text-xs text-muted-foreground">
            Showing <strong>{cats.length}</strong> of{' '}
            <strong>{totalBlessings || 0}</strong> cats
          </div>
        </form>
      </CardFooter>
    </Card>
  );
}
