/** Room picker for typed arrivals and the archive (GDD 6.6): The Glass first, today, then recent days. */
import { COPY } from '../copy';
import { btn, h } from '../dom';

export interface PickerItem {
  label: string;
  sub?: string;
  badge?: string;
  glass?: boolean;
  dayNo?: number;
  /** OG still of the room (og/d/<n>.png); the emoji shows when it is missing. */
  thumb?: string;
  /** Room icon when there is no still. */
  icon?: string;
}

export interface PickerProps {
  title: string;
  items: PickerItem[];
  onPick(item: PickerItem, index: number): void;
  onBack?: () => void;
}

export function mountPicker(host: HTMLElement, p: PickerProps): () => void {
  const list = h('div', { class: 'bc-list' });
  p.items.forEach((it, i) => {
    const card = h(
      'button',
      { class: `bc-room-card${it.glass ? ' is-glass' : ''}`, type: 'button' },
      thumbFor(it),
      h('span', { class: 'bc-room-txt' }, h('strong', {}, it.label), it.sub ? h('small', {}, it.sub) : null),
      it.badge ? h('span', { class: 'bc-badge' }, it.badge) : null,
    );
    card.addEventListener('click', () => p.onPick(it, i));
    list.appendChild(card);
  });
  const root = h(
    'div',
    { class: 'bc-screen bc-picker' },
    h('header', { class: 'bc-head' }, p.onBack ? btn(`‹ ${COPY.back}`, p.onBack, 'bc-link') : null, h('h2', {}, p.title)),
    p.items.length ? list : h('p', { class: 'bc-muted' }, 'No rooms yet.'),
  );
  host.appendChild(root);
  return () => root.remove();
}

function thumbFor(it: PickerItem): HTMLElement {
  const box = h('span', { class: 'bc-room-thumb', 'aria-hidden': 'true' }, it.icon ?? (it.glass ? '🍷' : '🍳'));
  if (it.thumb) {
    const img = h('img', { class: 'bc-room-img', src: it.thumb, alt: '', loading: 'lazy', decoding: 'async' }) as HTMLImageElement;
    img.addEventListener('load', () => box.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}
