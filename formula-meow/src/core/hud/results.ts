/**
 * Results screen (GDD 1.2, 9): place, time, best lap, the standings, one honest Pink Paw line about the closest
 * rival (status shown with its date, adopt link), then Again and Next, plus any actions the share lane adds. Only
 * numbers the game measured are shown.
 *
 * Iteration 2:
 * - `registerResultSection(order, render)` (API frozen; the look belongs to audio-ui): lanes add sections such as
 *   "fish earned" or "next goal" between the standings and the buttons, sorted by `order`.
 * - the standings update live as karts finish until the race tail ends (B35), via the returned `update`.
 * - an unlock is a button that starts that class (B43); the action row is a sticky footer (B39).
 */
import type { RaceConfig, RaceMode, RaceResult, RacerInfo } from '../../types';
import { fmtTime, ordinal } from './hud';
import type { ResultAction } from '../../share/hooks';
import { PINK_PAW_CATS, PINK_PAW_STATUS_AS_OF, pinkPawAdoptUrl } from '../../share/pinkpaw/pink-paw';

export interface ResultsView {
  result: RaceResult;
  racers: RacerInfo[];
  trackName: string;
  className: string;
  actions: ResultAction[];
  lines: string[];
  /** the dare ghost this race was run against: shown as its own row at its place by time */
  ghost?: { name: string; time: number | null };
  /** a class just unlocked: a button that starts it (B43) */
  unlock?: { label: string; run(): void };
  /** extra main-row buttons from the shell (e.g. "Menu") */
  extra?: Array<{ label: string; act: string; run(): void }>;
  cfg?: RaceConfig;
}

/** What a result section sees. */
export interface ResultCtx {
  result: RaceResult;
  racers: readonly RacerInfo[];
  mode: RaceMode;
  cfg?: RaceConfig;
}

type SectionRender = (ctx: ResultCtx) => HTMLElement | null;
const sections: Array<{ order: number; render: SectionRender }> = [];

