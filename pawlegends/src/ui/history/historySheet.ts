/**
 * Match history (MATCH-MOMENTS.md §1): the last 20 matches on this device, newest first: champion, result, mode,
 * grade, K / D / A and length, with Watch on the matches whose replay is kept (the newest five solo matches). Opened
 * from the Treat Track's "Match history" pill (the profile entry). Its own lazy chunk.
 */
import type { HeroId } from '../../sim/api';
import { SIM_VERSION } from '../../sim/version';
import { HERO_TEXT } from '../heroText';
import { heroFaceUrl } from '../art';
import { ago, clock, loadHistory, MODE_LABEL, type HistoryEntry } from '../../replay/store';
import '../css/moments.css';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface HistoryOpts {
  rows?: readonly HistoryEntry[];
  now?: number;
  onWatch(id: string): void;
  onClose(): void;
}

/** What the row's action says. Pure. */
export function watchState(r: Pick<HistoryEntry, 'replay' | 'simVersion' | 'noReplay'>, simVersion = SIM_VERSION): 'watch' | 'older' | 'party' | 'none' {
  if (r.noReplay === 'party') return 'party';
  if (!r.replay) return 'none';
  return r.simVersion === simVersion ? 'watch' : 'older';
}

export function rowHtml(r: HistoryEntry, now: number): string {
  const name = r.heroName || HERO_TEXT[r.hero as HeroId]?.title || r.hero;
  const res = r.outcome === 'won' ? 'Victory' : r.outcome === 'draw' ? 'Draw' : 'Defeat';
  const w = watchState(r);
  const action =
    w === 'watch'
      ? `<button type="button" class="pl-btn small mh-watch" data-watch="${esc(r.id)}" aria-label="${esc(`Watch the replay: ${name}, ${res}`)}">▶ Watch</button>`
      : w === 'older'
        ? '<small class="mh-note" title="Made with an older version of the game">Older version</small>'
        : w === 'party'
          ? '<small class="mh-note">Party match</small>'
          : '';
  return `<li class="mh-row ${r.outcome}" data-id="${esc(r.id)}">
    <img class="mh-face" src="${esc(heroFaceUrl(r.hero as HeroId))}" alt="" loading="lazy" width="48" height="48">
    <span class="mh-main"><b>${esc(name)}</b><small>${esc(MODE_LABEL[r.mode] ?? r.mode)} · ${esc(ago(r.at, now))}</small></span>
    <span class="mh-res"><b class="mh-out">${res}</b><small>${clock(r.seconds)}</small></span>
    <span class="mh-kda" data-kda="${r.k}/${r.d}/${r.a}"><b>${r.k} / ${r.d} / ${r.a}</b><small>K / D / A</small></span>
    ${r.grade ? `<b class="mh-grade" data-grade="${esc(r.grade)}" title="Grade ${esc(r.grade)}">${esc(r.grade)}</b>` : '<span class="mh-grade none"></span>'}
    <span class="mh-act">${action}</span>
  </li>`;
}

export function historySheet(parent: HTMLElement, o: HistoryOpts): HTMLElement {
  const rows = o.rows ?? loadHistory();
  const now = o.now ?? Date.now();
  const root = document.createElement('div');
  root.className = 'pl-screen pl-menu mm-history';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Match history');
  root.dataset.testid = 'match-history';
  const wins = rows.filter((r) => r.outcome === 'won').length;
  root.innerHTML = `<div class="card mh-card"><button class="pl-x" data-a="x" aria-label="Close match history">✕</button>
    <h2>Match history</h2>
    ${rows.length ? `<p class="mh-sum">Last ${rows.length} ${rows.length === 1 ? 'match' : 'matches'} · ${wins} ${wins === 1 ? 'win' : 'wins'} · replays of your last 5 solo matches</p><ol class="mh-list">${rows.map((r) => rowHtml(r, now)).join('')}</ol>` : '<p class="mh-empty">No matches yet. Play one and it shows up here, with a replay to watch.</p>'}
    <p class="fine">Saved on this device.</p>
    <button class="pl-btn big" data-a="close">Done</button></div>`;
  const close = (): void => {
    if (!root.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    o.onClose();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const id = t.closest<HTMLElement>('[data-watch]')?.dataset.watch;
    if (id) {
      close();
      o.onWatch(id);
      return;
    }
    if (t.closest('[data-a="close"], [data-a="x"]') || t === root) close();
  });
  parent.appendChild(root);
  root.querySelector<HTMLElement>('.mh-watch, [data-a="close"]')?.focus({ preventScroll: true });
  return root;
}
