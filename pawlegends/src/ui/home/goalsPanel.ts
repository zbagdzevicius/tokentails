/**
 * Home's Quests panel (founder Nov 19: "events" and "tasks" overlap too much): ONE panel behind the left stack's Quests
 * button with two sections, Today (the daily quests, their progress and Season XP; the Welcome Path and Lucky Treat rows)
 * and Events (the live-ops cards: community goal, Winter Nap, fan vote, each with its time left; quests.css hides the
 * section while no card is on, no empty state). The Legends Pass season row is gone: Pass has its own nav item.
 *
 * Nov 19 facelift ("more visual, funny, condensed, thematic and easier to read"; the "sticker board"): each quest is a
 * little card with a picture (the champion's face, the four Pink Paw cats' faces or a themed icon), a chunky bar, a big count
 * and its Season XP on a treat chip; a finished quest gets a "Nailed it" stamp. Wide screens show Today and Events side
 * by side; a narrow panel (landscape phones) has Today and Events tabs in its header.
 *
 * Its own small chunk (Home's first load stays within budget): homeScreen.ts imports it on the first open, and its CSS
 * (quests.css) rides along. The panel is in the DOM only while open, as a dialog with aria-modal, so Enter never starts
 * a match behind it and the app shell's Android back (an Escape, pawlegends-app back.ts `[aria-modal="true"]`) closes
 * it. Names are escaped; nothing costs money.
 */
