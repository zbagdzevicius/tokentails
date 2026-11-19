/**
 * Home's Quests panel (founder Nov 19: "events" and "tasks" overlap too much): ONE panel behind the left stack's Quests
 * button with two sections, Today (the daily quests, their progress and Treat XP; the Welcome Path and Lucky Treat rows)
 * and Events (the live-ops cards: community goal, Winter Nap, fan vote, each with its time left; home.css hides the
 * section while no card is on, no empty state). The Legends Pass season row is gone: Pass has its own nav item.
 *
 * Its own small chunk (Home's first load stays within budget): homeScreen.ts imports it on the first open. The panel is
 * in the DOM only while open, as a dialog with aria-modal, so Enter never starts a match behind it and the app shell's
 * Android back (an Escape, pawlegends-app back.ts `[aria-modal="true"]`) closes it. Names are escaped; nothing costs money.
 */
import type { HomeScreenOpts } from './homeScreen';
import { questTally } from '../lobby/lobbyScreen';
import { liveopsCardsHtml } from '../events/eventsPanel';
import { refreshLiveops } from '../../meta/liveops';
import { QUEST_XP } from '../../meta/quests';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const CLOSE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

/** "7h", "45m": the time to the next local midnight, when the day's quests change. Pure. */
export function questsResetText(now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const min = Math.max(1, Math.ceil((next - now.getTime()) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}h` : `${min}m`;
}

/** The panel's markup: Today, then Events (timed modes are off the menu, MODE-UNLOCKS.md). */
export function goalsPanelHtml(o: Pick<HomeScreenOpts, 'quests' | 'todayExtra'>): string {
  const t = questTally(o.quests);
  const rows = (o.quests ?? [])
    .map((q) => {
      const p = Math.round((100 * Math.min(q.value, q.quest.goal)) / Math.max(1, q.quest.goal));
      const state = q.done ? 'Done' : `${q.value} of ${q.quest.goal}`;
      return `<li class="q${q.done ? ' done' : ''}${q.quest.bonus ? ' bonus' : ''}" aria-label="${esc(`${q.quest.text}${q.quest.bonus ? ' (bonus, with a friend)' : ''}: ${state}. ${QUEST_XP} Treat XP`)}"><span class="tick" aria-hidden="true">${q.done ? '✓' : ''}</span><span class="t"><span class="tx">${esc(q.quest.text)}</span><span class="qbar" aria-hidden="true"><i style="width:${p}%"></i></span></span><span class="n" aria-hidden="true"><b>${q.done ? 'Done' : `${q.value}/${q.quest.goal}`}</b><small>+${QUEST_XP} XP</small></span></li>`;
    })
    .join('');
  return `<div class="hm-gp" role="dialog" aria-modal="true" aria-labelledby="hm-gp-t" data-testid="goals-panel">
    <div class="hm-gp-h"><b id="hm-gp-t">Quests</b><button type="button" class="hm-gp-x" data-a="goals-close" aria-label="Close quests">${CLOSE}</button></div>
    <div class="hm-gp-body">
      <section class="hm-gp-sec" aria-labelledby="hm-gp-today" data-testid="goals-today"><h3 id="hm-gp-today">Today <small>${t.done} of ${t.total} done · new in ${esc(questsResetText())}</small></h3><ul class="hm-qlist">${rows}</ul><p class="hm-gp-fine">Treat XP is added when the match ends.</p>${o.todayExtra ?? ''}</section>
      <section class="hm-gp-sec hm-gp-ev" aria-labelledby="hm-gp-ev" data-testid="goals-events"><h3 id="hm-gp-ev">Events</h3>${liveopsCardsHtml()}</section>
    </div>
  </div>`;
}

/**
 * Place the open panel in the free space right of the left stack: under the profile chip, left of the PLAY cluster and
 * the promo, above the nav where they share columns (no overlap at any size; it scrolls inside itself when short).
 */
export function placeGoals(root: HTMLElement): void {
  const panel = root.querySelector<HTMLElement>('.hm-gp');
  const left = root.querySelector<HTMLElement>('.hm-left');
  if (!panel || !left) return;
  const box = (sel: string): DOMRect | null => {
    const b = root.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
    return b && (b.width || b.height) ? b : null;
  };
  const R = root.getBoundingClientRect();
  const L = left.getBoundingClientRect();
  if (!R.width || !R.height) return;
  const gap = 12;
  const x0 = L.right + gap;
  const y0 = Math.max(L.top, (box('.hm-profile')?.bottom ?? R.top) + 8);
  let x1 = R.right - gap;
  let y1 = R.bottom - gap;
  for (const sel of ['.hm-extras', '.hm-play', '.hm-line', '.hm-promo']) {
    const b = box(sel);
    if (b && b.left > x0 && b.bottom > y0) x1 = Math.min(x1, b.left - gap);
  }
  const nav = box('.hm-nav');
  if (nav && nav.left < x1 && nav.right > x0) y1 = Math.min(y1, nav.top - gap);
  // Today and Events side by side where there is room for both; Today alone stays a readable column
  const events = !!panel.querySelector('.hm-gp-ev .lo-card, .hm-gp-ev .lo-toast');
  const w = Math.max(240, Math.min(events ? 720 : 440, x1 - x0));
  panel.style.left = `${Math.round(x0 - L.left)}px`;
  panel.style.top = `${Math.round(y0 - L.top)}px`;
  panel.style.width = `${Math.round(w)}px`;
  panel.style.maxHeight = `${Math.round(Math.max(160, y1 - y0))}px`;
  panel.classList.toggle('wide', events && w >= 560);
}

/**
 * Open the panel, or redraw the open one with new options (`quiet`: a Home patch; the scroll and a focused close button
 * stay, no refresh, no focus move).
 */
export function showGoals(root: HTMLElement, o: Pick<HomeScreenOpts, 'quests' | 'todayExtra'>, quiet = false): void {
  const left = root.querySelector<HTMLElement>('.hm-left');
  const btn = root.querySelector<HTMLElement>('[data-a="goals"]');
  if (!left || !btn) return;
  const old = root.querySelector<HTMLElement>('.hm-gp');
  const scroll = old?.querySelector('.hm-gp-body')?.scrollTop ?? 0;
  const hadFocus = !!old?.contains(document.activeElement);
  const tpl = document.createElement('template');
  tpl.innerHTML = goalsPanelHtml(o).trim();
  const panel = tpl.content.firstElementChild as HTMLElement;
  if (old) old.remove();
  left.appendChild(panel);
  btn.setAttribute('aria-expanded', 'true');
  root.classList.add('hm-gp-on');
  placeGoals(root);
  const body = panel.querySelector<HTMLElement>('.hm-gp-body');
  const x = panel.querySelector<HTMLElement>('.hm-gp-x');
  if (old || quiet) {
    if (body) body.scrollTop = scroll;
    if (hadFocus) x?.focus({ preventScroll: true });
    return;
  }
  // the shared goal bar moves with everyone's matches: re-read a config older than 15 s
  void refreshLiveops(15_000);
  // an event that needs a tap (the button's rose dot) is what the player came for: on a one-column panel (phones)
  // Events sits under Today, so scroll it into view
  const ev = panel.querySelector<HTMLElement>('.hm-gp-ev');
  if (btn.classList.contains('live') && !panel.classList.contains('wide') && ev && body && ev.offsetHeight) body.scrollTop = Math.max(0, ev.offsetTop - body.offsetTop - 4);
  x?.focus({ preventScroll: true });
}

/** Close the panel; `focus` returns focus to the Quests button (Esc, the close button). */
export function hideGoals(root: HTMLElement, focus = true): void {
  const panel = root.querySelector<HTMLElement>('.hm-gp');
  const btn = root.querySelector<HTMLElement>('[data-a="goals"]');
  if (!panel) return;
  const had = panel.contains(document.activeElement);
  panel.remove();
  root.classList.remove('hm-gp-on');
  btn?.setAttribute('aria-expanded', 'false');
  if (focus || had) btn?.focus({ preventScroll: true });
}
