/**
 * The casual PvP Accept card (docs/plans/moba/V16.md §4.1, §5): "PvP match found", both teams' counts, a 10 s ring, a
 * big **Accept** (>= 56 px on touch) and a small **Decline**. A decline or no answer is a dodge (2 free a day, then a
 * short wait); the others go back to the front of the queue. Pure markup: the party client runs the ring and
 * dispatches `mm-accept` / `mm-decline`.
 */
import { COPY, esc, sideText } from './copy';

export interface AcceptModel {
  side: string;
  mine: [number, number];
  theirs: [number, number];
  leftS: number;
  totalS: number;
  /** This player already accepted (the card waits for the others). */
  accepted: boolean;
  yes: number;
  need: number;
}

export function acceptCardHtml(m: AcceptModel): string {
  const pct = m.totalS > 0 ? Math.max(0, Math.min(100, Math.round((m.leftS / m.totalS) * 100))) : 0;
  const actions = m.accepted
    ? `<p class="pp-dim" role="status" data-testid="mm-accepted">${esc(COPY.accepted(m.yes, m.need))}</p>`
    : `<div class="pp-col pp-accept-row"><button type="button" class="pl-btn big pp-accept" data-p="mm-accept" data-testid="mm-accept">${COPY.accept}</button><button type="button" class="pl-btn ghost small" data-p="mm-decline" data-testid="mm-decline">${COPY.decline}</button></div>`;
  return `<div class="pp-card pp-narrow pp-queue pp-acceptcard" data-state="accept" data-testid="mm-accept-card" role="alertdialog" aria-label="${COPY.pvpFound}">
    <h2>${COPY.pvpFound}</h2>
    <span class="pp-ring" style="--pp-ring:${pct}%" aria-hidden="true"><b data-live="accept">${Math.max(0, Math.ceil(m.leftS))}</b></span>
    <p class="pp-found" data-testid="mm-found"><span>${esc(COPY.pvpFoundLine(m.mine, m.theirs, sideText(m.side)))}</span></p>
    ${actions}
  </div>`;
}
