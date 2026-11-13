/**
 * The Quick Play queue card (docs/plans/moba/M1A-IMPL.md §1, §6): "Finding teammates… 0:07 · usually 0:15", the humans
 * found as pips (●●○), the side chip (Cats · Dogs · Either, a radio group the arrow keys move), a low-priority
 * countdown and the leaver warning, **Cancel** from the first frame (also on the 1.2 s "Match found" strip for a solo,
 * `mm-found-cancel`: a bot takes the seat), the stopped states
 * (away, another tab, locked, busy) with **Search again**, and the backfill offer on top.
 *
 * Pure markup: the party client fills the model and dispatches the `data-p` actions (`mm-cancel`, `mm-side`,
 * `mm-again`, `bf-yes`, `bf-no`). Timer texts sit in `data-live` spans the client updates in place every 250 ms, so
 * the card is not redrawn (focus stays on the side chip). Mid-screen, safe at 667×375.
 */
import type { MmSide } from '../../net/proto';
import { COPY, DIFF_LABEL, clockText, esc, sideText } from './copy';
import { backfillHtml, type BackfillModel } from './backfillCard';

export type QueueStop =
  | 'away'
  | 'left'
  | 'party'
  | 'update'
  | 'locked'
  | 'busy'
  | 'declined'
  | 'timeout'
  | 'newbie'
  // Ranked (gap plan P4): the gate closed, a guest, too few matches, an unsaved ranked match, a trio
  | 'ranked_closed'
  | 'ranked_account'
  | 'ranked_matches'
  | 'ranked_pending'
  | 'ranked_party';

/** Ranked stops that Search again cannot fix now: the card offers Casual instead. */
export const RANKED_TO_CASUAL: ReadonlySet<QueueStop> = new Set<QueueStop>(['ranked_closed', 'ranked_account', 'ranked_matches', 'ranked_party']);

/** Ranked's queue numbers (gap plan P4): when the card offers Casual, and the refusal's counts. */
export interface RankedQueueInfo {
  /** Seconds after which the searching card offers "Play Casual instead". */
  casualAfterS: number;
  online?: number;
  need?: number;
  have?: number;
  needMatches?: number;
}

export interface QueueModel {
  side: MmSide;
  /** Sim v19: seats per team (5 in the 5v5 Classic queue; absent = 3). */
  teamSize?: number;
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
  /** Casual PvP (V16.md §5): the queue, the humans found on the other team, the 45 s move to co-op, a requeue. */
  pvp?: { theirs: number; toCoop: boolean; requeued: boolean };
  /** Ranked (gap plan P4): no bots, solo or duo; Casual offered after a long wait. */
  ranked?: RankedQueueInfo;
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
    case 'declined':
      return COPY.declinedYou;
    case 'timeout':
      return COPY.timeoutYou;
    case 'newbie':
      return COPY.pvpLocked;
    case 'ranked_closed':
      return COPY.rankedClosed(m.ranked?.online ?? 0, m.ranked?.need ?? 24);
    case 'ranked_account':
      return COPY.rankedAccount;
    case 'ranked_matches':
      return COPY.rankedMatches(m.ranked?.have ?? 0, m.ranked?.needMatches ?? 10);
    case 'ranked_pending':
      return COPY.rankedPending;
    case 'ranked_party':
      return COPY.rankedParty;
    default:
      return COPY.stoppedParty;
  }
};

/** The found pips: ●●○ (1..3 of 3). */
export function pipsHtml(found: number, per = 3): string {
  const n = Math.max(1, Math.min(per, Math.round(found)));
  return `<span class="pp-pips" role="img" aria-label="${esc(COPY.playersFound(n))}" data-testid="mm-pips" data-found="${n}">${Array.from({ length: per }, (_, i) => `<i class="pp-pip${i < n ? ' on' : ''}"></i>`).join('')}</span>`;
}

