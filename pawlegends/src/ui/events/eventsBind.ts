/**
 * Home's live-ops wiring (docs/plans/moba/LIVEOPS.md), first load: the card buttons, the Quests button's dot and the
 * in-place redraw of the Events cards. The cards themselves (ui/events/eventsPanel.ts) load with the Quests panel.
 */
import { castVote, claimGoal, claimNap, napPhase, onLiveops, refreshLiveops, type LiveopsState } from '../../meta/liveops';

/** True when a card asks for a tap: a reached goal or an earned gift not claimed, or an open vote not cast. Pure. */
export function needsTap(s: LiveopsState, now = Date.now()): boolean {
  const { config: c, me } = s;
  if (c.goal?.reached && me?.goal && !me.goal.claimed) return true;
  if (c.nap && me?.nap && napPhase(c.nap, now) !== 'before' && me.nap.earned > me.nap.claimed) return true;
  return !!(c.vote?.open && me?.vote && !me.vote.choice && c.vote.endsAt > now);
}

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
    // the cards' markup lives in the Quests panel's chunk (already loaded when the panel is open)
    if (cards)
      void import('./eventsPanel')
        .then((m) => {
          if (cards.isConnected) cards.outerHTML = m.liveopsCardsHtml(s);
        })
        .catch(() => undefined);
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
