/**
 * Studio (GDD 6.2, `?studio=1` in dev or with VITE_BADCAT_STUDIO=1): the founder's stitch / reply clip queue.
 * Each cat goes: screenshot + @handle in the cat maker (studio mode) → 40 s practice run by hand → the clip with
 * the handle pill → save. Batch mode moves to the next cat after each save. Pure DOM driven by props.
 */
import { COPY } from '../copy';
import { btn, h } from '../dom';

export interface StudioRow {
  label: string; // "@luna.mom · Luna"
  sub: string; // "stitch · saved"
  state: 'todo' | 'current' | 'saved' | 'skipped';
}

export interface StudioProps {
  rows: StudioRow[];
  /** "3 saved · 1 skipped · 5 in the queue". */
  progress: string;
  batch: boolean;
  /** The room the runs play ("Kitchen #18" or "The Glass"). */
  roomLabel: string;
  onNext(): void;
  onSkip(): void;
  onAddList(text: string): void;
  onBatch(on: boolean): void;
  onToggleRoom(): void;
  onBack(): void;
}

export interface StudioHandle {
  dispose(): void;
}

export function mountStudio(host: HTMLElement, p: StudioProps): StudioHandle {
  const list = h(
    'ol',
    { class: 'bc-studio-list' },
    ...p.rows.map((r) => h('li', { class: `bc-studio-row is-${r.state}` }, h('strong', {}, r.label), h('small', { class: 'bc-muted' }, r.sub))),
  );
  const area = h('textarea', {
    class: 'bc-studio-batch',
    rows: 4,
    placeholder: '@luna.mom Luna\nr: @bob Biscuit   (r: = reply video)',
    'aria-label': 'Batch list: one cat per line',
  }) as HTMLTextAreaElement;
  const batch = h('input', { type: 'checkbox' }) as HTMLInputElement;
  batch.checked = p.batch;
  batch.addEventListener('change', () => p.onBatch(batch.checked));
  const current = p.rows.find((r) => r.state === 'current');
  const root = h(
    'div',
    { class: 'bc-screen bc-studio' },
    h('header', { class: 'bc-head' }, btn(`‹ ${COPY.back}`, p.onBack, 'bc-link'), h('h2', {}, '🎬 Studio')),
    h(
      'section',
      { class: 'bc-card' },
      h('p', { class: 'bc-muted bc-small' }, 'Screenshot of their video → @handle → 40 s run by hand → clip with the handle → save. Ask the owner first.'),
      h('div', { class: 'bc-kicker' }, p.progress),
      p.rows.length ? list : h('p', { class: 'bc-muted' }, 'The queue is empty. Tap "Next cat" for a single clip, or paste a list.'),
      h(
        'div',
        { class: 'bc-row' },
        btn(current ? `Next cat: ${current.label}` : 'Next cat', p.onNext, 'bc-cta bc-cta-big bc-studio-next'),
        current ? btn('Skip', p.onSkip, 'bc-cta bc-cta-soft') : null,
      ),
      h('div', { class: 'bc-row' }, btn(`Room: ${p.roomLabel}`, p.onToggleRoom, 'bc-cta bc-cta-soft'), h('label', { class: 'bc-toggle' }, batch, h('span', {}, 'Batch: next cat after each save'))),
    ),
    h(
      'section',
      { class: 'bc-card' },
      h('div', { class: 'bc-kicker' }, 'Batch list'),
      area,
      btn(
        'Add to the queue',
        () => {
          const t = area.value.trim();
          if (t) p.onAddList(t);
        },
        'bc-cta bc-cta-soft',
      ),
    ),
  );
  host.appendChild(root);
  return { dispose: () => root.remove() };
}
