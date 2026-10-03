'use client';

import {
  INameReportGroup,
  NAME_REPORT_REASON_LABELS,
  NameModerationAction,
  NameReportReason
} from '@/api/name-reports-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  CAT_NAME_MAX_LENGTH,
  CAT_NAME_MESSAGES,
  normalizeCatName
} from '@/shared-contracts/name';
import { useId, useState } from 'react';

const ACTION_LABELS: Record<NameModerationAction, string> = {
  reset: 'Reset to breed name',
  rename: 'Renamed',
  dismiss: 'Dismissed'
};

const formatDate = (value?: string) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

const titleCase = (value?: string) =>
  value ? value.charAt(0) + value.slice(1).toLowerCase() : '';

export interface NameReportCardProps {
  group: INameReportGroup;
  /** Resolves true when the action was applied. */
  onModerate: (action: NameModerationAction, name?: string) => Promise<boolean>;
}

/** One reported cat: what was reported, why, and the three moderation actions. */
export function NameReportCard({ group, onModerate }: NameReportCardProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<NameModerationAction | null>(null);
  const inputId = useId();
  const errorId = useId();
  const open = group.status === 'open';
  const checked = name.trim() ? normalizeCatName(name) : null;
  const nameError =
    checked && !checked.ok ? CAT_NAME_MESSAGES[checked.code] : '';
  const currentName = group.cat.missing
    ? 'Cat deleted'
    : group.cat.name || 'Unnamed';

  const run = async (action: NameModerationAction) => {
    if (busy) return;
    setBusy(action);
    try {
      const done = await onModerate(
        action,
        action === 'rename' && checked?.ok ? checked.name : undefined
      );
      if (done && action === 'rename') setName('');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card data-testid="name-report" className="flex flex-col">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        {group.cat.catImg ? (
          <img
            src={group.cat.catImg}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-md bg-muted object-contain [image-rendering:pixelated]"
          />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-md bg-muted" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-xl">{currentName}</CardTitle>
          <CardDescription>
            {group.cat.starterBreed
              ? `${titleCase(group.cat.starterBreed)} starter`
              : 'Player cat'}
            {group.lastAt ? ` · last report ${formatDate(group.lastAt)}` : ''}
          </CardDescription>
        </div>
        <Badge
          variant={open ? 'destructive' : 'secondary'}
          aria-label={`${group.count} reports`}
        >
          {group.count} {group.count === 1 ? 'report' : 'reports'}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {Object.entries(group.reasons).map(([reason, count]) => (
            <Badge key={reason} variant="outline">
              {NAME_REPORT_REASON_LABELS[reason as NameReportReason] || reason}{' '}
              × {count}
            </Badge>
          ))}
        </div>
        {group.names.some((reported) => reported !== group.cat.name) && (
          <p>
            <span className="text-muted-foreground">Reported as: </span>
            {group.names.join(', ')}
          </p>
        )}
        {group.notes.length > 0 && (
          <ul className="grid gap-1">
            {group.notes.map((note, index) => (
              <li
                key={index}
                className="rounded-md bg-muted px-3 py-2 text-muted-foreground"
              >
                “{note}”
              </li>
            ))}
          </ul>
        )}
        {!open && group.action && (
          <p className="text-muted-foreground">
            {ACTION_LABELS[group.action]}
            {group.resolvedAt ? ` on ${formatDate(group.resolvedAt)}` : ''}
          </p>
        )}
      </CardContent>
      {open && group.cat.missing && (
        <CardFooter className="mt-auto grid gap-2">
          <p className="text-xs text-muted-foreground">
            The cat no longer exists, so its name cannot be changed. Dismiss the
            reports to close them.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-auto text-sm"
            disabled={!!busy}
            onClick={() => run('dismiss')}
          >
            {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
          </Button>
        </CardFooter>
      )}
      {open && !group.cat.missing && (
        <CardFooter className="mt-auto grid gap-3">
          <div className="grid gap-1">
            <label
              htmlFor={inputId}
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              New name
            </label>
            <div className="flex gap-2">
              <Input
                id={inputId}
                value={name}
                maxLength={CAT_NAME_MAX_LENGTH * 2}
                placeholder="Pick a kind name"
                aria-invalid={!!nameError}
                aria-describedby={nameError ? errorId : undefined}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                size="sm"
                className="w-auto text-sm"
                disabled={!checked?.ok || !!busy}
                onClick={() => run('rename')}
              >
                Rename
              </Button>
            </div>
            {nameError && (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {nameError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="w-auto flex-1 text-sm"
              disabled={!!busy}
              onClick={() => run('reset')}
            >
              {busy === 'reset' ? 'Resetting…' : 'Reset name'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-auto flex-1 text-sm"
              disabled={!!busy}
              onClick={() => run('dismiss')}
            >
              {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
