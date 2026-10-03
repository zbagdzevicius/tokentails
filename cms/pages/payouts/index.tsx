'use client';

import { errorText, IPayoutInput, PAYOUTS_API } from '@/api/payouts-api';
import { SHELTER_API } from '@/api/shelter-api';
import { MembersPanel } from '@/components/payouts/members-panel';
import { PayoutForm } from '@/components/payouts/payout-form';
import { PayoutsTable } from '@/components/payouts/payouts-table';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useProfile } from '@/context/ProfileContext';
import { useToast } from '@/context/ToastContext';
import { PERMISSION_LEVEL } from '@/models/profile';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Payout attestation (plan G4). Managers draft payouts with their receipt; a shelter member who did
 * not write a draft confirms it (amber SHELTER-CONFIRMED) or the shelter's own wallet signs it after
 * the key handover (green SHELTER-SIGNED). Admins grant who may confirm.
 */
export default function PayoutsPage() {
  const { profile } = useProfile();
  const toast = useToast();
  const router = useRouter();
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState('');
  const permission = profile?.permission ?? 0;
  const isManager = permission >= PERMISSION_LEVEL.MANAGER;
  const isAdmin = permission >= PERMISSION_LEVEL.ADMIN;

  const {
    data: payouts,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['payouts'],
    queryFn: async () => {
      const result = await PAYOUTS_API.list();
      if (!result.ok) {
        setError(errorText(result.error));
        return [];
      }
      setError('');
      return result.data;
    }
  });
  const { data: shelters } = useQuery({
    queryKey: ['shelter'],
    queryFn: () => SHELTER_API.sheltersFetch(),
    enabled: isManager
  });
  const options = (shelters || [])
    .filter((s) => s._id)
    .map((s) => ({ _id: s._id as string, name: s.name }));

  const create = async (input: IPayoutInput, receipt: File | null) => {
    if (!receipt) return false;
    const result = await PAYOUTS_API.create(input, receipt);
    if (!result.ok) {
      toast({ message: errorText(result.error) });
      return false;
    }
    toast({ message: 'Draft saved. A shelter member can now confirm it.' });
    setDrafting(false);
    await refetch();
    router.push(`/payouts/${result.data.id}`);
    return true;
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payouts and receipts</h1>
          <p className="text-sm text-muted-foreground">
            Evidence for money that reached a shelter. Only confirmed or signed
            payouts appear on tokentails.com/impact.
          </p>
        </div>
        {isManager && !drafting && (
          <Button
            size="sm"
            className="h-9 w-auto gap-1"
            onClick={() => setDrafting(true)}
          >
            <PlusCircle className="h-4 w-4" aria-hidden />
            New draft
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-white/80 p-3 text-sm" role="status">
          {error}
        </p>
      )}

      {drafting && isManager && (
        <Card>
          <CardHeader>
            <CardTitle>New draft payout</CardTitle>
            <CardDescription className="normal-case">
              You cannot confirm a draft you wrote. Attach the receipt the
              shelter will confirm with.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {options.length ? (
              <PayoutForm
                shelters={options}
                onSubmit={create}
                onCancel={() => setDrafting(false)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Loading shelters…</p>
            )}
          </CardContent>
        </Card>
      )}

      <PayoutsTable payouts={payouts} isLoading={isLoading} />

      {isAdmin && options.length > 0 && <MembersPanel shelters={options} />}
    </div>
  );
}
