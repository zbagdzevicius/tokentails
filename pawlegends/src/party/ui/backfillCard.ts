/**
 * The Quick Play backfill offer (docs/plans/moba/M1A-IMPL.md §3): a teammate left a co-op match in progress and this
 * queued player may take the seat. "Join a match in progress · 1:42", the team's score when the relay knows one,
 * **Join** and **Keep searching**, and a 10 s ring. Declining or letting it run out costs nothing: the search goes on.
 *
 * Pure markup inside the queue card; the party client dispatches `bf-yes` and `bf-no` and runs the ring's clock.
 */
import { COPY, clockText, esc } from './copy';

export interface BackfillModel {
  /** The match clock when the offer was made (s). */
  clockS: number;
  /** The team's score [ours, theirs], when known and not level. */
  score: readonly [number, number] | null;
  /** Seconds left to answer. */
  leftS: number;
  /** The offer's full time (s), for the ring. */
  totalS: number;
}

/** "your team is ahead" / "behind" / '' (a level or unknown score says nothing). */
export function scoreLine(score: readonly [number, number] | null): string {
  if (!score || score[0] === score[1]) return '';
  return score[0] > score[1] ? 'your team is ahead' : 'your team is behind';
}

export function backfillHtml(o: BackfillModel): string {
  const line = scoreLine(o.score);
  const pct = o.totalS > 0 ? Math.max(0, Math.min(100, Math.round((o.leftS / o.totalS) * 100))) : 0;
  return `<div class="pp-offer" role="alertdialog" aria-label="${COPY.backfillTitle}" data-testid="mm-offer">
    <span class="pp-ring" style="--pp-ring:${pct}%" aria-hidden="true"><b data-live="offer">${Math.max(0, Math.ceil(o.leftS))}</b></span>
    <span class="pp-offer-text"><b>${COPY.backfillTitle}</b><small><span data-live="clock">${esc(COPY.backfillAt(clockText(o.clockS)))}</span>${line ? ` · ${esc(line)}` : ''}</small></span>
    <span class="pp-row"><button type="button" class="pl-btn" data-p="bf-yes" data-testid="mm-offer-join">${COPY.backfillJoin}</button><button type="button" class="pl-btn ghost small" data-p="bf-no" data-testid="mm-offer-keep">${COPY.backfillKeep}</button></span>
  </div>`;
}
