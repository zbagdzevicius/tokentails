'use client';

import { OUTCOME_ERROR_MESSAGES, OUTCOMES_API } from '@/api/outcomes-api';
import { ApiResult, errorText } from '@/api/payouts-api';
import { SHELTER_API } from '@/api/shelter-api';
import { OutcomeForm } from '@/components/outcomes/outcome-form';
import { OutcomeStatusBadge } from '@/components/outcomes/outcomes-table';
import { RedactionEditor } from '@/components/outcomes/redaction-editor';
import { ReviewPanel } from '@/components/outcomes/review-panel';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useToast } from '@/context/ToastContext';
import { IOutcome, OUTCOME_TYPE_LABELS } from '@/models/outcome';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const message = (result: ApiResult<unknown>) =>
  result.ok
    ? ''
    : (result.error.code && OUTCOME_ERROR_MESSAGES[result.error.code]) ||
      errorText(result.error);

/** One outcome: its fields, the photo and its redaction, and the two-person review. */
export default function OutcomePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || '';
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState<{
    key: string;
    url: string | null;
  } | null>(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['outcome', id],
    queryFn: () => OUTCOMES_API.get(id),
    enabled: !!id
  });
  const { data: shelters } = useQuery({
    queryKey: ['shelter'],
    queryFn: () => SHELTER_API.sheltersFetch()
  });
  const outcome: IOutcome | null = data?.ok ? data.data : null;
  const imageKey = outcome?.hasImage
    ? `${outcome.id}:${outcome.imageRegions}:${outcome.status}`
    : null;

  // The processed image is private: fetched with the auth header, shown from an object URL. The URL
  // is kept with the image it belongs to, so a new or removed photo never shows a stale preview.
  useEffect(() => {
    if (!imageKey) return;
    let url: string | null = null;
    let live = true;
    OUTCOMES_API.imageUrl(id).then((next) => {
      if (live) {
        url = next;
        setLoaded({ key: imageKey, url: next });
      } else if (next) URL.revokeObjectURL(next);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, imageKey]);
  const preview = imageKey && loaded?.key === imageKey ? loaded.url : null;

  const act = async (call: Promise<ApiResult<IOutcome>>, done: string) => {
    const result = await call;
    if (!result.ok) {
      toast({ message: message(result) });
      return false;
    }
    toast({ message: done });
    await refetch();
    return true;
  };

  const shelterOptions = (shelters || [])
    .filter((s) => s._id)
    .map((s) => ({ _id: s._id as string, name: s.name }));
  const locked = outcome?.status === 'published';

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 pb-16">
      <Link
        href="/outcomes"
        className="text-sm font-semibold underline underline-offset-4"
      >
        ← All outcomes
      </Link>
      {isLoading && <p className="text-sm">Loading…</p>}
      {data && !data.ok && (
        <p className="rounded-md bg-white/80 p-3 text-sm" role="alert">
          {message(data)}
        </p>
      )}
      {outcome && (
        <>
          <Card>
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  {OUTCOME_TYPE_LABELS[outcome.type]} ·{' '}
                  {outcome.animalName || 'A shelter animal'}
                </CardTitle>
                <OutcomeStatusBadge status={outcome.status} />
              </div>
              <CardDescription className="normal-case">
                {outcome.shelter} · {outcome.date}
                {outcome.amount && outcome.symbol
                  ? ` · ${outcome.amount} ${outcome.symbol}`
                  : ''}
                {outcome.payoutId
                  ? ` · payout ${outcome.payoutId} (${outcome.tier})`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {editing && shelterOptions.length ? (
                <OutcomeForm
                  shelters={shelterOptions}
                  outcome={outcome}
                  onCancel={() => setEditing(false)}
                  onSubmit={async (input) => {
                    const ok = await act(
                      OUTCOMES_API.update(id, input),
                      'Saved. The redaction check starts again.'
                    );
                    if (ok) setEditing(false);
                    return ok;
                  }}
                />
              ) : (
                !locked && (
                  <Button
                    variant="outline"
                    className="sm:w-auto sm:justify-self-start"
                    onClick={() => setEditing(true)}
                  >
                    Edit details
                  </Button>
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Photo</CardTitle>
              <CardDescription className="normal-case">
                {outcome.hasImage
                  ? 'This is the processed copy: no location or camera data, boxes pixelated. Check it before ticking the redaction check.'
                  : 'Optional. A photo is pixelated where you draw boxes and stripped of all metadata.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {outcome.hasImage && (
                <div className="grid gap-2">
                  {preview ? (
                    <img
                      src={preview}
                      alt={`Processed photo, ${outcome.imageRegions} area(s) pixelated`}
                      className="w-full max-w-xl rounded-md border"
                      data-testid="processed-preview"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Loading the processed photo…
                    </p>
                  )}
                  {!locked && (
                    <Button
                      variant="outline"
                      className="sm:w-auto sm:justify-self-start"
                      onClick={() =>
                        act(OUTCOMES_API.removeImage(id), 'Photo removed.')
                      }
                    >
                      Remove photo
                    </Button>
                  )}
                </div>
              )}
              {!locked && (
                <RedactionEditor
                  onSave={(file, regions) =>
                    act(
                      OUTCOMES_API.setImage(id, file, regions),
                      'Photo processed. Check it, then tick the redaction check.'
                    )
                  }
                />
              )}
            </CardContent>
          </Card>

          <ReviewPanel
            outcome={outcome}
            onRedacted={(redacted) =>
              act(
                OUTCOMES_API.setRedacted(id, redacted),
                redacted ? 'Marked as checked.' : 'Redaction check cleared.'
              )
            }
            onApprove={() =>
              act(OUTCOMES_API.approve(id), 'Approved and published.')
            }
            onUnpublish={() => act(OUTCOMES_API.unpublish(id), 'Unpublished.')}
          />
        </>
      )}
    </div>
  );
}