/** Casual PvP: both teams' pips (●●○ vs ●○○). */
export function pvpPipsHtml(mine: number, theirs: number, per = 3): string {
  const pip = (n: number) => Array.from({ length: per }, (_, i) => `<i class="pp-pip${i < n ? ' on' : ''}"></i>`).join('');
  const a = Math.max(1, Math.min(per, Math.round(mine)));
  const b = Math.max(0, Math.min(per, Math.round(theirs)));
  return `<span class="pp-pips pp-pvp-pips" role="img" aria-label="${esc(COPY.pvpTeams(a, b))}" data-testid="mm-pips" data-found="${a}" data-theirs="${b}"><span>${pip(a)}</span><small>vs</small><span class="their">${pip(b)}</span></span>`;
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
    // a friend party's match is the party's: its members leave from the pick (two taps), not from this strip
    const cancel = m.party ? '' : `<button type="button" class="pl-btn ghost small" data-p="mm-found-cancel" data-testid="mm-cancel">${COPY.cancel}</button>`;
    return `<div class="pp-card pp-narrow pp-queue" data-state="found" data-testid="mm-queue"><h2>${COPY.online}</h2><p class="pp-found" role="status" data-testid="mm-found"><b>${COPY.matchFound}</b><span>${esc(COPY.foundLine(m.match.humans, m.match.bots, sideText(m.match.side), diff))}</span></p>${cancel}</div>`;
  }
  if (m.stopped) {
    const wait = m.retryS > 0;
    const again =
      m.stopped === 'update' && !m.pvp
        ? `<button type="button" class="pl-btn big" data-p="reload">${COPY.reload}</button>`
        : RANKED_TO_CASUAL.has(m.stopped)
          ? `<button type="button" class="pl-btn big" data-p="mm-casual" data-testid="mm-play-casual">${COPY.playCasual}</button>`
          : `<button type="button" class="pl-btn big" data-p="mm-again" data-testid="mm-again"${wait ? ' disabled' : ''}>${COPY.searchAgain}</button>`;
    return `<div class="pp-card pp-narrow pp-queue" data-state="stopped" data-testid="mm-queue"${m.ranked ? ' data-ranked="1"' : ''}><h2>${COPY.online}</h2><p class="pp-dim" role="status" data-testid="mm-stopped" data-reason="${m.stopped}"><span data-live="stop">${esc(stopText(m))}</span></p><div class="pp-col">${again}<button type="button" class="pl-btn ghost small" data-p="mm-cancel" data-testid="mm-cancel">${COPY.back}</button></div></div>`;
  }
  const est = m.estimateS !== null && m.estimateS > 0 ? ` · <span class="pp-dim">${esc(COPY.usually(clockText(m.estimateS)))}</span>` : '';
  const low = m.lowPriorityS > 0 ? `<p class="pp-hint pp-low" data-testid="mm-low"><span data-live="low">${esc(COPY.lowPriority(clockText(m.lowPriorityS)))}</span></p>` : '';
  const warn = m.warn && m.lowPriorityS <= 0 ? `<p class="pp-hint" data-testid="mm-warn">${COPY.leaverWarn}</p>` : '';
  const offer = m.offer ? backfillHtml(m.offer) : '';
  if (m.ranked) {
    // ranked: both teams' pips, never a bot; after a long wait the card offers Casual (the player's choice, never automatic)
    const long = m.waitedS >= m.ranked.casualAfterS;
    const note = long
      ? `<p class="pp-hint" role="status" data-testid="mm-ranked-long">${COPY.rankedLong}</p><button type="button" class="pl-btn" data-p="mm-casual" data-testid="mm-play-casual">${COPY.playCasual}</button>`
      : `<p class="pp-note" data-testid="mm-ranked-note">${COPY.rankedNote}</p>`;
    const requeued = m.pvp?.requeued ? `<p class="pp-hint" data-testid="mm-requeued">${COPY.requeued}</p>` : '';
    return `<div class="pp-card pp-narrow pp-queue" data-state="searching" data-mode="pvp" data-ranked="1" data-testid="mm-queue">
    <h2>${m.party ? COPY.partyQueued : COPY.findingRanked}</h2>
    ${low}${requeued}
    <p class="pp-qtime" role="timer" aria-live="off"><b data-live="waited" data-testid="mm-timer">${clockText(m.waitedS)}</b>${est}</p>
    ${pvpPipsHtml(m.found, m.pvp?.theirs ?? 0, 3)}
    ${note}
    ${sideChipHtml(m.side)}
    ${warn}
    <button type="button" class="pl-btn ghost" data-p="mm-cancel" data-testid="mm-cancel">${COPY.cancel}</button>
  </div>`;
  }
  if (m.pvp) {
    // casual PvP: both teams' pips; at the switch "playing Co-op vs bots" with Keep waiting
    const note = m.pvp.toCoop
      ? `<p class="pp-hint pp-tocoop" role="status" data-testid="mm-to-coop">${COPY.toCoop}</p><button type="button" class="pl-btn" data-p="mm-keep" data-testid="mm-keep">${COPY.keepWaiting}</button>`
      : `<p class="pp-note">${COPY.pvpFill}</p>`;
    const requeued = m.pvp.requeued && !m.pvp.toCoop ? `<p class="pp-hint" data-testid="mm-requeued">${COPY.requeued}</p>` : '';
    return `<div class="pp-card pp-narrow pp-queue" data-state="searching" data-mode="pvp" data-testid="mm-queue">
    <h2>${m.party ? COPY.partyQueued : COPY.findingPvp}</h2>
    ${low}${requeued}
    <p class="pp-qtime" role="timer" aria-live="off"><b data-live="waited" data-testid="mm-timer">${clockText(m.waitedS)}</b>${est}</p>
    ${pvpPipsHtml(m.found, m.pvp.theirs, m.teamSize === 5 ? 5 : 3)}
    ${note}
    ${sideChipHtml(m.side)}
    ${warn}${offer}
    <button type="button" class="pl-btn ghost" data-p="mm-cancel" data-testid="mm-cancel">${COPY.cancel}</button>
  </div>`;
  }
  return `<div class="pp-card pp-narrow pp-queue" data-state="searching" data-testid="mm-queue">
    <h2>${m.party ? COPY.partyQueued : COPY.finding}</h2>
    ${low}
    <p class="pp-qtime" role="timer" aria-live="off"><b data-live="waited" data-testid="mm-timer">${clockText(m.waitedS)}</b>${est}</p>
    ${pipsHtml(m.found, m.teamSize === 5 ? 5 : 3)}
    <p class="pp-note">${COPY.botsFill}</p>
    ${sideChipHtml(m.side)}
    ${warn}${offer}
    <button type="button" class="pl-btn ghost" data-p="mm-cancel" data-testid="mm-cancel">${COPY.cancel}</button>
  </div>`;
}
