/**
 * The Events popover's live-ops cards (docs/plans/moba/LIVEOPS.md): the community goal with its shared progress bar,
 * Winter Nap's gift calendar and the fan vote between two coat concepts. Home's `eventRows` (ui/home/homeScreen.ts)
 * puts `liveopsCardsHtml()` above the mode rows; `bindEvents` wires the buttons and redraws the cards in place when the
 * server answers, so the open popover never closes or jumps.
 *
 * Buttons carry `data-lo` (not Home's `data-a`): a claim or a vote keeps the popover open. CSS only, no new art (the
 * vote's concepts are three colour swatches each). Names from the server are always escaped. Nothing here costs money.
 */
import '../css/events.css';
import { castVote, claimGoal, claimNap, goalPct, liveopsState, napPhase, onLiveops, refreshLiveops, voteShares, type LiveopsState } from '../../meta/liveops';
import { countdownText } from '../modeSelect/modes';
import { HEROES } from '../../data/heroes';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const fmt = (n: number): string => n.toLocaleString('en-US');
const day = (t: number): string => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const heroName = (id: string): string => (HEROES as Record<string, { name?: string } | undefined>)[id]?.name ?? id;

const GLOBE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 3a8.5 8.5 0 1 0 5.5 14.9A7 7 0 0 1 15.5 3z"/><path fill="currentColor" d="M18 5l.6 1.4L20 7l-1.4.6L18 9l-.6-1.4L16 7l1.4-.6z"/></svg>';
const BALLOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 13h16v8H4zM7 3h10v9H7zm2.2 4.6l1.6 1.6 3.8-3.8 1 1-4.8 4.8-2.6-2.6z"/></svg>';
const GIFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h18v4H3zM5 13h14v8H5zM11 9h2v12h-2zM12 9c-1.5-3-5-4-5.5-2S9 9 12 9zm0 0c1.5-3 5-4 5.5-2S15 9 12 9z"/></svg>';

/** True when a card asks for a tap: a reached goal or an earned gift not claimed, or an open vote not cast. Pure. */
export function needsTap(s: LiveopsState, now = Date.now()): boolean {
  const { config: c, me } = s;
  if (c.goal?.reached && me?.goal && !me.goal.claimed) return true;
  if (c.nap && me?.nap && napPhase(c.nap, now) !== 'before' && me.nap.earned > me.nap.claimed) return true;
  return !!(c.vote?.open && me?.vote && !me.vote.choice && c.vote.endsAt > now);
}

function goalCard(s: LiveopsState, now: number): string {
  const g = s.config.goal;
  if (!g || g.endsAt <= now - 30 * 86_400_000) return '';
  const pct = goalPct(g);
  const claimed = s.me?.goal?.id === g.id && s.me.goal.claimed;
  const ended = g.endsAt <= now;
  const foot = g.reached
    ? claimed
      ? '<span class="lo-done">Claimed ✓</span>'
      : `<button type="button" class="lo-btn" data-lo="goal" data-testid="lo-claim"${s.busy ? ' disabled' : ''}>${s.busy === 'goal' ? 'Claiming…' : 'Claim your coat'}</button>`
    : `<small class="lo-hint">${ended ? 'Ended' : `Every match you finish counts · ${esc(countdownText(g.endsAt - now))} left`}</small>`;
  return `<div class="lo-card lo-goal" role="listitem" data-testid="lo-goal">
    <div class="lo-h"><span class="ev-crest" aria-hidden="true">${GLOBE}</span><span class="t"><b>${esc(g.label)}</b><small>Everyone gets: ${esc(g.rewardName)}</small></span></div>
    <div class="lo-bar${g.reached ? ' full' : ''}" role="progressbar" aria-label="Community goal" aria-valuemin="0" aria-valuemax="${g.target}" aria-valuenow="${Math.min(g.progress, g.target)}" aria-valuetext="${fmt(g.progress)} of ${fmt(g.target)}"><i style="width:${pct}%"></i><span>${fmt(g.progress)} / ${fmt(g.target)}</span></div>
    <div class="lo-foot">${foot}</div>
  </div>`;
}

function napCard(s: LiveopsState, now: number): string {
  const n = s.config.nap;
  if (!n) return '';
  const phase = napPhase(n, now);
  if (phase === 'after' && !(s.me?.nap && s.me.nap.earned > s.me.nap.claimed)) return '';
  const last = day(n.endsAt - 1);
  const head = `<div class="lo-h"><span class="ev-crest" aria-hidden="true">${MOON}</span><span class="t"><b>${esc(n.name)}</b><small>${day(n.startsAt)} – ${last} · a gift for each day you play</small></span></div>`;
  if (phase === 'before' || !n.gifts.length) {
    const count = n.gifts.length || 7;
    return `<div class="lo-card lo-nap" role="listitem" data-testid="lo-nap">${head}<small class="lo-hint">Starts ${day(n.startsAt)}: play on ${count} days, open ${count} gifts, the last one a coat. Missed a day? Nothing resets.</small></div>`;
  }
  const me = s.me?.nap ?? { days: 0, earned: 0, claimed: 0, playedToday: false };
  const pips = n.gifts
    .map((g, i) => {
      const cls = i < me.claimed ? 'got' : i < me.earned ? 'ready' : '';
      return `<i class="lo-pip ${cls}${i === n.gifts.length - 1 ? ' last' : ''}" title="${esc(`Day ${g.day}: ${g.name}`)}">${i < me.claimed ? '✓' : i === n.gifts.length - 1 ? GIFT : g.day}</i>`;
    })
    .join('');
  const ready = me.earned - me.claimed;
  const foot =
    ready > 0
      ? `<button type="button" class="lo-btn" data-lo="nap" data-testid="lo-nap-claim"${s.busy ? ' disabled' : ''}>${s.busy === 'nap' ? 'Opening…' : `Open ${ready === 1 ? 'your gift' : `${ready} gifts`}`}</button>`
      : me.claimed >= n.gifts.length
        ? '<span class="lo-done">All gifts opened ✓</span>'
        : `<small class="lo-hint">${me.playedToday ? 'Today counted. Come back tomorrow.' : 'Finish a match today for the next gift.'}</small>`;
  return `<div class="lo-card lo-nap" role="listitem" data-testid="lo-nap">${head}<div class="lo-pips" aria-label="${esc(`${me.claimed} of ${n.gifts.length} gifts opened`)}">${pips}</div><div class="lo-foot">${foot}</div></div>`;
}

