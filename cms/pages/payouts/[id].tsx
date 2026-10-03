'use client';

import {
  errorText,
  IPayout,
  IPayoutInput,
  PAYOUTS_API
} from '@/api/payouts-api';
import { SHELTER_API } from '@/api/shelter-api';
import { PayoutForm } from '@/components/payouts/payout-form';
import {
  ConfirmPanel,
  PayoutSummary,
  SignaturePanel
} from '@/components/payouts/payout-review';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfile } from '@/context/ProfileContext';
import { useToast } from '@/context/ToastContext';
import { PERMISSION_LEVEL } from '@/models/profile';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

/** Review one payout: the attested text, confirmation by a shelter member, the shelter signature. */
export default function PayoutPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || '';
  const toast = useToast();
  const { profile } = useProfile();
  const isManager = (profile?.permission ?? 0) >= PERMISSION_LEVEL.MANAGER;
  const isAdmin = (profile?.permission ?? 0) >= PERMISSION_LEVEL.ADMIN;
  const [editing, setEditing] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['payout', id],
    queryFn: () => PAYOUTS_API.get(id),
    enabled: !!id
  });
  const { data: shelters } = useQuery({
    queryKey: ['shelter'],
    queryFn: () => SHELTER_API.sheltersFetch(),
    enabled: isManager && editing
  });
  const payout: IPayout | null = data?.ok ? data.data : null;

  const after = async (
    result: Awaited<ReturnType<typeof PAYOUTS_API.get>>,
    message: string
  ) => {
    if (result.ok) {
      toast({ message });
      await refetch();
    }
    return result;
  };

  const save = async (input: IPayoutInput, receipt: File | null) => {
    const result = await PAYOUTS_API.update(id, input, receipt);
    if (!result.ok) {
      toast({ message: errorText(result.error) });
      return false;
    }
    setEditing(false);
    await after(
      result,
      'Draft saved. Any earlier review of it no longer counts.'
    );
    return true;
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 pb-16">
      <Link
        href="/payouts"
        className="text-sm font-semibold underline underline-offset-4"
      >
        ← All payouts
      </Link>
      {isLoading && <p className="text-sm">Loading…</p>}
      {data && !data.ok && (
        <p className="rounded-md bg-white/80 p-3 text-sm" role="alert">
          {errorText(data.error)}
        </p>
      )}
      {payout && (
        <>
          <PayoutSummary payout={payout} />
          {editing && shelters ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit draft</CardTitle>
              </CardHeader>
              <CardContent>
                <PayoutForm
                  shelters={shelters
                    .filter((s) => s._id)
                    .map((s) => ({ _id: s._id as string, name: s.name }))}
                  draft={payout}
                  onSubmit={save}
                  onCancel={() => setEditing(false)}
                />
              </CardContent>
            </Card>
          ) : null}
          <ConfirmPanel
            payout={payout}
            onConfirm={async (hash, receipt) =>
              after(
                await PAYOUTS_API.confirm(id, hash, receipt),
                'Confirmed by the shelter.'
              )
            }
          />
          <SignaturePanel
            payout={payout}
            onSign={async (signature) =>
              after(
                await PAYOUTS_API.sign(id, signature),
                'Signature verified.'
              )
            }
          />
          {isManager &&
            (payout.status === 'DRAFT' || isAdmin) &&
            payout.status !== 'VOID' && (
              <div className="flex flex-col gap-2 sm:flex-row">
                {payout.status === 'DRAFT' && !editing && (
                  <Button
                    variant="outline"
                    className="sm:w-auto sm:justify-self-start"
                    onClick={() => setEditing(true)}
                  >
                    Edit draft
                  </Button>
                )}
                <Button
                  variant="destructive"
                  className="sm:w-auto sm:justify-self-start"
                  onClick={async () => {
                    if (
                      window.confirm(
                        'Void this payout? It will never count as evidence.'
                      )
                    ) {
                      await after(await PAYOUTS_API.void(id), 'Payout voided.');
                    }
                  }}
                >
                  Void
                </Button>
              </div>
            )}
        </>
      )}
    </div>
  );
}
