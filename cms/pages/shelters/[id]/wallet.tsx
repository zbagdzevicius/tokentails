'use client';

import { SHELTER_API } from '@/api/shelter-api';
import {
  defaultShelterWallet,
  ShelterWallet
} from '@/components/shelters/shelter-wallet';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';

/** Read-only page with the shelter's on-chain wallet: Shelters → ⋯ → Wallet. */
export default function ShelterWalletPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { data: shelter } = useQuery({
    queryKey: ['shelter', id],
    queryFn: () => (id ? SHELTER_API.shelterFetch(id) : null),
    enabled: !!id
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {shelter?.name ? `${shelter.name}: wallet` : 'Shelter wallet'}
        </h1>
        <Button variant="outline" onClick={() => router.push('/shelters')}>
          Back to shelters
        </Button>
      </div>
      {shelter?._id ? (
        <ShelterWallet key={shelter._id} initial={defaultShelterWallet(shelter)} />
      ) : (
        <p className="text-sm text-muted-foreground">Loading shelter…</p>
      )}
    </div>
  );
}
