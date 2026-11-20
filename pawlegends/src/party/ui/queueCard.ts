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
import { RANKED_BOTS } from '../../meta/ranked';
import { matchesForLevel } from '../../meta/accountLevel';
import { regionText } from '../../meta/rankedPing';
import { COOP_SWITCH_GRACE_S, queueBots } from '../botTrickle';
import { partyBonusChipHtml } from '../../meta/partyBonus';

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
  // Mode unlocks (MODE-UNLOCKS.md): the mode needs an account level a member has not reached
  | 'mode_level'
  // one main queue (MODE-UNLOCKS.md): the relay no longer takes this queue (5v5 Classic)
  | 'mode_retired'
  // Ranked (gap plan P4): the gate closed, a guest, too few matches, an unsaved ranked match, a trio
  | 'ranked_closed'
  | 'ranked_account'
  | 'ranked_matches'
  | 'ranked_pending'
  | 'ranked_party';

/** Ranked stops that Search again cannot fix now: the card offers Casual instead. */
export const RANKED_TO_CASUAL: ReadonlySet<QueueStop> = new Set<QueueStop>(['ranked_closed', 'ranked_account', 'ranked_matches', 'ranked_party', 'mode_level', 'mode_retired']);

/** Ranked's queue numbers (gap plan P4, round 4 §7.11): the refusal's counts and the low-population lines. */
export interface RankedQueueInfo {
  /** Seconds after which the searching card offers "Play Casual instead" (a relay that never fills ranked). */
  casualAfterS: number;
  online?: number;
  need?: number;
  have?: number;
  needMatches?: number;
  /** gaps5 polish 4: the refusal is about the duo partner (this player has the matches; the friend does not). */
  mate?: boolean;
  /** Players searching this pool now (the relay's count; bots never counted). */
  searching?: number;
  /** Prime Time is on: bots wait longer. */
  prime?: boolean;
  /** The region and its measured ping (groundwork: one region today). */
  region?: { name: string; ms: number | null };
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
  /** PARTY-XP.md: other humans from this player's own party (the "Party bonus +50% XP" chip when 1 or more). */
  partyMates?: number;
  stopped: QueueStop | null;
  /** Seconds before Search again works (locked or busy), or 0. */
  retryS: number;
  match: { humans: number; bots: number; side: string; difficulty: string; ai?: boolean } | null;
  offer: BackfillModel | null;
  /** Casual PvP (V16.md §5): the queue, the humans found on the other team, the 45 s move to co-op, a requeue. */
  pvp?: { theirs: number; toCoop: boolean; requeued: boolean };
  /** Ranked (gap plan P4): no bots, solo or duo; Casual offered after a long wait. */
  ranked?: RankedQueueInfo;
  /** Mode unlocks: the refused mode's level; `mine` true when this player has it (a party member does not). */
  modeLock?: { mode: string; level: number; have: number; need: number; mine: boolean };
  /** With `warn`: early leaves in the last 7 days (the Short wait's one sentence says how many). */
  left?: number;
  /** This player's own match is still live (`mm.rejoin`): Rejoin match or Search new match, before any search. */
  rejoin?: { mode: string; clockS: number };
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
    case 'mode_level': {
      const l = m.modeLock;
      if (!l) return COPY.modeLevel('5v5 Classic', 3, 0, matchesForLevel(3));
      const name = l.mode === 'classic' ? '5v5 Classic' : l.mode === 'ranked' ? 'Ranked' : 'This mode';
      return l.mine ? COPY.modeLevelMate(name, l.level) : COPY.modeLevel(name, l.level, l.have, l.need);
    }
    case 'mode_retired':
      return COPY.modeRetired;
    case 'ranked_closed':
      return COPY.rankedClosed(m.ranked?.online ?? 0, m.ranked?.need ?? 24);
    case 'ranked_account':
      return COPY.rankedAccount;
    case 'ranked_matches':
      return m.ranked?.mate ? COPY.rankedMate(m.ranked?.have ?? 0, m.ranked?.needMatches ?? 25) : COPY.rankedMatches(m.ranked?.have ?? 0, m.ranked?.needMatches ?? 25);
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

/**
 * Casual PvP: both teams' pips (●●○ vs ●○○). `waitedS` (casual and Classic, not ranked): bots trickle into the empty
 * seats as their own pips (botTrickle.ts), labelled for screen readers.
 */
export function pvpPipsHtml(mine: number, theirs: number, per = 3, waitedS?: number): string {
  const a = Math.max(1, Math.min(per, Math.round(mine)));
  const b = Math.max(0, Math.min(per, Math.round(theirs)));
  const bots = waitedS === undefined ? { mine: 0, theirs: 0 } : queueBots(waitedS, per, a, b);
  const pip = (n: number, nb: number) =>
    Array.from({ length: per }, (_, i) => `<i class="pp-pip${i < n ? ' on' : i < n + nb ? ' bot' : ''}"></i>`).join('');
  const total = bots.mine + bots.theirs;
  return `<span class="pp-pips pp-pvp-pips" role="img" aria-label="${esc(COPY.pvpTeams(a, b, total, per))}" data-testid="mm-pips" data-found="${a}" data-theirs="${b}" data-bots="${total}"><span>${pip(a, bots.mine)}</span><small>vs</small><span class="their">${pip(b, bots.theirs)}</span></span>`;
}

/** The side radio group (Cats · Dogs · Either). */
export function sideChipHtml(side: MmSide, disabled = false): string {
  return `<div class="pp-seg pp-mm-side" role="radiogroup" aria-label="${COPY.sideLabel}" data-testid="mm-side">${SIDES.map(
    (s) =>
      `<button type="button" role="radio" aria-checked="${s === side}" tabindex="${s === side ? 0 : -1}" data-p="mm-side" data-v="${s}" data-testid="mm-side-${s}"${disabled ? ' disabled' : ''}>${esc(sideText(s))}</button>`,
  ).join('')}</div>`;
}

/** PARTY-XP.md: the party bonus chip, only for a party with another human from the player's own party. */
const bonusChip = (m: Pick<QueueModel, 'partyMates'>): string => ((m.partyMates ?? 0) > 0 ? partyBonusChipHtml(m.partyMates ?? 0) : '');

export function queueCardHtml(m: QueueModel): string {
  if (m.match) {
    const diff = DIFF_LABEL[m.match.difficulty] ?? m.match.difficulty;
    // a friend party's match is the party's: its members leave from the pick (two taps), not from this strip
    const cancel = m.party ? '' : `<button type="button" class="pl-btn ghost small" data-p="mm-found-cancel" data-testid="mm-cancel">${COPY.cancel}</button>`;
    // ranked vs AI (§7.11): say so before the pick (your team against bots, quarter points)
    const ai = m.match.ai ? `<span class="pp-ai" data-testid="mm-found-ai">${esc(COPY.rankedAiFound)}</span>` : '';
    return `<div class="pp-card pp-narrow pp-queue" data-state="found" data-testid="mm-queue"${m.match.ai ? ' data-ranked="1" data-ai="1"' : ''}><h2>${m.match.ai ? COPY.rankedFoundAi : COPY.online}</h2><p class="pp-found" role="status" data-testid="mm-found"><b>${COPY.matchFound}</b><span>${esc(COPY.foundLine(m.match.humans, m.match.bots, sideText(m.match.side), diff))}</span>${ai}</p>${cancel}</div>`;
  }
  if (m.rejoin) return rejoinCardHtml(m.rejoin);
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
  // a low-priority wait (leaver ladder, dodges) is a wait before the search (founder, 2026-11-20: the card counted on
  // and filled bot pips while nothing could seat it): its own countdown, no search clock, no pips; the searching card
  // takes over when it ends (the relay starts the search then). The co-op switch's grace is no penalty.
  if (m.lowPriorityS > 0 && !m.pvp?.toCoop) return waitCardHtml(m);
  const est = m.estimateS !== null && m.estimateS > 0 ? ` · <span class="pp-dim">${esc(COPY.usually(clockText(m.estimateS)))}</span>` : '';
  // the co-op switch's own few seconds are no penalty (botTrickle.ts COOP_SWITCH_GRACE_S)
  const low = m.lowPriorityS > (m.pvp?.toCoop ? COOP_SWITCH_GRACE_S : 0) ? `<p class="pp-hint pp-low" data-testid="mm-low"><span data-live="low">${esc(COPY.lowPriority(clockText(m.lowPriorityS)))}</span></p>` : '';
  const warn = m.warn && m.lowPriorityS <= 0 ? `<p class="pp-hint" data-testid="mm-warn">${COPY.leaverWarn}</p>` : '';
  const offer = m.offer ? backfillHtml(m.offer) : '';
  if (m.ranked) {
    // ranked (round 4, §7.11): players first; the card says when labelled bots fill and when it becomes vs AI, how many
    // players search, and the region's ping. After a long wait (only a relay that never fills) it offers Casual.
    const long = m.waitedS >= m.ranked.casualAfterS;
    const fillS = m.ranked.prime ? RANKED_BOTS.primeFillS : RANKED_BOTS.fillS;
    const bots = m.waitedS < fillS ? COPY.rankedBotsAt(fillS - Math.floor(m.waitedS), fillS + RANKED_BOTS.aiAfterS) : COPY.rankedBotsNow;
    const live = [
      typeof m.ranked.searching === 'number' ? COPY.rankedSearching(m.ranked.searching) : '',
      m.ranked.prime ? COPY.rankedPrime : '',
      m.ranked.region ? regionText(m.ranked.region) : '',
    ].filter(Boolean);
    const liveLine = live.length ? `<p class="pp-dim pp-rk-live" data-testid="mm-ranked-live">${esc(live.join(' · '))}</p>` : '';
    const note = long
      ? `<p class="pp-hint" role="status" data-testid="mm-ranked-long">${COPY.rankedLong}</p><button type="button" class="pl-btn" data-p="mm-casual" data-testid="mm-play-casual">${COPY.playCasual}</button>`
      : `<p class="pp-note" data-testid="mm-ranked-note"><span data-live="rkbots">${esc(bots)}</span></p>`;
    const requeued = m.pvp?.requeued ? `<p class="pp-hint" data-testid="mm-requeued">${COPY.requeued}</p>` : '';
    return `<div class="pp-card pp-narrow pp-queue" data-state="searching" data-mode="pvp" data-ranked="1" data-testid="mm-queue">
    <h2>${m.party ? COPY.partyQueued : COPY.findingRanked}</h2>${bonusChip(m)}
    ${low}${requeued}
    <p class="pp-qtime" role="timer" aria-live="off"><b data-live="waited" data-testid="mm-timer">${clockText(m.waitedS)}</b>${est}</p>
    ${pvpPipsHtml(m.found, m.pvp?.theirs ?? 0, 3)}
    ${liveLine}
    ${note}
    ${sideChipHtml(m.side)}
    ${warn}
    <button type="button" class="pl-btn ghost" data-p="mm-cancel" data-testid="mm-cancel">${COPY.cancel}</button>
  </div>`;
  }
  if (m.pvp) {
    // casual PvP: both teams' pips, bots trickling in from 3 s; at the switch "playing Co-op vs bots" with Keep waiting
    const note = m.pvp.toCoop
      ? `<p class="pp-hint pp-tocoop" role="status" data-testid="mm-to-coop">${COPY.toCoop}</p><button type="button" class="pl-btn" data-p="mm-keep" data-testid="mm-keep">${COPY.keepWaiting}</button>`
      : '';
    const requeued = m.pvp.requeued && !m.pvp.toCoop ? `<p class="pp-hint" data-testid="mm-requeued">${COPY.requeued}</p>` : '';
    return `<div class="pp-card pp-narrow pp-queue" data-state="searching" data-mode="pvp" data-testid="mm-queue">
    <h2>${m.party ? COPY.partyQueued : COPY.findingPvp}</h2>${bonusChip(m)}
    ${low}${requeued}
    <p class="pp-qtime" role="timer" aria-live="off"><b data-live="waited" data-testid="mm-timer">${clockText(m.waitedS)}</b>${est}</p>
    ${pvpPipsHtml(m.found, m.pvp.theirs, m.teamSize === 5 ? 5 : 3, m.pvp.toCoop ? undefined : m.waitedS)}
    ${note}
    ${sideChipHtml(m.side)}
    ${warn}${offer}
    <button type="button" class="pl-btn ghost" data-p="mm-cancel" data-testid="mm-cancel">${COPY.cancel}</button>
  </div>`;
  }
  return `<div class="pp-card pp-narrow pp-queue" data-state="searching" data-testid="mm-queue">
    <h2>${m.party ? COPY.partyQueued : COPY.finding}</h2>${bonusChip(m)}
    ${low}
    <p class="pp-qtime" role="timer" aria-live="off"><b data-live="waited" data-testid="mm-timer">${clockText(m.waitedS)}</b>${est}</p>
    ${pipsHtml(m.found, m.teamSize === 5 ? 5 : 3)}
    ${sideChipHtml(m.side)}
    ${warn}${offer}
    <button type="button" class="pl-btn ghost" data-p="mm-cancel" data-testid="mm-cancel">${COPY.cancel}</button>
  </div>`;
}

/**
 * The player's own match is still live (a crash, a reload, the title while it runs): Rejoin match first; Search new
 * match gives that seat up (an early leave) and searches; Back closes the card and leaves the seat as it is.
 */
export function rejoinCardHtml(r: { mode: string; clockS: number }): string {
  return `<div class="pp-card pp-narrow pp-queue" data-state="rejoin" data-testid="mm-queue">
    <h2>${COPY.rejoinTitle}</h2>
    <p class="pp-dim" role="status" data-testid="mm-rejoin-line">${esc(COPY.rejoinLine(COPY.rejoinMode(r.mode), clockText(Math.max(0, r.clockS))))}</p>
    <div class="pp-col">
      <button type="button" class="pl-btn big" data-p="mm-rejoin" data-testid="mm-rejoin">${COPY.rejoinYes}</button>
      <button type="button" class="pl-btn ghost" data-p="mm-rejoin-no" data-testid="mm-rejoin-no">${COPY.rejoinNo}</button>
    </div>
    <p class="pp-hint" data-testid="mm-rejoin-hint">${COPY.rejoinHint}</p>
    <button type="button" class="pl-btn ghost small" data-p="mm-cancel" data-testid="mm-cancel">${COPY.back}</button>
  </div>`;
}

/** The low-priority wait: why, the countdown, then what happens; the side chip and Cancel stay. */
function waitCardHtml(m: QueueModel): string {
  const why = m.warn ? (m.left ? COPY.lowPriorityLeft(m.left) : COPY.lowPriorityLeaver) : COPY.lowPriorityDodge;
  const then = m.pvp && !m.ranked ? `<p class="pp-dim" data-testid="mm-wait-then">${COPY.lowPriorityThen}</p>` : '';
  return `<div class="pp-card pp-narrow pp-queue" data-state="wait" data-testid="mm-queue"${m.ranked ? ' data-ranked="1"' : ''}>
    <h2>${COPY.lowPriorityTitle}</h2>
    <p class="pp-hint pp-low" role="status" data-testid="mm-low">${esc(why)}</p>
    <p class="pp-qtime" role="timer" aria-live="off"><b data-live="lowclock" data-testid="mm-wait-timer">${clockText(Math.ceil(m.lowPriorityS))}</b></p>
    ${then}
    ${sideChipHtml(m.side)}
    <button type="button" class="pl-btn ghost" data-p="mm-cancel" data-testid="mm-cancel">${COPY.cancel}</button>
  </div>`;
}
