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
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function renderResults(host: HTMLElement, v: ResultsView): void {
  const r = v.result;
  const me = r.player;
  const rows = r.places
    .map((p) => `<tr class="${p.kart === me.kart ? 'me' : ''}"><td>${p.place}</td><td>${esc(p.name)}</td><td>${p.time != null ? fmtTime(p.time) : '—'}</td></tr>`)
    .join('');
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
      <div class="fm-row-btns">
        <button class="fm-btn primary" data-act="again">Again ↻</button>
        <button class="fm-btn" data-act="next">Next track →</button>
        ${v.actions.map((a, i) => `<button class="fm-btn${a.primary ? ' primary' : ''}" data-x="${i}">${esc(a.label)}</button>`).join('')}
      </div>
    </div>`;
  host.querySelectorAll<HTMLButtonElement>('[data-x]').forEach((b) => {
    b.addEventListener('click', () => v.actions[Number(b.dataset.x)]?.run());
  });
}
