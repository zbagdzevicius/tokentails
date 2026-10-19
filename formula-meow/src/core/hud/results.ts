/**
 * Results screen (GDD 1.2, 9): place, time, best lap, the standings, one honest Pink Paw line about the closest
 * rival (status shown with its date, adopt link), then Again (same track, same seed) and Next track, plus any
 * actions the share lane adds. Only numbers the game measured are shown.
 */
import type { RaceResult, RacerInfo } from '../../types';
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
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function renderResults(host: HTMLElement, v: ResultsView): void {
  const r = v.result;
  const me = r.player;
  const rowList = r.places.map((p) => `<tr class="${p.kart === me.kart ? 'me' : ''}"><td>${p.place}</td><td>${esc(p.name)}</td><td>${p.time != null ? fmtTime(p.time) : '—'}</td></tr>`);
  // the ghost sits at its place by time (seeing yourself one row under your friend is the hook)
  const g = v.ghost;
  const ghostLost = !!g && g.time != null && (me.time == null || g.time < me.time);
  if (g) {
    let at = rowList.length;
    if (g.time != null) {
      const i = r.places.findIndex((p) => p.time == null || p.time > g.time!);
      if (i >= 0) at = i;
    }
    rowList.splice(at, 0, `<tr class="ghost"><td>👻</td><td>${esc(g.name)}</td><td>${g.time != null ? fmtTime(g.time) : '—'}</td></tr>`);
  }
  const rows = rowList.join('');
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
    <div class="fm-panel fm-sticker">
      <h2>${esc(v.trackName)} · ${esc(v.className)}</h2>
      <div class="fm-place">${ordinal(me.place)}</div>
      <div class="fm-stats"><div><b>${fmtTime(me.time)}</b>race</div><div><b>${fmtTime(me.bestLap)}</b>best lap</div></div>
      <table class="fm-table">${rows}</table>
      ${v.lines.map((l) => `<p class="fm-line">${esc(l)}</p>`).join('')}
      ${rivalLine}
      <div class="fm-res-main">
        ${mainHtml}
        <button class="fm-btn${ghostLost || !main.length ? ' primary' : ''}" data-act="again">${ghostLost ? 'Rematch 👻' : 'Again ↻'}</button>
        <button class="fm-btn" data-act="next" aria-label="Next track">Next →</button>
      </div>
      ${icons.length ? `<div class="fm-res-icons">${icons.map(([a, i]) => btn(a, i)).join('')}</div>` : ''}
    </div>`;
  host.querySelectorAll<HTMLButtonElement>('[data-x]').forEach((b) => {
    b.addEventListener('click', () => v.actions[Number(b.dataset.x)]?.run());
  });
}