function voteCard(s: LiveopsState, now: number): string {
  const v = s.config.vote;
  if (!v || v.endsAt <= now) return '';
  const mine = s.me?.vote?.id === v.id ? s.me.vote.choice : null;
  const shares = voteShares(v.tallies);
  const showResults = !!mine || !v.open;
  const opts = v.options
    .map((o) => {
      const sw = o.colors.map((c) => `<i style="background:${c}"></i>`).join('');
      const label = `${o.name} for ${heroName(o.hero)}`;
      const inner = `<span class="lo-sw" aria-hidden="true">${sw}</span><span class="t"><b>${esc(o.name)}</b><small>${esc(heroName(o.hero))}</small></span>${showResults ? `<span class="lo-share">${shares[o.id]}%</span>` : ''}`;
      return showResults
        ? `<div class="lo-opt${mine === o.id ? ' mine' : ''}" style="--share:${shares[o.id]}%" aria-label="${esc(`${label}: ${shares[o.id]}%${mine === o.id ? ', your vote' : ''}`)}">${inner}</div>`
        : `<button type="button" class="lo-opt" data-lo="vote" data-opt="${o.id}" data-testid="lo-vote-${o.id}" aria-label="${esc(`Vote for ${label}`)}"${s.busy ? ' disabled' : ''}>${inner}</button>`;
    })
    .join('');
  return `<div class="lo-card lo-vote" role="listitem" data-testid="lo-vote"><div class="lo-h"><span class="ev-crest" aria-hidden="true">${BALLOT}</span><span class="t"><b>${esc(v.question)}</b><small>Fan vote · ${esc(countdownText(v.endsAt - now))} left</small></span></div><div class="lo-opts">${opts}</div>${mine ? '<small class="lo-hint">You voted. The winner becomes a coat.</small>' : ''}</div>`;
}

/** The cards Home's Events list shows above its mode rows (empty when nothing is on). */
export function liveopsCardsHtml(s: LiveopsState = liveopsState(), now = Date.now()): string {
  const toast = s.toast ? `<p class="lo-toast" role="status">${esc(s.toast)}</p>` : '';
  return `<div class="lo-cards" data-testid="lo-cards">${toast}${goalCard(s, now)}${napCard(s, now)}${voteCard(s, now)}</div>`;
}

/** The featured mode's id (Home tags its row "Featured"). */
export const featuredModeId = (): string | null => liveopsState().config.featuredMode?.id ?? null;

/**
 * Wire one Home: the card buttons, the in-place redraw on every live-ops change, and a refresh of the config (at most
 * once a minute). The listener drops itself when this Home leaves the page.
 */
export function bindEvents(root: HTMLElement, signal?: AbortSignal | null): void {
  root.addEventListener(
    'click',
    (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lo]');
      if (!b || b.disabled) return;
      e.stopPropagation();
      const k = b.dataset.lo;
      if (k === 'goal') void claimGoal();
      else if (k === 'nap') void claimNap();
      else if (k === 'vote' && (b.dataset.opt === 'a' || b.dataset.opt === 'b')) void castVote(b.dataset.opt);
    },
    signal ? { signal } : undefined,
  );
  const redraw = (s: LiveopsState): void => {
    if (!root.isConnected) {
      off();
      return;
    }
    const cards = root.querySelector('.lo-cards');
    if (cards) cards.outerHTML = liveopsCardsHtml(s);
    const summary = root.querySelector('.hm-events > summary');
    if (summary && needsTap(s) && !summary.querySelector('.hm-dot')) {
      summary.classList.add('live');
      summary.insertAdjacentHTML('beforeend', '<i class="hm-dot" aria-hidden="true"></i>');
    }
  };
  // opening Events re-reads a config older than 15 s (the shared goal bar moves with everyone's matches)
  root.addEventListener(
    'toggle',
    (e) => {
      const d = e.target as HTMLElement;
      if (d instanceof HTMLDetailsElement && d.open && d.classList.contains('hm-events')) void refreshLiveops(15_000);
    },
    signal ? { capture: true, signal } : { capture: true },
  );
  const off = onLiveops(redraw);
  signal?.addEventListener('abort', off);
  void refreshLiveops();
}
