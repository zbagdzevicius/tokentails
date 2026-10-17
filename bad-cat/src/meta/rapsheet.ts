/**
 * Rap Sheet (GDD 8): the crime collection as a grid of mugshot stamps. Header: the cat's mugshot board, rank and
 * the brag line ("212 vases, 14 cakes, framed the Roomba 9x"); tiles: emoji, count, first date, Club gold stamps.
 * Tap a tile for its case note. Share -> onShareCard.
 */
import type { CrimeView, RapSheetProps, RapSheetSummary, Unmount } from '../types';
import { btn, h } from '../ui/dom';
import { dateLabel, empty, escapeTo, fmt, header, plural, pluralNoun, scope, screen, stamp } from './shared';

/** "212 vases, 14 cakes, framed the Roomba 9x" (top 3 crimes, then the Roomba). */
export function bragLine(sum: RapSheetSummary): string {
  const parts = sum.topCrimes
    .filter((c) => c.count > 0 && !/roomba/i.test(c.name))
    .slice(0, 3)
    .map((c) => `${fmt(c.count)} ${pluralNoun(c.name, c.count)}`);
  if (sum.framed > 0) parts.push(`framed the Roomba ${fmt(sum.framed)}x`);
  return parts.join(', ');
}

type Filter = 'all' | 'stamped' | 'special';

/** The player's cat on the board (review round 1): an SVG face, a photo URL, else the emoji. */
function mugCat(art: string | undefined): HTMLElement {
  const el = h('div', { class: 'bmt-mug-cat', 'aria-hidden': 'true' });
  if (art && art.startsWith('<svg')) {
    el.classList.add('is-art');
    el.innerHTML = art; // catFaceSvg: numbers and fixed markup only
  } else if (art && /^(blob:|data:image\/)/.test(art)) {
    el.classList.add('is-art', 'is-photo');
    const img = h('img', { alt: '', draggable: 'false' }) as HTMLImageElement;
    img.src = art;
    el.append(img);
  } else el.textContent = '🐈‍⬛';
  return el;
}

export function mountRapSheet(host: HTMLElement, p: RapSheetProps): Unmount {
  const s = scope();
  const sum = p.summary;
  const name = p.catName?.trim() || 'Tofu';
  const brag = bragLine(sum);

  const board = h(
    'section',
    { class: 'bmt-mug', 'aria-label': `${name}'s mugshot` },
    h('div', { class: 'bmt-mug-lines', 'aria-hidden': 'true' }),
    mugCat(p.mugshot),
    h('div', { class: 'bmt-mug-plate' }, h('strong', {}, name.toUpperCase()), sum.total > 0 ? h('span', {}, `No. ${String(sum.total).padStart(5, '0')}`) : null),
    stamp('WANTED', 'red', 'bmt-mug-wanted'),
  );
  const facts = h(
    'section',
    { class: 'bc-card bmt-paper bmt-rap-sum' },
    h('div', { class: 'bmt-rank' }, h('span', { class: 'bc-kicker' }, 'Known as'), h('strong', {}, sum.rank || 'Person of Interest')),
    brag ? h('p', { class: 'bmt-brag' }, `“${brag[0].toUpperCase()}${brag.slice(1)}.”`) : null,
    h(
      'dl',
      { class: 'bmt-facts' },
      h('div', {}, h('dt', {}, 'Crimes'), h('dd', {}, fmt(sum.total))),
      h('div', {}, h('dt', {}, 'On file'), h('dd', {}, `${sum.distinct}/${sum.catalog}`)),
      h('div', {}, h('dt', {}, 'Streak'), h('dd', {}, `🔥 ${sum.streak}`)),
    ),
  );

  let filter: Filter = 'all';
  const grid = h('div', { class: 'bmt-grid', role: 'list' });
  const note = h('p', { class: 'bmt-casenote', 'aria-live': 'polite' }, 'Tap a stamp for the case note.');
  const tile = (c: CrimeView): HTMLElement => {
    const have = c.count > 0;
    const t = h(
      'button',
      {
        class: `bmt-tile${have ? ' is-have' : ' is-missing'}${c.gold ? ' is-gold' : ''}${c.special ? ' is-special' : ''}`,
        type: 'button',
        role: 'listitem',
        'data-id': c.id,
        'aria-label': have ? `${c.name}: ${plural(c.count, 'time')}${c.gold ? ', gold stamp' : ''}` : `${c.name}: not yet`,
      },
      h('span', { class: 'bmt-tile-ico', 'aria-hidden': 'true' }, have ? c.icon : '❔'),
      h('span', { class: 'bmt-tile-name' }, c.name),
      h('span', { class: 'bmt-tile-n' }, have ? `×${fmt(c.count)}` : 'not yet'),
      c.gold ? h('span', { class: 'bmt-tile-gold', 'aria-hidden': 'true' }, '★') : null,
    );
    t.addEventListener('click', () => {
      for (const o of Array.from(grid.querySelectorAll('.is-picked'))) o.classList.remove('is-picked');
      t.classList.add('is-picked');
      note.textContent = have
        ? `${c.icon} ${c.name}: ${plural(c.count, 'time')}${c.firstAt ? `, first on ${dateLabel(c.firstAt)}` : ''}.${c.gold ? ' Gold stamp, very fancy.' : ''}`
        : `${c.name}: no record. Yet.`;
    });
    return t;
  };
  const draw = (): void => {
    grid.innerHTML = '';
    // round 2: stamped crimes first (they were below the fold behind 70 "not yet" tiles), the catalog order kept
    const list = p.crimes
      .filter((c) => (filter === 'stamped' ? c.count > 0 : filter === 'special' ? c.special : true))
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (b.c.count > 0 ? 1 : 0) - (a.c.count > 0 ? 1 : 0) || a.i - b.i)
      .map((x) => x.c);
    if (!list.length) grid.append(empty('🔍', filter === 'special' ? 'No special crimes yet.' : 'Nothing on file.', 'Frame a Roomba. You know you want to.'));
    else grid.append(...list.map(tile));
  };
  const tabs = h('div', { class: 'bmt-tabs', role: 'group', 'aria-label': 'Filter crimes' });
  const tab = (f: Filter, label: string): HTMLButtonElement => {
    const b = btn(label, () => {
      filter = f;
      for (const o of Array.from(tabs.children)) o.setAttribute('aria-pressed', String(o === b));
      draw();
    }, 'bmt-tab');
    b.setAttribute('aria-pressed', String(f === filter));
    return b;
  };
  tabs.append(tab('all', 'All'), tab('stamped', 'Stamped'), tab('special', 'Specials'));
  draw();

  const clean = sum.total === 0 && !p.crimes.some((c) => c.count > 0);
  const share = btn('📸 Share my mugshot', p.onShareCard, 'bc-cta bc-cta-big bmt-share');
  const root = screen(
    'bmt-rapsheet',
    header('Rap Sheet', p.onBack, `${name}'s file`),
    board,
    clean ? empty('😇', 'No crimes yet. Suspicious.', 'Knock one thing off one shelf and this page fills up.') : facts,
    p.crimes.length ? tabs : null,
    p.crimes.length ? grid : null,
    p.crimes.length ? note : null,
    clean ? null : share,
  );
  escapeTo(s, p.onBack);
  return s.mount(host, root);
}
