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
 * - presentation (audio-ui): the place lands as a stamp (with a thud), the race time and best lap count up, the
 *   rows slide in; battle shows balloons instead of times, time trial shows the splits. Reduced motion skips all of
 *   it. Every fixed string goes through `t()`; names and labels that come from other lanes are marked `data-raw`.
 */
import type { RaceConfig, RaceMode, RaceResult, RacerInfo } from '../../types';
import { fmtTime, ordinal } from './hud';
import type { ResultAction } from '../../share/hooks';
import { PINK_PAW_CATS, PINK_PAW_STATUS_AS_OF, pinkPawAdoptUrl } from '../../share/pinkpaw/pink-paw';
import { t } from '../../ui/i18n';
import { reducedMotion } from '../../ui/a11y';
import { uiSound } from '../../ui/sound';

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
  const battle = r.mode === 'battle' && r.battle;
  const cell = (kart: number, time: number | null, gap?: number | null) => {
    if (battle) {
      const sc = r.battle!.score?.[kart];
      if (sc != null) return `★ ${sc}`;
      if (r.battle!.out[kart]) return `<span class="fm-out">${esc(t('OUT'))}</span>`;
      return `${'🎈'.repeat(Math.max(0, r.battle!.balloons[kart] ?? 0))}`;
    }
    if (time != null) return fmtTime(time);
    // still racing: the projected gap to the winner (B: "—" said nothing)
    if (gap != null && gap < 0) return `<span class="fm-gap">${esc(gap === -1 ? t('+1 lap') : t('+{n} laps', { n: -gap }))}</span>`;
    if (gap != null) return `<span class="fm-gap">+${gap.toFixed(1)} s</span>`;
    return '—';
  };
  const rowList = r.places.map((p) => `<tr class="${p.kart === me.kart ? 'me' : ''}"><td>${p.place}</td><td data-raw>${esc(p.name)}</td><td>${cell(p.kart, p.time, p.gap)}</td></tr>`);
  // the ghost sits at its place by time (seeing yourself one row under your friend is the hook)
  const g = ghost;
  if (g) {
    let at = rowList.length;
    if (g.time != null) {
      const i = r.places.findIndex((p) => p.time == null || p.time > g.time!);
      if (i >= 0) at = i;
    }
    rowList.splice(at, 0, `<tr class="ghost"><td>👻</td><td data-raw>${esc(g.name)}</td><td>${g.time != null ? fmtTime(g.time) : '—'}</td></tr>`);
  }
  return rowList.join('');
}

export interface ResultsHandle {
  /** refresh the standings (B35: karts still racing get their times as they finish) */
  update(result: RaceResult, ghost?: ResultsView['ghost']): void;
  /** add lines under the standings (results that arrive late, e.g. the recomputed dare ghost) */
  addLines(lines: string[]): void;
}