import '../css/quests.css';
import type { HomeScreenOpts } from './homeScreen';
import type { HeroId } from '../../sim/api';
import { questTally } from '../lobby/lobbyScreen';
import { liveopsCardsHtml } from '../events/eventsPanel';
import { refreshLiveops } from '../../meta/liveops';
import { QUEST_XP, type QuestView } from '../../meta/quests';
import { HEROES } from '../../data/heroes';
import { CHAMPION_IDS } from '../../data/heroes/shelter';
import { heroFaceUrl } from '../art';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const svg = (body: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const CLOCK = svg('<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 9v4.5l3 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M9 2.5h6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>');
/** A dog bone: the Season XP chip. */
const BONE = svg('<g fill="currentColor" transform="rotate(-30 12 12)"><circle cx="5.5" cy="9.6" r="2.9"/><circle cx="5.5" cy="14.4" r="2.9"/><circle cx="18.5" cy="9.6" r="2.9"/><circle cx="18.5" cy="14.4" r="2.9"/><rect x="5.5" y="9.4" width="13" height="5.2"/></g>');
const TICK = svg('<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>');
const PAW = svg('<path fill="currentColor" d="M12 11c3 0 6 3.6 6 6.6 0 2-1.5 3-3 3-1.2 0-2-.6-3-.6s-1.8.6-3 .6c-1.5 0-3-1-3-3C6 14.6 9 11 12 11z"/><ellipse fill="currentColor" cx="5.2" cy="9.6" rx="2.1" ry="2.6"/><ellipse fill="currentColor" cx="9.2" cy="5.4" rx="2.1" ry="2.7"/><ellipse fill="currentColor" cx="14.8" cy="5.4" rx="2.1" ry="2.7"/><ellipse fill="currentColor" cx="18.8" cy="9.6" rx="2.1" ry="2.6"/>');
/** The themed icon of each kind of quest (the hero quests show the champion's face instead). */
const ICONS: Readonly<Record<string, string>> = Object.freeze({
  win: svg('<path fill="currentColor" d="M7 3h10v2h3v2.5A4.5 4.5 0 0 1 15.9 12 5 5 0 0 1 13 14.6V17h3v4H8v-4h3v-2.4A5 5 0 0 1 8.1 12 4.5 4.5 0 0 1 4 7.5V5h3zm0 4H6v.5c0 1 .5 1.9 1.3 2.3A6 6 0 0 1 7 8zm10 0v1c0 .6-.1 1.2-.3 1.8.8-.4 1.3-1.3 1.3-2.3V7z"/>'),
  takedowns: svg('<path fill="currentColor" d="M12 1.5l2.4 5.2 5.4-2.1-2.1 5.4 5.3 2.3-5.3 2.3 2.1 5.4-5.4-2.1-2.4 5.2-2.4-5.2-5.4 2.1 2.1-5.4L1 12.3l5.3-2.3-2.1-5.4 5.4 2.1z"/>'),
  towers: svg('<path fill="currentColor" d="M5 3h3v2h2V3h4v2h2V3h3v6l-2 2v8h2v3H5v-3h2v-8L5 9zm5.5 10v6h3v-6a1.5 1.5 0 0 0-3 0z"/>'),
  combos: svg('<circle cx="11" cy="11" r="8.5" fill="currentColor"/><path d="M4.5 8.5c4 .5 8.5 3.5 11 9.5M6.5 4.8c4.5 2 8 6.5 9.5 12M11 2.6c2.5 2.5 6 5 8 9M3 12.5c3.5 0 7 2.5 9 6.5" fill="none" stroke="rgb(0 0 0 / 0.35)" stroke-width="1.5"/><path d="M17 17c2 1 4 .5 5-1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  pudding: svg('<path fill="currentColor" d="M4 19c0-6 3.5-11 8-11s8 5 8 11zm2 1h12v2H6z"/><path fill="rgb(0 0 0 / 0.3)" d="M6.2 12.5c1 1.5 2 1 2.6 2.6.5-1.6 1.6-1.2 2.4-.2.6-1.2 1.9-1.4 2.8 0 .7-1.4 1.8-1.2 2.8-2.4L16 10.5c-2.5-1-5.5-1-8 0z"/><circle cx="12" cy="5" r="2.4" fill="currentColor"/>'),
  matches: PAW,
  party: PAW,
});

/** Shorter quest names for the panel (the pool's text stays as is for the lobby and the results). */
const SHORT: Readonly<Record<string, string>> = Object.freeze({
  takedowns5: '5 knockouts or assists',
  takedowns10: '10 knockouts or assists',
  towers2: 'Knock down 2 towers',
  champion: 'Play any of these',
  party2: '2 matches with a friend',
});

/** What one quest card shows. Pure. */
export interface QuestCard {
  id: string;
  label: string;
  /** The icon kind (a `QuestMetric`), `hero` (one face) or `shelter` (the four shelter cats' faces). */
  icon: string;
  heroes: HeroId[];
  value: number;
  goal: number;
  /** 0..100. */
  pct: number;
  done: boolean;
  bonus: boolean;
  xp: number;
  aria: string;
}

export function questCard(q: QuestView): QuestCard {
  const goal = Math.max(1, q.quest.goal);
  const value = Math.max(0, Math.min(q.value, goal));
  const done = q.done || value >= goal;
  const label = SHORT[q.quest.id] ?? q.quest.text;
  const shelter = q.quest.metric === 'champion';
  const heroes: HeroId[] = shelter ? [...CHAMPION_IDS] : q.quest.hero ? [q.quest.hero] : [];
  const who = shelter ? ` (${CHAMPION_IDS.map((h) => HEROES[h]?.name ?? h).join(', ')})` : '';
  return {
    id: q.quest.id,
    label,
    icon: shelter ? 'shelter' : q.quest.hero ? 'hero' : (q.quest.metric ?? 'matches'),
    heroes,
    value: done ? goal : value,
    goal,
    pct: done ? 100 : Math.round((100 * value) / goal),
    done,
    bonus: !!q.quest.bonus,
    xp: QUEST_XP,
    aria: `${label}${who}${q.quest.bonus ? ' (bonus, with a friend)' : ''}: ${done ? 'done' : `${value} of ${goal}`}. ${QUEST_XP} Season XP, added when the match ends`,
  };
}

const face = (h: HeroId): string => `<img class="qf ${HEROES[h]?.side === 'dog' ? 'dog' : 'cat'}" src="${esc(heroFaceUrl(h))}" alt="" width="40" height="40" decoding="async">`;

function cardHtml(c: QuestCard): string {
  const pic =
    c.icon === 'hero' && c.heroes[0]
      ? `<span class="qi face" aria-hidden="true">${face(c.heroes[0])}</span>`
      : c.icon === 'shelter'
        ? `<span class="qi faces" aria-hidden="true">${c.heroes.map(face).join('')}</span>`
        : `<span class="qi k-${esc(c.icon)}" aria-hidden="true">${ICONS[c.icon] ?? PAW}</span>`;
  const chip = c.done
    ? `<span class="qx done" aria-hidden="true">${TICK}</span>`
    : `<span class="qx" title="${c.xp} Season XP, added when the match ends" aria-hidden="true">+${c.xp}${BONE}</span>`;
  return `<li class="q${c.done ? ' done' : ''}${c.bonus ? ' bonus' : ''}" data-q="${esc(c.id)}" aria-label="${esc(c.aria)}">${pic}<span class="t"><span class="tx">${esc(c.label)}${c.bonus ? '<i class="qtag">Duo</i>' : ''}</span><span class="qbar" aria-hidden="true"><i style="width:${c.pct}%"></i></span></span>${c.done ? '<i class="qstamp" aria-hidden="true">Nailed it</i>' : `<b class="n" aria-hidden="true">${c.value}/${c.goal}</b>`}${chip}</li>`;
}

/** "7h", "45m": the time to the next local midnight, when the day's quests change. Pure. */
export function questsResetText(now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const min = Math.max(1, Math.ceil((next - now.getTime()) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}h` : `${min}m`;
}

export type GoalsTab = 'today' | 'events';

/** The panel's markup: Today, then Events (timed modes are off the menu, MODE-UNLOCKS.md). */
export function goalsPanelHtml(o: Pick<HomeScreenOpts, 'quests' | 'todayExtra'>, tab: GoalsTab = 'today'): string {
  const t = questTally(o.quests);
  const all = t.total > 0 && t.done >= t.total;
  const rows = (o.quests ?? []).map((q) => cardHtml(questCard(q))).join('');
  const reset = `<span class="hm-gp-clock">${CLOCK}New in ${esc(questsResetText())}</span>`;
  const chip = all ? '<span class="hm-gp-chip all">All done!</span>' : `<span class="hm-gp-chip">${t.done}/${t.total}</span>`;
  const tabBtn = (k: GoalsTab, label: string): string =>
    `<button type="button" role="tab" class="hm-gp-tab" id="hm-gp-tab-${k}" data-gtab="${k}" aria-controls="hm-gp-${k}" aria-selected="${tab === k}" tabindex="${tab === k ? 0 : -1}">${label}${k === 'today' ? `<small>${all ? '✓' : `${t.done}/${t.total}`}</small>` : '<i class="hm-gp-tdot" aria-hidden="true"></i>'}</button>`;
  return `<div class="hm-gp" role="dialog" aria-modal="true" aria-labelledby="hm-gp-t" data-testid="goals-panel" data-tab="${tab}">
    <div class="hm-gp-h"><b id="hm-gp-t">Quests</b><div class="hm-gp-tabs" role="tablist" aria-label="Quests">${tabBtn('today', 'Today')}${tabBtn('events', 'Events')}</div><button type="button" class="hm-gp-x" data-a="goals-close" aria-label="Close quests">${CLOSE}</button></div>
    <div class="hm-gp-body">
      <section class="hm-gp-sec hm-gp-today" id="hm-gp-today" aria-labelledby="hm-gp-today-h" data-testid="goals-today"><h3 id="hm-gp-today-h"><span class="hm-gp-st">Today</span>${chip}${reset}</h3><ul class="hm-qlist">${rows}</ul>${o.todayExtra ?? ''}</section>
      <section class="hm-gp-sec hm-gp-ev" id="hm-gp-events" aria-labelledby="hm-gp-ev-h" data-testid="goals-events"><h3 id="hm-gp-ev-h"><span class="hm-gp-st">Events</span></h3>${liveopsCardsHtml()}</section>
    </div>
  </div>`;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Panel width for the free width `free` on a `vw` × `vh` viewport: Today and Events side by side when there are events,
 * 600 px for them and a desktop's height (≥ 500); else one column (a landscape phone: the tabs), 520 px at most with
 * events (their two-by-two grid), 460 for Today alone. Pure.
 */
export function goalsWidth(free: number, vw: number, events: boolean, vh = 900): { w: number; wide: boolean } {
  const two = events && vh >= 500 && free >= 600;
  const cap = two ? (vw >= 1800 ? 820 : 780) : events ? 520 : 460;
  return { w: Math.max(240, Math.min(cap, free)), wide: two };
}

/**
 * Where the panel's top goes: below the champion nameplate when the plate would sit under the panel and moving down
 * still leaves a readable panel (≥ 300 px: desktop), else unchanged (a short phone keeps its height). Pure.
 */
export function topBelowPlate(y0: number, y1: number, x0: number, x1: number, plate: Rect | null): number {
  if (!plate) return y0;
  if (!(plate.left < x1 && plate.right > x0 && plate.bottom > y0 && plate.top < y1)) return y0;
  const y = plate.bottom + 8;
  return y1 - y >= 300 ? y : y0;
}

/**
 * Place the open panel in the free space right of the left stack: under the profile chip, left of the PLAY cluster and
 * the promo, above the nav where they share columns, and under the champion nameplate where there is height for it
 * (no overlap at any size; it scrolls inside itself when short).
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
  let y0 = Math.max(L.top, (box('.hm-profile')?.bottom ?? R.top) + 8);
  let x1 = R.right - gap;
  let y1 = R.bottom - gap;
  for (const sel of ['.hm-extras', '.hm-play', '.hm-line', '.hm-promo']) {
    const b = box(sel);
    if (b && b.left > x0 && b.bottom > y0) x1 = Math.min(x1, b.left - gap);
  }
  const nav = box('.hm-nav');
  if (nav && nav.left < x1 && nav.right > x0) y1 = Math.min(y1, nav.top - gap);
  const events = !!panel.querySelector('.hm-gp-ev .lo-card, .hm-gp-ev .lo-toast');
  const { w, wide } = goalsWidth(x1 - x0, R.width, events, R.height);
  y0 = topBelowPlate(y0, y1, x0, x0 + w, box('.hm-plate'));
  panel.style.left = `${Math.round(x0 - L.left)}px`;
  panel.style.top = `${Math.round(y0 - L.top)}px`;
  panel.style.width = `${Math.round(w)}px`;
  panel.style.maxHeight = `${Math.round(Math.max(160, y1 - y0))}px`;
  panel.classList.toggle('wide', wide);
  panel.classList.toggle('has-ev', events);
  // the Events tab carries the Quests button's rose dot (a card that asks for a tap)
  const live = !!root.querySelector('[data-a="goals"].live');
  panel.querySelector('.hm-gp-tab[data-gtab="events"]')?.classList.toggle('live', live);
  moreHint(panel);
}

/** A soft fade at the bottom while there is more to scroll (phones show two or three cards at a time). */
function moreHint(panel: HTMLElement): void {
  const body = panel.querySelector<HTMLElement>('.hm-gp-body');
  if (body) body.classList.toggle('more', body.scrollHeight - body.scrollTop - body.clientHeight > 6);
}

function setTab(panel: HTMLElement, tab: GoalsTab, focus = false): void {
  panel.dataset.tab = tab;
  for (const b of panel.querySelectorAll<HTMLElement>('.hm-gp-tab')) {
    const on = b.dataset.gtab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus({ preventScroll: true });
  }
  const body = panel.querySelector<HTMLElement>('.hm-gp-body');
  if (body) body.scrollTop = 0;
  moreHint(panel);
}

/**
 * Open the panel, or redraw the open one with new options (`quiet`: a Home patch; the tab, the scroll and a focused
 * close button stay, no refresh, no focus move, and no fade-in: a replayed fade once left the panel at opacity 0).
 */
export function showGoals(root: HTMLElement, o: Pick<HomeScreenOpts, 'quests' | 'todayExtra'>, quiet = false): void {
  const left = root.querySelector<HTMLElement>('.hm-left');
  const btn = root.querySelector<HTMLElement>('[data-a="goals"]');
  if (!left || !btn) return;
  const old = root.querySelector<HTMLElement>('.hm-gp');
  const scroll = old?.querySelector('.hm-gp-body')?.scrollTop ?? 0;
  const hadFocus = !!old?.contains(document.activeElement);
  // an event that needs a tap (the button's rose dot) is what the player came for: a narrow panel opens on Events
  const tab: GoalsTab = old ? (old.dataset.tab === 'events' ? 'events' : 'today') : !quiet && btn.classList.contains('live') ? 'events' : 'today';
  const tpl = document.createElement('template');
  tpl.innerHTML = goalsPanelHtml(o, tab).trim();
  const panel = tpl.content.firstElementChild as HTMLElement;
  if (old || quiet) panel.classList.add('still');
  if (old) old.remove();
  left.appendChild(panel);
  btn.setAttribute('aria-expanded', 'true');
  root.classList.add('hm-gp-on');
  const body = panel.querySelector<HTMLElement>('.hm-gp-body');
  body?.addEventListener('scroll', () => moreHint(panel), { passive: true });
  panel.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-gtab]');
    if (t) setTab(panel, t.dataset.gtab === 'events' ? 'events' : 'today');
  });
  panel.addEventListener('keydown', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-gtab]');
    if (!t || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    setTab(panel, t.dataset.gtab === 'events' ? 'today' : 'events', true);
  });
  placeGoals(root);
  const x = panel.querySelector<HTMLElement>('.hm-gp-x');
  if (old || quiet) {
    if (body) body.scrollTop = scroll;
    moreHint(panel);
    if (hadFocus) x?.focus({ preventScroll: true });
    return;
  }
  // the shared goal bar moves with everyone's matches: re-read a config older than 15 s
  void refreshLiveops(15_000);
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
