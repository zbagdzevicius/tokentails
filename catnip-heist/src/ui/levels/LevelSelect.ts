/**
 * Level select: 8 heist cards on a winding path, with lock state, best score and stars, plus a
 * detail panel (intro, par, star rules) and a Start button. DOM only; owns no game state.
 *
 *   const ls = createLevelSelect(ui.root, { levels, progress, manifest, base, onPlay, onBack });
 *   ls.show();            // selects the next level to beat
 *   ls.show('heist-03');  // or a given one
 */
import { TICK_HZ, type AssetManifest, type LevelDef } from '../../types';
import { formatTime, h } from '../dom';
import { icon } from '../icons';
import { createPortrait } from '../portraits';
import { STAR_RULES, starCount, type ProgressStore } from './progress';
import { ensureLevelStyles } from './styles';

export interface LevelSelectOptions {
  levels: readonly LevelDef[];
  progress: ProgressStore;
  manifest?: AssetManifest;
  base?: string;
  onPlay(levelId: string): void;
  onBack?(): void;
  /** Any button click (for a UI click sound). */
  onClick?(): void;
}

export interface LevelSelect {
  readonly el: HTMLElement;
  readonly visible: boolean;
  /** Currently selected level id. */
  readonly selected: string;
  show(levelId?: string): void;
  hide(): void;
  /** Re-read progress (after a run). */
  refresh(): void;
  dispose(): void;
}

/** Short display name for a level (meta.name, else the title without its "Heist 0N:" prefix). */
export function levelName(level: LevelDef): string {
  return level.meta.name ?? level.meta.title.replace(/^Heist \d+:\s*/, '');
}

/** Serpentine grid slots: `cols` per row, every other row right to left. */
export function pathSlot(i: number, cols: number): { col: number; row: number } {
  const row = Math.floor(i / cols);
  const k = i % cols;
  return { row: row + 1, col: (row % 2 === 0 ? k : cols - 1 - k) + 1 };
}

function starsRow(mask: number, size?: number): HTMLElement {
  const row = h('span.ch-lv-stars', { 'aria-label': `${starCount(mask)} of 3 stars` });
  if (size) row.style.fontSize = `${size}px`;
  for (const r of STAR_RULES) {
    const s = icon('star');
    if (mask & r.bit) s.classList.add('ch-on');
    row.appendChild(s);
  }
  return row;
}

export { starsRow };