/** Add a section to every results screen (progression: fish, next goal, achievements; modes: standings). */
export function registerResultSection(order: number, render: SectionRender): () => void {
  const s = { order, render };
  sections.push(s);
  sections.sort((a, b) => a.order - b.order);
  return () => {
    const i = sections.indexOf(s);
    if (i >= 0) sections.splice(i, 1);
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function rowsHtml(r: RaceResult, ghost: ResultsView['ghost']): string {
  const me = r.player;
  const rowList = r.places.map((p) => `<tr class="${p.kart === me.kart ? 'me' : ''}"><td>${p.place}</td><td>${esc(p.name)}</td><td>${p.time != null ? fmtTime(p.time) : '—'}</td></tr>`);
  // the ghost sits at its place by time (seeing yourself one row under your friend is the hook)
  const g = ghost;
  if (g) {
    let at = rowList.length;
    if (g.time != null) {
      const i = r.places.findIndex((p) => p.time == null || p.time > g.time!);
      if (i >= 0) at = i;
    }
    rowList.splice(at, 0, `<tr class="ghost"><td>👻</td><td>${esc(g.name)}</td><td>${g.time != null ? fmtTime(g.time) : '—'}</td></tr>`);
  }
  return rowList.join('');
}

export interface ResultsHandle {
  /** refresh the standings (B35: karts still racing get their times as they finish) */
  update(result: RaceResult, ghost?: ResultsView['ghost']): void;
  /** add lines under the standings (results that arrive late, e.g. the recomputed dare ghost) */
  addLines(lines: string[]): void;
}

export function renderResults(host: HTMLElement, v: ResultsView): ResultsHandle {
  const r = v.result;
  const me = r.player;
  const g = v.ghost;
  const ghostLost = !!g && g.time != null && (me.time == null || g.time < me.time);
  const btn = (a: ResultAction, i: number, extra = '') => `<button class="fm-btn${a.primary ? ' primary' : ''}${extra}" data-x="${i}">${esc(a.label)}</button>`;
  // the primary action (the dare) first and full width, then the rest of the main row
  const main = v.actions
    .map((a, i) => [a, i] as const)
    .filter(([a]) => a.tier !== 'icon')
    .sort((x, y) => Number(!!y[0].primary) - Number(!!x[0].primary));
  const icons = v.actions.map((a, i) => [a, i] as const).filter(([a]) => a.tier === 'icon');
  const mainHtml = main.map(([a, i]) => btn(a, i, a.primary && main.length > 1 ? ' big' : '')).join('');
  // closest Pink Paw rival (by place)
  let rivalLine = '';
  const rivals = r.places.filter((p) => p.kart !== me.kart && v.racers[p.kart]?.pinkPawId);
  rivals.sort((a, b) => Math.abs(a.place - me.place) - Math.abs(b.place - me.place));
  const rival = rivals[0] ? v.racers[rivals[0].kart] : undefined;
  const cat = rival ? PINK_PAW_CATS.find((c) => c.id === rival.pinkPawId) : undefined;
  if (cat && cat.status !== 'ADOPTED') {
    const status = cat.status === 'RECOVERING' ? 'recovering' : 'waiting';
    rivalLine = `<p class="fm-line">Meet ${esc(cat.name)}, a real cat ${status} at Pink Paw shelter, Lithuania (as of ${PINK_PAW_STATUS_AS_OF}). <a href="${pinkPawAdoptUrl(cat)}" target="_blank" rel="noopener">See ${esc(cat.name)}</a></p>`;
  }
  host.innerHTML = `
    <div class="fm-panel fm-sticker fm-results" role="dialog" aria-label="Results">
      <h2>${esc(v.trackName)} · ${esc(v.className)}</h2>
      <div class="fm-place">${ordinal(me.place)}</div>
      <div class="fm-stats"><div><b>${fmtTime(me.time)}</b>race</div><div><b>${fmtTime(me.bestLap)}</b>best lap</div></div>
      <table class="fm-table">${rowsHtml(r, g)}</table>
      ${v.unlock ? `<p class="fm-line"><button class="fm-btn primary" data-act="unlock">${esc(v.unlock.label)}</button></p>` : ''}
      <div class="fm-lines">${v.lines.map((l) => `<p class="fm-line">${esc(l)}</p>`).join('')}</div>
      ${rivalLine}
      <div class="fm-sections"></div>
      <div class="fm-res-main">
        ${mainHtml}
        <button class="fm-btn${ghostLost || !main.length ? ' primary' : ''}" data-act="again">${ghostLost ? 'Rematch 👻' : 'Again ↻'}</button>
        <button class="fm-btn" data-act="next" aria-label="Next track">Next →</button>
        ${(v.extra ?? []).map((x) => `<button class="fm-btn" data-act="${esc(x.act)}">${esc(x.label)}</button>`).join('')}
      </div>
      ${icons.length ? `<div class="fm-res-icons">${icons.map(([a, i]) => btn(a, i)).join('')}</div>` : ''}
    </div>`;
  host.querySelectorAll<HTMLButtonElement>('[data-x]').forEach((b) => {
    b.addEventListener('click', () => v.actions[Number(b.dataset.x)]?.run());
  });
  if (v.unlock) host.querySelector('[data-act="unlock"]')?.addEventListener('click', () => v.unlock!.run());
  for (const x of v.extra ?? []) host.querySelector(`[data-act="${x.act}"]`)?.addEventListener('click', () => x.run());
  // lane sections
  const box = host.querySelector<HTMLElement>('.fm-sections')!;
  const ctx: ResultCtx = { result: r, racers: v.racers, mode: r.mode ?? 'race', cfg: v.cfg };
  for (const s of sections) {
    try {
      const el = s.render(ctx);
      if (el) box.appendChild(el);
    } catch (err) {
      console.warn('[results] a section failed', err);
    }
  }
  const table = host.querySelector<HTMLTableElement>('.fm-table')!;
  const linesBox = host.querySelector<HTMLElement>('.fm-lines')!;
  let last = '';
  let ghostNow = g;
  return {
    update(result, ghost) {
      if (ghost) ghostNow = ghost;
      const html = rowsHtml(result, ghostNow);
      if (html !== last) table.innerHTML = last = html;
    },
    addLines(lines) {
      for (const l of lines) {
        const p = document.createElement('p');
        p.className = 'fm-line';
        p.textContent = l;
        linesBox.appendChild(p);
      }
    },
  };
}
