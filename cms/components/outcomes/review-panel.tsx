'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  approvalBlocker,
  IOutcome,
  REDACTION_CHECKLIST
} from '@/models/outcome';
import { useId, useState } from 'react';

export interface ReviewPanelProps {
  outcome: IOutcome;
  onRedacted: (redacted: boolean) => Promise<boolean>;
  onApprove: () => Promise<boolean>;
  onUnpublish: () => Promise<boolean>;
}

/**
 * Decision #78: one reviewer ticks the redaction check (photo and text), a second reviewer, who wrote
 * nothing and did not tick it, approves and publishes. The backend enforces the same rule.
 */
export function ReviewPanel({
  outcome,
  onRedacted,
  onApprove,
  onUnpublish
}: ReviewPanelProps) {
  const uid = useId();
  const [busy, setBusy] = useState(false);
  const blocker = approvalBlocker(outcome);
  const run = async (action: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    await action();
    setBusy(false);
  };

  if (outcome.status === 'published') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Published</CardTitle>
          <CardDescription className="normal-case">
            Live on tokentails.com/impact since{' '}
            {outcome.publishedAt?.slice(0, 10)}. Unpublishing deletes the
            public photo and sends it back for a new redaction check and a
            second reviewer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="sm:w-auto sm:justify-self-start"
            disabled={busy}
            onClick={() => run(onUnpublish)}
          >
            Unpublish
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
        <CardDescription className="normal-case">
          Step 1: someone checks the photo and the text. Step 2: a second
          reviewer approves.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <fieldset className="grid gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-bold">Redaction check</legend>
          <ul className="list-disc pl-5 text-sm">
            {REDACTION_CHECKLIST.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <label
            htmlFor={`${uid}-redacted`}
            className="flex min-h-[44px] items-center gap-3 text-sm font-semibold"
          >
            <input
              id={`${uid}-redacted`}
              type="checkbox"
              className="h-5 w-5"
              checked={outcome.redacted}
              disabled={busy}
              onChange={(e) => run(() => onRedacted(e.target.checked))}
            />
            {outcome.redacted
              ? outcome.redactedByMe
                ? 'You checked it'
                : 'Checked by another reviewer'
              : 'I checked the photo and the text'}
          </label>
        </fieldset>
        <div className="grid gap-2">
          <Button
            className="sm:w-auto sm:justify-self-start"
            disabled={!!blocker || busy}
            onClick={() => run(onApprove)}
          >
            Approve and publish
          </Button>
          {blocker && (
            <p className="text-sm text-muted-foreground" role="status">
              {blocker}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
