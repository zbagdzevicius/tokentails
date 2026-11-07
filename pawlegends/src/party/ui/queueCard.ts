/**
 * The Quick Play queue card (docs/plans/moba/M1A-IMPL.md §1, §6): "Finding teammates… 0:07 · usually 0:15", the humans
 * found as pips (●●○), the side chip (Cats · Dogs · Either, a radio group the arrow keys move), a low-priority
 * countdown and the leaver warning, **Cancel** from the first frame, the 1.2 s "Match found" strip, the stopped states
 * (away, another tab, locked, busy) with **Search again**, and the backfill offer on top.
 *
 * Pure markup: the party client fills the model and dispatches the `data-p` actions (`mm-cancel`, `mm-side`,
 * `mm-again`, `bf-yes`, `bf-no`). Timer texts sit in `data-live` spans the client updates in place every 250 ms, so
 * the card is not redrawn (focus stays on the side chip). Mid-screen, safe at 667×375.
 */
import type { MmSide } from '../../net/proto';
import { COPY, DIFF_LABEL, clockText, esc, sideText } from './copy';
import { backfillHtml, type BackfillModel } from './backfillCard';

export type QueueStop = 'away' | 'left' | 'party' | 'update' | 'locked' | 'busy';

export interface QueueModel {
  side: MmSide;
  /** Seconds searched (the local clock, synced to `waitedMs`). */
  waitedS: number;
  /** The relay's estimate, or null before the first status. */
  estimateS: number | null;
  /** Humans found so far, 1..3 (this player or party included). */
  found: number;
  /** A low-priority wait still running (s), or 0. */
  lowPriorityS: number;
  warn: boolean;
  /** A friend party queued together (every member sees the card; any Cancel stops it for the party). */
  party: boolean;
  stopped: QueueStop | null;
  /** Seconds before Search again works (locked or busy), or 0. */
  retryS: number;
  match: { humans: number; bots: number; side: string; difficulty: string } | null;
  offer: BackfillModel | null;
}

const SIDES: readonly MmSide[] = ['cat', 'dog', 'any'];

const stopText = (m: QueueModel): string => {
  switch (m.stopped) {
    case 'away':
      return COPY.stoppedAway;
    case 'left':
      return COPY.stoppedElsewhere;
    case 'update':
      return COPY.stoppedUpdate;
    case 'locked':
      return COPY.stoppedLocked(Math.max(1, m.retryS));
    case 'busy':
      return COPY.stoppedBusy(Math.max(1, m.retryS));
    default:
      return COPY.stoppedParty;
  }
};

/** The found pips: ●●○ (1..3 of 3). */
export function pipsHtml(found: number): string {
  const n = Math.max(1, Math.min(3, Math.round(found)));
  return `<span class="pp-pips" role="img" aria-label="${esc(COPY.playersFound(n))}" data-testid="mm-pips" data-found="${n}">${[0, 1, 2].map((i) => `<i class="pp-pip${i < n ? ' on' : ''}"></i>`).join('')}</span>`;
}

/** The side radio group (Cats · Dogs · Either). */
export function sideChipHtml(side: MmSide, disabled = false): string {
  return `<div class="pp-seg pp-mm-side" role="radiogroup" aria-label="${COPY.sideLabel}" data-testid="mm-side">${SIDES.map(
    (s) =>
      `<button type="button" role="radio" aria-checked="${s === side}" tabindex="${s === side ? 0 : -1}" data-p="mm-side" data-v="${s}" data-testid="mm-side-${s}"${disabled ? ' disabled' : ''}>${esc(sideText(s))}</button>`,
  ).join('')}</div>`;
}

export function queueCardHtml(m: QueueModel): string {
  if (m.match) {
    const diff = DIFF_LABEL[m.match.difficulty] ?? m.match.difficulty;
    return `<div class="pp-card pp-narrow pp-queue" data-state="found" data-testid="mm-queue"><h2>${COPY.online}</h2><p class="pp-found" role="status" data-testid="mm-found"><b>${COPY.matchFound}</b><span>${esc(COPY.foundLine(m.match.humans, m.match.bots, sideText(m.match.side), diff))}</span></p></div>`;
  }
  if (m.stopped) {
    const wait = m.retryS > 0;
    const again =
      m.stopped === 'update'
        ? `<button type="button" class="pl-btn big" data-p="reload">${COPY.reload}</button>`
        : `<button type="button" class="pl-btn big" data-p="mm-again" data-testid="mm-again"${wait ? ' disabled' : ''}>${COPY.searchAgain}</button>`;
    return `<div class="pp-card pp-narrow pp-queue" data-state="stopped" data-testid="mm-queue"><h2>${COPY.online}</h2><p class="pp-dim" role="status" data-testid="mm-stopped" data-reason="${m.stopped}"><span data-live="stop">${esc(stopText(m))}</span></p><div class="pp-col">${again}<button type="button" class="pl-btn ghost small" data-p="mm-cancel" data-testid="mm-cancel">${COPY.back}</button></div></div>`;
  }
  const est = m.estimateS !== null && m.estimateS > 0 ? ` · <span class="pp-dim">${esc(COPY.usually(clockText(m.estimateS)))}</span>` : '';
  const low = m.lowPriorityS > 0 ? `<p class="pp-hint pp-low" data-testid="mm-low"><span data-live="low">${esc(COPY.lowPriority(clockText(m.lowPriorityS)))}</span></p>` : '';
  const warn = m.warn && m.lowPriorityS <= 0 ? `<p class="pp-hint" data-testid="mm-warn">${COPY.leaverWarn}</p>` : '';
  const offer = m.offer ? backfillHtml(m.offer) : '';
  return `<div class="pp-card pp-narrow pp-queue" data-state="searching" data-testid="mm-queue">
    <h2>${m.party ? COPY.partyQueued : COPY.finding}</h2>
    ${low}
    <p class="pp-qtime" role="timer" aria-live="off"><b data-live="waited" data-testid="mm-timer">${clockText(m.waitedS)}</b>${est}</p>
    ${pipsHtml(m.found)}
    <p class="pp-note">${COPY.botsFill}</p>
    ${sideChipHtml(m.side)}
    ${warn}${offer}
    <button type="button" class="pl-btn ghost" data-p="mm-cancel" data-testid="mm-cancel">${COPY.cancel}</button>
  </div>`;
}
