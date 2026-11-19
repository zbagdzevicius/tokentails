/**
 * The live-ops cards (docs/plans/moba/LIVEOPS.md) in the Events section of Home's Quests panel: the community goal with
 * its shared progress bar, Winter Nap's gift calendar and the fan vote between two coat concepts, each with its time
 * left. Home's `goalsPanelHtml` (ui/home/homeScreen.ts) puts `liveopsCardsHtml()` under Today's quests; `bindEvents`
 * wires the buttons and redraws the cards in place when the server answers, so the open panel never closes or jumps.
 *
 * Buttons carry `data-lo` (not Home's `data-a`): a claim or a vote keeps the panel open. No new art: inline SVG, our
 * champions' faces from the bundle (the goal's coat owner, each vote option's hero) and the vote's colour swatches. Names from the server are always escaped. Nothing here costs money.
 */
import '../css/events.css';
import { castVote, claimGoal, claimNap, goalPct, liveopsState, napPhase, onLiveops, refreshLiveops, voteShares, type LiveopsState } from '../../meta/liveops';
import { countdownText } from '../modeSelect/modes';
import { HEROES } from '../../data/heroes';
import { heroFaceUrl } from '../art';
import type { HeroId } from '../../sim/api';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const fmt = (n: number): string => n.toLocaleString('en-US');
const day = (t: number): string => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const heroName = (id: string): string => (HEROES as Record<string, { name?: string } | undefined>)[id]?.name ?? id;

const GLOBE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 3a8.5 8.5 0 1 0 5.5 14.9A7 7 0 0 1 15.5 3z"/><path fill="currentColor" d="M18 5l.6 1.4L20 7l-1.4.6L18 9l-.6-1.4L16 7l1.4-.6z"/></svg>';
const BALLOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 13h16v8H4zM7 3h10v9H7zm2.2 4.6l1.6 1.6 3.8-3.8 1 1-4.8 4.8-2.6-2.6z"/></svg>';
const GIFT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h18v4H3zM4.5 13h15v8h-15z"/><path fill="rgb(0 0 0 / 0.35)" d="M10.8 9h2.4v12h-2.4z"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" d="M12 8.5C10.5 5 6.5 3.8 6.5 6.4S10 8.5 12 8.5zm0 0c1.5-3.5 5.5-4.7 5.5-2.1S14 8.5 12 8.5z"/></svg>';

/** True when a card asks for a tap: a reached goal or an earned gift not claimed, or an open vote not cast. Pure. */
export function needsTap(s: LiveopsState, now = Date.now()): boolean {
  const { config: c, me } = s;
  if (c.goal?.reached && me?.goal && !me.goal.claimed) return true;
  if (c.nap && me?.nap && napPhase(c.nap, now) !== 'before' && me.nap.earned > me.nap.claimed) return true;
  return !!(c.vote?.open && me?.vote && !me.vote.choice && c.vote.endsAt > now);
}

/** "25d left" from one day up, "9h 12m left" under a day. Pure. */
export function leftText(ms: number): string {
  const d = Math.floor(ms / 86_400_000);
  return `${d >= 1 ? `${d}d` : countdownText(ms)} left`;
}

const COAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1.5 1.5L21 7l-1.5 6-2.5-1v9H7v-9l-2.5 1L3 7l4.5-2.5zm1.2 1.6L12 8l1.8-3.4z"/></svg>';
/** The hero a coat item belongs to (`coat.clem.loop.honey` → clem), if it is one of ours. */
const coatHero = (item: string): string | null => {
  const h = /^coat\.([a-z]+)\./.exec(item)?.[1];
  return h && h in HEROES ? h : null;
};
const faceImg = (h: string): string => `<img class="lo-face" src="${esc(heroFaceUrl(h as HeroId))}" alt="" width="28" height="28" loading="lazy" decoding="async">`;
const head = (kind: string, crest: string, title: string, sub: string): string =>
  `<div class="lo-h lo-art-${kind}"><span class="ev-crest" aria-hidden="true">${crest}</span><span class="t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`;

function goalCard(s: LiveopsState, now: number): string {
  const g = s.config.goal;
  if (!g || g.endsAt <= now - 30 * 86_400_000) return '';
  const pct = goalPct(g);
  const claimed = s.me?.goal?.id === g.id && s.me.goal.claimed;
  const ended = g.endsAt <= now;
  const hero = coatHero(g.rewardItem);
  const act = g.reached
    ? claimed
      ? '<span class="lo-done">Yours ✓</span>'
      : `<button type="button" class="lo-btn" data-lo="goal" data-testid="lo-claim"${s.busy ? ' disabled' : ''}>${s.busy === 'goal' ? 'Claiming…' : 'Claim coat'}</button>`
    : `<small class="lo-hint">${ended ? 'Ended' : `Every match counts · ${esc(leftText(g.endsAt - now))}`}</small>`;
  return `<div class="lo-card lo-goal" role="listitem" data-testid="lo-goal">
    ${head('goal', GLOBE, g.label, '')}
    <div class="lo-big" aria-hidden="true"><b>${fmt(g.progress)}</b> / ${fmt(g.target)}</div>
    <div class="lo-bar${g.reached ? ' full' : ''}" role="progressbar" aria-label="Community goal" aria-valuemin="0" aria-valuemax="${g.target}" aria-valuenow="${Math.min(g.progress, g.target)}" aria-valuetext="${fmt(g.progress)} of ${fmt(g.target)}"><i style="width:${pct}%"></i></div>
    <div class="lo-prize">${hero ? faceImg(hero) : `<span class="lo-coat" aria-hidden="true">${COAT}</span>`}<span>For everyone: <b>${esc(g.rewardName)}</b></span></div>
    <div class="lo-foot">${act}</div>
  </div>`;
}