/** Count a time readout up from 0 over `ms` (a tick sound every few frames). */
function countUp(el: HTMLElement, to: number | null, ms: number, sound: boolean): void {
  if (to == null || !isFinite(to) || reducedMotion() || typeof requestAnimationFrame === 'undefined') {
    el.textContent = fmtTime(to);
    return;
  }
  const t0 = performance.now();
  let frame = 0;
  const step = () => {
    if (!el.isConnected) return;
    const k = Math.min(1, (performance.now() - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtTime(to * e);
    if (sound && ++frame % 3 === 0 && k < 1) uiSound('countTick', frame);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function renderResults(host: HTMLElement, v: ResultsView): ResultsHandle {
  const r = v.result;
  const me = r.player;
  const g = v.ghost;
  const battle = r.mode === 'battle' && !!r.battle;
  const ghostLost = !!g && g.time != null && (me.time == null || g.time < me.time);
  const btn = (a: ResultAction, i: number, extra = '') => `<button class="fm-btn${a.primary ? ' primary' : ''}${extra}" data-x="${i}" data-raw>${esc(a.label)}</button>`;
  // the primary action (the dare) first and full width, then the rest of the main row
  const main = v.actions
    .map((a, i) => [a, i] as const)
    .filter(([a]) => a.tier !== 'icon')
    .sort((x, y) => Number(!!y[0].primary) - Number(!!x[0].primary));
  const icons = v.actions.map((a, i) => [a, i] as const).filter(([a]) => a.tier === 'icon');
  // the game loop leads: Next (or the mode's Continue) is the big button; sharing sits beside the rest, never over it
  const plain = (a: ResultAction, i: number) => `<button class="fm-btn" data-x="${i}" data-raw>${esc(a.label)}</button>`;
  const mainHtml = main.map(([a, i]) => (ghostLost && a.primary ? btn(a, i) : plain(a, i))).join('');
  // closest Pink Paw rival (by place): their real status, with its date, and the shelter page
  let rivalLine = '';
  const rivals = r.places.filter((p) => p.kart !== me.kart && v.racers[p.kart]?.pinkPawId);
  rivals.sort((a, b) => Math.abs(a.place - me.place) - Math.abs(b.place - me.place));
  const rival = rivals[0] ? v.racers[rivals[0].kart] : undefined;
  const cat = rival ? PINK_PAW_CATS.find((c) => c.id === rival.pinkPawId) : undefined;
  if (cat && cat.status !== 'ADOPTED') {
    const text =
      cat.status === 'RECOVERING'
        ? t('Meet {name}, a real cat recovering at Pink Paw shelter, Lithuania (as of {date}).', { name: cat.name, date: PINK_PAW_STATUS_AS_OF })
        : t('Meet {name}, a real cat waiting at Pink Paw shelter, Lithuania (as of {date}).', { name: cat.name, date: PINK_PAW_STATUS_AS_OF });
    rivalLine = `<p class="fm-line fm-pinkpaw">${esc(text)} <a href="${pinkPawAdoptUrl(cat)}" target="_blank" rel="noopener">${esc(t('See {name}', { name: cat.name }))}</a></p>`;
  }
  const stats = battle
    ? `<div><b>★ ${r.battle!.score?.[me.kart] ?? 0}</b>${esc((r.battle!.score?.[me.kart] ?? 0) === 1 ? t('point') : t('points'))}</div>`
    : `<div><b class="fm-count" data-to="time">${fmtTime(me.time)}</b>${esc(t('race'))}</div><div><b class="fm-count" data-to="lap">${fmtTime(me.bestLap)}</b>${esc(t('best lap'))}</div>`;
  const splits = r.splits?.length
    ? `<p class="fm-line fm-splits">${esc(t('Splits'))}: ${r.splits.map((s) => `<span>${fmtTime(s)}</span>`).join(' · ')}</p>`
    : '';
  const again = ghostLost ? t('Rematch 👻') : t('Again ↻');
  host.innerHTML = `
    <div class="fm-panel fm-sticker fm-results" role="dialog" aria-label="${esc(t('Results'))}">
      <div class="fm-res-scroll">
      <h2><span data-raw>${esc(v.trackName)}</span> · <span data-raw>${esc(v.className)}</span></h2>
      ${r.mode === 'tt' ? '' : `<div class="fm-place" data-place="${Math.min(4, me.place)}">${ordinal(me.place)}</div>`}
      <div class="fm-stats">${stats}</div>
      ${splits}
      <table class="fm-table">${rowsHtml(r, g)}</table>
      ${v.unlock ? `<p class="fm-line"><button class="fm-res-unlock" data-act="unlock">🎉 ${esc(v.unlock.label)}</button></p>` : ''}
      <div class="fm-lines" data-raw>${v.lines.map((l) => `<p class="fm-line">${esc(l)}</p>`).join('')}</div>
      ${rivalLine}
      <div class="fm-sections"></div>
      </div>
      <div class="fm-res-main">
        <button class="fm-btn${ghostLost ? '' : ' primary big'}" data-act="next" aria-label="${esc(t('Next track'))}">${esc(t('Next →'))}</button>
        <button class="fm-btn${ghostLost ? ' primary big' : ''}" data-act="again">${esc(again)}</button>
        ${(v.extra ?? []).map((x) => `<button class="fm-btn" data-act="${esc(x.act)}">${esc(x.label)}</button>`).join('')}
        ${mainHtml}
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
  // presentation: stamp, count-up, rows sliding in (all skipped under reduced motion)
  const calm = reducedMotion();
  const place = host.querySelector<HTMLElement>('.fm-place');
  if (!calm && place) {
    place.classList.add('stamp');
    table.classList.add('rows-in');
    // the whole table is in within ~0.5 s (polish 3: a 250 px hole sat there after Continue appeared)
    table.querySelectorAll<HTMLElement>('tr').forEach((tr, i) => (tr.style.animationDelay = `${0.12 + i * 0.03}s`));
    setTimeout(() => uiSound('stamp', me.place), 260);
  } else uiSound('stamp', me.place);
  const timeEl = host.querySelector<HTMLElement>('[data-to="time"]');
  const lapEl = host.querySelector<HTMLElement>('[data-to="lap"]');
  if (timeEl) countUp(timeEl, me.time, 550, true);
  if (lapEl) countUp(lapEl, me.bestLap, 550, false);
  // a fade at the bottom of the scrolling part says there is more below (fun 9 / B8: sections looked cut off)
  const scroll = host.querySelector<HTMLElement>('.fm-res-scroll');
  if (scroll) {
    const more = () => scroll.classList.toggle('more', scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > 8);
    scroll.addEventListener('scroll', more, { passive: true });
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(more);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(more);
      ro.observe(scroll);
      for (const c of scroll.children) ro.observe(c);
    }
    setTimeout(more, 600);
  }
  let last = '';
  let ghostNow = g;
  return {
    update(result, ghost) {
      if (ghost) ghostNow = ghost;
      const html = rowsHtml(result, ghostNow);
      if (html !== last) {
        table.classList.remove('rows-in');
        table.innerHTML = last = html;
      }
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