export function createLevelSelect(parent: HTMLElement, opts: LevelSelectOptions): LevelSelect {
  ensureLevelStyles();
  const { levels, progress } = opts;
  const base = opts.base ?? 'assets/';
  const click = () => opts.onClick?.();

  const total = h('span.ch-lv-total', { 'aria-label': 'Stars' });
  const back = h('button.ch-btn.ch-ghost.ch-icon', { type: 'button', 'aria-label': 'Back' }, icon('back'));
  back.addEventListener('click', () => {
    click();
    opts.onBack?.();
  });
  const head = h(
    'div.ch-lv-head',
    null,
    back,
    h('div', null, h('h2', null, 'Choose a heist'), h('p.ch-lv-sub', null, 'Win a heist to unlock the next one.')),
    total,
  );
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'ch-lv-path');
  svg.setAttribute('aria-hidden', 'true');
  const map = h('div.ch-lv-map', { role: 'list', 'aria-label': 'Heists' });
  map.appendChild(svg);
  const mapWrap = h('div.ch-lv-mapwrap', null, map);
  const detail = h('div.ch-lv-detail', { 'aria-live': 'polite' });
  const el = h('section.ch-lv', { 'aria-label': 'Choose a heist' }, head, h('div.ch-lv-body', null, mapWrap, detail));
  parent.appendChild(el);

  const cards = new Map<string, HTMLButtonElement>();
  let selected = levels[0]?.id ?? '';
  let visible = false;

  levels.forEach((lv, i) => {
    const a = pathSlot(i, 4);
    const b = pathSlot(i, 2);
    const card = h('button.ch-lv-card', { type: 'button', role: 'listitem', 'data-level': lv.id, style: `--c4:${a.col};--r4:${a.row};--c2:${b.col};--r2:${b.row}` });
    card.addEventListener('click', () => {
      if (card.disabled) return;
      click();
      if (selected === lv.id) opts.onPlay(lv.id);
      else select(lv.id);
    });
    cards.set(lv.id, card);
    map.appendChild(card);
  });

  function paintCard(lv: LevelDef, i: number) {
    const card = cards.get(lv.id)!;
    const rec = progress.get(lv.id);
    const open = progress.isUnlocked(lv.id);
    card.disabled = !open;
    card.dataset.locked = String(!open);
    card.dataset.won = String(rec.won);
    card.setAttribute('aria-current', String(lv.id === selected));
    const name = levelName(lv);
    card.setAttribute(
      'aria-label',
      `Heist ${i + 1}: ${name}. ${open ? `${starCount(rec.stars)} of 3 stars${rec.won ? `, best ${rec.bestScore}` : ''}` : 'Locked'}`,
    );
    card.replaceChildren(
      h('span.ch-lv-num', { 'aria-hidden': 'true' }, open ? String(i + 1) : icon('key')),
      h('span.ch-lv-name', null, name),
      starsRow(rec.stars),
      open
        ? h('span.ch-lv-best', null, rec.won ? `Best ${rec.bestScore} · ${formatTime(rec.bestTicks, TICK_HZ)}` : 'Not cracked yet')
        : h('span.ch-lv-lock', null, `Win heist ${i} to unlock`),
    );
  }

  function paintDetail() {
    const i = levels.findIndex((l) => l.id === selected);
    const lv = levels[i];
    if (!lv) {
      detail.replaceChildren();
      return;
    }
    const rec = progress.get(lv.id);
    const entry = opts.manifest?.cats.find((c) => c.id === lv.crate.catId);
    const go = h('button.ch-btn.ch-primary.ch-big.ch-lv-go', { type: 'button', 'aria-label': `Start ${levelName(lv)}` }, icon('play'), h('span', null, 'Start'));
    go.addEventListener('click', () => {
      click();
      opts.onPlay(lv.id);
    });
    const rules = h('ul.ch-lv-rules', { 'aria-label': 'Star rules' });
    for (const r of STAR_RULES) {
      const li = h('li', null, icon('star'), h('span', null, h('b', null, r.label), h('small', null, r.detail)));
      if (rec.stars & r.bit) li.classList.add('ch-on');
      rules.appendChild(li);
    }
    detail.replaceChildren(
      h('h3', null, `${i + 1}. ${levelName(lv)}`),
      h('p', null, lv.meta.intro ?? ''),
      h(
        'div.ch-lv-facts',
        null,
        h('span', null, `Par ${formatTime(lv.meta.parTicks, TICK_HZ)}`),
        h('span', null, `${lv.coins.length} catnip`),
        h('span', null, `${lv.guards.length} guard dog${lv.guards.length === 1 ? '' : 's'}`),
        rec.won ? h('span', null, `Best ${rec.bestScore}`) : null,
      ),
      h('div.ch-lv-rescue', null, entry ? createPortrait(entry, { size: 48, base }) : null, h('span', null, `Rescue ${lv.crate.catName}`)),
      rules,
      go,
    );
  }

  function drawPath() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!visible) return;
    const box = map.getBoundingClientRect();
    if (box.width === 0) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const pts = levels.map((l) => {
      const r = cards.get(l.id)!.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
    });
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const p = document.createElementNS(svgNS, 'path');
      const mx = (a.x + b.x) / 2;
      const d = Math.abs(a.y - b.y) < 4 ? `M${a.x},${a.y} Q${mx},${a.y - 26} ${b.x},${b.y}` : `M${a.x},${a.y} C${a.x + (a.x > box.width / 2 ? 60 : -60)},${a.y} ${b.x + (b.x > box.width / 2 ? 60 : -60)},${b.y} ${b.x},${b.y}`;
      p.setAttribute('d', d);
      p.setAttribute('class', progress.isUnlocked(levels[i].id) ? 'ch-lv-open' : 'ch-lv-shut');
      svg.appendChild(p);
    }
  }

  function paint() {
    levels.forEach(paintCard);
    const got = levels.reduce((n, l) => n + starCount(progress.get(l.id).stars), 0);
    total.replaceChildren(icon('star'), h('span', null, `${got} / ${levels.length * 3}`));
    paintDetail();
    requestAnimationFrame(drawPath);
  }

  function select(id: string) {
    if (!cards.has(id) || !progress.isUnlocked(id)) return;
    selected = id;
    paint();
  }

  /** The next level to beat: the first unlocked level not yet won, else the last unlocked. */
  function defaultSelection(): string {
    let last = levels[0]?.id ?? '';
    for (const l of levels) {
      if (!progress.isUnlocked(l.id)) break;
      last = l.id;
      if (!progress.get(l.id).won) return l.id;
    }
    return last;
  }

  const onResize = () => visible && drawPath();
  window.addEventListener('resize', onResize);
  const onKey = (e: KeyboardEvent) => {
    if (!visible) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      opts.onBack?.();
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    el,
    get visible() {
      return visible;
    },
    get selected() {
      return selected;
    },
    show(levelId) {
      visible = true;
      selected = levelId && cards.has(levelId) && progress.isUnlocked(levelId) ? levelId : defaultSelection();
      el.classList.add('ch-on');
      paint();
      cards.get(selected)?.focus({ preventScroll: false });
    },
    hide() {
      visible = false;
      el.classList.remove('ch-on');
    },
    refresh() {
      if (visible) paint();
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