function napCard(s: LiveopsState, now: number): string {
  const n = s.config.nap;
  if (!n) return '';
  const phase = napPhase(n, now);
  if (phase === 'after' && !(s.me?.nap && s.me.nap.earned > s.me.nap.claimed)) return '';
  const sub = phase === 'on' ? `One gift per day you play · ${leftText(n.endsAt - now)}` : `${day(n.startsAt)} to ${day(n.endsAt - 1)}`;
  const top = head('nap', MOON, n.name, sub);
  const count = n.gifts.length || 7;
  const me = phase === 'before' || !n.gifts.length ? { days: 0, earned: 0, claimed: 0, playedToday: false } : (s.me?.nap ?? { days: 0, earned: 0, claimed: 0, playedToday: false });
  const pips = Array.from({ length: count }, (_, i) => {
    const g = n.gifts[i];
    const last = i === count - 1;
    const cls = i < me.claimed ? 'got' : i < me.earned ? 'ready' : '';
    const title = g ? `Day ${g.day}: ${g.name}` : `Day ${i + 1}${last ? ': a coat' : ''}`;
    return `<i class="lo-pip ${cls}${last ? ' last' : ''}" title="${esc(title)}">${i < me.claimed ? '✓' : last ? COAT : GIFT}</i>`;
  }).join('');
  if (phase === 'before' || !n.gifts.length)
    return `<div class="lo-card lo-nap" role="listitem" data-testid="lo-nap">${top}<div class="lo-pips" aria-label="${esc(`${count} gifts, the last one a coat`)}">${pips}</div><small class="lo-hint">Play any ${count} days. No streak to break.</small></div>`;
  const ready = me.earned - me.claimed;
  const foot =
    ready > 0
      ? `<button type="button" class="lo-btn" data-lo="nap" data-testid="lo-nap-claim"${s.busy ? ' disabled' : ''}>${s.busy === 'nap' ? 'Unwrapping…' : `Open ${ready === 1 ? 'gift' : `${ready} gifts`}`}</button>`
      : me.claimed >= n.gifts.length
        ? `<span class="lo-done">All ${n.gifts.length} unwrapped ✓</span>`
        : `<small class="lo-hint">${me.playedToday ? "Today's in. Back tomorrow." : "Finish a match for today's gift."}</small>`;
  return `<div class="lo-card lo-nap" role="listitem" data-testid="lo-nap">${top}<div class="lo-pips" aria-label="${esc(`${me.claimed} of ${n.gifts.length} gifts opened`)}">${pips}</div><div class="lo-foot">${foot}</div></div>`;
}

function voteCard(s: LiveopsState, now: number): string {
  const v = s.config.vote;
  if (!v || v.endsAt <= now) return '';
  const mine = s.me?.vote?.id === v.id ? s.me.vote.choice : null;
  const shares = voteShares(v.tallies);
  const showResults = !!mine || !v.open;
  const opts = v.options
    .map((o) => {
      const sw = o.colors.map((c) => `<i style="background:${esc(c)}"></i>`).join('');
      const label = `${o.name} for ${heroName(o.hero)}`;
      const inner = `<span class="lo-sw" aria-hidden="true">${sw}</span>${o.hero in HEROES ? faceImg(o.hero) : ''}<span class="t"><b>${esc(o.name)}</b><small>${esc(heroName(o.hero))}</small></span>${showResults ? `<span class="lo-share">${mine === o.id ? '<i aria-hidden="true">✓</i>' : ''}${shares[o.id]}%</span>` : '<span class="lo-go" aria-hidden="true">Vote</span>'}`;
      return showResults
        ? `<div class="lo-opt${mine === o.id ? ' mine' : ''}" style="--share:${shares[o.id]}%" aria-label="${esc(`${label}: ${shares[o.id]}%${mine === o.id ? ', your vote' : ''}`)}">${inner}</div>`
        : `<button type="button" class="lo-opt" data-lo="vote" data-opt="${o.id}" data-testid="lo-vote-${o.id}" aria-label="${esc(`Vote for ${label}`)}"${s.busy ? ' disabled' : ''}>${inner}</button>`;
    })
    .join('');
  return `<div class="lo-card lo-vote" role="listitem" data-testid="lo-vote">${head('vote', BALLOT, v.question, `Vote · ${leftText(v.endsAt - now)}`)}<div class="lo-opts">${opts}</div>${mine ? '<small class="lo-hint">Your pick is in. Top vote gets made.</small>' : ''}</div>`;
}

/** The cards of the Quests panel's Events section (empty when nothing is on: home.css hides the section then). */
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
    // the Quests button's rose dot follows a card that asks for a tap (a reached goal, a gift, an open vote)
    const btn = root.querySelector<HTMLElement>('[data-a="goals"]');
    if (btn) {
      const want = needsTap(s);
      btn.classList.toggle('live', want);
      const dot = btn.querySelector('.hm-dot');
      if (want && !dot) btn.insertAdjacentHTML('beforeend', '<i class="hm-dot" aria-hidden="true"></i>');
      else if (!want) dot?.remove();
      const label = (btn.getAttribute('aria-label') ?? '').replace(/\. An event needs you$/, '');
      btn.setAttribute('aria-label', want ? `${label}. An event needs you` : label);
    }
  };
  const off = onLiveops(redraw);
  signal?.addEventListener('abort', off);
  void refreshLiveops();
}
